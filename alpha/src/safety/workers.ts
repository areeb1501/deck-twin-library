/**
 * Simulated field workers (plan 06).
 *
 *  - ROSTER: ten operators / technicians with a home walk level and platform.
 *  - taskPoints(levelIndex): open-deck spots ~2 m in front of the equipment on a level (cached per plant),
 *    each with the equipment tag to face and the task wording ("Routine check at V-1100").
 *  - PPE rotation (sim plugin `workers`): on the first tick with Toolbar → Workers on, then every 90–180
 *    sim seconds, two or three workers drop their hard hat (mostly) or hi-vis vest and the rest put theirs
 *    back on — what the CCTV / PPE detector (plan 07) catches. Biased to the Alpha production deck (best
 *    camera coverage). Deterministic (own seeded PRNG, so the engine's simRandom stream is untouched).
 *    With Workers off the whole roster is in full PPE, so nothing downstream counts violations on an
 *    empty deck. Instructor overrides (setPpeOverride) stick through the rotation until cleared.
 *  - workerPose: live poses, mutated every frame by scene/Workers.tsx (never copied into React state).
 *  - workerCmd / sendWorker: "walk this worker to …" — scene/Workers.tsx registers the function while the
 *    figures are mounted (the instructor's hazardous-area drills and the scripted wellhead round use it).
 *  - Hazardous-area tracker (sim plugin `hazard-track`, plan 14): every tick, each worker's zone from the
 *    worn tag (RTLS position → safety/hazardAreas.ts) and what the zone needs (hard hat, hi-vis / FR,
 *    personal gas monitor; Zone 0 no entry without a confined-space permit) → useHazardTrack (present,
 *    active violations, log). Camera-independent; safety/cctv.ts confirms violations it sees.
 */
import { create } from 'zustand'
import type { PlatformId } from '../sim/types'
import type { Equipment, Plant } from '../model/types'
import type { HazardViolation, WorkerInfo, WorkerPose } from './types'
import { registerSimPlugin, useSim } from '../state/sim'
import { DECK_WORLD_Y, useStore } from '../state/store'
import { usePlantStore } from '../state/plantStore'
import { blockers, levelAt, walkable, walkLevels } from '../scene/Walk'
import { footprints } from '../model/footprint'
import { platformAt } from '../sim/fg'
import { assess, confinedPermitFor, personZone, requiredPpe, zoneTargets, type HazSource, type HazZone, type PpeItem } from './hazardAreas'

/** live poses by worker id — mutated every frame by scene/Workers.tsx */
export const workerPose: Record<string, WorkerPose> = {}

const W = (id: string, name: string, role: string, level: string, platform: PlatformId, task: string, ppe: Partial<Pick<WorkerInfo, 'hardHat' | 'vest' | 'gasMonitor'>> = {}): WorkerInfo => ({
  id,
  name,
  role,
  level,
  platform,
  hardHat: ppe.hardHat ?? true,
  vest: ppe.vest ?? true,
  gasMonitor: ppe.gasMonitor ?? true,
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
  // left the personal gas monitor on the charger: the scripted wellhead round takes him into Zone 1 (plan 14)
  W('w07', 'L. Fraser', 'Instrument technician', 'cellar', 'Alpha', 'Wellhead transmitter checks', { gasMonitor: false }),
  W('w08', 'D. Mensah', 'Scaffolder', 'production', 'Alpha', 'Scaffold inspections'),
  W('w09', 'T. Brekke', 'Scaffolder', 'production', 'WHP-N', 'Scaffold inspections, WHP-N'),
  W('w10', 'P. Duarte', 'Deck crew', 'production', 'Alpha', 'Housekeeping and laydown checks'),
]

interface WorkerStore {
  roster: WorkerInfo[]
}
const FULL_PPE = { hardHat: true, vest: true, gasMonitor: true }
/** nobody on deck yet: the whole crew in full PPE (the shift defaults apply once Workers are on) */
export const useWorkers = create<WorkerStore>(() => ({ roster: ROSTER.map((w) => ({ ...w, ...FULL_PPE })) }))
if (import.meta.env.DEV) Object.assign(window, { __workers: useWorkers, __workerPose: workerPose })

// ---------------------------------------------------------------- driving a worker (scene/Workers.tsx hook)

/** walk a worker to plan point `to` on their deck (via a walkable point), face `faceTag`, stay `hold` s; returns path length or false */
export type SendWorkerFn = (id: string, to: [number, number], faceTag: string, hold?: number, via?: [number, number]) => number | false
/** scene/Workers.tsx registers its send function here while the figures are mounted (all builds, not only DEV) */
export const workerCmd: { send: SendWorkerFn | null } = { send: null }
const sendFn = (): SendWorkerFn | undefined => workerCmd.send ?? (import.meta.env.DEV ? (window as unknown as { __sendWorker?: SendWorkerFn }).__sendWorker : undefined)
/**
 * Walk a worker somewhere (false when the figures aren't mounted — Toolbar → Workers off). Sent twice: a
 * worker waiting in the figures' path-planning queue at the moment of the first send would otherwise be
 * handed a random task point by the queue a few frames later; the repeat (0.7 s) wins.
 */
export function sendWorker(id: string, to: [number, number], faceTag: string, hold?: number, via?: [number, number]): number | false {
  const fn = sendFn()
  if (!fn) return false
  const r = fn(id, to, faceTag, hold, via)
  if (r !== false)
    setTimeout(() => {
      const p = workerPose[id]
      // still far from the spot (not on the way in): send again from where they are now
      if (p && Math.hypot(p.x - to[0], p.z - to[1]) > 0.3) sendFn()?.(id, to, faceTag, hold, via)
    }, 700)
  return r
}

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
  shellTube: 'Leak check: ',
  pumpPackage: 'Gauge round: ',
  caissonPump: 'Gauge round: ',
  compressorPackage: 'Vibration check: ',
  gasTurbineGenerator: 'Enclosure inspection: ',
  xmasTree: 'Wellhead pressure check: ',
  manifold: 'Valve line-up check: ',
  chemSkid: 'Chemical tank top-up: ',
  pigTrap: 'Pig trap door check: ',
  transformer: 'Thermography: ',
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

// ---------------------------------------------------------------- PPE: rotation + instructor overrides (sim plugin)

type PpeFlags = Pick<WorkerInfo, 'hardHat' | 'vest' | 'gasMonitor'>

/** own seeded PRNG: the bias must not shift the engine's simRandom stream (scenarios depend on it) */
let seed = 1409
function rng() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

let nextAt = -1
let enabled = false
/** who is without a hard hat / vest in this rotation */
let drops = new Map<string, 'hardHat' | 'vest'>()
/** instructor overrides (sticky through the rotation until cleared) */
const overrides = new Map<string, Partial<PpeFlags>>()

/** write the roster's PPE flags: off → full PPE; on → shift defaults (ROSTER) − rotation drops, then overrides */
function applyPpe() {
  const base = new Map(ROSTER.map((w) => [w.id, w]))
  let changed = false
  const next = useWorkers.getState().roster.map((w) => {
    const b = base.get(w.id) ?? w
    const d = drops.get(w.id)
    const o = overrides.get(w.id) ?? {}
    const f: PpeFlags = enabled ? { hardHat: o.hardHat ?? d !== 'hardHat', vest: o.vest ?? d !== 'vest', gasMonitor: o.gasMonitor ?? b.gasMonitor } : FULL_PPE
    if (w.hardHat === f.hardHat && w.vest === f.vest && w.gasMonitor === f.gasMonitor) return w
    changed = true
    return { ...w, ...f }
  })
  if (changed) useWorkers.setState({ roster: next })
}

/** instructor: force PPE flags for a worker (null clears); applied at once when Workers are on */
export function setPpeOverride(id: string, o: Partial<PpeFlags> | null) {
  if (o) overrides.set(id, { ...overrides.get(id), ...o })
  else overrides.delete(id)
  applyPpe()
}
/** instructor: clear every override (the rotation's drops stay) */
export function clearPpeOverrides() {
  overrides.clear()
  applyPpe()
}
export const ppeOverrides = () => overrides

/** two or three workers drop a hard hat (65 %) or vest; the Alpha production deck (camera coverage) weighted ×3 */
function rotatePpe() {
  const n = 2 + (rng() < 0.35 ? 1 : 0)
  const pool = ROSTER.map((w) => ({ w, wt: w.platform === 'Alpha' && w.level === 'production' ? 3 : 1 }))
  const total = pool.reduce((a, p) => a + p.wt, 0)
  drops = new Map()
  while (drops.size < n) {
    let r = rng() * total
    const pick = pool.find((p) => (r -= p.wt) < 0) ?? pool[pool.length - 1]
    if (!drops.has(pick.w.id)) drops.set(pick.w.id, rng() < 0.65 ? 'hardHat' : 'vest')
  }
  applyPpe()
}

registerSimPlugin({
  id: 'workers',
  step(_dt, t) {
    if (!useStore.getState().workers) {
      // nobody on deck: everyone back in full PPE (nothing for risk / alerts to count), overrides cleared, rotation restarts
      if (nextAt >= 0 || enabled) {
        nextAt = -1
        enabled = false
        drops = new Map()
        overrides.clear()
        applyPpe()
      }
      return
    }
    if (!enabled) {
      enabled = true
      applyPpe()
    }
    // first enabled tick: violations straight away, then every 90–180 sim s
    if (nextAt >= 0 && t < nextAt) return
    nextAt = t + 90 + rng() * 90
    rotatePpe()
  },
  reset() {
    nextAt = -1
    enabled = false
    seed = 1409
    drops = new Map()
    overrides.clear()
    useWorkers.setState({ roster: ROSTER.map((w) => ({ ...w, ...FULL_PPE })) })
  },
})

// ---------------------------------------------------------------- hazardous-area tracker (plan 14)

/** a worker in a classified area right now (worn tag / RTLS) */
export interface HazPresence {
  zone: HazZone
  tag: string
  source: HazSource
  reason: string
  /** PPE / gear the zone needs that the worker hasn't got (empty = compliant) */
  missing: PpeItem[]
  platform: PlatformId
  /** Zone 0: the issued confined-space permit that makes the entry lawful */
  permit: string | null
}

interface HazTrackStore {
  /** people in a classified area now, by worker id */
  present: Record<string, HazPresence>
  /** violations in progress (tracked; `camera` once a CCTV detection confirms) */
  active: HazardViolation[]
  /** every violation, newest first (capped) */
  log: HazardViolation[]
}
export const useHazardTrack = create<HazTrackStore>(() => ({ present: {}, active: [], log: [] }))

/** a violation starts after this long in the zone (sim s) and ends after this long out of it */
const START_S = 2
const CLEAR_S = 20
const LOG_CAP = 120
/** scripted wellhead round: the no-gas-monitor technician to a tree's Zone 1 every … sim s */
const ROUND_WORKER = 'w07'
const ROUND_EVERY_S = 150
const ROUND_WALL_MS = 60000

let vSeq = 0
const pendingSince = new Map<string, number>()
const lastSeen = new Map<string, number>()
/** instructor drills: worker id → the violation the drill is about, until when (it starts at once, flagged `drill`) */
const drills = new Map<string, { until: number; key: string }>()
let roundAt = -1
let roundWall = 0
let roundIdx = 0
let presentKey = ''

const vKey = (workerId: string, kind: HazardViolation['kind'], zone: HazZone) => `${workerId}|${kind}|${zone}`
const keyOf = (v: HazardViolation) => vKey(v.workerId, v.kind, v.zone)

/** instructor: this worker's next `kind` violation in `zone` starts without the 2 s delay and is flagged as a drill */
export function markDrill(workerId: string, kind: HazardViolation['kind'], zone: HazZone) {
  const t = simT()
  drills.set(workerId, { until: t + 300, key: vKey(workerId, kind, zone) })
  // a drill always starts a fresh violation: close what this worker has open
  closeWhere((v) => v.workerId === workerId, t)
}

/** cctv.ts: a camera saw this violation (first sighting sets `camera` — one store write per violation) */
export function confirmByCamera(workerId: string, kind: HazardViolation['kind'], zone: HazZone, camera: string, t: number) {
  const st = useHazardTrack.getState()
  const v = st.active.find((x) => x.workerId === workerId && x.kind === kind && x.zone === zone && !x.camera)
  if (!v) return
  const nv = { ...v, camera, cameraAt: t }
  useHazardTrack.setState({ active: st.active.map((x) => (x === v ? nv : x)), log: st.log.map((x) => (x.id === v.id ? nv : x)) })
}

/** the worst open violation of a worker (zone 0 entry first, then the lowest zone) */
export function openViolationOf(workerId: string): HazardViolation | undefined {
  let best: HazardViolation | undefined
  for (const v of useHazardTrack.getState().active) {
    if (v.workerId !== workerId) continue
    if (!best || (v.kind === 'zone0Entry' && best.kind !== 'zone0Entry') || (v.kind === best.kind && v.zone < best.zone)) best = v
  }
  return best
}

const simT = () => useSim.getState().t

function closeWhere(pred: (v: HazardViolation) => boolean, t: number) {
  const st = useHazardTrack.getState()
  const ending = st.active.filter(pred)
  if (!ending.length) return
  const ids = new Set(ending.map((v) => v.id))
  for (const v of ending) {
    lastSeen.delete(keyOf(v))
    pendingSince.delete(keyOf(v))
  }
  useHazardTrack.setState({ active: st.active.filter((v) => !ids.has(v.id)), log: st.log.map((v) => (ids.has(v.id) ? { ...v, t1: t } : v)) })
}

function clearTrack(t: number) {
  closeWhere(() => true, t)
  pendingSince.clear()
  lastSeen.clear()
  if (presentKey) {
    presentKey = ''
    useHazardTrack.setState({ present: {} })
  }
}

/** the scripted wellhead round: the technician without a gas monitor checks a tree's transmitters (Zone 1) */
function scriptedRound(t: number, plant: Plant) {
  if (roundAt < 0) roundAt = t + 20 // first round shortly after Workers come on
  if (t < roundAt || performance.now() < roundWall) return
  const w = useWorkers.getState().roster.find((x) => x.id === ROUND_WORKER)
  if (!w || !workerPose[w.id]) return
  const li = workerLevelIndex(w, plant)
  const tg = zoneTargets(1, li, plant).filter((x) => x.volume.platform === w.platform && x.volume.source === 'wellhead')
  if (!tg.length) return
  const target = tg[roundIdx++ % tg.length]
  if (sendWorker(w.id, target.to, target.face, 30, target.via) === false) return
  setWorkerTask(w.id, `Transmitter check at ${target.face} (Zone 1)`)
  roundAt = t + ROUND_EVERY_S
  roundWall = performance.now() + ROUND_WALL_MS
}

function trackStep(t: number) {
  if (!useStore.getState().workers) {
    if (presentKey || useHazardTrack.getState().active.length) clearTrack(t)
    roundAt = -1
    return
  }
  const plant = usePlantStore.getState().plant
  scriptedRound(t, plant)
  const roster = useWorkers.getState().roster
  const st = useHazardTrack.getState()
  const open = new Map(st.active.map((v) => [keyOf(v), v]))
  const present: Record<string, HazPresence> = {}
  const alive = new Set<string>()
  const starting: HazardViolation[] = []
  for (const w of roster) {
    const p = workerPose[w.id]
    if (!p) continue
    const hit = personZone(p.x, p.footY - DECK_WORLD_Y, p.z, plant)
    if (!hit) continue
    const v = hit.volume
    const permit = hit.zone === 0 ? confinedPermitFor(v.tag) : null
    const missing = requiredPpe(hit.zone).filter((k) => !w[k])
    present[w.id] = { zone: hit.zone, tag: v.tag, source: v.source, reason: v.reason, missing, platform: v.platform, permit }
    // a Zone 1 volume sits inside its Zone 2 envelope: an open, less hazardous violation stays alive while it still applies
    for (const o of st.active) if (o.workerId === w.id && o.kind === 'zonePpe' && o.zone > hit.zone && requiredPpe(o.zone).some((k) => !w[k])) alive.add(keyOf(o))
    const a = assess(w, hit, !!permit)
    if (!a) continue
    const k = vKey(w.id, a.kind, hit.zone)
    alive.add(k)
    if (open.has(k)) continue
    const dr = drills.get(w.id)
    const drill = !!dr && dr.until >= t && dr.key === k
    const since = pendingSince.get(k)
    if (since === undefined) pendingSince.set(k, t)
    if (!drill && (since === undefined || t - since < START_S)) continue
    pendingSince.delete(k)
    if (drill) drills.delete(w.id)
    starting.push({ id: `HZ-${(++vSeq).toString().padStart(4, '0')}`, kind: a.kind, workerId: w.id, zone: hit.zone, tag: v.tag, reason: v.reason, missing: a.missing, platform: v.platform, pos: [+p.x.toFixed(2), +p.footY.toFixed(2), +p.z.toFixed(2)], t0: t, ...(drill ? { drill: true } : {}) })
  }
  for (const k of [...pendingSince.keys()]) if (!alive.has(k)) pendingSince.delete(k)
  for (const k of alive) lastSeen.set(k, t)
  // end what has been out of its zone (or compliant again) for CLEAR_S
  const ending = st.active.filter((v) => !alive.has(keyOf(v)) && t - (lastSeen.get(keyOf(v)) ?? v.t0) >= CLEAR_S)
  if (ending.length) closeWhere((v) => ending.includes(v), t)
  if (starting.length) {
    const s2 = useHazardTrack.getState()
    useHazardTrack.setState({ active: [...s2.active, ...starting], log: [...starting.reverse(), ...s2.log].slice(0, LOG_CAP) })
  }
  const pk = Object.entries(present)
    .map(([id, x]) => `${id}:${x.zone}:${x.tag}:${x.missing.join('+')}:${x.permit ?? ''}`)
    .join('|')
  if (pk !== presentKey) {
    presentKey = pk
    useHazardTrack.setState({ present })
  }
}

registerSimPlugin({
  id: 'hazard-track',
  step: (_dt, t) => trackStep(t),
  reset() {
    vSeq = 0
    pendingSince.clear()
    lastSeen.clear()
    drills.clear()
    roundAt = -1
    roundWall = 0
    roundIdx = 0
    presentKey = ''
    useHazardTrack.setState({ present: {}, active: [], log: [] })
  },
})
if (import.meta.env.DEV) Object.assign(window, { __hazTrack: useHazardTrack })
