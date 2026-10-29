# Deck Twin Library: guide for coding agents

A shadcn-style registry of standards-based three.js / R3F components for oil & gas plants, plus a website, a CLI and an agent skill. Read [README.md](README.md) first. [docs/contributing.md](docs/contributing.md) is the authoring contract for components. [docs/research.md](docs/research.md) records the sources and vendor research per category: check it before searching again.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` → http://localhost:5190. In Claude Code, use the `library` entry in `../.claude/launch.json`. |
| Validate the registry | `npx tsx scripts/build-registry.ts --check [category or name]` |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` |
| Screenshot a component | `node scripts/shoot.mjs <name> [--ports] [--props '{…}'] [--view x,y,z]` → `.snaps/` |
| Thumbnails and bounds | `node scripts/shoot.mjs --all --thumbs` |
| P&ID symbols for new components | add an entry to `scripts/pid-gen/p-*.ts`, then `npx tsx scripts/pid-gen/gen.mts` |
| Build | `npm run build`: registry → `public/r`, then type-check, then site → `dist/` |
| Deploy | `npm run deploy`: Cloudflare Workers static assets (`wrangler.jsonc`). Only when the user asks. |

## Rules

1. **Component files are copied into other people's projects.** They may import only `react`, `three`, `@react-three/fiber`, `@react-three/drei`, `../lib/*`, other registry components, or same-folder `_helpers`. `build-registry --check` enforces this.
2. **Units:** metres, NPS in inches, ASME class, degrees. Origins: `base` (footprint centre at y = 0), `inline` (ports A/B on X) or `fitting`.
3. **Ports are flange faces.** They must match the geometry exactly.
4. **Minimal comments:** one header line per file.
5. **Stay honest.** The geometry is generic, not vendor CAD, and the standards tables are reference values.
6. **Keep the docs and skill current.** When components are added or renamed, update `skill/references/component-map.md` and give them a P&ID entry. Add any new sources to `docs/research.md`.
