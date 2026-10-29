import { useState } from 'react'
import { Link } from 'wouter'
import { EXAMPLES } from '../plants'
import { Issues, PlantView } from '../viewer/PlantView'
import { Code, Command } from '../components/ui'
import type { Issue } from '../../registry/assembly/spec'

export function ExamplesIndex() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <h1 className="text-[34px] leading-tight font-semibold text-ink">Examples</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-7 text-slate-600">Plants assembled from the registry with a single <code className="font-mono text-sm">plant.json</code>. Each one is wired port to port. Use them as starting points or as references for your agent.</p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {EXAMPLES.map((e) => (
          <Link key={e.name} href={`/examples/${e.name}`} className="group overflow-hidden rounded-xl border border-border transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(14_26_36/0.18)]">
            <div className="aspect-[16/10] bg-stage">
              <img src={`/thumbs/plant-${e.name}.webp`} alt="" className="h-full w-full object-cover" onError={(ev) => (ev.currentTarget.style.visibility = 'hidden')} />
            </div>
            <div className="border-t border-border p-4">
              <div className="font-semibold text-ink transition-colors group-hover:text-ink">{e.spec.name}</div>
              <div className="mt-1 text-[13px] text-muted-fg">{e.spec.description}</div>
              <div className="mt-3 text-[12.5px] font-medium text-slate-500">
                {e.spec.items.length} items, {e.spec.lines?.length ?? 0} lines
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function ExamplePage({ name }: { name: string }) {
  const ex = EXAMPLES.find((e) => e.name === name)
  const [labels, setLabels] = useState(true)
  const [issues, setIssues] = useState<Issue[]>([])
  if (!ex) return <div className="px-10 py-24 text-muted-fg">Unknown example.</div>
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      <nav className="mb-2 flex items-center gap-1.5 text-[13px] text-muted-fg">
        <Link href="/examples" className="font-medium text-brand hover:underline hover:underline-offset-4">Examples</Link>
        <span className="text-slate-300">/</span>
        <span>{ex.name}</span>
      </nav>
      <h1 className="text-[28px] leading-tight font-semibold text-ink">{ex.spec.name}</h1>
      <p className="mt-2 max-w-3xl text-[16px] text-slate-600">{ex.spec.description}</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className="relative h-[620px] overflow-hidden rounded-xl border border-border shadow-sm">
          <PlantView spec={ex.spec} labels={labels} onIssues={setIssues} className="absolute inset-0" />
          <button onClick={() => setLabels((l) => !l)} className="absolute top-3 right-3 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-ink shadow-sm hover:bg-muted">
            {labels ? 'Hide tags' : 'Show tags'}
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink">Check</div>
            <Issues issues={issues} />
          </div>
          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink">Install everything it uses</div>
            <Command cmd={`npx deck-twin assemble ${ex.name}.plant.json`} />
          </div>
          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink">plant.json</div>
            <Code code={JSON.stringify(ex.spec, null, 2)} lang="json" maxHeight="380px" />
          </div>
        </div>
      </div>
    </div>
  )
}
