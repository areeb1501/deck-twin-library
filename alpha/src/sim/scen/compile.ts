/** Turns a validated scenario spec (sim/scen/spec.ts) into an ordinary Scenario. Every closure here comes from this file: a spec only picks them. */
import type { Vec3 } from '../../model/types'
import { SHUTDOWN_RANK, type Fault } from '../types'
import { HOTWORK, MUSTER, POB } from './library'
import { acked, activeIncidents, anyShutdown, has, incident, latched, on, operatorActions, pointAt, raised, restarted, runningNow, st, vpos, wellsOf, zoneGas, zoneOfPoint } from './helpers'
import { METRICS, type ActionSpec, type Cmp, type Cond, type Effect, type GoalSpec, type ScenarioSpec, type StepSpec } from './spec'
import type { Ctx, Objective, Scenario, ScenarioAction, Step } from './types'

const GAS_RANK = { normal: 0, low: 1, high: 2, confirmed: 3 }
const FLAME_RANK = { normal: 0, single: 1, confirmed: 2 }

const compare = (a: number, op: Cmp, b: number) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b)

/** the zone of a gas condition: named, or wherever the keyed release went */
const zoneOf = (c: Ctx, x: { zone?: string; incident?: string }) => x.zone ?? (x.incident ? (c.data[`zone:${x.incident}`] as string | undefined) : undefined)

/** a condition as a predicate. It reads with the same helpers the built-in library uses */
export function pred(x: Cond): (c: Ctx) => boolean {
  switch (x.is) {
    case 'all': {
      const ps = x.of.map(pred)
      return (c) => ps.every((p) => p(c))
    }
    case 'any': {
      const ps = x.of.map(pred)
      return (c) => ps.some((p) => p(c))
    }
    case 'not': {
      const p = pred(x.cond)
      return (c) => !p(c)
    }
    case 'metric':
      return (c) => {
        const v = METRICS[x.metric]?.read(c)
        return v !== undefined && compare(v, x.op, x.value)
      }
    case 'machine':
      return (c) => {
        if (x.state === 'on') return on(c.s, x.tag)
        if (x.state === 'running') return runningNow(c.s, x.tag)
        if (x.state === 'tripped') return st(c.s, x.tag) === 'tripped'
        return !on(c.s, x.tag) && st(c.s, x.tag) !== 'tripped'
      }
    case 'valve':
      return (c) => compare(vpos(c.s, x.tag), x.op, x.value)
    case 'shutdown':
      return (c) => latched(c.s, { platform: x.platform, level: x.level, causeId: x.cause, zone: x.zone, since: c.t0 }).some((s) => !x.atLeast || SHUTDOWN_RANK[s.level] >= SHUTDOWN_RANK[x.atLeast])
    case 'anyShutdown':
      return (c) => anyShutdown(c.s, x.platform)
    case 'restarted':
      return (c) => restarted(c, x.platform, x.oil ?? 1)
    case 'fired':
      return (c) => c.mark[x.step] !== undefined && c.el >= c.mark[x.step] + (x.after ?? 0)
    case 'ordered':
      return (c) => c.did[x.action] !== undefined
    case 'completed':
      return (c) => c.did[`${x.action}:done`] !== undefined
    case 'acked':
      return (c) => acked(c, x.tag)
    case 'raised':
      return (c) => raised(c, x.tag)
    case 'gas':
      return (c) => GAS_RANK[zoneGas(c.s, zoneOf(c, x))] >= GAS_RANK[x.level]
    case 'gasClear':
      return (c) => zoneGas(c.s, zoneOf(c, x)) === 'normal'
    case 'flame':
      return (c) => FLAME_RANK[c.s.fg?.[x.zone]?.fire ?? 'normal'] >= FLAME_RANK[x.level]
    case 'deluge':
      return (c) => !!c.s.fg?.[x.zone]?.deluge
    case 'incident':
      return (c) => !!incident(c.s, c.data[x.incident])
    case 'fireBurning':
      return (c) => activeIncidents(c.s, 'fire').some((i) => i.burning)
    case 'operatorDid':
      return (c) => operatorActions(c).some((a) => a.tag === x.tag && a.action === x.action)
    case 'elapsed':
      return (c) => c.el >= x.seconds
    default:
      // a stored spec from another version: never true, rather than a throw in the middle of a tick
      return () => false
  }
}

/** on the equipment, `dy` above where it stands, so a release on the cellar deck stays on the cellar deck */
function pointNear(c: Ctx, tag: string, dy: number): Vec3 | null {
  const e = c.plant.equipment.find((x) => x.tag === tag)
  return e ? [e.position[0], e.position[1] + dy, e.position[2]] : pointAt(c.plant, tag, dy)
}

function inject(c: Ctx, f: Fault, key?: string) {
  const id = c.inject(f)
  if (key) c.data[key] = id
  if (key && 'at' in f) c.data[`zone:${key}`] = zoneOfPoint(c.plant, f.at)
}

/** an effect as an action on the engine, through the Ctx the runner hands every scenario */
function apply(e: Effect, c: Ctx) {
  switch (e.do) {
    case 'trip':
      return inject(c, { kind: 'trip', tag: e.tag, cause: e.cause, local: e.local, repairH: e.repairH }, e.key)
    case 'gasRelease': {
      const at = pointNear(c, e.at, e.dy ?? 1)
      if (at) inject(c, { kind: 'gasRelease', at, rateKgS: e.rateKgS, source: e.at, label: e.label }, e.key)
      return
    }
    case 'fire': {
      const at = pointNear(c, e.at, e.dy ?? 1)
      if (at) inject(c, { kind: 'fire', at, sizeMW: e.sizeMW, source: e.at, label: e.label }, e.key)
      return
    }
    case 'valveStuck':
    case 'levelControlFail':
    case 'detectorFault':
      return inject(c, { kind: e.do, tag: e.tag } as Fault, e.key)
    case 'antiSurgeFail':
    case 'instrumentAirFail':
    case 'coolingFail':
    case 'exportBlocked':
      return inject(c, { kind: e.do } as Fault, e.key)
    case 'clear':
      if (incident(c.s, c.data[e.incident])) c.act((g) => g.clearIncident(String(c.data[e.incident])))
      return
    case 'setValve':
      return void c.act((g) => g.setValve(e.tag, e.cmd, 'scenario'))
    case 'setChokes':
      return c.act((g) => {
        for (const w of e.wells ?? wellsOf(c.plant)) g.setChoke(w, e.to)
      })
    case 'setWell':
      return c.act((g) => g.setWell(e.tag, e.online))
    case 'setKnob':
      return c.act((g) => g.setKnob(e.knob, e.value as never))
    case 'shutdown':
      return c.act((g) => g.initiate(e.level, e.platform, e.zone, e.reason))
    case 'resetTrip':
      return void c.act((g) => g.resetTrip(e.tag, { local: e.local }))
    case 'start':
      return void c.act((g) => g.start(e.tag))
    case 'stop':
      return void c.act((g) => g.stop(e.tag))
    case 'inhibit':
      return c.act((g) => g.inhibit(e.tag, true))
    case 'note':
      return c.note(e.text)
  }
}

const applyAll = (list: Effect[]) => (c: Ctx) => {
  for (const e of list) apply(e, c)
}

function rampOf(r: NonNullable<StepSpec['ramp']>): Step['ramp'] {
  const value = (f: number) => r.from + (r.to - r.from) * f
  return {
    dur: r.seconds,
    apply: (c, f) =>
      c.act((g) => {
        if (r.target === 'chokes') for (const w of r.wells ?? wellsOf(c.plant)) if (has(c.plant, w)) g.setChoke(w, Math.round(value(f)))
        if (r.target === 'compressorSpeed') g.setKnob('compressorSpeed', value(f))
        if (r.target === 'windSpeed') g.setKnob('wind', { ...g.knobs.wind, speed: value(f) })
      }),
  }
}

function stepOf(x: StepSpec): Step {
  return {
    id: x.id,
    label: x.label,
    at: x.at,
    after: x.after ? [x.after.step, x.after.seconds] : undefined,
    when: x.when ? pred(x.when) : undefined,
    only: x.only ? pred(x.only) : undefined,
    run: x.do?.length ? applyAll(x.do) : undefined,
    ramp: x.ramp ? rampOf(x.ramp) : undefined,
  }
}

function goalOf(x: GoalSpec): Objective {
  const { check, ...rest } = x
  return { ...rest, check: pred(check) }
}

const BUILTINS = { muster: MUSTER, pob: POB, hotwork: HOTWORK }

function actionOf(x: ActionSpec): ScenarioAction {
  if ('builtin' in x) return BUILTINS[x.builtin]
  const reports = (x.reports ?? []).map((r) => ({ when: r.when ? pred(r.when) : null, text: r.text }))
  const effects = applyAll(x.do ?? [])
  return {
    id: x.id,
    label: x.label,
    who: x.who,
    delay: x.delay,
    detail: x.detail,
    available: x.available ? pred(x.available) : undefined,
    run: (c) => {
      // the report describes what was found, so it is chosen before the effects change the plant
      const line = reports.find((r) => !r.when || r.when(c))?.text
      effects(c)
      return line
    },
  }
}

/** every plant tag a spec names, so `unavailable()` can refuse it on a plant without them. Alarm tags and detectors live elsewhere */
export function tagsIn(spec: ScenarioSpec): string[] {
  const out = new Set<string>()
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (o.is === 'acked' || o.is === 'raised' || o.do === 'detectorFault' || o.do === 'inhibit') return
    if (typeof o.tag === 'string') out.add(o.tag)
    if (o.do && typeof o.at === 'string') out.add(o.at)
    if (Array.isArray(o.wells)) for (const w of o.wells) out.add(String(w))
    Object.values(o).forEach(walk)
  }
  walk([spec.setup, spec.timeline, spec.goals, spec.actions, spec.complete])
  return [...out].sort()
}

export function compile(spec: ScenarioSpec): Scenario {
  const setup = spec.setup
  return {
    id: spec.id ?? 'custom:draft',
    n: 0,
    title: spec.title,
    difficulty: spec.difficulty,
    category: spec.category,
    platforms: spec.platforms,
    summary: spec.summary,
    objectives: spec.objectives,
    briefing: spec.briefing,
    expected: spec.expected,
    hints: spec.hints,
    requires: { tags: tagsIn(spec), why: 'names tags this plant does not have' },
    setup: setup ? { knobs: setup.knobs, chokes: setup.chokes, run: setup.do?.length ? applyAll(setup.do) : undefined } : undefined,
    timeline: spec.timeline.map(stepOf),
    goals: spec.goals.map(goalOf),
    actions: spec.actions?.map(actionOf),
    complete: spec.complete ? pred(spec.complete) : undefined,
    settle: spec.settle,
    maxDuration: spec.maxDuration,
    ideal: spec.ideal,
  }
}
