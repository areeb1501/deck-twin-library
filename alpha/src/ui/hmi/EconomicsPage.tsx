/**
 * Asset & economics (plan 13 B) — the executive view, Finance's first tab. Reads in five seconds:
 *
 *   header        $ at risk over the horizon · demo-story slot (data-demo-story)
 *   KPI tiles     oil vs potential · gas · revenue · cash margin · lifting cost · PE · deferred $ · carbon intensity
 *   insights      the "so what": ranked findings (InsightsPanel, sim/insights.ts — integrator's)
 *   production    actual vs potential (boe/d), the gap shaded as deferment
 *   waterfall     potential → losses by PE category → realised → royalty → cost lines → cash
 *   risk register every monitored machine ranked by $ exposure, spare cover, the lever and what it saves
 *   price deck    editable ASSUMPTION · emissions · maintenance & supply spend
 *
 * Everything comes from useFinance (sim/finance.ts, written ≤ 2 Hz; the register ≤ 1 Hz) — nothing is
 * computed from the sim in render. Simulated data throughout; the deck is never a "current" market price.
 */
import { memo, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { COST_LABEL, type CostLine, type PriceDeck } from '../../sim/assetTypes'
import { fmtDays, fmtUsd, type AssetRiskRow } from '../../sim/assetRisk'
import { COST_LINES, LOSS_CATS, deferredTotal, financeApi, sessionCash, useFinance, type FinancePointX } from '../../sim/finance'
import { maint } from '../../sim/maintenance'
import { sparesApi, useSpares } from '../../sim/spares'
import { LOSS_LABEL, PLATFORM_LABEL, fmtClock, type LossCategory } from '../../sim/types'
import { Box, Msg, TagLink } from './common'
import { InsightsPanel } from './InsightsPanel'
import { pickOf, showIn3D } from './nav'
import { fmt, useS } from './simApi'
import './econ.css'

// ================================================================= shared bits

/** "63.4 k" */
const k1 = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)} k` : v.toFixed(0))
/** sim seconds → "16 min" / "4.2 h" / "2.5 d" */
const fmtSimSpan = (s: number) => (s < 5400 ? `${Math.round(s / 60)} min` : s < 2 * 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} d`)
const pct = (v: number) => (v <= 0 ? '0 %' : v < 0.005 ? '< 1 %' : `${Math.round(v * 100)} %`)
/** a nice axis step for `max` split into about `n` intervals */
function niceStep(max: number, n = 4) {
  const raw = Math.max(1e-9, max / n)
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

// ================================================================= page

export function EconomicsPage({ headerExtra }: { headerExtra?: ReactNode }) {
  // compute once on open; while the clock is paused the plugin does not step, so keep the register fresh
  useEffect(() => {
    financeApi.refresh()
    const id = window.setInterval(() => {
      if (!(useS.getState().speed > 0)) financeApi.refresh(true)
    }, 2000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="econ" data-econ="page">
      <EconHeader headerExtra={headerExtra} />
      <EconKpis />
      <div className="econ-ins">
        <InsightsPanel />
      </div>
      <ProductionChart />
      <Waterfall />
      <RiskRegister />
      <PriceDeckBox />
      <EmissionsBox />
      <SpendBox />
    </div>
  )
}

// ================================================================= header

function EconHeader({ headerExtra }: { headerExtra?: ReactNode }) {
  const atRisk = useFinance((s) => s.atRisk)
  const horizon = useFinance((s) => s.riskHorizon)
  const risks = useFinance((s) => s.risks)
  const top = risks[0]
  const n = useMemo(() => risks.filter((r) => r.exposureUsd >= 1000).length, [risks])
  return (
    <header className="econ-head" data-econ="header">
      <div className="econ-title">
        <h2>Asset and economics</h2>
        <p>Production value, deferment and asset risk</p>
      </div>
      <div className="econ-slot" data-demo-story>
        {headerExtra}
      </div>
      <div className={`econ-atrisk ${atRisk >= 1e6 ? 'hot' : ''}`} title="Probability-weighted $ exposure of every monitored machine over the horizon (asset-risk register below)">
        <span className="l">$ at risk · next {horizon} d</span>
        <b>{fmtUsd(atRisk)}</b>
        <span className="s">{top && top.exposureUsd >= 1000 ? `${n} machine${n === 1 ? '' : 's'} · top ${top.tag} ${fmtUsd(top.exposureUsd)}` : 'no material exposure'}</span>
      </div>
    </header>
  )
}

// ================================================================= KPI tiles

function Tile({ label, value, unit, sub, tone, title, bar }: { label: string; value: string; unit?: string; sub?: ReactNode; tone?: 'loss' | 'acc' | 'abn'; title?: string; bar?: number }) {
  return (
    <div className={`econ-tile ${tone ?? ''}`} title={title}>
      <div className="l">{label}</div>
      <div className="n">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {bar !== undefined && (
        <div className="bar">
          <i style={{ width: `${Math.max(0, Math.min(100, bar * 100))}%` }} />
        </div>
      )}
      {sub && <div className="s">{sub}</div>}
    </div>
  )
}

function EconKpis() {
  const rate = useFinance((s) => s.rate)
  const now = useFinance((s) => s.now)
  const totals = useFinance((s) => s.totals)
  const today = useFinance((s) => s.today)
  const emis = useFinance((s) => s.emis)
  const pe = useS((s) => s.kpis?.pe)
  const peHour = useS((s) => s.kpis?.peHour)
  const flare = useS((s) => s.result?.flare)
  const fuel = useS((s) => s.result?.fuelGas)
  const live = now.t > 0 || now.mpp > 0
  const oilShare = now.oilPotential > 0 ? now.oil / now.oilPotential : 1
  const deferred = deferredTotal(totals.deferred)
  const margin = rate.revenue > 0 ? rate.cash / rate.revenue : 0
  const co2 = emis.flare + emis.fuel + emis.vent
  return (
    <div className="econ-kpis" data-econ="kpis">
      <Tile
        label="Oil export"
        value={live ? fmt(now.oil) : '-'}
        unit="bbl/d"
        bar={oilShare}
        tone={live && oilShare < 0.5 ? 'loss' : live && oilShare < 0.97 ? 'abn' : undefined}
        sub={
          <>
            of <span className="mono">{fmt(now.oilPotential)}</span> potential{now.oilPotential - now.oil > 50 && <span className="neg"> · −{fmt(now.oilPotential - now.oil)}</span>}
          </>
        }
      />
      <Tile label="Gas export" value={live ? fmt(now.gas, 1) : '-'} unit="MMscfd" tone={(flare ?? 0) > 15 ? 'loss' : (flare ?? 0) > 3 ? 'abn' : undefined} sub={`flare ${fmt(flare, 1)} · fuel ${fmt(fuel, 1)} MMscfd`} />
      <Tile label="Revenue" value={fmtUsd(rate.revenue)} unit="/ d" tone="acc" sub={`oil ${fmtUsd(rate.oilRevenue)} · gas ${fmtUsd(rate.gasRevenue)}`} title="Run-rate at the assumed price deck: oil export × oil price + gas export × HHV × gas price" />
      <Tile label="Cash margin" value={fmtUsd(rate.cash)} unit="/ d" tone={rate.cash < 0 ? 'loss' : 'acc'} sub={rate.revenue > 0 ? `${Math.round(margin * 100)} % of revenue` : 'no revenue: fixed costs still run'} title="Revenue − royalty − OPEX − carbon, run-rate" />
      <Tile label="Lifting cost" value={rate.liftingCost > 0 ? `$${rate.liftingCost.toFixed(1)}` : '-'} unit="/ boe" tone={rate.liftingCost > 20 ? 'abn' : undefined} sub={`OPEX ${fmtUsd(rate.opex)} / d`} title="OPEX ÷ boe produced (run-rate)" />
      <Tile label="Production efficiency" value={fmt(pe, 1)} unit="% session" tone={(pe ?? 100) < 90 ? 'loss' : (pe ?? 100) < 97 ? 'abn' : undefined} sub={`now ${fmt(now.pe, 1)} % · last hour ${fmt(peHour, 1)} %`} title="Actual ÷ maximum production potential (boe), NSTA definition" />
      <Tile
        label="Deferred: session"
        value={fmtUsd(deferred)}
        tone={deferred > 1000 ? 'loss' : undefined}
        sub={
          <>
            today {fmtUsd(today.deferred)}
            {totals.deferred.materials > 0 && <span className="neg"> · awaiting spares {fmtUsd(totals.deferred.materials)}</span>}
            {rate.deferred > 100 && <span className="neg"> · now {fmtUsd(rate.deferred)}/d</span>}
          </>
        }
        title="Deferred production valued at the price of what was lost (PE loss categories). 'Awaiting spares' is the share of it while machines waited for parts, not added."
      />
      <Tile label="Carbon intensity" value={rate.intensity > 0 ? rate.intensity.toFixed(1) : '-'} unit="kgCO2e/boe" tone={rate.intensity > 25 ? 'loss' : rate.intensity > 12 ? 'abn' : undefined} sub={`${fmt(co2)} t/d · ${fmtUsd(rate.carbonCost)}/d carbon`} title="Flare + fuel gas + cold vent CO2e ÷ boe produced" />
    </div>
  )
}

// ================================================================= production chart

const PW = 640
const PH = 210
const PL = 40
const PR = 10
const PT = 12
const PB = 24

const ProductionChart = memo(function ProductionChart() {
  const history = useFinance((s) => s.history)
  const now = useFinance((s) => s.now)
  const [hover, setHover] = useState<number | null>(null)

  const g = useMemo(() => {
    let pts: Pick<FinancePointX, 't' | 'boe' | 'mpp' | 'oil'>[] = history
    if (now.t > 0 && (!pts.length || now.t > pts[pts.length - 1].t)) pts = [...pts, { t: now.t, boe: now.boe, mpp: now.mpp, oil: now.oil }]
    // keep at most ~600 points (every k-th, always the last)
    if (pts.length > 600) {
      const k = Math.ceil(pts.length / 600)
      pts = pts.filter((_, i) => i % k === 0 || i === pts.length - 1)
    }
    if (pts.length < 1) return null
    const t0 = pts[0].t
    const t1 = Math.max(t0 + 3600, pts[pts.length - 1].t)
    const hi = Math.max(1, ...pts.map((p) => Math.max(p.mpp, p.boe, p.oil)))
    const step = niceStep(hi * 1.08, 4)
    const yMax = Math.ceil((hi * 1.08) / step) * step
    const x = (t: number) => PL + ((t - t0) / (t1 - t0)) * (PW - PL - PR)
    const y = (v: number) => PT + (1 - Math.max(0, v) / yMax) * (PH - PT - PB)
    const line = (f: (p: (typeof pts)[number]) => number) => pts.map((p) => `${x(p.t).toFixed(1)},${y(f(p)).toFixed(1)}`).join(' ')
    const pot = line((p) => p.mpp)
    const act = line((p) => p.boe)
    const oil = line((p) => p.oil)
    const actRev = [...pts]
      .reverse()
      .map((p) => `${x(p.t).toFixed(1)},${y(Math.min(p.boe, p.mpp)).toFixed(1)}`)
      .join(' ')
    const yTicks: number[] = []
    for (let v = 0; v <= yMax + 1e-6; v += step) yTicks.push(v)
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0))
    const one = pts.length === 1
    return { pts, x, y, pot, act, oil, gap: `${pot} ${actRev}`, area: `${x(pts[0].t).toFixed(1)},${y(0)} ${act} ${x(pts[pts.length - 1].t).toFixed(1)},${y(0)}`, yTicks, xTicks, one }
  }, [history, now])

  const hp = g && hover !== null ? g.pts[Math.min(hover, g.pts.length - 1)] : null
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!g) return
    const rc = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - rc.left) / rc.width) * PW
    let best = 0
    let bd = Infinity
    for (let i = 0; i < g.pts.length; i++) {
      const d = Math.abs(g.x(g.pts[i].t) - vx)
      if (d < bd) {
        bd = d
        best = i
      }
    }
    setHover(best)
  }

  const gapNow = now.mpp - now.boe
  return (
    <Box
      title="Production: actual vs potential"
      className="econ-prod"
      right={
        hp ? (
          <span className="econ-read mono">
            {fmtClock(hp.t).slice(0, -3)} · actual {k1(hp.boe)} · potential {k1(hp.mpp)} · <span className={hp.mpp - hp.boe > 50 ? 'neg' : ''}>gap {k1(Math.max(0, hp.mpp - hp.boe))}</span> boe/d
          </span>
        ) : (
          <span className="econ-legend">
            <i className="lg-pot" /> potential <i className="lg-act" /> actual (boe/d) <i className="lg-oil" /> oil export <i className="lg-gap" /> deferred
          </span>
        )
      }
    >
      {!g ? (
        <div className="econ-empty">Waiting for production data.</div>
      ) : (
        <svg className="econ-chart" viewBox={`0 0 ${PW} ${PH}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`Production ${Math.round(now.boe)} of ${Math.round(now.mpp)} boe per day potential`}>
          {g.yTicks.map((v) => (
            <g key={v}>
              <line x1={PL} x2={PW - PR} y1={g.y(v)} y2={g.y(v)} className="grid" />
              <text x={PL - 5} y={g.y(v) + 3} className="ax ay">
                {v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : v}
              </text>
            </g>
          ))}
          {g.xTicks.map((t, i) => (
            <text key={i} x={g.x(t)} y={PH - 7} className={`ax ${i === 0 ? 'a0' : i === 4 ? 'a1' : ''}`}>
              {fmtClock(t).slice(0, -3)}
            </text>
          ))}
          {!g.one && <polygon points={g.area} className="area" />}
          {!g.one && <polygon points={g.gap} className="gap" />}
          {!g.one && <polyline points={g.oil} className="oil" />}
          {!g.one && <polyline points={g.pot} className="pot" />}
          {!g.one && <polyline points={g.act} className="act" />}
          {g.one && <circle cx={g.x(g.pts[0].t)} cy={g.y(g.pts[0].boe)} r="3" className="dot" />}
          {hp && (
            <g className="hov">
              <line x1={g.x(hp.t)} x2={g.x(hp.t)} y1={PT} y2={PH - PB} />
              <circle cx={g.x(hp.t)} cy={g.y(hp.mpp)} r="2.5" className="hp" />
              <circle cx={g.x(hp.t)} cy={g.y(hp.boe)} r="3" className="ha" />
            </g>
          )}
        </svg>
      )}
      <div className="econ-prod-ft">
        <span>
          Now <b className="mono">{fmt(now.boe)}</b> of <span className="mono">{fmt(now.mpp)}</span> boe/d
        </span>
        {gapNow > 50 ? (
          <span className="neg">
            deferring <b className="mono">{fmt(gapNow)}</b> boe/d
          </span>
        ) : (
          <span className="dim">at potential</span>
        )}
        <span className="dim grow-r">5-minute average · 5.8 Mscf/boe</span>
      </div>
    </Box>
  )
})

// ================================================================= waterfall

interface WfBar {
  key: string
  label: string
  full: string
  v: number
  kind: 'total' | 'loss' | 'rev' | 'cost' | 'cash'
}
const LOSS_SHORT: Record<LossCategory, string> = {
  wells: 'Wells',
  reservoir: 'Reservoir',
  oil: 'Oil plant',
  gas: 'Gas/flare',
  power: 'Power',
  utilities: 'Utilities',
  controlSafety: 'Trips/ESD',
  export: 'Export',
  planned: 'Planned',
}
const COST_SHORT: Record<CostLine, string> = { fixed: 'Fixed', variable: 'Variable', labour: 'Labour', parts: 'Parts', logistics: 'Freight', carbon: 'Carbon' }

const WW = 720
const WH = 236
const WT = 18
const WB = 30

const Waterfall = memo(function Waterfall() {
  const [mode, setMode] = useState<'session' | 'rate'>('session')
  const totals = useFinance((s) => s.totals)
  const rate = useFinance((s) => s.rate)
  const dRate = useFinance((s) => s.deferredRate)
  const mRate = useFinance((s) => s.materialsRate)
  const cRate = useFinance((s) => s.costRate)
  const royalty = useFinance((s) => s.deck.royalty)
  const elapsed = useFinance((s) => s.elapsed)

  const wf = useMemo(() => {
    const sess = mode === 'session'
    const realised = sess ? totals.revenue : rate.revenue
    const losses = LOSS_CATS.map((k) => ({ k, v: sess ? totals.deferred[k] : dRate[k] })).filter((x) => x.v > 0.5)
    losses.sort((a, b) => b.v - a.v)
    const lossBars: WfBar[] = losses.slice(0, 4).map((x) => ({ key: x.k, label: LOSS_SHORT[x.k], full: `Deferred: ${LOSS_LABEL[x.k]}`, v: x.v, kind: 'loss' }))
    const rest = losses.slice(4).reduce((a, x) => a + x.v, 0)
    if (rest > 0) lossBars.push({ key: 'other', label: 'Other', full: `Deferred: other categories (${losses.slice(4).map((x) => LOSS_SHORT[x.k]).join(', ')})`, v: rest, kind: 'loss' })
    if (!lossBars.length) lossBars.push({ key: 'none', label: 'Deferment', full: 'No deferred production', v: 0, kind: 'loss' })
    const lossSum = lossBars.reduce((a, b) => a + b.v, 0)
    const roy = sess ? totals.royalty : rate.revenue * royalty
    const costs: WfBar[] = COST_LINES.map((k) => ({ key: k, label: COST_SHORT[k], full: COST_LABEL[k], v: sess ? totals.cost[k] : cRate[k], kind: 'cost' as const })).filter((b) => b.v > 0.5 || b.key === 'fixed' || b.key === 'variable' || b.key === 'carbon')
    const cash = sess ? sessionCash(totals) : rate.cash
    const bars: WfBar[] = [
      { key: 'potential', label: 'Potential', full: 'Potential revenue (realised + deferred)', v: realised + lossSum, kind: 'total' },
      ...lossBars,
      { key: 'realised', label: 'Realised', full: 'Realised revenue', v: realised, kind: 'rev' },
      ...(roy > 0.5 || royalty > 0 ? [{ key: 'royalty', label: 'Royalty', full: 'Royalty / government take', v: roy, kind: 'cost' as const }] : []),
      ...costs,
      { key: 'cash', label: 'Cash', full: 'Cash (revenue − royalty − OPEX − carbon)', v: cash, kind: 'cash' },
    ]
    // running level → [from, to] for each bar
    let lvl = 0
    const seg = bars.map((b) => {
      let a: number
      let z: number
      if (b.kind === 'total' || b.kind === 'rev' || b.kind === 'cash') {
        a = 0
        z = b.v
        lvl = b.v
      } else {
        a = lvl
        z = lvl - b.v
        lvl = z
      }
      return { ...b, a, z }
    })
    const lo = Math.min(0, ...seg.map((s) => Math.min(s.a, s.z)))
    const hi = Math.max(1, ...seg.map((s) => Math.max(s.a, s.z)))
    const span = hi - lo || 1
    const y = (v: number) => WT + ((hi - v) / span) * (WH - WT - WB)
    const n = seg.length
    const slot = (WW - 8) / n
    const bw = Math.min(40, slot * 0.66)
    const x = (i: number) => 4 + slot * i + (slot - bw) / 2
    const materials = sess ? totals.deferred.materials : mRate
    return { seg, y, x, bw, slot, lo, materials, lossSum }
  }, [mode, totals, rate, dRate, mRate, cRate, royalty])

  return (
    <Box
      title={mode === 'session' ? `Revenue waterfall: session (${fmtSimSpan(elapsed)})` : 'Revenue waterfall: run-rate per day'}
      className="econ-wf"
      right={
        <span className="econ-seg">
          <button className={mode === 'session' ? 'on' : ''} onClick={() => setMode('session')}>
            Session
          </button>
          <button className={mode === 'rate' ? 'on' : ''} onClick={() => setMode('rate')}>
            Per day
          </button>
        </span>
      }
    >
      <svg className="econ-chart wf" viewBox={`0 0 ${WW} ${WH}`} role="img" aria-label="Revenue waterfall">
        <line x1="0" x2={WW} y1={wf.y(0)} y2={wf.y(0)} className="zero" />
        {wf.seg.map((b, i) => {
          const top = Math.min(wf.y(b.a), wf.y(b.z))
          const h = Math.max(1, Math.abs(wf.y(b.a) - wf.y(b.z)))
          const cx = wf.x(i) + wf.bw / 2
          const next = wf.seg[i + 1]
          const neg = b.kind === 'cash' && b.v < 0
          return (
            <g key={b.key} className={`wb k-${b.kind} ${neg ? 'neg' : ''}`}>
              <rect x={wf.x(i)} y={top} width={wf.bw} height={h}>
                <title>{`${b.full}: ${fmtUsd(b.v)}`}</title>
              </rect>
              {next && <line x1={wf.x(i) + wf.bw} x2={wf.x(i + 1)} y1={wf.y(b.z)} y2={wf.y(b.z)} className="conn" />}
              <text x={cx} y={neg ? top + h + 10 : top - 4} className="val">
                {b.kind === 'loss' || b.kind === 'cost' ? (b.v > 0 ? `−${fmtUsd(b.v)}` : '$0') : fmtUsd(b.v)}
              </text>
              <text x={cx} y={WH - 14} className="lbl">
                {b.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="econ-wf-note">
        {wf.materials > 0.5 ? (
          <span>
            <i className="hatch" /> of which awaiting spares: <b className="mono neg">{fmtUsd(wf.materials)}</b>
            {mode === 'rate' ? ' / d' : ''}: inside the losses above, not added
          </span>
        ) : (
          <span className="dim">
            <i className="hatch" /> Nothing awaiting spares
          </span>
        )}
      </div>
    </Box>
  )
})

// ================================================================= asset-risk register

const STAGE_TEXT: Record<AssetRiskRow['stage'], string> = { normal: 'Normal', alert: 'Alert', alarm: 'Alarm', failed: 'Failed' }
const COVER_TEXT: Record<AssetRiskRow['cover']['status'], string> = { onboard: 'On board', base: 'At base', onOrder: 'On order', none: 'None', notStocked: 'Not stocked' }
type SparesExt = typeof sparesApi & { expedite?: (poId: string, opts?: { heli?: boolean; by?: string }) => string | null }

/** the $ difference against waiting, for the confirmation line */
const gain = (L: AssetRiskRow['lever']) => (L.saveUsd > 0 ? ` · removes ${fmtUsd(L.saveUsd)} exposure${L.costUsd > 0 ? ` for ${fmtUsd(L.costUsd)}` : ''} vs waiting` : '')

/** run the row's lever; returns the refusal or a ✓ confirmation */
function runLever(r: AssetRiskRow): string | null {
  const L = r.lever
  if (L.kind === 'raiseWo') return raiseWo(r.tag)
  if (!L.partId) return null
  const api = sparesApi as SparesExt
  if (L.kind === 'expedite' && L.poId && typeof api.expedite === 'function') {
    const why = api.expedite(L.poId, { heli: L.heli, by: 'Asset & economics' })
    return why ?? `✓ ${L.poId} expedited${L.heli ? ', helicopter for the last leg' : ''}: ${L.partName} lands in ≈ ${fmtDays(L.arriveDays)}${gain(L)}`
  }
  const why = sparesApi.order(L.partId, L.qty ?? 1, L.mode ?? 'standard', { wo: L.wo, heli: L.heli, by: 'Asset & economics' })
  return why ?? `✓ ${L.label}: ${L.qty ?? 1} × ${L.partName}${L.heli ? ' by helicopter' : ''}: lands in ≈ ${fmtDays(L.arriveDays)}${gain(L)}`
}
function raiseWo(tag: string): string {
  const x = maint.raiseFor(tag, 'Asset & economics')
  return x.why ?? (x.id ? `✓ ${x.id} raised for ${tag}` : `${tag}: not raised`)
}

const RiskRegister = memo(function RiskRegister() {
  const risks = useFinance((s) => s.risks)
  const horizon = useFinance((s) => s.riskHorizon)
  const atRisk = useFinance((s) => s.atRisk)
  const [all, setAll] = useState(false)
  const [msg, setMsg] = useState<{ tag: string; text: string | null } | null>(null)
  const rows = useMemo(() => (all ? risks : risks.slice(0, 8)), [risks, all])
  const max = risks[0]?.exposureUsd ?? 0

  const act = (tag: string, fn: () => string | null) => {
    const text = fn()
    financeApi.refresh()
    setMsg({ tag, text })
  }

  return (
    <Box
      title={`Asset-risk register: $ exposure, next ${horizon} days`}
      className="econ-risk"
      right={
        <>
          <span className="econ-seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={horizon === d ? 'on' : ''} onClick={() => financeApi.setHorizon(d)}>
                {d} d
              </button>
            ))}
          </span>
          <span className="econ-tot">
            $ at risk <b className="mono">{fmtUsd(atRisk)}</b>
          </span>
        </>
      }
    >
      {risks.length === 0 ? (
        <div className="econ-empty">No monitored machines yet: the register fills once the plant and the maintenance plugin are loaded.</div>
      ) : (
        <div className="econ-rscroll">
          <table className="h-tbl econ-rtbl">
            <thead>
              <tr>
                <th className="rk">#</th>
                <th>Machine</th>
                <th>Class</th>
                <th>Platform</th>
                <th>Health</th>
                <th className="r" title={`Probability of failure within ${horizon} days (trend when degrading, else design MTBF)`}>
                  P(fail {horizon} d)
                </th>
                <th className="r" title="Production at stake while it is down (0 when a standby covers it)">
                  Impact boe/d
                </th>
                <th className="r" title="Days down if it fails: repair + waiting for parts">
                  Days down
                </th>
                <th>Spare cover</th>
                <th className="exp">Exposure</th>
                <th>Action</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <RiskRow key={r.tag} r={r} rank={i + 1} max={max} msg={msg?.tag === r.tag ? msg.text : null} onAct={act} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="econ-risk-ft">
        {risks.length > 8 && (
          <button className="link" onClick={() => setAll((x) => !x)}>
            {all ? 'Show top 8' : `Show all ${risks.length} machines`}
          </button>
        )}
        <span className="dim">
          Exposure = P(fail) × (lost production × days down × $/boe + labour + parts).
        </span>
      </div>
    </Box>
  )
})

function RiskRow({ r, rank, max, msg, onAct }: { r: AssetRiskRow; rank: number; max: number; msg: string | null; onAct: (tag: string, fn: () => string | null) => void }) {
  const down = r.repairDays + r.partsWaitDays
  const L = r.lever
  const hot = r.exposureUsd >= 1e6
  const coverWait = r.cover.status !== 'onboard' && r.cover.status !== 'notStocked' && r.cover.waitDays > 0
  return (
    <>
      <tr className={`econ-rr s-${r.stage} ${hot ? 'hot' : ''}`} data-risk={r.tag}>
        <td className="rk num">{rank}</td>
        <td className="mach">
          <TagLink tag={r.tag} />
          <div className="nm">{r.name}</div>
        </td>
        <td className="dim">{r.cls}</td>
        <td className="dim" title={PLATFORM_LABEL[r.platform] ?? r.platform}>
          {r.platform}
        </td>
        <td>
          <span className={`econ-stage s-${r.stage}`}>{STAGE_TEXT[r.stage]}</span>
          {r.degr > 0 && r.stage !== 'failed' && <span className="mono dim"> {Math.round(r.degr * 100)} %</span>}
          {r.ttfDays !== null && r.stage !== 'failed' && (
            <div className="sub">
              fails in ≈ {fmtDays(r.ttfDays)}
              
            </div>
          )}
        </td>
        <td className="num">
          <span className={r.pFail >= 0.5 ? 'neg' : ''}>{pct(r.pFail)}</span>
          <span className="pbar">
            <i style={{ width: `${Math.round(r.pFail * 100)}%` }} />
          </span>
        </td>
        <td className="num">{r.impactBoeD > 0 ? fmt(r.impactBoeD) : <span className="dim">{r.partner ? 'standby' : '0'}</span>}</td>
        <td className="num" title={`If it fails: repair ${fmtDays(r.repairDays)} + parts wait ${fmtDays(r.partsWaitDays)} (parts already on order count down to the predicted failure)`}>
          {fmtDays(down)}
          {r.partsWaitDays > 0 && <div className="sub">parts {fmtDays(r.partsWaitDays)}</div>}
        </td>
        <td className="cov" title={`${r.cover.note}`}>
          <span className={`econ-cov c-${r.cover.status}`}>{COVER_TEXT[r.cover.status]}</span>
          {coverWait && <span className="mono dim"> {fmtDays(r.cover.waitDays)}</span>}
        </td>
        <td className="exp" title={`If it fails: ${fmtUsd(r.consequenceUsd)} (lost ${fmtUsd(r.lostUsdD)}/d at $${r.usdPerBoe.toFixed(1)}/boe ${r.valuedAs === 'gas' ? 'gas' : 'blended'} · labour ${fmtUsd(r.labourUsd)} · parts ${fmtUsd(r.partsUsd)})`}>
          <div className="ebar">
            <i style={{ width: `${max > 0 ? Math.max(1, (r.exposureUsd / max) * 100) : 0}%` }} />
          </div>
          <b className="mono">{fmtUsd(r.exposureUsd)}</b>
          <span className="sub"> if it fails {fmtUsd(r.consequenceUsd)}</span>
        </td>
        <td className="wrap act-t">
          <div className={L.kind !== 'none' ? 'lev' : 'dim'}>{r.action}</div>
          {L.kind !== 'none' && L.kind !== 'raiseWo' && (
            <div className="sub">
              {L.costUsd > 0 ? `${fmtUsd(L.costUsd)} premium${L.heli ? ' + helicopter' : ''} · ` : ''}lands in ≈ {fmtDays(L.arriveDays)}
              
              {L.beatsFailure ? ' · before the predicted failure' : ''}
            </div>
          )}
        </td>
        <td className="act">
          {L.kind !== 'none' && (
            <button className={L.saveUsd >= 1e5 ? 'warn' : ''} onClick={() => onAct(r.tag, () => runLever(r))} title={r.action}>
              {L.label}
            </button>
          )}
          {L.kind !== 'raiseWo' && (
            <button onClick={() => onAct(r.tag, () => raiseWo(r.tag))} disabled={!!r.wo} title={r.wo ? `${r.wo.id} is open (${r.wo.label})` : 'Raise a work order (condition-based when CM has flagged it)'}>
              WO
            </button>
          )}
          <button onClick={() => showIn3D(r.tag)} disabled={!pickOf(r.tag)} title="Select and frame in 3D (closes the console)">
            3D
          </button>
        </td>
      </tr>
      {msg && (
        <tr className="econ-msgrow">
          <td />
          <td colSpan={11}>
            <Msg text={msg} />
          </td>
        </tr>
      )}
    </>
  )
}

// ================================================================= price deck

const FIELDS: { k: keyof PriceDeck; label: string; full: string; unit: string; scale?: number; step: number }[] = [
  { k: 'oil', label: 'Oil', full: 'Oil price', unit: '$/bbl', step: 1 },
  { k: 'gas', label: 'Gas', full: 'Gas price', unit: '$/MMBtu', step: 0.1 },
  { k: 'hhv', label: 'Gas HHV', full: 'Gas heating value', unit: 'MMBtu/Mscf', step: 0.01 },
  { k: 'fixedOpexD', label: 'Fixed OPEX', full: 'Fixed OPEX: manning, logistics base, insurance', unit: 'k$/d', scale: 1000, step: 10 },
  { k: 'varOpexBbl', label: 'Var. OPEX', full: 'Variable OPEX: chemicals, power, water treatment', unit: '$/bbl', step: 0.1 },
  { k: 'labourH', label: 'Labour', full: 'Maintenance labour per job hour (crew)', unit: '$/job-h', step: 10 },
  { k: 'carbon', label: 'Carbon', full: 'Carbon price', unit: '$/tCO2e', step: 5 },
  { k: 'royalty', label: 'Royalty', full: 'Royalty / government take on revenue', unit: '%', scale: 0.01, step: 1 },
]

function DeckField({ f, value }: { f: (typeof FIELDS)[number]; value: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = +(value / (f.scale ?? 1)).toFixed(4)
  return (
    <label className="econ-field" title={f.full}>
      <span className="l">{f.label}</span>
      <input
        type="number"
        step={f.step}
        min={0}
        value={draft ?? String(shown)}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v)) financeApi.setDeck({ [f.k]: v * (f.scale ?? 1) })
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="u">{f.unit}</span>
    </label>
  )
}

function PriceDeckBox() {
  const deck = useFinance((s) => s.deck)
  const unit = useFinance((s) => s.unit)
  return (
    <Box
      title="Price deck"
      className="econ-deck"
      right={
        <button className="econ-mini" onClick={() => financeApi.resetDeck()}>
          Defaults
        </button>
      }
    >
      <div className="econ-assume">Planning prices. Edit to see the value move.</div>
      <div className="econ-fields">
        {FIELDS.map((f) => (
          <DeckField key={f.k} f={f} value={deck[f.k]} />
        ))}
      </div>
      <div className="econ-units mono">
        gas ${unit.gasBoe.toFixed(1)}/boe · blended potential mix ${unit.blendBoe.toFixed(1)}/boe
      </div>
    </Box>
  )
}

// ================================================================= emissions

function EmissionsBox() {
  const emis = useFinance((s) => s.emis)
  const rate = useFinance((s) => s.rate)
  const totals = useFinance((s) => s.totals)
  const carbon = useFinance((s) => s.deck.carbon)
  const flare = useS((s) => s.result?.flare)
  const fuel = useS((s) => s.result?.fuelGas)
  const vent = useS((s) => s.process?.vent)
  const total = emis.flare + emis.fuel + emis.vent
  const rows: [string, number, number | undefined, string][] = [
    ['Flare', emis.flare, flare, 'combustion + 2 % methane slip, 65 t/MMscf'],
    ['Fuel gas', emis.fuel, fuel, 'turbines, 54.5 t/MMscf'],
    ['Cold vent', emis.vent, vent, 'methane, GWP100 28: 538 t/MMscf'],
  ]
  return (
    <Box title="Emissions" className="econ-emis" right={<span className="mono dim">{fmt(total)} tCO2e/d</span>}>
      <div className="econ-ebars">
        {rows.map(([l, t, mm, why]) => (
          <div key={l} className={`econ-erow ${l === 'Flare' && (flare ?? 0) > 3 ? 'abn' : ''} ${l === 'Cold vent' && (vent ?? 0) > 1 ? 'abn' : ''}`} title={why}>
            <span className="l">{l}</span>
            <span className="bar">
              <i style={{ width: `${total > 0 ? (t / total) * 100 : 0}%` }} />
            </span>
            <span className="mono">{fmt(t)} t/d</span>
            <span className="mono dim">{fmt(mm, 2)} MMscfd</span>
          </div>
        ))}
      </div>
      <div className="econ-pairs">
        <div>
          <span>Intensity</span>
          <b className="mono">{rate.intensity > 0 ? rate.intensity.toFixed(1) : '-'}</b>
          <small>kgCO2e/boe</small>
        </div>
        <div>
          <span>Carbon cost</span>
          <b className="mono">{fmtUsd(rate.carbonCost)}</b>
          <small>/ d at ${carbon}/t</small>
        </div>
        <div>
          <span>Session</span>
          <b className="mono">{fmt(totals.co2t)}</b>
          <small>tCO2e</small>
        </div>
        <div>
          <span>Flared · vented</span>
          <b className="mono">
            {fmt(totals.flaredMMscf, 2)} · {fmt(totals.ventedMMscf, 2)}
          </b>
          <small>MMscf</small>
        </div>
      </div>
      <p className="econ-foot">Screening factors. Fuel gas is own use.</p>
    </Box>
  )
}

// ================================================================= maintenance & supply spend

function SpendBox() {
  const totals = useFinance((s) => s.totals)
  const sk = useSpares((s) => s.kpis)
  const rows: [string, number, string][] = [
    ['Maintenance labour', totals.cost.labour, 'work-order hours × labour rate'],
    ['Spare parts issued', totals.cost.parts, 'parts issued to jobs'],
    ['Expedite & freight', totals.cost.logistics, 'vendor premiums, boat share, helicopter'],
  ]
  return (
    <Box title="Maintenance & supply: session" className="econ-spend" >
      <div className="econ-pairs col">
        {rows.map(([l, v, why]) => (
          <div key={l} title={why}>
            <span>{l}</span>
            <b className="mono">{fmtUsd(v)}</b>
          </div>
        ))}
        <div className={totals.deferred.materials > 0 ? 'neg' : ''} title="Deferred production while machines waited for parts (a share of the PE losses)">
          <span>Deferred awaiting spares</span>
          <b className="mono">{fmtUsd(totals.deferred.materials)}</b>
          <small>{fmt(sk?.wamBoe ?? 0)} boe</small>
        </div>
        <div>
          <span>Work orders waiting for parts</span>
          <b className={`mono ${(sk?.wam ?? 0) > 0 ? 'neg' : ''}`}>{fmt(sk?.wam ?? 0)}</b>
        </div>
        <div>
          <span>Stock on hand · open POs</span>
          <b className="mono">
            {fmtUsd(sk?.inventoryValue ?? 0)} · {fmtUsd(sk?.openPoValue ?? 0)}
          </b>
        </div>
      </div>
    </Box>
  )
}

