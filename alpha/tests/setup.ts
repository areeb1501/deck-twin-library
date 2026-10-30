/**
 * Test setup: the smallest browser surface src/ needs at import in the node environment, plus a seeded
 * Math.random. Node 25 ships a partial `localStorage`, so these are defined rather than filled in.
 *  - window: src/safety/workers.ts and others publish dev globals on it when import.meta.env.DEV is set
 *  - localStorage: src/state/store.ts reads remembered settings at import (in memory here)
 *  - requestAnimationFrame: nothing animates, callbacks never run
 *  - Math.random: src/safety/alerts.ts builds its session id from it
 */
const stored = new Map<string, string>()
const memoryStorage: Storage = {
  get length() {
    return stored.size
  },
  clear: () => stored.clear(),
  getItem: (key) => stored.get(key) ?? null,
  key: (index) => [...stored.keys()][index] ?? null,
  removeItem: (key) => void stored.delete(key),
  setItem: (key, value) => void stored.set(key, String(value)),
}

const define = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
define('window', globalThis)
define('localStorage', memoryStorage)
define('requestAnimationFrame', () => 0)
define('cancelAnimationFrame', () => undefined)

let seed = 0x2f6e2b1
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
