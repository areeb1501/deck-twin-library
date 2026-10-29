// Vertical flare tip assembly: flanged inlet, heat-resistant barrel, windshield, retention ring, pilots with gas and ignition lines. API 537.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { flangedJoint } from '../lib/parts'
import { pipeOD, type Rating } from '../lib/standards'

export const tipMetal = () => paint('#5e5955', { metalness: 0.65, roughness: 0.55, clearcoat: 0, weather: 1.2 })

/** typical: tip barrel length for a header size. */
export const tipLength = (nps: number) => Math.min(5, Math.max(2.5, 2.2 + 0.06 * nps))

/** Builds the tip from its inlet flange joint at `base` (centre of the joint) upwards. Returns the outlet height and pilot positions. */
export function flareTip(k: Kit, base: V3, nps: number, rating: Rating, pilots = 3) {
  const M = tipMetal()
  const od = pipeOD(nps)
  const R = od / 2
  const Lt = tipLength(nps)
  const [x, y0, z] = base
  flangedJoint(k, nps, rating, base, 'y')
  const yb = y0 + 0.12
  const yt = yb + Lt
  k.pipe(M, [x, yb, z], [x, yt, z], od, 0.012, 40)
  // muffler / spool flange below the windshield and the retention ring at the outlet
  k.cyl(M, R + 0.05, 0.05, [x, yb + Lt * 0.35, z], 'y', 40)
  k.torus(M, R + 0.012, 0.02, [x, yt, z], 'y', 8, 48)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    k.box(M, [0.012, 0.06, 0.05], [x + Math.cos(a) * (R - 0.006), yt + 0.03, z + Math.sin(a) * (R - 0.006)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
  }
  // windshield: open sleeve around the upper barrel on standoff lugs
  const Rw = R + 0.14 + 0.06 * R
  const yw0 = yt - Lt * 0.42
  k.lathe(M, [[Rw + 0.006, yw0], [Rw + 0.006, yt + 0.06], [Rw, yt + 0.06], [Rw, yw0], [Rw + 0.006, yw0]], [x, 0, z], 'y', 48)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
    for (const yy of [yw0 + 0.15, yt - 0.15]) k.box(M, [Rw - R, 0.08, 0.012], [x + (Math.cos(a) * (R + Rw)) / 2, yy, z + (Math.sin(a) * (R + Rw)) / 2], q)
  }
  // pilots: riser, pilot head with wind hood, thermocouple conduit
  const pos: V3[] = []
  for (let i = 0; i < pilots; i++) {
    const a = (i / pilots) * Math.PI * 2 + Math.PI / 6
    const r = Rw + 0.12
    const px = x + Math.cos(a) * r
    const pz = z + Math.sin(a) * r
    k.rod('stainless', [px, y0 - 0.6, pz], [px, yt - 0.12, pz], 0.0167, 8)
    k.cyl(M, 0.045, 0.32, [px, yt + 0.02, pz], 'y', 14, 0.035)
    k.cyl(M, 0.06, 0.06, [px, yt + 0.2, pz], 'y', 14, 0.045, true)
    k.rod('stainless', [px + Math.cos(a) * 0.05, y0 - 0.6, pz + Math.sin(a) * 0.05], [px + Math.cos(a) * 0.05, yt - 0.05, pz + Math.sin(a) * 0.05], 0.008, 6)
    for (const yy of [yb + 0.4, yb + Lt * 0.5, yt - 0.3]) k.rod(M, [x + Math.cos(a) * (R + 0.005), yy, z + Math.sin(a) * (R + 0.005)], [px, yy, pz], 0.012, 6)
    pos.push([px, y0 - 0.6, pz])
  }
  return { top: yt, pilots: pos, Rw }
}
