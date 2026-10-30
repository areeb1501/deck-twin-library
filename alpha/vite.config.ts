import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { pbkdf2Sync, randomBytes } from 'node:crypto'

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

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, new URL('.', import.meta.url).pathname, ''), ...process.env } as Record<string, string>
  return {
    base: '/alpha/',
    plugins: [react()],
    define: { __DEMO_GATE__: JSON.stringify(demoGate(env, command === 'serve')) },
    build: { outDir: '../public/alpha', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  }
})
