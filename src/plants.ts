import type { PlantSpec } from '../registry/assembly/spec'

const files = import.meta.glob<{ default: PlantSpec }>('../registry/examples/*.plant.json', { eager: true })

export const EXAMPLES = Object.entries(files)
  .map(([path, mod]) => ({ name: path.split('/').pop()!.replace('.plant.json', ''), spec: mod.default }))
  .sort((a, b) => a.name.localeCompare(b.name))

export const componentsOf = (spec: PlantSpec) => [...new Set([...spec.items.map((i) => i.component), ...(spec.lines ?? []).flatMap((l) => (l.inline ?? []).map((v) => v.component))])]

export type Level = 'Basic' | 'Intermediate' | 'Advanced'
export const complexity = (spec: PlantSpec) => spec.items.length + (spec.lines?.length ?? 0)
const LEVELS: Record<string, Level> = {
  'onshore-well-pad': 'Basic',
  'control-room': 'Basic',
  'wellhead-platform': 'Intermediate',
  'offshore-water-injection': 'Intermediate',
  'separation-train': 'Intermediate',
  'crude-export-terminal': 'Advanced',
}
const RANK: Record<Level, number> = { Basic: 0, Intermediate: 1, Advanced: 2 }
export const level = (spec: PlantSpec, name?: string): Level => (name && LEVELS[name]) || (complexity(spec) <= 16 ? 'Basic' : complexity(spec) <= 32 ? 'Intermediate' : 'Advanced')
export const byLevel = (a: { name: string; spec: PlantSpec }, b: { name: string; spec: PlantSpec }) => RANK[level(a.spec, a.name)] - RANK[level(b.spec, b.name)] || complexity(a.spec) - complexity(b.spec)
