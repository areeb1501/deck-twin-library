import type { Param } from '../../registry/meta'
import { NPS_SIZES, RATINGS } from '../../registry/lib/standards'

type Values = Record<string, unknown>

export function Controls({ params, values, onChange }: { params: Param[]; values: Values; onChange: (key: string, v: unknown) => void }) {
  return (
    <div className="space-y-3.5">
      {params.map((p) => (
        <div key={p.key}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <label className="font-medium text-fg">{p.label}</label>
            {p.type === 'number' && (
              <span className="font-mono text-muted-fg">
                {fmt(Number(values[p.key]))}
                {p.unit ? ` ${p.unit}` : ''}
              </span>
            )}
          </div>
          <Input p={p} value={values[p.key]} onChange={(v) => onChange(p.key, v)} />
        </div>
      ))}
    </div>
  )
}

const fmt = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : +v.toFixed(3) + '') : '–')
const selectCls = 'h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] outline-none focus:border-white/25 focus:ring-2 focus:ring-brand/15'

function Input({ p, value, onChange }: { p: Param; value: unknown; onChange: (v: unknown) => void }) {
  switch (p.type) {
    case 'number':
      return (
        <input
          type="range"
          min={p.min}
          max={p.max}
          step={p.step ?? (p.max - p.min) / 100}
          value={Number(value ?? p.min)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-ink"
        />
      )
    case 'bool':
      return (
        <button
          onClick={() => onChange(!value)}
          className={`relative h-5 w-9 rounded-full transition-colors ${value ? 'bg-signal' : 'bg-white/15'}`}
          aria-pressed={!!value}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-zinc-100 shadow transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      )
    case 'nps': {
      const opts = NPS_SIZES.filter((n) => n >= (p.min ?? 0.5) && n <= (p.max ?? 48))
      return (
        <select className={selectCls} value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {opts.map((n) => (
            <option key={n} value={n}>
              {frac(n)}" NPS
            </option>
          ))}
        </select>
      )
    }
    case 'rating':
      return (
        <select className={selectCls} value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {(p.options ?? RATINGS).map((r) => (
            <option key={r} value={r}>
              Class {r}
            </option>
          ))}
        </select>
      )
    case 'select':
      return (
        <select
          className={selectCls}
          value={String(value)}
          onChange={(e) => {
            const o = p.options.find((x) => String(typeof x === 'object' ? x.value : x) === e.target.value)
            onChange(typeof o === 'object' ? o.value : o)
          }}
        >
          {p.options.map((o) => {
            const v = typeof o === 'object' ? o.value : o
            return (
              <option key={String(v)} value={String(v)}>
                {typeof o === 'object' ? o.label : String(o)}
              </option>
            )
          })}
        </select>
      )
    case 'color':
      return <input type="color" value={String(value ?? '#cccccc')} onChange={(e) => onChange(e.target.value)} className="h-8 w-full cursor-pointer rounded-md border border-border" />
    case 'text':
      return <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={selectCls} />
  }
}

export function frac(n: number) {
  const w = Math.floor(n)
  const f = n - w
  const map: Record<string, string> = { '0.125': '1/8', '0.25': '1/4', '0.375': '3/8', '0.5': '1/2', '0.75': '3/4' }
  const fs = map[String(+f.toFixed(3))]
  if (!f) return String(w)
  return w ? `${w}-${fs ?? f}` : (fs ?? String(n))
}
