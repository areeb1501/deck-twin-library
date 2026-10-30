/**
 * WHP-N wellhead platform jacket, WORLD coordinates (sea level y = 0, seabed -62). Leaf module (imports
 * nothing from jacket.ts) so jacket.ts can pull the WHP foam points from here without an import cycle.
 *
 * 4 legs (OD 1.4 m) vertical from the kink (+19) to just under the wellhead-deck plate, battered 1:10
 * below like Alpha's and the LQ's. Horizontal frames at +12 / -10 / -30 / -55 with plan X-bracing,
 * X-braced faces, K-braces in the top bay, anodes. Six 30" conductors from the wellheads to below the
 * mudline through conductor guide frames at every frame level and the cellar deck. Boat landing on the
 * WEST face with a caged ladder up to the cellar (spider) deck.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, boxMinMax, tube } from '../structure/batch'
import { ladder } from '../structure/ladder'
import { WHP } from '../../model/site'

const cx = (WHP.legs[0][0] + WHP.legs[1][0]) / 2
const cz = (WHP.legs[0][1] + WHP.legs[2][1]) / 2

export const WHP_JACKET = {
  cx,
  cz,
  /** half leg spacing at the kink (x, z) */
  hx: Math.abs(WHP.legs[1][0] - WHP.legs[0][0]) / 2,
  hz: Math.abs(WHP.legs[2][1] - WHP.legs[0][1]) / 2,
  kinkY: 19,
  batter: 1 / 10,
  seabed: -62,
  frames: [12, -10, -30, -55],
  legOD: 1.4,
  braceOD: 0.65,
  frameOD: 0.6,
  conductorOD: 0.762,
  /** world y of the wellhead-deck plate top / cellar-deck plate top */
  mainY: 28,
  cellarY: 28 + WHP.cellarY,
  /** boat landing (west face) */
  landing: { x: -3.4, z: [-64, -66, -68, -70], y: 4.6, ladderZ: -71.2 },
}

/** World point of a WHP leg at height y (battered below the kink). sx, sz = +-1. */
export function whpLegAt(sx: number, sz: number, y: number): V3 {
  const J = WHP_JACKET
  const o = Math.max(0, J.kinkY - y) * J.batter
  return [J.cx + sx * (J.hx + o), y, J.cz + sz * (J.hz + o)]
}

/** Waterline obstacles for the ocean foam: the four legs and the outer boat-landing piles. */
export function whpFoamPoints(): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = whpLegAt(sx, sz, 0)
    out.push([p[0], p[2], WHP_JACKET.legOD / 2])
  }
  const L = WHP_JACKET.landing
  out.push([L.x, L.z[0], 0.3], [L.x, L.z[L.z.length - 1], 0.3])
  return out
}

export interface WhpJacketBatches {
  steel: GeoBatch // marine-growth shader
  conductor: GeoBatch
  anode: GeoBatch
  landing: GeoBatch
  ladder: GeoBatch
}

export function buildWhpJacket(jb: WhpJacketBatches) {
  const J = WHP_JACKET
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  const R = J.legOD / 2
  const topY = J.mainY - 0.035

  for (const [sx, sz] of corners) {
    const k = whpLegAt(sx, sz, J.kinkY)
    tube(jb.steel, k, [k[0], topY, k[2]], R, 28, true)
    tube(jb.steel, whpLegAt(sx, sz, J.seabed), k, R, 28, true)
    for (const y of J.frames) tube(jb.steel, whpLegAt(sx, sz, y - 0.6), whpLegAt(sx, sz, y + 0.6), R + 0.03, 28, true)
    for (const y of [J.cellarY - 0.5, J.mainY - 0.55]) tube(jb.steel, [k[0], y, k[2]], [k[0], y + 0.05, k[2]], R + 0.025, 28, false)
    // pile sleeves at the mudline
    tube(jb.steel, whpLegAt(sx, sz, J.seabed), whpLegAt(sx, sz, J.seabed + 4), R + 0.22, 20, false)
  }

  // horizontal frames: perimeter + plan X
  for (const y of J.frames) {
    const P = corners.map(([sx, sz]) => whpLegAt(sx, sz, y))
    for (let i = 0; i < 4; i++) tube(jb.steel, P[i], P[(i + 1) % 4], J.frameOD / 2, 14, true)
    tube(jb.steel, P[0], P[2], 0.24, 10, true)
    tube(jb.steel, P[1], P[3], 0.24, 10, true)
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
      tube(jb.steel, whpLegAt(ax, az, yt), whpLegAt(bx, bz, yb), J.braceOD / 2, 12, true)
      tube(jb.steel, whpLegAt(bx, bz, yt), whpLegAt(ax, az, yb), J.braceOD / 2, 12, true)
    }
  }
  // top bay: K-braces from the +12 frame up to mid-face under the cellar-deck girders
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    const A = whpLegAt(ax, az, J.frames[0])
    const B = whpLegAt(bx, bz, J.frames[0])
    const top: V3 = [J.cx + ((ax + bx) / 2) * J.hx, J.cellarY - 0.7, J.cz + ((az + bz) / 2) * J.hz]
    tube(jb.steel, A, top, 0.28, 10, true)
    tube(jb.steel, B, top, 0.28, 10, true)
  }

  // anodes on the lower legs
  for (const y of [-20, -42]) {
    for (const [sx, sz] of corners) {
      const p = whpLegAt(sx, sz, y)
      const ox = -sx * 1.3
      boxMinMax(jb.anode, [p[0] + ox - 0.13, y - 1.0, p[2] - 0.13], [p[0] + ox + 0.13, y + 1.0, p[2] + 0.13])
      const oz = -sz * 1.3
      boxMinMax(jb.anode, [p[0] - 0.13, y - 6.0, p[2] + oz - 0.13], [p[0] + 0.13, y - 4.0, p[2] + oz + 0.13])
    }
  }

  // ---- conductors (wellhead load plate at deck-local -0.032 → world 27.97; tree draws the top 0.6 m)
  const RC = J.conductorOD / 2
  const xs = [...new Set(WHP.wells.map(([x]) => x))].sort((a, b) => a - b)
  const zs = [...new Set(WHP.wells.map(([, z]) => z))].sort((a, b) => a - b)
  for (const [x, z] of WHP.wells) {
    tube(jb.conductor, [x, J.seabed - 6, z], [x, J.mainY - 0.62, z], RC, 24, false)
    // centralising guide cans at the guide frames
    for (const y of [...J.frames, J.cellarY - 0.45]) tube(jb.steel, [x, y - 0.5, z], [x, y + 0.5, z], RC + 0.09, 24, false)
  }
  // conductor guide frames: grid round the conductors, tied back to the west face at every frame level
  const gx0 = xs[0] - 1.1
  const gx1 = xs[xs.length - 1] + 1.1
  const gz0 = zs[0] - 1.1
  const gz1 = zs[zs.length - 1] + 1.1
  for (const y of [...J.frames, J.cellarY - 0.45]) {
    const r = 0.17
    tube(jb.steel, [gx0, y, gz0], [gx1, y, gz0], r, 10, true)
    tube(jb.steel, [gx0, y, gz1], [gx1, y, gz1], r, 10, true)
    tube(jb.steel, [gx0, y, gz0], [gx0, y, gz1], r, 10, true)
    tube(jb.steel, [gx1, y, gz0], [gx1, y, gz1], r, 10, true)
    for (const x of xs) tube(jb.steel, [x, y, gz0], [x, y, gz1], 0.12, 8, true)
    for (const z of zs) tube(jb.steel, [gx0, y, z], [gx1, y, z], 0.12, 8, true)
    // ties to the west face and to the plan bracing on the east
    const faceX = y > J.kinkY ? J.cx - J.hx : whpLegAt(-1, 1, y)[0]
    for (const z of [gz0, gz1]) tube(jb.steel, [faceX, y, z], [gx0, y, z], 0.2, 10, true)
    const midX = J.cx
    tube(jb.steel, [gx1, y, (gz0 + gz1) / 2], [midX, y, (gz0 + gz1) / 2], 0.2, 10, true)
  }

  // ---- boat landing on the west face: bumper piles, fender rails, ties back, landing + caged ladder
  {
    const L = J.landing
    const faceX = (y: number) => whpLegAt(-1, 1, y)[0]
    for (const z of L.z) tube(jb.steel, [L.x, -4.5, z], [L.x, 5.2, z], 0.3, 14, false)
    const zA = Math.max(...L.z)
    const zB = Math.min(...L.z)
    for (const y of [-3.0, 0.5, 3.0]) tube(jb.steel, [L.x, y, zB - 0.4], [L.x, y, zA + 0.4], 0.18, 12, true)
    for (const y of [-3.0, 4.6]) for (const z of [zA, zB]) tube(jb.steel, [L.x, y, z], [faceX(y), y, z], 0.25, 12, true)
    boxMinMax(jb.landing, [L.x + 0.32, L.y - 0.05, L.ladderZ - 0.7], [faceX(L.y) - 0.5, L.y, zA + 0.6])
    const lx = WHP.deck.x0 - 0.45
    ladder(jb.ladder, [lx, L.y, L.ladderZ], J.cellarY - L.y, [-1, 0], true)
    for (const y of [8, 12, 16]) bar(jb.ladder, [lx, y, L.ladderZ], [faceX(y), y, L.ladderZ], 0.06, 0.06)
  }
}
