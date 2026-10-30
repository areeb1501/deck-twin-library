/**
 * Switch-back stair towers, cantilevered outboard of the deck edge. Each tower runs from the
 * cellar deck (deck-local y = -8) through the production deck (y = 0) to the upper deck (y = 10).
 * All main landings are at "end A", directly abutting the deck edge (where the handrail has a gap).
 *
 * Tower frame: u along the deck edge (from end A to end B), v outward from the deck edge.
 */
import type { GeoBatch, V3 } from './batch'
import { angle, channel, ibeam, tube, box } from './batch'
import { railRun, type RailBatches } from './handrail'
import { gratingRect, type GratingBatches } from './panels'

export interface StairTowerDef {
  id: string
  /** deck-edge x the tower is attached to */
  edgeX: number
  /** +1 tower extends to +X of the edge, -1 to -X */
  outward: 1 | -1
  /** z of end A (u = 0) */
  zA: number
  /** direction of +u in world z */
  uDir: 1 | -1
  /** main deck levels (deck-local y) served */
  levels: number[]
  /** flights between consecutive main levels */
  flights: number[]
}

export const STAIR = {
  L: 5.6, // tower length along the edge
  W: 2.7, // tower width outward
  landing: 1.3,
  lanes: [
    [0.15, 1.25],
    [1.45, 2.55],
  ] as [number, number][],
}

export const STAIR_TOWERS: StairTowerDef[] = [
  { id: 'ST-W', edgeX: -30, outward: -1, zA: 9.0, uDir: 1, levels: [-8, 0, 10], flights: [4, 4] },
  { id: 'ST-E', edgeX: 30, outward: 1, zA: -13.6, uDir: -1, levels: [-8, 0, 10], flights: [4, 4] },
]

/** z-interval of the deck-edge opening for a tower (same at every main level). */
export function towerGap(t: StairTowerDef): [number, number] {
  const a = t.zA + t.uDir * 0.18
  const b = t.zA + t.uDir * (STAIR.landing - 0.02)
  return [Math.min(a, b), Math.max(a, b)]
}

/** Plan footprint of a tower (x0, z0, x1, z1). */
export function towerFootprint(t: StairTowerDef) {
  const xa = t.edgeX
  const xb = t.edgeX + t.outward * STAIR.W
  const za = t.zA
  const zb = t.zA + t.uDir * STAIR.L
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) }
}

export interface StairBatches extends RailBatches {
  steel: GeoBatch
  grating: GratingBatches
  nosing: GeoBatch
  lamp?: GeoBatch
  lampBody?: GeoBatch
}

interface Flight {
  from: 'A' | 'B'
  y0: number
  y1: number
  lane: 0 | 1
}

export function buildStairTower(t: StairTowerDef, sb: StairBatches) {
  const { L, W, landing } = STAIR
  const P = (u: number, y: number, v: number): V3 => [t.edgeX + t.outward * v, y, t.zA + t.uDir * u]
  /** world-axis rect from (u, v) ranges */
  const rectUV = (u0: number, u1: number, v0: number, v1: number) => {
    const a = P(u0, 0, v0)
    const b = P(u1, 0, v1)
    return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]) }
  }

  // ---- flights & landings
  const flights: Flight[] = []
  const landings: { end: 'A' | 'B'; y: number; main: boolean }[] = [{ end: 'A', y: t.levels[0], main: true }]
  let end: 'A' | 'B' = 'A'
  let y = t.levels[0]
  let idx = 0
  for (let s = 0; s < t.levels.length - 1; s++) {
    const n = t.flights[s]
    const rise = (t.levels[s + 1] - t.levels[s]) / n
    for (let k = 0; k < n; k++) {
      flights.push({ from: end, y0: y, y1: y + rise, lane: (idx % 2) as 0 | 1 })
      y += rise
      end = end === 'A' ? 'B' : 'A'
      landings.push({ end, y, main: k === n - 1 })
      idx++
    }
  }

  const steelUp: V3 = [0, 1, 0]

  // ---- columns (HEB 200) at the four corners
  const yBot = t.levels[0] - 0.35
  const yTop = t.levels[t.levels.length - 1] - 0.03
  const cols: [number, number][] = [
    [0.1, 0.1],
    [0.1, W - 0.1],
    [L - 0.1, 0.1],
    [L - 0.1, W - 0.1],
  ]
  for (const [u, v] of cols) ibeam(sb.steel, P(u, yBot, v), P(u, yTop, v), [1, 0, 0], 'HEB 200')

  // ---- X-bracing on outer face and both end faces between landing levels at end A
  const braceLevels = landings.filter((l) => l.end === 'A').map((l) => l.y - 0.2)
  for (let i = 0; i < braceLevels.length - 1; i++) {
    const ya = braceLevels[i]
    const yb = braceLevels[i + 1]
    const vO = W - 0.1
    angle(sb.steel, P(0.2, ya, vO), P(L - 0.2, yb, vO), [0, 0, 1], 0.08, 0.008)
    angle(sb.steel, P(L - 0.2, ya, vO), P(0.2, yb, vO), [0, 0, 1], 0.08, 0.008)
    for (const u of [0.1, L - 0.1]) {
      angle(sb.steel, P(u, ya, 0.25), P(u, yb, W - 0.25), [1, 0, 0], 0.08, 0.008)
    }
  }

  // ---- landings
  const chan = (a: V3, b: V3) => channel(sb.steel, a, b, steelUp, 0.16, 0.065, 0.0075, 0.0105, 1)
  for (const l of landings) {
    const u0 = l.end === 'A' ? 0 : L - landing
    const u1 = l.end === 'A' ? landing : L
    const r = rectUV(u0, u1, 0.02, W - 0.02)
    gratingRect(sb.grating, r.x0, r.z0, r.x1, r.z1, l.y)
    const yc = l.y - 0.03 - 0.08
    // perimeter frame
    chan(P(u0, yc, 0.05), P(u1, yc, 0.05))
    chan(P(u0, yc, W - 0.05), P(u1, yc, W - 0.05))
    chan(P(u0, yc, 0.05), P(u0, yc, W - 0.05))
    chan(P(u1, yc, 0.05), P(u1, yc, W - 0.05))
    chan(P((u0 + u1) / 2, yc, 0.05), P((u0 + u1) / 2, yc, W - 0.05))

    // landing guard rails
    const uEnd = l.end === 'A' ? 0.04 : L - 0.04
    const uIn = l.end === 'A' ? landing : L - landing
    railRun(sb, P(uEnd, l.y, 0.04), P(uEnd, l.y, W - 0.04))
    railRun(sb, P(u0 + 0.0, l.y, W - 0.04), P(u1, l.y, W - 0.04), { startPost: l.end === 'B', endPost: l.end === 'A' })
    const deckAccess = l.main && l.end === 'A'
    if (!deckAccess) railRun(sb, P(u0, l.y, 0.04), P(u1, l.y, 0.04), { startPost: l.end === 'B', endPost: l.end === 'A' })
    // lanes with no flight connecting at this landing get a rail across the open stair well
    for (const lane of [0, 1] as const) {
      const connected = flights.some(
        (f) => f.lane === lane && ((f.from === l.end && Math.abs(f.y0 - l.y) < 1e-3) || (f.from !== l.end && Math.abs(f.y1 - l.y) < 1e-3)),
      )
      if (!connected) {
        const [v0, v1] = STAIR.lanes[lane]
        railRun(sb, P(uIn, l.y, v0 - 0.08), P(uIn, l.y, v1 + 0.08))
      }
    }
    // landing light on the outer end column at main landings
    if (l.main && sb.lamp && sb.lampBody) {
      const c = P(l.end === 'A' ? 0.1 : L - 0.1, l.y + 2.3, W - 0.1)
      const o = P(l.end === 'A' ? 0.1 : L - 0.1, l.y + 2.3, W - 0.45)
      tube(sb.lampBody, c, o, 0.02, 6)
      box(sb.lampBody, [o[0], o[1] + 0.06, o[2]], [0.22, 0.12, 0.22])
      box(sb.lamp, [o[0], o[1] - 0.03, o[2]], [0.18, 0.06, 0.18])
    }
  }

  // ---- flights
  for (const f of flights) {
    const [v0, v1] = STAIR.lanes[f.lane]
    const uS = f.from === 'A' ? landing : L - landing
    const uE = f.from === 'A' ? L - landing : landing
    const s = Math.sign(uE - uS)
    const run = Math.abs(uE - uS)
    const n = Math.max(2, Math.round((f.y1 - f.y0) / 0.19))
    const r = (f.y1 - f.y0) / n
    const g = run / (n - 1)
    const nose = (u: number) => f.y0 + r + (s * (u - uS) * r) / g

    // treads
    for (let k = 1; k <= n - 1; k++) {
      const yk = f.y0 + k * r
      const ua = uS + s * (k - 1) * g
      const ub = uS + s * k * g + s * 0.02 // small overlap under the next nosing
      const rr = rectUV(Math.min(ua, ub), Math.max(ua, ub), v0, v1)
      gratingRect(sb.grating, rr.x0, rr.z0, rr.x1, rr.z1, yk)
      // anti-slip yellow nosing bar at the leading edge (2 mm proud of grating)
      const un = ua + s * 0.02
      const a = P(un, yk - 0.013, v0 + 0.004)
      const b = P(un, yk - 0.013, v1 - 0.004)
      box(sb.nosing, [(a[0] + b[0]) / 2, yk - 0.013, (a[2] + b[2]) / 2], [Math.abs(b[0] - a[0]) + 0.0, 0.03, 0.04].map((v, i) => (i === 0 ? Math.max(v, 0.04) : v)) as V3)
      // tread end plates
      for (const v of [v0 + 0.004, v1 - 0.004]) {
        const pa = P(ua, yk - 0.03, v)
        const pb = P(ub, yk - 0.03, v)
        box(sb.steel, [(pa[0] + pb[0]) / 2, yk - 0.03, (pa[2] + pb[2]) / 2], [0.008, 0.06, Math.abs(pb[2] - pa[2])])
      }
    }
    // stringers: channels following the nosing line
    const ua = uS - s * 0.28
    const ub = uE + s * 0.06
    for (const [v, side] of [
      [v0 - 0.035, -1],
      [v1 + 0.035, 1],
    ] as [number, number][]) {
      const A = P(ua, nose(ua) - 0.14, v)
      const B = P(ub, nose(ub) - 0.14, v)
      // flanges face away from the treads
      const open = side * t.outward * s * t.uDir * -1
      channel(sb.steel, A, B, steelUp, 0.2, 0.075, 0.0085, 0.0115, open)
    }
    // flight guard rails, both sides
    for (const v of [v0 - 0.075, v1 + 0.075]) {
      railRun(sb, P(uS, nose(uS) - 0.06, v), P(uE, nose(uE) - 0.06, v), { kick: false, top: 1.0 })
    }
  }
}
