// Security fence runs and gates: chain-link (BS 1722-10 / ASTM F567) and steel palisade (BS 1722-12), barbed or razor topping.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { meshGuardMaterial } from '../lib/textures'

export type FenceStyle = 'chain-link' | 'palisade'
export type Topping = 'barbed' | 'razor' | 'none'

export interface FenceOpts {
  style: FenceStyle
  /** fabric or pale height above ground, m */
  height: number
  topping: Topping
  /** coating: galvanised or polyester powder-coat colour */
  mat?: MatKey
}

const GALV: MatKey = 'galvanised'
/** typical: line post spacing, m */
export const POST_SPACING: Record<FenceStyle, number> = { 'chain-link': 3.0, palisade: 2.75 }

const v = (a: V3) => new THREE.Vector3(...a)
const arr = (p: THREE.Vector3) => p.toArray() as V3

function frame(a: V3, b: V3) {
  const A = v(a)
  const d = v(b).sub(A)
  d.y = 0
  const L = d.length()
  d.normalize()
  const n = new THREE.Vector3(-d.z, 0, d.x)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d)
  return { A, d, n, L, q }
}

/** Concrete footing collar at grade around a post. */
function collar(k: Kit, p: V3, r: number) {
  k.cyl('concrete', r, 0.06, [p[0], p[1] + 0.03, p[2]], 'y', 14, r * 0.8)
}

/** One post. Terminal posts are heavier. The topping arm leans to the `out` side. */
export function fencePost(k: Kit, p: V3, o: FenceOpts, along: THREE.Vector3, out: THREE.Vector3, terminal = false) {
  const mat = o.mat ?? GALV
  const H = o.height
  if (o.style === 'chain-link') {
    const r = terminal ? 0.038 : 0.03
    collar(k, p, r * 4)
    k.cyl(mat, r, H + 0.05, [p[0], p[1] + (H + 0.05) / 2, p[2]], 'y', 12)
    k.dome(mat, r * 1.15, [p[0], p[1] + H + 0.05, p[2]], 'y', Math.PI / 2, 0.6, 12)
  } else {
    // RSJ-style post 102 x 44, typical
    collar(k, p, 0.16)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), along)
    k.box(mat, [0.044, H + 0.1, 0.006], [p[0], p[1] + (H + 0.1) / 2, p[2]], q)
    for (const s of [-1, 1]) k.box(mat, [0.006, H + 0.1, 0.102], arr(v(p).addScaledVector(along, s * 0.019).setY(p[1] + (H + 0.1) / 2)), q)
    k.box(mat, [0.06, 0.006, 0.12], [p[0], p[1] + H + 0.1, p[2]], q)
  }
  topping(k, p, o, out)
}

function armTop(p: V3, o: FenceOpts, out: THREE.Vector3) {
  const y = p[1] + o.height + (o.style === 'palisade' ? 0.1 : 0.05)
  return { y, tip: arr(v(p).addScaledVector(out, 0.32).setY(y + 0.32)), base: [p[0], y, p[2]] as V3 }
}

function topping(k: Kit, p: V3, o: FenceOpts, out: THREE.Vector3) {
  if (o.topping === 'none') return
  const { base, tip } = armTop(p, o, out)
  if (o.topping === 'barbed') k.rod(o.mat ?? GALV, base, tip, 0.012, 6)
  else {
    k.rod(o.mat ?? GALV, base, [base[0], base[1] + 0.3, base[2]], 0.012, 6)
    k.rod(o.mat ?? GALV, [base[0], base[1] + 0.3, base[2]], arr(v(base).addScaledVector(out, 0.15).setY(base[1] + 0.3)), 0.01, 6)
  }
}

/** Fence run from a to b (ground points), posts at both ends unless `startPost` is false. Returns post count. */
export function fenceRun(k: Kit, a: V3, b: V3, o: FenceOpts, startPost = true, out?: V3) {
  const { A, d, n, L, q } = frame(a, b)
  if (L < 0.05) return 0
  const outV = out ? v(out).normalize() : n.clone()
  const mat = o.mat ?? GALV
  const bays = Math.max(1, Math.ceil(L / POST_SPACING[o.style]))
  const bl = L / bays
  const H = o.height
  const at = (s: number, y: number) => arr(A.clone().addScaledVector(d, s).setY(a[1] + y))
  for (let i = startPost ? 0 : 1; i <= bays; i++) fencePost(k, at(i * bl, 0), o, d, outV, i === 0 || i === bays)
  const mid = (y: number) => at(L / 2, y)
  if (o.style === 'chain-link') {
    // top rail, bottom tension wire, fabric (50 mm diamond mesh)
    k.rod(mat, at(0, H - 0.02), at(L, H - 0.02), 0.021, 8)
    k.rod(mat, at(0, 0.06), at(L, 0.06), 0.003, 4)
    k.rod(mat, at(0, H * 0.5), at(L, H * 0.5), 0.003, 4)
    const geo = new THREE.PlaneGeometry(L, H - 0.04)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * L) / 0.2, (uv.getY(i) * (H - 0.04)) / 0.2)
    k.add(fabric(mat), geo, new THREE.Matrix4().compose(v(mid((H - 0.04) / 2 + 0.03)).addScaledVector(n, 0.035), q, new THREE.Vector3(1, 1, 1)))
    // diagonal braces at terminal posts
    for (const [s0, s1] of [[0, Math.min(bl, 1.6)], [L, L - Math.min(bl, 1.6)]]) k.rod(mat, at(s0, H * 0.8), at(s1, 0.15), 0.017, 6)
  } else {
    // two (three above 2.4 m) angle rails, W-section pales with triple-pointed heads
    const rails = H > 2.3 ? [0.3, H / 2, H - 0.35] : [0.3, H - 0.35]
    for (const y of rails) {
      k.box(mat, [L, 0.05, 0.006], mid(y), q)
      k.box(mat, [L, 0.006, 0.05], arr(v(mid(y + 0.022)).addScaledVector(n, 0.025)), q)
    }
    const pitch = 0.155 // typical: 65 mm pale, 90 mm gap
    const np = Math.max(1, Math.floor((L - 0.05) / pitch))
    const off = (L - (np - 1) * pitch) / 2
    const pale = paleGeometry(H)
    for (let i = 0; i < np; i++) {
      const p = v(at(off + i * pitch, 0)).addScaledVector(n, 0.05)
      k.addShared(mat, pale, new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)))
      k.hex('nut', 0.016, 0.01, arr(p.clone().addScaledVector(n, 0.022).setY(a[1] + rails[rails.length - 1])), arr(n))
    }
  }
  // topping strands or razor coil, carried on the arms
  if (o.topping !== 'none') {
    const { y, tip } = armTop(arr(A), o, outV)
    const off = v(tip).sub(A.clone().setY(y))
    if (o.topping === 'barbed')
      for (const t of [0.35, 0.68, 1]) {
        const p0 = arr(A.clone().setY(y).addScaledVector(off, t))
        k.rod(mat, p0, arr(v(p0).addScaledVector(d, L)), 0.0025, 4)
      }
    else razorCoil(k, arr(A.clone().setY(y + 0.3).addScaledVector(outV, 0.08)), d, L, 0.45)
  }
  return bays + (startPost ? 1 : 0)
}

const fab = new Map<string, THREE.Material>()
function fabric(mat: MatKey) {
  const key = typeof mat === 'string' ? mat : mat.uuid
  let m = fab.get(key)
  if (!m) fab.set(key, (m = meshGuardMaterial(typeof mat === 'string' ? (mat === 'galvanised' ? '#a9aeb1' : '#2f5a3a') : '#' + (mat as THREE.MeshStandardMaterial).color.getHexString())))
  return m
}

const paleCache = new Map<number, THREE.BufferGeometry>()
/** W-section pale, 65 mm wide, triple-pointed head, 2.5 mm steel; origin at the foot, face in local XY. */
function paleGeometry(H: number) {
  let g = paleCache.get(H)
  if (g) return g
  const w = 0.065
  const sh = new THREE.Shape()
  sh.moveTo(-w / 2, 0)
  sh.lineTo(w / 2, 0)
  sh.lineTo(w / 2, H - 0.07)
  sh.lineTo(w / 2 - 0.004, H - 0.02)
  sh.lineTo(w / 6, H - 0.06)
  sh.lineTo(0, H)
  sh.lineTo(-w / 6, H - 0.06)
  sh.lineTo(-w / 2 + 0.004, H - 0.02)
  sh.lineTo(-w / 2, H - 0.07)
  sh.closePath()
  const flat = new THREE.ExtrudeGeometry(sh, { depth: 0.0025, bevelEnabled: false })
  // two folded flanges give the W its depth
  const fl = new THREE.BoxGeometry(0.0025, H - 0.1, 0.018)
  const parts: THREE.BufferGeometry[] = [flat]
  for (const x of [-w / 2, w / 2, -w / 6, w / 6]) {
    const f = fl.clone()
    f.translate(x, (H - 0.1) / 2, x === -w / 2 || x === w / 2 ? -0.008 : 0.01)
    parts.push(f)
  }
  g = mergeAll(parts)
  paleCache.set(H, g)
  return g
}

function mergeAll(list: THREE.BufferGeometry[]) {
  const geos = list.map((x) => (x.index ? x.toNonIndexed() : x))
  let n = 0
  for (const x of geos) n += x.getAttribute('position').count
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  const uv = new Float32Array(n * 2)
  let o = 0
  for (const x of geos) {
    x.computeVertexNormals()
    const c = x.getAttribute('position').count
    pos.set(x.getAttribute('position').array as Float32Array, o * 3)
    nor.set(x.getAttribute('normal').array as Float32Array, o * 3)
    const u = x.getAttribute('uv')
    if (u) uv.set(u.array as Float32Array, o * 2)
    o += c
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** Concertina razor coil along d from p for L, coil diameter D (low-poly helix). */
export function razorCoil(k: Kit, p: V3, d: THREE.Vector3, L: number, D: number) {
  const [u, w] = [new THREE.Vector3(0, 1, 0), new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize()]
  const turns = Math.max(2, Math.round(L / 0.2))
  const per = 10
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= turns * per; i++) {
    const t = i / (turns * per)
    const a = t * turns * Math.PI * 2
    pts.push(v(p).addScaledVector(d, t * L).addScaledVector(u, Math.sin(a) * D / 2).addScaledVector(w, Math.cos(a) * D / 2))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  k.add(paint('#c9cdd0', { metalness: 0.9, roughness: 0.25, clearcoat: 0 }), new THREE.TubeGeometry(curve, turns * per, 0.004, 3, false))
}

/** Double-leaf swing gate (chain-link or palisade infill) across a to b, leaves closed. */
export function swingGate(k: Kit, a: V3, b: V3, o: FenceOpts) {
  const { A, d, n, L, q } = frame(a, b)
  const mat = o.mat ?? GALV
  const H = o.height
  for (const s of [0, L]) {
    const p = arr(A.clone().addScaledVector(d, s))
    collar(k, p, 0.18)
    k.cyl(mat, 0.05, H + 0.15, [p[0], a[1] + (H + 0.15) / 2, p[2]], 'y', 14)
    k.dome(mat, 0.055, [p[0], a[1] + H + 0.15, p[2]], 'y', Math.PI / 2, 0.6, 12)
    topping(k, p, o, n)
  }
  const leaf = (L - 0.16) / 2
  for (const [s0, dir] of [[0.08, 1], [L - 0.08, -1]] as const) {
    const c = (t: number, y: number) => arr(A.clone().addScaledVector(d, s0 + dir * t).setY(a[1] + y))
    for (const y of [0.08, H - 0.05]) k.rod(mat, c(0.03, y), c(leaf - 0.01, y), 0.021, 8)
    for (const t of [0.03, leaf - 0.01]) k.rod(mat, c(t, 0.08), c(t, H - 0.05), 0.021, 8)
    k.rod(mat, c(0.03, 0.1), c(leaf - 0.01, H - 0.08), 0.017, 6)
    for (const y of [0.25, H - 0.3]) k.box('nut', [0.06, 0.03, 0.03], c(0.0, y))
    if (o.style === 'chain-link') {
      const geo = new THREE.PlaneGeometry(leaf - 0.06, H - 0.16)
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (leaf - 0.06)) / 0.2, (uv.getY(i) * (H - 0.16)) / 0.2)
      k.add(fabric(mat), geo, new THREE.Matrix4().compose(v(c(leaf / 2, H / 2)).addScaledVector(n, 0.025), q, new THREE.Vector3(1, 1, 1)))
    } else {
      const pale = paleGeometry(H - 0.05)
      for (let t = 0.1; t < leaf - 0.05; t += 0.155) k.addShared(mat, pale, new THREE.Matrix4().compose(v(c(t, 0.05)).addScaledVector(n, 0.03), q, new THREE.Vector3(1, 1, 1)))
    }
  }
  // drop bolt and padlock hasp at the meeting stiles
  const m = arr(A.clone().addScaledVector(d, L / 2).setY(a[1] + 1.05).addScaledVector(n, 0.03))
  k.box('brass', [0.05, 0.08, 0.03], m, q)
  k.rod(mat, arr(v(m).setY(a[1])), arr(v(m).setY(a[1] + 0.5)), 0.008, 6)
}

/** Cantilever sliding gate closed across a to b, counterbalance tail running back past a; track wheels on rail posts. */
export function slidingGate(k: Kit, a: V3, b: V3, o: FenceOpts) {
  const { A, d, n, L, q } = frame(a, b)
  const mat = o.mat ?? GALV
  const H = o.height
  const tail = L * 0.45
  const at = (s: number, y: number) => arr(A.clone().addScaledVector(d, s).setY(a[1] + y).addScaledVector(n, 0.12))
  // guide posts with roller carriages, receiving post at b
  for (const s of [-tail * 0.15, -tail * 0.85]) {
    const p = arr(A.clone().addScaledVector(d, s))
    collar(k, p, 0.2)
    k.box(mat, [0.1, 0.25, 0.1], [p[0], a[1] + 0.125, p[2]])
    k.box('nut', [0.3, 0.1, 0.12], at(s, 0.16))
    k.box(mat, [0.1, H + 0.1, 0.1], [p[0], a[1] + (H + 0.1) / 2, p[2]])
  }
  const pb = arr(A.clone().addScaledVector(d, L + 0.1))
  collar(k, pb, 0.2)
  k.box(mat, [0.1, H + 0.1, 0.1], [pb[0], a[1] + (H + 0.1) / 2, pb[2]])
  // leaf frame: bottom box track beam, top rail, stiles, diagonal bracing in the tail
  k.box(mat, [L + tail, 0.12, 0.08], at((L - tail) / 2, 0.26), q)
  k.box(mat, [L + tail, 0.05, 0.05], at((L - tail) / 2, H), q)
  for (const s of [-tail, 0, L]) k.box(mat, [0.05, H - 0.26, 0.05], at(s, (H + 0.26) / 2), q)
  k.rod(mat, at(-tail, 0.32), at(0, H), 0.02, 6)
  if (o.style === 'chain-link') {
    const geo = new THREE.PlaneGeometry(L, H - 0.32)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * L) / 0.2, (uv.getY(i) * (H - 0.32)) / 0.2)
    k.add(fabric(mat), geo, new THREE.Matrix4().compose(v(at(L / 2, (H + 0.32) / 2)), q, new THREE.Vector3(1, 1, 1)))
  } else {
    const pale = paleGeometry(H)
    for (let s = 0.08; s < L - 0.05; s += 0.155) k.addShared(mat, pale, new THREE.Matrix4().compose(v(at(s, 0.2)).addScaledVector(n, 0.045), q, new THREE.Vector3(1, 1, 1)))
  }
  // motor operator on its plinth beside the first guide post
  const mp = arr(A.clone().addScaledVector(d, -0.5).addScaledVector(n, 0.55))
  k.box('concrete', [0.5, 0.15, 0.4], [mp[0], a[1] + 0.075, mp[2]])
  k.rbox(paint('#6f7478'), [0.3, 0.38, 0.22], 0.03, [mp[0], a[1] + 0.34, mp[2]], q)
  if (o.topping !== 'none') {
    const y = a[1] + H + 0.05
    const start = arr(A.clone().addScaledVector(d, -tail).setY(y))
    if (o.topping === 'razor') razorCoil(k, [start[0], y + 0.2, start[2]], d, L + tail, 0.4)
    else for (const t of [0.12, 0.24]) k.rod(mat, arr(v(start).setY(y + t)), arr(v(start).setY(y + t).addScaledVector(d, L + tail)), 0.0025, 4)
  }
}
