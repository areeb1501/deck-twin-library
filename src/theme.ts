// Site theme: dark by default, light is opt-in. index.html applies the saved choice before first paint.
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'deck-twin-theme'
const root = () => document.documentElement

const read = (): Theme => (root().classList.contains('light') ? 'light' : 'dark')

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb)
  mo.observe(root(), { attributes: true, attributeFilter: ['class'] })
  return () => mo.disconnect()
}

export function useTheme() {
  return useSyncExternalStore(subscribe, read, () => 'dark' as Theme)
}

export function setTheme(t: Theme) {
  root().classList.toggle('light', t === 'light')
  try {
    if (t === 'light') localStorage.setItem(KEY, t)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
}
