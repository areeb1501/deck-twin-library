// Shared ladder-type cable tray (IEC 61537): C-section side rails, rungs at 300 mm, laid cables, splice plates.
import type { Kit, MatKey } from '../lib/kit'
import { boxMM } from './_steel'

export interface TrayOpts {
  /** side-rail height, m */
  rail?: number
  /** fraction of the tray width filled with cables, 0…1 */
  fill?: number
  mat?: MatKey
  /** splice plates every n metres (standard 3 m lengths) */
  splice?: number
}

/** Ladder tray along X from x0 to x1, centred on z = zc, rungs' bottom at y. Returns the tray top. */
export function ladderTray(k: Kit, x0: number, x1: number, zc: number, y: number, w: number, o: TrayOpts = {}) {
  const h = o.rail ?? 0.1
  const mat = o.mat ?? 'cableTray'
  const t = 0.002
  const lip = 0.022
  for (const s of [-1, 1]) {
    const z = zc + s * (w / 2)
    boxMM(k, mat, [x0, y, z - t / 2], [x1, y + h, z + t / 2])
    boxMM(k, mat, [x0, y + h - t, z - s * lip], [x1, y + h, z])
    boxMM(k, mat, [x0, y, z - s * lip], [x1, y + t, z])
    const sp = o.splice ?? 3
    for (let x = x0 + sp; x < x1 - 0.2; x += sp) boxMM(k, 'galvanised', [x - 0.09, y + 0.015, z + s * t / 2], [x + 0.09, y + h - 0.015, z + s * (t / 2 + 0.004)])
  }
  for (let x = x0 + 0.15; x < x1 - 0.05; x += 0.3) boxMM(k, mat, [x - 0.015, y, zc - w / 2 + t], [x + 0.015, y + 0.022, zc + w / 2 - t])
  const fill = Math.max(0, Math.min(1, o.fill ?? 0.6))
  if (fill <= 0) return y + h
  // cables: deterministic mix of diameters laid side by side
  const D = [0.052, 0.034, 0.041, 0.026, 0.06, 0.03, 0.045, 0.022]
  let z = zc - w / 2 + 0.02
  let i = 0
  const zEnd = zc - w / 2 + 0.02 + (w - 0.04) * fill
  while (z < zEnd) {
    const d = D[i % D.length]
    if (z + d > zc + w / 2 - 0.01) break
    k.cyl('cable', d / 2, x1 - x0 - 0.06, [(x0 + x1) / 2, y + 0.022 + d / 2, z + d / 2], 'x', 8)
    if (i % 3 === 0 && d < 0.045) k.cyl('cable', d / 2, x1 - x0 - 0.06, [(x0 + x1) / 2, y + 0.022 + d + d / 2, z + d / 2], 'x', 8)
    z += d + 0.004
    i++
  }
  return y + h
}
