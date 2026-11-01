/**
 * Training scenarios console page: library (filters, best scores, attempt history, saved custom scenarios)
 * → briefing with Start → running panel (live objectives checklist, elapsed time, CCR / field actions, field reports,
 * hints that cost points, Abort) → debrief (score breakdown, timeline of plant events vs what the
 * operator did vs what was expected, what went well / to improve, KPIs before and after).
 * Logic and scoring live in sim/scenarios.ts and sim/scen/*. Building a scenario with a model is ScenarioAuthor.tsx.
 */
import { Fragment, useMemo, useState, type FormEvent } from 'react'
import { useAccount } from '../../state/account'
import { usePlant } from '../../state/plantStore'
import { SCENARIOS, scenarioById, unavailable, useScenario, type Attempt, type LiveView, type Scenario } from '../../sim/scenarios'
import { NextActions } from './ResponsePage'
import { useAuthor } from '../../agents/scenarioAuthor'
import { useCustom } from '../../sim/scen/custom'
import { DIFFICULTY_LABEL, type Difficulty, type ObjStatus } from '../../sim/scen/types'
import { fmtEl } from '../../sim/scen/helpers'
import { WEIGHTS, HINT_COST } from '../../sim/scen/scoring'
import { LOSS_LABEL, type LossCategory } from '../../sim/types'
import { Box, Kpi, Msg } from './common'
import { STARTERS, ScenarioAuthor } from './ScenarioAuthor'
import { call, fmt, useS } from './simApi'
import './scenarios.css'

export function ScenariosPage() {
  const live = useScenario((s) => s.live)
  const view = useScenario((s) => s.view)
  const history = useScenario((s) => s.history)
  if (live) return <Running live={live} />
  if (view.kind === 'author') return <ScenarioAuthor />
  if (view.kind === 'brief') {
    const sc = scenarioById(view.id)
    if (sc) return <Briefing sc={sc} />
  }
  if (view.kind === 'debrief') {
    const a = history.find((h) => h.id === view.attemptId) ?? useScenario.getState().last
    if (a && a.id === view.attemptId) return <Debrief a={a} />
  }
  return <Library />
}

const setView = (v: Parameters<ReturnType<typeof useScenario.getState>['setView']>[0]) => useScenario.getState().setView(v)
const fmtMin = (s: number) => `${Math.round(s / 60)} min`

// ================================================================= library

function Library() {
  const plant = usePlant()
  const history = useScenario((s) => s.history)
  const [diff, setDiff] = useState<'all' | Difficulty>('all')
  const [cat, setCat] = useState('all')
  const [plat, setPlat] = useState('all')
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState<'all' | 'mine'>('all')
  const [armClear, setArmClear] = useState(false)
  const compiled = useCustom((s) => s.compiled)
  const mine = useCustom((s) => s.items)
  const user = useAccount((s) => s.user)
  const all = useMemo(() => [...Object.values(compiled), ...SCENARIOS], [compiled])
  const cats = useMemo(() => [...new Set(all.map((s) => s.category))], [all])
  const plats = useMemo(() => [...new Set(all.flatMap((s) => s.platforms))], [all])
  const best = useMemo(() => {
    const m: Record<string, { best: number; n: number; pass: boolean }> = {}
    for (const a of history) {
      const x = (m[a.scenarioId] ??= { best: 0, n: 0, pass: false })
      x.n++
      x.best = Math.max(x.best, a.score)
      x.pass ||= a.pass
    }
    return m
  }, [history])
  const list = all.filter((s) => {
    if (owner === 'mine' && !compiled[s.id]) return false
    if (diff !== 'all' && s.difficulty !== diff) return false
    if (cat !== 'all' && s.category !== cat) return false
    if (plat !== 'all' && !s.platforms.includes(plat)) return false
    const t = q.trim().toLowerCase()
    return !t || `${s.title} ${s.summary} ${s.category}`.toLowerCase().includes(t)
  })
  return (
    <div className="h-grid scn">
      <NewScenario />
      <div className="h-filters">
        <div className="seg2">
          <button className={owner === 'all' ? 'on' : ''} onClick={() => setOwner('all')}>
            All scenarios
          </button>
          <button className={owner === 'mine' ? 'on' : ''} onClick={() => setOwner('mine')} data-scn="mine">
            Yours ({mine.length})
          </button>
        </div>
        <div className="seg2">
          {(['all', 'foundation', 'intermediate', 'advanced'] as const).map((d) => (
            <button key={d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>
              {d === 'all' ? 'All levels' : DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
        <label>
          Type
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Platform
          <select value={plat} onChange={(e) => setPlat(e.target.value)}>
            <option value="all">All</option>
            {plats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <input type="text" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="scn-grid" data-scn="library">
        {list.map((s) => {
          const na = unavailable(s, plant)
          const b = best[s.id]
          return (
            <button key={s.id} className={`scn-card ${na ? 'na' : ''}`} onClick={() => setView({ kind: 'brief', id: s.id })} data-scn-card={s.id}>
              <div className="scn-card-h">
                <b>{s.title}</b>
              </div>
              <div className="scn-tags">
                <span className={`scn-diff ${s.difficulty}`}>{DIFFICULTY_LABEL[s.difficulty]}</span>
                <span className="chip">{s.category}</span>
                {s.platforms.map((p) => (
                  <span key={p} className="chip dim">
                    {p}
                  </span>
                ))}
              </div>
              <p className="scn-sum">{s.summary}</p>
              <div className="scn-card-f">
                {compiled[s.id] && <span className="scn-by">{authorOf(mine.find((x) => x.id === s.id)?.by, user.name)}</span>}
                <span className="dim">≤ {fmtMin(s.maxDuration)}</span>
                <span className="dim">{s.goals.filter((g) => !g.optional).length} objectives</span>
                <span className="grow" />
                {na ? <span className="scn-na">Unavailable:{na}</span> : b ? <span className={`scn-best ${b.pass ? 'pass' : ''}`}>best {b.best} · {b.n}×</span> : <span className="faint">not attempted</span>}
              </div>
            </button>
          )
        })}
        {!list.length && <div className="h-empty">{owner === 'mine' && !mine.length ? 'You have not created a scenario yet.' : 'No scenario matches the filters.'}</div>}
      </div>
      <Box
        title={`Your attempts: ${history.length}`}
        right={
          history.length ? (
            armClear ? (
              <span className="h-row" style={{ textTransform: 'none', letterSpacing: 0 }}>
                <button className="danger armed" onClick={() => (useScenario.getState().clearHistory(), setArmClear(false))}>
                  Confirm clear
                </button>
                <button onClick={() => setArmClear(false)}>Cancel</button>
              </span>
            ) : (
              <button style={{ textTransform: 'none', letterSpacing: 0 }} onClick={() => setArmClear(true)}>
                Clear…
              </button>
            )
          ) : null
        }
      >
        {history.length === 0 ? (
          <div className="h-empty">No attempts yet.</div>
        ) : (
          <table className="h-tbl" data-tbl="scn-history">
            <thead>
              <tr>
                <th>Date</th>
                <th>Scenario</th>
                <th>Score</th>
                <th>Result</th>
                <th>Sim time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 20).map((a) => (
                <tr key={a.id}>
                  <td className="mono dim">{new Date(a.date).toLocaleString()}</td>
                  <td className="wrap">{a.title}</td>
                  <td className="num">{a.score}</td>
                  <td>{a.aborted ? <span className="dim">aborted</span> : a.pass ? <span className="scn-pass">pass</span> : <span className="scn-fail">fail</span>}</td>
                  <td className="mono">{fmtEl(a.duration)}</td>
                  <td className="act">
                    <button onClick={() => setView({ kind: 'debrief', attemptId: a.id })}>Debrief</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
    </div>
  )
}

const authorOf = (by: string | undefined, you: string) => (!by || by === you ? 'Created by you' : `Created by ${by}`)

/** one line to a new scenario: the builder takes it from there */
function NewScenario() {
  const user = useAccount((s) => s.user)
  const draft = useAuthor((s) => (s.chat.length ? (s.draft?.spec?.title ?? 'Untitled draft') : null))
  const [text, setText] = useState('')
  const open = (e: FormEvent) => {
    e.preventDefault()
    useAuthor.getState().begin(text.trim())
    setView({ kind: 'author' })
  }
  return (
    <section className="h-box scn-new" data-scn="new">
      <div className="scn-new-h">
        <h2>New scenario</h2>
        <span className="dim">Signed in as {user.name}</span>
      </div>
      <form className="scn-new-f" onSubmit={open}>
        <input type="text" placeholder="Describe what the trainee should face" aria-label="Describe the scenario" value={text} onChange={(e) => setText(e.target.value)} data-scn="quick" />
        <button type="submit" className="on" data-scn="author">
          {draft && !text.trim() ? 'Continue draft' : 'Build with AI'}
        </button>
      </form>
      <div className="scn-new-ideas">
        {STARTERS.map((s) => (
          <button key={s.label} className={text === s.text ? 'sel' : ''} onClick={() => setText(s.text)} data-scn-idea>
            {s.label}
          </button>
        ))}
        {draft && <span className="dim">In progress: {draft}</span>}
      </div>
    </section>
  )
}

// ================================================================= briefing

function Briefing({ sc }: { sc: Scenario }) {
  const plant = usePlant()
  const na = unavailable(sc, plant)
  const [msg, setMsg] = useState<string | null>(null)
  const go = (speed: number) => setMsg(useScenario.getState().start(sc.id, speed))
  const custom = useCustom((s) => s.items.find((x) => x.id === sc.id))
  const [armDelete, setArmDelete] = useState(false)
  return (
    <div className="h-grid scn" data-scn="brief">
      <div className="h-row">
        <button onClick={() => setView({ kind: 'library' })}>← Scenarios</button>
        <h2 className="scn-title">{sc.title}</h2>
        <span className={`scn-diff ${sc.difficulty}`}>{DIFFICULTY_LABEL[sc.difficulty]}</span>
        <span className="chip">{sc.category}</span>
        <span className="grow" />
        {!custom && (
          <button onClick={() => (useAuthor.getState().newChat(), useAuthor.getState().begin(`Make a harder variant of "${sc.title}": ${sc.summary}`), setView({ kind: 'author' }))} data-scn="variant">
            Make a variant
          </button>
        )}
        {custom && (
          <>
            <button onClick={() => (useAuthor.getState().edit(sc.id), setView({ kind: 'author' }))} data-scn="edit">
              Change in chat
            </button>
            {armDelete ? (
              <>
                <button className="danger armed" onClick={() => (useCustom.getState().remove(sc.id), setView({ kind: 'library' }))} data-scn="delete-confirm">
                  Confirm delete
                </button>
                <button onClick={() => setArmDelete(false)}>Cancel</button>
              </>
            ) : (
              <button className="danger" onClick={() => setArmDelete(true)} data-scn="delete">
                Delete…
              </button>
            )}
          </>
        )}
      </div>
      <p className="scn-lead">{sc.summary}</p>
      {custom && (
        <p className="h-note" data-scn="ai-note">
          Created {custom.by ? `by ${custom.by} ` : ''}with {custom.model}. Checked against this plant and run once unattended, but no engineer has reviewed it.
        </p>
      )}
      <div className="scn-brief">
        <Box title="Shift handover: initial conditions">
          <ul className="scn-ul">
            {sc.briefing.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </Box>
        <Box title="Learning objectives">
          <ul className="scn-ul">
            {sc.objectives.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </Box>
        <Box title="Your job">
          <ol className="scn-ul">
            {sc.expected.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ol>
        </Box>
        <Box title="How it is scored">
          <div className="kv2">
            <span>Safety</span>
            <span>{WEIGHTS.safety * 100} %</span>
            <span>Production (vs ideal)</span>
            <span>{WEIGHTS.production * 100} %</span>
            <span>Response time</span>
            <span>{WEIGHTS.time * 100} %</span>
            <span>Alarm handling</span>
            <span>{WEIGHTS.alarms * 100} %</span>
            <span>Each hint</span>
            <span>−{HINT_COST}</span>
            <span>Ideal response</span>
            <span>{sc.ideal.deferredBoe.toLocaleString()} boe deferred{custom ? ' (estimate)' : ''}</span>
            <span>Max duration</span>
            <span>{fmtMin(sc.maxDuration)} sim</span>
          </div>
          <p className="h-note" style={{ marginTop: 6 }}>
            {sc.ideal.note}. P1 alarms should be acknowledged within 2 min. A critical failure caps the score at 45; pass is 70.
          </p>
        </Box>
      </div>
      <Box title="Start">
        {na ? (
          <div className="h-msg">Not available in this plant: {na}</div>
        ) : (
          <>
            <p className="h-note">Starting resets the plant to normal operation and clears KPIs, alarms and the audit trail.</p>
            <div className="h-row" style={{ marginTop: 6 }}>
              <button className="on" onClick={() => go(1)} data-scn-start={sc.id}>
                Start at 1×
              </button>
              <button onClick={() => go(5)}>Start at 5×</button>
              <button onClick={() => go(20)}>Start at 20×</button>
            </div>
          </>
        )}
        <Msg text={msg} />
      </Box>
    </div>
  )
}

// ================================================================= running

const STATUS_ICON: Record<ObjStatus, string> = { waiting: '·', active: '○', done: '✓', late: '◷', missed: '✗', failed: '✗', kept: '✓', na: '–' }

function Running({ live }: { live: LiveView }) {
  const [arm, setArm] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const pct = Math.min(100, (live.el / live.max) * 100)
  return (
    <div className="h-grid scn" data-scn="running">
      <div className="scn-runhead">
        <div>
          <div className="dim" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Scenario running
          </div>
          <h2 className="scn-title">{live.title}</h2>
        </div>
        <div className="scn-clock mono" title="Elapsed time / maximum">
          {fmtEl(live.el)} <span className="dim">/ {fmtEl(live.max)}</span>
          <div className="scn-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="scn-count">
          <b className="mono">
            {live.done}/{live.total}
          </b>
          <span className="dim">objectives</span>
          {live.failed > 0 && <span className="scn-fail">{live.failed} failed</span>}
        </div>
        <span className="grow" />
        {arm ? (
          <span className="h-row">
            <button className="danger armed" onClick={() => (useScenario.getState().abort(), setArm(false))} data-scn="abort-confirm">
              Confirm abort
            </button>
            <button onClick={() => setArm(false)}>Cancel</button>
          </span>
        ) : (
          <button className="danger" onClick={() => setArm(true)} data-scn="abort">
            Abort…
          </button>
        )}
      </div>
      <div className="scn-run">
        <Box title="Objectives">
          <ul className="scn-obj" data-scn="objectives">
            {live.objectives.map((o) => (
              <li key={o.id} className={`${o.status} ${o.optional ? 'opt' : ''}`} data-obj={o.id} data-status={o.status}>
                <i>{STATUS_ICON[o.status]}</i>
                <span className="txt">
                  {o.text}
                  {o.critical && <span className="scn-crit" title="Critical: failing it fails the attempt">critical</span>}
                  {o.optional && <span className="faint"> (optional)</span>}
                </span>
                <span className="when mono">{objWhen(o, live.el)}</span>
              </li>
            ))}
          </ul>
        </Box>
        <div className="h-grid">
          <Box title="CCR & field actions">
            {live.actions.length === 0 ? (
              <div className="h-empty">No actions pending.</div>
            ) : (
              <div className="scn-acts">
                {live.actions.map((a) => (
                  <button key={a.id} disabled={!a.available} title={a.detail} onClick={() => setMsg(useScenario.getState().order(a.id))} className={a.who === 'field' ? 'field' : ''} data-scn-act={a.id}>
                    <span className="who">{a.who === 'field' ? 'FIELD' : 'CCR'}</span>
                    <span className="lbl">{a.label}</span>
                    {a.due !== undefined ? <span className="eta mono">ETA {fmtEl(Math.max(0, a.due - live.el))}</span> : a.done !== undefined ? <span className="eta ok">done</span> : null}
                  </button>
                ))}
              </div>
            )}
            <Msg text={msg} />
          </Box>
          <Box title="Reports">
            {live.reports.length === 0 ? (
              <div className="h-empty">No reports yet.</div>
            ) : (
              <ul className="scn-rep">
                {live.reports.map((r, i) => (
                  <li key={i}>
                    <span className="mono dim">{fmtEl(r.t)}</span> {r.text}
                  </li>
                ))}
              </ul>
            )}
          </Box>
          <NextActions />
          <LivePlant />
          <Box
            title={`Hints: ${live.hints.length}/${live.hintCount}`}
            right={
              live.hints.length < live.hintCount ? (
                <button style={{ textTransform: 'none', letterSpacing: 0 }} onClick={() => useScenario.getState().showHint()} data-scn="hint">
                  Show hint (−{HINT_COST})
                </button>
              ) : null
            }
          >
            {live.hints.length === 0 ? (
              <div className="h-empty">Hints cost {HINT_COST} points each.</div>
            ) : (
              <ol className="scn-ul">
                {live.hints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ol>
            )}
          </Box>
        </div>
      </div>
    </div>
  )
}

function objWhen(o: LiveView['objectives'][number], el: number): string {
  if (o.status === 'waiting') return 'not yet'
  if (o.status === 'na') return 'n/a'
  if (o.status === 'done' || o.status === 'late') return `${o.status === 'late' ? 'late · ' : ''}${fmtEl(o.at ?? 0)}`
  if (o.status === 'missed') return 'missed'
  if (o.status === 'failed') return `at ${fmtEl(o.at ?? 0)}`
  if (o.kind === 'avoid') return 'holding'
  if (o.window && o.since !== undefined) {
    const left = o.since + o.window - el
    return left >= 0 ? `due in ${fmtEl(left)}` : 'overdue'
  }
  return ''
}

function LivePlant() {
  const oil = useS((s) => s.result?.oilExport)
  const pe = useS((s) => s.result?.efficiency)
  const lvl = useS((s) => s.process?.hpLevel)
  const ia = useS((s) => s.process?.iaPressure)
  const cm = useS((s) => s.process?.cmTemp)
  const sm = useS((s) => s.process?.surgeMargin)
  const nsd = useS((s) => s.shutdowns?.length ?? 0)
  const speed = useS((s) => s.speed)
  return (
    <Box
      title="Plant"
      right={
        <span className="h-row" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {[1, 5, 20, 60].map((v) => (
            <button key={v} className={speed === v ? 'on' : ''} onClick={() => call('setSpeed', v)} style={{ padding: '1px 6px' }}>
              {v}×
            </button>
          ))}
        </span>
      }
    >
      <div className="h-kpis scn-kpis">
        <Kpi label="Oil export" value={fmt(oil)} unit="bbl/d" abn={(oil ?? 0) < 30000} />
        <Kpi label="PE now" value={fmt(pe, 1)} unit="%" abn={(pe ?? 100) < 90} />
        <Kpi label="HP level" value={fmt(lvl, 1)} unit="%" abn={(lvl ?? 0) >= 72} bad={(lvl ?? 0) >= 80} />
        <Kpi label="Instrument air" value={fmt(ia, 2)} unit="barg" abn={(ia ?? 9) < 7} bad={(ia ?? 9) < 6} />
        <Kpi label="Cooling medium" value={fmt(cm, 1)} unit="°C" abn={(cm ?? 0) >= 40} bad={(cm ?? 0) >= 50} />
        <Kpi label="K-2200 surge margin" value={fmt(sm, 0)} unit="%" abn={(sm ?? 50) < 15} bad={(sm ?? 50) < 5} />
        <Kpi label="Latched shutdowns" value={String(nsd)} bad={nsd > 0} />
      </div>
    </Box>
  )
}

// ================================================================= debrief

const CAT_LABEL: [keyof Attempt['breakdown'], string, number][] = [
  ['safety', 'Safety', WEIGHTS.safety],
  ['production', 'Production', WEIGHTS.production],
  ['time', 'Response time', WEIGHTS.time],
  ['alarms', 'Alarm handling', WEIGHTS.alarms],
]
const LANE_LABEL = { plant: 'Plant & alarms', operator: 'Operator', expected: 'Expected' } as const

function Debrief({ a }: { a: Attempt }) {
  const sc = scenarioById(a.scenarioId)
  const [all, setAll] = useState(false)
  const rows = all ? a.timeline : a.timeline.filter((r) => r.lane !== 'plant' || r.level === 'trip' || r.level === 'bad' || r.level === 'warn')
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="h-grid scn" data-scn="debrief">
      <div className="h-row">
        <button onClick={() => setView({ kind: 'library' })}>← Library</button>
        <h2 className="scn-title">Debrief:{a.title}</h2>
        <span className="dim mono">
          {new Date(a.date).toLocaleString()} · {fmtEl(a.duration)} sim
        </span>
        <span className="grow" />
        {sc && (
          <button className="on" onClick={() => setMsg(useScenario.getState().start(sc.id, 1))}>
            Try again
          </button>
        )}
      </div>
      <Msg text={msg} />
      <div className="scn-score">
        <div className={`scn-big ${a.pass ? 'pass' : 'fail'}`} data-scn-score={a.score}>
          <b className="mono">{a.score}</b>
          <span>{a.aborted ? 'ABORTED' : a.pass ? 'PASS' : 'NOT YET'}</span>
        </div>
        <div className="scn-bars">
          {CAT_LABEL.map(([k, label, w]) => (
            <div key={k} className="scn-barrow">
              <span>
                {label} <span className="faint">× {w * 100} %</span>
              </span>
              <div className="scn-bar big">
                <i style={{ width: `${a.breakdown[k]}%` }} className={a.breakdown[k] < 50 ? 'bad' : a.breakdown[k] < 80 ? 'abn' : ''} />
              </div>
              <b className="mono">{a.breakdown[k]}</b>
            </div>
          ))}
          {a.breakdown.hints > 0 && (
            <div className="scn-barrow">
              <span>Hints</span>
              <span />
              <b className="mono">−{a.breakdown.hints}</b>
            </div>
          )}
        </div>
      </div>
      <div className="scn-brief">
        <Box title={`Failures: ${a.failures.length}`} className={a.failures.length ? 'scn-bad' : ''}>
          {a.failures.length ? (
            <ul className="scn-ul" data-scn="failures">
              {a.failures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <div className="h-empty">None.</div>
          )}
        </Box>
        <Box title="What went well" className="scn-good">
          {a.wentWell.length ? (
            <ul className="scn-ul">
              {a.wentWell.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <div className="h-empty">-</div>
          )}
        </Box>
        <Box title="To improve">
          {a.improve.length ? (
            <ul className="scn-ul">
              {a.improve.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <div className="h-empty">Nothing: textbook.</div>
          )}
        </Box>
        <KpiTable a={a} />
      </div>
      <Box title="Objectives">
        <ul className="scn-obj">
          {a.objectives.map((o) => (
            <li key={o.id} className={o.status}>
              <i>{STATUS_ICON[o.status]}</i>
              <span className="txt">{o.text}</span>
              <span className="when mono">
                {o.status === 'na' ? 'not needed' : o.status === 'kept' ? 'kept' : o.at !== undefined ? `${o.status} · ${fmtEl(o.at)}${o.from !== undefined && o.window ? ` (cue ${fmtEl(o.from)}, target ${fmtEl(o.window)})` : ''}` : o.status}
              </span>
            </li>
          ))}
        </ul>
      </Box>
      <Box
        title="Timeline: plant vs operator vs expected"
        right={
          <label style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> all plant events
          </label>
        }
      >
        <table className="h-tbl scn-tl" data-tbl="scn-timeline">
          <thead>
            <tr>
              <th style={{ width: 60 }}>Time</th>
              <th>{LANE_LABEL.plant}</th>
              <th>{LANE_LABEL.operator}</th>
              <th>{LANE_LABEL.expected}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`lv-${r.level ?? 'info'}`}>
                <td className="mono dim">{fmtEl(r.t)}</td>
                <td className="wrap">{r.lane === 'plant' ? r.text : r.lane === 'scenario' ? <i className="scn-inj">{r.text}</i> : null}</td>
                <td className="wrap">{r.lane === 'operator' ? r.text : null}</td>
                <td className="wrap">{r.lane === 'expected' ? r.text : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </div>
  )
}

function KpiTable({ a }: { a: Attempt }) {
  const b = a.before
  const f = a.after
  const row = (label: string, x: number, y: number, d = 0, unit = '') => (
    <tr key={label}>
      <td>{label}</td>
      <td className="num">{fmt(x, d)}</td>
      <td className="num">{fmt(y, d)}</td>
      <td className="faint">{unit}</td>
    </tr>
  )
  const cats = Object.entries(a.window.byCategory).sort((x, y) => y[1] - x[1])
  return (
    <Box title="KPIs: before / after">
      <table className="h-tbl">
        <thead>
          <tr>
            <th />
            <th>Start</th>
            <th>End</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {row('Oil export', b.oil, f.oil, 0, 'bbl/d')}
          {row('Gas export', b.gas, f.gas, 1, 'MMscfd')}
          {row('Flare', b.flare, f.flare, 1, 'MMscfd')}
          {row('PE now', b.peNow, f.peNow, 1, '%')}
          {row('Session PE', b.pe, f.pe, 1, '%')}
          {row('Availability', b.availability, f.availability, 1, '%')}
          {row('Trips', b.trips, f.trips)}
          {row('Shutdowns', b.shutdowns, f.shutdowns)}
          {row('Alarms / 10 min', b.alarmRate, f.alarmRate)}
        </tbody>
      </table>
      <div className="kv2" style={{ marginTop: 8 }}>
        <span>Deferred production</span>
        <span>
          {fmt(a.window.deferred)} boe <span className="faint">(ideal {fmt(a.window.idealDeferred)}, all lost {fmt(a.window.fullLoss)})</span>
        </span>
        <span>PE over the scenario</span>
        <span>{fmt(a.window.pe, 1)} %</span>
        {cats.map(([k, v]) => (
          <Fragment key={k}>
            <span className="faint">· {LOSS_LABEL[k as LossCategory] ?? k}</span>
            <span>{fmt(v)} boe</span>
          </Fragment>
        ))}
        <span>P1 / P2 alarms</span>
        <span>
          {a.alarms.p1} / {a.alarms.p2} <span className="faint">({a.alarms.p1Late + a.alarms.p2Late} late{a.alarms.meanAckS !== null ? `, mean ack ${Math.round(a.alarms.meanAckS)} s` : ''})</span>
        </span>
        {f.latched.length > 0 && (
          <>
            <span>Still latched at the end</span>
            <span>{f.latched.join(', ')}</span>
          </>
        )}
      </div>
    </Box>
  )
}
