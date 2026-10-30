/**
 * Simulated field workers walking the decks (plan 06). Mounted by Scene.tsx only while Toolbar → Workers
 * is on, in WORLD coordinates (not inside the deck-local group).
 *
 * Each worker loops: plan an A* route (walkPath.planPath, at most ONE search per frame across all workers)
 * to a task point on their own level and platform → walk it at 1.2–1.5 m/s wall time → idle 6–20 s facing
 * the equipment → repeat. Poses are written into the mutable `workerPose` (CCTV reads it).
 *
 * Figure (people/crowd.ts): the walk-mode avatar's body at a lower detail level — FR coverall (orange, red or navy
 * with hi-vis panels) with retro tape, belt + radio, gloves, steel-toe boots, glasses, a face and a haircut — drawn
 * as 11 InstancedMeshes for ALL workers, animated with the avatar's gait (people/gait.ts) from each worker's
 * measured movement. Per-worker coverall / skin / hair / hat colour and height (±~4 %). PPE follows the live
 * roster flags every frame: hard hat (white / orange) vs visible hair, hi-vis vest, a bright 4-gas monitor at
 * the collar. Not pickable, no shadow casting.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DECK_WORLD_Y, WORKER_COUNT } from '../state/store'
import { usePlant } from '../state/plantStore'
import { planPath } from './walkPath'
import { walkLevels, type AutoPt } from './Walk'
import { setWorkerTask, taskText, useWorkers, workerCmd, workerLevelIndex, workerPose, workerTaskPoints, type SendWorkerFn, type TaskPoint } from '../safety/workers'
import type { WorkerInfo } from '../safety/types'
import type { Plant } from '../model/types'
import { Crowd, lookFor } from './people/crowd'
import { createGait, stepGait, type GaitState } from './people/gait'

// ---------------------------------------------------------------- agents

const STEP = 0.78 // m per step (Agent.phase; the figures take their gait from people/gait.ts)

interface Agent {
  w: WorkerInfo
  li: number
  points: TaskPoint[]
  x: number
  z: number
  footY: number
  yaw: number
  speed: number
  walkSpeed: number
  phase: number
  mode: 'idle' | 'queued' | 'walk' | 'stuck'
  path: AutoPt[]
  seg: number
  goal: TaskPoint | null
  /** wall-clock seconds when idling ends */
  until: number
  faceYaw: number | null
  /** seconds to stay at the next goal instead of the usual 6–20 s (dev: __sendWorker) */
  hold?: number
  fails: number
  rng: () => number
}

function prng(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** where a worker starts: their usual spot, or the next one along if somebody already stands there */
function startPoint(points: TaskPoint[], i: number, agents: Agent[]): TaskPoint | null {
  const taken = new Set(agents.map((a) => a.goal))
  for (let k = 0; k < points.length; k++) {
    const p = points[(i * 7 + 2 + k) % points.length]
    if (!taken.has(p)) return p
  }
  return points.length ? points[(i * 7 + 2) % points.length] : null
}

function buildAgent(plant: Plant, w: WorkerInfo, i: number, now: number, agents: Agent[]): Agent {
  const li = workerLevelIndex(w, plant)
  const points = workerTaskPoints(w, plant)
  const rng = prng(1013 * (i + 1))
  const start = startPoint(points, i, agents)
  const y = walkLevels(plant)[li]?.y ?? 0
  return {
    w,
    li,
    points,
    x: start?.x ?? 0,
    z: start?.z ?? 0,
    footY: DECK_WORLD_Y + y,
    yaw: start ? yawTo(start.face[0] - start.x, start.face[1] - start.z) : 0,
    speed: 0,
    walkSpeed: 1.2 + rng() * 0.3,
    phase: 0,
    mode: points.length ? 'idle' : 'stuck',
    path: [],
    seg: 0,
    goal: start,
    until: now + 1 + rng() * 6, // staggered first departures
    faceYaw: null,
    fails: 0,
    rng,
  }
}

/** advance every worker by dt (wall seconds); at most one A* search per call */
function stepAgents(plant: Plant, agents: Agent[], queue: Agent[], dt: number, now: number) {
  const q = queue.shift()
  if (q) {
    // a fresh point, not where anyone else is heading
    const taken = new Set(agents.map((a) => a.goal))
    const free = q.points.filter((p) => !taken.has(p))
    const choices = free.length ? free : q.points.filter((p) => p !== q.goal)
    const goal = choices.length ? choices[Math.floor(q.rng() * choices.length)] : null
    const path = goal ? planPath(plant, q.li, [q.x, q.z], [goal.x, goal.z]) : null
    if (path && path.length) {
      q.path = path
      q.seg = 0
      q.goal = goal
      q.mode = 'walk'
      q.fails = 0
    } else if (++q.fails >= 3) {
      q.mode = 'stuck'
      q.until = now + 60 // stand still, try again in a minute
    } else {
      q.mode = 'idle'
      q.until = now + 1 + q.rng() * 2
    }
  }

  for (const a of agents) {
    if (a.mode === 'idle' || a.mode === 'stuck') {
      a.speed = 0
      if (a.faceYaw !== null) a.yaw += wrap(a.faceYaw - a.yaw) * Math.min(1, dt * 3)
      if (now >= a.until && a.points.length) {
        if (a.mode === 'stuck') a.fails = 0
        a.mode = 'queued'
        queue.push(a)
      }
    } else if (a.mode === 'walk') {
      let step = a.walkSpeed * dt
      while (step > 0 && a.seg < a.path.length) {
        const p = a.path[a.seg]
        const dx = p.x - a.x
        const dz = p.z - a.z
        const d = Math.hypot(dx, dz)
        a.footY = DECK_WORLD_Y + p.y
        if (d < 1e-3 || step >= d) {
          a.x = p.x
          a.z = p.z
          step -= d
          a.seg++
          continue
        }
        const turn = wrap(yawTo(dx, dz) - a.yaw)
        a.yaw += Math.sign(turn) * Math.min(Math.abs(turn), dt * 5)
        // slow down for sharp turns so the figure doesn't slide sideways around corners
        const k = Math.abs(turn) > 1 ? 0.35 : 1
        a.x += (dx / d) * step * k
        a.z += (dz / d) * step * k
        step = 0
      }
      a.speed = a.walkSpeed
      a.phase += (a.walkSpeed * dt) / STEP
      if (a.seg >= a.path.length) {
        a.mode = 'idle'
        a.speed = 0
        a.until = now + (a.hold ?? 6 + a.rng() * 14)
        a.hold = undefined
        const g = a.goal
        a.faceYaw = g ? yawTo(g.face[0] - a.x, g.face[1] - a.z) : null
        if (g) setWorkerTask(a.w.id, taskText(a.w, g))
      }
    }
    const pose = workerPose[a.w.id]
    if (pose) {
      pose.x = a.x
      pose.z = a.z
      pose.footY = a.footY
      pose.yaw = a.yaw
      pose.speed = a.speed
    }
  }
}

// roster by id, rebuilt only when the roster array changes (PPE flags change during the session)
let rosterRef: WorkerInfo[] | null = null
const rosterById = new Map<string, WorkerInfo>()

/** pose every figure: gait from each worker's measured movement, PPE from the live roster */
function writeInstances(crowd: Crowd, agents: Agent[], gaits: GaitState[], roster: WorkerInfo[], dt: number) {
  if (roster !== rosterRef) {
    rosterRef = roster
    rosterById.clear()
    for (const w of roster) rosterById.set(w.id, w)
  }
  const n = Math.min(agents.length, crowd.capacity)
  for (let i = 0; i < n; i++) {
    const a = agents[i]
    const info = rosterById.get(a.w.id) ?? a.w
    const g = (gaits[i] ??= createGait(i + 1))
    // speed from displacement (not a.speed): corners slow the walker down, the feet must not slide
    stepGait(g, a.x, a.z, a.yaw, undefined, dt, false)
    crowd.setFigure(i, a.x, a.footY, a.z, a.yaw, g.pose, info)
  }
  crowd.hideFrom(n)
  crowd.commit()
}

export function Workers() {
  const plant = usePlant()
  // sized for the cap, so the crew can grow without rebuilding the figures
  const crowd = useMemo(() => new Crowd(WORKER_COUNT.max), [])
  const crewSize = useWorkers((s) => s.roster.length)
  useEffect(() => () => crowd.dispose(), [crowd])

  const agentsRef = useRef<Agent[]>([])
  const gaitsRef = useRef<GaitState[]>([])
  const clock = useRef(0)
  const queue = useRef<Agent[]>([])
  // agents (re)built per plant; poses out, cleaned up on unmount
  useEffect(() => {
    const agents: Agent[] = []
    useWorkers.getState().roster.forEach((w, i) => agents.push(buildAgent(plant, w, i, clock.current, agents)))
    agentsRef.current = agents
    gaitsRef.current = agents.map((_, i) => createGait(i + 1))
    agents.forEach((a, i) => i < crowd.capacity && crowd.setLook(i, lookFor(a.w.id)))
    for (const a of agents) workerPose[a.w.id] = { x: a.x, z: a.z, footY: a.footY, yaw: a.yaw, speed: 0 }
    // walk a worker to a plan point on their deck — the last leg may step off the planned walkway, e.g. right up
    // to a machine skid — face a tag and stay there for `hold` seconds (safety/workers.ts sendWorker; dev: demo video, tests)
    const send: SendWorkerFn = (id, to, faceTag, hold = 120, via) => {
      const a = agents.find((x) => x.w.id === id)
      const e = plant.equipment.find((x) => x.tag === faceTag)
      if (!a || !e) return false
      const y = a.footY - DECK_WORLD_Y
      const path = planPath(plant, a.li, [a.x, a.z], via ?? to) ?? []
      path.push({ x: to[0], z: to[1], y })
      a.path = path
      a.seg = 0
      a.goal = { x: to[0], z: to[1], tag: e.tag, face: [e.position[0], e.position[2]], platform: a.w.platform, kind: e.kind }
      a.mode = 'walk'
      a.hold = hold
      return path.length
    }
    workerCmd.send = send
    if (import.meta.env.DEV) Object.assign(window, { __sendWorker: send })
    return () => {
      if (workerCmd.send === send) workerCmd.send = null
      for (const a of agents) delete workerPose[a.w.id]
      agentsRef.current = []
    }
  }, [plant, crowd])

  // the Toolbar count changed: everyone else keeps walking, the crew only grows or shrinks at the end
  useEffect(() => {
    const agents = agentsRef.current
    const roster = useWorkers.getState().roster
    for (const a of agents.splice(roster.length)) delete workerPose[a.w.id]
    gaitsRef.current.length = Math.min(gaitsRef.current.length, agents.length)
    queue.current = queue.current.filter((a) => agents.includes(a))
    for (let i = agents.length; i < roster.length; i++) {
      const a = buildAgent(plant, roster[i], i, clock.current, agents)
      agents.push(a)
      if (i < crowd.capacity) crowd.setLook(i, lookFor(a.w.id))
      workerPose[a.w.id] = { x: a.x, z: a.z, footY: a.footY, yaw: a.yaw, speed: 0 }
    }
  }, [crewSize, plant, crowd])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const now = (clock.current += dt)
    const agents = agentsRef.current
    stepAgents(plant, agents, queue.current, dt, now)
    writeInstances(crowd, agents, gaitsRef.current, useWorkers.getState().roster, Math.max(dt, 1e-4))
  })

  return <primitive object={crowd.group} />
}
