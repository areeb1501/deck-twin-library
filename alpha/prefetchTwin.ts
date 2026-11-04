import type { Plugin } from 'vite'
import type { OutputBundle, OutputChunk } from 'rollup'

/**
 * The landing page at /alpha/ prefetches the twin's startup chunks while the visitor reads it, so "Explore demo" opens on a
 * warm cache. Only devices that get the full twin (same test as lite/boot.ts) and that haven't asked to save data.
 */
export function prefetchTwin(): Plugin {
  return {
    name: 'prefetch-twin',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !ctx.filename.endsWith('/alpha/index.html')) return html
        const files = startupFiles(ctx.bundle)
        if (!files.length) return html
        const script = `(()=>{const c=navigator.connection;if(c&&(c.saveData||/2g/.test(c.effectiveType||'')))return;const s=Math.min(screen.width,screen.height),t=matchMedia('(pointer: coarse)').matches&&!matchMedia('(any-pointer: fine)').matches;if(s<340||(t&&s<1024))return;const go=()=>{for(const f of ${JSON.stringify(files)}){const l=document.createElement('link');l.rel='prefetch';l.href='/alpha/'+f;document.head.appendChild(l)}};addEventListener('load',()=>(window.requestIdleCallback||setTimeout)(go,{timeout:1500}))})()`
        return html.replace('</body>', `<script>${script}</script>\n  </body>`)
      },
    },
  }
}

/** the demo entry, then everything bridge/ and src/main.tsx need before the first frame: their static imports and CSS */
function startupFiles(bundle: OutputBundle) {
  const chunks = Object.values(bundle).filter((c): c is OutputChunk => c.type === 'chunk')
  const entry = chunks.find((c) => c.isEntry && c.moduleIds.some((m) => m.endsWith('/lite/boot.ts')))
  if (!entry) return []
  const byName = new Map(chunks.map((c) => [c.fileName, c]))
  const out = new Set<string>([entry.fileName])
  const walk = (name: string) => {
    const c = byName.get(name)
    if (!c || out.has(name)) return
    out.add(name)
    for (const css of c.viteMetadata?.importedCss ?? []) out.add(css)
    c.imports.forEach(walk)
  }
  for (const name of entry.dynamicImports) {
    const c = byName.get(name)
    if (c && !c.facadeModuleId?.endsWith('/lite/lite.ts')) walk(name)
  }
  return ['demo-poster.webp', ...out]
}
