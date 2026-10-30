#!/usr/bin/env node
// deck-twin: add components, inspect the registry, validate and assemble plant.json. Zero dependencies.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { checkPlant, nextStep } from './check.mjs'

const VERSION = '0.2.1'
const DEFAULT_REGISTRY = 'https://deck-twin-library.demoareeb.workers.dev'
const PEERS = ['three', '@react-three/fiber', '@react-three/drei']

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

/** Reads and checks a plant, and always answers with issues: a file that won't parse is feedback too. */
async function readPlant(file) {
  let text
  try {
    text = readFileSync(resolve(cwd, file), 'utf8')
  } catch {
    return { issues: [{ level: 'error', code: 'no-file', where: file, path: '', message: `Cannot read ${file}.`, fix: 'Check the path.' }] }
  }
  let spec
  try {
    spec = JSON.parse(text)
  } catch (e) {
    return { issues: [{ level: 'error', code: 'bad-json', where: file, path: '', message: `Not valid JSON: ${e.message}`, fix: 'Fix the syntax at that position, then run validate again.' }] }
  }
  return { spec, issues: checkPlant(spec, (await index()).items) }
}

function printIssues(file, spec, issues) {
  const e = issues.filter((i) => i.level === 'error').length
  const w = issues.length - e
  const count = `${e} error(s), ${w} warning(s)`
  console.log(e ? c.red(`✗ ${file} is not valid: ${count}\n`) : c.green(`✓ ${file} is valid: ${spec.items?.length ?? 0} items, ${spec.lines?.length ?? 0} lines${w ? `, ${w} warning(s)` : ', no issues'}${w ? '\n' : ''}`))
  for (const i of issues) {
    console.log(`${i.level === 'error' ? c.red('error  ') : c.yellow('warning')} ${c.bold(i.where)}${i.path ? c.dim(`  ${i.path}`) : ''}\n        ${i.message}\n        ${c.dim('Fix:')} ${i.fix}\n`)
  }
  console.log(nextStep(issues))
}

async function validate(file) {
  const { spec, issues } = await readPlant(file)
  const errors = issues.filter((i) => i.level === 'error').length
  if (flags.has('json')) console.log(JSON.stringify({ file, valid: !errors, errors, warnings: issues.length - errors, items: spec?.items?.length ?? 0, lines: spec?.lines?.length ?? 0, issues, next: nextStep(issues) }, null, 2))
  else printIssues(file, spec, issues)
  if (errors) process.exitCode = 1
}

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, x) => x.toUpperCase()).replace(/^[0-9]/, (d) => '_' + d)

async function assemble(file) {
  const { spec, issues } = await readPlant(file)
  printIssues(file, spec, issues)
  if (!spec) throw new Error('fix the errors above first')
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
  deck-twin validate <plant.json>     every problem in a plant and how to fix it (exit 0 valid, 1 invalid, 2 could not run)
  deck-twin assemble <plant.json>     validate, install everything it uses, write PlantScene.tsx
  deck-twin skill [--dir path]        install the agent skill (default .claude/skills/deck-twin)

  --dir <path>        install directory (default src/components/deck-twin)
  --registry <url>    registry base URL or local folder (env DECKTWIN_REGISTRY)
  --overwrite         replace files you have changed
  --dry-run           show what would be written
  --install           install missing peer dependencies
  --json              machine-readable output (list, search, info, validate)
`

try {
  if (flags.has('version')) console.log(VERSION)
  else if (!cmd || cmd === 'help' || flags.has('help')) console.log(HELP)
  else if (cmd === 'add' || cmd === 'install' || cmd === 'i') {
    if (!args.length) throw new Error('name at least one component, e.g. deck-twin add gate-valve')
    await add(args)
  } else if (cmd === 'list' || cmd === 'ls') await list()
  else if (cmd === 'search') await search()
  else if (cmd === 'info') await info()
  else if (cmd === 'validate' || cmd === 'check') await validate(args[0] ?? 'plant.json').catch((e) => {
    // the file may be fine: exit 2 tells an agent this run proved nothing
    if (flags.has('json')) console.log(JSON.stringify({ valid: null, error: e.message }))
    else console.error(c.red(`✗ could not validate: ${e.message}`))
    process.exitCode = 2
  })
  else if (cmd === 'assemble') await assemble(args[0] ?? 'plant.json')
  else if (cmd === 'skill') await skill()
  else if (cmd === 'init') init()
  else throw new Error(`unknown command "${cmd}". Run deck-twin help.`)
} catch (e) {
  console.error(c.red(`✗ ${e.message}`))
  process.exitCode = 1
}
