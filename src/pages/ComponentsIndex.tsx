import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { CATEGORIES, ITEMS, thumb, type Item } from '../registry'
import { FilterInput, Select, Toolbar } from '../components/ui'

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
      <div className="mt-8">
        <Toolbar shown={shown.length} total={ITEMS.length} onReset={q || cat !== 'all' ? () => { setQ(''); setCat('all') } : undefined}>
          <FilterInput value={q} onChange={setQ} placeholder="Filter by name, tag or standard" className="w-full sm:w-auto sm:max-w-sm sm:flex-1" />
          <Select
            value={cat}
            onChange={setCat}
            label="Category"
            options={[{ value: 'all', label: `All categories (${ITEMS.length})` }, ...cats.map((c) => ({ value: c.id, label: `${c.title} (${ITEMS.filter((i) => i.category === c.id).length})` }))]}
          />
        </Toolbar>
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
