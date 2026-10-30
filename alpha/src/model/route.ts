/**
 * Orthogonal auto-router for authoring plants quickly: leaves each nozzle along its axis,
 * climbs to a pipe-way elevation, runs X then Z, and drops into the target nozzle.
 * Produces the same Vec3[] polyline a hand-routed line uses.
 */
import type { Nozzle, Vec3 } from './types'

const eq = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6
const add = (a: Vec3, d: Vec3, s: number): Vec3 => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s]

export interface RouteEnd {
  pos: Vec3
  dir: Vec3
}

export const fromNozzle = (n: Nozzle): RouteEnd => ({ pos: n.pos, dir: n.dir })

/**
 * @param via   elevation of the horizontal run
 * @param order 'xz' runs east-west first, 'zx' north-south first
 * @param lead  straight length out of each nozzle before turning
 */
export function autoRoute(a: RouteEnd, b: RouteEnd | Vec3, via: number, order: 'xz' | 'zx' = 'xz', lead = 0.9): Vec3[] {
  const pts: Vec3[] = [a.pos]
  let p = add(a.pos, a.dir, Math.abs(a.dir[1]) > 0.5 ? Math.abs(via - a.pos[1]) || lead : lead)
  if (Math.abs(a.dir[1]) > 0.5) p = [a.pos[0], via, a.pos[2]]
  pts.push(p)
  const end: RouteEnd = Array.isArray(b) ? { pos: b, dir: [0, 0, 0] } : b
  const vertEnd = Math.abs(end.dir[1]) > 0.5
  const q = vertEnd ? ([end.pos[0], via, end.pos[2]] as Vec3) : add(end.pos, end.dir, lead)
  if (Math.abs(p[1] - via) > 1e-6) pts.push((p = [p[0], via, p[2]]))
  if (order === 'xz') {
    pts.push((p = [q[0], via, p[2]]))
    pts.push((p = [q[0], via, q[2]]))
  } else {
    pts.push((p = [p[0], via, q[2]]))
    pts.push((p = [q[0], via, q[2]]))
  }
  if (Math.abs(q[1] - via) > 1e-6) pts.push([q[0], q[1], q[2]])
  pts.push(end.pos)
  // dedupe + drop collinear points
  const out: Vec3[] = []
  for (const v of pts) if (!out.length || !eq(out[out.length - 1], v)) out.push(v)
  for (let i = out.length - 2; i > 0; i--) {
    const a0 = out[i - 1], a1 = out[i], a2 = out[i + 1]
    const d1 = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]]
    const d2 = [a2[0] - a1[0], a2[1] - a1[1], a2[2] - a1[2]]
    const cx = d1[1] * d2[2] - d1[2] * d2[1], cy = d1[2] * d2[0] - d1[0] * d2[2], cz = d1[0] * d2[1] - d1[1] * d2[0]
    if (Math.hypot(cx, cy, cz) < 1e-9 && d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2] > 0) out.splice(i, 1)
  }
  return out
}
