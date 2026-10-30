/**
 * Crane cab HUD (plan 05): what the operator sees on the cab display while sitting in a crane.
 * Slew / boom / radius / hook, the load chart (rated capacity at this radius), wind vs limit, the
 * interlocks (wind, gas, GA, ESD / APS, engine, slew sector, boom rest), a slew dial with the view
 * direction, the key legend and Exit. Polls the crane store at 4 Hz (the crane is driven at frame rate
 * by scene/CraneCab.tsx, so a store subscription alone would miss the motion between ticks).
 */
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useSim } from '../state/sim'
import { SHUTDOWN_RANK, type SimState } from '../sim/types'
import { CRANE_LIMITS, boomOnRest, hazards, ratedCapacity, useCranes, windNow, type CraneRun } from '../sim/cranes'
import { CRANE_BY_TAG, craneDims, radiusAt, type CraneSite } from '../model/cranes'
import { CAB_VIEW_LABEL, CAB_VIEWS, cabLook, useCab } from '../scene/CraneCab'
import './cranecab.css'

const DEG = 180 / Math.PI

export function CraneCabHud() {
  const tag = useStore((s) => s.craneCab)
  const hmi = useStore((s) => s.hmi)
  const walk = useStore((s) => s.walk)
  const site = tag ? CRANE_BY_TAG.get(tag) : undefined
  if (!tag || !site || hmi || walk) return null
  return <Hud site={site} />
}

function Hud({ site }: { site: CraneSite }) {
  const [, setN] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setN((n) => (n + 1) % 1e6), 250)
    return () => clearInterval(iv)
  }, [])
  const refusal = useCab((s) => s.refusal)
  const view = useCab((s) => s.view)
  const setView = useCab((s) => s.setView)
  const full = useCab((s) => s.full)
  const setCraneCab = useStore((s) => s.setCraneCab)

  const cs = useCranes.getState()
  const r = cs.cranes[site.tag]
  if (!r) return null
  const mine = cs.manual === site.tag
  const sim = useSim.getState() as Partial<SimState>
  const paused = (sim.speed ?? 1) <= 0
  const h = hazards(site, sim)
  const wind = windNow().speed
  const windLim = r.cargo === 'personnel' ? CRANE_LIMITS.windPersonnel : CRANE_LIMITS.windCargo
  const d = craneDims(site.spec)
  const rated = ratedCapacity(site, r.radius)
  const lmi = rated > 0 ? (100 * r.load) / rated : 0
  const bearing = (((r.slew * DEG + 90) % 360) + 360) % 360
  const onRest = boomOnRest(site, r.luff)
  const atLimit = r.slew <= site.slew[0] + 0.004 ? 'min' : r.slew >= site.slew[1] - 0.004 ? 'max' : null
  const cmd = cs.cmd
  const live = mine && r.engine && r.state !== 'suspended' && !paused

  // state chip
  let chip: { text: string; cls: string }
  if (!r.engine) chip = { text: 'Engine stopped', cls: 'trip' }
  else if (r.state === 'suspended') chip = { text: `Suspended`, cls: 'warn' }
  else if (!mine) chip = { text: 'Look only — schedule has control', cls: 'info' }
  else if (paused) chip = { text: 'Manual · sim paused', cls: 'info' }
  else
    chip = {
      text: cmd.slew || cmd.luff || cmd.hoist ? 'Manual · moving' : 'Manual · ready',
      cls: 'ok',
    }

  // the one line that tells the operator what to do next
  let note: { text: string; cls: string } | null = null
  if (refusal) note = { text: `${refusal} (retrying)`, cls: 'warn' }
  else if (!r.engine) note = { text: r.reason ?? 'Engine shut down by F&G', cls: 'trip' }
  else if (r.state === 'suspended') note = { text: `Controls locked: ${r.reason ?? 'interlock'}`, cls: 'warn' }
  else if (paused)
    note = {
      text: 'Simulation paused — the crane does not move until the clock runs',
      cls: 'info',
    }
  else if (mine && onRest && cmd.slew)
    note = {
      text: 'Boom is on its rest: raise it (W) before slewing',
      cls: 'info',
    }
  else if (mine && atLimit && cmd.slew)
    note = {
      text: `Slew sector limit (${atLimit === 'min' ? 'left' : 'right'} stop)`,
      cls: 'info',
    }
  else if (mine && onRest)
    note = {
      text: 'Boom on its rest — W / ↑ to luff it up off the rest',
      cls: 'info',
    }

  const restart = () => {
    const why = useCranes.getState().restartEngine(site.tag)
    useCab.setState({ refusal: why })
  }

  return (
    <div className="cab-hud" aria-label={`Crane cab ${site.tag}`}>
      <div className="cab-top">
        <span className="cab-tag mono">{site.tag}</span>
        <span className="cab-name">{site.name}</span>
        <span className={`cab-chip ${chip.cls}`}>{chip.text}</span>
        <span className="cab-sp" />
        <span className="cab-views" role="group" aria-label="View">
          {CAB_VIEWS.map((v) => (
            <button key={v} className={v === view ? 'on' : ''} onClick={(e) => (e.currentTarget.blur(), setView(v))} title={`${CAB_VIEW_LABEL[v]} (V cycles)`}>
              {CAB_VIEW_LABEL[v]}
            </button>
          ))}
        </span>
        <button className="cab-min" onClick={(e) => (e.currentTarget.blur(), useCab.setState({ full: !full }))} title={full ? 'Fold the panel away to look around (H)' : 'Show the crane panel (H)'}>
          {full ? 'Hide' : 'Panel'}
        </button>
        <button className="cab-exit" onClick={() => setCraneCab(null)} title="Leave the cab (Esc)">
          Exit cab
        </button>
      </div>

      {full && (
        <div className="cab-body">
          <SlewDial site={site} run={r} />

          <div className="cab-col">
            <div className="cab-gauges">
              <Gauge label="Slew" value={`${bearing.toFixed(0)}°`} sub="bearing" axis={cmd.slew} />
              <Gauge label="Boom" value={`${(r.luff * DEG).toFixed(1)}°`} sub={onRest ? 'on rest' : `${(d.luffMin * DEG).toFixed(0)}–${(d.luffMax * DEG).toFixed(0)}°`} axis={cmd.luff} />
              <Gauge label="Radius" value={`${r.radius.toFixed(1)} m`} sub={`max ${radiusAt(d, d.luffMin).toFixed(0)} m`} />
              <Gauge label="Hook" value={`${r.hook.toFixed(1)} m`} sub="above deck" axis={cmd.hoist} />
              <div className={`cab-g ${wind > windLim ? 'bad' : wind > windLim - 3 ? 'warn' : ''}`}>
                <div className="cab-gl">Wind</div>
                <div className="cab-gv mono">
                  {wind.toFixed(1)} <small>/ {windLim} m/s</small>
                </div>
                <div className="cab-bar">
                  <i
                    style={{
                      width: `${Math.min(100, (100 * wind) / (windLim * 1.25))}%`,
                    }}
                  />
                  <b style={{ left: `${100 / 1.25}%` }} />
                </div>
              </div>
            </div>

            <LoadChart site={site} radius={r.radius} load={r.load} rated={rated} lmi={lmi} />
          </div>

          <div className="cab-col cab-locks">
            <div className="cab-gl">Interlocks</div>
            <Lock label="Wind" bad={wind > windLim} text={wind > windLim ? `> ${windLim} m/s` : 'OK'} />
            <Lock label="Gas" bad={h.gas !== 'normal'} text={h.gas === 'normal' ? 'Clear' : h.gas === 'confirmed' ? 'Confirmed' : 'Alarm'} />
            <Lock label="GA" bad={h.ga !== 'normal'} text={h.ga === 'normal' ? 'Clear' : String(h.ga)} />
            <Lock label="ESD / APS" bad={!!h.shutdown && SHUTDOWN_RANK[h.shutdown] >= SHUTDOWN_RANK.ESD1} text={h.shutdown ?? 'None'} />
            <Lock label="Engine" bad={!r.engine} text={r.engine ? 'Running' : 'Stopped'} />
            <Lock label="Sector" bad={false} warn={!!atLimit} text={atLimit ? `At ${atLimit === 'min' ? 'left' : 'right'} stop` : 'In range'} />
            {!r.engine && (
              <button className="cab-btn" onClick={restart} title="Restart the diesel engine from the crane panel (refused while gas / APS persists)">
                Restart engine
              </button>
            )}
          </div>
        </div>
      )}
      {note && <div className={`cab-note ${note.cls}`}>{note.text}</div>}
      {full && (
        <div className="cab-keys">
          <span>
            <kbd>A</kbd>
            <kbd>D</kbd> slew
          </span>
          <span>
            <kbd>W</kbd>
            <kbd>S</kbd> boom up / down
          </span>
          <span>
            <kbd>R</kbd>
            <kbd>F</kbd> hook up / down
          </span>
          <span>
            <kbd>Shift</kbd> fine
          </span>
          <span>drag look · wheel zoom</span>
          <span>
            <kbd>C</kbd> centre
          </span>
          <span>
            <kbd>V</kbd> view
          </span>
          <span>
            <kbd>Esc</kbd> leave
          </span>
          <span>
            <kbd>H</kbd> panel
          </span>
          {!live && mine && <span className="dim">controls inactive</span>}
        </div>
      )}
    </div>
  )
}

function Gauge({ label, value, sub, axis }: { label: string; value: string; sub: string; axis?: number }) {
  return (
    <div className={`cab-g ${axis ? 'moving' : ''}`}>
      <div className="cab-gl">
        {label}
        {axis ? <span className="cab-arrow">{axis > 0 ? '▲' : '▼'}</span> : null}
      </div>
      <div className="cab-gv mono">{value}</div>
      <div className="cab-gs">{sub}</div>
    </div>
  )
}

function Lock({ label, bad, warn, text }: { label: string; bad: boolean; warn?: boolean; text: string }) {
  return (
    <div className={`cab-lock ${bad ? 'bad' : warn ? 'warn' : ''}`}>
      <span className="cab-dot" />
      <span>{label}</span>
      <span className="mono">{text}</span>
    </div>
  )
}

/** load chart: rated capacity vs radius, the current radius, and the hook load */
function LoadChart({ site, radius, load, rated, lmi }: { site: CraneSite; radius: number; load: number; rated: number; lmi: number }) {
  const d = craneDims(site.spec)
  const rMin = radiusAt(d, d.luffMax)
  const rMax = radiusAt(d, d.luffMin)
  const W = 560
  const H = 60
  const x = (rr: number) => 4 + ((rr - 0) / rMax) * (W - 8)
  const y = (t: number) => H - 4 - (t / site.swl) * (H - 12)
  let path = ''
  for (let i = 0; i <= 40; i++) {
    const rr = rMin + ((rMax - rMin) * i) / 40
    path += `${i ? 'L' : 'M'}${x(rr).toFixed(1)},${y(ratedCapacity(site, rr)).toFixed(1)}`
  }
  const cls = lmi >= 100 ? 'bad' : lmi >= 90 ? 'warn' : ''
  return (
    <div className="cab-chart">
      <div className="cab-chart-head">
        <span className="cab-gl">Load chart</span>
        <span className="mono">
          rated <b>{rated.toFixed(1)} t</b> at {radius.toFixed(1)} m · hook load <b>{load.toFixed(1)} t</b> · SWL {site.swl} t
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Rated capacity against radius">
        <rect x={x(rMin)} y={4} width={x(rMax) - x(rMin)} height={H - 8} className="cab-chart-band" />
        <path d={path} className="cab-chart-curve" />
        <line x1={x(radius)} x2={x(radius)} y1={4} y2={H - 4} className="cab-chart-now" />
        <circle cx={x(radius)} cy={y(rated)} r={3} className="cab-chart-rated" />
        <circle cx={x(radius)} cy={y(load)} r={3.5} className={`cab-chart-load ${cls}`} />
        <text x={W - 6} y={H - 7} textAnchor="end" className="cab-chart-ax">
          radius →
        </text>
        <text x={6} y={12} className="cab-chart-ax">
          {site.swl} t
        </text>
      </svg>
      <div className={`cab-lmi ${cls}`}>
        <span className="cab-gl">LMI</span>
        <div className="cab-bar wide">
          <i style={{ width: `${Math.min(100, lmi / 1.1)}%` }} />
          <b style={{ left: `${90 / 1.1}%` }} />
          <b className="hi" style={{ left: `${100 / 1.1}%` }} />
        </div>
        <span className="mono">{lmi.toFixed(0)} %</span>
      </div>
    </div>
  )
}

/** plan dial (north up): allowed slew sector, the boom, the park heading and where you are looking */
function SlewDial({ site, run }: { site: CraneSite; run: CraneRun }) {
  const S = 96
  const c = S / 2
  const R = 38
  const pt = (a: number, rr: number) => `${(c + rr * Math.cos(a)).toFixed(1)},${(c + rr * Math.sin(a)).toFixed(1)}`
  const [a0, a1] = site.slew
  const large = a1 - a0 > Math.PI ? 1 : 0
  const look = run.slew - cabLook.yaw
  const aspect = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 1.6
  const half = Math.atan(Math.tan(cabLook.fov / 2 / DEG) * aspect) // half the horizontal field of view
  return (
    <svg className="cab-dial" viewBox={`0 0 ${S} ${S}`} width={S} height={S} aria-label="Slew dial">
      <circle cx={c} cy={c} r={R} className="cab-dial-ring" />
      <path d={`M${pt(a0, R)} A${R},${R} 0 ${large} 1 ${pt(a1, R)}`} className="cab-dial-sector" />
      <path d={`M${c},${c} L${pt(look - half, R - 2)} A${R - 2},${R - 2} 0 0 1 ${pt(look + half, R - 2)} Z`} className="cab-dial-view" />
      <line x1={c} y1={c} x2={c + (R + 4) * Math.cos(site.park)} y2={c + (R + 4) * Math.sin(site.park)} className="cab-dial-park" />
      <line x1={c} y1={c} x2={c + (R - 3) * Math.cos(run.slew)} y2={c + (R - 3) * Math.sin(run.slew)} className="cab-dial-boom" />
      <circle cx={c} cy={c} r={3} className="cab-dial-hub" />
      <text x={c} y={8} textAnchor="middle" className="cab-dial-n">
        N
      </text>
    </svg>
  )
}
