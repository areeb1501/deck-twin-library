// Measures the twin's cold start from the production build in ../public: serves it, loads /alpha/demo/ in headless Chrome and
// reports the loader stages, bytes fetched, long tasks and the hottest functions from a CPU profile. node tools/boot-profile.mjs [--runs 3] [--url path]
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const runs = Number(opt('--runs', 1))
const path = opt('--url', '/alpha/demo/')
const profile = !args.includes('--no-profile')
const root = opt('--root', new URL('../../public', import.meta.url).pathname)
const fresh = args.includes('--fresh')
const quiet = args.includes('--quiet')
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream' }

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p.endsWith('/')) p += 'index.html'
  const file = join(root, p)
  let st
  try { st = statSync(file) } catch { res.writeHead(404).end(); return }
  if (st.isDirectory()) { res.writeHead(302, { location: p + '/' }).end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' })
  createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
// --origin https://decktwin.com measures the live site through the CDN instead of the local build
const origin = opt('--origin', `http://127.0.0.1:${server.address().port}`)

const launch = () => chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
let browser = await launch()

for (let run = 1; run <= runs; run++) {
  if (fresh && run > 1) {
    await browser.close()
    browser = await launch()
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    const t = () => Math.round(performance.now())
    const marks = (window.__bootMarks = [])
    // time spent inside WebGL calls that can stall on the GPU process
    const gls = (window.__gl = {})
    const linkedAt = new WeakMap()
    // which programs get linked after the batcher's swap: their defines say what variant they are
    const srcOf = new WeakMap()
    const shadersOf = new WeakMap()
    const late = (window.__lateLinks = {})
    {
      const P = WebGL2RenderingContext.prototype
      const ss = P.shaderSource
      P.shaderSource = function (sh, src) { srcOf.set(sh, src); return ss.call(this, sh, src) }
      const at = P.attachShader
      P.attachShader = function (pr, sh) { (shadersOf.get(pr) ?? shadersOf.set(pr, []).get(pr)).push(sh); return at.call(this, pr, sh) }
      const lp = P.linkProgram
      const early = (window.__earlySources = new Map())
      const diffs = (window.__lateDiffs = [])
      P.linkProgram = function (pr) {
        const srcs0 = (shadersOf.get(pr) ?? []).map((sh) => srcOf.get(sh) ?? '')
        const sig = srcs0.map((x) => x.split('\n').filter((l) => l.startsWith('#define')).join(' ')).join('||')
        if (!performance.getEntriesByName('dt:batch-swap').length) {
          if (!early.has(sig)) early.set(sig, srcs0)
          if (/MeshDepthMaterial/.test(sig)) {
            const keep = /^(SHADER_TYPE|USE_BATCHING|USE_INSTANCING|USE_SKINNING|USE_MAP|DOUBLE_SIDED|FLIP_SIDED|USE_ALPHATEST|USE_ALPHAMAP|USE_SHADOWMAP|SHADOWMAP_TYPE|DEPTH_PACKING|USE_UV|USE_INSTANCING_COLOR)/
            const k = srcs0[0].split('\n').filter((l) => l.startsWith('#define')).map((l) => l.slice(8)).filter((d) => keep.test(d)).join(' ') + ' | ' + (srcs0[1].match(/#if (\d+) > 0\n\tvec4 plane/)?.[1] ?? '?') + ' planes'
            ;(window.__earlyDepth ??= {})[k] = ((window.__earlyDepth ??= {})[k] ?? 0) + 1
          }
        } else if (/MeshDepthMaterial/.test(sig) && diffs.length < 8) {
          // nearest early depth program by define set, and what differs
          const defs = (src) => new Set(src.split('\n').filter((l) => l.startsWith('#define')).map((l) => l.slice(8)))
          const lv = defs(srcs0[0]), lf = defs(srcs0[1])
          let best = null
          for (const [, e] of early) {
            if (!/MeshDepthMaterial/.test(e[0])) continue
            const ev = defs(e[0]), ef = defs(e[1])
            const d = [...lv].filter((x) => !ev.has(x)).map((x) => 'v-' + x).concat([...ev].filter((x) => !lv.has(x)).map((x) => 'v+' + x), [...lf].filter((x) => !ef.has(x)).map((x) => 'f-' + x), [...ef].filter((x) => !lf.has(x)).map((x) => 'f+' + x))
            if (!best || d.length < best.length) best = d
          }
          const planes = (src) => src.match(/#if (\d+) > 0\n\tvec4 plane/)?.[1]
          diffs.push(`late(${planes(srcs0[1])} planes) vs nearest early: ${best?.length ? best.join(' ') : 'same defines'}`)
        } else if (early.has(sig) && diffs.length < 6) {
          const e = early.get(sig)
          const out = []
          srcs0.forEach((src, i) => {
            const a = e[i].split('\n'), b = src.split('\n')
            for (let k = 0; k < Math.max(a.length, b.length) && out.length < 8; k++) if (a[k] !== b[k]) out.push(`${i ? 'frag' : 'vert'}:${k} early«${a[k]}» late«${b[k]}»`)
          })
          diffs.push(out.length ? out.join('\n      ') : 'identical source: the key differs elsewhere')
        }
        if (performance.getEntriesByName('dt:batch-swap').length) {
          const srcs = srcs0
          const keep = /^(SHADER_TYPE|USE_BATCHING|USE_INSTANCING|USE_SKINNING|USE_MAP|DOUBLE_SIDED|FLIP_SIDED|USE_ALPHATEST|USE_ALPHAMAP|USE_UV|USE_ENVMAP|USE_FOG|USE_SHADOWMAP|VERTEX_TEXTURES|USE_INSTANCING_COLOR|USE_MORPHTARGETS|USE_COLOR|USE_EMISSIVEMAP|USE_ROUGHNESSMAP|USE_METALNESSMAP|USE_NORMALMAP|USE_CLEARCOAT|FLAT_SHADED|TONE_MAPPING|DEPTH_PACKING|USE_LOGDEPTHBUF|USE_TRANSMISSION)/
          const defs = srcs[0]?.split('\n').filter((l) => l.startsWith('#define')).map((l) => l.slice(8)).filter((d) => keep.test(d)).join(' ') + ' | ' + (srcs[1]?.match(/#if (\d+) > 0\n\tvec4 plane/)?.[1] ?? '?') + ' planes fog=' + (srcs[1]?.includes('USE_FOG') ? 1 : 0)
          late[defs] = (late[defs] ?? 0) + 1
        }
        return lp.call(this, pr)
      }
    }
    for (const name of ['linkProgram', 'compileShader', 'getProgramParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'getUniformLocation', 'getActiveUniform', 'bufferData', 'texImage2D', 'getError', 'drawElements', 'multiDrawElementsWEBGL', 'drawArrays', 'readPixels', 'finish', 'flush', 'getParameter', 'getExtension']) {
      const P = WebGL2RenderingContext.prototype
      const f = P[name]
      if (!f) continue
      gls[name] = { n: 0, ms: 0 }
      P[name] = function (...a) {
        const t0 = performance.now()
        const r = f.apply(this, a)
        if (name === 'linkProgram') {
          linkedAt.set(a[0], t0)
          ;(window.__linked ??= []).push(a[0])
        }
        if (name === 'getProgramParameter' && a[1] === 0x8b86) {
          const since = t0 - (linkedAt.get(a[0]) ?? t0)
          if (since < 50) {
            const keep = /^(SHADER_TYPE|SHADER_NAME|USE_BATCHING|USE_INSTANCING|USE_SKINNING|USE_MAP|DOUBLE_SIDED|FLIP_SIDED|USE_ALPHATEST|USE_ALPHAMAP|USE_SHADOWMAP|USE_FOG|USE_ENVMAP|USE_COLOR|USE_INSTANCING_COLOR|USE_EMISSIVEMAP|FLAT_SHADED|TONE_MAPPING|USE_TRANSMISSION|STANDARD|PHYSICAL)/
            const srcs = (shadersOf.get(a[0]) ?? []).map((sh) => srcOf.get(sh) ?? '')
            const k = srcs[0]?.split('\n').filter((l) => l.startsWith('#define')).map((l) => l.slice(8)).filter((d) => keep.test(d)).join(' ') + ' | ' + (srcs[1]?.match(/#if (\d+) > 0\n\tvec4 plane/)?.[1] ?? '?') + ' planes' + (srcs[1]?.includes('#define USE_FOG') ? ' fog' : '')
            const defs = (src) => new Set((src ?? '').split('\n').filter((l) => l.startsWith('#define')).map((l) => l.slice(8)))
            const nameOf = (src) => (src ?? '').match(/#define SHADER_NAME (.*)/)?.[1] ?? ''
            const lv = defs(srcs[0]), lf = defs(srcs[1]), ln = nameOf(srcs[0])
            let best = null
            for (const pr of window.__linked ?? []) {
              if (pr === a[0] || (linkedAt.get(pr) ?? 0) > t0 - 50) continue
              const es = (shadersOf.get(pr) ?? []).map((sh) => srcOf.get(sh) ?? '')
              if (nameOf(es[0]) !== ln) continue
              const ev = defs(es[0]), ef = defs(es[1])
              const d = [...lv].filter((x) => !ev.has(x)).map((x) => 'v-' + x).concat([...ev].filter((x) => !lv.has(x)).map((x) => 'v+' + x), [...lf].filter((x) => !ef.has(x)).map((x) => 'f-' + x), [...ef].filter((x) => !lf.has(x)).map((x) => 'f+' + x))
              const pl = (srcs[1]?.match(/#if (\d+) > 0\n\tvec4 plane/)?.[1] ?? '?') + '/' + (es[1]?.match(/#if (\d+) > 0\n\tvec4 plane/)?.[1] ?? '?')
              if (!d.length && pl.split('/')[0] !== pl.split('/')[1]) d.push('planes ' + pl)
              if (!best || d.length < best.length) best = d
              if (/MeshDepthMaterial/.test(srcs[0]) && lv.has('USE_BATCHING') && ev.has('USE_BATCHING')) (window.__depthDiffs ??= []).push(`${Math.round(t0)}: ${d.join(' ') || 'same defines'} planes ${pl}`)
            }
            ;(window.__stalls ??= []).push([Math.round(t0), Math.round(performance.now() - t0), k, best ? (best.length ? best.join(' ') : 'same defines, same planes') : 'no earlier program with this name'])
          }
          const b = since < 50 ? '<50ms' : since < 500 ? '<500ms' : since < 2000 ? '<2s' : '>2s'
          const h = (gls[`uniformsQuery ${b} after link`] ??= { n: 0, ms: 0 })
          h.n++
          h.ms += performance.now() - t0
        }
        const key = name === 'getProgramParameter' ? name + ':' + ({ 0x91b1: 'completion', 0x8b86: 'uniforms', 0x8b89: 'attribs', 0x8b82: 'link' }[a[1]] ?? a[1]) : name === 'getExtension' && /parallel/.test(a[0]) ? `getExtension:${a[0]}=${r ? 'ok' : 'null'}` : name
        const s = (gls[key] ??= { n: 0, ms: 0 })
        s.n++
        s.ms += performance.now() - t0
        return r
      }
    }
    const lt = (window.__longTasks = [])
    new PerformanceObserver((l) => l.getEntries().forEach((e) => lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true })
    const watch = () => {
      const el = document.getElementById('boot-loader')
      if (!el) return requestAnimationFrame(watch)
      const stage = el.querySelector('.bl-stage')
      let last = stage?.textContent
      marks.push([t(), 'loader: ' + last])
      new MutationObserver(() => {
        if (!document.getElementById('boot-loader')) return marks.some((m) => m[1] === 'loader removed') || marks.push([t(), 'loader removed'])
        if (el.classList.contains('bl-off') && !marks.some((m) => m[1] === 'loader fading')) marks.push([t(), 'loader fading'])
        const s = stage?.textContent
        if (s !== last) marks.push([t(), 'stage: ' + (last = s)])
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
    }
    watch()
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
  const cdp = await ctx.newCDPSession(page)
  if (profile) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
    await cdp.send('Profiler.start')
  }
  const t0 = Date.now()
  await page.goto(origin + path, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.__bootMarks?.some((m) => m[1] === 'loader removed'), null, { timeout: 90_000 }).catch(() => console.log('loader never removed'))
  const total = Date.now() - t0
  if (opt('--shot', '')) {
    await page.waitForTimeout(1500)
    if (args.includes('--zoom')) {
      await page.mouse.move(820, 470)
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, -400)
        await page.waitForTimeout(120)
      }
      await page.waitForTimeout(1500)
    }
    if (args.includes('--xray')) {
      const tx = Date.now()
      await page.keyboard.press('x')
      await page.waitForTimeout(1500)
      console.log(`x-ray pressed; long tasks after: ${(await page.evaluate((t) => window.__longTasks.filter(([s]) => s > t).map(([s, d]) => `${d}@${s}`).join(' '), performance.timeOrigin ? 0 : 0))}`.replace('after: ', `after (t≈${tx - t0} ms): `))
    }
    await page.screenshot({ path: opt('--shot', ''), fullPage: false })
  }
  if (errors.length) console.log('page errors:', errors.join(' | '))
  const prof = profile ? (await cdp.send('Profiler.stop')).profile : null
  const info = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource')
    const nav = performance.getEntriesByType('navigation')[0]
    const byType = {}
    for (const r of res) {
      const ext = (r.name.split('?')[0].match(/\.(\w+)$/) || [, 'other'])[1]
      const b = (byType[ext] ??= { n: 0, bytes: 0, end: 0 })
      b.n++; b.bytes += r.encodedBodySize; b.end = Math.max(b.end, r.responseEnd)
    }
    const big = res.map((r) => ({ name: r.name.replace(/^.*\/alpha\//, ''), kb: Math.round(r.encodedBodySize / 1024), start: Math.round(r.startTime), end: Math.round(r.responseEnd) })).sort((a, b) => b.kb - a.kb).slice(0, 12)
    return { depthDiffs: window.__depthDiffs ?? [], stalls: window.__stalls ?? [], earlyDepth: window.__earlyDepth, diffs: window.__lateDiffs, late: window.__lateLinks, ext: !!document.createElement('canvas').getContext('webgl2')?.getExtension('KHR_parallel_shader_compile'), gl: window.__gl, dcl: Math.round(nav.domContentLoadedEventEnd), marks: [...window.__bootMarks, ...performance.getEntriesByType('mark').filter((m) => m.name.startsWith('dt:')).map((m) => [Math.round(m.startTime), m.name])].sort((a, b) => a[0] - b[0]), longTasks: window.__longTasks, byType, big }
  })
  console.log(`\n=== run ${run}: ${total} ms wall until the loader is gone (${path})`)
  console.log('marks:', info.marks.map(([t, m]) => `${t} ${m}`).join(' | '))
  if (!quiet) console.log('fetched:', Object.entries(info.byType).map(([k, v]) => `${k} ${v.n}× ${Math.round(v.bytes / 1024)} kB (last at ${Math.round(v.end)} ms)`).join(', '))
  if (!quiet) console.log('largest:', info.big.map((b) => `${b.name} ${b.kb} kB ${b.start}→${b.end}`).join('\n         '))
  const busy = info.longTasks.reduce((a, [, d]) => a + d, 0)
  console.log(`webgl (parallel compile ${info.ext ? 'yes' : 'NO'}):`, Object.entries(info.gl).filter(([k, v]) => v.ms > 5 || /link|compileShader|getExtension:|getProgramParameter|uniformsQuery/.test(k)).sort((a, b) => b[1].ms - a[1].ms).map(([k, v]) => `${k} ${Math.round(v.ms)} ms/${v.n}`).join(', '))
  if (args.includes('--stalls')) {
    console.log('batched depth stalls vs every earlier batched depth program:\n  ' + info.depthDiffs.slice(0, 12).join('\n  '))
    const by = new Map()
    for (const [t, ms, k, why] of info.stalls) {
      const e = by.get(k) ?? { n: 0, ms: 0, t: [], why }
      e.n++
      e.ms += ms
      e.t.push(t)
      by.set(k, e)
    }
    console.log('programs linked right before use:\n' + [...by].sort((a, b) => b[1].ms - a[1].ms).map(([k, e]) => `  ${String(Math.round(e.ms)).padStart(4)} ms ${e.n}× at ${e.t.slice(0, 4).join(',')}  ${k}\n         vs nearest earlier: ${e.why}`).join('\n'))
  }
  if (args.includes('--late')) console.log('depth variants compiled early:\n' + Object.entries(info.earlyDepth ?? {}).map(([k, n]) => `  ${n}× ${k}`).join('\n'))
  if (args.includes('--late')) console.log('late vs early with the same defines:\n  ' + (info.diffs ?? []).join('\n  ---\n  '))
  if (args.includes('--late')) console.log(`linked after swap (${Object.values(info.late).reduce((a, b) => a + b, 0)}):\n` + Object.entries(info.late).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${n}× ${k.slice(0, 700)}`).join('\n'))
  console.log(`long tasks: ${info.longTasks.length}, ${busy} ms blocked; worst ${info.longTasks.map(([s, d]) => `${d}@${s}`).sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 8).join(' ')}`)
  if (prof) {
    const self = new Map()
    const nodes = new Map(prof.nodes.map((n) => [n.id, n]))
    if (args.includes('--map')) {
      // original file:function for every frame, through the chunks' source maps
      const { TraceMap, originalPositionFor } = await import('../../node_modules/@jridgewell/trace-mapping/dist/trace-mapping.mjs')
      const maps = new Map()
      const mapOf = (url) => {
        const file = url.replace(/^.*\/assets\//, '')
        if (!maps.has(file)) {
          try {
            maps.set(file, new TraceMap(JSON.parse(readFileSync(join(root, 'alpha/assets', file + '.map'), 'utf8'))))
          } catch {
            maps.set(file, null)
          }
        }
        return maps.get(file)
      }
      for (const n of prof.nodes) {
        const f = n.callFrame
        const m = f.url && mapOf(f.url)
        if (!m) continue
        const o = originalPositionFor(m, { line: f.lineNumber + 1, column: f.columnNumber })
        if (!o.source) continue
        const src = o.source.replace(/^(\.\.\/)+/, '').replace(/^alpha\/src\//, 'src/').replace(/.*node_modules\//, 'nm:')
        f.functionName = (o.name || f.functionName || '(anon)') + ' ' + src.replace(/^src\//, '') + ':' + o.line
        f.url = ''
        f.lineNumber = -1
        f.columnNumber = -1
      }
    }
    const dt = prof.timeDeltas
    let total = 0
    prof.samples.forEach((id, i) => {
      const n = nodes.get(id)
      const f = n.callFrame
      const key = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/assets\//, '')}:${f.lineNumber}:${f.columnNumber}`
      self.set(key, (self.get(key) ?? 0) + dt[i])
      total += dt[i]
    })
    if (args.includes('--inclusive')) {
      const parent = new Map()
      for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
      const incl = new Map()
      prof.samples.forEach((id, i) => {
        const seen = new Set()
        for (let n = id; n !== undefined; n = parent.get(n)) {
          const f = nodes.get(n).callFrame
          const key = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/assets\//, '')}:${f.lineNumber}:${f.columnNumber}`
          if (seen.has(key)) continue
          seen.add(key)
          incl.set(key, (incl.get(key) ?? 0) + dt[i])
        }
      })
      if (args.includes('--map')) {
        // inclusive per original file (a sample counts once per file on its stack)
        const byFile = new Map()
        prof.samples.forEach((id, i) => {
          const seen = new Set()
          for (let n = id; n !== undefined; n = parent.get(n)) {
            const file = nodes.get(n).callFrame.functionName.split(' ').pop()?.split(':')[0] ?? ''
            if (!file || seen.has(file)) continue
            seen.add(file)
            byFile.set(file, (byFile.get(file) ?? 0) + dt[i])
          }
        })
        console.log('inclusive by file:\n' + [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, v]) => `  ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`).join('\n'))
      }
      if (opt('--callers', '')) {
        // who calls a function: inclusive time by the nearest caller frame
        const want = opt('--callers', '')
        const by = new Map()
        prof.samples.forEach((id, i) => {
          for (let n = id; n !== undefined; n = parent.get(n)) {
            const f = nodes.get(n).callFrame
            if (!f.functionName.startsWith(want)) continue
            let p = parent.get(n)
            while (p !== undefined && nodes.get(p).callFrame.functionName.startsWith(want)) p = parent.get(p)
            const k = p === undefined ? '(root)' : nodes.get(p).callFrame.functionName
            by.set(k, (by.get(k) ?? 0) + dt[i])
            break
          }
        })
        console.log(`callers of ${want}:\n` + [...by].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `  ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`).join('\n'))
      }
      const topI = [...incl].sort((a, b) => b[1] - a[1]).filter(([k]) => !/^\(root\)|^\(idle\)|^\(program\)|^\(garbage/.test(k)).slice(0, Number(opt('--inclusive', 60)))
      console.log('inclusive:\n' + topI.map(([k, v]) => `  ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`).join('\n'))
      for (const [k] of topI) {
        const m = k.match(/ (\S+):(\d+):(\d+)$/)
        if (!m) continue
        try {
          const line = readFileSync(join(root, 'alpha/assets', m[1]), 'utf8').split('\n')[Number(m[2])] ?? ''
          const col = Number(m[3])
          console.log(`  ${k}  «${line.slice(Math.max(0, col - 90), col + 110).replace(/\s+/g, ' ')}»`)
        } catch {}
      }
    }
    const top = [...self].sort((a, b) => b[1] - a[1]).filter(([k]) => !/^\(idle\)|^\(program\)|^\(garbage/.test(k)).slice(0, 30)
    const idle = self.get('(idle) :-1') ?? 0
    console.log(`profile: ${Math.round(total / 1000)} ms sampled, ${Math.round(idle / 1000)} ms idle, ${Math.round((self.get('(garbage collector) :-1') ?? 0) / 1000)} ms GC`)
    console.log(top.map(([k, v]) => `  ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`).join('\n'))
    if (args.includes('--source'))
      for (const [k] of top.slice(0, Number(opt('--source', 6)))) {
        const m = k.match(/ (\S+):(\d+):(\d+)$/)
        if (!m) continue
        try {
          const lines = readFileSync(join(root, 'alpha/assets', m[1]), 'utf8').split('\n')
          const line = lines[Number(m[2])] ?? ''
          const col = Number(m[3])
          console.log(`\n--- ${k}\n${line.slice(Math.max(0, col - 300), col + 700)}`)
        } catch {}
      }
  }
  await ctx.close()
}
await browser.close()
server.close()
