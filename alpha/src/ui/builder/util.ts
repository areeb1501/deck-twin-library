import type { Equipment, Plant, ValveType } from '../../model/types'
import type { EndSpec, PlantSpec } from '../../library/spec'

/** Next free tag for a prefix: V-101, V-102 … (numbers continue across all prefixes' series). */
export function nextTag(prefix: string, spec: PlantSpec) {
  const all = [...spec.equipment.map((e) => e.tag), ...spec.valves.map((v) => v.tag), ...spec.instruments.map((i) => i.tag)]
  const nums = all.map((t) => Number(/-(\d+)[A-Z]?$/.exec(t)?.[1])).filter((n) => Number.isFinite(n))
  let n = nums.length ? Math.max(...nums) + 1 : 101
  while (all.includes(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

/** Next free line sequence number, taken from the third field of existing ISO line numbers. */
export function nextLineSeq(spec: PlantSpec) {
  const nums = spec.lines.map((l) => Number(l.tag.split('-')[2])).filter((n) => Number.isFinite(n))
  return nums.length ? Math.max(...nums) + 1 : 101
}

export const VALVE_PREFIX: Record<Exclude<ValveType, 'psv'>, string> = {
  gate: 'HV', globe: 'HV', ball: 'XV', check: 'NRV', butterfly: 'BFV', control: 'CV', esdv: 'ESDV', bdv: 'BDV', needle: 'NV',
}

export function renameEquipment(d: PlantSpec, from: string, to: string) {
  for (const e of d.equipment) if (e.tag === from) e.tag = to
  const fix = (end: EndSpec) => {
    if ('equipment' in end && end.equipment === from) end.equipment = to
  }
  for (const l of d.lines) {
    fix(l.from)
    fix(l.to)
  }
  for (const i of d.instruments) if ('equipment' in i.on && i.on.equipment === from) i.on.equipment = to
}

export function renameLine(d: PlantSpec, from: string, to: string) {
  for (const l of d.lines) if (l.tag === from) l.tag = to
  for (const v of d.valves) if (v.line === from) v.line = to
  for (const i of d.instruments) if ('line' in i.on && i.on.line === from) i.on.line = to
}

export function removeEquipment(d: PlantSpec, tag: string) {
  d.equipment = d.equipment.filter((e) => e.tag !== tag)
  const gone = new Set(d.lines.filter((l) => [l.from, l.to].some((e) => 'equipment' in e && e.equipment === tag)).map((l) => l.tag))
  for (const t of gone) removeLine(d, t)
  d.instruments = d.instruments.filter((i) => !('equipment' in i.on && i.on.equipment === tag))
}

export function removeLine(d: PlantSpec, tag: string) {
  d.lines = d.lines.filter((l) => l.tag !== tag)
  d.valves = d.valves.filter((v) => v.line !== tag)
  d.instruments = d.instruments.filter((i) => !('line' in i.on && i.on.line === tag))
}

/** Encoded end for <select>: "eq:V-101/N2" or "off" */
export const encodeEnd = (e: EndSpec) => ('equipment' in e ? `eq:${e.equipment}/${e.nozzle}` : 'off')

export function nozzleOptions(plant: Plant) {
  const out: { value: string; label: string }[] = []
  for (const e of plant.equipment) for (const n of e.nozzles) out.push({ value: `eq:${e.tag}/${n.id}`, label: `${e.tag} · ${n.id} ${n.name} (${n.nps}")` })
  return out
}

export function findNozzle(plant: Plant, end: EndSpec) {
  if (!('equipment' in end)) return undefined
  const eq: Equipment | undefined = plant.equipment.find((e) => e.tag === end.equipment)
  return eq?.nozzles.find((n) => n.id === end.nozzle)
}

export function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export const slug = (s: string) => s.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'plant'
