// Shared pump, motor and fan geometry: plates, guards, vertical motor, drain-rim baseplate, flanged branches, control stations.
import * as THREE from 'three'
import { Kit, mat4, uvScale, type MatKey, type Orient, type V3 } from '../lib/kit'
import { flange, gauge, motorSize, tagPlate } from '../lib/parts'
import { fanGuardMaterial, meshGuardMaterial } from '../lib/textures'
import { flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'

export const TAU = Math.PI * 2
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Quaternion turning local +Z onto n (plates facing n). */
export const faceQ = (n: V3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n).normalize())

/** Flat ring (rIn = 0: disc) between y0 and y1 along `axis` from `pos`. */
export function annulus(k: Kit, mat: MatKey, rIn: number, rOut: number, y0: number, y1: number, pos: V3 = [0, 0, 0], axis: Orient = 'y', seg = 40) {
  k.lathe(mat, [[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1], [rIn, y0]], pos, axis, seg)
}

/** Open (uncapped) cylinder between two points. */
export function openTube(k: Kit, mat: MatKey, a: V3, b: V3, r: number, seg = 24, r2?: number) {
  const va = new THREE.Vector3(...a)
  const d = new THREE.Vector3(...b).sub(va)
  const L = d.length()
  if (L < 1e-6) return
  const mid = va.addScaledVector(d, 0.5)
  k.add(mat, new THREE.CylinderGeometry(r2 ?? r, r, L, seg, 1, true), mat4([mid.x, mid.y, mid.z], d.toArray() as V3))
}

/** Expanded-metal guard tube between two points. */
export function meshTube(k: Kit, a: V3, b: V3, r: number, r2?: number, color?: string) {
  const va = new THREE.Vector3(...a)
  const d = new THREE.Vector3(...b).sub(va)
  const L = d.length()
  const g = new THREE.CylinderGeometry(r2 ?? r, r, L, 28, 1, true)
  uvScale(g, TAU * Math.max(r, r2 ?? r) * 8, L * 8)
  const mid = va.addScaledVector(d, 0.5)
  k.add(meshGuardMaterial(color), g, mat4([mid.x, mid.y, mid.z], d.toArray() as V3))
}

/** Expanded-metal flat panel w × h facing +normal. */
export function meshPanel(k: Kit, w: number, h: number, pos: V3, normal: V3, color?: string) {
  const g = new THREE.PlaneGeometry(w, h)
  uvScale(g, w * 8, h * 8)
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), faceQ(normal), new THREE.Vector3(1, 1, 1))
  k.add(meshGuardMaterial(color), g, m)
}

/** Plate from a to b: width w along `side` (made perpendicular), thickness t. */
export function strut(k: Kit, mat: MatKey, a: V3, b: V3, w: number, t: number, side: V3) {
  const A = new THREE.Vector3(...a)
  const Y = new THREE.Vector3(...b).sub(A)
  const L = Y.length()
  if (L < 1e-6) return
  Y.normalize()
  const X = new THREE.Vector3(...side)
  X.addScaledVector(Y, -X.dot(Y)).normalize()
  const Z = new THREE.Vector3().crossVectors(X, Y)
  const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(A.addScaledVector(Y, L / 2))
  k.add(mat, new THREE.BoxGeometry(w, L, t), m)
}

/** Triangular gusset in the radial plane at angle `ang` about +Y, r0 → r1 at yPlate, height h (h < 0 hangs below). */
export function gusset(k: Kit, mat: MatKey, ang: number, r0: number, r1: number, yPlate: number, h: number, t: number) {
  const s = new THREE.Shape()
  s.moveTo(r0, yPlate)
  s.lineTo(r1, yPlate)
  s.lineTo(r0, yPlate + h)
  s.closePath()
  const m = new THREE.Matrix4().makeRotationY(ang).multiply(new THREE.Matrix4().makeTranslation(0, 0, -t / 2))
  k.extrude(mat, s, t, m, 1)
}

/** Toothed (cooling-fin) TEFC frame section in the XY plane. */
export function finnedShape(R: number, finH: number, nFin: number) {
  const sh = new THREE.Shape()
  const step = TAU / nFin
  const finW = Math.min(0.012, step * R * 0.28)
  const da = finW / 2 / R
  const pts: [number, number][] = []
  for (let i = 0; i < nFin; i++) {
    const a = i * step
    for (let s = 0; s < 3; s++) {
      const aa = a - step / 2 + (s / 3) * (step / 2 - da)
      pts.push([Math.cos(aa) * R, Math.sin(aa) * R])
    }
    pts.push([Math.cos(a - da) * R, Math.sin(a - da) * R])
    pts.push([Math.cos(a - da * 0.6) * (R + finH), Math.sin(a - da * 0.6) * (R + finH)])
    pts.push([Math.cos(a + da * 0.6) * (R + finH), Math.sin(a + da * 0.6) * (R + finH)])
    pts.push([Math.cos(a + da) * R, Math.sin(a + da) * R])
  }
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)))
  sh.closePath()
  return sh
}

/** Weld-neck flange length (weld end to raised face). */
export const flangeLen = (nps: number, rating: Rating) => {
  const f = flangeDims(nps, rating)
  return f.hubLength + f.raisedFaceHeight
}

/** Branch pipe from `from` along `dir` to a WN flange (with studs) whose raised face is at `face`. */
export function flangedBranch(k: Kit, mat: MatKey, from: V3, face: V3, nps: number, rating: Rating, schedule: '40' | '80' | 'STD' = '80') {
  const d = new THREE.Vector3(...face).sub(new THREE.Vector3(...from)).normalize()
  const L = flange(k, nps, rating, face, d.toArray() as V3, true)
  const end = new THREE.Vector3(...face).addScaledVector(d, -L).toArray() as V3
  const ro = pipeOD(nps) / 2
  k.pipe(mat, from, end, pipeOD(nps), pipeWall(nps, schedule), nps >= 6 ? 32 : 20)
  // bore through the flange hub up to the face, and a dark end where the branch opens into the casing
  openTube(k, 'pipeBore', end, new THREE.Vector3(...face).addScaledVector(d, -0.0005).toArray() as V3, ro * 0.88, nps >= 6 ? 32 : 20)
  k.disc('pipeBore', ro - pipeWall(nps, schedule) + 0.001, from, d.toArray() as V3, 24)
}

/** IEC motor envelope from kW; above the IEC 60072 range (1 MW) the frame grows with the cube root of power. */
export function motorEnvelope(kw: number, poles: 2 | 4 | 6 = 4) {
  const m = motorSize(kw, poles)
  const s = kw > 1000 ? Math.cbrt(kw / 1000) : 1
  return { ...m, R: m.R * s, L: m.L * s, H: m.H * s, frame: kw > 1000 ? 'HV' : m.frame }
}

export interface VerticalMotorOpts {
  /** frame radius (without fins), m */
  R: number
  /** frame length flange to fan end, m */
  H: number
  /** D-flange underside height, m */
  yF: number
  mat?: MatKey
  /** text on the nameplate, e.g. "IEC 315M 160 kW" */
  plate?: string
  /** height of the deck the cables run down to */
  deck?: number
  canopy?: boolean
}

/** Vertical TEFC motor (IM V1): D-flange, finned frame, end shields, fan cowl, drip canopy, terminal + heater boxes. Returns the top height. */
export function verticalMotor(k: Kit, o: VerticalMotorOpts) {
  const { R: Rm, H: Hm, yF } = o
  const drv = o.mat ?? 'motorPaint'
  const deck = o.deck ?? 0
  const finH = Math.max(0.012, Rm * 0.1)
  const shL = Math.max(0.05, Rm * 0.22)
  annulus(k, drv, 0, Rm * 1.12, yF, yF + 0.05, [0, 0, 0], 'y', 48)
  k.boltCircle('boltXylan', 'nut', 8, Rm * 1.04, [0, yF - 0.04, 0], 'y', Math.max(0.012, Rm * 0.04), 0.12, [0.105], Math.PI / 8)
  const y0f = yF + 0.05 + shL
  const yM1 = yF + 0.05 + Hm
  const y1f = yM1 - shL
  k.lathe(drv, [[Rm * 0.6, yF + 0.05], [Rm + finH * 0.6, yF + 0.05 + shL * 0.55], [Rm + finH * 0.6, y0f]], [0, 0, 0], 'y', 48)
  const nFin = Math.max(28, Math.round(Rm * 100))
  k.extrude(drv, finnedShape(Rm, finH, nFin), y1f - y0f, new THREE.Matrix4().makeTranslation(0, y0f, 0).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)), 2)
  k.lathe(drv, [[Rm + finH * 0.6, y1f], [Rm + finH * 0.6, y1f + shL * 0.4], [Rm * 0.7, yM1]], [0, 0, 0], 'y', 48)
  k.boltCircle('nut', 'nut', 8, Rm + finH * 0.3, [0, yF + 0.05 + shL * 0.7, 0], 'y', Math.max(0.008, Rm * 0.03), 0.03, [0.02])
  const cR = Rm + finH + 0.015
  const cowlH = Math.max(0.12, Rm * 0.45)
  k.lathe(drv, [
    [cR - 0.005, y1f - shL * 0.3],
    [cR, y1f - shL * 0.3],
    [cR, yM1 + cowlH * 0.8],
    [cR * 0.94, yM1 + cowlH],
    [cR * 0.94 - 0.004, yM1 + cowlH],
  ], [0, 0, 0], 'y', 48)
  k.disc('rubberBlack', cR * 0.9, [0, yM1 + cowlH - 0.02, 0], 'y', 32)
  k.disc(fanGuardMaterial(), cR * 0.92, [0, yM1 + cowlH + 0.001, 0], 'y', 32)
  let top = yM1 + cowlH
  if (o.canopy !== false) {
    const yCan = yM1 + cowlH + Math.max(0.06, Rm * 0.14)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU
      k.rod(drv, [Math.cos(a) * cR * 0.88, yM1 + cowlH, Math.sin(a) * cR * 0.88], [Math.cos(a) * cR * 0.88, yCan, Math.sin(a) * cR * 0.88], 0.01, 6)
    }
    const hc = Math.max(0.04, Rm * 0.1)
    k.lathe(drv, [[cR * 1.12, yCan - 0.04], [cR * 1.12, yCan], [cR * 0.4, yCan + hc], [0, yCan + hc]], [0, 0, 0], 'y', 48)
    k.lathe(drv, [[0, yCan - 0.005], [cR * 1.1, yCan - 0.04]], [0, 0, 0], 'y', 48)
    top = yCan + hc
  }
  // terminal box (+Z), anti-condensation heater / RTD box (-Z), cables to the deck
  const tb = clamp(Rm * 0.75, 0.14, 0.5)
  const yT = yF + Hm * 0.45
  const zT = Rm + finH + tb * 0.28
  k.box(drv, [tb * 0.5, tb * 0.5, finH + 0.03], [0, yT, Rm + finH * 0.5])
  k.rbox(drv, [tb * 1.1, tb * 0.9, tb * 0.55], tb * 0.06, [0, yT, zT])
  k.rbox(drv, [tb * 1.0, tb * 0.8, tb * 0.06], tb * 0.03, [0, yT, zT + tb * 0.3])
  k.around(6, tb * 0.42, [0, yT, zT + tb * 0.335], 'z', (p) => k.hex('nut', 0.016, 0.01, p, 'z'), Math.PI / 6)
  for (const dx of [-tb * 0.25, tb * 0.25]) {
    k.cyl('brass', tb * 0.08, tb * 0.14, [dx, yT - tb * 0.5, zT], 'y', 12)
    k.spline('cable', [[dx, yT - tb * 0.56, zT], [dx, yT - tb * 1.4, zT + 0.04], [dx * 1.4, (yT + deck) / 2, zT + 0.1], [dx * 1.6, deck + 0.03, zT + 0.12]], tb * 0.065, 8, 30)
  }
  const ta = tb * 0.5
  const zA = -(Rm + finH + ta * 0.22)
  k.rbox(drv, [ta, ta * 0.8, ta * 0.45], ta * 0.08, [0, yT + tb * 0.2, zA])
  k.cyl('brass', ta * 0.1, ta * 0.18, [0, yT + tb * 0.2 - ta * 0.45, zA], 'y', 10)
  k.spline('cable', [[0, yT + tb * 0.2 - ta * 0.5, zA], [0, yT - 0.4, zA - 0.08], [0.1, deck + 0.03, zA - 0.1]], 0.012, 6, 24)
  // lifting lugs, nameplate, earth boss, bearing vibration probes
  for (const s of [-1, 1]) {
    const x = s * (Rm + finH + 0.03)
    k.box(drv, [0.08, 0.16, 0.035], [x, y1f - 0.06, 0])
    k.torus('nut', 0.035, 0.009, [x + s * 0.02, y1f + 0.03, 0], 'z', 6, 14)
  }
  const pn = new THREE.Vector3(0.707, 0, 0.707)
  const pr = Rm + finH + 0.006
  const pw = Math.max(0.1, Rm * 0.5)
  k.box(drv, [pw * 0.6, pw * 0.4, finH + 0.01], [pn.x * (Rm + finH * 0.5), yF + Hm * 0.68, pn.z * (Rm + finH * 0.5)], faceQ([pn.x, 0, pn.z]))
  if (o.plate) tagPlate(k, o.plate, [pn.x * pr, yF + Hm * 0.68, pn.z * pr], [pn.x, 0, pn.z], pw)
  else k.box('nameplate', [pw, pw * 0.6, 0.003], [pn.x * pr, yF + Hm * 0.68, pn.z * pr], faceQ([pn.x, 0, pn.z]))
  k.cyl('brass', 0.012, 0.03, [-(Rm + finH * 0.5) * 0.7, yF + 0.2, (Rm + finH * 0.5) * 0.7], [-0.7, 0, 0.7], 8)
  for (const a of [Math.PI / 2 + 0.6, Math.PI / 2 - 0.6]) {
    const u: V3 = [Math.cos(a), 0, Math.sin(a)]
    k.rod('stainless', [u[0] * (Rm * 0.75), yF + 0.05 + shL * 0.5, u[2] * (Rm * 0.75)], [u[0] * (Rm * 0.75 + 0.08), yF + 0.05 + shL * 0.5 + 0.04, u[2] * (Rm * 0.75 + 0.08)], 0.012, 8)
  }
  return top
}

/** Drain-rim baseplate (API 610): channels, sloped deck, rim, grout holes, anchor bolts, lifting lugs, drain. Top at y = hb. */
export function drainRimBaseplate(k: Kit, L: number, W: number, hb: number, mat: MatKey = 'equipmentPaintDark', x0 = 0) {
  const t = 0.012
  k.at([x0, 0, 0], undefined, () => {
    k.box(mat, [L, 0.016, W + 0.08], [0, 0.008, 0])
    for (const s of [-1, 1]) {
      k.box(mat, [L, hb - 0.016, t], [0, hb / 2 + 0.008, s * (W / 2 - t / 2)])
      k.box(mat, [t, hb - 0.016, W], [s * (L / 2 - t / 2), hb / 2 + 0.008, 0])
      const n = Math.round(L / 0.45)
      for (let i = 1; i < n; i++) k.box(mat, [0.01, hb - 0.03, 0.04], [-L / 2 + (i * L) / n, hb / 2 + 0.008, s * (W / 2 + 0.02)])
    }
    k.box(mat, [L - 2 * t, 0.01, W - 2 * t], [0, hb - 0.03, 0])
    for (const s of [-1, 1]) {
      k.box(mat, [L, 0.045, 0.02], [0, hb - 0.005, s * (W / 2 - 0.01)])
      k.box(mat, [0.02, 0.045, W], [s * (L / 2 - 0.01), hb - 0.005, 0])
    }
    for (const s of [-1, 1]) k.box(mat, [L - 0.1, hb - 0.05, 0.12], [0, (hb - 0.05) / 2 + 0.016, s * W * 0.28])
    const nG = Math.max(2, Math.round(L / 0.9))
    for (let i = 0; i < nG; i++) {
      const gx = -L / 2 + (L * (i + 0.5)) / nG
      k.torus(mat, 0.05, 0.008, [gx, hb - 0.022, 0], 'y', 6, 24)
      k.disc('rubberBlack', 0.048, [gx, hb - 0.0245, 0], 'y', 24)
    }
    const nA = Math.max(3, Math.round(L / 0.7) + 1)
    for (let i = 0; i < nA; i++) {
      const ax = -L / 2 + 0.08 + ((L - 0.16) * i) / (nA - 1)
      for (const s of [-1, 1]) anchorBolt(k, [ax, 0.016, s * (W / 2 + 0.035)])
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        k.box(mat, [0.1, 0.1, 0.02], [sx * (L / 2 - 0.12), hb * 0.55, sz * (W / 2 + 0.01)])
        k.torus('nut', 0.025, 0.006, [sx * (L / 2 - 0.12), hb * 0.55 + 0.02, sz * (W / 2 + 0.022)], 'z', 6, 14)
      }
    k.cyl(mat, 0.022, 0.12, [L / 2 + 0.05, hb - 0.04, -W / 2 + 0.15], 'x', 12)
    k.hex('nut', 0.05, 0.03, [L / 2 + 0.11, hb - 0.04, -W / 2 + 0.15], 'x')
    k.cyl('brass', 0.015, 0.03, [-L / 2 + 0.3, hb * 0.5, W / 2 + 0.015], 'z', 10)
  })
}

/** Anchor bolt with washer and nut on a plate whose top is at p[1]. */
export function anchorBolt(k: Kit, p: V3, d = 0.022) {
  k.cyl('stainless', d * 0.9, 0.004, [p[0], p[1] + 0.002, p[2]], 'y', 16)
  k.hex('nut', d * 1.9, d * 1.1, [p[0], p[1] + 0.004 + d * 0.55, p[2]])
  k.cyl('boltXylan', d / 2, d * 3, [p[0], p[1] + d * 1.5, p[2]], 'y', 8)
}

/** Machined mounting pad with jack-screw block, top at y. */
export function mountPad(k: Kit, x: number, y: number, z: number, sx = 0.22, sz = 0.2, jack = 1, mat: MatKey = 'equipmentPaintDark') {
  k.box('flangeSteel', [sx, 0.025, sz], [x, y - 0.0125, z])
  if (!jack) return
  k.box(mat, [0.04, 0.06, 0.06], [x + jack * (sx / 2 + 0.05), y + 0.02, z])
  k.cyl('boltXylan', 0.008, 0.08, [x + jack * (sx / 2 + 0.03), y + 0.03, z], 'x', 6)
}

/** Local control station on a post (start / stop, E-stop, ammeter), facing +Z; base at `foot`. */
export function controlStation(k: Kit, foot: V3, face: V3 = [0, 0, 1], h = 1.2) {
  const [lx, y0, lz] = foot
  const q = faceQ(face)
  const n = new THREE.Vector3(...face).normalize()
  const P = (u: number, v: number, w: number): V3 => new THREE.Vector3(u, v, w).applyQuaternion(q).add(new THREE.Vector3(lx, 0, lz)).toArray() as V3
  k.rod('structSteel', [lx, y0, lz], [lx, h + 0.25, lz], 0.03, 12)
  k.box('structSteel', [0.15, 0.012, 0.15], [lx, y0 + 0.006, lz])
  k.box('structSteel', [0.04, 0.3, 0.02], P(0, h, 0.04), q)
  k.rbox('stainless', [0.24, 0.32, 0.13], 0.012, P(0, h, 0.115), q)
  const tilt = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.15))
  k.box('stainless', [0.3, 0.012, 0.2], P(0, h + 0.18, 0.12), tilt)
  const f = 0.18
  k.cyl('safetyGreen', 0.016, 0.02, P(-0.055, h + 0.05, f), n.toArray() as V3, 16)
  k.cyl('actuatorRed', 0.016, 0.02, P(0.055, h + 0.05, f), n.toArray() as V3, 16)
  k.cyl('actuatorYellow', 0.04, 0.004, P(0, h - 0.07, f - 0.002), n.toArray() as V3, 24)
  k.cyl('actuatorRed', 0.012, 0.03, P(0, h - 0.07, f + 0.012), n.toArray() as V3, 12)
  k.dome('actuatorRed', 0.028, P(0, h - 0.07, f + 0.025), n.toArray() as V3, Math.PI / 2, 0.6)
  gauge(k, P(0, h + 0.11, f - 0.01), n.toArray() as V3, 0.06, 'bar', 600)
  k.hex('brass', 0.03, 0.02, P(0, h - 0.17, 0.11))
  k.spline('cable', [P(0, h - 0.18, 0.11), P(0, h - 0.35, 0.06), P(0, y0 + 0.2, 0.04), P(0.1, y0 + 0.02, 0)], 0.008, 6, 24)
}

/** Pressure gauge on a root valve + siphon above a pipe top at `p` (dial facing +normal). */
export function pipeGauge(k: Kit, p: V3, normal: V3 = [0, 0, 1], max = 25, d = 0.1) {
  const [x, y, z] = p
  k.cyl('stainless', 0.012, 0.1, [x, y + 0.05, z], 'y', 8)
  k.hex('stainless', 0.04, 0.035, [x, y + 0.09, z])
  k.torus('stainless', 0.025, 0.006, [x, y + 0.14, z], [normal[0], 0, normal[2]], 6, 18)
  k.cyl('stainless', 0.01, 0.05, [x, y + 0.19, z], 'y', 8)
  gauge(k, [x + normal[0] * 0.02, y + 0.25, z + normal[2] * 0.02], normal, d, 'bar', max)
}

/** Spiral volute outline (Archimedean, r0 at the tongue to r1) with a straight tangential outlet of length `out` along +Y at u ∈ [r0, r1]. */
export function voluteShape(r0: number, r1: number, out: number, n = 48) {
  const s = new THREE.Shape()
  s.moveTo(r0, 0)
  for (let i = 1; i <= n; i++) {
    const th = (i / n) * TAU
    const r = r0 + ((r1 - r0) * i) / n
    s.lineTo(Math.cos(th) * r, Math.sin(th) * r)
  }
  s.lineTo(r1, out)
  s.lineTo(r0, out)
  s.closePath()
  return s
}

/** Extruded shape with rounded (bevelled) edges, depth along local +Z centred on z = 0, placed by m. */
export function castExtrude(k: Kit, mat: MatKey, shape: THREE.Shape, depth: number, bevel: number, m: THREE.Matrix4, seg = 12) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(depth - 2 * bevel, 0.001), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: seg })
  g.translate(0, 0, -(depth - 2 * bevel) / 2)
  k.add(mat, g, m)
}

/** Top-mounted air-to-air cooler (IC611) on a horizontal HV motor whose DE face is at xm, shaft height ys. */
export function topCooler(k: Kit, xm: number, ys: number, Rm: number, Lm: number, mat: MatKey = 'motorPaint') {
  const ch = Rm * 0.7
  const y = ys + Rm * 1.12 + ch / 2
  k.box(mat, [Lm * 0.3, Rm * 0.25, Rm * 0.9], [xm - Lm * 0.5, ys + Rm * 1.05, 0])
  k.rbox(mat, [Lm * 0.75, ch, Rm * 1.7], 0.03, [xm - Lm * 0.5, y, 0])
  for (let i = 0; i < 6; i++) k.box('rubberBlack', [Lm * 0.7, 0.01, Rm * 1.71], [xm - Lm * 0.5, y - ch * 0.35 + i * ch * 0.14, 0])
  k.cyl(mat, ch * 0.45, 0.1, [xm - Lm * 0.875 - 0.05, y, 0], 'x', 28)
  k.disc(fanGuardMaterial(), ch * 0.42, [xm - Lm * 0.875 - 0.101, y, 0], '-x', 24)
}

/** Constant-level oiler: arm from the bearing-housing surface point p along n, glass reservoir above. */
export function oiler(k: Kit, p: V3, n: V3 = [0, 0, 1], s = 1) {
  const o = new THREE.Vector3(...p).addScaledVector(new THREE.Vector3(...n).normalize(), 0.07 * s)
  k.rod('stainless', p, o.toArray() as V3, 0.008 * s, 8)
  k.cyl('stainless', 0.03 * s, 0.03 * s, [o.x, o.y + 0.015 * s, o.z], 'y', 16)
  k.cyl('glass', 0.032 * s, 0.09 * s, [o.x, o.y + 0.075 * s, o.z], 'y', 16)
  k.dome('glass', 0.032 * s, [o.x, o.y + 0.12 * s, o.z], 'y', Math.PI / 2, 1)
}

/** Small valve (forged body, bonnet, handwheel) on a vertical line at p, handwheel up. */
export function smallValve(k: Kit, p: V3, s = 1, dir: Orient = 'y') {
  k.at(p, dir, () => {
    k.box('valveBody', [0.06 * s, 0.07 * s, 0.05 * s], [0, 0, 0])
    k.cyl('valveBody', 0.016 * s, 0.07 * s, [0, 0.07 * s, 0], 'y', 10)
    k.handwheel('handwheel', 0.07 * s, [0, 0.11 * s, 0], 'y')
  })
}

/** API 682 Plan 23 seal cooler on a post: shell with bolted heads and cooling-water nozzles. Returns the top and bottom process connection points. */
export function sealCooler(k: Kit, foot: V3, yTop: number, r = 0.055) {
  const [x, y0, z] = foot
  const h = Math.max(0.3, r * 6)
  const yc = yTop - h / 2
  k.rod('structSteel', [x, y0, z], [x, yc - h / 2 - 0.02, z], 0.022, 10)
  k.box('structSteel', [0.12, 0.012, 0.12], [x, y0 + 0.006, z])
  k.box('structSteel', [0.03, 0.12, 0.008], [x, yc - h / 2 + 0.02, z - r - 0.004])
  k.cyl('stainless', r, h, [x, yc, z], 'y', 20)
  for (const s of [-1, 1]) {
    k.cyl('stainless', r * 1.3, 0.02, [x, yc + s * (h / 2 + 0.01), z], 'y', 20)
    k.boltCircle('boltXylan', 'nut', 6, r * 1.15, [x, yc + s * (h / 2 + 0.01) - 0.015, z], 'y', 0.006, 0.03, [0.005, 0.025])
  }
  for (const s of [-1, 1]) {
    k.rod('stainless', [x, yc + s * h * 0.35, z], [x + r + 0.05, yc + s * h * 0.35, z], 0.01, 8)
    k.cyl('flangeSteel', 0.018, 0.012, [x + r + 0.05, yc + s * h * 0.35, z], 'x', 12)
  }
  return { top: [x, yc + h / 2 + 0.02, z] as V3, bottom: [x, yc - h / 2 - 0.02, z] as V3 }
}
