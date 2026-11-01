/**
 * Spares & supply — a simulation plugin (plan 13 A). SIMULATED data: parts, stock, vendors, prices and lead
 * times come from sparesCatalog.ts; the store is shaped like an SAP MM / Maximo export (ERP-ready, not connected).
 *
 *   stock           offshore store, onshore supply base, reserved for work orders
 *   work orders     a WO reserves its parts when it is raised (failure mode → parts, preventive → PM kit). Parts in
 *                   the offshore store are kitted; a shortage is covered from the base (transfer on the next
 *                   sailing), from an open PO, or by a new shortage requisition linked to the WO. A corrective /
 *                   condition WO whose parts are not kitted cannot start (maintenance.ts calls the gate), so the
 *                   machine stays down and the engine books the deferment; the plugin also counts the boe deferred
 *                   while machines wait (kpis.wamBoe). Parts are issued when the job completes.
 *   MRP             min/max: position = offshore + base + on order − reserved; at ≤ reorder point a requisition up
 *                   to max; auto-approved under the approval limit (ROP 0 = insurance spare, planner-managed).
 *   purchase orders requisition → ordered → in transit → at base → on boat / on helicopter → received.
 *   logistics       supply vessel every 3.5 logistics days (½ day each way, ~8 h alongside), waits on weather
 *                   above the crane Hs limit; helicopter on demand (≤ 1 500 kg, ~2 h round trip, grounded above
 *                   20 m/s wind). Consumables draw down per logistics day × throughput and are topped up from the
 *                   base on every sailing.
 *
 * Supply-chain time runs on the LOGISTICS clock (assetTypes `daySeconds(mode)`): 900 sim s per day in 'demo',
 * 86 400 in 'real'. Lead times are stored in real days. No simRandom() draws here (the engine's seeded stream
 * stays as it is); forecast() has its own PRNG.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import * as simMod from '../state/sim'
import { usePlantStore } from '../state/plantStore'
import type { Plant } from '../model/types'
import * as A from './alpha'
import { CRANE_LIMITS, seaStateNow, windNow } from './cranes'
import {
  daySeconds,
  PO_STAGE_LABEL,
  type LogisticsLeg,
  type LogisticsMode,
  type PoMode,
  type PoStage,
  type PurchaseOrder,
  type Reservation,
  type SpareCover,
  type SparePart,
  type SparesData,
  type SparesKpis,
  type StockLevel,
  type StockMove,
} from './assetTypes'
import { impactBoeD, isOpen, machineTags, registerMaterialsHook, runOf, useMaint, type WorkOrder } from './maintenance'
import { buildCatalog, DGS_PART, DGS_PO, DGS_PO_AGE_DAYS } from './sparesCatalog'
import { fmtClock, type OperatorAction, type SimPlugin, type SimState } from './types'

export { DGS_PART, DGS_PO } from './sparesCatalog'

// ================================================================= constants

export const LOGISTICS = {
  /** supply vessel: sails every N logistics days, loading window, transit each way, time alongside */
  boatEvery: 3.5,
  boatLoad: 0.25,
  boatSail: 0.5,
  boatAlongside: 1 / 3,
  boatFirst: 1.25,
  /** offload limit (crane supply-boat lifts, sim/cranes.ts) and the hysteresis to resume */
  hsLimit: CRANE_LIMITS.hsBoat,
  hsResume: 0.3,
  /** helicopter: out, on the deck, back (logistics days) with a floor in sim s so the flight stays visible */
  heliOut: 1 / 24,
  heliLanded: 0.5 / 24,
  heliBack: 1 / 24,
  heliMinS: { out: 180, landed: 120, back: 180 },
  heliKg: 1500,
  heliWind: 20,
  /** charter, USD per flight */
  heliUsd: 16500,
  /** boat freight: share of the sailing by weight, USD/kg + handling per line */
  boatUsdKg: 1.5,
  boatUsdLine: 150,
  /** consumables: offshore cover the base tops up to on every sailing, logistics days */
  coverDays: 10,
  approvalLimit: 50000,
}
export const VESSEL_NAME = 'PSV Sea Falcon'
export const HELI_NAME = 'AW139 shuttle'
const L = LOGISTICS
const OPEN_STAGES: PoStage[] = ['requisition', 'ordered', 'inTransit', 'atBase', 'onBoat', 'onHeli']
export const isOpenPo = (po: PurchaseOrder) => OPEN_STAGES.includes(po.stage)
const GATED: WorkOrder['type'][] = ['corrective', 'condition']
const WAITING_STATUS: WorkOrder['status'][] = ['raised', 'approved', 'planned', 'isolated']
export const STAGE_SHORT: Record<PoStage, string> = {
  requisition: 'requisition awaiting approval',
  ordered: 'on order',
  inTransit: 'in transit to base',
  atBase: 'at the supply base',
  onBoat: 'on the supply vessel',
  onHeli: 'on the helicopter',
  received: 'received',
  cancelled: 'cancelled',
}

type Who = OperatorAction['who']
export interface OrderOpts {
  wo?: string
  heli?: boolean
  by?: string
  who?: Who
}

// ================================================================= store (kept across HMR)

const ZERO_KPIS: SparesKpis = { inventoryValue: 0, openPoValue: 0, belowRop: 0, stockouts: 0, partsIssued: 0, premiums: 0, freight: 0, wam: 0, wamBoe: 0, fillRate: 100 }
const idleLeg = (state: LogisticsLeg['state'], t = 0): LogisticsLeg => ({ state, progress: 0, since: t, until: t, cargo: [], next: 0 })
function emptyData(): SparesData {
  return {
    plantName: '',
    mode: 'demo',
    autoMrp: true,
    approvalLimit: L.approvalLimit,
    parts: [],
    stock: {},
    orders: [],
    reservations: [],
    moves: [],
    boat: idleLeg('atBase'),
    heli: idleLeg('idle'),
    kpis: { ...ZERO_KPIS },
    seq: { po: 0 },
  }
}

const hot = import.meta.hot
export const useSpares: UseBoundStore<StoreApi<SparesData>> = (hot?.data?.useSpares as UseBoundStore<StoreApi<SparesData>> | undefined) ?? create<SparesData>(() => emptyData())
if (hot) hot.data.useSpares = useSpares

/** per-session bookkeeping outside the store (kept across HMR) */
interface Mod {
  seen: Set<string>
  lastWos: unknown
  /** consumable draw-down not yet written to the store, and since the last consume move */
  pend: Record<string, number>
  used: Record<string, number>
  lastFlush: number
  nextUseMove: number
  wamAcc: number
  /** alongside time left when the vessel went on weather hold, sim s */
  holdRemain: number
  stats: { raised: number; firstPass: number }
  /** WOs waiting on materials (rebuilt when reservations or work orders change) */
  waiting: { wo: string; tag: string }[]
  stockoutSeen: Set<string>
}
function freshMod(): Mod {
  return { seen: new Set(), lastWos: null, pend: {}, used: {}, lastFlush: 0, nextUseMove: 0, wamAcc: 0, holdRemain: 0, stats: { raised: 0, firstPass: 0 }, waiting: [], stockoutSeen: new Set() }
}
const mod: Mod = (hot?.data?.sparesMod as Mod | undefined) ?? freshMod()
if (hot) hot.data.sparesMod = mod
function resetMod() {
  Object.assign(mod, freshMod())
}

// ================================================================= helpers

const S = () => simMod.useSim.getState() as SimState
const now = () => S().t ?? 0
const plant = (): Plant | null => usePlantStore.getState().plant ?? null
const D = () => useSpares.getState()
function rec(who: Who, action: string, tag: string | undefined, detail: string) {
  const s = S()
  if (typeof s.record === 'function') s.record({ who, action, tag, detail })
}
const transitDays = (lead: number) => Math.min(10, Math.max(1, lead * 0.12))
export const leadOf = (p: SparePart, mode: PoMode) => (mode === 'standard' ? p.leadDays : mode === 'transfer' ? 0 : p.expediteDays)
function heliS(k: 'out' | 'landed' | 'back', day: number) {
  const d = k === 'out' ? L.heliOut : k === 'landed' ? L.heliLanded : L.heliBack
  return Math.max(d * day, L.heliMinS[k])
}
const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
/** 'D3 04:00' (sim clock without seconds) */
export const fmtEta = (t: number) => fmtClock(t).slice(0, -3)
/** real days, compact */
export function fmtDays(days: number) {
  if (!Number.isFinite(days)) return '-'
  if (days < 1) return `${Math.max(0, Math.round(days * 24))} h`
  return days < 10 ? `${days.toFixed(1)} d` : `${Math.round(days)} d`
}
const fmtQty = (q: number) => (Math.abs(q - Math.round(q)) < 1e-6 ? String(Math.round(q)) : q.toFixed(1))

// ---------------------------------------------------------------- catalogue indexes (memoised per parts array)

interface Index {
  byId: Map<string, SparePart>
  /** tag → failure mode / 'PM' → part ids */
  byTag: Map<string, Map<string, string[]>>
}
const indexes = new WeakMap<SparePart[], Index>()
function indexOf(parts: SparePart[]): Index {
  let ix = indexes.get(parts)
  if (!ix) {
    ix = { byId: new Map(parts.map((p) => [p.id, p])), byTag: new Map() }
    for (const p of parts)
      for (const tag of p.fits) {
        const m = ix.byTag.get(tag) ?? ix.byTag.set(tag, new Map()).get(tag)!
        for (const u of p.usedFor) (m.get(u) ?? m.set(u, []).get(u)!).push(p.id)
      }
    indexes.set(parts, ix)
  }
  return ix
}
export const partById = (id: string) => indexOf(D().parts).byId.get(id)
/** parts a job on `tag` for `mode` (failure-mode wording or 'PM') draws */
export function partsFor(tag: string, mode: string): string[] {
  return indexOf(D().parts).byTag.get(tag)?.get(mode) ?? []
}
const openByPart = new WeakMap<PurchaseOrder[], Map<string, PurchaseOrder[]>>()
function openOrders(orders: PurchaseOrder[]): Map<string, PurchaseOrder[]> {
  let m = openByPart.get(orders)
  if (!m) {
    m = new Map()
    for (const o of orders) if (isOpenPo(o)) (m.get(o.partId) ?? m.set(o.partId, []).get(o.partId)!).push(o)
    openByPart.set(orders, m)
  }
  return m
}
/** MRP position: offshore + base + open orders (incl. transfers in flight) − reserved */
export function positionOf(partId: string, d: Pick<SparesData, 'stock' | 'orders'> = D()): number {
  const s = d.stock[partId]
  if (!s) return 0
  const onOrder = (openOrders(d.orders).get(partId) ?? []).reduce((a, o) => a + o.qty, 0)
  return s.offshore + s.base + onOrder - s.reserved
}
export const onOrderOf = (partId: string, d: Pick<SparesData, 'orders'> = D()) => (openOrders(d.orders).get(partId) ?? []).reduce((a, o) => a + o.qty, 0)

/** the failure mode a WO's job is for: 'PM', its (cleaned) failure mode, or the machine's CM mode */
function modeFor(w: Pick<WorkOrder, 'type' | 'failureMode' | 'tag'>): string | undefined {
  if (w.type === 'preventive') return 'PM'
  const fm = w.failureMode?.replace(/^FAILURE:\s*/i, '').replace(/\s*\(restarted without repair\)$/i, '').trim()
  if (fm) return fm
  const h = useMaint.getState().health[w.tag]
  return h && (h.degr > 0 || h.stage !== 'normal') ? h.mode : undefined
}

// ---------------------------------------------------------------- logistics arithmetic

/** sim time a consignment that is at the base at `tBase` reaches the offshore store */
function arrival(boat: LogisticsLeg, day: number, tBase: number, heli: boolean): number {
  if (heli) return tBase + heliS('out', day)
  const every = L.boatEvery * day
  let dep = boat.next
  if (tBase > dep) dep += Math.ceil((tBase - dep) / every) * every
  return dep + (L.boatSail + L.boatAlongside) * day
}
function boatEta(boat: LogisticsLeg, day: number, t: number) {
  switch (boat.state) {
    case 'loading':
    case 'atBase':
      return boat.next + (L.boatSail + L.boatAlongside) * day
    case 'sailing':
      return boat.until + L.boatAlongside * day
    case 'alongside':
      return boat.until
    case 'weatherHold':
      return t + Math.max(mod.holdRemain, day * 0.05)
    default:
      return t
  }
}
function etaOf(po: PurchaseOrder, part: SparePart | undefined, d: Pick<SparesData, 'boat' | 'heli'>, day: number, t: number): number {
  if (!part) return po.eta
  const lead = leadOf(part, po.mode)
  switch (po.stage) {
    case 'requisition':
      return arrival(d.boat, day, t + lead * day, po.heli)
    case 'ordered':
      return arrival(d.boat, day, (po.stageEndsAt ?? t) + transitDays(lead) * day, po.heli)
    case 'inTransit':
      return arrival(d.boat, day, po.stageEndsAt ?? t, po.heli)
    case 'atBase':
      return po.heli ? (d.heli.state === 'idle' ? t : Math.max(t, d.heli.until)) + heliS('out', day) : arrival(d.boat, day, t, false)
    case 'onBoat':
      return boatEta(d.boat, day, t)
    case 'onHeli':
      return d.heli.state === 'inbound' ? d.heli.until : t
    default:
      return po.eta
  }
}

// ================================================================= transactions (copy-on-write, one setState per action / tick)

interface Tx {
  s: SparesData
  t: number
  stock: Record<string, StockLevel> | null
  orders: PurchaseOrder[] | null
  res: Reservation[] | null
  moves: StockMove[]
  boat: LogisticsLeg | null
  heli: LogisticsLeg | null
  add: { partsIssued: number; premiums: number; freight: number; wamBoe: number }
  patch: Partial<SparesData>
  seq: number | null
  /** stock / orders / reservations changed: re-kit and re-check shortages before the commit */
  dirty: boolean
  /** something a PO ETA depends on changed */
  etas: boolean
  wosChanged: boolean
}
let cur: Tx | null = null
function withTx<T>(fn: (x: Tx) => T): T {
  if (cur) return fn(cur)
  const x: Tx = { s: D(), t: now(), stock: null, orders: null, res: null, moves: [], boat: null, heli: null, add: { partsIssued: 0, premiums: 0, freight: 0, wamBoe: 0 }, patch: {}, seq: null, dirty: false, etas: false, wosChanged: false }
  cur = x
  try {
    const r = fn(x)
    if (x.dirty) allocate(x)
    if (x.etas || x.dirty) refreshEtas(x)
    commit(x)
    return r
  } finally {
    cur = null
  }
}
const dayOf = (x: Tx) => daySeconds(x.patch.mode ?? x.s.mode)
const partsOf = (x: Tx) => x.s.parts
const pOf = (x: Tx, id: string) => indexOf(x.s.parts).byId.get(id)
const ZERO_LVL: StockLevel = { offshore: 0, base: 0, reserved: 0 }
const stk = (x: Tx, id: string) => (x.stock ?? x.s.stock)[id] ?? ZERO_LVL
function setStk(x: Tx, id: string, lvl: StockLevel) {
  if (!x.stock) x.stock = { ...x.s.stock }
  x.stock[id] = lvl
  x.dirty = true
}
const ords = (x: Tx) => x.orders ?? x.s.orders
/** orders are never mutated in place (openOrders() memoises per array) */
function putPo(x: Tx, po: PurchaseOrder) {
  const list = ords(x)
  const i = list.findIndex((o) => o.id === po.id)
  x.orders = i >= 0 ? list.map((o, k) => (k === i ? po : o)) : [po, ...list]
  x.dirty = true
}
const rsv = (x: Tx) => x.res ?? x.s.reservations
function setRsv(x: Tx, list: Reservation[]) {
  x.res = list
  x.dirty = true
}
const boatOf = (x: Tx) => x.boat ?? x.s.boat
const heliOf = (x: Tx) => x.heli ?? x.s.heli
function move(x: Tx, m: Omit<StockMove, 't'>) {
  x.moves.push({ t: x.t, ...m })
}
function nextPoId(x: Tx) {
  const n = (x.seq ?? x.s.seq.po) + 1
  x.seq = n
  return `PO-45${String(n).padStart(6, '0')}`
}
const poNote = (po: PurchaseOrder, t: number, text: string, stage: PoStage | 'note' = 'note'): PurchaseOrder => ({ ...po, history: [...po.history, { t, stage, text }] })

function commit(x: Tx) {
  const out: Partial<SparesData> = { ...x.patch }
  if (x.res) {
    // reserved = everything not yet issued, per part; prune old issued lines
    const open = x.res.filter((r) => !r.issued)
    const done = x.res.filter((r) => r.issued).slice(0, 200)
    x.res = [...open, ...done].sort((a, b) => b.at - a.at)
    const reserved = new Map<string, number>()
    for (const r of open) reserved.set(r.partId, (reserved.get(r.partId) ?? 0) + r.qty)
    const base = x.stock ?? x.s.stock
    for (const id of Object.keys(base)) {
      const v = reserved.get(id) ?? 0
      if (base[id].reserved !== v) setStk(x, id, { ...stk(x, id), reserved: v })
    }
    out.reservations = x.res
  }
  if (x.stock) out.stock = x.stock
  if (x.orders) {
    const open = x.orders.filter(isOpenPo)
    out.orders = open.length === x.orders.length ? x.orders : [...open, ...x.orders.filter((o) => !isOpenPo(o)).slice(0, 250)].sort((a, b) => b.raisedAt - a.raisedAt || (a.id < b.id ? 1 : -1))
  }
  if (x.moves.length) out.moves = [...x.moves.reverse(), ...x.s.moves].slice(0, 400)
  if (x.boat) out.boat = x.boat
  if (x.heli) out.heli = x.heli
  if (x.seq !== null) out.seq = { po: x.seq }
  const added = x.add.partsIssued || x.add.premiums || x.add.freight || x.add.wamBoe
  if (x.res || x.wosChanged) rebuildWaiting(out.reservations ?? x.s.reservations)
  if (x.stock || x.orders || x.res || x.wosChanged || added) {
    const merged = { ...x.s, ...out } as SparesData
    out.kpis = computeKpis(merged, x.s.kpis, x.add)
    if (!x.stock && !x.orders && !x.res && sameKpis(out.kpis, x.s.kpis)) delete out.kpis
  }
  if (Object.keys(out).length) useSpares.setState(out)
}
const sameKpis = (a: SparesKpis, b: SparesKpis) => (Object.keys(a) as (keyof SparesKpis)[]).every((k) => a[k] === b[k])

function rebuildWaiting(res: Reservation[]) {
  const wos = new Map(useMaint.getState().wos.map((w) => [w.id, w]))
  const out: { wo: string; tag: string }[] = []
  const seen = new Set<string>()
  for (const r of res) {
    if (r.issued || r.kitted || seen.has(r.wo)) continue
    const w = wos.get(r.wo)
    if (!w || !GATED.includes(w.type) || !WAITING_STATUS.includes(w.status)) continue
    seen.add(r.wo)
    out.push({ wo: r.wo, tag: r.tag })
  }
  mod.waiting = out
}

function computeKpis(d: SparesData, prev: SparesKpis, add: Tx['add']): SparesKpis {
  const ix = indexOf(d.parts)
  let inventoryValue = 0
  let openPoValue = 0
  let belowRop = 0
  let stockouts = 0
  const short = new Set<string>()
  for (const r of d.reservations) if (!r.issued && !r.kitted) short.add(r.partId)
  for (const p of d.parts) {
    const s = d.stock[p.id]
    if (!s) continue
    inventoryValue += (s.offshore + s.base) * p.unitCost
    if (p.rop > 0 && s.offshore + s.base - s.reserved <= p.rop) belowRop++
    if (short.has(p.id) || (p.usagePerDay && s.offshore <= 0.01)) stockouts++
  }
  for (const o of d.orders) {
    if (!isOpenPo(o)) continue
    if (o.mode === 'transfer') inventoryValue += o.qty * (ix.byId.get(o.partId)?.unitCost ?? 0)
    else openPoValue += o.material + o.premium
  }
  return {
    inventoryValue,
    openPoValue,
    belowRop,
    stockouts,
    partsIssued: prev.partsIssued + add.partsIssued,
    premiums: prev.premiums + add.premiums,
    freight: prev.freight + add.freight,
    wam: mod.waiting.length,
    wamBoe: prev.wamBoe + add.wamBoe,
    fillRate: mod.stats.raised ? (100 * mod.stats.firstPass) / mod.stats.raised : 100,
  }
}

// ================================================================= orders

function createPo(x: Tx, part: SparePart, qty: number, mode: PoMode, o: OrderOpts & { approved?: boolean; note?: string; stage?: 'onBoat' }): { po: PurchaseOrder | null; why: string | null } {
  const t = x.t
  const day = dayOf(x)
  if (!(qty > 0) || !Number.isFinite(qty)) return { po: null, why: 'Quantity must be positive' }
  const heli = mode === 'emergency' || !!o.heli
  if (heli && part.kg * qty > L.heliKg) return { po: null, why: `${fmtQty(qty)} × ${part.short ?? part.name} = ${Math.round(part.kg * qty)} kg: over the helicopter's ${L.heliKg.toLocaleString('en-US')} kg limit; send it by boat` }
  const by = o.by ?? 'Materials coordinator'
  const d = { boat: boatOf(x), heli: heliOf(x) }
  let po: PurchaseOrder
  if (mode === 'transfer') {
    const lvl = stk(x, part.id)
    if (lvl.base + 1e-9 < qty) return { po: null, why: `Only ${fmtQty(lvl.base)} ${part.uom} of ${part.short ?? part.name} at the onshore base` }
    setStk(x, part.id, { ...lvl, base: lvl.base - qty })
    const id = nextPoId(x)
    const stage: PoStage = o.stage ?? 'atBase'
    po = { id, partId: part.id, qty, mode, stage, heli, wo: o.wo, raisedAt: t, raisedBy: by, eta: 0, material: 0, premium: 0, freight: 0, history: [{ t, stage, text: o.note ?? `Transfer from base stock: ${heli ? 'helicopter' : 'next sailing'}` }] }
    move(x, { partId: part.id, qty: -qty, kind: 'transfer', ref: id, text: `Base → offshore (${heli ? 'helicopter' : 'supply vessel'})${o.wo ? ` for ${o.wo}` : ''}` })
  } else {
    const lead = leadOf(part, mode)
    const material = part.unitCost * qty
    const premium = mode === 'standard' ? 0 : material * part.expeditePremium
    const limit = x.patch.approvalLimit ?? x.s.approvalLimit
    const needsApproval = !o.approved && material + premium > limit
    const stage: PoStage = needsApproval ? 'requisition' : 'ordered'
    const id = nextPoId(x)
    po = {
      id,
      partId: part.id,
      qty,
      mode,
      stage,
      heli,
      wo: o.wo,
      raisedAt: t,
      raisedBy: by,
      stageEndsAt: needsApproval ? undefined : t + (lead - transitDays(lead)) * day,
      eta: 0,
      material,
      premium,
      freight: 0,
      history: [
        {
          t,
          stage,
          text: `${o.note ? `${o.note}: ` : ''}${mode === 'standard' ? 'standard' : mode === 'expedite' ? `expedited (+${Math.round(part.expeditePremium * 100)} %)` : `emergency: expedited (+${Math.round(part.expeditePremium * 100)} %) + helicopter`}, ${part.vendor}, lead ${lead} d${needsApproval ? `: ${usd(material + premium)} is over the ${usd(limit)} approval limit` : ''}`,
        },
      ],
    }
    if (!needsApproval && premium) x.add.premiums += premium
  }
  po = { ...po, eta: etaOf(po, part, d, day, t) }
  putPo(x, po)
  x.etas = true
  return { po, why: null }
}

/** the first WO waiting on a part (to link an order to) */
function waitingWoFor(x: Tx, partId: string): string | undefined {
  return rsv(x).find((r) => r.partId === partId && !r.issued && !r.kitted)?.wo
}

function advance(x: Tx) {
  const t = x.t
  const day = dayOf(x)
  for (const po of ords(x)) {
    if (po.stage !== 'ordered' && po.stage !== 'inTransit') continue
    if (po.stageEndsAt === undefined || t < po.stageEndsAt) continue
    const part = pOf(x, po.partId)
    if (!part) continue
    if (po.stage === 'ordered') {
      const tr = transitDays(leadOf(part, po.mode))
      putPo(x, poNote({ ...po, stage: 'inTransit', stageEndsAt: t + tr * day }, t, `Shipped by ${part.vendor}: ${fmtDays(tr)} to the supply base`, 'inTransit'))
    } else {
      putPo(x, poNote({ ...po, stage: 'atBase', stageEndsAt: undefined }, t, po.heli ? 'At the supply base: helicopter requested' : 'At the supply base: booked on the next sailing', 'atBase'))
    }
    x.etas = true
  }
}

function refreshEtas(x: Tx) {
  const day = dayOf(x)
  const d = { boat: boatOf(x), heli: heliOf(x) }
  let changed = false
  const list = ords(x).map((po) => {
    if (!isOpenPo(po)) return po
    const eta = etaOf(po, pOf(x, po.partId), d, day, x.t)
    if (Math.abs(eta - po.eta) <= 1) return po
    changed = true
    return { ...po, eta }
  })
  if (changed) x.orders = list
}

function receive(x: Tx, po: PurchaseOrder, how: string) {
  const lvl = stk(x, po.partId)
  setStk(x, po.partId, { ...lvl, offshore: lvl.offshore + po.qty })
  putPo(x, poNote({ ...po, stage: 'received', stageEndsAt: undefined, eta: x.t }, x.t, `Received offshore (${how})`, 'received'))
  const part = pOf(x, po.partId)
  move(x, { partId: po.partId, qty: po.qty, kind: 'receipt', ref: po.id, text: `${fmtQty(po.qty)} ${part?.uom ?? ''} ${part?.short ?? po.partId} received offshore by ${how}${po.wo ? ` (for ${po.wo})` : ''}` })
}

// ================================================================= kitting & shortages

function allocate(x: Tx) {
  const list = [...rsv(x)]
  let changed = false
  const prio = new Map(useMaint.getState().wos.map((w) => [w.id, w.priority]))
  const byPart = new Map<string, number[]>()
  list.forEach((r, i) => {
    if (!r.issued) (byPart.get(r.partId) ?? byPart.set(r.partId, []).get(r.partId)!).push(i)
  })
  for (const [partId, idx] of byPart) {
    const part = pOf(x, partId)
    if (!part) continue
    idx.sort((a, b) => (prio.get(list[a].wo) ?? 3) - (prio.get(list[b].wo) ?? 3) || list[a].at - list[b].at)
    const lvl = stk(x, partId)
    // un-kit the lowest priority lines if the store holds less than is kitted (stock adjusted down)
    let kittedQty = idx.reduce((a, i) => a + (list[i].kitted ? list[i].qty : 0), 0)
    for (let j = idx.length - 1; j >= 0 && kittedQty > lvl.offshore + 1e-9; j--) {
      const i = idx[j]
      if (!list[i].kitted) continue
      kittedQty -= list[i].qty
      list[i] = { ...list[i], kitted: false }
      changed = true
      move(x, { partId, qty: 0, kind: 'adjust', ref: list[i].wo, text: `${part.short ?? part.name} un-kitted from ${list[i].wo} (store stock adjusted)` })
    }
    let free = lvl.offshore - kittedQty
    let need = 0
    let firstWo: string | undefined
    for (const i of idx) {
      const r = list[i]
      if (r.kitted) continue
      if (free + 1e-9 >= r.qty) {
        free -= r.qty
        list[i] = { ...r, kitted: true }
        changed = true
        move(x, { partId, qty: 0, kind: 'adjust', ref: r.wo, text: `${fmtQty(r.qty)} ${part.uom} ${part.short ?? part.name} kitted for ${r.wo} (${r.tag})` })
      } else {
        need += r.qty
        firstWo ??= r.wo
      }
    }
    if (need <= 0) continue
    // cover the shortage: what is already inbound, then the base, then a shortage requisition
    const inbound = (openOrders(ords(x)).get(partId) ?? []).reduce((a, o) => a + o.qty, 0)
    let uncovered = need - inbound
    // an unlinked open order covers the waiting WO: link it (display, ETA)
    for (const o of openOrders(ords(x)).get(partId) ?? [])
      if (!o.wo && firstWo) {
        putPo(x, poNote({ ...o, wo: firstWo }, x.t, `Linked to ${firstWo} (shortage)`))
        break
      }
    if (uncovered > 0 && stk(x, partId).base > 0) {
      const q = Math.min(stk(x, partId).base, uncovered)
      const r = createPo(x, part, q, 'transfer', { wo: firstWo, by: 'MRP (shortage)', note: `Shortage for ${firstWo}: transfer from base stock on the next sailing` })
      if (r.po) {
        uncovered -= q
        rec('auto', 'sparesTransfer', list[idx[0]]?.tag, `${r.po.id}: ${fmtQty(q)} × ${part.short ?? part.name} base → offshore for ${firstWo}`)
      }
    }
    if (uncovered > 0) {
      const q = Math.ceil(uncovered - 1e-9)
      const r = createPo(x, part, q, 'standard', { wo: firstWo, by: 'MRP (shortage)', note: `Shortage requisition for ${firstWo}` })
      if (r.po) rec('auto', 'sparesShortage', list[idx[0]]?.tag, `${r.po.id}: ${q} × ${part.short ?? part.name} for ${firstWo}: ${STAGE_SHORT[r.po.stage]}, ETA ${fmtEta(r.po.eta)}`)
    }
  }
  if (changed) setRsv(x, list)
}

/** for every unkitted reservation: the open order expected to cover it (priority order, earliest ETA first) */
export interface ShortInfo {
  po?: PurchaseOrder
  eta?: number
}
const shortCache = { res: null as Reservation[] | null, orders: null as PurchaseOrder[] | null, map: new Map<string, ShortInfo>() }
export function shortages(d: Pick<SparesData, 'reservations' | 'orders'> = D()): Map<string, ShortInfo> {
  if (shortCache.res === d.reservations && shortCache.orders === d.orders) return shortCache.map
  const map = new Map<string, ShortInfo>()
  const prio = new Map(useMaint.getState().wos.map((w) => [w.id, w.priority]))
  const byPart = new Map<string, Reservation[]>()
  for (const r of d.reservations) if (!r.issued && !r.kitted) (byPart.get(r.partId) ?? byPart.set(r.partId, []).get(r.partId)!).push(r)
  const oo = openOrders(d.orders)
  for (const [partId, rs] of byPart) {
    rs.sort((a, b) => (prio.get(a.wo) ?? 3) - (prio.get(b.wo) ?? 3) || a.at - b.at)
    const pos = (oo.get(partId) ?? []).map((po) => ({ po, left: po.qty }))
    for (const r of rs) {
      let need = r.qty
      let last: PurchaseOrder | undefined
      const pick = () => pos.filter((p) => p.left > 1e-9).sort((a, b) => Number(b.po.wo === r.wo) - Number(a.po.wo === r.wo) || a.po.eta - b.po.eta)[0]
      while (need > 1e-9) {
        const p = pick()
        if (!p) {
          last = undefined
          break
        }
        const q = Math.min(p.left, need)
        p.left -= q
        need -= q
        if (!last || p.po.eta > last.eta) last = p.po
      }
      map.set(`${r.wo}|${partId}`, last ? { po: last, eta: last.eta } : {})
    }
  }
  shortCache.res = d.reservations
  shortCache.orders = d.orders
  shortCache.map = map
  return map
}

/** "on order PO-45000001, ETA D129 06:00 ≈ 128 d" */
function whereText(info: ShortInfo | undefined, t: number, day: number): string {
  if (!info?.po) return 'no supply arranged: order it on the Spares & supply page'
  return `${STAGE_SHORT[info.po.stage]} ${info.po.id}, ETA ${fmtEta(info.po.eta)} ≈ ${fmtDays(Math.max(0, info.po.eta - t) / day)}`
}

// ================================================================= work-order materials (the maintenance hook)

function reserveFor(x: Tx, w: WorkOrder, who: Who = 'auto') {
  mod.seen.add(`${w.id}@${w.raisedAt}`)
  const mode = modeFor(w)
  if (!mode) return
  const ids = partsFor(w.tag, mode)
  if (!ids.length) return
  const have = rsv(x).filter((r) => r.wo === w.id)
  const add: Reservation[] = []
  for (const id of ids) {
    const part = pOf(x, id)
    if (!part || have.some((r) => r.partId === id)) continue
    add.push({ wo: w.id, tag: w.tag, partId: id, qty: part.perJob || 1, kitted: false, issued: false, at: x.t })
  }
  if (!add.length) return
  setRsv(x, [...add, ...rsv(x)])
  allocate(x)
  const mine = rsv(x).filter((r) => r.wo === w.id && !r.issued)
  const ok = mine.every((r) => r.kitted)
  mod.stats.raised++
  if (ok) mod.stats.firstPass++
  const names = mine.map((r) => `${fmtQty(r.qty)} × ${pOf(x, r.partId)?.short ?? r.partId}${r.kitted ? '' : ' (SHORT)'}`).join(', ')
  rec(who, 'sparesReserve', w.tag, `${w.id} (${mode}): ${names}${ok ? ': kitted from the offshore store' : ''}`)
}

function issueFor(x: Tx, woId: string, why: string) {
  const res = rsv(x)
  if (!res.some((r) => r.wo === woId && !r.issued)) return
  const list = res.map((r) => {
    if (r.wo !== woId || r.issued) return r
    const part = pOf(x, r.partId)
    const lvl = stk(x, r.partId)
    const q = Math.min(r.qty, Math.max(0, lvl.offshore))
    setStk(x, r.partId, { ...lvl, offshore: lvl.offshore - q })
    x.add.partsIssued += q * (part?.unitCost ?? 0)
    move(x, { partId: r.partId, qty: -q, kind: 'issue', ref: woId, text: `${fmtQty(q)} ${part?.uom ?? ''} ${part?.short ?? r.partId} issued to ${woId} (${r.tag}): ${why}${q < r.qty ? ` · ${fmtQty(r.qty - q)} short` : ''}` })
    return { ...r, kitted: true, issued: true }
  })
  setRsv(x, list)
}

function releaseFor(x: Tx, woId: string, why: string) {
  const res = rsv(x)
  const mine = res.filter((r) => r.wo === woId && !r.issued)
  if (!mine.length) return
  setRsv(x, res.filter((r) => !(r.wo === woId && !r.issued)))
  for (const r of mine) move(x, { partId: r.partId, qty: 0, kind: 'adjust', ref: woId, text: `Reservation for ${woId} released (${why})` })
  // orders raised for the WO stay open — the stock goes to the store
  for (const po of ords(x)) if (po.wo === woId && isOpenPo(po)) putPo(x, poNote({ ...po, wo: undefined }, x.t, `${woId} ${why}: delivery goes to stock`))
}

/** reconcile with the work-order list: WOs raised without the hook, WOs closed without completion / cancel */
function syncWos(x: Tx) {
  const wos = useMaint.getState().wos
  if (wos === mod.lastWos) return
  mod.lastWos = wos
  x.wosChanged = true
  const byId = new Map(wos.map((w) => [w.id, w]))
  const pending = new Set(rsv(x).filter((r) => !r.issued).map((r) => r.wo))
  for (const id of pending) {
    const w = byId.get(id)
    if (!w) releaseFor(x, id, 'work order no longer exists')
    else if (w.status === 'complete' || (w.status === 'returned' && w.completedAt !== undefined)) issueFor(x, id, 'job complete')
    else if (!isOpen(w)) releaseFor(x, id, w.status === 'cancelled' ? 'WO cancelled' : 'WO closed without the job')
  }
  for (const w of wos) if (isOpen(w) && WAITING_STATUS.includes(w.status) && !mod.seen.has(`${w.id}@${w.raisedAt}`)) reserveFor(x, w)
}

function gate(w: WorkOrder): string | null {
  if (!GATED.includes(w.type)) return null
  const d = D()
  const short = d.reservations.filter((r) => r.wo === w.id && !r.issued && !r.kitted)
  if (!short.length) return null
  const info = shortages(d)
  const t = now()
  const day = daySeconds(d.mode)
  // the line that arrives last decides
  let worst = short[0]
  let worstEta = -1
  for (const r of short) {
    const i = info.get(`${r.wo}|${r.partId}`)
    const e = i?.eta ?? Infinity
    if (e > worstEta) {
      worst = r
      worstEta = e
    }
  }
  const part = partById(worst.partId)
  const more = short.length > 1 ? ` (+${short.length - 1} more line${short.length > 2 ? 's' : ''})` : ''
  return `${w.id}: awaiting spares, ${part?.short ?? part?.name ?? worst.partId} (${whereText(info.get(`${worst.wo}|${worst.partId}`), t, day)})${more}`
}

// ================================================================= the plugin step

function consume(x: Tx, dt: number) {
  const t = x.t
  const day = dayOf(x)
  const f = S().result?.f
  for (const p of partsOf(x)) {
    if (!p.usagePerDay) continue
    const k = p.driver === 'oil' ? (f?.oil ?? 1) : p.driver === 'gas' ? (f?.gas ?? 1) : p.driver === 'water' ? (f?.water ?? 1) : 1
    const use = (p.usagePerDay * Math.max(0, Math.min(2, k)) * dt) / day
    mod.pend[p.id] = (mod.pend[p.id] ?? 0) + use
  }
  if (t - mod.lastFlush < Math.min(day / 12, 300)) return
  mod.lastFlush = t
  for (const [id, q] of Object.entries(mod.pend)) {
    if (q <= 0) continue
    const lvl = stk(x, id)
    const left = lvl.offshore - q
    setStk(x, id, { ...lvl, offshore: Math.max(0, left) })
    mod.used[id] = (mod.used[id] ?? 0) + Math.min(q, lvl.offshore)
    if (left <= 0 && !mod.stockoutSeen.has(id)) {
      mod.stockoutSeen.add(id)
      const p = pOf(x, id)
      move(x, { partId: id, qty: 0, kind: 'consume', text: `STOCK-OUT offshore: ${p?.short ?? id} (usage continues unmet until the next delivery)` })
      rec('auto', 'sparesStockout', p?.fits[0], `${p?.short ?? id} out of stock offshore`)
    } else if (left > 0) mod.stockoutSeen.delete(id)
  }
  mod.pend = {}
  if (mod.wamAcc > 0) {
    x.add.wamBoe += mod.wamAcc
    mod.wamAcc = 0
  }
  // one consumption line per part per sailing cycle
  if (t >= mod.nextUseMove) {
    mod.nextUseMove = t + L.boatEvery * day
    for (const [id, q] of Object.entries(mod.used)) {
      if (q < 0.05) continue
      const p = pOf(x, id)
      move(x, { partId: id, qty: -q, kind: 'consume', text: `${p?.short ?? id}: ${fmtQty(q)} ${p?.uom ?? ''} used (${p?.driver === 'calendar' ? 'calendar' : `${p?.driver} throughput`})` })
    }
    mod.used = {}
  }
}

function setBoat(x: Tx, b: LogisticsLeg) {
  x.boat = b
  x.etas = true
}
function legProgress(l: LogisticsLeg, t: number) {
  if (l.until <= l.since) return l.progress
  return Math.max(0, Math.min(1, (t - l.since) / (l.until - l.since)))
}

function stepBoat(x: Tx) {
  const t = x.t
  const day = dayOf(x)
  let b = boatOf(x)
  const hs = seaStateNow()
  const every = L.boatEvery * day
  const load = () => {
    // cargo: everything at the base for the boat, and consumable top-ups to the offshore cover target
    const cargo = [...b.cargo]
    for (const po of ords(x)) {
      if (po.stage !== 'atBase' || po.heli || cargo.includes(po.id)) continue
      const part = pOf(x, po.partId)
      const fr = (part?.kg ?? 0) * po.qty * L.boatUsdKg + L.boatUsdLine
      x.add.freight += fr
      putPo(x, poNote({ ...po, stage: 'onBoat', freight: po.freight + fr }, t, `Loaded on ${VESSEL_NAME} (freight ${usd(fr)})`, 'onBoat'))
      cargo.push(po.id)
    }
    return cargo
  }
  switch (b.state) {
    case 'atBase':
      if (t >= b.next - L.boatLoad * day) {
        topUp(x)
        b = { ...b, state: 'loading', since: t, until: b.next, progress: 0 }
        b = { ...b, cargo: load() }
        setBoat(x, b)
      }
      break
    case 'loading': {
      const cargo = load()
      if (t >= b.until) {
        setBoat(x, { ...b, state: 'sailing', since: t, until: t + L.boatSail * day, cargo, next: b.next + every, progress: 0, note: undefined })
      } else if (cargo.length !== b.cargo.length) setBoat(x, { ...b, cargo })
      break
    }
    case 'sailing':
      if (t >= b.until) {
        if (hs > L.hsLimit) {
          mod.holdRemain = L.boatAlongside * day
          setBoat(x, { ...b, state: 'weatherHold', since: t, until: t, progress: 0, note: `Waiting on weather: Hs ${hs.toFixed(1)} m > ${L.hsLimit.toFixed(1)} m offload limit` })
        } else setBoat(x, { ...b, state: 'alongside', since: t, until: t + L.boatAlongside * day, progress: 0, note: undefined })
      } else x.boat = { ...b, progress: legProgress(b, t) }
      break
    case 'weatherHold': {
      const note = `Waiting on weather: Hs ${hs.toFixed(1)} m > ${L.hsLimit.toFixed(1)} m offload limit`
      if (hs <= L.hsLimit - L.hsResume) setBoat(x, { ...b, state: 'alongside', since: t, until: t + Math.max(mod.holdRemain, day * 0.02), progress: 0, note: undefined })
      else if (b.note !== note) x.boat = { ...b, note }
      break
    }
    case 'alongside':
      if (hs > L.hsLimit) {
        mod.holdRemain = Math.max(0, b.until - t)
        setBoat(x, { ...b, state: 'weatherHold', since: t, until: t, progress: 0, note: `Offload suspended: Hs ${hs.toFixed(1)} m > ${L.hsLimit.toFixed(1)} m` })
      } else if (t >= b.until) {
        for (const id of b.cargo) {
          const po = ords(x).find((o) => o.id === id)
          if (po && po.stage === 'onBoat') receive(x, po, VESSEL_NAME)
        }
        setBoat(x, { ...b, state: 'returning', since: t, until: t + L.boatSail * day, cargo: [], progress: 0 })
      } else x.boat = { ...b, progress: legProgress(b, t) }
      break
    case 'returning':
      if (t >= b.until) {
        const next = Math.max(b.next, t + L.boatLoad * day)
        setBoat(x, { ...b, state: 'atBase', since: t, until: next - L.boatLoad * day, next, progress: 0 })
      } else x.boat = { ...b, progress: legProgress(b, t) }
      break
    default:
      setBoat(x, { ...idleLeg('atBase', t), until: t + L.boatLoad * day, next: t + L.boatFirst * day })
  }
}

/** consumables: transfer from the base on this sailing to bring the offshore store up to the cover target */
function topUp(x: Tx) {
  const f = S().result?.f
  for (const p of partsOf(x)) {
    if (!p.usagePerDay) continue
    const lvl = stk(x, p.id)
    const k = p.driver === 'oil' ? (f?.oil ?? 1) : p.driver === 'gas' ? (f?.gas ?? 1) : p.driver === 'water' ? (f?.water ?? 1) : 1
    const target = L.coverDays * p.usagePerDay * Math.max(0.5, Math.min(1.5, k))
    const inbound = (openOrders(ords(x)).get(p.id) ?? []).filter((o) => o.stage === 'atBase' || o.stage === 'onBoat' || o.stage === 'onHeli').reduce((a, o) => a + o.qty, 0)
    const need = target - lvl.offshore - inbound
    if (need < 0.5 || lvl.base < 0.5) continue
    const q = Math.min(Math.floor(lvl.base), Math.ceil(need))
    if (q < 1) continue
    createPo(x, p, q, 'transfer', { by: 'MRP (top-up)', note: `Consumable top-up to ${L.coverDays} d offshore cover` })
  }
}

function stepHeli(x: Tx) {
  const t = x.t
  const day = dayOf(x)
  const h = heliOf(x)
  switch (h.state) {
    case 'idle': {
      const queue = ords(x).filter((o) => o.stage === 'atBase' && o.heli)
      if (!queue.length) {
        if (h.note || h.next) x.heli = { ...h, note: undefined, next: 0 }
        break
      }
      const wind = windNow().speed
      if (wind > L.heliWind) {
        const note = `Grounded: wind ${wind.toFixed(0)} m/s > ${L.heliWind} m/s`
        if (h.note !== note || h.next !== t) x.heli = { ...h, note, next: t }
        break
      }
      // lift: work-order cargo first, up to the payload
      const prio = new Map(useMaint.getState().wos.map((w) => [w.id, w.priority]))
      queue.sort((a, b) => (a.wo ? (prio.get(a.wo) ?? 3) : 9) - (b.wo ? (prio.get(b.wo) ?? 3) : 9) || a.raisedAt - b.raisedAt)
      let kg = 0
      const cargo: PurchaseOrder[] = []
      for (const po of queue) {
        const w = (pOf(x, po.partId)?.kg ?? 0) * po.qty
        if (kg + w > L.heliKg && cargo.length) continue
        kg += w
        cargo.push(po)
      }
      const share = L.heliUsd / Math.max(1, cargo.length)
      x.add.freight += L.heliUsd
      for (const po of cargo) putPo(x, poNote({ ...po, stage: 'onHeli', freight: po.freight + share }, t, `Flown out by helicopter (${Math.round(kg)} kg lift, charter ${usd(L.heliUsd)}${cargo.length > 1 ? ` shared by ${cargo.length}` : ''})`, 'onHeli'))
      x.heli = { state: 'inbound', progress: 0, since: t, until: t + heliS('out', day), cargo: cargo.map((p) => p.id), next: 0 }
      x.etas = true
      rec('auto', 'sparesHeli', undefined, `${HELI_NAME} departs with ${cargo.map((p) => p.id).join(', ')} (${Math.round(kg)} kg)`)
      break
    }
    case 'inbound':
      if (t >= h.until) {
        for (const id of h.cargo) {
          const po = ords(x).find((o) => o.id === id)
          if (po && po.stage === 'onHeli') receive(x, po, 'helicopter')
        }
        x.heli = { ...h, state: 'landed', since: t, until: t + heliS('landed', day), progress: 0 }
      } else x.heli = { ...h, progress: legProgress(h, t) }
      break
    case 'landed':
      if (t >= h.until) x.heli = { ...h, state: 'outbound', since: t, until: t + heliS('back', day), cargo: [], progress: 0 }
      else x.heli = { ...h, progress: legProgress(h, t) }
      break
    case 'outbound':
      if (t >= h.until) x.heli = { ...idleLeg('idle', t) }
      else x.heli = { ...h, progress: legProgress(h, t) }
      break
    default:
      x.heli = idleLeg('idle', t)
  }
}

function mrp(x: Tx) {
  const oo = openOrders(ords(x))
  for (const p of partsOf(x)) {
    if (p.rop <= 0) continue
    const lvl = stk(x, p.id)
    const onOrder = (oo.get(p.id) ?? []).reduce((a, o) => a + o.qty, 0)
    const pos = lvl.offshore + lvl.base + onOrder - lvl.reserved
    if (pos > p.rop) continue
    const q = Math.max(1, Math.ceil(p.max - pos - 1e-9))
    const r = createPo(x, p, q, 'standard', { by: 'MRP (min/max)', note: `Position ${fmtQty(pos)} ≤ reorder point ${p.rop}` })
    if (r.po) rec('auto', 'sparesMrp', p.fits[0], `${r.po.id}: ${q} × ${p.short ?? p.name} (${usd(r.po.material)}): ${r.po.stage === 'requisition' ? 'requisition awaiting approval' : 'auto-approved, PO placed'}`)
  }
}

function accrueWam(dt: number) {
  for (const w of mod.waiting) {
    const st = runOf(w.tag)
    if (st === 'running' || st === 'starting') continue
    mod.wamAcc += (impactBoeD(w.tag) * dt) / 86400
  }
}

function step(dt: number) {
  if (!ensureInit()) return
  withTx((x) => {
    syncWos(x)
    consume(x, dt)
    advance(x)
    stepBoat(x)
    stepHeli(x)
    if (x.dirty) allocate(x)
    if (x.patch.autoMrp ?? x.s.autoMrp) mrp(x)
  })
  accrueWam(dt)
}

// ================================================================= init / seed

function seedData(p: Plant, mode: LogisticsMode): SparesData {
  const t = now()
  const day = daySeconds(mode)
  const cat = buildCatalog(p)
  const d: SparesData = {
    ...emptyData(),
    plantName: p.name,
    mode,
    parts: cat.parts,
    stock: cat.stock,
    boat: { state: 'atBase', progress: 0, since: t, until: t + (L.boatFirst - L.boatLoad) * day, cargo: [], next: t + L.boatFirst * day },
    heli: idleLeg('idle', t),
  }
  const dgs = cat.parts.find((x) => x.id === DGS_PART)
  if (dgs) {
    d.orders = [dgsPo(dgs, d, t, day)]
    d.seq = { po: 1 }
  }
  d.moves = [{ t, partId: '', qty: 0, kind: 'adjust', text: `Opening stock: ${cat.parts.length} materials (simulated seed)` }]
  d.kpis = computeKpis(d, ZERO_KPIS, { partsIssued: 0, premiums: 0, freight: 0, wamBoe: 0 })
  return d
}
function dgsPo(dgs: SparePart, d: Pick<SparesData, 'boat' | 'heli'>, t: number, day: number, id = DGS_PO): PurchaseOrder {
  const remain = dgs.leadDays - DGS_PO_AGE_DAYS
  const po: PurchaseOrder = {
    id,
    partId: dgs.id,
    qty: 1,
    mode: 'standard',
    stage: 'ordered',
    heli: false,
    raisedAt: t,
    raisedBy: 'Materials planner (insurance spare reorder)',
    stageEndsAt: t + (remain - transitDays(dgs.leadDays)) * day,
    eta: 0,
    material: dgs.unitCost,
    premium: 0,
    freight: 0,
    history: [{ t, stage: 'ordered', text: `Standard PO placed ${DGS_PO_AGE_DAYS} d before this session with ${dgs.vendor}: manufacturing slot, ${remain} d to go (simulated)` }],
  }
  return { ...po, eta: etaOf(po, dgs, d, day, t) }
}

/** build the catalogue for the loaded plant if needed; false while no plant is loaded */
export function ensureSpares(): boolean {
  return ensureInit()
}
function ensureInit(): boolean {
  const p = plant()
  if (!p) return false
  const d = D()
  if (d.plantName === p.name && d.parts.length) return true
  resetMod()
  useSpares.setState(seedData(p, d.mode ?? 'demo'))
  return true
}

function reset() {
  const p = plant()
  resetMod()
  if (p) useSpares.setState(seedData(p, 'demo'))
  else useSpares.setState(emptyData())
}

// ================================================================= public API

/** previews for the order buttons: cost and ETA if ordered now (null cost = refused) */
export interface OrderPreview {
  why: string | null
  material: number
  premium: number
  freight: number
  total: number
  eta: number
  days: number
  heli: boolean
  approval: boolean
}
export function previewOrder(partId: string, qty: number, mode: PoMode, heli = false): OrderPreview {
  const d = D()
  const part = partById(partId)
  const t = now()
  const day = daySeconds(d.mode)
  const h = mode === 'emergency' || heli
  const none: OrderPreview = { why: null, material: 0, premium: 0, freight: 0, total: 0, eta: t, days: 0, heli: h, approval: false }
  if (!part) return { ...none, why: `${partId}: no such material` }
  if (!(qty > 0)) return { ...none, why: 'Quantity must be positive' }
  if (h && part.kg * qty > L.heliKg) return { ...none, why: `${Math.round(part.kg * qty)} kg: over the ${L.heliKg} kg helicopter limit` }
  if (mode === 'transfer' && (d.stock[partId]?.base ?? 0) + 1e-9 < qty) return { ...none, why: `Only ${fmtQty(d.stock[partId]?.base ?? 0)} ${part.uom} at the base` }
  const lead = leadOf(part, mode)
  const material = mode === 'transfer' ? 0 : part.unitCost * qty
  const premium = mode === 'standard' || mode === 'transfer' ? 0 : material * part.expeditePremium
  const freight = h ? L.heliUsd : part.kg * qty * L.boatUsdKg + L.boatUsdLine
  const eta = arrival(d.boat, day, t + lead * day, h)
  return { why: null, material, premium, freight, total: material + premium + freight, eta, days: (eta - t) / day, heli: h, approval: mode !== 'transfer' && material + premium > d.approvalLimit }
}
/** what expediting an open PO would cost and save */
export function previewExpedite(poId: string, heli = false): { why: string | null; premium: number; freight: number; eta: number; days: number; savedDays: number } {
  const d = D()
  const po = d.orders.find((o) => o.id === poId)
  const t = now()
  const day = daySeconds(d.mode)
  const r0 = { why: null as string | null, premium: 0, freight: 0, eta: po?.eta ?? t, days: 0, savedDays: 0 }
  if (!po || !isOpenPo(po)) return { ...r0, why: `${poId} is not open` }
  const part = partById(po.partId)
  if (!part) return { ...r0, why: 'no such material' }
  if (po.stage === 'onBoat' || po.stage === 'onHeli') return { ...r0, why: `${STAGE_SHORT[po.stage]}` }
  if (heli && part.kg * po.qty > L.heliKg) return { ...r0, why: `${Math.round(part.kg * po.qty)} kg: over the helicopter limit` }
  let tBase: number
  let premium = 0
  if (po.stage === 'atBase') tBase = t
  else {
    const old = po.stage === 'requisition' ? t + part.leadDays * day : po.stage === 'ordered' ? (po.stageEndsAt ?? t) + transitDays(leadOf(part, po.mode)) * day : (po.stageEndsAt ?? t)
    const fresh = po.mode === 'standard' ? t + part.expediteDays * day : old
    tBase = Math.min(old, fresh)
    if (po.mode === 'standard') premium = part.unitCost * po.qty * part.expeditePremium
  }
  const h = heli || po.heli
  const eta = arrival(d.boat, day, tBase, h)
  return { why: null, premium, freight: h && !po.heli ? L.heliUsd : 0, eta, days: (eta - t) / day, savedDays: Math.max(0, (po.eta - eta) / day) }
}

function place(partId: string, qty: number, mode: PoMode, opts: OrderOpts = {}): { id: string | null; why: string | null } {
  if (!ensureInit()) return { id: null, why: 'No plant loaded' }
  const part = partById(partId)
  if (!part) return { id: null, why: `${partId}: no such material` }
  return withTx((x) => {
    const wo = opts.wo ?? waitingWoFor(x, partId)
    const r = createPo(x, part, qty, mode, { ...opts, wo })
    if (!r.po) return { id: null, why: r.why }
    rec(opts.who ?? 'operator', mode === 'transfer' ? 'sparesTransfer' : 'sparesOrder', part.fits[0], `${r.po.id}: ${fmtQty(qty)} × ${part.short ?? part.name}: ${mode}${r.po.heli ? ' + helicopter' : ''}, ${STAGE_SHORT[r.po.stage]}, ETA ${fmtEta(r.po.eta)}${wo ? ` (for ${wo})` : ''}`)
    return { id: r.po.id, why: null }
  })
}

function approve(poId: string, opts: { by?: string; who?: Who } = {}): string | null {
  return withTx((x) => {
    const po = ords(x).find((o) => o.id === poId)
    if (!po) return `${poId}: no such order`
    if (po.stage !== 'requisition') return `${poId} is ${PO_STAGE_LABEL[po.stage]}: only a requisition can be approved`
    const part = pOf(x, po.partId)
    if (!part) return `${poId}: unknown material`
    const lead = leadOf(part, po.mode)
    putPo(x, poNote({ ...po, stage: 'ordered', stageEndsAt: x.t + (lead - transitDays(lead)) * dayOf(x) }, x.t, `Approved by ${opts.by ?? 'Asset manager'}: PO placed with ${part.vendor}`, 'ordered'))
    if (po.premium) x.add.premiums += po.premium
    rec(opts.who ?? 'operator', 'sparesApprove', part.fits[0], `${poId}: ${part.short ?? part.name} ${usd(po.material + po.premium)} approved`)
    return null
  })
}

function cancelPo(poId: string, opts: { who?: Who } = {}): string | null {
  return withTx((x) => {
    const po = ords(x).find((o) => o.id === poId)
    if (!po) return `${poId}: no such order`
    if (!isOpenPo(po)) return `${poId} is ${PO_STAGE_LABEL[po.stage]}`
    if (po.stage === 'onBoat' || po.stage === 'onHeli') return `${poId} is ${STAGE_SHORT[po.stage]}: it can't be recalled`
    if (po.stage === 'atBase' && po.mode !== 'transfer') return `${poId} is already at the supply base: it ships on the next sailing`
    if (po.mode === 'transfer') {
      const lvl = stk(x, po.partId)
      setStk(x, po.partId, { ...lvl, base: lvl.base + po.qty })
      move(x, { partId: po.partId, qty: po.qty, kind: 'transfer', ref: poId, text: 'Transfer cancelled: back to base stock' })
    }
    putPo(x, poNote({ ...po, stage: 'cancelled', stageEndsAt: undefined }, x.t, po.stage === 'ordered' || po.stage === 'inTransit' ? 'Cancelled (vendor cancellation terms apply)' : 'Cancelled', 'cancelled'))
    rec(opts.who ?? 'operator', 'sparesCancel', pOf(x, po.partId)?.fits[0], `${poId} cancelled`)
    return null
  })
}

function expedite(poId: string, opts: { heli?: boolean; by?: string; who?: Who } = {}): string | null {
  return withTx((x) => {
    const po = ords(x).find((o) => o.id === poId)
    if (!po) return `${poId}: no such order`
    if (!isOpenPo(po)) return `${poId} is ${PO_STAGE_LABEL[po.stage]}`
    const part = pOf(x, po.partId)
    if (!part) return `${poId}: unknown material`
    const t = x.t
    const day = dayOf(x)
    const heli = !!opts.heli
    if (po.stage === 'onBoat' || po.stage === 'onHeli') return `${poId} is ${STAGE_SHORT[po.stage]}: ETA ${fmtEta(po.eta)}`
    if (heli && part.kg * po.qty > L.heliKg) return `${poId}: ${Math.round(part.kg * po.qty)} kg: over the helicopter's ${L.heliKg} kg limit`
    const by = opts.by ?? 'Asset manager'
    if (po.stage === 'atBase') {
      if (!heli) return po.heli ? `${poId} is already waiting for the helicopter` : `${poId} is at the supply base: it sails on the next boat (ETA ${fmtEta(po.eta)}); expedite with the helicopter to fly it out now`
      if (po.heli) return `${poId} is already waiting for the helicopter`
      putPo(x, poNote({ ...po, heli: true, mode: po.mode === 'transfer' ? 'transfer' : 'emergency' }, t, `Switched to helicopter by ${by}`))
      rec(opts.who ?? 'operator', 'sparesExpedite', part.fits[0], `${poId}: ${part.short ?? part.name}: fly out from the base now`)
      return null
    }
    const already = po.mode !== 'standard'
    if (already && (!heli || po.heli)) return `${poId} is already expedited${po.heli ? ' by helicopter' : ''}: ETA ${fmtEta(po.eta)}`
    let next: PurchaseOrder = { ...po, heli: po.heli || heli }
    const notes: string[] = []
    if (!already) {
      // exchange unit / vendor premium: the vendor clock restarts at the expedited lead, if that is sooner
      const premium = part.unitCost * po.qty * part.expeditePremium
      const oldBase = po.stage === 'requisition' ? t + part.leadDays * day : po.stage === 'ordered' ? (po.stageEndsAt ?? t) + transitDays(part.leadDays) * day : (po.stageEndsAt ?? t)
      const newBase = t + part.expediteDays * day
      if (newBase < oldBase) {
        next = { ...next, stage: 'ordered', stageEndsAt: t + (part.expediteDays - transitDays(part.expediteDays)) * day }
        notes.push(`exchange unit / vendor priority slot: ${part.expediteDays} d to the base`)
      } else notes.push('already sooner than the expedited lead: premium for priority handling')
      next = { ...next, premium, mode: next.heli ? 'emergency' : 'expedite' }
      x.add.premiums += premium
      notes.push(`premium ${usd(premium)} (+${Math.round(part.expeditePremium * 100)} %)`)
      if (po.stage === 'requisition') notes.push(`approved by ${by}`)
      if (po.stage === 'requisition' && next.stage === 'requisition') next = { ...next, stage: 'ordered', stageEndsAt: t + (part.leadDays - transitDays(part.leadDays)) * day }
    } else next = { ...next, mode: 'emergency' }
    if (heli) notes.push('last leg by helicopter')
    next = poNote(next, t, `Expedited by ${by}: ${notes.join('; ')}`, next.stage !== po.stage ? next.stage : 'note')
    next = { ...next, eta: etaOf(next, part, { boat: boatOf(x), heli: heliOf(x) }, day, t) }
    putPo(x, next)
    rec(opts.who ?? 'operator', 'sparesExpedite', part.fits[0], `${poId}: ${part.short ?? part.name} expedited${heli ? ' + helicopter' : ''}: ETA ${fmtEta(next.eta)} (was ${fmtEta(po.eta)}), premium ${usd(next.premium)}`)
    return null
  })
}

/** `reserved` in the patch is ignored: it is always the sum of the open reservations */
function setStock(partId: string, patch: Partial<StockLevel>, opts: { who?: Who; why?: string } = {}): string | null {
  if (!ensureInit()) return 'No plant loaded'
  return withTx((x) => {
    const part = pOf(x, partId)
    if (!part) return `${partId}: no such material`
    const lvl = stk(x, partId)
    const next = { ...lvl, offshore: Math.max(0, patch.offshore ?? lvl.offshore), base: Math.max(0, patch.base ?? lvl.base) }
    setStk(x, partId, next)
    move(x, { partId, qty: next.offshore + next.base - lvl.offshore - lvl.base, kind: 'adjust', text: `Stock set: offshore ${fmtQty(next.offshore)}, base ${fmtQty(next.base)}${opts.why ? `: ${opts.why}` : ' (instructor / demo)'}` })
    rec(opts.who ?? 'instructor', 'sparesStock', part.fits[0], `${part.short ?? part.name}: offshore ${fmtQty(lvl.offshore)} → ${fmtQty(next.offshore)}, base ${fmtQty(lvl.base)} → ${fmtQty(next.base)}`)
    return null
  })
}

function setMode(mode: LogisticsMode, opts: { who?: Who } = {}): string | null {
  if (!ensureInit()) return 'No plant loaded'
  const d = D()
  if (d.mode === mode) return null
  return withTx((x) => {
    const t = x.t
    const r = daySeconds(mode) / daySeconds(d.mode)
    const sc = (v: number) => t + (v - t) * r
    if (!x.orders) x.orders = [...x.s.orders]
    x.orders = x.orders.map((o) => (isOpenPo(o) ? { ...o, stageEndsAt: o.stageEndsAt === undefined ? undefined : sc(o.stageEndsAt), eta: sc(o.eta) } : o))
    x.dirty = true
    const legs = (l: LogisticsLeg): LogisticsLeg => ({ ...l, since: t - (t - l.since) * r, until: sc(l.until), next: l.next ? sc(l.next) : 0 })
    x.boat = legs(boatOf(x))
    x.heli = legs(heliOf(x))
    mod.holdRemain *= r
    mod.lastFlush = t
    mod.nextUseMove = sc(mod.nextUseMove)
    x.patch.mode = mode
    x.etas = true
    rec(opts.who ?? 'operator', 'sparesClock', undefined, `logistics clock → ${mode === 'demo' ? `demo (1 logistics day = ${daySeconds('demo')} sim s)` : 'real time'}`)
    return null
  })
}

function setAutoMrp(on: boolean, opts: { who?: Who } = {}): string | null {
  if (D().autoMrp === on) return null
  useSpares.setState({ autoMrp: on })
  rec(opts.who ?? 'operator', 'sparesAutoMrp', undefined, `automatic min/max replenishment ${on ? 'on' : 'off'}`)
  return null
}
function setApprovalLimit(v: number, opts: { who?: Who } = {}): string | null {
  if (!(v >= 0)) return 'Approval limit must be ≥ 0'
  useSpares.setState({ approvalLimit: v })
  rec(opts.who ?? 'operator', 'sparesApprovalLimit', undefined, `requisitions above ${usd(v)} need approval`)
  return null
}

/** demo story: the DGS cartridge at zero offshore and at the base, a standard PO open with an ETA months away */
function seedDgsShortage(opts: { who?: Who } = {}): string | null {
  if (!ensureInit()) return 'No plant loaded'
  const dgs = partById(DGS_PART)
  if (!dgs) return `${DGS_PART} is not in this plant's catalogue (no ${A.TAGS.compressor})`
  setStock(DGS_PART, { offshore: 0, base: 0 }, { who: opts.who ?? 'scenario', why: 'demo story' })
  return withTx((x) => {
    // exactly one order open — the story's standard PO with its stable id (reset in place), nothing expedited
    for (const o of ords(x)) if (o.partId === DGS_PART && isOpenPo(o) && o.id !== DGS_PO) putPo(x, poNote({ ...o, stage: 'cancelled', stageEndsAt: undefined }, x.t, 'Cancelled (demo story reset)', 'cancelled'))
    putPo(x, dgsPo(dgs, { boat: boatOf(x), heli: heliOf(x) }, x.t, dayOf(x)))
    if ((x.seq ?? x.s.seq.po) < 1) x.seq = 1
    rec(opts.who ?? 'scenario', 'sparesStory', A.TAGS.compressor, `${dgs.short}: 0 offshore / 0 base, standard PO open (ETA ≈ ${dgs.leadDays - DGS_PO_AGE_DAYS} d)`)
    return null
  })
}

/** actions (all return a refusal string, or null on success) */
export const sparesApi = {
  /** order a material: standard (boat), expedite (premium, boat), emergency (premium + helicopter), transfer (from the base) */
  order: (partId: string, qty: number, mode: PoMode, opts?: OrderOpts): string | null => place(partId, qty, mode, opts).why,
  /** same as order, also returns the PO id */
  place,
  approve,
  cancel: cancelPo,
  /** switch an open PO to expedite (exchange unit / vendor premium) and, with heli, the helicopter for the last leg */
  expedite,
  /** move stock from the onshore base to the offshore store (next sailing, or the helicopter) */
  transfer: (partId: string, qty: number, heli = false, opts?: Omit<OrderOpts, 'heli'>): string | null => place(partId, qty, 'transfer', { ...opts, heli }).why,
  setMode,
  setAutoMrp,
  setApprovalLimit,
  /** demo / instructor: set the stock of a material (re-kits waiting work orders) */
  setStock,
  seedDgsShortage,
  reset: (opts: { who?: Who } = {}): string | null => {
    reset()
    rec(opts.who ?? 'operator', 'sparesReset', undefined, 'spares & supply reset to the seed dataset')
    return null
  },
}

// ================================================================= read helpers (asset risk, assistant, console)

/** parts cover for a job on `tag` (failure mode, or 'PM'); real days until the parts can be offshore */
export function coverFor(tag: string, failureMode?: string): SpareCover {
  ensureInit()
  const d = D()
  const t = now()
  const day = daySeconds(d.mode)
  let mode = failureMode?.replace(/^FAILURE:\s*/i, '').trim() || undefined
  let worstCase = false
  if (!mode) {
    const h = useMaint.getState().health[tag]
    if (h && (h.degr > 0 || h.stage !== 'normal') && h.mode) mode = h.mode
  }
  let ids: string[]
  if (mode) ids = partsFor(tag, mode)
  else {
    worstCase = true
    const m = indexOf(d.parts).byTag.get(tag)
    ids = m ? [...new Set([...m.entries()].filter(([k]) => k !== 'PM').flatMap(([, v]) => v))] : []
  }
  if (!ids.length) return { status: 'notStocked', partIds: [], waitDays: 0, note: mode ? `no catalogue part for ${tag}: ${mode}` : `no catalogue parts for ${tag}` }
  const rank: Record<SpareCover['status'], number> = { onboard: 0, base: 1, onOrder: 2, none: 3, notStocked: 4 }
  const info = shortages(d)
  const kittedBy = new Map<string, number>()
  for (const r of d.reservations) if (!r.issued && r.kitted) kittedBy.set(r.partId, (kittedBy.get(r.partId) ?? 0) + r.qty)
  const openWo = useMaint.getState().wos.find((w) => w.tag === tag && isOpen(w))
  const ix = indexOf(d.parts)
  // the cover is set by the part that takes longest to get offshore
  let best: { st: SpareCover['status']; w: number; n: string } | null = null
  for (const id of ids) {
    const p = ix.byId.get(id)
    const s = d.stock[id]
    if (!p || !s) continue
    const name = p.short ?? p.name
    const mine = openWo ? d.reservations.find((r) => r.wo === openWo.id && r.partId === id && !r.issued) : undefined
    let c: { st: SpareCover['status']; w: number; n: string }
    if (mine?.kitted) c = { st: 'onboard', w: 0, n: `${name} kitted for ${mine.wo}` }
    else if (mine) {
      const i = info.get(`${mine.wo}|${id}`)
      c = i?.po ? { st: 'onOrder', w: Math.max(0, i.po.eta - t) / day, n: `${name}: ${STAGE_SHORT[i.po.stage]} ${i.po.id}, ETA ${fmtEta(i.po.eta)}` } : { st: 'none', w: p.leadDays, n: `${name}: none in stock or on order (standard lead ${p.leadDays} d)` }
    } else if (s.offshore - (kittedBy.get(id) ?? 0) + 1e-9 >= (p.perJob || 1)) c = { st: 'onboard', w: 0, n: `${name}: ${fmtQty(s.offshore)} offshore` }
    else if (s.base + 1e-9 >= (p.perJob || 1)) {
      const w = Math.max(0, arrival(d.boat, day, t, false) - t) / day
      c = { st: 'base', w, n: `${name}: at the base, ${fmtDays(w)} by the next sailing (≈ ${fmtDays(heliS('out', day) / day)} by helicopter)` }
    } else {
      const oo = (openOrders(d.orders).get(id) ?? []).slice().sort((a, b) => a.eta - b.eta)[0]
      c = oo ? { st: 'onOrder', w: Math.max(0, oo.eta - t) / day, n: `${name}: ${STAGE_SHORT[oo.stage]} ${oo.id}, ETA ${fmtEta(oo.eta)}` } : { st: 'none', w: p.leadDays + L.boatEvery / 2 + L.boatSail, n: `${name}: none in stock or on order (standard lead ${p.leadDays} d)` }
    }
    if (!best || c.w > best.w || (c.w === best.w && rank[c.st] > rank[best.st])) best = c
  }
  if (!best) return { status: 'notStocked', partIds: ids, waitDays: 0, note: `no stock record for ${tag}` }
  return { status: best.st, partIds: ids, waitDays: best.w, note: worstCase ? `worst case over failure modes: ${best.n}` : best.n }
}

/** materials status of a work order (Maintenance page badge / detail) */
export interface WoMatLine {
  partId: string
  name: string
  qty: number
  uom: string
  kitted: boolean
  issued: boolean
  po?: string
  stage?: PoStage
  eta?: number
  where: string
}
export interface WoMat {
  state: 'kitted' | 'awaiting' | 'issued'
  lines: WoMatLine[]
  /** badge text, e.g. "awaiting spares — DGS cartridge, ETA D3 04:00" */
  text: string
  eta?: number
}
const matCache = { res: null as Reservation[] | null, orders: null as PurchaseOrder[] | null, map: new Map<string, WoMat>() }
export function woMaterialsMap(d: Pick<SparesData, 'reservations' | 'orders' | 'parts'> = D()): Map<string, WoMat> {
  if (matCache.res === d.reservations && matCache.orders === d.orders) return matCache.map
  const info = shortages(d)
  const ix = indexOf(d.parts)
  const map = new Map<string, WoMat>()
  for (const r of d.reservations) {
    const p = ix.byId.get(r.partId)
    const i = !r.kitted && !r.issued ? info.get(`${r.wo}|${r.partId}`) : undefined
    const line: WoMatLine = {
      partId: r.partId,
      name: p?.short ?? p?.name ?? r.partId,
      qty: r.qty,
      uom: p?.uom ?? '',
      kitted: r.kitted,
      issued: r.issued,
      po: i?.po?.id,
      stage: i?.po?.stage,
      eta: i?.eta,
      where: r.issued ? 'issued' : r.kitted ? 'kitted (offshore store)' : i?.po ? `${STAGE_SHORT[i.po.stage]} ${i.po.id}` : 'no supply arranged',
    }
    const m = map.get(r.wo) ?? map.set(r.wo, { state: 'issued', lines: [], text: '' }).get(r.wo)!
    m.lines.push(line)
  }
  for (const m of map.values()) {
    const short = m.lines.filter((l) => !l.kitted && !l.issued)
    if (short.length) {
      m.state = 'awaiting'
      const worst = short.reduce((a, b) => ((b.eta ?? Infinity) > (a.eta ?? Infinity) ? b : a))
      m.eta = worst.eta
      m.text = `awaiting spares: ${worst.name}${worst.eta !== undefined ? `, ETA ${fmtEta(worst.eta)}` : ', no supply'}${short.length > 1 ? ` (+${short.length - 1})` : ''}`
    } else if (m.lines.every((l) => l.issued)) {
      m.state = 'issued'
      m.text = 'parts issued'
    } else {
      m.state = 'kitted'
      m.text = 'kitted'
    }
  }
  matCache.res = d.reservations
  matCache.orders = d.orders
  matCache.map = map
  return map
}

// ---------------------------------------------------------------- 12-month stock-out forecast (Monte Carlo)

export interface ForecastResult {
  partId: string
  days: number
  runs: number
  /** share of runs with demand not met from stock at least once */
  pStockout: number
  /** mean days with unmet demand (back-orders) */
  expDaysShort: number
  /** expected demand per year (failures, PM, usage) */
  demandPerYear: number
  /** on-hand (offshore + base − reserved + transfers) by week: p10 / p50 / p90 */
  fan: { week: number; p10: number; p50: number; p90: number }[]
  /** reorder point for a 95 % cycle service level over the lead time + supply-boat cycle */
  recommendedRop: number
  rop: number
  max: number
  leadDays: number
  ms: number
  note: string
}
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
function poisson(lambda: number, rnd: () => number) {
  if (lambda <= 0) return 0
  if (lambda < 0.05) return rnd() < lambda ? 1 : 0
  const l = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rnd()
  } while (p > l && k < 200)
  return k - 1
}
function poissonQuantile(lambda: number, q: number) {
  let k = 0
  let p = Math.exp(-lambda)
  let c = p
  while (c < q && k < 1000) {
    k++
    p *= lambda / k
    c += p
  }
  return k
}

/** Monte Carlo of the part's demand over `days` against stock, pipeline and the min/max policy (pure; seeded per part) */
export function forecast(partId: string, opts: { days?: number; runs?: number } = {}): ForecastResult | null {
  const t0 = performance.now()
  const d = D()
  const part = indexOf(d.parts).byId.get(partId)
  const s = d.stock[partId]
  if (!part || !s) return null
  const days = Math.max(7, Math.round(opts.days ?? 365))
  const runs = Math.max(20, Math.round(opts.runs ?? 400))
  const t = now()
  const day = daySeconds(d.mode)
  const p = plant()
  const sim = S()
  // ---- demand model
  const fits = new Set(part.fits)
  const machines = p ? machineTags(p).filter((m) => fits.has(m.tag)) : []
  const pm = useMaint.getState().pm
  let failPerDay = 0
  const pmEvents: { first: number; every: number }[] = []
  for (const m of machines) {
    const cd = A.CLASS_DATA[m.cls]
    const st = sim.status?.[m.tag] ?? runOf(m.tag)
    const runFrac = st === 'running' || st === 'starting' ? 1 : 0.15
    const modes = cd.failures.filter((f) => part.usedFor.includes(f)).length
    if (modes) failPerDay += ((24 * runFrac) / cd.mtbfH) * (modes / cd.failures.length) * (part.perJob || 1)
    const item = pm[m.tag]
    if (part.usedFor.includes('PM') && item && runFrac > 0) {
      const every = item.intervalH / 24 / runFrac
      pmEvents.push({ first: Math.max(0, (1 - item.frac) * every), every })
    }
  }
  if (part.ratePerYear) failPerDay += (part.ratePerYear * part.fits.length) / 365
  const f = sim.result?.f
  const k = part.driver === 'oil' ? (f?.oil ?? 1) : part.driver === 'gas' ? (f?.gas ?? 1) : part.driver === 'water' ? (f?.water ?? 1) : 1
  const usage = (part.usagePerDay ?? 0) * Math.max(0, Math.min(2, k))
  const pmPerDay = pmEvents.reduce((a, e) => a + (e.every > 0 ? 1 / e.every : 0), 0) * (part.perJob || 1)
  const demandPerYear = (failPerDay + pmPerDay + usage) * 365
  // ---- supply: stock and the pipeline
  const pipe: { day: number; qty: number }[] = []
  let transfers = 0
  for (const o of openOrders(d.orders).get(partId) ?? []) {
    if (o.mode === 'transfer') transfers += o.qty
    else pipe.push({ day: Math.max(0, (o.eta - t) / day), qty: o.qty })
  }
  const start = s.offshore + s.base - s.reserved + transfers
  const replenish = part.leadDays + L.boatEvery / 2 + L.boatSail
  // ---- simulate
  const rnd = mulberry32(hash(partId))
  const weeks = Math.floor(days / 7)
  const samples: Float64Array[] = Array.from({ length: weeks + 1 }, () => new Float64Array(runs))
  let outRuns = 0
  let shortDays = 0
  for (let r = 0; r < runs; r++) {
    let onHand = start
    const arrivals = pipe.map((x) => ({ ...x }))
    let onOrder = arrivals.reduce((a, x) => a + x.qty, 0)
    const pmNext = pmEvents.map((e) => e.first)
    let out = false
    samples[0][r] = onHand
    for (let dd = 0; dd < days; dd++) {
      for (const a of arrivals)
        if (a.qty && a.day <= dd + 1) {
          onHand += a.qty
          onOrder -= a.qty
          a.qty = 0
        }
      let dem = poisson(failPerDay, rnd)
      for (let i = 0; i < pmNext.length; i++)
        if (pmNext[i] <= dd + 1) {
          dem += part.perJob || 1
          pmNext[i] += pmEvents[i].every
        }
      if (usage) dem += Math.max(0, usage * (1 + 0.2 * (rnd() + rnd() + rnd() - 1.5)))
      onHand -= dem
      if (onHand < -1e-9) {
        out = true
        shortDays++
      }
      // min/max policy (ROP 0 = planner-managed: re-order one when the shelf is empty)
      const pos = onHand + onOrder
      if ((part.rop > 0 && pos <= part.rop) || (part.rop <= 0 && pos < 0.5 && dem > 0)) {
        const q = Math.max(1, Math.ceil(Math.max(part.max, 1) - pos))
        arrivals.push({ day: dd + replenish, qty: q })
        onOrder += q
      }
      if ((dd + 1) % 7 === 0 && (dd + 1) / 7 <= weeks) samples[(dd + 1) / 7][r] = onHand
    }
    if (out) outRuns++
  }
  const fan = samples.map((arr, w) => {
    const v = Array.from(arr).sort((a, b) => a - b)
    const q = (x: number) => v[Math.min(v.length - 1, Math.max(0, Math.floor(x * (v.length - 1))))]
    return { week: w, p10: q(0.1), p50: q(0.5), p90: q(0.9) }
  })
  const lamL = (failPerDay + pmPerDay) * replenish
  const recommendedRop = usage ? Math.ceil(usage * replenish + 1.645 * usage * 0.2 * Math.sqrt(replenish) + lamL) : poissonQuantile(lamL, 0.95)
  const ms = performance.now() - t0
  return {
    partId,
    days,
    runs,
    pStockout: outRuns / runs,
    expDaysShort: shortDays / runs,
    demandPerYear,
    fan,
    recommendedRop,
    rop: part.rop,
    max: part.max,
    leadDays: part.leadDays,
    ms,
    note: `${machines.length ? `${machines.length} machine(s), MTBF × share of failure modes` : 'no monitored machines'}${pmEvents.length ? `, PM every ${Math.round(pmEvents[0].every)} d` : ''}${usage ? `, usage ${usage.toFixed(2)} ${part.uom}/d` : ''}${part.ratePerYear ? `, ${part.ratePerYear}/item/yr × ${part.fits.length}` : ''}; replenishment ${fmtDays(replenish)} (lead + boat)`,
  }
}

// ================================================================= registration (idempotent by id)

registerMaterialsHook({
  onRaise: (w) => withTx((x) => reserveFor(x, w)),
  gate,
  onComplete: (w) => withTx((x) => issueFor(x, w.id, 'job complete')),
  onCancel: (w) => withTx((x) => releaseFor(x, w.id, 'WO cancelled')),
})
const plugin: SimPlugin = { id: 'spares', step: (dt) => step(dt), reset }
try {
  ensureInit()
} catch {
  /* plant not loaded yet — the first step initialises */
}
if (typeof simMod.registerSimPlugin === 'function') simMod.registerSimPlugin(plugin)
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window as unknown as Record<string, unknown>, { __spares: useSpares, __sparesApi: sparesApi })
