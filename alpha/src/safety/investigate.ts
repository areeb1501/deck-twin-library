/**
 * Agentic investigation (plan 04, part D): a multi-step analysis of an alert or a plant item.
 *
 * The plan runs as visible steps ~700 ms apart. Each step is one or more read-only tool calls through
 * `runTool` (agentTools.ts), written to the trace as it happens, so the console shows the agent
 * working. Step 7 is a rule-based synthesis; plan 09 can replace it (and optionally the step order)
 * with a model, keeping the same tools, trace and report shape.
 *
 * Beyond the lookups it runs the two hard-to-spot checks: barrier erosion in the zone / platform and
 * slow drift of the sensors towards a trip. Advisory only: no simulation actions are called.
 */
import { create } from 'zustand'
import type { PlatformId } from '../sim/types'
import type { TraceStep } from './types'
import { addTrace, newTraceId, useAlerts } from './alerts'
import { runTool } from './agentTools'
import { jsonFrom, modelOn, runAgent } from '../agents/runtime'
import { PLANT_CONTEXT } from '../agents/catalog'

export interface InvestigationReport {
  summary: string
  likelyCause: string
  evidence: string[]
  actions: string[]
  cameras: string[]
  /** findings no single alarm shows (barrier erosion, slow drift) */
  hidden: string[]
}
export interface InvestigationRun {
  traceId: string
  title: string
  status: 'running' | 'done'
  steps: TraceStep[]
  /** label of the step in progress (spinner) */
  pending?: string
  target: { alertId?: string; tag?: string }
  startedAt: number
  report?: InvestigationReport
}

interface InvStore {
  runs: Record<string, InvestigationRun>
  /** trace ids, newest first */
  order: string[]
}
export const useInvestigations = create<InvStore>(() => ({ runs: {}, order: [] }))

const STEP_MS = 700
const CAP_RUNS = 30

type J = Record<string, unknown>
const arr = (v: unknown) => (Array.isArray(v) ? (v as J[]) : [])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function patch(traceId: string, fn: (r: InvestigationRun) => Partial<InvestigationRun>) {
  useInvestigations.setState((s) => {
    const r = s.runs[traceId]
    return r ? { runs: { ...s.runs, [traceId]: { ...r, ...fn(r) } } } : {}
  })
}
function mirror(traceId: string, step: TraceStep | undefined) {
  if (step) patch(traceId, (r) => ({ steps: [...r.steps, step] }))
}
/** the last trace step written for this trace (tool steps are written by runTool) */
function lastStep(traceId: string): TraceStep | undefined {
  const tr = useAlerts.getState().trace
  for (let i = tr.length - 1; i >= Math.max(0, tr.length - 5); i--) if (tr[i].traceId === traceId) return tr[i]
  return undefined
}

/** start an investigation; returns its trace id at once and runs the steps asynchronously */
export function investigate(target: { alertId?: string; tag?: string }): string {
  const alert = target.alertId ? useAlerts.getState().alerts.find((a) => a.id === target.alertId) : undefined
  const tag = target.tag ?? alert?.tags[0]
  const title = alert ? `Investigation: ${alert.title}` : `Investigation: ${tag ?? 'field'}`
  const traceId = newTraceId('INV')
  useInvestigations.setState((s) => {
    const order = [traceId, ...s.order].slice(0, CAP_RUNS)
    const runs: Record<string, InvestigationRun> = {}
    for (const id of order) runs[id] = s.runs[id]
    runs[traceId] = { traceId, title, status: 'running', steps: [], target, startedAt: Date.now() }
    return { runs, order }
  })
  if (alert) addTrace(alert.traceId, { actor: 'operator', kind: 'act', text: `Investigation ${traceId} started`, data: { investigation: traceId } })
  void run(traceId, alert?.platform, tag, alert?.title ?? '', alert ? { rule: alert.rule, title: alert.title, severity: alert.severity } : null)
  return traceId
}

async function run(traceId: string, platform0: PlatformId | undefined, tag: string | undefined, alertTitle: string, alert: J | null) {
  const say = (text: string, data?: J, kind: TraceStep['kind'] = 'decide') => mirror(traceId, addTrace(traceId, { actor: 'assistant', kind, text, ...(data ? { data } : {}) }))
  const tool = (name: string, args: J) => {
    const r = (runTool(name, args, traceId) ?? {}) as J
    mirror(traceId, lastStep(traceId))
    return r
  }
  const stepTo = async (label: string) => {
    patch(traceId, () => ({ pending: label }))
    await sleep(STEP_MS)
  }

  const evidence: string[] = []
  const hidden: string[] = []
  const actions: string[] = []
  const cameras: string[] = []
  const causes: { rank: number; text: string }[] = []
  let platform: PlatformId = platform0 ?? 'Alpha'
  let zone: string | null = null

  try {
    say(`Plan: scope → sensors → fire & gas → barriers → drift & history → consequence → synthesis${tag ? ` (around ${tag})` : ''}`, { target: tag ?? null, alert })

    // 1. scope
    await stepTo('1/7 Scope: the item and the alarms around it')
    let instruments: string[] = []
    let kind = ''
    if (tag) {
      const found = arr(tool('search_tags', { query: tag }).matches).find((m) => m.tag === tag)
      kind = String(found?.kind ?? '')
      if (kind === 'instrument') {
        const sn = tool('get_sensor', { tag })
        instruments = [tag]
        zone = (sn.zone as string) ?? null
        if (sn.platform) platform = sn.platform as PlatformId
        if (sn.on) {
          const host = tool('get_equipment', { tag: sn.on })
          if (!host.error) evidence.push(`${tag} is on ${host.tag} (${host.name}), ${host.runState ?? ''}`)
        }
      } else if (kind) {
        const e = tool('get_equipment', { tag })
        if (!e.error) {
          zone = (e.zone as string) ?? null
          platform = (e.platform as PlatformId) ?? platform
          instruments = ((e.instruments as string[]) ?? []).slice(0, 5)
          if (e.tripCause) causes.push({ rank: 0, text: `${tag} tripped: ${e.tripCause}` })
          const h = e.health as J | null
          if (h && h.stage !== 'normal') {
            evidence.push(`${tag} condition ${h.stage} (degradation ${h.degradationPct} %${h.mode ? `, ${h.mode}` : ''})`)
            causes.push({ rank: h.stage === 'failed' ? 1 : 4, text: `${tag} machine condition ${h.stage}${h.mode ? `: ${h.mode}` : ''}` })
          }
          const v = e.valve as J | null
          if (v?.fault) {
            evidence.push(`${tag} valve fault: ${v.fault} (${v.position} % open, commanded ${v.command})`)
            causes.push({ rank: 1, text: `${tag} valve ${v.fault} at ${v.position} % open` })
          }
          for (const m of arr(e.metrics)) if (m.state !== 'normal') evidence.push(`${m.label} ${m.value} ${m.unit} [${m.state}]`)
          for (const w of arr(e.openWorkOrders)) evidence.push(`Open work order ${w.id}: ${w.title} (${w.status})`)
        }
      }
    }
    const al = tool('get_alarms', { platform })
    const p1 = arr(al.alarms).filter((a) => a.priority === 1)
    if (Number(al.count)) evidence.push(`${al.count} active alarm(s) on ${platform} (${p1.length} P1)`)
    const firstOut = arr(al.alarms).slice(-1)[0]
    if (firstOut) evidence.push(`Oldest standing alarm (first-out candidate): ${firstOut.tag} ${firstOut.text} at ${firstOut.raised}`)
    say(`Scope: ${tag ?? 'field'}${kind ? ` (${kind})` : ''} on ${platform}${zone ? `, zone ${zone}` : ''}; ${al.count} active alarm(s)`, { platform, zone, instruments })

    // 2. sensors
    await stepTo('2/7 Sensors: readings against their limits')
    const outOfLimits: string[] = []
    for (const inst of instruments) {
      const sn = tool('get_sensor', { tag: inst })
      if (sn.error) continue
      if (sn.state !== 'normal') {
        outOfLimits.push(`${inst} ${sn.value} ${sn.unit} [${sn.state}]`)
        causes.push({ rank: String(sn.state).length > 2 ? 1 : 2, text: `${inst} at ${sn.value} ${sn.unit} (${sn.state === 'hiHi' ? 'high-high trip' : sn.state === 'loLo' ? 'low-low trip' : sn.state === 'hi' ? 'high alarm' : 'low alarm'})` })
      }
    }
    evidence.push(...outOfLimits)
    say(instruments.length ? `Sensors: ${instruments.length} read, ${outOfLimits.length} out of limits${outOfLimits.length ? `: ${outOfLimits.join('; ')}` : ''}` : 'Sensors: no instruments on the item', { outOfLimits }, 'assess')

    // 3. fire & gas + cameras
    await stepTo('3/7 Fire & gas: zone state and visual confirmation')
    const fg = tool('get_fire_gas', zone ? { zone } : { platform })
    for (const z of arr(fg.zones)) {
      if (z.gas === 'normal' && z.fire === 'normal' && z.smoke === 'normal') continue
      evidence.push(`${z.name}: gas ${z.gas}, fire ${z.fire}, smoke ${z.smoke}${z.deluge ? ', deluge released' : ''}`)
      if (z.fire !== 'normal') causes.push({ rank: z.fire === 'confirmed' ? 0 : 2, text: `Fire ${z.fire} in ${z.name}` })
      if (z.gas !== 'normal') causes.push({ rank: z.gas === 'confirmed' ? 0 : z.gas === 'high' ? 1 : 3, text: `Gas release in ${z.name} (${z.gas})` })
      if (!zone) zone = String(z.zone)
    }
    const dets = arr(fg.detectorsInAlarm)
    if (dets.length) evidence.push(`Detectors in alarm: ${dets.slice(0, 5).map((d) => `${d.tag} ${d.value}`).join(', ')}`)
    for (const d of arr(fg.inhibited)) evidence.push(`${d.tag} inhibited, not voting`)
    const cams = tool('get_cameras', tag ? { tag } : { platform })
    for (const c of arr(cams.cameras)) {
      cameras.push(String(c.name))
      for (const d of arr(c.detections)) if (d.kind === 'fire' || d.kind === 'gasCloud') evidence.push(`Camera ${c.name} sees ${d.kind} (${d.confidence})`)
    }
    say(`Fire & gas: ${arr(fg.zones).length} abnormal zone(s), ${dets.length} detector(s) in alarm; ${cameras.length ? `cameras ${cameras.join(', ')}` : cams.available ? 'no camera covers it' : 'CCTV not available yet'}`, undefined, 'assess')

    // 4. barriers (hard check a)
    await stepTo('4/7 Barriers: permits, inhibits, stuck valves, Swiss-cheese check')
    const pm = tool('get_permits', { platform })
    for (const c of arr(pm.conflicts)) evidence.push(`SIMOPS conflict: ${c.permit}: ${c.reason}`)
    const hot = arr(pm.permits).filter((x) => /hot/i.test(String(x.type)) && x.status === 'issued')
    if (hot.length) evidence.push(`Live hot-work permit(s): ${hot.map((x) => `${x.id} on ${x.tag}`).join(', ')}`)
    const er = tool('check_barrier_erosion', zone ? { zone } : { platform })
    const erF = arr(er.findings)
    for (const f of erF) {
      const layers = arr(f.layers)
      const line = `${f.zoneName}: ${layers.length} layer(s) weakened: ${layers.map((l) => l.text).join('; ')}`
      if (f.aligned) {
        hidden.push(`Barrier erosion: ${line}`)
        actions.push(...((f.actions as string[]) ?? []))
      } else evidence.push(line)
    }
    if (zone && !erF.length) {
      // the zone itself is clean: look wider (the same platform) before concluding
      const wide = tool('check_barrier_erosion', { platform })
      for (const f of arr(wide.findings)) if (f.aligned) hidden.push(`Barrier erosion nearby: ${f.zoneName}: ${arr(f.layers).map((l) => l.text).join('; ')}`)
    }
    say(`Barriers: ${arr(pm.permits).length} permit(s), ${arr(pm.conflicts).length} SIMOPS conflict(s); ${erF.filter((f) => f.aligned).length} zone(s) with three or more layers weakened at once`, undefined, 'assess')

    // 5. drift (hard check b) + history
    await stepTo('5/7 Drift and history: slow trends and recent events')
    const dr = tool('check_sensor_drift', tag && kind ? { tag } : { platform })
    let drifting = arr(dr.drifting)
    if (!drifting.length && tag) drifting = arr(tool('check_sensor_drift', { platform }).drifting)
    for (const d of drifting.slice(0, 3)) {
      hidden.push(`Slow drift: ${d.label} ${d.value} ${d.unit} moving ${Number(d.ratePerHour) > 0 ? '+' : ''}${d.ratePerHour} ${d.unit}/h, inside its alarm limits, ~${Math.round(Number(d.minutesToTrip))} min to ${d.limitName} ${d.limit}`)
      causes.push({ rank: 3, text: `${d.label} drifting towards its ${d.limitName}` })
      actions.push(...((d.actions as string[]) ?? []).slice(0, 2))
    }
    const ev = tool('get_events', tag ? { tag, limit: 8 } : { limit: 8 })
    const evs = arr(ev.events)
    for (const e of evs.slice(0, 4)) evidence.push(`${e.at} ${e.text}`)
    const trip = evs.find((e) => /TRIPPED|trip/i.test(String(e.text)))
    if (trip) causes.push({ rank: 1, text: String(trip.text) })
    say(`Drift: ${drifting.length} signal(s) creeping towards a trip${dr.note ? ` (${dr.note})` : ''}; history: ${ev.count} event(s)`, undefined, 'assess')

    // 6. consequence
    await stepTo('6/7 Consequence: shutdown cause and what happens next')
    const sd = tool('get_shutdown_cause', { platform })
    for (const s of arr(sd.shutdowns)) {
      if (s.reset) continue
      causes.push({ rank: 0, text: `${s.level} initiated by ${s.cause}` })
      const ce = s.causeEffect as J | null
      if (ce) actions.push(...(ce.effects as string[]).slice(0, 3).map((e) => `Verify: ${e}`))
      actions.push(s.resettable ? `${s.level}: cause cleared, reset, then restart ${platform} in sequence` : `${s.level}: do not reset until the cause clears`)
    }
    // only a strong match (the tag is in the scenario, or several words agree) — a weak one misleads
    const sc = arr(tool('find_scenarios', { query: `${alertTitle} ${tag ?? ''}`, ...(tag ? { tag } : {}) }).matches).filter((m) => Number(m.score) >= 4)
    let consequence = ''
    if (sc.length) {
      const c = tool('get_scenario_consequence', { scenarioId: sc[0].id })
      const cq = c.consequence as J | null
      consequence = cq ? `Worst case ${cq.worstShutdown} on ${arr(cq.platforms).join(', ')} (≈ ${((cq.deferredBoe as J) ?? {}).unmitigated ?? '-'} boe unmitigated)` : `Closest training scenario: "${c.title}"`
      actions.push(...((c.expected as string[]) ?? []).slice(0, 3))
    }
    say(`Consequence: ${arr(sd.shutdowns).length} shutdown(s) on ${platform}${consequence ? `; ${consequence}` : ''}`, undefined, 'assess')

    // 7. synthesis
    await stepTo('7/7 Synthesis: likely cause, evidence, actions')
    causes.sort((a, b) => a.rank - b.rank)
    const likelyCause = causes[0]?.text ?? (alertTitle || `No abnormal condition found around ${tag ?? platform}`)
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]
    const acts = uniq(actions)
    if (!acts.length) acts.push('Keep monitoring; no action needed from the evidence gathered')
    let report: InvestigationReport = {
      summary: `${tag ?? platform}: ${likelyCause}.${hidden.length ? ` ${hidden.length} hard-to-spot finding(s): ${hidden.map((h) => h.split(' - ')[0]).join(', ')}.` : ''}${consequence ? ` ${consequence}.` : ''}`,
      likelyCause,
      evidence: uniq(evidence).slice(0, 14),
      actions: acts.slice(0, 8),
      cameras: uniq(cameras),
      hidden: uniq(hidden),
    }
    let planner = 'local-rules'
    // root-cause synthesis on Muse Spark when it is connected; rules otherwise
    if (modelOn()) {
      try {
        const r = await runAgent({
          traceId,
          system: PLANT_CONTEXT,
          user: `Root-cause analysis for: ${alertTitle || tag || platform}. Evidence gathered so far:\n${JSON.stringify(report)}\nCheck it against the evidence below, separate the root cause from consequences, and reply ONLY with JSON {"summary": string, "likelyCause": string, "hidden": string[], "actions": string[]} (max 6 actions, advisory).`,
        })
        const j = jsonFrom<Partial<InvestigationReport>>(r.text)
        if (j?.likelyCause) {
          report = { ...report, summary: j.summary ?? report.summary, likelyCause: j.likelyCause, hidden: uniq([...(j.hidden ?? []), ...report.hidden]), actions: uniq([...(j.actions ?? []), ...report.actions]).slice(0, 8) }
          planner = r.model
        }
      } catch (e) {
        say(`Model unavailable (${e instanceof Error ? e.message : String(e)}): rule-based synthesis`, undefined, 'decide')
      }
    }
    say(`Report: likely cause, ${report.likelyCause}. ${report.actions.length} advisory action(s); the operator decides.`, { report, planner }, 'answer')
    patch(traceId, () => ({ status: 'done', pending: undefined, report }))
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    say(`Investigation failed: ${err}`, undefined, 'answer')
    patch(traceId, () => ({ status: 'done', pending: undefined, report: { summary: `Failed: ${err}`, likelyCause: '-', evidence, actions, cameras, hidden } }))
  }
}
