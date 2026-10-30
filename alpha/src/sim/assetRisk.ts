/**
 * Asset-risk register (plan 13 B): $ exposure per monitored machine over a planning horizon (real days).
 *
 *   P(fail)      failed → 1; degrading → lognormal around the predicted time to failure (σ = 0.5) combined
 *                with the background hazard; healthy → 1 − exp(−h / MTBF) with h = horizon × duty (standby
 *                0.15). Design MTBF from CLASS_DATA, never the reliability knob (a planning view).
 *                Time to failure (`ttfH`, running hours) is read on the LOGISTICS clock: in demo mode one
 *                logistics day is DEMO_DAY_S sim s, so "does the part land before the failure" matches what the
 *                demo will actually show; in real mode it is plain days.
 *   consequence  impactBoeD × (repair days + parts wait) × $/boe + labour + parts. Parts wait = `coverFor`;
 *                parts already on order count down to the predicted failure. Machines whose loss is gas (export
 *                compressor, sea-water lift and cooling-medium pumps) are valued at the gas price per boe,
 *                everything else at the blended $/boe of the current potential mix.
 *   exposure     P × consequence.
 *   lever        degrading: the cheapest option that lands before the predicted failure (expedite / emergency
 *                order / transfer from base); otherwise the one with the best saving net of premium and charter;
 *                with the parts on board, raise the work order. Saving = the drop in exposure.
 *
 * Pure reads of the sim, maintenance and spares stores, memoised per sim tick. The finance plugin
 * (finance.ts) calls it at ≤ 1 Hz wall and keeps the result in `useFinance().risks`; never call it in render.
 *
 * Everything is SIMULATED: prices are an editable assumption, parts / lead times come from the spares seed.
 */
import type { Plant } from '../model/types'
import { usePlantStore } from '../state/plantStore'
import { useSim } from '../state/sim'
import * as A from './alpha'
import { DEMO_DAY_S, daySeconds, type AssetRisk, type PoMode, type PriceDeck, type SparePart, type SparesData } from './assetTypes'
import { platformOfTag } from './fg'
import { CLASS_LABEL, WO_STATUS_LABEL, classOf, impactBoeD, openWos, partnerOf, runOf, ttfH, useMaint, type Health, type WorkOrder } from './maintenance'
import * as sparesMod from './spares'
import { coverFor, useSpares } from './spares'
import type { PlantResult, PlatformId } from './types'

// ================================================================= price deck & unit values (shared with finance.ts)

/** default price deck — an ASSUMPTION for the simulation, not a market quote */
export const DEFAULT_DECK: PriceDeck = {
  oil: 75,
  gas: 4,
  hhv: 1.05,
  fixedOpexD: 380000,
  varOpexBbl: 2.5,
  labourH: 450,
  carbon: 50,
  royalty: 0,
}

/** USD per unit at the current deck and production mix */
export interface UnitValues {
  /** oil, USD/bbl */
  oilBbl: number
  /** sales gas, USD/Mscf and USD/boe */
  gasMscf: number
  gasBoe: number
  /** blended USD/boe of the current maximum-production-potential mix */
  blendBoe: number
}
/** design mix when there is no result yet (≈ 78 % oil by boe) */
const OIL_SHARE0 = 0.78
export function unitValues(deck: PriceDeck, r: PlantResult | null | undefined): UnitValues {
  const gasMscf = deck.gas * deck.hhv
  const gasBoe = (gasMscf * 1000) / A.BOE_PER_MMSCF
  const mpp = r?.mpp ?? 0
  const oilPot = Math.min(mpp, r?.oilPotential ?? 0)
  const blendBoe = mpp > 1 ? (oilPot * deck.oil + (mpp - oilPot) * gasBoe) / mpp : OIL_SHARE0 * deck.oil + (1 - OIL_SHARE0) * gasBoe
  return { oilBbl: deck.oil, gasMscf, gasBoe, blendBoe }
}

/** machines whose outage costs gas (flared), not oil: valued at the gas price */
const GAS_TAGS = new Set<string>([A.TAGS.compressor, ...A.TAGS.swPumps, ...A.TAGS.cmPumps])

// ================================================================= formatting (UI helpers live here so the pages share them)

/** "$4.05 M", "$385 k", "−$1.2 M" */
export function fmtUsd(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  const sg = v < 0 ? '−' : ''
  if (a >= 1e9) return `${sg}$${(a / 1e9).toFixed(2)} B`
  if (a >= 1e6) return `${sg}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)} M`
  if (a >= 1e3) return `${sg}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)} k`
  return `${sg}$${a.toFixed(0)}`
}
/** real days → "0.8 d", "14 d", "6 mo" */
export function fmtDays(d: number): string {
  if (!Number.isFinite(d)) return '—'
  if (d <= 0.01) return '0 d'
  if (d < 10) return `${d.toFixed(1)} d`
  if (d < 120) return `${Math.round(d)} d`
  return `${(d / 30.4).toFixed(1)} mo`
}
/** wall time a logistics span takes in demo mode at 60× ("≈ 3.5 min at 60×") */
export function demoEquiv(days: number): string {
  const s = (days * DEMO_DAY_S) / 60
  return s < 90 ? `≈ ${Math.max(1, Math.round(s))} s at 60×` : s < 5400 ? `≈ ${(s / 60).toFixed(s < 600 ? 1 : 0)} min at 60×` : `≈ ${(s / 3600).toFixed(1)} h at 60×`
}

// ================================================================= the register

/** helicopter charter per flight, USD (fallback estimate; the spares module's preview gives the real figure) */
export const HELI_CHARTER_USD = 16500
/** helicopter delivery from the base, real days (out and back in daylight) */
const HELI_D = 0.25
/** supply-boat transit, real days */
const BOAT_TRANSIT_D = 0.5
/** sailing interval, real days (when the spares module has no schedule yet: half an interval on average) */
const SAILING_D = 3.5
/** helicopter lift limit, kg */
const HELI_KG = 1500

export type LeverKind = 'expedite' | 'order' | 'transfer' | 'raiseWo' | 'none'
export interface RiskLever {
  kind: LeverKind
  /** button text */
  label: string
  partId?: string
  partName?: string
  qty?: number
  mode?: PoMode
  heli?: boolean
  /** open PO to expedite */
  poId?: string
  /** work order the order is for */
  wo?: string
  /** probability-weighted exposure the lever removes, USD */
  saveUsd: number
  /** extra spend: expedite premium + helicopter charter, USD (estimate) */
  costUsd: number
  /** real days until the part is offshore after the lever */
  arriveDays: number
  /** the part lands before the predicted failure */
  beatsFailure: boolean
}

export interface AssetRiskRow extends AssetRisk {
  lever: RiskLever
  /** predicted days to functional failure (real), null when there is no trend */
  ttfDays: number | null
  /** USD per boe the lost production is valued at */
  usdPerBoe: number
  valuedAs: 'gas' | 'blend'
  /** production value lost per day down, USD/d */
  lostUsdD: number
  labourUsd: number
  partsUsd: number
  /** the open work order on the machine, if any */
  wo?: { id: string; status: string; label: string }
  /** standby partner that covers it */
  partner?: string
}

// ---------------------------------------------------------------- helpers

/** standard normal CDF (Abramowitz–Stegun erf) */
function phi(z: number) {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

const names = new WeakMap<Plant, Map<string, string>>()
function nameOf(p: Plant, tag: string) {
  let m = names.get(p)
  if (!m) names.set(p, (m = new Map(p.equipment.map((e) => [e.tag, e.name]))))
  return m.get(tag) ?? tag
}
const plats = new WeakMap<Plant, Map<string, PlatformId>>()
function platOf(p: Plant, tag: string): PlatformId {
  let m = plats.get(p)
  if (!m) plats.set(p, (m = new Map()))
  let v = m.get(tag)
  if (!v) {
    try {
      v = platformOfTag(p, tag)
    } catch {
      v = 'Plant'
    }
    m.set(tag, v)
  }
  return v
}
const partMaps = new WeakMap<SparePart[], Map<string, SparePart>>()
function partsById(parts: SparePart[]) {
  let m = partMaps.get(parts)
  if (!m) partMaps.set(parts, (m = new Map(parts.map((x) => [x.id, x]))))
  return m
}
const OPEN_PO = (stage: string) => stage !== 'received' && stage !== 'cancelled'

/** real days until the next supply boat is alongside (next sailing + transit) */
function boatDays(sp: SparesData, t: number) {
  const next = sp.boat?.next ?? 0
  const sail = next > t ? (next - t) / daySeconds(sp.mode ?? 'demo') : SAILING_D / 2
  return sail + BOAT_TRANSIT_D
}

interface Opt {
  kind: 'expedite' | 'order' | 'transfer'
  mode: PoMode
  heli: boolean
  poId?: string
  arrive: number
  cost: number
}

/** spares.ts helpers beyond the contract (exact premium / freight / ETA) — used when present, else estimates */
type Preview = { why: string | null; premium: number; freight: number; days: number }
const sparesExt = sparesMod as unknown as {
  previewOrder?: (partId: string, qty: number, mode: PoMode, heli?: boolean) => Preview
  previewExpedite?: (poId: string, heli?: boolean) => Preview
}
/** refine an estimated option with the spares module's own preview (null = the module refuses it) */
function refine(o: Opt, part: SparePart, qty: number): Opt | null {
  try {
    const p = o.kind === 'expedite' && o.poId ? sparesExt.previewExpedite?.(o.poId, o.heli) : sparesExt.previewOrder?.(part.id, qty, o.mode, o.heli)
    if (!p) return o
    if (p.why) return null
    // incremental spend of the lever: the premium, and the charter when it flies (boat freight is paid either way)
    return { ...o, arrive: Math.max(0, p.days), cost: (p.premium || 0) + (o.heli ? p.freight || 0 : 0) }
  } catch {
    return o
  }
}

/** delivery options for one part: transfer from base, expedite the open PO, or a new order */
function optionsFor(part: SparePart, qty: number, sp: SparesData, t: number): Opt[] {
  const boat = boatDays(sp, t)
  const heliOk = part.kg * qty <= HELI_KG
  const premium = part.unitCost * part.expeditePremium * qty
  const st = sp.stock?.[part.id]
  const out: Opt[] = []
  if ((st?.base ?? 0) >= qty) {
    out.push({ kind: 'transfer', mode: 'transfer', heli: false, arrive: boat, cost: 0 })
    if (heliOk) out.push({ kind: 'transfer', mode: 'transfer', heli: true, arrive: HELI_D, cost: HELI_CHARTER_USD })
  }
  const po = sp.orders?.find((o) => o.partId === part.id && OPEN_PO(o.stage))
  if (po) {
    // an open order still on its way to the base can be switched to expedite (exchange unit / vendor premium)
    // and / or flown out for the last leg — spares.ts `expedite(poId, { heli })`
    if (po.stage === 'requisition' || po.stage === 'ordered' || po.stage === 'inTransit' || po.stage === 'atBase') {
      const prem = po.mode === 'standard' && po.stage !== 'atBase' ? premium : 0
      const lead = po.mode === 'standard' && po.stage !== 'atBase' ? part.expediteDays : 0
      if (prem > 0) out.push({ kind: 'expedite', mode: 'expedite', heli: false, poId: po.id, arrive: lead + boat, cost: prem })
      if (heliOk && !po.heli) out.push({ kind: 'expedite', mode: 'emergency', heli: true, poId: po.id, arrive: lead + HELI_D, cost: prem + HELI_CHARTER_USD })
    }
  } else {
    out.push({ kind: 'order', mode: 'standard', heli: false, arrive: part.leadDays + boat, cost: 0 })
    out.push({ kind: 'order', mode: 'expedite', heli: false, arrive: part.expediteDays + boat, cost: premium })
    if (heliOk) out.push({ kind: 'order', mode: 'emergency', heli: true, arrive: part.expediteDays + HELI_D, cost: premium + HELI_CHARTER_USD })
  }
  return out.map((o) => refine(o, part, qty)).filter((o): o is Opt => !!o)
}

/**
 * Parts wait (real days) if the machine fails, for a part that lands offshore in `arrive` days:
 * failed → all of it; degrading → what is left at the predicted failure; healthy → averaged over a failure time
 * uniform on the horizon (E[max(0, arrive − U)], U ~ U[0, H]).
 */
function waitAt(arrive: number, failed: boolean, ttfDays: number | null, H: number) {
  if (arrive <= 0) return 0
  if (failed) return arrive
  if (ttfDays !== null) return Math.max(0, arrive - ttfDays)
  return arrive >= H ? arrive - H / 2 : (arrive * arrive) / (2 * H)
}

function leverText(o: Opt, partName: string, save: number, poId?: string) {
  const saves = `saves ${fmtUsd(save)} exposure`
  if (o.kind === 'transfer') return `Transfer ${partName} from base ${o.heli ? 'by helicopter' : 'on the next sailing'} — ${saves}`
  if (o.kind === 'expedite') return `Expedite ${partName}${poId ? ` (${poId})` : ''}${o.heli ? ', helicopter to the deck' : ''} — ${saves}`
  if (o.mode === 'emergency') return `Emergency-order ${partName} by helicopter — ${saves}`
  if (o.mode === 'expedite') return `Expedite-order ${partName} — ${saves}`
  return `Order ${partName} (standard) — ${saves}`
}

const NONE: RiskLever = { kind: 'none', label: '', saveUsd: 0, costUsd: 0, arriveDays: 0, beatsFailure: false }

// ---------------------------------------------------------------- one machine

function rowFor(tag: string, h: Health, horizonDays: number, deck: PriceDeck, u: UnitValues, plant: Plant, sp: SparesData, t: number): AssetRiskRow {
  const cd = A.CLASS_DATA[h.cls]
  const failed = h.stage === 'failed'
  // ---- time to failure, read on the logistics clock: in demo mode a logistics day is DEMO_DAY_S sim s, so
  // "does the part land before the failure" matches what the demo will show (real mode: plain days)
  const ttf = ttfH(h)
  const ttfDays = failed ? 0 : ttf !== null ? (ttf * 3600) / daySeconds(sp.mode ?? 'demo') : null
  // ---- probability of failure within the horizon (design MTBF; standby machines see little running time)
  const st = runOf(tag)
  const duty = st === 'running' || st === 'starting' || st === 'tripped' ? 1 : 0.15
  const pBase = 1 - Math.exp(-(horizonDays * 24 * duty) / cd.mtbfH)
  let pDeg = 0
  if (failed) pDeg = 1
  else if (ttfDays !== null) pDeg = ttfDays <= 0 ? 1 : phi(Math.log(horizonDays / ttfDays) / 0.5)
  else if (h.stage === 'alarm') pDeg = 0.8
  else if (h.stage === 'alert') pDeg = 0.5
  const pFail = Math.min(1, 1 - (1 - pBase) * (1 - pDeg))

  // ---- consequence
  const wos = openWos(tag)
  const woRec: WorkOrder | undefined = wos.find((w) => w.type !== 'preventive') ?? wos[0]
  let repairH = cd.mttrH
  if (failed && woRec) repairH = Math.max(0, woRec.estH - woRec.actualH)
  const repairDays = repairH / 24
  const cover = coverFor(tag, h.mode)
  // parts already on the way count down to the failure; from the base / the vendor nothing moves until it fails
  const coverWait = Math.max(0, cover.waitDays || 0)
  const partsWaitDays = cover.status === 'onOrder' ? waitAt(coverWait, failed, ttfDays, horizonDays) : cover.status === 'base' || cover.status === 'none' ? coverWait : 0
  const impact = Math.max(0, impactBoeD(tag))
  const valuedAs: 'gas' | 'blend' = GAS_TAGS.has(tag) ? 'gas' : 'blend'
  const usdPerBoe = valuedAs === 'gas' ? u.gasBoe : u.blendBoe
  const lostUsdD = impact * usdPerBoe
  const labourUsd = cd.mttrH * deck.labourH
  const pm = partsById(sp.parts ?? [])
  let partsUsd = 0
  for (const id of cover.partIds) {
    const pt = pm.get(id)
    if (pt) partsUsd += pt.unitCost * pt.perJob
  }
  const consequenceUsd = lostUsdD * (repairDays + partsWaitDays) + labourUsd + partsUsd
  const exposureUsd = pFail * consequenceUsd

  // ---- lever
  const partner = impact === 0 ? (partnerOf(tag) ?? undefined) : undefined
  const wo = woRec ? { id: woRec.id, status: woRec.status, label: WO_STATUS_LABEL[woRec.status] } : undefined
  let lever: RiskLever = NONE
  let action = ''
  if (lostUsdD > 0 && partsWaitDays > 0.05 && (cover.status === 'base' || cover.status === 'onOrder' || cover.status === 'none')) {
    // the part that gates the job: not in the offshore store, longest lead
    let gate: SparePart | undefined
    for (const id of cover.partIds) {
      const pt = pm.get(id)
      if (!pt) continue
      if ((sp.stock?.[id]?.offshore ?? 0) >= pt.perJob) continue
      if (!gate || pt.leadDays > gate.leadDays) gate = pt
    }
    if (gate) {
      const qty = Math.max(1, gate.perJob)
      const thr = Math.max(1000, 0.005 * exposureUsd)
      const scored = optionsFor(gate, qty, sp, t).map((o) => {
        const save = pFail * lostUsdD * Math.max(0, partsWaitDays - waitAt(o.arrive, failed, ttfDays, horizonDays))
        return { o, save, net: save - o.cost, beats: ttfDays !== null && !failed && o.arrive <= ttfDays }
      })
      // degrading: the cheapest option that lands before the predicted failure; otherwise the best net saving
      const beats = scored.filter((x) => x.beats && x.save >= thr).sort((a, b) => a.o.cost - b.o.cost || a.o.arrive - b.o.arrive)
      const best = beats[0] ?? scored.filter((x) => x.net >= thr).sort((a, b) => b.net - a.net)[0]
      if (best) {
        const { o } = best
        const partName = gate.short ?? gate.name
        lever = {
          kind: o.kind,
          label: o.kind === 'transfer' ? (o.heli ? 'Transfer (heli)' : 'Transfer') : o.kind === 'expedite' ? 'Expedite' : o.mode === 'emergency' ? 'Emergency order' : o.mode === 'expedite' ? 'Expedite order' : 'Order',
          partId: gate.id,
          partName,
          qty,
          mode: o.mode,
          heli: o.heli,
          poId: o.poId,
          wo: wo?.id,
          saveUsd: best.save,
          costUsd: o.cost,
          arriveDays: o.arrive,
          beatsFailure: best.beats,
        }
        action = leverText(o, partName, best.save, o.poId)
      }
    }
  }
  if (lever.kind === 'none' && !wo && (h.stage === 'alert' || h.stage === 'alarm' || h.stage === 'failed')) {
    // repair it on our terms: a condition-based job (≈ half the MTTR, planned) instead of a breakdown
    const planned = lostUsdD * ((cd.mttrH * 0.5) / 24) + labourUsd * 0.5 + partsUsd
    const after = pBase * consequenceUsd + planned
    const save = h.stage === 'failed' ? 0 : Math.max(0, exposureUsd - after)
    lever = { ...NONE, kind: 'raiseWo', label: 'Raise WO', saveUsd: save, beatsFailure: h.stage !== 'failed' }
    action = h.stage === 'failed' ? 'Failed — raise a corrective work order' : `Raise condition-based WO — repair before it fails${save > 0 ? `, saves ${fmtUsd(save)} exposure` : ''}`
  }
  if (!action) {
    if (wo) action = `${wo.id} open — ${wo.label}`
    else if (impact === 0 && partner) action = `Standby ${partner} covers it — no production at stake`
    else if (cover.status === 'onboard') action = 'Spare on board — monitor'
    else if (cover.status === 'notStocked') action = h.stage === 'normal' ? 'Monitor' : 'No spares data — raise WO'
    else action = 'Monitor'
  }

  return {
    tag,
    name: nameOf(plant, tag),
    platform: platOf(plant, tag),
    cls: CLASS_LABEL[h.cls] ?? h.cls,
    stage: h.stage,
    degr: h.degr,
    pFail,
    horizonDays,
    impactBoeD: impact,
    repairDays,
    partsWaitDays,
    cover,
    consequenceUsd,
    exposureUsd,
    action,
    lever,
    ttfDays,
    usdPerBoe,
    valuedAs,
    lostUsdD,
    labourUsd,
    partsUsd,
    wo,
    partner,
  }
}

// ---------------------------------------------------------------- memoised entry point

let memo: { key: unknown[]; rows: AssetRiskRow[] } | null = null
const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Every monitored machine ranked by $ exposure over `horizonDays` (real days). Memoised per sim tick and
 * inputs; cheap but not free — call it from a plugin / effect, never in render.
 */
export function assetRisks(horizonDays = 30, deck: PriceDeck = DEFAULT_DECK): AssetRiskRow[] {
  const s = useSim.getState()
  const m = useMaint.getState()
  const sp = useSpares.getState()
  const plant = usePlantStore.getState().plant
  const key = [s.t, horizonDays, deck, m.health, m.wos, sp, s.result, s.lockouts, s.status, plant]
  if (memo && same(memo.key, key)) return memo.rows
  const u = unitValues(deck, s.result)
  const rows: AssetRiskRow[] = []
  for (const e of plant.equipment) {
    if (!classOf(e)) continue
    const h = m.health[e.tag]
    if (!h) continue
    rows.push(rowFor(e.tag, h, horizonDays, deck, u, plant, sp, s.t))
  }
  rows.sort((a, b) => b.exposureUsd - a.exposureUsd || b.pFail - a.pFail)
  memo = { key, rows }
  return rows
}
