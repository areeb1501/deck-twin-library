/**
 * Scenario specs: the JSON a model writes. The first group is the claim that matters: a spec runs exactly like the hand-written
 * scenario it was ported from, under the same scripted response, so the format really does reach the app's mechanics. The rest
 * pins the validator (a spec that names something the engine can't do never runs), the unattended check and local storage.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { sim } from './harness'
import { pred, compile, tagsIn } from '../src/sim/scen/compile'
import { newScenarioId, useCustom } from '../src/sim/scen/custom'
import { dryRun } from '../src/sim/scen/dryRun'
import { SPEC_AIR, SPEC_EXAMPLES, SPEC_GAS, SPEC_LEVEL } from '../src/sim/scen/examples'
import { SCENARIOS, SCENARIO_BY_ID, scenarioById, useScenario } from '../src/sim/scenarios'
import type { ScenarioSpec } from '../src/sim/scen/spec'
import { validate } from '../src/sim/scen/validate'
import type { Attempt, Ctx, Scenario } from '../src/sim/scen/types'
import { usePlantStore } from '../src/state/plantStore'

const plant = () => usePlantStore.getState().plant
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** ticks a scenario through a scripted operator until it ends; `script` runs once per sim second with the elapsed time */
function play(sc: Scenario, script: (el: number) => void, seconds = sc.maxDuration + 5): Attempt {
  useScenario.setState({ live: null, last: null, history: [] })
  const why = useScenario.getState().start(sc, 1)
  expect(why).toBeNull()
  for (let el = 0; el < seconds && useScenario.getState().live; el++) {
    sim().tick(1)
    script(useScenario.getState().live?.el ?? el)
  }
  useScenario.getState().abort('test over')
  return useScenario.getState().last!
}
const outcomes = (a: Attempt) => Object.fromEntries(a.objectives.map((o) => [o.id, { status: o.status, at: o.at }]))
const scripts: Record<string, () => (el: number) => void> = {
  'hp-level-lv1101': () => {
    let cut = false
    let back = false
    let sent = false
    return (el) => {
      if (el > 100) for (const a of sim().alarms) if (a.tag === 'LT-1101' && a.state === 'unack') sim().ackAlarm(a.id)
      if (!sent && el > 140) sent = useScenario.getState().order('bypass') === null
      if (!cut && (sim().process.hpLevel ?? 0) > 68) {
        cut = true
        for (const w of Object.keys(sim().knobs.chokes)) sim().setChoke(w, 5)
      }
      if (cut && !back && el > 700 && (sim().process.hpLevel ?? 99) < 58) {
        back = true
        for (const w of Object.keys(sim().knobs.chokes)) sim().setChoke(w, 60)
      }
    }
  },
  'instrument-air': () => {
    let started = false
    let sent = false
    return (el) => {
      if (el > 70) for (const a of sim().alarms) if (a.tag === 'K-4600' && a.state === 'unack') sim().ackAlarm(a.id)
      if (!sent && el > 80) sent = useScenario.getState().order('field:K-4600') === null
      if (sent && !started && sim().status['K-4600'] !== 'tripped') started = sim().start('K-4600') === null
    }
  },
  'gas-compressor': () => {
    let isolating = false
    let reset = false
    return (el) => {
      if (el > 100 && el % 10 === 0) sim().ackAll()
      if (el > 100) for (const id of ['verify', 'muster', 'pob']) if (useScenario.getState().live?.actions.find((a) => a.id === id)?.available && !useScenario.getState().live?.actions.find((a) => a.id === id)?.done && !useScenario.getState().live?.actions.find((a) => a.id === id)?.due) useScenario.getState().order(id)
      if (!isolating && useScenario.getState().live?.actions.find((a) => a.id === 'isolate')?.available) isolating = useScenario.getState().order('isolate') === null
      if (isolating && !reset && !useScenario.getState().live?.actions.find((a) => a.id === 'isolate')?.available) {
        const open = sim().shutdowns.filter((s) => !s.resetAt)
        if (open.length && open.every((s) => sim().resetShutdown(s.id) === null)) reset = sim().restart('Alpha') === null
      }
    }
  },
}

describe('a spec runs like the scenario it was ported from', () => {
  const pairs: [string, ScenarioSpec][] = [
    ['hp-level-lv1101', SPEC_LEVEL],
    ['instrument-air', SPEC_AIR],
    ['gas-compressor', SPEC_GAS],
  ]
  it.each(pairs)('%s, scripted good response', (id, spec) => {
    const hand = play(SCENARIO_BY_ID[id], scripts[id]())
    const port = play(compile({ ...spec, id: `custom:${id}` }), scripts[id]())
    expect(hand.objectives.some((o) => o.status === 'done')).toBe(true)
    expect(outcomes(port)).toEqual(outcomes(hand))
    expect(port.score).toBe(hand.score)
    expect(port.pass).toBe(hand.pass)
  })

  it.each(pairs)('%s, nobody responds', (id, spec) => {
    const hand = play(SCENARIO_BY_ID[id], () => undefined)
    const port = play(compile({ ...spec, id: `custom:${id}` }), () => undefined)
    expect(outcomes(port)).toEqual(outcomes(hand))
    expect(port.score).toBe(hand.score)
    expect(port.pass).toBe(false)
  })
})

describe('the validator', () => {
  const broken = (edit: (s: ScenarioSpec) => void) => {
    const s = copy(SPEC_AIR)
    edit(s)
    return validate(s, plant())
  }
  const first = (edit: (s: ScenarioSpec) => void) => broken(edit).errors.join('\n')

  it('passes every example', () => {
    for (const s of SPEC_EXAMPLES) expect(validate(copy(s), plant()).errors).toEqual([])
  })
  it('refuses anything but an object', () => {
    for (const bad of [null, 3, 'x', []]) expect(validate(bad, plant()).spec).toBeNull()
  })
  it('refuses a trip on a tag the engine does not run, and says what it does run', () => {
    expect(first((s) => (s.timeline[0].do = [{ do: 'trip', tag: 'V-1100', cause: 'x' }]))).toMatch(/"V-1100" is not a machine.*K-2200/s)
  })
  it('refuses tags that do not exist', () => {
    expect(first((s) => (s.goals[1].check = { is: 'machine', tag: 'P-9999', state: 'on' }))).toContain('P-9999')
    expect(first((s) => (s.timeline[0].do = [{ do: 'gasRelease', at: 'K-9999', rateKgS: 1 }]))).toContain('K-9999')
    expect(first((s) => (s.timeline[0].do = [{ do: 'detectorFault', tag: 'GD-0000' }]))).toContain('GD-0000')
    expect(first((s) => (s.timeline[1].when = { is: 'gas', level: 'high', zone: 'NOPE' }))).toContain('NOPE')
    expect(first((s) => (s.timeline[1].when = { is: 'metric', metric: 'nope', op: '<', value: 1 }))).toContain('nope')
  })
  it('refuses a level fault on anything but a level valve', () => {
    expect(first((s) => (s.timeline[0].do = [{ do: 'levelControlFail', tag: 'ESDV-1001' }]))).toContain('ESDV-1001')
  })
  it('refuses references to nothing', () => {
    expect(first((s) => (s.goals[0].from = 'ghost'))).toContain('ghost')
    expect(first((s) => (s.goals[0].check = { is: 'ordered', action: 'ghost' }))).toContain('ghost')
    expect(first((s) => (s.goals[0].check = { is: 'incident', incident: 'ghost' }))).toContain('ghost')
  })
  it('accepts the automatic field order and marks', () => {
    expect(broken((s) => (s.goals[0].check = { is: 'ordered', action: 'field:K-4600' })).errors).toEqual([])
    expect(broken((s) => (s.goals[0].check = { is: 'fired', step: '_down:Alpha' })).errors).toEqual([])
  })
  it('refuses a step that can never fire', () => {
    expect(first((s) => (s.timeline[0].at = s.maxDuration + 10))).toMatch(/never fires/)
    expect(first((s) => {
      s.timeline[1] = { id: 'a', after: { step: 'b', seconds: 1 } }
      s.timeline[2] = { id: 'b', after: { step: 'a', seconds: 1 } }
    })).toMatch(/waits on itself/)
    expect(first((s) => (s.timeline[1] = { id: 'loose' }))).toMatch(/at.*after.*when/)
  })
  it('refuses a scenario with nothing to respond to', () => {
    expect(first((s) => (s.timeline = [{ id: 'quiet', at: 60, do: [{ do: 'note', text: 'hello' }] }]))).toMatch(/Nothing happens/)
    expect(first((s) => (s.goals = s.goals.filter((g) => g.kind === 'avoid')))).toMatch(/passes by doing nothing/)
  })
  it('bounds the numbers', () => {
    expect(first((s) => (s.maxDuration = 999999))).toContain('maxDuration')
    expect(first((s) => (s.timeline[0].do = [{ do: 'gasRelease', at: 'K-2200', rateKgS: 5000 }]))).toContain('rateKgS')
    expect(first((s) => (s.goals[1].deadline = 1))).toContain('deadline')
  })
  it('caps the size of what a model can send', () => {
    expect(first((s) => (s.timeline = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, at: i, do: [{ do: 'note', text: 'x' }] }))))).toContain('limit')
  })
  it('ignores what it does not know, cleans text, and never trusts a model-set id', () => {
    const s = copy(SPEC_AIR) as ScenarioSpec & { run: string }
    s.run = 'fetch("https://example.com")'
    s.title = 'Air — lost'
    expect(validate(s, plant()).spec?.title).toBe('Air: lost')
    const sc = compile(validate(s, plant()).spec!)
    expect(Object.keys(sc)).not.toContain('run')
  })
  it('refuses a shutdown cause that can never match', () => {
    expect(first((s) => (s.goals[3].check = { is: 'shutdown', cause: 'LAHH-1101' }))).toMatch(/not a cause & effect row.*lahh-1101/s)
  })
  it('refuses an alarm tag that nothing raises', () => {
    expect(first((s) => (s.goals[0].check = { is: 'acked', tag: 'LAH-1101' }))).toContain('LAH-1101')
  })
  it('refuses a spec the runner could not start', () => {
    expect(first((s) => (s.goals[3].check = { is: 'operatorDid', tag: 'Alpha', action: 'restart' }))).toMatch(/can't start on this plant/)
  })
  it('turns en dashes into plain text too, and keeps ranges readable', () => {
    const s = copy(SPEC_AIR)
    s.title = 'Air – lost'
    s.summary = 'Trips in 3–4 min'
    const out = validate(s, plant()).spec!
    expect(out.title).toBe('Air: lost')
    expect(out.summary).toBe('Trips in 3 to 4 min')
  })
  it('refuses a plant with no process model', () => {
    const was = plant()
    usePlantStore.setState({ plant: { ...was, custom: true } as never })
    try {
      expect(validate(copy(SPEC_AIR), plant()).errors.join()).toMatch(/Alpha field/)
    } finally {
      usePlantStore.setState({ plant: was })
    }
  })
})

describe('conditions', () => {
  const ctx = (over: Partial<Ctx>) => ({ s: sim(), plant: plant(), el: 100, t0: 0, mark: {}, data: {}, did: {}, alarms: [], ops: [], ...over }) as unknown as Ctx
  it('combines', () => {
    const yes = { is: 'elapsed', seconds: 50 } as const
    const no = { is: 'elapsed', seconds: 500 } as const
    expect(pred({ is: 'all', of: [yes, no] })(ctx({}))).toBe(false)
    expect(pred({ is: 'any', of: [yes, no] })(ctx({}))).toBe(true)
    expect(pred({ is: 'not', cond: no })(ctx({}))).toBe(true)
  })
  it('counts time since a step', () => {
    expect(pred({ is: 'fired', step: 'x', after: 60 })(ctx({ mark: { x: 90 }, el: 100 }))).toBe(false)
    expect(pred({ is: 'fired', step: 'x', after: 60 })(ctx({ mark: { x: 30 }, el: 100 }))).toBe(true)
  })
  it('a condition from another version is false, not a crash', () => {
    const unknown = { is: 'fromTheFuture' } as unknown as Parameters<typeof pred>[0]
    expect(pred({ is: 'all', of: [unknown] })(ctx({}))).toBe(false)
    expect(pred({ is: 'any', of: [unknown] })(ctx({}))).toBe(false)
  })
  it('a metric the engine has no value for is false, not a crash', () => {
    expect(pred({ is: 'metric', metric: 'hpLevel', op: '<', value: 1e6 })(ctx({ s: {} as never }))).toBe(false)
  })
})

describe('the unattended check', () => {
  it('runs the examples and reports what happened', () => {
    const r = dryRun(copy(SPEC_AIR))
    expect(r.blockers).toEqual([])
    expect(r.fired.map((x) => x.id)).toContain('trip')
    expect(r.shutdowns.some((s) => s.causeId === 'ia-ll')).toBe(true)
    expect(r.alarms.some((a) => a.tag === 'K-4600')).toBe(true)
    expect(r.idlePass).toBe(false)
  })
  it('leaves no live scenario behind', () => {
    dryRun(copy(SPEC_AIR))
    expect(useScenario.getState().live).toBeNull()
  })
  it('catches a scenario that passes with nobody at the console', () => {
    const s = copy(SPEC_AIR)
    s.timeline[0] = { id: 'trip', at: 60, do: [{ do: 'trip', tag: 'P-1500B', cause: 'standby pump fault' }] }
    s.goals = [{ id: 'easy', text: 'Keep the export going', kind: 'do', category: 'production', check: { is: 'metric', metric: 'oilExport', op: '>', value: 1000 } }]
    s.complete = undefined
    s.maxDuration = 400
    expect(dryRun(s).blockers.join()).toMatch(/does nothing/)
  })
  it('catches a step whose trigger never comes', () => {
    const s = copy(SPEC_AIR)
    s.timeline[0] = { id: 'trip', when: { is: 'metric', metric: 'hpLevel', op: '>', value: 99 }, do: [{ do: 'trip', tag: 'K-4600', cause: 'x', local: true }] }
    s.maxDuration = 400
    const r = dryRun(s)
    expect(r.quiet).toContain('trip')
    expect(r.blockers.join()).toMatch(/nothing happened/)
  })
  it('catches a mark that is already true in normal operation', () => {
    const s = copy(SPEC_AIR)
    s.timeline.push({ id: 'valveFreed', when: { is: 'valve', tag: 'ESDV-1601', op: '>', value: 0.5 } })
    s.maxDuration = 900
    expect(dryRun(s).blockers.join()).toMatch(/"valveFreed" fired.*before anything had gone wrong/)
  })
  it('catches an acknowledgement objective for an alarm that never comes', () => {
    const s = copy(SPEC_AIR)
    s.goals[0] = { ...s.goals[0], check: { is: 'acked', tag: 'LT-1101' } }
    s.maxDuration = 300
    expect(dryRun(s).blockers.join()).toMatch(/LT-1101.*no alarm with that tag.*K-4600/s)
  })
  it('names a step the plant never reached, and keeps quiet about one that waits on the operator', () => {
    const s = copy(SPEC_AIR)
    s.timeline.push({ id: 'never', when: { is: 'metric', metric: 'hpLevel', op: '>', value: 99 } })
    s.timeline.push({ id: 'dispatched', when: { is: 'ordered', action: 'field:K-4600' } })
    const r = dryRun(s)
    expect(r.unreached).toContain('never')
    expect(r.unreached).not.toContain('dispatched')
    expect(r.blockers).toEqual([])
  })
  it.each(SPEC_EXAMPLES.map((s) => [s.title, s] as const))('finds nothing wrong with the example: %s', (_t, spec) => {
    expect(dryRun(copy(spec)).blockers).toEqual([])
  })
  it.each(SCENARIOS.map((s) => s.id))('does not fail on the built-in %s', (id) => {
    const a = play(SCENARIO_BY_ID[id], () => undefined)
    expect(a.pass).toBe(false)
  })
})

describe('local storage', () => {
  beforeEach(() => {
    useCustom.setState({ items: [], compiled: {} })
    localStorage.removeItem('deckTwin.customScenarios.v1')
  })
  const save = (spec = SPEC_AIR) => {
    const id = newScenarioId(spec.title)
    useCustom.getState().put({ id, spec: copy(spec), model: 'test-model', chat: [], createdAt: 'x', updatedAt: 'x' })
    return id
  }
  it('stores the spec, not code', () => {
    save()
    const raw = localStorage.getItem('deckTwin.customScenarios.v1')!
    expect(() => JSON.parse(raw)).not.toThrow()
    expect(raw).not.toContain('=>')
  })
  it('makes a saved scenario startable by id, and leaves the built-in list alone', () => {
    const id = save()
    expect(scenarioById(id)?.title).toBe(SPEC_AIR.title)
    expect(SCENARIOS).toHaveLength(12)
    expect(SCENARIO_BY_ID[id]).toBeUndefined()
    expect(useScenario.getState().start(id, 1)).toBeNull()
    useScenario.getState().abort('test over')
  })
  it('names the plant tags a scenario needs', () => {
    expect(tagsIn(SPEC_AIR)).toContain('K-4600')
    expect(tagsIn(SPEC_AIR)).not.toContain('ack')
  })
  it('refuses to start a stored spec that no longer checks out', () => {
    const id = save()
    useCustom.setState((c) => ({ items: c.items.map((x) => (x.id === id ? { ...x, spec: { ...x.spec, goals: [{ ...x.spec.goals[0], check: { is: 'fromTheFuture' } as never }, ...x.spec.goals.slice(1)] } } : x)) }))
    expect(useScenario.getState().start(id, 1)).toMatch(/no longer checks out.*fromTheFuture/)
    expect(useScenario.getState().live).toBeNull()
  })
  it('removes', () => {
    const id = save()
    useCustom.getState().remove(id)
    expect(scenarioById(id)).toBeUndefined()
  })
})
