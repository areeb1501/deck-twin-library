// Orthogonal pipe router: leave each port along its axis, climb to a run elevation, run X then Z (or Z then X), drop in.
import type { Port, Vec3 } from './ports'

const add = (a: Vec3, d: Vec3, s: number): Vec3 => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s]
const same = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6

export interface RouteOptions {
  /** elevation of the horizontal run (m); defaults to the higher port + 0.6 m */
  elevation?: number
  order?: 'xz' | 'zx'
  /** straight length out of each flange before the first bend (m) */
  lead?: number
}

/** Polyline from port a to port b (both in plant coordinates). */
export function route(a: Pick<Port, 'position' | 'direction'>, b: Pick<Port, 'position' | 'direction'>, o: RouteOptions = {}): Vec3[] {
  const lead = o.lead ?? 0.6
  const via = o.elevation ?? Math.max(a.position[1], b.position[1]) + 0.6
  const vertA = Math.abs(a.direction[1]) > 0.5
  const vertB = Math.abs(b.direction[1]) > 0.5
  const p0 = vertA ? ([a.position[0], via, a.position[2]] as Vec3) : add(a.position, a.direction, lead)
  const q0 = vertB ? ([b.position[0], via, b.position[2]] as Vec3) : add(b.position, b.direction, lead)
  const pts: Vec3[] = [a.position, p0, [p0[0], via, p0[2]]]
  if ((o.order ?? 'xz') === 'xz') pts.push([q0[0], via, p0[2]], [q0[0], via, q0[2]])
  else pts.push([p0[0], via, q0[2]], [q0[0], via, q0[2]])
  pts.push(q0, b.position)
  return simplify(pts)
}

/** Drop duplicate and collinear points. */
export function simplify(pts: Vec3[]): Vec3[] {
  const out: Vec3[] = []
  for (const v of pts) if (!out.length || !same(out[out.length - 1], v)) out.push(v)
  for (let i = out.length - 2; i > 0; i--) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]]
    const d1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const d2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
    const cross = Math.hypot(d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0])
    if (cross < 1e-9 && d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2] > 0) out.splice(i, 1)
  }
  return out
}

/** Total length of a polyline. */
export function routeLength(pts: Vec3[]) {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2])
  return L
}

/** Point and unit direction at fraction t (0–1) along a polyline. */
export function pointAt(pts: Vec3[], t: number): { position: Vec3; direction: Vec3; segment: number } {
  const total = routeLength(pts)
  let d = Math.min(Math.max(t, 0), 1) * total
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    if (d <= L || i === pts.length - 1) {
      const u: Vec3 = L > 0 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L] : [1, 0, 0]
      return { position: add(a, u, Math.min(d, L)), direction: u, segment: i - 1 }
    }
    d -= L
  }
  return { position: pts[0], direction: [1, 0, 0], segment: 0 }
}
