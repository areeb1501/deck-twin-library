/**
 * The next-action agent: it reads only what an operator can see, a model can only name real things, actions go through the recorded
 * controls and are proved by reading the plant, and real money moves only on a click. Requests are counted, not assumed.
 * fetch is stubbed, so no provider is called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fresh, run, sim } from './harness'

vi.mock('../src/safety/metaKey', async (real) => ({
  ...(await real<typeof import('../src/safety/metaKey')>()),
  loadKey: async () => 'test-key-12345',
  hasKey: async () => true,
}))

import { CAP_REQUESTS, checkReply, evidencePack, overLimit, readJson, readSituations, rulePlan, systemPrompt, useResponse, type Situation } from '../src/agents/nextAction'
import { checkAction, effectOf, labelOf, type PlantAction } from '../src/agents/plantActions'
import { useAuthor } from '../src/agents/scenarioAuthor'
import { CLASS_DATA, type MachineClass } from '../src/sim/alpha'
import { exampleRows, rcmFor, rcmForEvent, rpn, useRcm } from '../src/sim/rcm'
import type { Fault } from '../src/sim/types'
import { usePlantStore } from '../src/state/plantStore'

const position = (tag: string) => usePlantStore.getState().plant.equipment.find((e) => e.tag === tag)!.position
const fireAt = (tag: string): Fault => {
  const [x, , z] = position(tag)
  return { kind: 'fire', at: [x, 1.5, z], sizeMW: 2, source: tag }
}
const sse = (content: string) => new Response([{ choices: [{ delta: { content } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 200 } }].map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { status: 200 })
const SIT: Situation = { id: 'machine:K-2200', kind: 'machine', title: 'K-2200 in alarm', detail: 'Export gas compressor', severity: 'medium', platform: 'Alpha', tag: 'K-2200', mode: 'Dry gas seal leakage high' }
const stopK = { action: { kind: 'stop', tag: 'K-2200' }, text: 'Shut down K-2200', why: 'Seal vent flow is rising.', evidence: ['E1'] }

describe('the RCM library', () => {
  beforeEach(() => useRcm.getState().reset())

  it('has a row for every machine failure mode, in the exact wording spares key on', () => {
    for (const cls of Object.keys(CLASS_DATA) as MachineClass[]) for (const f of CLASS_DATA[cls].failures) expect(rcmFor(cls, f)?.failure, `${cls}: ${f}`).toBe(f)
  })
  it('reads the wording a trip uses', () => expect(rcmFor('pump', 'FAILURE: High vibration')?.failure).toBe('High vibration'))
  it('covers the fire and gas rows of the cause and effect matrix', () => {
    for (const id of ['fire-single', 'fire-confirmed', 'gas-high', 'gas-confirmed']) expect(rcmForEvent(id)).not.toBeNull()
  })
  it('keeps edits in the browser, feeds them to plans, and resets to the examples', () => {
    const row = rcmFor('compressor', SIT.mode)!
    useRcm.getState().update(row.id, { severity: 10, task: 'Own task' })
    expect(rpn(rcmFor('compressor', SIT.mode)!)).toBe(10 * row.occurrence * row.detection)
    expect(localStorage.getItem('deckTwin.rcm.v1')).toContain('Own task')
    expect(evidencePack(SIT).find((e) => e.source === 'rcm')?.label).toContain('edited here')
    useRcm.getState().reset()
    expect(useRcm.getState().rows).toEqual(exampleRows())
  })
  it('has no em dashes on screen', () => expect(JSON.stringify(exampleRows())).not.toMatch(/—/))
})

describe('what the agent can see', () => {
  beforeEach(() => fresh())

  it('finds nothing on a healthy plant', () => {
    run(30)
    expect(readSituations()).toEqual([])
  })
  it('does not see a hidden fault until the plant shows it', () => {
    sim().inject({ kind: 'coolingFail' })
    run(2)
    expect(sim().incidents.length).toBeGreaterThan(0)
    expect(readSituations()).toEqual([])
    expect(JSON.stringify(evidencePack({ ...SIT, tag: undefined }))).not.toContain('incidents')
  })
  it('sees a stuck valve once the plant raises the discrepancy alarm', () => {
    sim().inject({ kind: 'valveStuck', tag: 'ESDV-1601' })
    run(30)
    const stuck = readSituations().find((x) => x.tag === 'ESDV-1601')
    expect(stuck?.detail).toBe('ESDV-1601 position discrepancy: valve not moving')
    expect(rulePlan(stuck!).summary).toContain('A barrier is not where the command says it is')
  })
  it('raises a fire once detectors see it, and marks it critical when confirmed', () => {
    sim().inject(fireAt('V-1100'))
    run(60)
    const fire = readSituations().find((x) => x.kind === 'fire')
    expect(fire?.causeId).toBe('fire-confirmed')
    expect(fire?.severity).toBe('critical')
    expect(readSituations()[0].kind).toBe('fire')
  })
})

describe('during a shutdown', () => {
  beforeEach(() => fresh())

  it('keeps the fire on top and leaves out the low-flow alarms it caused elsewhere', () => {
    sim().inject(fireAt('K-2200'))
    run(60)
    const list = readSituations()
    expect(list[0].kind).toBe('fire')
    expect(list.filter((x) => x.kind === 'alarm' && /low/.test(x.detail))).toEqual([])
  })
})

describe('the plan from the rules', () => {
  beforeEach(() => {
    fresh()
    useRcm.getState().reset()
    useResponse.setState({ plans: {}, note: '', stage: 'idle' })
  })

  it('turns a machine row into real steps, standby first, and cites the row', () => {
    const plan = rulePlan({ ...SIT, id: 'machine:P-1500A', tag: 'P-1500A', mode: 'High vibration' })
    const kinds = plan.steps.map((s) => s.action.kind)
    expect(kinds.indexOf('start')).toBeLessThan(kinds.indexOf('stop'))
    expect(plan.steps.find((s) => s.action.kind === 'start')?.action).toEqual({ kind: 'start', tag: 'P-1500B' })
    expect(plan.steps.every((s) => s.evidence.length && s.why)).toBe(true)
  })
  it('gives a fire ESD1, deluge and firewater steps', () => {
    sim().inject(fireAt('V-1100'))
    run(60)
    const plan = rulePlan(readSituations()[0])
    expect(plan.steps.some((s) => s.action.kind === 'shutdown' && s.action.level === 'ESD1')).toBe(true)
    expect(plan.steps.some((s) => s.action.kind === 'start')).toBe(true)
  })
  it('catches a high alarm on a process tag, before the trip, with its cause row', () => {
    sim().inject({ kind: 'levelControlFail', tag: 'LV-1101' })
    let found: Situation | undefined
    for (let i = 0; i < 900 && !found; i++) {
      run(1)
      found = readSituations().find((x) => x.kind === 'alarm' && x.tag === 'LT-1101')
    }
    expect(found?.causeId).toBe('lahh-1101')
    expect(sim().shutdowns.filter((s) => !s.resetAt)).toEqual([])
  })
  it('never asks for the abandon platform button', () => {
    expect(checkAction({ kind: 'shutdown', level: 'APS', platform: 'Alpha' } as unknown as PlantAction)).toMatch(/not a level/)
  })
})

describe('the loop back from the plant', () => {
  beforeEach(() => {
    fresh()
    useResponse.setState({ plans: {}, note: '', stage: 'idle' })
  })
  const planWith = (action: PlantAction) => {
    useResponse.setState({ plans: { x: { situation: 'x', source: 'rules', summary: '', evidence: [], dropped: [], steps: [{ id: 'a', action, text: 't', why: 'w', evidence: [], state: 'todo' }] } } })
    return () => useResponse.getState().plans.x.steps[0]
  }

  it('labels the button after the equipment', () => expect(labelOf({ kind: 'stop', tag: 'K-2200' })).toBe('Shut down K-2200 here'))
  it('goes through the recorded controls, so scoring and handover see it', () => {
    planWith({ kind: 'stop', tag: 'K-2200' })
    useResponse.getState().act('x', 'a')
    expect(sim().actions.some((a) => a.action === 'stop' && a.tag === 'K-2200')).toBe(true)
  })
  it('marks a valve verified only once the plant shows it closed', () => {
    const st = planWith({ kind: 'closeValve', tag: 'ESDV-1601' })
    useResponse.getState().act('x', 'a')
    expect(st().state).toBe('sent')
    run(60)
    expect(st().state).toBe('met')
    expect(sim().valves['ESDV-1601'].pos).toBeLessThanOrEqual(0.05)
  })
  it('shows a stuck valve as refused, in the plant\'s own words', () => {
    sim().inject({ kind: 'valveStuck', tag: 'ESDV-1601' })
    run(2)
    const st = planWith({ kind: 'closeValve', tag: 'ESDV-1601' })
    useResponse.getState().act('x', 'a')
    expect(st().state).toBe('refused')
    expect(st().refusal).toMatch(/stuck/)
    expect(effectOf(st().action)).toBe('failed')
  })
  it('tells the next plan what failed', () => {
    const pack = evidencePack(SIT, [{ text: 'Close ESDV-1601', state: 'refused', refusal: 'valve stuck' }])
    expect(pack.find((e) => e.source === 'tried')?.data).toEqual([{ text: 'Close ESDV-1601', state: 'refused', refusal: 'valve stuck' }])
  })
})

describe('what a model may say', () => {
  beforeEach(() => fresh())
  const pack = () => evidencePack(SIT)

  it('accepts a step on a real tag that cites real evidence', () => {
    const r = checkReply({ summary: 'Seal failing', steps: [stopK] }, pack())
    expect(r.errors).toEqual([])
    expect(r.steps[0].state).toBe('todo')
  })
  it('refuses an invented tag', () => expect(checkReply({ steps: [{ ...stopK, action: { kind: 'stop', tag: 'K-9999' } }] }, pack()).errors[0]).toMatch(/K-9999/))
  it('refuses a valve named as a machine', () => expect(checkReply({ steps: [{ ...stopK, action: { kind: 'stop', tag: 'ESDV-1601' } }] }, pack()).steps).toEqual([]))
  it('refuses a step with no evidence, or evidence that does not exist', () => {
    expect(checkReply({ steps: [{ ...stopK, evidence: [] }] }, pack()).errors[0]).toMatch(/no evidence/)
    expect(checkReply({ steps: [{ ...stopK, evidence: ['E99'] }] }, pack()).errors[0]).toMatch(/E99/)
  })
  it('refuses an unknown action kind', () => expect(checkReply({ steps: [{ ...stopK, action: { kind: 'rm', tag: 'K-2200' } }] }, pack()).errors[0]).toMatch(/unknown action/))
  it('cleans em dashes out of what goes on screen', () => expect(checkReply({ steps: [{ ...stopK, why: 'Rising — fast' }] }, pack()).steps[0].why).toBe('Rising, fast'))
  it('reads JSON in a fence or bare', () => {
    expect(readJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(readJson('here {"a":1}')).toEqual({ a: 1 })
    expect(readJson('no json')).toBeUndefined()
  })
  it('tells the model it can not act and has no abandon button', () => expect(systemPrompt()).toMatch(/you cannot act[\s\S]*Abandon platform/))
})

describe('spending', () => {
  const llm = vi.fn()
  const good = () => sse(JSON.stringify({ summary: 'Seal failing', steps: [stopK] }))
  beforeEach(() => {
    fresh()
    useAuthor.setState({ provider: 'baseten', endpoint: '', models: {} })
    useResponse.setState({ plans: {}, stage: 'idle', asking: null, note: '', partial: '', usage: { requests: 0, input: 0, output: 0, usd: 0 } })
    llm.mockReset().mockImplementation(async () => good())
    vi.stubGlobal('fetch', llm)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends nothing for a fire, a rule plan or a long run', () => {
    sim().inject(fireAt('V-1100'))
    run(120)
    for (const s of readSituations()) useResponse.getState().ensure(s)
    expect(Object.keys(useResponse.getState().plans).length).toBeGreaterThan(0)
    expect(llm).not.toHaveBeenCalled()
  })
  it('spends one request on one click, and counts it', async () => {
    await useResponse.getState().ask(SIT)
    expect(llm).toHaveBeenCalledTimes(1)
    const plan = useResponse.getState().plans[SIT.id]
    expect(plan.source).toBe('model')
    expect(plan.model).toBe('meta-models/muse-spark-open-1026')
    expect(useResponse.getState().usage.requests).toBe(1)
    expect(useResponse.getState().usage.usd).toBeGreaterThan(0)
  })
  it('ignores a second press while one is out', async () => {
    const first = useResponse.getState().ask(SIT)
    await useResponse.getState().ask(SIT)
    await first
    expect(llm).toHaveBeenCalledTimes(1)
  })
  it('repairs once, then stops and keeps what passed', async () => {
    const bad = JSON.stringify({ steps: [stopK, { ...stopK, action: { kind: 'stop', tag: 'K-9999' } }] })
    llm.mockImplementation(async () => sse(bad))
    await useResponse.getState().ask(SIT)
    expect(llm).toHaveBeenCalledTimes(2)
    const plan = useResponse.getState().plans[SIT.id]
    expect(plan.steps).toHaveLength(1)
    expect(plan.dropped[0]).toMatch(/K-9999/)
  })
  it('never retries an error, and keeps the free plan', async () => {
    useResponse.getState().ensure(SIT)
    llm.mockImplementation(async () => new Response(JSON.stringify({ error: 'no credit' }), { status: 402 }))
    await useResponse.getState().ask(SIT)
    expect(llm).toHaveBeenCalledTimes(1)
    expect(useResponse.getState().note).toBe('no credit')
    expect(useResponse.getState().plans[SIT.id].source).toBe('rules')
  })
  it('stops at the limit without calling', async () => {
    useResponse.setState({ usage: { requests: CAP_REQUESTS, input: 0, output: 0, usd: 0 } })
    expect(overLimit(useResponse.getState().usage)).toBe(true)
    await useResponse.getState().ask(SIT)
    expect(llm).not.toHaveBeenCalled()
    expect(useResponse.getState().note).toMatch(/limit/)
  })
  it('sends the key to the route only, never in a prompt', async () => {
    await useResponse.getState().ask(SIT)
    const body = JSON.parse(llm.mock.calls[0][1].body as string) as { key: string; messages: { content: string }[] }
    expect(body.key).toBe('test-key-12345')
    expect(JSON.stringify(body.messages)).not.toContain('test-key-12345')
  })
})
