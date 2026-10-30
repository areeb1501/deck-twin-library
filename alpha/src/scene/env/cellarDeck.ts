/**
 * Cellar deck (WORLD coords, plate top y = 20 = deck-local -8): framing, plate + grating bays,
 * outline equipment (drain drums, firewater pumps + caissons, casing-head stubs on the conductors),
 * the BOP stack + drilling riser + drill string on the rig slot (RIG_SLOT), guard rails with openings for the stair towers and the boat-landing ladder.
 */
import * as THREE from 'three'
import type { GeoBatch } from '../structure/batch'
import { boxMinMax, place, tube, unitCyl, unitSphere } from '../structure/batch'
import { DECK } from '../structure/deckConst'
import { buildFraming } from '../structure/deckSteel'
import { gratingRect, partition, plateRect, type GratingBatches } from '../structure/panels'
import { perimeterDistance, railPolyline, type RailBatches } from '../structure/handrail'
import { STAIR_TOWERS, towerGap } from '../structure/stairs'
import { JACKET } from './jacket'
import { RIG_SLOT } from '../../model/site'
import type { V3 } from '../structure/batch'

export const CELLAR_Y = 20

export interface CellarBatches extends GratingBatches {
  primary: GeoBatch
  secondary: GeoBatch
  plate: GeoBatch
  rail: RailBatches
  equip: GeoBatch
  equipDark: GeoBatch
  red: GeoBatch
  tree: GeoBatch
}

const cylY = (b: GeoBatch, x: number, y0: number, y1: number, z: number, r: number, seg = 20) =>
  place(b, unitCyl(seg, false), [x, (y0 + y1) / 2, z], [0, 0, 0], [r, y1 - y0, r])
const cylX = (b: GeoBatch, x0: number, x1: number, y: number, z: number, r: number, seg = 20) =>
  place(b, unitCyl(seg, false), [(x0 + x1) / 2, y, z], [0, 0, Math.PI / 2], [r, x1 - x0, r])

export function buildCellarDeck(cb: CellarBatches) {
  const Y = CELLAR_Y
  buildFraming(cb.primary, cb.secondary, Y - 0.03)
  // surfaces: plate except two grating bays and the well bay
  const G = [
    { x0: -22, x1: -9, z0: -6, z1: 6 },
    { x0: 9, x1: 22, z0: -6, z1: 6 },
    { x0: -5, x1: 5, z0: -15, z1: -8.5 },
  ]
  for (const { rect: r, solid } of partition({ x0: DECK.x0, x1: DECK.x1, z0: DECK.z0, z1: DECK.z1 }, G)) {
    if (solid) {
      for (let x = r.x0; x < r.x1 - 0.01; x += 1) gratingRect(cb, x, r.z0, Math.min(x + 1, r.x1), r.z1, Y)
    } else plateRect(cb.plate, r.x0, r.z0, r.x1, r.z1, Y, 0.03)
  }
  // guard rails
  const e = 0.05
  const pts: [number, number][] = [
    [DECK.x0 + e, DECK.z0 + e],
    [DECK.x1 - e, DECK.z0 + e],
    [DECK.x1 - e, DECK.z1 - e],
    [DECK.x0 + e, DECK.z1 - e],
  ]
  const gaps: [number, number][] = STAIR_TOWERS.map((t) => {
    const [g0, g1] = towerGap(t)
    const x = t.edgeX > 0 ? DECK.x1 - e : DECK.x0 + e
    const a = perimeterDistance(pts, x, g0)
    const b = perimeterDistance(pts, x, g1)
    return [Math.min(a, b), Math.max(a, b)]
  })
  const la = perimeterDistance(pts, 4.05, DECK.z1 - e)
  const lb = perimeterDistance(pts, 4.95, DECK.z1 - e)
  gaps.push([Math.min(la, lb), Math.max(la, lb)])
  railPolyline(cb.rail, pts, Y, gaps, true)

  // conductor tops: bare casing-head stubs (the christmas trees are plant equipment, rendered from data);
  // the rig slot carries the BOP stack + drilling riser instead
  for (const [x, z] of JACKET.conductors) {
    if (x === RIG_SLOT[0] && z === RIG_SLOT[1]) continue
    cylY(cb.equipDark, x, 19.4, Y + 0.02, z, 0.4) // casing head stub, flush with the grating
  }
  buildBopStack(cb)
  // closed drain drum on saddles
  cylX(cb.equip, -21, -14, Y + 1.5, -12.5, 1.1, 28)
  for (const x of [-20, -15]) boxMinMax(cb.equipDark, [x - 0.2, Y, -13.4], [x + 0.2, Y + 1.0, -11.6])
  // open drain tank
  cylY(cb.equip, -26, Y, Y + 3.2, -4, 1.4, 28)
  // (firewater + seawater lift caisson pumps, the wellhead control panel and the hypochlorite skid are
  //  plant equipment now — model/alphaSite.ts)

}

/** unit frustum (bottom radius 1, top radius 0.62), +Y, centred */
let _frustum: THREE.BufferGeometry | null = null
const frustum = () => (_frustum ??= new THREE.CylinderGeometry(0.62, 1, 1, 24, 1, false))

/** polyline pipe through world points */
function run(b: GeoBatch, pts: V3[], r: number, seg = 8) {
  for (let i = 0; i < pts.length - 1; i++) tube(b, pts[i], pts[i + 1], r, seg, true)
}

/** RIG_SLOT surface BOP stack (13-5/8" 10k: casing head, drilling spool with choke + kill outlets,
 *  double ram, annular), drilling riser up through the production deck to the weather deck (y 38;
 *  the rig module continues it to the rotary), choke + kill lines to a choke manifold, BOP control
 *  (accumulator) unit with its hydraulic hoses, and the drill string down the conductor into the seabed. */
function buildBopStack(cb: CellarBatches) {
  const Y = CELLAR_Y
  const [x, z] = RIG_SLOT
  const flange = (y: number, r: number) => cylY(cb.equipDark, x, y - 0.07, y + 0.07, z, r, 24)
  // casing head housing + side outlet valves
  cylY(cb.equipDark, x, 19.4, Y + 0.55, z, 0.42, 24)
  flange(Y + 0.55, 0.56)
  for (const s of [-1, 1]) {
    cylX(cb.equipDark, s > 0 ? x + 0.42 : x - 0.85, s > 0 ? x + 0.85 : x - 0.42, Y + 0.25, z, 0.07, 10)
    boxMinMax(cb.equipDark, [x + s * 0.62 - 0.1, Y + 0.12, z - 0.12], [x + s * 0.62 + 0.1, Y + 0.38, z + 0.12])
  }
  // casing spool
  cylY(cb.equipDark, x, Y + 0.62, Y + 1.1, z, 0.4, 24)
  flange(Y + 1.12, 0.56)
  // drilling spool: choke outlet (+x) and kill outlet (-z)
  const yS = Y + 1.5
  cylY(cb.equip, x, Y + 1.19, Y + 1.8, z, 0.42, 24)
  flange(Y + 1.86, 0.6)
  // double ram preventer: body + 4 bonnets / operators along Z (the XT-120 flowline rises 1.4 m west)
  const r0 = Y + 1.93
  const r1 = r0 + 1.35
  boxMinMax(cb.red, [x - 0.55, r0, z - 0.58], [x + 0.55, r1, z + 0.58])
  const cylZ = (b: GeoBatch, za: number, zb: number, y: number, r: number, seg: number) =>
    place(b, unitCyl(seg, false), [x, y, (za + zb) / 2], [Math.PI / 2, 0, 0], [r, Math.abs(zb - za), r])
  for (const yr of [r0 + 0.36, r0 + 1.0]) {
    for (const s of [-1, 1]) {
      cylZ(cb.red, z + s * 0.58, z + s * 1.18, yr, 0.3, 20)
      cylZ(cb.equipDark, z + s * 1.18, z + s * 1.36, yr, 0.24, 16)
      cylZ(cb.equipDark, z + s * 1.36, z + s * 1.62, yr, 0.05, 8) // ram lock
    }
  }
  flange(r1 + 0.04, 0.62)
  // spacer spool
  cylY(cb.equipDark, x, r1 + 0.1, r1 + 0.4, z, 0.4, 24)
  flange(r1 + 0.44, 0.62)
  // annular preventer: body + tapered cap + top flange
  const a0 = r1 + 0.5
  cylY(cb.red, x, a0, a0 + 0.8, z, 0.72, 28)
  place(cb.red, frustum(), [x, a0 + 1.05, z], [0, 0, 0], [0.72, 0.5, 0.72])
  flange(a0 + 1.33, 0.5)
  // riser adapter + drilling riser to the weather deck, centraliser bands, deck collars
  const RR = 0.27
  const yTop = 37.98
  cylY(cb.equipDark, x, a0 + 1.4, a0 + 1.9, z, 0.36, 20)
  cylY(cb.equip, x, a0 + 1.9, yTop, z, RR, 20)
  for (let y = a0 + 3.0; y < yTop - 0.5; y += 2.5) if (Math.abs(y - 28) > 0.8) cylY(cb.equipDark, x, y, y + 0.16, z, RR + 0.05, 20)
  cylY(cb.equipDark, x, 27.98, 28.12, z, 0.46, 24) // production deck penetration sleeve
  cylY(cb.equipDark, x, 37.2, 37.4, z, 0.4, 20) // weather deck underside guide
  // drill string (5" DP) inside riser + conductor, through the seabed to the BHA and bit
  const SB = JACKET.seabed
  cylY(cb.equipDark, x, SB - 12, SB + 0.5, z, 0.17, 12) // 13-3/8" surface casing below the mudline
  tube(cb.equipDark, [x, SB - 15.5, z], [x, yTop, z], 0.064, 8, true)
  for (let y = SB - 6; y < yTop; y += 9.4) cylY(cb.equipDark, x, y, y + 0.45, z, 0.085, 8) // tool joints
  cylY(cb.equipDark, x, SB - 24, SB - 15.5, z, 0.105, 10) // drill collars
  cylY(cb.equipDark, x, SB - 24.3, SB - 24, z, 0.14, 12) // bit sub
  place(cb.red, unitSphere(12, 8), [x, SB - 24.35, z], [0, 0, 0], [0.156, 0.2, 0.156]) // 12-1/4" bit
  // choke line (+x) and kill line (-z): HCR + manual gate valves, then east to the choke manifold
  const valve = (c: V3, alongX: boolean, hcr: boolean) => {
    boxMinMax(cb.equipDark, [c[0] - (alongX ? 0.18 : 0.14), c[1] - 0.14, c[2] - (alongX ? 0.14 : 0.18)], [c[0] + (alongX ? 0.18 : 0.14), c[1] + 0.14, c[2] + (alongX ? 0.14 : 0.18)])
    if (hcr) boxMinMax(cb.red, [c[0] - 0.13, c[1] + 0.14, c[2] - 0.13], [c[0] + 0.13, c[1] + 0.55, c[2] + 0.13])
    else cylY(cb.equipDark, c[0], c[1] + 0.14, c[1] + 0.4, c[2], 0.02, 6)
  }
  const CM = { x0: 6.4, x1: 8.8, z0: -15.2, z1: -11.0 }
  run(cb.equipDark, [[x + 0.42, yS, z], [CM.x0 + 0.3, yS, z]], 0.07)
  valve([x + 0.75, yS, z], true, false)
  valve([x + 1.15, yS, z], true, true)
  run(cb.equipDark, [[x, yS, z - 0.42], [x, yS, z - 1.3], [CM.x0 + 0.3, yS, z - 1.3]], 0.055)
  valve([x, yS, z - 0.7], false, false)
  valve([x, yS, z - 1.05], false, true)
  // choke manifold skid: base, two headers, valves, adjustable chokes, buffer outlet
  boxMinMax(cb.equipDark, [CM.x0, Y, CM.z0], [CM.x1, Y + 0.18, CM.z1])
  for (const zz of [-14.3, -13.0, -11.7]) {
    run(cb.equipDark, [[CM.x0 + 0.3, Y + 0.18, zz], [CM.x0 + 0.3, yS, zz]], 0.07)
    valve([CM.x0 + 0.3, Y + 0.9, zz], false, false)
  }
  run(cb.equipDark, [[CM.x0 + 0.3, yS, -14.3], [CM.x0 + 0.3, yS, -11.7]], 0.08)
  for (const zz of [-14.3, -13.0, -11.7]) {
    run(cb.equipDark, [[CM.x0 + 0.3, yS, zz], [CM.x1 - 0.4, yS, zz]], 0.06)
    valve([CM.x0 + 1.0, yS, zz], true, false)
    boxMinMax(cb.red, [CM.x0 + 1.5, yS - 0.2, zz - 0.2], [CM.x0 + 1.85, yS + 0.2, zz + 0.2]) // choke body
  }
  run(cb.equipDark, [[CM.x1 - 0.4, yS, -14.3], [CM.x1 - 0.4, yS, -11.7]], 0.09)
  cylY(cb.equip, CM.x1 - 0.4, Y + 0.18, yS - 0.1, -11.3, 0.3, 16) // buffer tank
  // BOP control (accumulator) unit: skid, bottle racks, pump/reservoir, control panel
  const AU = { x0: 6.2, x1: 9.6, z0: -19.0, z1: -16.4 }
  boxMinMax(cb.equipDark, [AU.x0, Y, AU.z0], [AU.x1, Y + 0.2, AU.z1])
  for (let i = 0; i < 7; i++) for (const zz of [-18.65, -18.2]) cylY(cb.tree, AU.x0 + 0.3 + i * 0.32, Y + 0.2, Y + 1.55, zz, 0.13, 12)
  boxMinMax(cb.red, [AU.x0, Y + 0.2, -17.85], [AU.x1 - 1.0, Y + 1.3, -16.5]) // reservoir + pumps
  boxMinMax(cb.equip, [AU.x1 - 0.9, Y + 0.2, -17.6], [AU.x1 - 0.2, Y + 1.9, -16.6]) // control panel
  // hydraulic hoses: unit -> along the deck -> BOP functions (annular, upper + lower rams, HCRs)
  const fy = [a0 + 0.4, r0 + 1.0, r0 + 0.36, yS + 0.35]
  fy.forEach((yf, i) => {
    const dz = i * 0.09
    const xh = x + 0.75 + i * 0.09
    const zh = z - 0.45 - dz
    const end: V3 = i === 0 ? [x + 0.6, yf, zh] : i === 3 ? [x + 1.15, yf, z - 0.14] : [x + 0.3, yf, zh]
    run(cb.equipDark, [[AU.x0, Y + 0.3, -17.0 + dz], [xh, Y + 0.3, -17.0 + dz], [xh, Y + 0.3, zh], [xh, yf, zh], [end[0], yf, zh], end], 0.022, 5)
  })
}
