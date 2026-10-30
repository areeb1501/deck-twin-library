/**
 * Telecom / radio tower on the LQ main deck (WORLD coordinates): tapering 4-chord lattice mast from the
 * deck at LQ.tower to 3 m below its full height, then an antenna pole. Ring platforms with guard rails,
 * internal ladder, panel antennas, whips, microwave dishes (radomes) and red aviation obstruction lights.
 */
import type { V3 } from '../structure/batch'
import { bar, boxMinMax, place, sphere, tube, unitCyl } from '../structure/batch'
import { railPolyline, type RailBatches } from '../structure/handrail'
import { gratingRect, type GratingBatches } from '../structure/panels'
import { ladder } from '../structure/ladder'
import { LQ } from '../../model/site'
import type { LqGet } from './accommodation'

const Y = 28

export function buildTelecomTower(get: LqGet, gb: GratingBatches, rb: RailBatches) {
  const T = LQ.tower
  const top = Y + T.height
  const yL = top - 3 // lattice top / top platform
  const b0 = 1.3 // half width at the base
  const b1 = 0.55 // half width at the lattice top
  const hw = (y: number) => b0 + ((b1 - b0) * (y - Y)) / (yL - Y)
  const C = (sx: number, sz: number, y: number): V3 => [T.x + sx * hw(y), y, T.z + sz * hw(y)]
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  const steel = get('galv')
  const bays = 11
  const lv = Array.from({ length: bays + 1 }, (_, i) => Y + ((yL - Y) * i) / bays)

  // chords + base plinths
  for (const [sx, sz] of corners) {
    tube(steel, C(sx, sz, Y), C(sx, sz, yL), 0.085, 8, true)
    const p = C(sx, sz, Y)
    boxMinMax(get('steelDark'), [p[0] - 0.3, Y, p[2] - 0.3], [p[0] + 0.3, Y + 0.25, p[2] + 0.3])
  }
  // horizontals + X-bracing on each face
  for (let i = 0; i < lv.length; i++) {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k]
      const [bx, bz] = corners[(k + 1) % 4]
      if (i > 0) tube(steel, C(ax, az, lv[i]), C(bx, bz, lv[i]), 0.04, 6, true)
      if (i < lv.length - 1) {
        tube(steel, C(ax, az, lv[i]), C(bx, bz, lv[i + 1]), 0.032, 5, true)
        tube(steel, C(bx, bz, lv[i]), C(ax, az, lv[i + 1]), 0.032, 5, true)
      }
    }
  }

  // internal ladder (the lattice is the cage) + feeder cable bundle down the north face
  ladder(get('ladder'), [T.x, Y, T.z + 0.15], yL - Y, [0, -1], false)
  tube(get('cable'), [T.x - 0.4, Y + 0.3, T.z - hw(Y) - 0.05], [T.x - 0.4 * (b1 / b0), yL, T.z - b1 - 0.05], 0.05, 6, true)

  // ring platforms (grating round the mast, open in the middle for the ladder) with guard rails
  const levels = [lv[4], lv[8], yL]
  for (const y of levels) {
    const h = hw(y)
    const o = h + 0.9
    const x0 = T.x - o
    const x1 = T.x + o
    const z0 = T.z - o
    const z1 = T.z + o
    gratingRect(gb, x0, z0, x1, T.z - h + 0.1, y)
    gratingRect(gb, x0, T.z + h - 0.1, x1, z1, y)
    gratingRect(gb, x0, T.z - h + 0.1, T.x - h + 0.1, T.z + h - 0.1, y)
    gratingRect(gb, T.x + h - 0.1, T.z - h + 0.1, x1, T.z + h - 0.1, y)
    for (const [a, b] of [
      [
        [x0, z0],
        [x1, z0],
      ],
      [
        [x1, z0],
        [x1, z1],
      ],
      [
        [x1, z1],
        [x0, z1],
      ],
      [
        [x0, z1],
        [x0, z0],
      ],
    ] as [[number, number], [number, number]][])
      bar(get('steelDark'), [a[0], y - 0.1, a[1]], [b[0], y - 0.1, b[1]], 0.06, 0.16)
    // support brackets from the chords
    for (const [sx, sz] of corners) bar(get('steelDark'), C(sx, sz, y - 1.0), [T.x + sx * (o - 0.05), y - 0.12, T.z + sz * (o - 0.05)], 0.07, 0.07)
    const e = 0.05
    railPolyline(
      rb,
      [
        [x0 + e, z0 + e],
        [x1 - e, z0 + e],
        [x1 - e, z1 - e],
        [x0 + e, z1 - e],
      ],
      y,
      [],
      true,
    )
    // aviation obstruction lights on two opposite corners
    for (const [sx, sz] of [
      [1, -1],
      [-1, 1],
    ]) {
      const p: V3 = [T.x + sx * (o - 0.05), y + 1.25, T.z + sz * (o - 0.05)]
      tube(get('steelDark'), [p[0], y + 1.1, p[2]], [p[0], p[1], p[2]], 0.03, 6, true)
      sphere(get('aviation'), p, 0.1, 10, 8)
    }
  }

  // microwave dishes (radomes) on pipe masts at the platform rails, facing Alpha (north) and west
  const dish = (y: number, p: [number, number], axis: 'z' | 'x', r: number) => {
    const [x, z] = p
    tube(get('galv'), [x, y, z], [x, y + 2.4, z], 0.05, 8, true)
    const c: V3 = [x + (axis === 'x' ? -0.35 : 0), y + 1.6, z + (axis === 'z' ? -0.35 : 0)]
    const rot: V3 = axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]
    place(get('white'), unitCyl(20, false), c, rot, [r, 0.45, r])
    place(get('equipDark'), unitCyl(12, false), [c[0] + (axis === 'x' ? 0.35 : 0), c[1], c[2] + (axis === 'z' ? 0.35 : 0)], rot, [0.18, 0.3, 0.18])
  }
  const o1 = hw(lv[8]) + 0.75
  dish(lv[8], [T.x - 0.5, T.z - o1], 'z', 0.6)
  dish(lv[8], [T.x + 0.6, T.z - o1], 'z', 0.45)
  dish(lv[8], [T.x - o1, T.z + 0.3], 'x', 0.6)
  const o2 = hw(lv[4]) + 0.75
  dish(lv[4], [T.x + 0.4, T.z - o2], 'z', 0.9)

  // panel antennas on the upper lattice (three sectors)
  for (const [sx, sz] of [
    [0, -1],
    [1, 0.6],
    [-1, 0.6],
  ]) {
    const y = yL - 2.8
    const h = hw(y) + 0.2
    const p: V3 = [T.x + sx * h, y, T.z + sz * h]
    boxMinMax(get('white'), [p[0] - 0.16, y, p[2] - 0.16], [p[0] + 0.16, y + 1.5, p[2] + 0.16])
  }
  // antenna pole + whips + top light
  tube(get('galv'), [T.x, yL - 1.5, T.z], [T.x, top, T.z], 0.08, 10, true)
  for (const [sx, sz] of [
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ]) {
    const h = hw(yL) + 0.7
    tube(get('galv'), [T.x + sx * h, yL + 1.2, T.z + sz * h], [T.x + sx * h, yL + 5.5, T.z + sz * h], 0.022, 5, true)
  }
  for (const y of [top - 1.2, top - 0.4]) tube(get('galv'), [T.x - 0.9, y, T.z], [T.x + 0.9, y, T.z], 0.025, 5, true) // dipole arms
  tube(get('steelDark'), [T.x, top, T.z], [T.x, top + 0.25, T.z], 0.1, 10, false)
  sphere(get('aviation'), [T.x, top + 0.38, T.z], 0.16, 12, 8)
  sphere(get('aviation'), [T.x + 0.12, yL + 0.3, T.z + 0.12], 0.1, 10, 8)
}

