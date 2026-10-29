// Wall panel with real rectangular openings: built as boxes around each hole, lined both faces, for doors, windows and rooms.
import * as THREE from 'three'
import { mat4, uvScale, type Kit, type MatKey } from '../lib/kit'

/** Hole in a wall: centre `u` along the wall, width `w`, sill `y0` and head `y1` above the floor. */
export interface Hole {
  u: number
  w: number
  y0: number
  y1: number
}

/**
 * Wall along X from -len/2 to len/2, thickness along Z centred on z = 0, floor y = 0 to `height`.
 * `face` is the finish on every face (UV 1 = 0.6 m, planar so the module lines up across pieces).
 */
export function wallWithHoles(k: Kit, len: number, height: number, t: number, holes: Hole[], face: MatKey, y0 = 0) {
  const hs = holes
    .map((h) => ({ a: Math.max(-len / 2, h.u - h.w / 2), b: Math.min(len / 2, h.u + h.w / 2), y0: Math.max(y0, h.y0), y1: Math.min(height, h.y1) }))
    .filter((h) => h.b - h.a > 0.01 && h.y1 - h.y0 > 0.01)
    .sort((p, q) => p.a - q.a)
  const piece = (a: number, b: number, ya: number, yb: number) => {
    if (b - a < 0.002 || yb - ya < 0.002) return
    const g = new THREE.BoxGeometry(b - a, yb - ya, t)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const nor = g.getAttribute('normal') as THREE.BufferAttribute
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (a + b) / 2
      const y = pos.getY(i) + (ya + yb) / 2
      const z = pos.getZ(i)
      const ax = Math.abs(nor.getX(i))
      uv.setXY(i, (ax > 0.5 ? z : x) / 0.6, y / 0.6)
    }
    k.add(face, g, mat4([(a + b) / 2, (ya + yb) / 2, 0]))
  }
  let cur = -len / 2
  for (const h of hs) {
    if (h.a > cur) piece(cur, h.a, y0, height)
    piece(h.a, h.b, y0, h.y0)
    piece(h.a, h.b, h.y1, height)
    cur = Math.max(cur, h.b)
  }
  piece(cur, len / 2, y0, height)
}

/** Plain box with UVs scaled so a 0.6 m module texture tiles at true size. */
export function tiledBox(k: Kit, mat: MatKey, size: [number, number, number], pos: [number, number, number], module = 0.6) {
  const g = new THREE.BoxGeometry(...size)
  uvScale(g, Math.max(size[0], size[2]) / module, Math.max(size[1], size[2]) / module)
  k.add(mat, g, mat4(pos))
}
