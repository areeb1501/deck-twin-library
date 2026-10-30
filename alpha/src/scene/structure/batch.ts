/**
 * Geometry batching for static steelwork.
 *
 * Everything static is appended into a GeoBatch (one per material) as transformed copies of a
 * handful of cached unit primitives, then emitted as ONE indexed BufferGeometry. This keeps the
 * deck to a few dozen draw calls while every member stays a real 3-D solid (crisp box normals).
 *
 * Conventions: all helpers take points in the frame of the batch (deck-local for DeckStructure,
 * world for Surroundings). Never pass mirrored matrices (negative determinant) — winding would flip.
 */
import * as THREE from 'three'
import { SECTIONS, type SectionName } from '../../model/catalog'

export type V3 = [number, number, number]

const _m = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _nm = new THREE.Matrix3()
const _v = new THREE.Vector3()
const _n = new THREE.Vector3()

export type UvMode = 'keep' | 'world'

export class GeoBatch {
  private pos: number[] = []
  private nor: number[] = []
  private uv: number[] = []
  private idx: number[] = []
  private count = 0

  get vertexCount() {
    return this.count
  }

  /**
   * Append `geo` transformed by `m`.
   * uvMode 'world': planar UVs from the transformed position, axis chosen per vertex by the
   * dominant normal component (tri-planar-ish, in metres * uvScale). Used for grating & facades.
   */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, uvMode: UvMode = 'keep', uvScale = 1) {
    const p = geo.getAttribute('position') as THREE.BufferAttribute
    const n = geo.getAttribute('normal') as THREE.BufferAttribute | undefined
    const t = geo.getAttribute('uv') as THREE.BufferAttribute | undefined
    _nm.getNormalMatrix(m)
    const base = this.count
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m)
      this.pos.push(_v.x, _v.y, _v.z)
      if (n) _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize()
      else _n.set(0, 1, 0)
      this.nor.push(_n.x, _n.y, _n.z)
      if (uvMode === 'world') {
        const ax = Math.abs(_n.x)
        const ay = Math.abs(_n.y)
        const az = Math.abs(_n.z)
        if (ay >= ax && ay >= az) this.uv.push(_v.x * uvScale, _v.z * uvScale)
        else if (ax >= az) this.uv.push(_v.z * uvScale, _v.y * uvScale)
        else this.uv.push(_v.x * uvScale, _v.y * uvScale)
      } else if (t) this.uv.push(t.getX(i), t.getY(i))
      else this.uv.push(0, 0)
    }
    if (geo.index) {
      const a = geo.index.array
      for (let i = 0; i < a.length; i++) this.idx.push(a[i] + base)
    } else {
      for (let i = 0; i < p.count; i++) this.idx.push(base + i)
    }
    this.count += p.count
    return this
  }

  build(): THREE.BufferGeometry | null {
    if (this.count === 0) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

/** A named set of batches, one per material key. */
export class Batches<K extends string = string> {
  map = new Map<K, GeoBatch>()
  get(k: K) {
    let b = this.map.get(k)
    if (!b) {
      b = new GeoBatch()
      this.map.set(k, b)
    }
    return b
  }
  buildAll() {
    const out: { key: K; geometry: THREE.BufferGeometry }[] = []
    for (const [key, b] of this.map) {
      const geometry = b.build()
      if (geometry) out.push({ key, geometry })
    }
    return out
  }
}

// ------------------------------------------------------------------ unit primitives (cached)

const prim = new Map<string, THREE.BufferGeometry>()
function cachedPrim(key: string, make: () => THREE.BufferGeometry) {
  let g = prim.get(key)
  if (!g) {
    g = make()
    prim.set(key, g)
  }
  return g
}
export const unitBox = () => cachedPrim('box', () => new THREE.BoxGeometry(1, 1, 1))
/** Unit cylinder along +Y, radius 1, height 1 centred at origin. */
export const unitCyl = (seg = 12, open = true) =>
  cachedPrim(`cyl${seg}${open}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open))
export const unitSphere = (w = 12, h = 8) => cachedPrim(`sph${w}_${h}`, () => new THREE.SphereGeometry(1, w, h))
/** Unit plane facing +Y (1 x 1 in XZ). */
export const unitPlaneY = () =>
  cachedPrim('planeY', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))

// ------------------------------------------------------------------ frames

const X = new THREE.Vector3()
const Y = new THREE.Vector3()
const Z = new THREE.Vector3()
const UPV = new THREE.Vector3()

/**
 * Member frame: local X along a->b (length L), local Y = `up` projected perpendicular to the
 * axis (the section "depth" direction), local Z = X x Y. Origin at a.
 */
export function memberFrame(a: V3, b: V3, up: V3 = [0, 1, 0], out = new THREE.Matrix4()) {
  X.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const L = X.length()
  X.divideScalar(L || 1)
  UPV.set(up[0], up[1], up[2]).normalize()
  if (Math.abs(X.dot(UPV)) > 0.995) {
    // axis parallel to up: pick another reference
    UPV.set(Math.abs(X.x) < 0.9 ? 1 : 0, 0, Math.abs(X.x) < 0.9 ? 0 : 1)
  }
  Z.crossVectors(X, UPV).normalize()
  Y.crossVectors(Z, X).normalize()
  out.makeBasis(X, Y, Z)
  out.setPosition(a[0], a[1], a[2])
  return { m: out, L }
}

/** Box in a member frame: centre (cx, cy, cz) and size (sx, sy, sz) in local axes. */
export function boxInFrame(b: GeoBatch, frame: THREE.Matrix4, c: V3, s: V3, uv: UvMode = 'keep', uvScale = 1) {
  _m2.makeScale(s[0], s[1], s[2]).setPosition(c[0], c[1], c[2])
  _m.multiplyMatrices(frame, _m2)
  b.add(unitBox(), _m, uv, uvScale)
}

/** Axis-aligned box given centre and size. */
export function box(b: GeoBatch, c: V3, s: V3, uv: UvMode = 'keep', uvScale = 1) {
  _m.makeScale(s[0], s[1], s[2]).setPosition(c[0], c[1], c[2])
  b.add(unitBox(), _m, uv, uvScale)
}
/** Axis-aligned box from min/max corners. */
export function boxMinMax(b: GeoBatch, min: V3, max: V3, uv: UvMode = 'keep', uvScale = 1) {
  box(b, [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], [max[0] - min[0], max[1] - min[1], max[2] - min[2]], uv, uvScale)
}
/** Box rotated about Y. */
export function boxRotY(b: GeoBatch, c: V3, s: V3, ry: number) {
  _m.makeRotationY(ry)
  _m2.makeScale(s[0], s[1], s[2])
  _m.multiply(_m2).setPosition(c[0], c[1], c[2])
  b.add(unitBox(), _m)
}

/** Rectangular bar from a to b, cross-section w (local Z) x h (local Y = up). */
export function bar(b: GeoBatch, a: V3, e: V3, w: number, h: number, up: V3 = [0, 1, 0], uv: UvMode = 'keep') {
  const { m, L } = memberFrame(a, e, up)
  boxInFrame(b, m, [L / 2, 0, 0], [L, h, w], uv)
}

/** Tube (cylinder) between two points. */
export function tube(b: GeoBatch, a: V3, e: V3, r: number, seg = 10, open = true) {
  const dx = e[0] - a[0]
  const dy = e[1] - a[1]
  const dz = e[2] - a[2]
  const L = Math.hypot(dx, dy, dz)
  if (L < 1e-6) return
  _v.set(dx / L, dy / L, dz / L)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v)
  _m.compose(new THREE.Vector3((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2), q, new THREE.Vector3(r, L, r))
  b.add(unitCyl(seg, open), _m)
}

export function sphere(b: GeoBatch, c: V3, r: number, w = 12, h = 8) {
  _m.makeScale(r, r, r).setPosition(c[0], c[1], c[2])
  b.add(unitSphere(w, h), _m)
}

/** Arbitrary geometry placed with position / rotation(Euler XYZ) / scale. */
export function place(b: GeoBatch, g: THREE.BufferGeometry, p: V3, r: V3 = [0, 0, 0], s: V3 = [1, 1, 1], uv: UvMode = 'keep', uvScale = 1) {
  _m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s))
  b.add(g, _m, uv, uvScale)
}

// ------------------------------------------------------------------ steel sections

/**
 * Rolled I/H section along a->b. a/b are points on the section CENTROID line; `up` is the web
 * (depth) direction. Built from 3 boxes: 2 flanges + web — crisp, indexed, 36 triangles.
 */
export function ibeam(b: GeoBatch, a: V3, e: V3, up: V3, section: SectionName | { d: number; b: number; tw: number; tf: number }) {
  const s = typeof section === 'string' ? SECTIONS[section] : section
  const { m, L } = memberFrame(a, e, up)
  const hy = s.d / 2
  boxInFrame(b, m, [L / 2, hy - s.tf / 2, 0], [L, s.tf, s.b])
  boxInFrame(b, m, [L / 2, -hy + s.tf / 2, 0], [L, s.tf, s.b])
  boxInFrame(b, m, [L / 2, 0, 0], [L, s.d - 2 * s.tf, s.tw])
}

/** Horizontal beam given TOP OF STEEL height; a/b are (x, z) in plan. Web vertical. */
export function beamTOS(b: GeoBatch, x0: number, z0: number, x1: number, z1: number, tos: number, section: SectionName) {
  const d = SECTIONS[section].d
  const y = tos - d / 2
  ibeam(b, [x0, y, z0], [x1, y, z1], [0, 1, 0], section)
}

/** Channel (UPN-like) along a->b; web in the local Z=0 plane... flanges point to +`open` side. */
export function channel(b: GeoBatch, a: V3, e: V3, up: V3, d: number, bf: number, tw: number, tf: number, openSign = 1) {
  const { m, L } = memberFrame(a, e, up)
  // web at local z = 0 .. tw (towards open side flanges extend to bf)
  const zw = openSign * (tw / 2)
  boxInFrame(b, m, [L / 2, 0, zw], [L, d, tw])
  const zf = openSign * (bf / 2)
  boxInFrame(b, m, [L / 2, d / 2 - tf / 2, zf], [L, tf, bf])
  boxInFrame(b, m, [L / 2, -d / 2 + tf / 2, zf], [L, tf, bf])
}

/** Equal angle L along a->b; legs extend along +local Y and +local Z from the heel. */
export function angle(b: GeoBatch, a: V3, e: V3, up: V3, leg: number, t: number) {
  const { m, L } = memberFrame(a, e, up)
  boxInFrame(b, m, [L / 2, leg / 2, t / 2], [L, leg, t])
  boxInFrame(b, m, [L / 2, t / 2, leg / 2], [L, t, leg])
}

/**
 * Split [min, max] into spans that avoid the given obstacles (centre +- half). Used to trim
 * secondary beams so they frame between primaries (no overlapping coplanar flanges).
 */
export function spans(min: number, max: number, cuts: { at: number; half: number }[]): [number, number][] {
  const cs = cuts.filter((c) => c.at + c.half > min && c.at - c.half < max).sort((p, q) => p.at - q.at)
  const out: [number, number][] = []
  let s = min
  for (const c of cs) {
    const e = c.at - c.half
    if (e - s > 0.05) out.push([s, e])
    s = Math.max(s, c.at + c.half)
  }
  if (max - s > 0.05) out.push([s, max])
  return out
}
