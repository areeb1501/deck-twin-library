// <Plant>: renders a plant.json. Places items, routes lines between ports with elbows, mating flanges, inline valves, colour bands and stanchions.
import { useEffect, useMemo, useRef, type ComponentType } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { blindFlange, flange, gasket, member, pipeRun, tagPlate } from '../lib/parts'
import { placePort, type Port } from '../lib/ports'
import { route, routeLength } from '../lib/route'
import { GASKET_SPIRAL_WOUND, SAFETY, SERVICE, flange as flangeDims, pipeOD, pipeWall, reducer as reducerLength, studLength, type Rating } from '../lib/standards'
import { paint } from '../lib/materials'
import { splitRef, type InlineItem, type Issue, type LineEnd, type PlantLine, type PlantSpec } from './spec'
import { parseLineTag } from './linetag'

export interface ComponentModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ComponentType<any>
  defaults?: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ports?: (p?: any) => Port[]
}
export type ComponentMap = Record<string, ComponentModule>

export interface PlantProps {
  spec: PlantSpec
  /** registry name → imported module, e.g. { 'gate-valve': await import('./valves/gate-valve') } */
  components: ComponentMap
  labels?: boolean
  onReport?: (issues: Issue[]) => void
}

const DEG = Math.PI / 180
const LEAD = 0.6

interface Placed {
  tag: string
  component: string
  Comp: ComponentModule['default']
  props: Record<string, unknown>
  position: V3
  rotation: number
  ports: Map<string, Port>
}

interface InlinePlaced {
  key: string
  Comp: ComponentModule['default']
  props: Record<string, unknown>
  position: V3
  euler: V3
  tag?: string
}

interface LineBuilt {
  line: PlantLine
  pieces: V3[][]
  joints: { face: V3; dir: V3; rating: Rating; wafer?: boolean; nps?: number; tieIn?: string }[]
  /** B16.9 concentric reducer before the to-end when the two ends differ in size */
  reduce?: { s0: number; s1: number; to: number }
  path: V3[]
  /** wafer bodies (butterfly, dual-plate check, knife gate) clamped by through-bolts between the two pipe flanges */
  through: { a: V3; b: V3; dir: V3; rating: Rating }[]
  nps: number
  rating: Rating
  grade: number
}

export function Plant({ spec, components, labels = false, onReport, ...group }: PlantProps & GroupProps) {
  const layout = useMemo(() => resolve(spec, components), [spec, components])
  const root = useRef<THREE.Group>(null)
  useEffect(() => {
    if (!onReport) return
    const issues = [...layout.issues]
    if (root.current) issues.push(...geometryChecks(root.current, layout.items))
    onReport(issues)
  }, [layout, onReport])
  return (
    <group {...group}>
      <group ref={root}>
        {layout.items.map((it) => (
          <group key={it.tag} name={it.tag} userData={{ tag: it.tag, component: it.component }} position={it.position} rotation-y={it.rotation * DEG}>
            <it.Comp {...it.props} />
            {labels && <Label tag={it.tag} />}
          </group>
        ))}
      </group>
      {layout.lines.map((l) => (
        <LineMesh key={l.line.tag} built={l} />
      ))}
      {layout.inline.map((v) => (
        <group key={v.key} position={v.position} rotation={v.euler}>
          <v.Comp {...v.props} />
        </group>
      ))}
      {spec.sea && <Sea level={spec.sea.level} depth={spec.sea.depth} items={layout.items} />}
    </group>
  )
}

/** Water surface at mean sea level (seen through to the jacket) and an optional seabed. userData.noFit keeps it out of camera fitting. */
function Sea({ level, depth, items }: { level: number; depth?: number; items: Placed[] }) {
  const xs = items.map((i) => i.position[0])
  const zs = items.map((i) => i.position[2])
  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
  const cz = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0
  const r = 4000
  return (
    <group position={[cx, 0, cz]} userData={{ noFit: true }}>
      <mesh rotation-x={-Math.PI / 2} position-y={level} renderOrder={2}>
        <circleGeometry args={[r, 96]} />
        <meshStandardMaterial color="#2c6b80" roughness={0.42} metalness={0} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      {depth !== undefined && (
        <mesh rotation-x={-Math.PI / 2} position-y={level - depth} receiveShadow>
          <circleGeometry args={[r, 64]} />
          <meshStandardMaterial color="#9c967f" roughness={1} />
        </mesh>
      )}
    </group>
  )
}

export default Plant

/** Resolve a spec into placed items, routed lines and inline items, with issues. Pure; no rendering. */
export function resolve(spec: PlantSpec, components: ComponentMap) {
  const issues: Issue[] = []
  const items: Placed[] = []
  const seen = new Set<string>()
  for (const s of spec.items) {
    if (seen.has(s.tag)) {
      issues.push({ level: 'error', where: s.tag, message: 'Duplicate tag. Every item needs a unique tag.' })
      continue
    }
    seen.add(s.tag)
    const mod = components[s.component]
    if (!mod) {
      issues.push({ level: 'error', where: s.tag, message: `Unknown component "${s.component}". Install it (npx deck-twin add ${s.component}) and pass it in components.` })
      continue
    }
    const props = { ...(mod.defaults ?? {}), ...(s.props ?? {}) }
    const position = s.position ?? [0, 0, 0]
    const rotation = s.rotation ?? 0
    const ports = new Map((mod.ports?.(props) ?? []).map((p) => [p.id, placePort(p, position, rotation)]))
    items.push({ tag: s.tag, component: s.component, Comp: mod.default, props: s.props ?? {}, position, rotation, ports })
  }
  const byTag = new Map(items.map((i) => [i.tag, i]))
  const used = new Set<string>()
  const lines: LineBuilt[] = []
  const inline: InlinePlaced[] = []

  for (const line of spec.lines ?? []) {
    const end = (ref: LineEnd) => {
      if (typeof ref !== 'string') return { bl: ref }
      const [tag, id] = splitRef(ref)
      const it = byTag.get(tag)
      if (!it) return void issues.push({ level: 'error', where: line.tag, message: `"${ref}": no item tagged ${tag}.` })
      const p = it.ports.get(id)
      if (!p) return void issues.push({ level: 'error', where: line.tag, message: `"${ref}": ${tag} (${it.component}) has no port "${id}". Ports: ${[...it.ports.keys()].join(', ') || 'none'}.` })
      used.add(`${tag}.${id}`)
      return { p, it }
    }
    const ra = end(line.from)
    const rb = end(line.to)
    if (!ra || !rb) continue
    if (!ra.p && !rb.p) {
      issues.push({ level: 'error', where: line.tag, message: 'Both ends are battery limits. At least one end must be an item port.' })
      continue
    }
    const tieIn = (r: typeof ra, other: Port) => {
      if (r.p) return r.p
      const bl = r.bl!
      const d = [other.position[0] - bl.at[0], 0, other.position[2] - bl.at[2]]
      const dir: V3 = bl.direction ?? (Math.abs(d[0]) >= Math.abs(d[2]) ? [Math.sign(d[0]) || 1, 0, 0] : [0, 0, Math.sign(d[2]) || 1])
      return { id: 'BL', label: bl.label ?? 'Battery limit', position: bl.at, direction: dir, nps: other.nps, rating: other.rating, kind: 'process' as const }
    }
    const a = { p: tieIn(ra, (rb.p ?? ra.p)!), it: ra.it }
    const b = { p: tieIn(rb, a.p), it: rb.it }
    const blEnds = [!ra.p, !rb.p]
    const refName = (r: LineEnd) => (typeof r === 'string' ? r : (r.label ?? 'battery limit'))
    const lt = parseLineTag(line.tag)
    const nps = line.nps ?? lt.nps ?? a.p.nps
    const resolved: PlantLine = { ...line, service: line.service ?? lt.service, insulated: line.insulated ?? (lt.insulation ? lt.insulation !== 'N' : undefined) }
    if (nps !== a.p.nps) issues.push({ level: 'warning', where: line.tag, message: `Line is ${nps}"${line.nps ? '' : ' (from its tag)'} but ${refName(line.from)} is ${a.p.nps}". Match the nozzle size or the line number.` })
    if (lt.code && !lt.service && !line.service) issues.push({ level: 'warning', where: line.tag, message: `Service code "${lt.code}" is not recognised. Set "service" on the line.` })
    const rating = (lt.rating ?? a.p.rating ?? b.p.rating ?? 300) as Rating
    if (lt.rating && a.p.rating && lt.rating < a.p.rating) issues.push({ level: 'warning', where: line.tag, message: `Piping class ${lt.pipingClass} is Class ${lt.rating}, below ${refName(line.from)} (Class ${a.p.rating}).` })
    const endNps = b.p.nps
    const trim = GASKET_SPIRAL_WOUND + flangeDims(nps, rating).hubLength + flangeDims(nps, rating).raisedFaceHeight
    const trimB = GASKET_SPIRAL_WOUND + flangeDims(endNps, rating).hubLength + flangeDims(endNps, rating).raisedFaceHeight
    const H = endNps !== nps ? reducerLength(Math.max(nps, endNps), Math.min(nps, endNps)) : 0
    const lead = Math.max(LEAD, trimB + H + 0.2)
    const path = line.via?.length
      ? [a.p.position, add(a.p.position, a.p.direction, LEAD), ...line.via, add(b.p.position, b.p.direction, LEAD), b.p.position]
      : route(a.p, b.p, { elevation: line.elevation ?? defaultElevation(a.p, b.p), order: line.order, lead })
    const total = routeLength(path)
    if (total < trim + trimB + H + 0.05) {
      issues.push({ level: 'error', where: line.tag, message: `Ends are too close (${total.toFixed(2)} m) for two flanges. Move the items apart.` })
      continue
    }
    const cuts: [number, number][] = [[0, trim]]
    const through: LineBuilt['through'] = []
    const joints: LineBuilt['joints'] = [
      { face: a.p.position, dir: a.p.direction, rating: (a.p.rating ?? rating) as Rating, tieIn: blEnds[0] ? (typeof line.from === 'string' ? '' : (line.from.label ?? 'BL')) : undefined },
      { face: b.p.position, dir: b.p.direction, rating: (b.p.rating ?? rating) as Rating, nps: endNps, tieIn: blEnds[1] ? (typeof line.to === 'string' ? '' : (line.to.label ?? 'BL')) : undefined },
    ]
    for (const [i, v] of (line.inline ?? []).entries()) {
      const placed = placeInline(v, path, nps, rating, trim, components, issues, line.tag)
      if (!placed) continue
      inline.push({ ...placed.item, key: `${line.tag}-${i}` })
      cuts.push([placed.s0 - trim, placed.s1 + trim])
      joints.push(...placed.joints)
      if (placed.wafer) through.push({ a: placed.joints[0].face, b: placed.joints[1].face, dir: placed.joints[1].dir, rating })
    }
    cuts.push([total - trimB - H, total])
    const reduce = H ? { s0: total - trimB - H, s1: total - trimB, to: endNps } : undefined
    cuts.sort((x, y) => x[0] - y[0])
    const pieces: V3[][] = []
    for (let i = 0; i < cuts.length - 1; i++) {
      const s0 = cuts[i][1]
      const s1 = cuts[i + 1][0]
      if (s1 - s0 > 0.01) pieces.push(slice(path, s0, s1))
    }
    lines.push({ line: resolved, pieces, joints, through, nps, rating, reduce, path, grade: Math.min(a.it?.position[1] ?? Infinity, b.it?.position[1] ?? Infinity) })
  }

  for (const it of items)
    for (const p of it.ports.values())
      if ((p.kind ?? 'process') === 'process' && !used.has(`${it.tag}.${p.id}`))
        issues.push({ level: 'warning', where: it.tag, message: `Process port "${p.id}" (${p.label}) is not connected.` })
  return { items, lines, inline, issues }
}

function defaultElevation(a: Port, b: Port) {
  const up = [a, b].filter((p) => p.direction[1] > 0.5)
  const down = [a, b].filter((p) => p.direction[1] < -0.5)
  const flat = [a, b].filter((p) => Math.abs(p.direction[1]) <= 0.5)
  if (up.length) return Math.max(...up.map((p) => p.position[1] + LEAD), ...flat.map((p) => p.position[1]))
  if (down.length) return Math.min(...down.map((p) => p.position[1] - LEAD), ...flat.map((p) => p.position[1]))
  return Math.max(a.position[1], b.position[1])
}

function placeInline(v: InlineItem, path: V3[], nps: number, rating: Rating, trim: number, components: ComponentMap, issues: Issue[], where: string) {
  const mod = components[v.component]
  if (!mod) return void issues.push({ level: 'error', where, message: `Inline component "${v.component}" is not in components.` })
  const props = { ...(mod.defaults ?? {}), nps, rating, ...(v.props ?? {}) }
  const ps = mod.ports?.(props) ?? []
  const A = ps.find((p) => p.id === 'A')
  const B = ps.find((p) => p.id === 'B')
  if (!A || !B) return void issues.push({ level: 'error', where, message: `"${v.component}" is not an inline component (needs ports A and B).` })
  const span = B.position[0] - A.position[0]
  const total = routeLength(path)
  let s = (v.at ?? 0.5) * total
  let acc = 0
  for (let i = 1; i < path.length; i++) {
    const L = dist(path[i - 1], path[i])
    if (s <= acc + L || i === path.length - 1) {
      const need = span / 2 + trim * 1.5
      if (L < 2 * need) {
        issues.push({ level: 'warning', where, message: `No straight run long enough for ${v.tag ?? v.component} near at=${v.at ?? 0.5} (needs ${(2 * need).toFixed(2)} m). Move it or lengthen the line.` })
        return
      }
      s = Math.min(Math.max(s, acc + need), acc + L - need)
      const d = norm(sub(path[i], path[i - 1]))
      const centre = add(path[i - 1], d, s - acc + (-(A.position[0] + B.position[0]) / 2))
      const euler: V3 = Math.abs(d[1]) > 0.9 ? [0, 0, d[1] > 0 ? Math.PI / 2 : -Math.PI / 2] : [0, Math.atan2(-d[2], d[0]), 0]
      const faceA = add(path[i - 1], d, s - acc - span / 2)
      const faceB = add(path[i - 1], d, s - acc + span / 2)
      const wafer = span < flangeDims(nps, rating).od * 0.45
      return {
        wafer,
        item: { Comp: mod.default, props: { ...(v.props ?? {}), nps, rating }, position: centre, euler, tag: v.tag },
        s0: s - span / 2,
        s1: s + span / 2,
        joints: [
          { face: faceA, dir: scale(d, -1), rating, wafer },
          { face: faceB, dir: d, rating, wafer },
        ],
      }
    }
    acc += L
  }
}

function LineMesh({ built }: { built: LineBuilt }) {
  const data = useKit((k) => drawLine(k, built), [built])
  return <KitMesh data={data} />
}

function drawLine(k: Kit, b: LineBuilt) {
  const { line, nps } = b
  const svc = line.service ? SERVICE[line.service] : undefined
  const body: MatKey = line.service === 'firewater' ? 'firewaterRed' : line.insulated ? 'insulation' : 'pipePaint'
  const od = pipeOD(nps) + (line.insulated ? 0.1 : 0)
  for (const piece of b.pieces) {
    if (line.insulated) k.tube(body, piece, od / 2, 24, Math.max(0.2, od))
    else pipeRun(k, piece, nps, { mat: body, schedule: line.schedule })
    if (svc && line.service !== 'firewater') bands(k, piece, od, paint(svc.band))
  }
  for (const j of b.joints) {
    if (j.tieIn !== undefined) tieInEnd(k, j.face, j.dir, j.nps ?? nps, j.rating, j.tieIn)
    else mate(k, j.face, j.dir, j.nps ?? nps, j.rating, !j.wafer)
  }
  if (b.reduce) {
    const { p, d } = pointOn(b.path, b.reduce.s0)
    const L = b.reduce.s1 - b.reduce.s0
    const r0 = pipeOD(nps) / 2
    const r1 = pipeOD(b.reduce.to) / 2
    const i0 = r0 - pipeWall(nps)
    const i1 = r1 - pipeWall(b.reduce.to)
    const seg = r0 > 0.25 || r1 > 0.25 ? 48 : 32
    k.lathe(body, [[i0, 0], [r0, 0], [r0, L * 0.12], [r1, L * 0.88], [r1, L], [i1, L]], p, d, seg)
    k.lathe('pipeBore', [[i1, L], [i1, L * 0.88], [i0, L * 0.12], [i0, 0]], p, d, seg)
  }
  for (const t of b.through) {
    const f = flangeDims(nps, t.rating)
    const back = GASKET_SPIRAL_WOUND + f.raisedFaceHeight + f.thickness
    const L = dist(t.a, t.b) + 2 * back + 2.4 * f.boltDia
    const mid = scale(add(t.a, t.b), 0.5)
    k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, add(mid, t.dir, -L / 2), t.dir, f.boltDia, L, [f.boltDia * 0.6, L - f.boltDia * 0.6])
  }
  if (line.supports !== false) for (const piece of b.pieces) supports(k, piece, od, b.grade, nps)
}

/** Gasket, pipe-side weld-neck flange and stud bolts against a flange face that points along dir. */
function mate(k: Kit, face: V3, dir: V3, nps: number, rating: Rating, studs = true) {
  const f = flangeDims(nps, rating)
  const g = GASKET_SPIRAL_WOUND
  gasket(k, nps, rating, add(face, dir, g / 2), dir, g)
  flange(k, nps, rating, add(face, dir, g), scale(dir, -1))
  if (!studs) return
  const studL = studLength(nps, rating)
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, add(face, dir, g / 2 - studL / 2), dir, f.boltDia, studL, [f.boltDia * 0.6, studL - f.boltDia * 0.6])
}

/** Battery-limit tie-in: pipe flange, gasket and blind with studs, a yellow band and a tie-in plate. */
function tieInEnd(k: Kit, face: V3, dir: V3, nps: number, rating: Rating, label: string) {
  const back = scale(dir, -1)
  flange(k, nps, rating, add(face, dir, GASKET_SPIRAL_WOUND), back)
  blindFlange(k, nps, rating, add(face, dir, GASKET_SPIRAL_WOUND), back)
  const od = pipeOD(nps)
  const f = flangeDims(nps, rating)
  const band = add(face, dir, f.hubLength + f.raisedFaceHeight + 0.25)
  k.cyl(paint(SAFETY.yellow), od / 2 + 0.002, 0.12, band, dir, 32)
  const up: V3 = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  tagPlate(k, label ? `TIE-IN ${label}` : 'TIE-IN', add(band, up, od / 2 + 0.09), up, Math.max(0.18, od * 0.9))
}

/** ISO 14726 identification bands near each end of a piece and every 6 m. */
function bands(k: Kit, pts: V3[], od: number, mat: MatKey) {
  const total = routeLength(pts)
  const at = [0.35, total - 0.35]
  for (let s = 6; s < total - 1; s += 6) at.push(s)
  for (const s of at) {
    if (s < 0.1 || s > total - 0.1) continue
    const { p, d } = pointOn(pts, s)
    k.cyl(mat, od / 2 + 0.0015, Math.min(0.15, od * 0.8 + 0.04), p, d, 28)
  }
}

/** Stanchion supports (pipe shoe on a section post) under horizontal runs higher than 0.4 m above grade. */
function supports(k: Kit, pts: V3[], od: number, grade: number, nps: number) {
  const span = nps <= 2 ? 3 : nps <= 4 ? 4.3 : nps <= 6 ? 5.2 : nps <= 8 ? 5.8 : nps <= 12 ? 6.7 : 8
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (Math.abs(a[1] - b[1]) > 1e-3) continue
    const L = dist(a, b)
    const h = a[1] - od / 2 - grade
    if (h < 0.4 || L < 2) continue
    const n = Math.max(1, Math.floor((L - 1) / span))
    const d = norm(sub(b, a))
    for (let j = 0; j < n; j++) {
      const s = L / (n + 1) * (j + 1)
      const p = add(a, d, s)
      const top = p[1] - od / 2 - 0.1
      k.box('structSteel', [0.25, 0.1, Math.max(0.2, od)], [p[0], top + 0.05, p[2]], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-d[2], d[0])))
      member(k, [p[0], grade, p[2]], [p[0], top, p[2]], 'HEB 100', 'structSteel', [d[0], 0, d[2]])
      k.box('structSteel', [0.25, 0.015, 0.25], [p[0], grade + 0.0075, p[2]])
    }
  }
}

function Label({ tag }: { tag: string }) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    const g = ref.current
    const parent = g?.parent
    if (!g || !parent) return
    parent.updateWorldMatrix(true, true)
    const box = new THREE.Box3()
    for (const c of parent.children) if (c !== g) box.expandByObject(c)
    if (!box.isEmpty()) g.position.set(0, box.max.y - parent.getWorldPosition(new THREE.Vector3()).y + 0.4, 0)
  }, [])
  return (
    <group ref={ref}>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ font: '600 11px/1.2 ui-monospace, monospace', background: 'rgba(10,10,10,.82)', color: '#fff', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{tag}</div>
      </Html>
    </group>
  )
}

/** Overlaps between items and items standing on nothing. */
function geometryChecks(root: THREE.Group, items: Placed[]): Issue[] {
  const out: Issue[] = []
  root.updateWorldMatrix(true, true)
  const boxes = new Map<string, THREE.Box3>()
  for (const c of root.children) boxes.set(c.name, new THREE.Box3().setFromObject(c))
  const list = items.filter((i) => boxes.has(i.tag) && !boxes.get(i.tag)!.isEmpty())
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const A = shrink(boxes.get(list[i].tag)!)
      const B = shrink(boxes.get(list[j].tag)!)
      if (!A.intersectsBox(B)) continue
      const I = A.clone().intersect(B)
      const v = (b: THREE.Box3) => { const s = b.getSize(new THREE.Vector3()); return s.x * s.y * s.z }
      const standsOn = (a: Placed, b: Placed) => {
        const bb = boxes.get(b.tag)!
        return a.position[1] >= b.position[1] - 0.05 && a.position[1] <= bb.max.y && a.position[0] >= bb.min.x && a.position[0] <= bb.max.x && a.position[2] >= bb.min.z && a.position[2] <= bb.max.z && a !== b && (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z) > 4 * footprint(boxes.get(a.tag)!) * 0.25
      }
      if (standsOn(list[i], list[j]) || standsOn(list[j], list[i])) continue
      if (v(I) > 0.12 * Math.min(v(A), v(B)) && !contains(boxes.get(list[i].tag)!, boxes.get(list[j].tag)!))
        out.push({ level: 'warning', where: `${list[i].tag} / ${list[j].tag}`, message: 'Items overlap. Move one of them or check the rotation.' })
    }
  for (const it of list) {
    const y = it.position[1]
    const own = boxes.get(it.tag)!
    const sz = own.getSize(new THREE.Vector3())
    // grounded, or a small fitting carried by its piping
    if (y < 0.05 || own.min.y < 0.05 || Math.max(sz.x, sz.y, sz.z) < 1.2) continue
    const under = list.some((o) => {
      if (o === it) return false
      const b = boxes.get(o.tag)!
      return b.max.y >= y - 0.25 && b.min.y < y - 0.01 && b.min.x <= it.position[0] && b.max.x >= it.position[0] && b.min.z <= it.position[2] && b.max.z >= it.position[2]
    })
    if (!under) out.push({ level: 'warning', where: it.tag, message: `Stands at y = ${y} m with nothing under it. Place it on a deck or structure item, or set y = 0.` })
  }
  return out
}

const shrink = (b: THREE.Box3) => {
  const c = b.getCenter(new THREE.Vector3())
  const s = b.getSize(new THREE.Vector3()).multiplyScalar(0.42)
  return new THREE.Box3(c.clone().sub(s), c.clone().add(s))
}
const contains = (a: THREE.Box3, b: THREE.Box3) => a.containsBox(b) || b.containsBox(a)
const footprint = (b: THREE.Box3) => (b.max.x - b.min.x) * (b.max.z - b.min.z)

const add = (a: V3, d: V3, s = 1): V3 => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

function pointOn(pts: V3[], s: number): { p: V3; d: V3 } {
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const L = dist(pts[i - 1], pts[i])
    if (s <= acc + L || i === pts.length - 1) {
      const d = norm(sub(pts[i], pts[i - 1]))
      return { p: add(pts[i - 1], d, Math.min(s - acc, L)), d }
    }
    acc += L
  }
  return { p: pts[0], d: [1, 0, 0] }
}

/** Sub-polyline between distances s0 and s1 along pts. */
function slice(pts: V3[], s0: number, s1: number): V3[] {
  const out: V3[] = [pointOn(pts, s0).p]
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i])
    if (acc > s0 + 1e-6 && acc < s1 - 1e-6) out.push(pts[i])
  }
  out.push(pointOn(pts, s1).p)
  return out
}
