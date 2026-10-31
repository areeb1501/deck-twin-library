import { useState, type ReactNode } from 'react'
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
  usePageMeta(null, 'Standards-based three.js components for oil & gas digital twins. Copy, paste, assemble.')
  const cats = CATEGORIES.filter((c) => byCategory(c.id).length)
  return (
    <div className="home">
      <Sheet />

      <section className="mx-auto max-w-[1440px] px-6 pt-24 pb-28 sm:pt-32 sm:pb-36">
        <h2 className="display max-w-[16ch] text-[40px] text-ink sm:text-[64px]">From one component to a whole plant</h2>
        <p className="mt-5 text-[17px] text-fg-3">Three steps, and every one of them works with or without an agent.</p>
        <ol className="run mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
          <Stop title="Pick a component">
            Every component page has a live 3D preview, dimension controls, the code and its ports. Sizes come from ASME, API, TEMA, IEC and ISO tables.
          </Stop>
          <Stop title="Install it">
            <Mono>deck-twin add</Mono> copies one file and the shared <Mono>lib/</Mono> into your project. You own the code.
          </Stop>
          <Stop title="Assemble">
            Describe the plant in <Mono>plant.json</Mono>: items, positions and lines between ports. <Mono>&lt;Plant&gt;</Mono> routes the pipe, flanges and supports.
          </Stop>
        </ol>
      </section>

      <Range cats={cats} />

      <section className="border-y border-border">
        <div className="mx-auto max-w-[1440px] px-6 py-20 sm:py-28">
          <p className="max-w-[44ch] text-[19px] leading-8 text-fg-2">
            {ITEMS.length} components in {cats.length} categories, and {__SYMBOL_COUNT__} P&amp;ID symbols. Dimensions come from the codes your engineers already work to.
          </p>
          <div className="display mt-10 flex flex-wrap gap-x-[0.5em] gap-y-[0.12em] text-[clamp(34px,9vw,72px)] text-ink lg:grid lg:grid-cols-[repeat(5,auto)] lg:justify-between lg:gap-x-6 lg:text-[clamp(56px,5.4vw,84px)]">
            {BODIES.map((b) => (
              <span key={b}>{b}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] grid-cols-1 items-start gap-14 px-6 py-24 sm:py-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <h2 className="display text-[40px] text-ink sm:text-[64px]">Built for agents</h2>
          <p className="mt-6 max-w-xl text-[17px] leading-8 text-fg-2">
            The registry ships with an agent skill. Give it a P&amp;ID, a datasheet or an equipment list and it maps each item to a component, sizes it, lays it out, wires the ports and checks the result. It's model-agnostic and works just as well with cost-effective models.
          </p>
          <dl className="mt-9 divide-y divide-border border-y border-border text-[15px] text-fg-2">
            <Tool name="/r/index.json">lists every component with its props, ranges and ports</Tool>
            <Tool name="deck-twin info <name>">returns one component as JSON</Tool>
            <Tool name="deck-twin validate plant.json">finds unknown parts, bad ports, and line-number or class mismatches</Tool>
          </dl>
          <div className="mt-8 max-w-md">
            <Command cmd={`${CLI} skill`} />
          </div>
          <Link href="/docs/agents" className="mt-5 inline-block text-[15px] font-medium text-ink underline underline-offset-4 decoration-signal decoration-2 hover:decoration-ink">
            Read the agent skill
          </Link>
        </div>
        <div className="space-y-5">
          <PromptCard />
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-code px-4 py-2.5 font-mono text-[12px] text-fg-3">plant.json</div>
            <Code code={PLANT_SNIPPET} lang="json" dark className="rounded-none border-0" />
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
          <h1 className="display text-[38px] sm:text-[60px] min-[1240px]:max-w-[8.8em] min-[1240px]:text-[clamp(56px,4.5vw,68px)]">3D components for oil &amp; gas digital twins</h1>
          <p className="mt-6 max-w-[33rem] text-[18px] leading-[1.5] font-[450] sm:text-[20px] min-[1240px]:max-w-[27rem]">
            Turn the data you already have into a 3D model of your plant, then link the model back to that data. Every part is open-source code you can customise.
          </p>
          <div className="pointer-events-auto mt-8 flex flex-wrap gap-3">
            <Link href="/components" className="sheet-btn solid">
              Browse components
            </Link>
            <a href="/alpha/" className="sheet-btn line">
              Explore demo
            </a>
          </div>
          <div className="dark-zone pointer-events-auto mt-5 w-full max-w-[560px]">
            <AgentLine />
          </div>
        </div>
        {hero && (
          <div className="title-block pointer-events-auto self-start bg-signal min-[1240px]:self-end">
            <span>
              <strong className="font-semibold">{hero.spec.name}</strong>, {hero.spec.items.length} items and {hero.spec.lines?.length ?? 0} lines from one plant.json
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
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-[1440px] px-6 pt-24 sm:pt-32">
        <h2 className="display max-w-[18ch] text-[40px] text-ink sm:text-[clamp(56px,6.4vw,92px)]">From a 1/2" needle valve to a pedestal crane</h2>
      </div>
      <div className="mx-auto mt-14 grid max-w-[1440px] grid-cols-1 gap-10 px-6 pb-24 sm:pb-32 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:gap-16">
        <ul className="border-t border-border">
          {cats.map((c, i) => {
            const items = byCategory(c.id)
            return (
              <li key={c.id} className="border-b border-border">
                <Link href={`/components/${items[0].name}`} onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)} className={`index-row flex items-baseline justify-between gap-4 py-2.5 text-[19px] font-medium ${i === on ? 'text-ink' : 'text-fg-3 hover:text-ink'}`}>
                  <span>{c.title}</span>
                  <span className="text-[14px] font-normal text-muted-fg tabular-nums">{items.length}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="aspect-[4/3] overflow-hidden rounded-lg bg-stage">
            <img key={lead.name} src={thumb(lead.name, theme)} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          </div>
          <p className="mt-4 max-w-[52ch] text-[15.5px] leading-7 text-fg-3">{cat.blurb}</p>
          <Link href="/components" className="mt-5 inline-block text-[15px] font-medium text-ink underline underline-offset-4 decoration-signal decoration-2 hover:decoration-ink">
            View all {ITEMS.length} components
          </Link>
        </div>
      </div>
    </section>
  )
}

function Stop({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="run-stop pt-8">
      <div className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</div>
      <p className="mt-3 max-w-[38ch] text-[16px] leading-7 text-fg-3">{children}</p>
    </li>
  )
}

function Tool({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <dt className="font-mono text-[13.5px] text-ink">{name}</dt>
      <dd className="mt-1 text-fg-3">{children}</dd>
    </div>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded border border-border bg-muted px-1 py-px font-mono text-[13px] text-ink">{children}</code>
}
