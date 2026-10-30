// The validate example in skill/SKILL.md: every field it shows must be what the CLI really prints for that plant.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT, validate } from './helpers.mjs'

const skill = readFileSync(join(ROOT, 'skill/SKILL.md'), 'utf8')
const shown = JSON.parse(/```json\n([\s\S]*?)```/.exec(skill)[1])

const limit = (x) => ({ at: [x, 0, 0] })
const PLANT = {
  name: 'Example from SKILL.md',
  items: [{ tag: 'V-100', component: 'horizontal-separator', position: [0, 0, 0] }],
  lines: [
    { tag: '6"-PO-101-C3A-N', from: 'V-100.oil', to: limit(20) },
    { tag: '10"-PM-100-D6A-N', from: limit(-20), to: 'V-100.inlet' },
    { tag: '8"-PG-102-D6A-N', from: 'V-100.gas', to: limit(21) },
    { tag: '6"-PO-103-D6A-N', from: 'V-100.liquid', to: limit(22) },
    { tag: '4"-PW-104-D6A-N', from: 'V-100.water', to: limit(23) },
  ],
}

test('the fields in the SKILL.md validate example equal real output', (t) => {
  const { result } = validate(t, PLANT)
  const real = Object.fromEntries(Object.keys(shown).map((key) => [key, result[key]]))
  assert.deepEqual(real, shown)
})
