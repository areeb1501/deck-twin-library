/**
 * Plant simulation contract: the state the simulation keeps, and the actions the UI and the scene
 * call. The engine is in state/sim.ts; this file is the shared vocabulary for everything that reads it
 * (operations panel, control-room HMI and video wall, F&G mapping, 3D effects).
 *
 * Time is SIMULATED seconds since the start of the session (`t`), advanced by the clock at `speed`×
 * (0 = paused). Format with `fmtClock(t)`.
 */
import type { Vec3 } from '../model/types'

export type RunState = 'running' | 'starting' | 'standby' | 'stopped' | 'tripped'

/** Bridge-linked platforms of the field (other plants use 'Plant'). */
export type PlatformId = 'Alpha' | 'WHP-N' | 'LQ' | 'RP' | 'WI' | 'Plant'
/** the bridge-linked platforms of the Alpha field, in display order */
export const FIELD_PLATFORMS: PlatformId[] = ['Alpha', 'WHP-N', 'RP', 'WI', 'LQ']
export const PLATFORM_LABEL: Record<PlatformId, string> = {
  Alpha: 'Alpha PDQ (process, drilling)',
  'WHP-N': 'WHP-N wellhead platform',
  RP: 'RP riser & export platform',
  WI: 'WI water-injection platform',
  LQ: 'LQ accommodation & CCR',
  Plant: 'Plant',
}

/** NSTA / UKSS production-efficiency loss categories (what the deferred production is booked to). */
export type LossCategory = 'wells' | 'reservoir' | 'oil' | 'gas' | 'power' | 'utilities' | 'controlSafety' | 'export' | 'planned'
export const LOSS_LABEL: Record<LossCategory, string> = {
  wells: 'Wells (choked back / shut in)',
  reservoir: 'Reservoir support (water injection)',
  oil: 'Plant: oil system',
  gas: 'Plant: gas system & flaring',
  power: 'Plant: power generation',
  utilities: 'Plant: utilities (air, cooling)',
  controlSafety: 'Control & safety (trips, ESD)',
  export: 'Export',
  planned: 'Planned maintenance',
}

/** Shutdown hierarchy, lowest to highest. A shutdown includes every level below it, never one above. */
export type ShutdownLevel = 'USD' | 'PSD' | 'ESD2' | 'ESD1' | 'APS'
export const SHUTDOWN_LABEL: Record<ShutdownLevel, string> = {
  USD: 'Unit shutdown',
  PSD: 'Process shutdown',
  ESD2: 'Fire-zone ESD + blowdown',
  ESD1: 'Total platform ESD + blowdown',
  APS: 'Abandon platform shutdown',
}
export const SHUTDOWN_RANK: Record<ShutdownLevel, number> = { USD: 0, PSD: 1, ESD2: 2, ESD1: 3, APS: 4 }

export interface Shutdown {
  id: string
  level: ShutdownLevel
  platform: PlatformId
  /** fire zone for ESD2 (and the zone a confirmed fire / gas came from) */
  zone?: string
  /** what initiated it (cause & effect row text, or "Manual ESD push-button CCR") */
  cause: string
  /** cause & effect row id that initiated it */
  causeId: string
  /** booked to this PE loss category while the plant is down because of it */
  loss: LossCategory
  at: number
  /** latched until reset; resettable once the cause has cleared */
  resettable: boolean
  /** reset by the operator (plant stays down until restarted) */
  resetAt?: number
}

/** ISA-18.2 alarm priority: 1 = emergency / critical, 2 = high, 3 = low */
export type AlarmPriority = 1 | 2 | 3
export type AlarmState = 'unack' | 'ack' | 'rtnUnack' | 'shelved'
export interface Alarm {
  id: string
  /** instrument / equipment / zone tag the alarm belongs to */
  tag: string
  text: string
  priority: AlarmPriority
  kind: 'process' | 'equipment' | 'fg' | 'esd' | 'system'
  platform: PlatformId
  zone?: string
  state: AlarmState
  /** still in alarm (false once the condition has returned to normal) */
  active: boolean
  raisedAt: number
  ackAt?: number
  shelvedUntil?: number
  /** value at the time it was raised, with unit */
  value?: string
}

/** Valves the simulation operates (ESD, blowdown, deluge, actuated on/off valves, control valves). */
export interface ValveSim {
  /** travel 0 (closed) … 1 (open) — strokes towards cmd */
  pos: number
  cmd: 'open' | 'closed'
  /** full stroke time, sim seconds */
  stroke: number
  fault?: 'stuck'
  /** who last moved it */
  by?: string
}

export interface MachineSim {
  /** start sequence ends at (sim s) while `starting` */
  startDoneAt?: number
  /** why it tripped */
  tripCause?: string
  /** trip needs a field operator at the machine to reset (machinery protection) */
  localReset?: boolean
  /** failed: under repair until (sim s); reset is refused until then */
  repairUntil?: number
  /** stopped by a shutdown (restarted by the platform restart) */
  byShutdown?: string
  /** auto-started standby machine */
  autoStarted?: boolean
  runHours: number
}

/** A fire & gas zone's live status (zones and their coverage come from sim/fg.ts) */
export interface ZoneStatus {
  zone: string
  /** worst gas state in the zone: 1ooN low (20 % LEL / 1 LEL·m), 1ooN high (60 % LEL / 3 LEL·m), 2ooN high = confirmed */
  gas: 'normal' | 'low' | 'high' | 'confirmed'
  /** flame: 1ooN = single, 2ooN = confirmed */
  fire: 'normal' | 'single' | 'confirmed'
  /** heat / smoke inside modules */
  smoke: 'normal' | 'single' | 'confirmed'
  deluge: boolean
  /** detectors currently at or above the high setpoint */
  highCount: number
}

export interface DetectorSim {
  /** %LEL (point), LEL·m (open path), 1/0 (flame, heat, smoke, MAC) */
  value: number
  state: 'normal' | 'low' | 'high' | 'fault' | 'inhibited'
}

/** Faults the instructor can inject (Phase 3 builds a scenario library on top of these). */
export type Fault =
  | { kind: 'gasRelease'; at: Vec3; rateKgS: number; source?: string; label?: string }
  | { kind: 'fire'; at: Vec3; sizeMW: number; source?: string; label?: string }
  | { kind: 'trip'; tag: string; cause: string; local?: boolean; repairH?: number }
  | { kind: 'valveStuck'; tag: string }
  | { kind: 'levelControlFail'; tag: string }
  | { kind: 'antiSurgeFail' }
  | { kind: 'instrumentAirFail' }
  | { kind: 'coolingFail' }
  | { kind: 'exportBlocked' }
  | { kind: 'detectorFault'; tag: string }

/** An active injected fault / incident */
export interface Incident {
  id: string
  fault: Fault
  at: number
  /** gas release / fire: deck-local position */
  pos?: Vec3
  /** gas release: current rate (decays once the source is isolated and blown down), kg/s */
  rate?: number
  /** fire: burning (extinguished by deluge after a while, or when the fuel is isolated) */
  burning?: boolean
  zone?: string
  platform?: PlatformId
  cleared?: number
}

/** Live process variables of the dynamic model (Alpha). */
export interface ProcessState {
  /** HP separator V-1100 liquid level, % */
  hpLevel: number
  /** HP separator pressure, barg */
  hpPressure: number
  /** LP separator V-1300 level, % */
  lpLevel: number
  /** instrument-air header, barg */
  iaPressure: number
  /** cooling medium supply temperature, °C */
  cmTemp: number
  /** compressor surge margin, % (below 10 = anti-surge valve opening) */
  surgeMargin: number
  /** anti-surge recycle valve opening, % */
  recycle: number
  /** fuel gas header, barg (0 = turbines on diesel) */
  fuelGasPressure: number
  /** blowdown inventory left, MMscf */
  blowdownInventory: number
  /** gas relieved by PSVs right now, MMscfd */
  relief: number
  /** bus frequency, Hz */
  busHz: number
  /** emergency generator */
  emergencyGen: RunState
  /** firewater ring main, barg */
  fwPressure: number
  /** reservoir pressure support, 1 = initial (water injection holds it; production draws it down) */
  reservoir: number
  /** water injected, bwpd */
  wiRate: number
  /** cold vent to atmosphere (TEG still, riser blowdown on RP), MMscfd */
  vent: number
}

export interface Constraint {
  id: string
  text: string
  loss: LossCategory
  /** lost boe/d attributed to it */
  boe: number
}

export interface PlatformResult {
  oil: number
  gas: number
  water: number
  /** producing (not shut down) */
  online: boolean
  /** highest latched shutdown */
  shutdown: ShutdownLevel | null
  /** general alarm status on the platform */
  ga: 'normal' | 'gas' | 'fire' | 'muster' | 'abandon'
}

export interface PlantResult {
  oilPotential: number
  oilProduced: number
  oilExport: number
  gasProduced: number
  gasCompressed: number
  gasExport: number
  fuelGas: number
  flare: number
  water: number
  powerDemand: number
  powerAvailable: number
  powerGenerated: number
  /** instantaneous production efficiency: actual / maximum production potential (boe), % */
  efficiency: number
  /** maximum production potential and actual, boe/d */
  mpp: number
  actual: number
  /** first constraint (compat) */
  constraint: string | null
  constraints: Constraint[]
  /** per-well actual oil */
  wells: Record<string, { oil: number; gas: number; water: number; online: boolean }>
  platforms: Partial<Record<PlatformId, PlatformResult>>
  /** throughput factors for scaling instrument values (1 = design) */
  f: { oil: number; gas: number; water: number; power: number; flare: number }
}

export interface Kpis {
  /** production efficiency over the whole session (sim time), % */
  pe: number
  /** production efficiency over the last simulated hour, % */
  peHour: number
  /** share of sim time the field was up (no PSD / ESD / blackout), % */
  availability: number
  /** deferred production per loss category, boe (session) */
  losses: Record<LossCategory, number>
  /** produced / potential, boe (session) */
  producedBoe: number
  potentialBoe: number
  /** alarms raised in the last 10 sim minutes (ISA-18.2: ≥ 10 is a flood) */
  alarmRate: number
  /** trips and shutdowns this session */
  trips: number
  shutdowns: number
}

export interface Knobs {
  chokes: Record<string, number>
  wellOnline: Record<string, boolean>
  /** HP separator pressure setpoint, barg (PSV-1101 set 42 barg) */
  hpPressure: number
  /** export compressor speed, % */
  compressorSpeed: number
  /** drilling in progress (rig load + drilling KPIs) */
  drilling: boolean
  /** standby machines start automatically when the duty one trips */
  autoChangeover: boolean
  /** random equipment failures: off, realistic MTBF, or training (rates × 500) */
  reliability: 'off' | 'realistic' | 'training'
  /** wind: direction it blows FROM (deg, 0 = north = −Z, clockwise), speed m/s */
  wind: { from: number; speed: number }
  /** significant wave height, m (crane / supply-boat limits, ocean) */
  seaState: number
}

/** Audit trail of what people (and automation) did — scenario scoring and shift handover read it */
export interface OperatorAction {
  id: number
  t: number
  who: 'operator' | 'field' | 'auto' | 'instructor' | 'scenario'
  /** e.g. 'start', 'stop', 'resetTrip', 'localReset', 'setValve', 'ack', 'ackAll', 'shelve', 'initiate',
   *  'resetShutdown', 'restart', 'setChoke', 'setWell', 'setKnob', 'inhibit', 'inject', 'lockOut', 'release' */
  action: string
  tag?: string
  detail?: string
}

/** Equipment or a valve locked out under a permit (machine cannot start, valve cannot move) */
export interface Lockout {
  /** permit / work-order id that holds it */
  by: string
  /** planned work: deferred production is booked to 'planned' */
  planned: boolean
  at: number
  /** valves: the position it is locked in */
  position?: 'open' | 'closed'
}

/** Something that steps with the simulation (maintenance, scenarios, cranes …). Registered with
 *  `registerSimPlugin`; `step` runs after every engine tick with the simulated seconds that passed. */
export interface SimPlugin {
  id: string
  step: (dt: number, t: number) => void
  reset?: () => void
  /** alarm conditions the plugin holds right now (the engine reconciles them like its own: raise, return to normal, ack) */
  alarms?: () => PluginAlarm[]
  /** live value for an instrument / metric tag the plugin simulates (undefined = not mine) */
  value?: (tag: string) => number | undefined
}
export interface PluginAlarm {
  /** stable key for the condition, e.g. `CR-A1:ENGINE` */
  key: string
  tag: string
  text: string
  priority: AlarmPriority
  kind?: Alarm['kind']
  platform: PlatformId
  zone?: string
  value?: string
}

export interface HistoryPoint {
  t: number
  oil: number
  gas: number
  flare: number
  power: number
  eff: number
  hpLevel: number
  hpPressure: number
  iaPressure: number
}

export interface SimEvent {
  id: number
  t: number
  text: string
  level: 'info' | 'warn' | 'trip'
}

/** Rows of the cause & effect matrix (sim/causeEffect.ts) */
export interface CauseEffectRow {
  id: string
  cause: string
  /** what it initiates */
  level: ShutdownLevel | 'alarm'
  scope: 'zone' | 'platform' | 'field' | 'unit'
  effects: string[]
  loss: LossCategory
}

export interface SimState {
  /** simulated seconds since session start */
  t: number
  /** clock speed (0 = paused) */
  speed: number
  knobs: Knobs
  /** explicit run states (anything not listed uses defaultState) */
  status: Record<string, RunState>
  machines: Record<string, MachineSim>
  /** valves the simulation operates, by tag (others stay in their `normally` position) */
  valves: Record<string, ValveSim>
  process: ProcessState
  /** open doors, key `${tag}/${doorId}` */
  doors: Record<string, boolean>
  result: PlantResult | null
  /** flow factor per line tag (0 = no flow), refreshed every tick — drives the flow particles */
  lineFlow: Record<string, number>
  history: HistoryPoint[]
  /** compat: = kpis.availability */
  availability: number
  kpis: Kpis
  events: SimEvent[]
  alarms: Alarm[]
  /** latched shutdowns (cleared after reset + restart) */
  shutdowns: Shutdown[]
  /** F&G status per zone id */
  fg: Record<string, ZoneStatus>
  /** F&G detector readings by tag */
  detectors: Record<string, DetectorSim>
  /** inhibited (overridden) detectors — excluded from voting and coverage */
  inhibits: Record<string, boolean>
  incidents: Incident[]
  /** operator / field / automation actions, newest first (capped) */
  actions: OperatorAction[]
  /** permits' lock-outs by equipment / valve tag */
  lockouts: Record<string, Lockout>

  // ---- knobs
  setSpeed: (x: number) => void
  setChoke: (tag: string, v: number) => void
  setWell: (tag: string, on: boolean) => void
  setKnob: <K extends 'hpPressure' | 'compressorSpeed' | 'drilling' | 'autoChangeover' | 'reliability' | 'wind' | 'seaState'>(k: K, v: Knobs[K]) => void
  /** lock a machine out (it is stopped) or a valve (commanded to `position`, then held) under a permit */
  lockOut: (tag: string, by: string, opts?: { planned?: boolean; position?: 'open' | 'closed' }) => string | null
  /** remove a lock-out (only the permit that set it) */
  release: (tag: string, by: string) => string | null
  /** record an action in the audit trail (UI that acts outside the engine API, e.g. ack from the banner) */
  record: (a: Omit<OperatorAction, 'id' | 't'>) => void
  // ---- machines
  /** start / stop a machine; returns why it was refused (null = done) */
  start: (tag: string) => string | null
  stop: (tag: string) => string | null
  trip: (tag: string, why?: string, opts?: { local?: boolean; repairH?: number }) => void
  /** reset a trip; `local` = done by the field operator at the machine. Returns why it was refused. */
  resetTrip: (tag: string, opts?: { local?: boolean }) => string | null
  /** compat: running → start, standby/stopped → stop, tripped → trip */
  setStatus: (tag: string, s: RunState) => void
  // ---- valves
  setValve: (tag: string, cmd: 'open' | 'closed', by?: string) => string | null
  // ---- alarms
  ackAlarm: (id: string) => void
  ackAll: () => void
  shelve: (id: string, minutes: number) => void
  unshelve: (id: string) => void
  // ---- shutdowns
  /** manual ESD push-button / initiation */
  initiate: (level: ShutdownLevel, platform: PlatformId, zone?: string, cause?: string) => void
  /** reset a latched shutdown; returns why it was refused */
  resetShutdown: (id: string) => string | null
  /** re-open ESD valves, close blowdown, restart machines stopped by the shutdown, ramp wells back */
  restart: (platform: PlatformId) => string | null
  // ---- F&G
  inhibit: (tag: string, on: boolean) => void
  // ---- instructor
  inject: (f: Fault) => string
  clearIncident: (id: string) => void
  reset: () => void
  // ---- doors
  setDoor: (key: string, open: boolean) => void
  toggleDoor: (key: string) => void
  /** advance by `dtWall` real seconds × speed */
  tick: (dtWall?: number) => void
}

/** sim seconds → "D1 06:12:40" (the session starts at 06:00 on day 1) */
export function fmtClock(t: number, withDay = true) {
  const s = Math.floor(t) + 6 * 3600
  const d = Math.floor(s / 86400) + 1
  const hh = Math.floor((s % 86400) / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${withDay ? `D${d} ` : ''}${p(hh)}:${p(mm)}:${p(ss)}`
}
