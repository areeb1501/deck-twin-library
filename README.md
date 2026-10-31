# Deck Twin

A 3D digital twin for oil and gas plants, with an AI agent that tells the person in charge what to do next, and why.

When an alarm or an incident comes up, the twin reads what the plant is showing, works out the next steps, and backs each one with data. The operator approves every action, and the twin reads the plant back to prove it happened.

**Site:** https://decktwin.com

## What is here

| Part | What it does |
|---|---|
| **The twin** (`alpha/`) | A five-platform offshore field, driven by a live process simulation: alarms, shutdowns, fire and gas, maintenance, spares, risk and training scenarios. |
| **The components** | 220 standards-based three.js components, plus a CLI and an agent skill, so an agent can turn your documents into a 3D plant. |

## What to do next

The **Response** page in the control room console is the agent.

1. **It sees what an operator can see.** Alarms, fire and gas zones, shutdowns and machine health. It never reads the simulator's hidden fault list.
2. **It gives a plan straight away.** A free rule plan comes from the cause and effect matrix and the RCM library.
3. **Ask Muse Spark goes deeper.** One press sends an evidence pack from the twin's read-only tools. Muse answers with ordered steps, a one-line reason for each, and the evidence it used.
4. **Every step is checked.** A tag that does not exist, a wrong action for that equipment, or a cited source that is not in the pack goes back to the model once, and is then dropped.
5. **The operator decides.** A step that can be done remotely shows a button such as "Shut down K-2200 here", then "Are you sure?". The model never touches the plant.
6. **The plant answers.** The twin reads the plant, not the command, so a stuck valve shows as refused or not verified.
7. **Re-plan.** One more press plans again from the new state, around whatever failed.

The same card sits beside a running training scenario, and actions taken through it count in the score.

The **RCM library** tab holds example failure modes per machine type, plus process, fire and gas rows. You can edit them as a demo. Edits stay in your browser and change the plans straight away.

## Where AI is used

| Feature | Model | Runs on | State |
|---|---|---|---|
| Next action | Muse Spark Open | Modal or Baseten | On a click, with your own key |
| Next action | Muse Spark or Muse Wonder | Meta Model API | On a click, with your own key. Not yet run against the real API |
| Build a scenario with AI | Same choice as above | Same as above | On a click, with your own key |
| CCTV segmentation | SAM 3.1 | Modal, or Meta Model API | Off until switched on. Simulated detections otherwise, and each tile says which it is |
| Ask the plant, Investigate, Agents strip | None | A local rule planner in the browser | Simulated |

Real credits are spent only on a click. Nothing runs on load or in the background, errors are never retried, the running cost stays on screen, and each page load has a hard limit.

**Setup.** Open the console, go to Response or Scenarios, and pick a provider under Model. Save your key: it stays encrypted in your browser and goes only to that provider.

| Provider | Model | You need |
|---|---|---|
| Modal shared endpoint | `meta-models/Muse-Spark-Open-816B-A42B` | Your endpoint URL and a proxy token |
| Baseten | `meta-models/muse-spark-open-1026` | An API key |
| Meta Model API | Chosen from a list | An API key |

## The engine and live data

The twin runs on its own simulator, so every reading in this demo is simulated.

For a real plant, the data would come from our data engine, which already exists as a separate backend. It was not built for this hackathon and is not part of this repository.

```
plant sensors → ingest → Kafka → stream processing → ClickHouse → the twin
                                       ↑
                     Postgres: equipment limits, RCM failure modes
             Airflow: scheduled jobs such as periodic inspection data
```

| Piece | Job |
|---|---|
| Kafka | Takes readings from the plant and hands them to the consumers |
| Stream processing | Validates each reading, scores risk and raises alerts, in real time |
| ClickHouse | The data warehouse: readings, risk scores and alerts |
| Postgres | Equipment master data, operating limits and RCM failure modes |
| Airflow | Scheduled batch work around the stream, such as periodic inspections and reconciliation |

The twin reads every instrument through one seam, `sample()` and `history()` in `alpha/src/ui/live.ts`. The engine would feed that seam, and the gauges, trends, alarms, risk and 3D model would then follow the real plant as it changes. That link is not wired in this repository yet.

## Use the components

Until it is on npm, run the CLI from the site: `npx -y <site>/cli/deck-twin-0.2.2.tgz <command>`. The examples use the short `npx deck-twin`.

```bash
npx deck-twin add horizontal-separator centrifugal-pump gate-valve
npx deck-twin validate plant.json && npx deck-twin assemble plant.json
npx deck-twin skill
```

Each component is one readable `.tsx` file, sized from public standards such as ASME B16.5, API 610 and TEMA. Every flange face is a port, and `plant.json` wires ports together. An agent can build a plant from P&IDs, datasheets or equipment lists, and the twin can load the result to view and walk it. The full console runs on the bundled Alpha field.

| Doc | What it covers |
|---|---|
| [Introduction](docs/introduction.md) | What it is, and what it isn't |
| [CLI](docs/cli.md) | Every command |
| [Assembling plants](docs/assemble.md) | Writing a `plant.json` |
| [Agent skill](docs/agents.md) | Using it from an AI agent |
| [Standards](docs/standards.md) | The dimensional tables |
| [Adding a component](docs/contributing.md) | Writing a new component |

## Develop

```bash
npm install && npm run dev                # site, http://localhost:5190
cd alpha && npm install && npm run dev    # twin, http://localhost:5191/alpha/demo/
npm test                                  # in each folder
```

## Honesty

Everything in the twin is simulated, including process values, alarms, stock and prices. It is a demonstration, not a safety system, and it must not be used to operate a real plant. The RCM rows are examples, not a real asset's study. The geometry is generic, not vendor CAD, and the standards tables are reference values.

## License

Free for personal use. Commercial use needs a license. This covers both the components and the engine: see [LICENSE](LICENSE). It is not MIT and not open source.

Visit [decktwin.com](https://decktwin.com) to learn more.
