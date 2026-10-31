/**
 * Alpha field operating data for the simulation: well potentials, machine roles, capacities,
 * power loads, shutdown valve lists, start times and reliability. The engine (state/sim.ts) reads
 * only this table, so another field is another table. Tags not present in the loaded plant are
 * ignored (no phantom capacity).
 */
import type { PlatformId } from './types'

export interface WellData {
  oil: number // bbl/d at 100 % choke
  gor: number // scf/bbl
  wc: number // water cut
  platform: PlatformId
  /** wing / flowline ESD valve */
  wing?: string
}

export const WELLS: Record<string, WellData> = {
  'XT-110': { oil: 11000, gor: 1100, wc: 0.25, platform: 'Alpha', wing: 'XV-1011' },
  'XT-120': { oil: 10500, gor: 1050, wc: 0.35, platform: 'Alpha', wing: 'XV-1021' },
  'XT-130': { oil: 1500, gor: 16000, wc: 0.05, platform: 'Alpha', wing: 'XV-1031' }, // gas producer
  'XT-140': { oil: 12000, gor: 1150, wc: 0.2, platform: 'Alpha', wing: 'XV-1041' },
  'XT-150': { oil: 9800, gor: 980, wc: 0.45, platform: 'Alpha', wing: 'XV-1051' },
  // WHP-N wells, tied back over the north bridge into Alpha's inlet
  'XT-N101': { oil: 7000, gor: 1050, wc: 0.3, platform: 'WHP-N', wing: 'XV-N111' },
  'XT-N102': { oil: 1200, gor: 15000, wc: 0.05, platform: 'WHP-N', wing: 'XV-N121' }, // gas producer
  'XT-N103': { oil: 6500, gor: 1000, wc: 0.35, platform: 'WHP-N', wing: 'XV-N131' },
  'XT-N104': { oil: 7500, gor: 1100, wc: 0.25, platform: 'WHP-N', wing: 'XV-N141' },
  'XT-N105': { oil: 6000, gor: 950, wc: 0.4, platform: 'WHP-N', wing: 'XV-N151' },
}
/** reservoir-managed reference choke: the maximum production potential is counted at max(choke, this) */
export const REF_CHOKE = 60

export const CAP = {
  exportPump: 58000, // bbl/d per running P-1500
  pwPump: 30000, // bbl/d water per running P-4300
  compressor: 95, // MMscfd at 100 % speed
  flarePcv: 140, // MMscfd the HP pressure-control valve to flare can pass
  flareSystem: 180, // MMscfd flare design
}

/** HP separator V-1100 */
export const HP = {
  setpoint: 35,
  pal: 28,
  pah: 38,
  pahh: 40,
  psv: 42,
  /** liquid hold-up: bbl per % of level */
  bblPerPct: 5,
  nll: 52,
  /** level ↔ LT-1101 mm */
  mmPerPct: 36,
  lah: 72,
  lahh: 83.3,
  lal: 30.6,
  lall: 22.2,
  /** process gas inventory blown down on ESD, MMscf */
  inventory: 0.6,
  /** blowdown time constant, s (API 521: to ~50 % of design in 15 min) */
  bdTau: 300,
}

export const TAGS = {
  sep: 'V-1100',
  lp: 'V-1300',
  inlet: 'ESDV-1001',
  riser: 'ESDV-1601',
  gasOut: 'ESDV-2101',
  gasExport: 'ESDV-2301',
  fuelGas: 'ESDV-5301',
  turbineFuel: ['ESDV-8101', 'ESDV-8102'],
  bridgeN: 'ESDV-N2003',
  bdv: ['BDV-2201'],
  oilLv: 'LV-1101',
  waterLv: 'LV-1102',
  antiSurge: 'FV-2201',
  compressor: 'K-2200',
  exportPumps: ['P-1500A', 'P-1500B'],
  pwPumps: ['P-4300A', 'P-4300B'],
  swPumps: ['P-6400A', 'P-6400B'],
  cmPumps: ['P-6200A', 'P-6200B'],
  iaCompressor: 'K-4600',
  fwPumps: ['P-7101A', 'P-7101B'],
  gtgs: ['GT-8100A', 'GT-8100B'],
  rig: 'DR-100',
  emergencyGen: 'B-9310',
  /** RP — riser & export platform (west of Alpha) */
  rp: {
    oilRiser: 'ESDV-R101',
    gasRiser: 'ESDV-R201',
    /** riser topsides blowdown to the RP cold vent */
    bdv: 'BDV-R203',
    oilMeter: 'X-R150',
    gasMeter: 'X-R250',
    oilPig: 'L-R110',
    gasPig: 'L-R210',
    vent: 'VS-R300',
  },
  /** WI — water-injection platform (north of WHP-N) */
  wi: {
    liftPumps: ['P-W300A', 'P-W300B'],
    injPumps: ['P-W310A', 'P-W310B'],
    deaerator: 'V-W320',
    filter: 'X-W330',
    esdv: 'ESDV-W401',
    injector: 'XT-N106',
  },
  /** Alpha cold vent stack (TEG regeneration still, LP sources) */
  ventA: 'VS-A300',
  /** instruments the dynamic model drives directly */
  inst: {
    hpLevel: 'LT-1101',
    hpPressure: 'PT-1101',
    lpLevel: 'LT-1301',
    ia: ['PT-4603', 'PT-N2801', 'PT-N2811'],
    cm: 'TT-6303',
    fuel: ['PT-8101', 'PT-8102'],
    fw: ['PT-N2851'],
    flare: 'PT-2401',
    surge: 'FT-2201',
    /** RP oil export meter / kicker flow, WI injection flow and discharge pressure */
    exportFlow: ['FT-R1102', 'FT-R150'],
    wiFlow: 'FT-W401',
    wiDischarge: 'PT-W311',
    iaRemote: ['PT-R2801', 'PT-R2811'],
    fwRemote: ['PT-R2851'],
  },
}

/** electrical loads, MW when running (the compressor is 6.5 × speed³ on top) */
export const LOADS: Record<string, number> = {
  'P-1500A': 0.45,
  'P-1500B': 0.45,
  'P-6400A': 0.9,
  'P-6400B': 0.9,
  'P-6200A': 0.09,
  'P-6200B': 0.09,
  'P-4300A': 0.055,
  'P-4300B': 0.055,
  'K-4600': 0.25,
  'DR-100': 3.5,
  'P-W300A': 0.6,
  'P-W300B': 0.6,
  'P-W310A': 2.6,
  'P-W310B': 2.6,
}
/** machines that run in parallel by default (2 × 50 %), not duty / standby */
export const ALWAYS_RUN = ['P-W310B']
/** water injection: bwpd per running injection pump; voidage the field needs replaced, bwpd */
/**
 * Water injection: bwpd per running injection pump; voidage the field needs replaced, bwpd. Reservoir
 * response is accelerated (~2 %/h with no injection, weeks in reality) so it shows within a training shift.
 */
export const WI = { perPump: 20000, voidage: 40000, /** reservoir factor change per (bwpd · s) of imbalance */ k: 1 / (40000 * 3600 * 50) }
export const BASE_LOAD = 6.5
export const COMP_MW = 6.5
/** under-frequency load shedding, first to go first */
export const SHED_ORDER = ['DR-100', 'P-W310B', 'P-W310A', 'K-2200', 'P-6400B', 'P-6200B']

/** PSD valve lists per platform (ESD2 adds the zone's valves, ESD1 every ESD valve on the platform) */
export const PSD_VALVES: Partial<Record<PlatformId, string[]>> = {
  Alpha: ['ESDV-1001', 'ESDV-1601', 'ESDV-2301', 'XV-1011', 'XV-1021', 'XV-1031', 'XV-1041', 'XV-1051'],
  'WHP-N': ['XV-N111', 'XV-N121', 'XV-N131', 'XV-N141', 'XV-N151', 'XV-N1611', 'ESDV-N2003'],
  RP: ['ESDV-R101', 'ESDV-R201'],
  WI: ['ESDV-W401'],
}
/**
 * machines a PSD stops (restarted by the platform restart). Export and produced-water pumps keep
 * running so the level controllers can drain the separator back below LAH (otherwise the LAHH PSD
 * could never be reset); with no inflow they simply turn down to zero flow.
 */
export const PSD_STOPS: Partial<Record<PlatformId, string[]>> = {
  Alpha: ['K-2200'],
  'WHP-N': [],
  RP: [],
  WI: ['P-W310A', 'P-W310B'],
}
/** ESD1 also stops these (ignition sources, non-essential) */
export const ESD1_STOPS: Partial<Record<PlatformId, string[]>> = {
  Alpha: ['DR-100', 'C-1700', 'C-5350', 'C-5600', 'P-4500'],
  'WHP-N': ['C-N260'],
  RP: [],
  WI: ['P-W300A', 'P-W300B'],
}

export type MachineClass = 'pump' | 'caisson' | 'compressor' | 'gtg' | 'ia' | 'rig' | 'skid'
export const CLASS_DATA: Record<MachineClass, { start: number; mtbfH: number; mttrH: number; failures: string[] }> = {
  pump: { start: 15, mtbfH: 6000, mttrH: 6, failures: ['Mechanical seal leak', 'High bearing temperature', 'High vibration', 'Motor overload'] },
  caisson: { start: 30, mtbfH: 7000, mttrH: 10, failures: ['High vibration', 'Motor winding temperature high', 'Low discharge pressure'] },
  compressor: { start: 300, mtbfH: 3000, mttrH: 18, failures: ['Dry gas seal leakage high', 'High vibration (bearing)', 'Lube oil pressure low', 'VSD fault'] },
  gtg: { start: 180, mtbfH: 2500, mttrH: 10, failures: ['Flame-out', 'Exhaust temperature spread high', 'High vibration', 'Lube oil temperature high'] },
  ia: { start: 60, mtbfH: 5000, mttrH: 4, failures: ['High discharge temperature', 'Dryer tower failure', 'Motor overload'] },
  rig: { start: 10, mtbfH: 1500, mttrH: 3, failures: ['Top drive fault', 'Mud pump failure'] },
  skid: { start: 10, mtbfH: 8000, mttrH: 4, failures: ['Metering pump failure'] },
}
export const RELIABILITY_FACTOR = { off: 0, realistic: 1, training: 500 }

/** MMscf of gas ↔ boe (1 boe = 5 800 scf) */
export const BOE_PER_MMSCF = 1e6 / 5800

/** process alarms that have a cause & effect row: instrument tag to row id */
export const ALARM_CAUSE: Record<string, string> = {
  'LT-1101': 'lahh-1101',
  'PT-1101': 'pahh-1101',
  'PT-4603': 'ia-ll',
  'TT-6303': 'cm-hh',
}
