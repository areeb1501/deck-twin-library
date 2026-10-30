// Renders the home page into dist/home.html after the build, so `/` has real content before any JavaScript runs. The Worker serves it at `/`.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createElement, StrictMode } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { createServer } from 'vite'
import { Router } from 'wouter'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const URL = 'https://decktwin.com/'
const TITLE = 'Deck Twin: 3D components for oil & gas digital twins'
const DESCRIPTION = 'Standards-based three.js components for oil & gas digital twins. Copy, paste, assemble.'
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

const vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false } })
const { App } = await vite.ssrLoadModule('/src/App.tsx')
const app = createElement(StrictMode, null, createElement(Router, { ssrPath: '/', children: createElement(App) }))
const body = await new Promise<string>((resolve, reject) => {
  let html = ''
  const sink = new Writable({
    write(chunk, _, done) {
      html += chunk
      done()
    },
    final(done) {
      resolve(html)
      done()
    },
  })
  // The large chunk size keeps the page inline: React otherwise hides big sections until a script reveals them.
  const { pipe } = renderToPipeableStream(app, { progressiveChunkSize: Number.MAX_SAFE_INTEGER, onAllReady: () => pipe(sink), onError: reject })
})
await vite.close()

const head = [
  `<link rel="canonical" href="${URL}" />`,
  '<meta property="og:type" content="website" />',
  `<meta property="og:url" content="${URL}" />`,
  `<meta property="og:title" content="${escape(TITLE)}" />`,
  `<meta property="og:description" content="${escape(DESCRIPTION)}" />`,
  '<meta name="twitter:card" content="summary" />',
  `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Deck Twin', url: URL, description: DESCRIPTION })}</script>`,
].join('\n    ')
const template = readFileSync(join(root, 'dist/index.html'), 'utf8')
if (!template.includes('<div id="root"></div>') || !body.includes('<h1')) throw new Error('prerender-home: the home page did not render')
writeFileSync(join(root, 'dist/home.html'), template.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`).replace('</head>', () => `  ${head}\n  </head>`))
process.exit(0)
