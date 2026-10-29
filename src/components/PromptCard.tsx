import { useMemo, useState } from 'react'
import { agentPrompt } from '../prompt'
import { SITE } from '../site'

export function PromptCard() {
  const prompt = useMemo(() => agentPrompt(SITE), [])
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Set it up with your agent</div>
          <p className="mt-1 text-[13px] leading-5 text-muted-fg">One prompt for Claude Code, Cursor, Codex or any coding agent. It covers setup, installs, the skill, and building a plant from your P&amp;IDs.</p>
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(prompt)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
          className="shrink-0 rounded-md bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {copied ? 'Copied' : 'Copy prompt'}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-fg">
        <button onClick={() => setOpen((o) => !o)} className="shrink-0 whitespace-nowrap underline underline-offset-4 hover:text-fg">
          {open ? 'Hide prompt' : 'Preview prompt'}
        </button>
        <span>
          or tell your agent: <code className="font-mono text-fg">Read {SITE}/prompt.md and follow it</code>
        </span>
      </div>
      {open && <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-border bg-zinc-50 p-3 font-mono text-[11.5px] leading-5 whitespace-pre-wrap text-zinc-700">{prompt}</pre>}
    </div>
  )
}
