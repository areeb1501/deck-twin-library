/**
 * Scoring and debrief. An attempt scores 0–100:
 *
 *   safety      40 %  100 − penalties: avoidable escalations / trips, wrong ESD level, safety actions
 *                     missed (muster, verify deluge …) or late (half), reset / restart attempts refused
 *                     because the cause was still active (−5 each, max −20)
 *   production  25 %  barrels deferred vs the ideal response: 100 at (or below) the ideal, 0 when as much was
 *                     lost as a plant down for the whole max duration — so slow recovery costs points
 *   time        20 %  per expected action with a window: 1 on time, 1 → 0.2 linearly up to its deadline, 0 missed
 *   alarms      15 %  P1 acknowledged ≤ 2 min (70 %), P2 ≤ 5 min (30 %), −5 per shelved P1; blended
 *                     with the scenario's own acknowledgement objectives
 *   hints            −3 points each
 *
 * A failed critical objective caps the score at 45; pass = ≥ 70 with no critical failure.
 */
import type { Attempt, Breakdown, KpiSnap, ObjState, Objective, Scenario, TimelineRow, TrackedAlarm } from './types'
import { fmtEl } from './helpers'
import type { OperatorAction } from '../types'

export const WEIGHTS = { safety: 0.4, production: 0.25, time: 0.2, alarms: 0.15 }
export const HINT_COST = 3
export const P1_ACK_S = 120
export const P2_ACK_S = 300

export interface ScoreInput {
  sc: Scenario
  goals: Objective[]
  objs: Record<string, ObjState>
  alarms: TrackedAlarm[]
  /** the trainee's audit-trail actions (operator / field) during the attempt */
  actions: OperatorAction[]
  t0: number
  el: number
  before: KpiSnap
  after: KpiSnap
  hints: number
  log: TimelineRow[]
  aborted?: string
}

/** credit 0 … 1 of a timed 'do' objective */
function credit(o: Objective, st: ObjState): number {
  if (st.status === 'done') return 1
  if (st.status === 'late' && st.at !== undefined && st.since !== undefined && o.window) {
    const dl = o.deadline ?? o.window * 3
    const x = (st.at - st.since - o.window) / Math.max(1, dl - o.window)
    return Math.max(0.2, Math.min(1, 1 - 0.8 * x))
  }
  return 0
}

export function score(inp: ScoreInput): Attempt {
  const { sc, goals, objs, alarms, el } = inp
  const failures: string[] = []
  const wentWell: string[] = []
  const improve: string[] = []
  let critical = false
  const lessons = new Set<string>()

  // ---------------------------------------------------------------- safety
  let safety = 100
  for (const o of goals) {
    const st = objs[o.id]
    if (!st) continue
    const bad = st.status === 'failed' || (o.kind === 'do' && st.status === 'missed' && !o.optional)
    if (bad) {
      if (o.category === 'safety') safety -= o.penalty ?? 15
      if (o.critical) critical = true
      if (o.reason) failures.push(o.reason)
      if (o.lesson) lessons.add(o.lesson)
    } else if (o.kind === 'do' && st.status === 'late' && o.category === 'safety') {
      safety -= (o.penalty ?? 15) / 2
      improve.push(`${o.text} — done, but late (${fmtEl((st.at ?? 0) - (st.since ?? 0))} after the cue, target ${fmtEl(o.window ?? 0)})`)
      if (o.lesson) lessons.add(o.lesson)
    }
  }
  const refused = inp.actions.filter((a) => (a.action === 'resetShutdown' || a.action === 'restart') && /^refused/.test(a.detail ?? ''))
  if (refused.length) {
    safety -= Math.min(20, refused.length * 5)
    failures.push(`${refused.length} reset / restart attempt${refused.length > 1 ? 's were' : ' was'} refused because the cause was still active`)
    lessons.add('Read why a reset is refused: the console tells you which cause is still active. Fix it, then reset.')
  }
  safety = Math.max(0, safety)

  // ---------------------------------------------------------------- production
  const dProd = inp.after.produced - inp.before.produced
  const dPot = inp.after.potential - inp.before.potential
  const pe = dPot > 1 ? Math.min(100, (dProd / dPot) * 100) : 100
  const deferred = Math.max(0, dPot - dProd)
  const idealDeferred = sc.ideal.deferredBoe
  const fullLoss = el > 0 ? (dPot / el) * sc.maxDuration : 0
  const production = fullLoss <= idealDeferred ? 100 : Math.max(0, Math.min(100, (100 * (fullLoss - deferred)) / (fullLoss - idealDeferred)))
  const byCategory: Record<string, number> = {}
  for (const [k, v] of Object.entries(inp.after.losses)) {
    const d = v - (inp.before.losses[k] ?? 0)
    if (d > 0.5) byCategory[k] = d
  }

  // ---------------------------------------------------------------- time
  const timed = goals.filter((o) => o.kind === 'do' && o.window && !o.optional && objs[o.id] && objs[o.id].status !== 'na' && o.category !== 'alarms')
  const time = timed.length ? (timed.reduce((a, o) => a + credit(o, objs[o.id]), 0) / timed.length) * 100 : 100

  // ---------------------------------------------------------------- alarms
  const counted = alarms.filter((a) => a.ackAt !== undefined || el - a.raisedAt > (a.priority === 1 ? P1_ACK_S : P2_ACK_S))
  const p1 = counted.filter((a) => a.priority === 1)
  const p2 = counted.filter((a) => a.priority === 2)
  const inTime = (a: TrackedAlarm, w: number) => a.ackAt !== undefined && a.ackAt - a.raisedAt <= w
  const p1ok = p1.filter((a) => inTime(a, P1_ACK_S)).length
  const p2ok = p2.filter((a) => inTime(a, P2_ACK_S)).length
  const shelvedP1 = alarms.filter((a) => a.priority === 1 && a.shelved).length
  const ackTimes = alarms.filter((a) => a.ackAt !== undefined).map((a) => a.ackAt! - a.raisedAt)
  let alarmScore = 100 * ((p1.length ? (0.7 * p1ok) / p1.length : 0.7) + (p2.length ? (0.3 * p2ok) / p2.length : 0.3)) - Math.min(20, shelvedP1 * 5)
  const ackGoals = goals.filter((o) => o.category === 'alarms' && o.kind === 'do' && objs[o.id] && objs[o.id].status !== 'na')
  if (ackGoals.length) alarmScore = 0.6 * alarmScore + 0.4 * ((ackGoals.reduce((a, o) => a + credit(o, objs[o.id]), 0) / ackGoals.length) * 100)
  alarmScore = Math.max(0, Math.min(100, alarmScore))
  if (p1.length && p1ok < p1.length) {
    failures.push(`${p1.length - p1ok} of ${p1.length} P1 alarm${p1.length > 1 ? 's' : ''} not acknowledged within 2 min`)
    lessons.add('ISA-18.2: a priority-1 alarm needs a response within minutes — acknowledge, then act.')
  }
  if (shelvedP1) improve.push(`${shelvedP1} P1 alarm${shelvedP1 > 1 ? 's were' : ' was'} shelved — shelving is for nuisance alarms, never for an emergency in progress`)

  // ---------------------------------------------------------------- total
  const breakdown: Breakdown = { safety: Math.round(safety), production: Math.round(production), time: Math.round(time), alarms: Math.round(alarmScore), hints: inp.hints * HINT_COST }
  let total = WEIGHTS.safety * safety + WEIGHTS.production * production + WEIGHTS.time * time + WEIGHTS.alarms * alarmScore - inp.hints * HINT_COST
  if (critical) total = Math.min(total, 45)
  total = Math.max(0, Math.min(100, Math.round(total)))
  if (inp.aborted) failures.unshift(`Attempt aborted: ${inp.aborted}`)

  // ---------------------------------------------------------------- what went well / to improve
  for (const o of goals) {
    const st = objs[o.id]
    if (!st) continue
    if (o.kind === 'do' && st.status === 'done') wentWell.push(`${o.text}${st.at !== undefined && st.since !== undefined && o.window ? ` — ${fmtEl(st.at - st.since)} after the cue (target ${fmtEl(o.window)})` : ''}`)
    if (o.kind === 'avoid' && st.status === 'kept' && (o.critical || (o.penalty ?? 0) >= 20)) wentWell.push(o.text.replace(/^Avoid /, 'Avoided ').replace(/^Do not /, 'Did not '))
    if (o.kind === 'do' && st.status === 'late' && o.category !== 'safety') improve.push(`${o.text} — late (${fmtEl((st.at ?? 0) - (st.since ?? 0))} after the cue, target ${fmtEl(o.window ?? 0)})`)
    if (o.kind === 'do' && st.status === 'missed' && o.optional) improve.push(`Optional: ${o.text}`)
    if (st.status === 'late' && o.lesson) lessons.add(o.lesson)
  }
  if (p1.length && p1ok === p1.length) wentWell.push(`All ${p1.length} P1 alarm${p1.length > 1 ? 's' : ''} acknowledged within 2 min${ackTimes.length ? ` (mean ${Math.round(ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length)} s)` : ''}`)
  if (production >= 95) wentWell.push(`Deferred production ${Math.round(deferred).toLocaleString()} boe — at or near the ideal response (${idealDeferred.toLocaleString()} boe)`)
  else improve.push(`Deferred production ${Math.round(deferred).toLocaleString()} boe vs ${idealDeferred.toLocaleString()} boe for an ideal response — ${Math.round(deferred - idealDeferred).toLocaleString()} boe more than needed (PE ${pe.toFixed(0)} % over the scenario)`)
  if (inp.hints) improve.push(`${inp.hints} hint${inp.hints > 1 ? 's' : ''} used (−${inp.hints * HINT_COST})`)
  for (const l of lessons) improve.push(l)

  // ---------------------------------------------------------------- timeline: expected lane
  const rows: TimelineRow[] = [...inp.log]
  for (const o of goals) {
    const st = objs[o.id]
    if (!st || o.kind !== 'do' || st.since === undefined || st.status === 'na') continue
    rows.push({ t: st.since, lane: 'expected', text: `${o.text}${o.window ? ` — due by ${fmtEl(st.since + o.window)}` : ''}`, level: 'info' })
    if (st.status === 'done' || st.status === 'late') rows.push({ t: st.at ?? st.since, lane: 'expected', text: `${st.status === 'done' ? '✓' : '◷ late:'} ${o.text}`, level: st.status === 'done' ? 'ok' : 'warn' })
    else if (st.status === 'missed') rows.push({ t: st.at ?? el, lane: 'expected', text: `✗ missed: ${o.text}`, level: 'bad' })
  }
  for (const o of goals) {
    const st = objs[o.id]
    if (o.kind === 'avoid' && st?.status === 'failed') rows.push({ t: st.at ?? el, lane: 'expected', text: `✗ ${o.text}`, level: 'bad' })
  }
  rows.sort((a, b) => a.t - b.t)

  return {
    id: `${sc.id}-${Date.now().toString(36)}`,
    scenarioId: sc.id,
    title: sc.title,
    date: new Date().toISOString(),
    duration: el,
    aborted: inp.aborted,
    score: total,
    pass: total >= 70 && !critical && !inp.aborted,
    breakdown,
    failures,
    wentWell,
    improve,
    objectives: goals.map((o) => ({ id: o.id, text: o.text, kind: o.kind, status: objs[o.id]?.status ?? 'na', at: objs[o.id]?.at, window: o.window, from: objs[o.id]?.since })),
    timeline: rows.slice(0, 220),
    before: inp.before,
    after: inp.after,
    window: { pe, deferred, idealDeferred, fullLoss, byCategory },
    alarms: { p1: p1.length, p1Late: p1.length - p1ok, p2: p2.length, p2Late: p2.length - p2ok, shelvedP1, meanAckS: ackTimes.length ? ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length : null },
    hintsUsed: inp.hints,
  }
}
