// Lists every registry component name (used by scripts that need the catalogue without a browser).
import { readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ComponentMeta } from '../registry/meta'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'registry')

export async function metas(): Promise<(ComponentMeta & { category: string })[]> {
  const out: (ComponentMeta & { category: string })[] = []
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'lib' || dir.name === 'assembly') continue
    for (const f of readdirSync(join(root, dir.name)).filter((n) => /^_meta.*\.ts$/.test(n)).sort()) {
      const mod = (await import(pathToFileURL(join(root, dir.name, f)).href)) as { default: ComponentMeta[] }
      for (const m of mod.default) out.push({ ...m, category: dir.name })
    }
  }
  return out
}

export async function names() {
  return (await metas()).map((m) => m.name)
}
