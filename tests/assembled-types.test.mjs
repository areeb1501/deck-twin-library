// Assembled plants compile: every example goes through `assemble`, then the repo's TypeScript checks the result in strict mode.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT, cli, example, exampleNames, filesUnder, tempDir, writePlant } from './helpers.mjs'

const TSC = join(ROOT, 'node_modules/typescript/bin/tsc')
const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2023', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ['**/*.ts', '**/*.tsx'],
}

test('every assembled example type-checks under strict tsc', (t) => {
  const project = tempDir(t)
  symlinkSync(join(ROOT, 'node_modules'), join(project, 'node_modules'), 'dir')
  writeFileSync(join(project, 'tsconfig.json'), JSON.stringify(TSCONFIG))
  for (const name of exampleNames) {
    const dir = join(project, name)
    mkdirSync(dir)
    writePlant(dir, example(name))
    assert.equal(cli(dir, ['assemble', 'plant.json']).status, 0, name)
    assert.ok(filesUnder(dir).includes('PlantScene.tsx'), name)
  }
  const { status, stdout } = spawnSync(process.execPath, [TSC, '-p', project], { encoding: 'utf8' })
  assert.equal(stdout, '')
  assert.equal(status, 0)
})
