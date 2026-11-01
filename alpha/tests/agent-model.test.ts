/** Agents on Muse Spark: the operator's own key, one click and one request, and the local planner when there is no key. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const key = vi.hoisted(() => ({ value: 'test-key-12345' as string | null, stored: new Set<string>() }))
vi.mock('../src/safety/metaKey', async (real) => ({
  ...(await real<typeof import('../src/safety/metaKey')>()),
  loadKey: async () => key.value,
  hasKey: async (id: string) => key.stored.has(id),
}))

import { runWorkflow, useWorkflowRuns } from '../src/agents/catalog'
import { useProvider } from '../src/agents/provider'
import { modelOn, runAgent } from '../src/agents/runtime'
import { CAP_REQUESTS, useAuthor } from '../src/agents/scenarioAuthor'
import { useAlerts } from '../src/safety/alerts'
import { investigate } from '../src/safety/investigate'
import { fresh, run } from './harness'

const sse = (content: string) =>
  new Response([{ choices: [{ delta: { content } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } }, '[DONE]'].map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })

const llm = vi.fn(async (_url: string, _init: RequestInit) => sse('Export pumps are the concern.'))
const sent = (i = 0) => JSON.parse(llm.mock.calls[i][1].body as string) as { provider: string; model: string; key: string; messages: { role: string; content: string }[] }
const finished = async (id: Parameters<typeof runWorkflow>[0]) => {
  const r = await runWorkflow(id)
  return useWorkflowRuns.getState().runs.find((x) => x.id === r!.id)!
}

beforeEach(() => {
  fresh()
  run(1)
  llm.mockClear()
  vi.stubGlobal('fetch', llm)
  key.value = 'test-key-12345'
  useProvider.setState({ provider: 'muse', error: null })
  useAuthor.setState({ provider: 'meta', endpoint: '', models: {}, saved: { meta: true }, usage: { requests: 0, input: 0, output: 0, usd: 0 } })
})

describe('with a saved key', () => {
  it('runs a workflow on Muse Spark', async () => {
    const r = await finished('drift')
    expect(r).toMatchObject({ status: 'done', provider: 'muse', model: 'muse-wonder-1.0', text: 'Export pumps are the concern.' })
    expect(sent()).toMatchObject({ provider: 'meta', model: 'muse-wonder-1.0', key: 'test-key-12345' })
  })

  it('spends one request a click and counts it', async () => {
    await finished('drift')
    expect(llm).toHaveBeenCalledOnce()
    expect(useAuthor.getState().usage).toMatchObject({ requests: 1, input: 100, output: 20 })
  })

  it('sends live plant readings as evidence', async () => {
    await finished('drift')
    const [system, user] = sent().messages
    expect(system.content).toMatch(/Never invent a tag/)
    expect(user.content).toMatch(/Evidence:/)
    expect(user.content).toContain('check_sensor_drift')
  })

  it('reads the equipment a question names', async () => {
    await runAgent({ traceId: 'T', system: 's', user: 'What is wrong with K-2200?' })
    expect(sent().messages[1].content).toContain('get_equipment({"tag":"K-2200"})')
  })

  it('keeps the key out of the trace', async () => {
    const r = await finished('drift')
    expect(JSON.stringify(useAlerts.getState().trace.filter((s) => s.traceId === r.traceId))).not.toContain('test-key-12345')
  })

  it('diagnoses an alert through Muse Spark', async () => {
    llm.mockImplementation(async () => sse('{"summary":"Seal leak","likelyCause":"Dry gas seal wear"}'))
    const traceId = investigate({ tag: 'K-2200' })
    await vi.waitFor(() => expect(llm).toHaveBeenCalledOnce(), { timeout: 15000 })
    expect(sent().messages[1].content).toContain('Root-cause analysis')
    await vi.waitFor(() => expect(useAlerts.getState().trace.some((s) => s.traceId === traceId && /Dry gas seal wear/.test(s.text))).toBe(true), { timeout: 4000 })
  }, 25000)
})

describe('without a key', () => {
  beforeEach(() => useAuthor.setState({ saved: { meta: false } }))

  it('stays on the local planner and spends nothing', async () => {
    expect(modelOn()).toBe(false)
    expect(await finished('drift')).toMatchObject({ status: 'done', provider: 'sim', model: 'sim-planner' })
    expect(llm).not.toHaveBeenCalled()
  })

  it('stays local when Muse Spark is not selected, even with a key', async () => {
    useAuthor.setState({ saved: { meta: true } })
    useProvider.setState({ provider: 'sim' })
    expect(modelOn()).toBe(false)
    await finished('drift')
    expect(llm).not.toHaveBeenCalled()
  })
})

describe('when the model fails', () => {
  it('falls back to the local planner and says why', async () => {
    llm.mockImplementation(async () => new Response(JSON.stringify({ error: 'bad key' }), { status: 401 }))
    expect(await finished('drift')).toMatchObject({ status: 'done', model: 'sim-planner' })
    expect(llm).toHaveBeenCalledOnce()
    expect(useProvider.getState().error).toBeTruthy()
  })

  it('stops at the limit for the page load without calling', async () => {
    useAuthor.setState({ usage: { requests: CAP_REQUESTS, input: 0, output: 0, usd: 0 } })
    await finished('drift')
    expect(llm).not.toHaveBeenCalled()
    expect(useProvider.getState().error).toMatch(/limit/)
  })
})

describe('finding a key', () => {
  it('moves to the provider that has one', async () => {
    useAuthor.setState({ provider: 'meta', saved: {} })
    key.stored = new Set(['llm-baseten'])
    await useAuthor.getState().detectKey()
    expect(useAuthor.getState().provider).toBe('baseten')
  })

  it('stays on the selected provider when it has a key', async () => {
    useAuthor.setState({ provider: 'meta', saved: {} })
    key.stored = new Set(['llm-baseten', 'meta-model-api'])
    await useAuthor.getState().detectKey()
    expect(useAuthor.getState().provider).toBe('meta')
  })

  it('shows the key field when no key exists anywhere', async () => {
    useAuthor.setState({ provider: 'meta', saved: {} })
    key.stored = new Set()
    await useAuthor.getState().detectKey()
    expect(useAuthor.getState().saved.meta).toBe(false)
  })
})
