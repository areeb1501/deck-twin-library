/** Production-deck structural grid (deck-local metres; y = 0 top of deck plate, EL +28.0). */
export interface SolidArea {
  x0: number
  z0: number
  x1: number
  z1: number
}

export const DECK = {
  x0: -30,
  x1: 30,
  z0: -20,
  z1: 20,
  /** top of steel of the deck framing (grating / plate sit on it) */
  girderTop: -0.03,
  /** main jacket legs, vertical through the topsides */
  legs: [
    [-24, -17],
    [24, -17],
    [-24, 17],
    [24, 17],
  ] as [number, number][],
  legOD: 1.8,
  legWall: 0.05,
  /** legs are drawn by DeckStructure between these deck-local heights; Surroundings draws the rest */
  legSpan: [-0.8, 10.0] as [number, number],
  /** HEB 400 deck-to-deck columns */
  columns: [
    [-8, -17],
    [8, -17],
    [-8, 17],
    [8, 17],
  ] as [number, number][],
  /** underside of upper (weather) deck steel; upper deck plate top */
  upperUnderside: 9.4,
  upperTop: 10.0,
  /** cellar deck plate top (deck-local) */
  cellarTop: -8,
  /** escape aisles (plated) */
  aisles: [
    { z0: 2.6, z1: 4.4 },
    { z0: -4.4, z1: -2.6 },
  ],
  /** plated perimeter walkway width */
  perimeterWalk: 1.2,
  /** primary girder lines */
  primaryX: [-17, -2, 2, 17], // HEB 600 running along X at these z
  primaryZ: [-24, -8, 8, 24], // HEB 600 running along Z at these x
  secondaryX: [-14.5, -12, -9.5, -7, -4.5, 0, 4.5, 7, 9.5, 12, 14.5], // IPE 300 along X at these z
  edgeInset: 0.1, // edge-beam centreline inset from the plate edge
}

/** Default drip-pan / plated equipment footprints (lead overrides with real footprints). */
export const DEFAULT_SOLID_AREAS: SolidArea[] = [
  { x0: -26, z0: 6, x1: -12, z1: 15 }, // separators
  { x0: -8, z0: 7, x1: 4, z1: 15 }, // export pumps
  { x0: 9, z0: 6, x1: 24, z1: 15.5 }, // compression
  { x0: -26, z0: -15, x1: -13, z1: -7 }, // produced water
  { x0: -4, z0: -15, x1: 6, z1: -7 }, // manifold / pig traps
  { x0: 11, z0: -15, x1: 24, z1: -7 }, // LER / chemical skid
]
