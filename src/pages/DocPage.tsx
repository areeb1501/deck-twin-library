import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { marked } from 'marked'
import { highlight } from 'sugar-high'
import { DOCS, loadDoc } from './docs'
import { NotFound } from './NotFound'

marked.use({
  renderer: {
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

export function DocPage({ slug }: { slug: string }) {
  if (!DOCS.some((d) => d.slug === slug)) return <NotFound what="doc" />
  return <Doc slug={slug} />
}

function Doc({ slug }: { slug: string }) {
  const [md, setMd] = useState('')
  const [, go] = useLocation()
  useEffect(() => {
    loadDoc(slug).then(setMd)
  }, [slug])
  const html = useMemo(() => marked.parse(md) as string, [md])
  const i = DOCS.findIndex((d) => d.slug === slug)
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 lg:px-10">
      <article
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
      <div className="mt-16 grid gap-4 border-t border-border pt-8 sm:grid-cols-2">
        {i > 0 ? <Pager href={`/docs/${DOCS[i - 1].slug}`} hint="Previous" title={DOCS[i - 1].title} /> : <span />}
        {i >= 0 && i < DOCS.length - 1 ? <Pager href={`/docs/${DOCS[i + 1].slug}`} hint="Next" title={DOCS[i + 1].title} right /> : <span />}
      </div>
    </div>
  )
}

function Pager({ href, hint, title, right }: { href: string; hint: string; title: string; right?: boolean }) {
  return (
    <Link href={href} className={`group rounded-lg border border-border px-4 py-3 transition-colors hover:border-white/20 hover:bg-muted ${right ? 'text-right' : ''}`}>
      <div className="text-[12.5px] text-muted-fg">{hint}</div>
      <div className="mt-0.5 text-[15px] font-semibold text-ink group-hover:text-ink">{title}</div>
    </Link>
  )
}
