/**
 * SAM 3.1 on the operator's own Meta Model API key (modal/PLAN.md). Frames go to `alpha/meta-sam-route.js`, which forwards
 * them with the key and keeps nothing. Every prompt is one billed image at $2.50 per 1 000, so spending is the design:
 *
 *  - Nothing runs until the operator turns it on. That is never remembered: a reload comes back simulated, and leaving the
 *    camera page or a hidden tab stops the calls.
 *  - Only the camera on the main monitor is scanned, one frame at a time, after it has been up and still for REST_MS.
 *  - `person` goes first. The PPE prompts only go if someone is there and big enough to judge, so an empty frame costs one image,
 *    plus one for each prompt the operator has typed, which goes on every scan. The cost on the card includes them.
 *  - Each turn-on may spend CAP_IMAGES. Any error turns it off, because a retry could cost money and tell us nothing.
 *
 * A scan only replaces what it looked for. With flame and smoke unticked, the twin's fire detection stays on that camera,
 * marked simulated, so a fire call-up can't lose its box. A camera leaves SAM's hands as soon as it leaves the main monitor,
 * because it won't be scanned again. Moving a camera counts as a new view: it stays live, and nothing is spent until it has rested.
 *
 * The PPE rules are ppe.py in modal/dt_gateway, with the same thresholds. Masks come back as rasters that fill their box,
 * so they are traced to the same polygons the Modal route sends.
 */
import { create } from 'zustand'
import { useSim } from '../state/sim'
import { feedCanvases, useCctv } from './cctv'
import { forgetKey, hasKey, loadKey, saveKey } from './metaKey'
import { applyAnswer, dropFrame, hintsFor, holdFrame, lastMoved, PERSON, PERSON_FLOOR, REST_MS, samCamera, useSam, type AnswerAlert, type AnswerDetection, type PersonHint } from './samClient'
import type { DetectionKind } from './types'

const ROUTE = `${import.meta.env.BASE_URL}api/meta-sam`
export const IMAGE_USD = 0.0025
/** what one turn-on may spend: about $0.50 */
export const CAP_IMAGES = 200
/** seconds between scans the operator can choose. All are shorter than samClient's STALE_MS, so the masks hold between scans */
export const EVERY_S = [5, 10, 20]
const TICK_MS = 250
const TIMEOUT_MS = 60_000
const JPEG_QUALITY = 0.85
const HAT = 'hard hat'
const VEST = 'high-visibility vest'
const FIRE = ['flame', 'smoke']
/** PPE counts as worn from this score. Lower on purpose: an unsure hat must not become a "no hat" alert */
const SEEN_FLOOR = 0.3
/** a figure shorter than this, in pixels, is too small to judge PPE on */
const MIN_FIGURE_PX = 50

export interface Found extends AnswerDetection {
  zone?: 0 | 1 | 2 | null
  permit?: boolean
}
export type Box = Found['box']

// ---------------------------------------------------------------- PPE rules (ppe.py)

function wearsHat(person: Found, hats: Found[]) {
  const [x0, y0, x1, y1] = person.box
  const bottom = y0 + (y1 - y0) * 0.25
  return hats.some(({ box: b }) => {
    const cx = (b[0] + b[2]) / 2
    const cy = (b[1] + b[3]) / 2
    return x0 <= cx && cx <= x1 && y0 <= cy && cy <= bottom
  })
}

function wearsVest(person: Found, vests: Found[]) {
  const [x0, y0, x1, y1] = person.box
  const top = y0 + (y1 - y0) * 0.3
  const bottom = y0 + (y1 - y0) * 0.65
  return vests.some(({ box: b }) => Math.min(x1, b[2]) > Math.max(x0, b[0]) && Math.min(bottom, b[3]) > Math.max(top, b[1]))
}

export function overlap(a: Box, b: Box) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  if (w <= 0 || h <= 0) return 0
  const both = w * h
  return both / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - both)
}

/** names the people SAM found from the twin's worn tags. It never adds a person. Most confident first, each worker used once */
export function matchPeople(found: Found[], people: PersonHint[], floor = 0.1): Found[] {
  const free = [...people]
  const named = new Map<Found, Pick<Found, 'workerId' | 'zone' | 'permit'>>()
  for (const person of found.filter((d) => d.label === PERSON).sort((a, b) => b.score - a.score)) {
    let best = -1
    free.forEach((p, i) => {
      if (best < 0 || overlap(person.box, p.box) > overlap(person.box, free[best].box)) best = i
    })
    if (best < 0 || overlap(person.box, free[best].box) < floor) continue
    const [p] = free.splice(best, 1)
    named.set(person, { workerId: p.workerId, zone: p.zone, permit: p.permit })
  }
  return found.map((d) => ({ ...d, ...named.get(d) }))
}

/** one alert per finding, most confident first. `ppe` says whether hats and vests were asked for: if not, none being found means nothing */
export function evaluate(found: Found[], ppe: boolean, frameHeight: number): AnswerAlert[] {
  const of = (label: string, floor: number) => found.filter((d) => d.label === label && d.score >= floor)
  const hats = of(HAT, SEEN_FLOOR)
  const vests = of(VEST, SEEN_FLOOR)
  const alerts: AnswerAlert[] = []
  const alert = (kind: AnswerAlert['kind'], d: Found, extra: Partial<AnswerAlert> = {}) =>
    alerts.push({ kind, label: d.label, box: d.box, confidence: d.score, ...(d.workerId ? { workerId: d.workerId } : {}), ...extra })
  for (const person of of(PERSON, PERSON_FLOOR)) {
    if (person.zone === 0) {
      if (!person.permit) alert('zone0Entry', person, { zone: 0 })
      continue
    }
    if (!ppe || !bigEnough(person, frameHeight)) continue
    const missing: ('hardHat' | 'vest')[] = []
    if (!wearsHat(person, hats)) missing.push('hardHat')
    if (!wearsVest(person, vests)) missing.push('vest')
    if (!missing.length) continue
    if (person.zone === 1 || person.zone === 2) alert('zonePpe', person, { zone: person.zone, missing })
    else for (const m of missing) alert(m === 'hardHat' ? 'noHardHat' : 'noVest', person)
  }
  for (const label of FIRE) for (const hazard of of(label, PERSON_FLOOR)) alert('fire', hazard)
  return alerts.sort((a, b) => b.confidence - a.confidence)
}

const bigEnough = (person: Found, frameHeight: number) => (person.box[3] - person.box[1]) * frameHeight >= MIN_FIGURE_PX

/** the PPE prompts are worth paying for only if someone here could raise a PPE alert */
export const needsPpe = (found: Found[], frameHeight: number) =>
  found.some((d) => d.label === PERSON && d.score >= PERSON_FLOOR && d.zone !== 0 && bigEnough(d, frameHeight))

// ---------------------------------------------------------------- masks

type Point = [number, number]
const area = (p: Point[]) => Math.abs(p.reduce((sum, [x, y], i) => sum + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0)) / 2
const perimeter = (p: Point[]) => p.reduce((sum, [x, y], i) => sum + Math.hypot(p[(i + 1) % p.length][0] - x, p[(i + 1) % p.length][1] - y), 0)

/** Douglas-Peucker: the points of an open chain that stay within `tol` of it */
function thin(p: Point[], tol: number): Point[] {
  if (p.length < 3) return p
  const [ax, ay] = p[0]
  const [bx, by] = p[p.length - 1]
  const len = Math.hypot(bx - ax, by - ay) || 1
  let far = 0
  let at = 0
  for (let i = 1; i < p.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / len
    if (d > far) [far, at] = [d, i]
  }
  if (far <= tol) return [p[0], p[p.length - 1]]
  return [...thin(p.slice(0, at + 1), tol).slice(0, -1), ...thin(p.slice(at), tol)]
}

/** a closed outline as a few points, split at its farthest point so neither half is degenerate */
function simplify(p: Point[], tol: number): Point[] {
  let at = 0
  let far = 0
  p.forEach(([x, y], i) => {
    const d = Math.hypot(x - p[0][0], y - p[0][1])
    if (d > far) [far, at] = [d, i]
  })
  if (!at) return p
  return [...thin(p.slice(0, at + 1), tol).slice(0, -1), ...thin([...p.slice(at), p[0]], tol).slice(0, -1)]
}

/** the mask's outlines in 0 … 1 of the frame. The path is in raster pixels and the raster fills `bounds`. Largest three, as the Modal route sends */
export function maskPolygons(path: string, raster: { width: number; height: number }, bounds: { left: number; top: number; right: number; bottom: number }, w: number, h: number): [number, number][][] {
  const sx = (bounds.right - bounds.left) / raster.width
  const sy = (bounds.bottom - bounds.top) / raster.height
  const outlines = path.split('M').slice(1).map((sub) => {
    const n = (sub.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    return Array.from({ length: Math.floor(n.length / 2) }, (_, i): Point => [n[i * 2], n[i * 2 + 1]])
  })
  return outlines
    .filter((p) => p.length >= 3 && area(p) >= 4)
    .sort((a, b) => area(b) - area(a))
    .slice(0, 3)
    .map((p) => simplify(p, 0.003 * perimeter(p)).map(([x, y]): Point => [+((bounds.left + (x + 0.5) * sx) / w).toFixed(4), +((bounds.top + (y + 0.5) * sy) / h).toFixed(4)]))
}

export async function* lane(text: string) {
  const at = { item_id: 'sam', output_index: 0, content_index: 0 }
  yield { type: 'response.output_text.delta', ...at, delta: text } as const
  yield { type: 'response.output_text.done', ...at, text } as const
  yield { type: 'response.completed' } as const
}

const unit = (v: number, size: number) => +Math.min(Math.max(v / size, 0), 1).toFixed(4)
/** a box in source pixels as 0 … 1 of the frame */
export const unitBox = (b: { left: number; top: number; right: number; bottom: number }, w: number, h: number): Box => [unit(b.left, w), unit(b.top, h), unit(b.right, w), unit(b.bottom, h)]

/** the output text for one prompt as detections. The parser only loads for someone who has turned this on */
export async function parseOutput(text: string, label: string, w: number, h: number): Promise<Found[]> {
  if (!text.trim()) return []
  const { decodeMaskToSVGPath, parseImageStream, recordsOfKind } = await import('@meta-sam/parser')
  const { records } = await parseImageStream(lane(text)).finalResult
  const masks = recordsOfKind(records, 'mask')
  return recordsOfKind(records, 'box').flatMap((b) => {
    const score = b.confidence ?? 1
    if (score < SEEN_FLOOR) return []
    const m = masks.find((r) => r.objectId === b.objectId)
    return [{ label, score, box: unitBox(b, w, h), polygons: m ? maskPolygons(decodeMaskToSVGPath(m.mask), m.mask, m.bounds, w, h) : [] }]
  })
}

// ---------------------------------------------------------------- the switch

interface MetaStore {
  /** a key is saved in this browser (null until asked) */
  saved: boolean | null
  on: boolean
  busy: boolean
  ppe: boolean
  fire: boolean
  every: number
  /** images asked for since this page loaded, and since it was last turned on */
  images: number
  run: number
  /** why it stopped, or what the last test found */
  note: string
  setOn: (on: boolean) => void
  set: (patch: Partial<Pick<MetaStore, 'ppe' | 'fire' | 'every'>>) => void
  save: (key: string) => Promise<void>
  forget: () => Promise<void>
}

let inflight: AbortController | null = null

export function stop(note = '') {
  inflight?.abort()
  inflight = null
  const was = useMeta.getState().on
  useMeta.setState({ on: false, busy: false, note })
  if (was) useSam.setState({ state: 'off', frames: {} })
}

export const useMeta = create<MetaStore>((set, get) => ({
  saved: null,
  on: false,
  busy: false,
  ppe: true,
  fire: false,
  every: EVERY_S[0],
  images: 0,
  run: 0,
  note: '',
  setOn: (on) => {
    if (!on) return stop()
    if (!get().saved) return
    useSam.getState().setOn(false)
    set({ on: true, run: 0, note: '' })
  },
  set,
  save: async (key) => {
    await saveKey(key)
    set({ saved: true, note: '' })
  },
  forget: async () => {
    stop()
    await forgetKey()
    set({ saved: false })
  },
}))
if (import.meta.env.DEV) Object.assign(window, { __meta: useMeta })

/** counts images before they are asked for, so a lost answer is still counted. False once the cap would be passed */
export function charge(n: number) {
  const { on, run, images } = useMeta.getState()
  if (on && run + n > CAP_IMAGES) {
    stop(`Stopped at the limit of ${CAP_IMAGES} images (about $${(CAP_IMAGES * IMAGE_USD).toFixed(2)}). Turn on again to carry on.`)
    return false
  }
  useMeta.setState({ images: images + n, run: run + n })
  return true
}

/** what a scan costs at most, for the operator to see before turning it on, in images */
export const worstScan = (ppe: boolean, fire: boolean, typed = 0) => 1 + (ppe ? 2 : 0) + (fire ? 2 : 0) + typed

/** what a scan with these options doesn't look for */
export const unjudged = ({ ppe, fire }: { ppe: boolean; fire: boolean }): DetectionKind[] => [...(ppe ? [] : (['noHardHat', 'noVest', 'zonePpe'] as const)), ...(fire ? [] : (['fire'] as const))]

/** when the main monitor's camera is due a scan */
export function due(now: number, stillSince: number, lastScan: number, sameView: boolean, everyMs: number) {
  return now - stillSince >= REST_MS && (!sameView || now - lastScan >= everyMs)
}

const WHY: Record<number, string> = {
  400: 'Meta refused this frame',
  401: 'Meta rejected this key',
  402: 'This key is out of credit',
  403: 'This key is not allowed to use SAM 3.1',
  429: 'Meta is rate limiting this key',
}

export class Refused extends Error {
  constructor(status: number) {
    super(WHY[status] ?? 'Meta did not answer')
  }
}

async function ask(key: string, image: string, prompts: string[], signal: AbortSignal) {
  const r = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, image, prompts }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
  })
  if (!r.ok) throw new Refused(r.status)
  return (await r.json()) as { outputs: { prompt: string; text: string }[]; ms: number }
}

/** one frame of one camera, cheapest first. `looping` scans end with the switch. Returns the people found, or null if it was cut short */
async function scan(camera: string, canvas: HTMLCanvasElement, opts: { ppe: boolean; fire: boolean; typed: string[] }, looping: boolean): Promise<number | null> {
  const key = await loadKey()
  if (!key) throw new Error('No key saved')
  const off = () => looping && !useMeta.getState().on
  if (off()) return null
  const abort = (inflight = new AbortController())
  useMeta.setState({ busy: true })
  try {
    const t = useSim.getState().t
    const t0 = performance.now()
    const image = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    const { width: w, height: h } = canvas
    const hints = hintsFor(camera)
    let ms = 0
    const asked: string[] = []
    const round = async (prompts: string[]) => {
      if (!charge(prompts.length)) return null
      asked.push(...prompts)
      const answer = await ask(key, image, prompts, abort.signal)
      ms += answer.ms
      return (await Promise.all(answer.outputs.map((o) => parseOutput(o.text, o.prompt, w, h)))).flat()
    }
    const first = await round([PERSON, ...(opts.fire ? FIRE : [])])
    if (!first) return null
    let found = matchPeople(first, hints)
    const ppe = opts.ppe && needsPpe(found, h)
    if (ppe) {
      const worn = await round([HAT, VEST])
      if (!worn) return null
      found = [...found, ...worn]
    }
    if (opts.typed.length) {
      const more = await round(opts.typed)
      if (!more) return null
      found = [...found, ...more]
    }
    // switched off while this frame was on its way: it must not turn the camera back on
    if (off()) return null
    applyAnswer(camera, { detections: found, alerts: evaluate(found, ppe, h), ms }, t, t0, 'meta', { asked, unjudged: unjudged(opts) })
    return found.filter((d) => d.label === PERSON && d.score >= PERSON_FLOOR).length
  } finally {
    useMeta.setState({ busy: false })
  }
}

/** one billed image on the main monitor, to prove the key before leaving it on */
export async function testKey() {
  const cctv = useCctv.getState()
  const camera = cctv.callUp ?? cctv.selected
  const canvas = feedCanvases.get(camera)
  if (!canvas || !samCamera(camera)) return useMeta.setState({ note: 'Put a colour camera on the main monitor first.' })
  if (useMeta.getState().busy) return
  try {
    const people = await scan(camera, canvas, { ppe: false, fire: false, typed: [] }, false)
    useMeta.setState({ note: `Key works: ${people ?? 0} ${people === 1 ? 'person' : 'people'} found on ${camera}, 1 image used.` })
  } catch (e) {
    useMeta.setState({ note: (e as Error).message })
  }
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
let run = 0

/** the camera page calls this on mount; the function it returns stops the loop and turns the switch off */
export function startMetaSam(): () => void {
  const mine = ++run
  void hasKey().then((saved) => useMeta.setState({ saved }), () => useMeta.setState({ saved: false }))
  void (async () => {
    let up = ''
    let upSince = 0
    let scanned = ''
    let lastScan = 0
    while (mine === run) {
      await wait(TICK_MS)
      if (mine !== run) return
      const m = useMeta.getState()
      const cctv = useCctv.getState()
      const camera = cctv.callUp ?? cctv.selected
      const now = performance.now()
      if (camera !== up) {
        if (useSam.getState().source === 'meta') dropFrame(up)
        ;[up, upSince] = [camera, now]
        // the new camera is scanned next, so it is live from the moment it comes up
        if (m.on && samCamera(camera) && !useSam.getState().frames[camera]) holdFrame(camera, now)
      }
      const canvas = feedCanvases.get(camera)
      if (!m.on || m.busy || !cctv.feedsVisible || document.hidden || !canvas || !samCamera(camera)) continue
      const head = lastMoved(camera)
      if (!due(now, Math.max(upSince, head), lastScan, scanned === camera && head < lastScan, m.every * 1000)) continue
      try {
        await scan(camera, canvas, { ppe: m.ppe, fire: m.fire, typed: useSam.getState().typed }, true)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') stop(`${(e as Error).message}. Turned off so nothing more is spent.`)
      }
      scanned = camera
      lastScan = performance.now()
    }
  })()
  return () => {
    run++
    stop()
  }
}
