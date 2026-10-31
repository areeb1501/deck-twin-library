// Writes src/pages/homePlan.json: the home hero's plant as a plan drawing, from the same resolved layout <Plant> renders. Run it when separation-train.plant.json changes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PlantSpec } from '../registry/assembly/spec'
import { CATEGORIES } from '../registry/meta'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const spec = JSON.parse(readFileSync(join(root, 'registry/examples/separation-train.plant.json'), 'utf8')) as PlantSpec
const bounds = JSON.parse(readFileSync(join(root, 'registry/generated/bounds.json'), 'utf8')) as Record<string, { size: number[] }>
const pid = JSON.parse(readFileSync(join(root, 'registry/pid/pid.json'), 'utf8')) as Record<string, { symbol?: string }>
// the symbols go in as data URIs, so the home page doesn't load the whole P&ID library for nine small drawings
const symbol = (name: string) => {
  const file = pid[name]?.symbol
  return file && `data:image/svg+xml,${encodeURIComponent(readFileSync(join(root, 'registry/pid/symbols', file), 'utf8').trim())}`
}
const names = [...new Set([...spec.items.map((i) => i.component), ...(spec.lines ?? []).flatMap((l) => (l.inline ?? []).map((v) => v.component))])]
const components: Record<string, unknown> = {}
for (const name of names) {
  const file = CATEGORIES.map((c) => join(root, 'registry', c.id, `${name}.tsx`)).find(existsSync)
  if (file) components[name] = await import(pathToFileURL(file).href)
}
const { resolve } = await import(pathToFileURL(join(root, 'registry/assembly/plant.tsx')).href)
const layout: { items: { tag: string; component: string; position: number[]; rotation: number }[]; lines: { line: { tag: string }; path: number[][] }[]; issues: unknown[] } = resolve(spec, components)
const round = (n: number) => Math.round(n * 100) / 100
const plan = {
  items: layout.items.map((it) => {
    const s = bounds[it.component]?.size ?? [2, 2, 2]
    const turned = Math.abs(Math.sin((it.rotation * Math.PI) / 180)) > 0.5
    return { tag: it.tag, component: it.component, symbol: symbol(it.component), x: round(it.position[0]), z: round(it.position[2]), w: round(turned ? s[2] : s[0]), d: round(turned ? s[0] : s[2]) }
  }),
  lines: layout.lines.map((l) => ({ tag: l.line.tag, path: l.path.map((p) => [round(p[0]), round(p[2])]) })),
  ends: (spec.lines ?? []).flatMap((l) => [l.from, l.to]).flatMap((e) => (typeof e === 'object' && e.label ? [{ label: e.label, x: e.at[0], z: e.at[2] }] : [])),
}
writeFileSync(join(root, 'src/pages/homePlan.json'), JSON.stringify(plan) + '\n')
console.log(`${plan.items.length} items, ${plan.lines.length} lines, ${plan.ends.length} ends`, layout.issues.length ? layout.issues : '')
