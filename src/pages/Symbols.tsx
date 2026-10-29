import { useMemo, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { BY_NAME, CATEGORIES, byCategory } from '../registry'
import { LIBRARY, PID, librarySymbolUrl, symbolUrl } from '../pid'
import type { LibrarySymbol } from '../../registry/pid/types'
import { Crumbs, FilterInput, Segmented, Select, Toolbar } from '../components/ui'
import { useQueryState } from '../url'

export function Symbols() {
  const [tab, setTab] = useQueryState<'legend' | 'components'>('view', LIBRARY.symbols.length ? 'legend' : 'components')
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10">
      <h1 className="text-[34px] leading-tight font-semibold head-grad tracking-[-0.035em]">P&amp;ID symbols</h1>
      <p className="mt-2 max-w-3xl text-[15px] leading-7 text-zinc-400">
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

const has3d = (x: LibrarySymbol) => !!(x.component && BY_NAME.get(x.component))

function Legend() {
  const [cat, setCat] = useQueryState('category', 'all')
  const [q, setQ] = useQueryState('q', '')
  const [model, setModel] = useQueryState<'all' | '3d' | 'none'>('model', 'all')
  const [selId, setSelId] = useQueryState('symbol', '')
  const sel = useMemo(() => LIBRARY.symbols.find((x) => x.id === selId) ?? null, [selId])
  const setSel = (x: LibrarySymbol | null) => setSelId(x?.id ?? '')
  const [, navigate] = useLocation()
  // below lg the side panel sits under the whole grid, so a symbol opens its own page (Back restores scroll and filters)
  const open = (x: LibrarySymbol) => (matchMedia('(min-width: 1024px)').matches ? setSel(x) : navigate(`/symbols/${encodeURIComponent(x.id)}`))
  const base = useMemo(() => {
    const s = q.trim().toLowerCase()
    return LIBRARY.symbols.filter((x) => (cat === 'all' || x.category === cat) && (!s || `${x.name} ${x.id} ${x.meaning} ${x.drawn} ${x.tags?.join(' ')} ${x.isa?.join(' ')} ${x.component ?? ''}`.toLowerCase().includes(s)))
  }, [cat, q])
  const with3d = base.filter(has3d).length
  const shown = model === 'all' ? base : base.filter((x) => has3d(x) === (model === '3d'))
  const dirty = q || cat !== 'all' || model !== 'all'
  return (
    <div className="mt-6">
      <Toolbar shown={shown.length} total={LIBRARY.symbols.length} onReset={dirty ? () => { setQ(''); setCat('all'); setModel('all') } : undefined}>
        <FilterInput value={q} onChange={setQ} placeholder="Filter: gate, PSV, FC, off-page" className="w-full sm:w-auto sm:max-w-xs sm:flex-1" />
        <Select
          value={cat}
          onChange={setCat}
          label="Symbol category"
          options={[{ value: 'all', label: `All categories (${LIBRARY.symbols.length})` }, ...LIBRARY.categories.map((c) => ({ value: c.id, label: `${c.title} (${LIBRARY.symbols.filter((x) => x.category === c.id).length})` }))]}
        />
        <Segmented
          value={model}
          onChange={setModel}
          label="3D model"
          options={[
            { value: 'all', label: 'All', count: base.length },
            { value: '3d', label: 'Has 3D model', count: with3d },
            { value: 'none', label: 'Symbol only', count: base.length - with3d },
          ]}
        />
      </Toolbar>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {shown.map((x) => (
              <button key={x.id} onClick={() => open(x)} className={`rounded-xl border p-3 text-left transition-[border-color,box-shadow] hover:border-white/20 hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)] ${sel?.id === x.id ? 'border-ink ring-1 ring-ink' : 'border-border'}`}>
                <div className="flex aspect-[4/3] items-center justify-center p-2">
                  <img src={librarySymbolUrl(x.svg)} alt="" className="sym max-h-full max-w-full" />
                </div>
                <div className="mt-2 text-[13px] leading-5 font-medium">{x.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-fg">
                  {has3d(x) ? <span className="rounded bg-ink px-1 font-semibold text-on-ink">3D</span> : !x.physical ? <span className="rounded bg-white/10 px-1">logical</span> : null}
                  <span className="truncate">{[...(x.tags ?? []), ...(x.isa ?? [])].join(' · ')}</span>
                </div>
              </button>
            ))}
          </div>
          {!shown.length && (
            <div className="py-16 text-center">
              <div className="text-[15px] font-medium text-ink">No symbols match these filters</div>
              <p className="mt-1 text-[13.5px] text-muted-fg">Change the category or the 3D model filter, or clear the search.</p>
            </div>
          )}
        </div>
        <aside className="hidden flex-col overflow-hidden rounded-xl border border-border bg-surface lg:sticky lg:flex lg:top-[8.5rem] lg:h-[calc(100vh-10rem)]">
          {sel ? (
            <SymbolDetail sel={sel} />
          ) : (
            <div className="p-5 text-[14px] text-muted-fg">Select a symbol to see how it is drawn, what it means, its variants and the component it maps to.</div>
          )}
        </aside>
      </div>
    </div>
  )
}

/** The selected symbol: drawing, meaning, variants and its 3D component. Shared by the desktop side panel and the phone page. */
function SymbolDetail({ sel }: { sel: LibrarySymbol }) {
  return (
    <>
      <div className="shrink-0 border-b border-border p-5 pb-4">
        <div className="flex h-36 items-center justify-center rounded-lg border border-border p-4">
          <img src={librarySymbolUrl(sel.svg)} alt="" className="sym max-h-full max-w-full" />
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
          <Link href={`/components/${sel.component}`} className="block truncate rounded-full bg-ink px-3 py-2 text-center text-[13px] font-semibold text-on-ink transition-colors hover:bg-ink-2">
            Open the 3D component: {BY_NAME.get(sel.component)!.title}
          </Link>
        ) : (
          <div className="text-[13px] text-muted-fg">{sel.physical ? 'No 3D component yet.' : 'Not physical hardware. Read it, then skip it in the 3D model.'}</div>
        )}
      </div>
    </>
  )
}

/** /symbols/:id: one symbol on its own page. Phones and small tablets open this instead of the side panel. */
export function SymbolPage({ id }: { id: string }) {
  const sel = LIBRARY.symbols.find((x) => x.id === decodeURIComponent(id))
  const cat = LIBRARY.categories.find((c) => c.id === sel?.category)
  return (
    <div className="mx-auto max-w-[720px] px-6 py-6 lg:py-10">
      <Crumbs items={[{ label: 'P&ID symbols', href: '/symbols' }, ...(cat ? [{ label: cat.title, href: `/symbols?category=${cat.id}` }] : []), { label: sel?.name ?? 'Not found' }]} />
      {sel ? (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <SymbolDetail sel={sel} />
        </div>
      ) : (
        <div className="py-16 text-center">
          <div className="text-[15px] font-medium text-ink">Symbol not found</div>
          <p className="mt-1 text-[13.5px] text-muted-fg">It may have been renamed. Go back to the full legend.</p>
        </div>
      )}
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
                  <Link key={i.name} href={`/components/${i.name}`} className="group rounded-xl border border-border p-3 transition-[border-color,box-shadow] hover:border-white/20 hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)]">
                    <div className="flex aspect-[4/3] items-center justify-center p-2">
                      <img src={symbolUrl(e)} alt="" className="sym max-h-full max-w-full" />
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[12.5px] font-semibold text-ink">{label}</div>
      <div className="leading-6 text-zinc-300">{children}</div>
    </div>
  )
}

function TabButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`-mb-px border-b-2 px-3.5 py-2.5 text-[14px] font-medium transition-colors ${on ? 'border-ink text-ink' : 'border-transparent text-muted-fg hover:text-ink'}`}>
      {children}
    </button>
  )
}
