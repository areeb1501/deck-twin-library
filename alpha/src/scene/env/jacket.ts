/**
 * Steel jacket substructure (WORLD coordinates, sea level y = 0).
 * 4 legs OD 1.8 m, vertical through the topsides, battered 1:10 (both directions) below
 * the transition at y = 19 down to the seabed (~ -62). Horizontal frames at +12, -10, -30, -55,
 * X-braced faces, conductor guide frames + 6 well conductors, export risers on the east face with
 * riser guards, boat landing on the south face.
 * Fabrication detail (jacketDetail.ts): node cans + brace stubs + crossing cans at every joint, stand-off
 * anodes below the waterline, barge bumpers on the four legs, two J-tubes (power + fibre) down the west
 * face, caisson guides for the seawater-lift / firewater pump caissons and for the drain / disposal / dump
 * caissons (ALPHA_CAISSONS; their tops are on the cellar deck, cellarOutfit.ts).
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, boxMinMax, tube } from '../structure/batch'
import { ladder } from '../structure/ladder'
import { DECK } from '../structure/deckConst'
import { DECK_WORLD_Y } from '../../state/store'
import { lqFoamPoints } from './lqJacket'
import { whpFoamPoints } from './whpJacket'
import { rpFoamPoints, wiFoamPoints } from './satJacket'
import { anodesAlong, bargeBumper, braceStub, braceWithStubs, caissonGuide, cone, crossingCan, jTube, nearestOnSegments, nodeCan } from './jacketDetail'

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

/**
 * Caissons hanging from the cellar deck through the jacket (world x, z, radius, bottom y). `plant`: the
 * caisson is drawn by the plant's caisson pump (only the jacket guides are ours); the rest are env
 * geometry: the produced-water disposal caisson (3" PW-4306/4307), the open-drain sump caisson
 * (1" OD-4604), the closed-drain caisson (2" CD-4403 / CD-5106) and the seawater dump caisson (8" SW-6302).
 */
export const ALPHA_CAISSONS = [
  { id: 'P-6400A', x: 14, z: -6.5, r: 0.45, bottom: -10, plant: true, guides: [12, -10] },
  { id: 'P-6400B', x: 17, z: -6.5, r: 0.45, bottom: -10, plant: true, guides: [12, -10] },
  { id: 'P-7101A', x: 27.2, z: 11.5, r: 0.5, bottom: -10, plant: true, guides: [12, -10] },
  // (the 8" gas riser at x 27, z 14.75 runs through this caisson above about +12 m: bottom guide only)
  { id: 'P-7101B', x: 27.2, z: 15, r: 0.5, bottom: -10, plant: true, guides: [-10] },
  { id: 'PW-disposal', x: -29.1, z: 12.8, r: 0.36, bottom: -14, plant: false, guides: [12, -10] },
  { id: 'OD-sump', x: -15.6, z: 13.4, r: 0.6, bottom: -16, plant: false, guides: [12, -10] },
  { id: 'CD-caisson', x: -11.2, z: 15.8, r: 0.3, bottom: -12, plant: false, guides: [12, -10] },
  { id: 'SW-dump', x: 19.8, z: -7.2, r: 0.32, bottom: -12, plant: false, guides: [12, -10] },
]
/** J-tubes (power + fibre cables) down the west face: deck-plan (x at/above the kink, z), radius */
export const ALPHA_JTUBES = [
  { z: 2.0, r: 0.2 },
  { z: 3.6, r: 0.16 },
].map((j) => ({ ...j, x: -24 - 1.3 }))
/** barge bumpers: leg corner signs + stand-off from the leg axis */
const BUMPERS: { sx: number; sz: number }[] = [
  { sx: -1, sz: -1 },
  { sx: 1, sz: -1 },
  { sx: 1, sz: 1 },
  { sx: -1, sz: 1 },
]
const BUMPER_OFF = DECK.legOD / 2 + 1.25
/** cellar deck plate top (world); cellarDeck.ts CELLAR_Y (not imported: cellarDeck imports this module) */
const CELLAR_TOP = 20
const bumperAt = (sx: number, sz: number, y: number): V3 => {
  const p = legAt(sx, sz, y)
  return [p[0] + sx * Math.SQRT1_2 * BUMPER_OFF, y, p[2] + sz * Math.SQRT1_2 * BUMPER_OFF]
}
/** J-tube centre at height y (vertical above the kink, then parallel to the battered west face) */
const jTubeAt = (z: number) => (y: number): V3 => [legAt(-1, 1, Math.min(y, JACKET.kinkY))[0] - 1.3, y, z]

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
  // barge bumpers, J-tubes, caissons
  for (const b of BUMPERS) {
    const p = bumperAt(b.sx, b.sz, 0)
    out.push([p[0], p[2], 0.3])
  }
  for (const j of ALPHA_JTUBES) out.push([jTubeAt(j.z)(0)[0], j.z, j.r])
  for (const c of ALPHA_CAISSONS) out.push([c.x, c.z, c.r])
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
  const R = JACKET.legOD / 2
  const rb = JACKET.braceOD / 2
  const rf = JACKET.frameOD / 2
  const rp = JACKET.planOD / 2
  /** battered leg axis (for stub / can orientation) */
  const axis = (sx: number, sz: number): V3 => {
    const a = legAt(sx, sz, seabed)
    const b = legAt(sx, sz, kinkY)
    return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  }
  const LEG = (sx: number, sz: number) => ({ R, axis: axis(sx, sz) })
  const CHORD_X = { R: rf, axis: [1, 0, 0] as V3 }

  // legs: vertical part (cellar deck to underside of production deck) + battered part + stub on top
  for (const [sx, sz] of corners) {
    const a = legAt(sx, sz, kinkY)
    tube(jb.steel, a, [a[0], topY, a[2]], R, 36, true)
    tube(jb.steel, legAt(sx, sz, seabed), a, R, 36, true)
    // node cans (thicker, with conical transitions) at each frame
    for (const y of frames) nodeCan(jb.steel, legAt(sx, sz, y), axis(sx, sz), R, 3.0, 0.09, 28)
    // anodes from below the splash zone to the mudline (two azimuths, facing into the jacket)
    const inward = Math.atan2(-sz, -sx)
    anodesAlong(jb.anode, legAt(sx, sz, seabed + 2), legAt(sx, sz, -2), R, 6.5, -3, inward)
    anodesAlong(jb.anode, legAt(sx, sz, seabed + 2), legAt(sx, sz, -2), R, 6.5, -3, inward + Math.PI * 0.55)
  }

  // horizontal frames: perimeter + plan X-bracing + mid nodes on the long faces
  const frameSegs = new Map<number, [V3, V3][]>()
  for (const y of frames) {
    const P = corners.map(([sx, sz]) => legAt(sx, sz, y))
    const segs: [V3, V3][] = []
    for (let i = 0; i < 4; i++) {
      braceWithStubs(jb.steel, P[i], P[(i + 1) % 4], rf, 16, LEG(...corners[i]), LEG(...corners[(i + 1) % 4]))
      if (y < -2) anodesAlong(jb.anode, P[i], P[(i + 1) % 4], rf, 7, -3, i * 0.8)
      segs.push([P[i], P[(i + 1) % 4]])
    }
    braceWithStubs(jb.steel, P[0], P[2], rp, 12, LEG(...corners[0]), LEG(...corners[2]))
    braceWithStubs(jb.steel, P[1], P[3], rp, 12, LEG(...corners[1]), LEG(...corners[3]))
    segs.push([P[0], P[2]], [P[1], P[3]])
    frameSegs.set(y, segs)
    // conductor guide frame tied to the north perimeter member
    const zN = P[0][2]
    const g = { x0: -4.5, x1: 4.5, z0: -14.5, z1: -9.0 }
    const gy = y
    tube(jb.steel, [g.x0, gy, g.z0], [g.x1, gy, g.z0], 0.25, 10, true)
    tube(jb.steel, [g.x0, gy, g.z1], [g.x1, gy, g.z1], 0.25, 10, true)
    tube(jb.steel, [g.x0, gy, g.z0], [g.x0, gy, g.z1], 0.25, 10, true)
    tube(jb.steel, [g.x1, gy, g.z0], [g.x1, gy, g.z1], 0.25, 10, true)
    braceWithStubs(jb.steel, [g.x0, gy, g.z0], [g.x0 - 2, gy, zN], 0.28, 10, null, CHORD_X)
    braceWithStubs(jb.steel, [g.x1, gy, g.z0], [g.x1 + 2, gy, zN], 0.28, 10, null, CHORD_X)
    for (const [cx, cz] of JACKET.conductors) {
      // guide cones (short sleeve + lead-in cone) around each conductor
      tube(jb.steel, [cx, gy - 0.6, cz], [cx, gy + 0.6, cz], JACKET.conductorOD / 2 + 0.08, 14, true)
      cone(jb.steel, [cx, gy + 0.6, cz], [cx, gy + 0.95, cz], JACKET.conductorOD / 2 + 0.08, JACKET.conductorOD / 2 + 0.26, 14)
      bar(jb.steel, [cx, gy, g.z0], [cx, gy, g.z1], 0.12, 0.3)
    }
  }

  // X-bracing on the four faces between frames (long N/S faces split into two panels)
  const bays: [number, number][] = [
    [frames[0], frames[1]],
    [frames[1], frames[2]],
    [frames[2], frames[3]],
  ]
  bays.forEach(([yt, yb], bi) => {
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
        const panels: [V3, V3, V3, V3, boolean][] = [
          [A0, M0, A1, M1, true],
          [M0, B0, M1, B1, false],
        ]
        for (const [p, q, r, s, leftIsLeg] of panels) {
          // p→s and q→r; leg ends get leg stubs, mid-face ends land on the frame member
          const legEnd = leftIsLeg ? LEG(ax, az) : LEG(bx, bz)
          braceWithStubs(jb.steel, p, s, rb, 14, leftIsLeg ? legEnd : CHORD_X, leftIsLeg ? CHORD_X : legEnd)
          braceWithStubs(jb.steel, q, r, rb, 14, leftIsLeg ? CHORD_X : legEnd, leftIsLeg ? legEnd : CHORD_X)
          crossingCan(jb.steel, p, s, rb, 14)
          anodesAlong(jb.anode, p, s, rb, 7.5, -3, i + bi)
          anodesAlong(jb.anode, q, r, rb, 7.5, -3, i + bi + 1.4)
        }
        braceWithStubs(jb.steel, M0, M1, rb - 0.1, 14, CHORD_X, CHORD_X)
      } else {
        braceWithStubs(jb.steel, A0, B1, rb, 14, LEG(ax, az), LEG(bx, bz))
        braceWithStubs(jb.steel, B0, A1, rb, 14, LEG(bx, bz), LEG(ax, az))
        crossingCan(jb.steel, A0, B1, rb, 14)
        anodesAlong(jb.anode, A0, B1, rb, 7.5, -3, i + bi)
        anodesAlong(jb.anode, B0, A1, rb, 7.5, -3, i + bi + 1.4)
      }
    }
  })
  // top bay (frame +12 to kink): K-braces to the cellar-deck girders
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    const A = legAt(ax, az, frames[0])
    const B = legAt(bx, bz, frames[0])
    const top: V3 = [(ax * 24 + bx * 24) / 2, 19.3, (az * 17 + bz * 17) / 2]
    tube(jb.steel, A, top, 0.35, 12, true)
    tube(jb.steel, B, top, 0.35, 12, true)
    braceStub(jb.steel, A, top, 0.35, R, axis(ax, az))
    braceStub(jb.steel, B, top, 0.35, R, axis(bx, bz))
  }

  // well conductors from seabed to the cellar deck underside
  for (const [x, z] of JACKET.conductors) tube(jb.steel, [x, seabed, z], [x, 19.4, z], JACKET.conductorOD / 2, 18, true)

  // barge bumpers on the four legs (diagonally outboard, through the splash zone)
  for (const b of BUMPERS) bargeBumper(jb.steel, (y) => legAt(b.sx, b.sz, y), [b.sx * Math.SQRT1_2, b.sz * Math.SQRT1_2], BUMPER_OFF)

  // J-tubes (power + fibre-optic cables) down the west face, bending out west at the mudline
  for (const j of ALPHA_JTUBES) {
    jTube(jb.riser, jb.steel, jTubeAt(j.z), CELLAR_TOP + 0.55, seabed + 5.5, [-1, 0], j.r, [...frames, 16.5].filter((y) => y > seabed + 6), (y) => [legAt(-1, 1, Math.min(y, kinkY))[0], y, j.z])
  }

  // caissons hanging from the cellar deck (env ones) + guides on every caisson at the frame levels
  for (const c of ALPHA_CAISSONS) {
    if (!c.plant) {
      tube(jb.steel, [c.x, c.bottom, c.z], [c.x, CELLAR_TOP - 0.05, c.z], c.r, 16, true)
      cone(jb.steel, [c.x, c.bottom, c.z], [c.x, c.bottom - 0.5, c.z], c.r, c.r * 0.55, 14)
    }
    for (const y of c.guides) {
      const segs = frameSegs.get(y)
      if (!segs) continue
      caissonGuide(jb.steel, c.x, c.z, y, c.r, nearestOnSegments([c.x, y, c.z], segs))
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
      // split clamp: bolted lugs either side
      for (const s of [-1, 1]) boxMinMax(jb.riser, [xr - 0.035, y - 0.22, r.z + s * (rr + 0.04)], [xr + 0.035, y + 0.22, r.z + s * (rr + 0.2)])
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
