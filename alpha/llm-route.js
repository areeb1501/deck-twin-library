// A model on the operator's own account, for the scenario author: the Worker in production, the dev server locally.
// POST carries the key, the model and the conversation. The key is used for this one request and never stored, logged or sent
// anywhere but that provider. It travels in the body because Workers invocation logs can record headers, never bodies.
// Providers are a fixed list and the upstream request is built here, so this can't be pointed at anything else or carry
// anything but a chat. The stream is piped straight through: long answers cost the Worker no CPU, and the browser reads the tokens.
import { json } from './sam-route.js'

export const LLM_ROUTE = '/alpha/api/llm'
const MAX_BODY = 800_000
const MAX_MESSAGES = 80
// what one answer may cost. Reasoning counts against this
const MAX_OUTPUT = 24_000
// what the browser may see of an upstream failure, so it can say why it stopped
const PASS_THROUGH = new Set([400, 401, 402, 403, 404, 413, 422, 429])
const KEY = /^[\x21-\x7e]{8,512}$/
const MODEL = /^[\w.:/-]{1,160}$/
const MODAL_HOST = /^[a-z0-9][a-z0-9-]*\.[a-z0-9-]+\.modal\.direct$/
const ROLES = new Set(['system', 'user', 'assistant'])

/** a Modal endpoint as a base URL, or null. Shared Endpoints live on modal.direct, and nothing else is reachable from here */
export function modalBase(endpoint) {
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:' || u.port || u.username || u.password || !MODAL_HOST.test(u.hostname)) return null
    return `https://${u.hostname}/v1`
  } catch {
    return null
  }
}

function base(body) {
  if (body.provider === 'meta') return 'https://api.meta.ai/v1'
  if (body.provider === 'baseten') return 'https://inference.baseten.co/v1'
  if (body.provider === 'modal') return modalBase(body.endpoint)
  return null
}

/** Meta's Responses API takes the system prompt as `instructions`; the others take OpenAI chat messages */
export function requestFor(body) {
  const { provider, model, messages } = body
  const maxTokens = Math.min(Number(body.maxTokens) || MAX_OUTPUT, MAX_OUTPUT)
  if (provider === 'meta') {
    return {
      path: '/responses',
      payload: {
        model,
        instructions: messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n') || undefined,
        input: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        max_output_tokens: maxTokens,
        reasoning: { effort: 'medium' },
      },
    }
  }
  return {
    path: '/chat/completions',
    payload: { model, messages: messages.map((m) => ({ role: m.role, content: m.content })), stream: true, stream_options: { include_usage: true }, max_tokens: maxTokens },
  }
}

const valid = (b) =>
  typeof b?.key === 'string' && KEY.test(b.key) &&
  typeof b.model === 'string' && MODEL.test(b.model) &&
  Array.isArray(b.messages) && b.messages.length > 0 && b.messages.length <= MAX_MESSAGES &&
  b.messages.every((m) => ROLES.has(m?.role) && typeof m.content === 'string')

/** the provider's own words on a failure, without the key if it quoted one */
async function reason(r, key) {
  const j = await r.json().catch(() => null)
  const text = j?.error?.message ?? (typeof j?.error === 'string' ? j.error : j?.message ?? j?.detail)
  return typeof text === 'string' ? text.split(key).join('[key]').slice(0, 300) : `The provider answered ${r.status}`
}

export async function llmRoute(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, { Allow: 'POST' })
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'wrong origin' }, 403)
  const length = request.headers.get('content-length')
  if (!length || !/^\d+$/.test(length)) return json({ error: 'content-length required' }, 411)
  if (Number(length) > MAX_BODY) return json({ error: 'conversation too long' }, 413)
  if (env.SAM_LIMIT) {
    const { success } = await env.SAM_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') ?? 'local' })
    if (!success) return json({ error: 'rate limit reached' }, 429, { 'Retry-After': '60' })
  }
  const body = await request.json().catch(() => null)
  const url = body && base(body)
  if (!url) return json({ error: 'unknown provider or endpoint' }, 400)
  try {
    if (!valid(body)) return json({ error: 'bad request' }, 400)
    const { path, payload } = requestFor(body)
    const r = await fetch(url + path, {
      method: 'POST',
      headers: { authorization: `Bearer ${body.key}`, 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(payload),
      signal: request.signal,
    })
    if (!r.ok || !r.body) return json({ error: await reason(r, body.key) }, PASS_THROUGH.has(r.status) ? r.status : 502)
    return new Response(r.body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' } })
  } catch {
    return json({ error: 'The provider did not answer' }, 502)
  }
}
