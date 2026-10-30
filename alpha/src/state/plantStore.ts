/**
 * The plant currently loaded in the viewer. Defaults to the authored Alpha production deck;
 * any supported plant file can be loaded at runtime (Load…, see plantFormats.ts).
 */
import { create } from 'zustand'
import type { Plant } from '../model/types'
import { plant as alpha } from '../model/plant'

interface PlantState {
  plant: Plant
  /** bumps on every load so 3D builders can rebuild */
  version: number
  setPlant: (p: Plant) => void
}

export const usePlantStore = create<PlantState>((set) => ({
  plant: alpha,
  version: 0,
  setPlant: (plant) => set((s) => ({ plant, version: s.version + 1 })),
}))

export const usePlant = () => usePlantStore((s) => s.plant)

export function findItemIn(plant: Plant, tag: string) {
  return (
    plant.equipment.find((e) => e.tag === tag) ??
    plant.lines.find((l) => l.tag === tag) ??
    plant.valves.find((v) => v.tag === tag) ??
    plant.instruments.find((i) => i.tag === tag)
  )
}

/** Light structural validation with readable messages (the renderer trusts the schema). */
export function validatePlant(p: unknown): string[] {
  const errs: string[] = []
  const o = p as Partial<Plant>
  if (!o || typeof o !== 'object') return ['Not a JSON object']
  if (!o.deck?.extent) errs.push('"deck" with an "extent" is required')
  for (const k of ['equipment', 'lines', 'valves', 'instruments'] as const) if (!Array.isArray(o[k])) errs.push(`"${k}" must be an array`)
  if (errs.length) return errs
  const eq = new Map(o.equipment!.map((e) => [e.tag, e]))
  const lines = new Set(o.lines!.map((l) => l.tag))
  for (const l of o.lines!) {
    if (!Array.isArray(l.route) || l.route.length < 2) errs.push(`${l.tag}: route needs ≥ 2 points`)
    for (const end of [l.from, l.to]) {
      if (end && 'equipment' in end) {
        const e = eq.get(end.equipment)
        if (!e) errs.push(`${l.tag}: unknown equipment ${end.equipment}`)
        else if (!e.nozzles.some((n) => n.id === end.nozzle)) errs.push(`${l.tag}: ${end.equipment} has no nozzle ${end.nozzle}`)
      }
      if (end && 'line' in end && !lines.has(end.line)) errs.push(`${l.tag}: tees into unknown line ${end.line}`)
    }
  }
  const lineBy = new Map(o.lines!.map((l) => [l.tag, l]))
  for (const v of o.valves!) {
    const l = lineBy.get(v.line)
    if (!l) errs.push(`${v.tag}: unknown line ${v.line}`)
    else if (v.seg >= 0 && (v.seg >= l.route.length - 1 || v.t < 0 || v.t > 1)) errs.push(`${v.tag}: seg/t outside ${v.line}`)
  }
  for (const i of o.instruments ?? []) {
    if ('line' in i.on) {
      const l = lineBy.get(i.on.line)
      if (!l) errs.push(`${i.tag}: unknown line ${i.on.line}`)
      else if (i.on.seg < 0 || i.on.seg >= l.route.length - 1) errs.push(`${i.tag}: seg outside ${i.on.line}`)
    } else if (!eq.has(i.on.equipment)) errs.push(`${i.tag}: unknown equipment ${i.on.equipment}`)
  }
  return errs.slice(0, 12)
}
