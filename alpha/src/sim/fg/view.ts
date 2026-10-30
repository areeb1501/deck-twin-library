/** F&G mapping view state shared by the heatmap overlay, its legend and the F&G panel. */
import { create } from 'zustand'

export type FgLevel = 'all' | -8 | 0 | 10 | 18
export const FG_LEVELS: { id: FgLevel; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: -8, label: 'Cellar' },
  { id: 0, label: 'Main' },
  { id: 10, label: 'Weather' },
  { id: 18, label: 'Drill floor' },
]

interface FgView {
  /** heatmap: flame (geographic) or gas (scenario) coverage */
  mode: 'flame' | 'gas'
  /** which deck level's zones to draw */
  level: FgLevel
  setMode: (m: FgView['mode']) => void
  setLevel: (l: FgLevel) => void
}

export const useFgView = create<FgView>((set) => ({
  mode: 'flame',
  // one deck at a time by default: zones on different decks overlap in plan
  level: 0,
  setMode: (mode) => set({ mode }),
  setLevel: (level) => set({ level }),
}))

if (import.meta.env.DEV) Object.assign(window, { __fgView: useFgView })
