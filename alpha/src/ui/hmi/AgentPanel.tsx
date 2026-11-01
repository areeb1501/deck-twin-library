/**
 * Agents strip on the Alerts page: the model that drives them and the workflow catalogue (routine checks and early-warning
 * analyses), each run traced step by step. With Muse Spark selected and no key in this browser, the key field shows here.
 */
import { useEffect, useMemo, useState } from 'react'
import { AUTHOR_PROVIDERS, modelOf, type AuthorProviderId } from '../../agents/authorProvider'
import { PROVIDER_LABEL, useProvider, type ProviderId } from '../../agents/provider'
import { WORKFLOWS, runWorkflow, useWorkflowRuns } from '../../agents/catalog'
import { connected, useAuthor } from '../../agents/scenarioAuthor'
import { KeyField, Usage } from './ScenarioAuthor'

type Sel = { kind: 'alert' | 'inv' | 'chat'; traceId: string; label: string } | null
const IDS: ProviderId[] = ['muse', 'sim']

/** which account Muse Spark runs on and, until there is a key, where to put it */
function MuseConnection() {
  const provider = useAuthor((s) => s.provider)
  const chosen = useAuthor((s) => s.models[provider])
  const ready = useAuthor(connected)
  const error = useProvider((s) => s.error)
  const p = AUTHOR_PROVIDERS[provider]
  if (ready) {
    return (
      <>
        <span className="ag-conn" data-ag="connected">
          <i aria-hidden="true" />
          {p.label} · <span className="mono">{modelOf(p, chosen)}</span>
          <button className="link" onClick={() => void useAuthor.getState().forgetProviderKey()} data-ag="change-key">
            Change key
          </button>
        </span>
        <Usage />
        {error && <div className="h-msg ag-note">Muse Spark did not answer, so the local planner did: {error}</div>}
      </>
    )
  }
  return (
    <div className="ag-key" data-ag="key">
      <label>
        Provider
        <select value={provider} onChange={(e) => useAuthor.getState().setProvider(e.target.value as AuthorProviderId)} data-ag="provider">
          {(Object.keys(AUTHOR_PROVIDERS) as AuthorProviderId[]).map((id) => (
            <option key={id} value={id}>
              {AUTHOR_PROVIDERS[id].label}
            </option>
          ))}
        </select>
      </label>
      <KeyField />
      <span className="dim small">Agents use the local planner until a key is saved. Each run is one request, billed to your account.</span>
    </div>
  )
}

export function AgentPanel({ setSel }: { setSel: (s: Sel) => void }) {
  const provider = useProvider((s) => s.provider)
  const runs = useWorkflowRuns((s) => s.runs)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => void useAuthor.getState().detectKey(), [])
  const latest = useMemo(() => {
    const m: Record<string, (typeof runs)[number]> = {}
    for (const r of runs) if (!m[r.workflow]) m[r.workflow] = r
    return m
  }, [runs])
  const shown = open ? latest[open] : undefined

  return (
    <section className="h-box ag-strip">
      <div className="ag-head">
        <h3>
          <span>Agents</span>
        </h3>
        <label className="ag-model">
          Model
          <select value={provider} onChange={(e) => useProvider.getState().setProvider(e.target.value as ProviderId)} data-ag="model">
            {IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDER_LABEL[id]}
              </option>
            ))}
          </select>
        </label>
        {provider === 'muse' && <MuseConnection />}
        <span className="grow" />
        <span className="dim small">Advisory only</span>
      </div>
      <div className="ag-flows">
        {WORKFLOWS.map((w) => {
          const r = latest[w.id]
          return (
            <div key={w.id} className={`ag-flow ${w.kind} ${open === w.id ? 'on' : ''}`}>
              <div className="ag-kind">{w.kind === 'hard-to-spot' ? 'Early warning' : 'Routine check'}</div>
              <b>{w.title}</b>
              <p>{w.blurb}</p>
              <div className="ag-row">
                <button
                  disabled={r?.status === 'running'}
                  onClick={() => {
                    setOpen(w.id)
                    void runWorkflow(w.id).then((x) => x && setSel({ kind: 'chat', traceId: x.traceId, label: w.title }))
                  }}
                >
                  {r?.status === 'running' ? 'Running…' : 'Run'}
                </button>
                {r && r.status !== 'running' && (
                  <button className="link" onClick={() => (setOpen(open === w.id ? null : w.id), setSel({ kind: 'chat', traceId: r.traceId, label: w.title }))}>
                    {open === w.id ? 'Hide' : 'Result'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {shown && (
        <div className="ag-out">
          <div className="dim small mono">
            {WORKFLOWS.find((w) => w.id === shown.workflow)?.title} · {shown.model ?? shown.provider} · trace {shown.traceId}
          </div>
          <pre>{shown.status === 'running' ? 'Working…' : shown.text}</pre>
        </div>
      )}
    </section>
  )
}
