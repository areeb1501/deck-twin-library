import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { highlight } from 'sugar-high'

export function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
      className={`rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-muted-fg shadow-sm transition-colors hover:text-ink ${className}`}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

export function Code({ code, lang = 'tsx', className = '', maxHeight, dark }: { code: string; lang?: 'tsx' | 'bash' | 'json' | 'text'; className?: string; maxHeight?: string; dark?: boolean }) {
  const html = useMemo(() => (lang === 'tsx' || lang === 'json' ? highlight(code) : escape(code)), [code, lang])
  return (
    <div className={`group relative rounded-lg border ${dark ? 'code-dark border-white/10 bg-code text-slate-200' : 'border-border bg-muted'} ${className}`}>
      <CopyButton text={code} className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
      <pre className="overflow-auto p-4 font-mono text-[12.5px] leading-6" style={{ maxHeight }}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}

export function Command({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-code py-2.5 pr-2.5 pl-4 font-mono text-[13px] text-slate-100 shadow-sm ring-1 ring-white/10">
      <span className="text-signal">$</span>
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)] pr-6">{cmd}</span>
      <CopyButton text={cmd} className="border-white/10 bg-white/5 text-slate-300 shadow-none hover:bg-white/10 hover:text-white" />
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, right }: { tabs: readonly { id: T; label: string }[]; value: T; onChange: (t: T) => void; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3.5 py-2.5 text-[14px] font-medium transition-colors ${value === t.id ? 'border-ink text-ink' : 'border-transparent text-muted-fg hover:text-ink'}`}
        >
          {t.label}
        </button>
      ))}
      <div className="ml-auto">{right}</div>
    </div>
  )
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-md border border-border bg-surface px-2 py-0.5 text-[12px] font-medium text-zinc-400">{children}</span>
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function FilterInput({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={`relative min-w-0 ${className}`}>
      <span className="sr-only">{placeholder}</span>
      <svg viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-fg" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-border bg-surface pr-8 pl-8.5 text-[13.5px] outline-none placeholder:text-slate-400 focus:border-white/25 focus:ring-2 focus:ring-brand/15"
      />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear filter" className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-fg hover:bg-muted hover:text-ink">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </label>
  )
}

export function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[] }) {
  return (
    <label className="relative max-w-full min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full max-w-full cursor-pointer appearance-none truncate rounded-md border border-border bg-surface pr-9 pl-3 text-[13.5px] font-medium text-ink outline-none hover:border-white/20 focus:border-white/25 focus:ring-2 focus:ring-brand/15"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-fg" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
      </svg>
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, label, options }: { value: T; onChange: (v: T) => void; label: string; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-9 items-center rounded-md border border-border bg-muted p-0.5">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex h-full items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${on ? 'bg-white/10 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]' : 'text-muted-fg hover:text-ink'}`}
          >
            {o.label}
            {o.count !== undefined && <span className={`text-[12px] tabular-nums ${on ? 'text-muted-fg' : 'text-slate-400'}`}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Toolbar({ children, shown, total, onReset }: { children: ReactNode; shown: number; total: number; onReset?: () => void }) {
  return (
    <div className="z-20 -mx-6 border-y border-border bg-bg/75 px-6 py-3 backdrop-blur-xl sm:sticky sm:top-14 lg:-mx-10 lg:px-10">
      <div className="flex flex-wrap items-center gap-2.5">
        {children}
        {onReset && (
          <button onClick={onReset} className="h-9 rounded-md px-2.5 text-[13px] font-medium text-muted-fg transition-colors hover:bg-muted hover:text-ink">
            Reset
          </button>
        )}
        <div className="ml-auto text-[13px] text-muted-fg tabular-nums" aria-live="polite">
          Showing <span className="font-medium text-ink">{shown}</span> of {total}
        </div>
      </div>
    </div>
  )
}

export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={i} className="rounded border border-border bg-muted px-1 py-px font-mono text-[0.86em] text-ink">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  )
}

export function Combobox({ value, onChange, label, allLabel, placeholder, options }: { value: string; onChange: (v: string) => void; label: string; allLabel: string; placeholder: string; options: { value: string; label: string; count: number }[] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return [{ value: '', label: allLabel, count: -1 }, ...options.filter((o) => !s || o.label.toLowerCase().includes(s))]
  }, [q, options, allLabel])
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  useEffect(() => setActive(0), [q, open])
  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQ('')
  }
  const current = options.find((o) => o.value === value)
  return (
    <div ref={box} className="relative max-w-full min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={`flex h-9 max-w-full items-center gap-2 rounded-md border bg-surface pr-9 pl-3 text-[13.5px] font-medium outline-none hover:border-white/20 focus-visible:border-white/25 focus-visible:ring-2 focus-visible:ring-brand/15 ${value ? 'border-white/25 text-ink' : 'border-border text-ink'}`}
      >
        <span className="truncate">{current ? current.label : allLabel}</span>
        <svg viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-fg" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1.5 w-72 overflow-hidden rounded-lg border border-border bg-panel shadow-[0_16px_40px_-12px_rgb(0_0_0/0.6)]">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, list.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter' && list[active]) pick(list[active].value)
              else if (e.key === 'Escape') setOpen(false)
            }}
            placeholder={placeholder}
            className="h-10 w-full border-b border-border px-3 text-[13.5px] outline-none placeholder:text-slate-400"
          />
          <ul role="listbox" className="max-h-72 overflow-y-auto p-1">
            {list.map((o, i) => (
              <li key={o.value || '_all'} role="option" aria-selected={o.value === value}>
                <button
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(o.value)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${i === active ? 'bg-muted' : ''} ${o.value === value ? 'font-semibold text-ink' : 'text-zinc-300'}`}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.count >= 0 && <span className="shrink-0 text-[12px] text-muted-fg tabular-nums">{o.count}</span>}
                </button>
              </li>
            ))}
            {list.length === 1 && <li className="px-2.5 py-3 text-[13px] text-muted-fg">No supplier matches “{q}”.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
