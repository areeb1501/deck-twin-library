/**
 * PlantSpec → Plant compiler. Never throws on bad input: problems are reported as errors (the
 * item is skipped) or warnings (it is built, but may look wrong).
 *
 *  1. layout      equipment without `at` is placed in flow-order columns (P&ID import case)
 *  2. equipment   built from the component library; nozzles converted to plant coordinates
 *  3. plot        onshore pad sized to the equipment footprints
 *  4. lines       orthogonal auto-route between nozzles / plot edge (or a manual route)
 *  5. inline      valves and instruments placed by fraction of line length → (seg, t)
 */
import type { Equipment, Instrument, InstrumentType, Nozzle, PipeLine, Plant, Valve, Vec3 } from '../model/types'
import { elbowRadius, flange, GASKET, pipeOD, valveLength } from '../model/catalog'
import { footprints } from '../model/footprint'
import { instantiate } from './components'
import { classFor, type EndSpec, type EquipmentSpec, type PlantSpec } from './spec'

export interface CompileResult {
  plant: Plant
  errors: string[]
  warnings: string[]
}

const DEG = Math.PI / 180
const GAP = 4 // clear distance between auto-placed equipment (m)
const MARGIN = 5 // plot margin around the equipment (m)
const r3 = (v: number) => Math.round(v * 1000) / 1000
const v3 = (v: Vec3): Vec3 => [r3(v[0]), r3(v[1]), r3(v[2])]

export function compileSpec(spec: PlantSpec): CompileResult {
  const errors: string[] = []
  const warnings: string[] = []

  // ---------------------------------------------------------------- 1+2. equipment
  const seen = new Set<string>()
  const specs: EquipmentSpec[] = []
  for (const e of spec.equipment) {
    if (!e.tag) errors.push('Equipment without a tag skipped')
    else if (seen.has(e.tag)) errors.push(`${e.tag}: duplicate tag skipped`)
    else (seen.add(e.tag), specs.push(e))
  }
  const build = (e: EquipmentSpec, at: [number, number], report = true): Equipment | null => {
    try {
      return instantiate(e.type, { tag: e.tag, name: e.name, system: e.system, at, rotationY: (e.rotation ?? 0) * DEG, params: e.params, nozzles: e.nozzles, design: e.design })
    } catch (err) {
      if (report) errors.push(`${e.tag}: ${(err as Error).message}`)
      return null
    }
  }
  const positions = autoLayout(specs, spec, (e, at) => build(e, at, false))
  const equipment: Equipment[] = []
  for (const e of specs) {
    const eq = build(e, positions.get(e.tag) ?? [0, 0])
    if (eq) equipment.push(eq)
  }
  const eqByTag = new Map(equipment.map((e) => [e.tag, e]))

  // ---------------------------------------------------------------- 3. plot
  const fps = footprints(equipment, 0)
  let minX = Math.min(-10, ...fps.map((f) => f.x0)) - MARGIN
  let maxX = Math.max(10, ...fps.map((f) => f.x1)) + MARGIN
  let minZ = Math.min(-8, ...fps.map((f) => f.z0)) - MARGIN
  let maxZ = Math.max(8, ...fps.map((f) => f.z1)) + MARGIN
  ;[minX, minZ] = [Math.floor(minX), Math.floor(minZ)]
  ;[maxX, maxZ] = [Math.ceil(maxX), Math.ceil(maxZ)]

  // ---------------------------------------------------------------- 4. lines
  const lines: PipeLine[] = []
  const lineTags = new Set<string>()
  const nozzleOf = (end: EndSpec, lineTag: string): Nozzle | null | undefined => {
    if (!('equipment' in end)) return undefined
    const eq = eqByTag.get(end.equipment)
    if (!eq) return errors.push(`${lineTag}: unknown equipment ${end.equipment}`), null
    const n = eq.nozzles.find((x) => x.id === end.nozzle)
    if (!n) return errors.push(`${lineTag}: ${end.equipment} has no nozzle ${end.nozzle} (has ${eq.nozzles.map((x) => x.id).join(', ') || 'none'})`), null
    return n
  }
  const usedNozzles = new Map<string, string>()
  for (const l of spec.lines) {
    if (!l.tag) { errors.push('Line without a tag skipped'); continue }
    if (lineTags.has(l.tag)) { errors.push(`${l.tag}: duplicate line tag skipped`); continue }
    const na = nozzleOf(l.from, l.tag)
    const nb = nozzleOf(l.to, l.tag)
    if (na === null || nb === null) continue
    if (!na && !nb) { errors.push(`${l.tag}: at least one end must be an equipment nozzle`); continue }
    for (const [end, nz] of [[l.from, na], [l.to, nb]] as const) {
      if (!nz || !('equipment' in end)) continue
      const key = `${end.equipment}/${end.nozzle}`
      if (usedNozzles.has(key)) warnings.push(`${l.tag}: nozzle ${key} is already used by ${usedNozzles.get(key)}`)
      else usedNozzles.set(key, l.tag)
    }
    const nps = l.nps ?? na?.nps ?? nb!.nps
    if (na && na.nps !== nps) warnings.push(`${l.tag}: ${nps}" line on a ${na.nps}" nozzle (${'equipment' in l.from ? l.from.equipment : ''}/${na.id}): no reducer is drawn`)
    if (nb && nb.nps !== nps) warnings.push(`${l.tag}: ${nps}" line on a ${nb.nps}" nozzle (${'equipment' in l.to ? l.to.equipment : ''}/${nb.id}): no reducer is drawn`)
    let route: Vec3[]
    if (l.route && l.route.length >= 2) route = l.route
    else {
      const r = autoRouteLine(na, nb, l.from, l.to, nps, { minX, maxX, minZ, maxZ }, l.elevation, l.order ?? 'xz')
      route = r.route
      if (r.warning) warnings.push(`${l.tag}: ${r.warning}`)
    }
    const R = elbowRadius(nps)
    for (let i = 1; i < route.length - 2; i++) {
      const L = dist(route[i], route[i + 1])
      if (L < 2 * R - 1e-3) { warnings.push(`${l.tag}: ${L.toFixed(2)} m leg between elbows is shorter than 2×R (${(2 * R).toFixed(2)} m): tight elbows`); break }
    }
    const rating = Math.max(na?.rating ?? 0, nb?.rating ?? 0) || 300
    const sysFrom = 'equipment' in l.from ? eqByTag.get(l.from.equipment)?.system : undefined
    const sysTo = 'equipment' in l.to ? eqByTag.get(l.to.equipment)?.system : undefined
    lines.push({
      tag: l.tag,
      service: l.service,
      system: l.system ?? sysFrom ?? sysTo ?? 'production',
      nps,
      schedule: l.schedule ?? (nps >= 10 ? 'XS' : '80'),
      spec: l.spec ?? classFor(rating),
      insulation: l.insulation,
      route: route.map(v3),
      from: 'equipment' in l.from ? l.from : { offDeck: l.from.offPlant },
      to: 'equipment' in l.to ? l.to : { offDeck: l.to.offPlant },
      design: l.design ?? {},
    })
    lineTags.add(l.tag)
  }
  const lineBy = new Map(lines.map((l) => [l.tag, l]))
  for (const l of lines) for (const p of l.route) {
    minX = Math.min(minX, Math.floor(p[0] - 1)); maxX = Math.max(maxX, Math.ceil(p[0] + 1))
    minZ = Math.min(minZ, Math.floor(p[2] - 1)); maxZ = Math.max(maxZ, Math.ceil(p[2] + 1))
  }

  // ---------------------------------------------------------------- 5. valves & instruments
  const tags = new Set<string>([...seen, ...lineTags])
  const valves: Valve[] = []
  for (const v of spec.valves) {
    if (tags.has(v.tag)) { errors.push(`${v.tag}: duplicate tag skipped`); continue }
    const l = lineBy.get(v.line)
    if (!l) { errors.push(`${v.tag}: unknown line ${v.line}`); continue }
    const p = placeOnLine(l, v.at ?? 0.5, valveClear(v.type, l.nps, l.spec))
    if (p.warning) warnings.push(`${v.tag}: ${p.warning}`)
    valves.push({
      tag: v.tag, type: v.type, line: l.tag, seg: p.seg, t: r3(p.t),
      normally: v.normally ?? 'open', actuator: v.actuator, failAction: v.failAction, design: v.design ?? {},
    })
    tags.add(v.tag)
  }
  const instruments: Instrument[] = []
  for (const i of spec.instruments) {
    if (tags.has(i.tag)) { errors.push(`${i.tag}: duplicate tag skipped`); continue }
    const d = INSTRUMENT_DEFAULTS[i.type]
    if (!d) { errors.push(`${i.tag}: unknown instrument type "${i.type}" (use ${Object.keys(INSTRUMENT_DEFAULTS).join(', ')})`); continue }
    const base = { tag: i.tag, type: i.type, range: i.range ?? d.range, unit: i.unit ?? d.unit, nominal: i.nominal ?? d.nominal }
    if ('line' in i.on) {
      const l = lineBy.get(i.on.line)
      if (!l) { errors.push(`${i.tag}: unknown line ${i.on.line}`); continue }
      const p = placeOnLine(l, i.on.at ?? 0.3, elbowRadius(l.nps) + 0.15)
      instruments.push({ ...base, on: { line: l.tag, seg: p.seg, t: r3(p.t) } })
    } else {
      const eq = eqByTag.get(i.on.equipment)
      if (!eq) { errors.push(`${i.tag}: unknown equipment ${i.on.equipment}`); continue }
      const nz = i.on.nozzle
      if (!eq.nozzles.some((x) => x.id === nz)) { errors.push(`${i.tag}: ${eq.tag} has no nozzle ${nz}`); continue }
      if (usedNozzles.has(`${eq.tag}/${nz}`)) warnings.push(`${i.tag}: nozzle ${eq.tag}/${nz} also has line ${usedNozzles.get(`${eq.tag}/${nz}`)}`)
      instruments.push({ ...base, on: { equipment: eq.tag, nozzle: nz } })
    }
    tags.add(i.tag)
  }

  const plant: Plant = {
    name: spec.name || 'Untitled plant',
    deck: { name: `Plant builder · ${maxX - minX} × ${maxZ - minZ} m plot`, elevation: 0, extent: { minX, maxX, minZ, maxZ }, site: 'onshore' },
    equipment,
    lines,
    valves,
    instruments,
  }
  return { plant, errors, warnings }
}

export const INSTRUMENT_DEFAULTS: Record<InstrumentType, { range: string; unit: string; nominal: number }> = {
  PT: { range: '0–100', unit: 'barg', nominal: 40 },
  PI: { range: '0–100', unit: 'barg', nominal: 40 },
  PG: { range: '0–100', unit: 'barg', nominal: 40 },
  PDT: { range: '0–2', unit: 'bar', nominal: 0.4 },
  TT: { range: '0–150', unit: '°C', nominal: 60 },
  TG: { range: '0–150', unit: '°C', nominal: 60 },
  LT: { range: '0–100', unit: '%', nominal: 50 },
  LG: { range: '0–100', unit: '%', nominal: 50 },
  FT: { range: '0–200', unit: 'm³/h', nominal: 120 },
  AT: { range: '0–1000', unit: 'ppm', nominal: 120 },
  FD: { range: '0–100', unit: '% IR', nominal: 2 },
  GD: { range: '0–100', unit: '%LEL', nominal: 1.2 },
  OGD: { range: '0–5', unit: 'LEL·m', nominal: 0.15 },
  HD: { range: '0–120', unit: '°C', nominal: 27 },
  SD: { range: '0–10', unit: '%obs/m', nominal: 0.2 },
  MAC: { range: '4–20', unit: 'mA', nominal: 4 },
}

// ------------------------------------------------------------------ layout
/**
 * Places equipment that has no `at`: rank each item by its longest upstream path along the
 * lines (flow order), give each rank a column, and stack a column's items along Z.
 * Explicitly placed equipment is left alone; auto-placed columns start east of it.
 */
function autoLayout(specs: EquipmentSpec[], spec: PlantSpec, build: (e: EquipmentSpec, at: [number, number]) => Equipment | null) {
  const pos = new Map<string, [number, number]>()
  for (const e of specs) if (e.at) pos.set(e.tag, e.at)
  const todo = specs.filter((e) => !e.at)
  if (!todo.length) return pos

  const tagsSet = new Set(specs.map((e) => e.tag))
  const edges: [string, string][] = []
  for (const l of spec.lines) {
    if ('equipment' in l.from && 'equipment' in l.to && tagsSet.has(l.from.equipment) && tagsSet.has(l.to.equipment) && l.from.equipment !== l.to.equipment)
      edges.push([l.from.equipment, l.to.equipment])
  }
  const rank = new Map(specs.map((e) => [e.tag, 0]))
  for (let it = 0; it < specs.length; it++) {
    let changed = false
    for (const [u, v] of edges) {
      const r = Math.min(rank.get(u)! + 1, specs.length)
      if (r > rank.get(v)!) (rank.set(v, r), (changed = true))
    }
    if (!changed) break
  }
  const sizes = new Map<string, { w: number; d: number }>()
  for (const e of todo) {
    const eq = build(e, [0, 0])
    const f = eq ? footprints([eq], 0)[0] : { x0: -2, x1: 2, z0: -2, z1: 2 }
    sizes.set(e.tag, { w: f.x1 - f.x0, d: f.z1 - f.z0 })
  }
  const cols = new Map<number, EquipmentSpec[]>()
  for (const e of todo) {
    const r = rank.get(e.tag)!
    if (!cols.has(r)) cols.set(r, [])
    cols.get(r)!.push(e)
  }
  const placedFps = specs.filter((e) => e.at).map((e) => build(e, e.at!)).filter((x): x is Equipment => !!x)
  let x = placedFps.length ? Math.max(...footprints(placedFps, 0).map((f) => f.x1)) + GAP : 0
  for (const r of [...cols.keys()].sort((a, b) => a - b)) {
    const items = cols.get(r)!
    const w = Math.max(...items.map((e) => sizes.get(e.tag)!.w))
    const total = items.reduce((s, e) => s + sizes.get(e.tag)!.d, 0) + GAP * (items.length - 1)
    let z = -total / 2
    const cx = x + w / 2
    for (const e of items) {
      const d = sizes.get(e.tag)!.d
      pos.set(e.tag, [r3(cx), r3(z + d / 2)])
      z += d + GAP
    }
    x += w + GAP * 1.5
  }
  // centre a fully auto-laid-out plant on the origin
  if (!placedFps.length) {
    const shift = (x - GAP * 1.5) / 2
    for (const e of todo) {
      const p = pos.get(e.tag)!
      pos.set(e.tag, [r3(p[0] - shift), p[1]])
    }
  }
  return pos
}

// ------------------------------------------------------------------ routing
/**
 * Orthogonal route between two nozzles and/or fixed points, for hand-authored plants that want
 * the compiler's router. A point end is used as given (no lead).
 */
export function orthoRoute(a: Nozzle | Vec3, b: Nozzle | Vec3, nps: number, elevation?: number, order: 'xz' | 'zx' = 'xz'): Vec3[] {
  const na = Array.isArray(a) ? undefined : a
  const nb = Array.isArray(b) ? undefined : b
  const fa: EndSpec = { offPlant: '', at: Array.isArray(a) ? a : undefined }
  const fb: EndSpec = { offPlant: '', at: Array.isArray(b) ? b : undefined }
  return autoRouteLine(na, nb, fa, fb, nps, { minX: -1e4, maxX: 1e4, minZ: -1e4, maxZ: 1e4 }, elevation, order).route.map(v3)
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const same = (a: Vec3, b: Vec3) => dist(a, b) < 1e-6

interface End {
  pos: Vec3
  /** outward direction; [0,0,0] for a free end (off-plant point) */
  dir: Vec3
}

/**
 * Orthogonal route between two ends:
 *   nozzle → straight lead along its axis → (vertical nozzles: straight to the run level)
 *   → horizontal run at y1 to the corner → level change at the corner → run at y2 → lead → nozzle
 * Up-pointing nozzles are always approached from above and down-pointing ones from below, so a
 * leg never passes back through its own nozzle. Without an explicit elevation the run level is
 * chosen from the ends (low under bottom outlets, at nozzle height for side nozzles, above top
 * outlets) and raised if the route would double back on itself.
 */
function autoRouteLine(
  na: Nozzle | undefined,
  nb: Nozzle | undefined,
  fromSpec: EndSpec,
  toSpec: EndSpec,
  nps: number,
  plot: { minX: number; maxX: number; minZ: number; maxZ: number },
  elevation: number | undefined,
  order: 'xz' | 'zx',
): { route: Vec3[]; warning?: string } {
  const lead = Math.max(0.45, 2 * elbowRadius(nps) + 0.15)
  const floor = 0.35 + pipeOD(nps) / 2
  const ends: (End | null)[] = [na ? { pos: na.pos, dir: na.dir } : null, nb ? { pos: nb.pos, dir: nb.dir } : null]
  const kind = (e: End | null) => (!e ? 'free' : e.dir[1] > 0.5 ? 'up' : e.dir[1] < -0.5 ? 'down' : 'side')

  // default run elevation from the constrained ends
  const fixed = ends.filter((e): e is End => !!e)
  const downs = fixed.filter((e) => kind(e) === 'down').map((e) => e.pos[1] - lead)
  const sides = fixed.filter((e) => kind(e) === 'side').map((e) => e.pos[1])
  const ups = fixed.filter((e) => kind(e) === 'up').map((e) => e.pos[1] + lead)
  let via =
    elevation ??
    (downs.length ? Math.min(...downs, ...sides) : sides.length ? Math.max(...sides, ...ups) : Math.max(...ups) + 0.5)
  via = Math.max(via, floor)

  // free ends: the given point, or the nearest plot edge from the other end
  const freeEnd = (spec: EndSpec, other: End): End => {
    if ('offPlant' in spec && spec.at) return { pos: spec.at, dir: [0, 0, 0] }
    const p = add(other.pos, other.dir, kind(other) === 'side' ? lead : 0)
    const cands: [number, Vec3][] = [
      [p[0] - plot.minX, [plot.minX, via, p[2]]],
      [plot.maxX - p[0], [plot.maxX, via, p[2]]],
      [p[2] - plot.minZ, [p[0], via, plot.minZ]],
      [plot.maxZ - p[2], [p[0], via, plot.maxZ]],
    ]
    cands.sort((a, b) => a[0] - b[0])
    return { pos: cands[0][1], dir: [0, 0, 0] }
  }

  let warning: string | undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    const a = ends[0] ?? freeEnd(fromSpec, ends[1]!)
    const b = ends[1] ?? freeEnd(toSpec, ends[0]!)
    const level = (e: End) => {
      const k = kind(e)
      if (k === 'up') return Math.max(via, e.pos[1] + lead)
      if (k === 'down') return Math.max(floor, Math.min(via, e.pos[1] - lead))
      if (k === 'free') return e.pos[1]
      return via
    }
    const stub = (e: End): Vec3 => (kind(e) === 'side' ? add(e.pos, e.dir, lead) : e.pos)
    const a1 = stub(a), b1 = stub(b)
    const y1 = level(a), y2 = level(b)
    const c: [number, number] = order === 'xz' ? [b1[0], a1[2]] : [a1[0], b1[2]]
    const pts: Vec3[] = [a.pos, a1, [a1[0], y1, a1[2]], [c[0], y1, c[1]], [c[0], y2, c[1]], [b1[0], y2, b1[2]], b1, b.pos]
    const route = simplify(pts)
    if (!hasReversal(route)) return { route }
    if (elevation !== undefined) {
      warning = 'route doubles back on itself at the given elevation: try another elevation or run order'
      return { route, warning }
    }
    via += 1.2
  }
  const a = ends[0] ?? freeEnd(fromSpec, ends[1]!)
  const b = ends[1] ?? freeEnd(toSpec, ends[0]!)
  return { route: simplify([a.pos, b.pos]), warning: 'could not find a clean route: drawn straight' }
}

const add = (a: Vec3, d: Vec3, s: number): Vec3 => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s]

/** drop duplicate and collinear same-direction points */
function simplify(pts: Vec3[]): Vec3[] {
  const out: Vec3[] = []
  for (const p of pts) if (!out.length || !same(out[out.length - 1], p)) out.push(p)
  for (let i = out.length - 2; i > 0; i--) {
    const d1 = sub(out[i], out[i - 1]), d2 = sub(out[i + 1], out[i])
    const cr = Math.hypot(d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0])
    if (cr < 1e-9 && dotv(d1, d2) > 0) out.splice(i, 1)
  }
  return out
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dotv = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
function hasReversal(r: Vec3[]) {
  for (let i = 1; i < r.length - 1; i++) {
    const d1 = sub(r[i], r[i - 1]), d2 = sub(r[i + 1], r[i])
    if (dotv(d1, d2) < -1e-9) return true
  }
  return false
}

// ------------------------------------------------------------------ inline items
/**
 * Straight length a valve needs from the centre to each end of its segment — the same occupancy the
 * piping engine checks (body + gasket + mating weld-neck flange) plus the elbow tangent beyond it.
 */
export function valveClear(type: Parameters<typeof valveLength>[0], nps: number, spec: string) {
  const rating = spec.startsWith('E') ? 900 : spec.startsWith('D') ? 600 : 300
  return valveLength(type, nps) / 2 + GASKET + flange(nps, rating).length + elbowRadius(nps) + 0.12
}

/**
 * Fraction of total line length → (segment, t). Keeps `clear` metres from both ends of the chosen
 * segment (elbows / flanges); if the segment is too short, moves to the nearest one that fits.
 */
export function placeOnLine(l: PipeLine, at: number, clear: number): { seg: number; t: number; warning?: string } {
  const r = l.route
  const lens = r.slice(1).map((p, i) => dist(r[i], p))
  const total = lens.reduce((s, x) => s + x, 0)
  const want = Math.min(1, Math.max(0, at)) * total
  let acc = 0
  let seg = 0
  for (; seg < lens.length - 1 && acc + lens[seg] < want; seg++) acc += lens[seg]
  const fits = (i: number) => lens[i] >= 2 * clear
  let warning: string | undefined
  if (!fits(seg)) {
    let best = -1
    let bestD = Infinity
    let a2 = 0
    for (let i = 0; i < lens.length; i++) {
      const mid = a2 + lens[i] / 2
      if (fits(i) && Math.abs(mid - want) < bestD) (best = i), (bestD = Math.abs(mid - want))
      a2 += lens[i]
    }
    if (best < 0) {
      best = lens.indexOf(Math.max(...lens))
      warning = `no straight run on ${l.tag} is long enough (${(2 * clear).toFixed(2)} m): placed on the longest one`
      return { seg: best, t: 0.5, warning }
    }
    acc = lens.slice(0, best).reduce((s, x) => s + x, 0)
    seg = best
  }
  const L = lens[seg]
  const lo = Math.min(0.5, clear / L)
  const t = Math.min(1 - lo, Math.max(lo, (want - acc) / L))
  return { seg, t, warning }
}
