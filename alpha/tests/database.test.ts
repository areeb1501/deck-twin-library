/** The D1 schema and seed, and the Worker's session and model routes, run against a real SQLite database. */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_ROUTE, modelRequest, sessionRoute } from '../session-route.js'
import { CONSOLE_PAGES, CONSOLE_VIEWS } from '../src/state/views'

type Row = Record<string, unknown>
const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
const sql = (name: string) => readFileSync(new URL(`../../database/${name}`, import.meta.url), 'utf8')

let db: InstanceType<typeof DatabaseSync>
const rows = (q: string, ...args: (string | number)[]) => db.prepare(q).all(...args) as Row[]

/** the part of D1's API the Worker uses */
const d1 = () => ({
  prepare: (q: string) => {
    const bound = (args: (string | number)[]) => ({
      first: async () => (rows(q, ...args)[0] as Row | undefined) ?? null,
      all: async () => ({ results: rows(q, ...args) }),
      run: async () => db.prepare(q).run(...args),
    })
    return { ...bound([]), bind: (...args: (string | number)[]) => bound(args) }
  },
})

const USERS: Record<string, [string, string]> = {
  finance: ['user', 'finance'],
  hse: ['user', 'hse'],
  admin: ['system_admin', 'all'],
}

function signIn(who: keyof typeof USERS, expires = '2999-01-01T00:00:00.000Z') {
  const [type, view] = USERS[who]
  const token = `token-${who}`
  db.prepare("INSERT INTO users (id, organisation_id, email, name, account_type, console_view, status) VALUES (?, 'org_deck_twin', ?, ?, ?, ?, 'active')").run(who, `${who}@test.invalid`, who, type, view)
  db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(`s-${who}`, who, createHash('sha256').update(token).digest('hex'), expires)
  return token
}

const get = (token?: string) => new Request(`https://x.test${SESSION_ROUTE}`, { headers: token ? { cookie: `theme=dark; dt_session=${token}` } : {} })
const post = (token?: string) => new Request('https://x.test/alpha/api/sam', { method: 'POST', headers: token ? { cookie: `dt_session=${token}` } : {} })

function fakeRoute() {
  return vi.fn(async () => new Response('{}', { status: 200 }))
}
const ctx = () => ({ waitUntil: vi.fn() })

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(sql('schema.sql'))
  db.exec(sql('seed.sql'))
})

describe('database scripts', () => {
  it('can run twice', () => {
    db.exec(sql('schema.sql'))
    db.exec(sql('seed.sql'))
    expect(rows('SELECT key FROM account_types ORDER BY key').map((r) => r.key)).toEqual(['super_admin', 'system_admin', 'user'])
  })

  it('has the same tabs as the app', () => {
    const pages = rows('SELECT key, label, title, area FROM console_pages ORDER BY sort')
    expect(pages).toEqual(CONSOLE_PAGES.map(({ key, label, title, area }) => ({ key, label, title, area })))
  })

  it('has the same views as the app', () => {
    const views = rows('SELECT key, label, description FROM console_views ORDER BY sort')
    expect(views).toEqual(CONSOLE_VIEWS.map(({ key, label, description }) => ({ key, label, description })))
    for (const v of CONSOLE_VIEWS) {
      const pages = rows('SELECT page_key FROM console_view_pages WHERE view_key = ?', v.key).map((r) => r.page_key)
      expect(pages.sort()).toEqual([...v.pages].sort())
      expect(v.pages).toContain(v.home)
    }
  })

  it('keeps sign-up users out of the full view', () => {
    expect(() => db.exec("INSERT INTO users (id, organisation_id, email, name, account_type, console_view) VALUES ('u', 'org_deck_twin', 'u@x.test', 'u', 'user', 'all')")).toThrow(/CHECK/)
  })
})

describe('session route', () => {
  it('says nobody is signed in without a database', async () => {
    const r = await (await sessionRoute(get('anything'), {})).json()
    expect(r).toEqual({ user: null, services: { database: false, sam: false } })
  })

  it('reports whether SAM 3.1 is connected without saying how', async () => {
    const r = await (await sessionRoute(get(), { DB: d1(), DECK_TWIN_SAM_URL: 'https://x.test', DECK_TWIN_API_KEY: 'secret' })).text()
    expect(JSON.parse(r).services).toEqual({ database: true, sam: true })
    expect(r).not.toContain('secret')
  })

  it('returns a sign-up user and only their view', async () => {
    const token = signIn('finance')
    const r = await (await sessionRoute(get(token), { DB: d1() })).json()
    expect(r.user).toMatchObject({ name: 'finance', accountType: 'user', accountLabel: 'Sign-up user', canSwitchViews: false, view: 'finance' })
    expect(Object.keys(r.views)).toEqual(['finance'])
    expect(r.views.finance.pages.sort()).toEqual([...CONSOLE_VIEWS.find((v) => v.key === 'finance')!.pages].sort())
  })

  it('gives an admin every view', async () => {
    const r = await (await sessionRoute(get(signIn('admin')), { DB: d1() })).json()
    expect(Object.keys(r.views).sort()).toEqual(['all', 'finance', 'hse', 'operations'])
  })

  it('ignores an expired session, a disabled user and a wrong token', async () => {
    const expired = signIn('finance', '2000-01-01T00:00:00.000Z')
    expect((await (await sessionRoute(get(expired), { DB: d1() })).json()).user).toBeNull()
    const token = signIn('hse')
    db.exec("UPDATE users SET status = 'disabled' WHERE id = 'hse'")
    expect((await (await sessionRoute(get(token), { DB: d1() })).json()).user).toBeNull()
    expect((await (await sessionRoute(get('nope'), { DB: d1() })).json()).user).toBeNull()
  })
})

describe('model routes', () => {
  it('passes straight through without a database', async () => {
    const route = fakeRoute()
    expect((await modelRequest(post(), {}, ctx(), route, ['cctv'])).status).toBe(200)
    expect(route).toHaveBeenCalledOnce()
  })

  it('refuses anyone not signed in, and spends nothing', async () => {
    const route = fakeRoute()
    expect((await modelRequest(post(), { DB: d1() }, ctx(), route, ['cctv'])).status).toBe(401)
    expect(route).not.toHaveBeenCalled()
  })

  it('refuses a view without the tab, and spends nothing', async () => {
    const route = fakeRoute()
    expect((await modelRequest(post(signIn('finance')), { DB: d1() }, ctx(), route, ['cctv'])).status).toBe(403)
    expect(route).not.toHaveBeenCalled()
  })

  it('forwards an allowed call and records it, without its content', async () => {
    const route = fakeRoute()
    const c = ctx()
    expect((await modelRequest(post(signIn('hse')), { DB: d1() }, c, route, ['cctv'])).status).toBe(200)
    expect(route).toHaveBeenCalledOnce()
    expect(c.waitUntil).toHaveBeenCalledOnce()
    await c.waitUntil.mock.calls[0][0]
    const [row] = rows('SELECT organisation_id, user_id, route, status FROM model_requests')
    expect(row).toEqual({ organisation_id: 'org_deck_twin', user_id: 'hse', route: '/alpha/api/sam', status: 200 })
  })

  it('lets an admin through on any route', async () => {
    const route = fakeRoute()
    expect((await modelRequest(post(signIn('admin')), { DB: d1() }, ctx(), route, ['scenarios'])).status).toBe(200)
  })
})
