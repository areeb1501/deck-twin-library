/**
 * Agent runtime (docs/plans/09-agents-and-models.md, 9a): one tool-calling loop for every workflow
 * and every model. The model proposes tool calls; the twin's read-only tools (safety/agentTools.ts)
 * run locally in the browser, where the live plant state is; results go back to the model until it
 * answers. Every model turn and tool call is a TraceStep, so each answer can be audited.
 *
 * Advisory only — the tools read, they never act on the plant.
 */
import { AGENT_TOOLS, runTool } from '../safety/agentTools'
import { addTrace } from '../safety/alerts'
import type { AgentTool } from '../safety/types'
import { chat, useProvider, type LlmMessage, type ProviderId } from './provider'

export interface AgentRun {
  text: string
  model: string
  provider: ProviderId
  toolCalls: number
}

const MAX_RESULT = 6000

/** run a tool-calling loop on the selected remote provider; throws when the provider is unavailable */
export async function runAgent(opts: { traceId: string; system: string; user: string; tools?: string[]; maxSteps?: number; provider?: ProviderId }): Promise<AgentRun> {
  const provider = opts.provider ?? useProvider.getState().provider
  if (provider === 'sim') throw new Error('sim provider: use the local planner')
  const tools: AgentTool[] = opts.tools ? AGENT_TOOLS.filter((t) => opts.tools!.includes(t.name)) : AGENT_TOOLS
  const messages: LlmMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ]
  let calls = 0
  let model: string = provider
  for (let step = 0; step < (opts.maxSteps ?? 6); step++) {
    const turn = await chat(provider, messages, tools)
    model = turn.model
    addTrace(opts.traceId, {
      actor: 'model',
      kind: turn.toolCalls.length ? 'decide' : 'answer',
      text: turn.toolCalls.length ? `${model} → ${turn.toolCalls.map((c) => c.name).join(', ')}` : `${model} answered`,
      data: { provider, model, ms: turn.ms, usage: turn.usage, step },
    })
    if (!turn.toolCalls.length) return { text: turn.content, model, provider, toolCalls: calls }
    messages.push({ role: 'assistant', content: turn.content, tool_calls: turn.toolCalls })
    for (const c of turn.toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = c.arguments ? (JSON.parse(c.arguments) as Record<string, unknown>) : {}
      } catch {
        /* malformed arguments: run with none */
      }
      const result = runTool(c.name, args, opts.traceId)
      calls++
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result).slice(0, MAX_RESULT) })
    }
  }
  // out of steps: ask for the answer without tools
  messages.push({ role: 'user', content: 'Answer now with what you have.' })
  const last = await chat(provider, messages, [])
  addTrace(opts.traceId, { actor: 'model', kind: 'answer', text: `${last.model} answered (step limit)`, data: { provider, model: last.model, ms: last.ms } })
  return { text: last.content, model: last.model, provider, toolCalls: calls }
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
