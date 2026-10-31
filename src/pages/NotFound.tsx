// 404: say what was missing, search the library from the bad URL, and point to the main sections.
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { EXAMPLES } from '../plants'
import { ITEMS, themedThumb } from '../registry'
import { LIBRARY } from '../pid'
import { DOCS } from './docs'
import { markHits, searchSite } from '../components/Shell'
import { useTheme } from '../theme'
import { usePageMeta } from '../meta'

const guess = (path: string) => decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '').replace(/[-_.]+/g, ' ').trim()

export function NotFound({ what = 'page' }: { what?: string }) {
  usePageMeta('Page not found', 'This page could not be found. Search the Deck Twin library or choose a section.')
  const theme = useTheme()
  const [path, go] = useLocation()
  const [q, setQ] = useState(() => guess(path))
  const [active, setActive] = useState(0)
  // A mistyped slug rarely matches as a whole, so fall back to the words that do.
  const hits = useMemo(() => {
    if (!q.trim()) return []
    const all = searchSite(q)
    const loose = all.length ? all : q.split(/\s+/).filter((w) => w.length > 2).flatMap((w) => searchSite(w))
    return [...new Map(loose.map((h) => [h.href, h])).values()].slice(0, 6)
  }, [q])
  useEffect(() => setActive(0), [q])
  const places = [
    ['/components', 'Components', `${ITEMS.length} parametric 3D components`],
    ['/symbols', 'P&ID symbols', `${LIBRARY.symbols.length} symbols and their components`],
    ['/examples', 'Example plants', `${EXAMPLES.length} complete example plants`],
    ['/docs', 'Docs', `${DOCS.length} guides, from installation to agents`],
  ] as const
  return (
    <div className="mx-auto flex max-w-[640px] flex-col px-6 py-20 sm:py-28">
      <h1 className="display text-[32px] sm:text-[44px] text-ink">{what[0].toUpperCase() + what.slice(1)} not found</h1>
      <p className="mt-3 text-[15px] leading-7 text-fg-3">
        We could not find <code className="rounded border border-border bg-muted px-1 py-px font-mono text-[13px] text-ink">{path}</code>. The link may be out of date or mistyped. Search below or choose a section.
      </p>

      <div className="mt-8 overflow-hidden rounded-lg border border-border bg-surface focus-within:border-line-strong focus-within:ring-2 focus-within:ring-brand/15">
        <label className="flex items-center gap-3 px-4">
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted-fg" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Search components and docs</span>
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
              } else if (e.key === 'Enter' && hits[active]) go(hits[active].href)
            }}
            placeholder="Search components and docs (e.g. gate valve, API 610)"
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-fg"
          />
        </label>
        {q.trim() && (
          <div className="border-t border-border p-1.5">
            {hits.map((h, i) => (
              <Link
                key={h.href}
                href={h.href}
                onMouseMove={() => setActive(i)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-[15px] text-ink ${i === active ? 'bg-muted' : ''}`}
              >
                {h.thumb ? (
                  <img src={themedThumb(h.thumb, theme)} alt="" className="h-8 w-10 shrink-0 rounded border border-border bg-stage object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                ) : (
                  <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded border border-border text-[13px] text-muted-fg">doc</span>
                )}
                <span className="flex-1 truncate">{markHits(h.label, q)}</span>
                <span className="shrink-0 text-[13px] text-muted-fg">{h.hint}</span>
              </Link>
            ))}
            {!hits.length && <div className="px-3 py-4 text-[15px] text-muted-fg">No matches for “{q}”. Try a broader word, or browse a section below.</div>}
          </div>
        )}
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {places.map(([href, title, hint]) => (
          <Link key={href} href={href} className="group rounded-lg border border-border px-4 py-3.5 light:bg-surface transition-colors hover:border-line-strong">
            <div className="flex items-center justify-between text-[15px] font-semibold text-ink">
              {title}
            </div>
            <div className="mt-0.5 text-[13px] text-muted-fg">{hint}</div>
          </Link>
        ))}
      </div>
      <Link href="/" className="mt-8 self-start text-[15px] font-medium text-brand hover:underline hover:underline-offset-4">
        Back to the home page
      </Link>
    </div>
  )
}
