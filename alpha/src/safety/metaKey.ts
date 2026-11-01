/**
 * The operator's API keys, kept in this browser (modal/PLAN.md): the Meta Model API key, and one per scenario author provider.
 * IndexedDB holds each encrypted under an AES key the page can use but never read out, so a copy of the browser's storage
 * doesn't reveal it. Code running on this page could still ask for a decrypt, so this protects the key at rest, and the page
 * itself carries no third-party scripts.
 */
const DB = 'deck-twin-secrets'
const STORE = 'keys'
export const META_KEY = 'meta-model-api'

interface Sealed {
  secret: CryptoKey
  iv: Uint8Array<ArrayBuffer>
  data: ArrayBuffer
}

const open = () =>
  new Promise<IDBDatabase>((done, fail) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => done(r.result)
    r.onerror = () => fail(r.error)
  })

async function inStore<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((done, fail) => {
      const r = act(db.transaction(STORE, mode).objectStore(STORE))
      r.onsuccess = () => done(r.result)
      r.onerror = () => fail(r.error)
    })
  } finally {
    db.close()
  }
}

/** what a pasted key looks like once trimmed, or null. A curl line copied whole still works */
export function cleanKey(raw: string): string | null {
  const key = raw.trim().replace(/^bearer\s+/i, '')
  return /^[\x21-\x7e]{8,512}$/.test(key) ? key : null
}

export async function saveKey(key: string, id = META_KEY) {
  const secret = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secret, new TextEncoder().encode(key))
  await inStore('readwrite', (s) => s.put({ secret, iv, data } satisfies Sealed, id))
}

export async function loadKey(id = META_KEY): Promise<string | null> {
  const sealed = await inStore<Sealed | undefined>('readonly', (s) => s.get(id))
  if (!sealed) return null
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, sealed.secret, sealed.data))
}

export const hasKey = async (id = META_KEY) => (await inStore<number>('readonly', (s) => s.count(id))) > 0

export const forgetKey = (id = META_KEY) => inStore('readwrite', (s) => s.delete(id))
