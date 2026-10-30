/**
 * First-person walkthrough. The walker owns a pose (plan position, yaw, pitch) and pushes it into
 * the scene's CameraControls every frame — the controls stay the single camera owner, with user
 * input disabled while walking.
 *
 *   ↑ / W  forward      ↓ / S  back       ← / A  turn left    → / D  turn right
 *   Q / E  step sideways   PgUp / PgDn  look up / down   Shift  run   drag  look around
 *
 * Gaze: the centre-of-view ray is tested against equipment boxes built from the plant data (not
 * the meshes — pipes in front of a vessel would steal the target); an item has to stay centred
 * for a moment before it becomes the inspected item.
 */
import { useFrame, useThree } from '@react-three/fiber'
import type { CameraControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Equipment, Module, ModuleDoor, Plant, PlanRect, WalkLevel } from '../model/types'
import { useSim } from '../state/sim'
import { resolveDoors, HF } from './equipment/moduleLayout'
import { surfaceHeight, walkSurfaces } from './walkSurfaces'

/** largest height difference the walker steps across in one move (stairs are continuous, decks are metres apart) */
const STEP = 1.0
import { footprints } from '../model/footprint'
import { labelHeight } from '../ui/labels'
import { usePlantStore } from '../state/plantStore'
import { DECK_WORLD_Y, WALK_DIST, useStore } from '../state/store'

export const EYE = 1.7
const WALK = 2.2 // m/s
const RUN = 6.5
const TURN = 1.6 // rad/s
const LOOK = 1.0
const GAZE_RANGE = 40
const DWELL = 0.3 // s an item must stay centred before it is inspected
const CLEAR_AFTER = 0.8 // s of looking at nothing before the panel closes

/** Live walker pose (plant plan coordinates; yaw 0 looks toward -Z / north). Read by the minimap. */
export const walkPose = {
  x: 0,
  z: 0,
  yaw: 0,
  pitch: -0.05,
  level: 0,
  /** deck-local height of what the walker stands on (a deck, a stair flight, a landing, a ladder) */
  floor: 0,
  /** world y of the floor under the walker's feet (the avatar stands on it) */
  footY: DECK_WORLD_Y,
  /** horizontal speed along the heading, m/s (negative = backwards) — drives the avatar's walk cycle */
  speed: 0,
}
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__walkPose = walkPose

/** a point on an autopilot route: plan position + the deck-local floor height expected there */
export interface AutoPt {
  x: number
  z: number
  y: number
}
/**
 * Autopilot (guided tour): while `active`, the walker follows `path` on its own — turning toward the
 * next point, slowing for sharp turns, climbing whatever stairs the points lead up — then turns to
 * `face` (an equipment tag or a plan point). Keyboard input is ignored meanwhile; the tour pauses
 * itself when a movement key is pressed.
 */
export const walkAuto = {
  active: false,
  path: [] as AutoPt[],
  /** walking speed, m/s */
  speed: 3,
  /** when the path is done: turn toward this tag (or point) */
  face: null as string | [number, number, number] | null,
  /** true once the walker is facing `face` (or immediately, with no face) */
  facing: false,
  /** stuck counter: snaps to a deck waypoint after no progress (counted, the tour test fails on them) */
  stuck: 0,
  snaps: 0,
  /** called when the user takes over (movement key, level key, drag to look) */
  onInterrupt: null as null | (() => void),
}
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__walkAuto = walkAuto

const forward = (yaw: number, pitch = 0) =>
  new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))

const PAD = 0.35
const inside = (fps: PlanRect[], x: number, z: number) => fps.some((f) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1)

/** Walkable levels of a plant (default: the plot at y = 0). */
export function walkLevels(p: Plant): WalkLevel[] {
  if (p.deck.walk?.length) return p.deck.walk
  const e = p.deck.extent
  return [{ id: 'deck', label: p.deck.name, y: 0, areas: [{ x0: e.minX, x1: e.maxX, z0: e.minZ, z1: e.maxZ }] }]
}
/** the level something at deck-local height y stands on: the highest floor at or just above it */
export function levelAt(levels: WalkLevel[], y: number) {
  let best = -1
  levels.forEach((l, i) => {
    if (l.y <= y + 0.5 && (best < 0 || l.y > levels[best].y)) best = i
  })
  if (best >= 0) return best
  return levels.reduce((lo, l, i) => (l.y < levels[lo].y ? i : lo), 0)
}
const eqLevel = (levels: WalkLevel[], e: Equipment) => levelAt(levels, e.position[1])
/** deck-local floor height of the walker's level */
export const floorY = () => walkPose.floor

/** module doors: the same resolution the Module model draws (data, or its default pair) */
export const moduleDoors = (m: Module): ModuleDoor[] => resolveDoors(m)

/** a module is hollow: four walls, with a gap at every open door */
function moduleWalls(m: Module, open: (id: string) => boolean): PlanRect[] {
  const [sx, , sz] = m.size
  const T = 0.3 + PAD
  const hx = sx / 2
  const hz = sz / 2
  const out: PlanRect[] = []
  const wall = (side: ModuleDoor['wall']) => {
    const along = side === '+z' || side === '-z' ? 'x' : 'z'
    const half = along === 'x' ? hx : hz
    // gaps along the wall from open doors
    const gaps = moduleDoors(m).filter((d) => d.wall === side && open(d.id)).map((d) => [d.at - d.width / 2, d.at + d.width / 2] as [number, number]).sort((a, b) => a[0] - b[0])
    let u = -half - PAD
    const pieces: [number, number][] = []
    for (const [g0, g1] of gaps) {
      if (g0 > u) pieces.push([u, g0])
      u = Math.max(u, g1)
    }
    if (u < half + PAD) pieces.push([u, half + PAD])
    for (const [a, b] of pieces) {
      const rect: [number, number, number, number] =
        side === '+z' ? [a, b, hz - T / 2, hz + T / 2] : side === '-z' ? [a, b, -hz - T / 2, -hz + T / 2] : side === '+x' ? [hx - T / 2, hx + T / 2, a, b] : [-hx - T / 2, -hx + T / 2, a, b]
      out.push(localRect(m, rect))
    }
  }
  for (const s of ['+x', '-x', '+z', '-z'] as const) wall(s)
  return out
}
/** equipment-local rectangle → plan rectangle (rotation in quarter turns) */
function localRect(e: Equipment, [x0, x1, z0, z1]: [number, number, number, number]): PlanRect {
  const c = Math.cos(e.rotationY)
  const s = Math.sin(e.rotationY)
  const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => [e.position[0] + x * c + z * s, e.position[2] - x * s + z * c])
  return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])) }
}
/** inside a module's walls → the raised internal floor */
const MODULE_FLOOR = HF
function insideModule(p: Plant, li: number, x: number, z: number) {
  const levels = walkLevels(p)
  return p.equipment.some((e) => {
    if (e.kind !== 'module' || eqLevel(levels, e) !== li) return false
    const r = localRect(e, [-e.size[0] / 2 + 0.2, e.size[0] / 2 - 0.2, -e.size[2] / 2 + 0.2, e.size[2] / 2 - 0.2])
    return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1
  })
}

/** what blocks walking on a level: equipment standing on it (padded; modules as walls with door gaps) + the level's obstacles */
export function blockers(p: Plant, li: number, doors: Record<string, boolean> = useSim.getState().doors): PlanRect[] {
  const levels = walkLevels(p)
  const fps = footprints(p.equipment, PAD)
  return [
    ...p.equipment.flatMap((e, i) => {
      if (e.kind === 'proxy' || eqLevel(levels, e) !== li) return []
      if (e.kind === 'module') return moduleWalls(e, (id) => !!doors[`${e.tag}/${id}`])
      return [fps[i]]
    }),
    ...(levels[li]?.obstacles ?? []),
  ]
}
export function walkable(p: Plant, li: number, block: PlanRect[], x: number, z: number) {
  const lv = walkLevels(p)[li]
  return !!lv && inside(lv.areas.map((a) => ({ x0: a.x0 - 1e-6, x1: a.x1 + 1e-6, z0: a.z0 - 1e-6, z1: a.z1 + 1e-6 })), x, z) && !inside(block, x, z)
}

/** Nearest free spot on a level: step outward in growing rings until walkable. */
export function freeSpot(p: Plant, li: number, x: number, z: number): [number, number] {
  const block = blockers(p, li)
  if (walkable(p, li, block, x, z)) return [x, z]
  for (let r = 0.5; r < 60; r += 0.5)
    for (let a = 0; a < 24; a++) {
      const tx = x + Math.cos((a / 24) * Math.PI * 2) * r
      const tz = z + Math.sin((a / 24) * Math.PI * 2) * r
      if (walkable(p, li, block, tx, tz)) return [tx, tz]
    }
  return [x, z]
}

/** Teleport (minimap click, "walk to", level change). Optionally face a point. */
export function placeWalker(x: number, z: number, face?: [number, number], level?: number) {
  const p = usePlantStore.getState().plant
  if (level !== undefined) walkPose.level = Math.max(0, Math.min(walkLevels(p).length - 1, level))
  ;[walkPose.x, walkPose.z] = freeSpot(p, walkPose.level, x, z)
  walkPose.floor = walkLevels(p)[walkPose.level]?.y ?? 0
  if (face) walkPose.yaw = Math.atan2(-(face[0] - walkPose.x), -(face[1] - walkPose.z))
}

const box = (f: PlanRect, y0: number, y1: number) => new THREE.Box3(new THREE.Vector3(f.x0, y0, f.z0), new THREE.Vector3(f.x1, Math.max(y0 + 1, y1), f.z1))

/** Equipment boxes in world coordinates for gaze tests, for the equipment on one level (proxies on every level). */
function gazeBoxes(p: Plant, li: number) {
  const levels = walkLevels(p)
  const fps = footprints(p.equipment, 0)
  const y0 = DECK_WORLD_Y + (levels[li]?.y ?? 0)
  return p.equipment.flatMap((e, i) =>
    eqLevel(levels, e) === li || e.kind === 'proxy'
      ? [{ tag: e.tag, proxy: e.kind === 'proxy', box: box(fps[i], e.kind === 'proxy' ? DECK_WORLD_Y + e.position[1] : y0, DECK_WORLD_Y + labelHeight(e) - 0.9) }]
      : [],
  )
}

/**
 * Pull the third-person camera back (dir 1) or in (dir −1) by `amount` (1 = one mouse-wheel notch). Zooming out
 * from the eyes shows the person at the closest distance; V still switches back to the eyes.
 */
export function zoomWalk(dir: 1 | -1, amount = 1) {
  const st = useStore.getState()
  if (st.walkView === 'first') {
    if (dir > 0) {
      st.setWalkView('third')
      st.setWalkDist(WALK_DIST.min)
    }
    return
  }
  st.setWalkDist(st.walkDist * Math.exp(dir * 0.14 * amount))
}

const camRay = new THREE.Ray()
const camDir = new THREE.Vector3()
const camHit = new THREE.Vector3()

const MOVE_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'q', 'e', 'pageup', 'pagedown', 'shift'])

export function WalkDriver({ controls, root }: { controls: React.RefObject<CameraControls | null>; root: React.RefObject<THREE.Group | null> }) {
  const plant = usePlantStore((s) => s.plant)
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const levels = useMemo(() => walkLevels(plant), [plant])
  const level = useStore((s) => s.walkLevel)
  const doors = useSim((s) => s.doors)
  const block = useMemo(() => blockers(plant, level, doors), [plant, level, doors])
  // every level's blockers + the climbable surfaces between levels (stairs, landings, ladders, roofs)
  const blockAll = useMemo(() => levels.map((_, i) => (i === level ? block : blockers(plant, i, doors))), [plant, levels, level, block, doors])
  const surfaces = useMemo(() => walkSurfaces(plant), [plant])
  const scene = useThree((s) => s.scene)
  const raise = useRef(0)
  const last = useRef({ x: walkPose.x, z: walkPose.z })
  const doorScan = useRef({ t: 0, roots: [] as THREE.Object3D[], auto: new Set<string>() })
  const boxes = useMemo(() => gazeBoxes(plant, level), [plant, level])
  const allBoxes = useMemo(() => levels.flatMap((_, i) => gazeBoxes(plant, i)), [plant, levels])
  const keys = useRef(new Set<string>())
  const gaze = useRef<{ tag: string | null; t: number }>({ tag: null, t: 0 })
  /** current third-person camera distance (eases toward the chosen one) */
  const camBack = useRef(useStore.getState().walkDist)

  // start where the orbit camera was looking, facing the same way
  useEffect(() => {
    const c = controls.current
    const target = new THREE.Vector3()
    if (c) c.getTarget(target)
    else target.set(0, DECK_WORLD_Y, 0)
    const d = target.clone().sub(camera.position)
    walkPose.yaw = Math.atan2(-d.x, -d.z)
    walkPose.pitch = -0.05
    // a deck-navigator start is applied by the walkStart effect below
    if (useStore.getState().walkStart) return
    useStore.getState().setWalkLevel(0)
    placeWalker(target.x, target.z, undefined, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Walk here" from the deck navigator (on entering walk mode, or while already walking)
  const walkStart = useStore((s) => s.walkStart)
  useEffect(() => {
    if (!walkStart) return
    const li = Math.max(0, levels.findIndex((l) => l.id === walkStart.level))
    walkPose.level = li
    useStore.getState().setWalkLevel(li)
    placeWalker(walkStart.at[0], walkStart.at[1], walkStart.face, li)
    walkPose.pitch = -0.05
    useStore.setState({ walkStart: null })
  }, [walkStart, levels])

  // keyboard: held-key set, ignoring form fields
  useEffect(() => {
    const isField = (e: KeyboardEvent) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
    const down = (e: KeyboardEvent) => {
      if (isField(e) || e.metaKey || e.ctrlKey) return
      if (useStore.getState().hmi) return // HMI guard: the control-room console is open, the keyboard belongs to it
      const k = e.key.toLowerCase()
      if (k === 'v') {
        const st = useStore.getState()
        st.setWalkView(st.walkView === 'third' ? 'first' : 'third')
        return
      }
      // camera distance behind the person
      if (k === '-' || k === '_') return zoomWalk(1)
      if (k === '=' || k === '+') return zoomWalk(-1)
      if (/^[1-9]$/.test(k) && Number(k) <= levels.length) {
        if (walkAuto.active) walkAuto.onInterrupt?.()
        useStore.getState().setWalkLevel(Number(k) - 1)
        return
      }
      if (!MOVE_KEYS.has(k)) return
      if (walkAuto.active && k !== 'shift') walkAuto.onInterrupt?.()
      keys.current.add(k)
      if (k.startsWith('arrow') || k.startsWith('page')) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [levels])

  // mouse wheel / trackpad: camera distance (the orbit controls are off while walking)
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (useStore.getState().hmi) return
      e.preventDefault()
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
      if (Math.abs(px) < 0.5) return
      zoomWalk(px > 0 ? 1 : -1, Math.min(2, Math.abs(px) / 100))
    }
    dom.addEventListener('wheel', onWheel, { passive: false })
    return () => dom.removeEventListener('wheel', onWheel)
  }, [dom])

  // level change (keys 1–9 or the HUD): stay at the same plan position if it is walkable there
  useEffect(() => {
    // read the store, not the render-time value: a "Walk here" start may have changed it this frame
    const cur = useStore.getState().walkLevel
    if (walkPose.level !== cur) placeWalker(walkPose.x, walkPose.z, undefined, cur)
  }, [level])

  // drag to look around (Street View style)
  useEffect(() => {
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => (last = { x: e.clientX, y: e.clientY })
    const move = (e: PointerEvent) => {
      if (!last || !e.buttons) return
      if (walkAuto.active && Math.hypot(e.clientX - last.x, e.clientY - last.y) > 2) walkAuto.onInterrupt?.()
      walkPose.yaw += (e.clientX - last.x) * 0.0045
      walkPose.pitch = THREE.MathUtils.clamp(walkPose.pitch + (e.clientY - last.y) * 0.0045, -1.4, 1.4)
      last = { x: e.clientX, y: e.clientY }
    }
    const up = () => (last = null)
    dom.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      dom.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dom])

  // "walk to" — Frame / tag links request a focus; stand a few metres in front of the item
  const focus = useStore((s) => s.focus)
  useEffect(() => {
    if (!focus) return
    let box = allBoxes.find((x) => x.tag === focus.tag)?.box
    if (!box) {
      // lines, valves, instruments: bounds of their rendered objects
      const b = new THREE.Box3()
      root.current?.traverse((o) => o.userData?.pick?.tag === focus.tag && b.expandByObject(o))
      if (b.isEmpty()) return
      box = b
    }
    const c = box.getCenter(new THREE.Vector3())
    const r = Math.min(Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2, 12) + 3
    const from = new THREE.Vector3(walkPose.x - c.x, 0, walkPose.z - c.z)
    if (from.lengthSq() < 1e-4) from.set(0, 0, 1)
    from.normalize()
    const li = levelAt(levels, box.min.y - DECK_WORLD_Y)
    if (li !== useStore.getState().walkLevel) useStore.getState().setWalkLevel(li)
    placeWalker(c.x + from.x * r, c.z + from.z * r, [c.x, c.z], li)
    const dy = c.y - (DECK_WORLD_Y + levels[li].y + EYE)
    walkPose.pitch = THREE.MathUtils.clamp(Math.atan2(dy, r), -0.8, 0.8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  // stand on whichever deck or stair surface here is closest to the current feet height
  const floorAt = (x: number, z: number): { h: number; li: number | null } | null => {
    let best: { h: number; li: number | null } | null = null
    let bd = STEP
    // on a ladder you are on the ladder, not on the deck it stands on
    const onLadder = surfaces.some((s) => s.kind === 'ladder' && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1)
    if (!onLadder)
      levels.forEach((lv, i) => {
        const d = Math.abs(lv.y - walkPose.floor)
        if (d <= bd && walkable(plant, i, blockAll[i], x, z)) (bd = d), (best = { h: lv.y, li: i })
      })
    for (const s of surfaces) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue
      const h = surfaceHeight(s, x, z)
      const d = Math.abs(h - walkPose.floor)
      if (d < bd) (bd = d), (best = { h, li: null })
    }
    return best
  }
  const tryMove = (x: number, z: number) => {
    const f = floorAt(x, z)
    if (!f) return false
    walkPose.x = x
    walkPose.z = z
    walkPose.floor = f.h
    // stepping off a stair onto a deck makes that deck the current level (minimap, gaze, buildings)
    if (f.li !== null && f.li !== walkPose.level) {
      walkPose.level = f.li
      useStore.getState().setWalkLevel(f.li)
    }
    return true
  }
  /** move by (dx, dz) in small sub-steps (never through a wall, never past a stair tread), sliding along obstacles */
  const move = (dx: number, dz: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15))
    for (let i = 0; i < n; i++) {
      const sx = dx / n
      const sz = dz / n
      if (!tryMove(walkPose.x + sx, walkPose.z + sz)) if (!tryMove(walkPose.x + sx, walkPose.z)) tryMove(walkPose.x, walkPose.z + sz)
    }
  }
  const turnToward = (yaw: number, rate: number) => {
    let d = yaw - walkPose.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    walkPose.yaw += Math.sign(d) * Math.min(Math.abs(d), rate)
    return Math.abs(d)
  }

  /** autopilot: follow the route, then face the target */
  const autopilot = (dt: number) => {
    const A = walkAuto
    const pt = A.path[0]
    if (pt) {
      const dx = pt.x - walkPose.x
      const dz = pt.z - walkPose.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.25) {
        A.path.shift()
        A.stuck = 0
        return
      }
      const off = turnToward(Math.atan2(-dx, -dz), 3.2 * Math.max(1, A.speed / 3.2) * dt)
      // ease the view level while walking (stairs: look a little up or down the flight)
      const next = A.path[1] ?? pt
      const slope = Math.atan2(next.y - walkPose.floor, Math.max(1.5, Math.hypot(next.x - walkPose.x, next.z - walkPose.z)))
      walkPose.pitch += (THREE.MathUtils.clamp(slope * 0.6, -0.35, 0.35) - 0.05 - walkPose.pitch) * Math.min(1, dt * 3)
      const v = A.speed * Math.max(0, Math.cos(Math.min(off, Math.PI / 2))) ** 2
      const step = Math.min(dist, v * dt)
      const f = forward(walkPose.yaw)
      const x0 = walkPose.x
      const z0 = walkPose.z
      move(f.x * step, f.z * step)
      const progress = Math.hypot(walkPose.x - x0, walkPose.z - z0)
      A.stuck = off < 0.5 && progress < step * 0.3 ? A.stuck + dt : 0
      if (A.stuck > 1.2) {
        // jammed: jump to the next point that is on a deck (never mid-flight)
        const k = A.path.findIndex((p) => levels.some((l) => Math.abs(l.y - p.y) < 0.01))
        const to = A.path[Math.max(0, k)]
        console.warn(`[tour] walker stuck at ${walkPose.x.toFixed(1)},${walkPose.z.toFixed(1)} → snapping to ${to.x.toFixed(1)},${to.z.toFixed(1)}`)
        walkPose.x = to.x
        walkPose.z = to.z
        walkPose.floor = to.y
        const li = levels.findIndex((l) => Math.abs(l.y - to.y) < 0.01)
        if (li >= 0 && li !== walkPose.level) (walkPose.level = li), useStore.getState().setWalkLevel(li)
        A.path.splice(0, Math.max(0, k) + 1)
        A.stuck = 0
        A.snaps++
      }
      A.facing = false
      return
    }
    // route done: turn toward the target
    if (!A.face) {
      A.facing = true
      return
    }
    let c: THREE.Vector3 | null = null
    if (typeof A.face === 'string') {
      const tag = A.face
      const b = allBoxes.find((x) => x.tag === tag)?.box
      if (b) c = b.getCenter(new THREE.Vector3())
    } else c = new THREE.Vector3(A.face[0], DECK_WORLD_Y + A.face[1], A.face[2])
    if (!c) {
      A.facing = true
      return
    }
    const off = turnToward(Math.atan2(-(c.x - walkPose.x), -(c.z - walkPose.z)), 2.4 * Math.max(1, A.speed / 3.2) * dt)
    const eyeY = DECK_WORLD_Y + walkPose.floor + EYE
    const pitch = THREE.MathUtils.clamp(Math.atan2(c.y - eyeY, Math.max(2, Math.hypot(c.x - walkPose.x, c.z - walkPose.z))), -0.6, 0.6)
    walkPose.pitch += (pitch - walkPose.pitch) * Math.min(1, dt * 3)
    A.facing = off < 0.06 && Math.abs(pitch - walkPose.pitch) < 0.06
  }

  const ray = useMemo(() => new THREE.Ray(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    dt = Math.min(dt, 0.25) // keep walking speed honest on slow frames without big jumps after a stall
    if (walkAuto.active) autopilot(dt)
    else {
      if (useStore.getState().hmi) keys.current.clear() // HMI guard: console open, the walker stands still
      const k = keys.current
      const speed = (k.has('shift') ? RUN : WALK) * dt
      if (k.has('arrowleft') || k.has('a')) walkPose.yaw += TURN * dt
      if (k.has('arrowright') || k.has('d')) walkPose.yaw -= TURN * dt
      if (k.has('pageup')) walkPose.pitch = Math.min(1.4, walkPose.pitch + LOOK * dt)
      if (k.has('pagedown')) walkPose.pitch = Math.max(-1.4, walkPose.pitch - LOOK * dt)
      let mf = 0
      let ms = 0
      if (k.has('arrowup') || k.has('w')) mf += 1
      if (k.has('arrowdown') || k.has('s')) mf -= 1
      if (k.has('e')) ms += 1
      if (k.has('q')) ms -= 1
      if (mf || ms) {
        const f = forward(walkPose.yaw)
        move((f.x * mf - f.z * ms) * speed, (f.z * mf + f.x * ms) * speed)
      }
    }
    // step up onto a module's raised floor when inside it
    const onDeck = Math.abs(walkPose.floor - (levels[walkPose.level]?.y ?? 0)) < 0.05
    const target = onDeck && insideModule(plant, walkPose.level, walkPose.x, walkPose.z) ? MODULE_FLOOR : 0
    raise.current += (target - raise.current) * Math.min(1, dt * 6)
    const eye = new THREE.Vector3(walkPose.x, DECK_WORLD_Y + walkPose.floor + EYE + raise.current, walkPose.z)

    // doors open as you walk up to them and close behind you (doors you clicked stay as you left them)
    const ds = doorScan.current
    ds.t -= dt
    if (ds.t <= 0) {
      ds.t = 0.25
      if (!ds.roots.length || Math.random() < 0.05) {
        ds.roots = []
        scene.traverse((o) => o.userData?.doorRoot && ds.roots.push(o))
      }
      const sim = useSim.getState()
      const w = new THREE.Vector3()
      for (const o of ds.roots) {
        const { tag, id } = o.userData.doorRoot as { tag: string; id: string }
        const key = `${tag}/${id}`
        o.getWorldPosition(w)
        const d = Math.hypot(w.x - eye.x, w.z - eye.z)
        const near = d < 2.6 && Math.abs(w.y - eye.y) < 3
        if (near && !sim.doors[key]) {
          sim.setDoor(key, true)
          ds.auto.add(key)
        } else if (!near && d > 4.5 && !walkAuto.active && ds.auto.has(key) && sim.doors[key]) {
          sim.setDoor(key, false)
          ds.auto.delete(key)
        }
      }
    }
    // pose for the avatar
    const fwd0 = forward(walkPose.yaw)
    const moved = (walkPose.x - last.current.x) * fwd0.x + (walkPose.z - last.current.z) * fwd0.z
    const inst = dt > 0 ? Math.max(-8, Math.min(8, moved / dt)) : 0 // clamp: a teleport isn't a sprint
    walkPose.speed += (inst - walkPose.speed) * Math.min(1, dt * 8)
    if (Math.abs(walkPose.speed) < 0.02) walkPose.speed = 0
    last.current = { x: walkPose.x, z: walkPose.z }
    walkPose.footY = eye.y - EYE

    // camera: through the person's eyes, or following behind them when the person is shown
    const look = eye.clone().addScaledVector(forward(walkPose.yaw, walkPose.pitch), 2)
    if (useStore.getState().walkView === 'third') {
      const indoor = raise.current > 0.3
      // chosen distance (wheel / − +), shorter indoors; eased so a zoom glides rather than jumps
      const want = indoor ? Math.min(WALK_DIST.indoorMax, useStore.getState().walkDist * 0.61) : useStore.getState().walkDist
      camBack.current += (want - camBack.current) * (1 - Math.exp(-dt * 7))
      const back = camBack.current
      // a little higher the further back, so the person stays low in the frame and you see over the kit
      const up = indoor ? 0.45 : 0.9 + Math.max(0, back - WALK_DIST.def) * 0.22
      // behind the person (default), or swung round in front of them looking back (Front view)
      const front = useStore.getState().walkFront
      const cam = eye.clone().addScaledVector(fwd0, front ? back : -back).add(new THREE.Vector3(0, front ? Math.min(up, 0.5) : up, 0))
      // keep equipment out from between the camera and the person: pull in to the first thing the boom hits
      camRay.set(eye, camDir.subVectors(cam, eye).normalize())
      const len = eye.distanceTo(cam)
      let free = len
      for (const b of boxes) {
        if (b.proxy || b.box.containsPoint(eye)) continue
        if (camRay.intersectBox(b.box, camHit)) free = Math.min(free, camHit.distanceTo(eye) - 0.35)
      }
      if (free < len) {
        cam.copy(eye).addScaledVector(camDir, Math.max(0.8, free))
        camBack.current = Math.min(camBack.current, Math.max(0.8, free))
      }
      const far = Math.max(0, back - WALK_DIST.def)
      const tgt = front ? eye.clone().add(new THREE.Vector3(0, -0.35, 0)) : eye.clone().addScaledVector(forward(walkPose.yaw, walkPose.pitch), 3 + far * 0.35).add(new THREE.Vector3(0, -0.25 - far * 0.06, 0))
      c.setLookAt(cam.x, cam.y, cam.z, tgt.x, tgt.y, tgt.z, false)
    } else c.setLookAt(eye.x, eye.y, eye.z, look.x, look.y, look.z, false)

    // gaze → inspected equipment (with dwell); the tour sets what is inspected itself
    if (walkAuto.active) return
    ray.set(eye, forward(walkPose.yaw, walkPose.pitch))
    let best: string | null = null
    let bestD = GAZE_RANGE
    for (const b of boxes) {
      if (b.box.containsPoint(eye)) {
        // standing inside a big proxy (on the drill floor): it's what you're looking at, unless something nearer is
        if (b.proxy && GAZE_RANGE - 1 < bestD) (bestD = GAZE_RANGE - 1), (best = b.tag)
        continue
      }
      if (ray.intersectBox(b.box, hit)) {
        const d = hit.distanceTo(eye)
        if (d < bestD) {
          bestD = d
          best = b.tag
        }
      }
    }
    const g = gaze.current
    if (best !== g.tag) {
      g.tag = best
      g.t = 0
    } else {
      g.t += dt
      const cur = useStore.getState().lookAt
      if (best && g.t >= DWELL && cur?.tag !== best) useStore.getState().setLookAt({ tag: best, kind: 'equipment' })
      // looking at open deck for a while: let the panel go
      if (!best && cur && g.t >= CLEAR_AFTER) useStore.getState().setLookAt(null)
    }
  })

  return null
}

/** Pull the orbit camera up and back from the walker's eye when leaving walk mode. */
export function leaveWalk(c: CameraControls) {
  const eye = new THREE.Vector3(walkPose.x, DECK_WORLD_Y + floorY() + EYE, walkPose.z)
  const f = forward(walkPose.yaw)
  const pos = eye.clone().addScaledVector(f, -9).add(new THREE.Vector3(0, 6, 0))
  const tgt = eye.clone().addScaledVector(f, 6)
  c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y - 1, tgt.z, true)
}
