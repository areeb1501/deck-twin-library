/**
 * Agent workflow catalogue (docs/plans/09-agents-and-models.md, 9b). A workflow is a fixed process:
 * a system prompt, the tools it may use and the output it must give. The model is a setting, so the
 * same workflow runs on the local planner (`sim`), NVIDIA Nemotron (Token Factory) or, later, Muse Spark.
 *
 * Two kinds:
 *  - easy but slow: minutes of clicking for a person, seconds for an agent (shift brief, SIMOPS check);
 *  - hard to spot: combinations and trends a person misses (barrier erosion, drift, cascades, optimiser).
 * All of them are advisory — recommendations are for the operator to act on.
 */
import { runTool, summarise } from '../safety/agentTools'
import { addTrace, newTraceId } from '../safety/alerts'
import { create } from 'zustand'
import { useSim } from '../state/sim'
import { fmtClock } from '../sim/types'
import { useProvider } from './provider'
import { runAgent } from './runtime'

export const PLANT_CONTEXT = `You are the safety & operations agent of the Alpha offshore oil field digital twin: five bridge-linked platforms — Alpha PDQ (process, drilling), WHP-N (wellheads), RP (risers & export), WI (water injection), LQ (accommodation & central control room).
Process: wells → manifold M-1000 → HP 3-phase separator V-1100 (LAHH 83 %, PSV 42 barg) → LP separator V-1300 → crude cooler E-1400 → export pumps P-1500A/B → pig launcher → RP fiscal metering → export riser. Gas → scrubber → export compressor K-2200 (anti-surge) → gas export; fuel gas → turbines GT-8100A/B.
Shutdown hierarchy APS > ESD1 > ESD2 > PSD > USD. Confirmed gas (2ooN) → ESD2 + blowdown; confirmed fire → ESD1 + deluge.
Rules: use the tools to get live facts — never invent values, cite tags and numbers. You are ADVISORY: recommend actions, the operator decides. Be concise and specific.`

export interface Workflow {
  id: string
  title: string
  kind: 'easy-slow' | 'hard-to-spot'
  /** what it is for, one line */
  blurb: string
  /** tools the model may call */
  tools: string[]
  /** the task given to the model */
  task: string
  /** offline version: the tools to run (sim provider) */
  local: { tool: string; args?: Record<string, unknown> }[]
}

export const WORKFLOWS: Workflow[] = [
  {
    id: 'shift-brief',
    title: 'Shift handover safety brief',
    kind: 'easy-slow',
    blurb: 'Top risks, standing alarms, open permits, inhibits and hidden findings for the incoming shift.',
    tools: ['get_field_status', 'get_risk', 'get_alarms', 'get_permits', 'get_fire_gas', 'check_barrier_erosion', 'check_sensor_drift', 'get_events'],
    task: 'Write the safety brief for the incoming shift: 1) field status in one line, 2) top 3 risks with the reason, 3) standing alarms worth attention, 4) permits and inhibits in force, 5) hidden findings (barrier erosion, drift), 6) three things to do first. Max 180 words.',
    local: [{ tool: 'get_field_status' }, { tool: 'get_risk' }, { tool: 'get_alarms', args: { priority: 2 } }, { tool: 'get_permits' }, { tool: 'check_barrier_erosion' }, { tool: 'check_sensor_drift' }],
  },
  {
    id: 'simops',
    title: 'Permit-to-work SIMOPS check',
    kind: 'easy-slow',
    blurb: 'Is hot work, crane work or confined-space entry safe right now, platform by platform?',
    tools: ['get_permits', 'get_fire_gas', 'get_risk', 'get_alarms', 'check_barrier_erosion'],
    task: 'For each platform, give a GO / NO-GO for hot work, crane lifts and confined-space entry right now, with the reason (gas readings, permits in conflict, inhibits, wind). Then list the conflicts to resolve.',
    local: [{ tool: 'get_permits' }, { tool: 'get_fire_gas' }, { tool: 'check_barrier_erosion' }],
  },
  {
    id: 'barrier-watch',
    title: 'Barrier erosion watch',
    kind: 'hard-to-spot',
    blurb: 'Combinations no single alarm shows: inhibits + degraded machines + hot work + weather in one zone.',
    tools: ['check_barrier_erosion', 'get_fire_gas', 'get_permits', 'get_equipment', 'get_risk'],
    task: 'Find places where several safety barriers are weakened at the same time (Swiss-cheese alignment). For each: the zone, the weakened layers with evidence, why the combination matters, and the one action that restores the most protection.',
    local: [{ tool: 'check_barrier_erosion' }, { tool: 'get_risk' }],
  },
  {
    id: 'drift',
    title: 'Slow-drift detector',
    kind: 'hard-to-spot',
    blurb: 'Sensors creeping toward a trip while still inside their alarm limits.',
    tools: ['check_sensor_drift', 'get_sensor', 'get_equipment'],
    task: 'Find process or machine signals drifting toward a trip limit while still inside their alarm limits. For each: tag, rate, minutes to trip, the likely physical cause, and what to check in the field.',
    local: [{ tool: 'check_sensor_drift' }],
  },
  {
    id: 'cascade',
    title: 'Cascade forecast — what trips next',
    kind: 'hard-to-spot',
    blurb: 'From the current state, the chain of trips and shutdowns that would follow, and how to break it.',
    tools: ['get_field_status', 'get_alarms', 'get_shutdown_cause', 'find_scenarios', 'get_scenario_consequence', 'check_sensor_drift'],
    task: 'From the current plant state, forecast the next 30 minutes: which equipment or shutdown is most likely to trip next, the chain that follows (with rough timings), the production at stake, and the single intervention that breaks the chain earliest.',
    local: [{ tool: 'get_field_status' }, { tool: 'get_alarms' }, { tool: 'check_sensor_drift' }, { tool: 'find_scenarios', args: { query: 'trip' } }],
  },
  {
    id: 'optimiser',
    title: 'Production optimiser',
    kind: 'hard-to-spot',
    blurb: 'Suggestions to recover deferred production within the safety limits — do A, B, C.',
    tools: ['get_field_status', 'get_equipment', 'get_sensor', 'get_risk'],
    task: 'Find the binding constraint on production now and suggest up to three concrete, safe operator actions (e.g. start the standby pump, rebalance chokes, raise compressor speed while the surge margin allows), each with the expected gain in boe/d and the limit to watch. Never suggest bypassing a safety function.',
    local: [{ tool: 'get_field_status' }, { tool: 'get_equipment', args: { tag: 'K-2200' } }, { tool: 'get_risk' }],
  },
]

export interface WorkflowRun {
  id: string
  workflow: string
  traceId: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  provider: string
  model?: string
  text?: string
}

export const useWorkflowRuns = create<{ runs: WorkflowRun[] }>(() => ({ runs: [] }))
const patch = (id: string, p: Partial<WorkflowRun>) => useWorkflowRuns.setState((s) => ({ runs: s.runs.map((r) => (r.id === id ? { ...r, ...p } : r)) }))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let seq = 0

const TOOL_LABEL: Record<string, string> = {
  get_field_status: 'Field status',
  get_risk: 'Risk',
  get_alarms: 'Alarms',
  get_permits: 'Permits',
  get_fire_gas: 'Fire & gas',
  check_barrier_erosion: 'Barrier erosion',
  check_sensor_drift: 'Sensor drift',
  find_scenarios: 'Matching scenarios',
  get_equipment: 'Equipment',
}
/** one line per tool result for the offline report (the same summary the trace shows) */
function brief(name: string, r: unknown): string {
  return `• ${TOOL_LABEL[name] ?? name}: ${summarise(name, r)}`
}

/** run a workflow on the selected provider (falls back to the offline version on any failure) */
export async function runWorkflow(id: string): Promise<WorkflowRun | undefined> {
  const wf = WORKFLOWS.find((w) => w.id === id)
  if (!wf) return undefined
  const provider = useProvider.getState().provider
  const traceId = newTraceId('WF')
  const run: WorkflowRun = { id: `R${++seq}`, workflow: id, traceId, status: 'running', startedAt: useSim.getState().t, provider }
  useWorkflowRuns.setState((s) => ({ runs: [run, ...s.runs].slice(0, 20) }))
  addTrace(traceId, { actor: 'operator', kind: 'observe', text: `Workflow "${wf.title}" started at ${fmtClock(run.startedAt)} on ${provider}` })
  if (provider !== 'sim') {
    try {
      const r = await runAgent({ traceId, system: PLANT_CONTEXT, user: wf.task, tools: wf.tools, maxSteps: 6 })
      patch(run.id, { status: 'done', text: r.text, model: r.model })
      return { ...run, status: 'done', text: r.text, model: r.model }
    } catch (e) {
      addTrace(traceId, { actor: 'assistant', kind: 'decide', text: `${provider} unavailable (${e instanceof Error ? e.message : String(e)}) — falling back to the local planner` })
    }
  }
  // offline: run the workflow's tools step by step (visible in the trace), then summarise the evidence
  const lines: string[] = []
  for (const s of wf.local) {
    await sleep(450)
    lines.push(brief(s.tool, runTool(s.tool, s.args ?? {}, traceId)))
  }
  const text = `${wf.title} — findings from the local planner (choose Nemotron as the model for a written analysis):\n${lines.join('\n')}`
  addTrace(traceId, { actor: 'assistant', kind: 'answer', text: `Local planner gathered ${lines.length} tool results`, data: { planner: 'local-rules' } })
  patch(run.id, { status: 'done', text, model: 'sim-planner' })
  return { ...run, status: 'done', text, model: 'sim-planner' }
}
