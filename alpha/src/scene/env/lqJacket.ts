/**
 * Accommodation (LQ) platform jacket, WORLD coordinates (sea level y = 0, seabed -62).
 * Leaf module (imports nothing from jacket.ts) so jacket.ts can pull the LQ foam points from here
 * without an import cycle.
 *
 * 4 legs (OD 1.5 m) vertical from the kink (+19) up to the underside of the LQ main-deck plate, battered
 * 1:10 below like Alpha's. Horizontal frames at +12 / -10 / -30 / -55 with plan X-bracing, X-braced faces,
 * K-braces in the top bay, anodes, and a boat landing on the WEST face with a caged ladder to the cellar deck.
 * Joint cans / brace stubs / stand-off anodes / barge bumpers: jacketDetail.ts.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, boxMinMax, tube } from '../structure/batch'
import { ladder } from '../structure/ladder'
import { LQ } from '../../model/site'
import { bargeBumper, standardJacketDetail, type JacketShape } from './jacketDetail'

const cx = (LQ.legs[0][0] + LQ.legs[1][0]) / 2
const cz = (LQ.legs[0][1] + LQ.legs[2][1]) / 2

export const LQ_JACKET = {
  cx,
  cz,
  /** half leg spacing at the kink (x, z) */
  hx: Math.abs(LQ.legs[1][0] - LQ.legs[0][0]) / 2,
  hz: Math.abs(LQ.legs[2][1] - LQ.legs[0][1]) / 2,
  kinkY: 19,
  batter: 1 / 10,
  seabed: -62,
  frames: [12, -10, -30, -55],
  legOD: 1.5,
  braceOD: 0.7,
  frameOD: 0.65,
  /** world y of the main-deck plate top / cellar-deck plate top */
  mainY: 28,
  cellarY: 20,
  /** boat landing (west face) */
  landing: { x: -10.2, z: [70, 72, 74, 76], y: 4.6, ladderZ: 77 },
}

/** World point of an LQ leg at height y (battered below the kink). sx, sz = +-1. */
export function lqLegAt(sx: number, sz: number, y: number): V3 {
  const J = LQ_JACKET
  const o = Math.max(0, J.kinkY - y) * J.batter
  return [J.cx + sx * (J.hx + o), y, J.cz + sz * (J.hz + o)]
}

/** Waterline obstacles for the ocean foam (legs only: the ocean shader has a small fixed budget). */
export function lqFoamPoints(): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = lqLegAt(sx, sz, 0)
    out.push([p[0], p[2], LQ_JACKET.legOD / 2])
  }
  for (const sz of [-1, 1]) {
    const p = lqBumperAt(sz, 0)
    out.push([p[0], p[2], 0.3])
  }
  return out
}

/** barge bumpers on the two west legs (the boat-landing side), diagonally outboard */
const LQ_BUMPER_OFF = LQ_JACKET.legOD / 2 + 1.2
function lqBumperAt(sz: number, y: number): V3 {
  const p = lqLegAt(-1, sz, y)
  return [p[0] - Math.SQRT1_2 * LQ_BUMPER_OFF, y, p[2] + sz * Math.SQRT1_2 * LQ_BUMPER_OFF]
}

const lqShape = (): JacketShape => ({
  at: lqLegAt,
  kinkY: LQ_JACKET.kinkY,
  seabed: LQ_JACKET.seabed,
  frames: LQ_JACKET.frames,
  legOD: LQ_JACKET.legOD,
  braceOD: LQ_JACKET.braceOD,
  frameOD: LQ_JACKET.frameOD,
  planR: 0.25,
  kTopY: LQ_JACKET.cellarY - 0.7,
  kR: 0.3,
})

export interface LqJacketBatches {
  steel: GeoBatch // marine-growth shader
  anode: GeoBatch
  landing: GeoBatch
  ladder: GeoBatch
}

export function buildLqJacket(jb: LqJacketBatches) {
  const J = LQ_JACKET
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  const R = J.legOD / 2
  // stops just under the main-deck plate (no stub above the deck: the plate stays clear for plant)
  const topY = J.mainY - 0.035

  for (const [sx, sz] of corners) {
    const k = lqLegAt(sx, sz, J.kinkY)
    tube(jb.steel, k, [k[0], topY, k[2]], R, 32, true)
    tube(jb.steel, lqLegAt(sx, sz, J.seabed), k, R, 32, true)
    // leg cans at the cellar and main deck girders
    for (const y of [J.cellarY - 0.5, J.mainY - 0.55]) tube(jb.steel, [k[0], y, k[2]], [k[0], y + 0.05, k[2]], R + 0.025, 32, false)
  }

  // horizontal frames: perimeter + plan X
  for (const y of J.frames) {
    const P = corners.map(([sx, sz]) => lqLegAt(sx, sz, y))
    for (let i = 0; i < 4; i++) tube(jb.steel, P[i], P[(i + 1) % 4], J.frameOD / 2, 14, true)
    tube(jb.steel, P[0], P[2], 0.25, 10, true)
    tube(jb.steel, P[1], P[3], 0.25, 10, true)
  }

  // X-bracing on all four faces between frames
  const bays: [number, number][] = [
    [J.frames[0], J.frames[1]],
    [J.frames[1], J.frames[2]],
    [J.frames[2], J.frames[3]],
  ]
  for (const [yt, yb] of bays) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i]
      const [bx, bz] = corners[(i + 1) % 4]
      tube(jb.steel, lqLegAt(ax, az, yt), lqLegAt(bx, bz, yb), J.braceOD / 2, 12, true)
      tube(jb.steel, lqLegAt(bx, bz, yt), lqLegAt(ax, az, yb), J.braceOD / 2, 12, true)
    }
  }
  // top bay: K-braces from the +12 frame up to mid-face under the cellar-deck girders
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    const A = lqLegAt(ax, az, J.frames[0])
    const B = lqLegAt(bx, bz, J.frames[0])
    const top: V3 = [J.cx + ((ax + bx) / 2) * J.hx, J.cellarY - 0.7, J.cz + ((az + bz) / 2) * J.hz]
    tube(jb.steel, A, top, 0.3, 10, true)
    tube(jb.steel, B, top, 0.3, 10, true)
  }

  // node cans, brace stubs, crossing cans, stand-off anodes; barge bumpers
  standardJacketDetail(jb.steel, jb.anode, lqShape())
  for (const sz of [-1, 1]) bargeBumper(jb.steel, (y) => lqLegAt(-1, sz, y), [-Math.SQRT1_2, sz * Math.SQRT1_2], LQ_BUMPER_OFF)

  // boat landing on the west face: bumper piles, fender rails, ties back to the face, landing + ladder
  {
    const L = J.landing
    const faceX = (y: number) => lqLegAt(-1, 1, y)[0]
    for (const z of L.z) tube(jb.steel, [L.x, -4.5, z], [L.x, 5.2, z], 0.3, 14, false)
    for (const y of [-3.0, 0.5, 3.0]) tube(jb.steel, [L.x, y, L.z[0] - 0.4], [L.x, y, L.z[L.z.length - 1] + 0.4], 0.18, 12, true)
    for (const y of [-3.0, 4.6]) for (const z of [L.z[0], L.z[L.z.length - 1]]) tube(jb.steel, [L.x, y, z], [faceX(y), y, z], 0.25, 12, true)
    // landing deck (between the face and the piles, extended to the ladder foot)
    boxMinMax(jb.landing, [L.x + 0.32, L.y - 0.05, L.z[0] - 0.6], [faceX(L.y) - 0.5, L.y, L.ladderZ + 0.7])
    // caged ladder from the landing to the cellar deck (west edge x = -9)
    const lx = LQ.deck.x0 - 0.45
    ladder(jb.ladder, [lx, L.y, L.ladderZ], J.cellarY - L.y, [-1, 0], true)
    for (const y of [8, 12, 16]) bar(jb.ladder, [lx, y, L.ladderZ], [faceX(y), y, L.ladderZ], 0.06, 0.06)
  }
}
