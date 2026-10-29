// Flange-type geometry: ASME B16.5 weld-neck, slip-on, socket-weld, threaded and lap-joint bodies, drilled plates, RF / FF / RTJ facings, NPT threads, fillet welds and pipe stubs.
import * as THREE from 'three'
import { latheCrisp, mat4, perp, uvScale, type Kit, type MatKey, type Profile, type V3 } from '../lib/kit'
import { textMaterial } from '../lib/textures'
import { GASKET_SPIRAL_WOUND, flange as flangeDims, inch, mm, nearest, pipeOD, pipeWall, stubEnd, studLength, tableKeys, type Rating, type Schedule } from '../lib/standards'

export type Facing = 'RF' | 'FF' | 'RTJ'
export type FlangeKind = 'WN' | 'SO' | 'SW' | 'THD' | 'LJ'
export const GAP = GASKET_SPIRAL_WOUND
export const LAND = 0.0016
export const BEVEL_TAN = Math.tan((37.5 * Math.PI) / 180)
const BEVEL = BEVEL_TAN

export const add = (a: V3, d: V3, s = 1): V3 => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s]
export const seg = (d: number) => (d > 0.5 ? 64 : d > 0.25 ? 48 : d > 0.1 ? 40 : 32)
const look = <T>(t: Record<number, T>, nps: number): T => t[nearest(tableKeys(t), nps)]
const has = (t: Record<number, unknown> | undefined, nps: number) => !!t && t[nearest(tableKeys(t), nps)] !== undefined && Math.abs(nearest(tableKeys(t), nps) - nps) < 0.01

// ------------------------------------------------------------------ B16.5 tables (mm)

// Slip-on / threaded / socket-weld length through hub Y, raised face excluded.
const SO_Y: Partial<Record<Rating, Record<number, number>>> = {
  150: { 0.5: 14, 0.75: 14, 1: 16, 1.25: 19, 1.5: 21, 2: 24, 2.5: 27, 3: 29, 3.5: 30, 4: 32, 5: 35, 6: 38, 8: 43, 10: 48, 12: 54, 14: 56, 16: 62, 18: 67, 20: 71, 24: 81 },
  300: { 0.5: 21, 0.75: 24, 1: 25, 1.25: 25, 1.5: 29, 2: 32, 2.5: 37, 3: 41, 3.5: 43, 4: 46, 5: 49, 6: 51, 8: 60, 10: 65, 12: 71, 14: 75, 16: 81, 18: 87, 20: 94, 24: 105 },
  600: { 0.5: 22, 0.75: 25, 1: 27, 1.25: 29, 1.5: 32, 2: 37, 2.5: 41, 3: 46, 4: 54, 5: 60, 6: 67, 8: 76, 10: 86, 12: 92, 14: 94, 16: 106, 18: 117, 20: 127, 24: 140 },
  900: { 0.5: 32, 0.75: 35, 1: 41, 1.25: 41, 1.5: 44, 2: 57, 2.5: 64, 3: 54, 4: 70, 5: 79, 6: 86, 8: 102, 10: 108, 12: 117, 14: 130, 16: 133, 18: 152, 20: 159, 24: 203 },
  1500: { 0.5: 32, 0.75: 35, 1: 41, 1.25: 41, 1.5: 44, 2: 57, 2.5: 64 },
}
// Slip-on bore B (also the socket bore of socket-weld flanges).
const SO_B: Record<number, number> = {
  0.5: 22.2, 0.75: 27.7, 1: 34.5, 1.25: 43.2, 1.5: 49.5, 2: 61.9, 2.5: 74.6, 3: 90.7, 3.5: 103.4, 4: 116.1, 5: 143.8,
  6: 170.7, 8: 221.5, 10: 276.2, 12: 327, 14: 359.2, 16: 410.5, 18: 461.8, 20: 513.1, 24: 616,
}
// Socket-weld flange socket depth D.
const SW_D: Record<number, number> = { 0.5: 9.5, 0.75: 11.2, 1: 12.7, 1.25: 14.2, 1.5: 15.7, 2: 17.5, 2.5: 19.1, 3: 20.6 }

/** True when B16.5 defines this flange type at this size and class. */
export function defined(kind: FlangeKind, nps: number, rating: Rating) {
  if (kind === 'WN') return true
  if (rating === 2500 && kind !== 'THD' && kind !== 'LJ') return false
  if (kind === 'SW') return nps <= (rating >= 900 ? 2.5 : 3)
  if (rating === 1500) return nps <= 2.5
  if (rating === 2500) return nps <= 12
  return nps <= 24
}

/** The requested class if B16.5 defines this flange type there, else the next lower class that does. */
export function definedRating(kind: FlangeKind, nps: number, rating: Rating): Rating {
  const all: Rating[] = [2500, 1500, 900, 600, 300, 150]
  return all.find((r) => r <= rating && defined(kind, nps, r)) ?? 150
}

/** Slip-on / threaded / socket-weld / lap-joint length through hub, raised face excluded. */
export function hubLength(kind: FlangeKind, nps: number, rating: Rating) {
  const f = flangeDims(nps, rating)
  if (kind === 'WN') return f.hubLength
  const t = SO_Y[rating]
  // approx: outside the B16.5 slip-on table, 0.58 x the weld-neck hub
  let y = has(t, nps) ? mm(look(t!, nps)) : f.hubLength * 0.58
  // approx: B16.5 lap-joint hubs are longer than slip-on from NPS 14 in Class 150 / 300
  if (kind === 'LJ' && nps >= 14 && rating <= 300) y *= 1.35
  return Math.max(y, f.thickness + 0.004)
}
export const soBore = (nps: number) => (nps <= 24 ? mm(look(SO_B, nps)) : pipeOD(nps) + 0.006)
export const swDepth = (nps: number) => mm(look(SW_D, nps))
/** B16.5 bolt hole: bolt + 1/8" up to 1-3/4" bolts, + 1/4" above. */
export const boltHole = (bd: number) => bd + inch(bd <= inch(1.75) + 1e-6 ? 0.125 : 0.25)

// Octagonal ring grooves by ring number [P pitch dia, E depth, F width], mm (B16.5 / B16.20).
const RING: Record<number, [number, number, number]> = {
  11: [34.14, 5.54, 7.14], 12: [39.67, 6.35, 8.74], 13: [42.88, 6.35, 8.74], 14: [44.45, 6.35, 8.74], 15: [47.63, 6.35, 8.74],
  16: [50.8, 6.35, 8.74], 17: [57.15, 6.35, 8.74], 18: [60.33, 6.35, 8.74], 19: [65.07, 6.35, 8.74], 20: [68.27, 6.35, 8.74],
  21: [72.23, 7.92, 11.91], 22: [82.55, 6.35, 8.74], 23: [82.55, 7.92, 11.91], 24: [95.25, 7.92, 11.91], 25: [101.6, 6.35, 8.74],
  26: [101.6, 7.92, 11.91], 27: [107.95, 7.92, 11.91], 28: [111.13, 9.53, 13.49], 29: [114.3, 6.35, 8.74], 31: [123.83, 7.92, 11.91],
  32: [127, 9.53, 13.49], 33: [131.78, 6.35, 8.74], 34: [131.78, 7.92, 11.91], 35: [136.53, 7.92, 11.91], 36: [149.23, 6.35, 8.74],
  37: [149.23, 7.92, 11.91], 38: [157.18, 11.13, 16.66], 39: [161.93, 7.92, 11.91], 40: [171.45, 6.35, 8.74], 41: [180.98, 7.92, 11.91],
  42: [190.5, 12.7, 19.84], 43: [193.68, 6.35, 8.74], 44: [193.68, 7.92, 11.91], 45: [211.12, 7.92, 11.91], 46: [211.14, 9.53, 13.49],
  47: [228.6, 12.7, 19.84], 48: [247.65, 6.35, 8.74], 49: [269.88, 7.92, 11.91], 50: [269.88, 11.13, 16.66], 51: [279.4, 14.27, 23.01],
  52: [304.8, 6.35, 8.74], 53: [323.85, 7.92, 11.91], 54: [323.85, 11.13, 16.66], 55: [342.9, 17.48, 30.18], 56: [381, 6.35, 8.74],
  57: [381, 7.92, 11.91], 58: [381, 14.27, 23.01], 59: [396.88, 6.35, 8.74], 60: [406.4, 17.48, 33.32], 61: [419.1, 7.92, 11.91],
  62: [419.1, 11.13, 16.66], 63: [419.1, 15.88, 26.97], 64: [454.03, 6.35, 8.74], 65: [469.9, 7.92, 11.91], 66: [469.9, 11.13, 16.66],
  67: [469.9, 17.48, 30.18], 68: [517.53, 6.35, 8.74], 69: [533.4, 7.92, 11.91], 70: [533.4, 12.7, 19.84], 71: [533.4, 17.48, 30.18],
  72: [558.8, 6.35, 8.74], 73: [584.2, 9.53, 13.49], 74: [584.2, 12.7, 19.84], 75: [584.2, 17.48, 33.32], 76: [673.1, 6.35, 8.74],
  77: [692.15, 11.13, 16.66], 78: [692.15, 15.88, 26.97], 79: [692.15, 20.62, 36.53],
}
const RN_300 = { 0.5: 11, 0.75: 13, 1: 16, 1.25: 18, 1.5: 20, 2: 23, 2.5: 26, 3: 31, 3.5: 34, 4: 37, 5: 41, 6: 45, 8: 49, 10: 53, 12: 57, 14: 61, 16: 65, 18: 69, 20: 73, 24: 77 }
const RN_900 = { 0.5: 12, 0.75: 14, 1: 16, 1.25: 18, 1.5: 20, 2: 24, 2.5: 27, 3: 31, 4: 37, 5: 41, 6: 45, 8: 49, 10: 53, 12: 57, 14: 62, 16: 66, 18: 70, 20: 74, 24: 78 }
// B16.5 ring number per class and NPS.
const RING_NO: Record<Rating, Record<number, number>> = {
  150: { 1: 15, 1.25: 17, 1.5: 19, 2: 22, 2.5: 25, 3: 29, 3.5: 33, 4: 36, 5: 40, 6: 43, 8: 48, 10: 52, 12: 56, 14: 59, 16: 64, 18: 68, 20: 72, 24: 76 },
  300: RN_300,
  600: RN_300,
  900: RN_900,
  1500: { ...RN_900, 3: 35, 4: 39, 5: 44, 6: 46, 8: 50, 10: 54, 12: 58, 14: 63, 16: 67, 18: 71, 20: 75, 24: 79 },
  2500: { 0.5: 13, 0.75: 16, 1: 18, 1.25: 21, 1.5: 23, 2: 26, 2.5: 28, 3: 32, 4: 38, 5: 42, 6: 47, 8: 51, 10: 55, 12: 60 },
}

/** RTJ groove for a flange: ring number, pitch dia, depth, top width and raised-portion dia K (m). */
export function ringGroove(nps: number, rating: Rating) {
  const f0 = flangeDims(nps, rating)
  // approx: B16.47 Series A ring grooves scaled from the raised-face diameter
  if (nps > 24) return { ring: 'R', pitch: f0.raisedFace * 0.9, depth: mm(rating <= 300 ? 11.13 : 15.88), width: mm(rating <= 300 ? 16.66 : 26.97), K: f0.raisedFace * 0.9 + mm(rating <= 300 ? 29 : 39) }
  const t = has(RING_NO[rating], nps) ? RING_NO[rating] : RING_NO[300]
  const no = look(t, nps)
  const [p, e, w] = RING[no]
  const f = flangeDims(nps, rating)
  // approx: K = P + F + 12 mm (fits the B16.5 K column within a few mm), kept inside the bolt holes
  const K = Math.min(mm(p + w + 12), f.boltCircle - boltHole(f.boltDia) - 0.004)
  return { ring: `R${no}`, pitch: mm(p), depth: mm(e), width: mm(w), K }
}

/** Facing height above the flange plate (port offset). */
export function facingHeight(facing: Facing, nps: number, rating: Rating) {
  if (facing === 'FF') return 0
  if (facing === 'RTJ') return ringGroove(nps, rating).depth
  return flangeDims(nps, rating).raisedFaceHeight
}

/** NPT threads per inch. */
export const nptTpi = (nps: number) => (nps <= 0.375 ? 18 : nps <= 0.75 ? 14 : nps <= 2 ? 11.5 : 8)

// ------------------------------------------------------------------ primitives

/** Orthonormal frame (u, w, v) about dir, matching Kit.boltCircle / perp. */
export function frame(dir: V3) {
  const v = new THREE.Vector3(...dir).normalize()
  const [u, w] = perp(dir)
  return { u, w, v }
}

const circle = (cx: number, cy: number, r: number, n: number, cw: boolean) => {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const a = ((cw ? -i : i) / n) * Math.PI * 2
    pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
  }
  return pts
}

export interface Drill {
  n: number
  bc: number
  hole: number
}

/**
 * Flat plate with real bolt holes (and a central opening rIn) from `back` along `dir`, thickness t. Hole phase matches
 * Kit.boltCircle. `bore` draws the central opening wall; the front face can take its own material.
 */
export function drilledPlate(k: Kit, mat: MatKey, frontMat: MatKey, back: V3, dir: V3, t: number, rIn: number, rOut: number, d: Drill | null, n = seg(rOut * 2), bore = false) {
  const { u, w, v } = frame(dir)
  const M = new THREE.Matrix4().makeBasis(u, w, v).setPosition(...back)
  const contour = circle(0, 0, rOut, n, false)
  const holes: { c: [number, number]; r: number; pts: THREE.Vector2[] }[] = []
  if (rIn > 1e-5) holes.push({ c: [0, 0], r: rIn, pts: circle(0, 0, rIn, n, true) })
  if (d)
    for (let i = 0; i < d.n; i++) {
      const a = Math.PI / d.n + (i / d.n) * Math.PI * 2
      const c: [number, number] = [Math.cos(a) * d.bc / 2, Math.sin(a) * d.bc / 2]
      holes.push({ c, r: d.hole / 2, pts: circle(c[0], c[1], d.hole / 2, d.hole > 0.04 ? 20 : 14, true) })
    }
  const tris = THREE.ShapeUtils.triangulateShape(contour, holes.map((h) => h.pts))
  const all = [...contour, ...holes.flatMap((h) => h.pts)]
  const face = (z: number, nz: number) => {
    const pos: number[] = []
    const nor: number[] = []
    for (const p of all) pos.push(p.x, p.y, z), nor.push(0, 0, nz)
    const idx: number[] = []
    for (const [a, b, c] of tris) nz > 0 ? idx.push(a, b, c) : idx.push(a, c, b)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setIndex(idx)
    return g
  }
  k.add(frontMat, face(t, 1), M)
  k.add(mat, face(0, -1), M.clone())
  // walls: outer (normals out), holes (normals into the hole)
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  const wall = (cx: number, cy: number, r: number, m: number, inward: boolean) => {
    const b = pos.length / 3
    for (let j = 0; j <= m; j++) {
      const a = ((inward ? -j : j) / m) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      const sg = inward ? -1 : 1
      pos.push(cx + c * r, cy + s * r, 0, cx + c * r, cy + s * r, t)
      nor.push(c * sg, s * sg, 0, c * sg, s * sg, 0)
    }
    for (let j = 0; j < m; j++) {
      const a0 = b + j * 2
      if (inward) idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2)
      else idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3)
    }
  }
  wall(0, 0, rOut, n, false)
  holes.forEach((h, i) => (i > 0 || bore || rIn <= 1e-5 ? wall(h.c[0], h.c[1], h.r, h.pts.length, true) : null))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  k.add(mat, g, M.clone())
}

/** Quarter-ish arc points from angle a0 to a1 about (cr, cy) in the (r, y) plane. */
export function arc(cr: number, cy: number, r: number, a0: number, a1: number, n = 5): Profile {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [cr + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number]
  })
}

/** Sawtooth thread profile between y0 and y1 (walks y0 → y1). External: crest at r, root at r - h. Internal: crest at r, root at r + h. */
export function thread(r0: number, r1: number, y0: number, y1: number, pitch: number, internal: boolean): Profile {
  const n = Math.max(1, Math.round(Math.abs(y1 - y0) / pitch))
  const h = pitch * 0.8 * 0.7
  const p: Profile = []
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const r = r0 + (r1 - r0) * s
    const y = y0 + (y1 - y0) * s
    p.push([r, y])
    if (i < n) p.push([r + (internal ? h : -h), y + (y1 - y0) / n / 2])
  }
  return p
}

/** Hollow pipe stub from `start` along `dir`. Ends: 'bevel' (B16.25 37.5° with land), 'square', 'open', 'thread' (NPT). */
export type End = 'bevel' | 'square' | 'open' | 'thread'
export function pipeStub(k: Kit, start: V3, dir: V3, L: number, nps: number, schedule: Schedule, endA: End, endB: End, mat: MatKey = 'pipePaint', ro = pipeOD(nps) / 2, ri = ro - pipeWall(nps, schedule)) {
  if (L <= 1e-5) return
  const n = seg(ro * 2)
  const wall = ro - ri
  const bev = Math.min(Math.max(0, wall - LAND) * BEVEL, L / 3)
  const pitch = 0.0254 / nptTpi(nps)
  // NPT effective thread length L2 = (0.8 D + 6.8) / tpi
  const thr = Math.min(L * 0.6, inch((0.8 * (ro * 2) / 0.0254 + 6.8) / nptTpi(nps)))
  let y0 = 0
  let y1 = L
  if (endA === 'bevel') k.lathe('machined', [[ri, 0], [ri + LAND, 0], [ro, bev]], start, dir, n), (y0 = bev)
  else if (endA === 'square') k.lathe(mat, [[ri, 0], [ro, 0]], start, dir, n)
  else if (endA === 'thread') {
    k.lathe('machined', [[ri, 0], [ro - thr / 32 - pitch * 0.4, 0], ...thread(ro - thr / 32, ro, 0.0003, thr, pitch, false)], start, dir, n)
    y0 = thr
  }
  if (endB === 'bevel') k.lathe('machined', [[ro, L - bev], [ri + LAND, L], [ri, L]], start, dir, n), (y1 = L - bev)
  else if (endB === 'square') k.lathe(mat, [[ro, L], [ri, L]], start, dir, n)
  else if (endB === 'thread') {
    k.lathe('machined', [...thread(ro, ro - thr / 32, L - thr, L - 0.0003, pitch, false), [ro - thr / 32 - pitch * 0.4, L], [ri, L]], start, dir, n)
    y1 = L - thr
  }
  if (y1 > y0) k.lathe(mat, [[ro, y0], [ro, y1]], start, dir, n)
  k.lathe('pipeBore', [[ri, L], [ri, 0]], start, dir, n)
}

/** Fillet weld ring: legs along the pipe (-axis from y) and on a face at y; profile slightly convex. */
export function filletWeld(k: Kit, base: V3, dir: V3, r: number, y: number, leg: number, n = seg(r * 2)) {
  const p: Profile = []
  for (let i = 0; i <= 6; i++) {
    const s = i / 6
    const bulge = Math.sin(s * Math.PI) * leg * 0.12
    p.push([r + leg * s + bulge * 0.7, y - leg * (1 - s) + bulge * 0.7])
  }
  k.lathe('flangeSteel', p, base, dir, n)
}

/** Circumferential butt weld cap. */
export function buttWeld(k: Kit, pos: V3, dir: V3, r: number, wall: number) {
  const w = Math.max(0.005, Math.min(0.02, wall * 1.6))
  k.torus('flangeSteel', r + 0.0006, w / 2, pos, dir, 6, seg(r * 2))
}

/** Stamped marking on a cylindrical rim: a thin band of text centred on angle `at` (radians from the frame's u axis). */
export function stamp(k: Kit, text: string, base: V3, dir: V3, r: number, y0: number, y1: number, at = 0) {
  const h = Math.abs(y1 - y0)
  if (h < 0.004 || !text) return
  const phi = Math.min(h * 4, r * 2.2) / r
  const g = uvScale(latheCrisp([[r + 0.0004, Math.min(y0, y1)], [r + 0.0004, Math.max(y0, y1)]], 12, at - phi / 2, phi), 1, 1 / h)
  k.add(textMaterial(text, '#878d91', '#2b3035', 512, 128), g, mat4(base, dir))
}

// ------------------------------------------------------------------ loose flange body

/**
 * Gasket facing on a plate whose front is at `base` (axis dir): RF with serrations, RTJ raised portion with the octagonal
 * groove, FF flat ring, or (lapBore > 0) the radiused lap-joint bore edge. Returns facing height, outer radius and the
 * axial position where the bore wall starts.
 */
export function facingLathe(k: Kit, fc: Facing, nps: number, rating: Rating, rb: number, base: V3, dir: V3, n: number, M: MatKey = 'flangeSteel', lapBore = 0) {
  const f = flangeDims(nps, rating)
  if (lapBore > 0) {
    const r = Math.min(inch(0.12 + nps * 0.025), inch(0.5))
    k.lathe('machined', arc(lapBore + r, -r, r, Math.PI / 2, Math.PI, 5), base, dir, n)
    return { h: 0, rFace: lapBore + r, yb: -r }
  }
  if (fc === 'RF') {
    const h = f.raisedFaceHeight
    const rFace = f.raisedFace / 2
    // serrated finish suggested by a few fine concentric grooves
    const p: Profile = [[rFace, 0], [rFace, h]]
    const step = (rFace - rb) / 7
    for (let i = 1; i < 7; i++) {
      const r = rFace - step * i
      p.push([r + 0.0006, h], [r, h - 0.0003], [r - 0.0006, h])
    }
    p.push([rb + 0.001, h], [rb, h - 0.001])
    k.lathe('machined', p, base, dir, n)
    return { h, rFace, yb: h - 0.001 }
  }
  if (fc === 'RTJ') {
    const g = ringGroove(nps, rating)
    const h = g.depth
    const rFace = g.K / 2
    const bw = Math.max(0.0008, g.width / 2 - h * Math.tan((23 * Math.PI) / 180))
    k.lathe(M, [[rFace, 0], [rFace, h]], base, dir, n)
    k.lathe('machined', [[rFace, h], [g.pitch / 2 + g.width / 2, h], [g.pitch / 2 + bw, 0.0003], [g.pitch / 2 - bw, 0.0003], [g.pitch / 2 - g.width / 2, h], [rb + 0.001, h], [rb, h - 0.001]], base, dir, n)
    return { h, rFace, yb: h - 0.001 }
  }
  const rFace = (rb + f.boltCircle / 2 - boltHole(f.boltDia)) / 2
  k.lathe('machined', [[rFace, 0], [rb + 0.001, 0], [rb, -0.001]], base, dir, n)
  return { h: 0, rFace, yb: -0.001 }
}

export interface FlangeOpts {
  kind: FlangeKind
  nps: number
  rating: Rating
  facing: Facing
  /** pipe schedule for the WN / SW bore */
  schedule: Schedule
  /** bolt holes drilled (true) or a plain disc */
  drilled?: boolean
  marking?: string
  mat?: MatKey
}

export interface FlangeInfo {
  /** facing height above the plate front */
  h: number
  /** plate thickness */
  t: number
  /** plate front to hub end */
  Y: number
  /** bore radius the line sees */
  bore: number
  /** slip-on / socket / lap bore radius */
  B: number
  /** socket depth from the hub end (SW) */
  D: number
  od: number
}

/**
 * One loose B16.5 flange: plate front face at `base`, facing pointing along `dir`, hub running back along -dir.
 * Bolt holes are real. Returns the key dimensions.
 */
export function looseFlange(k: Kit, base: V3, dir: V3, o: FlangeOpts): FlangeInfo {
  const { kind, nps, rating, facing, schedule } = o
  const f = flangeDims(nps, rating)
  const M: MatKey = o.mat ?? 'flangeSteel'
  const ro = pipeOD(nps) / 2
  const n = seg(f.od)
  const lj = kind === 'LJ'
  const fc: Facing = lj ? 'FF' : facing
  // lap-joint flanges are flat-faced; 150 / 300 tf includes the 1.6 mm that other types spend on the raised face
  const t = f.thickness + (lj && rating <= 300 ? f.raisedFaceHeight : 0)
  const Y = Math.max(hubLength(kind, nps, rating), t + 0.004)
  const hubR = Math.max(f.hubDia / 2, ro * 1.05)
  const riPipe = ro - pipeWall(nps, schedule)
  const B = kind === 'WN' ? riPipe : soBore(nps) / 2
  const pitch = 0.0254 / nptTpi(nps)
  const hth = pitch * 0.56
  const D = kind === 'SW' ? swDepth(nps) : 0
  // radius of the bore where it meets the face
  const rb = kind === 'WN' || kind === 'SW' ? riPipe : kind === 'THD' ? ro - hth - (Y - 0.003) / 32 : B
  const bore = rb
  const { h, rFace, yb } = facingLathe(k, fc, nps, rating, rb, base, dir, n, M, lj ? B : 0)
  // drilled plate between rFace and the OD
  drilledPlate(k, M, fc === 'FF' && !lj ? 'machined' : M, add(base, dir, -t), dir, t, rFace, f.od / 2, o.drilled === false ? null : { n: f.bolts, bc: f.boltCircle, hole: boltHole(f.boltDia) }, n)
  // hub: outer surface from the hub end up to the back face
  const fil = Math.min(inch(0.25 + nps * 0.012), (Y - t) * 0.35)
  const y0 = -Y
  const hubTop: Profile = [...arc(hubR + fil, -t - fil, fil, Math.PI, Math.PI / 2, 5), ...(rFace > hubR + fil ? [[rFace, -t] as [number, number]] : [])]
  if (kind === 'WN') {
    const bev = Math.max(0, ro - riPipe - LAND) * BEVEL
    const neck = Math.min((Y - t) * 0.12, (ro - riPipe) * 1.5)
    k.lathe('machined', [[riPipe, y0], [riPipe + LAND, y0], [ro, y0 + bev]], base, dir, n)
    k.lathe(M, [[ro, y0 + bev], [ro, y0 + bev + neck], [hubR, -t - fil], ...hubTop], base, dir, n)
    k.lathe('pipeBore', [[riPipe, yb], [riPipe, y0]], base, dir, n)
  } else {
    // slip-on style hubs taper slightly to the hub end
    const rHe = Math.max(B + (ro - riPipe) * 1.6 + 0.002, hubR - (Y - t) * 0.1)
    const hub: Profile = [[rHe, y0], [hubR, -t - fil], ...hubTop]
    let rIn: number
    if (kind === 'SO' || kind === 'LJ') {
      k.lathe('machined', [[B, yb], [B, y0 + 0.002], [B + 0.002, y0]], base, dir, n)
      rIn = B + 0.002
    } else if (kind === 'SW') {
      const yS = y0 + D
      k.lathe('pipeBore', [[riPipe, yb], [riPipe, yS]], base, dir, n)
      k.lathe('machined', [[riPipe, yS], [B, yS], [B, y0 + 0.0015], [B + 0.0015, y0]], base, dir, n)
      rIn = B + 0.0015
    } else {
      // NPT internal thread, largest at the hub end, tapering 1:16 on diameter towards the face; 45° entry chamfer
      const r1 = rb + (Y - 0.003) / 32
      const ch = pitch * 1.5
      k.lathe('machined', [[rb, yb], ...thread(rb, r1, yb - 0.001, y0 + ch, pitch, true), [r1 + ch, y0]], base, dir, n)
      rIn = r1 + ch
    }
    k.lathe(M, [[rIn, y0], ...hub], base, dir, n)
  }
  if (o.marking) stamp(k, o.marking, base, dir, f.od / 2, -t * 0.82, -t * 0.18)
  return { h, t, Y, bore, B, D, od: f.od }
}

/** Default stamped marking. */
export const marking = (kind: string, nps: number, rating: Rating, facing: Facing, extra = '') =>
  `${nps}" ${rating}# ${kind} ${facing} ${extra} A105N`.replace(/\s+/g, ' ')

// ------------------------------------------------------------------ inline end flanges with half joint studs

/** Weld-neck RF end flange whose face is a port at `face` pointing along `dir`, plus the back half of the joint studs. Returns face to weld end. */
export function endFlange(k: Kit, nps: number, rating: Rating, face: V3, dir: V3, schedule: Schedule = 'STD', studs = true, mat?: MatKey) {
  const f = flangeDims(nps, rating)
  const base = add(face, dir, -f.raisedFaceHeight)
  const i = looseFlange(k, base, dir, { kind: 'WN', nps, rating, facing: 'RF', schedule, mat })
  if (studs) {
    const half = studLength(nps, rating) / 2
    k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, add(face, dir, GAP / 2 - half), dir, f.boltDia, half, [f.boltDia * 0.6])
  }
  return i.Y + f.raisedFaceHeight
}

/** Lap-joint stub end (B16.9 long or MSS SP-43 short pattern): lap face at `face` pointing along dir. Returns length, lap radius, wall. */
export function stubEndGeo(k: Kit, face: V3, dir: V3, nps: number, schedule: Schedule, pattern: 'long' | 'short', mat: MatKey = 'flangeSteel') {
  const s = stubEnd(nps)
  // typical: MSS SP-43 short-pattern lengths
  const short = inch(nps <= 1.5 ? 2 : nps <= 3.5 ? 2.5 : nps <= 5 ? 3 : nps <= 12 ? 4 : 6)
  const L = pattern === 'long' ? s.length : short
  const ro = pipeOD(nps) / 2
  const wt = pipeWall(nps, schedule)
  const ri = ro - wt
  const G = s.lapDia / 2
  const n = seg(G * 2)
  const fr = Math.max(wt * 1.2, 0.003)
  const bev = Math.max(0, wt - LAND) * BEVEL
  k.lathe('machined', [[G, -0.002], [G - 0.002, 0], [ri + 0.0008, 0], [ri, -0.0008]], face, dir, n)
  k.lathe(mat, [[ro, -L + bev], [ro, -wt - fr], ...arc(ro + fr, -wt - fr, fr, Math.PI, Math.PI / 2, 4), [G - 0.001, -wt], [G, -wt + 0.001], [G, -0.002]], face, dir, n)
  k.lathe('pipeBore', [[ri, -0.0008], [ri, -L]], face, dir, n)
  k.lathe('machined', [[ri, -L], [ri + LAND, -L], [ro, -L + bev]], face, dir, n)
  return { L, G, wt }
}

// ------------------------------------------------------------------ inline assemblies

/** Weld end to raised face of a WN RF flange. */
export const flangeLen = (nps: number, rating: Rating) => {
  const f = flangeDims(nps, rating)
  return f.hubLength + f.raisedFaceHeight
}

/** Inline flanged ends: WN RF flanges at x = ±L/2 facing out with half joint studs, plus pipe nipples of length `neck` inward. Returns the nipple inner ends. */
export function inlineEnds(k: Kit, nps: number, rating: Rating, L: number, neck: number, schedule: Schedule = 'STD', mat: MatKey = 'pipePaint') {
  const fl = endFlange(k, nps, rating, [-L / 2, 0, 0], [-1, 0, 0], schedule)
  endFlange(k, nps, rating, [L / 2, 0, 0], [1, 0, 0], schedule)
  const ro = pipeOD(nps) / 2
  const wt = pipeWall(nps, schedule)
  const xa = -L / 2 + fl
  const xb = L / 2 - fl
  if (neck > 0) {
    pipeStub(k, [xa, 0, 0], [1, 0, 0], neck, nps, schedule, 'open', 'square', mat)
    pipeStub(k, [xb - neck, 0, 0], [1, 0, 0], neck, nps, schedule, 'square', 'open', mat)
    buttWeld(k, [xa, 0, 0], [1, 0, 0], ro, wt)
    buttWeld(k, [xb, 0, 0], [1, 0, 0], ro, wt)
  }
  return { xa: xa + neck, xb: xb - neck, fl }
}

/** Sinusoidal-convolution metal bellows along +X from x0: n convolutions of pitch q, root radius rr, height h, wall t, with cuffs. Returns its length. */
export function bellows(k: Kit, x0: number, n: number, q: number, rr: number, h: number, t: number, cuff: number, mat: MatKey = 'stainless') {
  const out: Profile = [[rr, 0]]
  const L = n * q + 2 * cuff
  const m = 14
  for (let i = 0; i <= n * m; i++) {
    const y = cuff + (i / m) * q
    out.push([rr + h * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / m)), y])
  }
  out.push([rr, L])
  const segs = seg((rr + h) * 2)
  k.lathe(mat, out, [x0, 0, 0], 'x', segs)
  k.lathe(mat, out.map(([r, y]) => [r - t, y] as [number, number]).reverse(), [x0, 0, 0], 'x', segs)
  return L
}

/** Wafer clamped between two WN RF flanges: flanges with faces at ±(w/2 + gasket), spiral-wound gaskets and full studs spanning. */
export function waferFlanges(k: Kit, nps: number, rating: Rating, w: number, schedule: Schedule = 'STD', stub = 0.12) {
  const f = flangeDims(nps, rating)
  const xf = w / 2 + GAP
  for (const s of [-1, 1]) {
    const face: V3 = [s * xf, 0, 0]
    const dir: V3 = [s, 0, 0]
    const base = add(face, dir, f.raisedFaceHeight)
    const i = looseFlange(k, base, [-s, 0, 0], { kind: 'WN', nps, rating, facing: 'RF', schedule })
    const we = s * (xf + f.raisedFaceHeight + i.Y)
    if (stub > 0) {
      pipeStub(k, [we, 0, 0], dir, stub, nps, schedule, 'open', 'bevel')
      buttWeld(k, [we, 0, 0], dir, pipeOD(nps) / 2, pipeWall(nps, schedule))
    }
    k.lathe('gasket', [[pipeOD(nps) / 2 + 0.003, s * (w / 2) + (s < 0 ? -GAP : 0)], [f.raisedFace / 2 - 0.002, s * (w / 2) + (s < 0 ? -GAP : 0)], [f.raisedFace / 2 - 0.002, s * (w / 2) + (s < 0 ? 0 : GAP)], [pipeOD(nps) / 2 + 0.003, s * (w / 2) + (s < 0 ? 0 : GAP)]], [0, 0, 0], 'x', seg(f.raisedFace))
  }
  const span = 2 * (xf + f.raisedFaceHeight + f.thickness) + f.boltDia * 2.2
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, [-span / 2, 0, 0], 'x', f.boltDia, span, [f.boltDia * 0.5, span - f.boltDia * 0.5])
  return { xf, f }
}

/** Fig 1502 union ends relative to the seal plane (typical proportions). */
export function hammerSpan(nps: number) {
  const od = pipeOD(nps)
  const nutL = od * 1.08
  return { xm: -nutL * 0.72 - od * 1.25, xf: nutL * 0.28 + od * 1.35 * 0.55 }
}

/**
 * typical Fig 1502 hammer union about the X axis, seal plane at x = jx: male sub with nose and red three-lug wing nut
 * (-X side), female sub with ACME thread and lip seal (+X side). Returns the outer ends of both subs.
 */
export function hammerUnion(k: Kit, jx: number, nps: number, mat: MatKey = 'valveBody', label = '1502') {
  const od = pipeOD(nps)
  const ri = od / 2 - pipeWall(nps, '160')
  const ringR = od * 0.98
  const nutL = od * 1.08
  const rBody = od * 0.62
  const rFem = ringR * 0.84
  const n = seg(ringR * 2)
  const { xm: dm, xf: df } = hammerSpan(nps)
  const xm = jx + dm
  const xf = jx + df
  // male sub: body, nose shoulder under the nut, seal face at jx
  k.lathe(mat, [[ri, xm], [rBody, xm], [rBody, jx - nutL * 0.8], [rFem * 0.92, jx - nutL * 0.62], [rFem * 0.92, jx - 0.002], [ri + 0.004, jx]], [0, 0, 0], 'x', n)
  // female sub: ACME thread band showing beyond the nut, shoulder, body
  const pitch = 0.0254 / 3
  k.lathe('machined', thread(rFem, rFem, jx + nutL * 0.2, jx + nutL * 0.28 + pitch * 2, pitch, false), [0, 0, 0], 'x', n)
  k.lathe(mat, [[ri + 0.004, jx], [rFem, jx + 0.003], [rFem, jx + nutL * 0.2], [rFem, jx + nutL * 0.28 + pitch * 2], [rFem * 1.04, jx + nutL * 0.34], [rFem * 1.04, jx + nutL * 0.42], [rBody, jx + nutL * 0.5], [rBody, xf], [ri, xf]], [0, 0, 0], 'x', n)
  k.lathe('pipeBore', [[ri, xf], [ri, xm]], [0, 0, 0], 'x', n)
  // lip seal ring proud of the bore at the joint
  k.lathe('rubberBlack', [[ri, jx + 0.006], [ri - 0.002, jx + 0.003], [ri - 0.002, jx - 0.001], [ri, jx - 0.003]], [0, 0, 0], 'x', n)
  // wing nut: ring with three hammer lugs
  const x0 = jx - nutL * 0.72
  const x1 = jx + nutL * 0.28
  k.lathe('actuatorRed', [[rFem * 1.01, x0], [ringR * 0.96, x0], [ringR, x0 + 0.004], [ringR, x1 - 0.004], [ringR * 0.96, x1], [rFem * 1.01, x1]], [0, 0, 0], 'x', n)
  k.lathe('actuatorRed', [[rFem * 1.01, x1], [rFem * 1.01, x0]], [0, 0, 0], 'x', n)
  const lugH = od * 0.5
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i / 3) * Math.PI * 2
    const r = ringR + lugH / 2 - 0.004
    const c = new THREE.Vector3(0, Math.sin(a), Math.cos(a))
    // hammer lug with a striking face
    k.rbox('actuatorRed', [nutL * 0.78, lugH, od * 0.3], od * 0.03, [(x0 + x1) / 2, c.y * r, c.z * r], [0, c.y, c.z])
  }
  stamp(k, label, [0, 0, 0], [1, 0, 0], ringR, x0 + nutL * 0.2, x1 - nutL * 0.2, Math.PI / 3)
  return { xm, xf, ri, rBody, od }
}

/** Hex prism (across flats af) with a round through-hole, from `from` along unit `dir` for len. */
export function hexRing(k: Kit, af: number, rIn: number, from: V3, dir: V3, len: number, mat: MatKey = 'flangeSteel') {
  const R = af / Math.sqrt(3)
  const sh = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    if (i) sh.lineTo(R * Math.cos(a), R * Math.sin(a))
    else sh.moveTo(R * Math.cos(a), R * Math.sin(a))
  }
  sh.closePath()
  if (rIn > 0) {
    const h = new THREE.Path()
    h.absarc(0, 0, rIn, 0, Math.PI * 2, true)
    sh.holes.push(h)
  }
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir))
  k.extrude(mat, sh, len, new THREE.Matrix4().compose(new THREE.Vector3(...from), q, new THREE.Vector3(1, 1, 1)), 24)
}
