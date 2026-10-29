// Builds the distributable registry into public/: one JSON per item (shadcn registry-item schema), index.json for agents,
// registry.json, llms.txt and the skill. Fails loudly on imports that would not survive a copy into another project.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CATEGORIES, type ComponentMeta } from '../registry/meta'
import { metas } from './list'
import { agentPrompt } from '../src/prompt'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reg = join(root, 'registry')
const out = join(root, 'public/r')
const SITE = (process.env.REGISTRY_URL ?? 'https://deck-twin-library.demoareeb.workers.dev').replace(/\/$/, '')
const PEERS = ['three', '@react-three/fiber', '@react-three/drei']
const ALLOWED = [/^react$/, /^three$/, /^three\/examples\/jsm\//, /^@react-three\/fiber$/, /^@react-three\/drei$/]
const TARGET = 'components/deck-twin'

const read = (p: string) => readFileSync(p, 'utf8')
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
const importsOf = (src: string) => [...src.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
const errors: string[] = []
const CHECK = process.argv.includes('--check')
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'))

/** Component file plus every `_helper` file it imports from a category folder (recursively). */
function withHelpers(abs: string, seen = new Set<string>()): string[] {
  if (seen.has(abs)) return []
  seen.add(abs)
  const out = [abs]
  for (const spec of importsOf(read(abs))) {
    if (!spec.startsWith('.') || spec.includes('/lib/') || spec.startsWith('../lib')) continue
    const base = join(dirname(abs), spec)
    const f = [base, `${base}.ts`, `${base}.tsx`].find((x) => existsSync(x) && /\/_[^/]+$/.test(x.replace(/\.tsx?$/, '')))
    if (f) out.push(...withHelpers(f, seen))
  }
  return out
}

function file(abs: string) {
  const path = relative(reg, abs)
  return { path, type: 'registry:file', target: `${TARGET}/${path}`, content: read(abs) }
}

function checkImports(abs: string, allowedDirs: string[]) {
  for (const spec of importsOf(read(abs))) {
    if (spec.startsWith('.')) {
      const target = relative(reg, join(dirname(abs), spec))
      const top = target.split('/')[0]
      if (target.startsWith('..') || !allowedDirs.includes(top)) errors.push(`${relative(root, abs)}: relative import "${spec}" leaves the installable tree`)
    } else if (!ALLOWED.some((r) => r.test(spec))) errors.push(`${relative(root, abs)}: import "${spec}" is not allowed (only react, three, @react-three/fiber, @react-three/drei and ../lib)`)
  }
}

if (!CHECK) {
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
}

const everything = await metas()
const all = everything.filter((m) => !ONLY.length || ONLY.includes(m.category) || ONLY.includes(m.name))
const names = new Set(everything.map((m) => m.name))
const libFiles = walk(join(reg, 'lib')).filter((f) => /\.(ts|tsx)$/.test(f))
for (const f of libFiles) checkImports(f, ['lib'])

const item = (name: string, type: string, title: string, description: string, files: ReturnType<typeof file>[], deps: string[], extra: object = {}) => ({
  $schema: 'https://ui.shadcn.com/schema/registry-item.json',
  name,
  type,
  title,
  description,
  dependencies: PEERS,
  registryDependencies: deps.map((d) => `${SITE}/r/${d}.json`),
  files,
  ...extra,
})

const write = (name: string, data: object) => !CHECK && writeFileSync(join(out, `${name}.json`), JSON.stringify(data, null, 2))

write('core', item('core', 'registry:lib', 'Deck Twin core', 'Geometry kit, PBR materials, parts, ports, router, stage and engineering standards tables shared by every component.', libFiles.map(file), []))

const asmFiles = walk(join(reg, 'assembly')).filter((f) => /\.(ts|tsx)$/.test(f))
for (const f of asmFiles) checkImports(f, ['lib', 'assembly', 'environment'])
write('plant', item('plant', 'registry:block', 'Plant assembler', 'Renders a plant.json: places components, routes lines between ports with elbows, flanges, inline valves, colour bands and supports.', asmFiles.map(file), ['core', 'ocean']))

const pid: Record<string, { symbol: string; standard: string; drawn: string; tags?: string[]; isa?: string[]; notes?: string; datasheet?: { form: string; fields: Record<string, string> } }> = JSON.parse(read(join(reg, 'pid/pid.json')))
for (const n of Object.keys(pid)) if (!names.has(n)) errors.push(`pid/pid.json: ${n} is not a registry component`)
for (const [n, e] of Object.entries(pid)) if (!existsSync(join(reg, 'pid/symbols', e.symbol))) errors.push(`pid/pid.json: ${n} → missing symbol ${e.symbol}`)
const bounds = existsSync(join(reg, 'generated/bounds.json')) ? JSON.parse(read(join(reg, 'generated/bounds.json'))) : {}
const index: object[] = []
for (const m of all) {
  const abs = join(reg, m.category, m.file)
  if (!existsSync(abs)) {
    errors.push(`${m.category}/_meta.ts: ${m.name} points at missing file ${m.file}`)
    continue
  }
  const files = withHelpers(abs)
  for (const f of files) checkImports(f, ['lib', ...CATEGORIES.map((c) => c.id)])
  const deps = files
    .flatMap((f) => importsOf(read(f)).map((s) => ({ s, f })))
    .filter(({ s }) => s.startsWith('.') && !s.includes('lib/'))
    .map(({ s }) => s.split('/').pop()!.replace(/\.tsx?$/, ''))
    .filter((d) => !d.startsWith('_'))
  for (const d of deps) if (!names.has(d)) errors.push(`${m.name}: imports ${d}, which is not a registry component`)
  let defaults: Record<string, unknown> = {}
  let ports: unknown[] = []
  try {
    const mod = await import(pathToFileURL(abs).href)
    defaults = mod.defaults ?? {}
    ports = mod.ports ? mod.ports({ ...defaults, ...(m.preview ?? {}) }) : []
    if (!mod.default) errors.push(`${m.name}: no default export`)
    if (!mod[m.export]) errors.push(`${m.name}: no named export ${m.export}`)
  } catch (e) {
    errors.push(`${m.name}: failed to import in Node: ${(e as Error).message}`)
  }
  const deps2 = ['core', ...new Set(deps)]
  const exp = ports as { id: string; position: number[]; direction: number[] }[]
  for (const p of exp) {
    if (!p.position?.every(Number.isFinite) || !p.direction?.every(Number.isFinite)) errors.push(`${m.name}: port ${p.id} has a non-finite position or direction`)
    else if (Math.abs(Math.hypot(...p.direction) - 1) > 0.01) errors.push(`${m.name}: port ${p.id} direction is not a unit vector`)
  }
  if (m.anchor === 'inline' && !(exp.some((p) => p.id === 'A') && exp.some((p) => p.id === 'B'))) errors.push(`${m.name}: inline components need ports A and B`)
  if (new Set(exp.map((p) => p.id)).size !== exp.length) errors.push(`${m.name}: duplicate port ids`)
  write(m.name, item(m.name, 'registry:component', m.title, m.description, files.map(file), deps2, { categories: [m.category], meta: { export: m.export, anchor: m.anchor, standards: m.standards } }))
  index.push({ ...entry(m, defaults, ports, deps2, bounds[m.name]), pid: pid[m.name] ? { ...pid[m.name], symbol: `${SITE}/symbols/${pid[m.name].symbol}` } : null })
}

function entry(m: ComponentMeta & { category: string }, defaults: Record<string, unknown>, ports: unknown[], deps: string[], b?: object) {
  return {
    name: m.name,
    title: m.title,
    category: m.category,
    description: m.description,
    import: `./${m.category}/${m.file.replace(/\.tsx$/, '')}`,
    export: m.export,
    anchor: m.anchor,
    standards: m.standards,
    vendors: m.vendors ?? [],
    tags: m.tags ?? [],
    params: m.params,
    defaults,
    ports,
    bounds: b ?? null,
    registryDependencies: deps,
  }
}

// The skill's component map is hand-written: every name in it must exist, and every component should appear in it.
{
  const mapText = read(join(root, 'skill/references/component-map.md'))
  const mapped = new Set([...mapText.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)*)`/g)].map((m) => m[1]))
  for (const n of mapped) if (n.includes('-') && !names.has(n) && !/^\d/.test(n)) errors.push(`skill/references/component-map.md names "${n}", which is not a component`)
  const unmapped = [...names].filter((n) => !mapped.has(n))
  if (unmapped.length) console.warn(`! ${unmapped.length} component(s) missing from skill/references/component-map.md: ${unmapped.join(', ')}`)
}

if (CHECK) {
  if (errors.length) {
    console.error(`✗ ${errors.length} problem(s)\n  ` + errors.join('\n  '))
    process.exit(1)
  }
  console.log(`✓ check: ${all.length} component(s) OK`)
  process.exit(0)
}

writeFileSync(join(out, 'index.json'), JSON.stringify({ name: 'deck-twin', homepage: SITE, categories: CATEGORIES, items: index }, null, 1))
writeFileSync(
  join(out, 'registry.json'),
  JSON.stringify(
    {
      $schema: 'https://ui.shadcn.com/schema/registry.json',
      name: 'deck-twin',
      homepage: SITE,
      items: [
        { name: 'core', type: 'registry:lib', title: 'Deck Twin core' },
        { name: 'plant', type: 'registry:block', title: 'Plant assembler' },
        ...all.map((m) => ({ name: m.name, type: 'registry:component', title: m.title, description: m.description, categories: [m.category] })),
      ],
    },
    null,
    1,
  ),
)

const llms = [
  '# Deck Twin',
  '',
  '> Standards-based three.js / React Three Fiber components for oil & gas digital twins: vessels, pumps, compressors, valves, piping, instruments, structures, cranes and packages. Each component is one file with typed props in metres, defaults sized from ASME/API/TEMA/IEC/ISO tables, and ports (flange faces) for wiring pipe. A plant is assembled from a plant.json.',
  '',
  '## Docs',
  ...['introduction', 'installation', 'cli', 'assemble', 'agents', 'conventions', 'standards', 'contributing'].map((s) => `- [${s}](${SITE}/docs/${s})`),
  '',
  '## Machine-readable',
  `- [index.json](${SITE}/r/index.json): every component with params, ranges, defaults, ports and bounds`,
  `- [SKILL.md](${SITE}/skill/SKILL.md): agent skill (find, install, assemble)`,
  `- [plant schema](${SITE}/r/plant.json): the assembler and the plant.json types`,
  '',
  ...CATEGORIES.flatMap((c) => {
    const items = all.filter((m) => m.category === c.id)
    if (!items.length) return []
    return [`## ${c.title}`, ...items.map((m) => `- [${m.name}](${SITE}/r/${m.name}.json): ${m.title}. ${m.description.split('. ')[0]}.`), '']
  }),
].join('\n')
writeFileSync(join(root, 'public/llms.txt'), llms)

// Sitemap and robots: every page route the site renders, from the same sources the router reads
const pages = [
  '/',
  '/components',
  '/symbols',
  '/examples',
  '/playground',
  ...readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `/docs/${f.replace(/\.md$/, '')}`).sort(),
  ...all.map((m) => `/components/${m.name}`),
  ...readdirSync(join(reg, 'examples')).filter((f) => f.endsWith('.plant.json')).map((f) => `/examples/${f.replace(/\.plant\.json$/, '')}`).sort(),
]
writeFileSync(
  join(root, 'public/sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}\n</urlset>\n`,
)
writeFileSync(join(root, 'public/robots.txt'), ['User-agent: *', 'Allow: /', 'Disallow: /shot/', 'Disallow: /shot-plant/', '', `Sitemap: ${SITE}/sitemap.xml`, ''].join('\n'))

// P&ID: symbols, legend sheet and the generated skill reference
rmSync(join(root, 'public/symbols'), { recursive: true, force: true })
cpSync(join(reg, 'pid/symbols'), join(root, 'public/symbols'), { recursive: true })
const withPid = all.filter((m) => pid[m.name])
const COLS = 8
const CW = 180
const CH = 170
const cells = withPid.map((m, i) => {
  const svg = read(join(reg, 'pid/symbols', pid[m.name].symbol))
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 100 100'
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  const x = (i % COLS) * CW
  const y = Math.floor(i / COLS) * CH
  const label = m.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const tags = [...(pid[m.name].tags ?? []), ...(pid[m.name].isa ?? [])].slice(0, 4).join(' · ')
  return `<g transform="translate(${x},${y})"><rect x="4" y="4" width="${CW - 8}" height="${CH - 8}" rx="8" fill="#fff" stroke="#e4e4e7"/><svg x="20" y="14" width="${CW - 40}" height="96" viewBox="${vb}" fill="none" stroke="#111" stroke-width="2.5" stroke-linejoin="round">${inner}</svg><text x="${CW / 2}" y="128" text-anchor="middle" font-family="Arial" font-size="12" font-weight="600" fill="#111">${label.length > 26 ? label.slice(0, 25) + '…' : label}</text><text x="${CW / 2}" y="146" text-anchor="middle" font-family="monospace" font-size="10" fill="#555">${m.name}</text><text x="${CW / 2}" y="160" text-anchor="middle" font-family="monospace" font-size="10" fill="#888">${tags.replace(/&/g, '&amp;')}</text></g>`
})
const rows = Math.ceil(withPid.length / COLS)
writeFileSync(join(root, 'public/symbols/legend.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * CW}" height="${rows * CH + 40}" viewBox="0 0 ${COLS * CW} ${rows * CH + 40}"><rect width="100%" height="100%" fill="#fafafa"/><text x="12" y="26" font-family="Arial" font-size="16" font-weight="700" fill="#111">Deck Twin P&amp;ID symbol legend (ISO 10628-2 / ISA 5.1 / PIP PIC001 conventions)</text><g transform="translate(0,40)">${cells.join('')}</g></svg>`)
writeFileSync(
  join(root, 'skill/references/pid-symbols.md'),
  [
    '# P&ID symbols → components',
    '',
    `Generated from \`registry/pid/pid.json\`. Every symbol drawing is at \`${SITE}/symbols/<file>\`, and the whole legend is one image at ${SITE}/symbols/legend.svg. Use it side by side with the P&ID.`,
    '',
    '## How to read a sheet',
    '',
    '1. **Find the legend.** Read the drawing\'s own legend or "symbols & abbreviations" sheet first. Company legends override the defaults here.',
    '2. **Tile large drawings.** Split big scans so tags are legible: `python3 -I scripts/tile.py <sheet.png> --grid 3x2 --scale 2`.',
    '3. **Read equipment first.** Match each equipment symbol and its tag letters (V, P, K, E, T…) to a component below. Confirm with the tag; the tag letter beats symbol shape when they disagree.',
    '4. **Read the lines.** For each line, record the line number (`8"-PG-2101-D6A-N` → size, service, class, insulation), its two end nozzles, and every valve or inline item along it, in flow order.',
    '5. **Read the instruments.** ISA 5.1 bubbles only become components when they are field devices on the pipe or vessel. A bubble with a line through it is in the DCS (control room) and is not physical.',
    '6. **Read the datasheets.** For each item, the datasheet fields listed below map straight onto props.',
    '',
    '| Component | Drawn as | Tag / ISA | Datasheet → props |',
    '|---|---|---|---|',
    ...withPid.map((m) => {
      const e = pid[m.name]
      const ds = e.datasheet ? `${e.datasheet.form}: ` + Object.entries(e.datasheet.fields).map(([f, p]) => `${f} → \`${p}\``).join('; ') : ''
      return `| \`${m.name}\` [symbol](${SITE}/symbols/${e.symbol}) | ${e.drawn.replace(/\|/g, '/')}${e.notes ? ` *${e.notes.replace(/\|/g, '/')}*` : ''} | ${[...(e.tags ?? []), ...(e.isa ?? [])].join(', ')} | ${ds.replace(/\|/g, '/')} |`
    }),
    '',
  ].join('\n'),
)
// Extended legend: every common P&ID symbol, linked to components where one exists
const libFile = join(reg, 'pid/library.json')
if (existsSync(libFile)) {
  const lib: { version: number; categories: { id: string; title: string }[]; symbols: { id: string; name: string; category: string; svg: string; standard: string; drawn: string; meaning: string; variants?: string[]; component?: string; physical: boolean; tags?: string[]; isa?: string[] }[] } = JSON.parse(read(libFile))
  for (const x of lib.symbols) {
    if (x.component && !names.has(x.component)) errors.push(`pid/library.json: ${x.id} → unknown component ${x.component}`)
    if (!existsSync(join(reg, 'pid/library', x.svg))) errors.push(`pid/library.json: ${x.id} → missing svg ${x.svg}`)
  }
  cpSync(join(reg, 'pid/library'), join(root, 'public/symbols/library'), { recursive: true })
  writeFileSync(join(out, 'pid-library.json'), JSON.stringify({ ...lib, symbols: lib.symbols.map((x) => ({ ...x, svg: `${SITE}/symbols/library/${x.svg}` })) }, null, 1))
  for (const c of lib.categories) {
    const items = lib.symbols.filter((x) => x.category === c.id)
    if (!items.length) continue
    const cols = 6
    const cw = 200
    const ch = 170
    const body = items.map((x, i) => {
      const svg = read(join(reg, 'pid/library', x.svg))
      const vb = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 100 100'
      const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
      const name = x.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      return `<g transform="translate(${(i % cols) * cw},${Math.floor(i / cols) * ch})"><rect x="4" y="4" width="${cw - 8}" height="${ch - 8}" rx="8" fill="#fff" stroke="#e4e4e7"/><svg x="20" y="14" width="${cw - 40}" height="100" viewBox="${vb}" fill="none" stroke="#111" stroke-width="2.5" stroke-linejoin="round">${inner}</svg><text x="${cw / 2}" y="134" text-anchor="middle" font-family="Arial" font-size="12" font-weight="600" fill="#111">${name.length > 28 ? name.slice(0, 27) + '…' : name}</text><text x="${cw / 2}" y="152" text-anchor="middle" font-family="monospace" font-size="10" fill="#666">${x.id}</text></g>`
    })
    const h = Math.ceil(items.length / cols) * ch + 44
    writeFileSync(join(root, `public/symbols/legend-${c.id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${h}" viewBox="0 0 ${cols * cw} ${h}"><rect width="100%" height="100%" fill="#fafafa"/><text x="12" y="28" font-family="Arial" font-size="16" font-weight="700" fill="#111">P&amp;ID legend: ${c.title.replace(/&/g, '&amp;')}</text><g transform="translate(0,44)">${body.join('')}</g></svg>`)
  }
  const esc = (t: string) => t.replace(/\|/g, '/').replace(/\n/g, ' ')
  writeFileSync(
    join(root, 'skill/references/pid-legend.md'),
    [
      '# P&ID legend: every common symbol',
      '',
      `Generated from \`registry/pid/library.json\` (${lib.symbols.length} symbols). Each category is also one image: \`${SITE}/symbols/legend-<category>.svg\`, which you can view side by side with the drawing. Symbols marked *logical* are not hardware: read them, then skip them in the 3D model. Where a symbol has a component, that is the registry name to use.`,
      '',
      ...lib.categories.flatMap((c) => {
        const items = lib.symbols.filter((x) => x.category === c.id)
        if (!items.length) return []
        return [
          `## ${c.title}`,
          '',
          `Sheet: ${SITE}/symbols/legend-${c.id}.svg`,
          '',
          '| Symbol | Drawn as | Meaning | Component |',
          '|---|---|---|---|',
          ...items.map((x) => `| **${esc(x.name)}** \`${x.id}\`${x.tags?.length || x.isa?.length ? ` (${[...(x.tags ?? []), ...(x.isa ?? [])].join(', ')})` : ''} | ${esc(x.drawn)} | ${esc(x.meaning)}${x.variants?.length ? ` Variants: ${esc(x.variants.join('; '))}` : ''} | ${x.component ? `\`${x.component}\`` : x.physical ? '–' : '*logical*'} |`),
          '',
        ]
      }),
    ].join('\n'),
  )
}

const missingPid = all.filter((m) => !pid[m.name]).map((m) => m.name)
if (missingPid.length) console.warn(`! ${missingPid.length} component(s) without a P&ID entry: ${missingPid.slice(0, 12).join(', ')}${missingPid.length > 12 ? '…' : ''}`)

if (existsSync(join(root, 'skill'))) {
  rmSync(join(root, 'public/skill'), { recursive: true, force: true })
  cpSync(join(root, 'skill'), join(root, 'public/skill'), { recursive: true })
  const cli = `npx -y ${SITE}/cli/deck-twin.tgz`
  for (const f of walk(join(root, 'public/skill')).filter((x) => x.endsWith('.md'))) writeFileSync(f, read(f).replaceAll('{{CLI}}', cli).replaceAll('{{SITE}}', SITE))
  const files = walk(join(root, 'skill')).map((f) => relative(join(root, 'skill'), f)).filter((f) => !f.split('/').pop()!.startsWith('.'))
  writeFileSync(join(root, 'public/skill/manifest.json'), JSON.stringify({ files }, null, 1))
}
if (existsSync(join(reg, 'examples'))) {
  mkdirSync(join(out, 'examples'), { recursive: true })
  for (const f of readdirSync(join(reg, 'examples'))) cpSync(join(reg, 'examples', f), join(out, 'examples', f))
}

// Agent prompt and the CLI tarball (runs as `npx -y <site>/cli/deck-twin.tgz` until it is on npm)
writeFileSync(join(root, 'public/prompt.md'), agentPrompt(SITE))
{
  const tmp = join(tmpdir(), `deck-twin-cli-${process.pid}`)
  rmSync(tmp, { recursive: true, force: true })
  cpSync(join(root, 'cli'), tmp, { recursive: true })
  const f = join(tmp, 'deck-twin.mjs')
  writeFileSync(f, read(f).replace(/const DEFAULT_REGISTRY = '[^']*'/, `const DEFAULT_REGISTRY = '${SITE}'`))
  mkdirSync(join(root, 'public/cli'), { recursive: true })
  const r = spawnSync('npm', ['pack', '--silent', '--pack-destination', join(root, 'public/cli')], { cwd: tmp, encoding: 'utf8' })
  const packed = r.stdout.trim().split('\n').pop()
  if (r.status !== 0 || !packed) errors.push(`cli: npm pack failed: ${r.stderr}`)
  else cpSync(join(root, 'public/cli', packed), join(root, 'public/cli/deck-twin.tgz'))
  rmSync(tmp, { recursive: true, force: true })
}

if (errors.length) {
  console.error(`\n✗ registry: ${errors.length} problem(s)\n  ` + errors.join('\n  '))
  process.exit(1)
}
console.log(`✓ registry: ${all.length} components, core (${libFiles.length} files), plant → public/r (${SITE})`)
