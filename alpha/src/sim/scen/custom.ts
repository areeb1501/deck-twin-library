/** Scenarios a user made with the model (agents/scenarioAuthor.ts), kept in localStorage as specs. The runner checks one again before it starts, because what is stored can have been edited or can predate a plant change. */
import { create } from 'zustand'
import { compile } from './compile'
import type { ScenarioSpec } from './spec'
import type { Scenario } from './types'

export interface ChatLine {
  id: string
  role: 'user' | 'assistant' | 'check'
  text: string
  /** the scenario this reply carried, as the model wrote it */
  specJson?: string
}

export interface SavedScenario {
  id: string
  spec: ScenarioSpec
  /** what wrote it, for the label on the card and the briefing */
  model: string
  /** the account that saved it */
  by?: string
  chat: ChatLine[]
  createdAt: string
  updatedAt: string
}

const KEY = 'deckTwin.customScenarios.v1'

function read(): SavedScenario[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    const list = raw ? (JSON.parse(raw) as SavedScenario[]) : []
    return Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string' && x.spec && typeof x.spec === 'object') : []
  } catch {
    return []
  }
}

/** false when the browser is out of room, so the caller can say so */
function write(items: SavedScenario[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
    return true
  } catch {
    return false
  }
}

function compiled(items: SavedScenario[]) {
  const out: Record<string, Scenario> = {}
  for (const x of items) {
    try {
      out[x.id] = compile({ ...x.spec, id: x.id })
    } catch {
      /* left out of the list: a stored spec this version can't read */
    }
  }
  return out
}

interface CustomStore {
  items: SavedScenario[]
  compiled: Record<string, Scenario>
  /** adds or replaces; false when it could not be stored */
  put: (x: SavedScenario) => boolean
  remove: (id: string) => void
}

export const useCustom = create<CustomStore>((set, get) => {
  const items = read()
  const store = (next: SavedScenario[]) => {
    const ok = write(next)
    if (ok) set({ items: next, compiled: compiled(next) })
    return ok
  }
  return {
    items,
    compiled: compiled(items),
    put: (x) => store([x, ...get().items.filter((y) => y.id !== x.id)]),
    remove: (id) => void store(get().items.filter((y) => y.id !== id)),
  }
})

export const newScenarioId = (title: string) => `custom:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'scenario'}-${Date.now().toString(36)}`
