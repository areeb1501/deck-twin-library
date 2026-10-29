// Straight stair after ISO 14122-3: UPN stringers, grating treads with chequer nosings, intermediate landings every ≤ 3 m of rise, handrails both sides.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { stairRun } from './_access'

export interface StairProps {
  /** total height from foot to upper floor, m */
  rise?: number
  /** clear width between stringers, m */
  width?: number
  /** pitch, degrees (ISO 14122-3: 30–38 preferred) */
  angle?: number
  stringer?: string
  /** landing length along X for intermediate / top landings, m */
  landingLength?: number
  /** free-standing top landing on posts beyond the last riser */
  topLanding?: boolean
  finish?: 'galvanised' | 'painted'
}

export const defaults = {
  rise: 3,
  width: 1.0,
  angle: 35,
  stringer: 'UPN 200',
  landingLength: 1.0,
  topLanding: false,
  finish: 'galvanised' as 'galvanised' | 'painted',
}

type P = typeof defaults

export function Stair(props: StairProps & GroupProps) {
  const { rise, width, angle, stringer, landingLength, topLanding, finish, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { rise, width, angle, stringer, landingLength, topLanding, finish }), [rise, width, angle, stringer, landingLength, topLanding, finish])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Stair

function build(k: Kit, p: P) {
  const mat: MatKey = p.finish === 'painted' ? 'safetyYellow' : 'galvanised'
  stairRun(k, p.rise, { width: Math.max(0.6, p.width), angle: p.angle, stringer: p.stringer, mat, landingLength: p.landingLength, topLanding: p.topLanding })
}
