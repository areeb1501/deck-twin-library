/**
 * Finance model (plan 13 B) — a simulation plugin (`registerSimPlugin({ id: 'finance' })`).
 *
 *   revenue     oil export × oil price + gas export (MMscfd → Mscf × HHV × gas price). Fuel gas is own use.
 *   deferred    the deltas of the engine's PE losses (`kpis.losses`, boe) per category, valued at the price of
 *               what was lost: flared gas at the gas price per boe, liquid held back at the oil price, the rest
 *               (wells, reservoir, shutdowns) at the blended $/boe of the current potential mix.
 *               'materials' = the delta of `useSpares.kpis.wamBoe` (machines waiting for spares) at the same
 *               average price — an attribution INSIDE the PE categories, never added to the total.
 *   costs       fixed OPEX per sim day, variable per bbl of oil, maintenance labour (Δ Σ actualH × $/job-h),
 *               spare parts issued and expedite / freight (deltas of the spares KPIs), carbon.
 *   carbon      CO2e: flare 65 t/MMscf (incl. 2 % methane slip), fuel gas 54.5 t/MMscf, cold vent
 *               538 t/MMscf (methane, GWP100 28) — screening factors.
 *   cash        revenue − royalty − OPEX − carbon (can go negative: a shutdown still pays the fixed OPEX).
 *
 * Accumulates in module variables every engine tick; writes `useFinance` at ≤ 2 Hz wall. The asset-risk
 * register (assetRisk.ts) is recomputed here at ≤ 1 Hz wall and kept in the store (`risks`, `atRisk`).
 *
 * Everything is SIMULATED and the price deck is an ASSUMPTION (editable) — never a "current" market price.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { registerSimPlugin, useSim } from '../state/sim'
import type { CostLine, FinanceData, FinancePoint, FinanceRate, FinanceTotals, PriceDeck } from './assetTypes'
import { DEFAULT_DECK, assetRisks, unitValues, type AssetRiskRow, type UnitValues } from './assetRisk'
import { useMaint } from './maintenance'
import { useSpares } from './spares'
import type { LossCategory, PlantResult, SimPlugin } from './types'

export { DEFAULT_DECK } from './assetRisk'

// ================================================================= constants

/** t CO2e per MMscf: flare (combustion + 2 % methane slip), fuel gas (turbines), cold vent (CH4 × GWP100 28) */
export const CO2E = { flare: 65, fuel: 54.5, vent: 538 } as const
export const LOSS_CATS: LossCategory[] = ['wells', 'reservoir', 'oil', 'gas', 'power', 'utilities', 'controlSafety', 'export', 'planned']
export const COST_LINES: CostLine[] = ['fixed', 'variable', 'labour', 'parts', 'logistics', 'carbon']
/** history sample interval, sim s (each point is the average over the interval) */
const SAMPLE_S = 300
const HIST_MAX = 2000
/** store writes / risk recomputes, wall ms */
const WRITE_MS = 450
const RISK_MS = 1000
const DAY = 86400
/** the session clock starts at 06:00 on day 1 (fmtClock) */
const dayOf = (t: number) => Math.floor((t + 6 * 3600) / DAY)

// ================================================================= state

/** a history point with the boe view (the K-2200 story is a gas loss: oil alone would show no gap) */
export interface FinancePointX extends FinancePoint {
  /** actual production and maximum production potential, boe/d */
  boe: number
  mpp: number
}
/** live production snapshot (the chart's live tail and the value strip) */
export interface FinanceNow {
  t: number
  oil: number
  oilPotential: number
  gas: number
  boe: number
  mpp: number
  /** instantaneous production efficiency, % */
  pe: number
}
export interface FinanceToday {
  /** session day index (D1 = 0) — "today" runs from sim midnight */
  day: number
  revenue: number
  deferred: number
  materials: number
  cash: number
}
export interface FinanceState extends FinanceData {
  history: FinancePointX[]
  now: FinanceNow
  /** deferred run-rate by PE category, USD/d, and the awaiting-spares share of it */
  deferredRate: Record<LossCategory, number>
  materialsRate: number
  /** cost run-rates, USD/d (labour / parts / logistics = session average per day, min one day) */
  costRate: Record<CostLine, number>
  /** unit values at the current deck and mix */
  unit: UnitValues
  /** CO2e by source, t/d */
  emis: { flare: number; fuel: number; vent: number }
  today: FinanceToday
  /** sim seconds the session totals cover */
  elapsed: number
  /** asset-risk register (ranked by exposure) for `riskHorizon` real days, and its total */
  risks: AssetRiskRow[]
  riskHorizon: number
  atRisk: number
}

const zeroCats = (): Record<LossCategory, number> => ({ wells: 0, reservoir: 0, oil: 0, gas: 0, power: 0, utilities: 0, controlSafety: 0, export: 0, planned: 0 })
const zeroCost = (): Record<CostLine, number> => ({ fixed: 0, variable: 0, labour: 0, parts: 0, logistics: 0, carbon: 0 })
const zeroTotals = (): FinanceTotals => ({ oilBbl: 0, gasMMscf: 0, revenue: 0, royalty: 0, cost: zeroCost(), deferred: { ...zeroCats(), materials: 0 }, co2t: 0, flaredMMscf: 0, ventedMMscf: 0 })
const zeroRate = (): FinanceRate => ({ revenue: 0, oilRevenue: 0, gasRevenue: 0, deferred: 0, opex: 0, carbonCost: 0, cash: 0, liftingCost: 0, co2t: 0, intensity: 0 })
const zeroNow = (): FinanceNow => ({ t: 0, oil: 0, oilPotential: 0, gas: 0, boe: 0, mpp: 0, pe: 100 })

function emptyState(deck: PriceDeck): FinanceState {
  return {
    deck,
    rate: zeroRate(),
    totals: zeroTotals(),
    history: [],
    now: zeroNow(),
    deferredRate: zeroCats(),
    materialsRate: 0,
    costRate: zeroCost(),
    unit: unitValues(deck, null),
    emis: { flare: 0, fuel: 0, vent: 0 },
    today: { day: 0, revenue: 0, deferred: 0, materials: 0, cash: 0 },
    elapsed: 0,
    risks: [],
    riskHorizon: 30,
    atRisk: 0,
  }
}

const hot = import.meta.hot
export const useFinance: UseBoundStore<StoreApi<FinanceState>> = (hot?.data?.useFinance as UseBoundStore<StoreApi<FinanceState>> | undefined) ?? create<FinanceState>(() => emptyState({ ...DEFAULT_DECK }))
if (hot) hot.data.useFinance = useFinance
const F = () => useFinance.getState()

/** Σ deferred over the PE categories only ('materials' is inside them) */
export const deferredTotal = (d: Record<LossCategory | 'materials', number> | Record<LossCategory, number>) => LOSS_CATS.reduce((a, k) => a + (d[k] ?? 0), 0)
/** session cash: revenue − royalty − every cost line */
export const sessionCash = (t: FinanceTotals) => t.revenue - t.royalty - COST_LINES.reduce((a, k) => a + (t.cost[k] ?? 0), 0)

// ================================================================= accumulators (module, written to the store at ≤ 2 Hz)

/** working copies, seeded from the store (they survive an HMR reload of this module) */
let T: FinanceTotals = structuredClone(F().totals)
let hist: FinancePointX[] = F().history
let today: FinanceToday = { ...F().today }
let elapsed = F().elapsed
/** previous values of the cumulative counters we take deltas of (null = not seen yet: baseline, don't book) */
let prevLoss: Record<LossCategory, number> | null = null
let prevWam: number | null = null
let prevParts: number | null = null
let prevLogistics: number | null = null
const prevH = new Map<string, number>()
let primed = false
/** last per-category deferral, boe/d (re-priced when the deck changes while paused) */
let lastBoeD: Record<LossCategory, number> = zeroCats()
let lastWamBoeD = 0
/** history window (dt-weighted sums) */
let win = { dt: 0, rev: 0, def: 0, cash: 0, oil: 0, pot: 0, boe: 0, mpp: 0, co2: 0 }
let nextSample = -1
let lastWrite = -Infinity
let lastRisk = -Infinity

const wall = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// ================================================================= pricing

/** USD/boe for each PE category from the commodity behind this tick's constraints */
function categoryPrices(r: PlantResult, u: UnitValues): Record<LossCategory, number> {
  const w: Partial<Record<LossCategory, [number, number]>> = {}
  for (const c of r.constraints ?? []) {
    if (!(c.boe > 0)) continue
    const px = c.id === 'flare' ? u.gasBoe : c.id === 'liquid' ? u.oilBbl : u.blendBoe
    const a = w[c.loss] ?? [0, 0]
    a[0] += c.boe * px
    a[1] += c.boe
    w[c.loss] = a
  }
  const out = zeroCats()
  for (const k of LOSS_CATS) {
    const a = w[k]
    out[k] = a && a[1] > 0 ? a[0] / a[1] : u.blendBoe
  }
  return out
}

interface Snapshot {
  rate: FinanceRate
  unit: UnitValues
  emis: { flare: number; fuel: number; vent: number }
  deferredRate: Record<LossCategory, number>
  materialsRate: number
  costRate: Record<CostLine, number>
  now: FinanceNow
}

/** run-rates at `deck` from the current result (also used to re-price instantly when the deck changes) */
function snapshot(deck: PriceDeck, r: PlantResult | null, vent: number, t: number): Snapshot {
  const u = unitValues(deck, r)
  if (!r) return { rate: zeroRate(), unit: u, emis: { flare: 0, fuel: 0, vent: 0 }, deferredRate: zeroCats(), materialsRate: 0, costRate: { ...zeroCost(), fixed: deck.fixedOpexD }, now: zeroNow() }
  const oilRevenue = r.oilExport * u.oilBbl
  const gasRevenue = r.gasExport * 1000 * u.gasMscf
  const revenue = oilRevenue + gasRevenue
  const emis = { flare: r.flare * CO2E.flare, fuel: r.fuelGas * CO2E.fuel, vent: vent * CO2E.vent }
  const co2t = emis.flare + emis.fuel + emis.vent
  const px = categoryPrices(r, u)
  const deferredRate = zeroCats()
  let deferred = 0
  let defBoe = 0
  for (const k of LOSS_CATS) {
    deferredRate[k] = lastBoeD[k] * px[k]
    deferred += deferredRate[k]
    defBoe += lastBoeD[k]
  }
  const avgPx = defBoe > 0 ? deferred / defBoe : u.blendBoe
  const materialsRate = Math.min(deferred, lastWamBoeD * avgPx)
  const days = Math.max(1, elapsed / DAY)
  const costRate: Record<CostLine, number> = {
    fixed: deck.fixedOpexD,
    variable: deck.varOpexBbl * r.oilExport,
    labour: T.cost.labour / days,
    parts: T.cost.parts / days,
    logistics: T.cost.logistics / days,
    carbon: co2t * deck.carbon,
  }
  const opex = costRate.fixed + costRate.variable + costRate.labour + costRate.parts + costRate.logistics
  const royalty = revenue * deck.royalty
  const cash = revenue - royalty - opex - costRate.carbon
  const actual = r.actual
  const rate: FinanceRate = {
    revenue,
    oilRevenue,
    gasRevenue,
    deferred,
    opex,
    carbonCost: costRate.carbon,
    cash,
    liftingCost: actual > 1 ? opex / actual : 0,
    co2t,
    intensity: actual > 1 ? (co2t * 1000) / actual : 0,
  }
  const now: FinanceNow = { t, oil: r.oilExport, oilPotential: r.oilPotential, gas: r.gasExport, boe: actual, mpp: r.mpp, pe: r.efficiency }
  return { rate, unit: u, emis, deferredRate, materialsRate, costRate, now }
}

// ================================================================= the plugin

function step(dt: number, t: number) {
  const s = useSim.getState()
  const r = s.result
  if (!r || !(dt > 0)) return
  const deck = F().deck
  const f = dt / DAY
  const u = unitValues(deck, r)
  const vent = s.process?.vent ?? 0

  // ---- cumulative counters → deltas (baseline on first sight, re-baseline when a counter goes down)
  const L = s.kpis?.losses
  const sk = useSpares.getState().kpis
  const wam = sk?.wamBoe ?? 0
  const parts = sk?.partsIssued ?? 0
  const logistics = (sk?.premiums ?? 0) + (sk?.freight ?? 0)
  const wos = useMaint.getState().wos ?? []
  const dBoe = zeroCats()
  let dWam = 0
  let dParts = 0
  let dLog = 0
  let dLabourH = 0
  if (!primed) {
    prevLoss = L ? { ...L } : null
    prevWam = wam
    prevParts = parts
    prevLogistics = logistics
    prevH.clear()
    for (const w of wos) prevH.set(w.id, w.actualH ?? 0)
    primed = true
  } else {
    if (L) {
      if (!prevLoss) prevLoss = { ...L }
      for (const k of LOSS_CATS) {
        const v = L[k] ?? 0
        const d = v - (prevLoss[k] ?? 0)
        if (d > 0) dBoe[k] = d
        prevLoss[k] = v
      }
    }
    const dlt = (v: number, p: number | null) => (p === null || v < p ? 0 : v - p)
    dWam = dlt(wam, prevWam)
    dParts = dlt(parts, prevParts)
    dLog = dlt(logistics, prevLogistics)
    prevWam = wam
    prevParts = parts
    prevLogistics = logistics
    for (const w of wos) {
      const h = w.actualH ?? 0
      const p = prevH.get(w.id) ?? 0
      if (h > p) dLabourH += h - p
      prevH.set(w.id, h)
    }
  }

  // ---- deferral: value each category at the commodity it lost
  const px = categoryPrices(r, u)
  let dDefUsd = 0
  let dDefBoe = 0
  for (const k of LOSS_CATS) {
    const usd = dBoe[k] * px[k]
    T.deferred[k] += usd
    dDefUsd += usd
    dDefBoe += dBoe[k]
    lastBoeD[k] = (dBoe[k] / dt) * DAY
  }
  const avgPx = dDefBoe > 0 ? dDefUsd / dDefBoe : u.blendBoe
  // awaiting spares: an attribution inside the losses, never more than they are
  const dMatUsd = dWam * avgPx
  T.deferred.materials = Math.min(T.deferred.materials + dMatUsd, deferredTotal(T.deferred))
  lastWamBoeD = (dWam / dt) * DAY

  // ---- revenue, costs, carbon
  const revD = r.oilExport * u.oilBbl + r.gasExport * 1000 * u.gasMscf
  const co2D = r.flare * CO2E.flare + r.fuelGas * CO2E.fuel + vent * CO2E.vent
  const rev = revD * f
  const roy = rev * deck.royalty
  const fixed = deck.fixedOpexD * f
  const variable = deck.varOpexBbl * r.oilExport * f
  const labour = dLabourH * deck.labourH
  const carbon = co2D * f * deck.carbon
  T.oilBbl += r.oilExport * f
  T.gasMMscf += r.gasExport * f
  T.revenue += rev
  T.royalty += roy
  T.cost.fixed += fixed
  T.cost.variable += variable
  T.cost.labour += labour
  T.cost.parts += dParts
  T.cost.logistics += dLog
  T.cost.carbon += carbon
  T.co2t += co2D * f
  T.flaredMMscf += r.flare * f
  T.ventedMMscf += vent * f
  elapsed += dt
  const cashStep = rev - roy - fixed - variable - labour - dParts - dLog - carbon

  // ---- today (from sim midnight)
  const day = dayOf(t)
  if (day !== today.day) today = { day, revenue: 0, deferred: 0, materials: 0, cash: 0 }
  today.revenue += rev
  today.deferred += dDefUsd
  today.materials = Math.min(today.deferred, today.materials + dMatUsd)
  today.cash += cashStep

  // ---- history: the average over each SAMPLE_S window (short trips still show as area)
  const snap = snapshot(deck, r, vent, t)
  win.dt += dt
  win.rev += snap.rate.revenue * dt
  win.def += snap.rate.deferred * dt
  win.cash += snap.rate.cash * dt
  win.oil += r.oilExport * dt
  win.pot += r.oilPotential * dt
  win.boe += r.actual * dt
  win.mpp += r.mpp * dt
  win.co2 += co2D * dt
  let histChanged = false
  if (nextSample < 0 || hist.length === 0) {
    // first point straight away, so the chart has a start
    hist = [...hist, { t, revenue: snap.rate.revenue, deferred: snap.rate.deferred, cash: snap.rate.cash, oil: r.oilExport, potentialOil: r.oilPotential, co2t: co2D, boe: r.actual, mpp: r.mpp }].slice(-HIST_MAX)
    histChanged = true
    nextSample = (Math.floor(t / SAMPLE_S) + 1) * SAMPLE_S
    win = { dt: 0, rev: 0, def: 0, cash: 0, oil: 0, pot: 0, boe: 0, mpp: 0, co2: 0 }
  } else if (t >= nextSample && win.dt > 0) {
    const n = win.dt
    hist = [...hist, { t, revenue: win.rev / n, deferred: win.def / n, cash: win.cash / n, oil: win.oil / n, potentialOil: win.pot / n, co2t: win.co2 / n, boe: win.boe / n, mpp: win.mpp / n }].slice(-HIST_MAX)
    histChanged = true
    nextSample = (Math.floor(t / SAMPLE_S) + 1) * SAMPLE_S
    win = { dt: 0, rev: 0, def: 0, cash: 0, oil: 0, pot: 0, boe: 0, mpp: 0, co2: 0 }
  }

  // ---- write at ≤ 2 Hz wall (a history point is never held back for long: the next write carries it)
  const w = wall()
  if (w - lastWrite < WRITE_MS && !histChanged) return
  write(snap, w - lastRisk >= RISK_MS)
}

function write(snap: Snapshot, withRisks: boolean) {
  const w = wall()
  lastWrite = w
  const patch: Partial<FinanceState> = {
    ...snap,
    totals: structuredClone(T),
    history: hist,
    today: { ...today },
    elapsed,
  }
  if (withRisks) {
    lastRisk = w
    Object.assign(patch, riskPatch(F().riskHorizon, F().deck))
  }
  useFinance.setState(patch)
}

function riskPatch(horizon: number, deck: PriceDeck): Pick<FinanceState, 'risks' | 'atRisk'> {
  try {
    const risks = assetRisks(horizon, deck)
    return { risks, atRisk: risks.reduce((a, x) => a + x.exposureUsd, 0) }
  } catch (e) {
    console.error('[finance] asset risk', e)
    return { risks: F().risks, atRisk: F().atRisk }
  }
}

function reset() {
  T = zeroTotals()
  hist = []
  today = { day: 0, revenue: 0, deferred: 0, materials: 0, cash: 0 }
  elapsed = 0
  prevLoss = null
  prevWam = prevParts = prevLogistics = null
  prevH.clear()
  primed = false
  lastBoeD = zeroCats()
  lastWamBoeD = 0
  win = { dt: 0, rev: 0, def: 0, cash: 0, oil: 0, pot: 0, boe: 0, mpp: 0, co2: 0 }
  nextSample = -1
  lastWrite = lastRisk = -Infinity
  // keep the (possibly edited) price deck and the horizon
  const { deck, riskHorizon } = F()
  useFinance.setState({ ...emptyState(deck), riskHorizon })
}

const plugin: SimPlugin = { id: 'finance', step, reset }
registerSimPlugin(plugin)

// ================================================================= actions

const NUM_KEYS: (keyof PriceDeck)[] = ['oil', 'gas', 'hhv', 'fixedOpexD', 'varOpexBbl', 'labourH', 'carbon', 'royalty']
const LIMITS: Record<keyof PriceDeck, [number, number]> = {
  oil: [0, 500],
  gas: [0, 100],
  hhv: [0.5, 2],
  fixedOpexD: [0, 1e8],
  varOpexBbl: [0, 200],
  labourH: [0, 1e5],
  carbon: [0, 1000],
  royalty: [0, 0.95],
}

/** re-price the live run-rates and the register now (deck edits, actions while paused) */
function refreshNow(withRisks = true) {
  const s = useSim.getState()
  write(snapshot(F().deck, s.result, s.process?.vent ?? 0, s.t), withRisks)
}

export const financeApi = {
  /** change the (assumed) price deck; returns a refusal string, or null */
  setDeck(patch: Partial<PriceDeck>): string | null {
    const cur = F().deck
    const next: PriceDeck = { ...cur }
    for (const k of NUM_KEYS) {
      if (!(k in patch)) continue
      const v = Number(patch[k])
      if (!Number.isFinite(v)) return `${k}: not a number`
      const [lo, hi] = LIMITS[k]
      next[k] = Math.min(hi, Math.max(lo, v))
    }
    if (NUM_KEYS.every((k) => next[k] === cur[k])) return null
    useFinance.setState({ deck: next })
    const detail = NUM_KEYS.filter((k) => next[k] !== cur[k])
      .map((k) => `${k} ${next[k]}`)
      .join(', ')
    useSim.getState().record?.({ who: 'operator', action: 'setPriceDeck', detail: `price deck (assumption): ${detail}` })
    refreshNow()
    return null
  },
  resetDeck(): string | null {
    return financeApi.setDeck({ ...DEFAULT_DECK })
  },
  /** asset-risk horizon, real days */
  setHorizon(days: number): string | null {
    const d = Math.round(Number(days))
    if (!Number.isFinite(d) || d < 1 || d > 365) return 'Horizon: 1 … 365 days'
    useFinance.setState({ riskHorizon: d })
    refreshNow()
    return null
  },
  /** recompute the run-rates and the register from the current sim state (`ifStale`: only if > 1 s old) */
  refresh(ifStale = false) {
    if (ifStale && wall() - lastRisk < RISK_MS) return
    refreshNow(true)
  },
  /** the register at another horizon (not stored) */
  risks(horizonDays = F().riskHorizon): AssetRiskRow[] {
    return assetRisks(horizonDays, F().deck)
  },
  /** clear the session totals and history (keeps the deck) */
  reset,
}

if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __finance: useFinance, __financeApi: financeApi })
