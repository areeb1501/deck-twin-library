// Trapezoidal corrugated sheet (container walls, roofs, doors) as an extruded profile.
import * as THREE from 'three'
import type { Kit, MatKey } from '../lib/kit'

/**
 * Corrugated sheet: profile runs along local u (0 … length), outer flats at d = depth, inner flats at d = 0,
 * extruded `height` along local w. `basis` maps (u, d, w) to the item frame; `origin` is the (0, 0, 0) corner.
 */
export function corrugated(
  k: Kit,
  mat: MatKey,
  length: number,
  height: number,
  origin: THREE.Vector3,
  basis: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  o: { pitch?: number; depth?: number; outer?: number; t?: number } = {},
) {
  const pitch = o.pitch ?? 0.278
  const depth = o.depth ?? 0.036
  const outer = o.outer ?? 0.26 * pitch
  const slope = 0.25 * pitch
  const inner = pitch - outer - 2 * slope
  const t = o.t ?? 0.002
  const pts: [number, number][] = [[0, depth]]
  let u = 0
  const n = Math.max(1, Math.round(length / pitch))
  const sc = length / (n * pitch)
  for (let i = 0; i < n; i++) {
    const a = u
    pts.push([a + (outer / 2) * sc, depth], [a + (outer / 2 + slope) * sc, 0], [a + (outer / 2 + slope + inner) * sc, 0], [a + (pitch - outer / 2) * sc, depth])
    u += pitch * sc
  }
  pts.push([length, depth])
  const sh = new THREE.Shape()
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)))
  for (let i = pts.length - 1; i >= 0; i--) sh.lineTo(pts[i][0], pts[i][1] - t)
  sh.closePath()
  const m = new THREE.Matrix4().makeBasis(basis[0], basis[1], basis[2]).setPosition(origin)
  k.extrude(mat, sh, height, m, 1)
}
