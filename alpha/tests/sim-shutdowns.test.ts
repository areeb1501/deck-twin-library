/**
 * Shutdown hierarchy and latching: APS > ESD1 > ESD2 > PSD > USD, each level including the ones below, as stated
 * in src/sim/causeEffect.ts and src/sim/types.ts. Shutdowns latch, reset only once the cause clears, and the
 * plant stays down until restarted. Drives the real engine (src/state/sim.ts) on its virtual clock.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closedValves, fresh, hasShutdown, latched, resetAll, run, sim, stoppedMachines } from './harness'
import { PSD_VALVES } from '../src/sim/alpha'
import { SHUTDOWN_RANK, type ShutdownLevel } from '../src/sim/types'

const SATELLITE = /-[NRW]\d/

function effectsOf(level: ShutdownLevel) {
  fresh()
  const normallyClosed = closedValves()
  const zone = level === 'ESD2' ? 'A-P-SEP' : undefined
  sim().initiate(level, 'Alpha', zone)
  run(120)
  return { closed: new Set([...closedValves()].filter((tag) => !normallyClosed.has(tag))), stopped: stoppedMachines(), blowdown: sim().valves['BDV-2201'].cmd === 'open' }
}

describe('hierarchy', () => {
  let effects: Record<ShutdownLevel, ReturnType<typeof effectsOf>>

  beforeAll(() => {
    effects = { USD: effectsOf('USD'), PSD: effectsOf('PSD'), ESD2: effectsOf('ESD2'), ESD1: effectsOf('ESD1'), APS: effectsOf('APS') }
  })

  it('ranks the levels APS > ESD1 > ESD2 > PSD > USD', () => {
    const order = Object.keys(SHUTDOWN_RANK).sort((a, b) => SHUTDOWN_RANK[b as ShutdownLevel] - SHUTDOWN_RANK[a as ShutdownLevel])
    expect(order).toEqual(['APS', 'ESD1', 'ESD2', 'PSD', 'USD'])
  })

  it('closes no valve and stops no machine on a USD', () => {
    expect(effects.USD.closed.size).toBe(0)
    expect(effects.USD.stopped.size).toBe(0)
  })

  it.each([
    ['PSD', 'ESD2'],
    ['ESD2', 'ESD1'],
  ] as const)('includes every valve closed by %s in %s', (lower, higher) => {
    expect([...effects[higher].closed]).toEqual(expect.arrayContaining([...effects[lower].closed]))
  })

  it.each([
    ['PSD', 'ESD2'],
    ['ESD2', 'ESD1'],
    ['ESD1', 'APS'],
  ] as const)('includes every machine stopped by %s in %s', (lower, higher) => {
    expect([...effects[higher].stopped]).toEqual(expect.arrayContaining([...effects[lower].stopped]))
  })

  it('includes the ESD1 valve closures on Alpha and WHP-N in an APS', () => {
    const onAlphaOrWhp = [...effects.ESD1.closed].filter((tag) => !/-[RW]\d/.test(tag))
    expect([...effects.APS.closed]).toEqual(expect.arrayContaining(onAlphaOrWhp))
  })

  it('closes the PSD valve list on a PSD', () => {
    expect([...effects.PSD.closed]).toEqual(expect.arrayContaining(PSD_VALVES.Alpha!))
  })

  it('adds zone isolation at ESD2', () => {
    expect(effects.PSD.closed.has('ESDV-2101')).toBe(false)
    expect(effects.ESD2.closed.has('ESDV-2101')).toBe(true)
  })

  it('adds the turbine fuel valves at ESD1', () => {
    expect(effects.ESD2.closed.has('ESDV-8101')).toBe(false)
    expect(effects.ESD1.closed.has('ESDV-8101')).toBe(true)
  })

  it('stops the running turbine only at APS', () => {
    expect(effects.ESD1.stopped.has('GT-8100A')).toBe(false)
    expect(effects.APS.stopped.has('GT-8100A')).toBe(true)
  })

  it('blows down at ESD2 and above, not at PSD', () => {
    expect([effects.PSD.blowdown, effects.ESD2.blowdown, effects.ESD1.blowdown, effects.APS.blowdown]).toEqual([false, true, true, true])
  })

  it('leaves the satellites to the knock-on shutdowns, so a PSD reaches them through WHP-N and WI', () => {
    expect([...effects.PSD.closed].filter((tag) => SATELLITE.test(tag))).toEqual(expect.arrayContaining(['ESDV-N2003', 'ESDV-W401']))
  })
})

describe('knock-on', () => {
  it('shuts WHP-N in when Alpha has a PSD', () => {
    fresh()
    sim().initiate('PSD', 'Alpha')
    expect(hasShutdown('PSD', 'WHP-N', 'upstream-psd')).toBe(true)
  })

  it('stops WI when WHP-N has a PSD', () => {
    fresh()
    sim().initiate('PSD', 'WHP-N')
    expect(hasShutdown('PSD', 'WI', 'injector-shut')).toBe(true)
  })

  it('never raises a higher level on the way', () => {
    fresh()
    sim().initiate('PSD', 'Alpha')
    run(300)
    expect(new Set(latched().map((s) => s.level))).toEqual(new Set(['PSD']))
  })

  it('does not add a lower level under a latched higher one', () => {
    fresh()
    sim().initiate('ESD1', 'Alpha')
    sim().initiate('PSD', 'Alpha')
    expect(latched().filter((s) => s.platform === 'Alpha').map((s) => s.level)).toEqual(['ESD1'])
  })

  it('does not latch the same cause twice', () => {
    fresh()
    sim().setKnob('hpPressure', 41)
    run(300)
    expect(latched().filter((s) => s.causeId === 'pahh-1101')).toHaveLength(1)
  })
})

describe('general alarm', () => {
  it('sounds abandon on every platform at APS', () => {
    fresh()
    sim().initiate('APS', 'Alpha')
    run(5)
    const platforms = Object.values(sim().result!.platforms)
    expect(platforms.map((p) => p!.ga)).toEqual(platforms.map(() => 'abandon'))
  })

  it('sounds muster at a manual ESD1', () => {
    fresh()
    sim().initiate('ESD1', 'Alpha')
    run(5)
    expect(sim().result!.platforms.Alpha!.ga).toBe('muster')
  })
})

describe('latching', () => {
  beforeEach(() => {
    fresh()
    sim().setKnob('hpPressure', 41)
    run(60)
    sim().setKnob('hpPressure', 35)
  })

  it('refuses a reset while the cause is active', () => {
    const psd = latched().find((s) => s.causeId === 'pahh-1101')!
    expect(sim().resetShutdown(psd.id)).toMatch(/above PAH 38/)
    expect(latched()).toContain(psd)
  })

  it('stays latched after the cause clears, until the operator resets it', () => {
    run(300)
    expect(sim().process.hpPressure).toBeLessThan(38)
    expect(hasShutdown('PSD', 'Alpha', 'pahh-1101')).toBe(true)
  })

  it('accepts the reset once the cause has cleared', () => {
    run(300)
    expect(resetAll()).toEqual([])
    expect(latched()).toEqual([])
  })

  it('keeps the plant down between reset and restart', () => {
    run(300)
    resetAll()
    run(120)
    expect(sim().valves['ESDV-1001'].cmd).toBe('closed')
    expect(sim().result!.oilProduced).toBe(0)
  })

  it('refuses a restart before the reset', () => {
    expect(sim().restart('Alpha')).toMatch(/^Reset the PSD/)
  })

  it('refuses to reopen a valve held by the latched shutdown', () => {
    expect(sim().setValve('ESDV-1001', 'open')).toMatch(/held closed/)
  })

  it('refuses to start a machine the shutdown stopped', () => {
    expect(sim().start('K-2200')).toMatch(/interlocked/)
  })

  it('refuses to reset WHP-N ahead of Alpha', () => {
    const upstream = latched().find((s) => s.platform === 'WHP-N')!
    expect(sim().resetShutdown(upstream.id)).toMatch(/Alpha still has a latched PSD/)
  })

  describe('after a restart', () => {
    beforeEach(() => {
      run(300)
      resetAll()
      sim().restart('Alpha')
    })

    it('clears the shutdowns on every platform it took down', () => expect(sim().shutdowns).toEqual([]))

    it('reopens the inlet and the bridge valve', () => {
      expect(sim().valves['ESDV-1001'].cmd).toBe('open')
      expect(sim().valves['ESDV-N2003'].cmd).toBe('open')
    })

    it('restarts the compressor through its start sequence', () => expect(sim().status['K-2200']).toBe('starting'))

    it('ramps the wells back over about ten minutes', () => {
      run(900, 10)
      expect(sim().result!.oilExport).toBeGreaterThan(49000)
    })
  })
})
