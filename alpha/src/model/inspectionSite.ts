/**
 * The Alpha field's inspection bay and drone hover stops (plan 12). World coordinates: sea level is y = 0.
 *
 * Scene objects, not plant equipment: like the CCTV housings the bay stays out of the plant data, so the plant
 * counts, clash checks and line rules don't apply to it. Alpha-only, so the data lives here and not in the renderer.
 *
 *   Bay       south of the LQ quarters, open to the sky and outside the 10 m helideck circle.
 *   Cruise    62 m clears everything in the field except the derrick (NO_FLY) and the LQ telecom mast, which no
 *             route from the bay passes.
 *   Stops     measured against the real scene (tools/inspect.mjs re-checks them): each is a column clear from the
 *             hover point up to the cruise height, so the drone only ever climbs, crosses at cruise and descends.
 *             Alpha's production and cellar decks are not here: they are under a deck, and the drone flies in the open.
 */
import type { PlanRect } from './types'

/** drone pad and robot charging pad, plan position */
export const DRONE_PAD: [number, number] = [-2.2, 84.6]
export const ROBOT_PAD: [number, number] = [0.6, 84.7]
/** top of the drone pad, world (the LQ main deck is at 28) */
export const PAD_TOP = 28.06
/** transit height, world */
export const CRUISE_Y = 62
/** flown around at cruise: the derrick */
export const NO_FLY: PlanRect[] = [{ x0: -7, x1: 15, z0: -25, z1: -7 }]

/** equipment tag → hover point [x, z, y], world */
export const DRONE_STOPS: Record<string, [number, number, number]> = {
  // Alpha
  'B-9510': [31.2, 16.4, 44], 'CR-A1': [24, -12.8, 52], 'CR-A2': [-24, 21.3, 52], 'GT-8100A': [6.6, 8.7, 48.9],
  'GT-8100B': [6.6, 15.7, 48.9], 'TR-8200A': [19.5, 0.8, 43.3], 'TR-8200B': [19.5, -1.8, 43.3],
  'VS-A300': [28.4, 6, 52], 'X-8300': [19.5, 9.9, 42.6],
  // LQ
  'B-9300': [-3, 71.1, 33.2], 'B-9310': [-3, 83.1, 34], 'T-9320': [13.7, 65.5, 34.5],
  'V-9330': [16.5, 60.7, 31.6],
  // WHP-N
  'B-N295': [3.5, -60.4, 32.6], 'C-N260': [-0.7, -82, 32.3], 'CR-N1': [23.5, -82, 42],
  'M-N200': [17.3, -76.7, 31.5], 'M-N210': [17.3, -76.3, 31.5], 'V-N230': [17.8, -64.9, 34.9],
  'V-N240': [21, -77.6, 34.9], 'V-N281': [15.4, -61.5, 34.5], 'V-N290': [17, -88, 32.9],
  'X-N270': [10.6, -82, 32.5], 'X-N282': [18.6, -60.2, 32.1], 'XT-N101': [2.7, -68.6, 33.9],
  'XT-N102': [6.2, -68.6, 33.9], 'XT-N103': [2.7, -71.6, 33.9], 'XT-N104': [6.2, -71.6, 33.9],
  'XT-N105': [2.7, -74.6, 33.9], 'XT-N106': [6.2, -74.6, 33.9],
  // RP
  'B-R395': [-89, -28.3, 32.6], 'CR-R1': [-91.9, -25.6, 42], 'L-R110': [-83, -2, 32.3],
  'L-R210': [-85.5, -12, 34.7], 'V-R281': [-88.5, -16.6, 34.5], 'VS-R300': [-68.8, -1.2, 42],
  'X-R150': [-78.5, -16.6, 32.6], 'X-R155': [-70.1, -20.6, 32.9], 'X-R160': [-91.5, -15.9, 32.3],
  'X-R250': [-78.5, -20.4, 32.7],
  // WI
  'B-W395': [3.8, -128, 33], 'C-W340': [1, -137.8, 35.4], 'CR-W1': [23.5, -150, 42],
  'P-W310A': [18, -135, 35.2], 'P-W310B': [18, -144.5, 31.5], 'V-W320': [7, -137.8, 39.7],
  'V-W381': [8.6, -135.2, 34.5], 'X-W330': [5.5, -146.4, 32.6],
}

/** seeded corrosion, for a first scan to find something: tag → [wall %, rate mm/yr]. An assumption, not survey data. */
export const CORROSION_SEEDS: Record<string, [number, number]> = {
  'V-2400': [58.5, 0.42],
  'P-1500A': [66, 0.24],
  'L-R110': [68, 0.27],
  'P-4300A': [74, 0.2],
  'X-8300': [77, 0.16],
  'TR-8200B': [84, 0.12],
  '8"-PO-1302-C3A-H': [72, 0.31],
}
