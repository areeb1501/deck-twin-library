/**
 * Hazardous areas (plan 14): Zone 0/1/2 derivation from the plant data (src/safety/hazardAreas.ts), the worn-tag
 * tracker (src/safety/workers.ts), the simulated CCTV detector (src/safety/cctv.ts) and the alert rule. No figures
 * are mounted, so poses are written to workerPose as scene/Workers.tsx would, and PPE is pinned with the
 * instructor override because the rotation changes it. detect() runs without the renderer's occlusion test.
 */
import * as THREE from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { fresh, positionOf, run, sim } from './harness'
import { plant } from '../src/model/plant'
import { useAlerts } from '../src/safety/alerts'
import { camerasSeeing, detect, FEED_H, FEED_W, useCctv } from '../src/safety/cctv'
import { assess, hazardAreas, hazardZoneAt, hazardZoneAtLocal, requiredPpe, zoneTargets, type ZoneTarget } from '../src/safety/hazardAreas'
import { setPpeOverride, useHazardTrack, workerLevelIndex, workerPose } from '../src/safety/workers'
import { useMaint } from '../src/sim/maintenance'
import { DECK_WORLD_Y } from '../src/state/store'

const WORKER = 'w01'
const levels = workerLevelIndex({ level: 'production' }, plant)
const volumesOf = (tag: string) => hazardAreas(plant).filter((v) => v.tag === tag)
const zonesOf = (tag: string) => [...new Set(volumesOf(tag).map((v) => v.zone))].sort()

function stand(target: ZoneTarget) {
  workerPose[WORKER] = { x: target.to[0], z: target.to[1], footY: DECK_WORLD_Y, yaw: 0, speed: 0 }
}
function wearing(ppe: { hardHat: boolean; vest: boolean; gasMonitor: boolean }) {
  setPpeOverride(WORKER, ppe)
}
const FULL = { hardHat: true, vest: true, gasMonitor: true }
const violations = () => useHazardTrack.getState().active.filter((v) => v.workerId === WORKER)
const alerts = () => useAlerts.getState().alerts.filter((a) => a.rule === 'hazardous-area')

function seenBy(target: ZoneTarget) {
  const cam = camerasSeeing([target.to[0], DECK_WORLD_Y, target.to[1]], target.face)[0]
  const lens = new THREE.PerspectiveCamera(cam.fov, FEED_W / FEED_H, 0.3, 900)
  lens.position.set(...cam.pos)
  lens.lookAt(...cam.target)
  lens.updateProjectionMatrix()
  lens.updateMatrixWorld()
  return { cam, detections: detect(cam, lens, sim().t) }
}
const inView = (targets: ZoneTarget[]) => targets.find((t) => camerasSeeing([t.to[0], DECK_WORLD_Y, t.to[1]], t.face).length > 0)!

describe('zone derivation', () => {
  it('gives a hydrocarbon vessel a Zone 0 interior and a Zone 2 envelope', () => expect(zonesOf('V-1100')).toEqual([0, 2]))
  it('gives a hydrocarbon pump Zone 1 and Zone 2', () => expect(zonesOf('P-1500A')).toEqual([1, 2]))
  it('gives the compressor Zone 1 and Zone 2', () => expect(zonesOf('K-2200')).toEqual([1, 2]))
  it('gives a producing wellhead Zone 1 and Zone 2', () => expect(zonesOf('XT-110')).toEqual([1, 2]))
  it('gives a pig trap Zone 1 and Zone 2', () => expect(zonesOf('L-R110')).toEqual([1, 2]))
  it('gives a turbine enclosure Zone 2 only', () => expect(zonesOf('GT-8100A')).toEqual([2]))
  it('gives a cold vent tip all three zones', () => expect(zonesOf('VS-A300')).toEqual([0, 1, 2]))
  it('gives the flare tip all three zones', () => expect(zonesOf('FLARE')).toEqual([0, 1, 2]))
  it('leaves the water injector unclassified', () => expect(volumesOf('XT-N106')).toEqual([]))
  it('leaves a utility pump unclassified', () => expect(volumesOf('P-6200A')).toEqual([]))
  it('leaves the control room unclassified', () => expect(volumesOf('B-9300')).toEqual([]))
  it('classifies valve stations on hydrocarbon lines as Zone 2', () => expect(zonesOf('ESDV-1601')).toEqual([2]))

  it('gives every volume a unique id', () => {
    const ids = hazardAreas(plant).map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('zone lookup', () => {
  const [x, y, z] = positionOf('V-1100')

  it('reports Zone 0 inside the vessel shell', () => expect(hazardZoneAtLocal(x, y, z, plant)?.zone).toBe(0))
  it('reports the highest hazard where volumes overlap', () => expect(hazardZoneAtLocal(x, y, z, plant)?.volume.tag).toBe('V-1100'))
  it('reads the same zone from world coordinates', () => expect(hazardZoneAt([x, y + DECK_WORLD_Y, z], plant)?.zone).toBe(0))
  it('reports the LQ quarters as safe', () => expect(hazardZoneAtLocal(...positionOf('B-9300'), plant)).toBeNull())
})

describe('PPE and entry matrix', () => {
  const site = (zone: 0 | 1 | 2) => ({ zone, volume: hazardAreas(plant).find((v) => v.zone === zone)! })

  it('requires a gas monitor in Zone 1', () => expect(requiredPpe(1)).toEqual(['hardHat', 'vest', 'gasMonitor']))
  it('does not require a gas monitor in Zone 2', () => expect(requiredPpe(2)).toEqual(['hardHat', 'vest']))
  it('requires nothing tracked in a safe area', () => expect(requiredPpe(null)).toEqual([]))
  it('finds nothing wrong in a safe area', () => expect(assess({ hardHat: false, vest: false, gasMonitor: false }, null)).toBeNull())
  it('finds nothing wrong in full PPE in Zone 1', () => expect(assess(FULL, site(1))).toBeNull())
  it('flags Zone 0 entry in full PPE without a permit', () => expect(assess(FULL, site(0))).toEqual({ kind: 'zone0Entry', missing: [] }))
  it('allows Zone 0 entry in full PPE under a permit', () => expect(assess(FULL, site(0), true)).toBeNull())
  it('still checks PPE under a Zone 0 permit', () => expect(assess({ ...FULL, vest: false }, site(0), true)).toEqual({ kind: 'zonePpe', missing: ['vest'] }))
  it('names what is missing in Zone 2', () => expect(assess({ ...FULL, hardHat: false }, site(2))).toEqual({ kind: 'zonePpe', missing: ['hardHat'] }))
})

describe('tracking a person', () => {
  beforeEach(() => {
    fresh()
    useAlerts.getState().clear()
    delete workerPose[WORKER]
  })

  describe('in Zone 0 with no permit', () => {
    const here = () => inView(zoneTargets(0, levels, plant))

    beforeEach(() => {
      wearing(FULL)
      stand(here())
      run(4)
    })

    it('opens a zone0Entry violation', () => expect(violations().map((v) => v.kind)).toEqual(['zone0Entry']))
    it('raises a critical alert', () => expect(alerts().map((a) => a.severity)).toEqual(['critical']))
    it('calls a camera up', () => expect(useCctv.getState().callUpReason).toMatch(/^Zone 0 entry/))

    it('produces a zone0Entry detection on a camera that sees the person', () => {
      const { detections } = seenBy(here())
      expect(detections.filter((d) => d.workerId === WORKER).map((d) => d.kind)).toContain('zone0Entry')
    })
  })

  describe('in Zone 0 under a confined-space permit', () => {
    it('opens no violation', () => {
      const target = zoneTargets(0, levels, plant)[0]
      useMaint.setState({ permits: { 'PTW-1': { id: 'PTW-1', type: 'confined', status: 'issued', tag: target.volume.tag } as never } })
      wearing(FULL)
      stand(target)
      run(4)
      expect(useHazardTrack.getState().present[WORKER].permit).toBe('PTW-1')
      expect(violations()).toEqual([])
    })
  })

  describe('in Zone 1 without a gas monitor', () => {
    const target = () => inView(zoneTargets(1, levels, plant))

    beforeEach(() => {
      wearing({ ...FULL, gasMonitor: false })
      stand(target())
      run(4)
    })

    it('opens a zonePpe violation for the monitor', () => expect(violations().filter((v) => v.zone === 1).map((v) => [v.kind, v.missing])).toEqual([['zonePpe', ['gasMonitor']]]))
    it('raises a warning alert', () => expect(alerts().map((a) => a.severity)).toContain('warning'))
    it('produces a zonePpe detection naming the monitor', () => {
      const box = seenBy(target()).detections.find((d) => d.kind === 'zonePpe')
      expect(box?.missing).toEqual(['gasMonitor'])
    })
  })

  describe('in Zone 1 in full PPE', () => {
    it('opens no violation', () => {
      wearing(FULL)
      stand(zoneTargets(1, levels, plant)[0])
      run(4)
      expect(violations()).toEqual([])
    })
  })

  it('waits two seconds before opening a violation', () => {
    wearing(FULL)
    stand(zoneTargets(0, levels, plant)[0])
    run(1)
    expect(violations()).toEqual([])
  })

  it('closes the violation twenty seconds after the person leaves', () => {
    wearing(FULL)
    stand(zoneTargets(0, levels, plant)[0])
    run(4)
    workerPose[WORKER] = { ...workerPose[WORKER], x: 0, z: 70 }
    run(22)
    expect(violations()).toEqual([])
    expect(useHazardTrack.getState().log[0].t1).toBeDefined()
  })

  it('confirms the tracked violation when a camera frame reports it', () => {
    const here = inView(zoneTargets(0, levels, plant))
    wearing(FULL)
    stand(here)
    run(4)
    const { cam, detections } = seenBy(here)
    useCctv.getState().pushFrame(cam.id, detections)
    expect(violations()[0].camera).toBe(cam.id)
  })
})
