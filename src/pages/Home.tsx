import { Link } from 'wouter'
import { CATEGORIES, ITEMS, byCategory, thumb } from '../registry'
import { EXAMPLES } from '../plants'
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

export function Home() {
  const hero = EXAMPLES.find((e) => e.name === 'separation-train') ?? EXAMPLES[0]
  return (
    <div>
      <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 pt-14 pb-10 lg:grid-cols-[minmax(0,520px)_1fr] lg:pt-20">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {ITEMS.length} components · {CATEGORIES.length} categories
          </div>
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl">3D components for oil &amp; gas digital twins.</h1>
          <p className="mt-5 max-w-xl text-[16px] leading-7 text-zinc-600">
            Separators, pumps, valves, compressors, cranes, decks and pipe racks for three.js and React Three Fiber. Every one is sized from the standard it follows. Copy it into your project, or let your agent assemble a whole plant from a P&amp;ID.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/components" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              Browse components
            </Link>
            <Link href="/docs/assemble" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              Assemble a plant
            </Link>
          </div>
          <div className="mt-8 max-w-xl">
            <PromptCard />
          </div>
        </div>
        <div className="relative h-[440px] overflow-hidden rounded-2xl border border-border lg:h-[560px]">
          {hero ? <PlantView spec={hero.spec} className="absolute inset-0" /> : null}
          {hero && (
            <Link href={`/examples/${hero.name}`} className="absolute bottom-3 left-3 rounded-md bg-white/90 px-2.5 py-1.5 text-xs text-zinc-700 shadow-sm ring-1 ring-border hover:text-fg">
              {hero.spec.name}. Assembled from plant.json →
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          <Step n="1" title="Pick a component">
            Every component page has a live 3D preview, dimension controls, the code and its ports. Sizes come from ASME, API, TEMA, IEC and ISO tables.
          </Step>
          <Step n="2" title="Install it">
            <code className="font-mono text-[13px]">deck-twin add</code> copies one file and the shared <code className="font-mono text-[13px]">lib/</code> into your project. You own the code.
          </Step>
          <Step n="3" title="Assemble">
            Describe the plant in <code className="font-mono text-[13px]">plant.json</code>: items, positions and lines between ports. <code className="font-mono text-[13px]">&lt;Plant&gt;</code> routes the pipe, flanges and supports.
          </Step>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Categories</h2>
            <p className="mt-1 text-[14px] text-muted-fg">From a 1/2" needle valve to a pedestal crane.</p>
          </div>
          <Link href="/components" className="text-sm text-muted-fg hover:text-fg">
            All components →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CATEGORIES.map((c) => {
            const items = byCategory(c.id)
            if (!items.length) return null
            return (
              <Link key={c.id} href={`/components/${items[0].name}`} className="group overflow-hidden rounded-xl border border-border hover:shadow-md">
                <div className="aspect-[4/3] bg-[#f3f4f5]">
                  <img src={thumb(items[0].name)} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                </div>
                <div className="border-t border-border p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{c.title}</span>
                    <span className="text-xs text-muted-fg">{items.length}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-muted-fg">{c.blurb}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-10 px-6 py-14 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Built for agents</h2>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-zinc-600">
            The registry ships with an agent skill. Give it a P&amp;ID, a datasheet or a list of equipment and it maps each item to a component, sizes it, lays it out, wires the ports and checks the result. It is written so a small, cheap model can follow it.
          </p>
          <ul className="mt-5 space-y-2 text-[14px] text-zinc-700">
            <li>
              <code className="font-mono text-[13px]">/r/index.json</code>: every component with props, ranges and ports
            </li>
            <li>
              <code className="font-mono text-[13px]">deck-twin info &lt;name&gt;</code>: one component, as JSON
            </li>
            <li>
              <code className="font-mono text-[13px]">deck-twin check plant.json</code>: unknown parts, bad ports, line-number and class mismatches
            </li>
          </ul>
          <div className="mt-6 max-w-md">
            <Command cmd={`${CLI} skill`} />
          </div>
          <Link href="/docs/agents" className="mt-4 inline-block text-sm text-muted-fg underline underline-offset-4 hover:text-fg">
            Read the skill →
          </Link>
        </div>
        <Code code={PLANT_SNIPPET} lang="json" />
      </section>
    </div>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-5">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">{n}</div>
      <div className="mt-4 font-medium">{title}</div>
      <p className="mt-1.5 text-[14px] leading-6 text-zinc-600">{children}</p>
    </div>
  )
}
