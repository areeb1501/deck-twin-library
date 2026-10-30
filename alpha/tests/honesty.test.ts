/**
 * Honesty (AGENTS.md rule 2): simulated output keeps saying so, and nothing claims a model that is not wired. The
 * CCTV detector runs on a three.js camera with no renderer, so there is no occlusion test here.
 */
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fresh, positionOf, run, sim } from './harness'
import { runWorkflow } from '../src/agents/catalog'
import { PROVIDER_LABEL, useProvider } from '../src/agents/provider'
import { runTool } from '../src/safety/agentTools'
import { raise, useAlerts } from '../src/safety/alerts'
import { CAMERAS, detect, FEED_H, FEED_W, useCctv } from '../src/safety/cctv'
import { setPpeOverride, workerPose } from '../src/safety/workers'
import { DECK_WORLD_Y } from '../src/state/store'

const camera = CAMERAS.find((c) => c.id === 'CCTV-A02')!
const lens = () => {
  const c = new THREE.PerspectiveCamera(camera.fov, FEED_W / FEED_H, 0.3, 900)
  c.position.set(...camera.pos)
  c.lookAt(...camera.target)
  c.updateProjectionMatrix()
  c.updateMatrixWorld()
  return c
}

describe('CCTV detections', () => {
  beforeEach(() => {
    fresh()
    run(1)
  })

  it('marks PPE detections as simulated', () => {
    setPpeOverride('w02', { hardHat: false, vest: false, gasMonitor: true })
    workerPose.w02 = { x: camera.target[0], z: camera.target[2], footY: DECK_WORLD_Y, yaw: 0, speed: 1 }
    const seen = detect(camera, lens(), sim().t).filter((d) => d.workerId === 'w02')
    expect(seen.map((d) => d.kind)).toEqual(['person', 'noHardHat', 'noVest'])
    expect(new Set(seen.map((d) => d.model))).toEqual(new Set(['sim']))
  })

  it('marks hazard detections as simulated', () => {
    const [x, , z] = positionOf('P-1500A')
    sim().inject({ kind: 'fire', at: [x, 1.5, z], sizeMW: 2 })
    const fire = detect(camera, lens(), sim().t).find((d) => d.kind === 'fire')
    expect(fire?.model).toBe('sim')
  })

  it('keeps the mark in the alert a detection raises', () => {
    useCctv.getState().pushFrame(camera.id, [{ id: 'x|w02|noVest|1', t: sim().t, camera: camera.id, kind: 'noVest', workerId: 'w02', box: [0, 0, 1, 1], confidence: 0.9, model: 'sim' }])
    run(2)
    expect(useAlerts.getState().alerts.find((a) => a.rule === 'ppe-violation')?.body).toContain('model sim')
  })
})

describe('providers list', () => {
  it('labels the local planner as simulated', () => expect(PROVIDER_LABEL.sim).toMatch(/^Simulated/))
  it('labels Muse Spark as planned', () => expect(PROVIDER_LABEL.muse).toMatch(/\(planned\)/))
  it('offers only the local planner until the server reports more', () => {
    expect(useProvider.getInitialState().available).toEqual({ sim: { ready: true, label: PROVIDER_LABEL.sim, model: 'sim-planner' } })
  })

  it('stays on the local planner when the proxy is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await useProvider.getState().refresh()
    vi.unstubAllGlobals()
    expect(Object.keys(useProvider.getState().available)).toEqual(['sim'])
  })
})

describe('tool results', () => {
  beforeEach(() => fresh())

  it.each(['get_spares', 'get_economics', 'get_insights', 'get_inspections', 'get_corrosion', 'get_corrosion_trend'])('%s says it is simulated', (name) => {
    expect((runTool(name, { tag: 'V-1100' }) as { simulated?: boolean }).simulated).toBe(true)
  })

  it('flags simulated metrics on an equipment reading', () => {
    const { metrics } = runTool('get_equipment', { tag: 'K-2200' }) as { metrics: { simulated: boolean }[] }
    expect(metrics.length).toBeGreaterThan(0)
    expect(metrics.every((m) => typeof m.simulated === 'boolean')).toBe(true)
  })
})

describe('workflow output', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    useProvider.setState({ provider: 'sim' })
    fresh()
  })
  afterEach(() => void vi.useRealTimers())

  it('says it came from the local planner', async () => {
    const pending = runWorkflow('drift')
    await vi.runAllTimersAsync()
    const result = await pending
    expect(result?.model).toBe('sim-planner')
    expect(result?.text).toContain('findings from the local planner')
  })
})

describe('alert email', () => {
  beforeEach(() => fresh())

  it('stays a draft: queued, never sent', () => {
    const alert = raise({ severity: 'warning', source: 'alarm', rule: 'honesty', platform: 'Alpha', title: 'Test', body: 'Body', tags: [], evidence: ['seen'] })
    expect(alert?.status).toBe('queued')
    expect(alert?.email.text).toContain('prototype outbox (drafted in the browser, not sent)')
  })
})
