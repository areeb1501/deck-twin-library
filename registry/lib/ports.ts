// Connection points: flange faces in a component's local frame, plus helpers to place them in a plant.
import type { Rating } from './standards'

export type Vec3 = [number, number, number]
export type PortKind = 'process' | 'utility' | 'relief' | 'vent' | 'drain' | 'instrument' | 'electrical'

export interface Port {
  id: string
  label: string
  /** flange face centre, metres, local frame */
  position: Vec3
  /** unit vector pointing out of the face */
  direction: Vec3
  nps: number
  rating?: Rating
  kind?: PortKind
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4

export function port(id: string, label: string, position: Vec3, direction: Vec3, nps: number, rating?: Rating, kind: PortKind = 'process'): Port {
  return { id, label, position: position.map(r4) as Vec3, direction, nps, rating, kind }
}

/** Port in plant coordinates for an item at `at` rotated `rotationDeg` about +Y. */
export function placePort(p: Port, at: Vec3, rotationDeg = 0): Port {
  const a = (rotationDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const rot = ([x, y, z]: Vec3): Vec3 => [x * c + z * s, y, -x * s + z * c]
  const q = rot(p.position)
  return { ...p, position: [r4(q[0] + at[0]), r4(q[1] + at[1]), r4(q[2] + at[2])], direction: rot(p.direction).map(r4) as Vec3 }
}
