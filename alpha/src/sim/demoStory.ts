/**
 * One-click demo stories (plan 13) — deterministic set-ups for a booth demo, so nothing depends on a random
 * failure turning up on time.
 *
 *   k2200-dgs   The export compressor K-2200 starts losing its dry-gas seal. The cartridge is not on the
 *               island and the open order is months out. Expedite (exchange unit, helicopter last leg) and
 *               repair it as planned work, or wait and watch it fail and the gas go to flare.
 *   weather     A storm front: sea state above the supply vessel's offload limit, so cargo waits at the
 *               base; the helicopter is the only way out to the field.
 *
 * Auto-crew (on by default in a story) walks the story machine's work orders through approve → permit →
 * isolation → work → return to service, and only isolates once the parts are kitted — the way a planner would.
 * Everything still goes through the normal maintenance actions, so the permit, lock-out and deferment
 * bookkeeping is the real thing.
 */
import { create } from 'zustand'
import { registerSimPlugin, useSim } from '../state/sim'
import { useStore } from '../state/store'
import { isOpen, maint, runOf, useMaint, type WorkOrder } from './maintenance'
import { sparesApi, useSpares } from './spares'
import { TAGS } from './alpha'
import type { SimState } from './types'

export type StoryId = 'k2200-dgs' | 'weather'
export interface Story {
  id: StoryId
  title: string
  pitch: string
  /** the machine the story is about (auto-crew works its orders) */
  tag?: string
}
export const STORIES: Story[] = [
  {
    id: 'k2200-dgs',
    title: 'Compressor seal: expedite or wait?',
    pitch: 'K-2200 starts leaking at its dry-gas seal. The spare is not offshore and the open order is months out. Expedite it, or wait and let it fail.',
    tag: TAGS.compressor,
  },
  {
    id: 'weather',
    title: 'Weather closes the supply route',
    pitch: 'Sea state rises above the supply vessel’s offload limit. Cargo waits at the base; only the helicopter still flies.',
  },
]

export const DGS_MODE = 'Dry gas seal leakage high'

interface StoryState {
  active: StoryId | null
  startedAt: number
  autoCrew: boolean
  /** last thing the story / auto-crew did, for the chip */
  note: string
}
export const useStory = create<StoryState>(() => ({ active: null, startedAt: 0, autoCrew: true, note: '' }))

const S = () => useSim.getState() as SimState
const note = (text: string) => useStory.setState({ note: text })

/** the dry-gas-seal cartridge of K-2200 in the spares catalogue */
export function dgsPart() {
  return useSpares.getState().parts.find((p) => p.fits.includes(TAGS.compressor) && p.usedFor.includes(DGS_MODE))
}

export function startStory(id: StoryId): string | null {
  const s = S()
  const story = STORIES.find((x) => x.id === id)
  if (!story) return `No story ${id}`
  s.setKnob?.('reliability', 'off')
  s.setSpeed?.(60)
  if (useSpares.getState().mode !== 'demo') sparesApi.setMode?.('demo')
  if (id === 'k2200-dgs') {
    const tag = TAGS.compressor
    // a clean start: no old jobs on the compressor, compressor running
    for (const w of useMaint.getState().wos) if (w.tag === tag && isOpen(w)) maint.cancel(w.id, 'superseded by the demo story')
    if (runOf(tag) === 'tripped') s.resetTrip?.(tag, { local: true })
    if (runOf(tag) !== 'running' && runOf(tag) !== 'starting') s.start?.(tag)
    // the cartridge is not on the island; the standard order placed weeks ago is months out
    const r0 = sparesApi.seedDgsShortage()
    if (r0) return r0
    // degradation just under the CM alert; ≈ 6 running hours (6 min at 60×) to functional failure
    const r = maint.seed(tag, 0.44, { pfH: 10.5, mode: DGS_MODE })
    if (r) return r
    // the condition-monitoring team raises the job off the trend. The repair is time-compressed for the
    // demo (3 h instead of ~9 h) like the logistics clock, so the whole story fits in a few minutes at 60×.
    maint.raise(tag, { type: 'condition', priority: 2, title: `CM: ${DGS_MODE}: replace the dry-gas seal cartridge`, by: 'Condition monitoring (trend)', estH: 3, workH: 3, failureMode: DGS_MODE, who: 'auto' })
    s.setKnob?.('seaState', Math.min(s.knobs?.seaState ?? 1.5, 2))
  }
  if (id === 'weather') {
    s.setKnob?.('seaState', 4.6)
    s.setKnob?.('wind', { from: s.knobs?.wind?.from ?? 300, speed: 16 })
  }
  s.record?.({ who: 'instructor', action: 'demoStory', detail: story.title })
  useStory.setState({ active: id, startedAt: s.t, note: story.pitch })
  useStore.getState().setHmi?.('economics')
  return null
}

export function stopStory() {
  const id = useStory.getState().active
  if (id === 'weather') {
    const s = S()
    s.setKnob?.('seaState', 1.5)
    s.setKnob?.('wind', { from: s.knobs?.wind?.from ?? 300, speed: 7 })
  }
  useStory.setState({ active: null, note: '' })
}

export const setAutoCrew = (on: boolean) => useStory.setState({ autoCrew: on })

// ================================================================= auto-crew

/** the parts for a work order are in the offshore store (or the job needs none) */
function kitted(w: WorkOrder) {
  const rs = useSpares.getState().reservations.filter((r) => r.wo === w.id)
  return rs.every((r) => r.kitted || r.issued)
}

let nextTry = 0
function step(_dt: number, t: number) {
  const st = useStory.getState()
  const story = STORIES.find((x) => x.id === st.active)
  if (!story?.tag || !st.autoCrew || t < nextTry) return
  nextTry = t + 20
  const m = useMaint.getState()
  for (const w of m.wos) {
    if (w.tag !== story.tag || !isOpen(w)) continue
    const p = w.permit ? m.permits[w.permit] : undefined
    const ready = kitted(w)
    let r: string | null = null
    if (w.status === 'raised') r = maint.approve(w.id)
    else if (w.status === 'approved' && ready) r = maint.plan(w.id)
    else if (w.status === 'planned' && p?.status === 'requested') {
      // a controlled stop before the isolation (planned outage: the gas goes to flare until the restart)
      const st = runOf(w.tag)
      if (st === 'running' || st === 'starting') {
        r = maint.stopMachine(w.tag)
        if (!r) note(`Auto-crew: ${w.tag} stopped for the planned repair: gas to flare until the restart`)
        continue
      }
      r = maint.issue(p.id)
    }
    else if (w.status === 'planned' && p?.status === 'issued') r = maint.confirm(p.id, 'all')
    else if (w.status === 'isolated') r = maint.startWork(w.id)
    else if (w.status === 'complete') r = maint.returnToService(w.id)
    else continue
    if (r) {
      if (!/nothing left|already/i.test(r)) note(`Auto-crew: ${r}`)
    } else note(`Auto-crew: ${w.id} ${w.status === 'raised' ? 'approved' : w.status === 'approved' ? 'planned' : w.status === 'complete' ? 'returned to service' : 'advanced'}`)
  }
  // back in service after the repair: restart the machine
  const tag = story.tag
  const done = m.wos.some((w) => w.tag === tag && w.status === 'returned' && (w.closedAt ?? 0) > st.startedAt)
  const st0 = runOf(tag)
  if (done && !m.wos.some((w) => w.tag === tag && isOpen(w)) && (st0 === 'stopped' || st0 === 'standby') && !S().lockouts?.[tag]) {
    const r = S().start?.(tag)
    note(r ? `Auto-crew: ${tag} not restarted: ${r}` : `Auto-crew: ${tag} restarting after the repair`)
  }
}

registerSimPlugin({ id: 'demoStory', step, reset: () => useStory.setState({ active: null, note: '' }) })
if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __story: { startStory, stopStory, useStory } })
