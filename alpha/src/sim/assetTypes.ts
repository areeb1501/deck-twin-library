/**
 * Asset & economics contract (plan 13): spares and supply, the finance model and the asset-risk register.
 *
 *   sim/spares.ts      → useSpares (SparesData), coverFor(), sparesApi — materials, purchase orders, logistics
 *   sim/finance.ts     → useFinance (FinanceData), financeApi            — price deck, revenue, deferment $, OPEX, carbon
 *   sim/assetRisk.ts   → assetRisks()                                    — ranked $ exposure per critical machine
 *
 * Everything here is SIMULATED: parts, stock, vendors, prices and lead times are a plausible demo dataset,
 * not an ERP feed. The stores are shaped so an SAP MM / Maximo / IFS export could replace the seed data.
 *
 * Time. Process time is the engine's sim clock (`t`, sim seconds). Supply-chain time is counted in
 * LOGISTICS DAYS: in 'real' mode one logistics day is 86 400 sim s; in 'demo' mode it is DEMO_DAY_S sim s, so
 * a two-week vendor lead time lands in a few minutes of wall time at 60×. Lead times are always stored and
 * shown in real days; the UI shows the demo equivalent next to them. Consumable usage runs on the same
 * logistics clock. The asset-risk register always works in real days (it is a planning view).
 */
import type { LossCategory, PlatformId } from './types'

/** sim seconds per logistics day in demo mode (60× speed → one logistics day ≈ 15 s of wall time) */
export const DEMO_DAY_S = 900
export const REAL_DAY_S = 86400
export type LogisticsMode = 'real' | 'demo'
export const daySeconds = (mode: LogisticsMode) => (mode === 'demo' ? DEMO_DAY_S : REAL_DAY_S)

// ================================================================= spares & supply

/** A = no spare means lost production (insurance / critical), B = degrades redundancy, C = convenience / consumable */
export type Criticality = 'A' | 'B' | 'C'
export const CRITICALITY_LABEL: Record<Criticality, string> = {
  A: 'A: production critical',
  B: 'B: redundancy',
  C: 'C: routine / consumable',
}
export type PartCategory = 'rotating' | 'electrical' | 'instrument' | 'static' | 'consumable' | 'chemical'
export type StockLocation = 'offshore' | 'base'
export const LOCATION_LABEL: Record<StockLocation, string> = { offshore: 'Alpha offshore store', base: 'Onshore supply base' }

export interface SparePart {
  /** material number, e.g. MAT-100231 */
  id: string
  name: string
  category: PartCategory
  criticality: Criticality
  /** unit of issue: ea, kit, set, drum, m3 … */
  uom: string
  /** USD per unit of issue */
  unitCost: number
  /** gross weight per unit, kg (helicopter limit) */
  kg: number
  /** equipment tags this part fits (interchangeability group) */
  fits: string[]
  /** failure modes (maintenance CLASS_DATA wording) or 'PM' that call for it */
  usedFor: string[]
  /** quantity a job draws */
  perJob: number
  /** MRP: reorder point (offshore + base + on order − reserved) and order-up-to level */
  rop: number
  max: number
  /** vendor */
  vendor: string
  /** standard vendor lead time to the onshore base, real days */
  leadDays: number
  /** expedited lead time (vendor premium / exchange unit), real days, and the cost premium as a share of unit cost */
  expediteDays: number
  expeditePremium: number
  /** consumables: usage per logistics day at design throughput (0 = none); `driver` scales it */
  usagePerDay?: number
  driver?: 'oil' | 'gas' | 'water' | 'calendar'
  /** short name for messages and badges ("DGS cartridge") */
  short?: string
  /** demand not tied to a machine failure mode (instrument / F&G spares): replacements per fitted item per year */
  ratePerYear?: number
}

export interface StockLevel {
  offshore: number
  base: number
  /** reserved for open work orders (offshore or base) */
  reserved: number
}

export type PoStage = 'requisition' | 'ordered' | 'inTransit' | 'atBase' | 'onBoat' | 'onHeli' | 'received' | 'cancelled'
export const PO_FLOW: PoStage[] = ['requisition', 'ordered', 'inTransit', 'atBase', 'onBoat', 'received']
export const PO_STAGE_LABEL: Record<PoStage, string> = {
  requisition: 'Requisition: awaiting approval',
  ordered: 'PO placed with vendor',
  inTransit: 'In transit to supply base',
  atBase: 'At supply base: next sailing',
  onBoat: 'On supply vessel',
  onHeli: 'On helicopter',
  received: 'Received offshore',
  cancelled: 'Cancelled',
}
/** standard: vendor lead, supply boat · expedite: vendor premium, boat · emergency: vendor premium + helicopter
 *  · transfer: from the onshore base, no vendor (boat, or helicopter when `heli`) */
export type PoMode = 'standard' | 'expedite' | 'emergency' | 'transfer'

export interface PurchaseOrder {
  id: string
  partId: string
  qty: number
  mode: PoMode
  stage: PoStage
  /** delivered by helicopter for the last leg */
  heli: boolean
  /** work order the order was raised for (shortage), if any */
  wo?: string
  raisedAt: number
  raisedBy: string
  /** sim s: when the current stage ends (inTransit → atBase, onBoat/onHeli → received) */
  stageEndsAt?: number
  /** sim s: best estimate of arrival offshore */
  eta: number
  /** USD: material, expedite premium, freight */
  material: number
  premium: number
  freight: number
  history: { t: number; stage: PoStage | 'note'; text: string }[]
}

export interface Reservation {
  wo: string
  tag: string
  partId: string
  qty: number
  /** parts are in the offshore store and set aside for the job */
  kitted: boolean
  /** issued to the job (consumed) */
  issued: boolean
  at: number
}

export interface LogisticsLeg {
  state: 'atBase' | 'loading' | 'sailing' | 'alongside' | 'returning' | 'weatherHold' | 'idle' | 'inbound' | 'landed' | 'outbound'
  /** 0 … 1 through the current state (vessel / helicopter animation) */
  progress: number
  /** sim s the current state started / ends */
  since: number
  until: number
  /** PO ids on board */
  cargo: string[]
  /** next departure (sim s) */
  next: number
  note?: string
}

export interface StockMove {
  t: number
  partId: string
  qty: number
  kind: 'issue' | 'receipt' | 'transfer' | 'consume' | 'adjust'
  ref?: string
  text: string
}

export interface SparesKpis {
  /** stock value on hand, USD (offshore + base) */
  inventoryValue: number
  /** open PO value, USD */
  openPoValue: number
  /** parts at or below the reorder point / out of stock offshore with demand */
  belowRop: number
  stockouts: number
  /** session spend, USD: parts issued to jobs, expedite premiums, freight (boat share + helicopter) */
  partsIssued: number
  premiums: number
  freight: number
  /** work orders waiting for materials right now */
  wam: number
  /** production deferred while machines waited for materials, boe (session) */
  wamBoe: number
  /** first-pass fill rate: reservations fully kitted from offshore stock when raised, % */
  fillRate: number
}

export interface SparesData {
  plantName: string
  mode: LogisticsMode
  /** min/max auto-replenishment (MRP raises requisitions at the reorder point) */
  autoMrp: boolean
  /** requisitions under this value are auto-approved, USD */
  approvalLimit: number
  parts: SparePart[]
  stock: Record<string, StockLevel>
  orders: PurchaseOrder[]
  reservations: Reservation[]
  moves: StockMove[]
  boat: LogisticsLeg
  heli: LogisticsLeg
  kpis: SparesKpis
  seq: { po: number }
}

/** how well a machine is covered for a job, in real days (asset-risk register, WO gate, assistant) */
export interface SpareCover {
  status: 'onboard' | 'base' | 'onOrder' | 'none' | 'notStocked'
  /** the parts the job needs */
  partIds: string[]
  /** real days until every part can be offshore (0 = now) */
  waitDays: number
  note: string
}

// ================================================================= finance

export interface PriceDeck {
  /** oil price, USD/bbl (assumption, editable) */
  oil: number
  /** gas price, USD/MMBtu */
  gas: number
  /** MMBtu per Mscf */
  hhv: number
  /** fixed OPEX: manning, logistics base, insurance, USD/d */
  fixedOpexD: number
  /** variable OPEX: chemicals, power, water treatment, USD/bbl of oil */
  varOpexBbl: number
  /** maintenance labour, USD per job hour (crew) */
  labourH: number
  /** carbon price, USD/tCO2e */
  carbon: number
  /** government take / royalty on revenue, share 0 … 1 (0 = gross view) */
  royalty: number
}

export interface FinanceRate {
  /** run-rates, USD/d */
  revenue: number
  oilRevenue: number
  gasRevenue: number
  deferred: number
  opex: number
  carbonCost: number
  /** revenue − royalty − OPEX − carbon */
  cash: number
  /** USD per boe produced (OPEX ÷ boe) */
  liftingCost: number
  /** tCO2e/d and kgCO2e per boe */
  co2t: number
  intensity: number
}

export type CostLine = 'fixed' | 'variable' | 'labour' | 'parts' | 'logistics' | 'carbon'
export const COST_LABEL: Record<CostLine, string> = {
  fixed: 'Fixed OPEX (manning, base, insurance)',
  variable: 'Variable OPEX (chemicals, power)',
  labour: 'Maintenance labour',
  parts: 'Spare parts issued',
  logistics: 'Expedite & freight',
  carbon: 'Carbon cost (flare, vent, fuel)',
}

export interface FinanceTotals {
  /** session (sim time) totals */
  oilBbl: number
  gasMMscf: number
  revenue: number
  royalty: number
  cost: Record<CostLine, number>
  /** deferred revenue, USD, per PE loss category + 'materials' (awaiting spares) */
  deferred: Record<LossCategory | 'materials', number>
  co2t: number
  /** flared / vented gas, MMscf */
  flaredMMscf: number
  ventedMMscf: number
}

export interface FinancePoint {
  t: number
  revenue: number
  deferred: number
  cash: number
  oil: number
  potentialOil: number
  co2t: number
}

export interface FinanceData {
  deck: PriceDeck
  rate: FinanceRate
  totals: FinanceTotals
  /** sampled every 5 sim min */
  history: FinancePoint[]
}

// ================================================================= asset risk

export interface AssetRisk {
  tag: string
  name: string
  platform: PlatformId
  /** machine class label */
  cls: string
  stage: 'normal' | 'alert' | 'alarm' | 'failed'
  degr: number
  /** probability of failure within the horizon (real days) */
  pFail: number
  horizonDays: number
  /** production at stake while it is down, boe/d (0 when a standby covers it) */
  impactBoeD: number
  /** days down if it fails: repair + waiting for parts */
  repairDays: number
  partsWaitDays: number
  cover: SpareCover
  /** USD if it fails, and probability-weighted */
  consequenceUsd: number
  exposureUsd: number
  /** what to do about it */
  action: string
}
