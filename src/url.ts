// URL-backed page state: filters live in the query string, so Back, reload and shared links reopen the same view.
import { useLayoutEffect } from 'react'
import { useLocation, useSearchParams } from 'wouter'

/** One query parameter as state. The default is left out of the URL; changes replace the entry, so Back leaves the page. */
export function useQueryState<T extends string = string>(key: string, fallback: NoInfer<T>): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams()
  const value = (params.get(key) ?? fallback) as T
  const set = (v: T) =>
    setParams(
      (p) => {
        if (v === fallback || v === '') p.delete(key)
        else p.set(key, v)
        return p
      },
      { replace: true },
    )
  return [value, set]
}

const saved = new Map<string, number>()
let pending: number | null = null
const here = () => location.pathname + location.search

// Registered at load, ahead of the router's own popstate listener, so the saved position is read before the old page re-renders.
if (typeof window !== 'undefined') {
  history.scrollRestoration = 'manual'
  addEventListener('scroll', () => saved.set(here(), scrollY), { passive: true })
  addEventListener('popstate', () => (pending = saved.get(here()) ?? 0))
}

/** Scroll to top on a new page, and back to where you were on Back / Forward. */
export function useScrollMemory() {
  const [path] = useLocation()
  useLayoutEffect(() => {
    const target = pending ?? 0
    pending = null
    let tries = 0
    // Lazy pages may need a few frames before they are tall enough to scroll that far.
    const go = () => {
      scrollTo(0, target)
      if (Math.abs(scrollY - target) > 2 && tries++ < 40) requestAnimationFrame(go)
    }
    go()
  }, [path])
}
