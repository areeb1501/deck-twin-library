/**
 * Spares & supply console page (plan 13 A): inventory, MRP, purchase orders, the supply vessel and the
 * helicopter, work orders waiting for materials, stock movements and a 12-month stock-out forecast.
 * SIMULATED data — logic and store: sim/spares.ts, catalogue: sim/sparesCatalog.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import { CRITICALITY_LABEL, PO_STAGE_LABEL, daySeconds, type Criticality, type LogisticsLeg, type PartCategory, type PoMode, type PoStage, type PurchaseOrder, type SparePart, type StockMove } from '../../sim/assetTypes'
import { WO_STATUS_LABEL, impactBoeD, useMaint } from '../../sim/maintenance'
import {
  HELI_NAME,
  LOGISTICS,
  STAGE_SHORT,
  VESSEL_NAME,
  ensureSpares,
  fmtDays,
  fmtEta,
  forecast,
  isOpenPo,
  previewExpedite,
  previewOrder,
  sparesApi,
  useSpares,
  woMaterialsMap,
  type ForecastResult,
  type WoMatLine,
} from '../../sim/spares'
import { fmtClock } from '../../sim/types'
import { Box, Kpi, Msg, RunPill, TagLink } from './common'
import { fmt, runOf, sim, useS } from './simApi'
import './spares.css'

type Tab = 'inv' | 'orders' | 'wam' | 'moves'
const say = (r: string | null, ok: string) => r ?? `✓ ${ok}`
const CATS: PartCategory[] = ['rotating', 'electrical', 'instrument', 'static', 'consumable', 'chemical']
const money = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)} M` : Math.abs(v) >= 1e4 ? `$${Math.round(v / 1e3)} k` : `$${Math.round(v).toLocaleString('en-US')}`)
const qty = (q: number) => (Math.abs(q - Math.round(q)) < 1e-6 ? String(Math.round(q)) : q.toFixed(1))

// ------------------------------------------------------------------ per-part status (pure, memoised by the caller)

type PartState = 'short' | 'out' | 'low' | 'approve' | 'rop' | 'ropOrdered' | 'ok'
interface Row {
  p: SparePart
  offshore: number
  base: number
  reserved: number
  onOrder: number
  transfers: number
  position: number
  cover?: number
  state: PartState
  label: string
  action: boolean
}
const STATE_RANK: Record<PartState, number> = { short: 0, out: 1, low: 2, approve: 3, rop: 4, ropOrdered: 5, ok: 6 }
function rowsOf(parts: SparePart[], stock: Record<string, { offshore: number; base: number; reserved: number }>, orders: PurchaseOrder[], shortParts: Set<string>): Row[] {
  const open = new Map<string, PurchaseOrder[]>()
  for (const o of orders) if (isOpenPo(o)) (open.get(o.partId) ?? open.set(o.partId, []).get(o.partId)!).push(o)
  return parts.map((p) => {
    const s = stock[p.id] ?? { offshore: 0, base: 0, reserved: 0 }
    const os = open.get(p.id) ?? []
    const onOrder = os.filter((o) => o.mode !== 'transfer').reduce((a, o) => a + o.qty, 0)
    const transfers = os.filter((o) => o.mode === 'transfer').reduce((a, o) => a + o.qty, 0)
    const position = s.offshore + s.base + onOrder + transfers - s.reserved
    const cover = p.usagePerDay ? s.offshore / p.usagePerDay : undefined
    const net = s.offshore + s.base - s.reserved
    let state: PartState = 'ok'
    let label = ''
    if (shortParts.has(p.id)) [state, label] = ['short', 'short for a work order']
    else if (p.usagePerDay && s.offshore <= 0.01) [state, label] = ['out', 'stock-out offshore']
    else if (cover !== undefined && cover < 3) [state, label] = ['low', `low: ${fmtDays(cover)} cover offshore`]
    else if (os.some((o) => o.stage === 'requisition')) [state, label] = ['approve', 'requisition to approve']
    else if (p.rop > 0 && net <= p.rop && !onOrder) [state, label] = ['rop', 'below reorder point']
    else if (p.rop > 0 && net <= p.rop) [state, label] = ['ropOrdered', 'below ROP · on order']
    return { p, offshore: s.offshore, base: s.base, reserved: s.reserved, onOrder, transfers, position, cover, state, label, action: STATE_RANK[state] <= STATE_RANK.rop }
  })
}

// ------------------------------------------------------------------ page

export function SparesPage() {
  useEffect(() => {
    ensureSpares()
  }, [])
  const parts = useSpares((s) => s.parts)
  const stock = useSpares((s) => s.stock)
  const orders = useSpares((s) => s.orders)
  const res = useSpares((s) => s.reservations)
  const kpis = useSpares((s) => s.kpis)
  const mode = useSpares((s) => s.mode)
  const autoMrp = useSpares((s) => s.autoMrp)
  const limit = useSpares((s) => s.approvalLimit)
  const [tab, setTab] = useState<Tab>('inv')
  const [sel, setSel] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const shortParts = useMemo(() => new Set(res.filter((r) => !r.issued && !r.kitted).map((r) => r.partId)), [res])
  const rows = useMemo(() => rowsOf(parts, stock, orders, shortParts), [parts, stock, orders, shortParts])
  const mats = useMemo(() => woMaterialsMap({ reservations: res, orders, parts }), [res, orders, parts])
  const waitingN = useMemo(() => [...mats.values()].filter((m) => m.state === 'awaiting').length, [mats])
  const openN = useMemo(() => orders.filter(isOpenPo).length, [orders])
  const reqN = useMemo(() => orders.filter((o) => o.stage === 'requisition').length, [orders])
  const actionN = useMemo(() => rows.filter((r) => r.action).length, [rows])
  if (!parts.length) return <div className="h-placeholder">Loading the spares catalogue.</div>
  const pick = (id: string) => setSel(id)
  return (
    <div className="sp-page" data-spares>
      <div className="h-grid" style={{ minWidth: 0 }}>
        <div className="sp-head">
          <div>
            <h2>Spares &amp; logistics</h2>
          </div>
          <span className="grow" />
          <div className="sp-ctl">
            <span className="dim">Logistics clock</span>
            <div className="seg2">
              <button className={mode === 'demo' ? 'on' : ''} onClick={() => setMsg(say(sparesApi.setMode('demo'), 'accelerated clock: 1 logistics day = 15 min'))} data-act="mode-demo" title={`1 logistics day = ${daySeconds('demo') / 60} min of plant time`}>
                Accelerated
              </button>
              <button className={mode === 'real' ? 'on' : ''} onClick={() => setMsg(say(sparesApi.setMode('real'), 'real-time logistics clock'))} data-act="mode-real" title="1 logistics day = 24 hours of plant time">
                Real time
              </button>
            </div>
          </div>
          <label className="sp-ctl" title="Min/max replenishment: a requisition at the reorder point, up to the max">
            <input type="checkbox" checked={autoMrp} onChange={(e) => setMsg(say(sparesApi.setAutoMrp(e.target.checked), `auto MRP ${e.target.checked ? 'on' : 'off'}`))} data-f="autoMrp" /> Auto MRP
          </label>
          <label className="sp-ctl" title="Requisitions above this value wait for approval">
            <span className="dim">Approval limit</span>
            <select value={limit} onChange={(e) => setMsg(say(sparesApi.setApprovalLimit(Number(e.target.value)), 'approval limit changed'))}>
              {[25000, 50000, 100000, 250000].map((v) => (
                <option key={v} value={v}>
                  {money(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Msg text={msg} />
        <div className="h-kpis">
          <Kpi label="Inventory value" value={money(kpis.inventoryValue)} title="Offshore store + onshore base + transfers in transit" />
          <Kpi label="Open purchase orders" value={money(kpis.openPoValue)} unit={`${openN} open`} />
          <Kpi label="Requisitions to approve" value={String(reqN)} abn={reqN > 0} title={`Over the ${money(limit)} approval limit`} />
          <Kpi label="Below reorder point" value={String(kpis.belowRop)} abn={rows.some((r) => r.state === 'rop')} title="On-hand (offshore + base − reserved) at or below the ROP" />
          <Kpi label="Stock-outs" value={String(kpis.stockouts)} bad={kpis.stockouts > 0} title="Short for a work order, or a consumable empty offshore" />
          <Kpi label="WOs awaiting materials" value={String(kpis.wam)} bad={kpis.wam > 0} />
          <Kpi label="Deferred awaiting spares" value={fmt(kpis.wamBoe)} unit="boe" abn={kpis.wamBoe > 0} title="Production deferred while a machine was down waiting for parts (session)" />
          <Kpi label="Expedite + freight" value={money(kpis.premiums + kpis.freight)} title={`Premiums ${money(kpis.premiums)} · freight ${money(kpis.freight)} (session)`} />
          <Kpi label="First-pass fill rate" value={fmt(kpis.fillRate)} unit="%" abn={kpis.fillRate < 90} title="Work-order reservations fully kitted from the offshore store when raised" />
        </div>
        <Logistics mode={mode} />
        <div className="h-filters sp-tabs">
          <div className="seg2">
            {(
              [
                ['inv', `Inventory (${parts.length})`, actionN],
                ['orders', `Orders (${openN} open)`, reqN],
                ['wam', 'Awaiting materials', waitingN],
                ['moves', 'Stock movements', 0],
              ] as [Tab, string, number][]
            ).map(([k, l, n]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-stab={k}>
                {l}
                {n > 0 && <span className={`sp-badge ${k === 'wam' ? 'bad' : ''}`}>{n}</span>}
              </button>
            ))}
          </div>
        </div>
        {tab === 'inv' && <Inventory rows={rows} sel={sel} pick={pick} />}
        {tab === 'orders' && <Orders orders={orders} parts={parts} pick={pick} say={setMsg} />}
        {tab === 'wam' && <Waiting mats={mats} pick={pick} say={setMsg} />}
        {tab === 'moves' && <Moves pick={pick} />}
      </div>
      <PartDetail key={sel ?? '-'} id={sel} close={() => setSel(null)} />
    </div>
  )
}

// ------------------------------------------------------------------ logistics strip

const BOAT_STEPS: [LogisticsLeg['state'], string][] = [
  ['atBase', 'At base'],
  ['loading', 'Loading'],
  ['sailing', 'Sailing'],
  ['alongside', 'Alongside'],
  ['returning', 'Returning'],
]
const HELI_STEPS: [LogisticsLeg['state'], string][] = [
  ['idle', 'At base'],
  ['inbound', 'Inbound'],
  ['landed', 'On helideck'],
  ['outbound', 'Returning'],
]
function Logistics({ mode }: { mode: 'demo' | 'real' }) {
  const boat = useSpares((s) => s.boat)
  const heli = useSpares((s) => s.heli)
  const orders = useSpares((s) => s.orders)
  const t = useS((s) => s.t) ?? 0
  const knobs = useS((s) => s.knobs)
  const day = daySeconds(mode)
  const hs = knobs?.seaState ?? 1.5
  const wind = knobs?.wind?.speed ?? 7
  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const heliQueue = useMemo(() => orders.filter((o) => o.stage === 'atBase' && o.heli), [orders])
  const boatQueue = useMemo(() => orders.filter((o) => o.stage === 'atBase' && !o.heli), [orders])
  const parts = useSpares((s) => s.parts)
  const pname = useMemo(() => new Map(parts.map((p) => [p.id, p.short ?? p.name])), [parts])
  const cargoText = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean).map((o) => `${o!.id} ${qty(o!.qty)}× ${pname.get(o!.partId) ?? o!.partId}`)
  const hold = boat.state === 'weatherHold'
  const nextIn = Math.max(0, boat.next - t) / day
  const grounded = !!heli.note && heli.state === 'idle'
  return (
    <div className="sp-log" data-logistics>
      <Box
        className={hold ? 'sp-hold' : ''}
        title={`${VESSEL_NAME}: supply vessel`}
        right={<span className={`sp-leg ${boat.state}`}>{hold ? 'weather hold' : BOAT_STEPS.find((s) => s[0] === boat.state)?.[1] ?? boat.state}</span>}
      >
        <div className="sp-steps">
          {BOAT_STEPS.map(([k, l]) => (
            <span key={k} className={boat.state === k || (hold && k === 'alongside') ? `on ${hold ? 'hold' : ''}` : ''}>
              {l}
            </span>
          ))}
        </div>
        <div className="bar sp-bar">
          <i style={{ width: `${Math.round(boat.progress * 100)}%` }} />
        </div>
        <div className="kv2 sp-kv">
          <span>Next sailing</span>
          <span>
            {fmtEta(boat.next)} · in {fmtDays(nextIn)}
          </span>
          <span>Cycle</span>
          <span>
            every {LOGISTICS.boatEvery} d · {fmtDays(LOGISTICS.boatSail)} each way · {fmtDays(LOGISTICS.boatAlongside)} alongside
          </span>
          <span>Sea state</span>
          <span className={hs > LOGISTICS.hsLimit ? 'sp-abn' : ''}>
            Hs {hs.toFixed(1)} m (offload limit {LOGISTICS.hsLimit.toFixed(1)} m)
          </span>
          <span>{boat.cargo.length ? 'On board' : 'Booked for next sailing'}</span>
          <span className="wrap">{(boat.cargo.length ? cargoText(boat.cargo) : boatQueue.map((o) => `${o.id} ${qty(o.qty)}× ${pname.get(o.partId) ?? o.partId}`)).join(' · ') || '-'}</span>
        </div>
        {hold && <div className="h-msg">{boat.note ?? 'Waiting on weather'}</div>}
      </Box>
      <Box className={grounded ? 'sp-hold' : ''} title={`Helicopter: ${HELI_NAME}`} right={<span className={`sp-leg ${heli.state}`}>{grounded ? 'grounded' : HELI_STEPS.find((s) => s[0] === heli.state)?.[1] ?? heli.state}</span>}>
        <div className="sp-steps">
          {HELI_STEPS.map(([k, l]) => (
            <span key={k} className={heli.state === k ? 'on' : ''}>
              {l}
            </span>
          ))}
        </div>
        <div className="bar sp-bar">
          <i style={{ width: `${Math.round(heli.progress * 100)}%` }} />
        </div>
        <div className="kv2 sp-kv">
          <span>On demand</span>
          <span>
            ≤ {LOGISTICS.heliKg.toLocaleString('en-US')} kg a lift · ~2 h round trip · {money(LOGISTICS.heliUsd)} a flight
          </span>
          <span>Wind</span>
          <span className={wind > LOGISTICS.heliWind ? 'sp-abn' : ''}>
            {wind.toFixed(0)} m/s (grounded above {LOGISTICS.heliWind} m/s)
          </span>
          <span>{heli.cargo.length ? 'On board' : 'Waiting to fly'}</span>
          <span className="wrap">{(heli.cargo.length ? cargoText(heli.cargo) : heliQueue.map((o) => `${o.id} ${qty(o.qty)}× ${pname.get(o.partId) ?? o.partId}`)).join(' · ') || '-'}</span>
        </div>
        {grounded && <div className="h-msg">{heli.note}</div>}
      </Box>
    </div>
  )
}

// ------------------------------------------------------------------ inventory

function CritChip({ c }: { c: Criticality }) {
  return (
    <span className={`sp-crit c${c}`} title={CRITICALITY_LABEL[c]}>
      {c}
    </span>
  )
}

function Inventory({ rows, sel, pick }: { rows: Row[]; sel: string | null; pick: (id: string) => void }) {
  const [crit, setCrit] = useState<Criticality | 'all'>('all')
  const [cat, setCat] = useState<PartCategory | 'all'>('all')
  const [act, setAct] = useState(false)
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return rows
      .filter((r) => crit === 'all' || r.p.criticality === crit)
      .filter((r) => cat === 'all' || r.p.category === cat)
      .filter((r) => !act || r.action)
      .filter((r) => !ql || `${r.p.id} ${r.p.name} ${r.p.short ?? ''} ${r.p.vendor} ${r.p.fits.slice(0, 40).join(' ')}`.toLowerCase().includes(ql))
      .sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.p.criticality.localeCompare(b.p.criticality) || a.p.id.localeCompare(b.p.id))
  }, [rows, crit, cat, act, q])
  return (
    <Box title={`Inventory (${list.length})`}>
      <div className="h-filters">
        <div className="seg2">
          {(['all', 'A', 'B', 'C'] as const).map((k) => (
            <button key={k} className={crit === k ? 'on' : ''} onClick={() => setCrit(k)} title={k === 'all' ? 'All criticalities' : CRITICALITY_LABEL[k]}>
              {k === 'all' ? 'All' : k}
            </button>
          ))}
        </div>
        <label>
          Category
          <select value={cat} onChange={(e) => setCat(e.target.value as PartCategory | 'all')}>
            <option value="all">All</option>
            {CATS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={act} onChange={(e) => setAct(e.target.checked)} data-f="needsAction" /> needs action
        </label>
        <input type="text" placeholder="Search material / tag / vendor" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="h-tbl sp-tbl" data-tbl="inventory">
        <thead>
          <tr>
            <th>Material</th>
            <th>Description</th>
            <th title="Criticality">Crit</th>
            <th style={{ textAlign: 'right' }}>Offshore</th>
            <th style={{ textAlign: 'right' }}>Base</th>
            <th style={{ textAlign: 'right' }} title="Reserved for open work orders">
              Rsv
            </th>
            <th style={{ textAlign: 'right' }} title="Open vendor orders + transfers in transit">
              Inbound
            </th>
            <th style={{ textAlign: 'right' }} title="Reorder point / max (ROP 0 = insurance spare, planner-managed)">
              ROP / max
            </th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Unit</th>
            <th style={{ textAlign: 'right' }} title="Standard / expedited lead time, real days">
              Lead
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.p.id} className={`click ${sel === r.p.id ? 'sel' : ''} st-${r.state}`} onClick={() => pick(r.p.id)} data-part={r.p.id}>
              <td className="mono">{r.p.id}</td>
              <td className="wrap">
                {r.p.name} <span className="faint">· {r.p.category}</span>
              </td>
              <td>
                <CritChip c={r.p.criticality} />
              </td>
              <td className={`num ${r.offshore <= 0.01 && (r.p.criticality === 'A' || r.p.usagePerDay) ? 'sp-bad' : ''}`}>{qty(r.offshore)}</td>
              <td className="num">{qty(r.base)}</td>
              <td className="num">{r.reserved ? qty(r.reserved) : ''}</td>
              <td className="num">{r.onOrder + r.transfers ? qty(r.onOrder + r.transfers) : ''}</td>
              <td className="num dim">{r.p.rop > 0 ? `${r.p.rop} / ${r.p.max}` : `: / ${r.p.max}`}</td>
              <td>{r.label && <span className={`sp-st ${r.state}`}>{r.label}</span>}</td>
              <td className="num">{money(r.p.unitCost)}</td>
              <td className="num dim">
                {r.p.leadDays} / {r.p.expediteDays} d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  )
}

// ------------------------------------------------------------------ orders pipeline

const FLOW: PoStage[] = ['requisition', 'ordered', 'inTransit', 'atBase', 'onBoat', 'received']
const FLOW_LABEL: Partial<Record<PoStage, string>> = { requisition: 'Req', ordered: 'Vendor', inTransit: 'Shipping', atBase: 'Base', onBoat: 'Boat', onHeli: 'Heli', received: 'Offshore' }
function StageBar({ po }: { po: PurchaseOrder }) {
  const flow = (po.mode === 'transfer' ? FLOW.slice(3) : FLOW).map((s) => (s === 'onBoat' && po.heli ? 'onHeli' : s))
  const idx = flow.indexOf(po.stage)
  return (
    <span className={`sp-stages ${po.stage}`} title={PO_STAGE_LABEL[po.stage]}>
      {flow.map((s, i) => (
        <i key={s} className={po.stage === 'cancelled' ? 'x' : i < idx ? 'done' : i === idx ? 'on' : ''}>
          {FLOW_LABEL[s]}
        </i>
      ))}
    </span>
  )
}

function PoActions({ po, say: setMsg }: { po: PurchaseOrder; say: (m: string | null) => void }) {
  if (!isOpenPo(po)) return null
  const vendorOpen = po.stage === 'requisition' || po.stage === 'ordered' || po.stage === 'inTransit'
  const pe = vendorOpen && po.mode === 'standard' ? previewExpedite(po.id, false) : null
  const ph = (vendorOpen && !po.heli) || (po.stage === 'atBase' && !po.heli) ? previewExpedite(po.id, true) : null
  return (
    <>
      {po.stage === 'requisition' && (
        <button className="warn" onClick={() => setMsg(say(sparesApi.approve(po.id), `${po.id} approved: PO placed`))} data-act="approve">
          Approve
        </button>
      )}
      {pe && !pe.why && (
        <button onClick={() => setMsg(say(sparesApi.expedite(po.id), `${po.id} expedited`))} title={`Premium ${money(pe.premium)} · ETA ${fmtEta(pe.eta)} (saves ${fmtDays(pe.savedDays)})`} data-act="expedite">
          Expedite
        </button>
      )}
      {ph && !ph.why && (
        <button className="warn" onClick={() => setMsg(say(sparesApi.expedite(po.id, { heli: true }), `${po.id} ${po.stage === 'atBase' ? 'flies out by helicopter' : 'expedited, last leg by helicopter'}`))} title={`${ph.premium ? `Premium ${money(ph.premium)} · ` : ''}helicopter ${money(ph.freight)} · ETA ${fmtEta(ph.eta)} (saves ${fmtDays(ph.savedDays)})`} data-act="expedite-heli">
          {po.stage === 'atBase' ? 'Fly now' : po.mode === 'standard' ? 'Expedite + heli' : '+ heli'}
        </button>
      )}
      {(vendorOpen || (po.stage === 'atBase' && po.mode === 'transfer')) && (
        <button className="danger" onClick={() => setMsg(say(sparesApi.cancel(po.id), `${po.id} cancelled`))} data-act="cancel-po">
          Cancel
        </button>
      )}
    </>
  )
}

function Orders({ orders, parts, pick, say: setMsg }: { orders: PurchaseOrder[]; parts: SparePart[]; pick: (id: string) => void; say: (m: string | null) => void }) {
  const [all, setAll] = useState(false)
  const mode = useSpares((s) => s.mode)
  const t = useS((s) => s.t) ?? 0
  const pmap = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  const list = useMemo(() => orders.filter((o) => all || isOpenPo(o)).sort((a, b) => Number(isOpenPo(b)) - Number(isOpenPo(a)) || (a.stage === 'requisition' ? -1 : 0) - (b.stage === 'requisition' ? -1 : 0) || a.eta - b.eta), [orders, all])
  const day = daySeconds(mode)
  return (
    <Box
      title={`Purchase orders & transfers (${list.length})`}
      right={
        <label className="h-row" style={{ gap: 5, textTransform: 'none', letterSpacing: 0 }}>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> show closed
        </label>
      }
    >
      {list.length ? (
        <table className="h-tbl sp-tbl" data-tbl="orders">
          <thead>
            <tr>
              <th>PO</th>
              <th>Material</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th>Mode</th>
              <th>Stage</th>
              <th>WO</th>
              <th>ETA offshore</th>
              <th style={{ textAlign: 'right' }}>Value</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const p = pmap.get(o.partId)
              const left = Math.max(0, o.eta - t) / day
              return (
                <tr key={o.id} className={`click ${isOpenPo(o) ? '' : 'closed'} ${o.stage === 'requisition' ? 'st-approve' : ''}`} onClick={() => pick(o.partId)} data-po={o.id}>
                  <td className="mono">{o.id}</td>
                  <td className="wrap">{p?.short ?? p?.name ?? o.partId}</td>
                  <td className="num">
                    {qty(o.qty)} <small className="dim">{p?.uom}</small>
                  </td>
                  <td className={o.mode === 'standard' || o.mode === 'transfer' ? 'dim' : ''}>
                    {o.mode}
                    {o.heli ? ' · heli' : ''}
                  </td>
                  <td>
                    <StageBar po={o} />
                  </td>
                  <td className="mono">{o.wo ?? ''}</td>
                  <td className="mono">{isOpenPo(o) ? (
                    <>
                      {fmtEta(o.eta)} <small className="dim">≈ {fmtDays(left)}</small>
                    </>
                  ) : (
                    <span className="dim">{o.stage === 'received' ? `in ${fmtEta(o.eta)}` : '-'}</span>
                  )}</td>
                  <td className="num">{money(o.material + o.premium + o.freight)}</td>
                  <td className="act" onClick={(e) => e.stopPropagation()}>
                    <PoActions po={o} say={setMsg} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <div className="h-empty">No open orders.</div>
      )}
      <p className="h-note">Value = material + expedite premium + freight.</p>
    </Box>
  )
}

// ------------------------------------------------------------------ work orders awaiting materials

function Waiting({ mats, pick, say: setMsg }: { mats: ReturnType<typeof woMaterialsMap>; pick: (id: string) => void; say: (m: string | null) => void }) {
  const wos = useMaint((s) => s.wos)
  const orders = useSpares((s) => s.orders)
  const stock = useSpares((s) => s.stock)
  const mode = useSpares((s) => s.mode)
  const t = useS((s) => s.t) ?? 0
  useS((s) => s.status)
  const s = sim()
  const day = daySeconds(mode)
  const byPo = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const rows = useMemo(() => {
    const out: { w: (typeof wos)[number]; line: WoMatLine }[] = []
    for (const w of wos) {
      const m = mats.get(w.id)
      if (!m || m.state !== 'awaiting') continue
      for (const l of m.lines) if (!l.kitted && !l.issued) out.push({ w, line: l })
    }
    return out.sort((a, b) => a.w.priority - b.w.priority || (b.line.eta ?? Infinity) - (a.line.eta ?? Infinity))
  }, [wos, mats])
  return (
    <Box title={`Work orders awaiting materials (${rows.length})`}>
      <p className="h-note">Corrective jobs start once their parts are kitted offshore. Deferred production while waiting is counted here.</p>
      {rows.length ? (
        <table className="h-tbl sp-tbl" data-tbl="wam">
          <thead>
            <tr>
              <th>WO</th>
              <th>Tag</th>
              <th>Machine</th>
              <th>WO status</th>
              <th>Part</th>
              <th>Supply</th>
              <th>ETA offshore</th>
              <th style={{ textAlign: 'right' }} title="Production at stake while the machine is down (planner's estimate)">
                boe/d at stake
              </th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ w, line }) => {
              const po = line.po ? byPo.get(line.po) : undefined
              const st = runOf(s, w.tag)
              const down = st !== 'running' && st !== 'starting'
              const base = stock[line.partId]?.base ?? 0
              const ph = po && !po.heli && (po.stage === 'requisition' || po.stage === 'ordered' || po.stage === 'inTransit' || po.stage === 'atBase') ? previewExpedite(po.id, true) : null
              return (
                <tr key={`${w.id}|${line.partId}`} className="click st-short" onClick={() => pick(line.partId)} data-wam={w.id}>
                  <td className="mono">
                    {w.id} <span className={`mt-prio p${w.priority}`}>P{w.priority}</span>
                  </td>
                  <td>
                    <TagLink tag={w.tag} />
                  </td>
                  <td>
                    <RunPill st={st} />
                  </td>
                  <td className="dim">{WO_STATUS_LABEL[w.status]}</td>
                  <td>
                    {qty(line.qty)} × {line.name}
                  </td>
                  <td className="wrap">{po ? `${STAGE_SHORT[po.stage]} ${po.id} (${po.mode}${po.heli ? ' + heli' : ''})` : <span className="sp-bad">no supply arranged</span>}</td>
                  <td className="mono">{line.eta !== undefined ? <>
                    {fmtEta(line.eta)} <small className="dim">≈ {fmtDays(Math.max(0, line.eta - t) / day)}</small>
                  </> : '-'}</td>
                  <td className={`num ${down ? 'sp-abn' : 'dim'}`}>{fmt(impactBoeD(w.tag))}</td>
                  <td className="act" onClick={(e) => e.stopPropagation()}>
                    {po?.stage === 'requisition' && <button className="warn" onClick={() => setMsg(say(sparesApi.approve(po.id), `${po.id} approved`))}>Approve</button>}
                    {ph && !ph.why && (
                      <button className="warn" onClick={() => setMsg(say(sparesApi.expedite(po!.id, { heli: true }), `${po!.id} expedited: helicopter for the last leg`))} title={`${ph.premium ? `Premium ${money(ph.premium)} · ` : ''}helicopter ${money(ph.freight)} · ETA ${fmtEta(ph.eta)} (saves ${fmtDays(ph.savedDays)})`} data-act="wam-expedite">
                        {po!.stage === 'atBase' ? 'Fly now' : `Expedite + heli (saves ${fmtDays(ph.savedDays)})`}
                      </button>
                    )}
                    {!po && base >= line.qty && (
                      <button onClick={() => setMsg(say(sparesApi.transfer(line.partId, line.qty, true, { wo: w.id }), `transfer by helicopter for ${w.id}`))}>Transfer by heli</button>
                    )}
                    {!po && base < line.qty && (
                      <button className="warn" onClick={() => setMsg(say(sparesApi.order(line.partId, line.qty, 'emergency', { wo: w.id }), `emergency order for ${w.id}`))}>Emergency order</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <div className="h-empty">No work order is waiting for parts.</div>
      )}
    </Box>
  )
}

// ------------------------------------------------------------------ stock movements

const KINDS: (StockMove['kind'] | 'all')[] = ['all', 'receipt', 'issue', 'transfer', 'consume', 'adjust']
function Moves({ pick }: { pick: (id: string) => void }) {
  const moves = useSpares((s) => s.moves)
  const [kind, setKind] = useState<StockMove['kind'] | 'all'>('all')
  const list = useMemo(() => moves.filter((m) => kind === 'all' || m.kind === kind).slice(0, 250), [moves, kind])
  return (
    <Box title="Stock movements">
      <div className="h-filters">
        <div className="seg2">
          {KINDS.map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <table className="h-tbl sp-tbl" data-tbl="moves">
          <thead>
            <tr>
              <th>Time</th>
              <th>Material</th>
              <th>Kind</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th>Ref</th>
              <th>Text</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m, i) => (
              <tr key={i} className={m.partId ? 'click' : ''} onClick={() => m.partId && pick(m.partId)}>
                <td className="mono dim">{fmtClock(m.t)}</td>
                <td className="mono">{m.partId}</td>
                <td className="dim">{m.kind}</td>
                <td className="num">{m.qty ? qty(m.qty) : ''}</td>
                <td className="mono dim">{m.ref ?? ''}</td>
                <td className={`wrap ${/STOCK-OUT/.test(m.text) ? 'sp-bad' : ''}`}>{m.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-empty">Nothing yet.</div>
      )}
    </Box>
  )
}

// ------------------------------------------------------------------ part detail

const MODES: [PoMode, boolean, string][] = [
  ['standard', false, 'Standard (boat)'],
  ['expedite', false, 'Expedite (boat)'],
  ['emergency', true, 'Emergency (heli)'],
  ['transfer', false, 'From base (boat)'],
  ['transfer', true, 'From base (heli)'],
]
function PartDetail({ id, close }: { id: string | null; close: () => void }) {
  const part = useSpares((s) => (id ? s.parts.find((p) => p.id === id) : undefined))
  const lvl = useSpares((s) => (id ? s.stock[id] : undefined))
  const orders = useSpares((s) => s.orders)
  const res = useSpares((s) => s.reservations)
  const mode = useSpares((s) => s.mode)
  const t = useS((s) => s.t) ?? 0
  const [n, setN] = useState(() => Math.max(1, part?.perJob || 1))
  const [msg, setMsg] = useState<string | null>(null)
  const [fc, setFc] = useState<ForecastResult | null>(null)
  const mine = useMemo(() => orders.filter((o) => o.partId === id && isOpenPo(o)), [orders, id])
  const rsv = useMemo(() => res.filter((r) => r.partId === id && !r.issued), [res, id])
  if (!part || !lvl) {
    return (
      <aside className="faceplate sp-detail">
        <div className="h-empty">Select a material.</div>
      </aside>
    )
  }
  const day = daySeconds(mode)
  const vendor = mine.filter((o) => o.mode !== 'transfer').reduce((a, o) => a + o.qty, 0)
  const transfers = mine.filter((o) => o.mode === 'transfer').reduce((a, o) => a + o.qty, 0)
  const position = lvl.offshore + lvl.base + vendor + transfers - lvl.reserved
  const kitted = rsv.filter((r) => r.kitted).reduce((a, r) => a + r.qty, 0)
  const cover = part.usagePerDay ? lvl.offshore / part.usagePerDay : undefined
  return (
    <aside className="faceplate sp-detail" data-part-detail={part.id}>
      <div className="h-row">
        <h4>{part.id}</h4>
        <CritChip c={part.criticality} />
        <span className="grow" style={{ flex: 1 }} />
        <button className="link" onClick={close}>
          close
        </button>
      </div>
      <div className="sub">{part.name}</div>
      <dl>
        <dt>Category</dt>
        <dd>
          {part.category} · {part.uom}
        </dd>
        <dt>Criticality</dt>
        <dd>{CRITICALITY_LABEL[part.criticality]}</dd>
        <dt>Unit cost</dt>
        <dd>{money(part.unitCost)}</dd>
        <dt>Vendor</dt>
        <dd style={{ whiteSpace: 'normal' }}>{part.vendor}</dd>
        <dt>Lead time</dt>
        <dd>
          {part.leadDays} d
        </dd>
        <dt>Expedited</dt>
        <dd>
          {part.expediteDays} d · +{Math.round(part.expeditePremium * 100)} %
        </dd>
        <dt>Weight</dt>
        <dd>
          {part.kg} kg / {part.uom}
          {part.kg > LOGISTICS.heliKg ? ' (boat only)' : ''}
        </dd>
        {part.usagePerDay ? (
          <>
            <dt>Usage</dt>
            <dd>
              {part.usagePerDay} {part.uom}/d ({part.driver}) · <span className={cover !== undefined && cover < 3 ? 'sp-abn' : ''}>{fmtDays(cover ?? 0)} cover offshore</span>
            </dd>
          </>
        ) : null}
        <dt>Used for</dt>
        <dd style={{ whiteSpace: 'normal' }}>{part.usedFor.length ? part.usedFor.join(' · ') : 'consumption'}</dd>
      </dl>
      <div className="sp-fits">
        <span className="dim">Fits </span>
        {part.fits.slice(0, 12).map((f) => (
          <TagLink key={f} tag={f} />
        ))}
        {part.fits.length > 12 && <span className="dim"> +{part.fits.length - 12} more</span>}
      </div>
      <h5 className="mt-h5">Stock by location</h5>
      <table className="h-tbl sp-loc">
        <tbody>
          <tr>
            <td>Alpha offshore store</td>
            <td className={`num ${lvl.offshore <= 0.01 ? 'sp-bad' : ''}`}>{qty(lvl.offshore)}</td>
          </tr>
          <tr>
            <td>Onshore supply base</td>
            <td className="num">{qty(lvl.base)}</td>
          </tr>
          <tr>
            <td>Transfers in transit</td>
            <td className="num">{qty(transfers)}</td>
          </tr>
          <tr>
            <td>Reserved for WOs (kitted / short)</td>
            <td className={`num ${lvl.reserved > kitted ? 'sp-bad' : ''}`}>
              {qty(lvl.reserved)} ({qty(kitted)} / {qty(lvl.reserved - kitted)})
            </td>
          </tr>
          <tr>
            <td>On order from vendor</td>
            <td className="num">{qty(vendor)}</td>
          </tr>
          <tr>
            <td>
              MRP position <span className="dim">vs ROP {part.rop > 0 ? part.rop : ': (insurance spare)'} / max {part.max}</span>
            </td>
            <td className={`num ${part.rop > 0 && position <= part.rop ? 'sp-abn' : ''}`}>{qty(position)}</td>
          </tr>
        </tbody>
      </table>
      {rsv.length > 0 && (
        <>
          <h5 className="mt-h5">Reservations</h5>
          <div className="mt-hist">
            {rsv.map((r) => (
              <div key={r.wo} className={r.kitted ? '' : 'warn'}>
                <span className="mono">{r.wo}</span> {r.tag} · {qty(r.qty)} {part.uom} · {r.kitted ? 'kitted' : 'SHORT'}
              </div>
            ))}
          </div>
        </>
      )}
      {mine.length > 0 && (
        <>
          <h5 className="mt-h5">Open orders</h5>
          {mine.map((o) => (
            <div key={o.id} className="sp-po" data-po-detail={o.id}>
              <div className="h-row">
                <b className="mono">{o.id}</b>
                <span className="dim">
                  {qty(o.qty)} · {o.mode}
                  {o.heli ? ' + heli' : ''}
                </span>
                <span className="grow" style={{ flex: 1 }} />
                <span className="mono">
                  ETA {fmtEta(o.eta)} <small className="dim">≈ {fmtDays(Math.max(0, o.eta - t) / day)}</small>
                </span>
              </div>
              <StageBar po={o} />
              <div className="btns" style={{ marginTop: 4 }}>
                <PoActions po={o} say={setMsg} />
              </div>
            </div>
          ))}
        </>
      )}
      <h5 className="mt-h5">Order</h5>
      <div className="h-row" style={{ marginBottom: 4 }}>
        <span className="dim">Quantity</span>
        <input type="number" min={1} step={1} value={n} onChange={(e) => setN(Math.max(1, Math.round(Number(e.target.value) || 1)))} style={{ width: 70 }} data-f="qty" />
        <span className="dim">{part.uom}</span>
      </div>
      <div className="sp-modes">
        {MODES.map(([m, heli, label]) => {
          const pv = previewOrder(part.id, n, m, heli)
          return (
            <button
              key={label}
              disabled={!!pv.why}
              className={m === 'emergency' ? 'warn' : ''}
              title={pv.why ?? `${money(pv.material)} material${pv.premium ? ` + ${money(pv.premium)} premium` : ''} + ${money(pv.freight)} ${pv.heli ? 'helicopter' : 'freight'}${pv.approval ? ': needs approval' : ''}`}
              onClick={() => {
                const r = sparesApi.place(part.id, n, m, { heli })
                setMsg(r.why ?? `✓ ${r.id}: ${label.toLowerCase()}`)
              }}
              data-act={`order-${m}${heli ? '-heli' : ''}`}
            >
              <b>{label}</b>
              <small>{pv.why ? pv.why : `${money(pv.total)} · ETA ${fmtEta(pv.eta)} ≈ ${fmtDays(pv.days)}${pv.approval ? ' · approval' : ''}`}</small>
            </button>
          )
        })}
      </div>
      <Msg text={msg} />
      <h5 className="mt-h5">12-month stock-out forecast</h5>
      <div className="h-row">
        <button onClick={() => setFc(forecast(part.id, { days: 365, runs: 400 }))} data-act="forecast">
          {fc ? 'Re-run' : 'Run'} forecast (400 runs)
        </button>
        {fc && <span className="dim">{fc.ms.toFixed(0)} ms</span>}
      </div>
      {fc && <ForecastView f={fc} uom={part.uom} />}
    </aside>
  )
}

function ForecastView({ f, uom }: { f: ForecastResult; uom: string }) {
  const W = 360
  const H = 120
  const pad = { l: 28, r: 6, t: 6, b: 16 }
  const vals = f.fan.flatMap((p) => [p.p10, p.p90]).concat([f.rop, 0])
  const lo = Math.min(...vals)
  const hi = Math.max(...vals, 1)
  const x = (w: number) => pad.l + (w / Math.max(1, f.fan.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / Math.max(1e-6, hi - lo)) * (H - pad.t - pad.b)
  const band = `${f.fan.map((p) => `${x(p.week).toFixed(1)},${y(p.p90).toFixed(1)}`).join(' ')} ${[...f.fan].reverse().map((p) => `${x(p.week).toFixed(1)},${y(p.p10).toFixed(1)}`).join(' ')}`
  const mid = f.fan.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)},${y(p.p50).toFixed(1)}`).join(' ')
  const risk = f.pStockout >= 0.2 ? 'sp-bad' : f.pStockout >= 0.05 ? 'sp-abn' : ''
  return (
    <div className="sp-fc" data-forecast>
      <div className="kv2 sp-kv">
        <span>P(stock-out, 12 months)</span>
        <span className={risk}>{(f.pStockout * 100).toFixed(0)} %</span>
        <span>Expected days short</span>
        <span>{f.expDaysShort.toFixed(1)} d</span>
        <span>Expected demand</span>
        <span>
          {f.demandPerYear.toFixed(f.demandPerYear < 10 ? 2 : 0)} {uom}/yr
        </span>
        <span>ROP for 95 % service</span>
        <span className={f.recommendedRop > f.rop ? 'sp-abn' : ''}>
          {f.recommendedRop} <small className="dim">(now {f.rop > 0 ? f.rop : '-'})</small>
        </span>
      </div>
      <svg className="sp-fan" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line className="ax" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />
        {f.rop > 0 && <line className="rop" x1={pad.l} x2={W - pad.r} y1={y(f.rop)} y2={y(f.rop)} />}
        <polygon className="band" points={band} />
        <path className="mid" d={mid} />
        <text x={2} y={y(hi) + 8}>
          {qty(hi)}
        </text>
        <text x={2} y={y(0) + 3}>
          0
        </text>
        <text x={pad.l} y={H - 3}>
          now
        </text>
        <text x={W - pad.r - 40} y={H - 3}>
          12 mo
        </text>
      </svg>
      <p className="h-note">
        On-hand (offshore + base − reserved): p10–p90 band, median line{f.rop > 0 ? ', ROP dashed' : ''}. {f.note}.
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ DEV preview (until the integrator adds the console tab)

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__sparesPreview = async (on = true) => {
    const id = 'spares-preview'
    const prev = document.getElementById(id) as (HTMLElement & { _root?: { unmount: () => void } }) | null
    if (prev) {
      prev._root?.unmount()
      prev.remove()
    }
    if (!on) return
    const { createRoot } = await import('react-dom/client')
    const el = document.createElement('div') as HTMLElement & { _root?: { unmount: () => void } }
    el.id = id
    el.className = 'hmi'
    el.style.display = 'block'
    el.style.overflow = 'auto'
    el.style.padding = '12px'
    document.body.appendChild(el)
    const root = createRoot(el)
    el._root = root
    root.render(<SparesPage />)
  }
}
