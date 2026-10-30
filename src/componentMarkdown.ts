// A component's page as Markdown. Plain text, no DOM: the page's Copy button and the /r/<name>.md files written at build both call this.
import type { ComponentMeta, Param } from '../registry/meta'
import type { Port } from '../registry/lib/ports'
import type { PidEntry } from '../registry/pid/types'
import { cliCommand } from './prompt'
import { frac } from './frac'

type Values = Record<string, unknown>

interface Input {
  item: ComponentMeta & { category: string }
  source: string
  values: Values
  defaults: Values
  ports: Port[]
  pid?: PidEntry
  site: string
}

export function usageSnippet(item: Input['item'], values: Values, defaults: Values) {
  const changed = Object.entries(values).filter(([k, v]) => JSON.stringify(defaults[k]) !== JSON.stringify(v))
  const props = changed.map(([k, v]) => (typeof v === 'string' ? `${k}="${v}"` : `${k}={${JSON.stringify(v)}}`)).join(' ')
  return `import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Stage } from './components/deck-twin/lib/stage'
import { ${item.export} } from './components/deck-twin/${item.category}/${item.file.replace(/\.tsx$/, '')}'

export default function Scene() {
  return (
    <Canvas shadows camera={{ position: [8, 5, 9], fov: 35 }}>
      <Stage>
        <${item.export}${props ? ' ' + props : ''} />
      </Stage>
      <OrbitControls makeDefault />
    </Canvas>
  )
}
`
}

export function propType(p: Param) {
  if (p.type === 'select') return p.options.map((o) => JSON.stringify(typeof o === 'object' ? o.value : o)).join(' | ')
  if (p.type === 'nps') return 'number (NPS, in)'
  if (p.type === 'rating') return '150 | 300 | 600 | 900 | 1500 | 2500'
  if (p.type === 'number') return `number${p.unit ? ` (${p.unit})` : ''}`
  return p.type === 'bool' ? 'boolean' : 'string'
}

export const propRange = (p: Param) => (p.type === 'number' ? `${p.min} – ${p.max}` : '')

export const portOrigin = (item: Input['item']) => (item.anchor === 'base' ? 'centre of the footprint at deck level (y = 0)' : 'pipe centreline, flow along X')

const code = (s: string) => `\`${s}\``
const table = (head: string[], rows: string[][]) => [head, head.map(() => '---'), ...rows].map((r) => `| ${r.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`).join('\n')
const block = (lang: string, body: string) => {
  const fence = '`'.repeat(Math.max(3, ...[...body.matchAll(/`+/g)].map((m) => m[0].length + 1)))
  return `${fence}${lang}\n${body.trimEnd()}\n${fence}`
}

export function componentMarkdown({ item, source, values, defaults, ports, pid, site }: Input) {
  const path = `${item.category}/${item.file}`
  const sections = [
    `# ${item.title}`,
    item.description,
    `**Standards:** ${item.standards.join(', ')}`,
    `## Installation`,
    block('bash', `${cliCommand(site)} add ${item.name}`),
    `Copies ${code(path)}, any helper files it imports and the shared ${code('lib/')} into ${code('src/components/deck-twin/')}. Needs ${code('three')}, ${code('@react-three/fiber')} and ${code('@react-three/drei')}.`,
    `## Usage`,
    block('tsx', usageSnippet(item, values, defaults)),
    `## Props`,
    table(
      ['Prop', 'Type', 'Default', 'Range'],
      [...item.params.map((p) => [code(p.key), code(propType(p)), code(JSON.stringify(defaults[p.key] ?? null)), propRange(p)]), [code('...group'), 'position, rotation, scale…', '', '']],
    ),
  ]
  if (ports.length)
    sections.push(
      `## Ports`,
      `Flange faces in the component's local frame, metres. Origin: ${portOrigin(item)}.`,
      table(
        ['Id', 'Label', 'Position', 'Direction', 'Size', 'Class'],
        ports.map((p) => [code(p.id), p.label, p.position.map((v) => v.toFixed(3)).join(', '), p.direction.map((v) => +v.toFixed(2)).join(', '), `${frac(p.nps)}"`, String(p.rating ?? '–')]),
      ),
    )
  if (pid) {
    const marks = [...(pid.tags ?? []).map((t) => `tag ${t}`), ...(pid.isa ?? []).map((t) => `ISA ${t}`), pid.standard]
    sections.push(`## P&ID`, pid.drawn, marks.join(' · '))
    if (pid.notes) sections.push(pid.notes)
    if (pid.datasheet) sections.push(`${pid.datasheet.form} fields and the props they set:`, table(['Field', 'Prop'], Object.entries(pid.datasheet.fields).map(([f, p]) => [f, code(p)])))
  }
  if (item.vendors?.length) sections.push(`## Typical suppliers`, `${item.vendors.join(' · ')}. The geometry is generic and sized from public standards. It is not vendor CAD.`)
  sections.push(
    `## Source`,
    `${code(path)}. This is the component file only: it imports shared code, so install it with the command above rather than pasting it alone. ${site}/r/${item.name}.json has every file.`,
    block('tsx', source),
  )
  return sections.join('\n\n') + '\n'
}
