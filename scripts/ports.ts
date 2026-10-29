// Prints ports (at defaults or given props) for components: npx tsx scripts/ports.ts <name...> [--props '{...}']
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { metas } from './list'

const args = process.argv.slice(2)
const pi = args.indexOf('--props')
const props = pi >= 0 ? JSON.parse(args[pi + 1]) : {}
const names = args.filter((a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1))
const all = await metas()
for (const n of names) {
  const m = all.find((x) => x.name === n)
  if (!m) {
    console.log(`✗ ${n}: not a component`)
    continue
  }
  const mod = await import(pathToFileURL(join(import.meta.dirname, '..', 'registry', m.category, m.file)).href)
  const ps = mod.ports ? mod.ports({ ...(mod.defaults ?? {}), ...(m.preview ?? {}), ...props }) : []
  console.log(`${n} (${m.anchor})`)
  for (const p of ps) console.log(`  ${p.id.padEnd(14)} ${String(p.nps + '"').padEnd(6)} ${String(p.rating ?? '').padEnd(5)} pos ${p.position.map((v: number) => v.toFixed(2).padStart(7)).join(' ')}  dir ${p.direction.map((v: number) => +v.toFixed(2)).join(',')}  ${p.kind ?? 'process'}`)
}
