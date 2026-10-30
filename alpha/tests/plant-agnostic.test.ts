/**
 * Plant-agnostic rule (AGENTS.md "the plant is data"): Bravo and Charlie compile, carry no Alpha tags and run on the
 * generic parts of the engine, classification and F&G mapping. In its own file because loading a plant resets the
 * simulation, and src/safety/cctv.ts builds its cameras from Alpha at import.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { run, sim } from './harness'
import { compileSpec } from '../src/library/compile'
import { separationTrainSpec } from '../src/library/examples/separationTrain'
import { onshoreStation } from '../src/model/examples/onshoreStation'
import { plant as alpha } from '../src/model/plant'
import type { Plant } from '../src/model/types'
import { hazardAreas } from '../src/safety/hazardAreas'
import { fireZones } from '../src/sim/fg'
import { isAlphaField, usePlantStore, validatePlant } from '../src/state/plantStore'

const tagsOf = (p: Plant) => [...p.equipment, ...p.lines, ...p.valves, ...p.instruments].map((x) => x.tag)
const alphaTags = new Set(tagsOf(alpha))
const charlie = compileSpec(separationTrainSpec)

describe('Charlie compiles from a spec with no coordinates', () => {
  it('reports no errors', () => expect(charlie.errors).toEqual([]))
  it('reports no warnings', () => expect(charlie.warnings).toEqual([]))
})

describe.each([
  ['Bravo', onshoreStation, 11, 17],
  ['Charlie', charlie.plant, 6, 10],
] as [string, Plant, number, number][])('%s', (_name, plant, equipment, lines) => {
  beforeAll(() => usePlantStore.getState().setPlant(plant))
  afterAll(() => usePlantStore.getState().setPlant(alpha))

  it(`has ${equipment} equipment items`, () => expect(plant.equipment).toHaveLength(equipment))
  it(`has ${lines} lines`, () => expect(plant.lines).toHaveLength(lines))
  it('passes the schema validation', () => expect(validatePlant(plant)).toEqual([]))
  it('carries no Alpha tag', () => expect(tagsOf(plant).filter((tag) => alphaTags.has(tag))).toEqual([]))
  it('is not the Alpha field', () => expect(isAlphaField(plant)).toBe(false))
  it('stands onshore', () => expect(plant.deck.site).toBe('onshore'))

  it('ticks on the simple model with no wells or process', () => {
    run(30)
    expect(sim().result).toMatchObject({ wells: {}, oilExport: 0, mpp: 0 })
    expect(sim().t).toBeGreaterThanOrEqual(30)
  })

  it('files a shutdown under the plant, not an Alpha platform', () => {
    sim().initiate('PSD', 'Alpha')
    expect(sim().shutdowns.map((s) => s.platform)).toEqual(['Plant'])
    sim().reset()
  })

  it('maps one process fire zone', () => expect(fireZones(plant).filter((z) => z.kind !== 'module').map((z) => z.id)).toEqual(['P-AREA']))

  it('classifies its own equipment, with no Alpha flare', () => {
    const tags = hazardAreas(plant).map((v) => v.tag)
    expect(tags.length).toBeGreaterThan(0)
    expect(tags).not.toContain('FLARE')
    expect(tags.filter((tag) => alphaTags.has(tag))).toEqual([])
  })
})

describe('Bravo on the simple model', () => {
  beforeAll(() => usePlantStore.getState().setPlant(onshoreStation))
  afterAll(() => usePlantStore.getState().setPlant(alpha))

  it('runs a generic machine start sequence', () => {
    sim().stop('K-130A')
    expect(sim().status['K-130A']).toBe('stopped')
    sim().start('K-130A')
    run(301)
    expect(sim().status['K-130A']).toBe('running')
  })

  it('starts the standby of a generic duty pair', () => {
    sim().trip('P-160A', 'test')
    expect(sim().status['P-160B']).toBe('starting')
  })
})

describe('going back to Alpha', () => {
  it('restores the dynamic model', () => {
    usePlantStore.getState().setPlant(onshoreStation)
    usePlantStore.getState().setPlant(alpha)
    run(30)
    expect(sim().result!.oilExport).toBeGreaterThan(49000)
  })
})
