// Build-time entry: renders one route to HTML for scripts/prerender.ts.
import { StrictMode } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import { Router } from 'wouter'
import { App } from './App'
import { takePageMeta } from './meta'

export async function render(path: string) {
  const errors: unknown[] = []
  // The large chunk size keeps the page inline: React otherwise hides big sections until a script reveals them.
  const stream = await renderToReadableStream(
    <StrictMode>
      <Router ssrPath={path} ssrSearch="">
        <App />
      </Router>
    </StrictMode>,
    {
      progressiveChunkSize: Number.MAX_SAFE_INTEGER,
      onError: (e) => {
        errors.push(e)
      },
    },
  )
  await stream.allReady
  const html = await new Response(stream).text()
  if (errors.length) throw errors[0]
  return { html, meta: takePageMeta() }
}
