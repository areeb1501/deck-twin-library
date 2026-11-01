/** Which account and tabs the console shows, from the Worker's answer or without one. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentView, useAccount } from '../src/state/account'
import { CONSOLE_PAGES, CONSOLE_VIEWS, pagesOf, viewOf } from '../src/state/views'

const answer = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))))
const initial = useAccount.getInitialState()

beforeEach(() => useAccount.setState(initial, true))
afterEach(() => vi.unstubAllGlobals())

describe('console views', () => {
  it('shows a system admin every tab by default', () => {
    expect(currentView().key).toBe('all')
    expect(currentView().pages).toHaveLength(CONSOLE_PAGES.length)
  })

  it('keeps the instructor station for admins', () => {
    for (const v of CONSOLE_VIEWS.filter((x) => x.key !== 'all')) expect(v.pages).not.toContain('instructor')
  })

  it('puts tabs in console order', () => {
    const order = CONSOLE_PAGES.map((p) => p.key)
    for (const v of CONSOLE_VIEWS) {
      const keys = pagesOf(v).map((p) => p.key)
      expect(keys).toEqual([...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    }
  })

  it('opens each role on a tab it has', () => {
    for (const v of CONSOLE_VIEWS) expect(v.pages).toContain(v.home)
  })

  it('falls back to the full view for an unknown key', () => expect(viewOf('nope').key).toBe('all'))
})

describe('account', () => {
  it('stays the default admin where there is no Worker', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await useAccount.getState().load()
    expect(useAccount.getState().user.accountLabel).toBe('System admin')
  })

  it('stays the default admin when the dev server answers with a page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>')))
    await useAccount.getState().load()
    expect(useAccount.getState().user.canSwitchViews).toBe(true)
  })

  it('locks a sign-up user to their view', async () => {
    useAccount.getState().setView('hse')
    answer({
      user: { name: 'Finance user', email: 'f@x.test', organisation: 'Deck Twin', accountLabel: 'Sign-up user', canSwitchViews: false, view: 'finance' },
      views: { finance: { label: 'Finance', description: 'Revenue and finance', pages: ['economics', 'spares'] } },
    })
    await useAccount.getState().load()
    expect(useAccount.getState().view).toBe('finance')
    useAccount.getState().setView('hse')
    expect(useAccount.getState().view).toBe('finance')
    expect(currentView().pages).toEqual(['economics', 'spares'])
    expect(currentView().home).toBe('economics')
  })

  it('lets an admin keep the view they chose', async () => {
    useAccount.getState().setView('hse')
    answer({
      user: { name: 'Admin', email: 'a@x.test', organisation: 'Deck Twin', accountLabel: 'System admin', canSwitchViews: true, view: 'all' },
      views: Object.fromEntries(CONSOLE_VIEWS.map((v) => [v.key, { label: v.label, description: v.description, pages: v.pages }])),
    })
    await useAccount.getState().load()
    expect(useAccount.getState().view).toBe('hse')
  })
})
