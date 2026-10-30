/**
 * Read-only agent tools over the twin (plan 04). The same names and parameter shapes are what a
 * tool-calling LLM (plan 09: Nemotron via Token Factory now, Muse Spark later) will call.
 *
 * Rules:
 *   - every `run()` returns PLAIN JSON (no functions, getters, class instances or cycles);
 *   - tools never act on the plant (no sim actions) — agents are advisory;
 *   - `runTool(name, args, traceId?)` is the single entry point planners use; with a trace id it
 *     writes a `tool` TraceStep (args, a short result summary, latency).
 *
 * Beyond lookups there are two "hard to spot" analyses that no single alarm shows:
 *   - `check_barrier_erosion`: per fire zone, counts the safety layers weakened at the same time
 *     (inhibited / faulted detectors, shelved alarms, degraded machines, a live hot-work permit, stuck
 *     ESD valves, gas present, wind that hurts) — Swiss-cheese alignment;
 *   - `check_sensor_drift`: model-driven sensors and machine condition signals creeping steadily
 *     towards their trip limit while still inside their alarm limits (linear fit over the last
 *     minutes-to-an-hour of sim time, R² gate, time-to-trip).
 */
import type { AgentTool, RiskContributor, TraceStep } from './types'
import { bandOf } from './types'
import type { Instrument } from '../model/types'
import type { PlatformId, SimState } from '../sim/types'
import { fmtClock } from '../sim/types'
import { instrumentHistory, procValue, runState, useSim } from '../state/sim'
import { usePlantStore } from '../state/plantStore'
import { useMaint, openWos, simopsBlock, SIGNALS, PERMIT_LABEL, ttfH } from '../sim/maintenance'
import { CE_BY_ID } from '../sim/causeEffect'
import { SCENARIOS, SCENARIO_BY_ID, type Scenario } from '../sim/scenarios'
import { detectors, fireZones, platformOfTag, tagPosition, zoneOfTag } from '../sim/fg'
import { metricsFor } from '../ui/metrics'
import { sample } from '../ui/live'
import { useRisk } from './risk'
import { useCctv, CAMERAS } from './cctv'
import { addTrace } from './alerts'
import { coverFor, useSpares } from '../sim/spares'
import { useFinance } from '../sim/finance'
import { assetRisks } from '../sim/assetRisk'
import { useInsights } from '../sim/insights'
import { UNIT_SPEC, UNITS, useInspection } from './inspection'
import { GRADE_RANK, useCorrosion, type CorrGrade } from './corrosion'

// ---------------------------------------------------------------- small helpers
const S = () => useSim.getState() as Partial<SimState> & { t: number }
const plant = () => usePlantStore.getState().plant
const r1 = (v: number, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v))
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
const FG_TYPES = new Set(['FD', 'GD', 'OGD', 'HD', 'SD', 'MAC'])
const PLATFORM_IDS: PlatformId[] = ['Alpha', 'WHP-N', 'RP', 'WI', 'LQ', 'Plant']
function asPlatform(v: unknown): PlatformId | undefined {
  const s = str(v).toLowerCase()
  if (!s) return undefined
  return PLATFORM_IDS.find((p) => p.toLowerCase() === s) ?? PLATFORM_IDS.find((p) => s.includes(p.toLowerCase()))
}
function platformOf(tag: string): PlatformId {
  try {
    return platformOfTag(plant(), tag)
  } catch {
    return 'Alpha'
  }
}
function zoneIdOf(tag: string): string | null {
  try {
    return zoneOfTag(plant(), tag)?.id ?? null
  } catch {
    return null
  }
}
const zoneNameOf = (id: string | null | undefined) => (id ? fireZones(plant()).find((z) => z.id === id)?.name ?? id : null)

type Limits = NonNullable<Instrument['alarms']>
/** where a value sits against its alarm limits */
export function limitState(v: number, a: Limits | undefined): 'hiHi' | 'hi' | 'lo' | 'loLo' | 'normal' {
  if (!a || !Number.isFinite(v)) return 'normal'
  if (a.hiHi !== undefined && v >= a.hiHi) return 'hiHi'
  if (a.loLo !== undefined && v <= a.loLo) return 'loLo'
  if (a.hi !== undefined && v >= a.hi) return 'hi'
  if (a.lo !== undefined && v <= a.lo) return 'lo'
  return 'normal'
}
const plainLimits = (a: Instrument['alarms']) => (a ? { lo: a.lo ?? null, hi: a.hi ?? null, loLo: a.loLo ?? null, hiHi: a.hiHi ?? null } : null)

function instValue(inst: Instrument): number {
  try {
    return sample(inst, S().t)
  } catch {
    return instrumentHistory(inst.tag, 1)[0] ?? inst.nominal
  }
}
function instHost(inst: Instrument): string | undefined {
  if ('equipment' in inst.on) return inst.on.equipment
  const l = plant().lines.find((x) => x.tag === (inst.on as { line: string }).line)
  if (!l) return undefined
  const ends = [l.from, l.to].filter((e) => 'equipment' in e).map((e) => (e as { equipment: string }).equipment)
  return ends[0]
}

// ---------------------------------------------------------------- risk (live engine, or a small fallback)
const SD_POINTS: Record<string, number> = { USD: 10, PSD: 20, ESD2: 35, ESD1: 50, APS: 70 }
/** fallback estimate used only while the risk engine (plan 02) has not produced a snapshot */
function fallbackRisk(platform: PlatformId) {
  const s = S()
  const c: Omit<RiskContributor, 'platform'>[] = []
  for (const sd of s.shutdowns ?? []) if (!sd.resetAt && (sd.platform === platform || sd.level === 'APS')) c.push({ id: `sd:${sd.id}`, category: 'shutdown', text: `${sd.level} latched: ${sd.cause}`, points: SD_POINTS[sd.level] ?? 20 })
  const zones = fireZones(plant()).filter((z) => z.platform === platform)
  for (const z of zones) {
    const st = s.fg?.[z.id]
    if (!st) continue
    const p = st.gas === 'confirmed' ? 60 : st.gas === 'high' ? 30 : st.gas === 'low' ? 15 : 0
    if (p) c.push({ id: `gas:${z.id}`, category: 'fireGas', text: `Gas ${st.gas} in ${z.name}`, points: p })
    const f = st.fire === 'confirmed' ? 80 : st.fire === 'single' ? 35 : 0
    if (f) c.push({ id: `fire:${z.id}`, category: 'fireGas', text: `Fire ${st.fire} in ${z.name}`, points: f })
  }
  const unack = (s.alarms ?? []).filter((a) => a.platform === platform && a.state === 'unack')
  const ap = Math.min(25, unack.reduce((n, a) => n + (a.priority === 1 ? 8 : a.priority === 2 ? 3 : 1), 0))
  if (ap) c.push({ id: 'alarms', category: 'alarms', text: `${unack.length} unacknowledged alarm(s)`, points: ap })
  for (const [tag, h] of Object.entries(useMaint.getState().health ?? {})) {
    if (h.stage === 'normal' || platformOf(tag) !== platform) continue
    c.push({ id: `cm:${tag}`, category: 'machinery', tag, text: `${tag} condition ${h.stage}`, points: h.stage === 'failed' ? 10 : h.stage === 'alarm' ? 8 : 4 })
  }
  const inh = Object.entries(s.inhibits ?? {}).filter(([t, on]) => on && platformOf(t) === platform)
  if (inh.length) c.push({ id: 'inhibits', category: 'barriers', text: `${inh.length} detector(s) inhibited`, points: Math.min(15, inh.length * 5) })
  c.sort((a, b) => b.points - a.points)
  const score = Math.min(100, c.reduce((n, x) => n + x.points, 0))
  return { platform, score, band: bandOf(score), contributors: c.map((x) => ({ ...x, platform })) }
}

// ---------------------------------------------------------------- slow drift
interface Ring {
  t: number[]
  v: number[]
}
const rings = new Map<string, Ring>()
const DRIFT_SAMPLE_S = 20
const DRIFT_KEEP_S = 2 * 3600
let lastSampleT = -Infinity

interface DriftSource {
  tag: string
  label: string
  unit: string
  host?: string
  limits: Limits
  value: () => number | undefined
  /** only meaningful while this holds (e.g. the machine runs) */
  live?: () => boolean
}
function driftSources(): DriftSource[] {
  const out: DriftSource[] = []
  const p = plant()
  // instruments the dynamic model drives (historian-only tags are periodic and never drift)
  for (const inst of p.instruments) {
    if (FG_TYPES.has(inst.type) || !inst.alarms) continue
    let v: number | undefined
    try {
      v = procValue(inst.tag)
    } catch {
      v = undefined
    }
    if (v === undefined) continue
    out.push({ tag: inst.tag, label: `${inst.type} ${inst.tag}`, unit: inst.unit, host: instHost(inst), limits: inst.alarms, value: () => procValue(inst.tag) })
  }
  // machine condition-monitoring signals (vibration, bearing temperature, machine-specific)
  for (const [tag, h] of Object.entries(useMaint.getState().health ?? {})) {
    const specs = SIGNALS[h.cls]
    if (!specs) continue
    specs.forEach((sp, i) => {
      const falling = sp.alert < sp.n
      out.push({
        tag: `${tag}·CM${sp.key}`,
        label: `${tag} ${sp.label}`,
        unit: sp.unit,
        host: tag,
        limits: falling ? { lo: sp.alert, loLo: sp.alarm } : { hi: sp.alert, hiHi: sp.alarm },
        value: () => useMaint.getState().health[tag]?.sig[i],
        live: () => runState(tag) === 'running',
      })
    })
  }
  return out
}

/** sample drift candidates every DRIFT_SAMPLE_S sim seconds (called from the alerts plugin step) */
export function recordDriftSamples(t: number) {
  if (t < lastSampleT) {
    rings.clear()
    lastSampleT = -Infinity
  }
  if (t - lastSampleT < DRIFT_SAMPLE_S) return
  lastSampleT = t
  for (const src of driftSources()) {
    if (src.live && !src.live()) {
      rings.delete(src.tag)
      continue
    }
    const v = src.value()
    if (v === undefined || !Number.isFinite(v)) continue
    let r = rings.get(src.tag)
    if (!r) rings.set(src.tag, (r = { t: [], v: [] }))
    r.t.push(t)
    r.v.push(v)
    while (r.t.length && r.t[0] < t - DRIFT_KEEP_S) {
      r.t.shift()
      r.v.shift()
    }
  }
}

export interface DriftResult {
  /** fitted slope, units per hour */
  ratePerHour: number
  r2: number
  windowMin: number
  value: number
  limit: number
  limitName: 'HH trip' | 'LL trip'
  minutesToTrip: number
  minutesToAlarm: number | null
}
/**
 * Pure drift test: is the series heading steadily to a trip limit while still inside its alarm
 * limits? `samples` oldest first, t in seconds. Returns null when it is not a drift.
 */
export function driftOf(samples: { t: number; v: number }[], limits: Limits, opts: { minWindowS?: number; maxWindowS?: number; horizonS?: number; minR2?: number } = {}): DriftResult | null {
  const { minWindowS = 300, maxWindowS = 3600, horizonS = 2 * 3600, minR2 = 0.6 } = opts
  // try the most recent trend first (a ramp that started minutes ago is diluted in a 1-hour fit)
  for (const w of [minWindowS, minWindowS * 2, minWindowS * 4, maxWindowS]) {
    if (w > maxWindowS) continue
    const r = driftFit(samples, limits, w, minWindowS, horizonS, minR2)
    if (r) return r
  }
  return null
}
function driftFit(samples: { t: number; v: number }[], limits: Limits, maxWindowS: number, minWindowS: number, horizonS: number, minR2: number): DriftResult | null {
  if (samples.length < 8) return null
  const tEnd = samples[samples.length - 1].t
  const w = samples.filter((s) => s.t >= tEnd - maxWindowS)
  if (w.length < 8) return null
  const span = w[w.length - 1].t - w[0].t
  if (span < minWindowS * 0.9) return null
  const n = w.length
  const mt = w.reduce((a, s) => a + s.t, 0) / n
  const mv = w.reduce((a, s) => a + s.v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const s of w) {
    sxy += (s.t - mt) * (s.v - mv)
    sxx += (s.t - mt) ** 2
    syy += (s.v - mv) ** 2
  }
  if (sxx <= 0 || syy <= 0) return null
  const slope = sxy / sxx
  const r2 = (sxy * sxy) / (sxx * syy)
  if (r2 < minR2) return null
  const value = w[n - 1].v
  const fitNow = mv + slope * (tEnd - mt)
  // still inside the alarm limits
  if (limitState(value, limits) !== 'normal') return null
  let limit: number | undefined
  let alarm: number | undefined
  let name: DriftResult['limitName']
  if (slope > 0 && limits.hiHi !== undefined) {
    limit = limits.hiHi
    alarm = limits.hi
    name = 'HH trip'
  } else if (slope < 0 && limits.loLo !== undefined) {
    limit = limits.loLo
    alarm = limits.lo
    name = 'LL trip'
  } else return null
  const toTripS = (limit - fitNow) / slope
  if (!(toTripS > 0) || toTripS > horizonS) return null
  // the move over the window must be material, not a flat line with a tiny tilt
  const moved = Math.abs(slope * span)
  if (moved < Math.max(1e-6, Math.abs(limit) * 0.005)) return null
  const toAlarmS = alarm !== undefined ? (alarm - fitNow) / slope : null
  return {
    ratePerHour: Number((slope * 3600).toPrecision(3)),
    r2: Math.round(r2 * 100) / 100,
    windowMin: Math.round(span / 6) / 10,
    value: Number(value.toPrecision(4)),
    limit,
    limitName: name,
    minutesToTrip: Math.round(toTripS / 6) / 10,
    minutesToAlarm: toAlarmS !== null && toAlarmS > 0 ? Math.round(toAlarmS / 6) / 10 : null,
  }
}

export interface DriftFinding extends DriftResult {
  tag: string
  label: string
  unit: string
  host?: string
  platform: PlatformId
  actions: string[]
}
/** drifting sensors right now (optionally around one tag / platform), worst first */
export function sensorDrift(args: { tag?: string; platform?: PlatformId }): DriftFinding[] {
  const out: DriftFinding[] = []
  const s = S()
  // a platform that is shut down is SUPPOSED to move towards its trips (blowdown, cooling, depressuring):
  // those are consequences, not precursors
  const down = new Set<PlatformId>()
  for (const sd of s.shutdowns ?? []) if (sd.level !== 'USD') down.add(sd.level === 'APS' ? 'Alpha' : sd.platform)
  if ((s.shutdowns ?? []).some((x) => x.level === 'APS')) for (const pl of PLATFORM_IDS) down.add(pl)
  const eq = new Set(plant().equipment.map((e) => e.tag))
  for (const src of driftSources()) {
    if (args.tag && src.tag !== args.tag && src.host !== args.tag) continue
    const r = rings.get(src.tag)
    if (!r) continue
    if (src.host && eq.has(src.host) && runState(src.host) !== 'running') continue
    const d = driftOf(
      r.t.map((t, i) => ({ t, v: r.v[i] })),
      src.limits,
    )
    if (!d) continue
    const platform = platformOf(src.host ?? src.tag)
    if (args.platform && platform !== args.platform) continue
    if (down.has(platform)) continue
    const isCm = src.tag.includes('·CM')
    out.push({
      ...d,
      tag: src.tag,
      label: src.label,
      unit: src.unit,
      host: src.host,
      platform,
      actions: isCm
        ? [`Plan a changeover from ${src.host} to its standby before it reaches the trip`, `Raise a condition-based work order for ${src.host}`, 'Check lube oil / cooling to the bearing']
        : [`Find what is moving ${src.tag}: compare inflow / outflow, controller output and valve positions around ${src.host ?? src.tag}`, `Correct before the ${d.limitName} at ${d.limit} ${src.unit} (~${Math.round(d.minutesToTrip)} min)`, 'Do not raise the alarm limit to make it go away'],
    })
  }
  return out.sort((a, b) => a.minutesToTrip - b.minutesToTrip)
}

// ---------------------------------------------------------------- barrier erosion
export type BarrierLayer = 'detection' | 'alarms' | 'machinery' | 'ignition' | 'isolation' | 'hydrocarbon' | 'weather'
export interface ErosionFinding {
  zone: string
  zoneName: string
  platform: PlatformId
  layers: { layer: BarrierLayer; text: string; tags: string[] }[]
  /** three or more layers weakened at once */
  aligned: boolean
  tags: string[]
  actions: string[]
}
/** crane personnel-transfer wind limit (model/cranes.ts) — above it, lifts and dropped-object risk rise */
const WIND_HIGH = 13
/** below this natural ventilation of open modules is poor (gas accumulates) */
const WIND_CALM = 2

export function barrierErosion(args: { zone?: string; platform?: PlatformId }): ErosionFinding[] {
  const s = S()
  const p = plant()
  const zones = fireZones(p)
  const by = new Map<string, ErosionFinding['layers']>()
  const add = (zone: string | null | undefined, layer: BarrierLayer, text: string, tags: string[]) => {
    if (!zone) return
    let L = by.get(zone)
    if (!L) by.set(zone, (L = []))
    const cur = L.find((x) => x.layer === layer)
    if (cur) {
      cur.tags = [...new Set([...cur.tags, ...tags])]
      cur.text = `${cur.text.split(' (+')[0]} (+${cur.tags.length - 1} more)`
    } else L.push({ layer, text, tags })
  }
  // detection: inhibited or faulted F&G detectors
  for (const d of detectors(p)) {
    const st = s.detectors?.[d.tag]?.state
    const inh = !!s.inhibits?.[d.tag] || (!!d.rxTag && !!s.inhibits?.[d.rxTag]) || st === 'inhibited'
    if (inh || st === 'fault') add(d.zone, 'detection', `${d.type} ${d.tag} ${inh ? 'inhibited' : 'faulted'}: out of the voting`, [d.tag])
  }
  // alarms: shelved alarms in the zone
  for (const a of s.alarms ?? []) {
    if (a.state !== 'shelved') continue
    add(a.zone ?? zoneIdOf(a.tag), 'alarms', `Alarm ${a.tag} shelved (${a.text})`, [a.tag])
  }
  // machinery: degraded condition
  for (const [tag, h] of Object.entries(useMaint.getState().health ?? {})) {
    if (h.stage === 'normal') continue
    add(zoneIdOf(tag), 'machinery', `${tag} condition ${h.stage} (degradation ${Math.round(h.degr * 100)} %${h.mode ? `, ${h.mode}` : ''})`, [tag])
  }
  // ignition: live hot-work permits
  for (const pm of Object.values(useMaint.getState().permits ?? {})) {
    if (pm.type !== 'hot' || pm.status !== 'issued') continue
    add(zoneIdOf(pm.tag), 'ignition', `Hot-work permit ${pm.id} live on ${pm.tag}`, [pm.tag])
  }
  // isolation: stuck ESD / control valves
  for (const [tag, v] of Object.entries(s.valves ?? {})) if (v.fault === 'stuck') add(zoneIdOf(tag), 'isolation', `${tag} stuck: will not stroke on demand`, [tag])
  // hydrocarbon: gas present below confirmation
  for (const z of Object.values(s.fg ?? {})) if (z.gas === 'low' || z.gas === 'high') add(z.zone, 'hydrocarbon', `Gas at ${z.gas} setpoint in the zone`, [])

  const wind = s.knobs?.wind
  const out: ErosionFinding[] = []
  for (const [zone, layers0] of by) {
    const z = zones.find((x) => x.id === zone)
    if (!z) continue
    if (args.zone && args.zone !== zone) continue
    if (args.platform && z.platform !== args.platform) continue
    const layers = [...layers0]
    // weather only aggravates a zone that already has a weakened layer
    if (wind && z.kind !== 'lq' && z.kind !== 'module') {
      if (wind.speed >= WIND_HIGH) layers.push({ layer: 'weather', text: `Wind ${wind.speed.toFixed(0)} m/s ≥ ${WIND_HIGH} m/s (personnel-lift limit): sparks and gas carried downwind, lifts restricted`, tags: [] })
      else if (wind.speed <= WIND_CALM && (z.kind === 'process' || z.kind === 'wellbay')) layers.push({ layer: 'weather', text: `Near-calm wind ${wind.speed.toFixed(1)} m/s: poor natural ventilation, gas can accumulate`, tags: [] })
    }
    const kinds = new Set(layers.map((l) => l.layer))
    const tags = [...new Set(layers.flatMap((l) => l.tags))]
    const actions: string[] = []
    if (kinds.has('ignition')) actions.push(`Suspend the hot work in ${z.name} until the other barriers are restored`)
    if (kinds.has('detection')) actions.push('Restore the inhibited / faulted detectors, or post a fire watch with a portable detector')
    if (kinds.has('alarms')) actions.push('Unshelve the alarms in the zone, or review why they are shelved')
    if (kinds.has('machinery')) actions.push('Change over the degraded machine(s) to standby and raise a work order')
    if (kinds.has('isolation')) actions.push('Raise a priority work order for the stuck valve; confirm an alternative isolation')
    if (kinds.has('hydrocarbon')) actions.push('Find and isolate the gas source before any other work')
    if (kinds.has('weather')) actions.push('Apply the weather limits (lifts, work at height); re-check the gas dispersion direction')
    out.push({ zone, zoneName: z.name, platform: z.platform, layers, aligned: kinds.size >= 3, tags, actions })
  }
  return out.sort((a, b) => b.layers.length - a.layers.length)
}

// ---------------------------------------------------------------- scenarios / what-if
type WhatIfMod = { predictConsequence?: (sc: Scenario) => unknown }
const whatifMods = import.meta.glob<WhatIfMod>('./whatif.ts', { eager: true })
function predict(sc: Scenario): unknown {
  const fn = Object.values(whatifMods)[0]?.predictConsequence
  if (typeof fn !== 'function') return null
  try {
    return JSON.parse(JSON.stringify(fn(sc)))
  } catch {
    return null
  }
}
const STOP = new Set(['what', 'happens', 'happen', 'would', 'trips', 'trip', 'tripped', 'fails', 'fail', 'if', 'the', 'a', 'an', 'when', 'and', 'with', 'there', 'about', 'tell'])
function scoreScenario(sc: Scenario, q: string, tag?: string) {
  let n = 0
  if (tag) {
    if (sc.requires?.tags?.includes(tag)) n += 6
    if (sc.title.includes(tag) || sc.summary.includes(tag)) n += 4
    if (sc.briefing.some((b) => b.includes(tag)) || sc.expected.some((b) => b.includes(tag))) n += 2
  }
  const words = q
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
  const hay = `${sc.title} ${sc.summary} ${sc.category}`.toLowerCase()
  for (const w of words) if (hay.includes(w)) n += 1
  return n
}

// ---------------------------------------------------------------- the tools
function p(type: 'string' | 'number' | 'boolean', description: string, required = false) {
  return { type, description, required }
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_field_status',
    description: 'Field production and status now: oil / gas export, flare, production efficiency, availability, latched shutdowns, general alarm per platform.',
    params: {},
    run: () => {
      const s = S()
      const r = s.result
      const platforms: Record<string, unknown> = {}
      for (const [pk, pr] of Object.entries(r?.platforms ?? {})) if (pr) platforms[pk] = { online: pr.online, shutdown: pr.shutdown, ga: pr.ga, oil: Math.round(pr.oil), gas: r1(pr.gas, 1) }
      return {
        time: fmtClock(s.t),
        oilExportBpd: r ? Math.round(r.oilExport) : null,
        gasExportMMscfd: r ? r1(r.gasExport, 1) : null,
        flareMMscfd: r ? r1(r.flare, 2) : null,
        efficiencyPct: r ? r1(r.efficiency, 0) : null,
        pePct: r1(s.kpis?.pe ?? NaN, 1),
        availabilityPct: r1(s.kpis?.availability ?? NaN, 1),
        constraints: (r?.constraints ?? []).slice(0, 3).map((c) => ({ text: c.text, boe: Math.round(c.boe) })),
        shutdowns: (s.shutdowns ?? []).filter((x) => !x.resetAt).map((x) => ({ id: x.id, level: x.level, platform: x.platform, zone: x.zone ?? null, cause: x.cause, since: fmtClock(x.at) })),
        alarmRatePer10min: s.kpis?.alarmRate ?? 0,
        platforms,
      }
    },
  },
  {
    name: 'get_risk',
    description: 'Live risk score (0-100), band and top 5 contributors, for the field or one platform.',
    params: { platform: p('string', 'Platform id: Alpha, WHP-N, RP, WI or LQ (omit for the whole field)') },
    run: (args) => {
      const plat = asPlatform(args.platform)
      const now = useRisk.getState().now
      const fromEngine = !!now?.platforms
      const one = (pl: PlatformId) => {
        const pr = now?.platforms?.[pl] ?? (fromEngine ? undefined : fallbackRisk(pl))
        if (!pr) return { platform: pl, score: 0, band: 'low', contributors: [] }
        return { platform: pl, score: Math.round(pr.score), band: pr.band, contributors: (pr.contributors ?? []).slice(0, 5).map((c) => ({ text: c.text, points: Math.round(c.points), category: c.category, tag: c.tag ?? null })) }
      }
      if (plat) return { source: fromEngine ? 'risk-engine' : 'fallback-estimate', ...one(plat) }
      const pl = (['Alpha', 'WHP-N', 'RP', 'WI', 'LQ'] as PlatformId[]).map(one)
      const worst = pl.reduce((a, b) => (b.score > a.score ? b : a), pl[0])
      return {
        source: fromEngine ? 'risk-engine' : 'fallback-estimate',
        field: fromEngine ? Math.round(now!.field) : worst.score,
        band: fromEngine ? now!.band : bandOf(worst.score),
        platforms: pl.map((x) => ({ platform: x.platform, score: x.score, band: x.band })),
        contributors: fromEngine ? (now!.contributors ?? []).slice(0, 5).map((c) => ({ text: c.text, points: Math.round(c.points), platform: c.platform, category: c.category, tag: c.tag ?? null })) : pl.flatMap((x) => x.contributors.map((c) => ({ ...c, platform: x.platform }))).sort((a, b) => b.points - a.points).slice(0, 5),
      }
    },
  },
  {
    name: 'get_alarms',
    description: 'Active (not shelved) alarms, newest first: tag, text, priority, value, age.',
    params: { priority: p('number', 'Only this priority (1, 2 or 3)'), platform: p('string', 'Only this platform'), tag: p('string', 'Only alarms on this tag / mentioning it') },
    run: (args) => {
      const s = S()
      const pr = num(args.priority)
      const plat = asPlatform(args.platform)
      const tag = str(args.tag)
      const list = (s.alarms ?? []).filter((a) => a.active && a.state !== 'shelved' && (!Number.isFinite(pr) || a.priority === pr) && (!plat || a.platform === plat) && (!tag || a.tag === tag || a.text.includes(tag)))
      return {
        count: list.length,
        byPriority: [1, 2, 3].map((n) => list.filter((a) => a.priority === n).length),
        shelved: (s.alarms ?? []).filter((a) => a.state === 'shelved').length,
        alarms: list.slice(0, 25).map((a) => ({ tag: a.tag, text: a.text, priority: a.priority, platform: a.platform, zone: a.zone ?? null, value: a.value ?? null, state: a.state, ageS: Math.round(s.t - a.raisedAt), raised: fmtClock(a.raisedAt) })),
      }
    },
  },
  {
    name: 'get_equipment',
    description: 'One equipment item: name, kind, run state, machine health, live metrics against limits, fire zone, open work orders, lock-outs, instruments on it.',
    params: { tag: p('string', 'Equipment tag, e.g. K-2200', true) },
    run: (args) => {
      const tag = str(args.tag)
      const pl = plant()
      const e = pl.equipment.find((x) => x.tag === tag)
      const v = pl.valves.find((x) => x.tag === tag)
      if (!e && !v) return { error: `No equipment or valve ${tag}` }
      const s = S()
      const h = useMaint.getState().health?.[tag]
      let metrics: unknown[] = []
      const instruments: string[] = []
      try {
        metrics = metricsFor(pl, tag, 8).map((m) => {
          const val = instValue(m.inst)
          const lim = m.inst.alarms
          if (!m.simulated) instruments.push(m.inst.tag)
          return { label: m.label, tag: m.inst.tag, unit: m.inst.unit, value: r1(val, 2), limits: plainLimits(lim), state: limitState(val, lim), simulated: m.simulated }
        })
      } catch {
        /* metrics optional */
      }
      const zone = zoneIdOf(tag)
      const ms = s.machines?.[tag]
      const vs = s.valves?.[tag]
      return {
        tag,
        name: e?.name ?? `${v!.type} valve on ${v!.line}`,
        kind: e?.kind ?? `valve:${v!.type}`,
        system: e?.system ?? null,
        platform: platformOf(tag),
        zone,
        zoneName: zoneNameOf(zone),
        runState: e ? runState(tag) : null,
        tripCause: ms?.tripCause ?? null,
        valve: vs ? { position: Math.round(vs.pos * 100), command: vs.cmd, fault: vs.fault ?? null, by: vs.by ?? null } : null,
        health: h ? { stage: h.stage, degradationPct: Math.round(h.degr * 100), mode: h.mode ?? null, timeToFailureH: (() => { const x = ttfH(h); return x === null ? null : r1(x, 1) })() } : null,
        lockout: s.lockouts?.[tag] ? { by: s.lockouts[tag].by, planned: s.lockouts[tag].planned } : null,
        openWorkOrders: openWos(tag).map((w) => ({ id: w.id, title: w.title, status: w.status, priority: w.priority, permit: w.permit ?? null })),
        metrics,
        instruments,
      }
    },
  },
  {
    name: 'get_sensor',
    description: 'One instrument: value now, unit, alarm limits, state, last 30 samples, min / max, and drift if any.',
    params: { tag: p('string', 'Instrument tag, e.g. LT-1101', true) },
    run: (args) => {
      const tag = str(args.tag)
      const inst = plant().instruments.find((x) => x.tag === tag)
      if (!inst) return { error: `No instrument ${tag}` }
      const v = instValue(inst)
      const hist = instrumentHistory(tag, 30)
      const drift = sensorDrift({ tag })[0]
      return {
        tag,
        type: inst.type,
        on: instHost(inst) ?? null,
        platform: platformOf(tag),
        zone: zoneIdOf(tag),
        unit: inst.unit,
        value: r1(v, 2),
        nominal: inst.nominal,
        limits: plainLimits(inst.alarms),
        state: limitState(v, inst.alarms),
        min: hist.length ? r1(Math.min(...hist), 2) : null,
        max: hist.length ? r1(Math.max(...hist), 2) : null,
        last30: hist.map((x) => r1(x, 2)),
        drift: drift ? { ratePerHour: drift.ratePerHour, minutesToTrip: drift.minutesToTrip, limit: drift.limit, r2: drift.r2 } : null,
      }
    },
  },
  {
    name: 'get_fire_gas',
    description: 'Fire & gas: zone states (gas / fire / smoke / deluge), detectors at low or high, inhibited and faulted detectors. Optionally one zone.',
    params: { zone: p('string', 'Fire zone id, e.g. A-P-SEP'), platform: p('string', 'Only zones of this platform') },
    run: (args) => {
      const s = S()
      const pl = plant()
      const zone = str(args.zone)
      const plat = asPlatform(args.platform)
      const zs = fireZones(pl).filter((z) => (!zone || z.id === zone) && (!plat || z.platform === plat))
      const zoneSet = new Set(zs.map((z) => z.id))
      const det = detectors(pl).filter((d) => d.zone && zoneSet.has(d.zone))
      const reading = (tag: string) => s.detectors?.[tag]
      const abnormal = zs
        .map((z) => ({ z, st: s.fg?.[z.id] }))
        .filter(({ st }) => zone || (st && (st.gas !== 'normal' || st.fire !== 'normal' || st.smoke !== 'normal' || st.deluge)))
        .map(({ z, st }) => ({ zone: z.id, name: z.name, platform: z.platform, gas: st?.gas ?? 'normal', fire: st?.fire ?? 'normal', smoke: st?.smoke ?? 'normal', deluge: st?.deluge ?? false, highCount: st?.highCount ?? 0 }))
      return {
        zonesChecked: zs.length,
        zones: abnormal,
        detectorsInAlarm: det
          .filter((d) => ['low', 'high'].includes(reading(d.tag)?.state ?? ''))
          .map((d) => ({ tag: d.tag, type: d.type, zone: d.zone, value: r1(reading(d.tag)!.value, 1), state: reading(d.tag)!.state }))
          .slice(0, 20),
        inhibited: det.filter((d) => s.inhibits?.[d.tag] || reading(d.tag)?.state === 'inhibited').map((d) => ({ tag: d.tag, type: d.type, zone: d.zone })),
        faulted: det.filter((d) => reading(d.tag)?.state === 'fault').map((d) => ({ tag: d.tag, type: d.type, zone: d.zone })),
        wind: s.knobs?.wind ? { fromDeg: s.knobs.wind.from, speedMs: s.knobs.wind.speed } : null,
      }
    },
  },
  {
    name: 'get_shutdown_cause',
    description: 'Latched shutdowns on a platform with the cause & effect row, whether the cause has cleared (resettable) and what blocks a reset.',
    params: { platform: p('string', 'Platform id (default Alpha)') },
    run: (args) => {
      const plat = asPlatform(args.platform) ?? 'Alpha'
      const s = S()
      const list = (s.shutdowns ?? []).filter((x) => x.platform === plat || x.level === 'APS')
      return {
        platform: plat,
        shutdowns: list.map((x) => {
          const ce = CE_BY_ID[x.causeId]
          return {
            id: x.id,
            level: x.level,
            zone: x.zone ?? null,
            cause: x.cause,
            causeId: x.causeId,
            since: fmtClock(x.at),
            reset: x.resetAt !== undefined ? fmtClock(x.resetAt) : null,
            resettable: x.resettable,
            loss: x.loss,
            causeEffect: ce ? { cause: ce.cause, level: ce.level, scope: ce.scope, effects: ce.effects } : null,
          }
        }),
        note: list.length ? 'Reset only once the cause has cleared; then restart the platform.' : `No latched shutdown on ${plat}.`,
      }
    },
  },
  {
    name: 'get_cameras',
    description: 'CCTV cameras that watch a tag (or a platform) and their current detections (PPE, flame, gas cloud).',
    params: { tag: p('string', 'Plant tag the camera should see'), platform: p('string', 'Platform id') },
    run: (args) => {
      const tag = str(args.tag)
      const plat = asPlatform(args.platform)
      const cams = Array.isArray(CAMERAS) ? CAMERAS : []
      const cc = useCctv.getState()
      let pos: [number, number, number] | null = null
      try {
        pos = tag ? tagPosition(plant(), tag) : null
      } catch {
        pos = null
      }
      const tagPlat = tag ? platformOf(tag) : plat
      const list = cams
        .map((c) => {
          const tgt = [c.target[0], c.target[1] - 28, c.target[2]]
          const dist = pos ? Math.hypot(tgt[0] - pos[0], tgt[2] - pos[2]) : null
          return { c, dist }
        })
        .filter(({ c, dist }) => (!tagPlat || c.platform === tagPlat) && (dist === null || dist < 30))
        .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0))
        .slice(0, 4)
      return {
        available: cams.length > 0,
        cameras: list.map(({ c, dist }) => ({
          id: c.id,
          name: c.name,
          platform: c.platform,
          distanceM: dist !== null ? Math.round(dist) : null,
          detections: (cc.live?.[c.id] ?? []).map((d) => ({ kind: d.kind, confidence: r1(d.confidence, 2), worker: d.workerId ?? null })),
        })),
        recentViolations: (cc.log ?? []).slice(0, 5).map((d) => ({ camera: d.camera, kind: d.kind, at: fmtClock(d.t) })),
      }
    },
  },
  {
    name: 'get_permits',
    description: 'Permits to work (requested / issued / suspended) by type and platform, and SIMOPS conflicts that block them now.',
    params: { platform: p('string', 'Only this platform') },
    run: (args) => {
      const plat = asPlatform(args.platform)
      const all = Object.values(useMaint.getState().permits ?? {}).filter((x) => x.status !== 'closed' && (!plat || x.platform === plat))
      const conflicts: { permit: string; type: string; platform: string; reason: string }[] = []
      for (const pm of all) {
        if (pm.status !== 'issued' && pm.status !== 'requested') continue
        const why = simopsBlock(pm.type, pm.platform)
        if (why) conflicts.push({ permit: pm.id, type: PERMIT_LABEL[pm.type], platform: pm.platform, reason: why })
      }
      const plats: PlatformId[] = plat ? [plat] : ['Alpha', 'WHP-N', 'RP', 'WI', 'LQ']
      return {
        permits: all.map((x) => ({ id: x.id, type: PERMIT_LABEL[x.type], status: x.status, platform: x.platform, tag: x.tag, zone: zoneIdOf(x.tag), issued: x.issuedAt !== undefined ? fmtClock(x.issuedAt) : null })),
        conflicts,
        hotWorkAllowedNow: Object.fromEntries(plats.map((pl) => [pl, simopsBlock('hot', pl) ?? 'yes'])),
      }
    },
  },
  {
    name: 'find_scenarios',
    description: 'Find training scenarios matching a question or a tag (for what-if questions).',
    params: { query: p('string', 'Words from the question'), tag: p('string', 'Plant tag involved') },
    run: (args) => {
      const q = str(args.query)
      const tag = str(args.tag) || undefined
      const ranked = SCENARIOS.map((sc) => ({ sc, n: scoreScenario(sc, q, tag) }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
      return { matches: ranked.map(({ sc, n }) => ({ id: sc.id, title: sc.title, category: sc.category, summary: sc.summary, score: n })) }
    },
  },
  {
    name: 'get_scenario_consequence',
    description: 'Predicted consequence of a scenario: chain of events, worst shutdown, deferred production, barriers (what-if).',
    params: { scenarioId: p('string', 'Scenario id, e.g. export-pump-standby', true) },
    run: (args) => {
      const id = str(args.scenarioId)
      const sc = SCENARIO_BY_ID[id] ?? SCENARIOS.find((x) => x.id === id)
      if (!sc) return { error: `No scenario ${id}` }
      const pred = predict(sc)
      return {
        id: sc.id,
        title: sc.title,
        summary: sc.summary,
        predicted: pred !== null,
        consequence: pred,
        expected: sc.expected,
        idealDeferredBoe: sc.ideal.deferredBoe,
        timeline: sc.timeline.slice(0, 8).map((st) => {
          const x = st as unknown as { at?: number; label?: string; id?: string }
          return { at: x.at ?? null, text: x.label ?? x.id ?? '' }
        }),
      }
    },
  },
  {
    name: 'get_events',
    description: 'Recent events touching a tag (engine event log, maintenance log, operator actions), newest first.',
    params: { tag: p('string', 'Plant tag (omit for everything)'), limit: p('number', 'Max events (default 15)') },
    run: (args) => {
      const tag = str(args.tag)
      const limit = Math.min(40, Math.max(1, num(args.limit) || 15))
      const s = S()
      const ev: { t: number; at: string; source: string; text: string; level?: string }[] = []
      for (const e of s.events ?? []) if (!tag || e.text.includes(tag)) ev.push({ t: e.t, at: fmtClock(e.t), source: 'engine', text: e.text, level: e.level })
      for (const e of useMaint.getState().log ?? []) if (!tag || e.text.includes(tag)) ev.push({ t: e.t, at: fmtClock(e.t), source: 'maintenance', text: e.text, level: e.level })
      for (const a of s.actions ?? []) if (!tag || a.tag === tag) ev.push({ t: a.t, at: fmtClock(a.t), source: `action:${a.who}`, text: `${a.action}${a.tag ? ` ${a.tag}` : ''}${a.detail ? `: ${a.detail}` : ''}` })
      ev.sort((a, b) => b.t - a.t)
      return { count: ev.length, events: ev.slice(0, limit) }
    },
  },
  {
    name: 'check_barrier_erosion',
    description: 'Hard-to-spot check: per fire zone, which safety layers are weakened at the same time (inhibited / faulted detectors, shelved alarms, degraded machines, live hot work, stuck valves, gas present, adverse wind). Three or more = aligned.',
    params: { zone: p('string', 'Only this fire zone'), platform: p('string', 'Only this platform') },
    run: (args) => {
      const f = barrierErosion({ zone: str(args.zone) || undefined, platform: asPlatform(args.platform) })
      return { zonesWithWeakenedLayers: f.length, aligned: f.filter((x) => x.aligned).length, findings: f.slice(0, 8) }
    },
  },
  {
    name: 'check_sensor_drift',
    description: 'Hard-to-spot check: sensors and machine condition signals trending steadily towards a trip while still inside their alarm limits, with time to trip.',
    params: { tag: p('string', 'Only this instrument or the instruments on this equipment'), platform: p('string', 'Only this platform') },
    run: (args) => {
      const f = sensorDrift({ tag: str(args.tag) || undefined, platform: asPlatform(args.platform) })
      let longest = 0
      for (const r of rings.values()) if (r.t.length > 1) longest = Math.max(longest, r.t[r.t.length - 1] - r.t[0])
      return { signalsWatched: rings.size, historyMin: Math.round(longest / 60), drifting: f.slice(0, 8), note: longest < 300 ? 'Less than 5 min of sampled history yet: drift needs a longer window (speed the clock up).' : null }
    },
  },
  {
    name: 'get_spares',
    description: 'Spare parts (simulated stock): parts that fit an equipment tag or match words, with stock offshore / at the supply base, open purchase orders and ETA, and whether a repair job on that tag is covered. Also lists parts short or below the reorder point.',
    params: { tag: p('string', 'Equipment tag, e.g. K-2200'), query: p('string', 'Words, e.g. "dry gas seal" or "methanol"') },
    run: (args) => {
      const sp = useSpares.getState()
      const tag = str(args.tag)
      const q = str(args.query).toLowerCase()
      const words = q
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !/\d/.test(w) && !['the', 'and', 'for', 'have', 'any', 'spare', 'spares', 'part', 'parts', 'stock', 'what', 'how', 'many', 'with', 'there', 'our', 'need'].includes(w))
      const t = S().t
      const open = sp.orders.filter((o) => o.stage !== 'received' && o.stage !== 'cancelled')
      const view = (id: string) => {
        const part = sp.parts.find((x) => x.id === id)
        if (!part) return null
        const st = sp.stock[id] ?? { offshore: 0, base: 0, reserved: 0 }
        const pos = open.filter((o) => o.partId === id)
        return {
          id,
          name: part.name,
          criticality: part.criticality,
          fits: part.fits,
          offshore: st.offshore,
          base: st.base,
          reserved: st.reserved,
          reorderPoint: part.rop,
          unitCostUsd: part.unitCost,
          leadDays: part.leadDays,
          expediteDays: part.expediteDays,
          openOrders: pos.map((o) => ({ id: o.id, qty: o.qty, mode: o.mode, stage: o.stage, eta: fmtClock(o.eta), etaInS: Math.max(0, Math.round(o.eta - t)) })),
        }
      }
      // parts that fit the tag, or match at least half the words; best word match first
      const hits = (x: (typeof sp.parts)[number]) => {
        const hay = `${x.id} ${x.name} ${x.usedFor.join(' ')}`.toLowerCase()
        return words.filter((w) => hay.includes(w)).length
      }
      const scored = sp.parts.map((x) => ({ id: x.id, n: hits(x), fit: !!tag && x.fits.includes(tag) }))
      const anyFit = scored.some((x) => x.fit)
      const ids = scored
        .filter((x) => (anyFit ? x.fit : words.length > 0 && x.n >= Math.max(1, Math.ceil(words.length / 2))))
        .sort((a, b) => b.n - a.n)
        .map((x) => x.id)
      const short = sp.parts
        .filter((x) => {
          const st = sp.stock[x.id]
          return st && (st.offshore + st.base + open.filter((o) => o.partId === x.id).reduce((a, o) => a + o.qty, 0) - st.reserved <= x.rop || (x.criticality === 'A' && st.offshore <= 0))
        })
        .slice(0, 8)
        .map((x) => ({ id: x.id, name: x.name, criticality: x.criticality, offshore: sp.stock[x.id]?.offshore ?? 0, base: sp.stock[x.id]?.base ?? 0 }))
      const cover = tag ? coverFor(tag) : null
      return { simulated: true, mode: sp.mode, parts: ids.slice(0, 10).map(view).filter(Boolean), cover, short, awaitingMaterials: sp.kpis.wam, inventoryValueUsd: Math.round(sp.kpis.inventoryValue) }
    },
  },
  {
    name: 'get_economics',
    description: 'Production value now (simulated price deck): revenue and cash-margin run-rates, deferred revenue by cause this session, lifting cost, carbon intensity, and the machines with the most dollars at risk over the next 30 days.',
    params: {},
    run: () => {
      const f = useFinance.getState()
      const d = f.deck
      const def = Object.entries(f.totals.deferred)
        .filter(([k, v]) => k !== 'materials' && v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, v]) => ({ category: k, usd: Math.round(v) }))
      return {
        simulated: true,
        priceDeck: { oilUsdBbl: d.oil, gasUsdMMBtu: d.gas, carbonUsdT: d.carbon },
        revenueUsdD: Math.round(f.rate.revenue),
        cashUsdD: Math.round(f.rate.cash),
        deferredRateUsdD: Math.round(f.rate.deferred),
        liftingCostUsdBoe: r1(f.rate.liftingCost, 1),
        intensityKgBoe: r1(f.rate.intensity, 1),
        session: { revenueUsd: Math.round(f.totals.revenue), deferredUsd: def, awaitingSparesUsd: Math.round(f.totals.deferred.materials ?? 0), co2t: Math.round(f.totals.co2t) },
        atRisk: (f.risks?.length ? f.risks : assetRisks(30, d))
          .slice(0, 5)
          .map((a) => ({ tag: a.tag, name: a.name, stage: a.stage, pFail30d: r1(a.pFail * 100, 0), exposureUsd: Math.round(a.exposureUsd), spare: a.cover.status, action: a.action })),
      }
    },
  },
  {
    name: 'get_insights',
    description: 'The ranked findings the twin derives from its own data (production constraints in $/d, where deferred revenue went, dollars at risk per machine and the lever that removes it, supply-chain shortfalls, flaring, wells, safety), plus a one-paragraph shift headline.',
    params: { area: p('string', 'Only this area: production, value, asset, supply, carbon, safety, wells, opportunity') },
    run: (args) => {
      const st = useInsights.getState()
      const area = str(args.area).toLowerCase()
      const list = st.list.filter((x) => !area || x.area === area)
      return { simulated: true, headline: st.headline, count: list.length, insights: list.slice(0, 8).map((x) => ({ kind: x.kind, area: x.area, title: x.title, detail: x.detail, usdPerDay: Math.round(x.usdD), tags: x.tags })) }
    },
  },
  {
    name: 'get_inspections',
    description: 'Simulated drone and robot inspections: where each unit is now, and the latest reports (items inspected, readings outside limits, corrosion, verdicts, stops for workers). Read-only: agents cannot send a unit.',
    params: { tag: p('string', 'Only reports that visited this tag'), limit: p('number', 'Most recent reports to return (default 5)') },
    run: (args) => {
      const tag = str(args.tag)
      const st = useInspection.getState()
      const lim = Math.max(1, Math.min(20, Math.round(num(args.limit)) || 5))
      const list = st.reports.filter((r) => !tag || r.stops.some((x) => x.tag === tag)).slice(0, lim)
      return {
        simulated: true,
        units: UNITS.map((u) => ({ unit: u, label: UNIT_SPEC[u].label, phase: st.units[u].phase, battery: st.units[u].battery, mission: st.units[u].mission, target: st.units[u].tag, holdingFor: st.units[u].hold?.name ?? null })),
        reports: list.map((r) => ({
          id: r.id,
          unit: r.unit,
          label: r.label,
          status: r.status,
          from: fmtClock(r.t0),
          to: fmtClock(r.t1),
          summary: r.summary,
          closestWorkerM: r.minGap,
          workerStops: r.holds.length,
          items: r.stops.map((x) => ({ tag: x.tag, status: x.status, verdict: x.verdict, notes: x.notes, wallPct: x.corrosion?.wallPct ?? null, grade: x.corrosion?.grade ?? null, outOfLimits: x.readings.filter((v) => v.state !== 'normal').map((v) => ({ tag: v.tag, value: v.value, unit: v.unit, state: v.state })) })),
        })),
      }
    },
  },
  {
    name: 'get_corrosion',
    description: 'Corrosion findings from simulated inspections, newest first: wall left, grade, rate. Only what a unit has inspected is known.',
    params: { platform: p('string', 'Alpha, WHP-N, RP, WI or LQ'), gradeMin: p('string', 'light, moderate, severe or critical') },
    run: (args) => {
      const pf = asPlatform(args.platform)
      const min = GRADE_RANK[str(args.gradeMin).toLowerCase() as CorrGrade] ?? 0
      const list = useCorrosion.getState().findings.filter((f) => (!pf || f.platform === pf) && GRADE_RANK[f.grade] >= min)
      return { simulated: true, count: list.length, findings: list.slice(0, 20).map((f) => ({ id: f.id, time: fmtClock(f.t), tag: f.tag, platform: f.platform, grade: f.grade, wallPct: f.wallPct, rateMmPerYr: f.rateMmPerYr, method: f.method, mission: f.missionId })) }
    },
  },
  {
    name: 'get_corrosion_trend',
    description: 'One item\'s inspected wall history (simulated), oldest first, against the survey a year before the session, and the rate.',
    params: { tag: p('string', 'Line or equipment tag', true) },
    run: (args) => {
      const tag = str(args.tag)
      const hist = useCorrosion.getState().findings.filter((f) => f.tag === tag).slice(0, 20).reverse()
      const stop = useInspection.getState().reports.flatMap((r) => r.stops).find((x) => x.tag === tag && x.corrosion)
      if (!hist.length && !stop) return { simulated: true, tag, inspected: false, note: 'No inspection has visited this item yet' }
      return { simulated: true, tag, inspected: true, lastSurveyPct: stop?.corrosion?.lastSurveyPct ?? null, rateMmPerYr: stop?.corrosion?.rateMmPerYr ?? null, wallPct: hist.map((f) => f.wallPct), times: hist.map((f) => fmtClock(f.t)) }
    },
  },
  {
    name: 'search_tags',
    description: 'Search equipment, instrument and valve tags and names.',
    params: { query: p('string', 'Tag or words, e.g. "K-2200" or "export pump"', true) },
    run: (args) => {
      const q = str(args.query).toLowerCase()
      if (!q) return { matches: [] }
      const pl = plant()
      const words = q.split(/\s+/).filter(Boolean)
      const hit = (s: string) => words.every((w) => s.toLowerCase().includes(w))
      const m: { tag: string; kind: string; name: string; exact: boolean }[] = []
      for (const e of pl.equipment) if (hit(`${e.tag} ${e.name}`)) m.push({ tag: e.tag, kind: 'equipment', name: e.name, exact: e.tag.toLowerCase() === q })
      for (const v of pl.valves) if (hit(`${v.tag} ${v.type} valve`)) m.push({ tag: v.tag, kind: 'valve', name: `${v.type} valve on ${v.line}`, exact: v.tag.toLowerCase() === q })
      for (const i of pl.instruments) if (hit(`${i.tag} ${i.type}`)) m.push({ tag: i.tag, kind: 'instrument', name: `${i.type} on ${instHost(i) ?? '?'} (${i.unit})`, exact: i.tag.toLowerCase() === q })
      m.sort((a, b) => Number(b.exact) - Number(a.exact))
      return { count: m.length, matches: m.slice(0, 12).map(({ exact: _e, ...x }) => x) }
    },
  },
]

const TOOL_BY_NAME = new Map(AGENT_TOOLS.map((t) => [t.name, t]))

/** one-line summary of a tool result for the trace (the full result is not stored) */
export function summarise(name: string, r: unknown): string {
  if (!r || typeof r !== 'object') return String(r)
  const o = r as Record<string, unknown>
  if (o.error) return `error: ${String(o.error)}`
  switch (name) {
    case 'get_field_status':
      return `oil ${o.oilExportBpd ?? '-'} bbl/d, PE ${o.efficiencyPct ?? '-'} %, ${(o.shutdowns as unknown[])?.length ?? 0} shutdown(s)`
    case 'get_risk':
      return o.platform ? `${o.platform} ${o.score} (${o.band})` : `field ${o.field} (${o.band})`
    case 'get_alarms':
      return `${o.count} active alarm(s)`
    case 'get_equipment':
      return `${o.tag} ${o.runState ?? ''}${(o.health as { stage?: string } | null)?.stage ? `, health ${(o.health as { stage: string }).stage}` : ''}`
    case 'get_sensor':
      return `${o.tag} = ${o.value} ${o.unit} (${o.state})`
    case 'get_fire_gas':
      return `${(o.zones as unknown[])?.length ?? 0} abnormal zone(s), ${(o.inhibited as unknown[])?.length ?? 0} inhibited`
    case 'get_shutdown_cause':
      return `${(o.shutdowns as unknown[])?.length ?? 0} shutdown(s) on ${o.platform}`
    case 'get_cameras':
      return `${(o.cameras as unknown[])?.length ?? 0} camera(s)`
    case 'get_permits':
      return `${(o.permits as unknown[])?.length ?? 0} permit(s), ${(o.conflicts as unknown[])?.length ?? 0} conflict(s)`
    case 'find_scenarios':
      return `${(o.matches as unknown[])?.length ?? 0} match(es)`
    case 'get_scenario_consequence':
      return `${o.title}${o.predicted ? ' (predicted)' : ''}`
    case 'get_events':
      return `${o.count} event(s)`
    case 'check_barrier_erosion':
      return `${o.zonesWithWeakenedLayers} zone(s) with weakened layers, ${o.aligned} aligned`
    case 'check_sensor_drift':
      return `${(o.drifting as unknown[])?.length ?? 0} drifting of ${o.signalsWatched} watched`
    case 'search_tags':
      return `${o.count} match(es)`
    case 'get_spares':
      return `${(o.parts as unknown[])?.length ?? 0} part(s), ${(o.short as unknown[])?.length ?? 0} short${(o.cover as { status?: string } | null)?.status ? `, cover ${(o.cover as { status: string }).status}` : ''}`
    case 'get_insights':
      return `${o.count} insight(s)`
    case 'get_inspections':
      return `${(o.reports as unknown[])?.length ?? 0} report(s), units ${(o.units as { phase: string }[])?.map((u) => u.phase).join(' / ')}`
    case 'get_corrosion':
      return `${o.count} finding(s)`
    case 'get_corrosion_trend':
      return o.inspected ? `${(o.wallPct as number[]).length} inspection(s), ${o.rateMmPerYr} mm/yr` : 'not inspected yet'
    case 'get_economics':
      return `revenue ${o.revenueUsdD} $/d, cash ${o.cashUsdD} $/d, ${(o.atRisk as unknown[])?.length ?? 0} asset(s) at risk`
  }
  return 'ok'
}

/**
 * Run a tool by name. Always returns plain JSON (errors come back as `{ error }`). With a trace id the
 * call is written to the trace as a `tool` step: args, summary, latency, and the result itself when
 * it is small (larger results are previewed).
 */
export function runTool(name: string, args: Record<string, unknown> = {}, traceId?: string): unknown {
  const tool = TOOL_BY_NAME.get(name)
  const t0 = performance.now()
  let result: unknown
  if (!tool) result = { error: `Unknown tool ${name}` }
  else {
    try {
      result = JSON.parse(JSON.stringify(tool.run(args ?? {}) ?? null))
    } catch (e) {
      result = { error: e instanceof Error ? e.message : String(e) }
    }
  }
  const ms = Math.round((performance.now() - t0) * 10) / 10
  if (traceId) {
    const json = JSON.stringify(result)
    const data: TraceStep['data'] = { tool: name, args, ms, summary: summarise(name, result) }
    if (json.length <= 1500) data.result = result
    else data.resultPreview = `${json.slice(0, 1500)}…`
    const argText = Object.entries(args ?? {})
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ')
    addTrace(traceId, { actor: 'tool', kind: 'observe', text: `${name}(${argText}) → ${summarise(name, result)}`, data })
  }
  return result
}

/** tool descriptors without the run function (what an LLM provider sends as `tools`) */
export function toolSchemas() {
  return AGENT_TOOLS.map(({ name, description, params }) => ({ name, description, params }))
}
