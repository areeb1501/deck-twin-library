/**
 * CCTV: hazardous-area cameras and simulated PPE / hazard detections (plan 07).
 *
 *  - CAMERAS: eight cameras aimed at the high-risk equipment. Ex d explosion-proof PTZ colour cameras
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
 */
import * as THREE from 'three'
import { create } from 'zustand'
import type { Vec3 } from '../model/types'
import type { Plant } from '../model/types'
import type { Incident, PlatformId, ZoneStatus } from '../sim/types'
import type { CctvCamera, Detection, DetectionKind } from './types'
import { DECK_WORLD_Y } from '../state/store'
import { usePlantStore } from '../state/plantStore'
import { registerSimPlugin, useSim } from '../state/sim'
import { cloudShape, flameHeight, zoneAt, zoneById, zoneCentre, zoneOfTag } from '../sim/fg'
import { getWind } from '../sim/fg/live'
import { useWorkers, workerPose } from './workers'

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
  { id: 'CCTV-A02', name: 'Export pumps & pig launcher', platform: 'Alpha', type: 'ptz', watches: ['P-1500A', 'P-1500B', 'L-1600'], mount: [11.6, 7.6, -2.6], floor: 0, zones: ['A-P-EXP'] },
  { id: 'CCTV-A03', name: 'Gas compressor K-2200', platform: 'Alpha', type: 'thermal', watches: ['K-2200', 'E-2300'], mount: [11.6, 7.6, 2.6], floor: 0, zones: ['A-P-COMP'], fov: 40 },
  { id: 'CCTV-A04', name: 'Cellar deck well bay', platform: 'Alpha', type: 'thermal', watches: ['XT-110', 'XT-120', 'XT-130', 'XT-140', 'XT-150'], mount: [8, -2.6, -3.4], floor: -8, zones: ['A-C-WELL'], fov: 44 },
  { id: 'CCTV-A05', name: 'Turbine generators GT-8100A/B', platform: 'Alpha', type: 'ptz', watches: ['GT-8100A', 'GT-8100B'], mount: [-2.4, 16.8, 0.8], floor: 10, zones: ['A-W-PWR'] },
  { id: 'CCTV-N01', name: 'WHP-N well bay', platform: 'WHP-N', type: 'ptz', watches: ['XT-N101', 'XT-N102', 'XT-N103', 'XT-N104', 'XT-N105', 'XT-N106'], mount: [12.5, 7, -66.5], floor: 0, zones: ['N-WELL'] },
  { id: 'CCTV-R01', name: 'RP pig launchers & metering', platform: 'RP', type: 'ptz', watches: ['L-R110', 'L-R210', 'X-R150'], mount: [-73.5, 7, -3.2], floor: 0, zones: ['R-PROC'] },
  { id: 'CCTV-L01', name: 'South bridge / LQ entrance', platform: 'LQ', type: 'ptz', watches: ['B-9300'], mount: [9.6, 6, 62], floor: 0, aim: [6, 0.9, 42], zones: ['B-S', 'LQ-MAIN'], fov: 34 },
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
}

const LOG_CAP = 300
const DEDUP_S = 60
const lastLogged = new Map<string, number>()
const LOGGED = new Set<DetectionKind>(['noHardHat', 'noVest', 'restrictedZone', 'fire', 'gasCloud'])

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
  pushFrame: (camera, dets) => {
    const s = get()
    const fresh: Detection[] = []
    for (const d of dets) {
      if (!LOGGED.has(d.kind)) continue
      const key = `${d.kind}:${d.workerId ?? d.id.split('|')[1] ?? camera}`
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
