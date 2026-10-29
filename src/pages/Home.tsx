import { useMemo, type ReactNode } from 'react'
import { Link } from 'wouter'
import { CATEGORIES, ITEMS, byCategory, thumb } from '../registry'
import { EXAMPLES } from '../plants'
import { LIBRARY } from '../pid'
import { PlantView } from '../viewer/PlantView'
import { Code, Command } from '../components/ui'
import { AgentLine, PromptCard } from '../components/PromptCard'
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

export function Home() {
  const theme = useTheme()
  const hero = EXAMPLES.find((e) => e.name === 'separation-train') ?? EXAMPLES[0]
  const heroSpec = useMemo(() => (hero?.spec.camera ? { ...hero.spec, camera: { ...hero.spec.camera, radius: hero.spec.camera.radius * 0.78 } } : hero?.spec), [hero])
  const cats = CATEGORIES.filter((c) => byCategory(c.id).length)
  return (
    <div>
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="hero-grain absolute inset-0" />
          <div className="grain absolute inset-0" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-bg" />
        </div>
        <div className="relative mx-auto max-w-[1440px] px-6 pt-16 pb-16 sm:pt-24 sm:pb-20">
          <div className="mx-auto max-w-[800px] text-center">
            <Link href="/components" className="group mb-7 inline-flex items-center gap-2 glass rounded-full border border-border py-1 pr-3 pl-3 text-[12.5px] whitespace-nowrap sm:pl-1 sm:text-[13px] text-fg-2 transition-colors hover:border-line-strong hover:text-ink">
              <span className="hidden items-center gap-1.5 rounded-full bg-hover px-2 py-0.5 text-[11.5px] font-medium text-ink sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-signal" />Open source</span>
              {ITEMS.length} components, {LIBRARY.symbols.length} P&amp;ID symbols
              <span aria-hidden className="text-muted-fg transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <h1 className="text-[42px] leading-[1.04] font-semibold tracking-[-0.04em] text-balance sm:text-[72px]">
              <span className="head-grad">3D components for</span> <span className="hero-ink">oil &amp; gas digital twins</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-7 text-pretty text-fg-3 sm:text-[18px] sm:leading-8">
              An open-source library of 3D oil &amp; gas equipment for three.js, each part sized to its engineering standard. Use the parts in your own project, or let your AI agent build whole plants from your P&amp;IDs.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/components" className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-[15px] font-medium text-on-ink shadow-sm transition-[transform,background-color] duration-150 hover:bg-ink-2 active:scale-[0.97]">
                Browse components
              </Link>
              <Link href="/docs/assemble" className="glass inline-flex h-11 items-center rounded-full px-6 text-[15px] font-medium text-ink ring-1 ring-border transition-[transform,background-color] duration-150 hover:bg-hover active:scale-[0.97]">
                Assemble a plant
              </Link>
            </div>
            <AgentLine className="mx-auto mt-7 max-w-[720px]" />
          </div>
          <div className="relative mx-auto mt-14 max-w-[1240px] overflow-hidden rounded-2xl border border-border glass shadow-[0_40px_100px_-30px_rgb(59_70_207/0.55)] light:shadow-[0_40px_100px_-40px_rgb(59_70_207/0.35)] sm:mt-16">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-signal" />
              <span className="truncate text-[13px] font-semibold text-ink">{hero?.spec.name}</span>
              {hero && (
                <span className="hidden text-[12.5px] text-muted-fg sm:inline">
                  {hero.spec.items.length} items and {hero.spec.lines?.length ?? 0} lines from one plant.json. Drag to orbit.
                </span>
              )}
              {hero && (
                <Link href={`/examples/${hero.name}`} className="ml-auto shrink-0 text-[13px] font-medium text-brand hover:underline hover:underline-offset-4">
                  Open example
                </Link>
              )}
            </div>
            <div className="relative h-[360px] sm:h-[520px] lg:h-[620px]">{heroSpec ? <PlantView spec={heroSpec} className="absolute inset-0" /> : null}</div>
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
            <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2 text-[17px] font-semibold text-fg-3">
              {BODIES.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 py-20">
        <h2 className="head-grad text-[32px] font-semibold tracking-[-0.03em]">From one component to a whole plant</h2>
        <p className="mt-2 text-[16px] text-fg-3">Three steps, and every one of them works with or without an agent.</p>
        <ol className="mt-10 grid gap-4 md:grid-cols-3 md:gap-5">
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

      <section className="border-t border-border">
        <div className="mx-auto max-w-[1440px] px-6 py-20">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="head-grad text-[32px] font-semibold tracking-[-0.03em]">Categories</h2>
              <p className="mt-2 text-[16px] text-fg-3">From a 1/2" needle valve to a pedestal crane.</p>
            </div>
            <Link href="/components" className="inline-flex h-10 items-center rounded-md border border-border px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-muted">
              View all {ITEMS.length} components
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cats.map((c) => {
              const items = byCategory(c.id)
              return (
                <Link key={c.id} href={`/components/${items[0].name}`} className="group overflow-hidden rounded-xl border border-border bg-surface transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)]">
                  <div className="aspect-[4/3] bg-stage">
                    <img src={thumb(items[0].name, theme)} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  </div>
                  <div className="border-t border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink">{c.title}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-fg">{items.length}</span>
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-5 text-muted-fg">{c.blurb}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section className="agents-band relative isolate overflow-hidden text-white light:text-ink">
        <div aria-hidden className="grain pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-start gap-12 px-6 py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="head-grad text-[32px] font-semibold tracking-[-0.03em]">Built for agents</h2>
            <p className="mt-4 max-w-xl text-[16px] leading-7 text-fg-2">
              The registry ships with an agent skill. Give it a P&amp;ID, a datasheet or an equipment list and it maps each item to a component, sizes it, lays it out, wires the ports and checks the result. It's model-agnostic and works just as well with cost-effective models.
            </p>
            <ul className="mt-7 space-y-3 text-[14.5px] text-fg-2">
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
            <Link href="/docs/agents" className="mt-5 inline-block text-[14px] font-semibold text-brand-soft hover:underline hover:underline-offset-4">
              Read the agent skill
            </Link>
          </div>
          <div className="space-y-5">
            <PromptCard />
            <div className="overflow-hidden rounded-xl border border-border shadow-2xl light:shadow-[0_1px_2px_rgb(16_18_27/0.05),0_24px_56px_-34px_rgb(16_18_27/0.18)]">
              <div className="border-b border-border bg-code px-4 py-2.5 font-mono text-[12px] text-fg-3">plant.json</div>
              <Code code={PLANT_SNIPPET} lang="json" dark className="rounded-none border-0" />
            </div>
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
    <li className="glass relative overflow-hidden rounded-2xl border border-border p-6">
      <span aria-hidden className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-signal/70 via-signal/20 to-transparent" />
      <div className="inline-flex items-center gap-2 text-[12px] font-medium tracking-[0.14em] text-muted-fg uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        Step {n}
      </div>
      <div className="mt-1.5 text-[19px] font-semibold text-ink">{title}</div>
      <p className="mt-2 text-[15px] leading-7 text-fg-3">{children}</p>
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
  return <code className={`rounded px-1 py-px font-mono text-[13px] ${dark ? 'bg-hover text-white light:text-ink' : 'border border-border bg-muted text-ink'}`}>{children}</code>
}
