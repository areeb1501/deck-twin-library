import { useMemo } from 'react'
import { Link } from 'wouter'
import { CATEGORIES, ITEMS, thumb, type Item } from '../registry'
import { Combobox, FilterInput, Select, Toolbar } from '../components/ui'
import { useQueryState } from '../url'
import { useTheme } from '../theme'
import { usePageMeta } from '../meta'

// Supplier names are free text: group brands under their company ("SLB (Cameron)", "Emerson Fisher" → "SLB", "Emerson") and skip non-suppliers.
const raw = (i: Item) => (i.vendors ?? []).filter((v) => !/^fabricated/i.test(v)).map((v) => v.replace(/\s*\(.*\)\s*$/, '').trim())
const NAMES = [...new Set(ITEMS.flatMap(raw))]
const PARENT = new Map(NAMES.map((n) => [n, NAMES.filter((p) => n.startsWith(p + ' ')).sort((a, b) => a.length - b.length)[0] ?? n]))
const companiesOf = (i: Item) => [...new Set(raw(i).map((n) => PARENT.get(n) ?? n))]
const SUPPLIERS = (() => {
  const n = new Map<string, number>()
  for (const i of ITEMS) for (const c of companiesOf(i)) n.set(c, (n.get(c) ?? 0) + 1)
  return [...n].sort((a, b) => a[0].localeCompare(b[0])).map(([c, count]) => ({ value: c, label: c, count }))
})()

export function ComponentsIndex() {
  usePageMeta('Components', `${ITEMS.length} parametric three.js components for oil & gas plants: piping, valves, vessels, rotating equipment, wellheads and more, sized from public engineering standards.`)
  const [q, setQ] = useQueryState('q', '')
  const [cat, setCat] = useQueryState('category', 'all')
  const [supplier, setSupplier] = useQueryState('supplier', '')
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return ITEMS.filter(
      (i) =>
        (cat === 'all' || i.category === cat) &&
        (!supplier || companiesOf(i).includes(supplier)) &&
        (!s || `${i.title} ${i.name} ${i.description} ${i.tags?.join(' ')} ${i.standards.join(' ')} ${i.vendors?.join(' ')}`.toLowerCase().includes(s)),
    )
  }, [q, cat, supplier])
  const cats = CATEGORIES.filter((c) => ITEMS.some((i) => i.category === c.id))
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10 lg:px-10">
      <h1 className="text-[34px] leading-tight font-semibold head-grad tracking-[-0.035em]">Components</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-7 text-fg-3">
        {ITEMS.length} parametric three.js components for offshore and onshore oil &amp; gas plants. Each one is a single file sized from the standard it follows, with ports for wiring pipe.
      </p>
      <div className="mt-8">
        <Toolbar shown={shown.length} total={ITEMS.length} onReset={q || cat !== 'all' || supplier ? () => { setQ(''); setCat('all'); setSupplier('') } : undefined}>
          <FilterInput value={q} onChange={setQ} placeholder="Filter by name, tag or standard" className="w-full sm:w-auto sm:max-w-sm sm:flex-1" />
          <Select
            value={cat}
            onChange={setCat}
            label="Category"
            options={[{ value: 'all', label: `All categories (${ITEMS.length})` }, ...cats.map((c) => ({ value: c.id, label: `${c.title} (${ITEMS.filter((i) => i.category === c.id).length})` }))]}
          />
          <Combobox value={supplier} onChange={setSupplier} label="Typical supplier" allLabel="Any supplier" placeholder="Search typical suppliers" options={SUPPLIERS} />
        </Toolbar>
        {supplier && (
          <p className="mt-3 text-[13px] text-muted-fg">
            Showing components that <span className="font-medium text-ink">{supplier}</span> typically supplies. The geometry is generic and sized from public standards, not vendor CAD.
          </p>
        )}
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
  const theme = useTheme()
  return (
    <Link href={`/components/${item.name}`} className="group overflow-hidden rounded-xl border border-border bg-surface transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)]">
      <div className="aspect-[4/3] bg-stage">
        <img src={thumb(item.name, theme)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      </div>
      <div className="border-t border-border p-3.5">
        <div className="text-[14px] font-semibold text-ink">{item.title}</div>
        <div className="mt-1 truncate text-[12.5px] text-muted-fg">{item.standards.slice(0, 2).join(', ')}</div>
      </div>
    </Link>
  )
}
