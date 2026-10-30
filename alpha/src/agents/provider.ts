/**
 * Model-agnostic LLM provider (docs/plans/09-agents-and-models.md, 9a). The agent workflows, tools
 * and trace never change; the model is a setting:
 *
 *   sim                 local planner, offline (default — the demo always works)
 *   tokenfactory        NVIDIA Nemotron on Nebius Token Factory (demo model)
 *   muse                Meta Muse Spark via the Meta Model API (planned — only when approved)
 *   openai-compatible   any other OpenAI-style endpoint
 *
 * Remote providers go through the dev-server proxy (/api/llm, vite.agent-proxy.ts) or, in production,
 * the Modal endpoint at VITE_AGENT_BASE — the browser never holds an API key.
 */
import { create } from 'zustand'
import type { AgentTool } from '../safety/types'

export type ProviderId = 'sim' | 'tokenfactory' | 'muse' | 'openai-compatible'

export interface ToolCall {
  id: string
  name: string
  /** JSON text, as the model produced it */
  arguments: string
}
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}
export interface LlmTurn {
  content: string
  toolCalls: ToolCall[]
  model: string
  usage?: { in: number; out: number }
  ms: number
}

export interface ProviderInfo {
  ready: boolean
  label?: string
  model?: string
}

const BASE = (import.meta.env.VITE_AGENT_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

interface ProviderStore {
  /** the provider the agents use */
  provider: ProviderId
  setProvider: (p: ProviderId) => void
  /** what the server has keys for (fetched once) */
  available: Partial<Record<ProviderId, ProviderInfo>>
  refresh: () => Promise<void>
}

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  sim: 'Simulated (local, offline)',
  tokenfactory: 'NVIDIA Nemotron · Token Factory',
  muse: 'Meta Muse Spark (planned)',
  'openai-compatible': 'OpenAI-compatible endpoint',
}

export const useProvider = create<ProviderStore>((set) => ({
  provider: ((typeof localStorage !== 'undefined' && localStorage.getItem('deck-twin.provider')) as ProviderId) || 'sim',
  setProvider: (provider) => {
    localStorage.setItem('deck-twin.provider', provider)
    set({ provider })
  },
  available: { sim: { ready: true, label: PROVIDER_LABEL.sim, model: 'sim-planner' } },
  refresh: async () => {
    try {
      const r = await fetch(`${BASE}/api/llm/providers`)
      if (r.ok) set({ available: (await r.json()) as ProviderStore['available'] })
    } catch {
      /* static build without the proxy: only `sim` */
    }
  },
}))

/** AgentTool → OpenAI function-tool schema */
export function toolSchema(t: AgentTool) {
  const required = Object.entries(t.params)
    .filter(([, p]) => p.required)
    .map(([k]) => k)
  return {
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(t.params).map(([k, p]) => [k, { type: p.type, description: p.description }])),
        required,
      },
    },
  }
}

interface ChatCompletion {
  model?: string
  choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: string | { message?: string }
}

/** one model turn on a remote provider (OpenAI chat-completions shape) */
export async function chat(provider: Exclude<ProviderId, 'sim'>, messages: LlmMessage[], tools: AgentTool[]): Promise<LlmTurn> {
  const t0 = performance.now()
  const r = await fetch(`${BASE}/api/llm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider,
      messages: messages.map((m) =>
        m.role === 'assistant' && m.tool_calls?.length
          ? { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) }
          : m,
      ),
      tools: tools.map(toolSchema),
    }),
  })
  const j = (await r.json().catch(() => ({}))) as ChatCompletion
  if (!r.ok || j.error) throw new Error(typeof j.error === 'string' ? j.error : (j.error?.message ?? `HTTP ${r.status}`))
  const msg = j.choices?.[0]?.message
  // some open models emit their reasoning in <think> … </think>: keep only the answer
  const content = (msg?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return {
    content,
    toolCalls: (msg?.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
    model: j.model ?? provider,
    usage: j.usage ? { in: j.usage.prompt_tokens ?? 0, out: j.usage.completion_tokens ?? 0 } : undefined,
    ms: Math.round(performance.now() - t0),
  }
}
