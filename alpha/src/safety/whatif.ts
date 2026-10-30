/**
 * What-if: the predicted consequence chain of a training scenario, BEFORE it is run (plan 03).
 *
 *   initiating event → alarms → shutdown level → platforms lost → production deferred →
 *   availability hit → recovery time
 *
 * The prediction is the UNMITIGATED case: what the plant does if nobody intervenes (the scenario's own
 * timeline + the cause & effect matrix). The "ideal" deferred barrels come from the scenario's scored
 * good response (`scenario.ideal.deferredBoe`), so the gap between the two is what the operator saves.
 *
 * Hand-mapped per scenario (there are 12; explicit is clearer than text matching): the worst shutdown,
 * the C&E rows that fire, the production share lost and the escalation steps that the scenario only
 * marks by condition (LAH / LAHH / PALL / TAHH …), timed from the figures quoted in each summary.
 * Labelled injection steps are read from `scenario.timeline` (`at` / `after` resolved to elapsed time).
 */
import { useSim } from '../state/sim'
import { CE_BY_ID } from '../sim/causeEffect'
import { fmtEl } from '../sim/scen/helpers'
import { FIELD_PLATFORMS, type PlatformId, type ShutdownLevel } from '../sim/types'
import type { Scenario, Step } from '../sim/scen/types'

export type ChainLevel = 'info' | 'warn' | 'trip'
export type ChainKind = 'event' | 'alarm' | 'trip' | 'effect' | 'recovery'
export type WorstLevel = ShutdownLevel | 'alarm'

export interface ChainStep {
  /** "T+01:30" (elapsed since the scenario starts) */
  t: string
  text: string
  level: ChainLevel
  /** elapsed seconds (for layout / sorting) */
  sec: number
  kind: ChainKind
  /** only happens if the operator does not intervene */
  ifUnmitigated?: boolean
  /** C&E row id behind an effect / trip */
  ce?: string
}

export interface Consequence {
  scenarioId: string
  initiating: string
  chain: ChainStep[]
  worstShutdown: WorstLevel
  platforms: PlatformId[]
  /** platforms whose production is lost (an Alpha PSD takes WHP-N with it) */
  lost: PlatformId[]
  deferredBoe: { ideal: number; unmitigated: number }
  /** outage hours ÷ 24 h × 100 (1-day window); USD / alarm do not take the field down → 0 */
  availabilityHitPct: number
  /** 0 … 100 estimate from the worst shutdown */
  riskPeak: number
  recovery: string
  /** what stops escalation (scenario.expected) */
  barriers: string[]
  /** outage hours used for the deferred / availability estimate */
  outageH: number
  /** share of field production lost during the outage (0 … 1) */
  share: number
  /** mpp used (boe/d) */
  mpp: number
}

/** escalation ladder, lowest first (UI) */
export const WORST_LADDER: WorstLevel[] = ['alarm', 'USD', 'PSD', 'ESD2', 'ESD1', 'APS']
export const WORST_LABEL: Record<WorstLevel, string> = {
  alarm: 'Alarm only',
  USD: 'Unit shutdown',
  PSD: 'Process shutdown',
  ESD2: 'Zone ESD',
  ESD1: 'Platform ESD',
  APS: 'Abandon platform',
}
export const RISK_PEAK: Record<WorstLevel, number> = { alarm: 35, USD: 45, PSD: 55, ESD2: 75, ESD1: 90, APS: 100 }
/** typical outage before production is back, hours */
export const OUTAGE_H: Record<WorstLevel, number> = { alarm: 0.5, USD: 1, PSD: 2, ESD2: 4, ESD1: 8, APS: 24 }
/** levels that take the field down (availability counts PSD / ESD / blackout only) */
const DOWN: Record<WorstLevel, boolean> = { alarm: false, USD: false, PSD: true, ESD2: true, ESD1: true, APS: true }

/** field mpp fallback before the engine has ticked (boe/d, design case) */
const MPP_FALLBACK = 63000

type Esc = [sec: number, text: string, level: ChainLevel, kind?: ChainKind]
interface Meta {
  sd: WorstLevel
  /** C&E rows that fire, with the elapsed time they fire at */
  ce: [id: string, sec: number][]
  lost: PlatformId[]
  share: number
  /** outage override, hours (else OUTAGE_H[sd]) */
  hours?: number
  /** escalation steps the scenario timeline only marks by condition */
  esc: Esc[]
  /** timeline step ids that only fire when the operator has not acted */
  cond?: string[]
  /** up to this elapsed time everything happens whatever the operator does (default 70 s) */
  auto?: number
  recovery: string
}

const ALPHA_DOWN: PlatformId[] = ['Alpha', 'WHP-N']

const META: Record<string, Meta> = {
  'hp-level-lv1101': {
    auto: 100,
    sd: 'PSD',
    ce: [['lahh-1101', 410], ['upstream-psd', 412]],
    lost: ALPHA_DOWN,
    share: 1,
    esc: [
      [300, 'LAH-1101: HP separator level high', 'warn', 'alarm'],
      [410, 'LAHH-1101 (3 000 mm) → PSD on Alpha', 'trip', 'trip'],
    ],
    recovery: '≈ 30 min: restore level control, reset PSD, restart, 10 min well ramp',
  },
  'export-pump-standby': {
    sd: 'PSD',
    ce: [['lahh-1101', 360], ['upstream-psd', 362]],
    lost: ALPHA_DOWN,
    share: 1,
    esc: [
      [62, 'No export pump running: export flow falls to zero', 'warn', 'alarm'],
      [260, 'LAH-1101: HP separator level high', 'warn', 'alarm'],
      [360, 'LAHH-1101 → PSD on Alpha', 'trip', 'trip'],
    ],
    recovery: '≈ 30 min: reset + start P-1500B, reset PSD, restart, 10 min well ramp',
  },
  'compressor-surge': {
    auto: 200,
    sd: 'USD',
    ce: [['k2200-surge', 780]],
    lost: ['Alpha'],
    share: 0.2,
    esc: [
      [600, 'Surge margin below 10 % with no recycle: UIC-2201 alarm', 'warn', 'alarm'],
      [780, 'K-2200 surges and trips on high vibration (USD)', 'trip', 'trip'],
    ],
    recovery: '≈ 1 h: FV-2201 positioner repaired, local reset, K-2200 restart',
  },
  'gtg-blackout': {
    sd: 'PSD',
    ce: [['blackout', 62], ['upstream-psd', 64], ['ia-ll', 840]],
    lost: ['Alpha', 'WHP-N', 'LQ'],
    share: 1,
    esc: [
      [61, 'Bus dead: standby GT-8100B left in MANUAL, no auto-start', 'warn', 'alarm'],
      [62, 'Blackout → PSD on Alpha; emergency generator starts (15 s)', 'trip', 'trip'],
      [840, 'Instrument air receivers exhausted: PALL-4603', 'trip', 'trip'],
    ],
    recovery: '≈ 45 min: start GT-8100B (3 min), reset PSD, restart, 10 min well ramp',
  },
  'instrument-air': {
    sd: 'PSD',
    ce: [['ia-ll', 840], ['upstream-psd', 842]],
    lost: ALPHA_DOWN,
    share: 1,
    esc: [
      [660, 'PAL-4603: instrument air header 6.5 barg', 'warn', 'alarm'],
      [840, 'PALL-4603 (5.5 barg) → controlled PSD on Alpha', 'trip', 'trip'],
    ],
    recovery: '≈ 40 min: local reset of K-4600, header back up, reset PSD, restart',
  },
  'gas-compressor': {
    sd: 'ESD2',
    ce: [['gas-confirmed', 65], ['upstream-psd', 67]],
    lost: ALPHA_DOWN,
    share: 1,
    esc: [
      [62, 'Gas high (60 % LEL) at the first detector: 1ooN alarm', 'warn', 'alarm'],
      [65, 'Second detector: confirmed gas 2ooN → ESD2 compression zone', 'trip', 'trip'],
    ],
    recovery: '≈ 4 h: BA team isolates the flange, gas clears, reset ESD2, restart',
  },
  'fire-hp-separator': {
    auto: 800,
    sd: 'ESD1',
    ce: [['fire-confirmed', 65], ['upstream-psd', 67]],
    lost: ALPHA_DOWN,
    share: 1,
    esc: [
      [62, 'Flame seen by one detector: 1ooN, high-priority alarm', 'warn', 'alarm'],
      [65, 'Second flame detector: confirmed fire 2ooN → ESD1 on Alpha', 'trip', 'trip'],
      [720, 'Fire out (inventory blown down, deluge)', 'info', 'event'],
    ],
    recovery: '≈ 8 h: fire team confirms safe, cooling, flange repair, reset ESD1, restart',
  },
  'gas-single-detector': {
    auto: 100,
    sd: 'ESD1',
    ce: [['gas-low', 90], ['fire-confirmed', 1265], ['upstream-psd', 1267]],
    lost: ALPHA_DOWN,
    share: 1,
    cond: ['leak2', 'leak3', 'ignite'],
    esc: [
      [90, 'One detector at the low setpoint: poorly covered corner, voting never confirms', 'warn', 'alarm'],
      [1265, 'Jet fire seen by two flame detectors → ESD1 on Alpha', 'trip', 'trip'],
    ],
    recovery: '≈ 8 h after an ignition (a manual ESD2 at the first alarm keeps it to ≈ 4 h)',
  },
  'cooling-seawater': {
    sd: 'USD',
    ce: [['cm-hh', 522]],
    lost: ['Alpha'],
    share: 0.2,
    esc: [
      [62, 'No seawater lift: cooling medium starts to heat up', 'warn', 'alarm'],
      [390, 'TAH-6303: cooling medium 45 °C', 'warn', 'alarm'],
      [522, 'TAHH-6303 (55 °C) → K-2200 trips, gas to flare (USD)', 'trip', 'trip'],
    ],
    recovery: '≈ 1 h: P-6400B strainer cleaned, cooling back, K-2200 restart',
  },
  'rp-riser-leak': {
    auto: 200,
    sd: 'ESD2',
    ce: [['gas-confirmed', 182], ['rp-export', 184], ['lahh-1101', 540], ['upstream-psd', 542]],
    lost: ['RP', 'Alpha', 'WHP-N'],
    share: 1,
    esc: [
      [62, 'RP gas detectors alarm: riser topsides', 'warn', 'alarm'],
      [420, 'Alpha LAH-1101: no export, HP separator filling', 'warn', 'alarm'],
      [540, 'LAHH-1101 → PSD on Alpha (export blocked)', 'trip', 'trip'],
    ],
    recovery: '≈ 4 h: gas clears on RP, reset RP ESD2, restore export, restart Alpha',
  },
  'wi-pump-trip': {
    sd: 'alarm',
    ce: [],
    lost: ['WI'],
    share: 0.05,
    hours: 6,
    esc: [
      [62, 'Injection halves: reservoir pressure starts to fall', 'warn', 'alarm'],
      [1800, 'Production efficiency declining: loss booked to "reservoir"', 'warn', 'event'],
    ],
    recovery: '≈ 15 min field reset at WI; reservoir support recovers over hours',
  },
  'night-shift': {
    auto: 960,
    sd: 'ESD2',
    ce: [['auto-changeover', 125], ['gas-confirmed', 1390], ['upstream-psd', 1392]],
    lost: ALPHA_DOWN,
    share: 1,
    cond: ['grow'],
    esc: [
      [0, 'Crane lift under way in 16 m/s wind (limit 15 m/s)', 'warn', 'event'],
      [150, 'Gas alarm at the export pumps: P-1500A seal leak', 'warn', 'alarm'],
      [930, 'Gas alarm in the compression area: second, separate leak', 'warn', 'alarm'],
      [1390, 'Leak confirmed 2ooN → automatic ESD2 on Alpha', 'trip', 'trip'],
    ],
    recovery: '≈ 4 h: both leaks isolated, gas clears, reset ESD2, restart',
  },
}

/** generic fallback for a scenario not in the map */
function guessMeta(sc: Scenario): Meta {
  const txt = `${sc.summary} ${sc.category}`.toLowerCase()
  const sd: WorstLevel = /fire/.test(txt) ? 'ESD1' : /confirmed gas|esd2/.test(txt) ? 'ESD2' : /lahh|psd|blackout/.test(txt) ? 'PSD' : /trip/.test(txt) ? 'USD' : 'alarm'
  return { sd, ce: [], lost: ['Alpha'], share: DOWN[sd] ? 1 : 0.2, esc: [], recovery: `≈ ${OUTAGE_H[sd]} h to restart after reset` }
}

const T = (sec: number) => `T+${fmtEl(sec)}`

/** elapsed time a timeline step fires at (at / after chains), null when it only has a `when` */
function stepTime(step: Step, byId: Map<string, Step>, depth = 0): number | null {
  if (typeof step.at === 'number') return step.at
  if (step.after && depth < 8) {
    const ref = byId.get(step.after[0])
    const base = ref ? stepTime(ref, byId, depth + 1) : null
    return base === null ? null : base + step.after[1]
  }
  return null
}

const PLATFORM_SET = new Set<string>(FIELD_PLATFORMS)

export function predictConsequence(sc: Scenario, mppNow?: number): Consequence {
  const m = META[sc.id] ?? guessMeta(sc)
  const chain: ChainStep[] = []
  const cond = new Set(m.cond ?? [])

  // labelled injection steps from the scenario's own timeline
  const byId = new Map(sc.timeline.map((s) => [s.id, s]))
  for (const s of sc.timeline) {
    if (!s.label) continue
    const sec = stepTime(s, byId)
    if (sec === null) continue
    chain.push({ t: T(sec), sec, text: s.label, level: 'warn', kind: 'event', ifUnmitigated: cond.has(s.id) || undefined })
  }
  const initiating = chain.length ? chain[0].text : sc.summary.split('. ')[0]

  // escalation (alarms, trips) the timeline marks only by condition
  for (const [sec, text, level, kind] of m.esc) chain.push({ t: T(sec), sec, text, level, kind: kind ?? (level === 'trip' ? 'trip' : 'alarm') })

  // cause & effect: what the safety system does
  for (const [id, sec] of m.ce) {
    const row = CE_BY_ID[id]
    if (!row) continue
    for (const e of row.effects) chain.push({ t: T(sec), sec, text: e, level: row.level === 'alarm' ? 'info' : 'trip', kind: 'effect', ce: id })
  }

  chain.sort((a, b) => a.sec - b.sec || order(a.kind) - order(b.kind))
  const auto = m.auto ?? 70
  for (const c of chain) if (c.sec > auto) c.ifUnmitigated = true

  const outageH = m.hours ?? OUTAGE_H[m.sd]
  const tripAt = chain.find((c) => c.kind === 'trip')?.sec ?? chain[chain.length - 1]?.sec ?? 60
  chain.push({ t: T(tripAt + outageH * 3600), sec: tripAt + outageH * 3600, text: `Production back: ${m.recovery}`, level: 'info', kind: 'recovery' })

  const mpp = typeof mppNow === 'number' && mppNow > 1000 ? mppNow : (useSim.getState().result?.mpp ?? 0) > 1000 ? useSim.getState().result!.mpp : MPP_FALLBACK
  const unmitigated = Math.round((mpp * m.share * outageH) / 24)
  return {
    scenarioId: sc.id,
    initiating,
    chain,
    worstShutdown: m.sd,
    platforms: sc.platforms.filter((p): p is PlatformId => PLATFORM_SET.has(p)),
    lost: m.lost,
    deferredBoe: { ideal: sc.ideal.deferredBoe, unmitigated: Math.max(unmitigated, sc.ideal.deferredBoe) },
    availabilityHitPct: DOWN[m.sd] ? Math.round((outageH / 24) * 100) : 0,
    riskPeak: RISK_PEAK[m.sd],
    recovery: m.recovery,
    barriers: sc.expected,
    outageH,
    share: m.share,
    mpp,
  }
}

const ORDER: Record<ChainKind, number> = { event: 0, alarm: 1, trip: 2, effect: 3, recovery: 4 }
const order = (k: ChainKind) => ORDER[k]
