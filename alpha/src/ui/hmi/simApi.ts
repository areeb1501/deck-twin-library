/**
 * HMI ↔ simulation adapter. Every HMI read goes through `useS` (the store typed as the `SimState`
 * contract in sim/types.ts) and every action through `call` / the machine helpers, so the console
 * works whatever stage the engine (state/sim.ts) is at: missing fields read as undefined (guard them),
 * missing actions return "Simulation engine not ready" instead of throwing.
 *
 * Zustand v5 + React 19: selectors must return stable values — use the EMPTY_* constants as
 * fallbacks and derive lists with useMemo outside the selector.
 */
import type { StoreApi, UseBoundStore } from 'zustand'
import * as simModule from '../../state/sim'
import type { CauseEffectRow, PlatformId, RunState, SimState } from '../../sim/types'
import type { Equipment, Plant } from '../../model/types'

export const useS = simModule.useSim as unknown as UseBoundStore<StoreApi<SimState>>
export const sim = () => useS.getState() as Partial<SimState>

export const EMPTY_ARR: never[] = []
export const EMPTY_OBJ: Record<string, never> = {}

export const NOT_READY = 'Simulation engine not ready'

type Args<K extends keyof SimState> = SimState[K] extends (...a: infer A) => unknown ? A : never

/** call a sim action by name; returns the refusal / result string, or null on plain success */
export function call<K extends keyof SimState>(k: K, ...args: Args<K>): string | null {
  const fn = sim()[k]
  if (typeof fn !== 'function') return NOT_READY
  const r = (fn as (...a: unknown[]) => unknown)(...args)
  return typeof r === 'string' ? r : null
}
export const has = (k: keyof SimState) => typeof sim()[k] === 'function'

// ---------------------------------------------------------------- machines

/** rotating machines of a plant (pumps, compressors, turbines, caisson pumps, the rig) */
const ROTATING = new Set(['pumpPackage', 'compressorPackage', 'gasTurbineGenerator', 'caissonPump'])
export function machinesOf(plant: Plant): Equipment[] {
  return plant.equipment.filter((e) => ROTATING.has(e.kind) || e.tag === 'DR-100')
}

const ext = simModule as unknown as { runState?: (tag: string) => RunState }
/** run state of a machine: explicit status, the engine's default, or the duty/standby convention */
export function runOf(s: Partial<SimState>, tag: string): RunState {
  const st = s.status?.[tag]
  if (st) return st
  if (typeof ext.runState === 'function') {
    try {
      return ext.runState(tag)
    } catch {
      /* fall through */
    }
  }
  return /^P-7101/.test(tag) || /B$/.test(tag) ? 'standby' : 'running'
}

export function startMachine(tag: string): string | null {
  if (has('start')) return call('start', tag)
  return has('setStatus') ? call('setStatus', tag, 'running') : NOT_READY
}
export function stopMachine(tag: string): string | null {
  if (has('stop')) return call('stop', tag)
  return has('setStatus') ? call('setStatus', tag, 'standby') : NOT_READY
}
export function resetMachine(tag: string, local = false): string | null {
  if (has('resetTrip')) return call('resetTrip', tag, local ? { local: true } : undefined)
  return has('setStatus') ? call('setStatus', tag, 'standby') : NOT_READY
}

// ---------------------------------------------------------------- optional modules (may not exist yet)

/** cause & effect matrix (sim/causeEffect.ts, being written) — empty until the file exists */
const ceMods = import.meta.glob<{ CAUSE_EFFECT?: CauseEffectRow[] }>('../../sim/causeEffect.ts', { eager: true })
export function causeEffect(): CauseEffectRow[] {
  const m = Object.values(ceMods)[0]
  return Array.isArray(m?.CAUSE_EFFECT) ? m.CAUSE_EFFECT : EMPTY_ARR
}

// ---------------------------------------------------------------- formatting

export const fmt = (v: number | undefined | null, d = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }) : '—'

export const PLATFORMS: PlatformId[] = ['Alpha', 'WHP-N', 'RP', 'WI', 'LQ']
