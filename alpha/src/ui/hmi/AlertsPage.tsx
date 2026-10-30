/**
 * Alerts & assistant (plan 04): the alert outbox (email drafts), the trace of how each alert or
 * investigation was reached, and "Ask the plant".
 *
 *   1. Outbox    newest first: severity, title, platform, time, status; Ack · Walk to · Investigate ·
 *                View email. Header: recipients (editable chips) + channel badge (prototype, not sent).
 *   2. Trace     the selected alert's / investigation's / answer's steps as a vertical timeline: a status
 *                node per step on a track, a card that expands to its evidence as metric tiles
 *                (actor, kind, text, collapsible data). Investigations show their live step + report.
 *   3. Ask       chat over the read-only agent tools, with suggested questions; tags in answers are
 *                Show in 3D / Walk to chips; "How I worked this out" expands the answer's trace.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtClock } from '../../sim/types'
import type { Alert, ChatMessage, TraceStep } from '../../safety/types'
import { DEFAULT_RECIPIENT, useAlerts } from '../../safety/alerts'
import { ask, useChat } from '../../safety/assistant'
import { investigate, useInvestigations, type InvestigationRun } from '../../safety/investigate'
import { walkToTag } from '../walkTo'
import { pickOf } from './nav'
import { Box, TagLink } from './common'
import { EMPTY_ARR } from './simApi'
import './alerts.css'
import { AgentPanel } from './AgentPanel'
import { PROVIDER_LABEL, useProvider } from '../../agents/provider'

const ACTOR_ICON: Record<TraceStep['actor'], string> = { sensor: '◉', rule: '§', risk: '▲', cctv: '◎', assistant: '✦', operator: '●', model: '◆', tool: '⚙' }
const KIND_LABEL: Record<TraceStep['kind'], string> = { observe: 'Observed', assess: 'Assessed', decide: 'Decided', act: 'Acted', notify: 'Notified', answer: 'Answered' }
/** 16-unit stroke icons for the timeline nodes, one per step kind */
const KIND_ICON: Record<TraceStep['kind'], string> = {
  observe: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  assess: 'M2 13.5h12M4 11V7.5M8 11V4M12 11V6',
  decide: 'M8 1.8 14.2 8 8 14.2 1.8 8Z',
  act: 'M9 1.5 3.5 9H8l-1 5.5L12.5 7H8Z',
  notify: 'M14 2 7 9M14 2l-4.5 12L7 9 2 6.5Z',
  answer: 'M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M3.4 12.6l2.1-2.1M10.5 5.5l2.1-2.1',
}
const KindIcon = ({ kind }: { kind: TraceStep['kind'] }) => (
  <svg viewBox="0 0 16 16" aria-hidden>
    <path d={KIND_ICON[kind]} />
  </svg>
)

/** step evidence: primitive values become metric tiles, anything nested stays as raw JSON */
function evidence(data?: Record<string, unknown>) {
  const tiles: { label: string; value: string }[] = []
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data ?? {})) {
    if (tiles.length < 6 && (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 28)))
      tiles.push({ label: k.replace(/([a-z])([A-Z])/g, '$1 $2'), value: typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-GB') : v.toFixed(Math.abs(v) < 10 ? 2 : 1)) : String(v) })
    else rest[k] = v
  }
  return { tiles, rest: Object.keys(rest).length ? rest : null }
}
const SUGGESTIONS = [
  'How is the plant doing?',
  'What should I focus on?',
  'What is at risk in dollars?',
  'Do we have a dry gas seal cartridge for K-2200?',
  'What is the risk on Alpha?',
  'Why is the risk up?',
  'What alarms are active?',
  'Is hot work safe now?',
  'What happens if P-1500A trips?',
  'Any hidden barrier erosion?',
  'Is anything drifting towards a trip?',
]

type Sel = { kind: 'alert' | 'inv' | 'chat'; traceId: string; label: string } | null

export function AlertsPage() {
  const [sel, setSel] = useState<Sel>(null)
  const [emailOf, setEmailOf] = useState<Alert | null>(null)
  return (
    <div className="al-wrap">
      <AgentPanel setSel={setSel} />
      <div className="al-grid">
        <Outbox sel={sel} setSel={setSel} onEmail={setEmailOf} />
        <TraceColumn sel={sel} setSel={setSel} />
        <Chat setSel={setSel} />
      </div>
      {emailOf && <EmailModal alert={emailOf} onClose={() => setEmailOf(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------- outbox
function Outbox({ sel, setSel, onEmail }: { sel: Sel; setSel: (s: Sel) => void; onEmail: (a: Alert) => void }) {
  const alerts = (useAlerts((s) => s.alerts) ?? EMPTY_ARR) as Alert[]
  const recipients = (useAlerts((s) => s.recipients) ?? EMPTY_ARR) as string[]
  const channel = useAlerts((s) => s.channel)
  const [show, setShow] = useState<'all' | 'queued' | 'suppressed' | 'unack'>('all')
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const view = useMemo(() => alerts.filter((a) => show === 'all' || (show === 'unack' ? !a.ack && a.status !== 'suppressed' : a.status === show)).slice(0, 80), [alerts, show])
  const counts = useMemo(() => ({ crit: alerts.filter((a) => a.severity === 'critical' && !a.ack && a.status !== 'suppressed').length, open: alerts.filter((a) => !a.ack && a.status !== 'suppressed').length }), [alerts])

  const addRecipient = () => {
    const v = draft.trim()
    if (!v) return
    const st = useAlerts.getState()
    st.setRecipients([...st.recipients, v])
    const after = useAlerts.getState().recipients
    setMsg(after.some((x) => x.toLowerCase() === v.toLowerCase()) ? null : `${v} is not allowed or not a valid address`)
    setDraft('')
  }
  const removeRecipient = (r: string) => useAlerts.getState().setRecipients(recipients.filter((x) => x !== r))

  return (
    <Box
      className="al-col"
      title={
        <>
          Alert outbox <span className="dim">· {alerts.length}</span>
          {counts.crit > 0 && <span className="al-badge crit">{counts.crit} critical</span>}
          {counts.open > 0 && <span className="al-badge">{counts.open} open</span>}
        </>
      }
      right={<span className="al-channel" title="Alerts are drafted as emails in the browser. Nothing is sent; plan 09 adds a server channel.">{channel === 'server' ? 'Server channel' : 'Outbox (prototype; not sent)'}</span>}
    >
      <div className="al-recips">
        <span className="dim">To</span>
        {recipients.map((r) => (
          <span key={r} className="al-chip">
            {r}
            {(recipients.length > 1 || r !== DEFAULT_RECIPIENT) && (
              <button className="x" onClick={() => removeRecipient(r)} title="Remove recipient">
                ×
              </button>
            )}
          </span>
        ))}
        <input type="text" value={draft} placeholder="add recipient…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRecipient()} />
      </div>
      {msg && <div className="h-msg">{msg}</div>}
      <div className="h-filters al-filters">
        <span className="seg2">
          {(['all', 'unack', 'queued', 'suppressed'] as const).map((k) => (
            <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>
              {k === 'all' ? 'All' : k === 'unack' ? 'Open' : k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </span>
        <span className="grow" />
        <button onClick={() => useAlerts.getState().clear()} disabled={!alerts.length} title="Clear the outbox and the trace log">
          Clear
        </button>
      </div>
      <div className="al-list" data-alerts={alerts.length}>
        {!view.length && <div className="h-empty">No alerts yet. Rules watch alarms, F&G, shutdowns, risk, machine health, CCTV, barrier erosion and slow drift.</div>}
        {view.map((a) => (
          <AlertCard key={a.id} a={a} on={sel?.traceId === a.traceId} onSelect={() => setSel({ kind: 'alert', traceId: a.traceId, label: a.title })} onEmail={() => onEmail(a)} onInvestigate={() => {
            const id = investigate({ alertId: a.id })
            setSel({ kind: 'inv', traceId: id, label: `Investigation: ${a.title}` })
          }} />
        ))}
      </div>
    </Box>
  )
}

function AlertCard({ a, on, onSelect, onEmail, onInvestigate }: { a: Alert; on: boolean; onSelect: () => void; onEmail: () => void; onInvestigate: () => void }) {
  const walk = a.tags.find((t) => pickOf(t))
  return (
    <div className={`al-card ${a.severity} ${on ? 'sel' : ''} ${a.ack ? 'acked' : ''} ${a.status}`} data-rule={a.rule} onClick={onSelect}>
      <div className="al-card-h">
        <span className={`al-sev ${a.severity}`}>{a.severity === 'critical' ? 'CRIT' : a.severity === 'warning' ? 'WARN' : 'INFO'}</span>
        <span className="al-title">{a.title}</span>
      </div>
      <div className="al-meta">
        <span>{a.platform}</span>
        <span className="mono">{fmtClock(a.t)}</span>
        <span className={`al-status ${a.status}`}>{a.status}</span>
        {a.ack && <span className="dim">ack {fmtClock(a.ack.t, false)}</span>}
        <span className="dim mono">{a.rule}</span>
        {a.tags.slice(0, 2).map((t) => (
          <span key={t} onClick={(e) => e.stopPropagation()}>
            <TagLink tag={t} />
          </span>
        ))}
      </div>
      <div className="al-acts" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => useAlerts.getState().ack(a.id)} disabled={!!a.ack}>
          Ack
        </button>
        <button onClick={() => walk && walkToTag(walk)} disabled={!walk} title={walk ? `Walk to ${walk}` : 'No plant item to walk to'}>
          Walk to
        </button>
        <button onClick={onInvestigate}>Investigate</button>
        <button onClick={onEmail}>View email</button>
      </div>
    </div>
  )
}

function EmailModal({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  return (
    <div className="al-modal-bg" onClick={onClose}>
      <div className="al-modal" onClick={(e) => e.stopPropagation()} data-email={alert.id}>
        <div className="al-modal-h">
          <b>Email draft</b>
          <span className="al-status queued">{alert.status === 'suppressed' ? 'suppressed (not queued)' : 'outbox — not sent'}</span>
          <span className="grow" />
          <button onClick={() => void navigator.clipboard?.writeText(`To: ${alert.email.to.join(', ')}\nSubject: ${alert.email.subject}\n\n${alert.email.text}`)}>Copy</button>
          <button onClick={onClose}>Close</button>
        </div>
        <table className="al-mail">
          <tbody>
            <tr>
              <th>To</th>
              <td className="mono">{alert.email.to.join(', ')}</td>
            </tr>
            <tr>
              <th>Subject</th>
              <td>{alert.email.subject}</td>
            </tr>
          </tbody>
        </table>
        <pre className="al-body">{alert.email.text}</pre>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- trace
function TraceColumn({ sel, setSel }: { sel: Sel; setSel: (s: Sel) => void }) {
  const trace = (useAlerts((s) => s.trace) ?? EMPTY_ARR) as TraceStep[]
  const runs = useInvestigations((s) => s.runs)
  const order = useInvestigations((s) => s.order)
  const run = sel?.kind === 'inv' ? runs[sel.traceId] : undefined
  const steps = useMemo(() => (sel ? trace.filter((s) => s.traceId === sel.traceId) : EMPTY_ARR), [trace, sel])
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (run?.status === 'running') void endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [steps.length, run?.status])

  return (
    <Box className="al-col al-tracecol" title={<>Trace {sel && <span className="dim mono">· {sel.traceId}</span>}</>} right={sel && <button onClick={() => setSel(null)}>×</button>}>
      {!sel && (
        <>
          <p className="h-note">Select an alert, an investigation or an answer to see every step that led to it: observe → assess → decide → notify, and the agent's tool calls.</p>
          {order.length > 0 && (
            <>
              <div className="h-sec" style={{ marginTop: 10 }}>
                Investigations
              </div>
              {order.map((id) => runs[id] && (
                <button key={id} className="al-invlink" onClick={() => setSel({ kind: 'inv', traceId: id, label: runs[id].title })}>
                  <span className={`al-dot ${runs[id].status}`} /> {runs[id].title}
                </button>
              ))}
            </>
          )}
        </>
      )}
      {sel && <div className="al-trace-title">{sel.label}</div>}
      {run && <InvestigationHead run={run} />}
      {run?.report && <ReportBox run={run} />}
      {sel && steps.length > 0 && (
        <div className="h-sec al-steps-h">
          Steps <span className="dim">{steps.length}</span>
        </div>
      )}
      <ol className={`al-trace${run?.status === 'running' ? ' running' : ''}`} data-steps={steps.length}>
        {steps.map((s, i) => (
          <TraceItem key={s.id} s={s} last={i === steps.length - 1 && run?.status !== 'running'} />
        ))}
        {run?.status === 'running' && run.pending && (
          <li className="al-step pending">
            <span className="al-node">
              <i className="al-spin" />
            </span>
            <div className="al-card2">
              <div className="al-step-h">
                <b>Working</b>
                <span className="al-pill live">in progress</span>
              </div>
              <div className="al-step-t">{run.pending}</div>
            </div>
          </li>
        )}
      </ol>
      <div ref={endRef} />
    </Box>
  )
}

function TraceItem({ s, last }: { s: TraceStep; last?: boolean }) {
  const [open, setOpen] = useState(!!last)
  const { tiles, rest } = useMemo(() => evidence(s.data), [s.data])
  const more = tiles.length > 0 || !!rest
  return (
    <li className={`al-step ${s.kind}${open ? ' open' : ''}`}>
      <button className="al-node" title={`${KIND_LABEL[s.kind]} by ${s.actor}`} onClick={() => more && setOpen((o) => !o)} aria-expanded={more ? open : undefined}>
        <KindIcon kind={s.kind} />
      </button>
      <div className={`al-card2${more ? ' more' : ''}`} onClick={() => more && setOpen((o) => !o)}>
        <div className="al-step-h">
          <b>{KIND_LABEL[s.kind]}</b>
          <span className="al-pill">
            {ACTOR_ICON[s.actor] ?? '·'} {s.actor}
          </span>
          <span className="grow" />
          <span className="al-time">{fmtClock(s.t, false)}</span>
          {more && <span className="al-chev" aria-hidden>▾</span>}
        </div>
        <div className="al-step-t">{s.text}</div>
        {open && more && (
          <div className="al-evidence" onClick={(e) => e.stopPropagation()}>
            {tiles.length > 0 && (
              <div className="al-tiles">
                {tiles.map((m) => (
                  <div key={m.label} className="al-tile">
                    <span>{m.label}</span>
                    <b>{m.value}</b>
                  </div>
                ))}
              </div>
            )}
            {rest && (
              <details>
                <summary>Raw data</summary>
                <pre>{JSON.stringify(rest, null, 1)}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function InvestigationHead({ run }: { run: InvestigationRun }) {
  return (
    <div className={`al-invhead ${run.status}`}>
      {run.status === 'running' ? <i className="al-spin" /> : <span className="al-dot done" />}
      <span>{run.status === 'running' ? `Investigating — ${run.pending ?? 'starting'}` : 'Investigation complete'}</span>
    </div>
  )
}

function ReportBox({ run }: { run: InvestigationRun }) {
  const r = run.report!
  return (
    <div className="al-report" data-report={run.traceId}>
      <div className="h-sec">Findings</div>
      <p>{r.summary}</p>
      <div className="h-sec">Likely cause</div>
      <p>
        <b>{r.likelyCause}</b>
      </p>
      {r.hidden.length > 0 && (
        <>
          <div className="h-sec">Hard to spot</div>
          <ul className="al-hidden">
            {r.hidden.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </>
      )}
      <div className="h-sec">Evidence</div>
      <ul>
        {r.evidence.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <div className="h-sec">Recommended actions (advisory — the operator decides)</div>
      <ol>
        {r.actions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ol>
      <div className="h-sec">Cameras to check</div>
      <p>{r.cameras.length ? r.cameras.join(', ') : <span className="dim">none covering it</span>}</p>
    </div>
  )
}

// ---------------------------------------------------------------- chat
function Chat({ setSel }: { setSel: (s: Sel) => void }) {
  const messages = (useChat((s) => s.messages) ?? EMPTY_ARR) as ChatMessage[]
  const busy = useChat((s) => s.busy)
  const provider = useProvider((s) => s.provider)
  const [q, setQ] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, busy])
  const send = (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setQ('')
    void ask(t)
  }
  return (
    <Box className="al-col al-chatcol" title="Ask the plant" right={<span className="dim">{PROVIDER_LABEL[provider]} · read-only tools</span>}>
      <div className="al-chat">
        {!messages.length && <p className="h-note">Ask about the live twin. Answers come from read-only tools (status, risk, alarms, equipment, F&G, permits, what-if, barrier erosion, drift) and show how they were worked out.</p>}
        {messages.map((m) => (
          <ChatItem key={m.id} m={m} setSel={setSel} />
        ))}
        {busy && (
          <div className="al-msg assistant">
            <i className="al-spin" /> working it out…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="al-sugg">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <div className="al-input">
        <input type="text" value={q} placeholder="Ask the plant…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(q)} />
        <button onClick={() => send(q)} disabled={busy || !q.trim()}>
          Ask
        </button>
      </div>
    </Box>
  )
}

function ChatItem({ m, setSel }: { m: ChatMessage; setSel: (s: Sel) => void }) {
  const trace = (useAlerts((s) => s.trace) ?? EMPTY_ARR) as TraceStep[]
  const [open, setOpen] = useState(false)
  const steps = useMemo(() => (open && m.traceId ? trace.filter((s) => s.traceId === m.traceId) : EMPTY_ARR), [open, trace, m.traceId])
  return (
    <div className={`al-msg ${m.role}`}>
      <div className="al-msg-t">{m.text}</div>
      {!!m.tags?.length && (
        <div className="al-tags">
          {m.tags.map((t) => (
            <span key={t} className="al-tagchip">
              <TagLink tag={t} />
              {pickOf(t) && (
                <button className="link" onClick={() => walkToTag(t)} title={`Walk to ${t}`}>
                  walk
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {m.traceId && (
        <div className="al-how">
          <button className="link" onClick={() => setOpen((o) => !o)}>
            {open ? '▾' : '▸'} How I worked this out
          </button>
          <button className="link" onClick={() => setSel({ kind: 'chat', traceId: m.traceId!, label: `Answer: ${m.text.slice(0, 60)}…` })}>
            open in trace
          </button>
          {open && (
            <ol className="al-trace mini">
              {steps.map((s) => (
                <li key={s.id} className={`al-step ${s.kind}`}>
                  <span className="al-node" title={`${KIND_LABEL[s.kind]} by ${s.actor}`}>
                    <KindIcon kind={s.kind} />
                  </span>
                  <div className="al-step-t">{s.text}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
