// Site gatehouse: glazed guard hut on a kerbed island with flat roof canopy, plus an automatic boom barrier with rest post. EN 12453, EN 13241.
import * as THREE from 'three'
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { hazardStripeMaterial, textMaterial } from '../lib/textures'
import { anchorBolt, clamp, earthBond } from './_onshore'

export interface GatehouseProps {
  /** clear lane width spanned by the boom, m */
  laneWidth?: number
  /** boom, 0 down … 1 raised */
  open?: number
  tag?: string
}

export const defaults = { laneWidth: 5, open: 0, tag: '' }

const HUT = { x: 3.2, z: 2.4, h: 2.7 }
const ISL = { x: 6.0, z: 3.4, h: 0.15 }

export function Gatehouse(props: GatehouseProps & GroupProps) {
  const { laneWidth, open, tag, ...group } = { ...defaults, ...props }
  const lw = clamp(laneWidth, 3, 8)
  const fixed = useKit((k) => build(k, lw, tag), [lw, tag])
  const boom = useKit((k) => buildBoom(k, lw), [lw])
  const pivot: [number, number, number] = [1.9, ISL.h + 1.0, ISL.z / 2 - 0.25]
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <group position={pivot} rotation-x={-(clamp(open, 0, 1) * Math.PI) / 2}>
        <KitMesh data={boom} />
      </group>
    </group>
  )
}

export default Gatehouse

function buildBoom(k: Kit, lw: number) {
  // white aluminium boom with red bands, rubber skirt edge, pivot hub
  const L = lw + 0.5
  const red = paint('#c3221a', { clearcoat: 0.4 })
  k.cyl('stainless', 0.09, 0.12, [0, 0, 0], 'x', 20)
  const n = Math.round(L / 0.5)
  for (let i = 0; i < n; i++) k.box(i % 2 ? red : paint('#f2f2ee', { clearcoat: 0.4 }), [0.07, 0.11, L / n], [0.07, 0, 0.1 + (i + 0.5) * (L / n)])
  k.box('rubberBlack', [0.05, 0.03, L], [0.07, -0.07, 0.1 + L / 2])
  k.cyl('lampLens', 0.02, 0.02, [0.11, 0.0, L * 0.5], 'x', 10)
}

function build(k: Kit, lw: number, tag: string) {
  const top = ISL.h
  // kerbed island with striped ends
  k.box('concrete', [ISL.x, top, ISL.z], [0, top / 2, 0])
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.3, top + 0.002, ISL.z + 0.002)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * 6, uv.getY(j) * 0.4)
    k.add(hazardStripeMaterial(), g, new THREE.Matrix4().makeTranslation(s * (ISL.x / 2 - 0.15), top / 2, 0))
  }
  // hut: plinth, solid lower panels, full-height glazing with mullions, door on the -X side
  const hx = -0.9
  const wall = paint('#e3e4df', { metalness: 0.2, roughness: 0.5 })
  const frame = paint('#3e4a52', { metalness: 0.3, roughness: 0.5 })
  const y0 = top
  const h = HUT.h
  const t = 0.1
  const sill = 1.0
  const sides: [number, number, number, number][] = [
    [hx, HUT.z / 2 - t / 2, HUT.x, 0],
    [hx, -HUT.z / 2 + t / 2, HUT.x, 0],
    [hx + HUT.x / 2 - t / 2, 0, HUT.z, 1],
    [hx - HUT.x / 2 + t / 2, 0, HUT.z, 1],
  ]
  for (const [cx, cz, len, alongZ] of sides) {
    const size = (a: number, hh: number): [number, number, number] => (alongZ ? [t, hh, a] : [a, hh, t])
    const isDoor = alongZ && cx < hx
    if (isDoor) {
      // door leaf and side panel
      k.box(wall, size(len - 1.0, sill), [cx, y0 + sill / 2, cz + 0.5])
      k.box('glass', size(len - 1.0, 2.2 - sill), [cx, y0 + sill + (2.2 - sill) / 2, cz + 0.5])
      k.box(paint('#7a8a96'), size(0.95, 2.1), [cx - 0.01, y0 + 1.05, cz - len / 2 + 0.5])
      k.box('glass', size(0.6, 0.8), [cx - 0.04, y0 + 1.45, cz - len / 2 + 0.5])
      k.box('stainless', [0.04, 0.03, 0.14], [cx - 0.08, y0 + 1.0, cz - len / 2 + 0.85])
    } else {
      k.box(wall, size(len, sill), [cx, y0 + sill / 2, cz])
      k.box('glass', size(len, 2.3 - sill), [cx, y0 + sill + (2.3 - sill) / 2, cz])
      const nm = Math.max(1, Math.round(len / 1.0))
      for (let i = 0; i <= nm; i++) {
        const o = -len / 2 + (i * len) / nm
        k.box(frame, alongZ ? [t + 0.02, 2.3 - sill, 0.05] : [0.05, 2.3 - sill, t + 0.02], alongZ ? [cx, y0 + sill + (2.3 - sill) / 2, cz + o] : [cx + o, y0 + sill + (2.3 - sill) / 2, cz])
      }
    }
    k.box(wall, size(len, h - 2.3), [cx, y0 + 2.3 + (h - 2.3) / 2, cz])
    k.box(frame, size(len + 0.02, 0.05), [cx, y0 + sill, cz])
  }
  k.box(paint('#9a9c97'), [HUT.x - 2 * t, 0.02, HUT.z - 2 * t], [hx, y0 + 0.01, 0])
  // flat roof with canopy overhang over the lane side, fascia, rain outlets
  k.box(wall, [HUT.x + 1.0, 0.25, HUT.z + 1.4], [hx, y0 + h + 0.125, 0.2])
  k.box(frame, [HUT.x + 1.04, 0.08, HUT.z + 1.44], [hx, y0 + h + 0.29, 0.2])
  k.plane(textMaterial('SECURITY', '#1f4e9a', '#ffffff', 512, 96), 1.6, 0.22, [hx, y0 + h + 0.125, HUT.z / 2 + 0.9 + 0.001])
  k.cyl(frame, 0.04, h + 0.1, [hx - HUT.x / 2 - 0.3, y0 + (h + 0.1) / 2, HUT.z / 2 + 0.6], 'y', 10)
  // interior: counter along the lane window, monitors, chair
  k.box(paint('#cfc7b6'), [HUT.x - 0.5, 0.05, 0.6], [hx + 0.1, y0 + 0.78, HUT.z / 2 - 0.4])
  k.box(paint('#8e8e88'), [HUT.x - 0.5, 0.75, 0.04], [hx + 0.1, y0 + 0.375, HUT.z / 2 - 0.68])
  for (const dx of [-0.4, 0.3]) {
    k.box(paint('#1b1d20'), [0.5, 0.32, 0.03], [hx + dx, y0 + 1.05, HUT.z / 2 - 0.45])
    k.box(paint('#1b1d20'), [0.05, 0.12, 0.05], [hx + dx, y0 + 0.86, HUT.z / 2 - 0.45])
  }
  k.cyl(paint('#2c2f33'), 0.22, 0.06, [hx, y0 + 0.48, HUT.z / 2 - 1.0], 'y', 16)
  k.cyl('stainless', 0.025, 0.45, [hx, y0 + 0.23, HUT.z / 2 - 1.0], 'y', 8)
  // wall-mounted AC condenser at the rear, CCTV camera and floodlight on a pole
  k.rbox(paint('#e6e7e3'), [0.8, 0.55, 0.3], 0.02, [hx, y0 + 0.7, -HUT.z / 2 - 0.2])
  k.cyl(paint('#3a3f44'), 0.2, 0.01, [hx - 0.12, y0 + 0.7, -HUT.z / 2 - 0.05 + 0.0], 'z', 24)
  const px = ISL.x / 2 - 0.6
  const pz = -ISL.z / 2 + 0.4
  k.box('galvanised', [0.3, 0.02, 0.3], [px, top + 0.01, pz])
  for (const a of [-1, 1]) for (const b of [-1, 1]) anchorBolt(k, [px + a * 0.11, top + 0.02, pz + b * 0.11], 0.016)
  k.cyl('galvanised', 0.06, 5.0, [px, top + 2.52, pz], 'y', 12)
  k.rbox(paint('#e6e7e3'), [0.3, 0.12, 0.12], 0.02, [px - 0.1, top + 4.6, pz + 0.1])
  k.rbox('aluminium', [0.4, 0.08, 0.3], 0.02, [px, top + 5.0, pz + 0.15])
  k.box('lampLens', [0.35, 0.01, 0.25], [px, top + 4.955, pz + 0.15])
  // boom barrier cabinet with bollards, rest post across the lane, stop line and road hump
  const bx = 1.9
  const bz = ISL.z / 2 - 0.25
  k.rbox(paint('#e5b114', { clearcoat: 0.4 }), [0.32, 1.0, 0.34], 0.03, [bx + 0.18, top + 0.5, bz])
  k.box('stainless', [0.3, 0.02, 0.32], [bx + 0.18, top + 1.01, bz])
  k.box('nut', [0.36, 0.08, 0.4], [bx + 0.18, top + 0.04, bz])
  earthBond(k, [bx + 0.34, top + 0.2, bz], [1, 0, 0], top, 0.25)
  for (const dx of [-0.35, 0.7]) {
    k.cyl(paint('#e5b114'), 0.08, 1.0, [bx + dx, top + 0.5, bz - 0.1], 'y', 14)
    k.dome(paint('#e5b114'), 0.08, [bx + dx, top + 1.0, bz - 0.1], 'y')
  }
  const rz = ISL.z / 2 + lw + 0.25
  k.box('concrete', [0.4, 0.1, 0.4], [bx, 0.05, rz])
  k.box(paint('#f2f2ee'), [0.08, 0.95, 0.08], [bx + 0.07, 0.1 + 0.475, rz])
  k.box(paint('#c3221a'), [0.1, 0.12, 0.1], [bx + 0.07, 0.85, rz])
  for (const s of [-1, 1]) k.box('rubberBlack', [0.03, 0.15, 0.04], [bx + 0.07 + s * 0.06, 1.1, rz])
  k.box(paint('#f2f2ee', { metalness: 0, roughness: 0.8, clearcoat: 0 }), [0.3, 0.004, lw], [bx - 1.2, 0.002, ISL.z / 2 + lw / 2])
  const hump = new THREE.BoxGeometry(0.6, 0.06, lw)
  const uv = hump.getAttribute('uv') as THREE.BufferAttribute
  for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * 1, uv.getY(j) * lw * 2)
  k.add(hazardStripeMaterial(), hump, new THREE.Matrix4().makeTranslation(-4.2, 0.03, ISL.z / 2 + lw / 2))
  k.plane(textMaterial('STOP', '#c3221a', '#ffffff', 256, 128), 0.6, 0.3, [bx + 0.18, top + 0.8, bz + 0.171])
  if (tag) tagPlate(k, tag, [hx + HUT.x / 2 + 0.001, top + 0.6, 0], 'x', 0.3)
}
