/**
 * Real SAM 3.1 on the CCTV cameras (modal/PLAN.md). Raw frames go to the server route (`alpha/sam-route.js`, which
 * holds the key), and each answer replaces the simulated detector for that camera. The main monitor takes every
 * other frame and the other colour cameras on screen share the rest, so a tile updates every 10 to 20 s. Thermal
 * cameras stay simulated: a heat image shows no hard hat or vest.
 *
 *  - The twin knows where every worker stands, however far away, so that goes along as a hint. It names a person SAM saw and gives their
 *    zone. It never adds a person, and SAM alone decides what they wear.
 *  - An answer is about a second old by the time it arrives, so a camera shows the frame SAM analysed, not the
 *    newest one. Otherwise masks would trail anyone walking.
 *  - `withSam` is the one place a camera's detections are chosen. Every Detection says which model made it, so the UI
 *    can't call a simulated box real. A silent model falls back to the simulated detector after STALE_MS.
 *  - Runs only while the camera page is open in a visible tab, so the GPU scales to zero otherwise.
 */
import { create } from 'zustand'
import { useSim } from '../state/sim'
import { CAMERAS, feedCanvases, useCctv } from './cctv'
import type { Detection, DetectionKind } from './types'
import { useHazardTrack } from './workers'

const ROUTE = `${import.meta.env.BASE_URL}api/sam`
/** each of the two senders waits this long between frames, ms (a frame is about 5 prompts, ~0.4 s on the GPU) */
const FRAME_MS = 1000
const SENDERS = 2
/** an answer older than this is dropped: longer than a full turn round the tiles, ms */
export const STALE_MS = 25_000
/** a cold GPU takes a while to load the model, ms */
const TIMEOUT_MS = 120_000
const RETRY_MS = 5000
const JPEG_QUALITY = 0.85
/** what SAM doesn't judge: these keep coming from the twin, marked `sim` */
const TWIN_ONLY = new Set<DetectionKind>(['restrictedZone', 'gasCloud'])

export type SamState = 'off' | 'waking' | 'live' | 'error'

export interface SamMask {
  label: string
  score: number
  box: [number, number, number, number]
  polygons: [number, number][][]
  workerId?: string
}
export interface SamFrame {
  dets: Detection[]
  masks: SamMask[]
  /** the picture SAM saw (a JPEG data URL), so the masks line up with it */
  image: string
  /** wall clock of the answer, ms */
  at: number
}

interface SamStore {
  /** the server says the model is connected (null until asked) */
  connected: boolean | null
  /** the operator's switch */
  on: boolean
  setOn: (on: boolean) => void
  state: SamState
  /** last round trip / last GPU time, ms */
  rtt: number
  gpu: number
  frames: Record<string, SamFrame>
}

export const useSam = create<SamStore>((set) => ({
  connected: null,
  on: localStorage.getItem('deck-twin.sam') !== 'off',
  setOn: (on) => {
    localStorage.setItem('deck-twin.sam', on ? 'on' : 'off')
    set({ on, ...(on ? {} : { state: 'off' as const, frames: {} }) })
  },
  state: 'off',
  rtt: 0,
  gpu: 0,
  frames: {},
}))
if (import.meta.env.DEV) Object.assign(window, { __sam: useSam })

// ---------------------------------------------------------------- pure mapping (tests/sam-client.test.ts)

interface AnswerDetection {
  label: string
  box: [number, number, number, number]
  score: number
  polygons?: [number, number][][]
  workerId?: string
}
interface AnswerAlert {
  kind: DetectionKind
  label: string
  box: [number, number, number, number]
  confidence: number
  workerId?: string
  zone?: 0 | 1 | 2
  missing?: ('hardHat' | 'vest' | 'gasMonitor')[]
}
export interface SamAnswer {
  detections: AnswerDetection[]
  alerts: AnswerAlert[]
  ms: number
}
export interface WorkerBox {
  workerId: string
  box: [number, number, number, number]
}
export interface PersonHint {
  workerId: string
  box: [number, number, number, number]
  zone: 0 | 1 | 2 | null
  permit: boolean
}

const PERSON = 'person'
const PERSON_FLOOR = 0.65
/** weaker masks are mostly valve handles called hard hats: the PPE check on the server still uses them */
export const MASK_FLOOR = 0.45

/** the detector's answer as the twin's detections, and the masks for the monitor */
export function toFrame(answer: SamAnswer, camera: string, t: number, at: number, image: string): SamFrame {
  const base = (kind: DetectionKind, ref: string, box: Detection['box'], confidence: number): Detection => ({ id: `${camera}|${ref}|${kind}|${t.toFixed(1)}`, t, camera, kind, box, confidence, model: 'sam-3.1' })
  const people = answer.detections.filter((d) => d.label === PERSON && d.score >= PERSON_FLOOR)
  const dets = people.map((d, i) => ({ ...base('person', d.workerId ?? `sam${i}`, d.box, d.score), ...(d.workerId ? { workerId: d.workerId } : {}) }))
  answer.alerts.forEach((a, i) => {
    dets.push({
      ...base(a.kind, a.workerId ?? `sam${i}`, a.box, a.confidence),
      ...(a.workerId ? { workerId: a.workerId } : {}),
      ...(a.zone !== undefined ? { zone: a.zone } : {}),
      ...(a.missing ? { missing: a.missing } : {}),
    })
  })
  const masks = answer.detections.filter((d) => d.score >= MASK_FLOOR).map((d) => ({ label: d.label, score: d.score, box: d.box, polygons: d.polygons ?? [], workerId: d.workerId }))
  return { dets, masks, image, at }
}

/** a camera's detections for this frame: SAM's if it has answered lately, else the twin's own */
export function pickDetections(sim: Detection[], frame: SamFrame | undefined, now: number): Detection[] {
  if (!frame || now - frame.at > STALE_MS) return sim
  return [...frame.dets, ...sim.filter((d) => TWIN_ONLY.has(d.kind))]
}

/** where the twin says each visible worker is in this frame, with the zone their tag reports */
export function personHints(tags: WorkerBox[], present: Record<string, { zone: 0 | 1 | 2 | 'safe'; permit?: string | null } | undefined>): PersonHint[] {
  return tags.map(({ workerId, box }) => {
    const p = present[workerId]
    return { workerId, box, zone: p && p.zone !== 'safe' ? p.zone : null, permit: !!p?.permit }
  })
}

export const samCamera = (id: string) => CAMERAS.find((c) => c.id === id)?.type !== 'thermal'

/** whose turn it is: the main monitor every other frame, the other colour cameras in order between them */
export function nextCamera(main: string, feeds: string[], turn: number): string | null {
  const tiles = feeds.filter((id) => id !== main && samCamera(id))
  const mainOk = feeds.includes(main) && samCamera(main)
  if (mainOk && (turn % 2 === 0 || !tiles.length)) return main
  if (!tiles.length) return null
  return tiles[(mainOk ? (turn - 1) / 2 : turn) % tiles.length]
}

// ---------------------------------------------------------------- the renderer's side

const lastSim = new Map<string, Detection[]>()
const lastTags = new Map<string, WorkerBox[]>()

/** scene/CctvRenderer.tsx calls this with the simulated detections and worn tags of each painted frame */
export function withSam(camera: string, sim: Detection[], tags?: WorkerBox[]): Detection[] {
  lastSim.set(camera, sim)
  if (tags) lastTags.set(camera, tags)
  return pickDetections(sim, useSam.getState().frames[camera], performance.now())
}

/** SAM has answered for this camera lately */
export const samLive = (camera: string, frames: Record<string, SamFrame> = useSam.getState().frames, now = performance.now()) => {
  const f = frames[camera]
  return !!f && now - f.at <= STALE_MS
}

// ---------------------------------------------------------------- the loop (runs while the camera page is open)

async function ask(camera: string, canvas: HTMLCanvasElement) {
  const t = useSim.getState().t
  const image = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const body = JSON.stringify({
    image_base64: image,
    camera,
    people: personHints(lastTags.get(camera) ?? [], useHazardTrack.getState().present),
    return_masks: true,
  })
  const t0 = performance.now()
  const r = await fetch(ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!r.ok) throw new Error(`SAM route answered ${r.status}`)
  const answer = (await r.json()) as SamAnswer
  // switched off while this frame was on its way: it must not turn the camera back on
  if (!useSam.getState().on) return
  const now = performance.now()
  useSam.setState((s) => ({ state: 'live', rtt: now - t0, gpu: answer.ms, frames: { ...s.frames, [camera]: toFrame(answer, camera, t, now, image) } }))
  // tiles repaint every few seconds: put the boxes up with their picture now, not at the next repaint
  useCctv.getState().pushFrame(camera, withSam(camera, lastSim.get(camera) ?? []))
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
let run = 0

/** the camera page calls this on mount; the function it returns stops the loop */
export function startSam(): () => void {
  const mine = ++run
  void (async () => {
    if (useSam.getState().connected === null) {
      const status = await fetch(ROUTE).then((r) => (r.ok ? r.json() : null), () => null) as { ready?: boolean } | null
      useSam.setState({ connected: !!status?.ready })
    }
    if (!useSam.getState().connected) return
    let turn = 0
    const sender = async () => {
      while (mine === run) {
        const cctv = useCctv.getState()
        const camera = nextCamera(cctv.callUp ?? cctv.selected, [...feedCanvases.keys()], turn++)
        const canvas = camera && feedCanvases.get(camera)
        if (!useSam.getState().on || !cctv.feedsVisible || document.hidden || !camera || !canvas) {
          await wait(FRAME_MS)
          continue
        }
        const t0 = performance.now()
        if (useSam.getState().state !== 'live') useSam.setState({ state: 'waking' })
        try {
          await ask(camera, canvas)
          await wait(Math.max(0, FRAME_MS - (performance.now() - t0)))
        } catch {
          // every camera goes back to simulated at once, rather than holding an old picture
          if (mine === run) useSam.setState({ state: 'error', frames: {} })
          await wait(RETRY_MS)
        }
      }
    }
    await Promise.all(Array.from({ length: SENDERS }, sender))
  })()
  return () => {
    run++
    useSam.setState({ state: 'off' })
  }
}
