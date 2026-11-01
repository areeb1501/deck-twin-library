/**
 * Which model drives the agents: Muse Spark through the operator's own connection (agents/scenarioAuthor.ts holds the key and
 * the running cost), or the local planner, which needs no key and is what runs until one is saved.
 */
import { create } from 'zustand'

export type ProviderId = 'sim' | 'muse'

const KEY = 'deck-twin.provider'

interface ProviderStore {
  provider: ProviderId
  setProvider: (p: ProviderId) => void
  /** why the last model call failed, shown by the panel; the answer came from the local planner instead */
  error: string | null
}

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  sim: 'Simulated (local, offline)',
  muse: 'Meta Muse Spark',
}

export const useProvider = create<ProviderStore>((set) => ({
  provider: typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'sim' ? 'sim' : 'muse',
  setProvider: (provider) => {
    localStorage.setItem(KEY, provider)
    set({ provider, error: null })
  },
  error: null,
}))
