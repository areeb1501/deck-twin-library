/**
 * Risk & what-if console page (plan 03).
 *
 *   1. Risk now   — field gauge, stacked bar per platform by risk category, every contributor with
 *                   Show in 3D / Walk to
 *   2. Risk trend — field + per-platform score, availability on the right axis, band thresholds
 *   3. What-if    — pick a training scenario → predicted consequence chain (unmitigated), KPI tiles,
 *                   barriers; Run live (same start path as the Scenarios page, at 5×) and watch it here
 *
 * Reads useRisk (safety/risk.ts, plan 02) — `now` is null until the engine has scored a tick.
 */
import { Fragment, useMemo, useState, type MouseEvent } from 'react'
import { useRisk } from '../../safety/risk'
import { BAND_COLOR, RISK_CATEGORY_LABEL, bandOf, type RiskCategory, type RiskContributor, type RiskHistoryPoint, type RiskSnapshot } from '../../safety/types'
import { predictConsequence, WORST_LABEL, type ChainStep, type Consequence, type WorstLevel } from '../../safety/whatif'
import { SCENARIOS, unavailable, useScenario, type LiveView, type Scenario } from '../../sim/scenarios'
import { fmtEl } from '../../sim/scen/helpers'
import { CE_BY_ID } from '../../sim/causeEffect'
import { fmtClock, type PlatformId, type Shutdown } from '../../sim/types'
import { usePlant } from '../../state/plantStore'
import { useStore } from '../../state/store'
import { walkToTag } from '../walkTo'
import { Box, Msg, TagLink } from './common'
import { pickOf, showIn3D } from './nav'
import { EMPTY_ARR, PLATFORMS, fmt, useS } from './simApi'
import './risk.css'

const CATS: RiskCategory[] = ['process', 'fireGas', 'shutdown', 'alarms', 'machinery', 'barriers', 'work', 'weather', 'people']
/** muted categorical fills (ISA-101: bright colour stays reserved for abnormal states) */
const CAT_COLOR: Record<RiskCategory, string> = {
  process: '#7f97ad',
  fireGas: '#b26a5e',
  shutdown: '#b38a4f',
  alarms: '#a59a5a',
  machinery: '#6d9a86',
  barriers: '#8a7db0',
  work: '#978c7c',
  weather: '#6a9cb0',
  people: '#ad7c97',
}
const PLAT_COLOR: Partial<Record<PlatformId, string>> = { Alpha: '#9fb6cc', 'WHP-N': '#c9a86a', RP: '#8fc0a0', WI: '#78b2cc', LQ: '#b89bc8' }
const LVL_COLOR: Record<WorstLevel, string> = { alarm: '#e6d03c', USD: '#d6b23a', PSD: '#f39c1f', ESD2: '#e8702a', ESD1: '#e4372c', APS: '#ff5a4a' }

export function RiskPage() {
  const now = useRisk((s) => s.now)
  const history = useRisk((s) => s.history) ?? EMPTY_ARR
  const live = useScenario((s) => s.live)
  const [pick, setPick] = useState<string>(() => live?.id ?? (SCENARIOS.some((s) => s.id === 'fire-hp-separator') ? 'fire-hp-separator' : (SCENARIOS[0]?.id ?? '')))
  const sc = SCENARIOS.find((s) => s.id === pick) ?? null
  const mppRaw = useS((s) => s.result?.mpp)
  const mppKey = typeof mppRaw === 'number' ? Math.round(mppRaw / 500) * 500 : 0
  const cons = useMemo(() => (sc ? predictConsequence(sc, mppKey || undefined) : null), [sc, mppKey])

  return (
    <div className="h-grid rk" data-risk-page>
      {live && <LiveStrip live={live} now={now} />}
      <div className="rk-top">
        <RiskNow now={now} />
        <Box title="Risk trend" right={<TrendLegend />}>
          <TrendChart history={history} peak={cons && sc ? { value: cons.riskPeak, label: `what-if peak · ${sc.title}` }: null} />
        </Box>
      </div>
      <Contributors now={now} />
      <WhatIf pick={pick} setPick={setPick} sc={sc} cons={cons} live={live} />
    </div>
  )
}

// ================================================================= live strip

function LiveStrip({ live, now }: { live: LiveView; now: RiskSnapshot | null }) {
  const shutdowns = useS((s) => s.shutdowns) ?? (EMPTY_ARR as Shutdown[])
  const avail = useS((s) => s.kpis?.availability)
  const active = useMemo(() => shutdowns.filter((x) => !x.resetAt), [shutdowns])
  const risk = now?.field
  const band = typeof risk === 'number' ? bandOf(risk) : null
  const pct = Math.min(100, (live.el / Math.max(1, live.max)) * 100)
  return (
    <div className="rk-live" data-risk-live>
      <span className="rk-live-dot" />
      <b>LIVE</b>
      <span className="rk-live-title">{live.title}</span>
      <span className="rk-live-cell">
        <span className="dim">Elapsed</span>
        <span className="mono">
          {fmtEl(live.el)} <span className="dim">/ {fmtEl(live.max)}</span>
        </span>
        <span className="rk-live-bar">
          <i style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span className="rk-live-cell">
        <span className="dim">Risk</span>
        <span className="mono rk-big" style={{ color: band && band !== 'low' ? BAND_COLOR[band] : undefined }}>
          {typeof risk === 'number' ? Math.round(risk) : '-'}
        </span>
        {band && <span className="dim">{band}</span>}
      </span>
      <span className="rk-live-cell">
        <span className="dim">Availability</span>
        <span className="mono rk-big">{fmt(now?.availability ?? avail, 1)}</span>
        <span className="dim">%</span>
      </span>
      <span className="rk-live-cell rk-live-sd">
        <span className="dim">Shutdowns</span>
        {active.length === 0 ? (
          <span className="dim">none</span>
        ) : (
          active.map((x) => (
            <span key={x.id} className={`rk-sd ${x.level}`} title={x.cause}>
              {x.level} {x.platform}
            </span>
          ))
        )}
      </span>
      <span className="grow" />
      <button onClick={() => useStore.getState().setHmi('scenarios')}>Scenario panel →</button>
    </div>
  )
}

// ================================================================= risk now

function RiskNow({ now }: { now: RiskSnapshot | null }) {
  const rows = useMemo(() => {
    if (!now) return []
    return PLATFORMS.map((p) => {
      const pr = now.platforms[p]
      const sums: Partial<Record<RiskCategory, number>> = {}
      let total = 0
      for (const c of pr?.contributors ?? []) {
        sums[c.category] = (sums[c.category] ?? 0) + c.points
        total += c.points
      }
      return { p, score: pr?.score ?? 0, sums, total, n: pr?.contributors.length ?? 0 }
    })
  }, [now])
  const scale = Math.max(100, ...rows.map((r) => r.total))
  const usedCats = useMemo(() => CATS.filter((c) => rows.some((r) => (r.sums[c] ?? 0) > 0)), [rows])

  return (
    <Box title="Field risk" className="rk-now">
      {!now ? (
        <div className="rk-empty">
          <Gauge score={null} />
          <p className="h-note">Waiting for the first risk score.</p>
        </div>
      ) : (
        <div className="rk-now-body">
          <div className="rk-gauge-col">
            <Gauge score={now.field} />
            <div className="rk-gauge-sub">
              <span className="dim">Availability</span> <span className="mono">{fmt(now.availability, 1)} %</span>
              <span className={`rk-prod ${now.producing ? '' : 'off'}`}>{now.producing ? 'producing' : 'not producing'}</span>
            </div>
          </div>
          <div className="rk-bars">
            {rows.map((r) => {
              const band = bandOf(r.score)
              return (
                <div className="rk-bar-row" key={r.p}>
                  <span className="rk-bar-p">
                    {r.p}
                    {now.shutdowns[r.p] && <span className="rk-sd mini">{now.shutdowns[r.p]}</span>}
                  </span>
                  <div className="rk-bar" title={`${r.p}: ${Math.round(r.score)} (${band}) · ${r.n} contributors`}>
                    {[25, 50, 75].map((th) => (
                      <i key={th} className="rk-bar-th" style={{ left: `${(th / scale) * 100}%` }} />
                    ))}
                    {CATS.map((c) => {
                      const v = r.sums[c] ?? 0
                      if (v <= 0) return null
                      return <span key={c} className="rk-seg" style={{ width: `${(v / scale) * 100}%`, background: CAT_COLOR[c] }} title={`${RISK_CATEGORY_LABEL[c]}: ${Math.round(v)} pts`} />
                    })}
                    <i className="rk-bar-mark" style={{ left: `${(Math.min(100, r.score) / scale) * 100}%`, background: BAND_COLOR[band] }} />
                  </div>
                  <span className="rk-bar-n mono" style={{ color: band === 'low' ? undefined : BAND_COLOR[band] }}>
                    {Math.round(r.score)}
                  </span>
                </div>
              )
            })}
            <div className="rk-cats">
              {usedCats.length === 0 ? (
                <span className="dim">No risk contributors: every platform is in its normal envelope.</span>
              ) : (
                usedCats.map((c) => (
                  <span key={c} className="rk-cat">
                    <i style={{ background: CAT_COLOR[c] }} />
                    {RISK_CATEGORY_LABEL[c]}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Box>
  )
}

/** semicircle gauge 0 … 100 with muted band arcs; the value arc takes the band colour */
function Gauge({ score }: { score: number | null }) {
  const R = 52
  const cx = 64
  const cy = 62
  const pt = (v: number) => {
    const a = Math.PI * (1 - v / 100)
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)]
  }
  const arc = (a: number, b: number) => {
    const [x0, y0] = pt(a)
    const [x1, y1] = pt(b)
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }
  const v = score === null ? null : Math.max(0, Math.min(100, score))
  const band = v === null ? null : bandOf(v)
  const [nx, ny] = pt(v ?? 0)
  return (
    <svg className="rk-gauge" viewBox="0 0 128 78" role="img" aria-label={v === null ? 'Field risk: no data' : `Field risk ${Math.round(v)} of 100, ${band}`}>
      {(
        [
          [0, 25, 'low'],
          [25, 50, 'moderate'],
          [50, 75, 'high'],
          [75, 100, 'critical'],
        ] as const
      ).map(([a, b, bd]) => (
        <path key={bd} d={arc(a + 0.6, b - 0.6)} stroke={BAND_COLOR[bd]} strokeOpacity={0.22} strokeWidth={9} fill="none" />
      ))}
      {v !== null && v > 0.5 && <path d={arc(0, v)} stroke={band === 'low' ? '#b9bdc1' : BAND_COLOR[band!]} strokeWidth={9} fill="none" />}
      {v !== null && <circle cx={nx} cy={ny} r={5.5} fill="#1d1f22" stroke={band === 'low' ? '#d7d9db' : BAND_COLOR[band!]} strokeWidth={2} />}
      <text x={cx} y={cy - 6} textAnchor="middle" className="rk-gauge-n" fill={band && band !== 'low' ? BAND_COLOR[band] : '#d7d9db'}>
        {v === null ? '-' : Math.round(v)}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="rk-gauge-l">
        {v === null ? 'FIELD RISK' : `FIELD · ${band!.toUpperCase()}`}
      </text>
    </svg>
  )
}

// ================================================================= contributors

function Contributors({ now }: { now: RiskSnapshot | null }) {
  const [all, setAll] = useState(false)
  const list = (now?.contributors ?? EMPTY_ARR) as RiskContributor[]
  const shown = all ? list : list.slice(0, 12)
  const maxPts = Math.max(1, ...list.map((c) => c.points))
  return (
    <Box
      title={`Risk contributors${list.length ? `: ${list.length}` : ''}`}
      right={
        list.length > 12 ? (
          <button onClick={() => setAll((a) => !a)} style={{ padding: '1px 8px' }}>
            {all ? 'Top 12' : `Show all ${list.length}`}
          </button>
        ) : null
      }
    >
      {list.length === 0 ? (
        <div className="h-empty">{now ? 'Nothing is adding risk right now.' : 'Waiting for the risk engine.'}</div>
      ) : (
        <table className="h-tbl rk-tbl">
          <thead>
            <tr>
              <th style={{ width: 120 }}>Points</th>
              <th>Platform</th>
              <th>Category</th>
              <th>Item</th>
              <th>Why</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const plantItem = !!(c.tag && pickOf(c.tag))
              return (
                <tr key={c.id}>
                  <td>
                    <span className="rk-pts">
                      <i style={{ width: `${(c.points / maxPts) * 100}%`, background: CAT_COLOR[c.category] }} />
                      <b className="mono">{fmt(c.points, 0)}</b>
                    </span>
                  </td>
                  <td>{c.platform}</td>
                  <td>
                    <span className="rk-cat">
                      <i style={{ background: CAT_COLOR[c.category] }} />
                      {RISK_CATEGORY_LABEL[c.category]}
                    </span>
                  </td>
                  <td>{c.tag ? <TagLink tag={c.tag} /> : <span className="dim">-</span>}</td>
                  <td className="wrap">{c.text}</td>
                  <td className="act">
                    {plantItem && (
                      <>
                        <button onClick={() => walkToTag(c.tag!)} title="Walk to it (first-person)">
                          Walk to
                        </button>
                        <button onClick={() => showIn3D(c.tag!)} title="Select and frame it in 3D">
                          Show in 3D
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Box>
  )
}

// ================================================================= trend

function TrendLegend() {
  return (
    <span className="rk-legend">
      <span>
        <i className="ln field" />
        Field
      </span>
      {PLATFORMS.map((p) => (
        <span key={p}>
          <i className="ln" style={{ background: PLAT_COLOR[p] }} />
          {p}
        </span>
      ))}
      <span>
        <i className="ln avail" />
        Availability %
      </span>
    </span>
  )
}

const W = 760
const H = 230
const PAD = { l: 30, r: 40, t: 12, b: 22 }

function TrendChart({ history, peak }: { history: RiskHistoryPoint[]; peak: { value: number; label: string } | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const g = useMemo(() => {
    if (history.length < 2) return null
    // sorted copy: an engine reset can leave a stale point ahead of t = 0
    const pts = history.slice().sort((a, b) => a.t - b.t)
    const t0 = pts[0].t
    const t1 = pts[pts.length - 1].t
    const span = Math.max(1, t1 - t0)
    const iw = W - PAD.l - PAD.r
    const ih = H - PAD.t - PAD.b
    const X = (t: number) => PAD.l + ((t - t0) / span) * iw
    const Y = (v: number) => PAD.t + (1 - Math.max(0, Math.min(100, v)) / 100) * ih
    const line = (get: (h: RiskHistoryPoint) => number | undefined) => {
      let d = ''
      let pen = false
      for (const h of pts) {
        const v = get(h)
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          pen = false
          continue
        }
        d += `${pen ? 'L' : 'M'}${X(h.t).toFixed(1)} ${Y(v).toFixed(1)}`
        pen = true
      }
      return d
    }
    const field = line((h) => h.field)
    const fieldArea = `${field}L${X(t1).toFixed(1)} ${Y(0)}L${X(t0).toFixed(1)} ${Y(0)}Z`
    const plats = PLATFORMS.map((p) => ({ p, d: line((h) => h.p[p]) })).filter((x) => x.d)
    const avail = line((h) => h.availability)
    // ~6 time ticks
    const ticks: number[] = []
    const step = niceStep(span / 6)
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) ticks.push(t)
    return { X, Y, field, fieldArea, plats, avail, ticks, t0, t1, iw, pts }
  }, [history])

  if (!g) {
    return (
      <div className="rk-trend-empty">
        <svg viewBox={`0 0 ${W} ${H}`} className="rk-trend">
          <BandBack Y={(v) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b)} />
        </svg>
        <span>{history.length === 0 ? 'No risk history yet.' : 'Collecting the first points…'}</span>
      </div>
    )
  }

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    if (x < PAD.l || x > W - PAD.r) return setHover(null)
    const t = g.t0 + ((x - PAD.l) / g.iw) * (g.t1 - g.t0)
    let best = 0
    for (let i = 1; i < g.pts.length; i++) if (Math.abs(g.pts[i].t - t) < Math.abs(g.pts[best].t - t)) best = i
    setHover(best)
  }
  const hp = hover !== null ? (g.pts[hover] ?? null) : null
  const last = g.pts[g.pts.length - 1]

  return (
    <div className="rk-trend-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="rk-trend" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <BandBack Y={g.Y} />
        {/* time axis */}
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={g.X(t)} x2={g.X(t)} y1={PAD.t} y2={H - PAD.b} className="rk-grid" />
            <text x={g.X(t)} y={H - 6} textAnchor="middle" className="rk-ax">
              {fmtClock(t, false)}
            </text>
          </g>
        ))}
        {/* right axis: availability */}
        {[0, 50, 100].map((v) => (
          <text key={v} x={W - PAD.r + 6} y={g.Y(v) + 3} className="rk-ax avail">
            {v}%
          </text>
        ))}
        {peak && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.Y(peak.value)} y2={g.Y(peak.value)} className="rk-peak" />
            <text x={W - PAD.r - 4} y={g.Y(peak.value) - 4} textAnchor="end" className="rk-peak-l">
              {peak.label} ({peak.value})
            </text>
          </g>
        )}
        <path d={g.avail} className="rk-l-avail" />
        {g.plats.map((x) => (
          <path key={x.p} d={x.d} stroke={PLAT_COLOR[x.p]} className="rk-l-plat" />
        ))}
        <path d={g.fieldArea} className="rk-a-field" />
        <path d={g.field} className="rk-l-field" />
        <circle cx={g.X(last.t)} cy={g.Y(last.field)} r={3.5} className="rk-dot" fill={BAND_COLOR[bandOf(last.field)]} />
        {hp && (
          <g>
            <line x1={g.X(hp.t)} x2={g.X(hp.t)} y1={PAD.t} y2={H - PAD.b} className="rk-cross" />
            <circle cx={g.X(hp.t)} cy={g.Y(hp.field)} r={3.5} fill={BAND_COLOR[bandOf(hp.field)]} />
          </g>
        )}
      </svg>
      {hp && (
        <div className="rk-tip" style={{ left: `${(g.X(hp.t) / W) * 100}%` }}>
          <div className="mono dim">{fmtClock(hp.t)}</div>
          <div>
            <b>Field</b> <span className="mono" style={{ color: BAND_COLOR[bandOf(hp.field)] }}>{Math.round(hp.field)}</span>
          </div>
          {PLATFORMS.map((p) =>
            typeof hp.p[p] === 'number' ? (
              <div key={p}>
                <i style={{ background: PLAT_COLOR[p] }} />
                {p} <span className="mono">{Math.round(hp.p[p]!)}</span>
              </div>
            ) : null,
          )}
          <div className="dim">
            Availability <span className="mono">{fmt(hp.availability, 1)} %</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** faint band fills + dashed thresholds at 25 / 50 / 75 + left axis labels */
function BandBack({ Y }: { Y: (v: number) => number }) {
  const bands = [
    [0, 25, 'low'],
    [25, 50, 'moderate'],
    [50, 75, 'high'],
    [75, 100, 'critical'],
  ] as const
  return (
    <g>
      {bands.map(([a, b, bd]) => (
        <rect key={bd} x={PAD.l} width={W - PAD.l - PAD.r} y={Y(b)} height={Y(a) - Y(b)} fill={BAND_COLOR[bd]} opacity={bd === 'low' ? 0 : 0.045} />
      ))}
      <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} className="rk-frame" />
      {[25, 50, 75].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} stroke={BAND_COLOR[bandOf(v)]} className="rk-th" />
          <text x={PAD.l - 5} y={Y(v) + 3} textAnchor="end" className="rk-ax">
            {v}
          </text>
        </g>
      ))}
      <text x={PAD.l - 5} y={Y(100) + 3} textAnchor="end" className="rk-ax">
        100
      </text>
      <text x={PAD.l - 5} y={Y(0) + 3} textAnchor="end" className="rk-ax">
        0
      </text>
    </g>
  )
}

function niceStep(raw: number) {
  const steps = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400]
  return steps.find((s) => s >= raw) ?? 86400
}

// ================================================================= what-if

function WhatIf({ pick, setPick, sc, cons, live }: { pick: string; setPick: (id: string) => void; sc: Scenario | null; cons: Consequence | null; live: LiveView | null }) {
  const preds = useMemo(() => Object.fromEntries(SCENARIOS.map((s) => [s.id, predictConsequence(s).worstShutdown])), [])
  return (
    <Box title="What-if analysis" className="rk-whatif">
      <div className="rk-wi">
        <div className="rk-list" role="listbox" aria-label="Scenarios">
          {SCENARIOS.map((s) => {
            const w = preds[s.id] as WorstLevel
            return (
              <button key={s.id} className={`rk-card ${s.id === pick ? 'sel' : ''} ${live?.id === s.id ? 'live' : ''}`} onClick={() => setPick(s.id)} role="option" aria-selected={s.id === pick} data-wi={s.id}>
                <span>{s.title}</span>
                <span className="rk-lvl" style={{ borderColor: LVL_COLOR[w], color: LVL_COLOR[w] }}>
                  {w === 'alarm' ? 'Alarm' : w}
                </span>
              </button>
            )
          })}
        </div>
        {sc && cons ? <Detail sc={sc} cons={cons} live={live} /> : <div className="h-empty">Select a scenario.</div>}
      </div>
    </Box>
  )
}

type DetailTab = 'sequence' | 'barriers' | 'recovery'

function Detail({ sc, cons, live }: { sc: Scenario; cons: Consequence; live: LiveView | null }) {
  const plant = usePlant()
  const na = unavailable(sc, plant)
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('sequence')
  const isLive = live?.id === sc.id
  const run = () => {
    const r = useScenario.getState().start(sc.id, 5)
    setMsg(r ?? `✓ ${sc.title} running at 5×`)
  }
  const brief = () => {
    useScenario.getState().setView({ kind: 'brief', id: sc.id })
    useStore.getState().setHmi('scenarios')
  }
  const w = cons.worstShutdown
  const band = bandOf(cons.riskPeak)

  return (
    <div className="rk-detail" data-wi-detail={sc.id}>
      <div className="rk-d-head">
        <div>
          <h2 className="rk-d-title">{sc.title}</h2>
          <p className="rk-d-sum">{sc.summary}</p>
        </div>
        <div className="rk-d-act">
          <button onClick={brief}>Briefing</button>
          <button className="on" onClick={run} disabled={!!na || isLive} data-wi-run={sc.id} title={na ?? undefined}>
            {isLive ? 'Running' : 'Run at 5×'}
          </button>
        </div>
      </div>
      {na && <div className="h-msg">Not available in this plant: {na}</div>}
      <Msg text={msg} />

      <div className="rk-kpis">
        <div className={`rk-kpi ${w === 'ESD1' || w === 'ESD2' || w === 'APS' ? 'bad' : w === 'PSD' ? 'abn' : ''}`}>
          <div className="l">Worst shutdown</div>
          <div className="n" style={{ color: LVL_COLOR[w] }}>
            {w === 'alarm' ? 'Alarm' : w}
          </div>
          <div className="s">{WORST_LABEL[w]}</div>
        </div>
        <div className={`rk-kpi ${cons.lost.some((p) => p === 'Alpha') ? 'abn' : ''}`}>
          <div className="l">Platforms lost</div>
          <div className="n">{cons.lost.length}</div>
          <div className="s">{cons.lost.join(' · ') || 'None'}</div>
        </div>
        <div className="rk-kpi">
          <div className="l">Deferred if unmanaged</div>
          <div className="n">
            {fmt(cons.deferredBoe.unmitigated)}
            <small>boe</small>
          </div>
          <div className="s">{fmt(cons.deferredBoe.ideal)} boe with a good response</div>
        </div>
        <div className="rk-kpi" style={{ borderColor: band === 'low' ? undefined : BAND_COLOR[band] }}>
          <div className="l">Risk peak</div>
          <div className="n" style={{ color: BAND_COLOR[band] }}>
            {cons.riskPeak}
          </div>
          <div className="s">{band}</div>
        </div>
      </div>

      <div className="seg2 rk-tabs" role="tablist" aria-label="What-if detail">
        {(['sequence', 'barriers', 'recovery'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-wi-tab={k}>
            {k === 'sequence' ? 'Sequence' : k === 'barriers' ? `Barriers (${cons.barriers.length})` : 'Recovery'}
          </button>
        ))}
      </div>
      {tab === 'sequence' && <Chain chain={cons.chain} />}
      {tab === 'barriers' && (
        <ol className="rk-barriers">
          {cons.barriers.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ol>
      )}
      {tab === 'recovery' && (
        <div className="rk-recovery">
          <p>{cons.recovery}</p>
          <p className="h-note">Ideal response: {sc.ideal.note}.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- chain timeline

type Group = { kind: 'step'; step: ChainStep } | { kind: 'effects'; ce: string; sec: number; t: string; items: ChainStep[]; unm: boolean }

function groupChain(chain: ChainStep[]): Group[] {
  const out: Group[] = []
  for (const c of chain) {
    const prev = out[out.length - 1]
    if (c.kind === 'effect' && c.ce) {
      if (prev && prev.kind === 'effects' && prev.ce === c.ce) prev.items.push(c)
      else out.push({ kind: 'effects', ce: c.ce, sec: c.sec, t: c.t, items: [c], unm: !!c.ifUnmitigated })
    } else out.push({ kind: 'step', step: c })
  }
  return out
}

function gapText(s: number) {
  if (s >= 3600) return `${(s / 3600).toFixed(s % 3600 ? 1 : 0)} h later`
  if (s >= 60) return `${Math.round(s / 60)} min later`
  return `${Math.round(s)} s later`
}

function Chain({ chain }: { chain: ChainStep[] }) {
  const rows = useMemo(() => {
    const groups = groupChain(chain)
    const secOf = (g: Group) => (g.kind === 'step' ? g.step.sec : g.sec)
    const unmOf = (g: Group) => (g.kind === 'step' ? !!g.step.ifUnmitigated && g.step.kind !== 'recovery' : g.unm)
    const firstUnm = groups.findIndex(unmOf)
    return groups.map((g, i) => ({ g, unm: unmOf(g), divider: i === firstUnm, gap: i > 0 ? secOf(g) - secOf(groups[i - 1]) : 0 }))
  }, [chain])
  return (
    <ol className="rk-chain">
      {rows.map(({ g, unm, divider, gap }, i) => {
        const level = g.kind === 'step' ? g.step.level : g.items[0].level
        return (
          <Fragment key={i}>
            {divider && (
              <li className="rk-c-div">
                <span>if nobody intervenes</span>
              </li>
            )}
            {gap >= 90 && !divider && (
              <li className="rk-c-gap">
                <span>{gapText(gap)}</span>
              </li>
            )}
            <li className={`rk-c ${level} ${unm ? 'unm' : ''} ${g.kind === 'effects' ? 'fx' : g.step.kind}`}>
              <span className="rk-c-t mono">{g.kind === 'step' ? g.step.t : g.t}</span>
              <span className="rk-c-node">
                <Node level={level} kind={g.kind === 'effects' ? 'effect' : g.step.kind} />
              </span>
              <span className="rk-c-body">
                {g.kind === 'step' ? (
                  <span className="rk-c-text">{g.step.text}</span>
                ) : (
                  <EffectGroup ce={g.ce} items={g.items} />
                )}
              </span>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}

function EffectGroup({ ce, items }: { ce: string; items: ChainStep[] }) {
  const row = CE_BY_ID[ce]
  return (
    <details className="rk-fx">
      <summary>
        {row?.cause ?? ce} <span className="dim">· {items.length} effects</span>
      </summary>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it.text}</li>
        ))}
      </ul>
    </details>
  )
}

/** ISA-style node: shape + colour — circle event/info, diamond alarm, square trip, hollow for effects */
function Node({ level, kind }: { level: ChainStep['level']; kind: ChainStep['kind'] }) {
  const col = level === 'trip' ? '#e4372c' : level === 'warn' ? '#f39c1f' : '#9aa0a6'
  if (kind === 'recovery')
    return (
      <svg viewBox="0 0 14 14" width="14" height="14" className="rk-node">
        <circle cx="7" cy="7" r="5" fill="none" stroke="#6fbf8a" strokeWidth="1.8" />
        <path d="M4.5 7.2 L6.3 9 L9.6 5.2" fill="none" stroke="#6fbf8a" strokeWidth="1.6" />
      </svg>
    )
  if (kind === 'trip')
    return (
      <svg viewBox="0 0 14 14" width="14" height="14" className="rk-node">
        <rect x="2" y="2" width="10" height="10" fill={col} />
      </svg>
    )
  if (kind === 'effect')
    return (
      <svg viewBox="0 0 14 14" width="14" height="14" className="rk-node">
        <rect x="3" y="3" width="8" height="8" fill="#24262a" stroke={col} strokeWidth="1.6" />
      </svg>
    )
  if (kind === 'alarm' || (level === 'warn' && kind !== 'event'))
    return (
      <svg viewBox="0 0 14 14" width="14" height="14" className="rk-node">
        <path d="M7 1 L13 7 L7 13 L1 7 Z" fill={col} />
      </svg>
    )
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" className="rk-node">
      <circle cx="7" cy="7" r="4.5" fill={col} />
    </svg>
  )
}
