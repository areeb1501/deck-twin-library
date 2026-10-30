/**
 * Routes for the walker's autopilot (guided tour):
 *   · planPath  — A* across one walk level (same walkable test the walker uses), kept off the
 *                 equipment where there is room, then string-pulled into a few straight legs
 *   · stairPath — the flights of a stair / ladder between two heights, as hard anchors: onto each
 *                 flight in its lane, off it onto the landing, across to the next lane
 */
import type { Plant, PlanRect } from '../model/types'
import { blockers, walkLevels, type AutoPt } from './Walk'
import { walkSurfaces } from './walkSurfaces'
import { DECK } from './structure/deckConst'
import { RACK } from './structure/rack'
import { RP, WEATHER_FLOOR, WI } from '../model/site'
import { CELLAR_OUTFIT_FOOTPRINTS, RIG_FLOOR_FOOTPRINTS, SAT_CELLAR_FOOTPRINTS, WHP_CELLAR_OUTFIT_FOOTPRINTS } from './env/outfitFootprints'

const CELL = 0.4

/** A* across level `li` from → to; null when there is no way (the points snap to the nearest free cell). `avoid`: extra areas to route around. */
export function planPath(p: Plant, li: number, from: [number, number], to: [number, number], doors?: Record<string, boolean>, avoid: PlanRect[] = []): AutoPt[] | null {
  const lv = walkLevels(p)[li]
  if (!lv) return null
  const block = [...blockers(p, li, doors), ...steel(p, lv.y), ...avoid]
  // The field level is ~130 × 240 m: grid only the bounding box of start + goal plus a margin (growing if
  // that fails), and test cells only against the areas / blockers that overlap that box.
  for (const margin of [16, 48, Infinity]) {
    const box = searchBox(lv.areas, from, to, margin)
    const hit = (r: PlanRect) => r.x1 > box.x0 && r.x0 < box.x1 && r.z1 > box.z0 && r.z0 < box.z1
    const areas = lv.areas.filter(hit).map((a) => ({ x0: a.x0 - 1e-6, x1: a.x1 + 1e-6, z0: a.z0 - 1e-6, z1: a.z1 + 1e-6 }))
    const bl = block.filter(hit)
    const inside = (fs: PlanRect[], x: number, z: number) => fs.some((f) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1)
    // same test as Walk.tsx walkable(), on the clipped lists
    const ok = (x: number, z: number) => inside(areas, x, z) && !inside(bl, x, z)
    const r = search(box, ok, from, to)
    if (r) return r.map(([x, z]) => ({ x, z, y: lv.y }))
    if (box.whole) break
  }
  return null
}

/** the same open-deck test planPath routes with: on the level, clear of equipment and steel */
export function routeTest(p: Plant, li: number): (x: number, z: number) => boolean {
  const lv = walkLevels(p)[li]
  if (!lv) return () => false
  const block = [...blockers(p, li), ...steel(p, lv.y)]
  const inside = (fs: PlanRect[], x: number, z: number) => fs.some((f) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1)
  return (x, z) => inside(lv.areas, x, z) && !inside(block, x, z)
}

/** search window: start + goal bounding box grown by `margin`, clipped to the level */
function searchBox(areas: PlanRect[], from: [number, number], to: [number, number], margin: number) {
  const ax0 = Math.min(...areas.map((a) => a.x0))
  const ax1 = Math.max(...areas.map((a) => a.x1))
  const az0 = Math.min(...areas.map((a) => a.z0))
  const az1 = Math.max(...areas.map((a) => a.z1))
  const x0 = Math.max(ax0, Math.min(from[0], to[0]) - margin)
  const x1 = Math.min(ax1, Math.max(from[0], to[0]) + margin)
  const z0 = Math.max(az0, Math.min(from[1], to[1]) - margin)
  const z1 = Math.min(az1, Math.max(from[1], to[1]) + margin)
  return { x0, x1, z0, z1, whole: x0 <= ax0 && x1 >= ax1 && z0 <= az0 && z1 >= az1 }
}

/** Steel the walker would otherwise walk through (the walk test lets you; a tour shouldn't): Alpha's jacket legs, deck columns, rack posts; the RP / WI legs through their cellar decks */
function steel(p: Plant, y: number): PlanRect[] {
  if ((p.deck.site ?? 'offshoreAlpha') !== 'offshoreAlpha') return []
  const sq = (x: number, z: number, r: number): PlanRect => ({ x0: x - r, x1: x + r, z0: z - r, z1: z + r })
  const out: PlanRect[] = []
  if (y === -8 || y === 0 || y === 10) for (const [x, z] of DECK.legs) out.push(sq(x, z, DECK.legOD / 2 + 0.4))
  // floor-standing environment outfit on the cellar decks (scene/env/cellarOutfit.ts, whpCellarOutfit.ts)
  if (y === -8) out.push(...CELLAR_OUTFIT_FOOTPRINTS, ...WHP_CELLAR_OUTFIT_FOOTPRINTS, ...SAT_CELLAR_FOOTPRINTS)
  // ... and on the drill floor (scene/env/drillingRig.ts buildRigOutfit)
  if (y === WEATHER_FLOOR + 8) out.push(...RIG_FLOOR_FOOTPRINTS)
  if (y === 0) {
    for (const [x, z] of DECK.columns) out.push(sq(x, z, 0.6))
    for (const x of RACK.bents) for (const z of [RACK.zMin, RACK.zMax]) out.push(sq(x, z, 0.5))
  }
  // satellite legs (OD 1.4) stop under the main-deck plate, so they stand on the cellar decks only
  if (y === RP.cellarY) for (const [x, z] of [...RP.legs, ...WI.legs]) out.push(sq(x, z, 0.7 + 0.4))
  return out
}

function search(box: { x0: number; x1: number; z0: number; z1: number }, ok: (x: number, z: number) => boolean, from: [number, number], to: [number, number]): [number, number][] | null {
  const { x0: bx0, x1: bx1, z0: bz0, z1: bz1 } = box
  const W = Math.max(1, Math.ceil((bx1 - bx0) / CELL))
  const H = Math.max(1, Math.ceil((bz1 - bz0) / CELL))
  const cx = (i: number) => bx0 + (i + 0.5) * CELL
  const cz = (j: number) => bz0 + (j + 0.5) * CELL
  const free = new Uint8Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) free[j * W + i] = ok(cx(i), cz(j)) ? 1 : 0
  // cells within ~0.8 m of an obstacle cost more: the route keeps to the middle of aisles and bridges
  const near = new Uint8Array(W * H)
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (!free[j * W + i]) continue
      let n = 0
      for (let dj = -2; dj <= 2 && !n; dj++)
        for (let di = -2; di <= 2; di++) {
          const a = i + di
          const b = j + dj
          if (a < 0 || b < 0 || a >= W || b >= H || !free[b * W + a]) {
            n = 1
            break
          }
        }
      near[j * W + i] = n
    }
  const cellOf = (x: number, z: number): number => {
    const i = Math.min(W - 1, Math.max(0, Math.floor((x - bx0) / CELL)))
    const j = Math.min(H - 1, Math.max(0, Math.floor((z - bz0) / CELL)))
    return j * W + i
  }
  /** nearest free cell (rings outward) */
  const snap = (c: number) => {
    if (free[c]) return c
    const i0 = c % W
    const j0 = (c - i0) / W
    for (let r = 1; r < 25; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
          const a = i0 + di
          const b = j0 + dj
          if (a >= 0 && b >= 0 && a < W && b < H && free[b * W + a]) return b * W + a
        }
    return -1
  }
  const s = snap(cellOf(from[0], from[1]))
  const g = snap(cellOf(to[0], to[1]))
  if (s < 0 || g < 0) return null
  const gi = g % W
  const gj = (g - gi) / W
  const h = (c: number) => Math.hypot((c % W) - gi, Math.floor(c / W) - gj)
  const cost = new Float32Array(W * H).fill(Infinity)
  const prev = new Int32Array(W * H).fill(-1)
  const heap = new Heap()
  cost[s] = 0
  heap.push(s, h(s))
  let found = false
  // closed set: a cell is expanded once (the heuristic is consistent), stale heap entries are skipped —
  // without it the grid of a field-wide window gets re-expanded thousands of times
  const closed = new Uint8Array(W * H)
  while (heap.size) {
    const c = heap.pop()
    if (closed[c]) continue
    closed[c] = 1
    if (c === g) {
      found = true
      break
    }
    const i = c % W
    const j = (c - i) / W
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const a = i + di
        const b = j + dj
        if (a < 0 || b < 0 || a >= W || b >= H) continue
        const n = b * W + a
        if (!free[n]) continue
        if (di && dj && (!free[j * W + a] || !free[b * W + i])) continue // no corner cutting
        const nc = cost[c] + (di && dj ? Math.SQRT2 : 1) * (near[n] ? 3 : 1)
        if (nc < cost[n]) {
          cost[n] = nc
          prev[n] = c
          heap.push(n, nc + h(n))
        }
      }
  }
  if (!found) return null
  const cells: number[] = []
  for (let c = g; c >= 0; c = prev[c]) cells.push(c)
  cells.reverse()
  const pts = cells.map((c) => [cx(c % W), cz(Math.floor(c / W))] as [number, number])
  pts[pts.length - 1] = ok(to[0], to[1]) ? to : pts[pts.length - 1]
  // string-pull: keep the farthest point still in plain sight (and not grazing obstacles the grid path avoided)
  const clear = (a: [number, number], b: [number, number]) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.ceil(d / 0.15)
    for (let k = 1; k < n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n
      const z = a[1] + ((b[1] - a[1]) * k) / n
      if (!ok(x, z)) return false
      const t = (k / n) * d
      if (near[cellOf(x, z)] && t > 0.8 && d - t > 0.8) return false
    }
    return true
  }
  // from each kept point, the farthest point still in sight: galloping search forward (1, 2, 4, … cells),
  // then bisection between the last visible and the first hidden one. O(n log n) sight tests, so long
  // routes across the field (bridge to bridge, ~300 cells) stay fast.
  const out: [number, number][] = []
  const last = pts.length - 1
  let i = 0
  while (i < last) {
    let good = i + 1
    let bad = -1
    for (let step = 1; ; step *= 2) {
      const j = Math.min(last, i + 1 + step)
      if (clear(pts[i], pts[j])) {
        good = j
        if (j === last) break
      } else {
        bad = j
        break
      }
    }
    while (bad > good + 1) {
      const m = (good + bad) >> 1
      if (clear(pts[i], pts[m])) good = m
      else bad = m
    }
    out.push(pts[good])
    i = good
  }
  return out
}

/** binary min-heap of cell ids by priority */
class Heap {
  private ids: number[] = []
  private ps: number[] = []
  get size() {
    return this.ids.length
  }
  push(id: number, p: number) {
    const { ids, ps } = this
    let i = ids.length
    ids.push(id)
    ps.push(p)
    while (i > 0) {
      const u = (i - 1) >> 1
      if (ps[u] <= ps[i]) break
      ;[ids[u], ids[i]] = [ids[i], ids[u]]
      ;[ps[u], ps[i]] = [ps[i], ps[u]]
      i = u
    }
  }
  pop() {
    const { ids, ps } = this
    const top = ids[0]
    const li = ids.pop()!
    const lp = ps.pop()!
    if (ids.length) {
      ids[0] = li
      ps[0] = lp
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < ids.length && ps[l] < ps[m]) m = l
        if (r < ids.length && ps[r] < ps[m]) m = r
        if (m === i) break
        ;[ids[m], ids[i]] = [ids[i], ids[m]]
        ;[ps[m], ps[i]] = [ps[i], ps[m]]
        i = m
      }
    }
    return top
  }
}

/**
 * The flights (and ladders) inside `rect` between heights `fromY` and `toY`, in walking order, as
 * anchor points: just before each flight in its lane, just past its end on the landing. Walking from
 * one flight's end to the next one's start crosses the landing to the other lane.
 */
export function stairPath(p: Plant, rect: PlanRect, fromY: number, toY: number): AutoPt[] {
  const lo = Math.min(fromY, toY) - 0.01
  const hi = Math.max(fromY, toY) + 0.01
  const up = toY > fromY
  const runs = walkSurfaces(p)
    .filter((s) => (s.kind === 'flight' || s.kind === 'ladder') && s.y0 !== s.y1)
    .filter((s) => {
      const mx = (s.x0 + s.x1) / 2
      const mz = (s.z0 + s.z1) / 2
      return mx >= rect.x0 && mx <= rect.x1 && mz >= rect.z0 && mz <= rect.z1 && Math.min(s.y0, s.y1) >= lo && Math.max(s.y0, s.y1) <= hi
    })
    .sort((a, b) => (Math.min(a.y0, a.y1) - Math.min(b.y0, b.y1)) * (up ? 1 : -1))
  const out: AutoPt[] = []
  for (const s of runs) {
    const lowAtA = s.y0 < s.y1
    const [e0, e1] = up === lowAtA ? [s.a, s.b] : [s.b, s.a]
    const [h0, h1] = up === lowAtA ? [s.y0, s.y1] : [s.y1, s.y0]
    const dir = Math.sign(e1 - e0)
    const mid = s.axis === 'x' ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2
    const at = (u: number, y: number): AutoPt => (s.axis === 'x' ? { x: u, z: mid, y } : { x: mid, z: u, y })
    out.push(at(e0 - dir * 0.3, h0), at(e1 + dir * 0.35, h1))
  }
  return out
}
