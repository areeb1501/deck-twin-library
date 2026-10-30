/**
 * WHP-N wellhead platform (normally unattended) north of Alpha, WORLD coordinates (sea level y = 0;
 * wellhead-deck plate top y = 28 = Alpha production deck). Layout from model/site.ts (WHP, BRIDGE_N).
 *
 * - jacket + conductors + boat landing (whpJacket.ts)
 * - cellar (spider) deck (y = 20): framing, grating with conductor / leg cut-outs, rails, sand accumulator,
 *   closed-drain caisson; stair tower outboard of the west edge up to the wellhead deck
 * - wellhead deck (y = 28): framing, plate + grated well bay with conductor slots, edge beams, kick plates +
 *   handrails all round with openings for the bridge and the stair; laydown area markings + cargo under
 *   the crane boom; navigation lights + foghorn at the corners; liferafts + platform ID boards
 * - north bridge to Alpha (whpBridge.ts)
 * The pedestal crane is built by WHPPlatform.tsx (scaled scene/env/crane.ts).
 *
 * Plant equipment (trees, manifolds, vessels, refuge) comes from model/whpSite.ts; this file leaves those
 * areas clear. Everything is batched per material; WHPPlatform.tsx turns the batches into meshes.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, beamTOS, box, boxMinMax, place, spans, sphere, tube, unitCyl } from '../structure/batch'
import { SECTIONS, type SectionName } from '../../model/catalog'
import { gratingRect, partition, plateRect, type GratingBatches, type Rect } from '../structure/panels'
import { perimeterDistance, railPolyline, type RailBatches } from '../structure/handrail'
import { BRIDGE_N, WHP } from '../../model/site'
import { buildWhpJacket, WHP_JACKET } from './whpJacket'
import { buildLqStair, LQ_STAIR, type LqStairDef } from './lqStairs'
import { buildNorthBridge } from './whpBridge'

/** Batch keys (one per material). 'discard' is never rendered (grating shadow proxies). */
export type WhpKey =
  | 'jacket'
  | 'conductor'
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
  | 'orange'
  | 'blue'
  | 'green'
  | 'soot'
  | 'lamp'
  | 'lampBody'
  | 'tray'
  | 'cable'
  | 'navLight'
  | 'idBoard'

export type WhpGet = (k: WhpKey) => GeoBatch

const MAIN_Y = WHP_JACKET.mainY
const CELLAR_Y = WHP_JACKET.cellarY
const D = WHP.deck

/** Deck-to-cellar stair tower, outboard of the west edge (escape route from the wellhead deck). */
export const WHP_STAIR: LqStairDef = {
  o: [D.x0, -80.0],
  u: [0, -1],
  v: [-1, 0],
  L: 5.6,
  W: 2.7,
  landing: 1.3,
  lanes: LQ_STAIR.lanes,
  levels: [CELLAR_Y, MAIN_Y],
  flights: [4],
  openV0: () => true,
}
/** deck-edge opening (z range) for the stair landings */
const stairGapZ: [number, number] = [WHP_STAIR.o[1] - (WHP_STAIR.landing - 0.02), WHP_STAIR.o[1] - 0.18]

const half = (s: SectionName) => SECTIONS[s].b / 2

/** Orthogonal floor framing for the WHP deck, top of steel `tos`. Members stop short of the legs. */
function whpFraming(primary: GeoBatch, secondary: GeoBatch, r: Rect, tos: number, heavy: boolean) {
  const P: SectionName = heavy ? 'HEB 600' : 'HEB 400'
  const P2: SectionName = 'HEB 400'
  const S: SectionName = 'IPE 300'
  const ei = 0.1
  const ex0 = r.x0 + ei
  const ex1 = r.x1 - ei
  const ez0 = r.z0 + ei
  const ez1 = r.z1 - ei
  const legR = WHP_JACKET.legOD / 2 + 0.05
  const legXs = [...new Set(WHP.legs.map(([x]) => x))]
  const legZs = [...new Set(WHP.legs.map(([, z]) => z))]
  for (const x of [ex0, ex1]) beamTOS(secondary, x, r.z0, x, r.z1, tos, S)
  for (const z of [ez0, ez1]) beamTOS(secondary, ex0 + half(S), z, ex1 - half(S), z, tos, S)
  for (const z of legZs) for (const [a, b] of spans(ex0 + half(S), ex1 - half(S), legXs.map((x) => ({ at: x, half: legR })))) beamTOS(primary, a, z, b, z, tos, P)
  const zCuts = [...legZs.map((z) => ({ at: z, half: half(P) })), { at: ez0, half: half(S) }, { at: ez1, half: half(S) }]
  const zLines = [...legXs.map((x) => ({ x, s: P })), ...[9, 15].map((x) => ({ x, s: P2 }))]
  for (const { x, s } of zLines) {
    const cuts = legXs.includes(x) ? [...zCuts, ...legZs.map((z) => ({ at: z, half: legR }))] : zCuts
    for (const [a, b] of spans(r.z0, r.z1, cuts)) beamTOS(s === P ? primary : secondary, x, a, x, b, tos, s)
  }
  const xCuts = [...zLines.map(({ x, s }) => ({ x, h: half(s) })), { x: ex0, h: half(S) }, { x: ex1, h: half(S) }].map(({ x, h }) => ({ at: x, half: h }))
  for (let z = r.z0 + 2.5; z < r.z1 - 1; z += 2.5) {
    if (legZs.some((lz) => Math.abs(lz - z) < 0.8)) continue
    for (const [a, b] of spans(r.x0, r.x1, xCuts)) beamTOS(secondary, a, z, b, z, tos, S)
  }
}

function gratingStrips(gb: GratingBatches, r: Rect, y: number) {
  for (let x = r.x0; x < r.x1 - 0.01; x += 1) gratingRect(gb, x, r.z0, Math.min(x + 1, r.x1), r.z1, y)
}

function gapBetween(pts: [number, number][], a: [number, number], b: [number, number]): [number, number] {
  const s0 = perimeterDistance(pts, a[0], a[1])
  const s1 = perimeterDistance(pts, b[0], b[1])
  return [Math.min(s0, s1), Math.max(s0, s1)]
}

const e = 0.05
const RAIL_PTS: [number, number][] = [
  [D.x0 + e, D.z0 + e],
  [D.x1 - e, D.z0 + e],
  [D.x1 - e, D.z1 - e],
  [D.x0 + e, D.z1 - e],
]
const conductorHoles = (s: number): Rect[] => WHP.wells.map(([x, z]) => ({ x0: x - s, x1: x + s, z0: z - s, z1: z + s }))

function buildCellarDeck(get: WhpGet, gb: GratingBatches, rb: RailBatches) {
  const Y = CELLAR_Y
  whpFraming(get('steel'), get('steelDark'), D, Y - 0.03, false)
  const holes = [...WHP.legs.map(([x, z]) => ({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8 })), ...conductorHoles(0.55)]
  for (const { rect: r, solid } of partition(D, holes)) if (!solid) gratingStrips(gb, r, Y)
  const gaps = [
    gapBetween(RAIL_PTS, [D.x0 + e, stairGapZ[0]], [D.x0 + e, stairGapZ[1]]),
    gapBetween(RAIL_PTS, [D.x0 + e, WHP_JACKET.landing.ladderZ - 0.45], [D.x0 + e, WHP_JACKET.landing.ladderZ + 0.45]),
  ]
  railPolyline(rb, RAIL_PTS, Y, gaps, true)

  // sand accumulator + flush skid under the desander sand dump (deck-local x 16.4, z -67)
  boxMinMax(get('equipDark'), [15.3, Y, -68.4], [17.9, Y + 0.25, -66.3])
  place(get('equip'), unitCyl(24, false), [16.4, Y + 0.25 + 1.0, -67.35], [0, 0, 0], [0.45, 1.6, 0.45])
  sphere(get('equip'), [16.4, Y + 0.25 + 1.8, -67.35], 0.45, 16, 8)
  tube(get('steel'), [16.4, Y + 2.7, -67.35], [16.4, MAIN_Y - 2.2 - 0.1, -67.35], 0.045, 10, false) // sand line tail-in
  boxMinMax(get('equip'), [16.9, Y + 0.25, -68.2], [17.8, Y + 1.3, -67.6]) // flush pump
  // closed-drain caisson under the KO drum drain (deck-local x 18.28, z -85.8)
  const cdx = 18.28
  const cdz = -85.8
  tube(get('steelDark'), [cdx, -12, cdz], [cdx, Y + 1.2, cdz], 0.32, 18, false)
  place(get('steelDark'), unitCyl(18, false), [cdx, Y + 1.25, cdz], [0, 0, 0], [0.42, 0.1, 0.42])
  tube(get('steel'), [cdx, Y + 1.3, cdz], [cdx, MAIN_Y - 2.4 - 0.05, cdz], 0.04, 10, false)
  // cellar-deck lighting on the leg cans
  for (const [x, z] of WHP.legs) {
    const sx = Math.sign(WHP_JACKET.cx - x)
    bar(get('lampBody'), [x + sx * 0.75, Y + 2.6, z], [x + sx * 1.0, Y + 2.6, z], 0.04, 0.04)
    box(get('lamp'), [x + sx * 1.05, Y + 2.52, z], [0.12, 0.03, 0.44])
  }
}

function buildMainDeck(get: WhpGet, gb: GratingBatches, rb: RailBatches) {
  const Y = MAIN_Y
  whpFraming(get('steel'), get('steelDark'), D, Y - 0.03, true)
  // plate everywhere, grating over the well bay (gas dispersion), open slots at the conductors
  for (const { rect: r, solid } of partition(D, [WHP.wellBay])) {
    if (!solid) {
      plateRect(get('plate'), r.x0, r.z0, r.x1, r.z1, Y, 0.03)
      continue
    }
    for (const { rect: q, solid: hole } of partition(r, conductorHoles(0.45))) if (!hole) gratingStrips(gb, q, Y)
  }
  // well-bay kerb (yellow) and laydown markings
  const W = WHP.wellBay
  const kerb = (a: V3, b: V3) => bar(get('yellow'), a, b, 0.08, 0.1)
  kerb([W.x0, Y + 0.05, W.z0], [W.x1, Y + 0.05, W.z0])
  kerb([W.x0, Y + 0.05, W.z1], [W.x1, Y + 0.05, W.z1])
  kerb([W.x0, Y + 0.05, W.z0], [W.x0, Y + 0.05, W.z1])
  kerb([W.x1, Y + 0.05, W.z0], [W.x1, Y + 0.05, W.z1])
  const LD = WHP.laydown
  const line = (x0: number, z0: number, x1: number, z1: number) => boxMinMax(get('yellow'), [x0, Y, z0], [x1, Y + 0.004, z1])
  line(LD.x0, LD.z0, LD.x1, LD.z0 + 0.12)
  line(LD.x0, LD.z1 - 0.12, LD.x1, LD.z1)
  line(LD.x0, LD.z0, LD.x0 + 0.12, LD.z1)
  // diagonal hatch blocks at the laydown corners
  for (const z of [LD.z0 + 0.6, LD.z1 - 0.9]) for (let x = LD.x0 + 0.3; x < LD.x1 - 0.4; x += 0.7) boxMinMax(get('yellow'), [x, Y, z], [x + 0.35, Y + 0.004, z + 0.3])

  // guard rail round the deck with openings for the bridge landing and the stair
  const zS = D.z1 - e
  const gaps: [number, number][] = [
    gapBetween(RAIL_PTS, [BRIDGE_N.walk.x0, zS], [BRIDGE_N.walk.x1, zS]),
    gapBetween(RAIL_PTS, [D.x0 + e, stairGapZ[0]], [D.x0 + e, stairGapZ[1]]),
  ]
  railPolyline(rb, RAIL_PTS, Y, gaps, true)
}

/** Laydown cargo under the crane boom (walk obstacles in model/site.ts WHP_OBSTACLES). */
function buildLaydown(get: WhpGet) {
  const Y = MAIN_Y
  // 10 ft half-height container (blue) with corner castings
  {
    const [x0, x1, z0, z1] = [22.4, 25.3, -79.4, -77.1]
    boxMinMax(get('blue'), [x0, Y, z0], [x1, Y + 1.3, z1])
    for (const x of [x0, x1 - 0.18]) for (const z of [z0, z1 - 0.16]) {
      boxMinMax(get('steelDark'), [x, Y, z], [x + 0.18, Y + 0.12, z + 0.16])
      boxMinMax(get('steelDark'), [x, Y + 1.18, z], [x + 0.18, Y + 1.31, z + 0.16])
    }
    for (let x = x0 + 0.25; x < x1 - 0.1; x += 0.28) boxMinMax(get('blue'), [x, Y + 0.12, z1], [x + 0.12, Y + 1.18, z1 + 0.025]) // corrugation
    // 4-leg sling set on the roof
    for (const [x, z] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]] as [number, number][])
      tube(get('soot'), [x, Y + 1.31, z], [(x0 + x1) / 2, Y + 1.36, (z0 + z1) / 2], 0.012, 4, true)
  }
  // open cargo baskets (green) with framed sides
  for (const [x0, z0] of [[22.5, -74.7], [24.0, -74.7]] as [number, number][]) {
    const [x1, z1] = [x0 + 1.2, z0 + 2.0]
    boxMinMax(get('green'), [x0, Y, z0], [x1, Y + 0.08, z1])
    for (const x of [x0, x1 - 0.08]) for (const z of [z0, z1 - 0.08]) boxMinMax(get('green'), [x, Y, z], [x + 0.08, Y + 1.1, z + 0.08])
    for (const y of [0.55, 1.05]) {
      boxMinMax(get('green'), [x0, Y + y, z0], [x1, Y + y + 0.06, z0 + 0.04])
      boxMinMax(get('green'), [x0, Y + y, z1 - 0.04], [x1, Y + y + 0.06, z1])
      boxMinMax(get('green'), [x0, Y + y, z0], [x0 + 0.04, Y + y + 0.06, z1])
      boxMinMax(get('green'), [x1 - 0.04, Y + y, z0], [x1, Y + y + 0.06, z1])
    }
    // pipe / drum load
    for (let i = 0; i < 3; i++) tube(get('steelDark'), [x0 + 0.25 + i * 0.35, Y + 0.25, z0 + 0.15], [x0 + 0.25 + i * 0.35, Y + 0.25, z1 - 0.15], 0.14, 12, false)
  }
  // caged tote tanks (chemical / methanol IBCs)
  for (const x of [22.7, 23.85]) {
    const [z0, z1] = [-65.95, -64.75]
    boxMinMax(get('white'), [x + 0.05, Y + 0.15, z0 + 0.05], [x + 0.95, Y + 1.05, z1 - 0.05])
    boxMinMax(get('galv'), [x, Y, z0], [x + 1.0, Y + 0.15, z1])
    for (const xx of [x, x + 0.97]) for (const zz of [z0, z1 - 0.03]) boxMinMax(get('galv'), [xx, Y, zz], [xx + 0.03, Y + 1.12, zz + 0.03])
    for (const y of [0.45, 0.8, 1.1]) {
      boxMinMax(get('galv'), [x, Y + y, z0], [x + 1.0, Y + y + 0.02, z0 + 0.02])
      boxMinMax(get('galv'), [x, Y + y, z1 - 0.02], [x + 1.0, Y + y + 0.02, z1])
    }
    place(get('steelDark'), unitCyl(12, false), [x + 0.5, Y + 1.12, (z0 + z1) / 2], [0, 0, 0], [0.12, 0.06, 0.12])
  }
}

/** Navigation aids: white flashing lanterns at the four corners, foghorn on the north-west corner. */
function buildNavAids(get: WhpGet) {
  const Y = MAIN_Y
  const corners: [number, number, number, number][] = [
    [D.x0 + 0.35, D.z0 + 0.35, -1, -1],
    [D.x1 - 0.35, D.z0 + 0.35, 1, -1],
    [D.x0 + 0.35, D.z1 - 0.35, -1, 1],
    [D.x1 - 0.35, D.z1 - 0.35, 1, 1],
  ]
  for (const [x, z, sx, sz] of corners) {
    // galvanised post on a base plate, bracket out over the corner, lantern + solar panel + battery box
    boxMinMax(get('galv'), [x - 0.18, Y, z - 0.18], [x + 0.18, Y + 0.02, z + 0.18])
    tube(get('galv'), [x, Y, z], [x, Y + 2.6, z], 0.06, 10, false)
    const lx = x + sx * 0.45
    const lz = z + sz * 0.45
    bar(get('galv'), [x, Y + 2.55, z], [lx, Y + 2.55, lz], 0.06, 0.06)
    place(get('soot'), unitCyl(16, false), [lx, Y + 2.65, lz], [0, 0, 0], [0.16, 0.1, 0.16])
    place(get('navLight'), unitCyl(16, false), [lx, Y + 2.86, lz], [0, 0, 0], [0.14, 0.32, 0.14])
    place(get('soot'), unitCyl(16, false), [lx, Y + 3.06, lz], [0, 0, 0], [0.17, 0.08, 0.17])
    boxMinMax(get('yellow'), [x - 0.2, Y + 0.6, z - 0.15], [x + 0.2, Y + 1.1, z + 0.15]) // battery / control box
    // tilted solar panel facing south (sun side)
    boxMinMax(get('galv'), [x - 0.02, Y + 1.9, z - 0.02], [x + 0.02, Y + 2.2, z + 0.02])
    place(get('blue'), unitCyl(4, false), [x, Y + 2.25, z + 0.05], [-0.6, Math.PI / 4, 0], [0.45, 0.02, 0.45])
  }
  // foghorn: twin horns on a bracket at the NW corner, facing out
  {
    const [x, z] = [D.x0 + 1.4, D.z0 + 0.35]
    boxMinMax(get('galv'), [x - 0.25, Y, z - 0.25], [x + 0.25, Y + 0.02, z + 0.25])
    tube(get('galv'), [x, Y, z], [x, Y + 2.1, z], 0.07, 10, false)
    boxMinMax(get('white'), [x - 0.3, Y + 1.0, z - 0.2], [x + 0.3, Y + 1.6, z + 0.2]) // signal emitter cabinet
    for (const [dx, dz] of [[-1, 0], [0, -1]] as [number, number][]) {
      const a: V3 = [x + dx * 0.1, Y + 2.15, z + dz * 0.1]
      const b: V3 = [x + dx * 0.75, Y + 2.15, z + dz * 0.75]
      tube(get('white'), a, b, 0.09, 12, false)
      place(get('white'), unitCyl(16, true), [b[0] + dx * 0.12, b[1], b[2] + dz * 0.12], [dz !== 0 ? Math.PI / 2 : 0, 0, dx !== 0 ? Math.PI / 2 : 0], [0.24, 0.24, 0.24])
    }
  }
}

/** Liferaft canisters on cradles hung outboard of the west edge beside the temporary refuge. */
function buildLiferafts(get: WhpGet) {
  const Y = MAIN_Y
  const x = D.x0 - 0.5
  for (const z of [-61.6, -63.0, -65.6, -67.0]) {
    tube(get('white'), [x, Y + 0.55, z - 0.62], [x, Y + 0.55, z + 0.62], 0.32, 16, false)
    for (const dz of [-0.62, 0.62]) place(get('white'), unitCyl(16, false), [x, Y + 0.55, z + dz], [Math.PI / 2, 0, 0], [0.3, 0.02, 0.3])
    for (const dz of [-0.35, 0.35]) {
      tube(get('steelDark'), [x, Y + 0.55, z + dz - 0.02], [x, Y + 0.55, z + dz + 0.02], 0.335, 16, true)
      bar(get('galv'), [D.x0, Y + 0.2, z + dz], [x - 0.42, Y + 0.2, z + dz], 0.05, 0.05)
      bar(get('galv'), [D.x0, Y - 0.3, z + dz], [x - 0.42, Y + 0.2, z + dz], 0.05, 0.05)
    }
    box(get('red'), [x + 0.25, Y + 0.95, z], [0.06, 0.1, 0.12]) // hydrostatic release
  }
}

/** Platform identification boards (yellow, black "WHP-N", textured in WHPPlatform.tsx) on the rails. */
function buildIdBoards(get: WhpGet) {
  const Y = MAIN_Y
  // east + west edges (board faces ±x), north edge (faces -z); hung off the guard rail on two posts
  for (const [x, z, alongZ] of [
    [D.x1 + 0.08, -73, true],
    [D.x0 - 0.08, -76.5, true],
    [12, D.z0 - 0.08, false],
  ] as [number, number, boolean][]) {
    const size: V3 = alongZ ? [0.04, 1.0, 2.8] : [2.8, 1.0, 0.04]
    box(get('idBoard'), [x, Y + 0.65, z], size)
    for (const t of [-1.0, 1.0]) {
      const px = alongZ ? x : x + t
      const pz = alongZ ? z + t : z
      bar(get('galv'), [px, Y + 0.1, pz], [px, Y + 1.2, pz], 0.05, 0.05)
    }
  }
}

export function buildWhp(get: WhpGet) {
  const gb: GratingBatches = { grating: get('grating'), shadow: get('discard'), edge: get('gratingEdge') }
  const rb: RailBatches = { rail: get('yellow'), kick: get('yellow') }
  buildWhpJacket({ steel: get('jacket'), conductor: get('conductor'), anode: get('anode'), landing: get('landing'), ladder: get('ladder') })
  buildCellarDeck(get, gb, rb)
  buildMainDeck(get, gb, rb)
  buildLqStair(WHP_STAIR, { ...rb, steel: get('steel'), grating: { grating: gb.grating, shadow: gb.shadow }, nosing: get('yellow') })
  buildLaydown(get)
  buildNavAids(get)
  buildLiferafts(get)
  buildIdBoards(get)
  buildNorthBridge({
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
