/**
 * Axis-aligned switch-back stair tower for the LQ platform (WORLD coordinates). A generalised, lighter
 * version of structure/stairs.ts that can face any of the four plan directions and serve any number of
 * levels (deck-to-cellar stair, accommodation escape stair, helideck access).
 *
 * Tower frame: u along the tower from end A (u = 0) to end B (u = L), v outward from the attach line
 * (v = 0). Main landings are at end A.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, box, ibeam } from '../structure/batch'
import { railRun, type RailBatches } from '../structure/handrail'
import { gratingRect, type GratingBatches } from '../structure/panels'

export interface LqStairDef {
  /** (x, z) of end A on the attach line */
  o: [number, number]
  /** unit plan vector along the tower (axis aligned) */
  u: [number, number]
  /** unit plan vector outward from the attach line (axis aligned) */
  v: [number, number]
  L: number
  W: number
  landing: number
  lanes: [number, number][]
  /** main levels (world y) */
  levels: number[]
  /** flights between consecutive main levels (even -> every main landing is at end A) */
  flights: number[]
  /** main landing at this level has no guard rail on its v = 0 side (deck / door access) */
  openV0?: (y: number) => boolean
  /** main landing at this level has no guard rail across end A */
  openEndA?: (y: number) => boolean
  /** main landing at this level extends towards -v by this much (to reach a wall door) */
  reach?: (y: number) => number
  /** column foot (world y); default lowest level - 0.35 */
  colBottom?: number
}

export interface LqStairBatches extends RailBatches {
  steel: GeoBatch
  grating: GratingBatches
  nosing: GeoBatch
}

export const LQ_STAIR = {
  lanes: [
    [0.15, 1.25],
    [1.45, 2.55],
  ] as [number, number][],
}

/** Plan rectangle (x0, z0, x1, z1) of a (u, v) range. */
export function stairRect(t: LqStairDef, u0: number, u1: number, v0: number, v1: number) {
  const ax = t.o[0] + t.u[0] * u0 + t.v[0] * v0
  const az = t.o[1] + t.u[1] * u0 + t.v[1] * v0
  const bx = t.o[0] + t.u[0] * u1 + t.v[0] * v1
  const bz = t.o[1] + t.u[1] * u1 + t.v[1] * v1
  return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) }
}

export function buildLqStair(t: LqStairDef, sb: LqStairBatches) {
  const { L, W, landing } = t
  const P = (u: number, y: number, v: number): V3 => [t.o[0] + t.u[0] * u + t.v[0] * v, y, t.o[1] + t.u[1] * u + t.v[1] * v]

  type Flight = { from: 'A' | 'B'; y0: number; y1: number; lane: number }
  const flights: Flight[] = []
  const landings: { end: 'A' | 'B'; y: number; main: boolean }[] = [{ end: 'A', y: t.levels[0], main: true }]
  let end: 'A' | 'B' = 'A'
  let y = t.levels[0]
  let idx = 0
  for (let s = 0; s < t.levels.length - 1; s++) {
    const n = t.flights[s]
    const rise = (t.levels[s + 1] - t.levels[s]) / n
    for (let k = 0; k < n; k++) {
      flights.push({ from: end, y0: y, y1: y + rise, lane: idx % 2 })
      y += rise
      end = end === 'A' ? 'B' : 'A'
      landings.push({ end, y, main: k === n - 1 })
      idx++
    }
  }

  // columns
  const yBot = t.colBottom ?? t.levels[0] - 0.35
  const yTop = t.levels[t.levels.length - 1] + 1.15
  for (const [u, v] of [
    [0.1, 0.1],
    [0.1, W - 0.1],
    [L - 0.1, 0.1],
    [L - 0.1, W - 0.1],
  ] as [number, number][])
    ibeam(sb.steel, P(u, yBot, v), P(u, v < 1 ? yTop - 1.15 : yTop, v), [t.u[0], 0, t.u[1]], 'HEB 200')
  // X-bracing on the outer face between main landings
  const mains = landings.filter((l) => l.end === 'A').map((l) => l.y - 0.2)
  for (let i = 0; i < mains.length - 1; i++) {
    const vO = W - 0.1
    bar(sb.steel, P(0.2, mains[i], vO), P(L - 0.2, mains[i + 1], vO), 0.06, 0.06)
    bar(sb.steel, P(L - 0.2, mains[i], vO), P(0.2, mains[i + 1], vO), 0.06, 0.06)
  }

  // landings
  for (const l of landings) {
    const isMainA = l.main && l.end === 'A'
    const r0 = isMainA ? -(t.reach?.(l.y) ?? 0) : 0
    const u0 = l.end === 'A' ? 0 : L - landing
    const u1 = l.end === 'A' ? landing : L
    const r = stairRect(t, u0, u1, r0 + 0.02, W - 0.02)
    gratingRect(sb.grating, r.x0, r.z0, r.x1, r.z1, l.y)
    const yc = l.y - 0.11
    bar(sb.steel, P(u0, yc, r0 + 0.05), P(u1, yc, r0 + 0.05), 0.065, 0.16)
    bar(sb.steel, P(u0, yc, W - 0.05), P(u1, yc, W - 0.05), 0.065, 0.16)
    bar(sb.steel, P(u0 + 0.03, yc, r0 + 0.05), P(u0 + 0.03, yc, W - 0.05), 0.065, 0.16)
    bar(sb.steel, P(u1 - 0.03, yc, r0 + 0.05), P(u1 - 0.03, yc, W - 0.05), 0.065, 0.16)

    const uEnd = l.end === 'A' ? 0.04 : L - 0.04
    const uIn = l.end === 'A' ? landing : L - landing
    if (!(isMainA && t.openEndA?.(l.y))) railRun(sb, P(uEnd, l.y, r0 + 0.04), P(uEnd, l.y, W - 0.04))
    railRun(sb, P(u0, l.y, W - 0.04), P(u1, l.y, W - 0.04), { startPost: l.end === 'B', endPost: l.end === 'A' })
    const v0Open = isMainA && (t.openV0?.(l.y) || r0 < 0)
    if (!v0Open) railRun(sb, P(u0, l.y, 0.04), P(u1, l.y, 0.04), { startPost: l.end === 'B', endPost: l.end === 'A' })
    for (let lane = 0; lane < t.lanes.length; lane++) {
      const connected = flights.some((f) => f.lane === lane && ((f.from === l.end && Math.abs(f.y0 - l.y) < 1e-3) || (f.from !== l.end && Math.abs(f.y1 - l.y) < 1e-3)))
      if (!connected) {
        const [v0, v1] = t.lanes[lane]
        railRun(sb, P(uIn, l.y, v0 - 0.08), P(uIn, l.y, v1 + 0.08))
      }
    }
  }

  // flights
  for (const f of flights) {
    const [v0, v1] = t.lanes[f.lane]
    const uS = f.from === 'A' ? landing : L - landing
    const uE = f.from === 'A' ? L - landing : landing
    const s = Math.sign(uE - uS)
    const run = Math.abs(uE - uS)
    const n = Math.max(2, Math.round((f.y1 - f.y0) / 0.19))
    const rr = (f.y1 - f.y0) / n
    const g = run / (n - 1)
    const nose = (u: number) => f.y0 + rr + (s * (u - uS) * rr) / g
    for (let k = 1; k <= n - 1; k++) {
      const yk = f.y0 + k * rr
      const ua = uS + s * (k - 1) * g
      const ub = uS + s * k * g + s * 0.02
      const q = stairRect(t, Math.min(ua, ub), Math.max(ua, ub), v0, v1)
      gratingRect(sb.grating, q.x0, q.z0, q.x1, q.z1, yk)
      const a = P(ua + s * 0.02, yk - 0.013, v0 + 0.004)
      const b = P(ua + s * 0.02, yk - 0.013, v1 - 0.004)
      box(sb.nosing, [(a[0] + b[0]) / 2, yk - 0.013, (a[2] + b[2]) / 2], [Math.max(Math.abs(b[0] - a[0]), 0.04), 0.03, Math.max(Math.abs(b[2] - a[2]), 0.04)])
    }
    // stringers (flat 200 x 12 plates following the nosing line)
    const ua = uS - s * 0.28
    const ub = uE + s * 0.06
    for (const v of [v0 - 0.03, v1 + 0.03]) bar(sb.steel, P(ua, nose(ua) - 0.14, v), P(ub, nose(ub) - 0.14, v), 0.012, 0.2)
    for (const v of [v0 - 0.075, v1 + 0.075]) railRun(sb, P(uS, nose(uS) - 0.06, v), P(uE, nose(uE) - 0.06, v), { kick: false, top: 1.0 })
  }
}
