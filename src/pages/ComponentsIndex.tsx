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
      <h1 className="text-3xl font-semibold tracking-tight">Components</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-zinc-600">
        {ITEMS.length} parametric three.js components for offshore and onshore oil &amp; gas plants. Each one is a single file sized from the standard it follows, with ports for wiring pipe.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="h-9 w-64 rounded-md border border-border px-3 text-sm outline-none focus:border-zinc-400" />
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
          <section key={c.id} className="mt-10">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight">{c.title}</h2>
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
    <Link href={`/components/${item.name}`} className="group overflow-hidden rounded-xl border border-border bg-white transition-shadow hover:shadow-md">
      <div className="aspect-[4/3] bg-[#f3f4f5]">
        <img src={thumb(item.name)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      </div>
      <div className="border-t border-border p-3.5">
        <div className="text-sm font-medium">{item.title}</div>
        <div className="mt-0.5 truncate text-xs text-muted-fg">{item.standards.slice(0, 2).join(' · ')}</div>
      </div>
    </Link>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`h-8 rounded-full border px-3 text-[13px] ${on ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-border text-zinc-600 hover:text-fg'}`}>
      {children}
    </button>
  )
}
