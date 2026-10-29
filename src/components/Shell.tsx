import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'wouter'
import { CATEGORIES, ITEMS, byCategory, thumb } from '../registry'
import { DOCS } from '../pages/docs'
import { VERSION } from '../site'

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
      <Footer />
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
  const [menu, setMenu] = useState(false)
  useEffect(() => setMenu(false), [loc])
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-white/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center px-5 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md pr-2">
          <Logo className="h-[22px] w-[22px]" />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Deck Twin</span>
          <span className="hidden rounded border border-border px-1.5 py-px font-mono text-[10.5px] text-muted-fg lg:inline">v{VERSION}</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-0.5 md:flex lg:ml-6">
          {nav.map(([href, label]) => {
            const on = loc.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors ${on ? 'bg-muted text-ink' : 'text-slate-500 hover:bg-muted/70 hover:text-ink'}`}
              >
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Search />
          <span className="mx-1.5 hidden h-5 w-px bg-border lg:block" />
          <Link href="/docs/installation" className="hidden h-8 items-center rounded-md bg-ink px-3 text-[13px] font-medium text-white transition-colors hover:bg-ink-2 lg:flex">
            Get started
          </Link>
          <button onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu} className="flex h-8 w-8 items-center justify-center rounded-md text-ink transition-colors hover:bg-muted md:hidden">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              {menu ? <path d="m4 4 8 8M12 4l-8 8" /> : <path d="M2.5 5.5h11M2.5 10.5h11" />}
            </svg>
          </button>
        </div>
      </div>
      {menu && (
        <nav className="border-t border-border bg-white px-3 py-2 md:hidden">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={`block rounded-md px-3 py-2.5 text-[15px] font-medium ${loc.startsWith(href) ? 'bg-muted text-ink' : 'text-slate-600'}`}>
              {label}
            </Link>
          ))}
          <Link href="/docs/installation" className="mt-2 mb-1 flex h-10 items-center justify-center rounded-md bg-ink text-[14px] font-medium text-white">
            Get started
          </Link>
        </nav>
      )}
    </header>
  )
}

export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#0e1a24" />
      <path d="M7 22h18M9.5 22v-6h13v6M12.5 16v-4h7v4M16 12V8.5" stroke="#ffffff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="6.5" r="2" fill="#e9a23b" />
    </svg>
  )
}

function Footer() {
  const cols: [string, [string, string][]][] = [
    ['Library', [['/components', 'Components'], ['/symbols', 'P&ID symbols'], ['/examples', 'Example plants'], ['/playground', 'Playground']]],
    ['Docs', [['/docs/installation', 'Installation'], ['/docs/cli', 'CLI'], ['/docs/assemble', 'Assembling plants'], ['/docs/standards', 'Standards & data']]],
    ['For agents', [['/docs/agents', 'Agent skill'], ['/llms.txt', 'llms.txt'], ['/r/index.json', 'Registry index'], ['/prompt.md', 'Setup prompt']]],
  ]
  return (
    <footer className="border-t border-white/10 bg-ink text-slate-300">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-6 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Logo className="h-8 w-8 rounded-lg ring-1 ring-white/15" />
            <span className="text-[15px] font-semibold text-white">Deck Twin</span>
          </div>
          <p className="mt-4 text-[14px] leading-6 text-slate-400">Open-source 3D components for oil &amp; gas digital twins, sized from public engineering standards.</p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <div className="text-[13px] font-semibold text-white">{title}</div>
            <ul className="mt-3 space-y-2 text-[14px]">
              {links.map(([href, label]) => (
                <li key={href}>
                  {href.includes('.') ? (
                    <a href={href} className="text-slate-400 transition-colors hover:text-white">
                      {label}
                    </a>
                  ) : (
                    <Link href={href} className="text-slate-400 transition-colors hover:text-white">
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-2 px-6 py-5 text-[12.5px] text-slate-500">
          <span>MIT licence</span>
          <span>Reference geometry from public standards, not vendor CAD. Check dimensions against the current edition.</span>
        </div>
      </div>
    </footer>
  )
}

function Sidebar() {
  const [loc] = useLocation()
  const item = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={`block truncate rounded-md border-l-2 px-2.5 py-[5px] text-[13.5px] transition-colors ${loc === href ? 'border-brand bg-white font-medium text-ink shadow-[0_1px_2px_rgb(14_26_36/0.06)]' : 'border-transparent text-slate-600 hover:bg-muted hover:text-ink'}`}
    >
      {label}
    </Link>
  )
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[264px] shrink-0 overflow-y-auto border-r border-border bg-muted/40 px-4 py-7 lg:block">
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
    <div className="mb-6">
      <div className="mb-1.5 px-3 text-[12.5px] font-semibold text-ink">{title}</div>
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
        aria-label="Search components"
        className="flex h-8 w-8 items-center justify-center gap-2 rounded-md text-muted-fg transition-colors hover:bg-muted hover:text-ink lg:w-60 lg:justify-start lg:border lg:border-border lg:bg-muted/60 lg:px-2.5 lg:hover:border-slate-300 lg:hover:bg-white"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 lg:h-3.5 lg:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" strokeLinecap="round" />
        </svg>
        <span className="hidden flex-1 text-left text-[13px] lg:inline">Search</span>
        <kbd className="hidden h-5 items-center rounded border border-border bg-white px-1.5 font-sans text-[11px] font-medium text-muted-fg lg:flex">⌘K</kbd>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[2147483000] flex items-start justify-center bg-ink/40 p-4 pt-[18vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
            <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-white shadow-[0_24px_64px_-16px_rgb(14_26_36/0.35)]" onClick={(e) => e.stopPropagation()}>
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
                className="h-13 w-full border-b border-border px-4 text-[15px] outline-none placeholder:text-slate-400"
              />
              <div className="max-h-[50vh] overflow-y-auto p-1.5">
                {hits.map((h, i) => (
                  <button
                    key={h.href}
                    id={`search-hit-${i}`}
                    onMouseMove={() => setActive(i)}
                    onClick={() => pick(h.href)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${i === active ? 'bg-muted text-ink' : 'text-ink'}`}
                  >
                    {h.thumb ? (
                      <img src={h.thumb} alt="" className="h-8 w-10 shrink-0 rounded border border-border bg-stage object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    ) : (
                      <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded border border-border text-[10px] text-muted-fg">doc</span>
                    )}
                    <span className="flex-1 truncate">{h.label}</span>
                    <span className="shrink-0 text-xs text-muted-fg">{h.hint}</span>
                  </button>
                ))}
                {!hits.length && <div className="px-3 py-6 text-center text-sm text-muted-fg">No results.</div>}
              </div>
              <div className="flex gap-4 border-t border-border bg-muted px-4 py-2 text-[11.5px] text-muted-fg">
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
