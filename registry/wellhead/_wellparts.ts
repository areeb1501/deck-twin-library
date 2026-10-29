// Shared API 6A wellhead parts: RTJ joints, studded faces, slab gate valves (handwheel / hydraulic), angle chokes, crossovers, control-line tubing.
import * as THREE from 'three'
import { eul, type Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { flange as asmeFlange, tagPlate } from '../lib/parts'
import { flange as flangeDims, pipeOD, pipeWall, type Rating, type Schedule } from '../lib/standards'
import type { ApiFlange } from './_api6a'

export const BODY: MatKey = 'valveBody'
export const SPOOL: MatKey = paint('#5d646b', { metalness: 0.4, roughness: 0.5 })
export const ACT: MatKey = 'actuatorYellow'
export const HW: MatKey = 'actuatorRed'
export const STUD: MatKey = 'boltXylan'
export const NUT: MatKey = 'nut'
export const SS: MatKey = 'stainless'
/** half the ring-gasket gap at each RTJ joint */
export const G = 0.003

/** Frame with local +Y = flow, +Z = stem / bonnet, +X = flow × stem, origin at o. */
export function frame(o: V3, flow: V3, stem: V3) {
  const y = new THREE.Vector3(...flow).normalize()
  const z = new THREE.Vector3(...stem).normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...o)
}
export const at = (M: THREE.Matrix4, p: V3) => new THREE.Vector3(...p).applyMatrix4(M).toArray() as V3

/** 1/4"–1/2" stainless control-line tubing along a polyline with small bends. */
export function tubing(k: Kit, pts: V3[], r = 0.0048) {
  k.tube('tubing', pts, r, 6, Math.max(0.025, r * 6))
}

/** Tube (hollow cylinder) along local Y from y0 to y1, outer radius ro, bore ri, with a dark bore liner. */
export function ring(k: Kit, mat: MatKey, ro: number, ri: number, y0: number, y1: number, seg = 28, liner = true) {
  k.lathe(mat, [[ri, y0], [ro, y0], [ro, y1], [ri, y1]], [0, 0, 0], 'y', seg)
  if (liner) bore(k, ri, y0, y1)
}

/** Dark inward-facing bore liner of radius r between y0 and y1 (local Y). */
export function bore(k: Kit, r: number, y0: number, y1: number, seg = 24) {
  k.lathe('pipeBore', [[r, Math.max(y0, y1)], [r, Math.min(y0, y1)]], [0, 0, 0], 'y', seg)
}

/** Forged block (rounded in plan) w × h × d centred at c, with a through bore of radius r along local Y. */
export function boredBlock(k: Kit, mat: MatKey, size: V3, r: number, c: V3, round = 0.02, liner = true) {
  const [w, h, d] = size
  const rr = Math.min(round, w / 2 - 1e-3, d / 2 - 1e-3)
  const sh = new THREE.Shape()
  sh.moveTo(-w / 2 + rr, -d / 2)
  sh.lineTo(w / 2 - rr, -d / 2)
  sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + rr)
  sh.lineTo(w / 2, d / 2 - rr)
  sh.quadraticCurveTo(w / 2, d / 2, w / 2 - rr, d / 2)
  sh.lineTo(-w / 2 + rr, d / 2)
  sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - rr)
  sh.lineTo(-w / 2, -d / 2 + rr)
  sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + rr, -d / 2)
  const hole = new THREE.Path()
  hole.absarc(0, 0, r, 0, Math.PI * 2, true)
  sh.holes.push(hole)
  // extrude along +Z, then turn Z onto +Y (shape y maps to -Z)
  const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(c[0], c[1] - h / 2, c[2])
  k.extrude(mat, sh, h, m, 16)
  if (liner) k.at([c[0], 0, c[2]], undefined, () => bore(k, r, c[1] - h / 2, c[1] + h / 2))
}

/** Hollow ellipsoidal ball-valve body about local Y centred at y = yc: radius R, half-height R*sy, bore r. */
export function hollowBall(k: Kit, mat: MatKey, R: number, sy: number, r: number, yc: number) {
  const prof: [number, number][] = []
  const a0 = -Math.acos(Math.min(1, r / R))
  for (let i = 0; i <= 20; i++) {
    const a = a0 + ((-2 * a0) * i) / 20
    prof.push([Math.max(r, R * Math.cos(a)), yc + R * sy * Math.sin(a)])
  }
  prof.unshift([r, yc + R * sy * Math.sin(a0)])
  prof.push([r, yc - R * sy * Math.sin(a0)])
  k.lathe(mat, prof, [0, 0, 0], 'y', 32)
}

/** Closes a B16.5 flange bore: machined annulus at the RF face down to the pipe bore, plus a bore liner back through the hub. */
export function flangeBore(k: Kit, nps: number, rating: Rating, face: V3, axis: 'x' | '-x' | 'y' | '-y' | 'z' | '-z', schedule: Schedule = '80') {
  const f = flangeDims(nps, rating)
  const ro = pipeOD(nps) / 2
  const ri = ro - pipeWall(nps, schedule)
  k.at(face, axis, () => {
    k.lathe('machined', [[ro * 0.88, 0], [ri, 0]], [0, 0, 0], 'y', 28)
    k.lathe('pipeBore', [[ri, 0], [ri, -(f.hubLength + f.raisedFaceHeight) - 0.004]], [0, 0, 0], 'y', 24)
  })
}

const nutH = (d: ApiFlange) => d.boltDia * 0.95
const seg = (d: ApiFlange) => (d.bolts >= 12 ? 40 : 28)

/** Studs and nuts through two equal API flanges meeting at y = yj, with the ring gasket showing in the gap. */
export function joint(k: Kit, d: ApiFlange, yj: number) {
  const so = d.boltDia * 0.4
  const len = 2 * (G + d.t) + 2 * nutH(d) + 2 * so
  k.boltCircle(STUD, NUT, d.bolts, d.boltCircle / 2, [0, yj - len / 2, 0], 'y', d.boltDia, len, [so + nutH(d) / 2, len - so - nutH(d) / 2])
  k.torus(SS, d.ring / 2, Math.max(0.004, d.boltDia * 0.18), [0, yj, 0], 'y', 4, 28)
}

/** Studs screwed into a studded block face at y = yf (block below), nut on the flange of the part above. */
export function studded(k: Kit, d: ApiFlange, yf: number) {
  const so = d.boltDia * 0.4
  const inBlock = d.boltDia * 1.2
  const len = inBlock + G + d.t + nutH(d) + so
  k.boltCircle(STUD, NUT, d.bolts, d.boltCircle / 2, [0, yf - inBlock, 0], 'y', d.boltDia, len, [inBlock + G + d.t + nutH(d) / 2])
  k.torus(SS, d.ring / 2, Math.max(0.004, d.boltDia * 0.18), [0, yf, 0], 'y', 4, 28)
}

/** Integral API flange with its ring-joint face at y = face, body on side s (+1 above, -1 below). */
export function flangeAt(k: Kit, d: ApiFlange, face: number, s: 1 | -1, mat: MatKey = BODY) {
  const y0 = face + s * G
  const y1 = face + s * (G + d.t)
  const lo = Math.min(y0, y1)
  const hi = Math.max(y0, y1)
  const ch = Math.min(0.006, d.t * 0.12)
  // small chamfer on the back edge
  const back = s > 0 ? hi : lo
  const front = s > 0 ? lo : hi
  k.lathe(mat, [[d.bore * 0.0127, front], [d.od / 2, front], [d.od / 2, back - s * ch], [d.od / 2 - ch, back], [d.bore * 0.0127, back]], [0, 0, 0], 'y', seg(d))
}

export type Operator = { kind: 'handwheel'; mat?: MatKey; D: number } | { kind: 'hydraulic'; r: number; len: number; fusible?: boolean }

/** Slab gate valve between flange faces y = 0 and y = L, bonnet along +Z. Returns the hydraulic supply port (local) when actuated. */
export function gateValve(k: Kit, d: ApiFlange, L: number, op: Operator, mat: MatKey = BODY): V3 | null {
  flangeAt(k, d, 0, 1, mat)
  flangeAt(k, d, L, -1, mat)
  const inner = L - 2 * (G + d.t)
  const rb = d.bore * 0.0127
  ring(k, mat, d.od * 0.3, rb, G + d.t - 0.002, L - G - d.t + 0.002, 24, false)
  bore(k, rb, G, L - G)
  const w = d.od * 0.82
  const dz = d.od * 0.95
  const hb = Math.max(0.05, Math.min(d.od * 1.05, inner - 0.02))
  const yc = L / 2
  boredBlock(k, mat, [w, hb, dz], rb, [0, yc, 0], Math.min(0.025, w * 0.1), false)
  // body sealant injection + seat grease fittings
  k.cyl('brass', 0.008, 0.03, [w / 2 + 0.012, yc + hb * 0.25, 0], 'x', 8)
  k.hex('brass', 0.017, 0.012, [w / 2 + 0.029, yc + hb * 0.25, 0], 'x')
  k.hex('brass', 0.015, 0.012, [-w / 2 - 0.006, yc - hb * 0.2, dz * 0.2], 'x')
  // bonnet flange, nuts, bonnet
  const rbf = Math.min(w * 0.5, hb * 0.5)
  let z = dz / 2
  const tbf = Math.max(0.03, d.t * 0.6)
  k.cyl(mat, rbf, tbf, [0, yc, z + tbf / 2], 'z', 28)
  k.around(8, rbf * 0.8, [0, yc, z + tbf + 0.008], 'z', (p) => k.hex(NUT, Math.max(0.022, d.boltDia * 1.3), 0.016, p, 'z'), Math.PI / 8)
  z += tbf
  const bl = 0.07 + d.od * 0.18
  const rbo = rbf * 0.66
  k.cyl(mat, rbo, bl, [0, yc, z + bl / 2], 'z', 24)
  z += bl
  if (op.kind === 'handwheel') {
    k.cyl(mat, rbo * 0.62, 0.04, [0, yc, z + 0.02], 'z', 18)
    k.hex('brass', 0.016, 0.01, [rbo * 0.62, yc, z + 0.02], 'x')
    const sr = Math.max(0.011, d.od * 0.045)
    k.cyl(SS, sr, 0.12, [0, yc, z + 0.06], 'z', 12)
    k.handwheel(op.mat ?? HW, op.D, [0, yc, z + 0.1], 'z', 4)
    k.hex(NUT, sr * 2.4, 0.02, [0, yc, z + 0.12], 'z')
    return null
  }
  // hydraulic piston actuator: adapter, cylinder with caps and tie rods, stem protector with position band
  const { r, len } = op
  k.cyl(mat, rbo * 0.85, 0.05, [0, yc, z + 0.025], 'z', 24)
  z += 0.05
  k.cyl(ACT, r * 1.08, 0.03, [0, yc, z + 0.015], 'z', 32)
  k.cyl(ACT, r, len, [0, yc, z + 0.03 + len / 2], 'z', 32)
  k.cyl(ACT, r * 1.08, 0.035, [0, yc, z + 0.03 + len + 0.0175], 'z', 32)
  k.around(4, r * 1.04, [0, yc, 0], 'z', (p) => {
    k.rod(SS, [p[0], p[1], z], [p[0], p[1], z + 0.065 + len + 0.012], 0.007, 8)
    k.hex(NUT, 0.02, 0.012, [p[0], p[1], z + 0.065 + len + 0.006], 'z')
  }, Math.PI / 4)
  const zt = z + 0.065 + len
  k.cyl(SS, 0.02, 0.1, [0, yc, zt + 0.05], 'z', 14)
  k.cyl('safetyGreen', 0.023, 0.025, [0, yc, zt + 0.03], 'z', 14)
  if (op.fusible) {
    // heat-sensitive lock-open device: collar, segmented lock, fusible plug, manual release lever
    k.cyl(SS, 0.045, 0.06, [0, yc, zt + 0.13], 'z', 20)
    k.cyl(HW, 0.047, 0.012, [0, yc, zt + 0.12], 'z', 20)
    k.around(4, 0.045, [0, yc, zt + 0.14], 'z', (q) => k.box(SS, [0.018, 0.018, 0.02], q), Math.PI / 4)
    k.cyl('brass', 0.012, 0.03, [0.055, yc, zt + 0.13], 'x', 10)
    k.box(HW, [0.012, 0.09, 0.012], [0, yc + 0.07, zt + 0.15])
  } else k.cyl(ACT, 0.03, 0.012, [0, yc, zt + 0.104], 'z', 14)
  const zp = z + 0.03 + len * 0.22
  k.cyl('brass', 0.012, 0.04, [r + 0.012, yc, zp], 'x', 10)
  k.hex('brass', 0.026, 0.016, [r + 0.036, yc, zp], 'x')
  k.cyl('nameplate', r * 1.002, 0.04, [0, yc, z + 0.03 + len * 0.62], 'z', 32)
  return [r + 0.046, yc, zp]
}

/** Angle choke geometry: inlet face distance along -X, outlet face distance along -Y, from the body centre. */
export function chokeDims(dIn: ApiFlange, dOut: ApiFlange) {
  const B = Math.max(dIn.od, dOut.od) * 0.78
  return { B, inlet: B / 2 + 0.05 + dIn.t + G, outlet: B / 2 + 0.09 + dOut.t + G }
}

export type ChokeOp = 'handwheel' | 'actuator' | 'positive'

/**
 * API 6A angle choke, body centre at the origin: inlet flange face at x = -inlet facing -X, outlet face at y = -outlet
 * facing -Y, bonnet / operator along +X. Returns the far end of the operator (x).
 */
export function angleChoke(k: Kit, dIn: ApiFlange, dOut: ApiFlange, op: ChokeOp, opening = 0.5): number {
  const { B, inlet, outlet } = chokeDims(dIn, dOut)
  // forged block body with inlet and outlet necks
  k.rbox(BODY, [B, B, B * 0.92], Math.min(0.03, B * 0.12), [0, 0, 0])
  const ri = dIn.bore * 0.0127
  const ro = dOut.bore * 0.0127
  k.at([0, 0, 0], '-x', () => {
    ring(k, BODY, dIn.od * 0.3, ri, B / 2 - 0.01, inlet - dIn.t - G + 0.002, 24)
    bore(k, ri, inlet - dIn.t - G, inlet - G)
  })
  k.at([0, 0, 0], '-y', () => {
    ring(k, BODY, dOut.od * 0.32, ro, B / 2 - 0.01, outlet - dOut.t - G + 0.002, 24)
    bore(k, ro, outlet - dOut.t - G, outlet - G)
  })
  // cage trim and seat seen down the bores
  k.disc('internalsSteel', ri * 1.02, [-B / 2 + 0.012, 0, 0], '-x', 24)
  k.disc('internalsSteel', ro * 1.02, [0, -B / 2 + 0.012, 0], '-y', 24)
  k.cyl('pipeBore', ri * 0.35, 0.004, [-B / 2 + 0.014, 0, 0], 'x', 16)
  k.at([-inlet, 0, 0], '-x', () => flangeAt(k, dIn, 0, -1))
  k.at([0, -outlet, 0], '-y', () => flangeAt(k, dOut, 0, -1))
  // wear sleeve body drain / bleed plug
  k.hex('brass', 0.022, 0.016, [0, B * 0.25, B * 0.46 + 0.008], 'z')
  // bonnet: hammer-nut with three lugs
  let x = B / 2
  const rn = B * 0.42
  k.cyl(BODY, rn * 0.9, 0.02, [x + 0.01, 0, 0], 'x', 24)
  x += 0.02
  k.cyl(BODY, rn, 0.07, [x + 0.035, 0, 0], 'x', 24)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    k.box(BODY, [0.06, B * 0.2, B * 0.13], [x + 0.035, Math.cos(a) * (rn + B * 0.08), Math.sin(a) * (rn + B * 0.08)], eul(-a, 0, 0))
  }
  x += 0.07
  if (op === 'positive') {
    // blanking cap over a fixed bean
    k.cyl(BODY, rn * 0.75, 0.05, [x + 0.025, 0, 0], 'x', 20)
    k.hex('brass', 0.03, 0.02, [x + 0.06, 0, 0], 'x')
    return x + 0.07
  }
  k.cyl(BODY, rn * 0.55, 0.1, [x + 0.05, 0, 0], 'x', 20)
  // stem lock (holds the setting when run as a fixed choke)
  k.rod(SS, [x + 0.05, rn * 0.5, 0], [x + 0.05, rn * 0.5 + 0.05, 0], 0.008, 8)
  k.rod(HW, [x + 0.05, rn * 0.5 + 0.05, -0.04], [x + 0.05, rn * 0.5 + 0.05, 0.04], 0.007, 8)
  x += 0.1
  // position indicator sleeve with brass scale ring; stem travel shown by the opening
  k.cyl(SS, rn * 0.4, 0.07, [x + 0.035, 0, 0], 'x', 18)
  k.cyl('brass', rn * 0.42, 0.012, [x + 0.02, 0, 0], 'x', 18)
  k.box('actuatorRed', [0.05, 0.004, 0.012], [x + 0.035, rn * 0.4 + 0.002, 0])
  x += 0.07
  if (op === 'actuator') {
    // electro-hydraulic stepping actuator
    k.cyl(BODY, rn * 0.35, 0.05, [x + 0.025, 0, 0], 'x', 14)
    x += 0.05
    k.rbox(ACT, [0.17, 0.2, 0.16], 0.02, [x + 0.085, 0, 0])
    k.cyl(ACT, 0.05, 0.14, [x + 0.085, 0.0, 0.13], 'z', 18)
    k.cyl(NUT, 0.052, 0.012, [x + 0.085, 0, 0.2], 'z', 18)
    k.box('nameplate', [0.05, 0.08, 0.002], [x + 0.09, 0, -0.081])
    k.hex('brass', 0.024, 0.02, [x + 0.05, 0.1 + 0.01, 0], 'y')
    return x + 0.17
  }
  const s = 0.02 + 0.06 * opening
  k.cyl(SS, 0.014, 0.06 + s, [x + (0.06 + s) / 2, 0, 0], 'x', 10)
  k.handwheel(HW, Math.max(0.25, B * 1.2), [x + 0.04 + s, 0, 0], 'x', 4)
  return x + 0.06 + s
}

/** Crossover: API flange (ring face at y = 0, body above) on a forged neck ending in a B16.5 weld-neck flange whose RF face is at y = L. */
export function crossover(k: Kit, d: ApiFlange, nps: number, rating: Rating, L: number) {
  flangeAt(k, d, 0, 1, 'flangeSteel')
  const rp = pipeOD(nps) / 2
  const y0 = G + d.t
  const fl = asmeFlange(k, nps, rating, [0, L, 0], 'y', true)
  flangeBore(k, nps, rating, [0, L, 0], 'y', '160')
  const yN = L - fl
  if (yN > y0) {
    k.lathe('flangeSteel', [[rp - pipeWall(nps, '160'), y0], [Math.max(rp * 1.3, d.od * 0.3), y0], [rp * 1.04, y0 + Math.min(0.05, (yN - y0) * 0.6)], [rp, yN + 0.002], [rp - pipeWall(nps, '160'), yN + 0.002]], [0, 0, 0], 'y', 28)
    k.torus('flangeSteel', rp + 0.0008, Math.max(0.0025, rp * 0.03), [0, yN, 0], 'y', 6, 28)
  }
}

/** Minimum crossover length so the API flange, a short neck and the B16.5 weld-neck all fit. */
export function crossoverLength(d: ApiFlange, nps: number, rating: Rating, neck = 0.06) {
  const f = flangeDims(nps, rating)
  return G + d.t + neck + f.hubLength + f.raisedFaceHeight
}

/** Plain flanged spacer spool between API faces 0 and L. */
export function spacer(k: Kit, d: ApiFlange, L: number, mat: MatKey = BODY) {
  flangeAt(k, d, 0, 1, mat)
  flangeAt(k, d, L, -1, mat)
  ring(k, mat, d.od * 0.3, d.bore * 0.0127, G + d.t - 0.002, L - G - d.t + 0.002, 24, false)
  bore(k, d.bore * 0.0127, G, L - G)
}

/** Flanged flow tee between faces 0 and L with an instrument branch (+Z) and needle valve. Returns the branch top (z). */
export function flowTee(k: Kit, d: ApiFlange, L: number) {
  spacer(k, d, L)
  const r = d.od * 0.3
  k.cyl(BODY, r * 0.55, r + 0.04, [0, L / 2, (r + 0.04) / 2], 'z', 16)
  const z = r + 0.04
  needleValve(k, [0, L / 2, z], 'z')
  return z + 0.105
}

/** 1/2" needle valve on a boss, axis along +axis from base, handle to the side. */
export function needleValve(k: Kit, base: V3, axis: 'y' | 'z' | 'x' | '-x', handle: MatKey = HW) {
  const v = axis === 'y' ? [0, 1, 0] : axis === 'z' ? [0, 0, 1] : axis === 'x' ? [1, 0, 0] : [-1, 0, 0]
  const p = (t: number): V3 => [base[0] + v[0] * t, base[1] + v[1] * t, base[2] + v[2] * t]
  k.hex(SS, 0.032, 0.02, p(0.01), axis)
  k.box(SS, [0.036, 0.036, 0.036], p(0.042))
  const side: V3 = axis === 'y' ? [1, 0, 0] : [0, 1, 0]
  const q = p(0.042)
  k.rod(SS, q, [q[0] + side[0] * 0.05, q[1] + side[1] * 0.05, q[2] + side[2] * 0.05], 0.006, 8)
  k.box(handle, axis === 'y' ? [0.012, 0.012, 0.06] : [0.06, 0.012, 0.012], [q[0] + side[0] * 0.055, q[1] + side[1] * 0.055, q[2] + side[2] * 0.055])
  k.rod(SS, p(0.06), p(0.105), 0.008, 8)
}

/** Exposed API ring-joint face at y = 0 (flange body below): machined face, ring groove, studs projecting out with nuts on the back. */
export function openFace(k: Kit, d: ApiFlange) {
  const rb = d.bore * 0.0127
  k.lathe('machined', [[d.ring / 2 + d.boltDia * 0.6, -G + 0.0008], [rb, -G + 0.0008]], [0, 0, 0], 'y', 32)
  k.torus('pipeBore', d.ring / 2, Math.max(0.003, d.boltDia * 0.16), [0, -G + 0.0008, 0], 'y', 6, 32)
  const len = d.t + nutH(d) * 2 + d.boltDia * 0.6
  k.boltCircle(STUD, NUT, d.bolts, d.boltCircle / 2, [0, -G - d.t - nutH(d) - d.boltDia * 0.3, 0], 'y', d.boltDia, len, [nutH(d) / 2])
}

export type BallOp = 'gear' | 'lever' | 'actuator'

/**
 * API 6D full-bore ball valve, flow along +Y between RF faces y = 0 (facing -Y) and y = Lv (facing +Y), operator on +Z.
 * Studs on the outlet face only (the inlet bolts to a studded flange). Returns the operator's far z.
 */
export function ballValve(k: Kit, nps: number, rating: Rating, Lv: number, op: BallOp = 'gear', open = true, studsIn = false, tag?: string) {
  const f = flangeDims(nps, rating)
  const D = pipeOD(nps)
  asmeFlange(k, nps, rating, [0, 0, 0], '-y', studsIn)
  asmeFlange(k, nps, rating, [0, Lv, 0], 'y', true)
  const fl = f.hubLength + f.raisedFaceHeight
  const Rb = Math.max(f.od * 0.5, D * 0.95)
  const rB = D / 2 - pipeWall(nps, '80')
  ring(k, 'valveBody', D * 0.6, rB, fl - 0.01, Lv - fl + 0.01, 28, false)
  hollowBall(k, 'valveBody', Rb, Math.min(1, (Lv - 2 * fl) / (2 * Rb) + 0.3), rB, Lv / 2)
  bore(k, rB, 0, Lv)
  flangeBore(k, nps, rating, [0, 0, 0], '-y')
  flangeBore(k, nps, rating, [0, Lv, 0], 'y')
  k.at([0, Lv / 2 - Rb * 0.3, 0], undefined, () => ring(k, 'valveBody', Rb * 1.02, D * 0.6, -f.boltDia * 0.7, f.boltDia * 0.7, 28, false))
  k.around(8, Rb * 0.94, [0, Lv / 2 - Rb * 0.3 + f.boltDia * 0.7, 0], 'y', (q) => k.hex(NUT, f.boltDia * 1.6, f.boltDia * 0.8, q, 'y'), Math.PI / 8)
  k.cyl('valveBody', Rb * 0.3, Rb * 0.3, [0, Lv / 2, -Rb * 0.92], 'z', 16)
  k.hex('brass', 0.02, 0.016, [Rb * 0.88, Lv / 2 + Rb * 0.2, 0], 'x')
  if (tag) tagPlate(k, tag, [-Rb * 0.5, Lv / 2, Rb * 0.6], 'z', Math.min(0.12, Rb * 0.8))
  const z0 = Rb * 0.85
  k.cyl('valveBody', Rb * 0.3, 0.06, [0, Lv / 2, z0 + 0.03], 'z', 18)
  k.cyl('valveBody', Rb * 0.4, 0.02, [0, Lv / 2, z0 + 0.07], 'z', 18)
  const zt = z0 + 0.08
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), open ? 0 : Math.PI / 2)
  if (op === 'lever') {
    k.cyl(SS, 0.012, 0.04, [0, Lv / 2, zt + 0.02], 'z', 10)
    const len = Math.max(0.2, 0.15 + 0.06 * nps)
    const a = open ? Math.PI / 2 : 0
    k.box(HW, [0.03, len, 0.012], [Math.cos(a) * len * 0.45, Lv / 2 + Math.sin(a) * len * 0.45, zt + 0.045], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2))
    return zt + 0.06
  }
  if (op === 'gear') {
    const gb = Math.max(0.12, D * 0.9)
    k.rbox('actuatorBlue', [gb * 1.1, gb * 0.9, gb * 0.6], gb * 0.06, [0, Lv / 2, zt + gb * 0.3])
    k.cyl('actuatorBlue', gb * 0.16, gb * 0.35, [gb * 0.75, Lv / 2, zt + gb * 0.3], 'x', 14)
    k.handwheel('handwheel', Math.max(0.25, gb * 2.2), [gb * 0.95, Lv / 2, zt + gb * 0.3], 'x', 5)
    k.box(open ? 'safetyGreen' : HW, [0.025, gb * 0.7, 0.012], [0, Lv / 2, zt + gb * 0.6 + 0.006], q)
    return zt + gb * 0.6
  }
  // scotch-yoke actuator with spring can (fail-close), hydraulic cylinder, limit-switch box
  const a = Math.max(0.18, D * 1.25)
  const ya = Lv / 2
  const za = zt + a * 0.4
  k.rbox('actuatorYellow', [a * 1.0, a * 0.9, a * 0.8], a * 0.06, [0, ya, za])
  k.cyl('actuatorYellow', a * 0.42, a * 1.9, [-a * 0.5 - a * 0.95, ya, za], 'x', 32)
  k.cyl('actuatorYellow', a * 0.46, a * 0.07, [-a * 0.5 - a * 1.9, ya, za], 'x', 32)
  k.cyl('actuatorYellow', a * 0.46, a * 0.07, [-a * 0.5 - 0.02, ya, za], 'x', 32)
  k.around(6, a * 0.44, [0, ya, za], 'x', (pp) => k.rod(SS, [-a * 0.5, pp[1], pp[2]], [-a * 0.5 - a * 1.95, pp[1], pp[2]], 0.008, 6))
  k.cyl('actuatorYellow', a * 0.26, a * 0.95, [a * 0.5 + a * 0.475, ya, za], 'x', 24)
  k.cyl('actuatorYellow', a * 0.29, a * 0.05, [a * 0.5 + a * 0.95, ya, za], 'x', 24)
  k.around(4, a * 0.27, [0, ya, za], 'x', (pp) => k.rod(SS, [a * 0.5, pp[1], pp[2]], [a * 0.5 + a * 0.98, pp[1], pp[2]], 0.006, 6), Math.PI / 4)
  k.rbox('stainless', [a * 0.45, a * 0.3, a * 0.28], 0.01, [0, ya, za + a * 0.4 + a * 0.14])
  k.cyl(open ? 'safetyGreen' : HW, a * 0.08, 0.03, [0, ya, za + a * 0.68 + 0.015], 'z', 14)
  k.rbox('stainless', [a * 0.35, a * 0.28, a * 0.22], 0.01, [a * 0.3, ya - a * 0.6, za])
  tubingRun(k, [[a * 0.3, ya - a * 0.6 - a * 0.14, za], [a * 0.3, ya - a * 0.75, za], [a * 0.9, ya - a * 0.75, za], [a * 0.9, ya, za - a * 0.2]])
  return za + a * 0.7
}

function tubingRun(k: Kit, pts: V3[]) {
  k.tube('tubing', pts, 0.005, 6, 0.03)
}
