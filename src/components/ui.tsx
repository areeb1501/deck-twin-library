import { useMemo, useState, type ReactNode } from 'react'
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
      className={`rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-muted-fg shadow-sm transition-colors hover:text-ink ${className}`}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

export function Code({ code, lang = 'tsx', className = '', maxHeight, dark }: { code: string; lang?: 'tsx' | 'bash' | 'json' | 'text'; className?: string; maxHeight?: string; dark?: boolean }) {
  const html = useMemo(() => (lang === 'tsx' || lang === 'json' ? highlight(code) : escape(code)), [code, lang])
  return (
    <div className={`group relative rounded-lg border ${dark ? 'code-dark border-white/10 bg-ink-2 text-slate-200' : 'border-border bg-muted'} ${className}`}>
      <CopyButton text={code} className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
      <pre className="overflow-auto p-4 font-mono text-[12.5px] leading-6" style={{ maxHeight }}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}

export function Command({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-ink py-2.5 pr-2.5 pl-4 font-mono text-[13px] text-slate-100 shadow-sm ring-1 ring-ink">
      <span className="text-signal">$</span>
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">{cmd}</span>
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
  return <span className="inline-flex items-center rounded-md border border-border bg-white px-2 py-0.5 text-[12px] font-medium text-slate-600">{children}</span>
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
