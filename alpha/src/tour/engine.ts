/**
 * Guided tour engine. A tour is a list of stops; a stop either flies the camera somewhere (and holds
 * while its narration is read) or drops the walker somewhere and plays a script of beats — walk to a
 * point (A* across the deck), climb a stair or ladder, open a building's doors, turn to look at an
 * item and show its live data / knowledge card, or just narrate. The walker drives itself (walkAuto);
 * the user can pause, skip, go back, change speed, or take over with the arrow keys at any time.
 */
import { create } from 'zustand'
import type { PlanRect, Vec3 } from '../model/types'
import { usePlantStore } from '../state/plantStore'
import { useStore } from '../state/store'
import { useSim } from '../state/sim'
import { moduleDoors, walkAuto, walkLevels, walkPose, type AutoPt } from '../scene/Walk'
import { planPath, stairPath } from '../scene/walkPath'

/** tour walking pace on decks and on stairs, m/s (×2 at double speed) */
const WALK_SPEED = 3.2
const STAIR_SPEED = 2.2

export type Say = string | (() => string)
export const say = (s: Say | undefined) => (typeof s === 'function' ? s() : (s ?? ''))

export type Beat =
  /** walk across the current deck to a point (path found around everything); `say` narrates the walk */
  | { goto: [number, number]; speed?: number; say?: Say }
  /** climb / descend the flights (or ladder) inside `stair` between two deck-local heights, then step off onto the deck at `off` */
  | { stair: PlanRect; from: number; to: number; off: [number, number]; speed?: number; say?: Say }
  /** walk exact points [x, z, floor height] (off-deck surfaces: helideck, landings) */
  | { via: [number, number, number][]; speed?: number }
  /** open a building's doors (all of them) before walking in */
  | { open: string }
  /** turn to an item, show its live data (and optionally its knowledge card) for a while */
  /** (`eye`: see it through the person's eyes — where the follow camera would sit behind steel) */
  | { look: string; at?: [number, number, number]; hold?: number; say?: Say; kb?: boolean; eye?: boolean }
  /** turn toward a point [x, deck-local y, z] */
  | { face: [number, number, number]; hold?: number; say?: Say }
  /** narration only */
  | { say: Say; hold?: number }

export interface Stop {
  id: string
  title: string
  /** where this is (deck and elevation) */
  where: string
  say: Say
  /** fly the camera here and hold */
  fly?: { pos: Vec3; target: Vec3; ceiling?: boolean; cut?: number; hold?: number }
  /** walk: start here (teleports only if the walker isn't already there), then play the beats */
  walk?: { start: { level: string; at: [number, number]; face?: [number, number] }; beats: Beat[] }
}

interface TourState {
  stops: Stop[]
  on: boolean
  playing: boolean
  /** the user took over (arrow keys / drag) — resume continues from where they are */
  takenOver: boolean
  done: boolean
  i: number
  beat: number
  /** narration override from the current beat */
  line: string | null
  rate: 1 | 2
  /** progress through the current stop, 0..1 (approximate for walks) */
  progress: number
}

export const useTour = create<TourState>(() => ({ stops: [], on: false, playing: false, takenOver: false, done: false, i: 0, beat: 0, line: null, rate: 1, progress: 0 }))

/** what the tour changed, to put back on exit */
let saved: { walkView: 'first' | 'third' } | null = null

// ------------------------------------------------------------------ runner state (not reactive)
const run = {
  timer: 0 as ReturnType<typeof setInterval> | 0,
  last: 0,
  /** seconds into the current beat / fly hold (scaled by rate) */
  t: 0,
  started: false,
  /** seconds the walker has been facing the look target */
  held: 0,
  /** walking legs: expected wall-clock duration (s), for the timeout, and the wall-clock time spent */
  budget: 0,
  wall: 0,
  /** time to wait before the first beat of a walk stop (the walker settles in) */
  settle: 0,
  timeouts: 0,
  pausedAt: null as null | { x: number; z: number; level: number },
  /** doors the tour opened (closed again when it moves on) */
  doors: new Set<string>(),
}

function closeTourDoors() {
  const sim = useSim.getState()
  for (const k of run.doors) sim.setDoor(k, false)
  run.doors.clear()
}
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tourRun = run

const st = () => useTour.getState()
const set = (p: Partial<TourState>) => useTour.setState(p)

export function startTour(stops: Stop[]) {
  const s = useStore.getState()
  saved = { walkView: s.walkView }
  walkAuto.onInterrupt = takeOver
  walkAuto.snaps = 0
  run.timeouts = 0
  set({ stops, on: true, playing: true, takenOver: false, done: false, rate: st().rate })
  s.setKbTag(null)
  s.select(null)
  enter(0)
  if (!run.timer) {
    run.last = performance.now()
    run.timer = setInterval(tick, 100)
  }
}

export function exitTour() {
  if (run.timer) clearInterval(run.timer)
  run.timer = 0
  walkAuto.active = false
  walkAuto.path = []
  walkAuto.face = null
  walkAuto.onInterrupt = null
  closeTourDoors()
  const s = useStore.getState()
  if (saved) useStore.setState({ walkView: saved.walkView })
  saved = null
  s.setKbTag(null)
  s.setLookAt(null)
  set({ on: false, playing: false, takenOver: false, done: false, line: null })
}

export function togglePlay() {
  const t = st()
  if (t.done) return enter(0)
  if (t.playing) return pause()
  resume()
}

function pause() {
  walkAuto.active = false
  run.pausedAt = { x: walkPose.x, z: walkPose.z, level: walkPose.level }
  set({ playing: false })
}

/** the user moved: hand them the controls, the tour waits */
function takeOver() {
  walkAuto.active = false
  run.pausedAt = { x: walkPose.x, z: walkPose.z, level: walkPose.level }
  set({ playing: false, takenOver: true })
}

function resume() {
  const t = st()
  const stop = t.stops[t.i]
  set({ playing: true, takenOver: false })
  if (stop?.walk && run.started) {
    if (!useStore.getState().walk) return enter(t.i) // they left the walkthrough: start the stop again
    const p = run.pausedAt
    const moved = p && (Math.hypot(walkPose.x - p.x, walkPose.z - p.z) > 1.5 || walkPose.level !== p.level)
    if (moved) {
      // they walked off somewhere: carry on walking from here if this beat is a deck walk, else restart the stop
      const b = stop.walk.beats[t.beat]
      if (b && 'goto' in b) beginBeat(b)
      else return enter(t.i)
    }
    walkAuto.active = true
  }
  run.pausedAt = null
}

export function setRate(rate: 1 | 2) {
  set({ rate })
  const stop = st().stops[st().i]
  const b = stop?.walk?.beats[st().beat]
  if (b && ('goto' in b || 'stair' in b || 'via' in b)) walkAuto.speed = (b.speed ?? ('stair' in b ? STAIR_SPEED : WALK_SPEED)) * rate
}

export function next() {
  const t = st()
  if (t.i + 1 < t.stops.length) enter(t.i + 1)
  else finish()
}
export function prev() {
  enter(Math.max(0, st().i - 1))
}
export function goTo(i: number) {
  enter(Math.max(0, Math.min(st().stops.length - 1, i)))
}

function finish() {
  walkAuto.active = false
  set({ done: true, playing: false, line: null, progress: 1 })
}

/** start stop i */
function enter(i: number) {
  const t = st()
  const stop = t.stops[i]
  if (!stop) return
  const s = useStore.getState()
  walkAuto.active = false
  walkAuto.path = []
  walkAuto.face = null
  closeTourDoors()
  s.setKbTag(null)
  s.setLookAt(null)
  s.select(null)
  run.t = 0
  run.held = 0
  run.started = false
  run.pausedAt = null
  set({ i, beat: 0, line: null, playing: true, takenOver: false, done: false, progress: 0 })
  if (stop.fly) {
    const f = stop.fly
    s.setLayer('ceiling', f.ceiling ?? true)
    if (f.cut !== undefined) s.setSection({ enabled: true, min: [-31, -14, -21], max: [31, f.cut, 21] })
    else s.setSection({ enabled: false })
    s.requestFlyTo(f.pos, f.target)
  } else if (stop.walk) {
    const w = stop.walk
    const plant = usePlantStore.getState().plant
    const levels = walkLevels(plant)
    const li = Math.max(0, levels.findIndex((l) => l.id === w.start.level))
    const there = s.walk && walkPose.level === li && Math.abs(walkPose.floor - levels[li].y) < 0.05 && Math.hypot(walkPose.x - w.start.at[0], walkPose.z - w.start.at[1]) < 2
    if (!there) s.startWalk(w.start)
    // the tour shows the person walking (the user's own choice is put back on exit)
    useStore.setState({ walkView: 'third' })
    run.settle = there ? 0.2 : 1.0
  }
}

function beginBeat(b: Beat) {
  const plant = usePlantStore.getState().plant
  const s = useStore.getState()
  const rate = st().rate
  run.t = 0
  run.held = 0
  run.started = true
  walkAuto.face = null
  walkAuto.facing = false
  // the tour follows the person, except for looks seen through their eyes
  useStore.setState({ walkView: 'look' in b && b.eye ? 'first' : 'third' })
  const walkTo = (pts: AutoPt[] | null, speed = WALK_SPEED) => {
    walkAuto.path = pts ?? []
    walkAuto.speed = speed * rate
    walkAuto.active = st().playing
    let len = 0
    let px = walkPose.x
    let pz = walkPose.z
    for (const p of walkAuto.path) (len += Math.hypot(p.x - px, p.z - pz)), (px = p.x), (pz = p.z)
    run.budget = (len / (speed * rate)) * 2.5 + 8
    run.wall = 0
    if (!pts) console.warn('[tour] no path for beat', JSON.stringify(b))
  }
  if ('goto' in b) {
    s.setLookAt(null)
    s.setKbTag(null)
    set({ line: b.say ? say(b.say) : null })
    walkTo(planPath(plant, walkPose.level, [walkPose.x, walkPose.z], b.goto), b.speed)
  } else if ('stair' in b) {
    s.setLookAt(null)
    s.setKbTag(null)
    set({ line: b.say ? say(b.say) : null })
    walkTo([...stairPath(plant, b.stair, b.from, b.to), { x: b.off[0], z: b.off[1], y: b.to }], b.speed ?? STAIR_SPEED)
  } else if ('via' in b) {
    s.setLookAt(null)
    walkTo(
      b.via.map(([x, z, y]) => ({ x, z, y })),
      b.speed,
    )
  } else if ('open' in b) {
    const m = plant.equipment.find((e) => e.tag === b.open)
    if (m?.kind === 'module')
      for (const d of moduleDoors(m)) {
        const key = `${m.tag}/${d.id}`
        if (!useSim.getState().doors[key]) run.doors.add(key)
        useSim.getState().setDoor(key, true)
      }
  } else if ('look' in b) {
    walkAuto.path = []
    walkAuto.face = b.at ?? b.look
    walkAuto.active = st().playing
    s.setLookAt({ tag: b.look, kind: 'equipment' })
    s.setKbTag(b.kb ? b.look : null)
    if (b.say) set({ line: say(b.say) })
  } else if ('face' in b) {
    walkAuto.path = []
    walkAuto.face = b.face
    walkAuto.active = st().playing
    s.setLookAt(null)
    if (b.say) set({ line: say(b.say) })
  } else if ('say' in b) {
    set({ line: say(b.say) })
  }
}

/** is the current beat finished? */
function beatDone(b: Beat, dt: number): boolean {
  if ('goto' in b || 'stair' in b || 'via' in b) {
    if (!walkAuto.path.length) return true
    if (run.wall > run.budget) {
      console.warn(`[tour] beat timed out: ${JSON.stringify(b).slice(0, 80)}`)
      run.timeouts++
      // finish the leg where it was going, so the next one starts on the right deck
      const end = walkAuto.path[walkAuto.path.length - 1]
      const levels = walkLevels(usePlantStore.getState().plant)
      walkPose.x = end.x
      walkPose.z = end.z
      walkPose.floor = end.y
      const li = levels.findIndex((l) => Math.abs(l.y - end.y) < 0.01)
      if (li >= 0 && li !== walkPose.level) (walkPose.level = li), useStore.getState().setWalkLevel(li)
      walkAuto.path = []
      return true
    }
    return false
  }
  if ('open' in b) return run.t > 0.3
  if ('look' in b || 'face' in b) {
    if (walkAuto.facing || run.t > 5) run.held += dt
    return run.held >= (b.hold ?? 6)
  }
  return run.t >= (b.hold ?? 5)
}

function tick() {
  const now = performance.now()
  // a hidden tab stops the frame loop (the walker freezes) but not this timer: wait for it to come back
  if (document.hidden) {
    run.last = now
    return
  }
  const real = Math.min(0.5, (now - run.last) / 1000)
  const dt = real * st().rate
  run.last = now
  const t = st()
  if (!t.on || !t.playing || t.done) return
  const stop = t.stops[t.i]
  if (!stop) return
  run.t += dt
  run.wall += real
  if (stop.fly) {
    const hold = stop.fly.hold ?? 9
    set({ progress: Math.min(1, run.t / hold) })
    if (run.t >= hold) next()
    return
  }
  const w = stop.walk!
  // the user left the walkthrough some other way (Decks, a view preset): pause
  if (!useStore.getState().walk && run.t > 1.5) return void set({ playing: false, takenOver: true })
  if (run.settle > 0) {
    run.settle -= dt
    run.t = 0
    return
  }
  const b = w.beats[t.beat]
  if (!b) {
    // all beats done: a moment, then on to the next stop
    if (run.t > 1.2) next()
    return
  }
  if (!run.started) return beginBeat(b)
  if (beatDone(b, dt)) {
    run.started = false
    set({ beat: t.beat + 1, progress: (t.beat + 1) / w.beats.length })
    if (t.beat + 1 >= w.beats.length) run.t = 0
  }
}

/** for the headless tour test */
export const tourStats = () => ({ snaps: walkAuto.snaps, timeouts: run.timeouts })
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tour = { useTour, tourStats, setRate, goTo, togglePlay, exitTour }
