/**
 * Isolation / LOTO planner panel: the step-by-step isolation list for the chosen item, with
 * tick-off checkboxes, warnings, and print / CSV export. The 3D overlay (scene/IsolationOverlay)
 * shows the same plan.
 */
import { useEffect, useMemo, useState } from 'react'
import { usePlant } from '../state/plantStore'
import { useStore } from '../state/store'
import { isolationGraph, planIsolation, type IsolationPlan } from '../model/isolation'
import { VALVE_LABEL } from './TagTree'

export interface Step {
  n: number
  title: string
  detail?: string
  tags: string[]
  kind: 'close' | 'verify' | 'relief' | 'bleed' | 'spade' | 'prove'
}

export function useIsolationPlan(): IsolationPlan | null {
  const plant = usePlant()
  const iso = useStore((s) => s.isolation)
  const graph = useMemo(() => isolationGraph(plant), [plant])
  return useMemo(() => (iso ? planIsolation(plant, iso.target, iso.mode, graph) : null), [plant, iso, graph])
}

/** Ordered procedure: close / verify the isolation valves, relief paths, drain & vent, spades, prove zero energy. */
export function isolationSteps(p: IsolationPlan): Step[] {
  const out: Step[] = []
  const add = (s: Omit<Step, 'n'>) => out.push({ ...s, n: out.length + 1 })
  const desc = (pt: IsolationPlan['points'][number]) => `${pt.nps}" ${VALVE_LABEL[pt.type] ?? pt.type}${pt.line ? ` on ${pt.line}` : ''}${pt.second ? ` · second block: ${pt.second}` : ''}`
  const regular = p.points.filter((x) => x.type !== 'psv' && !x.bleedRoute)
  for (const pt of [...regular.filter((x) => !x.verify), ...regular.filter((x) => x.verify)])
    add({ title: `${pt.verify ? 'Verify closed' : 'Close'} ${pt.tag}${pt.actuated ? ', isolate actuator' : ''}, lock & tag`, detail: desc(pt), tags: [pt.tag], kind: pt.verify ? 'verify' : 'close' })
  for (const pt of p.points.filter((x) => x.type === 'psv'))
    add({ title: `Isolate relief path at ${pt.tag}`, detail: 'Close & lock its inlet/outlet block valves (normally locked open), or remove the PSV and blind the nozzle. Block valves are not in the model.', tags: [pt.tag], kind: 'relief' })
  const bleeds = p.points.filter((x) => x.bleedRoute)
  if (bleeds.length || p.drains.length || p.vents.length)
    add({
      title: 'Depressurise and drain the envelope',
      detail: [
        ...bleeds.map((b) => `${b.tag}: open under control to ${b.line.includes('-FL-') ? 'flare' : 'closed drain'}, then close, lock & tag`),
        ...p.drains.filter((d) => !d.startsWith('via ')).map((d) => `Drain: ${d}`),
        ...p.vents.filter((d) => !d.startsWith('via ')).map((d) => `Vent: ${d}`),
      ].join('\n') || undefined,
      tags: bleeds.map((b) => b.tag),
      kind: 'bleed',
    })
  else add({ title: 'Depressurise and drain the envelope', detail: 'No drain or vent point in the model — use the P&ID / temporary drain points.', tags: [], kind: 'bleed' })
  for (const b of p.blinds)
    add({ title: `Insert spade at ${b.equipment} ${b.nozzle} (${b.name})`, detail: `${b.nps}" Class ${b.rating} spectacle blind / spade${b.line ? ` · ${b.line}` : ''}`, tags: [b.equipment], kind: 'spade' })
  add({ title: 'Prove zero energy before breaking containment', detail: p.proving.length ? `Read 0 on ${p.proving.join(', ')}` : 'No gauge inside the envelope in the model — fit a temporary gauge', tags: [], kind: 'prove' })
  return out
}

export function IsolationPanel() {
  const iso = useStore((s) => s.isolation)
  const setIsolation = useStore((s) => s.setIsolation)
  const plant = usePlant()
  const plan = useIsolationPlan()
  const steps = useMemo(() => (plan ? isolationSteps(plan) : []), [plan])
  const [done, setDone] = useState<Set<number>>(new Set())
  const [showEnv, setShowEnv] = useState(false)
  const go = (tag: string) => {
    const kind = plant.equipment.some((e) => e.tag === tag) ? 'equipment' : plant.lines.some((l) => l.tag === tag) ? 'line' : 'valve'
    useStore.getState().select({ tag, kind })
    useStore.getState().requestFocus(tag)
  }
  // a different target or mode is a different procedure
  useEffect(() => setDone(new Set()), [iso?.target, iso?.mode])
  if (!iso) return null
  if (!plan)
    return (
      <aside className="panel inspector iso">
        <header className="insp-head">
          <div className="insp-tag">Isolation plan</div>
          <button className="icon" onClick={() => setIsolation(null)}>×</button>
        </header>
        <div className="insp-body muted">{iso.target} is not in this plant.</div>
      </aside>
    )
  const eq = plant.equipment.find((e) => e.tag === plan.target)
  const title = eq?.name ?? 'Line'

  return (
    <aside className="panel inspector iso">
      <header className="insp-head">
        <div>
          <div className="muted small">Isolation plan · LOTO</div>
          <div className="mono insp-tag">{plan.target}</div>
          <div className="insp-title">{title}</div>
        </div>
        <button className="icon" onClick={() => setIsolation(null)} title="Close (Esc)">×</button>
      </header>
      <div className="insp-actions">
        {eq && (
          <div className="seg iso-mode">
            <button className={iso.mode === 'valve' ? 'on' : ''} onClick={() => setIsolation({ ...iso, mode: 'valve' })}>Valve isolation</button>
            <button className={iso.mode === 'positive' ? 'on' : ''} onClick={() => setIsolation({ ...iso, mode: 'positive' })} title="Spades at every connected nozzle — for confined-space / vessel entry">Vessel entry</button>
          </div>
        )}
        <button onClick={() => printPlan(plan, steps, title)}>Print</button>
        <button onClick={() => downloadCsv(plan, steps)}>CSV</button>
      </div>
      <div className="insp-body">
        <section className="sec">
          <div className="iso-stats">
            <div><b>{plan.points.length}</b><span>isolation points</span></div>
            <div><b>{plan.envelope.lines.length}</b><span>lines inside</span></div>
            <div><b>{plan.envelope.equipment.length}</b><span>equipment inside</span></div>
            <div><b>{done.size}/{steps.length}</b><span>steps done</span></div>
          </div>
        </section>
        {plan.warnings.length > 0 && (
          <section className="sec">
            <ul className="iso-warn">
              {plan.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </section>
        )}
        <section className="sec">
          <h4>Procedure</h4>
          <ol className="iso-steps">
            {steps.map((s) => (
              <li key={s.n} className={`${s.kind} ${done.has(s.n) ? 'done' : ''}`}>
                <input
                  type="checkbox"
                  checked={done.has(s.n)}
                  onChange={() => setDone((d) => {
                    const n = new Set(d)
                    if (n.has(s.n)) n.delete(s.n)
                    else n.add(s.n)
                    return n
                  })}
                />
                <span className="iso-n">{s.n}</span>
                <div>
                  <div className="iso-title">
                    {s.title}
                    {s.tags.map((t) => (
                      <button key={t} className="link mono small" onClick={() => go(t)} title="Show in 3D">↗</button>
                    ))}
                  </div>
                  {s.detail && <div className="muted small iso-detail">{s.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
        {plan.openEnds.length > 0 && (
          <section className="sec">
            <h4>Open boundaries — isolate outside the model</h4>
            {plan.openEnds.map((o) => (
              <div key={o.line + o.label} className="small"><span className="mono">{o.line}</span> → {o.label}</div>
            ))}
          </section>
        )}
        {plan.passed.length > 0 && (
          <section className="sec">
            <h4>Inside the envelope, not counted as isolation</h4>
            {plan.passed.map((p) => (
              <div key={p.tag} className="small"><button className="link mono" onClick={() => go(p.tag)}>{p.tag}</button> <span className="muted">· {p.reason}</span></div>
            ))}
          </section>
        )}
        <section className="sec">
          <h4>
            <button className="link" onClick={() => setShowEnv(!showEnv)}>{showEnv ? '▾' : '▸'} Isolation envelope</button>
          </h4>
          {plan.alsoIsolated.length > 0 && <div className="small">Also isolated: {plan.alsoIsolated.map((t) => <button key={t} className="link mono" onClick={() => go(t)}>{t} </button>)}</div>}
          {showEnv && (
            <div className="small mono iso-env">
              {plan.envelope.lines.map((l) => <div key={l}><button className="link" onClick={() => go(l)}>{l}</button></div>)}
            </div>
          )}
        </section>
        <div className="muted small">Generated from the model's valves and connections. Always check against the site isolation procedure and current P&IDs before work.</div>
      </div>
    </aside>
  )
}

function rows(steps: Step[]) {
  return steps.map((s) => [String(s.n), s.title, (s.detail ?? '').replace(/\n/g, ' · '), s.tags.join(' ')])
}

function downloadCsv(p: IsolationPlan, steps: Step[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [['Step', 'Action', 'Detail', 'Tags'], ...rows(steps), [], ['Warnings'], ...p.warnings.map((w) => [w])].map((r) => r.map(esc).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `isolation-${p.target.replace(/\W+/g, '-')}-${p.mode}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function printPlan(p: IsolationPlan, steps: Step[], title: string) {
  const w = window.open('', '_blank')
  if (!w) return
  const h = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  w.document.write(`<!doctype html><title>Isolation ${h(p.target)}</title>
<style>body{font:13px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;vertical-align:top;text-align:left}th{background:#eee}.w{color:#a40}</style>
<h2>Isolation plan — ${h(p.target)} ${h(title)}</h2>
<p>${p.mode === 'positive' ? 'Positive isolation (vessel entry)' : 'Valve isolation'} · generated ${new Date().toLocaleString()}</p>
${p.warnings.map((x) => `<p class="w">⚠ ${h(x)}</p>`).join('')}
<table><tr><th>#</th><th>Action</th><th>Detail</th><th>Done / initials</th></tr>
${rows(steps).map((r) => `<tr><td>${r[0]}</td><td>${h(r[1])}</td><td>${h(r[2])}</td><td style="width:110px"></td></tr>`).join('')}</table>
<p>Prepared by: ____________ &nbsp; Authorised by: ____________ &nbsp; Date: ________</p>`)
  w.document.close()
  w.focus()
  w.print()
}
