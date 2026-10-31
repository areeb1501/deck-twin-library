/** Runs dryRun.ts off the page, on its own copy of the engine. The engine's modules expect a little of a browser at import, so that goes in first. */
const stored = new Map<string, string>()
Object.assign(globalThis, {
  window: globalThis,
  localStorage: { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v), removeItem: (k: string) => void stored.delete(k) },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => undefined,
})

async function load() {
  await Promise.all([import('../cranes'), import('../maintenance'), import('../../safety/risk'), import('../../safety/alerts'), import('../../safety/inspection'), import('../spares'), import('../finance'), import('../insights'), import('../demoStory')])
  return (await import('./dryRun')).dryRun
}
const ready = load()

self.onmessage = async (e: MessageEvent) => {
  try {
    const run = await ready
    self.postMessage({ report: run(e.data) })
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) })
  }
}
