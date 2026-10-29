# Conventions

## Units and axes

- **Lengths** are in metres. **Pipe sizes** are NPS in inches (`nps: 6`). **Pressure class** is the ASME class (`rating: 600`). **Power** is in kW, apart from `mw` on large drivers. **Angles** are in degrees.
- **Axes:** +Y is up. The main axis of horizontal equipment runs along +X. Fronts face +Z: control panels, cab doors, ladders.

## Origin (anchor)

| Anchor | Origin | Examples |
|---|---|---|
| `base` | Footprint centre at the level the item stands on, y = 0 | separators, pumps, decks, cranes, skids |
| `inline` | Pipe centreline. Port `A` is at -X and `B` at +X. | valves, strainers, spools, inline meters |
| `fitting` | Body centre, with ports where the geometry needs them | elbows, tees, PSVs, gauges |

Some `base` items legitimately reach below y = 0: caisson pumps, risers and jackets. Their pages say so.

## Ports

- A port is the centre of a raised flange face, with an outward unit `direction`, `nps`, `rating` and `kind`.
- Ids are short and stable: `inlet`, `outlet`, `suction`, `discharge`, `gas`, `liquid`, `water`, `psv`, `vent`, `drain`. Inline items use `A` and `B`.
- `kind: 'process'` ports should be connected in a plant. `relief`, `vent`, `drain`, `utility`, `instrument` and `electrical` may be left open.

## Props

- Every prop is optional, and the defaults describe a typical real item.
- Components spread the remaining props onto their root `<group>`, so `position`, `rotation`, `scale`, `onClick` and `name` all work.
- Props never reuse Object3D names (`id`, `name`, `type`, `position` …).
- Visual state props are `open` (0–1) for valves, `running` for machines, and `slew`, `luff` and `hook` for cranes.

## Materials

Components share one set of PBR materials (`lib/materials.ts`), so a plant with a thousand items still compiles only a few shaders. The materials carry subtle procedural weathering, keyed to world position.

Paint follows offshore practice:

- equipment: light grey (RAL 7035)
- machinery: green or blue
- guards and handrails: safety yellow
- firewater: red
- line identification: ISO 14726 bands

Use `paint('#hex')` for a custom colour.

## Performance

- Each static assembly is merged into one mesh, with one draw call per material it uses, so a pump package is about 15 draw calls.
- Moving parts (fans, couplings, valve stems, crane booms) are separate small meshes.
- Geometry is rebuilt only when a prop that affects it changes, and the old buffers are disposed.

## Code style

- One header line per file says what the item is and which standards it follows.
- Other comments only where the maths isn't obvious.
- No hidden imports: a component file uses only `react`, `three`, `@react-three/fiber`, `@react-three/drei` and the relative `lib/`.
