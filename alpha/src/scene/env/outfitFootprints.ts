/**
 * Plan footprints (deck-local x, z = world x, z) of the floor-standing environment outfit on the Alpha and
 * WHP-N cellar decks (cellarOutfit.ts, whpCellarOutfit.ts), the RP / WI cellar J-tubes and the drill floor
 * (drillingRig.ts buildRigOutfit). Plain data, no geometry imports: the path
 * planner (walkPath.ts) routes tours and workers round them. They are NOT yet manual-walk blockers — that
 * needs them in model/site.ts ALPHA_WALK 'cellar' / 'drillfloor' .obstacles (integrator).
 */
import type { PlanRect } from '../../model/types'
import { DECK } from '../structure/deckConst'

/** Alpha cellar deck (EL +20) */
export const CELLAR_OUTFIT_FOOTPRINTS: PlanRect[] = [
  { x0: -29.6, x1: -25.2, z0: -19.6, z1: -16.4 }, // chemical tote bund
  { x0: -29.6, x1: -27.4, z0: -16.2, z1: -14.8 }, // chemical-injection pump skid
  { x0: -29.7, x1: -28.4, z0: 12.1, z1: 13.5 }, // PW disposal caisson head
  { x0: -16.4, x1: -14.8, z0: 12.6, z1: 14.2 }, // open-drain sump caisson head + pump
  { x0: -11.7, x1: -10.7, z0: 15.3, z1: 16.3 }, // closed-drain caisson head
  { x0: 19.3, x1: 20.3, z0: -7.7, z1: -6.7 }, // seawater dump caisson head
  { x0: -7.2, x1: -5.2, z0: -19.7, z1: -18.2 }, // well-bay deluge valve set
  { x0: -25.7, x1: -24.9, z0: 1.6, z1: 6.1 }, // J-tube cable tails
  { x0: 26.1, x1: 27.9, z0: -7.4, z1: -5.6 }, // oil riser hang-off + barrier
  { x0: 26.1, x1: 27.9, z0: 2.3, z1: 4.1 }, // spare J-tube hang-off + barrier
  { x0: 10.2, x1: 17.8, z0: 15.6, z1: 19.6 }, // laydown / toolbox area
  { x0: 8.5, x1: 9.4, z0: 18.5, z1: 19.6 }, // safety shower / eyewash
  { x0: -21.5, x1: -12.5, z0: -5.0, z1: 3.0 }, // well-services laydown (wireline unit, lubricator rack, power pack)
  // hose reel + wheeled extinguisher inboard of each jacket leg
  ...DECK.legs.map(([lx, lz]) => {
    const x = lx - Math.sign(lx) * 1.15
    const z = lz - Math.sign(lz) * 0.2
    return { x0: x - 0.45, x1: x + 0.45, z0: Math.min(z, z - Math.sign(lz) * 0.85) - 0.2, z1: Math.max(z, z - Math.sign(lz) * 0.85) + 0.2 }
  }),
]

/** WHP-N cellar (spider) deck */
export const WHP_CELLAR_OUTFIT_FOOTPRINTS: PlanRect[] = [
  { x0: -1.95, x1: -1.55, z0: -82.8, z1: -82.3 }, // escape sign post + extinguisher at the stair opening
  { x0: -1.95, x1: -1.55, z0: -73.05, z1: -72.55 }, // sign post + extinguisher at the boat-landing ladder
  { x0: 23.6, x1: 24.6, z0: -77.0, z1: -76.0 }, // J-tube seal housing + cable tail
]


/** cable J-tube seal housings on the RP and WI cellar decks (satJacket.ts) */
export const SAT_CELLAR_FOOTPRINTS: PlanRect[] = [
  { x0: -90.5, x1: -89.6, z0: -26.55, z1: -25.65 }, // RP fibre-optic J-tube
  { x0: 23.65, x1: 24.55, z0: -139.7, z1: -138.8 }, // WI power-cable J-tube
]

/** drill floor (EL +46): derrick-ladder foot + cage, two air tuggers, degasser vent, standpipe manifold valves */
export const RIG_FLOOR_FOOTPRINTS: PlanRect[] = [
  { x0: -0.85, x1: -0.25, z0: -18.85, z1: -17.95 }, // derrick ladder foot (NW leg, north face)
  { x0: -3.5, x1: -2.3, z0: -19.1, z1: -18.3 }, // air tugger NW
  { x0: -3.5, x1: -2.3, z0: -7.35, z1: -6.55 }, // air tugger SW
  { x0: -2.05, x1: -1.75, z0: -18.55, z1: -18.25 }, // mud-gas separator vent through the floor
  { x0: -2.5, x1: -1.7, z0: -9.05, z1: -8.4 }, // standpipe manifold valves + handwheels
]
