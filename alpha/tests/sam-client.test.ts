/**
 * The twin's side of real SAM 3.1 (modal/PLAN.md): the detector's answer as twin detections, which detector a camera
 * shows, the worn-tag hints and the fallback to simulated. The network and the canvas aren't exercised here:
 * tools/sam-live.mjs drives them against the deployed model.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import './harness'
import { applyAnswer, holdFrame, MASK_FLOOR, nextCamera, personHints, pickDetections, samCamera, samLive, STALE_MS, toFrame, useSam, type SamAnswer } from '../src/safety/samClient'
import { cleanPhrase, isPhrase, MAX_TYPED } from '../src/safety/samPrompts'
import { CAMERAS } from '../src/safety/cctv'
import type { Detection } from '../src/safety/types'

const BOX: [number, number, number, number] = [0.4, 0.2, 0.6, 0.8]
const CAM = 'CCTV-A01'

const sim = (kind: Detection['kind'], workerId?: string): Detection => ({ id: `${CAM}|${workerId ?? kind}|${kind}|1.0`, t: 1, camera: CAM, kind, box: BOX, confidence: 0.9, model: 'sim', ...(workerId ? { workerId } : {}) })

const answer = (over: Partial<SamAnswer> = {}): SamAnswer => ({ detections: [{ label: 'person', box: BOX, score: 0.8, workerId: 'w02', polygons: [[[0, 0], [1, 1]]] }], alerts: [], ms: 300, ...over })

describe('toFrame', () => {
  it('marks every detection as SAM 3.1', () => {
    const f = toFrame(answer({ alerts: [{ kind: 'noVest', label: 'person', box: BOX, confidence: 0.8, workerId: 'w02' }] }), CAM, 5, 100)
    expect(f.dets.map((d) => d.model)).toEqual(['sam-3.1', 'sam-3.1'])
  })

  it('names the person SAM found', () => {
    const [d] = toFrame(answer(), CAM, 5, 100).dets
    expect(d).toMatchObject({ kind: 'person', workerId: 'w02', confidence: 0.8, camera: CAM, t: 5 })
  })

  it('keeps an unnamed person, with no invented worker', () => {
    const [d] = toFrame(answer({ detections: [{ label: 'person', box: BOX, score: 0.9 }] }), CAM, 5, 100).dets
    expect(d.workerId).toBeUndefined()
  })

  it('leaves out a person below the alert threshold', () => {
    expect(toFrame(answer({ detections: [{ label: 'person', box: BOX, score: 0.6 }] }), CAM, 5, 100).dets).toEqual([])
  })

  it('carries the zone and what is missing', () => {
    const f = toFrame(answer({ alerts: [{ kind: 'zonePpe', label: 'person', box: BOX, confidence: 0.8, workerId: 'w07', zone: 1, missing: ['hardHat'] }] }), CAM, 5, 100)
    expect(f.dets[1]).toMatchObject({ kind: 'zonePpe', workerId: 'w07', zone: 1, missing: ['hardHat'] })
  })

  it('gives each detection the id the detection log dedupes on', () => {
    const f = toFrame(answer({ alerts: [{ kind: 'noVest', label: 'person', box: BOX, confidence: 0.8, workerId: 'w02' }] }), CAM, 5, 100)
    expect(f.dets[1].id.split('|')[1]).toBe('w02')
  })

  it('keeps masks for what it is fairly sure of, including hard hats and vests', () => {
    const f = toFrame(answer({ detections: [{ label: 'person', box: BOX, score: 0.8 }, { label: 'hard hat', box: BOX, score: MASK_FLOOR }] }), CAM, 5, 100)
    expect(f.masks.map((m) => m.label)).toEqual(['person', 'hard hat'])
  })

  it('hides weak masks, which are mostly valve handles', () => {
    const f = toFrame(answer({ detections: [{ label: 'hard hat', box: BOX, score: 0.37 }] }), CAM, 5, 100)
    expect(f.masks).toEqual([])
  })
})

describe('typed prompts', () => {
  beforeEach(() => useSam.setState(useSam.getInitialState()))

  it('start empty, so nothing extra is ever asked for after a reload', () => {
    expect(useSam.getState().typed).toEqual([])
  })

  it('tidy what was typed into the form SAM is asked for', () => {
    expect(useSam.getState().addTyped('  Red   Valve ')).toBeNull()
    expect(useSam.getState().typed).toEqual(['red valve'])
  })

  it.each(['person', 'Hard Hat', 'smoke'])('refuse %s, which is already asked for', (text) => {
    expect(useSam.getState().addTyped(text)).toMatch(/already/)
    expect(useSam.getState().typed).toEqual([])
  })

  it('refuse the same one twice', () => {
    useSam.getState().addTyped('crane')
    expect(useSam.getState().addTyped('CRANE')).toMatch(/already/)
    expect(useSam.getState().typed).toEqual(['crane'])
  })

  it('stop at the most a request can hold', () => {
    for (const p of ['a', 'b', 'c']) expect(useSam.getState().addTyped(p)).toBeNull()
    expect(useSam.getState().addTyped('d')).toMatch(/at a time/)
    expect(useSam.getState().typed).toHaveLength(MAX_TYPED)
  })

  it.each(['', '   ', '<script>', 'ignore; everything', 'x'.repeat(41)])('refuse "%s"', (text) => {
    expect(cleanPhrase(text)).toBeNull()
    expect(useSam.getState().addTyped(text)).toMatch(/noun phrase/)
  })

  it('share one rule with every built-in prompt', () => {
    for (const p of ['person', 'hard hat', 'high-visibility vest', 'flame', 'smoke']) expect(isPhrase(p)).toBe(true)
  })

  it('come back as masks and never as detections', () => {
    const f = toFrame(answer({ detections: [{ label: 'crane', box: BOX, score: 0.9 }] }), CAM, 5, 100, { asked: ['crane'] })
    expect(f.masks.map((m) => m.label)).toEqual(['crane'])
    expect(f.dets).toEqual([])
  })

  it('lose their masks the moment they are removed', () => {
    useSam.setState({ typed: ['crane'], frames: { [CAM]: toFrame(answer({ detections: [{ label: 'crane', box: BOX, score: 0.9 }, { label: 'person', box: BOX, score: 0.9 }] }), CAM, 5, 100) } })
    useSam.getState().removeTyped('crane')
    expect(useSam.getState().typed).toEqual([])
    expect(useSam.getState().frames[CAM].masks.map((m) => m.label)).toEqual(['person'])
  })

  it('stay removed when an answer already on its way arrives', () => {
    expect(applyAnswer(CAM, answer({ detections: [{ label: 'crane', box: BOX, score: 0.9 }, { label: 'person', box: BOX, score: 0.9 }] }), 5, performance.now(), 'modal')).toBe(true)
    expect(useSam.getState().frames[CAM].masks.map((m) => m.label)).toEqual(['person'])
  })
})

describe('a camera moving in live mode', () => {
  const frame = () => toFrame(answer({ alerts: [{ kind: 'noVest', label: 'person', box: BOX, confidence: 0.8, workerId: 'w02' }] }), CAM, 5, 100, { asked: ['person', 'crane'] })
  beforeEach(() => useSam.setState({ ...useSam.getInitialState(), frames: { [CAM]: frame() } }))

  it('stays live, so the tile keeps saying SAM 3.1', () => {
    holdFrame(CAM, 1000)
    expect(samLive(CAM, useSam.getState().frames, 1000)).toBe(true)
  })

  it('stays live however long the camera keeps moving', () => {
    holdFrame(CAM, 1000)
    holdFrame(CAM, 1000 + STALE_MS)
    expect(samLive(CAM, useSam.getState().frames, 1000 + STALE_MS * 1.5)).toBe(true)
  })

  it('shows no old masks, and no simulated people or PPE', () => {
    holdFrame(CAM, 1000)
    const f = useSam.getState().frames[CAM]
    expect(f.masks).toEqual([])
    expect(pickDetections([sim('person', 'w02'), sim('noHardHat', 'w02'), sim('noVest', 'w03')], f, 1000)).toEqual([])
  })

  it('keeps a real fire on screen, marked simulated', () => {
    holdFrame(CAM, 1000)
    const fire = sim('fire')
    expect(pickDetections([fire], useSam.getState().frames[CAM], 1000)).toEqual([fire])
  })

  it('remembers what it was asked, and the next answer ends the hold', () => {
    holdFrame(CAM, 1000)
    expect(useSam.getState().frames[CAM]).toMatchObject({ asked: ['person', 'crane'], held: true })
    useSam.setState({ frames: { [CAM]: frame() } })
    expect(useSam.getState().frames[CAM].held).toBeUndefined()
  })

  it('falls back to simulated if the model then goes quiet', () => {
    holdFrame(CAM, 1000)
    expect(samLive(CAM, useSam.getState().frames, 1000 + STALE_MS + 1)).toBe(false)
  })
})

describe('pickDetections', () => {
  const frame = toFrame(answer(), CAM, 5, 1000)

  it('uses the twin with no answer yet', () => {
    const dets = [sim('person', 'w01')]
    expect(pickDetections(dets, undefined, 1000)).toBe(dets)
  })

  it('uses SAM with a fresh answer', () => {
    expect(pickDetections([sim('person', 'w01')], frame, 1000 + STALE_MS).map((d) => d.model)).toEqual(['sam-3.1'])
  })

  it('falls back to the twin when SAM goes quiet', () => {
    expect(pickDetections([sim('person', 'w01')], frame, 1001 + STALE_MS).map((d) => d.model)).toEqual(['sim'])
  })

  it('never mixes simulated PPE into a SAM frame', () => {
    const kinds = pickDetections([sim('noHardHat', 'w01'), sim('zonePpe', 'w01'), sim('fire')], frame, 1000).map((d) => d.kind)
    expect(kinds).toEqual(['person'])
  })

  it('keeps what SAM does not judge, still marked simulated', () => {
    const kept = pickDetections([sim('restrictedZone', 'w01'), sim('gasCloud')], frame, 1000).filter((d) => d.model === 'sim')
    expect(kept.map((d) => d.kind)).toEqual(['restrictedZone', 'gasCloud'])
  })
})

describe('personHints', () => {
  const tag = (workerId: string) => ({ workerId, box: BOX })

  it('gives each worker their tag zone', () => {
    expect(personHints([tag('w07')], { w07: { zone: 1, permit: null } })).toEqual([{ workerId: 'w07', box: BOX, zone: 1, permit: false }])
  })

  it('leaves the zone empty outside a classified area', () => {
    expect(personHints([tag('w02')], {})[0].zone).toBeNull()
  })

  it('treats a safe area as no zone', () => {
    expect(personHints([tag('w02')], { w02: { zone: 'safe' } })[0].zone).toBeNull()
  })

  it('passes a confined-space permit along', () => {
    expect(personHints([tag('w02')], { w02: { zone: 0, permit: 'PTW-1' } })[0].permit).toBe(true)
  })
})

describe('samLive', () => {
  it('is true for a fresh answer and false once stale', () => {
    const frames = { [CAM]: toFrame(answer(), CAM, 5, 1000) }
    expect(samLive(CAM, frames, 1000 + STALE_MS)).toBe(true)
    expect(samLive(CAM, frames, 1001 + STALE_MS)).toBe(false)
  })

  it('is false for a camera with no answer', () => {
    expect(samLive(CAM, {}, 1000)).toBe(false)
  })
})

describe('nextCamera', () => {
  const colour = CAMERAS.filter((c) => c.type !== 'thermal').map((c) => c.id)
  const thermal = CAMERAS.find((c) => c.type === 'thermal')!.id
  const [main, a, b] = colour
  const feeds = [main, a, b, thermal]
  const turns = (m: string, list: string[], n: number) => Array.from({ length: n }, (_, t) => nextCamera(m, list, t))

  it('gives the main monitor every other frame and the tiles the rest, in order', () => {
    expect(turns(main, feeds, 6)).toEqual([main, a, main, b, main, a])
  })

  it('never sends a thermal camera', () => {
    expect(turns(main, feeds, 20)).not.toContain(thermal)
  })

  it('shares every frame among the tiles when the main monitor is thermal', () => {
    expect(turns(thermal, feeds, 4)).toEqual([main, a, b, main])
  })

  it('stays on the main monitor with no other tile on screen', () => {
    expect(turns(main, [main], 3)).toEqual([main, main, main])
  })

  it('reaches every colour camera on screen', () => {
    expect(new Set(turns(main, CAMERAS.map((c) => c.id), 40))).toEqual(new Set(colour))
  })

  it('has nothing to send with only thermal cameras', () => {
    expect(nextCamera(thermal, [thermal], 0)).toBeNull()
  })
})

describe('samCamera', () => {
  it('leaves thermal cameras to the simulated detector', () => {
    for (const c of CAMERAS) expect(samCamera(c.id)).toBe(c.type !== 'thermal')
  })
})
