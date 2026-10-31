/**
 * The fixed list of things a next-action plan may ask for. A model never touches the plant: it names one of these, the checks here
 * prove it can apply to this plant, and the operator's confirm runs it through the same recorded controls as the console, so
 * the audit trail, scoring and handover all see it. Abandon platform is not on the list, on purpose.
 */
import { useScenario } from '../sim/scenarios'
import { fireZones } from '../sim/fg'
import type { ShutdownLevel } from '../sim/types'
import { usePlantStore } from '../state/plantStore'
import { runState, simTags, useSim } from '../state/sim'

export type PlantAction =
  | { kind: 'stop'; tag: string }
  | { kind: 'start'; tag: string }
  | { kind: 'closeValve'; tag: string }
  | { kind: 'openValve'; tag: string }
  | { kind: 'shutInWell'; tag: string }
  | { kind: 'shutdown'; level: 'PSD' | 'ESD2' | 'ESD1'; platform: string; zone?: string }
  | { kind: 'scenario'; id: string; label: string }
  | { kind: 'manual' }

export type Effect = 'met' | 'waiting' | 'failed'

const LEVELS: ShutdownLevel[] = ['USD', 'PSD', 'ESD2', 'ESD1', 'APS']
const PLATFORMS = ['Alpha', 'WHP-N', 'RP', 'WI', 'LQ']
const OPEN_AT = 0.95
const SHUT_AT = 0.05

/** does this plan step take something off line, so its button should look like it */
export const isDanger = (a: PlantAction) => a.kind === 'stop' || a.kind === 'closeValve' || a.kind === 'shutInWell' || a.kind === 'shutdown'

export function labelOf(a: PlantAction): string {
  switch (a.kind) {
    case 'stop':
      return `Shut down ${a.tag} here`
    case 'start':
      return `Start ${a.tag} here`
    case 'closeValve':
      return `Close ${a.tag} here`
    case 'openValve':
      return `Open ${a.tag} here`
    case 'shutInWell':
      return `Shut in ${a.tag} here`
    case 'shutdown':
      return `Initiate ${a.level} on ${a.zone ?? a.platform} here`
    case 'scenario':
      return a.label
    case 'manual':
      return 'Mark done'
  }
}

export const tagOf = (a: PlantAction) => ('tag' in a ? a.tag : null)

/** why this action can't apply to this plant, or null when it can */
export function checkAction(a: PlantAction | null | undefined): string | null {
  if (!a || typeof a !== 'object') return 'no action'
  const t = simTags()
  switch (a.kind) {
    case 'stop':
    case 'start':
      return t.machines.includes(a.tag) ? null : `${a.tag} is not a machine this console controls`
    case 'closeValve':
    case 'openValve':
      return t.valves.includes(a.tag) ? null : `${a.tag} is not an actuated valve`
    case 'shutInWell':
      return t.wells.includes(a.tag) ? null : `${a.tag} is not a well`
    case 'shutdown':
      if (a.level !== 'PSD' && a.level !== 'ESD2' && a.level !== 'ESD1') return `${String(a.level)} is not a level a plan may ask for: use PSD, ESD2 or ESD1`
      if (!PLATFORMS.includes(a.platform)) return `${a.platform} is not a platform`
      if (a.level === 'ESD2' && !fireZones(usePlantStore.getState().plant).some((z) => z.id === a.zone)) return `ESD2 needs a fire zone, and ${a.zone ?? 'none'} is not one`
      return null
    case 'scenario':
      return useScenario.getState().live?.actions.some((x) => x.id === a.id && x.available) ? null : `${a.id} is not an action of the running scenario`
    case 'manual':
      return null
    default:
      return `unknown action ${String((a as { kind?: unknown }).kind)}`
  }
}

/** the operator confirmed: run it. Returns the plant's refusal, or null */
export function perform(a: PlantAction): string | null {
  const s = useSim.getState()
  switch (a.kind) {
    case 'stop':
      return s.stop(a.tag)
    case 'start':
      return s.start(a.tag)
    case 'closeValve':
      return s.setValve(a.tag, 'closed')
    case 'openValve':
      return s.setValve(a.tag, 'open')
    case 'shutInWell':
      s.setWell(a.tag, false)
      return null
    case 'shutdown':
      s.initiate(a.level, a.platform as Parameters<typeof s.initiate>[1], a.zone)
      return null
    case 'scenario':
      return useScenario.getState().order(a.id)
    case 'manual':
      return null
  }
}

/** has the plant done what the action asks? This reads the plant, not the command, so a stuck valve shows as failed */
export function effectOf(a: PlantAction): Effect {
  const s = useSim.getState()
  switch (a.kind) {
    case 'stop': {
      const st = runState(a.tag)
      return st === 'running' || st === 'starting' ? 'waiting' : 'met'
    }
    case 'start': {
      const st = runState(a.tag)
      return st === 'running' ? 'met' : st === 'tripped' ? 'failed' : 'waiting'
    }
    case 'closeValve':
    case 'openValve': {
      const v = s.valves[a.tag]
      if (!v) return 'failed'
      if (a.kind === 'closeValve' ? v.pos <= SHUT_AT : v.pos >= OPEN_AT) return 'met'
      return v.fault === 'stuck' ? 'failed' : 'waiting'
    }
    case 'shutInWell':
      return s.knobs.wellOnline?.[a.tag] === false ? 'met' : 'waiting'
    case 'shutdown':
      return s.shutdowns.some((x) => !x.resetAt && x.platform === a.platform && LEVELS.indexOf(x.level) >= LEVELS.indexOf(a.level)) ? 'met' : 'waiting'
    case 'scenario':
      return 'met'
    case 'manual':
      return 'waiting'
  }
}

/** a step the plant already satisfies needs no button */
export const inPlace = (a: PlantAction) => a.kind !== 'manual' && a.kind !== 'scenario' && effectOf(a) === 'met'
