// Shared emergency shutdown / blowdown valve: trunnion ball body with a spring-return scotch-yoke actuator and its accessories.
import type { Kit, MatKey } from '../lib/kit'
import { faceToFace, flange, type Rating } from '../lib/standards'
import { ballBody, clamp, classK, isoPadSize, plateText } from './_body'
import { isoPad, scotchYoke } from './_operators'

export interface EsdOpts {
  nps: number
  rating: Rating
  body: MatKey
  actuator: MatKey
  failOpen: boolean
  tag: string
}

export const esdLength = (nps: number, rating: Rating) => faceToFace('ball-full', nps, rating)

/** typical: scotch-yoke housing size from valve size and class (sizes torque with bore and pressure) */
export const yokeSize = (D: number, rating: Rating) => clamp((0.13 + D * 0.85) * classK(rating), 0.18, 0.9)

export function buildEsd(k: Kit, mv: Kit, o: EsdOpts) {
  const L = esdLength(o.nps, o.rating)
  const b = ballBody(k, mv, { nps: o.nps, rating: o.rating, L, reduced: false, trunnion: true, mat: o.body, text: plateText(o.nps, o.rating, 'FB') })
  const y = isoPad(k, o.body, b.yTop, isoPadSize(b.D))
  scotchYoke(k, mv, y, { s: yokeSize(b.D, o.rating), A: o.actuator, text: o.tag || (o.failOpen ? 'FAIL OPEN' : 'FAIL CLOSE'), yLow: -flange(o.nps, o.rating).od / 2 })
}
