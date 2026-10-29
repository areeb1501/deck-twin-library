// Wall, ceiling or stand-mounted display, or a stainless panel PC, with a procedural HMI page or a live texture. VESA MIS.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { furnitureMats, panelSize } from './_furniture'
import { ScreenPanels, type ScreenKind, type ScreenPlacement } from './_screens'

export interface WallDisplayProps {
  /** diagonal, inches */
  size?: number
  mount?: 'wall' | 'ceiling' | 'stand'
  /** commercial display, or an industrial panel PC with a stainless bezel and function keys */
  style?: 'display' | 'panel-pc'
  /** screen centre above the floor, m */
  elevation?: number
  /** ceiling height for the ceiling mount, m */
  ceilingHeight?: number
  /** forward tilt, degrees (screen face tips down) */
  tilt?: number
  content?: ScreenKind
  /** live texture for the screen; overrides `content` */
  screen?: THREE.Texture | null
  tag?: string
}

export const defaults = {
  size: 55,
  mount: 'wall' as 'wall' | 'ceiling' | 'stand',
  style: 'display' as 'display' | 'panel-pc',
  elevation: 1.8,
  ceilingHeight: 3.0,
  tilt: 0,
  content: 'cctv' as ScreenKind,
  screen: null as THREE.Texture | null,
  tag: 'DSP-101',
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function WallDisplay({ screen, ...props }: WallDisplayProps & GroupProps) {
  const { size, mount, style, elevation, ceilingHeight, tilt, content, tag, ...group } = { ...defaults, ...props }
  const b = useMemo(() => build({ size, mount, style, elevation, ceilingHeight, tilt, content, tag }), [size, mount, style, elevation, ceilingHeight, tilt, content, tag])
  useEffect(() => () => b.built.geometry.dispose(), [b])
  return (
    <group {...group}>
      <KitMesh data={b.built} />
      <ScreenPanels placements={b.placements} screens={[screen]} />
    </group>
  )
}

export default WallDisplay

function build(p: Omit<typeof defaults, 'screen'>) {
  const k = new Kit()
  const M = furnitureMats()
  const panel = p.style === 'panel-pc'
  const d = clamp(p.size, panel ? 10 : 24, panel ? 32 : 98)
  const [w, h] = panelSize(d)
  const bz = panel ? 0.05 : 0.008 // bezel
  const depth = panel ? 0.09 : 0.055
  const yC = p.mount === 'ceiling' ? Math.min(p.elevation, p.ceilingHeight - h / 2 - 0.4) : clamp(p.elevation, h / 2 + 0.3, 3)
  const ceilingTilt = p.mount === 'ceiling' ? Math.max(p.tilt, 10) : p.tilt
  const tiltR = (clamp(ceilingTilt, -10, 30) * Math.PI) / 180
  const zBack = p.mount === 'wall' ? 0 : -depth / 2 // wall plane at z = 0 for the wall mount
  const pivot: V3 = [0, yC, zBack + (p.mount === 'wall' ? 0.08 : 0) + depth / 2]
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pivot), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tiltR), new THREE.Vector3(1, 1, 1))
  const stainless = paint('#c3c7cb', { metalness: 0.85, roughness: 0.28, clearcoat: 0, weather: 0 })
  const placements: ScreenPlacement[] = []

  // the display itself, in the tilt frame (face towards +Z)
  k.with(m, () => {
    const zf = depth / 2
    if (panel) {
      k.rbox(stainless, [w + 2 * bz, h + 2 * bz + 0.06, depth], 0.01, [0, -0.03, 0])
      k.box(M.bezel, [w + 0.01, h + 0.01, 0.004], [0, 0, zf + 0.001])
      // function keys and status LEDs under the screen, IP66 gasket line
      for (let i = 0; i < 8; i++) k.rbox('plasticGrey', [0.03, 0.022, 0.008], 0.004, [-w / 2 + 0.03 + (i * (w - 0.06)) / 7, -h / 2 - bz * 0.55 - 0.03, zf + 0.004])
      for (let i = 0; i < 3; i++) k.box(i === 0 ? M.ledGreen : M.ledAmber, [0.008, 0.008, 0.003], [w / 2 + bz * 0.5, h / 2 - 0.02 - i * 0.03, zf + 0.0015])
      k.box('rubberBlack', [w + 2 * bz - 0.01, 0.004, 0.004], [0, h / 2 + bz - 0.004, -zf + 0.01])
      tagPlate(k, p.tag, [-w / 2 + 0.05, -h / 2 - bz - 0.03, zf + 0.001], 'z', 0.07)
    } else {
      k.rbox(M.bezel, [w + 2 * bz, h + 2 * bz + 0.006, 0.02], 0.004, [0, -0.003, zf - 0.01])
      k.rbox(M.housing, [w * 0.95, h * 0.9, depth - 0.02], 0.015, [0, 0, -0.01])
      k.box(M.ledGreen, [0.006, 0.004, 0.002], [w / 2 - 0.03, -h / 2 - bz + 0.002, zf + 0.0005])
      tagPlate(k, p.tag, [w / 2 - 0.12, h * 0.3, -zf - 0.001], '-z', 0.12)
    }
    placements.push({ pos: [0, 0, zf + (panel ? 0.0036 : 0.0006)], w, h, kind: p.content, rot: [0, 0, 0] })
    // VESA plate on the back
    k.box('aluminium', [0.4, 0.3, 0.01], [0, 0, -depth / 2 - 0.005])
  })
  // transform the placement into the item frame
  {
    const pl = placements[0]
    const v = new THREE.Vector3(...pl.pos).applyMatrix4(m)
    pl.pos = v.toArray() as V3
    pl.rot = [tiltR, 0, 0]
  }

  if (p.mount === 'wall') {
    // tilting wall bracket: wall rails, arms to the VESA plate
    for (const s of [-1, 1]) k.box(M.housing, [Math.min(0.8, w * 0.7), 0.05, 0.015], [0, yC + s * 0.15, 0.0075])
    for (const s of [-1, 1]) k.box(M.housing, [0.04, 0.4, 0.07], [s * 0.15, yC, 0.05])
  } else if (p.mount === 'ceiling') {
    // drop pole from a ceiling plate, yoke to the VESA plate
    const yTop = p.ceilingHeight
    k.cyl(M.housing, 0.09, 0.012, [0, yTop - 0.006, pivot[2] - depth / 2 - 0.05], 'y', 24)
    k.cyl(M.alu, 0.025, yTop - yC - 0.15, [0, (yTop + yC + 0.15) / 2, pivot[2] - depth / 2 - 0.05], 'y', 16)
    k.box(M.housing, [0.5, 0.05, 0.05], [0, yC + 0.15, pivot[2] - depth / 2 - 0.05])
    for (const s of [-1, 1]) k.box(M.housing, [0.03, 0.18, 0.04], [s * 0.2, yC + 0.08, pivot[2] - depth / 2 - 0.035])
  } else {
    // mobile stand: H base on castors, twin columns
    const zs = pivot[2] - depth / 2 - 0.06
    for (const s of [-1, 1]) {
      k.box(M.housing, [0.06, yC + 0.1, 0.04], [s * 0.2, (yC + 0.1) / 2, zs])
      k.box(M.housing, [0.08, 0.05, 0.7], [s * 0.3, 0.09, zs])
      for (const e of [-1, 1]) {
        k.cyl('rubberBlack', 0.035, 0.03, [s * 0.3, 0.035, zs + e * 0.32], 'x', 14)
        k.box(M.housing, [0.03, 0.04, 0.04], [s * 0.3, 0.075, zs + e * 0.32])
      }
    }
    k.box(M.housing, [0.68, 0.05, 0.06], [0, 0.09, zs])
    k.box(M.housing, [0.5, 0.08, 0.05], [0, yC, zs + 0.02])
    k.box(M.housing, [0.5, 0.02, 0.3], [0, 0.95, zs + 0.15])
  }
  return { built: k.build(), placements }
}
