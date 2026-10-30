/**
 * Alpha field layout beyond the production deck: the bridge-linked accommodation platform (LQ),
 * the platform drilling rig over the well bay, and the walkable levels. DECK-LOCAL coordinates
 * (world = deck-local + [0, 28, 0]; sea level is world y = 0, seabed world y = -62).
 *
 * The 3D environment (scene/env) and the plant data (model/plant.ts) both build from these
 * numbers, so the bridge, platforms, equipment and piping line up.
 */
import type { PlanRect, WalkLevel } from './types'

/** Alpha production deck (deck-local y = 0) */
export const ALPHA_DECK: PlanRect = { x0: -30, x1: 30, z0: -20, z1: 20 }
/** cellar deck plate top, deck-local (world +20) */
export const CELLAR_FLOOR = -8
/** weather deck plate top, deck-local (world +38) */
export const WEATHER_FLOOR = 10

/** Alpha's six well slots (conductor centres) — same as scene/env/jacket.ts JACKET.conductors */
export const WELL_SLOTS: [number, number][] = [
  [-3, -13],
  [0, -13],
  [3, -13],
  [-3, -10.5],
  [0, -10.5],
  [3, -10.5],
]
/** the slot under the drilling rig (being drilled — BOP instead of a christmas tree) */
export const RIG_SLOT: [number, number] = [3, -13]

/** South bridge: Alpha production deck → LQ platform main deck, same elevation (deck-local y = 0). */
export const BRIDGE_S = {
  /** walkway (grated) */
  walk: { x0: 4.5, x1: 7.5, z0: 20, z1: 60 } as PlanRect,
  /** utility pipe lane on the bridge's east side: pipes run along Z at these x, deck-local y */
  pipeLane: { x: [7.9, 8.35, 8.8], y: 0.9 },
  /** cable tray on the west side */
  trayX: 4.0,
}

/** Accommodation (LQ) platform, main deck at deck-local y = 0. */
export const LQ = {
  deck: { x0: -9, x1: 21, z0: 60, z1: 86 } as PlanRect,
  legs: [
    [-6, 63],
    [18, 63],
    [-6, 83],
    [18, 83],
  ] as [number, number][],
  /** accommodation block standing on the main deck (environment geometry, not walkable) */
  quarters: { x0: 3, x1: 20, z0: 70, z1: 85, storeys: 5, storey: 3.2 },
  /** helideck on the quarters roof */
  helideck: { x: 11.5, z: 77.5, r: 10 },
  /** telecom / radio tower (lattice mast) base */
  tower: { x: -7, z: 84, height: 36 },
  /** areas kept clear for plant equipment (data, pickable) */
  equipmentZones: [
    { x0: -8, x1: 2, z0: 61.5, z1: 82.4 }, // control room, emergency generator (tower base beyond)
    { x0: 9, x1: 20.5, z0: 61.5, z1: 69 }, // utility tanks + pumps
  ] as PlanRect[],
}

/**
 * North bridge: Alpha production deck (north edge z = -20) → WHP-N wellhead deck (south edge z = -60),
 * flush with both decks (deck-local y = 0). Pipe-lane shelf on the WEST side, cable tray on the east.
 */
export const BRIDGE_N = {
  /** walkway (grated) */
  walk: { x0: 10.5, x1: 13.5, z0: -60, z1: -20 } as PlanRect,
  /**
   * utility pipe lane on the west shelf: pipes run along Z at these x (deck-local y), inboard → outboard:
   * 2" instrument air, 10" production export, 6" water injection, 6" firewater, 6" vent to flare
   */
  pipeLane: { x: [10.05, 9.6, 9.1, 8.65, 8.2], y: 0.9 },
  /** lines leave the lane through the shelf this far onto the bridge from each deck edge */
  dropInset: 0.4,
  /** cable tray on the east side */
  trayX: 14.0,
}

/**
 * Wellhead platform WHP-N (normally unattended), 40 m north of Alpha. Main / wellhead deck at
 * deck-local y = 0 (world +28), cellar (spider) deck at -8 (world +20). Plant equipment comes from
 * model/whpSite.ts; jacket, decks, crane, laydown and the bridge are environment (scene/env/whp*).
 */
export const WHP = {
  deck: { x0: -2, x1: 26, z0: -88, z1: -60 } as PlanRect,
  legs: [
    [1, -63],
    [23, -63],
    [1, -85],
    [23, -85],
  ] as [number, number][],
  /** spider / cellar deck plate top (deck-local) */
  cellarY: -8,
  /** 2 x 3 well bay: conductor centres (wellhead base flange at y = 0) */
  wells: [
    [2.5, -71],
    [6, -71],
    [2.5, -74],
    [6, -74],
    [2.5, -77],
    [6, -77],
  ] as [number, number][],
  /** grated well-bay area of the main deck */
  wellBay: { x0: 0.6, x1: 8.6, z0: -79, z1: -69 } as PlanRect,
  /** pedestal crane on the NE leg, boom parked south over the laydown area (scaled offshore crane) */
  crane: { x: 23.5, z: -85.6, heading: Math.PI / 2, scale: 0.65 },
  /** laydown area under the crane boom (east edge) */
  laydown: { x0: 21.8, x1: 25.8, z0: -80.5, z1: -63 } as PlanRect,
}

/** WHP-N walk obstacles drawn by the environment (crane pedestal, boom rest, laydown cargo) */
export const WHP_OBSTACLES: PlanRect[] = [
  { x0: 22.3, x1: 25.2, z0: -86.8, z1: -84.4 }, // crane pedestal (scaled scene/env/crane.ts)
  { x0: 22.3, x1: 24.7, z0: -69.6, z1: -66.9 }, // boom rest
  { x0: 23.0, x1: 24.0, z0: -63.1, z1: -61.7 }, // hook pad
  { x0: 22.2, x1: 25.4, z0: -79.6, z1: -76.9 }, // half-height container
  { x0: 22.4, x1: 25.2, z0: -74.8, z1: -72.6 }, // cargo baskets
  { x0: 22.6, x1: 24.9, z0: -66.1, z1: -64.6 }, // tote tanks
  { x0: 20.6, x1: 21.4, z0: -79.6, z1: -66.4 }, // MPFM return line stanchions along the laydown edge
]

/** Walkthrough levels for Alpha */
export const ALPHA_WALK: WalkLevel[] = [
  {
    id: 'production',
    label: 'Production deck · EL +28',
    y: 0,
    // Alpha deck, the south bridge, the LQ main deck and its lifeboat embarkation deck (east, cantilevered),
    // the north bridge and the WHP-N wellhead deck
    areas: [ALPHA_DECK, BRIDGE_S.walk, LQ.deck, { x0: 21, x1: 23.7, z0: 60, z1: 80 }, BRIDGE_N.walk, WHP.deck],
    obstacles: [
      ...WHP_OBSTACLES,
      { x0: LQ.quarters.x0, x1: LQ.quarters.x1, z0: LQ.quarters.z0, z1: LQ.quarters.z1 },
      { x0: LQ.tower.x - 1.4, x1: LQ.tower.x + 1.4, z0: LQ.tower.z - 1.4, z1: LQ.tower.z + 1.4 },
    ],
  },
  {
    id: 'weather',
    label: 'Weather deck · EL +38 (power, rig base)',
    y: WEATHER_FLOOR,
    areas: [ALPHA_DECK],
    // environment-drawn blocks on the weather deck (scene/env/topsides.ts, drillingRig.ts)
    obstacles: [
      { x0: -29, x1: -15, z0: -12, z1: 6 }, // living quarters
      { x0: -3.5, x1: 9.5, z0: -19.5, z1: -6.5 }, // drilling substructure
      { x0: 12.2, x1: 22.3, z0: -19.6, z1: -6.5 }, // pipe deck
      { x0: -12.5, x1: -4.5, z0: -19.5, z1: -6.5 }, // mud module
      { x0: -12.2, x1: -5.1, z0: -5.1, z1: -1.7 }, // bulk silos
      { x0: -13, x1: -3, z0: 8, z1: 17 }, // switchgear / LER building
      { x0: 2.5, x1: 21, z0: 15, z1: 18.8 }, // laydown: containers + baskets
      { x0: 22.4, x1: 25.6, z0: -18.6, z1: -15.4 }, // crane pedestal
      { x0: 28, x1: 30, z0: 6.5, z1: 9.5 }, // flare boom foot
    ],
  },
  {
    id: 'drillfloor',
    label: 'Drill floor · EL +46 (derrick)',
    y: WEATHER_FLOOR + 8,
    // drill floor + the driller's cabin (doghouse) on its south side
    areas: [
      { x0: RIG_SLOT[0] - 6.5, x1: RIG_SLOT[0] + 6.5, z0: RIG_SLOT[1] - 6.5, z1: RIG_SLOT[1] + 6.5 },
      { x0: -1.5, x1: 2.5, z0: RIG_SLOT[1] + 6.5, z1: RIG_SLOT[1] + 9.5 },
    ],
    obstacles: [
      { x0: RIG_SLOT[0] - 0.9, x1: RIG_SLOT[0] + 0.9, z0: RIG_SLOT[1] - 0.9, z1: RIG_SLOT[1] + 0.9 }, // rotary table / well centre
      { x0: RIG_SLOT[0] - 6.4, x1: -1.75, z0: RIG_SLOT[1] - 3, z1: RIG_SLOT[1] + 3 }, // drawworks
      { x0: RIG_SLOT[0] + 1.3, x1: RIG_SLOT[0] + 4.1, z0: RIG_SLOT[1] - 2.5, z1: RIG_SLOT[1] - 0.6 }, // setback (north)
      { x0: RIG_SLOT[0] + 1.3, x1: RIG_SLOT[0] + 4.1, z0: RIG_SLOT[1] + 0.6, z1: RIG_SLOT[1] + 2.5 }, // setback (south)
      { x0: RIG_SLOT[0] - 2.6, x1: RIG_SLOT[0] - 1.6, z0: RIG_SLOT[1] + 1.85, z1: RIG_SLOT[1] + 2.75 }, // iron roughneck
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x0: RIG_SLOT[0] + sx * 4.5 - 0.5, x1: RIG_SLOT[0] + sx * 4.5 + 0.5, z0: RIG_SLOT[1] + sz * 4.5 - 0.5, z1: RIG_SLOT[1] + sz * 4.5 + 0.5 })), // derrick legs
    ],
  },
  {
    id: 'cellar',
    label: 'Cellar deck · EL +20 (wellheads)',
    y: CELLAR_FLOOR,
    areas: [ALPHA_DECK],
    // drilling equipment on the cellar deck (scene/env/cellarDeck.ts): BOP stack, choke manifold, accumulator
    obstacles: [
      { x0: RIG_SLOT[0] - 1.3, x1: RIG_SLOT[0] + 1.3, z0: RIG_SLOT[1] - 1.3, z1: RIG_SLOT[1] + 1.3 },
      { x0: 6.4, x1: 8.8, z0: -15.2, z1: -11 },
      { x0: 6.2, x1: 9.6, z0: -19, z1: -16.4 },
    ],
  },
]
