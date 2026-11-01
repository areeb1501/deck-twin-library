/**
 * RCM library: failure modes, what they cost and what to do about them, for the next-action plans. These are static example
 * rows, not a real asset's RCM study, and edits stay in this browser (no database). Machine rows use the exact failure wording
 * of CLASS_DATA, because spares and maintenance key on it. Event rows are keyed by cause & effect row id.
 */
import { create } from 'zustand'
import { CAUSE_EFFECT } from './causeEffect'
import type { MachineClass } from './alpha'

/** what a response step does. agents/nextAction.ts turns each one into a real action on this plant, or a manual step */
export type RcmDo = 'check' | 'stop' | 'standby' | 'psd' | 'esd2' | 'esd1' | 'deluge' | 'firewater'

export interface RcmStep {
  do: RcmDo
  text: string
  why: string
}

export interface RcmRow {
  id: string
  scope: 'machine' | 'event'
  /** machine class, or cause & effect row id */
  appliesTo: string
  failure: string
  effect: string
  /** how it shows up on the plant */
  signal: string
  /** 1 to 10 each. RPN is their product */
  severity: number
  occurrence: number
  detection: number
  /** the proactive task and how often */
  task: string
  interval: string
  response: RcmStep[]
  edited?: boolean
}

export const rpn = (r: Pick<RcmRow, 'severity' | 'occurrence' | 'detection'>) => r.severity * r.occurrence * r.detection

const CHECK: RcmStep = { do: 'check', text: 'Check the trend on the machine page', why: 'Two signals moving together separate a real fault from a bad transmitter.' }
const SWAP: RcmStep = { do: 'standby', text: 'Start the standby machine', why: 'Keeps the service running before the duty machine is taken off.' }
const STOP: RcmStep = { do: 'stop', text: 'Shut the machine down', why: 'Stopping early limits the damage and shortens the repair.' }
const WO: RcmStep = { do: 'check', text: 'Raise a work order and check spares cover', why: 'The job cannot start until the parts are offshore.' }

type Seed = [cls: MachineClass, failure: string, effect: string, signal: string, s: number, o: number, d: number, task: string, interval: string, response?: RcmStep[]]

const SWAP_STOP = [CHECK, SWAP, STOP, WO]
const MACHINES: Seed[] = [
  ['pump', 'Mechanical seal leak', 'Hydrocarbon leak at the seal, gas risk in the zone', 'Seal pot level, drip, point gas detector nearby', 8, 4, 4, 'Seal flush and leak inspection', '3 months', [{ do: 'check', text: 'Check gas detectors around the pump', why: 'A seal leak on hydrocarbon service is a release, not only a repair.' }, SWAP, STOP, WO]],
  ['pump', 'High bearing temperature', 'Bearing seizure, trip and shaft damage', 'Bearing temperature rising with vibration', 6, 4, 3, 'Lube oil sampling', '1 month', SWAP_STOP],
  ['pump', 'High vibration', 'Bearing and seal damage, trip', 'Vibration trend above the alert level', 6, 5, 3, 'Vibration route', '1 month', SWAP_STOP],
  ['pump', 'Motor overload', 'Motor trip, lost service', 'Motor current above rated', 5, 3, 3, 'Motor insulation test', '1 year', SWAP_STOP],
  ['caisson', 'High vibration', 'Line shaft damage, lift lost', 'Vibration trend above the alert level', 6, 4, 4, 'Vibration route and caisson survey', '3 months', SWAP_STOP],
  ['caisson', 'Motor winding temperature high', 'Winding failure, long pull-out repair', 'Winding temperature rising', 7, 3, 3, 'Insulation resistance test', '6 months', SWAP_STOP],
  ['caisson', 'Low discharge pressure', 'Cooling or firewater header pressure falls', 'Discharge pressure below the low limit', 7, 3, 3, 'Performance test', '6 months', SWAP_STOP],
  ['compressor', 'Dry gas seal leakage high', 'Gas to the seal vent, a seal failure forces a blowdown', 'Seal vent flow rising', 9, 3, 4, 'Seal gas filter change and vent flow trend', '3 months', [{ do: 'check', text: 'Check seal vent flow and gas detectors in the zone', why: 'Seal leakage is the leading sign of a dry gas seal failure.' }, STOP, WO]],
  ['compressor', 'High vibration (bearing)', 'Rotor contact, long outage', 'Radial vibration above the alert level', 9, 3, 2, 'Vibration analysis', '1 month', [CHECK, STOP, WO]],
  ['compressor', 'Lube oil pressure low', 'Bearing damage within seconds of oil loss', 'Lube oil header pressure falling', 9, 3, 2, 'Oil analysis and filter change', '1 month', [{ do: 'check', text: 'Check the lube oil header and the auxiliary pump', why: 'The auxiliary pump is the barrier before bearing damage.' }, STOP, WO]],
  ['compressor', 'VSD fault', 'Trip, gas to flare', 'Drive fault code, speed hunting', 6, 4, 3, 'Drive inspection and cooling filter change', '6 months', [CHECK, STOP, WO]],
  ['gtg', 'Flame-out', 'Generator lost, load shed', 'Exhaust temperature falls quickly', 8, 3, 2, 'Fuel nozzle inspection', '6 months', [SWAP, WO]],
  ['gtg', 'Exhaust temperature spread high', 'Hot section damage', 'Exhaust thermocouple spread widening', 7, 4, 3, 'Borescope inspection', '6 months', [CHECK, SWAP, STOP, WO]],
  ['gtg', 'High vibration', 'Bearing damage, trip', 'Vibration above the alert level', 7, 3, 3, 'Vibration analysis', '1 month', [CHECK, SWAP, STOP, WO]],
  ['gtg', 'Lube oil temperature high', 'Oil breakdown, bearing damage', 'Lube oil temperature rising', 6, 3, 3, 'Oil cooler cleaning', '6 months', [CHECK, SWAP, STOP, WO]],
  ['ia', 'High discharge temperature', 'Compressor trip, air header falls', 'Discharge temperature rising', 6, 4, 3, 'Cooler cleaning', '6 months', [CHECK, WO]],
  ['ia', 'Dryer tower failure', 'Wet air, instrument faults', 'Dew point rising', 5, 3, 4, 'Desiccant change', '1 year', [CHECK, WO]],
  ['ia', 'Motor overload', 'Compressor trip, air header falls', 'Motor current above rated', 6, 3, 3, 'Motor insulation test', '1 year', [CHECK, WO]],
  ['rig', 'Top drive fault', 'Drilling stops', 'Top drive fault code', 4, 4, 2, 'Top drive inspection', '3 months', [CHECK, STOP, WO]],
  ['rig', 'Mud pump failure', 'Circulation lost', 'Standpipe pressure falls', 6, 4, 2, 'Liner and valve inspection', '1 month', [CHECK, STOP, WO]],
  ['skid', 'Metering pump failure', 'Chemical dosing lost', 'Dosing flow falls', 4, 4, 3, 'Diaphragm change', '6 months', [CHECK, WO]],
]

/** not a cause & effect row: the plant raises this as a position discrepancy alarm */
export const VALVE_STUCK = 'valve-stuck'

const EVENTS: (Omit<RcmRow, 'id' | 'scope' | 'failure' | 'edited'> & { failure?: string })[] = [
  {
    appliesTo: VALVE_STUCK,
    failure: 'Valve not moving: position discrepancy',
    effect: 'A barrier is not where the command says it is',
    signal: 'Position does not follow the command',
    severity: 8, occurrence: 2, detection: 2, task: 'Partial stroke test', interval: '6 months',
    response: [
      { do: 'check', text: 'Find the next valve that can do the same job', why: 'A stuck valve is a failed barrier, so the isolation has to move to the next one.' },
      { do: 'check', text: 'Send a field operator to check the actuator and air supply', why: 'Only someone at the valve can tell a jammed stem from lost air.' },
      { do: 'check', text: 'Raise a work order for the valve', why: 'The barrier stays failed until it is repaired and proved.' },
    ],
  },
  {
    appliesTo: 'fire-single',
    effect: 'A real fire can escalate before a second detector confirms it',
    signal: 'One flame detector in the zone',
    severity: 9, occurrence: 2, detection: 3, task: 'Flame detector function test', interval: '6 months',
    response: [
      { do: 'check', text: 'Confirm the fire on the nearest camera', why: 'One detector is not a vote, and the camera is the fastest second opinion.' },
      { do: 'deluge', text: 'Release deluge in the zone', why: 'If the fire is real, cooling starts before the second detector votes.' },
      { do: 'esd1', text: 'Initiate ESD1 if the fire is confirmed', why: 'Fuel to the fire stops only when the inventory is isolated and blown down.' },
    ],
  },
  {
    appliesTo: 'fire-confirmed',
    effect: 'Escalation to neighbouring equipment, loss of the platform',
    signal: '2ooN flame detectors in one zone',
    severity: 10, occurrence: 2, detection: 2, task: 'Cause and effect proof test', interval: '1 year',
    response: [
      { do: 'esd1', text: 'Make sure ESD1 is in', why: 'ESD1 isolates the inventory and starts blowdown, which removes the fuel.' },
      { do: 'deluge', text: 'Make sure deluge is open in the zone', why: 'Deluge cools what is next to the fire and starves it.' },
      { do: 'firewater', text: 'Make sure a firewater pump is running', why: 'Deluge has no pressure without a pump on the ring main.' },
      { do: 'check', text: 'Check every ESD valve reached closed', why: 'A stuck valve keeps feeding the fire, so check valves, not commands.' },
      { do: 'check', text: 'Muster and account for everyone', why: 'People first: nobody goes back in until the count is complete.' },
    ],
  },
  {
    appliesTo: 'gas-high',
    effect: 'Gas cloud reaches an ignition source',
    signal: 'One detector at the high setpoint',
    severity: 9, occurrence: 3, detection: 3, task: 'Gas detector calibration', interval: '6 months',
    response: [
      { do: 'check', text: 'Confirm with a second detector or camera', why: 'One detector at high is an alarm, not a vote.' },
      { do: 'check', text: 'Suspend hot work and crane lifts', why: 'Removing ignition sources is free and reversible.' },
      { do: 'esd2', text: 'Initiate ESD2 on the zone if it spreads', why: 'Zone isolation and blowdown stop the release at its source.' },
    ],
  },
  {
    appliesTo: 'gas-confirmed',
    effect: 'Explosion risk in the zone',
    signal: '2ooN detectors at the high setpoint',
    severity: 10, occurrence: 2, detection: 2, task: 'Cause and effect proof test', interval: '1 year',
    response: [
      { do: 'esd2', text: 'Make sure ESD2 is in for the zone', why: 'Zone isolation, blowdown and ignition isolation all hang on it.' },
      { do: 'check', text: 'Check the zone ESD valves reached closed', why: 'The release only falls once the source is isolated.' },
      { do: 'check', text: 'Muster and account for everyone', why: 'People first: the general alarm has sounded.' },
    ],
  },
  {
    appliesTo: 'lahh-1101',
    effect: 'Liquid carry-over to the compressor',
    signal: 'Separator level at high-high',
    severity: 8, occurrence: 3, detection: 2, task: 'Level transmitter proof test', interval: '1 year',
    response: [
      { do: 'check', text: 'Find why level rose: export, level valve or inflow', why: 'The PSD cannot be reset until the cause has cleared.' },
      { do: 'check', text: 'Bring level down before reset', why: 'Reset is refused while level is still above the limit.' },
    ],
  },
  {
    appliesTo: 'pahh-1101',
    effect: 'Relief to flare, loss of containment if relief fails',
    signal: 'Separator pressure at high-high',
    severity: 9, occurrence: 2, detection: 2, task: 'Pressure transmitter proof test', interval: '1 year',
    response: [{ do: 'check', text: 'Check the gas outlet path and the flare valve', why: 'High pressure means gas has lost its way out.' }],
  },
  {
    appliesTo: 'ia-ll',
    effect: 'Fail-closed valves drift shut',
    signal: 'Instrument air header at low-low',
    severity: 8, occurrence: 2, detection: 2, task: 'Air compressor service', interval: '6 months',
    response: [{ do: 'check', text: 'Check the air compressor and receiver', why: 'Restoring air is the only way to a clean restart.' }],
  },
  {
    appliesTo: 'cm-hh',
    effect: 'Compressor trips on high discharge temperature',
    signal: 'Cooling medium supply at high-high',
    severity: 6, occurrence: 3, detection: 2, task: 'Exchanger cleaning', interval: '1 year',
    response: [{ do: 'check', text: 'Check seawater lift and the cooling medium pumps', why: 'High supply temperature means the heat has lost its way out.' }],
  },
  {
    appliesTo: 'blackout',
    effect: 'Process stops, essential loads on the emergency generator',
    signal: 'No turbine generator on the bus',
    severity: 8, occurrence: 2, detection: 1, task: 'Emergency generator test run', interval: '1 month',
    response: [{ do: 'check', text: 'Check the emergency generator took the essential loads', why: 'It is the only source left, and it must start within 15 s.' }],
  },
]

export function exampleRows(): RcmRow[] {
  const machines = MACHINES.map(([cls, failure, effect, signal, severity, occurrence, detection, task, interval, response]): RcmRow => ({ id: `${cls}:${failure}`, scope: 'machine', appliesTo: cls, failure, effect, signal, severity, occurrence, detection, task, interval, response: response ?? SWAP_STOP }))
  const events = EVENTS.map((e): RcmRow => ({ ...e, id: `event:${e.appliesTo}`, scope: 'event', failure: e.failure ?? CAUSE_EFFECT.find((r) => r.id === e.appliesTo)?.cause ?? e.appliesTo }))
  return [...machines, ...events]
}

const KEY = 'deckTwin.rcm.v1'

function load(): RcmRow[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    const v = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(v) && v.length ? (v as RcmRow[]) : exampleRows()
  } catch {
    return exampleRows()
  }
}
function keep(rows: RcmRow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows))
  } catch {
    /* quota / private mode */
  }
}

interface RcmStore {
  rows: RcmRow[]
  update: (id: string, patch: Partial<RcmRow>) => void
  add: (scope: RcmRow['scope'], appliesTo: string) => string
  remove: (id: string) => void
  reset: () => void
}

let seq = 0
export const useRcm = create<RcmStore>((set, get) => ({
  rows: load(),
  update: (id, patch) => {
    set((s) => ({ rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch, edited: true } : r)) }))
    keep(get().rows)
  },
  add: (scope, appliesTo) => {
    const id = `own:${Date.now().toString(36)}-${++seq}`
    set((s) => ({ rows: [{ id, scope, appliesTo, failure: 'New failure mode', effect: '', signal: '', severity: 5, occurrence: 3, detection: 3, task: '', interval: '', response: [CHECK], edited: true }, ...s.rows] }))
    keep(get().rows)
    return id
  },
  remove: (id) => {
    set((s) => ({ rows: s.rows.filter((r) => r.id !== id) }))
    keep(get().rows)
  },
  reset: () => {
    set({ rows: exampleRows() })
    keep(get().rows)
  },
}))

/** the row for a failure mode. `FAILURE: x` is how a trip quotes it */
export function rcmFor(cls: string, mode: string | undefined): RcmRow | null {
  const rows = useRcm.getState().rows.filter((r) => r.scope === 'machine' && r.appliesTo === cls)
  const clean = mode?.replace(/^FAILURE:\s*/i, '').trim()
  return rows.find((r) => r.failure === clean) ?? (clean ? null : ([...rows].sort((a, b) => rpn(b) - rpn(a))[0] ?? null))
}

export const rcmForEvent = (causeId: string) => useRcm.getState().rows.find((r) => r.scope === 'event' && r.appliesTo === causeId) ?? null
