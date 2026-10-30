/**
 * Reusable machinery sub-assemblies built into a Kit: pipe flanges / flanged joints, pipe runs,
 * TEFC electric motors, coupling guards, tag plates, handrails, grating walkways.
 */
import * as THREE from 'three'
import { elbowRadius, flange, pipeOD } from '../../../model/catalog'
import type { Rating } from '../../../model/types'
import { Kit, axisVec, mat4, perp, uvScale, type Axis, type MatKey, type V3 } from './kit'
import { fanGuardMaterial, gratingMaterial, meshGuardMaterial, tagMaterial } from './textures'

const rfH = (rating: Rating) => 0.0016 * (rating >= 600 ? 4 : 1) + 0.002

/** Weld-neck pipe flange whose raised face is at `face`, facing +axis (hub extends along -axis). */
export function pipeFlange(k: Kit, nps: number, rating: Rating, face: V3, axis: Axis, studs = false) {
  const f = flange(nps, rating)
  const ro = pipeOD(nps) / 2
  const hubR = Math.max(f.hubDia / 2, ro * 1.05)
  const h = rfH(rating)
  const L = f.length
  const seg = nps >= 6 ? 36 : 24
  const v = axisVec(axis)
  const base = new THREE.Vector3(...face).addScaledVector(v, -L)
  k.lathe('flangeSteel', [
    [ro * 0.999, 0],
    [hubR, L - h - f.thickness - 0.004],
    [hubR + 0.004, L - h - f.thickness],
    [f.od / 2, L - h - f.thickness],
    [f.od / 2, L - h],
    [f.raisedFaceDia / 2, L - h],
  ], base.toArray() as V3, v.toArray() as V3, seg)
  k.lathe('pipeCut', [
    [f.raisedFaceDia / 2, L - h],
    [f.raisedFaceDia / 2, L],
    [ro * 0.85, L],
  ], base.toArray() as V3, v.toArray() as V3, seg)
  if (studs) {
    const back = new THREE.Vector3(...face).addScaledVector(v, -h - f.thickness - f.boltDia)
    k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, back.toArray() as V3, axis, f.boltDia, f.thickness + f.boltDia * 2.4, [f.boltDia * 0.45])
  }
  return f
}

/** Two flanges face to face with a spiral-wound gasket and stud bolts, centred on `pos`. */
export function flangedJoint(k: Kit, nps: number, rating: Rating, pos: V3, axis: Axis) {
  const f = flange(nps, rating)
  const v = axisVec(axis)
  const g = 0.0045
  const p = new THREE.Vector3(...pos)
  pipeFlange(k, nps, rating, p.clone().addScaledVector(v, -g / 2).toArray() as V3, axis)
  pipeFlange(k, nps, rating, p.clone().addScaledVector(v, g / 2).toArray() as V3, (v.clone().negate().toArray() as V3))
  k.cyl('gasket', f.raisedFaceDia / 2 + 0.006, g, pos, v.toArray() as V3, 28)
  const h = rfH(rating)
  const span = 2 * (f.thickness + h) + g
  const studL = span + f.boltDia * 3
  const start = p.clone().addScaledVector(v, -studL / 2)
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, start.toArray() as V3, axis, f.boltDia, studL, [f.boltDia * 0.95, studL - f.boltDia * 0.95])
  return f
}

/** Straight pipe between two points. */
export function pipe(k: Kit, a: V3, b: V3, nps: number, mat: MatKey = 'pipePaint', seg = 20) {
  k.rod(mat, a, b, pipeOD(nps) / 2, seg)
}

/** Pipe run along an orthogonal polyline with long-radius bends. */
export function pipeRun(k: Kit, pts: V3[], nps: number, mat: MatKey = 'pipePaint', radial = 16) {
  k.tube(mat, pts, pipeOD(nps) / 2, radial, elbowRadius(nps))
}

/** Weld cap (2:1 ellipsoidal) at `pos` closing a pipe that points along +axis. */
export function weldCap(k: Kit, nps: number, pos: V3, axis: Axis, mat: MatKey = 'pipePaint') {
  const r = pipeOD(nps) / 2
  k.dome(mat, r, pos, axis, Math.PI / 2, 0.5, 24)
}

/** Stamped stainless tag plate facing +normal. */
export function tagPlate(k: Kit, tag: string, pos: V3, normal: Axis, w = 0.09) {
  const n = axisVec(normal)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  const h = w * 0.3125
  k.box('stainless', [w + 0.004, h + 0.004, 0.0015], pos, q)
  const face = new THREE.Vector3(...pos).addScaledVector(n, 0.0009)
  k.plane(tagMaterial(tag), w, h, face.toArray() as V3, q)
}

export interface MotorOpts {
  /** frame radius (without fins) */
  R: number
  /** frame length from DE shield to NDE shield (fan cowl extra) */
  L: number
  /** shaft centre height above the mounting surface (feet length) */
  H: number
  /** terminal box on top (+Y) or side (+Z) */
  tbox?: 'top' | 'side'
  mat?: MatKey
  fins?: number
  /** add cable leaving the terminal box downwards */
  cable?: boolean
}

/**
 * TEFC induction motor, shaft along +X: shaft end (coupling face) at x = 0, frame from x = -L to 0,
 * shaft axis at y = 0, feet down to y = -H. Axial cooling fins, fan cowl at -X.
 */
export function tefcMotor(k: Kit, o: MotorOpts) {
  const { R, L, H } = o
  const P: MatKey = o.mat ?? 'motorPaint'
  const finH = Math.max(0.012, R * 0.12)
  const nFin = o.fins ?? Math.max(24, Math.round(R * 110))
  const shieldL = Math.max(0.04, R * 0.22)
  const bodyL = L - 2 * shieldL
  const x0 = -L + shieldL // NDE end of frame body
  // finned frame: extruded toothed profile
  const sh = new THREE.Shape()
  const finW = Math.min(0.012, (Math.PI * 2 * R) / nFin * 0.28)
  const skip = (a: number) => Math.abs(a - -Math.PI / 2) < 0.62 // feet zone at bottom
  let first = true
  const pts: [number, number][] = []
  for (let i = 0; i < nFin; i++) {
    const a = (i / nFin) * Math.PI * 2
    const da = finW / 2 / R
    const step = (Math.PI * 2) / nFin
    // base arc up to fin
    for (let s = 0; s < 3; s++) {
      const aa = a - step / 2 + (s / 3) * (step / 2 - da)
      pts.push([Math.cos(aa) * R, Math.sin(aa) * R])
    }
    if (skip(a)) {
      pts.push([Math.cos(a) * R, Math.sin(a) * R])
      continue
    }
    pts.push([Math.cos(a - da) * R, Math.sin(a - da) * R])
    pts.push([Math.cos(a - da * 0.6) * (R + finH), Math.sin(a - da * 0.6) * (R + finH)])
    pts.push([Math.cos(a + da * 0.6) * (R + finH), Math.sin(a + da * 0.6) * (R + finH)])
    pts.push([Math.cos(a + da) * R, Math.sin(a + da) * R])
  }
  for (const [x, y] of pts) {
    if (first) sh.moveTo(x, y)
    else sh.lineTo(x, y)
    first = false
  }
  sh.closePath()
  // extrude along +Z, rotate so +Z -> +X (rotate about Y +90deg)
  const rotZX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  k.extrude(P, sh, bodyL, new THREE.Matrix4().compose(new THREE.Vector3(x0, 0, 0), rotZX, new THREE.Vector3(1, 1, 1)), 2)
  // end shields (DE at x = -shieldL..0, NDE at -L..-L+shieldL)
  k.lathe(P, [
    [R + finH * 0.6, 0],
    [R + finH * 0.6, shieldL * 0.25],
    [R * 0.92, shieldL * 0.6],
    [R * 0.4, shieldL * 0.85],
    [R * 0.3, shieldL],
    [R * 0.12, shieldL],
  ], [-shieldL, 0, 0], 'x', 40)
  k.cyl(P, R * 0.32, shieldL * 0.35, [-shieldL * 0.0 + shieldL * 0.05, 0, 0], 'x', 24) // bearing cap
  k.boltCircle('nut', 'nut', 6, R * 0.25, [0, 0, 0], 'x', Math.max(0.006, R * 0.025), 0.01, [0.005])
  k.boltCircle('nut', 'nut', 8, R + finH * 0.3, [-shieldL * 0.9, 0, 0], 'x', Math.max(0.008, R * 0.03), shieldL * 0.3, [shieldL * 0.25])
  k.lathe(P, [
    [R * 0.5, -L],
    [R + finH * 0.6, -L + shieldL * 0.6],
    [R + finH * 0.6, -L + shieldL],
  ], [0, 0, 0], 'x', 40)
  // fan cowl (sheet steel) + grille
  const cowlR = R + finH + 0.012
  const cowlL = Math.max(0.12, R * 0.6)
  const xc = -L - cowlL
  k.lathe(P, [
    [cowlR * 0.82, xc],
    [cowlR * 0.94, xc + cowlL * 0.08],
    [cowlR, xc + cowlL * 0.25],
    [cowlR, -L + shieldL * 0.5],
    [cowlR - 0.004, -L + shieldL * 0.5],
    [cowlR - 0.004, xc + cowlL * 0.25],
  ], [0, 0, 0], 'x', 48)
  k.disc('rubberBlack', cowlR * 0.8, [xc + 0.02, 0, 0], '-x', 32)
  k.disc(fanGuardMaterial(), cowlR * 0.82, [xc - 0.001, 0, 0], '-x', 32)
  // cowl ribs
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    k.box(P, [cowlL * 0.7, 0.006, 0.02], [xc + cowlL * 0.5, Math.sin(a) * (cowlR + 0.002), Math.cos(a) * (cowlR + 0.002)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -a))
  }
  // shaft + key
  const sr = Math.max(0.02, R * 0.13)
  k.cyl('stainless', sr, 0.12 + R * 0.2, [(0.12 + R * 0.2) / 2 - 0.02, 0, 0], 'x', 20)
  // feet (4) with hold-down bolts and shims
  const fw = Math.max(0.06, R * 0.35)
  for (const fx of [-L * 0.82, -L * 0.18])
    for (const s of [-1, 1]) {
      const z = s * (R * 0.78)
      k.box(P, [fw * 1.6, H - R * 0.5, fw * 0.25], [fx, -(H + R * 0.5) / 2, s * R * 0.62])
      k.box(P, [fw * 1.6, fw * 0.2, fw * 1.3], [fx, -H + fw * 0.1 + 0.006, z])
      k.box('stainless', [fw * 1.7, 0.006, fw * 1.4], [fx, -H + 0.003, z])
      for (const dx of [-fw * 0.45, fw * 0.45]) {
        k.hex('nut', fw * 0.32, fw * 0.16, [fx + dx, -H + fw * 0.28, z + s * fw * 0.2])
        k.cyl('boltXylan', fw * 0.08, fw * 0.25, [fx + dx, -H + fw * 0.35, z + s * fw * 0.2], 'y', 6)
      }
    }
  // terminal box
  const tb = Math.max(0.16, R * 0.75)
  const tbPos: V3 = o.tbox === 'side' ? [-L * 0.4, 0, R + finH + tb * 0.25] : [-L * 0.4, R + finH + tb * 0.28, 0]
  if (o.tbox === 'side') {
    k.box(P, [tb * 0.5, tb * 0.5, finH + 0.02], [-L * 0.4, 0, R + finH * 0.5])
    k.rbox(P, [tb * 1.1, tb * 0.9, tb * 0.5], tb * 0.06, tbPos)
    k.rbox(P, [tb * 1.0, tb * 0.8, tb * 0.08], tb * 0.03, [tbPos[0], 0, tbPos[2] + tb * 0.27])
    k.around(6, tb * 0.42, [tbPos[0], 0, tbPos[2] + tb * 0.31], 'z', (p) => k.hex('nut', 0.014, 0.008, p, 'z'), Math.PI / 6)
    for (const dx of [-tb * 0.25, tb * 0.25]) k.cyl('brass', tb * 0.08, tb * 0.12, [tbPos[0] + dx, -tb * 0.5, tbPos[2]], 'y', 10)
    if (o.cable) for (const dx of [-tb * 0.25, tb * 0.25]) k.spline('cable', [[tbPos[0] + dx, -tb * 0.56, tbPos[2]], [tbPos[0] + dx, -H * 0.6, tbPos[2] + 0.06], [tbPos[0] + dx * 1.5, -H + 0.04, tbPos[2] + 0.18]], tb * 0.06, 8, 20)
  } else {
    k.box(P, [tb * 0.5, finH + 0.02, tb * 0.5], [-L * 0.4, R + finH * 0.5, 0])
    k.rbox(P, [tb * 1.1, tb * 0.5, tb * 0.9], tb * 0.06, tbPos)
    k.rbox(P, [tb * 1.0, tb * 0.08, tb * 0.8], tb * 0.03, [tbPos[0], tbPos[1] + tb * 0.27, 0])
    k.around(6, tb * 0.42, [tbPos[0], tbPos[1] + tb * 0.31, 0], 'y', (p) => k.hex('nut', 0.014, 0.008, p), Math.PI / 6)
    for (const dx of [-tb * 0.25, tb * 0.25]) k.cyl('brass', tb * 0.08, tb * 0.12, [tbPos[0] + dx, tbPos[1], tb * 0.5], 'z', 10)
    if (o.cable)
      for (const dx of [-tb * 0.25, tb * 0.25])
        k.spline('cable', [[tbPos[0] + dx, tbPos[1], tb * 0.56], [tbPos[0] + dx, tbPos[1] - 0.02, R + finH + 0.12], [tbPos[0] + dx * 1.4, -H * 0.5, R + finH + 0.18], [tbPos[0] + dx * 1.6, -H + 0.03, R + finH + 0.3]], tb * 0.06, 8, 24)
  }
  // lifting eyes
  for (const lx of [-L * 0.15, -L * 0.75]) k.torus('nut', R * 0.09, R * 0.022, [lx, R + finH + R * 0.08, 0], 'z', 6, 16)
  // nameplate + earth boss
  k.box('nameplate', [R * 0.5, R * 0.3, 0.003], [-L * 0.65, R * 0.25, R + finH * 0.4], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.25))
  k.cyl('brass', 0.01, 0.03, [-L * 0.15, -R * 0.55, R * 0.86], 'z', 8)
}

/** Coupling + guard between x0 and x1 at shaft height y (guard down to y - base). */
export function couplingGuard(k: Kit, x0: number, x1: number, y: number, r: number, base: number, frame: MatKey = 'safetyYellow') {
  const len = x1 - x0
  const hub = Math.max(0.05, r * 0.45)
  // coupling hubs + spacer + disc packs
  k.cyl('flangeSteel', hub, len * 0.18, [x0 + len * 0.12, y, 0], 'x', 24)
  k.cyl('flangeSteel', hub, len * 0.18, [x1 - len * 0.12, y, 0], 'x', 24)
  k.cyl('stainless', hub * 0.45, len * 0.6, [(x0 + x1) / 2, y, 0], 'x', 16)
  for (const xx of [x0 + len * 0.23, x1 - len * 0.23]) {
    k.cyl('nut', hub * 1.1, len * 0.04, [xx, y, 0], 'x', 24)
    k.boltCircle('nut', 'nut', 6, hub * 0.8, [xx - len * 0.04, y, 0], 'x', hub * 0.12, len * 0.08, [len * 0.01, len * 0.07])
  }
  // guard: U-shaped tunnel (rounded top) of expanded mesh with solid end plates and rim
  const W = r
  const H = y - base + r
  const prof = new THREE.Shape()
  prof.moveTo(-W, 0)
  prof.lineTo(-W, H - W)
  prof.absarc(0, H - W, W, Math.PI, 0, true)
  prof.lineTo(W, 0)
  prof.lineTo(W - 0.004, 0)
  prof.absarc(0, H - W, W - 0.004, 0, Math.PI, false)
  prof.lineTo(-W + 0.004, 0)
  prof.closePath()
  // extrude along +Z then rotate so Z -> X; profile x -> -z
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  const meshGeo = new THREE.ExtrudeGeometry(prof, { depth: len - 0.04, bevelEnabled: false, curveSegments: 16 })
  // planar UVs from extrude: scale so the diamond pitch ~ 25 mm
  uvScale(meshGeo, 8, 8)
  k.add(meshGuardMaterial(), meshGeo, new THREE.Matrix4().compose(new THREE.Vector3(x0 + 0.02, base, 0), q, new THREE.Vector3(1, 1, 1)))
  // solid frame rims at each end + bottom flanges
  for (const xx of [x0 + 0.01, x1 - 0.03]) {
    const rim = new THREE.Shape()
    rim.moveTo(-W - 0.012, 0)
    rim.lineTo(-W - 0.012, H - W)
    rim.absarc(0, H - W, W + 0.012, Math.PI, 0, true)
    rim.lineTo(W + 0.012, 0)
    rim.lineTo(W - 0.02, 0)
    rim.absarc(0, H - W, W - 0.02, 0, Math.PI, false)
    rim.lineTo(-W + 0.02, 0)
    rim.closePath()
    k.extrude(frame, rim, 0.02, new THREE.Matrix4().compose(new THREE.Vector3(xx, base, 0), q, new THREE.Vector3(1, 1, 1)), 16)
  }
  for (const s of [-1, 1]) k.box(frame, [len, 0.006, 0.05], [(x0 + x1) / 2, base + 0.003, s * (W + 0.02)])
}

/** Two-rail handrail with posts and toe plate along a polyline (posts every ~1.5 m). */
export function handrail(k: Kit, pts: V3[], mat: MatKey = 'safetyYellow', h = 1.1) {
  const r = 0.021
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i])
    const b = new THREE.Vector3(...pts[i + 1])
    const L = a.distanceTo(b)
    const n = Math.max(1, Math.ceil(L / 1.5))
    for (let j = 0; j <= n; j++) {
      if (j === 0 && i > 0) continue
      const p = a.clone().lerp(b, j / n)
      k.rod(mat, [p.x, p.y, p.z], [p.x, p.y + h, p.z], r, 8)
    }
    for (const hh of [h, h * 0.5]) k.rod(mat, [a.x, a.y + hh, a.z], [b.x, b.y + hh, b.z], r, 8)
    // toe plate
    const d = b.clone().sub(a)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize())
    k.box(mat, [L, 0.1, 0.006], [mid.x, mid.y + 0.05, mid.z], q)
  }
}

/** Grating panel (alpha-tested texture) of size sx × sz at height y, with a bearing frame. */
export function gratingPanel(k: Kit, centre: V3, sx: number, sz: number, frame: MatKey = 'structSteel') {
  const g = new THREE.BoxGeometry(sx, 0.03, sz)
  uvScale(g, sx / 0.3, sz / 0.3)
  k.add(gratingMaterial(), g, mat4(centre))
  for (const s of [-1, 1]) {
    k.box(frame, [sx, 0.03, 0.006], [centre[0], centre[1], centre[2] + s * (sz / 2 - 0.003)])
    k.box(frame, [0.006, 0.03, sz], [centre[0] + s * (sx / 2 - 0.003), centre[1], centre[2]])
  }
}

/** Small bourdon gauge (dial facing +normal) on a stem at `pos`. */
export function smallGauge(k: Kit, pos: V3, normal: Axis, dial: MatKey, d = 0.1) {
  const n = axisVec(normal)
  const p = new THREE.Vector3(...pos)
  k.cyl('stainless', d / 2, d * 0.32, p.toArray() as V3, n.toArray() as V3, 24)
  k.torus('stainless', d / 2, d * 0.04, p.clone().addScaledVector(n, d * 0.16).toArray() as V3, n.toArray() as V3, 6, 24)
  // dial: CircleGeometry faces +Z; rotate +Z onto the normal so the dial's "up" stays vertical
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  k.add(dial, new THREE.CircleGeometry(d / 2 * 0.92, 28), mat4(p.clone().addScaledVector(n, d * 0.165).toArray() as V3, q))
  k.disc('glass', d / 2 * 0.95, p.clone().addScaledVector(n, d * 0.19).toArray() as V3, n.toArray() as V3, 28)
}

export { perp }

/**
 * Orthogonal small-bore route from `a` to a nozzle base `b` that arrives along `dir` (the nozzle's
 * outward direction), with duplicate points removed (safe for Kit.tube / pipeRun).
 */
export function routeToNozzle(a: V3, b: V3, dir: V3, lead = 0.08): V3[] {
  const pre: V3 = [b[0] - dir[0] * lead, b[1] - dir[1] * lead, b[2] - dir[2] * lead]
  const pts: V3[] = [a, [a[0], pre[1], a[2]], [a[0], pre[1], pre[2]], pre, [b[0] + dir[0] * 0.03, b[1] + dir[1] * 0.03, b[2] + dir[2] * 0.03]]
  const out: V3[] = []
  for (const p of pts) {
    const q = out[out.length - 1]
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-3) out.push(p)
  }
  return out
}
