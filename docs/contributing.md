# Adding a component

This is the authoring contract for Deck Twin registry components. It covers imports, file structure, origins, ports, geometry, metadata and verification.

Each component is one `.tsx` file in a category folder of `registry/`, with an entry in that folder's `_meta*.ts`. The file must still compile after it is copied into another project, so it imports only these:

- `react`
- `three` and `three/examples/jsm/*`
- `@react-three/fiber` and `@react-three/drei`
- `../lib/*`, the shared core
- other registry components. Install them with the component.
- `./_something` helper files in the same category folder. These ship with every component that imports them.

`npx tsx scripts/build-registry.ts --check` rejects any other import.

## File structure

Use the gate valve (`registry/valves/gate-valve.tsx`), the pump (`registry/rotating/centrifugal-pump.tsx`) and the separator (`registry/vessels/horizontal-separator.tsx`) as starting points.

```tsx
// Gate valve: one line saying what it is and the standards it follows.
import { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { faceToFace, type Rating } from '../lib/standards'

export interface GateValveProps {
  nps?: number
  rating?: Rating
  /** stem travel, 0 closed … 1 open */
  open?: number
}

export const defaults = { nps: 6, rating: 300 as Rating, open: 1 }

export function ports(p: GateValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = faceToFace('gate', nps, rating)
  return [port('A', 'End A', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'End B', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function GateValve({ nps = defaults.nps, rating = defaults.rating, open = defaults.open, ...group }: GateValveProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating), [nps, rating])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default GateValve
```

The exports, in order:

| Export | What |
|---|---|
| `interface XProps` | Every prop is optional. Lengths are in metres, `nps` is in inches, `rating` is an ASME class, power is in kW and angles are in degrees. |
| `defaults` | A plain object holding a value for every prop. Pick a typical real configuration. |
| `ports(props)` | Flange faces in the local frame, using the same maths as the geometry. Leave it out if the item has no connections. |
| `X` | The React component. It spreads the remaining props onto a `<group>` so users can pass `position`, `rotation` and so on. |
| `default` | The same component. |

**Prop names to avoid**, because Object3D already uses them: `id`, `name`, `type`, `position`, `rotation`, `scale`, `visible`, `up`, `layers`, `children`, `matrix`, `quaternion` and `userData`. Use `diameter`, not `id`.

## Frame and origin

| Anchor | Origin | Use for |
|---|---|---|
| `base` | Centre of the footprint at deck level, y = 0. Nothing goes below y = 0 unless the item really does (caisson pumps, jackets, risers). | Equipment, structures, packages |
| `inline` | On the pipe centreline. Ports `A` at -X and `B` at +X, both on the X axis. | Valves, strainers, inline meters, spools |
| `fitting` | Body centre. Ports wherever the geometry puts them. | Elbows, tees, PSVs |

Axes: +Y is up, and the main axis of a horizontal item runs along +X. When an item has an obvious front, such as a cab door, a control panel or a ladder, face it +Z.

## Ports

`port(id, label, position, direction, nps, rating?, kind?)`

- `position` is the centre of the raised face. The assembler bolts a pipe flange onto it.
- `direction` is a unit vector pointing out of the face.
- Give ports short lowercase ids: `inlet`, `outlet`, `suction`, `discharge`, `gas`, `liquid`, `water`, `psv`, `drain` and `vent`. Inline items use `A` and `B`. Keep the ids stable across props.
- `kind` defaults to `process`, which means it should be connected in a plant. Use `relief`, `vent`, `drain`, `utility` or `instrument` for connections that can be left open.
- Every port needs a real flange at that point in the geometry. Use `nozzle()`, or `flange()` plus a neck.

## Geometry

- Build each static assembly into one merged mesh with `useKit((k) => …, deps)` and `<KitMesh>`. Use `Kit` primitives such as `box`, `rbox`, `cyl`, `rod`, `lathe`, `torus`, `sphere`, `dome`, `tube`, `pipe`, `bend`, `extrude`, `boltCircle` and `handwheel`.
- Reuse the parts in `lib/parts.ts`:
  - flanges and joints: `flange`, `blindFlange`, `flangedJoint`;
  - piping: `nozzle`, `pipe`, `pipeRun`, `weldBead`;
  - vessels and access: `manway`, `saddle`, `ladder`, `ringPlatform`, `handrail`, `grating`, `checkerPlate`;
  - steel and skids: `member` (any EN or AISC section), `skid`;
  - machinery: `motor` and `motorSize` (IEC frames), `couplingGuard`;
  - small details: `gauge`, `junctionBox`, `liftingLug`, `tagPlate`.
- Moving parts go in a separate Kit. Spin them with `<Rotors>` (`lib/rotors.tsx`), or use a group transform driven by a prop such as `open`, `slew` or `luff`.
- Use materials by name from `lib/materials.ts`, or call `paint('#hex')`. Textures come from `lib/textures.ts`: grating, dials, tag plates, signs, hazard stripes, checker plate and louvres.
- Size everything from `lib/standards`:

  | Function | Standard |
  |---|---|
  | `pipeOD`, `pipeWall` | ASME B36.10 |
  | `flange` | ASME B16.5 / B16.47 |
  | `elbow90`, `tee`, `reducer` | ASME B16.9 |
  | `faceToFace` | ASME B16.10 |
  | `psv` | API 526 |
  | `SECTIONS` | EN / AISC steel sections |
  | `iecMotor` | IEC 60072 motor frames |
  | `ACCESS` | ISO 14122 access rules |
  | `shellThickness`, `headDepth` | ASME VIII |
  | `SERVICE`, `RAL` | ISO 14726 colours |

  When a value comes from a typical design rather than a standard, put `// typical` next to it.
- Keep the geometry efficient. Use 24–48 radial segments for large cylinders and 8–12 for small rods and bolts. Use no per-frame allocations.

## Component checklist

- Dimensions come from the standard, and they change with the props.
- Every port has a flanged nozzle with studs and nuts.
- The item has nameplates or tag plates, lifting lugs, earth bosses, drains, vents and instrument tappings where a real one would.
- Access (ladders, platforms, handrails) follows ISO 14122 wherever an operator needs to reach a valve, nozzle or instrument above 2 m.
- Bases have base plates and anchor bolts or skid steel. Nothing floats, everything touches what holds it, and there is no z-fighting.
- The paint follows offshore practice: equipment light grey (RAL 7035), machinery green or blue, safety yellow for guards and handrails, and red for firewater.

## Comments

Write one header line per file that states what the item is and which standards it follows. Add short comments only where the maths is not obvious. A short `/** unit */` on a prop is allowed. Do not write long JSDoc.

## Metadata

Add an entry to the category's `_meta*.ts`:

```ts
{
  name: 'gate-valve',            // kebab-case, unique, also the CLI name
  title: 'Gate valve',
  file: 'gate-valve.tsx',
  export: 'GateValve',
  description: 'Two or three sentences: what it is, what is modelled, which props matter.',
  standards: ['API 600', 'ASME B16.10'],
  vendors: ['Velan', 'Flowserve'],   // typical suppliers of this type, not vendor CAD
  tags: ['isolation', 'manual'],
  anchor: 'inline',
  params: [ /* live controls: number (min, max, step, unit), select, bool, nps, rating, color, text */ ],
  preview: { /* optional prop overrides for the preview */ },
}
```

## Verify

```bash
npx tsc -p tsconfig.app.json --noEmit
npx tsx scripts/build-registry.ts --check <category>
node scripts/shoot.mjs <name> [--ports] [--props '{"nps":12}'] [--view 1,0.4,0.2]
```

`shoot.mjs` writes `.snaps/<name>.jpg`. Inspect it at default props and at least one other setting, and check the ports with `--ports`.
