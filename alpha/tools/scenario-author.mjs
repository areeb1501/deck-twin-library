// The scenario author on the real console: node tools/scenario-author.mjs. Needs the twin dev server (npm run dev in alpha/, :5191).
// The model is faked, so it costs nothing. To use a real one, set LLM_ENDPOINT (Modal) and LLM_KEY in the environment: that spends
// real tokens, one Send plus any repairs, and one more with LLM_FOLLOW_UP. Proves a scenario goes from a chat message to a saved, startable, scored scenario, that
// the check never touches the live plant, and that reloading sends nothing.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const LIVE = process.env.LLM_KEY
const PROMPT = process.env.LLM_PROMPT ?? 'A seawater pump trips on a windy night while a crane lift is under way, and the standby is slow to come back.'
mkdirSync('.snaps', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
const calls = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

let reply = null
await page.route('**/api/llm', async (route) => {
  calls.push(route.request().postDataJSON())
  if (LIVE) return route.continue()
  const body = [{ choices: [{ delta: { reasoning_content: 'thinking' } }] }, { choices: [{ delta: { content: reply } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 9000, completion_tokens: 1500 } }]
  await new Promise((done) => setTimeout(done, 300))
  await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: body.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n' })
})

let failed = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failed++
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}
const shot = (name) => page.screenshot({ path: `.snaps/scenario-author-${name}.png` })
const open = async () => {
  await page.goto('http://localhost:5191/alpha/demo/?nofx&noenv&quality=low')
  await page.waitForFunction(() => !!window.__store && !!window.__scen && !!window.__author, null, { timeout: 90000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => window.__store.getState().setHmi('scenarios'))
  await page.waitForSelector('[data-scn="author"]')
}

await open()
await page.click('[data-scn="author"]')
await page.waitForSelector('[data-scn="chat"]')
await shot('empty')
ok('nothing sent on opening', calls.length === 0)

await page.click(`[data-scn-provider="${LIVE ? 'modal' : 'baseten'}"]`)
if (LIVE) await page.fill('[data-scn="endpoint"]', process.env.LLM_ENDPOINT)
await page.fill('[data-scn="key"]', LIVE ?? 'test-key-not-real')
await page.click('[data-scn="save-key"]')
await page.waitForSelector('[data-scn="forget"]')
ok('key saved, field gone', (await page.locator('[data-scn="key"]').count()) === 0)
ok('key not in localStorage', await page.evaluate((k) => !JSON.stringify({ ...localStorage }).includes(k), LIVE ?? 'test-key-not-real'))

if (!LIVE) {
  reply = await page.evaluate(async () => {
    const { SPEC_AIR } = await import('/alpha/src/sim/scen/examples.ts')
    return `Built a utility failure.\n\n\`\`\`json\n${JSON.stringify({ ...SPEC_AIR, title: 'Test scenario from the fake model' })}\n\`\`\``
  })
}
const before = await page.evaluate(() => {
  window.__sim_before = window.__store ? performance.now() : 0
  return { t: window.__sim?.getState?.().t, acts: window.__sim?.getState?.().events?.length }
})
const keys = () => page.evaluate(() => ({ speed: window.__sim.getState().speed, view: window.__scen.getState().view.kind, hmi: document.querySelector('[data-scn="chat"]') !== null }))
const wasKeys = await keys()
await page.locator('[data-scn="input"]').pressSequentially('1 2 3 wasd ')
ok('typing in the chat triggers no hotkeys', JSON.stringify(await keys()) === JSON.stringify(wasKeys) && (await page.inputValue('[data-scn="input"]')) === '1 2 3 wasd ', JSON.stringify(await keys()))
await page.fill('[data-scn="input"]', PROMPT)
await page.click('[data-scn="send"]')
await page.waitForSelector('[data-scn="pending"]', { timeout: 10000 })
await shot('working')
await page.waitForFunction(() => window.__author.getState().stage === 'idle', null, { timeout: 280000, polling: 500 })
await page.waitForTimeout(400)
if (process.env.LLM_FOLLOW_UP) {
  await page.fill('[data-scn="input"]', process.env.LLM_FOLLOW_UP)
  await page.click('[data-scn="send"]')
  await page.waitForFunction(() => window.__author.getState().stage === 'idle', null, { timeout: 280000, polling: 500 })
  await page.waitForTimeout(400)
}
await shot('draft')
const state = await page.evaluate(() => {
  const a = window.__author.getState()
  return { errors: a.draft?.errors, report: a.draft?.report, title: a.draft?.spec?.title, note: a.note, usage: a.usage, lines: a.chat.map((l) => ({ role: l.role, text: l.text.slice(0, 400), spec: !!l.specJson })) }
})
console.log(JSON.stringify(state, null, 1))
ok('a scenario reached the draft', !!state.title, state.title)
ok('it passed the plant check', !state.errors?.length, (state.errors ?? []).join(' | ').slice(0, 300))
ok('the unattended run ran in a worker', !!state.report, state.report ? `${state.report.fired.length} fired, idle score ${state.report.idleScore}` : '')
ok('the unattended run found nothing wrong', !state.report?.blockers.length, (state.report?.blockers ?? []).join(' | '))
const after = await page.evaluate(() => ({ t: window.__sim?.getState?.().t, shutdowns: window.__sim?.getState?.().shutdowns?.length, live: window.__scen.getState().live }))
ok('the live plant was not touched', after.t >= (before.t ?? 0) && !after.shutdowns && !after.live, JSON.stringify({ before: before.t, after: after.t }))

await page.click('[data-scn="save-open"]')
await page.waitForSelector('[data-scn="ai-note"]')
await shot('briefing')
ok('the briefing says who wrote it', /no engineer has reviewed it/.test(await page.textContent('[data-scn="ai-note"]')))
const id = await page.evaluate(() => window.__scen.getState().view.id)
await page.click(`[data-scn-start="${id}"]`)
await page.waitForSelector('[data-scn="running"]')
await page.evaluate(() => window.__sim.getState().setSpeed(60))
await page.waitForTimeout(6000)
await shot('running')
const live = await page.evaluate(() => {
  const l = window.__scen.getState().live
  return l && { el: l.el, title: l.title, objectives: l.objectives.map((o) => o.status) }
})
ok('it runs as a normal scenario', !!live && live.el > 30, JSON.stringify(live))
await page.click('[data-scn="abort"]')
await page.click('[data-scn="abort-confirm"]')
await page.waitForSelector('[data-scn="debrief"]')
await shot('debrief')
ok('it reaches the debrief', true)

const n = calls.length
await open()
await page.waitForSelector('.scn-card')
await page.waitForTimeout(1500)
await shot('library')
ok('saved scenario is in the library after a reload', (await page.locator(`[data-scn-card="${id}"]`).count()) === 1)
ok('reloading sends nothing', calls.length === n, `${calls.length} calls`)
await page.click(`[data-scn-card="${id}"]`)
await page.waitForSelector('[data-scn="edit"]')
await page.evaluate(() => window.__store.getState().setHmi('risk'))
await page.waitForTimeout(800)
await page.evaluate(() => window.__store.getState().setHmi('scenarios'))
await page.click('[data-scn="delete"]')
await page.click('[data-scn="delete-confirm"]')
await page.waitForSelector('[data-scn="library"]')
ok('it can be deleted', (await page.locator(`[data-scn-card="${id}"]`).count()) === 0)
await page.evaluate(() => {
  const a = window.__author.getState()
  a.newChat()
  return a.forgetProviderKey()
})

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
console.log(failed ? `${failed} failed` : 'all good')
process.exit(failed ? 1 : 0)
