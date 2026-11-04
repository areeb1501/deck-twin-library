# CLI

`decktwin` is a single Node script with no dependencies. It needs Node 18 or later. The old name, `deck-twin`, still works as a second command.

```bash
npx decktwin <command>
```

| Command | What it does |
|---|---|
| `init` | Writes `deck-twin.json` with the install directory and registry URL |
| `add <name…>` | Copies components and everything they need (`lib/`, other components) into your project. `install` is an alias. |
| `list [category]` | Lists components by category |
| `search <words>` | Finds components by name, tag, standard or category, e.g. `search api 610` |
| `info <name>` | Shows props with ranges and defaults, ports at default props, standards and size |
| `validate <plant.json>` | Says whether a plant is valid (see below). `check` still works as an alias |
| `assemble <plant.json>` | Runs `validate`, installs every component the plant uses and writes `PlantScene.tsx` |
| `skill` | Installs the agent skill into `.claude/skills/deck-twin/` |

## Flags

| Flag | Meaning |
|---|---|
| `--dir <path>` | Install directory. Default: `src/components/deck-twin` |
| `--registry <url or folder>` | Registry location. You can also set it with `DECKTWIN_REGISTRY` |
| `--overwrite` | Replace files you have changed locally |
| `--dry-run` | Show what would be written, without writing |
| `--install` | Install missing peer dependencies with your package manager |
| `--json` | Machine-readable output for `list`, `search` and `info` |
| `--out <file>` | For `assemble`, where to write the scene. Default: `src/PlantScene.tsx` |
| `--force` | For `assemble`, write the scene even if `validate` reports errors |

## validate

`validate` runs without a browser, using `/r/index.json`. It reports:

- **Unknown components**, with close matches.
- **Duplicate tags.**
- **Malformed positions** and rotations.
- **Props** that don't exist, or that fall outside the component's range or options.
- **Line ends** that aren't `TAG.port`, or that point at a missing tag or port.
- **Size changes** between the two ends of a line.
- **Inline components** that aren't inline, meaning they have no ports `A` and `B`.
- **Process ports** left unconnected.

Every problem is reported in one run, with where it is and how to fix it. Add `--json` for a loop an agent can follow: each issue has a `level`, a stable `code`, `where`, a `path` into the file (`lines[3].from`), a `message` and a `fix`, and the result ends with `valid` and `next`.

| Exit code | Means |
|---|---|
| 0 | Valid. Warnings may remain |
| 1 | Not valid |
| 2 | Couldn't run, for example with no network. This says nothing about the file |

Ports are checked at each component's default props. Some ports exist only for some props, such as the water boot on a 3-phase separator. If an item overrides its props, a missing port is a warning rather than an error.

`validate` has no geometry, so it can't find overlaps, items standing on nothing, or line ends too close for two flanges. The last one stops a plant loading. `<Plant onReport>` and the [playground](/playground) catch those, because they measure the rendered meshes.

## Examples

```bash
npx decktwin search compressor
npx decktwin info reciprocating-compressor --json
npx decktwin add pedestal-crane deck-module
npx decktwin validate plant.json && npx decktwin assemble plant.json
```

## Where it fetches from

Each item is a JSON file in the shadcn registry-item format: `/r/<name>.json`, with the files inlined. `registryDependencies` point at other items, such as `/r/core.json`, and the CLI resolves them recursively. `/r/index.json` holds the agent index. If you self-host, run `npm run build` and serve `dist/`.
