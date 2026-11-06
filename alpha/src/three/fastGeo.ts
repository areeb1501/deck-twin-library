/**
 * Fast paths for the two things every procedural part goes through at start-up: a transform into place and a merge into
 * one buffer. three's versions run per vertex through Vector3 and build the merged index with push(); on 9 000 meshes that
 * was over a second of the load. Both fall back to three for anything that isn't plain indexed position/normal/uv.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Attr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined

const plain = (a: Attr, size: number): a is THREE.BufferAttribute =>
  !!a && !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && a.itemSize === size && !a.normalized && a.array instanceof Float32Array

const nm = new THREE.Matrix3()
const slowApply = THREE.BufferGeometry.prototype.applyMatrix4

/** every translate / rotate / scale / applyMatrix4 on a geometry, in the app, in three's primitives and in the registry, takes the fast path */
export function installFastGeometry() {
  THREE.BufferGeometry.prototype.applyMatrix4 = function (m: THREE.Matrix4) {
    return transformGeometry(this, m)
  }
  THREE.BufferGeometry.prototype.clone = function () {
    return cloneGeometry(this)
  }
}

const slowClone = THREE.BufferGeometry.prototype.clone

/** g.clone() with one copy per array: three's clone copies every attribute twice, and a primitive's clone runs its generator first */
export function cloneGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.constructor !== THREE.BufferGeometry || Object.keys(g.morphAttributes).length) return slowClone.call(g)
  const out = new THREE.BufferGeometry()
  out.name = g.name
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name]
    if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return slowClone.call(g)
    const b = new THREE.BufferAttribute((a.array as Float32Array).slice(), a.itemSize, a.normalized)
    b.gpuType = (a as THREE.BufferAttribute).gpuType
    out.setAttribute(name, b)
  }
  if (g.index) out.setIndex(new THREE.BufferAttribute((g.index.array as Uint32Array).slice(), 1))
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex)
  if (g.boundingBox) out.boundingBox = g.boundingBox.clone()
  if (g.boundingSphere) out.boundingSphere = g.boundingSphere.clone()
  out.drawRange.start = g.drawRange.start
  out.drawRange.count = g.drawRange.count
  out.userData = g.userData
  return out
}

/** g.applyMatrix4(m), on the arrays directly */
export function transformGeometry(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const a = g.attributes
  const e = m.elements
  if (!plain(a.position, 3) || (a.normal && !plain(a.normal, 3)) || a.tangent || e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || e[15] !== 1) return slowApply.call(g, m)
  ;(g as unknown as { _transformed: boolean })._transformed = true
  if (e[0] === 1 && e[5] === 1 && e[10] === 1 && e[1] === 0 && e[2] === 0 && e[4] === 0 && e[6] === 0 && e[8] === 0 && e[9] === 0 && e[12] === 0 && e[13] === 0 && e[14] === 0) return g
  const p = a.position.array as Float32Array
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2]
    p[i] = e[0] * x + e[4] * y + e[8] * z + e[12]
    p[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
    p[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
  }
  a.position.needsUpdate = true
  if (a.normal) {
    const n = nm.getNormalMatrix(m).elements
    const q = a.normal.array as Float32Array
    for (let i = 0; i < q.length; i += 3) {
      const x = q[i], y = q[i + 1], z = q[i + 2]
      const nx = n[0] * x + n[3] * y + n[6] * z
      const ny = n[1] * x + n[4] * y + n[7] * z
      const nz = n[2] * x + n[5] * y + n[8] * z
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz)
      const s = l > 0 ? 1 / l : 0
      q[i] = nx * s
      q[i + 1] = ny * s
      q[i + 2] = nz * s
    }
    a.normal.needsUpdate = true
  }
  if (g.boundingBox) g.computeBoundingBox()
  if (g.boundingSphere) g.computeBoundingSphere()
  return g
}

/** mergeGeometries(geos, useGroups): one group per input when useGroups */
export function mergeFast(geos: THREE.BufferGeometry[], useGroups = false): THREE.BufferGeometry | null {
  if (!geos.length) return null
  return mergeLists(useGroups ? geos.map((g) => [g]) : [geos])
}

/** one geometry from several lists, with one draw group per list (materialIndex = list position) */
export function mergeLists(lists: THREE.BufferGeometry[][]): THREE.BufferGeometry | null {
  let nv = 0
  let ni = 0
  let n = 0
  for (const list of lists)
    for (const g of list) {
      const a = g.attributes
      if (!g.index || Object.keys(a).length !== 3 || !plain(a.position, 3) || !plain(a.normal, 3) || !plain(a.uv, 2)) return slowMerge(lists)
      nv += a.position.count
      ni += g.index.count
      n++
    }
  if (!n) return null
  const pos = new Float32Array(nv * 3)
  const nor = new Float32Array(nv * 3)
  const uv = new Float32Array(nv * 2)
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)
  const out = new THREE.BufferGeometry()
  let vo = 0
  let io = 0
  lists.forEach((list, k) => {
    const start = io
    for (const g of list) {
      const a = g.attributes
      const ia = g.index!.array
      pos.set(a.position.array as Float32Array, vo * 3)
      nor.set(a.normal.array as Float32Array, vo * 3)
      uv.set(a.uv.array as Float32Array, vo * 2)
      if (vo === 0) idx.set(ia, 0)
      else for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo
      vo += a.position.count
      io += ia.length
    }
    if (lists.length > 1 && io > start) out.addGroup(start, io - start, k)
  })
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  return out
}

function slowMerge(lists: THREE.BufferGeometry[][]): THREE.BufferGeometry | null {
  const parts = lists.map((l) => (l.length ? mergeGeometries(l, false) : null))
  const kept = parts.filter((p): p is THREE.BufferGeometry => !!p)
  if (!kept.length) return null
  if (lists.length === 1) return kept[0]
  const out = mergeGeometries(kept, true)
  if (out) {
    const keys = parts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0)
    out.groups.forEach((gr, i) => (gr.materialIndex = keys[i]))
  }
  return out
}

/** boundingBox and boundingSphere from the position array in one pass each (the sphere is centred on the box) */
export function computeBounds(g: THREE.BufferGeometry) {
  const a = g.attributes.position
  if (!plain(a, 3)) {
    g.computeBoundingBox()
    g.computeBoundingSphere()
    return g
  }
  const p = a.array as Float32Array
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  if (p.length === 0) x0 = y0 = z0 = x1 = y1 = z1 = 0
  const box = (g.boundingBox ??= new THREE.Box3())
  box.min.set(x0, y0, z0)
  box.max.set(x1, y1, z1)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2
  let r2 = 0
  for (let i = 0; i < p.length; i += 3) {
    const dx = p[i] - cx, dy = p[i + 1] - cy, dz = p[i + 2] - cz
    const d = dx * dx + dy * dy + dz * dz
    if (d > r2) r2 = d
  }
  const sphere = (g.boundingSphere ??= new THREE.Sphere())
  sphere.center.set(cx, cy, cz)
  sphere.radius = Math.sqrt(r2)
  return g
}

const units = new Map<string, THREE.BufferGeometry>()
/** a clone of a cached unit primitive: building a CylinderGeometry from scratch costs more than copying one and scaling it */
export function unit(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = units.get(key)
  // kept as a plain BufferGeometry: cloning a CylinderGeometry would run its generator again before copying
  if (!g) units.set(key, (g = new THREE.BufferGeometry().copy(make())))
  return cloneGeometry(g)
}
