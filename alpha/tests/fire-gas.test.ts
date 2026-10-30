/**
 * Fire & gas voting on the real detector geometry (src/sim/fg.ts): 1ooN alarms, 2ooN confirms, per fire zone,
 * as in the fire & gas rows of src/sim/causeEffect.ts. Which detectors vote is set with the operator's inhibit,
 * so the cases use real clouds and flames, and the detectors that see them are read from a dry run.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { dryRun, fresh, hasShutdown, latched, positionOf, resetAll, run, sim, voteOnly } from './harness'
import { CE_BY_ID } from '../src/sim/causeEffect'
import type { DetectorType } from '../src/sim/fg'
import type { Fault } from '../src/sim/types'

const ZONE = 'A-P-SEP'
const GAS: DetectorType[] = ['GD', 'OGD']
const FIRE: DetectorType[] = ['FD', 'HD', 'SD']
const [x, , z] = positionOf('V-1100')
const release: Fault = { kind: 'gasRelease', at: [x, 1, z], rateKgS: 2 }
const fire: Fault = { kind: 'fire', at: [x, 1.5, z], sizeMW: 2 }

const zone = () => sim().fg[ZONE]
const fgAlarms = () => sim().alarms.filter((a) => a.kind === 'fg')

describe('gas voting', () => {
  let high: string[]
  let low: string[]

  beforeAll(() => {
    const seen = dryRun(release, GAS).filter((d) => d.zone === ZONE && d.type === 'GD')
    high = seen.filter((d) => d.value >= 60).map((d) => d.tag)
    low = seen.filter((d) => d.value >= 20 && d.value < 60).map((d) => d.tag)
  })

  it('finds detectors on both sides of the setpoints in the zone', () => {
    expect(high.length).toBeGreaterThanOrEqual(2)
    expect(low.length).toBeGreaterThanOrEqual(1)
  })

  describe('one detector at the low setpoint', () => {
    beforeAll(() => {
      fresh()
      voteOnly(GAS, low.slice(0, 1))
      sim().inject(release)
      run(30)
    })

    it('shows low gas in the zone', () => expect(zone().gas).toBe('low'))
    it('initiates no shutdown', () => expect(latched()).toEqual([]))
  })

  describe('one detector at the high setpoint', () => {
    beforeAll(() => {
      fresh()
      voteOnly(GAS, high.slice(0, 1))
      sim().inject(release)
      run(30)
    })

    it('is an alarm in the matrix', () => expect(CE_BY_ID['gas-high'].level).toBe('alarm'))
    it('shows high gas in the zone', () => expect(zone().gas).toBe('high'))
    it('counts one detector', () => expect(zone().highCount).toBe(1))
    it('raises a priority 1 alarm on the detector', () => expect(fgAlarms().some((a) => a.tag === high[0] && a.priority === 1)).toBe(true))
    it('initiates no shutdown', () => expect(latched()).toEqual([]))
    it('sounds no general alarm', () => expect(sim().result!.platforms.Alpha!.ga).toBe('normal'))
  })

  describe('two detectors at the high setpoint', () => {
    beforeAll(() => {
      fresh()
      voteOnly(GAS, high.slice(0, 2))
      sim().inject(release)
      run(30)
    })

    it('is an ESD2 in the matrix', () => expect(CE_BY_ID['gas-confirmed'].level).toBe('ESD2'))
    it('confirms gas in the zone', () => expect(zone().gas).toBe('confirmed'))
    it('latches an ESD2 on the zone', () => expect(latched().find((s) => s.causeId === 'gas-confirmed')).toMatchObject({ level: 'ESD2', platform: 'Alpha', zone: ZONE }))
    it('sounds the gas general alarm', () => expect(sim().result!.platforms.Alpha!.ga).toBe('gas'))
    it('closes the zone ESD valves', () => expect(sim().valves['ESDV-2101'].cmd).toBe('closed'))
    it('blows the zone down', () => expect(sim().valves['BDV-2201'].pos).toBe(1))
    it('stops the compressor', () => expect(sim().status['K-2200']).toBe('stopped'))
    it('refuses a reset while gas is detected', () => expect(sim().resetShutdown(latched()[0].id)).toMatch(/gas still detected/))

    it('resets once blowdown has taken the release away', () => {
      run(2000, 5)
      expect(zone().gas).toBe('normal')
      expect(resetAll()).toEqual([])
    })
  })

  it('keeps a faulted detector out of the vote', () => {
    fresh()
    voteOnly(GAS, high.slice(0, 2))
    sim().inject({ kind: 'detectorFault', tag: high[1] })
    sim().inject(release)
    run(30)
    expect(sim().detectors[high[1]].state).toBe('fault')
    expect(zone().gas).toBe('high')
    expect(latched()).toEqual([])
  })

  it('confirms with every detector in service', () => {
    fresh()
    sim().inject(release)
    run(30)
    expect(hasShutdown('ESD2', 'Alpha', 'gas-confirmed')).toBe(true)
  })
})

describe('fire voting', () => {
  let flames: string[]

  beforeAll(() => {
    flames = dryRun(fire, FIRE).filter((d) => d.zone === ZONE && d.type === 'FD' && d.value > 0).map((d) => d.tag)
  })

  it('has two flame detectors on the fire', () => expect(flames.length).toBeGreaterThanOrEqual(2))

  describe('one flame detector', () => {
    beforeAll(() => {
      fresh()
      voteOnly(FIRE, flames.slice(0, 1))
      sim().inject(fire)
      run(30)
    })

    it('is an alarm in the matrix', () => expect(CE_BY_ID['fire-single'].level).toBe('alarm'))
    it('shows a single flame in the zone', () => expect(zone().fire).toBe('single'))
    it('raises an alarm', () => expect(fgAlarms().some((a) => a.tag === flames[0])).toBe(true))
    it('initiates no shutdown', () => expect(latched()).toEqual([]))
    it('releases no deluge', () => expect(zone().deluge).toBe(false))
  })

  describe('two flame detectors', () => {
    beforeAll(() => {
      fresh()
      voteOnly(FIRE, flames.slice(0, 2))
      sim().inject(fire)
      run(60)
    })

    it('is an ESD1 in the matrix', () => expect(CE_BY_ID['fire-confirmed'].level).toBe('ESD1'))
    it('confirms the fire', () => expect(zone().fire).toBe('confirmed'))
    it('latches an ESD1 on Alpha', () => expect(hasShutdown('ESD1', 'Alpha', 'fire-confirmed')).toBe(true))
    it('sounds the fire general alarm', () => expect(sim().result!.platforms.Alpha!.ga).toBe('fire'))
    it('releases the zone deluge', () => expect(zone().deluge).toBe(true))
    it('starts the firewater pumps', () => expect(sim().status['P-7101A']).toBe('running'))
    it('blows Alpha down', () => expect(sim().valves['BDV-2201'].pos).toBe(1))
    it('changes the turbines over to diesel', () => expect(sim().alarms.some((a) => /on diesel/.test(a.text))).toBe(true))
    it('refuses a reset while it burns', () => expect(sim().resetShutdown(latched()[0].id)).toMatch(/fire still burning/))

    it('resets once deluge and blowdown have put it out', () => {
      run(2000, 5)
      expect(sim().incidents).toEqual([])
      expect(resetAll()).toEqual([])
    })
  })
})

describe('voting groups', () => {
  const boundary: Fault = { kind: 'gasRelease', at: [0, 1, -10], rateKgS: 8 }

  it('votes per zone, so one detector in each of two zones confirms nothing', () => {
    const seen = dryRun(boundary, GAS).filter((d) => d.value >= 60 && d.type === 'GD')
    const sep = seen.find((d) => d.zone === 'A-P-SEP')!
    const exp = seen.find((d) => d.zone === 'A-P-EXP')!
    voteOnly(GAS, [sep.tag, exp.tag])
    sim().inject(boundary)
    run(30)
    expect([sim().fg['A-P-SEP'].gas, sim().fg['A-P-EXP'].gas]).toEqual(['high', 'high'])
    expect(latched()).toEqual([])
  })
})
