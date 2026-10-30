/**
 * Safety-twin contract: the shared vocabulary between the risk engine, the alert rules, the plant
 * assistant, the field workers, the CCTV / PPE detector and the console pages that show them.
 * Each producer owns one module (see docs/plans):
 *
 *   risk.ts        useRisk      live risk score per platform + contributors + history     (plan 02)
 *   alerts.ts      useAlerts    alert rules → alert outbox (email drafts) + trace steps   (plan 04)
 *   agentTools.ts  AGENT_TOOLS  read-only tools over the twin (future Muse Spark tool calls) (plan 04)
 *   assistant.ts   ask()        "ask the plant" — local planner today, Muse Spark later    (plan 04)
 *   workers.ts     useWorkers   simulated field workers + PPE flags (workerPose mutable)   (plan 06)
 *   cctv.ts        useCctv      cameras + simulated detections (SAM 3.1 seam)              (plan 07)
 *
 * Coordinates: plan x / z are deck-local metres (model/site.ts), y is deck-local height; world y is
 * deck-local + DECK_WORLD_Y (28). Time `t` is SIMULATED seconds (useSim.t), format with fmtClock(t).
 */
import type { PlatformId } from '../sim/types'
import type { Vec3 } from '../model/types'

// ---------------------------------------------------------------- risk (plan 02)

export type RiskBand = 'low' | 'moderate' | 'high' | 'critical'
/** score → band: < 25 low · < 50 moderate · < 75 high · ≥ 75 critical */
export const bandOf = (score: number): RiskBand => (score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'moderate' : 'low')
export const BAND_COLOR: Record<RiskBand, string> = { low: '#4caf7a', moderate: '#d6b23a', high: '#e08a2e', critical: '#e0453a' }

export type RiskCategory = 'process' | 'fireGas' | 'shutdown' | 'alarms' | 'machinery' | 'barriers' | 'work' | 'weather' | 'people'
export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  process: 'Process margins',
  fireGas: 'Fire & gas',
  shutdown: 'Shutdowns',
  alarms: 'Alarm load',
  machinery: 'Machinery health',
  barriers: 'Safety barriers (inhibits, faults)',
  work: 'Work & permits',
  weather: 'Weather & lifting',
  people: 'People & PPE',
}

/** one reason the risk is up — always explainable ("why is the risk 62?") */
export interface RiskContributor {
  /** stable id, e.g. `proc:hpLevel`, `alarm:<alarmId>`, `ppe:<workerId>` */
  id: string
  platform: PlatformId
  category: RiskCategory
  /** plant item it is about (for "Show in 3D" / "Walk to"), if any */
  tag?: string
  /** plain words, with the value: "HP separator level 79 % (LAHH 83 %)" */
  text: string
  /** risk points added (before the per-platform cap of 100) */
  points: number
}

export interface PlatformRisk {
  platform: PlatformId
  /** 0 … 100 */
  score: number
  band: RiskBand
  /** sorted by points, highest first */
  contributors: RiskContributor[]
}

export interface RiskSnapshot {
  t: number
  /** field risk: the worst platform, nudged up by the others (0 … 100) */
  field: number
  band: RiskBand
  platforms: Partial<Record<PlatformId, PlatformRisk>>
  /** every contributor on the field, highest first */
  contributors: RiskContributor[]
  /** availability now (kpis.availability, %) and whether the field is producing */
  availability: number
  producing: boolean
  /** latched shutdown levels by platform (copied from useSim.shutdowns) */
  shutdowns: Partial<Record<PlatformId, string>>
}

export interface RiskHistoryPoint {
  t: number
  field: number
  /** per-platform score */
  p: Partial<Record<PlatformId, number>>
  availability: number
}

// ---------------------------------------------------------------- alerts + traceability (plan 04)

export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertSource = 'risk' | 'alarm' | 'shutdown' | 'fireGas' | 'cctv' | 'machinery' | 'assistant'

/** an alert is delivered as an email (prototype: drafted into the outbox, not sent from the browser) */
export interface EmailDraft {
  to: string[]
  subject: string
  /** plain text body */
  text: string
}

export interface Alert {
  id: string
  t: number
  severity: AlertSeverity
  source: AlertSource
  /** alert rule id that raised it, e.g. `risk-band-up`, `p1-alarm`, `ppe-violation` */
  rule: string
  platform: PlatformId
  title: string
  /** what happened, why it matters, what to do — plain words */
  body: string
  /** plant items involved (first one is the "Walk to" target) */
  tags: string[]
  /** every step that led to this alert (observe → assess → decide → notify) */
  traceId: string
  email: EmailDraft
  /** queued = in the outbox; sent = delivered by the server channel (plan 09); suppressed = dedup / cooldown */
  status: 'queued' | 'sent' | 'suppressed' | 'failed'
  ack?: { t: number; by: string }
}

export type TraceActor = 'sensor' | 'rule' | 'risk' | 'cctv' | 'assistant' | 'operator' | 'model' | 'tool'
export type TraceKind = 'observe' | 'assess' | 'decide' | 'act' | 'notify' | 'answer'
/** one auditable step of a detection / decision / notification chain */
export interface TraceStep {
  id: string
  traceId: string
  t: number
  actor: TraceActor
  kind: TraceKind
  text: string
  /** evidence: values, tags, tool args / results */
  data?: Record<string, unknown>
}

// ---------------------------------------------------------------- plant assistant (plan 04)

/** a read-only tool over the twin — the same shape a Muse Spark tool call will use (plan 08) */
export interface AgentTool {
  name: string
  description: string
  /** JSON-schema-like parameter description */
  params: Record<string, { type: 'string' | 'number' | 'boolean'; description: string; required?: boolean }>
  run: (args: Record<string, unknown>) => unknown
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  t: number
  /** plant items mentioned in the answer (rendered as Show in 3D / Walk to chips) */
  tags?: string[]
  /** trace of the tool calls behind the answer */
  traceId?: string
}

// ---------------------------------------------------------------- field workers (plan 06)

export interface WorkerInfo {
  id: string
  name: string
  role: string
  /** walk level id (model/site.ts ALPHA_WALK ids, e.g. 'production') */
  level: string
  platform: PlatformId
  /** PPE worn — a missing item is a violation the CCTV detector can see */
  hardHat: boolean
  vest: boolean
  /** what they are doing, in words */
  task: string
}

/** live worker pose (mutable, updated every frame by scene/Workers.tsx — read it, don't copy it into React state) */
export interface WorkerPose {
  x: number
  z: number
  /** world y of the feet */
  footY: number
  yaw: number
  speed: number
}

// ---------------------------------------------------------------- CCTV / PPE detection (plan 07)

export interface CctvCamera {
  id: string
  name: string
  platform: PlatformId
  /** WORLD coordinates (deck-local + [0, 28, 0]) */
  pos: Vec3
  target: Vec3
  /** vertical field of view, degrees */
  fov: number
}

export type DetectionKind = 'person' | 'noHardHat' | 'noVest' | 'restrictedZone' | 'gasCloud' | 'fire'
export const DETECTION_LABEL: Record<DetectionKind, string> = {
  person: 'Person',
  noHardHat: 'No hard hat',
  noVest: 'No hi-vis vest',
  restrictedZone: 'Too close to running machinery',
  gasCloud: 'Gas cloud',
  fire: 'Flame',
}

export interface Detection {
  id: string
  t: number
  camera: string
  kind: DetectionKind
  workerId?: string
  /** restrictedZone: the running machine whose exclusion zone the person is in */
  tag?: string
  /** restrictedZone: distance from the machine's skid edge, m */
  dist?: number
  /** normalised image box [x0, y0, x1, y1] in 0 … 1 (origin top-left) */
  box: [number, number, number, number]
  confidence: number
  /** 'sim' today; 'sam-3.1' when the Modal detector is wired (plan 09) */
  model: 'sim' | 'sam-3.1'
}
