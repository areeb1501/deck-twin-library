/**
 * Alpha cellar deck outfitting (WORLD coordinates; plate top y = 20 = deck-local −8). Environment
 * geometry only — the plant items on this deck (christmas trees, X-1900 wellhead HPU, X-6500 hypochlorite
 * generator, P-6400A/B seawater-lift and P-7101A/B firewater caisson pumps) come from the plant data.
 *
 * Overhead, under the production-deck soffit (HEB 600 bottom flange ≈ 27.37, IPE 300 ≈ 27.67), clear of the
 * plant flowlines (≤ 25.5) and methanol lines (≈ 23):
 *  - ladder cable trays on strut trapezes (two along Z, one cross-deck along X) with drops
 *  - small-bore utility runs (instrument air, nitrogen, utility water) and the 6" firewater ring main
 *  - the well-bay deluge: valve set on the deck at the north edge, riser, header + branches with nozzles
 *  - wellhead control-line tubing tray from X-1900 to each tree
 *  - Ex-d pendant luminaires on the secondary beams; floodlights on the jacket legs
 * On the deck (clusters kept off the walk routes, the stair openings and the boat-landing ladder; see
 * outfitFootprints.ts — the path planner routes round them):
 *  - caisson heads for the produced-water disposal, open-drain sump, closed-drain and seawater dump
 *    caissons (jacket.ts ALPHA_CAISSONS) with the under-deck tie-ins from the plant lines that end here
 *  - J-tube cable tails up to the cross-deck tray; riser hang-off clamps + barriers on the east risers
 *  - bunded chemical tote tanks + chemical-injection pump skid (NW corner)
 *  - laydown / toolbox area: 10 ft tool container, workbench, gas-bottle rack, scaffold-tube rack (SE)
 *  - well-services laydown on the west grating bay: wireline unit, lubricator rack, pressure-control
 *    stack on its test stump, hydraulic power pack, hose basket
 *  - safety shower / eyewash on the potable-water drop; hose reels + extinguishers at the legs
 *  - escape-route walkway paint (green, yellow edge lines) stair-to-stair and to the boat landing,
 *    escape and lifebuoy signage, four lifebuoy stations on the guard rail
 */
import * as THREE from 'three'
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, box, boxMinMax, place, sphere, tube, unitCyl } from '../structure/batch'
import { sign, type FixtureBatches } from '../structure/fixtures'
import { DECK } from '../structure/deckConst'
import { ALPHA_CAISSONS, ALPHA_JTUBES, JACKET } from './jacket'
import { cone } from './jacketDetail'

const Y = 20
/** IPE 300 secondary bottom flange under the production deck (world) */
const SEC_BOT = 27.67

export type OutfitKey =
  | 'steel'
  | 'steelDark'
  | 'galv'
  | 'yellow'
  | 'green'
  | 'red'
  | 'equip'
  | 'equipDark'
  | 'white'
  | 'blue'
  | 'tray'
  | 'cable'
  | 'lamp'
  | 'lampBody'
  | 'walkway'
  | 'atlas'
  | 'signBack'
  | 'buoyOrange'
  | 'buoyWhite'
export type OutfitGet = (k: OutfitKey) => GeoBatch

const cylY = (b: GeoBatch, x: number, y0: number, y1: number, z: number, r: number, seg = 12) =>
  place(b, unitCyl(seg, false), [x, (y0 + y1) / 2, z], [0, 0, 0], [r, y1 - y0, r])
const cylX = (b: GeoBatch, x0: number, x1: number, y: number, z: number, r: number, seg = 12) =>
  place(b, unitCyl(seg, false), [(x0 + x1) / 2, y, z], [0, 0, Math.PI / 2], [r, x1 - x0, r])
const cylZ = (b: GeoBatch, x: number, y: number, z0: number, z1: number, r: number, seg = 12) =>
  place(b, unitCyl(seg, false), [x, y, (z0 + z1) / 2], [Math.PI / 2, 0, 0], [r, z1 - z0, r])
function run(b: GeoBatch, pts: V3[], r: number, seg = 8) {
  for (let i = 0; i < pts.length - 1; i++) tube(b, pts[i], pts[i + 1], r, seg, true)
}
/** pipe run with elbow spheres at the bends (hides the open tube ends) */
function pipe(b: GeoBatch, pts: V3[], r: number, seg = 10) {
  run(b, pts, r, seg)
  for (let i = 1; i < pts.length - 1; i++) sphere(b, pts[i], r * 1.02, seg, 6)
}

// ------------------------------------------------------------------ overhead

/** ladder cable tray between a and b (horizontal, along X or Z), bottom at y, with cables */
function tray(get: OutfitGet, a: [number, number], b: [number, number], y: number, w = 0.6) {
  const alongX = a[1] === b[1]
  const [s0, s1] = alongX ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])]
  const c = alongX ? a[1] : a[0]
  const P = (s: number, d: number, yy: number): V3 => (alongX ? [s, yy, c + d] : [c + d, yy, s])
  for (const sd of [-1, 1]) {
    const d = sd * (w / 2)
    boxMinMax(get('tray'), alongX ? [s0, y, c + d - 0.003] : [c + d - 0.003, y, s0], alongX ? [s1, y + 0.1, c + d + 0.003] : [c + d + 0.003, y + 0.1, s1])
    boxMinMax(get('tray'), alongX ? [s0, y + 0.097, c + d - sd * 0.035 - 0.012] : [c + d - sd * 0.035 - 0.012, y + 0.097, s0], alongX ? [s1, y + 0.1, c + d - sd * 0.035 + 0.012] : [c + d - sd * 0.035 + 0.012, y + 0.1, s1])
  }
  for (let s = s0 + 0.15; s < s1 - 0.05; s += 0.3) box(get('tray'), P(s, 0, y + 0.012), alongX ? [0.03, 0.02, w - 0.01] : [w - 0.01, 0.02, 0.03])
  const cab: [number, number][] = [
    [-0.21, 0.026],
    [-0.14, 0.03],
    [-0.07, 0.02],
    [0.0, 0.034],
    [0.07, 0.022],
    [0.14, 0.028],
    [0.2, 0.018],
  ]
  for (const [d, r] of cab) tube(get('cable'), P(s0 + 0.05, d * (w / 0.6), y + 0.022 + r), P(s1 - 0.05, d * (w / 0.6), y + 0.022 + r), r, 6, true)
}

/** strut-channel trapeze: two drop rods from the secondaries and a cross strut under the tray / pipes */
function trapeze(get: OutfitGet, p: V3, along: 'x' | 'z', half: number, yTop = SEC_BOT) {
  const [x, y, z] = p
  for (const s of [-1, 1]) {
    const q: [number, number] = along === 'x' ? [x, z + s * half] : [x + s * half, z]
    boxMinMax(get('galv'), [q[0] - 0.02, y - 0.04, q[1] - 0.02], [q[0] + 0.02, yTop, q[1] + 0.02])
  }
  if (along === 'x') boxMinMax(get('galv'), [x - 0.021, y - 0.045, z - half - 0.03], [x + 0.021, y - 0.004, z + half + 0.03])
  else boxMinMax(get('galv'), [x - half - 0.03, y - 0.045, z - 0.021], [x + half + 0.03, y - 0.004, z + 0.021])
}

const SECONDARY_Z = DECK.secondaryX // IPE 300 secondaries (along X) at these z
/** firewater ring main z (under the production deck) */
const FW_Z = -5.0
const TRAY_Y = 26.85

function overheadTrays(get: OutfitGet) {
  // two runs along Z, hung at every secondary they pass under
  for (const x of [11.5, -9.5]) {
    tray(get, [x, -15.6], [x, 15.6], TRAY_Y)
    for (const z of SECONDARY_Z) if (z > -15.6 && z < 15.6) trapeze(get, [x, TRAY_Y, z], 'z', 0.36)
  }
  // cross-deck run along X at z 6 (between the secondaries at z 4.5 and 7: trapezes bridge them)
  tray(get, [-27, 6.0], [27, 6.0], TRAY_Y)
  for (let x = -26.4; x < 27; x += 2.0) {
    if (Math.abs(x - 11.5) < 0.6 || Math.abs(x + 9.5) < 0.6) continue
    boxMinMax(get('galv'), [x - 0.021, TRAY_Y - 0.045, 4.5], [x + 0.021, TRAY_Y - 0.004, 7.0])
    for (const z of [4.5, 7.0]) boxMinMax(get('galv'), [x - 0.02, TRAY_Y - 0.04, z - 0.02], [x + 0.02, SEC_BOT, z + 0.02])
  }
  // drops: to the seawater-lift pump motors (east run) and the HPU (west run)
  const drop = (x: number, z: number, yBot: number, face: 'x' | 'z') => {
    const w = 0.3
    for (const s of [-1, 1]) {
      const q: [number, number] = face === 'x' ? [x, z + (s * w) / 2] : [x + (s * w) / 2, z]
      boxMinMax(get('tray'), [q[0] - 0.02, yBot, q[1] - 0.02], [q[0] + 0.02, TRAY_Y, q[1] + 0.02])
    }
    for (const [d, r] of [
      [-0.07, 0.028],
      [0.0, 0.024],
      [0.07, 0.02],
    ] as [number, number][]) {
      const q: [number, number] = face === 'x' ? [x, z + d] : [x + d, z]
      tube(get('cable'), [q[0], yBot + 0.3, q[1]], [q[0], TRAY_Y + 0.05, q[1]], r, 6, true)
    }
    boxMinMax(get('equipDark'), [x - 0.25, yBot - 0.55, z - 0.25], [x + 0.25, yBot + 0.05, z + 0.25]) // junction box
  }
  drop(11.5, -5.2, 23.4, 'x')
  drop(11.5, 8.4, 23.4, 'x')
  drop(-9.5, 9.6, 23.4, 'x')
}

function utilityRuns(get: OutfitGet) {
  // instrument air (2"), nitrogen (1"), utility water (2") along Z at x −11.2, on their own trapezes
  const xs = [-11.45, -11.2, -10.95]
  const rs = [0.03, 0.017, 0.03]
  const yU = 26.45
  for (let i = 0; i < 3; i++) pipe(get(i === 1 ? 'steelDark' : 'galv'), [[xs[i], yU, -15.2], [xs[i], yU, 15.2]], rs[i], 8)
  for (const z of SECONDARY_Z) if (z > -15 && z < 15) trapeze(get, [-11.2, yU - 0.04, z], 'z', 0.4)
  // 6" firewater ring main along X at z −5.0 (bridging the secondaries at −7 / −4.5; clear of the 8" SW-6301
  // riser at x 15.59, z −5.75)
  const yF = 26.35
  pipe(get('red'), [[-23, yF, FW_Z], [23, yF, FW_Z]], 0.084, 12)
  for (let x = -22; x < 23; x += 3) boxMinMax(get('galv'), [x - 0.021, yF - 0.13, -7.0], [x + 0.021, yF - 0.088, -4.5])
  for (let x = -22; x < 23; x += 3) for (const z of [-7.0, -4.5]) boxMinMax(get('galv'), [x - 0.02, yF - 0.13, z - 0.02], [x + 0.02, SEC_BOT, z + 0.02])
  for (const x of [-23, 23]) {
    cylX(get('red'), x - 0.02, x + 0.02, yF, FW_Z, 0.15, 14) // blind flanges
  }
}

/** well-bay deluge: deluge valve set on the deck (north edge), riser, header between the well rows, nozzles */
function deluge(get: OutfitGet) {
  const xv = -6.2
  const zv = -18.95
  const yH = 26.15
  const r = 0.057 // 4"
  // feed from the firewater ring main
  pipe(get('red'), [[xv, 26.35, FW_Z], [xv, yH + 0.25, FW_Z], [xv, yH + 0.25, zv], [xv, Y + 1.9, zv]], r, 10)
  // deluge valve set: skid, isolation valves, DV body with trim, pressure switch; outlet back up
  boxMinMax(get('steelDark'), [xv - 0.95, Y, zv - 0.55], [xv + 0.75, Y + 0.12, zv + 0.55])
  cylY(get('red'), xv, Y + 0.12, Y + 0.4, zv, 0.09, 12)
  boxMinMax(get('red'), [xv - 0.2, Y + 0.95, zv - 0.2], [xv + 0.2, Y + 1.45, zv + 0.2]) // deluge valve body
  cylX(get('red'), xv - 0.42, xv - 0.2, Y + 1.2, zv, 0.11, 12)
  boxMinMax(get('equipDark'), [xv - 0.85, Y + 1.0, zv - 0.15], [xv - 0.42, Y + 1.5, zv + 0.15]) // trim panel
  for (const y of [Y + 0.62, Y + 1.72]) {
    cylY(get('red'), xv, y - 0.06, y + 0.06, zv, 0.13, 14) // flanges
    cylZ(get('red'), xv, y, zv - 0.32, zv + 0.32, 0.018, 6)
  }
  cylZ(get('red'), xv, Y + 1.72, zv + 0.32, zv + 0.36, 0.17, 14) // handwheel
  // outlet riser on the west side (the 4" PW-1104 drop is at x −5.6, z −11.95), header between the well rows
  pipe(get('red'), [[xv, Y + 0.4, zv], [xv - 0.55, Y + 0.4, zv], [xv - 0.55, yH, zv], [xv - 0.55, yH, -11.55], [5.0, yH, -11.55]], r, 10)
  // branches across the rows + open spray nozzles (pointing down)
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    pipe(get('red'), [[x, yH, -14.8], [x, yH, -8.9]], 0.03, 8)
    for (let z = -14.4; z < -8.9; z += 1.4) {
      cylY(get('galv'), x, yH - 0.12, yH, z, 0.018, 6)
      cone(get('galv'), [x, yH - 0.12, z], [x, yH - 0.2, z], 0.022, 0.045, 8)
    }
  }
}

/** wellhead control-line tubing (SSV / SCSSV hydraulics) from the X-1900 HPU to each christmas tree */
function controlLines(get: OutfitGet) {
  const yT = 25.3
  const xr = -6.3
  const zr = -11.55
  // small perforated tray (galv) with four stainless tubes
  const tr = (a: V3, b: V3) => {
    bar(get('galv'), [a[0], a[1] - 0.03, a[2]], [b[0], b[1] - 0.03, b[2]], 0.3, 0.012)
    for (const d of [-0.09, -0.03, 0.03, 0.09]) {
      const off = a[0] === b[0] ? [d, 0] : [0, d]
      tube(get('galv'), [a[0] + off[0], a[1], a[2] + off[1]], [b[0] + off[0], b[1], b[2] + off[1]], 0.008, 4, true)
    }
  }
  tr([xr, yT, 9.2], [xr, yT, zr])
  tr([xr, yT, zr], [4.2, yT, zr])
  // riser from the HPU's west end up to the tray
  for (const d of [-0.09, -0.03, 0.03, 0.09]) tube(get('galv'), [xr + d, Y + 2.0, 9.2], [xr + d, yT, 9.2], 0.008, 4, true)
  bar(get('galv'), [xr, Y + 2.0, 9.3], [xr, yT, 9.3], 0.3, 0.012, [0, 0, 1])
  for (const z of [-12, -9.5, -7, -4.5, 0, 4.5, 7]) for (const s of [-1, 1]) boxMinMax(get('galv'), [xr + s * 0.17 - 0.012, yT - 0.05, z - 0.012], [xr + s * 0.17 + 0.012, SEC_BOT, z + 0.012])
  for (const x of [-4.5, -1.5, 1.5]) for (const s of [-1, 1]) boxMinMax(get('galv'), [x - 0.012, yT - 0.05, zr + s * 0.17 - 0.012], [x + 0.012, 27.94, zr + s * 0.17 + 0.012])
  // drops to each producing tree (west side of the tree, clear of the flowline on the east side)
  for (const [x, z] of JACKET.conductors) {
    if (x === 3 && z === -13) continue // the rig slot: BOP, no tree
    for (const d of [-0.05, 0, 0.05]) tube(get('galv'), [x - 0.3 + d, yT, zr], [x - 0.3 + d, yT, z], 0.008, 4, true)
    for (const d of [-0.05, 0, 0.05]) tube(get('galv'), [x - 0.3 + d, yT, z], [x - 0.3 + d, Y + 2.25, z], 0.008, 4, true)
    boxMinMax(get('galv'), [x - 0.42, Y + 2.1, z - 0.1], [x - 0.18, Y + 2.3, z + 0.1]) // tubing termination block
  }
}

/** Ex-d pendant luminaires hung from the production-deck secondaries */
function pendants(get: OutfitGet) {
  const yL = 26.25
  for (const x of [-23, -15, -5, 6, 15.5, 23]) {
    for (const z of [-14.5, -7, 0, 7, 14.5]) {
      tube(get('lampBody'), [x, yL + 0.15, z], [x, SEC_BOT, z], 0.014, 5, true)
      boxMinMax(get('lampBody'), [x - 0.32, yL + 0.02, z - 0.13], [x + 0.32, yL + 0.15, z + 0.13])
      boxMinMax(get('lamp'), [x - 0.28, yL - 0.02, z - 0.09], [x + 0.28, yL + 0.02, z + 0.09])
    }
  }
}

/** bracket floodlight on a vertical member, pointing along `dir` */
function flood(get: OutfitGet, p: V3, dir: [number, number]) {
  const [dx, dz] = dir
  const e: V3 = [p[0] + dx * 0.35, p[1], p[2] + dz * 0.35]
  tube(get('lampBody'), p, e, 0.025, 6, true)
  const ry = Math.atan2(dx, dz)
  place(get('lampBody'), boxGeo(), [e[0] + dx * 0.12, e[1], e[2] + dz * 0.12], [0, ry, 0], [0.34, 0.22, 0.2])
  place(get('lamp'), boxGeo(), [e[0] + dx * 0.225, e[1] - 0.03, e[2] + dz * 0.225], [0, ry, 0], [0.28, 0.16, 0.01])
}
let _box: THREE.BufferGeometry | null = null
const boxGeo = () => (_box ??= new THREE.BoxGeometry(1, 1, 1))

// ------------------------------------------------------------------ on the deck

function caissonHeads(get: OutfitGet) {
  const yLow = 19.1 // under-deck tie-ins run below the cellar primaries (bottom flange ≈ 19.37)
  for (const c of ALPHA_CAISSONS) {
    if (c.plant) continue
    const big = c.r > 0.5
    const top = Y + (big ? 0.9 : 1.15)
    cylY(get('equip'), c.x, Y, top, c.z, c.r, 16)
    cylY(get('equipDark'), c.x, top, top + 0.08, c.z, c.r + 0.1, 16) // blind / cover flange
    boxMinMax(get('yellow'), [c.x - c.r - 0.3, Y, c.z - c.r - 0.3], [c.x + c.r + 0.3, Y + 0.06, c.z + c.r + 0.3]) // deck penetration coaming
    // vent gooseneck with flame arrestor
    pipe(get('equipDark'), [[c.x + c.r * 0.45, top + 0.08, c.z], [c.x + c.r * 0.45, top + 0.9, c.z], [c.x + c.r * 0.45 + 0.25, top + 0.9, c.z], [c.x + c.r * 0.45 + 0.25, top + 0.7, c.z]], 0.04, 8)
    cylY(get('equipDark'), c.x + c.r * 0.45, top + 0.35, top + 0.5, c.z, 0.07, 10)
    // level transmitter on a nozzle
    cylY(get('equipDark'), c.x - c.r * 0.5, top + 0.08, top + 0.3, c.z, 0.035, 8)
    boxMinMax(get('white'), [c.x - c.r * 0.5 - 0.08, top + 0.3, c.z - 0.08], [c.x - c.r * 0.5 + 0.08, top + 0.48, c.z + 0.08])
    if (big) {
      // open-drain sump: skimmer / sump pump motor on the cover + discharge
      cylY(get('blue'), c.x, top + 0.08, top + 0.75, c.z - 0.15, 0.2, 14)
      cylY(get('blue'), c.x, top + 0.75, top + 0.82, c.z - 0.15, 0.14, 12)
      pipe(get('equipDark'), [[c.x + 0.22, top + 0.3, c.z - 0.15], [c.x + 0.55, top + 0.3, c.z - 0.15], [c.x + 0.55, Y + 3.0, c.z - 0.15]], 0.03, 8)
    }
  }
  const byId = (id: string) => ALPHA_CAISSONS.find((c) => c.id === id)!
  const ug = get('equipDark')
  // produced water (3" PW-4306 / 4307 end at x −28.3, z 11.6 / 14): header under the deck → disposal caisson
  const pw = byId('PW-disposal')
  pipe(ug, [[-28.3, 19.6, 11.6], [-28.3, yLow, 11.6], [-28.3, yLow, 14.0], [-28.3, 19.6, 14.0]], 0.045, 8)
  pipe(ug, [[-28.3, yLow, pw.z], [pw.x + pw.r - 0.05, yLow, pw.z]], 0.045, 8)
  // open drain (1" OD-4604 at −15.63, 11) → sump
  const od = byId('OD-sump')
  pipe(ug, [[-15.63, 19.6, 11.0], [-15.63, yLow, 11.0], [-15.63, yLow, od.z - od.r + 0.05]], 0.02, 6)
  // closed drains (2" CD-4403 at −11.2, 16.9 and CD-5106 at −7.6, 10.93) → closed-drain caisson
  const cd = byId('CD-caisson')
  pipe(ug, [[-11.2, 19.6, 16.9], [-11.2, yLow, 16.9], [-11.2, yLow, cd.z + cd.r - 0.05]], 0.03, 8)
  pipe(ug, [[-7.6, 19.6, 10.93], [-7.6, yLow, 10.93], [-7.6, yLow, cd.z], [cd.x + cd.r - 0.05, yLow, cd.z]], 0.03, 8)
  // seawater overboard (8" SW-6302 at 18.6, −7) → dump caisson
  const sw = byId('SW-dump')
  pipe(ug, [[18.6, 19.6, -7.0], [18.6, yLow, -7.0], [sw.x - sw.r + 0.05, yLow, -7.0]], 0.11, 12)
}

/** J-tube cable tails: from the seal housings up to the cross-deck tray at z 6 */
function jTubeTails(get: OutfitGet) {
  for (const j of ALPHA_JTUBES) {
    const top = Y + 0.97
    pipe(get('cable'), [[j.x, top, j.z], [j.x, top + 0.45, j.z], [j.x, top + 0.45, 5.75], [j.x, TRAY_Y + 0.03, 5.75]], j.r * 0.45, 8)
  }
  // cable ladder up to the tray
  for (const s of [-1, 1]) boxMinMax(get('tray'), [-25.3 + s * 0.22 - 0.02, Y + 0.9, 5.6], [-25.3 + s * 0.22 + 0.02, TRAY_Y, 5.66])
  for (let y = Y + 1.2; y < TRAY_Y; y += 0.3) box(get('tray'), [-25.3, y, 5.63], [0.44, 0.025, 0.02])
  // cable cleats on deck stands
  for (const z of [3.0, 4.6]) boxMinMax(get('steelDark'), [-25.42, Y, z - 0.05], [-25.18, Y + 1.42, z + 0.05])
}

/** hang-off clamp + guard barrier where the oil riser and the spare J-tube pass through the cellar deck */
function riserHangOffs(get: OutfitGet) {
  for (const r of JACKET.risers) {
    if (r.service === 'gas') continue // runs through the P-7101B caisson head (plant clash, reported)
    const x = 27.0
    const z = r.z
    const R = r.nps * 0.0254 * 0.5 + 0.01
    boxMinMax(get('steelDark'), [x - 0.55, Y, z - 0.55], [x + 0.55, Y + 0.16, z + 0.55]) // hang-off base
    cylY(get('steelDark'), x, Y + 0.16, Y + 0.62, z, R + 0.09, 14) // split clamp
    for (const s of [-1, 1]) boxMinMax(get('steelDark'), [x - 0.04, Y + 0.18, z + s * (R + 0.06)], [x + 0.04, Y + 0.6, z + s * (R + 0.24)])
    box(get('yellow'), [x - 0.58, Y + 0.95, z], [0.03, 0.3, 0.55]) // riser ID plate
    bar(get('galv'), [x - 0.56, Y, z], [x - 0.56, Y + 0.8, z], 0.04, 0.04)
    // yellow / black guard posts round it
    for (const [dx, dz] of [
      [-0.85, -0.85],
      [-0.85, 0.85],
      [0.85, -0.85],
      [0.85, 0.85],
    ]) {
      cylY(get('yellow'), x + dx, Y, Y + 1.0, z + dz, 0.06, 8)
      cylY(get('equipDark'), x + dx, Y + 0.45, Y + 0.6, z + dz, 0.062, 8)
    }
    for (const dz of [-0.85, 0.85]) tube(get('yellow'), [x - 0.85, Y + 0.95, z + dz], [x + 0.85, Y + 0.95, z + dz], 0.03, 6, true)
    tube(get('yellow'), [x - 0.85, Y + 0.95, z - 0.85], [x - 0.85, Y + 0.95, z + 0.85], 0.03, 6, true)
  }
}

/** bunded chemical tote tanks (IBCs) + chemical-injection pump skid, NW corner */
function chemicals(get: OutfitGet) {
  const B = { x0: -29.5, x1: -25.3, z0: -19.5, z1: -16.5 }
  // bund: plate floor + kerb
  boxMinMax(get('equipDark'), [B.x0, Y, B.z0], [B.x1, Y + 0.02, B.z1])
  for (const [a, b] of [
    [[B.x0, B.z0], [B.x1, B.z0 + 0.06]],
    [[B.x0, B.z1 - 0.06], [B.x1, B.z1]],
    [[B.x0, B.z0], [B.x0 + 0.06, B.z1]],
    [[B.x1 - 0.06, B.z0], [B.x1, B.z1]],
  ] as [[number, number], [number, number]][])
    boxMinMax(get('yellow'), [a[0], Y, a[1]], [b[0], Y + 0.2, b[1]])
  // three 1 m³ IBC totes: pallet, HDPE tank, galvanised cage, outlet valve
  for (const [cx, cz] of [
    [-28.75, -18.75],
    [-27.4, -18.75],
    [-26.05, -18.75],
    [-28.75, -17.35],
  ] as [number, number][]) {
    const hx = 0.5
    const hz = 0.6
    boxMinMax(get('steelDark'), [cx - hx, Y + 0.02, cz - hz], [cx + hx, Y + 0.16, cz + hz])
    boxMinMax(get('white'), [cx - hx + 0.04, Y + 0.16, cz - hz + 0.04], [cx + hx - 0.04, Y + 1.12, cz + hz - 0.04])
    cylY(get('white'), cx, Y + 1.12, Y + 1.2, cz, 0.12, 10) // filler cap
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ])
      boxMinMax(get('galv'), [cx + sx * hx - 0.015, Y + 0.16, cz + sz * hz - 0.015], [cx + sx * hx + 0.015, Y + 1.16, cz + sz * hz + 0.015])
    for (const y of [Y + 0.6, Y + 1.15]) {
      boxMinMax(get('galv'), [cx - hx, y - 0.012, cz - hz - 0.012], [cx + hx, y + 0.012, cz - hz + 0.012])
      boxMinMax(get('galv'), [cx - hx, y - 0.012, cz + hz - 0.012], [cx + hx, y + 0.012, cz + hz + 0.012])
      boxMinMax(get('galv'), [cx - hx - 0.012, y - 0.012, cz - hz], [cx - hx + 0.012, y + 0.012, cz + hz])
      boxMinMax(get('galv'), [cx + hx - 0.012, y - 0.012, cz - hz], [cx + hx + 0.012, y + 0.012, cz + hz])
    }
    cylX(get('equipDark'), cx + hx, cx + hx + 0.14, Y + 0.3, cz, 0.04, 8)
  }
  // injection pump skid: base, two dosing pumps + motors, calibration pots, discharge tubing up to the soffit
  const P = { x0: -29.5, x1: -27.5, z0: -16.1, z1: -14.9 }
  boxMinMax(get('steelDark'), [P.x0, Y, P.z0], [P.x1, Y + 0.12, P.z1])
  for (const z of [-15.8, -15.2]) {
    cylX(get('blue'), -29.3, -28.75, Y + 0.38, z, 0.13, 12) // motor
    boxMinMax(get('equip'), [-28.75, Y + 0.18, z - 0.14], [-28.35, Y + 0.56, z + 0.14]) // pump head
    cylY(get('white'), -27.85, Y + 0.12, Y + 0.9, z, 0.06, 10) // calibration pot
    pipe(get('galv'), [[-28.35, Y + 0.4, z], [-28.05, Y + 0.4, z], [-28.05, SEC_BOT - 0.05, z]], 0.012, 6)
  }
  boxMinMax(get('equipDark'), [-29.45, Y + 0.12, -14.98], [-28.95, Y + 1.4, -14.9]) // local control station
}

/** laydown / toolbox area (SE): marking, 10 ft tool container, workbench, gas-bottle rack, scaffold-tube rack */
function laydown(get: OutfitGet) {
  const L = { x0: 10.2, x1: 17.8, z0: 15.6, z1: 19.5 }
  const y = Y + 0.003
  const line = (x0: number, z0: number, x1: number, z1: number) => boxMinMax(get('yellow'), [x0, Y, z0], [x1, y, z1])
  line(L.x0, L.z0, L.x1, L.z0 + 0.1)
  line(L.x0, L.z1 - 0.1, L.x1, L.z1)
  line(L.x0, L.z0, L.x0 + 0.1, L.z1)
  line(L.x1 - 0.1, L.z0, L.x1, L.z1)
  // 10 ft tool container (doors west)
  const C = { x0: 10.6, x1: 13.6, z0: 16.9, z1: 19.34 }
  boxMinMax(get('blue'), [C.x0, Y + 0.1, C.z0], [C.x1, Y + 2.59, C.z1])
  for (let x = C.x0 + 0.15; x < C.x1 - 0.1; x += 0.25) {
    boxMinMax(get('blue'), [x, Y + 0.2, C.z0 - 0.03], [x + 0.1, Y + 2.45, C.z0])
    boxMinMax(get('blue'), [x, Y + 0.2, C.z1], [x + 0.1, Y + 2.45, C.z1 + 0.03])
  }
  for (const [x, z] of [
    [C.x0, C.z0],
    [C.x1, C.z0],
    [C.x0, C.z1],
    [C.x1, C.z1],
  ])
    boxMinMax(get('equipDark'), [x - 0.08, Y, z - 0.08], [x + 0.08, Y + 2.62, z + 0.08]) // corner castings
  for (const z of [C.z0 + 0.3, C.z1 - 0.3]) boxMinMax(get('equipDark'), [C.x0 - 0.04, Y + 0.25, z - 0.02], [C.x0, Y + 2.4, z + 0.02]) // door bars
  boxMinMax(get('equipDark'), [C.x0 - 0.02, Y + 0.18, (C.z0 + C.z1) / 2 - 0.01], [C.x0, Y + 2.48, (C.z0 + C.z1) / 2 + 0.01])
  // workbench with vice
  boxMinMax(get('steelDark'), [14.3, Y + 0.85, 18.7], [16.3, Y + 0.92, 19.4])
  for (const x of [14.38, 16.22]) for (const z of [18.78, 19.32]) boxMinMax(get('steelDark'), [x - 0.03, Y, z - 0.03], [x + 0.03, Y + 0.85, z + 0.03])
  boxMinMax(get('steelDark'), [14.3, Y + 0.2, 18.75], [16.3, Y + 0.24, 19.35])
  boxMinMax(get('blue'), [14.5, Y + 0.92, 18.85], [14.75, Y + 1.08, 19.0]) // vice
  boxMinMax(get('red'), [15.4, Y + 0.92, 18.9], [15.95, Y + 1.2, 19.25]) // toolbox
  // gas-bottle rack (2 oxygen, 2 acetylene) with chain bars
  boxMinMax(get('galv'), [14.3, Y, 16.0], [15.5, Y + 0.05, 16.55])
  for (const x of [14.3, 15.5]) boxMinMax(get('galv'), [x - 0.025, Y, 16.0], [x + 0.025, Y + 1.45, 16.05])
  for (const yy of [Y + 0.6, Y + 1.2]) boxMinMax(get('galv'), [14.3, yy - 0.015, 16.48], [15.5, yy + 0.015, 16.53])
  ;[14.5, 14.78, 15.04, 15.3].forEach((x, i) => {
    const b = i < 2 ? get('white') : get('red')
    cylY(b, x, Y + 0.05, Y + 1.4, 16.27, 0.115, 12)
    sphere(b, [x, Y + 1.4, 16.27], 0.115, 10, 6)
    cylY(get('equipDark'), x, Y + 1.5, Y + 1.62, 16.27, 0.04, 8)
  })
  // scaffold-tube rack: two A-frames with tubes laid across
  for (const z of [16.1, 17.6]) {
    for (const x of [16.2, 17.5]) {
      tube(get('galv'), [x, Y, z], [x, Y + 1.0, z], 0.03, 6, true)
      tube(get('galv'), [x, Y, z + 0.5], [x, Y + 1.0, z], 0.025, 6, true)
    }
    tube(get('galv'), [16.2, Y + 1.0, z], [17.5, Y + 1.0, z], 0.025, 6, true)
  }
  for (let i = 0; i < 9; i++) {
    const x = 16.25 + (i % 5) * 0.06 + (i > 4 ? 0.9 : 0)
    const yy = Y + 0.35 + Math.floor(i / 5) * 0.08 + (i % 5) * 0.012
    tube(get('galv'), [x + (i % 2) * 0.2, yy, 15.95], [x + (i % 2) * 0.2, yy, 17.95], 0.024, 6, true)
  }
}

/** well-services laydown (west grating bay): plated area, wireline unit, lubricator rack, PCE on a test stump */
function wellServices(get: OutfitGet) {
  const A = { x0: -21.5, x1: -12.5, z0: -5.0, z1: 3.0 }
  boxMinMax(get('equipDark'), [A.x0, Y, A.z0], [A.x1, Y + 0.03, A.z1]) // laydown plating over the grating
  const yl = Y + 0.033
  for (const [a, b] of [
    [[A.x0, A.z0], [A.x1, A.z0 + 0.1]],
    [[A.x0, A.z1 - 0.1], [A.x1, A.z1]],
    [[A.x0, A.z0], [A.x0 + 0.1, A.z1]],
    [[A.x1 - 0.1, A.z0], [A.x1, A.z1]],
  ] as [[number, number], [number, number]][])
    boxMinMax(get('yellow'), [a[0], Y + 0.03, a[1]], [b[0], yl, b[1]])
  // wireline unit: 20 ft skid cabin (operator end windows), drum end open with the winch drum
  const W = { x0: -21.2, x1: -15.2, z0: -4.7, z1: -2.3 }
  boxMinMax(get('steelDark'), [W.x0, yl, W.z0], [W.x1, yl + 0.18, W.z1])
  boxMinMax(get('white'), [W.x0 + 2.2, yl + 0.18, W.z0], [W.x1, yl + 2.6, W.z1])
  boxMinMax(get('blue'), [W.x0 + 2.2, yl + 0.18, W.z0 - 0.01], [W.x1, yl + 0.55, W.z1 + 0.01]) // stripe
  boxMinMax(get('equipDark'), [W.x0 + 2.19, yl + 1.3, W.z0 + 0.4], [W.x0 + 2.2, yl + 2.1, W.z1 - 0.4]) // window to the drum
  boxMinMax(get('equipDark'), [W.x1 - 1.6, yl + 1.4, W.z1], [W.x1 - 0.4, yl + 2.1, W.z1 + 0.01])
  for (const x of [W.x0 + 0.1, W.x0 + 2.1]) for (const z of [W.z0 + 0.1, W.z1 - 0.1]) boxMinMax(get('steelDark'), [x - 0.06, yl + 0.18, z - 0.06], [x + 0.06, yl + 2.6, z + 0.06])
  boxMinMax(get('steelDark'), [W.x0, yl + 2.55, W.z0], [W.x0 + 2.2, yl + 2.65, W.z1]) // drum-end roof frame
  cylZ(get('equipDark'), W.x0 + 1.1, yl + 1.1, W.z0 + 0.35, W.z1 - 0.35, 0.62, 20) // winch drum
  for (const z of [W.z0 + 0.32, W.z1 - 0.32]) cylZ(get('steelDark'), W.x0 + 1.1, yl + 1.1, z - 0.03, z + 0.03, 0.82, 20)
  // lubricator rack: two A-frames, six lubricator / riser sections with unions
  for (const x of [-15.0, -13.0]) {
    for (const z of [-4.6, -1.8]) boxMinMax(get('steel'), [x - 0.05, yl, z - 0.05], [x + 0.05, yl + 1.1, z + 0.05])
    boxMinMax(get('steel'), [x - 0.06, yl + 0.5, -4.6], [x + 0.06, yl + 0.6, -1.8])
    boxMinMax(get('steel'), [x - 0.06, yl + 1.0, -4.6], [x + 0.06, yl + 1.1, -1.8])
  }
  for (let i = 0; i < 6; i++) {
    const z = -4.3 + (i % 3) * 0.9 + (i > 2 ? 0.45 : 0)
    const y = yl + (i > 2 ? 1.2 : 0.7)
    cylX(get('red'), -15.6, -12.4, y, z, 0.085, 10)
    cylX(get('equipDark'), -15.75, -15.6, y, z, 0.13, 10)
    cylX(get('equipDark'), -12.4, -12.25, y, z, 0.11, 10)
  }
  // pressure-control equipment (wireline valve + grease head) bolted on its test stump
  const px = -13.6
  const pz = 1.6
  boxMinMax(get('steelDark'), [px - 0.6, yl, pz - 0.6], [px + 0.6, yl + 0.25, pz + 0.6])
  cylY(get('equipDark'), px, yl + 0.25, yl + 0.55, pz, 0.2, 14)
  boxMinMax(get('red'), [px - 0.32, yl + 0.55, pz - 0.28], [px + 0.32, yl + 1.05, pz + 0.28]) // dual wireline valve
  for (const s of [-1, 1]) cylX(get('red'), s > 0 ? px + 0.32 : px - 0.62, s > 0 ? px + 0.62 : px - 0.32, yl + 0.8, pz, 0.12, 12)
  cylY(get('red'), px, yl + 1.05, yl + 2.4, pz, 0.085, 12) // lubricator section
  cylY(get('equipDark'), px, yl + 2.4, yl + 2.75, pz, 0.13, 12) // grease injection head
  // hydraulic power pack + hose basket
  boxMinMax(get('steelDark'), [-20.8, yl, 0.2], [-18.9, yl + 0.15, 2.4])
  boxMinMax(get('equip'), [-20.7, yl + 0.15, 0.3], [-19.0, yl + 1.25, 1.6]) // reservoir / enclosure
  cylX(get('blue'), -20.6, -19.6, yl + 0.55, 2.0, 0.25, 14) // motor
  boxMinMax(get('equipDark'), [-19.55, yl + 0.15, 1.75], [-19.05, yl + 1.0, 2.3]) // pump + manifold
  const K = { x0: -18.2, x1: -15.4, z0: 0.4, z1: 2.5 }
  boxMinMax(get('steelDark'), [K.x0, yl, K.z0], [K.x1, yl + 0.08, K.z1])
  for (const [x, z] of [
    [K.x0, K.z0],
    [K.x1, K.z0],
    [K.x0, K.z1],
    [K.x1, K.z1],
  ])
    boxMinMax(get('galv'), [x - 0.04, yl, z - 0.04], [x + 0.04, yl + 0.9, z + 0.04])
  for (const y of [yl + 0.45, yl + 0.9]) {
    boxMinMax(get('galv'), [K.x0, y - 0.02, K.z0 - 0.02], [K.x1, y + 0.02, K.z0 + 0.02])
    boxMinMax(get('galv'), [K.x0, y - 0.02, K.z1 - 0.02], [K.x1, y + 0.02, K.z1 + 0.02])
    boxMinMax(get('galv'), [K.x0 - 0.02, y - 0.02, K.z0], [K.x0 + 0.02, y + 0.02, K.z1])
    boxMinMax(get('galv'), [K.x1 - 0.02, y - 0.02, K.z0], [K.x1 + 0.02, y + 0.02, K.z1])
  }
  // coiled hydraulic hoses in the basket
  for (let i = 0; i < 3; i++) {
    const c: V3 = [K.x0 + 0.7 + i * 0.75, yl + 0.2, (K.z0 + K.z1) / 2]
    place(get('cable'), torus(), c, [Math.PI / 2, 0, 0], [1, 1, 1])
    place(get('cable'), torus(), [c[0], c[1] + 0.07, c[2]], [Math.PI / 2, 0, 0], [0.9, 0.9, 1])
  }
}
let _torus: THREE.BufferGeometry | null = null
const torus = () => (_torus ??= new THREE.TorusGeometry(0.32, 0.035, 6, 16))

/** safety shower + eyewash on the potable-water drop (2" PW-9342 at 8.35, 18.6) */
function safetyShower(get: OutfitGet) {
  const x = 8.95
  const z = 19.05
  const g = get('green')
  boxMinMax(get('steelDark'), [x - 0.4, Y, z - 0.4], [x + 0.4, Y + 0.04, z + 0.4]) // foot plate
  cylY(g, x, Y + 0.04, Y + 2.45, z + 0.3, 0.03, 8)
  pipe(g, [[8.35, Y + 2.45, 18.6], [8.35, Y + 2.45, z + 0.3], [x, Y + 2.45, z + 0.3], [x, Y + 2.45, z]], 0.03, 8)
  cone(g, [x, Y + 2.38, z], [x, Y + 2.28, z], 0.04, 0.16, 12) // shower head
  tube(g, [x + 0.1, Y + 2.4, z], [x + 0.1, Y + 1.7, z], 0.008, 4, true) // pull rod
  cylY(g, x + 0.1, Y + 1.66, Y + 1.72, z, 0.03, 6)
  // eyewash bowl on an arm
  pipe(g, [[x, Y + 1.0, z + 0.3], [x, Y + 1.0, z + 0.05]], 0.025, 8)
  cylY(get('white'), x, Y + 1.0, Y + 1.06, z - 0.05, 0.14, 14)
  // sign board
  box(g, [x + 0.42, Y + 2.0, z + 0.3], [0.02, 0.4, 0.4])
}

/** hose reels + 50 kg wheeled extinguishers by the four jacket legs (inboard side) */
function fireStations(get: OutfitGet) {
  for (const [lx, lz] of DECK.legs) {
    const sx = -Math.sign(lx)
    const sz = -Math.sign(lz)
    const x = lx + sx * 1.15
    const z = lz + sz * 0.2
    // hose reel cabinet on a post
    boxMinMax(get('steelDark'), [x - 0.05, Y, z - 0.05], [x + 0.05, Y + 1.3, z + 0.05])
    cylX(get('red'), x - 0.18, x + 0.18, Y + 1.05, z, 0.36, 18)
    cylX(get('equipDark'), x - 0.19, x + 0.19, Y + 1.05, z, 0.12, 10)
    // wheeled extinguisher beside it
    const ex = x + sx * 0.05
    const ez = z + sz * 0.6
    cylY(get('red'), ex, Y + 0.15, Y + 0.95, ez, 0.16, 12)
    sphere(get('red'), [ex, Y + 0.95, ez], 0.16, 10, 6)
    cylX(get('equipDark'), ex - 0.22, ex + 0.22, Y + 0.14, ez, 0.14, 12)
  }
}

/** escape-route walkway paint (green, yellow edge lines): ST-W ↔ ST-E and the branch to the boat landing */
function walkways(get: OutfitGet) {
  const w = 0.5
  const seg = (x0: number, z0: number, x1: number, z1: number) => {
    const alongX = z0 === z1
    const [a0, a1] = alongX ? [Math.min(x0, x1), Math.max(x0, x1)] : [Math.min(z0, z1), Math.max(z0, z1)]
    const c = alongX ? z0 : x0
    const R = (s0: number, s1: number, d0: number, d1: number) =>
      alongX ? ([[s0, Y, c + d0], [s1, Y + 0.004, c + d1]] as [V3, V3]) : ([[c + d0, Y, s0], [c + d1, Y + 0.004, s1]] as [V3, V3])
    const [g0, g1] = R(a0, a1, -w, w)
    boxMinMax(get('walkway'), g0, g1)
    for (const s of [-1, 1]) {
      const [y0, y1] = R(a0, a1, s > 0 ? w : -w - 0.08, s > 0 ? w + 0.08 : -w)
      boxMinMax(get('yellow'), [y0[0], Y + 0.001, y0[2]], [y1[0], Y + 0.005, y1[2]])
    }
  }
  // ST-W opening (x −30, z 9.2 … 10.3) east along z 9.7, jog south round the HPU, east along z 8
  seg(-29.95, 9.7, -7.5, 9.7)
  seg(-7.5, 9.7 + 0.5, -7.5, 8.0 - 0.5)
  seg(-7.5, 8.0, 23.0, 8.0)
  // north along x 23 to z −14.3, east to the ST-E opening (x 30, z −14.9 … −13.8)
  seg(23.0, 8.0 + 0.5, 23.0, -14.3 - 0.5)
  seg(23.0, -14.3, 29.95, -14.3)
  // branch south along x 7 to the boat-landing ladder (x 4.5, south edge)
  seg(7.0, 8.0 + 0.5, 7.0, 19.4)
  seg(4.0, 19.4, 7.5, 19.4)
}

/** ring lifebuoy on the guard rail with its sign; `inward` = horizontal unit towards the deck */
function lifebuoy(get: OutfitGet, fb: FixtureBatches, x: number, z: number, inward: [number, number]) {
  const [nx, nz] = inward
  const cx = x + nx * 0.09
  const cz = z + nz * 0.09
  const ry = Math.atan2(nx, nz)
  for (let k = 0; k < 8; k++) {
    place(k % 2 ? get('buoyWhite') : get('buoyOrange'), arc(k), [cx, Y + 0.72, cz], [0, ry, 0])
  }
  box(get('lampBody'), [x + nx * 0.05, Y + 1.06, z + nz * 0.05], [nz !== 0 ? 0.12 : 0.04, 0.06, nz !== 0 ? 0.04 : 0.12])
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

function signage(get: OutfitGet) {
  const fb: FixtureBatches = { lamp: get('lamp'), lampBody: get('lampBody'), buoyOrange: get('buoyOrange'), buoyWhite: get('buoyWhite'), atlas: get('atlas'), signBack: get('signBack') }
  const e = 0.05
  lifebuoy(get, fb, -15, DECK.z0 + e, [0, 1])
  lifebuoy(get, fb, 15, DECK.z0 + e, [0, 1])
  lifebuoy(get, fb, -18, DECK.z1 - e, [0, -1])
  lifebuoy(get, fb, DECK.x0 + e, -8, [1, 0])
  // escape signs on the legs, facing the walkways
  const legR = DECK.legOD / 2 + 0.01
  sign(fb, 'escape', [-24 + legR, Y + 2.0, 17], [1, 0])
  sign(fb, 'escape', [24 - legR, Y + 2.0, 17], [-1, 0])
  sign(fb, 'escape', [24, Y + 2.0, -17 + legR], [0, 1])
  sign(fb, 'muster', [-24, Y + 2.0, -17 + legR], [0, 1])
  // escape arrows on posts at the walkway corners
  for (const [x, z, n] of [
    [-7.0, 10.6, [0, -1]],
    [23.6, 8.6, [-1, 0]],
    [23.6, -13.6, [-1, 0]],
    [7.6, 18.8, [-1, 0]],
  ] as [number, number, [number, number]][]) {
    boxMinMax(get('steelDark'), [x - 0.03, Y, z - 0.03], [x + 0.03, Y + 2.2, z + 0.03])
    sign(fb, 'arrow', [x + n[0] * 0.04, Y + 2.0, z + n[1] * 0.04], n, 0.32)
    sign(fb, 'escape', [x - n[0] * 0.04, Y + 2.0, z - n[1] * 0.04], [-n[0], -n[1]], 0.42)
  }
}

/** Alpha cellar deck outfitting (see the file header). */
export function buildCellarOutfit(get: OutfitGet) {
  overheadTrays(get)
  utilityRuns(get)
  deluge(get)
  controlLines(get)
  pendants(get)
  // floodlights on the four jacket legs, pointing into the deck
  for (const [lx, lz] of DECK.legs) {
    const d: [number, number] = [-Math.sign(lx) * Math.SQRT1_2, -Math.sign(lz) * Math.SQRT1_2]
    flood(get, [lx + d[0] * 0.92, 24.6, lz + d[1] * 0.92], d)
  }
  caissonHeads(get)
  jTubeTails(get)
  riserHangOffs(get)
  chemicals(get)
  laydown(get)
  wellServices(get)
  safetyShower(get)
  fireStations(get)
  walkways(get)
  signage(get)
}
