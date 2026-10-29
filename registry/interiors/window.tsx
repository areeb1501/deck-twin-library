// Offshore window set in a wall stub: fixed A60 / H120 or blast-rated, rounded-corner bolted frame, double glazing with gaskets, optional sunshade. IMO FTP Code, ISO 3903.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { liningMaterial, ratingLabelMaterial } from './_textures'
import { wallWithHoles } from './_wall'

export type FireRating = 'A60' | 'H120' | 'none'

export interface WindowProps {
  kind?: 'fixed' | 'blast'
  fireRating?: FireRating
  /** glazed width, m */
  width?: number
  /** glazed height, m */
  height?: number
  /** glazing bottom above the floor, m */
  sill?: number
  /** lights across, separated by mullions */
  panes?: number
  /** external louvred sunshade over the window (+Z is outside) */
  sunshade?: boolean
  wall?: 'stub' | 'none'
  wallThickness?: number
  tag?: string
}

export const defaults = {
  kind: 'fixed' as 'fixed' | 'blast',
  fireRating: 'A60' as FireRating,
  width: 1.2,
  height: 0.9,
  sill: 1.0,
  panes: 1,
  sunshade: false,
  wall: 'stub' as 'stub' | 'none',
  wallThickness: 0.15,
  tag: 'W-101',
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Rough hole a window needs in a wall: centred on x = 0, from y0 to y1. */
export function windowOpening(p: Pick<WindowProps, 'kind' | 'width' | 'height' | 'sill'> = {}) {
  const blast = (p.kind ?? defaults.kind) === 'blast'
  const W = clamp(p.width ?? defaults.width, 0.3, 4)
  const H = clamp(p.height ?? defaults.height, 0.3, 2.4)
  const FR = blast ? 0.1 : 0.07
  const sill = clamp(p.sill ?? defaults.sill, 0.1, 2.5)
  return { W, H, FR, holeW: W + 2 * FR, y0: sill - FR, y1: sill + H + FR }
}

export function Window(props: WindowProps & GroupProps) {
  const { kind, fireRating, width, height, sill, panes, sunshade, wall, wallThickness, tag, ...group } = { ...defaults, ...props }
  const b = useMemo(() => build({ kind, fireRating, width, height, sill, panes, sunshade, wall, wallThickness, tag }), [kind, fireRating, width, height, sill, panes, sunshade, wall, wallThickness, tag])
  useEffect(() => () => b.geometry.dispose(), [b])
  return (
    <group {...group}>
      <KitMesh data={b} />
    </group>
  )
}

export default Window

function rrect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape()
  const x0 = cx - w / 2
  const y0 = cy - h / 2
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3)
  s.moveTo(x0 + r, y0)
  s.lineTo(x0 + w - r, y0)
  s.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x0 + w, y0 + h - r)
  s.absarc(x0 + w - r, y0 + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x0 + r, y0 + h)
  s.absarc(x0 + r, y0 + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x0, y0 + r)
  s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}
function ring(k: Kit, mat: MatKey, ow: number, oh: number, orad: number, iw: number, ih: number, irad: number, z0: number, depth: number, cy: number) {
  const s = rrect(ow, oh, orad, 0, cy)
  s.holes.push(rrect(iw, ih, irad, 0, cy))
  k.extrude(mat, s, depth, new THREE.Matrix4().makeTranslation(0, 0, z0), 12)
}

function build(p: typeof defaults) {
  const k = new Kit()
  const o = windowOpening(p)
  const { W, H, FR } = o
  const blast = p.kind === 'blast'
  const T = clamp(p.wallThickness, 0.06, 0.4)
  const FD = T + 0.04
  const cy = p.sill + H / 2
  const rIn = blast ? 0.06 : 0.08 // rounded glass corners, marine practice
  const frameMat = paint(blast ? '#5d646a' : '#c9cdc9', { metalness: 0.35, roughness: 0.42, clearcoat: 0.2, weather: 0 })
  const n = clamp(Math.round(p.panes), 1, 6)
  const mull = 0.06
  const lw = (W - (n - 1) * mull) / n

  if (p.wall === 'stub') {
    const len = o.holeW + 1.4
    const hh = Math.max(2.9, o.y1 + 0.6)
    wallWithHoles(k, len, hh, T, [{ u: 0, w: o.holeW, y0: o.y0, y1: o.y1 }], liningMaterial())
    for (const s of [-1, 1]) k.box('rubberBlack', [len, 0.1, 0.008], [0, 0.05, s * (T / 2 + 0.004)])
  }

  // main frame: square outside to fill the hole, rounded light openings; exterior bolting flange
  ring(k, frameMat, o.holeW, H + 2 * FR, 0.004, W, H, rIn, -FD / 2, FD, cy)
  ring(k, frameMat, o.holeW + 0.1, H + 2 * FR + 0.1, 0.03, W + 0.02, H + 0.02, rIn + 0.01, FD / 2 - 0.012, 0.012, cy)
  ring(k, frameMat, o.holeW + 0.04, H + 2 * FR + 0.04, 0.02, W + 0.02, H + 0.02, rIn + 0.01, -FD / 2 - 0.006, 0.006, cy) // interior trim
  // mullions
  for (let i = 1; i < n; i++) {
    const x = -W / 2 + i * lw + (i - 0.5) * mull
    k.box(frameMat, [mull, H, FD], [x, cy, 0])
  }
  // double glazing per light: outer pane, spacer, inner pane, gaskets, clamping ring with bolts
  const tOut = blast ? 0.0128 : 0.01 // laminated outer for blast
  const tIn = blast ? 0.0175 : 0.012
  const gap = 0.016
  const zG = 0.0
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + i * (lw + mull) + lw / 2
    const r = n > 1 ? Math.min(rIn, 0.03) : rIn
    const pane = (z: number, t: number) => k.extrude('glass', rrect(lw - 0.004, H - 0.004, r, x, cy), t, new THREE.Matrix4().makeTranslation(0, 0, z), 12)
    pane(zG + gap / 2, tOut)
    pane(zG - gap / 2 - tIn, tIn)
    const sp = rrect(lw, H, r, x, cy)
    sp.holes.push(rrect(lw - 0.03, H - 0.03, Math.max(0.005, r - 0.015), x, cy))
    k.extrude('nut', sp, gap, new THREE.Matrix4().makeTranslation(0, 0, zG - gap / 2), 12)
    for (const [z, d] of [[zG + gap / 2 + tOut, 0.006], [zG - gap / 2 - tIn - 0.006, 0.006]] as const) {
      const g = rrect(lw + 0.006, H + 0.006, r + 0.003, x, cy)
      g.holes.push(rrect(lw - 0.024, H - 0.024, Math.max(0.005, r - 0.012), x, cy))
      k.extrude('rubberBlack', g, d, new THREE.Matrix4().makeTranslation(0, 0, z), 12)
    }
    // clamping ring on the inside face, bolted
    const cr = rrect(lw + 0.03, H + 0.03, r + 0.015, x, cy)
    cr.holes.push(rrect(lw - 0.03, H - 0.03, Math.max(0.005, r - 0.015), x, cy))
    k.extrude(frameMat, cr, 0.012, new THREE.Matrix4().makeTranslation(0, 0, -FD / 2 - 0.012), 12)
    const per = 2 * (lw + H)
    const nb = Math.max(8, Math.round(per / (blast ? 0.12 : 0.2)))
    for (let b = 0; b < nb; b++) {
      const q = boundaryPoint(lw + 0.004, H + 0.004, (b / nb) * per)
      k.hex('nut', blast ? 0.022 : 0.016, 0.008, [x + q[0], cy + q[1], -FD / 2 - 0.016], 'z')
    }
  }
  // exterior flange bolts (bolt-on frame)
  {
    const ow = o.holeW + 0.05
    const oh = H + 2 * FR + 0.05
    const per = 2 * (ow + oh)
    const nb = Math.max(12, Math.round(per / (blast ? 0.1 : 0.15)))
    for (let b = 0; b < nb; b++) {
      const q = boundaryPoint(ow, oh, (b / nb) * per)
      k.hex('nut', blast ? 0.026 : 0.02, 0.01, [q[0], cy + q[1], FD / 2 + 0.005], 'z')
    }
  }
  // interior window board and exterior drip sill
  k.box(frameMat, [o.holeW + 0.08, 0.025, 0.12], [0, o.y0 - 0.0125, -FD / 2 - 0.05])
  k.box(frameMat, [o.holeW + 0.1, 0.012, 0.1], [0, o.y0 - 0.02, FD / 2 + 0.04], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12))
  // rating plate and tag inside
  if (p.fireRating !== 'none') k.plane(ratingLabelMaterial(blast ? `${p.fireRating}` : p.fireRating), 0.09, 0.045, [o.holeW / 2 - 0.07, o.y0 + FR / 2, -FD / 2 - 0.0065], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
  tagPlate(k, p.tag, [-o.holeW / 2 + 0.07, o.y0 + FR / 2, -FD / 2 - 0.0065], '-z', 0.08)

  if (p.sunshade) {
    // louvred eyebrow on cantilever brackets, outside
    const sw = o.holeW + 0.3
    const dep = Math.min(0.6, 0.25 + H * 0.3)
    const y = o.y1 + 0.12
    for (const s of [-1, 1]) {
      const sx = s * (sw / 2 - 0.03)
      k.box(frameMat, [0.012, 0.18, dep], [sx, y - 0.04, FD / 2 + dep / 2])
      k.box(frameMat, [0.08, 0.22, 0.012], [sx, y - 0.03, FD / 2 + 0.006])
      k.rod(frameMat, [sx, y - 0.13, FD / 2 + 0.01], [sx, y - 0.02, FD / 2 + dep - 0.02], 0.012, 8)
    }
    const nl = Math.max(4, Math.round(dep / 0.08))
    for (let i = 0; i < nl; i++) k.box('aluminium', [sw - 0.06, 0.006, 0.07], [0, y + 0.02, FD / 2 + 0.05 + (i * (dep - 0.08)) / (nl - 1)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.6))
    k.box(frameMat, [sw, 0.05, 0.012], [0, y + 0.02, FD / 2 + dep])
  }
  return k.build()
}

/** Point at distance d around a rectangle (w × h) centred on the origin. */
function boundaryPoint(w: number, h: number, d: number): [number, number] {
  if (d < w) return [-w / 2 + d, -h / 2]
  d -= w
  if (d < h) return [w / 2, -h / 2 + d]
  d -= h
  if (d < w) return [w / 2 - d, h / 2]
  d -= w
  return [-w / 2, h / 2 - d]
}
