import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { marked } from 'marked'
import { highlight } from 'sugar-high'
import { DOCS, loadDoc } from './docs'

marked.use({
  renderer: {
    code({ text, lang }) {
      const body = lang === 'tsx' || lang === 'ts' || lang === 'json' || lang === 'jsx' ? highlight(text) : text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      return `<pre><code>${body}</code></pre>`
    },
  },
})

export function DocPage({ slug }: { slug: string }) {
  const [md, setMd] = useState('')
  const [, go] = useLocation()
  useEffect(() => {
    loadDoc(slug).then(setMd)
  }, [slug])
  const html = useMemo(() => marked.parse(md) as string, [md])
  const i = DOCS.findIndex((d) => d.slug === slug)
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 lg:px-10">
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
      <div className="mt-14 flex justify-between border-t border-border pt-6 text-sm">
        {i > 0 ? <Link href={`/docs/${DOCS[i - 1].slug}`} className="text-muted-fg hover:text-fg">← {DOCS[i - 1].title}</Link> : <span />}
        {i >= 0 && i < DOCS.length - 1 ? <Link href={`/docs/${DOCS[i + 1].slug}`} className="text-muted-fg hover:text-fg">{DOCS[i + 1].title} →</Link> : <span />}
      </div>
    </div>
  )
}
