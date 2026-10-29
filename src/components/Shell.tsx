import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'wouter'
import { CATEGORIES, ITEMS, byCategory, thumb } from '../registry'
import { DOCS } from '../pages/docs'

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation()
  const withSidebar = loc.startsWith('/docs') || loc.startsWith('/components')
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc])
  return (
    <div className="min-h-full">
      <Header />
      {withSidebar ? (
        <div className="mx-auto flex max-w-[1440px]">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      ) : (
        <main>{children}</main>
      )}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-6 py-6 text-[13px] text-muted-fg">
          <span>Deck Twin. Open-source 3D components for oil &amp; gas digital twins.</span>
          <span>Reference geometry built from public standards. Not vendor CAD. Verify dimensions against the current edition.</span>
        </div>
      </footer>
    </div>
  )
}

function Header() {
  const [loc] = useLocation()
  const nav = [
    ['/docs', 'Docs'],
    ['/components', 'Components'],
    ['/symbols', 'P&ID symbols'],
    ['/examples', 'Examples'],
    ['/playground', 'Playground'],
  ] as const
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span>Deck Twin</span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm md:flex">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={loc.startsWith(href) ? 'text-fg' : 'text-muted-fg transition-colors hover:text-fg'}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Search />
          <a href="/llms.txt" className="hidden rounded-md px-2 py-1 font-mono text-xs text-muted-fg hover:bg-muted hover:text-fg sm:block">
            llms.txt
          </a>
        </div>
      </div>
    </header>
  )
}

export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#0a0a0a" />
      <path d="M7 21h18M9 21v-6h14v6M12 15v-4h8v4M16 11V7" stroke="#fafafa" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Sidebar() {
  const [loc] = useLocation()
  const item = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={`block truncate rounded-md px-2 py-1 text-[13px] ${loc === href ? 'bg-muted font-medium text-fg' : 'text-muted-fg hover:text-fg'}`}
    >
      {label}
    </Link>
  )
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-border px-4 py-6 lg:block">
      <Section title="Getting started">{DOCS.map((d) => item(`/docs/${d.slug}`, d.title))}</Section>
      <Section title="Components">{item('/components', `All components (${ITEMS.length})`)}</Section>
      {CATEGORIES.map((c) => {
        const items = byCategory(c.id)
        if (!items.length) return null
        return (
          <Section key={c.id} title={c.title}>
            {items.map((i) => item(`/components/${i.name}`, i.title))}
          </Section>
        )
      })}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-1 px-2 text-xs font-semibold text-fg">{title}</div>
      {children}
    </div>
  )
}

function Search() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [, go] = useLocation()
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  const [active, setActive] = useState(0)
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    const all = ITEMS.map((i) => ({ href: `/components/${i.name}`, label: i.title, hint: CATEGORIES.find((c) => c.id === i.category)?.title ?? i.category, thumb: thumb(i.name), text: `${i.title} ${i.name} ${i.category} ${i.tags?.join(' ')} ${i.standards.join(' ')}`.toLowerCase() }))
    const docs = DOCS.map((d) => ({ href: `/docs/${d.slug}`, label: d.title, hint: 'Docs', thumb: '', text: `${d.title} docs`.toLowerCase() }))
    const pool = s ? [...all, ...docs] : [...docs, ...all]
    return (s ? pool.filter((h) => s.split(/\s+/).every((w) => h.text.includes(w))) : pool).slice(0, 40)
  }, [q])
  useEffect(() => setActive(0), [q, open])
  useEffect(() => {
    document.getElementById(`search-hit-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])
  const pick = (href: string) => {
    go(href)
    setOpen(false)
    setQ('')
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-40 items-center justify-between rounded-md border border-border bg-muted/50 px-2.5 text-[13px] text-muted-fg hover:bg-muted sm:w-56"
      >
        <span>Search components…</span>
        <kbd className="rounded border border-border bg-white px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[2147483000] flex items-start justify-center bg-black/25 p-4 pt-[22vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
            <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActive((a) => Math.min(a + 1, hits.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActive((a) => Math.max(a - 1, 0))
                  } else if (e.key === 'Enter' && hits[active]) pick(hits[active].href)
                }}
                placeholder="Search by name, tag or standard (e.g. API 610)"
                className="h-12 w-full border-b border-border px-4 text-sm outline-none"
              />
              <div className="max-h-[50vh] overflow-y-auto p-1.5">
                {hits.map((h, i) => (
                  <button
                    key={h.href}
                    id={`search-hit-${i}`}
                    onMouseMove={() => setActive(i)}
                    onClick={() => pick(h.href)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${i === active ? 'bg-muted' : ''}`}
                  >
                    {h.thumb ? (
                      <img src={h.thumb} alt="" className="h-8 w-10 shrink-0 rounded border border-border bg-[#f3f4f5] object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    ) : (
                      <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded border border-border text-[10px] text-muted-fg">doc</span>
                    )}
                    <span className="flex-1 truncate">{h.label}</span>
                    <span className="shrink-0 text-xs text-muted-fg">{h.hint}</span>
                  </button>
                ))}
                {!hits.length && <div className="px-3 py-6 text-center text-sm text-muted-fg">No results.</div>}
              </div>
              <div className="flex gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-fg">
                <span>↑↓ to move</span>
                <span>↵ to open</span>
                <span>esc to close</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
