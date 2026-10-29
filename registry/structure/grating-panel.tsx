// Pressure-locked / welded steel bar grating panel (EN ISO 14122-2): real bearing and cross bars, edge banding, kick plates and saddle clips.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { GRATING } from '../lib/standards'
import { boxMM } from './_steel'

export interface GratingPanelProps {
  /** span along X (bearing bars run along X), m */
  length?: number
  /** along Z, m */
  width?: number
  /** bearing bar depth, m (25, 30, 40 mm typical) */
  depth?: number
  /** bearing bar pitch, m */
  pitch?: number
  /** 100 mm kick plates on the long (Z) edges */
  kickPlates?: boolean
  /** saddle clips at the corners (fixing to the support flange) */
  clips?: boolean
  finish?: 'galvanised' | 'painted'
}

export const defaults = {
  length: 1.0,
  width: 1.0,
  depth: GRATING.bearingBar.h,
  pitch: GRATING.pitch,
  kickPlates: false,
  clips: true,
  finish: 'galvanised' as 'galvanised' | 'painted',
}

type P = typeof defaults

export function GratingPanel(props: GratingPanelProps & GroupProps) {
  const { length, width, depth, pitch, kickPlates, clips, finish, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { length, width, depth, pitch, kickPlates, clips, finish }), [length, width, depth, pitch, kickPlates, clips, finish])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default GratingPanel

function build(k: Kit, p: P) {
  const mat: MatKey = p.finish === 'painted' ? 'safetyYellow' : 'galvanised'
  const L = Math.max(0.2, p.length)
  const W = Math.max(0.1, p.width)
  const h = Math.max(0.02, p.depth)
  const t = GRATING.bearingBar.t + (h > 0.035 ? 0.002 : 0)
  const bt = 0.005 // banding bar
  // bearing bars along X at the pitch, top serrations suggested by a thin darker top strip
  const n = Math.max(2, Math.round((W - 2 * bt) / Math.max(0.02, p.pitch)))
  for (let i = 0; i <= n; i++) {
    const z = -W / 2 + bt + t / 2 + ((W - 2 * bt - t) * i) / n
    k.box(mat, [L - 2 * bt, h, t], [0, h / 2, z])
  }
  // twisted cross bars (as square rods) let into the bearing bar tops at 100 mm
  const m = Math.max(1, Math.round((L - 2 * bt) / GRATING.crossPitch))
  for (let j = 0; j <= m; j++) {
    const x = -L / 2 + bt + 0.003 + ((L - 2 * bt - 0.006) * j) / m
    k.box(mat, [0.006, 0.006, W - 2 * bt], [x, h - 0.003, 0])
  }
  // banding bars on all four edges
  for (const s of [-1, 1]) {
    boxMM(k, mat, [s * L / 2 - (s > 0 ? bt : 0), 0, -W / 2], [s * L / 2 + (s < 0 ? bt : 0), h, W / 2])
    if (p.kickPlates) boxMM(k, mat, [-L / 2, 0, s * W / 2 - (s > 0 ? 0.006 : 0)], [L / 2, h + 0.1, s * W / 2 + (s < 0 ? 0.006 : 0)])
    else boxMM(k, mat, [-L / 2 + bt, 0, s * W / 2 - (s > 0 ? bt : 0)], [L / 2 - bt, h, s * W / 2 + (s < 0 ? bt : 0)])
  }
  // saddle clips: top plate over two bearing bars, M8 bolt down to the support flange
  if (p.clips)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (L / 2 - 0.06)
        const z = sz * (W / 2 - 0.08)
        k.box('galvanised', [0.025, 0.004, 0.07], [x, h + 0.002, z])
        k.hex('nut', 0.015, 0.007, [x, h + 0.0075, z], 'y')
      }
}
