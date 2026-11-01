/**
 * The signed-in account and the console view it is looking through. Asks the Worker (alpha/session-route.js) who is
 * signed in; until there is a session, or where there is no Worker, the console runs as the default system admin.
 */
import { create } from 'zustand'
import { CONSOLE_VIEWS, viewOf, type ConsoleView, type ConsoleViewKey } from './views'

export interface Account {
  name: string
  email: string
  organisation: string
  accountLabel: string
  canSwitchViews: boolean
  view: ConsoleViewKey
}

const DEFAULT_ACCOUNT: Account = {
  name: 'Alex Morgan',
  email: 'admin@decktwin.com',
  organisation: 'Deck Twin',
  accountLabel: 'System admin',
  canSwitchViews: true,
  view: 'all',
}

const VIEW_KEY = 'deck-twin-console-view'
const API = `${import.meta.env.BASE_URL}api/session`

const savedView = () => {
  try {
    return localStorage.getItem(VIEW_KEY)
  } catch {
    return null
  }
}

interface AccountState {
  user: Account
  views: readonly ConsoleView[]
  view: ConsoleViewKey
  setView: (key: ConsoleViewKey) => void
  load: () => Promise<void>
}

export const useAccount = create<AccountState>((set, get) => ({
  user: DEFAULT_ACCOUNT,
  views: CONSOLE_VIEWS,
  view: viewOf(savedView()).key,
  setView(key) {
    if (!get().views.some((v) => v.key === key)) return
    set({ view: key })
    try {
      localStorage.setItem(VIEW_KEY, key)
    } catch {
      /* private window: the view lasts until a reload */
    }
  },
  async load() {
    const r = await fetch(API).catch(() => null)
    const session = await r?.json().catch(() => null)
    if (!session?.user) return
    const user: Account = session.user
    // the database may have changed which tabs a view shows; home stays with the app's list
    const views = CONSOLE_VIEWS.filter((v) => session.views?.[v.key]).map((v) => ({ ...v, ...session.views[v.key] }))
    const wanted = user.canSwitchViews ? get().view : user.view
    set({ user, views, view: views.some((v) => v.key === wanted) ? wanted : user.view })
  },
}))

export const currentView = () => {
  const { views, view } = useAccount.getState()
  return views.find((v) => v.key === view) ?? views[0]
}
