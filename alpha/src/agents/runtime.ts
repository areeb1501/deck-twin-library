/**
 * Agent runtime: every workflow, investigation and question runs the same way. The twin's read-only tools
 * (safety/agentTools.ts) run in the browser, where the live plant state is, and their results go to Muse Spark as evidence for
 * one answer. One click is one request, counted against the same limit as the scenario builder. Every tool call and model
 * answer is a TraceStep, so each answer can be audited.
 *
 * Advisory only: the tools read, they never act on the plant.
 */
import { AGENT_TOOLS, runTool } from '../safety/agentTools'
import { addTrace } from '../safety/alerts'
import type { AgentTool } from '../safety/types'
import { askModel, type ChatMessage } from './authorProvider'
import { useProvider, type ProviderId } from './provider'
import { CAP_REQUESTS, CAP_TOKENS, charge, connection, connected, overLimit, useAuthor } from './scenarioAuthor'

export interface AgentRun {
  text: string
  model: string
  provider: ProviderId
  toolCalls: number
}

const MAX_RESULT = 4000
const TAG = /\b[A-Z]{1,3}-[A-Z]?\d{3,4}[A-Z]?\b/g

const RULES = `Answer from the evidence below, which is live plant data read just now. If it does not hold the answer, say so. Never invent a tag or a reading. You advise: the operator acts.`

/** true when a run should go to the model, false when it stays on the local planner */
export const modelOn = () => useProvider.getState().provider === 'muse' && connected(useAuthor.getState())

/** the tools a run can read with no arguments, plus the equipment it names */
function evidenceCalls(tools: AgentTool[], text: string) {
  const free = tools.filter((t) => !Object.values(t.params).some((p) => p.required))
  const tags = tools.some((t) => t.name === 'get_equipment') ? [...new Set(text.match(TAG) ?? [])].slice(0, 3) : []
  return [...free.map((t) => ({ name: t.name, args: {} })), ...tags.map((tag) => ({ name: 'get_equipment', args: { tag } }))]
}

/** one request to Muse Spark; throws when it can't be made, and the caller uses the local planner */
export async function runAgent(opts: { traceId: string; system: string; user: string; tools?: string[]; maxSteps?: number }): Promise<AgentRun> {
  try {
    if (overLimit(useAuthor.getState().usage)) throw new Error(`Stopped at the limit for this page load: ${CAP_REQUESTS} requests or ${CAP_TOKENS.toLocaleString()} tokens. Reload to carry on.`)
    const c = await connection()
    if (!c) throw new Error('No Muse Spark key saved')
    const tools = opts.tools ? AGENT_TOOLS.filter((t) => opts.tools!.includes(t.name)) : AGENT_TOOLS
    const calls = evidenceCalls(tools, opts.user)
    const evidence = calls.map((x) => `${x.name}(${x.args && Object.keys(x.args).length ? JSON.stringify(x.args) : ''})\n${JSON.stringify(runTool(x.name, x.args, opts.traceId)).slice(0, MAX_RESULT)}`)
    const messages: ChatMessage[] = [
      { role: 'system', content: `${opts.system}\n\n${RULES}` },
      { role: 'user', content: `${opts.user}\n\nEvidence:\n${evidence.join('\n\n')}` },
    ]
    const t0 = performance.now()
    const a = await askModel(c, messages, new AbortController().signal, () => {})
    charge(a)
    addTrace(opts.traceId, { actor: 'model', kind: 'answer', text: `${a.model} answered`, data: { provider: 'muse', model: a.model, ms: Math.round(performance.now() - t0), usage: { in: a.input, out: a.output } } })
    useProvider.setState({ error: null })
    return { text: a.text, model: a.model, provider: 'muse', toolCalls: calls.length }
  } catch (e) {
    useProvider.setState({ error: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

/** pull the first JSON object out of a model reply (models wrap JSON in prose or fences) */
export function jsonFrom<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as T
  } catch {
    return null
  }
}
