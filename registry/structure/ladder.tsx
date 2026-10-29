// Fixed caged ladder after ISO 14122-4: flat-bar stiles, rungs at 300 mm, safety cage, staggered flights with rest platforms over 6 m, top landing with self-closing gate.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { ladderRun, landing } from './_access'
import { bar, gate, railRun } from './_steel'

export interface LadderProps {
  /** foot to top landing, m */
  height?: number
  cage?: boolean
  /** top landing on posts (otherwise the ladder is wall-bracketed to a structure at z = -0.2) */
  landing?: boolean
  landingDepth?: number
  finish?: 'galvanised' | 'painted'
}

export const defaults = {
  height: 4.5,
  cage: true,
  landing: true,
  landingDepth: 1.2,
  finish: 'galvanised' as 'galvanised' | 'painted',
}

type P = typeof defaults

export function Ladder(props: LadderProps & GroupProps) {
  const { height, cage, landing: hasLanding, landingDepth, finish, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { height, cage, landing: hasLanding, landingDepth, finish }), [height, cage, hasLanding, landingDepth, finish])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Ladder

const SO = 0.2

function build(k: Kit, p: P) {
  const mat: MatKey = p.finish === 'painted' ? 'safetyYellow' : 'galvanised'
  const H = Math.max(1, p.height)
  const [lo, hi] = ladderRun(k, 0, 0, H, 0, { mat, cage: p.cage, standoff: SO })
  if (!p.landing) return
  const x0 = lo - 0.25
  const x1 = hi + 0.25
  const zb = -SO
  const za = zb - Math.max(0.8, p.landingDepth)
  landing(k, x0, x1, za, zb, H, { post: 'SHS 100x100x6.3', rails: [true, true, true, false], mat })
  // front rail with the ladder opening and a self-closing gate
  const g = 0.35
  railRun(k, [x0 + 0.03, H, zb - 0.03], [-g, H, zb - 0.03], { startPost: false })
  railRun(k, [g, H, zb - 0.03], [x1 - 0.03, H, zb - 0.03], { endPost: false })
  gate(k, [-g, H, zb - 0.03], [g, H, zb - 0.03])
  // horizontal struts between the front posts carry the ladder and rest-platform brackets
  for (let y = 0.6; y < H - 0.3; y += 2) bar(k, [x0 + 0.1, y, zb - 0.05], [x1 - 0.1, y, zb - 0.05], 'L60x60x6', mat, [0, 0, 1])
  // step-off plate between the stiles and the landing edge
  k.box(mat, [0.44, 0.01, SO + 0.03], [0, H - 0.005, -SO / 2 + 0.01])
}
