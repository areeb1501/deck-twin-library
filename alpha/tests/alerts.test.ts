/**
 * Alert rules, outbox and trace (plan 04, src/safety/alerts.ts) and AGENTS.md rule 4 on email. Rules run through the
 * alerts sim plugin after real upsets; raise() is called directly only for the dedup window. Risk scores are not
 * asserted: src/safety/risk.ts samples on a timer after a reset, so a trace may or may not include one yet.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dryRun, fresh, positionOf, run, sim, voteOnly } from './harness'
import { addTrace, cleanRecipients, DEFAULT_RECIPIENT, newTraceId, raise, useAlerts, type RaiseInput } from '../src/safety/alerts'
import type { DetectorType } from '../src/sim/fg'
import type { Fault } from '../src/sim/types'

const ALLOWED = ['areeb.projects@gmail.com', 'demoareeb@gmail.com']
const BLOCKED = 'abdullahweb24bd@gmail.com'

const alerts = (rule?: string) => useAlerts.getState().alerts.filter((a) => !rule || a.rule === rule)
const traceOf = (id: string) => useAlerts.getState().trace.filter((s) => s.traceId === id)
const input: RaiseInput = { severity: 'warning', source: 'alarm', rule: 'test-rule', platform: 'Alpha', title: 'Test', body: 'Test body', tags: ['V-1100'], evidence: ['seen'] }

beforeEach(() => {
  fresh()
  useAlerts.getState().clear()
  useAlerts.getState().setRecipients([DEFAULT_RECIPIENT])
})

describe('rules', () => {
  it('raises nothing in normal operation', () => {
    run(600, 10)
    expect(alerts()).toEqual([])
  })

  it('raises a warning for a PSD', () => {
    sim().initiate('PSD', 'Alpha')
    run(2)
    expect(alerts('shutdown').find((a) => a.platform === 'Alpha')).toMatchObject({ severity: 'warning', status: 'queued' })
  })

  it.each(['ESD2', 'ESD1', 'APS'] as const)('raises a critical alert for %s', (level) => {
    sim().initiate(level, 'Alpha', level === 'ESD2' ? 'A-P-SEP' : undefined)
    run(2)
    expect(alerts('shutdown').find((a) => a.platform === 'Alpha')?.severity).toBe('critical')
  })

  it('walks a shutdown alert to the equipment behind the cause', () => {
    sim().setKnob('hpPressure', 41)
    run(60)
    expect(alerts('shutdown').find((a) => a.platform === 'Alpha')?.tags[0]).toBe('V-1100')
  })

  it('stays quiet about a shutdown that existed when the rules started', () => {
    sim().reset()
    sim().initiate('PSD', 'Alpha')
    run(5)
    expect(alerts('shutdown')).toEqual([])
  })

  it('raises one alert per shutdown, not one per tick', () => {
    sim().initiate('PSD', 'Alpha')
    run(120)
    expect(alerts('shutdown').filter((a) => a.platform === 'Alpha')).toHaveLength(1)
  })

  it('raises a P1 alert on a blackout', () => {
    sim().trip('GT-8100A', 'test')
    run(5)
    expect(alerts('p1-alarm').map((a) => a.severity)).toContain('critical')
  })

  describe('fire and gas', () => {
    const [x, , z] = positionOf('V-1100')
    const faultAt: Record<'gas' | 'fire', Fault> = { gas: { kind: 'gasRelease', at: [x, 1, z], rateKgS: 2 }, fire: { kind: 'fire', at: [x, 1.5, z], sizeMW: 2 } }
    const TYPES: Record<'gas' | 'fire', DetectorType[]> = { gas: ['GD', 'OGD'], fire: ['FD', 'HD', 'SD'] }

    function vote(kind: 'gas' | 'fire', count: number) {
      const seeing = dryRun(faultAt[kind], TYPES[kind]).filter((d) => d.zone === 'A-P-SEP' && d.value >= (kind === 'gas' ? 60 : 1) && (kind === 'fire' ? d.type === 'FD' : d.type === 'GD'))
      useAlerts.getState().clear()
      voteOnly(TYPES[kind], seeing.slice(0, count).map((d) => d.tag))
      sim().inject(faultAt[kind])
      run(10)
    }

    it('warns on one gas detector at high', () => {
      vote('gas', 1)
      expect(alerts('fg-gas-high').map((a) => a.severity)).toEqual(['warning'])
    })

    it('warns on one flame detector', () => {
      vote('fire', 1)
      expect(alerts('fg-fire-single').map((a) => a.severity)).toEqual(['warning'])
    })

    it('raises a critical alert on confirmed gas', () => {
      vote('gas', 2)
      expect(alerts('fg-confirmed')).toMatchObject([{ severity: 'critical', title: expect.stringMatching(/^Confirmed gas/) }])
    })

    it('raises a critical alert on a confirmed fire', () => {
      vote('fire', 2)
      expect(alerts('fg-confirmed')).toMatchObject([{ severity: 'critical', title: expect.stringMatching(/^Confirmed fire/) }])
    })
  })
})

describe('dedup', () => {
  it('queues the first alert', () => expect(raise({ ...input })?.status).toBe('queued'))

  it('suppresses the same rule and tag inside ten minutes', () => {
    raise({ ...input })
    run(590, 10)
    expect(raise({ ...input })?.status).toBe('suppressed')
  })

  it('queues it again after ten minutes', () => {
    raise({ ...input })
    run(610, 10)
    expect(raise({ ...input })?.status).toBe('queued')
  })

  it('keeps a different tag apart', () => {
    raise({ ...input })
    expect(raise({ ...input, tags: ['V-1300'] })?.status).toBe('queued')
  })

  it('records the suppression in the trace', () => {
    raise({ ...input })
    const again = raise({ ...input })!
    expect(traceOf(again.traceId).find((s) => s.kind === 'decide')?.text).toMatch(/suppressed \(dedup window 10 min\)/)
  })
})

describe('trace', () => {
  it('walks observe, assess, decide, notify in order', () => {
    const alert = raise({ ...input })!
    expect(traceOf(alert.traceId).map((s) => s.kind)).toEqual(['observe', 'assess', 'decide', 'notify'])
  })

  it('stamps each step with the simulated clock', () => {
    run(100, 10)
    const alert = raise({ ...input })!
    expect(traceOf(alert.traceId).every((s) => s.t === sim().t)).toBe(true)
  })

  it('carries the trace id in the email', () => {
    const alert = raise({ ...input })!
    expect(alert.email.text).toContain(`Trace id ${alert.traceId}`)
  })

  it('adds the acknowledgement to the same trace', async () => {
    const alert = raise({ ...input })!
    useAlerts.getState().ack(alert.id)
    await vi.waitFor(() => expect(traceOf(alert.traceId).at(-1)?.kind).toBe('act'))
    expect(alerts()[0].ack?.by).toBe('operator')
  })

  it('appends a step with addTrace', () => {
    const id = newTraceId()
    addTrace(id, { actor: 'tool', kind: 'observe', text: 'read' })
    expect(traceOf(id).map((s) => s.text)).toEqual(['read'])
  })
})

describe('email recipients', () => {
  it('defaults to areeb.projects@gmail.com', () => expect(DEFAULT_RECIPIENT).toBe('areeb.projects@gmail.com'))
  it('starts the outbox on the default recipient', () => expect(useAlerts.getState().recipients).toEqual([DEFAULT_RECIPIENT]))
  it('keeps both allowed addresses', () => expect(cleanRecipients(ALLOWED)).toEqual(ALLOWED))
  it('drops the blocked address', () => expect(cleanRecipients([BLOCKED, 'demoareeb@gmail.com'])).toEqual(['demoareeb@gmail.com']))
  it('drops the blocked address in any case', () => expect(cleanRecipients(['AbdullahWeb24BD@Gmail.com', 'demoareeb@gmail.com'])).toEqual(['demoareeb@gmail.com']))
  it('drops the blocked address with stray spaces', () => expect(cleanRecipients([`  ${BLOCKED} `, 'demoareeb@gmail.com'])).toEqual(['demoareeb@gmail.com']))
  it('falls back to the default rather than an empty list', () => expect(cleanRecipients([BLOCKED])).toEqual([DEFAULT_RECIPIENT]))
  it('drops what is not an address', () => expect(cleanRecipients(['not-an-address'])).toEqual([DEFAULT_RECIPIENT]))
  it('removes duplicates', () => expect(cleanRecipients(['demoareeb@gmail.com', 'DEMOAREEB@gmail.com'])).toEqual(['demoareeb@gmail.com']))

  it('filters the setter', () => {
    useAlerts.getState().setRecipients([BLOCKED])
    expect(useAlerts.getState().recipients).toEqual([DEFAULT_RECIPIENT])
  })

  it('filters again when drafting, so a store write cannot get past it', () => {
    useAlerts.setState({ recipients: [BLOCKED] })
    expect(raise({ ...input })?.email.to).toEqual([DEFAULT_RECIPIENT])
  })

  it('addresses every alert of a real upset to the default recipient', () => {
    sim().initiate('ESD1', 'Alpha')
    run(120)
    expect(alerts().length).toBeGreaterThan(0)
    expect(new Set(alerts().flatMap((a) => a.email.to))).toEqual(new Set([DEFAULT_RECIPIENT]))
  })
})
