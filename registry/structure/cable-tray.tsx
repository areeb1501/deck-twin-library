// Ladder-type cable tray run (IEC 61537) on floor-standing strut supports: multi-tier trays at 300 mm, cantilever arms, laid cables, splice plates, earth bonding and optional covers.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { anchorBolt, boxMM } from './_steel'
import { ladderTray } from './_tray'

export interface CableTrayProps {
  /** along X, m */
  length?: number
  /** tray width, m */
  width?: number
  tiers?: number
  /** tier spacing, m */
  tierSpacing?: number
  /** rung level of the lowest tier above y = 0, m */
  elevation?: number
  /** support spacing, m */
  supportSpacing?: number
  /** cable fill, 0…1 */
  fill?: number
  /** cover on the top tier */
  cover?: boolean
  material?: 'galvanised' | 'stainless'
}

export const defaults = {
  length: 6,
  width: 0.6,
  tiers: 3,
  tierSpacing: 0.3,
  elevation: 0.6,
  supportSpacing: 2,
  fill: 0.6,
  cover: false,
  material: 'galvanised' as 'galvanised' | 'stainless',
}

type P = typeof defaults

export function CableTray(props: CableTrayProps & GroupProps) {
  const { length, width, tiers, tierSpacing, elevation, supportSpacing, fill, cover, material, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { length, width, tiers, tierSpacing, elevation, supportSpacing, fill, cover, material }), [length, width, tiers, tierSpacing, elevation, supportSpacing, fill, cover, material])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default CableTray

const STRUT = 0.041 // 41 × 41 slotted strut channel

function build(k: Kit, p: P) {
  const mat: MatKey = p.material === 'stainless' ? 'stainless' : 'galvanised'
  const L = Math.max(1, p.length)
  const W = Math.max(0.1, p.width)
  const n = Math.max(1, Math.round(p.tiers))
  const sp = Math.max(0.2, p.tierSpacing)
  const ys = Array.from({ length: n }, (_, i) => p.elevation + i * sp)
  const top = ys[n - 1] + 0.1
  // supports: a single back-to-back strut post at -Z with cantilever arms under each tier, braced to the floor
  const zp = -W / 2 - 0.06
  const m = Math.max(1, Math.ceil(L / Math.max(0.5, p.supportSpacing)))
  for (let i = 0; i <= m; i++) {
    const x = -L / 2 + 0.25 + ((L - 0.5) * i) / m
    k.box(mat, [0.16, 0.01, 0.16], [x, 0.005, zp])
    for (const a of [-1, 1]) anchorBolt(k, x + a * 0.055, 0.01, zp, 0.012)
    boxMM(k, mat, [x - STRUT, 0.01, zp - STRUT / 2], [x + STRUT, top + 0.15, zp + STRUT / 2])
    k.box('nut', [0.002, top + 0.12, 0.012], [x, (top + 0.15) / 2, zp + STRUT / 2 + 0.001]) // slot
    k.box(mat, [0.09, 0.006, 0.09], [x, top + 0.153, zp])
    for (const y of ys) {
      // cantilever arm with a gusseted root bracket
      boxMM(k, mat, [x - STRUT / 2, y - STRUT - 0.004, zp + STRUT / 2], [x + STRUT / 2, y - 0.004, zp + W + 0.12])
      k.box(mat, [0.008, 0.12, 0.1], [x, y - 0.06, zp + STRUT / 2 + 0.05])
      k.hex('nut', 0.018, 0.009, [x + STRUT / 2 + 0.005, y - 0.03, zp + STRUT / 2 + 0.03], 'x')
    }
    // floor brace on the open side
    if (n > 1 || p.elevation > 0.8) {
      const dx = Math.min(0.5, (L - 0.5) / m / 2)
      const s = i === m ? -1 : 1
      k.rod(mat, [x + s * dx, 0.02, zp], [x + s * STRUT, Math.min(ys[0] - 0.1, 0.9), zp], 0.012, 6)
    }
  }
  for (const y of ys) ladderTray(k, -L / 2, L / 2, zp + STRUT / 2 + 0.06 + W / 2, y, W, { fill: p.fill, mat: p.material === 'stainless' ? 'stainless' : 'cableTray' })
  const zc = zp + STRUT / 2 + 0.06 + W / 2
  // earth bonding jumpers across the splices on each tier
  for (const y of ys)
    for (let x = -L / 2 + 3; x < L / 2 - 0.2; x += 3) k.tube('copper', [[x - 0.12, y + 0.05, zc - W / 2 - 0.006], [x, y + 0.02, zc - W / 2 - 0.02], [x + 0.12, y + 0.05, zc - W / 2 - 0.006]], 0.005, 6, 0.03)
  if (p.cover) {
    const yc = ys[n - 1] + 0.1 + 0.004
    k.box(mat, [L, 0.0015, W + 0.03], [0, yc, zc])
    for (const s of [-1, 1]) k.box(mat, [L, 0.025, 0.0015], [0, yc - 0.012, zc + s * (W / 2 + 0.015)])
  }
}
