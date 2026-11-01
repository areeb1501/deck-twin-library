// "Review the last 10 s" on the real CCTV page with Meta faked, so it costs nothing: node tools/meta-review-mock.mjs. Needs the twin
// dev server (npm run dev in alpha/, :5191, or PORT=…) and ffprobe. Records real footage, checks the clip Meta would get, then
// proves one press is one request, the masks stay in step with the picture, and the live monitor is never covered.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const PORT = process.env.PORT ?? 5191
mkdirSync('.snaps', { recursive: true })
const CLIP = '.snaps/review-clip.mp4'
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
const scans = []
const clips = []
const prompts = []
const MASK = "data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x("
const STEP = 12
const person = (id, x, y) => `${id}<|box;x1=${x};y1=${y};x2=${x + 59};y2=${y + 26};w=960;h=540;c=0.9|><|mask;x=0;y=0;c=0.9;${MASK}|>`
const line = (i) => `<${i}f>${person(0, 100 + i * STEP, 250)},${person(1, 100 + i * STEP, 320)}\n`
const probe = (...args) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', ...args, CLIP], { encoding: 'utf8' }).trim()

page.on('pageerror', (e) => errors.push(e.message))
await page.route('**/api/meta-sam', async (route) => {
  const { prompts } = route.request().postDataJSON()
  scans.push(prompts)
  await route.fulfill({ json: { ms: 10, outputs: prompts.map((prompt) => ({ prompt, text: '' })) } })
})
await page.route('**/api/meta-sam-video', async (route) => {
  const { video, prompt } = route.request().postDataJSON()
  clips.push(video.slice(0, 22))
  prompts.push(prompt)
  writeFileSync(CLIP, Buffer.from(video.slice(video.indexOf(',') + 1), 'base64'))
  const frames = Number(probe('-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0').replace(',', ''))
  const events = Array.from({ length: frames }, (_, i) => line(i)).map((delta) => `data: ${JSON.stringify({ type: 'response.output_text.delta', delta })}\n\n`)
  await new Promise((done) => setTimeout(done, 800))
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `${events.join('')}data: {"type":"response.completed"}\n\n` })
})

let failed = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failed++
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}
const CAM = 'CCTV-A01'
const button = page.locator('[data-review]')
const live = () => page.evaluate(() => document.querySelector('.cctv-tile.big canvas').toDataURL('image/jpeg', 0.3).slice(-400))
const spend = () => page.textContent('[data-meta-spend]')
const dollars = async () => Number((await spend()).match(/\$([\d.]+)/)[1])

await page.goto(`http://localhost:${PORT}/alpha/demo/`)
await page.waitForFunction(() => !!window.__store && !!window.__meta && !!window.__review, null, { timeout: 90000 })
await page.waitForTimeout(5000)
await page.evaluate((cam) => {
  window.__store.getState().setHmi('cctv')
  window.__cctv.getState().setSelected(cam)
}, CAM)
await page.waitForSelector('[data-meta-key]')
await page.fill('[data-meta-key]', 'dummy-not-a-real-key-000')
await page.click('[data-meta-save]')
await page.selectOption('[aria-label="Seconds between scans"]', '20')
await page.waitForTimeout(2000)
ok('no button until the switch is on', (await button.count()) === 0)

await page.click('[data-meta-toggle]')
await page.waitForSelector('[data-review]')
ok('it waits for 10 s of footage', await button.isDisabled(), await page.textContent('[data-review-cost]'))
ok('the cost shows before the press', /at least 50 frames, about \$0\.01/.test(await page.textContent('[data-review-cost]')))
await page.waitForSelector('[data-review]:not([disabled])', { timeout: 30000 })
await page.waitForTimeout(3000)
ok('nothing is sent without a press', clips.length === 0, `${scans.length} image scans, 0 clips`)

const before = await dollars()
await button.click()
await page.waitForFunction(() => document.querySelector('[data-review]')?.textContent.includes('Tracking'), null, { timeout: 5000 })
await page.waitForSelector('[data-review-replay]', { timeout: 30000 })
ok('one press, one request', clips.length === 1, clips[0])

const format = JSON.parse(probe('-count_frames', '-show_entries', 'stream=codec_name,width,height,nb_read_frames:format=duration,format_name,size', '-of', 'json'))
const video = format.streams[0]
ok('the clip is MP4 in H.264', format.format.format_name.includes('mp4') && video.codec_name === 'h264', `${format.format.format_name} ${video.codec_name} ${video.width}x${video.height}`)
const seconds = Number(format.format.duration)
ok('the clip holds the last 10 s', seconds >= 9.5 && seconds <= 15.5, `${seconds.toFixed(1)} s`)
ok('the clip stays within the billed minimum', Number(video.nb_read_frames) <= 50, `${video.nb_read_frames} frames`)
const bytes = Number(format.format.size)
ok('the clip fits the route', (bytes * 4) / 3 < 4_000_000, `${(bytes / 1e6).toFixed(2)} MB of real footage`)

ok('the masks draw', (await page.locator('[data-review-replay] polygon').count()) > 0)
const ids = await page.locator('[data-review-replay] [data-review-track]').evaluateAll((els) => els.map((e) => e.dataset.reviewTrack))
ok('each person has their own number', ids.join() === 'person 0,person 1', ids.join())
ok('it says it is a recording', (await page.textContent('[data-review-replay]')).includes('Recorded clip, not live'))
ok('it says what was tracked', /2 people tracked/.test(await page.textContent('[data-review-summary]')))
ok('the running count went up by the price', Math.abs((await dollars()) - before - 0.01) < 0.003, await spend())
ok('the clip is counted', /\+ 1 clip/.test(await spend()))

// the fake boxes step along by frame, so a label's position says which frame it thinks is showing
const steps = await page.evaluate(async ({ step }) => {
  const v = document.querySelector('[data-review-replay] video')
  const label = () => document.querySelector('[data-review-track="person 0"]')
  v.pause()
  const out = []
  for (const at of [0.5, 2.5, 5, 7.5, Math.max(0, v.duration - 1)]) {
    v.currentTime = at
    await new Promise((done) => v.addEventListener('seeked', done, { once: true }))
    await new Promise((done) => setTimeout(done, 300))
    const x = (parseFloat(label().style.left) / 100) * 960
    out.push({ at, frame: (x - 129.5) / step })
  }
  v.play()
  return out
}, { step: STEP })
const pts = probe('-show_entries', 'packet=pts_time', '-of', 'csv=p=0').split('\n').map((t) => parseFloat(t))
// a video shows the last frame that has started
const shown = (at) => pts.findLastIndex((t) => t <= at)
const off = steps.map(({ at, frame }) => Math.abs(frame - shown(at)))
ok('the masks stay in step with the picture', off.every((d) => d < 0.5), `frames apart: ${off.map((d) => d.toFixed(1)).join(' ')}`)

const pictures = new Set()
for (let i = 0; i < 12; i++) {
  pictures.add(await live())
  await page.waitForTimeout(250)
}
ok('the monitor stays live during the replay', pictures.size > 1, `${pictures.size} different pictures in 3 s`)
ok('the replay is not on the monitor', (await page.locator('.cctv-tile [data-review-replay]').count()) === 0)
await page.screenshot({ path: '.snaps/meta-review-mock.jpg', quality: 82, type: 'jpeg' })

await page.waitForTimeout(9000)
ok('nothing more is sent after the one press', clips.length === 1)

await page.click('[data-review-close]')
ok('closing the replay is one click', (await page.locator('[data-review-replay]').count()) === 0)

// a typed prompt goes through the clip too, one billed request each, with the price on the button first
await page.fill('[data-sam-typed-input]', 'crane')
await page.keyboard.press('Enter')
await page.waitForSelector('[data-review]:not([disabled])', { timeout: 30000 })
ok('the price covers the typed prompt', /for each of person, crane.*about \$0\.02/.test(await page.textContent('[data-review-cost]')), await page.textContent('[data-review-cost]'))
prompts.length = 0
await button.click()
await page.waitForSelector('[data-review-replay]', { timeout: 60000 })
ok('one press, one request per prompt', prompts.slice().sort().join() === 'crane,person', prompts.join())
const tracks = await page.locator('[data-review-replay] [data-review-track]').evaluateAll((els) => els.map((e) => e.dataset.reviewTrack))
ok('both prompts are tracked under their own names', tracks.join() === 'person 0,person 1,crane 0,crane 1', tracks.join())
ok('it says what else was looked for', /Also looked for: crane \(2\)/.test(await page.textContent('[data-review-summary]')))
await page.click('[data-review-close]')
await page.click('[data-sam-typed-remove]')

await page.evaluate(() => window.__cctv.getState().setSelected('CCTV-A03'))
await page.waitForTimeout(1500)
if (await page.evaluate(() => window.__cameras.find((c) => c.id === 'CCTV-A03').type === 'thermal')) ok('no button for a thermal camera', (await button.count()) === 0)
await page.evaluate((cam) => window.__cctv.getState().setSelected(cam), CAM)
await page.waitForTimeout(1500)
ok('a new camera starts over', await button.isDisabled(), await page.textContent('[data-review-cost]'))

await page.click('[data-meta-toggle]')
ok('turned off, the button goes', (await button.count()) === 0)
await page.evaluate(() => {
  MediaRecorder.isTypeSupported = () => false
})
await page.click('[data-meta-toggle]')
await page.waitForTimeout(1000)
ok('no button where MP4 recording is not available', (await button.count()) === 0)
await page.click('[data-meta-toggle]')

// the real route on the dev server, with a clip it must turn down before any call to Meta
await page.unroute('**/api/meta-sam-video')
const refused = await page.evaluate(async () => {
  const r = await fetch('/alpha/api/meta-sam-video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'dummy-not-a-real-key-000', video: 'data:video/webm;base64,GkXfow==' }) })
  return r.status
})
ok('the real route refuses WebM', refused === 400, `answered ${refused}`)
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
console.log(failed ? `${failed} failed` : 'all good')
process.exit(failed ? 1 : 0)
