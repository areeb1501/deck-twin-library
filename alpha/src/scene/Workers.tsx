/**
 * Simulated field workers walking the decks (plan 06). Mounted by Scene.tsx only while Toolbar → Workers
 * is on, in WORLD coordinates (not inside the deck-local group).
 *
 * Each worker loops: plan an A* route (walkPath.planPath, at most ONE search per frame across all workers)
 * to a task point on their own level and platform → walk it at 1.2–1.5 m/s wall time → idle 6–20 s facing
 * the equipment → repeat. Poses are written into the mutable `workerPose` (CCTV reads it).
 *
 * Figure: a light procedural operator (orange coverall with reflective tape, white hard hat, hi-vis vest,
 * boots, gloves), drawn as 7 InstancedMeshes for ALL workers (vertex-coloured parts, one draw call each).
 * A missing hard hat shows dark hair; a missing vest hides the vest band. Not pickable.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DECK_WORLD_Y } from '../state/store'
import { usePlant } from '../state/plantStore'
import { planPath } from './walkPath'
import { walkLevels, type AutoPt } from './Walk'
import { setWorkerTask, taskText, useWorkers, workerLevelIndex, workerPose, workerTaskPoints, type TaskPoint } from '../safety/workers'
import type { WorkerInfo } from '../safety/types'
import type { Plant } from '../model/types'

// ---------------------------------------------------------------- figure (m; faces −Z like the walker)
const HIP_Y = 0.93
const HIP_X = 0.095
const SHOULDER_Y = 1.47
const SHOULDER_X = 0.235
const HEAD_Y = 1.63
const STEP = 0.78 // m per step

const C = {
  coverall: '#e2661c',
  tape: '#c9cdd2',
  boot: '#2a2622',
  glove: '#3a3d40',
  skin: '#c99a7a',
  hat: '#f2f2f0',
  hair: '#2b2118',
  vest: '#d7f22a',
}

function part(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  g.translate(x, y, z)
  const c = new THREE.Color(color)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs, false)!

function figureGeometries() {
  // leg, hanging from the hip joint: coverall leg, shin tape, boot (toe forward = −Z)
  const leg = merge([part(box(0.15, 0.8, 0.17), C.coverall, 0, -0.4, 0), part(box(0.156, 0.04, 0.176), C.tape, 0, -0.56, 0), part(box(0.15, 0.13, 0.27), C.boot, 0, -0.865, -0.04)])
  // arm, hanging from the shoulder: sleeve, cuff tape, glove
  const arm = merge([part(box(0.1, 0.56, 0.11), C.coverall, 0, -0.28, 0), part(box(0.106, 0.035, 0.116), C.tape, 0, -0.44, 0), part(box(0.095, 0.11, 0.1), C.glove, 0, -0.61, 0)])
  // torso from the hip joint up: coverall, waist + chest tape, belt, neck
  const torso = merge([
    part(box(0.38, 0.58, 0.22), C.coverall, 0, 0.29, 0),
    part(box(0.386, 0.06, 0.226), C.boot, 0, 0.05, 0),
    part(box(0.386, 0.035, 0.226), C.tape, 0, 0.4, 0),
    part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), C.skin, 0, 0.62, 0),
  ])
  // hi-vis vest band over the torso, with two reflective stripes
  const vest = merge([part(box(0.405, 0.36, 0.245), C.vest, 0, 0.32, 0), part(box(0.41, 0.035, 0.25), C.tape, 0, 0.22, 0), part(box(0.41, 0.035, 0.25), C.tape, 0, 0.4, 0)])
  const head = part(new THREE.SphereGeometry(0.11, 14, 10), C.skin)
  const hat = merge([part(new THREE.SphereGeometry(0.128, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.hat, 0, 0.025, 0), part(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 18), C.hat, 0, 0.03, -0.015)])
  const hair = part(new THREE.SphereGeometry(0.114, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), C.hair, 0, 0.012, 0.004)
  return { leg, arm, torso, vest, head, hat, hair }
}

// ---------------------------------------------------------------- agents

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

function buildAgents(plant: Plant): Agent[] {
  const levels = walkLevels(plant)
  return useWorkers.getState().roster.map((w, i) => {
    const li = workerLevelIndex(w, plant)
    const points = workerTaskPoints(w, plant)
    const rng = prng(1013 * (i + 1))
    const start = points.length ? points[(i * 7 + 2) % points.length] : null
    const y = levels[li]?.y ?? 0
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
      until: 1 + rng() * 6, // staggered first departures
      faceYaw: null,
      fails: 0,
      rng,
    }
  })
}

const noRaycast = () => null
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

const PARTS = ['leg', 'arm', 'torso', 'vest', 'head', 'hat', 'hair'] as const
type Meshes = Record<(typeof PARTS)[number], THREE.InstancedMesh>

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
        a.until = now + 6 + a.rng() * 14
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

const _root = new THREE.Matrix4()
const _local = new THREE.Matrix4()
const _out = new THREE.Matrix4()
function setPart(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx: number) {
  _local.makeRotationX(rx).setPosition(x, y, z)
  _out.multiplyMatrices(_root, _local)
  mesh.setMatrixAt(i, _out)
}

/** pose every figure: walk cycle from distance travelled, PPE from the roster */
function writeInstances(r: Meshes, agents: Agent[], roster: WorkerInfo[], now: number) {
  agents.forEach((a, i) => {
    const info = roster.find((w) => w.id === a.w.id) ?? a.w
    const walking = a.speed > 0.05
    const swing = walking ? Math.sin(a.phase * Math.PI) * 0.5 : 0
    const bob = walking ? Math.abs(Math.cos(a.phase * Math.PI)) * 0.025 : Math.sin(now * 1.6 + i) * 0.004
    const lean = walking ? -0.05 : 0
    _root.makeRotationY(a.yaw).setPosition(a.x, a.footY + bob, a.z)
    setPart(r.leg, i * 2, -HIP_X, HIP_Y, 0, swing)
    setPart(r.leg, i * 2 + 1, HIP_X, HIP_Y, 0, -swing)
    setPart(r.arm, i * 2, -SHOULDER_X, SHOULDER_Y, 0, -swing * 0.8)
    setPart(r.arm, i * 2 + 1, SHOULDER_X, SHOULDER_Y, 0, swing * 0.8)
    setPart(r.torso, i, 0, HIP_Y, 0, lean)
    if (info.vest) setPart(r.vest, i, 0, HIP_Y, 0, lean)
    else r.vest.setMatrixAt(i, HIDDEN)
    setPart(r.head, i, 0, HEAD_Y, 0, 0)
    if (info.hardHat) {
      setPart(r.hat, i, 0, HEAD_Y, 0, 0)
      r.hair.setMatrixAt(i, HIDDEN)
    } else {
      r.hat.setMatrixAt(i, HIDDEN)
      setPart(r.hair, i, 0, HEAD_Y, 0, 0)
    }
  })
  for (const k of PARTS) r[k].instanceMatrix.needsUpdate = true
}

export function Workers() {
  const plant = usePlant()
  const geos = useMemo(() => figureGeometries(), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }), [])
  const N = useWorkers.getState().roster.length
  const refs = {
    leg: useRef<THREE.InstancedMesh>(null),
    arm: useRef<THREE.InstancedMesh>(null),
    torso: useRef<THREE.InstancedMesh>(null),
    vest: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    hat: useRef<THREE.InstancedMesh>(null),
    hair: useRef<THREE.InstancedMesh>(null),
  }

  const agentsRef = useRef<Agent[]>([])
  // agents (re)built per plant; poses out, cleaned up on unmount
  useEffect(() => {
    const agents = buildAgents(plant)
    agentsRef.current = agents
    for (const a of agents) workerPose[a.w.id] = { x: a.x, z: a.z, footY: a.footY, yaw: a.yaw, speed: 0 }
    return () => {
      for (const a of agents) delete workerPose[a.w.id]
      agentsRef.current = []
    }
  }, [plant])

  const clock = useRef(0)
  const queue = useRef<Agent[]>([])
  useEffect(
    () => () => {
      for (const g of Object.values(geos)) g.dispose()
      mat.dispose()
    },
    [geos, mat],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const now = (clock.current += dt)
    const agents = agentsRef.current
    stepAgents(plant, agents, queue.current, dt, now)
    const meshes = {} as Meshes
    for (const k of PARTS) {
      const mesh = refs[k].current
      if (!mesh) return
      meshes[k] = mesh
    }
    writeInstances(meshes, agents, useWorkers.getState().roster, now)
  })

  const im = (key: keyof typeof refs, geo: THREE.BufferGeometry, count: number) => (
    <instancedMesh key={key} ref={refs[key]} args={[geo, mat, count]} frustumCulled={false} raycast={noRaycast} />
  )
  return (
    <group name="field-workers">
      {im('leg', geos.leg, N * 2)}
      {im('arm', geos.arm, N * 2)}
      {im('torso', geos.torso, N)}
      {im('vest', geos.vest, N)}
      {im('head', geos.head, N)}
      {im('hat', geos.hat, N)}
      {im('hair', geos.hair, N)}
    </group>
  )
}
