#!/usr/bin/env node
// deck-twin: add components, inspect the registry, check and assemble plant.json. Zero dependencies.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const VERSION = '0.1.0'
const DEFAULT_REGISTRY = 'https://deck-twin-library.demoareeb.workers.dev'
const PEERS = ['three', '@react-three/fiber', '@react-three/drei']
const SERVICES = ['oil', 'gas', 'multiphase', 'water', 'seawater', 'firewater', 'steam', 'air', 'nitrogen', 'chemical', 'flare', 'drain', 'fuel-gas', 'diesel', 'potable', 'cooling']

const SERVICE_CODES = { PO: 'oil', PG: 'gas', PM: 'multiphase', PW: 'water', SW: 'seawater', FW: 'firewater', ST: 'steam', IA: 'air', NG: 'nitrogen', CI: 'chemical', FL: 'flare', CD: 'drain', FG: 'fuel-gas', DF: 'diesel', DW: 'potable', CM: 'cooling', HC: 'multiphase', VF: 'flare', BD: 'flare', VA: 'flare', OD: 'drain', WI: 'water', WP: 'water', CW: 'cooling', MI: 'chemical', TG: 'chemical', PA: 'air', UA: 'air', N2: 'nitrogen', FO: 'diesel' }
const DN = { 15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2, 65: 2.5, 80: 3, 100: 4, 125: 5, 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 600: 24, 750: 30, 900: 36 }
const CLASS_DIGITS = { 1: 150, 3: 300, 6: 600, 9: 900, 15: 1500, 25: 2500 }

// Same convention as assembly/linetag.ts: SIZE"-SERVICE-SEQ-CLASS-INSULATION.
function parseLineTag(tag = '') {
  const m = /^\s*((?:DN\s?\d+)|(?:\d+(?:[- ]\d+\/\d+|\/\d+|\.\d+)?)\s*(?:["”″]|in)?)\s*-\s*([A-Z][A-Z0-9]{0,3})\s*-\s*([A-Z0-9]+)(?:\s*-\s*([A-Z0-9#]+))?(?:\s*-\s*([A-Z]{1,2}))?\s*$/i.exec(tag)
  if (!m) return {}
  const t = m[1].trim().replace(/["”″]|in$/i, '')
  const dn = /^DN\s?(\d+)$/i.exec(t)
  const mixed = /^(\d+)[- ](\d+)\/(\d+)$/.exec(t)
  const frac = /^(\d+)\/(\d+)$/.exec(t)
  const nps = dn ? DN[Number(dn[1])] : mixed ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : frac ? Number(frac[1]) / Number(frac[2]) : Number(t) || undefined
  const code = m[2].toUpperCase()
  const cls = m[4]?.toUpperCase()
  const direct = cls && /(?:CL)?(150|300|600|900|1500|2500)#?/.exec(cls)
  const digits = cls && /^[A-Z]+(\d{1,2})[A-Z]*$/.exec(cls)
  return { nps, code, service: SERVICE_CODES[code], pipingClass: cls, rating: direct ? Number(direct[1]) : digits ? CLASS_DIGITS[digits[1]] : undefined, insulation: m[5]?.toUpperCase() }
}

const argv = process.argv.slice(2)
const flags = new Map()
const args = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=')
    const next = argv[i + 1]
    if (v !== undefined) flags.set(k, v)
    else if (['dir', 'registry', 'out'].includes(k) && next && !next.startsWith('--')) flags.set(k, argv[++i])
    else flags.set(k, true)
  } else args.push(a)
}
const cmd = args.shift()
const cwd = process.cwd()
const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m` }

function config() {
  const f = join(cwd, 'deck-twin.json')
  const cfg = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
  const dir = flags.get('dir') ?? cfg.dir ?? (existsSync(join(cwd, 'src')) ? 'src/components/deck-twin' : 'components/deck-twin')
  const registry = String(flags.get('registry') ?? process.env.DECKTWIN_REGISTRY ?? cfg.registry ?? DEFAULT_REGISTRY).replace(/\/$/, '')
  return { dir, registry, file: f, exists: existsSync(f) }
}

async function get(path) {
  const { registry } = config()
  if (/^https?:/.test(registry)) {
    const res = await fetch(`${registry}/${path}`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${registry}/${path}`)
    return path.endsWith('.json') ? res.json() : res.text()
  }
  const base = existsSync(join(registry, 'r')) ? registry : dirname(registry)
  const f = resolve(base, path)
  if (!existsSync(f)) throw new Error(`not found: ${f}`)
  const text = readFileSync(f, 'utf8')
  return path.endsWith('.json') ? JSON.parse(text) : text
}

let indexCache
const index = async () => (indexCache ??= await get('r/index.json'))
const nameOf = (dep) => dep.split('/').pop().replace(/\.json$/, '')

async function add(names, opts = {}) {
  const { dir } = config()
  const seen = new Set()
  const order = []
  const visit = async (name) => {
    if (seen.has(name)) return
    seen.add(name)
    let item
    try {
      item = await get(`r/${name}.json`)
    } catch {
      const idx = await index().catch(() => null)
      const close = idx ? suggest(name, idx.items) : []
      throw new Error(`unknown component "${name}"${close.length ? `. Did you mean: ${close.join(', ')}?` : '. Run `deck-twin list`.'}`)
    }
    for (const d of item.registryDependencies ?? []) await visit(nameOf(d))
    order.push(item)
  }
  for (const n of names) await visit(n)
  const written = []
  const skipped = []
  for (const item of order)
    for (const f of item.files) {
      const dest = join(cwd, dir, f.path)
      if (existsSync(dest)) {
        const same = readFileSync(dest, 'utf8') === f.content
        if (same || !flags.has('overwrite')) {
          if (!same) skipped.push(relative(cwd, dest))
          continue
        }
      }
      if (!flags.has('dry-run')) {
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, f.content)
      }
      written.push(relative(cwd, dest))
    }
  if (!opts.quiet) {
    console.log(`${c.green('✓')} ${order.filter((i) => i.type === 'registry:component').map((i) => i.name).join(', ') || names.join(', ')}${flags.has('dry-run') ? c.dim(' (dry run)') : ''}`)
    for (const w of written) console.log(`  ${c.dim('+')} ${w}`)
    for (const s of skipped) console.log(`  ${c.yellow('!')} ${s} ${c.dim('exists and differs, kept yours (use --overwrite)')}`)
    if (!written.length && !skipped.length) console.log(c.dim('  everything already up to date'))
  }
  peers()
  return order
}

function peers() {
  const pkgFile = join(cwd, 'package.json')
  if (!existsSync(pkgFile)) return
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  const have = { ...pkg.dependencies, ...pkg.devDependencies }
  const missing = [...PEERS, ...(existsSync(join(cwd, 'tsconfig.json')) ? ['@types/three'] : [])].filter((p) => !have[p])
  if (!missing.length) return
  const pm = existsSync(join(cwd, 'pnpm-lock.yaml')) ? 'pnpm add' : existsSync(join(cwd, 'yarn.lock')) ? 'yarn add' : existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock')) ? 'bun add' : 'npm install'
  const line = `${pm} ${missing.join(' ')}`
  if (flags.has('install')) {
    console.log(c.dim(`  installing: ${line}`))
    spawnSync(line, { stdio: 'inherit', shell: true, cwd })
  } else console.log(`\n  Missing peer dependencies. Run:\n    ${c.bold(line)}`)
}

async function list() {
  const idx = await index()
  const cat = args[0]
  const items = idx.items.filter((i) => !cat || i.category === cat)
  if (flags.has('json')) return console.log(JSON.stringify(items.map(({ name, title, category, description }) => ({ name, title, category, description })), null, 2))
  for (const k of idx.categories) {
    const group = items.filter((i) => i.category === k.id)
    if (!group.length) continue
    console.log(`\n${c.bold(k.title)} ${c.dim(`(${k.id})`)}`)
    const w = Math.max(...group.map((i) => i.name.length))
    for (const i of group) console.log(`  ${i.name.padEnd(w)}  ${c.dim(i.title)}`)
  }
  console.log(c.dim(`\n${items.length} components. deck-twin info <name> for props and ports.`))
}

function distance(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = t
    }
  }
  return d[b.length]
}

function suggest(name, items) {
  return items
    .map((i) => ({ n: i.name, d: i.name.includes(name) || name.includes(i.name) ? 0 : distance(name, i.name) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(name.length / 4)))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)
    .map((x) => x.n)
}

async function search() {
  const idx = await index()
  const words = args.join(' ').toLowerCase().split(/\s+/).filter(Boolean)
  const rank = (i) => words.filter((w) => `${i.name} ${i.title}`.toLowerCase().includes(w)).length
  const hits = idx.items
    .filter((i) => words.every((w) => `${i.name} ${i.title} ${i.description} ${i.tags.join(' ')} ${i.standards.join(' ')} ${i.category}`.toLowerCase().includes(w)))
    .sort((a, b) => rank(b) - rank(a))
  if (flags.has('json')) return console.log(JSON.stringify(hits.map(({ name, title, category }) => ({ name, title, category })), null, 2))
  if (!hits.length) return console.log('No matches.')
  for (const i of hits) console.log(`${i.name.padEnd(28)} ${c.dim(i.title)}`)
}

async function info() {
  const idx = await index()
  const name = args[0]
  const i = idx.items.find((x) => x.name === name)
  if (!i) {
    const close = suggest(name ?? '', idx.items)
    throw new Error(`unknown component "${name}"${close.length ? `. Did you mean: ${close.join(', ')}?` : '. Run `deck-twin search <words>`.'}`)
  }
  if (flags.has('json')) return console.log(JSON.stringify(i, null, 2))
  console.log(`${c.bold(i.title)} ${c.dim(i.name)}\n${i.description}\n`)
  console.log(`import { ${i.export} } from '${i.import}'   ${c.dim(`(relative to ${config().dir})`)}`)
  console.log(`origin: ${i.anchor === 'base' ? 'footprint centre at deck level (y = 0)' : i.anchor === 'inline' ? 'pipe centreline, ports A (-X) and B (+X)' : 'body centre; ports where listed below'}`)
  console.log(`standards: ${i.standards.join(', ')}`)
  if (i.bounds) console.log(`size at defaults: ${i.bounds.size.map((v) => v.toFixed(2)).join(' × ')} m (x × y × z)`)
  console.log(`\n${c.bold('props')}`)
  for (const p of i.params) {
    const t = p.type === 'select' ? p.options.map((o) => JSON.stringify(typeof o === 'object' ? o.value : o)).join(' | ') : p.type === 'number' ? `${p.min}–${p.max}${p.unit ? ' ' + p.unit : ''}` : p.type === 'nps' ? `NPS ${p.min ?? ''}–${p.max ?? ''}` : p.type
    console.log(`  ${p.key.padEnd(16)} ${String(JSON.stringify(i.defaults[p.key] ?? null)).padEnd(14)} ${c.dim(t)}`)
  }
  if (i.ports.length) {
    console.log(`\n${c.bold('ports')} ${c.dim('(at defaults, local frame, m)')}`)
    for (const p of i.ports) console.log(`  ${p.id.padEnd(14)} ${String(p.nps + '"').padEnd(6)} ${String(p.rating ?? '').padEnd(5)} pos ${p.position.map((v) => v.toFixed(2)).join(', ').padEnd(22)} dir ${p.direction.join(',')}  ${c.dim(p.label)}`)
  }
}

async function check(file, quiet = false) {
  const idx = await index()
  const byName = new Map(idx.items.map((i) => [i.name, i]))
  let spec
  try {
    spec = JSON.parse(readFileSync(resolve(cwd, file), 'utf8'))
  } catch (e) {
    throw new Error(`cannot read ${file}: ${e.message}`)
  }
  const issues = []
  const err = (where, message) => issues.push({ level: 'error', where, message })
  const warn = (where, message) => issues.push({ level: 'warning', where, message })
  if (!spec.name) warn('plant', 'Add a "name".')
  if (!Array.isArray(spec.items)) err('plant', '"items" must be an array.')
  const tags = new Map()
  for (const it of spec.items ?? []) {
    const where = it.tag ?? '(no tag)'
    if (!it.tag) err(where, 'Every item needs a "tag".')
    else if (tags.has(it.tag)) err(where, 'Duplicate tag.')
    const comp = byName.get(it.component)
    if (!comp) {
      const close = idx.items.filter((i) => i.name.includes(String(it.component).split('-')[0])).map((i) => i.name).slice(0, 4)
      err(where, `Unknown component "${it.component}".${close.length ? ` Close: ${close.join(', ')}.` : ''}`)
    } else if (comp.anchor === 'inline') warn(where, `"${it.component}" is an inline component. Put it on a line ("inline": [...]) instead of in items.`)
    if (it.position && !(Array.isArray(it.position) && it.position.length === 3 && it.position.every(Number.isFinite))) err(where, 'position must be [x, y, z] in metres.')
    if (it.rotation !== undefined && !Number.isFinite(it.rotation)) err(where, 'rotation must be a number of degrees.')
    if (comp && it.props)
      for (const [k, v] of Object.entries(it.props)) {
        const p = comp.params.find((x) => x.key === k)
        if (!p && !(k in comp.defaults)) warn(where, `Prop "${k}" is not a ${comp.name} prop. Known: ${comp.params.map((x) => x.key).join(', ')}.`)
        if (p?.type === 'number' && typeof v === 'number' && (v < p.min || v > p.max)) warn(where, `${k} = ${v} is outside ${p.min}–${p.max}${p.unit ? ' ' + p.unit : ''}.`)
        if (p?.type === 'select' && !p.options.some((o) => (typeof o === 'object' ? o.value : o) === v)) warn(where, `${k} = ${JSON.stringify(v)} is not one of ${p.options.map((o) => JSON.stringify(typeof o === 'object' ? o.value : o)).join(', ')}.`)
      }
    if (it.tag) tags.set(it.tag, { it, comp })
  }
  const used = new Set()
  const lineTags = new Set()
  for (const l of spec.lines ?? []) {
    const where = l.tag ?? `${l.from} → ${l.to}`
    if (!l.tag) warn(where, 'Give the line a line number as "tag", e.g. 6"-PO-1001-C3A-N.')
    else if (lineTags.has(l.tag)) err(where, 'Duplicate line tag.')
    lineTags.add(l.tag)
    if (l.service && !SERVICES.includes(l.service)) warn(where, `service "${l.service}" is not one of ${SERVICES.join(', ')}.`)
    const ends = []
    if (typeof l.from === 'object' && typeof l.to === 'object') err(where, 'Both ends are battery limits. At least one end must be an item port.')
    for (const ref of [l.from, l.to]) {
      if (ref && typeof ref === 'object') {
        if (!(Array.isArray(ref.at) && ref.at.length === 3 && ref.at.every(Number.isFinite))) err(where, 'A battery-limit end needs "at": [x, y, z] in metres.')
        continue
      }
      if (typeof ref !== 'string' || !ref.includes('.')) {
        err(where, `"${ref}" must be "TAG.port" or a battery limit { "at": [x, y, z] }.`)
        continue
      }
      const i = ref.lastIndexOf('.')
      const tag = ref.slice(0, i)
      const port = ref.slice(i + 1)
      const t = tags.get(tag)
      if (!t) {
        err(where, `"${ref}": no item tagged ${tag}.`)
        continue
      }
      if (!t.comp) continue
      const p = t.comp.ports.find((x) => x.id === port)
      if (!p) {
        const msg = `"${ref}": ${t.comp.name} has no port "${port}" at its default props. Ports: ${t.comp.ports.map((x) => x.id).join(', ') || 'none'}.`
        t.it.props ? warn(where, msg + ' (It may exist for your props.)') : err(where, msg)
        continue
      }
      used.add(`${tag}.${port}`)
      ends.push({ ref, p, overridden: Object.keys(t.it.props ?? {}).some((k) => /nps|size/i.test(k)) })
    }
    const lt = parseLineTag(l.tag)
    if (l.tag && !lt.code) warn(where, 'Line tag is not SIZE"-SERVICE-SEQ-CLASS-INSULATION, so size, service and class are not read from it.')
    if (lt.code && !lt.service && !l.service) warn(where, `Service code "${lt.code}" is not recognised. Set "service" on the line.`)
    if (lt.nps && ends[0] && !ends[0].overridden && !l.nps && lt.nps !== ends[0].p.nps) warn(where, `Line number says ${lt.nps}" but ${ends[0].ref} is ${ends[0].p.nps}". Set the nozzle size prop or fix the line number.`)
    if (lt.rating && ends[0]?.p.rating && lt.rating < ends[0].p.rating) warn(where, `Piping class ${lt.pipingClass} is Class ${lt.rating}, below ${ends[0].ref} (Class ${ends[0].p.rating}).`)
    if (l.from === l.to) err(where, 'from and to are the same port.')
    for (const v of l.inline ?? []) {
      const comp = byName.get(v.component)
      if (!comp) err(where, `Inline component "${v.component}" does not exist.`)
      else if (!comp.ports.some((p) => p.id === 'A') || !comp.ports.some((p) => p.id === 'B')) err(where, `"${v.component}" is not inline (needs ports A and B).`)
      if (v.at !== undefined && !(v.at >= 0 && v.at <= 1)) err(where, `inline "at" must be 0–1.`)
    }
  }
  for (const { it, comp } of tags.values()) {
    if (!comp) continue
    for (const p of comp.ports.filter((x) => (x.kind ?? 'process') === 'process'))
      if (!used.has(`${it.tag}.${p.id}`)) warn(it.tag, `Process port "${p.id}" (${p.label}) is not connected.`)
  }
  if (!quiet) {
    for (const i of issues) console.log(`${i.level === 'error' ? c.red('error  ') : c.yellow('warning')} ${c.bold(i.where)}  ${i.message}`)
    const e = issues.filter((i) => i.level === 'error').length
    console.log(e ? c.red(`\n✗ ${e} error(s), ${issues.length - e} warning(s)`) : c.green(`✓ ${spec.items?.length ?? 0} items, ${spec.lines?.length ?? 0} lines${issues.length ? `, ${issues.length} warning(s)` : ', no issues'}`))
    console.log(c.dim('Geometry checks (overlaps, floating items) run in <Plant onReport> and on the website playground.'))
  }
  return { spec, issues }
}

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, x) => x.toUpperCase()).replace(/^[0-9]/, (d) => '_' + d)

async function assemble(file) {
  const { spec, issues } = await check(file)
  if (issues.some((i) => i.level === 'error') && !flags.has('force')) throw new Error('fix the errors above first (or pass --force)')
  const names = [...new Set([...spec.items.map((i) => i.component), ...(spec.lines ?? []).flatMap((l) => (l.inline ?? []).map((v) => v.component))])]
  console.log('')
  await add(['plant', 'core', ...names])
  const { dir } = config()
  const idx = await index()
  const out = resolve(cwd, flags.get('out') ?? (existsSync(join(cwd, 'src')) ? 'src/PlantScene.tsx' : 'PlantScene.tsx'))
  let rel = relative(dirname(out), join(cwd, dir)).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = './' + rel
  const imports = names.map((n) => `import * as ${camel(n)} from '${rel}/${idx.items.find((i) => i.name === n).import.slice(2)}'`)
  const extent = Math.max(10, ...spec.items.map((i) => Math.hypot(i.position?.[0] ?? 0, i.position?.[2] ?? 0) + 8))
  const src = `// Generated by \`deck-twin assemble ${relative(cwd, resolve(cwd, file))}\`. Re-run it after editing the plant.json.
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Stage } from '${rel}/lib/stage'
import { Plant, type ComponentMap } from '${rel}/assembly/plant'
import type { PlantSpec } from '${rel}/assembly/spec'
${imports.join('\n')}

const components: ComponentMap = {
${names.map((n) => `  '${n}': ${camel(n)},`).join('\n')}
}

const spec: PlantSpec = ${JSON.stringify(spec, null, 2).replace(/\n/g, '\n')}

export default function PlantScene() {
  return (
    <Canvas shadows camera={{ position: [${(extent * 1.1).toFixed(0)}, ${(extent * 0.8).toFixed(0)}, ${(extent * 1.2).toFixed(0)}], fov: 35, far: 4000 }}>
      <Stage radius={${extent.toFixed(0)}}>
        <Plant spec={spec} components={components} labels onReport={(issues) => issues.length && console.table(issues)} />
      </Stage>
      <OrbitControls makeDefault />
    </Canvas>
  )
}
`
  if (!flags.has('dry-run')) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, src)
  }
  console.log(`\n${c.green('✓')} wrote ${relative(cwd, out)}. Render <PlantScene /> in a full-size container.`)
}

async function skill() {
  const dir = resolve(cwd, flags.get('dir') ?? '.claude/skills/deck-twin')
  const manifest = await get('skill/manifest.json')
  for (const f of manifest.files) {
    const dest = join(dir, f)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, await get(`skill/${f}`))
    console.log(`  ${c.dim('+')} ${relative(cwd, dest)}`)
  }
  console.log(`${c.green('✓')} skill installed. Claude Code picks it up from .claude/skills; for other agents point them at ${relative(cwd, join(dir, 'SKILL.md'))}.`)
}

function init() {
  const { dir, registry, file, exists } = config()
  if (exists && !flags.has('overwrite')) return console.log(`${relative(cwd, file)} already exists.`)
  writeFileSync(file, JSON.stringify({ $schema: `${registry}/r/config.schema.json`, dir, registry }, null, 2) + '\n')
  console.log(`${c.green('✓')} wrote deck-twin.json (components go to ${dir})`)
  peers()
}

const HELP = `deck-twin ${VERSION}: standards-based three.js components for oil & gas digital twins

  deck-twin init                      write deck-twin.json (install dir + registry)
  deck-twin add <name...>             copy components (and the shared lib) into your project
  deck-twin list [category]           list components by category
  deck-twin search <words>            find components by name, tag or standard
  deck-twin info <name> [--json]      props, ranges, defaults and ports of one component
  deck-twin check <plant.json>        validate a plant: components, ports, sizes, wiring
  deck-twin assemble <plant.json>     check, install everything it uses, write PlantScene.tsx
  deck-twin skill [--dir path]        install the agent skill (default .claude/skills/deck-twin)

  --dir <path>        install directory (default src/components/deck-twin)
  --registry <url>    registry base URL or local folder (env DECKTWIN_REGISTRY)
  --overwrite         replace files you have changed
  --dry-run           show what would be written
  --install           install missing peer dependencies
  --json              machine-readable output (list, search, info)
`

try {
  if (!cmd || cmd === 'help' || flags.has('help')) console.log(HELP)
  else if (cmd === '--version' || flags.has('version')) console.log(VERSION)
  else if (cmd === 'add' || cmd === 'install' || cmd === 'i') {
    if (!args.length) throw new Error('name at least one component, e.g. deck-twin add gate-valve')
    await add(args)
  } else if (cmd === 'list' || cmd === 'ls') await list()
  else if (cmd === 'search') await search()
  else if (cmd === 'info') await info()
  else if (cmd === 'check') {
    const { issues } = await check(args[0] ?? 'plant.json')
    if (issues.some((i) => i.level === 'error')) process.exitCode = 1
  } else if (cmd === 'assemble') await assemble(args[0] ?? 'plant.json')
  else if (cmd === 'skill') await skill()
  else if (cmd === 'init') init()
  else throw new Error(`unknown command "${cmd}". Run deck-twin help.`)
} catch (e) {
  console.error(c.red(`✗ ${e.message}`))
  process.exitCode = 1
}
