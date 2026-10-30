/**
 * Training scenario runner — a SimPlugin with its own zustand store (`useScenario`).
 *
 *   start(id)  fresh session (engine reset), scenario setup, clock speed
 *   step       after every engine tick: auto marks, timeline injections / ramps, ordered CCR and
 *              field actions coming due, alarm tracking, objective evaluation, the debrief timeline
 *   end        max duration, scenario complete (held for `settle` s), Abort, or a session reset
 *   debrief    sim/scen/scoring.ts; attempts are kept in localStorage
 *
 * The library is sim/scen/library.ts. Import this module once (App.tsx) so the plugin registers.
 */
import { create } from 'zustand'
import * as simMod from '../state/sim'
import { usePlantStore } from '../state/plantStore'
import type { Fault, OperatorAction, PlatformId, SimPlugin, SimState } from './types'
import { SCENARIOS, SCENARIO_BY_ID, travelTime, unavailable } from './scen/library'
import { downAtLeast, fmtEl } from './scen/helpers'
import { score } from './scen/scoring'
import type { Attempt, Ctx, KpiSnap, ObjState, Objective, Scenario, ScenarioAction, Step, TimelineRow, TrackedAlarm } from './scen/types'
import { platformOfTag } from './fg'

export { SCENARIOS, SCENARIO_BY_ID, unavailable }
export type { Attempt, Scenario }

const useSim = simMod.useSim as unknown as { getState: () => SimState; subscribe: (fn: (s: SimState, p: SimState) => void) => () => void }
const ext = simMod as unknown as { registerSimPlugin?: (p: SimPlugin) => void; actAs?: <T>(who: OperatorAction['who'], fn: () => T) => T }
const actAs = <T,>(who: OperatorAction['who'], fn: () => T): T => (typeof ext.actAs === 'function' ? ext.actAs(who, fn) : fn())
const sim = () => useSim.getState()

// ================================================================= public store

export interface ObjView {
  id: string
  text: string
  kind: Objective['kind']
  status: ObjState['status']
  since?: number
  at?: number
  window?: number
  deadline?: number
  optional?: boolean
  critical?: boolean
}
export interface ActionView {
  id: string
  label: string
  who: OperatorAction['who']
  available: boolean
  detail?: string
  /** ordered, outcome pending (due at elapsed) */
  due?: number
  /** done at elapsed */
  done?: number
}
export interface LiveView {
  id: string
  title: string
  el: number
  max: number
  objectives: ObjView[]
  done: number
  total: number
  failed: number
  actions: ActionView[]
  reports: { t: number; text: string }[]
  hints: string[]
  hintCount: number
}
export type ScenView = { kind: 'library' } | { kind: 'brief'; id: string } | { kind: 'debrief'; attemptId: string }

interface ScenStore {
  live: LiveView | null
  last: Attempt | null
  history: Attempt[]
  view: ScenView
  start: (id: string, speed?: number) => string | null
  abort: (why?: string) => void
  showHint: () => void
  /** order a scenario CCR / field action */
  order: (actionId: string) => string | null
  setView: (v: ScenView) => void
  clearHistory: () => void
}

const HKEY = 'deckTwin.scenarioHistory.v1'
function loadHistory(): Attempt[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(HKEY) : null
    const a = raw ? (JSON.parse(raw) as Attempt[]) : []
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}
function saveHistory(h: Attempt[]) {
  try {
    localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 40)))
  } catch {
    /* quota / private mode */
  }
}

export const useScenario = create<ScenStore>((set) => ({
  live: null,
  last: null,
  history: loadHistory(),
  view: { kind: 'library' },
  start: (id, speed) => startScenario(id, speed),
  abort: (why) => finish(why ?? 'aborted by the trainee'),
  showHint: () => {
    if (!L || L.hints >= L.sc.hints.length) return
    L.hints++
    L.log.push({ t: L.el, lane: 'scenario', text: `Hint shown (−3): ${L.sc.hints[L.hints - 1]}`, level: 'warn' })
    publish()
  },
  order: (id) => orderAction(id),
  setView: (view) => set({ view }),
  clearHistory: () => {
    saveHistory([])
    set({ history: [] })
  },
}))

// ================================================================= live run (module state)

interface Pending {
  action: ScenarioAction
  due: number
  tag?: string
}
interface Live {
  sc: Scenario
  goals: Objective[]
  t0: number
  el: number
  mark: Record<string, number>
  data: Record<string, unknown>
  did: Record<string, number>
  alarms: Map<string, TrackedAlarm>
  alarmList: TrackedAlarm[]
  ops: OperatorAction[]
  objs: Record<string, ObjState>
  fired: Set<string>
  ramps: { step: Step; start: number }[]
  pending: Pending[]
  reports: { t: number; text: string }[]
  log: TimelineRow[]
  /** newest event / action id already folded in (both lists are newest first, ids increase) */
  lastEvent: number
  lastAction: number
  before: KpiSnap
  hints: number
  /** the start snapshot is completed at the first step (the engine has no result until it ticks) */
  beforeDone?: boolean
  settleSince?: number
  prevKnobs: { autoChangeover?: boolean; reliability?: SimState['knobs']['reliability']; wind?: SimState['knobs']['wind'] }
}
let L: Live | null = null
let starting = false

/** generic objective added to every scenario */
const P1_OBJ: Objective = {
  id: '_p1',
  text: 'No unacknowledged P1 alarm older than 2 min',
  kind: 'avoid',
  category: 'alarms',
  check: (c) => c.alarms.some((a) => a.priority === 1 && a.ackAt === undefined && c.el - a.raisedAt > 120),
}

function ctx(l: Live): Ctx {
  const s = sim()
  return {
    s,
    plant: usePlantStore.getState().plant,
    el: l.el,
    t0: l.t0,
    mark: l.mark,
    data: l.data,
    did: l.did,
    alarms: l.alarmList,
    ops: l.ops,
    inject: (f: Fault) => actAs('scenario', () => sim().inject(f)),
    act: (fn) => actAs('scenario', () => fn(sim())),
    note: (text) => l.log.push({ t: l.el, lane: 'scenario', text }),
  }
}

function snap(s: SimState): KpiSnap {
  const r = s.result
  const k = s.kpis
  return {
    t: s.t,
    oil: r?.oilExport ?? 0,
    gas: r?.gasExport ?? 0,
    flare: r?.flare ?? 0,
    peNow: r?.efficiency ?? 100,
    pe: k?.pe ?? 100,
    availability: k?.availability ?? 100,
    trips: k?.trips ?? 0,
    shutdowns: k?.shutdowns ?? 0,
    alarmRate: k?.alarmRate ?? 0,
    produced: k?.producedBoe ?? 0,
    potential: k?.potentialBoe ?? 0,
    losses: { ...(k?.losses ?? {}) },
    latched: (s.shutdowns ?? []).map((x) => `${x.level} ${x.platform}${x.zone ? ` ${x.zone}` : ''}${x.resetAt ? ' (reset)' : ''}`),
  }
}

function startScenario(id: string, speed = 1): string | null {
  const sc = SCENARIO_BY_ID[id]
  if (!sc) return `Unknown scenario ${id}`
  const plant = usePlantStore.getState().plant
  const why = unavailable(sc, plant)
  if (why) return `Not available in this plant: ${why}`
  if (L) return 'A scenario is already running — abort it first'
  const g = sim()
  if (typeof g.reset !== 'function' || typeof g.inject !== 'function') return 'Simulation engine not ready'
  const prev = g.knobs ?? ({} as SimState['knobs'])
  starting = true
  try {
    g.reset()
  } finally {
    starting = false
  }
  const s = sim()
  L = {
    sc,
    goals: [...sc.goals, P1_OBJ],
    t0: s.t,
    el: 0,
    mark: {},
    data: {},
    did: {},
    alarms: new Map(),
    alarmList: [],
    ops: [],
    objs: {},
    fired: new Set(),
    ramps: [],
    pending: [],
    reports: [],
    log: [{ t: 0, lane: 'scenario', text: `Scenario start: ${sc.title}`, level: 'info' }],
    lastEvent: s.events?.[0]?.id ?? 0,
    lastAction: s.actions?.[0]?.id ?? 0,
    before: snap(s),
    hints: 0,
    prevKnobs: { autoChangeover: prev.autoChangeover, reliability: prev.reliability, wind: prev.wind },
  }
  const c = ctx(L)
  actAs('scenario', () => {
    const k = sim()
    k.setKnob('reliability', 'off')
    const kn = sc.setup?.knobs ?? {}
    for (const [key, v] of Object.entries(kn)) if (v !== undefined && key in (k.knobs ?? {})) k.setKnob(key as 'wind', v as never)
    const ch = sc.setup?.chokes
    if (ch !== undefined) for (const w of Object.keys(simMod.useSim.getState().knobs?.chokes ?? {}).concat(wellTags())) k.setChoke(w, typeof ch === 'number' ? ch : (ch[w] ?? 60))
    sc.setup?.run?.(c)
  })
  for (const o of L.goals) L.objs[o.id] = { id: o.id, status: o.from ? 'waiting' : 'active', since: o.from ? undefined : 0 }
  sim().setSpeed(speed)
  useScenario.setState({ view: { kind: 'library' } })
  publish()
  return null
}
function wellTags() {
  const p = usePlantStore.getState().plant
  return p.equipment.filter((e) => e.kind === 'xmasTree' && e.wellType !== 'waterInjector').map((e) => e.tag)
}

/** CCR / field actions currently offered: the scenario's, plus a field local reset for every locally-tripped machine */
function actionList(l: Live, c: Ctx): ScenarioAction[] {
  const own = l.sc.actions ?? []
  const field: ScenarioAction[] = []
  for (const [tag, m] of Object.entries(c.s.machines ?? {})) {
    if (!m?.localReset || c.s.status?.[tag] !== 'tripped') continue
    const id = `field:${tag}`
    let p: PlatformId = 'Alpha'
    try {
      p = platformOfTag(c.plant, tag)
    } catch {
      /* default */
    }
    const dt = travelTime(p)
    field.push({
      id,
      label: `Field: go to ${tag} and reset it locally (≈ ${Math.round(dt / 60)} min)`,
      who: 'field',
      delay: dt,
      detail: `Machinery-protection trip (${m.tripCause ?? ''}) — only resettable at the machine`,
      run: (cc) => {
        const r = actAs('field', () => sim().resetTrip(tag, { local: true }))
        void cc
        return r ? `Field operator at ${tag}: cannot reset — ${r}` : `Field operator: ${tag} reset locally — ready to start from the CCR`
      },
    })
  }
  // keep ordered field resets listed until their outcome is in
  for (const p of l.pending) if (p.action.id.startsWith('field:') && !field.some((f) => f.id === p.action.id)) field.push(p.action)
  return [...own, ...field]
}

function orderAction(id: string): string | null {
  const l = L
  if (!l) return 'No scenario running'
  const c = ctx(l)
  const a = actionList(l, c).find((x) => x.id === id)
  if (!a) return 'Not available'
  if (a.available && !a.available(c)) return 'Not possible right now'
  if (l.pending.some((p) => p.action.id === id)) return 'Already on its way'
  const first = l.did[id] === undefined
  if (first) l.did[id] = l.el
  const rec = sim().record
  if (typeof rec === 'function') rec({ who: a.who === 'field' ? 'field' : 'operator', action: 'scenario', tag: id.startsWith('field:') ? id.slice(6) : undefined, detail: a.label })
  l.log.push({ t: l.el, lane: 'operator', text: `${a.who === 'field' ? 'Ordered: ' : ''}${a.label}`, level: 'info' })
  if (a.delay) {
    l.pending.push({ action: a, due: l.el + a.delay })
  } else runAction(l, a)
  publish()
  return null
}
function runAction(l: Live, a: ScenarioAction) {
  const c = ctx(l)
  const r = a.run?.(c)
  l.did[`${a.id}:done`] ??= l.el
  if (r) {
    l.reports.unshift({ t: l.el, text: r })
    l.log.push({ t: l.el, lane: a.who === 'field' ? 'operator' : 'operator', text: `↳ ${r}`, level: /cannot|refused|not /i.test(r) ? 'warn' : 'ok' })
  }
}

// ---------------------------------------------------------------- the step

const IMPORTANT_INFO = /RESTART|reset|restored|extinguished|stopped|running$|AUTO-START|isolated/i

function stepScenario(_dt: number, t: number) {
  const l = L
  if (!l) return
  const s = sim()
  l.el = (t ?? s.t) - l.t0
  // auto marks: first shutdown per platform
  for (const p of ['Alpha', 'WHP-N', 'RP', 'WI'] as PlatformId[]) if (l.mark[`_down:${p}`] === undefined && downAtLeast(s, p)) l.mark[`_down:${p}`] = l.el
  if (!l.beforeDone && s.result) {
    l.beforeDone = true
    const b = snap(s)
    l.before = { ...b, produced: l.before.produced, potential: l.before.potential, losses: l.before.losses, trips: l.before.trips, shutdowns: l.before.shutdowns }
  }
  let c = ctx(l)

  // timeline
  for (const st of l.sc.timeline) {
    if (l.fired.has(st.id)) continue
    let due = true
    if (st.at !== undefined) due = l.el >= st.at
    else if (st.after) due = l.mark[st.after[0]] !== undefined && l.el >= l.mark[st.after[0]] + st.after[1]
    if (!due) continue
    if (st.when && !st.when(c)) continue
    l.fired.add(st.id)
    if (st.only && !st.only(c)) continue
    l.mark[st.id] = l.el
    if (st.run) st.run(c)
    if (st.ramp) l.ramps.push({ step: st, start: l.el })
    if (st.label) l.log.push({ t: l.el, lane: 'scenario', text: st.label, level: 'warn' })
    c = ctx(l)
  }
  for (const r of [...l.ramps]) {
    const f = Math.min(1, (l.el - r.start) / r.step.ramp!.dur)
    r.step.ramp!.apply(c, f)
    if (f >= 1) l.ramps.splice(l.ramps.indexOf(r), 1)
  }
  // ordered actions coming due
  for (const p of [...l.pending]) {
    if (l.el < p.due) continue
    l.pending.splice(l.pending.indexOf(p), 1)
    runAction(l, p.action)
  }

  const s2 = sim()
  trackAlarms(l, s2)
  collect(l, s2)
  c = ctx(l)

  // objectives
  for (const o of l.goals) {
    const st = l.objs[o.id]
    if (!st || st.status === 'done' || st.status === 'late' || st.status === 'missed' || st.status === 'failed') continue
    if (st.status === 'waiting') {
      const m = o.from ? l.mark[o.from] : 0
      if (m === undefined) continue
      st.status = 'active'
      st.since = m
    }
    const since = st.since ?? 0
    let hit = false
    try {
      hit = o.check(c)
    } catch {
      hit = false
    }
    if (o.kind === 'avoid') {
      if (hit) {
        st.status = 'failed'
        st.at = l.el
        l.log.push({ t: l.el, lane: 'plant', text: `✗ ${o.reason ?? o.text}`, level: 'bad' })
      }
      continue
    }
    if (hit) {
      st.at = l.el
      st.status = !o.window || l.el - since <= o.window + 1 ? 'done' : 'late'
    } else {
      const dl = o.deadline ?? (o.window ? o.window * 3 : undefined)
      if (dl !== undefined && l.el - since > dl) {
        st.status = 'missed'
        st.at = since + dl
      }
    }
  }

  // end?
  if (l.el >= l.sc.maxDuration) return finish()
  let complete = false
  try {
    complete = !!l.sc.complete?.(c)
  } catch {
    complete = false
  }
  if (complete) {
    l.settleSince ??= l.el
    if (l.el - l.settleSince >= (l.sc.settle ?? 120)) return finish()
  } else l.settleSince = undefined
  publish()
}

function trackAlarms(l: Live, s: SimState) {
  const now = new Set<string>()
  for (const a of s.alarms ?? []) {
    now.add(a.id)
    const el = a.raisedAt - l.t0
    let tr = l.alarms.get(a.id)
    if (!tr) {
      if (el < -1) continue // standing before the start
      tr = { id: a.id, tag: a.tag, text: a.text, priority: a.priority, raisedAt: Math.max(0, el), last: a.state }
      l.alarms.set(a.id, tr)
      l.alarmList.push(tr)
      if (a.priority <= 2) l.log.push({ t: tr.raisedAt, lane: 'plant', text: `P${a.priority} alarm: ${a.text}`, level: a.priority === 1 ? 'trip' : 'warn' })
    }
    if (tr.ackAt === undefined && (a.ackAt !== undefined || a.state === 'ack')) tr.ackAt = (a.ackAt ?? s.t) - l.t0
    if (a.state === 'shelved' && !tr.shelved) {
      tr.shelved = true
      tr.ackAt ??= l.el
      l.log.push({ t: l.el, lane: 'operator', text: `Shelved: ${a.tag}`, level: a.priority === 1 ? 'bad' : 'info' })
    }
    if (tr.ackAt !== undefined && tr.last !== 'acked') {
      if (tr.priority <= 2) l.log.push({ t: tr.ackAt, lane: 'operator', text: `Ack ${a.tag} (+${Math.round(tr.ackAt - tr.raisedAt)} s)`, level: tr.priority === 1 && tr.ackAt - tr.raisedAt > 120 ? 'warn' : 'ok' })
      tr.last = 'acked'
    } else if (tr.last !== 'acked') tr.last = a.state
  }
  // an alarm only leaves the list once acknowledged (and returned to normal) — possibly between two steps
  for (const tr of l.alarmList) {
    if (now.has(tr.id) || tr.ackAt !== undefined) continue
    if (tr.last !== 'acked' && tr.last !== 'shelved') {
      tr.ackAt = l.el
      if (tr.priority <= 2) l.log.push({ t: l.el, lane: 'operator', text: `Ack ${tr.tag} (+${Math.round(l.el - tr.raisedAt)} s)`, level: 'ok' })
      tr.last = 'acked'
    }
  }
}

function collect(l: Live, s: SimState) {
  // only what is new since the last tick: walk from the newest until an id already seen
  const evs = s.events ?? []
  let n = 0
  while (n < evs.length && evs[n].id > l.lastEvent) n++
  if (n) l.lastEvent = evs[0].id
  for (let i = n - 1; i >= 0; i--) {
    const e = evs[i]
    if (e.t < l.t0 || /^INSTRUCTOR:/.test(e.text)) continue
    if (e.level === 'info' && !IMPORTANT_INFO.test(e.text)) continue
    l.log.push({ t: e.t - l.t0, lane: 'plant', text: e.text, level: e.level })
  }
  const acts = s.actions ?? []
  n = 0
  while (n < acts.length && acts[n].id > l.lastAction) n++
  if (n) l.lastAction = acts[0].id
  for (let i = n - 1; i >= 0; i--) {
    const a = acts[i]
    if (a.t < l.t0 || !(a.who === 'operator' || a.who === 'field')) continue
    l.ops.push(a)
    if (a.action === 'scenario' || a.action === 'ack' || a.action === 'ackAll') continue
    {
      const refused = /^refused/.test(a.detail ?? '')
      l.log.push({ t: a.t - l.t0, lane: 'operator', text: `${a.who === 'field' ? 'Field: ' : ''}${a.action} ${a.tag ?? ''}${a.detail ? ` — ${a.detail}` : ''}`.trim(), level: refused ? 'warn' : 'info' })
    }
  }
  if (l.log.length > 600) l.log.splice(1, l.log.length - 600)
}

function finish(aborted?: string) {
  const l = L
  if (!l) return
  L = null
  const s = sim()
  const after = snap(s)
  collect(l, s)
  const actions = l.ops
  // close out the objectives
  for (const o of l.goals) {
    const st = l.objs[o.id]
    if (!st) continue
    if (st.status === 'waiting') st.status = 'na'
    else if (st.status === 'active') {
      if (o.kind === 'avoid') st.status = 'kept'
      else st.status = o.window && l.el - (st.since ?? 0) <= o.window ? 'na' : 'missed'
    }
  }
  l.log.push({ t: l.el, lane: 'scenario', text: aborted ? `Scenario aborted — ${aborted}` : 'Scenario end', level: aborted ? 'warn' : 'info' })
  const attempt = score({ sc: l.sc, goals: l.goals, objs: l.objs, alarms: l.alarmList, actions, t0: l.t0, el: l.el, before: l.before, after, hints: l.hints, log: l.log, aborted })
  // knobs the scenario changed go back
  actAs('scenario', () => {
    const g = sim()
    if (l.prevKnobs.autoChangeover !== undefined && g.knobs?.autoChangeover !== l.prevKnobs.autoChangeover) g.setKnob('autoChangeover', l.prevKnobs.autoChangeover)
    if (l.prevKnobs.reliability && g.knobs?.reliability !== l.prevKnobs.reliability) g.setKnob('reliability', l.prevKnobs.reliability)
    if (l.prevKnobs.wind && l.sc.setup?.knobs?.wind) g.setKnob('wind', l.prevKnobs.wind)
  })
  const history = [attempt, ...useScenario.getState().history].slice(0, 40)
  saveHistory(history)
  useScenario.setState({ live: null, last: attempt, history, view: { kind: 'debrief', attemptId: attempt.id } })
}

function publish() {
  const l = L
  if (!l) return
  const c = ctx(l)
  const objectives: ObjView[] = l.goals.map((o) => {
    const st = l.objs[o.id]
    return { id: o.id, text: o.text, kind: o.kind, status: st?.status ?? 'waiting', since: st?.since, at: st?.at, window: o.window, deadline: o.deadline, optional: o.optional, critical: o.critical }
  })
  const counted = objectives.filter((o) => !o.optional && o.id !== '_p1')
  const done = counted.filter((o) => o.status === 'done' || o.status === 'late').length
  const failed = counted.filter((o) => o.status === 'failed' || o.status === 'missed').length
  const actions: ActionView[] = actionList(l, c).map((a) => {
    const p = l.pending.find((x) => x.action.id === a.id)
    let ok = true
    try {
      ok = !a.available || a.available(c)
    } catch {
      ok = false
    }
    return { id: a.id, label: a.label, who: a.who, available: ok && !p, detail: a.detail, due: p?.due, done: l.did[`${a.id}:done`] }
  })
  useScenario.setState({
    live: {
      id: l.sc.id,
      title: l.sc.title,
      el: l.el,
      max: l.sc.maxDuration,
      objectives,
      done,
      total: counted.filter((o) => o.kind === 'do').length + counted.filter((o) => o.kind === 'avoid').length,
      failed,
      actions,
      reports: l.reports.slice(0, 8),
      hints: l.sc.hints.slice(0, l.hints),
      hintCount: l.sc.hints.length,
    },
  })
}

// ================================================================= plugin registration

const plugin: SimPlugin = {
  id: 'scenarios',
  step: (dt, t) => stepScenario(dt, t),
  reset: () => {
    if (starting || !L) return
    finish('the simulation was reset')
  },
}

if (typeof ext.registerSimPlugin === 'function') ext.registerSimPlugin(plugin)
else {
  // older engine: step on clock changes; a clock that goes backwards is a reset
  const unsub = useSim.subscribe((s, p) => {
    if (s.t < p.t) plugin.reset?.()
    else if (s.t > p.t) plugin.step(s.t - p.t, s.t)
  })
  if (import.meta.hot) import.meta.hot.dispose(() => unsub())
}
// a hot reload of this module drops the live run (its state lived in the old module)
if (import.meta.hot) import.meta.hot.dispose(() => (L = null))

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __scen: useScenario })

export { fmtEl }
