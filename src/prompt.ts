// The copy-paste prompt that sets up Deck Twin in any coding agent. Plain text, no DOM: also written to /prompt.md at build.

export const cliCommand = (site: string) => `npx -y ${site}/cli/deck-twin.tgz`

export function agentPrompt(site: string) {
  const cli = cliCommand(site)
  return `You are setting up **Deck Twin** in this project and then using it to build what I ask for. Deck Twin is a registry of standards-based three.js / React Three Fiber components for oil & gas plants and digital twins: vessels, pumps, compressors, valves, piping, instruments, F&G devices, decks, jackets, cranes, control rooms and packages. Components are copied into the project as source files, and whole plants are described in a plant.json and rendered by <Plant>.

Site: ${site}
Docs: ${site}/docs
Agent skill: ${site}/skill/SKILL.md
Machine index of every component: ${site}/r/index.json

**Running the CLI.** In this session, \`deck-twin\` means \`${cli}\`. It needs no install and no dependencies. Run every command below with it, for example \`${cli} list\`.

## 1. Set up (do this once, then tell me what you did)

1. Look at the project.
   - It needs React and a bundler (Vite, Next.js…).
   - If there is no project, create one: \`npm create vite@latest twin -- --template react-ts\`, then \`cd twin\` and \`npm install\`.
2. Install the 3D stack:
   - \`npm install three @react-three/fiber @react-three/drei\`
   - \`npm install -D @types/three\`
3. Configure the components: \`deck-twin init\`. Components go to \`src/components/deck-twin/\`; the shared \`lib/\` comes with the first one.
4. Install the agent skill: \`deck-twin skill\`. It writes \`.claude/skills/deck-twin/\`. If you are not Claude Code, read ${site}/skill/SKILL.md and every file in its references/ folder now, and follow them as your instructions for this work.
5. Smoke test.
   - Run \`deck-twin add gate-valve\`.
   - Render it in a full-screen \`<Canvas shadows>\`, wrapped in \`<Stage>\` from \`src/components/deck-twin/lib/stage\`, with \`<OrbitControls makeDefault />\`.
   - Run the type-checker and the dev server, and confirm it renders.

## 2. Do the work

**Adding equipment.** Follow Workflow A in SKILL.md:
1. \`deck-twin search <words>\`
2. \`deck-twin info <name>\`
3. \`deck-twin add <name>\`
4. Use it with props in metres, \`nps\` in inches and \`rating\` as the ASME class.

**Building a plant from P&IDs, a PFD, an equipment list or a description.** Follow Workflow B in SKILL.md:
1. Tile large drawings with \`scripts/tile.py\`.
2. Read the drawing's own legend first, then match symbols with \`references/pid-legend.md\` and \`references/pid-symbols.md\`. Tag letters decide when a shape is ambiguous. Skip logical items: DCS/PLC bubbles, signal lines, notes.
3. Make the equipment table, then map each row to a component with \`references/component-map.md\`.
4. Size anything the drawing leaves out with \`references/sizing.md\`, and lay it out with \`references/layout.md\`.
5. Write plant.json (schema: \`references/plant-json.md\`; patterns: \`references/examples.md\`). There is one format: \`"items"\` and \`"lines"\`, built from registry components. Never use \`"equipment"\`, \`"deck"\`, \`"nozzles"\` or \`"version"\`. JSON Schema: ${site}/r/plant.schema.json.
   - Put line numbers in each line's \`tag\`. Size, service, class and insulation are read from them.
   - Use battery limits \`{ "at": [x, y, z] }\` for lines that leave the drawing.
6. Run \`deck-twin check plant.json\` and fix every error. Repeat until it is clean.
7. Run \`deck-twin assemble plant.json\`. It installs everything and writes \`src/PlantScene.tsx\`.
8. Render it and read the \`onReport\` issues (overlaps, items standing on nothing). Fix them and render again.

## Rules

- **One plant format.** plant.json follows \`references/plant-json.md\` exactly, and it isn't done until \`deck-twin check\` is clean.
- **Names come from the CLI.** Use only component names from \`deck-twin list\` or \`search\`, and only props and port ids from \`deck-twin info <name>\`. Never invent them.
- **Units:** metres, degrees, NPS in inches, ASME class numbers.
- **Everything is wired.** Wire every process item in flow order. Nothing is decorative, unconnected or floating.
- **Don't fork components.** Don't edit component files to make something fit. Use props, rotation, position or another component.
- **Stay honest.** The geometry is generic, sized from public standards, and not vendor CAD. Don't claim a model matches a manufacturer's product or a real asset exactly.
- **Report back:** what you built, every assumption (sizes, substitutions, positions), and any warnings that remain.

## What I want

<Describe the plant, or attach the P&IDs, datasheets or equipment list here.>
`
}
