# Agent skill

The Deck Twin agent skill, a `SKILL.md` and reference files, lets a coding agent install components and assemble plants from engineering documents.

With the skill, a coding agent can:

- **find and install** the right component for a request ("add a seawater lift pump");
- **assemble** a complete plant from any mix of documents: P&IDs, PFDs, datasheets, equipment and line lists, plot plans, descriptions and notes. The agent extracts the equipment, maps it to components, sizes it, lays it out, connects the ports, checks the result and renders it.

The steps are explicit and every name is looked up through the CLI, so a small, inexpensive model can carry out the assembly. A larger model can prepare the equipment list.

## Install the skill

```bash
npx deck-twin skill
```

This writes `.claude/skills/deck-twin/`: `SKILL.md` plus the `references/` files. Claude Code loads skills from that location automatically.

- **Other agents (Cursor, Codex, Gemini CLI, custom agents):** run `npx deck-twin skill --dir <folder>` and point the agent at `SKILL.md`, or paste its contents into the system prompt.
- **Online copy:** [/skill/SKILL.md](/skill/SKILL.md).

## What the skill contains

| File | Purpose |
|---|---|
| `SKILL.md` | The commands, `validate`, the two workflows and the rules |
| `references/component-map.md` | Maps P&ID symbols and equipment names to registry names |
| `references/sizing.md` | Approximate rules for pressure class, line size, vessel, pump and driver sizes when the drawing does not specify them |
| `references/layout.md` | Deck levels, flow order, spacing, partners, pipe racks, cranes |
| `references/documents.md` | How to read each kind of document: drawings, lists, datasheets, plot plans and notes |
| `references/plant-json.md` | The schema, with the rules the checker and renderer enforce |
| `references/pid-symbols.md` | Generated: every component's P&ID symbol, tag letters, ISA codes and datasheet → props mapping |
| `scripts/tile.py` | Cuts large P&ID scans into legible tiles |
| `references/examples.md` | Six worked plants from basic to advanced: well pad, control room, wellhead platform, water injection module, separation train, crude export terminal |

## Reading P&IDs

The skill reads P&IDs supplied as images or PDFs.

- **Large sheets:** these are tiled first (`scripts/tile.py`).
- **Symbols:** each symbol is matched against the [P&ID symbol legend](/symbols). Process symbols follow ISO 10628-2 / PIP PIC001 conventions, instruments ISA 5.1, electrical IEC 60617, and F&G NFPA 170 / ISO 7010. The legend on the drawing always takes precedence.
- **Tags:** tag letters confirm each match.
- **Line numbers:** these set line size, service, class and insulation.
- **Datasheets:** fields map directly to props. For example, an API 610 datasheet's driver rated power sets `kw`.

Every component page shows its symbol, tag letters and datasheet mapping under **P&ID**.

## Machine-readable endpoints

| URL | Contents |
|---|---|
| `/r/index.json` | Every component with category, description, props (type, range, options), defaults, ports at defaults, bounds at defaults, standards and its P&ID entry (symbol, tags, ISA letters, datasheet → props) |
| `/symbols/legend.svg` | All P&ID symbols on one sheet, for side-by-side matching |
| `/r/<name>.json` | One item in the shadcn registry-item format, with file contents |
| `/r/<name>.md` | The component's page as Markdown: description, standards, install command, usage, props, ports, P&ID entry and source. Each component page has **Copy as Markdown** and **View as Markdown** buttons for it |
| `/llms.txt` | Short catalogue for LLM context |
| `/r/examples/*.plant.json` | The example plants |

## Prompting an inexpensive model

Provide the skill, the equipment table and one instruction:

> Follow Workflow B in SKILL.md. Use only names from `deck-twin list` and ports from `deck-twin info`. Run `deck-twin validate plant.json` after every change until it reports no errors, then run `deck-twin assemble plant.json`.

Most of the correction happens in this validation loop. Every error names the item and states what the model must change.
