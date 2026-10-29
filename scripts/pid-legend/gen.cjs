// Generates registry/pid/library.json and registry/pid/library/*.svg for Deck Twin Library.
const fs = require('fs')
const path = require('path')
const { defs, cats } = require('./lib.cjs')
const parts = (process.env.PARTS || 'valves,piping,instruments,equipment,safety').split(',')
for (const part of parts) if (fs.existsSync(path.join(__dirname, part + '.cjs'))) require('./' + part + '.cjs')

const ROOT = require('node:path').join(__dirname, '../../registry/pid')
const OUT = path.join(ROOT, 'library')
fs.mkdirSync(OUT, { recursive: true })
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.svg')) fs.unlinkSync(path.join(OUT, f))

const seen = new Set()
const symbols = []
for (const d of defs) {
  if (seen.has(d.id)) throw new Error('duplicate id ' + d.id)
  seen.add(d.id)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id)) throw new Error('bad id ' + d.id)
  if (!cats.find((c) => c.id === d.cat)) throw new Error('bad category ' + d.cat)
  for (const k of ['name', 'std', 'drawn', 'meaning', 'svg']) if (!d[k]) throw new Error(`${d.id} missing ${k}`)
  if (typeof d.physical !== 'boolean') throw new Error(d.id + ' physical')
  fs.writeFileSync(path.join(OUT, d.id + '.svg'), d.svg + '\n')
  const s = { id: d.id, name: d.name, category: d.cat, svg: d.id + '.svg', standard: d.std, drawn: d.drawn, meaning: d.meaning, variants: d.variants || [] }
  if (d.component) s.component = d.component
  s.physical = d.physical
  s.tags = d.tags || []
  s.isa = d.isa || []
  symbols.push(s)
}
// keep category order, symbols grouped by category
const order = cats.map((c) => c.id)
symbols.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
fs.writeFileSync(path.join(ROOT, 'library.json'), JSON.stringify({ version: 1, categories: cats, symbols }, null, 2) + '\n')
const counts = {}
for (const s of symbols) counts[s.category] = (counts[s.category] || 0) + 1
console.log(symbols.length, 'symbols', counts)
