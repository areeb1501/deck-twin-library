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
  return (
    <div className="px-6 py-10 lg:px-10">
      <h1 className="text-[34px] leading-tight font-semibold text-ink">Components</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-7 text-slate-600">
        {ITEMS.length} parametric three.js components for offshore and onshore oil &amp; gas plants. Each one is a single file sized from the standard it follows, with ports for wiring pipe.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, tag or standard" className="h-9 w-72 rounded-md border border-border bg-white px-3 text-sm shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-brand/15" />
        <Chip on={cat === 'all'} onClick={() => setCat('all')}>All</Chip>
        {CATEGORIES.filter((c) => ITEMS.some((i) => i.category === c.id)).map((c) => (
          <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}>
            {c.title}
          </Chip>
        ))}
      </div>
      {CATEGORIES.map((c) => {
        const items = shown.filter((i) => i.category === c.id)
        if (!items.length) return null
        return (
          <section key={c.id} className="mt-12">
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
      {!shown.length && <div className="py-20 text-center text-muted-fg">Nothing matches “{q}”.</div>}
    </div>
  )
}

export function Card({ item }: { item: Item }) {
  return (
    <Link href={`/components/${item.name}`} className="group overflow-hidden rounded-xl border border-border bg-white transition-shadow transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(14_26_36/0.18)]">
      <div className="aspect-[4/3] bg-stage">
        <img src={thumb(item.name)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      </div>
      <div className="border-t border-border p-3.5">
        <div className="text-[14px] font-semibold text-ink transition-colors group-hover:text-ink">{item.title}</div>
        <div className="mt-1 truncate text-[12.5px] text-muted-fg">{item.standards.slice(0, 2).join(', ')}</div>
      </div>
    </Link>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-border bg-white text-slate-600 hover:border-slate-300 hover:text-ink'}`}>
      {children}
    </button>
  )
}
