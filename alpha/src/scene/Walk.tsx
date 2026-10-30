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
import type { Plant } from '../model/types'
import { footprints, type Footprint } from '../model/footprint'
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
export const walkPose = { x: 0, z: 0, yaw: 0, pitch: -0.05 }
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__walkPose = walkPose

const forward = (yaw: number, pitch = 0) =>
  new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))

const PAD = 0.35
const inside = (fps: Footprint[], x: number, z: number) => fps.some((f) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1)

function clampToPlot(p: Plant, x: number, z: number): [number, number] {
  const e = p.deck.extent
  return [THREE.MathUtils.clamp(x, e.minX + 0.4, e.maxX - 0.4), THREE.MathUtils.clamp(z, e.minZ + 0.4, e.maxZ - 0.4)]
}

/** Nearest free spot: step outward in growing rings until clear of every footprint. */
export function freeSpot(p: Plant, x: number, z: number): [number, number] {
  const fps = footprints(p.equipment, PAD)
  let [cx, cz] = clampToPlot(p, x, z)
  if (!inside(fps, cx, cz)) return [cx, cz]
  for (let r = 0.5; r < 30; r += 0.5)
    for (let a = 0; a < 16; a++) {
      const [tx, tz] = clampToPlot(p, cx + Math.cos((a / 16) * Math.PI * 2) * r, cz + Math.sin((a / 16) * Math.PI * 2) * r)
      if (!inside(fps, tx, tz)) return [tx, tz]
    }
  return [cx, cz]
}

/** Teleport (minimap click, "walk to"). Optionally face a point. */
export function placeWalker(x: number, z: number, face?: [number, number]) {
  const p = usePlantStore.getState().plant
  ;[walkPose.x, walkPose.z] = freeSpot(p, x, z)
  if (face) walkPose.yaw = Math.atan2(-(face[0] - walkPose.x), -(face[1] - walkPose.z))
}

/** Equipment boxes in world coordinates for gaze tests. */
function gazeBoxes(p: Plant) {
  const fps = footprints(p.equipment, 0)
  return p.equipment.map((e, i) => ({
    tag: e.tag,
    box: new THREE.Box3(new THREE.Vector3(fps[i].x0, DECK_WORLD_Y, fps[i].z0), new THREE.Vector3(fps[i].x1, DECK_WORLD_Y + Math.max(1, labelHeight(e) - 0.9), fps[i].z1)),
  }))
}

const MOVE_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'q', 'e', 'pageup', 'pagedown', 'shift'])

export function WalkDriver({ controls, root }: { controls: React.RefObject<CameraControls | null>; root: React.RefObject<THREE.Group | null> }) {
  const plant = usePlantStore((s) => s.plant)
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const fps = useMemo(() => footprints(plant.equipment, PAD), [plant])
  const boxes = useMemo(() => gazeBoxes(plant), [plant])
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
    placeWalker(target.x, target.z)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keyboard: held-key set, ignoring form fields
  useEffect(() => {
    const isField = (e: KeyboardEvent) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
    const down = (e: KeyboardEvent) => {
      if (isField(e) || e.metaKey || e.ctrlKey) return
      const k = e.key.toLowerCase()
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
  }, [])

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
    let box = boxes.find((x) => x.tag === focus.tag)?.box
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
    placeWalker(c.x + from.x * r, c.z + from.z * r, [c.x, c.z])
    const dy = c.y - (DECK_WORLD_Y + EYE)
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
        const [cx, cz] = clampToPlot(plant, x, z)
        if (inside(fps, cx, cz)) return false
        walkPose.x = cx
        walkPose.z = cz
        return true
      }
      if (!tryMove(walkPose.x + dx, walkPose.z + dz)) if (!tryMove(walkPose.x + dx, walkPose.z)) tryMove(walkPose.x, walkPose.z + dz)
    }
    const eye = new THREE.Vector3(walkPose.x, DECK_WORLD_Y + EYE, walkPose.z)
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
  const eye = new THREE.Vector3(walkPose.x, DECK_WORLD_Y + EYE, walkPose.z)
  const f = forward(walkPose.yaw)
  const pos = eye.clone().addScaledVector(f, -9).add(new THREE.Vector3(0, 6, 0))
  const tgt = eye.clone().addScaledVector(f, 6)
  c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y - 1, tgt.z, true)
}
