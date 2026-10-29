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
      className={`rounded-md border border-border bg-white px-2 py-1 text-xs text-muted-fg transition-colors hover:text-fg ${className}`}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

export function Code({ code, lang = 'tsx', className = '', maxHeight }: { code: string; lang?: 'tsx' | 'bash' | 'json' | 'text'; className?: string; maxHeight?: string }) {
  const html = useMemo(() => (lang === 'tsx' || lang === 'json' ? highlight(code) : escape(code)), [code, lang])
  return (
    <div className={`group relative rounded-lg border border-border bg-zinc-50 ${className}`}>
      <CopyButton text={code} className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100" />
      <pre className="overflow-auto p-4 font-mono text-[12.5px] leading-6" style={{ maxHeight }}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}

export function Command({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-zinc-950 py-2.5 pr-2.5 pl-4 font-mono text-[13px] text-zinc-100">
      <span className="text-zinc-500">$</span>
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">{cmd}</span>
      <CopyButton text={cmd} className="border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white" />
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
          className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${value === t.id ? 'border-fg font-medium text-fg' : 'border-transparent text-muted-fg hover:text-fg'}`}
        >
          {t.label}
        </button>
      ))}
      <div className="ml-auto">{right}</div>
    </div>
  )
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-md border border-border bg-white px-2 py-0.5 text-xs text-zinc-600">{children}</span>
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
