// SAM 3.1 on the Meta Model API with the operator's own key: the Worker in production, the dev server locally.
// POST carries the key, one JPEG frame and the noun phrases. The key is used for this one request and never stored, logged or
// sent anywhere but Meta. It travels in the body because Workers invocation logs can record headers, never bodies.
// Masks stay undecoded here: the browser reads them (src/safety/metaSam.ts), so the Worker stays within its CPU limit.
import { json } from './sam-route.js'

export const META_SAM_ROUTE = '/alpha/api/meta-sam'
const API = 'https://api.meta.ai/v1/responses'
const MAX_BODY = 2_000_000
// every prompt is one billed image, so nothing else may be sent through here
const PROMPTS = new Set(['person', 'hard hat', 'high-visibility vest', 'flame', 'smoke'])
const MAX_PROMPTS = 3
// what the browser may see of an upstream failure, so it can say why it stopped
const PASS_THROUGH = new Set([400, 401, 402, 403, 429])
const KEY = /^[\x21-\x7e]{8,512}$/
const IMAGE = 'data:image/jpeg;base64,'

class Upstream extends Error {
  constructor(status) {
    super(`Meta answered ${status}`)
    this.status = status
  }
}

/** one noun phrase on one frame. `one_bit` masks are several times smaller than `lossless` */
export const requestBody = (prompt, image) => ({
  model: 'sam-3.1',
  input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: image }] }],
  stream: true,
  metadata: { mask_encoding: 'one_bit', include_confidence: 'true' },
})

/** the `response.output_text.delta` events of a stream, joined */
export async function readStream(body) {
  const lines = body.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  let rest = ''
  for (;;) {
    const { value, done } = await lines.read()
    const parts = (rest + (value ?? '')).split('\n')
    rest = done ? '' : parts.pop()
    for (const line of parts) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return text
      const event = JSON.parse(payload)
      if (event.type === 'response.output_text.delta') text += event.delta ?? ''
      else if (event.type === 'response.completed') return text
      else if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') throw new Upstream(502)
    }
    if (done) return text
  }
}

async function segment(key, prompt, image) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(requestBody(prompt, image)),
  })
  if (!r.ok || !r.body) throw new Upstream(r.status)
  return { prompt, text: await readStream(r.body) }
}

const valid = (b) =>
  typeof b?.key === 'string' && KEY.test(b.key) &&
  typeof b.image === 'string' && b.image.startsWith(IMAGE) &&
  Array.isArray(b.prompts) && b.prompts.length > 0 && b.prompts.length <= MAX_PROMPTS &&
  new Set(b.prompts).size === b.prompts.length && b.prompts.every((p) => PROMPTS.has(p))

export async function metaSamRoute(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, { Allow: 'POST' })
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'wrong origin' }, 403)
  const length = request.headers.get('content-length')
  if (!length || !/^\d+$/.test(length)) return json({ error: 'content-length required' }, 411)
  if (Number(length) > MAX_BODY) return json({ error: 'frame too large' }, 413)
  if (env.SAM_LIMIT) {
    const { success } = await env.SAM_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') ?? 'local' })
    if (!success) return json({ error: 'rate limit reached' }, 429, { 'Retry-After': '60' })
  }
  const body = await request.json().catch(() => null)
  if (!valid(body)) return json({ error: 'bad request' }, 400)
  const t0 = Date.now()
  try {
    const outputs = await Promise.all(body.prompts.map((p) => segment(body.key, p, body.image)))
    return json({ outputs, ms: Date.now() - t0 })
  } catch (e) {
    const status = e instanceof Upstream && PASS_THROUGH.has(e.status) ? e.status : 502
    return json({ error: 'Meta did not answer' }, status)
  }
}
