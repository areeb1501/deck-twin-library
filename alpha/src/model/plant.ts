/**
 * PRODUCTION DECK — "Alpha" fixed steel jacket platform.
 *
 * A complete 3-phase separation train authored as data. Everything (3D geometry,
 * tag tree, inspector, flow animation, supports) is generated from this file, so a
 * different plant is "just" a different file of the same shape.
 *
 * Process summary
 *  Wells → M-1000 production manifold → ESDV-1001 → V-1100 HP 3-phase separator (35 barg operating, 42 barg design / PSV set)
 *    gas   → ESDV-2101 → V-2100 compressor suction scrubber → K-2200 export gas compressor
 *            → E-2300 aftercooler → ESDV-2301 → gas export riser
 *            (anti-surge recycle FV-2201 back to suction)
 *    oil   → LV-1101 (with block & bypass) → V-1300 LP separator (8 barg)
 *            → E-1400 crude cooler → P-1500A/B export pumps → LV-1301 → L-1600 pig launcher
 *            → ESDV-1601 → oil export riser
 *    water → LV-1102 → produced-water treatment (cellar deck)
 *  Test header → V-1200 test separator (gas to flare via PCV-1201, liquids to V-1300)
 *  All PSVs + PCV-1301 → 16" flare header on rack tier 2 → V-2400 flare KO drum → flare boom
 *
 * Coordinates: deck-local metres, +X east, +Z south, +Y up, y=0 top of deck plate.
 */
import type {
  CompressorPackage,
  ChemSkid,
  Equipment,
  HorizontalVessel,
  Instrument,
  Manifold,
  Module,
  PigTrap,
  PipeLine,
  Plant,
  PumpPackage,
  ShellTube,
  Valve,
  Vec3,
  VerticalVessel,
} from './types'
import { headDepth, headSurface, nozzle, toDeck, dirToDeck, add, scale } from './geom'
import { GASKET, pipeOD } from './catalog'
import { psvGeometry } from '../scene/equipment/Valve'
import { extendAlpha } from './alphaSite'
import { extendWHP } from './whpSite'
import { extendRP } from './rpSite'
import { extendWI } from './wiSite'
import { extendCranes } from './cranes'
import { ALPHA_WALK } from './site'

// ---------------------------------------------------------------- pipe rack
/** Top-of-steel of the two rack tiers (must match structure/rack.ts) */
export const RACK_TIER = { 1: 4.6, 2: 6.4 } as const
const SHOE = 0.1
/** centreline height of a pipe of size nps resting on a rack tier */
export const onTier = (tier: 1 | 2, nps: number) => RACK_TIER[tier] + SHOE + pipeOD(nps) / 2
/** elevation for pipes crossing over the rack */
const OVER = 7.45
/** cellar deck plate (EL +20 m) in deck-local Y — lines leaving downwards terminate into it */
const CELLAR = -8.4
/** export riser top flanges on the jacket east face (see env/jacket.ts RISER_TOPS) */
const RISER_X = 27.0
const RISER_TOP_Y = -0.7
const FLARE_Z = 1.5
const FLARE_Y = onTier(2, 16)

// ---------------------------------------------------------------- equipment helpers
function hv(
  partial: Omit<HorizontalVessel, 'kind' | 'nozzles' | 'position' | 'rotationY'> & { at: [number, number]; rotationY?: number },
): HorizontalVessel {
  const axisY = partial.elevation + partial.id / 2 + partial.wall
  const { at, ...rest } = partial
  return { ...rest, kind: 'horizontalVessel', position: [at[0], axisY, at[1]], rotationY: partial.rotationY ?? 0, nozzles: [] }
}
const Ro = (v: { id: number; wall: number }) => v.id / 2 + v.wall

/** nozzle on top (+Y) / bottom (-Y) of a horizontal shell at local station x */
function hvTop(v: HorizontalVessel, id: string, name: string, x: number, nps: number, neck = 0.4) {
  v.nozzles.push(nozzle(v, id, name, [x, Ro(v), 0], [0, 1, 0], nps, neck))
}
function hvBottom(v: HorizontalVessel, id: string, name: string, x: number, nps: number, neck = 0.4) {
  v.nozzles.push(nozzle(v, id, name, [x, -Ro(v), 0], [0, -1, 0], nps, neck))
}
/** axial nozzle on a head: end = -1 (west / local -X) or +1 */
function hvHead(v: HorizontalVessel, id: string, name: string, end: 1 | -1, nps: number, neck = 0.45) {
  const apex = v.tt / 2 + headDepth(v.id) + v.wall
  v.nozzles.push(nozzle(v, id, name, [end * apex, 0, 0], [end, 0, 0], nps, neck))
}

// ================================================================= EQUIPMENT
const M1000: Manifold = {
  kind: 'manifold',
  tag: 'M-1000',
  name: 'Production / Test Manifold',
  system: 'production',
  position: [-26.6, 0, -9],
  rotationY: 0,
  slots: 6,
  length: 4.2,
  headers: [
    { name: 'Production header', nps: 12, y: 1.1, z: 0 },
    { name: 'Test header', nps: 6, y: 1.1, z: -1.0 },
  ],
  nozzles: [],
  design: { pressure: '96 barg', temperature: '85 °C', material: 'Duplex SS 22Cr', notes: '4 well slots, flowline risers from wellhead deck' },
}
M1000.nozzles.push(nozzle(M1000, 'N1', 'Production header outlet', [2.1, 1.1, 0], [1, 0, 0], 12, 0.3, 600))
M1000.nozzles.push(nozzle(M1000, 'N2', 'Test header outlet', [2.1, 1.1, -1.0], [1, 0, 0], 6, 0.3, 600))

const V1100 = hv({
  tag: 'V-1100',
  name: 'HP Production Separator (3-phase)',
  system: 'production',
  at: [-13, -9],
  id: 3.6,
  tt: 12,
  wall: 0.056,
  elevation: 2.0,
  saddles: [-4.2, 4.2],
  boots: [{ x: 2.0, d: 0.9, l: 1.0 }],
  internals: ['inletDiverter', 'perforatedBaffle', 'weir', 'vanePack', 'vortexBreaker'],
  levels: { water: 0.22, oil: 0.52 },
  insulated: true,
  design: {
    pressure: '42 barg',
    temperature: '-10 / 120 °C',
    material: 'SA-516 Gr.70 + 3 mm CA',
    capacity: '40 000 bbl/d liquids, 60 MMscfd gas',
    weight: '86 t dry / 172 t operating',
    notes: 'Retention 3 min oil, 5 min water. Vane-pack demister.',
  },
})
hvHead(V1100, 'N1', 'Inlet', -1, 12, 0.5)
hvTop(V1100, 'N2', 'Gas outlet', 5.2, 10, 0.45)
hvBottom(V1100, 'N3', 'Oil outlet', 5.0, 6, 0.4)
// water boot side outlet
V1100.nozzles.push(nozzle(V1100, 'N4', 'Water outlet (boot)', [2.0, -Ro(V1100) - 0.75, -0.45], [0, 0, -1], 4, 0.3))
hvTop(V1100, 'N5', 'PSV connection', -1.0, 4, 0.35)
hvTop(V1100, 'N6', 'Instrument (PT)', -3.0, 2, 0.3)

const V1200 = hv({
  tag: 'V-1200',
  name: 'Test Separator',
  system: 'production',
  at: [-13, -14.6],
  id: 1.8,
  tt: 6,
  wall: 0.032,
  elevation: 1.4,
  saddles: [-2.0, 2.0],
  internals: ['inletDiverter', 'meshPad', 'vortexBreaker'],
  levels: { oil: 0.45 },
  design: { pressure: '42 barg', temperature: '-10 / 120 °C', material: 'SA-516 Gr.70', capacity: '8 000 bbl/d', notes: 'Well testing, 2-phase with coriolis metering' },
})
hvHead(V1200, 'N1', 'Inlet', -1, 6, 0.4)
hvTop(V1200, 'N2', 'Gas outlet', 2.3, 4, 0.35)
hvBottom(V1200, 'N3', 'Liquid outlet', 2.3, 4, 0.35)
hvTop(V1200, 'N4', 'PSV connection', 0.0, 3, 0.35)

const V1300 = hv({
  tag: 'V-1300',
  name: 'LP Separator',
  system: 'production',
  at: [5, -9],
  id: 2.8,
  tt: 9,
  wall: 0.022,
  elevation: 1.6,
  saddles: [-3.2, 3.2],
  internals: ['inletDiverter', 'perforatedBaffle', 'meshPad', 'vortexBreaker'],
  levels: { oil: 0.5 },
  insulated: true,
  design: { pressure: '8 barg', temperature: '0 / 110 °C', material: 'SA-516 Gr.70', capacity: '32 000 bbl/d', notes: 'Second-stage flash' },
})
hvHead(V1300, 'N1', 'Inlet', -1, 8, 0.45)
hvTop(V1300, 'N2', 'Gas outlet', 3.6, 8, 0.4)
hvBottom(V1300, 'N3', 'Oil outlet', 3.6, 8, 0.4)
hvTop(V1300, 'N4', 'PSV connection', 0.0, 4, 0.35)

const E1400: ShellTube = {
  kind: 'shellTube',
  tag: 'E-1400',
  name: 'Crude Oil Cooler',
  system: 'oilExport',
  temaType: 'AES',
  shellOd: 0.9,
  length: 5.5,
  channelLength: 0.75,
  tubeCount: 660,
  tubeOd: 0.01905,
  elevation: 0.35,
  position: [6, 0.35 + 0.45, -14.8],
  rotationY: 0,
  nozzles: [],
  design: { pressure: '12 / 10 barg (S/T)', temperature: '110 → 55 °C', material: 'CS shell / Ti tubes', capacity: '4.1 MW', notes: 'Oil shell side, cooling medium tube side' },
}
{
  const r = E1400.shellOd / 2
  const ch = -E1400.length / 2 - E1400.channelLength / 2
  E1400.nozzles.push(nozzle(E1400, 'N1', 'Shell inlet (crude)', [2.6, r, 0], [0, 1, 0], 8, 0.35))
  E1400.nozzles.push(nozzle(E1400, 'N2', 'Shell outlet (crude)', [-2.0, 0, r], [0, 0, 1], 8, 0.35))
  E1400.nozzles.push(nozzle(E1400, 'N3', 'Channel inlet (CM)', [ch, -0.15, -r], [0, 0, -1], 6, 0.3))
  E1400.nozzles.push(nozzle(E1400, 'N4', 'Channel outlet (CM)', [ch, r, 0], [0, 1, 0], 6, 0.3))
}

function pump(tag: string, at: [number, number], rot: number): PumpPackage {
  const p: PumpPackage = {
    kind: 'pumpPackage',
    tag,
    name: `Crude Export Pump ${tag.slice(-1)}`,
    system: 'oilExport',
    position: [at[0], 0, at[1]],
    rotationY: rot,
    stages: 2,
    motorKw: 450,
    baseplate: [3.4, 1.25],
    nozzles: [],
    design: { pressure: 'Diff. 38 bar', temperature: '55 °C', material: 'API 610 BB2, 12% Cr', capacity: '160 m³/h', vendor: 'API 610 OH2 / 2-stage', notes: '1 × 100 % duty + 1 × 100 % standby. 450 kW EExd motor.' },
  }
  p.nozzles.push(nozzle(p, 'N1', 'Suction', [1.05, 0.8, 0], [1, 0, 0], 8, 0.25))
  p.nozzles.push(nozzle(p, 'N2', 'Discharge', [0.65, 1.15, 0], [0, 1, 0], 6, 0.25))
  return p
}
const P1500A = pump('P-1500A', [15, -13.5], Math.PI)
const P1500B = pump('P-1500B', [16, -10.5], Math.PI)

const L1600: PigTrap = {
  kind: 'pigTrap',
  tag: 'L-1600',
  name: 'Oil Export Pig Launcher',
  system: 'oilExport',
  majorBarrelNps: 10,
  minorBarrelNps: 8,
  length: 4.4,
  elevation: 1.3,
  position: [23, 1.3, -6.5],
  rotationY: Math.PI,
  nozzles: [],
  design: { pressure: '96 barg', temperature: '60 °C', material: 'API 5L X65', notes: 'Quick-opening closure with pressure-warning interlock' },
}
L1600.nozzles.push(nozzle(L1600, 'N1', 'Outlet to export line', [-2.2, 0, 0], [-1, 0, 0], 8, 0.25, 600))
L1600.nozzles.push(nozzle(L1600, 'N2', 'Kicker inlet', [1.0, pipeOD(10) / 2, 0], [0, 1, 0], 6, 0.3, 600))
L1600.nozzles.push(nozzle(L1600, 'N3', 'Vent', [1.6, pipeOD(10) / 2, 0], [0, 1, 0], 2, 0.2, 600))
L1600.nozzles.push(nozzle(L1600, 'N4', 'Drain', [1.4, -pipeOD(10) / 2, 0], [0, -1, 0], 2, 0.2, 600))

const C1700: ChemSkid = {
  kind: 'chemSkid',
  tag: 'C-1700',
  name: 'Chemical Injection Package',
  system: 'utilities',
  skid: [3.4, 2.6],
  tanks: 3,
  position: [25.6, 0, -14],
  rotationY: 0,
  nozzles: [],
  design: { capacity: '3 × 2 m³ (demulsifier, scale inh., corrosion inh.)', pressure: 'up to 110 barg discharge', notes: 'Diaphragm metering pumps, bunded skid' },
}

const V2100: VerticalVessel = {
  kind: 'verticalVessel',
  tag: 'V-2100',
  name: 'Compressor Suction Scrubber',
  system: 'gasCompression',
  id: 1.6,
  tt: 5.4,
  wall: 0.04,
  elevation: 1.0,
  support: 'skirt',
  internals: ['inletDiverter', 'meshPad', 'cyclones', 'vortexBreaker'],
  levels: { liquid: 0.12 },
  platform: true,
  position: [-7.8, 0, 6.5],
  rotationY: 0,
  nozzles: [],
  design: { pressure: '42 barg', temperature: '-10 / 100 °C', material: 'SA-516 Gr.70', capacity: '60 MMscfd', notes: 'Axial cyclone deck, 99.9 % removal ≥ 10 µm' },
}
{
  const r = V2100.id / 2 + V2100.wall
  const topTL = V2100.elevation + V2100.tt
  const inletY = onTier(1, 10) // matches the incoming gas line elevation
  V2100.nozzles.push(nozzle(V2100, 'N1', 'Gas inlet', [0, inletY, -r], [0, 0, -1], 10, 0.4))
  V2100.nozzles.push(nozzle(V2100, 'N2', 'Gas outlet', [0, topTL + headDepth(V2100.id) + V2100.wall, 0], [0, 1, 0], 10, 0.35))
  V2100.nozzles.push(nozzle(V2100, 'N3', 'Liquid outlet', [r, 1.45, 0], [1, 0, 0], 2, 0.3))
  V2100.nozzles.push(nozzle(V2100, 'N4', 'PSV connection', [-0.5, topTL + headSurface(V2100.id, V2100.wall, 0.5), 0], [0, 1, 0], 3, 0.35))
}

const K2200: CompressorPackage = {
  kind: 'compressorPackage',
  tag: 'K-2200',
  name: 'Export Gas Compressor',
  system: 'gasCompression',
  skid: [11, 4],
  motorKw: 6500,
  position: [3.6, 0, 6.5],
  rotationY: 0,
  nozzles: [],
  design: { pressure: '40 → 140 barg', temperature: '35 → 135 °C', capacity: '60 MMscfd', material: 'Barrel casing, 6-stage', vendor: 'VSD motor + speed-increasing gearbox', notes: 'Dry gas seals, active anti-surge control' },
}
K2200.nozzles.push(nozzle(K2200, 'N1', 'Suction', [3.4, 2.55, 0], [0, 1, 0], 10, 0.35, 600))
K2200.nozzles.push(nozzle(K2200, 'N2', 'Discharge', [2.2, 2.55, 0], [0, 1, 0], 8, 0.35, 900))

const E2300: ShellTube = {
  kind: 'shellTube',
  tag: 'E-2300',
  name: 'Export Gas Aftercooler',
  system: 'gasCompression',
  temaType: 'AES',
  shellOd: 0.8,
  length: 5.0,
  channelLength: 0.7,
  tubeCount: 470,
  tubeOd: 0.01905,
  elevation: 0.6,
  position: [4, 0.6 + 0.4, 12.2],
  rotationY: 0,
  nozzles: [],
  design: { pressure: '150 / 10 barg (S/T)', temperature: '135 → 40 °C', material: 'LTCS shell / Duplex tubes', capacity: '5.6 MW' },
}
{
  const r = E2300.shellOd / 2
  const ch = -E2300.length / 2 - E2300.channelLength / 2
  E2300.nozzles.push(nozzle(E2300, 'N1', 'Shell inlet (gas)', [1.8, r, 0], [0, 1, 0], 8, 0.3, 900))
  E2300.nozzles.push(nozzle(E2300, 'N2', 'Shell outlet (gas)', [-1.8, 0, r], [0, 0, 1], 8, 0.35, 900))
  E2300.nozzles.push(nozzle(E2300, 'N3', 'Channel inlet (CM)', [ch, -0.12, -r], [0, 0, -1], 6, 0.3))
  E2300.nozzles.push(nozzle(E2300, 'N4', 'Channel outlet (CM)', [ch, r, 0], [0, 1, 0], 6, 0.3))
}

const V2400 = hv({
  tag: 'V-2400',
  name: 'Flare Knock-Out Drum',
  system: 'flare',
  at: [12.3, 10.6],
  id: 2.4,
  tt: 7,
  wall: 0.02,
  elevation: 1.0,
  saddles: [-2.6, 2.6],
  internals: ['inletDiverter', 'vortexBreaker'],
  levels: { oil: 0.18 },
  design: { pressure: '3.5 barg', temperature: '-46 / 200 °C', material: 'SA-333 Gr.6 (LTCS)', notes: 'Horizontal KO drum, 600 µm droplet removal' },
})
hvTop(V2400, 'N1', 'Inlet (flare header)', -2.5, 16, 0.45)
hvTop(V2400, 'N2', 'Gas outlet to flare', 2.6, 16, 0.45)
hvBottom(V2400, 'N3', 'Liquid outlet', 1.8, 3, 0.3)
hvTop(V2400, 'N4', 'PSV connection', 0.3, 2, 0.3)

const LER: Module = {
  kind: 'module',
  tag: 'B-9100',
  name: 'Local Equipment Room (LER)',
  system: 'utilities',
  size: [9, 3.8, 7],
  position: [21.3, 0, 9.6],
  rotationY: 0,
  interior: 'switchgear',
  doors: [
    { id: 'D1', wall: '-z', at: -1.6, width: 1.8, double: true }, // main doors to the north walkway
    { id: 'D2', wall: '-x', at: 1.2, width: 1.0 }, // escape door, west
  ],
  nozzles: [],
  design: { notes: 'A60 fire-rated, pressurised. MCC, VSD for K-2200, UPS, F&G panel.' },
}

export const equipment: Equipment[] = [M1000, V1100, V1200, V1300, E1400, P1500A, P1500B, L1600, C1700, V2100, K2200, E2300, V2400, LER]

// ================================================================= LINES
const eqByTag = new Map(equipment.map((e) => [e.tag, e]))
function N(tag: string, id: string) {
  const n = eqByTag.get(tag)?.nozzles.find((x) => x.id === id)
  if (!n) throw new Error(`nozzle ${tag}/${id} missing`)
  return n
}
const P = (tag: string, id: string): Vec3 => N(tag, id).pos

/** deck-frame outlet face of a PSV sitting on a nozzle, discharging horizontally along outDir */
function psvOutlet(tag: string, id: string, outDir: Vec3) {
  const n = N(tag, id)
  const g = psvGeometry(n.nps)
  return { pos: add(add(n.pos, scale(n.dir, g.outletY + GASKET)), scale(outDir, g.outletX)), nps: g.outletNps }
}

type L = Omit<PipeLine, 'schedule' | 'spec' | 'design'> & Partial<Pick<PipeLine, 'schedule' | 'spec' | 'design'>>
const line = (l: L): PipeLine => ({
  schedule: l.nps >= 10 ? 'XS' : '80',
  spec: l.service === 'firewater' ? 'F1A' : l.service === 'flare' ? 'B1A' : 'C3A',
  design: {},
  ...l,
})

const lines: PipeLine[] = []
const add_ = (l: L) => (lines.push(line(l)), l.tag)

// --- production inlet
const pIn = P('M-1000', 'N1')
const L_INLET = add_({
  tag: '12"-PM-1001-D6A-H',
  service: 'multiphase',
  system: 'production',
  nps: 12,
  schedule: '80',
  spec: 'D6A',
  insulation: 'H',
  route: [pIn, [-21.4, pIn[1], pIn[2]], [-21.4, P('V-1100', 'N1')[1], pIn[2]], P('V-1100', 'N1')],
  from: { equipment: 'M-1000', nozzle: 'N1' },
  to: { equipment: 'V-1100', nozzle: 'N1' },
  design: { pressure: '96 barg', temperature: '85 °C', notes: 'Duplex, heat-traced' },
})

const tIn = P('M-1000', 'N2')
const tV = P('V-1200', 'N1')
const L_TEST = add_({
  tag: '6"-PM-1002-D6A-H',
  service: 'multiphase',
  system: 'production',
  nps: 6,
  insulation: 'H',
  route: [tIn, [-23.0, tIn[1], tIn[2]], [-23.0, tIn[1], tV[2]], [-19.6, tIn[1], tV[2]], [-19.6, tV[1], tV[2]], tV],
  from: { equipment: 'M-1000', nozzle: 'N2' },
  to: { equipment: 'V-1200', nozzle: 'N1' },
  design: { pressure: '96 barg', temperature: '85 °C' },
})

// --- HP separator gas to scrubber (crosses the rack above tier 2)
const g0 = P('V-1100', 'N2')
const s0 = P('V-2100', 'N1')
const L_GAS = add_({
  tag: '10"-PG-1101-C3A-N',
  service: 'gas',
  system: 'gasCompression',
  nps: 10,
  route: [g0, [g0[0], OVER, g0[2]], [g0[0], OVER, 4.0], [g0[0], s0[1], 4.0], s0],
  from: { equipment: 'V-1100', nozzle: 'N2' },
  to: { equipment: 'V-2100', nozzle: 'N1' },
  design: { pressure: '42 barg', temperature: '65 °C' },
})

// --- HP separator oil → LV-1101 station → LP separator
const o0 = P('V-1100', 'N3')
const o1 = P('V-1300', 'N1')
const L_OIL1 = add_({
  tag: '6"-PO-1102-C3A-H',
  service: 'oil',
  system: 'production',
  nps: 6,
  insulation: 'H',
  route: [o0, [o0[0], 0.9, o0[2]], [-2.0, 0.9, o0[2]], [-2.0, o1[1], o0[2]], o1],
  from: { equipment: 'V-1100', nozzle: 'N3' },
  to: { equipment: 'V-1300', nozzle: 'N1' },
  design: { pressure: '42 barg', temperature: '65 °C' },
})
const L_OIL1BP = add_({
  tag: '4"-PO-1103-C3A-H',
  service: 'oil',
  system: 'production',
  nps: 4,
  insulation: 'H',
  route: [
    [-7.35, 0.9, o0[2]],
    [-7.35, 0.9, o0[2] - 0.85],
    [-2.65, 0.9, o0[2] - 0.85],
    [-2.65, 0.9, o0[2]],
  ],
  from: { line: L_OIL1 },
  to: { line: L_OIL1 },
  design: { notes: 'LV-1101 bypass' },
})

// --- produced water from boot
const w0 = P('V-1100', 'N4')
const L_WATER = add_({
  tag: '4"-PW-1104-C3A-N',
  service: 'water',
  system: 'production',
  nps: 4,
  route: [w0, [w0[0], w0[1], -11.95], [-5.6, w0[1], -11.95], [-5.6, CELLAR, -11.95]],
  from: { equipment: 'V-1100', nozzle: 'N4' },
  to: { offDeck: 'Produced water hydrocyclones (cellar deck)' },
  design: { pressure: '42 barg', temperature: '65 °C' },
})

// --- test separator
const tg = P('V-1200', 'N2')
const L_TGAS = add_({
  tag: '4"-PG-1201-C3A-N',
  service: 'gas',
  system: 'production',
  nps: 4,
  route: [tg, [tg[0], OVER, tg[2]], [tg[0], OVER, FLARE_Z], [tg[0], FLARE_Y, FLARE_Z]],
  from: { equipment: 'V-1200', nozzle: 'N2' },
  to: { line: '16"-FL-2401-B1A-N' },
  design: { pressure: '42 barg', temperature: '65 °C' },
})
const tl = P('V-1200', 'N3')
const L_TLIQ = add_({
  tag: '4"-PO-1202-C3A-H',
  service: 'oil',
  system: 'production',
  nps: 4,
  insulation: 'H',
  route: [tl, [tl[0], 0.5, tl[2]], [tl[0], 0.5, -12.7], [-2.0, 0.5, -12.7], [-2.0, 2.6, -12.7], [-2.0, 2.6, o0[2]]],
  from: { equipment: 'V-1200', nozzle: 'N3' },
  to: { line: L_OIL1 },
})

// --- LP separator
const lg = P('V-1300', 'N2')
const L_LPGAS = add_({
  tag: '8"-PG-1301-B1A-N',
  service: 'gas',
  system: 'flare',
  nps: 8,
  route: [lg, [lg[0], OVER, lg[2]], [lg[0], OVER, FLARE_Z], [lg[0], FLARE_Y, FLARE_Z]],
  from: { equipment: 'V-1300', nozzle: 'N2' },
  to: { line: '16"-FL-2401-B1A-N' },
  design: { pressure: '8 barg', temperature: '60 °C' },
})
const lo = P('V-1300', 'N3')
const ei = P('E-1400', 'N1')
const L_OIL2 = add_({
  tag: '8"-PO-1302-C3A-H',
  service: 'oil',
  system: 'oilExport',
  nps: 8,
  insulation: 'H',
  route: [lo, [lo[0], 0.5, lo[2]], [lo[0], 0.5, -11.2], [lo[0], 2.85, -11.2], [ei[0], 2.85, ei[2]], ei],
  from: { equipment: 'V-1300', nozzle: 'N3' },
  to: { equipment: 'E-1400', nozzle: 'N1' },
  design: { pressure: '8 barg', temperature: '60 °C' },
})

// --- cooler outlet → pump suction (with tee to B)
const eo = P('E-1400', 'N2')
const sA = P('P-1500A', 'N1')
const sB = P('P-1500B', 'N1')
const L_SUCT = add_({
  tag: '8"-PO-1401-C3A-N',
  service: 'oil',
  system: 'oilExport',
  nps: 8,
  route: [eo, [eo[0], eo[1], -12.0], [12.4, eo[1], -12.0], [12.4, eo[1], sA[2]], sA],
  from: { equipment: 'E-1400', nozzle: 'N2' },
  to: { equipment: 'P-1500A', nozzle: 'N1' },
  design: { pressure: '6 barg', temperature: '45 °C' },
})
const L_SUCTB = add_({
  tag: '8"-PO-1402-C3A-N',
  service: 'oil',
  system: 'oilExport',
  nps: 8,
  route: [[10.6, eo[1], -12.0], [10.6, eo[1], sB[2]], sB],
  from: { line: L_SUCT },
  to: { equipment: 'P-1500B', nozzle: 'N1' },
})

// --- pump discharges → header → pig launcher kicker
const dA = P('P-1500A', 'N2')
const dB = P('P-1500B', 'N2')
const kick = P('L-1600', 'N2')
const HDR_Y = 3.2
const L_DISCH = add_({
  tag: '6"-PO-1501-D6A-N',
  service: 'oil',
  system: 'oilExport',
  nps: 6,
  route: [dA, [dA[0], HDR_Y, dA[2]], [dA[0], HDR_Y, -12.0], [kick[0], HDR_Y, -12.0], [kick[0], HDR_Y, kick[2]], kick],
  from: { equipment: 'P-1500A', nozzle: 'N2' },
  to: { equipment: 'L-1600', nozzle: 'N2' },
  design: { pressure: '96 barg', temperature: '48 °C' },
})
const L_DISCHB = add_({
  tag: '6"-PO-1502-D6A-N',
  service: 'oil',
  system: 'oilExport',
  nps: 6,
  route: [dB, [dB[0], HDR_Y, dB[2]], [dB[0], HDR_Y, -12.0]],
  from: { equipment: 'P-1500B', nozzle: 'N2' },
  to: { line: L_DISCH },
})
const lo6 = P('L-1600', 'N1')
const L_EXPORT = add_({
  tag: '8"-PO-1601-D6A-N',
  service: 'oil',
  system: 'oilExport',
  nps: 8,
  route: [lo6, [RISER_X, lo6[1], lo6[2]], [RISER_X, RISER_TOP_Y, lo6[2]]],
  from: { equipment: 'L-1600', nozzle: 'N1' },
  to: { offDeck: 'Oil export riser → 16" pipeline to FSO' },
  design: { pressure: '96 barg', temperature: '48 °C' },
})

// --- compression
const so = P('V-2100', 'N2')
const ks = P('K-2200', 'N1')
const SUCT_Y = 8.0
const L_KSUCT = add_({
  tag: '10"-PG-2101-C3A-N',
  service: 'gas',
  system: 'gasCompression',
  nps: 10,
  route: [so, [so[0], SUCT_Y, so[2]], [ks[0], SUCT_Y, so[2]], [ks[0], ks[1], ks[2]]],
  from: { equipment: 'V-2100', nozzle: 'N2' },
  to: { equipment: 'K-2200', nozzle: 'N1' },
  design: { pressure: '41 barg', temperature: '40 °C' },
})
const kd = P('K-2200', 'N2')
const ci = P('E-2300', 'N1')
const DIS_Y = 4.1
const L_KDIS = add_({
  tag: '8"-PG-2201-E9A-N',
  service: 'gas',
  system: 'gasCompression',
  nps: 8,
  spec: 'E9A',
  route: [kd, [kd[0], DIS_Y, kd[2]], [kd[0], DIS_Y, ci[2]], ci],
  from: { equipment: 'K-2200', nozzle: 'N2' },
  to: { equipment: 'E-2300', nozzle: 'N1' },
  design: { pressure: '140 barg', temperature: '135 °C' },
})
const L_RECYCLE = add_({
  tag: '6"-PG-2202-E9A-N',
  service: 'gas',
  system: 'gasCompression',
  nps: 6,
  spec: 'E9A',
  route: [
    [kd[0], DIS_Y, 9.7],
    [-4.2, DIS_Y, 9.7],
    [-4.2, SUCT_Y, 9.7],
    [-4.2, SUCT_Y, so[2]],
  ],
  from: { line: L_KDIS },
  to: { line: L_KSUCT },
  design: { notes: 'Anti-surge recycle' },
})
const L_BLOWDOWN = add_({
  tag: '2"-FL-2203-B1A-N',
  service: 'flare',
  system: 'flare',
  nps: 2,
  route: [
    [kd[0], DIS_Y, 7.6],
    [7.2, DIS_Y, 7.6],
    [7.2, 6.2, 7.6],
    [9.8, 6.2, 7.6],
    [9.8, FLARE_Y, 7.6],
  ],
  from: { line: L_KDIS },
  to: { line: '16"-FL-2401-B1A-N' },
  design: { notes: 'Compressor discharge blowdown to flare' },
})
const co = P('E-2300', 'N2')
const L_GEXP = add_({
  tag: '8"-PG-2301-E9A-N',
  service: 'gas',
  system: 'gasCompression',
  nps: 8,
  spec: 'E9A',
  route: [co, [co[0], co[1], 14.75], [RISER_X, co[1], 14.75], [RISER_X, RISER_TOP_Y, 14.75]],
  from: { equipment: 'E-2300', nozzle: 'N2' },
  to: { offDeck: 'Gas export riser → 14" pipeline' },
  design: { pressure: '140 barg', temperature: '40 °C' },
})
const sl = P('V-2100', 'N3')
const L_SCRLIQ = add_({
  tag: '2"-PO-2102-C3A-N',
  service: 'drain',
  system: 'gasCompression',
  nps: 2,
  route: [sl, [-5.0, sl[1], sl[2]], [-5.0, CELLAR, sl[2]]],
  from: { equipment: 'V-2100', nozzle: 'N3' },
  to: { offDeck: 'Closed drain drum (cellar deck)' },
})

// --- cooling medium (drops from the weather-deck CM headers)
function cmPair(ex: string, base: string, seqIn: number, seqOut: number) {
  const ni = P(ex, 'N3')
  const no = P(ex, 'N4')
  const zOff = ni[2] - 0.75
  add_({
    tag: `6"-CM-${seqIn}-A1A-N`,
    service: 'cooling',
    system: 'utilities',
    nps: 6,
    route: [[ni[0], 10.4, zOff], [ni[0], ni[1], zOff], ni],
    from: { offDeck: `${base} CM supply header (weather deck)` },
    to: { equipment: ex, nozzle: 'N3' },
    design: { pressure: '10 barg', temperature: '25 °C' },
  })
  add_({
    tag: `6"-CM-${seqOut}-A1A-N`,
    service: 'cooling',
    system: 'utilities',
    nps: 6,
    route: [no, [no[0], 10.4, no[2]]],
    from: { equipment: ex, nozzle: 'N4' },
    to: { offDeck: `${base} CM return header (weather deck)` },
    design: { pressure: '10 barg', temperature: '45 °C' },
  })
}
cmPair('E-1400', 'E-1400', 1411, 1412)
cmPair('E-2300', 'E-2300', 2311, 2312)

// --- flare
const ko = P('V-2400', 'N1')
const L_FLARE = add_({
  tag: '16"-FL-2401-B1A-N',
  service: 'flare',
  system: 'flare',
  nps: 16,
  schedule: 'STD',
  route: [[-23.6, FLARE_Y, FLARE_Z], [ko[0], FLARE_Y, FLARE_Z], [ko[0], FLARE_Y, ko[2]], ko],
  from: { offDeck: 'Header end (blind flange)' },
  to: { equipment: 'V-2400', nozzle: 'N1' },
  design: { pressure: '3.5 barg', temperature: '-46 / 200 °C', notes: 'Sloped 1:200 to KO drum' },
})
const kg = P('V-2400', 'N2')
add_({
  tag: '16"-FL-2402-B1A-N',
  service: 'flare',
  system: 'flare',
  nps: 16,
  schedule: 'STD',
  // east to the flare boom hinge on the weather-deck edge (boom base at x 29.6, z 8, EL +39.5)
  route: [kg, [kg[0], 7.6, kg[2]], [29.6, 7.6, kg[2]], [29.6, 7.6, 8], [29.6, 11.3, 8]],
  from: { equipment: 'V-2400', nozzle: 'N2' },
  to: { offDeck: 'Flare boom → flare tip' },
})
const kl = P('V-2400', 'N3')
add_({
  tag: '3"-CD-2403-B1A-N',
  service: 'drain',
  system: 'flare',
  nps: 3,
  route: [kl, [kl[0], 0.35, kl[2]], [kl[0] + 1.6, 0.35, kl[2]], [kl[0] + 1.6, CELLAR, kl[2]]],
  from: { equipment: 'V-2400', nozzle: 'N3' },
  to: { offDeck: 'Flare drum pumps (cellar deck)' },
})

// --- PSV discharges: rise to OVER, run to the flare header lane, drop in from the top
function psvLine(tag: string, eqTag: string, nz: string, outDir: Vec3, seq: string): { line: string; out: Vec3 } {
  const { pos, nps } = psvOutlet(eqTag, nz, outDir)
  const run = 0.45 + pipeOD(nps) * 2
  const p1: Vec3 = [pos[0] + outDir[0] * run, pos[1], pos[2] + outDir[2] * run]
  const route: Vec3[] = [pos, p1, [p1[0], OVER + 0.3, p1[2]], [p1[0], OVER + 0.3, FLARE_Z], [p1[0], FLARE_Y, FLARE_Z]]
  const ltag = `${nps}"-FL-${seq}-B1A-N`
  add_({ tag: ltag, service: 'flare', system: 'flare', nps, route, from: { offDeck: `${tag} outlet` }, to: { line: L_FLARE } })
  return { line: ltag, out: outDir }
}
const psv1101 = psvLine('PSV-1101', 'V-1100', 'N5', [0, 0, 1], '1105')
const psv1201 = psvLine('PSV-1201', 'V-1200', 'N4', [1, 0, 0], '1203')
const psv1301 = psvLine('PSV-1301', 'V-1300', 'N4', [-1, 0, 0], '1303')
const psv2101 = psvLine('PSV-2101', 'V-2100', 'N4', [-1, 0, 0], '2103')

// --- firewater ring main (under the weather deck) with deluge isolation
const FW_Y = 8.55
add_({
  tag: '8"-FW-9001-F1A-N',
  service: 'firewater',
  system: 'safety',
  nps: 8,
  route: [
    [-27.4, CELLAR, -3.0],
    [-27.4, FW_Y, -3.0],
    [-27.4, FW_Y, -18.7],
    [27.0, FW_Y, -18.7],
    [27.0, FW_Y, 18.7],
    [-27.4, FW_Y, 18.7],
    [-27.4, FW_Y, 3.0],
    [-27.4, CELLAR, 3.0],
  ],
  from: { offDeck: 'Firewater pumps (cellar deck)' },
  to: { offDeck: 'Firewater ring (cellar deck return)' },
  design: { pressure: '16 barg', temperature: 'ambient', notes: 'GRP-lined CuNi 90/10' },
})
// deluge: drop from the ring and run a spray pipe alongside each separator
function deluge(seq: string, x: number, z: number, y: number, xEnd: number) {
  add_({
    tag: `4"-FW-${seq}-F1A-N`,
    service: 'firewater',
    system: 'safety',
    nps: 4,
    route: [[x, FW_Y, -18.7], [x, FW_Y, z], [x, y, z], [xEnd, y, z]],
    from: { line: '8"-FW-9001-F1A-N' },
    to: { offDeck: 'Deluge spray pipe (capped)' },
    sprayNozzles: true,
    design: { notes: 'Deluge, 10.2 l/min/m² over vessel surface' },
  })
}
deluge('9011', -18.4, -11.45, 6.6, -7.4)
deluge('9012', -0.2, -10.95, 6.0, 10.2)

// --- rack utilities (fill the rack like a real one)
function utility(tag: string, service: PipeLine['service'], nps: number, tier: 1 | 2, z: number, x0 = -25.3, x1 = 25.3) {
  const y = onTier(tier, nps)
  add_({
    tag,
    service,
    system: 'utilities',
    nps,
    route: [[x0, 10.4, z], [x0, y, z], [x1, y, z], [x1, 10.4, z]],
    from: { offDeck: 'Weather deck' },
    to: { offDeck: 'Weather deck' },
  })
}
utility('6"-FG-9201-C3A-N', 'gas', 6, 1, -1.45, -25.9, 25.9) // risers outboard of the IA header's
utility('3"-UW-9301-A1A-N', 'cooling', 3, 1, -0.8, -24.9, 24.9)
utility('2"-NG-9401-A1A-N', 'instrumentAir', 2, 1, -0.3, -24.6, 24.6)
utility('6"-CD-9501-B1A-N', 'drain', 6, 1, 0.45)
utility('4"-PW-9601-C3A-N', 'water', 4, 1, 1.25, -24.1, 24.1)
utility('2"-IA-9701-A1A-N', 'instrumentAir', 2, 2, -1.5, -25.6, 25.6)
utility('2"-CI-9801-S1A-N', 'chemical', 2, 2, -1.05, -25.0, 25.0)
utility('3"-DF-9901-A1A-N', 'oil', 3, 2, -0.45, -24.4, 24.4)

export const pipeLines = lines

// ================================================================= VALVES
const v = (x: Omit<Valve, 'design' | 'normally'> & Partial<Pick<Valve, 'design' | 'normally'>>): Valve => ({ design: {}, normally: 'open', ...x })
export const valves: Valve[] = [
  v({ tag: 'ESDV-1001', type: 'esdv', line: L_INLET, seg: 0, t: 0.42, actuator: 'pistonSpring', failAction: 'FC', design: { notes: 'Inlet ESD valve, SIL 2, 12" class 600 ball' } }),
  v({ tag: 'HV-1002', type: 'gate', line: L_TEST, seg: 2, t: 0.45, actuator: 'handwheel' }),
  v({ tag: 'NRV-1002', type: 'check', line: L_TEST, seg: 1, t: 0.6 }),
  // LV-1101 control station
  v({ tag: 'HV-1101A', type: 'gate', line: L_OIL1, seg: 1, t: 0.22, actuator: 'handwheel' }),
  v({ tag: 'LV-1101', type: 'control', line: L_OIL1, seg: 1, t: 0.5, actuator: 'diaphragm', failAction: 'FC', design: { notes: 'Oil level control, equal-% trim, Cv 180' } }),
  v({ tag: 'HV-1101B', type: 'gate', line: L_OIL1, seg: 1, t: 0.78, actuator: 'handwheel' }),
  v({ tag: 'HV-1101C', type: 'globe', line: L_OIL1BP, seg: 1, t: 0.5, actuator: 'handwheel', normally: 'closed', design: { notes: 'Bypass, locked closed' } }),
  v({ tag: 'LV-1102', type: 'control', line: L_WATER, seg: 1, t: 0.55, actuator: 'diaphragm', failAction: 'FC', design: { notes: 'Interface level control' } }),
  v({ tag: 'HV-1102', type: 'gate', line: L_WATER, seg: 1, t: 0.2, actuator: 'handwheel' }),
  v({ tag: 'ESDV-2101', type: 'esdv', line: L_GAS, seg: 1, t: 0.24, actuator: 'pistonSpring', failAction: 'FC' }),
  v({ tag: 'PCV-1201', type: 'control', line: L_TGAS, seg: 0, t: 0.55, actuator: 'diaphragm', failAction: 'FO' }),
  v({ tag: 'HV-1201', type: 'ball', line: L_TLIQ, seg: 3, t: 0.3, actuator: 'lever' }),
  v({ tag: 'LV-1201', type: 'control', line: L_TLIQ, seg: 3, t: 0.55, actuator: 'diaphragm', failAction: 'FC' }),
  v({ tag: 'NRV-1201', type: 'check', line: L_TLIQ, seg: 3, t: 0.78 }),
  v({ tag: 'PCV-1301', type: 'control', line: L_LPGAS, seg: 0, t: 0.55, actuator: 'diaphragm', failAction: 'FO', design: { notes: 'LP separator back-pressure to flare' } }),
  v({ tag: 'XV-1301', type: 'gate', line: L_OIL2, seg: 1, t: 0.5, actuator: 'gear' }),
  v({ tag: 'HV-1501A', type: 'gate', line: L_SUCT, seg: 3, t: 0.55, actuator: 'gear' }),
  v({ tag: 'HV-1501B', type: 'gate', line: L_SUCTB, seg: 1, t: 0.4, actuator: 'gear' }),
  v({ tag: 'NRV-1501A', type: 'check', line: L_DISCH, seg: 0, t: 0.32 }),
  v({ tag: 'HV-1502A', type: 'gate', line: L_DISCH, seg: 0, t: 0.66, actuator: 'handwheel', up: [1, 0, 0] }),
  v({ tag: 'NRV-1501B', type: 'check', line: L_DISCHB, seg: 0, t: 0.32 }),
  v({ tag: 'HV-1502B', type: 'gate', line: L_DISCHB, seg: 0, t: 0.66, actuator: 'handwheel', up: [1, 0, 0] }),
  v({ tag: 'LV-1301', type: 'control', line: L_DISCH, seg: 3, t: 0.3, actuator: 'diaphragm', failAction: 'FC', design: { notes: 'LP separator level → export flow' } }),
  v({ tag: 'HV-1601', type: 'ball', line: L_DISCH, seg: 3, t: 0.62, actuator: 'gear' }),
  v({ tag: 'ESDV-1601', type: 'esdv', line: L_EXPORT, seg: 1, t: 0.45, actuator: 'pistonSpring', failAction: 'FC', up: [-1, 0, 0], design: { notes: 'Riser ESDV, SIL 3' } }),
  v({ tag: 'XV-2201', type: 'ball', line: L_KSUCT, seg: 2, t: 0.55, actuator: 'electric' }),
  v({ tag: 'NRV-2201', type: 'check', line: L_KDIS, seg: 1, t: 0.42 }),
  v({ tag: 'BDV-2201', type: 'bdv', line: L_BLOWDOWN, seg: 1, t: 0.5, actuator: 'pistonSpring', failAction: 'FO', normally: 'closed', up: [-1, 0, 0] }),
  v({ tag: 'FV-2201', type: 'control', line: L_RECYCLE, seg: 0, t: 0.45, actuator: 'diaphragm', failAction: 'FO', design: { notes: 'Anti-surge valve, fast-stroking (< 2 s)' } }),
  v({ tag: 'ESDV-2301', type: 'esdv', line: L_GEXP, seg: 1, t: 0.86, actuator: 'pistonSpring', failAction: 'FC' }),
  v({ tag: 'HV-2302', type: 'gate', line: L_GEXP, seg: 1, t: 0.2, actuator: 'gear' }),
  v({ tag: 'LV-2101', type: 'control', line: L_SCRLIQ, seg: 0, t: 0.5, actuator: 'diaphragm', failAction: 'FC' }),
  v({ tag: 'TCV-1401', type: 'control', line: '6"-CM-1411-A1A-N', seg: 0, t: 0.55, actuator: 'diaphragm', failAction: 'FO' }),
  v({ tag: 'HV-1412', type: 'butterfly', line: '6"-CM-1412-A1A-N', seg: 0, t: 0.45, actuator: 'gear' }),
  v({ tag: 'TCV-2301', type: 'control', line: '6"-CM-2311-A1A-N', seg: 0, t: 0.55, actuator: 'diaphragm', failAction: 'FO' }),
  v({ tag: 'HV-2312', type: 'butterfly', line: '6"-CM-2312-A1A-N', seg: 0, t: 0.45, actuator: 'gear' }),
  v({ tag: 'HV-2403', type: 'gate', line: '3"-CD-2403-B1A-N', seg: 1, t: 0.5, actuator: 'handwheel' }),
  v({ tag: 'XV-9011', type: 'butterfly', line: '4"-FW-9011-F1A-N', seg: 0, t: 0.35, actuator: 'electric', normally: 'closed', failAction: 'FO', design: { notes: 'Deluge valve (dry pipe beyond), opens on confirmed fire (2ooN flame) or manual release' } }),
  v({ tag: 'XV-9012', type: 'butterfly', line: '4"-FW-9012-F1A-N', seg: 0, t: 0.35, actuator: 'electric', normally: 'closed', failAction: 'FO', design: { notes: 'Deluge valve (dry pipe beyond), opens on confirmed fire (2ooN flame) or manual release' } }),
  v({ tag: 'HV-9001', type: 'butterfly', line: '8"-FW-9001-F1A-N', seg: 2, t: 0.5, actuator: 'gear' }),
  v({ tag: 'HV-9002', type: 'butterfly', line: '8"-FW-9001-F1A-N', seg: 4, t: 0.5, actuator: 'gear' }),
  // PSVs on vessel nozzles
  v({ tag: 'PSV-1101', type: 'psv', line: psv1101.line, seg: -1, t: 0, mount: { equipment: 'V-1100', nozzle: 'N5' }, outletDir: psv1101.out, normally: 'closed', design: { notes: 'Set 42 barg, API 526 4M6' } }),
  v({ tag: 'PSV-1201', type: 'psv', line: psv1201.line, seg: -1, t: 0, mount: { equipment: 'V-1200', nozzle: 'N4' }, outletDir: psv1201.out, normally: 'closed', design: { notes: 'Set 42 barg, 3K4' } }),
  v({ tag: 'PSV-1301', type: 'psv', line: psv1301.line, seg: -1, t: 0, mount: { equipment: 'V-1300', nozzle: 'N4' }, outletDir: psv1301.out, normally: 'closed', design: { notes: 'Set 8 barg, 4P6' } }),
  v({ tag: 'PSV-2101', type: 'psv', line: psv2101.line, seg: -1, t: 0, mount: { equipment: 'V-2100', nozzle: 'N4' }, outletDir: psv2101.out, normally: 'closed', design: { notes: 'Set 42 barg, 3K4' } }),
]

// ================================================================= INSTRUMENTS
const onLine = (line: string, seg: number, t: number) => ({ line, seg, t })
export const instruments: Instrument[] = [
  { tag: 'PT-1001', type: 'PT', on: onLine(L_INLET, 0, 0.75), dir: [0, 1, 0], range: '0–100', unit: 'barg', nominal: 44.2, alarms: { hi: 47, hiHi: 50 } },
  { tag: 'TT-1001', type: 'TT', on: onLine(L_INLET, 2, 0.4), dir: [0, 1, 0], range: '0–150', unit: '°C', nominal: 78 },
  { tag: 'PT-1101', type: 'PT', on: { equipment: 'V-1100', nozzle: 'N6' }, range: '0–60', unit: 'barg', nominal: 35, alarms: { hi: 38, hiHi: 40, lo: 28 } },
  { tag: 'LT-1101', type: 'LT', on: { equipment: 'V-1100', at: [-11.2, 3.0, -10.95] }, dir: [0, 0, -1], range: '0–3600', unit: 'mm', nominal: 1870, alarms: { hiHi: 3000, hi: 2600, lo: 1100, loLo: 800 } },
  { tag: 'LT-1102', type: 'LT', on: { equipment: 'V-1100', at: [-10.0, 2.3, -10.95] }, dir: [0, 0, -1], range: '0–3600', unit: 'mm', nominal: 790, alarms: { hi: 1100, lo: 450 } },
  { tag: 'LG-1101', type: 'LG', on: { equipment: 'V-1100', at: [-14.6, 3.0, -10.95] }, dir: [0, 0, -1], range: '0–3600', unit: 'mm', nominal: 1870 },
  { tag: 'TT-1101', type: 'TT', on: onLine(L_GAS, 1, 0.5), dir: [0, 1, 0], range: '0–150', unit: '°C', nominal: 64 },
  { tag: 'FT-1101', type: 'FT', on: onLine(L_GAS, 1, 0.72), dir: [0, 1, 0], range: '0–80', unit: 'MMscfd', nominal: 52.4 },
  { tag: 'FT-1102', type: 'FT', on: onLine(L_OIL1, 2, 0.28), dir: [-1, 0, 0], range: '0–8000', unit: 'm³/d', nominal: 5120 },
  { tag: 'PT-1201', type: 'PT', on: onLine(L_TGAS, 1, 0.35), dir: [0, 1, 0], range: '0–60', unit: 'barg', nominal: 40.8 },
  { tag: 'FT-1201', type: 'FT', on: onLine(L_TGAS, 1, 0.82), dir: [1, 0, 0], range: '0–15', unit: 'MMscfd', nominal: 6.2 },
  { tag: 'LT-1201', type: 'LT', on: { equipment: 'V-1200', at: [-12, 2.1, -15.55] }, dir: [0, 0, -1], range: '0–1800', unit: 'mm', nominal: 810 },
  { tag: 'PT-1301', type: 'PT', on: onLine(L_LPGAS, 1, 0.3), dir: [1, 0, 0], range: '0–16', unit: 'barg', nominal: 7.6, alarms: { hi: 8.5 } },
  { tag: 'LT-1301', type: 'LT', on: { equipment: 'V-1300', at: [6.5, 2.7, -10.45] }, dir: [0, 0, -1], range: '0–2800', unit: 'mm', nominal: 1400, alarms: { hi: 2100, lo: 700 } },
  { tag: 'TT-1301', type: 'TT', on: onLine(L_OIL2, 2, 0.5), dir: [1, 0, 0], range: '0–150', unit: '°C', nominal: 61 },
  { tag: 'TT-1401', type: 'TT', on: onLine(L_SUCT, 1, 0.25), dir: [0, 1, 0], range: '0–150', unit: '°C', nominal: 44 },
  { tag: 'PG-1501A', type: 'PG', on: onLine(L_DISCH, 0, 0.92), dir: [-1, 0, 0], range: '0–160', unit: 'barg', nominal: 92 },
  { tag: 'PG-1501B', type: 'PG', on: onLine(L_DISCHB, 0, 0.92), dir: [-1, 0, 0], range: '0–160', unit: 'barg', nominal: 0.4 },
  { tag: 'PT-1501', type: 'PT', on: onLine(L_DISCH, 2, 0.12), dir: [0, 1, 0], range: '0–160', unit: 'barg', nominal: 91.5 },
  { tag: 'FT-1501', type: 'FT', on: onLine(L_DISCH, 2, 0.75), dir: [0, 1, 0], range: '0–250', unit: 'm³/h', nominal: 158 },
  { tag: 'PT-1601', type: 'PG', on: onLine(L_EXPORT, 0, 0.5), dir: [0, 1, 0], range: '0–160', unit: 'barg', nominal: 90 },
  { tag: 'PT-2101', type: 'PT', on: onLine(L_KSUCT, 1, 0.08), dir: [0, 1, 0], range: '0–60', unit: 'barg', nominal: 40.6 },
  { tag: 'PDT-2101', type: 'PDT', on: { equipment: 'V-2100', at: [-6.95, 5.6, 6.5] }, dir: [1, 0, 0], range: '0–500', unit: 'mbar', nominal: 62, alarms: { hi: 250 } },
  { tag: 'LT-2101', type: 'LT', on: { equipment: 'V-2100', at: [-7.8, 1.6, 7.35] }, dir: [0, 0, 1], range: '0–1200', unit: 'mm', nominal: 240 },
  { tag: 'PT-2202', type: 'PT', on: onLine(L_KDIS, 1, 0.15), dir: [0, 1, 0], range: '0–200', unit: 'barg', nominal: 138.5, alarms: { hi: 145, hiHi: 150 } },
  { tag: 'TT-2202', type: 'TT', on: onLine(L_KDIS, 1, 0.28), dir: [0, 1, 0], range: '0–200', unit: '°C', nominal: 132 },
  { tag: 'FT-2201', type: 'FT', on: onLine(L_KSUCT, 1, 0.45), dir: [0, 1, 0], range: '0–80', unit: 'MMscfd', nominal: 51.8 },
  { tag: 'TT-2301', type: 'TT', on: onLine(L_GEXP, 1, 0.1), dir: [0, 1, 0], range: '0–150', unit: '°C', nominal: 39 },
  { tag: 'AT-2301', type: 'AT', on: onLine(L_GEXP, 1, 0.35), dir: [0, 1, 0], range: '-40–20', unit: '°C dew pt', nominal: -18 },
  { tag: 'PT-2301', type: 'PT', on: onLine(L_GEXP, 1, 0.55), dir: [0, 1, 0], range: '0–200', unit: 'barg', nominal: 137.9 },
  { tag: 'LT-2401', type: 'LT', on: { equipment: 'V-2400', at: [13.8, 1.9, 11.79] }, dir: [0, 0, 1], range: '0–2400', unit: 'mm', nominal: 420, alarms: { hi: 1200, hiHi: 1600 } },
  { tag: 'PT-2401', type: 'PT', on: onLine(L_FLARE, 0, 0.5), dir: [0, 1, 0], range: '0–5', unit: 'barg', nominal: 0.12 },
]

// wells, utilities, produced water, gas treatment, the LQ platform and fire & gas (model/alphaSite.ts)
extendAlpha({ equipment, lines, valves, instruments }, { FLARE_Y, FLARE_Z, OVER, CELLAR, onTier, flareHeader: L_FLARE, manifold: 'M-1000' })
extendWHP({ equipment, lines, valves, instruments }, { flareHeader: L_FLARE, firewaterRing: '8"-FW-9001-F1A-N', CELLAR })
// riser & export platform (west bridge) and water-injection platform (north of WHP-N): model/rpSite.ts, model/wiSite.ts
extendRP({ equipment, lines, valves, instruments })
extendWI({ equipment, lines, valves, instruments })
// cranes and cold vent stacks on every platform (after the platforms, so their decks exist)
extendCranes({ equipment, lines, valves, instruments })

export const plant: Plant = {
  name: 'Alpha Platform',
  deck: { name: 'Production Deck (EL +28.0 m)', elevation: 28, extent: { minX: -30, maxX: 30, minZ: -20, maxZ: 20 }, site: 'offshoreAlpha', walk: ALPHA_WALK },
  equipment,
  lines,
  valves,
  instruments,
}

// ---------------------------------------------------------------- lookup helpers
export const SYSTEM_LABEL: Record<string, string> = {
  production: 'Inlet & Separation',
  oilExport: 'Oil Treatment & Export',
  gasCompression: 'Gas Compression & Export',
  flare: 'Flare & Relief',
  utilities: 'Utilities',
  safety: 'Fire & Gas, Firewater & Safety',
  wells: 'Wells & Drilling',
  producedWater: 'Produced Water Treatment',
  gasTreatment: 'Gas Dehydration & Fuel Gas',
  drains: 'Closed & Open Drains',
  accommodation: 'Accommodation Platform & Control',
}

export function findItem(tag: string) {
  return (
    plant.equipment.find((e) => e.tag === tag) ??
    plant.lines.find((l) => l.tag === tag) ??
    plant.valves.find((v) => v.tag === tag) ??
    plant.instruments.find((i) => i.tag === tag)
  )
}

/** convenience for code that wants a deck-frame point on an equipment */
export const eqPoint = (tag: string, local: Vec3) => toDeck(eqByTag.get(tag)!, local)
export const eqDir = (tag: string, local: Vec3) => dirToDeck(eqByTag.get(tag)!, local)
