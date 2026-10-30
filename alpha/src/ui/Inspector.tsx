import { useEffect, useMemo, useState } from 'react'
import { SYSTEM_LABEL } from '../model/plant'
import { usePlant } from '../state/plantStore'
import type { Plant } from '../model/types'
import { SERVICE, flange, pipeOD, pipeWall, valveLength } from '../model/catalog'
import type { Equipment, Instrument, PickData, PipeLine, Valve } from '../model/types'
import { useStore } from '../state/store'
import { fmt, history, sample } from './live'
import { FG_LABEL, VALVE_LABEL, kindLabel } from './TagTree'
import { metricsFor, type Metric } from './metrics'
import { isIsolatable } from '../model/isolation'

const mm = (m: number) => `${Math.round(m * 1000)} mm`
const m2 = (m: number) => `${m.toFixed(2)} m`

function useClock() {
  const [t, setT] = useState(() => performance.now() / 1000)
  useEffect(() => {
    const id = setInterval(() => setT(performance.now() / 1000), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

function Link({ tag, kind }: PickData) {
  const select = useStore((s) => s.select)
  const focus = useStore((s) => s.requestFocus)
  return (
    <button
      className="link mono"
      onClick={() => {
        select({ tag, kind })
        focus(tag)
      }}
    >
      {tag}
    </button>
  )
}

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="kv">
      {rows
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  )
}

function Spark({ data, lo, hi }: { data: number[]; lo?: number; hi?: number }) {
  const min = Math.min(...data, lo ?? Infinity)
  const max = Math.max(...data, hi ?? -Infinity)
  const pad = (max - min) * 0.1 || 1
  const y = (v: number) => 44 - ((v - (min - pad)) / (max - min + 2 * pad)) * 40
  const d = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (data.length - 1)) * 260).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="spark" viewBox="0 0 260 48" preserveAspectRatio="none">
      {hi !== undefined && hi <= max + pad && <line x1="0" x2="260" y1={y(hi)} y2={y(hi)} className="lim" />}
      {lo !== undefined && lo >= min - pad && <line x1="0" x2="260" y1={y(lo)} y2={y(lo)} className="lim" />}
      <path d={d} />
    </svg>
  )
}

function Live({ inst }: { inst: Instrument }) {
  const t = useClock()
  const v = sample(inst, t)
  const h = useMemo(() => history(inst, t), [inst, t])
  const a = inst.alarms ?? {}
  const state = (a.hiHi !== undefined && v >= a.hiHi) || (a.loLo !== undefined && v <= a.loLo) ? 'trip' : (a.hi !== undefined && v >= a.hi) || (a.lo !== undefined && v <= a.lo) ? 'alarm' : 'ok'
  return (
    <div className="live">
      <div className="live-head">
        <span className="mono">{inst.tag}</span>
        <span className={`pill ${state}`}>{state === 'ok' ? 'Normal' : state === 'alarm' ? 'Alarm' : 'Trip'}</span>
      </div>
      <div className="live-val">
        {fmt(v)} <span className="muted">{inst.unit}</span>
      </div>
      <Spark data={h} lo={a.lo} hi={a.hi} />
      <div className="muted small">Last 3 min · simulated historian</div>
    </div>
  )
}

function alarmState(v: number, a: Instrument['alarms'] = {}) {
  return (a.hiHi !== undefined && v >= a.hiHi) || (a.loLo !== undefined && v <= a.loLo) ? 'trip' : (a.hi !== undefined && v >= a.hi) || (a.lo !== undefined && v <= a.lo) ? 'alarm' : 'ok'
}

function MetricCard({ m, t }: { m: Metric; t: number }) {
  const v = sample(m.inst, t)
  const h = useMemo(() => history(m.inst, t, 60, 3), [m.inst, t])
  const a = m.inst.alarms ?? {}
  const state = alarmState(v, a)
  return (
    <div className={`metric ${state}`}>
      <div className="metric-head">
        <span className="ell" title={m.label}>{m.label}</span>
        {state !== 'ok' && <span className={`pill ${state}`}>{state === 'alarm' ? 'Alarm' : 'Trip'}</span>}
      </div>
      <div className="metric-val">
        {fmt(v)} <span className="muted">{m.inst.unit}</span>
      </div>
      <Spark data={h} lo={a.lo} hi={a.hi} />
      <div className="muted small mono ell">{m.simulated ? 'simulated' : m.inst.tag}</div>
    </div>
  )
}

/** Live trends for the inspected item, at the top of the panel. */
function Metrics({ tag }: { tag: string }) {
  const plant = usePlant()
  const t = useClock()
  const ms = useMemo(() => metricsFor(plant, tag), [plant, tag])
  if (!ms.length) return null
  return (
    <section className="sec">
      <h4>Live metrics · last 3 min</h4>
      <div className="metrics">
        {ms.map((m) => (
          <MetricCard key={m.inst.tag} m={m} t={t} />
        ))}
      </div>
    </section>
  )
}

function linesAt(plant: Plant, eq: string, nozzle: string) {
  return plant.lines.filter(
    (l) => ('equipment' in l.from && l.from.equipment === eq && l.from.nozzle === nozzle) || ('equipment' in l.to && l.to.equipment === eq && l.to.nozzle === nozzle),
  )
}

function EquipmentView({ eq }: { eq: Equipment }) {
  const plant = usePlant()
  const insts = plant.instruments.filter((i) => 'equipment' in i.on && i.on.equipment === eq.tag)
  const psvs = plant.valves.filter((v) => v.mount?.equipment === eq.tag)
  const geom: [string, React.ReactNode][] = []
  if (eq.kind === 'horizontalVessel' || eq.kind === 'verticalVessel') {
    geom.push(['Inside diameter', mm(eq.id)], ['Tan–tan', m2(eq.tt)], ['Shell thickness', mm(eq.wall)], ['Heads', '2:1 semi-elliptical'])
    if (eq.kind === 'verticalVessel') geom.push(['Support', eq.support])
    if (eq.internals?.length) geom.push(['Internals', eq.internals.map((s) => s.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')])
  }
  if (eq.kind === 'shellTube') geom.push(['TEMA type', eq.temaType], ['Shell OD', mm(eq.shellOd)], ['Tubes', `${eq.tubeCount} × ${(eq.tubeOd * 1000).toFixed(2)} mm OD`], ['Tube length', m2(eq.length)])
  if (eq.kind === 'pumpPackage') geom.push(['Driver', `${eq.motorKw} kW electric motor`], ['Stages', String(eq.stages)])
  if (eq.kind === 'compressorPackage') geom.push(['Driver', `${eq.motorKw} kW VSD motor`], ['Skid', `${eq.skid[0]} × ${eq.skid[1]} m`])
  if (eq.kind === 'pigTrap') geom.push(['Barrels', `${eq.majorBarrelNps}" major / ${eq.minorBarrelNps}" minor`])
  return (
    <>
      <Section title="Design">
        <KV rows={[...Object.entries(eq.design).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v] as [string, React.ReactNode]), ...geom]} />
      </Section>
      {eq.nozzles.length > 0 && (
        <Section title={`Nozzles (${eq.nozzles.length})`}>
          <table className="tbl">
            <tbody>
              {eq.nozzles.map((n) => {
                const ls = linesAt(plant, eq.tag, n.id)
                const psv = psvs.find((p) => p.mount?.nozzle === n.id)
                return (
                  <tr key={n.id}>
                    <td className="mono">{n.id}</td>
                    <td>
                      {n.name}
                      <div className="muted small">
                        {n.nps}" · Class {n.rating} RF WN
                      </div>
                    </td>
                    <td className="r">
                      {ls.map((l) => (
                        <Link key={l.tag} tag={l.tag} kind="line" />
                      ))}
                      {psv && <Link tag={psv.tag} kind="valve" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      )}
      {insts.length > 0 && (
        <Section title="Instrumentation">
          {insts.map((i) => (
            <Live key={i.tag} inst={i} />
          ))}
        </Section>
      )}
    </>
  )
}

function endLabel(e: PipeLine['from']) {
  if ('equipment' in e) return <Link tag={e.equipment} kind="equipment" />
  if ('line' in e) return <Link tag={e.line} kind="line" />
  return <span className="muted">{e.offDeck}</span>
}

function LineView({ l }: { l: PipeLine }) {
  const plant = usePlant()
  const od = pipeOD(l.nps)
  const wall = pipeWall(l.nps, l.schedule)
  let len = 0
  for (let i = 1; i < l.route.length; i++) len += Math.hypot(l.route[i][0] - l.route[i - 1][0], l.route[i][1] - l.route[i - 1][1], l.route[i][2] - l.route[i - 1][2])
  const elbows = Math.max(0, l.route.length - 2)
  const vs = plant.valves.filter((v) => v.line === l.tag)
  const insts = plant.instruments.filter((i) => 'line' in i.on && i.on.line === l.tag)
  const branches = plant.lines.filter((x) => ('line' in x.from && x.from.line === l.tag) || ('line' in x.to && x.to.line === l.tag))
  return (
    <>
      <Section title="Line data">
        <KV
          rows={[
            ['Service', <span key="s" className="svc"><i className="sw" style={{ background: SERVICE[l.service].flow }} />{SERVICE[l.service].label}</span>],
            ['Size', `${l.nps}" NPS  (OD ${(od * 1000).toFixed(1)} mm)`],
            ['Schedule / wall', `${l.schedule} · ${(wall * 1000).toFixed(2)} mm`],
            ['Bore', `${((od - 2 * wall) * 1000).toFixed(1)} mm`],
            ['Piping class', l.spec],
            ['Insulation', l.insulation ? (l.insulation === 'H' ? 'Heat conservation, Al cladding' : l.insulation) : 'None'],
            ['From', endLabel(l.from)],
            ['To', endLabel(l.to)],
            ['Developed length', `${len.toFixed(1)} m · ${elbows} LR elbow${elbows === 1 ? '' : 's'}`],
            ...Object.entries(l.design).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v] as [string, React.ReactNode]),
          ]}
        />
      </Section>
      {(vs.length > 0 || branches.length > 0) && (
        <Section title="In-line items">
          <div className="chips">
            {vs.map((v) => (
              <Link key={v.tag} tag={v.tag} kind="valve" />
            ))}
            {branches.map((b) => (
              <Link key={b.tag} tag={b.tag} kind="line" />
            ))}
          </div>
        </Section>
      )}
      {insts.length > 0 && (
        <Section title="Instrumentation">
          {insts.map((i) => (
            <Live key={i.tag} inst={i} />
          ))}
        </Section>
      )}
    </>
  )
}

function ValveView({ v }: { v: Valve }) {
  const plant = usePlant()
  const l = plant.lines.find((x) => x.tag === v.line)
  const nps = v.mount ? (plant.equipment.find((e) => e.tag === v.mount!.equipment)?.nozzles.find((n) => n.id === v.mount!.nozzle)?.nps ?? 0) : (l?.nps ?? 0)
  const f = flange(nps, 300)
  return (
    <Section title="Valve data">
      <KV
        rows={[
          ['Type', VALVE_LABEL[v.type]],
          ['Size', `${nps}"`],
          ['Face-to-face', v.type === 'psv' ? 'API 526 angle body' : mm(valveLength(v.type, nps))],
          ['End connections', `RF flanged, ${f.bolts} × ${(f.boltDia * 1000).toFixed(0)} mm studs per joint`],
          ['Operator', v.actuator ?? '—'],
          ['Normal position', v.normally === 'open' ? 'Open' : 'Closed'],
          ['Fail action', v.failAction === 'FC' ? 'Fail closed' : v.failAction === 'FO' ? 'Fail open' : v.failAction === 'FL' ? 'Fail last' : '—'],
          [v.type === 'psv' ? 'Protects' : 'On line', v.mount ? <Link tag={v.mount.equipment} kind="equipment" /> : <Link tag={v.line} kind="line" />],
          ...(v.type === 'psv' ? ([['Discharge', <Link key="d" tag={v.line} kind="line" />]] as [string, React.ReactNode][]) : []),
          ...Object.entries(v.design).map(([k, val]) => [k[0].toUpperCase() + k.slice(1), val] as [string, React.ReactNode]),
        ]}
      />
    </Section>
  )
}

function InstrumentView({ i }: { i: Instrument }) {
  return (
    <>
      <Live inst={i} />
      <Section title="Configuration">
        <KV
          rows={[
            ['Range', `${i.range} ${i.unit}`],
            ['Mounted on', 'line' in i.on ? <Link tag={i.on.line} kind="line" /> : <Link tag={i.on.equipment} kind="equipment" />],
            ['Alarms', i.alarms ? Object.entries(i.alarms).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' · ') : '—'],
          ]}
        />
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sec">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

export function Inspector() {
  const plant = usePlant()
  const selected = useStore((s) => s.selected)
  const walk = useStore((s) => s.walk)
  const lookAt = useStore((s) => s.lookAt)
  // walking: show what's being looked at unless something was clicked (pinned)
  const sel = selected ?? (walk ? lookAt : null)
  const focus = useStore((s) => s.requestFocus)
  const cut = useStore((s) => s.requestSectionAround)
  const section = useStore((s) => s.section.enabled)
  const setSection = useStore((s) => s.setSection)
  const select = useStore((s) => s.select)
  if (!sel) return null
  const eq = plant.equipment.find((e) => e.tag === sel.tag)
  const line = plant.lines.find((l) => l.tag === sel.tag)
  const valve = plant.valves.find((v) => v.tag === sel.tag)
  const inst = plant.instruments.find((i) => i.tag === sel.tag)
  const title = eq?.name ?? (line ? SERVICE[line.service].label : valve ? VALVE_LABEL[valve.type] : inst ? FG_LABEL[inst.type] ?? `${inst.type} instrument` : '')
  const sub = eq ? `${kindLabel(eq.kind)} · ${SYSTEM_LABEL[eq.system]}` : line ? SYSTEM_LABEL[line.system] : valve ? valve.line : ''
  return (
    <aside className="panel inspector">
      <header className="insp-head">
        <div>
          <div className="mono insp-tag">{sel.tag}</div>
          <div className="insp-title">{title}</div>
          <div className="muted small">{sub}</div>
        </div>
        {walk && !selected ? (
          <span className="pill look" title="Turn to look at another item, or click one to pin it">Looking at</span>
        ) : (
          <button className="icon" onClick={() => select(null)} title={walk ? 'Unpin and follow your view (Esc)' : 'Close (Esc)'}>
            ×
          </button>
        )}
      </header>
      <div className="insp-actions">
        {walk && selected && <button onClick={() => select(null)}>Unpin</button>}
        <button onClick={() => focus(sel.tag)}>{walk ? 'Walk to' : 'Frame'}</button>
        <button onClick={() => cut(sel.tag)}>Cut open</button>
        {isIsolatable(plant, sel.tag) && (
          <button onClick={() => useStore.getState().setIsolation({ target: sel.tag, mode: 'valve' })} title="Find the valves to close to isolate this item (LOTO)">
            Plan isolation
          </button>
        )}
        {section && <button onClick={() => setSection({ enabled: false })}>Clear cut</button>}
      </div>
      <div className="insp-body">
        {!inst && <Metrics tag={sel.tag} />}
        {eq && <EquipmentView eq={eq} />}
        {line && <LineView l={line} />}
        {valve && <ValveView v={valve} />}
        {inst && <InstrumentView i={inst} />}
      </div>
    </aside>
  )
}
