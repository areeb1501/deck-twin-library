/**
 * Bridge-linked accommodation (LQ) platform next to Alpha, WORLD coordinates (sea level y = 0; LQ main deck
 * plate top y = 28 = Alpha production deck). Layout from model/site.ts (BRIDGE_S, LQ).
 *
 * - jacket (lqJacket.ts): 4 battered legs, frames, X-bracing, anodes, west boat landing + ladder
 * - cellar deck (y = 20): framing, grating, rails, two utility items; stair tower up to the main deck
 * - main deck (y = 28): framing, plate + grating apron, edge beams, kick plates + handrails all round with
 *   openings for the bridge, the cellar stair and the escape stair; east embarkation (muster) deck
 * - accommodation block, lifeboats, liferafts, signage, helideck (lqQuarters.ts)
 * - telecom / radio tower (lqTower.ts)
 * - south bridge to Alpha (lqBridge.ts)
 *
 * The LQ.equipmentZones are left EMPTY (plant data puts the control room, generator and tanks there).
 * Everything is batched per material; LQPlatform.tsx turns the batches into non-pickable meshes.
 */
import type { GeoBatch } from '../structure/batch'
import { beamTOS, boxMinMax, place, spans, unitCyl } from '../structure/batch'
import { SECTIONS, type SectionName } from '../../model/catalog'
import { gratingRect, partition, plateRect, type GratingBatches, type Rect } from '../structure/panels'
import { perimeterDistance, railPolyline, type RailBatches } from '../structure/handrail'
import { BRIDGE_S, LQ } from '../../model/site'
import { buildLqJacket, LQ_JACKET } from './lqJacket'
import { buildLqStair, LQ_STAIR, type LqStairDef } from './lqStairs'
import { buildSouthBridge } from './lqBridge'
import { buildQuarters, EMBARK } from './lqQuarters'
import { buildTelecomTower } from './lqTower'

/** Batch keys (one per material). 'discard' is never rendered (grating shadow proxies). */
export type LqKey =
  | 'jacket'
  | 'anode'
  | 'landing'
  | 'ladder'
  | 'steel'
  | 'steelDark'
  | 'grating'
  | 'gratingEdge'
  | 'discard'
  | 'plate'
  | 'yellow'
  | 'galv'
  | 'equip'
  | 'equipDark'
  | 'red'
  | 'white'
  | 'roof'
  | 'glass'
  | 'orange'
  | 'heli'
  | 'heliLights'
  | 'net'
  | 'facade'
  | 'signGreen'
  | 'signBlue'
  | 'lamp'
  | 'lampBody'
  | 'tray'
  | 'cable'
  | 'aviation'

export type LqGet = (k: LqKey) => GeoBatch

const MAIN_Y = LQ_JACKET.mainY
const CELLAR_Y = LQ_JACKET.cellarY

/** Deck-to-cellar stair tower, outboard of the north edge just west of the bridge. */
export const LQ_DECK_STAIR: LqStairDef = {
  o: [2.6, LQ.deck.z0],
  u: [-1, 0],
  v: [0, -1],
  L: 5.6,
  W: 2.7,
  landing: 1.3,
  lanes: LQ_STAIR.lanes,
  levels: [CELLAR_Y, MAIN_Y],
  flights: [4],
  openV0: () => true,
}
/** deck-edge opening (x range) for the deck stair landing */
const stairGapX: [number, number] = [LQ_DECK_STAIR.o[0] - (LQ_DECK_STAIR.landing - 0.02), LQ_DECK_STAIR.o[0] - 0.18]

const half = (s: SectionName) => SECTIONS[s].b / 2

/** Orthogonal floor framing for a rectangular LQ deck, top of steel `tos`. Members stop short of the legs. */
function lqFraming(primary: GeoBatch, secondary: GeoBatch, r: Rect, tos: number, heavy: boolean) {
  const P: SectionName = heavy ? 'HEB 600' : 'HEB 400'
  const P2: SectionName = 'HEB 400'
  const S: SectionName = 'IPE 300'
  const ei = 0.1
  const ex0 = r.x0 + ei
  const ex1 = r.x1 - ei
  const ez0 = r.z0 + ei
  const ez1 = r.z1 - ei
  const legR = LQ_JACKET.legOD / 2 + 0.05
  const legXs = [...new Set(LQ.legs.map(([x]) => x))]
  const legZs = [...new Set(LQ.legs.map(([, z]) => z))]
  // edge beams
  for (const x of [ex0, ex1]) beamTOS(secondary, x, r.z0, x, r.z1, tos, S)
  for (const z of [ez0, ez1]) beamTOS(secondary, ex0 + half(S), z, ex1 - half(S), z, tos, S)
  // primaries along X on the leg lines (split at the legs)
  for (const z of legZs) for (const [a, b] of spans(ex0 + half(S), ex1 - half(S), legXs.map((x) => ({ at: x, half: legR })))) beamTOS(primary, a, z, b, z, tos, P)
  // primaries along Z: heavy on the leg lines, lighter at the intermediate lines
  const zCuts = [...legZs.map((z) => ({ at: z, half: half(P) })), { at: ez0, half: half(S) }, { at: ez1, half: half(S) }]
  const zLines = [...legXs.map((x) => ({ x, s: P })), ...[0, 6, 12].map((x) => ({ x, s: P2 }))]
  for (const { x, s } of zLines) {
    const cuts = legXs.includes(x) ? [...zCuts, ...legZs.map((z) => ({ at: z, half: legR }))] : zCuts
    for (const [a, b] of spans(r.z0, r.z1, cuts)) beamTOS(s === P ? primary : secondary, x, a, x, b, tos, s)
  }
  // secondaries along X between the Z members, every ~2.5 m
  const xCuts = [...zLines.map(({ x, s }) => ({ x, h: half(s) })), { x: ex0, h: half(S) }, { x: ex1, h: half(S) }].map(({ x, h }) => ({ at: x, half: h }))
  for (let z = r.z0 + 2.5; z < r.z1 - 1; z += 2.5) {
    if (legZs.some((lz) => Math.abs(lz - z) < 0.8)) continue
    for (const [a, b] of spans(r.x0, r.x1, xCuts)) beamTOS(secondary, a, z, b, z, tos, S)
  }
}

function gratingStrips(gb: GratingBatches, r: Rect, y: number) {
  for (let x = r.x0; x < r.x1 - 0.01; x += 1) gratingRect(gb, x, r.z0, Math.min(x + 1, r.x1), r.z1, y)
}

/** Closed rail polygon gap helper: [s0, s1] distances along `pts` between two points on it. */
function gapBetween(pts: [number, number][], a: [number, number], b: [number, number]): [number, number] {
  const s0 = perimeterDistance(pts, a[0], a[1])
  const s1 = perimeterDistance(pts, b[0], b[1])
  return [Math.min(s0, s1), Math.max(s0, s1)]
}

function buildCellarDeck(get: LqGet, gb: GratingBatches, rb: RailBatches) {
  const D = LQ.deck
  const Y = CELLAR_Y
  lqFraming(get('steel'), get('steelDark'), D, Y - 0.03, false)
  const plated: Rect[] = [
    { x0: 9.5, x1: 15.5, z0: 73, z1: 79 }, // potable water tank
    { x0: -4, x1: 1, z0: 74, z1: 79 }, // sewage treatment unit
  ]
  const holes = LQ.legs.map(([x, z]) => ({ x0: x - 0.85, x1: x + 0.85, z0: z - 0.85, z1: z + 0.85 }))
  for (const { rect: r, solid } of partition(D, [...plated, ...holes])) {
    if (!solid) gratingStrips(gb, r, Y)
    else if (!holes.some((h) => r.x0 >= h.x0 - 0.01 && r.x1 <= h.x1 + 0.01 && r.z0 >= h.z0 - 0.01 && r.z1 <= h.z1 + 0.01)) plateRect(get('plate'), r.x0, r.z0, r.x1, r.z1, Y, 0.03)
  }
  const e = 0.05
  const pts: [number, number][] = [
    [D.x0 + e, D.z0 + e],
    [D.x1 - e, D.z0 + e],
    [D.x1 - e, D.z1 - e],
    [D.x0 + e, D.z1 - e],
  ]
  const lz = LQ_JACKET.landing.ladderZ
  const gaps = [gapBetween(pts, [stairGapX[0], D.z0 + e], [stairGapX[1], D.z0 + e]), gapBetween(pts, [D.x0 + e, lz - 0.45], [D.x0 + e, lz + 0.45])]
  railPolyline(rb, pts, Y, gaps, true)
  // potable water tank on a skid + sewage treatment unit
  place(get('equip'), unitCyl(28, false), [12.5, Y + 0.3 + 1.6, 76], [0, 0, 0], [2.4, 3.2, 2.4])
  boxMinMax(get('equipDark'), [9.8, Y, 73.3], [15.2, Y + 0.3, 78.7])
  boxMinMax(get('equip'), [-3.6, Y, 74.5], [0.6, Y + 2.2, 78.5])
  boxMinMax(get('equipDark'), [-3.7, Y + 2.2, 74.4], [0.7, Y + 2.35, 78.6])
}

function buildMainDeck(get: LqGet, gb: GratingBatches, rb: RailBatches) {
  const D = LQ.deck
  const Y = MAIN_Y
  const E = EMBARK
  lqFraming(get('steel'), get('steelDark'), D, Y - 0.03, true)
  // embarkation (muster) deck: cantilevers off the east edge beam + outer edge beam
  for (let z = E.z0 + 0.1; z <= E.z1 - 0.05; z += (E.z1 - E.z0 - 0.2) / 8) beamTOS(get('steelDark'), D.x1 - 0.1, z, E.x1 - 0.1, z, Y - 0.03, 'IPE 300')
  beamTOS(get('steelDark'), E.x1 - 0.1, E.z0, E.x1 - 0.1, E.z1, Y - 0.03, 'IPE 300')
  gratingStrips(gb, { x0: E.x0, x1: E.x1, z0: E.z0, z1: E.z1 }, Y)

  // surface: plate, grated apron where the bridge lands (in front of the quarters' north door)
  const apron: Rect = { x0: 2, x1: 9, z0: D.z0, z1: LQ.quarters.z0 }
  for (const { rect: r, solid } of partition(D, [apron])) {
    if (solid) gratingStrips(gb, r, Y)
    else plateRect(get('plate'), r.x0, r.z0, r.x1, r.z1, Y, 0.03)
  }

  // guard rail round main deck + embarkation deck
  const e = 0.05
  const pts: [number, number][] = [
    [D.x0 + e, D.z0 + e],
    [E.x1 - e, D.z0 + e],
    [E.x1 - e, E.z1 - e],
    [D.x1 - e, E.z1 - e],
    [D.x1 - e, D.z1 - e],
    [D.x0 + e, D.z1 - e],
  ]
  const zN = D.z0 + e
  const gaps: [number, number][] = [
    gapBetween(pts, [BRIDGE_S.walk.x0, zN], [BRIDGE_S.walk.x1, zN]), // bridge landing
    gapBetween(pts, [stairGapX[0], zN], [stairGapX[1], zN]), // stair to the cellar deck
    gapBetween(pts, [E.x1 - e, E.z1 - e], [D.x1 - e, E.z1 - e]), // escape-stair foot landing
    ...E.boats.map((zc) => gapBetween(pts, [E.x1 - e, zc - 0.6], [E.x1 - e, zc + 0.6])), // lifeboat boarding gates
  ]
  railPolyline(rb, pts, Y, gaps, true)
}

export function buildAccommodation(get: LqGet) {
  const gb: GratingBatches = { grating: get('grating'), shadow: get('discard'), edge: get('gratingEdge') }
  const rb: RailBatches = { rail: get('yellow'), kick: get('yellow') }
  buildLqJacket({ steel: get('jacket'), anode: get('anode'), landing: get('landing'), ladder: get('ladder') })
  buildCellarDeck(get, gb, rb)
  buildMainDeck(get, gb, rb)
  buildLqStair(LQ_DECK_STAIR, { ...rb, steel: get('steel'), grating: { grating: gb.grating, shadow: gb.shadow }, nosing: get('yellow') })
  buildQuarters(get, gb, rb)
  buildTelecomTower(get, gb, rb)
  buildSouthBridge({
    steel: get('steel'),
    steelDark: get('steelDark'),
    grating: gb,
    rail: rb,
    galv: get('galv'),
    white: get('white'),
    tray: get('tray'),
    cable: get('cable'),
    lamp: get('lamp'),
    lampBody: get('lampBody'),
  })
}
