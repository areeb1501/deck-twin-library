/**
 * Geometry helpers for the procedural people (walk-mode avatar, field workers).
 *
 * A figure segment is a list of `Piece`s — [geometry, surface slot, options] — merged by `mergePieces` into ONE
 * BufferGeometry: per-vertex colours from the slot palette (or a per-piece colour / per-vertex function), optional
 * box-projected UVs in metres (for the tiling cloth / leather / skin bump maps), optional draw groups per slot
 * (avatar: one material per surface) or a per-vertex `tint` channel (workers: per-instance coverall / skin / hair
 * colour, see crowd.ts). Mirroring in X (left limbs) flips the winding back so faces stay front-facing.
 */
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export type P2 = [number, number] // [radius, y]
export type V3 = [number, number, number]
/** per-vertex colour: `out` holds the piece colour on entry (linear) */
export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void
export interface PieceOpts {
  /** colour (sRGB hex) instead of the slot default */
  c?: string
  /** shade multiplier (seams, panels) */
  k?: number
  /** workers: tint channel (0 fixed colour, 1 instance colour, 2 instance accent); default from the slot */
  t?: number
  /** avatar: per-vertex colour variation */
  fn?: ColorFn
  /** paint triangles whose centre lies in [y0, y1] as another surface (LO tape / panels without extra geometry) */
  bands?: Band[]
}
export type Piece = [THREE.BufferGeometry, number, PieceOpts?]
export type Band = [number, number, number, PieceOpts?]

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const Y = new THREE.Vector3(0, 1, 0)

/** transform a geometry in place: scale, then rotate (Euler XYZ), then translate */
export function put(g: THREE.BufferGeometry, p: number[] = [0, 0, 0], r: number[] = [0, 0, 0], s: number[] = [1, 1, 1]) {
  g.applyMatrix4(_m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2])))
  return g
}
/** lathe about +Y from [radius, y] points (increasing y → outward normals); phi 0 = +Z, π = −Z (front) */
export const lathe = (pts: P2[], seg = 16, phiStart = 0, phiLength = Math.PI * 2) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
    phiStart,
    phiLength,
  )
/** elliptical lathe (x / z radius scale) */
export const ell = (pts: P2[], sx: number, sz: number, seg = 16) => put(lathe(pts, seg), [0, 0, 0], [0, 0, 0], [sx, 1, sz])
export function radiusAt(pts: P2[], y: number) {
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1]
    const [r1, y1] = pts[i]
    if (y >= y0 && y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)
  }
  return y < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0]
}
/** a band hugging a lathe profile between y0 and y1 (tape, belt, cuffs); `extra` adds rows (for colour bands) */
export function band(pts: P2[], y0: number, y1: number, out: number, sx = 1, sz = 1, seg = 16, rows = 3, extra: number[] = []) {
  const ys = new Set<number>()
  for (let i = 0; i <= rows; i++) ys.add(y0 + ((y1 - y0) * i) / rows)
  for (const y of extra) if (y > y0 && y < y1) ys.add(y)
  const ring: P2[] = []
  // closed edges: step in at the top and bottom so the band has a visible thickness
  ring.push([radiusAt(pts, y0) + out * 0.3, y0])
  for (const y of [...ys].sort((a, b) => a - b)) ring.push([radiusAt(pts, y) + out, y])
  ring.push([radiusAt(pts, y1) + out * 0.3, y1])
  return ell(ring, sx, sz, seg)
}
/** a profile with extra points at the given heights (so colour bands get crisp edges) */
export function withRows(pts: P2[], ys: number[]): P2[] {
  const out = pts.slice()
  for (const y of ys) if (y > pts[0][1] && y < pts[pts.length - 1][1] && !out.some((p) => Math.abs(p[1] - y) < 1e-6)) out.push([radiusAt(pts, y), y])
  return out.sort((a, b) => a[1] - b[1])
}
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
export const rbox = (w: number, h: number, d: number, r: number, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999)
export const sphere = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h)
export const cyl = (rt: number, rb: number, h: number, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)
/** a capsule (or cylinder when `caps` is false) from a to b */
export function between(a: V3, b: V3, r: number, radial = 8, caps = true) {
  _a.set(...a)
  _b.set(...b)
  const len = _a.distanceTo(_b)
  const g = caps ? new THREE.CapsuleGeometry(r, Math.max(1e-4, len), 2, radial) : cyl(r, r, len, radial)
  _c.subVectors(_b, _a).normalize()
  _q.setFromUnitVectors(Y, _c)
  _p.addVectors(_a, _b).multiplyScalar(0.5)
  g.applyMatrix4(_m.compose(_p, _q, _s.set(1, 1, 1)))
  return g
}
/** a smooth tube (straps, cables) through the points */
export function tube(pts: V3[], r: number, seg = 12, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  return new THREE.TubeGeometry(curve, seg, r, radial, false)
}

/**
 * A flat strip (tape, seam, strap) along a polyline: one thin box per segment, `w` wide along `across`,
 * `t` thick, lifted off the surface along `outward(p)` (the surface normal direction at p).
 */
export function ribbon(pts: V3[], across: V3, w: number, t: number, outward: (p: THREE.Vector3) => THREE.Vector3): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const W = new THREE.Vector3(...across)
  const D = new THREE.Vector3()
  const N = new THREE.Vector3()
  const A = new THREE.Vector3()
  const mid = new THREE.Vector3()
  const basis = new THREE.Matrix4()
  for (let i = 1; i < pts.length; i++) {
    const p0 = new THREE.Vector3(...pts[i - 1])
    const p1 = new THREE.Vector3(...pts[i])
    D.subVectors(p1, p0)
    const len = D.length()
    if (len < 1e-5) continue
    D.divideScalar(len)
    A.copy(W).addScaledVector(D, -W.dot(D)).normalize()
    N.crossVectors(A, D).normalize()
    mid.addVectors(p0, p1).multiplyScalar(0.5)
    if (N.dot(outward(mid)) < 0) {
      N.negate()
      A.negate()
    }
    const g = box(w, len + Math.min(0.012, t * 2), t)
    basis.makeBasis(A, D, N).setPosition(mid.addScaledVector(N, t / 2))
    out.push(g.applyMatrix4(basis))
  }
  return out
}

/** move every vertex with `fn`, then rebuild smooth normals (welding the lathe / sphere seams) */
export function deform(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    fn(v)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  return smoothNormals(g)
}
export function smoothNormals(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k)
  const w = mergeVertices(g, 1e-5)
  g.dispose()
  w.computeVertexNormals()
  return w
}

/**
 * A parametric patch p(u, v) on a u × v grid (u around, v down), with normals from central differences
 * (no seams at a closed u). Triangles are wound so the normals face away from `centre`.
 */
export function surface(fn: (u: number, v: number, out: THREE.Vector3) => void, u0: number, u1: number, nu: number, v0: (u: number) => number, v1: (u: number) => number, nv: number, centre: V3): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const p = new THREE.Vector3()
  const pu = new THREE.Vector3()
  const pv = new THREE.Vector3()
  const t = new THREE.Vector3()
  const C = new THREE.Vector3(...centre)
  const e = 1e-3
  for (let i = 0; i <= nu; i++) {
    const u = u0 + ((u1 - u0) * i) / nu
    const a = v0(u)
    const b = v1(u)
    for (let j = 0; j <= nv; j++) {
      const v = a + ((b - a) * j) / nv
      fn(u, v, p)
      pos.push(p.x, p.y, p.z)
      fn(u + e, v, pu)
      fn(u - e, v, t)
      pu.sub(t)
      fn(u, v + e, pv)
      fn(u, v - e, t)
      pv.sub(t)
      t.crossVectors(pu, pv)
      // at a pole one derivative vanishes: point straight out from the centre
      if (t.lengthSq() < 1e-14) t.subVectors(p, C)
      t.normalize()
      if (t.dot(_a.subVectors(p, C)) < 0) t.negate()
      nor.push(t.x, t.y, t.z)
    }
  }
  const idx: number[] = []
  const row = nv + 1
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * row + j
      const b = (i + 1) * row + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  // wind every triangle to agree with its vertex normals
  for (let k = 0; k < idx.length; k += 3) {
    _a.fromArray(pos, idx[k] * 3)
    _b.fromArray(pos, idx[k + 1] * 3)
    _c.fromArray(pos, idx[k + 2] * 3)
    t.subVectors(_b, _a).cross(_c.sub(_a))
    const n = _b.fromArray(nor, idx[k] * 3).add(_c.fromArray(nor, idx[k + 1] * 3)).add(_a.fromArray(nor, idx[k + 2] * 3))
    if (t.dot(n) < 0) {
      const s = idx[k + 1]
      idx[k + 1] = idx[k + 2]
      idx[k + 2] = s
    }
  }
  g.setIndex(idx)
  return g
}

// ---------------------------------------------------------------- merging

export interface MergeOpts {
  /** default colour (sRGB hex) per slot */
  palette: Record<number, string>
  mirror?: boolean
  /** avatar: one draw group per slot (material index = slot) */
  groups?: boolean
  /** avatar: box-projected UVs in metres for the tiling bump maps */
  uv?: boolean
  /** workers: per-vertex tint channel; default per slot */
  tint?: Record<number, number>
}

const _col = new THREE.Color()
const _pv = new THREE.Vector3()
const _nv = new THREE.Vector3()

/** merge pieces into one geometry (non-indexed): position, normal, color [, uv] [, tint] [, groups per slot] */
export function mergePieces(pieces: Piece[], o: MergeOpts): THREE.BufferGeometry {
  interface Part {
    slot: number
    pos: Float32Array
    nor: Float32Array
    col: Float32Array
    uv?: Float32Array
    tint?: Float32Array
  }
  const parts: Part[] = []
  for (const [g0, slot, po = {}] of pieces) {
    const g = g0.index ? g0.toNonIndexed() : g0
    if (g !== g0) g0.dispose()
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    const pos = Float32Array.from(g.getAttribute('position').array as ArrayLike<number>)
    const nor = Float32Array.from(g.getAttribute('normal').array as ArrayLike<number>)
    g.dispose()
    const n = pos.length / 3
    if (o.mirror)
      for (let i = 0; i < n; i++) {
        pos[i * 3] = -pos[i * 3]
        nor[i * 3] = -nor[i * 3]
      }
    const tint = o.tint ? (po.t ?? o.tint[slot] ?? 0) : 0
    const col = new Float32Array(n * 3)
    const base = new THREE.Color(tint > 0 ? '#ffffff' : (po.c ?? o.palette[slot] ?? '#ff00ff')).multiplyScalar(po.k ?? 1)
    for (let i = 0; i < n; i++) {
      _col.copy(base)
      if (po.fn && !o.tint) po.fn(_pv.fromArray(pos, i * 3), _nv.fromArray(nor, i * 3), _col)
      col[i * 3] = _col.r
      col[i * 3 + 1] = _col.g
      col[i * 3 + 2] = _col.b
    }
    const part: Part = { slot, pos, nor, col }
    if (o.tint) part.tint = new Float32Array(n).fill(tint)
    if (po.bands)
      for (let t = 0; t < n; t += 3) {
        const cy = (pos[t * 3 + 1] + pos[t * 3 + 4] + pos[t * 3 + 7]) / 3
        let hit: Band | undefined
        for (const b of po.bands) if (cy >= b[0] && cy <= b[1]) hit = b
        if (!hit) continue
        const [, , bs, bo = {}] = hit
        const bt = o.tint ? (bo.t ?? o.tint[bs] ?? 0) : 0
        _col.set(bt > 0 ? '#ffffff' : (bo.c ?? o.palette[bs] ?? '#ff00ff')).multiplyScalar(bo.k ?? 1)
        for (let k = 0; k < 3; k++) {
          col[(t + k) * 3] = _col.r
          col[(t + k) * 3 + 1] = _col.g
          col[(t + k) * 3 + 2] = _col.b
          if (part.tint) part.tint[t + k] = bt
        }
      }
    if (o.uv) {
      // per triangle, project on the plane of its dominant normal axis (metres)
      const uv = new Float32Array(n * 2)
      for (let t = 0; t < n; t += 3) {
        _a.fromArray(pos, t * 3)
        _b.fromArray(pos, t * 3 + 3).sub(_a)
        _c.fromArray(pos, t * 3 + 6).sub(_a)
        _b.cross(_c)
        const ax = Math.abs(_b.x)
        const ay = Math.abs(_b.y)
        const az = Math.abs(_b.z)
        for (let k = 0; k < 3; k++) {
          const x = pos[(t + k) * 3]
          const y = pos[(t + k) * 3 + 1]
          const z = pos[(t + k) * 3 + 2]
          const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y]
          uv[(t + k) * 2] = u
          uv[(t + k) * 2 + 1] = v
        }
      }
      part.uv = uv
    }
    if (o.mirror) {
      // mirroring flips the winding: swap the 2nd and 3rd vertex of every triangle, in every attribute
      const swap = (a: Float32Array, size: number) => {
        for (let t = 0; t < a.length; t += size * 3)
          for (let k = 0; k < size; k++) {
            const s = a[t + size + k]
            a[t + size + k] = a[t + size * 2 + k]
            a[t + size * 2 + k] = s
          }
      }
      swap(part.pos, 3)
      swap(part.nor, 3)
      swap(part.col, 3)
      if (part.uv) swap(part.uv, 2)
    }
    parts.push(part)
  }
  if (o.groups) parts.sort((a, b) => a.slot - b.slot)
  const count = parts.reduce((s, p) => s + p.pos.length / 3, 0)
  const pos = new Float32Array(count * 3)
  const nor = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const uv = o.uv ? new Float32Array(count * 2) : null
  const tint = o.tint ? new Float32Array(count) : null
  const out = new THREE.BufferGeometry()
  let v = 0
  let gStart = 0
  let gSlot = -1
  for (const p of parts) {
    if (o.groups && p.slot !== gSlot) {
      if (gSlot >= 0) out.addGroup(gStart, v - gStart, gSlot)
      gStart = v
      gSlot = p.slot
    }
    pos.set(p.pos, v * 3)
    nor.set(p.nor, v * 3)
    col.set(p.col, v * 3)
    if (uv && p.uv) uv.set(p.uv, v * 2)
    if (tint && p.tint) tint.set(p.tint, v)
    v += p.pos.length / 3
  }
  if (o.groups && gSlot >= 0) out.addGroup(gStart, v - gStart, gSlot)
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  if (tint) out.setAttribute('tint', new THREE.BufferAttribute(tint, 1))
  out.computeBoundingSphere()
  return out
}

/** gaussian bump */
export const G = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (w * w))
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
