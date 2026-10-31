/**
 * Scenario specs: a training scenario as plain JSON, so a model can write one and localStorage can keep one. A built-in
 * scenario (sim/scen/library.ts) holds closures; a spec holds the same things as data, in a fixed vocabulary of conditions
 * and effects. Nothing a model returns is ever run as code: sim/scen/validate.ts checks a spec against the loaded plant and
 * sim/scen/compile.ts turns it into an ordinary Scenario, which then runs, scores and debriefs like any other.
 */
import type { Knobs, PlatformId, ShutdownLevel } from '../types'
import { chokeFactor } from './helpers'
import type { Ctx, Difficulty, Objective, ScenarioCategory, ScoreCategory } from './types'

export const SPEC_VERSION = 1

export type Cmp = '<' | '<=' | '>' | '>='
export const CMP: Cmp[] = ['<', '<=', '>', '>=']

/** live numbers a condition can read */
export const METRICS: Record<string, { read: (c: Ctx) => number | undefined; unit: string; note: string }> = {
  hpLevel: { read: (c) => c.s.process?.hpLevel, unit: '%', note: 'V-1100 liquid level. Normal 52, LAH 72, LAHH 83.3 (PSD)' },
  hpPressure: { read: (c) => c.s.process?.hpPressure, unit: 'barg', note: 'V-1100 pressure. Normal 35, PAH 38, PAHH 40 (PSD), PSV 42' },
  lpLevel: { read: (c) => c.s.process?.lpLevel, unit: '%', note: 'V-1300 level' },
  iaPressure: { read: (c) => c.s.process?.iaPressure, unit: 'barg', note: 'instrument air header. Normal 8.6, PAL 6.5, PALL 5.5 (PSD)' },
  cmTemp: { read: (c) => c.s.process?.cmTemp, unit: '°C', note: 'cooling medium. Normal 32, high 45, high-high 55 trips K-2200' },
  surgeMargin: { read: (c) => c.s.process?.surgeMargin, unit: '%', note: 'K-2200 surge margin. Below 10 the anti-surge valve opens' },
  fuelGasPressure: { read: (c) => c.s.process?.fuelGasPressure, unit: 'barg', note: 'fuel gas header. 0 means the turbines are on diesel' },
  fwPressure: { read: (c) => c.s.process?.fwPressure, unit: 'barg', note: 'firewater ring main' },
  blowdownInventory: { read: (c) => c.s.process?.blowdownInventory, unit: 'MMscf', note: 'gas inventory left to blow down' },
  reservoir: { read: (c) => c.s.process?.reservoir, unit: 'ratio', note: 'reservoir pressure support, 1 = initial' },
  wiRate: { read: (c) => c.s.process?.wiRate, unit: 'bwpd', note: 'water injected. Normal 40000' },
  oilExport: { read: (c) => c.s.result?.oilExport, unit: 'bbl/d', note: 'oil exported. Normal about 49000' },
  gasExport: { read: (c) => c.s.result?.gasExport, unit: 'MMscfd', note: 'gas exported' },
  flare: { read: (c) => c.s.result?.flare, unit: 'MMscfd', note: 'gas flared' },
  powerAvailable: { read: (c) => c.s.result?.powerAvailable, unit: 'MW', note: 'generation available. 25 per turbine' },
  powerDemand: { read: (c) => c.s.result?.powerDemand, unit: 'MW', note: 'electrical demand' },
  efficiency: { read: (c) => c.s.result?.efficiency, unit: '%', note: 'production efficiency right now' },
  chokeFactor: { read: (c) => chokeFactor(c.s, c.plant), unit: 'ratio', note: 'share of potential the chokes allow, 1 = every well at the reference 60 % choke. However the operator cut it' },
  compressorSpeed: { read: (c) => c.s.knobs?.compressorSpeed, unit: '%', note: 'K-2200 speed setting. Normal 92' },
  windSpeed: { read: (c) => c.s.knobs?.wind?.speed, unit: 'm/s', note: 'wind speed. Crane lifting limit 15' },
}

export type MachineState = 'on' | 'running' | 'tripped' | 'off'
export type GasLevel = 'low' | 'high' | 'confirmed'
export type FlameLevel = 'single' | 'confirmed'

/** a condition on the live plant or on the attempt so far */
export type Cond =
  | { is: 'all'; of: Cond[] }
  | { is: 'any'; of: Cond[] }
  | { is: 'not'; cond: Cond }
  | { is: 'metric'; metric: string; op: Cmp; value: number }
  | { is: 'machine'; tag: string; state: MachineState }
  | { is: 'valve'; tag: string; op: Cmp; value: number }
  | { is: 'shutdown'; platform?: PlatformId; level?: ShutdownLevel; atLeast?: ShutdownLevel; cause?: string; zone?: string }
  | { is: 'anyShutdown'; platform: PlatformId }
  | { is: 'restarted'; platform: PlatformId; oil?: number }
  | { is: 'fired'; step: string; after?: number }
  | { is: 'ordered'; action: string }
  | { is: 'completed'; action: string }
  | { is: 'acked'; tag: string }
  | { is: 'raised'; tag: string }
  | { is: 'gas'; level: GasLevel; zone?: string; incident?: string }
  | { is: 'gasClear'; zone?: string; incident?: string }
  | { is: 'flame'; level: FlameLevel; zone: string }
  | { is: 'deluge'; zone: string }
  | { is: 'incident'; incident: string }
  | { is: 'fireBurning' }
  | { is: 'operatorDid'; tag: string; action: string }
  | { is: 'elapsed'; seconds: number }

/** something the scenario does to the plant. `key` names the incident so conditions and `clear` can find it */
export type Effect =
  | { do: 'trip'; tag: string; cause: string; local?: boolean; repairH?: number; key?: string }
  | { do: 'gasRelease'; at: string; rateKgS: number; dy?: number; label?: string; key?: string }
  | { do: 'fire'; at: string; sizeMW: number; dy?: number; label?: string; key?: string }
  | { do: 'valveStuck'; tag: string; key?: string }
  | { do: 'levelControlFail'; tag: string; key?: string }
  | { do: 'antiSurgeFail'; key?: string }
  | { do: 'instrumentAirFail'; key?: string }
  | { do: 'coolingFail'; key?: string }
  | { do: 'exportBlocked'; key?: string }
  | { do: 'detectorFault'; tag: string; key?: string }
  | { do: 'clear'; incident: string }
  | { do: 'setValve'; tag: string; cmd: 'open' | 'closed' }
  | { do: 'setChokes'; to: number; wells?: string[] }
  | { do: 'setWell'; tag: string; online: boolean }
  | { do: 'setKnob'; knob: SpecKnob; value: unknown }
  | { do: 'shutdown'; level: ShutdownLevel; platform: PlatformId; zone?: string; reason: string }
  | { do: 'resetTrip'; tag: string; local?: boolean }
  | { do: 'start'; tag: string }
  | { do: 'stop'; tag: string }
  | { do: 'inhibit'; tag: string }
  | { do: 'note'; text: string }

export const SPEC_KNOBS = ['wind', 'seaState', 'compressorSpeed', 'autoChangeover', 'drilling', 'hpPressure'] as const
export type SpecKnob = (typeof SPEC_KNOBS)[number]
export const OPERATOR_ACTIONS = ['start', 'stop', 'resetTrip', 'localReset', 'setValve', 'setChoke', 'setWell', 'setKnob', 'initiate', 'resetShutdown', 'restart', 'inhibit', 'shelve', 'ack', 'ackAll']

export interface StepSpec {
  id: string
  /** shown in the debrief, hidden while running */
  label?: string
  at?: number
  after?: { step: string; seconds: number }
  when?: Cond
  only?: Cond
  do?: Effect[]
  ramp?: { seconds: number; target: 'chokes' | 'compressorSpeed' | 'windSpeed'; from: number; to: number; wells?: string[] }
}

export interface GoalSpec {
  id: string
  text: string
  kind: Objective['kind']
  category: ScoreCategory
  from?: string
  window?: number
  deadline?: number
  check: Cond
  penalty?: number
  critical?: boolean
  optional?: boolean
  reason?: string
  lesson?: string
}

export const BUILTIN_ACTIONS = ['muster', 'pob', 'hotwork'] as const
export type BuiltinAction = (typeof BUILTIN_ACTIONS)[number]

export type ActionSpec =
  | { builtin: BuiltinAction }
  | {
      id: string
      label: string
      who: 'operator' | 'field'
      delay?: number
      available?: Cond
      detail?: string
      do?: Effect[]
      /** the first entry whose `when` holds is the report line */
      reports?: { when?: Cond; text: string }[]
    }

export interface ScenarioSpec {
  version: number
  /** set when the scenario is saved, never by a model */
  id?: string
  title: string
  difficulty: Difficulty
  category: ScenarioCategory
  platforms: string[]
  summary: string
  objectives: string[]
  briefing: string[]
  expected: string[]
  hints: string[]
  setup?: {
    knobs?: Partial<Pick<Knobs, SpecKnob>>
    chokes?: number | Record<string, number>
    do?: Effect[]
  }
  timeline: StepSpec[]
  goals: GoalSpec[]
  actions?: ActionSpec[]
  complete?: Cond
  settle?: number
  maxDuration: number
  ideal: { deferredBoe: number; note: string }
}

/** every effect that upsets the plant: a scenario with none of these has nothing for the trainee to respond to */
export const UPSETS: Effect['do'][] = ['trip', 'gasRelease', 'fire', 'valveStuck', 'levelControlFail', 'antiSurgeFail', 'instrumentAirFail', 'coolingFail', 'exportBlocked', 'detectorFault', 'shutdown', 'setValve', 'setChokes', 'setWell']
export const LEVELS: ShutdownLevel[] = ['USD', 'PSD', 'ESD2', 'ESD1', 'APS']
export const PLATFORMS: PlatformId[] = ['Alpha', 'WHP-N', 'RP', 'WI', 'LQ']
export const CATEGORIES: ScenarioCategory[] = ['process', 'machinery', 'power', 'utilities', 'fire & gas', 'export', 'combined']
export const DIFFICULTIES: Difficulty[] = ['foundation', 'intermediate', 'advanced']
export const SCORE_CATEGORIES: ScoreCategory[] = ['safety', 'production', 'time', 'alarms']
