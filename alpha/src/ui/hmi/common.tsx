/** Small building blocks shared by the HMI pages. */
import type { ReactNode } from 'react'
import type { AlarmPriority, RunState } from '../../sim/types'
import { pickOf, showIn3D } from './nav'

/** ISA-18.2 priority mark: shape + number + colour (never colour alone) */
export function Prio({ p }: { p: AlarmPriority | undefined }) {
  const n = p ?? 3
  return (
    <span className={`prio p${n}`} title={n === 1 ? 'Priority 1: emergency' : n === 2 ? 'Priority 2: high' : 'Priority 3: low'}>
      {n}
    </span>
  )
}

export function RunPill({ st }: { st: RunState }) {
  return (
    <span className={`rs ${st}`}>
      <i />
      {st}
    </span>
  )
}

export function Kpi({ label, value, unit, abn, bad, title }: { label: string; value: string; unit?: string; abn?: boolean; bad?: boolean; title?: string }) {
  return (
    <div className={`h-kpi ${bad ? 'bad' : abn ? 'abn' : ''}`} title={title}>
      <div className="l">{label}</div>
      <div className="n">
        {value}
        {unit && <small>{unit}</small>}
      </div>
    </div>
  )
}

export function Box({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`h-box ${className ?? ''}`}>
      <h3>
        <span>{title}</span>
        <span className="grow" />
        {right}
      </h3>
      {children}
    </section>
  )
}

/** feedback line under an action: refusal (amber) or confirmation */
export function Msg({ text }: { text: string | null | undefined }) {
  if (!text) return null
  const ok = text.startsWith('✓')
  return <div className={`h-msg ${ok ? 'ok' : ''}`}>{text}</div>
}

/** a tag that jumps to the 3D view when it is a plant item */
export function TagLink({ tag }: { tag: string }) {
  if (!pickOf(tag)) return <span className="mono">{tag}</span>
  return (
    <button className="link mono" onClick={() => showIn3D(tag)} title="Select in 3D (closes the console)">
      {tag}
    </button>
  )
}
