/**
 * The next-action agent: what is wrong, what to do next and why. It sees only what the operator can see (alarms, fire & gas zones,
 * latched shutdowns, machine health), never the simulator's hidden fault list. Two sources share one plan format:
 *
 *  - Rules: free and always there. The cause & effect row and the RCM row (sim/rcm.ts) become ordered steps.
 *  - The model: one click, one request. The read-only agent tools build an evidence pack, Muse answers in JSON, and each step is
 *    checked against the plant and must cite the evidence. Bad steps go back once, then they are dropped.
 *
 * The model proposes and the operator approves. After a confirm the plugin below reads the plant until the effect is there, so a
 * stuck valve comes back "not verified", and the next click plans around it. Spending follows the same rules as the scenario author:
 * nothing on load or in the background, no retries, a running count and a hard limit per page load.
 */
import { create } from 'zustand'
import { runTool, summarise, platformOf, zoneIdOf } from '../safety/agentTools'
import { loadKey } from '../safety/metaKey'
import { ALARM_CAUSE } from '../sim/alpha'
import { CE_BY_ID } from '../sim/causeEffect'
import { fireZones } from '../sim/fg'
import { useMaint } from '../sim/maintenance'
import { rcmFor, rcmForEvent, rpn, VALVE_STUCK, type RcmRow, type RcmStep } from '../sim/rcm'
import { useScenario } from '../sim/scenarios'
import type { PlatformId } from '../sim/types'
import { usePlantStore } from '../state/plantStore'
import { registerSimPlugin, runState, simTags, useSim } from '../state/sim'
import { askModel, AUTHOR_PROVIDERS, modelOf, priceOf, type Answer, type ChatMessage } from './authorProvider'
import { checkAction, effectOf, inPlace, perform, type PlantAction } from './plantActions'
import { useAuthor } from './scenarioAuthor'

export const CAP_REQUESTS = 12
export const CAP_TOKENS = 150_000
export const MAX_STEPS = 6
const MAX_EVIDENCE_CHARS = 3000
/** sim seconds a command gets to show its effect */
const VERIFY_S = 300

export type Severity = 'critical' | 'high' | 'medium'

export interface Situation {
  id: string
  kind: 'fire' | 'gas' | 'shutdown' | 'machine' | 'alarm'
  title: string
  detail: string
  severity: Severity
  platform: PlatformId
  tag?: string
  zone?: string
  /** cause & effect row */
  causeId?: string
  /** machine failure mode */
  mode?: string
}

export interface Evidence {
  id: string
  source: string
  label: string
  data: unknown
}

export type StepState = 'todo' | 'sent' | 'met' | 'notMet' | 'refused' | 'done'

export interface Step {
  id: string
  action: PlantAction
  text: string
  why: string
  evidence: string[]
  state: StepState
  sentAt?: number
  refusal?: string
}

export interface Plan {
  situation: string
  source: 'rules' | 'model'
  /** what wrote it, for the label */
  model?: string
  causeId?: string
  summary: string
  steps: Step[]
  evidence: Evidence[]
  /** steps the checks threw out */
  dropped: string[]
}

export interface Usage {
  requests: number
  input: number
  output: number
  /** null when any request ran on a model with no known price */
  usd: number | null
}

export type Stage = 'idle' | 'thinking' | 'writing' | 'checking'

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2 }

/** model text goes on a screen with no em dashes */
const plain = (s: unknown, max: number) => (typeof s === 'string' ? s : '').replace(/\s*—\s*/g, ', ').replace(/–/g, '-').trim().slice(0, max)

// ================================================================= what is wrong

/** everything that needs a decision right now, worst first */
export function readSituations(): Situation[] {
  const s = useSim.getState()
  const plant = usePlantStore.getState().plant
  const t = simTags()
  if (!t.alpha) return []
  const out: Situation[] = []

  for (const z of fireZones(plant)) {
    const st = s.fg?.[z.id]
    if (!st) continue
    const confirmed = st.fire === 'confirmed' || st.smoke === 'confirmed'
    if (confirmed || st.fire !== 'normal' || st.smoke !== 'normal') {
      out.push({ id: `fire:${z.id}`, kind: 'fire', title: `${confirmed ? 'Confirmed fire' : 'Possible fire'}: ${z.name}`, detail: confirmed ? '2ooN detectors in the zone' : 'One detector in the zone', severity: confirmed ? 'critical' : 'high', platform: z.platform, zone: z.id, causeId: confirmed ? 'fire-confirmed' : 'fire-single' })
    }
    if (st.gas !== 'normal') {
      const id = st.gas === 'confirmed' ? 'gas-confirmed' : st.gas === 'high' ? 'gas-high' : 'gas-low'
      out.push({ id: `gas:${z.id}`, kind: 'gas', title: `${st.gas === 'confirmed' ? 'Confirmed gas' : st.gas === 'high' ? 'Gas high' : 'Gas low'}: ${z.name}`, detail: `${st.highCount} detector(s) at the high setpoint`, severity: st.gas === 'confirmed' ? 'critical' : st.gas === 'high' ? 'high' : 'medium', platform: z.platform, zone: z.id, causeId: id })
    }
  }

  const latched = (s.shutdowns ?? []).filter((x) => !x.resetAt)
  const covered = new Set(out.map((x) => x.platform))
  for (const d of latched) {
    if (covered.has(d.platform) || d.causeId === 'upstream-psd' || d.causeId === 'injector-shut') continue
    out.push({ id: `down:${d.id}`, kind: 'shutdown', title: `${d.level} on ${d.platform}`, detail: d.cause, severity: d.level === 'PSD' || d.level === 'USD' ? 'high' : 'critical', platform: d.platform, zone: d.zone, causeId: d.causeId })
  }

  const health = useMaint.getState().health ?? {}
  for (const tag of t.machines) {
    const h = health[tag]
    const tripped = runState(tag) === 'tripped'
    const platform = platformOf(tag)
    const down = latched.some((x) => x.platform === platform)
    const unwell = h && h.stage !== 'normal'
    if (!unwell && (!tripped || down)) continue
    const mode = h?.mode ?? s.machines?.[tag]?.tripCause
    const name = plant.equipment.find((e) => e.tag === tag)?.name ?? tag
    out.push({ id: `machine:${tag}`, kind: 'machine', title: `${tag} ${tripped ? 'tripped' : h?.stage === 'alert' ? 'degrading' : 'in alarm'}`, detail: mode ? `${name}: ${mode}` : name, severity: tripped || h?.stage === 'failed' ? 'high' : 'medium', platform, tag, mode })
  }

  const seen = new Set(out.flatMap((x) => [x.tag, x.zone]))
  for (const a of s.alarms ?? []) {
    if (!a.active || a.state === 'shelved' || a.priority > (latched.length ? 1 : 2) || a.kind === 'fg' || a.kind === 'esd' || seen.has(a.tag) || (a.zone && seen.has(a.zone)) || covered.has(a.platform)) continue
    seen.add(a.tag)
    out.push({ id: `alarm:${a.tag}`, kind: 'alarm', title: `${a.tag} alarm`, detail: a.text, severity: a.priority === 1 ? 'high' : 'medium', platform: a.platform, tag: a.tag, causeId: /position discrepancy/.test(a.text) ? VALVE_STUCK : ALARM_CAUSE[a.tag] })
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, 12)
}

// ================================================================= the data behind a plan

const clsOf = (tag: string | undefined) => (tag ? simTags().cls.get(tag) : undefined)

export function rcmRowOf(sit: Situation): RcmRow | null {
  if (sit.causeId) {
    const row = rcmForEvent(sit.causeId)
    if (row) return row
  }
  const cls = clsOf(sit.tag)
  return cls ? rcmFor(cls, sit.mode) : null
}

/** what the console can command on this platform right now: the only tags a plan may name */
function controlsFor(sit: Situation) {
  const s = useSim.getState()
  const t = simTags()
  const here = (tag: string) => platformOf(tag) === sit.platform
  const inZone = (tag: string) => !sit.zone || zoneIdOf(tag) === sit.zone
  return {
    machines: t.machines.filter(here).map((tag) => ({ tag, state: runState(tag) })),
    valves: t.valves
      .filter((v) => here(v) && (t.deluge.includes(v) || t.valveType.get(v) === 'esdv' || t.valveType.get(v) === 'bdv'))
      .sort((a, b) => Number(inZone(b)) - Number(inZone(a)))
      .slice(0, 30)
      .map((tag) => ({ tag, type: t.deluge.includes(tag) ? 'deluge' : t.valveType.get(tag), zone: zoneIdOf(tag), positionPct: Math.round((s.valves[tag]?.pos ?? 0) * 100), command: s.valves[tag]?.cmd })),
    wells: t.wells.filter(here),
  }
}

/** read-only: the agent tools the assistant already uses, the RCM row and what has been tried */
export function evidencePack(sit: Situation, tried: { text: string; state: StepState; refusal?: string }[] = []): Evidence[] {
  const out: Evidence[] = []
  const add = (source: string, label: string, data: unknown) => out.push({ id: `E${out.length + 1}`, source, label, data })
  const tool = (name: string, args: Record<string, unknown>) => {
    const r = runTool(name, args)
    add(name, summarise(name, r), r)
  }
  tool('get_alarms', { platform: sit.platform })
  if (sit.zone) tool('get_fire_gas', { zone: sit.zone })
  tool('get_shutdown_cause', { platform: sit.platform })
  if (sit.tag && (clsOf(sit.tag) || usePlantStore.getState().plant.equipment.some((e) => e.tag === sit.tag))) {
    tool('get_equipment', { tag: sit.tag })
    tool('get_spares', { tag: sit.tag })
  } else if (sit.tag) tool('get_sensor', { tag: sit.tag })
  tool('get_risk', { platform: sit.platform })
  const row = rcmRowOf(sit)
  if (row) add('rcm', `RCM: ${row.failure}, RPN ${rpn(row)}${row.edited ? ', edited here' : ''}`, { failure: row.failure, effect: row.effect, signal: row.signal, rpn: rpn(row), severity: row.severity, occurrence: row.occurrence, detection: row.detection, task: row.task, interval: row.interval, response: row.response.map((x) => ({ text: x.text, why: x.why })) })
  const ce = sit.causeId ? CE_BY_ID[sit.causeId] : undefined
  if (ce) add('cause-effect', `Cause and effect: ${ce.cause}`, ce)
  add('controls', 'What the console can command here', controlsFor(sit))
  const live = useScenario.getState().live
  if (live) add('scenario', `Scenario running: ${live.title}`, { title: live.title, actions: live.actions.filter((a) => a.available).map((a) => ({ id: a.id, label: a.label })) })
  if (tried.length) add('tried', `${tried.length} step(s) tried so far`, tried)
  return out
}

// ================================================================= the plan from the rules

let stepSeq = 0
const step = (action: PlantAction, text: string, why: string, evidence: string[]): Step => ({ id: `s${++stepSeq}`, action, text, why, evidence, state: 'todo' })

function resolve(x: RcmStep, sit: Situation, ev: string[]): Step[] {
  const t = simTags()
  const manual = (text = x.text) => [step({ kind: 'manual' }, text, x.why, ev)]
  switch (x.do) {
    case 'check':
      return manual()
    case 'stop':
      return sit.tag && t.machines.includes(sit.tag) ? [step({ kind: 'stop', tag: sit.tag }, `Shut down ${sit.tag}`, x.why, ev)] : manual()
    case 'standby': {
      const other = sit.tag ? t.partner.get(sit.tag) : undefined
      return other && t.machines.includes(other) ? [step({ kind: 'start', tag: other }, `Start ${other}, the standby`, x.why, ev)] : []
    }
    case 'psd':
      return [step({ kind: 'shutdown', level: 'PSD', platform: sit.platform }, x.text, x.why, ev)]
    case 'esd2':
      return sit.zone ? [step({ kind: 'shutdown', level: 'ESD2', platform: sit.platform, zone: sit.zone }, x.text, x.why, ev)] : manual()
    case 'esd1':
      return [step({ kind: 'shutdown', level: 'ESD1', platform: sit.platform }, x.text, x.why, ev)]
    case 'deluge': {
      const tags = t.deluge.filter((v) => zoneIdOf(v) === sit.zone)
      return tags.length ? tags.map((v) => step({ kind: 'openValve', tag: v }, `Open deluge ${v}`, x.why, ev)) : manual('Check which deluge covers this zone: no tagged valve here')
    }
    case 'firewater': {
      const plant = usePlantStore.getState().plant
      const pumps = t.machines.filter((m) => plant.equipment.some((e) => e.tag === m && e.kind === 'caissonPump' && e.system === 'safety'))
      const pump = pumps.find((m) => runState(m) === 'running') ?? pumps[0]
      return pump ? [step({ kind: 'start', tag: pump }, `Start firewater pump ${pump}`, x.why, ev)] : manual()
    }
  }
}

export function rulePlan(sit: Situation): Plan {
  const evidence = evidencePack(sit)
  const ev = evidence.filter((e) => e.source === 'rcm' || e.source === 'cause-effect').map((e) => e.id)
  const row = rcmRowOf(sit)
  const ce = sit.causeId ? CE_BY_ID[sit.causeId] : undefined
  const steps = row ? row.response.flatMap((x) => resolve(x, sit, ev)) : (ce?.effects ?? []).map((e) => step({ kind: 'manual' }, `Verify: ${e}`, 'This is what the cause and effect matrix says should have happened.', ev))
  if (!steps.length) steps.push(step({ kind: 'manual' }, 'Check the alarm against the trend and field reports', 'No RCM row or cause and effect row covers this yet.', evidence.slice(0, 1).map((e) => e.id)))
  const live = useScenario.getState().live
  const cite = evidence.filter((e) => e.source === 'scenario').map((e) => e.id)
  const offered = (live?.actions ?? []).filter((a) => a.available).slice(0, 2).map((a) => step({ kind: 'scenario', id: a.id, label: 'Order it here' }, a.label, 'The scenario offers this, and it counts towards the score.', cite))
  return { situation: sit.id, source: 'rules', causeId: sit.causeId, summary: row ? `${row.effect}. From the RCM row and the cause and effect matrix.` : 'From the cause and effect matrix.', steps: [...steps.slice(0, MAX_STEPS), ...offered], evidence, dropped: [] }
}

// ================================================================= the plan from the model

export function systemPrompt() {
  return `You are the response agent on a digital twin of an offshore oil and gas plant. All data comes from the twin's simulator. An operator in the control room asks what to do next. You advise; the operator approves every action, and you cannot act.

Reply with one JSON object and nothing else:
{"summary":"one sentence on what is happening","steps":[{"action":{...},"text":"short imperative","why":"one short sentence that names the reading or row behind it","evidence":["E1"]}]}

action is one of:
{"kind":"stop","tag":"<machine>"}          stop a machine
{"kind":"start","tag":"<machine>"}         start a machine
{"kind":"closeValve","tag":"<valve>"}      close an actuated valve
{"kind":"openValve","tag":"<valve>"}       open an actuated valve, including deluge
{"kind":"shutInWell","tag":"<well>"}       shut in a well
{"kind":"shutdown","level":"PSD|ESD2|ESD1","platform":"<platform>","zone":"<zone, ESD2 only>"}
{"kind":"scenario","id":"<id>","label":"<label>"}   an action of the running scenario
{"kind":"manual"}                          anything with no remote control: a field check, a call, a muster

Rules:
- At most ${MAX_STEPS} steps, most urgent first. People and containment come before production.
- Every step cites at least one evidence id, and every number you mention appears in the evidence.
- Name only tags listed in the controls evidence. Never invent a tag or a reading.
- Skip what is already in place: a valve already at its position, a machine already stopped, a shutdown already in.
- Follow the RCM row unless the evidence says otherwise, and say why in that step if you depart from it.
- If evidence shows a step was refused or not verified, treat that barrier as failed and plan around it.
- Abandon platform is the operator's decision alone. If it is on the table, make it a manual step.
- Plain punctuation, no em dashes.`
}

export function userPrompt(sit: Situation, evidence: Evidence[]) {
  const packed = evidence.map((e) => `${e.id} (${e.source}) ${e.label}\n${JSON.stringify(e.data).slice(0, MAX_EVIDENCE_CHARS)}`).join('\n\n')
  return `Situation: ${sit.title}. ${sit.detail}. Platform ${sit.platform}${sit.zone ? `, zone ${sit.zone}` : ''}${sit.tag ? `, tag ${sit.tag}` : ''}.\n\nEvidence:\n\n${packed}\n\nWhat should the operator do next?`
}

export function readJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fence?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0]
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** keeps the steps that can run on this plant and cite real evidence, and says what was wrong with the rest */
export function checkReply(json: unknown, evidence: Evidence[]) {
  const known = new Set(evidence.map((e) => e.id))
  const errors: string[] = []
  const steps: Step[] = []
  const body = json as { summary?: unknown; steps?: unknown } | null | undefined
  if (!body || !Array.isArray(body.steps) || !body.steps.length) return { summary: '', steps, errors: ['That was not a JSON object with a list of steps.'] }
  ;(body.steps as Record<string, unknown>[]).slice(0, MAX_STEPS).forEach((raw, i) => {
    const n = `Step ${i + 1}`
    const action = raw?.action as PlantAction | undefined
    const why = checkAction(action)
    const cites = Array.isArray(raw?.evidence) ? (raw.evidence as unknown[]).filter((e): e is string => typeof e === 'string') : []
    const text = plain(raw?.text, 140)
    const reason = plain(raw?.why, 220)
    if (why) errors.push(`${n}: ${why}.`)
    else if (!text || !reason) errors.push(`${n}: needs text and why.`)
    else if (!cites.length) errors.push(`${n}: cites no evidence.`)
    else if (cites.some((e) => !known.has(e))) errors.push(`${n}: cites ${cites.filter((e) => !known.has(e)).join(', ')}, which is not in the evidence.`)
    else steps.push(step(action!, text, reason, cites))
  })
  return { summary: plain(body.summary, 240), steps, errors }
}

// ================================================================= store

interface ResponseStore {
  plans: Record<string, Plan>
  stage: Stage
  /** the situation being asked about */
  asking: string | null
  partial: string
  note: string
  usage: Usage
  /** the rule plan, the first time a situation is looked at, or when it escalates */
  ensure: (sit: Situation) => void
  ask: (sit: Situation) => Promise<void>
  stop: () => void
  /** the operator's confirm */
  act: (situation: string, stepId: string) => void
  markDone: (situation: string, stepId: string) => void
}

const USAGE0: Usage = { requests: 0, input: 0, output: 0, usd: 0 }
let controller: AbortController | null = null

export const overLimit = (u: Usage) => u.requests >= CAP_REQUESTS || u.input + u.output >= CAP_TOKENS
const LIMIT = `Stopped at the limit for this page load: ${CAP_REQUESTS} requests or ${CAP_TOKENS.toLocaleString()} tokens. Reload to carry on.`

function patchStep(situation: string, stepId: string, patch: Partial<Step>) {
  useResponse.setState((s) => {
    const p = s.plans[situation]
    return p ? { plans: { ...s.plans, [situation]: { ...p, steps: p.steps.map((x) => (x.id === stepId ? { ...x, ...patch } : x)) } } } : s
  })
}

export const useResponse = create<ResponseStore>((set, get) => ({
  plans: {},
  stage: 'idle',
  asking: null,
  partial: '',
  note: '',
  usage: USAGE0,
  ensure: (sit) => {
    const old = get().plans[sit.id]
    if (old && (old.source === 'model' || old.causeId === sit.causeId)) return
    set((s) => ({ plans: { ...s.plans, [sit.id]: rulePlan(sit) } }))
  },
  ask: (sit) => ask(sit),
  stop: () => controller?.abort(),
  act: (situation, stepId) => {
    const st = get().plans[situation]?.steps.find((x) => x.id === stepId)
    if (!st || (st.state !== 'todo' && st.state !== 'refused' && st.state !== 'notMet')) return
    const refusal = perform(st.action)
    if (refusal) return patchStep(situation, stepId, { state: 'refused', refusal })
    patchStep(situation, stepId, { state: effectOf(st.action) === 'met' ? 'met' : 'sent', sentAt: useSim.getState().t, refusal: undefined })
  },
  markDone: (situation, stepId) => patchStep(situation, stepId, { state: 'done' }),
}))

function charge(a: Answer) {
  const price = priceOf(a.model)
  useResponse.setState((s) => ({
    usage: {
      requests: s.usage.requests + 1,
      input: s.usage.input + a.input,
      output: s.usage.output + a.output,
      usd: price && s.usage.usd !== null ? s.usage.usd + ((a.input - a.cached) * price.in + a.cached * price.cached + a.output * price.out) / 1e6 : null,
    },
  }))
}

/** one click: at most two requests, the answer and one repair. Any error stops it, and a stopped answer is still billed */
async function ask(sit: Situation) {
  const s = useResponse.getState()
  const set = useResponse.setState
  if (s.stage !== 'idle') return
  if (overLimit(s.usage)) return void set({ note: LIMIT })
  const a = useAuthor.getState()
  const p = AUTHOR_PROVIDERS[a.provider]
  if (p.endpoint && !a.endpoint) return void set({ note: 'Add your Modal endpoint first.' })
  // busy before the first await, so a second press can't bill twice
  set({ stage: 'thinking', asking: sit.id, partial: '', note: '' })
  const key = await loadKey(p.keyId).catch(() => null)
  if (!key) return void set({ stage: 'idle', asking: null, note: 'Save a key first.' })
  const model = modelOf(p, a.models[a.provider])
  const tried = (useResponse.getState().plans[sit.id]?.steps ?? []).filter((x) => x.state !== 'todo').map((x) => ({ text: x.text, state: x.state, refusal: x.refusal }))
  const evidence = evidencePack(sit, tried)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: userPrompt(sit, evidence) },
  ]
  controller = new AbortController()
  try {
    for (let repair = 0; ; repair++) {
      if (overLimit(useResponse.getState().usage)) throw new Error(LIMIT)
      set({ stage: 'thinking', partial: '' })
      const answer = await askModel({ provider: a.provider, model, endpoint: a.endpoint, key }, messages, controller.signal, (so) => set({ partial: so, stage: so ? 'writing' : 'thinking' }))
      charge(answer)
      set({ stage: 'checking' })
      const r = checkReply(readJson(answer.text), evidence)
      if (r.errors.length && repair < 1) {
        messages.push({ role: 'assistant', content: answer.text }, { role: 'user', content: `Checks failed:\n${r.errors.map((e) => `- ${e}`).join('\n')}\nSend the whole plan again as JSON.` })
        continue
      }
      if (!r.steps.length) throw new Error(`The answer had no step the plant could run. ${r.errors[0] ?? ''}`.trim())
      set((x) => ({ plans: { ...x.plans, [sit.id]: { situation: sit.id, source: 'model', model, causeId: sit.causeId, summary: r.summary, steps: r.steps, evidence, dropped: r.errors } } }))
      break
    }
  } catch (e) {
    const stopped = controller.signal.aborted
    set({ note: stopped ? 'Stopped. Anything the provider already generated is still billed.' : e instanceof Error ? e.message : String(e) })
  } finally {
    controller = null
    set({ stage: 'idle', asking: null, partial: '' })
  }
}

/** closes the loop: a confirmed step stays open until the plant shows the effect */
registerSimPlugin({
  id: 'next-action',
  step: (_dt, t) => {
    for (const plan of Object.values(useResponse.getState().plans)) {
      for (const x of plan.steps) {
        if (x.state !== 'sent') continue
        const e = effectOf(x.action)
        if (e === 'met') patchStep(plan.situation, x.id, { state: 'met' })
        else if (e === 'failed' || t - (x.sentAt ?? t) > VERIFY_S) patchStep(plan.situation, x.id, { state: 'notMet' })
      }
    }
  },
  reset: () => useResponse.setState({ plans: {}, note: '' }),
})

export { inPlace }

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __response: useResponse, __situations: readSituations })
