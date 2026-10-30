// Renders every sitemap page to its own HTML file in dist, so each URL has real content, a title and a canonical before any JavaScript runs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const SITE = 'https://decktwin.com'
const NOT_FOUND = '/404'
const CANONICAL: Record<string, string> = { '/docs': '/docs/introduction' }

const { render } = await import(pathToFileURL(join(root, 'node_modules/.prerender/entry-prerender.js')).href)
const template = readFileSync(join(dist, 'index.html'), 'utf8')
const sitemap = [...readFileSync(join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeURI(m[1].slice(SITE.length)))
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const file = (path: string) => join(dist, path === '/' ? 'index.html' : `${path}.html`)

function head(path: string, title: string, description: string) {
  if (path === NOT_FOUND) return '<meta name="robots" content="noindex" />'
  const url = `${SITE}${CANONICAL[path] ?? (path === '/' ? '/' : path)}`
  return [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    '<meta name="twitter:card" content="summary" />',
    ...(path === '/' ? [`<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Deck Twin', url: `${SITE}/`, description })}</script>`] : []),
  ].join('\n    ')
}

const pages = [...sitemap, '/docs', NOT_FOUND]
for (const path of pages) {
  const failed = (why: unknown) => new Error(`prerender: ${path} failed: ${why instanceof Error ? why.message : why}`)
  const { html, meta } = await render(path).catch((e: unknown) => {
    throw failed(e)
  })
  if (!meta) throw failed('the page did not call usePageMeta')
  if (!html.includes('<h1')) throw failed('no h1 in the output')
  const page = template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(meta.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${escape(meta.description)}" />`)
    .replace('</head>', () => `  ${head(path, meta.title, meta.description)}\n  </head>`)
    .replace('<div id="root"></div>', () => `<div id="root" data-page="${path}">${html}</div>`)
  mkdirSync(dirname(file(path)), { recursive: true })
  writeFileSync(file(path), page)
}
console.log(`✓ prerender: ${pages.length} pages`)
process.exit(0)
