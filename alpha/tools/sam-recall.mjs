// How well real SAM 3.1 sees the twin's workers: node tools/sam-recall.mjs. Costs a little GPU time. Finds workers the twin
// knows are in shot, holds one still on the main monitor, compares what SAM finds, then takes their hard hat off.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

mkdirSync('.snaps', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto('http://localhost:5191/alpha/demo/')
await page.waitForFunction(() => !!window.__store && !!window.__sam && !!window.__sendWorker, null, { timeout: 90000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__sam.getState().setOn(false)
  window.__store.getState().setHmi('cctv')
})

// the twin's own detector knows who is in shot: take the biggest figure on a colour camera, and hold them there
let pick = null
for (let i = 0; i < 40 && !pick; i++) {
  await page.waitForTimeout(1000)
  pick = await page.evaluate(() => {
    const colour = window.__cameras.filter((c) => c.type !== 'thermal').map((c) => c.id)
    const all = colour.flatMap((cam) => (window.__cctv.getState().live[cam] ?? []).filter((d) => d.kind === 'person' && d.workerId).map((d) => ({ cam, id: d.workerId, h: d.box[3] - d.box[1] })))
    return all.sort((a, b) => b.h - a.h)[0] ?? null
  })
}
if (!pick) throw new Error('nobody in shot on any colour camera')
console.log('holding', JSON.stringify(pick))
await page.evaluate(({ id, cam }) => {
  const p = window.__workerPose[id]
  const tag = window.__cameras.find((c) => c.id === cam).watches[0]
  window.__sendWorker(id, [p.x, p.z], tag, 600)
  window.__cctv.getState().setSelected(cam)
  window.__sam.getState().setOn(true)
}, pick)
await page.waitForSelector('.cctv-tile.big [data-model-badge="sam-3.1"]', { timeout: 150000 })
await page.waitForTimeout(5000)

const sample = () => page.evaluate(({ cam }) => {
  const f = window.__sam.getState().frames[cam]
  const dets = window.__cctv.getState().live[cam] ?? []
  return {
    people: f?.masks.filter((m) => m.label === 'person').map((m) => `${m.workerId ?? '?'} ${m.score.toFixed(2)}`) ?? [],
    hats: f?.masks.filter((m) => m.label === 'hard hat').map((m) => m.score.toFixed(2)) ?? [],
    vests: f?.masks.filter((m) => m.label === 'high-visibility vest').map((m) => m.score.toFixed(2)) ?? [],
    alerts: dets.filter((d) => d.model === 'sam-3.1' && d.kind !== 'person').map((d) => `${d.kind}${d.workerId ? `:${d.workerId}` : ''} ${d.confidence.toFixed(2)}`),
  }
}, pick)

for (let i = 0; i < 4; i++) {
  console.log('hat on ', JSON.stringify(await sample()))
  await page.waitForTimeout(2500)
}
await page.screenshot({ path: '.snaps/sam-person.jpg', quality: 88, type: 'jpeg' })

await page.evaluate(async ({ id }) => (await import('/alpha/src/safety/workers.ts')).setPpeOverride(id, { hardHat: false }), pick)
await page.waitForTimeout(5000)
for (let i = 0; i < 4; i++) {
  console.log('hat off', JSON.stringify(await sample()))
  await page.waitForTimeout(2500)
}
await page.screenshot({ path: '.snaps/sam-no-hat.jpg', quality: 88, type: 'jpeg' })

// across every colour camera: everyone the twin knows is in shot, against the people SAM found there
const recall = await page.evaluate(() => {
  const frames = window.__sam.getState().frames
  return Object.entries(frames).map(([cam, f]) => ({ cam, sam: f.masks.filter((m) => m.label === 'person').length, named: f.masks.filter((m) => m.workerId).length, age: Math.round((performance.now() - f.at) / 1000) }))
})
console.log('per camera', JSON.stringify(recall))
await browser.close()
