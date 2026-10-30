/**
 * Simulation steady state: an hour of normal operation holds the setpoints and alarm limits of the plant
 * description (docs/PLANT.md in the deck-twin repo, "Key instruments and setpoints"), which are literals here.
 * Only model-driven tags are read from the engine: historian tags sit near nominal by construction.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { fresh, run, sim } from './harness'
import { plant } from '../src/model/plant'
import { CAP, HP, REF_CHOKE, WELLS } from '../src/sim/alpha'
import { procValue, runState } from '../src/state/sim'

const potential = (platform: string) => Object.values(WELLS).filter((w) => w.platform === platform).reduce((sum, w) => sum + w.oil, 0)

describe('after an hour of normal operation', () => {
  beforeAll(() => {
    fresh()
    run(3600, 10)
  })

  it.each([
    ['PT-1101', 35, 0.1],
    ['LT-1101', 1870, 5],
    ['PT-4603', 8.6, 0.05],
    ['TT-6303', 32, 0.1],
    ['PT-8101', 18.2, 0.1],
    ['FT-R150', 49800, 50],
    ['PT-W311', 226, 0.5],
    ['FT-W401', 40000, 1],
  ])('holds %s at %d', (tag, nominal, tolerance) => {
    expect(Math.abs(procValue(tag)! - nominal)).toBeLessThanOrEqual(tolerance)
  })

  it('exports close to the 49 000 bbl/d design rate', () => expect(Math.abs(sim().result!.oilExport - 49000)).toBeLessThan(1000))
  it('exports close to the 75 MMscfd design rate', () => expect(Math.abs(sim().result!.gasExport - 75)).toBeLessThan(1))
  it('flares only the 0.4 MMscfd purge', () => expect(sim().result!.flare).toBeCloseTo(0.4))
  it('stays inside the 25 MW rating of the running turbine', () => expect(sim().result!.powerDemand).toBeLessThan(25))
  it('keeps the compressor out of the recycle band', () => {
    expect(sim().process.surgeMargin).toBeGreaterThan(10)
    expect(sim().process.recycle).toBe(0)
  })
  it('replaces the voidage, so reservoir support holds', () => expect(sim().process.reservoir).toBeCloseTo(1, 3))
  it('raises no alarm', () => expect(sim().alarms).toEqual([]))
  it('latches no shutdown', () => expect(sim().shutdowns).toEqual([]))
  it('reports 100 % production efficiency', () => expect(sim().kpis.pe).toBeCloseTo(100, 3))
  it('keeps the standby machines on standby', () => {
    expect(runState('P-1500B')).toBe('standby')
    expect(runState('GT-8100B')).toBe('standby')
  })
})

describe('field data', () => {
  it('gives Alpha a 44 800 bbl/d potential at full choke', () => expect(potential('Alpha')).toBe(44800))
  it('gives WHP-N a 28 200 bbl/d potential at full choke', () => expect(potential('WHP-N')).toBe(28200))
  it('uses a 60 % reference choke', () => expect(REF_CHOKE).toBe(60))
  it('rates the export pumps at 58 000 bbl/d', () => expect(CAP.exportPump).toBe(58000))
  it('puts the HP separator trip points in engine units', () => {
    expect([HP.setpoint, HP.pal, HP.pah, HP.pahh, HP.psv]).toEqual([35, 28, 38, 40, 42])
    expect(HP.lahh * HP.mmPerPct).toBeCloseTo(3000, -1)
  })
})

describe('alarm limits', () => {
  it.each([
    ['PT-1101', { lo: 28, hi: 38, hiHi: 40 }],
    ['LT-1101', { loLo: 800, lo: 1100, hi: 2600, hiHi: 3000 }],
    ['LT-1102', { lo: 450, hi: 1100 }],
    ['PT-1001', { hi: 47, hiHi: 50 }],
    ['PT-2202', { hi: 145, hiHi: 150 }],
    ['PDT-2101', { hi: 250 }],
    ['LT-2401', { hi: 1200, hiHi: 1600 }],
    ['AT-5302', { hi: -10 }],
    ['PT-5305', { lo: 14, hi: 22 }],
    ['PT-4603', { lo: 6.5, loLo: 5.5 }],
    ['TT-6303', { hi: 45, hiHi: 55 }],
    ['PT-9031', { lo: 10 }],
    ['PT-W311', { lo: 150, hi: 245, hiHi: 255 }],
    ['FT-W401', { lo: 15000 }],
  ])('sets %s to the documented limits', (tag, limits) => {
    expect(plant.instruments.find((i) => i.tag === tag)?.alarms).toEqual(limits)
  })
})

describe('determinism', () => {
  const session = () => {
    fresh()
    sim().trip('P-1500A', 'test')
    run(900, 10)
    return { process: sim().process, oil: sim().result!.oilExport, status: sim().status }
  }

  it('repeats a session exactly after a reset', () => expect(session()).toEqual(session()))
})
