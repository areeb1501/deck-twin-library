import type { PlantSpec } from '../registry/assembly/spec'

const files = import.meta.glob<{ default: PlantSpec }>('../registry/examples/*.plant.json', { eager: true })

export const EXAMPLES = Object.entries(files)
  .map(([path, mod]) => ({ name: path.split('/').pop()!.replace('.plant.json', ''), spec: mod.default }))
  .sort((a, b) => a.name.localeCompare(b.name))

export const componentsOf = (spec: PlantSpec) => [...new Set([...spec.items.map((i) => i.component), ...(spec.lines ?? []).flatMap((l) => (l.inline ?? []).map((v) => v.component))])]
