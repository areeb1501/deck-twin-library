// Flanged ball valve: floating two-piece or trunnion three-piece side-entry body, full or reduced bore, lever or worm gear. API 6D / ISO 17292, ASME B16.10.
import { KitMesh, type GroupProps } from '../lib/mesh'
import type { MatKey } from '../lib/kit'
import { port, type Port } from '../lib/ports'
import { faceToFace, handwheelDia, type Rating } from '../lib/standards'
import { ballBody, clamp, classK, isoPadSize, plateText, useKit2 } from './_body'
import { isoPad, wormGear, wrenchLever } from './_operators'

export interface BallValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  bore?: 'full' | 'reduced'
  /** auto: trunnion from NPS 6 (NPS 4 at Class 600+) */
  mounting?: 'auto' | 'floating' | 'trunnion'
  /** auto: lever on floating valves, gear on trunnion valves */
  operator?: 'auto' | 'lever' | 'gear'
  /** 0 closed … 1 open (quarter turn) */
  open?: number
  body?: MatKey
  tag?: string
}

export const defaults = {
  nps: 4,
  rating: 300 as Rating,
  bore: 'full' as 'full' | 'reduced',
  mounting: 'auto' as 'auto' | 'floating' | 'trunnion',
  operator: 'auto' as 'auto' | 'lever' | 'gear',
  open: 1,
  body: 'valveBody' as MatKey,
  tag: '',
}

const family = (bore: string) => (bore === 'reduced' ? 'ball-reduced' : 'ball-full')

export function ports(p: BallValveProps = {}): Port[] {
  const { nps, rating, bore } = { ...defaults, ...p }
  const L = faceToFace(family(bore), nps, rating)
  return [port('A', 'End A', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'End B', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function BallValve(props: BallValveProps & GroupProps) {
  const { nps, rating, bore, mounting, operator, open, body, tag, ...group } = { ...defaults, ...props }
  const trunnion = mounting === 'trunnion' || (mounting === 'auto' && (nps >= 6 || (nps >= 4 && rating >= 600)))
  const gear = operator === 'gear' || (operator === 'auto' && trunnion)
  const [fixed, moving] = useKit2(
    (k, mv) => {
      const L = faceToFace(family(bore), nps, rating)
      const b = ballBody(k, mv, { nps, rating, L, reduced: bore === 'reduced', trunnion, mat: body, text: tag || plateText(nps, rating, bore === 'reduced' ? 'RB' : 'FB') })
      const y = isoPad(k, body, b.yTop, isoPadSize(b.D))
      if (gear) {
        const g = clamp((0.08 + b.D * 0.7) * classK(rating), 0.14, 0.7)
        wormGear(k, mv, y, g, nps > 4 ? handwheelDia(family(bore), nps, rating) : 0.3, body, b.Rb + 0.12)
      } else wrenchLever(k, mv, y, b.stemR, handwheelDia(family(bore), nps, rating))
    },
    [nps, rating, bore, trunnion, gear, body, tag],
  )
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} rotation-y={-(1 - clamp(open, 0, 1)) * (Math.PI / 2)} />
    </group>
  )
}

export default BallValve
