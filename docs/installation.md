# Installation

Deck Twin components are React Three Fiber components. Any React project with a bundler works, including Vite, Next.js and Remix.

> **The CLI runs straight from this site.** The `deck-twin` package isn't published to npm yet, so run it as `npx -y https://<this site>/cli/deck-twin-0.2.1.tgz <command>`. It needs no install and no dependencies. Wherever these docs say `npx deck-twin`, use that command instead. The landing page's **Copy prompt** already uses the full command.

## 1. Peer dependencies

```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

## 2. Add components

```bash
npx deck-twin add horizontal-separator centrifugal-pump gate-valve
```

The CLI writes to `src/components/deck-twin/`, or to `components/deck-twin/` if there is no `src/`:

```
src/components/deck-twin/
  lib/                       shared core: kit, materials, parts, ports, router, stage, standards/
  vessels/horizontal-separator.tsx
  rotating/centrifugal-pump.tsx
  valves/gate-valve.tsx
```

Imports between these files are relative, so you don't need path aliases. If you've edited a file locally, running `add` again keeps your version unless you pass `--overwrite`.

## 3. Render

```tsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Stage } from './components/deck-twin/lib/stage'
import { HorizontalSeparator } from './components/deck-twin/vessels/horizontal-separator'
import { CentrifugalPump } from './components/deck-twin/rotating/centrifugal-pump'

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas shadows camera={{ position: [14, 9, 16], fov: 35 }}>
        <Stage radius={10}>
          <HorizontalSeparator tag="V-100" />
          <CentrifugalPump tag="P-101A" position={[6, 0, 5]} rotation-y={Math.PI} />
        </Stage>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  )
}
```

`<Stage>` provides a sun with soft shadows, sky fill and a reflection environment built from local light formers, so it needs no network. You can replace it with your own lighting.

## Configuration

`npx deck-twin init` writes a `deck-twin.json` file:

```json
{ "dir": "src/components/deck-twin", "registry": "https://deck-twin-library.demoareeb.workers.dev" }
```

- `dir` is where components go.
- `registry` is where the CLI fetches them from. To use a self-hosted copy, point it at your deployment of this site, or at a local folder that contains `r/`.

## Manual installation

Every component page has a **Code** tab, and every item is plain JSON at `/r/<name>.json`, with the file contents included. To install by hand:

1. Copy `/r/core.json` → `files[].content` into `deck-twin/lib/…`.
2. Copy the component file into `deck-twin/<category>/`.

## Requirements

Built and tested with:

- React 19
- three r186
- @react-three/fiber 9
- @react-three/drei 10
- TypeScript 6

The components are strict TypeScript. They compile with the default Vite `react-ts` template.

Older versions may work but haven't been tested.
