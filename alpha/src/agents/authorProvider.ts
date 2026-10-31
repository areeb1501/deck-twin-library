/**
 * Models for the scenario author, on the operator's own account. Separate from agents/provider.ts on purpose: those agents hold
 * no key and only run where a server has one, while here the operator brings the key and pays for what they ask. Calls go to
 * `alpha/llm-route.js`, because none of these answer a browser directly: Modal refuses the preflight, and Meta's docs say to
 * keep keys off the page.
 */
export type AuthorProviderId = 'modal' | 'baseten' | 'meta'

export interface AuthorProvider {
  id: AuthorProviderId
  label: string
  blurb: string
  /** where the key is kept (safety/metaKey.ts). Meta shares the key saved on the camera page */
  keyId: string
  keyPlaceholder: string
  /** Modal needs the operator's own endpoint */
  endpoint: boolean
  /** the first is the default. Only a provider with several offers a choice */
  models: string[]
}

export const AUTHOR_PROVIDERS: Record<AuthorProviderId, AuthorProvider> = {
  modal: {
    id: 'modal',
    label: 'Modal shared endpoint',
    blurb: 'Muse Spark Open on your own Modal endpoint. Billed per token by Modal.',
    keyId: 'llm-modal',
    keyPlaceholder: 'wk-….ws-…  proxy token',
    endpoint: true,
    models: ['meta-models/Muse-Spark-Open-816B-A42B'],
  },
  baseten: {
    id: 'baseten',
    label: 'Baseten',
    blurb: 'Muse Spark Open on Baseten Model APIs. Billed per token by Baseten.',
    keyId: 'llm-baseten',
    keyPlaceholder: 'API key from app.baseten.co',
    endpoint: false,
    models: ['meta-models/muse-spark-open-1026'],
  },
  meta: {
    id: 'meta',
    label: 'Meta Model API',
    blurb: 'Muse on the Meta Model API. Uses the key saved on the camera page, if there is one.',
    keyId: 'meta-model-api',
    keyPlaceholder: 'API key from dev.meta.ai',
    endpoint: false,
    models: ['muse-wonder-1.0', 'muse-spark-1.3', 'muse-spark-1.2', 'muse-spark-1.1'],
  },
}

/** the provider's model: the operator's choice where there is one */
export const modelOf = (p: AuthorProvider, chosen?: string) => (chosen && p.models.includes(chosen) ? chosen : p.models[0])

/** list prices in USD per million tokens, for an estimate only. Modal's are from its endpoint page, the others from third-party trackers, October 2026 */
const PRICES: Record<string, { in: number; cached: number; out: number }> = {
  'meta-models/Muse-Spark-Open-816B-A42B': { in: 1.25, cached: 0.15, out: 4.25 },
  'meta-models/muse-spark-open-1026': { in: 1.25, cached: 0.15, out: 4.25 },
  'muse-wonder-1.0': { in: 4, cached: 0.2, out: 20 },
}
export const priceOf = (model: string) => PRICES[model] ?? null

export interface Connection {
  provider: AuthorProviderId
  model: string
  endpoint: string
  key: string
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
export interface Answer {
  text: string
  model: string
  /** all input tokens, of which `cached` were read from the provider's cache at the lower rate */
  input: number
  cached: number
  output: number
}

const ROUTE = `${import.meta.env.BASE_URL}api/llm`
/** a long answer with reasoning can take minutes. Past this, something is stuck */
const TIMEOUT_MS = 300_000

async function failure(r: Response) {
  const j = (await r.json().catch(() => null)) as { error?: string } | null
  return new Error(j?.error ?? `The provider answered ${r.status}`)
}

interface StreamEvent {
  type?: string
  delta?: string
  message?: string
  choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null }; finish_reason?: string | null }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
  response?: { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } }
  error?: { message?: string } | string
}

/** reads either provider's event stream into text. `onToken` fires for the answer and for reasoning, so the UI can show life during a long think */
export async function readEvents(body: ReadableStream<Uint8Array>, model: string, onToken: (answerSoFar: string) => void): Promise<Answer> {
  const out: Answer = { text: '', model, input: 0, cached: 0, output: 0 }
  const lines = body.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader()
  let rest = ''
  let cut = false
  const event = (e: StreamEvent) => {
    if (e.error) throw new Error(typeof e.error === 'string' ? e.error : (e.error.message ?? 'The model stopped with an error'))
    if (e.type === 'error') throw new Error(e.message ?? 'The model stopped with an error')
    if (e.type === 'response.failed') throw new Error('The model could not finish this answer')
    if (e.type === 'response.incomplete') cut = true
    if (e.type === 'response.output_text.delta') {
      out.text += e.delta ?? ''
      onToken(out.text)
    }
    if (e.type === 'response.reasoning_summary_text.delta') onToken(out.text)
    if (e.response?.usage) {
      out.input = e.response.usage.input_tokens ?? out.input
      out.cached = e.response.usage.input_tokens_details?.cached_tokens ?? out.cached
      out.output = e.response.usage.output_tokens ?? out.output
    }
    const choice = e.choices?.[0]
    if (choice?.delta?.content) out.text += choice.delta.content
    if (choice?.delta?.content || choice?.delta?.reasoning_content || choice?.delta?.reasoning) onToken(out.text)
    if (choice?.finish_reason === 'length') cut = true
    if (e.usage) {
      out.input = e.usage.prompt_tokens ?? out.input
      out.cached = e.usage.prompt_tokens_details?.cached_tokens ?? out.cached
      out.output = e.usage.completion_tokens ?? out.output
    }
  }
  for (;;) {
    const { value, done } = await lines.read()
    const parts = (rest + (value ?? '')).split('\n')
    rest = done ? '' : (parts.pop() ?? '')
    for (const line of parts) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let parsed: StreamEvent
      try {
        parsed = JSON.parse(payload) as StreamEvent
      } catch {
        continue
      }
      event(parsed)
    }
    if (done) break
  }
  if (cut) throw new Error('The answer ran out of output tokens before it finished. Ask for a smaller scenario.')
  out.text = out.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return out
}

/** one model turn. Exactly one request: an error is reported, never retried, because a retry costs money and tells us nothing */
export async function askModel(c: Connection, messages: ChatMessage[], signal: AbortSignal, onToken: (answerSoFar: string) => void): Promise<Answer> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const r = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: c.provider, model: c.model, endpoint: c.endpoint, key: c.key, messages }),
    signal: AbortSignal.any([signal, timeout]),
  })
  if (!r.ok || !r.body) throw await failure(r)
  return readEvents(r.body, c.model, onToken)
}
