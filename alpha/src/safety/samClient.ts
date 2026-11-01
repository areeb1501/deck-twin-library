/**
 * Real SAM 3.1 on the CCTV cameras (modal/PLAN.md). Raw frames go to the server route (`alpha/sam-route.js`, which
 * holds the key), and each answer replaces the simulated detector for that camera. The main monitor takes every
 * other frame and the other colour cameras on screen share the rest, so a tile updates every 10 to 20 s. Thermal
 * cameras stay simulated: a heat image shows no hard hat or vest.
 *
 *  - The twin knows where every worker stands, however far away, so that goes along as a hint. It names a person SAM saw and gives their
 *    zone. It never adds a person, and SAM alone decides what they wear.
 *  - The live video always stays on top. An answer is seconds old by the time it arrives, so its masks fade on the monitor
 *    rather than freeze the picture. Moving a camera clears them at once: they describe a view that has gone, and a frame
 *    already on its way is thrown away for the same reason. Nothing is sent until the head has rested for REST_MS. The camera
 *    stays in live mode throughout (`holdFrame`): it shows nothing until SAM has looked again, not the simulator's guesses.
 *  - `withSam` is the one place a camera's detections are chosen. Every Detection says which model made it, so the UI
 *    can't call a simulated box real. A silent model falls back to the simulated detector after STALE_MS.
 *  - Runs only while the camera page is open in a visible tab, so the GPU scales to zero otherwise.
 *  - The switch is never remembered. Every load starts simulated, and leaving the camera page turns it off.
 *  - safety/metaSam.ts is the second way to the same model, on the operator's own Meta key. It shares `applyAnswer`.
 *  - The operator can type noun phrases for the real model to mask as well (`typed`). Those are masks only: they raise no alert and
 *    go in no log. They stay until a reload, and the simulated detector never pretends to find them.
 */
import { create } from 'zustand'
import { useSim } from '../state/sim'
import { CAMERAS, feedCanvases, useCctv } from './cctv'
import { BUILT_IN, cleanPhrase, MAX_TYPED, PERSON } from './samPrompts'
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
/** a camera must hold still this long before a frame is worth sending, ms */
export const REST_MS = 1000
/** what SAM doesn't judge: these keep coming from the twin, marked `sim` */
const TWIN_ONLY = new Set<DetectionKind>(['restrictedZone', 'gasCloud'])

export type SamState = 'off' | 'waking' | 'live' | 'error'
export type SamSource = 'modal' | 'meta'

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
  /** wall clock of the answer, ms */
  at: number
  /** the noun phrases this frame really ran, if known. A prompt not listed reads as not looked for yet, never as none found */
  asked?: string[]
  /** what SAM wasn't asked about on this frame. Those stay with the twin, marked `sim` */
  unjudged?: DetectionKind[]
  /** the camera has moved since this answer, so it holds nothing yet */
  held?: boolean
}

interface SamStore {
  /** the server says the model is connected (null until asked) */
  connected: boolean | null
  /** the operator's switch */
  on: boolean
  setOn: (on: boolean) => void
  state: SamState
  /** which route gave the last answer */
  source: SamSource
  /** last round trip / last GPU time, ms */
  rtt: number
  gpu: number
  frames: Record<string, SamFrame>
  /** noun phrases the operator has added, on both routes */
  typed: string[]
  /** adds one, or says why it can't */
  addTyped: (text: string) => string | null
  removeTyped: (prompt: string) => void
}

export const useSam = create<SamStore>((set, get) => ({
  connected: null,
  on: false,
  setOn: (on) => set({ on, ...(on ? {} : { state: 'off' as const, frames: {} }) }),
  state: 'off',
  source: 'modal',
  rtt: 0,
  gpu: 0,
  frames: {},
  typed: [],
  addTyped: (text) => {
    const prompt = cleanPhrase(text)
    const { typed } = get()
    if (!prompt) return 'Use a short noun phrase: letters, numbers, spaces and hyphens, up to 40 characters.'
    if (BUILT_IN.includes(prompt) || typed.includes(prompt)) return `"${prompt}" is already on the list.`
    if (typed.length >= MAX_TYPED) return `${MAX_TYPED} at a time. Remove one first.`
    set({ typed: [...typed, prompt] })
    return null
  },
  removeTyped: (prompt) =>
    set((s) => ({
      typed: s.typed.filter((p) => p !== prompt),
      // its masks go now, rather than at the next answer
      frames: Object.fromEntries(Object.entries(s.frames).map(([id, f]) => [id, { ...f, masks: f.masks.filter((m) => m.label !== prompt) }])),
    })),
}))
if (import.meta.env.DEV) Object.assign(window, { __sam: useSam })

// ---------------------------------------------------------------- pure mapping (tests/sam-client.test.ts)

export interface AnswerDetection {
  label: string
  box: [number, number, number, number]
  score: number
  polygons?: [number, number][][]
  workerId?: string
}
export interface AnswerAlert {
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
  /** what the Modal service really ran. An older one leaves this out, and ignores typed prompts */
  prompts?: string[]
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

export { PERSON }
export const PERSON_FLOOR = 0.65
/** weaker masks are mostly valve handles called hard hats: the PPE check on the server still uses them */
export const MASK_FLOOR = 0.45

/** the detector's answer as the twin's detections, and the masks for the monitor */
export function toFrame(answer: SamAnswer, camera: string, t: number, at: number, scope: Pick<SamFrame, 'asked' | 'unjudged'> = {}): SamFrame {
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
  return { dets, masks, at, ...scope }
}

/** a camera's detections for this frame: SAM's if it has answered lately, else the twin's own */
export function pickDetections(sim: Detection[], frame: SamFrame | undefined, now: number): Detection[] {
  if (!frame || now - frame.at > STALE_MS) return sim
  return [...frame.dets, ...sim.filter((d) => TWIN_ONLY.has(d.kind) || frame.unjudged?.includes(d.kind))]
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

const moved = new Map<string, number>()

/** when this camera's head last moved, ms (0 if it hasn't) */
export const lastMoved = (camera: string) => moved.get(camera) ?? 0

/**
 * this camera stays in live mode, with nothing found yet: it has moved, or has just come up on the main monitor. A real fire keeps
 * the twin's box, marked `sim`, so moving a camera can't hide a call-up.
 */
export function holdFrame(camera: string, now = performance.now()) {
  useSam.setState((s) => {
    const was = s.frames[camera]
    return { frames: { ...s.frames, [camera]: { dets: [], masks: [], at: now, asked: was?.asked, unjudged: [...new Set([...(was?.unjudged ?? []), 'fire' as const])], held: true } } }
  })
}

/** this camera goes back to the twin's own detector now */
export function dropFrame(camera: string) {
  useSam.setState((s) => {
    if (!s.frames[camera]) return s
    const frames = { ...s.frames }
    delete frames[camera]
    return { frames }
  })
}

useCctv.subscribe((s, was) => {
  if (s.ptz === was.ptz) return
  for (const id of new Set([...Object.keys(s.ptz), ...Object.keys(was.ptz)])) {
    if (s.ptz[id] === was.ptz[id]) continue
    const now = performance.now()
    moved.set(id, now)
    if (samLive(id, useSam.getState().frames, now)) holdFrame(id, now)
  }
})

/** where the twin last said the workers on this camera are */
export const hintsFor = (camera: string) => personHints(lastTags.get(camera) ?? [], useHazardTrack.getState().present)

/** an answer goes up on its camera now, unless that camera has moved since the frame was taken. Tiles repaint every few seconds, so this can't wait for that */
export function applyAnswer(camera: string, answer: SamAnswer, t: number, sentAt: number, source: SamSource, scope: Pick<SamFrame, 'asked' | 'unjudged'> = {}) {
  if (lastMoved(camera) > sentAt) return false
  const now = performance.now()
  // a prompt removed while this frame was on its way stays removed
  const wanted = (d: AnswerDetection) => BUILT_IN.includes(d.label) || useSam.getState().typed.includes(d.label)
  useSam.setState((s) => ({ state: 'live', source, rtt: now - sentAt, gpu: answer.ms, frames: { ...s.frames, [camera]: toFrame({ ...answer, detections: answer.detections.filter(wanted) }, camera, t, now, scope) } }))
  useCctv.getState().pushFrame(camera, withSam(camera, lastSim.get(camera) ?? []))
  return true
}

/** SAM has answered for this camera lately */
export const samLive = (camera: string, frames: Record<string, SamFrame> = useSam.getState().frames, now = performance.now()) => {
  const f = frames[camera]
  return !!f && now - f.at <= STALE_MS
}

// ---------------------------------------------------------------- the loop (runs while the camera page is open)

async function ask(camera: string, canvas: HTMLCanvasElement) {
  const t = useSim.getState().t
  const t0 = performance.now()
  const { typed } = useSam.getState()
  const body = JSON.stringify({
    image_base64: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
    camera,
    people: hintsFor(camera),
    return_masks: true,
    ...(typed.length ? { extra_prompts: typed } : {}),
  })
  const r = await fetch(ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!r.ok) throw new Error(`SAM route answered ${r.status}`)
  const answer = (await r.json()) as SamAnswer
  // switched off while this frame was on its way: it must not turn the camera back on
  if (!useSam.getState().on) return
  applyAnswer(camera, answer, t, t0, 'modal', { asked: answer.prompts })
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
        if (!useSam.getState().on || !cctv.feedsVisible || document.hidden || !camera || !canvas || performance.now() - lastMoved(camera) < REST_MS) {
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
    useSam.getState().setOn(false)
  }
}
