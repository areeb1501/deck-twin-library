/**
 * Platform drilling rig on the Alpha weather deck (WORLD coordinates, weather deck plate top y = 38),
 * centred on the drilling slot RIG_SLOT (3, -13):
 *  - skid beams + open substructure boxes, drill floor at y = 46 with rotary table on the slot
 *  - 43 m lattice derrick (4 legs, girts, X-diagonals, inverted-V V-door on the east face),
 *    racking (monkey) board 27 m above the floor, crown block + gin pole, aviation lights
 *  - travelling block + top drive on drill line, top-drive guide rails, drill string to the rotary
 *  - drawworks (west), driller's cabin / doghouse (south), setback with racked stands
 *  - standpipe up a derrick leg + rotary (kelly) hose, bell nipple / diverter + flowline to the shakers
 *  - riser from the weather deck to the rotary (the cellar deck module brings it up from the BOP)
 *  - V-door pipe ramp + catwalk, pipe deck with drill pipe and casing racks (east)
 *  - mud module (west): 3 triplex mud pumps under a maintenance gantry, active mud tanks with
 *    agitators, shale shakers, walkway + handrails; bulk silo pair (south-west of the mud module)
 * Everything here belongs to the weather deck (hidden with the upper-deck layer).
 *
 * The parts that MOVE while drilling (travelling block + hook + top drive and its guide dolly, the
 * quill / saver sub and the stand of drill pipe, the drill-line falls, the rotary hose, the mud-pump
 * pony rods and crank ends) are not in the static batches: buildTravellingAssembly / buildQuill /
 * buildFalls / rotaryHosePoints / MUD_PUMPS describe them for <RigMotion>.
 *
 * The plant's cooling-medium stubs (CM-1411 / CM-1412) come up through the weather deck at
 * (2.875, -16.3 / -14.8) inside the substructure: the substructure is an open frame there.
 */
import * as THREE from 'three'
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, box, boxMinMax, place, sphere, tube, unitCyl } from '../structure/batch'
import { railPolyline, perimeterDistance, type RailBatches } from '../structure/handrail'
import { ladder } from '../structure/ladder'
import { gratingRect, type GratingBatches } from '../structure/panels'
import { RIG_SLOT } from '../../model/site'
import { UD } from './topsides'

const SX = RIG_SLOT[0]
const SZ = RIG_SLOT[1]
export const RIG = {
  x: SX,
  z: SZ,
  /** drill floor top, world */
  floor: UD + 8,
  /** drill floor plan */
  floorRect: { x0: SX - 6.5, x1: SX + 6.5, z0: SZ - 6.5, z1: SZ + 6.5 },
  /** derrick half-width at the floor / at the crown, height above the floor */
  derrick: { b0: 4.5, b1: 1.4, h: 43, bays: 12 },
  /** racking board height above the drill floor */
  monkey: 27,
  /** top drive (gearbox bottom) height above the floor — static reference pose (mid-stroke) */
  topDrive: 15,
  /** drilling stroke of the top drive (gearbox bottom above the floor): one ~28 m stand, top → bottom */
  stroke: { top: 31.4, bottom: 3.2 },
  /** travelling-block sheave axle above the top-drive gearbox bottom */
  blockAbove: 5.0,
  pipeDeck: { x0: 12.2, x1: 22.3, z0: -19.6, z1: -6.5 },
  mudModule: { x0: -12.5, x1: -4.5, z0: -19.5, z1: -6.5 },
  silos: [
    [-10.5, -3.4],
    [-6.8, -3.4],
  ] as [number, number][],
}

export interface RigBatches extends GratingBatches {
  steel: GeoBatch // substructure, frames
  steelDark: GeoBatch // skid beams, machinery, drill line, tubulars
  derrick: GeoBatch // derrick lattice (painted red)
  plate: GeoBatch // drill floor, ramp, catwalk
  white: GeoBatch // doghouse, silos, top drive
  glass: GeoBatch
  yellow: GeoBatch // travelling block, crown sheaves, finger board
  equip: GeoBatch // mud tanks, pump power ends, riser
  blue: GeoBatch // electric motors
  red: GeoBatch // diverter
  light: GeoBatch // aviation obstruction lights (emissive)
  rail: RailBatches
}

const F = RIG.floor
const cylY = (b: GeoBatch, x: number, y0: number, y1: number, z: number, r: number, seg = 16) =>
  place(b, unitCyl(seg, false), [x, (y0 + y1) / 2, z], [0, 0, 0], [r, y1 - y0, r])
const cylX = (b: GeoBatch, x0: number, x1: number, y: number, z: number, r: number, seg = 16) =>
  place(b, unitCyl(seg, false), [(x0 + x1) / 2, y, z], [0, 0, Math.PI / 2], [r, x1 - x0, r])
const cylZ = (b: GeoBatch, x: number, y: number, z0: number, z1: number, r: number, seg = 16) =>
  place(b, unitCyl(seg, false), [x, y, (z0 + z1) / 2], [Math.PI / 2, 0, 0], [r, z1 - z0, r])
function run(b: GeoBatch, pts: V3[], r: number, seg = 8) {
  for (let i = 0; i < pts.length - 1; i++) tube(b, pts[i], pts[i + 1], r, seg, true)
}
let _cone: THREE.BufferGeometry | null = null
/** unit hopper cone: radius 1 at the top, 0.13 at the bottom, +Y, centred */
const cone = () => (_cone ??= new THREE.CylinderGeometry(1, 0.13, 1, 24, 1, false))
let _dome: THREE.BufferGeometry | null = null
const dome = () => (_dome ??= new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2))

/** derrick half-width at height h above the floor */
const dw = (h: number) => RIG.derrick.b0 + ((RIG.derrick.b1 - RIG.derrick.b0) * h) / RIG.derrick.h
const leg = (sx: number, sz: number, h: number): V3 => [SX + sx * dw(h), F + h, SZ + sz * dw(h)]

export function buildDrillingRig(rb: RigBatches) {
  buildSubstructure(rb)
  buildDerrick(rb)
  buildFloorEquipment(rb)
  buildPipeHandling(rb)
  buildMudModule(rb)
  buildSilos(rb)
}

// ---------------------------------------------------------------- substructure + drill floor
function buildSubstructure(rb: RigBatches) {
  const R = RIG.floorRect
  // skid beams (rig skids east-west over the slots) with end stops
  for (const z of [-18.6, -7.4]) {
    bar(rb.steelDark, [R.x0 - 0.6, UD + 0.45, z], [R.x1 + 1.2, UD + 0.45, z], 1.7, 0.9)
    for (const x of [R.x0 - 0.7, R.x1 + 1.3]) boxMinMax(rb.yellow, [x - 0.15, UD + 0.9, z - 0.85], [x + 0.15, UD + 1.25, z + 0.85])
  }
  // two open substructure boxes (columns, girts, X-bracing) carrying the drill floor girders
  const xs = [R.x0 + 0.2, 0, SX, 6, R.x1 - 0.2]
  const zs = [-19.3, -17.9, -8.1, -6.7]
  const yb = UD + 0.9
  const yt = F - 0.9
  for (const x of xs) for (const z of zs) bar(rb.steel, [x, yb, z], [x, yt, z], 0.36, 0.36, [1, 0, 0])
  for (const z of zs) {
    bar(rb.steel, [xs[0], (yb + yt) / 2, z], [xs[xs.length - 1], (yb + yt) / 2, z], 0.25, 0.3)
    // drill floor main girders
    bar(rb.steel, [R.x0, F - 0.48, z], [R.x1, F - 0.48, z], 0.42, 0.84)
  }
  const ym = (yb + yt) / 2
  for (const z of [zs[0], zs[3]]) {
    for (let i = 0; i < xs.length - 1; i++) {
      for (const [y0, y1] of [
        [yb, ym],
        [ym, yt],
      ]) {
        tube(rb.steel, [xs[i], y0, z], [xs[i + 1], y1, z], 0.09, 6, true)
        tube(rb.steel, [xs[i + 1], y0, z], [xs[i], y1, z], 0.09, 6, true)
      }
    }
  }
  for (const x of [xs[0], xs[xs.length - 1]]) {
    for (const [z0, z1] of [
      [zs[0], zs[1]],
      [zs[2], zs[3]],
    ]) {
      tube(rb.steel, [x, yb, z0], [x, yt, z1], 0.08, 6, true)
      tube(rb.steel, [x, yb, z1], [x, yt, z0], 0.08, 6, true)
    }
  }
  // cross beams under the floor (rotary support beams either side of the well centre)
  for (const x of [R.x0 + 0.2, 0, SX - 1.3, SX + 1.3, 6, R.x1 - 0.2]) bar(rb.steel, [x, F - 0.42, R.z0], [x, F - 0.42, R.z1], 0.35, 0.72, [0, 1, 0])
  // drill floor plate
  boxMinMax(rb.plate, [R.x0, F - 0.06, R.z0], [R.x1, F, R.z1])
  // guard rail round the floor: openings at the V-door (east), the doghouse (south), two ladders
  {
    const e = 0.05
    const pts: [number, number][] = [
      [R.x0 + e, R.z0 + e],
      [R.x1 - e, R.z0 + e],
      [R.x1 - e, R.z1 - e],
      [R.x0 + e, R.z1 - e],
    ]
    const gap = (x: number, z: number, x2: number, z2: number): [number, number] => {
      const a = perimeterDistance(pts, x, z)
      const b = perimeterDistance(pts, x2, z2)
      return [Math.min(a, b), Math.max(a, b)]
    }
    railPolyline(
      rb.rail,
      pts,
      F,
      [
        gap(R.x1 - e, SZ - 0.75, R.x1 - e, SZ + 0.75), // V-door
        gap(-1.5, R.z1 - e, 2.5, R.z1 - e), // doghouse
        gap(R.x1 - e, -17.9, R.x1 - e, -17.1), // NE ladder
        gap(R.x0 + e, -9.4, R.x0 + e, -8.6), // SW ladder
      ],
      true,
    )
  }
  ladder(rb.steel, [R.x1 + 0.4, UD, -17.5], F - UD, [1, 0], true)
  ladder(rb.steel, [R.x0 - 0.4, UD, -9.0], F - UD, [-1, 0], true)

  // riser from the weather deck to the diverter / bell nipple under the rotary, flowline, diverter line
  cylY(rb.steelDark, SX, UD, UD + 0.25, SZ, 0.46, 24) // deck sleeve
  cylY(rb.equip, SX, UD + 0.25, F - 2.4, SZ, 0.27, 20)
  for (let y = UD + 2; y < F - 3; y += 2.5) cylY(rb.steelDark, SX, y, y + 0.16, SZ, 0.32, 20)
  cylY(rb.red, SX, F - 2.4, F - 1.2, SZ, 0.62, 24) // diverter housing
  cylY(rb.steelDark, SX, F - 1.25, F - 1.12, SZ, 0.7, 24)
  cylY(rb.equip, SX, F - 1.12, F - 0.08, SZ, 0.34, 20) // bell nipple
  // flowline to the shale-shaker header (falls ~1:4 towards the mud module)
  run(rb.steelDark, [[SX - 0.3, F - 1.0, SZ], [SX - 1.2, F - 1.05, SZ], [-4.75, UD + 5.05, -9.7]], 0.15, 10)
  // diverter (overboard) line north to the deck edge (between the x = 3 / 6 column lines), with valve
  const xd = SX + 1.5
  run(rb.steelDark, [[SX, F - 1.8, SZ - 0.6], [SX, F - 1.8, SZ - 1.2], [xd, F - 1.8, SZ - 1.2], [xd, F - 1.8, -19.85]], 0.16, 10)
  boxMinMax(rb.red, [xd - 0.3, F - 2.1, -16.6], [xd + 0.3, F - 1.5, -16.0])
  // drill string through the riser (continues below in the cellar module); above the bell nipple the
  // string is drawn by <RigMotion> (it turns and moves with the top drive)
  tube(rb.steelDark, [SX, UD - 0.02, SZ], [SX, F - 0.45, SZ], 0.064, 8, true)
}

// ---------------------------------------------------------------- derrick
function buildDerrick(rb: RigBatches) {
  const { h: H, bays } = RIG.derrick
  const C: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  const dh = H / bays
  // legs: built-up box legs + base shoes
  for (const [sx, sz] of C) {
    tube(rb.derrick, leg(sx, sz, 0), leg(sx, sz, H), 0.21, 8, true)
    const p = leg(sx, sz, 0)
    boxMinMax(rb.steelDark, [p[0] - 0.45, F, p[2] - 0.45], [p[0] + 0.45, F + 0.35, p[2] + 0.45])
  }
  const vBays = 3 // V-door opening height on the east face (bays)
  for (let i = 0; i <= bays; i++) {
    const h0 = i * dh
    for (let k = 0; k < 4; k++) {
      const [ax, az] = C[k]
      const [bx, bz] = C[(k + 1) % 4]
      const east = k === 1
      // girt
      if (i > 0 && !(east && i < vBays)) tube(rb.derrick, leg(ax, az, h0), leg(bx, bz, h0), 0.1, 6, true)
      if (i === bays) continue
      // X-diagonals per bay (none inside the V-door)
      if (east && i < vBays) continue
      const h1 = h0 + dh
      tube(rb.derrick, leg(ax, az, h0), leg(bx, bz, h1), 0.065, 6, true)
      tube(rb.derrick, leg(bx, bz, h0), leg(ax, az, h1), 0.065, 6, true)
    }
    // plan bracing every third level (kept clear of the well centre: corner knee braces)
    if (i > 0 && i < bays && i % 3 === 0) {
      for (let k = 0; k < 4; k++) {
        const [ax, az] = C[k]
        const [bx, bz] = C[(k + 1) % 4]
        const pa = leg(ax, az, h0)
        const pb = leg(bx, bz, h0)
        const pc = leg(C[(k + 3) % 4][0], C[(k + 3) % 4][1], h0)
        const m1: V3 = [pa[0] + (pb[0] - pa[0]) * 0.35, h0 + F, pa[2] + (pb[2] - pa[2]) * 0.35]
        const m2: V3 = [pa[0] + (pc[0] - pa[0]) * 0.35, h0 + F, pa[2] + (pc[2] - pa[2]) * 0.35]
        tube(rb.derrick, m1, m2, 0.055, 6, true)
      }
    }
  }
  // inverted-V V-door frame on the east face
  const apex: V3 = [SX + dw(vBays * dh), F + vBays * dh, SZ]
  tube(rb.derrick, leg(1, -1, 0), apex, 0.12, 6, true)
  tube(rb.derrick, leg(1, 1, 0), apex, 0.12, 6, true)

  // racking (monkey) board: frame, fingers, derrickman's platform outside the east face
  const hm = RIG.monkey
  const ym = F + hm
  const w = dw(hm)
  const xb = SX + w // east face at board height
  bar(rb.steel, [xb, ym, SZ - w], [xb, ym, SZ + w], 0.2, 0.3)
  for (const s of [-1, 1]) bar(rb.steel, [SX + 0.8, ym, SZ + s * (w - 0.05)], [xb, ym, SZ + s * (w - 0.05)], 0.18, 0.25)
  for (let k = 0; k < 6; k++) {
    for (const s of [-1, 1]) {
      const z = SZ + s * (0.56 + k * 0.38)
      bar(rb.yellow, [SX + 0.85, ym + 0.05, z], [xb, ym + 0.05, z], 0.06, 0.12)
    }
  }
  gratingRect(rb, xb, SZ - 1.3, xb + 1.2, SZ + 1.3, ym - 0.12)
  railPolyline(rb.rail, [[xb, SZ - 1.3], [xb + 1.2, SZ - 1.3], [xb + 1.2, SZ + 1.3], [xb, SZ + 1.3]], ym - 0.12)
  for (const s of [-1, 1]) tube(rb.steel, [xb + 1.2, ym - 0.15, SZ + s * 1.3], leg(1, s, hm - 3), 0.06, 6, true)

  // crown: water table, sheave cluster, gin pole, guard rail, aviation lights
  const yc = F + H
  const hw = dw(H)
  boxMinMax(rb.steel, [SX - hw - 0.4, yc - 0.6, SZ - hw - 0.4], [SX + hw + 0.4, yc, SZ + hw + 0.4])
  gratingRect(rb, SX - hw - 0.7, SZ - hw - 0.7, SX + hw + 0.7, SZ + hw + 0.7, yc + 0.03)
  railPolyline(
    rb.rail,
    [
      [SX - hw - 0.65, SZ - hw - 0.65],
      [SX + hw + 0.65, SZ - hw - 0.65],
      [SX + hw + 0.65, SZ + hw + 0.65],
      [SX - hw - 0.65, SZ + hw + 0.65],
    ],
    yc + 0.03,
    [],
    true,
  )
  for (const s of [-1, 1]) boxMinMax(rb.steelDark, [SX - 1.1, yc, SZ + s * 0.95 - 0.08], [SX + 1.1, yc + 1.9, SZ + s * 0.95 + 0.08])
  cylZ(rb.yellow, SX, yc + 1.0, SZ - 0.85, SZ + 0.85, 0.8, 24)
  cylZ(rb.steelDark, SX, yc + 1.0, SZ - 0.95, SZ + 0.95, 0.12, 10)
  cylZ(rb.yellow, SX - 1.4, yc + 1.2, SZ + 0.45, SZ + 0.75, 0.45, 18) // fast-line sheave
  for (const s of [-1, 1]) tube(rb.derrick, [SX + s * 1.5, yc + 0.03, SZ], [SX, yc + 4.6, SZ], 0.1, 6, true)
  tube(rb.derrick, [SX, yc + 4.6, SZ - 0.3], [SX, yc + 4.6, SZ + 0.3], 0.12, 6, true)
  sphere(rb.light, [SX, yc + 4.95, SZ], 0.22, 10, 8)
  for (const [sx, sz] of C) {
    const p: V3 = [SX + sx * (hw + 0.55), yc + 1.4, SZ + sz * (hw + 0.55)]
    tube(rb.steelDark, [p[0], yc + 0.03, p[2]], [p[0], p[1] - 0.15, p[2]], 0.04, 6, true)
    sphere(rb.light, p, 0.17, 10, 8)
    const m = leg(sx, sz, H / 2)
    sphere(rb.light, [m[0] + sx * 0.3, m[1], m[2] + sz * 0.3], 0.16, 10, 8)
  }

  // drill line: fast line to the drawworks, dead line anchor (the 8 falls crown -> block move: buildFalls)
  tube(rb.steelDark, [SX - 1.85, yc + 1.2, SZ + 0.6], [-2.55, F + 1.75, SZ + 0.3], 0.028, 4, true)
  tube(rb.steelDark, [SX - 0.78, yc + 1.0, SZ - 0.75], [-0.9, F + 0.75, SZ - 3.9], 0.028, 4, true)
  boxMinMax(rb.steelDark, [-1.25, F, SZ - 4.25], [-0.55, F + 0.8, SZ - 3.55]) // dead-line anchor

  // top drive guide rails on the drawworks side, tied back to the west face (the dolly rides them)
  const xr = SX - 1.3
  for (const s of [-1, 1]) bar(rb.steelDark, [xr, F + 3, SZ + s * 0.35], [xr, F + H - 4.5, SZ + s * 0.35], 0.18, 0.2, [1, 0, 0])
  for (let h = 6; h < H - 5; h += 7) bar(rb.steelDark, [xr, F + h, SZ], [SX - dw(h), F + h, SZ], 0.12, 0.12)
  for (let h = 6; h < H - 5; h += 7) bar(rb.steelDark, [xr, F + h, SZ - 0.35], [xr, F + h, SZ + 0.35], 0.12, 0.12, [0, 1, 0])

  // standpipe up the SW leg + gooseneck (the rotary hose from here to the top drive moves: rotaryHosePoints)
  const { hs, off, s1, g1, g2, g3 } = standpipe()
  const s0 = off(leg(-1, 1, 0))
  run(rb.steelDark, [[s0[0], UD + 1.8, s0[2]], s0, s1], 0.075, 10)
  for (let h = 2; h < hs; h += 3) {
    const p = off(leg(-1, 1, h))
    bar(rb.steelDark, p, leg(-1, 1, h), 0.08, 0.08)
  }
  run(rb.steelDark, [s1, g1, g2, g3], 0.075, 10)
}

/** standpipe geometry (inboard of the SW leg, clear of the z −8.1 girder) up to its gooseneck g3 */
function standpipe() {
  const hs = 14
  const off = (p: V3): V3 => [p[0] - 0.35, p[1], p[2] - 0.35]
  const s1 = off(leg(-1, 1, hs))
  const g1: V3 = [s1[0], s1[1] + 0.7, s1[2]]
  const g2: V3 = [s1[0] + 0.45, s1[1] + 0.85, s1[2] - 0.45]
  const g3: V3 = [g2[0] + 0.25, g2[1] - 0.5, g2[2] - 0.25]
  return { hs, off, s1, g1, g2, g3 }
}

// ---------------------------------------------------------------- moving parts (drawn by <RigMotion>)
/** crown sheave axle (world y): the drill-line falls hang from here */
export const CROWN_Y = F + RIG.derrick.h + 1.0
/** where the falls reach the travelling block, above the top-drive gearbox bottom */
export const FALLS_BOTTOM = RIG.blockAbove + 0.5
/** top-drive washpipe / gooseneck outlet, relative to the TD frame (well centre, gearbox bottom) */
export const TD_GOOSENECK: V3 = [0.3, 3.3, -0.7]

export interface TravelBatches {
  yellow: GeoBatch
  steelDark: GeoBatch
  white: GeoBatch
  blue: GeoBatch
}

/**
 * Travelling block + hook + links, top drive (frame, AC motor, gearbox, gooseneck), link-tilt bails +
 * elevator and the guide dolly. Frame: origin on the well axis at the top-drive gearbox bottom.
 */
export function buildTravellingAssembly(b: TravelBatches) {
  const yB = RIG.blockAbove
  cylZ(b.yellow, 0, yB, -0.7, 0.7, 0.58, 22)
  for (const s of [-1, 1]) boxMinMax(b.yellow, [-0.62, yB - 0.9, s * 0.72 - 0.05], [0.62, yB + 0.62, s * 0.72 + 0.05])
  cylZ(b.steelDark, 0, yB, -0.8, 0.8, 0.1, 10) // sheave axle
  boxMinMax(b.yellow, [-0.35, yB - 1.25, -0.3], [0.35, yB - 0.6, 0.3]) // hook body
  for (const s of [-1, 1]) bar(b.steelDark, [s * 0.25, yB - 1.25, 0], [s * 0.35, 2.3, 0], 0.08, 0.08, [0, 0, 1])
  boxMinMax(b.white, [-0.6, 0.55, -0.55], [0.6, 2.35, 0.55]) // top drive frame
  cylY(b.blue, 0.15, 1.0, 2.7, 0.85, 0.36, 16) // AC drive motor
  cylY(b.blue, 0.15, 2.7, 2.85, 0.85, 0.24, 12)
  boxMinMax(b.steelDark, [-0.5, 0, -0.5], [0.5, 0.55, 0.5]) // gearbox
  // gooseneck + washpipe
  run(b.steelDark, [[0.3, 2.35, -0.2], [0.3, 3.1, -0.2], TD_GOOSENECK], 0.09, 10)
  // link-tilt bails + elevator (the stand passes through the open elevator while drilling)
  for (const s of [-1, 1]) bar(b.steelDark, [s * 0.35, 0.2, 0], [s * 0.22, -2.4, 0], 0.07, 0.07, [0, 0, 1])
  for (const s of [-1, 1]) boxMinMax(b.yellow, [-0.35, -2.65, s * 0.2 - (s > 0 ? 0.12 : 0)], [0.35, -2.35, s * 0.2 + (s > 0 ? 0 : 0.12)])
  for (const s of [-1, 1]) boxMinMax(b.yellow, [s * 0.35 - (s > 0 ? 0.12 : 0), -2.65, -0.2], [s * 0.35 + (s > 0 ? 0 : 0.12), -2.35, 0.2])
  // guide dolly on the rails
  boxMinMax(b.steelDark, [-1.2, 0.4, -0.45], [-0.6, 2.2, 0.45])
}

/**
 * Quill / main shaft below the gearbox: IBOP valves with their actuator cranks, saver sub. Turns with
 * the string. Frame: origin on the well axis at the gearbox bottom.
 */
export function buildQuill(b: { steelDark: GeoBatch; yellow: GeoBatch }) {
  cylY(b.steelDark, 0, -0.6, 0, 0, 0.11, 12)
  cylY(b.steelDark, 0, -0.42, -0.3, 0, 0.14, 12) // upper IBOP body
  cylY(b.steelDark, 0, -0.22, -0.1, 0, 0.14, 12) // lower IBOP body
  boxMinMax(b.yellow, [0.12, -0.44, -0.04], [0.22, -0.08, 0.04]) // IBOP actuator crank (one side)
  boxMinMax(b.steelDark, [-0.2, -0.36, -0.03], [-0.13, -0.16, 0.03])
}

/** joints (box ends) along a stand, measured down from the saver sub: top, and every single (~9.4 m) */
export const STAND_JOINTS = [0, 9.4, 18.8]
/** saver sub bottom below the gearbox */
export const SAVER_SUB = 0.6

/**
 * Drill-line falls between the crown sheaves (y = 0) and the block (y = −1), x/z relative to the well
 * centre: scale the mesh in y by the current drop (crown − block).
 */
export function buildFalls(b: GeoBatch) {
  for (let k = 0; k < 8; k++) {
    const z = -0.63 + k * 0.18
    const s = k % 2 ? 1 : -1
    tube(b, [s * 0.78, 0, z], [s * 0.5, -1, z], 0.024, 5, true)
  }
}

/**
 * Rotary (kelly) hose from the standpipe gooseneck to the top-drive gooseneck (world coordinates)
 * for the top drive at height yTD (world, gearbox bottom). The hose has a fixed length: it hangs in
 * a deeper loop as the top drive comes down (kept clear of the drill floor).
 */
export function rotaryHosePoints(yTD: number, n = 18): V3[] {
  const A = standpipe().g3
  const B: V3 = [SX + TD_GOOSENECK[0], yTD + TD_GOOSENECK[1], SZ + TD_GOOSENECK[2]]
  const pts = (sag: number) => {
    const out: V3[] = []
    for (let i = 0; i <= n; i++) {
      const t = i / n
      out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t])
    }
    return out
  }
  const len = (p: V3[]) => p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1], q[2] - p[i - 1][2]) : 0), 0)
  // hose length: the chord at the top of the stroke + 1.6 m slack
  const L0 = Math.hypot(B[0] - A[0], F + RIG.stroke.top + TD_GOOSENECK[1] - A[1], B[2] - A[2]) + 1.6
  let lo = 0
  let hi = 20
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (len(pts(mid)) < L0) lo = mid
    else hi = mid
  }
  // lowest point of the loop no lower than ~1 m above the floor
  let sag = lo
  const minY = (p: V3[]) => Math.min(...p.map((q) => q[1]))
  while (sag > 0 && minY(pts(sag)) < F + 1.0) sag -= 0.1
  return pts(Math.max(0, sag))
}

// ---------------------------------------------------------------- drill floor equipment
function buildFloorEquipment(rb: RigBatches) {
  // rotary table + master bushing
  cylY(rb.steelDark, SX, F, F + 0.42, SZ, 0.95, 28)
  cylY(rb.yellow, SX, F + 0.42, F + 0.46, SZ, 0.62, 24)
  cylY(rb.steelDark, SX, F + 0.46, F + 0.52, SZ, 0.24, 16)
  boxMinMax(rb.steelDark, [SX - 1.6, F, SZ - 0.6], [SX - 0.95, F + 0.55, SZ + 0.6]) // rotary drive
  // mousehole
  cylY(rb.steelDark, SX - 1.0, F - 2.5, F + 0.3, SZ - 1.8, 0.13, 10)
  // iron roughneck on its track (parked)
  bar(rb.steelDark, [SX - 2.7, F + 0.05, SZ + 2.3], [SX - 0.4, F + 0.05, SZ + 2.3], 0.5, 0.1)
  boxMinMax(rb.yellow, [SX - 2.6, F + 0.1, SZ + 1.85], [SX - 1.6, F + 1.7, SZ + 2.75])
  bar(rb.yellow, [SX - 1.6, F + 1.1, SZ + 2.3], [SX - 0.9, F + 1.0, SZ + 1.5], 0.35, 0.4)
  // drawworks: skid, drum + brake flanges, gear housings, 2 AC motors, guard
  const x0 = RIG.floorRect.x0 + 0.1
  const x1 = -1.75
  const xc = (x0 + x1) / 2
  boxMinMax(rb.steelDark, [x0, F, SZ - 3], [x1, F + 0.3, SZ + 3])
  cylZ(rb.steelDark, xc, F + 1.2, SZ - 1.1, SZ + 1.1, 0.55, 24)
  for (const s of [-1, 1]) cylZ(rb.steelDark, xc, F + 1.2, SZ + s * 1.1 - 0.06, SZ + s * 1.1 + 0.06, 0.8, 24)
  for (const s of [-1, 1]) boxMinMax(rb.white, [x0 + 0.05, F + 0.3, SZ + s * 1.2 - (s > 0 ? 0 : 0.6)], [x1 - 0.05, F + 2.0, SZ + s * 1.2 + (s > 0 ? 0.6 : 0)])
  for (const s of [-1, 1]) cylZ(rb.blue, xc, F + 1.05, SZ + s * 2.45 - 0.45, SZ + s * 2.45 + 0.45, 0.5, 20)
  boxMinMax(rb.white, [x0 + 0.05, F + 1.9, SZ - 1.2], [x0 + 0.25, F + 2.3, SZ + 1.2])
  // driller's cabin (doghouse) at floor level on the south side, cantilevered, with windows to the well
  const D = { x0: -1.5, x1: 2.5, z0: RIG.floorRect.z1, z1: RIG.floorRect.z1 + 3 }
  boxMinMax(rb.steelDark, [D.x0, F - 0.4, D.z0], [D.x1, F, D.z1])
  boxMinMax(rb.white, [D.x0, F, D.z0], [D.x1, F + 3.0, D.z1])
  boxMinMax(rb.steelDark, [D.x0 - 0.05, F + 3.0, D.z0 - 0.05], [D.x1 + 0.05, F + 3.15, D.z1 + 0.05])
  boxMinMax(rb.glass, [D.x0 + 0.2, F + 1.0, D.z0 - 0.03], [D.x1 - 0.2, F + 2.6, D.z0 + 0.01]) // to the well
  boxMinMax(rb.glass, [D.x1 - 0.01, F + 1.0, D.z0 + 0.25], [D.x1 + 0.03, F + 2.6, D.z1 - 0.4])
  boxMinMax(rb.glass, [D.x0 + 0.3, F + 2.6, D.z0 + 0.2], [D.x1 - 0.3, F + 3.02, D.z0 + 1.1]) // roof window
  boxMinMax(rb.steelDark, [D.x0 - 0.04, F, D.z1 - 1.3], [D.x0 + 0.01, F + 2.1, D.z1 - 0.4]) // door
  for (const x of [D.x0 + 0.4, D.x0 + 2.3]) boxMinMax(rb.glass, [x, F + 1.3, D.z1 - 0.01], [x + 1.3, F + 2.3, D.z1 + 0.03]) // south windows
  boxMinMax(rb.glass, [D.x0 - 0.03, F + 1.3, D.z0 + 0.4], [D.x0 + 0.01, F + 2.3, D.z0 + 1.4]) // west window
  boxMinMax(rb.equip, [D.x0 + 0.4, F + 3.15, D.z1 - 1.3], [D.x0 + 1.6, F + 3.75, D.z1 - 0.2]) // HVAC
  for (const x of [D.x0 + 0.15, D.x1 - 0.15]) bar(rb.steel, [x, UD, D.z1 - 0.15], [x, F - 0.4, D.z1 - 0.15], 0.25, 0.25, [1, 0, 0])
  tube(rb.steel, [D.x0 + 0.15, UD + 0.5, D.z1 - 0.15], [D.x1 - 0.15, F - 0.5, D.z1 - 0.15], 0.07, 6, true)
  // setback: stands of 5" drill pipe racked between the finger board and the setback pads
  const hm = RIG.monkey
  for (const s of [-1, 1]) {
    boxMinMax(rb.steelDark, [SX + 1.3, F, SZ + s * 0.6 - (s > 0 ? 0 : 1.9)], [SX + 4.1, F + 0.12, SZ + s * 0.6 + (s > 0 ? 1.9 : 0)])
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 5; k++) {
        const xbt = SX + 1.5 + i * 0.7
        const z = SZ + s * (0.75 + k * 0.38)
        const xtp = SX + 1.1 + i * 0.42
        const b: V3 = [xbt, F + 0.12, z]
        const t: V3 = [xtp, F + hm + 1.6, z]
        tube(rb.steelDark, b, t, 0.064, 6, true)
        for (const f of [0.34, 0.67]) {
          const p: V3 = [b[0] + (t[0] - b[0]) * f, b[1] + (t[1] - b[1]) * f, b[2]]
          tube(rb.steelDark, p, [p[0] + (t[0] - b[0]) * 0.015, p[1] + 0.4, p[2]], 0.085, 6, true)
        }
      }
    }
  }
}

// ---------------------------------------------------------------- V-door ramp, catwalk, pipe deck
function buildPipeHandling(rb: RigBatches) {
  const R = RIG.floorRect
  const yc = UD + 1.1 // catwalk deck
  const xr = 16.5 // foot of the pipe ramp
  // pipe ramp from the V-door down to the catwalk
  bar(rb.plate, [R.x1, F - 0.06, SZ], [xr, yc - 0.06, SZ], 1.3, 0.1, [0, 1, 0])
  for (const s of [-1, 1]) bar(rb.steel, [R.x1, F + 0.1, SZ + s * 0.68], [xr, yc + 0.1, SZ + s * 0.68], 0.1, 0.3, [0, 1, 0])
  for (const x of [11.2, 13.8]) {
    const y = F + ((yc - F) * (x - R.x1)) / (xr - R.x1) - 0.12
    for (const s of [-1, 1]) bar(rb.steel, [x, UD, SZ + s * 0.55], [x, y, SZ + s * 0.55], 0.2, 0.2, [1, 0, 0])
    bar(rb.steel, [x, y, SZ - 0.65], [x, y, SZ + 0.65], 0.2, 0.2, [0, 1, 0])
  }
  // catwalk machine: frame, deck, kicker arms, a joint of drill pipe waiting
  const xe = 23
  boxMinMax(rb.steelDark, [xr, UD, SZ - 0.85], [xe, yc - 0.1, SZ + 0.85])
  boxMinMax(rb.plate, [xr, yc - 0.1, SZ - 0.85], [xe, yc, SZ + 0.85])
  for (const x of [18, 20, 22]) for (const s of [-1, 1]) bar(rb.yellow, [x, yc, SZ + s * 0.85], [x, yc + 0.18, SZ + s * 1.25], 0.12, 0.1, [0, 1, 0])
  tube(rb.steelDark, [xr + 0.3, yc + 0.07, SZ], [xr + 9.4, yc + 0.07, SZ], 0.064, 8, true)
  boxMinMax(rb.yellow, [xr + 0.1, yc, SZ - 0.35], [xr + 0.5, yc + 0.35, SZ + 0.35]) // skate
  // pipe racks (trestles) north: drill pipe, south: casing
  const P = RIG.pipeDeck
  const bents = [12.9, 15.8, 18.7, 21.6]
  const racks = [
    { z0: -19.3, z1: -14.4 },
    { z0: -11.6, z1: -6.8 },
  ]
  for (const r of racks) {
    for (const x of bents) {
      bar(rb.steelDark, [x, UD + 0.8, r.z0], [x, UD + 0.8, r.z1], 0.3, 0.25, [0, 1, 0])
      for (const z of [r.z0 + 0.2, r.z1 - 0.2]) bar(rb.steelDark, [x, UD, z], [x, UD + 0.68, z], 0.25, 0.25, [1, 0, 0])
      for (const z of [r.z0 + 0.05, r.z1 - 0.05]) bar(rb.steel, [x, UD + 0.92, z], [x, UD + 1.6, z], 0.1, 0.1, [1, 0, 0]) // stanchion pins
    }
  }
  // drill pipe: 3 tiers on dunnage, tool joints at both ends
  {
    const r = racks[0]
    const n = Math.floor((r.z1 - r.z0 - 0.5) / 0.17)
    for (let t = 0; t < 3; t++) {
      const y = UD + 0.925 + 0.064 + t * 0.2
      if (t > 0) for (const x of bents) bar(rb.steel, [x, y - 0.1, r.z0 + 0.15], [x, y - 0.1, r.z1 - 0.15], 0.1, 0.07, [0, 1, 0])
      for (let i = 0; i < n - t; i++) {
        const z = r.z0 + 0.32 + i * 0.17 + t * 0.085
        tube(rb.steelDark, [12.6, y, z], [21.8, y, z], 0.064, 6, true)
        cylX(rb.steelDark, 12.4, 12.8, y, z, 0.083, 6)
        cylX(rb.steelDark, 21.7, 22.05, y, z, 0.083, 6)
      }
    }
  }
  // 13-3/8" casing: 2 tiers, nested, couplings + thread protectors
  {
    const r = racks[1]
    const rc = 0.17
    const n = Math.floor((r.z1 - r.z0 - 0.4) / (2 * rc + 0.03))
    for (let t = 0; t < 2; t++) {
      const y = UD + 0.925 + rc + t * 0.3
      for (let i = 0; i < n - t; i++) {
        const z = r.z0 + 0.4 + i * (2 * rc + 0.03) + t * (rc + 0.015)
        tube(rb.equip, [12.7, y, z], [21.7, y, z], rc, 12, false)
        cylX(rb.steelDark, 21.7, 22.0, y, z, rc + 0.02, 12)
        cylX(rb.blue, 12.5, 12.7, y, z, rc + 0.01, 12)
      }
    }
  }
  // pipe deck kerb markings
  for (const [a, b] of [
    [[P.x0, P.z0], [P.x1, P.z0 + 0.12]],
    [[P.x0, P.z1 - 0.12], [P.x1, P.z1]],
    [[P.x0, P.z0], [P.x0 + 0.12, P.z1]],
    [[P.x1 - 0.12, P.z0], [P.x1, P.z1]],
  ] as [[number, number], [number, number]][])
    boxMinMax(rb.yellow, [a[0], UD, a[1]], [b[0], UD + 0.08, b[1]])
}

// ---------------------------------------------------------------- mud module
/** triplex mud pumps (world): their pony rods and crank-end covers move (drawn by <RigMotion>) */
export const MUD_PUMPS = {
  z: [-18.3, -16.3, -14.3],
  /** power-end face / fluid-end face (x) — the pony rods run between them */
  xPower: RIG.mudModule.x0 + 4.0,
  xFluid: RIG.mudModule.x0 + 4.5,
  /** crankshaft axis (along z) */
  xCrank: RIG.mudModule.x0 + 3.15,
  yCrank: UD + 0.3 + 1.6,
  /** pony-rod axis height and z offsets of the 3 cylinders */
  yRod: UD + 0.3 + 0.85,
  rodDz: [-0.35, 0, 0.35],
  /** half stroke (m) */
  throw: 0.1,
  /** which pumps run while drilling (the third stands by) */
  running: [true, true, false],
}

function buildMudModule(rb: RigBatches) {
  const M = RIG.mudModule
  boxMinMax(rb.steelDark, [M.x0, UD, M.z0], [M.x1, UD + 0.3, M.z1]) // skid base
  const y0 = UD + 0.3
  // ---- pump bay (north): 3 triplex mud pumps along X, overhead maintenance gantry
  const pumpZ = MUD_PUMPS.z
  const P = MUD_PUMPS
  for (const z of pumpZ) {
    boxMinMax(rb.steelDark, [M.x0 + 0.2, y0, z - 0.75], [M.x1 - 1.0, y0 + 0.25, z + 0.75]) // pump skid
    cylX(rb.blue, M.x0 + 0.35, M.x0 + 1.9, y0 + 0.85, z, 0.5, 20) // AC motor
    boxMinMax(rb.blue, [M.x0 + 0.5, y0 + 0.25, z - 0.4], [M.x0 + 1.75, y0 + 0.45, z + 0.4])
    boxMinMax(rb.steelDark, [M.x0 + 1.95, y0 + 0.25, z - 0.72], [M.x0 + 2.35, y0 + 2.3, z + 0.72]) // belt guard
    boxMinMax(rb.equip, [M.x0 + 2.35, y0 + 0.25, z - 0.65], [P.xPower, y0 + 1.6, z + 0.65]) // power end
    cylZ(rb.equip, P.xCrank, P.yCrank, z - 0.65, z + 0.65, 0.62, 20) // crankcase (crank-end cover turns: RigMotion)
    cylZ(rb.equip, P.xCrank, P.yCrank, z - 0.7, z - 0.65, 0.36, 20) // crank-end bearing housing (north side)
    // pony-rod compartment (open, between the power end and the fluid end): crosshead extension
    // stubs + wiper boxes on the power end, liners on the fluid end, spray pan underneath
    for (const dz of P.rodDz) {
      cylX(rb.equip, P.xPower, P.xPower + 0.1, P.yRod, z + dz, 0.12, 14)
      cylX(rb.steelDark, P.xFluid - 0.12, P.xFluid, P.yRod, z + dz, 0.13, 14)
    }
    boxMinMax(rb.steelDark, [P.xPower, y0 + 0.25, z - 0.6], [P.xFluid, y0 + 0.4, z + 0.6]) // spray pan
    for (const s of [-1, 1]) boxMinMax(rb.steelDark, [P.xPower, y0 + 0.4, z + s * 0.6 - 0.02], [P.xFluid, y0 + 0.5, z + s * 0.6 + 0.02])
    boxMinMax(rb.steelDark, [P.xFluid, y0 + 0.35, z - 0.55], [M.x0 + 5.2, y0 + 1.35, z + 0.55]) // fluid end
    for (const dz of [-0.35, 0, 0.35]) cylX(rb.steelDark, M.x0 + 5.2, M.x0 + 5.38, y0 + 0.85, z + dz, 0.13, 12) // valve covers
    cylY(rb.steelDark, M.x0 + 4.8, y0 + 1.35, y0 + 1.7, z, 0.1, 10)
    sphere(rb.red, [M.x0 + 4.8, y0 + 1.95, z], 0.33, 16, 12) // pulsation dampener
    // discharge to the header, suction from the tanks
    run(rb.steelDark, [[M.x0 + 5.2, y0 + 1.15, z], [M.x1 + 0.25, y0 + 1.15, z], [M.x1 + 0.25, UD + 1.8, z]], 0.07)
    run(rb.steelDark, [[M.x0 + 5.0, y0 + 0.45, z + 0.45], [M.x1 - 0.7, y0 + 0.45, z + 0.45]], 0.1)
  }
  // suction header along Z to the tanks, discharge header to the standpipe (enters the substructure)
  run(rb.steelDark, [[M.x1 - 0.7, y0 + 0.45, -19.25], [M.x1 - 0.7, y0 + 0.45, -12.7]], 0.13)
  const sp: V3 = [-1.85, UD + 1.8, -8.85] // standpipe foot (see derrick)
  run(rb.steelDark, [[M.x1 + 0.25, UD + 1.8, pumpZ[0]], [M.x1 + 0.25, UD + 1.8, -9.8], [sp[0], UD + 1.8, -9.8], [sp[0], UD + 1.8, sp[2]]], 0.08)
  // gantry: 4 columns, 2 runway beams along X, bridge + hoist
  const gz = [M.z0 + 0.15, -13.2]
  for (const x of [M.x0 + 0.15, M.x1 - 0.15]) for (const z of gz) bar(rb.steel, [x, UD, z], [x, UD + 4.6, z], 0.3, 0.3, [1, 0, 0])
  for (const z of gz) bar(rb.steel, [M.x0, UD + 4.75, z], [M.x1, UD + 4.75, z], 0.25, 0.4)
  bar(rb.yellow, [-8.4, UD + 5.1, gz[0]], [-8.4, UD + 5.1, gz[1]], 0.3, 0.35, [0, 1, 0])
  boxMinMax(rb.yellow, [-8.75, UD + 4.3, -16.6], [-8.05, UD + 4.92, -16.0])
  tube(rb.steelDark, [-8.4, UD + 4.3, -16.3], [-8.4, UD + 3.2, -16.3], 0.015, 4, true)

  // ---- active mud tanks (south): 2 pits, stiffeners, top grating, agitators, rails, ladder
  const T = { x0: M.x0 + 0.2, x1: M.x1 - 0.1, z0: -12.7, z1: M.z1 - 0.1 }
  const yt = UD + 3.3
  const zMid = (T.z0 + T.z1) / 2
  for (const [z0, z1] of [
    [T.z0, zMid - 0.05],
    [zMid + 0.05, T.z1],
  ]) {
    boxMinMax(rb.equip, [T.x0, y0, z0], [T.x1, yt - 0.05, z1])
    for (let x = T.x0 + 0.8; x < T.x1 - 0.3; x += 1.1) {
      boxMinMax(rb.steelDark, [x - 0.06, y0, z0 - 0.07], [x + 0.06, yt - 0.05, z0])
      boxMinMax(rb.steelDark, [x - 0.06, y0, z1], [x + 0.06, yt - 0.05, z1 + 0.07])
    }
  }
  gratingRect(rb, T.x0, T.z0, T.x1, T.z1, yt)
  for (const z of [T.z0 + 1.45, T.z1 - 1.45]) {
    for (const x of [T.x0 + 1.0, T.x0 + 2.7, T.x0 + 4.4]) {
      boxMinMax(rb.blue, [x - 0.3, yt, z - 0.3], [x + 0.3, yt + 0.45, z + 0.3]) // gearbox
      cylY(rb.blue, x, yt + 0.45, yt + 1.15, z, 0.22, 14) // motor
    }
  }
  // shale shakers (3) on the tank top at the rig end, header box fed by the flowline
  for (const zc of [-11.75, -10.0, -8.25]) {
    boxMinMax(rb.steelDark, [-6.9, yt, zc - 0.7], [-5.15, yt + 0.55, zc + 0.7])
    bar(rb.white, [-6.9, yt + 0.95, zc], [-5.15, yt + 0.75, zc], 1.3, 0.45, [0, 1, 0]) // basket
    for (const s of [-1, 1]) cylX(rb.blue, -6.3, -5.7, yt + 1.2, zc + s * 0.72, 0.17, 12) // vibrator motors
  }
  boxMinMax(rb.steelDark, [-5.15, yt + 0.6, -12.5], [-4.6, yt + 1.95, -7.5]) // possum belly / header box
  railPolyline(
    rb.rail,
    [
      [T.x0 + 0.03, T.z0 + 0.03],
      [T.x1 - 0.03, T.z0 + 0.03],
      [T.x1 - 0.03, T.z1 - 0.03],
      [T.x0 + 0.03, T.z1 - 0.03],
    ],
    yt,
    [[T.x1 - T.x0 + (T.z1 - T.z0) + (T.x1 - T.x0) + 0.6, T.x1 - T.x0 + (T.z1 - T.z0) + (T.x1 - T.x0) + 1.4]],
    true,
  )
  ladder(rb.steel, [T.x0 - 0.35, UD, T.z1 - 1.0], yt - UD, [-1, 0], true)
  // bulk transfer from the silos to a surge hopper on the tank top
  boxMinMax(rb.white, [T.x0 + 1.6, yt, T.z1 - 0.9], [T.x0 + 2.6, yt + 1.4, T.z1 - 0.2])
}

// ---------------------------------------------------------------- bulk silos (barite / bentonite)
function buildSilos(rb: RigBatches) {
  const r = 1.5
  const yCone0 = UD + 1.3
  const yBody0 = UD + 2.6
  const yBody1 = UD + 10.2
  for (const [x, z] of RIG.silos) {
    place(rb.white, cone(), [x, (yCone0 + yBody0) / 2, z], [0, 0, 0], [r, yBody0 - yCone0, r])
    cylY(rb.white, x, yBody0, yBody1, z, r, 28)
    place(rb.white, dome(), [x, yBody1, z], [0, 0, 0], [r, 0.45, r])
    for (const y of [yBody0, yBody0 + 3.8, yBody1 - 0.1]) cylY(rb.steelDark, x, y - 0.06, y + 0.06, z, r + 0.04, 28)
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2
      const px = x + Math.cos(a) * (r - 0.1)
      const pz = z + Math.sin(a) * (r - 0.1)
      bar(rb.steel, [px, UD, pz], [px, yBody0 + 0.6, pz], 0.22, 0.22, [1, 0, 0])
    }
    cylY(rb.steelDark, x, UD + 0.6, yCone0, z, 0.12, 10) // discharge + valve
    boxMinMax(rb.steelDark, [x - 0.18, UD + 0.75, z - 0.18], [x + 0.18, UD + 1.05, z + 0.18])
    // pneumatic transfer line to the surge hopper on the mud tanks
    run(rb.steelDark, [[x, UD + 0.9, z], [x, UD + 0.9, z - 1.9], [x, UD + 4.9, z - 1.9], [-10.2, UD + 4.9, -7.15], [-10.2, UD + 4.7, -7.15]], 0.06)
  }
  // shared roof platform with guard rail + caged ladder
  const [a, b] = RIG.silos
  const p = { x0: a[0] - 1.7, x1: b[0] + 1.7, z0: a[1] - 1.7, z1: a[1] + 1.7 }
  const yp = yBody1 + 0.5
  gratingRect(rb, p.x0, p.z0, p.x1, p.z1, yp)
  bar(rb.steel, [p.x0, yp - 0.15, a[1]], [p.x1, yp - 0.15, a[1]], 0.25, 0.25)
  railPolyline(
    rb.rail,
    [
      [p.x0 + 0.03, p.z0 + 0.03],
      [p.x1 - 0.03, p.z0 + 0.03],
      [p.x1 - 0.03, p.z1 - 0.03],
      [p.x0 + 0.03, p.z1 - 0.03],
    ],
    yp,
    [[(p.x1 - p.x0) * 2 + (p.z1 - p.z0) + 0.4, (p.x1 - p.x0) * 2 + (p.z1 - p.z0) + 1.2]],
    true,
  )
  ladder(rb.steel, [p.x0 - 0.05, UD, a[1] + 0.8], yp - UD, [-1, 0], true)
  box(rb.steelDark, [(a[0] + b[0]) / 2, yp + 0.5, a[1]], [0.6, 1.0, 0.6]) // dust collector
}
