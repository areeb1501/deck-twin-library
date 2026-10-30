/**
 * Simulated field workers (plan 06).
 *
 *  - ROSTER: ten operators / technicians with a home walk level and platform.
 *  - taskPoints(levelIndex): open-deck spots ~2 m in front of the equipment on a level (cached per plant),
 *    each with the equipment tag to face and the task wording ("Routine check at V-1100").
 *  - PPE rotation (sim plugin `workers`): on the first tick with Toolbar → Workers on, then every 90–180
 *    sim seconds, one or two workers drop their hard hat or hi-vis vest and the rest put theirs back on —
 *    what the CCTV / PPE detector (plan 07) catches. Deterministic (simRandom). With Workers off the
 *    whole roster is in full PPE (the default), so nothing downstream counts violations on an empty deck.
 *  - workerPose: live poses, mutated every frame by scene/Workers.tsx (never copied into React state).
 */
import { create } from 'zustand'
import type { PlatformId } from '../sim/types'
import type { Equipment, Plant } from '../model/types'
import type { WorkerInfo, WorkerPose } from './types'
import { registerSimPlugin, simRandom } from '../state/sim'
import { useStore } from '../state/store'
import { usePlantStore } from '../state/plantStore'
import { blockers, levelAt, walkable, walkLevels } from '../scene/Walk'
import { footprints } from '../model/footprint'
import { platformAt } from '../sim/fg'

/** live poses by worker id — mutated every frame by scene/Workers.tsx */
export const workerPose: Record<string, WorkerPose> = {}

const W = (id: string, name: string, role: string, level: string, platform: PlatformId, task: string, ppe: Partial<Pick<WorkerInfo, 'hardHat' | 'vest'>> = {}): WorkerInfo => ({
  id,
  name,
  role,
  level,
  platform,
  hardHat: ppe.hardHat ?? true,
  vest: ppe.vest ?? true,
  task,
})

/** the crew on shift (production deck ×5, weather deck ×2, cellar ×1, WHP-N ×2) */
export const ROSTER: WorkerInfo[] = [
  W('w01', 'R. Haugland', 'Production operator', 'production', 'Alpha', 'Starting the separation round'),
  W('w02', 'S. Okafor', 'Production operator', 'production', 'Alpha', 'Starting the export round'),
  W('w03', 'M. Lindqvist', 'Production operator', 'production', 'WHP-N', 'Wellhead round, WHP-N'),
  W('w04', 'J. Pereira', 'Mechanical technician', 'production', 'Alpha', 'Pump PM rounds'),
  W('w05', 'A. Nowak', 'Mechanical technician', 'weather', 'Alpha', 'Turbine enclosure checks'),
  W('w06', 'K. Tan', 'Electrician', 'weather', 'Alpha', 'Transformer thermography'),
  W('w07', 'L. Fraser', 'Instrument technician', 'cellar', 'Alpha', 'Wellhead transmitter checks'),
  W('w08', 'D. Mensah', 'Scaffolder', 'production', 'Alpha', 'Scaffold inspections'),
  W('w09', 'T. Brekke', 'Scaffolder', 'production', 'WHP-N', 'Scaffold inspections, WHP-N'),
  W('w10', 'P. Duarte', 'Deck crew', 'production', 'Alpha', 'Housekeeping and laydown checks'),
]

interface WorkerStore {
  roster: WorkerInfo[]
}
export const useWorkers = create<WorkerStore>(() => ({ roster: ROSTER }))
if (import.meta.env.DEV) Object.assign(window, { __workers: useWorkers, __workerPose: workerPose })

/** walk-level index of a worker (scene/Walk.tsx walkLevels order) */
export function workerLevelIndex(w: Pick<WorkerInfo, 'level'>, plant: Plant = usePlantStore.getState().plant): number {
  const i = walkLevels(plant).findIndex((l) => l.id === w.level)
  return i < 0 ? 0 : i
}

/** update a worker's task wording (low frequency: once per arrival) */
export function setWorkerTask(id: string, task: string) {
  const { roster } = useWorkers.getState()
  const i = roster.findIndex((w) => w.id === id)
  if (i < 0 || roster[i].task === task) return
  const next = roster.slice()
  next[i] = { ...roster[i], task }
  useWorkers.setState({ roster: next })
}

// ---------------------------------------------------------------- task points

export interface TaskPoint {
  /** deck-local plan position the worker stands at */
  x: number
  z: number
  /** equipment to face while working */
  tag: string
  face: [number, number]
  platform: PlatformId
  /** the equipment kind (task wording) */
  kind: Equipment['kind']
}

const VERB: Partial<Record<Equipment['kind'], string>> = {
  horizontalVessel: 'Routine check at',
  verticalVessel: 'Routine check at',
  shellTube: 'Leak check —',
  pumpPackage: 'Gauge round —',
  caissonPump: 'Gauge round —',
  compressorPackage: 'Vibration check —',
  gasTurbineGenerator: 'Enclosure inspection —',
  xmasTree: 'Wellhead pressure check —',
  manifold: 'Valve line-up check —',
  chemSkid: 'Chemical tank top-up —',
  pigTrap: 'Pig trap door check —',
  transformer: 'Thermography —',
}
const ROLE_VERB: Record<string, string> = {
  Scaffolder: 'Scaffold inspection at',
  Electrician: 'Junction box check at',
  'Instrument technician': 'Transmitter check at',
  'Deck crew': 'Housekeeping round at',
}
/** the task wording for a worker at a point */
export function taskText(w: Pick<WorkerInfo, 'role'>, tp: TaskPoint): string {
  return `${ROLE_VERB[w.role] ?? VERB[tp.kind] ?? 'Routine check at'} ${tp.tag}`
}

const SKIP = new Set<Equipment['kind']>(['proxy', 'module'])
const OUT = 1.9 // m from the equipment's footprint edge
const tpCache = new WeakMap<Plant, Map<number, TaskPoint[]>>()

/** open-deck task points on a walk level, one per equipment item (cached per plant) */
export function taskPoints(levelIndex: number, plant: Plant = usePlantStore.getState().plant): TaskPoint[] {
  let byLevel = tpCache.get(plant)
  if (!byLevel) tpCache.set(plant, (byLevel = new Map()))
  const hit = byLevel.get(levelIndex)
  if (hit) return hit
  const levels = walkLevels(plant)
  const block = blockers(plant, levelIndex)
  const fps = footprints(plant.equipment, 0)
  const out: TaskPoint[] = []
  plant.equipment.forEach((e, i) => {
    if (SKIP.has(e.kind) || levelAt(levels, e.position[1]) !== levelIndex) return
    const f = fps[i]
    const cx = (f.x0 + f.x1) / 2
    const cz = (f.z0 + f.z1) / 2
    const cands: [number, number][] = [
      [cx, f.z1 + OUT],
      [cx, f.z0 - OUT],
      [f.x1 + OUT, cz],
      [f.x0 - OUT, cz],
    ]
    const ok = cands.find(([x, z]) => walkable(plant, levelIndex, block, x, z))
    if (!ok) return
    out.push({ x: ok[0], z: ok[1], tag: e.tag, face: [e.position[0], e.position[2]], platform: platformAt(e.position), kind: e.kind })
  })
  byLevel.set(levelIndex, out)
  return out
}

/** the task points a worker uses: their level, their platform (the deck crew also walks to the LQ) */
export function workerTaskPoints(w: WorkerInfo, plant: Plant = usePlantStore.getState().plant): TaskPoint[] {
  const all = taskPoints(workerLevelIndex(w, plant), plant)
  const own = all.filter((p) => p.platform === w.platform || (w.role === 'Deck crew' && p.platform === 'LQ'))
  return own.length ? own : all
}

// ---------------------------------------------------------------- PPE rotation (sim plugin)

let nextAt = -1

function rotatePpe() {
  const roster = useWorkers.getState().roster
  const n = simRandom() < 0.55 ? 1 : 2
  const drop = new Map<string, 'hardHat' | 'vest'>()
  while (drop.size < n) {
    const w = roster[Math.floor(simRandom() * roster.length)]
    if (!drop.has(w.id)) drop.set(w.id, simRandom() < 0.55 ? 'hardHat' : 'vest')
  }
  let changed = false
  const next = roster.map((w) => {
    const d = drop.get(w.id)
    const hardHat = d !== 'hardHat'
    const vest = d !== 'vest'
    if (w.hardHat === hardHat && w.vest === vest) return w
    changed = true
    return { ...w, hardHat, vest }
  })
  if (changed) useWorkers.setState({ roster: next })
}

registerSimPlugin({
  id: 'workers',
  step(_dt, t) {
    if (!useStore.getState().workers) {
      // nobody on deck: everyone back in full PPE (nothing for risk / alerts to count), rotation restarts
      if (nextAt >= 0) {
        nextAt = -1
        useWorkers.setState({ roster: useWorkers.getState().roster.map((w) => (w.hardHat && w.vest ? w : { ...w, hardHat: true, vest: true })) })
      }
      return
    }
    // first enabled tick: one or two violations straight away, then every 90–180 sim s
    if (nextAt >= 0 && t < nextAt) return
    nextAt = t + 90 + simRandom() * 90
    rotatePpe()
  },
  reset() {
    nextAt = -1
    useWorkers.setState({ roster: ROSTER })
  },
})
