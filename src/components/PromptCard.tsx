import { useMemo, useState } from 'react'
import { agentPrompt } from '../prompt'
import { SITE } from '../site'
import { track } from '../analytics'

export function PromptCard() {
  const prompt = useMemo(() => agentPrompt(SITE), [])
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[15px] font-semibold text-ink">Set it up with your agent</div>
          <p className="mt-1 text-[13px] leading-5 text-muted-fg">One prompt for Claude Code, Cursor, Codex or any coding agent. It covers setup, installs, the skill, and building a plant from your P&amp;IDs.</p>
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(prompt)
            track('copied_agent_prompt', { source: 'card' })
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
          className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-on-ink transition-colors hover:bg-ink-2"
        >
          {copied ? 'Copied' : 'Copy prompt'}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-fg">
        <button onClick={() => setOpen((o) => !o)} className="shrink-0 font-medium whitespace-nowrap text-brand hover:underline hover:underline-offset-4">
          {open ? 'Hide prompt' : 'Preview prompt'}
        </button>
        <span>
          or tell your agent: <code className="font-mono text-fg">Read {SITE}/prompt.md and follow it</code>
        </span>
      </div>
      {open && <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-[11.5px] leading-5 whitespace-pre-wrap text-fg-2">{prompt}</pre>}
    </div>
  )
}

export function AgentLine({ className = '' }: { className?: string }) {
  const text = `Read ${SITE}/prompt.md and follow it`
  const [copied, setCopied] = useState(false)
  return (
    <div className={`flex items-center gap-3 rounded-lg border border-border bg-bg py-1.5 pr-1.5 pl-3.5 text-left ${className}`}>
      <span className="hidden shrink-0 text-[13px] font-medium text-muted-fg sm:inline">For agents</span>
      <span className="hidden h-4 w-px shrink-0 bg-border sm:block" />
      <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={text}>{text}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(text)
          track('copied_agent_prompt', { source: 'line' })
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        }}
        className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-medium text-on-ink transition-colors hover:bg-ink-2"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
