# Deck Twin

Standards-based three.js / React Three Fiber components for oil & gas digital twins. You copy them into your project, then assemble plants from data.

**Site:** https://deck-twin-library.demoareeb.workers.dev · **Source:** https://github.com/areeb1501/deck-twin-library

- **Components**: separators, columns, tanks, pumps, compressors, gas turbines, exchangers, valves, piping, instruments, fire & gas devices, decks, pipe racks, jackets, bridges, cranes, process packages, and an animated ocean and day or night sky for offshore scenes. Each is one readable `.tsx` file.
- **Standards**: sized from ASME B36.10, B16.5, B16.9, B16.10 and VIII-1, API 526/594/609/610/617/618/650, TEMA, IEC 60072, ISO 14122 and ISO 14726. Change the NPS or the class and the geometry follows.
- **Ports**: every flange face is a port. `plant.json` wires ports together, and `<Plant>` routes the pipe with B16.9 elbows, mating flanges, gaskets, studs, inline valves, colour bands and supports.
- **For agents**: `SKILL.md`, `/r/index.json`, `/r/<name>.md`, `llms.txt`, and `deck-twin validate` and `assemble` that any model can drive, including cost-effective ones.

## Use

Until it is published to npm, run the CLI from the deployed site: `npx -y <site>/cli/deck-twin-0.2.2.tgz <command>`. The examples below use the short `npx deck-twin`.

```bash
npx deck-twin add horizontal-separator centrifugal-pump gate-valve
npx deck-twin info centrifugal-pump
npx deck-twin validate plant.json && npx deck-twin assemble plant.json
npx deck-twin skill
```

| Doc | What it covers |
|---|---|
| [Introduction](docs/introduction.md) | What it is, and what it isn't |
| [Installation](docs/installation.md) | Setting up a project |
| [CLI](docs/cli.md) | Every command |
| [Assembling plants](docs/assemble.md) | Writing a `plant.json` |
| [Agent skill](docs/agents.md) | Using it from an AI agent |
| [Conventions](docs/conventions.md) | Units, axes, ports, materials |
| [Standards](docs/standards.md) | The dimensional tables |
| [Adding a component](docs/contributing.md) | Writing a new component |
| [Research notes](docs/research.md) | Sources, vendors and decisions behind each category. Read before re-researching. |

## Repository

| Path | What |
|---|---|
| `registry/lib/` | Shared core: geometry kit, PBR materials, textures, parts, ports, router, stage, `standards/` tables |
| `registry/<category>/` | Components (`*.tsx`), shared `_helpers`, and `_meta*.ts` (title, description, standards, controls) |
| `registry/assembly/` | `plant.json` types and the `<Plant>` assembler |
| `registry/examples/` | Example plants |
| `registry/pid/` | P&ID data: one symbol and datasheet mapping per component (`pid.json`, `symbols/`), plus the extended legend (`library.json`, `library/`) |
| `src/` | The website: gallery, component pages with live preview and controls, docs, examples, playground |
| `cli/deck-twin.mjs` | The CLI. Zero dependencies. |
| `skill/` | The agent skill |
| `scripts/` | `build-registry.ts` (writes `public/r`, `llms.txt`, `sitemap.xml`, `robots.txt` and the skill), `prerender.ts` (renders every sitemap page to its own HTML file in `dist`, with its title, description and canonical), `shoot.mjs` (headless screenshots and thumbnails), `pid-gen/` (per-component P&ID symbols), `pid-legend/` (the extended legend) |

## Develop

```bash
npm install
npm run dev                                   # http://localhost:5190
npx tsx scripts/build-registry.ts --check     # validate every component
node scripts/shoot.mjs <name> --ports         # screenshot to .snaps/
node scripts/shoot.mjs --all --thumbs         # regenerate thumbnails and bounds
npm run build                                 # registry + type-check + site → dist/
npm run deploy                                # build + wrangler deploy (Cloudflare Workers static assets)
```

## Honesty

The geometry is generic and representative, built from public standards. It is not vendor CAD, and it doesn't reproduce any manufacturer's product. Supplier names on component pages show who makes that type of equipment. The standards tables are reference values: check them against the current edition before engineering use.

## License

MIT
