import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { CATEGORIES, ITEMS, thumb, type Item } from '../registry'

export function ComponentsIndex() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('all')
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return ITEMS.filter((i) => (cat === 'all' || i.category === cat) && (!s || `${i.title} ${i.name} ${i.description} ${i.tags?.join(' ')} ${i.standards.join(' ')}`.toLowerCase().includes(s)))
  }, [q, cat])
  const cats = CATEGORIES.filter((c) => ITEMS.some((i) => i.category === c.id))
  return (
    <div className="px-6 py-10 lg:px-10">
      <h1 className="text-[34px] leading-tight font-semibold text-ink">Components</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-7 text-slate-600">
        {ITEMS.length} parametric three.js components for offshore and onshore oil &amp; gas plants. Each one is a single file sized from the standard it follows, with ports for wiring pipe.
      </p>
      <div className="z-20 -mx-6 mt-8 sm:sticky sm:top-14 border-y border-border bg-white/90 px-6 py-3 backdrop-blur-xl lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1">
            <span className="sr-only">Filter components</span>
            <svg viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-fg" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by name, tag or standard"
              className="h-9 w-full rounded-md border border-border bg-white pr-8 pl-8.5 text-[13.5px] outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-brand/15"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Clear filter" className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-fg hover:bg-muted hover:text-ink">
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </button>
            )}
          </label>
          <label className="relative">
            <span className="sr-only">Category</span>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-9 cursor-pointer appearance-none rounded-md border border-border bg-white pr-9 pl-3 text-[13.5px] font-medium text-ink outline-none hover:border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-brand/15"
            >
              <option value="all">All categories ({ITEMS.length})</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({ITEMS.filter((i) => i.category === c.id).length})
                </option>
              ))}
            </select>
            <svg viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-fg" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
            </svg>
          </label>
          {(q || cat !== 'all') && (
            <button onClick={() => { setQ(''); setCat('all') }} className="h-9 rounded-md px-2.5 text-[13px] font-medium text-muted-fg transition-colors hover:bg-muted hover:text-ink">
              Reset
            </button>
          )}
          <div className="ml-auto text-[13px] text-muted-fg tabular-nums" aria-live="polite">
            Showing <span className="font-medium text-ink">{shown.length}</span> of {ITEMS.length}
          </div>
        </div>
      </div>
      {CATEGORIES.map((c) => {
        const items = shown.filter((i) => i.category === c.id)
        if (!items.length) return null
        return (
          <section key={c.id} className="mt-10 scroll-mt-32">
            <div className="mb-4">
              <h2 className="flex items-baseline gap-2 text-[19px] font-semibold text-ink">
                {c.title}
                <span className="text-[13px] font-medium text-muted-fg">{items.length}</span>
              </h2>
              <p className="text-[13px] text-muted-fg">{c.blurb}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((i) => (
                <Card key={i.name} item={i} />
              ))}
            </div>
          </section>
        )
      })}
      {!shown.length && (
        <div className="py-20 text-center">
          <div className="text-[15px] font-medium text-ink">No components match “{q}”</div>
          <p className="mt-1 text-[13.5px] text-muted-fg">Try a standard such as API 610, or clear the filter.</p>
        </div>
      )}
    </div>
  )
}

export function Card({ item }: { item: Item }) {
  return (
    <Link href={`/components/${item.name}`} className="group overflow-hidden rounded-xl border border-border bg-white transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(14_26_36/0.18)]">
      <div className="aspect-[4/3] bg-stage">
        <img src={thumb(item.name)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      </div>
      <div className="border-t border-border p-3.5">
        <div className="text-[14px] font-semibold text-ink">{item.title}</div>
        <div className="mt-1 truncate text-[12.5px] text-muted-fg">{item.standards.slice(0, 2).join(', ')}</div>
      </div>
    </Link>
  )
}
