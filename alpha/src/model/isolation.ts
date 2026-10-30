/**
 * Isolation / LOTO planner. Builds a connectivity graph from the plant data and searches outward
 * from the item to be isolated until every path is stopped by a valve that can provide
 * isolation. Everything reached on the way is the isolation envelope.
 *
 * Graph: nodes are equipment, valves, tee junctions and open (off-plant) ends; edges are the
 * pipe pieces between consecutive nodes along each line. Equipment is open inside (all of its
 * nozzles connect).
 *
 * Valve rules (typical site isolation standards — always confirm against the site procedure):
 *   gate / ball / butterfly / globe / needle   isolation point — close & lock
 *   ESDV / BDV / actuated ball                  isolation point — close, isolate actuator supply, lock
 *   check valve                                 NOT an isolation — passes through
 *   control valve                               NOT tight shut-off — passes through
 *   PSV                                         relief path — isolate with its block valves or remove & blind
 */
import type { Equipment, PipeLine, Plant, Valve, ValveType, Vec3 } from './types'

export type IsoMode = 'valve' | 'positive'

export interface IsoPoint {
  tag: string
  type: ValveType
  line: string
  nps: number
  rating: number
  action: string
  actuated: boolean
  /** normally-closed valve: verify rather than operate */
  verify: boolean
  /** drain / flare line: also the route used to drain or depressurise */
  bleedRoute: boolean
  /** a second isolation valve behind this one on the same line (double block) */
  second?: string
  note?: string
}

export interface Blind {
  equipment: string
  nozzle: string
  name: string
  nps: number
  rating: number
  line?: string
  pos: Vec3
}

export interface Piece {
  line: string
  d0: number
  d1: number
  /** polyline of this piece of pipe in plant coordinates */
  pts: Vec3[]
}

export interface IsolationPlan {
  target: string
  targetKind: 'equipment' | 'line'
  mode: IsoMode
  points: IsoPoint[]
  blinds: Blind[]
  /** valves inside the envelope that do not count as isolation */
  passed: { tag: string; type: ValveType; reason: string }[]
  /** open ends reached without an isolation valve — isolation is outside the model */
  openEnds: { line: string; label: string }[]
  /** other equipment that ends up inside the envelope (no valve between) */
  alsoIsolated: string[]
  envelope: { equipment: string[]; lines: string[]; pieces: Piece[] }
  drains: string[]
  vents: string[]
  /** pressure / level instruments to prove zero energy */
  proving: string[]
  warnings: string[]
}

const BLOCK: ValveType[] = ['gate', 'ball', 'butterfly', 'globe', 'needle']
const ACTUATED_ONOFF: ValveType[] = ['esdv', 'bdv']
const MANUAL_OPS = new Set(['handwheel', 'gear', 'lever', 'none', undefined])

const ratingOf = (l: PipeLine) => (l.spec.startsWith('E') ? 900 : l.spec.startsWith('D') ? 600 : l.spec.startsWith('C') ? 300 : 150)
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function cumLengths(route: Vec3[]) {
  const c = [0]
  for (let i = 1; i < route.length; i++) c.push(c[i - 1] + dist(route[i - 1], route[i]))
  return c
}

/** distance along a route of the closest point to p */
function project(route: Vec3[], cum: number[], p: Vec3) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1]
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2))
    const q: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]
    const d = dist(p, q)
    if (d < bestD) (bestD = d), (best = cum[i] + t * Math.sqrt(L2))
  }
  return best
}

/** polyline of a route between two distances */
function slice(route: Vec3[], cum: number[], d0: number, d1: number): Vec3[] {
  const at = (d: number): Vec3 => {
    let i = 0
    while (i < cum.length - 2 && cum[i + 1] < d) i++
    const L = cum[i + 1] - cum[i] || 1
    const t = Math.max(0, Math.min(1, (d - cum[i]) / L))
    const a = route[i], b = route[i + 1]
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  }
  const out: Vec3[] = [at(d0)]
  for (let i = 1; i < route.length - 1; i++) if (cum[i] > d0 && cum[i] < d1) out.push(route[i])
  out.push(at(d1))
  return out
}

interface Edge {
  piece: Piece
  a: string
  b: string
}

/** Connectivity graph of a plant (memoise per plant object). */
export function isolationGraph(plant: Plant) {
  const edges: Edge[] = []
  const adj = new Map<string, Edge[]>()
  const link = (e: Edge) => {
    edges.push(e)
    for (const n of [e.a, e.b]) (adj.get(n) ?? adj.set(n, []).get(n)!).push(e)
  }
  const psvOnLine = new Map(plant.valves.filter((v) => v.mount).map((v) => [v.line, v]))
  const lineBy = new Map(plant.lines.map((l) => [l.tag, l]))
  const cums = new Map(plant.lines.map((l) => [l.tag, cumLengths(l.route)]))

  const endNode = (l: PipeLine, which: 'from' | 'to') => {
    const e = l[which]
    if ('equipment' in e) return `eq:${e.equipment}`
    if ('line' in e) return `j:${l.tag}:${which}`
    const psv = psvOnLine.get(l.tag)
    if (psv && which === 'from') return `v:${psv.tag}`
    return `off:${l.tag}:${which}`
  }

  // stops along each line: ends, in-line valves, junctions where branches tee in
  const stops = new Map<string, { d: number; node: string }[]>()
  for (const l of plant.lines) {
    const cum = cums.get(l.tag)!
    const s = [
      { d: 0, node: endNode(l, 'from') },
      { d: cum[cum.length - 1], node: endNode(l, 'to') },
    ]
    stops.set(l.tag, s)
  }
  for (const v of plant.valves) {
    if (v.mount || v.seg < 0) continue
    const l = lineBy.get(v.line)
    if (!l) continue
    const cum = cums.get(l.tag)!
    const seg = Math.min(v.seg, l.route.length - 2)
    stops.get(l.tag)!.push({ d: cum[seg] + v.t * (cum[seg + 1] - cum[seg]), node: `v:${v.tag}` })
  }
  for (const b of plant.lines) {
    for (const which of ['from', 'to'] as const) {
      const e = b[which]
      if (!('line' in e)) continue
      const p = lineBy.get(e.line)
      if (!p) continue
      const pt = which === 'from' ? b.route[0] : b.route[b.route.length - 1]
      stops.get(p.tag)!.push({ d: project(p.route, cums.get(p.tag)!, pt), node: `j:${b.tag}:${which}` })
    }
  }
  for (const l of plant.lines) {
    const s = stops.get(l.tag)!.sort((x, y) => x.d - y.d)
    const cum = cums.get(l.tag)!
    for (let i = 0; i < s.length - 1; i++) {
      link({ a: s[i].node, b: s[i + 1].node, piece: { line: l.tag, d0: s[i].d, d1: s[i + 1].d, pts: slice(l.route, cum, s[i].d, s[i + 1].d) } })
    }
  }
  // PSVs sit directly on a nozzle
  for (const v of plant.valves) {
    if (!v.mount) continue
    const eq = plant.equipment.find((e) => e.tag === v.mount!.equipment)
    const n = eq?.nozzles.find((x) => x.id === v.mount!.nozzle)
    if (n) link({ a: `eq:${eq!.tag}`, b: `v:${v.tag}`, piece: { line: '', d0: 0, d1: 0, pts: [n.pos, n.pos] } })
  }
  return { adj, stops, lineBy }
}

type Graph = ReturnType<typeof isolationGraph>

function classify(v: Valve): { stop: boolean; actuated: boolean; reason?: string } {
  if (v.type === 'check') return { stop: false, actuated: false, reason: 'Check valve — not a positive isolation' }
  if (v.type === 'control') return { stop: false, actuated: false, reason: 'Control valve — not tight shut-off' }
  if (v.type === 'psv') return { stop: true, actuated: false }
  if (ACTUATED_ONOFF.includes(v.type)) return { stop: true, actuated: true }
  if (BLOCK.includes(v.type)) return { stop: true, actuated: !MANUAL_OPS.has(v.actuator) }
  return { stop: false, actuated: false, reason: 'Unknown valve type' }
}

export function planIsolation(plant: Plant, target: string, mode: IsoMode, graph: Graph = isolationGraph(plant)): IsolationPlan | null {
  const eq = plant.equipment.find((e) => e.tag === target)
  const line = plant.lines.find((l) => l.tag === target)
  if (!eq && !line) return null
  const { adj, stops, lineBy } = graph
  const valveBy = new Map(plant.valves.map((v) => [v.tag, v]))

  const plan: IsolationPlan = {
    target, targetKind: eq ? 'equipment' : 'line', mode,
    points: [], blinds: [], passed: [], openEnds: [], alsoIsolated: [],
    envelope: { equipment: [], lines: [], pieces: [] }, drains: [], vents: [], proving: [], warnings: [],
  }
  const seenNode = new Set<string>()
  const seenEdge = new Set<Edge>()
  const queue: string[] = []

  if (eq) queue.push(`eq:${eq.tag}`)
  else {
    // a line: isolate the section around its mid-length, bounded by the line's own valves
    const s = stops.get(line!.tag)!
    const mid = s[s.length - 1].d / 2
    const piece = [...new Set(s.flatMap((x) => adj.get(x.node) ?? []))].find((e) => e.piece.line === line!.tag && e.piece.d0 <= mid + 1e-6 && e.piece.d1 >= mid - 1e-6)
    if (!piece) return null
    seenEdge.add(piece)
    plan.envelope.pieces.push(piece.piece)
    plan.envelope.lines.push(line!.tag)
    queue.push(piece.a, piece.b)
  }

  const pointBy = new Map<string, IsoPoint>()
  while (queue.length) {
    const node = queue.shift()!
    if (seenNode.has(node)) continue
    seenNode.add(node)
    const [kind, ...rest] = node.split(':')
    const id = rest.join(':')

    if (kind === 'eq') {
      plan.envelope.equipment.push(id)
      if (id !== target) plan.alsoIsolated.push(id)
    } else if (kind === 'off') {
      const tag = id.replace(/:(from|to)$/, '')
      const l = lineBy.get(tag)
      const end = l ? (id.endsWith(':from') ? l.from : l.to) : null
      plan.openEnds.push({ line: tag, label: end && 'offDeck' in end ? end.offDeck : 'open end' })
      continue
    } else if (kind === 'v') {
      const v = valveBy.get(id)!
      const c = classify(v)
      if (c.stop) {
        // arrived here through a pipe piece: record the isolation point
        const via = (adj.get(node) ?? []).find((e) => seenEdge.has(e))
        const l = lineBy.get(v.mount ? v.line : v.line)
        const nps = v.mount ? (plant.equipment.find((e) => e.tag === v.mount!.equipment)?.nozzles.find((n) => n.id === v.mount!.nozzle)?.nps ?? 0) : (l?.nps ?? 0)
        const bleed = !!l && (l.service === 'drain' || l.service === 'flare')
        const p: IsoPoint = {
          tag: v.tag, type: v.type, line: v.line, nps, rating: l ? ratingOf(l) : 300,
          actuated: c.actuated, verify: v.normally === 'closed', bleedRoute: bleed && v.type !== 'psv',
          action: '',
        }
        if (v.type === 'psv') {
          p.action = 'Relief path — close the PSV inlet/outlet block valves (normally locked open) and lock, or remove the PSV and blind the nozzle'
          p.note = 'PSV block valves are not in the model'
        } else {
          p.action = `${p.verify ? 'Verify closed' : 'Close'}${c.actuated ? ', isolate actuator supply (air / power)' : ''} and lock`
          if (p.bleedRoute) p.note = 'Drain / depressurisation route — open under control to drain or vent the envelope, then close and lock'
          p.second = secondValve(graph, v, via, valveBy)
        }
        if (!pointBy.has(v.tag)) (pointBy.set(v.tag, p), plan.points.push(p))
        continue
      }
      plan.passed.push({ tag: v.tag, type: v.type, reason: c.reason! })
    }
    for (const e of adj.get(node) ?? []) {
      if (seenEdge.has(e)) continue
      seenEdge.add(e)
      if (e.piece.line) {
        plan.envelope.pieces.push(e.piece)
        if (!plan.envelope.lines.includes(e.piece.line)) plan.envelope.lines.push(e.piece.line)
      }
      queue.push(e.a === node ? e.b : e.a)
    }
  }

  // positive isolation (vessel entry): spade every connected nozzle of the target
  if (eq && mode === 'positive') {
    const psvBy = new Map(plant.valves.filter((v) => v.mount?.equipment === eq.tag).map((v) => [v.mount!.nozzle, v]))
    for (const n of eq.nozzles) {
      const l = plant.lines.find((x) => [x.from, x.to].some((end) => 'equipment' in end && end.equipment === eq.tag && end.nozzle === n.id))
      const psv = psvBy.get(n.id)
      if (!l && !psv) continue
      plan.blinds.push({ equipment: eq.tag, nozzle: n.id, name: n.name, nps: n.nps, rating: n.rating, line: l?.tag ?? psv?.tag, pos: n.pos })
    }
  }

  // drains, vents and zero-energy proving inside the envelope
  const inEnv = new Set(plan.envelope.equipment)
  for (const e of plant.equipment) {
    if (!inEnv.has(e.tag)) continue
    for (const n of e.nozzles) {
      const name = n.name.toLowerCase()
      if (name.includes('drain')) plan.drains.push(`${e.tag} ${n.id} (${n.name}, ${n.nps}")`)
      if (name.includes('vent')) plan.vents.push(`${e.tag} ${n.id} (${n.name}, ${n.nps}")`)
    }
  }
  for (const p of plan.points) if (p.bleedRoute) (lineBy.get(p.line)?.service === 'flare' ? plan.vents : plan.drains).push(`via ${p.tag} on ${p.line}`)
  const envLines = new Set(plan.envelope.lines)
  for (const i of plant.instruments) {
    if (!['PT', 'PI', 'PG', 'LT', 'LG'].includes(i.type)) continue
    const on = 'line' in i.on ? envLines.has(i.on.line) : inEnv.has(i.on.equipment)
    if (on) plan.proving.push(`${i.tag} (${i.type}, ${i.unit})`)
  }

  // warnings
  if (plan.openEnds.length) plan.warnings.push(`${plan.openEnds.length} path(s) leave the model without an isolation valve — isolate them outside this plant model`)
  if (plan.alsoIsolated.length) plan.warnings.push(`No valve between the target and ${plan.alsoIsolated.join(', ')} — they are isolated (and depressurised) too`)
  const single = plan.points.filter((p) => p.type !== 'psv' && !p.second && p.rating >= 600 && !p.verify)
  if (single.length) plan.warnings.push(`Single-valve isolation on Class 600+ at ${single.map((p) => p.tag).join(', ')} — consider double block & bleed or a spade`)
  if (!plan.drains.length && !plan.vents.length) plan.warnings.push('No drain or vent point inside the envelope in the model — confirm on the P&ID / use temporary drain points')
  if (plan.points.some((p) => p.type === 'psv')) plan.warnings.push('Relief valves inside the envelope: their block valves are not modelled')
  if (!plan.proving.length) plan.warnings.push('No pressure gauge or transmitter inside the envelope to prove zero pressure — use a temporary gauge')
  return plan
}

/** next stop behind an isolation valve on the same line — another isolation valve means double block */
function secondValve(graph: Graph, v: Valve, via: Edge | undefined, valveBy: Map<string, Valve>) {
  if (!via || !via.piece.line) return undefined
  const s = graph.stops.get(v.line)
  if (!s) return undefined
  const i = s.findIndex((x) => x.node === `v:${v.tag}`)
  // continue away from the side we came in on
  const cameFromLower = via.piece.d1 <= s[i].d + 1e-6
  const next = s[cameFromLower ? i + 1 : i - 1]
  if (!next?.node.startsWith('v:')) return undefined
  const w = valveBy.get(next.node.slice(2))
  return w && classify(w).stop && w.type !== 'psv' ? w.tag : undefined
}

export const isIsolatable = (plant: Plant, tag: string) =>
  plant.equipment.some((e: Equipment) => e.tag === tag && e.kind !== 'module') || plant.lines.some((l) => l.tag === tag)
