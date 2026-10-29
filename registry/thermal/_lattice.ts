// Tubular lattice steel for booms, derricks and towers: tapered box trusses and three-leg towers built from solid rods.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'

export interface BoxTrussOpts {
  /** width (across, along `side`) and depth (along `up`) at a and b */
  w0: number
  h0: number
  w1?: number
  h1?: number
  /** approximate up direction for the depth axis */
  up?: V3
  chordR: number
  braceR: number
  panel?: number
  mat?: MatKey
}

const vec = (v: THREE.Vector3) => v.toArray() as V3

/** Tapered rectangular Warren truss from a to b. Returns a function giving chord corner i (0..3) at fraction t. */
export function boxTruss(k: Kit, a: V3, b: V3, o: BoxTrussOpts) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const d = B.clone().sub(A)
  const L = d.length()
  d.normalize()
  const upRef = new THREE.Vector3(...(o.up ?? [0, 1, 0]))
  const side = new THREE.Vector3().crossVectors(d, upRef).normalize()
  const up = new THREE.Vector3().crossVectors(side, d).normalize()
  const mat = o.mat ?? 'structSteel'
  const w1 = o.w1 ?? o.w0
  const h1 = o.h1 ?? o.h0
  const S = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const at = (t: number, i: number): V3 => {
    const w = o.w0 + (w1 - o.w0) * t
    const h = o.h0 + (h1 - o.h0) * t
    const [ss, su] = S[((i % 4) + 4) % 4]
    return vec(A.clone().addScaledVector(d, L * t).addScaledVector(side, (ss * w) / 2).addScaledVector(up, (su * h) / 2))
  }
  for (let i = 0; i < 4; i++) k.rod(mat, at(0, i), at(1, i), o.chordR, 10)
  const n = Math.max(2, Math.round(L / (o.panel ?? Math.max(1.5, o.w0 * 0.9))))
  for (let s = 0; s <= n; s++) {
    const t = s / n
    for (let i = 0; i < 4; i++) k.rod(mat, at(t, i), at(t, i + 1), o.braceR, 6)
    if (s % 2 === 0) k.rod(mat, at(t, 0), at(t, 2), o.braceR * 0.8, 6)
    if (s === n) break
    const t1 = (s + 1) / n
    for (let i = 0; i < 4; i++) {
      if (s % 2) k.rod(mat, at(t, i), at(t1, i + 1), o.braceR, 6)
      else k.rod(mat, at(t, i + 1), at(t1, i), o.braceR, 6)
    }
  }
  return { at, dir: vec(d), side: vec(side), up: vec(up), L, n }
}

/** Three-leg tapered tower about +Y from y0 to y1; radius r0 at the bottom, r1 at the top. Returns the leg position helper. */
export function triTower(k: Kit, centre: V3, y0: number, y1: number, r0: number, r1: number, o: { legR: number; braceR: number; panel?: number; mat?: MatKey; phase?: number; guides?: number }) {
  const mat = o.mat ?? 'galvanised'
  const ph = o.phase ?? Math.PI / 2
  const at = (y: number, i: number): V3 => {
    const u = (y - y0) / (y1 - y0)
    const r = r0 + (r1 - r0) * u
    const a = ph + (i * 2 * Math.PI) / 3
    return [centre[0] + Math.cos(a) * r, y, centre[2] + Math.sin(a) * r]
  }
  for (let i = 0; i < 3; i++) k.rod(mat, at(y0, i), at(y1, i), o.legR, 10)
  const n = Math.max(2, Math.round((y1 - y0) / (o.panel ?? 3)))
  for (let s = 0; s <= n; s++) {
    const y = y0 + ((y1 - y0) * s) / n
    const ya = y0 + ((y1 - y0) * (s + 1)) / n
    for (let i = 0; i < 3; i++) {
      k.rod(mat, at(y, i), at(y, (i + 1) % 3), o.braceR, 6)
      if (s < n) {
        k.rod(mat, at(y, i), at(ya, (i + 1) % 3), o.braceR * 0.85, 6)
        k.rod(mat, at(y, (i + 1) % 3), at(ya, i), o.braceR * 0.85, 6)
      }
      // guide brackets to a central riser
      if (o.guides && s > 0) {
        const p = at(y, i)
        const dx = p[0] - centre[0]
        const dz = p[2] - centre[2]
        const f = o.guides / Math.hypot(dx, dz)
        k.rod(mat, p, [centre[0] + dx * f, y, centre[2] + dz * f], o.braceR * 0.8, 6)
      }
    }
  }
  return { at, n }
}

/** Square base plate with four anchor bolts and nuts at deck level. */
export function basePlate(k: Kit, x: number, z: number, size: number, mat: MatKey = 'galvanised', y = 0) {
  const t = Math.max(0.02, size * 0.06)
  k.box(mat, [size, t, size], [x, y + t / 2, z])
  const o = size / 2 - Math.max(0.04, size * 0.15)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.rod('nut', [x + sx * o, y, z + sz * o], [x + sx * o, y + t + 0.06, z + sz * o], 0.012, 8)
      k.hex('nut', 0.04, 0.02, [x + sx * o, y + t + 0.012, z + sz * o])
    }
}
