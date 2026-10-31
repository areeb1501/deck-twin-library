/**
 * An unattended run of a spec on the real engine, before anyone sees it: the plant does whatever it does with nobody at the
 * console. Validation proves the tags exist; this proves something happens. It takes a clean session, so in the browser it runs
 * in dryRun.worker.ts with its own copy of the engine and never touches the live plant.
 */
import { useSim } from '../../state/sim'
import { useScenario } from '../scenarios'
import { compile } from './compile'
import { UPSETS, type Cond, type ScenarioSpec } from './spec'

export interface DryRunReport {
  /** steps that fired, with when */
  fired: { id: string; label?: string; at: number }[]
  /** steps that did not fire with nobody responding. Fine for a step that waits on the operator */
  quiet: string[]
  /** the quiet steps that wait only on the plant: the scenario expected these to happen and they did not */
  unreached: string[]
  alarms: { tag: string; text: string; priority: number; at: number }[]
  shutdowns: { level: string; platform: string; cause: string; causeId: string; at: number }[]
  /** what a trainee who does nothing scores */
  idleScore: number
  idlePass: boolean
  deferredBoe: number
  /** sim seconds it ran */
  seconds: number
  /** reasons this spec should not be used as it stands */
  blockers: string[]
}

const FAILED = new Set(['failed', 'missed'])
/** a mark this soon, with no upset behind it, was already true in normal operation */
const AT_START_S = 2

/** does this condition depend on what the trainee does? */
function waitsOnOperator(c: Cond | undefined): boolean {
  if (!c) return false
  if (c.is === 'all' || c.is === 'any') return c.of.some(waitsOnOperator)
  if (c.is === 'not') return true
  return ['ordered', 'completed', 'acked', 'operatorDid', 'restarted'].includes(c.is)
}

/** the alarm tags a required objective asks the trainee to acknowledge */
function ackTags(c: Cond): string[] {
  if (c.is === 'acked') return [c.tag]
  return c.is === 'all' ? c.of.flatMap(ackTags) : []
}

export function dryRun(spec: ScenarioSpec): DryRunReport {
  const sc = compile({ ...spec, id: spec.id ?? 'custom:dry-run' })
  const scen = useScenario.getState()
  useSim.getState().setSpeed(1)
  const why = scen.start(sc, 1)
  if (why) throw new Error(why)
  const sim = useSim.getState()
  const t0 = sim.t
  const seen = new Map<string, DryRunReport['alarms'][number]>()
  for (let i = 0; i <= spec.maxDuration + 2 && useScenario.getState().live; i++) {
    sim.tick(1)
    for (const a of useSim.getState().alarms) if (!seen.has(a.id)) seen.set(a.id, { tag: a.tag, text: a.text, priority: a.priority, at: Math.max(0, Math.round(a.raisedAt - t0)) })
  }
  scen.abort('dry run over')
  const a = useScenario.getState().last
  if (!a) throw new Error('The dry run produced no attempt')
  const marks = a.marks ?? {}
  const fired = spec.timeline.filter((x) => marks[x.id] !== undefined).map((x) => ({ id: x.id, label: x.label, at: Math.round(marks[x.id]) })).sort((p, q) => p.at - q.at)
  const quiet = spec.timeline.filter((x) => marks[x.id] === undefined).map((x) => x.id)
  const alarms = [...seen.values()].filter((x) => x.priority <= 2).slice(0, 30)
  const shutdowns = useSim.getState().shutdowns.map((s) => ({ level: s.level, platform: s.platform, cause: s.cause, causeId: s.causeId, at: Math.max(0, Math.round(s.at - t0)) }))
  const blockers: string[] = []
  const upsetFired = spec.timeline.some((x) => x.do?.length && marks[x.id] !== undefined)
  if (!upsetFired) blockers.push('No timeline step with effects fired, so nothing happened to the plant.')
  else if (!alarms.length && !shutdowns.length && a.window.deferred < 50) blockers.push('The steps fired but the plant did not react: no alarm, no shutdown and no lost production. Use an effect that upsets the process.')
  if (a.pass) blockers.push(`A trainee who does nothing scores ${a.score} and passes. Add required objectives that need action, with windows that fall inside the scenario.`)
  const idle = a.objectives.filter((o) => o.status === 'na' && o.kind === 'do')
  if (idle.length === a.objectives.filter((o) => o.kind === 'do').length && !a.objectives.some((o) => FAILED.has(o.status))) blockers.push('None of the "do" objectives ever became active, so nothing was asked of the trainee.')
  const upsetAt = Math.min(...spec.timeline.filter((x) => x.do?.some((e) => UPSETS.includes(e.do)) && marks[x.id] !== undefined).map((x) => marks[x.id]))
  const setupUpset = spec.setup?.do?.some((e) => UPSETS.includes(e.do))
  for (const x of spec.timeline) {
    const early = x.when && x.at === undefined && !x.after && !x.do?.length && marks[x.id] !== undefined && marks[x.id] <= AT_START_S && marks[x.id] < upsetAt
    if (early && !setupUpset) blockers.push(`Step "${x.id}" fired at ${Math.round(marks[x.id])} s, before anything had gone wrong: its condition is already true in normal operation. Tie it to an earlier step with "after", or add a "fired" condition.`)
  }
  const raised = new Set([...seen.values()].map((x) => x.tag))
  for (const g of spec.goals) {
    if (g.kind !== 'do' || g.optional || a.objectives.find((o) => o.id === g.id)?.status === 'na') continue
    for (const tag of ackTags(g.check)) if (!raised.has(tag)) blockers.push(`Objective "${g.id}" asks to acknowledge ${tag}, but no alarm with that tag was raised. Alarms that were: ${[...raised].slice(0, 16).join(', ') || 'none'}.`)
  }
  const unreached = spec.timeline.filter((x) => marks[x.id] === undefined && !waitsOnOperator(x.when) && !waitsOnOperator(x.only) && (x.when || x.after)).map((x) => x.id)
  return { fired, quiet, unreached, alarms, shutdowns, idleScore: a.score, idlePass: a.pass, deferredBoe: Math.round(a.window.deferred), seconds: Math.round(a.duration), blockers }
}
