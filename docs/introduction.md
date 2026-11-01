# Introduction

Deck Twin is a library of 3D components for oil and gas digital twins, built with three.js and React Three Fiber. It includes a CLI and an agent skill.

Use it to build a 3D model of a plant from P&IDs, datasheets, drawings and dimensions. Your application can then drive the model from its own data.

The library covers separators, columns, pumps, compressors, gas turbines, valves, piping, instruments, fire and gas devices, decks, pipe racks, jackets, cranes and process packages. Each component has a page with a live preview, and one command installs it into your project.

- **Source files in your project.** As with shadcn/ui, `npx deck-twin add centrifugal-pump` copies one readable file into `src/components/deck-twin/`, together with the shared `lib/`. There is no runtime package to upgrade.
- **Sizes from standards.**
  - Pipe and flanges follow ASME B36.10, B16.5 and B16.47. Fittings follow B16.9, and valve lengths follow B16.10.
  - Relief valves follow API 526, and pumps and compressors follow the API 610, 617 and 618 layouts.
  - Exchangers follow TEMA, motors follow IEC 60072 frames, and access steel follows ISO 14122.
  - Changing the NPS or the pressure class updates the geometry.
- **Plants defined in JSON.** Every component exposes **ports**, the flange faces where pipe connects. A `plant.json` file lists the components, their positions and the port connections. `<Plant>` places the components and routes the pipe, including elbows, mating flanges, gaskets, studs, inline valves, ISO 14726 colour bands and supports.
- **Agent support.** A skill, a machine-readable index and a validating CLI let an AI agent generate a 3D plant from a P&ID or an equipment list. The skill is written so that a small, inexpensive model can follow it.

## Component example

```tsx
import { HorizontalSeparator } from './components/deck-twin/vessels/horizontal-separator'

<HorizontalSeparator service="3-phase" diameter={2.4} length={8} pressure={40} rating={600} tag="V-1100" position={[0, 0, 0]} />
```

All dimensions are in metres. The shell wall thickness comes from ASME VIII-1 UG-27 at 40 barg. The nozzles are Class 600 weld-neck flanges with the correct number of studs. The model includes a water boot, a level bridle and a caged ladder to the top platform. `ports()` returns the five flange faces so that the assembler can connect pipe to them.

## What it is not

- **Not vendor CAD.** The geometry is generic and representative, sized from public standards. Manufacturer names on component pages show who supplies that type of equipment. They do not mean the model matches their product.
- **Not a substitute for engineering.** The standards tables are reference values. Check them against the current edition before you rely on them.
- **Not a simulator.** Components render geometry and expose a few visual states, such as valve travel, crane slew and running fans. Your application is responsible for driving them from live or simulated data.

## Next steps

- [Installation](/docs/installation)
- [Assembling plants](/docs/assemble)
- [Agent skill](/docs/agents)
- [Browse components](/components)
