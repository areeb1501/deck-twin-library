/**
 * "Review the last 10 s": SAM 3.1 tracking on a recorded clip, on the operator's own Meta key (modal/PLAN.md). Video can't be live
 * here, because the answer can't start until the clip exists, so tracking serves incident review: one press, one clip, one request.
 *
 *  - The recording runs only while the Meta switch is on, on a colour camera on the main monitor, in a visible tab. It stays in the
 *    browser, and nothing leaves it without a press. Changing camera starts over, because a clip must show one camera.
 *  - MediaRecorder can't cut a clip out of a running recording, so takes overlap: one starts every STAGGER_MS, and at LONGEST_MS the
 *    oldest is thrown away. The oldest take always holds the last 10 s, and a press sends all of it, 10 to 15 s.
 *  - Each take has its own canvas, stream and recorder. Chrome only writes a frame when a canvas changes, and a new recorder on a
 *    shared stream repeats a frame to the others, so this is what keeps a take's frames one to one with `ticks`. That is how a mask
 *    finds its picture in the replay, since `<Nf>` counts frames, not seconds. The monitor repaints about twice a second, so some
 *    frames repeat.
 *  - A frame every FRAME_MS for at most LONGEST_MS is at most 50 frames, Meta's minimum, so a press should cost the shown price, as
 *    long as Meta counts the file's frames (not yet confirmed). It counts as CLIP_IMAGES against the turn-on's limit. Any error turns
 *    the switch off, and there are no retries.
 *  - A clip follows `person` and each prompt the operator has typed. Meta takes one noun phrase to a request and bills each, so a
 *    press costs that many times the clip's price, and the button says so first.
 *  - The replay has its own panel. The live monitor is never covered.
 */
import { create } from 'zustand'
import { useSim } from '../state/sim'
import { feedCanvases, useCctv } from './cctv'
import { loadKey } from './metaKey'
import { charge, IMAGE_USD, lane, maskPolygons, Refused, stop, unitBox, useMeta, type Box } from './metaSam'
import { readStream } from './metaStream'
import { MASK_FLOOR, PERSON, PERSON_FLOOR, samCamera, useSam } from './samClient'

const ROUTE = `${import.meta.env.BASE_URL}api/meta-sam-video`
/** Meta refuses WebM and VP9, and a plain `video/mp4` may still hold VP9, so the codec is named */
const MP4 = 'video/mp4;codecs=avc1'
const BITRATE = 1_000_000
const FRAME_MS = 300
const STAGGER_MS = 5000
const LONGEST_MS = 15_000
const TIMEOUT_MS = 180_000
/** base64 of this fits the route's limit */
const MAX_CLIP_BYTES = 2_900_000
export const CLIP_S = 10
export const CLIP_FRAMES = 50
export const CLIP_USD = CLIP_FRAMES * 0.0002
export const CLIP_IMAGES = Math.ceil(CLIP_USD / IMAGE_USD)

export interface Tracked {
  /** stays with one object through the clip, such as `person 2` */
  id: string
  score: number
  box: Box
  polygons: [number, number][][]
}
export interface ReviewClip {
  url: string
  camera: string
  /** sim time the clip ends */
  t: number
  /** what SAM found in each frame of the clip. A frame with nothing in it has no entry */
  frames: Tracked[][]
  /** when each frame was drawn, s from the start of the clip */
  times: number[]
  /** the objects tracked */
  ids: string[]
  /** the noun phrases sent */
  asked: string[]
}

interface ReviewStore {
  /** seconds of the last CLIP_S recorded so far */
  have: number
  busy: boolean
  /** clips sent since this page loaded */
  clips: number
  clip: ReviewClip | null
}

export const useReview = create<ReviewStore>(() => ({ have: 0, busy: false, clips: 0, clip: null }))
if (import.meta.env.DEV) Object.assign(window, { __review: useReview })

export const canRecord = () => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(MP4)

// ---------------------------------------------------------------- the rolling recording

interface Take {
  recorder: MediaRecorder
  paper: CanvasRenderingContext2D
  track: CanvasCaptureMediaStreamTrack
  at: number
  ticks: number[]
  chunks: Blob[]
}

let takes: Take[] = []
let monitor: HTMLCanvasElement | null = null
let onCamera = ''

function newTake(canvas: HTMLCanvasElement, at: number): Take {
  const copy = document.createElement('canvas')
  copy.width = canvas.width
  copy.height = canvas.height
  const paper = copy.getContext('2d')!
  const stream = copy.captureStream(0)
  const recorder = new MediaRecorder(stream, { mimeType: MP4, videoBitsPerSecond: BITRATE })
  const take: Take = { recorder, paper, track: stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack, at, ticks: [], chunks: [] }
  recorder.ondataavailable = (e) => take.chunks.push(e.data)
  recorder.start()
  return take
}

function discard(take: Take) {
  take.recorder.ondataavailable = null
  if (take.recorder.state !== 'inactive') take.recorder.stop()
  take.track.stop()
}

function clearTakes() {
  takes.forEach(discard)
  takes = []
  monitor = null
  if (useReview.getState().have) useReview.setState({ have: 0 })
}

const finish = (take: Take) =>
  new Promise<Blob>((done) => {
    take.recorder.onstop = () => {
      take.track.stop()
      done(new Blob(take.chunks, { type: 'video/mp4' }))
    }
    take.recorder.stop()
  })

function tick() {
  const cctv = useCctv.getState()
  const camera = cctv.callUp ?? cctv.selected
  const canvas = feedCanvases.get(camera)
  const wanted = useMeta.getState().on && cctv.feedsVisible && !document.hidden && !!canvas && samCamera(camera) && canRecord()
  if (!wanted || canvas !== monitor) clearTakes()
  if (!wanted) return
  monitor = canvas!
  onCamera = camera
  const now = performance.now()
  takes = takes.filter((take) => {
    const keep = take.recorder.state === 'recording' && now - take.at < LONGEST_MS
    if (!keep) discard(take)
    return keep
  })
  if (!takes.length || now - takes[takes.length - 1].at >= STAGGER_MS) takes.push(newTake(canvas!, now))
  for (const take of takes) {
    take.paper.drawImage(canvas!, 0, 0)
    take.track.requestFrame()
    take.ticks.push(now)
  }
  const have = Math.min(CLIP_S, Math.floor((now - takes[0].at) / 1000))
  if (have !== useReview.getState().have) useReview.setState({ have })
}

// ---------------------------------------------------------------- the answer

/** Meta's output for one noun phrase as what each frame holds, in 0 … 1 of the picture. A score moves from frame to frame, so a track is kept or dropped whole */
export async function parseClip(text: string, w: number, h: number, label = PERSON): Promise<Tracked[][]> {
  const frames: Tracked[][] = []
  if (!text.trim()) return frames
  const { decodeMaskToSVGPath, frameIndexOf, parseVideoStream, recordsOfKind } = await import('@meta-sam/parser')
  const { records } = await parseVideoStream(lane(text)).finalResult
  const at = (r: { objectId: string; frame?: { frameIndex: number } }) => `${r.frame?.frameIndex}|${r.objectId}`
  const masks = new Map(recordsOfKind(records, 'mask').map((m) => [at(m), m]))
  const boxes = recordsOfKind(records, 'box')
  const best = new Map<string, number>()
  for (const b of boxes) best.set(b.objectId, Math.max(best.get(b.objectId) ?? 0, b.confidence ?? 1))
  for (const b of boxes) {
    if (best.get(b.objectId)! < (label === PERSON ? PERSON_FLOOR : MASK_FLOOR)) continue
    const m = masks.get(at(b))
    ;(frames[frameIndexOf(b) ?? 0] ??= []).push({ id: `${label} ${b.objectId}`, score: b.confidence ?? 1, box: unitBox(b, w, h), polygons: m ? maskPolygons(decodeMaskToSVGPath(m.mask), m.mask, m.bounds, w, h) : [] })
  }
  return frames
}

/** tracks of several noun phrases, frame by frame */
export const mergeClips = (clips: Tracked[][][]) => Array.from({ length: Math.max(0, ...clips.map((c) => c.length)) }, (_, i) => clips.flatMap((c) => c[i] ?? []))

/** how many tracks a noun phrase has. A track's id is the phrase and a number */
export const tracksOf = (ids: string[], prompt: string) => ids.filter((id) => id.slice(0, id.lastIndexOf(' ')) === prompt).length

/** the noun phrases a press would send */
export const clipPrompts = (typed: string[]) => [PERSON, ...typed]

/** the frame showing at this point of the clip */
export const frameAt = (times: number[], seconds: number) => times.reduce((best, t, i) => (Math.abs(t - seconds) < Math.abs(times[best] - seconds) ? i : best), 0)

async function base64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let text = ''
  for (let i = 0; i < bytes.length; i += 32_768) text += String.fromCharCode(...bytes.subarray(i, i + 32_768))
  return btoa(text)
}

function show(clip: ReviewClip | null) {
  const old = useReview.getState().clip
  if (old) URL.revokeObjectURL(old.url)
  useReview.setState({ clip })
}

export const closeReview = () => show(null)

let inflight: AbortController | null = null

/** one press: the oldest take goes to Meta once. The take is spent either way, and the next is ready within STAGGER_MS */
export async function reviewLastSeconds() {
  const now = performance.now()
  const take = takes.find((t) => now - t.at >= CLIP_S * 1000)
  if (!take || useReview.getState().busy) return
  takes = takes.filter((t) => t !== take)
  const { width: w, height: h } = monitor!
  const camera = onCamera
  const abort = (inflight = new AbortController())
  useReview.setState({ busy: true })
  try {
    const key = await loadKey()
    if (!key) throw new Error('No key saved')
    const blob = await finish(take)
    if (blob.size > MAX_CLIP_BYTES) throw new Error('This clip is too large to send')
    const asked = clipPrompts(useSam.getState().typed)
    // switched off while the clip was closing: nothing has been spent yet
    if (abort.signal.aborted || !charge(CLIP_IMAGES * asked.length)) return
    useReview.setState((s) => ({ clips: s.clips + asked.length }))
    const video = `data:video/mp4;base64,${await base64(blob)}`
    const tracks = await Promise.all(
      asked.map(async (prompt) => {
        const r = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, video, prompt }),
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(TIMEOUT_MS)]),
        })
        if (!r.ok || !r.body) throw new Refused(r.status)
        return parseClip(await readStream(r.body), w, h, prompt)
      }),
    )
    if (abort.signal.aborted) return
    const frames = mergeClips(tracks)
    const ids = [...new Set(frames.flat().map((f) => f.id))]
    show({ url: URL.createObjectURL(blob), camera, t: useSim.getState().t, frames, times: take.ticks.map((t) => (t - take.ticks[0]) / 1000), ids, asked })
  } catch (e) {
    if ((e as Error).name !== 'AbortError') stop(`${(e as Error).message}. Turned off so nothing more is spent.`)
  } finally {
    useReview.setState({ busy: false })
  }
}

useMeta.subscribe((s, was) => {
  if (s.on || !was.on) return
  inflight?.abort()
  clearTakes()
})

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
let run = 0

/** the camera page calls this on mount; the function it returns stops the recording and closes the replay */
export function startReview(): () => void {
  const mine = ++run
  void (async () => {
    while (mine === run) {
      await wait(FRAME_MS)
      if (mine === run) tick()
    }
  })()
  return () => {
    run++
    clearTakes()
    closeReview()
  }
}
