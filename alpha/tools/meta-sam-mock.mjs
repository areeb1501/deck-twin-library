// The Meta key path on the real CCTV page with Meta faked, so it costs nothing: node tools/meta-sam-mock.mjs. Needs the twin dev
// server (npm run dev in alpha/, :5191). Proves the video keeps moving while SAM is on, and that panning spends nothing.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

mkdirSync('.snaps', { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
const calls = []
const LINE = "<0f>0<|box;x1=430;y1=250;x2=489;y2=276;w=960;h=540;c=0.91|><|mask;x=0;y=0;c=0.91;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>\n"
page.on('pageerror', (e) => errors.push(e.message))
await page.route('**/api/meta-sam', async (route) => {
  const { prompts } = route.request().postDataJSON()
  calls.push(prompts)
  await new Promise((done) => setTimeout(done, 300))
  await route.fulfill({ json: { ms: 300, outputs: prompts.map((prompt) => ({ prompt, text: prompt === 'person' ? LINE : '' })) } })
})

let failed = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failed++
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}
const CAM = 'CCTV-A01'
const badge = () => page.getAttribute('.cctv-tile.big [data-model-badge]', 'data-model-badge')
const picture = () => page.evaluate(() => document.querySelector('.cctv-tile.big canvas').toDataURL('image/jpeg', 0.3).slice(-400))

await page.goto('http://localhost:5191/alpha/demo/')
await page.waitForFunction(() => !!window.__store && !!window.__sam && !!window.__meta, null, { timeout: 90000 })
await page.waitForTimeout(5000)
await page.evaluate((cam) => {
  window.__store.getState().setHmi('cctv')
  window.__cctv.getState().setSelected(cam)
}, CAM)
await page.waitForSelector('[data-meta-key]')
await page.waitForTimeout(3000)
ok('nothing is sent before it is turned on', calls.length === 0)

await page.fill('[data-meta-key]', 'dummy-not-a-real-key-000')
await page.click('[data-meta-save]')
await page.click('[data-meta-toggle]')
await page.waitForSelector('.cctv-tile.big [data-model-badge="sam-3.1"]', { timeout: 15000 })
ok('the first scan goes up', (await page.locator('.cctv-tile.big .cctv-sam-mask polygon').count()) > 0, `${calls.length} call`)
ok('no still covers the video', (await page.locator('.cctv-sam-frame, .cctv-tile.big .cctv-seg img').count()) === 0)
await page.screenshot({ path: '.snaps/meta-sam-mock.jpg', quality: 80, type: 'jpeg' })

// hold still: the picture must keep updating between scans
const held = new Set()
for (let i = 0; i < 12; i++) {
  held.add(await picture())
  await page.waitForTimeout(250)
}
ok('between scans the video stays live', held.size > 1, `${held.size} different pictures in 3 s`)

// pan: the picture must follow, and nothing may be spent
const before = calls.length
const panned = new Set()
for (let pan = 3; pan <= 60; pan += 3) {
  await page.evaluate(({ cam, pan }) => window.__cctv.getState().setPtz(cam, { pan }), { cam: CAM, pan })
  panned.add(await picture())
  await page.waitForTimeout(120)
}
ok('the picture follows the pan', panned.size >= 8, `${panned.size} different pictures in 20 steps`)
ok('panning clears the old masks', (await page.locator('.cctv-tile.big .cctv-sam-mask polygon').count()) === 0)
ok('panning spends nothing', calls.length === before, `${calls.length - before} calls`)

await page.waitForTimeout(2500)
ok('one scan once it rests', calls.length === before + 1, `${calls.length - before} calls`)
ok('the badge says SAM again', (await badge()) === 'sam-3.1')

await page.waitForTimeout(3500)
const opacity = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.cctv-tile.big .cctv-sam-mask')).opacity))
ok('old masks fade', opacity < 0.9, `opacity ${opacity.toFixed(2)}`)

await page.click('[data-meta-toggle]')
const off = calls.length
await page.waitForTimeout(7000)
ok('turned off, nothing more is sent', calls.length === off)
ok('turned off, the badge says SIM', (await badge()) === 'sim')
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
console.log(failed ? `${failed} failed` : 'all good')
process.exit(failed ? 1 : 0)
