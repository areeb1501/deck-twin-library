/**
 * Enclosed-module geometry shared by the building shell (Module.tsx), the interiors
 * (moduleInteriors.ts) and anything that needs to know where the door gaps are (walker, picking).
 *
 * Module-local frame: origin = footprint centre at deck level, +Y up. size = [SX, SY, SZ] outer.
 * Walls are T thick (outer face at ±SX/2, ±SZ/2); the internal floor / door thresholds are at HF.
 *
 * Wall frame (used for everything mounted on a wall):
 *   rotY = atan2(nx, nz) — '+z' → 0, '-z' → π, '+x' → π/2, '-x' → −π/2
 *   local +Z = outward normal (z = 0 is the outer face, z = −T the inner face), +Y up,
 *   local +X = the wall tangent:  '+z' → +X, '-z' → −X, '+x' → −Z, '-x' → +Z
 *   so a door's local x  u = at   on '+z' / '-x'   and   u = −at   on '-z' / '+x'.
 *
 * Door convention (what <Door> gets):
 *   rotationY = wall rotY; hinge = outer face of the wall, floor level (y = HF), at a jamb. A leaf
 *   is drawn from its hinge along local dir·X (dir = ±1) and swings OUT with openAngle = −dir·OPEN.
 *   The landing's stair runs along the wall towards stairDir (+1 = wall-local +x).
 *   single: hinged on the jamb AWAY from the stair: hinge u − stairDir·w/2, dir = stairDir, so the
 *           open leaf never stands between the stair head and the doorway.
 *   double: leaf A hinge u − w/2, dir +1, openAngle −OPEN; leaf B hinge u + w/2, dir −1, +OPEN
 *           (each w/2 wide, same door id = one open state). The landing is deepened to
 *           landingDepth = leaf + 0.8 so you walk round the stair-side leaf's tip.
 *   The clear opening is w wide × h high (y = HF … HF + h) through the full wall thickness.
 */
import * as THREE from 'three'
import type { Module, ModuleDoor } from '../../model/types'
import type { V3 } from './machinery/kit'

export const HF = 0.6 // internal floor / threshold height
export const WALL_T = 0.14 // wall thickness (cladding + insulation + lining)
export const POST = 0.2 // corner post
export const FRAME_W = 0.08 // door frame (jamb / head) width
export const OPEN = 1.6 // door swing (rad)

export type WallId = ModuleDoor['wall']
export type Interior = NonNullable<Module['interior']>

export interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface WallFrame {
  id: WallId
  /** outward normal (x, z) */
  n: [number, number]
  rotY: number
  /** outer-face centre at y = 0 (module-local) */
  origin: V3
  /** outer length along the wall */
  len: number
  /** sign that maps `at` to wall-local x */
  s: 1 | -1
}

export interface LeafGeom {
  hinge: V3
  rotationY: number
  openAngle: number
  width: number
  /** +1: leaf drawn along local +X from the hinge; −1: along −X */
  dir: 1 | -1
}

export interface DoorGeom {
  id: string
  wall: WallId
  double: boolean
  /** clear opening width / height */
  width: number
  height: number
  /** centre along the wall (wall-local x) */
  u: number
  /** centre of the opening on the outer face at floor level (module-local) */
  centre: V3
  leaves: LeafGeom[]
  /** stair from the landing descends towards wall-local +x (1) or −x (−1) */
  stairDir: 1 | -1
  /** landing: (width + 0.9) along the wall × landingDepth out from the wall, top at HF */
  landingDepth: number
  /** wall-local x interval taken outside by frame + landing + stair */
  extent: [number, number]
}

export const WALL_IDS: WallId[] = ['+z', '-z', '+x', '-x']

export function wallFrame(id: WallId, size: V3): WallFrame {
  const [SX, , SZ] = size
  switch (id) {
    case '+z':
      return { id, n: [0, 1], rotY: 0, origin: [0, 0, SZ / 2], len: SX, s: 1 }
    case '-z':
      return { id, n: [0, -1], rotY: Math.PI, origin: [0, 0, -SZ / 2], len: SX, s: -1 }
    case '+x':
      return { id, n: [1, 0], rotY: Math.PI / 2, origin: [SX / 2, 0, 0], len: SZ, s: -1 }
    case '-x':
      return { id, n: [-1, 0], rotY: -Math.PI / 2, origin: [-SX / 2, 0, 0], len: SZ, s: 1 }
  }
}

/** wall-local → module-local transform */
export function wallMatrix(w: WallFrame) {
  return new THREE.Matrix4().makeRotationY(w.rotY).setPosition(w.origin[0], w.origin[1], w.origin[2])
}

/** wall-local point (x along the wall, y up, z outward from the outer face) → module-local */
export function wallPoint(w: WallFrame, x: number, y: number, z: number): V3 {
  const c = Math.cos(w.rotY)
  const s = Math.sin(w.rotY)
  // rotation about +Y: x' = x c + z s, z' = −x s + z c
  return [w.origin[0] + x * c + z * s, y, w.origin[2] - x * s + z * c]
}

export const resolveInterior = (eq: Module): Interior => eq.interior ?? 'switchgear'

/** Doors from the data, or the default layout (double main door on −z, single door on +x). */
export function resolveDoors(eq: Module): ModuleDoor[] {
  if (eq.doors) return eq.doors
  const [SX, , SZ] = eq.size
  const dW = Math.min(1.8, SX * 0.25)
  return [
    { id: 'D1', wall: '-z', at: -SX * 0.18, width: dW, double: dW >= 1.4 },
    { id: 'D2', wall: '+x', at: SZ * 0.15, width: Math.min(1.0, SZ * 0.3) },
  ]
}

export function doorGeometry(eq: Module): DoorGeom[] {
  const size = eq.size as V3
  const out: DoorGeom[] = []
  for (const d of resolveDoors(eq)) {
    const w = wallFrame(d.wall, size)
    const maxW = w.len - 2 * POST - 2 * FRAME_W - 0.2
    const width = Math.max(0.6, Math.min(d.width, maxW))
    const double = !!d.double && width >= 1.2
    const lim = w.len / 2 - POST - FRAME_W - 0.1 - width / 2
    const u = Math.max(-lim, Math.min(lim, d.at * w.s))
    const height = Math.min(double ? 2.2 : 2.1, size[1] - HF - 0.75)
    const leafW = double ? width / 2 : width
    const stairDir: 1 | -1 = u <= 0 ? 1 : -1
    const leaf = (dir: 1 | -1): LeafGeom => ({ hinge: wallPoint(w, u - (dir * width) / 2, HF, 0), rotationY: w.rotY, openAngle: -dir * OPEN, width: leafW, dir })
    const leaves: LeafGeom[] = double ? [leaf(1), leaf(-1)] : [leaf(stairDir)]
    const landingDepth = double ? Math.max(1.2, leafW + 0.8) : 1.2
    const lw2 = width + 0.9
    const steps = Math.ceil(HF / 0.2)
    const run = (steps - 1) * 0.25 + 0.15
    const e0 = u - lw2 / 2 - (stairDir < 0 ? run : 0)
    const e1 = u + lw2 / 2 + (stairDir > 0 ? run : 0)
    out.push({ id: d.id, wall: d.wall, double, width, height, u, centre: wallPoint(w, u, HF, 0), leaves, stairDir, landingDepth, extent: [e0, e1] })
  }
  return out
}

/** true when wall-local interval [u − half, u + half] is clear of every door (+ landing + stair) and the corners */
export function freeAt(doors: DoorGeom[], w: WallFrame, u: number, half: number, margin = 0.15) {
  if (Math.abs(u) + half > w.len / 2 - POST - 0.05) return false
  for (const d of doors) {
    if (d.wall !== w.id) continue
    if (u + half > d.extent[0] - margin && u - half < d.extent[1] + margin) return false
  }
  return true
}

/** Inner bounds of the room (module-local). */
export function innerRect(size: V3): Rect {
  return { x0: -size[0] / 2 + WALL_T, x1: size[0] / 2 - WALL_T, z0: -size[2] / 2 + WALL_T, z1: size[2] / 2 - WALL_T }
}

/** Keep-clear zone inside each door: opening + 0.2 m each side (≥ 1.3 m wide), 1.2 … 1.6 m deep. */
export function doorKeepOuts(size: V3, doors: DoorGeom[]): Rect[] {
  const r = innerRect(size)
  return doors.map((d) => {
    const w = wallFrame(d.wall, size)
    const half = Math.max(0.65, d.width / 2 + 0.2)
    const perp = d.wall === '+z' || d.wall === '-z' ? r.z1 - r.z0 : r.x1 - r.x0
    const depth = Math.max(1.2, Math.min(1.6, perp * 0.5))
    const a = wallPoint(w, d.u - half, 0, -WALL_T)
    const b = wallPoint(w, d.u + half, 0, -WALL_T - depth)
    return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]) }
  })
}

export const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
