---
name: deck-twin
description: Build 3D oil & gas plants and digital twins with the Deck Twin component library (three.js / React Three Fiber). Use when the user wants to add realistic plant equipment to a 3D scene (separators, pumps, compressors, valves, piping, instruments, F&G detectors, decks, pipe racks, jackets, cranes, control rooms, skids), to turn P&IDs / PFDs (images or PDFs), equipment and line lists, datasheets, plot plans, notes or descriptions into a 3D plant, platform, deck or process unit, or to validate a plant.json. Recognises ISO 10628 / ISA 5.1 / IEC 60617 symbols and line numbers. Two workflows, "find & install" and "assemble".
---

# Deck Twin

A registry of parametric three.js components for oil & gas plants, sized from engineering standards. Components join at **ports**, their flange faces. A whole plant is one file, `plant.json`.

**In this skill, `deck-twin` means `{{CLI}}`.** It needs no install and no dependencies. Never invent component names, props or port ids. Look them up.

| Need | Command |
|---|---|
| Is this plant.json valid? | `deck-twin validate plant.json` |
| What exists | `deck-twin list`, or `deck-twin search <words>` |
| Props, ranges, ports of one component | `deck-twin info <name> --json` |
| Install components | `deck-twin add <name...>` |
| Install everything a plant uses and write the scene | `deck-twin assemble plant.json` |

Machine-readable catalogue: `{{SITE}}/r/index.json`. Schema: `{{SITE}}/r/plant.schema.json`. Registry and docs: {{SITE}}

---

## Validate

`deck-twin validate plant.json` reports every problem in one run, and says how to fix each one. A plant has to pass it to be used in the UI.

**Loop until it passes:**

1. Run `deck-twin validate plant.json --json`.
2. For each issue, change what `path` points at, as `fix` says. When a close real name exists it is suggested, so use it if it's right. Otherwise look it up with `search` or `info`.
3. Run it again. Stop when `valid` is `true`.

| Exit | Means |
|---|---|
| 0 | Valid. Warnings may remain |
| 1 | Not valid. Fix every error |
| 2 | Couldn't run, such as no network. This says nothing about the file |

```json
{
  "valid": false,
  "errors": 1,
  "warnings": 0,
  "issues": [
    {
      "level": "error",
      "code": "unknown-port",
      "where": "6\"-PO-101-C3A-N",
      "path": "lines[0].from",
      "message": "\"V-100.oil\": horizontal-separator has no port \"oil\" at its default props. Ports: inlet, gas, liquid, water, psv.",
      "fix": "Run deck-twin info horizontal-separator and use one of its ports."
    }
  ],
  "next": "Fix every error, then run validate again."
}
```

Errors block the plant. Fix each warning too, or say why it stays: an unconnected process port usually means a missing line.

Three things need the drawn plant, so they show up in the UI, in `<Plant onReport>` or on `/playground`: line ends too close for two flanges, overlaps, and items standing on nothing. The first one stops a plant loading.

---

## Workflow A: add a component

1. `deck-twin search <what the user asked for>`. If that finds nothing, use [references/component-map.md](references/component-map.md).
2. `deck-twin info <name>` for the props, ranges and ports.
3. `deck-twin add <name>`. It writes the component and the shared `lib/` into `src/components/deck-twin/`.
4. Render it inside an R3F `<Canvas>`, wrapped in `<Stage>` from `lib/stage`:
   ```tsx
   <Stage radius={10}><CentrifugalPump kw={160} suctionNps={8} dischargeNps={6} tag="P-101A" /></Stage>
   ```
5. Set props from the user's data: metres, `nps` in inches, `rating` as the ASME class. Leave the rest at their defaults.

---

## Workflow B: build a plant from documents

A plant usually comes from several documents: P&IDs, PFDs, line lists, equipment lists, datasheets, plot plans, descriptions and notes. A drawing is one source among them.

1. **Read every document, then merge.** [references/documents.md](references/documents.md) says how to read each kind. If documents disagree, the newest revision wins, then the most specific document. Record every conflict. Merge everything into one table:

   | tag | type | key data (size, pressure, flow, power) | upstream → downstream | source |
   |---|---|---|---|---|

   Include only items physically on the plot. Valves and instruments go on lines in step 4.
2. **Map each row to a component** with [references/component-map.md](references/component-map.md), then confirm with `info`. Anything no document gives comes from [references/sizing.md](references/sizing.md) and is an assumption. Add what the plant stands on: `deck-module`, `pipe-rack`, `jacket`. If nothing matches, use the closest component and say so.
3. **Lay it out** with [references/layout.md](references/layout.md). A plot plan wins over these rules. Otherwise flow runs west to east, with at least 1 m between items, and a deck at y carries its equipment at y.
4. **Wire the lines** as `{ tag, from: "TAG.port", to: "TAG.port" }`, with valves in the line's `inline` list. Every line has a line number as its `tag`. Where a line branches, add a `tee`: see "Branches" in [references/plant-json.md](references/plant-json.md), the full format.
5. **Validate** with the loop above until it exits 0.
6. **Look at it.** Load it in the UI, or run `deck-twin assemble plant.json` and render `<PlantScene />`. Fix what the drawn plant reports, then validate again.
7. **Report** what you built, which documents it came from, every conflict and what you chose, every assumption, anything you couldn't read or model, and any warning that remains.

---

## Rules

- **Only real names.** Component names from `list` or `search`, props and ports from `info`.
- **One format.** `"items"` and `"lines"` only, as in [references/plant-json.md](references/plant-json.md).
- **Units.** Metres, degrees, NPS in inches, ASME class numbers.
- **Everything is wired.** In flow order, with nothing decorative, unconnected or floating.
- **Honesty.** The geometry is generic and sized from standards. It is not vendor CAD, so don't claim it matches a manufacturer's product or a real asset's exact layout.

## Worked examples

[references/examples.md](references/examples.md) has complete plant.json files:

1. Basic: an onshore well pad. Well → choke → separator → pump → bunded tank, gas to flare.
2. Basic: a central control room. Consoles, video wall, cabinets, doors and windows.
3. Intermediate: an offshore wellhead platform. Jacket, cellar and main deck, christmas trees, manifold, pedestal crane, helideck.
4. Intermediate: an offshore water injection module. Caisson lift pump, filters, deaerator, booster and injection pumps, riser ESDVs.
5. Intermediate: an onshore separation and compression train. Separator → pumps → cooler, gas → scrubber → compressor, on a pipe rack.
6. Advanced: a crude export terminal. Metering and prover, tank farm in a bund, rack headers, loading pumps, marine loading arm and truck bay.

The full `plant.json` schema is in [references/plant-json.md](references/plant-json.md). Read its "The one format" table before writing a plant: `"items"` and `"lines"` only, with names, props and ports taken from the CLI. A plant isn't finished until `deck-twin validate` is clean.
[references/pid-symbols.md](references/pid-symbols.md) is generated from the registry and maps every component to its P&ID symbol, tag letters and datasheet fields.
[references/pid-legend.md](references/pid-legend.md) is the full legend: every common P&ID symbol (valves, actuators, fail actions, fittings, line types, connectors, ISA bubbles, equipment, F&G, electrical), with how it is drawn, what it means and the component it maps to. Symbols marked *logical* are not hardware.
`scripts/tile.py` cuts large P&ID scans into legible tiles (needs Pillow).
