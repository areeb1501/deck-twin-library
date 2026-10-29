// Floodlight mast or bulkhead lighting pole: tapered galvanised mast, base-hinged with hydraulic counterbalance (or fixed with caged ladder), Ex floodlights or LED fittings. EN 40, IEC 60079, IEC 60598.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, eul, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { junctionBox, ladder, tagPlate } from '../lib/parts'
import { cableGland } from './_parts'

export interface LightingMastProps {
  style?: 'flood-mast' | 'pole'
  /** mast height above deck, m */
  height?: number
  /** number of floodlights / fittings */
  count?: number
  /** lamps on (emissive lenses) */
  lit?: boolean
  /** downward aim of the floodlights, degrees */
  tilt?: number
  /** flood mast: base-hinged (lowered for ground-level lamp maintenance) or fixed with a caged ladder */
  access?: 'hinged' | 'ladder'
  /** hinged mast lowered onto its rest */
  lowered?: boolean
  tag?: string
}

export const defaults = {
  style: 'flood-mast' as 'flood-mast' | 'pole',
  height: 9,
  count: 4,
  lit: true,
  tilt: 30,
  access: 'hinged' as 'hinged' | 'ladder',
  lowered: false,
  tag: 'LM-101',
}

export function LightingMast(props: LightingMastProps & GroupProps) {
  const { style, height, count, lit, tilt, access, lowered, tag, ...group } = { ...defaults, ...props }
  const b = useMemo(() => {
    const k = new Kit()
    const ku = new Kit()
    const pivot = build(k, ku, { style, height, count, lit, tilt, access, lowered, tag })
    return { base: k.build(), upper: ku.build(), pivot }
  }, [style, height, count, lit, tilt, access, lowered, tag])
  useEffect(() => () => [b.base, b.upper].forEach((x) => x.geometry.dispose()), [b])
  const P = b.pivot
  return (
    <group {...group}>
      <KitMesh data={b.base} />
      <group position={P}>
        <group rotation={[lowered && access === 'hinged' && style === 'flood-mast' ? -LOWER : 0, 0, 0]}>
          <group position={[-P[0], -P[1], -P[2]]}>
            <KitMesh data={b.upper} />
          </group>
        </group>
      </group>
    </group>
  )
}

const LOWER = (84 * Math.PI) / 180 // lowered angle, head resting on its cradle

export default LightingMast

const G: MatKey = 'galvanised'

function base(k: Kit, r: number, plate: number) {
  k.box(G, [plate, 0.025, plate], [0, 0.0125, 0])
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
    const sh = new THREE.Shape()
    const L = plate / 2 - r - 0.02
    sh.moveTo(0, 0).lineTo(L, 0).lineTo(L, 0.03).lineTo(0, L * 1.3).closePath()
    k.extrude(G, sh, 0.012, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r * 0.95, 0.025, -Math.sin(a) * r * 0.95), q, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.006)))
  }
  const R = plate / 2 - 0.05
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) * Math.PI) / 4
    const p: V3 = [Math.cos(a) * R * 1.05, 0, Math.sin(a) * R * 1.05]
    k.cyl('boltXylan', 0.012, 0.09, [p[0], 0.06, p[2]], 'y', 8)
    k.hex('nut', 0.036, 0.018, [p[0], 0.034, p[2]])
    k.cyl('stainless', 0.024, 0.004, [p[0], 0.027, p[2]], 'y', 12)
  }
}

function build(k: Kit, ku: Kit, p: typeof defaults): V3 {
  const n = Math.max(1, Math.min(8, Math.round(p.count)))
  const lens: MatKey = p.lit ? 'lampLens' : paint('#d8dcd8', { metalness: 0.1, roughness: 0.15, clearcoat: 0.6, weather: 0 })
  const body = paint('#5d6468', { metalness: 0.5, roughness: 0.4, clearcoat: 0.2, weather: 0.4 })
  if (p.style === 'pole') {
    const H = Math.min(6, Math.max(2.5, p.height))
    base(k, 0.045, 0.3)
    k.cyl(G, 0.045, H, [0, H / 2, 0], 'y', 20, 0.038)
    k.cyl(G, 0.042, 0.01, [0, H, 0], 'y', 16)
    // fittings on arms, alternating sides, pairs stacked down the pole
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? -1 : 1
      const y = H - 0.15 - Math.floor(i / 2) * 0.6
      k.rod(G, [0, y, 0], [s * 0.45, y + 0.05, 0], 0.022, 10)
      k.box(G, [0.08, 0.06, 0.06], [s * 0.45, y + 0.02, 0])
      const c: V3 = [s * 0.45, y - 0.06, 0]
      k.rbox(body, [0.18, 0.09, 1.25], 0.02, c, undefined, 3)
      k.box(lens, [0.13, 0.012, 1.15], [c[0], c[1] - 0.046, c[2]])
      for (const dz of [-0.62, 0.62]) k.rbox('stainless', [0.16, 0.08, 0.02], 0.01, [c[0], c[1], dz])
      cableGland(k, [c[0], c[1], -0.63], '-z', 0.015)
    }
    junctionBox(k, [0, 0.9, 0.045], 'z', [0.2, 0.22, 0.12])
    k.spline('cable', [[0, 0.78, 0.1], [0, 0.4, 0.1], [0.05, 0.05, 0.25], [0.3, 0.015, 0.35]], 0.009, 6, 16)
    tagPlate(k, p.tag, [0, 1.35, 0.041], 'z', 0.1)
    return [0, 0, 0]
  }

  const H = Math.min(25, Math.max(5, p.height))
  const r0 = 0.1 + H * 0.004
  const r1 = 0.06
  const rAt = (y: number) => r0 + (r1 - r0) * (y / H)
  base(k, r0, 0.55)
  const hinged = p.access === 'hinged'
  const yh = 1.2
  const ru = rAt(yh)
  // base section up to the joint, inspection door with termination box behind, cable entry
  k.cyl(G, r0, yh, [0, yh / 2 + 0.025, 0], 'y', 28, ru)
  k.box(G, [0.12, 0.38, 0.03], [0, 0.6, rAt(0.6) - 0.005])
  for (const y of [0.45, 0.75]) k.hex('nut', 0.02, 0.012, [0, y, rAt(0.6) + 0.012], 'z')
  k.spline('cable', [[0, 0.3, rAt(0.3) + 0.02], [0, 0.12, rAt(0.12) + 0.06], [0.05, 0.03, 0.45], [0.3, 0.015, 0.7]], 0.012, 6, 16)
  k.cyl('brass', 0.022, 0.05, [0, 0.33, rAt(0.33) + 0.01], 'y', 10)
  // flanged joint: lower flange on the base, upper flange on the mast; bolts are the gravity lock when raised
  k.cyl(G, ru + 0.06, 0.02, [0, yh + 0.015, 0], 'y', 28)
  ku.cyl(G, ru + 0.06, 0.02, [0, yh + 0.035, 0], 'y', 28)
  ku.boltCircle('boltXylan', 'nut', 8, ru + 0.035, [0, yh + 0.005, 0], 'y', 0.014, 0.06, [0.0, 0.052])
  ku.cyl(G, ru, H - yh, [0, yh + (H - yh) / 2 + 0.045, 0], 'y', 28, r1)
  const pivot: V3 = [0, yh + 0.025, -ru - 0.07]
  if (hinged) {
    // hinge knuckles (base side) and pin, lug on the mast side
    for (const s of [-1, 1]) k.box(G, [0.025, 0.16, 0.12], [s * 0.06, yh - 0.04, -ru - 0.05])
    k.cyl('stainless', 0.022, 0.16, pivot, 'x', 12)
    ku.box(G, [0.08, 0.14, 0.1], [0, yh + 0.08, -ru - 0.05])
    // hydraulic counterbalance ram: barrel on a base bracket, rod to a mast bracket
    const a: V3 = [0, 0.18, -r0 - 0.45]
    k.box(G, [0.16, 0.18, 0.2], [0, 0.11, -r0 - 0.45])
    k.box(G, [0.16, 0.012, 0.5], [0, 0.031, -r0 - 0.25])
    const lowered = p.lowered
    const bLocal = new THREE.Vector3(0, yh + 1.6, -rAt(yh + 1.6) - 0.12)
    ku.box(G, [0.1, 0.16, 0.14], [0, yh + 1.6, -rAt(yh + 1.6) - 0.06])
    const bw = lowered ? bLocal.clone().sub(new THREE.Vector3(...pivot)).applyAxisAngle(new THREE.Vector3(1, 0, 0), -LOWER).add(new THREE.Vector3(...pivot)) : bLocal
    const A = new THREE.Vector3(...a)
    const d = bw.clone().sub(A)
    const mid = A.clone().addScaledVector(d, 0.55)
    k.rod(paint('#2f3b4a', { metalness: 0.4, roughness: 0.4 }), a, mid.toArray() as V3, 0.045, 14)
    k.rod('stainless', mid.toArray() as V3, bw.toArray() as V3, 0.022, 10)
    k.cyl('nut', 0.03, 0.12, a, 'x', 10)
    // hand pump / control valve block and mast rest (cradle) at the lowered head position
    k.rbox(paint('#c0261c', { roughness: 0.4 }), [0.18, 0.22, 0.12], 0.015, [0.35, 0.14, -r0 - 0.45])
    if (lowered) {
      // portable mast rest under the head while lowered
      const Lr = H - yh - 0.6
      const zr = pivot[2] - Lr * Math.sin(LOWER)
      const yTop = pivot[1] + Lr * Math.cos(LOWER) - ru * 0.6 - 0.02
      k.rod(G, [0, 0.02, zr], [0, yTop - 0.06, zr], 0.05, 12)
      k.box(G, [0.4, 0.02, 0.4], [0, 0.01, zr])
      k.box(G, [0.24, 0.02, 0.1], [0, yTop - 0.06, zr])
      for (const sx of [-1, 1]) k.box(G, [0.02, 0.14, 0.1], [sx * (ru + 0.02), yTop, zr])
    }
  } else {
    // fixed mast: caged ladder (ISO 14122-4) with a fall-arrest rail (EN 353-1) for lamp access
    ladder(ku, [0, 0.025, -rAt(0) - 0.25], H - 0.6, [0, 0, -1], { mat: G, extend: 0 })
    ku.box('stainless', [0.03, H - 0.8, 0.012], [0, (H - 0.8) / 2 + 0.6, -rAt(0) - 0.25])
    for (let y = 1.5; y < H - 0.6; y += 2) ku.rod(G, [0, y, -rAt(y)], [0, y, -rAt(y) - 0.25], 0.012, 6)
  }
  // head frame: one cross-arm per row of up to four lamps, front row faces +Z, back row -Z
  const rows = n > 4 ? 2 : 1
  const yA = H - 0.25
  const tilt = (Math.max(0, Math.min(80, p.tilt)) * Math.PI) / 180
  ku.cyl(G, r1 + 0.02, 0.02, [0, H + 0.035, 0], 'y', 20)
  ku.rod(G, [0, H + 0.045, 0], [0, H + 0.6, 0], 0.012, 8) // lightning finial
  for (let rI = 0; rI < rows; rI++) {
    const s = rI === 0 ? 1 : -1
    const m = rI === 0 ? Math.min(4, n) : n - 4
    const span = Math.max(0.6, m * 0.55)
    const za = s * (r1 + 0.06)
    ku.box(G, [span, 0.08, 0.08], [0, yA, za])
    ku.box(G, [0.16, 0.2, 0.012], [0, yA, s * (r1 + 0.01)])
    for (let i = 0; i < m; i++) {
      const x = -span / 2 + (span * (i + 0.5)) / m
      // yoke and floodlight aimed down by `tilt`
      for (const dx of [-0.25, 0.25]) ku.box(G, [0.015, 0.2, 0.04], [x + dx, yA - 0.12, za + s * 0.06])
      ku.box(G, [0.52, 0.015, 0.04], [x, yA - 0.03, za + s * 0.06])
      const c: V3 = [x, yA - 0.2, za + s * 0.1]
      const q = eul(s * tilt, s > 0 ? 0 : Math.PI, 0)
      ku.at(c, q, () => {
        ku.rbox(body, [0.46, 0.36, 0.12], 0.02, [0, 0, -0.02], undefined, 3)
        for (let f = 0; f < 6; f++) ku.box(body, [0.42, 0.3, 0.008], [0, 0, -0.09 - f * 0.014], undefined)
        ku.box('stainless', [0.44, 0.34, 0.012], [0, 0, 0.045])
        ku.box(lens, [0.4, 0.3, 0.008], [0, 0, 0.053])
        ku.box(body, [0.46, 0.04, 0.1], [0, 0.19, 0.03]) // visor
      })
      ku.spline('cable', [[x + 0.1, yA - 0.04, za], [x + 0.12, yA - 0.2, za + s * 0.02], [c[0] + 0.12, c[1], c[2] - s * 0.1]], 0.007, 6, 10)
    }
  }
  tagPlate(k, p.tag, [0, 0.95, rAt(0.95) + 0.002], 'z', 0.12)
  return pivot
}
