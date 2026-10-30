/**
 * Maintenance & operations workflows — a simulation plugin (registered with `registerSimPlugin`).
 *
 *   condition monitoring  every rotating machine has a health state: vibration, a bearing / lube
 *                         temperature and one machine-specific signal (compressor polytropic efficiency,
 *                         GT exhaust-temperature spread …) driven by a degradation 0..1 along a P-F curve.
 *                         Degradation starts at random (rate per RUNNING hour from CLASS_DATA MTBF, × 500
 *                         for 'training') and only progresses while the machine runs. Alert at 0.5 raises a
 *                         condition-based work order, alarm at 0.75 a P3 alarm, at 1 the machine trips
 *                         (FAILURE, local reset, repair time ≈ MTTR).
 *   work orders           WO-#### raised → approved → planned (permit requested) → isolated → in progress →
 *                         complete → returned to service. Corrective (failures), preventive (PM schedule
 *                         per class, in running hours) and condition-based. Work hours run on the sim clock,
 *                         only while the permit is live.
 *   permit to work        PTW-#### hot / cold / electrical / confined-space entry, with an isolation
 *                         certificate from `planIsolation` (model/isolation.ts): the machine and every valve
 *                         the simulation operates are locked out through the engine (`lockOut`), the rest is
 *                         "manual isolation — field operator to close and lock" until confirmed. SIMOPS:
 *                         hot work is suspended on gas on the platform, every permit on ESD1 / APS; a
 *                         suspended permit needs re-validation. Preventive maintenance is planned work
 *                         (its lock-outs carry planned:true, so deferment books to 'planned').
 *   shift log             trips, resets and shutdowns seen tick by tick, and hourly KPI snapshots, so the
 *                         handover report can cover the last 12 h even after the engine's own logs roll over.
 *
 * Data lives in the `useMaint` zustand store (kept across HMR); the actions are plain functions in `maint`.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import * as simMod from '../state/sim'
import { usePlantStore } from '../state/plantStore'
import { isolationGraph, planIsolation } from '../model/isolation'
import type { Equipment, Plant } from '../model/types'
import * as A from './alpha'
import { fireZones, platformOfTag } from './fg'
import type { AlarmPriority, Kpis, LossCategory, OperatorAction, PlatformId, PluginAlarm, RunState, SimPlugin, SimState } from './types'

// ================================================================= types

export type WoType = 'corrective' | 'preventive' | 'condition'
export type WoStatus = 'raised' | 'approved' | 'planned' | 'isolated' | 'inProgress' | 'complete' | 'returned' | 'cancelled'
export const WO_FLOW: WoStatus[] = ['raised', 'approved', 'planned', 'isolated', 'inProgress', 'complete', 'returned']
export const WO_STATUS_LABEL: Record<WoStatus, string> = {
  raised: 'Raised',
  approved: 'Approved',
  planned: 'Planned — permit requested',
  isolated: 'Isolated',
  inProgress: 'In progress',
  complete: 'Complete',
  returned: 'Returned to service',
  cancelled: 'Cancelled',
}
export const WO_TYPE_LABEL: Record<WoType, string> = { corrective: 'Corrective', preventive: 'Preventive (PM)', condition: 'Condition-based' }
export const OPEN_STATUSES: WoStatus[] = ['raised', 'approved', 'planned', 'isolated', 'inProgress', 'complete']
export const isOpen = (w: WorkOrder) => OPEN_STATUSES.includes(w.status)

export type PermitType = 'hot' | 'cold' | 'electrical' | 'confined'
export const PERMIT_LABEL: Record<PermitType, string> = { hot: 'Hot work', cold: 'Cold work', electrical: 'Electrical', confined: 'Confined-space entry' }
export type PermitStatus = 'requested' | 'issued' | 'suspended' | 'closed'

export interface IsoItem {
  tag: string
  /** machine: locked out through the engine; valve: a valve the sim operates, closed and locked from the DCS;
   *  manual: a valve the field operator closes and locks; blind: a spade to fit; check: a site check */
  kind: 'machine' | 'valve' | 'manual' | 'blind' | 'check'
  action: string
  done: boolean
  at?: number
  by?: OperatorAction['who']
  note?: string
}

export interface Permit {
  id: string
  wo: string
  tag: string
  type: PermitType
  status: PermitStatus
  platform: PlatformId
  /** preventive maintenance: the lock-outs are planned (loss books to 'planned') */
  planned: boolean
  requestedAt: number
  issuedAt?: number
  closedAt?: number
  suspendedAt?: number
  suspendReason?: string
  revalidations: number
  isolations: IsoItem[]
  warnings: string[]
  log: { t: number; text: string }[]
}

export interface WorkOrder {
  id: string
  tag: string
  title: string
  type: WoType
  priority: 1 | 2 | 3 | 4
  status: WoStatus
  raisedAt: number
  raisedBy: string
  /** planner's estimate and work done so far, hours (sim clock) */
  estH: number
  actualH: number
  /** work content actually needed (hidden from the planner; actual ≠ estimate) */
  workH: number
  /** deferred production if the work goes ahead as planned, boe (estimate) */
  deferredBoe: number
  permitType: PermitType
  permit?: string
  failureMode?: string
  /** a failure the plugin caused (repair gate enforced) */
  failure?: boolean
  completedAt?: number
  closedAt?: number
  history: { t: number; status: WoStatus | 'note'; by: string; note?: string }[]
}

export type SigKey = 'vib' | 'temp' | 'x'
export interface SigSpec {
  key: SigKey
  label: string
  unit: string
  /** nominal, alert (≈ degradation 0.5), alarm (≈ 0.75) and failure (1) values */
  n: number
  alert: number
  alarm: number
  fail: number
  /** metrics.ts simulated metric keys this signal replaces for the equipment kind */
  replaces: string[]
}
export type Stage = 'normal' | 'alert' | 'alarm' | 'failed'
export interface Health {
  tag: string
  cls: A.MachineClass
  /** 0 = as new … 1 = functional failure */
  degr: number
  /** P-F interval, running hours from onset to failure */
  pfH: number
  mode?: string
  stage: Stage
  onsetAt?: number
  failedAt?: number
  /** failed by the plugin (FAILURE trip) and not yet repaired: starting it re-trips */
  failedOpen?: boolean
  /** [vib, temp, x] current values */
  sig: [number, number, number]
  /** long trend: degradation sampled every 5 sim minutes */
  hist: number[]
  /** short trend: degradation every tick while degrading (Inspector sparkline) */
  recent: number[]
}
export interface PmItem {
  tag: string
  cls: A.MachineClass
  intervalH: number
  /** share of the PM interval used since the last PM (running hours ÷ interval; survives a change of reliability mode) */
  frac: number
  lastAt?: number
  count: number
}
export interface ShiftEvent {
  t: number
  kind: 'trip' | 'reset' | 'shutdown' | 'sdReset' | 'sdCleared'
  tag: string
  text: string
  /** trips / shutdowns: when (if) it was reset */
  resetAt?: number
  platform?: PlatformId
}
export interface KpiSnap {
  t: number
  produced: number
  potential: number
  losses: Record<LossCategory, number>
  trips: number
  shutdowns: number
}
export interface MaintEvent {
  t: number
  text: string
  level: 'info' | 'warn'
  ref?: string
}
export interface CmAlarm {
  tag: string
  text: string
  at: number
  value: string
}

export interface MaintData {
  plantName: string
  wos: WorkOrder[]
  permits: Record<string, Permit>
  health: Record<string, Health>
  pm: Record<string, PmItem>
  log: MaintEvent[]
  shift: ShiftEvent[]
  snaps: KpiSnap[]
  /** standing condition-monitoring alarms (the engine raises them through the plugin's `alarms()`) */
  cmAlarms: Record<string, CmAlarm>
  /** console page preselection (Inspector "Isolate (permit)") */
  focus: { tag: string; n: number; wall: number } | null
  seq: { wo: number; ptw: number }
  /** sim time of the last long-trend sample / KPI snapshot */
  nextSample: number
  nextSnap: number
}

// ================================================================= class data

const W = 0.55 // secondary signal weight
const W3 = 0.3
export const SIGNALS: Record<A.MachineClass, [SigSpec, SigSpec, SigSpec]> = {
  pump: [
    { key: 'vib', label: 'Bearing vibration', unit: 'mm/s', n: 2.1, alert: 4.5, alarm: 7.1, fail: 11, replaces: ['V'] },
    { key: 'temp', label: 'Bearing temperature', unit: '°C', n: 62, alert: 85, alarm: 95, fail: 110, replaces: ['BT'] },
    { key: 'x', label: 'Motor current', unit: '% FLA', n: 78, alert: 92, alarm: 100, fail: 112, replaces: ['I'] },
  ],
  caisson: [
    { key: 'vib', label: 'Motor / head vibration', unit: 'mm/s', n: 2.4, alert: 4.5, alarm: 7.1, fail: 11, replaces: ['V'] },
    { key: 'temp', label: 'Motor winding temperature', unit: '°C', n: 88, alert: 120, alarm: 135, fail: 155, replaces: [] },
    { key: 'x', label: 'Motor current', unit: '% FLA', n: 80, alert: 92, alarm: 100, fail: 110, replaces: ['I'] },
  ],
  compressor: [
    { key: 'vib', label: 'Shaft vibration', unit: 'µm', n: 24, alert: 50, alarm: 75, fail: 100, replaces: ['V'] },
    { key: 'temp', label: 'Thrust bearing temperature', unit: '°C', n: 86, alert: 105, alarm: 115, fail: 125, replaces: [] },
    { key: 'x', label: 'Polytropic efficiency', unit: '%', n: 78, alert: 74, alarm: 71, fail: 66, replaces: [] },
  ],
  gtg: [
    { key: 'vib', label: 'Turbine vibration', unit: 'mm/s', n: 3.1, alert: 12.5, alarm: 18, fail: 25, replaces: ['V'] },
    { key: 'temp', label: 'Lube oil temperature', unit: '°C', n: 54, alert: 70, alarm: 78, fail: 88, replaces: ['LO'] },
    { key: 'x', label: 'Exhaust temperature spread', unit: '°C', n: 18, alert: 35, alarm: 50, fail: 70, replaces: [] },
  ],
  ia: [
    { key: 'vib', label: 'Shaft vibration', unit: 'µm', n: 20, alert: 50, alarm: 75, fail: 100, replaces: ['V'] },
    { key: 'temp', label: 'Bearing temperature', unit: '°C', n: 70, alert: 90, alarm: 100, fail: 115, replaces: [] },
    { key: 'x', label: 'Discharge temperature', unit: '°C', n: 176, alert: 200, alarm: 215, fail: 235, replaces: [] },
  ],
  rig: [
    { key: 'vib', label: 'Top drive vibration', unit: 'mm/s', n: 3, alert: 6, alarm: 9, fail: 13, replaces: [] },
    { key: 'temp', label: 'Top drive motor temperature', unit: '°C', n: 70, alert: 95, alarm: 110, fail: 125, replaces: [] },
    { key: 'x', label: 'Mud pump pressure ripple', unit: '%', n: 4, alert: 10, alarm: 15, fail: 22, replaces: [] },
  ],
  skid: [
    { key: 'vib', label: 'Metering pump vibration', unit: 'mm/s', n: 1.5, alert: 4, alarm: 6, fail: 9, replaces: [] },
    { key: 'temp', label: 'Motor temperature', unit: '°C', n: 45, alert: 60, alarm: 70, fail: 80, replaces: [] },
    { key: 'x', label: 'Stroke deviation', unit: '%', n: 2, alert: 6, alarm: 10, fail: 15, replaces: [] },
  ],
}
export const CLASS_LABEL: Record<A.MachineClass, string> = { pump: 'Pump', caisson: 'Caisson pump', compressor: 'Compressor', gtg: 'Gas turbine generator', ia: 'Air compressor', rig: 'Drilling rig', skid: 'Chemical skid' }
/** PM interval, running hours (realistic); training divides by 100 */
const PM_H: Record<A.MachineClass, number> = { pump: 2400, caisson: 2800, compressor: 1200, gtg: 1000, ia: 2000, rig: 600, skid: 3200 }
const PM_TITLE: Record<A.MachineClass, string> = {
  pump: 'PM: bearing & seal inspection, lube oil change, alignment check',
  caisson: 'PM: motor insulation test, column inspection, vibration survey',
  compressor: 'PM: dry gas seal inspection, lube oil analysis, coupling check',
  gtg: 'PM: borescope inspection, filter change, fuel nozzle check',
  ia: 'PM: air-end inspection, dryer desiccant change, valve service',
  rig: 'PM: top drive service, mud pump liner & valve change',
  skid: 'PM: metering pump diaphragm change, calibration',
}
const ALERT = 0.5
const AUTO_TRIP = 'Auto (machine trip)'
const ALARM = 0.75

/** P-F curve: degradation → signal value (quiet at first, then accelerating) */
export function sigValue(sp: SigSpec, e: number) {
  const k = Math.max(0, e)
  if (k <= ALERT) return sp.n + (sp.alert - sp.n) * (k / ALERT) ** 2
  if (k <= ALARM) return sp.alert + (sp.alarm - sp.alert) * ((k - ALERT) / (ALARM - ALERT))
  return sp.alarm + (sp.fail - sp.alarm) * Math.min(1.2, (k - ALARM) / (1 - ALARM))
}
/** which signal a failure mode shows up in first */
function primaryOf(mode: string | undefined): SigKey {
  if (!mode) return 'vib'
  if (/vibration|surge|top drive|mud pump/i.test(mode)) return 'vib'
  if (/temperature|lube oil/i.test(mode)) return 'temp'
  return 'x'
}
function weights(mode: string | undefined): [number, number, number] {
  const p = primaryOf(mode)
  return p === 'vib' ? [1, W, W3] : p === 'temp' ? [W, 1, W3] : [W3, W, 1]
}
function signals(cls: A.MachineClass, degr: number, mode: string | undefined): [number, number, number] {
  const w = weights(mode)
  const sp = SIGNALS[cls]
  return [sigValue(sp[0], degr * w[0]), sigValue(sp[1], degr * w[1]), sigValue(sp[2], degr * w[2])]
}
/** the signal a failure mode leads with (index into SIGNALS[cls]) */
export const primaryIndex = (h: Pick<Health, 'mode'>) => ({ vib: 0, temp: 1, x: 2 })[primaryOf(h.mode)]

// ================================================================= plant helpers

const MACHINE_KINDS = new Set(['pumpPackage', 'compressorPackage', 'gasTurbineGenerator', 'caissonPump', 'chemSkid', 'proxy'])
/** machine class of a piece of equipment (same rules as the engine) */
export function classOf(e: Equipment): A.MachineClass | null {
  if (!MACHINE_KINDS.has(e.kind)) return null
  if (e.kind === 'pumpPackage') return 'pump'
  if (e.kind === 'caissonPump') return 'caisson'
  if (e.kind === 'compressorPackage') return e.tag === A.TAGS.iaCompressor || /air/i.test(e.name) ? 'ia' : 'compressor'
  if (e.kind === 'gasTurbineGenerator') return 'gtg'
  if (e.kind === 'proxy') return e.role === 'drillingRig' ? 'rig' : null
  if (e.kind === 'chemSkid') return 'skid'
  return null
}
const plant = () => usePlantStore.getState().plant
const S = () => simMod.useSim.getState() as SimState
const rnd = () => (typeof simMod.simRandom === 'function' ? simMod.simRandom() : Math.random())
const isAlpha = (p: Plant) => !p.custom && p.equipment.some((e) => e.tag === A.TAGS.sep)
const platformOf = (p: Plant, tag: string): PlatformId => (isAlpha(p) ? platformOfTag(p, tag) : 'Plant')
export function machineTags(p: Plant): { tag: string; cls: A.MachineClass }[] {
  const out: { tag: string; cls: A.MachineClass }[] = []
  for (const e of p.equipment) {
    const c = classOf(e)
    if (c) out.push({ tag: e.tag, cls: c })
  }
  return out
}
export function partnerOf(tag: string): string | null {
  const m = /^(.*)([AB])$/.exec(tag)
  if (!m) return null
  const o = m[1] + (m[2] === 'A' ? 'B' : 'A')
  return plant().equipment.some((e) => e.tag === o) ? o : null
}
export function runOf(tag: string): RunState {
  const st = S().status?.[tag]
  if (st) return st
  try {
    return simMod.runState(tag)
  } catch {
    return 'stopped'
  }
}
const trainingFactor = () => (S().knobs?.reliability === 'training' ? 0.2 : 1)
const graphs = new WeakMap<Plant, ReturnType<typeof isolationGraph>>()
function graphOf(p: Plant) {
  let g = graphs.get(p)
  if (!g) graphs.set(p, (g = isolationGraph(p)))
  return g
}
const zonePlat = new WeakMap<Plant, Map<string, PlatformId>>()
function zonePlatform(p: Plant, zone: string): PlatformId | undefined {
  let m = zonePlat.get(p)
  if (!m) {
    m = new Map()
    try {
      for (const z of fireZones(p)) m.set(z.id, z.platform)
    } catch {
      /* builder plants without zones */
    }
    zonePlat.set(p, m)
  }
  return m.get(zone)
}

// ================================================================= store (kept across HMR)

function emptyData(): MaintData {
  return {
    plantName: '',
    wos: [],
    permits: {},
    health: {},
    pm: {},
    log: [],
    shift: [],
    snaps: [],
    cmAlarms: {},
    focus: null,
    seq: { wo: 0, ptw: 0 },
    nextSample: 0,
    nextSnap: 0,
  }
}
const hot = import.meta.hot
export const useMaint: UseBoundStore<StoreApi<MaintData>> = (hot?.data?.useMaint as UseBoundStore<StoreApi<MaintData>> | undefined) ?? create<MaintData>(() => emptyData())
if (hot) hot.data.useMaint = useMaint
const M = () => useMaint.getState()
const setM = (p: Partial<MaintData> | ((s: MaintData) => Partial<MaintData>)) => useMaint.setState(p)

// ================================================================= materials hook (sim/spares.ts registers it)

/** spares integration: reserve parts at raise, refuse to start work while parts are short, issue on completion */
export interface MaterialsHook {
  onRaise?(wo: WorkOrder): void
  /** why the job cannot start for lack of materials (null = it can) */
  gate?(wo: WorkOrder): string | null
  onComplete?(wo: WorkOrder): void
  onCancel?(wo: WorkOrder): void
}
let materials: MaterialsHook | null = (hot?.data?.materials as MaterialsHook | undefined) ?? null
export function registerMaterialsHook(h: MaterialsHook | null) {
  materials = h
  if (hot) hot.data.materials = h
}
/** a materials failure never breaks the maintenance workflow */
function mat<K extends keyof MaterialsHook>(k: K, wo: WorkOrder | undefined): string | null {
  if (!wo || !materials?.[k]) return null
  try {
    const r = (materials[k] as (w: WorkOrder) => string | null | void)(wo)
    return typeof r === 'string' ? r : null
  } catch (e) {
    console.error(`[materials ${k}]`, e)
    return null
  }
}

// ================================================================= helpers

const fmtH = (h: number) => (h >= 10 ? h.toFixed(0) : h.toFixed(1))
function rec(who: OperatorAction['who'], action: string, tag?: string, detail?: string) {
  const s = S()
  if (typeof s.record === 'function') s.record({ who, action, tag, detail })
}
function mlog(text: string, level: MaintEvent['level'] = 'info', ref?: string) {
  setM((m) => ({ log: [{ t: S().t, text, level, ref }, ...m.log].slice(0, 300) }))
}
function patchWo(id: string, fn: (w: WorkOrder) => WorkOrder) {
  setM((m) => ({ wos: m.wos.map((w) => (w.id === id ? fn(w) : w)) }))
}
function woStatus(id: string, status: WoStatus, by: string, note?: string) {
  const t = S().t
  patchWo(id, (w) => ({ ...w, status, history: [...w.history, { t, status, by, note }], ...(status === 'complete' ? { completedAt: t } : {}), ...(status === 'returned' || status === 'cancelled' ? { closedAt: t } : {}) }))
}
function patchPermit(id: string, fn: (p: Permit) => Permit) {
  setM((m) => (m.permits[id] ? { permits: { ...m.permits, [id]: fn(m.permits[id]) } } : {}))
}
export const woById = (id: string) => M().wos.find((w) => w.id === id)
export const openWos = (tag: string) => M().wos.filter((w) => w.tag === tag && isOpen(w))

/** boe/d the plant loses while `tag` is out of service (rough planner's estimate) */
export function impactBoeD(tag: string): number {
  const s = S()
  const r = s.result
  const mpp = r?.mpp ?? 0
  const o = partnerOf(tag)
  if (o && runOf(o) !== 'tripped' && !s.lockouts?.[o]) return 0
  const gasBoe = (r?.gasProduced ?? 75) * A.BOE_PER_MMSCF
  if (tag === A.TAGS.compressor) return gasBoe
  if (tag === A.TAGS.iaCompressor || A.TAGS.exportPumps.includes(tag) || A.TAGS.gtgs.includes(tag)) return mpp
  if (A.TAGS.pwPumps.includes(tag)) return mpp * 0.6
  if (A.TAGS.swPumps.includes(tag) || A.TAGS.cmPumps.includes(tag)) return gasBoe
  if (A.TAGS.wi.liftPumps.includes(tag) || A.TAGS.wi.injPumps.includes(tag)) return mpp * 0.03
  return 0
}

/** hours a job takes for the planner (training mode compresses times like the engine did) */
function estimateH(tag: string, type: WoType): number {
  const e = plant().equipment.find((x) => x.tag === tag)
  const cls = e ? classOf(e) : null
  const f = trainingFactor()
  if (!cls) return (type === 'preventive' ? 2 : 4) * f
  const mttr = A.CLASS_DATA[cls].mttrH
  return mttr * (type === 'corrective' ? 1 : type === 'condition' ? 0.5 : 0.3) * f
}

// ================================================================= work orders

export interface RaiseOpts {
  type: WoType
  priority?: 1 | 2 | 3 | 4
  title?: string
  by?: string
  estH?: number
  permitType?: PermitType
  failureMode?: string
  failure?: boolean
  /** hidden work content (defaults to the estimate ± 25 %) */
  workH?: number
  who?: OperatorAction['who']
}

function raise(tag: string, o: RaiseOpts): { id: string | null; why: string | null } {
  const p = plant()
  const eq = p.equipment.find((e) => e.tag === tag)
  if (!eq) return { id: null, why: `${tag}: no such equipment` }
  const dup = M().wos.find((w) => w.tag === tag && isOpen(w) && w.type === o.type)
  if (dup) return { id: dup.id, why: `${dup.id} is already open for ${tag} (${WO_TYPE_LABEL[o.type]}, ${WO_STATUS_LABEL[dup.status]})` }
  const t = S().t
  const seq = M().seq.wo + 1
  const id = `WO-${String(seq).padStart(4, '0')}`
  const estH = o.estH ?? estimateH(tag, o.type)
  const cls = classOf(eq)
  const wo: WorkOrder = {
    id,
    tag,
    title: o.title ?? (o.type === 'preventive' && cls ? PM_TITLE[cls] : `${WO_TYPE_LABEL[o.type]} maintenance — ${eq.name}`),
    type: o.type,
    priority: o.priority ?? (o.type === 'corrective' ? 2 : 3),
    status: 'raised',
    raisedAt: t,
    raisedBy: o.by ?? 'CCR operator',
    estH,
    actualH: 0,
    workH: o.workH ?? estH * (0.8 + 0.5 * rnd()),
    deferredBoe: (impactBoeD(tag) * estH) / 24,
    permitType: o.permitType ?? 'cold',
    failureMode: o.failureMode,
    failure: o.failure,
    history: [{ t, status: 'raised', by: o.by ?? 'CCR operator' }],
  }
  setM((m) => ({ wos: [wo, ...m.wos].slice(0, 400), seq: { ...m.seq, wo: seq } }))
  rec(o.who ?? 'operator', 'woRaise', tag, `${id} ${WO_TYPE_LABEL[o.type]} P${wo.priority}: ${wo.title}`)
  mlog(`${id} raised for ${tag} — ${wo.title} (P${wo.priority}, by ${wo.raisedBy})`, o.type === 'corrective' ? 'warn' : 'info', id)
  mat('onRaise', wo)
  return { id, why: null }
}

function approve(id: string): string | null {
  const w = woById(id)
  if (!w) return `${id}: no such work order`
  if (w.status !== 'raised') return `${id} is ${WO_STATUS_LABEL[w.status]} — only a raised WO can be approved`
  woStatus(id, 'approved', 'Maintenance supervisor')
  rec('operator', 'woApprove', w.tag, id)
  return null
}

function setPriority(id: string, priority: 1 | 2 | 3 | 4): string | null {
  const w = woById(id)
  if (!w || !isOpen(w)) return `${id} is not open`
  patchWo(id, (x) => ({ ...x, priority, history: [...x.history, { t: S().t, status: 'note', by: 'operator', note: `priority → P${priority}` }] }))
  return null
}

/** build the isolation certificate for a permit */
function buildIsolation(tag: string, type: PermitType): { items: IsoItem[]; warnings: string[] } {
  const p = plant()
  const eq = p.equipment.find((e) => e.tag === tag)
  const items: IsoItem[] = []
  const warnings: string[] = []
  const machine = !!eq && !!classOf(eq)
  if (machine) items.push({ tag, kind: 'machine', action: type === 'electrical' ? 'Motor / drive isolated at the switchboard — locked and tagged (LOTO), prove dead' : 'Stopped, driver isolated at the switchboard — locked and tagged (LOTO)', done: false })
  if (type !== 'electrical') {
    const plan = planIsolation(p, tag, type === 'confined' ? 'positive' : 'valve', graphOf(p))
    if (plan) {
      const sv = S().valves ?? {}
      for (const pt of plan.points) {
        if (pt.type === 'psv') items.push({ tag: pt.tag, kind: 'manual', action: pt.action, done: false, note: pt.note })
        else if (sv[pt.tag]) items.push({ tag: pt.tag, kind: 'valve', action: `${pt.verify ? 'Verify closed' : 'Close'} from the DCS, actuator supply isolated, locked closed`, done: false, note: pt.second ? `double block with ${pt.second}` : undefined })
        else items.push({ tag: pt.tag, kind: 'manual', action: `Manual isolation — field operator to ${pt.verify ? 'verify closed' : 'close'} and lock (${pt.type}, ${pt.nps}")`, done: false, note: pt.second ? `double block with ${pt.second}` : undefined })
      }
      for (const b of plan.blinds) items.push({ tag: `${b.equipment}/${b.nozzle}`, kind: 'blind', action: `Fit spade at ${b.nozzle} (${b.name}, ${b.nps}" Class ${b.rating})`, done: false })
      if (plan.drains.length || plan.vents.length) items.push({ tag: 'DRAIN', kind: 'check', action: `Depressurise / drain the envelope (${[...plan.drains, ...plan.vents].slice(0, 3).join('; ')})`, done: false })
      if (plan.proving.length) items.push({ tag: 'PROVE', kind: 'check', action: `Prove zero energy on ${plan.proving.slice(0, 3).join(', ')}`, done: false })
      warnings.push(...plan.warnings)
      if (plan.alsoIsolated.length) warnings.push(`Also inside the envelope: ${plan.alsoIsolated.join(', ')}`)
    } else if (!machine) warnings.push(`${tag}: no isolation plan in the model — isolate per the site procedure`)
  }
  if (type === 'hot') items.push({ tag: 'GAS TEST', kind: 'check', action: 'Gas test at the worksite: 0 % LEL, continuous monitor, fire watch posted', done: false })
  if (type === 'confined') items.push({ tag: 'ENTRY', kind: 'check', action: 'Atmosphere test (O₂ 20.9 %, 0 % LEL, H₂S 0 ppm), standby man and rescue plan', done: false })
  return { items, warnings }
}

/** approved → planned: the permit is requested with its isolation certificate */
function plan(id: string, type?: PermitType): string | null {
  const w = woById(id)
  if (!w) return `${id}: no such work order`
  if (w.status !== 'approved') return `${id} must be approved before it is planned`
  const ptype = type ?? w.permitType
  const p = plant()
  const seq = M().seq.ptw + 1
  const pid = `PTW-${String(seq).padStart(4, '0')}`
  const { items, warnings } = buildIsolation(w.tag, ptype)
  const t = S().t
  const permit: Permit = {
    id: pid,
    wo: id,
    tag: w.tag,
    type: ptype,
    status: 'requested',
    platform: platformOf(p, w.tag),
    planned: w.type === 'preventive',
    requestedAt: t,
    revalidations: 0,
    isolations: items,
    warnings,
    log: [{ t, text: `Requested (${PERMIT_LABEL[ptype]}) for ${id}` }],
  }
  setM((m) => ({ permits: { ...m.permits, [pid]: permit }, seq: { ...m.seq, ptw: seq } }))
  patchWo(id, (x) => ({ ...x, permit: pid, permitType: ptype, deferredBoe: (impactBoeD(x.tag) * x.estH) / 24 }))
  woStatus(id, 'planned', 'Planner', `${pid} requested`)
  rec('operator', 'permitRequest', w.tag, `${pid} ${PERMIT_LABEL[ptype]} for ${id}`)
  return null
}

/** SIMOPS: why a permit of `type` cannot be live on `platform` right now (null = it can) */
export function simopsBlock(type: PermitType, platform: PlatformId): string | null {
  const s = S()
  const esd = (s.shutdowns ?? []).find((x) => !x.resetAt && (x.level === 'APS' || (x.level === 'ESD1' && x.platform === platform)))
  if (esd) return `${esd.level} on ${esd.platform} — all permits suspended`
  if (type !== 'hot') return null
  const p = plant()
  const ga = s.result?.platforms?.[platform]?.ga
  if (ga && ga !== 'normal') return `General alarm (${ga}) on ${platform} — hot work suspended`
  for (const z of Object.values(s.fg ?? {})) if (z.gas !== 'normal' && zonePlatform(p, z.zone) === platform) return `Gas detected in zone ${z.zone} (${z.gas}) on ${platform} — hot work suspended`
  const gasAlarm = (s.alarms ?? []).find((a) => a.active && a.kind === 'fg' && a.platform === platform && /gas/i.test(a.text))
  if (gasAlarm) return `Gas alarm ${gasAlarm.tag} on ${platform} — hot work suspended`
  return null
}

function rollback(pid: string, tags: string[]) {
  const s = S()
  for (const t of tags) s.release?.(t, pid)
}

/** issue the permit: the isolation certificate is applied (lock-outs through the engine) */
function issue(pid: string): string | null {
  const p = M().permits[pid]
  if (!p) return `${pid}: no such permit`
  if (p.status !== 'requested') return `${pid} is ${p.status}`
  const block = simopsBlock(p.type, p.platform)
  if (block) return `Cannot issue ${pid}: ${block}`
  const s = S()
  if (typeof s.lockOut !== 'function') return 'Simulation engine has no lock-outs yet'
  const st = runOf(p.tag)
  const isMachine = p.isolations.some((i) => i.kind === 'machine')
  if (isMachine && (st === 'running' || st === 'starting')) {
    const o = partnerOf(p.tag)
    return `${p.tag} is ${st} — ${o ? `change over to ${o} and ` : ''}stop it before the isolation is applied`
  }
  const done: string[] = []
  const t = s.t
  const items = p.isolations.map((i) => ({ ...i }))
  for (const i of items) {
    if (i.kind !== 'machine' && i.kind !== 'valve') continue
    const why = s.lockOut(i.tag, pid, { planned: p.planned, ...(i.kind === 'valve' ? { position: 'closed' as const } : {}) })
    if (why) {
      // a shared isolation point already locked closed by another permit counts (multi-lock hasp)
      const lk = S().lockouts?.[i.tag]
      if (i.kind === 'valve' && lk && lk.position === 'closed') {
        i.note = `shared — also locked by ${lk.by}`
        continue
      }
      rollback(pid, done)
      return `Cannot issue ${pid}: ${why}`
    }
    done.push(i.tag)
    if (i.kind === 'machine') Object.assign(i, { done: true, at: t, by: 'operator' as const })
  }
  patchPermit(pid, (x) => ({ ...x, status: 'issued', issuedAt: t, isolations: items, log: [...x.log, { t, text: `Issued — ${done.length} lock-out(s) applied from the DCS` }] }))
  rec('operator', 'permitIssue', p.tag, `${pid} ${PERMIT_LABEL[p.type]} — locked out ${done.join(', ') || 'nothing'}`)
  mlog(`${pid} issued for ${p.tag} (${PERMIT_LABEL[p.type]})`, 'info', pid)
  return null
}

/** the field operator confirms a manual isolation / check (tag = item tag, or 'all') */
function confirm(pid: string, tag: string | 'all'): string | null {
  const p = M().permits[pid]
  if (!p) return `${pid}: no such permit`
  if (p.status !== 'issued' && p.status !== 'suspended') return `${pid} must be issued before isolations are confirmed`
  const t = S().t
  let n = 0
  const items = p.isolations.map((i) => {
    if (i.done || i.kind === 'machine' || i.kind === 'valve') return i
    if (tag !== 'all' && i.tag !== tag) return i
    n++
    return { ...i, done: true, at: t, by: 'field' as const }
  })
  if (!n) return tag === 'all' ? 'Nothing left for the field operator to confirm' : `${tag}: nothing to confirm`
  patchPermit(pid, (x) => ({ ...x, isolations: items, log: [...x.log, { t, text: `Field operator confirmed ${tag === 'all' ? `${n} item(s)` : tag}` }] }))
  rec('field', 'isoConfirm', p.tag, `${pid}: ${tag === 'all' ? `${n} manual isolation(s)` : tag} closed & locked`)
  return null
}

export const isolationComplete = (p: Permit) => p.isolations.every((i) => i.done)

function startWork(id: string): string | null {
  const w = woById(id)
  if (!w) return `${id}: no such work order`
  const p = w.permit ? M().permits[w.permit] : undefined
  if (!p || (p.status !== 'issued' && p.status !== 'suspended')) return `${id}: no issued permit — work cannot start`
  if (p.status === 'suspended') return `${p.id} is suspended (${p.suspendReason}) — re-validate it first`
  if (!isolationComplete(p)) return `${id}: isolation not in place — ${p.isolations.filter((i) => !i.done).map((i) => i.tag).join(', ')} outstanding`
  const lk = S().lockouts?.[w.tag]
  if (p.isolations.some((i) => i.kind === 'machine') && lk?.by !== p.id) return `${id}: ${w.tag} is not locked out under ${p.id}`
  if (w.status !== 'isolated') return `${id} is ${WO_STATUS_LABEL[w.status]}`
  const short = mat('gate', w)
  if (short) return short
  woStatus(id, 'inProgress', 'Maintenance technician', `work started under ${p.id}`)
  rec('operator', 'woStart', w.tag, `${id} work started under ${p.id}`)
  return null
}

function closePermit(pid: string, why: string, who: OperatorAction['who']): string[] {
  const p = M().permits[pid]
  if (!p || p.status === 'closed') return []
  const s = S()
  const released: string[] = []
  const restore: string[] = []
  const p0 = plant()
  for (const i of p.isolations) {
    if (i.kind !== 'machine' && i.kind !== 'valve') continue
    if (s.lockouts?.[i.tag]?.by !== pid) continue
    if (s.release?.(i.tag, pid) === null) released.push(i.tag)
    if (i.kind === 'valve') {
      // de-isolation: back to the valve's normal position (refused while a shutdown holds it)
      const v = p0.valves.find((x) => x.tag === i.tag)
      if (v && v.normally === 'open') {
        const r = s.setValve?.(i.tag, 'open', pid)
        restore.push(r ? `${i.tag} left closed (${r})` : `${i.tag} reopened`)
      }
    }
  }
  const t = s.t
  patchPermit(pid, (x) => ({ ...x, status: 'closed', closedAt: t, log: [...x.log, { t, text: `${why} — released ${released.join(', ') || 'no lock-outs'}${restore.length ? `; ${restore.join(', ')}` : ''}` }] }))
  rec(who, 'permitSignOff', p.tag, `${pid} ${why}; released ${released.join(', ') || '—'}`)
  return released
}

/** complete → returned to service: the permit is signed off and the lock-outs released */
function returnToService(id: string): string | null {
  const w = woById(id)
  if (!w) return `${id}: no such work order`
  if (w.status !== 'complete') return `${id} is ${WO_STATUS_LABEL[w.status]} — the work is not complete`
  if (w.permit) closePermit(w.permit, 'Signed off — work complete, equipment handed back', 'operator')
  const s = S()
  let note = 'permit signed off, lock-outs released'
  if (runOf(w.tag) === 'tripped') {
    const r = simMod.actAs('field', () => s.resetTrip?.(w.tag, { local: true }))
    note += r ? ` · trip not reset: ${r}` : ' · trip reset locally by the technician'
  }
  woStatus(id, 'returned', 'CCR operator', note)
  rec('operator', 'woReturn', w.tag, `${id} returned to service`)
  mlog(`${id} ${w.tag} returned to service`, 'info', id)
  return null
}

/** sign a permit off (from the permit list): for a completed WO this is return to service */
function signOff(pid: string): string | null {
  const p = M().permits[pid]
  if (!p) return `${pid}: no such permit`
  if (p.status === 'closed') return `${pid} is already closed`
  const w = woById(p.wo)
  if (w?.status === 'complete') return returnToService(w.id)
  if (w?.status === 'inProgress') return `${p.wo} is in progress — the work must be complete (or the WO cancelled) before ${pid} is signed off`
  closePermit(pid, 'Signed off before work started', 'operator')
  if (w && isOpen(w)) woStatus(w.id, 'approved', 'CCR operator', `${pid} signed off unused — re-plan to continue`)
  if (w) patchWo(w.id, (x) => ({ ...x, permit: undefined }))
  return null
}

function suspend(pid: string, reason: string, who: OperatorAction['who'] = 'operator'): string | null {
  const p = M().permits[pid]
  if (!p || p.status !== 'issued') return `${pid} is not live`
  const t = S().t
  patchPermit(pid, (x) => ({ ...x, status: 'suspended', suspendedAt: t, suspendReason: reason, log: [...x.log, { t, text: `SUSPENDED — ${reason}` }] }))
  rec(who, 'permitSuspend', p.tag, `${pid}: ${reason}`)
  mlog(`${pid} (${PERMIT_LABEL[p.type]}, ${p.tag}) SUSPENDED — ${reason}`, 'warn', pid)
  return null
}

function revalidate(pid: string): string | null {
  const p = M().permits[pid]
  if (!p || p.status !== 'suspended') return `${pid} is not suspended`
  const block = simopsBlock(p.type, p.platform)
  if (block) return `Cannot re-validate ${pid}: ${block}`
  const t = S().t
  patchPermit(pid, (x) => ({ ...x, status: 'issued', suspendReason: undefined, revalidations: x.revalidations + 1, log: [...x.log, { t, text: `Re-validated (worksite re-checked, gas test repeated)` }] }))
  rec('operator', 'permitRevalidate', p.tag, pid)
  mlog(`${pid} re-validated`, 'info', pid)
  return null
}

function cancel(id: string, why = 'cancelled by the operator'): string | null {
  const w = woById(id)
  if (!w || !isOpen(w)) return `${id} is not open`
  if (w.status === 'complete') return `${id} is complete — return it to service instead`
  if (w.permit) closePermit(w.permit, `WO cancelled (${why})`, 'operator')
  woStatus(id, 'cancelled', 'CCR operator', why)
  mat('onCancel', woById(id))
  rec('operator', 'woCancel', w.tag, `${id}: ${why}`)
  return null
}

/** duty / standby: start the partner; the plugin stops this one when the partner is running */
const changeovers = new Map<string, string>()
function changeOver(tag: string): string | null {
  const o = partnerOf(tag)
  if (!o) return `${tag} has no standby machine`
  const s = S()
  const st = runOf(o)
  if (st === 'running') return s.stop?.(tag) ?? null
  if (typeof s.start !== 'function') return 'Simulation engine not ready'
  const r = s.start(o)
  if (r) return r
  changeovers.set(o, tag)
  rec('operator', 'changeover', tag, `starting ${o}; ${tag} stops when it is running`)
  return null
}
function stopMachine(tag: string): string | null {
  const s = S()
  return typeof s.stop === 'function' ? s.stop(tag) : 'Simulation engine not ready'
}

/** instructor / test: start (or set) degradation on a machine */
function seed(tag: string, degr = 0.3, opts?: { pfH?: number; mode?: string }): string | null {
  const h = M().health[tag]
  if (!h) return `${tag} is not a monitored machine`
  const cd = A.CLASS_DATA[h.cls]
  const mode = opts?.mode ?? h.mode ?? cd.failures[Math.floor(rnd() * cd.failures.length)]
  const pfH = opts?.pfH ?? (h.degr > 0 ? h.pfH : 1.5)
  const d = Math.max(0, Math.min(1, degr))
  // the next plugin step crosses the P-F thresholds (alert → WO, alarm, failure) as if it had degraded
  const stage: Stage = h.stage === 'failed' ? 'failed' : 'normal'
  setM((m) => ({ health: { ...m.health, [tag]: { ...h, degr: d, pfH, mode, stage, onsetAt: h.onsetAt ?? S().t, sig: signals(h.cls, d, mode) } } }))
  rec('instructor', 'cmSeed', tag, `degradation ${Math.round(d * 100)} % (${mode}), P-F ${fmtH(pfH)} running h`)
  return null
}

function focus(tag: string) {
  setM((m) => ({ focus: { tag, n: (m.focus?.n ?? 0) + 1, wall: Date.now() } }))
}

/** the maintenance actions (plain functions so HMR always runs the current code) */
export const maint = {
  raise,
  approve,
  setPriority,
  plan,
  issue,
  confirm,
  startWork,
  returnToService,
  signOff,
  suspend,
  revalidate,
  cancel,
  changeOver,
  stopMachine,
  seed,
  focus,
  /** raise from the console / Inspector with sensible defaults (condition-based when CM has flagged it) */
  raiseFor(tag: string, by = 'CCR operator') {
    const h = M().health[tag]
    const type: WoType = h && (h.stage === 'alert' || h.stage === 'alarm') ? 'condition' : 'corrective'
    return raise(tag, { type, priority: h?.stage === 'alarm' ? 2 : 3, by, title: h?.mode && type === 'condition' ? `CM: ${h.mode} — investigate & repair` : undefined })
  },
}

// ================================================================= plugin step

/** per-tick bookkeeping kept out of the store so healthy machines' objects stay identical tick to tick */
const lastRun = new Map<string, number>()
let prevStatus: Record<string, RunState> = {}
let prevShutdowns: Record<string, { resetAt?: number }> = {}

function initPlant(p: Plant) {
  lastRun.clear()
  prevStatus = {}
  prevShutdowns = {}
  const health: Record<string, Health> = {}
  const pm: Record<string, PmItem> = {}
  for (const { tag, cls } of machineTags(p)) {
    const sp = SIGNALS[cls]
    health[tag] = { tag, cls, degr: 0, pfH: 0, stage: 'normal', sig: [sp[0].n, sp[1].n, sp[2].n], hist: [], recent: [] }
    lastRun.set(tag, S().machines?.[tag]?.runHours ?? 0)
    const intervalH = PM_H[cls]
    // spread the PM due dates over the interval so they don't all come due at once
    pm[tag] = { tag, cls, intervalH, frac: 0.8 * rnd(), count: 0 }
  }
  setM({ ...emptyData(), plantName: p.name, health, pm })
}

function pmInterval(item: PmItem) {
  return S().knobs?.reliability === 'training' ? item.intervalH / 100 : item.intervalH
}
export const pmIntervalH = (item: PmItem) => pmInterval(item)

function cmText(tag: string, h: Health) {
  const i = primaryIndex(h)
  const sp = SIGNALS[h.cls][i]
  const v = h.sig[i]
  const value = `${v.toFixed(v < 10 ? 1 : 0)} ${sp.unit}`
  return { tag, value, text: `${tag} condition monitoring ${h.stage === 'alarm' ? 'alarm' : 'alert'} — ${sp.label} ${value}${h.mode ? ` (${h.mode})` : ''}` }
}

/** engine hook: standing CM conditions, reconciled by the engine like its own alarms (P3) */
function alarms(): PluginAlarm[] {
  const out: PluginAlarm[] = []
  const p = plant()
  for (const h of Object.values(M().health)) {
    if (h.stage !== 'alert' && h.stage !== 'alarm') continue
    const a = cmText(h.tag, h)
    out.push({ key: `${h.tag}:CM${h.stage === 'alarm' ? 'ALARM' : 'ALERT'}`, tag: h.tag, text: a.text, priority: 3 as AlarmPriority, kind: 'equipment', platform: platformOf(p, h.tag), value: a.value })
  }
  return out
}

const CM_KEYS: Record<string, number> = { vib: 0, temp: 1, x: 2 }
/** engine hook: live value of the simulated CM metrics `<tag>·CM<vib|temp|x>` (metrics.ts) while the machine runs */
function value(tag: string): number | undefined {
  const k = tag.indexOf('·CM')
  if (k < 0) return undefined
  const m = tag.slice(0, k)
  const h = M().health[m]
  if (!h || runOf(m) !== 'running') return undefined
  return h.sig[CM_KEYS[tag.slice(k + 3)] ?? 0]
}

function step(dt: number, t: number) {
  const p = plant()
  if (M().plantName !== p.name || !Object.keys(M().health).length) initPlant(p)
  const s = S()
  const knobs = s.knobs
  const factor = A.RELIABILITY_FACTOR[knobs?.reliability ?? 'off'] ?? 0
  const m0 = M()
  let health = m0.health
  let healthChanged = false
  let pm = m0.pm
  const cmAlarms: Record<string, CmAlarm> = {}
  // open work orders by tag, built once per tick (O(work orders))
  const openBy = new Map<string, WorkOrder[]>()
  for (const w of m0.wos) if (isOpen(w)) (openBy.get(w.tag) ?? openBy.set(w.tag, []).get(w.tag)!).push(w)
  const hasOpen = (tag: string, types: WoType[]) => (openBy.get(tag) ?? []).some((w) => types.includes(w.type))
  const sample = t >= m0.nextSample
  const toRaise: [string, RaiseOpts][] = []
  const escalate: string[] = []
  const machines = s.machines ?? {}

  for (const tag of Object.keys(m0.health)) {
    const h0 = m0.health[tag]
    const st = runOf(tag)
    const runH = machines[tag]?.runHours ?? lastRun.get(tag) ?? 0
    // first sight (also after an HMR reload of this module): no running time to account yet
    const dRun = lastRun.has(tag) ? Math.max(0, runH - lastRun.get(tag)!) : 0
    lastRun.set(tag, runH)
    const h = h0
    const cd = A.CLASS_DATA[h.cls]
    let degr = h.degr
    let { stage, mode, pfH, onsetAt, failedAt, failedOpen } = h
    // onset (random, per running hour) — the P-F interval scales with the effective MTBF
    if (degr === 0 && stage === 'normal' && factor > 0 && dRun > 0) {
      const mtbf = cd.mtbfH / factor
      if (rnd() < 1 - Math.exp(-dRun / (mtbf * 0.75))) {
        degr = 0.01
        pfH = mtbf * 0.25 * (0.7 + 0.6 * rnd())
        mode = cd.failures[Math.floor(rnd() * cd.failures.length)]
        onsetAt = t
      }
    }
    if (degr > 0 && stage !== 'failed' && dRun > 0 && pfH > 0) degr = Math.min(1, degr + dRun / pfH)
    // P-F thresholds (several can be crossed in one long step)
    if (stage !== 'failed') {
      if (degr >= 1 && st === 'running') {
        stage = 'failed'
        failedAt = t
        failedOpen = true
        const est = cd.mttrH * trainingFactor()
        const work = est * (0.8 + 0.5 * rnd())
        s.trip?.(tag, `FAILURE: ${mode ?? cd.failures[0]}`, { local: true, repairH: work })
        rec('auto', 'failure', tag, `${mode} — tripped at degradation 100 %`)
        const cbm = (openBy.get(tag) ?? []).find((w) => w.type === 'condition' && (w.status === 'raised' || w.status === 'approved' || w.status === 'planned' || w.status === 'isolated'))
        if (cbm) {
          // too late — the condition-based job becomes a breakdown repair
          patchWo(cbm.id, (w) => ({ ...w, type: 'corrective', priority: 1, title: `FAILURE: ${mode} — repair`, failureMode: mode, failure: true, estH: est, workH: work, deferredBoe: (impactBoeD(tag) * est) / 24, history: [...w.history, { t, status: 'note', by: 'auto', note: 'machine failed before the work was done — now a corrective repair' }] }))
        } else toRaise.push([tag, { type: 'corrective', priority: impactBoeD(tag) > 0 ? 1 : 2, title: `FAILURE: ${mode} — repair`, by: AUTO_TRIP, estH: est, workH: work, failureMode: mode, failure: true, who: 'auto' }])
      } else {
        if (degr >= ALERT && stage === 'normal') {
          stage = 'alert'
          rec('auto', 'cmAlert', tag, `${mode} — condition monitoring alert`)
          if (!hasOpen(tag, ['condition', 'corrective'])) toRaise.push([tag, { type: 'condition', priority: 2, title: `CM: ${mode ?? 'degradation'} — investigate & repair`, by: 'Auto (condition monitoring)', failureMode: mode, who: 'auto' }])
        }
        if (degr >= ALARM && stage === 'alert') {
          stage = 'alarm'
          rec('auto', 'cmAlarm', tag, `${mode} — condition monitoring alarm`)
          escalate.push(tag)
        }
      }
    } else if (failedOpen && st === 'running') {
      // started again without the repair: the fault is still there
      s.trip?.(tag, `FAILURE: ${mode ?? 'not repaired'} (restarted without repair)`, { local: true })
    }
    // a new object only when something changed (healthy machines stay identical → selectors stay stable)
    const moved = degr !== h.degr || stage !== h.stage || mode !== h.mode || failedOpen !== h.failedOpen
    if (moved || (sample && degr > 0)) {
      const nh: Health = { ...h, degr, stage, mode, pfH, onsetAt, failedAt, failedOpen }
      if (moved) nh.sig = signals(h.cls, degr, mode)
      if (degr > 0) nh.recent = [...h.recent.slice(-89), degr]
      if (sample) nh.hist = [...h.hist.slice(-143), degr]
      if (!healthChanged) health = { ...health }
      healthChanged = true
      health[tag] = nh
    }
    const hc = health[tag]
    if (hc.stage === 'alarm') {
      const a = cmText(tag, hc)
      const prev = m0.cmAlarms[tag]
      cmAlarms[tag] = prev && prev.text === a.text ? prev : { ...a, at: prev?.at ?? t }
    }
    // PM: running hours since the last PM
    const item = pm[tag]
    if (item) {
      const iv = pmInterval(item)
      const frac = item.frac + dRun / iv
      if (dRun > 0) {
        if (pm === m0.pm) pm = { ...pm }
        pm[tag] = { ...item, frac }
      }
      if (frac >= 0.9 && !hasOpen(tag, ['preventive'])) toRaise.push([tag, { type: 'preventive', priority: frac >= 1 ? 3 : 4, by: 'PM scheduler', who: 'auto' }])
    }
  }

  // failures the plugin didn't cause (instructor trips with a repair time) → corrective WO
  for (const tag of Object.keys(health)) {
    if (runOf(tag) !== 'tripped') continue
    const mm = machines[tag]
    const cause = mm?.tripCause ?? ''
    if (!(/^FAILURE/i.test(cause) || mm?.repairUntil)) continue
    if (health[tag].failedOpen) continue
    if (hasOpen(tag, ['corrective']) || toRaise.some(([x, o]) => x === tag && o.type === 'corrective')) continue
    const left = mm?.repairUntil ? Math.max(0.1, (mm.repairUntil - t) / 3600) : estimateH(tag, 'corrective')
    toRaise.push([tag, { type: 'corrective', priority: impactBoeD(tag) > 0 ? 1 : 2, title: `Trip repair — ${cause.replace(/^FAILURE:\s*/i, '')}`, by: AUTO_TRIP, estH: left, workH: left, failureMode: cause, who: 'auto' }])
  }

  const sameAlarms = Object.keys(cmAlarms).length === Object.keys(m0.cmAlarms).length && Object.entries(cmAlarms).every(([k, v]) => m0.cmAlarms[k] === v)
  setM({ ...(healthChanged ? { health } : {}), ...(pm !== m0.pm ? { pm } : {}), ...(sameAlarms ? {} : { cmAlarms }), ...(sample ? { nextSample: t + 300 } : {}) })
  for (const [tag, o] of toRaise) raise(tag, o)
  for (const tag of escalate) for (const w of openWos(tag)) if (w.priority > 2) setPriority(w.id, 2)

  // changeovers waiting for the standby to run
  for (const [o, tag] of [...changeovers]) {
    const st = runOf(o)
    if (st === 'running') {
      changeovers.delete(o)
      if (runOf(tag) === 'running') s.stop?.(tag)
    } else if (st !== 'starting') changeovers.delete(o)
  }

  stepPermits(t, dt)
  stepShiftLog(t)
}

function stepPermits(t: number, dt: number) {
  const s = S()
  const lockouts = s.lockouts ?? {}
  for (const p of Object.values(M().permits)) {
    if (p.status === 'closed' || p.status === 'requested') continue
    // valves stroke closed after the lock-out; a shared lock that was released is re-applied
    let changed = false
    const items = p.isolations.map((i) => {
      if (i.kind !== 'valve' || i.done) return i
      const lk = lockouts[i.tag]
      if (!lk && typeof s.lockOut === 'function') s.lockOut(i.tag, p.id, { planned: p.planned, position: 'closed' })
      const v = s.valves?.[i.tag]
      if (v && v.pos <= 0.02 && (lockouts[i.tag] ?? S().lockouts?.[i.tag])) {
        changed = true
        return { ...i, done: true, at: t, by: 'auto' as const }
      }
      return i
    })
    if (changed) patchPermit(p.id, (x) => ({ ...x, isolations: items }))
    const cur = M().permits[p.id]
    // SIMOPS
    if (cur.status === 'issued') {
      const block = simopsBlock(cur.type, cur.platform)
      if (block) suspend(cur.id, block, 'auto')
    }
    const w = woById(cur.wo)
    if (!w) continue
    if (w.status === 'planned' && cur.status === 'issued' && isolationComplete(cur)) woStatus(w.id, 'isolated', 'Area authority', `isolation certificate ${cur.id} complete`)
    if (w.status === 'inProgress' && M().permits[cur.id].status === 'issued') {
      const actualH = w.actualH + dt / 3600
      if (actualH >= w.workH) {
        patchWo(w.id, (x) => ({ ...x, actualH }))
        woStatus(w.id, 'complete', 'Maintenance technician', `work done in ${fmtH(actualH)} h (estimate ${fmtH(w.estH)} h)`)
        mat('onComplete', woById(w.id))
        restoreHealth(w)
        // a PM that hasn't started yet is done with this job
        for (const o of M().wos) if (o.id !== w.id && o.tag === w.tag && o.type === 'preventive' && (o.status === 'raised' || o.status === 'approved')) woStatus(o.id, 'cancelled', 'Planner', `combined with ${w.id}`)
        rec('auto', 'woComplete', w.tag, `${w.id} complete — ${fmtH(actualH)} h`)
        mlog(`${w.id} ${w.tag} work complete — sign the permit off to return it to service`, 'info', w.id)
      } else patchWo(w.id, (x) => ({ ...x, actualH }))
    }
  }
  // corrective WOs for instructor trips the engine has already repaired and the operator restarted
  for (const w of M().wos) {
    if (w.type !== 'corrective' || w.failure || w.permit || !isOpen(w) || w.raisedBy !== AUTO_TRIP) continue
    if (runOf(w.tag) === 'running') woStatus(w.id, 'returned', 'auto', 'machine back in service without a maintenance permit (closed out)')
  }
}

function restoreHealth(w: WorkOrder) {
  const t = S().t
  setM((m) => {
    const h = m.health[w.tag]
    const out: Partial<MaintData> = {}
    if (h) {
      const sp = SIGNALS[h.cls]
      out.health = { ...m.health, [w.tag]: { ...h, degr: 0, stage: 'normal', mode: undefined, onsetAt: undefined, failedAt: undefined, failedOpen: false, pfH: 0, recent: [], sig: [sp[0].n, sp[1].n, sp[2].n] } }
    }
    const item = m.pm[w.tag]
    // any intrusive work on the machine resets the PM clock
    if (item) out.pm = { ...m.pm, [w.tag]: { ...item, frac: 0, lastAt: t, count: item.count + (w.type === 'preventive' ? 1 : 0) } }
    return out
  })
}

function stepShiftLog(t: number) {
  const s = S()
  const m = M()
  const add: ShiftEvent[] = []
  const prev = prevStatus
  const now: Record<string, RunState> = {}
  let shift = m.shift
  for (const tag of Object.keys(m.health)) {
    const st = runOf(tag)
    now[tag] = st
    if (st === 'tripped' && prev[tag] && prev[tag] !== 'tripped') add.push({ t, kind: 'trip', tag, text: s.machines?.[tag]?.tripCause ?? 'trip' })
    if (prev[tag] === 'tripped' && st !== 'tripped') {
      shift = shift.map((e) => (e.kind === 'trip' && e.tag === tag && e.resetAt === undefined ? { ...e, resetAt: t } : e))
      add.push({ t, kind: 'reset', tag, text: 'trip reset' })
    }
  }
  const prevSd = prevShutdowns
  const sdNow: Record<string, { resetAt?: number }> = {}
  for (const sd of s.shutdowns ?? []) {
    sdNow[sd.id] = { resetAt: sd.resetAt }
    if (!prevSd[sd.id]) add.push({ t: sd.at, kind: 'shutdown', tag: sd.id, text: `${sd.level} ${sd.platform}${sd.zone ? ` ${sd.zone}` : ''} — ${sd.cause}`, platform: sd.platform, resetAt: sd.resetAt })
    else if (sd.resetAt && !prevSd[sd.id].resetAt) shift = shift.map((e) => (e.kind === 'shutdown' && e.tag === sd.id ? { ...e, resetAt: sd.resetAt } : e))
  }
  for (const id of Object.keys(prevSd)) if (!sdNow[id]) add.push({ t, kind: 'sdCleared', tag: id, text: `${id} cleared (platform restarted)` })
  prevStatus = now
  prevShutdowns = sdNow
  const patch: Partial<MaintData> = {}
  if (add.length || shift !== m.shift) patch.shift = [...add.reverse(), ...shift].slice(0, 600)
  if (t >= m.nextSnap) {
    const k: Kpis | undefined = s.kpis
    if (k) patch.snaps = [...m.snaps.slice(-71), { t, produced: k.producedBoe, potential: k.potentialBoe, losses: { ...k.losses }, trips: k.trips, shutdowns: k.shutdowns }]
    patch.nextSnap = t + 1800
  }
  if (Object.keys(patch).length) setM(patch)
}

function reset() {
  changeovers.clear()
  const p = plant()
  initPlant(p)
}

// ================================================================= registration (idempotent by id)

const plugin: SimPlugin = { id: 'maintenance', step, reset, alarms, value }
// health and the PM schedule exist from the start (the plugin only steps while the clock runs)
try {
  if (!Object.keys(M().health).length) initPlant(plant())
} catch {
  /* plant not loaded yet — the first step initialises */
}
if (typeof simMod.registerSimPlugin === 'function') simMod.registerSimPlugin(plugin)
if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __maint: useMaint, __maintApi: maint })

// ================================================================= read helpers for the UI

/** predicted running hours to functional failure (trend extrapolation), null when there is no trend yet */
export function ttfH(h: Health): number | null {
  if (h.stage === 'failed') return 0
  if (h.degr < 0.25 || h.pfH <= 0) return null
  return (1 - h.degr) * h.pfH
}
/** live value of a machine's CM signal i (O(1) — metrics.ts reads it on every sample) */
export function healthValue(tag: string, i: number): number | undefined {
  return M().health[tag]?.sig[i]
}
const seriesCache = new WeakMap<number[], number[][]>()
/** short trend of CM signal i (memoised per health update), undefined while the machine is healthy */
export function healthSeries(tag: string, i: number): number[] | undefined {
  const h = M().health[tag]
  if (!h || h.recent.length < 2) return undefined
  let c = seriesCache.get(h.recent)
  if (!c) {
    const w = weights(h.mode)
    c = SIGNALS[h.cls].map((spec, k) => h.recent.map((d) => sigValue(spec, d * w[k])))
    seriesCache.set(h.recent, c)
  }
  return c[i]
}
/** signal specs for an equipment (metrics.ts builds its simulated CM metrics from them) */
export function signalSpecs(e: Equipment): SigSpec[] | undefined {
  const c = classOf(e)
  return c ? SIGNALS[c] : undefined
}
/** long-trend series of the leading signal (CM table sparkline) */
export function trendOf(h: Health): number[] {
  const i = primaryIndex(h)
  const spec = SIGNALS[h.cls][i]
  const w = weights(h.mode)[i]
  return h.hist.map((d) => sigValue(spec, d * w))
}
