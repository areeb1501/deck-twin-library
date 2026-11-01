// Headless stills of the twin for visual checks: node tools/snap.mjs steps.json. Each step: { name, js?, wait?, cam?: [px,py,pz,tx,ty,tz], ui? }
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
const steps = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const out = process.argv[3] ?? '/tmp/pr-shots'
const query = process.argv[4] ?? 'tick&quality=high'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
await page.goto(`http://localhost:${process.env.PORT ?? 5191}/alpha/demo/?${query}`)
await page.waitForFunction(() => !!window.__controls && !!window.__sim?.getState().result, null, { timeout: 120000 })
await page.waitForTimeout(6000)
await page.addStyleTag({ content: '.hideui body *:not(canvas){visibility:hidden} .hideui canvas{visibility:visible!important}' })
for (const s of steps) {
  await page.evaluate((ui) => document.documentElement.classList.toggle('hideui', !ui), !!s.ui)
  if (s.js) console.log(s.name ?? 'js', JSON.stringify(await page.evaluate(s.js)))
  if (s.cam) await page.evaluate((c) => window.__controls.setLookAt(...c, false), s.cam)
  await page.waitForTimeout(s.wait ?? 2500)
  if (s.name) await page.screenshot({ path: `${out}/${s.name}.jpg`, quality: 88, type: 'jpeg' })
}
if (errors.length) console.log('ERRORS', [...new Set(errors)].slice(0, 8))
await browser.close()
