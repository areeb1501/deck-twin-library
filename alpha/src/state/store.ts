import { create } from 'zustand'
import type { PickData, Vec3 } from '../model/types'

export type LayerId = 'equipment' | 'piping' | 'instruments' | 'structure' | 'ceiling' | 'environment' | 'labels' | 'flow'
export type ViewMode = 'shaded' | 'xray'
export type CameraPreset = 'overview' | 'deck' | 'plan' | 'rack' | 'separator' | 'compressor' | 'underdeck'

export interface FlyTo {
  /** camera position (world) */
  position: Vec3
  /** orbit target (world) */
  target: Vec3
  /** increments so the same request can be re-issued */
  nonce: number
}

interface State {
  selected: PickData | null
  hovered: PickData | null
  viewMode: ViewMode
  layers: Record<LayerId, boolean>
  section: { enabled: boolean; min: Vec3; max: Vec3 }
  flyTo: FlyTo | null
  /** request the camera to frame an item (by tag) */
  focus: { tag: string; nonce: number } | null
  /** request a section box around an item */
  sectionAround: { tag: string; nonce: number } | null
  /** camera preset request */
  preset: { name: CameraPreset; nonce: number } | null
  /** simulated historian clock (s) */
  playing: boolean

  select: (p: PickData | null) => void
  hover: (p: PickData | null) => void
  setViewMode: (m: ViewMode) => void
  toggleLayer: (l: LayerId) => void
  setLayer: (l: LayerId, v: boolean) => void
  setSection: (s: Partial<State['section']>) => void
  requestFlyTo: (position: Vec3, target: Vec3) => void
  requestFocus: (tag: string) => void
  requestSectionAround: (tag: string) => void
  requestPreset: (name: CameraPreset) => void
  setPlaying: (p: boolean) => void
}

let nonce = 0

export const useStore = create<State>((set) => ({
  selected: null,
  hovered: null,
  viewMode: 'shaded',
  layers: {
    equipment: true,
    piping: true,
    instruments: true,
    structure: true,
    ceiling: true,
    environment: true,
    labels: true,
    flow: true,
  },
  section: { enabled: false, min: [-32, -1, -22], max: [32, 14, 22] },
  flyTo: null,
  focus: null,
  sectionAround: null,
  preset: null,
  playing: true,

  select: (p) => set({ selected: p }),
  hover: (p) => set({ hovered: p }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleLayer: (l) => set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  setLayer: (l, v) => set((s) => ({ layers: { ...s.layers, [l]: v } })),
  setSection: (sec) => set((s) => ({ section: { ...s.section, ...sec } })),
  requestFlyTo: (position, target) => set({ flyTo: { position, target, nonce: ++nonce } }),
  requestFocus: (tag) => set({ focus: { tag, nonce: ++nonce } }),
  requestSectionAround: (tag) => set({ sectionAround: { tag, nonce: ++nonce } }),
  requestPreset: (name) => set({ preset: { name, nonce: ++nonce } }),
  setPlaying: (playing) => set({ playing }),
}))

/** World Y of the deck-local origin (top of production deck plate). */
export const DECK_WORLD_Y = 28
