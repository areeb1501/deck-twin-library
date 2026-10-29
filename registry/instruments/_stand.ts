// Stand-mounted transmitter layout shared by the gauge- and DP-transmitter: 2" stand, offset bracket, manifold, head, sunshade, sloped impulse tubing to 1/2" flanges.
import { Kit, eul, type MatKey, type V3 } from '../lib/kit'
import type { Rating } from '../lib/standards'
import { SENSOR_H, SS, cable, coplanarSensor, manifold, pipeStand, standBracket, tag, tubeClamp, tubeFitting, tubeFlange, tubing } from './_parts'

export interface StandOpts {
  valves: 2 | 5
  /** LCD centreline height above deck, m */
  height: number
  rating: Rating
  housing: MatKey
  tag: string
  sunshade: boolean
}

const RS = 0.03016 // 2" OD / 2
const PLATE_T = 0.006
const FLANGE_X = -0.24
const SPACER = 0.06 // offset so the head's rear cover clears the bracket and sunshade back plate
const SLOPE = 0.1 // impulse-line fall towards the process, 1:10 (gas service, transmitter above the taps)

/** Positions shared by geometry and ports. */
export function standLayout(o: Pick<StandOpts, 'valves' | 'height'>) {
  const mh = o.valves === 2 ? 0.075 : 0.06
  const yt = o.height - SENSOR_H
  const yb = yt - mh
  const zc = RS + PLATE_T + SPACER + 0.025
  const xs = o.valves === 2 ? [0] : [-0.027, 0.027]
  const y0 = Math.max(0.32, yb - 0.42)
  const faces: V3[] = xs.map((_, i) => [FLANGE_X, y0 - i * 0.15, zc])
  return { yt, yb, zc, xs, faces }
}

export function buildStand(k: Kit, o: StandOpts) {
  const { yt, yb, zc, faces } = standLayout(o)
  const rs = pipeStand(k, yt - 0.012)
  const zp = standBracket(k, rs, yb - 0.13, yt - 0.012, -0.05, 0.15, [yb - 0.035, yb - 0.105])
  k.box('galvanised', [0.05, 0.05, SPACER], [0, yb + 0.03, zp + SPACER / 2])
  for (const dx of [-0.016, 0.016]) k.hex('nut', 0.014, 0.006, [dx, yb + 0.03, zp + SPACER + 0.003], 'z')
  const m = manifold(k, [0, yb, zc], o.valves)
  const head = coplanarSensor(k, [0, m.top, zc], o.housing, o.valves === 5)
  m.inlets.forEach((inl, i) => {
    const t0 = tubeFitting(k, inl, [0, -1, 0])
    const face = faces[i]
    const entry = tubeFlange(k, 0.5, o.rating, face, '-x')
    const bendY = face[1] + SLOPE * (inl[0] - entry[0])
    tubing(k, [t0, [inl[0], bendY, zc], entry])
    tubeClamp(k, rs, inl[0], yb - 0.2, zc)
    if (face[1] < yb - 0.45) tubeClamp(k, rs, inl[0], (face[1] + yb - 0.2) / 2, zc)
  })
  tag(k, o.tag, [0.1, yb - 0.07, zp + 0.0009], 'z', 0.07)
  if (o.sunshade) sunshade(k, rs, yt - 0.012, o.height, zc)
  const g: V3 = [head[0] + 0.106, head[1], head[2] + 0.02]
  cable(k, [g, [0.16, g[1] - 0.06, g[2]], [0.2, o.height - 0.25, zc - 0.03], [0.2, yb - 0.2, 0], [0.06, yb - 0.32, -rs - 0.01], [0, 0.35, -rs - 0.008], [0, 0.07, -rs - 0.04], [0, 0.023, -0.12]])
}

/** Stainless sunshade: back plate bolted above the bracket, sloped roof with a drip lip, folded side cheeks. */
function sunshade(k: Kit, rs: number, y0: number, H: number, zc: number) {
  const x0 = -0.14
  const x1 = 0.18
  const yTop = H + 0.1
  const z0 = rs
  const z1 = zc + 0.15
  const t = 0.003
  k.box(SS, [x1 - x0, yTop - y0, t], [(x0 + x1) / 2, (y0 + yTop) / 2, z0 + 0.006 + t / 2])
  for (const dx of [-0.03, 0.03]) k.hex('nut', 0.014, 0.006, [dx, y0 + 0.02, z0 + 0.006 + t + 0.003], 'z')
  const fall = 0.03
  const len = Math.hypot(z1 - z0, fall)
  const a = Math.atan2(fall, z1 - z0)
  k.box(SS, [x1 - x0, t, len], [(x0 + x1) / 2, yTop - fall / 2, (z0 + z1) / 2], eul(a, 0, 0))
  k.box(SS, [x1 - x0, 0.025, t], [(x0 + x1) / 2, yTop - fall - 0.0125, z1])
  for (const x of [x0, x1]) k.box(SS, [t, 0.12, z1 - z0], [x, yTop - fall / 2 - 0.06, (z0 + z1) / 2])
}
