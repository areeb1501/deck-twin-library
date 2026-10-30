/** The rules an AI agent needs to write a plant.json that loads first time. Copied from the plant menu. */
export const agentBrief = (site: string) => `Write this plant as a Deck Twin plant.json. There is one format and it is built from the component library, so follow it exactly.

## Format

{
  "name": "Plant name",
  "source": "drawing numbers or documents this came from",
  "items": [
    { "tag": "V-100", "component": "horizontal-separator", "position": [0, 0, 0], "rotation": 0, "props": { "diameter": 2.4, "length": 8 } }
  ],
  "lines": [
    { "tag": "8\\"-PG-101-D6A-N", "from": "V-100.gas", "to": "K-101.suction", "inline": [{ "component": "gate-valve", "at": 0.5, "tag": "XV-101" }] },
    { "tag": "6\\"-PO-102-C3A-N", "from": "V-100.oil", "to": { "at": [30, 1.5, 0], "label": "TO EXPORT" } }
  ]
}

Add "sea": { "level": -14, "depth": 50 } for an offshore plant on a jacket at y = 0.

## Never use these

They belong to other formats and the file will be rejected: "equipment", "deck", "nozzles", "route", "kind", "type", "version", "valves" or "instruments" at the top level. Valves go in a line's "inline" list. Do not hand-write the twin's Export output.

## Rules

1. Component names come only from ${site}/r/index.json, or \`search\` below. Never invent one.
2. Port ids and props come only from \`info <name>\`. Every line end is "TAG.port" or a battery limit { "at": [x, y, z], "label": "..." }.
3. Every item and line has a tag, and tags are unique across both. At least one end of every line is an item port.
4. Units: metres and degrees, with x east, y up and z south. An item's y is the level it stands on.
5. Line tags read SIZE"-SERVICE-SEQ-CLASS-INSULATION, for example 8"-PG-101-D6A-N: size, service and class are read from them.
6. Inline components need ports A and B, and "at" is 0 to 1 along the line. Leave a straight run long enough for them.
7. Wire every process port, in flow order. Nothing is decorative, unconnected or floating. Put anything above y = 0 on a deck or structure item.
8. Keep items far enough apart that a line has room for two flanges.
9. A line can't start or end in the middle of another line. Add a "tee" item with "ends": "flanged" at the height of the line, join it through ports run-a, run-b and branch, and split the line. Add a letter to the second piece's sequence number: 4"-PO-303-D6A-N and 4"-PO-303A-D6A-N.

## Check before you hand it over

Run these with no install. The Load button applies the same rules, so a clean check is a file that loads.

npx -y ${site}/cli/deck-twin.tgz search <words>
npx -y ${site}/cli/deck-twin.tgz info <name>
npx -y ${site}/cli/deck-twin.tgz check plant.json

Fix every error and re-run until it is clean. Then report every assumption and any warning that remains.

Schema for editors and structured output: ${site}/r/plant.schema.json
Full reference: ${site}/skill/references/plant-json.md
`
