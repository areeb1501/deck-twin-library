/**
 * CCTV: hazardous-area cameras and simulated PPE / hazard detections (plan 07).
 *
 *  - CAMERAS: fifteen cameras aimed at the high-risk equipment and critical areas. Ex d explosion-proof PTZ colour cameras
 *    (stainless housings, ATEX / IECEx Zone 1, IP68) and thermal / multispectral flame-detection
 *    cameras. WORLD coordinates (deck-local + [0, 28, 0]); the target is computed from the watched
 *    equipment in the plant.
 *  - detect(): the SIMULATED detector (`model: 'sim'`): ground truth from the twin (worker poses + PPE
 *    flags, live incidents) projected into the camera image. The seam for SAM 3.1 (plan 09) is the
 *    frame (scene/CctvRenderer.tsx paints it into a canvas) plus the Detection[] it returns.
 *  - useCctv: live detections per camera, the violation / hazard log, the called-up camera and the
 *    operator's selection. `feedsVisible` is set by the console page while it is open, so the
 *    off-screen renderer only works while someone watches.
 *  - Call-up (sim plugin `cctv`): a rising F&G edge in a zone (gas high / confirmed, flame single /
 *    confirmed) calls up the first camera covering that zone, as a control room does.
 *  - Hazardous areas (plan 14): a person the worn-tag tracker (workers.ts useHazardTrack) has in a Zone 0 /
 *    1 / 2 violation, still standing in that zone and visible to the camera, gets a `zone0Entry` / `zonePpe`
 *    box. The camera contributes the zone (its zone map), the person and the hard hat / vest; "no gas
 *    monitor" comes from the tag (vision can't see a clip-on monitor). The first sighting confirms the
 *    tracked violation (confirmByCamera); a Zone 0 entry calls the best camera up (plugin `cctv-hazard`).
 *    camerasSeeing(p) ranks the cameras that see a world point (frustum, range, equipment-box occlusion).
 */
import * as THREE from 'three'
import { create } from 'zustand'
import type { Vec3 } from '../model/types'
import type { Plant } from '../model/types'
import type { Incident, PlatformId, ZoneStatus } from '../sim/types'
import { DETECTION_LABEL, type CctvCamera, type Detection, type DetectionKind } from './types'
import { DECK_WORLD_Y } from '../state/store'
import { usePlantStore } from '../state/plantStore'
import { isRunning, registerSimPlugin, useSim } from '../state/sim'
import { cloudShape, flameHeight, zoneAt, zoneById, zoneCentre, zoneOfTag } from '../sim/fg'
import { getWind } from '../sim/fg/live'
import { confirmByCamera, openViolationOf, useHazardTrack, useWorkers, workerPose } from './workers'
import { footprints, type Footprint } from '../model/footprint'
import { personZone } from './hazardAreas'
import { labelHeight } from '../ui/labels'
import { levelAt, walkLevels } from '../scene/Walk'
import { ALPHA_DECK, LQ, RP, WHP, WI } from '../model/site'

export type CameraType = 'ptz' | 'thermal'

export interface CctvCameraEx extends CctvCamera {
  type: CameraType
  /** equipment tags the camera is aimed at (the first is the "Walk to" target) */
  watches: string[]
  /** F&G zones the camera covers (call-up + detector panel) */
  zones: string[]
  /** world y of the deck the mounting pole stands on */
  floorY: number
  /** hazardous-area certification printed in the OSD */
  ex: string
  /** product line, for the OSD / tooltip */
  model: string
}

interface Spec {
  id: string
  name: string
  platform: PlatformId
  type: CameraType
  watches: string[]
  /** deck-local lens position */
  mount: Vec3
  /** deck-local floor of the deck below */
  floor: number
  /** deck-local aim point, when it is not the watched equipment (people-flow cameras) */
  aim?: Vec3
  /** extra zones beyond the watched equipment's own */
  zones?: string[]
  fov?: number
}

const EX_PTZ = 'Ex d IIC T4 Gb · IP68'
const EX_THERMAL = 'Ex d IIC T6 Gb · IP68'

/** placements: rack-post brackets / module corners ~6–8 m up (below the weather deck steel at 9.4 m) */
const SPECS: Spec[] = [
  { id: 'CCTV-A01', name: 'HP separator & manifold', platform: 'Alpha', type: 'ptz', watches: ['V-1100', 'M-1000', 'V-1200'], mount: [-27, 8.2, -3.2], floor: 0, aim: [-14, 1.4, -12], zones: ['A-P-SEP'], fov: 50 },
  { id: 'CCTV-A02', name: 'Export pumps & export header', platform: 'Alpha', type: 'ptz', watches: ['P-1500A', 'P-1500B'], mount: [11.6, 7.6, -2.6], floor: 0, zones: ['A-P-EXP'] },
  { id: 'CCTV-A03', name: 'Gas compressor K-2200', platform: 'Alpha', type: 'thermal', watches: ['K-2200', 'E-2300'], mount: [11.6, 7.6, 2.6], floor: 0, zones: ['A-P-COMP'], fov: 40 },
  { id: 'CCTV-A04', name: 'Cellar deck well bay', platform: 'Alpha', type: 'thermal', watches: ['XT-110', 'XT-120', 'XT-130', 'XT-140', 'XT-150'], mount: [8, -2.6, -3.4], floor: -8, zones: ['A-C-WELL'], fov: 44 },
  { id: 'CCTV-A05', name: 'Turbine generators GT-8100A/B', platform: 'Alpha', type: 'ptz', watches: ['GT-8100A', 'GT-8100B'], mount: [-2.4, 16.8, 0.8], floor: 10, zones: ['A-W-PWR'] },
  { id: 'CCTV-N01', name: 'WHP-N well bay', platform: 'WHP-N', type: 'ptz', watches: ['XT-N101', 'XT-N102', 'XT-N103', 'XT-N104', 'XT-N105', 'XT-N106'], mount: [12.5, 7, -66.5], floor: 0, zones: ['N-WELL'] },
  { id: 'CCTV-R01', name: 'RP pig launchers & metering', platform: 'RP', type: 'ptz', watches: ['L-R110', 'L-R210', 'X-R150'], mount: [-73.5, 7, -3.2], floor: 0, zones: ['R-PROC'] },
  { id: 'CCTV-L01', name: 'South bridge / LQ entrance', platform: 'LQ', type: 'ptz', watches: ['B-9300'], mount: [9.6, 6, 62], floor: 0, aim: [6, 0.9, 42], zones: ['B-S', 'LQ-MAIN'], fov: 34 },
  // ---- more critical areas: relief & firewater, gas treatment, flare, drilling, the satellites, emergency power
  { id: 'CCTV-A06', name: 'Flare KO drum & firewater pumps', platform: 'Alpha', type: 'ptz', watches: ['V-2400', 'B-7100', 'B-7200'], mount: [26, 7.4, 3.4], floor: 0, aim: [15.5, 1.6, 13.5], fov: 52 },
  { id: 'CCTV-A07', name: 'Produced water & TEG dehydration', platform: 'Alpha', type: 'ptz', watches: ['X-4200', 'V-4100', 'T-5300', 'C-5350'], mount: [-6.5, 7.6, 3.2], floor: 0, fov: 52 },
  { id: 'CCTV-A08', name: 'Flare tip (stack monitoring, from LQ)', platform: 'Alpha', type: 'thermal', watches: ['V-2400'], mount: [20.4, 7.2, 61.2], floor: 0, aim: [76, 62, 28], fov: 16 },
  { id: 'CCTV-A09', name: 'Drill floor & rotary table', platform: 'Alpha', type: 'ptz', watches: ['DR-100'], mount: [-5, 23.5, -4], floor: 10, aim: [3, 18.4, -13], fov: 50 },
  { id: 'CCTV-N02', name: 'WHP-N test manifold, MPFM & vent KO', platform: 'WHP-N', type: 'ptz', watches: ['M-N210', 'V-N240', 'V-N290'], mount: [24, 6.5, -71.5], floor: 0, fov: 50 },
  { id: 'CCTV-W01', name: 'WI injection pumps & deaerator', platform: 'WI', type: 'thermal', watches: ['P-W310A', 'P-W310B', 'V-W320'], mount: [10.5, 6.5, -131.5], floor: 0, fov: 50 },
  { id: 'CCTV-L02', name: 'Emergency generator room (LQ)', platform: 'LQ', type: 'ptz', watches: ['B-9310', 'V-9330'], mount: [2.6, 6.2, 71.2], floor: 0, aim: [-3, 1.4, 78.5], fov: 56 },
]

function buildCameras(plant: Plant): CctvCameraEx[] {
  const byTag = new Map(plant.equipment.map((e) => [e.tag, e]))
  return SPECS.map((s) => {
    const pts = s.watches.map((t) => byTag.get(t)?.position).filter((p): p is Vec3 => !!p)
    const aim: Vec3 = s.aim ?? (pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, s.floor + 1.4, pts.reduce((a, p) => a + p[2], 0) / pts.length] : [s.mount[0], s.floor, s.mount[2] - 8])
    const zones = new Set(s.zones ?? [])
    for (const t of s.watches) {
      const z = zoneOfTag(plant, t)
      if (z && z.kind !== 'module') zones.add(z.id)
    }
    const za = zoneAt(plant, aim)
    if (za) zones.add(za.id)
    return {
      id: s.id,
      name: s.name,
      platform: s.platform,
      type: s.type,
      watches: s.watches,
      zones: [...zones],
      pos: [s.mount[0], s.mount[1] + DECK_WORLD_Y, s.mount[2]],
      target: [aim[0], aim[1] + DECK_WORLD_Y, aim[2]],
      fov: s.fov ?? 46,
      floorY: s.floor + DECK_WORLD_Y,
      ex: s.type === 'thermal' ? EX_THERMAL : EX_PTZ,
      model: s.type === 'thermal' ? 'Thermal / multispectral flame-detection camera, 640×512 LWIR' : 'Stainless Ex d PTZ colour camera, 30× optical zoom',
    }
  })
}

export const CAMERAS: CctvCameraEx[] = buildCameras(usePlantStore.getState().plant)
export const cameraById = (id: string | null | undefined) => CAMERAS.find((c) => c.id === id)

/** feed resolution of the small tiles (the big tile renders at its own canvas size) */
export const FEED_W = 512
export const FEED_H = 288
/** one off-screen render every … ms (round-robin; the selected / called-up camera every other turn) */
export const FEED_INTERVAL_MS = 250
/** while the operator steers the main monitor (drag, zoom, 360° sweep) */
export const STEER_INTERVAL_MS = 50

// ---------------------------------------------------------------- feed canvas registry (page ↔ scene/CctvRenderer.tsx)

/** canvases the console page registered, by camera id (the renderer only paints these) */
export const feedCanvases = new Map<string, HTMLCanvasElement>()
/** last painted frame per camera (copied into a canvas when it is (re)registered, e.g. on tile swaps) */
export const lastFrames = new Map<string, HTMLCanvasElement>()
/** feed statistics per camera (read by the page; mutated here) */
export const feedStats = new Map<string, { frames: number; last: number; fps: number; /** main-thread ms: render submit + CPU pixel pass */ ms: number }>()

/** the page calls this when a tile's canvas mounts; shows the last frame (or NO SIGNAL) at once */
export function registerFeed(id: string, canvas: HTMLCanvasElement) {
  feedCanvases.set(id, canvas)
  const g = canvas.getContext('2d')
  if (!g) return
  const last = lastFrames.get(id)
  if (last) g.drawImage(last, 0, 0, canvas.width, canvas.height)
  else {
    g.fillStyle = '#050607'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = '#5d6369'
    g.font = `${Math.round(canvas.height / 14)}px ui-monospace, Menlo, monospace`
    g.textAlign = 'center'
    g.fillText('CONNECTING…', canvas.width / 2, canvas.height / 2)
  }
}
export function unregisterFeed(id: string, canvas: HTMLCanvasElement) {
  if (feedCanvases.get(id) === canvas) feedCanvases.delete(id)
}

// ---------------------------------------------------------------- simulated SAM 3.1 segmentation (main monitor)

/** concept prompts the segmenter is asked for (SAM 3-style noun phrases), with their mask colours */
export const SEG_CLASSES = [
  { id: 'person', prompt: 'person', color: '#3fa7ff' },
  { id: 'hardHat', prompt: 'hard hat', color: '#ffe14d' },
  { id: 'vest', prompt: 'high-visibility vest', color: '#b6ff3b' },
  { id: 'vessel', prompt: 'pressure vessel', color: '#ff7a45' },
  { id: 'exchanger', prompt: 'heat exchanger', color: '#ffb340' },
  { id: 'pump', prompt: 'pump', color: '#28d7c4' },
  { id: 'compressor', prompt: 'compressor', color: '#ff4fa3' },
  { id: 'turbine', prompt: 'gas turbine', color: '#c86bff' },
  { id: 'wellhead', prompt: 'wellhead', color: '#ff5b5b' },
  { id: 'piping', prompt: 'manifold / pig launcher', color: '#8f9bff' },
  { id: 'skid', prompt: 'skid / transformer', color: '#5fd16a' },
  { id: 'module', prompt: 'building', color: '#9aa5ad' },
] as const
export type SegClassId = (typeof SEG_CLASSES)[number]['id']
export const SEG_BY_ID = Object.fromEntries(SEG_CLASSES.map((c) => [c.id, c])) as Record<SegClassId, (typeof SEG_CLASSES)[number]>

/** equipment kind → concept (null = not segmented) */
export function segClassOf(kind: string): SegClassId | null {
  switch (kind) {
    case 'horizontalVessel':
    case 'verticalVessel':
      return 'vessel'
    case 'shellTube':
      return 'exchanger'
    case 'pumpPackage':
    case 'caissonPump':
      return 'pump'
    case 'compressorPackage':
      return 'compressor'
    case 'gasTurbineGenerator':
      return 'turbine'
    case 'xmasTree':
      return 'wellhead'
    case 'manifold':
    case 'pigTrap':
      return 'piping'
    case 'chemSkid':
    case 'transformer':
      return 'skid'
    case 'module':
      return 'module'
    default:
      return null
  }
}

/** one segmented instance (normalised image coords, origin top-left) */
export interface SegInstance {
  id: string
  cls: SegClassId
  /** plant tag or worker id */
  ref: string
  name: string
  score: number
  box: [number, number, number, number]
  /** where the label goes (top centre of the mask) */
  anchor: [number, number]
  pixels: number
}

/**
 * Pan / tilt / zoom of a camera head, relative to its installed aim (360° pan, tilt -85°…+60° from level,
 * zoom 1…12× on the lens FOV). The renderer, detections and masks all follow it, so boxes stay on the picture.
 */
export interface Ptz {
  /** degrees, positive turns right (clockwise seen from above); unbounded, wraps */
  pan: number
  /** degrees, positive tilts up */
  tilt: number
  zoom: number
}
export const PTZ_HOME: Ptz = { pan: 0, tilt: 0, zoom: 1 }
const TILT_MIN = -85
const TILT_MAX = 60

/** installed aim as heading (deg, 0 = north / −z, clockwise) and elevation (deg) */
export function homeAngles(c: CctvCameraEx) {
  const dx = c.target[0] - c.pos[0]
  const dy = c.target[1] - c.pos[1]
  const dz = c.target[2] - c.pos[2]
  return { heading: THREE.MathUtils.radToDeg(Math.atan2(dx, -dz)), elevation: THREE.MathUtils.radToDeg(Math.atan2(dy, Math.hypot(dx, dz))) }
}

/** where the head points with `ptz` applied: a WORLD look-at point, the effective FOV, heading and elevation */
export function aimOf(c: CctvCameraEx, ptz: Ptz = PTZ_HOME) {
  const home = homeAngles(c)
  const heading = (((home.heading + ptz.pan) % 360) + 360) % 360
  const elevation = THREE.MathUtils.clamp(home.elevation + ptz.tilt, TILT_MIN, TILT_MAX)
  const h = THREE.MathUtils.degToRad(heading)
  const e = THREE.MathUtils.degToRad(elevation)
  const target: Vec3 = [c.pos[0] + Math.sin(h) * Math.cos(e) * 20, c.pos[1] + Math.sin(e) * 20, c.pos[2] - Math.cos(h) * Math.cos(e) * 20]
  return { target, fov: THREE.MathUtils.clamp(c.fov / ptz.zoom, 3, 80), heading, elevation }
}

/** keep a commanded pose inside the head's limits */
export function clampPtz(c: CctvCameraEx, p: Ptz): Ptz {
  const home = homeAngles(c).elevation
  return { pan: p.pan, tilt: THREE.MathUtils.clamp(p.tilt, TILT_MIN - home, TILT_MAX - home), zoom: THREE.MathUtils.clamp(p.zoom, 1, 12) }
}

/** latest mask image per camera (renderer → page) */
export const segFrames = new Map<string, ImageData>()

// ---------------------------------------------------------------- store

export interface CctvStore {
  /** detections in the latest frame of each camera */
  live: Record<string, Detection[]>
  /** violations / hazards logged (newest first, capped at 300; same worker + kind deduped within 60 s) */
  log: Detection[]
  /** camera called up by an F&G alarm (shown in the big tile with a red border until acknowledged) */
  callUp: string | null
  callUpReason: string | null
  callUpAt: number | null
  /** the operator's camera for the big tile */
  selected: string
  /** the console's camera page is open (the renderer only works while it is) */
  feedsVisible: boolean
  setSelected: (id: string) => void
  ackCallUp: () => void
  setFeedsVisible: (v: boolean) => void
  /** renderer → store: one camera frame's detections */
  pushFrame: (camera: string, dets: Detection[]) => void
  /** simulated SAM 3.1 segmentation on the main monitor */
  seg: boolean
  setSeg: (on: boolean) => void
  /** concept prompts switched on */
  prompts: Record<SegClassId, boolean>
  togglePrompt: (id: SegClassId) => void
  /** operator pan / tilt / zoom per camera (absent = installed aim) */
  ptz: Record<string, Ptz>
  setPtz: (camera: string, p: Partial<Ptz>) => void
  resetPtz: (camera: string) => void
  /** the main monitor is being steered (drag or 360° sweep): render it every frame-slot, not round-robin */
  steering: boolean
  setSteering: (on: boolean) => void
  /** 360° sweep of the main monitor's camera */
  sweep: boolean
  setSweep: (on: boolean) => void
  /** latest instances per camera + inference time of the last pass */
  segLive: Record<string, SegInstance[]>
  segMs: number
  pushSeg: (camera: string, mask: ImageData, instances: SegInstance[], ms: number) => void
}

const LOG_CAP = 300
const DEDUP_S = 60
const lastLogged = new Map<string, number>()
const LOGGED = new Set<DetectionKind>(['noHardHat', 'noVest', 'restrictedZone', 'fire', 'gasCloud', 'zone0Entry', 'zonePpe'])

export const useCctv = create<CctvStore>((set, get) => ({
  live: {},
  log: [],
  callUp: null,
  callUpReason: null,
  callUpAt: null,
  selected: CAMERAS[0]?.id ?? '',
  feedsVisible: false,
  setSelected: (selected) => set({ selected, callUp: null, callUpReason: null, callUpAt: null }),
  ackCallUp: () => {
    const { callUp } = get()
    set({ callUp: null, callUpReason: null, callUpAt: null, ...(callUp ? { selected: callUp } : {}) })
  },
  setFeedsVisible: (feedsVisible) => set({ feedsVisible }),
  seg: true,
  setSeg: (seg) => set({ seg }),
  prompts: Object.fromEntries(SEG_CLASSES.map((c) => [c.id, c.id !== 'module'])) as Record<SegClassId, boolean>,
  togglePrompt: (id) => set((s) => ({ prompts: { ...s.prompts, [id]: !s.prompts[id] } })),
  ptz: {},
  setPtz: (camera, p) => {
    const c = cameraById(camera)
    if (!c) return
    set((s) => ({ ptz: { ...s.ptz, [camera]: clampPtz(c, { ...(s.ptz[camera] ?? PTZ_HOME), ...p }) } }))
  },
  resetPtz: (camera) =>
    set((s) => {
      const next = { ...s.ptz }
      delete next[camera]
      return { ptz: next }
    }),
  steering: false,
  setSteering: (steering) => set({ steering }),
  sweep: false,
  setSweep: (sweep) => set({ sweep }),
  segLive: {},
  segMs: 0,
  pushSeg: (camera, mask, instances, ms) => {
    segFrames.set(camera, mask)
    set((s) => ({ segLive: { ...s.segLive, [camera]: instances }, segMs: s.segMs ? s.segMs * 0.7 + ms * 0.3 : ms }))
  },
  pushFrame: (camera, dets) => {
    const s = get()
    const fresh: Detection[] = []
    for (const d of dets) {
      if (!LOGGED.has(d.kind)) continue
      // hazardous areas: the first sighting confirms the tracked violation (one store write per violation)
      if ((d.kind === 'zone0Entry' || d.kind === 'zonePpe') && d.workerId && d.zone !== undefined) confirmByCamera(d.workerId, d.kind, d.zone, camera, d.t)
      const key = `${d.kind}:${d.workerId ?? d.id.split('|')[1] ?? camera}${d.zone !== undefined ? `:${d.zone}` : ''}`
      const last = lastLogged.get(key)
      if (last !== undefined && d.t - last < DEDUP_S && d.t >= last) continue
      lastLogged.set(key, d.t)
      fresh.push(d)
    }
    set({
      live: { ...s.live, [camera]: dets },
      ...(fresh.length ? { log: [...fresh, ...s.log].slice(0, LOG_CAP) } : {}),
    })
  },
}))
if (import.meta.env.DEV) Object.assign(window, { __cctv: useCctv, __cameras: CAMERAS, __feedStats: feedStats })

// ---------------------------------------------------------------- the simulated detector

const _v = new THREE.Vector3()
const _cs = new THREE.Vector3()

/** world point → normalised image coords (origin top-left); null when behind the camera */
function toImage(cam3: THREE.PerspectiveCamera, x: number, y: number, z: number): [number, number] | null {
  _cs.set(x, y, z).applyMatrix4(cam3.matrixWorldInverse)
  if (_cs.z > -cam3.near) return null
  _v.set(x, y, z).project(cam3)
  return [(_v.x + 1) / 2, (1 - _v.y) / 2]
}
/** bounding box in the image of a set of world points (null when all are behind the camera or off-frame) */
function imageBox(cam3: THREE.PerspectiveCamera, pts: Vec3[]): [number, number, number, number] | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let n = 0
  for (const p of pts) {
    const q = toImage(cam3, p[0], p[1], p[2])
    if (!q) continue // behind the camera (a cloud around the camera): the points in front still bound it
    n++
    x0 = Math.min(x0, q[0])
    x1 = Math.max(x1, q[0])
    y0 = Math.min(y0, q[1])
    y1 = Math.max(y1, q[1])
  }
  if (!n || x1 < 0 || x0 > 1 || y1 < 0 || y0 > 1) return null
  // part of it behind the camera: it reaches the bottom of the frame
  if (n < pts.length) y1 = 1
  return clip([x0, y0, x1, y1])
}
const clip = (b: [number, number, number, number]): [number, number, number, number] => [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(1, b[2]), Math.min(1, b[3])]

/** deterministic jitter 0..1 from a string + time bucket */
function jitter(s: string, n: number) {
  let h = 2166136261 ^ n
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

export const WORKER_RANGE = 35
const HAZARD_RANGE = 90

/**
 * Simulated detector for one camera frame. `cam3` must be positioned / aimed with up-to-date matrices.
 * `visible(id, chest)` is the occlusion test for people (the renderer owns the scene) and `hazardVisible(p)` the
 * one for flames / clouds (deck plates only: they are big); default: everything visible.
 */
export function detect(
  cam: CctvCameraEx,
  cam3: THREE.PerspectiveCamera,
  t: number,
  visible: (workerId: string, chest: THREE.Vector3) => boolean = () => true,
  hazardVisible: (p: THREE.Vector3) => boolean = () => true,
): Detection[] {
  const out: Detection[] = []
  const bucket = Math.floor(t / 2)
  const aspect = cam3.aspect || FEED_W / FEED_H
  const roster = useWorkers.getState().roster
  const chest = new THREE.Vector3()
  const conf = (key: string, lo = 0.8, hi = 0.97) => +(lo + (hi - lo) * jitter(key, bucket)).toFixed(2)
  const mk = (kind: DetectionKind, box: [number, number, number, number], confidence: number, extra: Partial<Detection> & { ref?: string } = {}): Detection => {
    const { ref, ...rest } = extra
    return { id: `${cam.id}|${ref ?? rest.workerId ?? kind}|${kind}|${t.toFixed(1)}`, t, camera: cam.id, kind, box, confidence, model: 'sim', ...rest }
  }

  // ---- people + PPE
  for (const w of roster) {
    const p = workerPose[w.id]
    if (!p) continue
    const dx = p.x - cam.pos[0]
    const dy = p.footY + 1 - cam.pos[1]
    const dz = p.z - cam.pos[2]
    if (dx * dx + dy * dy + dz * dz > WORKER_RANGE * WORKER_RANGE) continue
    const head = toImage(cam3, p.x, p.footY + 1.8, p.z)
    const feet = toImage(cam3, p.x, p.footY, p.z)
    if (!head || !feet) continue
    const h = feet[1] - head[1]
    if (h < 0.025) continue
    const cx = (head[0] + feet[0]) / 2
    const halfW = (h * 0.4) / aspect / 2
    const box: [number, number, number, number] = [cx - halfW, head[1], cx + halfW, feet[1]]
    if (box[2] < 0 || box[0] > 1 || box[3] < 0 || box[1] > 1) continue
    chest.set(p.x, p.footY + 1.3, p.z)
    if (!visible(w.id, chest)) continue
    out.push(mk('person', clip(box), conf(`${cam.id}${w.id}p`), { workerId: w.id }))
    const top = box[1]
    if (!w.hardHat) {
      const hw = halfW * 0.7
      out.push(mk('noHardHat', clip([cx - hw, top - h * 0.02, cx + hw, top + h * 0.17]), conf(`${cam.id}${w.id}h`, 0.72, 0.94), { workerId: w.id }))
    }
    if (!w.vest) out.push(mk('noVest', clip([cx - halfW * 1.05, top + h * 0.2, cx + halfW * 1.05, top + h * 0.55]), conf(`${cam.id}${w.id}v`, 0.7, 0.92), { workerId: w.id }))
    const zone = p.speed < 0.2 ? machineZoneAt(p.x, p.z, p.footY) : null
    if (zone) out.push(mk('restrictedZone', clip(box), conf(`${cam.id}${w.id}z`, 0.78, 0.95), { workerId: w.id, ref: `${w.id}:${zone.tag}`, tag: zone.tag, dist: +zone.dist.toFixed(1) }))
    // hazardous area: the tracked violation, while the person still stands in that zone
    const hv = openViolationOf(w.id)
    const here = hv ? personZone(p.x, p.footY - DECK_WORLD_Y, p.z) : null
    if (hv && here && here.zone <= hv.zone) {
      const pad = halfW * 0.35
      out.push(
        mk(hv.kind, clip([box[0] - pad, box[1] - h * 0.05, box[2] + pad, box[3] + h * 0.03]), conf(`${cam.id}${w.id}${hv.kind}`, hv.kind === 'zone0Entry' ? 0.84 : 0.74, 0.96), {
          workerId: w.id,
          ref: `${w.id}:${hv.kind}:${hv.zone}`,
          tag: hv.tag,
          zone: hv.zone,
          missing: hv.missing,
        }),
      )
    }
  }

  // ---- hazards from the live incidents (deck-local pos → world)
  const incidents = (useSim.getState() as { incidents?: Incident[] }).incidents ?? []
  for (const inc of incidents) {
    if (inc.cleared !== undefined || !inc.pos) continue
    const [ix, iy, iz] = inc.pos
    const wx = ix
    const wz = iz
    if (Math.hypot(wx - cam.pos[0], wz - cam.pos[2]) > HAZARD_RANGE) continue
    if (inc.fault.kind === 'fire' && inc.burning) {
      const mw = inc.fault.sizeMW
      const H = flameHeight(mw)
      const r = Math.max(0.5, Math.sqrt((4 * (mw / 1.5)) / Math.PI) / 2 + 0.3)
      const y0 = iy + DECK_WORLD_Y
      if (!hazardVisible(chest.set(wx, y0 + H / 2, wz))) continue
      const box = imageBox(cam3, corners(wx - r, y0, wz - r, wx + r, y0 + H, wz + r))
      if (box) out.push(mk('fire', box, conf(`${cam.id}${inc.id}f`, 0.86, 0.99), { ref: inc.id }))
    } else if (inc.fault.kind === 'gasRelease' && (inc.rate ?? inc.fault.rateKgS) > 0.01) {
      const s = cloudShape({ pos: inc.pos, rateKgS: inc.rate ?? inc.fault.rateKgS, age: Math.max(0, t - inc.at) }, getWind())
      if (s.R < 0.3 || !hazardVisible(chest.set(s.centre[0], s.centre[1] + DECK_WORLD_Y, s.centre[2]))) continue
      // the 20 % LEL fringe reaches ~1.4× the LFL envelope
      const k = 1.4
      const [ux, uz] = s.dir
      const pts: Vec3[] = []
      for (const sa of [-1, 1])
        for (const sb of [-1, 1])
          for (const yy of [s.floor, s.centre[1] + s.c * k]) pts.push([s.centre[0] + ux * s.a * k * sa - uz * s.b * k * sb, yy + DECK_WORLD_Y, s.centre[2] + uz * s.a * k * sa + ux * s.b * k * sb])
      const box = imageBox(cam3, pts)
      if (box) out.push(mk('gasCloud', box, conf(`${cam.id}${inc.id}g`, 0.62, 0.9), { ref: inc.id }))
    }
  }
  return out
}

// ---------------------------------------------------------------- machinery exclusion zones

/**
 * Exclusion zone around running rotating machinery, metres from the skid edge. A person standing inside it
 * on CCTV is a `restrictedZone` detection: the area authority confirms they hold an authorisation, or clears
 * them out. Walking past on the walkway doesn't count (only someone who stops there), and normal gauge
 * rounds stand ~1.9 m off a skid (safety/workers.ts), outside every zone.
 */
export const MACHINE_ZONE_M: Partial<Record<string, number>> = { compressorPackage: 1.5, pumpPackage: 1.2, gasTurbineGenerator: 1.0 }

const zoneCache = new WeakMap<Plant, { tag: string; kind: string; y: number; f: Footprint }[]>()
function rotatingMachines(plant: Plant) {
  let z = zoneCache.get(plant)
  if (!z) {
    const fps = footprints(plant.equipment, 0)
    z = plant.equipment.flatMap((e, i) => (MACHINE_ZONE_M[e.kind] ? [{ tag: e.tag, kind: e.kind, y: e.position[1], f: fps[i] }] : []))
    zoneCache.set(plant, z)
  }
  return z
}

/** the running machine whose exclusion zone (same deck, plan distance to the skid) holds this point, if any */
export function machineZoneAt(x: number, z: number, footY: number): { tag: string; dist: number } | null {
  let best: { tag: string; dist: number } | null = null
  for (const m of rotatingMachines(usePlantStore.getState().plant)) {
    if (Math.abs(footY - DECK_WORLD_Y - m.y) > 2.5 || !isRunning(m.tag)) continue
    const d = Math.hypot(Math.max(m.f.x0 - x, 0, x - m.f.x1), Math.max(m.f.z0 - z, 0, z - m.f.z1))
    if (d < MACHINE_ZONE_M[m.kind]! && (!best || d < best.dist)) best = { tag: m.tag, dist: d }
  }
  return best
}

function corners(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Vec3[] {
  return [
    [x0, y0, z0],
    [x1, y0, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x0, y1, z0],
    [x1, y1, z0],
    [x0, y1, z1],
    [x1, y1, z1],
  ]
}

/** the label on a camera box / in the detection log (zone boxes say what is missing; the gas monitor comes from the tag) */
export function detLabel(d: Detection): string {
  const short = { hardHat: 'hard hat', vest: 'hi-vis', gasMonitor: 'gas monitor (tag)' } as const
  if (d.kind === 'zone0Entry') return `ZONE 0 ENTRY · ${d.tag ?? ''}`.trim()
  if (d.kind === 'zonePpe') return `ZONE ${d.zone ?? '?'} · no ${(d.missing ?? []).map((k) => short[k]).join(' + ')}`
  return DETECTION_LABEL[d.kind]
}

// ---------------------------------------------------------------- which cameras see a point (hazardous-area drills, call-up)

/** the renderer's occluders (scene/CctvRenderer.tsx): equipment boxes, shrunk a little, and the deck plates */
const occCache = new WeakMap<Plant, THREE.Box3[]>()
function occluderBoxes(plant: Plant): THREE.Box3[] {
  let boxes = occCache.get(plant)
  if (boxes) return boxes
  const levels = walkLevels(plant)
  const fps = footprints(plant.equipment, 0)
  boxes = []
  plant.equipment.forEach((e, i) => {
    if (e.kind === 'proxy') return
    const f = fps[i]
    const floor = levels[levelAt(levels, e.position[1])]?.y ?? 0
    const top = Math.max(floor + 1, labelHeight(e) - 1.1)
    boxes!.push(new THREE.Box3(new THREE.Vector3(f.x0 + 0.15, floor + DECK_WORLD_Y, f.z0 + 0.15), new THREE.Vector3(f.x1 - 0.15, top + DECK_WORLD_Y, f.z1 - 0.15)))
  })
  const slab = (r: { x0: number; x1: number; z0: number; z1: number }, y0: number, y1: number) => boxes!.push(new THREE.Box3(new THREE.Vector3(r.x0, y0 + DECK_WORLD_Y, r.z0), new THREE.Vector3(r.x1, y1 + DECK_WORLD_Y, r.z1)))
  slab(ALPHA_DECK, 9.4, 10)
  for (const r of [ALPHA_DECK, WHP.deck, RP.deck, WI.deck, LQ.deck]) slab(r, -0.9, -0.05)
  occCache.set(plant, boxes)
  return boxes
}
const _pc = new THREE.PerspectiveCamera(46, FEED_W / FEED_H, 0.3, 900)
const _ray = new THREE.Ray()
const _o = new THREE.Vector3()
const _p = new THREE.Vector3()
const _hit = new THREE.Vector3()

/**
 * Cameras that see a person standing at WORLD point `feet` (chest in frame, within detection range, not
 * behind an equipment box), best first: cameras aimed at `tag` first, then the nearest / most central.
 */
export function camerasSeeing(feet: Vec3, tag?: string): CctvCameraEx[] {
  const boxes = occluderBoxes(usePlantStore.getState().plant)
  _p.set(feet[0], feet[1] + 1.3, feet[2])
  const ranked: { c: CctvCameraEx; score: number }[] = []
  for (const c of CAMERAS) {
    _o.set(c.pos[0], c.pos[1], c.pos[2])
    const d = _o.distanceTo(_p)
    if (d > WORKER_RANGE) continue
    _pc.fov = c.fov
    _pc.aspect = FEED_W / FEED_H
    _pc.position.copy(_o)
    _pc.lookAt(c.target[0], c.target[1], c.target[2])
    _pc.updateProjectionMatrix()
    _pc.updateMatrixWorld()
    const q = toImage(_pc, _p.x, _p.y, _p.z)
    if (!q || q[0] < 0.05 || q[0] > 0.95 || q[1] < 0.08 || q[1] > 0.95) continue
    _ray.set(_o, _hit.copy(_p).sub(_o).normalize())
    if (boxes.some((b) => !b.containsPoint(_p) && _ray.intersectBox(b, _hit) && _o.distanceTo(_hit) < d - 0.4)) continue
    ranked.push({ c, score: d / 10 + (tag && c.watches.includes(tag) ? 0 : 1.5) + Math.hypot(q[0] - 0.5, q[1] - 0.5) * 2 })
  }
  return ranked.sort((a, b) => a.score - b.score).map((r) => r.c)
}

// ---------------------------------------------------------------- automatic call-up on F&G alarms

/** no camera covers the zone: the nearest one on the zone's platform (else the nearest overall) */
function nearestCamera(zoneId: string): CctvCameraEx | undefined {
  const z = zoneById(usePlantStore.getState().plant, zoneId)
  if (!z) return undefined
  const { centre } = zoneCentre(z)
  const d = (c: CctvCameraEx) => Math.hypot(c.target[0] - centre[0], c.target[2] - centre[2])
  const pool = CAMERAS.filter((c) => c.platform === z.platform)
  return [...(pool.length ? pool : CAMERAS)].sort((a, b) => d(a) - d(b))[0]
}

let prevFg: Record<string, { gas: boolean; fire: boolean }> = {}

registerSimPlugin({
  id: 'cctv',
  step() {
    const fg = (useSim.getState() as { fg?: Record<string, ZoneStatus> }).fg
    if (!fg) return
    let best: { zone: string; fire: boolean; reason: string } | null = null
    const next: typeof prevFg = {}
    for (const [zone, z] of Object.entries(fg)) {
      const gas = z.gas === 'high' || z.gas === 'confirmed'
      const fire = z.fire === 'single' || z.fire === 'confirmed'
      next[zone] = { gas, fire }
      const was = prevFg[zone]
      const rising = (fire && !was?.fire) || (gas && !was?.gas)
      if (!rising) continue
      const reason = fire && !was?.fire ? `F&G flame ${z.fire === 'confirmed' ? 'confirmed' : 'detected'}, ${zone}` : `F&G gas ${z.gas}, ${zone}`
      const isFire = fire && !was?.fire
      if (!best || (isFire && !best.fire)) best = { zone, fire: isFire, reason }
    }
    prevFg = next
    if (!best) return
    const zone = best.zone
    const cam = CAMERAS.find((c) => c.zones[0] === zone) ?? CAMERAS.find((c) => c.zones.includes(zone)) ?? nearestCamera(zone)
    if (!cam) return
    useCctv.setState({ callUp: cam.id, callUpReason: best.reason, callUpAt: useSim.getState().t })
  },
  reset() {
    prevFg = {}
    lastLogged.clear()
    useCctv.setState({ live: {}, log: [], callUp: null, callUpReason: null, callUpAt: null })
  },
})

// a tracked Zone 0 entry calls up the best camera on the person (unless an F&G call-up is showing)
const calledFor = new Set<string>()
registerSimPlugin({
  id: 'cctv-hazard',
  step(_dt, t) {
    for (const v of useHazardTrack.getState().active) {
      if (v.kind !== 'zone0Entry' || calledFor.has(v.id)) continue
      calledFor.add(v.id)
      if (useCctv.getState().callUp) continue
      const cam = camerasSeeing(v.pos, v.tag)[0]
      if (!cam) continue
      const who = useWorkers.getState().roster.find((w) => w.id === v.workerId)?.name ?? v.workerId
      useCctv.setState({ callUp: cam.id, callUpReason: `Zone 0 entry: ${who} at ${v.tag} (no confined-space permit)`, callUpAt: t })
    }
  },
  reset() {
    calledFor.clear()
  },
})
