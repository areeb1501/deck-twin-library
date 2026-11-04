![Deck Twin: a P&ID turns into a plant layout, then stands up as a 3D model](.github/assets/header.gif)

# Deck Twin

Deck Twin is an engine for simulating an oil and gas plant in 3D. It gives you one live view of production, risk, money, maintenance and spares. You can break things on purpose, see how the plant reacts, and get guidance on what to do next.

**Site:** https://decktwin.com

**Contents:** [Screenshots](#screenshots) · [Features](#features) · [Where AI is used](#where-ai-is-used) · [Architecture](#architecture) · [How big it is](#how-big-it-is) · [Feeding live data](#feeding-live-data-to-the-twin) · [The data engine](#the-data-engine) · [Deploying](#deploying) · [Security](#security) · [Components and CLI](#use-the-components) · [Develop](#develop)

## The problem

- Plant data sits in separate systems, so nobody sees the whole picture.
- When an alarm goes off, the operator has seconds to work out what it means and what to do.
- Procedures live in documents, not at the console.
- Training on real failures is not possible on a running plant.
- A spare that is not offshore can turn a small fault into days of lost production.

## Who it is for

| Who | What they get |
|---|---|
| Control room operators | Ordered steps during an alarm, with the reason for each |
| Shift supervisors and trainers | Realistic failure drills with a score and a debrief |
| Maintenance planners | Work orders, machine health and spares in one place |
| HSE teams | Fire and gas, PPE, hazardous areas and barrier health |
| Asset managers | Risk and lost production in dollars |
| Engineering teams | A 3D plant built from P&IDs and datasheets |

## Screenshots

All values on screen come from the simulator.

| | |
|---|---|
| ![The Alpha field: five bridge-linked platforms](.github/assets/readme/field.jpg) | ![The production deck up close](.github/assets/readme/production-deck.jpg) |
| **The field.** Five bridge-linked platforms, generated from data. | **The production deck.** Separators, compression, power and cranes, with every line routed. |
| ![The 3D viewer with the tag tree](.github/assets/readme/viewer.jpg) | ![Console process page with a compressor trip](.github/assets/readme/console-process.jpg) |
| **The viewer.** Search any tag, walk the decks, X-ray and section views. | **Process.** The live flow schematic. Here the export compressor has tripped. |
| ![Console overview page](.github/assets/readme/console-overview.jpg) | ![Console risk page with what-if analysis](.github/assets/readme/console-risk.jpg) |
| **Overview.** Field production, power, alarms and production efficiency. | **Risk.** A live score per platform, each point traced to a cause, and what-if. |
| ![Console CCTV page with segmentation masks](.github/assets/readme/console-cctv.jpg) | ![Console scenarios page](.github/assets/readme/console-scenarios.jpg) |
| **CCTV.** Colour and thermal cameras, PPE and hazardous-zone checks. | **Scenarios.** 12 scored drills, or describe a new one and build it with AI. |
| ![Console economics page](.github/assets/readme/console-economics.jpg) | |
| **Economics.** Revenue, margin, deferment and the money at risk per machine. | |

## Features

**See the plant**
- A five-platform offshore field in 3D: production, wellhead, riser, water injection and accommodation platforms, linked by bridges
- 129 equipment items, 216 lines, 235 valves and 370 instruments on the Alpha platform, all generated from data
- Walk through it, look inside with X-ray and section views, and follow the oil path
- Day and night, workers on shift, cranes you can drive from the cab
- Enter the control room and use the full console, with live screens on the video wall
- Guided tours, and a knowledge card for each piece of equipment

**Run the plant**
- A dynamic process simulation: pressure, level, flow, compression, power, utilities and water injection
- Alarms with priorities, shelving and floods
- The full shutdown hierarchy, from unit shutdown to abandon platform, driven by 20 cause and effect rows
- Fire and gas: 181 detectors in 32 zones, with voting and coverage maps
- Hazardous area overlays for Zone 0, 1 and 2

**Test the plant**
- Create a failure anywhere from the Instructor page: a fire, a gas leak, a machine trip, a stuck valve, or a loss of air or cooling
- Watch the plant react, and see which alarms and shutdowns follow
- 12 scored training scenarios, each with a debrief
- What-if: see the predicted sequence, the barriers and the recovery before you run a scenario

**Manage the plant**
- Production, deferment, revenue, operating cost and carbon
- Work orders, permits, lock-out and isolation plans
- Spares stock, purchase orders, and supply vessel and helicopter runs
- Inspections by simulated drone and robot, with corrosion tracking
- Shift handover notes

**The console**
- 20 pages, from Dashboard and Process to Economics and Instructor
- Four views for different roles: System admin, Operator, Finance and HSE
- Run the clock at 1×, 5×, 20× or 60×

**Build your own plant**
- 220 standards-based 3D components in 16 categories, with a CLI and an agent skill
- An agent turns your P&IDs, datasheets and equipment lists into a `plant.json`
- Load it to view and walk your plant. The full console runs on the bundled Alpha field for now

## Where AI is used

Every model call needs a click and your own key. Nothing runs in the background, and the running cost stays on screen.

### Incident guidance

When an alarm or incident comes up, the Response page shows what to do next and why.

1. It reads what an operator can see: alarms, fire and gas zones, shutdowns and machine health.
2. A free plan appears straight away, built from the cause and effect matrix and the RCM library.
3. **Ask Muse Spark** sends that evidence to the model, which returns ordered steps with a reason for each.
4. Every step is checked against the plant and must cite real data.
5. The operator approves. A button such as "Shut down K-2200 here" asks "Are you sure?" first.
6. The twin reads the plant back to confirm it happened, then you can re-plan around anything that failed.

The RCM library holds example failure modes for each machine type. You can edit them as a demo, and the plans change straight away.

### Build a scenario with AI

Describe a drill in plain words, for example "a stuck ESD valve during a fire in the compression area". The model writes it as data, never code. Every tag is checked, the drill runs once with nobody at the console, and any failures go back to the model. It then joins the scenario library and is scored like the others.

### Agents, Investigate and Ask the plant

These use the same Muse Spark connection as the Response and Scenarios pages. Read-only tools gather the evidence from the plant, and one click makes one request. With no key saved, or if a call fails, a local planner answers and the panel says so. The key field is in the Agents panel.

### Camera analysis

SAM 3.1 finds people and hazards on the colour CCTV cameras. It stays off until you switch it on. Until then, detections are simulated, and each camera says which it is.

- **Typed prompts.** While real SAM 3.1 is on, type up to three short phrases, such as "ladder", for it to mask as well. They are masks only: no alarm and no log entry.
- **Review the last 10 s.** One press sends a short clip of the main monitor on your own Meta key and replays it with tracked masks. Nothing is recorded until the switch is on.

### Models

| Provider | Model | You need |
|---|---|---|
| Modal | Muse Spark Open (`meta-models/Muse-Spark-Open-816B-A42B`) | Your endpoint URL and a proxy token |
| Baseten | Muse Spark Open (`meta-models/muse-spark-open-1026`) | An API key |
| Meta Model API | Muse Spark or Muse Wonder, chosen from a list | An API key |
| Modal or Meta Model API | SAM 3.1, for cameras | See `modal/README.md` |

Open the console, go to Response or Scenarios, or open the Agents panel, pick a provider and save your key. One key serves the whole console.

These model paths are tested with a stubbed model. The real Meta Model API path has not been run with a live key yet.

### How a model call works

```
Browser (console)                         Worker route                         Provider
read-only tools gather evidence    →     /alpha/api/llm                 →     Modal, Baseten or
from the simulator                        checks body, model and roles          Meta Model API
one click = one request                   key used once, never stored
                                   ←     streams the answer straight back
answer is checked against the plant
operator approves each action
```

- **The key travels in the request body,** not a header, because Worker logs can record headers. It is used for that one request and never stored or logged.
- **The provider list is fixed.** The Worker builds the upstream request itself, so the route can't be pointed anywhere else or carry anything but a chat.
- **Limits:** at most 80 messages and 800 kB per request, and 24 000 output tokens per answer, with a running cost and a session limit in the console.
- **The model never acts on the plant.** Its tools only read. Every step it proposes is checked against the plant, and an operator approves it.

## Architecture

```
                         ┌───────────────────────── Browser ─────────────────────────┐
plant.json or the  ──►   │ Plant model (equipment, lines, valves, instruments)        │
bundled Alpha field      │   ├─► 3D scene: three.js via React Three Fiber             │
                         │   │     piping, equipment, structure, sea, sky, effects    │
                         │   └─► Simulator (1 s ticks × speed)                        │
                         │         process, power, ESD, fire and gas, KPIs            │
                         │         plugins: maintenance, spares, finance, cranes,     │
                         │         scenarios, inspections                             │
                         │           └─► Safety layer: risk, alerts, CCTV, workers,   │
                         │               hazardous areas, agent tools (read-only)     │
                         │                 └─► Console: 20 pages, role views          │
                         └──────────────────────────┬────────────────────────────────┘
                                                    │ model and camera calls only
                         ┌──────────────────────────▼────────────────────────────────┐
                         │ Cloudflare Worker: static site, model routes, session      │
                         │ route, private media (R2), D1 for accounts when bound      │
                         └──────────────────────────┬────────────────────────────────┘
                                                    ▼
                          Muse Spark (Modal, Baseten, Meta)   SAM 3.1 (Modal GPU, Meta)
```

| Layer | Where | What it does |
|---|---|---|
| Plant model | `alpha/src/model/` | The plant as plain data. The renderer never hard-codes a tag |
| 3D scene | `alpha/src/scene/` | Piping fabrication (spools, elbows, flanges, supports), equipment, decks, environment, batching and adaptive quality |
| Simulator | `alpha/src/state/sim.ts`, `alpha/src/sim/` | The dynamic plant model and its plugins, ticking in simulated seconds |
| Safety layer | `alpha/src/safety/` | Risk scores, alerts, CCTV, workers, hazardous areas, inspections, read-only agent tools |
| Console | `alpha/src/ui/hmi/` | The control-room pages and role views |
| Agents | `alpha/src/agents/` | The model connection, the scenario author and the next-action planner |
| Worker | `alpha/worker.js` and `*-route.js` | Static assets, model routes, session route, private media |
| SAM 3.1 service | `modal/` | SAM 3.1 on a Modal GPU behind a key check and rate limit |
| Accounts | `database/` | D1 schema and seed for accounts, sessions, views and a model call log |
| Component library | `registry/`, `src/`, `cli/`, `skill/` | The 3D components, the website, the CLI and the agent skill |
| Data engine | not in this repo | Ingest, Kafka, risk engine, Flink, ClickHouse, Postgres (see below) |

**Stack:** React 19, three.js 0.186 through React Three Fiber 9 and drei, zustand 5, Vite 8 and TypeScript 6. The site and twin are served by Cloudflare Workers. SAM 3.1 runs in Python on Modal.

**The plant is data.** The same renderer draws the Alpha field, an onshore compressor station and plants compiled from a `plant.json`. Equipment, lines, valves and instruments are generated from the model, so a new plant needs no new 3D code.

## How big it is

| Part | Size |
|---|---|
| Twin (`alpha/`) | About 91 000 lines of TypeScript in 311 files, including plant data and knowledge tables |
| Component registry | 220 components in 16 categories, about 58 000 lines |
| Website | About 3 600 lines |
| CLI | One zero-dependency Node script, about 550 lines |
| SAM 3.1 service | About 1 400 lines of Python |
| Self-hosting wizards | About 4 000 lines of shell, Python and cloud-init |
| Alpha platform | 129 equipment items, 216 lines, 235 valves, 370 instruments |
| Fire and gas | 181 detectors, 32 zones |
| Safety logic | 20 cause and effect rows, 5 shutdown levels |
| Training | 12 scored scenarios |
| Tests | 153 for the library and CLI, 800 for the twin, plus the SAM service tests |

## How risk is classified

**In the twin.** Each platform gets a live score from 0 to 100, and every point traces to a named cause, such as "HP separator level 79 % +18".

| Input | Examples |
|---|---|
| Process | Separator level and pressure, surge margin, instrument air, flaring |
| Fire and gas | Gas and flame detections, deluge |
| Shutdowns | Weighted by level, from unit shutdown to abandon platform |
| Alarms | Weighted by priority, plus alarm floods |
| Machinery | Degrading, failed or tripped machines |
| Barriers | Inhibited detectors, stuck valves, severe corrosion |

| Score | Band |
|---|---|
| Under 25 | Low |
| 25 to 49 | Moderate |
| 50 to 74 | High |
| 75 and over | Critical |

**In the data engine.** Each sensor gets a severity from its operating limits. Equipment risk combines those severities with the machine's age and criticality, and uses the same four score bands. A tripped machine counts as at least 90.

## How HSE is tracked

| Area | What the twin watches |
|---|---|
| Fire and gas | 181 detectors in 32 zones, with low, high and confirmed states |
| People | PPE on camera, workers near moving machinery, workers in hazardous areas |
| Hazardous areas | Zone 0, 1 and 2 overlays |
| Work control | Permits, lock-outs and isolation plans |
| Hidden risk | Barrier erosion, such as detectors out of service, and sensors drifting towards a trip |

Each of these raises an alert with a full trace of how it was reached. Alerts are drafted to an outbox and not sent. All of this runs on simulated data.

## Accounts and views

The console opens as a signed-in user, shown at the top right, with four views: System admin, Operator, Finance and HSE. Each view shows the tabs that role needs.

There is no sign-in page yet, so everyone is the default system admin, and hiding a tab is a display choice, not a lock. The [`database`](database) folder holds the Cloudflare D1 schema, seed and init script for accounts, sessions, views and a log of paid model calls. The database is not bound yet.

## Feeding live data to the twin

Today every reading comes from the simulator. This is how a real plant would be connected, and what is still missing.

```
PLCs, DCS, sensors,  →  Edge gateway  →  Ingest (HTTPS,  →  Kafka  →  Risk engine  →  ClickHouse
historians              on site          API key)                    and Flink         and Postgres
                                                                                            │
                                                                     Twin adapter (to build) ◄┘
                                                                     maps engine sensors to twin tags
                                                                            │
                                         ┌──────────────────────────────────┴───────────────┐
                                         ▼                                                  ▼
                              live.ts: sample() and history()                    Simulator state
                              gauges, trends, inspector,                         alarms, shutdowns,
                              control-room screens, agent tools                  risk, 3D effects
```

**Two seams in the twin.**
- **`sample()` and `history()` in `alpha/src/ui/live.ts`.** Every displayed instrument value and trend goes through these. Replace them with a feed, and the inspector, knowledge cards, control-room screens and agent tools show the real plant.
- **The simulator state.** Alarms, shutdowns, risk and the 3D effects read the simulator directly, not `live.ts`. For those to follow a real plant, an adapter must write measured values into the simulator state, or replace its tick with the feed. This adapter has not been built.

**What a reading looks like in the engine.** Each reading carries `event_id`, `equipment_id`, `sensor`, `value`, `unit`, `running` and `ts`. The twin names instruments by tag, such as `PT-1101`, so the adapter needs a mapping from `equipment_id` and `sensor` to twin tags. Nothing in this repo does that mapping yet.

**Steps to connect a plant.**
1. Install an edge gateway on site that reads the control system (OPC UA, Modbus or MQTT) and forwards readings over HTTPS with the ingest API key.
2. Run the data engine (below) in your own cloud or cluster.
3. Build the twin's plant from your P&IDs into a `plant.json`, so tags match the real plant.
4. Map engine sensors to those tags, and write the adapter that feeds `live.ts` and the simulator state.
5. Label the source on screen. The console says "Simulator feed" today, and it must say what it is showing.

## The data engine

The twin runs on its own simulator, so every reading in this demo is simulated. For a real plant, a separate data engine would feed it live. The engine already exists. It was not built for this hackathon, and its source is not in this repo.

| Piece | Job |
|---|---|
| Edge device or gateway | Collects readings from different areas of the plant and sends them over HTTPS |
| Ingest bridge | Takes readings over HTTPS with an API key, so Kafka is never exposed |
| Kafka | Carries readings, risk scores and alerts between services |
| Risk engine | Validates each reading, scores risk and manages alerts |
| Flink | Runs the same logic as a stream job alongside the risk engine |
| ClickHouse | Data warehouse for readings, risk scores and alerts |
| Postgres | Equipment master data, operating limits and RCM failure modes |
| Airflow | Scheduled batch work around the stream, such as periodic inspection data and reconciliation |
| Streamlit and Grafana | Dashboards for pipeline health and plant risk |
| Caddy | The TLS front door. The only service exposed to the internet |

**Kafka topics:** `plant.sensor.readings`, `plant.sensor.dlq`, `plant.sensor.dlq.outcomes`, `plant.risk.scores`, `plant.risk.alerts`, `plant.notifier.control`, `plant.notifier.emails`, `plant.rca.audit`, `plant.sim.control` and `events`. Partition counts follow the expected events per second.

**Bad data is handled.** Malformed readings go to a dead letter queue and are repaired where possible. The engine also spots false alarms: a stuck sensor, a one-off spike, or one signal moving while the rest of the machine stays flat.

**Every alert has a lifecycle:** Raised, Investigating, then Confirmed or False alarm, then Resolved. People sign off the outcome, and that record feeds future analysis.

### Monitoring

The engine is monitored with Prometheus and Grafana.

| Layer | What is watched |
|---|---|
| Servers | CPU, memory and disk |
| Containers | Resource use against their limits |
| Kafka | Broker health and consumer lag |
| Flink | Job health, throughput, checkpoints and restarts |
| ClickHouse | Queries, merges, memory and disk |
| Airflow | Scheduler health and task runs |
| Endpoints | Whether ingest and dashboards can be reached |

Alerts fire on targets going down, low memory, disks filling, containers near their limits, a missing Kafka broker and high consumer lag. Grafana has one dashboard for pipeline health and one for plant risk.

## Deploying

### The twin and the site

The site and the twin are static files plus one Cloudflare Worker. A push to `main` builds and deploys them with Workers Builds (`npm run build:all`, then `npx wrangler deploy`). The SAM 3.1 service deploys to Modal with `modal deploy` (see `modal/README.md`).

### The data engine on a cloud or a VM

The engine runs in containers, so it can be hosted in a customer's own cloud account. Data stays inside their tenant.

The [`self-hosting`](self-hosting) folder shows how the engine is deployed. **It is reference code: refer to it and adjust it for your setup.** It needs the engine's source next to it, and it has not been run from this repo.

| Target | Script | Runs on |
|---|---|---|
| AWS | `self-hosting/aws/deploy.sh` | Docker on EC2, or managed services such as MSK and RDS |
| Azure | `self-hosting/azure/deploy.sh` | Docker on a VM, or managed services such as Event Hubs |
| GCP | `self-hosting/gcp/deploy.sh` | Docker on GCE, managed services, or Pub/Sub, Dataflow and BigQuery |
| Any Linux VM | `self-hosting/any-vm/install.sh` | Docker on a machine you already own |

Each wizard asks for your sizing, prints a full plan with an estimated cost, and creates nothing until you type `deploy`. Every cloud wizard has a `--dry-run` mode.

### Kubernetes (planned)

There are no Kubernetes manifests or Helm charts in this repo yet. This is how the pieces would map onto a cluster in the customer's own tenant.

| Piece | Kubernetes object | Common options |
|---|---|---|
| Kafka | StatefulSet, or an operator | Strimzi, or a managed Kafka |
| ClickHouse | StatefulSet with persistent volumes | The Altinity ClickHouse operator, or ClickHouse Cloud |
| Postgres | StatefulSet, or an operator | CloudNativePG, or a managed Postgres |
| Flink | Flink jobs | The Flink Kubernetes Operator |
| Ingest bridge, risk engine, consumers | Deployments with autoscaling | |
| Airflow | Deployment | The official Airflow Helm chart |
| Dashboards | Deployments | Grafana and Streamlit |
| Twin and site | A Deployment serving the static build | Any web server or ingress |
| Model and session routes | A small Node service | Ported from `alpha/worker.js` |
| Monitoring | Prometheus and Grafana | kube-prometheus-stack |
| TLS | Ingress controller | cert-manager for certificates |

- **The Worker needs porting.** `alpha/worker.js` uses Cloudflare bindings for assets, R2 media and D1. On Kubernetes, its routes (`/alpha/api/llm`, the SAM routes and the session route) become a small Node service, with object storage and Postgres in place of R2 and D1.
- **Only the ingress is public.** Kafka, ClickHouse, Flink and Postgres stay on the cluster network, with network policies between them.
- **Secrets** go in Kubernetes Secrets or the cloud's secret manager, generated rather than typed.

## Security

- **Deploy in your own tenant.** Plant data of this kind should stay inside the customer's environment.
- **The model never touches the plant.** Agent tools are read-only, and an operator approves every action.
- **Keys stay with the operator.** They are encrypted in the browser, sent only to the chosen provider, and never stored on a server.
- **Paid calls are opt-in.** Every model feature starts off on each page load and runs only after a click, with the cost on screen and a hard limit.
- **Nothing is exposed but the TLS proxy.** Kafka, ClickHouse, Flink and Postgres stay on private networks.
- **Secrets are generated, not typed,** and SSH is limited to the installer's IP address.

## What's next

- Connect the data engine to the twin, with the tag mapping and the simulator adapter
- Sign-in, and the D1 database bound to the console views
- Share specific action items from one role to another
- Kubernetes manifests for the twin and the engine
- Edge gateway connectors for OPC UA, Modbus and MQTT
- The full console on uploaded plants

## Use the components

The CLI is not on npm yet. Until it is, run it from the registry site:

```bash
npx -y https://decktwin.com/cli/decktwin.tgz <command>
```

The examples below use the short `npx decktwin`, which works once the package is published. The old command name, `deck-twin`, still works.

```bash
npx decktwin add horizontal-separator centrifugal-pump gate-valve
npx decktwin validate plant.json && npx decktwin assemble plant.json
npx decktwin skill
```

| Doc | What it covers |
|---|---|
| [Introduction](docs/introduction.md) | What it is, and what it isn't |
| [CLI](docs/cli.md) | Every command |
| [Assembling plants](docs/assemble.md) | Writing a `plant.json` |
| [Agent skill](docs/agents.md) | Using it from an AI agent |
| [Standards](docs/standards.md) | The dimensional tables |
| [Adding a component](docs/contributing.md) | Writing a new component |
| [Database](database/README.md) | The D1 tables for accounts and views |

## Develop

```bash
npm install && npm run dev                # site, http://localhost:5190
cd alpha && npm install && npm run dev    # twin, http://localhost:5191/alpha/demo/
npm test                                  # in each folder
```

| Folder | Tests |
|---|---|
| `.` | `npm test`: the registry, the CLI and `plant.json` validation |
| `alpha/` | `npm test`: the simulator, safety logic, agents, routes and console views |
| `modal/` | `uv run --no-project pytest -m "not live"`: the SAM 3.1 service |

GitHub Actions runs all three on every push.

## Honesty

Everything in the twin is simulated, including process values, alarms, stock and prices. It is a demonstration, not a safety system, and it must not be used to operate a real plant. The RCM rows are examples, not a real asset's study. The geometry is generic, not vendor CAD, and the standards tables are reference values.

## License

Free for personal use. Commercial use needs a license. This covers both the components and the engine: see [LICENSE](LICENSE). It is not MIT and not open source.

Visit [decktwin.com](https://decktwin.com) to learn more.
