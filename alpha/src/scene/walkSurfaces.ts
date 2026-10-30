/**
 * Walkable surfaces that join the decks: stair flights (sloped), stair landings, ladders (steep
 * ramps), and raised flat areas (accommodation roof, helideck). Generated from the very definitions
 * that draw the stairs, so the walker climbs exactly where the treads are. Deck-local heights.
 *
 * A surface is a plan rectangle whose height varies linearly along one axis (flat when y0 = y1). The
 * walker stands on whichever surface or deck level at its position is closest to its current feet
 * height — so you can only step onto a flight from the end that meets you, and stacked landings
 * never get confused.
 */
import type { Plant, PlanRect } from '../model/types'
import { STAIR, STAIR_TOWERS } from './structure/stairs'
import { LQ_DECK_STAIR } from './env/accommodation'
import { LQ_ESCAPE_STAIR, LQ_HELI_Y, LQ_ROOF_Y } from './env/lqQuarters'
import { WHP_STAIR } from './env/whpDeck'
import { RP_STAIR, WI_STAIR } from './env/satDeck'
import { LQ } from '../model/site'
import { DECK_WORLD_Y } from '../state/store'

export interface WalkSurface extends PlanRect {
  /** height (deck-local) at coordinate `a` along `axis`, and at `b` */
  y0: number
  y1: number
  axis: 'x' | 'z'
  a: number
  b: number
  kind: 'flight' | 'landing' | 'ladder' | 'area'
}

export function surfaceHeight(s: WalkSurface, x: number, z: number) {
  if (s.y0 === s.y1) return s.y0
  const c = s.axis === 'x' ? x : z
  const t = Math.max(0, Math.min(1, (c - s.a) / (s.b - s.a)))
  return s.y0 + (s.y1 - s.y0) * t
}

interface SwitchBack {
  o: [number, number]
  u: [number, number]
  v: [number, number]
  L: number
  W: number
  landing: number
  lanes: [number, number][]
  levels: number[]
  flights: number[]
  reach?: (y: number) => number
}

/** flights + landings of a switch-back stair (the same sequence the builders draw) */
function switchBack(t: SwitchBack, yOff: number): WalkSurface[] {
  const out: WalkSurface[] = []
  const pt = (u: number, v: number) => [t.o[0] + t.u[0] * u + t.v[0] * v, t.o[1] + t.u[1] * u + t.v[1] * v] as [number, number]
  const rect = (u0: number, u1: number, v0: number, v1: number): PlanRect => {
    const [ax, az] = pt(u0, v0)
    const [bx, bz] = pt(u1, v1)
    return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) }
  }
  const axis: 'x' | 'z' = t.u[0] !== 0 ? 'x' : 'z'
  const along = (u: number) => (axis === 'x' ? pt(u, 0)[0] : pt(u, 0)[1])
  let end: 'A' | 'B' = 'A'
  let y = t.levels[0]
  let idx = 0
  const landing = (e: 'A' | 'B', yy: number, main: boolean) => {
    const r0 = main && e === 'A' ? -(t.reach?.(yy) ?? 0) : 0
    const r = rect(e === 'A' ? 0 : t.L - t.landing, e === 'A' ? t.landing : t.L, r0, t.W)
    out.push({ ...r, y0: yy - yOff, y1: yy - yOff, axis, a: 0, b: 1, kind: 'landing' })
  }
  landing('A', y, true)
  for (let s = 0; s < t.levels.length - 1; s++) {
    const n = t.flights[s]
    const rise = (t.levels[s + 1] - t.levels[s]) / n
    for (let k = 0; k < n; k++) {
      const [v0, v1] = t.lanes[idx % 2]
      const uS = end === 'A' ? t.landing : t.L - t.landing
      const uE = end === 'A' ? t.L - t.landing : t.landing
      out.push({ ...rect(Math.min(uS, uE), Math.max(uS, uE), v0, v1), y0: y - yOff, y1: y + rise - yOff, axis, a: along(uS), b: along(uE), kind: 'flight' })
      y += rise
      end = end === 'A' ? 'B' : 'A'
      landing(end, y, k === n - 1)
      idx++
    }
  }
  return out
}

let cache: { plant: Plant; s: WalkSurface[] } | null = null

/** Everything climbable in a plant (Alpha field: stair towers, LQ / WHP stairs, the rig ladder, LQ roof + helideck). */
export function walkSurfaces(plant: Plant): WalkSurface[] {
  if (cache?.plant === plant) return cache.s
  const s: WalkSurface[] = []
  if ((plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha') {
    // Alpha stair towers: cellar → production → weather deck (deck-local already)
    for (const t of STAIR_TOWERS)
      s.push(...switchBack({ o: [t.edgeX, t.zA], u: [0, t.uDir], v: [t.outward, 0], L: STAIR.L, W: STAIR.W, landing: STAIR.landing, lanes: STAIR.lanes, levels: t.levels, flights: t.flights }, 0))
    // accommodation: deck ↔ cellar stair; escape stair to every storey, the roof and the helideck
    s.push(...switchBack(LQ_DECK_STAIR, DECK_WORLD_Y))
    s.push(...switchBack(LQ_ESCAPE_STAIR, DECK_WORLD_Y))
    const q = LQ.quarters
    s.push({ x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, y0: LQ_ROOF_Y - DECK_WORLD_Y, y1: LQ_ROOF_Y - DECK_WORLD_Y, axis: 'x', a: 0, b: 1, kind: 'area' })
    const h = LQ.helideck
    const r = h.r * Math.SQRT1_2
    s.push({ x0: h.x - r, x1: h.x + r, z0: h.z - r, z1: h.z + r, y0: LQ_HELI_Y - DECK_WORLD_Y, y1: LQ_HELI_Y - DECK_WORLD_Y, axis: 'x', a: 0, b: 1, kind: 'area' })
    // helideck edge (the escape stair's top landing reaches it on the east side)
    s.push({ x0: h.x + r, x1: h.x + h.r * Math.cos(Math.PI / 8), z0: h.z - 3.5, z1: h.z + 3.5, y0: LQ_HELI_Y - DECK_WORLD_Y, y1: LQ_HELI_Y - DECK_WORLD_Y, axis: 'x', a: 0, b: 1, kind: 'area' })
    // wellhead platform deck ↔ cellar
    s.push(...switchBack(WHP_STAIR, DECK_WORLD_Y))
    // riser platform (north edge) and water-injection platform (west edge): deck ↔ cellar
    s.push(...switchBack(RP_STAIR, DECK_WORLD_Y))
    s.push(...switchBack(WI_STAIR, DECK_WORLD_Y))
    // drilling rig: NE caged ladder, weather deck (10) → drill floor (18), climbed facing west
    s.push({ x0: 9.45, x1: 10.7, z0: -17.9, z1: -17.1, y0: 10, y1: 18, axis: 'x', a: 10.7, b: 9.5, kind: 'ladder' })
  }
  cache = { plant, s }
  return s
}
