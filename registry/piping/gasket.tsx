// Flange gasket: ASME B16.20 spiral-wound (inner ring, winding, colour-coded centring ring), B16.20 / API 6A ring-type joint (oval or octagonal) or B16.21 non-metallic sheet ring.
import * as THREE from 'three'
import type { Kit, MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange as flangeDims, inch, nearest, pipeOD, tableKeys, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'

export type GasketType = 'spiral-wound' | 'rtj' | 'sheet'

export interface GasketProps {
  nps?: number
  rating?: Rating
  type?: GasketType
  /** spiral-wound winding metal (B16.20 rim colour) */
  winding?: '316L' | '304' | '321' | 'alloy-625' | 'monel'
  /** spiral-wound filler (rim stripes) */
  filler?: 'graphite' | 'ptfe' | 'mica'
  /** RTJ ring cross-section */
  ring?: 'octagonal' | 'oval'
  /** sheet thickness, m (1.5 or 3 mm) */
  thickness?: number
}

export const defaults = { nps: 6, rating: 300 as Rating, type: 'spiral-wound' as GasketType, winding: '316L' as NonNullable<GasketProps['winding']>, filler: 'graphite' as NonNullable<GasketProps['filler']>, ring: 'octagonal' as 'octagonal' | 'oval', thickness: 0.003 }

const WINDING: Record<NonNullable<GasketProps['winding']>, string> = { '316L': '#2f8f46', '304': '#e3c21a', '321': '#2bb3b1', 'alloy-625': '#c9a227', monel: '#e07a1f' }
const FILLER: Record<NonNullable<GasketProps['filler']>, string> = { graphite: '#5a5d60', ptfe: '#f2f2f2', mica: '#7fc97f' }

// approx: R-ring pitch diameter (inches) for class 300 / 600 by NPS; higher classes use the next ring up
const RTJ_P: Record<number, number> = { 0.5: 1.344, 0.75: 1.688, 1: 2, 1.5: 2.688, 2: 3.25, 3: 4.875, 4: 5.875, 6: 8.313, 8: 10.625, 10: 12.75, 12: 15, 14: 16.5, 16: 18.5, 18: 21, 20: 23, 24: 27.25 }

export function Gasket(props: GasketProps & GroupProps) {
  const { nps, rating, type, winding, filler, ring, thickness, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, nps, rating, type, winding, filler, ring, thickness), [nps, rating, type, winding, filler, ring, thickness])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Gasket

// annulus of radii r0..r1 and thickness t centred on x = 0, axis X
const annulus = (k: Kit, mat: MatKey, r0: number, r1: number, t: number, seg = 64) =>
  k.lathe(mat, [[r1, -t / 2], [r1, t / 2], [r0, t / 2], [r0, -t / 2], [r1, -t / 2]], [0, 0, 0], 'x', seg)

function build(k: Kit, nps: number, rating: Rating, type: GasketType, winding: NonNullable<GasketProps['winding']>, filler: NonNullable<GasketProps['filler']>, ring: 'octagonal' | 'oval', thickness: number) {
  const f = flangeDims(nps, rating)
  const ro = pipeOD(nps) / 2
  if (type === 'sheet') {
    // B16.21 ring gasket inside the bolts: ID = pipe OD, OD = bolt circle - bolt diameter
    const r1 = f.boltCircle / 2 - f.boltDia / 2
    annulus(k, paint('#3f4a3c', { metalness: 0, roughness: 0.85 }), ro, r1, thickness)
    tab(k, r1, thickness, `${nps}" CL${rating} ${(thickness * 1000).toFixed(1)}MM`, '#3f4a3c')
    return
  }
  if (type === 'rtj') {
    const P = inch(RTJ_P[nearest(tableKeys(RTJ_P), nps)] * (rating >= 900 ? 1.04 : 1))
    const A = inch(nps <= 1 ? 0.313 : rating <= 600 ? 0.438 : rating <= 1500 ? (nps >= 8 ? 0.625 : 0.5) : 0.75)
    const H = A * (ring === 'oval' ? 1.57 : 1.44)
    const r = P / 2
    const prof: [number, number][] = []
    if (ring === 'oval') {
      for (let i = 0; i <= 32; i++) {
        const a = -Math.PI / 2 + (i / 32) * Math.PI * 2
        prof.push([r + (A / 2) * Math.cos(a), (H / 2) * Math.sin(a)])
      }
    } else {
      // octagon: flat C = A - 2·(H/2 - flat height)·tan 23°, flanks at 23°
      const c = A * 0.7
      const e = (A - c) / 2 / Math.tan((23 * Math.PI) / 180) / 2
      prof.push([r + A / 2, -H / 2 + e], [r + A / 2, H / 2 - e], [r + c / 2, H / 2], [r - c / 2, H / 2], [r - A / 2, H / 2 - e], [r - A / 2, -H / 2 + e], [r - c / 2, -H / 2], [r + c / 2, -H / 2], [r + A / 2, -H / 2 + e])
    }
    k.lathe('machined', prof, [0, 0, 0], 'x', 96)
    return
  }
  // spiral-wound: inner ring, winding (alternate metal / filler plies), centring ring with colour-coded rim
  const t = 0.0032
  const g = 0.0045
  const wo = f.raisedFace / 2 - inch(0.125)
  const wi = ro + inch(0.25)
  const ri = Math.max(ro - inch(0.16), ro * 0.9)
  const co = f.boltCircle / 2 - f.boltDia / 2
  annulus(k, 'stainless', ri, wi, t)
  const n = Math.max(6, Math.min(16, Math.round((wo - wi) / 0.0025)))
  for (let i = 0; i < n; i++) {
    const r0 = wi + ((wo - wi) * i) / n
    const r1 = wi + ((wo - wi) * (i + 1)) / n
    annulus(k, i % 2 ? paint(FILLER[filler], { metalness: 0.2, roughness: 0.8 }) : 'stainless', r0, r1, g - (i % 2 ? 0.0003 : 0))
  }
  annulus(k, 'galvanised', wo, co, t)
  k.cyl(paint(WINDING[winding]), co + 0.0004, t * 0.9, [0, 0, 0], 'x', 64, undefined, true)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a)
    const p = new THREE.Vector3(0, co + 0.0008, 0).applyQuaternion(q)
    k.box(paint(FILLER[filler]), [t * 0.95, 0.001, 0.012], [p.x, p.y, p.z], q)
  }
  // stamped marking on the centring ring face
  const label = textMaterial(`${nps}" CL${rating} ${winding} ${filler.toUpperCase()} B16.20`, '#b4b9bc', '#2a2d30', 512, 64)
  const w = Math.min(0.14, (co - wo) * 4)
  k.plane(label, w, Math.min(co - wo, 0.02) * 0.7, [t / 2 + 0.0002, (co + wo) / 2, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
}

/** Printed identification tab outside the sealing face. */
function tab(k: Kit, r1: number, t: number, text: string, color: string) {
  k.box(paint(color, { metalness: 0, roughness: 0.85 }), [t, 0.05, 0.035], [0, r1 + 0.022, 0])
  k.plane(textMaterial(text, color, '#f2f2f2', 256, 64), 0.03, 0.045, [t / 2 + 0.0003, r1 + 0.024, 0], new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI / 2)))
}
