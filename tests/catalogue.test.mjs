// list, search and info: each agrees with the registry index, and the index has one well-formed entry per component.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { REGISTRY, ROOT, cli, index, readJson, tempDir } from './helpers.mjs'

const names = index.items.map((i) => i.name)
const entry = (name) => index.items.find((i) => i.name === name)
const json = (t, args) => {
  const { status, stdout } = cli(tempDir(t), [...args, '--json'])
  assert.equal(status, 0)
  return JSON.parse(stdout)
}

function metaNames() {
  const registry = join(ROOT, 'registry')
  const metaFiles = readdirSync(registry, { recursive: true }).filter((f) => /(^|\/)_meta[^/]*\.ts$/.test(f))
  return metaFiles.flatMap((f) => [...readFileSync(join(registry, f), 'utf8').matchAll(/^\s*(?:\{ )?name: '([^']+)'/gm)].map((m) => m[1]))
}

describe('registry index', () => {
  test('has one entry for each component in the _meta files', () => {
    assert.deepEqual([...names].sort(), metaNames().sort())
  })

  test('has no duplicate names', () => {
    assert.equal(new Set(names).size, names.length)
  })

  test('puts every component in a declared category', () => {
    const categories = new Set(index.categories.map((c) => c.id))
    assert.deepEqual(index.items.filter((i) => !categories.has(i.category)).map((i) => i.name), [])
  })

  test('gives every component params with a key and a type', () => {
    const bad = index.items.filter((i) => !i.params.length || i.params.some((p) => !p.key || !p.type))
    assert.deepEqual(bad.map((i) => i.name), [])
  })

  test('gives every component a ports list of well-formed flange faces', () => {
    const wellFormed = (p) => p.id && p.position.length === 3 && p.direction.length === 3 && p.nps > 0
    const bad = index.items.filter((i) => !Array.isArray(i.ports) || !i.ports.every(wellFormed))
    assert.deepEqual(bad.map((i) => i.name), [])
  })

  test('gives every inline component ports A and B', () => {
    const inline = index.items.filter((i) => i.anchor === 'inline')
    assert.ok(inline.length > 0)
    assert.deepEqual(inline.filter((i) => !['A', 'B'].every((id) => i.ports.some((p) => p.id === id))).map((i) => i.name), [])
  })

  test('is the closed list of components in plant.schema.json', () => {
    const schema = readJson(join(REGISTRY, 'r/plant.schema.json'))
    assert.deepEqual(schema.$defs.item.properties.component.enum, [...names].sort())
  })
})

describe('list', () => {
  test('--json returns every component in index order', (t) => {
    assert.deepEqual(json(t, ['list']).map((i) => i.name), names)
  })

  test('--json gives name, title, category and description', (t) => {
    const [first] = json(t, ['list'])
    const { name, title, category, description } = index.items[0]
    assert.deepEqual(first, { name, title, category, description })
  })

  test('a category narrows the list to that category', (t) => {
    const expected = index.items.filter((i) => i.category === 'valves').map((i) => i.name)
    assert.ok(expected.length > 0)
    assert.deepEqual(json(t, ['list', 'valves']).map((i) => i.name), expected)
  })

  test('text output shows every component and the total', (t) => {
    const { stdout } = cli(tempDir(t), ['list'])
    const shown = stdout.split('\n').map((line) => line.trim().split(/\s+/)[0])
    assert.deepEqual(names.filter((n) => !shown.includes(n)), [])
    assert.match(stdout, new RegExp(`${names.length} components\\.`))
  })
})

describe('search', () => {
  test('finds every component with the word in its name', (t) => {
    const hits = json(t, ['search', 'separator']).map((h) => h.name)
    assert.deepEqual(names.filter((n) => n.includes('separator') && !hits.includes(n)), [])
  })

  test('hits carry the same title and category as the index', (t) => {
    const hits = json(t, ['search', 'separator'])
    assert.ok(hits.length > 0)
    assert.deepEqual(hits.map(({ name }) => ({ name, title: entry(name).title, category: entry(name).category })), hits)
  })

  test('several words return only the components that match them all', (t) => {
    const hitNames = (word) => json(t, ['search', word]).map((h) => h.name)
    const both = json(t, ['search', 'api', '610']).map((h) => h.name)
    const eachWord = hitNames('api').filter((n) => hitNames('610').includes(n))
    assert.ok(both.length > 0)
    assert.deepEqual([...both].sort(), eachWord.sort())
  })

  test('name and title matches come before description matches', (t) => {
    const ranks = json(t, ['search', 'separator']).map((h) => (`${h.name} ${h.title}`.toLowerCase().includes('separator') ? 1 : 0))
    assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a))
  })

  test('no match prints a message and exits 0', (t) => {
    const { status, stdout } = cli(tempDir(t), ['search', 'zzzznotaword'])
    assert.equal(status, 0)
    assert.equal(stdout.trim(), 'No matches.')
  })
})

describe('info', () => {
  const samples = index.categories.map((c) => index.items.find((i) => i.category === c.id)).filter(Boolean)

  for (const { name, category } of samples)
    test(`--json returns the index entry for ${name} (${category})`, (t) => {
      assert.deepEqual(json(t, ['info', name]), entry(name))
    })

  test('text output shows the import, props and ports', (t) => {
    const { stdout } = cli(tempDir(t), ['info', 'gate-valve'])
    assert.match(stdout, /import \{ GateValve \} from '\.\/valves\/gate-valve'/)
    assert.match(stdout, /^props$/m)
    assert.match(stdout, /^ports /m)
  })

  test('an unknown name exits 1 and suggests a close one', (t) => {
    const { status, stderr } = cli(tempDir(t), ['info', 'gate-valv'])
    assert.equal(status, 1)
    assert.match(stderr, /Did you mean: .*gate-valve/)
  })
})
