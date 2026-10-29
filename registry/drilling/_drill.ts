// Shared drilling & subsea parts: API 6A flanges and gate valves, hammer-lug covers, convex hulls, ROV buckets, hubs and clamps, mudmats.
import * as THREE from 'three'
import { mat4, type Kit, type MatKey, type V3 } from '../lib/kit'
import { flange, liftingLug } from '../lib/parts'
import { flange as asmeFlange, inch, nearest, pipeOD, type Rating } from '../lib/standards'

// ------------------------------------------------------------------ API 6A (typical 6B / 6BX dims, inches: OD, thickness, bolt circle, bolts, bolt dia)

export type Psi = 5000 | 10000 | 15000

type Row = [od: number, t: number, bc: number, n: number, bd: number]

const API: Record<Psi, Record<number, Row>> = {
  5000: {
    2.0625: [8.5, 1.81, 6.5, 8, 0.875], 2.5625: [9.62, 1.94, 7.5, 8, 1.0], 3.125: [10.5, 2.19, 8.0, 8, 1.125],
    4.0625: [12.25, 2.44, 9.5, 8, 1.25], 5.125: [14.75, 3.19, 11.5, 8, 1.5], 7.0625: [15.5, 3.62, 12.5, 12, 1.375],
  },
  10000: {
    2.0625: [7.88, 1.73, 6.25, 8, 0.75], 2.5625: [9.12, 2.02, 7.25, 8, 0.875], 3.0625: [10.62, 2.3, 8.5, 8, 1.0],
    4.0625: [12.44, 2.77, 10.19, 8, 1.125], 5.125: [14.06, 3.12, 11.81, 12, 1.125], 7.0625: [18.88, 4.06, 15.88, 12, 1.5],
  },
  15000: {
    2.0625: [8.75, 2.0, 6.88, 8, 0.875], 2.5625: [10.0, 2.25, 7.88, 8, 1.0], 3.0625: [11.31, 2.53, 9.06, 8, 1.125],
    4.0625: [14.19, 3.09, 11.44, 8, 1.375], 5.125: [16.5, 3.88, 13.63, 12, 1.5], 7.0625: [19.88, 4.69, 16.88, 16, 1.5],
  },
}

// typical API 6A slab-gate face-to-face, inches
const GATE: Record<Psi, Record<number, number>> = {
  5000: { 2.0625: 14.62, 2.5625: 16.62, 3.125: 18.62, 4.0625: 21.62, 5.125: 28.62, 7.0625: 29.0 },
  10000: { 2.0625: 20.5, 2.5625: 22.25, 3.0625: 24.38, 4.0625: 26.38, 5.125: 29.0, 7.0625: 35.0 },
  15000: { 2.0625: 19.0, 2.5625: 21.0, 3.0625: 23.56, 4.0625: 29.0, 5.125: 35.0, 7.0625: 40.0 },
}

export interface ApiFlange {
  bore: number
  od: number
  t: number
  bolts: number
  boltDia: number
  boltCircle: number
  ring: number
}

export function apiFlange(bore: number, psi: Psi = 10000): ApiFlange {
  const tbl = API[psi] ?? API[10000]
  const b = nearest(Object.keys(tbl).map(Number), bore)
  const [od, t, bc, n, bd] = tbl[b]
  return { bore: b, od: inch(od), t: inch(t), bolts: n, boltDia: inch(bd), boltCircle: inch(bc), ring: inch(bc - bd * 1.9) }
}

export function apiGateLength(bore: number, psi: Psi = 10000): number {
  const tbl = GATE[psi] ?? GATE[10000]
  return inch(tbl[nearest(Object.keys(tbl).map(Number), bore)])
}

/** ring-gasket half gap at an RTJ joint */
export const G = 0.003
const rBore = (d: ApiFlange) => d.bore * 0.0127

/** Hollow tube along local Y. */
export function tubeY(k: Kit, mat: MatKey, ro: number, ri: number, y0: number, y1: number, seg = 28) {
  k.lathe(mat, [[ri, y0], [ro, y0], [ro, y1], [ri, y1]], [0, 0, 0], 'y', seg)
  k.lathe('pipeBore', [[ri, Math.max(y0, y1)], [ri, Math.min(y0, y1)]], [0, 0, 0], 'y', seg)
}

/** Integral API flange, ring face at local y = face, body on side s (+1 above, -1 below). */
export function apiFlangeAt(k: Kit, d: ApiFlange, face: number, s: 1 | -1, mat: MatKey) {
  const f0 = face + s * G
  const f1 = face + s * (G + d.t)
  const lo = Math.min(f0, f1)
  const hi = Math.max(f0, f1)
  const ch = Math.min(0.006, d.t * 0.12)
  const rb = rBore(d)
  const R = d.od / 2
  const prof: [number, number][] = s > 0 ? [[rb, lo], [R, lo], [R, hi - ch], [R - ch, hi], [rb, hi]] : [[rb, lo], [R - ch, lo], [R, lo + ch], [R, hi], [rb, hi]]
  k.lathe(mat, prof, [0, 0, 0], 'y', d.bolts >= 12 ? 40 : 28)
}

/** Studs, nuts and ring gasket for two API flanges meeting at local y = yj. */
export function apiJoint(k: Kit, d: ApiFlange, yj: number) {
  const nh = d.boltDia * 0.95
  const so = d.boltDia * 0.4
  const len = 2 * (G + d.t) + 2 * nh + 2 * so
  k.boltCircle('boltXylan', 'nut', d.bolts, d.boltCircle / 2, [0, yj - len / 2, 0], 'y', d.boltDia, len, [so + nh / 2, len - so - nh / 2])
  k.torus('stainless', d.ring / 2, Math.max(0.004, d.boltDia * 0.18), [0, yj, 0], 'y', 4, 28)
}

/** Flanged spool between API faces y = 0 and y = L (local Y). */
export function apiSpool(k: Kit, d: ApiFlange, L: number, mat: MatKey) {
  apiFlangeAt(k, d, 0, 1, mat)
  apiFlangeAt(k, d, L, -1, mat)
  tubeY(k, mat, d.od * 0.3, rBore(d), G + d.t - 0.002, L - G - d.t + 0.002, 24)
}

/** Open API face at local y = 0 (flange body below): machined face and ring groove; optional studs for a studded outlet. */
export function apiStuddedFace(k: Kit, d: ApiFlange, studs = true) {
  const nh = d.boltDia * 0.95
  k.lathe('machined', [[d.ring / 2 + d.boltDia * 0.6, -G + 0.0008], [rBore(d), -G + 0.0008]], [0, 0, 0], 'y', 32)
  k.torus('pipeBore', d.ring / 2, Math.max(0.003, d.boltDia * 0.16), [0, -G + 0.001, 0], 'y', 6, 32)
  if (studs) k.boltCircle('boltXylan', 'nut', d.bolts, d.boltCircle / 2, [0, -d.boltDia * 1.2, 0], 'y', d.boltDia, d.boltDia * 1.2 + G * 2 + d.t + nh * 1.4, [d.boltDia * 1.2 + G * 2 + d.t + nh * 0.5])
}

export type GateOp = { kind: 'handwheel'; D: number; mat?: MatKey } | { kind: 'hydraulic'; r: number; len: number }

/** API 6A slab gate valve between flange faces y = 0 and y = L, bonnet along local +Z. */
export function apiGate(k: Kit, d: ApiFlange, L: number, op: GateOp, mat: MatKey = 'valveBody') {
  apiFlangeAt(k, d, 0, 1, mat)
  apiFlangeAt(k, d, L, -1, mat)
  const rb = rBore(d)
  tubeY(k, mat, d.od * 0.3, rb, G + d.t - 0.002, L - G - d.t + 0.002, 24)
  const w = d.od * 0.8
  const dz = d.od * 0.92
  const hb = Math.max(0.05, Math.min(d.od * 1.0, L - 2 * (G + d.t) - 0.02))
  const yc = L / 2
  k.rbox(mat, [w, hb, dz], Math.min(0.025, w * 0.1), [0, yc, 0])
  k.cyl('brass', 0.008, 0.03, [w / 2 + 0.012, yc + hb * 0.25, 0], 'x', 8)
  k.hex('brass', 0.017, 0.012, [w / 2 + 0.029, yc + hb * 0.25, 0], 'x')
  const rbf = Math.min(w * 0.5, hb * 0.5)
  let z = dz / 2
  const tbf = Math.max(0.03, d.t * 0.6)
  k.cyl(mat, rbf, tbf, [0, yc, z + tbf / 2], 'z', 28)
  k.around(8, rbf * 0.8, [0, yc, z + tbf + 0.008], 'z', (p) => k.hex('nut', Math.max(0.022, d.boltDia * 1.3), 0.016, p, 'z'), Math.PI / 8)
  z += tbf
  const bl = 0.07 + d.od * 0.18
  const rbo = rbf * 0.66
  k.cyl(mat, rbo, bl, [0, yc, z + bl / 2], 'z', 24)
  z += bl
  if (op.kind === 'handwheel') {
    const sr = Math.max(0.011, d.od * 0.045)
    k.cyl(mat, rbo * 0.62, 0.04, [0, yc, z + 0.02], 'z', 18)
    k.cyl('stainless', sr, 0.12, [0, yc, z + 0.06], 'z', 12)
    k.handwheel(op.mat ?? 'actuatorRed', op.D, [0, yc, z + 0.1], 'z', 4)
    k.hex('nut', sr * 2.4, 0.02, [0, yc, z + 0.12], 'z')
    return z + 0.13
  }
  k.cyl(mat, rbo * 0.85, 0.05, [0, yc, z + 0.025], 'z', 24)
  z += 0.05
  const { r, len } = op
  k.cyl('actuatorYellow', r * 1.08, 0.03, [0, yc, z + 0.015], 'z', 32)
  k.cyl('actuatorYellow', r, len, [0, yc, z + 0.03 + len / 2], 'z', 32)
  k.cyl('actuatorYellow', r * 1.08, 0.035, [0, yc, z + 0.03 + len + 0.0175], 'z', 32)
  k.around(4, r * 1.04, [0, yc, 0], 'z', (p) => {
    k.rod('stainless', [p[0], p[1], z], [p[0], p[1], z + 0.065 + len + 0.012], 0.007, 8)
    k.hex('nut', 0.02, 0.012, [p[0], p[1], z + 0.065 + len + 0.006], 'z')
  }, Math.PI / 4)
  const zt = z + 0.065 + len
  k.cyl('stainless', 0.02, 0.1, [0, yc, zt + 0.05], 'z', 14)
  k.cyl('safetyGreen', 0.023, 0.025, [0, yc, zt + 0.03], 'z', 14)
  k.cyl('nameplate', r * 1.002, 0.04, [0, yc, z + 0.03 + len * 0.62], 'z', 32)
  return zt + 0.1
}

/** 1/2" needle valve on a boss along +axis from base, T-handle to the side. Returns the outlet end. */
export function needleValve(k: Kit, base: V3, axis: 'x' | 'y' | 'z' | '-x' | '-z', handle: MatKey = 'actuatorRed'): V3 {
  const v: V3 = axis === 'y' ? [0, 1, 0] : axis === 'z' ? [0, 0, 1] : axis === '-z' ? [0, 0, -1] : axis === 'x' ? [1, 0, 0] : [-1, 0, 0]
  const p = (t: number): V3 => [base[0] + v[0] * t, base[1] + v[1] * t, base[2] + v[2] * t]
  k.hex('stainless', 0.032, 0.02, p(0.01), axis)
  k.box('stainless', [0.036, 0.036, 0.036], p(0.042))
  const side: V3 = axis === 'y' ? [1, 0, 0] : [0, 1, 0]
  const q = p(0.042)
  k.rod('stainless', q, [q[0] + side[0] * 0.05, q[1] + side[1] * 0.05, q[2] + side[2] * 0.05], 0.006, 8)
  k.box(handle, axis === 'y' ? [0.012, 0.012, 0.06] : [0.06, 0.012, 0.012], [q[0] + side[0] * 0.055, q[1] + side[1] * 0.055, q[2] + side[2] * 0.055])
  k.rod('stainless', p(0.06), p(0.105), 0.008, 8)
  return p(0.105)
}

/** Threaded hammer-lug cover (mud pump valve cover, union nut) on local +Y from y = 0: body, three lugs, centre boss. */
export function hammerCap(k: Kit, mat: MatKey, R: number, h: number, lugs = 3) {
  k.cyl(mat, R, h, [0, h / 2, 0], 'y', 32)
  k.cyl(mat, R * 0.96, 0.006, [0, h + 0.003, 0], 'y', 32)
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2
    k.box(mat, [R * 0.42, h * 0.8, R * 0.32], [Math.cos(a) * (R + R * 0.14), h * 0.45, Math.sin(a) * (R + R * 0.14)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
  }
  k.cyl(mat, R * 0.35, h * 0.3, [0, h + h * 0.15, 0], 'y', 20)
}

// ------------------------------------------------------------------ 2D helpers

/** Convex hull (CCW) of circles sampled at n points each, as a THREE.Shape in XY. */
export function hullOfCircles(circles: [number, number, number][], n = 32): THREE.Shape {
  const hull = hullPoints(circles, n)
  const sh = new THREE.Shape()
  hull.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)))
  sh.closePath()
  return sh
}

/** Plate band of `thick` × `depth` (along +Z from z0) following the hull outline of the circles: guard rims, belts. */
export function hullBand(k: Kit, mat: MatKey, circles: [number, number, number][], z0: number, depth: number, thick: number, n = 48) {
  const h = hullPoints(circles, n)
  for (let i = 0; i < h.length; i++) {
    const [x0, y0] = h[i]
    const [x1, y1] = h[(i + 1) % h.length]
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (len < 1e-5) continue
    const nx = (y1 - y0) / len
    const ny = -(x1 - x0) / len
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(y1 - y0, x1 - x0))
    k.box(mat, [len + thick * 0.6, thick, depth], [(x0 + x1) / 2 - (nx * thick) / 2, (y0 + y1) / 2 - (ny * thick) / 2, z0 + depth / 2], q)
  }
}

/** Flat convex face (triangle fan) over the hull of the circles at z = z0, facing +Z (or -Z when flip). UVs scaled by uvs per metre. */
export function hullFace(circles: [number, number, number][], z0: number, flip = false, uvs = 1, n = 48): THREE.BufferGeometry {
  const h = hullPoints(circles, n)
  const cx = h.reduce((a, p) => a + p[0], 0) / h.length
  const cy = h.reduce((a, p) => a + p[1], 0) / h.length
  const pos: number[] = [cx, cy, z0]
  const uv: number[] = [cx * uvs, cy * uvs]
  for (const [x, y] of h) pos.push(x, y, z0), uv.push(x * uvs, y * uvs)
  const idx: number[] = []
  for (let i = 0; i < h.length; i++) {
    const a = 1 + i
    const b = 1 + ((i + 1) % h.length)
    if (flip) idx.push(0, b, a)
    else idx.push(0, a, b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function hullPoints(circles: [number, number, number][], n = 32): [number, number][] {
  const pts: [number, number][] = []
  for (const [x, y, r] of circles) for (let i = 0; i < n; i++) pts.push([x + Math.cos((i / n) * Math.PI * 2) * r, y + Math.sin((i / n) * Math.PI * 2) * r])
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: [number, number][] = []
  for (const p of pts) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop()
    lo.push(p)
  }
  const up: [number, number][] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop()
    up.push(p)
  }
  return lo.slice(0, -1).concat(up.slice(0, -1))
}

/** Matrix placing a shape drawn in XY onto the plane z = z0 (extrusion runs +Z). */
export const atZ = (z0: number) => mat4([0, 0, z0])

// ------------------------------------------------------------------ subsea

/** Mudmat at seabed y = 0: plate with edge skirts and stiffeners, top at y = t. */
export function mudmat(k: Kit, sx: number, sz: number, opts: { skirt?: number; mat?: MatKey; t?: number; padeyes?: boolean } = {}) {
  const mat = opts.mat ?? 'equipmentPaint'
  const t = opts.t ?? 0.05
  const sk = opts.skirt ?? 0.25
  // skirts penetrate the seabed; plate rests on y = 0
  k.box(mat, [sx, t, sz], [0, t / 2, 0])
  for (const s of [-1, 1]) {
    k.box(mat, [sx, sk, 0.02], [0, -sk / 2 + 0.001, s * (sz / 2 - 0.01)])
    k.box(mat, [0.02, sk, sz], [s * (sx / 2 - 0.01), -sk / 2 + 0.001, 0])
  }
  // top stiffeners (flat bar grid)
  const nx = Math.max(2, Math.round(sx / 1.2))
  const nz = Math.max(2, Math.round(sz / 1.2))
  for (let i = 1; i < nx; i++) k.box(mat, [0.02, 0.12, sz - 0.04], [-sx / 2 + (sx * i) / nx, t + 0.06, 0])
  for (let i = 1; i < nz; i++) k.box(mat, [sx - 0.04, 0.12, 0.02], [0, t + 0.06, -sz / 2 + (sz * i) / nz])
  // water evacuation holes with short vent pipes
  for (const sx2 of [-1, 1]) for (const sz2 of [-1, 1]) k.cyl(mat, 0.05, 0.1, [sx2 * sx * 0.25, t + 0.05, sz2 * sz * 0.25], 'y', 14, undefined, true)
  if (opts.padeyes !== false) for (const sx2 of [-1, 1]) for (const sz2 of [-1, 1]) liftingLug(k, [sx2 * (sx / 2 - 0.2), t, sz2 * (sz / 2 - 0.2)], 'x', 1.6, mat)
  return t
}

/** Sacrificial Al-Zn-In anode on two stand-off cores, long axis along `along`, centre at c. */
export function anode(k: Kit, c: V3, along: 'x' | 'z' | 'y' = 'x', len = 0.6) {
  const size: V3 = along === 'x' ? [len, 0.1, 0.12] : along === 'z' ? [0.12, 0.1, len] : [0.12, len, 0.1]
  k.rbox('aluminium', size, 0.02, c)
  const off = len * 0.55
  for (const s of [-1, 1]) {
    const e: V3 = along === 'x' ? [c[0] + s * off, c[1], c[2]] : along === 'z' ? [c[0], c[1], c[2] + s * off] : [c[0], c[1] + s * off, c[2]]
    k.box('stainless', [0.03, 0.03, 0.03], e)
  }
}

/** API 17D class-4 style ROV torque bucket (open funnel, docking slots) on a back plate, opening facing +axis from base. */
export function rovBucket(k: Kit, base: V3, axis: 'x' | 'z' | '-x' | '-z' | 'y', mat: MatKey = 'actuatorYellow') {
  k.at(base, axis, () => {
    k.box(mat, [0.32, 0.02, 0.32], [0, 0.01, 0])
    k.lathe(mat, [[0.07, 0.02], [0.085, 0.02], [0.085, 0.14], [0.11, 0.2], [0.1, 0.2], [0.075, 0.145], [0.07, 0.145]], [0, 0, 0], 'y', 28)
    k.lathe('pipeBore', [[0.07, 0.145], [0.07, 0.025]], [0, 0, 0], 'y', 24)
    k.cyl('stainless', 0.025, 0.04, [0, 0.04, 0], 'y', 6)
    // docking slots and position indicator
    for (const s of [-1, 1]) k.box('nut', [0.016, 0.05, 0.02], [s * 0.086, 0.17, 0])
    k.box('nut', [0.05, 0.004, 0.012], [0, 0.022, 0.13])
  })
}

/** Subsea hub (API 17R style) on local +Y from base along `axis`: neck, tapered hub profile, seal face, optional protection cap. Face at base + len. */
export function hub(k: Kit, base: V3, axis: 'x' | 'z' | '-x' | '-z' | 'y', boreR: number, len = 0.35, mat: MatKey = 'equipmentPaint', cap = false) {
  const R = Math.max(0.12, boreR * 2.4)
  k.at(base, axis, () => {
    k.lathe(mat, [[boreR, 0], [R * 0.62, 0], [R * 0.62, len * 0.5], [R * 0.75, len * 0.55], [R, len * 0.78], [R, len - 0.01], [R * 0.95, len], [boreR, len]], [0, 0, 0], 'y', 40)
    k.lathe('pipeBore', [[boreR, len], [boreR, -0.05]], [0, 0, 0], 'y', 24)
    k.lathe('machined', [[R * 0.9, len + 0.001], [boreR, len + 0.001]], [0, 0, 0], 'y', 32)
    if (cap) {
      k.lathe('actuatorYellow', [[R * 1.04, len * 0.7], [R * 1.12, len * 0.7], [R * 1.12, len + 0.12], [0, len + 0.12]], [0, 0, 0], 'y', 32)
      k.cyl('nut', 0.03, 0.08, [0, len + 0.16, 0], 'y', 6)
    }
  })
  return R
}

// ------------------------------------------------------------------ chokes and frames

/** Matrix whose local +Y runs along `flow` and local +Z along `stem`, origin at o. */
export function flowFrame(o: V3, flow: V3, stem: V3) {
  const y = new THREE.Vector3(...flow).normalize()
  const z = new THREE.Vector3(...stem).normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...o)
}

/** Angle choke body centre to inlet face (along -X) and outlet face (along -Y). */
export function chokeDims(dIn: ApiFlange, dOut: ApiFlange) {
  const B = Math.max(dIn.od, dOut.od) * 0.78
  return { B, inlet: B / 2 + 0.05 + dIn.t + G, outlet: B / 2 + 0.09 + dOut.t + G }
}

/** API 6A / 16C angle choke at the origin: inlet face -X, outlet face -Y, bonnet and operator along +X. Returns the operator's far x and its hose port. */
export function angleChoke(k: Kit, dIn: ApiFlange, dOut: ApiFlange, op: 'handwheel' | 'hydraulic', mat: MatKey = 'valveBody'): { end: number; hose: V3 | null } {
  const { B, inlet, outlet } = chokeDims(dIn, dOut)
  k.rbox(mat, [B, B, B * 0.92], Math.min(0.03, B * 0.12), [0, 0, 0])
  const ri = rBore(dIn)
  const ro = rBore(dOut)
  k.at([0, 0, 0], '-x', () => tubeY(k, mat, dIn.od * 0.3, ri, B / 2 - 0.01, inlet - dIn.t - G + 0.002, 24))
  k.at([0, 0, 0], '-y', () => tubeY(k, mat, dOut.od * 0.32, ro, B / 2 - 0.01, outlet - dOut.t - G + 0.002, 24))
  k.at([-inlet, 0, 0], '-x', () => apiFlangeAt(k, dIn, 0, -1, mat))
  k.at([0, -outlet, 0], '-y', () => apiFlangeAt(k, dOut, 0, -1, mat))
  k.disc('internalsSteel', ri * 1.02, [-B / 2 + 0.012, 0, 0], '-x', 24)
  k.disc('internalsSteel', ro * 1.02, [0, -B / 2 + 0.012, 0], '-y', 24)
  // bonnet nut with hammer lugs, wear-sleeve bleed plug
  k.hex('brass', 0.022, 0.016, [0, B * 0.25, B * 0.46 + 0.008], 'z')
  let x = B / 2
  const rn = B * 0.42
  k.cyl(mat, rn * 0.9, 0.02, [x + 0.01, 0, 0], 'x', 24)
  x += 0.02
  k.cyl(mat, rn, 0.07, [x + 0.035, 0, 0], 'x', 24)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    k.box(mat, [0.06, B * 0.2, B * 0.13], [x + 0.035, Math.cos(a) * (rn + B * 0.08), Math.sin(a) * (rn + B * 0.08)], new THREE.Quaternion().setFromEuler(new THREE.Euler(-a, 0, 0)))
  }
  x += 0.07
  k.cyl(mat, rn * 0.55, 0.1, [x + 0.05, 0, 0], 'x', 20)
  x += 0.1
  // position indicator sleeve with scale ring
  k.cyl('stainless', rn * 0.4, 0.07, [x + 0.035, 0, 0], 'x', 18)
  k.cyl('brass', rn * 0.42, 0.012, [x + 0.02, 0, 0], 'x', 18)
  k.box('actuatorRed', [0.05, 0.004, 0.012], [x + 0.035, rn * 0.4 + 0.002, 0])
  x += 0.07
  if (op === 'handwheel') {
    k.cyl('stainless', 0.014, 0.1, [x + 0.05, 0, 0], 'x', 10)
    k.handwheel('actuatorRed', Math.max(0.3, B * 1.3), [x + 0.07, 0, 0], 'x', 4)
    return { end: x + 0.1, hose: null }
  }
  // hydraulic rotary-gear actuator: gear housing, double-acting cylinder, stroke-position transmitter, manual override
  k.cyl(mat, rn * 0.35, 0.05, [x + 0.025, 0, 0], 'x', 14)
  x += 0.05
  k.rbox('actuatorYellow', [0.2, 0.2, 0.22], 0.02, [x + 0.1, 0, 0])
  k.cyl('actuatorYellow', 0.07, 0.42, [x + 0.1, 0.0, 0.0], 'z', 24)
  for (const s of [-1, 1]) {
    k.cyl('actuatorYellow', 0.078, 0.03, [x + 0.1, 0, s * 0.21], 'z', 24)
    k.cyl('brass', 0.012, 0.035, [x + 0.1, 0.07, s * 0.19], 'y', 10)
  }
  k.rbox('stainless', [0.08, 0.1, 0.08], 0.01, [x + 0.25, 0.04, 0])
  k.cyl('brass', 0.012, 0.03, [x + 0.25, -0.025, 0], 'y', 8)
  k.hex('nut', 0.04, 0.03, [x + 0.1, 0.115, 0], 'y')
  k.box('nameplate', [0.08, 0.05, 0.002], [x + 0.1, 0, 0.112])
  return { end: x + 0.3, hose: [x + 0.1, 0.105, 0.19] }
}

/** ROV grab bar: round bar on two stand-offs between a and b, stand-off along `out`. */
export function grabBar(k: Kit, a: V3, b: V3, out: V3, mat: MatKey = 'actuatorYellow') {
  const o = (p: V3, s: number): V3 => [p[0] + out[0] * s, p[1] + out[1] * s, p[2] + out[2] * s]
  k.rod(mat, o(a, 0.12), o(b, 0.12), 0.019, 10)
  for (const p of [a, b]) k.rod(mat, p, o(p, 0.12), 0.015, 8)
}

/**
 * Subsea trunnion ball valve between flange faces at local y = 0 and y = L (flow along local +Y), stem and ROV
 * gearbox along local +Z, class-4 bucket opening along local +X. Flanges are ASME B16.5 with studs.
 */
export function subseaBall(k: Kit, nps: number, rating: Rating, L: number, opts: { mat?: MatKey; bucket?: boolean } = {}) {
  const mat = opts.mat ?? 'equipmentPaint'
  const f = asmeFlange(nps, rating)
  const ro = pipeOD(nps) / 2
  const R = Math.max(ro * 1.55, f.od * 0.5)
  const fl0 = flange(k, nps, rating, [0, 0, 0], '-y', true)
  const fl1 = flange(k, nps, rating, [0, L, 0], 'y', true)
  k.lathe(mat, [[ro * 0.9, fl0], [ro * 1.15, fl0], [R * 0.9, L / 2 - R * 0.75], [R, L / 2 - R * 0.35], [R, L / 2 + R * 0.35], [R * 0.9, L / 2 + R * 0.75], [ro * 1.15, L - fl1], [ro * 0.9, L - fl1]], [0, 0, 0], 'y', 40)
  // body joint flanges with studs
  for (const y of [L / 2 - R * 0.55, L / 2 + R * 0.55]) {
    k.cyl(mat, R * 1.08, 0.05, [0, y, 0], 'y', 40)
    k.around(12, R * 1.0, [0, y + 0.035, 0], 'y', (p) => k.hex('nut', 0.05, 0.03, p, 'y'), Math.PI / 12)
  }
  // trunnion boss, stem housing, gearbox, bucket
  k.cyl(mat, R * 0.45, R * 0.4, [0, L / 2, -R - R * 0.15], 'z', 28)
  k.cyl(mat, R * 0.45, R * 0.5, [0, L / 2, R + R * 0.2], 'z', 28)
  const zg = R + R * 0.45
  k.rbox('actuatorYellow', [R * 1.5, R * 1.2, R * 0.9], 0.04, [0, L / 2, zg + R * 0.45])
  k.cyl('actuatorYellow', R * 0.35, R * 0.5, [R * 0.75, L / 2, zg + R * 0.45], 'x', 24)
  k.box('nut', [0.12, 0.02, 0.012], [0, L / 2 + R * 0.6, zg + R * 0.9 + 0.006])
  if (opts.bucket !== false) rovBucket(k, [R * 1.05 + 0.25, L / 2, zg + R * 0.45], 'x')
  k.rod('actuatorYellow', [R * 1.0, L / 2, zg + R * 0.45], [R * 1.05 + 0.25, L / 2, zg + R * 0.45], 0.05, 16)
  return { R, top: zg + R * 0.9 }
}
