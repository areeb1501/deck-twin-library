/**
 * SAM 3.1 on the operator's own Meta key (modal/PLAN.md). Real money goes through this path, so the spending rules are tested
 * by counting requests: no scan before On, none after a reload, no clip without a press, and the switch stops the bill. Also the
 * Worker routes, Meta's output format (using sample output from the @meta-sam/parser README) and the PPE rules ported from ppe.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './harness'

vi.mock('../src/safety/metaKey', async (real) => ({
  ...(await real<typeof import('../src/safety/metaKey')>()),
  loadKey: async () => 'test-key-12345',
  hasKey: async () => true,
  saveKey: async () => undefined,
  forgetKey: async () => undefined,
}))

import { metaSamRoute, readStream, requestBody } from '../meta-sam-route.js'
import { metaVideoRoute, videoBody } from '../meta-sam-video-route.js'
import { CAP_IMAGES, charge, due, evaluate, matchPeople, maskPolygons, needsPpe, parseOutput, startMetaSam, testKey, unjudged, useMeta, worstScan, type Found } from '../src/safety/metaSam'
import { cleanKey } from '../src/safety/metaKey'
import { canRecord, CLIP_FRAMES, CLIP_IMAGES, CLIP_USD, closeReview, frameAt, parseClip, reviewLastSeconds, startReview, useReview } from '../src/safety/metaReview'
import { feedCanvases, useCctv } from '../src/safety/cctv'
import { pickDetections, toFrame, useSam } from '../src/safety/samClient'
import type { Detection } from '../src/safety/types'

// frame 0 of a 320×334 clip, from the parser's README: real API output, two objects
const SAMPLE =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334;c=0.91|><|mask;x=0;y=0;c=0.91;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ',1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334;c=0.42|><|mask;x=0;y=0;c=0.42;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n'

const person = (box: Found['box'], score = 0.9, extra: Partial<Found> = {}): Found => ({ label: 'person', box, score, ...extra })
const hat = (box: Found['box'], score = 0.8): Found => ({ label: 'hard hat', box, score })
const vest = (box: Found['box'], score = 0.8): Found => ({ label: 'high-visibility vest', box, score })
const BOX: Found['box'] = [0.4, 0.2, 0.6, 0.8]
const HAT_ON: Found['box'] = [0.47, 0.2, 0.53, 0.27]
const VEST_ON: Found['box'] = [0.42, 0.4, 0.58, 0.55]
const H = 540

describe('the Worker route', () => {
  const ORIGIN = 'https://decktwin.com'
  const image = 'data:image/jpeg;base64,/9j/4AAQ'
  const post = (body: unknown, headers: Record<string, string> = {}) => {
    const text = JSON.stringify(body)
    return new Request(`${ORIGIN}/alpha/api/meta-sam`, { method: 'POST', headers: { origin: ORIGIN, 'content-length': String(text.length), ...headers }, body: text })
  }
  const sse = (...events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { status: 200 })
  const good = { key: 'test-key-12345', image, prompts: ['person'] }
  const upstream = vi.fn()

  beforeEach(() => {
    upstream.mockReset().mockImplementation(async () => sse({ type: 'response.output_text.delta', delta: 'ab' }, { type: 'response.completed' }))
    vi.stubGlobal('fetch', upstream)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends the frame inline with the key, in small masks, and returns the text', async () => {
    const r = await metaSamRoute(post(good), {})
    expect(await r.json()).toMatchObject({ outputs: [{ prompt: 'person', text: 'ab' }] })
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe('https://api.meta.ai/v1/responses')
    expect(init.headers.authorization).toBe('Bearer test-key-12345')
    expect(JSON.parse(init.body)).toEqual(requestBody('person', image))
    expect(JSON.parse(init.body).metadata).toEqual({ mask_encoding: 'one_bit', include_confidence: 'true' })
  })

  it('does not return the key', async () => {
    const r = await metaSamRoute(post(good), {})
    expect(await r.text()).not.toContain(good.key)
  })

  it.each([
    ['an unknown prompt', { ...good, prompts: ['cat'] }],
    ['too many prompts', { ...good, prompts: ['person', 'hard hat', 'flame', 'smoke'] }],
    ['the same prompt twice', { ...good, prompts: ['person', 'person'] }],
    ['no prompts', { ...good, prompts: [] }],
    ['a frame that is not a JPEG', { ...good, image: 'https://example.com/a.jpg' }],
    ['no key', { image, prompts: ['person'] }],
    ['a key with a line break', { ...good, key: 'abcdefgh\nx-other: 1' }],
  ])('refuses %s before spending anything', async (_, body) => {
    expect((await metaSamRoute(post(body), {})).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('refuses another origin', async () => {
    expect((await metaSamRoute(post(good, { origin: 'https://evil.example' }), {})).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('takes POST only', async () => {
    expect((await metaSamRoute(new Request(`${ORIGIN}/alpha/api/meta-sam`), {})).status).toBe(405)
  })

  it('applies the rate limit before spending anything', async () => {
    const env = { SAM_LIMIT: { limit: async () => ({ success: false }) } }
    expect((await metaSamRoute(post(good), env)).status).toBe(429)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([401, 402, 403, 429])('tells the browser Meta answered %i', async (status) => {
    upstream.mockImplementation(async () => new Response('{}', { status }))
    expect((await metaSamRoute(post(good), {})).status).toBe(status)
  })

  it('hides anything else as 502', async () => {
    upstream.mockImplementation(async () => new Response('{}', { status: 500 }))
    expect((await metaSamRoute(post(good), {})).status).toBe(502)
  })

  it('treats a failed stream as a failure', async () => {
    upstream.mockImplementation(async () => sse({ type: 'response.failed' }))
    expect((await metaSamRoute(post(good), {})).status).toBe(502)
  })

  it('keeps what arrived if the stream ends without a closing event, as meta_sam.py does', async () => {
    upstream.mockImplementation(async () => new Response('data: {"type":"response.output_text.delta","delta":"ab"}'))
    expect(await (await metaSamRoute(post(good), {})).json()).toMatchObject({ outputs: [{ text: 'ab' }] })
  })

  it('joins deltas split anywhere', async () => {
    const raw = 'data: {"type":"response.output_text.delta","delta":"a"}\n\ndata: {"type":"response.output_text.delta","delta":"b"}\n\ndata: {"type":"response.completed"}\n\n'
    const bytes = new TextEncoder().encode(raw)
    const body = new ReadableStream({ start: (c) => (c.enqueue(bytes.slice(0, 30)), c.enqueue(bytes.slice(30)), c.close()) })
    expect(await readStream(body)).toBe('ab')
  })
})

describe('reading the answer', () => {
  it('reads boxes, scores and masks in 0 … 1 of the frame', async () => {
    const [a] = await parseOutput(SAMPLE, 'person', 320, 334)
    expect(a).toMatchObject({ label: 'person', score: 0.91 })
    expect(a.box).toEqual([0.6594, 0.6826, 0.8469, 0.7635])
    expect(a.polygons.length).toBeGreaterThan(0)
  })

  it('keeps every polygon inside its box', async () => {
    const [a] = await parseOutput(SAMPLE, 'person', 320, 334)
    for (const [x, y] of a.polygons.flat()) {
      expect(x).toBeGreaterThanOrEqual(a.box[0] - 0.01)
      expect(x).toBeLessThanOrEqual(a.box[2] + 0.01)
      expect(y).toBeGreaterThanOrEqual(a.box[1] - 0.01)
      expect(y).toBeLessThanOrEqual(a.box[3] + 0.01)
    }
  })

  it('thins the outline: the overlay does not draw every pixel step', async () => {
    const [a] = await parseOutput(SAMPLE, 'person', 320, 334)
    expect(a.polygons[0].length).toBeLessThan(60)
  })

  it('reads a one_bit mask, which is what the route asks for', async () => {
    const line = '<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=100;h=100;c=0.9|><|mask;x=0;y=0;c=0.9;data=5,5,!!!!!!(QO(0lu8?|>\n'
    const [a] = await parseOutput(line, 'person', 100, 100)
    expect(a.box).toEqual([0.1, 0.2, 0.15, 0.25])
  })

  it('leaves out what is too unsure even to count as worn', async () => {
    expect((await parseOutput(SAMPLE, 'hard hat', 320, 334)).map((d) => d.score)).toEqual([0.91, 0.42])
    const low = SAMPLE.replaceAll('c=0.42', 'c=0.12')
    expect((await parseOutput(low, 'hard hat', 320, 334)).map((d) => d.score)).toEqual([0.91])
  })

  it('takes no matches as nothing found', async () => {
    expect(await parseOutput('', 'person', 320, 334)).toEqual([])
  })

  it('places an outline at its box, not at the corner of the frame', () => {
    const [p] = maskPolygons('M0 0L10 0L10 10L0 10Z', { width: 10, height: 10 }, { left: 50, top: 100, right: 60, bottom: 110 }, 100, 200)
    expect(p[0][0]).toBeGreaterThan(0.5)
    expect(p[0][1]).toBeGreaterThan(0.5)
  })

  it('scales a raster smaller than its box up to the box', () => {
    const [p] = maskPolygons('M0 0L9 0L9 9L0 9Z', { width: 10, height: 10 }, { left: 0, top: 0, right: 100, bottom: 100 }, 100, 100)
    expect(Math.max(...p.map(([x]) => x))).toBeCloseTo(0.95, 2)
    expect(Math.max(...p.map(([, y]) => y))).toBeCloseTo(0.95, 2)
  })
})

describe('PPE rules, as ppe.py', () => {
  const kinds = (found: Found[], ppe = true) => evaluate(found, ppe, H).map((a) => a.kind)

  it('a fully dressed person raises nothing', () => expect(kinds([person(BOX), hat(HAT_ON), vest(VEST_ON)])).toEqual([]))
  it('no hat and no vest on open deck', () => expect(kinds([person(BOX)]).sort()).toEqual(['noHardHat', 'noVest']))
  it('a person below the threshold raises nothing', () => expect(kinds([person(BOX, 0.6)])).toEqual([]))
  it('a person at the threshold raises', () => expect(kinds([person(BOX, 0.65)])).toHaveLength(2))
  it('an unsure hat still counts as worn', () => expect(kinds([person(BOX), hat(HAT_ON, 0.31), vest(VEST_ON)])).toEqual([]))
  it('a hat on the floor is not worn', () => expect(kinds([person(BOX), hat([0.47, 0.75, 0.53, 0.8]), vest(VEST_ON)])).toEqual(['noHardHat']))

  it('someone else\'s hat is not worn', () => {
    expect(kinds([person(BOX), hat([0.1, 0.2, 0.15, 0.25]), vest(VEST_ON)])).toEqual(['noHardHat'])
  })

  it('zone 0 alerts even with full PPE', () => expect(kinds([person(BOX, 0.9, { zone: 0 }), hat(HAT_ON), vest(VEST_ON)])).toEqual(['zone0Entry']))
  it('zone 0 with a permit is allowed', () => expect(kinds([person(BOX, 0.9, { zone: 0, permit: true })])).toEqual([]))

  it.each([1, 2] as const)('zone %i lists what is missing', (zone) => {
    const [a] = evaluate([person(BOX, 0.9, { zone }), vest(VEST_ON)], true, H)
    expect(a).toMatchObject({ kind: 'zonePpe', zone, missing: ['hardHat'] })
  })

  it('flame and smoke above the threshold alert', () => {
    expect(kinds([{ label: 'flame', box: BOX, score: 0.8 }, { label: 'smoke', box: BOX, score: 0.7 }])).toEqual(['fire', 'fire'])
  })
  it('a flame below the threshold is ignored', () => expect(kinds([{ label: 'flame', box: BOX, score: 0.5 }])).toEqual([]))
  it('most confident first', () => expect(evaluate([person(BOX, 0.7), { label: 'flame', box: BOX, score: 0.9 }], false, H)[0].kind).toBe('fire'))
  it('a figure too small to judge raises no PPE alert', () => expect(kinds([person([0.4, 0.4, 0.45, 0.45])])).toEqual([]))
  it('a far figure in zone 0 still alerts', () => expect(kinds([person([0.4, 0.4, 0.45, 0.45], 0.9, { zone: 0 })])).toEqual(['zone0Entry']))

  it('no hat prompt means no "no hat" alert: this is what makes the person-only scan safe', () => {
    expect(kinds([person(BOX)], false)).toEqual([])
  })

  it('a tag names the person SAM saw', () => {
    const [p] = matchPeople([person(BOX)], [{ workerId: 'w02', box: BOX, zone: 1, permit: false }])
    expect(p).toMatchObject({ workerId: 'w02', zone: 1 })
  })
  it('a tag far from anyone names nobody', () => {
    expect(matchPeople([person(BOX)], [{ workerId: 'w02', box: [0, 0, 0.05, 0.05], zone: null, permit: false }])[0].workerId).toBeUndefined()
  })
  it('a tag never invents a person', () => expect(matchPeople([], [{ workerId: 'w02', box: BOX, zone: null, permit: false }])).toEqual([]))
  it('each worker is used once', () => {
    const found = matchPeople([person(BOX, 0.9), person(BOX, 0.8)], [{ workerId: 'w02', box: BOX, zone: null, permit: false }])
    expect(found.map((d) => d.workerId)).toEqual(['w02', undefined])
  })
})

describe('what a scan replaces', () => {
  const sim = (kind: Detection['kind']): Detection => ({ id: kind, t: 1, camera: 'CCTV-A01', kind, box: BOX, confidence: 0.9, model: 'sim' })
  const SIM = [sim('fire'), sim('noVest'), sim('person'), sim('gasCloud')]
  const shown = (opts: { ppe: boolean; fire: boolean }) => {
    const frame = toFrame({ detections: [person(BOX)], alerts: [], ms: 1 }, 'CCTV-A01', 1, 100, { unjudged: unjudged(opts) })
    return pickDetections(SIM, frame, 100).map((d) => `${d.kind}:${d.model}`)
  }

  it('a fire SAM was not asked about keeps its simulated box, the fire call-up case', () => {
    expect(shown({ ppe: true, fire: false })).toEqual(['person:sam-3.1', 'fire:sim', 'gasCloud:sim'])
  })

  it('PPE SAM was not asked about stays with the twin too', () => {
    expect(shown({ ppe: false, fire: true })).toEqual(['person:sam-3.1', 'noVest:sim', 'gasCloud:sim'])
  })

  it('what SAM looked for and did not find is gone: it judged that', () => {
    expect(shown({ ppe: true, fire: true })).toEqual(['person:sam-3.1', 'gasCloud:sim'])
  })
})

describe('paying only for what is needed', () => {
  it('asks for PPE only if someone could raise a PPE alert', () => {
    expect(needsPpe([], H)).toBe(false)
    expect(needsPpe([person(BOX, 0.5)], H)).toBe(false)
    expect(needsPpe([person([0.4, 0.4, 0.45, 0.45])], H)).toBe(false)
    expect(needsPpe([person(BOX, 0.9, { zone: 0 })], H)).toBe(false)
    expect(needsPpe([person(BOX)], H)).toBe(true)
  })

  it('shows the worst case of a scan', () => {
    expect(worstScan(false, false)).toBe(1)
    expect(worstScan(true, false)).toBe(3)
    expect(worstScan(true, true)).toBe(5)
  })

  it('a camera must stay up before it costs anything', () => {
    expect(due(900, 0, 0, false, 5000)).toBe(false)
    expect(due(1000, 0, 0, false, 5000)).toBe(true)
  })

  it('the same camera waits its turn', () => {
    expect(due(6000, 0, 2000, true, 5000)).toBe(false)
    expect(due(7000, 0, 2000, true, 5000)).toBe(true)
  })

  it('cleans a pasted key', () => {
    expect(cleanKey('  abcdefgh12 ')).toBe('abcdefgh12')
    expect(cleanKey('Bearer abcdefgh12')).toBe('abcdefgh12')
    expect(cleanKey('short')).toBeNull()
    expect(cleanKey('two words here')).toBeNull()
  })
})

describe('the switch', () => {
  const CAM = 'CCTV-A01'
  const THERMAL = 'CCTV-A03'
  const canvas = { width: 960, height: 540, toDataURL: () => 'data:image/jpeg;base64,/9j/' } as unknown as HTMLCanvasElement
  const fetcher = vi.fn()
  let stopLoop: () => void
  let hidden = false
  let answer: (prompts: string[]) => string

  const prompts = () => fetcher.mock.calls.map(([, init]) => JSON.parse(init.body).prompts)
  const SOMEONE = '<0f>0<|box;x1=400;y1=100;x2=500;y2=400;w=960;h=540;c=0.9|><|mask;x=0;y=0;c=0.9;data=5,5,!!!!!!(QO(0lu8?|>\n'

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    hidden = false
    answer = () => ''
    Object.defineProperty(globalThis, 'document', { value: { get hidden() { return hidden } }, configurable: true })
    fetcher.mockReset().mockImplementation(async (_url, init) => {
      const asked = JSON.parse(init.body).prompts as string[]
      return new Response(JSON.stringify({ outputs: asked.map((prompt) => ({ prompt, text: answer(asked) })), ms: 10 }))
    })
    vi.stubGlobal('fetch', fetcher)
    feedCanvases.clear()
    feedCanvases.set(CAM, canvas)
    feedCanvases.set(THERMAL, canvas)
    useCctv.setState({ feedsVisible: true, selected: CAM, callUp: null })
    useSam.setState(useSam.getInitialState())
    useCctv.setState({ ptz: {} })
    useMeta.setState({ ...useMeta.getInitialState(), saved: true })
    stopLoop = startMetaSam()
    await vi.advanceTimersByTimeAsync(0)
  })

  afterEach(() => {
    stopLoop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete (globalThis as { document?: unknown }).document
  })

  it('starts off, whatever was left in storage', () => {
    localStorage.setItem('deck-twin.sam', 'on')
    expect(useMeta.getInitialState().on).toBe(false)
    expect(useSam.getInitialState().on).toBe(false)
  })

  it('stays silent until it is turned on, on an open camera page with a key saved', async () => {
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('needs a saved key', async () => {
    useMeta.setState({ saved: false })
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(useMeta.getState().on).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends person alone first, and pays one image for an empty frame', async () => {
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(prompts()).toEqual([['person']])
    expect(useMeta.getState().images).toBe(1)
  })

  it('asks about PPE when someone is there', async () => {
    answer = (asked) => (asked.includes('person') ? SOMEONE : '')
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(prompts()).toEqual([['person'], ['hard hat', 'high-visibility vest']])
    expect(useMeta.getState().images).toBe(3)
  })

  it('asks no PPE when it is unticked', async () => {
    answer = (asked) => (asked.includes('person') ? SOMEONE : '')
    useMeta.getState().set({ ppe: false })
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(prompts()).toEqual([['person']])
  })

  it('never sends two at once, and holds the chosen pace', async () => {
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(11)
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(13)
  })

  it('stops the moment it is turned off', async () => {
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    useMeta.getState().setOn(false)
    const sent = fetcher.mock.calls.length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetcher.mock.calls.length).toBe(sent)
  })

  it('turns off and goes quiet when the camera page closes', async () => {
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    stopLoop()
    expect(useMeta.getState().on).toBe(false)
    const sent = fetcher.mock.calls.length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetcher.mock.calls.length).toBe(sent)
  })

  it('goes quiet in a hidden tab', async () => {
    useMeta.getState().setOn(true)
    hidden = true
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('goes quiet when the console feeds are not showing', async () => {
    useCctv.setState({ feedsVisible: false })
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('makes no calls for a thermal camera', async () => {
    useCctv.setState({ selected: THERMAL })
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('scrolling past a camera costs nothing, resting on one does', async () => {
    feedCanvases.set('CCTV-A02', canvas)
    useMeta.getState().setOn(true)
    for (let i = 0; i < 10; i++) {
      useCctv.setState({ selected: i % 2 ? CAM : 'CCTV-A02' })
      await vi.advanceTimersByTimeAsync(600)
    }
    expect(fetcher).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('stops itself at the limit, and says so', async () => {
    useMeta.setState({ every: 5 })
    useMeta.getState().setOn(true)
    useMeta.setState({ run: CAP_IMAGES - 1 })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(useMeta.getState().on).toBe(false)
    expect(useMeta.getState().note).toMatch(/limit/)
  })

  it('counts a scan that would pass the limit as not allowed, before it is sent', () => {
    useMeta.getState().setOn(true)
    useMeta.setState({ run: CAP_IMAGES - 1 })
    expect(charge(2)).toBe(false)
    expect(useMeta.getState().images).toBe(0)
  })

  it.each([
    [401, /rejected/],
    [402, /credit/],
    [429, /rate limiting/],
    [500, /did not answer/],
  ])('turns off on %i and sends nothing more', async (status, why) => {
    fetcher.mockImplementation(async () => new Response('{}', { status }))
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(useMeta.getState().on).toBe(false)
    expect(useMeta.getState().note).toMatch(why)
  })

  it('a camera goes back to the twin as soon as it leaves the main monitor', async () => {
    feedCanvases.set('CCTV-A02', canvas)
    answer = () => SOMEONE
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(Object.keys(useSam.getState().frames)).toEqual([CAM])
    useCctv.setState({ selected: 'CCTV-A02' })
    await vi.advanceTimersByTimeAsync(500)
    expect(useSam.getState().frames[CAM]).toBeUndefined()
  })

  it('moving the camera clears the masks at once, so the video never sits on an old view', async () => {
    answer = () => SOMEONE
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(useSam.getState().frames[CAM]).toBeDefined()
    useCctv.getState().setPtz(CAM, { pan: 10 })
    expect(useSam.getState().frames[CAM]).toBeUndefined()
  })

  it('spends nothing while the camera is moving, and one scan when it rests', async () => {
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    const sent = fetcher.mock.calls.length
    for (let pan = 1; pan <= 40; pan++) {
      useCctv.getState().setPtz(CAM, { pan })
      await vi.advanceTimersByTimeAsync(250)
    }
    expect(fetcher.mock.calls.length).toBe(sent)
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetcher.mock.calls.length).toBe(sent + 1)
  })

  it('throws away an answer for a view that has gone', async () => {
    let release = () => {}
    const hold = new Promise<void>((done) => (release = done))
    const reply = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url, init) => {
      await hold
      return reply(url, init)
    })
    answer = () => SOMEONE
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    useCctv.getState().setPtz(CAM, { pan: 25 })
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(useSam.getState().frames[CAM]).toBeUndefined()
  })

  it('says which prompts it sent, so one never sent can not read as found none', async () => {
    useMeta.getState().setOn(true)
    answer = (asked) => (asked.includes('person') ? SOMEONE : '')
    await vi.advanceTimersByTimeAsync(1500)
    expect(useSam.getState().frames[CAM].asked).toEqual(['person', 'hard hat', 'high-visibility vest'])
  })

  it('goes back to simulated when turned off', async () => {
    answer = () => SOMEONE
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(Object.keys(useSam.getState().frames)).toEqual([CAM])
    useMeta.getState().setOn(false)
    expect(useSam.getState().frames).toEqual({})
  })

  it('testing the key costs one image and leaves the switch off', async () => {
    answer = () => SOMEONE
    await testKey()
    expect(prompts()).toEqual([['person']])
    expect(useMeta.getState()).toMatchObject({ on: false, images: 1 })
    expect(useMeta.getState().note).toMatch(/Key works: 1 person/)
  })
})

describe('the clip route', () => {
  const ORIGIN = 'https://decktwin.com'
  const video = 'data:video/mp4;base64,AAAAGGZ0eXA='
  const good = { key: 'test-key-12345', video }
  const post = (body: unknown, headers: Record<string, string> = {}) => {
    const text = JSON.stringify(body)
    return new Request(`${ORIGIN}/alpha/api/meta-sam-video`, { method: 'POST', headers: { origin: ORIGIN, 'content-length': String(text.length), ...headers }, body: text })
  }
  const STREAM = 'data: {"type":"response.output_text.delta","delta":"ab"}\n\ndata: [DONE]\n\n'
  const upstream = vi.fn()

  beforeEach(() => {
    upstream.mockReset().mockImplementation(async () => new Response(STREAM))
    vi.stubGlobal('fetch', upstream)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends the clip inline, once, with person, and uploads nothing', async () => {
    await metaVideoRoute(post(good), {})
    expect(upstream).toHaveBeenCalledTimes(1)
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe('https://api.meta.ai/v1/responses')
    expect(init.headers.authorization).toBe('Bearer test-key-12345')
    const body = JSON.parse(init.body)
    expect(body).toEqual(videoBody(video))
    expect(body.input[0].content).toEqual([{ type: 'input_text', text: 'person' }, { type: 'input_video', video_url: video }])
  })

  it('passes the event stream straight through, for the browser to read', async () => {
    const r = await metaVideoRoute(post(good), {})
    expect(r.headers.get('content-type')).toBe('text/event-stream')
    expect(await r.text()).toBe(STREAM)
  })

  it('does not return the key', async () => {
    const r = await metaVideoRoute(post(good), {})
    expect(await r.text()).not.toContain(good.key)
  })

  it('cannot be asked for another prompt', async () => {
    await metaVideoRoute(post({ ...good, prompt: 'cat', prompts: ['cat'] }), {})
    expect(JSON.parse(upstream.mock.calls[0][1].body).input[0].content[0].text).toBe('person')
  })

  it.each([
    ['WebM, which Meta refuses', { ...good, video: 'data:video/webm;base64,GkXfow==' }],
    ['an image', { ...good, video: 'data:image/jpeg;base64,/9j/' }],
    ['a link instead of a clip', { ...good, video: 'https://example.com/a.mp4' }],
    ['no key', { video }],
    ['a key with a line break', { ...good, key: 'abcdefgh\nx-other: 1' }],
    ['no clip', { key: good.key }],
  ])('refuses %s before spending anything', async (_, body) => {
    expect((await metaVideoRoute(post(body), {})).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('refuses another origin', async () => {
    expect((await metaVideoRoute(post(good, { origin: 'https://evil.example' }), {})).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('refuses a body over its limit', async () => {
    expect((await metaVideoRoute(post(good, { 'content-length': '4000001' }), {})).status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('takes POST only', async () => {
    expect((await metaVideoRoute(new Request(`${ORIGIN}/alpha/api/meta-sam-video`), {})).status).toBe(405)
  })

  it('applies the rate limit before spending anything', async () => {
    const env = { SAM_LIMIT: { limit: async () => ({ success: false }) } }
    expect((await metaVideoRoute(post(good), env)).status).toBe(429)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([401, 402, 403, 429])('tells the browser Meta answered %i', async (status) => {
    upstream.mockImplementation(async () => new Response('{}', { status }))
    expect((await metaVideoRoute(post(good), {})).status).toBe(status)
  })

  it('hides anything else as 502', async () => {
    upstream.mockImplementation(async () => new Response('{}', { status: 500 }))
    expect((await metaVideoRoute(post(good), {})).status).toBe(502)
  })

  it('treats no answer as 502', async () => {
    upstream.mockImplementation(async () => {
      throw new TypeError('network')
    })
    expect((await metaVideoRoute(post(good), {})).status).toBe(502)
  })
})

describe('reading a tracked clip', () => {
  const frame = (n: number, line = SAMPLE) => line.replace('<0f>', `<${n}f>`)

  it('keeps each person under one id from frame to frame', async () => {
    const frames = await parseClip(frame(0) + frame(1), 320, 334)
    expect(frames[0].map((p) => p.id)).toEqual(['0'])
    expect(frames[1].map((p) => p.id)).toEqual(['0'])
    expect(frames[1][0].polygons.length).toBeGreaterThan(0)
    expect(frames[1][0].box).toEqual([0.6594, 0.6826, 0.8469, 0.7635])
  })

  it('puts frames in their place whatever order they arrive', async () => {
    const frames = await parseClip(frame(4) + frame(2), 320, 334)
    expect(frames[2]).toHaveLength(1)
    expect(frames[3]).toBeUndefined()
    expect(frames[4]).toHaveLength(1)
  })

  it('drops an unsure track whole, not frame by frame', async () => {
    const sure = frame(1, SAMPLE.replaceAll('c=0.91', 'c=0.40').replaceAll('c=0.42', 'c=0.80'))
    const frames = await parseClip(frame(0, SAMPLE.replaceAll('c=0.91', 'c=0.40').replaceAll('c=0.42', 'c=0.30')) + sure, 320, 334)
    expect(frames[0].map((p) => [p.id, p.score])).toEqual([['1', 0.3]])
    expect(frames[1].map((p) => p.id)).toEqual(['1'])
  })

  it('takes no matches as nobody tracked', async () => {
    expect(await parseClip('', 320, 334)).toEqual([])
  })

  it('finds the frame showing at a point in the clip, when frames are not evenly spaced', () => {
    const times = [0, 0.3, 0.6, 1.5]
    expect(frameAt(times, 0)).toBe(0)
    expect(frameAt(times, 0.31)).toBe(1)
    expect(frameAt(times, 1)).toBe(2)
    expect(frameAt(times, 1.4)).toBe(3)
    expect(frameAt(times, 99)).toBe(3)
  })
})

describe('the review button', () => {
  const CAM = 'CCTV-A01'
  const THERMAL = 'CCTV-A03'
  const ROUTE = /meta-sam-video$/
  const canvas = { width: 960, height: 540, toDataURL: () => 'data:image/jpeg;base64,/9j/' } as unknown as HTMLCanvasElement
  const fetcher = vi.fn()
  let stopScans: () => void
  let stopReview: () => void
  let hidden = false
  let supported = true
  let frames = 0
  let clipSize = 1000

  class FakeRecorder {
    static made: FakeRecorder[] = []
    static isTypeSupported = (type: string) => supported && type === 'video/mp4;codecs=avc1'
    state = 'inactive'
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    options: { mimeType: string }
    constructor(_: unknown, options: { mimeType: string }) {
      this.options = options
      FakeRecorder.made.push(this)
    }
    start() {
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob([new Uint8Array(clipSize)]) })
      this.onstop?.()
    }
  }
  const copy = () => ({
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => undefined }),
    captureStream: () => ({ getVideoTracks: () => [{ requestFrame: () => frames++, stop: () => undefined }] }),
  })
  const clips = () => fetcher.mock.calls.filter(([url]) => ROUTE.test(url))
  const scans = () => fetcher.mock.calls.filter(([url]) => !ROUTE.test(url))
  const recording = () => FakeRecorder.made.filter((r) => r.state === 'recording').length
  const sse = (...text: string[]) => new Response(text.map((delta) => `data: ${JSON.stringify({ type: 'response.output_text.delta', delta })}\n\n`).join('') + 'data: {"type":"response.completed"}\n\n')
  const record = (ms = 11_000) => vi.advanceTimersByTimeAsync(ms)

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    hidden = false
    supported = true
    frames = 0
    clipSize = 1000
    FakeRecorder.made = []
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    Object.defineProperty(globalThis, 'document', { value: { get hidden() { return hidden }, createElement: copy }, configurable: true })
    fetcher.mockReset().mockImplementation(async (url, init) => {
      if (ROUTE.test(url)) return sse(SAMPLE)
      return new Response(JSON.stringify({ outputs: JSON.parse(init.body).prompts.map((prompt: string) => ({ prompt, text: '' })), ms: 10 }))
    })
    vi.stubGlobal('fetch', fetcher)
    feedCanvases.clear()
    feedCanvases.set(CAM, canvas)
    feedCanvases.set('CCTV-A02', canvas)
    feedCanvases.set(THERMAL, canvas)
    useCctv.setState({ feedsVisible: true, selected: CAM, callUp: null, ptz: {} })
    useSam.setState(useSam.getInitialState())
    useMeta.setState({ ...useMeta.getInitialState(), saved: true })
    useReview.setState(useReview.getInitialState())
    stopScans = startMetaSam()
    stopReview = startReview()
    await vi.advanceTimersByTimeAsync(0)
  })

  afterEach(() => {
    stopScans()
    stopReview()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete (globalThis as { document?: unknown }).document
  })

  it('records nothing and sends nothing until the switch is on', async () => {
    await vi.advanceTimersByTimeAsync(120_000)
    expect(FakeRecorder.made).toHaveLength(0)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends no clip without a press, however long it records', async () => {
    useMeta.getState().setOn(true)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(FakeRecorder.made.length).toBeGreaterThan(50)
    expect(scans().length).toBeGreaterThan(0)
    expect(clips()).toHaveLength(0)
  })

  it('a press with the switch off sends nothing', async () => {
    useMeta.getState().setOn(true)
    await record()
    useMeta.setState({ on: false })
    await reviewLastSeconds()
    expect(clips()).toHaveLength(0)
  })

  it('a press before 10 s are recorded sends nothing', async () => {
    useMeta.getState().setOn(true)
    await record(9000)
    await reviewLastSeconds()
    expect(useReview.getState().have).toBeLessThan(10)
    expect(clips()).toHaveLength(0)
  })

  it('one press, one request, with the whole clip as MP4', async () => {
    useMeta.getState().setOn(true)
    await record()
    await reviewLastSeconds()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(clips()).toHaveLength(1)
    const body = JSON.parse(clips()[0][1].body)
    expect(body.key).toBe('test-key-12345')
    expect(body.video.startsWith('data:video/mp4;base64,')).toBe(true)
    expect(FakeRecorder.made[0].options.mimeType).toBe('video/mp4;codecs=avc1')
    expect(Object.keys(body)).toEqual(['key', 'video'])
  })

  it('a second press while one is on its way sends nothing', async () => {
    let release = () => {}
    const hold = new Promise<void>((done) => (release = done))
    fetcher.mockImplementation(async (url) => {
      if (!ROUTE.test(url)) return new Response(JSON.stringify({ outputs: [], ms: 1 }))
      await hold
      return sse('')
    })
    useMeta.getState().setOn(true)
    await record()
    const first = reviewLastSeconds()
    await vi.waitFor(() => expect(clips()).toHaveLength(1))
    // a slow answer gives the next take time to reach 10 s
    await record(10_000)
    expect(useReview.getState().have).toBe(10)
    const second = reviewLastSeconds()
    await vi.advanceTimersByTimeAsync(0)
    const sent = clips().length
    release()
    await Promise.all([first, second])
    expect(sent).toBe(1)
  })

  it('costs the price on the button, and counts towards the running total', async () => {
    useMeta.getState().set({ every: 20 })
    useMeta.getState().setOn(true)
    await record()
    const { images, run } = useMeta.getState()
    await reviewLastSeconds()
    expect(CLIP_USD).toBeCloseTo(0.01)
    expect(CLIP_FRAMES).toBe(50)
    expect(CLIP_IMAGES).toBe(4)
    expect(useMeta.getState().images).toBe(images + 4)
    expect(useMeta.getState().run).toBe(run + 4)
    expect(useReview.getState().clips).toBe(1)
  })

  it('stops at the same limit as the scans, before sending', async () => {
    useMeta.getState().setOn(true)
    await record()
    useMeta.setState({ run: CAP_IMAGES - 3 })
    await reviewLastSeconds()
    expect(clips()).toHaveLength(0)
    expect(useMeta.getState().on).toBe(false)
    expect(useMeta.getState().note).toMatch(/limit/)
  })

  it('keeps every clip within the billed minimum: no take passes 50 frames', async () => {
    useMeta.getState().setOn(true)
    await record(10_000)
    frames = 0
    await record(15_000)
    // three takes on the go, each a frame every 300 ms
    expect(frames / 3).toBeLessThanOrEqual(CLIP_FRAMES)
    expect(recording()).toBeLessThanOrEqual(3)
  })

  it('refuses a clip too large to send, and spends nothing', async () => {
    clipSize = 3_000_000
    useMeta.getState().setOn(true)
    await record()
    const { images } = useMeta.getState()
    await reviewLastSeconds()
    expect(clips()).toHaveLength(0)
    expect(useMeta.getState().images).toBe(images)
    expect(useMeta.getState().note).toMatch(/too large/)
  })

  it.each([
    [401, /rejected/],
    [402, /credit/],
    [429, /rate limiting/],
    [500, /did not answer/],
  ])('turns off on %i, with no retry', async (status, why) => {
    fetcher.mockImplementation(async (url) => (ROUTE.test(url) ? new Response('{}', { status }) : new Response(JSON.stringify({ outputs: [], ms: 1 }))))
    useMeta.getState().setOn(true)
    await record()
    await reviewLastSeconds()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(clips()).toHaveLength(1)
    expect(useMeta.getState().on).toBe(false)
    expect(useMeta.getState().note).toMatch(why)
    expect(useReview.getState().busy).toBe(false)
  })

  it('a failure part way through the answer turns it off too', async () => {
    fetcher.mockImplementation(async (url) => (ROUTE.test(url) ? new Response('data: {"type":"response.failed"}\n\n') : new Response(JSON.stringify({ outputs: [], ms: 1 }))))
    useMeta.getState().setOn(true)
    await record()
    await reviewLastSeconds()
    expect(useMeta.getState().on).toBe(false)
    expect(useReview.getState().clip).toBeNull()
  })

  it('shows the clip with what was tracked, one time per frame', async () => {
    useMeta.getState().setOn(true)
    await record()
    await reviewLastSeconds()
    const { clip } = useReview.getState()
    expect(clip).toMatchObject({ camera: CAM, ids: ['0'] })
    expect(clip!.frames[0][0].id).toBe('0')
    expect(clip!.times[0]).toBe(0)
    expect(clip!.times.length).toBeGreaterThanOrEqual(33)
    expect(clip!.times.every((t, i) => !i || t > clip!.times[i - 1])).toBe(true)
  })

  it('leaves the live cameras alone: a replay is not a scan', async () => {
    useMeta.getState().set({ every: 20 })
    useMeta.getState().setOn(true)
    await record()
    const before = useSam.getState().frames
    await reviewLastSeconds()
    expect(useSam.getState().frames).toBe(before)
  })

  it('turning off while it is on its way sends nothing more and shows nothing', async () => {
    let release = () => {}
    const hold = new Promise<void>((done) => (release = done))
    fetcher.mockImplementation(async (url, init) => {
      if (!ROUTE.test(url)) return new Response(JSON.stringify({ outputs: [], ms: 1 }))
      await hold
      init.signal.throwIfAborted()
      return sse(SAMPLE)
    })
    useMeta.getState().setOn(true)
    await record()
    const press = reviewLastSeconds()
    await vi.waitFor(() => expect(clips()).toHaveLength(1))
    useMeta.getState().setOn(false)
    release()
    await press
    expect(useReview.getState()).toMatchObject({ busy: false, clip: null, have: 0 })
    expect(useMeta.getState().note).toBe('')
    expect(clips()).toHaveLength(1)
  })

  it('turning off stops the recording', async () => {
    useMeta.getState().setOn(true)
    await record()
    expect(recording()).toBeGreaterThan(0)
    useMeta.getState().setOn(false)
    expect(recording()).toBe(0)
    const made = FakeRecorder.made.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(FakeRecorder.made.length).toBe(made)
  })

  it('leaving the camera page stops the recording and closes the replay', async () => {
    useMeta.getState().setOn(true)
    await record()
    await reviewLastSeconds()
    expect(useReview.getState().clip).not.toBeNull()
    stopReview()
    expect(recording()).toBe(0)
    expect(useReview.getState().clip).toBeNull()
  })

  it('closing the replay is all it takes to get rid of it', async () => {
    useMeta.getState().setOn(true)
    await record()
    await reviewLastSeconds()
    closeReview()
    expect(useReview.getState().clip).toBeNull()
    expect(useMeta.getState().on).toBe(true)
  })

  it('a clip never spans two cameras: changing camera starts over', async () => {
    feedCanvases.set('CCTV-A02', { ...canvas } as HTMLCanvasElement)
    useMeta.getState().setOn(true)
    await record()
    expect(useReview.getState().have).toBe(10)
    useCctv.setState({ selected: 'CCTV-A02' })
    await vi.advanceTimersByTimeAsync(500)
    expect(useReview.getState().have).toBe(0)
    await reviewLastSeconds()
    expect(clips()).toHaveLength(0)
  })

  it('records nothing for a thermal camera', async () => {
    useCctv.setState({ selected: THERMAL })
    useMeta.getState().setOn(true)
    await record()
    expect(FakeRecorder.made).toHaveLength(0)
    await reviewLastSeconds()
    expect(clips()).toHaveLength(0)
  })

  it('records nothing in a hidden tab, and a clip does not span the gap', async () => {
    useMeta.getState().setOn(true)
    await record()
    hidden = true
    await vi.advanceTimersByTimeAsync(500)
    expect(recording()).toBe(0)
    hidden = false
    await vi.advanceTimersByTimeAsync(500)
    await reviewLastSeconds()
    expect(clips()).toHaveLength(0)
  })

  it('records nothing where MP4 recording is not available, as in Firefox', async () => {
    supported = false
    expect(canRecord()).toBe(false)
    useMeta.getState().setOn(true)
    await record()
    expect(FakeRecorder.made).toHaveLength(0)
    vi.stubGlobal('MediaRecorder', undefined)
    expect(canRecord()).toBe(false)
  })
})
