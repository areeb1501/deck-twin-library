/**
 * Ladder-type cable trays hung from the upper-deck underside on strut trapezes, with vertical drops.
 */
import type { GeoBatch } from './batch'
import { box, boxMinMax, tube } from './batch'

export const TRAY = { y: 8.6, width: 0.6, rail: 0.1, rungPitch: 0.3, z: [-4, 4], x0: -28, x1: 28, hangerPitch: 2.0, ceiling: 9.985 }

export interface TrayBatches {
  tray: GeoBatch
  cable: GeoBatch
  hanger: GeoBatch
  box: GeoBatch
}

/** Horizontal ladder tray run along X. */
function runX(tb: TrayBatches, x0: number, x1: number, zc: number, y: number) {
  const w = TRAY.width
  const h = TRAY.rail
  // side rails: C-profile approximated by web + two lips
  for (const s of [-1, 1]) {
    const z = zc + s * (w / 2)
    boxMinMax(tb.tray, [x0, y, z - 0.002], [x1, y + h, z + 0.002])
    boxMinMax(tb.tray, [x0, y + h - 0.003, z - s * 0.025 - 0.0125], [x1, y + h, z - s * 0.025 + 0.0125])
    boxMinMax(tb.tray, [x0, y, z - s * 0.025 - 0.0125], [x1, y + 0.003, z - s * 0.025 + 0.0125])
  }
  // rungs
  for (let x = x0 + 0.15; x < x1 - 0.05; x += TRAY.rungPitch) {
    box(tb.tray, [x, y + 0.012, zc], [0.03, 0.02, w - 0.01])
  }
  // cables: a few bundles laid on the rungs
  const cab: [number, number][] = [
    [-0.2, 0.028],
    [-0.13, 0.022],
    [-0.07, 0.035],
    [0.0, 0.018],
    [0.05, 0.03],
    [0.12, 0.024],
    [0.17, 0.016],
  ]
  for (const [dz, r] of cab) tube(tb.cable, [x0 + 0.05, y + 0.022 + r, zc + dz], [x1 - 0.05, y + 0.022 + r, zc + dz], r, 8, true)
}

/** Vertical drop (ladder tray turned on its side, cables inside), from yTop down to yBot. */
function drop(tb: TrayBatches, x: number, zc: number, yTop: number, yBot: number) {
  const w = 0.45
  for (const s of [-1, 1]) {
    boxMinMax(tb.tray, [x + s * (w / 2) - 0.002, yBot, zc - 0.05], [x + s * (w / 2) + 0.002, yTop, zc + 0.05])
  }
  for (let y = yBot + 0.15; y < yTop; y += TRAY.rungPitch) box(tb.tray, [x, y, zc - 0.04], [w, 0.03, 0.02])
  for (const [dx, r] of [
    [-0.12, 0.025],
    [-0.04, 0.03],
    [0.05, 0.02],
    [0.13, 0.022],
  ] as [number, number][]) {
    tube(tb.cable, [x + dx, yBot + 0.4, zc - 0.005], [x + dx, yTop + 0.05, zc - 0.005], r, 8, true)
  }
  // junction box on a stand at the bottom
  boxMinMax(tb.box, [x - 0.35, yBot - 0.75, zc - 0.12], [x + 0.35, yBot + 0.05, zc + 0.12])
  boxMinMax(tb.hanger, [x - 0.3, 0, zc - 0.03], [x - 0.26, yBot - 0.75, zc + 0.03])
  boxMinMax(tb.hanger, [x + 0.26, 0, zc - 0.03], [x + 0.3, yBot - 0.75, zc + 0.03])
}

export function buildCableTrays(tb: TrayBatches, skipX: number[] = []) {
  const { y, width } = TRAY
  for (const zc of TRAY.z) {
    runX(tb, TRAY.x0, TRAY.x1, zc, y)
    // trapeze hangers: 41x41 strut channel drops + cross strut under the tray
    for (let x = TRAY.x0 + 0.6; x <= TRAY.x1; x += TRAY.hangerPitch) {
      if (skipX.some((s) => Math.abs(s - x) < 0.4)) continue
      for (const s of [-1, 1]) {
        const z = zc + s * (width / 2 + 0.06)
        boxMinMax(tb.hanger, [x - 0.0205, y - 0.045, z - 0.0205], [x + 0.0205, TRAY.ceiling, z + 0.0205])
      }
      boxMinMax(tb.hanger, [x - 0.0205, y - 0.045, zc - width / 2 - 0.09], [x + 0.0205, y - 0.004, zc + width / 2 + 0.09])
    }
  }
  // drops towards local equipment (junction boxes at the bottom)
  const drops: [number, number][] = [
    [-17, TRAY.z[1] + 0.72],
    [13, TRAY.z[0] - 0.72],
    [-5, TRAY.z[0] - 0.72],
  ]
  for (const [x, z] of drops) {
    drop(tb, x, z, y + 0.08, 1.9)
    // short horizontal stub from main tray side rail to the drop
    const zc = z > 0 ? TRAY.z[1] : TRAY.z[0]
    const s = z > zc ? 1 : -1
    boxMinMax(tb.tray, [x - 0.22, y, Math.min(zc + s * width * 0.5, z)], [x + 0.22, y + 0.02, Math.max(zc + s * width * 0.5, z)])
  }
}
