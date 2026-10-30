/**
 * Alert rules, outbox and trace log (plan 04).
 *
 * A sim plugin watches the plant after every engine tick and raises an alert on each *transition*
 * (never on state that already existed when the rules started). Every alert:
 *   - is drafted as an email into the outbox (status `queued`; nothing is sent from the browser —
 *     plan 09 adds the server channel);
 *   - carries a trace: observe → assess → decide → notify (TraceStep[] in `useAlerts.trace`).
 *
 * Rules: p1-alarm · fg-confirmed · fg-gas-high · fg-fire-single · shutdown · risk-band-up ·
 * machine-alarm · ppe-violation · cctv-flame, plus two "hard to spot" agent checks that run every
 * minute of sim time: barrier-erosion (Swiss-cheese alignment in one fire zone) and slow-drift (a
 * sensor creeping towards its trip while still inside its alarm limits). Both checks live in
 * agentTools.ts so the assistant, the investigation and a future LLM call exactly the same code.
 *
 * Email: DEFAULT_RECIPIENT; abdullahweb24bd@gmail.com is always filtered out.
 */
import { create } from 'zustand'
import type { Alert, AlertSeverity, AlertSource, RiskBand, TraceStep } from './types'
import type { PlatformId, Shutdown, ZoneStatus } from '../sim/types'
import { fmtClock } from '../sim/types'
import { registerSimPlugin, useSim } from '../state/sim'
import { usePlantStore } from '../state/plantStore'
import { useMaint, type Stage } from '../sim/maintenance'
import { CE_BY_ID } from '../sim/causeEffect'
import { SCENARIOS } from '../sim/scenarios'
import { detectors, fireZones, platformOfTag } from '../sim/fg'
import { useRisk } from './risk'
import { useCctv, CAMERAS } from './cctv'
import { barrierErosion, recordDriftSamples, sensorDrift, type DriftFinding, type ErosionFinding } from './agentTools'

/** default alert recipient (prototype). Never abdullahweb24bd@gmail.com. */
export const DEFAULT_RECIPIENT = 'areeb.projects@gmail.com'
/** addresses that must never receive automated mail */
const BLOCKED = new Set(['abdullahweb24bd@gmail.com'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CAP_ALERTS = 200
const CAP_TRACE = 2000
/** same rule + first tag within this many sim seconds → suppressed */
const DEDUP_S = 600
/** hard checks (barrier erosion, drift) cadence, sim seconds */
const HARD_EVERY_S = 60

/** clean a recipient list: trimmed, valid, deduplicated, blocked addresses removed; never empty */
export function cleanRecipients(list: string[]): string[] {
  const out: string[] = []
  for (const raw of list) {
    const e = String(raw ?? '').trim()
    const k = e.toLowerCase()
    if (!e || !EMAIL_RE.test(e) || BLOCKED.has(k) || out.some((x) => x.toLowerCase() === k)) continue
    out.push(e)
  }
  return out.length ? out : [DEFAULT_RECIPIENT]
}

interface AlertStore {
  alerts: Alert[]
  trace: TraceStep[]
  recipients: string[]
  /** email channel: 'outbox' drafts only (browser prototype); 'server' posts to the alert endpoint (plan 09) */
  channel: 'outbox' | 'server'
  ack: (id: string) => void
  setRecipients: (list: string[]) => void
  clear: () => void
}
export const useAlerts = create<AlertStore>((set) => ({
  alerts: [],
  trace: [],
  recipients: [DEFAULT_RECIPIENT],
  channel: 'outbox',
  ack: (id) =>
    set((s) => {
      const t = useSim.getState().t
      const a = s.alerts.find((x) => x.id === id)
      if (!a || a.ack) return {}
      queueMicrotask(() => addTrace(a.traceId, { actor: 'operator', kind: 'act', text: `Alert acknowledged by the operator at ${fmtClock(t)}` }))
      return { alerts: s.alerts.map((x) => (x.id === id ? { ...x, ack: { t, by: 'operator' } } : x)) }
    }),
  setRecipients: (list) => set({ recipients: cleanRecipients(list) }),
  clear: () => set({ alerts: [], trace: [] }),
}))

// ---------------------------------------------------------------- ids + trace
let seq = 0
let stepSeq = 0
const session = Math.random().toString(36).slice(2, 6).toUpperCase()
export const newTraceId = (prefix = 'TR') => `${prefix}-${session}-${(++seq).toString().padStart(4, '0')}`

/** append one auditable step to a trace (returns the step, so a planner can mirror it) */
export function addTrace(traceId: string, step: Omit<TraceStep, 'id' | 'traceId' | 't'>): TraceStep {
  const st: TraceStep = { ...step, id: `S${++stepSeq}`, traceId, t: useSim.getState().t }
  useAlerts.setState((s) => ({ trace: [...s.trace, st].slice(-CAP_TRACE) }))
  return st
}

// ---------------------------------------------------------------- raise
const lastRaised = new Map<string, number>()

export interface RaiseInput extends Omit<Alert, 'id' | 't' | 'traceId' | 'email' | 'status'> {
  /** what was observed (strings, or records of values) — becomes the observe step */
  evidence: TraceStep['data'][] | string[]
  /** live readings for the email "Live values" section */
  values?: string[]
  /** recommended actions (C&E effects, scenario expectations); generic ones are added when empty */
  actions?: string[]
  /** who observed it (default: sensor) */
  observer?: TraceStep['actor']
  /** dedup key (default: rule + first tag) */
  dedupKey?: string
}

const SEV_RANK: Record<AlertSeverity, number> = { info: 0, warning: 1, critical: 2 }

function riskLine(platform: PlatformId): { text: string; data: Record<string, unknown> } {
  const now = useRisk.getState().now
  const pr = now?.platforms?.[platform]
  if (!pr) return { text: `Risk engine not reporting yet for ${platform}`, data: { platform, available: false } }
  const before = prevScore.get(platform)
  const top = (pr.contributors ?? []).slice(0, 3)
  const delta = before !== undefined && Math.round(before) !== Math.round(pr.score) ? ` (was ${Math.round(before)})` : ''
  return {
    text: `${platform} risk ${Math.round(pr.score)} — ${pr.band}${delta}; field ${Math.round(now?.field ?? 0)}. Top: ${top.map((c) => `${c.text} +${Math.round(c.points)}`).join('; ') || 'none'}`,
    data: { platform, score: Math.round(pr.score), before: before !== undefined ? Math.round(before) : null, band: pr.band, field: Math.round(now?.field ?? 0), top: top.map((c) => ({ id: c.id, text: c.text, points: Math.round(c.points), tag: c.tag })) },
  }
}

/** scenario "expected" lines whose scenario names the tag (training knowledge reused as advice) */
function scenarioAdvice(tag: string | undefined): string[] {
  if (!tag) return []
  const sc = SCENARIOS.find((x) => x.requires?.tags?.includes(tag)) ?? SCENARIOS.find((x) => x.summary.includes(tag) || x.title.includes(tag))
  return sc ? sc.expected.slice(0, 3).map((e) => `${e} (scenario "${sc.title}")`) : []
}

const GENERIC: Record<AlertSeverity, string[]> = {
  critical: ['Confirm the event on the F&G / ESD mimic and CCTV', 'Follow the station bill: muster if the GA sounds', 'Do not reset any shutdown until the cause is cleared'],
  warning: ['Check the item on the console and send a field operator to verify', 'Review active permits and SIMOPS in the area'],
  info: ['Monitor the trend; no immediate action'],
}

/** raise an alert: dedup check, trace (observe → assess → decide → notify) and the email draft */
export function raise(a: RaiseInput): Alert | null {
  const s = useSim.getState()
  const t = s.t
  const tag0 = a.tags[0] ?? a.platform
  const key = a.dedupKey ?? `${a.rule}|${tag0}`
  const prev = lastRaised.get(key)
  const suppressed = prev !== undefined && t - prev < DEDUP_S
  if (!suppressed) lastRaised.set(key, t)
  const traceId = newTraceId()
  const id = `AL-${session}-${(++seq).toString().padStart(4, '0')}`

  // observe
  const evidence = a.evidence.map((e) => (typeof e === 'string' ? e : typeof e?.text === 'string' ? e.text : JSON.stringify(e)))
  addTrace(traceId, {
    actor: a.observer ?? 'sensor',
    kind: 'observe',
    text: evidence.slice(0, 3).join(' · ') || a.title,
    data: { evidence: a.evidence, tags: a.tags, values: a.values ?? [] },
  })
  // assess
  const risk = riskLine(a.platform)
  addTrace(traceId, { actor: 'risk', kind: 'assess', text: risk.text, data: risk.data })
  // decide
  addTrace(traceId, {
    actor: 'rule',
    kind: 'decide',
    text: suppressed
      ? `Rule ${a.rule} matched again for ${tag0} ${Math.round(t - (prev ?? t))} s after the last alert — suppressed (dedup window ${DEDUP_S / 60} min)`
      : `Rule ${a.rule} fired: ${a.title} → severity ${a.severity}`,
    data: { rule: a.rule, severity: a.severity, source: a.source, dedupKey: key, suppressed, lastRaisedAt: prev ?? null },
  })
  // email
  const to = cleanRecipients(useAlerts.getState().recipients)
  const actions = [...(a.actions ?? []), ...scenarioAdvice(a.tags[0])]
  const recs = (actions.length ? actions : GENERIC[a.severity]).slice(0, 7)
  const text = [
    `${a.title} — ${a.platform}, ${fmtClock(t)}.`,
    a.body,
    '',
    'Live values',
    ...(a.values?.length ? a.values : evidence.slice(0, 6)).map((v) => `  - ${v}`),
    '',
    'Risk',
    `  - ${risk.text}`,
    '',
    'Recommended actions (advisory — the operator decides)',
    ...recs.map((r, i) => `  ${i + 1}. ${r}`),
    '',
    `Trace id ${traceId} · alert ${id} · rule ${a.rule} · tags ${a.tags.join(', ') || '—'}`,
    'Alpha safety twin — prototype outbox (drafted in the browser, not sent).',
  ].join('\n')
  const email = { to, subject: `[ALPHA ${a.severity.toUpperCase()}] ${a.title}`, text }
  addTrace(traceId, {
    actor: 'rule',
    kind: 'notify',
    text: suppressed ? `Email draft kept but not queued (suppressed) — ${to.join(', ')}` : `Email drafted to ${to.join(', ')} — outbox (prototype, not sent)`,
    data: { to, subject: email.subject, channel: useAlerts.getState().channel },
  })
  const alert: Alert = {
    id,
    t,
    severity: a.severity,
    source: a.source,
    rule: a.rule,
    platform: a.platform,
    title: a.title,
    body: a.body,
    tags: a.tags,
    traceId,
    email,
    status: suppressed ? 'suppressed' : 'queued',
  }
  useAlerts.setState((st) => ({ alerts: [alert, ...st.alerts].slice(0, CAP_ALERTS) }))
  return alert
}

// ---------------------------------------------------------------- helpers for the rules
const plant = () => usePlantStore.getState().plant
const isPlantTag = (tag: string) => {
  const p = plant()
  return p.equipment.some((e) => e.tag === tag) || p.valves.some((v) => v.tag === tag) || p.instruments.some((i) => i.tag === tag) || p.lines.some((l) => l.tag === tag)
}
/** first plant tag mentioned in a text (e.g. "LAHH-1101 HP separator …" → none; "K-2200 trips" → K-2200) */
function tagsIn(text: string): string[] {
  const m = text.match(/\b[A-Z]{1,5}-[A-Z]?\d{2,5}[A-Z]?\b/g) ?? []
  return [...new Set(m)].filter(isPlantTag)
}
/** the main plant item behind a C&E cause (the Walk-to target of a shutdown alert) */
const CAUSE_TAG: Record<string, string> = {
  'lahh-1101': 'V-1100',
  'pahh-1101': 'V-1100',
  'ia-ll': 'K-4600',
  blackout: 'GT-8100A',
  'export-blocked': 'ESDV-1601',
  'rp-export': 'ESDV-R101',
  'wi-lowflow': 'P-W310A',
  'k2200-surge': 'K-2200',
  'cm-hh': 'P-6200A',
  'load-shed': 'GT-8100A',
  'upstream-psd': 'ESDV-N2003',
  'injector-shut': 'P-W310A',
}
const zoneName = (id: string | undefined) => (id ? fireZones(plant()).find((z) => z.id === id)?.name ?? id : '')
/** detectors of a zone at / above `min` (high, or low) */
function zoneDetectorsIn(zone: string, min: 'low' | 'high'): { tag: string; value: number; state: string }[] {
  const s = useSim.getState()
  const out: { tag: string; value: number; state: string }[] = []
  for (const d of detectors(plant())) {
    if (d.zone !== zone) continue
    const r = s.detectors[d.tag]
    if (!r) continue
    if (r.state === 'high' || (min === 'low' && r.state === 'low')) out.push({ tag: d.tag, value: r.value, state: r.state })
  }
  return out.sort((a, b) => b.value - a.value)
}
function zonePlatform(zone: string): PlatformId {
  return fireZones(plant()).find((z) => z.id === zone)?.platform ?? 'Alpha'
}
function walkTarget(tags: string[], fallback?: string): string[] {
  const uniq = [...new Set(tags.filter(Boolean))]
  const ok = uniq.filter(isPlantTag)
  if (ok.length) return ok
  return fallback && isPlantTag(fallback) ? [fallback] : uniq
}
/** zone F&G detectors (their alarms are covered by the fg-* rules); manual call points are not */
function isZoneDetector(tag: string) {
  return detectors(plant()).some((d) => (d.tag === tag || d.rxTag === tag) && d.zone && d.type !== 'MAC')
}

// ---------------------------------------------------------------- rule state ("seen")
let seeded = false
const seenAlarms = new Set<string>()
const seenShutdowns = new Set<string>()
const seenCctv = new Set<string>()
const seenFg = new Map<string, Pick<ZoneStatus, 'gas' | 'fire'>>()
const seenStage = new Map<string, Stage>()
const seenBand = new Map<PlatformId, RiskBand>()
const prevScore = new Map<PlatformId, number>()
const activeErosion = new Set<string>()
const activeDrift = new Set<string>()
let nextHard = 0

const BAND_RANK: Record<RiskBand, number> = { low: 0, moderate: 1, high: 2, critical: 3 }
const STAGE_RANK: Record<Stage, number> = { normal: 0, alert: 1, alarm: 2, failed: 3 }
const GAS_RANK: Record<ZoneStatus['gas'], number> = { normal: 0, low: 1, high: 2, confirmed: 3 }

function resetRules() {
  seeded = false
  seenAlarms.clear()
  seenShutdowns.clear()
  seenCctv.clear()
  seenFg.clear()
  seenStage.clear()
  seenBand.clear()
  prevScore.clear()
  activeErosion.clear()
  activeDrift.clear()
  lastRaised.clear()
  nextHard = 0
}

/** remember everything that exists now, so rules fire only on what changes from here on */
function seed(t: number) {
  const s = useSim.getState()
  for (const a of s.alarms ?? []) seenAlarms.add(a.id)
  for (const x of s.shutdowns ?? []) seenShutdowns.add(x.id)
  for (const z of Object.values(s.fg ?? {})) seenFg.set(z.zone, { gas: z.gas, fire: z.fire })
  for (const [tag, h] of Object.entries(useMaint.getState().health ?? {})) seenStage.set(tag, h.stage)
  for (const d of useCctv.getState().log ?? []) seenCctv.add(d.id)
  const now = useRisk.getState().now
  for (const [p, pr] of Object.entries(now?.platforms ?? {})) if (pr) seenBand.set(p as PlatformId, pr.band)
  for (const f of safe(() => barrierErosion({}), [] as ErosionFinding[])) if (f.aligned) activeErosion.add(f.zone)
  for (const f of safe(() => sensorDrift({}), [] as DriftFinding[])) activeDrift.add(f.tag)
  nextHard = t + HARD_EVERY_S
  seeded = true
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------- the rules
function ruleAlarms() {
  const s = useSim.getState()
  for (const a of s.alarms ?? []) {
    if (seenAlarms.has(a.id)) continue
    seenAlarms.add(a.id)
    // ESD alarms and zone F&G alarms have their own, richer rules (shutdown / fg-*)
    if (a.priority !== 1 || !a.active || a.kind === 'esd' || (a.kind === 'fg' && !!a.zone) || isZoneDetector(a.tag)) continue
    const tags = walkTarget(tagsIn(`${a.tag} ${a.text}`), a.tag)
    raise({
      severity: 'critical',
      source: 'alarm',
      rule: 'p1-alarm',
      platform: a.platform,
      title: `P1 alarm ${a.tag}: ${a.text}`,
      body: `A priority-1 (emergency) alarm was raised on ${a.platform}${a.zone ? ` in ${zoneName(a.zone)}` : ''}. Priority-1 alarms need an operator response within minutes.`,
      tags,
      evidence: [`${a.tag} ${a.text}${a.value ? ` (${a.value})` : ''}`, `kind ${a.kind}, raised ${fmtClock(a.raisedAt)}`],
      values: [`${a.tag}: ${a.text}${a.value ? ` = ${a.value}` : ''}`],
    })
  }
}

function ruleFg() {
  const s = useSim.getState()
  for (const z of Object.values(s.fg ?? {})) {
    const prev = seenFg.get(z.zone) ?? { gas: 'normal', fire: 'normal' }
    seenFg.set(z.zone, { gas: z.gas, fire: z.fire })
    const platform = zonePlatform(z.zone)
    const name = zoneName(z.zone)
    const gasConf = z.gas === 'confirmed' && prev.gas !== 'confirmed'
    const fireConf = z.fire === 'confirmed' && prev.fire !== 'confirmed'
    if (gasConf || fireConf) {
      const dets = zoneDetectorsIn(z.zone, 'high')
      const ce = CE_BY_ID[fireConf ? 'fire-confirmed' : 'gas-confirmed']
      const what = fireConf ? 'Confirmed fire' : 'Confirmed gas'
      raise({
        severity: 'critical',
        source: 'fireGas',
        rule: 'fg-confirmed',
        platform,
        title: `${what} in ${name}`,
        body: `${what} (2ooN voting) in fire zone ${z.zone} (${name}). ${ce ? `Cause & effect: ${ce.level} — ${ce.effects.slice(0, 2).join('; ')}.` : ''}`,
        tags: walkTarget(dets.map((d) => d.tag)),
        evidence: [`zone ${z.zone}: gas ${z.gas}, fire ${z.fire}, smoke ${z.smoke}, ${z.highCount} detector(s) at high${z.deluge ? ', deluge released' : ''}`, ...dets.slice(0, 4).map((d) => `${d.tag} ${d.value.toFixed(1)} (${d.state})`)],
        values: dets.slice(0, 6).map((d) => `${d.tag}: ${d.value.toFixed(1)} ${/OGD/.test(d.tag) ? 'LEL·m' : d.tag.startsWith('GD') ? '%LEL' : ''} (${d.state})`),
        actions: ce?.effects.map((e) => `Confirm: ${e}`) ?? [],
      })
      continue
    }
    if (z.gas === 'high' && GAS_RANK[prev.gas] < GAS_RANK.high) {
      const dets = zoneDetectorsIn(z.zone, 'high')
      const ce = CE_BY_ID['gas-high']
      raise({
        severity: 'warning',
        source: 'fireGas',
        rule: 'fg-gas-high',
        platform,
        title: `Gas at high setpoint in ${name}`,
        body: `One detector (1ooN) at the high gas setpoint in ${z.zone} (${name}). Not yet confirmed — a second detector at high initiates the zone ESD.`,
        tags: walkTarget(dets.map((d) => d.tag)),
        evidence: [`zone ${z.zone}: gas ${z.gas}, ${z.highCount} detector(s) at high`, ...dets.slice(0, 4).map((d) => `${d.tag} ${d.value.toFixed(1)}`)],
        values: dets.slice(0, 6).map((d) => `${d.tag}: ${d.value.toFixed(1)} (${d.state})`),
        actions: [...(ce?.effects ?? []), 'Stop hot work and crane lifts in the area; send a field operator with a portable detector (upwind approach)'],
      })
    }
    if (z.fire === 'single' && prev.fire === 'normal') {
      raise({
        severity: 'warning',
        source: 'fireGas',
        rule: 'fg-fire-single',
        platform,
        title: `Flame seen by one detector in ${name}`,
        body: `A single flame detector (1ooN) is in alarm in ${z.zone}. Confirm on CCTV — a second detector confirms the fire.`,
        tags: walkTarget(zoneDetectorsIn(z.zone, 'high').map((d) => d.tag)),
        evidence: [`zone ${z.zone}: fire ${z.fire}`],
        actions: CE_BY_ID['fire-single']?.effects ?? [],
      })
    }
  }
}

function ruleShutdowns() {
  const s = useSim.getState()
  for (const sd of s.shutdowns ?? []) {
    if (seenShutdowns.has(sd.id)) continue
    seenShutdowns.add(sd.id)
    raiseShutdown(sd)
  }
}
function raiseShutdown(sd: Shutdown) {
  const ce = CE_BY_ID[sd.causeId]
  const sev: AlertSeverity = sd.level === 'ESD1' || sd.level === 'APS' || sd.level === 'ESD2' ? 'critical' : 'warning'
  const zoneTags = sd.zone ? zoneDetectorsIn(sd.zone, 'high').map((d) => d.tag) : []
  const tags = walkTarget([...(CAUSE_TAG[sd.causeId] ? [CAUSE_TAG[sd.causeId]] : []), ...zoneTags, ...tagsIn(sd.cause)])
  const r = useSim.getState().result
  raise({
    severity: sev,
    source: 'shutdown',
    rule: 'shutdown',
    platform: sd.platform,
    title: `${sd.level} on ${sd.platform}${sd.zone ? ` (${sd.zone})` : ''}: ${sd.cause}`,
    body: `${sd.level} initiated on ${sd.platform}${sd.zone ? ` in ${zoneName(sd.zone)}` : ''} by "${sd.cause}". Deferred production is booked to ${sd.loss}. The shutdown stays latched until the cause clears and the operator resets it.`,
    tags,
    evidence: [`${sd.id}: ${sd.level} ${sd.platform}${sd.zone ? ` zone ${sd.zone}` : ''}`, `cause ${sd.causeId}: ${sd.cause}`, ...(r ? [`oil export now ${Math.round(r.oilExport)} bbl/d, PE ${r.efficiency.toFixed(0)} %`] : [])],
    values: [`Shutdown ${sd.level} at ${fmtClock(sd.at)}`, ...(r ? [`Oil export ${Math.round(r.oilExport)} bbl/d`, `Flare ${r.flare.toFixed(1)} MMscfd`] : [])],
    actions: ce ? ce.effects.map((e) => `Verify: ${e}`) : [],
  })
}

function ruleRisk() {
  const now = useRisk.getState().now
  if (!now?.platforms) return
  for (const [pk, pr] of Object.entries(now.platforms)) {
    if (!pr) continue
    const p = pk as PlatformId
    const prev = seenBand.get(p)
    seenBand.set(p, pr.band)
    // first snapshot for this platform (risk engine started after the rules): that state already existed
    if (prev === undefined) continue
    if (BAND_RANK[pr.band] > BAND_RANK[prev]) {
      const sev: AlertSeverity = pr.band === 'critical' ? 'critical' : pr.band === 'high' ? 'warning' : 'info'
      const top = (pr.contributors ?? []).slice(0, 5)
      raise({
        severity: sev,
        source: 'risk',
        rule: 'risk-band-up',
        platform: p,
        title: `${p} risk up: ${prev} → ${pr.band} (${Math.round(pr.score)})`,
        body: `The live risk score on ${p} rose to ${Math.round(pr.score)} (${pr.band}). Main contributors: ${top.map((c) => c.text).join('; ') || '—'}.`,
        tags: walkTarget(top.map((c) => c.tag ?? '').filter(Boolean)),
        observer: 'risk',
        dedupKey: `risk-band-up|${p}|${pr.band}`,
        evidence: top.map((c) => ({ id: c.id, category: c.category, text: c.text, points: Math.round(c.points) })),
        values: top.map((c) => `${c.text} (+${Math.round(c.points)})`),
        actions: [...top.slice(0, 2).map((c) => `Address the top contributor: ${c.text}`), 'Review the breakdown on the Risk & what-if page'],
      })
    }
  }
}

function ruleMachines() {
  for (const [tag, h] of Object.entries(useMaint.getState().health ?? {})) {
    const prev = seenStage.get(tag) ?? 'normal'
    seenStage.set(tag, h.stage)
    if ((h.stage === 'alarm' || h.stage === 'failed') && STAGE_RANK[h.stage] > STAGE_RANK[prev]) {
      const platform = safe(() => platformOfTag(plant(), tag), 'Alpha' as PlatformId)
      raise({
        severity: 'warning',
        source: 'machinery',
        rule: 'machine-alarm',
        platform,
        title: `${tag} condition ${h.stage}${h.mode ? `: ${h.mode}` : ''}`,
        body: `Condition monitoring on ${tag} moved from ${prev} to ${h.stage} (degradation ${(h.degr * 100).toFixed(0)} %${h.mode ? `, failure mode ${h.mode}` : ''}).`,
        tags: [tag],
        evidence: [`${tag} stage ${prev} → ${h.stage}`, `degradation ${(h.degr * 100).toFixed(0)} %`, `signals vib ${h.sig[0].toFixed(1)} · temp ${h.sig[1].toFixed(1)} · x ${h.sig[2].toFixed(2)}`],
        values: [`Vibration ${h.sig[0].toFixed(1)}`, `Bearing temperature ${h.sig[1].toFixed(1)}`],
        actions: [`Raise a condition-based work order for ${tag}`, 'Plan a changeover to the standby before functional failure', 'Check the P-F trend on the Maintenance page'],
      })
    }
  }
}

function ruleCctv() {
  const log = useCctv.getState().log ?? []
  for (const d of log) {
    if (seenCctv.has(d.id)) continue
    seenCctv.add(d.id)
    const cam = CAMERAS.find((c) => c.id === d.camera)
    const platform = cam?.platform ?? 'Alpha'
    if (d.kind === 'noHardHat' || d.kind === 'noVest') {
      raise({
        severity: 'warning',
        source: 'cctv',
        rule: 'ppe-violation',
        platform,
        title: `PPE: ${d.kind === 'noHardHat' ? 'no hard hat' : 'no hi-vis vest'} on ${cam?.name ?? d.camera}`,
        body: `Camera ${cam?.name ?? d.camera} detected a person without ${d.kind === 'noHardHat' ? 'a hard hat' : 'a hi-vis vest'} (confidence ${(d.confidence * 100).toFixed(0)} %, model ${d.model}).`,
        tags: [],
        observer: 'cctv',
        evidence: [{ camera: d.camera, kind: d.kind, worker: d.workerId ?? null, confidence: d.confidence, box: d.box, model: d.model }],
        actions: ['Area authority to stop the job and correct the PPE', 'Log the observation in the safety system'],
      })
    } else if (d.kind === 'fire' || d.kind === 'gasCloud') {
      raise({
        severity: 'critical',
        source: 'cctv',
        rule: 'cctv-flame',
        platform,
        title: `Camera sees ${d.kind === 'fire' ? 'flame' : 'a gas cloud'}: ${cam?.name ?? d.camera}`,
        body: `Visual confirmation of ${d.kind === 'fire' ? 'a fire' : 'a gas release'} by camera ${cam?.name ?? d.camera} (confidence ${(d.confidence * 100).toFixed(0)} %). Cross-check with the F&G detectors in the zone.`,
        tags: [],
        observer: 'cctv',
        evidence: [{ camera: d.camera, kind: d.kind, confidence: d.confidence, box: d.box, model: d.model }],
      })
    }
  }
}

function ruleHard() {
  // barrier erosion: Swiss-cheese alignment in one fire zone
  const er = safe(() => barrierErosion({}), [] as ErosionFinding[])
  const nowAligned = new Set<string>()
  for (const f of er) {
    if (!f.aligned) continue
    nowAligned.add(f.zone)
    if (activeErosion.has(f.zone)) continue
    activeErosion.add(f.zone)
    raise({
      severity: f.layers.length >= 4 ? 'critical' : 'warning',
      source: 'assistant',
      rule: 'barrier-erosion',
      platform: f.platform,
      title: `Barrier erosion in ${f.zoneName}: ${f.layers.length} layers weakened at once`,
      body: `No single alarm shows this: in ${f.zone} (${f.zoneName}) ${f.layers.map((l) => l.text).join('; ')}. Together they line up the holes in the Swiss cheese — a release here is more likely to be missed, to find ignition and to escalate.`,
      tags: walkTarget(f.tags),
      observer: 'assistant',
      evidence: f.layers.map((l) => ({ layer: l.layer, text: l.text, tags: l.tags })),
      values: f.layers.map((l) => l.text),
      actions: f.actions,
    })
  }
  for (const z of [...activeErosion]) if (!nowAligned.has(z)) activeErosion.delete(z)

  // slow drift towards a trip, still inside the alarm limits
  const dr = safe(() => sensorDrift({}), [] as DriftFinding[])
  const nowDrift = new Set<string>()
  for (const f of dr) {
    nowDrift.add(f.tag)
    if (activeDrift.has(f.tag)) continue
    activeDrift.add(f.tag)
    raise({
      severity: f.minutesToTrip < 30 ? 'critical' : 'warning',
      source: 'assistant',
      rule: 'slow-drift',
      platform: f.platform,
      title: `${f.tag} drifting towards its trip — ~${Math.round(f.minutesToTrip)} min to ${f.limitName}`,
      body: `${f.label} reads ${f.value} ${f.unit}, still inside its alarm limits, but has moved ${f.ratePerHour > 0 ? '+' : ''}${f.ratePerHour} ${f.unit}/h steadily over the last ${Math.round(f.windowMin)} min (fit R² ${f.r2}). At this rate it reaches ${f.limitName} ${f.limit} ${f.unit} in about ${Math.round(f.minutesToTrip)} min${f.minutesToAlarm !== null ? ` (alarm in ~${Math.round(f.minutesToAlarm)} min)` : ''}.`,
      tags: walkTarget([f.host ?? '', f.tag].filter(Boolean)),
      observer: 'assistant',
      evidence: [{ tag: f.tag, value: f.value, unit: f.unit, ratePerHour: f.ratePerHour, r2: f.r2, windowMin: f.windowMin, limit: f.limit, limitName: f.limitName, minutesToTrip: f.minutesToTrip }],
      values: [`${f.tag}: ${f.value} ${f.unit} (trend ${f.ratePerHour > 0 ? '+' : ''}${f.ratePerHour} ${f.unit}/h)`, `${f.limitName}: ${f.limit} ${f.unit}`],
      actions: f.actions,
    })
  }
  for (const k of [...activeDrift]) if (!nowDrift.has(k)) activeDrift.delete(k)
}

function step(_dt: number, t: number) {
  recordDriftSamples(t)
  if (!seeded) return seed(t)
  ruleAlarms()
  ruleFg()
  ruleShutdowns()
  ruleRisk()
  ruleMachines()
  ruleCctv()
  if (t >= nextHard) {
    nextHard = t + HARD_EVERY_S
    ruleHard()
  }
  const now = useRisk.getState().now
  for (const [p, pr] of Object.entries(now?.platforms ?? {})) if (pr) prevScore.set(p as PlatformId, pr.score)
}

registerSimPlugin({ id: 'alerts', step, reset: resetRules })

/** severity ordering helper for the UI */
export const severityRank = (s: AlertSeverity) => SEV_RANK[s]
export type { AlertSource }
