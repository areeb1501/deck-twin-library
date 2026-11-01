/**
 * Build a training scenario by talking to a model. The operator brings a provider and a key, and every Send is one billed
 * request they chose to make, with the running count on screen. Three full-height panes: the conversation, the draft with what
 * the plant check and the unattended run found, and the model connection in a sidebar. Logic: agents/scenarioAuthor.ts.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AUTHOR_PROVIDERS, modelOf, priceOf, type AuthorProviderId } from '../../agents/authorProvider'
import { CAP_REQUESTS, CAP_TOKENS, MAX_REPAIRS, needsSetup, overLimit, useAuthor, type Stage } from '../../agents/scenarioAuthor'
import { cleanKey } from '../../safety/metaKey'
import type { ChatLine } from '../../sim/scen/custom'
import { DIFFICULTY_LABEL } from '../../sim/scen/types'
import { fmtEl } from '../../sim/scen/helpers'
import { useScenario } from '../../sim/scenarios'
import { simTags } from '../../state/sim'
import { Box, Msg } from './common'

const STAGE: Record<Exclude<Stage, 'idle'>, string> = {
  thinking: 'Thinking…',
  writing: 'Writing…',
  checking: 'Checking it against the plant…',
  testing: 'Running it once with nobody at the console…',
}

export const STARTERS = [
  { label: 'Pump trip during a crane lift', text: 'A seawater pump trips on a windy night while a crane lift is under way, and the standby is slow to come back.' },
  { label: 'Gas leak with a detector out', text: 'A small gas leak near the export pumps that only one detector can see, with another detector already out of service.' },
  { label: 'Export blocked during a trip', text: 'Oil export gets blocked while the operator is already dealing with a compressor trip.' },
  { label: 'Stuck ESD valve in a fire', text: 'A stuck ESD valve during a fire in the compression area.' },
]

const setLibrary = () => useScenario.getState().setView({ kind: 'library' })

export function ScenarioAuthor() {
  const chat = useAuthor((s) => s.chat)
  const newChat = useAuthor((s) => s.newChat)
  const editing = useAuthor((s) => s.editing)
  const [plantOk] = useState(() => simTags().alpha)
  return (
    <div className="scn scn-workspace" data-scn="author">
      <div className="h-row">
        <button onClick={setLibrary}>← Scenarios</button>
        <h2 className="scn-title">{editing ? 'Change scenario' : 'New scenario'}</h2>
        <span className="grow" />
        <button onClick={newChat} disabled={!chat.length}>
          New conversation
        </button>
      </div>
      {plantOk ? (
        <div className="scn-author">
          <Conversation />
          <DraftCard />
          <Connection />
        </div>
      ) : (
        <div className="h-msg">Scenarios run on the Alpha field. Load it from the plant menu to build one here.</div>
      )}
    </div>
  )
}

// ================================================================= conversation

function Conversation() {
  const chat = useAuthor((s) => s.chat)
  const stage = useAuthor((s) => s.stage)
  const partial = useAuthor((s) => s.partial)
  const note = useAuthor((s) => s.note)
  const needs = useAuthor(needsSetup)
  const seed = useAuthor((s) => s.seed)
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const busy = stage !== 'idle'
  useEffect(() => {
    const list = end.current?.parentElement
    if (list) list.scrollTop = list.scrollHeight
  }, [chat.length, partial, stage])
  useEffect(() => {
    if (!seed) return
    setText(seed)
    useAuthor.setState({ seed: '' })
  }, [seed])
  const send = () => {
    const t = text.trim()
    if (!t || busy || needs) return
    setText('')
    void useAuthor.getState().send(t)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }
  // the JSON stays out of the chat: it arrives in the draft card once it has been checked
  const shown = partial.split('```')[0].trim()
  return (
    <Box title="Conversation" className="scn-pane">
      <div className="scn-chat" data-scn="chat">
        {!chat.length && !busy && (
          <div className="scn-start">
            <p className="h-note">Describe the exercise. Nothing is sent until you press Send.</p>
            <div className="scn-starters">
              {STARTERS.map((s) => (
                <button key={s.label} onClick={() => setText(s.text)} data-scn-starter>
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((l) => (
          <Line key={l.id} l={l} />
        ))}
        {busy && (
          <div className="scn-msg assistant live" data-scn="pending">
            {shown && <p>{shown}</p>}
            <span className="dim">{STAGE[stage as Exclude<Stage, 'idle'>]}</span>
          </div>
        )}
        <div ref={end} />
      </div>
      <Msg text={note || needs} />
      <form
        className="scn-compose"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          send()
        }}
      >
        <textarea rows={3} value={text} placeholder="What should the trainee face?" aria-label="Message to the model" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} data-scn="input" />
        {busy ? (
          <button type="button" className="danger" onClick={() => useAuthor.getState().stop()} data-scn="stop">
            Stop
          </button>
        ) : (
          <button type="submit" className="on" disabled={!text.trim() || !!needs} data-scn="send">
            Send
          </button>
        )}
      </form>
    </Box>
  )
}

function Line({ l }: { l: ChatLine }) {
  if (l.role === 'check') {
    return (
      <details className="scn-msg check">
        <summary>The checks found a problem, so this went back to the model</summary>
        <p>{l.text}</p>
      </details>
    )
  }
  return (
    <div className={`scn-msg ${l.role}`}>
      {l.text && <p>{l.text}</p>}
      {l.specJson && <span className="chip">Scenario sent to the draft</span>}
    </div>
  )
}

// ================================================================= connection

export function Connection() {
  const provider = useAuthor((s) => s.provider)
  const saved = useAuthor((s) => s.saved[provider])
  const endpoint = useAuthor((s) => s.endpoint)
  const chosen = useAuthor((s) => s.models[provider])
  const needs = useAuthor(needsSetup)
  const a = useAuthor.getState()
  const p = AUTHOR_PROVIDERS[provider]
  const model = modelOf(p, chosen)
  const [draft, setDraft] = useState('')
  const key = cleanKey(draft)
  const ready = saved === true && !needs
  return (
    <Box title="Model" right={<span className={`scn-state ${ready ? 'ok' : ''}`} data-scn="state">{ready ? 'Connected' : 'Not connected'}</span>} className="scn-setup">
      <div className="scn-setup-body" data-scn="setup">
        <div className="scn-prov" role="radiogroup" aria-label="Provider" data-scn="providers">
          {(Object.keys(AUTHOR_PROVIDERS) as AuthorProviderId[]).map((id) => (
            <button role="radio" aria-checked={id === provider} className={id === provider ? 'on' : ''} onClick={() => (a.setProvider(id), setDraft(''))} data-scn-provider={id} key={id}>
              {AUTHOR_PROVIDERS[id].label}
            </button>
          ))}
        </div>
        <div className="scn-conn">
          {p.endpoint && (
            <label>
              Endpoint
              <input type="url" spellCheck={false} autoComplete="off" placeholder="https://….us-west.modal.direct" value={endpoint} onChange={(e) => a.setEndpoint(e.target.value)} data-scn="endpoint" />
            </label>
          )}
          {saved ? (
            <div className="scn-saved">
              <span>Key saved</span>
              <button className="link" onClick={() => void a.forgetProviderKey()} data-scn="forget">
                Remove
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!key) return
                void a.saveProviderKey(key)
                setDraft('')
              }}
            >
              <label>
                API key
                <input type="password" autoComplete="off" spellCheck={false} placeholder={p.keyPlaceholder} aria-label={`${p.label} key`} value={draft} onChange={(e) => setDraft(e.target.value)} data-scn="key" />
              </label>
              <button type="submit" disabled={!key} data-scn="save-key">
                Save key
              </button>
            </form>
          )}
          {p.models.length > 1 ? (
            <label>
              Model
              <select value={model} onChange={(e) => a.setModel(e.target.value)} data-scn="model">
                {p.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="scn-model">
              Model
              <span className="mono" data-scn="model-fixed">{model}</span>
            </div>
          )}
        </div>
        <Usage />
        <p className="h-note">
          Billed to your {p.endpoint ? 'Modal' : p.id === 'meta' ? 'Meta' : 'Baseten'} account. Your key stays encrypted in this browser. One Send can use up to {1 + MAX_REPAIRS} requests.
        </p>
      </div>
    </Box>
  )
}

function Usage() {
  const u = useAuthor((s) => s.usage)
  const provider = useAuthor((s) => s.provider)
  const model = modelOf(AUTHOR_PROVIDERS[provider], useAuthor((s) => s.models[provider]))
  const price = priceOf(model)
  if (!u.requests) return <div className="scn-usage" data-scn="price">{price ? `$${price.in} in, $${price.out} out per M tokens` : 'No list price known'}</div>
  const tokens = u.input + u.output
  return (
    <div className={`scn-usage mono ${overLimit(u) ? 'bad' : ''}`} title={`Stops at ${CAP_REQUESTS} requests or ${CAP_TOKENS.toLocaleString()} tokens a page load. The dollar figure is tokens × list price, an estimate and not your bill.`} data-scn="usage">
      {u.requests} req · {tokens.toLocaleString()} tokens{u.usd !== null ? ` · ≈ $${u.usd.toFixed(3)}` : ''}
    </div>
  )
}

// ================================================================= draft

function DraftCard() {
  const draft = useAuthor((s) => s.draft)
  const editing = useAuthor((s) => s.editing)
  const busy = useAuthor((s) => s.stage !== 'idle')
  const [msg, setMsg] = useState<string | null>(null)
  if (!draft) {
    return (
      <Box title="Draft" className="scn-pane">
        <div className="h-empty">Your scenario appears here.</div>
      </Box>
    )
  }
  const { spec, errors, warnings, report } = draft
  const blockers = report?.blockers ?? []
  const ok = !!spec && !errors.length && !blockers.length
  const save = (open: boolean) => {
    const why = useAuthor.getState().save()
    setMsg(why ?? '✓ Saved to your scenarios.')
    const id = useAuthor.getState().editing
    if (!why && open && id) useScenario.getState().setView({ kind: 'brief', id })
  }
  return (
    <Box title={editing ? 'Draft: changing a saved scenario' : 'Draft'} className="scn-pane">
      <div className="scn-draft" data-scn="draft">
        {spec && (
          <div className="scn-draft-head">
            <b className="scn-draft-title">{spec.title}</b>
            <div className="scn-tags">
              <span className={`scn-diff ${spec.difficulty}`}>{DIFFICULTY_LABEL[spec.difficulty]}</span>
              <span className="chip">{spec.category}</span>
              <span className="chip dim">≤ {Math.round(spec.maxDuration / 60)} min</span>
              <span className="chip dim">{spec.goals.filter((g) => !g.optional).length} objectives</span>
            </div>
            <p className="scn-sum full">{spec.summary}</p>
          </div>
        )}
        <ul className="scn-checks" data-scn="checks">
          <li className={errors.length ? 'bad' : 'ok'}>{errors.length ? `${errors.length} problem${errors.length > 1 ? 's' : ''} against this plant` : 'Tags, valves, zones and references exist on this plant'}</li>
          {report && <li className={blockers.length ? 'bad' : 'ok'}>{blockers.length ? 'The unattended run found problems' : `Unattended run: ${report.fired.length} of ${report.fired.length + report.quiet.length} steps fired in ${fmtEl(report.seconds)}, ${report.alarms.length} alarms, ${worst(report)}, ${report.deferredBoe.toLocaleString()} boe lost, idle score ${report.idleScore}`}</li>}
        </ul>
        {!!(errors.length || blockers.length) && (
          <ul className="scn-ul scn-problems" data-scn="problems">
            {[...errors, ...blockers].slice(0, 10).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        {!ok && <p className="h-note">Tell the model what to change, or ask it to fix these.</p>}
        {!!warnings.length && (
          <ul className="scn-ul dim">
            {warnings.slice(0, 4).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {report && !!report.unreached.length && (
          <p className="h-note scn-warn" data-scn="unreached">
            Never reached with nobody responding, though nothing in them waits on the operator: {report.unreached.join(', ')}. If the briefing says these happen, ask the model to fix it.
          </p>
        )}
        {spec && (
          <>
            <details className="scn-more" open>
              <summary>What happens</summary>
              <ol className="scn-ul">
                {spec.expected.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ol>
            </details>
            <details className="scn-more" open>
              <summary>What is asked</summary>
              <ul className="scn-ul">
                {spec.goals.map((g) => (
                  <li key={g.id}>
                    {g.kind === 'avoid' ? 'Avoid: ' : ''}
                    {g.text}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
      <div className="scn-draft-foot">
        <div className="h-row">
          <button className="on" disabled={!ok || busy} onClick={() => save(true)} data-scn="save-open">
            Save and open briefing
          </button>
          <button disabled={!ok || busy} onClick={() => save(false)} data-scn="save">
            Save
          </button>
        </div>
        <Msg text={msg} />
      </div>
    </Box>
  )
}

function worst(r: NonNullable<ReturnType<typeof useAuthor.getState>['draft']>['report']) {
  const order = ['APS', 'ESD1', 'ESD2', 'PSD', 'USD']
  const w = order.find((l) => r?.shutdowns.some((s) => s.level === l))
  return w ? `worst shutdown ${w}` : 'no shutdown'
}
