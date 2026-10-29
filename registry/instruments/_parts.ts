// Shared instrument parts: Ex d transmitter heads, coplanar sensors, valve manifolds, tube fittings, pipe stands, flanged thermowells and level chambers.
import * as THREE from 'three'
import { Kit, axisVec, type Axis, type MatKey, type V3 } from '../lib/kit'
import { tagPlate } from '../lib/parts'
import { flange as flangeDims, pipeOD, pipeWall, type Rating, type Schedule } from '../lib/standards'
import { lcdMaterial } from '../lib/textures'

export const SS: MatKey = 'stainless'
/** 1/2" OD instrument tubing, radius m */
export const TUBE_R = 0.00635
/** height from the coplanar flange underside to the head centreline, m */
export const SENSOR_H = 0.182

const V = (v: V3) => new THREE.Vector3(...v)
const A = (v: THREE.Vector3) => v.toArray() as V3
export const addV = (a: V3, d: V3, s = 1): V3 => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s]

/** Radial segments for a round part of diameter d, m (smooth silhouettes on big flanges and bodies). */
export const segFor = (d: number) => (d > 0.5 ? 72 : d > 0.25 ? 56 : d > 0.1 ? 44 : 32)

/** B16.5 weld-neck flange, raised face at `face` pointing along +axis, with an open bore. Returns face-to-weld length. */
export function flange(k: Kit, nps: number, rating: Rating, face: V3, axis: Axis, studs = false) {
  const f = flangeDims(nps, rating)
  const ro = pipeOD(nps) / 2
  const ri = ro - pipeWall(nps, '80')
  const hubR = Math.max(f.hubDia / 2, ro * 1.05)
  const rf = f.raisedFaceHeight
  const L = f.hubLength + rf
  const seg = segFor(f.od)
  const v = axisVec(axis)
  const base = A(V(face).addScaledVector(v, -L))
  const back = L - rf - f.thickness
  const o = A(v)
  k.lathe('flangeSteel', [[ro * 0.999, 0], [hubR, Math.max(back - 0.004, 0.001)], [hubR + 0.004, back], [f.od / 2, back], [f.od / 2, L - rf], [f.raisedFace / 2, L - rf]], base, o, seg)
  k.lathe('machined', [[f.raisedFace / 2, L - rf], [f.raisedFace / 2, L], [ri, L]], base, o, seg)
  k.lathe('pipeBore', [[ri, L], [ri, 0]], base, o, segFor(ri * 2))
  if (studs) {
    const st = A(V(face).addScaledVector(v, -rf - f.thickness - f.boltDia))
    k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, st, axis, f.boltDia, f.thickness + f.boltDia * 2.4, [f.boltDia * 0.45])
  }
  return L
}

/** Blind flange with gasket and double-nutted studs closing a face that points along +axis. */
export function blindFlange(k: Kit, nps: number, rating: Rating, face: V3, axis: Axis) {
  const f = flangeDims(nps, rating)
  const v = axisVec(axis)
  const t = f.thickness * 1.15
  k.cyl('flangeSteel', f.od / 2, t, A(V(face).addScaledVector(v, 0.0045 + t / 2)), A(v), segFor(f.od))
  k.cyl('gasket', f.raisedFace / 2 + 0.006, 0.0045, A(V(face).addScaledVector(v, 0.00225)), A(v), segFor(f.raisedFace))
  const studL = f.thickness * 2.2 + t + f.boltDia * 2
  const st = A(V(face).addScaledVector(v, -f.thickness - f.raisedFaceHeight - f.boltDia))
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, st, axis, f.boltDia, studL, [f.boltDia * 0.45, studL - f.boltDia * 0.45])
}

/** Hollow pipe between two points with diameter-scaled segments. */
export function pipe(k: Kit, a: V3, b: V3, nps: number, mat: MatKey = 'pipePaint', schedule: Schedule = 'STD') {
  const od = pipeOD(nps)
  k.pipe(mat, a, b, od, pipeWall(nps, schedule), segFor(od))
}

/** Axis perpendicular to `dir`, horizontal where possible (for T-bar handles). */
function crossAxis(dir: V3): V3 {
  const d = V(dir).normalize()
  if (Math.abs(d.y) > 0.9) return [1, 0, 0]
  return A(new THREE.Vector3(0, 1, 0).cross(d).normalize())
}

/**
 * Dual-compartment Ex d housing, body axis along Z: LCD cover on +Z, terminal cover on -Z, conduit entries on ±X
 * (cable gland on +X, stopping plug on -X), neck boss underneath. Centre at `c`. Returns the gland exit point.
 */
export function exHead(k: Kit, c: V3, mat: MatKey, opts: { lcd?: boolean; r?: number } = {}): V3 {
  const R = opts.r ?? 0.048
  const s = R / 0.048
  const L = 0.1 * s
  const [x, y, z] = c
  k.cyl(mat, R, L, c, 'z', 32)
  k.cyl(mat, 0.026 * s, 0.03 * s, [x, y - R + 0.004 * s, z], 'y', 20)
  for (const d of [-1, 1]) {
    k.cyl(mat, R * 1.1, 0.024 * s, [x, y, z + d * (L / 2 + 0.012 * s)], 'z', 32)
    k.torus(mat, R * 1.1, 0.0028 * s, [x, y, z + d * (L / 2 + 0.006 * s)], 'z', 6, 32)
    k.hex('nut', 0.008 * s, 0.006 * s, [x + R * 0.75, y - R * 0.75, z + d * (L / 2 + 0.003 * s)], 'z')
  }
  const zf = z + L / 2 + 0.024 * s
  if (opts.lcd ?? true) {
    k.torus(mat, R * 0.86, 0.004 * s, [x, y, zf], 'z', 6, 32)
    k.disc(lcdMaterial(), R * 0.76, [x, y, zf + 0.0006], 'z', 28)
    k.disc('glass', R * 0.84, [x, y, zf + 0.0022], 'z', 28)
  }
  for (const d of [-1, 1]) k.cyl(mat, 0.014 * s, 0.024 * s, [x + d * (R + 0.006 * s), y, z + 0.02 * s], 'x', 14)
  k.hex('brass', 0.027 * s, 0.018 * s, [x + R + 0.026 * s, y, z + 0.02 * s], 'x')
  k.cyl('brass', 0.011 * s, 0.014 * s, [x + R + 0.042 * s, y, z + 0.02 * s], 'x', 12)
  k.cyl('rubberBlack', 0.0078 * s, 0.01 * s, [x + R + 0.053 * s, y, z + 0.02 * s], 'x', 10)
  k.hex(SS, 0.025 * s, 0.01 * s, [x - R - 0.023 * s, y, z + 0.02 * s], 'x')
  k.box('nameplate', [0.052 * s, 0.002, 0.03 * s], [x, y + R + 0.0008, z])
  k.cyl(SS, 0.005 * s, 0.008 * s, [x, y - R * 0.6, z - L / 2 - 0.004 * s], 'z', 8)
  return [x + R + 0.058 * s, y, z + 0.02 * s]
}

/** Coplanar sensor module on a flange whose underside is at `b`. dp adds the H / L marks. Returns the head centre. */
export function coplanarSensor(k: Kit, b: V3, mat: MatKey, dp = false): V3 {
  const [x, y, z] = b
  k.box(SS, [0.086, 0.024, 0.056], [x, y + 0.012, z])
  for (const dx of [-0.032, 0.032]) for (const dz of [-0.02, 0.02]) k.hex(SS, 0.012, 0.007, [x + dx, y + 0.0275, z + dz])
  for (const s of [-1, 1]) {
    k.cyl(SS, 0.0055, 0.012, [x + s * 0.049, y + 0.012, z], 'x', 8)
    k.hex(SS, 0.011, 0.007, [x + s * 0.058, y + 0.012, z], 'x')
  }
  if (dp) for (const s of [-1, 1]) k.box('nameplate', [0.012, 0.01, 0.0015], [x + s * 0.03, y + 0.012, z + 0.0285])
  k.cyl(SS, 0.043, 0.008, [x, y + 0.028, z], 'y', 28)
  k.cyl(SS, 0.04, 0.07, [x, y + 0.067, z], 'y', 28)
  k.torus(SS, 0.04, 0.002, [x, y + 0.08, z], 'y', 4, 28)
  k.cyl(SS, 0.02, 0.034, [x, y + 0.117, z], 'y', 16)
  return exHeadOn(k, [x, y + 0.134, z], mat)
}

function exHeadOn(k: Kit, neckTop: V3, mat: MatKey): V3 {
  const c: V3 = [neckTop[0], neckTop[1] + 0.048, neckTop[2]]
  exHead(k, c, mat)
  return c
}

/** Small-bore valve operator out of a block face: bonnet, packing nut, stem and T-bar. */
export function valveHandle(k: Kit, pos: V3, dir: V3, bar: MatKey = 'handwheel', s = 1) {
  const d = V(dir).normalize()
  const dd = A(d)
  k.hex(SS, 0.021 * s, 0.014 * s, addV(pos, dd, 0.007 * s), dd)
  k.hex(SS, 0.016 * s, 0.01 * s, addV(pos, dd, 0.019 * s), dd)
  k.cyl(SS, 0.0035 * s, 0.016 * s, addV(pos, dd, 0.031 * s), dd, 8)
  k.cyl(bar, 0.0045 * s, 0.056 * s, addV(pos, dd, 0.04 * s), crossAxis(dd), 8)
}

/** Twin-ferrule compression fitting at a port facing `dir`; the tube leaves 0.026 m out. */
export function tubeFitting(k: Kit, pos: V3, dir: V3) {
  const dd = A(V(dir).normalize())
  k.hex(SS, 0.024, 0.012, addV(pos, dd, 0.006), dd)
  k.cyl(SS, 0.008, 0.004, addV(pos, dd, 0.014), dd, 12)
  k.hex(SS, 0.021, 0.01, addV(pos, dd, 0.021), dd)
  return addV(pos, dd, 0.026)
}

/** Instrument tubing along a polyline with tight bends. */
export function tubing(k: Kit, pts: V3[]) {
  k.tube('tubing', pts, TUBE_R, 10, 0.038)
}

export interface ManifoldGeom {
  top: number
  bottom: number
  /** process inlets on the underside */
  inlets: V3[]
  w: number
  d: number
}

/**
 * Bar-stock valve manifold, flat back on -Z. 2-valve: block + bleed. 3-valve: 2 block + equalise.
 * 5-valve: 2 block + 2 equalise (front) + 2 vents (ends). `b` is the bottom centre.
 */
export function manifold(k: Kit, b: V3, n: 2 | 3 | 5): ManifoldGeom {
  const [x, y, z] = b
  const w = n === 2 ? 0.06 : n === 3 ? 0.1 : 0.12
  const h = n === 2 ? 0.075 : 0.06
  const d = 0.05
  k.box(SS, [w, h, d], [x, y + h / 2, z])
  const front = z + d / 2
  const yc = y + h / 2
  if (n === 2) {
    valveHandle(k, [x, y + h * 0.62, front], [0, 0, 1], 'handwheel')
    valveHandle(k, [x - w / 2, y + h * 0.3, z], [-1, 0, 0], 'actuatorRed', 0.75)
    k.hex('brass', 0.014, 0.01, [x + w / 2 + 0.005, y + h * 0.3, z], 'x')
  } else {
    for (const s of [-1, 1]) valveHandle(k, [x + s * w * 0.32, y + h * 0.33, front], [0, 0, 1], 'handwheel')
    valveHandle(k, [x, y + h * 0.72, front], [0, 0, 1], 'actuatorRed', 0.8)
    if (n === 5) for (const s of [-1, 1]) valveHandle(k, [x + s * w / 2, yc, z], [s, 0, 0], 'actuatorRed', 0.7)
    else for (const s of [-1, 1]) k.hex('brass', 0.014, 0.01, [x + s * (w / 2 + 0.005), yc, z], 'x')
  }
  const inlets: V3[] = n === 2 ? [[x, y, z]] : [[x - 0.027, y, z], [x + 0.027, y, z]]
  for (const p of inlets) k.cyl(SS, 0.011, 0.004, addV(p, [0, -1, 0], 0.002), 'y', 12)
  return { top: y + h, bottom: y, inlets, w, d }
}

/** 2" pipe stand (galvanised, Sch 80) on a gusseted base plate with four anchor bolts. Top capped at `top`. */
export function pipeStand(k: Kit, top: number) {
  const od = pipeOD(2)
  const tp = 0.016
  const P = 0.26
  k.box('galvanised', [P, tp, P], [0, tp / 2, 0])
  k.pipe('galvanised', [0, tp, 0], [0, top, 0], od, pipeWall(2, '80'), 24)
  k.cyl('galvanised', od / 2 + 0.002, 0.006, [0, top + 0.003, 0], 'y', 24)
  const g = new THREE.Shape()
  g.moveTo(0, 0)
  g.lineTo(0.08, 0)
  g.lineTo(0.08, 0.012)
  g.lineTo(0, 0.1)
  g.closePath()
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation(od / 2 - 0.001, tp, -0.004))
    k.extrude('galvanised', g, 0.008, m)
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p: V3 = [sx * (P / 2 - 0.035), tp, sz * (P / 2 - 0.035)]
      k.cyl('galvanised', 0.016, 0.003, addV(p, [0, 1, 0], 0.0015), 'y', 16)
      k.hex('nut', 0.028, 0.014, addV(p, [0, 1, 0], 0.01), 'y')
      k.cyl('galvanised', 0.008, 0.035, addV(p, [0, 1, 0], 0.012), 'y', 8)
    }
  k.cyl('galvanised', 0.008, 0.012, [od / 2 + 0.005, 0.22, 0], 'x', 8)
  return od / 2
}

/**
 * Bracket plate on the stand front (+Z) from y0 to y1, x0 to x1, held by two U-bolts at `uy`. Returns the plate front z.
 */
export function standBracket(k: Kit, rs: number, y0: number, y1: number, x0: number, x1: number, uy: number[]) {
  const t = 0.006
  k.box('galvanised', [x1 - x0, y1 - y0, t], [(x0 + x1) / 2, (y0 + y1) / 2, rs + t / 2])
  const R = rs + 0.006
  for (const y of uy) {
    k.torus('galvanised', R, 0.005, [0, y, 0], 'y', 6, 20, Math.PI)
    for (const s of [-1, 1]) {
      k.rod('galvanised', [s * R, y, 0], [s * R, y, rs + t + 0.016], 0.005, 8)
      k.hex('nut', 0.016, 0.008, [s * R, y, rs + t + 0.004], 'z')
      k.cyl('galvanised', 0.012, 0.002, [s * R, y, rs + t + 0.001], 'z', 12)
    }
  }
  return rs + t
}

/** Tube clamp holding a vertical tube at (x, y, z) off the stand front. */
export function tubeClamp(k: Kit, rs: number, x: number, y: number, z: number) {
  k.box('galvanised', [0.028, 0.022, z - rs], [x, y, (z + rs) / 2])
  k.torus('galvanised', TUBE_R + 0.003, 0.0025, [x, y, z], 'y', 6, 16)
}

/** Tubing-to-flange adapter: weld-neck flange with its face at `face` pointing along `axis`, tube entering the hub. Returns the tube entry point. */
export function tubeFlange(k: Kit, nps: number, rating: Rating, face: V3, axis: Axis) {
  const L = flange(k, nps, rating, face, axis)
  const d = A(axisVec(axis))
  const hub = addV(face, d, -L)
  k.cyl(SS, pipeOD(nps) / 2, 0.014, addV(hub, d, -0.007), A(axisVec(axis).negate()), 16, TUBE_R * 1.4)
  return addV(hub, d, -0.014)
}

/** Cable from a gland that drops and runs back to `end` (a tray or deck) as a smooth spline. */
export function cable(k: Kit, pts: V3[]) {
  k.spline('cable', pts, 0.0065, 6, 48)
}

/** Wire-tied stamped tag plate facing +normal. */
export function tag(k: Kit, text: string, pos: V3, normal: Axis, w = 0.075) {
  if (text) tagPlate(k, text, pos, normal, w)
}

/**
 * Flanged thermowell with its raised face at y = 0 facing -Y: solid forged flange, tapered stem below to `insertion`,
 * lagging extension, union and nipple above. Returns the top y.
 */
export function flangedThermowell(k: Kit, nps: number, rating: Rating, insertion: number, extension: number) {
  const f = flangeDims(nps, rating)
  const rf = f.raisedFaceHeight
  const t = f.thickness
  k.lathe('machined', [[0.004, 0], [f.raisedFace / 2, 0], [f.raisedFace / 2, rf]], [0, 0, 0], 'y', segFor(f.od))
  k.lathe('flangeSteel', [[f.raisedFace / 2, rf], [f.od / 2, rf], [f.od / 2, rf + t], [0.02, rf + t]], [0, 0, 0], 'y', segFor(f.od))
  k.around(f.bolts, f.boltCircle / 2, [0, rf + t + 0.0004, 0], 'y', (p) => k.cyl('pipeBore', f.boltDia * 0.56, 0.001, p, 'y', 10), Math.PI / f.bolts)
  const r0 = Math.min(0.0135, pipeOD(nps) / 2 - 0.006)
  k.cyl(SS, r0 + 0.003, 0.012, [0, -0.006, 0], 'y', 20)
  k.cyl(SS, 0.0095, insertion - 0.012, [0, -0.012 - (insertion - 0.012) / 2, 0], 'y', 20, r0)
  k.dome(SS, 0.0095, [0, -insertion, 0], '-y', Math.PI / 2, 1, 16)
  let y = rf + t
  k.cyl(SS, 0.02, 0.012, [0, y + 0.006, 0], 'y', 20)
  k.hex(SS, 0.036, 0.018, [0, y + 0.021, 0])
  y += 0.03
  k.cyl(SS, 0.0107, extension, [0, y + extension / 2, 0], 'y', 14)
  y += extension
  k.hex(SS, 0.036, 0.016, [0, y + 0.008, 0])
  k.cyl(SS, 0.017, 0.006, [0, y + 0.019, 0], 'y', 16)
  k.hex(SS, 0.032, 0.016, [0, y + 0.03, 0])
  y += 0.038
  return y
}

/** Blind-flanged end of a vertical chamber, flange face at y facing `dir` (±1), with a 1/2" valve and plug. */
function chamberEnd(k: Kit, nps: number, rating: Rating, y: number, dir: 1 | -1, valve: boolean) {
  const face: V3 = [0, y, 0]
  flange(k, nps, rating, face, dir > 0 ? 'y' : '-y', true)
  blindFlange(k, nps, rating, face, dir > 0 ? 'y' : '-y')
  if (!valve) return
  const f = flangeDims(nps, rating)
  const yo = y + dir * (0.0045 + f.thickness * 1.15)
  const off = 0
  k.cyl(SS, 0.0107, 0.05, [off, yo + dir * 0.025, 0], 'y', 12)
  k.box(SS, [0.034, 0.04, 0.034], [off, yo + dir * 0.07, 0])
  valveHandle(k, [off, yo + dir * 0.07, 0.017], [0, 0, 1], 'actuatorRed', 0.9)
  k.cyl(SS, 0.0107, 0.03, [off, yo + dir * 0.105, 0], 'y', 12)
  k.hex(SS, 0.026, 0.014, [off, yo + dir * 0.127, 0])
}

export interface ChamberOpts {
  /** centre-to-centre of the side connections, m */
  cc: number
  chamberNps: number
  connNps: number
  rating: Rating
  /** side connection face distance from the chamber axis, m */
  standout: number
  /** top end: a blind flange with vent valve, or a flange face left for a GWR head */
  top: 'vent' | 'gwr'
  mat: MatKey
}

export function chamberDims(o: Pick<ChamberOpts, 'cc'>) {
  return { yTop: o.cc / 2 + 0.22, yBot: -o.cc / 2 - 0.3 }
}

/**
 * External level cage: vertical pipe on the origin, side connections facing -X at y = ±cc/2 (weld-neck flanges,
 * faces at x = -standout), blind bottom with drain valve, top either blind + vent valve or bare for a GWR.
 * Returns the top flange face y.
 */
export function chamber(k: Kit, o: ChamberOpts) {
  const { yTop, yBot } = chamberDims(o)
  const D = pipeOD(o.chamberNps)
  const f = flangeDims(o.chamberNps, o.rating)
  const L = f.hubLength + f.raisedFaceHeight
  pipe(k, [0, yBot + L, 0], [0, yTop - L, 0], o.chamberNps, o.mat, '80')
  chamberEnd(k, o.chamberNps, o.rating, yBot, -1, true)
  if (o.top === 'vent') chamberEnd(k, o.chamberNps, o.rating, yTop, 1, true)
  else flange(k, o.chamberNps, o.rating, [0, yTop, 0], 'y')
  const fc = flangeDims(o.connNps, o.rating)
  const Lc = fc.hubLength + fc.raisedFaceHeight
  for (const y of [-o.cc / 2, o.cc / 2]) {
    flange(k, o.connNps, o.rating, [-o.standout, y, 0], '-x')
    pipe(k, [-D / 2 + 0.004, y, 0], [-o.standout + Lc, y, 0], o.connNps, o.mat, '80')
    k.torus('flangeSteel', pipeOD(o.connNps) / 2 + 0.0008, 0.0025, [-D / 2 - 0.002, y, 0], 'x', 6, 24)
  }
  return { yTop, yBot, D }
}


/**
 * Solid instrument flange (blind type) with its raised face at the origin facing -up and the body along +up,
 * blind bolt-hole marks on the back. Returns the back-face offset along up.
 */
export function instFlange(k: Kit, nps: number, rating: Rating, up: Axis) {
  const f = flangeDims(nps, rating)
  const rf = f.raisedFaceHeight
  const t = f.thickness
  const seg = segFor(f.od)
  k.at([0, 0, 0], A(axisVec(up)), () => {
    k.lathe('machined', [[0.004, 0], [f.raisedFace / 2, 0], [f.raisedFace / 2, rf]], [0, 0, 0], 'y', seg)
    k.lathe('flangeSteel', [[f.raisedFace / 2, rf], [f.od / 2, rf], [f.od / 2, rf + t], [0.02, rf + t]], [0, 0, 0], 'y', seg)
    k.around(f.bolts, f.boltCircle / 2, [0, rf + t + 0.0004, 0], 'y', (p) => k.cyl('pipeBore', f.boltDia * 0.56, 0.001, p, 'y', 10), Math.PI / f.bolts)
  })
  return rf + t
}
