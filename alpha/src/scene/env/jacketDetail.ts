/**
 * Fabrication detail shared by the five steel jackets (WORLD coordinates, sea level y = 0).
 * Leaf module: imports only the batch helpers, so jacket.ts / lqJacket.ts / whpJacket.ts / satJacket.ts can
 * all use it without import cycles.
 *
 *  - node cans: thicker short leg sections at the brace nodes, with conical transitions
 *  - brace stubs: the oversized end sections of every brace where it lands on a leg / chord, with a cone
 *    down to the brace OD (so joints read as welded tubular nodes, not intersecting cylinders)
 *  - X-brace crossing cans
 *  - stand-off aluminium anodes (body on two steel core legs) on legs, braces and frame members below
 *    the waterline: denser near the surface (where they can actually be seen through the water), sparse
 *    deeper, none below DETAIL_MIN_Y (−28 m: the underwater tint leaves nothing visible there)
 *  - barge bumpers (vertical fender tubes on stand-off arms) through the splash zone
 *  - J-tubes (cable conduits: battered run down a face, bend at the mudline, bellmouth) with clamps
 *  - caisson guides (sleeve + tie back to the nearest frame member)
 * Small members use 8-12 radial segments; the big cans match the legs closely enough at 24-28.
 */
import * as THREE from 'three'
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, tube } from '../structure/batch'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _s = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

const frusta = new Map<string, THREE.BufferGeometry>()
/** open frustum, bottom radius 1 at y −0.5, top radius `ratio` at y +0.5 */
function frustumGeo(ratio: number, seg: number) {
  const k = `${ratio.toFixed(3)}_${seg}`
  let g = frusta.get(k)
  if (!g) {
    g = new THREE.CylinderGeometry(ratio, 1, 1, seg, 1, true)
    frusta.set(k, g)
  }
  return g
}

/** Conical transition from radius r0 at a to radius r1 at e. */
export function cone(b: GeoBatch, a: V3, e: V3, r0: number, r1: number, seg = 12) {
  _a.set(...a)
  _b.set(...e)
  _c.subVectors(_b, _a)
  const L = _c.length()
  if (L < 1e-6) return
  _q.setFromUnitVectors(UP, _c.divideScalar(L))
  _m.compose(_s.addVectors(_a, _b).multiplyScalar(0.5), _q, new THREE.Vector3(r0, L, r0))
  b.add(frustumGeo(r1 / r0, seg), _m)
}

/**
 * Below about −28 m the underwater tint (envShared.ts UNDERWATER) leaves only the deep-water colour, even
 * from the subsea tour camera: joint detail and anodes deeper than this are not built at all.
 */
export const DETAIL_MIN_Y = -28

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1))
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * Node can on a chord (leg) through node point c, chord direction `axis`: radius R + dr over `length`,
 * with 0.35 m cones back down to R at both ends.
 */
export function nodeCan(b: GeoBatch, c: V3, axis: V3, R: number, length: number, dr = 0.09, seg = 28) {
  if (c[1] < DETAIL_MIN_Y) return
  const u = norm(axis)
  const h = length / 2
  const p0 = add(c, mul(u, -h))
  const p1 = add(c, mul(u, h))
  tube(b, p0, p1, R + dr, seg, true)
  cone(b, p1, add(p1, mul(u, 0.35)), R + dr, R + 0.004, seg)
  cone(b, p0, add(p0, mul(u, -0.35)), R + dr, R + 0.004, seg)
}

/**
 * Brace stub: the end of a brace (from the node centre `node` towards `far`, brace radius r) landing on a
 * chord of radius chordR with direction chordAxis. Oversized section (r + dr) from the chord wall for
 * `stubLen`, then a cone down to r.
 */
export function braceStub(b: GeoBatch, node: V3, far: V3, r: number, chordR: number, chordAxis: V3 = [0, 1, 0], dr = 0.045, seg = 12) {
  if (node[1] < DETAIL_MIN_Y) return
  const d = norm(sub(far, node))
  const s = Math.max(0.35, len(cross(d, norm(chordAxis))))
  const t0 = chordR / s - 0.04
  const stubLen = Math.max(0.9, r * 2.4)
  const p0 = add(node, mul(d, t0))
  const p1 = add(node, mul(d, t0 + stubLen))
  tube(b, p0, p1, r + dr, seg, true)
  cone(b, p1, add(p1, mul(d, 0.22)), r + dr, r + 0.003, seg)
}

/** Can at the crossing of an X-brace (on the through member a→e, at its midpoint). */
export function crossingCan(b: GeoBatch, a: V3, e: V3, r: number, seg = 12) {
  const m = lerp(a, e, 0.5)
  if (m[1] < DETAIL_MIN_Y) return
  const d = norm(sub(e, a))
  const h = Math.max(0.8, r * 2.2)
  tube(b, add(m, mul(d, -h)), add(m, mul(d, h)), r + 0.04, seg, true)
  cone(b, add(m, mul(d, h)), add(m, mul(d, h + 0.18)), r + 0.04, r + 0.003, seg)
  cone(b, add(m, mul(d, -h)), add(m, mul(d, -h - 0.18)), r + 0.04, r + 0.003, seg)
}

/** A tubular brace a→e with stubs at the ends that land on chords (pass null for a free end). */
export function braceWithStubs(
  b: GeoBatch,
  a: V3,
  e: V3,
  r: number,
  seg: number,
  endA: { R: number; axis?: V3 } | null,
  endB: { R: number; axis?: V3 } | null,
) {
  tube(b, a, e, r, seg, true)
  if (endA) braceStub(b, a, e, r, endA.R, endA.axis ?? [0, 1, 0], undefined, Math.min(seg, 12))
  if (endB) braceStub(b, e, a, r, endB.R, endB.axis ?? [0, 1, 0], undefined, Math.min(seg, 12))
}

// ------------------------------------------------------------------ anodes

let _anode: THREE.BufferGeometry | null = null
/**
 * Stand-off anode in a local frame: X along the member, Y radially out from the member wall (origin on
 * the wall), Z tangent. Aluminium body 2.3 m long, 0.26 m wide, 0.21 m deep on two 0.34 m
 * steel core stand-offs (merged into one geometry: the cores read as part of the anode under water).
 */
function anodeGeo() {
  if (_anode) return _anode
  const body = new THREE.BoxGeometry(2.3, 0.21, 0.26)
  body.translate(0, 0.44, 0)
  const parts: THREE.BufferGeometry[] = [body]
  for (const x of [-0.95, 0.95]) {
    const leg = new THREE.BoxGeometry(0.07, 0.36, 0.07)
    leg.translate(x, 0.17, 0)
    parts.push(leg)
  }
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  let base = 0
  for (const g of parts) {
    const ng = g.index ? g.toNonIndexed() : g
    ng.computeVertexNormals()
    const p = ng.getAttribute('position')
    const n = ng.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nor.push(n.getX(i), n.getY(i), n.getZ(i))
      idx.push(base + i)
    }
    base += p.count
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  _anode = g
  return g
}

const _ax = new THREE.Vector3()
const _ay = new THREE.Vector3()
const _az = new THREE.Vector3()
/** One anode on member a→e at fraction t, around the member at angle `ang` (radians), member radius R. */
export function anode(b: GeoBatch, a: V3, e: V3, R: number, t: number, ang: number) {
  const d = norm(sub(e, a))
  // reference "up" perpendicular to the member: world up projected, or world X for vertical-ish members
  const ref: V3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = norm(cross(cross(d, ref), d))
  const w = cross(d, u)
  const rad: V3 = add(mul(u, Math.cos(ang)), mul(w, Math.sin(ang)))
  const c = add(lerp(a, e, t), mul(rad, R))
  _ax.set(...d)
  _ay.set(...rad)
  _az.crossVectors(_ax, _ay)
  _m.makeBasis(_ax, _ay, _az).setPosition(c[0], c[1], c[2])
  b.add(anodeGeo(), _m)
}

/**
 * Anodes along a member: every `pitch` metres where the whole anode is below `top` (default −3 m), kept
 * 1.6 m clear of the member ends; spacing doubles below −16 m, none below DETAIL_MIN_Y. Alternates sides.
 */
export function anodesAlong(b: GeoBatch, a: V3, e: V3, R: number, pitch = 6, top = -3, phase = 0) {
  const L = len(sub(e, a))
  if (L < 4) return
  let k = 0
  for (let s = 1.6 + (Math.abs(phase * 1.7) % 2); s < L - 1.6; s += pitch) {
    const t = s / L
    const p = lerp(a, e, t)
    if (p[1] > top - 1.3 || p[1] < DETAIL_MIN_Y) continue
    if (p[1] < -16 && k % 2 === 1) {
      k++
      continue
    }
    anode(b, a, e, R, t, phase + (k % 2 ? Math.PI * 0.9 : 0))
    k++
  }
}

// ------------------------------------------------------------------ splash-zone furniture

/**
 * Barge bumper on a leg: vertical fender tube (OD 0.6 m) from −5 to +6 m, `off` metres out from the leg
 * axis along the horizontal unit `dir`, on three stand-off arms with knee braces; cone caps.
 */
export function bargeBumper(b: GeoBatch, legAt: (y: number) => V3, dir: [number, number], off: number) {
  const [dx, dz] = dir
  const P = (y: number): V3 => {
    const l = legAt(y)
    return [l[0] + dx * off, y, l[2] + dz * off]
  }
  const r = 0.3
  tube(b, P(-5), P(6), r, 14, true)
  cone(b, P(6), [P(6)[0], 6.6, P(6)[2]], r, 0.06, 14)
  cone(b, P(-5), [P(-5)[0], -5.5, P(-5)[2]], r, 0.06, 14)
  for (const y of [-3.5, 1.0, 5.2]) {
    const l = legAt(y)
    tube(b, [l[0], y, l[2]], P(y), 0.2, 10, true)
    // knee brace below each arm
    tube(b, [l[0] + dx * (off * 0.45), y, l[2] + dz * (off * 0.45)], P(y - 1.0), 0.12, 8, true)
  }
}

/**
 * J-tube: from the top flange `top` (above the cellar deck, vertical down to `kinkY`), then following the
 * battered face `at(y)` (x, z of the tube centre at height y) down to `bendY`, a 90° bend of radius `rb`
 * out along horizontal `out`, and a bellmouth. Clamps (ring + tie bar to `tieAt(y)`) at `clampYs`.
 */
export function jTube(
  b: GeoBatch,
  clamp: GeoBatch,
  at: (y: number) => V3,
  topY: number,
  bendY: number,
  out: [number, number],
  r: number,
  clampYs: number[],
  tieAt: (y: number) => V3,
) {
  const seg = 12
  const top = at(topY)
  const bend0 = at(bendY)
  // straight run (the face is battered below the kink; at() already follows it)
  const knots = [topY, 19, bendY].filter((y, i, arr) => i === 0 || y < arr[i - 1])
  for (let i = 0; i < knots.length - 1; i++) tube(b, at(knots[i]), at(knots[i + 1]), r, seg, true)
  // seal housing on top + top flange
  tube(b, [top[0], topY - 0.05, top[2]], [top[0], topY + 0.35, top[2]], r + 0.07, seg, false)
  tube(b, [top[0], topY + 0.35, top[2]], [top[0], topY + 0.42, top[2]], r + 0.12, seg, false)
  // bend: quarter circle in the vertical plane through `out`
  const rb = 4.5
  const n = 6
  const [ox, oz] = out
  const centre: V3 = [bend0[0] + ox * rb, bendY, bend0[2] + oz * rb]
  let prev = bend0
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2)
    const p: V3 = [centre[0] - ox * rb * Math.cos(a), bendY - rb * Math.sin(a), centre[2] - oz * rb * Math.cos(a)]
    tube(b, prev, p, r, seg, true)
    prev = p
  }
  // short horizontal tail + bellmouth
  const tail: V3 = [prev[0] + ox * 1.2, prev[1], prev[2] + oz * 1.2]
  tube(b, prev, tail, r, seg, true)
  cone(b, tail, [tail[0] + ox * 0.9, tail[1], tail[2] + oz * 0.9], r, r * 2.1, seg)
  // clamps
  for (const y of clampYs) {
    const p = at(y)
    tube(clamp, [p[0], y - 0.22, p[2]], [p[0], y + 0.22, p[2]], r + 0.05, seg, true)
    bar(clamp, p, tieAt(y), 0.14, 0.18)
  }
}

/** Caisson guide at height y: sleeve round the caisson (radius r) + tie bar to `tie` (on a frame member). */
export function caissonGuide(b: GeoBatch, x: number, z: number, y: number, r: number, tie: V3) {
  tube(b, [x, y - 0.4, z], [x, y + 0.4, z], r + 0.1, 16, false)
  cone(b, [x, y - 0.4, z], [x, y - 0.65, z], r + 0.1, r + 0.02, 16)
  const d = norm(sub(tie, [x, y, z]))
  tube(b, [x + d[0] * (r + 0.05), y, z + d[2] * (r + 0.05)], tie, 0.17, 10, true)
}

/** Nearest point to p on a set of segments (used to tie guides back to the nearest frame member). */
export function nearestOnSegments(p: V3, segs: [V3, V3][]): V3 {
  let best: V3 = segs[0][0]
  let bd = Infinity
  for (const [a, e] of segs) {
    const ab = sub(e, a)
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)))
    const q = lerp(a, e, t)
    const d = len(sub(q, p))
    if (d < bd) {
      bd = d
      best = q
    }
  }
  return best
}

/** Generic 4-leg jacket description (LQ, WHP-N, RP, WI): enough to lay the shared detail on it. */
export interface JacketShape {
  at: (sx: number, sz: number, y: number) => V3
  kinkY: number
  seabed: number
  frames: number[]
  legOD: number
  braceOD: number
  frameOD: number
  /** plan-diagonal radius at the frames */
  planR: number
  /** K-brace apex height in the top bay + K-brace radius */
  kTopY: number
  kR: number
}

const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

/**
 * Node cans, brace stubs, crossing cans and anodes for the standard X-braced 4-leg jacket (the topology
 * lqJacket / whpJacket / satJacket draw: perimeter + plan-X frames, X-braced faces between frames, K-braces
 * in the top bay). Members themselves are drawn by the jacket builders.
 */
export function standardJacketDetail(steel: GeoBatch, anodeB: GeoBatch, J: JacketShape) {
  const R = J.legOD / 2
  const rb = J.braceOD / 2
  const rf = J.frameOD / 2
  const legAxis = (sx: number, sz: number): V3 => sub(J.at(sx, sz, J.kinkY), J.at(sx, sz, J.seabed))
  // node cans at every frame on every leg
  for (const [sx, sz] of CORNERS) for (const y of J.frames) nodeCan(steel, J.at(sx, sz, y), legAxis(sx, sz), R, Math.max(2.4, J.braceOD * 3.4), 0.08, 24)
  // frame members: perimeter stubs at both legs, plan diagonals
  for (const y of J.frames) {
    const P = CORNERS.map(([sx, sz]) => J.at(sx, sz, y))
    for (let i = 0; i < 4; i++) {
      const a = P[i]
      const e = P[(i + 1) % 4]
      braceStub(steel, a, e, rf, R, legAxis(...CORNERS[i]))
      braceStub(steel, e, a, rf, R, legAxis(...CORNERS[(i + 1) % 4]))
      if (y < -2) anodesAlong(anodeB, a, e, rf, 7, -3, i * 0.7)
    }
    for (const [i, k] of [
      [0, 2],
      [1, 3],
    ]) {
      braceStub(steel, P[i], P[k], J.planR, R, legAxis(...CORNERS[i]))
      braceStub(steel, P[k], P[i], J.planR, R, legAxis(...CORNERS[k]))
    }
  }
  // X-braced faces
  for (let f = 0; f < J.frames.length - 1; f++) {
    const [yt, yb] = [J.frames[f], J.frames[f + 1]]
    for (let i = 0; i < 4; i++) {
      const [ax, az] = CORNERS[i]
      const [bx, bz] = CORNERS[(i + 1) % 4]
      const d1: [V3, V3] = [J.at(ax, az, yt), J.at(bx, bz, yb)]
      const d2: [V3, V3] = [J.at(bx, bz, yt), J.at(ax, az, yb)]
      braceStub(steel, d1[0], d1[1], rb, R, legAxis(ax, az))
      braceStub(steel, d1[1], d1[0], rb, R, legAxis(bx, bz))
      braceStub(steel, d2[0], d2[1], rb, R, legAxis(bx, bz))
      braceStub(steel, d2[1], d2[0], rb, R, legAxis(ax, az))
      crossingCan(steel, d1[0], d1[1], rb)
      anodesAlong(anodeB, d1[0], d1[1], rb, 7.5, -3, i + f)
      anodesAlong(anodeB, d2[0], d2[1], rb, 7.5, -3, i + f + 1.3)
    }
  }
  // K-braces in the top bay: stub at the leg end
  for (let i = 0; i < 4; i++) {
    const [ax, az] = CORNERS[i]
    const [bx, bz] = CORNERS[(i + 1) % 4]
    const A = J.at(ax, az, J.frames[0])
    const B = J.at(bx, bz, J.frames[0])
    const k0 = J.at(ax, az, J.kinkY)
    const k1 = J.at(bx, bz, J.kinkY)
    const top: V3 = [(k0[0] + k1[0]) / 2, J.kTopY, (k0[2] + k1[2]) / 2]
    braceStub(steel, A, top, J.kR, R, legAxis(ax, az))
    braceStub(steel, B, top, J.kR, R, legAxis(bx, bz))
  }
  // legs: anodes from just below the splash zone to the mudline, two azimuths per level
  for (const [sx, sz] of CORNERS) {
    const a = J.at(sx, sz, J.seabed + 2)
    const e = J.at(sx, sz, -2)
    const inward = Math.atan2(-sz, -sx)
    anodesAlong(anodeB, a, e, R, 6.5, -3, inward)
    anodesAlong(anodeB, a, e, R, 6.5, -3, inward + Math.PI * 0.55)
  }
}

