/**
 * Console-triggered inspections (plan 12): one tracked robot and one drone, simulated. Alpha field only, gated
 * like Workers: useStore.inspection (off by default), mounted by Scene.tsx, and the plugin does nothing while it is
 * off. An Inspect action turns it on.
 *
 *  - Who goes where (stopFor). The robot stays on the main deck level, which spans every platform and bridge, and
 *    stops at the same open-deck points the crew use (workers.ts taskPoints). The drone only flies in the open: the
 *    checked hover stops in model/inspectionSite.ts. Alpha's cellar deck is reached by neither, and says so.
 *  - Missions (dispatchInspection). A tag, or a fire zone's equipment (first MAX_STOPS, nearest first). Phases:
 *    docked → launching → enroute → scanning → enroute … → returning → charging → docked.
 *  - Motion is stepped every frame by scene/InspectionUnits.tsx (stepUnits), like the workers it has to avoid, because
 *    they move on the wall clock. A sim plugin tick is far too coarse: at 60× one tick is 30 sim s, 135 m of drone flight.
 *    A hidden tab pauses a mission, and the crew with it.
 *  - Fast-forward is a mission clock, not the plant's: the plant, scenarios and the header's speed buttons are not
 *    touched. The mission runs at the faster of the plant speed and the fast-forward. Pausing the plant pauses it.
 *  - Standoff (nearestWorker, workerPose). Every step of at most STEP_M is tested before it is taken, at any speed: a
 *    move that would enter stopM towards a worker is refused and the unit holds. Inside keepM (the worker walked up to
 *    it) it backs away along the way it came, or carries on ahead, whichever opens the gap; backing up is safe by
 *    construction, it has just been there. It resumes past stopM + RESUME_M for RESUME_S. The robot replans around
 *    the worker after REPLAN_S; after SKIP_S a stop is left out of the report's inspected list, with the reason. A hold
 *    always runs in real time, because that is the clock the crew are on. The drone measures plan distance, so being
 *    over someone counts as 0, and it won't start a descent with a worker under it: it holds at cruise height, to one
 *    side. Workers off: nobody is on deck, and the report says so instead of implying the check passed.
 *  - Recall (plugin step): confirmed gas or fire, a general alarm, ESD or APS sends both home, and refuses new
 *    missions; so does wind over the drone's limit, for the drone. A low battery brings a unit home with the rest undone.
 *  - Report (finishStop): every metric on the item read through sample() while the unit is on station, with limits,
 *    state and source, plus machine health, open work orders and the simulated corrosion grade; findings feed risk
 *    (safety/risk.ts) and the alert outbox (raise(), so cleanRecipients applies).
 *  - Clip: scene/InspectionRecorder.tsx renders the unit's own camera. Frames are stamped on the mission clock, so
 *    fast-forward still records the whole mission. Held in memory here, not persisted.
 *
 * Everything here is simulated, and the UI labels it so. No hardware, no real detection.
 */
import { create } from 'zustand'
import type { Instrument, PlanRect, Plant } from '../model/types'
import type { PlatformId, SimState } from '../sim/types'
import { registerSimPlugin, useSim } from '../state/sim'
import { DECK_WORLD_Y, useStore } from '../state/store'
import { isAlphaField, usePlantStore } from '../state/plantStore'
import { levelAt, walkLevels } from '../scene/Walk'
import { planPath, routeTest } from '../scene/walkPath'
import { fireZones, platformAt, zoneOfTag } from '../sim/fg'
import { CRUISE_Y, DRONE_PAD, DRONE_STOPS, NO_FLY, PAD_TOP, ROBOT_PAD } from '../model/inspectionSite'
import { metricsFor } from '../ui/metrics'
import { sample } from '../ui/live'
import { openWos, useMaint, type Stage } from '../sim/maintenance'
import { raise, useAlerts } from './alerts'
import { GRADE_RANK, corrosionOf, pushFinding, resetCorrosion, type CorrGrade } from './corrosion'
import { taskPoints, useWorkers, workerPose } from './workers'

export type UnitId = 'robot' | 'drone'
export const UNITS: UnitId[] = ['robot', 'drone']
export type UnitPhase = 'docked' | 'launching' | 'enroute' | 'scanning' | 'returning' | 'charging'
export interface Pt {
  x: number
  y: number
  z: number
}

/** speeds m/s (mission clock), radii m, battery %/s */
export const UNIT_SPEC = {
  robot: { label: 'Inspection robot', kind: 'tracked', speed: 1, climb: 0, retreat: 1.7, scanS: 12, stopM: 3.5, keepM: 3, drain: 100 / (3 * 3600), charge: 0.4, reserve: 12 },
  // 22 min on a charge. Plan 12's "0.75 %/s" would be 2.2 min, and contradicts its own 22 min.
  drone: { label: 'Inspection drone', kind: 'quadcopter', speed: 4.5, climb: 3, retreat: 2.5, scanS: 8, stopM: 6, keepM: 4.5, drain: 100 / (22 * 60), charge: 1.2, reserve: 22 },
} as const
export const PHASE_LABEL: Record<UnitPhase, string> = { docked: 'Docked', launching: 'Leaving the bay', enroute: 'On the way', scanning: 'Inspecting', returning: 'Coming home', charging: 'Charging' }
export const FF_SPEEDS = [1, 20, 60]
/** the drone stays on the pad above this wind, m/s */
export const DRONE_WIND_LIMIT = 18
/** at most this many stops on a mission */
export const MAX_STOPS = 8
/** new missions need this much charge, % */
const MIN_START = 40
/** longest move between two standoff tests, m */
const STEP_M = 0.25
/** a worker counts for the robot within this height of its deck, and for the drone up to this far below it (a deck is between them beyond that), m */
const ROBOT_BAND = 2.5
const DRONE_BAND = 9
/** ... and this far below it when it is about to come down: it doesn't start a descent onto anyone */
const DRONE_DESCENT_BAND = 30
const RESUME_M = 0.75
const RESUME_S = 1
const REPLAN_S = 8
const SKIP_S = 45
/** a stop's report waits this long at most for its evidence frame, wall s */
const FRAME_WAIT_S = 1.5
const TRAIL_CAP = 240
const REPORT_CAP = 30
const CLIP_KEEP = 6
const CLIP_CAP = 360
/** one clip frame every … mission seconds (doubles if a long mission fills the clip) */
const CLIP_EVERY_S = 1
export const CLIP_W = 426
export const CLIP_H = 240

const worldOf = (y: number) => y + DECK_WORLD_Y
const plantNow = () => usePlantStore.getState().plant
const simNow = () => useSim.getState() as SimState
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

// ---------------------------------------------------------------- live pose (mutated every frame, read by the scene)

export interface UnitPose extends Pt {
  yaw: number
  /** what the camera points at, world */
  look: Pt
  /** m moved since the last frame, for the tracks and the tilt */
  moved: number
  scanning: boolean
  holding: boolean
}
const padPoint = (u: UnitId): Pt => (u === 'drone' ? { x: DRONE_PAD[0], y: PAD_TOP + 0.32, z: DRONE_PAD[1] } : { x: ROBOT_PAD[0], y: DECK_WORLD_Y, z: ROBOT_PAD[1] })
const newPose = (u: UnitId): UnitPose => ({ ...padPoint(u), yaw: Math.PI, look: { ...padPoint(u), z: padPoint(u).z - 5 }, moved: 0, scanning: false, holding: false })
/** live poses by unit, mutated every frame like workerPose */
export const unitPose: Record<UnitId, UnitPose> = { robot: newPose('robot'), drone: newPose('drone') }

// ---------------------------------------------------------------- store

export interface HoldInfo {
  workerId: string
  name: string
  gap: number
}
export interface UnitStatus {
  phase: UnitPhase
  /** % */
  battery: number
  mission: string | null
  label: string | null
  tag: string | null
  done: number
  total: number
  /** rough mission seconds left */
  etaS: number | null
  hold: HoldInfo | null
}
export interface Reading {
  tag: string
  label: string
  unit: string
  value: number
  nominal: number
  lo?: number
  hi?: number
  state: 'normal' | 'alarm' | 'trip'
  /** a real instrument on the item, or a signal the twin fills in */
  source: 'instrument' | 'simulated'
  samples: number
}
export type Verdict = 'ok' | 'watch' | 'action'
export interface StopResult {
  tag: string
  name: string
  platform: PlatformId
  t: number
  status: 'inspected' | 'skipped'
  skipReason?: string
  readings: Reading[]
  health: { stage: Stage; mode: string | null } | null
  openWos: string[]
  corrosion: { wallPct: number; grade: CorrGrade; rateMmPerYr: number; lastSurveyPct: number; method: 'visual' | 'ut' } | null
  verdict: Verdict
  notes: string[]
  /** evidence frame, JPEG data URL */
  thumb?: string
}
export interface HoldEvent {
  worker: string
  t: number
  /** seconds stopped */
  forS: number
  minGap: number
  outcome: 'resumed' | 'replanned' | 'skipped stop' | 'mission ended'
  /** no way to back off: the worker reached the unit */
  cornered: boolean
}
export interface InspectionReport {
  id: string
  missionId: string
  unit: UnitId
  label: string
  status: 'complete' | 'recalled' | 'aborted'
  reason: string | null
  t0: number
  t1: number
  /** mission clock, s */
  missionS: number
  /** fastest fast-forward used */
  ffMax: number
  stops: StopResult[]
  holds: HoldEvent[]
  /** nearest any worker came, m; null with nobody on deck */
  minGap: number | null
  workersOn: boolean
  stopM: number
  keepM: number
  summary: string
  simulated: true
}
interface InspectionStore {
  units: Record<UnitId, UnitStatus>
  ff: number
  /** newest first */
  reports: InspectionReport[]
  /** the report open on the console page */
  openReport: string | null
}
const idle = (): UnitStatus => ({ phase: 'docked', battery: 100, mission: null, label: null, tag: null, done: 0, total: 0, etaS: null, hold: null })
export const useInspection = create<InspectionStore>(() => ({ units: { robot: idle(), drone: idle() }, ff: 1, reports: [], openReport: null }))

// ---------------------------------------------------------------- clips

export interface ClipFrame {
  url: string
  /** sim seconds */
  t: number
  /** mission seconds */
  clock: number
  /** a moment worth marking on the timeline */
  mark?: string
}
export interface Clip {
  missionId: string
  unit: UnitId
  frames: ClipFrame[]
  every: number
}
/** recorded clips, by mission id: in memory for the session, the oldest dropped */
export const clips = new Map<string, Clip>()

function newClip(missionId: string, unit: UnitId) {
  clips.set(missionId, { missionId, unit, frames: [], every: CLIP_EVERY_S })
  for (const k of [...clips.keys()].slice(0, -CLIP_KEEP)) clips.delete(k)
}
/** a full clip keeps the whole mission: every other unmarked frame goes and the rate halves */
function thin(c: Clip) {
  c.frames = c.frames.filter((f, i) => f.mark || i % 2 === 0)
  c.every *= 2
}

// ---------------------------------------------------------------- who can go where

export interface Stop {
  tag: string
  name: string
  platform: PlatformId
  at: Pt
  look: Pt
}

const mainLevel = (p: Plant) => walkLevels(p).findIndex((l) => l.y === 0)

/** the item to inspect for a selection: a valve or instrument sends the unit to what it is mounted on */
export function targetOf(plant: Plant, tag: string): string {
  const v = plant.valves.find((x) => x.tag === tag)
  if (v) return v.line
  const i = plant.instruments.find((x) => x.tag === tag)
  if (i) return 'equipment' in i.on ? i.on.equipment : i.on.line
  return tag
}

const lineStops = new WeakMap<Plant, Map<string, Stop | null>>()

/** where the robot stands to look at a line: open deck beside the part of its route nearest the middle */
function lineStop(plant: Plant, tag: string): Stop | null {
  let m = lineStops.get(plant)
  if (!m) lineStops.set(plant, (m = new Map()))
  const hit = m.get(tag)
  if (hit !== undefined) return hit
  const line = plant.lines.find((l) => l.tag === tag)
  let found: Stop | null = null
  const li = mainLevel(plant)
  if (line && li >= 0) {
    const free = routeTest(plant, li)
    const pts: [number, number, number][] = []
    for (let i = 1; i < line.route.length; i++) {
      const [ax, ay, az] = line.route[i - 1]
      const [bx, by, bz] = line.route[i]
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az)))
      for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, az + ((bz - az) * k) / n])
    }
    const mid = pts.length / 2
    const order = pts.map((p, i) => ({ p, d: Math.abs(i - mid) })).filter((x) => x.p[1] > -1 && x.p[1] < 8).sort((a, b) => a.d - b.d)
    search: for (const { p } of order)
      for (const r of [1.2, 2, 3])
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = p[0] + dx * r
          const z = p[2] + dz * r
          if (!free(x, z)) continue
          found = { tag, name: `${line.nps}" line`, platform: platformAt(p), at: { x, y: DECK_WORLD_Y, z }, look: { x: p[0], y: worldOf(p[1]), z: p[2] } }
          break search
        }
  }
  m.set(tag, found)
  return found
}

/** where a unit goes for a tag, or why it can't */
export function stopFor(plant: Plant, unit: UnitId, tag: string): Stop | string {
  const line = plant.lines.find((l) => l.tag === tag)
  const eq = plant.equipment.find((e) => e.tag === tag)
  if (!line && !eq) return `${tag}: nothing to inspect`
  if (unit === 'drone') {
    if (!eq) return `${tag}: lines are inspected by the robot`
    const s = DRONE_STOPS[tag]
    if (!s) return `${tag} is under a deck: the drone only flies in the open`
    return { tag, name: eq.name, platform: platformAt(eq.position), at: { x: s[0], y: s[2], z: s[1] }, look: { x: eq.position[0], y: worldOf(eq.position[1]) + 1.2, z: eq.position[2] } }
  }
  if (line) return lineStop(plant, tag) ?? `${tag}: no open deck beside this line on the main deck level`
  const li = mainLevel(plant)
  const levels = walkLevels(plant)
  if (levels[levelAt(levels, eq!.position[1])]?.y !== 0) return `${tag} is off the main deck level: the tracked robot can't climb stairs`
  const tp = taskPoints(li, plant).find((p) => p.tag === tag)
  if (!tp) return `${tag}: no open deck beside it for the robot`
  return { tag, name: eq!.name, platform: tp.platform, at: { x: tp.x, y: DECK_WORLD_Y, z: tp.z }, look: { x: eq!.position[0], y: worldOf(eq!.position[1]) + 1, z: eq!.position[2] } }
}

/** what each unit would do for a tag */
export function reach(plant: Plant, tag: string): Record<UnitId, Stop | string> {
  const t = targetOf(plant, tag)
  return { robot: stopFor(plant, 'robot', t), drone: stopFor(plant, 'drone', t) }
}

/** the tags a unit can reach in a fire zone */
export function areaTargets(plant: Plant, zone: string, unit: UnitId): string[] {
  return plant.equipment.filter((e) => zoneOfTag(plant, e.tag)?.id === zone && typeof stopFor(plant, unit, e.tag) !== 'string').map((e) => e.tag)
}
/** the zones either unit can work in */
export function inspectableZones(plant: Plant) {
  return fireZones(plant).filter((z) => !z.module && UNITS.some((u) => areaTargets(plant, z.id, u).length))
}

// ---------------------------------------------------------------- routes

const segHitsRect = (a: Pt, b: Pt, r: PlanRect) => {
  for (let k = 0; k <= 40; k++) {
    const x = a.x + ((b.x - a.x) * k) / 40
    const z = a.z + ((b.z - a.z) * k) / 40
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true
  }
  return false
}
/** at cruise height, a → b around the no-fly boxes: the shorter way round a box's corners */
function cruisePath(a: Pt, b: Pt): Pt[] {
  const r = NO_FLY.find((n) => segHitsRect(a, b, n))
  if (!r) return [b]
  const c = (x: number, z: number): Pt => ({ x, y: CRUISE_Y, z })
  const corners = [c(r.x0, r.z0), c(r.x1, r.z0), c(r.x1, r.z1), c(r.x0, r.z1)]
  let best: Pt[] = [b]
  let bestLen = Infinity
  const consider = (via: Pt[]) => {
    const pts = [a, ...via, b]
    let len = 0
    for (let i = 1; i < pts.length; i++) {
      if (NO_FLY.some((n) => segHitsRect(pts[i - 1], pts[i], { x0: n.x0 + 0.1, x1: n.x1 - 0.1, z0: n.z0 + 0.1, z1: n.z1 - 0.1 }))) return
      len += dist(pts[i - 1], pts[i])
    }
    if (len < bestLen) {
      bestLen = len
      best = [...via, b]
    }
  }
  for (const p of corners) consider([p])
  for (const p of corners) for (const q of corners) if (p !== q) consider([p, q])
  return best
}
/** up the column, across at cruise, down the column: the stops are checked clear above them */
function droneLeg(from: Pt, to: Pt): Pt[] {
  const up: Pt = { x: from.x, y: CRUISE_Y, z: from.z }
  const over: Pt = { x: to.x, y: CRUISE_Y, z: to.z }
  return [up, ...cruisePath(up, over), to]
}
function robotLeg(from: Pt, to: Pt, avoid: PlanRect[] = []): Pt[] | null {
  const plant = plantNow()
  const path = planPath(plant, mainLevel(plant), [from.x, from.z], [to.x, to.z], undefined, avoid)
  if (!path?.length) return null
  return [...path.map((q) => ({ x: q.x, y: DECK_WORLD_Y, z: q.z })), to]
}
const legTo = (unit: UnitId, from: Pt, to: Pt, avoid?: PlanRect[]) => (unit === 'drone' ? droneLeg(from, to) : robotLeg(from, to, avoid))

/** nearest neighbour from the pad */
function ordered(unit: UnitId, stops: Stop[]): Stop[] {
  const left = [...stops]
  const out: Stop[] = []
  let from = padPoint(unit)
  while (left.length) {
    left.sort((a, b) => dist(from, a.at) - dist(from, b.at))
    const s = left.shift()!
    out.push(s)
    from = s.at
  }
  return out
}

// ---------------------------------------------------------------- standoff

/** clearance from a point to a worker, m (plan distance, so hovering over someone counts as 0); Infinity when a deck is between them */
function gapTo(unit: UnitId, p: Pt, w: { x: number; z: number; footY: number }, descending = false) {
  const dy = p.y - w.footY
  if (unit === 'robot' ? Math.abs(dy) > ROBOT_BAND : dy > (descending ? DRONE_DESCENT_BAND : DRONE_BAND) || dy < -2) return Infinity
  return Math.hypot(p.x - w.x, p.z - w.z)
}
export function nearestWorker(unit: UnitId, p: Pt, descending = false): { id: string | null; gap: number } {
  let id: string | null = null
  let gap = Infinity
  for (const k in workerPose) {
    const g = gapTo(unit, p, workerPose[k], descending)
    if (g < gap) {
      gap = g
      id = k
    }
  }
  return { id, gap }
}
const workerName = (id: string) => useWorkers.getState().roster.find((w) => w.id === id)?.name ?? id
/** is the drone coming down, or holding because it was about to? */
const descending = (r: { unit: UnitId; route: Pt[]; hold?: { down: boolean } | null }) => r.unit === 'drone' && (!!r.hold?.down || (!!r.route[0] && r.route[0].y < unitPose.drone.y - 0.01))

// ---------------------------------------------------------------- missions (runtime state stays out of the store)

interface Scan {
  left: number
  next: number
  n: number
  sum: Map<string, number>
  frame: boolean
  waited: number
}
interface Hold {
  workerId: string
  t: number
  forS: number
  clearS: number
  minGap: number
  cornered: boolean
  nextReplan: number
  /** the drone stopped at the top of a descent: it stays measured against the deck below */
  down: boolean
}
interface Run {
  unit: UnitId
  id: string
  label: string
  stops: Stop[]
  idx: number
  results: StopResult[]
  t0: number
  clock: number
  phase: UnitPhase
  route: Pt[]
  trail: Pt[]
  scan: Scan | null
  hold: Hold | null
  holds: HoldEvent[]
  minGap: number
  workersOn: boolean
  status: InspectionReport['status']
  reason: string | null
  ffMax: number
  lastFrame: number
  wantFrame: string | null
}

const runs: Partial<Record<UnitId, Run>> = {}
const battery: Record<UnitId, number> = { robot: 100, drone: 100 }
let missionSeq = 0
let reportSeq = 0

function statusOf(u: UnitId): UnitStatus {
  const r = runs[u]
  const near = r?.hold ? nearestWorker(u, unitPose[u], descending(r)) : null
  if (!r) return { phase: battery[u] < 99.5 ? 'charging' : 'docked', battery: Math.round(battery[u]), mission: null, label: null, tag: null, done: 0, total: 0, etaS: null, hold: null }
  return {
    phase: r.phase,
    battery: Math.round(battery[u]),
    mission: r.id,
    label: r.label,
    tag: r.stops[r.idx]?.tag ?? null,
    done: r.results.length,
    total: r.stops.length,
    etaS: etaOf(r),
    hold: r.hold ? { workerId: r.hold.workerId, name: workerName(r.hold.workerId), gap: Math.round((near?.gap ?? r.hold.minGap) * 10) / 10 } : null,
  }
}
function etaOf(r: Run) {
  const s = UNIT_SPEC[r.unit]
  let m = 0
  let a: Pt = unitPose[r.unit]
  for (const p of r.route) {
    m += dist(a, p)
    a = p
  }
  for (const st of r.stops.slice(r.idx + 1)) {
    m += dist(a, st.at) * (r.unit === 'drone' ? 1 : 1.3)
    a = st.at
  }
  if (r.phase !== 'returning') m += dist(a, padPoint(r.unit)) * (r.unit === 'drone' ? 1 : 1.3)
  return Math.round(m / s.speed + Math.max(0, r.stops.length - r.results.length) * s.scanS)
}
let lastKey = ''
function publish() {
  const units = { robot: statusOf('robot'), drone: statusOf('drone') }
  const key = JSON.stringify(units)
  if (key !== lastKey) {
    lastKey = key
    useInspection.setState({ units })
  }
}

/** does anything on the field forbid flying and driving around right now? */
export function fieldBlock(): string | null {
  const s = simNow()
  const sd = (s.shutdowns ?? []).find((x) => !x.resetAt && (x.level === 'APS' || x.level === 'ESD1' || x.level === 'ESD2'))
  if (sd) return `${sd.level} on ${sd.platform}`
  const z = Object.values(s.fg ?? {}).find((v) => v.gas === 'confirmed' || v.fire === 'confirmed')
  if (z) return `Confirmed ${z.fire === 'confirmed' ? 'fire' : 'gas'} in ${z.zone}`
  const ga = Object.entries(s.result?.platforms ?? {}).find(([, p]) => p && p.ga && p.ga !== 'normal')
  return ga ? `General alarm on ${ga[0]}` : null
}
const windSpeed = () => simNow().knobs?.wind?.speed ?? 0

export interface InspectRequest {
  unit?: UnitId
  tag?: string
  /** a fire zone id */
  area?: string
}
/** start a mission; returns why not, or null */
export function dispatchInspection(req: InspectRequest): string | null {
  const plant = plantNow()
  if (!isAlphaField(plant)) return 'Inspections run on the Alpha field only'
  const block = fieldBlock()
  if (block) return `${block}: no inspections until it is clear`
  let unit = req.unit
  let tags: string[] = []
  let label = ''
  if (req.tag) {
    const tag = targetOf(plant, req.tag)
    const r = reach(plant, tag)
    if (!unit && typeof r.robot === 'string' && typeof r.drone === 'string') return `Neither unit reaches ${tag}: ${r.robot}, and ${r.drone}`
    unit ??= typeof r.robot !== 'string' ? 'robot' : 'drone'
    if (typeof r[unit] === 'string') return r[unit] as string
    tags = [tag]
    label = tag
  } else if (req.area) {
    const z = fireZones(plant).find((x) => x.id === req.area)
    if (!z) return `No zone ${req.area}`
    unit ??= areaTargets(plant, z.id, 'robot').length ? 'robot' : 'drone'
    tags = areaTargets(plant, z.id, unit)
    if (!tags.length) return `${UNIT_SPEC[unit].label} can't reach anything in ${z.name}`
    label = z.name
  } else return 'Pick an item or an area'
  if (runs[unit]) return `${UNIT_SPEC[unit].label} is already on ${runs[unit]!.id}`
  if (battery[unit] < MIN_START) return `${UNIT_SPEC[unit].label} is charging (${Math.round(battery[unit])} %, needs ${MIN_START} %)`
  if (unit === 'drone' && windSpeed() > DRONE_WIND_LIMIT) return `Wind ${Math.round(windSpeed())} m/s: above the ${DRONE_WIND_LIMIT} m/s drone limit`
  const pad = padPoint(unit)
  const stops = ordered(unit, tags.map((t) => stopFor(plant, unit!, t)).filter((s): s is Stop => typeof s !== 'string')).slice(0, MAX_STOPS)
  const first = legTo(unit, pad, stops[0].at)
  if (!first) return `No route to ${stops[0].tag}`
  const id = `IM-${String(++missionSeq).padStart(4, '0')}`
  runs[unit] = {
    unit,
    id,
    label,
    stops,
    idx: 0,
    results: [],
    t0: simNow().t,
    clock: 0,
    phase: 'launching',
    route: first,
    trail: [],
    scan: null,
    hold: null,
    holds: [],
    minGap: Infinity,
    workersOn: useStore.getState().workers,
    status: 'complete',
    reason: null,
    ffMax: useInspection.getState().ff,
    lastFrame: -Infinity,
    wantFrame: 'launch',
  }
  Object.assign(unitPose[unit], pad)
  newClip(id, unit)
  useStore.getState().setInspection(true)
  publish()
  return null
}

/** operator: bring a unit home */
export function abortInspection(unit: UnitId, why = 'Aborted by the operator') {
  const r = runs[unit]
  if (r && r.phase !== 'returning') recall(r, 'aborted', why)
}
/** run missions at this rate on the mission clock (the plant's clock is not touched) */
export function setFastForward(ff: number) {
  useInspection.setState({ ff })
  for (const u of UNITS) if (runs[u]) runs[u]!.ffMax = Math.max(runs[u]!.ffMax, ff)
}

function recall(r: Run, status: 'recalled' | 'aborted', reason: string) {
  r.status = status
  r.reason = reason
  for (const s of r.stops.slice(r.results.length)) r.results.push(skipped(s, reason))
  r.idx = r.stops.length
  r.scan = null
  goHome(r)
}
function goHome(r: Run) {
  r.phase = 'returning'
  r.scan = null
  unitPose[r.unit].scanning = false
  const pad = padPoint(r.unit)
  r.route = legTo(r.unit, unitPose[r.unit], pad) ?? [...r.trail].reverse()
  r.wantFrame = 'returning'
}
function nextStop(r: Run) {
  r.scan = null
  unitPose[r.unit].scanning = false
  while (r.idx < r.stops.length) {
    const leg = legTo(r.unit, unitPose[r.unit], r.stops[r.idx].at)
    if (leg) {
      r.route = leg
      r.phase = 'enroute'
      return
    }
    r.results.push(skipped(r.stops[r.idx], 'No route'))
    r.idx++
  }
  goHome(r)
}

// ---------------------------------------------------------------- reading the item

const skipped = (s: Stop, why: string): StopResult => ({ tag: s.tag, name: s.name, platform: s.platform, t: simNow().t, status: 'skipped', skipReason: why, readings: [], health: null, openWos: [], corrosion: null, verdict: 'watch', notes: [why] })

function readItem(stop: Stop, scan: Scan) {
  const plant = plantNow()
  const t = simNow().t
  for (const m of metricsFor(plant, stop.tag)) scan.sum.set(m.inst.tag, (scan.sum.get(m.inst.tag) ?? 0) + sample(m.inst, t))
  scan.n++
}
function stateOf(v: number, a: Instrument['alarms']): Reading['state'] {
  if (!a || !Number.isFinite(v)) return 'normal'
  if ((a.hiHi !== undefined && v >= a.hiHi) || (a.loLo !== undefined && v <= a.loLo)) return 'trip'
  return (a.hi !== undefined && v >= a.hi) || (a.lo !== undefined && v <= a.lo) ? 'alarm' : 'normal'
}

function finishStop(r: Run) {
  const stop = r.stops[r.idx]
  const scan = r.scan!
  const plant = plantNow()
  const t = simNow().t
  const readings: Reading[] = metricsFor(plant, stop.tag).map((m) => {
    const value = (scan.sum.get(m.inst.tag) ?? sample(m.inst, t) * scan.n) / Math.max(1, scan.n)
    const a = m.inst.alarms
    return { tag: m.inst.tag, label: m.label, unit: m.inst.unit, value: Math.round(value * 100) / 100, nominal: m.inst.nominal, lo: a?.lo ?? a?.loLo, hi: a?.hi ?? a?.hiHi, state: stateOf(value, a), source: m.simulated ? 'simulated' : 'instrument', samples: scan.n }
  })
  const h = useMaint.getState().health[stop.tag]
  const health = h ? { stage: h.stage, mode: h.stage === 'normal' ? null : (h.mode ?? null) } : null
  const wos = plant.equipment.some((e) => e.tag === stop.tag) ? openWos(stop.tag).map((w) => w.id) : []
  const c = corrosionOf(plant, stop.tag, t)
  const method = r.unit === 'robot' ? 'ut' : 'visual'
  const corrosion = c ? { wallPct: Math.round(c.wallPct * 10) / 10, grade: c.grade, rateMmPerYr: Math.round(c.rateMmPerYr * 100) / 100, lastSurveyPct: Math.round(c.lastSurveyPct * 10) / 10, method: method as 'ut' | 'visual' } : null
  if (corrosion && GRADE_RANK[corrosion.grade] >= GRADE_RANK.light) pushFinding({ t, tag: stop.tag, platform: stop.platform, grade: corrosion.grade, wallPct: corrosion.wallPct, rateMmPerYr: corrosion.rateMmPerYr, method, missionId: r.id })
  const notes: string[] = []
  const bad = readings.filter((x) => x.state !== 'normal')
  if (bad.length) notes.push(`${bad.length} reading${bad.length > 1 ? 's' : ''} outside limits: ${bad.slice(0, 3).map((x) => `${x.label} ${x.value} ${x.unit}`).join(', ')}`)
  if (health && health.stage !== 'normal') notes.push(`Condition monitoring: ${health.stage}${health.mode ? ` (${health.mode})` : ''}`)
  if (corrosion && GRADE_RANK[corrosion.grade] >= GRADE_RANK.moderate) notes.push(`Wall ${corrosion.wallPct} % (${corrosion.grade}), ${corrosion.rateMmPerYr} mm/yr`)
  if (wos.length) notes.push(`Open: ${wos.join(', ')}`)
  const severe = !!corrosion && GRADE_RANK[corrosion.grade] >= GRADE_RANK.severe
  const verdict: Verdict = readings.some((x) => x.state === 'trip') || severe || health?.stage === 'alarm' || health?.stage === 'failed' ? 'action' : bad.length || health?.stage === 'alert' || (corrosion && corrosion.grade === 'moderate') ? 'watch' : 'ok'
  const frame = clips.get(r.id)?.frames.at(-1)
  r.results.push({ tag: stop.tag, name: stop.name, platform: stop.platform, t, status: 'inspected', readings, health, openWos: wos, corrosion, verdict, notes, thumb: frame?.url })
  r.idx++
  nextStop(r)
}

function finish(r: Run) {
  const pad = padPoint(r.unit)
  Object.assign(unitPose[r.unit], pad, { moved: 0, scanning: false, holding: false })
  closeHold(r, 'mission ended')
  const inspected = r.results.filter((s) => s.status === 'inspected')
  const action = inspected.filter((s) => s.verdict === 'action').length
  const watch = inspected.filter((s) => s.verdict === 'watch').length
  const left = r.results.length - inspected.length
  const minGap = Number.isFinite(r.minGap) ? Math.round(r.minGap * 10) / 10 : null
  const words = r.status === 'complete' ? 'Complete' : r.status === 'recalled' ? `Recalled (${r.reason})` : `Aborted (${r.reason})`
  const report: InspectionReport = {
    id: `IR-${String(++reportSeq).padStart(4, '0')}`,
    missionId: r.id,
    unit: r.unit,
    label: r.label,
    status: r.status,
    reason: r.reason,
    t0: r.t0,
    t1: simNow().t,
    missionS: Math.round(r.clock),
    ffMax: r.ffMax,
    stops: r.results,
    holds: r.holds,
    minGap,
    workersOn: r.workersOn || useStore.getState().workers,
    stopM: UNIT_SPEC[r.unit].stopM,
    keepM: UNIT_SPEC[r.unit].keepM,
    summary: `${words}. ${inspected.length} of ${r.results.length} inspected: ${action} need action, ${watch} to watch${left ? `, ${left} not inspected` : ''}. ${r.holds.length} stop${r.holds.length === 1 ? '' : 's'} for workers.`,
    simulated: true,
  }
  delete runs[r.unit]
  useInspection.setState((s) => ({ reports: [report, ...s.reports].slice(0, REPORT_CAP), openReport: report.id, ff: UNITS.some((u) => runs[u]) ? s.ff : 1 }))
  raiseFindings(report)
  publish()
}

function raiseFindings(report: InspectionReport) {
  for (const s of report.stops) {
    const c = s.corrosion
    if (!c) continue
    const values = [`${s.tag} wall ${c.wallPct} % of nominal (${c.grade})`, `Rate ${c.rateMmPerYr} mm/yr · last survey ${c.lastSurveyPct} %`]
    if (GRADE_RANK[c.grade] >= GRADE_RANK.severe)
      raise({
        severity: c.grade === 'critical' ? 'critical' : 'warning',
        source: 'inspection',
        rule: 'corrosion-critical',
        platform: s.platform,
        title: `Corrosion ${c.grade} on ${s.tag}: wall ${c.wallPct} %`,
        body: `Simulated inspection ${report.id} (${UNIT_SPEC[report.unit].label}) graded ${s.tag} ${c.grade}: ${c.wallPct} % of nominal wall left, ${c.rateMmPerYr} mm/yr. Simulated data, not a survey.`,
        tags: [s.tag],
        observer: 'assistant',
        evidence: [{ report: report.id, tag: s.tag, wallPct: c.wallPct, grade: c.grade, rate: c.rateMmPerYr, method: c.method }],
        values,
        actions: [`Verify the finding on ${s.tag} with a manual UT survey`, 'Raise a condition-based work order and a fitness-for-service review', 'Set the next inspection date from the corrosion rate'],
      })
    if (c.rateMmPerYr > 0.35)
      raise({
        severity: 'warning',
        source: 'inspection',
        rule: 'corrosion-accelerating',
        platform: s.platform,
        title: `Corrosion accelerating on ${s.tag}: ${c.rateMmPerYr} mm/yr`,
        body: `Simulated inspection ${report.id}: wall ${c.lastSurveyPct} % at the last survey, ${c.wallPct} % now. Simulated data, not a survey.`,
        tags: [s.tag],
        observer: 'assistant',
        evidence: [{ report: report.id, tag: s.tag, rate: c.rateMmPerYr, lastSurveyPct: c.lastSurveyPct, wallPct: c.wallPct }],
        values,
        actions: [`Check the coating and exposure at ${s.tag}`, 'Shorten the inspection interval'],
      })
  }
}

// ---------------------------------------------------------------- stepping (every frame, scene/InspectionUnits.tsx)

function startHold(r: Run, near: { id: string | null; gap: number }) {
  if (!near.id) return
  r.hold = { workerId: near.id, t: simNow().t, forS: 0, clearS: 0, minGap: near.gap, cornered: false, nextReplan: REPLAN_S, down: descending(r) }
  unitPose[r.unit].holding = true
  r.wantFrame = 'hold'
}
function closeHold(r: Run, outcome: HoldEvent['outcome']) {
  const h = r.hold
  if (!h) return
  r.holds.push({ worker: workerName(h.workerId), t: h.t, forS: Math.round(h.forS), minGap: Math.round(h.minGap * 10) / 10, outcome, cornered: h.cornered })
  r.hold = null
  unitPose[r.unit].holding = false
}

/** one step towards the next waypoint; false when a worker stops it. Steps are never longer than STEP_M. */
function move(r: Run, metres: number): boolean {
  const pose = unitPose[r.unit]
  const spec = UNIT_SPEC[r.unit]
  let left = metres
  while (left > 1e-6 && r.route.length) {
    const q = r.route[0]
    const d = dist(pose, q)
    if (d < 1e-3) {
      r.route.shift()
      continue
    }
    const step = Math.min(left, d, STEP_M)
    const n: Pt = { x: pose.x + ((q.x - pose.x) / d) * step, y: pose.y + ((q.y - pose.y) / d) * step, z: pose.z + ((q.z - pose.z) / d) * step }
    const down = descending(r)
    const before = nearestWorker(r.unit, pose, down)
    const after = nearestWorker(r.unit, n, down)
    if (after.gap < spec.stopM && (down || after.gap < before.gap)) {
      startHold(r, after)
      return false
    }
    const last = r.trail[r.trail.length - 1]
    if (!last || dist(last, pose) > 0.5) {
      r.trail.push({ x: pose.x, y: pose.y, z: pose.z })
      if (r.trail.length > TRAIL_CAP) r.trail.shift()
    }
    const dh = Math.hypot(n.x - pose.x, n.z - pose.z)
    if (dh > 1e-4) pose.yaw = Math.atan2(-(n.x - pose.x), -(n.z - pose.z))
    pose.moved += step
    pose.x = n.x
    pose.y = n.y
    pose.z = n.z
    left -= step
  }
  return true
}

/** the worker came to us: open the gap along the way we came, or along the way we're going */
function retreat(r: Run, gap: number, dt: number) {
  const pose = unitPose[r.unit]
  const spec = UNIT_SPEC[r.unit]
  const d = spec.retreat * dt
  // waypoints already reached are behind us: without this a unit standing on a corner of its route has "nowhere to go"
  while (r.trail.length && dist(pose, r.trail[r.trail.length - 1]) < 0.02) r.trail.pop()
  while (r.route.length > 1 && dist(pose, r.route[0]) < 0.02) r.route.shift()
  const toward = (q: Pt | undefined): Pt | null => {
    if (!q) return null
    const l = dist(pose, q)
    if (l < 0.02) return null
    const k = Math.min(1, d / l)
    return { x: pose.x + (q.x - pose.x) * k, y: pose.y + (q.y - pose.y) * k, z: pose.z + (q.z - pose.z) * k }
  }
  const back = toward(r.trail[r.trail.length - 1])
  const ahead = toward(r.route[0])
  const down = descending(r)
  // for the drone height is distance too: straight back up its column is a way out
  const score = (p: Pt | null) => (p ? Math.min(nearestWorker(r.unit, p, down).gap, 1e6) + (r.unit === 'drone' ? p.y - pose.y : 0) : -1)
  const gapBack = score(back)
  const gapAhead = score(ahead)
  if (Math.max(gapBack, gapAhead) <= gap + 1e-4) {
    if (r.hold) r.hold.cornered = true
    return
  }
  // leaving the stop: the scan picks up where it was when the unit is back on station
  if (r.phase === 'scanning') {
    r.phase = 'enroute'
    unitPose[r.unit].scanning = false
    if (!r.route.length) r.route = [{ x: pose.x, y: pose.y, z: pose.z }]
  }
  if (gapBack >= gapAhead) {
    const q = back!
    const first = r.route[0]
    if (!first || dist(first, pose) > 0.3) r.route.unshift({ x: pose.x, y: pose.y, z: pose.z })
    Object.assign(pose, { x: q.x, y: q.y, z: q.z })
  } else Object.assign(pose, { x: ahead!.x, y: ahead!.y, z: ahead!.z })
  pose.moved += d
}

/** route around every worker near the robot: square keep-outs just inside the stop radius */
function detour(r: Run): boolean {
  if (r.unit !== 'robot' || !r.route.length) return false
  const pose = unitPose[r.unit]
  const spec = UNIT_SPEC[r.unit]
  const avoid: PlanRect[] = []
  for (const k in workerPose) {
    const w = workerPose[k]
    if (gapTo(r.unit, pose, w) > 40) continue
    avoid.push({ x0: w.x - spec.stopM + 0.1, x1: w.x + spec.stopM - 0.1, z0: w.z - spec.stopM + 0.1, z1: w.z + spec.stopM - 0.1 })
  }
  const leg = robotLeg(pose, r.route[r.route.length - 1], avoid)
  if (!leg) return false
  r.route = leg
  closeHold(r, 'replanned')
  return true
}

function holdStep(r: Run, near: { id: string | null; gap: number }, dt: number) {
  const h = r.hold!
  const spec = UNIT_SPEC[r.unit]
  h.forS += dt
  if (near.id) h.workerId = near.id
  h.minGap = Math.min(h.minGap, near.gap)
  if (near.gap < spec.keepM) retreat(r, near.gap, dt)
  h.clearS = near.gap >= spec.stopM + RESUME_M ? h.clearS + dt : 0
  if (h.clearS >= RESUME_S) return closeHold(r, 'resumed')
  if (h.forS >= h.nextReplan) {
    h.nextReplan += REPLAN_S
    if (detour(r)) return
  }
  // give the stop up, not the standoff: the way home waits as long as it takes
  if (h.forS >= SKIP_S && r.phase !== 'returning' && r.idx < r.stops.length) {
    closeHold(r, 'skipped stop')
    r.results.push(skipped(r.stops[r.idx], `Worker stayed inside the ${spec.stopM} m standoff for ${SKIP_S} s`))
    r.idx++
    nextStop(r)
  }
}

function arrive(r: Run) {
  if (r.phase === 'returning') return finish(r)
  r.phase = 'scanning'
  r.scan ??= { left: UNIT_SPEC[r.unit].scanS, next: 0, n: 0, sum: new Map(), frame: false, waited: 0 }
  unitPose[r.unit].scanning = true
  r.wantFrame = `scan ${r.stops[r.idx].tag}`
}

function stepRun(r: Run, dt: number, speed: number, ff: number) {
  const pose = unitPose[r.unit]
  const spec = UNIT_SPEC[r.unit]
  pose.moved = 0
  const near = nearestWorker(r.unit, pose, descending(r))
  if (near.gap < r.minGap) r.minGap = near.gap
  if (near.gap < Number.POSITIVE_INFINITY) r.workersOn = true
  if (!r.hold && near.gap < (r.phase === 'scanning' ? spec.stopM : spec.keepM)) startHold(r, near)
  if (r.hold) holdStep(r, near, dt)
  // a hold can end the mission's route (skip → home) but never moves it forward in the same frame
  const rate = r.hold ? 0 : speed <= 0 ? 0 : Math.max(speed, ff)
  const drainS = r.hold ? dt : dt * rate
  battery[r.unit] = Math.max(1, battery[r.unit] - spec.drain * drainS)
  if (rate > 0) {
    const mdt = dt * rate
    r.clock += mdt
    if (r.phase === 'scanning' && r.scan) {
      const s = r.scan
      const stop = r.stops[r.idx]
      if (s.left <= s.next || s.n === 0) {
        readItem(stop, s)
        s.next = s.left - spec.scanS / 4
      }
      s.left -= mdt
      if (s.left <= 0) {
        s.waited += dt
        if (s.frame || s.waited >= FRAME_WAIT_S) finishStop(r)
      }
    } else if (r.route.length) {
      const horizontal = r.unit === 'robot' || Math.abs(r.route[0].y - pose.y) < 0.05
      if (move(r, mdt * (horizontal ? spec.speed : spec.climb)) && !r.route.length) arrive(r)
      else if (r.phase === 'launching' && r.route.length && (r.unit === 'robot' ? r.trail.length > 2 : pose.y >= CRUISE_Y - 0.1)) r.phase = 'enroute'
    } else arrive(r)
    if (r.status === 'complete' && r.phase !== 'returning' && battery[r.unit] <= spec.reserve) recall(r, 'recalled', `Low battery (${Math.round(battery[r.unit])} %)`)
  }
  // the camera: the worker it stopped for, the item on station, otherwise the way ahead
  if (r.hold) {
    const w = workerPose[r.hold.workerId]
    if (w) Object.assign(pose.look, { x: w.x, y: w.footY + 1.2, z: w.z })
  } else if (r.phase === 'scanning' && r.stops[r.idx]) Object.assign(pose.look, r.stops[r.idx].look)
  else if (r.route[0]) {
    const q = r.route[0]
    const d = Math.max(1e-3, Math.hypot(q.x - pose.x, q.z - pose.z))
    const ahead = Math.min(d, 12)
    Object.assign(pose.look, { x: pose.x + ((q.x - pose.x) / d) * ahead, y: r.unit === 'drone' ? pose.y - 3 : pose.y + 1, z: pose.z + ((q.z - pose.z) / d) * ahead })
  }
}

/** advance every mission by `dt` wall seconds; the scene calls this once a frame */
export function stepUnits(dt: number) {
  const { speed } = simNow()
  const { ff } = useInspection.getState()
  let active = false
  for (const u of UNITS) {
    const r = runs[u]
    if (r) {
      active = true
      stepRun(r, dt, speed, ff)
    }
  }
  if (active) publish()
}

// ---------------------------------------------------------------- the recorder (scene/InspectionRecorder.tsx)

/** the units' bodies, hidden from their own cameras (scene/InspectionUnits.tsx registers them) */
export const unitBodies: Partial<Record<UnitId, { visible: boolean }>> = {}

/** the next frame to record, at most one a turn: a marked moment first, then the mission-clock cadence */
export function nextCapture(): { unit: UnitId; mark: string | null } | null {
  for (const u of UNITS) {
    const r = runs[u]
    if (r?.wantFrame) return { unit: u, mark: r.wantFrame }
  }
  for (const u of UNITS) {
    const r = runs[u]
    const c = r && clips.get(r.id)
    if (r && c && r.clock - r.lastFrame >= c.every) return { unit: u, mark: null }
  }
  return null
}
/** what the camera burns into the frame */
export function captureInfo(u: UnitId) {
  const r = runs[u]
  if (!r) return null
  const near = r.hold ? nearestWorker(u, unitPose[u], descending(r)) : null
  return { label: UNIT_SPEC[u].label, mission: r.id, tag: r.stops[r.idx]?.tag ?? null, phase: r.phase, clock: r.clock, t: simNow().t, ff: Math.max(useInspection.getState().ff, simNow().speed), hold: r.hold ? `STOPPED FOR ${workerName(r.hold.workerId).toUpperCase()} · ${(near?.gap ?? 0).toFixed(1)} m` : null }
}
/** claim the frame before rendering, so one slow read-back never queues a second */
export function claimCapture(u: UnitId, mark: string | null) {
  const r = runs[u]
  if (!r) return
  r.lastFrame = r.clock
  if (mark && r.wantFrame === mark) r.wantFrame = null
}
export function pushClipFrame(u: UnitId, missionId: string, url: string, mark: string | null, t: number, clock: number) {
  const c = clips.get(missionId)
  if (!c) return
  c.frames.push({ url, t, clock, ...(mark ? { mark } : {}) })
  if (c.frames.length > CLIP_CAP) thin(c)
  const r = runs[u]
  if (r?.id === missionId && r.scan && mark?.startsWith('scan')) r.scan.frame = true
}

// ---------------------------------------------------------------- plugin

function stopAll(reports: boolean, why: string) {
  for (const u of UNITS) {
    const r = runs[u]
    if (!r) continue
    if (reports) {
      r.status = 'aborted'
      r.reason = why
      for (const s of r.stops.slice(r.results.length)) r.results.push(skipped(s, why))
      finish(r)
    } else {
      delete runs[u]
      Object.assign(unitPose[u], padPoint(u), { moved: 0, scanning: false, holding: false })
    }
  }
}

registerSimPlugin({
  id: 'inspection',
  step(dt) {
    if (!useStore.getState().inspection) {
      if (runs.robot || runs.drone) stopAll(true, 'Inspections switched off')
      return
    }
    if (!isAlphaField(plantNow())) {
      if (runs.robot || runs.drone) stopAll(true, 'Another plant was loaded')
      return
    }
    const block = fieldBlock()
    for (const u of UNITS) {
      const r = runs[u]
      if (r) {
        if (block && r.phase !== 'returning') recall(r, 'recalled', block)
        else if (u === 'drone' && r.phase !== 'returning' && windSpeed() > DRONE_WIND_LIMIT) recall(r, 'recalled', `Wind ${Math.round(windSpeed())} m/s`)
      } else if (battery[u] < 100) battery[u] = Math.min(100, battery[u] + UNIT_SPEC[u].charge * dt)
    }
    publish()
  },
  reset() {
    stopAll(false, '')
    missionSeq = 0
    reportSeq = 0
    battery.robot = 100
    battery.drone = 100
    clips.clear()
    resetCorrosion()
    lastKey = ''
    useInspection.setState({ units: { robot: idle(), drone: idle() }, ff: 1, reports: [], openReport: null })
  },
})

if (import.meta.env.DEV) Object.assign(window, { __inspect: { droneRoute: (from: Pt, to: Pt) => droneLeg(from, to), useInspection, dispatch: dispatchInspection, abort: abortInspection, setFastForward, unitPose, clips, reach, stopFor, runs, alerts: () => useAlerts.getState().alerts } })
