/**
 * Knowledge card for an item (opened from a walkthrough eye icon or the inspector's About button):
 * what it is, how it works, oil & gas use cases, ideal operating parameters next to the live values,
 * common problems, maintenance, safety, standards.
 */
import { useMemo } from 'react'
import { usePlant } from '../state/plantStore'
import { useStore } from '../state/store'
import type { Knowledge } from '../model/knowledgeTypes'
import type { Plant } from '../model/types'
import { metricsFor } from './metrics'
import { sample, fmt } from './live'
import { useSim } from '../state/sim'
import { findItemIn } from '../state/plantStore'

// the content module is resolved by path so the app runs while it's being written
const kbMod = import.meta.glob('../model/knowledge.ts', { eager: true }) as Record<string, { knowledgeFor?: (p: Plant, tag: string) => Knowledge | null }>
const knowledgeFor = Object.values(kbMod)[0]?.knowledgeFor ?? (() => null)

export function KnowledgeCard() {
  const tag = useStore((s) => s.kbTag)
  const close = useStore((s) => s.setKbTag)
  const plant = usePlant()
  useSim((s) => s.t)
  const k = useMemo(() => (tag ? knowledgeFor(plant, tag) : null), [plant, tag])
  const metrics = useMemo(() => (tag ? metricsFor(plant, tag, 6) : []), [plant, tag])
  if (!tag) return null
  const item = findItemIn(plant, tag) as { name?: string } | undefined
  const t = performance.now() / 1000
  return (
    <aside className="panel kb">
      <header className="insp-head">
        <div>
          <div className="muted small">About</div>
          <div className="mono insp-tag">{tag}</div>
          <div className="insp-title">{k?.title ?? item?.name ?? ''}</div>
        </div>
        <button className="icon" onClick={() => close(null)} title="Close">
          ×
        </button>
      </header>
      <div className="insp-body kb-body">
        {!k && <div className="muted small">No knowledge-base entry for this item yet.</div>}
        {k && (
          <>
            <p className="kb-summary">{k.summary}</p>
            <Sec title="How it works">
              <p>{k.howItWorks}</p>
            </Sec>
            <Sec title="Use in oil & gas">
              <ul>{k.useCases.map((u) => <li key={u}>{u}</li>)}</ul>
            </Sec>
            <Sec title="Ideal operating parameters">
              <table className="kb-params">
                <tbody>
                  {k.parameters.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="mono">
                        {p.ideal} {p.unit && <span className="muted">{p.unit}</span>}
                      </td>
                      <td className="muted small">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Sec>
            {metrics.length > 0 && (
              <Sec title="Right now (live)">
                <div className="kb-live">
                  {metrics.map((m) => (
                    <div key={m.inst.tag}>
                      <span className="muted small">{m.label}</span>
                      <b className="mono">
                        {fmt(sample(m.inst, t))} <span className="muted small">{m.inst.unit}</span>
                      </b>
                    </div>
                  ))}
                </div>
              </Sec>
            )}
            {k.instrumentation && k.instrumentation.length > 0 && (
              <Sec title="Typical instrumentation">
                <ul>{k.instrumentation.map((u) => <li key={u}>{u}</li>)}</ul>
              </Sec>
            )}
            <Sec title="Common problems">
              <ul>{k.issues.map((u) => <li key={u}>{u}</li>)}</ul>
            </Sec>
            <Sec title="Maintenance & inspection">
              <ul>{k.maintenance.map((u) => <li key={u}>{u}</li>)}</ul>
            </Sec>
            <Sec title="Safety">
              <ul>{k.safety.map((u) => <li key={u}>{u}</li>)}</ul>
            </Sec>
            <Sec title="Standards">
              <div className="chips small">{k.standards.map((u) => <span key={u} className="pill">{u}</span>)}</div>
            </Sec>
          </>
        )}
      </div>
    </aside>
  )
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sec">
      <h4>{title}</h4>
      {children}
    </section>
  )
}
