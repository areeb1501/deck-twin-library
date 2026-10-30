/**
 * Guard-rail builder: 48.3 mm tube posts every <= 1.5 m, top rail @ 1.1 m, knee rail @ 0.55 m,
 * 150 mm kickplate (toe board). NORSOK/ISO 14122 proportions.
 */
import type { GeoBatch, V3 } from './batch'
import { bar, sphere, tube } from './batch'

export interface RailBatches {
  rail: GeoBatch // posts + rails (safety yellow)
  kick: GeoBatch // toe boards (usually same yellow)
}

export const RAIL = { top: 1.1, mid: 0.55, r: 0.0242, postR: 0.0242, kick: 0.15, kickT: 0.006, maxPost: 1.5 }

/**
 * Straight guard-rail run along a -> b (both at walking-surface level).
 * `inward` is a horizontal unit vector pointing to the walkable side (kickplate sits on the outer edge).
 */
export function railRun(
  rb: RailBatches,
  a: V3,
  b: V3,
  opts: { startPost?: boolean; endPost?: boolean; kick?: boolean; top?: number; seg?: number } = {},
) {
  const { startPost = true, endPost = true, kick = true, top = RAIL.top, seg = 8 } = opts
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const L = Math.hypot(dx, dz)
  if (L < 0.05) return
  const n = Math.max(1, Math.ceil(L / RAIL.maxPost))
  for (let i = 0; i <= n; i++) {
    if (i === 0 && !startPost) continue
    if (i === n && !endPost) continue
    const t = i / n
    const p: V3 = [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t]
    tube(rb.rail, [p[0], p[1], p[2]], [p[0], p[1] + top + 0.02, p[2]], RAIL.postR, seg, false)
    // base plate stub
    bar(rb.rail, [p[0] - 0.04, p[1] + 0.003, p[2]], [p[0] + 0.04, p[1] + 0.003, p[2]], 0.08, 0.006)
  }
  const ya = a[1]
  const yb = b[1]
  tube(rb.rail, [a[0], ya + top, a[2]], [b[0], yb + top, b[2]], RAIL.r, seg, true)
  tube(rb.rail, [a[0], ya + RAIL.mid, a[2]], [b[0], yb + RAIL.mid, b[2]], RAIL.r * 0.9, seg, true)
  // rounded caps at the run ends (hides open tube ends on corners)
  if (startPost) sphere(rb.rail, [a[0], ya + top, a[2]], RAIL.r * 1.05, 8, 6)
  if (endPost) sphere(rb.rail, [b[0], yb + top, b[2]], RAIL.r * 1.05, 8, 6)
  if (kick) {
    const h = RAIL.kick
    bar(rb.kick, [a[0], ya + 0.01 + h / 2, a[2]], [b[0], yb + 0.01 + h / 2, b[2]], RAIL.kickT, h)
  }
}

/**
 * Closed / open polyline guard rail with gaps. Points are (x, z) at height y.
 * gaps: list of [s0, s1] distances along the polyline that stay open (stair access, gates).
 */
export function railPolyline(rb: RailBatches, pts: [number, number][], y: number, gaps: [number, number][] = [], closed = false) {
  const P = closed ? [...pts, pts[0]] : pts
  let s = 0
  for (let i = 0; i < P.length - 1; i++) {
    const [x0, z0] = P[i]
    const [x1, z1] = P[i + 1]
    const L = Math.hypot(x1 - x0, z1 - z0)
    // intervals of this edge that are NOT in a gap
    let pieces: [number, number][] = [[0, L]]
    for (const [g0, g1] of gaps) {
      const a = g0 - s
      const b = g1 - s
      const next: [number, number][] = []
      for (const [p0, p1] of pieces) {
        if (b <= p0 || a >= p1) next.push([p0, p1])
        else {
          if (a > p0) next.push([p0, a])
          if (b < p1) next.push([b, p1])
        }
      }
      pieces = next
    }
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < 0.1) continue
      const ux = (x1 - x0) / L
      const uz = (z1 - z0) / L
      railRun(rb, [x0 + ux * p0, y, z0 + uz * p0], [x0 + ux * p1, y, z0 + uz * p1])
    }
    s += L
  }
}

/** Distance along a closed rectangle polyline (starting at pts[0]) to a point on its perimeter. */
export function perimeterDistance(pts: [number, number][], x: number, z: number) {
  let s = 0
  const P = [...pts, pts[0]]
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < P.length - 1; i++) {
    const [x0, z0] = P[i]
    const [x1, z1] = P[i + 1]
    const L = Math.hypot(x1 - x0, z1 - z0)
    const ux = (x1 - x0) / L
    const uz = (z1 - z0) / L
    const t = Math.max(0, Math.min(L, (x - x0) * ux + (z - z0) * uz))
    const d = Math.hypot(x0 + ux * t - x, z0 + uz * t - z)
    if (d < bestD) {
      bestD = d
      best = s + t
    }
    s += L
  }
  return best
}
