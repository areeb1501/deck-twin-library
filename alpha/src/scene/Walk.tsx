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
import type { Equipment, Plant, PlanRect, WalkLevel } from '../model/types'
import { footprints } from '../model/footprint'
import { labelHeight } from '../ui/labels'
import { usePlantStore } from '../state/plantStore'
import { DECK_WORLD_Y, useStore } from '../state/store'

export const EYE = 1.7
const WALK = 2.2 // m/s
const RUN = 6.5
const TURN = 1.6 // rad/s
const LOOK = 1.0
const GAZE_RANGE = 40
const DWELL = 0.3 // s an item must stay centred before it is inspected
const CLEAR_AFTER = 0.8 // s of looking at nothing before the panel closes

/** Live walker pose (plant plan coordinates; yaw 0 looks toward -Z / north). Read by the minimap. */
export const walkPose = { x: 0, z: 0, yaw: 0, pitch: -0.05, level: 0 }
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__walkPose = walkPose

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
export const floorY = () => walkLevels(usePlantStore.getState().plant)[walkPose.level]?.y ?? 0

/** what blocks walking on a level: equipment standing on it (padded) + the level's obstacles */
function blockers(p: Plant, li: number): PlanRect[] {
  const levels = walkLevels(p)
  const fps = footprints(p.equipment, PAD)
  return [...p.equipment.flatMap((e, i) => (eqLevel(levels, e) === li ? [fps[i]] : [])), ...(levels[li]?.obstacles ?? [])]
}
function walkable(p: Plant, li: number, block: PlanRect[], x: number, z: number) {
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
  if (face) walkPose.yaw = Math.atan2(-(face[0] - walkPose.x), -(face[1] - walkPose.z))
}

/** Equipment boxes in world coordinates for gaze tests, for the equipment on one level. */
function gazeBoxes(p: Plant, li: number) {
  const levels = walkLevels(p)
  const fps = footprints(p.equipment, 0)
  const y0 = DECK_WORLD_Y + (levels[li]?.y ?? 0)
  return p.equipment.flatMap((e, i) =>
    eqLevel(levels, e) === li
      ? [{ tag: e.tag, box: new THREE.Box3(new THREE.Vector3(fps[i].x0, y0, fps[i].z0), new THREE.Vector3(fps[i].x1, Math.max(y0 + 1, DECK_WORLD_Y + labelHeight(e) - 0.9), fps[i].z1)) }]
      : [],
  )
}

const MOVE_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'q', 'e', 'pageup', 'pagedown', 'shift'])

export function WalkDriver({ controls, root }: { controls: React.RefObject<CameraControls | null>; root: React.RefObject<THREE.Group | null> }) {
  const plant = usePlantStore((s) => s.plant)
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const levels = useMemo(() => walkLevels(plant), [plant])
  const level = useStore((s) => s.walkLevel)
  const block = useMemo(() => blockers(plant, level), [plant, level])
  const boxes = useMemo(() => gazeBoxes(plant, level), [plant, level])
  const allBoxes = useMemo(() => levels.flatMap((_, i) => gazeBoxes(plant, i)), [plant, levels])
  const keys = useRef(new Set<string>())
  const gaze = useRef<{ tag: string | null; t: number }>({ tag: null, t: 0 })

  // start where the orbit camera was looking, facing the same way
  useEffect(() => {
    const c = controls.current
    const target = new THREE.Vector3()
    if (c) c.getTarget(target)
    else target.set(0, DECK_WORLD_Y, 0)
    const d = target.clone().sub(camera.position)
    walkPose.yaw = Math.atan2(-d.x, -d.z)
    walkPose.pitch = -0.05
    placeWalker(target.x, target.z, undefined, 0)
    useStore.getState().setWalkLevel(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keyboard: held-key set, ignoring form fields
  useEffect(() => {
    const isField = (e: KeyboardEvent) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
    const down = (e: KeyboardEvent) => {
      if (isField(e) || e.metaKey || e.ctrlKey) return
      const k = e.key.toLowerCase()
      if (/^[1-9]$/.test(k) && Number(k) <= levels.length) {
        useStore.getState().setWalkLevel(Number(k) - 1)
        return
      }
      if (!MOVE_KEYS.has(k)) return
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

  // level change (keys 1–9 or the HUD): stay at the same plan position if it is walkable there
  useEffect(() => {
    if (walkPose.level !== level) placeWalker(walkPose.x, walkPose.z, undefined, level)
  }, [level])

  // drag to look around (Street View style)
  useEffect(() => {
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => (last = { x: e.clientX, y: e.clientY })
    const move = (e: PointerEvent) => {
      if (!last || !e.buttons) return
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

  const ray = useMemo(() => new THREE.Ray(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    dt = Math.min(dt, 0.25) // keep walking speed honest on slow frames without big jumps after a stall
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
      const dx = (f.x * mf - f.z * ms) * speed
      const dz = (f.z * mf + f.x * ms) * speed
      // slide along obstacles: try the full step, then each axis alone
      const tryMove = (x: number, z: number) => {
        if (!walkable(plant, walkPose.level, block, x, z)) return false
        walkPose.x = x
        walkPose.z = z
        return true
      }
      if (!tryMove(walkPose.x + dx, walkPose.z + dz)) if (!tryMove(walkPose.x + dx, walkPose.z)) tryMove(walkPose.x, walkPose.z + dz)
    }
    const eye = new THREE.Vector3(walkPose.x, DECK_WORLD_Y + (levels[walkPose.level]?.y ?? 0) + EYE, walkPose.z)
    const look = eye.clone().addScaledVector(forward(walkPose.yaw, walkPose.pitch), 2)
    c.setLookAt(eye.x, eye.y, eye.z, look.x, look.y, look.z, false)

    // gaze → inspected equipment (with dwell)
    ray.set(eye, forward(walkPose.yaw, walkPose.pitch))
    let best: string | null = null
    let bestD = GAZE_RANGE
    for (const b of boxes) {
      if (b.box.containsPoint(eye)) continue
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
