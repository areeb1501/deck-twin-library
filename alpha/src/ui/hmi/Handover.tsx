/**
 * Shift handover: an auto-generated report for the last 12 sim hours (or the session if shorter) —
 * production and PE with losses by category, trips and shutdowns (with reset status), open work orders,
 * permits and lock-outs, inhibited F&G detectors, standing and shelved alarms, active incidents,
 * condition-monitoring watch list and notable operator actions. Print uses the print stylesheet in
 * maintenance.css (light, report only).
 */
import { useEffect, useState } from 'react'
import { usePlant } from '../../state/plantStore'
import { LOSS_LABEL, fmtClock, type Alarm, type Incident, type Kpis, type Lockout, type LossCategory, type OperatorAction } from '../../sim/types'
import { PERMIT_LABEL, WO_STATUS_LABEL, WO_TYPE_LABEL, isOpen, ttfH, useMaint, type KpiSnap } from '../../sim/maintenance'
import { EMPTY_ARR, EMPTY_OBJ, fmt, machinesOf, runOf, sim } from './simApi'
import { Box, Kpi, Prio } from './common'
import './maintenance.css'

const WINDOW = 12 * 3600
const NOISE = new Set(['ack', 'ackAll', 'shelve', 'unshelve', 'setSpeed'])
const LOSSES = Object.keys(LOSS_LABEL) as LossCategory[]

function baseline(snaps: KpiSnap[], from: number): KpiSnap | null {
  if (from <= 0) return null
  let b: KpiSnap | null = null
  for (const s of snaps) if (s.t <= from) b = s
  return b ?? snaps[0] ?? null
}

export function HandoverPage() {
  const plant = usePlant()
  // a report, not a live display: re-read the state every few seconds instead of on every sim tick
  const [, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 4000)
    return () => clearInterval(id)
  }, [])
  const s = sim()
  const t = s.t ?? 0
  const kpis = s.kpis as Kpis | undefined
  const result = s.result
  const alarms = (s.alarms ?? EMPTY_ARR) as Alarm[]
  const incidents = (s.incidents ?? EMPTY_ARR) as Incident[]
  const inhibits = (s.inhibits ?? EMPTY_OBJ) as Record<string, boolean>
  const lockouts = (s.lockouts ?? EMPTY_OBJ) as Record<string, Lockout>
  const actions = (s.actions ?? EMPTY_ARR) as OperatorAction[]
  const { wos, permits, shift, snaps, health } = useMaint.getState()

  const from = Math.max(0, t - WINDOW)
  const base = baseline(snaps, from)
  const since = base?.t ?? 0
  const prod = (kpis?.producedBoe ?? 0) - (base?.produced ?? 0)
  const pot = (kpis?.potentialBoe ?? 0) - (base?.potential ?? 0)
  const pe = pot > 0 ? (prod / pot) * 100 : 100
  const loss = (k: LossCategory) => (kpis?.losses?.[k] ?? 0) - (base?.losses?.[k] ?? 0)
  const lossTot = LOSSES.reduce((a, k) => a + Math.max(0, loss(k)), 0)
  const trips = (kpis?.trips ?? 0) - (base?.trips ?? 0)
  const sds = (kpis?.shutdowns ?? 0) - (base?.shutdowns ?? 0)

  const events = shift.filter((e) => (e.kind === 'trip' || e.kind === 'shutdown') && e.t >= since).sort((a, b) => a.t - b.t)
  const tripped = machinesOf(plant).filter((e) => runOf(s, e.tag) === 'tripped')
  const openWos = wos.filter(isOpen).sort((a, b) => a.priority - b.priority || a.raisedAt - b.raisedAt)
  const doneWos = wos.filter((w) => (w.status === 'returned' || w.status === 'cancelled') && (w.closedAt ?? 0) >= since)
  const openPtw = Object.values(permits).filter((p) => p.status !== 'closed')
  const standing = alarms.filter((a) => a.active && a.state !== 'shelved').sort((a, b) => a.priority - b.priority || a.raisedAt - b.raisedAt)
  const shelved = alarms.filter((a) => a.state === 'shelved')
  const inh = Object.entries(inhibits).filter(([, on]) => on).map(([k]) => k)
  const activeInc = incidents.filter((i) => i.cleared === undefined)
  const notable = actions.filter((a) => a.t >= since && !NOISE.has(a.action) && a.who !== 'auto').slice(0, 40)
  const watch = Object.values(health).filter((h) => h.stage !== 'normal').sort((a, b) => b.degr - a.degr)
  const span = t - since

  return (
    <div className="ho" data-handover>
      <div className="ho-head">
        <div>
          <h2>Shift handover — {plant.name}</h2>
          <div className="dim">
            {fmtClock(since)} → {fmtClock(t)} · {(span / 3600).toFixed(1)} h {span < WINDOW - 1 ? '(session so far)' : '(last 12 h)'} · generated from the simulation, the maintenance system and the audit trail
          </div>
        </div>
        <span className="grow" />
        <button className="ho-noprint" onClick={() => setN((n) => n + 1)} title="Re-read the plant state now (the report refreshes every 4 s)">
          Refresh
        </button>
        <button className="ho-noprint" onClick={() => window.print()} data-act="print">
          Print
        </button>
      </div>

      <Box title="Production">
        <div className="h-kpis">
          <Kpi label="Production efficiency (period)" value={fmt(pe, 1)} unit="%" abn={pe < 95} bad={pe < 80} />
          <Kpi label="PE session / last hour" value={`${fmt(kpis?.pe, 1)} / ${fmt(kpis?.peHour, 1)}`} unit="%" />
          <Kpi label="Availability (session)" value={fmt(kpis?.availability, 1)} unit="%" />
          <Kpi label="Produced (period)" value={fmt(prod)} unit="boe" />
          <Kpi label="Deferred (period)" value={fmt(Math.max(0, pot - prod))} unit="boe" abn={pot - prod > 1} />
          <Kpi label="Oil / gas export now" value={`${fmt(result?.oilExport)} / ${fmt(result?.gasExport, 1)}`} unit="bbl/d · MMscfd" />
          <Kpi label="Trips / shutdowns (period)" value={`${trips} / ${sds}`} abn={trips + sds > 0} />
        </div>
        <table className="h-tbl" style={{ marginTop: 8 }} data-tbl="losses">
          <thead>
            <tr>
              <th>Loss category</th>
              <th style={{ textAlign: 'right' }}>Deferred boe (period)</th>
              <th style={{ textAlign: 'right' }}>Share of losses</th>
            </tr>
          </thead>
          <tbody>
            {LOSSES.filter((k) => loss(k) > 0.5).map((k) => (
              <tr key={k}>
                <td>{LOSS_LABEL[k]}</td>
                <td className="num">{fmt(loss(k))}</td>
                <td className="num">{lossTot ? `${fmt((loss(k) / lossTot) * 100, 0)} %` : '—'}</td>
              </tr>
            ))}
            {!LOSSES.some((k) => loss(k) > 0.5) && (
              <tr>
                <td colSpan={3} className="dim">
                  No deferred production booked in the period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>

      <div className="ho-cols">
        <Box title={`Trips & shutdowns (${events.length})`}>
          {events.length ? (
            <table className="h-tbl" data-tbl="trips">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Item</th>
                  <th>Cause</th>
                  <th>Reset</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td className="mono">{fmtClock(e.t, false)}</td>
                    <td className="mono">{e.kind === 'shutdown' ? e.text.split(' — ')[0] : e.tag}</td>
                    <td className="wrap">{e.kind === 'shutdown' ? e.text.split(' — ').slice(1).join(' — ') : e.text}</td>
                    <td className={e.resetAt !== undefined ? 'ok' : 'no'}>{e.resetAt !== undefined ? `yes ${fmtClock(e.resetAt, false)}` : 'NO'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-empty">No trips or shutdowns in the period.</div>
          )}
          {tripped.length > 0 && <p className="h-note no">Still tripped: {tripped.map((e) => e.tag).join(', ')}</p>}
        </Box>
        <Box title="Safety systems">
          <table className="h-tbl">
            <tbody>
              <tr>
                <td>Active incidents</td>
                <td className="wrap">{activeInc.length ? activeInc.map((i) => `${i.id} ${i.fault.kind}${'tag' in i.fault ? ` ${i.fault.tag}` : ''}${i.zone ? ` (${i.zone})` : ''}`).join('; ') : <span className="dim">none</span>}</td>
              </tr>
              <tr>
                <td>Inhibited F&G detectors</td>
                <td className={`wrap ${inh.length ? 'no' : ''}`}>{inh.length ? inh.join(', ') : <span className="dim">none</span>}</td>
              </tr>
              <tr>
                <td>Lock-outs in force</td>
                <td className="wrap">{Object.keys(lockouts).length ? Object.entries(lockouts).map(([k, l]) => `${k} (${l.by}${l.position ? `, ${l.position}` : ''}${l.planned ? ', planned' : ''})`).join('; ') : <span className="dim">none</span>}</td>
              </tr>
              <tr>
                <td>Latched shutdowns</td>
                <td className="wrap">{(s.shutdowns ?? []).length ? (s.shutdowns ?? []).map((x) => `${x.level} ${x.platform}${x.resetAt !== undefined ? ' (reset, awaiting restart)' : ''}`).join('; ') : <span className="dim">none</span>}</td>
              </tr>
            </tbody>
          </table>
        </Box>
      </div>

      <div className="ho-cols">
        <Box title={`Standing alarms (${standing.length})`}>
          {standing.length ? (
            <table className="h-tbl" data-tbl="standing">
              <tbody>
                {standing.slice(0, 30).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Prio p={a.priority} />
                    </td>
                    <td className="mono">{fmtClock(a.raisedAt, false)}</td>
                    <td className="wrap">{a.text}</td>
                    <td className="dim">{a.state === 'unack' ? 'unack' : 'ack'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-empty">No standing alarms.</div>
          )}
          {standing.length > 30 && <p className="h-note">… and {standing.length - 30} more</p>}
        </Box>
        <Box title={`Shelved alarms (${shelved.length})`}>
          {shelved.length ? (
            <table className="h-tbl">
              <tbody>
                {shelved.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Prio p={a.priority} />
                    </td>
                    <td className="wrap">{a.text}</td>
                    <td className="mono dim">until {a.shelvedUntil !== undefined ? fmtClock(a.shelvedUntil, false) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-empty">No shelved alarms.</div>
          )}
        </Box>
      </div>

      <Box title={`Open work orders (${openWos.length}) · permits (${openPtw.length})`}>
        {openWos.length ? (
          <table className="h-tbl" data-tbl="ho-wos">
            <thead>
              <tr>
                <th>WO</th>
                <th>P</th>
                <th>Tag</th>
                <th>Job</th>
                <th>Type</th>
                <th>Status</th>
                <th>Permit</th>
                <th style={{ textAlign: 'right' }}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {openWos.map((w) => {
                const p = w.permit ? permits[w.permit] : undefined
                return (
                  <tr key={w.id}>
                    <td className="mono">{w.id}</td>
                    <td>P{w.priority}</td>
                    <td className="mono">{w.tag}</td>
                    <td className="wrap">{w.title}</td>
                    <td className="dim">{WO_TYPE_LABEL[w.type]}</td>
                    <td>{WO_STATUS_LABEL[w.status]}</td>
                    <td className={p?.status === 'suspended' ? 'no' : ''}>{p ? `${p.id} ${PERMIT_LABEL[p.type]} · ${p.status}${p.suspendReason ? ` (${p.suspendReason})` : ''}` : '—'}</td>
                    <td className="num">
                      {w.actualH.toFixed(1)} / {w.estH.toFixed(1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="h-empty">No open work orders.</div>
        )}
        {doneWos.length > 0 && (
          <p className="h-note">
            Closed this period: {doneWos.map((w) => `${w.id} ${w.tag} (${w.status === 'returned' ? 'returned to service' : 'cancelled'})`).join('; ')}
          </p>
        )}
      </Box>

      <div className="ho-cols">
        <Box title="Condition monitoring watch list">
          {watch.length ? (
            <table className="h-tbl">
              <tbody>
                {watch.map((h) => {
                  const ttf = ttfH(h)
                  return (
                    <tr key={h.tag}>
                      <td className="mono">{h.tag}</td>
                      <td>{h.stage}</td>
                      <td className="wrap">{h.mode}</td>
                      <td className="num">health {Math.round((1 - h.degr) * 100)} %</td>
                      <td className="num">{ttf === null ? '' : ttf === 0 ? 'failed' : `TTF ~${ttf.toFixed(1)} run h`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="h-empty">All monitored machines healthy.</div>
          )}
        </Box>
        <Box title={`Notable operator actions (${notable.length})`}>
          {notable.length ? (
            <table className="h-tbl" data-tbl="actions">
              <tbody>
                {notable.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{fmtClock(a.t, false)}</td>
                    <td className="dim">{a.who}</td>
                    <td>{a.action}</td>
                    <td className="wrap">
                      <span className="mono">{a.tag}</span> {a.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-empty">No operator actions recorded in the period.</div>
          )}
        </Box>
      </div>

      <div className="ho-sign">
        <div>Off-going CCR operator — name / signature</div>
        <div>On-coming CCR operator — name / signature</div>
      </div>
    </div>
  )
}
