/**
 * Agents (docs/plans/09-agents-and-models.md, AGENTS.md rule 3): tools are read-only, every workflow completes on the
 * local planner, and the browser client sends no API key. fetch is stubbed, so this proves the client side only:
 * the key handling in vite.agent-proxy.ts is not exercised. Fake timers replace the planner's 450 ms pacing.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fresh, run, sim } from './harness'
import { PLANT_CONTEXT, runWorkflow, useWorkflowRuns, WORKFLOWS } from '../src/agents/catalog'
import { chat, PROVIDER_LABEL, useProvider, type LlmMessage } from '../src/agents/provider'
import { jsonFrom, runAgent } from '../src/agents/runtime'
import { AGENT_TOOLS, runTool } from '../src/safety/agentTools'
import { useAlerts } from '../src/safety/alerts'
import { useCctv } from '../src/safety/cctv'
import { useCorrosion } from '../src/safety/corrosion'
import { useInspection } from '../src/safety/inspection'
import { useRisk } from '../src/safety/risk'
import { useHazardTrack, useWorkers } from '../src/safety/workers'
import { useFinance } from '../src/sim/finance'
import { useInsights } from '../src/sim/insights'
import { useMaint } from '../src/sim/maintenance'
import { useSpares } from '../src/sim/spares'
import { usePlantStore } from '../src/state/plantStore'
import { useSim } from '../src/state/sim'

const ARGS: Record<string, Record<string, unknown>> = {
  get_equipment: { tag: 'K-2200' },
  get_sensor: { tag: 'LT-1101' },
  get_scenario_consequence: { scenarioId: 'export-pump-standby' },
  get_corrosion_trend: { tag: 'V-1100' },
  find_scenarios: { query: 'compressor trip' },
  search_tags: { query: 'export pump' },
  get_shutdown_cause: { platform: 'Alpha' },
  get_spares: { tag: 'K-2200' },
}

const STORES = { useSim, usePlantStore, useMaint, useSpares, useFinance, useInsights, useInspection, useCorrosion, useRisk, useCctv, useWorkers, useHazardTrack, useAlerts }
const snapshot = () => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(STORES).map(([name, store]) => [name, store.getState()]))))

/** a plant with something to read: a shutdown, tripped machine, alarms, a shelved alarm, an inhibit and a permit */
function busyPlant() {
  fresh()
  sim().trip('P-1500A', 'test')
  sim().inhibit('GD-8002', true)
  sim().initiate('PSD', 'Alpha')
  run(120)
  sim().shelve(sim().alarms[0].id, 30)
  useMaint.setState({ permits: { 'PTW-1': { id: 'PTW-1', type: 'hot', status: 'issued', tag: 'V-1100', platform: 'Alpha' } as never } })
}

describe('tools are read-only', () => {
  beforeAll(busyPlant)

  it('exposes only reads by name', () => {
    expect(AGENT_TOOLS.filter((t) => !/^(get|check|find|search)_/.test(t.name)).map((t) => t.name)).toEqual([])
  })

  it.each(AGENT_TOOLS.map((t) => t.name))('%s leaves sim and plant state unchanged', (name) => {
    const before = snapshot()
    runTool(name, ARGS[name] ?? {})
    expect(snapshot()).toEqual(before)
  })

  it.each(AGENT_TOOLS.map((t) => t.name))('%s returns plain JSON without an error', (name) => {
    const result = runTool(name, ARGS[name] ?? {}) as { error?: string }
    expect(result.error).toBeUndefined()
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('gives a model no way to act through an unknown tool', () => {
    const before = snapshot()
    expect(runTool('trip_machine', { tag: 'K-2200' })).toEqual({ error: 'Unknown tool trip_machine' })
    expect(snapshot()).toEqual(before)
  })

  it('does not disturb the engine when polled through an upset', () => {
    const upset = (poll: boolean) => {
      fresh()
      sim().trip('P-1500A', 'test')
      sim().inject({ kind: 'coolingFail' })
      for (let minute = 0; minute < 10; minute++) {
        run(60, 10)
        if (poll) for (const t of AGENT_TOOLS) runTool(t.name, ARGS[t.name] ?? {})
      }
      return { process: sim().process, status: sim().status, oil: sim().result!.oilExport, flare: sim().result!.flare }
    }
    expect(upset(true)).toEqual(upset(false))
  })
})

describe('workflows on the sim provider', () => {
  const complete = async (id: string) => {
    const pending = runWorkflow(id)
    await vi.runAllTimersAsync()
    return (await pending)!
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    useProvider.setState({ provider: 'sim' })
    fresh()
  })
  afterEach(() => void vi.useRealTimers())

  it('catalogues seven workflows', () => expect(WORKFLOWS).toHaveLength(7))

  it.each(WORKFLOWS.map((w) => w.id))('%s completes on the local planner', async (id) => {
    const result = await complete(id)
    expect(result).toMatchObject({ status: 'done', provider: 'sim', model: 'sim-planner' })
  })

  it.each(WORKFLOWS.map((w) => w.id))('%s reports every tool it ran, with no tool error', async (id) => {
    const wf = WORKFLOWS.find((w) => w.id === id)!
    const result = await complete(id)
    expect(result.text!.split('\n').slice(1)).toHaveLength(wf.local.length)
    expect(result.text).not.toMatch(/error:/)
  })

  it.each(WORKFLOWS.map((w) => w.id))('%s traces each tool call', async (id) => {
    const wf = WORKFLOWS.find((w) => w.id === id)!
    const { traceId } = await complete(id)
    const steps = useAlerts.getState().trace.filter((s) => s.traceId === traceId)
    expect(steps.filter((s) => s.actor === 'tool')).toHaveLength(wf.local.length)
    expect(steps.at(-1)?.kind).toBe('answer')
  })

  it('updates the run list when a workflow finishes', async () => {
    const { id } = await complete('drift')
    expect(useWorkflowRuns.getState().runs.find((r) => r.id === id)?.status).toBe('done')
  })

  it('returns nothing for an unknown workflow', async () => expect(await runWorkflow('nope')).toBeUndefined())

  it('leaves the plant alone', async () => {
    busyPlant()
    await Promise.resolve()
    const before = sim().actions.length
    await complete('shift-brief')
    expect(sim().actions).toHaveLength(before)
  })

  it('falls back to the local planner when the provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    useProvider.setState({ provider: 'tokenfactory' })
    const result = await complete('drift')
    vi.unstubAllGlobals()
    expect(result).toMatchObject({ status: 'done', provider: 'tokenfactory', model: 'sim-planner' })
    expect(useAlerts.getState().trace.some((s) => s.traceId === result.traceId && /falling back to the local planner/.test(s.text))).toBe(true)
  })
})

describe('the browser client', () => {
  type Sent = { url: string; init: RequestInit; body: { provider: string; messages: LlmMessage[]; tools: { function: { name: string } }[] } }
  const reply = (message: unknown) => new Response(JSON.stringify({ model: 'test-model', choices: [{ message }], usage: { prompt_tokens: 3, completion_tokens: 2 } }))
  const sent: Sent[] = []

  function serve(...replies: unknown[]) {
    sent.length = 0
    const queue = [...replies]
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, init, body: JSON.parse(init.body as string) })
      return reply(queue.length > 1 ? queue.shift() : queue[0])
    }))
  }
  const toolCall = (name: string) => ({ content: '', tool_calls: [{ id: 'c1', function: { name, arguments: '{}' } }] })

  afterEach(() => void vi.unstubAllGlobals())

  describe('chat()', () => {
    beforeEach(async () => {
      serve({ content: 'ok' })
      await chat('tokenfactory', [{ role: 'user', content: 'status?' }], AGENT_TOOLS.slice(0, 1))
    })

    it('posts to the same-origin proxy', () => expect(sent[0].url).toBe('/api/llm'))
    it('sends a content type and no other header', () => expect(Object.keys(sent[0].init.headers as object)).toEqual(['content-type']))
    it('sends no credentials field in the body', () => expect(Object.keys(sent[0].body).sort()).toEqual(['messages', 'provider', 'tools']))
    it('carries nothing that looks like a key', () => expect(sent[0].init.body).not.toMatch(/api[-_]?key|authorization|bearer/i))
    it('names the provider and leaves the key to the server', () => expect(sent[0].body.provider).toBe('tokenfactory'))
  })

  it('strips reasoning from the reply', async () => {
    serve({ content: '<think>hmm</think> answer' })
    expect((await chat('tokenfactory', [], [])).content).toBe('answer')
  })

  it('raises the server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'no key configured' }), { status: 500 })))
    await expect(chat('muse', [], [])).rejects.toThrow('no key configured')
  })

  describe('runAgent()', () => {
    beforeEach(() => fresh())

    it('refuses to run the local planner remotely', async () => {
      await expect(runAgent({ traceId: 'T', system: '', user: '', provider: 'sim' })).rejects.toThrow(/sim provider/)
    })

    it('runs the tool the model calls and returns its result to the model', async () => {
      serve(toolCall('get_field_status'), { content: 'all good' })
      const result = await runAgent({ traceId: 'T1', system: 'sys', user: 'status?', provider: 'tokenfactory' })
      expect(result).toEqual({ text: 'all good', model: 'test-model', provider: 'tokenfactory', toolCalls: 1 })
      expect(sent[1].body.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'c1' })
      expect(sent[1].body.messages.at(-1)?.content).toContain('oilExportBpd')
    })

    it('offers the model only the tools the workflow lists', async () => {
      serve({ content: 'done' })
      await runAgent({ traceId: 'T2', system: '', user: '', tools: ['get_risk'], provider: 'tokenfactory' })
      expect(sent[0].body.tools.map((t) => t.function.name)).toEqual(['get_risk'])
    })

    it('traces each model turn and tool call', async () => {
      serve(toolCall('get_risk'), { content: 'done' })
      await runAgent({ traceId: 'T3', system: '', user: '', provider: 'tokenfactory' })
      expect(useAlerts.getState().trace.filter((s) => s.traceId === 'T3').map((s) => s.actor)).toEqual(['model', 'tool', 'model'])
    })

    it('asks for an answer without tools at the step limit', async () => {
      serve(toolCall('get_risk'))
      await runAgent({ traceId: 'T4', system: '', user: '', maxSteps: 2, provider: 'tokenfactory' })
      expect(sent).toHaveLength(3)
      expect(sent[2].body.tools).toEqual([])
    })

    it('leaves the plant unchanged when the model calls a tool that does not exist', async () => {
      serve(toolCall('close_valve'), { content: 'done' })
      const before = sim().actions.length
      await runAgent({ traceId: 'T5', system: '', user: '', provider: 'tokenfactory' })
      expect(sent[1].body.messages.at(-1)?.content).toContain('Unknown tool close_valve')
      expect(sim().actions).toHaveLength(before)
    })
  })

  it('reads the JSON out of a wrapped model reply', () => expect(jsonFrom('Here you go: {"a": 1} done')).toEqual({ a: 1 }))
})

describe('models', () => {
  it('defaults to the local planner', () => expect(useProvider.getInitialState().provider).toBe('sim'))
  it('names no Claude model anywhere in the agent setup', () => {
    expect(JSON.stringify({ PROVIDER_LABEL, PLANT_CONTEXT, WORKFLOWS })).not.toMatch(/claude|anthropic/i)
  })
})
