import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { BY_NAME, CATEGORIES, byCategory } from '../registry'
import { LIBRARY, PID, librarySymbolUrl, symbolUrl } from '../pid'
import type { LibrarySymbol } from '../../registry/pid/types'

export function Symbols() {
  const [tab, setTab] = useState<'legend' | 'components'>(LIBRARY.symbols.length ? 'legend' : 'components')
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-10">
      <h1 className="text-[34px] leading-tight font-semibold text-ink">P&amp;ID symbols</h1>
      <p className="mt-2 max-w-3xl text-[15px] leading-7 text-slate-600">
        What each symbol on a P&amp;ID looks like, what it means, and which Deck Twin component it becomes. The conventions are ISO 10628-2 and PIP PIC001 for process, ISA 5.1 for instruments, IEC 60617 for electrical, and NFPA 170 / ISO 7010 for fire &amp; gas. Company legends vary, so read the drawing's own legend sheet first.
      </p>
      <p className="mt-3 text-[13px] text-muted-fg">
        For agents: <a className="font-medium text-brand hover:underline hover:underline-offset-4" href="/skill/references/pid-legend.md">pid-legend.md</a> · <a className="font-medium text-brand hover:underline hover:underline-offset-4" href="/skill/references/pid-symbols.md">pid-symbols.md</a> · <a className="font-medium text-brand hover:underline hover:underline-offset-4" href="/r/pid-library.json">pid-library.json</a> · <a className="font-medium text-brand hover:underline hover:underline-offset-4" href="/symbols/legend.svg">legend.svg</a>
      </p>
      <div className="mt-6 flex gap-1 border-b border-border">
        {LIBRARY.symbols.length > 0 && (
          <TabButton on={tab === 'legend'} onClick={() => setTab('legend')}>
            Full legend ({LIBRARY.symbols.length})
          </TabButton>
        )}
        <TabButton on={tab === 'components'} onClick={() => setTab('components')}>
          By component ({Object.keys(PID).length})
        </TabButton>
      </div>
      {tab === 'legend' ? <Legend /> : <ByComponent />}
    </div>
  )
}

function Legend() {
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<LibrarySymbol | null>(null)
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return LIBRARY.symbols.filter((x) => (cat === 'all' || x.category === cat) && (!s || `${x.name} ${x.id} ${x.meaning} ${x.drawn} ${x.tags?.join(' ')} ${x.isa?.join(' ')} ${x.component ?? ''}`.toLowerCase().includes(s)))
  }, [cat, q])
  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter: gate, PSV, FC, off-page…" className="h-9 w-64 rounded-md border border-border px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-brand/15" />
          <Chip on={cat === 'all'} onClick={() => setCat('all')}>All</Chip>
          {LIBRARY.categories.map((c) => (
            <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}>
              {c.title}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {shown.map((x) => (
            <button key={x.id} onClick={() => setSel(x)} className={`rounded-xl border p-3 text-left transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(14_26_36/0.18)] ${sel?.id === x.id ? 'border-ink ring-1 ring-ink' : 'border-border'}`}>
              <div className="flex aspect-[4/3] items-center justify-center p-2">
                <img src={librarySymbolUrl(x.svg)} alt="" className="max-h-full max-w-full" />
              </div>
              <div className="mt-2 text-[13px] leading-5 font-medium">{x.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-fg">
                {x.component ? <span className="rounded bg-ink px-1 font-semibold text-white">3D</span> : !x.physical ? <span className="rounded bg-slate-100 px-1">logical</span> : null}
                <span className="truncate">{[...(x.tags ?? []), ...(x.isa ?? [])].join(' · ')}</span>
              </div>
            </button>
          ))}
        </div>
        {!shown.length && <div className="py-16 text-center text-muted-fg">No symbols match.</div>}
      </div>
      <aside className="flex flex-col overflow-hidden rounded-xl border border-border bg-white lg:sticky lg:top-20 lg:h-[calc(100vh-6.5rem)]">
        {sel ? (
          <>
            <div className="shrink-0 border-b border-border p-5 pb-4">
              <div className="flex h-36 items-center justify-center rounded-lg border border-border p-4">
                <img src={librarySymbolUrl(sel.svg)} alt="" className="max-h-full max-w-full" />
              </div>
              <div className="mt-3 text-lg leading-6 font-semibold tracking-tight">{sel.name}</div>
              <div className="mt-0.5 text-xs text-muted-fg">{sel.standard}</div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-[14px]">
              <Field label="Drawn as">{sel.drawn}</Field>
              <Field label="Meaning">{sel.meaning}</Field>
              {sel.variants?.length ? (
                <Field label="Variants">
                  <ul className="list-disc space-y-1 pl-4">
                    {sel.variants.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                </Field>
              ) : null}
              {sel.tags?.length || sel.isa?.length ? <Field label="Tags">{[...(sel.tags ?? []), ...(sel.isa ?? [])].join(' · ')}</Field> : null}
            </div>
            <div className="shrink-0 border-t border-border p-4">
              {sel.component && BY_NAME.get(sel.component) ? (
                <Link href={`/components/${sel.component}`} className="block truncate rounded-md bg-ink px-3 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-ink-2">
                  Open the 3D component: {BY_NAME.get(sel.component)!.title}
                </Link>
              ) : (
                <div className="text-[13px] text-muted-fg">{sel.physical ? 'No 3D component yet.' : 'Not physical hardware. Read it, then skip it in the 3D model.'}</div>
              )}
            </div>
          </>
        ) : (
          <div className="p-5 text-[14px] text-muted-fg">Select a symbol to see how it is drawn, what it means, its variants and the component it maps to.</div>
        )}
      </aside>
    </div>
  )
}

function ByComponent() {
  return (
    <>
      {CATEGORIES.map((c) => {
        const items = byCategory(c.id).filter((i) => PID[i.name])
        if (!items.length) return null
        return (
          <section key={c.id} className="mt-8">
            <h2 className="mb-4 text-[19px] font-semibold text-ink">{c.title}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {items.map((i) => {
                const e = PID[i.name]
                return (
                  <Link key={i.name} href={`/components/${i.name}`} className="group rounded-xl border border-border p-3 transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(14_26_36/0.18)]">
                    <div className="flex aspect-[4/3] items-center justify-center p-2">
                      <img src={symbolUrl(e)} alt="" className="max-h-full max-w-full" />
                    </div>
                    <div className="mt-2 text-[13px] font-medium">{i.title}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted-fg">{[...(e.tags ?? []), ...(e.isa ?? [])].join(' · ')}</div>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[12.5px] font-semibold text-ink">{label}</div>
      <div className="leading-6 text-slate-700">{children}</div>
    </div>
  )
}

function TabButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`-mb-px border-b-2 px-3.5 py-2.5 text-[14px] font-medium transition-colors ${on ? 'border-ink text-ink' : 'border-transparent text-muted-fg hover:text-ink'}`}>
      {children}
    </button>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-border bg-white text-slate-600 hover:border-slate-300 hover:text-ink'}`}>
      {children}
    </button>
  )
}
