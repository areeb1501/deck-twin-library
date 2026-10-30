/**
 * One consistent, fully guarded read of the plant simulation for a control-room redraw cycle.
 *
 * The engine (state/sim.ts) implements `SimState` from sim/types.ts; while it is being rewritten
 * many fields may be missing at runtime, so everything here falls back to empty values and the
 * screens draw placeholders ("----") instead of failing.
 */
import type { Equipment, Plant, Vec3 } from '../../model/types'
import { detectors as fgDetectors, fireZones, tagPosition, type Detector, type FireZone } from '../../sim/fg'
import {
  SHUTDOWN_RANK,
  fmtClock,
  type Alarm,
  type DetectorSim,
  type HistoryPoint,
  type Kpis,
  type PlantResult,
  type PlatformId,
  type PlatformResult,
  type ProcessState,
  type Shutdown,
  type ShutdownLevel,
  type SimEvent,
  type SimState,
  type ValveSim,
  type ZoneStatus,
} from '../../sim/types'
import { usePlantStore } from '../../state/plantStore'
import { useSim } from '../../state/sim'

/** what a control room looks after: the whole field (Alpha CCR) or one platform (WHP-N local CR) */
export type Focus = 'field' | 'WHP-N'

export interface PlatformView {
  id: PlatformId
  online: boolean | null
  shutdown: ShutdownLevel | null
  ga: PlatformResult['ga'] | null
  oil: number | null
  gas: number | null
  alarms: number
}

export interface Snap {
  t: number
  clock: string
  running: boolean
  blink: boolean
  /** wall seconds (CCTV cycling) */
  wall: number
  focus: Focus
  /** header platform / site name */
  site: string
  /** the Alpha field layout is loaded (the mimic / overview are authored for it) */
  alpha: boolean
  plant: Plant
  r: Partial<PlantResult> | null
  p: Partial<ProcessState>
  k: Partial<Kpis>
  availability: number | null
  alarms: Alarm[] | null
  events: SimEvent[]
  shutdowns: Shutdown[] | null
  fg: Record<string, ZoneStatus>
  det: Record<string, DetectorSim>
  valves: Record<string, ValveSim>
  status: Record<string, string>
  history: Partial<HistoryPoint>[]
  platforms: PlatformView[]
  /** fields the new engine provides that are still missing (shown as a header note) */
  pending: boolean
}

// ---------------------------------------------------------------- per-plant caches (fg.ts may be heavy once upgraded)
interface PlantInfo {
  zones: FireZone[]
  dets: Detector[]
  detPos: Map<string, Vec3 | null>
  eq: Map<string, Equipment>
  standby: Set<string>
}
const plantInfo = new WeakMap<Plant, PlantInfo>()
const MACHINE = new Set(['pumpPackage', 'compressorPackage', 'gasTurbineGenerator', 'caissonPump'])
export function info(plant: Plant): PlantInfo {
  let i = plantInfo.get(plant)
  if (i) return i
  let zones: FireZone[] = []
  let dets: Detector[] = []
  try {
    zones = fireZones(plant)
  } catch {
    zones = []
  }
  try {
    dets = fgDetectors(plant)
  } catch {
    dets = []
  }
  const eq = new Map(plant.equipment.map((e) => [e.tag, e]))
  const standby = new Set<string>()
  for (const e of plant.equipment) {
    if (e.system === 'safety' && e.kind === 'caissonPump') standby.add(e.tag)
    else if (MACHINE.has(e.kind) && /B$/.test(e.tag) && eq.has(e.tag.replace(/B$/, 'A'))) standby.add(e.tag)
  }
  const detPos = new Map<string, Vec3 | null>(dets.map((d) => [d.tag, d.pos]))
  i = { zones, dets, detPos, eq, standby }
  plantInfo.set(plant, i)
  return i
}
/** deck-local position of a detector tag (fg.ts detector list, else the plant instrument) */
export function detectorPos(plant: Plant, tag: string): Vec3 | null {
  const i = info(plant)
  if (!i.detPos.has(tag)) {
    let p: Vec3 | null = null
    try {
      p = tagPosition(plant, tag)
    } catch {
      p = null
    }
    i.detPos.set(tag, p)
  }
  return i.detPos.get(tag) ?? null
}

/** run state of a machine: explicit status, else its default (…B spares stand by) */
export function runOf(s: Snap, tag: string): string {
  const st = s.status[tag]
  if (st) return st
  const i = info(s.plant)
  if (!i.eq.has(tag)) return 'unknown'
  return i.standby.has(tag) ? 'standby' : 'running'
}

/** valve travel (0 closed … 1 open) and its normal position */
export function valveOf(s: Snap, tag: string): { pos: number | null; normallyOpen: boolean; fault: boolean; exists: boolean } {
  const pv = s.plant.valves.find((v) => v.tag === tag)
  const v = s.valves[tag]
  return { pos: v ? v.pos : pv ? (pv.normally === 'closed' ? 0 : 1) : null, normallyOpen: pv ? pv.normally !== 'closed' : true, fault: v?.fault === 'stuck', exists: !!pv }
}

const highest = (list: Shutdown[], platform: PlatformId): ShutdownLevel | null => {
  let best: ShutdownLevel | null = null
  for (const d of list) if (d.platform === platform && d.resetAt == null && (!best || SHUTDOWN_RANK[d.level] > SHUTDOWN_RANK[best])) best = d.level
  return best
}

export function snapshot(focus: Focus, blink: boolean): Snap {
  const s = useSim.getState() as unknown as Partial<SimState>
  const plant = usePlantStore.getState().plant
  const t = typeof s.t === 'number' ? s.t : 0
  const r = (s.result ?? null) as Partial<PlantResult> | null
  const alarms = Array.isArray(s.alarms) ? s.alarms : null
  const shutdowns = Array.isArray(s.shutdowns) ? s.shutdowns : null
  const fg = s.fg ?? {}
  const i = info(plant)
  const alpha = i.eq.has('V-1100') && i.eq.has('K-2200')
  const wells = r?.wells ?? {}
  const sumWells = (re: RegExp, k: 'oil' | 'gas') => Object.entries(wells).reduce((a, [tag, w]) => (re.test(tag) ? a + (w?.[k] ?? 0) : a), 0)
  // the field's platforms in display order; RP / WI only once they exist in the plant
  const ids: PlatformId[] = alpha ? (['Alpha', 'WHP-N', 'RP', 'WI', 'LQ'] as PlatformId[]).filter((id) => (id !== 'RP' && id !== 'WI') || !!r?.platforms?.[id]) : ['Plant']
  const platforms: PlatformView[] = ids.map((id) => {
    const pr = r?.platforms?.[id]
    const sd = pr?.shutdown ?? (shutdowns ? highest(shutdowns, id) : null)
    // GA from the platform result, else from its fire zones
    let ga: PlatformView['ga'] = pr?.ga ?? null
    if (!ga && Object.keys(fg).length) {
      const zs = i.zones.filter((z) => z.platform === id).map((z) => fg[z.id]).filter(Boolean)
      ga = zs.some((z) => z.fire === 'confirmed') ? 'fire' : zs.some((z) => z.gas === 'confirmed') ? 'gas' : 'normal'
    }
    const online =
      pr?.online ??
      (!r ? null : id === 'Alpha' || id === 'Plant' ? (r.oilExport ?? 0) > 0 || (r.oilPotential ?? 0) === 0 : id === 'WHP-N' ? sumWells(/^XT-N/, 'oil') > 0 && (r.oilExport ?? 0) > 0 : sd == null)
    const oil = pr?.oil ?? (!r ? null : id === 'Alpha' ? sumWells(/^XT-(?!N)/, 'oil') : id === 'WHP-N' ? sumWells(/^XT-N/, 'oil') : id === 'Plant' ? (r.oilExport ?? null) : null)
    const gas = pr?.gas ?? (!r ? null : id === 'Alpha' ? sumWells(/^XT-(?!N)/, 'gas') : id === 'WHP-N' ? sumWells(/^XT-N/, 'gas') : id === 'Plant' ? (r.gasExport ?? null) : null)
    const nAl = alarms ? alarms.filter((a) => a.platform === id && a.active && a.state !== 'shelved').length : 0
    return { id, online, shutdown: sd ?? null, ga, oil, gas, alarms: nAl }
  })
  return {
    t,
    clock: fmtClock(t),
    running: (s.speed ?? 1) > 0,
    blink,
    wall: performance.now() / 1000,
    focus,
    site: !alpha ? plant.name.toUpperCase() : focus === 'WHP-N' ? 'WHP-N  LOCAL CR' : 'ALPHA FIELD  CCR',
    alpha,
    plant,
    r,
    p: s.process ?? {},
    k: s.kpis ?? {},
    availability: s.kpis?.availability ?? (typeof s.availability === 'number' ? s.availability : null),
    alarms,
    events: Array.isArray(s.events) ? s.events : [],
    shutdowns,
    fg,
    det: s.detectors ?? {},
    valves: s.valves ?? {},
    status: (s.status ?? {}) as Record<string, string>,
    history: Array.isArray(s.history) ? s.history : [],
    platforms,
    pending: !alarms || !shutdowns || !s.process || !s.kpis,
  }
}

/** header alert for a set of platforms: red = ESD / fire / muster, amber = PSD / USD / gas */
export function alertOf(ps: PlatformView[]): 'red' | 'amber' | null {
  let a: 'red' | 'amber' | null = null
  for (const p of ps) {
    if ((p.shutdown && SHUTDOWN_RANK[p.shutdown] >= SHUTDOWN_RANK.ESD2) || p.ga === 'fire' || p.ga === 'muster' || p.ga === 'abandon') return 'red'
    if (p.shutdown || p.ga === 'gas') a = 'amber'
  }
  return a
}
