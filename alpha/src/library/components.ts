/**
 * The component library: one parametric factory per equipment kind. Every factory reuses the
 * existing renderers in scene/equipment — this file only produces data. Default dimensions and
 * nozzle layouts follow the hand-authored Alpha / Bravo plants so library items look the same.
 *
 * Nozzle ids are stable per kind (the builder and a future P&ID importer refer to them):
 *   horizontalVessel  N1 inlet · N2 gas · N3 liquid/oil · N4 water (3-phase only) · N5 PSV
 *   verticalVessel    N1 inlet · N2 gas · N3 liquid · N4 PSV
 *   shellTube         N1 shell in · N2 shell out · N3 channel in · N4 channel out
 *   pumpPackage       N1 suction · N2 discharge
 *   compressorPackage N1 suction · N2 discharge
 *   pigTrap           N1 outlet · N2 kicker · N3 vent · N4 drain
 *   manifold          N1 production header outlet · N2 test header outlet
 *   chemSkid          N1… injection outlets
 */
import type { DesignData, Equipment, EquipmentKind, HorizontalVessel, Rating, SystemId, Vec3, VerticalVessel } from '../model/types'
import { NPS_SIZES, pipeOD } from '../model/catalog'
import { headDepth, headSurface, nozzle } from '../model/geom'
import type { ComponentDef, NozzleTemplate, ParamDef, Params } from './types'

/** christmas-tree geometry shared with scene/equipment/XmasTree.tsx (metres above the wellhead stack top) */
export const XT_CROSS = 1.25 // cross / wing centreline above the top of the wellhead spools
export const XT_WING_PROD = 1.05 // production-wing nozzle base (after wing valve + choke), local +X
export const XT_WING_KILL = 0.7 // kill-wing nozzle base, local -X

const n = (p: Params, k: string) => Number(p[k])
const s = (p: Params, k: string) => String(p[k])
const b = (p: Params, k: string) => Boolean(p[k])
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r3 = (v: number) => Math.round(v * 1000) / 1000

const NPS_OPTS = NPS_SIZES.filter((x) => x >= 1).map((x) => ({ value: x, label: `${x}"` }))
const nps = (key: string, label: string, when?: ParamDef['when']): ParamDef => ({ key, label, type: 'select', options: NPS_OPTS, when })
const rating: ParamDef = {
  key: 'rating',
  label: 'Flange rating',
  type: 'select',
  options: ([150, 300, 600, 900] as const).map((r) => ({ value: r, label: `Class ${r}` })),
}
const R = (p: Params) => n(p, 'rating') as Rating

// ------------------------------------------------------------------ horizontal vessel
const HV_INTERNALS: Record<string, HorizontalVessel['internals']> = {
  '3-phase': ['inletDiverter', 'perforatedBaffle', 'weir', 'meshPad', 'vortexBreaker'],
  '2-phase': ['inletDiverter', 'perforatedBaffle', 'meshPad', 'vortexBreaker'],
  ko: ['inletDiverter', 'vortexBreaker'],
}
const HV_LEVELS: Record<string, HorizontalVessel['levels']> = {
  '3-phase': { water: 0.22, oil: 0.5 },
  '2-phase': { oil: 0.4 },
  ko: { oil: 0.15 },
}
const hvWall = (p: Params) => r3(clamp(n(p, 'id') * 0.014, 0.012, 0.08))
const hvBoot = (p: Params) => ({ x: r3(n(p, 'tt') * 0.17), d: r3(clamp(n(p, 'id') * 0.3, 0.5, 1.0)), l: 0.9 })
const isThreePhase = (p: Params) => p.service === '3-phase'

const horizontalVessel: ComponentDef<'horizontalVessel'> = {
  kind: 'horizontalVessel',
  label: 'Horizontal separator / drum',
  category: 'Vessels',
  blurb: '2:1 elliptical heads on saddles. 3-phase separators get a water boot; internals and levels follow the service.',
  tagPrefix: 'V',
  system: 'production',
  params: [
    { key: 'service', label: 'Service', type: 'select', options: [
      { value: '3-phase', label: '3-phase separator' },
      { value: '2-phase', label: '2-phase separator' },
      { value: 'ko', label: 'Knock-out drum' },
    ] },
    { key: 'id', label: 'Inside diameter', type: 'number', unit: 'm', min: 0.6, max: 5, step: 0.1 },
    { key: 'tt', label: 'Tangent–tangent', type: 'number', unit: 'm', min: 2, max: 24, step: 0.5 },
    { key: 'elevation', label: 'Shell bottom above deck', type: 'number', unit: 'm', min: 0.6, max: 5, step: 0.1 },
    { key: 'insulated', label: 'Insulated', type: 'bool' },
    rating,
    nps('inletNps', 'Inlet'),
    nps('gasNps', 'Gas outlet'),
    nps('liquidNps', 'Liquid / oil outlet'),
    nps('waterNps', 'Water outlet (boot)', isThreePhase),
    nps('psvNps', 'PSV connection'),
  ],
  defaults: { service: '3-phase', id: 2.4, tt: 8, elevation: 1.8, insulated: false, rating: 600, inletNps: 10, gasNps: 8, liquidNps: 6, waterNps: 4, psvNps: 3 },
  body: (p) => ({
    id: n(p, 'id'),
    tt: n(p, 'tt'),
    wall: hvWall(p),
    elevation: n(p, 'elevation'),
    saddles: [r3(-n(p, 'tt') * 0.33), r3(n(p, 'tt') * 0.33)],
    boots: isThreePhase(p) ? [hvBoot(p)] : undefined,
    internals: HV_INTERNALS[s(p, 'service')],
    levels: HV_LEVELS[s(p, 'service')],
    insulated: b(p, 'insulated'),
  }),
  originY: (p) => n(p, 'elevation') + n(p, 'id') / 2 + hvWall(p),
  nozzles: (p) => {
    const id = n(p, 'id'), tt = n(p, 'tt'), wall = hvWall(p)
    const Ro = id / 2 + wall
    const apex = tt / 2 + headDepth(id) + wall
    const out: NozzleTemplate[] = [
      { id: 'N1', name: 'Inlet', base: [-apex, 0, 0], dir: [-1, 0, 0], nps: n(p, 'inletNps'), neck: 0.45 },
      { id: 'N2', name: 'Gas outlet', base: [r3(tt * 0.4), Ro, 0], dir: [0, 1, 0], nps: n(p, 'gasNps'), neck: 0.4 },
      { id: 'N3', name: isThreePhase(p) ? 'Oil outlet' : 'Liquid outlet', base: [r3(tt * 0.4), -Ro, 0], dir: [0, -1, 0], nps: n(p, 'liquidNps'), neck: 0.35 },
    ]
    if (isThreePhase(p)) {
      const boot = hvBoot(p)
      out.push({ id: 'N4', name: 'Water outlet (boot)', base: [boot.x, r3(-Ro - boot.l * 0.6), r3(-boot.d / 2)], dir: [0, 0, -1], nps: n(p, 'waterNps'), neck: 0.3 })
    }
    out.push({ id: 'N5', name: 'PSV connection', base: [r3(-tt * 0.1), Ro, 0], dir: [0, 1, 0], nps: n(p, 'psvNps'), neck: 0.35 })
    return out
  },
}

// ------------------------------------------------------------------ vertical vessel
const VV_INTERNALS: Record<string, VerticalVessel['internals']> = {
  mesh: ['inletDiverter', 'meshPad', 'vortexBreaker'],
  cyclone: ['inletDiverter', 'meshPad', 'cyclones', 'vortexBreaker'],
  vane: ['inletDiverter', 'vanePack', 'vortexBreaker'],
}
const vvWall = (p: Params) => r3(clamp(n(p, 'id') * 0.022, 0.012, 0.08))

const verticalVessel: ComponentDef<'verticalVessel'> = {
  kind: 'verticalVessel',
  label: 'Vertical scrubber / KO drum',
  category: 'Vessels',
  blurb: 'Vertical vessel on a skirt or legs, with a demister and an optional top platform and ladder.',
  tagPrefix: 'V',
  system: 'gasCompression',
  params: [
    { key: 'id', label: 'Inside diameter', type: 'number', unit: 'm', min: 0.6, max: 4, step: 0.1 },
    { key: 'tt', label: 'Tangent–tangent', type: 'number', unit: 'm', min: 2, max: 14, step: 0.2 },
    { key: 'elevation', label: 'Bottom tangent above deck', type: 'number', unit: 'm', min: 0.5, max: 3, step: 0.1 },
    { key: 'support', label: 'Support', type: 'select', options: [{ value: 'skirt', label: 'Skirt' }, { value: 'legs', label: 'Legs' }] },
    { key: 'internals', label: 'Demister', type: 'select', options: [
      { value: 'mesh', label: 'Mesh pad' },
      { value: 'cyclone', label: 'Mesh + axial cyclones' },
      { value: 'vane', label: 'Vane pack' },
    ] },
    { key: 'platform', label: 'Top platform + ladder', type: 'bool' },
    rating,
    nps('inletNps', 'Inlet'),
    nps('gasNps', 'Gas outlet'),
    nps('liquidNps', 'Liquid outlet'),
    nps('psvNps', 'PSV connection'),
  ],
  defaults: { id: 1.6, tt: 4.8, elevation: 1.0, support: 'skirt', internals: 'mesh', platform: true, rating: 600, inletNps: 8, gasNps: 8, liquidNps: 2, psvNps: 3 },
  body: (p) => ({
    id: n(p, 'id'),
    tt: n(p, 'tt'),
    wall: vvWall(p),
    elevation: n(p, 'elevation'),
    support: s(p, 'support') as VerticalVessel['support'],
    internals: VV_INTERNALS[s(p, 'internals')],
    levels: { liquid: 0.12 },
    platform: b(p, 'platform'),
  }),
  originY: () => 0,
  nozzles: (p) => {
    const id = n(p, 'id'), tt = n(p, 'tt'), el = n(p, 'elevation'), wall = vvWall(p)
    const r = id / 2 + wall
    const topTL = el + tt
    return [
      { id: 'N1', name: 'Inlet', base: [-r, r3(el + tt * 0.62), 0], dir: [-1, 0, 0], nps: n(p, 'inletNps'), neck: 0.4 },
      { id: 'N2', name: 'Gas outlet', base: [0, r3(topTL + headDepth(id) + wall), 0], dir: [0, 1, 0], nps: n(p, 'gasNps'), neck: 0.35 },
      { id: 'N3', name: 'Liquid outlet', base: [r, r3(el + 0.4), 0], dir: [1, 0, 0], nps: n(p, 'liquidNps'), neck: 0.3 },
      { id: 'N4', name: 'PSV connection', base: [r3(-id * 0.3), r3(topTL + headSurface(id, wall, id * 0.3)), 0], dir: [0, 1, 0], nps: n(p, 'psvNps'), neck: 0.35 },
    ]
  },
}

// ------------------------------------------------------------------ shell & tube
const stChannel = (p: Params) => r3(clamp(n(p, 'shellOd') * 0.85, 0.4, 1.2))

const shellTube: ComponentDef<'shellTube'> = {
  kind: 'shellTube',
  label: 'Shell & tube exchanger',
  category: 'Heat transfer',
  blurb: 'TEMA shell & tube exchanger with channel, tube bundle and baffles. The shell side is the process fluid.',
  tagPrefix: 'E',
  system: 'oilExport',
  params: [
    { key: 'temaType', label: 'TEMA type', type: 'select', options: ['AES', 'AEU', 'BEM', 'AKT'].map((t) => ({ value: t, label: t })) },
    { key: 'shellOd', label: 'Shell OD', type: 'number', unit: 'm', min: 0.3, max: 1.8, step: 0.05 },
    { key: 'length', label: 'Tubesheet–tubesheet', type: 'number', unit: 'm', min: 2, max: 9, step: 0.1 },
    { key: 'elevation', label: 'Shell bottom above deck', type: 'number', unit: 'm', min: 0.3, max: 3, step: 0.05 },
    rating,
    nps('shellNps', 'Shell nozzles'),
    nps('tubeNps', 'Channel nozzles'),
  ],
  defaults: { temaType: 'AES', shellOd: 0.85, length: 5, elevation: 0.6, rating: 300, shellNps: 8, tubeNps: 6 },
  body: (p) => ({
    temaType: s(p, 'temaType'),
    shellOd: n(p, 'shellOd'),
    length: n(p, 'length'),
    channelLength: stChannel(p),
    tubeCount: Math.round((n(p, 'shellOd') / 0.035) ** 2),
    tubeOd: 0.01905,
    elevation: n(p, 'elevation'),
  }),
  originY: (p) => n(p, 'elevation') + n(p, 'shellOd') / 2,
  nozzles: (p) => {
    const od = n(p, 'shellOd'), L = n(p, 'length')
    const r = od / 2
    const ch = r3(-L / 2 - stChannel(p) / 2)
    return [
      { id: 'N1', name: 'Shell inlet', base: [r3(L * 0.4), r, 0], dir: [0, 1, 0], nps: n(p, 'shellNps'), neck: 0.3 },
      { id: 'N2', name: 'Shell outlet', base: [r3(-L * 0.36), 0, r], dir: [0, 0, 1], nps: n(p, 'shellNps'), neck: 0.35 },
      { id: 'N3', name: 'Channel inlet', base: [ch, r3(-od * 0.15), -r], dir: [0, 0, -1], nps: n(p, 'tubeNps'), neck: 0.3 },
      { id: 'N4', name: 'Channel outlet', base: [ch, r, 0], dir: [0, 1, 0], nps: n(p, 'tubeNps'), neck: 0.3 },
    ]
  },
}

// ------------------------------------------------------------------ pump
const pumpSuctionY = (p: Params) => r3(0.55 + 0.03 * n(p, 'suctionNps'))

const pumpPackage: ComponentDef<'pumpPackage'> = {
  kind: 'pumpPackage',
  label: 'Centrifugal pump package',
  category: 'Rotating',
  blurb: 'API 610 end-suction / top-discharge pump with coupling guard and motor on a drain-rim baseplate. The casing is sized from its nozzles.',
  tagPrefix: 'P',
  system: 'oilExport',
  params: [
    { key: 'stages', label: 'Stages', type: 'int', min: 1, max: 4, step: 1 },
    { key: 'motorKw', label: 'Motor', type: 'number', unit: 'kW', min: 5, max: 2000, step: 5 },
    { key: 'baseL', label: 'Baseplate length', type: 'number', unit: 'm', min: 1.4, max: 5, step: 0.1 },
    { key: 'baseW', label: 'Baseplate width', type: 'number', unit: 'm', min: 0.6, max: 2, step: 0.05 },
    rating,
    nps('suctionNps', 'Suction'),
    nps('dischargeNps', 'Discharge'),
  ],
  defaults: { stages: 1, motorKw: 110, baseL: 2.8, baseW: 1.1, rating: 300, suctionNps: 6, dischargeNps: 4 },
  body: (p) => ({ stages: n(p, 'stages'), motorKw: n(p, 'motorKw'), baseplate: [n(p, 'baseL'), n(p, 'baseW')] }),
  originY: () => 0,
  nozzles: (p) => {
    const L = n(p, 'baseL')
    const sy = pumpSuctionY(p)
    return [
      { id: 'N1', name: 'Suction', base: [r3(L * 0.31), sy, 0], dir: [1, 0, 0], nps: n(p, 'suctionNps'), neck: 0.25 },
      { id: 'N2', name: 'Discharge', base: [r3(L * 0.19), r3(sy + 0.35), 0], dir: [0, 1, 0], nps: n(p, 'dischargeNps'), neck: 0.25 },
    ]
  },
}

// ------------------------------------------------------------------ compressor
const compressorPackage: ComponentDef<'compressorPackage'> = {
  kind: 'compressorPackage',
  label: 'Centrifugal compressor package',
  category: 'Rotating',
  blurb: 'Motor, gearbox and barrel compressor on a skid with an acoustic hood frame. Suction and discharge are on top.',
  tagPrefix: 'K',
  system: 'gasCompression',
  params: [
    { key: 'skidL', label: 'Skid length', type: 'number', unit: 'm', min: 7, max: 14, step: 0.5 },
    { key: 'skidW', label: 'Skid width', type: 'number', unit: 'm', min: 3, max: 5, step: 0.1 },
    { key: 'motorKw', label: 'Motor', type: 'number', unit: 'kW', min: 500, max: 15000, step: 100 },
    rating,
    nps('suctionNps', 'Suction'),
    nps('dischargeNps', 'Discharge'),
  ],
  defaults: { skidL: 11, skidW: 4, motorKw: 5000, rating: 600, suctionNps: 12, dischargeNps: 10 },
  body: (p) => ({ skid: [n(p, 'skidL'), n(p, 'skidW')], motorKw: n(p, 'motorKw') }),
  originY: () => 0,
  nozzles: (p) => {
    const L = n(p, 'skidL')
    const dr: Rating = R(p) === 600 ? 900 : R(p)
    return [
      { id: 'N1', name: 'Suction', base: [r3(L * 0.31), 2.55, 0], dir: [0, 1, 0], nps: n(p, 'suctionNps'), neck: 0.35 },
      { id: 'N2', name: 'Discharge', base: [r3(L * 0.2), 2.55, 0], dir: [0, 1, 0], nps: n(p, 'dischargeNps'), neck: 0.35, rating: dr },
    ]
  },
}

// ------------------------------------------------------------------ pig trap
const pigTrap: ComponentDef<'pigTrap'> = {
  kind: 'pigTrap',
  label: 'Pig launcher',
  category: 'Pipeline',
  blurb: 'Major/minor barrel with a quick-opening closure at +X. The kicker, vent and drain are on the major barrel.',
  tagPrefix: 'L',
  system: 'oilExport',
  params: [
    nps('majorBarrelNps', 'Major barrel'),
    nps('minorBarrelNps', 'Minor barrel / outlet'),
    { key: 'length', label: 'Overall length', type: 'number', unit: 'm', min: 2.5, max: 8, step: 0.1 },
    { key: 'elevation', label: 'Barrel axis above deck', type: 'number', unit: 'm', min: 0.6, max: 2.5, step: 0.05 },
    rating,
    nps('kickerNps', 'Kicker'),
  ],
  defaults: { majorBarrelNps: 10, minorBarrelNps: 8, length: 4.4, elevation: 1.3, rating: 600, kickerNps: 6 },
  body: (p) => ({ majorBarrelNps: n(p, 'majorBarrelNps'), minorBarrelNps: n(p, 'minorBarrelNps'), length: n(p, 'length'), elevation: n(p, 'elevation') }),
  originY: (p) => n(p, 'elevation'),
  nozzles: (p) => {
    const L = n(p, 'length')
    const Rj = r3(pipeOD(n(p, 'majorBarrelNps')) / 2)
    return [
      { id: 'N1', name: 'Outlet', base: [r3(-L / 2), 0, 0], dir: [-1, 0, 0], nps: n(p, 'minorBarrelNps'), neck: 0.25 },
      { id: 'N2', name: 'Kicker inlet', base: [r3(L * 0.23), Rj, 0], dir: [0, 1, 0], nps: n(p, 'kickerNps'), neck: 0.3 },
      { id: 'N3', name: 'Vent', base: [r3(L * 0.36), Rj, 0], dir: [0, 1, 0], nps: 2, neck: 0.2 },
      { id: 'N4', name: 'Drain', base: [r3(L * 0.32), -Rj, 0], dir: [0, -1, 0], nps: 2, neck: 0.2 },
    ]
  },
}

// ------------------------------------------------------------------ manifold
const manifold: ComponentDef<'manifold'> = {
  kind: 'manifold',
  label: 'Production / test manifold',
  category: 'Pipeline',
  blurb: 'Well slots with risers through the deck, each with a valve onto the production header and the test header.',
  tagPrefix: 'M',
  system: 'production',
  params: [
    { key: 'slots', label: 'Well slots', type: 'int', min: 1, max: 8, step: 1 },
    { key: 'length', label: 'Header length', type: 'number', unit: 'm', min: 2, max: 10, step: 0.1 },
    rating,
    nps('prodNps', 'Production header'),
    { key: 'testNps', label: 'Test header', type: 'select', options: [{ value: 0, label: 'None' }, ...NPS_OPTS] },
  ],
  defaults: { slots: 4, length: 4.2, rating: 600, prodNps: 12, testNps: 6 },
  body: (p) => ({
    slots: n(p, 'slots'),
    length: n(p, 'length'),
    headers: [
      { name: 'Production header', nps: n(p, 'prodNps'), y: 1.1, z: 0 },
      ...(n(p, 'testNps') > 0 ? [{ name: 'Test header', nps: n(p, 'testNps'), y: 1.1, z: -1.0 }] : []),
    ],
  }),
  originY: () => 0,
  nozzles: (p) => {
    const x = r3(n(p, 'length') / 2)
    const out: NozzleTemplate[] = [{ id: 'N1', name: 'Production header outlet', base: [x, 1.1, 0], dir: [1, 0, 0], nps: n(p, 'prodNps'), neck: 0.3 }]
    if (n(p, 'testNps') > 0) out.push({ id: 'N2', name: 'Test header outlet', base: [x, 1.1, -1.0], dir: [1, 0, 0], nps: n(p, 'testNps'), neck: 0.3 })
    return out
  },
}

// ------------------------------------------------------------------ chemical skid
const chemSkid: ComponentDef<'chemSkid'> = {
  kind: 'chemSkid',
  label: 'Chemical injection skid',
  category: 'Packages & buildings',
  blurb: 'Bunded skid with storage tanks, metering pumps, a discharge header and a local control panel.',
  tagPrefix: 'C',
  system: 'utilities',
  params: [
    { key: 'skidL', label: 'Skid length', type: 'number', unit: 'm', min: 2, max: 6, step: 0.1 },
    { key: 'skidW', label: 'Skid width', type: 'number', unit: 'm', min: 1.5, max: 4, step: 0.1 },
    { key: 'tanks', label: 'Tanks', type: 'int', min: 1, max: 4, step: 1 },
    { key: 'outlets', label: 'Injection outlets', type: 'int', min: 0, max: 3, step: 1 },
  ],
  defaults: { skidL: 3.4, skidW: 2.6, tanks: 3, outlets: 1 },
  body: (p) => ({ skid: [n(p, 'skidL'), n(p, 'skidW')], tanks: n(p, 'tanks') }),
  originY: () => 0,
  nozzles: (p) => {
    const k = n(p, 'outlets')
    return Array.from({ length: k }, (_, i) => ({
      id: `N${i + 1}`,
      name: `Injection outlet ${i + 1}`,
      base: [r3(n(p, 'skidL') / 2), 0.8, r3((i - (k - 1) / 2) * 0.35)] as Vec3,
      dir: [1, 0, 0] as Vec3,
      nps: 1,
      neck: 0.2,
      rating: 900 as Rating,
    }))
  },
}

// ------------------------------------------------------------------ module
const moduleDef: ComponentDef<'module'> = {
  kind: 'module',
  label: 'Equipment room / building',
  category: 'Packages & buildings',
  blurb: 'Enclosed module such as a local equipment room or switchgear building, with doors, HVAC and cable entries.',
  tagPrefix: 'B',
  system: 'utilities',
  params: [
    { key: 'sizeX', label: 'Length', type: 'number', unit: 'm', min: 3, max: 24, step: 0.5 },
    { key: 'sizeY', label: 'Height', type: 'number', unit: 'm', min: 2.6, max: 6, step: 0.1 },
    { key: 'sizeZ', label: 'Width', type: 'number', unit: 'm', min: 2.5, max: 14, step: 0.5 },
  ],
  defaults: { sizeX: 9, sizeY: 3.8, sizeZ: 6 },
  body: (p) => ({ size: [n(p, 'sizeX'), n(p, 'sizeY'), n(p, 'sizeZ')] }),
  originY: () => 0,
  nozzles: () => [],
}

// ------------------------------------------------------------------ christmas tree
const xmasTree: ComponentDef<'xmasTree'> = {
  kind: 'xmasTree',
  label: 'Wellhead & christmas tree',
  category: 'Pipeline',
  blurb: 'Wellhead spools on a conductor with lower and upper master valves (upper = actuated SSV), a cross with production and kill wings, a swab valve and a tree cap. The production wing carries the choke.',
  tagPrefix: 'XT',
  system: 'wells',
  params: [
    { key: 'wellType', label: 'Well type', type: 'select', options: [
      { value: 'oilProducer', label: 'Oil producer' },
      { value: 'gasProducer', label: 'Gas producer' },
      { value: 'waterInjector', label: 'Water injector' },
      { value: 'suspended', label: 'Suspended' },
    ] },
    { key: 'boreNps', label: 'Master bore', type: 'select', options: [2, 3, 4, 6].map((x) => ({ value: x, label: `${x}"` })) },
    { key: 'wellheadHeight', label: 'Wellhead spool stack', type: 'number', unit: 'm', min: 0.4, max: 2, step: 0.05 },
    { key: 'ssv', label: 'Actuated SSV (upper master)', type: 'bool' },
    { key: 'rating', label: 'Flange rating', type: 'select', options: ([600, 900] as const).map((r) => ({ value: r, label: `Class ${r}` })) },
    { key: 'wingNps', label: 'Production wing', type: 'select', options: NPS_OPTS.filter((o) => o.value <= 8) },
    { key: 'killNps', label: 'Kill wing', type: 'select', options: NPS_OPTS.filter((o) => o.value <= 4) },
  ],
  defaults: { wellType: 'oilProducer', boreNps: 4, wellheadHeight: 0.9, ssv: true, rating: 900, wingNps: 4, killNps: 2 },
  body: (p) => ({ wellType: s(p, 'wellType') as 'oilProducer', boreNps: n(p, 'boreNps'), ssv: b(p, 'ssv'), wellheadHeight: n(p, 'wellheadHeight') }),
  originY: () => 0,
  nozzles: (p) => {
    const y = r3(n(p, 'wellheadHeight') + XT_CROSS)
    return [
      { id: 'N1', name: 'Production wing outlet', base: [XT_WING_PROD, y, 0], dir: [1, 0, 0], nps: n(p, 'wingNps'), neck: 0.3 },
      { id: 'N2', name: 'Kill wing', base: [-XT_WING_KILL, y, 0], dir: [-1, 0, 0], nps: n(p, 'killNps'), neck: 0.25 },
    ]
  },
}

// ------------------------------------------------------------------ gas turbine generator
const gasTurbineGenerator: ComponentDef<'gasTurbineGenerator'> = {
  kind: 'gasTurbineGenerator',
  label: 'Gas turbine generator',
  category: 'Rotating',
  blurb: 'Aeroderivative or industrial gas turbine driving a generator through a gearbox, in an acoustic enclosure with an inlet filter house and an exhaust stack. Main power for the platform.',
  tagPrefix: 'GT',
  system: 'utilities',
  params: [
    { key: 'ratedMW', label: 'Rated output', type: 'number', unit: 'MW', min: 3, max: 45, step: 0.5 },
    { key: 'skidL', label: 'Package length', type: 'number', unit: 'm', min: 9, max: 22, step: 0.5 },
    { key: 'skidW', label: 'Package width', type: 'number', unit: 'm', min: 3.2, max: 6, step: 0.1 },
    { key: 'enclosureHeight', label: 'Enclosure height', type: 'number', unit: 'm', min: 3.5, max: 7, step: 0.1 },
    { key: 'stackHeight', label: 'Stack above roof', type: 'number', unit: 'm', min: 4, max: 22, step: 0.5 },
    { key: 'fuelNps', label: 'Fuel gas inlet', type: 'select', options: NPS_OPTS.filter((o) => o.value <= 6) },
  ],
  defaults: { ratedMW: 25, skidL: 15, skidW: 4.6, enclosureHeight: 5.2, stackHeight: 13, fuelNps: 3 },
  body: (p) => ({ skid: [n(p, 'skidL'), n(p, 'skidW')], enclosureHeight: n(p, 'enclosureHeight'), stackHeight: n(p, 'stackHeight'), ratedMW: n(p, 'ratedMW') }),
  originY: () => 0,
  nozzles: (p) => {
    const L = n(p, 'skidL'), W = n(p, 'skidW')
    return [
      { id: 'N1', name: 'Fuel gas inlet', base: [r3(L * 0.15), 0.9, r3(-W / 2)], dir: [0, 0, -1], nps: n(p, 'fuelNps'), neck: 0.3, rating: 600 },
      { id: 'N2', name: 'Liquid fuel (diesel) inlet', base: [r3(L * 0.05), 0.9, r3(-W / 2)], dir: [0, 0, -1], nps: 2, neck: 0.3, rating: 150 },
    ]
  },
}

// ------------------------------------------------------------------ caisson pump
const caissonPump: ComponentDef<'caissonPump'> = {
  kind: 'caissonPump',
  label: 'Caisson pump (seawater / firewater)',
  category: 'Rotating',
  blurb: 'Vertical line-shaft pump hanging in a caisson down into the sea, with a discharge head and an electric motor or a diesel engine and right-angle gearbox on top.',
  tagPrefix: 'P',
  system: 'utilities',
  params: [
    { key: 'driver', label: 'Driver', type: 'select', options: [{ value: 'electric', label: 'Electric motor' }, { value: 'diesel', label: 'Diesel + right-angle gearbox' }] },
    { key: 'motorKw', label: 'Driver power', type: 'number', unit: 'kW', min: 75, max: 3500, step: 25 },
    { key: 'caissonOD', label: 'Caisson OD', type: 'number', unit: 'm', min: 0.5, max: 1.6, step: 0.05 },
    { key: 'caissonLength', label: 'Caisson length below deck', type: 'number', unit: 'm', min: 6, max: 50, step: 0.5 },
    rating,
    { key: 'dischargeNps', label: 'Discharge', type: 'select', options: NPS_OPTS.filter((o) => o.value >= 4 && o.value <= 16) },
  ],
  defaults: { driver: 'electric', motorKw: 900, caissonOD: 0.9, caissonLength: 30, rating: 150, dischargeNps: 8 },
  body: (p) => ({ caissonOD: n(p, 'caissonOD'), caissonLength: n(p, 'caissonLength'), motorKw: n(p, 'motorKw'), driver: s(p, 'driver') as 'electric' | 'diesel' }),
  originY: () => 0,
  nozzles: (p) => [{ id: 'N1', name: 'Discharge', base: [r3(n(p, 'caissonOD') / 2 + 0.35), 1.1, 0], dir: [1, 0, 0], nps: n(p, 'dischargeNps'), neck: 0.3 }],
}

// ------------------------------------------------------------------ transformer
const transformer: ComponentDef<'transformer'> = {
  kind: 'transformer',
  label: 'Power transformer',
  category: 'Packages & buildings',
  blurb: 'Oil-immersed power transformer: tank with radiator banks, conservator and Buchholz relay, HV / LV bushings in cable boxes, on a bunded plinth.',
  tagPrefix: 'TR',
  system: 'utilities',
  params: [
    { key: 'ratingMVA', label: 'Rating', type: 'number', unit: 'MVA', min: 1, max: 60, step: 0.5 },
    { key: 'voltage', label: 'Voltage ratio', type: 'select', options: ['33/11 kV', '11/6.6 kV', '11/0.69 kV', '13.8/6.6 kV'].map((v) => ({ value: v, label: v })) },
    { key: 'tankL', label: 'Tank length', type: 'number', unit: 'm', min: 1.2, max: 6, step: 0.1 },
    { key: 'tankH', label: 'Tank height', type: 'number', unit: 'm', min: 1.2, max: 4.5, step: 0.1 },
    { key: 'tankW', label: 'Tank width', type: 'number', unit: 'm', min: 0.8, max: 3.5, step: 0.1 },
  ],
  defaults: { ratingMVA: 30, voltage: '11/6.6 kV', tankL: 3.2, tankH: 2.8, tankW: 2.0 },
  body: (p) => ({ ratingMVA: n(p, 'ratingMVA'), voltage: s(p, 'voltage'), size: [n(p, 'tankL'), n(p, 'tankH'), n(p, 'tankW')] }),
  originY: () => 0,
  nozzles: () => [],
}

// ------------------------------------------------------------------ pick proxy (environment-drawn items)
const proxy: ComponentDef<'proxy'> = {
  kind: 'proxy',
  label: 'Inspection proxy',
  category: 'Packages & buildings',
  blurb: 'Invisible pick box for an item drawn by the environment (drilling rig, BOP stack).',
  tagPrefix: 'X',
  system: 'wells',
  hidden: true,
  params: [
    { key: 'role', label: 'Role', type: 'select', options: [{ value: 'drillingRig', label: 'Drilling rig' }, { value: 'bop', label: 'BOP stack' }] },
    { key: 'sizeX', label: 'Size X', type: 'number', unit: 'm', min: 0.5, max: 60 },
    { key: 'sizeY', label: 'Size Y', type: 'number', unit: 'm', min: 0.5, max: 80 },
    { key: 'sizeZ', label: 'Size Z', type: 'number', unit: 'm', min: 0.5, max: 60 },
  ],
  defaults: { role: 'drillingRig', sizeX: 4, sizeY: 4, sizeZ: 4 },
  body: (p) => ({ role: s(p, 'role') as 'drillingRig' | 'bop', size: [n(p, 'sizeX'), n(p, 'sizeY'), n(p, 'sizeZ')] }),
  originY: () => 0,
  nozzles: () => [],
}

// ------------------------------------------------------------------ registry
export const LIBRARY: { [K in EquipmentKind]: ComponentDef<K> } = {
  horizontalVessel,
  verticalVessel,
  shellTube,
  pumpPackage,
  compressorPackage,
  pigTrap,
  manifold,
  chemSkid,
  module: moduleDef,
  xmasTree,
  gasTurbineGenerator,
  caissonPump,
  transformer,
  proxy,
}

/** what the builder palette and library page offer (pick proxies excluded) */
export const LIBRARY_LIST: ComponentDef[] = (Object.values(LIBRARY) as ComponentDef[]).filter((d) => !d.hidden)

export function componentDef(kind: EquipmentKind): ComponentDef {
  const d = LIBRARY[kind] as ComponentDef | undefined
  if (!d) throw new Error(`unknown component type "${kind}"`)
  return d
}

/** Defaults merged with overrides; unknown keys are kept so specs survive library changes. */
export function resolveParams(kind: EquipmentKind, params?: Params): Params {
  return { ...componentDef(kind).defaults, ...(params ?? {}) }
}

export interface InstanceOptions {
  tag: string
  name?: string
  system?: SystemId
  /** plan position of the equipment origin (deck x, z) */
  at: [number, number]
  /** radians about +Y */
  rotationY?: number
  /** floor level the item stands on (deck-local y), e.g. -8 for the cellar deck */
  y?: number
  params?: Params
  /** replaces the default nozzle set (local frame) */
  nozzles?: NozzleTemplate[]
  design?: DesignData
}

/** Build a renderable Equipment record. Nozzles are converted to deck coordinates here. */
export function instantiate(kind: EquipmentKind, o: InstanceOptions): Equipment {
  const def = componentDef(kind)
  const p = resolveParams(kind, o.params)
  const eq = {
    ...def.body(p),
    kind,
    tag: o.tag,
    name: o.name ?? def.label,
    system: o.system ?? def.system,
    position: [o.at[0], r3(def.originY(p) + (o.y ?? 0)), o.at[1]] as Vec3,
    rotationY: o.rotationY ?? 0,
    nozzles: [],
    design: o.design ?? {},
  } as unknown as Equipment
  const rate = (p.rating !== undefined ? R(p) : 300) as Rating
  for (const t of o.nozzles ?? def.nozzles(p)) eq.nozzles.push(nozzle(eq, t.id, t.name, t.base, t.dir, t.nps, t.neck ?? 0.3, t.rating ?? rate))
  return eq
}
