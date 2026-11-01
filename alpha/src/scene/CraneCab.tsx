/**
 * Crane cab (plan 05): sit in a platform crane's cab, operate it and look around.
 *
 * Mounted by Scene while `useStore.craneCab` is set (orbit controls disabled). It
 *  - takes the crane into manual control (`useCranes.takeManual`); refused while a load is on the hook,
 *    then retried every second (the HUD shows why), look-only meanwhile;
 *  - drives the crane at frame rate from the joystick (`driveManual`, real seconds; interlocks at the tick);
 *  - puts the eye in the operator's seat. The eye is a point in the crane's SLEWING frame, read through the
 *    3D crane's own `slew` / `boom` bones, so it rides exactly with the displayed (smoothed) crane;
 *  - hides this crane's (opaque) cab glass while you sit in it and adds an interior (window frames, sill,
 *    joystick consoles, a tinted pane) so it reads as a glass cab from the inside.
 *
 * Views (V): cab seat → cab roof (clear 360°) → boom-tip camera (looking down at the hook).
 * Mouse: drag to look, wheel to zoom. Keys: A/D ←/→ slew · W/S ↑/↓ luff · R/F hoist · Shift fine ·
 * C centre the view · V view · Esc leave the cab.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { CameraControls } from '@react-three/drei'
import * as THREE from 'three'
import { materials as libraryMaterials } from '../../../registry/lib/materials'
import { create } from 'zustand'
import { useStore } from '../state/store'
import { driveManual, useCranes } from '../sim/cranes'
import { CRANE_BY_TAG, craneDims, type CraneDims } from '../model/cranes'

export type CabView = 'cab' | 'roof' | 'tip'
export const CAB_VIEWS: CabView[] = ['cab', 'roof', 'tip']
export const CAB_VIEW_LABEL: Record<CabView, string> = {
  cab: 'Cab seat',
  roof: 'Cab roof',
  tip: 'Boom-tip camera',
}

/** cab UI state shared with the HUD (changes on events only, never per frame) */
export const useCab = create<{
  refusal: string | null
  view: CabView
  full: boolean
  setView: (v: CabView) => void
}>((set) => ({
  refusal: null,
  view: 'cab',
  /** the HUD's full panel (H folds it away to look around) */
  full: true,
  setView: (view) => set({ view }),
}))

/** live look direction relative to the boom (rad; yaw + = to the left) and zoom — mutated per frame, read by the HUD at 4 Hz */
export const cabLook = {
  yaw: 0,
  pitch: -0.1,
  yawT: 0,
  pitchT: -0.1,
  fov: 62,
  fovT: 62,
}

const DEFAULT_PITCH: Record<CabView, number> = {
  cab: -0.1,
  roof: -0.12,
  tip: -1.5,
}
const PITCH_RANGE: Record<CabView, [number, number]> = {
  cab: [-1.05, 0.52],
  roof: [-1.2, 0.7],
  tip: [-1.565, 0.35],
}
const YAW_MAX: Record<CabView, number> = {
  cab: (170 * Math.PI) / 180,
  roof: Infinity,
  tip: Math.PI,
}
const DRAG = 0.0042
const FOV_DEFAULT = 62

/** operator's eye in the slewing frame (f along the boom, y up from the crane's deck, s to the boom's left: the cab is on its right) */
const eyeOf = (view: CabView, d: CraneDims): [number, number, number] => (view === 'roof' ? [1.85, d.yD + 4.45, -2.3] : [1.55, d.yD + 1.72, -2.3])

// ---------------------------------------------------------------- the crane in the scene

interface Rig {
  group: THREE.Object3D
  mesh: THREE.SkinnedMesh
  slew: THREE.Bone
  boom: THREE.Bone
}
function findRig(scene: THREE.Scene, tag: string): Rig | null {
  const group = scene.getObjectByName(`crane-${tag}`)
  if (!group) return null
  let mesh: THREE.SkinnedMesh | null = null
  group.traverse((o) => {
    if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh
  })
  if (!mesh) return null
  const m = mesh as THREE.SkinnedMesh
  const slew = m.skeleton?.bones.find((b) => b.name === 'slew')
  const boom = m.skeleton?.bones.find((b) => b.name === 'boom')
  return slew && boom ? { group, mesh: m, slew, boom } : null
}

/** the crane's materials with the library's glass dropped, so the seat looks out, not at the panes */
function cabMaterials(orig: THREE.Material[]) {
  const glass = libraryMaterials().glass
  const clear = glass.clone()
  clear.visible = false
  return orig.map((m) => (m === glass ? clear : m))
}

/** cab interior in the slewing frame (window frames, sill, floor, joystick consoles, tinted glass) */
function buildInterior(d: CraneDims) {
  const g = new THREE.Group()
  g.name = 'crane-cab-interior'
  const trim = new THREE.MeshStandardMaterial({
    color: '#474d52',
    roughness: 0.8,
    metalness: 0.1,
  })
  const dark = new THREE.MeshStandardMaterial({
    color: '#1c1f22',
    roughness: 0.9,
  })
  const glass = new THREE.MeshStandardMaterial({
    color: '#a8cde0',
    roughness: 0.05,
    metalness: 0.3,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const screen = new THREE.MeshStandardMaterial({
    color: '#0d1a12',
    emissive: '#3fae5a',
    emissiveIntensity: 0.55,
    roughness: 0.4,
  })
  const geo = new THREE.BoxGeometry(1, 1, 1)
  /** box from slewing-frame ranges: f, y (above the slewing deck), s */
  const box = (mat: THREE.Material, f0: number, f1: number, y0: number, y1: number, s0: number, s1: number) => {
    const m = new THREE.Mesh(geo, mat)
    m.scale.set(f1 - f0, y1 - y0, s1 - s0)
    m.position.set((f0 + f1) / 2, d.yD + (y0 + y1) / 2, (s0 + s1) / 2)
    m.raycast = () => null
    g.add(m)
    return m
  }
  const T = 0.04
  // front wall (f ≈ 2.46): bottom, sill, header, corner posts
  box(trim, 2.44, 2.48, 0.32, 0.42, 2.02, 3.06)
  box(trim, 2.3, 2.48, 0.88, 1.0, 2.02, 3.06) // sill / dash shelf
  box(trim, 2.44, 2.48, 2.63, 2.72, 2.02, 3.06)
  box(trim, 2.42, 2.48, 0.42, 2.63, 2.02, 2.1)
  box(trim, 2.42, 2.48, 0.42, 2.63, 2.98, 3.06)
  // outer side (s ≈ 3.04): solid rear, below / above the window
  box(trim, 0.04, 0.75, 0.32, 2.72, 3.06 - T, 3.06)
  box(trim, 0.75, 2.46, 0.32, 1.0, 3.06 - T, 3.06)
  box(trim, 0.75, 2.46, 2.63, 2.72, 3.06 - T, 3.06)
  // boom side (s ≈ 2.04)
  box(trim, 0.04, 1.55, 0.32, 2.72, 2.02, 2.02 + T)
  box(trim, 1.55, 2.46, 0.32, 1.0, 2.02, 2.02 + T)
  box(trim, 1.55, 2.46, 2.63, 2.72, 2.02, 2.02 + T)
  // back wall around the door
  box(trim, 0.04, 0.04 + T, 0.32, 2.72, 2.02, 2.15)
  box(trim, 0.04, 0.04 + T, 0.32, 2.72, 2.9, 3.06)
  box(trim, 0.04, 0.04 + T, 2.45, 2.72, 2.15, 2.9)
  // roof: solid rear, frame round the roof window
  box(trim, 0.04, 1.25, 2.68, 2.72, 2.02, 3.06)
  box(trim, 1.25, 2.46, 2.68, 2.72, 2.02, 2.1)
  box(trim, 1.25, 2.46, 2.68, 2.72, 2.98, 3.06)
  // floor mat, seat base, joystick consoles + grips, a status screen
  box(dark, 0.05, 2.3, 0.3, 0.34, 2.03, 3.05)
  box(dark, 0.95, 1.35, 0.34, 0.8, 2.35, 2.75)
  for (const s of [2.18, 2.92]) {
    box(trim, 1.15, 1.75, 0.34, 0.98, s - 0.08, s + 0.08)
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 10), dark)
    grip.position.set(1.62, d.yD + 1.06, s)
    grip.raycast = () => null
    g.add(grip)
  }
  const scr = box(screen, 2.3, 2.32, 1.02, 1.2, 2.8, 3.0)
  scr.rotation.z = -0.35
  // tinted panes (the exterior glass is dropped while seated)
  box(glass, 2.49, 2.5, 1.0, 2.63, 2.08, 3.0)
  box(glass, 2.49, 2.5, 0.42, 0.88, 2.12, 2.96)
  box(glass, 0.75, 2.4, 1.0, 2.63, 3.08, 3.09)
  box(glass, 1.55, 2.4, 1.0, 2.63, 1.99, 2.0)
  box(glass, 1.25, 2.4, 2.73, 2.74, 2.1, 2.98)
  const dispose = () => {
    geo.dispose()
    g.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry !== geo && (o as THREE.Mesh).geometry.dispose())
    for (const m of [trim, dark, glass, screen]) m.dispose()
  }
  return { group: g, dispose }
}

// ---------------------------------------------------------------- keys

const AXIS: Record<string, ['slew' | 'luff' | 'hoist', number]> = {
  a: ['slew', -1],
  arrowleft: ['slew', -1],
  d: ['slew', 1],
  arrowright: ['slew', 1],
  w: ['luff', 1],
  arrowup: ['luff', 1],
  s: ['luff', -1],
  arrowdown: ['luff', -1],
  r: ['hoist', 1],
  f: ['hoist', -1],
}
/** other viewer hot-keys swallowed in the cab (walk / section / focus / zoom) */
const SWALLOW = new Set(['c', 'v', 'h', 'g', 'q', 'e', ' ', 'shift'])

// ---------------------------------------------------------------- driver

const _eye = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _off = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const damp = (tau: number, dt: number) => 1 - Math.exp(-dt / tau)

export function CraneCabDriver({ controls }: { controls: React.RefObject<CameraControls | null> }) {
  const tag = useStore((s) => s.craneCab)
  const view = useCab((s) => s.view)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const scene = useThree((s) => s.scene)
  const dom = useThree((s) => s.gl.domElement)
  const st = useRef({
    rig: null as Rig | null,
    mat: null as THREE.Material[] | null,
    orig: null as THREE.Material[] | null,
    interior: null as ReturnType<typeof buildInterior> | null,
    entry: 0,
    look: 0,
    seek: 0,
    offset: new THREE.Vector3(),
    fresh: true,
    reglide: false,
  })

  // take the crane (retry every second while refused, or after a sim reset); release on leave
  useEffect(() => {
    if (!tag) return
    const take = () => useCab.setState({ refusal: useCranes.getState().takeManual(tag) })
    take()
    const iv = setInterval(() => {
      if (useCranes.getState().manual !== tag) take()
      else if (useCab.getState().refusal) useCab.setState({ refusal: null })
    }, 1000)
    Object.assign(cabLook, {
      yaw: 0,
      yawT: 0,
      pitchT: DEFAULT_PITCH.cab,
      fovT: FOV_DEFAULT,
    })
    useCab.setState({ view: 'cab' })
    st.current.fresh = true
    return () => {
      clearInterval(iv)
      if (useCranes.getState().manual === tag) useCranes.getState().takeManual(null)
      useCab.setState({ refusal: null })
    }
  }, [tag])

  // field of view: wider while seated, restored on leave
  useEffect(() => {
    const saved = camera.fov
    cabLook.fov = saved
    return () => {
      camera.fov = saved
      camera.updateProjectionMatrix()
    }
  }, [camera])

  // leave the cab: pull the orbit camera back out behind the seat (not when "walk to" took over)
  useEffect(() => {
    return () => {
      const s = useStore.getState()
      const c = controls.current
      if (s.craneCab || s.walk || !c) return
      const f = camera.getWorldDirection(new THREE.Vector3())
      f.y = Math.min(f.y, -0.25)
      f.normalize()
      const p = camera.position
      c.setLookAt(p.x - f.x * 38, p.y - f.y * 38 + 6, p.z - f.z * 38, p.x + f.x * 12, p.y + f.y * 12, p.z + f.z * 12, true)
    }
  }, [camera, controls])

  // view change: glide from the current eye to the new one, look at the view's default pitch
  useEffect(() => {
    st.current.seek = 0.8
    cabLook.pitchT = DEFAULT_PITCH[view]
    if (view === 'tip') cabLook.yawT = 0
    if (YAW_MAX[view] !== Infinity) cabLook.yawT = THREE.MathUtils.clamp(cabLook.yawT, -YAW_MAX[view], YAW_MAX[view])
    if (!st.current.fresh) st.current.reglide = true // the offset is taken in useFrame, once the new eye is known
  }, [view])

  // keyboard (capture phase: before App's / the walker's window listeners)
  useEffect(() => {
    const held = new Set<string>()
    const push = (fine: boolean) => {
      const cmd = { slew: 0, luff: 0, hoist: 0 }
      for (const k of held) {
        const a = AXIS[k]
        if (a) cmd[a[0]] = THREE.MathUtils.clamp(cmd[a[0]] + a[1], -1, 1)
      }
      const g = fine ? 0.3 : 1
      useCranes.getState().setCmd({
        slew: cmd.slew * g,
        luff: cmd.luff * g,
        hoist: cmd.hoist * g,
      })
    }
    const isField = (e: KeyboardEvent) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
    const down = (e: KeyboardEvent) => {
      if (isField(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (useStore.getState().hmi) return // the console has the keyboard (and Esc closes the console first)
      const k = e.key.toLowerCase()
      if (k === 'escape') {
        e.stopPropagation()
        e.preventDefault()
        useStore.getState().setCraneCab(null)
        return
      }
      if (AXIS[k]) {
        e.stopPropagation()
        e.preventDefault()
        if (e.repeat) return
        held.add(k)
        push(e.shiftKey)
        return
      }
      if (!SWALLOW.has(k)) return
      e.stopPropagation()
      if (k === ' ') e.preventDefault()
      if (e.repeat) return
      if (k === 'shift') push(true)
      else if (k === 'c') {
        cabLook.yawT = 0
        cabLook.pitchT = DEFAULT_PITCH[useCab.getState().view]
        cabLook.fovT = FOV_DEFAULT
      } else if (k === 'h') {
        useCab.setState((c) => ({ full: !c.full }))
      } else if (k === 'v') {
        const v = useCab.getState().view
        useCab.getState().setView(CAB_VIEWS[(CAB_VIEWS.indexOf(v) + 1) % CAB_VIEWS.length])
      }
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (held.delete(k) || k === 'shift') push(e.shiftKey && k !== 'shift')
    }
    const blur = () => {
      held.clear()
      push(false)
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
      useCranes.getState().setCmd({ slew: 0, luff: 0, hoist: 0 })
    }
  }, [])

  // mouse: drag to look (grab the world, like the walker), wheel to zoom
  useEffect(() => {
    let last: { x: number; y: number } | null = null
    const downP = (e: PointerEvent) => (last = { x: e.clientX, y: e.clientY })
    const move = (e: PointerEvent) => {
      if (!last || !e.buttons) return
      const v = useCab.getState().view
      const k = DRAG * (cabLook.fov / FOV_DEFAULT)
      cabLook.yawT += (e.clientX - last.x) * k
      const ym = YAW_MAX[v]
      if (ym !== Infinity) cabLook.yawT = THREE.MathUtils.clamp(cabLook.yawT, -ym, ym)
      const [p0, p1] = PITCH_RANGE[v]
      cabLook.pitchT = THREE.MathUtils.clamp(cabLook.pitchT + (e.clientY - last.y) * k, p0, p1)
      last = { x: e.clientX, y: e.clientY }
    }
    const upP = () => (last = null)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      cabLook.fovT = THREE.MathUtils.clamp(cabLook.fovT * Math.exp(e.deltaY * 0.0012), 14, 80)
    }
    dom.addEventListener('pointerdown', downP)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', upP)
    dom.addEventListener('wheel', wheel, { passive: false })
    return () => {
      dom.removeEventListener('pointerdown', downP)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', upP)
      dom.removeEventListener('wheel', wheel)
    }
  }, [dom])

  // the crane's material swap + interior: attach to the rig, undo on leave / crane change
  useEffect(() => {
    const s = st.current
    return () => {
      if (s.rig && s.orig && s.rig.mesh.material === s.mat) s.rig.mesh.material = s.orig
      s.mat?.forEach((m, i) => m !== s.orig?.[i] && m.dispose())
      if (s.interior) {
        s.interior.group.removeFromParent()
        s.interior.dispose()
      }
      s.rig = null
      s.mat = null
      s.orig = null
      s.interior = null
    }
  }, [tag])

  useFrame((_, dtRaw) => {
    const c = controls.current
    const site = tag ? CRANE_BY_TAG.get(tag) : undefined
    if (!c || !site) return
    const dt = Math.min(dtRaw, 0.1)
    const s = st.current
    const d = craneDims(site.spec)
    const view = useCab.getState().view

    // find / re-find the 3D crane (it may remount); swap the material and hang the interior on the slew bone
    if (!s.rig || !s.rig.mesh.parent || s.rig.mesh.material !== s.mat) {
      if (s.look-- <= 0) {
        s.look = 30
        const rig = findRig(scene, site.tag)
        if (rig) {
          if (s.rig && s.orig && s.rig.mesh.material === s.mat) s.rig.mesh.material = s.orig
          s.mat?.forEach((m, i) => m !== s.orig?.[i] && m.dispose())
          s.rig = rig
          s.orig = rig.mesh.material as THREE.Material[]
          s.mat = cabMaterials(s.orig)
          rig.mesh.material = s.mat
          if (!s.interior) s.interior = buildInterior(d)
          rig.slew.add(s.interior.group)
        }
      }
    }

    // drive the crane at frame rate (no-op unless we hold it and the interlocks allow)
    driveManual(dtRaw)

    // look: damped yaw / pitch / zoom (slower on entry: turn from where you were to the boom)
    s.entry += dt
    const tl = s.entry < 1.6 ? 0.35 : 0.09
    if (YAW_MAX[view] === Infinity && Math.abs(cabLook.yawT) > Math.PI) {
      // unbounded (roof) yaw: keep the target in (−π, π] so C / a view change never unwinds whole turns
      const k = Math.round(cabLook.yawT / (2 * Math.PI)) * 2 * Math.PI
      cabLook.yawT -= k
      cabLook.yaw -= k
    }
    cabLook.yaw += (cabLook.yawT - cabLook.yaw) * damp(tl, dt)
    cabLook.pitch += (cabLook.pitchT - cabLook.pitch) * damp(tl, dt)
    cabLook.fov += (cabLook.fovT - cabLook.fov) * damp(0.12, dt)
    if (Math.abs(camera.fov - cabLook.fov) > 0.01) {
      camera.fov = cabLook.fov
      camera.updateProjectionMatrix()
    }

    // eye + look direction in the slewing frame → world, through the crane's bones (fallback: the plan formula)
    const cy = Math.cos(cabLook.yaw)
    const sy = Math.sin(cabLook.yaw)
    const cp = Math.cos(cabLook.pitch)
    const sp = Math.sin(cabLook.pitch)
    if (s.rig?.mesh.parent) {
      if (view === 'tip') {
        s.rig.boom.updateWorldMatrix(true, false)
        // just under the boom head, beside the hoist falls, looking down at the hook
        _eye.set(d.tip.t + 0.4, d.tip.n - 1.6, -1.5)
        s.rig.boom.localToWorld(_eye)
        s.rig.slew.updateWorldMatrix(true, false)
      } else {
        s.rig.slew.updateWorldMatrix(true, false)
        const [f, y, sl] = eyeOf(view, d)
        _eye.set(f, y, -sl)
        s.rig.slew.localToWorld(_eye)
      }
      _dir.set(cp * cy, sp, -cp * sy).transformDirection(s.rig.slew.matrixWorld)
    } else {
      const r = useCranes.getState().cranes[site.tag]
      const slew = r?.slew ?? site.park
      const [f, y, sl] = eyeOf(view === 'tip' ? 'cab' : view, d)
      const cs = Math.cos(slew)
      const ss = Math.sin(slew)
      _eye.set(site.x + f * cs + sl * ss, 28 + site.deckY + y, site.z + f * ss - sl * cs)
      const df = cp * cy
      const ds = cp * sy
      _dir.set(df * cs + ds * ss, sp, df * ss - ds * cs)
    }

    // glide in on entry and between views (an offset that decays to zero; then rigidly on the crane)
    if (s.fresh) {
      s.fresh = false
      s.entry = 0
      s.offset.copy(camera.position).sub(_eye)
      // start looking where the camera looked, then turn to the boom
      const fw = camera.getWorldDirection(_tmp)
      if (s.rig?.mesh.parent) {
        const inv = new THREE.Matrix4().copy(s.rig.slew.matrixWorld).invert()
        fw.transformDirection(inv)
        cabLook.yaw = Math.atan2(-fw.z, fw.x)
        cabLook.pitch = Math.asin(THREE.MathUtils.clamp(fw.y, -1, 1))
      }
      s.seek = 1.6
    }
    if (s.reglide) {
      s.reglide = false
      s.offset.copy(camera.position).sub(_eye)
    }
    if (s.offset.lengthSq() > 1e-6) {
      s.offset.multiplyScalar(1 - damp(s.seek > 1 ? 0.38 : 0.2, dt))
      if (s.offset.lengthSq() < 1e-6) s.offset.set(0, 0, 0)
    }
    s.seek = Math.max(0, s.seek - dt)
    _off.copy(_eye).add(s.offset)
    c.setLookAt(_off.x, _off.y, _off.z, _off.x + _dir.x * 5, _off.y + _dir.y * 5, _off.z + _dir.z * 5, false)
  })

  return null
}
