// Blowdown valve (BDV): full-bore trunnion ball valve, spring-return fail-open scotch-yoke actuator, solenoid, QEV, limit switches. API 6D, IEC 61508/61511 final element.
import { KitMesh, type GroupProps } from '../lib/mesh'
import type { MatKey } from '../lib/kit'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { clamp, useKit2 } from './_body'
import { buildEsd, esdLength } from './_esd'

export interface BlowdownValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** 0 closed … 1 open (quarter turn); fails open (normally closed) */
  open?: number
  body?: MatKey
  actuator?: MatKey
  tag?: string
}

export const defaults = { nps: 4, rating: 900 as Rating, open: 0, body: 'valveBody' as MatKey, actuator: 'actuatorRed' as MatKey, tag: '' }

export function ports(p: BlowdownValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = esdLength(nps, rating)
  return [port('A', 'End A', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'End B', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function BlowdownValve(props: BlowdownValveProps & GroupProps) {
  const { nps, rating, open, body, actuator, tag, ...group } = { ...defaults, ...props }
  const [fixed, moving] = useKit2((k, mv) => buildEsd(k, mv, { nps, rating, body, actuator, failOpen: true, tag }), [nps, rating, body, actuator, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} rotation-y={-(1 - clamp(open, 0, 1)) * (Math.PI / 2)} />
    </group>
  )
}

export default BlowdownValve
