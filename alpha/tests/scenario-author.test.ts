/**
 * The scenario author: the Worker route, the two stream formats, and the spending rules. Real money goes through this path, so the
 * rules are tested by counting requests: nothing goes out without a Send, an error is never retried, repairs stop at the limit.
 * fetch is stubbed, so no provider is called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './harness'

vi.mock('../src/safety/metaKey', async (real) => ({
  ...(await real<typeof import('../src/safety/metaKey')>()),
  loadKey: async () => 'test-key-12345',
  hasKey: async () => true,
  saveKey: async () => undefined,
  forgetKey: async () => undefined,
}))

import { llmRoute, modalBase, requestFor } from '../llm-route.js'
import { askModel, AUTHOR_PROVIDERS, modelOf, readEvents } from '../src/agents/authorProvider'
import { CAP_REQUESTS, MAX_REPAIRS, messagesFor, overLimit, readReply, useAuthor } from '../src/agents/scenarioAuthor'
import { systemPrompt } from '../src/agents/scenarioPrompt'
import { useCustom } from '../src/sim/scen/custom'
import { SPEC_AIR } from '../src/sim/scen/examples'
import { validate } from '../src/sim/scen/validate'
import { usePlantStore } from '../src/state/plantStore'
import { useScenario } from '../src/sim/scenarios'

const ORIGIN = 'https://decktwin.com'
const sse = (...events: unknown[]) => new Response(events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''), { status: 200 })
const chunk = (content: string, extra = {}) => ({ choices: [{ delta: { content } }], ...extra })
const specReply = (spec: unknown, prose = 'Here it is.') => sse(chunk(`${prose}\n\n\`\`\`json\n${JSON.stringify(spec)}\n\`\`\``), { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 500 } })

describe('the Worker route', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) => {
    const text = JSON.stringify(body)
    return new Request(`${ORIGIN}/alpha/api/llm`, { method: 'POST', headers: { origin: ORIGIN, 'content-length': String(text.length), ...headers }, body: text })
  }
  const good = { provider: 'baseten', model: 'meta-models/muse-spark-open-1026', key: 'test-key-12345', messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hello' }] }
  const upstream = vi.fn()
  beforeEach(() => {
    upstream.mockReset().mockImplementation(async () => sse(chunk('hi'), '[DONE]'))
    vi.stubGlobal('fetch', upstream)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('forwards to the provider and streams the answer back', async () => {
    const r = await llmRoute(post(good), {})
    expect(r.headers.get('content-type')).toBe('text/event-stream')
    expect(await r.text()).toContain('hi')
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe('https://inference.baseten.co/v1/chat/completions')
    expect(init.headers.authorization).toBe('Bearer test-key-12345')
  })
  it('keeps the key out of the upstream body and out of the answer', async () => {
    const r = await llmRoute(post(good), {})
    expect(upstream.mock.calls[0][1].body).not.toContain('test-key-12345')
    expect(await r.text()).not.toContain('test-key-12345')
  })
  it('refuses a different origin, before anything is sent', async () => {
    const r = await llmRoute(post(good, { origin: 'https://evil.example' }), {})
    expect(r.status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })
  it('refuses other methods and oversized bodies', async () => {
    expect((await llmRoute(new Request(`${ORIGIN}/alpha/api/llm`), {})).status).toBe(405)
    expect((await llmRoute(post(good, { 'content-length': '999999999' }), {})).status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })
  it('counts against the rate limit', async () => {
    const r = await llmRoute(post(good), { SAM_LIMIT: { limit: async () => ({ success: false }) } })
    expect(r.status).toBe(429)
    expect(upstream).not.toHaveBeenCalled()
  })
  it('can only reach the listed providers', async () => {
    for (const bad of [{ provider: 'evil' }, { provider: 'modal', endpoint: 'https://evil.example' }, { provider: 'modal', endpoint: 'http://a.us-west.modal.direct' }, { provider: 'modal', endpoint: 'https://a.modal.direct.evil.example' }, { provider: 'modal', endpoint: 'https://user:pw@a.us-west.modal.direct' }]) {
      expect((await llmRoute(post({ ...good, ...bad }), {})).status).toBe(400)
    }
    expect(upstream).not.toHaveBeenCalled()
  })
  it('takes a Modal endpoint however it is pasted', () => {
    const host = 'demo--ep-x-server.us-west.modal.direct'
    expect(modalBase(`https://${host}`)).toBe(`https://${host}/v1`)
    expect(modalBase(`https://${host}/v1/chat/completions`)).toBe(`https://${host}/v1`)
  })
  it('passes only role and content', async () => {
    await llmRoute(post({ ...good, tools: [{ x: 1 }], messages: [{ role: 'user', content: 'hi', tool_calls: [] }] }), {})
    expect(JSON.parse(upstream.mock.calls[0][1].body)).not.toHaveProperty('tools')
    expect(JSON.parse(upstream.mock.calls[0][1].body).messages).toEqual([{ role: 'user', content: 'hi' }])
  })
  it('refuses a role that could smuggle anything else', async () => {
    expect((await llmRoute(post({ ...good, messages: [{ role: 'tool', content: 'x' }] }), {})).status).toBe(400)
  })
  it('sends Meta the Responses format, with the system prompt as instructions', () => {
    const { path, payload } = requestFor({ ...good, provider: 'meta', model: 'muse-wonder-1.0' })
    expect(path).toBe('/responses')
    expect(payload.instructions).toBe('be brief')
    expect(payload.input).toEqual([{ role: 'user', content: 'hello' }])
    expect(payload.stream).toBe(true)
  })
  it('caps what one answer may cost', () => {
    expect(requestFor({ ...good, maxTokens: 9_000_000 }).payload.max_tokens).toBeLessThanOrEqual(24000)
  })
  it('says why the provider refused, without repeating the key', async () => {
    upstream.mockImplementation(async () => new Response(JSON.stringify({ error: { message: 'bad key test-key-12345' } }), { status: 401 }))
    const r = await llmRoute(post(good), {})
    expect(r.status).toBe(401)
    const text = await r.text()
    expect(text).toContain('bad key')
    expect(text).not.toContain('test-key-12345')
  })
  it('hides anything else as a 502', async () => {
    upstream.mockImplementation(async () => new Response('boom', { status: 500 }))
    expect((await llmRoute(post(good), {})).status).toBe(502)
    upstream.mockImplementation(async () => {
      throw new Error('network')
    })
    expect((await llmRoute(post(good), {})).status).toBe(502)
  })
})

describe('reading a stream', () => {
  const read = async (r: Response, tick = vi.fn()) => ({ a: await readEvents(r.body!, 'm', tick), tick })
  it('reads OpenAI chat chunks and skips reasoning', async () => {
    const { a, tick } = await read(sse({ choices: [{ delta: { reasoning_content: 'hmm' } }] }, chunk('he'), chunk('llo'), { choices: [], usage: { prompt_tokens: 5, completion_tokens: 7 } }, '[DONE]'))
    expect(a).toMatchObject({ text: 'hello', input: 5, output: 7 })
    expect(tick).toHaveBeenCalled()
  })
  it("reads Meta's Responses events", async () => {
    const { a } = await read(sse({ type: 'response.output_text.delta', delta: 'he' }, { type: 'response.output_text.delta', delta: 'llo' }, { type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 4 } } }))
    expect(a).toMatchObject({ text: 'hello', input: 3, output: 4 })
  })
  it('keeps only the answer of a model that thinks out loud', async () => {
    expect((await read(sse(chunk('<think>secret</think>the answer')))).a.text).toBe('the answer')
  })
  it('stops on a cut-off answer rather than parsing half a scenario', async () => {
    await expect(read(sse(chunk('{'), { choices: [{ delta: {}, finish_reason: 'length' }] }))).rejects.toThrow(/output tokens/)
    await expect(read(sse({ type: 'response.incomplete' }))).rejects.toThrow(/output tokens/)
  })
  it('reads cached tokens from both formats', async () => {
    expect((await read(sse({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 60 } } }))).a.cached).toBe(60)
    expect((await read(sse({ type: 'response.completed', response: { usage: { input_tokens: 100, output_tokens: 5, input_tokens_details: { cached_tokens: 70 } } } }))).a.cached).toBe(70)
  })
  it('stops on a failure inside the stream', async () => {
    await expect(read(sse({ type: 'response.failed' }))).rejects.toThrow()
    await expect(read(sse({ error: { message: 'overloaded' } }))).rejects.toThrow('overloaded')
  })
})

describe('reading a reply', () => {
  it('splits words from a fenced scenario', () => {
    const r = readReply('Made it.\n```json\n{"timeline":[]}\n```\nOne assumption.')
    expect(r.raw).toBe('{"timeline":[]}')
    expect(r.prose).toContain('Made it.')
    expect(r.prose).toContain('One assumption.')
  })
  it('takes a bare object too', () => {
    expect(readReply('{"title":"x","timeline":[]}').json).toEqual({ title: 'x', timeline: [] })
  })
  it('leaves a plain answer alone', () => {
    expect(readReply('Which platform?')).toEqual({ prose: 'Which platform?', raw: null, json: null })
    expect(readReply('Use {curly} words').raw).toBeNull()
  })
  it('flags JSON that does not parse', () => {
    expect(readReply('```json\n{"timeline": [\n```').json).toBeUndefined()
  })
})

describe('what is sent', () => {
  it('sends only the newest scenario, because input is billed', () => {
    const chat = [
      { id: '1', role: 'user' as const, text: 'make one' },
      { id: '2', role: 'assistant' as const, text: 'first', specJson: '{"v":1}' },
      { id: '3', role: 'user' as const, text: 'change it' },
      { id: '4', role: 'assistant' as const, text: 'second', specJson: '{"v":2}' },
    ]
    const m = messagesFor('sys', chat)
    expect(m[0]).toEqual({ role: 'system', content: 'sys' })
    expect(m[2].content).not.toContain('{"v":1}')
    expect(m[4].content).toContain('{"v":2}')
  })
  it('tells the model only tags that exist, and carries valid examples', () => {
    const p = systemPrompt(usePlantStore.getState().plant)
    expect(p).toContain('K-2200')
    expect(p).toContain('ESDV-1001')
    expect(p).toContain('A-P-COMP')
    expect(p).toContain('lahh-1101')
    expect(p).not.toContain('=>')
    expect(p.length).toBeLessThan(40000)
  })
})

describe('which model runs', () => {
  it('fixes Baseten and Modal to Muse Spark Open, whatever was stored', () => {
    expect(AUTHOR_PROVIDERS.baseten.models).toEqual(['meta-models/muse-spark-open-1026'])
    expect(AUTHOR_PROVIDERS.modal.models).toHaveLength(1)
    expect(modelOf(AUTHOR_PROVIDERS.baseten, 'something-else')).toBe('meta-models/muse-spark-open-1026')
    expect(modelOf(AUTHOR_PROVIDERS.modal, 'something-else')).toMatch(/Muse-Spark-Open/)
  })
  it('lets the Meta API choose, from its list only', () => {
    expect(AUTHOR_PROVIDERS.meta.models.length).toBeGreaterThan(1)
    expect(modelOf(AUTHOR_PROVIDERS.meta, 'muse-spark-1.3')).toBe('muse-spark-1.3')
    expect(modelOf(AUTHOR_PROVIDERS.meta, 'made-up')).toBe('muse-wonder-1.0')
  })
})

describe('the spending rules', () => {
  const upstream = vi.fn()
  const replies = (...r: Response[]) => r.forEach((x) => upstream.mockImplementationOnce(async () => x))
  beforeEach(() => {
    upstream.mockReset()
    vi.stubGlobal('fetch', upstream)
    useAuthor.setState({ chat: [], draft: null, editing: null, note: '', stage: 'idle', usage: { requests: 0, input: 0, output: 0, usd: 0 }, provider: 'baseten', models: {}, endpoint: '' })
    useCustom.setState({ items: [], compiled: {} })
    useScenario.setState({ live: null })
  })
  afterEach(() => vi.unstubAllGlobals())
  const bad = { ...SPEC_AIR, timeline: [{ id: 'trip', at: 60, do: [{ do: 'trip', tag: 'NOPE', cause: 'x' }] }] }

  it('sends nothing until asked', async () => {
    useAuthor.getState().setProvider('baseten')
    useAuthor.getState().setModel('x')
    useAuthor.getState().newChat()
    await useAuthor.getState().send('   ')
    expect(upstream).not.toHaveBeenCalled()
  })
  it('never sends the key where it is not needed: a chat with no endpoint stops before spending', async () => {
    useAuthor.setState({ provider: 'modal', endpoint: '' })
    await useAuthor.getState().send('make one')
    expect(upstream).not.toHaveBeenCalled()
    expect(useAuthor.getState().note).toMatch(/endpoint/)
  })
  it('a clarifying question costs one request and makes no draft', async () => {
    replies(sse(chunk('Which platform?'), { choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } }))
    await useAuthor.getState().send('make one')
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(useAuthor.getState().draft).toBeNull()
    expect(useAuthor.getState().chat.map((l) => l.role)).toEqual(['user', 'assistant'])
  })
  it('a good scenario lands in the draft, checked and run', async () => {
    replies(specReply(SPEC_AIR))
    await useAuthor.getState().send('make one')
    const d = useAuthor.getState().draft!
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(d.errors).toEqual([])
    expect(d.report?.fired.map((f) => f.id)).toContain('trip')
    expect(useAuthor.getState().stage).toBe('idle')
  }, 60_000)
  it('sends validation errors back once, then accepts the fix', async () => {
    replies(specReply(bad), specReply(SPEC_AIR))
    await useAuthor.getState().send('make one')
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(JSON.parse(upstream.mock.calls[1][1].body).messages.at(-1).content).toContain('NOPE')
    expect(useAuthor.getState().draft?.errors).toEqual([])
  }, 60_000)
  it('stops repairing at the limit and leaves the problems on screen', async () => {
    replies(specReply(bad), specReply(bad), specReply(bad), specReply(bad))
    await useAuthor.getState().send('make one')
    expect(upstream).toHaveBeenCalledTimes(1 + MAX_REPAIRS)
    expect(useAuthor.getState().draft?.spec).toBeNull()
    expect(useAuthor.getState().draft?.errors.join()).toContain('NOPE')
    expect(useAuthor.getState().save()).toBeTruthy()
  })
  it('stops on an error, with no retry', async () => {
    upstream.mockImplementation(async () => new Response(JSON.stringify({ error: 'no credit' }), { status: 402 }))
    await useAuthor.getState().send('make one')
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(useAuthor.getState().note).toBe('no credit')
    expect(useAuthor.getState().stage).toBe('idle')
  })
  it('stops at the limit for a page load', async () => {
    useAuthor.setState({ usage: { requests: CAP_REQUESTS, input: 0, output: 0, usd: 0 } })
    expect(overLimit(useAuthor.getState().usage)).toBe(true)
    await useAuthor.getState().send('make one')
    expect(upstream).not.toHaveBeenCalled()
    expect(useAuthor.getState().note).toMatch(/limit/)
  })
  it('counts tokens and estimates at list price', async () => {
    replies(sse(chunk('Which platform?'), { choices: [], usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 } }))
    await useAuthor.getState().send('make one')
    const u = useAuthor.getState().usage
    expect(u).toMatchObject({ requests: 1, input: 1_000_000, output: 1_000_000 })
    expect(u.usd).toBeCloseTo(5.5)
  })
  it('uses the Modal rates, and the cached rate for cached input', async () => {
    useAuthor.setState({ provider: 'modal', endpoint: 'https://x.us-west.modal.direct' })
    replies(sse(chunk('Which platform?'), { choices: [], usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 1_000_000 } } }))
    await useAuthor.getState().send('make one')
    expect(useAuthor.getState().usage.usd).toBeCloseTo(4.4)
  })
  it('sends one request for a double press', async () => {
    upstream.mockImplementation(async () => sse(chunk('Which platform?')))
    await Promise.all([useAuthor.getState().send('make one'), useAuthor.getState().send('make one')])
    expect(upstream).toHaveBeenCalledTimes(1)
  })
  it('says nothing about dollars for a model with no known price', async () => {
    useAuthor.setState({ provider: 'meta', models: { meta: 'muse-spark-1.3' } })
    replies(sse(chunk('Which platform?'), { choices: [], usage: { prompt_tokens: 5, completion_tokens: 5 } }))
    await useAuthor.getState().send('make one')
    expect(useAuthor.getState().usage.usd).toBeNull()
  })
  it('stop aborts the request', async () => {
    upstream.mockImplementation((_u, init: RequestInit) => new Promise((_d, fail) => init.signal!.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')))))
    const run = useAuthor.getState().send('make one')
    await vi.waitFor(() => expect(upstream).toHaveBeenCalled())
    useAuthor.getState().stop()
    await run
    expect(useAuthor.getState().note).toMatch(/Stopped/)
    expect(useAuthor.getState().stage).toBe('idle')
  })
  it('sends the key with the request and nowhere else in the app state', async () => {
    replies(sse(chunk('ok')))
    await useAuthor.getState().send('make one')
    expect(JSON.parse(upstream.mock.calls[0][1].body).key).toBe('test-key-12345')
    expect(localStorage.getItem('deckTwin.scenarioAuthor.v1')).not.toContain('test-key')
    expect(localStorage.getItem('deckTwin.scenarioDraft.v1')).not.toContain('test-key')
    expect(JSON.stringify(useAuthor.getState())).not.toContain('test-key')
  })
  it('saves a checked draft to the library, and keeps the conversation with it', async () => {
    replies(specReply(SPEC_AIR))
    await useAuthor.getState().send('make one')
    expect(useAuthor.getState().save()).toBeNull()
    const [x] = useCustom.getState().items
    expect(x.spec.title).toBe(SPEC_AIR.title)
    expect(x.chat.length).toBeGreaterThan(1)
    expect(validate({ ...x.spec }, usePlantStore.getState().plant).errors).toEqual([])
  }, 60_000)
  it('reopens a saved scenario for changes, and saves over it', async () => {
    replies(specReply(SPEC_AIR))
    await useAuthor.getState().send('make one')
    useAuthor.getState().save()
    const id = useCustom.getState().items[0].id
    useAuthor.getState().newChat()
    useAuthor.getState().edit(id)
    expect(useAuthor.getState().draft?.spec?.title).toBe(SPEC_AIR.title)
    useAuthor.getState().save()
    expect(useCustom.getState().items).toHaveLength(1)
  }, 60_000)
})

describe('asking a model', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('passes the provider failure on in words', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'model not found' }), { status: 404 }))
    await expect(askModel({ provider: 'baseten', model: 'x', endpoint: '', key: 'k' }, [], new AbortController().signal, () => undefined)).rejects.toThrow('model not found')
  })
})
