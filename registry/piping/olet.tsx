// Branch outlet fittings (MSS SP-97): Weldolet, Sockolet, Thredolet, Nipolet, Elbolet and Latrolet types contoured to the run, with the branch bore opened into the run bore.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { elbow90, inch, pipeOD, pipeWall, type Schedule } from '../lib/standards'
import { BEVEL_TAN, LAND, buttWeld, nptTpi, pipeStub, seg, thread } from './_flanges'
import { gridMesh, rayHit, socket, sockolet, weldolet, type Klass } from './_flanges-b1611'

export type OletKind = 'weldolet' | 'sockolet' | 'threadolet' | 'nipolet' | 'elbolet' | 'latrolet'
export type OletEnd = 'weld' | 'socket' | 'thread'

export interface OletProps {
  kind?: OletKind
  /** run pipe size, inches */
  runNps?: number
  /** branch size, inches */
  nps?: number
  runSchedule?: Schedule
  /** branch schedule (weld and nipple ends) */
  schedule?: Schedule
  /** socket / threaded outlet class */
  pressureClass?: Klass
  /** outlet end for elbolet and latrolet; nipolet uses plain or thread */
  end?: OletEnd
  /** nipolet nipple length beyond the body, m */
  nipple?: number
  /** run pipe length, m (0 = auto) */
  runLength?: number
}

export const defaults = {
  kind: 'weldolet' as OletKind,
  runNps: 8,
  nps: 2,
  runSchedule: 'STD' as Schedule,
  schedule: 'STD' as Schedule,
  pressureClass: 3000 as Klass,
  end: 'weld' as OletEnd,
  nipple: 0.09,
  runLength: 0,
}

const S45 = Math.SQRT1_2

/** Shared layout: run surface, branch axis frame, crown and outlet positions. Used by ports() and the geometry. */
function layout(p: OletProps) {
  const o = { ...defaults, ...p }
  const runNps = Math.max(0.5, o.runNps)
  const elb = o.kind === 'elbolet'
  const nps = Math.min(o.nps, elb ? runNps / 2 : runNps)
  const R = pipeOD(runNps) / 2
  const Ri = R - pipeWall(runNps, o.runSchedule)
  const end: OletEnd = o.kind === 'weldolet' ? 'weld' : o.kind === 'sockolet' ? 'socket' : o.kind === 'threadolet' ? 'thread' : o.kind === 'nipolet' ? (o.end === 'thread' ? 'thread' : 'weld') : o.end
  const cls = o.pressureClass === 6000 ? 6000 : 3000
  const [wA, wB, wC] = weldolet(nps)
  const [sA, sB, sD] = sockolet(nps, cls)
  const wEnd = end === 'weld' || o.kind === 'nipolet'
  // approx: elbolet / latrolet envelopes scaled from the weldolet / sockolet of the same outlet
  const scale = o.kind === 'elbolet' ? 1.15 : o.kind === 'latrolet' ? 1.35 : 1
  const A = (wEnd ? wA : sA) * scale
  const rB = Math.min((wEnd ? wB : sB) / 2, R * 0.94)
  const rh = Math.min((wEnd ? wC : sD) / 2, Ri * 0.9)
  let a = new THREE.Vector3(0, 1, 0)
  let e1 = new THREE.Vector3(1, 0, 0)
  const e2 = new THREE.Vector3(0, 0, 1)
  let sc = R
  const Rb = elbow90(runNps, 'LR')
  if (o.kind === 'latrolet') {
    a = new THREE.Vector3(S45, S45, 0)
    e1 = new THREE.Vector3(S45, -S45, 0)
    sc = R / S45
  } else if (elb) {
    e1 = new THREE.Vector3(-1, 0, 0)
    sc = Math.sqrt((Rb + R) ** 2 - Rb ** 2)
  }
  // top of the contoured band (highest base point): the body profile starts here
  const s0 = o.kind === 'latrolet' ? sc + rB : elb ? Math.sqrt((Rb + R) ** 2 - (Rb - rB) ** 2) : sc
  const nip = o.kind === 'nipolet' ? Math.max(0.02, o.nipple) : 0
  const sTop = s0 + A + nip
  const leg = Math.max(0.12, R * 2.2)
  const L = o.runLength > 0 ? o.runLength : Math.max(0.3, 2 * (Math.abs(sc * a.x) + rB / S45 + 2 * R) + 0.05)
  return { ...o, nps, runNps, R, Ri, end, cls: cls as Klass, A, rB, rh, a, e1, e2, sc, s0, sTop, Rb, elb, leg, L, nip }
}

// Run ends: 'run' and 'run-b' (weld bevels), outlet: 'branch'.
export function ports(p: OletProps = {}): Port[] {
  const g = layout(p)
  const top = g.a.clone().multiplyScalar(g.sTop).toArray() as V3
  const runPorts = g.elb
    ? [port('run', 'Run end A', [0, -g.leg, 0], [0, -1, 0], g.runNps), port('run-b', 'Run end B', [-g.Rb - g.leg, g.Rb, 0], [-1, 0, 0], g.runNps)]
    : [port('run', 'Run end A', [-g.L / 2, 0, 0], [-1, 0, 0], g.runNps), port('run-b', 'Run end B', [g.L / 2, 0, 0], [1, 0, 0], g.runNps)]
  return [...runPorts, port('branch', 'Branch outlet', top, g.a.toArray() as V3, g.nps)]
}

export function Olet({ kind = defaults.kind, runNps = defaults.runNps, nps = defaults.nps, runSchedule = defaults.runSchedule, schedule = defaults.schedule, pressureClass = defaults.pressureClass, end = defaults.end, nipple = defaults.nipple, runLength = defaults.runLength, ...group }: OletProps & GroupProps) {
  const data = useKit((k) => build(k, { kind, runNps, nps, runSchedule, schedule, pressureClass, end, nipple, runLength }), [kind, runNps, nps, runSchedule, schedule, pressureClass, end, nipple, runLength])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Olet

interface Run {
  S: (u: number, v: number, r: number) => THREE.Vector3
  C: (u: number) => THREE.Vector3
  f: (p: THREE.Vector3, r: number) => number
  inv: (p: THREE.Vector3) => [number, number]
}

const straightRun: Run = {
  S: (u, v, r) => new THREE.Vector3(u, r * Math.cos(v), r * Math.sin(v)),
  C: (u) => new THREE.Vector3(u, 0, 0),
  f: (p, r) => Math.hypot(p.y, p.z) - r,
  inv: (p) => [p.x, Math.atan2(p.z, p.y)],
}

function torusRun(Rb: number): Run {
  const O = new THREE.Vector3(-Rb, 0, 0)
  return {
    S: (u, v, r) => new THREE.Vector3(O.x + (Rb + r * Math.cos(v)) * Math.cos(u), O.y + (Rb + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)),
    C: (u) => new THREE.Vector3(O.x + Rb * Math.cos(u), O.y + Rb * Math.sin(u), 0),
    f: (p, r) => Math.hypot(Math.hypot(p.x - O.x, p.y - O.y) - Rb, p.z) - r,
    inv: (p) => [Math.atan2(p.y - O.y, p.x - O.x), Math.atan2(p.z, Math.hypot(p.x - O.x, p.y - O.y) - Rb)],
  }
}

const T = (v: THREE.Vector3) => v.toArray() as V3

/** Run surface grid over u0..u1, v0..v1 at radius r, normals radial (outward or inward). */
function runGrid(k: Kit, run: Run, r: number, u0: number, u1: number, v0: number, v1: number, nu: number, nv: number, inward: boolean) {
  const P: V3[][] = []
  const N: V3[][] = []
  for (let i = 0; i <= nu; i++) {
    const u = u0 + ((u1 - u0) * i) / nu
    const c = run.C(u)
    P.push([])
    N.push([])
    for (let j = 0; j <= nv; j++) {
      const p = run.S(u, v0 + ((v1 - v0) * j) / nv, r)
      P[i].push(T(p))
      N[i].push(T(p.clone().sub(c).normalize().multiplyScalar(inward ? -1 : 1)))
    }
  }
  gridMesh(k, inward ? 'pipeBore' : 'pipePaint', P, { N })
}

function build(k: Kit, p: OletProps) {
  const g = layout(p)
  const { R, Ri, a, e1, e2, rB, rh, sc, s0, A, sTop, nps } = g
  const run = g.elb ? torusRun(g.Rb) : straightRun
  const nT = 48
  const ts = Array.from({ length: nT + 1 }, (_, j) => (j / nT) * Math.PI * 2)
  const off = (r: number, t: number) => e1.clone().multiplyScalar(r * Math.cos(t)).addScaledVector(e2, r * Math.sin(t))
  const sMax = sTop + R * 4 + g.Rb
  const hit = (r: number, rr: number, t: number) => rayHit((q) => run.f(q, rr), off(r, t), a, 0, sMax)
  // hole outlines on the outer and inner skins, in run parameters
  const crown = run.inv(a.clone().multiplyScalar(sc))
  const uc = crown[0]
  const holes = [R, Ri].map((rr) => ts.map((t) => run.inv(off(rh, t).addScaledVector(a, hit(rh, rr, t)))))
  let du = 0
  let dv = 0
  for (const hl of holes) for (const [u, v] of hl) (du = Math.max(du, Math.abs(u - uc))), (dv = Math.max(dv, Math.abs(v)))
  du = du * 1.3 + (g.elb ? 0.02 : 0.006)
  if (g.elb) du = Math.min(du, uc - 0.02, Math.PI / 2 - uc - 0.02)
  // every piece shares one angular sampling so the joints have no cracks
  const nv = 64
  const step = (Math.PI * 2) / nv
  const kv = Math.min(Math.ceil((dv * 1.25 + 0.08) / step), nv / 2 - 4)
  dv = kv * step
  const nuS = 8
  const rect: [number, number][] = []
  for (let m = 0; m <= 2 * kv; m++) rect.push([uc + du, -dv + step * m])
  for (let i = 1; i <= nuS; i++) rect.push([uc + du - (2 * du * i) / nuS, dv])
  for (let m = 1; m <= 2 * kv; m++) rect.push([uc - du, dv - step * m])
  for (let i = 1; i <= nuS; i++) rect.push([uc - du + (2 * du * i) / nuS, -dv])
  ;[R, Ri].forEach((rr, h) => {
    const hole = rect.map(([u, v]) => run.inv(((t) => off(rh, t).addScaledVector(a, hit(rh, rr, t)))(Math.atan2(v / dv, (u - uc) / du))))
    const P: V3[][] = []
    const N: V3[][] = []
    const nr = 6
    for (let i = 0; i <= nr; i++) {
      P.push([])
      N.push([])
      rect.forEach(([qu, qv], j) => {
        const [hu, hv] = hole[j]
        const u = hu + (qu - hu) * (i / nr)
        const v = hv + (qv - hv) * (i / nr)
        const q = run.S(u, v, rr)
        P[i].push(T(q))
        N[i].push(T(q.clone().sub(run.C(u)).normalize().multiplyScalar(h ? -1 : 1)))
      })
    }
    gridMesh(k, h ? 'pipeBore' : 'pipePaint', P, { N })
    // the rest of the ring alongside the patch
    runGrid(k, run, rr, uc - du, uc + du, dv, Math.PI * 2 - dv, nuS, nv - 2 * kv, h === 1)
  })
  // run beyond the patch
  const sched = g.runSchedule
  if (g.elb) {
    for (const rr of [R, Ri]) {
      runGrid(k, run, rr, 0, uc - du, 0, Math.PI * 2, 10, nv, rr === Ri)
      runGrid(k, run, rr, uc + du, Math.PI / 2, 0, Math.PI * 2, 16, nv, rr === Ri)
    }
    pipeStub(k, [0, -g.leg, 0], [0, 1, 0], g.leg, g.runNps, sched, 'bevel', 'open')
    pipeStub(k, [-g.Rb, g.Rb, 0], [-1, 0, 0], g.leg, g.runNps, sched, 'open', 'bevel')
    buttWeld(k, [0, 0, 0], [0, 1, 0], R, R - Ri)
    buttWeld(k, [-g.Rb, g.Rb, 0], [1, 0, 0], R, R - Ri)
  } else {
    // lathed ends phased to the grid (lathe phi = v - 90°), with B16.25 bevels
    const bev = Math.max(0, R - Ri - LAND) * BEVEL_TAN
    const x0 = uc - du + g.L / 2
    const x1 = g.L / 2 - (uc + du)
    const ph = -Math.PI / 2
    k.lathe('pipePaint', [[R, bev], [R, x0]], [-g.L / 2, 0, 0], 'x', nv, ph)
    k.lathe('pipeBore', [[Ri, x0], [Ri, 0]], [-g.L / 2, 0, 0], 'x', nv, ph)
    k.lathe('machined', [[Ri, 0], [Ri + LAND, 0], [R, bev]], [-g.L / 2, 0, 0], 'x', nv, ph)
    k.lathe('pipePaint', [[R, 0], [R, x1 - bev]], [uc + du, 0, 0], 'x', nv, ph)
    k.lathe('pipeBore', [[Ri, x1], [Ri, 0]], [uc + du, 0, 0], 'x', nv, ph)
    k.lathe('machined', [[R, x1 - bev], [Ri + LAND, x1], [Ri, x1]], [uc + du, 0, 0], 'x', nv, ph)
  }
  // body: lower band contoured to the run surface, then lathed about the branch axis
  const sb = ts.map((t) => hit(rB, R, t))
  const sK = Math.max(...sb) + 0.001
  const radial = (t: number) => T(off(1, t))
  const band: V3[][] = []
  for (let i = 0; i <= 4; i++) band.push(ts.map((t, j) => T(off(rB, t).addScaledVector(a, sb[j] + ((sK - sb[j]) * i) / 4))))
  gridMesh(k, 'flangeSteel', band, { wrap: true, ref: (_q, _i, j) => radial(ts[j]) })
  const si = ts.map((t) => hit(rh, Ri, t))
  const sBot = Math.max(...si) + 0.001
  const bore: V3[][] = []
  for (let i = 0; i <= 3; i++) bore.push(ts.map((t, j) => T(off(rh, t).addScaledVector(a, si[j] + ((sBot - si[j]) * i) / 3))))
  gridMesh(k, 'pipeBore', bore, { wrap: true, ref: (_q, _i, j) => T(off(-1, ts[j])) })
  // fillet weld cap following the saddle
  const w = Math.min(Math.max(0.004, (rB - rh) * 0.45), 0.02)
  const pts = ts.slice(0, -1).map((t, j) => {
    const b = off(rB, t).addScaledVector(a, sb[j])
    const n = b.clone().sub(run.C(run.inv(b)[0])).normalize()
    return b.addScaledVector(off(1, t), w * 0.25).addScaledVector(n, w * 0.25)
  })
  k.add('flangeSteel', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), nT * 2, w * 0.55, 6, true))
  // outlet end
  const ax = T(a)
  const n = seg(rB * 2)
  const rO = pipeOD(nps) / 2
  const pitch = 0.0254 / nptTpi(nps)
  if (g.kind === 'nipolet') {
    // integral XS nipple: plain end for socket welding or male NPT
    const riN = rO - pipeWall(nps, 'XS')
    const sN = s0 + A
    k.lathe('flangeSteel', [[rB, sK], [rB, s0 + A * 0.3], [rO * 1.25, s0 + A * 0.85], [rO, sN]], [0, 0, 0], ax, n)
    k.lathe('pipeBore', [[riN, sTop], [riN, s0 + A * 0.5], [rh, sBot]], [0, 0, 0], ax, n)
    if (g.end === 'thread') {
      const L2 = Math.min(g.nip * 0.8, inch((0.8 * (rO * 2) / 0.0254 + 6.8) / nptTpi(nps)))
      k.lathe('flangeSteel', [[rO, sN], [rO, sTop - L2]], [0, 0, 0], ax, n)
      k.lathe('machined', [...thread(rO, rO - L2 / 32, sTop - L2, sTop - 0.0003, pitch, false), [riN, sTop]], [0, 0, 0], ax, n)
    } else k.lathe('flangeSteel', [[rO, sN], [rO, sTop - 0.001], [rO - 0.001, sTop], [riN, sTop]], [0, 0, 0], ax, n)
    return
  }
  if (g.end === 'weld') {
    const riB = rO - pipeWall(nps, g.schedule)
    const bev = Math.max(0, rO - riB - LAND) * BEVEL_TAN
    k.lathe('flangeSteel', [[rB, sK], [rB, s0 + A * 0.32], [rO + (rB - rO) * 0.12, s0 + A * 0.78], [rO, s0 + A * 0.86], [rO, sTop - bev]], [0, 0, 0], ax, n)
    k.lathe('machined', [[rO, sTop - bev], [riB + LAND, sTop], [riB, sTop]], [0, 0, 0], ax, n)
    k.lathe('pipeBore', [[riB, sTop], [riB, s0 + A * 0.55], [rh, sBot]], [0, 0, 0], ax, n)
    return
  }
  const sk = socket(nps, g.cls)
  const rS = sk.bore / 2
  const rT = Math.max(rS + sk.wall, rB * 0.8, rO + pitch * 2.5)
  const rD = Math.min(sk.d / 2, rS - 0.001)
  k.lathe('flangeSteel', [[rB, sK], [rB, s0 + A * 0.3], [rT, s0 + A * 0.62], [rT, sTop - 0.0015], [rT - 0.0015, sTop]], [0, 0, 0], ax, n)
  if (g.end === 'socket') {
    k.lathe('machined', [[rT - 0.0015, sTop], [rS + 0.0015, sTop], [rS, sTop - 0.0015], [rS, sTop - sk.depth], [rD, sTop - sk.depth]], [0, 0, 0], ax, n)
    k.lathe('pipeBore', [[rD, sTop - sk.depth], [rD, sTop - sk.depth - 0.003], [rh, sBot]], [0, 0, 0], ax, n)
  } else {
    // NPT female outlet, crest largest at the mouth, 1:16 taper
    const Lt = Math.min(A * 0.6, inch((0.8 * (rO * 2) / 0.0254 + 6.8) / nptTpi(nps)))
    const r0 = rO - pitch * 0.56
    const r1 = r0 - Lt / 32
    const ch = pitch
    k.lathe('machined', [[rT - 0.0015, sTop], [r0 + ch, sTop], ...thread(r0, r1, sTop - ch, sTop - Lt, pitch, true), [rD, sTop - Lt - 0.002]], [0, 0, 0], ax, n)
    k.lathe('pipeBore', [[rD, sTop - Lt - 0.002], [rh, sBot]], [0, 0, 0], ax, n)
  }
}
