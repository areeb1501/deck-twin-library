/**
 * Non-reactive readers of the plant simulation for the 3D effects (valve positions, flare, deluge,
 * general alarm). Everything goes through `simNow()`, typed by the shared contract (sim/types.ts) and
 * guarded with `?.` / `??` so the scene runs on an engine that doesn't (yet) fill every field.
 * Call these from useFrame — never subscribe React components to them per tick.
 */
import type { PlatformId, PlatformResult, SimState, ValveSim } from '../../sim/types'
import { useSim } from '../../state/sim'

export const simNow = () => useSim.getState() as unknown as Partial<SimState>

/** the simulation's record of a valve, if it operates it */
export const simValve = (tag: string): ValveSim | undefined => simNow().valves?.[tag]

/** valve travel 0 (closed) … 1 (open): the simulation's position, else the valve's normal position */
export function valvePos(tag: string, normally: 'open' | 'closed' | undefined): number {
  const v = simValve(tag)
  if (v && Number.isFinite(v.pos)) return Math.min(1, Math.max(0, v.pos))
  return normally === 'closed' ? 0 : 1
}

/** total flare rate, MMscfd (never below the purge / pilot rate) */
export const PURGE_MMSCFD = 0.4
export function flareRate(): number {
  const q = simNow().result?.flare
  return Math.max(PURGE_MMSCFD, Number.isFinite(q) ? (q as number) : PURGE_MMSCFD)
}

export function platformGa(pid: PlatformId): PlatformResult['ga'] {
  return simNow().result?.platforms?.[pid]?.ga ?? 'normal'
}

export function zoneDeluge(zone: string | null | undefined): boolean {
  if (!zone) return false
  return !!simNow().fg?.[zone]?.deluge
}

/** firewater ring pressure, barg (undefined = the engine doesn't model it: assume pressurised) */
export const fwPressure = (): number | undefined => {
  const p = simNow().process?.fwPressure
  return Number.isFinite(p) ? p : undefined
}

/** blowdown inventory left, MMscf (undefined if not modelled) */
export const blowdownInventory = (): number | undefined => {
  const b = simNow().process?.blowdownInventory
  return Number.isFinite(b) ? b : undefined
}

/** run state of a machine as the simulation records it (undefined = its default) */
export const simStatus = (tag: string) => simNow().status?.[tag]
