# Worked examples

Each example is a complete, checked plant.json in the registry: `<registry>/r/examples/<name>.plant.json`. All six pass `deck-twin validate` with no errors and the renderer's geometry checks with no issues. The wellhead platform shows two warnings for manifold slots 5 and 6: `check` reads ports at default props, and that manifold is set to `slots: 4`. Copy the patterns below rather than inventing new ones.

| Example | Level | Items / lines | Shows |
|---|---|---|---|
| `onshore-well-pad` | Basic | 9 / 10 | One well to separator, pump, bunded tank and flare |
| `control-room` | Basic | 9 / 0 | Interiors, screens, doors |
| `wellhead-platform` | Intermediate | 13 / 6 | Jacket, decks, trees, manifold, crane, helideck |
| `offshore-water-injection` | Intermediate | 14 / 16 | Caisson lift pump, filtration, deaerator, duty/standby pumps, riser ESDVs |
| `separation-train` | Intermediate | 11 / 16 | Battery limits, tees, pipe-rack routing, relief |
| `crude-export-terminal` | Advanced | 25 / 28 | Metering, tank farm in a bund, rack headers, loading arm and truck bay |

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

## 4. Onshore well pad: the minimum producing plot

`onshore-well-pad.plant.json`

Well XT-101 flows through SDV-101 and choke HCV-101 into separator V-200. Gas goes to flare FS-500 on PCV-201. Oil is pumped by P-300 on level control LV-201 into tank TK-401 inside bund BW-400.
```json
{ "tag": "FS-500", "component": "flare-stack", "position": [6, 0, -28], "props": { "height": 20, "support": "self", "headerNps": 6, "lit": true } },
{ "tag": "3\"-PO-302-C3A-N", "from": "P-300.discharge", "to": "TK-401.inlet", "elevation": 2, "order": "zx",
  "inline": [{ "component": "swing-check-valve", "at": 0.12 }, { "component": "control-valve", "at": 0.3, "tag": "LV-201" }] }
```
- **Flare spacing.** The flare stands about 30 m from the separator, tank and well. The distance is illustrative: size it from a radiation study.
- **Crossing a bund.** `elevation: 2` lifts the tank inlet over the 1.2 m bund wall, and `order: "zx"` jogs it clear of the step-over stairs.
- **Control valve on the discharge.** Level control throttles a centrifugal pump's discharge, never its suction.

## 5. Offshore water injection module: caissons, packages, risers

`offshore-water-injection.plant.json`

Lift pump P-W300 feeds filters X-W330 (backwash to caisson CS-W350), then deaerator T-W320 dosed from C-W340. Booster pumps P-W305A/B feed injection pumps P-W310A/B, which discharge into a header that drops through a check valve and an ESDV into each jacket riser.
```json
{ "tag": "P-W300", "component": "vertical-turbine-pump", "position": [-16, 6, 7.5], "props": { "kw": 200, "dischargeNps": 10, "depth": 26, "stages": 3 } },
{ "tag": "8\"-WI-4101-F15A-N", "from": "TEE-W311.branch", "to": "JKT-W1.riser-1",
  "inline": [{ "component": "swing-check-valve", "at": 0.3 }, { "component": "esd-valve", "at": 0.7, "tag": "ESDV-W401" }] }
```
- **Caisson pumps** stand on the deck (y = 6) and reach down `depth` metres. Put them just outside the jacket legs so the column clears the bracing.
- **Duty / standby** pairs share a suction tee and a discharge header. Each pump gets its own check valve.
- **Riser ESDVs** sit on the vertical drop below the deck, as on the wellhead platform.
- **Sea.** `"sea": { "level": -14, "depth": 50 }` draws the water surface and seabed. The jacket stands at y = 0 with `airGap: 14` and `waterDepth: 50`, so mean sea level is y = -14. The sea is visual only and is left out of camera fitting and the checks.

## 6. Crude export terminal: metering, tank farm, loading

`crude-export-terminal.plant.json`

The pipeline arrives through valve station PVS-1001 and pig receiver L-1010, is metered on X-1100 (proved by X-1150) and fills tanks TK-2001/2002 inside bund BW-2000 from a header on rack PR-1. Loading pumps P-3001A/B deliver to marine loading arm MLA-3101, with a branch to truck bay X-3200.
```json
{ "tag": "PR-1", "component": "pipe-rack", "position": [15, 0, -24], "props": { "bays": 12, "bayLength": 6, "width": 6, "tiers": 2, "firstTier": 5, "tierSpacing": 2 } },
{ "tag": "12\"-PO-2101-A1A-N", "from": "TK-2001.outlet", "to": "ELB-2101.B", "elevation": 2.2, "inline": [{ "component": "motor-operated-valve", "at": 0.3, "tag": "MOV-2101" }] }
```
- **Headers on the rack.** Receipt and suction headers run along the rack. Tank lines join them with tees and elbows placed as items, so each tank branch is its own line.
- **Tank valves.** Motor-operated valves sit close to each tank nozzle, outside the bund where they can be reached.
- **Long plots.** The plot runs about 170 m west to east. Keep the tanks compact so the overview still reads.

## Checking your own plant

```bash
deck-twin validate plant.json      # names, ports, props, line numbers, unconnected ports
deck-twin assemble plant.json   # installs everything and writes src/PlantScene.tsx
```
Then render it. `<Plant onReport>` and the website playground add overlap and floating checks. Fix each one by moving the item, changing its rotation or changing `elevation`.
