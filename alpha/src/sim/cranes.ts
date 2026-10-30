/**
 * Crane operations (a SimPlugin): every platform crane (model/cranes.ts CRANES) works through its lift
 * schedule — supply-boat lifts at the working side and deck-to-deck moves to the laydown areas — and
 * stops when it is not safe to lift:
 *
 *   wind      > 20 m/s for cargo, > 13 m/s for personnel transfer         land the load, boom to rest
 *   sea       Hs > 3.0 m: supply-boat lifts suspended                      (unloaded: abort; loaded: land on deck)
 *   gas       any gas alarm (low / high) in a fire zone of the platform     land the load, boom to rest
 *   GA / ESD  general alarm, or ESD1 / APS latched on the platform          land the load, boom to rest
 *   confirmed gas (2ooN) / APS: the diesel engine is SHUT DOWN at once (ignition source isolation):
 *             the crane stops where it is, brakes on, P2 alarm; restart from the crane panel once clear.
 *
 * Operations resume 60 s after the conditions clear (with hysteresis: wind 2 m/s and Hs 0.3 m below the
 * limits). Motion is rate-limited (slew ≈ 0.5 rpm, luff 1.3 deg/s, hoist 0.5 / 0.9 m/s), so it works at
 * any clock speed; the 3D cranes (scene/env/Cranes.tsx) smooth between ticks.
 *
 * State lives in its own store (`useCranes`). Live values for the inspector: `craneMetrics(tag)` lists
 * the metrics of a crane or vent stack, `craneValue(instTag)` returns their live values.
 * Guarded throughout: knobs.wind / knobs.seaState / process.vent / fg / result.platforms may be missing.
 */
import { create } from 'zustand'
import type { Instrument } from '../model/types'
import { BOAT_Y, CARGO, CRANES, CRANE_BY_TAG, craneDims, hookAbove, luffFor, parkedPose, radiusAt, tipHeight, type CargoKind, type CraneDims, type CraneJob, type CraneSite, type LiftSpot } from '../model/cranes'
import { VENT_BY_TAG, VENTS, type VentStack } from '../model/vents'
import * as engine from '../state/sim'
import { isRunning, registerSimPlugin, simRandom, useSim } from '../state/sim'
import { usePlantStore } from '../state/plantStore'
import { fireZones, type FireZone } from './fg'
import { SHUTDOWN_RANK, type AlarmPriority, type PlatformId, type ShutdownLevel, type SimPlugin, type SimState } from './types'

// ---------------------------------------------------------------- limits
export const CRANE_LIMITS = {
  /** mean wind speed, m/s */
  windCargo: 20,
  windPersonnel: 13,
  /** significant wave height for supply-boat lifts, m */
  hsBoat: 3.0,
  /** conditions must be clear this long before lifting resumes, s */
  resumeAfter: 60,
}
const RATE = { slew: 0.052, luff: 0.023, hoistLoaded: 0.5, hoistEmpty: 0.9 }
const T_HOOK_ON = 45
const T_UNHOOK = 40

export type CraneState = 'idle' | 'lifting' | 'landed' | 'suspended'
export type CranePhase = 'parked' | 'toPick' | 'lowerPick' | 'hookOn' | 'hoist' | 'travel' | 'lower' | 'landed' | 'clear' | 'return'

export interface CraneRun {
  tag: string
  state: CraneState
  phase: CranePhase
  /** why it is suspended (null = not suspended) */
  reason: string | null
  /** diesel engine running (false = shut down by F&G / APS: needs a restart) */
  engine: boolean
  /** boom heading (rad, plan, from +x towards +z), luff (rad, + = tip up), hook-block height above the crane's deck (m) */
  slew: number
  luff: number
  hook: number
  /** hook radius, m */
  radius: number
  /** hook load, t, and what hangs on the hook */
  load: number
  cargo: CargoKind | null
  /** current job (index into the crane's schedule) */
  job: number
  /** taking the load back to where it was picked (boat lifts stopped mid-lift) */
  back: boolean
  timer: number
  /** conditions have been clear for (s) */
  clearFor: number
  lifts: number
  /** what it is doing, in words */
  activity: string
}

export interface CraneEvent {
  t: number
  tag: string
  text: string
  level: 'info' | 'warn' | 'trip'
}

interface CraneStore {
  cranes: Record<string, CraneRun>
  events: CraneEvent[]
  /** run the lift schedules (off = cranes stay parked) */
  operating: boolean
  setOperating: (on: boolean) => void
  /** restart a crane's diesel engine after an F&G shutdown; returns why it was refused */
  restartEngine: (tag: string) => string | null
  reset: () => void
}

function initialRun(c: CraneSite, i: number): CraneRun {
  const p = parkedPose(c)
  const d = craneDims(c.spec)
  return {
    tag: c.tag,
    state: 'idle',
    phase: 'parked',
    reason: null,
    engine: true,
    ...p,
    radius: radiusAt(d, p.luff),
    load: 0,
    cargo: null,
    job: 0,
    back: false,
    timer: 20 + i * 45, // staggered first lifts
    clearFor: 999,
    lifts: 0,
    activity: 'Parked, boom on rest',
  }
}
const initialCranes = () => Object.fromEntries(CRANES.map((c, i) => [c.tag, initialRun(c, i)]))

export const useCranes = create<CraneStore>((set, get) => ({
  cranes: initialCranes(),
  events: [],
  operating: true,
  setOperating: (operating) => {
    set({ operating })
    useSim.getState().record?.({ who: 'operator', action: 'setCraneOps', detail: operating ? 'lift schedules running' : 'lift schedules stopped' })
  },
  restartEngine: (tag) => {
    const r = get().cranes[tag]
    const c = CRANE_BY_TAG.get(tag)
    if (!r || !c) return `${tag}: no such crane`
    if (r.engine) return `${tag}: engine already running`
    const h = hazards(c, useSim.getState() as Partial<SimState>)
    if (h.engineStop) return `${tag}: ${h.engineStop} — cannot restart`
    if (h.stop) return `${tag}: ${h.stop} — cannot restart`
    set((s) => ({ cranes: { ...s.cranes, [tag]: { ...r, engine: true, clearFor: 0, activity: 'Engine restarted' } } }))
    logEvent(tag, `${tag} diesel engine restarted`, 'info')
    useSim.getState().record?.({ who: 'field', action: 'craneRestart', tag })
    return null
  },
  reset: () => set({ cranes: initialCranes(), events: [], operating: true }),
}))

function logEvent(tag: string, text: string, level: CraneEvent['level']) {
  const t = (useSim.getState() as Partial<SimState>).t ?? 0
  useCranes.setState((s) => ({ events: [{ t, tag, text, level }, ...s.events].slice(0, 40) }))
}

// ---------------------------------------------------------------- what the platform is doing

let zoneCache: { plant: unknown; zones: FireZone[] } | null = null
function zonesOf(pid: PlatformId): FireZone[] {
  const plant = usePlantStore.getState().plant
  if (!zoneCache || zoneCache.plant !== plant) {
    let zones: FireZone[] = []
    try {
      zones = fireZones(plant)
    } catch {
      zones = []
    }
    zoneCache = { plant, zones }
  }
  return zoneCache.zones.filter((z) => z.platform === pid)
}

function latchedShutdown(s: Partial<SimState>, pid: PlatformId): ShutdownLevel | null {
  let best: ShutdownLevel | null = s.result?.platforms?.[pid]?.shutdown ?? null
  for (const sd of s.shutdowns ?? []) if (sd.platform === pid && !sd.resetAt && (!best || SHUTDOWN_RANK[sd.level] > SHUTDOWN_RANK[best])) best = sd.level
  return best
}

export interface CraneHazards {
  /** shuts the diesel engine down */
  engineStop: string | null
  /** stops lifting (land the load, boom to rest) */
  stop: string | null
  gas: 'normal' | 'alarm' | 'confirmed'
  ga: string
  shutdown: ShutdownLevel | null
}
export function hazards(c: CraneSite, s: Partial<SimState>): CraneHazards {
  const pid = c.platform
  let gas: CraneHazards['gas'] = 'normal'
  for (const z of zonesOf(pid)) {
    const g = s.fg?.[z.id]?.gas
    if (g === 'confirmed') gas = 'confirmed'
    else if (g && g !== 'normal' && gas === 'normal') gas = 'alarm'
  }
  const ga = s.result?.platforms?.[pid]?.ga ?? 'normal'
  const sd = latchedShutdown(s, pid)
  const rank = sd ? SHUTDOWN_RANK[sd] : -1
  const engineStop = gas === 'confirmed' ? `Confirmed gas on ${pid}` : rank >= SHUTDOWN_RANK.APS ? `APS on ${pid}` : null
  const stop = engineStop ?? (gas === 'alarm' ? `Gas alarm on ${pid}` : ga !== 'normal' ? `General alarm (${ga}) on ${pid}` : rank >= SHUTDOWN_RANK.ESD1 ? `${sd} latched on ${pid}` : null)
  return { engineStop, stop, gas, ga, shutdown: sd }
}

const _wind = { from: 240, speed: 7 }
/** current wind (knobs.wind, guarded). Returns a SHARED object (no per-frame allocation): read, don't keep. */
export const windNow = (): { readonly from: number; readonly speed: number } => {
  const w = (useSim.getState() as Partial<SimState>).knobs?.wind
  _wind.from = Number.isFinite(w?.from) ? (w!.from as number) : 240
  _wind.speed = Number.isFinite(w?.speed) ? (w!.speed as number) : 7
  return _wind
}
export const seaStateNow = () => {
  const h = (useSim.getState() as Partial<SimState>).knobs?.seaState
  return Number.isFinite(h) ? (h as number) : 1.5
}
/** wind at height h above sea (power law from the 10 m reference) */
export const windAt = (u10: number, h: number) => u10 * Math.pow(Math.max(h, 1) / 10, 0.11)

// ---------------------------------------------------------------- kinematics helpers

const norm = (a: number, lo: number, hi: number) => {
  let x = a
  while (x < lo - 1e-6) x += Math.PI * 2
  while (x > hi + 1e-6) x -= Math.PI * 2
  return Math.min(hi, Math.max(lo, x))
}
const isBoat = (s: LiftSpot) => s.y <= BOAT_Y + 0.01
const jobIsBoat = (j: CraneJob) => isBoat(j.from) || isBoat(j.to)

interface Pose {
  slew: number
  luff: number
  hook: number
}
function poseAt(c: CraneSite, d: CraneDims, spot: LiftSpot, cargo: CargoKind | null, above: number): Pose {
  const slew = norm(Math.atan2(spot.z - c.z, spot.x - c.x), c.slew[0], c.slew[1])
  const luff = luffFor(d, Math.hypot(spot.x - c.x, spot.z - c.z))
  return { slew, luff, hook: spot.y - c.deckY + hookAbove(d, cargo) + above }
}

/** move one coordinate towards its target at `rate`; returns the time left over */
function moveTo(r: CraneRun, key: 'slew' | 'luff' | 'hook', target: number, rate: number, left: number) {
  const dv = target - r[key]
  const need = Math.abs(dv) / rate
  if (need <= left) {
    r[key] = target
    return left - need
  }
  r[key] += Math.sign(dv) * rate * left
  return 0
}

/** drive towards a pose: hoist clear, luff up, slew, luff out, then the hook. Returns the time left once
 *  there (≥ 0), or −1 while still moving. The hook is never above 2.5 m under the head sheaves. */
function drive(r: CraneRun, d: CraneDims, tgt: Pose, budget: number): number {
  const hoist = r.cargo ? RATE.hoistLoaded : RATE.hoistEmpty
  const cap = () => tipHeight(d, r.luff) - 2.5
  let left = budget
  for (let i = 0; i < 12; i++) {
    if (Math.abs(tgt.slew - r.slew) > 1e-3) {
      if (left <= 1e-6) return -1
      const travelLuff = Math.max(d.luffTravel, Math.min(tgt.luff, d.luffMax))
      const hookTravel = Math.min(tipHeight(d, travelLuff) - 3, 8 + (r.cargo ? CARGO[r.cargo].size[1] + d.sling : 0))
      if (r.hook < hookTravel - 1e-3) left = moveTo(r, 'hook', hookTravel, hoist, left)
      else if (r.luff < d.luffTravel - 1e-4) left = moveTo(r, 'luff', d.luffTravel, RATE.luff, left)
      else left = moveTo(r, 'slew', tgt.slew, RATE.slew, left)
      continue
    }
    if (Math.abs(tgt.luff - r.luff) > 1e-4) {
      if (left <= 1e-6) return -1
      left = moveTo(r, 'luff', tgt.luff, RATE.luff, left)
      r.hook = Math.min(r.hook, cap()) // the hook pays out as the head comes down
      continue
    }
    const goal = Math.min(tgt.hook, cap())
    if (Math.abs(goal - r.hook) > 1e-3) {
      if (left <= 1e-6) return -1
      left = moveTo(r, 'hook', goal, hoist, left)
      continue
    }
    return left
  }
  return -1
}

/** rated capacity at a radius (load chart: SWL out to ~35 % of the max radius, then falling) */
export function ratedCapacity(c: CraneSite, radius: number) {
  const d = craneDims(c.spec)
  const rRef = 0.35 * radiusAt(d, d.luffMin)
  return c.swl * Math.min(1, Math.pow(rRef / Math.max(radius, 1), 1.2))
}

// ---------------------------------------------------------------- the step

function windLimit(job: CraneJob | undefined) {
  return job?.personnel ? CRANE_LIMITS.windPersonnel : CRANE_LIMITS.windCargo
}

function stepCrane(prev: CraneRun, c: CraneSite, dt: number, s: Partial<SimState>, operating: boolean): CraneRun {
  const r: CraneRun = { ...prev }
  const d = craneDims(c.spec)
  const wind = windNow().speed
  const hs = seaStateNow()
  const h = hazards(c, s)
  const job = c.jobs[r.job % c.jobs.length]

  // ---- engine shutdown on confirmed gas / APS: stop dead, brakes on
  if (h.engineStop && r.engine) {
    r.engine = false
    r.state = 'suspended'
    r.reason = `${h.engineStop} — diesel engine shut down (ignition source)`
    r.activity = r.cargo ? `Stopped with the ${CARGO[r.cargo].label} on the hook, brakes on` : 'Stopped, brakes on'
    logEvent(c.tag, `${c.tag} ${r.reason}`, 'trip')
    useSim.getState().record?.({ who: 'auto', action: 'craneEngineStop', tag: c.tag, detail: h.engineStop })
    pushAlarm(c, r.reason)
  }
  if (!r.engine) {
    r.state = 'suspended'
    if (!h.engineStop && !/restart/.test(r.reason ?? '')) r.reason = `Engine shut down by F&G — ${h.stop ? h.stop.toLowerCase() : 'clear, restart required'}`
    r.radius = radiusAt(d, r.luff)
    return r
  }

  // ---- what stops lifting right now (with hysteresis while already stopped)
  const wasStopped = r.state === 'suspended'
  const lim = windLimit(job)
  const windBad = wind > lim - (wasStopped && /^Wind/.test(r.reason ?? '') ? 2 : 0)
  const seaBad = hs > CRANE_LIMITS.hsBoat - (wasStopped && /^Hs/.test(r.reason ?? '') ? 0.3 : 0)
  let block: string | null = h.stop
  if (!block && windBad) block = `Wind ${wind.toFixed(1)} m/s > ${lim} m/s (${job?.personnel ? 'personnel' : 'cargo'})`
  // the sea state only stops boat lifts: the schedule is boat lifts, so it stops the crane unless it is
  // mid-lift with a load bound for the deck
  const boatStop = seaBad && !!job && jobIsBoat(job)
  if (!block && boatStop) block = `Hs ${hs.toFixed(1)} m > ${CRANE_LIMITS.hsBoat.toFixed(1)} m — supply-boat lifts suspended`
  if (block) {
    if (!wasStopped || r.reason !== block) {
      if (!wasStopped) {
        logEvent(c.tag, `${c.tag} lifting suspended: ${block}`, 'warn')
        useSim.getState().record?.({ who: 'auto', action: 'craneSuspend', tag: c.tag, detail: block })
      }
    }
    r.reason = block
    r.state = 'suspended'
    r.clearFor = 0
  } else if (wasStopped) {
    r.clearFor += dt
    if (r.clearFor >= CRANE_LIMITS.resumeAfter) {
      r.state = 'idle'
      r.reason = null
      logEvent(c.tag, `${c.tag} lifting resumed`, 'info')
    } else r.reason = `Resuming in ${Math.ceil(CRANE_LIMITS.resumeAfter - r.clearFor)} s (conditions clear)`
  }
  const stopped = r.state === 'suspended' || !operating

  // ---- the lift sequence
  let left = dt
  for (let guard = 0; guard < 24 && left > 1e-4; guard++) {
    const jb = c.jobs[r.job % c.jobs.length]
    const from = r.back ? jb.to : jb.from
    const to = r.back ? jb.from : jb.to
    switch (r.phase) {
      case 'parked': {
        r.activity = stopped ? (operating ? 'Parked, boom on rest (lifting suspended)' : 'Parked, boom on rest') : 'Parked, waiting for the next lift'
        if (stopped) {
          left = 0
          break
        }
        r.timer -= left
        if (r.timer > 0) {
          left = 0
          break
        }
        left = -r.timer
        r.phase = 'toPick'
        r.back = false
        logEvent(c.tag, `${c.tag} lift ${r.lifts + 1}: ${CARGO[jb.cargo].label} ${jb.load} t, ${jb.from.name} → ${jb.to.name}`, 'info')
        break
      }
      case 'toPick': {
        if (stopped) {
          r.phase = 'return'
          break
        }
        r.activity = `Slewing to the ${from.name}`
        const t = drive(r, d, poseAt(c, d, from, jb.cargo, 5), left)
        if (t < 0) left = 0
        else {
          left = t
          r.phase = 'lowerPick'
        }
        break
      }
      case 'lowerPick': {
        if (stopped) {
          r.phase = 'clear'
          break
        }
        r.activity = `Lowering the hook to the ${from.name}`
        const t = drive(r, d, poseAt(c, d, from, jb.cargo, 0), left)
        if (t < 0) left = 0
        else {
          left = t
          r.phase = 'hookOn'
          r.timer = T_HOOK_ON
        }
        break
      }
      case 'hookOn': {
        if (stopped) {
          r.phase = 'clear'
          break
        }
        r.activity = `Banksman / riggers hooking on (${CARGO[jb.cargo].label})`
        r.timer -= left
        if (r.timer > 0) left = 0
        else {
          left = -r.timer
          r.cargo = jb.cargo
          r.load = jb.load
          r.phase = 'hoist'
        }
        break
      }
      case 'hoist': {
        // loaded: keep going even when suspended, to land the load safely
        if (seaBad && isBoat(to) && !r.back) r.back = true // can't land on the boat: put it back on deck
        r.activity = `Hoisting the ${CARGO[jb.cargo].label} clear`
        const goal = Math.min(poseAt(c, d, from, r.cargo, 6).hook, tipHeight(d, r.luff) - 2.5)
        left = moveTo(r, 'hook', goal, RATE.hoistLoaded, left)
        if (Math.abs(r.hook - goal) < 1e-3) r.phase = 'travel'
        break
      }
      case 'travel': {
        if (seaBad && isBoat(to) && !r.back) r.back = true
        const dest = r.back ? jb.from : jb.to
        r.activity = `${r.back ? 'Returning' : 'Slewing'} the ${CARGO[jb.cargo].label} to the ${dest.name}${stopped ? ' (landing before suspending)' : ''}`
        const t = drive(r, d, poseAt(c, d, dest, r.cargo, 4), left)
        if (t < 0) left = 0
        else {
          left = t
          r.phase = 'lower'
        }
        break
      }
      case 'lower': {
        const dest = r.back ? jb.from : jb.to
        r.activity = `Landing the ${CARGO[jb.cargo].label} on the ${dest.name}`
        const t = drive(r, d, poseAt(c, d, dest, r.cargo, 0), left)
        if (t < 0) left = 0
        else {
          left = t
          r.phase = 'landed'
          r.timer = T_UNHOOK
        }
        break
      }
      case 'landed': {
        r.activity = 'Load landed, unhooking'
        r.timer -= left
        if (r.timer > 0) left = 0
        else {
          left = -r.timer
          const dest = r.back ? jb.from : jb.to
          logEvent(c.tag, `${c.tag} ${CARGO[jb.cargo].label} landed on the ${dest.name}${r.back ? ' (boat lift aborted)' : ''}`, 'info')
          r.cargo = null
          r.load = 0
          if (!r.back) r.lifts++
          r.back = false
          r.job = (r.job + 1) % c.jobs.length
          r.phase = 'clear'
        }
        break
      }
      case 'clear': {
        r.activity = 'Hook up, clear of the load'
        const tgt = Math.min(r.hook + 6, tipHeight(d, r.luff) - 2.5, 12)
        const t = moveTo(r, 'hook', Math.max(r.hook, tgt), RATE.hoistEmpty, left)
        left = t
        if (t > 0 || r.hook >= tgt - 1e-3) {
          // back to the rest after a full round of the schedule (or when stopped), else straight on
          if (stopped || r.job === 0) r.phase = 'return'
          else r.phase = 'toPick'
        }
        break
      }
      case 'return': {
        r.activity = stopped ? 'Boom to rest (lifting suspended)' : 'Boom to rest'
        const t = drive(r, d, parkedPose(c), left)
        if (t < 0) left = 0
        else {
          left = t
          r.phase = 'parked'
          r.timer = 180 + simRandom() * 240
        }
        break
      }
    }
  }
  r.radius = radiusAt(d, r.luff)
  r.state =
    r.state === 'suspended'
      ? 'suspended'
      : r.phase === 'landed'
        ? 'landed'
        : r.phase === 'parked' || r.phase === 'return'
          ? 'idle'
          : 'lifting'
  return r
}

// ---------------------------------------------------------------- alarms (P2 on an F&G engine shutdown)

export interface PluginAlarm {
  key: string
  tag: string
  text: string
  priority: AlarmPriority
  kind: 'equipment'
  platform: PlatformId
}
/** alarms the crane plugin holds active (an engine shut down by F&G until it is restarted) */
export function craneAlarms(): PluginAlarm[] {
  const out: PluginAlarm[] = []
  const cr = useCranes.getState().cranes
  for (const c of CRANES) {
    const r = cr[c.tag]
    if (r && !r.engine) out.push({ key: `${c.tag}:ENGINE`, tag: c.tag, text: `${c.tag} crane diesel engine shut down — ${r.reason ?? 'F&G'}`, priority: 2, kind: 'equipment', platform: c.platform })
  }
  return out
}
/** one-shot: use the engine's public alarm hook if it has one (else the lead wires `plugin.alarms`) */
function pushAlarm(c: CraneSite, text: string) {
  const raise = (engine as unknown as Record<string, unknown>).raiseAlarm
  if (typeof raise === 'function') {
    try {
      ;(raise as (a: PluginAlarm) => void)({ key: `${c.tag}:ENGINE`, tag: c.tag, text: `${c.tag} ${text}`, priority: 2, kind: 'equipment', platform: c.platform })
    } catch (e) {
      console.warn('[cranes] raiseAlarm failed', e)
    }
  }
}

export const cranePlugin: SimPlugin & { alarms: () => PluginAlarm[] } = {
  id: 'cranes',
  step: (dt) => {
    if (!(dt > 0)) return
    const s = useSim.getState() as Partial<SimState>
    const st = useCranes.getState()
    const next: Record<string, CraneRun> = {}
    for (const c of CRANES) next[c.tag] = stepCrane(st.cranes[c.tag] ?? initialRun(c, 0), c, dt, s, st.operating)
    useCranes.setState({ cranes: next })
  },
  reset: () => useCranes.getState().reset(),
  alarms: craneAlarms,
  value: (tag) => craneValue(tag),
}
registerSimPlugin(cranePlugin)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  w.__cranes = useCranes
  // the app's own instance of these (tools must not import the module again: HMR URLs give a second store)
  queueMicrotask(() => (w.__craneApi = { craneMetrics, craneValue, ventFlow, hazards }))
}

// ---------------------------------------------------------------- vents (flow per stack)

/** cold-vent flow through a stack, MMscfd: the engine's per-stack split if it has one, else
 *  Alpha = TEG still (C-5350 running), RP = the rest of `process.vent` (riser blowdown) */
export function ventFlow(tag: string): number {
  const p = (useSim.getState() as Partial<SimState>).process as (Partial<SimState['process']> & { ventByStack?: Record<string, number> }) | undefined
  const per = p?.ventByStack?.[tag]
  if (Number.isFinite(per)) return per as number
  const total = Number.isFinite(p?.vent) ? (p!.vent as number) : 0.05
  const alpha = Math.min(total, isRunning('C-5350') ? 0.05 : 0)
  if (tag === 'VS-A300') return alpha
  if (tag === 'VS-R300') return Math.max(0, total - alpha)
  return 0
}
/** exit velocity at the tip, m/s (gas at ~1 atm, 15 °C) */
export function ventVelocity(v: VentStack, q = ventFlow(v.tag)) {
  const id = v.od - 0.018
  return (q * 28316.8) / 86400 / (Math.PI * (id / 2) ** 2)
}

// ---------------------------------------------------------------- inspector metrics (wired by ui/metrics.ts)

interface CraneMetric {
  inst: Instrument
  label: string
  simulated: boolean
}
const met = (tag: string, key: string, label: string, unit: string, nominal: number, range: string, alarms?: Instrument['alarms']): CraneMetric => ({
  inst: { tag: `${tag}·${key}`, type: 'PT', on: { equipment: tag }, unit, nominal, range, alarms },
  label,
  simulated: true,
})
export const CRANE_STATE_CODE: Record<CraneState, number> = { idle: 0, lifting: 1, landed: 2, suspended: 3 }

/** Live metrics of a crane (CR-*) or vent stack (VS-*), or null for any other tag. */
export function craneMetrics(tag: string): CraneMetric[] | null {
  const c = CRANE_BY_TAG.get(tag)
  if (c) {
    const d = craneDims(c.spec)
    const rMax = Math.ceil(radiusAt(d, d.luffMin))
    return [
      met(tag, 'LOAD', 'Hook load', 't', 0, `0–${c.swl}`, { hi: c.swl * 0.9 }),
      met(tag, 'RAD', 'Working radius', 'm', 12, `0–${rMax}`),
      met(tag, 'UTIL', 'Load-moment utilisation (LMI)', '%', 0, '0–110', { hi: 90, hiHi: 100 }),
      met(tag, 'WIND', 'Wind (10 m)', 'm/s', 7, '0–40', { hi: CRANE_LIMITS.windPersonnel, hiHi: CRANE_LIMITS.windCargo }),
      met(tag, 'WTIP', 'Wind at boom tip (anemometer)', 'm/s', 8, '0–45'),
      met(tag, 'HS', 'Significant wave height', 'm', 1.5, '0–8', { hiHi: CRANE_LIMITS.hsBoat }),
      met(tag, 'STATE', 'State (0 idle · 1 lifting · 2 landed · 3 suspended · 4 engine off)', '', 0, '0–4', { hi: 3, hiHi: 4 }),
      met(tag, 'SLEW', 'Slew (boom bearing, deg true)', '°', 180, '0–360'),
    ]
  }
  const v = VENT_BY_TAG.get(tag)
  if (v) {
    return [
      met(tag, 'FLOW', 'Vent flow', 'MMscfd', 0.05, '0–60', { hi: 5 }),
      met(tag, 'VEL', 'Tip exit velocity', 'm/s', 1, '0–200'),
      met(tag, 'WIND', 'Wind at the tip', 'm/s', 7, '0–40'),
      met(tag, 'DIR', 'Plume drifts towards (deg true)', '°', 60, '0–360'),
    ]
  }
  return null
}

/** live value of a crane / vent metric instrument tag (`CR-A1·LOAD` …), or undefined if not ours */
export function craneValue(instTag: string): number | undefined {
  const i = instTag.indexOf('·')
  if (i < 0) return undefined
  const tag = instTag.slice(0, i)
  const key = instTag.slice(i + 1)
  const w = windNow()
  const c = CRANE_BY_TAG.get(tag)
  if (c) {
    const r = useCranes.getState().cranes[tag]
    if (!r) return undefined
    const d = craneDims(c.spec)
    switch (key) {
      case 'LOAD':
        return r.load
      case 'RAD':
        return r.radius
      case 'UTIL':
        return (100 * r.load) / ratedCapacity(c, r.radius)
      case 'WIND':
        return w.speed
      case 'WTIP':
        return windAt(w.speed, 28 + c.deckY + tipHeight(d, r.luff))
      case 'HS':
        return seaStateNow()
      case 'STATE':
        return r.engine ? CRANE_STATE_CODE[r.state] : 4
      case 'SLEW':
        // plan heading (from +x = east towards +z = south) → bearing from north, clockwise
        return (((r.slew * 180) / Math.PI + 90) % 360 + 360) % 360
    }
    return undefined
  }
  const v = VENT_BY_TAG.get(tag)
  if (v) {
    const q = ventFlow(tag)
    switch (key) {
      case 'FLOW':
        return q
      case 'VEL':
        return ventVelocity(v, q)
      case 'WIND':
        return windAt(w.speed, 28 + v.y + v.height)
      case 'DIR':
        return (w.from + 180) % 360
    }
  }
  return undefined
}

/** all stacks (for the panel) */
export const ventStacks = () => VENTS
