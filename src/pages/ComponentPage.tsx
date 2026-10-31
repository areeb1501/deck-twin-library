import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { BY_NAME, CATEGORIES, loadModule, loadSource, type ComponentModule, type Item } from '../registry'
import { Viewer, type Bounds } from '../viewer/Viewer'
import { Controls } from '../viewer/Controls'
import { frac } from '../frac'
import { Badge, Code, Command, CopyMarkdown, Crumbs, RichText, Tabs, ViewMarkdown } from '../components/ui'
import { componentMarkdown, portOrigin, propRange, propType, usageSnippet } from '../componentMarkdown'
import { add, CLI, SITE } from '../site'
import { PID, symbolUrl } from '../pid'
import { usePageMeta } from '../meta'
import { NotFound } from './NotFound'

export function ComponentPage({ name }: { name: string }) {
  const item = BY_NAME.get(name)
  if (!item) return <NotFound what="component" />
  return <Detail key={item.name} item={item} />
}

function Detail({ item }: { item: Item }) {
  usePageMeta(`${item.title} 3D model`, item.description)
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
  const md = useMemo(() => (mod && source ? componentMarkdown({ item, source, values, defaults: mod.defaults ?? {}, ports, pid: PID[item.name], site: SITE }) : ''), [item, source, values, mod, ports])

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10 lg:px-10">
      <Crumbs items={[{ label: 'Components', href: '/components' }, { label: cat.title, href: `/components?category=${cat.id}` }, { label: item.title }]} />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="display text-[32px] sm:text-[44px] text-ink">{item.title}</h1>
        <div className="flex shrink-0 gap-2">
          <CopyMarkdown md={md} />
          <ViewMarkdown href={`/r/${item.name}.md`} />
        </div>
      </div>
      <p className="mt-3 max-w-3xl text-[17px] leading-7 text-fg-3">
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
          <div className="mt-5 grid overflow-hidden rounded-lg border border-border lg:grid-cols-[1fr_288px]">
            <div className="relative h-[460px] lg:h-[600px]">
              {Comp && (
                <Viewer className="absolute inset-0" ports={ports} showPorts={showPorts} fitKey={`${item.name}-${fit}`} onBounds={setBounds} env={item.viewer?.env} view={item.viewer?.view} frame={item.viewer?.frame}>
                  <Comp {...values} />
                </Viewer>
              )}
              {bounds && (
                <div className="dark-zone pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/75 px-2.5 py-1.5 font-mono text-[13px] text-white">
                  {bounds.size[0].toFixed(2)} × {bounds.size[2].toFixed(2)} × {bounds.size[1].toFixed(2)} m <span className="text-fg-3">L × W × H</span>
                </div>
              )}
              <div className="pointer-events-none absolute right-3 bottom-3 text-[13px] text-fg-3">Drag to orbit, scroll to zoom</div>
            </div>
            <div className="border-t border-border bg-muted p-5 lg:max-h-[600px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[13px] font-semibold text-ink">Parameters</div>
                <button onClick={() => mod && setValues({ ...(mod.defaults ?? {}), ...(item.preview ?? {}) })} className="text-[13px] font-medium text-brand hover:underline hover:underline-offset-4">
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
        This command copies <code className="font-mono text-fg">{item.category}/{item.file}</code> and the shared <code className="font-mono text-fg">lib/</code> into{' '}
        <code className="font-mono text-fg">src/components/deck-twin/</code>. It requires <code className="font-mono text-fg">three</code>, <code className="font-mono text-fg">@react-three/fiber</code> and{' '}
        <code className="font-mono text-fg">@react-three/drei</code>. See <Link href="/docs/installation" className="font-medium text-brand hover:underline hover:underline-offset-4">installation</Link> for manual setup.
      </p>

      <H2>Usage</H2>
      <Code code={usage} />

      <H2>Props</H2>
      <PropsTable item={item} defaults={mod?.defaults ?? {}} />

      {ports.length > 0 && (
        <>
          <H2>Ports</H2>
          <p className="mb-3 text-[13px] text-muted-fg">
            Flange faces in the component's local coordinate frame, in metres. Origin: {portOrigin(item)}. The plant assembler routes pipework between these ports.
          </p>
          <Table
            head={['Id', 'Label', 'Position', 'Direction', 'Size', 'Class']}
            rows={ports.map((p) => [
              <code className="font-mono text-[13px]">{p.id}</code>,
              p.label,
              <span className="font-mono text-[13px]">{p.position.map((v) => v.toFixed(3)).join(', ')}</span>,
              <span className="font-mono text-[13px]">{p.direction.map((v) => +v.toFixed(2)).join(', ')}</span>,
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
            {item.vendors.join(', ')}. The geometry is generic and sized to public standards. It is not vendor CAD.
          </p>
        </>
      ) : null}

      <H2>For agents</H2>
      <p className="mb-3 text-[13px] text-muted-fg">The machine-readable entry lists props, ranges, defaults and ports:</p>
      <Command cmd={`${CLI} info ${item.name}`} />
      <p className="mt-2 text-[13px] text-muted-fg">
        You can also fetch <a className="font-mono text-brand hover:underline hover:underline-offset-4" href={`/r/${item.name}.json`}>/r/{item.name}.json</a>, or copy this instruction:
      </p>
      <Code
        lang="text"
        className="mt-3"
        code={`Add the Deck Twin "${item.title}" component to this project. Run \`${CLI} add ${item.name}\` (it copies the file and the shared lib into src/components/deck-twin/), then \`${CLI} info ${item.name}\` for its props, ranges and ports. Render <${item.export} /> inside a React Three Fiber <Canvas shadows>, wrapped in <Stage> from src/components/deck-twin/lib/stage. Set props from my data (metres, NPS in inches, ASME class) and leave the rest at defaults. Install three, @react-three/fiber, @react-three/drei and @types/three if they're missing. Full guide: ${SITE}/skill/SKILL.md`}
      />
    </div>
  )
}

function PropsTable({ item, defaults }: { item: Item; defaults: Record<string, unknown> }) {
  const rows = item.params.map((p) => {
    return [<code className="font-mono text-[13px]">{p.key}</code>, <span className="font-mono text-[13px] text-fg-3">{propType(p)}</span>, <span className="font-mono text-[13px]">{JSON.stringify(defaults[p.key] ?? null)}</span>, propRange(p)]
  })
  return <Table head={['Prop', 'Type', 'Default', 'Range']} rows={[...rows, [<code className="font-mono text-[13px]">...group</code>, <span className="font-mono text-[13px] text-fg-3">position, rotation, scale…</span>, '', '']]} />
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-muted text-[13px] text-fg-3">
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
      <div className="grid gap-5 rounded-lg border border-border bg-surface p-5 sm:grid-cols-[180px_1fr]">
        <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-surface p-4">{url && <img src={url} alt={`P&ID symbol for ${name}`} className="sym max-h-full max-w-full" />}</div>
        <div className="space-y-3 text-[15px]">
          <p className="leading-6 text-fg-2">{e.drawn}</p>
          <div className="flex flex-wrap gap-1.5">
            {e.tags?.map((t) => <Badge key={t}>tag {t}</Badge>)}
            {e.isa?.map((t) => <Badge key={t}>ISA {t}</Badge>)}
            <Badge>{e.standard}</Badge>
          </div>
          {e.notes && <p className="text-[13px] text-muted-fg">{e.notes}</p>}
          {e.datasheet && (
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-ink">{e.datasheet.form} fields and the props they set</div>
              <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[13px]">
                {Object.entries(e.datasheet.fields).map(([f, p]) => (
                  <div key={f} className="contents">
                    <span className="text-fg-3">{f}</span>
                    <code className="font-mono text-[13px]">{p}</code>
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

const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-14 mb-4 border-t border-border pt-8 text-[24px] font-semibold text-ink">{children}</h2>

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-md border px-2.5 py-1 text-[13px] font-medium transition-colors ${on ? 'border-ink bg-ink text-on-ink' : 'border-border bg-surface text-fg-3 hover:border-line-strong hover:text-ink'}`}>
      {children}
    </button>
  )
}
