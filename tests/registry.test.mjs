// Registry integrity: the rules in AGENTS.md and docs/contributing.md, checked over every component in the built index.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { REGISTRY, ROOT, index, readJson, registryItem } from './helpers.mjs'

const REGISTRY_SOURCE = join(ROOT, 'registry')
const names = index.items.map((i) => i.name)
const sourceFile = (entry) => join(REGISTRY_SOURCE, `${entry.import.slice(2)}.tsx`)
const pid = readJson(join(REGISTRY_SOURCE, 'pid/pid.json'))

test('every component has a source file', () => {
  assert.deepEqual(index.items.filter((i) => !existsSync(sourceFile(i))).map((i) => i.name), [])
})

test('every registry item ships its source file unchanged', () => {
  const stale = index.items.filter((i) => registryItem(i.name).files[0].content !== readFileSync(sourceFile(i), 'utf8'))
  assert.deepEqual(stale.map((i) => i.name), [])
})

test('every registry dependency resolves to an item in the registry', () => {
  const known = new Set(['core', 'plant', ...names])
  const broken = index.items.filter((i) => i.registryDependencies.some((d) => !known.has(d)))
  assert.deepEqual(broken.map((i) => i.name), [])
})

test('registry.json lists core, plant and every component', () => {
  const listed = readJson(join(REGISTRY, 'r/registry.json')).items.map((i) => i.name)
  assert.deepEqual(listed, ['core', 'plant', ...names])
})

test('every component has a P&ID entry', () => {
  assert.deepEqual(names.filter((n) => !pid[n]), [])
})

test('every P&ID entry belongs to a component', () => {
  assert.deepEqual(Object.keys(pid).filter((n) => !names.includes(n)), [])
})

test('every P&ID entry has a symbol drawing on disk', () => {
  const missing = Object.entries(pid).filter(([, e]) => !existsSync(join(REGISTRY_SOURCE, 'pid/symbols', e.symbol)))
  assert.deepEqual(missing.map(([n]) => n), [])
})

test('every component names at least one standard', () => {
  const bad = index.items.filter((i) => !i.standards.length || i.standards.some((s) => !s.trim()))
  assert.deepEqual(bad.map((i) => i.name), [])
})

test('every component appears in the skill component map', () => {
  const map = readFileSync(join(ROOT, 'skill/references/component-map.md'), 'utf8')
  assert.deepEqual(names.filter((n) => !map.includes(`\`${n}\``)), [])
})
