# Layout rules

Use these to turn a P&ID, which has no coordinates, into positions. Coordinates are in metres: +X east, +Y up, +Z south. North is -Z.

## 1. Pick the frame

- **Onshore pad:** grade at y = 0, with equipment at y = 0.
- **Offshore platform:** use real deck levels, each with a `deck-module` at that y:

  | Deck | y |
  |---|---|
  | Cellar deck | 0 |
  | Production (main) deck | 9 |
  | Weather deck | 18 |
  | Drill floor | about 26 |

  Equipment on a deck uses the same y as the deck.
- Size each deck from the equipment on it. Add 3 m around the edges for escape routes, then round to whole metres.

## 2. Order by process flow (west → east, +X)

```
wells / inlet  →  separation  →  liquid treatment / gas compression  →  export
```

- Put utilities (power, air, cooling water, chemicals) in their own zone, typically at the east or north end.
- Put accommodation, the control room and muster areas on the side away from hydrocarbons, upwind (API RP 14J zoning: hazardous → non-hazardous).
- On multi-deck platforms:

  | Deck | Typical contents |
  |---|---|
  | Cellar | wellheads, manifolds, drains, seawater and firewater pumps |
  | Production | separation, compression, treating |
  | Weather | power generation, coolers, cranes |

## 3. Spacing

Use the footprint from `decktwin info <name>` → `bounds.size`: x is length, z is width.

| Between | Clear distance |
|---|---|
| Any two items | ≥ 1.0 m |
| Pump or compressor maintenance side | ≥ 2.0 m |
| Exchanger tube-bundle pull | bundle length + 1 m in front of the channel |
| Main escape route along the deck | ≥ 1.5 m wide, kept free |
| Fired equipment and hydrocarbon vessels | ≥ 15 m |
| Flare boom tip and any deck | per radiation study, typically 60–90 m |

## 4. Place items next to their partners

- **Pumps:** beside or downstream of their suction vessel, as close as access allows. For an A/B pair, put them side by side, 2–3 m apart along Z.
- **Exchangers:** next to the equipment they serve, with nozzles facing the connecting lines.
- **PSVs:** on the vessel's `psv` port. Run the outlet to a flare header line.
- **Instruments:** close to the tap they serve, within 1–2 m.
- **Rotation:** choose it so the item's main inlet faces the upstream item. Use 0, 90, 180 or 270.

## 5. Pipe racks and long lines

- If two connected items are more than about 15 m apart, run the line on a `pipe-rack`:
  - Put the rack on the module's long axis.
  - Give the line `via` points at a rack tier elevation, and set `supports: false`.
- Short lines (under 15 m) can auto-route. The router puts stanchions under elevated horizontal runs.

## 6. Structures and cranes

- **Offshore stack:** `jacket` at the bottom, then `deck-module` items stacked above, linked to other platforms by `bridge`, with a `helideck` above the accommodation. Each structure's description says where its walking surface is.
- **Pedestal cranes:** at deck corners or edges, reaching the laydown area and the supply-boat side. Keep the boom rest clear of other equipment.
- **Stairs between decks:** `stair` with `rise` = the deck spacing, placed at a deck edge.

## 7. Before you render

Run `decktwin validate plant.json` and fix all errors. Then render with `assemble`, and check the overlap and floating warnings.
