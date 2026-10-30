/**
 * Platform pedestal cranes of the Alpha field: where they stand, how big they are, where they park and
 * what they lift. One table (CRANES) feeds the 3D cranes (scene/env/Cranes.tsx, geometry from
 * scene/env/crane.ts), the crane-operations simulation (sim/cranes.ts) and the pick / inspection
 * proxies added to the plant by `extendCranes` (tags CR-A1 … CR-W1).
 *
 * Coordinates are DECK-LOCAL (world = deck-local + [0, 28, 0]). Headings are plan angles in radians
 * from +X (east) towards +Z (south), like scene/env/crane.ts.
 *
 *   CR-A1  Alpha weather deck, NE jacket leg (24, -17); boom parked south along the east side
 *   CR-A2  Alpha weather deck, SW jacket leg (-24, 17); boom parked east along the south edge, clear of
 *          the quarters (z ≤ 6), the helideck (centre (-31, -3), r 11.5, ~10 m away) and the rig slot
 *   CR-N1  WHP-N, NE leg (WHP.crane), boom over the east laydown
 *   CR-R1  RP, on the leg at RP.crane, boom over the laydown (parked towards it)
 *   CR-W1  WI, on the leg at WI.crane, boom over the laydown
 */
import type { PlatformId } from '../sim/types'
import type { Equipment, Instrument, PipeLine, Valve } from './types'
import { instantiate } from '../library/components'
import { RP, WEATHER_FLOOR, WHP, WI } from './site'
import { extendVents } from './vents'

/** Parametric crane size: boom length, pedestal height (deck → slew bearing) and structural scale
 *  (pedestal / bearing radii and boom section; handrails, ladders, cab, hook block stay full size). */
export interface CraneSpec {
  /** boom length, foot pin → head, m */
  boomL: number
  /** slew-bearing seat above the deck, m */
  bearing: number
  /** structural section scale (1 = the 50 t Alpha crane) */
  scale: number
}

export type CargoKind = 'container' | 'basket' | 'personnel' | 'pipe'

/** a landing / pick spot (deck-local; y = the surface the load sits on) */
export interface LiftSpot {
  x: number
  z: number
  y: number
  /** human name for the event log / panel */
  name: string
}

export interface CraneJob {
  kind: 'boat' | 'deck'
  cargo: CargoKind
  /** hook load, t (load + rigging) */
  load: number
  from: LiftSpot
  to: LiftSpot
  /** personnel transfer (stricter wind limit) */
  personnel?: boolean
}

export interface CraneSite {
  tag: string
  name: string
  platform: PlatformId
  x: number
  z: number
  /** deck-local y of the deck the pedestal stands on */
  deckY: number
  spec: CraneSpec
  /** parked boom heading (onto its rest) */
  park: number
  /** boom-rest station: plan distance from the slew axis */
  restF: number
  /** parked hook lowered onto a hook pad on deck (else stowed under the boom head) */
  hookPad: boolean
  /** allowed slew sector [min, max] (rad, no wrap): keeps the boom off the quarters, helideck, derrick */
  slew: [number, number]
  /** safe working load at minimum radius, t */
  swl: number
  jobs: CraneJob[]
}

/** supply-boat deck (world y ≈ 4) */
export const BOAT_Y = -24

const boat = (cx: number, cz: number, heading: number, r: number, name = 'supply boat'): LiftSpot => ({ x: +(cx + r * Math.cos(heading)).toFixed(2), z: +(cz + r * Math.sin(heading)).toFixed(2), y: BOAT_Y, name })

const WD = WEATHER_FLOOR
const BIG: CraneSpec = { boomL: 32, bearing: 10.6, scale: 1 }
/** a scaled crane for the normally-unattended platforms (site.ts gives the scale; at 0.65 the boom rest
 *  and hook pad land on site.ts craneObstacles / WHP_OBSTACLES) */
const scaled = (s: number): CraneSpec => ({ boomL: +(30.3 * s).toFixed(1), bearing: +(10.6 * s).toFixed(2), scale: s })
const restOf = (s: number) => +(26 * s).toFixed(1)

const A1B = boat(24, -17, -0.2, 24)
const A2B = boat(-24, 17, 2.3, 26)
const N1B = boat(WHP.crane.x, WHP.crane.z, 0.15, 18)
const R1B = boat(RP.crane.x, RP.crane.z, 3.3, 17)
const W1B = boat(WI.crane.x, WI.crane.z, 0.1, 17)
const A1_LAND: LiftSpot = { x: 27, z: -5.5, y: WD, name: 'weather-deck landing area (east)' }
const A1_PIPE: LiftSpot = { x: 13.5, z: -9.5, y: WD + 1.2, name: 'pipe deck' }
const A2_LAY: LiftSpot = { x: 6.5, z: 19.0, y: WD, name: 'south laydown' }
const N1_LAY: LiftSpot = { x: 23.8, z: -71.0, y: 0, name: 'WHP-N laydown' }
const midX = (r: { x0: number; x1: number }) => (r.x0 + r.x1) / 2
const R1_LAY: LiftSpot = { x: midX(RP.laydown), z: RP.laydown.z1 - 4, y: 0, name: 'RP laydown' }
const W1_LAY: LiftSpot = { x: midX(WI.laydown), z: WI.laydown.z1 - 3.5, y: 0, name: 'WI laydown' }

export const CRANES: CraneSite[] = [
  {
    tag: 'CR-A1',
    name: 'Pedestal Crane A1 (NE, diesel-hydraulic lattice boom)',
    platform: 'Alpha',
    x: 24,
    z: -17,
    deckY: WD,
    spec: BIG,
    park: Math.PI / 2,
    restF: 26,
    hookPad: true,
    slew: [-1.75, 2.75],
    swl: 50,
    jobs: [
      { kind: 'boat', cargo: 'container', load: 8.5, from: A1B, to: A1_LAND },
      { kind: 'boat', cargo: 'pipe', load: 12, from: A1B, to: A1_PIPE },
      { kind: 'boat', cargo: 'personnel', load: 0.9, from: A1B, to: A1_LAND, personnel: true },
      { kind: 'deck', cargo: 'basket', load: 3.2, from: A1_LAND, to: A1B },
    ],
  },
  {
    tag: 'CR-A2',
    name: 'Pedestal Crane A2 (SW, diesel-hydraulic lattice boom)',
    platform: 'Alpha',
    x: -24,
    z: 17,
    deckY: WD,
    spec: BIG,
    park: 0,
    restF: 24,
    hookPad: false,
    slew: [-0.35, 2.7],
    swl: 50,
    jobs: [
      { kind: 'boat', cargo: 'container', load: 7, from: A2B, to: A2_LAY },
      { kind: 'deck', cargo: 'basket', load: 2.8, from: A2_LAY, to: A2B },
    ],
  },
  {
    tag: 'CR-N1',
    name: 'Pedestal Crane N1 (WHP-N, diesel-hydraulic)',
    platform: 'WHP-N',
    x: WHP.crane.x,
    z: WHP.crane.z,
    deckY: 0,
    spec: scaled(WHP.crane.scale),
    park: WHP.crane.heading,
    restF: restOf(WHP.crane.scale),
    hookPad: true,
    slew: [-1.6, 1.75],
    swl: 12,
    jobs: [
      { kind: 'boat', cargo: 'basket', load: 3.5, from: N1B, to: N1_LAY },
      { kind: 'deck', cargo: 'basket', load: 2.2, from: N1_LAY, to: N1B },
    ],
  },
  {
    tag: 'CR-R1',
    name: 'Pedestal Crane R1 (RP, diesel-hydraulic)',
    platform: 'RP',
    x: RP.crane.x,
    z: RP.crane.z,
    deckY: 0,
    spec: scaled(RP.crane.scale),
    park: RP.crane.heading,
    restF: restOf(RP.crane.scale),
    hookPad: true,
    slew: [1.2, 3.55],
    swl: 10,
    jobs: [
      { kind: 'boat', cargo: 'basket', load: 3, from: R1B, to: R1_LAY },
      { kind: 'deck', cargo: 'container', load: 4, from: R1_LAY, to: R1B },
    ],
  },
  {
    tag: 'CR-W1',
    name: 'Pedestal Crane W1 (WI, diesel-hydraulic)',
    platform: 'WI',
    x: WI.crane.x,
    z: WI.crane.z,
    deckY: 0,
    spec: scaled(WI.crane.scale),
    park: WI.crane.heading,
    restF: restOf(WI.crane.scale),
    hookPad: true,
    slew: [-1.2, 1.9],
    swl: 10,
    jobs: [
      { kind: 'boat', cargo: 'container', load: 5, from: W1B, to: W1_LAY },
      { kind: 'deck', cargo: 'basket', load: 2.5, from: W1_LAY, to: W1B },
    ],
  },
]
export const CRANE_BY_TAG = new Map(CRANES.map((c) => [c.tag, c]))

// ---------------------------------------------------------------- kinematics (shared by the 3D crane and the sim)

const DEG = Math.PI / 180
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Main dimensions of a crane of this spec, in its slewing frame: origin on the slew axis at the deck,
 *  +x along the boom (f), +y up, z = −s (s = to the boom's left in plan). */
export function craneDims(spec: CraneSpec) {
  const k = spec.scale
  const yB = spec.bearing
  const yD = yB + 0.95 // slewing-deck top
  const foot = 2.9 // boom foot pin ahead of the slew axis
  const yFoot = yD + 0.8
  const L = spec.boomL
  const gantryH = 8.6 * clamp(L / 32, 0.78, 1)
  const fA = -0.5
  const yA = yD + gantryH
  return {
    k,
    yB,
    yD,
    foot,
    yFoot,
    L,
    fA,
    yA,
    /** boom-frame (t along the boom, n normal) points */
    tip: { t: L + 0.75, n: -0.05 }, // main hoist sheaves
    tipTop: { t: L - 0.05, n: 0.45 }, // pendant lugs
    aux: { t: L + 2.7, n: 0.78 }, // whip sheave
    footGuide: { t: 0.8, n: 1.1 }, // hoist rope guide sheaves on the boom foot
    /** slewing-frame (x, y) points */
    uHub: [fA + 0.35, yA - 0.6] as [number, number], // upper luffing block
    lead: [fA + 0.3, yA + 0.55] as [number, number], // hoist lead sheaves (rope leaves towards the boom)
    /** boom angle parked on its rest (the boom droops 7 deg) and the working range */
    luffRest: -7 * DEG,
    luffMin: 8 * DEG,
    luffMax: 76 * DEG,
    /** boom raised at least this far while slewing (clears the deck plant) */
    luffTravel: 48 * DEG,
    /** body section (width, depth) */
    bodyW: 1.9 * k,
    bodyD: 1.9 * k,
    /** main hook: block centre → hook bowl, and sling length to the load's top */
    hookDrop: 1.85,
    sling: 2.2,
  }
}
export type CraneDims = ReturnType<typeof craneDims>

/** boom-frame (t, n) → slewing-frame (x, y) at luff angle `luff` (rad, + = tip up) */
export function boomPoint(d: CraneDims, luff: number, t: number, n: number): [number, number] {
  const c = Math.cos(luff)
  const s = Math.sin(luff)
  return [d.foot + t * c - n * s, d.yFoot + t * s + n * c]
}
/** as boomPoint, written into `out` (no allocation: for per-frame use) */
export function boomPointTo(d: CraneDims, luff: number, t: number, n: number, out: [number, number]) {
  const c = Math.cos(luff)
  const s = Math.sin(luff)
  out[0] = d.foot + t * c - n * s
  out[1] = d.yFoot + t * s + n * c
  return out
}
/** hook radius (plan distance slew axis → main hoist sheaves) at a luff angle */
export const radiusAt = (d: CraneDims, luff: number) => boomPoint(d, luff, d.tip.t, d.tip.n)[0]
/** luff angle for a hook radius (clamped to the working range) */
export function luffFor(d: CraneDims, r: number) {
  const c = clamp((r - d.foot) / d.tip.t, Math.cos(d.luffMax), Math.cos(d.luffMin))
  return Math.acos(c)
}
/** height of the main sheaves above the crane's deck at a luff angle */
export const tipHeight = (d: CraneDims, luff: number) => boomPoint(d, luff, d.tip.t, d.tip.n)[1]
/** load size (f along the boom, h, s across) and its colour key */
export const CARGO: Record<CargoKind, { size: [number, number, number]; label: string }> = {
  container: { size: [3.0, 1.4, 2.4], label: 'half-height container' },
  basket: { size: [2.6, 1.0, 1.6], label: 'cargo basket' },
  personnel: { size: [2.0, 1.9, 2.0], label: 'personnel transfer carrier' },
  pipe: { size: [9.0, 0.7, 1.2], label: 'drill-pipe bundle' },
}
/** hook-block centre height above the surface a load sits on (block → hook → slings → load) */
export const hookAbove = (d: CraneDims, cargo: CargoKind | null) => d.hookDrop + (cargo ? d.sling + CARGO[cargo].size[1] : 0.4)

/** parked pose: boom on its rest, hook on its pad (or stowed under the head) */
export function parkedPose(c: CraneSite) {
  const d = craneDims(c.spec)
  const luff = d.luffRest
  const hook = c.hookPad ? 3.7 : tipHeight(d, luff) - 3.6
  return { slew: c.park, luff, hook }
}

// ---------------------------------------------------------------- plant items (pick / inspection proxies)

export interface CraneArrays {
  equipment: Equipment[]
  lines: PipeLine[]
  valves: Valve[]
  instruments: Instrument[]
}

/**
 * Add the cranes (CR-A1, CR-A2, CR-N1, CR-R1, CR-W1) and the cold vent stacks (VS-A300, VS-R300, see
 * model/vents.ts) to a plant as inspection proxies. Call once from model/plant.ts after the other
 * extend* calls:  extendCranes({ equipment, lines, valves, instruments })
 */
export function extendCranes(A: CraneArrays) {
  const have = new Set(A.equipment.map((e) => e.tag))
  for (const c of CRANES) {
    if (have.has(c.tag)) continue
    const d = craneDims(c.spec)
    const w = +(2 * 1.95 * d.k + 1.4).toFixed(2)
    A.equipment.push(
      instantiate('proxy', {
        tag: c.tag,
        name: c.name,
        system: 'utilities',
        at: [c.x, c.z],
        y: c.deckY,
        params: { role: 'crane', sizeX: w, sizeY: +(d.yD + 4.2).toFixed(2), sizeZ: w },
        design: {
          capacity: `SWL ${c.swl} t at minimum radius, boom ${c.spec.boomL} m`,
          notes: `Diesel-hydraulic pedestal crane (lattice boom, main + whip hoist). Operating limits: wind 20 m/s cargo / 13 m/s personnel, Hs 3.0 m for supply-boat lifts. Stops on gas alarm / GA; diesel engine shut down on confirmed gas (ignition source).`,
          vendor: 'Offshore pedestal crane, EN 13852-1 / API 2C',
        },
      }),
    )
  }
  extendVents(A)
}
