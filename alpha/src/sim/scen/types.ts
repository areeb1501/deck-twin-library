/**
 * Training scenario model (operator training simulator). A scenario is DATA plus a few predicates on
 * the simulation state: initial conditions (setup), a timeline of injections at sim times or on
 * conditions, the operator actions expected of the trainee (with time windows), the things to avoid,
 * and a production baseline for an ideal response. The runner (sim/scenarios.ts) steps it as a
 * SimPlugin and scores the attempt (sim/scen/scoring.ts).
 *
 * All times are SIMULATED seconds since the scenario started ("elapsed").
 */
import type { Plant } from '../../model/types'
import type { Fault, Knobs, OperatorAction, SimState } from '../types'

export type Difficulty = 'foundation' | 'intermediate' | 'advanced'
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { foundation: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced' }
export type ScenarioCategory = 'process' | 'machinery' | 'power' | 'utilities' | 'fire & gas' | 'export' | 'combined'

/** what a scenario's predicates and scripts see */
export interface Ctx {
  /** live simulation state (contract fields may be missing on an older engine — guard) */
  s: SimState
  plant: Plant
  /** sim seconds since the scenario started */
  el: number
  /** sim time the scenario started at */
  t0: number
  /** elapsed time each timeline step / mark fired at */
  mark: Record<string, number>
  /** scenario scratch space (chosen release point, incident ids …) */
  data: Record<string, unknown>
  /** CCR / field decisions the trainee has ordered (scenario actions), elapsed time of the first order;
   *  `${id}:done` when its outcome came in */
  did: Record<string, number>
  /** every alarm raised since the start, with when it was first acknowledged */
  alarms: TrackedAlarm[]
  /** the trainee's audit-trail actions since the start (operator / field), oldest first — kept incrementally */
  ops: OperatorAction[]
  /** inject a fault as the scenario (audit trail who = 'scenario'); returns the incident id */
  inject: (f: Fault) => string
  /** call engine actions as the scenario */
  act: <T>(fn: (g: SimState) => T) => T
  /** a line in the scenario's own log (shown in the debrief timeline) */
  note: (text: string) => void
}

export interface TrackedAlarm {
  id: string
  tag: string
  text: string
  priority: 1 | 2 | 3
  /** elapsed */
  raisedAt: number
  ackAt?: number
  shelved?: boolean
  last: string
}

/** a timeline step: an injection (or a pure mark when it has no `run`) */
export interface Step {
  id: string
  /** what happens, for the debrief (hidden from the trainee while running) */
  label?: string
  /** fire at this elapsed time … */
  at?: number
  /** … or this long after another step / mark fired */
  after?: [string, number]
  /** … or as soon as this is true (combined with at / after: once due AND true) */
  when?: (c: Ctx) => boolean
  /** evaluated when due: false skips the step for good (e.g. "only if the operator has not isolated yet") */
  only?: (c: Ctx) => boolean
  run?: (c: Ctx) => void
  /** keep applying for `dur` seconds after firing (a ramp), frac 0 … 1 */
  ramp?: { dur: number; apply: (c: Ctx, frac: number) => void }
}

export type ScoreCategory = 'safety' | 'production' | 'time' | 'alarms'

export interface Objective {
  id: string
  /** checklist text, imperative ("Start GT-8100B") */
  text: string
  /**
   * do: something the trainee must achieve (time-scored when it has a window);
   * avoid: something that must not happen (`check` true = violated).
   */
  kind: 'do' | 'avoid'
  category: ScoreCategory
  /** window measured from this step / mark (default: scenario start); the objective is shown from then on */
  from?: string
  /** do: full credit within this many seconds of `from` */
  window?: number
  /** do: missed (zero credit) after this many seconds of `from`; default 3 × window, or never */
  deadline?: number
  check: (c: Ctx) => boolean
  /** safety points lost when violated (avoid) or missed (do, category safety) */
  penalty?: number
  /** failing it fails the attempt */
  critical?: boolean
  /** not counted as a failure when missed (nice to have) */
  optional?: boolean
  /** debrief text when it went wrong */
  reason?: string
  /** the teaching point */
  lesson?: string
  weight?: number
}

/** a CCR decision or a field-operator task the trainee can order from the scenario panel */
export interface ScenarioAction {
  id: string
  label: string
  who: OperatorAction['who']
  /** sim seconds until the outcome (field operator travel + work) */
  delay?: number
  available?: (c: Ctx) => boolean
  /** what happens when it is done; return a report line (e.g. what the field operator found) */
  run?: (c: Ctx) => string | void
  /** tooltip */
  detail?: string
}

export interface Scenario {
  id: string
  /** library order number */
  n: number
  title: string
  difficulty: Difficulty
  category: ScenarioCategory
  /** platforms involved (filters) */
  platforms: string[]
  summary: string
  objectives: string[]
  /** initial conditions, as told at the shift handover */
  briefing: string[]
  /** what the trainee is expected to do (shown in the briefing as "your job") */
  expected: string[]
  hints: string[]
  /** plant items the scenario needs (missing → unavailable in this plant) */
  requires?: { tags: string[]; why: string }
  setup?: {
    knobs?: Partial<Pick<Knobs, 'wind' | 'autoChangeover' | 'compressorSpeed' | 'drilling' | 'seaState' | 'hpPressure'>>
    /** all well chokes (number) or per well */
    chokes?: number | Record<string, number>
    run?: (c: Ctx) => void
  }
  timeline: Step[]
  goals: Objective[]
  actions?: ScenarioAction[]
  /** the scenario is over early once this holds for `settle` seconds (default 120) */
  complete?: (c: Ctx) => boolean
  settle?: number
  maxDuration: number
  /**
   * ideal response: barrels (boe) deferred over the attempt — the production score baseline, calibrated
   * from the scripted good response (tools/scenarios.mjs)
   */
  ideal: { deferredBoe: number; note: string }
}

export type ObjStatus = 'waiting' | 'active' | 'done' | 'late' | 'missed' | 'failed' | 'kept' | 'na'

export interface ObjState {
  id: string
  status: ObjStatus
  /** elapsed when it became active / was done / failed */
  since?: number
  at?: number
}

export interface TimelineRow {
  t: number
  lane: 'plant' | 'operator' | 'expected' | 'scenario'
  text: string
  level?: 'info' | 'warn' | 'trip' | 'ok' | 'bad'
}

export interface KpiSnap {
  t: number
  oil: number
  gas: number
  flare: number
  peNow: number
  pe: number
  availability: number
  trips: number
  shutdowns: number
  alarmRate: number
  produced: number
  potential: number
  losses: Record<string, number>
  latched: string[]
}

export interface Breakdown {
  safety: number
  production: number
  time: number
  alarms: number
  hints: number
}

export interface Attempt {
  id: string
  scenarioId: string
  title: string
  /** wall clock, ISO */
  date: string
  /** sim seconds the attempt ran */
  duration: number
  aborted?: string
  score: number
  pass: boolean
  breakdown: Breakdown
  failures: string[]
  wentWell: string[]
  improve: string[]
  objectives: { id: string; text: string; kind: Objective['kind']; status: ObjStatus; at?: number; window?: number; from?: number }[]
  timeline: TimelineRow[]
  /** elapsed time each timeline step fired at */
  marks?: Record<string, number>
  before: KpiSnap
  after: KpiSnap
  window: { pe: number; deferred: number; idealDeferred: number; /** losing everything for the max duration */ fullLoss: number; byCategory: Record<string, number> }
  alarms: { p1: number; p1Late: number; p2: number; p2Late: number; shelvedP1: number; meanAckS: number | null }
  hintsUsed: number
}
