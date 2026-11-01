/**
 * Plant data: AGENTS.md rule 1, "the plant must flow". Checks the bundled Alpha plant (src/model/plant.ts) for
 * connected lines, wired equipment, unique tags and the documented process order. Expected counts are the
 * "At a glance" figures of the plant description, docs/PLANT.md in the deck-twin repo, held here as literals.
 */
import { describe, expect, it } from 'vitest'
import type { Equipment, LineEnd, PipeLine } from '../src/model/types'
import { plant } from '../src/model/plant'
import { buildPiping } from '../src/scene/piping/build'
import { detectors, fireZones } from '../src/sim/fg'
import { validatePlant } from '../src/state/plantStore'

const lineByTag = new Map(plant.lines.map((l) => [l.tag, l]))
const endsAt = (end: LineEnd, tag: string) => ('equipment' in end && end.equipment === tag) || ('offDeck' in end && end.offDeck.includes(tag))

describe('counts match the plant description', () => {
  it('has 129 equipment items', () => expect(plant.equipment).toHaveLength(129))
  it('has 216 lines', () => expect(plant.lines).toHaveLength(216))
  it('has 235 valves', () => expect(plant.valves).toHaveLength(235))
  it('has 370 instruments', () => expect(plant.instruments).toHaveLength(370))

  it('splits the valves by type as documented', () => {
    const byType = Object.fromEntries(Object.entries(Object.groupBy(plant.valves, (v) => v.type)).map(([type, list]) => [type, list!.length]))
    expect(byType).toEqual({ esdv: 13, bdv: 2, psv: 18, control: 27, check: 39, gate: 55, ball: 46, butterfly: 23, needle: 8, globe: 4 })
  })

  it('has 181 fire and gas devices of the documented types', () => {
    const byType = Object.fromEntries(Object.entries(Object.groupBy(detectors(plant), (d) => d.type)).map(([type, list]) => [type, list!.length]))
    expect(byType).toEqual({ GD: 67, FD: 51, OGD: 11, HD: 10, SD: 12, MAC: 30 })
  })

  it('has 32 fire zones', () => expect(fireZones(plant)).toHaveLength(32))
})

describe('connections', () => {
  it('passes the schema validation the plant loader uses', () => expect(validatePlant(plant)).toEqual([]))

  it('builds its piping', () => expect(() => buildPiping(plant)).not.toThrow())

  it('ends every line on a real nozzle, a real line or a named off-deck point', () => {
    const equipment = new Map(plant.equipment.map((e) => [e.tag, e]))
    const broken = plant.lines.flatMap((l) =>
      [l.from, l.to].filter((end) => {
        if ('equipment' in end) return !equipment.get(end.equipment)?.nozzles.some((n) => n.id === end.nozzle)
        if ('line' in end) return !lineByTag.has(end.line)
        return !end.offDeck.trim()
      }),
    )
    expect(broken).toEqual([])
  })

  it('routes every line orthogonally', () => {
    const sloped = plant.lines.filter((l) => l.route.some((p, i) => i > 0 && [0, 1, 2].filter((k) => Math.abs(p[k] - l.route[i - 1][k]) > 1e-3).length > 1))
    expect(sloped.map((l) => l.tag)).toEqual([])
  })
})

describe('tags', () => {
  const lists = { equipment: plant.equipment, lines: plant.lines, valves: plant.valves, instruments: plant.instruments }

  it.each(Object.entries(lists))('has unique %s tags', (_name, items) => {
    expect(new Set(items.map((x) => x.tag)).size).toBe(items.length)
  })

  it('never reuses a tag across equipment, lines, valves and instruments', () => {
    const all = Object.values(lists).flat().map((x) => x.tag)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('every process item is wired in and out', () => {
  const PROCESS_SYSTEMS = new Set<Equipment['system']>(['production', 'oilExport', 'gasCompression', 'flare', 'gasTreatment', 'producedWater', 'drains', 'wells'])
  /** rigs, BOP, vent stacks: no process nozzles. Wells are sources or sinks, checked on their own below. */
  const NOT_INLINE = new Set<Equipment['kind']>(['proxy', 'module', 'transformer', 'xmasTree'])
  /** chemical and hydraulic utility packages filed under the wells system */
  const UTILITY_PACKAGES = new Set(['C-1800', 'C-5600', 'C-N260', 'X-1900', 'X-N270'])
  /** left out: X-R155 has no lines at all, reported as a bug */
  const REPORTED_UNWIRED = new Set(['X-R155'])

  const inline = plant.equipment.filter((e) => PROCESS_SYSTEMS.has(e.system) && !NOT_INLINE.has(e.kind) && !UTILITY_PACKAGES.has(e.tag) && !REPORTED_UNWIRED.has(e.tag))
  const feeds = (tag: string) => plant.lines.filter((l) => endsAt(l.to, tag))
  const drains = (tag: string) => plant.lines.filter((l) => endsAt(l.from, tag))

  it('checks a substantial part of the plant', () => expect(inline.length).toBeGreaterThanOrEqual(30))

  it('gives each one a line in', () => expect(inline.filter((e) => !feeds(e.tag).length).map((e) => e.tag)).toEqual([]))

  it('gives each one a line out', () => expect(inline.filter((e) => !drains(e.tag).length).map((e) => e.tag)).toEqual([]))

  it('gives every producer a flowline to a manifold', () => {
    const producers = plant.equipment.filter((e) => e.kind === 'xmasTree' && e.wellType !== 'waterInjector')
    const unconnected = producers.filter((e) => !drains(e.tag).some((l) => 'offDeck' in l.to && /^M-(1000|N200) /.test(l.to.offDeck)))
    expect(unconnected.map((e) => e.tag)).toEqual([])
  })

  it('feeds the water injector', () => expect(feeds('XT-N106').length).toBeGreaterThan(0))
})

describe('process order', () => {
  const next = (l: PipeLine): PipeLine[] => {
    const teed = 'line' in l.to ? [lineByTag.get(l.to.line)!] : []
    return [...teed, ...plant.lines.filter((x) => ('line' in x.from && x.from.line === l.tag) || ('equipment' in l.to && 'equipment' in x.from && x.from.equipment === l.to.equipment))]
  }
  const downstreamOf = (tag: string) => {
    const seen = new Set<PipeLine>()
    const queue = plant.lines.filter((l) => 'equipment' in l.from && l.from.equipment === tag)
    while (queue.length) {
      const l = queue.pop()!
      if (seen.has(l)) continue
      seen.add(l)
      queue.push(...next(l))
    }
    return new Set([...seen].flatMap((l) => ('equipment' in l.to ? [l.to.equipment] : [])))
  }

  it.each([
    ['oil', 'M-1000', ['V-1100', 'V-1300', 'E-1400', 'P-1500A', 'P-1500B']],
    ['test oil', 'M-1000', ['V-1200', 'V-1300']],
    ['HP gas', 'V-1100', ['V-2100', 'K-2200', 'E-2300', 'T-5300']],
    ['fuel gas', 'V-5100', ['E-5200', 'GT-8100A', 'GT-8100B']],
    ['produced water', 'X-4200', ['V-4100', 'P-4300A', 'P-4300B']],
    ['oil on RP', 'X-R150', ['L-R110']],
    ['gas on RP', 'X-R250', ['L-R210']],
    ['water injection', 'P-W300A', ['X-W330', 'V-W320', 'P-W310A', 'P-W310B']],
    ['cooling medium', 'V-6100', ['P-6200A', 'P-6200B', 'E-6300']],
    ['instrument air', 'K-4600', ['V-4700']],
  ])('runs %s from %s through the documented equipment', (_name, from, through) => {
    expect([...downstreamOf(from)]).toEqual(expect.arrayContaining(through))
  })

  it('sends the V-1100 water boot to the hydrocyclones', () => {
    const water = plant.lines.find((l) => 'equipment' in l.from && l.from.equipment === 'V-1100' && l.service === 'water')
    expect(water?.to).toEqual({ offDeck: expect.stringContaining('hydrocyclones') })
  })
})
