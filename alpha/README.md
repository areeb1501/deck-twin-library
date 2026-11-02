# /alpha: private Deck Twin demo

Two pages, served unlisted on the library site:

| Path | What |
|---|---|
| `/alpha/` | Landing page (`index.html`, `landing/`): plain HTML and CSS, no WebGL |
| `/alpha/demo/` | The twin (`demo/index.html`, `src/`, `bridge/`, `lite/`) |

- The twin draws its UI at 90 % here (`twin-scale` in `demo/index.html`, set by `lite/boot.ts`). The 3D viewport isn't scaled, so picking and the canvas size are unchanged.
- The landing page carries the library site's nav (plain HTML in `index.html`, so a new site tab goes in both places). Search and ⌘K open a dialog on the page itself (`landing/search.ts`), with the site's ranking and the same results. It fetches `/r/index.json` on first use. It has no theme toggle: the page is dark only.
- Linked from the library home page since 2026-10-30, at the user's request. Still not in the sitemap, robots.txt or llms.txt.
- `noindex, nofollow` meta tags in both pages, plus an `X-Robots-Tag` header from `../public/_headers`, which is tracked so a deploy from GitHub keeps it.
- Tracked in git since 2026-10-30, so the repo must stay private: making it public exposes this code and the page. `../public/alpha/` (build output) stays local, listed in `.git/info/exclude`.
- `src/` began as a copy of `../../deck-twin`, and this folder is now the source. Edit `src/` here. There is no refresh from `deck-twin` any more.
- The Workers button has a stepper beside it: 10 on shift by default, 1 to 24, kept between visits. `WORKER_COUNT` in `src/state/store.ts` sets the cap. `node tools/crew.mjs` tests it against the dev server.
- Anyone with the URL can open it. Build with `DEMO_PASSWORD` set to add the password gate to the twin.

## Plant outfit and look

- **Outfit.** `src/model/alphaOutfit.ts` adds the utility systems on Alpha: plant air, fresh water, utility stations, hose reels, deluge grids, the K-2200 lube oil console, the topsides HPU, diesel storage, open drains, a pig receiver, nitrogen, and control valve bypasses. Every line ties into a real header or nozzle. The simulation's process model is unchanged, so these items have design data but no live values.
- **Library parts.** `src/model/libraryItems.ts` lists the registry components used on Alpha. They are `proxy` equipment with a `library` field, drawn by `src/scene/equipment/Proxy.tsx` with the plant's own materials. Their nozzles come from the parts' own ports.
- **Cranes.** `src/scene/env/Cranes.tsx` puts the registry's `pedestal-crane` parts on the animated rig. `crane.ts` keeps only the boom rest and the rope sets, which follow the simulation.
- **Fire and gas.** `src/scene/GasCloud.tsx` sizes the plumes from the detection model, and `src/scene/fx/plumeFx.ts` is the particle shaders. A fire borrows the flare's point light (`fireGlow` in `src/scene/fx/simRead.ts`), so normal running pays for no extra light.
- **Keep it light.** The frame budget comes first. Measure draw calls and triangles rather than frame rate, which swings with whatever else the machine is doing. Bores and vessel internals are skipped unless a section cut or x-ray can show them (`INSIDE` in `src/scene/perf/StaticBatcher.tsx`). Quality starts at medium and climbs if the browser has headroom.
- **Loader.** Plain HTML and CSS in `demo/index.html`, so it is up before any script runs, and the bar moves on a composited transform, so it keeps going while the plant is built. `src/ui/bootLoader.ts` changes its text and takes it down when the static batcher finishes, with a cap of 12 s after the first frame.
- **Walkways.** Keep the escape aisles, the perimeter walkway and the cellar's green route clear: no equipment, risers, supports or low pipe. Fix fittings such as beacons to structure that is already there, not to new poles.

## Media

Clips and stills are in the private R2 bucket `deck-twin-alpha-media`, under `v2/`, served at `/alpha/media/*` by `worker.js`, which also sets noindex and handles the range requests Safari needs for video. The bucket has no public URL. They were cut from `../../deck-twin/video/out/clips`: 1280 to 1920 px wide, H.264 with no sound, each with a same-named `.webp` poster. The two long films, `hero-flyover` (25.6 s) and `walk-bridge` (13 s), have `data-film` in `index.html`: each also has `.av1.mp4` and a small `-sm.mp4` cut, and a baked dissolve so the loop has no jump. Objects are cached as immutable, so a changed file needs a new name or a `v2/`. In dev, `/alpha/media` proxies to the live site. `landing/media.sh` rebuilds and uploads the whole set; change `SET` in it for a new version.

## Phones and small screens

`demo/index.html` loads `lite/boot.ts`, not `src/main.tsx`. It picks a tier before the 3.8 MB twin is fetched:

| Device | Gets |
|---|---|
| Laptop, desktop, 12.9" iPad, anything with a fine pointer | the full twin |
| Phones and smaller tablets (touch only, short side under 1024 px) | `lite/lite.ts`: model renders, console screenshots, design facts and the "best viewed on a larger, GPU-enabled device" note. No WebGL |
| No WebGL2, or a screen under 340 px | a "not compatible" note |

Phones can't open the twin from the light view (the user's choice: it crashes them). The images in `lite/img/` are
captures of the twin: renders via `?tick` plus `__snap` (camera presets, walk view, the V-1100 section box) and
headless screenshots of the console pages.

## Loading plant.json

`bridge/` lets the twin load a library `plant.json` and draw the real registry components. `lite/boot.ts` loads it before the app starts.

| File | What |
|---|---|
| `bridge/index.ts` | Registers the format and the renderer with the engine's seams. Everything heavy loads on demand. |
| `bridge/load.ts` | Runs `cli/check.mjs` and `resolve()`, the code behind `deck-twin check` and `<Plant>`, so a file that passes the CLI loads here. Builds the engine shell: one invisible proxy per item, plus data-only lines. |
| `bridge/LibraryLayer.tsx` | Draws `<Plant>` in the plant root, measures each item, tags meshes for picking, and joins registry materials to the section box and x-ray. |
| `bridge/brief.ts` | The rules behind the plant menu's *Agent rules* button. |

Imported plants have no process model, so the ticker, alarm bar, Operations, maintenance and the console are hidden for them.

## Building a scenario with AI

Start from the New scenario box at the top of the Scenarios page, or Make a variant on any built-in briefing. The builder has three panes: the conversation, the draft, and the model connection in a sidebar. Scenarios are marked with who created them, and stay in this browser until sign-in and the database are in use.

On the console's Scenarios page, **Build with AI** opens a chat. The operator says what they want to train, the model writes a scenario, and it joins the library in this browser.

**The model writes data, never code.** A built-in scenario holds closures. A generated one is a JSON spec in a fixed vocabulary of conditions and effects, and a compiler turns it into an ordinary `Scenario`, so the runner, scoring and debrief don't know the difference. Nothing a model returns is ever evaluated.

| File | What |
|---|---|
| `src/sim/scen/spec.ts` | The format: conditions, effects, metrics |
| `src/sim/scen/compile.ts` | Spec to `Scenario`, using the same helpers as the built-in library |
| `src/sim/scen/validate.ts` | Checks every tag, zone, reference and number against the loaded plant and what the engine drives |
| `src/sim/scen/dryRun.ts`, `dryRun.worker.ts` | Runs a spec once with nobody at the console, on a separate copy of the engine in a Web Worker, so the live plant never notices |
| `src/sim/scen/examples.ts` | Three built-ins as specs. They teach the model the format, and `tests/scenario-spec.test.ts` proves each scores exactly like its hand-written twin |
| `src/sim/scen/custom.ts` | Saved scenarios, in localStorage under `deckTwin.customScenarios.v1`, with their conversations |
| `src/agents/scenarioPrompt.ts` | The system prompt, built from the running code and the loaded plant |
| `src/agents/scenarioAuthor.ts` | The conversation, the checks and the spending rules |
| `src/agents/authorProvider.ts` | Providers, list prices and the stream reader |
| `src/ui/hmi/ScenarioAuthor.tsx` | The chat in the console |
| `llm-route.js` | The Worker route to the providers. The dev server mounts the same code |

**The checks.** Each reply is validated, then run unattended. What fails goes back to the model, up to twice per Send. A scenario can't be saved if a tag, zone, alarm or shutdown cause doesn't exist, if nothing happened to the plant, if a step fired before anything went wrong, if it asks for an alarm that never came, or if a trainee who does nothing passes. A saved one is checked again before it starts.

**Providers.** The operator brings the key and pays the provider directly.

| Provider | Model | Needs |
|---|---|---|
| Modal shared endpoint | Muse Spark Open, fixed | the endpoint URL and a `wk-….ws-…` proxy token |
| Baseten | `meta-models/muse-spark-open-1026`, fixed | an API key |
| Meta Model API | chosen from a list | an API key, shared with the camera page |

Keys are kept encrypted in IndexedDB (`src/safety/metaKey.ts`). They travel in the POST body and the route forwards them and keeps nothing. It builds the upstream request itself and reaches only `api.meta.ai`, `inference.baseten.co` and `*.modal.direct`, so it can't be used as an open relay. None of these can be called from a browser directly: Modal refuses the preflight, and Meta's docs say to keep keys off the page.

**What it costs.** Nothing goes out until the operator presses Send. One Send can use up to three requests. A page load stops at 24 requests or 400,000 tokens, any error stops the turn with no retry, and the running count stays on screen. The dollar figure is tokens × list price, an estimate rather than the bill. `node tools/scenario-author.mjs` drives the real console with a fake model at no cost; set `LLM_ENDPOINT` and `LLM_KEY` in the environment to use a real one.

**Honesty.** A generated scenario says which model wrote it and that no engineer reviewed it, and its ideal response is the model's estimate, not a calibrated figure. The Meta path follows Meta's docs and the shape SAM 3.1 uses, but hasn't been run against the real API with a valid key.

**Not included.** Custom scenarios stay out of what-if on the Risk page, the agent tools and the alert rules, which are hand-mapped to the twelve built-ins. The in-app agents in `src/agents/provider.ts` are unchanged.

## Next action and the RCM library

The console's Response page shows what is wrong, what to do next and why. Beside a running scenario, `NextActions` shows the same card.

| File | What |
|---|---|
| `src/agents/nextAction.ts` | Reads the open situations, builds the rule plan and the evidence pack, asks the model, checks the reply, spending rules, and the plugin that verifies steps |
| `src/agents/plantActions.ts` | The fixed list of actions, the checks on them, the recorded controls they run through, and how each effect is read back |
| `src/sim/rcm.ts` | Example RCM rows, in localStorage under `deckTwin.rcm.v1` once edited |
| `src/ui/hmi/ResponsePage.tsx` | The page, the step cards and the RCM editor |

**What it can see.** Alarms, fire and gas zones, latched shutdowns and machine health. Never `incidents`, the simulator's hidden fault list.

**The model proposes, the operator approves.** Agent tools stay read-only. A model names an action from the fixed list and every step must cite the evidence, so a step that fails the checks goes back once and is then dropped. Abandon platform is not on the list. Buttons take two clicks, and they call the same recorded controls as the console, so scoring and handover see them.

**What it costs.** It shares the providers, keys and route with Build with AI. Nothing goes out until the operator presses the button. One press is one request, plus one repair. A page load stops at 12 requests or 150,000 tokens, and any error stops with no retry. `agents/provider.ts` is unchanged, so `PROVIDER_LABEL.muse` stays "(planned)".

**Tested with a stubbed model.** `tests/next-action.test.ts` and `tools/next-action.mjs` count requests and never call a provider. No real model has run this path yet.

## Agents on Muse Spark

The agents, Investigate and Ask the plant all run on Muse Spark through `src/agents/runtime.ts`. The read-only tools read the live plant, and their results go to the model as evidence for one answer. One click is one request, counted against the same limit and running cost as the scenario builder.

There is one connection for the whole console, held in `src/agents/scenarioAuthor.ts`. A key already saved in this browser is found and used. With none, the Agents panel shows the key field, and the agents use the local planner until a key is saved. If a call fails, the local planner answers and the panel says why.

## Accounts and console views

The console opens as the signed-in user, shown at the top right with a menu to switch views. An account type says what someone may do; a view says which tabs they see.

| View | For | Tabs |
|---|---|---|
| System admin | Admins, by default | All 20 |
| Operator | Control room and HSE manager | 14 |
| Finance | Revenue and finance | 5 |
| HSE | Safety and HSE teams | 12 |

| File | What it does |
|---|---|
| `src/state/views.ts` | The tabs and which view shows each. `database/seed.sql` holds the same lists, and a test keeps them equal |
| `src/state/account.ts` | The signed-in user and chosen view. Falls back to the default system admin |
| `src/ui/hmi/AccountMenu.tsx` | The user and view switch at the top right |
| `session-route.js` | Worker routes: who is signed in, and the sign-in check and call log in front of every paid model route |

There is no sign-in page yet, so everyone is the default system admin, and hiding a tab is a display choice rather than a lock. The D1 scripts and what binding the database changes are in `../database/README.md`.

The header's `Simulator feed` is the one place the console says its data is simulated. Keep it there instead of labelling each panel, and keep `Twin detector` wherever a real model could otherwise be assumed.

## Visitor analytics

`/alpha/` and `/alpha/demo/` run the same three tools as the rest of decktwin.com, with no consent step.

| Tool | Where | Notes |
|---|---|---|
| Google Analytics | `index.html`, `demo/index.html` | Runs on any host |
| Simple Analytics | `index.html`, `demo/index.html` | `data-hostname` puts every visit under decktwin.com in its dashboard |
| PostHog with replay | `lite/analytics.ts` | Starts only on the hostnames listed there, so local dev stays out |

Replay skips `.label-layer`: the tag labels move on every frame, and recording them would slow the twin.

## Commands (run in this folder)

| Task | Command |
|---|---|
| Dev server | `npm run dev` → http://localhost:5191/alpha/demo/ |
| Tests | `npm test` |
| Rebuild | `npm run build` (writes `../public/alpha`) |
| Save raw CCTV feeds | `node tools/cctv-frames.mjs [outDir]`, with the dev server running |
| Test the scenario author | `node tools/scenario-author.mjs`, with the dev server running |
| Test the next-action agent | `node tools/next-action.mjs`, with the dev server running (`TWIN_URL` to change the port) |
| Check for pipe and equipment clashes | `node tools/clash.mjs`, with the dev server running (`PORT` to change the port) |
| Check for floating geometry | `node tools/floating.mjs`, with the dev server running. Must report 0 |
| Take stills for a visual check | `node tools/snap.mjs steps.json [outDir] [query]`, with the dev server running |
| Deploy | `cd .. && npm run deploy` (the library build copies `public/alpha` into `dist`) |

## Remove it

```
git rm -r alpha
rm -rf public/alpha public/_headers
```

Then remove the two lines from `.git/info/exclude`, take `main`, the assets `binding` and `run_worker_first`, and `r2_buckets` out of `wrangler.jsonc`, and delete the `deck-twin-alpha-media` bucket. Then run `npm run deploy`.
