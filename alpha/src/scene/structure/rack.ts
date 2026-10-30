/**
 * Central pipe rack (deck-local). Pipes from the lead's piping sit on the tier beams:
 * bottom of pipe (BOP) = RACK.tier1 or RACK.tier2 (top of steel of the HEB 200 bent beams).
 */
import type { GeoBatch, V3 } from './batch'
import { angle, beamTOS, ibeam, box } from './batch'
import { SECTIONS } from '../../model/catalog'

export const RACK = {
  /** top of steel, tier 1 (m above deck plate) */
  tier1: 4.6,
  /** top of steel, tier 2 */
  tier2: 6.4,
  zMin: -2,
  zMax: 2,
  xMin: -26,
  xMax: 26,
  /** bent (portal frame) x-stations */
  bents: [-24, -18, -12, -6, 0, 6, 12, 18, 24],
  /** bents whose posts continue to the upper-deck underside */
  tallBents: [-24, -12, 0, 12, 24],
  /** underside of upper deck steel */
  topY: 9.4,
  postSection: 'HEB 300' as const,
  beamSection: 'HEB 200' as const,
  /** clear usable width between post flanges on each tier */
  clearZ: [-1.85, 1.85] as [number, number],
}

export function buildRack(steel: GeoBatch, steelDark: GeoBatch) {
  const post = SECTIONS[RACK.postSection]
  const beamD = SECTIONS[RACK.beamSection].d
  const zp = [RACK.zMin, RACK.zMax]
  const tiers = [RACK.tier1, RACK.tier2]

  for (const x of RACK.bents) {
    const tall = RACK.tallBents.includes(x)
    const top = tall ? RACK.topY : RACK.tier2
    for (const z of zp) {
      // posts: web along Z (strong axis in the bent plane), flanges face +-Z
      ibeam(steel, [x, -0.03, z], [x, top, z], [0, 0, 1], RACK.postSection)
      if (!tall) box(steel, [x, top + 0.006, z], [post.b + 0.02, 0.012, post.d + 0.02]) // cap plate
    }
    for (const tos of tiers) {
      // bent beam spans between post flanges
      beamTOS(steel, x, RACK.zMin + post.d / 2, x, RACK.zMax - post.d / 2, tos, RACK.beamSection)
      // knee braces in the bent plane (L 100x100x10)
      for (const z of zp) {
        const sgn = z < 0 ? 1 : -1
        const ya = tos - beamD - 1.0
        const a: V3 = [x - 0.05, ya, z + sgn * (post.d / 2)]
        const b: V3 = [x - 0.05, tos - beamD, z + sgn * (post.d / 2 + 0.9)]
        angle(steelDark, a, b, [1, 0, 0], 0.1, 0.01)
      }
    }
    // tall bents: top tie beam under the upper deck
    if (tall) beamTOS(steel, x, RACK.zMin + post.d / 2, x, RACK.zMax - post.d / 2, RACK.topY, RACK.beamSection)
  }

  // longitudinal stringers (IPE 200) at each tier edge, framing between posts
  const bents = RACK.bents
  for (const tos of tiers) {
    for (const z of zp) {
      for (let i = 0; i < bents.length - 1; i++) {
        beamTOS(steel, bents[i] + post.b / 2, z, bents[i + 1] - post.b / 2, z, tos, 'IPE 200')
      }
      // cantilevered stringer ends to xMin / xMax
      beamTOS(steel, RACK.xMin, z, bents[0] - post.b / 2, z, tos, 'IPE 200')
      beamTOS(steel, bents[bents.length - 1] + post.b / 2, z, RACK.xMax, z, tos, 'IPE 200')
    }
  }
  // longitudinal knee braces from posts to tier-1 stringers (every bent, both directions)
  for (const x of bents) {
    for (const z of zp) {
      for (const dir of [-1, 1]) {
        if ((x === bents[0] && dir < 0) || (x === bents[bents.length - 1] && dir > 0)) continue
        const zz = z + (z < 0 ? -0.06 : 0.06)
        angle(steelDark, [x + dir * (post.b / 2), RACK.tier1 - 0.2 - 1.1, zz], [x + dir * (post.b / 2 + 1.1), RACK.tier1 - 0.2, zz], [0, 0, 1], 0.09, 0.009)
      }
    }
  }
  // vertical X bracing in the two end bays and the central bays (plan stability)
  const braceBays: [number, number][] = [
    [-24, -18],
    [-6, 0],
    [18, 24],
  ]
  for (const [xa, xb] of braceBays) {
    for (const z of zp) {
      const zz = z + (z < 0 ? -0.17 : 0.17)
      angle(steelDark, [xa + 0.15, 0.2, zz], [xb - 0.15, RACK.tier1 - beamD - 0.05, zz], [0, 0, 1], 0.1, 0.01)
      angle(steelDark, [xb - 0.15, 0.2, zz], [xa + 0.15, RACK.tier1 - beamD - 0.05, zz], [0, 0, 1], 0.1, 0.01)
    }
  }
}
