import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'wouter'
import { CATEGORIES, ITEMS, byCategory, thumb } from '../registry'
import { EXAMPLES } from '../plants'
import { ClientRisingPlant } from '../viewer/ClientPlant'
import { usePageMeta } from '../meta'
import { Code, Command } from '../components/ui'
import { AgentLine, PromptCard } from '../components/PromptCard'
import { PlanDrawing } from '../components/PlanDrawing'
import { CLI } from '../site'
import { useTheme } from '../theme'

const PLANT_SNIPPET = `{
  "name": "Test separator skid",
  "items": [
    { "tag": "V-100", "component": "horizontal-separator", "position": [0, 0, 0] },
    { "tag": "P-101", "component": "centrifugal-pump", "position": [7, 0, 5], "rotation": 180 }
  ],
  "lines": [
    { "tag": "6\\"-PO-101-D6A", "from": "V-100.liquid", "to": "P-101.suction", "service": "oil",
      "inline": [{ "component": "gate-valve", "at": 0.6 }] }
  ]
}`

const BODIES = ['ASME', 'API', 'IEC', 'ISO', 'EN', 'NFPA', 'DNV', 'NORSOK', 'ISA', 'TEMA']

declare const __SYMBOL_COUNT__: number

export function Home() {
  usePageMeta(null, 'Three.js components for oil and gas digital twins, free for personal use and sized to published engineering standards.')
  const cats = CATEGORIES.filter((c) => byCategory(c.id).length)
  return (
    <div className="home">
      <Sheet />

      <section className="home-block">
        <Lead title="How it works">Three steps, with or without an AI agent.</Lead>
        <ol className="run home-body grid gap-10 md:grid-cols-3 md:gap-[var(--col)]">
          <Stop title="Select a component">
            Each component page includes a 3D preview, size controls, source code and connection points.
          </Stop>
          <Stop title="Install it">
            The <Mono>deck-twin add</Mono> command copies the component into your project. You own the code.
          </Stop>
          <Stop title="Assemble the plant">
            Define equipment, positions and connections in <Mono>plant.json</Mono>. <Mono>&lt;Plant&gt;</Mono> generates the piping, flanges and supports.
          </Stop>
        </ol>
      </section>

      <Range cats={cats} />

      <section className="home-block">
        <Lead title="Based on industry standards">
          Dimensions are taken from published engineering codes. The library also includes {__SYMBOL_COUNT__} P&amp;ID symbols.
        </Lead>
        <div className="display home-body grid grid-cols-2 gap-x-[var(--col)] gap-y-3 text-[clamp(30px,8vw,52px)] text-ink lg:grid-cols-5 lg:text-[clamp(40px,4.1vw,60px)]">
          {BODIES.map((b) => (
            <span key={b}>{b}</span>
          ))}
        </div>
      </section>

      <section className="home-block">
        <Lead title="Built for AI agents">
          The agent skill converts P&amp;IDs, datasheets and equipment lists into a plant model and checks the result. It works with any AI model.
        </Lead>
        <div className="home-columns home-body">
          <div className="min-w-0 space-y-5">
            <PromptCard />
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="border-b border-border bg-code px-4 py-2.5 font-mono text-[13px] text-fg-3">plant.json</div>
              <Code code={PLANT_SNIPPET} lang="json" dark className="rounded-none border-0" />
            </div>
          </div>
          <div className="min-w-0">
            <dl className="divide-y divide-border border-y border-border text-[15px] text-fg-2">
              <Tool name="/r/index.json">Lists all components with their properties, ranges and ports.</Tool>
              <Tool name="deck-twin info <name>">Returns the details of one component as JSON.</Tool>
              <Tool name="deck-twin validate plant.json">Checks a plant file for unknown components, invalid ports and line class mismatches.</Tool>
            </dl>
            <div className="mt-6">
              <Command cmd={`${CLI} skill`} />
            </div>
            <Link href="/docs/agents" className="mt-5 inline-block text-[15px] font-medium text-ink underline underline-offset-4 decoration-signal decoration-2 hover:decoration-ink">
              Read the agent skill guide
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function Sheet() {
  const [state, setState] = useState<'plan' | 'ready' | 'stood'>('plan')
  const hero = EXAMPLES.find((e) => e.name === 'separation-train') ?? EXAMPLES[0]
  return (
    <section className="sheet flex flex-col min-[1240px]:min-h-[calc(100svh-3.5rem)]" data-plant={state}>
      <div className="sheet-stage">
        <PlanDrawing className="sheet-plan" />
        {hero && <ClientRisingPlant spec={hero.spec} className="sheet-canvas" onReady={() => setState('ready')} onStood={() => setState('stood')} onLost={() => setState('plan')} />}
      </div>
      <div className="pointer-events-none flex flex-1 flex-col gap-10 px-6 pt-10 pb-6 sm:pt-14 lg:pb-8 2xl:px-[max(1.5rem,calc((100vw-1440px)/2+1.5rem))]">
        <div className="my-auto max-w-[780px]">
          <h1 className="display text-[38px] sm:text-[60px] min-[1240px]:max-w-[8.8em] min-[1240px]:text-[clamp(56px,4.5vw,68px)]">3D components for oil and gas digital twins</h1>
          <p className="mt-6 max-w-[33rem] text-[17px] leading-[1.5] font-normal sm:text-[20px] min-[1240px]:max-w-[27rem]">
            Build 3D models of oil and gas facilities from P&amp;IDs, datasheets and equipment lists. All components are free for personal use and sized to published engineering standards.
          </p>
          <div className="pointer-events-auto mt-8 flex flex-wrap gap-3">
            <a href="/alpha/" className="sheet-btn solid">
              View demo
            </a>
            <Link href="/components" className="sheet-btn line">
              Browse components
            </Link>
          </div>
          <div className="dark-zone pointer-events-auto mt-5 w-full max-w-[560px]">
            <AgentLine />
          </div>
        </div>
        {hero && (
          <div className="title-block pointer-events-auto self-start bg-signal min-[1240px]:self-end">
            <span>
              <strong className="font-semibold">{hero.spec.name}</strong>: {hero.spec.items.length} items, {hero.spec.lines?.length ?? 0} lines
            </span>
            <Link href={`/examples/${hero.name}`}>Open example</Link>
          </div>
        )}
      </div>
    </section>
  )
}

function Range({ cats }: { cats: typeof CATEGORIES }) {
  const theme = useTheme()
  const [on, setOn] = useState(0)
  const cat = cats[on]
  const lead = byCategory(cat.id)[0]
  const rows = Math.ceil(cats.length / 2)
  return (
    <section className="home-block">
      <Lead title={`${ITEMS.length} components across ${cats.length} categories`}>
        From small-bore valves to pedestal cranes, including vessels, rotating equipment, instruments and structures.
      </Lead>
      <div className="home-columns home-body">
        <ul className="grid min-w-0 gap-x-[var(--col)] sm:grid-flow-col sm:[grid-template-rows:repeat(var(--rows),auto)]" style={{ '--rows': rows } as CSSProperties}>
          {cats.map((c, i) => {
            const items = byCategory(c.id)
            return (
              <li key={c.id} className={`border-b border-border ${i === 0 ? 'border-t' : ''} ${i === rows ? 'sm:border-t' : ''}`}>
                <Link href={`/components/${items[0].name}`} onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)} className={`index-row flex items-baseline justify-between gap-4 py-3 text-[15px] font-medium ${i === on ? 'text-ink' : 'text-fg-3 hover:text-ink'}`}>
                  <span>{c.title}</span>
                  <span className="text-[15px] font-normal text-muted-fg tabular-nums">{items.length}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="min-w-0">
          <div className="aspect-[16/10] overflow-hidden rounded-lg bg-stage">
            <img key={lead.name} src={thumb(lead.name, theme)} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          </div>
          <p className="mt-4 text-[15px] leading-7 text-fg-3">{cat.blurb}</p>
          <Link href="/components" className="mt-3 inline-block text-[15px] font-medium text-ink underline underline-offset-4 decoration-signal decoration-2 hover:decoration-ink">
            View all {ITEMS.length} components
          </Link>
        </div>
      </div>
    </section>
  )
}

function Lead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="home-lead">
      <h2 className="display text-ink">{title}</h2>
      <p>{children}</p>
    </div>
  )
}

function Stop({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="run-stop pt-8">
      <h3 className="display text-[24px] leading-[1.15] text-ink">{title}</h3>
      <p className="mt-2 max-w-[42ch] text-[17px] leading-7 text-fg-3">{children}</p>
    </li>
  )
}

function Tool({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="py-3.5">
      <dt className="font-mono text-[13px] text-ink">{name}</dt>
      <dd className="mt-1 text-fg-3">{children}</dd>
    </div>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded border border-border bg-muted px-1 py-px font-mono text-[13px] text-ink">{children}</code>
}
