/**
 * Upsets from the cause & effect rows in src/sim/causeEffect.ts, driven through the real engine with the same
 * triggers as tools/ops.mjs and the scenario library. USD rows trip the machine and latch no Shutdown record,
 * so they are checked by their effects.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { fresh, hasShutdown, latched, resetAll, run, sim } from './harness'
import { CE_BY_ID } from '../src/sim/causeEffect'
import { WELLS } from '../src/sim/alpha'
import { runState } from '../src/state/sim'

const runUntil = (done: () => boolean, limit: number) => {
  for (let t = 0; t < limit && !done(); t++) run(1)
}
const alarmed = (text: RegExp) => sim().alarms.some((a) => text.test(a.text))

describe('V-1100 pressure high-high (pahh-1101)', () => {
  beforeAll(() => {
    fresh()
    sim().setKnob('hpPressure', 41)
    runUntil(() => latched().length > 0, 120)
  })

  it('is a PSD in the matrix', () => expect(CE_BY_ID['pahh-1101'].level).toBe('PSD'))
  it('latches a PSD on Alpha', () => expect(hasShutdown('PSD', 'Alpha', 'pahh-1101')).toBe(true))
  it('trips at 40 barg', () => expect(sim().process.hpPressure).toBeGreaterThanOrEqual(40))
  it('closes the inlet', () => expect(sim().valves['ESDV-1001'].cmd).toBe('closed'))
  it('closes the wing valves', () => expect(sim().valves['XV-1011'].cmd).toBe('closed'))
})

describe('PSV-1101', () => {
  it('lifts at 42 barg when the pressure keeps rising', () => {
    fresh()
    sim().setKnob('hpPressure', 50)
    run(60)
    expect(sim().events.some((e) => /PSV-1101 LIFTING at 42 barg/.test(e.text))).toBe(true)
  })
})

describe('V-1100 level high-high (lahh-1101)', () => {
  beforeAll(() => {
    fresh()
    sim().trip('P-1500A', 'test')
    sim().trip('P-1500B', 'test')
    runUntil(() => latched().length > 0, 600)
  })

  it('is a PSD in the matrix', () => expect(CE_BY_ID['lahh-1101'].level).toBe('PSD'))
  it('latches a PSD on Alpha', () => expect(hasShutdown('PSD', 'Alpha', 'lahh-1101')).toBe(true))
  it('trips at 83 %', () => expect(sim().process.hpLevel).toBeGreaterThanOrEqual(83.3))
  it('takes WHP-N down upstream', () => expect(hasShutdown('PSD', 'WHP-N', 'upstream-psd')).toBe(true))
  it('stops the compressor', () => expect(sim().status['K-2200']).toBe('stopped'))
  it('refuses a reset above LAH', () => expect(sim().resetShutdown(latched()[0].id)).toMatch(/above LAH 72/))

  it('resets once a pump has drained the separator below LAH', () => {
    sim().resetTrip('P-1500A')
    sim().start('P-1500A')
    run(300)
    expect(sim().process.hpLevel).toBeLessThan(72)
    expect(resetAll()).toEqual([])
  })
})

describe('export blocked (export-blocked)', () => {
  beforeAll(() => {
    fresh()
    sim().inject({ kind: 'exportBlocked' })
    run(60)
  })

  it('is an alarm in the matrix', () => expect(CE_BY_ID['export-blocked'].level).toBe('alarm'))
  it('takes export to zero', () => expect(sim().result!.oilExport).toBe(0))
  it('has not shut down yet', () => expect(latched()).toEqual([]))

  it('leads to the LAHH PSD', () => {
    runUntil(() => latched().length > 0, 600)
    expect(hasShutdown('PSD', 'Alpha', 'lahh-1101')).toBe(true)
  })
})

describe('instrument air low-low (ia-ll)', () => {
  beforeAll(() => {
    fresh()
    sim().trip('K-4600', 'test')
  })

  it('is a PSD in the matrix', () => expect(CE_BY_ID['ia-ll'].level).toBe('PSD'))

  it('alarms low at 6.5 barg before it trips', () => {
    runUntil(() => sim().process.iaPressure <= 6.4, 600)
    expect(latched()).toEqual([])
    expect(alarmed(/PT-4603 low \(6.5 barg\)/)).toBe(true)
  })

  it('latches a PSD at 5.5 barg', () => {
    runUntil(() => latched().length > 0, 600)
    expect(sim().process.iaPressure).toBeLessThanOrEqual(5.5)
    expect(hasShutdown('PSD', 'Alpha', 'ia-ll')).toBe(true)
  })

  it('refuses a reset below 6.5 barg', () => expect(sim().resetShutdown(latched()[0].id)).toMatch(/restore K-4600/))

  it('resets once the compressor has restored the header', () => {
    sim().resetTrip('K-4600')
    sim().start('K-4600')
    run(120)
    expect(sim().process.iaPressure).toBeGreaterThan(6.5)
    expect(resetAll()).toEqual([])
  })
})

describe('loss of main power (blackout)', () => {
  beforeAll(() => {
    fresh()
    sim().trip('GT-8100A', 'test')
    run(20)
  })

  it('is a PSD in the matrix', () => expect(CE_BY_ID.blackout.level).toBe('PSD'))
  it('latches a PSD while the standby turbine starts', () => expect(hasShutdown('PSD', 'Alpha', 'blackout')).toBe(true))
  it('generates nothing on the main bus', () => expect(sim().result!.powerGenerated).toBe(0))
  it('starts the emergency generator within 15 s', () => expect(sim().process.emergencyGen).toBe('running'))
  it('raises the blackout alarm', () => expect(alarmed(/Main power lost/)).toBe(true))
  it('refuses a reset with no turbine on the bus', () => expect(sim().resetShutdown(latched()[0].id)).toMatch(/no turbine generator/))

  it('restores main power when the standby is up after 3 minutes', () => {
    run(180)
    expect(sim().status['GT-8100B']).toBe('running')
    expect(sim().process.emergencyGen).toBe('standby')
  })
})

describe('compressor surge (k2200-surge)', () => {
  const chokeBack = () => Object.keys(WELLS).forEach((well) => sim().setChoke(well, 15))

  beforeAll(() => {
    fresh()
    sim().inject({ kind: 'antiSurgeFail' })
    chokeBack()
    runUntil(() => sim().status['K-2200'] === 'tripped', 60)
  })

  it('is a USD in the matrix', () => expect(CE_BY_ID['k2200-surge'].level).toBe('USD'))
  it('trips K-2200 on surge', () => expect(sim().machines['K-2200'].tripCause).toMatch(/^Surge/))
  it('needs a local reset', () => expect(sim().resetTrip('K-2200')).toMatch(/Local reset required/))
  it('accepts the reset at the machine', () => expect(sim().resetTrip('K-2200', { local: true })).toBeNull())
  it('takes no platform down', () => expect(latched()).toEqual([]))

  it('sends the HP gas to flare', () => {
    run(30)
    expect(sim().result!.flare).toBeGreaterThan(10)
  })

  it('does not surge at the same flow while the anti-surge valve works', () => {
    fresh()
    chokeBack()
    run(60)
    expect(runState('K-2200')).toBe('running')
    expect(sim().process.recycle).toBeGreaterThan(0)
  })
})

describe('cooling medium high-high (cm-hh)', () => {
  beforeAll(() => {
    fresh()
    sim().inject({ kind: 'coolingFail' })
    runUntil(() => sim().status['K-2200'] === 'tripped', 900)
  })

  it('is a USD in the matrix', () => expect(CE_BY_ID['cm-hh'].level).toBe('USD'))
  it('trips K-2200 at 55 °C', () => expect(sim().process.cmTemp).toBeGreaterThanOrEqual(55))
  it('names the cause', () => expect(sim().machines['K-2200'].tripCause).toMatch(/TAHH-6303/))
  it('takes no platform down', () => expect(latched()).toEqual([]))
})

describe('load shedding (load-shed)', () => {
  beforeAll(() => {
    fresh()
    sim().setKnob('compressorSpeed', 100)
    for (const pump of ['P-1500B', 'P-6400B', 'P-6200B', 'P-4300B', 'P-W300B']) sim().start(pump)
    run(40)
  })

  it('is a USD in the matrix', () => expect(CE_BY_ID['load-shed'].level).toBe('USD'))
  it('sheds the drilling rig first', () => expect(sim().machines['DR-100'].tripCause).toMatch(/^Load shed/))
  it('keeps the compressor running', () => expect(runState('K-2200')).toBe('running'))
  it('brings demand back under the running turbine', () => expect(sim().result!.powerDemand).toBeLessThan(25))
})

describe('duty machine trip (auto-changeover)', () => {
  it('is an alarm in the matrix', () => expect(CE_BY_ID['auto-changeover'].level).toBe('alarm'))

  it('starts the standby at once', () => {
    fresh()
    sim().trip('P-1500A', 'test')
    expect(sim().status['P-1500B']).toBe('starting')
  })

  it('has the standby running within 15 s', () => {
    fresh()
    sim().trip('P-1500A', 'test')
    run(16)
    expect(sim().status['P-1500B']).toBe('running')
    expect(sim().machines['P-1500B'].autoStarted).toBe(true)
  })

  it('raises an alarm saying the standby took over', () => {
    fresh()
    sim().trip('P-1500A', 'test')
    run(2)
    expect(alarmed(/P-1500B auto-started/)).toBe(true)
  })

  it('holds export through the changeover', () => {
    fresh()
    sim().trip('P-1500A', 'test')
    run(120)
    expect(sim().result!.oilExport).toBeGreaterThan(49000)
    expect(latched()).toEqual([])
  })

  it('leaves the standby alone with auto-changeover off', () => {
    fresh()
    sim().setKnob('autoChangeover', false)
    sim().trip('P-1500A', 'test')
    run(30)
    expect(runState('P-1500B')).toBe('standby')
  })
})

describe('RP riser ESD valves closed (rp-export)', () => {
  beforeAll(() => {
    fresh()
    sim().setValve('ESDV-R101', 'closed')
    sim().setValve('ESDV-R201', 'closed')
    run(240)
  })

  it('is an alarm in the matrix', () => expect(CE_BY_ID['rp-export'].level).toBe('alarm'))
  it('blocks oil export', () => expect(sim().result!.oilExport).toBe(0))
  it('trips K-2200 on high discharge pressure', () => expect(sim().machines['K-2200'].tripCause).toMatch(/^High discharge pressure/))
  it('sends the gas to flare', () => expect(sim().result!.flare).toBeGreaterThan(60))

  it('ends in the LAHH PSD on Alpha', () => {
    runUntil(() => latched().length > 0, 600)
    expect(hasShutdown('PSD', 'Alpha', 'lahh-1101')).toBe(true)
  })
})

describe('WI pumps against a closed path (wi-lowflow)', () => {
  beforeAll(() => {
    fresh()
    sim().setValve('ESDV-W401', 'closed')
    run(60)
  })

  it('is a USD in the matrix', () => expect(CE_BY_ID['wi-lowflow'].level).toBe('USD'))
  it('trips the injection pumps on low flow', () => expect(sim().machines['P-W310A'].tripCause).toMatch(/^Low flow/))
  it('stops injection', () => expect(sim().process.wiRate).toBe(0))
})

describe('compressor trip without a surge', () => {
  beforeAll(() => {
    fresh()
    sim().trip('K-2200', 'test')
    run(120)
  })

  it('flares the gas', () => expect(sim().result!.flare).toBeGreaterThan(60))
  it('books the loss to the gas system', () => expect(sim().kpis.losses.gas).toBeGreaterThan(0))
  it('counts the trip', () => expect(sim().kpis.trips).toBe(1))
})

describe('loss of water injection', () => {
  beforeAll(() => {
    fresh()
    sim().stop('P-W310A')
    sim().stop('P-W310B')
    run(7200, 60)
  })

  it('draws reservoir support down at about 2 % an hour', () => {
    expect(sim().process.reservoir).toBeGreaterThan(0.95)
    expect(sim().process.reservoir).toBeLessThan(0.97)
  })

  it('books the loss to reservoir support', () => expect(sim().kpis.losses.reservoir).toBeGreaterThan(0))
})
