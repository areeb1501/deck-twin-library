/**
 * Plant simulation engine. Implements the contract in sim/types.ts for the Alpha field (data in
 * sim/alpha.ts, cause & effect in sim/causeEffect.ts, fire & gas geometry in sim/fg.ts).
 *
 * It is a DYNAMIC model stepped on a simulated clock (1 s steps, `speed`× real time):
 *
 *   wells (choke, wing valve, ramp-up after a restart) → manifold → ESDV-1001 → HP separator
 *     liquid: level integrates inflow − outflow; outflow = level controller limited by running export /
 *             produced-water pumps and an open riser ESDV  → LAH 72 % · LAHH 83 % → PSD
 *     gas:    pressure holds the setpoint while compressor + flare control valve can take the gas;
 *             otherwise it climbs → PAH 38 · PAHH 40 → PSD · PSV-1101 lifts at 42 barg to flare
 *     compressor: surge margin from flow vs speed; anti-surge recycle opens below 10 %; a failed
 *             anti-surge valve surges and trips it. Cooling medium too hot (55 °C) trips it as well.
 *   power: turbines (rated MW) vs loads; overload sheds load in priority order; standby turbine
 *          auto-starts (3 min); no turbine = blackout → emergency generator + PSD
 *   utilities: instrument air decays without its compressor → PSD at 5.5 barg; seawater + cooling
 *          medium pumps hold the cooling-medium temperature; firewater ring and diesel fire pumps
 *   fire & gas: injected releases / fires → detector readings (fg.ts) → 1ooN / 2ooN voting per zone →
 *          ESD2 (confirmed gas) / ESD1 + deluge (confirmed fire) → blowdown to flare
 *   shutdowns latch; reset once the cause has cleared; restart re-opens valves, restarts machines and
 *   the wells ramp back over ~10 minutes. Machines start through timed sequences.
 *
 * KPIs follow NSTA practice: production efficiency = produced / maximum production potential (boe,
 * gas at 5 800 scf/boe) with the deferment booked to loss categories; availability = time up.
 */
import { create } from 'zustand'
import type { Equipment, Instrument, Plant } from '../model/types'
import { usePlantStore } from './plantStore'
import type {
  Alarm,
  AlarmPriority,
  Constraint,
  DetectorSim,
  Fault,
  HistoryPoint,
  Incident,
  Kpis,
  Knobs,
  LossCategory,
  PlantResult,
  PlatformId,
  PlatformResult,
  ProcessState,
  RunState,
  OperatorAction,
  Shutdown,
  ShutdownLevel,
  SimEvent,
  SimPlugin,
  SimState,
  ValveSim,
  ZoneStatus,
  Lockout,
} from '../sim/types'
import { fmtClock, SHUTDOWN_LABEL, SHUTDOWN_RANK } from '../sim/types'
import * as A from '../sim/alpha'
import { CE_BY_ID } from '../sim/causeEffect'
import { detectors as fgDetectors, fireZones, flameSees, gasReading, heatSmokeSees, platformAt, platformOfTag, zoneAt, zoneOfTag, type Detector, type FireZone, type GasCloud } from '../sim/fg'

export type { RunState, Knobs, PlantResult, SimEvent } from '../sim/types'

const chokeF = (c: number) => Math.pow(Math.max(0, Math.min(100, c)) / 100, 0.75)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const DESIGN_OIL = 49000
const DESIGN_GAS = 75

// ================================================================= plant context (cached per plant)
const MACHINE_KINDS = new Set(['pumpPackage', 'compressorPackage', 'gasTurbineGenerator', 'caissonPump', 'chemSkid', 'proxy'])
const ROTATING = new Set(['pumpPackage', 'compressorPackage', 'gasTurbineGenerator', 'caissonPump', 'chemSkid', 'module', 'transformer'])

interface Ctx {
  plant: Plant
  /** Alpha process present (V-1100) — otherwise a simple start / stop model */
  alpha: boolean
  eq: Map<string, Equipment>
  machines: string[]
  cls: Map<string, A.MachineClass>
  partner: Map<string, string>
  simValves: string[]
  valveType: Map<string, string>
  failAction: Map<string, string | undefined>
  /** sim valves on each line */
  lineValves: Map<string, string[]>
  /** spray (deluge) line → its deluge valve */
  sprayValve: Map<string, string>
  deluge: string[]
  wells: string[]
  gtgs: string[]
  _plat: Map<string, PlatformId>
  _zone: Map<string, string | null>
  _dets: Detector[] | null
}
let ctxCache: Ctx | null = null

function classOf(e: Equipment): A.MachineClass | null {
  if (e.kind === 'pumpPackage') return 'pump'
  if (e.kind === 'caissonPump') return 'caisson'
  if (e.kind === 'compressorPackage') return e.tag === A.TAGS.iaCompressor || /air/i.test(e.name) ? 'ia' : 'compressor'
  if (e.kind === 'gasTurbineGenerator') return 'gtg'
  if (e.kind === 'proxy') return e.role === 'drillingRig' ? 'rig' : null
  if (e.kind === 'chemSkid') return 'skid'
  return null
}

function getCtx(): Ctx {
  const plant = usePlantStore.getState().plant
  if (ctxCache && ctxCache.plant === plant) return ctxCache
  const eq = new Map(plant.equipment.map((e) => [e.tag, e]))
  const cls = new Map<string, A.MachineClass>()
  for (const e of plant.equipment) {
    const c = MACHINE_KINDS.has(e.kind) ? classOf(e) : null
    if (c) cls.set(e.tag, c)
  }
  const machines = [...cls.keys()]
  const partner = new Map<string, string>()
  for (const t of machines) {
    const m = /^(.*)([AB])$/.exec(t)
    if (!m) continue
    const o = m[1] + (m[2] === 'A' ? 'B' : 'A')
    if (cls.has(o)) partner.set(t, o)
  }
  const simValves: string[] = []
  const valveType = new Map<string, string>()
  const failAction = new Map<string, string | undefined>()
  const lineValves = new Map<string, string[]>()
  const deluge: string[] = []
  for (const v of plant.valves) {
    const notes = (v.design?.notes ?? '').toLowerCase()
    const actuated = v.actuator === 'pistonSpring' || v.actuator === 'electric' || v.actuator === 'diaphragm'
    const sim = v.type === 'esdv' || v.type === 'bdv' || (v.type === 'control' && /^(LV-1101|LV-1102|FV-2201)$/.test(v.tag)) || (actuated && v.type !== 'control' && v.type !== 'psv' && v.type !== 'check' && v.type !== 'needle')
    if (!sim) continue
    simValves.push(v.tag)
    valveType.set(v.tag, notes.includes('deluge') ? 'deluge' : v.type)
    failAction.set(v.tag, v.failAction)
    if (notes.includes('deluge')) deluge.push(v.tag)
    lineValves.set(v.line, [...(lineValves.get(v.line) ?? []), v.tag])
  }
  const sprayValve = new Map<string, string>()
  for (const l of plant.lines) {
    if (!l.sprayNozzles) continue
    const own = (lineValves.get(l.tag) ?? []).find((t) => deluge.includes(t))
    const parent = 'line' in l.from ? (lineValves.get(l.from.line) ?? []).find((t) => deluge.includes(t)) : undefined
    const v = own ?? parent
    if (v) sprayValve.set(l.tag, v)
  }
  const wells = plant.equipment.filter((e) => e.kind === 'xmasTree' && e.wellType !== 'waterInjector').map((e) => e.tag)
  const gtgs = plant.equipment.filter((e) => e.kind === 'gasTurbineGenerator').map((e) => e.tag)
  // an imported plant can reuse Alpha's tags: it still isn't the Alpha field, and gets no simulated readings
  ctxCache = { plant, alpha: eq.has(A.TAGS.sep) && !plant.custom, eq, machines, cls, partner, simValves, valveType, failAction, lineValves, sprayValve, deluge, wells, gtgs, _plat: new Map(), _zone: new Map(), _dets: null }
  return ctxCache
}
function platOf(c: Ctx, tag: string): PlatformId {
  if (!c.alpha) return 'Plant'
  let p = c._plat.get(tag)
  if (!p) c._plat.set(tag, (p = A.WELLS[tag]?.platform ?? platformOfTag(c.plant, tag)))
  return p
}
function zoneOf(c: Ctx, tag: string): string | null {
  if (!c._zone.has(tag)) c._zone.set(tag, zoneOfTag(c.plant, tag)?.id ?? null)
  return c._zone.get(tag)!
}
const zoneCache = new WeakMap<Plant, FireZone[]>()
function zonesOf(c: Ctx): FireZone[] {
  let z = zoneCache.get(c.plant)
  if (!z) zoneCache.set(c.plant, (z = fireZones(c.plant)))
  return z
}
function dets(c: Ctx): Detector[] {
  if (!c._dets) {
    try {
      c._dets = fgDetectors(c.plant)
    } catch {
      c._dets = []
    }
  }
  return c._dets
}

/** default run state: spares (…B with a …A sibling) and firewater pumps stand by, the rest runs */
export function defaultState(plant: Plant, e: Equipment): RunState {
  if (A.ALWAYS_RUN.includes(e.tag)) return 'running'
  if (e.system === 'safety' && e.kind === 'caissonPump') return 'standby'
  const machine = e.kind === 'pumpPackage' || e.kind === 'compressorPackage' || e.kind === 'gasTurbineGenerator' || e.kind === 'caissonPump'
  if (machine && /B$/.test(e.tag) && plant.equipment.some((x) => x.tag === e.tag.replace(/B$/, 'A'))) return 'standby'
  return 'running'
}

// ================================================================= engine-internal state
let rngState = 42
/** seeded random number generator shared by the simulation and its plugins (reset with the session) */
export function simRandom() {
  rngState |= 0
  rngState = (rngState + 0x6d2b79f5) | 0
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
/** well ramp 0..1 (wells come back slowly after a shut-in) */
let ramp: Record<string, number> = {}
/** running hours per machine (folded into `machines` each tick) */
let runHours: Record<string, number> = {}
/** per-hour ring for PE over the last hour: [t, produced boe, potential boe] */
let hourRing: [number, number, number][] = []
let acc = { prod: 0, pot: 0, up: 0, total: 0 }
let losses: Record<LossCategory, number> = zeroLosses()
let alarmSeq = 0
let sdSeq = 0
let incSeq = 0
let eventSeq = 0
let surgeTimer = 0
let mainPowered = true
let lastLoss: LossCategory = 'controlSafety'
let psvLifting = false
let onDiesel = false
let shedNow = false
/** instrument histories recorded every tick */
const instHist = new Map<string, number[]>()
const HIST_N = 240

function zeroLosses(): Record<LossCategory, number> {
  return { wells: 0, reservoir: 0, oil: 0, gas: 0, power: 0, utilities: 0, controlSafety: 0, export: 0, planned: 0 }
}

const KNOBS0: Knobs = {
  chokes: {},
  wellOnline: {},
  hpPressure: A.HP.setpoint,
  compressorSpeed: 92,
  drilling: true,
  autoChangeover: true,
  reliability: 'off',
  wind: { from: 240, speed: 7 },
  seaState: 1.5,
}
const PROC0: ProcessState = {
  hpLevel: A.HP.nll,
  hpPressure: A.HP.setpoint,
  lpLevel: 50,
  iaPressure: 8.6,
  cmTemp: 32,
  surgeMargin: 45,
  recycle: 0,
  fuelGasPressure: 18.2,
  blowdownInventory: A.HP.inventory,
  relief: 0,
  busHz: 50,
  emergencyGen: 'standby',
  fwPressure: 12,
  reservoir: 1,
  wiRate: 0,
  vent: 0.05,
}
const KPI0: Kpis = { pe: 100, peHour: 100, availability: 100, losses: zeroLosses(), producedBoe: 0, potentialBoe: 0, alarmRate: 0, trips: 0, shutdowns: 0 }

function initialValves(c: Ctx): Record<string, ValveSim> {
  const out: Record<string, ValveSim> = {}
  for (const tag of c.simValves) {
    const v = c.plant.valves.find((x) => x.tag === tag)!
    const l = c.plant.lines.find((x) => x.tag === v.line)
    const nps = l?.nps ?? 4
    const type = c.valveType.get(tag)
    const stroke = tag === A.TAGS.antiSurge ? 2 : type === 'esdv' ? Math.max(4, nps * 1.5) : type === 'bdv' ? 8 : type === 'deluge' ? 6 : type === 'control' ? 6 : 10
    const open = v.normally !== 'closed'
    out[tag] = { pos: open ? 1 : 0, cmd: open ? 'open' : 'closed', stroke }
  }
  return out
}

// ================================================================= store
type Draft = Pick<SimState, 't' | 'status' | 'machines' | 'valves' | 'process' | 'shutdowns' | 'incidents' | 'knobs' | 'inhibits' | 'fg' | 'detectors' | 'kpis'> & { events: SimEvent[]; newAlarms: { key: string; text: string; priority: AlarmPriority; kind: Alarm['kind']; platform: PlatformId; tag: string; zone?: string }[] }

let draft: Draft | null = null
/** mutate state inside or outside a tick */
function withDraft(fn: (d: Draft) => void) {
  if (draft) return fn(draft)
  const s = useSim.getState()
  const d: Draft = {
    t: s.t,
    status: { ...s.status },
    machines: { ...s.machines },
    valves: { ...s.valves },
    process: { ...s.process },
    shutdowns: [...s.shutdowns],
    incidents: [...s.incidents],
    knobs: s.knobs,
    inhibits: s.inhibits,
    fg: s.fg,
    detectors: s.detectors,
    kpis: { ...s.kpis },
    events: [],
    newAlarms: [],
  }
  draft = d
  try {
    fn(d)
  } finally {
    draft = null
  }
  commit(d)
}
function commit(d: Draft) {
  useSim.setState((s) => ({
    status: d.status,
    machines: d.machines,
    valves: d.valves,
    process: d.process,
    shutdowns: d.shutdowns,
    incidents: d.incidents,
    kpis: d.kpis,
    events: d.events.length ? [...d.events.reverse(), ...s.events].slice(0, 250) : s.events,
  }))
  for (const a of d.newAlarms) pushedAlarms.push(a)
}
/** one-shot (event) alarms raised by actions, folded into the alarm list at the next tick */
const pushedAlarms: Draft['newAlarms'] = []

function log(d: Draft, text: string, level: SimEvent['level']) {
  d.events.push({ id: ++eventSeq, t: d.t, text, level })
}

// ---------------------------------------------------------------- audit trail, lock-outs, plugins
let actionSeq = 0
/** who is acting right now (actions called from inside a plugin / scenario / automation set this) */
let actor: OperatorAction['who'] = 'operator'
/** run `fn` with actions attributed to `who` (e.g. a scenario script, the instructor) */
export function actAs<T>(who: OperatorAction['who'], fn: () => T): T {
  const prev = actor
  actor = who
  try {
    return fn()
  } finally {
    actor = prev
  }
}
function recordAction(a: Omit<OperatorAction, 'id' | 't'>) {
  useSim.setState((s) => {
    const last = s.actions[0]
    // a slider drag is one action, not fifty
    if (last && last.action === a.action && last.tag === a.tag && a.action.startsWith('set') && s.t - last.t < 5) return { actions: [{ ...last, detail: a.detail, t: s.t }, ...s.actions.slice(1)] }
    return { actions: [{ ...a, id: ++actionSeq, t: s.t }, ...s.actions].slice(0, 500) }
  })
}
function lockSet(tag: string, l: Lockout) {
  useSim.setState((s) => ({ lockouts: { ...s.lockouts, [tag]: l } }))
}
function lockOf(tag: string): Lockout | undefined {
  return (useSim.getState() as SimState).lockouts[tag]
}

const plugins = new Map<string, SimPlugin>()
/** register something that steps with the simulation (idempotent by id — HMR re-registers) */
export function registerSimPlugin(p: SimPlugin) {
  plugins.set(p.id, p)
}

export const useSim = create<SimState>((set, get) => ({
  t: 0,
  speed: 1,
  knobs: KNOBS0,
  status: {},
  machines: {},
  valves: {},
  process: PROC0,
  doors: {},
  result: null,
  lineFlow: {},
  history: [],
  availability: 100,
  kpis: KPI0,
  events: [],
  alarms: [],
  shutdowns: [],
  fg: {},
  detectors: {},
  inhibits: {},
  incidents: [],
  actions: [],
  lockouts: {},

  setSpeed: (speed) => set({ speed: clamp(speed, 0, 120) }),
  setChoke: (tag, v) => set((s) => ({ knobs: { ...s.knobs, chokes: { ...s.knobs.chokes, [tag]: v } } })),
  setWell: (tag, on) => {
    set((s) => ({ knobs: { ...s.knobs, wellOnline: { ...s.knobs.wellOnline, [tag]: on } } }))
    withDraft((d) => log(d, `${tag} ${on ? 'opened up' : 'shut in by the operator'}`, 'info'))
  },
  setKnob: (k, v) => set((s) => ({ knobs: { ...s.knobs, [k]: v } })),
  lockOut: (tag, by, opts) => {
    let why: string | null = null
    withDraft((d) => {
      const c = getCtx()
      const cur: Lockout | undefined = lockOf(tag)
      if (cur && cur.by !== by) {
        why = `${tag} is already locked out by ${cur.by}`
        return
      }
      const isValve = !!d.valves[tag]
      if (!isValve && !c.cls.has(tag) && !c.eq.has(tag)) {
        why = `${tag}: nothing to lock out`
        return
      }
      if (isValve) {
        const position = opts?.position ?? 'closed'
        d.valves = { ...d.valves, [tag]: { ...d.valves[tag], cmd: position, by } }
        lockSet(tag, { by, planned: !!opts?.planned, at: d.t, position })
      } else {
        const st = stateOf(d, tag)
        if (st === 'running' || st === 'starting') d.status = { ...d.status, [tag]: 'stopped' }
        lockSet(tag, { by, planned: !!opts?.planned, at: d.t })
      }
      log(d, `${tag} LOCKED OUT under ${by}${opts?.planned ? ' (planned work)' : ''}`, 'warn')
    })
    return why
  },
  release: (tag, by): string | null => {
    const cur: Lockout | undefined = lockOf(tag)
    if (!cur) return `${tag} is not locked out`
    if (cur.by !== by) return `${tag} is held by ${cur.by}, not ${by}`
    useSim.setState((s) => {
      const l = { ...s.lockouts }
      delete l[tag]
      return { lockouts: l }
    })
    withDraft((d) => {
      const v = d.valves[tag]
      if (v && v.by === by) d.valves = { ...d.valves, [tag]: { ...v, by: undefined } }
      // a duty / standby machine goes back on standby, so auto-changeover can use it again
      const c = getCtx()
      if (c.partner.has(tag) && stateOf(d, tag) === 'stopped') d.status = { ...d.status, [tag]: 'standby' }
      log(d, `${tag} lock-out released (${by})`, 'info')
    })
    return null
  },
  record: (a) => recordAction(a),

  start: (tag) => {
    let why: string | null = null
    withDraft((d) => (why = startMachine(d, tag)))
    return why
  },
  stop: (tag) => {
    let why: string | null = null
    withDraft((d) => {
      const st = stateOf(d, tag)
      if (st !== 'running' && st !== 'starting') {
        why = `${tag} is not running`
        return
      }
      d.status = { ...d.status, [tag]: 'stopped' }
      log(d, `${tag} stopped by the operator`, 'info')
    })
    return why
  },
  trip: (tag, why, opts) => withDraft((d) => tripMachine(d, tag, why ?? 'manual trip', opts)),
  resetTrip: (tag, opts) => {
    let why: string | null = null
    withDraft((d) => {
      const m = d.machines[tag]
      if (stateOf(d, tag) !== 'tripped') return
      if (m?.repairUntil && m.repairUntil > d.t) {
        why = `${tag} is under repair until ${fmtClock(m.repairUntil)} (${m.tripCause})`
        return
      }
      if (m?.localReset && !opts?.local) {
        why = `Local reset required: a field operator must reset ${tag} at the machine (${m.tripCause})`
        return
      }
      const c = getCtx()
      d.status = { ...d.status, [tag]: c.partner.has(tag) ? 'standby' : 'stopped' }
      d.machines = { ...d.machines, [tag]: { runHours: m?.runHours ?? 0 } }
      log(d, `${tag} trip reset${opts?.local ? ' locally' : ''}: ready to start`, 'info')
    })
    return why
  },
  setStatus: (tag, s) => {
    const g = get()
    if (s === 'running') g.start(tag)
    else if (s === 'tripped') g.trip(tag, 'manual trip')
    else if (runState(tag) === 'tripped') g.resetTrip(tag)
    else g.stop(tag)
  },

  setValve: (tag, cmd, by) => {
    let why: string | null = null
    withDraft((d) => {
      const v = d.valves[tag]
      if (!v) {
        why = `${tag} is not an actuated valve`
        return
      }
      if (v.fault === 'stuck') {
        why = `${tag} does not move: valve stuck (raise a work order)`
        return
      }
      const lk = lockOf(tag)
      if (lk && cmd !== lk.position) {
        why = `${tag} is locked ${lk.position ?? 'closed'} under ${lk.by}`
        return
      }
      if (cmd === 'open' && v.by && d.shutdowns.some((s) => s.id === v.by && !s.resetAt)) {
        why = `${tag} is held closed by ${v.by}: reset the shutdown first`
        return
      }
      d.valves = { ...d.valves, [tag]: { ...v, cmd, by: by ?? 'operator' } }
      log(d, `${tag} commanded ${cmd} (${by ?? 'operator'})`, 'info')
    })
    return why
  },

  ackAlarm: (id) => set((s) => ({ alarms: s.alarms.flatMap((a) => (a.id !== id ? [a] : a.state === 'unack' ? [{ ...a, state: 'ack' as const, ackAt: s.t }] : a.state === 'rtnUnack' ? [] : [a])) })),
  ackAll: () => set((s) => ({ alarms: s.alarms.flatMap((a) => (a.state === 'unack' ? [{ ...a, state: 'ack' as const, ackAt: s.t }] : a.state === 'rtnUnack' ? [] : [a])) })),
  shelve: (id, minutes) => set((s) => ({ alarms: s.alarms.map((a) => (a.id === id ? { ...a, state: 'shelved' as const, shelvedUntil: s.t + minutes * 60 } : a)) })),
  unshelve: (id) => set((s) => ({ alarms: s.alarms.map((a) => (a.id === id && a.state === 'shelved' ? { ...a, state: a.active ? ('unack' as const) : ('rtnUnack' as const), shelvedUntil: undefined } : a)) })),

  initiate: (level, platform, zone, cause) =>
    withDraft((d) => {
      if (level === 'APS') return initiate(d, 'APS', 'Alpha', undefined, 'aps', cause ?? 'Manual APS push-button (CCR)')
      initiate(d, level, platform, zone, 'manual', cause ?? `Manual ${level} push-button (CCR)${zone ? `: zone ${zone}` : ''}`)
    }),
  resetShutdown: (id) => {
    let why: string | null = null
    withDraft((d) => {
      const s = d.shutdowns.find((x) => x.id === id)
      if (!s || s.resetAt) return
      const reason = stillActive(d, s)
      if (reason) {
        why = `Cannot reset ${s.level} (${s.cause}): ${reason}`
        return
      }
      d.shutdowns = d.shutdowns.map((x) => (x.id === id ? { ...x, resetAt: d.t, resettable: true } : x))
      log(d, `${s.level} ${s.platform}${s.zone ? ` (${s.zone})` : ''} reset by the operator`, 'info')
    })
    return why
  },
  restart: (platform) => {
    let why: string | null = null
    withDraft((d) => (why = restartPlatform(d, platform)))
    return why
  },

  inhibit: (tag, on) => {
    set((s) => ({ inhibits: { ...s.inhibits, [tag]: on } }))
    withDraft((d) => log(d, `${tag} ${on ? 'INHIBITED (override): excluded from voting' : 'inhibit removed'}`, on ? 'warn' : 'info'))
  },

  inject: (f) => {
    let id = ''
    withDraft((d) => (id = injectFault(d, f)))
    return id
  },
  clearIncident: (id) =>
    withDraft((d) => {
      const inc = d.incidents.find((x) => x.id === id)
      if (!inc) return
      d.incidents = d.incidents.filter((x) => x.id !== id)
      if (inc.fault.kind === 'valveStuck' || inc.fault.kind === 'levelControlFail') {
        const tag = inc.fault.tag
        const v = d.valves[tag]
        if (v) d.valves = { ...d.valves, [tag]: { ...v, fault: undefined, cmd: inc.fault.kind === 'levelControlFail' ? 'open' : v.cmd } }
      }
      log(d, `Instructor cleared: ${describeFault(inc.fault)}`, 'info')
    }),

  reset: () => {
    const c = getCtx()
    rngState = 42
    ramp = {}
    runHours = {}
    hourRing = []
    acc = { prod: 0, pot: 0, up: 0, total: 0 }
    losses = zeroLosses()
    surgeTimer = 0
    blockedTimer = 0
    wiBlockedTimer = 0
    rpInventory = 0.05
    mainPowered = true
    psvLifting = false
    onDiesel = false
    instHist.clear()
    pushedAlarms.length = 0
    set({
      t: 0,
      knobs: KNOBS0,
      status: {},
      machines: {},
      valves: initialValves(c),
      process: PROC0,
      result: null,
      history: [],
      availability: 100,
      kpis: KPI0,
      events: [],
      alarms: [],
      shutdowns: [],
      fg: {},
      detectors: {},
      inhibits: {},
      incidents: [],
      actions: [],
      lockouts: {},
    })
    for (const p of plugins.values()) p.reset?.()
    withDraft((d) => log(d, 'Simulation reset: new session, plant in normal operation', 'info'))
  },
  setDoor: (key, open) => get().doors[key] !== open && set((s) => ({ doors: { ...s.doors, [key]: open } })),
  toggleDoor: (key) => set((s) => ({ doors: { ...s.doors, [key]: !s.doors[key] } })),

  tick: (dtWall = 1) => tick(dtWall),
}))

// every operator-facing action goes into the audit trail (refusals too — scoring and handover read them)
{
  const g = useSim.getState()
  const res = (r: unknown) => (typeof r === 'string' && r ? `refused: ${r}` : undefined)
  const rec = (action: string, tag?: string, detail?: string, who = actor) => recordAction({ who, action, tag, detail })
  useSim.setState({
    setChoke: (tag, v) => (g.setChoke(tag, v), rec('setChoke', tag, `${v} %`)),
    setWell: (tag, on) => (g.setWell(tag, on), rec('setWell', tag, on ? 'open' : 'shut in')),
    setKnob: (k, v) => (g.setKnob(k, v), rec('setKnob', String(k), JSON.stringify(v))),
    start: (tag) => {
      const r = g.start(tag)
      rec('start', tag, res(r))
      return r
    },
    stop: (tag) => {
      const r = g.stop(tag)
      rec('stop', tag, res(r))
      return r
    },
    trip: (tag, why, opts) => (g.trip(tag, why, opts), rec('trip', tag, why)),
    resetTrip: (tag, opts) => {
      const r = g.resetTrip(tag, opts)
      rec(opts?.local ? 'localReset' : 'resetTrip', tag, res(r), opts?.local ? 'field' : actor)
      return r
    },
    setValve: (tag, cmd, by) => {
      const r = g.setValve(tag, cmd, by)
      rec('setValve', tag, res(r) ?? cmd)
      return r
    },
    ackAlarm: (id) => (g.ackAlarm(id), rec('ack', useSim.getState().alarms.find((a) => a.id === id)?.tag, id)),
    ackAll: () => (g.ackAll(), rec('ackAll')),
    shelve: (id, m) => (g.shelve(id, m), rec('shelve', useSim.getState().alarms.find((a) => a.id === id)?.tag, `${m} min`)),
    unshelve: (id) => (g.unshelve(id), rec('unshelve', useSim.getState().alarms.find((a) => a.id === id)?.tag)),
    initiate: (level, platform, zone, cause) => (g.initiate(level, platform, zone, cause), rec('initiate', platform, `${level}${zone ? ` ${zone}` : ''}`)),
    resetShutdown: (id) => {
      const r = g.resetShutdown(id)
      rec('resetShutdown', id, res(r))
      return r
    },
    restart: (p) => {
      const r = g.restart(p)
      rec('restart', p, res(r))
      return r
    },
    inhibit: (tag, on) => (g.inhibit(tag, on), rec('inhibit', tag, on ? 'on' : 'off')),
    inject: (f) => {
      const id = actAs('instructor', () => g.inject(f))
      rec('inject', 'tag' in f ? f.tag : undefined, describeFault(f), actor === 'operator' ? 'instructor' : actor)
      return id
    },
    lockOut: (tag, by, o) => {
      const r = g.lockOut(tag, by, o)
      rec('lockOut', tag, res(r) ?? by)
      return r
    },
    release: (tag, by) => {
      const r = g.release(tag, by)
      rec('release', tag, res(r) ?? by)
      return r
    },
  })
}

// re-initialise when another plant is loaded
let lastPlant: Plant | null = null
usePlantStore.subscribe((s) => {
  if (s.plant !== lastPlant) {
    lastPlant = s.plant
    useSim.getState().reset()
  }
})

// ================================================================= run-state helpers
function stateOf(d: Pick<Draft, 'status'>, tag: string): RunState {
  const s = d.status[tag]
  if (s) return s
  const c = getCtx()
  const e = c.eq.get(tag)
  if (!e) return 'stopped'
  if (!ROTATING.has(e.kind) && e.kind !== 'proxy') return 'running'
  return defaultState(c.plant, e)
}
/** Current run state of an equipment tag (non-reactive getter for animation / values). */
export function runState(tag: string): RunState {
  return stateOf(useSim.getState(), tag)
}
function essential(c: Ctx, tag: string) {
  const e = c.eq.get(tag)
  if (!e) return false
  if (e.kind === 'gasTurbineGenerator') return true
  if (e.kind === 'caissonPump' && (e.system === 'safety' || e.driver === 'diesel')) return true
  return /^B-93/.test(tag) || platOf(c, tag) === 'LQ'
}
export const isRunning = (tag: string) => {
  if (runState(tag) !== 'running') return false
  if (mainPowered) return true
  return essential(getCtx(), tag)
}
const running = (d: Pick<Draft, 'status'>, c: Ctx, tag: string) => c.eq.has(tag) && stateOf(d, tag) === 'running' && (mainPowered || essential(c, tag))
const nRunning = (d: Pick<Draft, 'status'>, c: Ctx, tags: string[]) => tags.filter((t) => running(d, c, t)).length
const vpos = (d: Pick<Draft, 'valves'>, tag: string) => d.valves[tag]?.pos ?? 1
const hasFault = (d: Pick<Draft, 'incidents'>, kind: Fault['kind']) => d.incidents.some((i) => i.fault.kind === kind)

function startMachine(d: Draft, tag: string, auto = false): string | null {
  const c = getCtx()
  const cl = c.cls.get(tag)
  if (!cl) return `${tag} is not a machine`
  const st = stateOf(d, tag)
  if (st === 'running' || st === 'starting') return null
  if (st === 'tripped') return `${tag} is tripped: reset it first (${d.machines[tag]?.tripCause ?? ''})`
  const lk = lockOf(tag)
  if (lk) return `${tag} is locked out under ${lk.by}: sign the permit off first`
  if (!mainPowered && !essential(c, tag)) return `No main power: start a turbine generator before ${tag}`
  const p = platOf(c, tag)
  const blocking = d.shutdowns.find((s) => !s.resetAt && (s.platform === p || s.level === 'APS') && blockedBy(s, tag))
  if (blocking) return `${tag} is interlocked by the latched ${blocking.level} on ${blocking.platform}: reset the shutdown first`
  if (tag === A.TAGS.compressor && c.alpha && vpos(d, A.TAGS.gasOut) < 0.5) return `${tag}: suction ESDV-2101 is closed`
  const dur = A.CLASS_DATA[cl].start
  d.status = { ...d.status, [tag]: 'starting' }
  d.machines = { ...d.machines, [tag]: { ...(d.machines[tag] ?? { runHours: 0 }), startDoneAt: d.t + dur, autoStarted: auto, tripCause: undefined, byShutdown: undefined } }
  log(d, `${tag} ${auto ? 'AUTO-START' : 'start'} sequence (${dur >= 60 ? `${Math.round(dur / 60)} min` : `${dur} s`})`, auto ? 'warn' : 'info')
  if (auto) queueMicrotask(() => recordAction({ who: 'auto', action: 'autoStart', tag }))
  if (auto) d.newAlarms.push({ key: `AUTO:${tag}:${d.t}`, tag, text: `${tag} auto-started (standby took over)`, priority: 3, kind: 'equipment', platform: p })
  return null
}
function blockedBy(s: Shutdown, tag: string) {
  const lists = [A.PSD_STOPS[s.platform] ?? []]
  if (SHUTDOWN_RANK[s.level] >= SHUTDOWN_RANK.ESD1) lists.push(A.ESD1_STOPS[s.platform] ?? [])
  if (s.level === 'APS') return true
  return lists.some((l) => l.includes(tag))
}

function tripMachine(d: Draft, tag: string, why: string, opts?: { local?: boolean; repairH?: number }) {
  const c = getCtx()
  if (!c.eq.has(tag)) return
  const st = stateOf(d, tag)
  if (st === 'tripped') return
  const wasOn = st === 'running' || st === 'starting'
  d.status = { ...d.status, [tag]: 'tripped' }
  const m = d.machines[tag] ?? { runHours: 0 }
  d.machines = { ...d.machines, [tag]: { ...m, tripCause: why, localReset: !!opts?.local, repairUntil: opts?.repairH ? d.t + opts.repairH * 3600 : undefined, startDoneAt: undefined } }
  d.kpis = { ...d.kpis, trips: d.kpis.trips + 1 }
  log(d, `${tag} TRIPPED: ${why}${opts?.local ? ' · local reset required' : ''}${opts?.repairH ? ` · repair ~${opts.repairH.toFixed(1)} h` : ''}`, 'trip')
  // duty / standby: the standby takes over
  const o = c.partner.get(tag)
  if (wasOn && o && d.knobs.autoChangeover && stateOf(d, o) === 'standby') startMachine(d, o, true)
}

// ================================================================= shutdowns
function initiate(d: Draft, level: ShutdownLevel, platform: PlatformId, zone: string | undefined, causeId: string, cause: string) {
  const c = getCtx()
  if (!c.alpha && level !== 'USD') platform = 'Plant'
  const open = d.shutdowns.filter((s) => !s.resetAt)
  // already covered by an equal or higher latched shutdown on the platform (same zone for ESD2)?
  if (open.some((s) => s.causeId === causeId && s.platform === platform && s.zone === zone)) return
  if (open.some((s) => (s.platform === platform || s.level === 'APS') && SHUTDOWN_RANK[s.level] > SHUTDOWN_RANK[level])) return
  const ce = CE_BY_ID[causeId]
  const sd: Shutdown = { id: `${level}-${platform}-${++sdSeq}`, level, platform, zone, cause, causeId, loss: ce?.loss ?? 'controlSafety', at: d.t, resettable: false }
  d.shutdowns = [...d.shutdowns, sd]
  d.kpis = { ...d.kpis, shutdowns: d.kpis.shutdowns + 1 }
  if (!['upstream-psd', 'injector-shut'].includes(causeId)) lastLoss = sd.loss
  log(d, `${level} ${platform}${zone ? ` zone ${zone}` : ''}: ${SHUTDOWN_LABEL[level]}: ${cause}`, 'trip')

  const close = (tag: string) => {
    const v = d.valves[tag]
    if (!v || v.fault === 'stuck' || lockOf(tag)) return
    if (v.cmd !== 'closed' || !v.by) d.valves = { ...d.valves, [tag]: { ...v, cmd: 'closed', by: sd.id } }
  }
  const openV = (tag: string) => {
    const v = d.valves[tag]
    if (v && v.fault !== 'stuck') d.valves = { ...d.valves, [tag]: { ...v, cmd: 'open', by: sd.id } }
  }
  const stopM = (tag: string) => {
    const st = stateOf(d, tag)
    if (st !== 'running' && st !== 'starting') return
    d.status = { ...d.status, [tag]: 'stopped' }
    d.machines = { ...d.machines, [tag]: { ...(d.machines[tag] ?? { runHours: 0 }), byShutdown: sd.id, startDoneAt: undefined } }
  }
  const platforms: PlatformId[] = level === 'APS' ? ['Alpha', 'WHP-N', 'LQ'] : [platform]
  for (const p of platforms) {
    if (SHUTDOWN_RANK[level] >= SHUTDOWN_RANK.PSD) {
      for (const v of A.PSD_VALVES[p] ?? []) close(v)
      for (const m of A.PSD_STOPS[p] ?? []) stopM(m)
    }
    if (level === 'ESD2' && zone) {
      for (const v of c.simValves) if (zoneOf(c, v) === zone && c.valveType.get(v) === 'esdv') close(v)
      for (const m of c.machines) if (zoneOf(c, m) === zone && (c.cls.get(m) === 'rig' || c.cls.get(m) === 'skid')) stopM(m)
      for (const v of c.simValves) if (c.valveType.get(v) === 'bdv' && (zoneOf(c, v) === zone || (zoneHasProcess(c, zone) && A.TAGS.bdv.includes(v)))) openV(v)
    }
    if (SHUTDOWN_RANK[level] >= SHUTDOWN_RANK.ESD1) {
      for (const v of c.simValves) if (platOf(c, v) === p && (c.valveType.get(v) === 'esdv' || /^XV-/.test(v)) && !c.deluge.includes(v)) close(v)
      for (const v of c.simValves) if (c.valveType.get(v) === 'bdv' && platOf(c, v) === p) openV(v)
      for (const m of A.ESD1_STOPS[p] ?? []) stopM(m)
    }
    if (level === 'APS') for (const g of c.gtgs) stopM(g)
  }
  // Alpha down → WHP-N wells have nowhere to go
  if (c.alpha && platform === 'Alpha' && SHUTDOWN_RANK[level] >= SHUTDOWN_RANK.PSD && level !== 'APS') initiate(d, 'PSD', 'WHP-N', undefined, 'upstream-psd', `Upstream ${level} on Alpha`)
  // WHP-N down → its water injector is shut in → WI stops cleanly
  if (c.alpha && platform === 'WHP-N' && SHUTDOWN_RANK[level] >= SHUTDOWN_RANK.PSD && level !== 'APS' && A.TAGS.wi.injPumps.some((t) => c.eq.has(t))) initiate(d, 'PSD', 'WI', undefined, 'injector-shut', `Injector shut in by ${level} on WHP-N`)
}
function zoneHasProcess(c: Ctx, zone: string) {
  return [A.TAGS.sep, A.TAGS.lp, A.TAGS.compressor, 'V-2100', 'V-1200'].some((t) => c.eq.has(t) && zoneOf(c, t) === zone)
}

/** why a shutdown cannot be reset yet (null = cause cleared) */
function stillActive(d: Draft, s: Shutdown): string | null {
  const p = d.process
  switch (s.causeId) {
    case 'lahh-1101':
      return p.hpLevel >= A.HP.lah ? `HP separator level ${p.hpLevel.toFixed(0)} % is above LAH ${A.HP.lah} %: drain it down first` : null
    case 'pahh-1101':
      return p.hpPressure >= A.HP.pah ? `HP separator pressure ${p.hpPressure.toFixed(1)} barg is above PAH ${A.HP.pah}` : null
    case 'ia-ll':
      return p.iaPressure < 6.5 ? `instrument air ${p.iaPressure.toFixed(1)} barg: restore K-4600 (above 6.5 barg)` : null
    case 'blackout':
      return mainPowered ? null : 'no turbine generator on the bus'
    case 'upstream-psd': {
      const up = d.shutdowns.find((x) => x.platform === 'Alpha' && !x.resetAt)
      return up ? `Alpha still has a latched ${up.level}` : null
    }
    case 'injector-shut': {
      const up = d.shutdowns.find((x) => x.platform === 'WHP-N' && !x.resetAt)
      return up ? `WHP-N still has a latched ${up.level}` : null
    }
    case 'gas-confirmed': {
      const z = s.zone ? d.fg[s.zone] : undefined
      return z && z.gas !== 'normal' ? `gas still detected in ${s.zone} (${z.gas})` : null
    }
    case 'fire-confirmed': {
      const burning = d.incidents.find((i) => i.fault.kind === 'fire' && i.burning && i.platform === s.platform)
      if (burning) return `fire still burning (${(burning.rate ?? 0).toFixed(1)} MW)`
      const z = s.zone ? d.fg[s.zone] : undefined
      return z && (z.fire !== 'normal' || z.smoke !== 'normal') ? `flame / smoke detectors in ${s.zone} still in alarm` : null
    }
  }
  return null
}

function restartPlatform(d: Draft, platform: PlatformId): string | null {
  const c = getCtx()
  const mine = d.shutdowns.filter((s) => s.platform === platform || s.level === 'APS')
  if (!mine.length) return `${platform} is not shut down: nothing to restart`
  const unreset = mine.find((s) => !s.resetAt)
  if (unreset) return `Reset the ${unreset.level} (${unreset.cause}) before restarting ${platform}`
  if (platform === 'WHP-N' && d.shutdowns.some((s) => s.platform === 'Alpha')) return 'Restart Alpha first: WHP-N produces into Alpha'
  if (platform === 'WI' && d.shutdowns.some((s) => s.platform === 'WHP-N')) return 'Restart WHP-N first: WI injects into its water injector'
  const ids = new Set(mine.map((s) => s.id))
  if (!mainPowered && c.gtgs.length && !c.gtgs.some((g) => ids.has(d.machines[g]?.byShutdown ?? ''))) return 'No main power: reset and start a turbine generator first'
  // valves back to their normal position
  const vs = { ...d.valves }
  for (const [tag, v] of Object.entries(vs)) {
    if (!v.by || !(ids.has(v.by) || v.by === 'F&G') || lockOf(tag)) continue
    const normal = c.plant.valves.find((x) => x.tag === tag)?.normally !== 'closed'
    vs[tag] = { ...v, cmd: normal ? 'open' : 'closed', by: undefined }
  }
  d.valves = vs
  d.shutdowns = d.shutdowns.filter((s) => !ids.has(s.id))
  log(d, `${platform} RESTART: ESD valves opening, wells ramping back over ~10 min`, 'info')
  // machines the shutdown stopped come back through their start sequences
  const rank = (m: string) => (c.cls.get(m) === 'gtg' ? 0 : c.cls.get(m) === 'compressor' ? 2 : 1)
  const order = [...c.machines].sort((a, b) => rank(a) - rank(b))
  for (const m of order) {
    if (!d.machines[m]?.byShutdown || !ids.has(d.machines[m].byShutdown!)) continue
    const why = startMachine(d, m)
    if (why) log(d, `Restart: ${why}`, 'warn')
  }
  // a platform back → the platforms it shut down only by knock-on (Alpha → WHP-N → WI) come back with it
  const chain: [PlatformId, PlatformId, string][] = [
    ['Alpha', 'WHP-N', 'upstream-psd'],
    ['WHP-N', 'WI', 'injector-shut'],
  ]
  for (const [from, to, cause] of chain) {
    if (platform !== from) continue
    const theirs = d.shutdowns.filter((s) => s.platform === to)
    if (theirs.length && theirs.every((s) => s.causeId === cause)) {
      d.shutdowns = d.shutdowns.map((s) => (s.platform === to ? { ...s, resetAt: s.resetAt ?? d.t } : s))
      restartPlatform(d, to)
    }
  }
  return null
}

function platformDown(d: Pick<Draft, 'shutdowns'>, p: PlatformId) {
  return d.shutdowns.some((s) => (s.platform === p || s.level === 'APS') && SHUTDOWN_RANK[s.level] >= SHUTDOWN_RANK.PSD)
}

// ================================================================= faults
function describeFault(f: Fault) {
  switch (f.kind) {
    case 'gasRelease':
      return `gas release ${f.rateKgS} kg/s${f.label ? `: ${f.label}` : ''}`
    case 'fire':
      return `fire ${f.sizeMW} MW${f.label ? `: ${f.label}` : ''}`
    case 'trip':
      return `${f.tag} trip (${f.cause})`
    case 'valveStuck':
      return `${f.tag} stuck`
    case 'levelControlFail':
      return `${f.tag} level control failed closed`
    case 'antiSurgeFail':
      return 'anti-surge valve FV-2201 failed'
    case 'instrumentAirFail':
      return 'instrument air package failure'
    case 'coolingFail':
      return 'cooling medium circulation lost'
    case 'exportBlocked':
      return 'export blocked downstream'
    case 'detectorFault':
      return `${f.tag} detector fault`
  }
}
function injectFault(d: Draft, f: Fault): string {
  const c = getCtx()
  const id = `INC-${++incSeq}`
  const inc: Incident = { id, fault: f, at: d.t }
  if (f.kind === 'gasRelease' || f.kind === 'fire') {
    inc.pos = f.at
    inc.rate = f.kind === 'gasRelease' ? f.rateKgS : f.sizeMW
    inc.burning = f.kind === 'fire'
    inc.zone = zoneAt(c.plant, f.at)?.id
    inc.platform = c.alpha ? platformAt(f.at) : 'Plant'
  }
  d.incidents = [...d.incidents, inc]
  log(d, `INSTRUCTOR: ${describeFault(f)}`, 'warn')
  if (f.kind === 'trip') tripMachine(d, f.tag, f.cause, { local: f.local, repairH: f.repairH })
  if (f.kind === 'instrumentAirFail') tripMachine(d, A.TAGS.iaCompressor, 'Dryer tower failure: air wet, package shut down', { local: true, repairH: 3 })
  if (f.kind === 'valveStuck' && d.valves[f.tag]) d.valves = { ...d.valves, [f.tag]: { ...d.valves[f.tag], fault: 'stuck' } }
  if (f.kind === 'levelControlFail' && d.valves[f.tag]) d.valves = { ...d.valves, [f.tag]: { ...d.valves[f.tag], cmd: 'closed', fault: 'stuck', by: 'fault' } }
  return id
}

// ================================================================= the tick
let wells: PlantResult['wells'] = {}

function tick(dtWall: number) {
  const s = useSim.getState()
  const c = getCtx()
  if (!Object.keys(s.valves).length && c.simValves.length) useSim.setState({ valves: initialValves(c) })
  const total = dtWall * s.speed
  if (total <= 0) {
    if (!s.result) useSim.setState({ result: computeResult(useSim.getState(), c, 0) })
    return
  }
  const n = Math.max(1, Math.ceil(total))
  const dt = total / n
  let res: PlantResult | null = null
  withDraft((d) => {
    for (let i = 0; i < n; i++) {
      d.t += dt
      res = step(d, c, dt)
    }
    accumulateKpis(d, res!, total)
    const ms = { ...d.machines }
    for (const m of c.machines) ms[m] = { ...(ms[m] ?? { runHours: 0 }), runHours: runHours[m] ?? 0 }
    d.machines = ms
  })
  const after = useSim.getState()
  const r = res!
  const alarms = reconcileAlarms(after, c, r)
  const t = after.t + total
  const h: HistoryPoint = { t, oil: r.oilExport, gas: r.gasExport, flare: r.flare, power: r.powerGenerated, eff: r.efficiency, hpLevel: after.process.hpLevel, hpPressure: after.process.hpPressure, iaPressure: after.process.iaPressure }
  const lineFlow = computeLineFlow(c, r)
  useSim.setState({ t, result: r, history: [...after.history.slice(-719), h], availability: after.kpis.availability, lineFlow, alarms, fg: lastFg, detectors: lastDetectors })
  recordInstruments(c, t)
  for (const p of plugins.values()) {
    try {
      actAs('auto', () => p.step(total, t))
    } catch (e) {
      console.error(`[sim plugin ${p.id}]`, e)
    }
  }
}

let lastFg: Record<string, ZoneStatus> = {}
let lastDetectors: Record<string, DetectorSim> = {}

function step(d: Draft, c: Ctx, dt: number): PlantResult {
  // ---- valves stroke
  let vs: Record<string, ValveSim> | null = null
  for (const [tag, v] of Object.entries(d.valves)) {
    // a stuck valve stays put — except a failing one, which first travels to its failed position
    if (v.fault === 'stuck' && v.by !== 'fault') continue
    const target = v.cmd === 'open' ? 1 : 0
    if (v.pos === target) continue
    vs ??= { ...d.valves }
    const np = target > v.pos ? Math.min(1, v.pos + dt / v.stroke) : Math.max(0, v.pos - dt / v.stroke)
    vs[tag] = { ...v, pos: np }
    if (np === target && (c.valveType.get(tag) === 'esdv' || c.valveType.get(tag) === 'bdv' || c.valveType.get(tag) === 'deluge')) log(d, `${tag} ${target ? 'OPEN' : 'CLOSED'} (stroke ${v.stroke.toFixed(0)} s)`, 'info')
  }
  if (vs) d.valves = vs

  // ---- start sequences, run hours
  for (const tag of c.machines) {
    const st = stateOf(d, tag)
    const m = d.machines[tag]
    if (st === 'starting' && m?.startDoneAt !== undefined && d.t >= m.startDoneAt) {
      d.status = { ...d.status, [tag]: 'running' }
      d.machines = { ...d.machines, [tag]: { ...m, startDoneAt: undefined } }
      log(d, `${tag} running`, 'info')
    }
    // random failures (knobs.reliability) are the maintenance plugin's job: it degrades machines along a P-F curve first
    if (st === 'running') runHours[tag] = (runHours[tag] ?? 0) + dt / 3600
  }

  if (!c.alpha) return simpleResult(d, c)

  const k = d.knobs
  const p = { ...d.process }
  const spd = k.compressorSpeed / 100

  // ---- power
  const gtgRunning = c.gtgs.filter((g) => stateOf(d, g) === 'running')
  const ratedOf = (g: string) => {
    const e = c.eq.get(g)
    return e && e.kind === 'gasTurbineGenerator' ? e.ratedMW : 25
  }
  const powerAvailable = c.gtgs.length ? gtgRunning.reduce((a, g) => a + ratedOf(g), 0) : 999
  const wasPowered = mainPowered
  mainPowered = powerAvailable > 0
  if (!mainPowered && wasPowered) {
    log(d, 'BLACKOUT: no turbine generator on the main bus; emergency generator starting', 'trip')
    p.emergencyGen = 'starting'
    emergencyAt = d.t + 15
    // electric drives drop out
    for (const m of c.machines) if (!essential(c, m) && (stateOf(d, m) === 'running' || stateOf(d, m) === 'starting')) {
      d.status = { ...d.status, [m]: 'stopped' }
      d.machines = { ...d.machines, [m]: { ...(d.machines[m] ?? { runHours: 0 }), byShutdown: 'blackout' } }
    }
    initiate(d, 'PSD', 'Alpha', undefined, 'blackout', 'Loss of main power')
    // machines stopped by the blackout restart with the platform
    const sd = d.shutdowns.find((x) => x.causeId === 'blackout' && !x.resetAt)
    if (sd) for (const m of c.machines) if (d.machines[m]?.byShutdown === 'blackout') d.machines = { ...d.machines, [m]: { ...d.machines[m], byShutdown: sd.id } }
  }
  if (mainPowered && !wasPowered) {
    log(d, 'Main power restored', 'info')
    p.emergencyGen = 'standby'
  }
  if (p.emergencyGen === 'starting' && d.t >= emergencyAt) {
    p.emergencyGen = 'running'
    log(d, 'Emergency generator B-9310 running: essential loads (LQ, F&G, UPS, nav aids)', 'warn')
  }
  const loadOf = (t: string) => (t === A.TAGS.rig ? (k.drilling ? A.LOADS[t] : 0) : (A.LOADS[t] ?? 0))
  const demandNow = () => {
    let dm = A.BASE_LOAD
    for (const t of Object.keys(A.LOADS)) if (running(d, c, t) || stateOf(d, t) === 'starting') dm += loadOf(t)
    if (running(d, c, A.TAGS.compressor) || stateOf(d, A.TAGS.compressor) === 'starting') dm += A.COMP_MW * Math.pow(spd, 3) * (1 + p.recycle / 250)
    return dm
  }
  let demand = demandNow()
  shedNow = false
  if (mainPowered && c.gtgs.length && demand > powerAvailable + 0.01) {
    for (const t of A.SHED_ORDER) {
      if (demand <= powerAvailable + 0.01) break
      if (!running(d, c, t) && stateOf(d, t) !== 'starting') continue
      tripMachine(d, t, `Load shed: under-frequency (demand ${demand.toFixed(1)} MW > ${powerAvailable.toFixed(0)} MW)`)
      shedNow = true
      demand = demandNow()
    }
  }
  p.busHz = mainPowered ? (shedNow ? 49.1 : 50 - Math.max(0, demand / Math.max(1, powerAvailable) - 0.9) * 2) : 0
  const powerGenerated = mainPowered ? Math.min(demand, powerAvailable) : 0

  // ---- utilities
  if (running(d, c, A.TAGS.iaCompressor)) p.iaPressure += (8.6 - p.iaPressure) * Math.min(1, dt / 60)
  else p.iaPressure = Math.max(0, p.iaPressure - 0.004 * dt)
  const cooling = nRunning(d, c, A.TAGS.swPumps) > 0 && nRunning(d, c, A.TAGS.cmPumps) > 0 && !hasFault(d, 'coolingFail')
  const cmTarget = cooling ? 32 : 75
  p.cmTemp += (cmTarget - p.cmTemp) * Math.min(1, dt / (cmTarget > p.cmTemp ? 600 : 180))
  const delugeOpen = c.deluge.some((v) => vpos(d, v) > 0.5)
  const fwPumps = nRunning(d, c, A.TAGS.fwPumps)
  const fwTarget = fwPumps ? (delugeOpen ? 12.5 : 14.2) : delugeOpen ? 3 : 12
  p.fwPressure += (fwTarget - p.fwPressure) * Math.min(1, dt / 8)
  // firewater pumps start on low ring-main pressure
  if (p.fwPressure < 10) for (const fp of A.TAGS.fwPumps) if (stateOf(d, fp) === 'standby') {
    startMachine(d, fp, true)
    break
  }

  // ---- wells
  wells = {}
  let oil = 0
  let gas = 0
  let water = 0
  let oilPot = 0
  let mppBoe = 0
  let opBoe = 0
  let flowBoe = 0
  let resBoe = 0
  const pathAlpha = Math.min(1, vpos(d, A.TAGS.inlet) * 1.25)
  const pathWhp = Math.min(pathAlpha, Math.min(1, vpos(d, A.TAGS.bridgeN) * 1.25))
  const dpF = 1 - (p.hpPressure - A.HP.setpoint) * 0.008
  for (const tag of c.wells) {
    const w = A.WELLS[tag] ?? { oil: 6000, gor: 1000, wc: 0.3, platform: platOf(c, tag) }
    const e = c.eq.get(tag)
    const knobOn = k.wellOnline[tag] ?? !(e && e.kind === 'xmasTree' && e.wellType === 'suspended')
    const choke = k.chokes[tag] ?? 60
    const wing = w.wing && d.valves[w.wing] ? Math.min(1, d.valves[w.wing].pos * 1.25) : 1
    const path = w.platform === 'WHP-N' ? pathWhp : pathAlpha
    const avail = knobOn && !platformDown(d, w.platform) && wing > 0.5 && path > 0.5
    const r0 = ramp[tag] ?? 1
    const r = avail ? Math.min(1, r0 + dt / 600) : Math.max(0, r0 - dt / 20)
    ramp[tag] = r
    const boe = (q: number) => q * (1 + (w.gor / 1e6) * A.BOE_PER_MMSCF)
    const mpp = w.oil * chokeF(Math.max(choke, A.REF_CHOKE))
    const op = knobOn ? w.oil * chokeF(choke) : 0
    const o = op * p.reservoir * r * Math.min(wing, path) * dpF
    mppBoe += boe(mpp)
    opBoe += boe(op)
    resBoe += boe(op * (1 - p.reservoir))
    flowBoe += boe(o)
    oilPot += op
    const g = (o * w.gor) / 1e6
    const wa = (o * w.wc) / (1 - w.wc)
    wells[tag] = { oil: o, gas: g, water: wa, online: o > 1 }
    oil += o
    gas += g
    water += wa
  }

  // ---- HP separator liquid
  // oil leaves Alpha through ESDV-1601, over the west bridge and down RP's riser (ESDV-R101)
  const rpUp = !c.eq.has(A.TAGS.rp.oilMeter) || !platformDown(d, 'RP')
  const exportOk = vpos(d, A.TAGS.riser) > 0.5 && vpos(d, A.TAGS.rp.oilRiser) > 0.5 && rpUp && !hasFault(d, 'exportBlocked')
  const lvOil = vpos(d, A.TAGS.oilLv)
  const lvWater = vpos(d, A.TAGS.waterLv)
  const oilCap = exportOk ? nRunning(d, c, A.TAGS.exportPumps) * A.CAP.exportPump * Math.min(1, lvOil * 1.5) : 0
  const waterCap = nRunning(d, c, A.TAGS.pwPumps) * A.CAP.pwPump * Math.min(1, lvWater * 1.5)
  // level controllers (LIC-1101 oil, LIC-1102 interface): inflow + proportional action on level
  const liq = oil + water
  const oilFrac = liq > 1 ? oil / liq : 0.7
  const want = liq + 2500 * (p.hpLevel - A.HP.nll)
  const oilOut = clamp(want * oilFrac, 0, oilCap)
  const waterOut = clamp(want * (1 - oilFrac), 0, waterCap)
  // the LP separator buffers the export: drains slowly once the HP side stops feeding it
  p.hpLevel = clamp(p.hpLevel + ((oil + water - oilOut - waterOut) / 86400 / A.HP.bblPerPct) * dt, 0, 100)
  p.lpLevel = clamp(50 + (p.hpLevel - A.HP.nll) * 0.15 + (oilOut > 1 ? 0 : -8), 5, 95)
  if (p.hpLevel >= A.HP.lahh) initiate(d, 'PSD', 'Alpha', undefined, 'lahh-1101', `LAHH-1101 HP separator level ${p.hpLevel.toFixed(0)} %${hasFault(d, 'exportBlocked') ? ' (export blocked)' : ''}`)

  // ---- gas
  const fuelNeed = powerGenerated * 0.2
  const fuelOk = gas > fuelNeed * 0.5 && vpos(d, A.TAGS.fuelGas) > 0.5 && A.TAGS.turbineFuel.some((t) => vpos(d, t) > 0.5)
  p.fuelGasPressure += ((fuelOk ? 18.2 : 0) - p.fuelGasPressure) * Math.min(1, dt / 30)
  const diesel = gtgRunning.length > 0 && p.fuelGasPressure < 12
  if (gtgRunning.length && diesel !== onDiesel) {
    onDiesel = diesel
    log(d, diesel ? 'Turbine generators changed over to DIESEL (no fuel gas)' : 'Turbine generators back on fuel gas', diesel ? 'warn' : 'info')
  }
  const fuel = diesel ? 0 : Math.min(fuelNeed, gas)
  const compRunning = running(d, c, A.TAGS.compressor)
  const gasRiserOpen = vpos(d, A.TAGS.rp.gasRiser) > 0.5 && rpUp
  const compPath = vpos(d, A.TAGS.gasOut) > 0.5 && vpos(d, A.TAGS.gasExport) > 0.5 && gasRiserOpen
  // compressor running against a closed export path trips on high discharge pressure
  if (compRunning0(d, c) && vpos(d, A.TAGS.gasOut) > 0.5 && !(vpos(d, A.TAGS.gasExport) > 0.5 && gasRiserOpen)) {
    blockedTimer += dt
    if (blockedTimer > 10) {
      tripMachine(d, A.TAGS.compressor, `High discharge pressure: export blocked (${vpos(d, A.TAGS.gasExport) <= 0.5 ? 'ESDV-2301' : 'RP gas riser'} closed)`)
      blockedTimer = 0
    }
  } else blockedTimer = 0
  const compCap = compRunning && compPath ? A.CAP.compressor * spd : 0
  const toComp = Math.min(Math.max(0, gas - fuel), compCap)
  // anti-surge
  if (compRunning) {
    const q = compCap > 0 ? toComp / (A.CAP.compressor * spd) : 0
    p.surgeMargin = clamp(((q + p.recycle / 100) / 0.6 - 1) * 100, -20, 100)
    const raw = clamp((10 - ((q / 0.6 - 1) * 100)) * 2.5, 0, 100)
    if (hasFault(d, 'antiSurgeFail')) {
      p.recycle = 0
      p.surgeMargin = clamp((q / 0.6 - 1) * 100, -20, 100)
      if (p.surgeMargin < 0) {
        surgeTimer += dt
        if (surgeTimer > 5) {
          tripMachine(d, A.TAGS.compressor, 'Surge: high vibration (anti-surge valve FV-2201 failed)', { local: true })
          surgeTimer = 0
        }
      } else surgeTimer = 0
    } else p.recycle += (raw - p.recycle) * Math.min(1, dt / 2)
    if (p.cmTemp >= 55) tripMachine(d, A.TAGS.compressor, `High discharge temperature: cooling medium ${p.cmTemp.toFixed(0)} °C (TAHH-6303)`)
  } else {
    p.recycle = 100
    p.surgeMargin = 0
  }
  if (d.valves[A.TAGS.antiSurge]) d.valves = { ...d.valves, [A.TAGS.antiSurge]: { ...d.valves[A.TAGS.antiSurge], pos: p.recycle / 100, cmd: p.recycle > 1 ? 'open' : 'closed' } }

  // HP pressure, PSV, blowdown
  const toFlarePcv = Math.min(Math.max(0, gas - fuel - toComp), A.CAP.flarePcv)
  const trapped = Math.max(0, gas - fuel - toComp - toFlarePcv)
  const bdOpen = A.TAGS.bdv.some((v) => vpos(d, v) > 0.5)
  let bdFlare = 0
  if (bdOpen) {
    const dInv = p.blowdownInventory * (1 - Math.exp(-dt / A.HP.bdTau))
    p.blowdownInventory -= dInv
    bdFlare = (dInv / dt) * 86400
    p.hpPressure = 1 + (p.hpPressure - 1) * Math.exp(-dt / A.HP.bdTau)
  } else {
    if (trapped > 0.05) p.hpPressure += trapped * 0.004 * dt
    else if (gas > 0.5) p.hpPressure += (k.hpPressure - p.hpPressure) * Math.min(1, dt / 20)
    // no inflow: the pressure controller still vents anything above setpoint to flare; below it the vessel holds
    else if (p.hpPressure > k.hpPressure) p.hpPressure += (k.hpPressure - p.hpPressure) * Math.min(1, dt / 60)
    if (gas > 0.5 && vpos(d, A.TAGS.inlet) > 0.5) p.blowdownInventory += (A.HP.inventory - p.blowdownInventory) * Math.min(1, dt / 600)
  }
  p.relief = 0
  if (p.hpPressure >= A.HP.psv) {
    p.relief = trapped + (p.hpPressure - A.HP.psv) * 200
    p.hpPressure = A.HP.psv + 0.3
    if (!psvLifting) {
      log(d, `PSV-1101 LIFTING at ${A.HP.psv} barg: relieving to flare`, 'trip')
      d.newAlarms.push({ key: `PSV:${d.t}`, tag: 'PSV-1101', text: 'PSV-1101 lifting (HP separator overpressure)', priority: 1, kind: 'process', platform: 'Alpha' })
    }
    psvLifting = true
  } else psvLifting = false
  if (p.hpPressure >= A.HP.pahh) initiate(d, 'PSD', 'Alpha', undefined, 'pahh-1101', `PAHH-1101 HP separator pressure ${p.hpPressure.toFixed(1)} barg`)
  if (p.iaPressure <= 5.5) initiate(d, 'PSD', 'Alpha', undefined, 'ia-ll', `PALL-4603 instrument air ${p.iaPressure.toFixed(1)} barg`)

  const flare = toFlarePcv + p.relief + bdFlare + 0.4

  // ---- water injection → reservoir support
  const wiPresent = c.eq.has(A.TAGS.wi.deaerator) || A.TAGS.wi.injPumps.some((t) => c.eq.has(t))
  if (wiPresent) {
    const pumps = nRunning(d, c, A.TAGS.wi.injPumps)
    const lift = nRunning(d, c, A.TAGS.wi.liftPumps) > 0
    const pathOpen = vpos(d, A.TAGS.wi.esdv) > 0.5 && vpos(d, 'XV-N1611') > 0.5
    p.wiRate = lift && pathOpen ? pumps * A.WI.perPump : 0
    // injection pumps dead-heading against a closed path trip on low flow
    if (pumps > 0 && (!pathOpen || !lift)) {
      wiBlockedTimer += dt
      if (wiBlockedTimer > 30) {
        for (const t of A.TAGS.wi.injPumps) if (running(d, c, t)) tripMachine(d, t, !lift ? 'Low suction pressure: no seawater lift pump' : 'Low flow: injection path closed')
        wiBlockedTimer = 0
      }
    } else wiBlockedTimer = 0
    // voidage: what the wells take out (in reservoir terms) versus what goes back in
    const voidage = A.WI.voidage * ((oil + water) / 72600)
    p.reservoir = clamp(p.reservoir + (p.wiRate - voidage) * A.WI.k * dt, 0.8, 1.03)
  } else p.wiRate = 0

  // ---- cold vents: TEG still (Alpha) + RP riser topsides blowdown
  const rpBd = vpos(d, A.TAGS.rp.bdv) > 0.5
  let rpVent = 0
  if (rpBd) {
    const dInv = rpInventory * (1 - Math.exp(-dt / 120))
    rpInventory -= dInv
    rpVent = (dInv / dt) * 86400
  } else if (vpos(d, A.TAGS.rp.oilRiser) > 0.5) rpInventory += (0.05 - rpInventory) * Math.min(1, dt / 600)
  p.vent = (running(d, c, 'C-5350') ? 0.05 : 0) + rpVent
  d.process = p

  // ---- fire & gas
  stepFireGas(d, c, dt)

  // ---- losses (boe/d), booked to categories
  const gasExport = toComp
  // fuel gas is own use, counted as produced (NSTA); flared gas is a loss
  const actual = oilOut + (gasExport + fuel) * A.BOE_PER_MMSCF
  const constraints: Constraint[] = []
  const down = d.shutdowns.filter((s) => SHUTDOWN_RANK[s.level] >= SHUTDOWN_RANK.PSD)
  // book to the root cause, not to the knock-on shutdowns it caused on other platforms
  const KNOCK_ON = ['upstream-psd', 'injector-shut']
  const root = down.filter((x) => !KNOCK_ON.includes(x.causeId))
  const sdCat: LossCategory = root.length ? root[root.length - 1].loss : down.length ? down[down.length - 1].loss : lastLoss
  const wellsLoss = Math.max(0, mppBoe - opBoe)
  const sdLoss = Math.max(0, opBoe - resBoe - flowBoe)
  const flared = Math.max(0, gas - fuel - gasExport) * A.BOE_PER_MMSCF
  const k2Cause = d.machines[A.TAGS.compressor]?.tripCause ?? ''
  const planned = (tags: string[]) => tags.some((t) => lockOf(t)?.planned)
  // any planned lock-out while production is short books the shortfall to planned maintenance
  const anyPlanned = Object.values(useSim.getState().lockouts).some((l) => l.planned)
  const gasCat: LossCategory = planned([A.TAGS.compressor]) ? 'planned' : /load shed/i.test(k2Cause) ? 'power' : /cooling/i.test(k2Cause) ? 'utilities' : /export blocked/i.test(k2Cause) ? 'export' : 'gas'
  const rest = Math.max(0, mppBoe - actual - wellsLoss - resBoe - sdLoss)
  const flareLoss = Math.min(rest, flared)
  const liqLoss = rest - flareLoss
  const liqCat: LossCategory = planned([...A.TAGS.exportPumps, ...A.TAGS.pwPumps]) || anyPlanned ? 'planned' : hasFault(d, 'exportBlocked') || !exportOk ? 'export' : 'oil'
  if (resBoe > 50) constraints.push({ id: 'reservoir', text: `Reservoir pressure ${(p.reservoir * 100).toFixed(1)} %: ${p.wiRate < 1 ? 'no water injection' : 'injection below voidage'}, ${Math.round(resBoe).toLocaleString()} boe/d lost`, loss: 'reservoir', boe: resBoe })
  if (wellsLoss > 50) constraints.push({ id: 'wells', text: `Wells choked back / shut in: ${Math.round(wellsLoss).toLocaleString()} boe/d below potential`, loss: 'wells', boe: wellsLoss })
  for (const s of down) if (!constraints.some((x) => x.id === s.platform)) constraints.push({ id: s.platform, text: `${s.platform} ${s.level}${s.resetAt ? ' (reset: awaiting restart)' : ''}: ${s.cause}`, loss: s.loss, boe: sdLoss })
  if (!down.length && sdLoss > 50) constraints.push({ id: 'ramp', text: `Wells ramping back after restart: ${Math.round(sdLoss).toLocaleString()} boe/d to come`, loss: sdCat, boe: sdLoss })
  if (flareLoss > 50) constraints.push({ id: 'flare', text: compRunning ? `Compressor at capacity: ${(gas - fuel - gasExport).toFixed(1)} MMscfd to flare` : `Export compressor down${k2Cause ? ` (${k2Cause})` : ''}: gas to flare`, loss: gasCat, boe: flareLoss })
  if (liqLoss > 50) constraints.push({ id: 'liquid', text: !exportOk ? 'Export blocked: oil held in the separators' : nRunning(d, c, A.TAGS.exportPumps) === 0 ? 'No export pump running: HP separator level rising' : 'Liquid handling limits export (level rising)', loss: liqCat, boe: liqLoss })
  if (!mainPowered && c.gtgs.length) constraints.unshift({ id: 'blackout', text: 'BLACKOUT: no gas turbine generator running', loss: 'power', boe: 0 })
  if (p.iaPressure < 6.5 && p.iaPressure > 5.5) constraints.push({ id: 'ia', text: `Instrument air low ${p.iaPressure.toFixed(1)} barg: PSD at 5.5`, loss: 'utilities', boe: 0 })
  if (p.hpLevel >= A.HP.lah && p.hpLevel < A.HP.lahh) constraints.push({ id: 'lah', text: `HP separator level high ${p.hpLevel.toFixed(0)} %: PSD at ${A.HP.lahh.toFixed(0)} %`, loss: liqCat, boe: 0 })
  stepLoss = { res: resBoe, wells: wellsLoss, sd: sdLoss, sdCat, flare: flareLoss, gasCat, liq: liqLoss, liqCat, mpp: mppBoe, actual }

  // ---- platforms
  const platforms: PlantResult['platforms'] = {}
  for (const pid of ['Alpha', 'WHP-N', 'RP', 'WI', 'LQ'] as PlatformId[]) {
    if ((pid === 'RP' && !c.eq.has(A.TAGS.rp.oilMeter)) || (pid === 'WI' && !wiPresent)) continue
    const ws = Object.entries(wells).filter(([t]) => (A.WELLS[t]?.platform ?? platOf(c, t)) === pid)
    const open = d.shutdowns.filter((s) => s.platform === pid || s.level === 'APS')
    const top = open.reduce<ShutdownLevel | null>((a, s) => (!a || SHUTDOWN_RANK[s.level] > SHUTDOWN_RANK[a] ? s.level : a), null)
    const zones = Object.values(lastFg).filter((z) => zonePlatform.get(z.zone) === pid)
    // the general alarm stays on until the shutdown it came with is reset
    const latched = open.filter((s) => !s.resetAt)
    const ga: PlatformResult['ga'] = open.some((s) => s.level === 'APS')
      ? 'abandon'
      : zones.some((z) => z.fire === 'confirmed' || z.smoke === 'confirmed') || latched.some((s) => s.causeId === 'fire-confirmed')
        ? 'fire'
        : zones.some((z) => z.gas === 'confirmed') || latched.some((s) => s.causeId === 'gas-confirmed')
          ? 'gas'
          : latched.some((s) => SHUTDOWN_RANK[s.level] >= SHUTDOWN_RANK.ESD1)
            ? 'muster'
            : 'normal'
    platforms[pid] = {
      oil: pid === 'Alpha' ? oilOut : ws.reduce((a, [, w]) => a + w.oil, 0),
      gas: ws.reduce((a, [, w]) => a + w.gas, 0),
      water: ws.reduce((a, [, w]) => a + w.water, 0),
      online: pid === 'LQ' ? true : pid === 'RP' ? exportOk : pid === 'WI' ? p.wiRate > 0 : !platformDown(d, pid),
      shutdown: top,
      ga,
    }
  }

  return {
    oilPotential: oilPot,
    oilProduced: oil,
    oilExport: oilOut,
    gasProduced: gas,
    gasCompressed: toComp,
    gasExport,
    fuelGas: fuel,
    flare,
    water: waterOut,
    powerDemand: demand,
    powerAvailable,
    powerGenerated,
    efficiency: mppBoe > 0 ? Math.min(100, (actual / mppBoe) * 100) : 100,
    mpp: mppBoe,
    actual,
    constraint: constraints[0]?.text ?? null,
    constraints,
    wells,
    platforms,
    f: {
      oil: oilOut / DESIGN_OIL,
      gas: gasExport / DESIGN_GAS,
      water: waterOut / 18000,
      power: powerGenerated / 17,
      flare: flare / 2,
    },
  }
}
let emergencyAt = 0
let blockedTimer = 0
let wiBlockedTimer = 0
let rpInventory = 0.05
const compRunning0 = (d: Draft, c: Ctx) => running(d, c, A.TAGS.compressor)
let stepLoss = { res: 0, wells: 0, sd: 0, sdCat: 'controlSafety' as LossCategory, flare: 0, gasCat: 'gas' as LossCategory, liq: 0, liqCat: 'oil' as LossCategory, mpp: 0, actual: 0 }

/** plants without the Alpha process: machines start / stop, everything else at design */
function simpleResult(d: Draft, c: Ctx): PlantResult {
  mainPowered = true
  const powerDemand = 2 + c.machines.filter((m) => running(d, c, m)).length * 0.3
  return {
    oilPotential: 0, oilProduced: 0, oilExport: 0, gasProduced: 0, gasCompressed: 0, gasExport: 0, fuelGas: 0, flare: 0.4, water: 0,
    powerDemand, powerAvailable: 999, powerGenerated: powerDemand, efficiency: 100, mpp: 0, actual: 0, constraint: null, constraints: [], wells: {},
    platforms: { Plant: { oil: 0, gas: 0, water: 0, online: !platformDown(d, 'Plant'), shutdown: d.shutdowns[0]?.level ?? null, ga: 'normal' } },
    f: { oil: 1, gas: 1, water: 1, power: 1, flare: 1 },
  }
}
function computeResult(s: SimState, c: Ctx, dt: number): PlantResult {
  let r: PlantResult | null = null
  withDraft((d) => {
    const saved = d.t
    r = step(d, c, dt || 1e-6)
    d.t = saved
  })
  void s
  return r!
}

// ---------------------------------------------------------------- fire & gas step
const zonePlatform = new Map<string, PlatformId>()
function stepFireGas(d: Draft, c: Ctx, dt: number) {
  const ds = dets(c)
  if (!ds.length) return
  // incident dynamics
  let incs: Incident[] | null = null
  for (const inc of d.incidents) {
    if (inc.fault.kind !== 'gasRelease' && inc.fault.kind !== 'fire') continue
    const pid = inc.platform ?? 'Alpha'
    const bd = A.TAGS.bdv.some((v) => vpos(d, v) > 0.5) || d.shutdowns.some((s) => (s.platform === pid || s.level === 'APS') && SHUTDOWN_RANK[s.level] >= SHUTDOWN_RANK.ESD2)
    const psd = platformDown(d, pid)
    let rate = inc.rate ?? 0
    let burning = inc.burning
    let cleared = inc.cleared
    if (inc.fault.kind === 'gasRelease') {
      rate *= bd ? Math.exp(-dt / 300) : psd ? Math.exp(-dt / 1800) : 1
      if (rate < 0.02 && !cleared) {
        log(d, `Gas release ${inc.id} has stopped (source isolated / depressurised)`, 'info')
        cleared = d.t
      }
    } else {
      const deluged = inc.zone ? c.deluge.some((v) => vpos(d, v) > 0.5 && zoneOf(c, v) === inc.zone) : false
      const init = (inc.fault as { sizeMW: number }).sizeMW
      if (deluged) rate *= Math.exp(-dt / 240)
      if (bd) rate *= Math.exp(-dt / 600)
      if (!deluged && !bd) rate += (2 * init - rate) * Math.min(1, dt / 900)
      if (rate < 0.05 && burning) {
        burning = false
        log(d, `Fire ${inc.id} extinguished`, 'info')
        cleared = d.t
      }
    }
    incs ??= d.incidents.map((x) => x)
    const i = incs.indexOf(inc)
    incs[i] = { ...inc, rate, burning, cleared }
  }
  if (incs) d.incidents = incs.filter((x) => !(x.cleared && d.t - x.cleared > 120))
  const clouds: GasCloud[] = d.incidents.filter((i) => i.fault.kind === 'gasRelease' && (i.rate ?? 0) > 0.02 && i.pos).map((i) => ({ pos: i.pos!, rateKgS: i.rate!, age: d.t - i.at }))
  const fires = d.incidents.filter((i) => i.fault.kind === 'fire' && i.burning && i.pos).map((i) => ({ pos: i.pos!, sizeMW: i.rate ?? 1 }))
  const faulted = new Set(d.incidents.filter((i) => i.fault.kind === 'detectorFault').map((i) => (i.fault as { tag: string }).tag))
  const out: Record<string, DetectorSim> = {}
  const zs: Record<string, ZoneStatus> = {}
  const z = (id: string) => (zs[id] ??= { zone: id, gas: 'normal', fire: 'normal', smoke: 'normal', deluge: false, highCount: 0 })
  const counts: Record<string, { gh: number; gl: number; f: number; s: number }> = {}
  for (const fz of zonesOf(c)) {
    zonePlatform.set(fz.id, fz.platform)
    z(fz.id)
  }
  for (const dt0 of ds) {
    let value = 0
    if (dt0.type === 'GD' || dt0.type === 'OGD') value = clouds.length ? gasReading(dt0, clouds, d.knobs.wind) : 0
    else if (dt0.type === 'FD') value = fires.some((f) => flameSees(dt0, f)) ? 1 : 0
    else if (dt0.type === 'HD' || dt0.type === 'SD') value = fires.some((f) => heatSmokeSees(dt0, f)) ? 1 : 0
    const hi = dt0.type === 'GD' ? 60 : dt0.type === 'OGD' ? 3 : 1
    const lo = dt0.type === 'GD' ? 20 : dt0.type === 'OGD' ? 1 : 1
    let state: DetectorSim['state'] = value >= hi ? 'high' : value >= lo ? 'low' : 'normal'
    if (faulted.has(dt0.tag) || (dt0.rxTag && faulted.has(dt0.rxTag))) {
      state = 'fault'
      value = 0
    } else if (d.inhibits[dt0.tag] || (dt0.rxTag && d.inhibits[dt0.rxTag])) state = 'inhibited'
    out[dt0.tag] = { value, state }
    if (!dt0.zone) continue
    zonePlatform.set(dt0.zone, dt0.platform)
    z(dt0.zone)
    const ct = (counts[dt0.zone] ??= { gh: 0, gl: 0, f: 0, s: 0 })
    if (state !== 'high' && state !== 'low') continue
    if ((dt0.type === 'GD' || dt0.type === 'OGD') && state === 'high') ct.gh++
    else if (dt0.type === 'GD' || dt0.type === 'OGD') ct.gl++
    else if (dt0.type === 'FD') ct.f++
    else if (dt0.type === 'HD' || dt0.type === 'SD') ct.s++
  }
  for (const [id, ct] of Object.entries(counts)) {
    const st = z(id)
    st.highCount = ct.gh
    st.gas = ct.gh >= 2 ? 'confirmed' : ct.gh === 1 ? 'high' : ct.gl > 0 ? 'low' : 'normal'
    st.fire = ct.f >= 2 ? 'confirmed' : ct.f === 1 ? 'single' : 'normal'
    st.smoke = ct.s >= 2 ? 'confirmed' : ct.s === 1 ? 'single' : 'normal'
    const pid = zonePlatform.get(id) ?? 'Alpha'
    if (st.gas === 'confirmed') initiate(d, 'ESD2', pid, id, 'gas-confirmed', `Confirmed gas in ${id} (${ct.gh} detectors ≥ high)`)
    if (st.fire === 'confirmed' || st.smoke === 'confirmed') {
      initiate(d, st.fire === 'confirmed' ? 'ESD1' : 'ESD2', pid, id, 'fire-confirmed', `Confirmed ${st.fire === 'confirmed' ? 'fire (2ooN flame)' : 'fire (2ooN heat / smoke)'} in ${id}`)
      for (const v of c.deluge) if (zoneOf(c, v) === id && d.valves[v] && d.valves[v].cmd !== 'open') {
        d.valves = { ...d.valves, [v]: { ...d.valves[v], cmd: 'open', by: 'F&G' } }
        log(d, `DELUGE released in ${id}: ${v} opening`, 'trip')
        d.newAlarms.push({ key: `DELUGE:${v}:${d.t}`, tag: v, text: `Deluge released ${v} (${id})`, priority: 1, kind: 'fg', platform: pid, zone: id })
      }
    }
  }
  for (const v of c.deluge) {
    const id = zoneOf(c, v)
    if (id && vpos(d, v) > 0.5) z(id).deluge = true
  }
  lastFg = zs
  lastDetectors = out
  d.fg = zs
  d.detectors = out
}

// ---------------------------------------------------------------- KPIs
function accumulateKpis(d: Draft, r: PlantResult, dt: number) {
  const c = getCtx()
  if (!c.alpha) {
    d.kpis = { ...d.kpis, pe: 100, peHour: 100, availability: 100 }
    return
  }
  const L = stepLoss
  const f = dt / 86400
  acc.prod += L.actual * f
  acc.pot += L.mpp * f
  acc.total += dt
  const up = !platformDown(d, 'Alpha') && mainPowered
  if (up) acc.up += dt
  losses = { ...losses }
  losses.wells += L.wells * f
  losses.reservoir += L.res * f
  losses[L.sdCat] += L.sd * f
  losses[L.gasCat] += L.flare * f
  losses[L.liqCat] += L.liq * f
  hourRing.push([d.t, L.actual * f, L.mpp * f])
  while (hourRing.length && hourRing[0][0] < d.t - 3600) hourRing.shift()
  const hp = hourRing.reduce((a, x) => a + x[1], 0)
  const hq = hourRing.reduce((a, x) => a + x[2], 0)
  d.kpis = {
    ...d.kpis,
    pe: acc.pot > 0 ? Math.min(100, (acc.prod / acc.pot) * 100) : 100,
    peHour: hq > 0 ? Math.min(100, (hp / hq) * 100) : 100,
    availability: acc.total > 0 ? (acc.up / acc.total) * 100 : 100,
    losses,
    producedBoe: acc.prod,
    potentialBoe: acc.pot,
  }
  void r
}

// ---------------------------------------------------------------- alarms
interface Cond {
  key: string
  tag: string
  text: string
  priority: AlarmPriority
  kind: Alarm['kind']
  platform: PlatformId
  zone?: string
  value?: string
}
const LIMIT_TEXT = { hiHi: 'high-high', hi: 'high', lo: 'low', loLo: 'low-low' } as const

function reconcileAlarms(s: SimState, c: Ctx, r: PlantResult): Alarm[] {
  const t = s.t
  const conds = new Map<string, Cond>()
  const add = (x: Cond) => conds.set(x.key, x)
  // process instruments
  for (const inst of c.plant.instruments) {
    const al = inst.alarms
    if (!al) continue
    const host = instHost(c, inst)
    if (host && c.cls.has(host) && !isRunning(host)) continue // state-based suppression: machine not running
    const p = c.alpha ? platOf(c, host ?? inst.tag) : 'Plant'
    const v = instValue(inst, t)
    const lim = al.hiHi !== undefined && v >= al.hiHi ? 'hiHi' : al.loLo !== undefined && v <= al.loLo ? 'loLo' : al.hi !== undefined && v >= al.hi ? 'hi' : al.lo !== undefined && v <= al.lo ? 'lo' : null
    if (!lim) continue
    if ((lim === 'lo' || lim === 'loLo') && platformDown(s, p) && !DYNAMIC.has(inst.tag)) continue // suppressed during a shutdown
    add({ key: `${inst.tag}:${lim}`, tag: inst.tag, text: `${inst.tag} ${LIMIT_TEXT[lim]} (${al[lim]} ${inst.unit})`, priority: lim === 'hiHi' || lim === 'loLo' ? 1 : 2, kind: 'process', platform: p, value: `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)} ${inst.unit}` })
  }
  // machines
  for (const m of c.machines) {
    const st = stateOf(s, m)
    if (st === 'tripped') {
      const mm = s.machines[m]
      add({ key: `${m}:TRIP`, tag: m, text: `${m} tripped: ${mm?.tripCause ?? ''}${mm?.localReset ? ' (local reset)' : ''}`, priority: /surge|fire|failure/i.test(mm?.tripCause ?? '') ? 1 : 2, kind: 'equipment', platform: c.alpha ? platOf(c, m) : 'Plant' })
    }
  }
  // shutdowns
  for (const sd of s.shutdowns) if (!sd.resetAt) add({ key: `ESD:${sd.id}`, tag: sd.level, text: `${sd.level} ${sd.platform}${sd.zone ? ` ${sd.zone}` : ''}: ${sd.cause}`, priority: 1, kind: 'esd', platform: sd.platform, zone: sd.zone })
  // F&G
  for (const [tag, ds] of Object.entries(s.detectors)) {
    if (ds.state === 'normal' || ds.state === 'inhibited') continue
    const det = dets(c).find((x) => x.tag === tag)
    const unit = det?.type === 'OGD' ? 'LEL·m' : det?.type === 'GD' ? '%LEL' : ''
    const what = det?.type === 'FD' ? 'flame detected' : det?.type === 'HD' ? 'heat detected' : det?.type === 'SD' ? 'smoke detected' : ds.state === 'fault' ? '' : `gas ${ds.state}`
    add({ key: `${tag}:${ds.state}`, tag, text: ds.state === 'fault' ? `${tag} detector fault` : `${tag} ${what}`, priority: ds.state === 'fault' ? 3 : ds.state === 'high' ? 1 : 2, kind: 'fg', platform: det?.platform ?? 'Alpha', zone: det?.zone ?? undefined, value: unit ? `${ds.value.toFixed(0)} ${unit}` : undefined })
  }
  for (const [tag, on] of Object.entries(s.inhibits)) if (on) add({ key: `${tag}:INH`, tag, text: `${tag} inhibited (override in force)`, priority: 3, kind: 'fg', platform: dets(c).find((x) => x.tag === tag)?.platform ?? 'Alpha' })
  // system
  if (!mainPowered && c.gtgs.length) add({ key: 'SYS:BLACKOUT', tag: 'MAIN BUS', text: 'Main power lost: blackout', priority: 1, kind: 'system', platform: 'Alpha' })
  if (s.process.emergencyGen === 'running') add({ key: 'SYS:EG', tag: A.TAGS.emergencyGen, text: 'Emergency generator running', priority: 2, kind: 'system', platform: 'LQ' })
  if (onDiesel) add({ key: 'SYS:DIESEL', tag: 'GT-8100', text: 'Turbine generators on diesel (no fuel gas)', priority: 3, kind: 'system', platform: 'Alpha' })
  if (c.alpha && r.flare > 20) add({ key: 'SYS:FLARE', tag: 'FLARE', text: `High flaring ${r.flare.toFixed(0)} MMscfd`, priority: r.flare > A.CAP.flareSystem * 0.8 ? 1 : 2, kind: 'process', platform: 'Alpha' })
  if (c.alpha && s.process.surgeMargin < 5 && isRunning(A.TAGS.compressor)) add({ key: 'K-2200:SURGE', tag: A.TAGS.compressor, text: `K-2200 surge margin low ${s.process.surgeMargin.toFixed(0)} %`, priority: 1, kind: 'process', platform: 'Alpha' })
  for (const v of Object.entries(s.valves)) if (v[1].fault === 'stuck') add({ key: `${v[0]}:STUCK`, tag: v[0], text: `${v[0]} position discrepancy: valve not moving`, priority: 2, kind: 'equipment', platform: c.alpha ? platOf(c, v[0]) : 'Plant' })
  for (const a of pushedAlarms.splice(0)) add({ ...a })
  for (const p of plugins.values()) {
    try {
      for (const a of p.alarms?.() ?? []) add({ ...a, kind: a.kind ?? 'equipment' })
    } catch (e) {
      console.error(`[sim plugin ${p.id} alarms]`, e)
    }
  }

  // reconcile
  const next: Alarm[] = []
  const seen = new Set<string>()
  for (const a of s.alarms) {
    const k = a.id.replace(/#\d+$/, '')
    const cnd = conds.get(k)
    seen.add(k)
    if (a.state === 'shelved') {
      if (a.shelvedUntil !== undefined && t >= a.shelvedUntil) {
        if (cnd) next.push({ ...a, state: 'unack', active: true, shelvedUntil: undefined })
        continue
      }
      next.push({ ...a, active: !!cnd, value: cnd?.value ?? a.value })
      continue
    }
    if (cnd) next.push({ ...a, active: true, value: cnd.value ?? a.value, state: a.state === 'rtnUnack' ? 'unack' : a.state })
    else if (a.state === 'ack') continue
    else next.push({ ...a, active: false, state: 'rtnUnack' })
  }
  for (const [k, cnd] of conds) {
    if (seen.has(k)) continue
    next.unshift({ id: `${k}#${++alarmSeq}`, tag: cnd.tag, text: cnd.text, priority: cnd.priority, kind: cnd.kind, platform: cnd.platform, zone: cnd.zone, state: 'unack', active: true, raisedAt: t, value: cnd.value })
    raised.push(t)
  }
  while (raised.length && raised[0] < t - 600) raised.shift()
  useSim.setState((x) => ({ kpis: { ...x.kpis, alarmRate: raised.length } }))
  return next.slice(0, 400)
}
const raised: number[] = []

function instHost(c: Ctx, inst: Instrument): string | undefined {
  if ('equipment' in inst.on) return inst.on.equipment
  const l = c.plant.lines.find((x) => x.tag === (inst.on as { line: string }).line)
  if (!l) return undefined
  const ends = [l.from, l.to].filter((e) => 'equipment' in e).map((e) => (e as { equipment: string }).equipment)
  return ends.find((t) => c.cls.has(t)) ?? ends[0]
}

// ---------------------------------------------------------------- instrument values
const DYNAMIC = new Set<string>([A.TAGS.inst.hpLevel, A.TAGS.inst.hpPressure, A.TAGS.inst.lpLevel, ...A.TAGS.inst.ia, A.TAGS.inst.cm, ...A.TAGS.inst.fuel, ...A.TAGS.inst.fw, ...A.TAGS.inst.iaRemote, ...A.TAGS.inst.fwRemote, A.TAGS.inst.wiFlow, A.TAGS.inst.wiDischarge])

/** value from the dynamic model for instruments it drives (undefined = use the historian) */
export function procValue(tag: string): number | undefined {
  for (const p of plugins.values()) {
    const v = p.value?.(tag)
    if (v !== undefined) return v
  }
  const s = useSim.getState()
  const p = s.process
  const c = ctxCache
  if (!c?.alpha) return undefined
  const det = s.detectors[tag]
  if (det) return det.value
  switch (tag) {
    case A.TAGS.inst.hpLevel:
      return p.hpLevel * A.HP.mmPerPct
    case A.TAGS.inst.hpPressure:
      return p.hpPressure
    case A.TAGS.inst.lpLevel:
      return p.lpLevel * 28
    case A.TAGS.inst.cm:
      return p.cmTemp
    case A.TAGS.inst.flare:
      return 0.12 + (s.result?.flare ?? 0.4) * 0.004
  }
  if (A.TAGS.inst.ia.includes(tag)) return p.iaPressure - (tag === 'PT-4603' ? 0 : 0.3)
  if (A.TAGS.inst.iaRemote.includes(tag)) return p.iaPressure - 0.45
  if (A.TAGS.inst.fwRemote.includes(tag)) return p.fwPressure + 1.6
  // before the first plant result the meters read the historian (else they latch a spurious 'low' at start-up)
  if (A.TAGS.inst.exportFlow.includes(tag)) return s.result ? s.result.oilExport : undefined
  if (tag === A.TAGS.inst.wiFlow) return p.wiRate
  if (tag === A.TAGS.inst.wiDischarge) {
    const pumps = A.TAGS.wi.injPumps.filter((t) => isRunning(t)).length
    return pumps === 0 ? 3 : p.wiRate > 0 ? 220 + pumps * 3 : 258 // dead-heading against a closed path
  }
  if (A.TAGS.inst.fuel.includes(tag)) return p.fuelGasPressure
  if (A.TAGS.inst.fw.includes(tag)) return p.fwPressure + 2
  return undefined
}

function instValue(inst: Instrument, t: number) {
  const o = procValue(inst.tag)
  if (o !== undefined) return o
  return historianRaw(inst, t) * simScale(inst, getCtx().plant)
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}
/** smooth plausible signal around the nominal (the "historian") */
export function historianRaw(inst: Instrument, t: number) {
  const h = hash(inst.tag)
  const span = Math.max(Math.abs(inst.nominal) * 0.025, 0.05)
  return inst.nominal + span * (0.9 * Math.sin(t * (0.05 + h * 0.07) + h * 10) + 0.45 * Math.sin(t * (0.23 + h * 0.2) + h * 4) + 0.18 * Math.sin(t * 1.7 + h * 2))
}

function recordInstruments(c: Ctx, t: number) {
  for (const inst of c.plant.instruments) {
    let a = instHist.get(inst.tag)
    if (!a) instHist.set(inst.tag, (a = []))
    a.push(instValue(inst, t))
    if (a.length > HIST_N) a.shift()
  }
}
/** recorded history of an instrument (one sample per sim tick), oldest first */
export function instrumentHistory(tag: string, n: number): number[] {
  const a = instHist.get(tag) ?? []
  return a.slice(-n)
}

// ---------------------------------------------------------------- flow animation
function computeLineFlow(c: Ctx, r: PlantResult): Record<string, number> {
  const s = useSim.getState()
  const out: Record<string, number> = {}
  for (const l of c.plant.lines) {
    if (l.sprayNozzles) {
      const v = c.sprayValve.get(l.tag)
      out[l.tag] = v && vpos(s, v) > 0.3 ? 1 : 0
      continue
    }
    const vs = c.lineValves.get(l.tag)
    if (vs?.some((v) => vpos(s, v) < 0.05)) {
      out[l.tag] = 0
      continue
    }
    if (vs?.some((v) => c.valveType.get(v) === 'bdv')) {
      out[l.tag] = A.TAGS.bdv.some((v) => vpos(s, v) > 0.5) ? Math.max(0.3, r.f.flare) : 0
      continue
    }
    out[l.tag] = simScale({ tag: l.tag, type: 'FT', on: { line: l.tag, seg: 0, t: 0 }, unit: 'm³/h', nominal: 1, range: '' }, c.plant)
  }
  return out
}

// ================================================================= instrument values follow the plant
const RATE_UNITS = /m³\/h|MMscfd|bbl\/d|m³\/d|L\/h|MW|kW|A\b|rpm|%LEL|LEL·m/

/**
 * How far an instrument's reading moves from its nominal with the simulated plant: flow-like
 * readings scale with the throughput of their stream; pressures and temperatures move a little;
 * anything on a stopped machine drops to idle.
 */
export function simScale(inst: Instrument, plant: Plant): number {
  const r = useSim.getState().result
  if (!r) return 1
  const rate = RATE_UNITS.test(inst.unit) && !/%LEL|LEL·m/.test(inst.unit)
  let system: string | undefined
  let host: string | undefined
  if ('line' in inst.on) {
    const l = plant.lines.find((x) => x.tag === (inst.on as { line: string }).line)
    system = l?.system
    const ends = l ? [l.from, l.to].filter((e) => 'equipment' in e).map((e) => (e as { equipment: string }).equipment) : []
    host = ends.find((t) => plant.equipment.find((x) => x.tag === t && (x.kind === 'pumpPackage' || x.kind === 'compressorPackage' || x.kind === 'caissonPump' || x.kind === 'xmasTree')))
    if (l && l.service === 'flare') return rate ? Math.max(0.05, r.f.flare) : 1
  } else {
    host = inst.on.equipment
    system = plant.equipment.find((x) => x.tag === host)?.system
  }
  const hostEq = host ? plant.equipment.find((x) => x.tag === host) : undefined
  if (hostEq?.kind === 'proxy' || host === 'DR-100') {
    const drilling = useSim.getState().knobs.drilling && isRunning('DR-100')
    if (drilling) return 1
    if (/%LEL|LEL·m|ppm|% IR/.test(inst.unit)) return 1
    if (inst.unit === 't') return 0.4
    if (/barg/.test(inst.unit) && hostEq?.kind === 'proxy' && hostEq.role === 'bop') return /ACC|ANN/.test(inst.tag) ? 1 : 0.5
    return 0.02
  }
  if (host && r.wells[host]) {
    const w = r.wells[host]
    const base = (A.WELLS[host]?.oil ?? 6000) * chokeF(60)
    const f = w.oil / base
    return rate ? f : 0.75 + 0.25 * Math.min(1.2, f)
  }
  if (host && !isRunning(host)) {
    const e = plant.equipment.find((x) => x.tag === host)
    if (e && ROTATING.has(e.kind) && e.kind !== 'module' && e.kind !== 'transformer') return rate ? 0 : 0.35
  }
  // production / wells lines carry what the wells make; export lines what leaves the separators
  const f = system === 'gasCompression' || system === 'gasTreatment' ? r.f.gas : system === 'producedWater' ? r.f.water : system === 'production' || system === 'wells' ? r.oilProduced / DESIGN_OIL : system === 'oilExport' ? r.f.oil : 1
  return rate ? f : 0.85 + 0.15 * Math.min(1.3, f)
}

/** legacy helper kept for callers that compute a plant snapshot */
export function computePlant(): PlantResult | null {
  return useSim.getState().result
}
