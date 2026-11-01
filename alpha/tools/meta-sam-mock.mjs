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
  await route.fulfill({ json: { ms: 300, outputs: prompts.map((prompt) => ({ prompt, text: prompt === 'person' || prompt === 'red valve' ? LINE : '' })) } })
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
ok('no prompt box while simulated', (await page.locator('[data-sam-typed]').count()) === 0)

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
const badges = new Set()
for (let pan = 3; pan <= 60; pan += 3) {
  await page.evaluate(({ cam, pan }) => window.__cctv.getState().setPtz(cam, { pan }), { cam: CAM, pan })
  panned.add(await picture())
  badges.add(await badge())
  await page.waitForTimeout(120)
}
ok('it stays live while the camera turns', badges.size === 1 && badges.has('sam-3.1'), [...badges].join())
ok('no simulated masks show meanwhile', (await page.locator('.cctv-tile.big .cctv-seg canvas').count()) === 0)
ok('the picture follows the pan', panned.size >= 8, `${panned.size} different pictures in 20 steps`)
ok('panning clears the old masks', (await page.locator('.cctv-tile.big .cctv-sam-mask polygon').count()) === 0)
ok('panning spends nothing', calls.length === before, `${calls.length - before} calls`)

// scroll on the main monitor: it zooms, and the page stays where it is
await page.evaluate(() => document.querySelector('.cctv-side').scrollIntoView({ block: 'end' }))
const scrolled = () => page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.scrollTop > 0 || e.scrollLeft > 0).map((e) => `${e.className}:${e.scrollTop}`).join())
await page.evaluate(() => document.querySelector('.cctv-tile.big').scrollIntoView({ block: 'center' }))
const { x, y, width, height } = await page.locator('.cctv-tile.big').boundingBox()
await page.mouse.move(x + width * 0.3, y + height * 0.5)
const zoom = () => page.evaluate((cam) => window.__cctv.getState().ptz[cam].zoom, CAM)
const [z0, s0] = [await zoom(), await scrolled()]
for (let i = 0; i < 3; i++) {
  await page.mouse.wheel(0, -100)
  await page.waitForTimeout(80)
}
const [z1, s1] = [await zoom(), await scrolled()]
ok('scrolling zooms in, by a good step', z1 / z0 > 2, `${z0.toFixed(2)} to ${z1.toFixed(2)} in three notches`)
ok('scrolling leaves the page where it is', s0 === s1, `${s0} / ${s1}`)
const tile = await page.locator('.cctv-tile:not(.big)').first().boundingBox()
await page.mouse.move(tile.x + 20, tile.y + 20)
await page.mouse.wheel(0, 300)
await page.waitForTimeout(200)
ok('the same scroll off the monitor does move the page, so that check means something', (await scrolled()) !== s1, await scrolled())
await page.evaluate(() => [...document.querySelectorAll('*')].forEach((e) => e.scrollTop && (e.scrollTop = 0)))
await page.evaluate((cam) => window.__cctv.getState().setPtz(cam, { zoom: 1 }), CAM)

await page.waitForTimeout(2500)
ok('one scan once it rests', calls.length === before + 1, `${calls.length - before} calls`)
ok('the badge says SAM again', (await badge()) === 'sam-3.1')

await page.waitForTimeout(3500)
const opacity = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.cctv-tile.big .cctv-sam-mask')).opacity))
ok('old masks fade', opacity < 0.9, `opacity ${opacity.toFixed(2)}`)

// a typed prompt: real keys, so a hotkey can't eat a letter. It goes on every scan, and its cost shows first
await page.click('[data-sam-typed-input]')
await page.keyboard.type('Red  Valve')
ok('typing stays in the box', (await page.inputValue('[data-sam-typed-input]')) === 'Red  Valve')
const typedCost = await page.textContent('[data-sam-typed]')
ok('the box says what a prompt costs', /adds 1 billed image to every scan.*\$\d/.test(typedCost), typedCost.slice(0, 90))
await page.keyboard.press('Enter')
await page.waitForSelector('[data-sam-typed-chip="red valve"]')
ok('the prompt is tidied and the box clears', (await page.inputValue('[data-sam-typed-input]')) === '')
ok('the prompt reads as not looked for yet', (await page.textContent('[data-sam-typed-chip="red valve"] b')) === '-')
await page.waitForFunction(() => document.querySelector('[data-sam-typed-chip="red valve"] b')?.textContent === '1', null, { timeout: 15000 })
ok('it is sent', calls.some((c) => c.includes('red valve')), JSON.stringify(calls.at(-1)))
ok('it draws a mask with its name', (await page.textContent('.cctv-tile.big .cctv-seg')).includes('red valve'))
await page.screenshot({ path: '.snaps/sam-typed-mock.jpg', quality: 80, type: 'jpeg' })
await page.fill('[data-sam-typed-input]', 'person')
await page.keyboard.press('Enter')
await page.waitForSelector('[data-sam-typed-why]')
ok('a built-in prompt is refused', /already/.test(await page.textContent('[data-sam-typed-why]')))
await page.fill('[data-sam-typed-input]', '')
await page.click('[data-sam-typed-remove]')
ok('removing it takes its mask at once', !(await page.textContent('.cctv-tile.big .cctv-seg')).includes('red valve'))
const after = calls.length
await page.waitForTimeout(6000)
ok('and it is not sent again', calls.length > after && !calls.slice(after).some((c) => c.includes('red valve')), JSON.stringify(calls.slice(after)))

await page.click('[data-meta-toggle]')
const off = calls.length
await page.waitForTimeout(7000)
ok('turned off, nothing more is sent', calls.length === off)
ok('turned off, the badge says SIM', (await badge()) === 'sim')
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
console.log(failed ? `${failed} failed` : 'all good')
process.exit(failed ? 1 : 0)
