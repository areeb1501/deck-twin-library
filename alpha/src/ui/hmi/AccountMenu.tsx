/** The signed-in user at the top right of the console, and the switch between console views. */
import { useState } from 'react'
import { currentView, useAccount } from '../../state/account'
import { pagesOf, type ConsoleViewKey } from '../../state/views'
import { useStore } from '../../state/store'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export function AccountMenu() {
  const user = useAccount((s) => s.user)
  const views = useAccount((s) => s.views)
  const key = useAccount((s) => s.view)
  const [open, setOpen] = useState(false)
  const cur = views.find((v) => v.key === key) ?? views[0]
  const home = user.view === cur.key

  const choose = (next: ConsoleViewKey) => {
    useAccount.getState().setView(next)
    setOpen(false)
    useStore.getState().setHmi(currentView().home)
  }

  return (
    <div className="hmi-acct">
      <button className="hmi-acct-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} data-account>
        <i aria-hidden="true">{initials(user.name)}</i>
        <span>
          <b>{user.name}</b>
          <small data-account-view={cur.key}>{home ? user.accountLabel : `Viewing as ${cur.label}`}</small>
        </span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {open && (
        <>
          <div className="hmi-acct-bg" data-account-close onClick={() => setOpen(false)} />
          <div className="hmi-acct-menu" role="menu" aria-label="Account">
            <div className="hmi-acct-who">
              <b>{user.name}</b>
              <span>{user.email}</span>
              <span>
                {user.accountLabel} · {user.organisation}
              </span>
            </div>
            {user.canSwitchViews && (
              <div role="group" aria-label="Console view">
                <h4>Console view</h4>
                {views.map((v) => (
                  <button key={v.key} role="menuitemradio" aria-checked={v.key === key} className={v.key === key ? 'sel' : ''} onClick={() => choose(v.key)} data-view={v.key}>
                    <span>
                      <b>{v.label}</b>
                      <small>{v.description}</small>
                    </span>
                    <em>{pagesOf(v).length} tabs</em>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
