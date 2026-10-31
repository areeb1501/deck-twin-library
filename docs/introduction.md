# Introduction

Deck Twin is a library of 3D components for oil and gas digital twins, built with three.js and React Three Fiber. Use it to build a 3D model of a plant from P&IDs, datasheets, drawings and dimensions, then connect that model to your own data.

It covers separators, columns, pumps, compressors, gas turbines, valves, piping, instruments, fire and gas devices, decks, pipe racks, jackets, cranes and process packages. Each component has a page with a live preview, and one command installs it into your project.

It works like shadcn/ui, but for plant equipment:

- **You own the code.** `npx deck-twin add centrifugal-pump` copies one readable file into `src/components/deck-twin/`. The shared `lib/` comes with it. There is no runtime package to upgrade and no black box.
- **Sizes come from standards.**
  - Pipe and flanges follow ASME B36.10, B16.5 and B16.47. Fittings follow B16.9, and valve lengths follow B16.10.
  - Relief valves follow API 526, and pumps and compressors follow the API 610, 617 and 618 layouts.
  - Exchangers follow TEMA, motors follow IEC 60072 frames, and access steel follows ISO 14122.
  - Change the NPS or the pressure class and the geometry follows.
- **Plants are data.** Every component exposes **ports**, the flange faces where pipe connects. You describe a plant in `plant.json`: which components, where they go, and which ports connect. `<Plant>` then places them and routes the pipe, with real elbows, mating flanges, gaskets, studs, inline valves, ISO 14726 colour bands and supports.
- **It is built for agents.** A skill, a machine-readable index and a validating CLI let an AI agent turn a P&ID or an equipment list into a working 3D plant. The skill is written so a small, inexpensive model can follow it.

## What a component looks like

```tsx
import { HorizontalSeparator } from './components/deck-twin/vessels/horizontal-separator'

<HorizontalSeparator service="3-phase" diameter={2.4} length={8} pressure={40} rating={600} tag="V-1100" position={[0, 0, 0]} />
```

All dimensions are in metres. The shell wall comes from ASME VIII-1 UG-27 at 40 barg. The nozzles are Class 600 weld-neck flanges with the right number of studs. There is a water boot, a level bridle and a caged ladder up to the top platform. `ports()` returns the five flange faces so the assembler can connect pipe to them.

## What it is not

- **Not vendor CAD.** The geometry is generic and representative, sized from public standards. Manufacturer names on component pages tell you who supplies that type of equipment. They do not mean the model matches their product.
- **Not a substitute for engineering.** The standards tables are reference values. Check them against the current edition before you use them for anything that matters.
- **Not a simulator.** Components render geometry and expose a few visual states such as valve travel, crane slew and running fans. Driving them from live or simulated data is up to your app.

## Next

- [Installation](/docs/installation)
- [Assembling plants](/docs/assemble)
- [Agent skill](/docs/agents)
- [Browse components](/components)
