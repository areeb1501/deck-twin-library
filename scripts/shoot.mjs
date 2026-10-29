// Screenshots components or example plants in headless Chrome.
//   node scripts/shoot.mjs gate-valve centrifugal-pump      → .snaps/<name>.jpg
//   node scripts/shoot.mjs gate-valve --props '{"nps":12}'   → with prop overrides
//   node scripts/shoot.mjs gate-valve --ports --view 0,0.3,1  → port markers, camera direction
//   node scripts/shoot.mjs plant:separation-train            → example plant
//   node scripts/shoot.mjs page:/components/gate-valve [--full] → a website page
//   node scripts/shoot.mjs --all --thumbs                    → public/thumbs/*.webp + registry/generated/bounds.json
// Uses the dev server on :5190 if it is running, otherwise starts one.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined)
const thumbs = flag('--thumbs')
const props = opt('--props')
const view = opt('--view')
let names = args.filter((a, i) => !a.startsWith('--') && !['--props', '--view'].includes(args[i - 1]))

if (flag('--all')) {
  const { execSync } = await import('node:child_process')
  const out = execSync(`npx tsx -e "import('./scripts/list.ts').then(async (m) => console.log(JSON.stringify(await m.names())))"`, { cwd: root }).toString()
  names = [...JSON.parse(out.trim().split('\n').pop()), ...readdirSync(join(root, 'registry/examples')).filter((f) => f.endsWith('.plant.json')).map((f) => 'plant:' + f.replace('.plant.json', ''))]
}
if (!names.length) {
  console.log('usage: node scripts/shoot.mjs <name|plant:name>... [--props json] [--thumbs] [--all]')
  process.exit(1)
}

let base = 'http://localhost:5190'
let server
try {
  await fetch(base)
} catch {
  const { createServer } = await import('vite')
  server = await createServer({ root, server: { port: 5191 }, logLevel: 'error' })
  await server.listen()
  base = 'http://localhost:5191'
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: thumbs ? { width: 800, height: 600 } : names.some((n) => n.startsWith('page:')) ? { width: 1440, height: 900 } : { width: 1200, height: 900 }, deviceScaleFactor: 1 })
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text().slice(0, 300)))
page.on('pageerror', (e) => logs.push(e.message))
mkdirSync(join(root, '.snaps'), { recursive: true })
mkdirSync(join(root, 'public/thumbs'), { recursive: true })
const boundsFile = join(root, 'registry/generated/bounds.json')
const bounds = existsSync(boundsFile) ? JSON.parse(readFileSync(boundsFile, 'utf8')) : {}

for (const name of names) {
  logs.length = 0
  if (name.startsWith('page:')) {
    const path = name.slice(5)
    await page.goto(base + path)
    await page.waitForTimeout(6000)
    const file = join(root, '.snaps', `page${path.replace(/\//g, '_') || '_home'}.jpg`)
    writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 85, fullPage: flag('--full') }))
    console.log(`✓ ${name} → ${file.replace(root + '/', '')}${logs.length ? '\n   errors: ' + [...new Set(logs)].join(' | ') : ''}`)
    continue
  }
  const plant = name.startsWith('plant:')
  const id = plant ? name.slice(6) : name
  const q = new URLSearchParams()
  if (props) q.set('props', props)
  if (view) q.set('view', view)
  if (flag('--ports')) q.set('ports', '1')
  if (flag('--labels')) q.set('labels', '1')
  const url = `${base}/${plant ? 'shot-plant' : 'shot'}/${id}${q.size ? '?' + q : ''}`
  await page.goto(url)
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: plant ? 60000 : 30000 })
  } catch {
    console.log(`✗ ${name}: never became ready`, logs.join(' | '))
    continue
  }
  await page.waitForTimeout(plant ? 1500 : 600)
  const suffix = props || flag('--ports') || view ? '-' + (await import('node:crypto')).createHash('sha1').update(String(props) + flag('--ports') + view).digest('hex').slice(0, 6) : ''
  const file = thumbs ? join(root, 'public/thumbs', `${plant ? 'plant-' + id : id}.webp`) : join(root, '.snaps', `${plant ? 'plant-' + id : id}${suffix}.jpg`)
  const shot = await page.screenshot({ type: 'jpeg', quality: 88 })
  if (thumbs) {
    const { default: sharp } = await import('sharp').catch(() => ({ default: null }))
    if (sharp) await sharp(shot).webp({ quality: 82 }).toFile(file)
    else writeFileSync(file.replace('.webp', '.jpg'), shot)
  } else writeFileSync(file, shot)
  if (!plant) {
    const info = await page.evaluate(() => ({ bounds: window.__bounds, ports: window.__ports }))
    if (info.bounds) bounds[id] = { size: info.bounds.size.map((v) => +v.toFixed(3)), center: info.bounds.center.map((v) => +v.toFixed(3)) }
    const b = info.bounds?.size
    console.log(`✓ ${name}${b ? `  ${b.map((v) => v.toFixed(2)).join(' × ')} m (x × y × z)` : ''}  → ${file.replace(root + '/', '')}${logs.length ? '\n   errors: ' + [...new Set(logs)].join(' | ') : ''}`)
  } else {
    const issues = (await page.evaluate(() => window.__issues)) ?? []
    console.log(`✓ ${name} → ${file.replace(root + '/', '')}${logs.length ? '\n   errors: ' + [...new Set(logs)].join(' | ') : ''}`)
    for (const i of issues) console.log(`   ${i.level === 'error' ? 'error  ' : 'warning'} ${i.where}: ${i.message}`)
    if (!issues.length) console.log('   no issues')
  }
}
if (thumbs) {
  mkdirSync(dirname(boundsFile), { recursive: true })
  writeFileSync(boundsFile, JSON.stringify(bounds, null, 1))
}
await browser.close()
await server?.close()
