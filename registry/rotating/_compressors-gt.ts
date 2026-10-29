// Gas turbine package parts: acoustic enclosure, inlet plenum and filter house, GT core, exhaust collector and stack, fuel train, CO₂ cabinet.
import * as THREE from 'three'
import { Kit, eul, mat4, uvScale, type MatKey, type V3 } from '../lib/kit'
import { flange, gauge, grating, handrail, ladder, member, ringPlatform } from '../lib/parts'
import { paint } from '../lib/materials'
import { meshGuardMaterial, signMaterial } from '../lib/textures'
import { pipeOD, type Rating } from '../lib/standards'
import { SKID, OIL, annulus, ballValve, beacon, clamp, controlValve, door, faceQ, gasDetector, hoods, lineRun, runToFlange } from './_compressors-kit'

export function gtMats() {
  return {
    GT: paint('#a4a9ad', { metalness: 0.72, roughness: 0.33, clearcoat: 0 }),
    HOT: paint('#7b6c5f', { metalness: 0.6, roughness: 0.55, clearcoat: 0 }),
    GEN: paint('#3d5d79', { metalness: 0.35, roughness: 0.45 }),
    STACK: paint('#8c9194', { metalness: 0.55, roughness: 0.5, clearcoat: 0 }),
    SOOT: paint('#262321', { metalness: 0.2, roughness: 0.95, clearcoat: 0 }),
    SOOT2: paint('#4b4744', { metalness: 0.35, roughness: 0.8, clearcoat: 0 }),
  }
}
export type GtMats = ReturnType<typeof gtMats>

export const CLAD: MatKey = 'cladding'
export const TRIM: MatKey = 'equipmentPaint'

// ------------------------------------------------------------------ enclosure

export interface EnclosureOpts {
  ex0: number
  ex1: number
  z0: number
  z1: number
  hs: number
  H: number
  /** door centres along X on the +Z and -Z walls */
  doorsPz: number[]
  doorsNz: number[]
  /** -X end door width (0 = none); double leaf above 1.3 m */
  endNx: number
  /** +X end door centre (wall coordinate = -z) and width, or null */
  endPx: [number, number] | null
  /** leave out the +Z wall to show the machinery */
  cutaway?: boolean
  /** swing the personnel doors open */
  open?: boolean
  /** internal maintenance monorail along X: [x0, x1] or null */
  monorail?: [number, number] | null
  t?: number
}

/** Acoustic enclosure: insulated wall panels cut around doors, cover battens, girts, sills, roof with seam cappings and padeyes. */
export function enclosure(k: Kit, o: EnclosureOpts) {
  const { ex0, ex1, z0, z1, hs, H } = o
  const t = o.t ?? 0.08
  const wallH = H - hs - 0.1
  const yw = hs + wallH / 2
  const EL = ex1 - ex0
  const encW = z1 - z0
  const exm = (ex0 + ex1) / 2
  const zm = (z0 + z1) / 2
  const dH = Math.min(2.1, wallH - 0.4)
  const yHead = hs + dH
  const holes = {
    pz: o.doorsPz.map((x) => [x, 0.9] as [number, number]),
    nz: o.doorsNz.map((x) => [x, 0.9] as [number, number]),
    nx: o.endNx > 0 ? ([[zm, o.endNx]] as [number, number][]) : [],
    px: o.endPx ? ([[zm - o.endPx[0], o.endPx[1]]] as [number, number][]) : [],
  }
  const solid = (a0: number, a1: number, hl: [number, number][], pad = 0) => {
    const out: [number, number][] = []
    let a = a0
    for (const [c, w] of [...hl].sort((p, q) => p[0] - q[0])) {
      if (c - w / 2 - pad > a) out.push([a, c - w / 2 - pad])
      a = Math.max(a, c + w / 2 + pad)
    }
    if (a1 > a) out.push([a, a1])
    return out
  }
  const inHole = (v: number, hl: [number, number][], pad: number) => hl.some(([c, w]) => Math.abs(v - c) < w / 2 + pad)
  const cut = !!o.cutaway
  const panelZ = (z: number, hl: [number, number][]) => {
    for (const [a, b] of solid(ex0, ex1, hl)) k.box(CLAD, [b - a, wallH, t], [(a + b) / 2, yw, z])
    for (const [c, w] of hl) k.box(CLAD, [w, hs + wallH - yHead, t], [c, (yHead + hs + wallH) / 2, z])
  }
  const panelX = (x: number, hl: [number, number][]) => {
    for (const [a, b] of solid(z0 + t, z1 - t, hl)) k.box(CLAD, [t, wallH, b - a], [x, yw, (a + b) / 2])
    for (const [c, w] of hl) k.box(CLAD, [t, hs + wallH - yHead, w], [x, (yHead + hs + wallH) / 2, c])
  }
  panelZ(z0 + t / 2, holes.nz)
  if (!cut) panelZ(z1 - t / 2, holes.pz)
  panelX(ex0 + t / 2, holes.nx)
  panelX(ex1 - t / 2, holes.px)
  k.box(CLAD, [EL + 0.12, 0.1, encW + 0.12], [exm, H - 0.05, zm])
  const zWalls = (cut ? [[z0, -1, holes.nz]] : [[z0, -1, holes.nz], [z1, 1, holes.pz]]) as [number, number, [number, number][]][]
  const nb = Math.max(4, Math.round(EL / 1.2))
  for (let i = 0; i <= nb; i++) {
    const x = ex0 + (i * EL) / nb
    for (const [z, s, hl] of zWalls) if (!inHole(x, hl, 0.12)) k.box(TRIM, [0.06, wallH, 0.018], [x, yw, z + s * 0.009])
    k.box(TRIM, [0.05, 0.03, encW + 0.1], [x, H + 0.015, zm])
  }
  const ne = Math.max(2, Math.round(encW / 1.2))
  for (let i = 1; i < ne; i++)
    for (const [x, s, hl] of [[ex0, -1, holes.nx], [ex1, 1, holes.px]] as const) {
      const z = z0 + (i * encW) / ne
      if (!inHole(z, hl, 0.12)) k.box(TRIM, [0.018, wallH, 0.06], [x + s * 0.009, yw, z])
    }
  const yGirt = hs + wallH * 0.52
  const girtCut = yGirt - 0.035 < yHead + 0.08
  for (const [z, s, hl] of zWalls) {
    for (const [a, b] of girtCut ? solid(ex0, ex1, hl, 0.1) : [[ex0, ex1] as [number, number]]) k.box(TRIM, [b - a, 0.07, 0.03], [(a + b) / 2, yGirt, z + s * 0.024])
    for (const [a, b] of solid(ex0 - 0.02, ex1 + 0.02, hl, 0.07)) k.box(SKID, [b - a, 0.14, 0.05], [(a + b) / 2, hs + 0.07, z + s * 0.02])
    k.box(TRIM, [EL + 0.12, 0.14, 0.04], [exm, H - 0.07, z + s * 0.08])
  }
  for (const [x, s, hl] of [[ex0, -1, holes.nx], [ex1, 1, holes.px]] as const) {
    for (const [a, b] of solid(z0 - 0.02, z1 + 0.02, hl, 0.07)) k.box(SKID, [0.05, 0.14, b - a], [x + s * 0.02, hs + 0.07, (a + b) / 2])
    k.box(TRIM, [0.04, 0.14, encW + 0.2], [x + s * 0.08, H - 0.07, zm])
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(TRIM, [0.1, wallH, 0.1], [sx > 0 ? ex1 - 0.04 : ex0 + 0.04, yw, sz > 0 ? z1 - 0.04 : z0 + 0.04])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p: V3 = [sx > 0 ? ex1 - 0.35 : ex0 + 0.35, H + 0.12, zm + sz * (encW / 2 - 0.3)]
      k.box('structSteel', [0.22, 0.2, 0.03], p)
      k.torus('nut', 0.05, 0.015, [p[0], p[1] + 0.03, p[2] + 0.02], 'z', 6, 14)
    }
  // doors with CO₂ warning beacons and manual call points
  const op = o.open ? 1.65 : 0
  if (!cut)
    for (const x of o.doorsPz) {
      k.at([x, hs, z1], faceQ('z'), () => door(k, 0.9, dH, 0, false, TRIM, SKID, op))
      k.rbox('actuatorRed', [0.12, 0.12, 0.05], 0.01, [x - 0.75, hs + 1.4, z1 + 0.03])
      beacon(k, [x + 0.7, hs + dH + 0.15, z1 + 0.08])
    }
  for (const x of o.doorsNz) {
    k.at([x, hs, z0], faceQ('-z'), () => door(k, 0.9, dH, 0, false, TRIM, SKID, op))
    k.rbox('actuatorRed', [0.12, 0.12, 0.05], 0.01, [x + 0.75, hs + 1.4, z0 - 0.03])
    beacon(k, [x - 0.7, hs + dH + 0.15, z0 - 0.08])
  }
  if (o.endNx > 0) k.at([ex0, hs, zm], faceQ('-x'), () => door(k, o.endNx, dH, 0, o.endNx >= 1.3, TRIM, SKID, op))
  if (o.endPx) k.at([ex1, hs, zm], faceQ('x'), () => door(k, o.endPx![1], dH, o.endPx![0], false, TRIM, SKID, op))
  // internal fire & gas: IR flame detectors in the upper corners, heat detectors on the ceiling
  for (const [x, z] of [[ex0 + 0.3, z0 + t + 0.15], [ex1 - 0.3, z1 - t - 0.15], [exm, z0 + t + 0.15]] as [number, number][]) {
    k.rbox('stainless', [0.12, 0.12, 0.1], 0.015, [x, H - 0.35, z])
    k.disc('glass', 0.035, [x + (x < exm ? 0.061 : -0.061), H - 0.35, z], x < exm ? 'x' : '-x', 14)
  }
  for (let x = ex0 + 1.5; x < ex1 - 0.5; x += 3) k.cyl('plasticGrey', 0.05, 0.05, [x, H - 0.125, zm + encW * 0.25], 'y', 12)
  // maintenance monorail with trolley and chain block under the roof
  if (o.monorail) {
    const [m0, m1] = o.monorail
    const yb = H - 0.1 - 0.15
    member(k, [m0, yb, zm], [m1, yb, zm], 'IPE 300', 'safetyYellow', [0, 1, 0])
    for (let x = m0 + 0.2; x < m1; x += 1.5) k.box('structSteel', [0.12, 0.06, 0.2], [x, H - 0.13, zm])
    const tx = m0 + (m1 - m0) * 0.3
    k.rbox('safetyYellow', [0.3, 0.12, 0.26], 0.02, [tx, yb - 0.21, zm])
    k.rbox('actuatorRed', [0.22, 0.25, 0.18], 0.03, [tx, yb - 0.4, zm])
    k.rod('nut', [tx, yb - 0.52, zm], [tx, yb - 0.9, zm], 0.008, 6)
    k.torus('nut', 0.04, 0.01, [tx, yb - 0.94, zm], 'z', 6, 12)
    k.plane(signMaterial('ler', 'SWL 5 t'), 0.3, 0.08, [tx + 0.5, yb, zm + 0.005])
  }
  return { dH, wallH }
}

// ------------------------------------------------------------------ inlet plenum, GT core, exhaust collector

/** Air-inlet plenum with bell-mouth, nose cone, struts and FOD screen, between x = a and x = b (air leaves at +X). */
export function inletPlenum(k: Kit, o: { a: number; b: number; ys: number; R: number; hs: number; top: number; W: number; M: GtMats }) {
  const { a, b, ys, R, hs, top, W, M } = o
  const L = b - a
  const xp = (a + b) / 2
  k.box(TRIM, [0.05, top - hs, W], [a + 0.025, (top + hs) / 2, 0])
  for (const s of [-1, 1]) k.box(TRIM, [L, top - hs, 0.05], [xp, (top + hs) / 2, s * (W / 2 - 0.025)])
  const sh = new THREE.Shape()
  sh.moveTo(-W / 2, hs)
  sh.lineTo(W / 2, hs)
  sh.lineTo(W / 2, top)
  sh.lineTo(-W / 2, top)
  sh.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, ys, 0.84 * R, 0, Math.PI * 2, true)
  sh.holes.push(hole)
  k.extrude(TRIM, sh, 0.05, new THREE.Matrix4().compose(new THREE.Vector3(b - 0.05, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1)), 32)
  const bL = Math.min(L * 0.6, 0.9 * R)
  const ri = 0.8 * R
  const rl = Math.max(ri * 1.1, Math.min(1.3 * R, W / 2 - 0.1, top - ys - 0.1))
  k.lathe(M.GT, [
    [ri, bL],
    [ri * 1.03, bL * 0.6],
    [(ri + rl) / 2, bL * 0.25],
    [rl, bL * 0.06],
    [rl + 0.03, 0],
    [rl + 0.07, 0.02],
    [rl + 0.05, bL * 0.12],
    [(ri + rl) / 2 + 0.05, bL * 0.3],
    [ri * 1.03 + 0.04, bL * 0.62],
    [ri + 0.04, bL],
  ], [b - bL, ys, 0], 'x', 48)
  k.dome(M.GT, 0.35 * R, [b - bL * 0.2, ys, 0], '-x', Math.PI / 2, 1.6, 28)
  k.cyl(M.GT, 0.35 * R, bL * 0.25, [b - bL * 0.1, ys, 0], 'x', 28)
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2
    k.box(M.GT, [bL * 0.3, ri * 0.66, 0.02], [b - bL * 0.15, ys + Math.sin(t) * ri * 0.66, Math.cos(t) * ri * 0.66], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -t + Math.PI / 2))
  }
  k.cyl('stainless', 0.08, L, [xp, ys, 0], 'x', 16)
  const fodR = rl + 0.08
  const fodL = Math.max(0.15, L - bL - 0.1)
  const g = new THREE.CylinderGeometry(fodR, fodR, fodL, 40, 1, true)
  uvScale(g, (2 * Math.PI * fodR) / 0.25, fodL / 0.25)
  k.add(meshGuardMaterial('#b4b9bd'), g, mat4([a + 0.05 + fodL / 2, ys, 0], 'x'))
}

/** Gas turbine core from xc0 to xc0 + Lc on shaft height ys: compressor casing with VSV rings, combustor with dual-fuel manifolds, turbine, supports. */
export function gtCore(k: Kit, o: { xc0: number; Lc: number; ys: number; R: number; hs: number; MW: number; xBleed: number; M: GtMats }) {
  const { xc0, Lc, ys, R, hs, MW, M } = o
  const prof = (u: number) => {
    if (u <= 0.4) return R * (0.8 - (0.2 * u) / 0.4)
    if (u <= 0.43) return R * (0.6 + (0.14 * (u - 0.4)) / 0.03)
    if (u <= 0.56) return R * 0.74
    if (u <= 0.6) return R * (0.74 - (0.1 * (u - 0.56)) / 0.04)
    if (u <= 0.68) return R * (0.64 + (0.04 * (u - 0.6)) / 0.08)
    if (u <= 0.72) return R * (0.68 + (0.12 * (u - 0.68)) / 0.04)
    if (u <= 0.97) return R * (0.8 + (0.12 * (u - 0.72)) / 0.25)
    return R * 0.92
  }
  const xu = (u: number) => xc0 + u * Lc
  const lathe = (mat: MatKey, u0: number, u1: number, steps: number[]) => {
    const pts: [number, number][] = [[0, 0]]
    for (const u of [u0, ...steps.filter((s) => s > u0 && s < u1), u1]) pts.push([prof(u), (u - u0) * Lc])
    pts.push([0, (u1 - u0) * Lc])
    k.lathe(mat, pts, [xu(u0), ys, 0], 'x', 48)
  }
  lathe(M.GT, 0, 0.4, [0.2])
  lathe(M.HOT, 0.4, 1, [0.4, 0.43, 0.56, 0.6, 0.68, 0.72, 0.97])
  // casing split flanges with bolting
  for (const [u, mat, nb] of [[0.005, M.GT, 24], [0.2, M.GT, 20], [0.4, M.HOT, 20], [0.56, M.HOT, 20], [0.68, M.HOT, 22], [0.72, M.HOT, 26], [0.995, M.HOT, 26]] as [number, MatKey, number][]) {
    const r = prof(Math.min(u, 0.999)) + (u < 0.01 ? 0.1 * R : 0.04)
    k.cyl(mat, r, 0.05, [xu(u), ys, 0], 'x', 48)
    k.boltCircle('boltXylan', 'nut', nb, r - 0.02, [xu(u) - 0.045, ys, 0], 'x', 0.016, 0.09, [0.078])
  }
  // variable stator vane rings, levers and actuator
  for (const u of [0.05, 0.09, 0.13]) {
    k.torus('stainless', prof(u) + 0.06, 0.012, [xu(u), ys, 0], 'x', 6, 48)
    k.around(20, prof(u) + 0.02, [xu(u) - 0.025, ys, 0], 'x', (p) => k.box('stainless', [0.06, 0.012, 0.012], p))
  }
  k.cyl('actuatorYellow', 0.04, Lc * 0.12, [xu(0.12), ys + 0.1 * R, prof(0.1) + 0.12], 'x', 12)
  k.rod('stainless', [xu(0.05), ys + 0.1 * R, prof(0.05) + 0.07], [xu(0.13), ys + 0.1 * R, prof(0.05) + 0.12], 0.012, 6)
  // accessory gearbox and starter under the compressor
  k.rbox(M.GT, [Lc * 0.15, 0.25 * R, 0.6 * R], 0.03, [xu(0.12), ys - 0.94 * R, 0])
  k.cyl(M.GT, 0.12 * R, Lc * 0.08, [xu(0.12) - Lc * 0.1, ys - 0.9 * R, 0], 'x', 16)
  k.rod(M.GT, [xu(0.12), ys - 0.82 * R, 0], [xu(0.12), ys - 0.72 * R, 0], 0.08 * R, 12)
  // compressor bleed lines with bleed valves to the exhaust
  for (const s of [-1, 1]) {
    const a = s * 0.6
    const rb = prof(0.3)
    const zb = Math.sin(a) * rb
    const yb = ys + Math.cos(a) * rb
    const yt = ys + 0.95 * R + (s > 0 ? 0 : 0.12)
    const bn = R > 0.7 ? 4 : 3
    lineRun(k, [[xu(0.3), yb, zb], [xu(0.3), yt, zb], [o.xBleed, yt, zb]], bn, M.GT)
    k.cyl(M.GT, pipeOD(bn) * 0.8, 0.06, [xu(0.3), yb + 0.02, zb], 'y', 16)
    const xv = xu(0.62)
    k.sphere('valveBody', pipeOD(bn) * 1.05, [xv, yt, zb], undefined, 14)
    k.rbox('actuatorYellow', [0.12, 0.14, 0.12], 0.02, [xv, yt + pipeOD(bn) + 0.08, zb])
  }
  // combustor: gas and liquid fuel manifold rings, pigtails to the burners, igniters
  const xcomb = xc0 + 0.48 * Lc
  const rcomb = prof(0.5)
  const rr = rcomb + 0.16
  const xL = xcomb + Math.max(0.12, 0.05 * Lc)
  k.torus('stainless', rr, pipeOD(2) / 2, [xcomb, ys, 0], 'x', 10, 64)
  k.torus('stainless', rr - 0.02, pipeOD(1) / 2, [xL, ys, 0], 'x', 8, 64)
  const nN = clamp(Math.round(8 + MW * 0.4), 10, 24)
  for (let i = 0; i < nN; i++) {
    const a = ((i + 0.5) / nN) * Math.PI * 2
    const c = Math.cos(a)
    const sn = Math.sin(a)
    const xn = (xcomb + xL) / 2
    k.cyl(M.HOT, 0.035, 0.08, [xn, ys + c * (rcomb + 0.03), sn * (rcomb + 0.03)], [0, c, sn], 10)
    const head: V3 = [xn, ys + c * (rcomb + 0.075), sn * (rcomb + 0.075)]
    const g1: V3 = [xcomb, ys + c * (rr - 0.05), sn * (rr - 0.05)]
    const g2: V3 = [xL, ys + c * (rr - 0.06), sn * (rr - 0.06)]
    k.rod('tubing', [xcomb, ys + c * rr, sn * rr], g1, 0.01, 5)
    k.rod('tubing', g1, head, 0.01, 5)
    k.rod('tubing', [xL, ys + c * (rr - 0.02), sn * (rr - 0.02)], g2, 0.008, 5)
    k.rod('tubing', g2, head, 0.008, 5)
  }
  for (const s of [-1, 1]) {
    const p: V3 = [xu(0.52), ys - 0.5 * R, s * 0.55 * R]
    k.rod('stainless', p, [p[0], p[1] - 0.15, p[2] * 1.25], 0.02, 8)
    k.spline('cable', [[p[0], p[1] - 0.15, p[2] * 1.25], [p[0] + 0.2, hs + 0.3, p[2] * 1.3], [p[0] + 0.5, hs + 0.05, p[2] * 1.3]], 0.012, 6, 16)
  }
  // EGT thermocouple harness
  k.torus('tubing', prof(0.75) + 0.06, 0.008, [xu(0.75), ys, 0], 'x', 6, 48)
  k.around(12, prof(0.75) + 0.03, [xu(0.75), ys, 0], 'x', (p) => k.cyl('stainless', 0.012, 0.07, p, 'x', 6))
  // trunnion supports on a sub-base
  for (const s of [-1, 1]) {
    k.box(SKID, [0.14, ys - 0.62 * R - hs - 0.08, 0.14], [xu(0.06), (ys - 0.62 * R + hs + 0.08) / 2, s * 0.45 * R])
    k.box(SKID, [0.16, ys - 0.7 * R - hs - 0.08, 0.16], [xu(0.8), (ys - 0.7 * R + hs + 0.08) / 2, s * 0.55 * R])
  }
  k.box(SKID, [0.25, 0.04, 1.2 * R], [xu(0.06), ys - 0.62 * R, 0])
  k.box(SKID, [0.28, 0.04, 1.4 * R], [xu(0.8), ys - 0.7 * R, 0])
  k.box(SKID, [Lc * 0.9, 0.08, 1.4 * R], [xu(0.45), hs + 0.04, 0])
  return { prof, xu, xcomb, xL, rr }
}

/** Insulated exhaust collector around x = xst with the vertical duct up through the roof to y = H + 0.3. */
export function exhaustCollector(k: Kit, o: { xst: number; ys: number; R: number; cHL: number; cW: number; Rd: number; hs: number; H: number; rExit: number; M: GtMats }) {
  const { xst, ys, R, cHL, cW, Rd, hs, H, M } = o
  const colTop = ys + 1.3 * R
  k.rbox('insulation', [2 * cHL, 2.6 * R, 2 * cW], 0.12, [xst, ys, 0])
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.box('insulation', [0.03, 2.6 * R, 0.03], [xst - cHL * 0.6 + i * cHL * 0.6, ys, s * (cW + 0.012)])
  k.cyl('insulation', Rd, H + 0.3 - colTop, [xst, (H + 0.3 + colTop) / 2, 0], 'y', 48)
  for (let y = colTop + 0.6; y < H - 0.2; y += 0.8) k.cyl('insulation', Rd + 0.012, 0.03, [xst, y, 0], 'y', 48)
  k.cyl(M.HOT, o.rExit, 0.5 * cHL, [xst - cHL - 0.25 * cHL + 0.5 * cHL, ys, 0], 'x', 40, o.rExit * 1.05)
  for (const s of [-1, 1]) k.box(SKID, [0.2, ys - 1.3 * R - hs, 2 * cW * 0.8], [xst + s * cHL * 0.6, (ys - 1.3 * R + hs) / 2, 0])
  return colTop
}

// ------------------------------------------------------------------ roof: filter house, exhaust stack

export interface FilterHouseOpts {
  xp: number
  /** inlet duct length (X) and width (Z) */
  dL: number
  dW: number
  H: number
  dHt: number
  FL: number
  FW: number
  FH: number
  /** filter house centre x when offset from the duct (default xp) */
  xh?: number
  /** access platform and ladder at the house door (needs ~1 m clear at +X) */
  platform?: boolean
  /** half width of the roof the house stands on (keeps posts on the roof) */
  roofHalfW?: number
}

/** Inlet silencer duct and multi-stage filter house on legs: weather hoods on three faces, access door and dP gauges on the fourth. */
export function filterHouse(k: Kit, o: FilterHouseOpts) {
  const { xp, dL, dW, H, dHt, FL, FW, FH } = o
  const xh = o.xh ?? xp
  const fy0 = H + dHt
  const fy1 = fy0 + FH
  k.box(TRIM, [dL, dHt, dW], [xp, H + dHt / 2, 0])
  for (const s of [-1, 1]) k.box(TRIM, [dL + 0.08, 0.08, dW + 0.08], [xp, H + dHt / 2 + s * dHt * 0.3, 0])
  k.box(TRIM, [FL, 0.08, FW], [xh, fy0 + 0.04, 0])
  k.box(TRIM, [FL + 0.1, 0.1, FW + 0.1], [xh, fy1 - 0.05, 0])
  for (const s of [-1, 1]) {
    k.box(TRIM, [FL, FH, 0.04], [xh, (fy0 + fy1) / 2, s * (FW / 2 - 0.02)])
    k.box(TRIM, [0.04, FH, FW], [xh + s * (FL / 2 - 0.02), (fy0 + fy1) / 2, 0])
  }
  // seams on the roof of the house
  for (let i = 1; i < Math.round(FL / 1.2); i++) k.box(TRIM, [0.05, 0.03, FW + 0.1], [xh - FL / 2 + (i * FL) / Math.round(FL / 1.2), fy1 + 0.015, 0])
  // inlet faces: weather hoods over a bird screen, then vane separator and coalescer / pre-filter stage, then the final filter cartridges
  const media = paint('#ddd6c3', { metalness: 0, roughness: 0.9, clearcoat: 0 })
  const vane: MatKey = 'galvanised'
  const stages = (w: number, h: number) => {
    for (let x = -w / 2 + 0.03; x < w / 2; x += 0.06) k.box(vane, [0.006, h, 0.1], [x, h / 2 + 0.17, -0.09], eul(0, 0.5, 0))
    const n = Math.max(2, Math.floor(w / 0.62))
    const m = Math.max(2, Math.floor(h / 0.62))
    const cw = w / n
    const ch = h / m
    for (let i = 0; i <= n; i++) k.box('internalsSteel', [0.04, h, 0.05], [-w / 2 + i * cw, h / 2 + 0.17, -0.3])
    for (let j = 0; j <= m; j++) k.box('internalsSteel', [w, 0.04, 0.05], [0, 0.17 + j * ch, -0.3])
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        const cx = -w / 2 + (i + 0.5) * cw
        const cy = 0.17 + (j + 0.5) * ch
        k.box(media, [cw - 0.06, ch - 0.06, 0.04], [cx, cy, -0.3])
        // final-stage cartridge pair behind each cell
        for (const s of [-1, 1]) k.cyl(media, Math.min(cw, ch) * 0.17, 0.5, [cx + s * cw * 0.22, cy, -0.6], 'z', 16)
      }
  }
  const faces: [V3, 'z' | '-z' | '-x', number][] = [[[xh, fy0, FW / 2], 'z', FL - 0.25], [[xh, fy0, -FW / 2], '-z', FL - 0.25], [[xh - FL / 2, fy0, 0], '-x', FW - 0.25]]
  for (const [o, f, w] of faces)
    k.at(o, faceQ(f), () => {
      hoods(k, w, FH - 0.35, 0, FH / 2, TRIM)
      stages(Math.min(w, (f === '-x' ? FW : FL) - 1.4), FH - 0.45)
      // anti-icing hot-air manifold along the foot of the hoods, with nozzles up into the inlet
      k.rod('stainless', [-w / 2, 0.12, 0.3], [w / 2, 0.12, 0.3], pipeOD(3) / 2, 12)
      for (let x = -w / 2 + 0.3; x < w / 2; x += 0.5) k.rod('stainless', [x, 0.12, 0.3], [x, 0.24, 0.24], 0.012, 6)
      for (const sx of [-1, 1]) k.box('structSteel', [0.04, 0.12, 0.3], [sx * (w / 2 - 0.05), 0.06, 0.15])
    })
  k.at([xh + FL / 2, fy0, 0], faceQ('x'), () => {
    const fdH = Math.min(1.8, FH - 0.3)
    door(k, 0.7, fdH, FW / 2 - 0.6, false, TRIM)
    k.rbox('stainless', [0.5, 0.6, 0.12], 0.02, [-FW / 2 + 0.6, FH * 0.55, 0.06])
    for (let i = 0; i < 3; i++) gauge(k, [-FW / 2 + 0.45 + i * 0.15, FH * 0.55 + 0.12, 0.15], 'z', 0.09, 'bar', 10)
    k.plane(signMaterial('ler', 'AIR INLET FILTER'), Math.min(1.2, FW * 0.4), 0.22, [0, FH - 0.3, 0.005])
  })
  gasDetector(k, [xh + FL / 2 + 0.12, fy0 + 0.4, -FW / 2 + 0.3])
  // access platform at the house door, ladder down to the roof
  if (o.platform !== false) {
    const pd = 0.9
    const pw = 1.4
    const rh = o.roofHalfW ?? FW / 2
    const pz = Math.max(-(FW / 2 - 0.6), -rh + 0.1 + pw / 2)
    const px = xh + FL / 2 + pd / 2 + 0.02
    grating(k, [px, fy0, pz], pd, pw)
    handrail(k, [[px - pd / 2, fy0, pz - pw / 2], [px + pd / 2, fy0, pz - pw / 2], [px + pd / 2, fy0, pz + pw / 2 - 0.6]])
    handrail(k, [[px - pd / 2, fy0, pz + pw / 2], [px + pd / 2 - 0.55, fy0, pz + pw / 2]])
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box('structSteel', [0.08, fy0 - H - 0.03, 0.08], [px + dx * (pd / 2 - 0.04), (fy0 - 0.03 + H) / 2, pz + dz * (pw / 2 - 0.04)])
    ladder(k, [px + pd / 2 - 0.3, H, pz + pw / 2 + 0.05], fy0, [0, 0, 1], { cage: false })
  }
  // anti-icing supply riser from the roof (compressor bleed air) to the manifolds
  const az = Math.min(FW / 2, o.roofHalfW ?? FW / 2) - 0.25
  k.rod('stainless', [xh + FL / 2 - 0.3, H, az], [xh + FL / 2 - 0.3, fy0, az], pipeOD(3) / 2, 12)
  k.cyl('flangeSteel', pipeOD(3) * 0.9, 0.03, [xh + FL / 2 - 0.3, fy0 - 0.015, az], 'y', 16)
  k.sphere('valveBody', pipeOD(3) * 0.9, [xh + FL / 2 - 0.3, H + dHt * 0.45, az], undefined, 14)
  k.rbox('actuatorYellow', [0.16, 0.14, 0.14], 0.02, [xh + FL / 2 - 0.3, H + dHt * 0.45, az - 0.16])
  const lz = Math.min(FW / 2 - 0.1, dW / 2 + 0.25, (o.roofHalfW ?? FW / 2) - 0.2)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const lx = xh + sx * (FL / 2 - 0.12)
      k.box('structSteel', [0.12, dHt, 0.12], [lx, H + dHt / 2, sz * lz])
      k.box('structSteel', [0.24, 0.02, 0.24], [lx, H + 0.01, sz * lz])
      k.rod('structSteel', [lx, H + 0.1, sz * lz], [lx - sx * Math.min(0.5, FL * 0.15), fy0 - 0.02, sz * lz], 0.03, 8)
    }
}

/** Exhaust stack on the roof at xst: fabric expansion joint, silencer, flanged stack sections, sampling platform with caged ladder, rain cap, aviation light. */
export function exhaustStack(k: Kit, o: { xst: number; H: number; Rd: number; Rs: number; Rsil: number; stackH: number; legR: number; M: GtMats }) {
  const { xst, H, Rd, Rs, Rsil, M } = o
  const stackH = Math.max(o.stackH, 3)
  const yE0 = H + 0.25
  const yE1 = H + 0.65
  const cone1 = Math.max(0.3, (Rsil - Rd) * 0.8)
  const cone2 = Math.max(0.3, (Rsil - Rs) * 0.9)
  let silH = clamp(stackH * 0.3, 1.2, 5)
  silH = Math.max(0.8, Math.min(silH, stackH - 0.65 - cone1 - cone2 - 1.0))
  const ySil0 = yE1 + cone1
  const ySil1 = ySil0 + silH
  const yS0 = ySil1 + cone2
  const yTop = Math.max(H + stackH, yS0 + 2.4)
  const sootH = clamp(0.06 * stackH, 0.35, 1.0)
  k.cyl(M.STACK, Rd, yE0 - H, [xst, (H + yE0) / 2, 0], 'y', 48)
  for (const y of [yE0, yE1]) k.cyl(M.STACK, Rd + 0.08, 0.05, [xst, y, 0], 'y', 48)
  k.lathe('rubberBlack', [[Rd + 0.01, yE0], [Rd + 0.07, yE0 + 0.12], [Rd + 0.1, (yE0 + yE1) / 2], [Rd + 0.07, yE1 - 0.12], [Rd + 0.01, yE1]], [xst, 0, 0], 'y', 48)
  k.lathe(M.STACK, [[0, yE1], [Rd, yE1], [Rsil, ySil0], [Rsil, ySil1], [Rs, yS0], [Rs, yTop - sootH * 2.2]], [xst, 0, 0], 'y', 48)
  k.lathe(M.SOOT2, [[Rs, yTop - sootH * 2.2], [Rs, yTop - sootH]], [xst, 0, 0], 'y', 48)
  k.lathe(M.SOOT, [[Rs, yTop - sootH], [Rs, yTop], [Rs + 0.05, yTop], [Rs + 0.05, yTop + 0.04], [Rs - 0.012, yTop + 0.04], [Rs - 0.012, yTop - 2.0]], [xst, 0, 0], 'y', 48)
  k.disc(M.SOOT, Rs, [xst, yTop - 1.9, 0], 'y', 40)
  const flg = (y: number, r: number, n: number) => {
    k.cyl(M.STACK, r + 0.07, 0.06, [xst, y, 0], 'y', 48)
    k.boltCircle('boltXylan', 'nut', n, r + 0.04, [xst, y - 0.06, 0], 'y', 0.018, 0.12, [0.108])
  }
  flg(ySil0, Rsil, 28)
  flg(ySil1, Rsil, 28)
  flg(yS0, Rs, 20)
  const nSec = Math.max(1, Math.round((yTop - yS0) / 3.2))
  for (let i = 1; i < nSec; i++) flg(yS0 + (i * (yTop - yS0)) / nSec, Rs, 20)
  for (let i = 1; i < 4; i++) k.cyl(M.STACK, Rsil + 0.025, 0.08, [xst, ySil0 + (i * silH) / 4, 0], 'y', 48)
  // silencer support legs on the roof
  const lr = o.legR
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const p: V3 = [xst + Math.cos(a) * lr, H, Math.sin(a) * lr]
    k.box('structSteel', [0.16, ySil0 - H, 0.16], [p[0], (H + ySil0) / 2, p[2]])
    k.box('structSteel', [0.3, 0.03, 0.3], [p[0], H + 0.015, p[2]])
  }
  k.torus('structSteel', lr, 0.05, [xst, ySil0 - 0.08, 0], 'y', 6, 40)
  // sampling platform, gap towards -X for the ladder
  const pw = Math.max(0.85, Rsil + 0.55 - Rs)
  const yP = clamp(ySil1 + 1.2, yS0 + 0.3, yTop - 1.6)
  const gap = 0.5
  k.at([xst, 0, 0], undefined, () => ringPlatform(k, yP, Rs + 0.02, pw, -Math.PI + gap, Math.PI - gap))
  ladder(k, [xst - Rsil - 0.3, H, 0], yP, [-1, 0, 0], { cage: true })
  // ladder stand-offs to the silencer
  for (let y = H + 1.2; y < yP - 0.2; y += 1.8) k.rod('structSteel', [xst - Rsil - 0.3, y, 0], [xst - Rsil + 0.01, y, 0], 0.025, 8)
  for (const a of [Math.PI / 2, -Math.PI / 2, 0]) {
    const d: V3 = [Math.cos(a), 0, Math.sin(a)]
    const ysp = Math.min(yP + 1.2, yTop - 0.4)
    k.rod(M.STACK, [xst + d[0] * (Rs - 0.02), ysp, d[2] * (Rs - 0.02)], [xst + d[0] * (Rs + 0.16), ysp, d[2] * (Rs + 0.16)], pipeOD(4) / 2, 16)
    flange(k, 4, 150, [xst + d[0] * (Rs + 0.24), ysp, d[2] * (Rs + 0.24)], d, true)
    k.cyl('flangeSteel', 0.115, 0.025, [xst + d[0] * (Rs + 0.253), ysp, d[2] * (Rs + 0.253)], d, 24)
  }
  const capY = yTop + 0.45 * Rs
  k.cyl(M.SOOT, Rs * 1.15, 0.35 * Rs, [xst, capY + 0.175 * Rs, 0], 'y', 40, 0.06)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    k.rod(M.SOOT, [xst + Math.cos(a) * (Rs + 0.03), yTop - 0.3, Math.sin(a) * (Rs + 0.03)], [xst + Math.cos(a) * Rs * 1.05, capY, Math.sin(a) * Rs * 1.05], 0.03, 6)
  }
  k.box('structSteel', [0.06, 0.06, 0.35], [xst, yTop - 0.6, Rs + 0.17])
  k.cyl('actuatorRed', 0.06, 0.12, [xst, yTop - 0.51, Rs + 0.3], 'y', 14)
  k.dome('glass', 0.06, [xst, yTop - 0.45, Rs + 0.3], 'y', Math.PI / 2, 1.3, 14)
  return yTop
}

// ------------------------------------------------------------------ fuel, fire suppression

export interface FuelTrainOpts {
  /** gas inlet flange x, liquid inlet flange x (null = gas only) */
  xGas: number
  xLiq: number | null
  y: number
  /** flange face z (on the -Z side) */
  faceZ: number
  gasNps: number
  rating: Rating
  /** wall penetration x, enclosure -Z wall, apron centre z, apron width */
  xpen: number
  z0: number
  zA: number
  m: number
  hs: number
}

/** Fuel gas conditioning (coalescing filter, double block-and-bleed ESDVs, metering valve) and liquid fuel duplex filter, on the -Z apron. */
export function fuelTrain(k: Kit, o: FuelTrainOpts) {
  const { xGas: x1, y: yG, faceZ, gasNps, rating, xpen, z0, zA, m, hs } = o
  const yL = Math.max(yG + 1.0, 1.85)
  k.box(SKID, [xpen + 0.25 - Math.min(x1, o.xLiq ?? x1) + 0.35, 0.1, m - 0.08], [(xpen + 0.25 + Math.min(x1, o.xLiq ?? x1) - 0.35) / 2, hs + 0.05, zA])
  runToFlange(k, [[xpen, yG, z0 + 0.01], [xpen, yG, zA], [x1, yG, zA]], [x1, yG, faceZ], [0, 0, -1], gasNps, rating)
  const gs = xpen - x1
  const rf = clamp(pipeOD(gasNps) * 1.6, 0.12, m / 2 - 0.05)
  const xf = x1 + gs * 0.2
  const fy0 = hs + 0.18
  const fy1 = yG + 0.75
  k.cyl('equipmentPaint', rf, fy1 - fy0, [xf, (fy0 + fy1) / 2, zA], 'y', 28)
  k.dome('equipmentPaint', rf, [xf, fy1, zA], 'y', Math.PI / 2, 0.5, 24)
  k.cyl('flangeSteel', rf + 0.04, 0.05, [xf, fy1 - 0.1, zA], 'y', 28)
  k.around(12, rf + 0.02, [xf, fy1 - 0.07, zA], 'y', (p) => k.hex('nut', 0.025, 0.015, p))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    k.rod(SKID, [xf + Math.cos(a) * rf * 0.8, hs + 0.1, zA + Math.sin(a) * rf * 0.8], [xf + Math.cos(a) * rf * 0.8, fy0 + 0.05, zA + Math.sin(a) * rf * 0.8], 0.025, 6)
  }
  gauge(k, [xf, yG + 0.35, zA - rf - 0.04], '-z', 0.09, 'bar', 40)
  ballValve(k, x1 + gs * 0.42, yG, zA, gasNps, rating)
  const xvn = x1 + gs * 0.56
  annulus(k, 'pipePaint', pipeOD(1) / 2, pipeOD(1) * 0.75, 0.03, [xvn, yG + pipeOD(gasNps) / 2 + 0.015, zA], 'y', 14)
  k.rod('pipePaint', [xvn, yG + pipeOD(gasNps) / 2 + 0.001, zA], [xvn, yG + 0.45, zA], pipeOD(1) / 2, 10)
  k.sphere('valveBody', 0.045, [xvn, yG + 0.25, zA], undefined, 12)
  k.rbox('actuatorYellow', [0.1, 0.1, 0.1], 0.015, [xvn, yG + 0.25, zA - 0.11])
  k.dome('pipePaint', pipeOD(1) / 2, [xvn, yG + 0.45, zA], 'y', Math.PI / 2, 0.5, 10)
  ballValve(k, x1 + gs * 0.68, yG, zA, gasNps, rating)
  controlValve(k, x1 + gs * 0.86, yG, zA, gasNps, rating)
  for (const xs of [x1 + gs * 0.3, x1 + gs * 0.78]) {
    k.rod('structSteel', [xs, hs + 0.1, zA], [xs, yG - pipeOD(gasNps) / 2 - 0.02, zA], 0.03, 8)
    k.box('structSteel', [0.12, 0.02, 0.14], [xs, yG - pipeOD(gasNps) / 2 - 0.01, zA])
  }
  k.box(TRIM, [0.3, 0.3, 0.02], [xpen, yG, z0 - 0.005])
  if (o.xLiq !== null) {
    const x2 = o.xLiq
    const xr = Math.max(x2 + 0.4, x1 - 0.28)
    runToFlange(k, [[xpen, yL, z0 + 0.01], [xpen, yL, zA], [xr, yL, zA], [xr, yG, zA], [x2, yG, zA]], [x2, yG, faceZ], [0, 0, -1], 2, 150)
    const ls = xr - x2
    const xdf = x2 + ls * 0.35
    for (const s of [-1, 1]) {
      k.cyl(OIL, 0.065, yG + 0.12 - (hs + 0.12), [xdf + s * 0.09, (yG + 0.12 + hs + 0.12) / 2, zA - 0.12], 'y', 18)
      k.cyl(OIL, 0.075, 0.03, [xdf + s * 0.09, yG + 0.12, zA - 0.12], 'y', 18)
      k.rod(OIL, [xdf + s * 0.09, yG, zA - 0.12], [xdf + s * 0.09, yG, zA], 0.025, 8)
    }
    k.rod('handwheel', [xdf, yG + 0.06, zA - 0.12], [xdf, yG + 0.24, zA - 0.12], 0.012, 6)
    k.box('handwheel', [0.22, 0.02, 0.02], [xdf, yG + 0.24, zA - 0.12])
    ballValve(k, x2 + ls * 0.75, yG, zA, 2, 150)
    k.rod('structSteel', [xr, hs + 0.1, zA + 0.1], [xr, yL, zA + 0.1], 0.025, 8)
    k.box(TRIM, [0.3, 0.3, 0.02], [xpen, yL, z0 - 0.005])
  }
  const gx0 = Math.min(x1, o.xLiq ?? x1) - 0.2
  k.rod('structSteel', [gx0, hs + 0.1, zA - 0.15], [gx0, 2.4, zA - 0.15], 0.025, 8)
  gasDetector(k, [gx0, 2.3, zA - 0.08])
  return { yL }
}

/** CO₂ fire-suppression cylinder cabinet against the -Z wall, discharge header to y = yHdr inside. */
export function co2Cabinet(k: Kit, o: { x0: number; L: number; z0: number; m: number; hs: number; H: number; yHdr: number }) {
  const { x0, L, z0, m, hs, H } = o
  const cd = m - 0.12
  const cz = z0 - cd / 2 - 0.02
  const ch = Math.min(2.0, H - hs - 0.4)
  const cx = x0 + L / 2
  k.box('actuatorRed', [L, ch, 0.03], [cx, hs + ch / 2, z0 - 0.035])
  for (const s of [-1, 1]) k.box('actuatorRed', [0.03, ch, cd], [cx + s * (L / 2 - 0.015), hs + ch / 2, cz])
  k.box('actuatorRed', [L + 0.06, 0.04, cd + 0.08], [cx, hs + ch + 0.02, cz])
  k.box(SKID, [L, 0.06, cd], [cx, hs + 0.03, cz])
  const nbt = Math.max(2, Math.floor((L - 0.1) / 0.28))
  const bR = Math.min(0.12, cd / 2 - 0.04)
  const bH = ch - 0.55
  for (let i = 0; i < nbt; i++) {
    const bx = cx - L / 2 + 0.05 + (i + 0.5) * ((L - 0.1) / nbt)
    k.cyl('actuatorRed', bR, bH, [bx, hs + 0.06 + bH / 2, cz], 'y', 20)
    k.dome('actuatorRed', bR, [bx, hs + 0.06 + bH, cz], 'y', Math.PI / 2, 0.6, 16)
    k.cyl('brass', 0.035, 0.12, [bx, hs + bH + 0.18, cz], 'y', 10)
    k.tube('tubing', [[bx, hs + bH + 0.24, cz], [bx, hs + bH + 0.32, cz], [bx, hs + bH + 0.38, z0 - 0.08]], 0.01, 6, 0.04)
  }
  k.box('structSteel', [L - 0.06, 0.04, 0.05], [cx, hs + bH * 0.6, cz - bR - 0.03])
  lineRun(k, [[cx - L / 2 + 0.08, hs + bH + 0.38, z0 - 0.08], [cx, hs + bH + 0.38, z0 - 0.08], [cx, o.yHdr, z0 - 0.08], [cx, o.yHdr, z0 + 0.02]], 1.5, 'stainless')
  k.box('actuatorRed', [L, 0.3, 0.02], [cx, hs + ch - 0.2, z0 - cd - 0.015])
  k.plane(signMaterial('ler', 'CO2 FIRE SUPPRESSION'), Math.min(0.9, L - 0.1), 0.25, [cx, hs + ch - 0.2, z0 - cd - 0.03], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
  k.rbox('safetyGreen', [0.2, 0.26, 0.1], 0.02, [cx + L / 2 + 0.25, 1.4, z0 - 0.05])
}
