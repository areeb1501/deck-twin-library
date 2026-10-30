// Saves the raw CCTV feeds as JPEGs, with no detection overlays: node tools/cctv-frames.mjs [outDir]
// These are the frames a real detector sees (modal/PLAN.md). Needs the twin dev server: npm run dev in alpha/ (:5191).
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const out = process.argv[2] ?? '.snaps/cctv'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
await page.goto('http://localhost:5191/alpha/demo/')
await page.waitForFunction(() => !!window.__store, null, { timeout: 60000 })
await page.waitForTimeout(6000)
await page.evaluate(() => window.__store.getState().setHmi('cctv'))
await page.waitForTimeout(20000)

const frames = await page.evaluate(() =>
  [...document.querySelectorAll('.hmi-body canvas')]
    .filter((c) => c.width >= 256)
    .map((c, i) => ({ i, w: c.width, h: c.height, label: c.closest('[class*="tile"], [class*="cctv"]')?.textContent?.slice(0, 40) ?? '', jpeg: c.toDataURL('image/jpeg', 0.9) })),
)
for (const f of frames) {
  const data = Buffer.from(f.jpeg.split(',')[1], 'base64')
  writeFileSync(`${out}/feed-${String(f.i).padStart(2, '0')}.jpg`, data)
  console.log(f.i, `${f.w}x${f.h}`, `${(data.length / 1024).toFixed(0)} KB`, f.label)
}
await browser.close()
