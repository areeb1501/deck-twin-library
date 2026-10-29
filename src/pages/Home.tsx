import type { ReactNode } from 'react'
import { Link } from 'wouter'
import { CATEGORIES, ITEMS, byCategory, thumb } from '../registry'
import { EXAMPLES } from '../plants'
import { LIBRARY } from '../pid'
import { PlantView } from '../viewer/PlantView'
import { Code, Command } from '../components/ui'
import { PromptCard } from '../components/PromptCard'
import { CLI } from '../site'

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

export function Home() {
  const hero = EXAMPLES.find((e) => e.name === 'separation-train') ?? EXAMPLES[0]
  const cats = CATEGORIES.filter((c) => byCategory(c.id).length)
  return (
    <div>
      <section className="border-b border-border bg-gradient-to-b from-muted/70 to-white">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-12 px-6 pt-14 pb-16 lg:grid-cols-[minmax(0,540px)_1fr] lg:pt-20 lg:pb-20">
          <div>
            <h1 className="text-[42px] leading-[1.05] font-semibold text-balance text-ink sm:text-[56px]">3D components for oil &amp; gas digital twins</h1>
            <p className="mt-6 max-w-xl text-[17px] leading-7 text-slate-600">
              Separators, pumps, valves, compressors, cranes, decks and pipe racks for three.js and React Three Fiber. Each one is sized from the standard it follows. Copy it into your project, or let your agent assemble a whole plant from a P&amp;ID.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/components" className="inline-flex h-11 items-center rounded-md bg-ink px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ink-2">
                Browse components
              </Link>
              <Link href="/docs/assemble" className="inline-flex h-11 items-center rounded-md border border-border bg-white px-5 text-[15px] font-semibold text-ink shadow-sm transition-colors hover:border-slate-300 hover:bg-muted">
                Assemble a plant
              </Link>
            </div>
            <div className="mt-10 max-w-xl">
              <PromptCard />
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgb(14_26_36/0.04),0_20px_40px_-28px_rgb(14_26_36/0.3)]">
            <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-signal" />
              <span className="truncate text-[13px] font-semibold text-ink">{hero?.spec.name}</span>
              {hero && (
                <span className="hidden text-[12.5px] text-muted-fg sm:inline">
                  {hero.spec.items.length} items, {hero.spec.lines?.length ?? 0} lines, from one plant.json
                </span>
              )}
              {hero && (
                <Link href={`/examples/${hero.name}`} className="ml-auto shrink-0 text-[13px] font-medium text-brand hover:underline hover:underline-offset-4">
                  Open example
                </Link>
              )}
            </div>
            <div className="relative h-[420px] lg:h-[540px]">{hero ? <PlantView spec={hero.spec} className="absolute inset-0" /> : null}</div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-16">
          <dl className="grid grid-cols-3 gap-6 sm:gap-12">
            <Fact value={ITEMS.length} label="Components" />
            <Fact value={cats.length} label="Categories" />
            <Fact value={LIBRARY.symbols.length} label="P&ID symbols" />
          </dl>
          <div className="lg:border-l lg:border-border lg:pl-16">
            <div className="text-[14px] text-muted-fg">Dimensions come from the codes your engineers already work to</div>
            <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2 text-[17px] font-semibold text-slate-400">
              {BODIES.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 pt-20 pb-6">
        <h2 className="text-[30px] font-semibold text-ink">From one component to a whole plant</h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          <Step n={1} title="Pick a component">
            Every component page has a live 3D preview, dimension controls, the code and its ports. Sizes come from ASME, API, TEMA, IEC and ISO tables.
          </Step>
          <Step n={2} title="Install it">
            <Mono>deck-twin add</Mono> copies one file and the shared <Mono>lib/</Mono> into your project. You own the code.
          </Step>
          <Step n={3} title="Assemble">
            Describe the plant in <Mono>plant.json</Mono>: items, positions and lines between ports. <Mono>&lt;Plant&gt;</Mono> routes the pipe, flanges and supports.
          </Step>
        </ol>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[30px] font-semibold text-ink">Categories</h2>
            <p className="mt-2 text-[16px] text-slate-600">From a 1/2" needle valve to a pedestal crane.</p>
          </div>
          <Link href="/components" className="inline-flex h-10 items-center rounded-md border border-border px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-muted">
            View all {ITEMS.length} components
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cats.map((c) => {
            const items = byCategory(c.id)
            return (
              <Link key={c.id} href={`/components/${items[0].name}`} className="group overflow-hidden rounded-xl border border-border bg-white transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(14_26_36/0.18)]">
                <div className="aspect-[4/3] bg-stage">
                  <img src={thumb(items[0].name)} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                </div>
                <div className="border-t border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-ink transition-colors group-hover:text-ink">{c.title}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-fg">{items.length}</span>
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-5 text-muted-fg">{c.blurb}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-[30px] font-semibold">Built for agents</h2>
            <p className="mt-4 max-w-xl text-[16px] leading-7 text-slate-300">
              The registry ships with an agent skill. Give it a P&amp;ID, a datasheet or an equipment list and it maps each item to a component, sizes it, lays it out, wires the ports and checks the result. It is written so a small, cheap model can follow it.
            </p>
            <ul className="mt-7 space-y-3 text-[14.5px] text-slate-300">
              <Check>
                <Mono dark>/r/index.json</Mono> lists every component with its props, ranges and ports
              </Check>
              <Check>
                <Mono dark>deck-twin info &lt;name&gt;</Mono> returns one component as JSON
              </Check>
              <Check>
                <Mono dark>deck-twin check plant.json</Mono> finds unknown parts, bad ports, and line-number or class mismatches
              </Check>
            </ul>
            <div className="mt-8 max-w-md">
              <Command cmd={`${CLI} skill`} />
            </div>
            <Link href="/docs/agents" className="mt-5 inline-block text-[14px] font-semibold text-[#7fd1cf] hover:underline hover:underline-offset-4">
              Read the agent skill
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10 shadow-2xl">
            <div className="border-b border-white/10 bg-ink-2 px-4 py-2.5 font-mono text-[12px] text-slate-400">plant.json</div>
            <Code code={PLANT_SNIPPET} lang="json" dark className="rounded-none border-0" />
          </div>
        </div>
      </section>
    </div>
  )
}

function Fact({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="text-[32px] leading-none font-semibold text-ink tabular-nums">{value}</dd>
      <dd className="mt-2 text-[13.5px] text-muted-fg">{label}</dd>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative border-t-2 border-border pt-6">
      <span className="absolute -top-[2px] left-0 h-[2px] w-16 bg-brand" />
      <div className="text-[13px] font-semibold text-brand">Step {n}</div>
      <div className="mt-1.5 text-[19px] font-semibold text-ink">{title}</div>
      <p className="mt-2 text-[15px] leading-7 text-slate-600">{children}</p>
    </li>
  )
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <svg viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0 text-signal" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </li>
  )
}

function Mono({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <code className={`rounded px-1 py-px font-mono text-[13px] ${dark ? 'bg-white/10 text-white' : 'border border-border bg-muted text-ink'}`}>{children}</code>
}
