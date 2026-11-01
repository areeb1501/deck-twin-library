/**
 * Agents strip on the Alerts & assistant page: which model drives the agents (model-agnostic —
 * local planner, NVIDIA Nemotron on Token Factory, Muse Spark later) and the workflow catalogue
 * (easy-but-slow and hard-to-spot analyses), each run traced step by step.
 */
import { useEffect, useMemo, useState } from 'react'
import { PROVIDER_LABEL, useProvider, type ProviderId } from '../../agents/provider'
import { WORKFLOWS, runWorkflow, useWorkflowRuns } from '../../agents/catalog'

type Sel = { kind: 'alert' | 'inv' | 'chat'; traceId: string; label: string } | null
const IDS: ProviderId[] = ['sim', 'tokenfactory', 'muse', 'openai-compatible']

export function AgentPanel({ setSel }: { setSel: (s: Sel) => void }) {
  const provider = useProvider((s) => s.provider)
  const available = useProvider((s) => s.available)
  const runs = useWorkflowRuns((s) => s.runs)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => void useProvider.getState().refresh(), [])
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
          <select value={provider} onChange={(e) => useProvider.getState().setProvider(e.target.value as ProviderId)}>
            {IDS.map((id) => {
              const a = available[id]
              const ready = id === 'sim' || !!a?.ready
              return (
                <option key={id} value={id} disabled={!ready}>
                  {PROVIDER_LABEL[id]}
                  {a?.model && id !== 'sim' ? `: ${a.model}` : ''}
                  {ready ? '' : ' (no key)'}
                </option>
              )
            })}
          </select>
        </label>
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
          <pre>{shown.status === 'running' ? 'Working… (tool calls stream into the trace column)' : shown.text}</pre>
        </div>
      )}
    </section>
  )
}
