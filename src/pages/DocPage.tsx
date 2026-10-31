// Docs page: markdown bundled with the entry chunk and parsed in one pass, with copy / view as markdown and an "On this page" rail.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Link, useLocation } from 'wouter'
import { marked, type Tokens } from 'marked'
import { highlight } from 'sugar-high'
import { CopyMarkdown, ViewMarkdown } from '../components/ui'
import { DOCS, docSource } from './docs'
import { usePageMeta } from '../meta'

const NotFound = lazy(() => import('./NotFound').then((m) => ({ default: m.NotFound })))

let seen = new Map<string, number>()
const slug = (text: string) => {
  const base = text.toLowerCase().replace(/<[^>]+>|`/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'
  const n = seen.get(base) ?? 0
  seen.set(base, n + 1)
  return n ? `${base}-${n}` : base
}

marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      return `<h${depth} id="${slug(text)}">${this.parser.parseInline(tokens)}</h${depth}>`
    },
    code({ text, lang }) {
      const body = lang === 'tsx' || lang === 'ts' || lang === 'json' || lang === 'jsx' ? highlight(text) : text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      return `<pre><code>${body}</code></pre>`
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens)
      const t = title ? ` title="${title}"` : ''
      if (!/^https?:\/\//.test(href)) return `<a href="${href}"${t}>${text}</a>`
      return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer" class="ext">${text}<span class="sr-only"> (opens in a new tab)</span></a>`
    },
  },
})

function render(md: string) {
  seen = new Map()
  const toc = marked
    .lexer(md)
    .filter((t): t is Tokens.Heading => t.type === 'heading')
    .map((h) => ({ depth: h.depth, text: h.text.replace(/`/g, ''), id: slug(h.text) }))
    .filter((h) => h.depth === 2 || h.depth === 3)
  seen = new Map()
  // the page title sits in its own row beside the markdown buttons, so it is lifted out of the body
  const h1 = /^# (.+)\n/.exec(md)
  return { title: h1 ? (marked.parseInline(h1[1]) as string) : '', html: marked.parse(h1 ? md.slice(h1[0].length) : md) as string, toc }
}

export function DocPage({ slug }: { slug: string }) {
  if (!DOCS.some((d) => d.slug === slug))
    return (
      <Suspense fallback={<div className="min-h-[70vh]" />}>
        <NotFound what="doc" />
      </Suspense>
    )
  return <Doc slug={slug} />
}

function Doc({ slug }: { slug: string }) {
  const md = docSource(slug)
  const { title, html, toc } = useMemo(() => render(md), [md])
  const [, go] = useLocation()
  const article = useRef<HTMLElement>(null)
  const active = useActiveHeading(article, html)
  const i = DOCS.findIndex((d) => d.slug === slug)
  usePageMeta(DOCS[i].title, md.replace(/```[\s\S]*?```/g, '').split('\n').find((line) => /^[A-Za-z`]/.test(line)) ?? '')
  return (
    <div className="mx-auto flex max-w-[1180px] gap-12 px-6 pt-10 pb-16 lg:px-12 lg:pt-16">
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h1 className="display text-[34px] sm:text-[40px] text-ink" dangerouslySetInnerHTML={{ __html: title }} />
            <div className="flex shrink-0 gap-2">
              <CopyMarkdown md={md} />
              <ViewMarkdown href={`/docs/${slug}.md`} />
            </div>
          </div>
          <article
            ref={article}
            className="prose-docs"
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={(e) => {
              const a = (e.target as HTMLElement).closest('a')
              const href = a?.getAttribute('href')
              if (href?.startsWith('/') && !href.startsWith('/r/') && !href.endsWith('.txt') && !href.endsWith('.md') && !href.endsWith('.json')) {
                e.preventDefault()
                go(href)
              }
            }}
          />
          <div className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
            {i > 0 ? <Pager href={`/docs/${DOCS[i - 1].slug}`} hint="Previous" title={DOCS[i - 1].title} /> : <span />}
            {i >= 0 && i < DOCS.length - 1 ? <Pager href={`/docs/${DOCS[i + 1].slug}`} hint="Next" title={DOCS[i + 1].title} right /> : <span />}
          </div>
        </div>
      </div>
      {toc.length > 1 && (
        <nav aria-label="On this page" className="sticky top-[var(--header-h,0px)] hidden h-fit max-h-[calc(100vh-var(--header-h,0px))] w-52 shrink-0 overflow-y-auto pt-4 pb-10 xl:block">
          <div className="mb-3 text-[13px] font-semibold text-ink">On this page</div>
          <ul className="space-y-0.5 border-l border-border">
            {toc.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    history.replaceState(history.state, '', `#${h.id}`)
                  }}
                  className={`-ml-px block border-l py-1 text-[13px] leading-5 transition-colors ${h.depth === 3 ? 'pl-6' : 'pl-3'} ${active === h.id ? 'border-brand font-medium text-ink' : 'border-transparent text-muted-fg hover:text-ink'}`}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}

/** The h2 / h3 nearest the top of the viewport, for the rail's highlight. */
function useActiveHeading(article: RefObject<HTMLElement | null>, html: string) {
  const [active, setActive] = useState('')
  useEffect(() => {
    const heads = [...(article.current?.querySelectorAll<HTMLElement>('h2[id], h3[id]') ?? [])]
    if (!heads.length) return
    setActive(heads[0].id)
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive((top.target as HTMLElement).id)
      },
      { rootMargin: '-64px 0px -70% 0px' },
    )
    heads.forEach((h) => io.observe(h))
    return () => io.disconnect()
  }, [article, html])
  return active
}

function Pager({ href, hint, title, right }: { href: string; hint: string; title: string; right?: boolean }) {
  return (
    <Link href={href} className={`group rounded-lg border border-border px-4 py-3 transition-colors hover:border-line-strong ${right ? 'text-right' : ''}`}>
      <div className="text-[12.5px] text-muted-fg">{hint}</div>
      <div className="mt-0.5 text-[15px] font-semibold text-ink">{title}</div>
    </Link>
  )
}
