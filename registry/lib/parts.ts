// Reusable sub-assemblies built into a Kit: flanges, nozzles, pipe runs, motors, guards, access steel, skids, members.
import * as THREE from 'three'
import { Kit, axisVec, mat4, perp, uvScale, type Axis, type MatKey, type V3 } from './kit'
import { dialMaterial, fanGuardMaterial, gratingMaterial, meshGuardMaterial, tagMaterial, checkerPlateMaterial } from './textures'
import { ACCESS, GASKET_SPIRAL_WOUND, SECTIONS, elbow90, flange as flangeDims, iecMotor, pipeOD, pipeWall, type Rating, type Schedule } from './standards'

const v3 = (v: THREE.Vector3) => v.toArray() as V3
/** Radial segments that keep a circle of diameter d smooth on screen. */
export const segments = (d: number) => (d > 0.5 ? 64 : d > 0.25 ? 48 : d > 0.1 ? 36 : 24)
const add = (a: V3, d: V3, s = 1): V3 => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s]

// ------------------------------------------------------------------ flanges and pipe

/** B16.5 weld-neck flange with its raised face at `face`, facing +axis (hub runs back along -axis). Returns face-to-weld length. */
export function flange(k: Kit, nps: number, rating: Rating, face: V3, axis: Axis, studs = false) {
  const f = flangeDims(nps, rating)
  const ro = pipeOD(nps) / 2
  const ri = ro - pipeWall(nps, '80')
  const hubR = Math.max(f.hubDia / 2, ro * 1.05)
  const rf = f.raisedFaceHeight
  const L = f.hubLength + rf
  const seg = segments(f.od)
  const v = axisVec(axis)
  const base = v3(new THREE.Vector3(...face).addScaledVector(v, -L))
  const back = L - rf - f.thickness
  k.lathe('flangeSteel', [
    [ri, 0],
    [ro, 0],
    [hubR, Math.max(back - 0.004, 0.001)],
    [hubR + 0.004, back],
    [f.od / 2, back],
    [f.od / 2, L - rf],
    [f.raisedFace / 2, L - rf],
  ], base, v3(v), seg)
  k.lathe('machined', [
    [f.raisedFace / 2, L - rf],
    [f.raisedFace / 2, L],
    [ri, L],
  ], base, v3(v), seg)
  k.lathe('pipeBore', [
    [ri, L],
    [ri, 0],
  ], base, v3(v), seg)
  if (studs) {
    const s = v3(new THREE.Vector3(...face).addScaledVector(v, -rf - f.thickness - f.boltDia))
    k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, s, axis, f.boltDia, f.thickness + f.boltDia * 2.4, [f.boltDia * 0.45])
  }
  return L
}

/** Blind flange closing a face at `face` that points along +axis. */
export function blindFlange(k: Kit, nps: number, rating: Rating, face: V3, axis: Axis) {
  const f = flangeDims(nps, rating)
  const v = axisVec(axis)
  const t = f.thickness * 1.15
  k.cyl('flangeSteel', f.od / 2, t, v3(new THREE.Vector3(...face).addScaledVector(v, 0.0045 + t / 2)), v3(v), segments(f.od))
  k.cyl('gasket', f.raisedFace / 2 + 0.006, 0.0045, v3(new THREE.Vector3(...face).addScaledVector(v, 0.00225)), v3(v), segments(f.raisedFace))
  const studL = f.thickness * 2.2 + t + f.boltDia * 2
  const start = v3(new THREE.Vector3(...face).addScaledVector(v, -f.thickness - f.raisedFaceHeight - f.boltDia))
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, start, axis, f.boltDia, studL, [f.boltDia * 0.45, studL - f.boltDia * 0.45])
}

/** Two flanges face to face with a spiral-wound gasket and stud bolts, centred on `pos`. */
export function flangedJoint(k: Kit, nps: number, rating: Rating, pos: V3, axis: Axis) {
  const f = flangeDims(nps, rating)
  const v = axisVec(axis)
  const g = 0.0045
  const p = new THREE.Vector3(...pos)
  flange(k, nps, rating, v3(p.clone().addScaledVector(v, -g / 2)), axis)
  flange(k, nps, rating, v3(p.clone().addScaledVector(v, g / 2)), v3(v.clone().negate()))
  gasket(k, nps, rating, pos, v3(v), g)
  const span = 2 * (f.thickness + f.raisedFaceHeight) + g
  const studL = span + f.boltDia * 3
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, v3(p.clone().addScaledVector(v, -studL / 2)), axis, f.boltDia, studL, [f.boltDia * 0.95, studL - f.boltDia * 0.95])
}

/** Spiral-wound gasket with centring ring: an annulus from the bore to the raised face, open through the middle. */
export function gasket(k: Kit, nps: number, rating: Rating, pos: V3, axis: Axis, t = GASKET_SPIRAL_WOUND) {
  const f = flangeDims(nps, rating)
  const ri = pipeOD(nps) / 2 - pipeWall(nps, '80')
  const ro = f.raisedFace / 2 + 0.006
  const v = axisVec(axis)
  const base = v3(new THREE.Vector3(...pos).addScaledVector(v, -t / 2))
  k.lathe('gasket', [[ro, 0], [ro, t], [ri, t], [ri, 0], [ro, 0]], base, v3(v), segments(f.raisedFace))
}

/** Circumferential butt-weld bead. */
export function weldBead(k: Kit, nps: number, pos: V3, axis: Axis) {
  const r = pipeOD(nps) / 2
  k.torus('flangeSteel', r + 0.0008, Math.max(0.0025, r * 0.03), pos, v3(axisVec(axis)), 6, 32)
}

/** Straight hollow pipe between two points, sized by NPS and schedule. */
export function pipe(k: Kit, a: V3, b: V3, nps: number, mat: MatKey = 'pipePaint', schedule: Schedule = 'STD') {
  k.pipe(mat, a, b, pipeOD(nps), pipeWall(nps, schedule), segments(pipeOD(nps)))
}

/** Pipe along a polyline with B16.9 long-radius (or short-radius) elbows at each corner and weld beads. */
export function pipeRun(k: Kit, pts: V3[], nps: number, opts: { mat?: MatKey; schedule?: Schedule; radius?: 'LR' | 'SR'; welds?: boolean } = {}) {
  const mat = opts.mat ?? 'pipePaint'
  const od = pipeOD(nps)
  const wall = pipeWall(nps, opts.schedule ?? 'STD')
  const R = elbow90(nps, opts.radius ?? 'LR')
  const P = pts.map((p) => new THREE.Vector3(...p))
  let start = P[0].clone()
  for (let i = 1; i < P.length - 1; i++) {
    const d1 = P[i].clone().sub(P[i - 1])
    const d2 = P[i + 1].clone().sub(P[i])
    const l1 = d1.length()
    const l2 = d2.length()
    d1.normalize()
    d2.normalize()
    const theta = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1))
    if (theta < 1e-3 || l1 < 1e-6 || l2 < 1e-6) continue
    const t = Math.min(R * Math.tan(theta / 2), l1 * 0.49, l2 * 0.49)
    const Rb = t / Math.tan(theta / 2)
    const p1 = P[i].clone().addScaledVector(d1, -t)
    k.pipe(mat, v3(start), v3(p1), od, wall)
    const toward = d2.clone().addScaledVector(d1, -d1.dot(d2)).normalize()
    k.bend(mat, v3(p1), v3(d1), v3(toward), Rb, od, theta, wall)
    start = P[i].clone().addScaledVector(d2, t)
    if (opts.welds !== false) {
      weldBead(k, nps, v3(p1), v3(d1))
      weldBead(k, nps, v3(start), v3(d2))
    }
  }
  k.pipe(mat, v3(start), v3(P[P.length - 1]), od, wall)
}

/** 2:1 ellipsoidal weld cap closing a pipe that points along +axis. */
export function weldCap(k: Kit, nps: number, pos: V3, axis: Axis, mat: MatKey = 'pipePaint') {
  k.dome(mat, pipeOD(nps) / 2, pos, axis, Math.PI / 2, 0.5, 24)
}

export interface NozzleOpts {
  /** point on the shell surface where the neck starts */
  base: V3
  /** outward unit direction */
  dir: V3
  nps: number
  rating: Rating
  /** shell surface to flange face */
  standout: number
  /** reinforcement pad outer diameter (0 = none) */
  pad?: number
  blind?: boolean
  mat?: MatKey
  studs?: boolean
}

/** Shell nozzle: neck, optional reinforcement pad, weld-neck flange and optional blind. Returns the flange face. */
export function nozzle(k: Kit, o: NozzleOpts): V3 {
  const d = new THREE.Vector3(...o.dir).normalize()
  const face = add(o.base, v3(d), o.standout)
  const L = flange(k, o.nps, o.rating, face, v3(d), o.studs ?? true)
  const neckEnd = add(face, v3(d), -L)
  const inset = add(o.base, v3(d), -pipeOD(o.nps) * 0.3)
  k.pipe(o.mat ?? 'equipmentPaint', inset, neckEnd, pipeOD(o.nps), pipeWall(o.nps, '80'))
  if (o.pad) k.cyl(o.mat ?? 'equipmentPaint', o.pad / 2, 0.012, add(o.base, v3(d), 0.002), v3(d), 32)
  if (o.blind) blindFlange(k, o.nps, o.rating, face, v3(d))
  return face
}

// ------------------------------------------------------------------ small details

/** Stamped stainless tag plate facing +normal. */
export function tagPlate(k: Kit, tag: string, pos: V3, normal: Axis, w = 0.09) {
  const n = axisVec(normal)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  const h = w * 0.3125
  k.box('stainless', [w + 0.004, h + 0.004, 0.0015], pos, q)
  k.plane(tagMaterial(tag), w, h, v3(new THREE.Vector3(...pos).addScaledVector(n, 0.0009)), q)
}

/** Bourdon gauge, dial facing +normal. */
export function gauge(k: Kit, pos: V3, normal: Axis, d = 0.1, unit: 'bar' | '°C' = 'bar', max = 100) {
  const n = axisVec(normal)
  const p = new THREE.Vector3(...pos)
  k.cyl('stainless', d / 2, d * 0.32, pos, v3(n), 24)
  k.torus('stainless', d / 2, d * 0.04, v3(p.clone().addScaledVector(n, d * 0.16)), v3(n), 6, 24)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  k.add(dialMaterial(unit, max), new THREE.CircleGeometry((d / 2) * 0.92, 28), mat4(v3(p.clone().addScaledVector(n, d * 0.165)), q))
  k.disc('glass', (d / 2) * 0.95, v3(p.clone().addScaledVector(n, d * 0.19)), v3(n), 28)
}

/** Ex d junction box with glands on the underside, back face at `pos`, door facing +normal. */
export function junctionBox(k: Kit, pos: V3, normal: Axis, size: V3 = [0.3, 0.3, 0.16], mat: MatKey = 'stainless') {
  const n = axisVec(normal)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  const c = v3(new THREE.Vector3(...pos).addScaledVector(n, size[2] / 2))
  k.rbox(mat, size, 0.012, c, q)
  k.rbox(mat, [size[0] * 0.94, size[1] * 0.94, 0.012], 0.006, v3(new THREE.Vector3(...c).addScaledVector(n, size[2] / 2)), q)
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Vector3((i - 1) * size[0] * 0.28, -size[1] / 2 - 0.02, 0).applyQuaternion(q).add(new THREE.Vector3(...c))
    k.cyl('brass', 0.014, 0.04, v3(g), 'y', 10)
  }
}

/** Forged lifting lug with a hole, plate in the plane spanned by `along` and +Y. */
export function liftingLug(k: Kit, pos: V3, along: 'x' | 'z' = 'x', s = 1, mat: MatKey = 'equipmentPaint') {
  const sh = new THREE.Shape()
  const w = 0.09 * s
  const h = 0.12 * s
  sh.moveTo(-w, 0)
  sh.lineTo(-w * 0.6, h * 0.65)
  sh.absarc(0, h * 0.65, w * 0.6, Math.PI, 0, true)
  sh.lineTo(w, 0)
  sh.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, h * 0.65, w * 0.28, 0, Math.PI * 2, false)
  sh.holes.push(hole)
  const t = 0.025 * s
  const rot = along === 'x' ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  const off = new THREE.Vector3(0, 0, -t / 2).applyQuaternion(rot)
  k.extrude(mat, sh, t, new THREE.Matrix4().compose(new THREE.Vector3(...pos).add(off), rot, new THREE.Vector3(1, 1, 1)), 12)
}

// ------------------------------------------------------------------ machinery

/** IEC-frame motor envelope for a rated power: frame radius R, body length L, shaft height H. */
export function motorSize(kw: number, poles: 2 | 4 | 6 = 4) {
  const f = iecMotor(kw, poles)
  return { R: Math.min(f.width, f.height) * 0.42, L: f.length * 0.8, H: f.shaftHeight, frame: f.frame, shaftDia: f.shaftDia }
}

export interface MotorOpts {
  R: number
  L: number
  H: number
  tbox?: 'top' | 'side'
  mat?: MatKey
  fins?: number
  cable?: boolean
}

/** TEFC induction motor. Shaft along +X with the coupling face at x = 0; frame from x = -L to 0; shaft at y = 0; feet at y = -H. */
export function motor(k: Kit, o: MotorOpts) {
  const { R, L, H } = o
  const P: MatKey = o.mat ?? 'motorPaint'
  const finH = Math.max(0.012, R * 0.12)
  const nFin = o.fins ?? Math.max(24, Math.round(R * 110))
  const shieldL = Math.max(0.04, R * 0.22)
  const bodyL = L - 2 * shieldL
  const x0 = -L + shieldL
  const sh = new THREE.Shape()
  const finW = Math.min(0.012, ((Math.PI * 2 * R) / nFin) * 0.28)
  const skip = (a: number) => Math.abs(a - Math.PI * 1.5) < 0.62
  const pts: [number, number][] = []
  for (let i = 0; i < nFin; i++) {
    const a = (i / nFin) * Math.PI * 2
    const da = finW / 2 / R
    const step = (Math.PI * 2) / nFin
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
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)))
  sh.closePath()
  const rotZX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  k.extrude(P, sh, bodyL, new THREE.Matrix4().compose(new THREE.Vector3(x0, 0, 0), rotZX, new THREE.Vector3(1, 1, 1)), 2)
  k.lathe(P, [
    [R + finH * 0.6, 0],
    [R + finH * 0.6, shieldL * 0.25],
    [R * 0.92, shieldL * 0.6],
    [R * 0.4, shieldL * 0.85],
    [R * 0.3, shieldL],
    [R * 0.12, shieldL],
  ], [-shieldL, 0, 0], 'x', 40)
  k.cyl(P, R * 0.32, shieldL * 0.35, [shieldL * 0.05, 0, 0], 'x', 24)
  k.boltCircle('nut', 'nut', 8, R + finH * 0.3, [-shieldL * 0.9, 0, 0], 'x', Math.max(0.008, R * 0.03), shieldL * 0.3, [shieldL * 0.25])
  k.lathe(P, [
    [R * 0.5, -L],
    [R + finH * 0.6, -L + shieldL * 0.6],
    [R + finH * 0.6, -L + shieldL],
  ], [0, 0, 0], 'x', 40)
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
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    k.box(P, [cowlL * 0.7, 0.006, 0.02], [xc + cowlL * 0.5, Math.sin(a) * (cowlR + 0.002), Math.cos(a) * (cowlR + 0.002)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -a))
  }
  const sr = Math.max(0.02, R * 0.13)
  k.cyl('stainless', sr, 0.12 + R * 0.2, [(0.12 + R * 0.2) / 2 - 0.02, 0, 0], 'x', 20)
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
  const tb = Math.max(0.16, R * 0.75)
  if (o.tbox === 'side') {
    const c: V3 = [-L * 0.4, 0, R + finH + tb * 0.25]
    k.box(P, [tb * 0.5, tb * 0.5, finH + 0.02], [-L * 0.4, 0, R + finH * 0.5])
    k.rbox(P, [tb * 1.1, tb * 0.9, tb * 0.5], tb * 0.06, c)
    k.rbox(P, [tb * 1.0, tb * 0.8, tb * 0.08], tb * 0.03, [c[0], 0, c[2] + tb * 0.27])
    for (const dx of [-tb * 0.25, tb * 0.25]) k.cyl('brass', tb * 0.08, tb * 0.12, [c[0] + dx, -tb * 0.5, c[2]], 'y', 10)
    if (o.cable) for (const dx of [-tb * 0.25, tb * 0.25]) k.spline('cable', [[c[0] + dx, -tb * 0.56, c[2]], [c[0] + dx, -H * 0.6, c[2] + 0.06], [c[0] + dx * 1.5, -H + 0.04, c[2] + 0.18]], tb * 0.06, 8, 20)
  } else {
    const c: V3 = [-L * 0.4, R + finH + tb * 0.28, 0]
    k.box(P, [tb * 0.5, finH + 0.02, tb * 0.5], [-L * 0.4, R + finH * 0.5, 0])
    k.rbox(P, [tb * 1.1, tb * 0.5, tb * 0.9], tb * 0.06, c)
    k.rbox(P, [tb * 1.0, tb * 0.08, tb * 0.8], tb * 0.03, [c[0], c[1] + tb * 0.27, 0])
    for (const dx of [-tb * 0.25, tb * 0.25]) k.cyl('brass', tb * 0.08, tb * 0.12, [c[0] + dx, c[1], tb * 0.5], 'z', 10)
    if (o.cable)
      for (const dx of [-tb * 0.25, tb * 0.25])
        k.spline('cable', [[c[0] + dx, c[1], tb * 0.56], [c[0] + dx, c[1] - 0.02, R + finH + 0.12], [c[0] + dx * 1.4, -H * 0.5, R + finH + 0.18], [c[0] + dx * 1.6, -H + 0.03, R + finH + 0.3]], tb * 0.06, 8, 24)
  }
  for (const lx of [-L * 0.15, -L * 0.75]) k.torus('nut', R * 0.09, R * 0.022, [lx, R + finH + R * 0.08, 0], 'z', 6, 16)
  k.box('nameplate', [R * 0.5, R * 0.3, 0.003], [-L * 0.65, R * 0.25, R + finH * 0.4], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.25))
}

/** Flexible disc coupling with an expanded-mesh guard between x0 and x1, shaft height y, guard base at y = base. */
export function couplingGuard(k: Kit, x0: number, x1: number, y: number, r: number, base: number, frame: MatKey = 'safetyYellow') {
  const len = x1 - x0
  const hub = Math.max(0.05, r * 0.45)
  k.cyl('flangeSteel', hub, len * 0.18, [x0 + len * 0.12, y, 0], 'x', 24)
  k.cyl('flangeSteel', hub, len * 0.18, [x1 - len * 0.12, y, 0], 'x', 24)
  k.cyl('stainless', hub * 0.45, len * 0.6, [(x0 + x1) / 2, y, 0], 'x', 16)
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
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  const g = new THREE.ExtrudeGeometry(prof, { depth: len - 0.04, bevelEnabled: false, curveSegments: 16 })
  uvScale(g, 8, 8)
  k.add(meshGuardMaterial(), g, new THREE.Matrix4().compose(new THREE.Vector3(x0 + 0.02, base, 0), q, new THREE.Vector3(1, 1, 1)))
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

// ------------------------------------------------------------------ structural steel

/** Cross-section outline of a named section (EN / AISC), x = flange width, y = depth, centred. */
export function sectionShape(name: string): THREE.Shape {
  const s = SECTIONS[name] ?? SECTIONS['HEB 300']
  const { d, b, tw, tf } = s
  const sh = new THREE.Shape()
  if (s.kind === 'CHS') {
    sh.absarc(0, 0, d / 2, 0, Math.PI * 2, false)
    const h = new THREE.Path()
    h.absarc(0, 0, d / 2 - tw, 0, Math.PI * 2, true)
    sh.holes.push(h)
  } else if (s.kind === 'SHS' || s.kind === 'RHS') {
    sh.moveTo(-b / 2, -d / 2).lineTo(b / 2, -d / 2).lineTo(b / 2, d / 2).lineTo(-b / 2, d / 2).closePath()
    const h = new THREE.Path()
    h.moveTo(-b / 2 + tw, -d / 2 + tw).lineTo(-b / 2 + tw, d / 2 - tw).lineTo(b / 2 - tw, d / 2 - tw).lineTo(b / 2 - tw, -d / 2 + tw).closePath()
    sh.holes.push(h)
  } else if (s.kind === 'U') {
    sh.moveTo(-b / 2, -d / 2).lineTo(b / 2, -d / 2).lineTo(b / 2, -d / 2 + tf).lineTo(-b / 2 + tw, -d / 2 + tf)
    sh.lineTo(-b / 2 + tw, d / 2 - tf).lineTo(b / 2, d / 2 - tf).lineTo(b / 2, d / 2).lineTo(-b / 2, d / 2).closePath()
  } else if (s.kind === 'L') {
    sh.moveTo(-b / 2, -d / 2).lineTo(b / 2, -d / 2).lineTo(b / 2, -d / 2 + tw).lineTo(-b / 2 + tw, -d / 2 + tw).lineTo(-b / 2 + tw, d / 2).lineTo(-b / 2, d / 2).closePath()
  } else {
    sh.moveTo(-b / 2, -d / 2).lineTo(b / 2, -d / 2).lineTo(b / 2, -d / 2 + tf).lineTo(tw / 2, -d / 2 + tf)
    sh.lineTo(tw / 2, d / 2 - tf).lineTo(b / 2, d / 2 - tf).lineTo(b / 2, d / 2).lineTo(-b / 2, d / 2)
    sh.lineTo(-b / 2, d / 2 - tf).lineTo(-tw / 2, d / 2 - tf).lineTo(-tw / 2, -d / 2 + tf).lineTo(-b / 2, -d / 2 + tf).closePath()
  }
  return sh
}

/** Structural member of a named section between a and b. `up` sets the web (depth) direction. */
export function member(k: Kit, a: V3, b: V3, section: string, mat: MatKey = 'structSteel', up: V3 = [0, 1, 0]) {
  const A = new THREE.Vector3(...a)
  const z = new THREE.Vector3(...b).sub(A)
  const L = z.length()
  if (L < 1e-6) return
  z.normalize()
  let u = new THREE.Vector3(...up).normalize()
  if (Math.abs(u.dot(z)) > 0.99) u = Math.abs(z.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const x = new THREE.Vector3().crossVectors(u, z).normalize()
  const y = new THREE.Vector3().crossVectors(z, x).normalize()
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(A)
  k.extrude(mat, sectionShape(section), L, m, 12)
}

/** Steel grating panel of sx × sz at `centre` (top of grating), with a flat-bar frame. */
export function grating(k: Kit, centre: V3, sx: number, sz: number, frame: MatKey = 'galvanised') {
  const t = 0.03
  const c: V3 = [centre[0], centre[1] - t / 2, centre[2]]
  const g = new THREE.BoxGeometry(sx, t, sz)
  uvScale(g, sx / 0.3, sz / 0.3)
  k.add(gratingMaterial(), g, mat4(c))
  for (const s of [-1, 1]) {
    k.box(frame, [sx, t, 0.005], [c[0], c[1], c[2] + s * (sz / 2 - 0.0025)])
    k.box(frame, [0.005, t, sz], [c[0] + s * (sx / 2 - 0.0025), c[1], c[2]])
  }
}

/** Checker-plate floor panel (top surface at `centre`). */
export function checkerPlate(k: Kit, centre: V3, sx: number, sz: number, t = 0.008) {
  const g = new THREE.BoxGeometry(sx, t, sz)
  uvScale(g, sx / 0.25, sz / 0.25)
  k.add(checkerPlateMaterial(), g, mat4([centre[0], centre[1] - t / 2, centre[2]]))
}

/** ISO 14122-3 handrail: top rail 1.1 m, knee rail, toe plate, posts ≤ 1.5 m. Points are walking-surface level. */
export function handrail(k: Kit, pts: V3[], mat: MatKey = 'safetyYellow', h: number = ACCESS.handrail.height) {
  const r = 0.0215
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i])
    const b = new THREE.Vector3(...pts[i + 1])
    const L = a.distanceTo(b)
    const n = Math.max(1, Math.ceil(L / ACCESS.handrail.postSpacingMax))
    for (let j = 0; j <= n; j++) {
      if (j === 0 && i > 0) continue
      const p = a.clone().lerp(b, j / n)
      k.rod(mat, [p.x, p.y, p.z], [p.x, p.y + h, p.z], r, 8)
    }
    for (const hh of [h, ACCESS.handrail.kneeRail]) k.rod(mat, [a.x, a.y + hh, a.z], [b.x, b.y + hh, b.z], r, 8)
    const d = b.clone().sub(a)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize())
    k.box(mat, [L, ACCESS.handrail.toePlate, 0.006], [mid.x, mid.y + ACCESS.handrail.toePlate / 2, mid.z], q)
  }
}

/** ISO 14122-4 fixed ladder from `foot` up to height `top` (absolute y), climber faces -out. Safety cage above 2.3 m. */
export function ladder(k: Kit, foot: V3, top: number, out: V3, opts: { cage?: boolean; mat?: MatKey; extend?: number } = {}) {
  const mat = opts.mat ?? 'safetyYellow'
  const o = new THREE.Vector3(...out).normalize()
  const side = new THREE.Vector3(0, 1, 0).cross(o).normalize()
  const w = ACCESS.ladder.width / 2
  const F = new THREE.Vector3(...foot)
  const H = top - foot[1] + (opts.extend ?? 1.1)
  for (const s of [-1, 1]) {
    const a = F.clone().addScaledVector(side, s * w)
    k.box(mat, [0.065, H, 0.012], v3(a.clone().setY(foot[1] + H / 2)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), o))
  }
  for (let y = ACCESS.ladder.rungPitch; y < top - foot[1] + 0.01; y += ACCESS.ladder.rungPitch)
    k.rod(mat, v3(F.clone().addScaledVector(side, -w).setY(foot[1] + y)), v3(F.clone().addScaledVector(side, w).setY(foot[1] + y)), 0.0125, 8)
  if (opts.cage === false || H < ACCESS.ladder.cageStart + 0.5) return
  const R = ACCESS.ladder.cageDia / 2
  const c = F.clone().addScaledVector(o, R * 0.9)
  const hoop = (a: number) => c.clone().addScaledVector(side, -Math.cos(a) * R).addScaledVector(o, Math.sin(a) * R)
  for (let y = ACCESS.ladder.cageStart; y <= H; y += ACCESS.ladder.hoopSpacing) {
    const yy = foot[1] + y
    const pts: V3[] = [v3(F.clone().addScaledVector(side, -w).setY(yy))]
    for (let i = 0; i <= 16; i++) pts.push(v3(hoop((i / 16) * Math.PI).setY(yy)))
    pts.push(v3(F.clone().addScaledVector(side, w).setY(yy)))
    k.tube(mat, pts, 0.008, 6, 0.05)
  }
  for (let i = 0; i < 5; i++) {
    const p = hoop(((i + 0.5) / 5) * Math.PI)
    k.rod(mat, [p.x, foot[1] + ACCESS.ladder.cageStart, p.z], [p.x, foot[1] + H, p.z], 0.01, 6)
  }
}

/** Circular access platform around a vertical vessel axis (+Y) from angle a0 to a1 (radians, 0 = +X), grating at height y. */
export function ringPlatform(k: Kit, y: number, rIn: number, width: number, a0 = 0, a1 = Math.PI, mat: MatKey = 'galvanised') {
  const rOut = rIn + width
  const n = Math.max(6, Math.round(((a1 - a0) * rOut) / 0.6))
  const ring = new THREE.RingGeometry(rIn, rOut, n, 1, a0, a1 - a0)
  ring.rotateX(-Math.PI / 2)
  const uv = ring.getAttribute('uv') as THREE.BufferAttribute
  const pos = ring.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.3, pos.getZ(i) / 0.3)
  k.add(gratingMaterial(), ring, mat4([0, y, 0]))
  const at = (r: number, a: number, yy: number): V3 => [Math.cos(a) * r, yy, -Math.sin(a) * r]
  const rail: V3[] = []
  for (let i = 0; i <= n; i++) rail.push(at(rOut, a0 + ((a1 - a0) * i) / n, y))
  for (let i = 0; i < n; i++) k.rod(mat, at(rOut, a0 + ((a1 - a0) * i) / n, y - 0.08), at(rOut, a0 + ((a1 - a0) * (i + 1)) / n, y - 0.08), 0.06, 4)
  handrail(k, rail, 'safetyYellow')
  for (const a of [a0, a1]) handrail(k, [at(rIn + 0.05, a, y), at(rOut, a, y)], 'safetyYellow')
  for (let i = 0; i <= n; i += 2) {
    const a = a0 + ((a1 - a0) * i) / n
    k.rod(mat, at(rIn, a, y - 0.1), at(rOut, a, y - 0.1), 0.04, 4)
    k.rod(mat, at(rIn, a, y - 0.85), at(rOut * 0.98, a, y - 0.12), 0.03, 4)
  }
}

/** Fabricated skid base: perimeter and cross beams of `section`, checker-plate deck, drip rim, four padeyes. Top at y = h. */
export function skid(k: Kit, length: number, width: number, section = 'HEB 200', mat: MatKey = 'structSteel') {
  const s = SECTIONS[section] ?? SECTIONS['HEB 200']
  const h = s.d
  const x = length / 2
  const z = width / 2 - s.b / 2
  for (const sz of [-1, 1]) member(k, [-x, h / 2, sz * z], [x, h / 2, sz * z], section, mat)
  const n = Math.max(2, Math.ceil(length / 1.5))
  for (let i = 0; i <= n; i++) {
    const xx = -x + s.b / 2 + ((length - s.b) * i) / n
    member(k, [xx, h / 2, -z + s.b / 2], [xx, h / 2, z - s.b / 2], section, mat, [0, 1, 0])
  }
  checkerPlate(k, [0, h + 0.008, 0], length, width)
  for (const sz of [-1, 1]) k.box(mat, [length, 0.05, 0.008], [0, h + 0.033, sz * (width / 2 - 0.004)])
  for (const sx of [-1, 1]) k.box(mat, [0.008, 0.05, width], [sx * (x - 0.004), h + 0.033, 0])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sx * (x - 0.25), h + 0.008, sz * (width / 2 - 0.03)], 'x', 1, mat)
  return h + 0.008
}

export { perp }

/** Welded saddle under a horizontal shell (axis +X, centre at y = 0): wear plate, 120° cradle, web, ribs, base plate, anchors. */
export function saddle(k: Kit, x: number, Ro: number, yDeck: number, opts: { sliding?: boolean; mat?: MatKey } = {}) {
  const mat = opts.mat ?? 'equipmentPaint'
  const s = THREE.MathUtils.clamp(Ro / 1.8, 0.35, 1.4)
  const tw = Math.max(0.008, 0.012 * s)
  const Rw = Ro + tw
  const tc = Math.max(0.012, 0.02 * s)
  const Rc = Rw + tc
  const tWeb = Math.max(0.012, 0.022 * s)
  const tb = Math.max(0.016, 0.028 * s)
  const tr = Math.max(0.01, 0.016 * s)
  const w = Math.max(0.16, 0.3 * s)
  const half = 0.88 * Ro
  const yBase = yDeck + tb
  const horn = Math.PI / 3
  const sh = new THREE.Shape()
  sh.moveTo(-half, yBase)
  sh.lineTo(half, yBase)
  sh.lineTo(Rc * Math.sin(horn), -Rc * Math.cos(horn))
  sh.absarc(0, 0, Rc, -Math.PI / 2 + horn, -Math.PI / 2 - horn, true)
  sh.lineTo(-half, yBase)
  k.extrude(mat, sh, tWeb, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x - tWeb / 2, 0, 0), 40)
  const ring = (r0: number, r1: number, y0: number, y1: number): [number, number][] => [[r1, y0], [r1, y1], [r0, y1], [r0, y0], [r1, y0]]
  k.lathe(mat, ring(Rw - 0.001, Rc, -w / 2, w / 2), [x, 0, 0], 'x', 48, Math.PI / 2 - horn, 2 * horn)
  const wa = horn + Math.PI / 30
  k.lathe(mat, ring(Ro - 0.003, Rw, -w / 2 - 0.05 * s, w / 2 + 0.05 * s), [x, 0, 0], 'x', 56, Math.PI / 2 - wa, 2 * wa)
  const zMax = 0.8 * Rc * Math.sin(horn)
  for (let i = 0; i < 5; i++) {
    const z = -zMax + (2 * zMax * i) / 4
    if (Math.abs(z) < 1e-6) continue
    const yTop = -Math.sqrt(Rc * Rc - (Math.abs(z) + tr / 2) ** 2) + 0.004
    k.box(mat, [w - 0.004, yTop - yBase, tr], [x, (yTop + yBase) / 2, z])
  }
  for (const sz of [-1, 1]) {
    const yTop = -Rc * Math.cos(horn) - 0.01
    k.box(mat, [w - 0.004, yTop - yBase, tr], [x, (yTop + yBase) / 2, sz * (half - tr / 2)])
  }
  k.box(mat, [w + 0.06 * s, tb, 2 * half + 0.08 * s], [x, yDeck + tb / 2, 0])
  const bd = Math.max(0.016, 0.024 * s)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const bx = x + sx * w * 0.3
      const bz = sz * (half - 0.035 - 0.03 * s)
      if (opts.sliding) k.box('nut', [bd * 3.6, 0.0016, bd * 1.3], [bx, yBase + 0.0008, bz])
      k.rod('nut', [bx, yBase - 0.01, bz], [bx, yBase + bd * 3.6, bz], bd / 2, 8)
      k.box('nut', [bd * 2.6, 0.006, bd * 2.6], [bx, yBase + 0.003, bz])
      k.hex('nut', bd * 1.6, bd, [bx, yBase + 0.006 + bd * 0.5, bz])
    }
}

/** Davit-hinged manway (default 24") on a shell: neck, flange, gasket, blind cover with handle, studs and davit arm. */
export function manway(k: Kit, base: V3, dir: V3, neck = 0.25, nps = 24, rating: Rating = 300, mat: MatKey = 'equipmentPaint') {
  const face = nozzle(k, { base, dir, nps, rating, standout: neck, mat, studs: false })
  blindFlange(k, nps, rating, face, dir)
  const d = new THREE.Vector3(...dir).normalize()
  const f = flangeDims(nps, rating)
  const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3().crossVectors(d, up).normalize()
  const hinge = new THREE.Vector3(...face).addScaledVector(side, f.od / 2 + 0.06)
  k.rod(mat, v3(hinge.clone().addScaledVector(d, -0.25)), v3(hinge.clone().addScaledVector(d, 0.12)), 0.022, 10)
  k.rod(mat, v3(hinge.clone().addScaledVector(d, 0.1)), v3(new THREE.Vector3(...face).addScaledVector(d, 0.1)), 0.018, 10)
  const handle = new THREE.Vector3(...face).addScaledVector(d, f.thickness * 1.2 + 0.03)
  k.rod('handwheel', v3(handle.clone().addScaledVector(up, -0.1)), v3(handle.clone().addScaledVector(up, 0.1)), 0.012, 8)
}
