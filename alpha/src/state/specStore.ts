/**
 * Plant builder state: the PlantSpec being edited, its compiled result, and undo history.
 * Every edit recompiles; if the piping engine accepts the result it becomes the plant shown in
 * the viewer. The spec is autosaved to localStorage.
 */
import { create } from 'zustand'
import type { PlantSpec } from '../library/spec'
import { emptySpec } from '../library/spec'
import { compileSpec, type CompileResult } from '../library/compile'
import { separationTrainSpec } from '../library/examples/separationTrain'
import { buildPiping } from '../scene/piping/build'
import { usePlantStore } from './plantStore'
import { DECK_WORLD_Y, useStore } from './store'
import type { Plant } from '../model/types'

const KEY = 'deck-twin.builder.spec'
const ACTIVE_KEY = 'deck-twin.builder.active'

export interface BuildResult extends CompileResult {
  /** the piping engine rejected the compiled plant (viewer keeps the last good one) */
  buildError?: string
}

interface SpecState {
  spec: PlantSpec
  result: BuildResult
  active: boolean
  past: PlantSpec[]
  future: PlantSpec[]
  /** apply an edit to a draft copy of the spec */
  edit: (fn: (draft: PlantSpec) => void) => void
  load: (spec: PlantSpec) => void
  undo: () => void
  redo: () => void
  setActive: (on: boolean) => void
}

function compile(spec: PlantSpec): BuildResult {
  const r = compileSpec(spec)
  try {
    buildPiping(r.plant)
  } catch (e) {
    return { ...r, buildError: (e as Error).message }
  }
  return r
}

function initial(): PlantSpec {
  try {
    const s = localStorage.getItem(KEY)
    if (s) return JSON.parse(s) as PlantSpec
  } catch {
    /* fall through to the example */
  }
  return structuredClone(separationTrainSpec)
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function commit(spec: PlantSpec, result: BuildResult, active: boolean) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => localStorage.setItem(KEY, JSON.stringify(spec)), 300)
  if (active && !result.buildError) usePlantStore.getState().setPlant(result.plant)
}

/** Fly the camera so the whole plot is in view. */
export function frameBuilderPlant(p: Plant = usePlantStore.getState().plant) {
  const e = p.deck.extent
  const cx = (e.minX + e.maxX) / 2
  const cz = (e.minZ + e.maxZ) / 2
  const size = Math.max(e.maxX - e.minX, (e.maxZ - e.minZ) * 1.4, 24)
  // aim a little west of centre: the builder panel covers the left of the viewport
  const tx = cx - size * 0.1
  useStore.getState().requestFlyTo([tx + size * 0.55, DECK_WORLD_Y + size * 0.8, cz + size * 1.4], [tx, DECK_WORLD_Y + 1, cz])
}

const spec0 = initial()
const result0 = compile(spec0)
const active0 = localStorage.getItem(ACTIVE_KEY) === '1'
// reopen in the builder after a reload
if (active0 && !result0.buildError) {
  usePlantStore.getState().setPlant(result0.plant)
  setTimeout(() => frameBuilderPlant(), 400)
}

export const useSpecStore = create<SpecState>((set, get) => ({
  spec: spec0,
  result: result0,
  active: active0,
  past: [],
  future: [],

  edit: (fn) => {
    const draft = structuredClone(get().spec)
    fn(draft)
    const result = compile(draft)
    set((s) => ({ spec: draft, result, past: [...s.past.slice(-49), s.spec], future: [] }))
    commit(draft, result, get().active)
  },
  load: (spec) => {
    const result = compile(spec)
    set((s) => ({ spec, result, past: [...s.past.slice(-49), s.spec], future: [] }))
    commit(spec, result, get().active)
    if (get().active) {
      useStore.getState().select(null)
      setTimeout(() => frameBuilderPlant(), 60)
    }
  },
  undo: () => {
    const { past, spec, future, active } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    const result = compile(prev)
    set({ spec: prev, result, past: past.slice(0, -1), future: [spec, ...future] })
    commit(prev, result, active)
  },
  redo: () => {
    const { past, spec, future, active } = get()
    if (!future.length) return
    const next = future[0]
    const result = compile(next)
    set({ spec: next, result, past: [...past, spec], future: future.slice(1) })
    commit(next, result, active)
  },
  setActive: (on) => {
    set({ active: on })
    localStorage.setItem(ACTIVE_KEY, on ? '1' : '0')
    if (!on) return
    const st = useStore.getState()
    st.select(null)
    st.setSection({ enabled: false })
    const { result } = get()
    if (!result.buildError) usePlantStore.getState().setPlant(result.plant)
    setTimeout(() => frameBuilderPlant(), 60)
  },
}))

export { emptySpec }
