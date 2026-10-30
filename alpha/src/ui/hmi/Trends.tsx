/** Trends: strip charts of the historian (`history`) on a sim-clock time axis. */
import { useMemo, useState } from 'react'
import { fmtClock, type HistoryPoint } from '../../sim/types'
import { EMPTY_ARR, fmt, useS } from './simApi'
import { Box } from './common'

type Key = Exclude<keyof HistoryPoint, 't'>
const SERIES: { k: Key; label: string; unit: string; d: number }[] = [
  { k: 'oil', label: 'Oil export', unit: 'bbl/d', d: 0 },
  { k: 'gas', label: 'Gas export', unit: 'MMscfd', d: 1 },
  { k: 'flare', label: 'Flare', unit: 'MMscfd', d: 1 },
  { k: 'power', label: 'Power generated', unit: 'MW', d: 1 },
  { k: 'eff', label: 'Production efficiency', unit: '%', d: 1 },
  { k: 'hpLevel', label: 'HP separator level', unit: '%', d: 1 },
  { k: 'hpPressure', label: 'HP separator pressure', unit: 'barg', d: 1 },
  { k: 'iaPressure', label: 'Instrument air header', unit: 'barg', d: 1 },
]
const WINDOWS: [number, string][] = [
  [600, '10 min'],
  [3600, '1 h'],
  [6 * 3600, '6 h'],
  [0, 'All'],
]

export function Trends() {
  const hist = (useS((s) => s.history) ?? EMPTY_ARR) as HistoryPoint[]
  const [on, setOn] = useState<Key[]>(['oil', 'gas', 'flare', 'eff', 'hpLevel', 'hpPressure'])
  const [win, setWin] = useState(3600)
  const tMax = hist.length ? hist[hist.length - 1].t : 0
  const tFirst = hist.length ? hist[0].t : 0
  // the window never starts before the session (no empty pre-06:00 axis)
  const t0 = win ? Math.max(tFirst, tMax - win) : tFirst
  const pts = useMemo(() => hist.filter((h) => h.t >= t0), [hist, t0])
  const toggle = (k: Key) => setOn((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]))
  return (
    <div className="h-grid">
      <div className="h-filters">
        <label>
          Window
          <span className="seg2">
            {WINDOWS.map(([w, l]) => (
              <button key={w} className={win === w ? 'on' : ''} onClick={() => setWin(w)}>
                {l}
              </button>
            ))}
          </span>
        </label>
        <label>
          Series
          <span className="seg2" style={{ flexWrap: 'wrap' }}>
            {SERIES.map((s) => (
              <button key={s.k} className={on.includes(s.k) ? 'on' : ''} onClick={() => toggle(s.k)}>
                {s.label}
              </button>
            ))}
          </span>
        </label>
      </div>
      {hist.length < 2 ? (
        <div className="h-placeholder">The historian has no data yet: trends fill as the simulation runs.</div>
      ) : (
        SERIES.filter((s) => on.includes(s.k)).map((s) => <Strip key={s.k} s={s} pts={pts} t0={t0} t1={tMax} />)
      )}
    </div>
  )
}

const W = 1500
const H = 150
const PL = 56
const PR = 8
const PT = 8
const PB = 18

function tickStep(span: number) {
  const steps = [30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 3 * 3600, 6 * 3600, 12 * 3600, 86400]
  return steps.find((s) => span / s <= 8) ?? 86400
}

function Strip({ s, pts, t0, t1 }: { s: (typeof SERIES)[number]; pts: HistoryPoint[]; t0: number; t1: number }) {
  const vals = pts.map((p) => p[s.k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const last = [...pts].reverse().find((p) => typeof p[s.k] === 'number')?.[s.k]
  if (!vals.length)
    return (
      <Box title={s.label}>
        <div className="h-empty">No {s.label.toLowerCase()} in the historian yet.</div>
      </Box>
    )
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (s.unit === '%' && s.k !== 'eff') {
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 100)
  }
  const pad = (hi - lo) * 0.08 || Math.max(1, Math.abs(hi) * 0.05)
  lo -= pad
  hi += pad
  const span = Math.max(1, t1 - t0)
  const x = (t: number) => PL + ((t - t0) / span) * (W - PL - PR)
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB)
  const d = pts
    .filter((p) => typeof p[s.k] === 'number')
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[s.k] as number).toFixed(1)}`)
    .join(' ')
  const step = tickStep(span)
  const ticks: number[] = []
  for (let t = Math.ceil((t0 + 6 * 3600) / step) * step - 6 * 3600; t <= t1; t += step) if (x(t) > PL + 20 && x(t) < W - PR - 24) ticks.push(t)
  const yt = [lo + pad, (lo + hi) / 2, hi - pad]
  return (
    <Box
      title={s.label}
      right={
        <span className="mono" style={{ color: '#e9eaeb', textTransform: 'none', letterSpacing: 0 }}>
          {fmt(last as number | undefined, s.d)} {s.unit}
          <span className="dim">
            {' '}
            · min {fmt(Math.min(...vals), s.d)} · max {fmt(Math.max(...vals), s.d)}
          </span>
        </span>
      }
    >
      <svg className="trend" viewBox={`0 0 ${W} ${H}`} data-trend={s.k}>
        {yt.map((v, i) => (
          <g key={i}>
            <line className="grid" x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} />
            <text x={PL - 4} y={y(v) + 3} textAnchor="end">
              {fmt(v, s.d)}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={x(t)} x2={x(t)} y1={PT} y2={H - PB} />
            <text x={x(t)} y={H - 5} textAnchor="middle">
              {step < 60 ? fmtClock(t, false) : fmtClock(t, false).slice(0, 5)}
            </text>
          </g>
        ))}
        <path d={d} />
      </svg>
    </Box>
  )
}
