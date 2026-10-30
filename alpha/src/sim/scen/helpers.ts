/** Predicates and small helpers the scenario library uses to read the simulation state. */
import type { Plant, Vec3 } from '../../model/types'
import { runState } from '../../state/sim'
import * as A from '../alpha'
import { detectors, gasReading, tagPosition, zoneAt } from '../fg'
import type { Fault, PlatformId, RunState, Shutdown, ShutdownLevel, SimState } from '../types'
import { SHUTDOWN_RANK } from '../types'
import type { Ctx } from './types'

const chokeF = (c: number) => Math.pow(Math.max(0, Math.min(100, c)) / 100, 0.75)

/** run state of a machine (explicit status or the engine default) */
export function st(s: SimState, tag: string): RunState {
  const x = s.status?.[tag]
  if (x) return x
  try {
    return runState(tag)
  } catch {
    return 'stopped'
  }
}
export const on = (s: SimState, tag: string) => {
  const x = st(s, tag)
  return x === 'running' || x === 'starting'
}
export const runningNow = (s: SimState, tag: string) => st(s, tag) === 'running'
export const has = (p: Plant, tag: string) => p.equipment.some((e) => e.tag === tag) || p.valves.some((v) => v.tag === tag)
export const vpos = (s: SimState, tag: string) => s.valves?.[tag]?.pos ?? 1

/** production wells of the plant (A.WELLS that exist) */
export function wellsOf(p: Plant): string[] {
  return Object.keys(A.WELLS).filter((t) => p.equipment.some((e) => e.tag === t))
}

/**
 * Share of the field's design potential the chokes / well switches allow, 0 … 1 (1 = every well open
 * at the reference 60 % choke). "Cut production" objectives read this — whatever way the operator cut it.
 */
export function chokeFactor(s: SimState, p: Plant): number {
  let a = 0
  let b = 0
  for (const w of wellsOf(p)) {
    const d = A.WELLS[w]
    const online = s.knobs?.wellOnline?.[w] ?? true
    const ch = s.knobs?.chokes?.[w] ?? 60
    a += online ? d.oil * chokeF(ch) : 0
    b += d.oil * chokeF(60)
  }
  return b > 0 ? a / b : 1
}

/** set every well choke (as the scenario) */
export function setAllChokes(c: Ctx, v: number) {
  c.act((g) => {
    for (const w of wellsOf(c.plant)) g.setChoke(w, v)
  })
}

export function latched(s: SimState, f: { platform?: PlatformId; level?: ShutdownLevel; causeId?: string | RegExp; zone?: string; since?: number } = {}): Shutdown[] {
  return (s.shutdowns ?? []).filter(
    (x) =>
      (!f.platform || x.platform === f.platform) &&
      (!f.level || x.level === f.level) &&
      (!f.zone || x.zone === f.zone) &&
      (f.since === undefined || x.at >= f.since) &&
      (!f.causeId || (typeof f.causeId === 'string' ? x.causeId === f.causeId : f.causeId.test(x.causeId))),
  )
}
/** a shutdown of at least `level` latched (not reset) on the platform */
export function downAtLeast(s: SimState, platform: PlatformId, level: ShutdownLevel = 'PSD') {
  return (s.shutdowns ?? []).some((x) => (x.platform === platform || x.level === 'APS') && SHUTDOWN_RANK[x.level] >= SHUTDOWN_RANK[level])
}
export const anyShutdown = (s: SimState, platform: PlatformId) => (s.shutdowns ?? []).some((x) => x.platform === platform || x.level === 'APS')

/** the platform has had a shutdown since the scenario started and is producing again */
export function restarted(c: Ctx, platform: PlatformId, oilMin = 25000) {
  return c.mark['_down:' + platform] !== undefined && !anyShutdown(c.s, platform) && (c.s.result?.oilExport ?? 0) >= oilMin
}

/** an F&G zone's gas state */
export const zoneGas = (s: SimState, zone: string | undefined) => (zone ? (s.fg?.[zone]?.gas ?? 'normal') : 'normal')

/** active incident by id (still in the engine's list and not cleared) */
export function incident(s: SimState, id: unknown) {
  return typeof id === 'string' ? (s.incidents ?? []).find((i) => i.id === id && i.cleared === undefined) : undefined
}
/** incidents of a kind still active */
export const activeIncidents = (s: SimState, kind: Fault['kind']) => (s.incidents ?? []).filter((i) => i.fault.kind === kind && i.cleared === undefined)

/** an alarm on this tag (or matching) was acknowledged since the start */
export function acked(c: Ctx, tag: string | RegExp) {
  return c.alarms.some((a) => (typeof tag === 'string' ? a.tag === tag : tag.test(a.tag) || tag.test(a.text)) && a.ackAt !== undefined)
}
/** an alarm on this tag was raised since the start */
export function raised(c: Ctx, tag: string | RegExp) {
  return c.alarms.some((a) => (typeof tag === 'string' ? a.tag === tag : tag.test(a.tag) || tag.test(a.text)))
}
/** the trainee's audit-trail actions since the start (operator / field) */
export function operatorActions(c: Ctx) {
  return c.ops
}

/** release point at an equipment tag (a nozzle matching `nozzle`, `dy` above it) */
export function pointAt(p: Plant, tag: string, dy = 1, nozzle?: RegExp): Vec3 | null {
  const e = p.equipment.find((x) => x.tag === tag)
  const nz = nozzle ? e?.nozzles?.find((n) => nozzle.test(n.name)) : undefined
  const base = nz?.pos ?? tagPosition(p, tag)
  if (!base) return null
  return [base[0], base[1] + dy, base[2]]
}

/** how many gas detectors a steady release at `at` puts at / above the high and low setpoints, per zone */
export function detectorsSeeing(p: Plant, at: Vec3, rateKgS: number, wind: { from: number; speed: number }) {
  const cl = [{ pos: at, rateKgS, age: Infinity }]
  const out: Record<string, { hi: number; lo: number }> = {}
  let ds: ReturnType<typeof detectors> = []
  try {
    ds = detectors(p)
  } catch {
    return out
  }
  for (const d of ds) {
    if (d.type !== 'GD' && d.type !== 'OGD') continue
    const v = gasReading(d, cl, wind)
    const hiS = d.type === 'GD' ? 60 : 3
    const loS = d.type === 'GD' ? 20 : 1
    if (v < loS) continue
    const z = (out[d.zone ?? '-'] ??= { hi: 0, lo: 0 })
    if (v >= hiS) z.hi++
    else z.lo++
  }
  return out
}
export const zoneOfPoint = (p: Plant, at: Vec3 | null) => (at ? (zoneAt(p, at)?.id ?? undefined) : undefined)

/** mm:ss (or h:mm:ss) of sim seconds */
export function fmtEl(t: number) {
  const s = Math.max(0, Math.round(t))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`
}
