/**
 * Steel jacket substructure (WORLD coordinates, sea level y = 0).
 * 4 legs OD 1.8 m, vertical through the topsides, battered 1:10 (both directions) below
 * the transition at y = 19 down to the seabed (~ -62). Horizontal frames at +12, -10, -30, -55,
 * X-braced faces, conductor guide frames + 6 well conductors, export risers on the east face with
 * riser guards, boat landing on the south face.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, boxMinMax, tube } from '../structure/batch'
import { ladder } from '../structure/ladder'
import { DECK } from '../structure/deckConst'
import { DECK_WORLD_Y } from '../../state/store'
import { lqFoamPoints } from './lqJacket'
import { whpFoamPoints } from './whpJacket'
import { rpFoamPoints, wiFoamPoints } from './satJacket'

export const JACKET = {
  /** elevation where the legs change from vertical to battered */
  kinkY: 19,
  batter: 1 / 10,
  seabed: -62,
  frames: [12, -10, -30, -55],
  legOD: DECK.legOD,
  braceOD: 0.9,
  frameOD: 0.8,
  planOD: 0.6,
  conductors: [
    [-3, -13],
    [0, -13],
    [3, -13],
    [-3, -10.5],
    [0, -10.5],
    [3, -10.5],
  ] as [number, number][],
  conductorOD: 0.762,
  /** risers: deck-local top point for the lead's piping (x, y, z in DECK coordinates) */
  risers: [
    { tag: '8"-PO-EXPORT-RISER', service: 'oil' as const, nps: 8, z: -6.5 },
    { tag: '8"-PG-EXPORT-RISER', service: 'gas' as const, nps: 8, z: 14.75 },
    { tag: '10"-WI-SPARE-JTUBE', service: 'water' as const, nps: 10, z: 3.2 },
  ],
  riserOffset: 3.0,
}

/** World (x, z) of a leg at height y (battered below kinkY). sx, sz = +-1 corner signs. */
export function legAt(sx: number, sz: number, y: number): V3 {
  const o = Math.max(0, JACKET.kinkY - y) * JACKET.batter
  return [sx * (24 + o), y, sz * (17 + o)]
}

/** Riser centreline x at height y (parallel to the east face). */
export function riserX(y: number) {
  return legAt(1, 1, Math.min(y, JACKET.kinkY))[0] + JACKET.riserOffset
}

/** Riser top points in DECK-LOCAL coordinates (flange just below the production deck girders). */
export const RISER_TOPS = JACKET.risers.map((r) => ({ ...r, top: [riserX(JACKET.kinkY), -0.7, r.z] as V3 }))

/** Waterline obstacles for ocean foam: (x, z, radius). */
export function foamPoints(): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = legAt(sx, sz, 0)
    out.push([p[0], p[2], JACKET.legOD / 2])
  }
  for (const [x, z] of JACKET.conductors) out.push([x, z, JACKET.conductorOD / 2])
  for (const r of JACKET.risers) out.push([riserX(0), r.z, 0.25])
  for (const x of [-3, -1, 1, 3]) out.push([x, 21.2, 0.3])
  out.push([riserX(0) + 1.6, -13, 0.3], [riserX(0) + 1.6, 5, 0.3])
  // LQ platform legs (the ocean shader takes at most MAX_FOAM points, see Ocean.tsx)
  out.push(...lqFoamPoints())
  // WHP-N legs + boat-landing piles
  out.push(...whpFoamPoints())
  // RP legs, landing piles + export risers; WI legs, landing piles + lift-pump caissons
  out.push(...rpFoamPoints(), ...wiFoamPoints())
  return out
}

export interface JacketBatches {
  steel: GeoBatch // legs, braces (marine-growth shader)
  riser: GeoBatch
  anode: GeoBatch
  grating: GeoBatch // boat-landing deck (solid-ish plate)
  ladder: GeoBatch
}

export function buildJacket(jb: JacketBatches) {
  const { kinkY, seabed, frames } = JACKET
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  const topY = DECK_WORLD_Y + DECK.legSpan[0] // where DeckStructure takes over (27.2)

  // legs: vertical part (cellar deck to underside of production deck) + battered part + stub on top
  for (const [sx, sz] of corners) {
    const a = legAt(sx, sz, kinkY)
    tube(jb.steel, a, [a[0], topY, a[2]], JACKET.legOD / 2, 36, true)
    tube(jb.steel, legAt(sx, sz, seabed), a, JACKET.legOD / 2, 36, true)
    // node cans (thicker) at each frame
    for (const y of frames) {
      const p = legAt(sx, sz, y)
      const q = legAt(sx, sz, y + 1.6)
      tube(jb.steel, [p[0], y - 0.8, p[2]], q, JACKET.legOD / 2 + 0.03, 36, true)
    }
  }

  // horizontal frames: perimeter + plan X-bracing + mid nodes on the long faces
  const levels = [...frames]
  for (const y of levels) {
    const P = corners.map(([sx, sz]) => legAt(sx, sz, y))
    for (let i = 0; i < 4; i++) tube(jb.steel, P[i], P[(i + 1) % 4], JACKET.frameOD / 2, 16, true)
    tube(jb.steel, P[0], P[2], JACKET.planOD / 2, 12, true)
    tube(jb.steel, P[1], P[3], JACKET.planOD / 2, 12, true)
    // conductor guide frame tied to the north perimeter member
    const zN = P[0][2]
    const g = { x0: -4.5, x1: 4.5, z0: -14.5, z1: -9.0 }
    const gy = y
    tube(jb.steel, [g.x0, gy, g.z0], [g.x1, gy, g.z0], 0.25, 10, true)
    tube(jb.steel, [g.x0, gy, g.z1], [g.x1, gy, g.z1], 0.25, 10, true)
    tube(jb.steel, [g.x0, gy, g.z0], [g.x0, gy, g.z1], 0.25, 10, true)
    tube(jb.steel, [g.x1, gy, g.z0], [g.x1, gy, g.z1], 0.25, 10, true)
    tube(jb.steel, [g.x0, gy, g.z0], [g.x0 - 2, gy, zN], 0.28, 10, true)
    tube(jb.steel, [g.x1, gy, g.z0], [g.x1 + 2, gy, zN], 0.28, 10, true)
    for (const [cx, cz] of JACKET.conductors) {
      // guide cones (short sleeve) around each conductor
      tube(jb.steel, [cx, gy - 0.6, cz], [cx, gy + 0.6, cz], JACKET.conductorOD / 2 + 0.08, 14, true)
      bar(jb.steel, [cx, gy, g.z0], [cx, gy, g.z1], 0.12, 0.3)
    }
  }

  // X-bracing on the four faces between frames (long N/S faces split into two panels)
  const bays: [number, number][] = [
    [frames[0], frames[1]],
    [frames[1], frames[2]],
    [frames[2], frames[3]],
  ]
  for (const [yt, yb] of bays) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i]
      const [bx, bz] = corners[(i + 1) % 4]
      const A0 = legAt(ax, az, yt)
      const B0 = legAt(bx, bz, yt)
      const A1 = legAt(ax, az, yb)
      const B1 = legAt(bx, bz, yb)
      const long = az === bz // N or S face
      if (long) {
        const M0: V3 = [(A0[0] + B0[0]) / 2, yt, A0[2]]
        const M1: V3 = [(A1[0] + B1[0]) / 2, yb, A1[2]]
        for (const [p, q, r, s] of [
          [A0, M0, A1, M1],
          [M0, B0, M1, B1],
        ] as [V3, V3, V3, V3][]) {
          tube(jb.steel, p, s, JACKET.braceOD / 2, 14, true)
          tube(jb.steel, q, r, JACKET.braceOD / 2, 14, true)
        }
        tube(jb.steel, M0, M1, JACKET.braceOD / 2 - 0.1, 14, true)
      } else {
        tube(jb.steel, A0, B1, JACKET.braceOD / 2, 14, true)
        tube(jb.steel, B0, A1, JACKET.braceOD / 2, 14, true)
      }
    }
  }
  // top bay (frame +12 to kink): K-braces to the cellar-deck girders
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    const A = legAt(ax, az, frames[0])
    const B = legAt(bx, bz, frames[0])
    const top: V3 = [(ax * 24 + bx * 24) / 2, 19.3, (az * 17 + bz * 17) / 2]
    tube(jb.steel, A, top, 0.35, 12, true)
    tube(jb.steel, B, top, 0.35, 12, true)
  }

  // well conductors from seabed to the cellar deck underside
  for (const [x, z] of JACKET.conductors) tube(jb.steel, [x, seabed, z], [x, 19.4, z], JACKET.conductorOD / 2, 18, true)

  // sacrificial anodes on the lower braces
  for (const y of [-20, -40]) {
    for (let i = 0; i < 4; i++) {
      const [sx, sz] = corners[i]
      const p = legAt(sx, sz, y)
      boxMinMax(jb.anode, [p[0] - sx * 1.6 - 0.15, y - 1.2, p[2] - 0.15], [p[0] - sx * 1.6 + 0.15, y + 1.2, p[2] + 0.15])
    }
  }

  // export risers on the east face + clamps
  for (const r of JACKET.risers) {
    const rr = r.nps * 0.0254 * 0.5 + 0.01
    const xk = riserX(kinkY)
    tube(jb.riser, [riserX(seabed), seabed, r.z], [xk, kinkY, r.z], rr, 16, true)
    tube(jb.riser, [xk, kinkY, r.z], [xk, DECK_WORLD_Y - 0.7, r.z], rr, 16, true)
    // top flange
    tube(jb.riser, [xk, DECK_WORLD_Y - 0.74, r.z], [xk, DECK_WORLD_Y - 0.68, r.z], rr * 1.8, 20, false)
    for (const y of [...frames, 4, 16]) {
      const xr = riserX(y)
      const xf = legAt(1, 1, y)[0]
      tube(jb.riser, [xr, y - 0.25, r.z], [xr, y + 0.25, r.z], rr + 0.06, 14, true)
      bar(jb.steel, [xf, y, r.z], [xr - rr - 0.05, y, r.z], 0.25, 0.25)
    }
  }
  // riser guard at the waterline (protects the risers from vessel impact)
  {
    const xg = riserX(0) + 1.6
    const zs = [-13, -8.5, -3, 1.5, 5]
    for (const z of zs) tube(jb.steel, [xg, -4.5, z], [xg, 6.0, z], 0.3, 14, false)
    for (const y of [-3.5, 1.0, 5.5]) {
      tube(jb.steel, [xg, y, zs[0]], [xg, y, zs[zs.length - 1]], 0.25, 12, true)
      for (const z of [zs[0], zs[2], zs[zs.length - 1]]) tube(jb.steel, [xg, y, z], [legAt(1, 1, y)[0], y, z], 0.22, 12, true)
    }
  }

  // boat landing on the south face
  {
    const zb = 21.2
    const xs = [-3, -1, 1, 3]
    for (const x of xs) tube(jb.steel, [x, -4.5, zb], [x, 5.2, zb], 0.3, 14, false)
    for (const y of [-3.0, 0.5, 3.0]) tube(jb.steel, [-3.4, y, zb], [3.4, y, zb], 0.18, 12, true)
    for (const y of [-3.0, 4.6]) {
      for (const x of [-3, 3]) tube(jb.steel, [x, y, zb], [x, y, legAt(1, 1, y)[2]], 0.25, 12, true)
    }
    // landing platform + ladder to the cellar deck
    boxMinMax(jb.grating, [-3.6, 4.55, legAt(1, 1, 4.6)[2] + 0.5], [5.2, 4.6, zb - 0.32])
    ladder(jb.ladder, [4.5, 4.6, 20.45], 20 - 4.6, [0, 1], true)
    // ladder stand-offs to the jacket face
    for (const y of [8, 12, 16]) bar(jb.ladder, [4.5, y, 20.45], [4.5, y, legAt(1, 1, y)[2]], 0.06, 0.06)
  }
}
