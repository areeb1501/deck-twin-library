// Plant data checks in headless Chrome against the dev server: schema validation, piping build,
// pipe-vs-pipe and pipe-vs-equipment clashes, overlapping equipment footprints and non-orthogonal
// routes. Usage: node tools/clash.mjs [plantModule=/src/model/plant.ts] [--from N] (only check lines from index N)
import { chromium } from 'playwright-core'
const mod = process.argv.find((a) => a.startsWith('/alpha/src/')) ?? '/alpha/src/model/plant.ts'
const fromArg = process.argv.indexOf('--from')
const from = fromArg > 0 ? Number(process.argv[fromArg + 1]) : 0
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
await page.goto('http://localhost:5196/alpha/demo/?nofx&noenv')
await page.waitForFunction(() => !!window.__store, null, { timeout: 60000 })
const out = await page.evaluate(async ([mod, from]) => {
  const { plant } = await import(mod)
  const { validatePlant } = await import('/alpha/src/state/plantStore.ts')
  const { buildPiping } = await import('/alpha/src/scene/piping/build.ts')
  const { pipeOD } = await import('/alpha/src/model/catalog.ts')
  const { footprints } = await import('/alpha/src/model/footprint.ts')
  const { labelHeight } = await import('/alpha/src/ui/labels.tsx')
  const { walkLevels, levelAt } = await import('/alpha/src/scene/Walk.tsx')
  const levels = walkLevels(plant)
  // each item stands on a floor (walk level); it occupies floor … top of its label
  const lvl = (e) => levelAt(levels, e.position[1])
  const span = (e) => [e.kind === 'proxy' ? e.position[1] : levels[lvl(e)].y, labelHeight(e) - 1.0]
  const r = { counts: { equipment: plant.equipment.length, lines: plant.lines.length, valves: plant.valves.length, instruments: plant.instruments.length } }
  r.schema = validatePlant(plant)
  try { buildPiping(plant); r.build = 'ok' } catch (e) { r.build = e.message }
  const check = new Set(plant.lines.slice(from).map((l) => l.tag))
  r.nonOrthogonal = plant.lines.filter((l) => check.has(l.tag) && l.route.some((p, i) => i && [0, 1, 2].filter((k) => Math.abs(p[k] - l.route[i - 1][k]) > 1e-3).length > 1)).map((l) => l.tag)
  const segs = []
  for (const l of plant.lines) for (let i = 0; i < l.route.length - 1; i++) segs.push({ l, a: l.route[i], b: l.route[i + 1], r: pipeOD(l.nps) / 2 + (l.insulation ? 0.06 : 0) })
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const segDist = (p1, q1, p2, q2) => {
    const d1 = sub(q1, p1), d2 = sub(q2, p2), w = sub(p1, p2)
    const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, w), c = dot(d1, w), b = dot(d1, d2), den = a * e - b * b
    let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0
    let t = (b * s + f) / e
    if (t < 0) (t = 0), (s = Math.min(1, Math.max(0, -c / a)))
    else if (t > 1) (t = 1), (s = Math.min(1, Math.max(0, (b - c) / a)))
    return Math.hypot(...sub([p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t]))
  }
  const teeOf = (e) => ('line' in e ? e.line : null)
  // continuation across a model boundary: one line's open end IS the other's (e.g. Alpha's export header meets
  // RP's import line at the west-bridge tie-in) — a butt-welded / spec-break joint, not a clash
  const ends = (l) => [l.route[0], l.route[l.route.length - 1]]
  const butt = (a, b) => ends(a).some((p) => ends(b).some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-3))
  const joined = (a, b) => teeOf(a.from) === b.tag || teeOf(a.to) === b.tag || teeOf(b.from) === a.tag || teeOf(b.to) === a.tag || butt(a, b)
  const pipe = new Set()
  for (const s1 of segs) {
    if (!check.has(s1.l.tag)) continue
    for (const s2 of segs) {
      if (s1.l === s2.l || joined(s1.l, s2.l) || (check.has(s2.l.tag) && s2.l.tag < s1.l.tag)) continue
      const d = segDist(s1.a, s1.b, s2.a, s2.b)
      if (d < s1.r + s2.r + 0.03) pipe.add(`${s1.l.tag} × ${s2.l.tag} (${d.toFixed(2)} m)`)
    }
  }
  r.pipeClashes = [...pipe]
  // a PSV's discharge starts on its own vessel
  const psvHost = new Map(plant.valves.filter((v) => v.mount).map((v) => [v.line, v.mount.equipment]))
  const fps = footprints(plant.equipment, 0)
  const eqHits = new Set()
  for (const s1 of segs) {
    if (!check.has(s1.l.tag)) continue
    const own = new Set([s1.l.from, s1.l.to].filter((e) => 'equipment' in e).map((e) => e.equipment))
    if (psvHost.has(s1.l.tag)) own.add(psvHost.get(s1.l.tag))
    plant.equipment.forEach((e, k) => {
      if (own.has(e.tag) || e.kind === 'proxy') return
      const f = fps[k]
      const [y0, y1] = span(e)
      for (let s = 0.05; s < 1; s += 0.05) {
        const p = [0, 1, 2].map((i) => s1.a[i] + (s1.b[i] - s1.a[i]) * s)
        if (p[0] > f.x0 && p[0] < f.x1 && p[2] > f.z0 && p[2] < f.z1 && p[1] > y0 && p[1] < y1) {
          eqHits.add(`${s1.l.tag} through ${e.tag} at (${p.map((v) => v.toFixed(1)).join(', ')})`)
          break
        }
      }
    })
  }
  r.equipmentClashes = [...eqHits]
  r.overlappingEquipment = []
  for (let i = 0; i < fps.length; i++)
    for (let j = i + 1; j < fps.length; j++) {
      const a = fps[i], b = fps[j]
      const ei = plant.equipment[i], ej = plant.equipment[j]
      if (ei.kind === 'proxy' || ej.kind === 'proxy' || lvl(ei) !== lvl(ej)) continue
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) r.overlappingEquipment.push(`${plant.equipment[i].tag} / ${plant.equipment[j].tag}`)
    }
  return r
}, [mod, from])
console.log(JSON.stringify(out, null, 1))
await browser.close()
