// Shift supervisor desk with monitors, phone and chair, or a meeting table with chairs. EN 527-1.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { chair, deskPhone, frame, furnitureMats, keyboardAndMouse, monitor, panelSize } from './_furniture'
import { ScreenPanels, type ScreenKind, type ScreenPlacement } from './_screens'
import { labelMaterial } from './_textures'

export interface DeskProps {
  layout?: 'supervisor' | 'meeting'
  /** top length along X, m */
  width?: number
  /** top depth along Z, m */
  depth?: number
  /** supervisor desk monitors */
  monitors?: number
  /** meeting table seats */
  seats?: number
  chairs?: boolean
  content?: ScreenKind[]
  /** live textures per monitor, left to right */
  screens?: (THREE.Texture | null | undefined)[]
  tag?: string
}

export const defaults = {
  layout: 'supervisor' as 'supervisor' | 'meeting',
  width: 1.8,
  depth: 0.9,
  monitors: 2,
  seats: 6,
  chairs: true,
  content: ['esd', 'alarm', 'kpi'] as ScreenKind[],
  screens: [] as (THREE.Texture | null | undefined)[],
  tag: 'SUPERVISOR',
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function Desk({ screens, ...props }: DeskProps & GroupProps) {
  const { layout, width, depth, monitors, seats, chairs, content, tag, ...group } = { ...defaults, ...props }
  const ck = content.join(',')
  const b = useMemo(() => build({ layout, width, depth, monitors, seats, chairs, content, tag }), [layout, width, depth, monitors, seats, chairs, ck, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => b.built.geometry.dispose(), [b])
  return (
    <group {...group}>
      <KitMesh data={b.built} />
      <ScreenPanels placements={b.placements} screens={screens} />
    </group>
  )
}

export default Desk

function build(p: Omit<typeof defaults, 'screens'>) {
  const k = new Kit()
  const M = furnitureMats()
  const placements: ScreenPlacement[] = []
  const W = clamp(p.width, 1.0, 6)
  const D = clamp(p.depth, 0.6, 2)
  const H = 0.72
  const top = paint('#d9dad5', { metalness: 0, roughness: 0.55, clearcoat: 0.15, weather: 0 })
  const leg = paint('#3a3f44', { metalness: 0.4, roughness: 0.45, clearcoat: 0.1, weather: 0 })
  k.rbox(top, [W, 0.03, D], 0.008, [0, H - 0.015, 0])
  k.box(M.bezel, [W - 0.01, 0.006, D - 0.01], [0, H - 0.031, 0])
  if (p.layout === 'meeting') {
    // pedestal table: two T-legs, cable box in the middle, chairs around
    for (const s of [-1, 1]) {
      k.box(leg, [0.08, H - 0.05, 0.08], [s * (W / 2 - 0.4), (H - 0.05) / 2 + 0.02, 0])
      k.box(leg, [0.1, 0.03, D * 0.8], [s * (W / 2 - 0.4), 0.015, 0])
      k.box(leg, [0.06, 0.04, D * 0.75], [s * (W / 2 - 0.4), H - 0.05, 0])
    }
    k.box(leg, [W - 0.8, 0.04, 0.06], [0, H - 0.06, 0])
    k.box('aluminium', [0.3, 0.004, 0.12], [0, H + 0.002, 0])
    const n = clamp(Math.round(p.seats), 2, 16)
    if (p.chairs) {
      const perSide = Math.ceil(n / 2)
      for (let i = 0; i < n; i++) {
        const side = i < perSide ? 1 : -1
        const j = i < perSide ? i : i - perSide
        const cnt = i < perSide ? perSide : n - perSide
        const x = -W / 2 + ((j + 0.5) * W) / cnt
        chair(k, frame([x, 0, side * (D / 2 + 0.35)], [0, side > 0 ? Math.PI : 0, 0]), { headrest: false })
      }
    }
    k.plane(labelMaterial(p.tag), 0.2, 0.04, [0, H - 0.015, D / 2 + 0.0005])
    return { built: k.build(), placements }
  }
  // supervisor desk: modesty panel, side panels, drawer pedestal, monitors on stands, phone, chair (+Z side)
  for (const s of [-1, 1]) k.box(leg, [0.03, H - 0.03, D - 0.06], [s * (W / 2 - 0.03), (H - 0.03) / 2, 0])
  k.box(leg, [W - 0.1, 0.4, 0.02], [0, H - 0.25, -D / 2 + 0.06])
  k.box(leg, [0.42, H - 0.08, D * 0.65], [W / 2 - 0.3, (H - 0.08) / 2 + 0.02, -D * 0.12])
  for (let i = 0; i < 3; i++) {
    const y = 0.12 + i * 0.2
    k.box(top, [0.4, 0.18, 0.01], [W / 2 - 0.3, y, -D * 0.12 + D * 0.325 + 0.005])
    k.box(M.alu, [0.12, 0.012, 0.02], [W / 2 - 0.3, y + 0.06, -D * 0.12 + D * 0.325 + 0.016])
  }
  const n = clamp(Math.round(p.monitors), 0, 3)
  const diag = 24
  const [mw] = panelSize(diag)
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (mw + 0.03)
    const yaw = n > 1 ? -((i - (n - 1) / 2) * 0.25) : 0
    const m = frame([x, H + 0.13 + 0.17, -D / 2 + 0.25], [0, yaw, 0])
    placements.push(monitor(k, m, diag, p.content.length ? p.content[i % p.content.length] : 'overview', { stand: true }))
  }
  keyboardAndMouse(k, frame([0, H, -D / 2 + 0.55]), 0.3)
  deskPhone(k, frame([-W / 2 + 0.3, H, -D / 2 + 0.35], [0, 0.3, 0]))
  // document tray and a printed shift log
  k.box('plasticGrey', [0.25, 0.06, 0.33], [-W / 2 + 0.3, H + 0.03, D / 2 - 0.25])
  k.box(paint('#f4f4f0', { weather: 0, metalness: 0, roughness: 0.9, clearcoat: 0 }), [0.21, 0.01, 0.297], [-W / 2 + 0.3, H + 0.055, D / 2 - 0.25])
  k.plane(labelMaterial(p.tag), 0.3, 0.05, [0, H - 0.2, -D / 2 + 0.049], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
  if (p.chairs) chair(k, frame([0, 0, D / 2 + 0.25], [0, Math.PI, 0]))
  return { built: k.build(), placements }
}
