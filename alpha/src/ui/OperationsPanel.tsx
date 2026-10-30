/**
 * Operations: how the plant is producing, how available it is, and the knobs to turn —
 * well chokes, separator pressure, compressor speed, duty/standby machines, turbines, drilling —
 * plus start / stop / trip / reset for the rotating equipment and an event log. Everything here
 * feeds the simulation (state/sim.ts), which moves the gauges, metrics, flow and spinning machines.
 */
import { useMemo } from 'react'
import { usePlant } from '../state/plantStore'
import { useStore } from '../state/store'
import { isRunning, runState, useSim, type RunState } from '../state/sim'

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

const DOT: Record<RunState, string> = { running: 'run', standby: 'stby', stopped: 'stop', tripped: 'trip' }

/** start / stop / trip / reset for one machine */
export function RunControl({ tag, compact }: { tag: string; compact?: boolean }) {
  useSim((s) => s.status[tag]) // re-render on change
  useSim((s) => s.t)
  const st = runState(tag)
  const live = isRunning(tag)
  const { setStatus, trip } = useSim.getState()
  return (
    <span className="run-ctl">
      <span className={`run-dot ${DOT[st]} ${st === 'running' && !live ? 'stop' : ''}`} title={st === 'running' && !live ? 'running (no power)' : st} />
      {!compact && <span className="muted small run-state">{st === 'running' && !live ? 'no power' : st}</span>}
      {st === 'tripped' ? (
        <button onClick={() => setStatus(tag, 'standby')} title="Reset the trip (machine goes to standby)">Reset</button>
      ) : st === 'running' ? (
        <>
          <button onClick={() => setStatus(tag, 'standby')}>Stop</button>
          <button className="danger" onClick={() => trip(tag, 'manual trip')}>Trip</button>
        </>
      ) : (
        <button onClick={() => setStatus(tag, 'running')}>Start</button>
      )}
    </span>
  )
}

function Machine({ tag, label }: { tag: string; label?: string }) {
  const plant = usePlant()
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
      <span className="muted small ell">{label ?? e.name}</span>
      <RunControl tag={tag} />
    </div>
  )
}

export function OperationsPanel() {
  const plant = usePlant()
  const r = useSim((s) => s.result)
  const hist = useSim((s) => s.history)
  const availability = useSim((s) => s.availability)
  const knobs = useSim((s) => s.knobs)
  const events = useSim((s) => s.events)
  const { setChoke, setWell, setKnob, reset } = useSim.getState()
  const wells = useMemo(() => plant.equipment.filter((e) => e.kind === 'xmasTree'), [plant])
  const has = (t: string) => plant.equipment.some((e) => e.tag === t)
  const tail = hist.slice(-180)

  if (!r) return <div className="ops muted small">Starting the simulation…</div>
  return (
    <div className="ops">
      <div className="ops-kpis">
        <Kpi label="Oil export" value={fmt(r.oilExport)} unit="bbl/d" spark={tail.map((h) => h.oil)} color="#c98b3a" />
        <Kpi label="Gas export" value={fmt(r.gasExport, 1)} unit="MMscfd" spark={tail.map((h) => h.gas)} color="#f2c230" />
        <Kpi label="Flare" value={fmt(r.flare, 1)} unit="MMscfd" spark={tail.map((h) => h.flare)} color="#ff7a2f" warn={r.flare > 3} />
        <Kpi label="Produced water" value={fmt(r.water)} unit="bbl/d" color="#3fb6a8" />
        <Kpi label="Power" value={`${fmt(r.powerGenerated, 1)} / ${r.powerAvailable >= 999 ? 'grid' : fmt(r.powerAvailable, 0)}`} unit="MW" spark={tail.map((h) => h.power)} color="#8ec5ff" warn={r.powerAvailable < 999 && r.powerDemand > r.powerAvailable * 0.9} />
        <Kpi label="Production efficiency" value={fmt(r.efficiency, 1)} unit="%" spark={tail.map((h) => h.eff)} color="#b8f0c8" warn={r.efficiency < 97} />
        <Kpi label="Availability (last 10 min)" value={fmt(availability, 1)} unit="%" color="#b8f0c8" warn={availability < 95} />
        <Kpi label="Fuel gas" value={fmt(r.fuelGas, 1)} unit="MMscfd" color="#f2c230" />
      </div>
      {r.constraint && <div className="ops-alert">{r.constraint}</div>}

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
          <div className="ops-knob">
            <span className="small">HP separator pressure</span>
            <input type="range" min={30} max={55} step={0.5} value={knobs.hpPressure} onChange={(e) => setKnob('hpPressure', Number(e.target.value))} />
            <span className="mono small ops-val">{knobs.hpPressure} barg</span>
          </div>
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
            <span className="small">Demand {fmt(r.powerDemand, 1)} MW of {fmt(r.powerAvailable, 0)} MW running</span>
          </div>
          <Machine tag="GT-8100A" />
          <Machine tag="GT-8100B" />
        </Section>
      )}

      <Section title="Utilities & safety">
        {['P-4300A', 'P-4300B', 'P-6400A', 'P-6400B', 'P-6200A', 'P-6200B', 'K-4600', 'P-7101A', 'P-7101B'].filter(has).map((t) => (
          <Machine key={t} tag={t} />
        ))}
        {plant.equipment
          .filter((e) => !has('V-1100') && (e.kind === 'pumpPackage' || e.kind === 'compressorPackage'))
          .map((e) => (
            <Machine key={e.tag} tag={e.tag} />
          ))}
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
          {events.map((e, i) => (
            <div key={i} className={`small ops-ev ${e.level}`}>
              <span className="mono muted">t+{e.t}s</span> {e.text}
            </div>
          ))}
        </div>
        <div className="bf-actions">
          <button onClick={reset}>Reset to normal operation</button>
        </div>
      </Section>
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
