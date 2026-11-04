// decktwin validate: example plants pass, each issue code lands on the right path, and exit codes and --json hold.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { cli, example, exampleNames, tempDir, validate, writePlant } from './helpers.mjs'

const BASE = 'separation-train'
const NO_LINE_TO_GAS = (l) => l.from !== 'V-1100.gas' && l.to !== 'V-1100.gas'

const edited = (edit) => {
  const plant = example(BASE)
  return edit(plant) ?? plant
}

function assertIssue(result, { code, level, path }) {
  const found = result.issues.find((i) => i.code === code && i.path === path)
  assert.ok(found, `no ${code} at "${path}" in ${JSON.stringify(result.issues, null, 2)}`)
  assert.equal(found.level, level)
  assert.ok(found.message)
  assert.ok(found.fix)
}

const ERRORS = [
  ['unknown-component', 'items[0].component', 'an item names a component that does not exist', (p) => { p.items[0].component = 'not-a-part' }],
  ['unknown-component', 'lines[0].inline[0].component', 'an inline entry names a component that does not exist', (p) => { p.lines[0].inline[0].component = 'not-a-part' }],
  ['no-tag', 'items[0].tag', 'an item has no tag', (p) => { delete p.items[0].tag }],
  ['no-tag', 'lines[0].tag', 'a line has no tag', (p) => { delete p.lines[0].tag }],
  ['duplicate-tag', 'items[1].tag', 'two items share a tag', (p) => { p.items[1].tag = p.items[0].tag }],
  ['duplicate-tag', 'lines[1].tag', 'two lines share a tag', (p) => { p.lines[1].tag = p.lines[0].tag }],
  ['bad-position', 'items[0].position', 'a position has two numbers', (p) => { p.items[0].position = [1, 2] }],
  ['bad-position', 'items[0].position', 'a position holds a string', (p) => { p.items[0].position = ['a', 0, 0] }],
  ['bad-rotation', 'items[0].rotation', 'a rotation is not a number', (p) => { p.items[0].rotation = '90' }],
  ['bad-end', 'lines[1].from', 'a line end has no port', (p) => { p.lines[1].from = 'V-1100' }],
  ['unknown-item', 'lines[1].from', 'a line end names a missing tag', (p) => { p.lines[1].from = 'V-9999.psv' }],
  ['unknown-port', 'lines[1].from', 'a line end names a missing port on an item at default props', (p) => { delete p.items[0].props; p.lines[1].from = 'V-1100.oil' }],
  ['two-battery-limits', 'lines[1]', 'both line ends are battery limits', (p) => { p.lines[1].from = { at: [0, 0, 0] }; p.lines[1].to = { at: [1, 0, 0] } }],
  ['bad-battery-limit', 'lines[0].from', 'a battery limit has no position', (p) => { p.lines[0].from = { label: 'FROM PIPELINE' } }],
  ['same-port', 'lines[1]', 'a line starts and ends on one port', (p) => { p.lines[1].to = p.lines[1].from }],
  ['not-inline', 'lines[0].inline[0].component', 'an inline entry has no ports A and B', (p) => { p.lines[0].inline[0].component = 'horizontal-separator' }],
  ['bad-inline-at', 'lines[0].inline[0].at', 'an inline position is past the end of the line', (p) => { p.lines[0].inline[0].at = 1.5 }],
  ['no-items', 'items', 'the plant has no items key', () => ({ name: 'Empty' })],
  ['wrong-format', '', 'the file uses "equipment"', () => ({ name: 'Other', equipment: [] })],
  ['wrong-format', '', 'the file uses "deck"', () => ({ name: 'Other', deck: {} })],
  ['wrong-format', '', 'the file is a JSON array', () => []],
]

const WARNINGS = [
  ['no-name', 'name', 'the plant has no name', (p) => { delete p.name }],
  ['unknown-key', 'valves', 'the plant has an unknown top-level key', (p) => { p.valves = [] }],
  ['unknown-key', 'items[0].type', 'an item has an unknown key', (p) => { p.items[0].type = 'vessel' }],
  ['unknown-key', 'lines[0].route', 'a line has an unknown key', (p) => { p.lines[0].route = [] }],
  ['inline-in-items', 'items[1].component', 'an inline component sits in items', (p) => { p.items[1].component = 'gate-valve' }],
  ['unknown-prop', 'items[0].props.notAProp', 'an item sets a prop the component does not have', (p) => { p.items[0].props.notAProp = 1 }],
  ['prop-range', 'items[0].props.diameter', 'a number prop is out of range', (p) => { p.items[0].props.diameter = 999 }],
  ['prop-option', 'items[0].props.service', 'a select prop is not one of its options', (p) => { p.items[0].props.service = '4-phase' }],
  ['unknown-port', 'lines[1].from', 'a line end names a missing port on an item with props', (p) => { p.lines[1].from = 'V-1100.oil' }],
  ['bad-service', 'lines[0].service', 'a line service is not in the list', (p) => { p.lines[0].service = 'crude' }],
  ['bad-line-tag', 'lines[0].tag', 'a line number is not in the standard form', (p) => { p.lines[0].tag = 'LINE ONE' }],
  ['unknown-service-code', 'lines[0].tag', 'a line number has an unrecognised service code', (p) => { p.lines[0].tag = '10"-ZZ-1001-D6A-N' }],
  ['size-mismatch', 'lines[0].tag', 'a line number size differs from the port size', (p) => { p.lines[0].tag = '12"-PM-1001-D6A-N' }],
  ['class-mismatch', 'lines[0].tag', 'a line number class is below the port rating', (p) => { p.lines[0].tag = '10"-PM-1001-A1A-N' }],
  ['open-port', 'items[0]', 'a process port is not connected', (p) => { p.lines = p.lines.filter(NO_LINE_TO_GAS) }],
]

describe('example plants', () => {
  test('the examples folder holds at least the six published plants', () => {
    assert.ok(exampleNames.length >= 6, exampleNames.join(', '))
  })

  for (const name of exampleNames)
    test(`${name} passes validate with exit 0`, (t) => {
      const { status, result } = validate(t, example(name))
      assert.equal(status, 0)
      assert.equal(result.valid, true)
      assert.equal(result.errors, 0)
    })
})

describe('plants with errors exit 1', () => {
  test('the base plant has no issues before it is edited', (t) => {
    const { status, result } = validate(t, example(BASE))
    assert.equal(status, 0)
    assert.deepEqual(result.issues, [])
  })

  for (const [code, path, when, edit] of ERRORS)
    test(`${code} when ${when}`, (t) => {
      const { status, result } = validate(t, edited(edit))
      assert.equal(status, 1)
      assert.equal(result.valid, false)
      assertIssue(result, { code, level: 'error', path })
    })
})

describe('plants with only warnings exit 0', () => {
  for (const [code, path, when, edit] of WARNINGS)
    test(`${code} when ${when}`, (t) => {
      const { status, result } = validate(t, edited(edit))
      assert.equal(status, 0)
      assert.equal(result.valid, true)
      assert.equal(result.errors, 0)
      assertIssue(result, { code, level: 'warning', path })
    })
})

describe('files that cannot be read as a plant', () => {
  test('a missing file gives no-file and exit 1', (t) => {
    const { status, stdout } = cli(tempDir(t), ['validate', 'missing.json', '--json'])
    const result = JSON.parse(stdout)
    assert.equal(status, 1)
    assert.equal(result.valid, false)
    assert.equal(result.issues[0].code, 'no-file')
  })

  test('a file that is not JSON gives bad-json and exit 1', (t) => {
    const dir = tempDir(t)
    writeFileSync(join(dir, 'plant.json'), '{ not json')
    const { status, stdout } = cli(dir, ['validate', 'plant.json', '--json'])
    const result = JSON.parse(stdout)
    assert.equal(status, 1)
    assert.equal(result.valid, false)
    assert.equal(result.issues[0].code, 'bad-json')
  })
})

describe('exit 2 when the check cannot run', () => {
  const unreachable = (t, args) => {
    const dir = tempDir(t)
    writePlant(dir, example(BASE))
    return cli(dir, ['validate', 'plant.json', ...args], { registry: join(dir, 'no-registry') })
  }

  test('--json answers valid null with the reason', (t) => {
    const { status, stdout } = unreachable(t, ['--json'])
    const result = JSON.parse(stdout)
    assert.equal(status, 2)
    assert.equal(result.valid, null)
    assert.match(result.error, /not found/)
  })

  test('text mode writes the reason to stderr', (t) => {
    const { status, stdout, stderr } = unreachable(t, [])
    assert.equal(status, 2)
    assert.equal(stdout, '')
    assert.match(stderr, /could not validate/)
  })
})

describe('--json output', () => {
  test('a result has file, valid, counts, issues and next', (t) => {
    const { result } = validate(t, example(BASE))
    assert.deepEqual(Object.keys(result), ['file', 'valid', 'errors', 'warnings', 'items', 'lines', 'issues', 'next'])
  })

  test('items and lines count what the file holds', (t) => {
    const plant = example(BASE)
    const { result } = validate(t, plant)
    assert.equal(result.items, plant.items.length)
    assert.equal(result.lines, plant.lines.length)
  })

  test('an issue has level, code, where, path, message and fix', (t) => {
    const { result } = validate(t, edited((p) => { p.items[0].component = 'not-a-part' }))
    assert.deepEqual(Object.keys(result.issues[0]), ['level', 'code', 'where', 'path', 'message', 'fix'])
    assert.equal(result.issues[0].where, 'V-1100')
  })

  test('errors and warnings count the issues by level', (t) => {
    const { result } = validate(t, edited((p) => { p.items[0].rotation = 'east'; p.items[1].rotation = 'west'; delete p.name }))
    assert.equal(result.errors, 2)
    assert.equal(result.warnings, 1)
  })

  test('one run reports every problem', (t) => {
    const { result } = validate(t, edited((p) => { p.items[0].component = 'not-a-part'; p.items[1].rotation = 'east'; p.lines[2].to = 'V-9999.inlet' }))
    assert.deepEqual(result.issues.map((i) => i.code).sort(), ['bad-rotation', 'unknown-component', 'unknown-item'])
  })

  test('next asks for fixes when there are errors', (t) => {
    const { result } = validate(t, edited((p) => { p.items[0].rotation = 'east' }))
    assert.equal(result.next, 'Fix every error, then run validate again.')
  })

  test('next asks about warnings when only warnings remain', (t) => {
    const { result } = validate(t, edited((p) => { delete p.name }))
    assert.equal(result.next, 'Valid. Fix each warning or say why it stays, then open it in the UI.')
  })

  test('next points at the UI when the plant is clean', (t) => {
    const { result } = validate(t, example(BASE))
    assert.equal(result.next, 'Valid. Open it in the UI, which also checks line clearances, overlaps and floating items.')
  })
})

describe('fix suggestions', () => {
  const fixFor = (t, component) => validate(t, edited((p) => { p.items[0].component = component })).result.issues[0].fix

  test('a typo in a component name suggests the one real name', (t) => {
    assert.match(fixFor(t, 'horizontal-separater'), /Did you mean "horizontal-separator"\?/)
  })

  test('a name that fits several parts does not pick one', (t) => {
    assert.doesNotMatch(fixFor(t, 'hp-separator'), /Did you mean/)
  })
})

describe('command forms', () => {
  test('text output names the file and its counts', (t) => {
    const dir = tempDir(t)
    const plant = example(BASE)
    writePlant(dir, plant)
    const { status, stdout } = cli(dir, ['validate', 'plant.json'])
    assert.equal(status, 0)
    assert.ok(stdout.includes(`plant.json is valid: ${plant.items.length} items, ${plant.lines.length} lines, no issues`), stdout)
  })

  test('text output counts errors and warnings on an invalid plant', (t) => {
    const dir = tempDir(t)
    writePlant(dir, edited((p) => { p.items[0].component = 'not-a-part'; delete p.name }))
    const { status, stdout } = cli(dir, ['validate', 'plant.json'])
    assert.equal(status, 1)
    assert.match(stdout, /plant\.json is not valid: 1 error\(s\), 1 warning\(s\)/)
  })

  test('validate reads plant.json when no file is named', (t) => {
    const dir = tempDir(t)
    writePlant(dir, example(BASE))
    assert.equal(JSON.parse(cli(dir, ['validate', '--json']).stdout).file, 'plant.json')
  })

  test('check is an alias for validate', (t) => {
    const dir = tempDir(t)
    writePlant(dir, example(BASE))
    assert.deepEqual(cli(dir, ['check', 'plant.json', '--json']), cli(dir, ['validate', 'plant.json', '--json']))
  })
})
