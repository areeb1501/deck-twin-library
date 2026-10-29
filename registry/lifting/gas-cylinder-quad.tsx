// Offshore gas cylinder quad (cylinder bundle) after DNV 2.7-1 / ISO 10961: 50 L cylinders (EN 1089-3 shoulder colours) in a lifting frame with clamp bars, pigtails, manifold, master valve and 4-leg sling set.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { checkerPlate, gauge, member, tagPlate } from '../lib/parts'
import { SECTIONS } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { boxMM, padeyeShackle, slingSet } from './_rigging'

export type QuadGas = 'nitrogen' | 'oxygen' | 'air' | 'helium' | 'argon' | 'co2'

export interface GasCylinderQuadProps {
  /** number of cylinders */
  count?: number
  gas?: QuadGas
  /** frame colour */
  color?: string
  tag?: string
  liftingSet?: boolean
}

export const defaults = {
  count: 16,
  gas: 'nitrogen' as QuadGas,
  color: '#d9a21b',
  tag: 'GQ-101',
  liftingSet: true,
}

// EN 1089-3 shoulder colours (body grey for inert / industrial gases)
const SHOULDER: Record<QuadGas, string> = { nitrogen: '#1b1c1e', oxygen: '#f2f2ee', air: '#f2f2ee', helium: '#7a4a26', argon: '#2f6b3f', co2: '#7f8589' }
const LABEL: Record<QuadGas, string> = { nitrogen: 'NITROGEN', oxygen: 'OXYGEN', air: 'BREATHING AIR', helium: 'HELIUM', argon: 'ARGON', co2: 'CARBON DIOXIDE' }

const OD = 0.229 // 50 L, 200/300 bar seamless cylinder (typical)
const PITCH = 0.255

export function GasCylinderQuad({ count = defaults.count, gas = defaults.gas, color = defaults.color, tag = defaults.tag, liftingSet = defaults.liftingSet, ...group }: GasCylinderQuadProps & GroupProps) {
  const data = useKit((k) => build(k, count, gas, color, tag, liftingSet), [count, gas, color, tag, liftingSet])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default GasCylinderQuad

function build(k: Kit, countIn: number, gas: QuadGas, color: string, tag: string, lifting: boolean) {
  const n = Math.round(Math.min(Math.max(countIn, 4), 25))
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const P = paint(color, { weather: 1.1 })
  const body = paint('#6d7276', { weather: 0.5 })
  const shoulder = paint(SHOULDER[gas] ?? SHOULDER.nitrogen, { weather: 0.3 })
  const sq = 'SHS 100x100x6.3'
  const s = SECTIONS[sq].b
  const hx = (cols * PITCH) / 2 + s + 0.14
  const hz = (rows * PITCH) / 2 + s + 0.02
  const yF = 0.12
  const H = 2.2
  const ex = hx - s / 2
  const ez = hz - s / 2

  // base with fork pockets, checker-plate floor, corner posts, top frame, cylinder clamp bars
  for (const sz of [-1, 1]) member(k, [-hx, yF / 2, sz * (hz - 0.05)], [hx, yF / 2, sz * (hz - 0.05)], 'RHS 200x100x8', P, [0, 0, 1])
  for (const sx of [-1, 1]) member(k, [sx * (hx - 0.05), yF / 2, -hz + 0.1], [sx * (hx - 0.05), yF / 2, hz - 0.1], 'RHS 200x100x8', P, [1, 0, 0])
  for (const sx of [-1, 1]) {
    const x = sx * Math.min(0.3, hx * 0.4)
    boxMM(k, P, [x - 0.11, yF - 0.008, -hz + 0.1], [x + 0.11, yF, hz - 0.1])
    for (const sz of [-1, 1]) boxMM(k, 'rubberBlack', [x - 0.1, 0.012, sz * (hz + 0.001) - 0.001], [x + 0.1, 0.09, sz * (hz + 0.001) + 0.001])
  }
  checkerPlate(k, [0, yF + 0.006, 0], 2 * hx - 0.2, 2 * hz - 0.2)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) member(k, [sx * ex, yF, sz * ez], [sx * ex, H - s, sz * ez], sq, P, [1, 0, 0])
  for (const sz of [-1, 1]) member(k, [-hx, H - s / 2, sz * ez], [hx, H - s / 2, sz * ez], sq, P)
  for (const sx of [-1, 1]) member(k, [sx * ex, H - s / 2, -ez + s / 2], [sx * ex, H - s / 2, ez - s / 2], sq, P)
  const yC = yF + 0.006
  const yS = yC + 1.42
  for (const y of [yC + 0.45, yC + 1.1]) {
    for (const sz of [-1, 1]) member(k, [-ex + s / 2, y, sz * ez], [ex - s / 2, y, sz * ez], 'L75x75x8', P, [0, 1, 0])
    for (const sx of [-1, 1]) member(k, [sx * ex, y, -ez + s / 2], [sx * ex, y, ez - s / 2], 'L75x75x8', P, [0, 1, 0])
    // internal clamp bars between cylinder rows
    for (let r = 1; r < rows; r++) {
      const z = -((rows * PITCH) / 2) + r * PITCH
      boxMM(k, P, [-ex + s / 2, y - 0.03, z - 0.006], [ex - s / 2, y + 0.03, z + 0.006])
    }
    for (let r = 0; r < rows; r++)
      for (const sz of [-1, 1]) {
        const z = -((rows * PITCH) / 2) + (r + 0.5) * PITCH + sz * (OD / 2 + 0.01)
        if (Math.abs(z) > ez - s / 2) continue
        boxMM(k, 'rubberBlack', [-ex + s / 2, y - 0.025, z - 0.004], [ex - s / 2, y + 0.025, z + 0.004])
      }
  }

  // cylinders: body, shoulder colour band, neck, valve with guard handwheel, pigtail to the row header
  const cyls: { x: number; z: number }[] = []
  for (let i = 0; i < n; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    cyls.push({ x: -((cols * PITCH) / 2) + (c + 0.5) * PITCH, z: -((rows * PITCH) / 2) + (r + 0.5) * PITCH })
  }
  const yM = yS + 0.36
  for (const { x, z } of cyls) {
    k.lathe(body, [[0.06, 0], [OD / 2 - 0.01, 0], [OD / 2, 0.015], [OD / 2, yS - yC - 0.12]], [x, yC, z], 'y', 28)
    k.lathe(shoulder, [[OD / 2, yS - yC - 0.12], [OD / 2 * 0.93, yS - yC - 0.04], [OD / 2 * 0.62, yS - yC + 0.02], [0.03, yS - yC + 0.045]], [x, yC, z], 'y', 28)
    k.cyl('brass', 0.022, 0.08, [x, yS + 0.08, z], 'y', 12)
    k.box('brass', [0.06, 0.05, 0.04], [x, yS + 0.14, z])
    k.cyl('brass', 0.012, 0.06, [x + 0.04, yS + 0.14, z], 'x', 8)
    k.handwheel('actuatorBlue', 0.055, [x, yS + 0.2, z], 'y', 3)
    k.tube('tubing', [[x + 0.07, yS + 0.14, z], [x + 0.1, yS + 0.14, z], [x + 0.1, yM - 0.02, z], [x + 0.1, yM - 0.02, z + 0.04]], 0.005, 6, 0.03)
  }
  // row headers → collector along X at the front, master valve, gauge, outlet in a guard
  const zc = ez - 0.09
  for (let r = 0; r < rows; r++) {
    const z = -((rows * PITCH) / 2) + (r + 0.5) * PITCH + 0.04
    k.rod('stainless', [-(cols * PITCH) / 2 + 0.05, yM, z], [(cols * PITCH) / 2 + 0.08, yM, z], 0.012, 8)
  }
  const xo = (cols * PITCH) / 2 + 0.08
  k.rod('stainless', [xo, yM, -((rows * PITCH) / 2) + 0.15], [xo, yM, zc], 0.016, 10)
  k.rod('stainless', [xo, yM, zc], [xo, yM - 0.35, zc], 0.016, 10)
  k.box('stainless', [0.07, 0.07, 0.07], [xo, yM - 0.2, zc])
  k.rod('actuatorRed', [xo, yM - 0.2, zc + 0.035], [xo, yM - 0.2, zc + 0.11], 0.008, 6)
  k.box('actuatorRed', [0.12, 0.02, 0.025], [xo + 0.05, yM - 0.2, zc + 0.11])
  gauge(k, [xo - 0.09, yM - 0.05, zc + 0.02], 'z', 0.08, 'bar', 400)
  k.rod('stainless', [xo - 0.09, yM - 0.05, zc], [xo, yM - 0.05, zc], 0.006, 6)
  k.cyl('brass', 0.02, 0.06, [xo, yM - 0.38, zc], 'y', 12)
  k.hex('brass', 0.05, 0.025, [xo, yM - 0.42, zc])
  for (const y of [yM - 0.5, yM + 0.08]) boxMM(k, P, [xo - 0.17, y - 0.01, zc - 0.02], [xo + 0.1, y + 0.01, ez - s / 2])

  // top guard bars over the valves
  for (let c = 0; c <= cols; c++) {
    const x = -((cols * PITCH) / 2) + c * PITCH
    boxMM(k, P, [x - 0.02, H - s - 0.02, -ez + s / 2], [x + 0.02, H - s + 0.02, ez - s / 2])
  }
  // labels: gas name, UN 2.2 diamond, DNV plate, tag
  k.plane(textMaterial(LABEL[gas] ?? 'GAS', '#1d6b3a', '#ffffff', 768, 112), Math.min(1.1, 2 * hx - 0.3), 0.15, [0, H - s / 2, hz + 0.002])
  const dq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4)
  k.box(P, [0.26, 0.26, 0.006], [ex, yC + 0.75, hz + 0.003])
  k.plane(textMaterial('2', '#1d8a46', '#ffffff', 128, 128), 0.17, 0.17, [ex, yC + 0.75, hz + 0.0065], dq)
  k.box('nameplate', [0.22, 0.14, 0.003], [-hx * 0.4, 0.06, hz + 0.002])
  k.plane(textMaterial('DNV 2.7-1', '#e9eae6', '#222222', 256, 64), 0.2, 0.05, [-hx * 0.4, 0.09, hz + 0.0036])
  if (tag) tagPlate(k, tag, [hx * 0.45, 0.06, hz + 0.002], 'z', 0.22)

  if (lifting) {
    const eyes: V3[] = []
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) eyes.push(padeyeShackle(k, [sx * ex, H, sz * ez], 'z', 1, P as MatKey))
    slingSet(k, eyes, [0, H + Math.hypot(ex, ez) * 1.05, 0], 0.22, 0.011)
  }
}
