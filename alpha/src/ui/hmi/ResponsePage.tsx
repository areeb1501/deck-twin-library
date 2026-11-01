/**
 * Response: what is wrong, what to do next and why. Left, every open situation. Right, its plan: ordered steps, each with a one-line
 * reason and the data behind it, and a button where the plant can be commanded from here. Every button takes a second click, and the
 * plant is read afterwards to prove it happened. The RCM tab holds the example failure modes the plans start from. Logic:
 * agents/nextAction.ts, agents/plantActions.ts, sim/rcm.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import { AUTHOR_PROVIDERS, modelOf, priceOf } from '../../agents/authorProvider'
import { CAP_REQUESTS, CAP_TOKENS, inPlace, overLimit, readSituations, useResponse, type Evidence, type Plan, type Situation, type Stage, type Step } from '../../agents/nextAction'
import { isDanger, labelOf, tagOf } from '../../agents/plantActions'
import { useAuthor } from '../../agents/scenarioAuthor'
import { CLASS_DATA, type MachineClass } from '../../sim/alpha'
import { rpn, useRcm, type RcmRow } from '../../sim/rcm'
import { simTags } from '../../state/sim'
import { Connection } from './ScenarioAuthor'
import { Box, TagLink } from './common'
import { useS } from './simApi'
import './scenarios.css'
import './response.css'

const STAGE: Record<Exclude<Stage, 'idle'>, string> = {
  thinking: 'Muse is working through the evidence…',
  writing: 'Writing the plan…',
  checking: 'Checking every step against the plant…',
}

const CLASS_LABEL: Record<MachineClass, string> = { pump: 'Pumps', caisson: 'Caisson pumps', compressor: 'Compressors', gtg: 'Turbine generators', ia: 'Instrument air', rig: 'Drilling rig', skid: 'Chemical skids' }

/** a name for the model that wrote a plan */
function modelName(model: string) {
  if (/wonder/i.test(model)) return 'Muse Wonder'
  if (/open/i.test(model)) return 'Muse Spark Open'
  return `Muse Spark ${model.split('-').pop() ?? ''}`.trim()
}

/** every sim tick: situations come and go, and steps get verified */
function useSituations() {
  const t = useS((s) => s.t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readSituations(), [t])
}

export function ResponsePage() {
  const [tab, setTab] = useState<'next' | 'rcm'>('next')
  const [plantOk] = useState(() => simTags().alpha)
  if (!plantOk) return <div className="h-msg">Response runs on the Alpha field. Load it from the plant menu to use it here.</div>
  return (
    <div className="rsp" data-rsp="page">
      <div className="h-row">
        <h2 className="scn-title">Response</h2>
        <span className="seg2">
          <button className={tab === 'next' ? 'on' : ''} onClick={() => setTab('next')} data-rsp="tab-next">
            Next action
          </button>
          <button className={tab === 'rcm' ? 'on' : ''} onClick={() => setTab('rcm')} data-rsp="tab-rcm">
            RCM library
          </button>
        </span>
      </div>
      {tab === 'next' ? <Workspace /> : <RcmLibrary />}
    </div>
  )
}

// ================================================================= next action

function Workspace() {
  const list = useSituations()
  const [sel, setSel] = useState<string | null>(null)
  const cur = list.find((x) => x.id === sel) ?? list[0] ?? null
  return (
    <div className="rsp-grid">
      <Box title={`Open now: ${list.length}`} className="rsp-list">
        {!list.length && (
          <div className="h-empty" data-rsp="quiet">
            No open situations.
          </div>
        )}
        {list.map((x) => (
          <button key={x.id} className={`rsp-sit ${x.severity} ${cur?.id === x.id ? 'sel' : ''}`} onClick={() => setSel(x.id)} data-rsp-sit={x.id}>
            <b>{x.title}</b>
            <span className="dim">{x.detail}</span>
          </button>
        ))}
      </Box>
      {cur ? <PlanCard sit={cur} /> : <Box title="Next steps" className="rsp-plan"><div className="h-empty">Select a situation.</div></Box>}
    </div>
  )
}

/** the same card beside a running scenario: the worst situation, or the one picked */
export function NextActions() {
  const list = useSituations()
  const [sel, setSel] = useState<string | null>(null)
  const cur = list.find((x) => x.id === sel) ?? list[0] ?? null
  if (!cur) return <Box title="Next action"><div className="h-empty">Nothing needs a decision yet.</div></Box>
  return (
    <div className="rsp-compact" data-rsp="compact">
      {list.length > 1 && (
        <select value={cur.id} onChange={(e) => setSel(e.target.value)} aria-label="Situation">
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
      )}
      <PlanCard sit={cur} />
    </div>
  )
}

function Usage() {
  const u = useResponse((s) => s.usage)
  const provider = useAuthor((s) => s.provider)
  const model = modelOf(AUTHOR_PROVIDERS[provider], useAuthor((s) => s.models[provider]))
  const price = priceOf(model)
  if (!u.requests) return <span className="scn-usage dim">{price ? `$${price.in} in, $${price.out} out per M tokens` : 'no list price known'}</span>
  return (
    <span className={`scn-usage mono ${overLimit(u) ? 'bad' : ''}`} title={`Stops at ${CAP_REQUESTS} requests or ${CAP_TOKENS.toLocaleString()} tokens a page load. The dollar figure is tokens × list price, an estimate and not your bill.`} data-rsp="usage">
      {u.requests} req · {(u.input + u.output).toLocaleString()} tokens{u.usd !== null ? ` · ≈ $${u.usd.toFixed(3)}` : ''}
    </span>
  )
}

function PlanCard({ sit }: { sit: Situation }) {
  const plan = useResponse((s) => s.plans[sit.id])
  useEffect(() => useResponse.getState().ensure(sit), [sit.id, sit.causeId]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Box title={sit.title} className={`rsp-plan ${sit.severity}`} right={plan && <SourceBadge plan={plan} />}>
      {plan?.summary && <p className="rsp-summary" data-rsp="summary">{plan.summary}</p>}
      <AskBar sit={sit} plan={plan} />
      {plan && (
        <>
          <ol className="rsp-steps" data-rsp="steps">
            {plan.steps.map((x, i) => (
              <StepRow key={x.id} step={x} n={i + 1} situation={sit.id} evidence={plan.evidence} />
            ))}
          </ol>
          {plan.dropped.length > 0 && <div className="h-note">Left out by the plant checks: {plan.dropped.join(' ')}</div>}
          <EvidenceList evidence={plan.evidence} />
        </>
      )}
    </Box>
  )
}

function SourceBadge({ plan }: { plan: Plan }) {
  if (plan.source === 'rules') return <span className="rsp-src">Rule plan: RCM and cause and effect</span>
  return <span className="rsp-src ai" data-rsp="source-model">{modelName(plan.model ?? '')}, checked against the plant</span>
}

function AskBar({ sit, plan }: { sit: Situation; plan?: Plan }) {
  const stage = useResponse((s) => s.stage)
  const asking = useResponse((s) => s.asking)
  const note = useResponse((s) => s.note)
  const usage = useResponse((s) => s.usage)
  const provider = useAuthor((s) => s.provider)
  const needsEndpoint = useAuthor((s) => AUTHOR_PROVIDERS[s.provider].endpoint && !s.endpoint)
  const needsKey = useAuthor((s) => s.saved[s.provider] === false)
  const [setup, setSetup] = useState(false)
  const busy = stage !== 'idle'
  const here = asking === sit.id
  const tried = plan?.steps.some((x) => x.state !== 'todo')
  const label = plan?.source === 'model' || tried ? 'Re-plan with Muse Spark' : 'Ask Muse Spark'
  return (
    <>
      <div className="rsp-ask">
        {here ? (
          <>
            <span className="scn-pending">{stage !== 'idle' && STAGE[stage]}</span>
            <button onClick={() => useResponse.getState().stop()} data-rsp="stop">
              Stop
            </button>
          </>
        ) : (
          <button className="on" disabled={busy || overLimit(usage)} onClick={() => (needsEndpoint || needsKey ? setSetup(true) : void useResponse.getState().ask(sit))} data-rsp="ask">
            {label}
          </button>
        )}
        <span className="dim">One press, one billed request, plus one repair if the plant checks fail.</span>
        <span className="grow" />
        <Usage />
        <button className={`scn-setup-btn ${setup ? 'open' : ''}`} aria-expanded={setup} onClick={() => setSetup(!setup)} data-rsp="setup">
          Model: {AUTHOR_PROVIDERS[provider].label}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg>
        </button>
      </div>
      {setup && <Connection />}
      {note && <div className="h-msg" data-rsp="note">{note}</div>}
    </>
  )
}

const PILL: Record<Step['state'], string> = { todo: '', sent: 'Sent, checking the plant…', met: 'Verified on the plant', notMet: 'Not verified', refused: 'Refused', done: 'Done' }

function StepRow({ step, n, situation, evidence }: { step: Step; n: number; situation: string; evidence: Evidence[] }) {
  useS((s) => s.t)
  const [armed, setArmed] = useState(false)
  const manual = step.action.kind === 'manual'
  const already = step.state === 'todo' && inPlace(step.action)
  const open = !already && (step.state === 'todo' || step.state === 'refused' || step.state === 'notMet')
  const tag = tagOf(step.action)
  const act = () => {
    setArmed(false)
    useResponse.getState().act(situation, step.id)
  }
  return (
    <li className={`rsp-step ${step.state} ${already ? 'already' : ''}`} data-rsp-step={step.state}>
      <span className="rsp-n mono">{n}</span>
      <div className="rsp-body">
        <div className="rsp-text">
          {step.text}
          {tag && (
            <span className="rsp-tag">
              <TagLink tag={tag} />
            </span>
          )}
        </div>
        <div className="rsp-why">{step.why}</div>
        <div className="rsp-cites">
          {step.evidence.map((id) => {
            const e = evidence.find((x) => x.id === id)
            return (
              <span key={id} className="rsp-cite" title={e?.label}>
                {id}
              </span>
            )
          })}
          {(already || PILL[step.state]) && <span className={`rsp-pill ${already ? 'met' : step.state}`} data-rsp="pill">{already ? 'Already in place' : step.action.kind === 'scenario' && step.state === 'met' ? 'Ordered' : PILL[step.state]}</span>}
          {step.refusal && <span className="rsp-refusal">{step.refusal}</span>}
        </div>
      </div>
      <div className="rsp-act">
        {open && manual && <button onClick={() => useResponse.getState().markDone(situation, step.id)} data-rsp="mark">Mark done</button>}
        {open && !manual && !armed && (
          <button className={isDanger(step.action) ? 'danger' : ''} onClick={() => setArmed(true)} data-rsp="arm">
            {step.state === 'todo' ? labelOf(step.action) : 'Try again'}
          </button>
        )}
        {open && !manual && armed && (
          <>
            <span className="rsp-sure">Are you sure?</span>
            <button className="danger armed" onClick={act} data-rsp="confirm">
              Confirm
            </button>
            <button onClick={() => setArmed(false)}>Cancel</button>
          </>
        )}
      </div>
    </li>
  )
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <details className="rsp-evidence">
      <summary>The data behind this plan: {evidence.length} sources</summary>
      <ul>
        {evidence.map((e) => (
          <li key={e.id}>
            <button className="link" onClick={() => setOpen(open === e.id ? null : e.id)}>
              <span className="mono">{e.id}</span> {e.label}
            </button>
            {open === e.id && <pre>{JSON.stringify(e.data, null, 1)}</pre>}
          </li>
        ))}
      </ul>
    </details>
  )
}

// ================================================================= RCM library

const groupLabel = (r: RcmRow) => (r.scope === 'event' ? 'Process, fire, gas' : (CLASS_LABEL[r.appliesTo as MachineClass] ?? r.appliesTo))

function RcmLibrary() {
  const rows = useRcm((s) => s.rows)
  const [group, setGroup] = useState<string>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [armReset, setArmReset] = useState(false)
  const view = useMemo(() => rows.filter((r) => group === 'all' || (group === 'event' ? r.scope === 'event' : r.appliesTo === group)).sort((a, b) => rpn(b) - rpn(a)), [rows, group])
  const add = () => {
    const cls = group !== 'all' && group !== 'event' ? group : 'pump'
    setOpenId(group === 'event' ? useRcm.getState().add('event', 'fire-confirmed') : useRcm.getState().add('machine', cls))
  }
  return (
    <div className="rsp-rcm" data-rsp="rcm">
      <div className="h-row">
        <span className="seg2">
          <button className={group === 'all' ? 'on' : ''} onClick={() => setGroup('all')}>All</button>
          <button className={group === 'event' ? 'on' : ''} onClick={() => setGroup('event')}>Process, fire and gas</button>
          {(Object.keys(CLASS_DATA) as MachineClass[]).map((c) => (
            <button key={c} className={group === c ? 'on' : ''} onClick={() => setGroup(c)}>
              {CLASS_LABEL[c]}
            </button>
          ))}
        </span>
        <span className="grow" />
        <button onClick={add} data-rsp="rcm-add">Add a failure mode</button>
        {armReset ? (
          <button className="danger armed" onClick={() => (useRcm.getState().reset(), setArmReset(false), setOpenId(null))} data-rsp="rcm-reset-confirm">
            Confirm reset
          </button>
        ) : (
          <button onClick={() => setArmReset(true)} data-rsp="rcm-reset">Reset to examples</button>
        )}
      </div>
      <p className="h-note">Edits are saved in this browser and apply straight away.</p>
      <div className="rsp-table">
        <table className="h-table">
          <thead>
            <tr>
              <th>Applies to</th>
              <th>Failure mode</th>
              <th>Effect</th>
              <th title="Severity × occurrence × detection">RPN</th>
              <th>Task</th>
              <th>Every</th>
            </tr>
          </thead>
          <tbody>
            {view.flatMap((r) => [
              <tr key={r.id} className={openId === r.id ? 'on' : ''} onClick={() => setOpenId(openId === r.id ? null : r.id)} data-rsp-row={r.id}>
                <td className="dim">{groupLabel(r)}</td>
                <td>
                  {r.failure}
                  {r.edited && <span className="rsp-edited">edited</span>}
                </td>
                <td className="dim">{r.effect}</td>
                <td className="mono">{rpn(r)}</td>
                <td className="dim">{r.task}</td>
                <td className="dim">{r.interval}</td>
              </tr>,
              openId === r.id ? (
                <tr key={`${r.id}:edit`} className="rsp-editrow">
                  <td colSpan={6}>
                    <RcmEditor row={r} onDelete={() => (useRcm.getState().remove(r.id), setOpenId(null))} />
                  </td>
                </tr>
              ) : null,
            ])}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RcmEditor({ row, onDelete }: { row: RcmRow; onDelete: () => void }) {
  const set = (patch: Partial<RcmRow>) => useRcm.getState().update(row.id, patch)
  const text = (key: 'failure' | 'effect' | 'signal' | 'task' | 'interval', label: string) => (
    <label>
      <span className="dim">{label}</span>
      <input type="text" value={row[key]} onChange={(e) => set({ [key]: e.target.value })} data-rsp-field={key} />
    </label>
  )
  const score = (key: 'severity' | 'occurrence' | 'detection', label: string) => (
    <label>
      <span className="dim">{label}</span>
      <input type="number" min={1} max={10} value={row[key]} onChange={(e) => set({ [key]: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} data-rsp-field={key} />
    </label>
  )
  const step = (i: number, patch: Partial<RcmRow['response'][number]>) => set({ response: row.response.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  return (
    <div className="rsp-editor" onKeyDown={(e) => e.stopPropagation()}>
      <div className="rsp-fields">
        {text('failure', 'Failure mode')}
        {text('effect', 'Effect')}
        {text('signal', 'How it shows')}
        {text('task', 'Proactive task')}
        {text('interval', 'Every')}
      </div>
      <div className="rsp-scores">
        {score('severity', 'Severity')}
        {score('occurrence', 'Occurrence')}
        {score('detection', 'Detection')}
        <span className="mono">RPN {rpn(row)}</span>
        <span className="grow" />
        <button className="danger" onClick={onDelete} data-rsp="rcm-delete">Delete row</button>
      </div>
      <div className="dim">Recommended response, in order</div>
      {row.response.map((x, i) => (
        <div className="rsp-resp" key={i}>
          <span className="mono dim">{i + 1}</span>
          <input type="text" value={x.text} aria-label="Step" onChange={(e) => step(i, { text: e.target.value })} />
          <input type="text" value={x.why} aria-label="Why" onChange={(e) => step(i, { why: e.target.value })} />
          <button onClick={() => set({ response: row.response.filter((_, j) => j !== i) })} aria-label="Remove step">×</button>
        </div>
      ))}
      <button onClick={() => set({ response: [...row.response, { do: 'check', text: 'New step', why: 'Why this step matters.' }] })}>Add a step</button>
    </div>
  )
}
