/**
 * CCTV (plan 07): the camera housings in 3D and the off-screen renderer for the console's camera wall.
 *
 * Housings: every camera as stainless Ex d hardware: PTZ = cylindrical housing with sunshield on a
 * pan-tilt head; thermal = square housing with a germanium window. A galvanised pole runs down to the
 * deck. All cameras merged into two meshes (metal + glass). Not pickable.
 *
 * Feeds: only while `useCctv.feedsVisible` (the console page is open) and the tab is visible. Every
 * FEED_INTERVAL_MS ONE camera is rendered into a half-float render target, in a plain useFrame
 * (priority 0, before the post-processing composer draws the main view). Round-robin, with the selected /
 * called-up camera every other turn. The pixels come back asynchronously (PBO + fence, no GPU stall),
 * then a CPU pass flips Y, applies ACES tone mapping + sRGB (render targets get neither) or the thermal
 * iron palette, and paints the camera's registered canvas. Detections (safety/cctv.ts detect) are
 * computed at render time and published with the frame, so boxes match the picture.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CAMERAS, FEED_INTERVAL_MS, STEER_INTERVAL_MS, aimOf, detect, feedCanvases, feedStats, lastFrames, useCctv, type CctvCameraEx } from '../safety/cctv'
import type { Detection } from '../safety/types'
import type { Plant } from '../model/types'
import { usePlant } from '../state/plantStore'
import { DECK_WORLD_Y } from '../state/store'
import { isRunning, useSim } from '../state/sim'
import { footprints } from '../model/footprint'
import { labelHeight } from '../ui/labels'
import { levelAt, walkLevels } from './Walk'
import { flameHeight } from '../sim/fg'
import { ALPHA_DECK, LQ, RP, WHP, WI } from '../model/site'
import type { Incident } from '../sim/types'
import { FLARE, flareTip } from './env/topsides'
import { disposeSegCtx, makeSegCtx, renderSeg, type SegCtx } from './cctvSeg'
import { SEG_CLASSES, type SegClassId } from '../safety/cctv'

// ---------------------------------------------------------------- housings

const noRaycast = () => null

function colored(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g.index ? g.toNonIndexed() : g
}
const zAxis = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2)

/** one camera's hardware in world space: [metal parts, glass parts] */
function housing(cam: CctvCameraEx): [THREE.BufferGeometry[], THREE.BufferGeometry[]] {
  const pos = new THREE.Vector3(...cam.pos)
  const head = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(...cam.target), new THREE.Vector3(0, 1, 0)).setPosition(pos)
  const metal: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []
  const inHead = (g: THREE.BufferGeometry, color: string, x: number, y: number, z: number, into = metal) => into.push(colored(g.translate(x, y, z), color).applyMatrix4(head))
  const steel = '#c3c8cd'
  const shield = '#e9e9e4'
  if (cam.type === 'ptz') {
    // body along +Z behind the lens (the head frame looks down −Z)
    inHead(zAxis(new THREE.CylinderGeometry(0.105, 0.105, 0.46, 20)), steel, 0, 0, 0.25)
    inHead(zAxis(new THREE.CylinderGeometry(0.118, 0.118, 0.035, 20)), steel, 0, 0, 0.035)
    inHead(zAxis(new THREE.CylinderGeometry(0.118, 0.118, 0.035, 20)), steel, 0, 0, 0.47)
    inHead(new THREE.BoxGeometry(0.27, 0.012, 0.56), shield, 0, 0.135, 0.22)
    inHead(zAxis(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 20)), '#0d1013', 0, 0, 0.012, glass)
  } else {
    inHead(new THREE.BoxGeometry(0.22, 0.22, 0.42), steel, 0, 0, 0.23)
    inHead(new THREE.BoxGeometry(0.25, 0.25, 0.04), steel, 0, 0, 0.03)
    inHead(new THREE.BoxGeometry(0.29, 0.012, 0.52), shield, 0, 0.14, 0.2)
    inHead(zAxis(new THREE.CylinderGeometry(0.065, 0.065, 0.012, 20)), '#1c1712', 0, 0, 0.004, glass)
    inHead(zAxis(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 12)), '#0b0c0e', 0.075, -0.07, 0.006, glass)
  }
  // pan-tilt unit + bracket (world-vertical) and the pole down to the deck
  const add = (g: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => metal.push(colored(g, color).translate(x, y, z))
  const back = new THREE.Vector3(0, 0, 0.24).applyMatrix4(new THREE.Matrix4().extractRotation(head))
  const px = pos.x + back.x
  const pz = pos.z + back.z
  add(new THREE.CylinderGeometry(0.085, 0.095, 0.2, 16), steel, px, pos.y - 0.22, pz)
  const poleTop = pos.y - 0.32
  const len = Math.max(0.2, poleTop - cam.floorY)
  add(new THREE.CylinderGeometry(0.055, 0.055, len, 10), '#9aa1a8', px, cam.floorY + len / 2, pz)
  add(new THREE.BoxGeometry(0.34, 0.025, 0.34), '#8d949b', px, cam.floorY + 0.012, pz)
  add(new THREE.BoxGeometry(0.16, 0.16, 0.16), '#8d949b', px, poleTop - 0.06, pz) // junction box (Ex e)
  return [metal, glass]
}

function Housings() {
  const geo = useMemo(() => {
    const metal: THREE.BufferGeometry[] = []
    const glass: THREE.BufferGeometry[] = []
    for (const c of CAMERAS) {
      const [m, g] = housing(c)
      metal.push(...m)
      glass.push(...g)
    }
    return { metal: mergeGeometries(metal, false)!, glass: mergeGeometries(glass, false)! }
  }, [])
  const mats = useMemo(
    () => ({
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.38 }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.08 }),
    }),
    [],
  )
  useEffect(
    () => () => {
      geo.metal.dispose()
      geo.glass.dispose()
      mats.metal.dispose()
      mats.glass.dispose()
    },
    [geo, mats],
  )
  return (
    <group name="cctv-cameras">
      <mesh geometry={geo.metal} material={mats.metal} raycast={noRaycast} />
      <mesh geometry={geo.glass} material={mats.glass} raycast={noRaycast} />
    </group>
  )
}

// ---------------------------------------------------------------- pixel pipeline

/** IEEE half → float */
function halfToFloat(h: number) {
  const s = h & 0x8000 ? -1 : 1
  const e = (h >> 10) & 0x1f
  const f = h & 0x3ff
  if (e === 0) return s * 6.103515625e-5 * (f / 1024)
  if (e === 31) return f ? 0 : s * 65504
  return s * Math.pow(2, e - 15) * (1 + f / 1024)
}
const aces = (x: number) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)))
const srgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
let HALF_LUT: Uint8Array | null = null
/** half-float linear radiance → display byte (exposure, ACES filmic, sRGB) */
function halfLut() {
  if (HALF_LUT) return HALF_LUT
  const lut = new Uint8Array(65536)
  for (let h = 0; h < 65536; h++) {
    const v = halfToFloat(h)
    lut[h] = v > 0 ? Math.round(srgb(aces(v * 1.05)) * 255) : 0
  }
  return (HALF_LUT = lut)
}
let IRON: Uint8Array | null = null
/** thermal "iron" palette: black → indigo → magenta → orange → yellow → white */
function ironLut() {
  if (IRON) return IRON
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 0],
    [0.18, 32, 0, 90],
    [0.38, 145, 0, 150],
    [0.58, 225, 60, 35],
    [0.76, 252, 160, 0],
    [0.9, 255, 228, 70],
    [1, 255, 255, 245],
  ]
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let k = 0
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++
    const [t0, r0, g0, b0] = stops[k]
    const [t1, r1, g1, b1] = stops[k + 1]
    const u = (t - t0) / (t1 - t0 || 1)
    lut[i * 3] = r0 + (r1 - r0) * u
    lut[i * 3 + 1] = g0 + (g1 - g0) * u
    lut[i * 3 + 2] = b0 + (b1 - b0) * u
  }
  return (IRON = lut)
}

/** a heat source in image pixels (thermal cameras): centre, radii, added heat */
interface Blob {
  x: number
  y: number
  rx: number
  ry: number
  heat: number
}

const imgCache = new WeakMap<HTMLCanvasElement, ImageData>()
let heatBuf = new Float32Array(0)

/** CPU pass: Y-flip + tone map (colour) or iron palette (thermal) → the camera's offscreen frame */
function paint(cam: CctvCameraEx, src: Uint16Array | Uint8Array, w: number, h: number, blobs: Blob[], seed: number): HTMLCanvasElement {
  let frame = lastFrames.get(cam.id)
  if (!frame || frame.width !== w || frame.height !== h) {
    frame = document.createElement('canvas')
    frame.width = w
    frame.height = h
    lastFrames.set(cam.id, frame)
  }
  const g = frame.getContext('2d')!
  let img = imgCache.get(frame)
  if (!img) imgCache.set(frame, (img = g.createImageData(w, h)))
  const out = img.data
  const half = src instanceof Uint16Array
  const lut = halfLut()
  const px = (i: number) => (half ? lut[src[i]] : src[i])
  if (cam.type === 'ptz') {
    for (let y = 0; y < h; y++) {
      const si = (h - 1 - y) * w * 4
      const di = y * w * 4
      for (let x = 0; x < w * 4; x += 4) {
        out[di + x] = px(si + x)
        out[di + x + 1] = px(si + x + 1)
        out[di + x + 2] = px(si + x + 2)
        out[di + x + 3] = 255
      }
    }
  } else {
    if (heatBuf.length < w * h) heatBuf = new Float32Array(w * h)
    const heat = heatBuf
    for (let y = 0; y < h; y++) {
      const si = (h - 1 - y) * w * 4
      for (let x = 0; x < w; x++) {
        const r = px(si + x * 4) / 255
        const gg = px(si + x * 4 + 1) / 255
        const b = px(si + x * 4 + 2) / 255
        const lum = 0.299 * r + 0.587 * gg + 0.114 * b
        // warm = luminous and red-shifted (people, flames, hot paint); sky / sea read cold
        let v = 0.3 * lum + 0.55 * Math.max(0, r - b)
        if (b > r + 0.03) v *= 0.45
        heat[y * w + x] = v
      }
    }
    for (const bl of blobs) {
      const x0 = Math.max(0, Math.floor(bl.x - bl.rx * 1.6))
      const x1 = Math.min(w - 1, Math.ceil(bl.x + bl.rx * 1.6))
      const y0 = Math.max(0, Math.floor(bl.y - bl.ry * 1.6))
      const y1 = Math.min(h - 1, Math.ceil(bl.y + bl.ry * 1.6))
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = (x - bl.x) / bl.rx
          const dy = (y - bl.y) / bl.ry
          const d2 = dx * dx + dy * dy
          if (d2 < 2.6) heat[y * w + x] += bl.heat * Math.exp(-d2 * 1.4)
        }
    }
    const iron = ironLut()
    let s = seed | 1
    for (let i = 0; i < w * h; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      const noise = ((s >> 16) & 0xff) / 255 - 0.5
      const t = Math.max(0, Math.min(255, Math.round(((heat[i] - 0.04) / 0.62) * 255 + noise * 7)))
      out[i * 4] = iron[t * 3]
      out[i * 4 + 1] = iron[t * 3 + 1]
      out[i * 4 + 2] = iron[t * 3 + 2]
      out[i * 4 + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  return frame
}

// ---------------------------------------------------------------- occlusion (equipment boxes, not a scene raycast)

function occluders(plant: Plant): { boxes: THREE.Box3[]; slabs: THREE.Box3[] } {
  const levels = walkLevels(plant)
  const fps = footprints(plant.equipment, 0)
  const boxes: THREE.Box3[] = []
  plant.equipment.forEach((e, i) => {
    if (e.kind === 'proxy') return
    const f = fps[i]
    const floor = levels[levelAt(levels, e.position[1])]?.y ?? 0
    const top = Math.max(floor + 1, labelHeight(e) - 1.1)
    // shrink a little: footprints include nozzles / walkway margins the eye sees past
    boxes.push(new THREE.Box3(new THREE.Vector3(f.x0 + 0.15, floor + DECK_WORLD_Y, f.z0 + 0.15), new THREE.Vector3(f.x1 - 0.15, top + DECK_WORLD_Y, f.z1 - 0.15)))
  })
  // deck plates between levels (Alpha weather deck and production deck; the satellites' main decks)
  const slabs: THREE.Box3[] = []
  const slab = (r: { x0: number; x1: number; z0: number; z1: number }, y0: number, y1: number) => slabs.push(new THREE.Box3(new THREE.Vector3(r.x0, y0 + DECK_WORLD_Y, r.z0), new THREE.Vector3(r.x1, y1 + DECK_WORLD_Y, r.z1)))
  slab(ALPHA_DECK, 9.4, 10)
  for (const r of [ALPHA_DECK, WHP.deck, RP.deck, WI.deck, LQ.deck]) slab(r, -0.9, -0.05)
  return { boxes: [...boxes, ...slabs], slabs }
}

/** is the segment camera → p clear of these boxes (boxes holding p itself don't count) */
function clear(origin: THREE.Vector3, p: THREE.Vector3, boxes: THREE.Box3[]) {
  const dist = origin.distanceTo(p)
  _ray.set(origin, _dir.copy(p).sub(origin).normalize())
  for (const b of boxes) if (!b.containsPoint(p) && _ray.intersectBox(b, _hit) && origin.distanceTo(_hit) < dist - 0.4) return false
  return true
}
const _ray = new THREE.Ray()
const _dir = new THREE.Vector3()
const _hit = new THREE.Vector3()

// ---------------------------------------------------------------- renderer

const HOT_KINDS = new Set(['compressorPackage', 'gasTurbineGenerator', 'pumpPackage', 'caissonPump', 'transformer'])

interface FeedCtx {
  boxes: THREE.Box3[]
  slabs: THREE.Box3[]
  hot: Plant['equipment']
  cam3: THREE.PerspectiveCamera
  rts: Map<string, THREE.WebGLRenderTarget>
  /** readback buffer per render target (reused: `pending` guarantees one read at a time) */
  bufs: Map<string, Uint16Array | Uint8Array>
  last: number
  turn: number
  rr: number
  pending: boolean
  half: boolean
  /** simulated SAM 3.1 id pass (main monitor only) */
  seg: SegCtx
}

function FeedRenderer() {
  const plant = usePlant()
  const ctx = useRef<FeedCtx | null>(null)
  useEffect(() => {
    const c: FeedCtx = { ...occluders(plant), hot: plant.equipment.filter((e) => HOT_KINDS.has(e.kind)), cam3: new THREE.PerspectiveCamera(46, 16 / 9, 0.3, 900), rts: new Map(), bufs: new Map(), last: 0, turn: 0, rr: 0, pending: false, half: true, seg: makeSegCtx(plant) }
    ctx.current = c
    return () => {
      disposeSegCtx(c.seg)
      for (const rt of c.rts.values()) rt.dispose()
      c.rts.clear()
      if (ctx.current === c) ctx.current = null
    }
  }, [plant])
  useFrame(({ gl, scene }) => {
    if (ctx.current) feedTurn(gl, scene, ctx.current)
  })
  return null
}

/** one scheduler tick: maybe render one camera off-screen, read it back, detect, paint */
function feedTurn(gl: THREE.WebGLRenderer, scene: THREE.Scene, st: FeedCtx) {
  const cctv = useCctv.getState()
  if (!cctv.feedsVisible || st.pending || document.hidden || feedCanvases.size === 0) return
  const now = performance.now()
  if (now - st.last < (cctv.steering ? STEER_INTERVAL_MS : FEED_INTERVAL_MS)) return
  st.last = now
  st.turn++
  // ---- whose turn: the big tile's camera every other turn (every turn while it is being steered), the others round-robin
  const prio = cctv.callUp ?? cctv.selected
  let cam: CctvCameraEx | undefined
  if ((cctv.steering || st.turn % 2 === 0) && feedCanvases.has(prio)) cam = CAMERAS.find((c) => c.id === prio)
  for (let k = 0; !cam && k < CAMERAS.length; k++) {
    const c = CAMERAS[st.rr++ % CAMERAS.length]
    if (c.id !== prio && feedCanvases.has(c.id)) cam = c
  }
  if (!cam && feedCanvases.has(prio)) cam = CAMERAS.find((c) => c.id === prio)
  if (!cam) return
  const canvas = feedCanvases.get(cam.id)!
  const w = canvas.width
  const h = canvas.height
  const key = `${w}x${h}:${st.half ? 'h' : 'b'}`
  let rt = st.rts.get(key)
  if (!rt) {
    rt = new THREE.WebGLRenderTarget(w, h, { type: st.half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true, samples: 0 })
    st.rts.set(key, rt)
  }

  // ---- camera
  const cam3 = st.cam3
  const aim = aimOf(cam, cctv.ptz[cam.id])
  cam3.position.set(...cam.pos)
  cam3.fov = aim.fov
  cam3.aspect = w / h
  cam3.near = 0.3
  cam3.far = 900
  cam3.up.set(0, 1, 0)
  cam3.lookAt(...aim.target)
  cam3.updateProjectionMatrix()
  cam3.updateMatrixWorld(true)

  // ---- render (restore everything the main pipeline relies on)
  const tr0 = performance.now()
  const prevTarget = gl.getRenderTarget()
  const prevAuto = gl.autoClear
  const prevOverride = scene.overrideMaterial
  scene.overrideMaterial = null
  gl.setRenderTarget(rt)
  gl.autoClear = false
  gl.clear(true, true, true)
  gl.render(scene, cam3)
  gl.setRenderTarget(prevTarget)
  gl.autoClear = prevAuto
  scene.overrideMaterial = prevOverride

  // ---- simulated SAM 3.1: instance masks for the main monitor's camera
  if (cam.id === prio && cctv.seg) {
    const enabled = new Set((SEG_CLASSES.map((k) => k.id) as SegClassId[]).filter((id) => cctv.prompts[id]))
    const segCam = cam
    renderSeg(gl, scene, cam3, st.seg, enabled, Math.floor(useSim.getState().t / 3))?.then((r) => useCctv.getState().pushSeg(segCam.id, r.mask, r.instances, r.ms))
  }

  // ---- simulated detections for this exact frame (occlusion against equipment boxes)
  const t = useSim.getState().t
  const origin = cam3.position.clone()
  const visible = (_id: string, chest: THREE.Vector3) => clear(origin, chest, st.boxes)
  const hazardVisible = (p: THREE.Vector3) => clear(origin, p, st.slabs)
  const dets = detect(cam, cam3, t, visible, hazardVisible)
  const renderMs = performance.now() - tr0
  const blobs = cam.type === 'thermal' ? heatBlobs(cam3, w, h, st.hot, dets) : []

  // ---- read back asynchronously (no GPU stall), then paint
  st.pending = true
  const target = rt
  const camera = cam
  let buf = st.bufs.get(key)
  if (!buf) st.bufs.set(key, (buf = st.half ? new Uint16Array(w * h * 4) : new Uint8Array(w * h * 4)))
  const px = buf
  const done = (pixels: Uint16Array | Uint8Array) => {
    const tp0 = performance.now()
    const frame = paint(camera, pixels, w, h, blobs, Math.floor(now))
    const c = feedCanvases.get(camera.id)
    if (c) {
      const g = c.getContext('2d')
      if (c.width === w && c.height === h) g?.drawImage(frame, 0, 0)
      else g?.drawImage(frame, 0, 0, c.width, c.height)
    }
    const tNow = performance.now()
    const s = feedStats.get(camera.id) ?? { frames: 0, last: 0, fps: 0, ms: 0 }
    s.ms = renderMs + (tNow - tp0)
    if (s.last) s.fps = s.fps ? s.fps * 0.7 + (1000 / (tNow - s.last)) * 0.3 : 1000 / (tNow - s.last)
    s.last = tNow
    s.frames++
    feedStats.set(camera.id, s)
    useCctv.getState().pushFrame(camera.id, dets)
  }
  gl.readRenderTargetPixelsAsync(target, 0, 0, w, h, buf)
    .then(() => done(px))
    .catch(() => {
      // half-float readback unsupported here: switch to 8-bit targets (linear, tone-mapped on the CPU)
      if (st.half) st.half = false
      else {
        gl.readRenderTargetPixels(target, 0, 0, w, h, px)
        done(px)
      }
    })
    .finally(() => {
      st.pending = false
    })
}

/** heat sources for a thermal frame: running machinery, live fires, people (body heat) */
function heatBlobs(cam3: THREE.PerspectiveCamera, w: number, h: number, hot: Plant['equipment'], dets: Detection[]): Blob[] {
  const out: Blob[] = []
  const v = new THREE.Vector3()
  const cs = new THREE.Vector3()
  const proj = (x: number, y: number, z: number, r: number, heat: number) => {
    cs.set(x, y, z).applyMatrix4(cam3.matrixWorldInverse)
    if (cs.z > -0.5) return
    const dist = -cs.z
    // a source right next to the lens (the machine the camera is mounted on) would fill the frame
    if (dist < 6) return
    v.set(x, y, z).project(cam3)
    if (Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) return
    const pxPerM = h / 2 / Math.tan(THREE.MathUtils.degToRad(cam3.fov / 2)) / dist
    out.push({ x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, rx: r * pxPerM, ry: r * pxPerM * 0.8, heat })
  }
  for (const e of hot) {
    if (!isRunning(e.tag)) continue
    const heat = e.kind === 'gasTurbineGenerator' ? 0.7 : e.kind === 'compressorPackage' ? 0.55 : e.kind === 'transformer' ? 0.3 : 0.32
    const r = e.kind === 'gasTurbineGenerator' ? 2.2 : e.kind === 'compressorPackage' ? 1.6 : 0.8
    proj(e.position[0], e.position[1] + DECK_WORLD_Y + 1, e.position[2], r, heat)
  }
  // the flare: white-hot tip, bigger with the flaring rate (stack-monitoring camera)
  const flare = (useSim.getState() as { result?: { flare?: number } | null }).result?.flare ?? 0.4
  const tip = flareTip()
  const fd = FLARE.dir
  proj(tip[0] + fd.x * 3.4, tip[1] + fd.y * 3.4 + 1.5, tip[2] + fd.z * 3.4, Math.min(9, 2.2 + flare / 8), 0.9 + Math.min(1, flare / 25) * 0.8)
  const incidents = (useSim.getState() as { incidents?: Incident[] }).incidents ?? []
  for (const inc of incidents) {
    if (inc.cleared !== undefined || !inc.pos || inc.fault.kind !== 'fire' || !inc.burning) continue
    const H = flameHeight(inc.fault.sizeMW)
    proj(inc.pos[0], inc.pos[1] + DECK_WORLD_Y + H / 2, inc.pos[2], Math.max(1, H / 2), 1.4)
  }
  for (const d of dets) {
    if (d.kind !== 'person') continue
    const [x0, y0, x1, y1] = d.box
    out.push({ x: ((x0 + x1) / 2) * w, y: (y0 + (y1 - y0) * 0.4) * h, rx: ((x1 - x0) / 2) * w * 0.9, ry: ((y1 - y0) / 2) * h * 0.95, heat: 0.45 })
  }
  return out
}

export function CctvRenderer() {
  return (
    <>
      <Housings />
      <FeedRenderer />
    </>
  )
}
