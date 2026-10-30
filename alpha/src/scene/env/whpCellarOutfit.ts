/**
 * WHP-N cellar (spider) deck outfitting, WORLD coordinates (grating top y = 20), lighter than Alpha's:
 * a cross-deck ladder cable tray + a branch to the fibre-optic J-tube (whpJacket.ts) with the cable tail,
 * instrument-air / utility-water runs, Ex-d pendants under the wellhead-deck secondaries (IPE 300 bottom
 * ≈ 27.67, clear of the flowlines at 23.4 … 25.8 and the bridge lines at 26.4 … 27), conductor deck collars, lifebuoy stations, escape
 * signage at the stair and boat-landing openings, and extinguishers there.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { box, boxMinMax, place, sphere, tube, unitCyl } from '../structure/batch'
import { sign, type FixtureBatches } from '../structure/fixtures'
import { WHP } from '../../model/site'
import type { OutfitGet } from './cellarOutfit'
import { WHP_JACKET, WHP_JTUBE, whpJTubeAt } from './whpJacket'
import { WHP_STAIR } from './whpDeck'
import * as THREE from 'three'

const Y = 20
const SEC_BOT = 27.67
const TRAY_Y = 26.85
const D = WHP.deck

const cylY = (b: GeoBatch, x: number, y0: number, y1: number, z: number, r: number, seg = 12) =>
  place(b, unitCyl(seg, false), [x, (y0 + y1) / 2, z], [0, 0, 0], [r, y1 - y0, r])

function pipe(b: GeoBatch, pts: V3[], r: number, seg = 8) {
  for (let i = 0; i < pts.length - 1; i++) tube(b, pts[i], pts[i + 1], r, seg, true)
  for (let i = 1; i < pts.length - 1; i++) sphere(b, pts[i], r * 1.02, seg, 6)
}

/** ladder tray along X (z const) or Z (x const), bottom at TRAY_Y, with a few cables */
function tray(get: OutfitGet, a: [number, number], b: [number, number], w = 0.45) {
  const alongX = a[1] === b[1]
  const [s0, s1] = alongX ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])]
  const c = alongX ? a[1] : a[0]
  const P = (s: number, d: number, y: number): V3 => (alongX ? [s, y, c + d] : [c + d, y, s])
  for (const sd of [-1, 1]) {
    const lo = P(s0, sd * (w / 2) - 0.003, TRAY_Y)
    const hi = P(s1, sd * (w / 2) + 0.003, TRAY_Y + 0.1)
    boxMinMax(get('tray'), [Math.min(lo[0], hi[0]), lo[1], Math.min(lo[2], hi[2])], [Math.max(lo[0], hi[0]), hi[1], Math.max(lo[2], hi[2])])
  }
  for (let s = s0 + 0.15; s < s1 - 0.05; s += 0.3) box(get('tray'), P(s, 0, TRAY_Y + 0.012), alongX ? [0.03, 0.02, w - 0.01] : [w - 0.01, 0.02, 0.03])
  for (const [d, r] of [
    [-0.12, 0.024],
    [-0.05, 0.03],
    [0.03, 0.02],
    [0.11, 0.026],
  ] as [number, number][])
    tube(get('cable'), P(s0 + 0.05, d, TRAY_Y + 0.022 + r), P(s1 - 0.05, d, TRAY_Y + 0.022 + r), r, 6, true)
}

/** strut bridging two secondaries (along Z from za to zb) at x, under the tray / pipes at y */
function bridgeStrut(get: OutfitGet, x: number, y: number, za: number, zb: number) {
  boxMinMax(get('galv'), [x - 0.021, y - 0.045, za], [x + 0.021, y - 0.004, zb])
  for (const z of [za, zb]) boxMinMax(get('galv'), [x - 0.02, y - 0.04, z - 0.02], [x + 0.02, SEC_BOT, z + 0.02])
}

function lifebuoy(get: OutfitGet, fb: FixtureBatches, x: number, z: number, inward: [number, number]) {
  const [nx, nz] = inward
  const cx = x + nx * 0.09
  const cz = z + nz * 0.09
  const ry = Math.atan2(nx, nz)
  for (let k = 0; k < 8; k++) place(k % 2 ? get('buoyWhite') : get('buoyOrange'), arc(k), [cx, Y + 0.72, cz], [0, ry, 0])
  sign(fb, 'lifebuoy', [cx, Y + 1.38, cz], inward, 0.36)
}
const arcs = new Map<number, THREE.BufferGeometry>()
function arc(k: number) {
  let g = arcs.get(k)
  if (!g) {
    g = new THREE.TorusGeometry(0.31, 0.055, 8, 6, Math.PI / 4)
    g.rotateZ((k * Math.PI) / 4)
    arcs.set(k, g)
  }
  return g
}

export function buildWhpCellarOutfit(get: OutfitGet) {
  // ---- cable tray across the deck (between the secondaries at z −83 / −80.5) + branch to the J-tube
  const zt = -81.75
  tray(get, [0.5, zt], [24.1, zt])
  for (let x = 1.6; x < 24; x += 2.2) bridgeStrut(get, x, TRAY_Y, -83, -80.5)
  const jx = whpJTubeAt(Y)[0]
  tray(get, [jx, zt + 0.25], [jx, WHP_JTUBE.z - 0.35])
  for (const z of [-80.5, -78]) {
    for (const s of [-1, 1]) boxMinMax(get('galv'), [jx + s * 0.29 - 0.02, TRAY_Y - 0.04, z - 0.02], [jx + s * 0.29 + 0.02, SEC_BOT, z + 0.02])
    boxMinMax(get('galv'), [jx - 0.32, TRAY_Y - 0.045, z - 0.021], [jx + 0.32, TRAY_Y - 0.004, z + 0.021])
  }
  // fibre-optic cable tail from the J-tube seal housing up into the tray
  const top = WHP_JACKET.cellarY + 0.97
  pipe(get('cable'), [[jx, top, WHP_JTUBE.z], [jx, top + 0.4, WHP_JTUBE.z], [jx, top + 0.4, WHP_JTUBE.z - 0.3], [jx, TRAY_Y + 0.03, WHP_JTUBE.z - 0.3]], 0.035, 8)
  // ---- instrument air (2") + utility water (2") along X between the secondaries at z −68 / −65.5
  for (const [z, b] of [
    [-66.95, 'galv'],
    [-66.55, 'steelDark'],
  ] as [number, 'galv' | 'steelDark'][])
    pipe(get(b), [[1.8, 26.0, z], [21.5, 26.0, z]], 0.03, 8)
  // (below the 4" WI-N1611 at 26.4 / 6" FW-N2851 at 26.8 that run along Z at x 9.1 / 8.65; struts clear of both)
  for (let x = 2.2; x < 21.5; x += 3) bridgeStrut(get, x, 26.0 - 0.035, -68, -65.5)
  // ---- Ex-d pendants hung from the secondaries
  for (const x of [5, 12, 19]) {
    for (const z of [-83, -75.5, -68]) {
      if (Math.abs(x - 12) < 0.1 && z === -75.5) continue
      tube(get('lampBody'), [x, 26.4, z], [x, SEC_BOT, z], 0.014, 5, true)
      boxMinMax(get('lampBody'), [x - 0.32, 26.27, z - 0.13], [x + 0.32, 26.4, z + 0.13])
      boxMinMax(get('lamp'), [x - 0.28, 26.23, z - 0.09], [x + 0.28, 26.27, z + 0.09])
    }
  }
  // ---- conductor deck collars (split clamps on the grating cut-outs)
  for (const [x, z] of WHP.wells) {
    cylY(get('steelDark'), x, Y - 0.05, Y + 0.12, z, WHP_JACKET.conductorOD / 2 + 0.07, 18)
    for (const s of [-1, 1]) boxMinMax(get('steelDark'), [x - 0.04, Y, z + s * 0.42], [x + 0.04, Y + 0.16, z + s * 0.58])
  }
  // ---- lifebuoys, escape signage, extinguishers
  const fb: FixtureBatches = { lamp: get('lamp'), lampBody: get('lampBody'), buoyOrange: get('buoyOrange'), buoyWhite: get('buoyWhite'), atlas: get('atlas'), signBack: get('signBack') }
  const e = 0.05
  lifebuoy(get, fb, 8, D.z0 + e, [0, 1])
  lifebuoy(get, fb, 18, D.z1 - e, [0, -1])
  lifebuoy(get, fb, D.x1 - e, -70, [-1, 0])
  const stairZ = WHP_STAIR.o[1] - 0.75
  for (const z of [stairZ - 1.6, -72.6]) {
    const x = D.x0 + 0.35
    boxMinMax(get('steelDark'), [x - 0.03, Y, z - 0.03], [x + 0.03, Y + 2.2, z + 0.03])
    sign(fb, 'escape', [x + 0.04, Y + 2.0, z], [1, 0], 0.42)
    // wheeled extinguisher beside the post
    const ex = x - 0.1
    const ez = z - 0.25
    cylY(get('red'), ex, Y + 0.15, Y + 0.95, ez, 0.16, 12)
    sphere(get('red'), [ex, Y + 0.95, ez], 0.16, 10, 6)
  }
}
