// Generates registry/pid/symbols/*.svg and registry/pid/pid.json from p-*.ts, then validates. Run: npx tsx scripts/pid-gen/gen.mts
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const HERE = import.meta.dirname
const LIB = join(HERE, '../..')
const { metas } = await import(LIB + '/scripts/list.ts')
type Entry = { symbol?: string; standard: string; drawn: string; tags?: string[]; isa?: string[]; notes?: string; datasheet?: { form: string; fields: Record<string, string> } }
type Item = { svg?: string; e: Entry }
const parts = readdirSync(HERE).filter((f) => /^p-.*\.ts$/.test(f)).sort()
const all: Record<string, Item> = {}
for (const f of parts) {
  const m = (await import(join(HERE, f))) as { default: Record<string, Item> }
  for (const [k, v] of Object.entries(m.default)) { if (all[k]) throw new Error('dup ' + k); all[k] = v }
}

// Tag fixes: drop invented or colliding prefixes (layout-only items get no tags).
const TAGFIX: Record<string, string[] | null> = {
  'tote-tank': ['IBC'], 'fire-extinguisher': ['EXT'], 'pipe-support': null, 'pipe-clamp': ['HGR'], helideck: null, handrail: null,
  'davit-crane': ['DAV', 'CR'], door: null, window: null, room: null, desk: null, 'operator-chair': null, 'control-console': ['OWS'],
  'video-wall': null, 'system-cabinet': null, 'wall-display': null, 'cctv-camera': ['CCTV'], 'fire-alarm-panel': ['FACP', 'FGP'],
  'emergency-telephone': null, 'fire-hydrant': ['FH', 'HYD'], 'steel-column': null, 'steel-beam': null, 'module-frame': null,
  'flare-boom': null, 'flare-stack': null, 'vent-stack': ['VS'], caisson: null, 'cable-tray': null, 'shale-shaker': null,
  'lifeboat-davit': ['TEMPSC'], 'life-ring': null, 'truck-loading-bay': ['TLB'], 'deck-module': null, 'pipe-rack': null, stair: null,
  ladder: null, 'access-platform': null, jacket: null, bridge: null, 'grating-panel': null, 'shipping-container': null, 'cargo-basket': null,
  'monorail-hoist': null, 'gas-cylinder-quad': null, windsock: null, 'navigation-aid': null, 'escape-sign': null, 'lighting-mast': null,
  'e-house': ['B', 'LER'], 'analyser-shelter': ['B'], 'local-control-station': ['LCS'], 'emergency-light': null, 'pa-loudspeaker': ['SPK'],
  'alarm-beacon': null, 'heat-detector': ['HD'], 'deluge-valve-skid': ['DV'], 'electric-motor': ['PM', 'KM'], 'centrifugal-fan': ['EF', 'SF', 'FN'],
  'fired-heater': ['H'], 'electric-heater': ['H', 'EH'], 'chemical-injection-skid': ['C', 'X', 'A'], 'instrument-air-package': ['X', 'A'],
  'teg-regeneration': ['X', 'A', 'C'], 'metering-skid': ['X', 'A'], 'nitrogen-generator': ['X', 'A'], 'cartridge-filter': ['F', 'V'],
  'slug-catcher': ['V'], 'air-cooled-exchanger': ['E', 'EA', 'AC'], 'neutral-earthing-resistor': ['NER'], riser: null,
  'pig-launcher': ['L', 'PL', 'SCR'], 'choke-manifold': null, 'mud-tank': ['T'], switchgear: ['SWG', 'MCC'], transformer: ['TR', 'TX'],
  'pedestal-crane': ['CR'], 'spectacle-blind': ['SB'], 'y-strainer': ['SP', 'STR'], 'basket-strainer': ['SP', 'STR'], 'deluge-nozzle': ['NZ'],
  'small-bore-fitting': ['SW', 'THD'], 'sight-glass': ['SG'], 'marine-loading-arm': ['MLA'], 'compact-prover': ['X', 'A'],
  'wellhead-control-panel': ['X', 'WHCP'], 'smoke-detector': ['SD'], 'gas-turbine-generator': ['GT', 'G'],
  ocean: null, sky: null,
}
const NOT_ISA = new Set(['GD', 'FD', 'OGD'])
function cleanIsa(name: string, e: Entry) {
  if (!e.isa) return
  const out: string[] = []
  const notes: string[] = []
  for (const raw of e.isa) {
    for (const part of (/\(/.test(raw) ? [raw.trim()] : raw.split('/').map((x) => x.trim()))) {
      const m = /^([A-Z]+)\s*\((.+)\)$/.exec(part)
      const code = m ? m[1] : part
      if (m) notes.push(`${code} = ${m[2]}`)
      if (!/^[A-Z]{1,5}$/.test(code)) throw new Error(`${name}: bad isa ${raw}`)
      if (!NOT_ISA.has(code) && !out.includes(code)) out.push(code)
    }
  }
  e.isa = out.length ? out : undefined
  if (notes.length) e.notes = (e.notes ? e.notes + ' ' : '') + 'ISA codes here: ' + notes.join('; ') + '.'
}
const ms = await metas()
const byName = new Map(ms.map((m: any) => [m.name, m]))
const old = JSON.parse(readFileSync(join(LIB, 'registry/pid/pid.json'), 'utf8'))
const out: Record<string, Entry> = {}
const errs: string[] = []
const STATE = new Set(['open', 'running', 'cutaway', 'lit', 'doorOpen', 'doorsOpen', 'closureOpen', 'gassing', 'flutter', 'closed', 'lowered', 'level', 'opening', 'slew', 'luff', 'hook'])
for (const m of ms as any[]) {
  const it = all[m.name]
  if (!it) { if (old[m.name]) { out[m.name] = old[m.name]; continue } errs.push('missing entry: ' + m.name); continue }
  const e: Entry = { symbol: m.name + '.svg', ...it.e }
  if (m.name in TAGFIX) { const t = TAGFIX[m.name]; if (t) e.tags = t; else delete e.tags }
  cleanIsa(m.name, e)
  if (it.svg) {
    if (/script|href|<style|\sid=|<defs/i.test(it.svg)) errs.push('bad svg content ' + m.name)
    writeFileSync(join(LIB, 'registry/pid/symbols', e.symbol!), it.svg + '\n')
  } else if (!existsSync(join(LIB, 'registry/pid/symbols', e.symbol!))) errs.push('no svg ' + m.name)
  const keys = new Set(m.params.map((p: any) => p.key))
  for (const [f, k] of Object.entries(e.datasheet?.fields ?? {})) {
    if (!keys.has(k)) errs.push(`${m.name}: datasheet field "${f}" → unknown prop ${k}`)
    if (STATE.has(k)) errs.push(`${m.name}: datasheet field "${f}" → state prop ${k}`)
  }
  out[m.name] = { symbol: e.symbol!, standard: e.standard, drawn: e.drawn, ...(e.tags ? { tags: e.tags } : {}), ...(e.isa ? { isa: e.isa } : {}), ...(e.notes ? { notes: e.notes } : {}), ...(e.datasheet ? { datasheet: e.datasheet } : {}) }
}
// collision check: tag shared across categories, or tag equal to an ISA code used elsewhere
const tagOwners = new Map<string, Set<string>>(); const isaOwners = new Map<string, Set<string>>()
const catOf = new Map((ms as any[]).map((m) => [m.name, m.category]))
for (const [n, e] of Object.entries(out)) { for (const t of e.tags ?? []) { if (!tagOwners.has(t)) tagOwners.set(t, new Set()); tagOwners.get(t)!.add(n) } for (const t of e.isa ?? []) { if (!isaOwners.has(t)) isaOwners.set(t, new Set()); isaOwners.get(t)!.add(n) } }
for (const [t, ns] of tagOwners) { const cats = new Set([...ns].map((n) => catOf.get(n))); if (cats.size > 1) console.log('TAG shared across categories:', t, [...ns].join(', ')) ; const io = [...(isaOwners.get(t) ?? [])].filter((n) => !ns.has(n)); if (io.length) console.log('TAG equals ISA code used by', t, '→ tags:', [...ns].join(', '), '| isa:', io.join(', ')) }
for (const k of Object.keys(all)) if (!byName.has(k)) errs.push('entry for unknown component: ' + k)
writeFileSync(join(LIB, 'registry/pid/pid.json'), JSON.stringify(out, null, 2) + '\n')
console.log('entries', Object.keys(out).length, '/', ms.length)
const cats: Record<string, number> = {}
for (const m of ms as any[]) if (out[m.name]) cats[m.category] = (cats[m.category] ?? 0) + 1
console.log(cats)
if (errs.length) { console.log(errs.join('\n')); process.exitCode = 1 }
