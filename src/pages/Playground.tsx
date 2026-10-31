import { useMemo, useState } from 'react'
import type { Issue, PlantSpec } from '../../registry/assembly/spec'
import { EXAMPLES } from '../plants'
import { Issues } from '../viewer/PlantView'
import { ClientPlant } from '../viewer/ClientPlant'
import { usePageMeta } from '../meta'

export function Playground() {
  usePageMeta('Playground', 'Paste a plant.json file to render it in 3D and review the validation results. Your data stays in your browser.')
  const [text, setText] = useState(() => JSON.stringify(EXAMPLES[0]?.spec ?? { name: 'Empty', items: [], lines: [] }, null, 2))
  const [issues, setIssues] = useState<Issue[]>([])
  const parsed = useMemo(() => {
    try {
      const s = JSON.parse(text) as PlantSpec
      if (!Array.isArray(s.items)) return { error: '"items" must be an array.' }
      return { spec: s }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [text])
  const [spec, setSpec] = useState<PlantSpec | null>(parsed.spec ?? null)
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      <h1 className="display text-[32px] sm:text-[44px] text-ink">Playground</h1>
      <p className="mt-2 text-[17px] text-fg-3">Paste a plant.json file to render it in 3D and review the validation results. Your data stays in your browser.</p>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[440px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <select className="h-8 flex-1 rounded-md border border-border px-2 text-[13px]" onChange={(e) => { const ex = EXAMPLES.find((x) => x.name === e.target.value); if (ex) { setText(JSON.stringify(ex.spec, null, 2)); setSpec(ex.spec) } }}>
              <option>Load an example…</option>
              {EXAMPLES.map((e) => <option key={e.name} value={e.name}>{e.spec.name}</option>)}
            </select>
            <button disabled={!parsed.spec} onClick={() => parsed.spec && setSpec(parsed.spec)} className="h-8 rounded-md bg-ink px-3.5 text-[13px] font-semibold text-on-ink transition-colors hover:bg-ink-2 disabled:opacity-40">
              Render
            </button>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="h-[520px] w-full resize-none rounded-lg border border-border bg-muted p-3 font-mono text-[13px] leading-5 outline-none focus:border-line-strong focus:ring-2 focus:ring-brand/15" />
          {parsed.error ? <div className="rounded-md bg-err-tint px-3 py-2 text-[13px] text-err">JSON: {parsed.error}</div> : <Issues issues={issues} />}
        </div>
        <div className="relative h-[680px] overflow-hidden rounded-lg border border-border">{spec && <ClientPlant spec={spec} labels onIssues={setIssues} className="absolute inset-0" />}</div>
      </div>
    </div>
  )
}
