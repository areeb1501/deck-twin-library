/**
 * Insights (plan 13): the twin reads its own data and says what matters, in numbers.
 *
 * A rule set over the live simulation, the finance model, condition monitoring, spares and the risk engine.
 * Each rule returns at most a few findings with the dollars or barrels at stake, the evidence and where to go
 * next. The list is ranked (decisions first, then by $/d at stake) and written to `useInsights` at ≤ 1 Hz
 * wall, with a one-paragraph headline for the shift.
 *
 *   production   binding constraint in $/d · PE falling against the session · a well dragging water
 *   value        where the deferred revenue went · lifting cost inflated by deferment
 *   asset        dollars at risk concentrated in one machine, and the lever that removes it
 *   supply       work orders waiting for parts · consumables running out before the next sailing · weather
 *   carbon       flaring / venting share of CO2e and what recovering it is worth
 *   safety       risk band high with its top driver
 *   opportunity  compressor speed headroom while gas goes to flare
 *
 * Rules are plain functions over plain data so an LLM agent can call the same reasoning as a tool later.
 * Everything rests on simulated data and an assumed price deck, and the UI says so.
 */
import { create } from 'zustand'
import { registerSimPlugin, useSim } from '../state/sim'
import { useMaint, isOpen } from './maintenance'
import { useSpares } from './spares'
import { useFinance } from './finance'
import { fmtUsd } from './assetRisk'
import { daySeconds } from './assetTypes'
import { useRisk } from '../safety/risk'
import * as A from './alpha'
import { LOSS_LABEL, type LossCategory, type SimState } from './types'

export type InsightKind = 'act' | 'watch' | 'info' | 'win'
export type InsightArea = 'production' | 'value' | 'asset' | 'supply' | 'carbon' | 'safety' | 'wells' | 'opportunity'
export const AREA_LABEL: Record<InsightArea, string> = {
  production: 'Production',
  value: 'Value',
  asset: 'Asset risk',
  supply: 'Supply chain',
  carbon: 'Carbon',
  safety: 'Safety',
  wells: 'Wells',
  opportunity: 'Opportunity',
}
export interface Insight {
  /** stable id (rule + subject) */
  id: string
  kind: InsightKind
  area: InsightArea
  /** one line, with the number */
  title: string
  /** why it matters and the evidence */
  detail: string
  /** USD per day at stake (ranking); asset exposures are spread over their horizon */
  usdD: number
  tags: string[]
  /** ranking override (safety always first); defaults to usdD */
  rank?: number
  /** where to look next: a console page and / or a plant tag */
  go?: { label: string; page?: string; tag?: string }
  /** sim time the finding was first seen */
  since: number
}
export interface InsightsState {
  list: Insight[]
  headline: string
  at: number
}
export const useInsights = create<InsightsState>(() => ({ list: [], headline: '', at: 0 }))

const KIND_RANK: Record<InsightKind, number> = { act: 0, watch: 1, win: 2, info: 3 }
const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
const pct = (v: number) => `${Math.round(v)} %`
const S = () => useSim.getState() as SimState

type Rule = (ctx: Ctx) => Omit<Insight, 'since'>[]
interface Ctx {
  s: SimState
  f: ReturnType<typeof useFinance.getState>
}

// ================================================================= rules

/** the binding constraint, priced */
const constraint: Rule = ({ s, f }) => {
  const cons = [...(s.result?.constraints ?? [])].sort((a, b) => b.boe - a.boe).slice(0, 2)
  return cons
    .filter((c) => c.boe > 200)
    .map((c, i) => {
      // priced like finance.ts: flared gas at the gas value, liquid held back at the oil price, the rest blended
      const usd = c.boe * (c.id === 'flare' ? f.unit.gasBoe : c.id === 'liquid' ? f.unit.oilBbl : f.unit.blendBoe)
      return {
        id: `constraint:${c.id}`,
        kind: usd > 150_000 ? 'act' : 'watch',
        area: 'production',
        title: `${c.text} — ${fmtUsd(usd)}/d`,
        detail: `${i === 0 ? 'The binding constraint' : 'Also binding'}: ${n0(c.boe)} boe/d held back, booked to ${LOSS_LABEL[c.loss].toLowerCase()}. At the assumed price deck that is ${fmtUsd(usd)} a day, ${fmtUsd(usd / 24)} an hour.`,
        usdD: usd,
        tags: [],
        go: { label: 'Process', page: 'process' },
      }
    })
}

/** production efficiency falling against the session */
const peTrend: Rule = ({ s }) => {
  const k = s.kpis
  if (!k || s.t < 1800) return []
  if (k.peHour < k.pe - 2)
    return [
      {
        id: 'pe:falling',
        kind: 'watch',
        area: 'production',
        title: `Production efficiency ${k.peHour.toFixed(1)} % in the last hour, against ${k.pe.toFixed(1)} % for the session`,
        detail: `The last hour is running ${(k.pe - k.peHour).toFixed(1)} points below the session average. Look at the loss breakdown to see which system is taking it.`,
        usdD: 0,
        tags: [],
        go: { label: 'Trends', page: 'trends' },
      },
    ]
  if (k.peHour >= 97 && (s.result?.efficiency ?? 0) >= 97)
    return [{ id: 'pe:high', kind: 'win', area: 'production', title: `Field at ${k.peHour.toFixed(1)} % production efficiency over the last hour`, detail: 'Every system is running at potential. No constraint is binding.', usdD: 0, tags: [] }]
  return []
}

/** where the deferred revenue went */
const deferral: Rule = ({ f }) => {
  const cats = Object.entries(f.totals.deferred).filter(([k]) => k !== 'materials') as [LossCategory, number][]
  const total = cats.reduce((a, [, v]) => a + v, 0)
  if (total < 20_000) return []
  const [top, v] = cats.sort((a, b) => b[1] - a[1])[0]
  const share = (v / total) * 100
  const mat = f.totals.deferred.materials ?? 0
  return [
    {
      id: 'deferral:top',
      kind: share > 60 ? 'watch' : 'info',
      area: 'value',
      title: `${pct(share)} of deferred revenue this session is ${LOSS_LABEL[top].toLowerCase()} — ${fmtUsd(v)}`,
      detail: `Deferred so far: ${fmtUsd(total)} across ${cats.filter(([, x]) => x > 0).length} categories.${mat > 1000 ? ` ${fmtUsd(mat)} of it was lost while machines waited for spare parts.` : ''} Fix the top category first; it is where the money is.`,
      usdD: f.deferredRate[top] ?? 0,
      tags: [],
      go: { label: 'Asset & economics', page: 'economics' },
    },
  ]
}

/** lifting cost inflated by deferment (fixed cost over fewer barrels) */
const liftingCost: Rule = ({ s, f }) => {
  const r = s.result
  if (!r || r.mpp < 1 || r.actual < 1) return []
  const opexD = f.deck.fixedOpexD + f.deck.varOpexBbl * r.oilExport
  const now = opexD / r.actual
  const atPotential = (f.deck.fixedOpexD + f.deck.varOpexBbl * r.oilPotential) / r.mpp
  if (now - atPotential < 0.4) return []
  return [
    {
      id: 'lifting:inflated',
      kind: 'info',
      area: 'value',
      title: `Lifting cost ${'$'}${now.toFixed(2)}/boe now, ${'$'}${atPotential.toFixed(2)} at full potential`,
      detail: `Fixed OPEX does not shrink when production does: every deferred barrel raises the unit cost of the rest by ${'$'}${(now - atPotential).toFixed(2)}/boe right now.`,
      usdD: 0,
      tags: [],
    },
  ]
}

/** dollars at risk concentrated in one machine, and its lever */
const assetConcentration: Rule = ({ f }) => {
  const rows = f.risks ?? []
  const total = f.atRisk ?? 0
  if (!rows.length || total < 50_000) return []
  const out: Omit<Insight, 'since'>[] = []
  const top = rows[0]
  const share = (top.exposureUsd / total) * 100
  const lv = top.lever
  const roi = lv && lv.costUsd > 0 ? lv.saveUsd / lv.costUsd : 0
  out.push({
    id: `asset:${top.tag}`,
    kind: top.stage !== 'normal' || (lv && lv.saveUsd > 100_000) ? 'act' : 'watch',
    area: 'asset',
    title: `${top.tag} carries ${pct(share)} of the ${fmtUsd(total)} at risk over ${f.riskHorizon} days`,
    detail: `${top.name}: P(failure) ${pct(top.pFail * 100)}, ${n0(top.impactBoeD)} boe/d at stake, ${top.repairDays.toFixed(1)} d repair${top.partsWaitDays > 0.05 ? ` + ${top.partsWaitDays.toFixed(1)} d waiting for parts (${top.cover.status})` : ''}.${lv && lv.kind !== 'none' && lv.saveUsd > 0 ? ` ${lv.label}: costs ${fmtUsd(lv.costUsd)}, removes ${fmtUsd(lv.saveUsd)} of exposure${roi >= 2 ? ` — ${roi >= 10 ? Math.round(roi) : roi.toFixed(1)}× return` : ''}.` : ` ${top.action}`}`,
    usdD: top.exposureUsd / Math.max(1, f.riskHorizon),
    tags: [top.tag],
    go: { label: 'Risk register', page: 'economics', tag: top.tag },
  })
  // single points of failure: production at stake with no standby
  const spof = rows.filter((x) => x.impactBoeD > 1000 && x.exposureUsd > 20_000 && x.tag !== top.tag).slice(0, 1)
  for (const x of spof)
    out.push({
      id: `asset:spof:${x.tag}`,
      kind: 'watch',
      area: 'asset',
      title: `${x.tag} has no running standby — ${n0(x.impactBoeD)} boe/d rides on it`,
      detail: `${x.name}: ${fmtUsd(x.exposureUsd)} exposure over ${f.riskHorizon} d (P ${pct(x.pFail * 100)}). ${x.action}`,
      usdD: x.exposureUsd / Math.max(1, f.riskHorizon),
      tags: [x.tag],
      go: { label: 'Show', tag: x.tag },
    })
  return out
}

/** supply chain: work orders waiting for parts, consumables cover, weather */
const supply: Rule = ({ s, f }) => {
  const sp = useSpares.getState()
  if (!sp.parts.length) return []
  const out: Omit<Insight, 'since'>[] = []
  const day = daySeconds(sp.mode)
  const t = s.t
  // work orders blocked on materials
  const waiting = sp.reservations.filter((r) => !r.kitted && !r.issued)
  const wos = [...new Set(waiting.map((r) => r.wo))]
  if (wos.length) {
    const tags = [...new Set(waiting.map((r) => r.tag))]
    const names = [...new Set(waiting.map((r) => sp.parts.find((p) => p.id === r.partId)?.name ?? r.partId))]
    out.push({
      id: 'supply:wam',
      kind: f.materialsRate > 0 ? 'act' : 'watch',
      area: 'supply',
      title: `${wos.length} work order${wos.length > 1 ? 's' : ''} waiting for parts${f.materialsRate > 0 ? ` — ${fmtUsd(f.materialsRate)}/d deferred while they wait` : ''}`,
      detail: `${tags.join(', ')} need ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}. A helicopter transfer from the base or an expedited order shortens the wait.`,
      usdD: f.materialsRate,
      tags,
      go: { label: 'Spares & supply', page: 'spares' },
    })
  }
  // consumables that run out before the next boat can bring more
  const boatIn = Math.max(0, (sp.boat.next - t) / day) + 0.5
  for (const p of sp.parts) {
    if (!p.usagePerDay) continue
    const st = sp.stock[p.id]
    if (!st) continue
    const r = s.result
    const factor = p.driver === 'oil' ? (r?.f.oil ?? 1) : p.driver === 'gas' ? (r?.f.gas ?? 1) : p.driver === 'water' ? (r?.f.water ?? 1) : 1
    const use = p.usagePerDay * Math.max(0.05, factor)
    const cover = st.offshore / use
    if (cover >= boatIn + 0.5) continue
    out.push({
      id: `supply:cover:${p.id}`,
      kind: cover < boatIn ? 'act' : 'watch',
      area: 'supply',
      title: `${p.name}: ${cover.toFixed(1)} d of cover offshore, next supply boat in ${boatIn.toFixed(1)} d`,
      detail: `${st.offshore} ${p.uom} on board, using ${use.toFixed(1)} ${p.uom}/d at today's throughput; ${st.base} ${p.uom} at the base.${cover < boatIn ? ' It runs out before the boat arrives — transfer by helicopter or cut the dose.' : ''} (Logistics days${sp.mode === 'demo' ? ', demo clock' : ''}.)`,
      usdD: 0,
      tags: [],
      go: { label: 'Spares & supply', page: 'spares' },
    })
  }
  // weather
  if (sp.boat.state === 'weatherHold') {
    const waitingCargo = sp.orders.filter((o) => o.stage === 'atBase').length
    out.push({
      id: 'supply:weather',
      kind: 'watch',
      area: 'supply',
      title: `Supply vessel on weather hold (Hs ${(s.knobs?.seaState ?? 0).toFixed(1)} m) — ${waitingCargo} order${waitingCargo === 1 ? '' : 's'} stuck at the base`,
      detail: `${sp.boat.note ?? 'Sea state is above the offload limit.'} Only the helicopter reaches the field until the weather drops; it carries ${'≤'} 1.5 t a lift.`,
      usdD: 0,
      tags: [],
      go: { label: 'Cranes & weather', page: 'cranes' },
    })
  }
  return out.slice(0, 4)
}

/** carbon: flaring / venting share and what recovering it is worth */
const carbon: Rule = ({ s, f }) => {
  const r = s.result
  if (!r) return []
  const e = f.emis
  const tot = e.flare + e.fuel + e.vent
  if (tot <= 0) return []
  const flareShare = (e.flare / tot) * 100
  if (r.flare < 3 && flareShare < 25) return []
  const gasValueD = r.flare * 1000 * f.unit.gasMscf
  const carbonD = e.flare * f.deck.carbon
  return [
    {
      id: 'carbon:flare',
      kind: r.flare > 10 ? 'act' : 'watch',
      area: 'carbon',
      title: `Flaring ${r.flare.toFixed(1)} MMscfd — ${pct(flareShare)} of the field's CO2e, ${fmtUsd(gasValueD + carbonD)}/d`,
      detail: `${n0(e.flare)} tCO2e/d from the flare (${fmtUsd(carbonD)}/d at ${'$'}${f.deck.carbon}/t) plus ${fmtUsd(gasValueD)}/d of gas not sold. Carbon intensity ${f.rate.intensity.toFixed(1)} kgCO2e/boe. Restoring compression removes most of it.`,
      usdD: gasValueD + carbonD,
      tags: [],
      go: { label: 'Asset & economics', page: 'economics' },
    },
  ]
}

/** wells: the one dragging water, and wells shut in */
const wells: Rule = ({ s, f }) => {
  const w = s.result?.wells
  if (!w) return []
  const out: Omit<Insight, 'since'>[] = []
  const list = Object.entries(w).filter(([, x]) => x.online && x.oil > 50)
  const oilT = list.reduce((a, [, x]) => a + x.oil, 0)
  const watT = list.reduce((a, [, x]) => a + x.water, 0)
  if (oilT > 0 && watT > 0) {
    const worst = list.map(([tag, x]) => ({ tag, oilS: x.oil / oilT, watS: x.water / watT })).sort((a, b) => b.watS - b.oilS - (a.watS - a.oilS))[0]
    if (worst && worst.watS - worst.oilS > 0.08)
      out.push({
        id: `wells:water:${worst.tag}`,
        kind: 'info',
        area: 'wells',
        title: `${worst.tag} makes ${pct(worst.oilS * 100)} of the oil but ${pct(worst.watS * 100)} of the water`,
        detail: `Water cut ${pct((A.WELLS[worst.tag]?.wc ?? 0) * 100)}. Every barrel of water costs treatment, pumping and injection capacity — a candidate for a water shut-off or a choke review.`,
        usdD: 0,
        tags: [worst.tag],
        go: { label: 'Show', tag: worst.tag },
      })
  }
  const shut = Object.entries(A.WELLS).filter(([tag]) => s.knobs?.wellOnline?.[tag] === false)
  if (shut.length) {
    const lost = shut.reduce((a, [tag, d]) => a + d.oil * (Math.max(s.knobs?.chokes?.[tag] ?? A.REF_CHOKE, A.REF_CHOKE) / 100), 0)
    out.push({
      id: 'wells:shut',
      kind: 'watch',
      area: 'wells',
      title: `${shut.length} well${shut.length > 1 ? 's' : ''} shut in by the operator — about ${fmtUsd(lost * f.unit.oilBbl)}/d of oil`,
      detail: `${shut.map(([t]) => t).join(', ')} are offline. If that is not for a reason (testing, integrity, reservoir), bring them back.`,
      usdD: lost * f.unit.oilBbl,
      tags: shut.map(([t]) => t),
    })
  }
  return out
}

/** compressor speed headroom while gas goes to flare */
const compressorHeadroom: Rule = ({ s, f }) => {
  const r = s.result
  const speed = s.knobs?.compressorSpeed ?? 100
  if (!r || speed >= 99 || r.flare < 1) return []
  const extra = Math.min(r.flare, (A.CAP.compressor * (100 - speed)) / 100)
  if (extra < 1) return []
  const usd = extra * A.BOE_PER_MMSCF * f.unit.gasBoe
  return [
    {
      id: 'opp:compressor',
      kind: 'act',
      area: 'opportunity',
      title: `${A.TAGS.compressor} at ${Math.round(speed)} % speed while ${r.flare.toFixed(1)} MMscfd flares — up to ${fmtUsd(usd)}/d back`,
      detail: `Raising the speed towards 100 % could put about ${extra.toFixed(1)} MMscfd back into export, watching surge margin and power. Speed is in Operations → Knobs.`,
      usdD: usd,
      tags: [A.TAGS.compressor],
      go: { label: 'Show', tag: A.TAGS.compressor },
    },
  ]
}

/** safety risk high, with its top driver */
const safety: Rule = () => {
  const now = useRisk.getState().now
  if (!now || (now.band !== 'high' && now.band !== 'critical')) return []
  const c = now.contributors?.[0]
  return [
    {
      id: 'safety:band',
      kind: 'act',
      area: 'safety',
      title: `Field risk ${now.band.toUpperCase()} (${Math.round(now.field)}/100)${c ? ` — driven by ${c.text}` : ''}`,
      detail: `${now.contributors.slice(0, 3).map((x) => `${x.text} (+${Math.round(x.points)})`).join('; ')}. Safety first: production decisions wait until this is under control.`,
      usdD: 0,
      rank: Infinity,
      tags: c?.tag ? [c.tag] : [],
      go: { label: 'Risk & what-if', page: 'risk' },
    },
  ]
}

/** maintenance backlog and overdue PMs */
const backlog: Rule = () => {
  const m = useMaint.getState()
  const open = m.wos.filter(isOpen)
  const overdue = Object.values(m.pm).filter((x) => x.frac >= 1).length
  if (open.length < 4 && !overdue) return []
  const p1 = open.filter((w) => w.priority === 1).length
  return [
    {
      id: 'maint:backlog',
      kind: p1 ? 'watch' : 'info',
      area: 'asset',
      title: `${open.length} open work orders${p1 ? `, ${p1} at priority 1` : ''}${overdue ? ` · ${overdue} PM${overdue > 1 ? 's' : ''} overdue` : ''}`,
      detail: 'Backlog and overdue preventive maintenance raise the chance of the next failure. The Maintenance page plans permits around production.',
      usdD: 0,
      tags: [],
      go: { label: 'Maintenance', page: 'maintenance' },
    },
  ]
}

const RULES: Rule[] = [safety, constraint, assetConcentration, supply, compressorHeadroom, carbon, deferral, peTrend, wells, liftingCost, backlog]

// ================================================================= headline

function headline({ s, f }: Ctx, list: Insight[]): string {
  const r = s.result
  if (!r) return ''
  const parts: string[] = []
  parts.push(`Producing ${n0(r.oilExport)} bbl/d oil and ${r.gasExport.toFixed(1)} MMscfd gas at ${r.efficiency.toFixed(0)} % PE, worth ${fmtUsd(f.rate.revenue)}/d (cash margin ${fmtUsd(f.rate.cash)}/d).`)
  const loss = list.find((x) => x.area === 'production' && x.id.startsWith('constraint'))
  if (loss) parts.push(`Main loss: ${loss.title.charAt(0).toLowerCase()}${loss.title.slice(1)}.`)
  const risk = list.find((x) => x.area === 'asset' && x.id.startsWith('asset:') && !x.id.includes('spof'))
  if (risk) parts.push(`Biggest risk: ${risk.title}.`)
  const sup = list.find((x) => x.area === 'supply')
  if (sup) parts.push(`Supply: ${sup.title.charAt(0).toLowerCase()}${sup.title.slice(1)}.`)
  if (!loss && !risk) parts.push('No binding constraint and no concentrated asset risk.')
  return parts.join(' ')
}

// ================================================================= plugin

const firstSeen = new Map<string, number>()
let lastWall = 0
function refresh() {
  const ctx: Ctx = { s: S(), f: useFinance.getState() }
  const out: Insight[] = []
  for (const rule of RULES) {
    try {
      for (const x of rule(ctx)) {
        if (!firstSeen.has(x.id)) firstSeen.set(x.id, ctx.s.t)
        out.push({ ...x, since: firstSeen.get(x.id)! })
      }
    } catch {
      /* a rule whose inputs are not ready yet */
    }
  }
  const ids = new Set(out.map((x) => x.id))
  for (const k of [...firstSeen.keys()]) if (!ids.has(k)) firstSeen.delete(k)
  out.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || (b.rank ?? b.usdD) - (a.rank ?? a.usdD))
  useInsights.setState({ list: out, headline: headline(ctx, out), at: ctx.s.t })
}

registerSimPlugin({
  id: 'insights',
  step: () => {
    const now = performance.now()
    if (now - lastWall < 1000) return
    lastWall = now
    refresh()
  },
  reset: () => {
    firstSeen.clear()
    useInsights.setState({ list: [], headline: '', at: 0 })
  },
})

export const insightsApi = { refresh }
if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __insights: useInsights })
