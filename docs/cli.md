# CLI

The `deck-twin` CLI installs components, searches the registry, validates `plant.json` files and generates plant scenes from the command line.

> **Run the CLI from this site.** The `deck-twin` package is not yet published to npm, so run it as `npx -y https://<this site>/cli/deck-twin-0.2.2.tgz <command>`. This requires no installation and no dependencies. Where these docs show `npx deck-twin`, use this command instead. The **Copy prompt** button on the landing page already uses the full command.

`deck-twin` is a single Node script with no dependencies. It requires Node 18 or later.

```bash
npx deck-twin <command>
```

| Command | What it does |
|---|---|
| `init` | Writes `deck-twin.json` with the install directory and registry URL |
| `add <name…>` | Copies components and their dependencies (`lib/`, other components) into your project. `install` is an alias. |
| `list [category]` | Lists components by category |
| `search <words>` | Finds components by name, tag, standard or category, e.g. `search api 610` |
| `info <name>` | Shows props with ranges and defaults, ports at default props, standards and size |
| `validate <plant.json>` | Reports whether a plant is valid (see below). `check` remains available as an alias |
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

`validate` runs without a browser and uses `/r/index.json`. A file in another format, for example one with `"equipment"` or `"deck"` instead of `"items"`, stops validation with a single error. Otherwise it reports:

- **Unknown components**, with close matches.
- **Duplicate tags.**
- **Malformed positions** and rotations.
- **Props** that do not exist, or that fall outside the component's range or options.
- **Line ends** that are not `TAG.port`, or that point at a missing tag or port.
- **Inline components** that are not inline, meaning they have no ports `A` and `B`.
- **Process ports** left unconnected.

Every problem is reported in one run, with its location and how to fix it. Add `--json` for output that an agent can process in a loop: each issue has a `level`, a stable `code`, `where`, a `path` into the file (`lines[3].from`), a `message` and a `fix`, and the result ends with `valid` and `next`.

| Exit code | Means |
|---|---|
| 0 | Valid. Warnings may remain |
| 1 | Not valid |
| 2 | Could not run, for example with no network. This says nothing about the file |

Ports are checked at each component's default props. Some ports exist only for some props, such as the water boot on a 3-phase separator. If an item overrides its props, a missing port is a warning rather than an error.

`validate` has no geometry, so it cannot detect overlaps, items standing on nothing, or line ends too close for two flanges. Line ends that are too close prevent a plant from loading. `<Plant onReport>` and the [playground](/playground) detect these issues, because they measure the rendered meshes.

## Examples

```bash
npx deck-twin search compressor
npx deck-twin info reciprocating-compressor --json
npx deck-twin add pedestal-crane deck-module
npx deck-twin validate plant.json && npx deck-twin assemble plant.json
```

## Registry source

Each item is a JSON file in the shadcn registry-item format: `/r/<name>.json`, with the files inlined. `registryDependencies` point at other items, such as `/r/core.json`, and the CLI resolves them recursively. `/r/index.json` holds the agent index. To self-host, run `npm run build` and serve `dist/`.
