// ISO 668 series 1 freight container (10/20/40 ft, 40 ft high-cube): corrugated steel walls, ISO 1161 corner castings, door end with locking bars, forklift pockets, optional offshore lifting set.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { tagPlate } from '../lib/parts'
import { textMaterial } from '../lib/textures'
import { corrugated } from './_corrugated'
import { boxMM, padeyeShackle, slingSet } from './_rigging'

export type ContainerSize = '10ft' | '20ft' | '40ft' | '40ft-hc'

export interface ShippingContainerProps {
  size?: ContainerSize
  color?: string
  /** owner code and serial (ISO 6346) painted on the doors */
  marking?: string
  /** offshore padeyes, shackles and 4-leg sling set to a master link */
  liftingSet?: boolean
  /** door leaves swung fully open */
  doorsOpen?: boolean
  /** equipment tag on a stainless plate by the CSC plate */
  tag?: string
}

export const defaults = {
  size: '20ft' as ContainerSize,
  color: '#c4561c',
  marking: 'DTKU 220516 4',
  liftingSet: false,
  doorsOpen: false,
  tag: 'CT-101',
}

// ISO 668 external dimensions (m) and fork-pocket centres (ISO 1496-1), 0 = none
export const ISO668: Record<ContainerSize, { L: number; W: number; H: number; fork: number }> = {
  '10ft': { L: 2.991, W: 2.438, H: 2.591, fork: 1.2 },
  '20ft': { L: 6.058, W: 2.438, H: 2.591, fork: 2.05 },
  '40ft': { L: 12.192, W: 2.438, H: 2.591, fork: 0 },
  '40ft-hc': { L: 12.192, W: 2.438, H: 2.896, fork: 0 },
}

export function ShippingContainer({ size = defaults.size, color = defaults.color, marking = defaults.marking, liftingSet = defaults.liftingSet, doorsOpen = defaults.doorsOpen, tag = defaults.tag, ...group }: ShippingContainerProps & GroupProps) {
  const data = useKit((k) => build(k, ISO668[size] ?? ISO668['20ft'], color, marking, liftingSet, tag, doorsOpen), [size, color, marking, liftingSet, tag, doorsOpen])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ShippingContainer

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function build(k: Kit, d: { L: number; W: number; H: number; fork: number }, color: string, marking: string, lifting: boolean, tag: string, open: boolean) {
  const { L, W, H } = d
  const P = paint(color, { weather: 1 })
  const dark: MatKey = 'rubberBlack'
  const hx = L / 2
  const hz = W / 2
  const cc = { l: 0.178, h: 0.118, w: 0.162 }
  const post = 0.15
  const yB = 0.17
  const yT = H - 0.1

  // corner castings with apertures, corner posts
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (const top of [false, true]) {
        const y0 = top ? H - cc.h : 0
        boxMM(k, P, [sx * hx - (sx > 0 ? cc.l : 0), y0, sz * hz - (sz > 0 ? cc.w : 0)], [sx * hx + (sx < 0 ? cc.l : 0), y0 + cc.h, sz * hz + (sz < 0 ? cc.w : 0)])
        const cx = sx * (hx - cc.l / 2)
        const cz = sz * (hz - cc.w / 2)
        const ov = (w: number, h: number, pos: V3, n: V3) => {
          const g = new THREE.CircleGeometry(0.5, 16)
          g.scale(w, h, 1)
          k.add(dark, g, new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(...n)), V(1, 1, 1)))
        }
        ov(0.124, 0.064, [cx, top ? H + 0.001 : -0.001, cz], [0, top ? 1 : -1, 0])
        ov(0.078, 0.064, [cx, y0 + cc.h / 2, sz * (hz + 0.001)], [0, 0, sz])
        ov(0.064, 0.064, [sx * (hx + 0.001), y0 + cc.h / 2, cz], [sx, 0, 0])
      }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) boxMM(k, P, [sx * hx - (sx > 0 ? post : 0), cc.h, sz * hz - (sz > 0 ? post * 0.9 : 0)], [sx * hx + (sx < 0 ? post : 0), H - cc.h, sz * hz + (sz < 0 ? post * 0.9 : 0)])

  // side rails, end rails, door header and sill
  const xr0 = -hx + cc.l
  const xr1 = hx - cc.l
  for (const sz of [-1, 1]) {
    boxMM(k, P, [xr0, 0.0125, sz * hz - (sz > 0 ? 0.05 : 0)], [xr1, yB, sz * hz + (sz < 0 ? 0.05 : 0)])
    boxMM(k, P, [xr0, yT, sz * hz - (sz > 0 ? 0.06 : 0)], [xr1, H - 0.004, sz * hz + (sz < 0 ? 0.06 : 0)])
  }
  const zr0 = -hz + cc.w
  const zr1 = hz - cc.w
  boxMM(k, P, [-hx, 0.0125, zr0], [-hx + 0.08, yB, zr1])
  boxMM(k, P, [-hx, yT, zr0], [-hx + 0.08, H - 0.004, zr1])
  boxMM(k, P, [hx - 0.1, 0.0125, zr0], [hx, 0.13, zr1])
  boxMM(k, P, [hx - 0.1, H - 0.2, zr0], [hx, H - 0.004, zr1])
  // floor cross-members underneath
  const nx = Math.round((xr1 - xr0) / 0.3)
  for (let i = 0; i <= nx; i++) {
    const x = xr0 + ((xr1 - xr0) * i) / nx
    boxMM(k, P, [x - 0.025, 0.03, -hz + 0.05], [x + 0.025, yB - 0.01, hz - 0.05])
  }

  // corrugated side walls, roof and front end wall
  const wh = yT - yB
  const dep = 0.036
  for (const sz of [-1, 1]) corrugated(k, P, L - 2 * post + 0.02, wh, V(-hx + post - 0.01, yB, sz * (hz - 0.004 - dep)), [V(1, 0, 0), V(0, 0, sz), V(0, 1, 0)])
  corrugated(k, P, xr1 - xr0 + 0.02, W - 0.1, V(xr0 - 0.01, H - 0.04 - 0.02, -hz + 0.05), [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)], { pitch: 0.2, depth: 0.02, outer: 0.09 })
  corrugated(k, P, zr1 - zr0 + 0.06, wh, V(-hx + 0.004 + 0.045, yB, zr0 - 0.03), [V(0, 0, 1), V(-1, 0, 0), V(0, 1, 0)], { pitch: 0.33, depth: 0.045 })

  // labyrinth ventilators near the top of each side wall
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      boxMM(k, P, [sx * (hx - 0.45) - 0.09, H - 0.36, sz * (hz - 0.004) - 0.012], [sx * (hx - 0.45) + 0.09, H - 0.24, sz * (hz - 0.004) + 0.012])
      boxMM(k, dark, [sx * (hx - 0.45) - 0.07, H - 0.365, sz * (hz - 0.004) - 0.008], [sx * (hx - 0.45) + 0.07, H - 0.355, sz * (hz - 0.004) + 0.008])
    }

  // door end: two leaves with corrugated panels, frames, gaskets, hinges, 4 locking bars with cam keepers and handles
  const dz0 = -hz + post * 0.9
  const dz1 = hz - post * 0.9
  const dy0 = 0.13
  const dy1 = H - 0.2
  const xd = hx - 0.06
  const pq = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2)
  for (const sz of [-1, 1]) {
    const a = sz < 0 ? dz0 : 0.012
    const b = sz < 0 ? -0.012 : dz1
    const zp = sz * (hz - 0.04)
    // leaf geometry hinged about its outer pin; open leaves swing back 250° towards the side walls
    const ang = open ? -sz * (250 * Math.PI) / 180 : 0
    const hinge = new THREE.Matrix4().makeTranslation(hx + 0.03, 0, zp).multiply(new THREE.Matrix4().makeRotationY(ang)).multiply(new THREE.Matrix4().makeTranslation(-hx - 0.03, 0, -zp))
    for (const y of [dy0 + 0.25, dy0 + 0.95, dy1 - 0.95, dy1 - 0.25]) {
      k.cyl('galvanised', 0.018, 0.1, [hx + 0.03, y, zp], 'y', 10)
      boxMM(k, 'galvanised', [hx - 0.02, y + 0.05, zp - 0.03], [hx + 0.04, y + 0.07, zp + 0.03])
    }
    k.with(hinge, () => {
      corrugated(k, P, b - a - 0.08, dy1 - dy0 - 0.12, V(xd, dy0 + 0.06, a + 0.04), [V(0, 0, 1), V(1, 0, 0), V(0, 1, 0)], { pitch: 0.29, depth: 0.03 })
      boxMM(k, P, [xd, dy0, a], [xd + 0.045, dy0 + 0.06, b])
      boxMM(k, P, [xd, dy1 - 0.06, a], [xd + 0.045, dy1, b])
      boxMM(k, P, [xd, dy0, a], [xd + 0.045, dy1, a + 0.045])
      boxMM(k, P, [xd, dy0, b - 0.045], [xd + 0.045, dy1, b])
      // EPDM door gasket round the inside of the leaf
      boxMM(k, dark, [xd - 0.012, dy0 + 0.01, a + 0.005], [xd, dy0 + 0.035, b - 0.005])
      boxMM(k, dark, [xd - 0.012, dy1 - 0.035, a + 0.005], [xd, dy1 - 0.01, b - 0.005])
      for (const z of [a + 0.005, b - 0.03]) boxMM(k, dark, [xd - 0.012, dy0 + 0.01, z], [xd, dy1 - 0.01, z + 0.025])
      for (const y of [dy0 + 0.25, dy0 + 0.95, dy1 - 0.95, dy1 - 0.25]) boxMM(k, 'galvanised', [xd + 0.03, y - 0.03, zp - sz * 0.25], [hx + 0.03, y + 0.03, zp - sz * 0.012])
      for (const f of [0.28, 0.72]) {
        const z = a + (b - a) * (sz < 0 ? f : 1 - f)
        const xb = xd + 0.1
        k.cyl('galvanised', 0.0135, dy1 - dy0 + 0.1, [xb, (dy0 + dy1) / 2, z], 'y', 10)
        for (const y of [dy0 - 0.03, dy1 + 0.03]) k.box('galvanised', [0.05, 0.05, 0.035], [xb + 0.015, y, z])
        for (const y of [dy0 + 0.35, dy1 - 0.35]) boxMM(k, 'galvanised', [xd + 0.03, y - 0.04, z - 0.03], [xb + 0.02, y + 0.04, z + 0.03])
        const yh = 1.25
        const zd = Math.sign(z) * 0.2
        k.rod('galvanised', [xb + 0.025, yh, z], [xb + 0.025, yh, z + zd], 0.014, 8)
        boxMM(k, 'galvanised', [xd + 0.03, yh - 0.06, z + zd - 0.02 * Math.sign(zd)], [xb + 0.05, yh + 0.06, z + zd + 0.03 * Math.sign(zd)])
      }
      // CSC safety approval plate and tag on the left leaf, owner code on the right leaf
      if (sz > 0) {
        k.box('nameplate', [0.36, 0.2, 0.002], [hx - 0.027, dy0 + 0.6, 0.55], pq)
        k.plane(textMaterial('CSC SAFETY APPROVAL', '#e9eae6', '#222222', 512, 64), 0.32, 0.04, [hx - 0.0255, dy0 + 0.67, 0.55], pq)
        if (tag) tagPlate(k, tag, [hx - 0.027, dy0 + 0.82, 0.55], 'x', 0.26)
      } else if (marking) k.plane(textMaterial(marking, color, '#f4f4f0', 768, 112), 0.42, 0.062, [hx - 0.0265, dy1 - 0.22, (dz0 - 0.012) * 0.5], pq)
    })
    // cam keepers on the header and sill (fixed to the frame)
    for (const f of [0.28, 0.72]) {
        const z = a + (b - a) * (sz < 0 ? f : 1 - f)
        for (const y of [dy0 - 0.03, dy1 + 0.03]) boxMM(k, 'galvanised', [xd + 0.05, y - 0.035, z - 0.045], [xd + 0.135, y + 0.035, z - 0.01])
      }
  }
  if (!open) boxMM(k, dark, [xd - 0.01, dy0, -0.012], [xd + 0.03, dy1, 0.012])
  if (marking) k.plane(textMaterial(marking, color, '#f4f4f0', 768, 112), 1.2, 0.175, [hx - cc.l - 0.75, H - 0.38, hz + 0.002])
  // plywood floor (visible with the doors open)
  boxMM(k, paint('#8a6a45', { weather: 0.4, clearcoat: 0 }), [-hx + 0.08, yB - 0.028, -hz + 0.05], [hx - 0.1, yB, hz - 0.05])

  // forklift pockets (10 / 20 ft)
  if (d.fork)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = (sx * d.fork) / 2
        boxMM(k, P, [x - 0.22, 0.0125, sz * (hz + 0.006) - 0.006], [x + 0.22, yB, sz * (hz + 0.006) + 0.006])
        boxMM(k, dark, [x - 0.178, 0.03, sz * (hz + 0.013) - 0.002], [x + 0.178, 0.145, sz * (hz + 0.013) + 0.002])
      }

  if (lifting) {
    const eyes: V3[] = []
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) eyes.push(padeyeShackle(k, [sx * (hx - 0.45), H - 0.004, sz * (hz - 0.03)], 'z', 1.4, P))
    const half = Math.hypot(hx - 0.45, hz - 0.03)
    slingSet(k, eyes, [0, H + half * 1.05, 0], 0.3, 0.014)
  }
}
