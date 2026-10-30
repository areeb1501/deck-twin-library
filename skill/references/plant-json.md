# plant.json schema

## The one format

There is exactly one plant format for agents: the one on this page. It is built from the component library, and every line of it is checked against the registry.

| Do | Don't |
|---|---|
| List components in `"items"`, each with `"tag"`, `"component"` and `"position"`. | Use `"equipment"`, `"deck"`, `"kind"`, `"type"`, `"nozzles"` or `"version"`. Those belong to other formats and the file is rejected. |
| Take `"component"` from `deck-twin search`, and props and ports from `deck-twin info <name>`. | Invent a name, a prop or a port id, or guess one from a similar component. |
| Join items with lines: `"from": "V-100.gas"`, `"to": "K-101.suction"`. | Write coordinates for a pipe's route unless you need waypoints (`"via"`). The router builds it. |
| Put valves and other inline parts in the line's `"inline"` list. | Add top-level `"valves"` or `"instruments"`, or put an inline valve in `"items"`. |
| Run `deck-twin validate plant.json` and fix every error before you hand it over. | Hand over a file that hasn't been checked. |

The JSON Schema is at [/r/plant.schema.json](/r/plant.schema.json), with the full list of component names. Use it for editor validation or structured output, and start the file with `"$schema"` pointing at it.

## Schema

```ts
interface PlantSpec {
  name: string
  description?: string
  source?: string                       // drawing numbers this was taken from
  items: PlantItem[]
  lines?: PlantLine[]
  camera?: { target: [number, number, number]; radius: number; direction?: [number, number, number] }  // viewer framing only
  sea?: { level: number; depth?: number }   // offshore: mean sea level as plant y (-airGap for a jacket at y = 0); depth draws the seabed
}

interface PlantItem {
  tag: string                           // unique: "V-1100", "P-1500A", "DECK-MAIN"
  component: string                     // registry name: "horizontal-separator"
  props?: Record<string, unknown>       // from `deck-twin info <name>`
  position?: [number, number, number]   // metres; y = the level it stands on
  rotation?: number                     // degrees about +Y
}

interface PlantLine {
  tag: string                           // line number: 8"-PG-2101-D6A-N
  from: string | BatteryLimit          // "TAG.port", or where the line leaves the plot
  to: string | BatteryLimit
  service?: 'oil' | 'gas' | 'multiphase' | 'water' | 'seawater' | 'firewater' | 'steam' | 'air'
          | 'nitrogen' | 'chemical' | 'flare' | 'drain' | 'fuel-gas' | 'diesel' | 'potable' | 'cooling'
  nps?: number                          // default: size of the from-port
  schedule?: string                     // default STD
  insulated?: boolean
  elevation?: number                    // height of the horizontal run
  order?: 'xz' | 'zx'                   // run east-west first or north-south first
  via?: [number, number, number][]      // manual waypoints (e.g. along a pipe rack)
  supports?: boolean                    // stanchions under elevated runs (default true)
  inline?: { component: string; at?: number; tag?: string; props?: Record<string, unknown> }[]
}

interface BatteryLimit {               // P&ID off-page connector / tie-in point
  at: [number, number, number]          // where the line leaves the modelled area
  direction?: [number, number, number]  // default: towards the other end, along X or Z
  label?: string                        // e.g. "TO HOST", "FROM WHP-B"
}
```

## Branches

A line joins two ports, so it can't start or end in the middle of another line. Where a line branches, or two lines join, add a `tee` as an item and split the line at it.

```json
{ "tag": "TEE-303", "component": "tee", "position": [-8.3, 0.73, 4.5], "rotation": -90, "props": { "nps": 4, "branchNps": 4, "ends": "flanged", "rating": 300, "branch": "side", "service": "oil" } }
```

- **Ports:** `run-a`, `run-b` and `branch`. Set `"ends": "flanged"` so the lines can bolt on.
- **Direction:** `run-a` and `run-b` lie on the tee's local X axis. `"branch"` is `"up"`, `"down"` or `"side"`, and `"side"` points along local +Z. `rotation` turns all of it.
- **Height:** put the tee at the height of the line it sits on, not at y = 0.
- **Tags:** the two pieces of a split line are separate lines, and tags are unique. Keep the document's number on one piece and add a letter to the sequence on the other: `4"-PO-303-D6A-N` and `4"-PO-303A-D6A-N`. A letter keeps the tag readable, but a suffix such as `-N-2` does not, and the size and service are then misread.

## Ports move with props

`deck-twin info` lists ports at the component's default props. Resizing an item moves its ports, so treat those positions as approximate when you place something against them, such as a PSV on a vessel. The renderer uses the real positions and reports what doesn't fit.

## Rules the checker enforces

| Rule | Detail |
|---|---|
| Tags | Every item and every line has one, and all are unique. |
| `component` | Must be a registry name. |
| `from` / `to` | Must name an existing item and one of its ports. |
| `props` | Keys must be that component's props. Numbers must be in range, and select values must be valid options. |
| `inline` | Components must have ports `A` and `B`, and `at` must be 0–1. |
| Process ports | Should all be connected. If one isn't, it is reported as a warning. |

## Rules the renderer adds

- **Line too short:** a line needs room for two flanges. The renderer reports an error if the ends are closer than that.
- **Overlaps:** items whose meshes overlap significantly are reported.
- **Floating items:** items above y = 0 with no structure under them are reported.
- **Inline items:** each needs a straight run at least as long as its body plus the mating flanges. If there isn't one, the renderer reports it and skips the item.
