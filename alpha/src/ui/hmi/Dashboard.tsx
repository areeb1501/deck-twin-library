/**
 * Live dashboard (plan 02) — the first console page. One glance: how safe the field is right now,
 * why, and where to go.
 *
 *   field risk gauge + history · production / availability KPIs
 *   platform cards (score ring, band, top contributor, shutdown, general alarm)
 *   top issues (Show in 3D · Walk to) · shutdowns & barriers
 *   live sensor grid (sparklines, analog limit bars) · recent events
 *
 * ISA-101: grey on grey, colour only for abnormal (a LOW risk band is drawn neutral, not green).
 * Risk comes from useRisk (safety/risk.ts); never computed in render. Instrument values are not in a
 * store, so the sensor grid refreshes on its own 1 s tick.
 */
import { memo, useEffect, useMemo, useState } from 'react'
import { useRisk } from '../../safety/risk'
import { BAND_COLOR, RISK_CATEGORY_LABEL, bandOf, type RiskBand, type RiskCategory, type RiskContributor } from '../../safety/types'
import { useMaint } from '../../sim/maintenance'
import { useCranes } from '../../sim/cranes'
import { PLATFORM_LABEL, SHUTDOWN_LABEL, fmtClock, type DetectorSim, type PlatformId, type PlatformResult } from '../../sim/types'
import type { Instrument, Plant } from '../../model/types'
import { instrumentHistory } from '../../state/sim'
import { usePlant } from '../../state/plantStore'
import { walkToTag } from '../walkTo'
import { pickOf, showIn3D } from './nav'
import { EMPTY_ARR, EMPTY_OBJ, PLATFORMS, fmt, useS } from './simApi'
import { Box, Kpi, TagLink } from './common'
import { ValueStrip } from './ValueStrip'
import './dash.css'

// ================================================================= shared bits

/** ISA-101: normal is grey, only abnormal bands get colour */
const tone = (b: RiskBand) => (b === 'low' ? 'var(--h-run)' : BAND_COLOR[b])
const BAND_TEXT: Record<RiskBand, string> = { low: 'Low', moderate: 'Moderate', high: 'High', critical: 'Critical' }
const CAT_SHORT: Record<RiskCategory, string> = {
  process: 'Process',
  fireGas: 'F&G',
  shutdown: 'Shutdown',
  alarms: 'Alarms',
  machinery: 'Machinery',
  barriers: 'Barriers',
  work: 'Permits',
  weather: 'Weather',
  people: 'PPE',
}
const FG_TYPES = new Set(['FD', 'GD', 'OGD', 'HD', 'SD', 'MAC'])

/** polyline points for values in a w × h box (y flipped), scaled to [lo, hi] */
function linePts(vals: number[], w: number, h: number, lo: number, hi: number, xs?: number[]) {
  const n = vals.length
  if (!n) return ''
  const span = hi - lo || 1
  const x0 = xs?.[0] ?? 0
  const xspan = xs ? xs[n - 1] - x0 || 1 : n - 1 || 1
  let out = ''
  for (let i = 0; i < n; i++) {
    const x = ((xs ? xs[i] - x0 : i) / xspan) * w
    const y = h - ((Math.max(lo, Math.min(hi, vals[i])) - lo) / span) * h
    out += `${x.toFixed(1)},${y.toFixed(1)} `
  }
  return out
}

/** sim seconds → "45 s" / "12 min" / "1.5 h" */
const fmtSpan = (s: number) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
/** SVG arc from angle a0 to a1 (degrees, clockwise, 0 = +x) */
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

// ================================================================= page

export function DashboardPage() {
  const [plat, setPlat] = useState<PlatformId | null>(null)
  return (
    <div className="dsh" data-dash="page">
      <div style={{ gridColumn: 'span 12' }}>
        <ValueStrip />
      </div>
      <FieldRisk />
      <FieldKpis />
      <PlatformCards sel={plat} onSel={(p) => setPlat((x) => (x === p ? null : p))} />
      <TopIssues plat={plat} onClear={() => setPlat(null)} />
      <Barriers />
      <Sensors />
      <Events />
    </div>
  )
}

// ================================================================= field risk

const G_START = 135
const G_SWEEP = 270

function FieldRisk() {
  const now = useRisk((s) => s.now)
  const history = useRisk((s) => s.history)
  const score = now?.field ?? 0
  const band = now?.band ?? 'low'
  const col = tone(band)
  const end = G_START + (G_SWEEP * Math.min(100, Math.max(0, score))) / 100

  const cats = useMemo(() => {
    const m = new Map<RiskCategory, number>()
    for (const c of now?.contributors ?? EMPTY_ARR) m.set(c.category, (m.get(c.category) ?? 0) + c.points)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [now])
  const catMax = Math.max(30, ...cats.map((c) => c[1]))

  const hist = useMemo(() => {
    const h = history.slice(-360)
    return { pts: linePts(h.map((x) => x.field), 300, 60, 0, 100, h.map((x) => x.t)), n: h.length, span: h.length > 1 ? h[h.length - 1].t - h[0].t : 0, peak: h.reduce((a, x) => Math.max(a, x.field), 0) }
  }, [history])

  const worst = useMemo(() => {
    if (!now) return null
    let w: { id: PlatformId; score: number } | null = null
    for (const [id, p] of Object.entries(now.platforms)) if (p && (!w || p.score > w.score)) w = { id: id as PlatformId, score: p.score }
    return w
  }, [now])

  return (
    <section className={`h-box dsh-hero b-${band}`} data-dash="field-risk">
      <h3>
        <span>Field risk: now</span>
        <span className="grow" />
        <span className={`dsh-state ${now?.producing === false ? 'down' : ''}`}>{now ? (now.producing ? 'Producing' : 'Not producing') : 'Waiting for sim'}</span>
      </h3>
      <div className="dsh-hero-in">
        <svg className="dsh-gauge" viewBox="0 0 200 180" role="img" aria-label={`Field risk ${Math.round(score)} of 100, ${BAND_TEXT[band]}`}>
          <path d={arc(100, 100, 78, G_START, G_START + G_SWEEP)} className="trk" />
          {[25, 50, 75].map((v) => {
            const a = G_START + (G_SWEEP * v) / 100
            const [x0, y0] = polar(100, 100, 66, a)
            const [x1, y1] = polar(100, 100, 90, a)
            const [lx, ly] = polar(100, 100, 98, a)
            return (
              <g key={v}>
                <line x1={x0} y1={y0} x2={x1} y2={y1} className="tick" />
                <text x={lx} y={ly + 3} className="tl">
                  {v}
                </text>
              </g>
            )
          })}
          {score > 0.4 && <path d={arc(100, 100, 78, G_START, end)} className="val" style={{ stroke: col }} />}
          <text x="100" y="104" className="num" style={{ fill: band === 'low' ? undefined : col }}>
            {Math.round(score)}
          </text>
          <text x="100" y="124" className="band" style={{ fill: band === 'low' ? undefined : col }}>
            {BAND_TEXT[band].toUpperCase()}
          </text>
          <text x="100" y="176" className="sub">
            {worst && worst.score > 0 ? `worst: ${worst.id} ${Math.round(worst.score)}` : 'all platforms normal'}
          </text>
        </svg>
        <div className="dsh-hero-side">
          <div className="dsh-cap">
            <span>Risk history</span>
            <span className="dim mono">{hist.span > 0 ? `${fmtSpan(hist.span)} · peak ${Math.round(hist.peak)}` : '-'}</span>
          </div>
          <svg className="dsh-hist" viewBox="0 0 300 60" preserveAspectRatio="none">
            {[25, 50, 75].map((v) => (
              <line key={v} x1="0" x2="300" y1={60 - v * 0.6} y2={60 - v * 0.6} className={`thr t${v}`} vectorEffect="non-scaling-stroke" />
            ))}
            {hist.n > 1 && <polygon points={`0,60 ${hist.pts} 300,60`} className="area" style={{ fill: col }} />}
            {hist.n > 1 && <polyline points={hist.pts} className="ln" style={{ stroke: col }} vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="dsh-cap">
            <span>Why, by category</span>
          </div>
          <div className="dsh-cats">
            {cats.length === 0 && <div className="dim">Every category nominal: no contributors.</div>}
            {cats.slice(0, 5).map(([k, v]) => (
              <div key={k} className="dsh-cat" title={RISK_CATEGORY_LABEL[k]}>
                <span className="l">{CAT_SHORT[k]}</span>
                <span className="bar">
                  <i style={{ width: `${Math.min(100, (v / catMax) * 100)}%`, background: v >= 30 ? BAND_COLOR.critical : v >= 15 ? BAND_COLOR.high : undefined }} />
                </span>
                <span className="n mono">+{Math.round(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ================================================================= KPIs

function FieldKpis() {
  const r = useS((s) => s.result)
  const k = useS((s) => s.kpis)
  const history = useS((s) => s.history) ?? EMPTY_ARR
  const alarms = useS((s) => s.alarms) ?? EMPTY_ARR
  const unack = useMemo(() => {
    const n = [0, 0, 0]
    for (const a of alarms) if (a.state === 'unack') n[(a.priority ?? 3) - 1]++
    return n
  }, [alarms])
  const trend = useMemo(() => {
    const h = history.slice(-240)
    const oil = h.map((x) => x.oil ?? 0)
    const eff = h.map((x) => x.eff ?? 0)
    const hi = Math.max(1, ...oil) * 1.08
    return { oil: linePts(oil, 300, 40, 0, hi), eff: linePts(eff, 300, 40, 0, 105), n: h.length, span: h.length > 1 ? h[h.length - 1].t - h[0].t : 0 }
  }, [history])
  const rate = k?.alarmRate ?? 0
  const producing = (r?.actual ?? 0) > 0
  return (
    <Box title="Production & availability" className="dsh-kpibox" right={<span className="dim mono">{trend.span > 0 ? `trend ${fmtSpan(trend.span)}` : ''}</span>}>
      <div className="dsh-kpis">
        <Kpi label="Availability" value={fmt(k?.availability, 1)} unit="%" abn={(k?.availability ?? 100) < 95} title="Share of sim time the field was up (no PSD / ESD / blackout)" />
        <Kpi label="PE: now" value={fmt(r?.efficiency, 1)} unit="%" abn={(r?.efficiency ?? 100) < 95} bad={!!r && r.efficiency < 50} title="Actual / maximum production potential (boe), this instant" />
        <Kpi label="PE: session" value={fmt(k?.pe, 1)} unit="%" abn={(k?.pe ?? 100) < 95} />
        <Kpi label="Oil export" value={fmt(r?.oilExport)} unit="bbl/d" bad={!!r && !producing} />
        <Kpi label="Gas export" value={fmt(r?.gasExport, 1)} unit="MMscfd" />
        <Kpi label="Flare" value={fmt(r?.flare, 1)} unit="MMscfd" abn={(r?.flare ?? 0) > 3} bad={(r?.flare ?? 0) > 15} />
        <Kpi label="Unack. alarms" value={`${unack[0]} · ${unack[1]} · ${unack[2]}`} unit="P1·P2·P3" abn={unack[1] > 0} bad={unack[0] > 0} />
        <Kpi label="Alarm rate" value={fmt(rate)} unit="/ 10 min" abn={rate >= 5} bad={rate >= 10} title="ISA-18.2: ≥ 10 in 10 minutes is a flood" />
      </div>
      <div className="dsh-trend">
        <div className="dsh-cap">
          <span>Oil export</span>
          <span className="dim mono">{fmt(r?.oilExport)} bbl/d</span>
        </div>
        <div className="dsh-cap">
          <span>Production efficiency</span>
          <span className="dim mono">{fmt(r?.efficiency, 1)} %</span>
        </div>
        <svg viewBox="0 0 300 40" preserveAspectRatio="none">
          {trend.n > 1 && <polyline points={trend.oil} className="ln" vectorEffect="non-scaling-stroke" />}
        </svg>
        <svg viewBox="0 0 300 40" preserveAspectRatio="none">
          <line x1="0" x2="300" y1={40 - (95 / 105) * 40} y2={40 - (95 / 105) * 40} className="thr" vectorEffect="non-scaling-stroke" />
          {trend.n > 1 && <polyline points={trend.eff} className="ln" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
    </Box>
  )
}

// ================================================================= platform cards

function Ring({ score, band, size = 58 }: { score: number; band: RiskBand; size?: number }) {
  const r = 24
  const c = 2 * Math.PI * r
  const f = Math.min(100, Math.max(0, score)) / 100
  return (
    <svg className="dsh-ring" width={size} height={size} viewBox="0 0 60 60" aria-hidden>
      <circle cx="30" cy="30" r={r} className="trk" />
      {f > 0.004 && <circle cx="30" cy="30" r={r} className="val" style={{ stroke: tone(band), strokeDasharray: `${(c * f).toFixed(2)} ${c.toFixed(2)}` }} transform="rotate(-90 30 30)" />}
      <text x="30" y="35" style={{ fill: band === 'low' ? undefined : tone(band) }}>
        {Math.round(score)}
      </text>
    </svg>
  )
}

const GA_TEXT: Record<PlatformResult['ga'], string> = { normal: 'GA normal', gas: 'Gas alarm', fire: 'Fire alarm', muster: 'Muster', abandon: 'Abandon' }

function PlatformCards({ sel, onSel }: { sel: PlatformId | null; onSel: (p: PlatformId) => void }) {
  const now = useRisk((s) => s.now)
  const history = useRisk((s) => s.history)
  const res = useS((s) => s.result?.platforms) ?? EMPTY_OBJ
  const ids = useMemo(() => {
    const keys = Object.keys(now?.platforms ?? EMPTY_OBJ) as PlatformId[]
    return keys.length ? keys : PLATFORMS
  }, [now])
  const spark = useMemo(() => {
    const h = history.slice(-180)
    const o: Partial<Record<PlatformId, string>> = {}
    for (const id of ids) o[id] = linePts(h.map((x) => x.p[id] ?? 0), 100, 18, 0, 100)
    return o
  }, [history, ids])
  return (
    <div className="dsh-plats" data-dash="platforms">
      {ids.map((id) => {
        const pr = now?.platforms[id]
        const score = pr?.score ?? 0
        const band = pr?.band ?? bandOf(score)
        const top = pr?.contributors[0]
        const r = (res as Partial<Record<PlatformId, PlatformResult>>)[id]
        const sd = now?.shutdowns[id]
        const ga = r?.ga ?? 'normal'
        return (
          <button key={id} className={`dsh-plat b-${band} ${sel === id ? 'sel' : ''}`} onClick={() => onSel(id)} title={`${PLATFORM_LABEL[id] ?? id}: click to filter the issues`} data-plat={id}>
            <Ring score={score} band={band} />
            <div className="body">
              <div className="hd">
                <b>{id}</b>
                <span className="band" style={{ color: band === 'low' ? undefined : tone(band) }}>
                  {BAND_TEXT[band]}
                </span>
              </div>
              <div className="sub">{(PLATFORM_LABEL[id] ?? id).replace(/^\S+\s/, '')}</div>
              <div className={`top ${top ? '' : 'none'}`}>{top ? top.text : 'No contributors'}</div>
              <div className="ft">
                <span className={`dsh-lamp ga-${ga}`}>
                  <i />
                  {GA_TEXT[ga]}
                </span>
                {sd ? (
                  <span className={`dsh-sd l-${sd}`} title={SHUTDOWN_LABEL[sd as keyof typeof SHUTDOWN_LABEL] ?? sd}>
                    {sd}
                  </span>
                ) : (
                  <span className="dsh-online">{r ? (r.online ? 'online' : 'offline') : ''}</span>
                )}
                <svg className="sp" viewBox="0 0 100 18" preserveAspectRatio="none">
                  {history.length > 1 && <polyline points={spark[id]} vectorEffect="non-scaling-stroke" />}
                </svg>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ================================================================= top issues

function GoButtons({ tag }: { tag?: string }) {
  const ok = !!tag && !!pickOf(tag)
  return (
    <>
      <button disabled={!ok} onClick={() => tag && showIn3D(tag)} title={ok ? `Select ${tag} in 3D` : 'Not a plant item'} data-act="show3d">
        Show in 3D
      </button>
      <button disabled={!ok} onClick={() => tag && walkToTag(tag)} title={ok ? `Walk to ${tag}` : 'Not a plant item'} data-act="walkto">
        Walk to
      </button>
    </>
  )
}

function IssueRow({ c, i }: { c: RiskContributor; i: number }) {
  const sev = c.points >= 30 ? 'crit' : c.points >= 15 ? 'high' : c.points >= 6 ? 'mod' : ''
  return (
    <tr className={`dsh-issue ${sev}`} data-issue={c.id}>
      <td className="rk mono dim">{i + 1}</td>
      <td>
        <span className={`dsh-chip c-${c.category}`} title={RISK_CATEGORY_LABEL[c.category]}>
          {CAT_SHORT[c.category]}
        </span>
      </td>
      <td className="mono dim">{c.platform}</td>
      <td className="wrap txt">
        {c.text}
        {c.tag && (
          <span className="tg">
            {' '}
            · <TagLink tag={c.tag} />
          </span>
        )}
      </td>
      <td className="pts">
        <span className="bar">
          <i style={{ width: `${Math.min(100, (c.points / 60) * 100)}%` }} />
        </span>
        <b className="mono">+{Math.round(c.points)}</b>
      </td>
      <td className="act">
        <GoButtons tag={c.tag} />
      </td>
    </tr>
  )
}

function TopIssues({ plat, onClear }: { plat: PlatformId | null; onClear: () => void }) {
  const now = useRisk((s) => s.now)
  const list = useMemo(() => {
    const all = now?.contributors ?? EMPTY_ARR
    return (plat ? all.filter((c) => c.platform === plat) : all).slice(0, 8)
  }, [now, plat])
  const total = now ? (plat ? (now.platforms[plat]?.contributors.length ?? 0) : now.contributors.length) : 0
  return (
    <Box
      title={plat ? `Top issues: ${plat}` : 'Top issues: field'}
      className="dsh-issues"
      right={
        <>
          <span className="dim mono">
            {list.length} of {total}
          </span>
          {plat && (
            <button className="dsh-mini" onClick={onClear}>
              All platforms
            </button>
          )}
        </>
      }
    >
      {list.length === 0 ? (
        <div className="dsh-empty">
          <b>No risk contributors{plat ? ` on ${plat}` : ''}.</b> Process margins, fire &amp; gas, barriers, permits and people are all normal.
        </div>
      ) : (
        <table className="h-tbl dsh-itbl" data-dash="issues">
          <tbody>
            {list.map((c, i) => (
              <IssueRow key={c.id} c={c} i={i} />
            ))}
          </tbody>
        </table>
      )}
    </Box>
  )
}

// ================================================================= shutdowns & barriers

function Barriers() {
  const shutdowns = useS((s) => s.shutdowns) ?? EMPTY_ARR
  const inhibits = useS((s) => s.inhibits) ?? EMPTY_OBJ
  const detectors = useS((s) => s.detectors) ?? EMPTY_OBJ
  const valves = useS((s) => s.valves) ?? EMPTY_OBJ
  const permits = useMaint((s) => s?.permits) ?? EMPTY_OBJ
  const cranes = useCranes((s) => s?.cranes) ?? EMPTY_OBJ
  const inh = useMemo(() => Object.entries(inhibits as Record<string, boolean>).filter(([, on]) => on).map(([t]) => t), [inhibits])
  const faults = useMemo(() => Object.entries(detectors as Record<string, DetectorSim>).filter(([, d]) => d?.state === 'fault').map(([t]) => t), [detectors])
  const stuck = useMemo(() => Object.entries(valves as Record<string, { fault?: string }>).filter(([, v]) => v?.fault === 'stuck').map(([t]) => t), [valves])
  const issued = useMemo(() => Object.values(permits as Record<string, { id: string; tag: string; type: string; status: string }>).filter((p) => p?.status === 'issued'), [permits])
  const susp = useMemo(() => Object.values(cranes as Record<string, { tag: string; state: string; reason: string | null }>).filter((c) => c?.state === 'suspended'), [cranes])
  const sds = useMemo(() => [...shutdowns].sort((a, b) => b.at - a.at), [shutdowns])
  const barrierCount = inh.length + faults.length + stuck.length

  return (
    <Box title="Shutdowns & barriers" className="dsh-bar" right={<span className={`dim mono ${sds.length || barrierCount ? 'dsh-warn' : ''}`}>{sds.length + barrierCount ? `${sds.length} SD · ${barrierCount} impaired` : 'all healthy'}</span>}>
      <div className="dsh-sec">Latched shutdowns</div>
      {sds.length === 0 ? (
        <div className="dsh-none">None latched</div>
      ) : (
        <ul className="dsh-list">
          {sds.slice(0, 5).map((sd) => (
            <li key={sd.id}>
              <span className={`dsh-sd l-${sd.level}`}>{sd.level}</span>
              <span className="mono dim">{sd.platform}</span>
              <span className="t" title={sd.cause}>
                {sd.cause}
              </span>
              <span className="mono dim">{sd.resetAt !== undefined ? 'reset' : fmtClock(sd.at, false)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="dsh-sec">F&amp;G overrides &amp; faults</div>
      {barrierCount === 0 ? (
        <div className="dsh-none">No inhibits, no detector faults, no stuck valves</div>
      ) : (
        <div className="dsh-tags">
          {inh.map((t) => (
            <span key={`i${t}`} className="dsh-tag inh" title="Inhibited: excluded from voting">
              INH <TagLink tag={t} />
            </span>
          ))}
          {faults.map((t) => (
            <span key={`f${t}`} className="dsh-tag flt" title="Detector fault">
              FLT <TagLink tag={t} />
            </span>
          ))}
          {stuck.map((t) => (
            <span key={`s${t}`} className="dsh-tag stk" title="Valve stuck: position discrepancy">
              STK <TagLink tag={t} />
            </span>
          ))}
        </div>
      )}
      <div className="dsh-sec">Live work &amp; lifting</div>
      {issued.length === 0 && susp.length === 0 ? (
        <div className="dsh-none">No permits issued, no suspended loads</div>
      ) : (
        <div className="dsh-tags">
          {issued.map((p) => (
            <span key={p.id} className={`dsh-tag ${p.type === 'hot' || p.type === 'confined' ? 'hot' : ''}`} title={`Permit ${p.id}`}>
              {p.type === 'hot' ? 'HOT' : p.type === 'confined' ? 'CSE' : p.type.slice(0, 4).toUpperCase()} <TagLink tag={p.tag} />
            </span>
          ))}
          {susp.map((c) => (
            <span key={c.tag} className="dsh-tag stk" title={c.reason ?? 'Load suspended'}>
              LOAD <TagLink tag={c.tag} />
            </span>
          ))}
        </div>
      )}
    </Box>
  )
}

// ================================================================= live sensors

type Filter = 'all' | 'abn' | 'proc' | 'fg'
interface Tile {
  inst: Instrument
  host?: string
  hist: number[]
  v: number | undefined
  /** 0 normal · 1 hi/lo (or detector low / fault) · 2 hiHi/loLo (detector high) */
  sev: 0 | 1 | 2
  why?: string
  inh?: boolean
  fg: boolean
  lo: number
  hi: number
}

function parseRange(r: string): [number, number] | null {
  const m = /(-?\d+(?:\.\d+)?)\s*(?:–|—|-|to|…|\.\.)\s*(-?\d+(?:\.\d+)?)/.exec(r ?? '')
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  return b > a ? [a, b] : null
}

function hostOf(plant: Plant, inst: Instrument): string | undefined {
  if ('equipment' in inst.on) return inst.on.equipment
  const tag = inst.on.line
  const l = plant.lines.find((x) => x.tag === tag)
  if (!l) return tag
  const ends = [l.to, l.from].filter((e) => 'equipment' in e).map((e) => (e as { equipment: string }).equipment)
  return ends[0] ?? tag
}

function classify(inst: Instrument, v: number | undefined, det: DetectorSim | undefined): Pick<Tile, 'sev' | 'why' | 'inh'> {
  if (det) {
    if (det.state === 'inhibited') return { sev: 0, inh: true, why: 'inhibited' }
    if (det.state === 'high') return { sev: 2, why: 'high' }
    if (det.state === 'low') return { sev: 1, why: 'low' }
    if (det.state === 'fault') return { sev: 1, why: 'fault' }
  }
  const a = inst.alarms
  if (v === undefined || !a) return { sev: 0 }
  if (a.hiHi !== undefined && v >= a.hiHi) return { sev: 2, why: 'HH' }
  if (a.loLo !== undefined && v <= a.loLo) return { sev: 2, why: 'LL' }
  if (a.hi !== undefined && v >= a.hi) return { sev: 1, why: 'H' }
  if (a.lo !== undefined && v <= a.lo) return { sev: 1, why: 'L' }
  return { sev: 0 }
}

function useTick(ms: number) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => x + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return n
}

const SensorTile = memo(function SensorTile({ s }: { s: Tile }) {
  const { inst, v, hist, sev } = s
  const a = inst.alarms ?? {}
  const W = 140
  // sparkline scale: the data, padded; limit lines drawn only if they fall inside
  let lo = Math.min(...hist)
  let hi = Math.max(...hist)
  if (!Number.isFinite(lo)) {
    lo = s.lo
    hi = s.hi
  }
  const pad = Math.max((hi - lo) * 0.25, Math.abs(inst.nominal) * 0.01, 0.02)
  lo -= pad
  hi += pad
  const yOf = (x: number) => 26 - ((x - lo) / (hi - lo || 1)) * 26
  const limits = (['hiHi', 'hi', 'lo', 'loLo'] as const).filter((k) => a[k] !== undefined && a[k]! > lo && a[k]! < hi)
  // analog bar
  const span = s.hi - s.lo || 1
  const xOf = (x: number) => Math.max(0, Math.min(1, (x - s.lo) / span)) * 100
  const dec = Math.abs(inst.nominal) >= 100 ? 0 : Math.abs(inst.nominal) >= 10 ? 1 : 2
  return (
    <div className={`dsh-tile s${sev} ${s.inh ? 'inh' : ''}`} data-sensor={inst.tag}>
      <div className="hd">
        <span className="tg mono" title={`${inst.type} ${inst.tag} · range ${inst.range || '-'}`}>
          {inst.tag}
        </span>
        {s.why && <span className="why">{s.why}</span>}
        <span className="grow" />
        {s.host && s.host !== inst.tag && (
          <span className="host">
            <TagLink tag={s.host} />
          </span>
        )}
      </div>
      <div className="mid">
        <span className="v mono">
          {v === undefined ? '-' : fmt(v, dec)}
          <small>{inst.unit}</small>
        </span>
        <svg viewBox={`0 0 ${W} 26`} preserveAspectRatio="none" className="sp">
          {limits.map((k) => (
            <line key={k} x1="0" x2={W} y1={yOf(a[k]!)} y2={yOf(a[k]!)} className={`lim ${k === 'hiHi' || k === 'loLo' ? 'hh' : ''}`} vectorEffect="non-scaling-stroke" />
          ))}
          {hist.length > 1 && <polyline points={linePts(hist, W, 26, lo, hi)} vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
      <div className="ab" title={`${fmt(s.lo, dec)} … ${fmt(s.hi, dec)} ${inst.unit}`}>
        {a.lo !== undefined && a.hi !== undefined && <i className="nz" style={{ left: `${xOf(a.lo)}%`, width: `${xOf(a.hi) - xOf(a.lo)}%` }} />}
        {(['loLo', 'lo', 'hi', 'hiHi'] as const).map((k) => (a[k] !== undefined ? <i key={k} className={`lm ${k === 'hiHi' || k === 'loLo' ? 'hh' : ''}`} style={{ left: `${xOf(a[k]!)}%` }} /> : null))}
        {v !== undefined && <b style={{ left: `${xOf(v)}%` }} />}
      </div>
    </div>
  )
})

function Sensors() {
  const plant = usePlant()
  const tick = useTick(1000)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const base = useMemo(
    () =>
      plant.instruments
        .filter((i) => typeof i.nominal === 'number' && Number.isFinite(i.nominal))
        .map((inst) => {
          const r = parseRange(inst.range)
          const a = inst.alarms ?? {}
          const fg = FG_TYPES.has(inst.type)
          const lim = [a.loLo, a.lo, a.hi, a.hiHi, inst.nominal].filter((x): x is number => typeof x === 'number')
          let lo = r?.[0] ?? Math.min(0, ...lim)
          let hi = r?.[1] ?? Math.max(...lim.map((x) => x * 1.5), inst.nominal * 2, 1)
          if (!(hi > lo)) [lo, hi] = [inst.nominal - 1, inst.nominal + 1]
          return { inst, host: hostOf(plant, inst), fg, lo, hi }
        }),
    [plant],
  )

  const { tiles, counts } = useMemo(() => {
    void tick
    const dets = (useS.getState().detectors ?? EMPTY_OBJ) as Record<string, DetectorSim>
    const all: Tile[] = base.map((b) => {
      const hist = instrumentHistory(b.inst.tag, 30)
      const v = hist.length ? hist[hist.length - 1] : undefined
      return { ...b, hist, v, ...classify(b.inst, v, b.fg ? dets[b.inst.tag] : undefined) }
    })
    const counts = { all: 0, abn: 0, proc: 0, fg: 0 }
    for (const t of all) {
      if (!t.fg) counts.proc++
      else counts.fg++
      if (t.sev > 0) counts.abn++
    }
    counts.all = counts.proc
    const needle = q.trim().toLowerCase()
    const list = all.filter((t) => {
      if (filter === 'fg' ? !t.fg : filter === 'abn' ? t.sev === 0 : t.fg) return false
      if (!needle) return true
      return `${t.inst.tag} ${t.host ?? ''} ${t.inst.unit} ${t.inst.type}`.toLowerCase().includes(needle)
    })
    list.sort((a, b) => b.sev - a.sev)
    return { tiles: list, counts }
  }, [base, tick, filter, q])

  const shown = tiles.slice(0, 60)
  const chips: [Filter, string, number][] = [
    ['all', 'All', counts.all],
    ['abn', 'Abnormal', counts.abn],
    ['proc', 'Process', counts.proc],
    ['fg', 'F&G', counts.fg],
  ]
  return (
    <Box
      title="Live sensors"
      className="dsh-sensors"
      right={
        <div className="dsh-filt">
          {chips.map(([k, l, n]) => (
            <button key={k} className={`${filter === k ? 'on' : ''} ${k === 'abn' && n > 0 ? 'abn' : ''}`} onClick={() => setFilter(k)} data-filter={k}>
              {l} <span className="mono">{n}</span>
            </button>
          ))}
          <input type="text" placeholder="Search tag, equipment, unit…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="dim mono">{tiles.length > 60 ? `60 of ${tiles.length}` : tiles.length}</span>
        </div>
      }
    >
      {shown.length === 0 ? (
        <div className="dsh-empty">{filter === 'abn' ? 'No instrument outside its alarm limits.' : 'No matching instruments.'}</div>
      ) : (
        <div className="dsh-tiles">
          {shown.map((t) => (
            <SensorTile key={t.inst.tag} s={t} />
          ))}
        </div>
      )}
    </Box>
  )
}

// ================================================================= events

function Events() {
  const events = useS((s) => s.events) ?? EMPTY_ARR
  const list = useMemo(() => events.slice(0, 8), [events])
  return (
    <Box title="Recent events" className="dsh-events">
      {list.length === 0 ? (
        <div className="dsh-none">No events yet this session.</div>
      ) : (
        <ul className="dsh-ev">
          {list.map((e) => (
            <li key={e.id} className={`lv-${e.level}`}>
              <span className="mono dim">{fmtClock(e.t, false)}</span>
              <i />
              <span className="t">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}
