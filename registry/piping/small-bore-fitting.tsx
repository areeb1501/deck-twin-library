// Small-bore forged fittings: ASME B16.11 socket-weld / threaded elbows, tees, couplings, half couplings, caps and plugs, MSS SP-83 unions and MSS SP-95 swage nipples.
import * as THREE from 'three'
import { mat4, type Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { inch, pipeOD, pipeWall, type Schedule } from '../lib/standards'
import { add, filletWeld, hexRing, nptTpi, pipeStub, thread } from './_flanges'
import { cutCylinder, gridMesh, saddleTube, socket, threaded, type Klass } from './_flanges-b1611'

export type SmallBoreKind = 'elbow90' | 'elbow45' | 'tee' | 'coupling' | 'half-coupling' | 'union' | 'cap' | 'plug' | 'swage'
export type SmallBoreEnd = 'socket' | 'thread'

export interface SmallBoreFittingProps {
  kind?: SmallBoreKind
  /** socket-weld or NPT threaded ends (swage: socket = plain ends, thread = threaded both ends) */
  end?: SmallBoreEnd
  /** nominal size, inches (1/2–4) */
  nps?: number
  /** swage small end, inches */
  smallNps?: number
  pressureClass?: Klass
  /** pipe schedule for inserted stubs and swage walls */
  schedule?: Schedule
  /** pipe inserted at each open end, m (0 = bare fitting) */
  stub?: number
}

export const defaults = { kind: 'elbow90' as SmallBoreKind, end: 'socket' as SmallBoreEnd, nps: 1, smallNps: 0.5, pressureClass: 3000 as Klass, schedule: '80' as Schedule, stub: 0 }

const S45 = Math.SQRT1_2
const SWAGE_L: Record<number, number> = { 0.5: 2.5, 0.75: 3, 1: 3.5, 1.25: 4, 1.5: 4.5, 2: 6.5, 2.5: 7, 3: 8, 4: 9 }
// typical: MSS SP-83 Class 3000 union lengths and B16.11 threaded coupling W (inches)
const UNION_L: Record<number, number> = { 0.5: 1.9, 0.75: 2.05, 1: 2.35, 1.25: 2.65, 1.5: 2.9, 2: 3.4, 2.5: 4, 3: 4.4, 4: 5 }
const COUPLING_W: Record<number, number> = { 0.5: 1.88, 0.75: 2, 1: 2.38, 1.25: 2.62, 1.5: 3.12, 2: 3.38, 2.5: 3.62, 3: 4.25, 4: 4.75 }
const pick = (t: Record<number, number>, n: number) => {
  const keys = Object.keys(t).map(Number)
  return t[keys.reduce((b, k) => (Math.abs(k - n) < Math.abs(b - n) ? k : b), keys[0])]
}

/** End geometry data for one size, class and end type. */
function endData(end: SmallBoreEnd, nps: number, cls: Klass) {
  const sk = socket(nps, cls)
  const th = threaded(nps, cls)
  const pitch = 0.0254 / nptTpi(nps)
  const ro = pipeOD(nps) / 2
  if (end === 'socket') return { Ro: sk.bore / 2 + sk.wall, depth: sk.depth, rS: sk.bore / 2, rD: sk.d / 2, a90: sk.a90 + sk.depth, a45: sk.a45 + sk.depth, pitch }
  return { Ro: th.od / 2, depth: th.thread, rS: ro - pitch * 0.56, rD: Math.min(sk.d / 2, ro - pitch * 0.56 - th.thread / 32 - 0.001), a90: th.a90, a45: th.a45, pitch }
}

interface Leg {
  dir: V3
  /** centre to end face */
  L: number
}

function layout(p: SmallBoreFittingProps) {
  const o = { ...defaults, ...p }
  const nps = Math.min(Math.max(o.nps, 0.5), 4)
  const cls: Klass = o.pressureClass === 6000 ? 6000 : 3000
  const e = endData(o.end, nps, cls)
  const legs: Leg[] = []
  let extra = 0
  switch (o.kind) {
    case 'elbow90':
      legs.push({ dir: [-1, 0, 0], L: e.a90 }, { dir: [0, 1, 0], L: e.a90 })
      break
    case 'elbow45':
      legs.push({ dir: [-1, 0, 0], L: e.a45 }, { dir: [S45, S45, 0], L: e.a45 })
      break
    case 'tee':
      legs.push({ dir: [-1, 0, 0], L: e.a90 }, { dir: [1, 0, 0], L: e.a90 }, { dir: [0, 1, 0], L: e.a90 })
      break
    case 'coupling': {
      // B16.11: socket coupling laying length E between socket bottoms; threaded coupling overall W
      const E = nps <= 0.75 ? 0.0095 : nps <= 1.5 ? 0.013 : 0.019
      const half = o.end === 'socket' ? e.depth + E / 2 : inch(pick(COUPLING_W, nps)) / 2
      legs.push({ dir: [-1, 0, 0], L: half }, { dir: [1, 0, 0], L: half })
      break
    }
    case 'half-coupling':
      legs.push({ dir: [0, 1, 0], L: o.end === 'socket' ? e.depth + 0.008 : inch(pick(COUPLING_W, nps)) * 0.55 })
      break
    case 'union':
      legs.push({ dir: [-1, 0, 0], L: inch(pick(UNION_L, nps)) / 2 }, { dir: [1, 0, 0], L: inch(pick(UNION_L, nps)) / 2 })
      break
    case 'cap':
      legs.push({ dir: [-1, 0, 0], L: e.depth })
      extra = Math.max(0.006, e.Ro - e.rS) * 1.3 // typical end thickness
      break
    case 'plug':
      legs.push({ dir: [-1, 0, 0], L: 0 })
      break
    case 'swage': {
      const L = inch(pick(SWAGE_L, nps))
      legs.push({ dir: [-1, 0, 0], L: L / 2 }, { dir: [1, 0, 0], L: L / 2 })
      break
    }
  }
  return { ...o, nps, cls, e, legs, extra, small: Math.min(o.smallNps, nps) }
}

const portId = (kind: SmallBoreKind, i: number) => (kind === 'tee' && i === 2 ? 'branch' : i === 0 ? 'A' : 'B')

// Ports at each end face (or at the inserted pipe's weld end when stub > 0).
export function ports(p: SmallBoreFittingProps = {}): Port[] {
  const g = layout(p)
  const st = Math.max(0, g.stub)
  return g.legs.map((l, i) => {
    const n = g.kind === 'swage' && i === 1 ? g.small : g.nps
    const pos = add([0, 0, 0], l.dir, l.L + (g.kind === 'plug' || g.kind === 'swage' ? 0 : st))
    return port(portId(g.kind, i), g.kind === 'plug' ? 'Thread' : `End ${portId(g.kind, i)}`, pos, l.dir, n)
  })
}

export function SmallBoreFitting({ kind = defaults.kind, end = defaults.end, nps = defaults.nps, smallNps = defaults.smallNps, pressureClass = defaults.pressureClass, schedule = defaults.schedule, stub = defaults.stub, ...group }: SmallBoreFittingProps & GroupProps) {
  const data = useKit((k) => build(k, { kind, end, nps, smallNps, pressureClass, schedule, stub }), [kind, end, nps, smallNps, pressureClass, schedule, stub])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SmallBoreFitting

const M = 'flangeSteel'

/** One leg about its axis from the body centre to the end face: outer, end face, socket or female thread, then bore down to yb. */
function leg(k: Kit, l: Leg, end: SmallBoreEnd, e: ReturnType<typeof endData>, yb: number, Ro = e.Ro, n = 32) {
  const c = Math.min(0.0015, Ro * 0.05)
  const L = l.L
  k.lathe(M, [[Ro, 0], [Ro, L - c], [Ro - c, L], [e.rS + c, L]], [0, 0, 0], l.dir, n)
  if (end === 'socket') {
    k.lathe('machined', [[e.rS + c, L], [e.rS, L - c], [e.rS, L - e.depth], [e.rD, L - e.depth]], [0, 0, 0], l.dir, n)
    if (L - e.depth > yb) k.lathe('pipeBore', [[e.rD, L - e.depth], [e.rD, yb]], [0, 0, 0], l.dir, n)
  } else {
    const r1 = e.rS - e.depth / 32
    k.lathe('machined', [[e.rS + c, L], ...thread(e.rS, r1, L - c, L - e.depth, e.pitch, true), [e.rD, L - e.depth - 0.001]], [0, 0, 0], l.dir, n)
    if (L - e.depth - 0.001 > yb) k.lathe('pipeBore', [[e.rD, L - e.depth - 0.001], [e.rD, yb]], [0, 0, 0], l.dir, n)
  }
}

/** Bore passage bend between leg A (along -X) and a leg along `d`, through angle th, centreline radius Rb. */
function boreBend(k: Kit, rD: number, Rb: number, th: number) {
  const T = Rb * Math.tan(th / 2)
  const cb = new THREE.Vector3(-T, Rb, 0)
  const P: V3[][] = []
  const N: V3[][] = []
  const nT = 32
  for (let i = 0; i <= 10; i++) {
    const a = (th * i) / 10
    const n1 = new THREE.Vector3(Math.sin(a), -Math.cos(a), 0)
    const c = cb.clone().addScaledVector(n1, Rb)
    P.push([])
    N.push([])
    for (let j = 0; j <= nT; j++) {
      const f = (j / nT) * Math.PI * 2
      const r = n1.clone().multiplyScalar(Math.cos(f)).add(new THREE.Vector3(0, 0, Math.sin(f)))
      P[i].push(c.clone().addScaledVector(r, rD).toArray() as V3)
      N[i].push(r.negate().toArray() as V3)
    }
  }
  gridMesh(k, 'pipeBore', P, { N })
  return T
}

/** Pipe inserted into a socket (1.6 mm off the bottom, fillet weld) or made up into a female thread. */
function insert(k: Kit, l: Leg, end: SmallBoreEnd, e: ReturnType<typeof endData>, nps: number, schedule: Schedule, stub: number) {
  const mouth = add([0, 0, 0], l.dir, l.L)
  const engage = end === 'socket' ? e.depth - 0.0016 : e.depth - 2 * e.pitch
  pipeStub(k, add(mouth, l.dir, -engage), l.dir, engage + stub, nps, schedule, end === 'socket' ? 'square' : 'thread', 'bevel')
  if (end === 'socket') filletWeld(k, mouth, [-l.dir[0], -l.dir[1], -l.dir[2]], pipeOD(nps) / 2, 0, Math.max(0.003, Math.min(pipeWall(nps, schedule) * 1.25, 0.008)))
}

function build(k: Kit, p: SmallBoreFittingProps) {
  const g = layout(p)
  const { e, legs, end, nps, kind, schedule } = g
  const stub = Math.max(0, g.stub)
  if (kind === 'swage') return swage(k, g.nps, g.small, end, schedule, legs[1].L)
  if (kind === 'plug') return plug(k, nps, e)
  if (kind === 'elbow90' || kind === 'elbow45') {
    const th = kind === 'elbow90' ? Math.PI / 2 : Math.PI / 4
    const T = boreBend(k, e.rD, Math.max(e.rD * 1.1, 0.004), th)
    legs.forEach((l) => leg(k, l, end, e, T))
    // forged back corner: spherical lune between the two leg end planes
    k.add(M, new THREE.SphereGeometry(e.Ro, 32, 16, Math.PI / 2, th), mat4([0, 0, 0], 'z'))
  } else if (kind === 'tee') {
    const x1 = legs[0].L - e.depth - (end === 'thread' ? 0.001 : 0)
    leg(k, legs[0], end, e, x1)
    leg(k, legs[1], end, e, x1)
    cutCylinder(k, 'pipeBore', e.rD, -x1, x1, e.rD * 0.95, true)
    const rb = Math.min(e.rD, e.rD * 0.95)
    leg(k, legs[2], end, { ...e, rD: rb }, e.rD + 0.0005)
    saddleTube(k, 'pipeBore', rb, e.rD, e.rD + 0.0005, true)
  } else if (kind === 'cap') {
    leg(k, legs[0], end, e, 0)
    const yb = legs[0].L - e.depth
    k.lathe('machined', [[e.rD, yb], [0, yb]], [0, 0, 0], [-1, 0, 0], 32)
    const r = Math.min(g.extra * 0.6, e.Ro * 0.3)
    k.lathe(M, [[e.Ro, 0], [e.Ro, g.extra - r], [e.Ro - r * 0.3, g.extra - r * 0.3], [e.Ro - r, g.extra], [0, g.extra]], [0, 0, 0], [1, 0, 0], 32)
  } else if (kind === 'half-coupling') {
    leg(k, legs[0], end, e, 0)
    k.lathe(M, [[e.rD, 0], [e.Ro, 0]], [0, 0, 0], [0, 1, 0], 32)
  } else {
    legs.forEach((l) => leg(k, l, end, e, 0))
    if (kind === 'union') union(k, nps, e, legs[0].L)
  }
  if (stub > 0 && kind !== 'cap') legs.forEach((l) => insert(k, l, end, e, nps, schedule, stub))
  else if (stub > 0) insert(k, legs[0], end, e, nps, schedule, stub)
}

/** MSS SP-83 ground-joint union: tail piece collar, hex union nut, threaded head piece. */
function union(k: Kit, nps: number, e: ReturnType<typeof endData>, half: number) {
  const Rc = e.Ro * 1.12
  // tail collar under the nut, ground ball seat line at the joint
  k.lathe(M, [[e.Ro, -half * 0.42], [Rc, -half * 0.38], [Rc, 0.002], [e.Ro, 0.004]], [0, 0, 0], [1, 0, 0], 32)
  k.torus('machined', e.Ro * 0.98, 0.0006, [0.004, 0, 0], 'x', 4, 32)
  // head thread showing beyond the nut
  const pitch = 0.0254 / (nptTpi(nps) + 2)
  k.lathe('machined', thread(Rc * 1.02, Rc * 1.02, half * 0.18, half * 0.42, pitch, false), [0, 0, 0], [1, 0, 0], 32)
  k.lathe(M, [[Rc * 1.02, half * 0.42], [Rc * 1.02, half * 0.46], [e.Ro, half * 0.5]], [0, 0, 0], [1, 0, 0], 32)
  const af = Math.max(Rc * 2.3, e.Ro * 2 + 0.01)
  hexRing(k, af, e.Ro + 0.0005, [-half * 0.52, 0, 0], [1, 0, 0], half * 0.72)
}

/** B16.11 hex-head plug: male NPT shank from the shoulder (origin) along -X, hex head along +X. */
function plug(k: Kit, nps: number, e: ReturnType<typeof endData>) {
  const ro = pipeOD(nps) / 2
  const Lt = e.depth
  k.lathe('machined', [[ro * 0.92, 0], [ro, 0.001], ...thread(ro, ro - Lt / 32, 0.002, Lt - 0.0003, e.pitch, false), [ro - Lt / 32 - e.pitch * 0.4, Lt], [0, Lt]], [0, 0, 0], [-1, 0, 0], 32)
  // typical head: across flats and height scale with the pipe OD
  const af = ro * 1.5 + 0.006
  const hh = Math.max(0.008, ro * 0.6)
  hexRing(k, af, 0, [0, 0, 0], [1, 0, 0], hh)
  k.lathe(M, [[af * 0.5, hh], [af * 0.47, hh + 0.001], [0, hh + 0.001]], [0, 0, 0], 'x', 24)
}

/** MSS SP-95 concentric swage nipple: large end at -X, small end at +X; bevelled, plain or threaded ends. */
function swage(k: Kit, big: number, small: number, end: SmallBoreEnd, schedule: Schedule, half: number) {
  const R1 = pipeOD(big) / 2
  const R2 = pipeOD(small) / 2
  const r1 = R1 - pipeWall(big, schedule)
  const r2 = R2 - pipeWall(small, schedule)
  const L = half * 2
  const a = L * 0.3
  const b = L * 0.7
  const n = 32
  const base: V3 = [-half, 0, 0]
  const ends = (R: number, r: number, nn: number, y: number, top: boolean) => {
    const pitch = 0.0254 / nptTpi(nn)
    if (end === 'thread') {
      const Lt = Math.min(a * 0.9, inch((0.8 * (R * 2) / 0.0254 + 6.8) / nptTpi(nn)))
      if (top) k.lathe('machined', [...thread(R, R - Lt / 32, y - Lt, y - 0.0003, pitch, false), [R - Lt / 32 - pitch * 0.4, y], [r, y]], base, 'x', n)
      else k.lathe('machined', [[r, y], [R - Lt / 32 - pitch * 0.4, y], ...thread(R - Lt / 32, R, y + 0.0003, y + Lt, pitch, false)], base, 'x', n)
      return Lt
    }
    // socket-weld use: plain square ends
    if (top) k.lathe(M, [[R, y], [r, y]], base, 'x', n)
    else k.lathe(M, [[r, y], [R, y]], base, 'x', n)
    return 0
  }
  const t1 = ends(R1, r1, big, 0, false)
  const t2 = ends(R2, r2, small, L, true)
  k.lathe(M, [[R1, t1], [R1, a], [R2, b], [R2, L - t2]], base, 'x', n)
  k.lathe('pipeBore', [[r2, L], [r2, b], [r1, a], [r1, 0]], base, 'x', n)
}
