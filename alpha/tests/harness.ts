/**
 * Shared test harness: loads the same simulation plugins as src/App.tsx and drives the real engine on its
 * virtual clock. Shutdown and alarm ids survive reset(), so tests read levels and causes, never ids.
 */
import '../src/sim/cranes'
import '../src/sim/scenarios'
import '../src/sim/maintenance'
import '../src/safety/risk'
import '../src/safety/alerts'
import '../src/safety/inspection'
import '../src/sim/spares'
import '../src/sim/finance'
import '../src/sim/insights'
import '../src/sim/demoStory'
import { detectors, type DetectorType } from '../src/sim/fg'
import type { Fault } from '../src/sim/types'
import { usePlantStore } from '../src/state/plantStore'
import { useSim } from '../src/state/sim'

export const sim = () => useSim.getState()

/** advance the virtual clock by `seconds` simulated seconds; the engine always integrates in 1 s steps */
export function run(seconds: number, step = 1) {
  for (let done = 0; done < seconds; done += step) sim().tick(step)
}

/** a new session with one tick done: the alert rules seed on that tick, so they only see what changes next */
export function fresh() {
  sim().reset()
  sim().tick(1)
}

export const latched = () => sim().shutdowns.filter((s) => !s.resetAt)
export const hasShutdown = (level: string, platform: string, causeId: string) => latched().some((s) => s.level === level && s.platform === platform && s.causeId === causeId)
export const closedValves = () => new Set(Object.entries(sim().valves).filter(([, v]) => v.cmd === 'closed').map(([tag]) => tag))
export const stoppedMachines = () => new Set(Object.entries(sim().status).filter(([, s]) => s === 'stopped').map(([tag]) => tag))

/** reset every latched shutdown; returns the refusals */
export function resetAll() {
  return latched().map((s) => sim().resetShutdown(s.id)).filter((why) => why !== null)
}

/** what `fault` reads on every detector of `types`, from a dry run with all of them out of the vote */
export function dryRun(fault: Fault, types: DetectorType[], seconds = 30) {
  fresh()
  voteOnly(types, [])
  sim().inject(fault)
  run(seconds)
  const seen = alphaDetectors(types).map((d) => ({ ...d, value: sim().detectors[d.tag]?.value ?? 0 }))
  fresh()
  return seen
}

/** take every detector of `types` out of the vote except `keep` */
export function voteOnly(types: DetectorType[], keep: string[]) {
  for (const d of alphaDetectors(types)) if (!keep.includes(d.tag)) sim().inhibit(d.tag, true)
}

const alphaDetectors = (types: DetectorType[]) => detectors(usePlantStore.getState().plant).filter((d) => types.includes(d.type))

export const positionOf = (tag: string) => usePlantStore.getState().plant.equipment.find((e) => e.tag === tag)!.position
