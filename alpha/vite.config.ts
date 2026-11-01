import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { LLM_ROUTE, llmRoute } from './llm-route.js'
import { META_SAM_ROUTE, metaSamRoute } from './meta-sam-route.js'
import { META_VIDEO_ROUTE, metaVideoRoute } from './meta-sam-video-route.js'
import { SAM_ROUTE, samRoute } from './sam-route.js'

/**
 * Private /alpha copy of the Deck Twin app (see README.md in this folder). Builds with base /alpha/ straight
 * into ../public/alpha, so the library's normal `npm run build` / `npm run deploy` carries it along.
 * The dev-only snapshot and LLM-proxy plugins are left out: on Cloudflare the agents fall back to `sim`.
 *
 * Optional password gate, same as the Vercel build: set DEMO_PASSWORD in the environment (or alpha/.env.local)
 * when building. Only a salted PBKDF2 hash goes into the bundle. Unset means no gate.
 */
const GATE_ITER = 150_000

function demoGate(env: Record<string, string>, serve: boolean) {
  const pw = env.DEMO_PASSWORD
  if (!pw || serve) return null
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(pw, salt, GATE_ITER, 32, 'sha256').toString('hex')
  return { salt: salt.toString('hex'), hash, iter: GATE_ITER }
}

/** the Worker's routes on the dev server. Modal's SAM key comes from ../modal/.env.local (never sent to the browser); the operator's own keys come with each request */
function samDevRoute(): Plugin {
  const env = loadEnv('', new URL('../modal', import.meta.url).pathname, 'DECK_TWIN_')
  return {
    name: 'sam-dev-route',
    apply: 'serve',
    configureServer(server) {
      const mount = (route: string, handle: (r: Request) => Promise<Response>) =>
        server.middlewares.use(route, async (req, res) => {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>
          const body = req.method === 'POST' ? Buffer.concat(chunks) : undefined
          const gone = new AbortController()
          res.on('close', () => gone.abort())
          const r = await handle(new Request(`http://${req.headers.host}${route}`, { method: req.method, headers, body, signal: gone.signal }))
          res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/json' })
          // a model's answer arrives token by token, so it is passed on as it comes
          try {
            for await (const chunk of r.body ?? []) res.write(chunk)
          } catch {
            /* the browser went away */
          }
          res.end()
        })
      mount(SAM_ROUTE, (r) => samRoute(r, env))
      mount(META_SAM_ROUTE, (r) => metaSamRoute(r, {}))
      mount(META_VIDEO_ROUTE, (r) => metaVideoRoute(r, {}))
      mount(LLM_ROUTE, (r) => llmRoute(r, {}))
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, new URL('.', import.meta.url).pathname, ''), ...process.env } as Record<string, string>
  return {
    base: '/alpha/',
    plugins: [react(), samDevRoute()],
    // bridge/ reaches into ../registry, whose imports would otherwise resolve to a second React and three.js
    resolve: { dedupe: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'] },
    // media lives in R2 behind the site's Worker, and the landing search reads the site's index and thumbnails, so dev reads the live copies
    server: {
      fs: { allow: ['..'] },
      proxy: Object.fromEntries(['/alpha/media'].map((path) => [path, { target: 'https://deck-twin-library.demoareeb.workers.dev', changeOrigin: true }])),
    },
    define: { __DEMO_GATE__: JSON.stringify(demoGate(env, command === 'serve')) },
    build: {
      outDir: '../dist/alpha',
      emptyOutDir: true,
      chunkSizeWarningLimit: 4000,
      // the landing page at /alpha/ and the twin at /alpha/demo/
      rollupOptions: { input: { landing: 'index.html', demo: 'demo/index.html' } },
    },
  }
})
