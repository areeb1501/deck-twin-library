import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'wouter'
import { CATEGORIES, ITEMS, byCategory, themedThumb, thumb } from '../registry'
import { DOCS } from '../pages/docs'
import { CLI, VERSION } from '../site'
import { highlight, prepare, rank } from '../search'
import { useScrollMemory } from '../url'
import { Command, Segmented } from './ui'
import { setTheme, useTheme, type Theme } from '../theme'

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation()
  const withSidebar = loc.startsWith('/docs') || loc.startsWith('/components')
  useScrollMemory()
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      {withSidebar ? (
        <div className="flex flex-1">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </div>
      ) : (
        <>
          <main className="flex-1">{children}</main>
          <Footer />
        </>
      )}
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
    <header className="sticky top-0 z-40 border-b border-border bg-bg/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="flex h-14 items-center px-5 lg:px-6">
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
                className={`rounded-md px-2.5 py-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors ${on ? 'bg-muted text-ink' : 'text-fg-3 hover:bg-muted/70 hover:text-ink'}`}
              >
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Search />
          <ThemeToggle />
          <span className="mx-1.5 hidden h-5 w-px bg-border lg:block" />
          <Link href="/docs/installation" className="hidden h-8 items-center rounded-full bg-ink px-3.5 text-[13px] font-medium text-on-ink transition-colors hover:bg-ink-2 lg:flex">
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
        <nav className="border-t border-border bg-panel px-3 py-2 md:hidden">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={`block rounded-md px-3 py-2.5 text-[15px] font-medium ${loc.startsWith(href) ? 'bg-muted text-ink' : 'text-fg-3'}`}>
              {label}
            </Link>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-border px-3 pt-3 pb-1">
            <span className="text-[14px] font-medium text-fg-3">Theme</span>
            <ThemeSwitch />
          </div>
          <Link href="/docs/installation" className="mt-2 mb-1 flex h-10 items-center justify-center rounded-full bg-ink text-[14px] font-medium text-on-ink">
            Get started
          </Link>
        </nav>
      )}
    </header>
  )
}

function ThemeToggle() {
  const theme = useTheme()
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-fg transition-colors hover:bg-muted hover:text-ink md:flex">
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {theme === 'dark' ? (
          <>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
          </>
        ) : (
          <path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z" />
        )}
      </svg>
    </button>
  )
}

function ThemeSwitch() {
  const theme = useTheme()
  return (
    <Segmented
      label="Theme"
      value={theme}
      onChange={setTheme}
      options={[
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
      ]}
    />
  )
}

export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#fe5510" />
      <path d="M7 22h18M9.5 22v-6h13v6M12.5 16v-4h7v4M16 12V8.5" stroke="#ffffff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="6.5" r="2" fill="#ffffff" />
    </svg>
  )
}

function Footer() {
  const cols: [string, [string, string][]][] = [
    ['Library', [['/components', 'Components'], ['/symbols', 'P&ID symbols'], ['/examples', 'Example plants'], ['/playground', 'Playground']]],
    ['Docs', [['/docs/installation', 'Installation'], ['/docs/cli', 'CLI'], ['/docs/assemble', 'Assembling plants'], ['/docs/standards', 'Standards & data']]],
    ['For agents', [['/docs/agents', 'Agent skill'], ['/llms.txt', 'llms.txt'], ['/r/index.json', 'Registry index'], ['/prompt.md', 'Setup prompt']]],
  ]
  const link = 'group inline-flex items-center gap-1.5 text-fg-3 transition-colors hover:text-white light:hover:text-ink'
  const arrow = <span aria-hidden className="text-brand-soft opacity-0 transition-[opacity,transform] -translate-x-1 group-hover:translate-x-0 group-hover:opacity-100">→</span>
  return (
    <footer className="relative isolate overflow-hidden bg-deep text-fg-2 [container-type:inline-size]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-soft/60 to-transparent" />
        <div className="footer-light absolute inset-0" />
        <div className="grain absolute inset-0" />
      </div>
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 border-b border-border py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-16">
          <div>
            <div className="text-[13px] font-medium text-brand-soft">Open source, MIT licence</div>
            <h2 className="mt-2 text-[28px] leading-tight font-semibold text-balance head-grad tracking-[-0.03em] sm:text-[36px]">From one valve to a whole platform.</h2>
            <p className="mt-3 max-w-lg text-[15px] leading-7 text-fg-3">Copy a component into your project, or hand your agent a P&amp;ID and let it assemble the plant.</p>
          </div>
          <div className="min-w-0 space-y-3">
            <Command cmd={`${CLI} add horizontal-separator`} />
            <div className="flex flex-wrap gap-2.5">
              <Link href="/docs/installation" className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-on-ink transition-colors hover:bg-ink-2">
                Get started
              </Link>
              <Link href="/components" className="inline-flex h-10 items-center rounded-full border border-white/15 bg-white/[0.04] px-5 text-[14px] font-medium text-white transition-colors hover:border-white/30 hover:bg-hover light:border-line-strong light:bg-surface light:text-ink light:hover:border-ink/35 light:hover:bg-surface">
                Browse {ITEMS.length} components
              </Link>
            </div>
          </div>
        </div>
        <div className="grid gap-10 py-12 sm:grid-cols-2 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <Logo className="h-8 w-8 rounded-lg ring-1 ring-white/15 light:ring-border" />
              <span className="text-[15px] font-semibold text-white light:text-ink">Deck Twin</span>
              <span className="rounded border border-border px-1.5 py-px font-mono text-[10.5px] text-fg-3">v{VERSION}</span>
            </div>
            <p className="mt-4 text-[14px] leading-6 text-fg-3">3D components for oil &amp; gas digital twins, sized from public engineering standards.</p>
          </div>
          {cols.map(([title, links]) => (
            <div key={title}>
              <div className="text-[12px] font-semibold tracking-[0.08em] text-fg-3 uppercase">{title}</div>
              <ul className="mt-4 space-y-2.5 text-[14px]">
                {links.map(([href, label]) => (
                  <li key={href}>
                    {href.includes('.') ? (
                      <a href={href} className={link}>
                        {label}
                        {arrow}
                      </a>
                    ) : (
                      <Link href={href} className={link}>
                        {label}
                        {arrow}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="pointer-events-none -mt-2 overflow-hidden px-6 select-none">
        <div className="mx-auto max-w-[1440px] translate-y-[22%] bg-gradient-to-b from-white/[0.09] to-transparent light:from-ink/[0.07] bg-clip-text text-center text-[16cqw] leading-[0.8] font-semibold tracking-[-0.05em] whitespace-nowrap text-transparent">Deck Twin</div>
      </div>
      <div className="relative border-t border-border bg-deep/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-2 px-6 py-5 text-[12.5px] text-fg-3">
          <span>MIT licence</span>
          <span>Reference geometry from public standards, not vendor CAD. Check dimensions against the current edition.</span>
        </div>
      </div>
    </footer>
  )
}

function Sidebar() {
  const [loc] = useLocation()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const aside = ref.current
    const on = aside?.querySelector<HTMLElement>('[aria-current="page"]')
    if (aside && on && (on.offsetTop < aside.scrollTop || on.offsetTop > aside.scrollTop + aside.clientHeight - 40)) aside.scrollTop = on.offsetTop - aside.clientHeight / 3
  }, [loc])
  const item = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={loc === href ? 'page' : undefined}
      className={`block truncate rounded-md border-l-2 px-2.5 py-[5px] text-[13.5px] transition-colors ${loc === href ? 'border-brand bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'border-transparent text-fg-3 hover:bg-muted hover:text-ink'}`}
    >
      {label}
    </Link>
  )
  return (
    <aside ref={ref} className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[264px] shrink-0 overflow-y-auto overscroll-contain border-r border-border bg-muted px-4 pt-7 pb-20 [mask-image:linear-gradient(to_bottom,#000_calc(100%-56px),transparent)] lg:block">
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

let pool: { href: string; label: string; hint: string; thumb: string; prep: ReturnType<typeof prepare> }[] | null = null
/** Ranked hits across docs and components; the header search and the 404 page share it. */
export function searchSite(q: string) {
  pool ??= [
    ...DOCS.map((d) => ({ href: `/docs/${d.slug}`, label: d.title, hint: 'Docs', thumb: '', prep: prepare({ title: d.title, slug: d.slug, keys: ['docs'] }) })),
    ...ITEMS.map((i) => ({ href: `/components/${i.name}`, label: i.title, hint: CATEGORIES.find((c) => c.id === i.category)?.title ?? i.category, thumb: thumb(i.name), prep: prepare({ title: i.title, slug: i.name, keys: [i.category, ...(i.tags ?? []), ...i.standards], body: [i.description, ...(i.vendors ?? [])] }) })),
  ]
  return rank(pool, (h) => h.prep, (h) => h.label, q)
}

function Search() {
  const theme = useTheme()
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
  const hits = useMemo(() => searchSite(q), [q])
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
        className="flex h-8 w-8 items-center justify-center gap-2 rounded-md text-muted-fg transition-colors hover:bg-muted hover:text-ink lg:w-60 lg:justify-start lg:border lg:border-border lg:bg-muted/60 lg:px-2.5 lg:hover:border-line-strong lg:hover:bg-hover"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 lg:h-3.5 lg:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" strokeLinecap="round" />
        </svg>
        <span className="hidden flex-1 text-left text-[13px] lg:inline">Search</span>
        <kbd className="hidden h-5 items-center rounded border border-border bg-surface px-1.5 font-sans text-[11px] font-medium text-muted-fg lg:flex">⌘K</kbd>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[2147483000] flex items-start justify-center bg-black/60 p-4 pt-[18vh] backdrop-blur-sm light:bg-[rgb(16_18_27/0.28)]" onClick={() => setOpen(false)}>
            <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-panel shadow-[0_24px_64px_-16px_rgb(0_0_0/0.7)] light:shadow-[0_24px_64px_-16px_rgb(16_18_27/0.3)]" onClick={(e) => e.stopPropagation()}>
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
                className="h-13 w-full border-b border-border px-4 text-[15px] outline-none placeholder:text-muted-fg"
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
                      <img src={themedThumb(h.thumb, theme)} alt="" className="h-8 w-10 shrink-0 rounded border border-border bg-stage object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    ) : (
                      <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded border border-border text-[10px] text-muted-fg">doc</span>
                    )}
                    <span className="flex-1 truncate">{markHits(h.label, q)}</span>
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

export function markHits(label: string, q: string) {
  const parts: ReactNode[] = []
  let at = 0
  for (const [a, b] of highlight(label, q)) {
    parts.push(label.slice(at, a), <mark key={a} className="bg-transparent font-semibold text-ink">{label.slice(a, b)}</mark>)
    at = b
  }
  parts.push(label.slice(at))
  return parts
}
