/** Small form controls for the builder. Text and number fields commit on Enter / blur. */
import { useEffect, useState } from 'react'

export function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="bf-row" title={hint}>
      <span className="bf-label">{label}</span>
      <span className="bf-ctl">{children}</span>
    </label>
  )
}

export function Txt({ value, onCommit, placeholder, mono }: { value: string; onCommit: (v: string) => void; placeholder?: string; mono?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => v.trim() !== value && onCommit(v.trim())
  return (
    <input
      className={mono ? 'mono' : undefined}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  )
}

/** Number field. An empty value commits `undefined` when `optional` (e.g. "auto"). */
export function Num({ value, onCommit, step = 0.1, min, max, unit, optional, placeholder }: {
  value: number | undefined
  onCommit: (v: number | undefined) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  optional?: boolean
  placeholder?: string
}) {
  const show = (x: number | undefined) => (x === undefined ? '' : String(Math.round(x * 1000) / 1000))
  const [v, setV] = useState(show(value))
  useEffect(() => setV(show(value)), [value])
  const commit = () => {
    if (v.trim() === '') return optional ? value !== undefined && onCommit(undefined) : setV(show(value))
    let x = Number(v)
    if (!Number.isFinite(x)) return setV(show(value))
    if (min !== undefined) x = Math.max(min, x)
    if (max !== undefined) x = Math.min(max, x)
    setV(show(x))
    if (x !== value) onCommit(x)
  }
  return (
    <span className="bf-num">
      <input
        type="number"
        value={v}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
      {unit && <span className="muted small">{unit}</span>}
    </span>
  )
}

export function Sel<T extends string | number>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <select
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value)
        if (o) onChange(o.value)
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Slider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <span className="bf-num">
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v !== value && onCommit(v)}
        onKeyUp={() => v !== value && onCommit(v)}
      />
      <span className="muted small mono">{Math.round(v * 100)}%</span>
    </span>
  )
}
