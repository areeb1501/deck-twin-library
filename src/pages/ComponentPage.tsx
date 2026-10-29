import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { BY_NAME, CATEGORIES, loadModule, loadSource, type ComponentModule, type Item } from '../registry'
import { Viewer, type Bounds } from '../viewer/Viewer'
import { Controls, frac } from '../viewer/Controls'
import { Badge, Code, Command, RichText, Tabs } from '../components/ui'
import { add, CLI, SITE } from '../site'
import { PID, symbolUrl } from '../pid'

export function ComponentPage({ name }: { name: string }) {
  const item = BY_NAME.get(name)
  if (!item) return <div className="px-10 py-24 text-muted-fg">Unknown component “{name}”.</div>
  return <Detail key={item.name} item={item} />
}

function Detail({ item }: { item: Item }) {
  const [mod, setMod] = useState<ComponentModule | null>(null)
  const [source, setSource] = useState('')
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [tab, setTab] = useState<'preview' | 'code'>('preview')
  const [showPorts, setShowPorts] = useState(false)
  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [fit, setFit] = useState(0)
  useEffect(() => {
    loadModule(item).then((m) => {
      setMod(m)
      setValues({ ...(m.defaults ?? {}), ...(item.preview ?? {}) })
    })
    loadSource(item).then(setSource)
  }, [item])
  const Comp = mod?.default
  const ports = useMemo(() => (mod?.ports ? mod.ports(values) : []), [mod, values])
  const cat = CATEGORIES.find((c) => c.id === item.category)!
  const usage = useMemo(() => usageSnippet(item, values, mod?.defaults ?? {}), [item, values, mod])

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10 lg:px-10">
      <nav className="mb-3 flex items-center gap-1.5 text-[13px] text-muted-fg">
        <Link href="/components" className="font-medium text-brand hover:underline hover:underline-offset-4">
          Components
        </Link>
        <span className="text-slate-300">/</span>
        <span>{cat.title}</span>
      </nav>
      <h1 className="text-[34px] leading-tight font-semibold text-ink">{item.title}</h1>
      <p className="mt-3 max-w-3xl text-[16px] leading-7 text-slate-600">
        <RichText text={item.description} />
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {item.standards.map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
      </div>

      <div className="mt-8">
        <Tabs
          tabs={[
            { id: 'preview', label: 'Preview' },
            { id: 'code', label: 'Code' },
          ]}
          value={tab}
          onChange={setTab}
          right={
            tab === 'preview' && (
              <div className="flex items-center gap-1.5 pb-1">
                <Toggle on={showPorts} onClick={() => setShowPorts((s) => !s)}>
                  Ports
                </Toggle>
                <Toggle on={false} onClick={() => setFit((f) => f + 1)}>
                  Fit
                </Toggle>
              </div>
            )
          }
        />
        {tab === 'preview' ? (
          <div className="mt-5 grid overflow-hidden rounded-xl border border-border shadow-[0_1px_2px_rgb(14_26_36/0.04)] lg:grid-cols-[1fr_288px]">
            <div className="relative h-[460px] lg:h-[600px]">
              {Comp && (
                <Viewer className="absolute inset-0" ports={ports} showPorts={showPorts} fitKey={`${item.name}-${fit}`} onBounds={setBounds} env={item.viewer?.env} view={item.viewer?.view} frame={item.viewer?.frame}>
                  <Comp {...values} />
                </Viewer>
              )}
              {bounds && (
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-ink/90 px-2.5 py-1.5 font-mono text-[11.5px] text-white shadow-sm">
                  {bounds.size[0].toFixed(2)} × {bounds.size[2].toFixed(2)} × {bounds.size[1].toFixed(2)} m <span className="text-slate-400">L × W × H</span>
                </div>
              )}
              <div className="pointer-events-none absolute right-3 bottom-3 text-[11.5px] text-slate-400">Drag to orbit, scroll to zoom</div>
            </div>
            <div className="border-t border-border bg-muted p-5 lg:max-h-[600px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[13px] font-semibold text-ink">Parameters</div>
                <button onClick={() => mod && setValues({ ...(mod.defaults ?? {}), ...(item.preview ?? {}) })} className="text-xs font-medium text-brand hover:underline hover:underline-offset-4">
                  Reset
                </button>
              </div>
              <Controls params={item.params} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
            </div>
          </div>
        ) : (
          <Code code={source} className="mt-4" maxHeight="640px" />
        )}
      </div>

      <H2>Installation</H2>
      <Command cmd={add(item.name)} />
      <p className="mt-3 text-[13px] text-muted-fg">
        Copies <code className="font-mono text-fg">{item.category}/{item.file}</code> and the shared <code className="font-mono text-fg">lib/</code> into{' '}
        <code className="font-mono text-fg">src/components/deck-twin/</code>. Needs <code className="font-mono text-fg">three</code>, <code className="font-mono text-fg">@react-three/fiber</code> and{' '}
        <code className="font-mono text-fg">@react-three/drei</code>. See <Link href="/docs/installation" className="font-medium text-brand hover:underline hover:underline-offset-4">installation</Link> for the manual route.
      </p>

      <H2>Usage</H2>
      <Code code={usage} />

      <H2>Props</H2>
      <PropsTable item={item} defaults={mod?.defaults ?? {}} />

      {ports.length > 0 && (
        <>
          <H2>Ports</H2>
          <p className="mb-3 text-[13px] text-muted-fg">
            Flange faces in the component's local frame, metres. Origin: {item.anchor === 'base' ? 'centre of the footprint at deck level (y = 0)' : 'pipe centreline, flow along X'}. The assembler routes pipes between these.
          </p>
          <Table
            head={['Id', 'Label', 'Position', 'Direction', 'Size', 'Class']}
            rows={ports.map((p) => [
              <code className="font-mono text-xs">{p.id}</code>,
              p.label,
              <span className="font-mono text-xs">{p.position.map((v) => v.toFixed(3)).join(', ')}</span>,
              <span className="font-mono text-xs">{p.direction.map((v) => +v.toFixed(2)).join(', ')}</span>,
              `${frac(p.nps)}"`,
              p.rating ?? '–',
            ])}
          />
        </>
      )}

      <PidSection name={item.name} />

      {item.vendors?.length ? (
        <>
          <H2>Typical suppliers</H2>
          <p className="text-[13px] text-muted-fg">
            {item.vendors.join(' · ')}. The geometry is generic and sized from public standards. It is not vendor CAD.
          </p>
        </>
      ) : null}

      <H2>For agents</H2>
      <p className="mb-3 text-[13px] text-muted-fg">Machine-readable entry with props, ranges, defaults and ports:</p>
      <Command cmd={`${CLI} info ${item.name}`} />
      <p className="mt-2 text-[13px] text-muted-fg">
        Or fetch <a className="font-mono text-brand hover:underline hover:underline-offset-4" href={`/r/${item.name}.json`}>/r/{item.name}.json</a>, or copy a ready-made instruction:
      </p>
      <Code
        lang="text"
        className="mt-3"
        code={`Add the Deck Twin "${item.title}" component to this project. Run \`${CLI} add ${item.name}\` (it copies the file and the shared lib into src/components/deck-twin/), then \`${CLI} info ${item.name}\` for its props, ranges and ports. Render <${item.export} /> inside a React Three Fiber <Canvas shadows>, wrapped in <Stage> from src/components/deck-twin/lib/stage. Set props from my data (metres, NPS in inches, ASME class) and leave the rest at defaults. Install three, @react-three/fiber, @react-three/drei and @types/three if they're missing. Full guide: ${SITE}/skill/SKILL.md`}
      />
    </div>
  )
}

function usageSnippet(item: Item, values: Record<string, unknown>, defaults: Record<string, unknown>) {
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

function PropsTable({ item, defaults }: { item: Item; defaults: Record<string, unknown> }) {
  const rows = item.params.map((p) => {
    const type = p.type === 'select' ? p.options.map((o) => JSON.stringify(typeof o === 'object' ? o.value : o)).join(' | ') : p.type === 'nps' ? 'number (NPS, in)' : p.type === 'rating' ? '150 | 300 | 600 | 900 | 1500 | 2500' : p.type === 'number' ? `number${p.unit ? ` (${p.unit})` : ''}` : p.type === 'bool' ? 'boolean' : 'string'
    const range = p.type === 'number' ? `${p.min} – ${p.max}` : ''
    return [<code className="font-mono text-xs">{p.key}</code>, <span className="font-mono text-xs text-slate-600">{type}</span>, <span className="font-mono text-xs">{JSON.stringify(defaults[p.key] ?? null)}</span>, range]
  })
  return <Table head={['Prop', 'Type', 'Default', 'Range']} rows={[...rows, [<code className="font-mono text-xs">...group</code>, <span className="font-mono text-xs text-slate-600">position, rotation, scale…</span>, '', '']]} />
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-muted text-[12.5px] text-slate-600">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PidSection({ name }: { name: string }) {
  const e = PID[name]
  if (!e) return null
  const url = symbolUrl(e)
  return (
    <>
      <H2>P&amp;ID</H2>
      <div className="grid gap-5 rounded-xl border border-border bg-white p-5 sm:grid-cols-[180px_1fr]">
        <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-white p-4">{url && <img src={url} alt={`P&ID symbol for ${name}`} className="max-h-full max-w-full" />}</div>
        <div className="space-y-3 text-[14px]">
          <p className="leading-6 text-slate-700">{e.drawn}</p>
          <div className="flex flex-wrap gap-1.5">
            {e.tags?.map((t) => <Badge key={t}>tag {t}</Badge>)}
            {e.isa?.map((t) => <Badge key={t}>ISA {t}</Badge>)}
            <Badge>{e.standard}</Badge>
          </div>
          {e.notes && <p className="text-[13px] text-muted-fg">{e.notes}</p>}
          {e.datasheet && (
            <div>
              <div className="mb-1.5 text-[12.5px] font-semibold text-ink">{e.datasheet.form} fields and the props they set</div>
              <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[13px]">
                {Object.entries(e.datasheet.fields).map(([f, p]) => (
                  <div key={f} className="contents">
                    <span className="text-slate-600">{f}</span>
                    <code className="font-mono text-xs">{p}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-14 mb-4 border-t border-border pt-8 text-[22px] font-semibold text-ink">{children}</h2>

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-border bg-white text-slate-600 hover:border-slate-300 hover:text-ink'}`}>
      {children}
    </button>
  )
}
