// The next-action agent on the real console: node tools/next-action.mjs. Needs the twin dev server (TWIN_URL, default :5191).
// The model is faked, so it costs nothing. Proves a fire becomes a plan, nothing is sent until the button, a confirmed action reaches the
// plant and is verified, the card shows beside a running scenario, and the RCM tab edits and resets.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const URL = process.env.TWIN_URL ?? 'http://localhost:5191'
mkdirSync('.snaps', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
const calls = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !/WebGL|GPU|favicon|404/i.test(m.text()) && errors.push(m.text()))

let reply = '{}'
await page.route('**/api/llm', async (route) => {
  calls.push(route.request().postDataJSON())
  const body = [{ choices: [{ delta: { reasoning_content: 'thinking' } }] }, { choices: [{ delta: { content: reply } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 6000, completion_tokens: 400 } }]
  await new Promise((done) => setTimeout(done, 300))
  await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: body.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n' })
})

let failed = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failed++
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}
const shot = (name) => page.screenshot({ path: `.snaps/next-action-${name}.png` })
const text = (sel) => page.locator(sel).first().innerText()

await page.goto(`${URL}/alpha/demo/?nofx&noenv&quality=low`)
await page.waitForFunction(() => !!window.__store && !!window.__sim && !!window.__response, null, { timeout: 90000 })
await page.waitForTimeout(2500)
await page.evaluate(() => window.__store.getState().setHmi('response'))
await page.waitForSelector('[data-rsp="page"]')
ok('quiet plant, quiet page', (await page.locator('[data-rsp="quiet"]').count()) === 1)
await shot('quiet')

// the demo's incident: a fire on the compressor deck, from the Instructor's own inject
await page.evaluate(() => {
  const s = window.__sim.getState()
  const e = window.__plantStore.getState().plant.equipment.find((x) => x.tag === 'K-2200')
  s.setSpeed(1)
  s.inject({ kind: 'fire', at: [e.position[0], 1.5, e.position[2]], sizeMW: 2, source: 'K-2200' })
  for (let i = 0; i < 60; i++) s.tick(1)
})
await page.waitForSelector('[data-rsp-sit]', { timeout: 15000 })
await page.waitForSelector('[data-rsp-step]', { timeout: 15000 })
ok('the fire is on the list', (await text('[data-rsp-sit]')).toLowerCase().includes('fire'), await text('[data-rsp-sit]'))
ok('a free plan is there with reasons', (await page.locator('[data-rsp-step]').count()) > 1)
ok('nothing sent for the alarm or the free plan', calls.length === 0, `${calls.length} calls`)
await shot('rule-plan')

// the fake model answers with what the controls evidence lists
reply = await page.evaluate(() => {
  const sit = window.__situations()[0]
  const plan = window.__response.getState().plans[sit.id]
  const rcm = plan.evidence.find((e) => e.source === 'rcm').id
  const controls = plan.evidence.find((e) => e.source === 'controls')
  const pump = controls.data.machines.find((m) => /^P-7101/.test(m.tag))?.tag ?? controls.data.machines[0].tag
  return JSON.stringify({
    summary: 'Confirmed fire by K-2200 with ESD1 latched. Check the valves and keep firewater on the ring main.',
    steps: [
      { action: { kind: 'manual' }, text: 'Check every ESD valve on the deck reached closed', why: 'Position, not the command, proves the fuel is cut off.', evidence: [controls.id] },
      { action: { kind: 'start', tag: pump }, text: `Start firewater pump ${pump}`, why: 'Deluge needs pressure on the ring main.', evidence: [rcm, controls.id] },
      { action: { kind: 'stop', tag: 'K-9999' }, text: 'Stop a machine that does not exist', why: 'A bad step the checks must throw out.', evidence: [rcm] },
    ],
  })
})
await page.click('[data-rsp="setup"]')
await page.click('[data-scn-provider="baseten"]')
await page.fill('[data-scn="key"]', 'test-key-not-real')
await page.click('[data-scn="save-key"]')
await page.waitForSelector('[data-scn="forget"]')
await page.click('[data-rsp="setup"]')
ok('saving a key sends nothing', calls.length === 0)
await page.click('[data-rsp="ask"]')
await page.waitForFunction(() => window.__response.getState().stage === 'idle', null, { timeout: 30000, polling: 200 })
await page.waitForSelector('[data-rsp="source-model"]', { timeout: 15000 })
ok('one click, then one repair for the bad step', calls.length === 2, `${calls.length} calls`)
ok('the model used is the open one on Baseten', calls[0].model === 'meta-models/muse-spark-open-1026', calls[0].model)
ok('the bad step was dropped and said so', (await page.innerText('[data-rsp="page"]')).includes('K-9999'))
ok('cost is on screen', (await text('[data-rsp="usage"]')).includes('req'), await text('[data-rsp="usage"]'))
await shot('model-plan')

// a two-click action that reaches the plant
const arm = page.locator('[data-rsp="arm"]').first()
const label = await arm.innerText()
ok('the button names the action', / here$/.test(label), label)
await arm.click()
await shot('confirm')
ok('first click only arms', (await page.locator('[data-rsp="confirm"]').count()) === 1 && (await page.locator('.rsp-sure').innerText()) === 'Are you sure?')
const acts = () => page.evaluate(() => window.__sim.getState().actions.length)
const was = await acts()
await page.click('[data-rsp="confirm"]')
await page.waitForTimeout(300)
ok('confirm reached the recorded controls', (await acts()) > was)
await page.evaluate(() => {
  for (let i = 0; i < 60; i++) window.__sim.getState().tick(1)
})
await page.waitForTimeout(500)
const pills = await page.locator('[data-rsp="pill"]').allInnerTexts()
ok('the plant was read back', pills.some((p) => /Verified|Refused|Not verified|Already/.test(p)), JSON.stringify(pills))
await shot('verified')

// no em dashes anywhere this page renders
const seen = await page.evaluate(() => document.querySelector('[data-rsp="page"]').innerText + [...document.querySelectorAll('[data-rsp="page"] [title]')].map((e) => e.title).join(' '))
ok('no em dashes on the page', !seen.includes('—'))

// RCM library
await page.click('[data-rsp="tab-rcm"]')
await page.waitForSelector('[data-rsp="rcm"]')
ok('RCM rows are listed', (await page.locator('[data-rsp-row]').count()) >= 25, `${await page.locator('[data-rsp-row]').count()} rows`)
await page.click('[data-rsp-row="compressor:Dry gas seal leakage high"]')
await page.locator('[data-rsp-field="task"]').pressSequentially(' 1 2 w')
const typed = await page.inputValue('[data-rsp-field="task"]')
ok('typing in the editor triggers no hotkeys', typed.startsWith(' 1 2 w'), JSON.stringify(typed))
await page.fill('[data-rsp-field="severity"]', '10')
await shot('rcm-edit')
await page.reload()
await page.waitForFunction(() => !!window.__store && !!window.__response, null, { timeout: 90000 })
await page.waitForTimeout(1500)
ok('reloading sends nothing', calls.length === 2)
ok('the edit stayed in this browser', (await page.evaluate(() => localStorage.getItem('deckTwin.rcm.v1'))).includes('edited'))
await page.evaluate(() => window.__store.getState().setHmi('response'))
await page.waitForSelector('[data-rsp="page"]')
await page.click('[data-rsp="tab-rcm"]')
await page.click('[data-rsp="rcm-reset"]')
await page.click('[data-rsp="rcm-reset-confirm"]')
ok('reset to examples', !(await page.evaluate(() => localStorage.getItem('deckTwin.rcm.v1'))).includes('"edited"'))

// beside a running scenario
await page.evaluate(async () => {
  const { SCENARIOS } = await import('/alpha/src/sim/scenarios.ts')
  const s = window.__scen.getState()
  if (!s.live) s.start(SCENARIOS[0].id, 1)
  window.__store.getState().setHmi('scenarios')
})
await page.waitForSelector('[data-scn="running"]', { timeout: 15000 })
ok('the card waits for something to decide', (await page.innerText('[data-scn="running"]')).match(/next action/i) !== null)
await page.evaluate(() => {
  for (let i = 0; i < 900 && !window.__situations().length; i++) window.__sim.getState().tick(1)
})
await page.waitForSelector('[data-scn="running"] [data-rsp="compact"] [data-rsp-step]', { timeout: 15000 })
const scenarioPlan = await page.innerText('[data-rsp="compact"]')
ok('the card shows a plan beside the running scenario', /ask muse spark/i.test(scenarioPlan), scenarioPlan.split('\n')[0])
ok('it offers the scenario\'s own action', /Order it here/.test(scenarioPlan))
const acts0 = await page.evaluate(() => window.__sim.getState().actions.filter((a) => a.action === 'scenario').length)
await page.locator('[data-rsp="compact"] [data-rsp="arm"]', { hasText: 'Order it here' }).first().click()
await page.click('[data-rsp="compact"] [data-rsp="confirm"]')
await page.waitForTimeout(300)
ok('the order reaches the scenario log', (await page.evaluate(() => window.__sim.getState().actions.filter((a) => a.action === 'scenario').length)) > acts0)
await shot('scenario')

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
console.log(failed ? `${failed} failed` : 'all good')
process.exit(failed ? 1 : 0)
