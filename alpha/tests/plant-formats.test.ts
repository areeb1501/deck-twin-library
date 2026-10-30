/**
 * Plant formats (plan 14, src/state/plantFormats.ts): importPlant() recognises a file and turns it into a Plant or
 * explains what is wrong. Covers PlantSpec and twin export round trips and the P&ID-derived specs. The two specs
 * in tests/fixtures are copies of deck-twin's specs/*.spec.json, so the suite needs nothing outside this folder.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileSpec } from '../src/library/compile'
import { separationTrainSpec } from '../src/library/examples/separationTrain'
import type { PlantSpec } from '../src/library/spec'
import { onshoreStation } from '../src/model/examples/onshoreStation'
import { plant as alpha } from '../src/model/plant'
import type { Plant } from '../src/model/types'
import { buildPiping } from '../src/scene/piping/build'
import { importPlant, plantFormats } from '../src/state/plantFormats'
import { validatePlant } from '../src/state/plantStore'

const FIXTURES = new URL('./fixtures/', import.meta.url)
const specFiles = readdirSync(FIXTURES).filter((f) => f.endsWith('.spec.json'))
const readSpec = (file: string) => JSON.parse(readFileSync(new URL(file, FIXTURES), 'utf8')) as PlantSpec
const viaFile = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>

describe('recognising a file', () => {
  it('ships the two built-in formats', () => expect(plantFormats().map((f) => f.id)).toEqual(['engine', 'spec']))
  it('reads a twin export as the engine format', async () => expect((await importPlant(viaFile(onshoreStation))).format).toBe('engine'))
  it('reads a PlantSpec as the spec format', async () => expect((await importPlant(viaFile(separationTrainSpec))).format).toBe('spec'))
  it('refuses something that is not an object', async () => expect((await importPlant([])).errors).toEqual(['Not a JSON object.']))
  it('refuses an object that is not a plant', async () => expect((await importPlant({ hello: 'world' })).errors[0]).toMatch(/^Not a plant file/))
})

describe('PlantSpec round trip', () => {
  it('compiles the same plant after a trip through JSON', () => {
    const direct = compileSpec(separationTrainSpec).plant
    const fromFile = compileSpec(viaFile(separationTrainSpec) as unknown as PlantSpec).plant
    expect(fromFile).toEqual(direct)
  })

  it('imports the same plant the compiler gives', async () => {
    const imported = await importPlant(viaFile(separationTrainSpec))
    expect(imported.plant).toEqual(compileSpec(separationTrainSpec).plant)
  })

  it('reports a line to a missing nozzle as an error', async () => {
    const broken = viaFile(separationTrainSpec) as unknown as PlantSpec
    broken.lines[0].from = { equipment: broken.equipment[0].tag, nozzle: 'N99' }
    const result = await importPlant(broken)
    expect(result.plant).toBeUndefined()
    expect(result.errors.join()).toMatch(/has no nozzle N99/)
  })

  it('reports a duplicate tag as an error', async () => {
    const broken = viaFile(separationTrainSpec) as unknown as PlantSpec
    broken.equipment.push(broken.equipment[0])
    expect((await importPlant(broken)).errors.join()).toMatch(/duplicate tag/)
  })
})

describe('twin export round trip', () => {
  it.each([
    ['Bravo', onshoreStation],
    ['Alpha', alpha],
  ] as [string, Plant][])('gives %s back unchanged', async (_name, plant) => {
    const imported = await importPlant(viaFile(plant))
    expect(imported.errors).toEqual([])
    expect(viaFile(imported.plant)).toEqual(viaFile(plant))
  })

  it('takes a compiled spec through export and import', async () => {
    const compiled = compileSpec(separationTrainSpec).plant
    const imported = await importPlant(viaFile(compiled))
    expect(imported.format).toBe('engine')
    expect(viaFile(imported.plant)).toEqual(viaFile(compiled))
  })

  it('stands a file with no site on a plain pad', async () => {
    const file = viaFile(onshoreStation) as unknown as Plant
    delete file.deck.site
    expect((await importPlant(file)).plant?.deck.site).toBe('onshore')
  })

  it('drops a custom renderer claim from the file', async () => {
    const file = { ...viaFile(onshoreStation), custom: { renderer: 'x', source: {} } }
    expect((await importPlant(file)).plant?.custom).toBeUndefined()
  })

  it('stops the load on an instrument off its line', async () => {
    const file = viaFile(onshoreStation) as unknown as Plant
    const onLine = file.instruments.find((i) => 'line' in i.on)!
    ;(onLine.on as { seg: number }).seg = 99
    const result = await importPlant(file)
    expect(result.plant).toBeUndefined()
    expect(result.errors.join()).toMatch(/seg outside/)
  })

  it('stops the load on a line to unknown equipment', async () => {
    const file = viaFile(onshoreStation) as unknown as Plant
    file.lines[0].from = { equipment: 'V-404', nozzle: 'N1' }
    expect((await importPlant(file)).errors.join()).toMatch(/unknown equipment V-404/)
  })
})

describe('P&ID-derived specs', () => {
  it('has fixtures to check', () => expect(specFiles.length).toBeGreaterThanOrEqual(2))

  describe.each(specFiles)('%s', (file) => {
    let plant: Plant

    beforeAll(async () => {
      plant = (await importPlant(readSpec(file))).plant!
    })

    it('compiles with no errors', () => expect(compileSpec(readSpec(file)).errors).toEqual([]))
    it('imports as a plant', () => expect(plant.equipment.length).toBeGreaterThan(0))
    it('passes the schema validation', () => expect(validatePlant(plant)).toEqual([]))
    it('builds its piping', () => expect(() => buildPiping(plant)).not.toThrow())
    it('keeps every equipment tag of the spec', () => expect(plant.equipment.map((e) => e.tag)).toEqual(readSpec(file).equipment.map((e) => e.tag)))
    it('keeps every line of the spec', () => expect(plant.lines.map((l) => l.tag)).toEqual(readSpec(file).lines.map((l) => l.tag)))
    it('routes every line orthogonally', () => {
      const sloped = plant.lines.filter((l) => l.route.some((p, i) => i > 0 && [0, 1, 2].filter((k) => Math.abs(p[k] - l.route[i - 1][k]) > 1e-3).length > 1))
      expect(sloped.map((l) => l.tag)).toEqual([])
    })
  })
})
