/**
 * Small, dependency-free geometry helpers shared by the plant definition and the
 * 3D components. Keeps "local equipment frame" <-> "deck frame" conversions in one place.
 */
import type { Equipment, Nozzle, Rating, Vec3 } from './types'

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/** Rotate a vector about +Y by angle (same convention as THREE.Object3D.rotation.y). */
export function rotY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}

/** Equipment-local point -> deck coordinates. */
export function toDeck(eq: Pick<Equipment, 'position' | 'rotationY'>, local: Vec3): Vec3 {
  return add(eq.position, rotY(local, eq.rotationY))
}
/** Equipment-local direction -> deck direction. */
export function dirToDeck(eq: Pick<Equipment, 'rotationY'>, local: Vec3): Vec3 {
  return rotY(local, eq.rotationY)
}
/** Deck point -> equipment-local coordinates. */
export function toLocal(eq: Pick<Equipment, 'position' | 'rotationY'>, deck: Vec3): Vec3 {
  return rotY(sub(deck, eq.position), -eq.rotationY)
}
export function dirToLocal(eq: Pick<Equipment, 'rotationY'>, deck: Vec3): Vec3 {
  return rotY(deck, -eq.rotationY)
}

/**
 * Build a nozzle from equipment-LOCAL base point, direction and neck length.
 * The flange face sits at base + dir * neck.
 */
export function nozzle(
  eq: Pick<Equipment, 'position' | 'rotationY'>,
  id: string,
  name: string,
  localBase: Vec3,
  localDir: Vec3,
  nps: number,
  neck: number,
  rating: Rating = 300,
): Nozzle {
  const d = norm(localDir)
  const face = add(localBase, scale(d, neck))
  return {
    id,
    name,
    nps,
    rating,
    base: toDeck(eq, localBase),
    pos: toDeck(eq, face),
    dir: dirToDeck(eq, d),
  }
}

/** Depth of a 2:1 semi-elliptical head for a given inside diameter. */
export const headDepth = (id: number) => id / 4

/**
 * Height of the outer surface of a 2:1 elliptical head at radial distance r from the axis,
 * measured from the tangent line. Useful for placing nozzles on heads.
 */
export function headSurface(id: number, wall: number, r: number) {
  const a = id / 2 + wall
  const b = id / 4 + wall
  const rr = Math.min(Math.abs(r), a * 0.999)
  return b * Math.sqrt(1 - (rr * rr) / (a * a))
}
