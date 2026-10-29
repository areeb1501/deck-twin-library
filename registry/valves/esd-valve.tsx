// Emergency shutdown valve (ESDV): full-bore trunnion ball valve, spring-return fail-close scotch-yoke actuator, solenoid, QEV, limit switches. API 6D, IEC 61508/61511 final element.
import { KitMesh, type GroupProps } from '../lib/mesh'
import type { MatKey } from '../lib/kit'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { clamp, useKit2 } from './_body'
import { buildEsd, esdLength } from './_esd'

export interface EsdValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** 0 closed … 1 open (quarter turn); fails closed */
  open?: number
  body?: MatKey
  actuator?: MatKey
  tag?: string
}

export const defaults = { nps: 6, rating: 600 as Rating, open: 1, body: 'valveBody' as MatKey, actuator: 'actuatorYellow' as MatKey, tag: '' }

export function ports(p: EsdValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = esdLength(nps, rating)
  return [port('A', 'End A', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'End B', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function EsdValve(props: EsdValveProps & GroupProps) {
  const { nps, rating, open, body, actuator, tag, ...group } = { ...defaults, ...props }
  const [fixed, moving] = useKit2((k, mv) => buildEsd(k, mv, { nps, rating, body, actuator, failOpen: false, tag }), [nps, rating, body, actuator, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} rotation-y={-(1 - clamp(open, 0, 1)) * (Math.PI / 2)} />
    </group>
  )
}

export default EsdValve
