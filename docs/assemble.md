# Assembling plants

A plant is a `plant.json`: a list of **items** (components placed in space) and **lines** (pipe joining one item's port to another's). `<Plant>` renders it, and `deck-twin check` validates it.

```json
{
  "name": "HP separation",
  "items": [
    { "tag": "DECK-1", "component": "deck-module", "position": [0, 0, 0], "props": { "length": 30, "width": 20 } },
    { "tag": "V-100", "component": "horizontal-separator", "position": [-6, 0, -3], "props": { "service": "3-phase", "pressure": 40 } },
    { "tag": "P-101A", "component": "centrifugal-pump", "position": [6, 0, 4], "rotation": 180 }
  ],
  "lines": [
    {
      "tag": "6\"-PO-1001-D6A-N",
      "from": "V-100.liquid",
      "to": "P-101A.suction",
      "service": "oil",
      "inline": [{ "component": "gate-valve", "at": 0.25 }, { "component": "y-strainer", "at": 0.75 }]
    }
  ]
}
```

## Coordinates

| Rule | Detail |
|---|---|
| Units | Metres and degrees. |
| Axes | +X is east, +Y is up, +Z is south. `rotation` turns about +Y, counter-clockwise seen from above. |
| `position` | `[x, y, z]` of the component's origin. For equipment and structures (anchor `base`), that is the centre of the footprint at the level it stands on. |
| Decks | A `deck-module` has its walking surface at y = 0 in its own frame. If it sits at `position: [0, 10, 0]`, equipment on it goes at y = 10. |
| Inline items | Valves, strainers and inline meters (anchor `inline`) go on lines, not in `items`. |

## Items

| Field | Meaning |
|---|---|
| `tag` | Unique. Use the plant's equipment numbering, e.g. `V-1100`, `P-1500A`, `K-2200`, `CR-A1`. |
| `component` | A registry name, such as `horizontal-separator`. `npx deck-twin list` shows them all. |
| `props` | Overrides for the component's props. `npx deck-twin info <name>` lists them, with ranges. |
| `position` | `[x, y, z]`, defaulting to the origin. |
| `rotation` | Degrees about +Y. |

## Lines

| Field | Meaning |
|---|---|
| `tag` | Line number, `SIZE"-SERVICE-SEQ-CLASS-INSULATION`, e.g. `8"-PG-2101-D6A-N` |
| `from`, `to` | `"TAG.port"`, e.g. `"V-100.gas"`. Port ids come from `info`. A **battery limit**, where the line leaves the plot (the P&ID's off-page connector), is `{ "at": [x, y, z], "label": "TO HOST" }`. It renders as a flanged, blinded tie-in with a yellow band and a tag. |
| `service` | One of `oil`, `gas`, `multiphase`, `water`, `seawater`, `firewater`, `steam`, `air`, `nitrogen`, `chemical`, `flare`, `drain`, `fuel-gas`, `diesel`, `potable`, `cooling`. It sets the ISO 14726 colour bands, and `firewater` makes the whole line red. |
| `nps` | Defaults to the size of the `from` port. |
| `schedule` | Pipe schedule, `STD` by default |
| `insulated` | Draws aluminium cladding |
| `elevation` | Height of the horizontal run. By default it is chosen from the port directions: above top nozzles, below bottom nozzles. |
| `order` | `xz` runs east-west first, `zx` runs north-south first |
| `via` | Waypoints `[[x,y,z], …]` that replace auto-routing, e.g. to run along a pipe rack |
| `supports` | Stanchions under horizontal runs, on by default. Set `false` for lines carried by a rack. |
| `inline` | `[{ component, at, tag?, props? }]`. `at` is the fraction along the line, from 0 to 1. Inline items take the line's size and class. |

### Line numbers are data

When a line's `tag` follows `SIZE"-SERVICE-SEQ-CLASS-INSULATION`, the assembler reads it. For `8"-PG-2101-D6A-N`:

| Part | Value | Sets |
|---|---|---|
| `8"` | NPS 8 | Size |
| `PG` | Process gas | `service` |
| `2101` | Sequence | Nothing |
| `D6A` | Piping class; the digit gives Class 600 | Pressure class of the pipe-side flanges |
| `N` | Not insulated | `insulated` (anything other than `N`, e.g. H or P, means insulated) |

Explicit fields on the line override the tag. Sizes also work as `1-1/2"` or `DN200`. Mismatches between the tag and the nozzle are reported. Service codes and the class-digit convention are in `assembly/linetag.ts`; edit them to match your project's line-numbering procedure.

The router leaves each flange straight along the port's axis for 0.6 m. It then climbs or drops to the run elevation, runs along X then Z (or Z then X), and drops into the other flange. Each corner gets a B16.9 long-radius elbow. Each end gets a gasket, a mating weld-neck flange and studs, sized to that end's nozzle. When the two ends differ in size, a B16.9 concentric reducer goes in before the far end. Inline items cut the pipe, with a flange pair on each side; wafer bodies (butterfly, dual-plate check) are clamped by through-bolts.

## Rendering

```tsx
import { Plant, type ComponentMap } from './components/deck-twin/assembly/plant'
import * as horizontalSeparator from './components/deck-twin/vessels/horizontal-separator'
import * as centrifugalPump from './components/deck-twin/rotating/centrifugal-pump'
import * as gateValve from './components/deck-twin/valves/gate-valve'
import spec from './plant.json'

const components: ComponentMap = {
  'horizontal-separator': horizontalSeparator,
  'centrifugal-pump': centrifugalPump,
  'gate-valve': gateValve,
}

<Plant spec={spec} components={components} labels onReport={(issues) => console.table(issues)} />
```

`npx deck-twin assemble plant.json` writes this file for you, as `src/PlantScene.tsx`, with every import in place.

### Offshore: show the sea

Add `"sea": { "level": -14, "depth": 50 }` to the plant. `<Plant>` draws the animated `ocean` component at mean sea level, with foam rings where the jacket legs cross the surface, and a seabed `depth` metres below it. The water is slightly transparent, so the jacket shows through it. For a jacket at y = 0, `level` is minus its `airGap`.

| Field | What |
|---|---|
| `level` | Mean sea level as plant y, m |
| `depth` | Water depth to the seabed, m. Leave it out for no seabed. |
| `waves` | Significant wave height Hs, m (default 1.5) |

Pass `night` to `<Plant>` for darker water. Add the `sky` component for a matching day or night sky, lights and haze. The sea is visual only: it is not part of the checks. See the [offshore water injection example](/examples/offshore-water-injection), which has a Studio / Day / Night switch.

## Checks

`onReport` receives these issues:

| Level | Issue |
|---|---|
| Error | Unknown component |
| Error | Unknown tag or port |
| Error | Duplicate tag |
| Error | Line ends too close for two flanges |
| Warning | Unconnected process port |
| Warning | No straight run long enough for an inline valve |
| Warning | **Items overlap** (measured from the meshes) |
| Warning | **Item stands on nothing**, meaning y > 0 with no structure under it |

The [playground](/playground) shows the same report for any pasted `plant.json`.

## Layout rules of thumb

- **Clearance.** Leave at least 1 m between equipment for access, and 1.5–3 m in front of pumps and exchangers for maintenance (tube-bundle pulls need the bundle length clear).
- **Flow direction.** Wells and inlet sit upstream (west), then separation, then treatment and export (east). Put utilities and power at one end, and accommodation away from hydrocarbons.
- **Pumps.** Put them close to and below their suction vessel, so the suction line is short and drains towards the pump.
- **Pipe racks.** Run them along the module's long axis at 4–6 m. Route long lines over the rack with `via`, and set `supports: false`.
- **Decks.** A typical deck stack is a cellar deck at y = 0, the production deck at y = 8–10, and the weather deck 8–10 m above that. Put `deck-module` items at those heights, and put the equipment on each deck at the same y.
- **Cranes.** Pedestal cranes go at deck edges and corners, with the laydown area within the boom radius.

See [Examples](/examples) for complete plants.
