import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'wouter'
import { CATEGORIES, ITEMS, byCategory, themedThumb, thumb } from '../registry'
import { DOCS } from '../pages/docs'
import { CLI, VERSION } from '../site'
import { highlight, prepare, rank } from '../search'
import { useScrollMemory } from '../url'
import { Command, Segmented } from './ui'
import { setTheme, useTheme, type Theme } from '../theme'

export const isDocsRoute = (loc: string) => loc.startsWith('/docs') || loc.startsWith('/components')

// Site shell: the same top header on every route. Marketing pages add the full footer, which waits for the page so it never
// shows alone; docs and component pages add the sidebar and a slim footer.
export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation()
  useScrollMemory()
  const docs = isDocsRoute(loc)
  const [drawer, setDrawer] = useState(false)
  useEffect(() => setDrawer(false), [loc])
  return (
    <div className="flex min-h-full flex-col [--header-h:3.5rem]">
      <Header onDocsMenu={docs ? () => setDrawer(true) : undefined} />
      {docs ? (
        <DocsLayout drawer={drawer} closeDrawer={() => setDrawer(false)}>
          {children}
        </DocsLayout>
      ) : (
        <Suspense fallback={<main className="min-h-[70vh] flex-1" />}>
          <main className="flex-1">{children}</main>
          <Footer />
        </Suspense>
      )}
      <SearchDialog />
    </div>
  )
}

const SIDEBAR_KEY = 'deck-twin-sidebar'
const NAV = [
  ['/docs', 'Docs'],
  ['/components', 'Components'],
  ['/symbols', 'P&ID symbols'],
  ['/examples', 'Examples'],
  ['/playground', 'Playground'],
] as const

function DocsLayout({ drawer, closeDrawer, children }: { drawer: boolean; closeDrawer: () => void; children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === 'closed') setCollapsedState(true)
    } catch {
      /* storage blocked */
    }
  }, [])
  const setCollapsed = (c: boolean) => {
    setCollapsedState(c)
    try {
      if (c) localStorage.setItem(SIDEBAR_KEY, 'closed')
      else localStorage.removeItem(SIDEBAR_KEY)
    } catch {
      /* storage blocked */
    }
  }
  return (
    <div className="flex min-h-0 flex-1">
      {!collapsed && (
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[300px] shrink-0 flex-col border-r border-border bg-deep lg:flex">
          <div className="absolute top-3 right-3 z-10">
            <IconButton label="Collapse sidebar" onClick={() => setCollapsed(true)} icon={<PanelIcon />} />
          </div>
          <SidebarPanel />
        </aside>
      )}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50 light:bg-[rgb(16_18_27/0.3)]" onClick={closeDrawer} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col border-r border-border bg-panel">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <Brand />
              <IconButton label="Close menu" onClick={closeDrawer} icon={<CloseIcon />} />
            </div>
            <SidebarPanel drawer />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {collapsed && (
          <div className="fixed top-[4.25rem] left-3 z-30 hidden lg:block">
            <IconButton label="Expand sidebar" onClick={() => setCollapsed(false)} icon={<PanelIcon />} className="border border-border bg-bg" />
          </div>
        )}
        <main className="flex-1">{children}</main>
        <SlimFooter />
      </div>
    </div>
  )
}

function Brand() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md">
      <Logo className="block h-[22px] w-[22px] shrink-0" />
      <span className="nav-wordmark truncate">Deck Twin</span>
    </Link>
  )
}

function IconButton({ label, onClick, icon, className = '' }: { label: string; onClick: () => void; icon: ReactNode; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-fg transition-colors hover:bg-hover hover:text-ink ${className}`}>
      {icon}
    </button>
  )
}

const svg = { viewBox: '0 0 16 16', className: 'h-4 w-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const PanelIcon = () => (
  <svg {...svg}>
    <rect x="2" y="2.5" width="12" height="11" rx="2" />
    <path d="M6 2.5v11" />
  </svg>
)
const CloseIcon = () => (
  <svg {...svg}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
)

function Header({ onDocsMenu }: { onDocsMenu?: () => void }) {
  const [loc] = useLocation()
  const [menu, setMenu] = useState(false)
  useEffect(() => setMenu(false), [loc])
  const [past, setPast] = useState(false)
  useEffect(() => {
    if (loc !== '/') return setPast(false)
    const check = () => {
      const sheet = document.querySelector('.home .sheet')
      setPast(!!sheet && sheet.getBoundingClientRect().bottom <= 56)
    }
    check()
    addEventListener('scroll', check, { passive: true })
    return () => removeEventListener('scroll', check)
  }, [loc])
  return (
    <header className="site-header sticky top-0 z-40" data-on-sheet={loc === '/' && !past && !menu ? '' : undefined}>
      <div className="flex h-14 items-stretch px-5 lg:px-6">
        <div className="flex shrink-0 items-center pr-2">
          <Brand />
        </div>
        <nav aria-label="Main" className="ml-4 hidden items-stretch gap-1 md:flex lg:ml-7">
          {NAV.map(([href, label]) => {
            const on = loc.startsWith(href)
            return (
              <Link key={href} href={href} aria-current={on ? 'page' : undefined} className="nav-link">
                <span className="nav-text">{label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SearchButton />
          <ThemeToggle />
          <span className="mx-1.5 hidden h-5 w-px bg-border xl:block" />
          <Link href="/docs/installation" className="nav-cta hidden h-8 shrink-0 items-center rounded-md px-3.5 text-[15px] font-medium whitespace-nowrap xl:flex">
            Get started
          </Link>
          <button onClick={() => (onDocsMenu ? onDocsMenu() : setMenu((m) => !m))} aria-label="Menu" aria-expanded={menu} className={`flex h-8 w-8 items-center justify-center rounded-md text-ink transition-colors hover:bg-muted ${onDocsMenu ? 'lg:hidden' : 'md:hidden'}`}>
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              {menu ? <path d="m4 4 8 8M12 4l-8 8" /> : <path d="M2.5 5.5h11M2.5 10.5h11" />}
            </svg>
          </button>
        </div>
      </div>
      {menu && !onDocsMenu && (
        <nav className="border-t border-border bg-panel px-3 py-2 md:hidden">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={`block rounded-md px-3 py-2.5 text-[15px] font-medium ${loc.startsWith(href) ? 'bg-muted text-ink' : 'text-fg-3'}`}>
              {label}
            </Link>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-border px-3 pt-3 pb-1">
            <span className="text-[15px] font-medium text-fg-3">Theme</span>
            <ThemeSwitch />
          </div>
          <Link href="/docs/installation" className="mt-2 mb-1 flex h-10 items-center justify-center rounded-md bg-ink text-[15px] font-medium text-on-ink">
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
      <rect className="logo-mark" width="32" height="32" rx="7" fill="#fe5510" />
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
  const link = 'text-fg-3 transition-colors hover:text-ink'
  return (
    <footer className="bg-deep text-fg-2">
      <section className="sheet">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-end gap-10 px-6 py-16 sm:py-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
          <div>
            <h2 className="display text-[38px] sm:text-[clamp(52px,5.4vw,84px)]">Start building</h2>
            <p className="mt-5 max-w-lg text-[17px] leading-[1.5] font-normal">Install a single component, or give your agent a P&amp;ID to build a complete plant.</p>
          </div>
          <div className="min-w-0 space-y-3">
            <div className="dark-zone">
              <Command cmd={`${CLI} add horizontal-separator`} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/docs/installation" className="sheet-btn solid">
                Get started
              </Link>
              <Link href="/components" className="sheet-btn line">
                Browse {ITEMS.length} components
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-6 gap-y-10 px-6 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="col-span-2 max-w-sm md:col-span-1">
          <div className="flex items-center gap-2.5">
            <Logo className="block h-[22px] w-[22px]" />
            <span className="nav-wordmark">Deck Twin</span>
            <span className="text-[13px] text-muted-fg tabular-nums">v{VERSION}</span>
          </div>
          <p className="mt-4 text-[15px] leading-6 text-fg-3">3D components for oil and gas digital twins, sized to public engineering standards.</p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <div className="text-[15px] font-semibold text-ink">{title}</div>
            <ul className="mt-4 space-y-2.5 text-[15px]">
              {links.map(([href, label]) => (
                <li key={href}>
                  {href.includes('.') ? (
                    <a href={href} className={link}>
                      {label}
                    </a>
                  ) : (
                    <Link href={href} className={link}>
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-2 px-6 py-5 text-[13px] text-muted-fg">
          <span>MIT licence</span>
          <span>Reference geometry based on public standards, not vendor CAD. Verify dimensions against the current edition.</span>
        </div>
      </div>
    </footer>
  )
}

/** Docs tree. In the phone drawer it also carries the site links and the theme switch, which the header hides there. */
function SidebarPanel({ drawer = false }: { drawer?: boolean }) {
  const [loc] = useLocation()
  const ref = useRef<HTMLElement>(null)
  const current = loc.startsWith('/components/') ? ITEMS.find((i) => `/components/${i.name}` === loc)?.category : undefined
  const [open, setOpen] = useState<Set<string>>(() => new Set(current ? [current] : []))
  useEffect(() => {
    if (current) setOpen((o) => (o.has(current) ? o : new Set(o).add(current)))
  }, [current])
  useEffect(() => {
    const nav = ref.current
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && on && (on.offsetTop < nav.scrollTop || on.offsetTop > nav.scrollTop + nav.clientHeight - 40)) nav.scrollTop = on.offsetTop - nav.clientHeight / 3
  }, [loc, open])
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const item = (href: string, label: string, indent = false) => (
    <Link
      key={href}
      href={href}
      aria-current={loc === href ? 'page' : undefined}
      className={`block truncate rounded-lg py-1.5 text-[15px] font-medium transition-colors ${indent ? 'pr-3 pl-6' : 'px-3'} ${loc === href ? 'bg-brand-tint font-medium text-brand' : 'text-fg-3 hover:bg-hover hover:text-ink'}`}
    >
      {label}
    </Link>
  )
  return (
    <>
      <nav ref={ref} aria-label="Docs" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-8">
        {drawer && <div className="md:hidden"><Section title="Site">{NAV.map(([href, label]) => item(href, label))}</Section></div>}
        <Section title="Getting started">{DOCS.map((d) => item(`/docs/${d.slug}`, d.title))}</Section>
        <Section title="Components">
          {item('/components', `All components (${ITEMS.length})`)}
          {CATEGORIES.map((c) => {
            const items = byCategory(c.id)
            if (!items.length) return null
            const expanded = open.has(c.id)
            return (
              <div key={c.id}>
                <button
                  onClick={() => toggle(c.id)}
                  aria-expanded={expanded}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[15px] font-medium transition-colors hover:bg-hover hover:text-ink ${current === c.id ? 'text-ink' : 'text-fg-3'}`}
                >
                  <span className="flex-1 truncate">{c.title}</span>
                  <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 text-muted-fg transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                </button>
                {expanded && <div className="mb-1">{items.map((i) => item(`/components/${i.name}`, i.title, true))}</div>}
              </div>
            )
          })}
        </Section>
      </nav>
      {drawer && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 md:hidden">
          <span className="text-[13px] text-muted-fg">v{VERSION}</span>
          <ThemePicker />
        </div>
      )}
    </>
  )
}

function ThemePicker() {
  const theme = useTheme()
  const opt = (t: Theme, label: string, icon: ReactNode) => (
    <button onClick={() => setTheme(t)} aria-label={label} aria-pressed={theme === t} title={label} className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${theme === t ? 'bg-surface text-ink ring-1 ring-border' : 'text-muted-fg hover:text-ink'}`}>
      {icon}
    </button>
  )
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      {opt(
        'light',
        'Light theme',
        <svg {...svg} className="h-3.5 w-3.5">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
        </svg>,
      )}
      {opt(
        'dark',
        'Dark theme',
        <svg {...svg} className="h-3.5 w-3.5">
          <path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z" />
        </svg>,
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-1 px-3 py-1 text-[15px] font-semibold text-ink">{title}</div>
      {children}
    </div>
  )
}

/** Docs and component pages: one quiet line instead of the full marketing footer. */
function SlimFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-6 text-[13px] text-muted-fg lg:px-12">
        <span>Deck Twin v{VERSION}, MIT licence. Reference geometry based on public standards, not vendor CAD.</span>
        <span className="flex gap-4">
          <a href="/llms.txt" className="hover:text-ink">llms.txt</a>
          <a href="/r/index.json" className="hover:text-ink">Registry</a>
          <Link href="/examples" className="hover:text-ink">Examples</Link>
        </span>
      </div>
    </footer>
  )
}

// Search hint per platform: the Command glyph on Apple devices, Ctrl everywhere else.
const MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent)
const useMac = () => useSyncExternalStore(() => () => {}, () => MAC, () => false)
const OPEN_SEARCH = 'deck-twin:search'
const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH))

let pool: { href: string; label: string; hint: string; thumb: string; prep: ReturnType<typeof prepare> }[] | null = null
/** Ranked hits across docs and components; the header search and the 404 page share it. */
export function searchSite(q: string) {
  pool ??= [
    ...DOCS.map((d) => ({ href: `/docs/${d.slug}`, label: d.title, hint: 'Docs', thumb: '', prep: prepare({ title: d.title, slug: d.slug, keys: ['docs'] }) })),
    ...ITEMS.map((i) => ({ href: `/components/${i.name}`, label: i.title, hint: CATEGORIES.find((c) => c.id === i.category)?.title ?? i.category, thumb: thumb(i.name), prep: prepare({ title: i.title, slug: i.name, keys: [i.category, ...(i.tags ?? []), ...i.standards], body: [i.description, ...(i.vendors ?? [])] }) })),
  ]
  return rank(pool, (h) => h.prep, (h) => h.label, q)
}

const searchIcon = (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" strokeLinecap="round" />
  </svg>
)
function Keycaps() {
  const mac = useMac()
  return (
    <span className="ml-auto flex gap-1">
      {[mac ? '⌘' : 'Ctrl', 'K'].map((k) => (
        <kbd key={k} className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface px-1 font-sans text-[13px] font-medium text-muted-fg">
          {k}
        </kbd>
      ))}
    </span>
  )
}

/** Opens the one search dialog: a compact field on wide screens, an icon on narrow ones. */
function SearchButton() {
  const mac = useMac()
  return (
    <button onClick={openSearch} aria-label="Search docs and components" aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'} className="flex h-8 w-8 items-center justify-center gap-2 rounded-md text-muted-fg transition-colors hover:bg-muted hover:text-ink lg:w-44 lg:justify-start lg:rounded-md lg:border lg:border-border lg:bg-muted/60 lg:px-3 lg:hover:border-line-strong lg:hover:bg-hover xl:w-56">
      {searchIcon}
      <span className="hidden text-left text-[15px] font-medium lg:inline">Search</span>
      <span className="hidden lg:contents">
        <Keycaps />
      </span>
    </button>
  )
}

function SearchDialog() {
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
    const show = () => setOpen(true)
    // a link from outside the app: /?search=1 opens the dialog
    const url = new URL(location.href)
    if (url.searchParams.has('search')) {
      setOpen(true)
      url.searchParams.delete('search')
      history.replaceState(null, '', url)
    }
    window.addEventListener('keydown', on)
    window.addEventListener(OPEN_SEARCH, show)
    return () => (window.removeEventListener('keydown', on), window.removeEventListener(OPEN_SEARCH, show))
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
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[2147483000] flex items-start justify-center bg-black/60 p-4 pt-[18vh] light:bg-[rgb(16_18_27/0.28)]" onClick={() => setOpen(false)}>
            <div className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-panel shadow-[0_24px_64px_-16px_rgb(0_0_0/0.7)] light:shadow-[0_24px_64px_-16px_rgb(16_18_27/0.3)]" onClick={(e) => e.stopPropagation()}>
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
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[15px] ${i === active ? 'bg-muted text-ink' : 'text-ink'}`}
                  >
                    {h.thumb ? (
                      <img src={themedThumb(h.thumb, theme)} alt="" className="h-8 w-10 shrink-0 rounded border border-border bg-stage object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    ) : (
                      <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded border border-border text-[13px] text-muted-fg">doc</span>
                    )}
                    <span className="flex-1 truncate">{markHits(h.label, q)}</span>
                    <span className="shrink-0 text-[13px] text-muted-fg">{h.hint}</span>
                  </button>
                ))}
                {!hits.length && <div className="px-3 py-6 text-center text-[15px] text-muted-fg">No results.</div>}
              </div>
              <div className="flex gap-4 border-t border-border bg-muted px-4 py-2 text-[13px] text-muted-fg">
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
