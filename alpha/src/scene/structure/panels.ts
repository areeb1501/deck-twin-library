/**
 * Walking-surface panels: grating (two alpha planes 25 mm apart for visible bar depth + a
 * shadow-only proxy) and solid plate.
 */
import * as THREE from 'three'
import type { GeoBatch } from './batch'
import { boxMinMax, unitPlaneY } from './batch'

const _m = new THREE.Matrix4()

export interface GratingBatches {
  grating: GeoBatch
  shadow: GeoBatch
  /** optional banding/edge flat bars (steel) */
  edge?: GeoBatch
}

/** Horizontal grating rectangle with its top surface at y. World-space UVs (metres). */
export function gratingRect(gb: GratingBatches, x0: number, z0: number, x1: number, z1: number, y: number, depth = 0.025) {
  if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return
  // planes are inset by the banding thickness so banding bars never overlap them (no z-fight)
  const ins = gb.edge ? 0.005 : 0
  const w = x1 - x0 - 2 * ins
  const d = z1 - z0 - 2 * ins
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  _m.makeScale(w, 1, d).setPosition(cx, y, cz)
  gb.grating.add(unitPlaneY(), _m, 'world')
  _m.makeScale(w, 1, d).setPosition(cx, y - depth, cz)
  gb.grating.add(unitPlaneY(), _m, 'world')
  _m.makeScale(w, 1, d).setPosition(cx, y - depth * 0.5, cz)
  gb.shadow.add(unitPlaneY(), _m, 'world')
  if (gb.edge) {
    // 30 x 5 mm banding bar around the panel
    const t = 0.005
    const h = depth + 0.005
    const yc = y - h / 2
    boxMinMax(gb.edge, [x0, yc - h / 2, z0], [x1, yc + h / 2, z0 + t])
    boxMinMax(gb.edge, [x0, yc - h / 2, z1 - t], [x1, yc + h / 2, z1])
    boxMinMax(gb.edge, [x0, yc - h / 2, z0 + t], [x0 + t, yc + h / 2, z1 - t])
    boxMinMax(gb.edge, [x1 - t, yc - h / 2, z0 + t], [x1, yc + h / 2, z1 - t])
  }
}

/** Solid plate rectangle, top at y, thickness t. */
export function plateRect(b: GeoBatch, x0: number, z0: number, x1: number, z1: number, y: number, t = 0.025) {
  if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return
  boxMinMax(b, [x0, y - t, z0], [x1, y, z1])
}

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/**
 * Partition `outer` into disjoint rectangles, each flagged solid (inside any of `solids`) or open.
 * Adjacent cells with the same flag are merged along X then Z to keep counts low.
 */
export function partition(outer: Rect, solids: Rect[]): { rect: Rect; solid: boolean }[] {
  const clamp = (r: Rect): Rect => ({
    x0: Math.max(outer.x0, Math.min(r.x0, r.x1)),
    x1: Math.min(outer.x1, Math.max(r.x0, r.x1)),
    z0: Math.max(outer.z0, Math.min(r.z0, r.z1)),
    z1: Math.min(outer.z1, Math.max(r.z0, r.z1)),
  })
  const S = solids.map(clamp).filter((r) => r.x1 - r.x0 > 0.01 && r.z1 - r.z0 > 0.01)
  const uniq = (a: number[]) => [...new Set(a.map((v) => Math.round(v * 1000) / 1000))].sort((p, q) => p - q)
  const xs = uniq([outer.x0, outer.x1, ...S.flatMap((r) => [r.x0, r.x1])])
  const zs = uniq([outer.z0, outer.z1, ...S.flatMap((r) => [r.z0, r.z1])])
  const nx = xs.length - 1
  const nz = zs.length - 1
  const solid: boolean[][] = []
  for (let j = 0; j < nz; j++) {
    solid.push([])
    const cz = (zs[j] + zs[j + 1]) / 2
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2
      solid[j].push(S.some((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1))
    }
  }
  // greedy rectangle merge
  const used = solid.map((row) => row.map(() => false))
  const out: { rect: Rect; solid: boolean }[] = []
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (used[j][i]) continue
      const f = solid[j][i]
      let i1 = i
      while (i1 + 1 < nx && !used[j][i1 + 1] && solid[j][i1 + 1] === f) i1++
      let j1 = j
      outer: while (j1 + 1 < nz) {
        for (let k = i; k <= i1; k++) if (used[j1 + 1][k] || solid[j1 + 1][k] !== f) break outer
        j1++
      }
      for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) used[jj][k] = true
      out.push({ rect: { x0: xs[i], x1: xs[i1 + 1], z0: zs[j], z1: zs[j1 + 1] }, solid: f })
    }
  }
  return out
}
