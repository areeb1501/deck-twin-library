/**
 * Read-only access to the F&G part of the live simulation for the mapping views (overlay, panel,
 * gas cloud). Every field may be missing while the simulation is being rebuilt, so all reads are
 * guarded, and selectors return module-level constants or strings (stable for zustand).
 *
 * Not imported by sim/fg.ts (sim.ts imports fg.ts: keep that free of the store).
 */
import { useSim } from '../../state/sim'
import type { DetectorSim, Incident, SimState, ZoneStatus } from '../types'
import { DEFAULT_WIND, type Wind } from '../fg'

export type LiveFg = Partial<Pick<SimState, 't' | 'fg' | 'detectors' | 'inhibits' | 'incidents' | 'knobs' | 'inhibit'>>

const EMPTY_FG: Record<string, ZoneStatus> = {}
const EMPTY_DET: Record<string, DetectorSim> = {}
const EMPTY_INH: Record<string, boolean> = {}
const EMPTY_INC: Incident[] = []

export const liveOf = (s: unknown) => s as LiveFg
export const getLive = () => liveOf(useSim.getState())

export const useZoneStatus = () => useSim((s) => liveOf(s).fg ?? EMPTY_FG)
export const useDetectorStates = () => useSim((s) => liveOf(s).detectors ?? EMPTY_DET)
export const useInhibits = () => useSim((s) => liveOf(s).inhibits ?? EMPTY_INH)
export const useIncidents = () => useSim((s) => liveOf(s).incidents ?? EMPTY_INC)

/** tags out of service (inhibited or faulted), as a sorted "|"-joined key */
export function excludedKey(s: unknown): string {
  const l = liveOf(s)
  const out: string[] = []
  for (const [t, on] of Object.entries(l.inhibits ?? EMPTY_INH)) if (on) out.push(t)
  for (const [t, d] of Object.entries(l.detectors ?? EMPTY_DET)) if (d.state === 'fault' || d.state === 'inhibited') out.push(t)
  return [...new Set(out)].sort().join('|')
}
export const useExcludedKey = () => useSim(excludedKey)
export const keySet = (k: string) => new Set(k ? k.split('|') : [])

/** current wind as a "from|speed" key (stable) */
export const windKeyOf = (s: unknown) => {
  const w = liveOf(s).knobs?.wind ?? DEFAULT_WIND
  return `${Math.round(w.from)}|${Math.round(w.speed * 10) / 10}`
}
export const useWind = (): Wind => {
  const k = useSim(windKeyOf)
  const [from, speed] = k.split('|').map(Number)
  return { from, speed }
}
export const getWind = (): Wind => getLive().knobs?.wind ?? DEFAULT_WIND

/** detectors in alarm as "tag:low|tag:high" (stable key) */
export function alarmKey(s: unknown): string {
  const out: string[] = []
  for (const [t, d] of Object.entries(liveOf(s).detectors ?? EMPTY_DET)) if (d.state === 'low' || d.state === 'high') out.push(`${t}:${d.state}`)
  return out.sort().join('|')
}

export function setInhibit(tag: string, on: boolean) {
  getLive().inhibit?.(tag, on)
}
