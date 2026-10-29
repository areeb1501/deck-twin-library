import { useState } from 'react'
import { Link } from 'wouter'
import { EXAMPLES, byLevel, level, type Level } from '../plants'
import { Issues, PlantView } from '../viewer/PlantView'
import { Code, Command, RichText, Segmented } from '../components/ui'
import { CLI } from '../site'
import type { Issue } from '../../registry/assembly/spec'

export function ExamplesIndex() {
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-10">
      <h1 className="text-[34px] leading-tight font-semibold text-ink">Examples</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-7 text-slate-600">Plants assembled from the registry with a single <code className="font-mono text-sm">plant.json</code>. Each one is wired port to port. Use them as starting points or as references for your agent.</p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[...EXAMPLES].sort(byLevel).map((e) => (
          <Link key={e.name} href={`/examples/${e.name}`} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-white transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(14_26_36/0.18)]">
            <div className="relative aspect-[16/10] bg-stage">
              <img src={`/thumbs/plant-${e.name}.webp`} alt="" className="h-full w-full object-cover" onError={(ev) => (ev.currentTarget.style.visibility = 'hidden')} />
              <LevelBadge level={level(e.spec, e.name)} />
            </div>
            <div className="flex flex-1 flex-col border-t border-border p-4">
              <div className="font-semibold text-ink">{e.spec.name}</div>
              <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-muted-fg">
                <RichText text={e.spec.description ?? ''} />
              </p>
              <div className="mt-auto pt-3 text-[12.5px] font-medium text-slate-500">
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
  const [env, setEnv] = useState<'studio' | 'day' | 'night'>('day')
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
      <p className="mt-2 max-w-3xl text-[16px] text-slate-600">
        <RichText text={ex.spec.description ?? ''} />
      </p>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="relative h-[420px] overflow-hidden sm:h-[620px] rounded-xl border border-border shadow-sm">
          <PlantView spec={ex.spec} labels={labels} env={env} onIssues={setIssues} className="absolute inset-0" />
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {ex.spec.sea && (
              <div className="rounded-md bg-white shadow-sm">
                <Segmented
                  label="Lighting"
                  value={env}
                  onChange={setEnv}
                  options={[
                    { value: 'studio', label: 'Studio' },
                    { value: 'day', label: 'Day' },
                    { value: 'night', label: 'Night' },
                  ]}
                />
              </div>
            )}
            <button onClick={() => setLabels((l) => !l)} className="h-9 rounded-md border border-border bg-white px-2.5 text-xs font-medium text-ink shadow-sm hover:bg-muted">
              {labels ? 'Hide tags' : 'Show tags'}
            </button>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink">Check</div>
            <Issues issues={issues} />
          </div>
          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink">Install everything it uses</div>
            <Command cmd={`${CLI} assemble ${ex.name}.plant.json`} />
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

const LEVEL_STYLE: Record<Level, string> = {
  Basic: 'bg-white text-ink ring-border',
  Intermediate: 'bg-white text-ink ring-border',
  Advanced: 'bg-ink text-white ring-ink',
}

function LevelBadge({ level }: { level: Level }) {
  const bars = level === 'Basic' ? 1 : level === 'Intermediate' ? 2 : 3
  return (
    <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold shadow-sm ring-1 ${LEVEL_STYLE[level]}`}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i < bars ? 'bg-current' : 'bg-current opacity-25'}`} style={{ height: 5 + i * 3 }} />
        ))}
      </span>
      {level}
    </span>
  )
}
