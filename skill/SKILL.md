---
name: deck-twin
description: Build 3D oil & gas plants and digital twins with the Deck Twin component library (three.js / React Three Fiber). Use when the user wants to add realistic plant equipment to a 3D scene (separators, pumps, compressors, valves, piping, instruments, F&G detectors, decks, pipe racks, jackets, cranes, control rooms, skids), or to turn P&IDs / PFDs (images or PDFs), equipment lists, datasheets or descriptions into a 3D plant, platform, deck or process unit. Recognises ISO 10628 / ISA 5.1 / IEC 60617 symbols and line numbers. Two workflows, "find & install" and "assemble".
---

# Deck Twin

Deck Twin is a registry of parametric three.js components for oil & gas plants. Each component is one `.tsx` file sized from engineering standards (ASME, API, TEMA, IEC, ISO). It exposes **ports**: the flange faces where pipe connects. A whole plant is described in a `plant.json` and rendered by `<Plant>`.

Everything is driven by the `deck-twin` CLI. **In this skill, `deck-twin` means `{{CLI}}`.** It needs no install and no dependencies. Never invent component names, props or port ids. Look them up.

| Need | Command |
|---|---|
| What exists | `deck-twin list`, or `deck-twin search <words>` |
| Props, ranges, ports of one component | `deck-twin info <name> --json` |
| Install components | `deck-twin add <name...>` |
| Validate a plant | `deck-twin check plant.json` |
| Install everything a plant uses and write the scene | `deck-twin assemble plant.json` |

Machine-readable catalogue: `{{SITE}}/r/index.json`. Registry and docs: {{SITE}}

---

## Workflow A: find & install a component

1. `deck-twin search <what the user asked for>`. If that finds nothing, map the equipment type with [references/component-map.md](references/component-map.md).
2. `deck-twin info <name>`. Read the props (with ranges and defaults) and the ports.
3. `deck-twin add <name>`. This writes the component and the shared `lib/` into `src/components/deck-twin/`.
4. Use it inside an R3F `<Canvas>`, wrapped in `<Stage>` from `lib/stage` for lighting:
   ```tsx
   <Stage radius={10}><CentrifugalPump kw={160} suctionNps={8} dischargeNps={6} tag="P-101A" /></Stage>
   ```
5. Set props from the user's data: sizes in metres, `nps` in inches, `rating` as the ASME class. Leave anything you don't know at its default. The defaults are typical real values.

---

## Workflow B: assemble a plant

Follow these steps in order. Each step produces something you can check before moving on.

### Step 1. Read the drawings and extract the equipment list

If you were given P&IDs (images or PDFs):

1. **Check legibility.** Large scans are often too small to read. Tile them:
   ```bash
   python3 -I scripts/tile.py sheet.png --grid 3x2 --scale 2
   ```
   For a close-up of one area, use `--crop x0,y0,x1,y1` with fractions of the sheet.
2. **Read the sheet's legend first.** Company legends vary, so the drawing's own legend wins. Then match symbols with [references/pid-legend.md](references/pid-legend.md), the full legend with per-category sheets, and [references/pid-symbols.md](references/pid-symbols.md). That file maps every component to its symbol (ISO 10628-2 / PIP PIC001 for process, ISA 5.1 for instruments, IEC 60617 for electrical, NFPA 170 / ISO 7010 for F&G), its tag prefixes and ISA letters, and its datasheet fields. The full legend is also one image, at `{{SITE}}/symbols/legend.svg`. Look at it side by side with the sheet.
3. **The tag decides.** Use the tag letters to confirm a match (V, P, K, E, T, PT, LV, ESDV…). Where the shape and the tag disagree, trust the tag.
4. **Separate physical from logical.**
   - Shared-display bubbles (a line through the circle) are DCS or PLC functions. They are not physical items.
   - Field bubbles (no line) and actuated valves are physical.
5. **Use line numbers as data.** A line number such as `8"-PG-2101-D6A-N` gives size, service, sequence, piping class and insulation. `<Plant>` and `deck-twin check` parse them, so put the line number in the line's `tag` and you get size, service, colour bands, class and insulation for free.
6. **Use datasheets.** If you have equipment datasheets, the `Datasheet → props` column in pid-symbols.md tells you which field sets which prop.

From the drawing, datasheet or description, write a table:

| tag | type (as drawn) | key data (size, pressure, flow, power) | upstream → downstream |
|---|---|---|---|

- Use the drawing's own tags (`V-1100`, `P-1500A/B`). For A/B pairs, list both.
- Include only items that are physically on the plot: vessels, rotating equipment, exchangers, packages, tanks, wellheads, cranes and buildings.
- Valves and instruments go on lines (Step 4), not in this table.

### Step 2. Map every row to a component

- Use [references/component-map.md](references/component-map.md), then confirm with `deck-twin info <name>`.
- Pick props from the data. When data is missing, size it with [references/sizing.md](references/sizing.md).
- Add the structures the plant stands on: `deck-module`, `pipe-rack`, `access-platform`, `jacket`, `bridge`, `helideck`, `pedestal-crane`.
- If nothing matches, use the closest component and say so to the user. Never invent a component name.

### Step 3. Lay it out

Apply [references/layout.md](references/layout.md). In short:

- Process flow runs west to east (+X): wells and inlet, then separation, compression and treatment, then export.
- Leave at least 1 m of clearance between items, and 2–3 m on the maintenance side of pumps and exchangers.
- Put pumps beside and below their suction vessel.
- Use `info` bounds (`size` at defaults) to space items. Footprint ≈ `size[0]` × `size[2]`.
- Equipment on a deck stands at the deck's y. A `deck-module` at `[0, 10, 0]` carries equipment at y = 10.

### Step 4. Wire the lines

- For every P&ID line, add `{ tag, from: "TAG.port", to: "TAG.port", service }`.
- Port ids come only from `info`.
- Put line valves and inline instruments in the line's `inline` array, in flow order, with `at` between 0.1 and 0.9.
- Long runs between distant items: route them over the `pipe-rack` with `via` and set `supports: false`.

### Step 5. Check, then fix

```bash
deck-twin check plant.json
```

- Fix every **error**.
- Warnings about unconnected process ports usually mean a missing line. Add it, or explain why the port stays open.
- Repeat until there are no errors.

### Step 6. Assemble and look

```bash
deck-twin assemble plant.json      # installs components and writes src/PlantScene.tsx
```

- Render `<PlantScene />` full-screen, or paste the JSON into the website playground (`/playground`).
- Read the `onReport` issues logged in the console:
  - **overlap**: move items apart;
  - **stands on nothing**: put it on a deck, or set y = 0.
- If you can take screenshots, look at the result from two angles.

### Step 7. Report

Tell the user:

- what you built;
- every assumption (sizes you chose, components substituted);
- any remaining warnings.

---

## Rules

- **Only real names.** Use only component names from `list` or `search`, and port ids and props from `info`.
- **Units.** Metres, degrees, NPS in inches, ASME class numbers.
- **Every process port connected.** Every process item must be wired in flow order. Nothing decorative, nothing floating.
- **Inline items.** Valves, strainers, spools and meters belong in `inline`, never in `items`.
- **Rotation.** It turns the item's local +X (its main axis or flow direction). Rotate pumps so suction faces the source vessel.
- **Honesty.** The geometry is generic and sized from standards. It is not vendor CAD. Don't claim it matches a manufacturer's product or a real asset's exact layout.

## Worked examples

[references/examples.md](references/examples.md) has complete plant.json files:

1. Basic: an onshore well pad. Well → choke → separator → pump → bunded tank, gas to flare.
2. Basic: a central control room. Consoles, video wall, cabinets, doors and windows.
3. Intermediate: an offshore wellhead platform. Jacket, cellar and main deck, christmas trees, manifold, pedestal crane, helideck.
4. Intermediate: an offshore water injection module. Caisson lift pump, filters, deaerator, booster and injection pumps, riser ESDVs.
5. Intermediate: an onshore separation and compression train. Separator → pumps → cooler, gas → scrubber → compressor, on a pipe rack.
6. Advanced: a crude export terminal. Metering and prover, tank farm in a bund, rack headers, loading pumps, marine loading arm and truck bay.

The full `plant.json` schema is in [references/plant-json.md](references/plant-json.md).
[references/pid-symbols.md](references/pid-symbols.md) is generated from the registry and maps every component to its P&ID symbol, tag letters and datasheet fields.
[references/pid-legend.md](references/pid-legend.md) is the full legend: every common P&ID symbol (valves, actuators, fail actions, fittings, line types, connectors, ISA bubbles, equipment, F&G, electrical), with how it is drawn, what it means and the component it maps to. Symbols marked *logical* are not hardware.
`scripts/tile.py` cuts large P&ID scans into legible tiles (needs Pillow).
