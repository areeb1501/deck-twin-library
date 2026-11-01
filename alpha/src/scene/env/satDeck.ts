/**
 * Decks of the two bridge-linked satellite platforms, WORLD coordinates (main-deck plate top y = 28 =
 * Alpha production deck, cellar deck y = 20). Layout from model/site.ts (RP, WI, BRIDGE_W, BRIDGE_NN).
 *
 *  - RP riser & export platform (west of Alpha) and WI water-injection platform (north of WHP-N), each:
 *    jacket + boat landing (satJacket.ts); cellar deck framing, grating with leg / riser / caisson cut-outs,
 *    rails; main deck framing, plate, kick plates + handrails all round with openings for the bridge and
 *    the stair; a deck ↔ cellar stair tower outboard of the deck edge; laydown markings + cargo under the
 *    crane boom; navigation lanterns + foghorn; liferafts; platform ID boards
 *  - the west bridge (Alpha ↔ RP) and the north-north bridge (WHP-N ↔ WI) (satBridge.ts)
 * The pedestal cranes and RP's cold vent stack are drawn by another layer (from RP.crane, WI.crane and
 * RP.vent); this file keeps their footprints clear. Plant equipment comes from model/rpSite.ts and
 * model/wiSite.ts. Everything is batched per material; SatellitePlatforms.tsx turns batches into meshes.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, beamTOS, box, boxMinMax, place, spans, tube, unitCyl } from '../structure/batch'
import { SECTIONS, type SectionName } from '../../model/catalog'
import { gratingRect, partition, plateRect, type GratingBatches, type Rect } from '../structure/panels'
import { perimeterDistance, railPolyline, type RailBatches } from '../structure/handrail'
import { BRIDGE_NN, BRIDGE_W, RP, WI } from '../../model/site'
import type { PlanRect } from '../../model/types'
import { buildRpJacket, buildWiJacket, RP_JACKET, RP_RISERS, WI_CAISSONS, WI_JACKET, type SatJacketDef } from './satJacket'
import { buildLqStair, LQ_STAIR, type LqStairDef } from './lqStairs'
import { buildSatBridge, NN_BRIDGE, WEST_BRIDGE } from './satBridge'

/** Batch keys (one per material). 'discard' is never rendered (grating shadow proxies). */
export type SatKey =
  | 'jacket'
  | 'riser'
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
  | 'blue'
  | 'green'
  | 'soot'
  | 'lamp'
  | 'lampBody'
  | 'tray'
  | 'cable'
  | 'navLight'
  | 'idRP'
  | 'idWI'

export type SatGet = (k: SatKey) => GeoBatch

const MAIN_Y = 28
const CELLAR_Y = 20

/** RP deck ↔ cellar stair, outboard of the NORTH edge between the refuge and the meters (escape route). */
export const RP_STAIR: LqStairDef = {
  o: [-83.2, RP.deck.z0],
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
/** WI deck ↔ cellar stair, outboard of the WEST edge by the lift pumps (as WHP-N's). */
export const WI_STAIR: LqStairDef = {
  o: [WI.deck.x0, -146.0],
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

const half = (s: SectionName) => SECTIONS[s].b / 2
const e = 0.05

/** Orthogonal floor framing, top of steel `tos`; members stop short of the legs. `mid` = extra girder lines (x). */
function framing(primary: GeoBatch, secondary: GeoBatch, r: Rect, legs: [number, number][], mid: number[], tos: number, heavy: boolean) {
  const P: SectionName = heavy ? 'HEB 600' : 'HEB 400'
  const P2: SectionName = 'HEB 400'
  const S: SectionName = 'IPE 300'
  const ei = 0.1
  const ex0 = r.x0 + ei
  const ex1 = r.x1 - ei
  const ez0 = r.z0 + ei
  const ez1 = r.z1 - ei
  const legR = 1.4 / 2 + 0.05
  const legXs = [...new Set(legs.map(([x]) => x))]
  const legZs = [...new Set(legs.map(([, z]) => z))]
  for (const x of [ex0, ex1]) beamTOS(secondary, x, r.z0, x, r.z1, tos, S)
  for (const z of [ez0, ez1]) beamTOS(secondary, ex0 + half(S), z, ex1 - half(S), z, tos, S)
  for (const z of legZs) for (const [a, b] of spans(ex0 + half(S), ex1 - half(S), legXs.map((x) => ({ at: x, half: legR })))) beamTOS(primary, a, z, b, z, tos, P)
  const zCuts = [...legZs.map((z) => ({ at: z, half: half(P) })), { at: ez0, half: half(S) }, { at: ez1, half: half(S) }]
  const zLines = [...legXs.map((x) => ({ x, s: P })), ...mid.map((x) => ({ x, s: P2 }))]
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

const railPts = (D: PlanRect): [number, number][] => [
  [D.x0 + e, D.z0 + e],
  [D.x1 - e, D.z0 + e],
  [D.x1 - e, D.z1 - e],
  [D.x0 + e, D.z1 - e],
]
function gapBetween(pts: [number, number][], a: [number, number], b: [number, number]): [number, number] {
  const s0 = perimeterDistance(pts, a[0], a[1])
  const s1 = perimeterDistance(pts, b[0], b[1])
  return [Math.min(s0, s1), Math.max(s0, s1)]
}
/** deck-edge opening for a stair's landings (end A, u 0 … landing) on its attach line */
function stairGap(pts: [number, number][], t: LqStairDef): [number, number] {
  const a: [number, number] = [t.o[0] + t.u[0] * 0.18 + t.v[0] * -e * -1, t.o[1] + t.u[1] * 0.18]
  const b: [number, number] = [t.o[0] + t.u[0] * (t.landing - 0.02), t.o[1] + t.u[1] * (t.landing - 0.02)]
  // snap onto the rail line (the attach line is the deck edge; the rail is inset by e)
  const snap = (p: [number, number]): [number, number] => [t.v[0] !== 0 ? t.o[0] - t.v[0] * e : p[0], t.v[1] !== 0 ? t.o[1] - t.v[1] * e : p[1]]
  return gapBetween(pts, snap(a), snap(b))
}

interface SatDef {
  D: PlanRect
  J: SatJacketDef
  legs: [number, number][]
  mid: number[]
  stair: LqStairDef
  /** cellar-deck cut-outs (risers, caissons) */
  cellarHoles: Rect[]
  /** bridge landing on the main-deck edge: two points on the rail line */
  bridgeGap: [[number, number], [number, number]]
  /** nav-lantern corner points (overrides) */
  lanterns: [number, number, number, number][]
  foghorn: [number, number, [number, number][]]
  liferafts: { x: number; z: number[]; dir: number }
  idBoards: [number, number, boolean][]
  idKey: SatKey
}

function buildCellarDeck(get: SatGet, gb: GratingBatches, rb: RailBatches, S: SatDef) {
  const Y = CELLAR_Y
  const D = S.D
  framing(get('steel'), get('steelDark'), D, S.legs, S.mid, Y - 0.03, false)
  const holes = [...S.legs.map(([x, z]) => ({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8 })), ...S.cellarHoles]
  for (const { rect: r, solid } of partition(D, holes)) if (!solid) gratingStrips(gb, r, Y)
  const pts = railPts(D)
  const L = S.J.landing
  const gaps = [stairGap(pts, S.stair), gapBetween(pts, [D.x0 + e, L.ladderZ - 0.45], [D.x0 + e, L.ladderZ + 0.45])]
  railPolyline(rb, pts, Y, gaps, true)
  // cellar lighting on the leg cans
  for (const [x, z] of S.legs) {
    const sx = Math.sign(S.J.cx - x)
    bar(get('lampBody'), [x + sx * 0.75, Y + 2.6, z], [x + sx * 1.0, Y + 2.6, z], 0.04, 0.04)
    box(get('lamp'), [x + sx * 1.05, Y + 2.52, z], [0.12, 0.03, 0.44])
  }
}

function buildMainDeck(get: SatGet, rb: RailBatches, S: SatDef) {
  const Y = MAIN_Y
  const D = S.D
  framing(get('steel'), get('steelDark'), D, S.legs, S.mid, Y - 0.03, true)
  plateRect(get('plate'), D.x0, D.z0, D.x1, D.z1, Y, 0.03)
  const pts = railPts(D)
  railPolyline(rb, pts, Y, [gapBetween(pts, ...S.bridgeGap), stairGap(pts, S.stair)], true)
}

/** laydown area markings: yellow border on three sides + hatch blocks at both ends */
function laydownMarks(get: SatGet, LD: PlanRect, openSide: 'x0' | 'x1') {
  const Y = MAIN_Y
  const line = (x0: number, z0: number, x1: number, z1: number) => boxMinMax(get('yellow'), [x0, Y, z0], [x1, Y + 0.004, z1])
  line(LD.x0, LD.z0, LD.x1, LD.z0 + 0.12)
  line(LD.x0, LD.z1 - 0.12, LD.x1, LD.z1)
  if (openSide === 'x1') line(LD.x0, LD.z0, LD.x0 + 0.12, LD.z1)
  else line(LD.x1 - 0.12, LD.z0, LD.x1, LD.z1)
  for (const z of [LD.z0 + 0.6, LD.z1 - 0.9]) for (let x = LD.x0 + 0.3; x < LD.x1 - 0.4; x += 0.7) boxMinMax(get('yellow'), [x, Y, z], [x + 0.35, Y + 0.004, z + 0.3])
}

/** laydown cargo: a 10 ft half-height container, two cargo baskets, two caged tote tanks (walk obstacles in model/site.ts) */
function cargo(get: SatGet, x0: number, zCont: number, zBask: number, zTote: number) {
  const Y = MAIN_Y
  {
    const [cx0, cx1, z0, z1] = [x0, x0 + 2.9, zCont, zCont + 2.3]
    boxMinMax(get('blue'), [cx0, Y, z0], [cx1, Y + 1.3, z1])
    for (const x of [cx0, cx1 - 0.18]) for (const z of [z0, z1 - 0.16]) {
      boxMinMax(get('steelDark'), [x, Y, z], [x + 0.18, Y + 0.12, z + 0.16])
      boxMinMax(get('steelDark'), [x, Y + 1.18, z], [x + 0.18, Y + 1.31, z + 0.16])
    }
    for (let x = cx0 + 0.25; x < cx1 - 0.1; x += 0.28) boxMinMax(get('blue'), [x, Y + 0.12, z1], [x + 0.12, Y + 1.18, z1 + 0.025])
    for (const [x, z] of [[cx0 + 0.1, z0 + 0.1], [cx1 - 0.1, z0 + 0.1], [cx0 + 0.1, z1 - 0.1], [cx1 - 0.1, z1 - 0.1]] as [number, number][])
      tube(get('soot'), [x, Y + 1.31, z], [(cx0 + cx1) / 2, Y + 1.36, (z0 + z1) / 2], 0.012, 4, true)
  }
  for (const bx of [x0 + 0.1, x0 + 1.6]) {
    const [bx1, z0, z1] = [bx + 1.2, zBask, zBask + 2.0]
    boxMinMax(get('green'), [bx, Y, z0], [bx1, Y + 0.08, z1])
    for (const x of [bx, bx1 - 0.08]) for (const z of [z0, z1 - 0.08]) boxMinMax(get('green'), [x, Y, z], [x + 0.08, Y + 1.1, z + 0.08])
    for (const y of [0.55, 1.05]) {
      boxMinMax(get('green'), [bx, Y + y, z0], [bx1, Y + y + 0.06, z0 + 0.04])
      boxMinMax(get('green'), [bx, Y + y, z1 - 0.04], [bx1, Y + y + 0.06, z1])
      boxMinMax(get('green'), [bx, Y + y, z0], [bx + 0.04, Y + y + 0.06, z1])
      boxMinMax(get('green'), [bx1 - 0.04, Y + y, z0], [bx1, Y + y + 0.06, z1])
    }
    for (let i = 0; i < 3; i++) tube(get('steelDark'), [bx + 0.25 + i * 0.35, Y + 0.25, z0 + 0.15], [bx + 0.25 + i * 0.35, Y + 0.25, z1 - 0.15], 0.14, 12, false)
  }
  for (const x of [x0 + 0.3, x0 + 1.45]) {
    const [z0, z1] = [zTote, zTote + 1.2]
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

/** white flashing lanterns (post, bracket, solar panel, battery box) + a twin-horn foghorn */
function navAids(get: SatGet, S: SatDef) {
  const Y = MAIN_Y
  for (const [x, z, sx, sz] of S.lanterns) {
    boxMinMax(get('galv'), [x - 0.18, Y, z - 0.18], [x + 0.18, Y + 0.02, z + 0.18])
    tube(get('galv'), [x, Y, z], [x, Y + 2.6, z], 0.06, 10, false)
    const lx = x + sx * 0.45
    const lz = z + sz * 0.45
    bar(get('galv'), [x, Y + 2.58, z], [lx, Y + 2.58, lz], 0.08, 0.06)
    place(get('soot'), unitCyl(16, false), [lx, Y + 2.65, lz], [0, 0, 0], [0.16, 0.1, 0.16])
    place(get('navLight'), unitCyl(16, false), [lx, Y + 2.86, lz], [0, 0, 0], [0.14, 0.32, 0.14])
    place(get('soot'), unitCyl(16, false), [lx, Y + 3.06, lz], [0, 0, 0], [0.17, 0.08, 0.17])
    boxMinMax(get('yellow'), [x - 0.2, Y + 0.6, z - 0.15], [x + 0.2, Y + 1.1, z + 0.15])
    boxMinMax(get('galv'), [x - 0.02, Y + 1.9, z - 0.02], [x + 0.02, Y + 2.2, z + 0.02])
    place(get('blue'), unitCyl(4, false), [x, Y + 2.25, z + 0.05], [-0.6, Math.PI / 4, 0], [0.45, 0.02, 0.45])
  }
  const [x, z, dirs] = S.foghorn
  boxMinMax(get('galv'), [x - 0.25, Y, z - 0.25], [x + 0.25, Y + 0.02, z + 0.25])
  tube(get('galv'), [x, Y, z], [x, Y + 2.1, z], 0.07, 10, false)
  boxMinMax(get('white'), [x - 0.3, Y + 1.0, z - 0.2], [x + 0.3, Y + 1.6, z + 0.2])
  for (const [dx, dz] of dirs) {
    const a: V3 = [x, Y + 2.15, z]
    const b: V3 = [x + dx * 0.75, Y + 2.15, z + dz * 0.75]
    tube(get('white'), a, b, 0.09, 12, false)
    place(get('white'), unitCyl(16, true), [b[0] + dx * 0.12, b[1], b[2] + dz * 0.12], [dz !== 0 ? Math.PI / 2 : 0, 0, dx !== 0 ? Math.PI / 2 : 0], [0.24, 0.24, 0.24])
  }
}

/** liferaft canisters on cradles hung outboard of a deck edge (x = edge, dir = outward sign along x) */
function liferafts(get: SatGet, S: SatDef) {
  const Y = MAIN_Y
  const { x: edge, z: zs, dir } = S.liferafts
  const x = edge + dir * 0.5
  for (const z of zs) {
    tube(get('white'), [x, Y + 0.55, z - 0.62], [x, Y + 0.55, z + 0.62], 0.32, 16, false)
    for (const dz of [-0.62, 0.62]) place(get('white'), unitCyl(16, false), [x, Y + 0.55, z + dz], [Math.PI / 2, 0, 0], [0.3, 0.02, 0.3])
    for (const dz of [-0.35, 0.35]) {
      tube(get('steelDark'), [x, Y + 0.55, z + dz - 0.02], [x, Y + 0.55, z + dz + 0.02], 0.335, 16, true)
      bar(get('galv'), [edge, Y + 0.2, z + dz], [x - dir * 0.42, Y + 0.2, z + dz], 0.05, 0.05)
      bar(get('galv'), [edge, Y - 0.3, z + dz], [x - dir * 0.42, Y + 0.2, z + dz], 0.05, 0.05)
    }
    box(get('red'), [x - dir * 0.25, Y + 0.95, z], [0.06, 0.1, 0.12])
  }
}

/** platform identification boards (yellow, black lettering) hung off the guard rail on two posts */
function idBoards(get: SatGet, S: SatDef) {
  const Y = MAIN_Y
  for (const [x, z, alongZ] of S.idBoards) {
    const size: V3 = alongZ ? [0.04, 1.0, 2.8] : [2.8, 1.0, 0.04]
    box(get(S.idKey), [x, Y + 0.65, z], size)
    for (const t of [-1.0, 1.0]) {
      // the posts stand along the board, one under each end
      const px = alongZ ? x : x + t
      const pz = alongZ ? z + t : z
      bar(get('galv'), [px, Y + 0.1, pz], [px, Y + 1.2, pz], 0.05, 0.05)
    }
  }
}

const corners = (D: PlanRect): [number, number, number, number][] => [
  [D.x0 + 0.35, D.z0 + 0.35, -1, -1],
  [D.x1 - 0.35, D.z0 + 0.35, 1, -1],
  [D.x0 + 0.35, D.z1 - 0.35, -1, 1],
  [D.x1 - 0.35, D.z1 - 0.35, 1, 1],
]

const RP_DEF: SatDef = {
  D: RP.deck,
  J: RP_JACKET,
  legs: RP.legs,
  mid: [-87, -81],
  stair: RP_STAIR,
  cellarHoles: RP_RISERS.map((r) => ({ x0: r.x - 0.45, x1: r.x + 0.45, z0: r.z - 0.45, z1: r.z + 0.45 })),
  bridgeGap: [
    [RP.deck.x1 - e, BRIDGE_W.walk.z0],
    [RP.deck.x1 - e, BRIDGE_W.walk.z1],
  ],
  // SE lantern moved west along the south edge, clear of the cold vent stack in the SE corner
  lanterns: corners(RP.deck).map((c) => (c[2] > 0 && c[3] > 0 ? [RP.vent.x - 2.8, c[1], 1, 1] : c)),
  foghorn: [RP.deck.x0 + 1.4, RP.deck.z1 - 0.35, [[-1, 0], [0, 1]]],
  liferafts: { x: RP.deck.x0, z: [-21.2, -22.6], dir: -1 },
  idBoards: [
    [RP.deck.x0 - 0.08, -9.0, true],
    [RP.deck.x1 + 0.08, -22.0, true],
    [-77.0, RP.deck.z0 - 0.08, false],
    [-88.0, RP.deck.z1 + 0.08, false],
  ],
  idKey: 'idRP',
}

const WI_DEF: SatDef = {
  D: WI.deck,
  J: WI_JACKET,
  legs: WI.legs,
  mid: [9, 15],
  stair: WI_STAIR,
  cellarHoles: WI_CAISSONS.map(([x, z]) => ({ x0: x - 0.55, x1: x + 0.55, z0: z - 0.55, z1: z + 0.55 })),
  bridgeGap: [
    [BRIDGE_NN.walk.x0, WI.deck.z1 - e],
    [BRIDGE_NN.walk.x1, WI.deck.z1 - e],
  ],
  lanterns: corners(WI.deck),
  foghorn: [WI.deck.x0 + 1.4, WI.deck.z0 + 0.35, [[-1, 0], [0, -1]]],
  liferafts: { x: WI.deck.x0, z: [-129.8, -131.2, -132.6, -134.0], dir: -1 },
  idBoards: [
    [WI.deck.x1 + 0.08, -150.6, true],
    [WI.deck.x0 - 0.08, -150.6, true],
    [12, WI.deck.z0 - 0.08, false],
  ],
  idKey: 'idWI',
}

/** RP pig-handling area west of the launchers: yellow box + hatching, a pig loading tray on trestles */
function pigHandling(get: SatGet) {
  const Y = MAIN_Y
  const [x0, x1, z0, z1] = [-92.8, -89.2, -10.2, -3.6]
  const line = (a0: number, b0: number, a1: number, b1: number) => boxMinMax(get('yellow'), [a0, Y, b0], [a1, Y + 0.004, b1])
  line(x0, z0, x1, z0 + 0.1)
  line(x0, z1 - 0.1, x1, z1)
  line(x0, z0, x0 + 0.1, z1)
  line(x1 - 0.1, z0, x1, z1)
  for (const z of [-8.8, -5.2]) {
    // loading tray (cradle) in line with each launcher closure
    for (const x of [x0 + 0.6, x1 - 0.6]) bar(get('steelDark'), [x, Y, z], [x, Y + 1.0, z], 0.08, 0.08)
    bar(get('galv'), [x0 + 0.4, Y + 1.05, z - 0.2], [x1 - 0.4, Y + 1.05, z - 0.2], 0.04, 0.06)
    bar(get('galv'), [x0 + 0.4, Y + 1.05, z + 0.2], [x1 - 0.4, Y + 1.05, z + 0.2], 0.04, 0.06)
  }
  // a parked cleaning pig on the north tray (red cups on a steel body)
  tube(get('steelDark'), [x0 + 0.9, Y + 1.25, -8.8], [x0 + 2.2, Y + 1.25, -8.8], 0.1, 12, false)
  for (const x of [x0 + 1.0, x0 + 1.5, x0 + 2.1]) tube(get('red'), [x - 0.05, Y + 1.25, -8.8], [x + 0.05, Y + 1.25, -8.8], 0.16, 16, false)
}

/** RP cellar deck: riser hang-off frame around the riser tops, access platform under the riser ESDVs */
function rpCellarExtras(get: SatGet) {
  const Y = CELLAR_Y
  for (const r of RP_RISERS) {
    const R = r.od / 2 + 0.25
    boxMinMax(get('steelDark'), [r.x - R - 0.15, Y - 0.6, r.z - R - 0.15], [r.x + R + 0.15, Y - 0.35, r.z + R + 0.15])
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bar(get('steelDark'), [r.x + dx * R, Y - 0.35, r.z + dz * R], [r.x + dx * R, Y + 0.25, r.z + dz * R], 0.12, 0.12)
    // riser ID plate (yellow) on the hang-off
    box(get('yellow'), [r.x + R + 0.2, Y + 0.6, r.z], [0.03, 0.35, 0.6])
    bar(get('galv'), [r.x + R + 0.16, Y, r.z], [r.x + R + 0.16, Y + 0.8, r.z], 0.04, 0.04)
  }
}

/** WI cellar deck: caisson hatch frames + lifting beams over the caisson pumps */
function wiCellarExtras(get: SatGet) {
  const Y = CELLAR_Y
  for (const [x, z] of WI_CAISSONS) {
    boxMinMax(get('steelDark'), [x - 0.7, Y - 0.02, z - 0.7], [x + 0.7, Y + 0.04, z - 0.58])
    boxMinMax(get('steelDark'), [x - 0.7, Y - 0.02, z + 0.58], [x + 0.7, Y + 0.04, z + 0.7])
    boxMinMax(get('steelDark'), [x - 0.7, Y - 0.02, z - 0.58], [x - 0.58, Y + 0.04, z + 0.58])
    boxMinMax(get('steelDark'), [x + 0.58, Y - 0.02, z - 0.58], [x + 0.7, Y + 0.04, z + 0.58])
  }
  // monorail lifting beam under the main deck over both pumps, with a trolley + hook
  const zs = WI_CAISSONS.map(([, z]) => z)
  const x = WI_CAISSONS[0][0]
  bar(get('yellow'), [x, MAIN_Y - 0.75, Math.min(...zs) - 1.6], [x, MAIN_Y - 0.75, Math.max(...zs) + 1.6], 0.16, 0.3)
  boxMinMax(get('yellow'), [x - 0.18, MAIN_Y - 1.15, zs[0] - 0.25], [x + 0.18, MAIN_Y - 0.9, zs[0] + 0.25])
  tube(get('soot'), [x, MAIN_Y - 1.15, zs[0]], [x, MAIN_Y - 2.0, zs[0]], 0.012, 4, true)
}

function buildSat(get: SatGet, S: SatDef, gb: GratingBatches, rb: RailBatches) {
  buildCellarDeck(get, gb, rb, S)
  buildMainDeck(get, rb, S)
  buildLqStair(S.stair, { ...rb, steel: get('steel'), grating: { grating: gb.grating, shadow: gb.shadow }, nosing: get('yellow') })
  navAids(get, S)
  liferafts(get, S)
  idBoards(get, S)
}

function batchSets(get: SatGet) {
  const gb: GratingBatches = { grating: get('grating'), shadow: get('discard'), edge: get('gratingEdge') }
  const rb: RailBatches = { rail: get('yellow'), kick: get('yellow') }
  const jb = { steel: get('jacket'), riser: get('riser'), anode: get('anode'), landing: get('landing'), ladder: get('ladder'), yellow: get('yellow') }
  const bb = {
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
  }
  return { gb, rb, jb, bb }
}

/** RP + the west bridge (one batch set, so the whole platform frustum-culls as a few meshes) */
export function buildRpPlatform(get: SatGet) {
  const { gb, rb, jb, bb } = batchSets(get)
  buildRpJacket(jb)
  buildSat(get, RP_DEF, gb, rb)
  laydownMarks(get, RP.laydown, 'x0')
  cargo(get, -97.3, -19.4, -15.3, -12.45)
  pigHandling(get)
  rpCellarExtras(get)
  buildSatBridge(WEST_BRIDGE, bb)
}

/** WI + the north-north bridge */
export function buildWiPlatform(get: SatGet) {
  const { gb, rb, jb, bb } = batchSets(get)
  buildWiJacket(jb)
  buildSat(get, WI_DEF, gb, rb)
  laydownMarks(get, WI.laydown, 'x1')
  cargo(get, 22.4, -147.4, -143.1, -140.25)
  wiCellarExtras(get)
  buildSatBridge(NN_BRIDGE, bb)
}
