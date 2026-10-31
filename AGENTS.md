# Deck Twin Library: guide for coding agents

A shadcn-style registry of standards-based three.js / R3F components for oil & gas plants, plus a website, a CLI and an agent skill. Read [README.md](README.md) first. [docs/contributing.md](docs/contributing.md) is the authoring contract for components. [docs/research.md](docs/research.md) records the sources and vendor research per category: check it before searching again.

## One repo

**All work happens here.** This repo holds the site, the registry, the CLI, the skill, the twin demo (`alpha/`) and the SAM 3.1 service (`modal/`).

- **Changes** go in this folder, including changes to the twin: edit `alpha/src` directly.
- **Commits** go to this repo, GitHub `areeb1501/deck-twin-library`, branch `main`.
- **Deployments** happen by themselves: Cloudflare Workers Builds deploys every push to `main`, so a push to `main` goes live. Push there only when the user wants it live. Other branches get a preview build.
- **`PIDS/deck-twin`** and its Vercel project are not worked on for now. Don't edit, commit to or deploy them unless the user asks. It is still useful to read: `docs/PLANT.md` and `AGENTS.md` there describe the plant and the twin's code.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` → http://localhost:5190. In Claude Code, use the `library` entry in `../.claude/launch.json`. |
| Twin dev server | `npm run dev` in `alpha/` → http://localhost:5191/alpha/demo/ |
| Tests | `npm test` here (library and CLI), `npm test` in `alpha/` (twin), `uv run --no-project pytest -m "not live"` in `modal/` (SAM service). GitHub Actions runs all three on every push, on any branch. `npm test` here rebuilds the registry, which rewrites `public/r` and some tracked files, so run it in a clean clone when other sessions are working here. |
| Deploy SAM 3.1 to Modal | `./setup.sh` in `modal/`. See `modal/README.md`. |
| Validate the registry | `npx tsx scripts/build-registry.ts --check [category or name]` |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` |
| Screenshot a component | `node scripts/shoot.mjs <name> [--ports] [--props '{…}'] [--view x,y,z]` → `.snaps/` |
| Thumbnails and bounds | `node scripts/shoot.mjs --all --thumbs` |
| P&ID symbols for new components | add an entry to `scripts/pid-gen/p-*.ts`, then `npx tsx scripts/pid-gen/gen.mts` |
| Home hero drawing | after changing `separation-train.plant.json` or `registry/generated/bounds.json`, `npx tsx scripts/plan-drawing.ts` rewrites `src/pages/homePlan.json` |
| Build | `npm run build`: registry → `public/r`, then type-check, then site → `dist/`, then `scripts/prerender.ts` renders every sitemap page to HTML in `dist/` |
| Build everything | `npm run build:all`: the twin in `alpha/` into `public/alpha`, then the site. This is what a deploy from GitHub runs. |
| Deploy | Push to `main`: Workers Builds runs `npm run build:all`, then `npx wrangler deploy`. `npm run deploy` by hand skips the twin build, so run `npm run build` in `alpha/` first. |

## Rules

1. **Component files are copied into other people's projects.** They may import only `react`, `three`, `@react-three/fiber`, `@react-three/drei`, `../lib/*`, other registry components, or same-folder `_helpers`. `build-registry --check` enforces this.
2. **Units:** metres, NPS in inches, ASME class, degrees. Origins: `base` (footprint centre at y = 0), `inline` (ports A/B on X) or `fitting`.
3. **Ports are flange faces.** They must match the geometry exactly.
4. **Minimal comments:** one header line per file.
5. **Stay honest.** The geometry is generic, not vendor CAD, and the standards tables are reference values.
6. **Keep the docs and skill current.** When components are added or renamed, update `skill/references/component-map.md` and give them a P&ID entry. Add any new sources to `docs/research.md`.
7. **Every page is prerendered.** New components, docs, symbols and examples get their HTML automatically. A new kind of page needs its route in `pages` in `scripts/build-registry.ts`, an `h1`, a `usePageMeta` call, and nothing browser-only during render: use effects, and `ClientPlant` for 3D. The build stops and names the page if any of this is missing.
