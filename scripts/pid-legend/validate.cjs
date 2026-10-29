// Validates registry/pid/library.json and its SVGs against the live component list.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process')
const LIB = require('node:path').join(__dirname, '../..')
const sharp = require(require.resolve('sharp', { paths: [LIB] }))
;(async () => {
  const j = JSON.parse(fs.readFileSync(path.join(LIB, 'registry/pid/library.json'), 'utf8'))
  const names = new Set(execSync(`npx tsx -e "import('./scripts/list.ts').then(async m => console.log((await m.metas()).map(x => x.name).join('\\n')))"`, { cwd: LIB }).toString().trim().split('\n'))
  console.log('components in registry:', names.size)
  const cats = new Set(j.categories.map((c) => c.id))
  const ids = new Set(); let bad = 0
  const mapped = []
  for (const s of j.symbols) {
    if (ids.has(s.id)) { console.log('DUP', s.id); bad++ }
    ids.add(s.id)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) { console.log('BAD ID', s.id); bad++ }
    if (!cats.has(s.category)) { console.log('BAD CAT', s.id); bad++ }
    const f = path.join(LIB, 'registry/pid/library', s.svg)
    if (!fs.existsSync(f)) { console.log('MISSING SVG', s.id); bad++; continue }
    const src = fs.readFileSync(f, 'utf8')
    if (/<script|href|<image|url\(|<foreignObject|on[a-z]+=/i.test(src)) { console.log('UNSAFE SVG', s.id); bad++ }
    try { await sharp(f, { density: 72 }).png().toBuffer() } catch (e) { console.log('RENDER FAIL', s.id, e.message); bad++ }
    if (s.component) { if (!names.has(s.component)) { console.log('UNKNOWN COMPONENT', s.id, s.component); bad++ } else mapped.push(s) }
    for (const k of ['name', 'standard', 'drawn', 'meaning']) if (!s[k]) { console.log('EMPTY', k, s.id); bad++ }
    if (typeof s.physical !== 'boolean') { console.log('PHYSICAL', s.id); bad++ }
  }
  const extra = fs.readdirSync(path.join(LIB, 'registry/pid/library')).filter((f) => !j.symbols.find((s) => s.svg === f))
  if (extra.length) { console.log('ORPHAN SVGS', extra); bad++ }
  const counts = {}; for (const s of j.symbols) counts[s.category] = (counts[s.category] || 0) + 1
  console.log('total', j.symbols.length, counts)
  console.log('physical', j.symbols.filter((s) => s.physical).length, 'non-physical', j.symbols.filter((s) => !s.physical).length)
  console.log('mapped', mapped.length, 'distinct components', new Set(mapped.map((s) => s.component)).size)
  const byComp = {}; for (const s of mapped) (byComp[s.component] ||= []).push(s.id)
  for (const [k, v] of Object.entries(byComp).sort()) console.log('  ' + k + ': ' + v.join(', '))
  const unmappedComps = [...names].filter((n) => !byComp[n])
  console.log('components with no symbol here:', unmappedComps.join(', '))
  console.log(bad ? `FAILED ${bad}` : 'OK')
})()
