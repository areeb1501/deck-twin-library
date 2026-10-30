/**
 * Cranes & weather (console section): wind direction / speed and sea state (the knobs that drive the
 * crane limits, the plumes, the windsocks, the gas dispersion and the ocean), every platform crane's
 * state, current lift, load, radius and load-moment utilisation, why it is suspended, and an engine
 * restart after an F&G shutdown; the cold vent stacks' flow; the crane event log.
 * Export `CranesPanel` (mounted by the console). State: sim/cranes.ts (useCranes) + the sim knobs.
 */
import { useState } from 'react'
import { CRANES, CARGO } from '../../model/cranes'
import { VENTS } from '../../model/vents'
import { CRANE_LIMITS, ratedCapacity, useCranes, ventFlow, ventVelocity, type CraneRun } from '../../sim/cranes'
import { fmtClock, PLATFORM_LABEL, type Knobs } from '../../sim/types'
import { Box, Kpi, Msg, TagLink } from './common'
import { fmt, sim, useS } from './simApi'

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
const beaufort = (u: number) => [0.5, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7].findIndex((x) => u < x)

const PRESETS: { label: string; wind: Knobs['wind']; hs: number }[] = [
  { label: 'Calm', wind: { from: 240, speed: 1.2 }, hs: 0.6 },
  { label: 'Normal', wind: { from: 240, speed: 7 }, hs: 1.5 },
  { label: 'Fresh (near limits)', wind: { from: 250, speed: 14 }, hs: 2.8 },
  { label: 'Gale', wind: { from: 260, speed: 24 }, hs: 5.5 },
]

function setWind(w: Knobs['wind']) {
  sim().setKnob?.('wind', w)
}
function setHs(h: number) {
  sim().setKnob?.('seaState', h)
}

function StatePill({ r }: { r: CraneRun }) {
  const st = !r.engine ? 'tripped' : r.state === 'suspended' ? 'standby' : r.state === 'idle' ? 'stopped' : 'running'
  return (
    <span className={`rs ${st}`} title={r.reason ?? r.activity}>
      <i />
      {!r.engine ? 'engine off' : r.state}
    </span>
  )
}

export function CranesPanel() {
  const knobs = useS((s) => s.knobs) as Partial<Knobs> | undefined
  const t = useS((s) => s.t) ?? 0
  const cranes = useCranes((s) => s.cranes)
  const events = useCranes((s) => s.events)
  const operating = useCranes((s) => s.operating)
  const [msg, setMsg] = useState<string | null>(null)
  const wind = knobs?.wind ?? { from: 240, speed: 7 }
  const hs = knobs?.seaState ?? 1.5
  const ready = !!knobs?.wind
  const nSusp = CRANES.filter((c) => cranes[c.tag]?.state === 'suspended').length
  const nLift = CRANES.filter((c) => cranes[c.tag]?.state === 'lifting').length
  void t

  return (
    <div className="h-grid" data-panel="cranes">
      <Box title="Weather" right={<span className="dim">wind blows FROM the bearing · drives cranes, plumes, gas dispersion, sea</span>}>
        <div className="h-kpis">
          <Kpi label="Wind" value={`${fmt(wind.speed, 1)}`} unit={`m/s · Bft ${beaufort(wind.speed) < 0 ? 12 : beaufort(wind.speed)}`} abn={wind.speed > CRANE_LIMITS.windPersonnel} bad={wind.speed > CRANE_LIMITS.windCargo} />
          <Kpi label="From" value={`${Math.round(wind.from)}°`} unit={compass(wind.from)} />
          <Kpi label="Significant wave height Hs" value={fmt(hs, 1)} unit="m" bad={hs > CRANE_LIMITS.hsBoat} />
          <Kpi label="Cranes lifting / suspended" value={`${nLift} / ${nSusp}`} abn={nSusp > 0} />
        </div>
        <div className="h-row" style={{ marginTop: 8, gap: 16 }}>
          <label className="h-row" style={{ gap: 6 }}>
            <span className="dim">From</span>
            <input type="range" min={0} max={355} step={5} value={wind.from} disabled={!ready} onChange={(e) => setWind({ ...wind, from: +e.target.value })} data-knob="windFrom" />
            <span className="mono">{String(Math.round(wind.from)).padStart(3, '0')}°</span>
          </label>
          <label className="h-row" style={{ gap: 6 }}>
            <span className="dim">Speed</span>
            <input type="range" min={0} max={35} step={0.5} value={wind.speed} disabled={!ready} onChange={(e) => setWind({ ...wind, speed: +e.target.value })} data-knob="windSpeed" />
            <span className="mono">{fmt(wind.speed, 1)} m/s</span>
          </label>
          <label className="h-row" style={{ gap: 6 }}>
            <span className="dim">Sea state Hs</span>
            <input type="range" min={0} max={8} step={0.1} value={hs} disabled={knobs?.seaState === undefined} onChange={(e) => setHs(+e.target.value)} data-knob="seaState" />
            <span className="mono">{fmt(hs, 1)} m</span>
          </label>
        </div>
        <div className="h-row" style={{ marginTop: 6 }}>
          <span className="dim">Presets</span>
          {PRESETS.map((p) => (
            <button key={p.label} disabled={!ready} onClick={() => (setWind(p.wind), setHs(p.hs))}>
              {p.label}
            </button>
          ))}
          <span className="dim" style={{ marginLeft: 'auto' }}>
            Limits: wind {CRANE_LIMITS.windCargo} m/s cargo, {CRANE_LIMITS.windPersonnel} m/s personnel · Hs {CRANE_LIMITS.hsBoat} m supply-boat lifts
          </span>
        </div>
      </Box>

      <Box
        title="Platform cranes"
        right={
          <label className="h-row" style={{ gap: 6 }}>
            <input type="checkbox" checked={operating} onChange={(e) => useCranes.getState().setOperating(e.target.checked)} data-knob="craneOps" />
            <span>Lift schedules running</span>
          </label>
        }
      >
        <table className="h-tbl" data-tbl="cranes">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Platform</th>
              <th>State</th>
              <th>Doing</th>
              <th className="num">Load t</th>
              <th className="num">Radius m</th>
              <th className="num">LMI %</th>
              <th className="num">Lifts</th>
              <th>Suspended because</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {CRANES.map((c) => {
              const r = cranes[c.tag]
              if (!r) return null
              const util = (100 * r.load) / ratedCapacity(c, r.radius)
              return (
                <tr key={c.tag} data-crane={c.tag} data-state={r.engine ? r.state : 'engineOff'}>
                  <td>
                    <TagLink tag={c.tag} />
                  </td>
                  <td className="dim" title={PLATFORM_LABEL[c.platform]}>
                    {c.platform}
                  </td>
                  <td>
                    <StatePill r={r} />
                  </td>
                  <td className="wrap">
                    {r.activity}
                    {r.cargo && <span className="dim"> · {CARGO[r.cargo].label}</span>}
                  </td>
                  <td className="num">{fmt(r.load, 1)}</td>
                  <td className="num">{fmt(r.radius, 1)}</td>
                  <td className="num" style={util > 90 ? { color: '#ffd7a0' } : undefined}>
                    {fmt(util, 0)}
                  </td>
                  <td className="num">{r.lifts}</td>
                  <td className="wrap" style={r.reason ? { color: r.engine ? '#ffd7a0' : '#ffb8b2' } : undefined}>
                    {r.reason ?? '-'}
                  </td>
                  <td className="act">
                    {!r.engine && (
                      <button className="warn" onClick={() => setMsg(useCranes.getState().restartEngine(c.tag) ?? `✓ ${c.tag} engine restarted`)}>
                        Restart engine
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Msg text={msg} />
        <p className="h-note" style={{ marginTop: 6 }}>
          Lifting stops on wind above the limit, Hs above {CRANE_LIMITS.hsBoat} m (boat lifts), a gas alarm, a general alarm or ESD1 on the platform: the load is landed and the boom laid on its
          rest; work resumes {CRANE_LIMITS.resumeAfter} s after it clears. The diesel engines are ignition sources: confirmed gas (or APS) shuts them down at once, restart them here when the
          platform is clear.
        </p>
      </Box>

      <Box title="Cold vent stacks">
        <table className="h-tbl" data-tbl="vents">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Service</th>
              <th className="num">Flow MMscfd</th>
              <th className="num">Exit velocity m/s</th>
              <th>Plume towards</th>
            </tr>
          </thead>
          <tbody>
            {VENTS.map((v) => {
              const q = ventFlow(v.tag)
              return (
                <tr key={v.tag}>
                  <td>
                    <TagLink tag={v.tag} />
                  </td>
                  <td className="wrap dim">{v.service}</td>
                  <td className="num">{fmt(q, 2)}</td>
                  <td className="num">{fmt(ventVelocity(v, q), 1)}</td>
                  <td>
                    {compass(wind.from + 180)}
                    {wind.speed < 2 && <span style={{ color: '#ffd7a0' }}> · calm: dense gas falls back to the deck</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Box>

      <Box title="Crane log">
        {events.length ? (
          <table className="h-tbl">
            <tbody>
              {events.slice(0, 14).map((e, i) => (
                <tr key={`${e.t}-${i}`}>
                  <td className="mono dim" style={{ width: 90 }}>
                    {fmtClock(e.t, false)}
                  </td>
                  <td style={e.level === 'trip' ? { color: '#ffb8b2' } : e.level === 'warn' ? { color: '#ffd7a0' } : undefined}>{e.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-empty">No crane events yet</div>
        )}
      </Box>
    </div>
  )
}

export default CranesPanel
