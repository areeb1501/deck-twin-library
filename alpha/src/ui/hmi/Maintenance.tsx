/**
 * Maintenance: work-order backlog and lifecycle, permits to work with their isolation certificates
 * (lock-outs through the engine, manual isolations confirmed by the field operator, SIMOPS suspensions),
 * condition monitoring (health, vibration, temperature, the machine-specific signal, trend, predicted
 * time to failure) and the preventive-maintenance schedule. Logic and data: sim/maintenance.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import { usePlant } from '../../state/plantStore'
import { fmtClock, type MachineSim } from '../../sim/types'
import {
  CLASS_LABEL,
  PERMIT_LABEL,
  SIGNALS,
  WO_FLOW,
  WO_STATUS_LABEL,
  WO_TYPE_LABEL,
  isOpen,
  isolationComplete,
  machineTags,
  maint,
  partnerOf,
  pmIntervalH,
  primaryIndex,
  simopsBlock,
  trendOf,
  ttfH,
  useMaint,
  type Health,
  type Permit,
  type PermitType,
  type WoStatus,
  type WoType,
  type WorkOrder,
} from '../../sim/maintenance'
import { EMPTY_OBJ, fmt, runOf, sim, useS } from './simApi'
import { Box, Kpi, Msg, RunPill, TagLink } from './common'
import { goToMachine } from '../fieldOps'
import { fmtEta, useSpares, woMaterialsMap } from '../../sim/spares'
import './maintenance.css'
import './spares.css'

type Tab = 'wo' | 'permits' | 'cm' | 'pm' | 'log'
const TABS: [Tab, string][] = [
  ['wo', 'Work orders'],
  ['permits', 'Permits'],
  ['cm', 'Condition monitoring'],
  ['pm', 'PM schedule'],
  ['log', 'Log'],
]
const PTYPES = Object.keys(PERMIT_LABEL) as PermitType[]
const WTYPES = Object.keys(WO_TYPE_LABEL) as WoType[]
const hrs = (h: number | undefined | null) => (typeof h === 'number' && Number.isFinite(h) ? (h >= 100 ? h.toFixed(0) : h >= 10 ? h.toFixed(1) : h.toFixed(2)) : '-')
const say = (r: string | null, ok: string) => r ?? `✓ ${ok}`
/** materials status of every work order (sim/spares.ts reservations), memoised on the spares store */
function useWoMats() {
  const reservations = useSpares((s) => s.reservations)
  const orders = useSpares((s) => s.orders)
  const parts = useSpares((s) => s.parts)
  return useMemo(() => woMaterialsMap({ reservations, orders, parts }), [reservations, orders, parts])
}

type Prefill = { tag: string; n: number }
/** where a focus request lands: the tag's open work order, else the raise form prefilled with the tag */
function focusTarget(f: { tag: string; n: number; wall: number } | null, onMount: boolean): { sel: string | null; prefill: Prefill | null } {
  // on mount only a request made just now counts (not one left over from an earlier visit)
  if (!f || (onMount && Date.now() - f.wall > 3000)) return { sel: null, prefill: null }
  const w = useMaint.getState().wos.find((x) => x.tag === f.tag && isOpen(x))
  return w ? { sel: w.id, prefill: null } : { sel: null, prefill: { tag: f.tag, n: f.n } }
}

export function MaintenancePage() {
  const wos = useMaint((s) => s.wos)
  const permits = useMaint((s) => s.permits)
  const health = useMaint((s) => s.health)
  const cmAlarms = useMaint((s) => s.cmAlarms)
  const lockouts = (useS((s) => s.lockouts) ?? EMPTY_OBJ) as Record<string, unknown>
  // Inspector "Isolate (permit)": open the tag's work order, or prefill the raise form
  const [init] = useState(() => focusTarget(useMaint.getState().focus, true))
  const [tab, setTab] = useState<Tab>('wo')
  const [sel, setSel] = useState<string | null>(init.sel)
  const [prefill, setPrefill] = useState<Prefill | null>(init.prefill)
  useEffect(
    () =>
      useMaint.subscribe((s, prev) => {
        if (!s.focus || s.focus === prev.focus) return
        const f = focusTarget(s.focus, false)
        setTab('wo')
        setSel(f.sel)
        setPrefill(f.prefill)
      }),
    [],
  )

  const open = wos.filter(isOpen)
  const ptws = Object.values(permits)
  const live = ptws.filter((p) => p.status === 'issued').length
  const susp = ptws.filter((p) => p.status === 'suspended').length
  const hs = Object.values(health)
  const backlogH = open.reduce((a, w) => a + Math.max(0, w.estH - w.actualH), 0)

  return (
    <div className="mt-page" data-maint>
      <div className="h-grid" style={{ minWidth: 0 }}>
        <div className="h-kpis">
          <Kpi label="Open work orders" value={String(open.length)} abn={open.some((w) => w.priority === 1)} title="Raised … complete (not yet returned to service)" />
          <Kpi label="Backlog" value={hrs(backlogH)} unit="h" />
          <Kpi label="Corrective / CBM / PM open" value={`${open.filter((w) => w.type === 'corrective').length} / ${open.filter((w) => w.type === 'condition').length} / ${open.filter((w) => w.type === 'preventive').length}`} />
          <Kpi label="Permits live / suspended" value={`${live} / ${susp}`} abn={susp > 0} />
          <Kpi label="Lock-outs in force" value={String(Object.keys(lockouts).length)} />
          <Kpi label="CM alert / alarm / failed" value={`${hs.filter((h) => h.stage === 'alert').length} / ${hs.filter((h) => h.stage === 'alarm').length} / ${hs.filter((h) => h.stage === 'failed').length}`} abn={hs.some((h) => h.stage === 'alarm')} bad={hs.some((h) => h.stage === 'failed')} />
        </div>
        {Object.keys(cmAlarms).length > 0 && (
          <div className="mt-cmalarms" data-cm-alarms>
            {Object.values(cmAlarms).map((a) => (
              <div key={a.tag}>
                <span className="prio p3">3</span> <span className="dim mono">{fmtClock(a.at, false)}</span> {a.text}
              </div>
            ))}
          </div>
        )}
        <div className="h-filters mt-tabs">
          <div className="seg2">
            {TABS.map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-mtab={k}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {tab === 'wo' && <WoBacklog wos={wos} sel={sel} pick={setSel} prefill={prefill} />}
        {tab === 'permits' && <PermitList permits={ptws} pick={(id) => (setSel(id), setTab('wo'))} />}
        {tab === 'cm' && <CmTable health={health} wos={wos} pick={setSel} />}
        {tab === 'pm' && <PmTable wos={wos} pick={setSel} />}
        {tab === 'log' && <MaintLog />}
      </div>
      <WoDetail key={sel ?? '-'} id={sel} close={() => setSel(null)} />
    </div>
  )
}

// ------------------------------------------------------------------ work orders

function RaiseForm({ prefill, onRaised }: { prefill: Prefill | null; onRaised: (id: string) => void }) {
  const plant = usePlant()
  const tags = useMemo(() => {
    const m = new Set(machineTags(plant).map((x) => x.tag))
    return [...plant.equipment].filter((e) => e.kind !== 'module').sort((a, b) => Number(m.has(b.tag)) - Number(m.has(a.tag)) || a.tag.localeCompare(b.tag))
  }, [plant])
  const [tag, setTag] = useState(prefill?.tag ?? '')
  const [type, setType] = useState<WoType>(() => {
    const h = prefill ? useMaint.getState().health[prefill.tag] : undefined
    return h && h.stage !== 'normal' && h.stage !== 'failed' ? 'condition' : 'corrective'
  })
  const [prio, setPrio] = useState<1 | 2 | 3 | 4>(3)
  const [ptype, setPtype] = useState<PermitType>('cold')
  const [title, setTitle] = useState('')
  const [msg, setMsg] = useState<string | null>(prefill ? `${prefill.tag} selected from the 3D view: raise a work order, then approve and plan it to request the permit` : null)
  return (
    <Box title="Raise a work order">
      <div className="h-row" data-raise>
        <select value={tag} onChange={(e) => setTag(e.target.value)} data-f="tag">
          <option value="">Select equipment</option>
          {tags.map((e) => (
            <option key={e.tag} value={e.tag}>
              {e.tag} - {e.name}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as WoType)} data-f="type">
          {WTYPES.map((k) => (
            <option key={k} value={k}>
              {WO_TYPE_LABEL[k]}
            </option>
          ))}
        </select>
        <select value={prio} onChange={(e) => setPrio(Number(e.target.value) as 1 | 2 | 3 | 4)} data-f="prio">
          {[1, 2, 3, 4].map((p) => (
            <option key={p} value={p}>
              P{p}
            </option>
          ))}
        </select>
        <select value={ptype} onChange={(e) => setPtype(e.target.value as PermitType)} title="Permit the job will need" data-f="ptype">
          {PTYPES.map((k) => (
            <option key={k} value={k}>
              {PERMIT_LABEL[k]}
            </option>
          ))}
        </select>
        <input type="text" placeholder="Job title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button
          disabled={!tag}
          data-act="raise"
          onClick={() => {
            const r = maint.raise(tag, { type, priority: prio, permitType: ptype, title: title.trim() || undefined })
            setMsg(r.why ?? `✓ ${r.id} raised for ${tag}`)
            if (r.id) onRaised(r.id)
            setTitle('')
          }}
        >
          Raise WO
        </button>
      </div>
      <Msg text={msg} />
    </Box>
  )
}

function WoBacklog({ wos, sel, pick, prefill }: { wos: WorkOrder[]; sel: string | null; pick: (id: string) => void; prefill: Prefill | null }) {
  const [scope, setScope] = useState<'open' | 'all' | 'closed'>('open')
  const [type, setType] = useState<WoType | 'all'>('all')
  const [prio, setPrio] = useState<number>(0)
  const [q, setQ] = useState('')
  const mats = useWoMats()
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return wos
      .filter((w) => (scope === 'all' ? true : scope === 'open' ? isOpen(w) : !isOpen(w)))
      .filter((w) => type === 'all' || w.type === type)
      .filter((w) => !prio || w.priority === prio)
      .filter((w) => !ql || `${w.id} ${w.tag} ${w.title}`.toLowerCase().includes(ql))
      .sort((a, b) => (isOpen(a) === isOpen(b) ? a.priority - b.priority || b.raisedAt - a.raisedAt : isOpen(a) ? -1 : 1))
  }, [wos, scope, type, prio, q])
  return (
    <>
      <RaiseForm key={prefill?.n ?? 0} prefill={prefill} onRaised={pick} />
      <Box title={`Work-order backlog (${list.length})`}>
        <div className="h-filters">
          <div className="seg2">
            {(['open', 'all', 'closed'] as const).map((k) => (
              <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>
                {k === 'open' ? 'Open' : k === 'all' ? 'All' : 'Closed'}
              </button>
            ))}
          </div>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as WoType | 'all')}>
              <option value="all">All</option>
              {WTYPES.map((k) => (
                <option key={k} value={k}>
                  {WO_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select value={prio} onChange={(e) => setPrio(Number(e.target.value))}>
              <option value={0}>All</option>
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>
                  P{p}
                </option>
              ))}
            </select>
          </label>
          <input type="text" placeholder="Search tag / WO / title" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length ? (
          <table className="h-tbl mt-tbl" data-tbl="wos">
            <thead>
              <tr>
                <th>WO</th>
                <th>P</th>
                <th>Tag</th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th title="Spare parts reserved for the job">Materials</th>
                <th>Raised</th>
                <th>By</th>
                <th style={{ textAlign: 'right' }}>Est h</th>
                <th style={{ textAlign: 'right' }}>Act h</th>
                <th style={{ textAlign: 'right' }} title="Deferred production if the job goes ahead as planned (estimate)">
                  Deferred boe
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id} className={`click ${sel === w.id ? 'sel' : ''} ${isOpen(w) ? '' : 'closed'}`} onClick={() => pick(w.id)} data-wo={w.id} data-tag={w.tag}>
                  <td className="mono">{w.id}</td>
                  <td>
                    <WoPrio p={w.priority} />
                  </td>
                  <td className="mono">{w.tag}</td>
                  <td className="wrap">{w.title}</td>
                  <td className="dim">{WO_TYPE_LABEL[w.type]}</td>
                  <td>
                    <StatusChip s={w.status} />
                  </td>
                  <td>{mats.get(w.id) && isOpen(w) ? <span className={`sp-mat ${mats.get(w.id)!.state}`} data-mat={mats.get(w.id)!.state}>{mats.get(w.id)!.text}</span> : ''}</td>
                  <td className="mono dim">{fmtClock(w.raisedAt)}</td>
                  <td className="dim">{w.raisedBy}</td>
                  <td className="num">{hrs(w.estH)}</td>
                  <td className="num">{w.actualH ? hrs(w.actualH) : '-'}</td>
                  <td className="num">{w.deferredBoe ? fmt(w.deferredBoe) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-empty">No {scope === 'open' ? 'open ' : ''}work orders.</div>
        )}
      </Box>
    </>
  )
}

function WoPrio({ p }: { p: number }) {
  return <span className={`mt-prio p${p}`}>P{p}</span>
}
function StatusChip({ s }: { s: WoStatus }) {
  return <span className={`mt-st ${s}`}>{WO_STATUS_LABEL[s]}</span>
}

function WoDetail({ id, close }: { id: string | null; close: () => void }) {
  const w = useMaint((s) => (id ? s.wos.find((x) => x.id === id) : undefined))
  const permit = useMaint((s) => (w?.permit ? s.permits[w.permit] : undefined))
  const h = useMaint((s) => (w ? s.health[w.tag] : undefined))
  const lock = useS((s) => (w ? s.lockouts?.[w.tag] : undefined))
  useS((s) => (w ? s.status?.[w.tag] : undefined))
  // narrow: `machines` is rebuilt every tick (run hours), the trip fields only change on a trip / reset
  const tripCause = useS((s) => (w ? s.machines?.[w.tag]?.tripCause : undefined))
  const localReset = useS((s) => (w ? s.machines?.[w.tag]?.localReset : undefined))
  const machine: Pick<MachineSim, 'tripCause' | 'localReset'> = { tripCause, localReset }
  const [ptype, setPtype] = useState<PermitType | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const mats = useWoMats()
  if (!w) {
    return (
      <aside className="faceplate mt-detail">
        <div className="h-empty">Select a work order.</div>
      </aside>
    )
  }
  const s = sim()
  const st = h ? runOf(s, w.tag) : null
  const partner = partnerOf(w.tag)
  const idx = WO_FLOW.indexOf(w.status)
  const act = (r: string | null, ok: string) => setMsg(say(r, ok))
  const pt = ptype ?? w.permitType
  const running = st === 'running' || st === 'starting'
  return (
    <aside className="faceplate mt-detail" data-wo-detail={w.id}>
      <div className="h-row">
        <h4>{w.id}</h4>
        <WoPrio p={w.priority} />
        <span className="grow" style={{ flex: 1 }} />
        <button className="link" onClick={close}>
          close
        </button>
      </div>
      <div className="sub">
        <TagLink tag={w.tag} /> - {w.title}
      </div>
      <div className="mt-flow">
        {WO_FLOW.map((k, i) => (
          <span key={k} className={w.status === 'cancelled' ? 'x' : i < idx ? 'done' : i === idx ? 'on' : ''} title={WO_STATUS_LABEL[k]}>
            {WO_STATUS_LABEL[k].replace(': permit requested', '')}
          </span>
        ))}
        {w.status === 'cancelled' && <span className="on">Cancelled</span>}
      </div>
      <dl>
        <dt>Type</dt>
        <dd>{WO_TYPE_LABEL[w.type]}</dd>
        <dt>Priority</dt>
        <dd>
          <select value={w.priority} disabled={!isOpen(w)} onChange={(e) => act(maint.setPriority(w.id, Number(e.target.value) as 1 | 2 | 3 | 4), 'priority changed')}>
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                P{p}
              </option>
            ))}
          </select>
        </dd>
        <dt>Raised</dt>
        <dd>
          {fmtClock(w.raisedAt)} · {w.raisedBy}
        </dd>
        {w.failureMode && (
          <>
            <dt>Failure mode</dt>
            <dd style={{ whiteSpace: 'normal' }}>{w.failureMode}</dd>
          </>
        )}
        <dt>Hours</dt>
        <dd>
          {hrs(w.actualH)} / {hrs(w.estH)} h est.
        </dd>
        <dt>Deferred (est.)</dt>
        <dd>{w.deferredBoe ? `${fmt(w.deferredBoe)} boe` : 'none: spare available'}</dd>
        {st && (
          <>
            <dt>Machine</dt>
            <dd>
              <RunPill st={st} />
              {machine?.tripCause && st === 'tripped' ? <span className="dim"> {machine.tripCause}</span> : null}
            </dd>
          </>
        )}
        {h && (
          <>
            <dt>Health</dt>
            <dd>
              <HealthBar h={h} /> {h.stage !== 'normal' ? h.stage : ''}
            </dd>
          </>
        )}
        {mats.get(w.id) && (
          <>
            <dt>Materials</dt>
            <dd className="sp-matlines" data-wo-mat={mats.get(w.id)!.state}>
              {mats.get(w.id)!.lines.map((l) => (
                <div key={l.partId} className={!l.kitted && !l.issued ? 'short' : ''}>
                  {l.qty} × {l.name} - {l.where}
                  {!l.kitted && !l.issued && l.eta !== undefined ? `, ETA ${fmtEta(l.eta)}` : ''}
                </div>
              ))}
            </dd>
          </>
        )}
        {lock && (
          <>
            <dt>Lock-out</dt>
            <dd style={{ color: '#ffd7a0' }}>locked under {lock.by}</dd>
          </>
        )}
      </dl>
      {w.status === 'inProgress' && (
        <div className="bar" title="work done">
          <i style={{ width: `${Math.min(100, (w.actualH / Math.max(w.workH, 1e-6)) * 100)}%` }} />
        </div>
      )}
      <div className="btns" data-lifecycle>
        {w.status === 'raised' && (
          <button onClick={() => act(maint.approve(w.id), `${w.id} approved`)} data-act="approve">
            Approve
          </button>
        )}
        {w.status === 'approved' && (
          <>
            <select value={pt} onChange={(e) => setPtype(e.target.value as PermitType)} data-f="permitType">
              {PTYPES.map((k) => (
                <option key={k} value={k}>
                  {PERMIT_LABEL[k]}
                </option>
              ))}
            </select>
            <button onClick={() => act(maint.plan(w.id, pt), `${w.id} planned: permit requested`)} data-act="plan">
              Plan: request permit
            </button>
          </>
        )}
        {w.status === 'planned' && permit?.status === 'requested' && (
          <>
            {running && partner && (
              <button onClick={() => act(maint.changeOver(w.tag), `starting ${partner}; ${w.tag} stops when it runs`)} data-act="changeover">
                Change over to {partner}
              </button>
            )}
            {running && (
              <button onClick={() => act(maint.stopMachine(w.tag), `${w.tag} stopped`)} data-act="stop">
                Stop {w.tag}
              </button>
            )}
            <button className="warn" onClick={() => act(maint.issue(permit.id), `${permit.id} issued: isolation applied`)} data-act="issue">
              Issue permit
            </button>
          </>
        )}
        {(w.status === 'planned' || w.status === 'isolated') && permit && permit.status !== 'requested' && permit.isolations.some((i) => !i.done && i.kind !== 'valve' && i.kind !== 'machine') && (
          <button onClick={() => act(maint.confirm(permit.id, 'all'), 'field operator confirmed the manual isolations')} data-act="confirmAll">
            Field: confirm all manual items
          </button>
        )}
        {w.status === 'isolated' && (
          <button className="warn" onClick={() => act(maint.startWork(w.id), `${w.id} in progress`)} data-act="start">
            Start work
          </button>
        )}
        {w.status === 'complete' && (
          <button className="warn" onClick={() => act(maint.returnToService(w.id), `${w.id} returned to service`)} data-act="rts">
            Return to service: sign off permit
          </button>
        )}
        {isOpen(w) && w.status !== 'complete' && (
          <button className="danger" onClick={() => act(maint.cancel(w.id), `${w.id} cancelled`)} data-act="cancel">
            Cancel
          </button>
        )}
        {st === 'tripped' && machine?.localReset && w.status === 'returned' && (
          <button onClick={() => goToMachine(w.tag)} title="Machinery-protection trip: reset it at the machine">
            Go to {w.tag}
          </button>
        )}
      </div>
      {isOpen(w) && w.status !== 'inProgress' && w.status !== 'complete' && w.type !== 'preventive' && mats.get(w.id)?.state === 'awaiting' && <div className="h-msg">Work cannot start: {mats.get(w.id)!.text}: expedite or transfer on the Spares &amp; supply page</div>}
      <Msg text={msg} />
      {permit && <PermitCard p={permit} say={setMsg} />}
      <h5 className="mt-h5">History</h5>
      <div className="mt-hist">
        {[...w.history].reverse().map((x, i) => (
          <div key={i}>
            <span className="mono dim">{fmtClock(x.t, false)}</span> {x.status === 'note' ? '' : <b>{WO_STATUS_LABEL[x.status]}</b>} <span className="dim">{x.by}</span>
            {x.note ? `: ${x.note}` : ''}
          </div>
        ))}
      </div>
    </aside>
  )
}

function PermitCard({ p, say: setMsg }: { p: Permit; say: (m: string | null) => void }) {
  const valves = (useS((s) => s.valves) ?? EMPTY_OBJ) as Record<string, { pos?: number } | undefined>
  const lockouts = (useS((s) => s.lockouts) ?? EMPTY_OBJ) as Record<string, { by: string } | undefined>
  const block = p.status === 'suspended' ? simopsBlock(p.type, p.platform) : null
  const done = p.isolations.filter((i) => i.done).length
  return (
    <div className={`mt-permit ${p.status}`} data-permit={p.id}>
      <div className="h-row">
        <b className="mono">{p.id}</b>
        <span>{PERMIT_LABEL[p.type]}</span>
        <span className={`mt-pst ${p.status}`}>{p.status}</span>
        <span className="dim">{p.platform}</span>
        {p.planned && <span className="chip">planned</span>}
      </div>
      {p.status === 'suspended' && (
        <div className="h-msg">
          Suspended: {p.suspendReason}
          {block ? ': still active, cannot re-validate yet' : ': condition cleared, re-validate to resume'}
        </div>
      )}
      <div className="btns" style={{ margin: '6px 0' }}>
        {p.status === 'issued' && (
          <button onClick={() => setMsg(say(maint.suspend(p.id, 'suspended by the CCR'), `${p.id} suspended`))} data-act="suspend">
            Suspend
          </button>
        )}
        {p.status === 'suspended' && (
          <button className="warn" disabled={!!block} onClick={() => setMsg(say(maint.revalidate(p.id), `${p.id} re-validated`))} data-act="revalidate">
            Re-validate
          </button>
        )}
        {p.status !== 'closed' && (
          <button onClick={() => setMsg(say(maint.signOff(p.id), `${p.id} signed off`))} data-act="signoff">
            Sign off
          </button>
        )}
      </div>
      <h5 className="mt-h5">
        Isolation certificate · {done}/{p.isolations.length} in place {isolationComplete(p) && p.status !== 'requested' ? '✓' : ''}
      </h5>
      <table className="h-tbl mt-iso">
        <tbody>
          {p.isolations.map((i) => {
            const v = valves[i.tag]
            const lk = lockouts[i.tag]
            const state = i.done ? 'done' : p.status === 'requested' ? 'todo' : 'pending'
            return (
              <tr key={i.tag + i.kind} className={state} data-iso={i.tag}>
                <td className="mt-tick">{i.done ? '✓' : '○'}</td>
                <td className="mono">{i.tag}</td>
                <td className="wrap">
                  {i.action}
                  {i.kind === 'valve' && v && typeof v.pos === 'number' && !i.done && p.status !== 'requested' && <span className="dim"> · travel {Math.round(v.pos * 100)} %</span>}
                  {lk && (i.kind === 'valve' || i.kind === 'machine') && <span className="dim"> · locked by {lk.by}</span>}
                  {i.note && <div className="dim">{i.note}</div>}
                </td>
                <td className="act">
                  {!i.done && (i.kind === 'manual' || i.kind === 'blind' || i.kind === 'check') && p.status !== 'requested' && p.status !== 'closed' && (
                    <button onClick={() => setMsg(say(maint.confirm(p.id, i.tag), `${i.tag} confirmed by the field operator`))} data-act="confirm">
                      Confirm
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {p.warnings.length > 0 && (
        <ul className="mt-warn">
          {p.warnings.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <h5 className="mt-h5">Permit log</h5>
      <div className="mt-hist">
        {[...p.log].reverse().map((x, i) => (
          <div key={i}>
            <span className="mono dim">{fmtClock(x.t, false)}</span> {x.text}
          </div>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ permits

function PermitList({ permits, pick }: { permits: Permit[]; pick: (wo: string) => void }) {
  const [all, setAll] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const list = permits.filter((p) => all || p.status !== 'closed').sort((a, b) => b.requestedAt - a.requestedAt)
  return (
    <Box
      title={`Permits to work (${list.length})`}
      right={
        <label className="h-row" style={{ gap: 5, textTransform: 'none', letterSpacing: 0 }}>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> show closed
        </label>
      }
    >
      <p className="h-note">SIMOPS: gas on the platform suspends hot work. ESD1 or APS suspends every permit until it is re-validated.</p>
      {list.length ? (
        <table className="h-tbl mt-tbl" data-tbl="permits">
          <thead>
            <tr>
              <th>Permit</th>
              <th>Type</th>
              <th>Tag</th>
              <th>WO</th>
              <th>Platform</th>
              <th>Status</th>
              <th>Issued</th>
              <th style={{ textAlign: 'right' }}>Isolations</th>
              <th style={{ textAlign: 'right' }}>Re-val.</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={`click ${p.status}`} onClick={() => pick(p.wo)} data-ptw={p.id}>
                <td className="mono">{p.id}</td>
                <td>{PERMIT_LABEL[p.type]}</td>
                <td className="mono">{p.tag}</td>
                <td className="mono">{p.wo}</td>
                <td className="dim">{p.platform}</td>
                <td>
                  <span className={`mt-pst ${p.status}`}>{p.status}</span>
                  {p.suspendReason && <div className="dim wrap">{p.suspendReason}</div>}
                </td>
                <td className="mono dim">{p.issuedAt !== undefined ? fmtClock(p.issuedAt) : '-'}</td>
                <td className="num">
                  {p.isolations.filter((i) => i.done).length}/{p.isolations.length}
                </td>
                <td className="num">{p.revalidations || ''}</td>
                <td className="act" onClick={(e) => e.stopPropagation()}>
                  {p.status === 'requested' && <button onClick={() => setMsg(say(maint.issue(p.id), `${p.id} issued`))}>Issue</button>}
                  {p.status === 'issued' && <button onClick={() => setMsg(say(maint.suspend(p.id, 'suspended by the CCR'), `${p.id} suspended`))}>Suspend</button>}
                  {p.status === 'suspended' && <button onClick={() => setMsg(say(maint.revalidate(p.id), `${p.id} re-validated`))}>Re-validate</button>}
                  {p.status !== 'closed' && <button onClick={() => setMsg(say(maint.signOff(p.id), `${p.id} signed off`))}>Sign off</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-empty">No permits.</div>
      )}
      <Msg text={msg} />
    </Box>
  )
}

// ------------------------------------------------------------------ condition monitoring

function HealthBar({ h }: { h: Health }) {
  const pct = Math.round((1 - h.degr) * 100)
  return (
    <span className={`mt-health ${h.stage}`} title={`Health ${pct} % (degradation ${Math.round(h.degr * 100)} %)`}>
      <i style={{ width: `${pct}%` }} />
      <b>{pct}</b>
    </span>
  )
}

function Spark({ data, lim }: { data: number[]; lim: number[] }) {
  if (data.length < 2) return <span className="faint">-</span>
  const lo = Math.min(...data, ...lim)
  const hi = Math.max(...data, ...lim)
  const pad = (hi - lo) * 0.08 || 1
  const y = (v: number) => 22 - ((v - lo + pad) / (hi - lo + 2 * pad)) * 20
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * 110).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="mt-spark" viewBox="0 0 110 24" preserveAspectRatio="none">
      {lim.map((l, i) => (
        <line key={i} x1={0} x2={110} y1={y(l)} y2={y(l)} className={i ? 'l2' : 'l1'} />
      ))}
      <path d={d} />
    </svg>
  )
}

function SigCell({ h, i }: { h: Health; i: number }) {
  const sp = SIGNALS[h.cls][i]
  const v = h.sig[i]
  const falling = sp.alert < sp.n
  const bad = falling ? v <= sp.alarm : v >= sp.alarm
  const abn = falling ? v <= sp.alert : v >= sp.alert
  return (
    <td className={`num ${bad ? 'mt-bad' : abn ? 'mt-abn' : ''}`} title={`${sp.label}: alert ${sp.alert}, alarm ${sp.alarm} ${sp.unit}`}>
      {v.toFixed(v < 10 ? 1 : 0)} <small className="dim">{sp.unit}</small>
    </td>
  )
}

function CmTable({ health, wos, pick }: { health: Record<string, Health>; wos: WorkOrder[]; pick: (id: string) => void }) {
  const plant = usePlant()
  const [inst, setInst] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const names = useMemo(() => new Map(plant.equipment.map((e) => [e.tag, e.name])), [plant])
  useS((s) => s.status)
  const s = sim()
  const list = Object.values(health).sort((a, b) => b.degr - a.degr || a.tag.localeCompare(b.tag))
  return (
    <Box
      title="Condition monitoring"
      right={
        <label className="h-row" style={{ gap: 5, textTransform: 'none', letterSpacing: 0 }} title="Instructor: seed a developing fault or fail a machine now">
          <input type="checkbox" checked={inst} onChange={(e) => setInst(e.target.checked)} data-f="instructor" /> instructor tools
        </label>
      }
    >
      <p className="h-note">
        Degradation follows the P-F curve: signals stay quiet, then rise, alert ≈ half way (a condition-based WO is raised), alarm ≈ three quarters (P3 alarm), then functional failure (trip). Degradation only advances while the machine runs; changing over to the standby buys time. Repairing before failure takes about half the MTTR and avoids the trip.
      </p>
      <table className="h-tbl mt-tbl" data-tbl="cm">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Machine</th>
            <th>State</th>
            <th>Health</th>
            <th>Signals (vibration · temperature · process)</th>
            <th />
            <th />
            <th>Trend (leading signal)</th>
            <th style={{ textAlign: 'right' }} title="Predicted running hours to functional failure (trend extrapolation)">
              TTF
            </th>
            <th>Fault</th>
            <th>WO</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map((h) => {
            const w = wos.find((x) => x.tag === h.tag && isOpen(x))
            const ttf = ttfH(h)
            const pi = primaryIndex(h)
            const sp = SIGNALS[h.cls][pi]
            return (
              <tr key={h.tag} className={h.stage} data-cm={h.tag}>
                <td>
                  <TagLink tag={h.tag} />
                </td>
                <td className="dim ell" title={names.get(h.tag)}>
                  {CLASS_LABEL[h.cls]}
                </td>
                <td>
                  <RunPill st={runOf(s, h.tag)} />
                </td>
                <td>
                  <HealthBar h={h} />
                </td>
                <SigCell h={h} i={0} />
                <SigCell h={h} i={1} />
                <SigCell h={h} i={2} />
                <td>
                  <Spark data={trendOf(h)} lim={[sp.alert, sp.alarm]} />
                </td>
                <td className="num">{ttf === null ? '-' : ttf === 0 ? 'failed' : `${hrs(ttf)} h`}</td>
                <td className="wrap dim">{h.stage !== 'normal' || h.degr > 0.25 ? h.mode : ''}</td>
                <td>
                  {w ? (
                    <button className="link mono" onClick={() => pick(w.id)}>
                      {w.id}
                    </button>
                  ) : (
                    ''
                  )}
                </td>
                <td className="act">
                  {!w && (
                    <button
                      onClick={() => {
                        const r = maint.raiseFor(h.tag)
                        setMsg(r.why ?? `✓ ${r.id} raised`)
                        if (r.id) pick(r.id)
                      }}
                    >
                      Raise WO
                    </button>
                  )}
                  {inst && (
                    <>
                      <button onClick={() => setMsg(say(maint.seed(h.tag, 0.3), `${h.tag}: fault seeded`))} data-act="seed" title="Start a developing fault (30 %)">
                        Seed
                      </button>
                      <button className="danger" onClick={() => setMsg(say(maint.seed(h.tag, 1), `${h.tag} fails at the next step if running`))} data-act="fail" title="Degradation to 100 %: the machine fails while running">
                        Fail
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Msg text={msg} />
    </Box>
  )
}

// ------------------------------------------------------------------ PM schedule

function PmTable({ wos, pick }: { wos: WorkOrder[]; pick: (id: string) => void }) {
  const pm = useMaint((s) => s.pm)
  const knobs = useS((s) => s.knobs)
  const [msg, setMsg] = useState<string | null>(null)
  const rows = Object.values(pm)
    .map((p) => ({ p, iv: pmIntervalH(p) }))
    .sort((a, b) => b.p.frac - a.p.frac)
  return (
    <Box title="Preventive maintenance schedule (running hours)">
      <p className="h-note">
        Work orders are raised at 90 % of each machine class's interval{knobs?.reliability === 'training' ? ' (÷ 100 in training mode)' : ''}.
      </p>
      <table className="h-tbl mt-tbl" data-tbl="pm">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Class</th>
            <th style={{ textAlign: 'right' }}>Interval h</th>
            <th style={{ textAlign: 'right' }}>Run h since PM</th>
            <th>Progress</th>
            <th style={{ textAlign: 'right' }}>Due in h</th>
            <th>Last PM</th>
            <th style={{ textAlign: 'right' }}>Done</th>
            <th>WO</th>
            <th style={{ textAlign: 'right' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, iv }) => {
            const w = wos.find((x) => x.tag === p.tag && x.type === 'preventive' && isOpen(x))
            const f = p.frac
            const since = f * iv
            return (
              <tr key={p.tag} data-pm={p.tag}>
                <td>
                  <TagLink tag={p.tag} />
                </td>
                <td className="dim">{CLASS_LABEL[p.cls]}</td>
                <td className="num">{hrs(iv)}</td>
                <td className="num">{hrs(since)}</td>
                <td>
                  <span className={`mt-due ${f >= 1 ? 'over' : f >= 0.9 ? 'due' : ''}`}>
                    <i style={{ width: `${Math.min(100, f * 100)}%` }} />
                  </span>
                </td>
                <td className={`num ${f >= 1 ? 'mt-bad' : f >= 0.9 ? 'mt-abn' : ''}`}>{f >= 1 ? `overdue ${hrs(since - iv)}` : hrs(iv - since)}</td>
                <td className="mono dim">{p.lastAt !== undefined ? fmtClock(p.lastAt) : '-'}</td>
                <td className="num">{p.count || ''}</td>
                <td>
                  {w ? (
                    <button className="link mono" onClick={() => pick(w.id)}>
                      {w.id}
                    </button>
                  ) : (
                    ''
                  )}
                </td>
                <td className="act">
                  {!w && (
                    <button
                      onClick={() => {
                        const r = maint.raise(p.tag, { type: 'preventive', priority: 4, by: 'Planner (brought forward)' })
                        setMsg(r.why ?? `✓ ${r.id} raised`)
                        if (r.id) pick(r.id)
                      }}
                    >
                      Raise PM now
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Msg text={msg} />
    </Box>
  )
}

// ------------------------------------------------------------------ log

function MaintLog() {
  const log = useMaint((s) => s.log)
  return (
    <Box title="Maintenance log">
      {log.length ? (
        <div className="mt-hist" style={{ maxHeight: 'none' }}>
          {log.map((e, i) => (
            <div key={i} className={e.level === 'warn' ? 'warn' : ''}>
              <span className="mono dim">{fmtClock(e.t)}</span> {e.text}
            </div>
          ))}
        </div>
      ) : (
        <div className="h-empty">Nothing yet.</div>
      )}
    </Box>
  )
}
