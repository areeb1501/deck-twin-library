# Worked examples

Each example is a complete, checked plant.json in the registry: `<registry>/r/examples/<name>.plant.json`. Both pass `deck-twin check` and the renderer's geometry checks with no issues. Copy the patterns below rather than inventing new ones.

## 1. Wellhead platform: decks, jacket, trees, manifold, crane, helideck

`wellhead-platform.plant.json`

Read it as a P&ID would show it: four wells feed a production / test manifold, production leaves through the riser ESDV, and test flow is metered and leaves on its own riser.

**Stacking structures**
```json
{ "tag": "JKT-1",  "component": "jacket",      "position": [0, 0, 0],  "props": { "spanX": 16, "spanZ": 12, "risers": 2, "riserNps": 12, "riserRating": 1500 } },
{ "tag": "DECK-C", "component": "deck-module", "position": [0, 6, 0],  "props": { "legSpanX": 16, "legSpanZ": 12, "legHeight": 6, "upperDeckAt": 9 } },
{ "tag": "DECK-M", "component": "deck-module", "position": [0, 15, 0], "props": { "legSpanX": 16, "legSpanZ": 12, "legHeight": 0 } }
```
- The jacket's origin is the top of its legs (y = 0). Everything else is below.
- A deck-module's walking surface is at its own y. Its legs reach down `legHeight`, so the cellar deck sits at y = 6 with 6 m legs onto the jacket. The deck spans (`legSpanX/Z`) match the jacket spans (`spanX/Z`).
- `upperDeckAt: 9` puts stub columns on the cellar deck that carry the main deck at y = 6 + 9 = 15. The main deck has `legHeight: 0`.
- Equipment on a deck uses the deck's y: trees at y = 6, crane and helideck at y = 15.

**Flowlines from trees to a manifold**
```json
{ "tag": "4\"-PM-1011-F15A-N", "from": "XT-101.production", "to": "M-100.slot-1", "elevation": 10.4, "supports": false }
```
- The line number gives 4", multiphase service and Class 1500 (`F15A`), so nothing else is needed.
- Each parallel flowline gets its own `elevation` (10.4, 10.9, 11.4, 11.9), so the runs don't sit on top of each other. All of them are above the tree tops (about 9.6 m) and below the main deck steel.
- `supports: false` because these lines hang from the deck above.

**Inline valve on a riser**
```json
{ "tag": "12\"-PM-1001-F15A-N", "from": "M-100.production", "to": "JKT-1.riser-1", "inline": [{ "component": "esd-valve", "at": 0.72, "tag": "ESDV-1001" }] }
```
- `at: 0.72` puts the ESDV on the vertical drop to the riser, which is where riser ESDVs sit.

**Crane**
```json
{ "tag": "CR-1", "component": "pedestal-crane", "position": [-10.5, 15, 6.5], "props": { "boomLength": 30, "slew": 180, "luff": 22, "pedestalHeight": 8, "boomRest": false } }
```
- `slew: 180` points the boom out over the sea, away from the helideck. Pedestal cranes go at deck corners.

## 2. Separation & compression train: onshore pad, battery limits, pipe rack

`separation-train.plant.json`

**Battery limits.** These are the P&ID off-page connectors. Use them wherever a line leaves the drawing.
```json
{ "tag": "10\"-PM-1001-D6A-N", "from": { "at": [-34, 3.04, -6], "label": "FROM PIPELINE" }, "to": "V-1100.inlet", "inline": [{ "component": "esd-valve", "at": 0.5, "tag": "ESDV-1001" }] }
```
- Give `at` the same height as the nozzle the line goes to, so the run is level.
- The tie-in renders as a flanged, blinded end with a yellow band and a tag.

**Branch with a tee.** The anti-surge recycle joins the scrubber inlet line.
```json
{ "tag": "TEE-2101", "component": "tee", "position": [-6, 4.85, -6], "props": { "nps": 8, "branchNps": 6, "ends": "flanged", "rating": 600 } },
{ "from": "V-1100.gas",      "to": "TEE-2101.run-a" },
{ "from": "TEE-2101.run-b",  "to": "V-2100.inlet" },
{ "from": "K-2200.recycle",  "to": "TEE-2101.branch", "via": [[17.24, 5.09, -8.01], [17.24, 5.09, -10.6], [-6, 5.09, -10.6], [-6, 5.84, -10.6]], "supports": false }
```
- Put the tee on the straight line between its two run neighbours. Here it sits at the height of the scrubber inlet nozzle, so `run-b` lines up with `V-2100.inlet`.
- **Routing on a pipe rack.** The recycle runs along the rack's lower tier. `via` points sit at tier top of steel + pipe OD / 2 (5.0 + 0.09 here). Every `via` segment must be orthogonal: change one coordinate at a time.

**Automatic reducer.** The 4" pump discharge goes to the 6" exchanger tube inlet. The assembler inserts a B16.9 concentric reducer at the exchanger end, so nothing extra is needed.

**Relief.** The separator's `psv` port feeds a PSV item placed 0.7 m above it. The PSV outlet goes to a flare-header battery limit.
```json
{ "tag": "PSV-1101", "component": "pressure-safety-valve", "position": [-20.8, 5.3, -6], "props": { "orifice": "J", "inletRating": 600 } }
```

**Placement rules this example follows**
- Flow runs west to east. The pump sits beside and below its suction vessel.
- The rack sits behind the process equipment. The air cooler and crude cooler sit on the open side, for bundle and fan maintenance.
- Rotate items so their nozzles face their partners. Here the pump and air cooler are turned 180°.
- Electrical (E-house, transformer) sits apart from the hydrocarbon equipment.

## 3. Central control room: interiors, screens, doors

`control-room.plant.json`

```json
{ "tag": "B-300", "component": "room", "position": [0, 0, 0], "props": { "width": 14, "depth": 10, "height": 3.2, "cutaway": true,
  "doors": [{ "wall": "-x", "offset": 2.5, "kind": "double", "hardware": "panic", "open": 0.4 }],
  "windows": [{ "wall": "-z", "offset": -5.2, "width": 1.8, "height": 1, "sill": 1.1 }] } },
{ "tag": "VW-001",  "component": "video-wall",      "position": [0, 0.3, -4.4], "props": { "rows": 3, "cols": 5 } },
{ "tag": "OWS-101", "component": "control-console", "position": [0, 0.3, -0.6], "props": { "segments": 3, "layout": "curved" } },
{ "tag": "SC-101",  "component": "system-cabinet",  "position": [-6.45, 0.3, -1.6], "rotation": 90 },
{ "tag": "FACP-01", "component": "fire-alarm-panel", "position": [7, 0.3, 0.6], "rotation": -90 }
```

- **Floor level.** The room's slab is at y = 0 and its raised floor at `floorHeight` (0.3 m), so everything inside stands at y = 0.3.
- **Doors and windows** are declared on the room, not as separate items:
  - `wall` is one of `+x`, `-x`, `+z`, `-z`.
  - `offset` runs along the wall, left to right as seen from outside.
- **Wall-mounted items** (fire-alarm panel, wall display) have their back on the wall plane. Place them at the wall's inside face and rotate them to face into the room: `-90` on the +X wall, `90` on the -X wall.
- **Cutaway.** `cutaway: true` drops the ceiling and the +Z wall, so the twin can look in. View from +Z.
- **Live screens.** Consoles, video walls, desks and displays take `screens` (or `screen`) as an array of THREE textures. Pass CanvasTextures from your HMI, video textures or render targets, and the components swap them in without rebuilding geometry.
- This plant has no process lines. That's fine: `lines` can be empty.

## Checking your own plant

```bash
deck-twin check plant.json      # names, ports, props, line numbers, unconnected ports
deck-twin assemble plant.json   # installs everything and writes src/PlantScene.tsx
```
Then render it. `<Plant onReport>` and the website playground add overlap and floating checks. Fix each one by moving the item, changing its rotation or changing `elevation`.
