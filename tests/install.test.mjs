// add, assemble, init and skill: what they write, and that --dry-run, --dir, --out and --overwrite are respected.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { REGISTRY, ROOT, cli, componentsOf, example, filesUnder, index, installs, readJson, tempDir, writePlant } from './helpers.mjs'

const DIR = 'components/deck-twin'
const PLANT = 'separation-train'
const PART = 'valves/gate-valve.tsx'
const EDIT = '// edited by hand\n'

const assembled = (t, args = [], plant = example(PLANT)) => {
  const dir = tempDir(t)
  writePlant(dir, plant)
  return { dir, plant, run: cli(dir, ['assemble', 'plant.json', ...args]) }
}

function assertInstalled(folder, names) {
  const expected = installs(names)
  assert.deepEqual(filesUnder(folder), [...expected.keys()].sort())
  for (const [path, content] of expected) assert.equal(readFileSync(join(folder, path), 'utf8'), content, path)
}

const editPart = (dir) => writeFileSync(join(dir, DIR, PART), EDIT)
const partText = (dir) => readFileSync(join(dir, DIR, PART), 'utf8')

describe('add', () => {
  test('writes the component and its dependencies, byte for byte', (t) => {
    const dir = tempDir(t)
    assert.equal(cli(dir, ['add', 'gate-valve']).status, 0)
    assertInstalled(join(dir, DIR), ['gate-valve'])
  })

  test('follows dependencies on other components', (t) => {
    const dir = tempDir(t)
    const { name } = index.items.find((i) => i.registryDependencies.length > 1)
    cli(dir, ['add', name])
    assertInstalled(join(dir, DIR), [name])
  })

  test('installs under src when the project has a src folder', (t) => {
    const dir = tempDir(t)
    mkdirSync(join(dir, 'src'))
    cli(dir, ['add', 'gate-valve'])
    assert.ok(existsSync(join(dir, 'src', DIR, PART)))
  })

  test('--dir sets the install folder', (t) => {
    const dir = tempDir(t)
    cli(dir, ['add', 'gate-valve', '--dir', 'vendor/parts'])
    assertInstalled(join(dir, 'vendor/parts'), ['gate-valve'])
  })

  test('--registry works the same as DECKTWIN_REGISTRY', (t) => {
    const dir = tempDir(t)
    assert.equal(cli(dir, ['add', 'gate-valve', '--registry', REGISTRY], { registry: join(dir, 'no-registry') }).status, 0)
    assert.ok(existsSync(join(dir, DIR, PART)))
  })

  test('--dry-run lists the files and writes nothing', (t) => {
    const dir = tempDir(t)
    const { status, stdout } = cli(dir, ['add', 'gate-valve', '--dry-run'])
    assert.equal(status, 0)
    assert.match(stdout, /dry run/)
    assert.ok(stdout.includes(join(DIR, PART)))
    assert.deepEqual(filesUnder(dir), [])
  })

  test('keeps an edited file without --overwrite and says so', (t) => {
    const dir = tempDir(t)
    cli(dir, ['add', 'gate-valve'])
    editPart(dir)
    const { status, stdout } = cli(dir, ['add', 'gate-valve'])
    assert.equal(status, 0)
    assert.match(stdout, /exists and differs, kept yours/)
    assert.equal(partText(dir), EDIT)
  })

  test('replaces an edited file with --overwrite', (t) => {
    const dir = tempDir(t)
    cli(dir, ['add', 'gate-valve'])
    editPart(dir)
    cli(dir, ['add', 'gate-valve', '--overwrite'])
    assertInstalled(join(dir, DIR), ['gate-valve'])
  })

  test('--dry-run keeps an edited file even with --overwrite', (t) => {
    const dir = tempDir(t)
    cli(dir, ['add', 'gate-valve'])
    editPart(dir)
    cli(dir, ['add', 'gate-valve', '--overwrite', '--dry-run'])
    assert.equal(partText(dir), EDIT)
  })

  test('a second run reports everything up to date', (t) => {
    const dir = tempDir(t)
    cli(dir, ['add', 'gate-valve'])
    assert.match(cli(dir, ['add', 'gate-valve']).stdout, /everything already up to date/)
  })

  test('an unknown name exits 1, suggests a close one and writes nothing', (t) => {
    const dir = tempDir(t)
    const { status, stderr } = cli(dir, ['add', 'gate-valv'])
    assert.equal(status, 1)
    assert.match(stderr, /Did you mean: .*gate-valve/)
    assert.deepEqual(filesUnder(dir), [])
  })

  test('no name exits 1', (t) => {
    assert.equal(cli(tempDir(t), ['add']).status, 1)
  })

  test('names the peer dependencies a project is missing', (t) => {
    const dir = tempDir(t)
    writeFileSync(join(dir, 'package.json'), '{}')
    assert.match(cli(dir, ['add', 'gate-valve']).stdout, /npm install three @react-three\/fiber @react-three\/drei/)
  })
})

describe('assemble', () => {
  test('writes every file the plant needs and PlantScene.tsx', (t) => {
    const { dir, plant, run } = assembled(t)
    assert.equal(run.status, 0)
    assertInstalled(join(dir, DIR), ['plant', 'core', ...componentsOf(plant)])
    assert.ok(existsSync(join(dir, 'PlantScene.tsx')))
  })

  test('PlantScene.tsx registers every component the plant uses', (t) => {
    const { dir, plant } = assembled(t)
    const scene = readFileSync(join(dir, 'PlantScene.tsx'), 'utf8')
    for (const name of componentsOf(plant)) assert.match(scene, new RegExp(`^  '${name}': `, 'm'))
  })

  test('PlantScene.tsx embeds the plant unchanged', (t) => {
    const { dir, plant } = assembled(t)
    const [, spec] = /const spec: PlantSpec = ([\s\S]*?)\n\nexport default/.exec(readFileSync(join(dir, 'PlantScene.tsx'), 'utf8'))
    assert.deepEqual(JSON.parse(spec), plant)
  })

  test('--dry-run writes nothing', (t) => {
    const { dir, run } = assembled(t, ['--dry-run'])
    assert.equal(run.status, 0)
    assert.deepEqual(filesUnder(dir), ['plant.json'])
  })

  test('--out sets where the scene goes', (t) => {
    const { dir } = assembled(t, ['--out', 'scenes/Train.tsx'])
    assert.match(readFileSync(join(dir, 'scenes/Train.tsx'), 'utf8'), /from '\.\.\/components\/deck-twin\/assembly\/plant'/)
    assert.ok(!existsSync(join(dir, 'PlantScene.tsx')))
  })

  test('writes the scene under src when the project has a src folder', (t) => {
    const dir = tempDir(t)
    mkdirSync(join(dir, 'src'))
    writePlant(dir, example(PLANT))
    cli(dir, ['assemble', 'plant.json'])
    assert.ok(existsSync(join(dir, 'src/PlantScene.tsx')))
    assert.ok(existsSync(join(dir, 'src', DIR, 'assembly/plant.tsx')))
  })

  test('an invalid plant exits 1 and writes nothing', (t) => {
    const plant = example(PLANT)
    plant.items[0].rotation = 'east'
    const { dir, run } = assembled(t, [], plant)
    assert.equal(run.status, 1)
    assert.match(run.stderr, /fix the errors above first/)
    assert.deepEqual(filesUnder(dir), ['plant.json'])
  })

  test('--force writes the scene for an invalid plant', (t) => {
    const plant = example(PLANT)
    plant.items[0].rotation = 'east'
    const { dir, run } = assembled(t, ['--force'], plant)
    assert.equal(run.status, 0)
    assert.ok(existsSync(join(dir, 'PlantScene.tsx')))
  })

  test('keeps an edited component file without --overwrite', (t) => {
    const { dir } = assembled(t)
    editPart(dir)
    assert.match(cli(dir, ['assemble', 'plant.json']).stdout, /exists and differs, kept yours/)
    assert.equal(partText(dir), EDIT)
  })

  test('replaces an edited component file with --overwrite', (t) => {
    const { dir } = assembled(t)
    editPart(dir)
    cli(dir, ['assemble', 'plant.json', '--overwrite'])
    assert.notEqual(partText(dir), EDIT)
  })
})

describe('init', () => {
  test('writes deck-twin.json with the install folder and registry', (t) => {
    const dir = tempDir(t)
    assert.equal(cli(dir, ['init']).status, 0)
    const config = readJson(join(dir, 'deck-twin.json'))
    assert.equal(config.dir, DIR)
    assert.equal(config.registry, REGISTRY)
  })

  test('leaves an existing config alone without --overwrite', (t) => {
    const dir = tempDir(t)
    writeFileSync(join(dir, 'deck-twin.json'), '{"dir":"mine"}')
    cli(dir, ['init'])
    assert.equal(readFileSync(join(dir, 'deck-twin.json'), 'utf8'), '{"dir":"mine"}')
  })

  test('add installs into the folder the config names', (t) => {
    const dir = tempDir(t)
    writeFileSync(join(dir, 'deck-twin.json'), '{"dir":"mine"}')
    cli(dir, ['add', 'gate-valve'])
    assert.ok(existsSync(join(dir, 'mine', PART)))
  })
})

describe('skill', () => {
  test('installs every file in the manifest', (t) => {
    const dir = tempDir(t)
    assert.equal(cli(dir, ['skill']).status, 0)
    const { files } = readJson(join(REGISTRY, 'skill/manifest.json'))
    assert.deepEqual(filesUnder(join(dir, '.claude/skills/deck-twin')), [...files].sort())
  })

  test('fills in the placeholders in SKILL.md', (t) => {
    const dir = tempDir(t)
    cli(dir, ['skill', '--dir', 'agent'])
    assert.doesNotMatch(readFileSync(join(dir, 'agent/SKILL.md'), 'utf8'), /\{\{(CLI|SITE)\}\}/)
  })
})

describe('command line', () => {
  test('--version matches both package.json files', (t) => {
    const version = cli(tempDir(t), ['--version']).stdout.trim()
    assert.equal(version, readJson(join(ROOT, 'package.json')).version)
    assert.equal(version, readJson(join(ROOT, 'cli/package.json')).version)
  })

  test('help names every command', (t) => {
    const { stdout } = cli(tempDir(t), ['help'])
    for (const command of ['init', 'add', 'list', 'search', 'info', 'validate', 'assemble', 'skill']) assert.match(stdout, new RegExp(`decktwin ${command}\\b`))
  })

  test('an unknown command exits 1', (t) => {
    const { status, stderr } = cli(tempDir(t), ['frobnicate'])
    assert.equal(status, 1)
    assert.match(stderr, /unknown command "frobnicate"/)
  })
})
