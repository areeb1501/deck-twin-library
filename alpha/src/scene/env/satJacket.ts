/**
 * Jackets of the two bridge-linked satellite platforms, WORLD coordinates (sea level y = 0, seabed -62):
 *  - RP (riser & export platform, west of Alpha): oil + gas export risers clamped inside the east face,
 *    bending out at the seabed into the pipelines (oil south, gas north), each with a subsea isolation
 *    valve (SSIV) skid 60 m out
 *  - WI (water-injection platform, north of WHP-N): caisson guides for the two seawater lift pumps
 * Both are WHP-N style 4-leg jackets (whpJacket.ts): legs OD 1.4 m vertical from the kink (+19) to just
 * under the main-deck plate, battered 1:10 below, horizontal frames at +12 / -10 / -30 / -55 with plan
 * X-bracing, X-braced faces, K-braces in the top bay, anodes, and a boat landing on the WEST face with a
 * caged ladder up to the cellar deck.
 *
 * Joint cans / brace stubs / stand-off anodes / barge bumpers / a cable J-tube each: jacketDetail.ts.
 *
 * Leaf module (imports nothing from jacket.ts), so jacket.ts can take the foam points from here.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, boxMinMax, tube } from '../structure/batch'
import { ladder } from '../structure/ladder'
import { RP, WI } from '../../model/site'
import type { PlanRect } from '../../model/types'
import { bargeBumper, jTube, standardJacketDetail, type JacketShape } from './jacketDetail'

export interface SatJacketDef {
  cx: number
  cz: number
  /** half leg spacing at the kink (x, z) */
  hx: number
  hz: number
  kinkY: number
  batter: number
  seabed: number
  frames: number[]
  legOD: number
  braceOD: number
  frameOD: number
  /** world y of the main-deck plate top / cellar-deck plate top */
  mainY: number
  cellarY: number
  deck: PlanRect
  /** boat landing (west face): pile x, pile z's, landing deck y, caged-ladder z */
  landing: { x: number; z: number[]; y: number; ladderZ: number }
}

function jacketDef(p: { deck: PlanRect; legs: [number, number][]; cellarY: number }, landingZ: number[], ladderZ: number): SatJacketDef {
  const cx = (p.legs[0][0] + p.legs[1][0]) / 2
  const cz = (p.legs[0][1] + p.legs[2][1]) / 2
  return {
    cx,
    cz,
    hx: Math.abs(p.legs[1][0] - p.legs[0][0]) / 2,
    hz: Math.abs(p.legs[2][1] - p.legs[0][1]) / 2,
    kinkY: 19,
    batter: 1 / 10,
    seabed: -62,
    frames: [12, -10, -30, -55],
    legOD: 1.4,
    braceOD: 0.65,
    frameOD: 0.6,
    mainY: 28,
    cellarY: 28 + p.cellarY,
    deck: p.deck,
    landing: { x: p.deck.x0 - 1.4, z: landingZ, y: 4.6, ladderZ },
  }
}

/** cable J-tube per jacket (see jTubeAt) */
const JTUBES = new Map<SatJacketDef, { side: 'n' | 'e'; t: number; r: number }>()
export const RP_JACKET = jacketDef(RP, [-6, -8, -10, -12], -13.2)
export const WI_JACKET = jacketDef(WI, [-132, -134, -136, -138], -139.2)
JTUBES.set(RP_JACKET, { side: 'n', t: -0.55, r: 0.15 })
JTUBES.set(WI_JACKET, { side: 'e', t: 0.25, r: 0.2 })

/** World point of a leg at height y (battered below the kink). sx, sz = +-1. */
export function satLegAt(J: SatJacketDef, sx: number, sz: number, y: number): V3 {
  const o = Math.max(0, J.kinkY - y) * J.batter
  return [J.cx + sx * (J.hx + o), y, J.cz + sz * (J.hz + o)]
}

/** RP risers: OD and the deck-local top (just under the cellar plate), from model/site.ts RP.risers */
export const RP_RISERS = RP.risers.map(([x, z], i) => ({ x, z, od: i === 0 ? 0.324 : 0.273, topY: 28 + RP.cellarY - 0.9 }))
/** WI caisson centres (the caisson pumps hang from the cellar deck; see model/wiSite.ts) */
export const WI_CAISSONS: [number, number][] = [
  [3.0, -146.5],
  [3.0, -143.0],
]

/** barge bumpers on the two west legs (boat-landing side), diagonally outboard */
const bumperOff = (J: SatJacketDef) => J.legOD / 2 + 1.2
function bumperAt(J: SatJacketDef, sz: number, y: number): V3 {
  const p = satLegAt(J, -1, sz, y)
  const o = bumperOff(J) * Math.SQRT1_2
  return [p[0] - o, y, p[2] + sz * o]
}
/**
 * One cable J-tube per platform: RP down the north face (fibre to shore, out north), WI down the east face
 * (power cable, out east). `side` picks the face; `t` is the position along it (−1 … 1 between the legs).
 */
function jTubeAt(J: SatJacketDef, y: number): V3 {
  const j = JTUBES.get(J)!
  const yy = Math.min(y, J.kinkY)
  if (j.side === 'n') {
    const p = satLegAt(J, -1, -1, yy)
    return [J.cx + j.t * J.hx, y, p[2] - 1.1]
  }
  const p = satLegAt(J, 1, 1, yy)
  return [p[0] + 1.1, y, J.cz + j.t * J.hz]
}
function jTubeTie(J: SatJacketDef, y: number): V3 {
  const j = JTUBES.get(J)!
  const yy = Math.min(y, J.kinkY)
  if (j.side === 'n') return [J.cx + j.t * J.hx, y, satLegAt(J, -1, -1, yy)[2]]
  return [satLegAt(J, 1, 1, yy)[0], y, J.cz + j.t * J.hz]
}
const shape = (J: SatJacketDef): JacketShape => ({
  at: (sx, sz, y) => satLegAt(J, sx, sz, y),
  kinkY: J.kinkY,
  seabed: J.seabed,
  frames: J.frames,
  legOD: J.legOD,
  braceOD: J.braceOD,
  frameOD: J.frameOD,
  planR: 0.24,
  kTopY: J.cellarY - 0.7,
  kR: 0.28,
})

function legFoam(J: SatJacketDef): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = satLegAt(J, sx, sz, 0)
    out.push([p[0], p[2], J.legOD / 2])
  }
  const L = J.landing
  out.push([L.x, L.z[0], 0.3], [L.x, L.z[L.z.length - 1], 0.3])
  for (const sz of [-1, 1]) {
    const p = bumperAt(J, sz, 0)
    out.push([p[0], p[2], 0.3])
  }
  const jt = jTubeAt(J, 0)
  out.push([jt[0], jt[2], JTUBES.get(J)!.r])
  return out
}
/** Waterline obstacles for the ocean foam (x, z, radius): legs, outer landing piles, risers / caissons. */
export function rpFoamPoints(): [number, number, number][] {
  return [...legFoam(RP_JACKET), ...RP_RISERS.map((r) => [r.x, r.z, r.od / 2 + 0.05] as [number, number, number])]
}
export function wiFoamPoints(): [number, number, number][] {
  return [...legFoam(WI_JACKET), ...WI_CAISSONS.map(([x, z]) => [x, z, 0.45] as [number, number, number])]
}

export interface SatJacketBatches {
  steel: GeoBatch // marine-growth shader
  riser: GeoBatch
  anode: GeoBatch
  landing: GeoBatch
  ladder: GeoBatch
  yellow: GeoBatch
}

/** legs, frames, bracing, anodes, boat landing (shared by RP and WI) */
function buildFrame(J: SatJacketDef, jb: SatJacketBatches) {
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  const R = J.legOD / 2
  const topY = J.mainY - 0.035
  const at = (sx: number, sz: number, y: number) => satLegAt(J, sx, sz, y)
  for (const [sx, sz] of corners) {
    const k = at(sx, sz, J.kinkY)
    tube(jb.steel, k, [k[0], topY, k[2]], R, 28, true)
    tube(jb.steel, at(sx, sz, J.seabed), k, R, 28, true)
    for (const y of [J.cellarY - 0.5, J.mainY - 0.55]) tube(jb.steel, [k[0], y, k[2]], [k[0], y + 0.05, k[2]], R + 0.025, 28, false)
    tube(jb.steel, at(sx, sz, J.seabed), at(sx, sz, J.seabed + 4), R + 0.22, 20, false)
  }
  for (const y of J.frames) {
    const P = corners.map(([sx, sz]) => at(sx, sz, y))
    for (let i = 0; i < 4; i++) tube(jb.steel, P[i], P[(i + 1) % 4], J.frameOD / 2, 14, true)
    tube(jb.steel, P[0], P[2], 0.24, 10, true)
    tube(jb.steel, P[1], P[3], 0.24, 10, true)
  }
  for (let b = 0; b < J.frames.length - 1; b++) {
    const [yt, yb] = [J.frames[b], J.frames[b + 1]]
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i]
      const [bx, bz] = corners[(i + 1) % 4]
      tube(jb.steel, at(ax, az, yt), at(bx, bz, yb), J.braceOD / 2, 12, true)
      tube(jb.steel, at(bx, bz, yt), at(ax, az, yb), J.braceOD / 2, 12, true)
    }
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    const top: V3 = [J.cx + ((ax + bx) / 2) * J.hx, J.cellarY - 0.7, J.cz + ((az + bz) / 2) * J.hz]
    tube(jb.steel, at(ax, az, J.frames[0]), top, 0.28, 10, true)
    tube(jb.steel, at(bx, bz, J.frames[0]), top, 0.28, 10, true)
  }
  // node cans, brace stubs, crossing cans, stand-off anodes; barge bumpers; cable J-tube
  standardJacketDetail(jb.steel, jb.anode, shape(J))
  for (const sz of [-1, 1]) bargeBumper(jb.steel, (y) => at(-1, sz, y), [-Math.SQRT1_2, sz * Math.SQRT1_2], bumperOff(J))
  {
    const jt = JTUBES.get(J)!
    jTube(jb.riser, jb.steel, (y) => jTubeAt(J, y), J.cellarY + 0.55, J.seabed + 5.5, jt.side === 'n' ? [0, -1] : [1, 0], jt.r, [...J.frames, 16.5].filter((y) => y > J.seabed + 6), (y) => jTubeTie(J, y))
  }
  // boat landing on the west face: bumper piles, fender rails, ties back, landing + caged ladder
  {
    const L = J.landing
    const faceX = (y: number) => at(-1, 1, y)[0]
    for (const z of L.z) tube(jb.steel, [L.x, -4.5, z], [L.x, 5.2, z], 0.3, 14, false)
    const zA = Math.max(...L.z)
    const zB = Math.min(...L.z)
    for (const y of [-3.0, 0.5, 3.0]) tube(jb.steel, [L.x, y, zB - 0.4], [L.x, y, zA + 0.4], 0.18, 12, true)
    for (const y of [-3.0, 4.6]) for (const z of [zA, zB]) tube(jb.steel, [L.x, y, z], [faceX(y), y, z], 0.25, 12, true)
    boxMinMax(jb.landing, [L.x + 0.32, L.y - 0.05, L.ladderZ - 0.7], [faceX(L.y) - 0.5, L.y, zA + 0.6])
    const lx = J.deck.x0 - 0.45
    ladder(jb.ladder, [lx, L.y, L.ladderZ], J.cellarY - L.y, [-1, 0], true)
    for (const y of [8, 12, 16]) bar(jb.ladder, [lx, y, L.ladderZ], [faceX(y), y, L.ladderZ], 0.06, 0.06)
  }
}

/** RP: jacket + export risers (clamped to the east face) + seabed pipeline spools and SSIV skids */
export function buildRpJacket(jb: SatJacketBatches) {
  const J = RP_JACKET
  buildFrame(J, jb)
  const east = (y: number) => satLegAt(J, 1, 1, y)[0]
  for (const r of RP_RISERS) {
    const R = r.od / 2
    const yb = J.seabed + 1.2
    // riser: top flange under the cellar plate, straight down inside the east face
    tube(jb.riser, [r.x, yb + 2.5, r.z], [r.x, r.topY, r.z], R, 18, false)
    tube(jb.riser, [r.x, r.topY - 0.05, r.z], [r.x, r.topY, r.z], R + 0.09, 18, false) // top flange
    // riser hang-off / guide clamps at the cellar deck and every frame, tied to the east face
    for (const y of [J.cellarY - 1.2, ...J.frames]) {
      tube(jb.steel, [r.x, y - 0.25, r.z], [r.x, y + 0.25, r.z], R + 0.08, 18, false)
      tube(jb.steel, [r.x + R + 0.08, y, r.z], [east(y) - J.legOD / 2 + 0.1, y, r.z], 0.12, 8, true)
    }
    // bend at the seabed (riser base) into the pipeline: oil runs out south, gas north (away from each other)
    const d = r === RP_RISERS[0] ? 1 : -1
    const Z = (dz: number) => r.z + d * dz
    const b0: V3 = [r.x, yb + 2.5, r.z]
    const b1: V3 = [r.x, yb + 0.6, Z(1.2)]
    const b2: V3 = [r.x, yb, Z(2.6)]
    tube(jb.riser, b0, b1, R, 18, false)
    tube(jb.riser, b1, b2, R, 18, false)
    tube(jb.riser, b2, [r.x, yb, Z(80)], R, 18, false)
    // concrete mattresses + the SSIV skid (protection frame, valve body, actuator) 60 m out
    const zr = (a0: number, a1: number) => [Math.min(Z(a0), Z(a1)), Math.max(Z(a0), Z(a1))]
    for (let k = 0; k < 6; k++) {
      const [z0, z1] = zr(8 + k * 7, 13 + k * 7)
      boxMinMax(jb.landing, [r.x - 1.2, J.seabed, z0], [r.x + 1.2, J.seabed + 0.3, z1])
    }
    const sz = Z(60)
    boxMinMax(jb.landing, [r.x - 1.8, J.seabed, sz - 3], [r.x + 1.8, J.seabed + 0.4, sz + 3])
    for (const dx of [-1.6, 1.6]) for (const dz of [-2.8, 2.8]) bar(jb.yellow, [r.x + dx, J.seabed + 0.4, sz + dz], [r.x + dx, J.seabed + 3.2, sz + dz], 0.18, 0.18)
    for (const dx of [-1.6, 1.6]) bar(jb.yellow, [r.x + dx, J.seabed + 3.2, sz - 2.8], [r.x + dx, J.seabed + 3.2, sz + 2.8], 0.16, 0.16)
    boxMinMax(jb.riser, [r.x - 0.55, yb - 0.45, sz - 0.6], [r.x + 0.55, yb + 0.45, sz + 0.6])
    boxMinMax(jb.yellow, [r.x - 0.35, yb + 0.45, sz - 0.35], [r.x + 0.35, yb + 1.5, sz + 0.35])
  }
}

/** WI: jacket + caisson guides for the lift pumps (the caissons themselves are drawn by the pumps) */
export function buildWiJacket(jb: SatJacketBatches) {
  const J = WI_JACKET
  buildFrame(J, jb)
  const west = (y: number) => satLegAt(J, -1, 1, y)[0]
  for (const [x, z] of WI_CAISSONS) {
    for (const y of [J.frames[0], J.cellarY - 1.4]) {
      tube(jb.steel, [x, y - 0.3, z], [x, y + 0.3, z], 0.55, 18, false)
      tube(jb.steel, [x - 0.55, y, z], [west(y) + J.legOD / 2 - 0.1, y, z], 0.13, 8, true)
    }
  }
}
