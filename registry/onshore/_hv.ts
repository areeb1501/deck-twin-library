// Outdoor HV switchyard parts: insulation levels per rated voltage, piers, tubular supports, terminal pads, grading rings, disc insulator strings.
import * as THREE from 'three'
import type { Axis, Kit, MatKey, V3 } from '../lib/kit'
import { axisVec } from '../lib/kit'
import { paint } from '../lib/materials'
import { anchorBolt, earthBond, plinth } from './_onshore'

export const KV = [72.5, 145, 245, 420] as const
export type Kv = (typeof KV)[number]

/**
 * IEC 62271-1 / IEC 60071 insulation levels and typical outdoor dimensions per rated voltage:
 * BIL (kV), post insulator height (IEC 60273 class), phase spacing, live-part support height (IEC 61936-1 ≥ 2.25 m), insulator core radius.
 */
export function hv(kv: number) {
  const table: Record<number, { bil: number; ins: number; phase: number; r: number; ring: boolean }> = {
    72.5: { bil: 325, ins: 0.77, phase: 1.6, r: 0.07, ring: false },
    145: { bil: 650, ins: 1.5, phase: 2.5, r: 0.085, ring: false },
    245: { bil: 1050, ins: 2.3, phase: 3.5, r: 0.1, ring: true },
    420: { bil: 1425, ins: 3.65, phase: 5.5, r: 0.12, ring: true },
  }
  const key = KV.reduce((a, b) => (Math.abs(b - kv) < Math.abs(a - kv) ? b : a))
  return { kv: key, sup: 2.5, ...table[key] }
}

export const alu = () => paint('#c9ccce', { metalness: 0.85, roughness: 0.35, clearcoat: 0 })
export const cabinet = () => paint('#b9bdb8', { metalness: 0.4, roughness: 0.45, clearcoat: 0.2 })

/** Galvanised tubular support column on a concrete pier: base plate, anchors, gussets, top plate. Returns the top y. */
export function tubeColumn(k: Kit, x: number, z: number, h: number, od = 0.273, earth = true) {
  const pier = 0.3
  plinth(k, x, z, od + 0.5, od + 0.5, pier)
  k.box('galvanised', [od + 0.2, 0.025, od + 0.2], [x, pier + 0.0125, z])
  for (const a of [-1, 1]) for (const b of [-1, 1]) anchorBolt(k, [x + a * (od / 2 + 0.06), pier + 0.025, z + b * (od / 2 + 0.06)], 0.024)
  for (let i = 0; i < 4; i++) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * Math.PI) / 2)
    const off = new THREE.Vector3(od / 2 + 0.04, 0, 0).applyQuaternion(q)
    k.box('galvanised', [0.08, 0.18, 0.012], [x + off.x, pier + 0.115, z + off.z], q)
  }
  k.cyl('galvanised', od / 2, h - pier - 0.05, [x, (h + pier) / 2, z], 'y', 24)
  k.box('galvanised', [od + 0.1, 0.025, od + 0.1], [x, h - 0.0125, z])
  if (earth) earthBond(k, [x, pier + 0.45, z + od / 2], [0, 0, 1], 0, 0.45)
  return h
}

/** Flat aluminium terminal pad (NEMA 4-hole) pointing along dir from pos. */
export function pad(k: Kit, pos: V3, dir: V3, s = 1) {
  const d = new THREE.Vector3(...dir).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d)
  const c = new THREE.Vector3(...pos).addScaledVector(d, 0.07 * s)
  k.box(alu(), [0.14 * s, 0.1 * s, 0.016 * s], c.toArray() as V3, q)
  k.rod(alu(), pos, c.clone().addScaledVector(d, -0.04 * s).toArray() as V3, 0.025 * s, 10)
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const h = c.clone().add(new THREE.Vector3(a * 0.03 * s, b * 0.025 * s, 0).applyQuaternion(q))
    k.cyl('nut', 0.009 * s, 0.03 * s, h.toArray() as V3, new THREE.Vector3(0, 0, 1).applyQuaternion(q).toArray() as V3, 6)
  }
}

/** Corona / grading ring (aluminium tube torus) around axis at pos. */
export function gradingRing(k: Kit, pos: V3, R: number, axis: Axis = 'y', r = 0.025) {
  k.torus(alu(), R, r, pos, axis, 10, 40)
  const v = axisVec(axis)
  const [u] = [new THREE.Vector3(1, 0, 0).cross(v).lengthSq() > 0.01 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)]
  for (const s of [-1, 1]) {
    const p = new THREE.Vector3(...pos).addScaledVector(u, s * R)
    k.rod(alu(), new THREE.Vector3(...pos).addScaledVector(u, s * R * 0.25).toArray() as V3, p.toArray() as V3, 0.012, 6)
  }
}

/** Cap-and-pin glass disc string from a (yoke at the structure) to b (dead-end clamp), discs at 146 mm pitch. */
export function discString(k: Kit, a: V3, b: V3, discD = 0.255, mat: MatKey = paint('#5d7f7a', { metalness: 0.1, roughness: 0.08, clearcoat: 0.8, transparent: true, opacity: 0.85 })) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const d = B.clone().sub(A)
  const L = d.length()
  d.normalize()
  const pitch = 0.146
  const fit = 0.35
  const n = Math.max(2, Math.floor((L - 2 * fit) / pitch))
  const at = (t: number) => A.clone().addScaledVector(d, t).toArray() as V3
  k.rod('galvanised', at(0), at(fit), 0.012, 8)
  k.rod('galvanised', at(L - fit), at(L), 0.014, 8)
  k.box('galvanised', [0.06, 0.12, 0.012], at(fit * 0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d))
  const s0 = fit + (L - 2 * fit - (n - 1) * pitch) / 2
  for (let i = 0; i < n; i++) {
    const t = s0 + i * pitch
    k.lathe(mat, [[0.02, 0], [discD / 2, 0.03], [discD / 2 * 0.98, 0.045], [discD * 0.18, 0.06], [0.03, 0.09]], at(t - 0.045), d.toArray() as V3, 20)
    k.cyl('galvanised', 0.03, 0.05, at(t - 0.06), d.toArray() as V3, 10)
  }
  k.rod('galvanised', at(fit - 0.02), at(L - fit + 0.02), 0.008, 6)
  return at(L)
}

/** Catenary conductor between a and b with sag at mid-span (twin optional). */
export function conductor(k: Kit, a: V3, b: V3, sag: number, r = 0.016, twin = 0) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const across = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3(0, 1, 0)).normalize()
  for (const off of twin ? [-twin / 2, twin / 2] : [0]) {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      pts.push(A.clone().lerp(B, t).addScaledVector(across, off).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0)))
    }
    k.add(alu(), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r, 6, false))
  }
}
