/** Overview: what the field is doing right now — production, flare, power, PE, availability, alarms — per platform, and where the lost production went. */
import { LOSS_LABEL, fmtClock, type Kpis, type LossCategory, type PlatformId, type PlatformResult } from '../../sim/types'
import { EMPTY_ARR, PLATFORMS, fmt, useS } from './simApi'
import { Box, Kpi } from './common'

const CATS = Object.keys(LOSS_LABEL) as LossCategory[]

export function Overview() {
  const r = useS((s) => s.result)
  const k = useS((s) => s.kpis)
  const p = useS((s) => s.process)
  const avail = useS((s) => s.availability)
  const alarms = useS((s) => s.alarms) ?? EMPTY_ARR
  const events = useS((s) => s.events) ?? EMPTY_ARR
  const standing = alarms.filter((a) => a.active && a.state !== 'shelved').length
  const rate = k?.alarmRate
  const deferred = k && typeof k.potentialBoe === 'number' && typeof k.producedBoe === 'number' ? k.potentialBoe - k.producedBoe : undefined
  const grid = (r?.powerAvailable ?? 0) >= 999

  return (
    <div className="h-grid">
      <p className="h-note">
        <b>What the plant does.</b> Wells on Alpha and on the WHP-N wellhead platform flow to the production manifold. The HP separator V-1100 splits oil, gas and water;
        oil is degassed in the LP separator V-1300, cooled and pumped to the export pipeline by P-1500A/B. Gas is scrubbed and compressed by K-2200 to the gas export riser and
        feeds the fuel gas that drives the turbine generators GT-8100A/B. Produced water is treated and dumped overboard. Gas the plant cannot take goes to flare. The LQ
        platform holds the control room, the emergency generator and the accommodation.
      </p>

      <Box title="Field — now">
        <div className="h-kpis">
          <Kpi label="Oil export" value={fmt(r?.oilExport)} unit="bbl/d" />
          <Kpi label="Gas export" value={fmt(r?.gasExport, 1)} unit="MMscfd" />
          <Kpi label="Flare" value={fmt(r?.flare, 1)} unit="MMscfd" abn={(r?.flare ?? 0) > 3} bad={(r?.flare ?? 0) > 15} />
          <Kpi label="Produced water" value={fmt(r?.water)} unit="bbl/d" />
          <Kpi label="Power generated / available" value={r ? `${fmt(r.powerGenerated, 1)} / ${grid ? 'grid' : fmt(r.powerAvailable, 0)}` : '—'} unit="MW" abn={!!r && !grid && r.powerDemand > r.powerAvailable * 0.9} bad={!!r && r.powerGenerated <= 0} />
          <Kpi label="Production efficiency — now" value={fmt(r?.efficiency, 1)} unit="%" abn={(r?.efficiency ?? 100) < 95} bad={(r?.efficiency ?? 100) < 50} title="Actual over maximum production potential (boe), this instant" />
          <Kpi label="PE — last hour" value={fmt(k?.peHour, 1)} unit="%" abn={(k?.peHour ?? 100) < 95} />
          <Kpi label="PE — session" value={fmt(k?.pe, 1)} unit="%" abn={(k?.pe ?? 100) < 95} />
          <Kpi label="Availability" value={fmt(k?.availability ?? avail, 1)} unit="%" abn={(k?.availability ?? avail ?? 100) < 95} title="Share of sim time the field was up (no PSD / ESD / blackout)" />
          <Kpi label="Alarm rate" value={fmt(rate)} unit="/ 10 min" abn={(rate ?? 0) >= 5} bad={(rate ?? 0) >= 10} title="ISA-18.2: ≥ 10 alarms in 10 minutes is a flood" />
          <Kpi label="Standing alarms" value={String(standing)} />
          <Kpi label="Trips / shutdowns" value={k ? `${k.trips ?? 0} / ${k.shutdowns ?? 0}` : '—'} />
          <Kpi label="Deferred production" value={fmt(deferred)} unit="boe" abn={(deferred ?? 0) >= 1} />
          <Kpi label="Max. production potential" value={fmt(r?.mpp)} unit="boe/d" />
          <Kpi label="Actual production" value={fmt(r?.actual)} unit="boe/d" abn={!!r && r.actual < r.mpp * 0.95} />
        </div>
        {r?.constraints && r.constraints.length > 0 ? (
          <table className="h-tbl" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Active constraint</th>
                <th>Booked to</th>
                <th style={{ textAlign: 'right' }}>Lost boe/d</th>
              </tr>
            </thead>
            <tbody>
              {r.constraints.map((c) => (
                <tr key={c.id}>
                  <td className="wrap">{c.text}</td>
                  <td className="dim">{LOSS_LABEL[c.loss] ?? c.loss}</td>
                  <td className="num">{fmt(c.boe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : r?.constraint ? (
          <div className="h-msg">{r.constraint}</div>
        ) : null}
      </Box>

      <div className="h-plat">
        {PLATFORMS.map((id) => (
          <PlatformCard key={id} id={id} res={r?.platforms?.[id]} />
        ))}
      </div>

      <div className="h-grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
        <Box title="Production efficiency — where the potential went (session)" right={k ? <span className="mono dim">PE {fmt(k.pe, 1)} %</span> : null}>
          <Waterfall k={k} />
        </Box>
        <Box title="Process — key values">
          <div className="kv2">
            <span>HP separator V-1100 level</span>
            <span>{fmt(p?.hpLevel, 1)} %</span>
            <span>HP separator pressure</span>
            <span>{fmt(p?.hpPressure, 1)} barg</span>
            <span>LP separator V-1300 level</span>
            <span>{fmt(p?.lpLevel, 1)} %</span>
            <span>K-2200 surge margin / recycle</span>
            <span>
              {fmt(p?.surgeMargin, 1)} % / {fmt(p?.recycle, 0)} %
            </span>
            <span>Instrument air header</span>
            <span>{fmt(p?.iaPressure, 1)} barg</span>
            <span>Cooling medium supply</span>
            <span>{fmt(p?.cmTemp, 1)} °C</span>
            <span>Fuel gas header</span>
            <span>{fmt(p?.fuelGasPressure, 1)} barg</span>
            <span>Bus frequency</span>
            <span>{fmt(p?.busHz, 2)} Hz</span>
            <span>Emergency generator</span>
            <span>{p?.emergencyGen ?? '—'}</span>
            <span>Firewater ring main</span>
            <span>{fmt(p?.fwPressure, 1)} barg</span>
            <span>PSV relief / blowdown left</span>
            <span>
              {fmt(p?.relief, 1)} MMscfd / {fmt(p?.blowdownInventory, 2)} MMscf
            </span>
          </div>
        </Box>
      </div>

      <Box title="Recent events">
        {events.length === 0 ? (
          <div className="h-empty">No events — plant in normal operation.</div>
        ) : (
          <table className="h-tbl">
            <tbody>
              {events.slice(0, 10).map((e, i) => (
                <tr key={e.id ?? i}>
                  <td className="mono dim" style={{ width: 110 }}>
                    {fmtClock(e.t)}
                  </td>
                  <td style={{ color: e.level === 'trip' ? '#ffb8b2' : e.level === 'warn' ? '#ffd7a0' : undefined }}>{e.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
    </div>
  )
}

const NAMES: Record<string, string> = { Alpha: 'Alpha — production platform', 'WHP-N': 'WHP-N — wellhead platform', LQ: 'LQ — accommodation & CCR' }

function PlatformCard({ id, res }: { id: PlatformId; res: PlatformResult | undefined }) {
  const shutdowns = useS((s) => s.shutdowns) ?? EMPTY_ARR
  const latched = shutdowns.filter((x) => x.platform === id)
  const sd = res?.shutdown ?? latched[0]?.level ?? null
  const esd = sd === 'ESD1' || sd === 'ESD2' || sd === 'APS'
  return (
    <section className={`h-box ${esd ? 'esd' : sd ? 'sd' : ''}`}>
      <h3>
        <span>{NAMES[id] ?? id}</span>
      </h3>
      <div className="kv2">
        <span>Status</span>
        <span className={`state ${esd ? 'esd' : sd ? 'sd' : ''}`}>{!res ? '—' : sd ? `${sd} latched` : id === 'LQ' ? 'Normal' : res.online ? 'Producing' : 'Not producing'}</span>
        <span>General alarm</span>
        <span>{res?.ga ?? '—'}</span>
        {id !== 'LQ' && (
          <>
            <span>Oil</span>
            <span>{fmt(res?.oil)} bbl/d</span>
            <span>Gas</span>
            <span>{fmt(res?.gas, 1)} MMscfd</span>
            <span>Water</span>
            <span>{fmt(res?.water)} bbl/d</span>
          </>
        )}
      </div>
      {latched.map((x) => (
        <div key={x.id} className="h-msg">
          {x.level} — {x.cause} <span className="mono">({fmtClock(x.at)})</span>
          {x.resetAt !== undefined ? ' · reset, awaiting restart' : x.resettable ? ' · resettable' : ' · cause still present'}
        </div>
      ))}
    </section>
  )
}

/** potential → each loss category → produced, as a floating-bar waterfall */
function Waterfall({ k }: { k: Kpis | undefined }) {
  if (!k || typeof k.potentialBoe !== 'number' || !k.losses) return <div className="h-empty">Production-efficiency accounting starts with the engine.</div>
  const pot = Math.max(1e-6, k.potentialBoe)
  const steps = CATS.map((c) => ({ c, v: Math.max(0, k.losses[c] ?? 0) }))
  const W = 760
  const H = 230
  const L = 10
  const top = 14
  const bot = 150
  const n = steps.length + 2
  const bw = (W - L * 2) / n
  const y = (v: number) => bot - (v / pot) * (bot - top)
  // level before each loss step (cumulative)
  const before = steps.map((_, i) => pot - steps.slice(0, i).reduce((a, s) => a + s.v, 0))
  const big = Math.max(...steps.map((s) => s.v))
  return (
    <svg className="wf" viewBox={`0 0 ${W} ${H}`}>
      <line className="axis" x1={L} x2={W - L} y1={bot} y2={bot} />
      <rect className="pot" x={L + 4} width={bw - 8} y={y(pot)} height={bot - y(pot)} />
      <text className="v" x={L + bw / 2} y={y(pot) - 3} textAnchor="middle">
        {fmt(pot)}
      </text>
      <Label x={L + bw / 2} text="Potential" />
      {steps.map((s, i) => {
        const x = L + (i + 1) * bw
        const y0 = y(before[i])
        const y1 = y(before[i] - s.v)
        return (
          <g key={s.c}>
            <rect className={`loss ${s.v > 0 && s.v === big ? 'big' : ''}`} x={x + 4} width={bw - 8} y={y0} height={Math.max(0.8, y1 - y0)} />
            <text className="v" x={x + bw / 2} y={y1 + 11} textAnchor="middle">
              {s.v >= 0.5 ? `−${fmt(s.v)}` : '0'}
            </text>
            <Label x={x + bw / 2} text={SHORT[s.c]} title={LOSS_LABEL[s.c]} />
          </g>
        )
      })}
      <rect className="act" x={L + (n - 1) * bw + 4} width={bw - 8} y={y(k.producedBoe)} height={bot - y(k.producedBoe)} />
      <text className="v" x={L + (n - 0.5) * bw} y={y(k.producedBoe) - 3} textAnchor="middle">
        {fmt(k.producedBoe)}
      </text>
      <Label x={L + (n - 0.5) * bw} text="Produced" />
      <text x={L} y={H - 4}>
        boe this session · PE = produced / potential = {fmt(k.pe, 1)} %
      </text>
    </svg>
  )
}

const SHORT: Record<LossCategory, string> = {
  wells: 'Wells',
  reservoir: 'Reservoir\nsupport',
  oil: 'Oil\nsystem',
  gas: 'Gas &\nflaring',
  power: 'Power\ngen.',
  utilities: 'Utilities',
  controlSafety: 'Control &\nsafety',
  export: 'Export',
  planned: 'Planned',
}

function Label({ x, text, title }: { x: number; text: string; title?: string }) {
  const words = text.split('\n')
  return (
    <text x={x} y={166} textAnchor="middle">
      {title && <title>{title}</title>}
      {words.map((w, i) => (
        <tspan key={i} x={x} dy={i ? 12 : 0}>
          {w}
        </tspan>
      ))}
    </text>
  )
}
