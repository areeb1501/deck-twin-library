// Shared by the integration tests: runs the real CLI in throwaway folders against the registry built into public/.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
export const REGISTRY = join(ROOT, 'public')
const CLI = join(ROOT, 'cli/decktwin.mjs')
const EXAMPLES = join(ROOT, 'registry/examples')

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
export const index = readJson(join(REGISTRY, 'r/index.json'))
export const exampleNames = readdirSync(EXAMPLES).filter((f) => f.endsWith('.plant.json')).map((f) => f.replace('.plant.json', ''))
export const example = (name) => readJson(join(EXAMPLES, `${name}.plant.json`))
export const registryItem = (name) => readJson(join(REGISTRY, 'r', `${name}.json`))

export function tempDir(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'deck-twin-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

export function cli(cwd, args, { registry = REGISTRY } = {}) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, DECKTWIN_REGISTRY: registry } })
  const plain = (text) => text.replace(/\x1b\[\d+m/g, '')
  return { status, stdout: plain(stdout), stderr: plain(stderr) }
}

export const writePlant = (dir, plant, file = 'plant.json') => writeFileSync(join(dir, file), JSON.stringify(plant))

export function validate(t, plant) {
  const dir = tempDir(t)
  writePlant(dir, plant)
  const { status, stdout } = cli(dir, ['validate', 'plant.json', '--json'])
  return { status, result: JSON.parse(stdout) }
}

export function filesUnder(dir) {
  return readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, f)).isFile()).sort()
}

/** Every file a set of registry items installs, following registryDependencies: path → content. */
export function installs(names) {
  const seen = new Set()
  const files = new Map()
  const visit = (name) => {
    if (seen.has(name)) return
    seen.add(name)
    const item = registryItem(name)
    for (const f of item.files) files.set(f.path, f.content)
    for (const dep of item.registryDependencies ?? []) visit(dep.split('/').pop().replace('.json', ''))
  }
  names.forEach(visit)
  return files
}

export const componentsOf = (plant) => [...new Set([...plant.items.map((i) => i.component), ...plant.lines.flatMap((l) => (l.inline ?? []).map((v) => v.component))])]
