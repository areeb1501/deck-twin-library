// Crew size control, end to end: node tools/crew.mjs. Needs the twin dev server (npm run dev in alpha/, :5191).
// Clicks the Toolbar stepper up to the cap and down to one, and checks the people on deck follow it.
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
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))

let failed = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failed++
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}
const state = () =>
  page.evaluate(() => {
    const roster = window.__workers.getState().roster
    const moved = Object.values(window.__workerPose).filter((p) => p.speed > 0).length
    const by = {}
    for (const w of roster) by[`${w.platform} ${w.level}`] = (by[`${w.platform} ${w.level}`] ?? 0) + 1
    return { roster: roster.length, poses: Object.keys(window.__workerPose).length, moved, ids: roster.map((w) => w.id), by, shown: document.querySelector('[data-workers-count]')?.textContent }
  })
const clickTimes = async (sel, n) => {
  for (let i = 0; i < n; i++) await page.click(sel)
  await page.waitForTimeout(400)
}

await page.goto('http://localhost:5191/alpha/demo/')
await page.waitForFunction(() => !!window.__store && !!window.__workers, null, { timeout: 90000 })
await page.waitForTimeout(6000)

let s = await state()
ok('starts with the default crew', s.roster === 10 && s.poses === 10 && s.shown === '10', JSON.stringify(s.by))

await clickTimes('[data-workers-more]', 5)
s = await state()
ok('adding five', s.roster === 15 && s.poses === 15 && s.shown === '15')

await clickTimes('[data-workers-more]', 9)
s = await state()
ok('reaches the cap', s.roster === 24 && s.poses === 24 && s.shown === '24', JSON.stringify(s.by))
ok('plus is disabled at the cap', await page.isDisabled('[data-workers-more]'))
await page.screenshot({ path: '.snaps/crew-cap.jpg', quality: 85, type: 'jpeg' })

await page.waitForTimeout(12000)
s = await state()
ok('a full crew is walking', s.moved >= 5, `${s.moved} moving`)
const stuck = await page.evaluate(() => window.__workers.getState().roster.filter((w) => !window.__workerPose[w.id]).map((w) => w.id))
ok('everyone has a figure', stuck.length === 0, stuck.join(','))

await page.reload()
await page.waitForFunction(() => !!window.__store && !!window.__workers, null, { timeout: 90000 })
await page.waitForTimeout(6000)
s = await state()
ok('the count survives a reload', s.roster === 24 && s.shown === '24')

await clickTimes('[data-workers-less]', 23)
s = await state()
ok('down to one', s.roster === 1 && s.poses === 1 && s.ids[0] === 'w01')
ok('minus is disabled at one', await page.isDisabled('[data-workers-less]'))

// a PPE rotation wants two or three people: with one on shift it must still finish
await page.evaluate(() => window.__sim.getState().setSpeed?.(60))
await page.waitForTimeout(6000)
ok('the page still answers after PPE rotations with one worker', (await page.evaluate(() => 1 + 1)) === 2)

await page.evaluate(() => window.__store.getState().setWorkerCount(10))
await page.waitForTimeout(800)
s = await state()
ok('back to the default', s.roster === 10 && s.poses === 10)

await page.evaluate(() => window.__store.getState().setWorkerCount(999))
ok('the store clamps to the cap', (await page.evaluate(() => window.__store.getState().workerCount)) === 24)
await page.evaluate(() => window.__store.getState().setWorkerCount(10))

ok('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
process.exit(failed ? 1 : 0)
