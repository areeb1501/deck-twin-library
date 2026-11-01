// Real SAM 3.1 on the CCTV page, end to end: node tools/sam-live.mjs. Each run wakes the GPU, so it costs a little.
// Needs the twin dev server (npm run dev in alpha/, :5191) and ../modal/.env.local. Screenshot in .snaps/sam-live.jpg.
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'

mkdirSync('.snaps', { recursive: true })
const key = readFileSync('../modal/.env.local', 'utf8').match(/^DECK_TWIN_API_KEY=(.+)$/m)?.[1]
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
const sent = []
let leaked = false
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
page.on('request', (r) => {
  if (r.url().includes('/api/sam')) sent.push({ url: r.url(), method: r.method() })
  if (key && (JSON.stringify(r.headers()).includes(key) || r.url().includes(key))) leaked = true
})
page.on('response', async (r) => {
  if (key && r.url().includes('/api/sam') && (await r.text().catch(() => '')).includes(key)) leaked = true
})

let failed = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failed++
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}

await page.goto('http://localhost:5191/alpha/demo/')
await page.waitForFunction(() => !!window.__store && !!window.__sam, null, { timeout: 90000 })
await page.waitForTimeout(5000)
await page.evaluate(() => {
  window.__store.getState().setHmi('cctv')
  window.__cctv.getState().setSelected('CCTV-A02')
})
await page.click('[data-sam-toggle]')

const t0 = Date.now()
await page.waitForSelector('.cctv-tile.big [data-model-badge="sam-3.1"]', { timeout: 150000 })
console.log(`     first answer after ${((Date.now() - t0) / 1000).toFixed(1)} s`)

const state = () =>
  page.evaluate(() => {
    const sam = window.__sam.getState()
    const live = window.__cctv.getState().live
    const big = live['CCTV-A02'] ?? []
    return {
      connected: sam.connected,
      state: sam.state,
      rtt: Math.round(sam.rtt),
      gpu: sam.gpu,
      masks: sam.frames['CCTV-A02']?.masks.length ?? 0,
      kinds: big.map((d) => `${d.kind}:${d.model}${d.workerId ? `:${d.workerId}` : ''}`),
      otherModels: Object.entries(live).filter(([c]) => c !== 'CCTV-A02').flatMap(([, ds]) => ds.map((d) => d.model)),
      badges: [...document.querySelectorAll('[data-model-badge]')].map((b) => b.dataset.modelBadge),
      tag: document.querySelector('[data-sam-layer] .cctv-segtag')?.textContent,
      active: document.querySelector('[data-detector-active]')?.textContent?.slice(0, 80),
    }
  })

// a full turn round the tiles at about two frames a second, the main monitor taking half
await page.waitForFunction(() => document.querySelectorAll('[data-model-badge="sam-3.1"]').length >= 11, null, { timeout: 60000 }).catch(() => {})
await page.waitForTimeout(3000)
let s = await state()
console.log('    ', JSON.stringify({ ...s, kinds: s.kinds.length, otherModels: undefined }))
ok('the route says it is connected', s.connected === true)
ok('the main monitor is live', s.state === 'live' && s.tag?.includes('live model'), s.tag)
ok('all 11 colour cameras say SAM 3.1', s.badges.filter((b) => b === 'sam-3.1').length === 11, `${s.badges.filter((b) => b === 'sam-3.1').length} of ${s.badges.length}`)
ok('the 4 thermal cameras say SIM', s.badges.filter((b) => b === 'sim').length === 4)
ok('every badge matches its tile', await page.evaluate(() => [...document.querySelectorAll('.cctv-tile')].every((t) => (t.classList.contains('thermal') ? t.querySelector('[data-model-badge]').dataset.modelBadge === 'sim' : t.querySelector('[data-model-badge]').dataset.modelBadge === 'sam-3.1'))))
ok('thermal detections stay simulated', await page.evaluate(() => window.__cameras.filter((c) => c.type === 'thermal').every((c) => (window.__cctv.getState().live[c.id] ?? []).every((d) => d.model === 'sim'))))
ok('nothing simulated is marked as SAM on the monitor', s.kinds.every((k) => k.includes(':sam-3.1') || /^(restrictedZone|gasCloud):sim/.test(k)), s.kinds.join(' '))
ok('frames keep flowing', sent.filter((r) => r.method === 'POST').length >= 11, `${sent.length} requests`)
ok('the browser talks only to the site route', sent.every((r) => new URL(r.url).pathname === '/alpha/api/sam'))
ok('the key never reaches the browser', key && !leaked)
await page.screenshot({ path: '.snaps/sam-live.jpg', quality: 88, type: 'jpeg' })

await page.evaluate(() => window.__cctv.getState().setSelected('CCTV-A03'))
await page.waitForTimeout(3000)
s = await state()
ok('a thermal camera on the main monitor stays simulated', (await page.getAttribute('.cctv-tile.big [data-model-badge]', 'data-model-badge')) === 'sim', s.active)

await page.evaluate(() => window.__cctv.getState().setSelected('CCTV-A02'))
await page.waitForSelector('.cctv-tile.big [data-model-badge="sam-3.1"]', { timeout: 30000 })
await page.click('[data-sam-toggle]')
await page.waitForFunction(() => document.querySelectorAll('[data-model-badge="sam-3.1"]').length === 0, null, { timeout: 15000 })
await page.waitForTimeout(3000)
s = await state()
ok('switched off, every camera goes back to simulated and says so', /Twin detector/.test(s.active ?? ''), s.active)
await page.click('[data-sam-toggle]')

ok('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
process.exit(failed ? 1 : 0)
