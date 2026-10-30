/**
 * Operations: how the plant is producing, how efficient and available it is, what is constraining it,
 * and the knobs to turn — clock speed, well chokes, separator pressure, compressor speed, duty /
 * standby machines, turbines, drilling — with start / stop / trip / reset, shutdown reset & restart
 * and the event log. The full control-room console (alarms, cause & effect, F&G, instructor) is the HMI.
 * Everything here drives the simulation (state/sim.ts).
 */
import { useMemo, useState } from 'react'
import { usePlant } from '../state/plantStore'
import { useStore } from '../state/store'
import { isRunning, runState, useSim } from '../state/sim'
import { fmtClock, LOSS_LABEL, type LossCategory, type RunState } from '../sim/types'
import { goToMachine, LOCAL_REACH, nearMachine } from './fieldOps'

const fmt = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <svg className="ops-spark" />
  const max = Math.max(...data, 1e-6)
  const min = Math.min(...data, 0)
  const y = (v: number) => 30 - ((v - min) / (max - min || 1)) * 28
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * 200).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="ops-spark" viewBox="0 0 200 32" preserveAspectRatio="none">
      <path d={d} style={{ stroke: color }} />
    </svg>
  )
}

const DOT: Record<RunState, string> = { running: 'run', starting: 'stby', standby: 'stby', stopped: 'stop', tripped: 'trip' }

/** start / stop / trip / reset for one machine (shows why an action was refused) */
export function RunControl({ tag, compact }: { tag: string; compact?: boolean }) {
  useSim((s) => s.status[tag])
  useSim((s) => s.t)
  const m = useSim((s) => s.machines[tag])
  const [why, setWhy] = useState<string | null>(null)
  const st = runState(tag)
  const live = isRunning(tag)
  const sim = useSim.getState()
  const left = st === 'starting' && m?.startDoneAt !== undefined ? Math.max(0, m.startDoneAt - sim.t) : 0
  const label = st === 'running' && !live ? 'no power' : st === 'starting' ? `starting ${left >= 60 ? `${Math.ceil(left / 60)} min` : `${Math.ceil(left)} s`}` : st
  const act = (r: string | null) => {
    setWhy(r)
    if (r) setTimeout(() => setWhy(null), 6000)
  }
  return (
    <span className="run-ctl">
      <span className={`run-dot ${DOT[st]} ${st === 'running' && !live ? 'stop' : ''}`} title={m?.tripCause ?? label} />
      {!compact && <span className="muted small run-state">{label}</span>}
      {st === 'tripped' && m?.localReset ? (
        nearMachine(tag) ? (
          <button className="primary" onClick={() => act(sim.resetTrip(tag, { local: true }))} title={`Field operator resets the machinery protection (${m.tripCause})`}>
            Local reset
          </button>
        ) : (
          <button onClick={() => goToMachine(tag)} title={`Machinery-protection trip: reset at the machine (within ${LOCAL_REACH} m in the walkthrough)`}>
            Go to reset
          </button>
        )
      ) : st === 'tripped' ? (
        <button onClick={() => act(sim.resetTrip(tag))} title={m?.tripCause}>
          Reset
        </button>
      ) : st === 'running' || st === 'starting' ? (
        <>
          <button onClick={() => act(sim.stop(tag))}>Stop</button>
          <button className="danger" onClick={() => sim.trip(tag, 'manual trip')}>
            Trip
          </button>
        </>
      ) : (
        <button onClick={() => act(sim.start(tag))}>Start</button>
      )}
      {why && <span className="ops-why small">{why}</span>}
    </span>
  )
}

function Machine({ tag, label }: { tag: string; label?: string }) {
  const plant = usePlant()
  const m = useSim((s) => s.machines[tag])
  const e = plant.equipment.find((x) => x.tag === tag)
  if (!e) return null
  return (
    <div className="ops-row">
      <button
        className="link mono"
        onClick={() => {
          useStore.getState().select({ tag, kind: 'equipment' })
          useStore.getState().requestFocus(tag)
        }}
      >
        {tag}
      </button>
      <span className="muted small ell" title={m?.tripCause}>
        {runState(tag) === 'tripped' && m?.tripCause ? m.tripCause : (label ?? e.name)}
      </span>
      <RunControl tag={tag} />
    </div>
  )
}

const SPEEDS = [0, 1, 5, 20, 60]

export function OperationsPanel() {
  const plant = usePlant()
  const r = useSim((s) => s.result)
  const hist = useSim((s) => s.history)
  const kpis = useSim((s) => s.kpis)
  const knobs = useSim((s) => s.knobs)
  const events = useSim((s) => s.events)
  const t = useSim((s) => s.t)
  const speed = useSim((s) => s.speed)
  const proc = useSim((s) => s.process)
  const shutdowns = useSim((s) => s.shutdowns)
  const alarms = useSim((s) => s.alarms)
  const [why, setWhy] = useState<string | null>(null)
  const { setChoke, setWell, setKnob, reset, setSpeed, resetShutdown, restart } = useSim.getState()
  const wells = useMemo(() => plant.equipment.filter((e) => e.kind === 'xmasTree'), [plant])
  const has = (tg: string) => plant.equipment.some((e) => e.tag === tg)
  const tail = hist.slice(-240)
  const unack = alarms.filter((a) => a.state === 'unack').length
  const lossTotal = Object.values(kpis.losses).reduce((a, b) => a + b, 0)
  const lossRows = (Object.entries(kpis.losses) as [LossCategory, number][]).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1])
  const platforms = [...new Set(shutdowns.map((s) => s.platform))]

  if (!r) return <div className="ops muted small">Starting the simulation…</div>
  return (
    <div className="ops">
      <div className="ops-clock">
        <span className="mono">{fmtClock(t)}</span>
        <span className="seg small">
          {SPEEDS.map((x) => (
            <button key={x} className={speed === x ? 'on' : ''} onClick={() => setSpeed(x)} title={x ? `${x}× real time` : 'Pause'}>
              {x ? `${x}×` : '❚❚'}
            </button>
          ))}
        </span>
        <button className="primary small" onClick={() => useStore.getState().setHmi('overview')} title="The control-room console: alarms, process mimic, shutdowns, cause & effect, F&G, instructor">
          Console{unack ? ` · ${unack} alarms` : ''}
        </button>
      </div>

      <div className="ops-kpis">
        <Kpi label="Oil export" value={fmt(r.oilExport)} unit="bbl/d" spark={tail.map((h) => h.oil)} color="#c98b3a" />
        <Kpi label="Gas export" value={fmt(r.gasExport, 1)} unit="MMscfd" spark={tail.map((h) => h.gas)} color="#f2c230" />
        <Kpi label="Flare" value={fmt(r.flare, 1)} unit="MMscfd" spark={tail.map((h) => h.flare)} color="#ff7a2f" warn={r.flare > 3} />
        <Kpi label="Power" value={`${fmt(r.powerGenerated, 1)} / ${r.powerAvailable >= 999 ? 'grid' : fmt(r.powerAvailable, 0)}`} unit="MW" spark={tail.map((h) => h.power)} color="#8ec5ff" warn={r.powerAvailable < 999 && r.powerDemand > r.powerAvailable * 0.9} />
        <Kpi label="Prod. efficiency now" value={fmt(r.efficiency, 1)} unit="%" spark={tail.map((h) => h.eff)} color="#b8f0c8" warn={r.efficiency < 90} />
        <Kpi label="PE last hour / session" value={`${fmt(kpis.peHour, 1)} / ${fmt(kpis.pe, 1)}`} unit="%" color="#b8f0c8" warn={kpis.pe < 90} />
        <Kpi label="Availability (session)" value={fmt(kpis.availability, 1)} unit="%" color="#b8f0c8" warn={kpis.availability < 95} />
        <Kpi label="Trips · shutdowns" value={`${kpis.trips} · ${kpis.shutdowns}`} unit="" color="#ff7a2f" warn={kpis.shutdowns > 0} />
      </div>
      <div className="muted small ops-note">
        Production efficiency = exported oil + gas (boe) ÷ what the wells could give at their reference chokes. Choking back, flaring, trips and
        restarts all count — real UK North Sea fields average about 75–80 %.
      </div>

      {r.constraints.length > 0 && (
        <div className="ops-alert">
          {r.constraints.slice(0, 4).map((c) => (
            <div key={c.id}>
              {c.text}
              <span className="muted small"> · {LOSS_LABEL[c.loss]}</span>
            </div>
          ))}
        </div>
      )}

      {shutdowns.length > 0 && (
        <Section title="Shutdowns (latched)">
          {shutdowns.map((s) => (
            <div key={s.id} className="ops-row">
              <span className={`mono small ops-sd ${s.resetAt ? 'reset' : ''}`}>{s.level}</span>
              <span className="small ell" title={s.cause}>
                {s.platform}
                {s.zone ? ` · ${s.zone}` : ''} — {s.cause} <span className="muted">({fmtClock(s.at, false)})</span>
              </span>
              {!s.resetAt ? (
                <button onClick={() => setWhy(resetShutdown(s.id))}>Reset</button>
              ) : (
                <span className="muted small">reset</span>
              )}
            </div>
          ))}
          <div className="bf-actions">
            {platforms.map((p) => (
              <button key={p} className="primary" onClick={() => setWhy(restart(p))}>
                Restart {p}
              </button>
            ))}
          </div>
          {why && <div className="ops-why small">{why}</div>}
        </Section>
      )}

      {lossTotal > 1 && (
        <Section title={`Deferred production — ${fmt(lossTotal)} boe this session`}>
          {lossRows.map(([k, v]) => (
            <div key={k} className="ops-loss small">
              <span className="ell">{LOSS_LABEL[k]}</span>
              <span className="ops-loss-bar">
                <span style={{ width: `${(v / lossTotal) * 100}%` }} />
              </span>
              <span className="mono">{fmt(v)}</span>
            </div>
          ))}
        </Section>
      )}

      {wells.length > 0 && (
        <Section title="Wells — chokes">
          {wells.map((w) => {
            const on = knobs.wellOnline[w.tag] ?? true
            const c = knobs.chokes[w.tag] ?? 60
            return (
              <div key={w.tag} className="ops-knob">
                <label className="check">
                  <input type="checkbox" checked={on} onChange={(e) => setWell(w.tag, e.target.checked)} />
                  <span className="mono">{w.tag}</span>
                </label>
                <input type="range" min={0} max={100} step={1} value={c} disabled={!on} onChange={(e) => setChoke(w.tag, Number(e.target.value))} />
                <span className="mono small ops-val">{c}%</span>
                <span className="muted small ops-val">{fmt(r.wells[w.tag]?.oil ?? 0)} bbl/d</span>
              </div>
            )
          })}
        </Section>
      )}

      {has('V-1100') && (
        <Section title="Separation & compression">
          <div className="ops-proc small">
            <Gauge label="HP sep level" value={proc.hpLevel} unit="%" lo={30.6} hi={72} hihi={83.3} max={100} />
            <Gauge label="HP sep pressure" value={proc.hpPressure} unit="barg" lo={28} hi={38} hihi={40} max={45} />
            <Gauge label="K-2200 surge margin" value={proc.surgeMargin} unit="%" lo={10} max={100} />
            <Gauge label="Anti-surge recycle" value={proc.recycle} unit="%" hi={50} max={100} />
          </div>
          <div className="ops-knob">
            <span className="small">HP separator pressure setpoint</span>
            <input type="range" min={28} max={41} step={0.5} value={knobs.hpPressure} onChange={(e) => setKnob('hpPressure', Number(e.target.value))} />
            <span className="mono small ops-val">{knobs.hpPressure} barg</span>
          </div>
          <div className="muted small ops-note">PAH 38 · PAHH 40 (PSD) · PSV-1101 lifts at 42 barg. Lower pressure gives the wells more drawdown.</div>
          <div className="ops-knob">
            <span className="small">K-2200 speed</span>
            <input type="range" min={70} max={105} step={1} value={knobs.compressorSpeed} onChange={(e) => setKnob('compressorSpeed', Number(e.target.value))} />
            <span className="mono small ops-val">{knobs.compressorSpeed}%</span>
          </div>
          <Machine tag="K-2200" label="Export gas compressor" />
          <Machine tag="P-1500A" />
          <Machine tag="P-1500B" />
        </Section>
      )}

      {has('GT-8100A') && (
        <Section title="Power generation">
          <div className="ops-bar">
            <div style={{ width: `${Math.min(100, (r.powerDemand / Math.max(1, r.powerAvailable)) * 100)}%` }} className={r.powerDemand > r.powerAvailable ? 'over' : ''} />
            <span className="small">
              Demand {fmt(r.powerDemand, 1)} MW of {fmt(r.powerAvailable, 0)} MW running · {fmt(proc.busHz, 1)} Hz{proc.fuelGasPressure < 12 && r.powerAvailable > 0 ? ' · on diesel' : ''}
            </span>
          </div>
          <Machine tag="GT-8100A" />
          <Machine tag="GT-8100B" />
          <div className="muted small ops-note">Emergency generator: {proc.emergencyGen}</div>
        </Section>
      )}

      <Section title="Utilities & safety">
        {has('K-4600') && (
          <div className="ops-proc small">
            <Gauge label="Instrument air" value={proc.iaPressure} unit="barg" lo={6.5} lolo={5.5} max={10} />
            <Gauge label="Cooling medium" value={proc.cmTemp} unit="°C" hi={45} hihi={55} max={80} />
            <Gauge label="Firewater ring" value={proc.fwPressure} unit="barg" lo={10} max={16} />
          </div>
        )}
        {['P-4300A', 'P-4300B', 'P-6400A', 'P-6400B', 'P-6200A', 'P-6200B', 'K-4600', 'P-7101A', 'P-7101B'].filter(has).map((tg) => (
          <Machine key={tg} tag={tg} />
        ))}
        {plant.equipment
          .filter((e) => !has('V-1100') && (e.kind === 'pumpPackage' || e.kind === 'compressorPackage'))
          .map((e) => (
            <Machine key={e.tag} tag={e.tag} />
          ))}
        <label className="check small">
          <input type="checkbox" checked={knobs.autoChangeover} onChange={(e) => setKnob('autoChangeover', e.target.checked)} />
          <span>Standby machines auto-start when the duty one trips</span>
        </label>
        <div className="ops-knob">
          <span className="small">Random equipment failures</span>
          <select value={knobs.reliability} onChange={(e) => setKnob('reliability', e.target.value as typeof knobs.reliability)}>
            <option value="off">Off</option>
            <option value="realistic">Realistic MTBF</option>
            <option value="training">Training (× 500)</option>
          </select>
        </div>
      </Section>

      {(has('X-R150') || has('P-W310A')) && (
        <Section title="Export (RP) & water injection (WI)">
          <div className="ops-proc small">
            <Gauge label="Reservoir pressure support" value={proc.reservoir * 100} unit="%" lo={97} lolo={92} max={105} />
            <Gauge label="Water injected" value={proc.wiRate / 1000} unit="k bwpd" lo={30} max={45} />
            <Gauge label="Cold vent" value={proc.vent} unit="MMscfd" hi={1} max={5} />
          </div>
          <div className="muted small ops-note">
            Oil and gas leave Alpha over the west bridge and down RP's risers — a closed riser ESDV blocks export. Water injection replaces what the wells take out;
            without it the reservoir pressure, and the wells with it, decline over hours.
          </div>
          {['P-W300A', 'P-W300B', 'P-W310A', 'P-W310B'].filter(has).map((tg) => (
            <Machine key={tg} tag={tg} />
          ))}
        </Section>
      )}

      <Section title="Weather">
        <div className="ops-knob">
          <span className="small">Wind from</span>
          <input type="range" min={0} max={359} step={5} value={knobs.wind.from} onChange={(e) => setKnob('wind', { ...knobs.wind, from: Number(e.target.value) })} />
          <span className="mono small ops-val">{knobs.wind.from}°</span>
          <span className="muted small ops-val">{['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(knobs.wind.from / 45) % 8]}</span>
        </div>
        <div className="ops-knob">
          <span className="small">Wind speed</span>
          <input type="range" min={0} max={35} step={0.5} value={knobs.wind.speed} onChange={(e) => setKnob('wind', { ...knobs.wind, speed: Number(e.target.value) })} />
          <span className="mono small ops-val">{knobs.wind.speed}</span>
          <span className="muted small ops-val">m/s</span>
        </div>
        <div className="ops-knob">
          <span className="small">Sea state Hs</span>
          <input type="range" min={0.3} max={8} step={0.1} value={knobs.seaState} onChange={(e) => setKnob('seaState', Number(e.target.value))} />
          <span className="mono small ops-val">{knobs.seaState.toFixed(1)}</span>
          <span className="muted small ops-val">m</span>
        </div>
        <div className="muted small ops-note">Wind carries gas clouds and vent plumes; crane lifts stop above ~20 m/s (personnel ~13) or Hs ~3 m.</div>
      </Section>

      {has('DR-100') && (
        <Section title="Drilling">
          <label className="check">
            <input type="checkbox" checked={knobs.drilling} onChange={(e) => setKnob('drilling', e.target.checked)} />
            <span>Drilling ahead (well A-06) — adds 3.5 MW load</span>
          </label>
          <Machine tag="DR-100" label="Drilling rig" />
        </Section>
      )}

      <Section title="Event log">
        <div className="ops-events">
          {events.length === 0 && <div className="muted small">No events — plant in normal operation.</div>}
          {events.map((e) => (
            <div key={e.id} className={`small ops-ev ${e.level}`}>
              <span className="mono muted">{fmtClock(e.t, false)}</span> {e.text}
            </div>
          ))}
        </div>
        <div className="bf-actions">
          <button onClick={reset}>Reset session</button>
        </div>
      </Section>
    </div>
  )
}

function Gauge({ label, value, unit, lo, lolo, hi, hihi, max }: { label: string; value: number; unit: string; lo?: number; lolo?: number; hi?: number; hihi?: number; max: number }) {
  const bad = (hihi !== undefined && value >= hihi) || (lolo !== undefined && value <= lolo)
  const warn = (hi !== undefined && value >= hi) || (lo !== undefined && value <= lo)
  return (
    <div className={`ops-gauge ${bad ? 'bad' : warn ? 'warn' : ''}`}>
      <div className="muted ell">{label}</div>
      <div className="mono">
        {fmt(value, 1)} <span className="muted">{unit}</span>
      </div>
      <div className="ops-gauge-bar">
        <span style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
        {[lolo, lo, hi, hihi].map((m, i) => (m !== undefined ? <i key={i} style={{ left: `${(m / max) * 100}%` }} /> : null))}
      </div>
    </div>
  )
}

function Kpi({ label, value, unit, spark, color, warn }: { label: string; value: string; unit: string; spark?: number[]; color: string; warn?: boolean }) {
  return (
    <div className={`ops-kpi ${warn ? 'warn' : ''}`}>
      <div className="muted small ell">{label}</div>
      <div className="ops-kpi-v">
        {value} <span className="muted small">{unit}</span>
      </div>
      {spark && <Spark data={spark} color={color} />}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bf-sec">
      <h4>
        <span>{title}</span>
      </h4>
      {children}
    </section>
  )
}
