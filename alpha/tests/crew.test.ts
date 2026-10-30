/**
 * Crew size (src/state/store.ts WORKER_COUNT, src/safety/workers.ts): the Toolbar count, the cap, who is on shift and
 * how the PPE rotation behaves at each size. Figures aren't mounted here: tools/crew.mjs drives the real stepper.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fresh, run } from './harness'
import { ROSTER, setPpeOverride, useWorkers } from '../src/safety/workers'
import { useStore, WORKER_COUNT } from '../src/state/store'

const count = () => useStore.getState().workerCount
const setCount = (n: number) => useStore.getState().setWorkerCount(n)
const roster = () => useWorkers.getState().roster

describe('crew size', () => {
  beforeEach(() => {
    setCount(WORKER_COUNT.def)
    fresh()
  })
  afterEach(() => setCount(WORKER_COUNT.def))

  it('starts at ten', () => {
    expect(WORKER_COUNT.def).toBe(10)
    expect(roster()).toHaveLength(10)
  })

  it('can name everyone up to the cap, once each', () => {
    expect(ROSTER).toHaveLength(WORKER_COUNT.max)
    expect(new Set(ROSTER.map((w) => w.id)).size).toBe(WORKER_COUNT.max)
    expect(new Set(ROSTER.map((w) => w.name)).size).toBe(WORKER_COUNT.max)
  })

  it.each([
    [999, WORKER_COUNT.max],
    [0, WORKER_COUNT.min],
    [-5, WORKER_COUNT.min],
    [12.6, 13],
  ])('clamps %d to %d', (asked, got) => {
    setCount(asked)
    expect(count()).toBe(got)
    expect(roster()).toHaveLength(got)
  })

  it('keeps the count between visits', () => {
    setCount(17)
    expect(localStorage.getItem('deck-twin.workerCount')).toBe('17')
  })

  it('adds to the end, so the default crew never changes', () => {
    const before = roster().map((w) => w.id)
    setCount(14)
    expect(roster().slice(0, 10).map((w) => w.id)).toEqual(before)
    expect(roster()).toHaveLength(14)
  })

  it('spreads a full crew across every platform', () => {
    setCount(WORKER_COUNT.max)
    const on = (platform: string) => roster().filter((w) => w.platform === platform).length
    expect({ Alpha: on('Alpha'), 'WHP-N': on('WHP-N'), RP: on('RP'), WI: on('WI') }).toEqual({ Alpha: 14, 'WHP-N': 4, RP: 3, WI: 3 })
  })

  it('gives the deck crew, who also walk to the LQ, a home on Alpha', () => {
    expect(ROSTER.filter((w) => w.role === 'Deck crew').every((w) => w.platform === 'Alpha')).toBe(true)
  })

  it('lets newcomers arrive in full PPE', () => {
    run(1)
    setCount(WORKER_COUNT.max)
    const added = roster().slice(10)
    expect(added.every((w) => w.hardHat && w.vest && w.gasMonitor)).toBe(true)
  })

  it('leaves the people who stay as they were', () => {
    setPpeOverride('w01', { hardHat: false })
    run(1)
    setCount(WORKER_COUNT.max)
    expect(roster().find((w) => w.id === 'w01')?.hardHat).toBe(false)
  })

  it('forgets an override for someone who left', () => {
    setCount(WORKER_COUNT.max)
    setPpeOverride('w20', { hardHat: false })
    run(1)
    setCount(WORKER_COUNT.def)
    setCount(WORKER_COUNT.max)
    run(1)
    expect(roster().find((w) => w.id === 'w20')?.hardHat).toBe(true)
  })

  it.each([1, 2, 3])('finishes a PPE rotation with a crew of %d', (n) => {
    setCount(n)
    run(400)
    expect(roster()).toHaveLength(n)
  })

  it('only rotates PPE among people on shift', () => {
    setCount(3)
    run(400)
    const ids = new Set(ROSTER.slice(0, 3).map((w) => w.id))
    expect(roster().every((w) => ids.has(w.id))).toBe(true)
  })

  it('goes back to the chosen crew after a session reset', () => {
    setCount(15)
    fresh()
    expect(roster()).toHaveLength(15)
  })
})
