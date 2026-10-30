/**
 * Plants loaded from a file, kept in this browser (plan 14) so they survive a reload. The file itself is stored in
 * IndexedDB, because a plant can outgrow localStorage's quota, and it goes back through importPlant() on restore, so
 * a saved plant is checked exactly like a new one. localStorage holds only the name of the one on screen.
 */
import { create } from 'zustand'
import type { Plant } from '../model/types'
import { importPlant, useImportNotes } from './plantFormats'
import { usePlantStore } from './plantStore'
import { useStore } from './store'

const DB = 'deck-twin'
const STORE = 'plants'
const ACTIVE = 'deck-twin.plant.active'
const BUILDER_ACTIVE = 'deck-twin.builder.active'

interface Row {
  name: string
  raw: unknown
  savedAt: number
}

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'name' })
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      const r = op(t.objectStore(STORE))
      t.oncomplete = () => resolve(r.result)
      t.onabort = t.onerror = () => reject(t.error)
    })
  } finally {
    db.close()
  }
}

const readActive = () => {
  try {
    return localStorage.getItem(ACTIVE)
  } catch {
    return null
  }
}
const writeActive = (name: string | null) => {
  try {
    if (name) localStorage.setItem(ACTIVE, name)
    else localStorage.removeItem(ACTIVE)
  } catch {
    /* storage blocked: the plant just won't come back after a reload */
  }
}

/** Names for the plant menu. */
export const useSavedPlants = create<{ names: string[]; active: string | null; refresh: () => Promise<void> }>((set) => ({
  names: [],
  active: readActive(),
  refresh: async () => {
    const names = (await tx('readonly', (s) => s.getAllKeys()).catch(() => [])) as string[]
    set({ names: names.sort((a, b) => a.localeCompare(b)), active: readActive() })
  },
}))

function setActive(name: string | null) {
  writeActive(name)
  useSavedPlants.setState({ active: name })
}

/** Put a plant on screen, clearing what belonged to the last one. */
export function showPlant(p: Plant) {
  const st = useStore.getState()
  st.select(null)
  st.setSection({ enabled: false })
  usePlantStore.getState().setPlant(p)
  // a custom renderer frames the plant itself, once it has measured it
  if (!p.custom) setTimeout(() => st.requestPreset(p.deck.site === 'onshore' ? 'deck' : 'overview'), 50)
}

/** Keep a file in this browser and remember it as the plant on screen. Returns false when the browser refused. */
export async function savePlant(name: string, raw: unknown) {
  try {
    await tx('readwrite', (s) => s.put({ name, raw, savedAt: Date.now() } satisfies Row))
    setActive(name)
    await useSavedPlants.getState().refresh()
    return true
  } catch {
    return false
  }
}

export async function openSaved(name: string) {
  const row = (await tx('readonly', (s) => s.get(name))) as Row | undefined
  if (!row) throw new Error(`"${name}" is no longer saved in this browser.`)
  const r = await importPlant(row.raw)
  if (r.plant) setActive(name)
  return r
}

export async function removeSaved(name: string) {
  await tx('readwrite', (s) => s.delete(name))
  if (readActive() === name) setActive(null)
  await useSavedPlants.getState().refresh()
}

/** A built-in plant went on screen: the saved ones stay in the list, but a reload should open this one. */
export const clearActiveSaved = () => setActive(null)

/** Start-up: bring back the plant that was on screen. Reopening in the Builder takes precedence. */
export async function restoreSavedPlant() {
  await useSavedPlants.getState().refresh()
  const name = readActive()
  if (!name) return
  try {
    if (localStorage.getItem(BUILDER_ACTIVE) === '1') return
  } catch {
    /* storage blocked */
  }
  try {
    const r = await openSaved(name)
    if (!r.plant) throw new Error(r.errors[0] ?? 'it no longer loads')
    usePlantStore.getState().setPlant(r.plant)
    useImportNotes.getState().set(r.warnings)
    if (!r.plant.custom) setTimeout(() => useStore.getState().requestPreset(r.plant!.deck.site === 'onshore' ? 'deck' : 'overview'), 400)
  } catch (e) {
    setActive(null)
    useImportNotes.getState().set([], `Couldn't reopen "${name}": ${(e as Error).message}`)
  }
}
