import type { ComponentType } from 'react'
import { CATEGORIES, type CategoryId, type ComponentMeta } from '../registry/meta'
import type { Port } from '../registry/lib/ports'

export interface Item extends ComponentMeta {
  category: CategoryId
  path: string
}

export interface ComponentModule {
  default: ComponentType<Record<string, unknown>>
  defaults?: Record<string, unknown>
  ports?: (p?: Record<string, unknown>) => Port[]
}

const metas = import.meta.glob<{ default: ComponentMeta[] }>('../registry/*/_meta*.ts', { eager: true })
const modules = import.meta.glob<ComponentModule>(['../registry/*/*.tsx', '!../registry/lib/**', '!../registry/assembly/**', '!../registry/*/_*'])
const sources = import.meta.glob<string>(['../registry/*/*.tsx', '!../registry/lib/**', '!../registry/assembly/**', '!../registry/*/_*'], { query: '?raw', import: 'default' })

export const ITEMS: Item[] = Object.entries(metas)
  .flatMap(([file, mod]) => {
    const category = file.split('/')[2] as CategoryId
    return mod.default.map((m) => ({ ...m, category, path: `../registry/${category}/${m.file}` }))
  })
  .sort((a, b) => CATEGORIES.findIndex((c) => c.id === a.category) - CATEGORIES.findIndex((c) => c.id === b.category) || a.title.localeCompare(b.title))

export const BY_NAME = new Map(ITEMS.map((i) => [i.name, i]))

export const byCategory = (id: CategoryId) => ITEMS.filter((i) => i.category === id)

export function loadModule(item: Item): Promise<ComponentModule> {
  const load = modules[item.path]
  if (!load) return Promise.reject(new Error(`No module for ${item.name} at ${item.path}`))
  return load()
}

export function loadSource(item: Item): Promise<string> {
  return sources[item.path]?.() ?? Promise.resolve('')
}

/** Every component module, for the plant assembler. */
export async function loadAll(names: string[]): Promise<Record<string, ComponentModule>> {
  const out: Record<string, ComponentModule> = {}
  await Promise.all(
    names.map(async (n) => {
      const item = BY_NAME.get(n)
      if (item) out[n] = await loadModule(item)
    }),
  )
  return out
}

export const thumb = (name: string) => `/thumbs/${name}.webp`

export { CATEGORIES }
