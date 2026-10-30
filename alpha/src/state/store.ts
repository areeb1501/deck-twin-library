import { create } from 'zustand'
import type { PickData, Vec3 } from '../model/types'

/** walkthrough third-person camera distance behind the person, m: closest, default, farthest, and the cap indoors */
export const WALK_DIST = { min: 2.2, def: 3.6, max: 8, indoorMax: 3 }

export type LayerId = 'equipment' | 'piping' | 'instruments' | 'structure' | 'ceiling' | 'environment' | 'labels' | 'flow' | 'fireGas' | 'fgCoverage' | 'hazAreas'
export type ViewMode = 'shaded' | 'xray'
export type CameraPreset = 'overview' | 'deck' | 'plan' | 'rack' | 'separator' | 'compressor' | 'underdeck' | 'field' | 'rig' | 'wellbay' | 'lq' | 'bridge' | 'whp' | 'bridgeN' | 'rp' | 'wi'

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
  /** first-person walkthrough (arrow keys) */
  walk: boolean
  /** walk mode: the equipment in the centre of view (drives the inspection panel) */
  lookAt: PickData | null
  /** walkthrough camera: through the eyes, or behind a visible person */
  walkView: 'first' | 'third'
  setWalkView: (v: 'first' | 'third') => void
  /** third-person camera distance behind the person, m (wheel / − + in walk mode) — remembered */
  walkDist: number
  setWalkDist: (d: number) => void
  /** third-person camera in front of the person, looking back at them (to see the face and kit) */
  walkFront: boolean
  setWalkFront: (v: boolean) => void
  /** night-time scene: dark sky, moonlight, floodlit decks — remembered */
  night: boolean
  setNight: (v: boolean) => void
  /** knowledge card open for this tag (eye icon / About) */
  kbTag: string | null
  setKbTag: (t: string | null) => void
  /** where to put the walker when walk mode starts (deck navigator "Walk here") */
  walkStart: { level: string; at: [number, number]; face?: [number, number] } | null
  /** walk mode: index into the plant's walk levels */
  walkLevel: number
  /** side panels shown (left: tree / operations / builder; right: inspector) — remembered */
  panels: { left: boolean; right: boolean }
  togglePanel: (side: 'left' | 'right' | 'both') => void
  /** control-room HMI (DCS console) open, on this page */
  hmi: string | null
  setHmi: (page: string | null) => void
  /** isolation / LOTO planner target */
  isolation: { target: string; mode: 'valve' | 'positive' } | null
  /** simulated field workers walking the decks (on by default, Alpha field only; CCTV / PPE detection watches them) */
  workers: boolean
  setWorkers: (on: boolean) => void
  /** simulated inspection drone and robot on their dock (off by default; an Inspect action turns it on) */
  inspection: boolean
  setInspection: (on: boolean) => void
  /** sitting in this crane's cab (manual crane operation + cab camera), or null */
  craneCab: string | null
  setCraneCab: (tag: string | null) => void

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
  setWalk: (on: boolean) => void
  setLookAt: (p: PickData | null) => void
  setIsolation: (i: State['isolation']) => void
  setWalkLevel: (l: number) => void
  startWalk: (start: State['walkStart']) => void
}

let nonce = 0

function loadPanels(): { left: boolean; right: boolean } {
  try {
    const p = JSON.parse(localStorage.getItem('deck-twin.panels') ?? '')
    if (typeof p?.left === 'boolean' && typeof p?.right === 'boolean') return p
  } catch {
    /* first visit */
  }
  return { left: true, right: true }
}

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
    fireGas: false,
    fgCoverage: false,
    /** hazardous-area classification, Zone 0 / 1 / 2 (scene/HazardAreaOverlay.tsx) */
    hazAreas: false,
  },
  section: { enabled: false, min: [-32, -1, -22], max: [32, 14, 22] },
  flyTo: null,
  focus: null,
  sectionAround: null,
  preset: null,
  playing: true,
  walk: false,
  lookAt: null,
  isolation: null,
  workers: true,
  setWorkers: (workers) => set({ workers }),
  inspection: false,
  setInspection: (inspection) => set({ inspection }),
  craneCab: null,
  // the cab camera takes over from the walker
  setCraneCab: (craneCab) => set(craneCab ? { craneCab, walk: false, lookAt: null, hmi: null } : { craneCab }),
  hmi: null,
  setHmi: (hmi) => set({ hmi }),
  panels: loadPanels(),
  togglePanel: (side) =>
    set((s) => {
      const p = s.panels
      // "both": hide both if either is showing, else show both
      const panels = side === 'both' ? (p.left || p.right ? { left: false, right: false } : { left: true, right: true }) : { ...p, [side]: !p[side] }
      localStorage.setItem('deck-twin.panels', JSON.stringify(panels))
      return { panels }
    }),
  walkLevel: 0,
  walkStart: null,
  walkView: (localStorage.getItem('deck-twin.walkView') as 'first' | 'third') || 'third',
  setWalkView: (walkView) => (localStorage.setItem('deck-twin.walkView', walkView), set({ walkView })),
  walkDist: Math.min(WALK_DIST.max, Math.max(WALK_DIST.min, Number(localStorage.getItem('deck-twin.walkDist')) || WALK_DIST.def)),
  walkFront: false,
  setWalkFront: (walkFront) => set({ walkFront }),
  setWalkDist: (d) => {
    const walkDist = Math.round(Math.min(WALK_DIST.max, Math.max(WALK_DIST.min, d)) * 100) / 100
    localStorage.setItem('deck-twin.walkDist', String(walkDist))
    set({ walkDist })
  },
  night: localStorage.getItem('deck-twin.night') === '1',
  setNight: (night) => (localStorage.setItem('deck-twin.night', night ? '1' : '0'), set({ night })),
  kbTag: null,
  setKbTag: (kbTag) => set({ kbTag }),

  select: (p) => set({ selected: p }),
  hover: (p) => set({ hovered: p }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleLayer: (l) => set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  setLayer: (l, v) => set((s) => ({ layers: { ...s.layers, [l]: v } })),
  setSection: (sec) => set((s) => ({ section: { ...s.section, ...sec } })),
  // camera transitions take the camera back from the walker
  requestFlyTo: (position, target) => set({ flyTo: { position, target, nonce: ++nonce }, walk: false, lookAt: null }),
  requestFocus: (tag) => set({ focus: { tag, nonce: ++nonce } }),
  requestSectionAround: (tag) => set({ sectionAround: { tag, nonce: ++nonce } }),
  requestPreset: (name) => set({ preset: { name, nonce: ++nonce }, walk: false, lookAt: null }),
  setPlaying: (playing) => set({ playing }),
  setWalk: (walk) => set(walk ? { walk, lookAt: null, craneCab: null } : { walk, lookAt: null }),
  setLookAt: (lookAt) => set({ lookAt }),
  setIsolation: (isolation) => set({ isolation }),
  setWalkLevel: (walkLevel) => set({ walkLevel, lookAt: null }),
  startWalk: (walkStart) => set((s) => ({ walkStart, walk: true, craneCab: null, lookAt: null, selected: null, section: { ...s.section, enabled: false }, layers: { ...s.layers, ceiling: true } })),
}))

/** World Y of the deck-local origin (top of production deck plate). */
export const DECK_WORLD_Y = 28
