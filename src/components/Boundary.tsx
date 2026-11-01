// Error boundaries: a failing 3D canvas or page shows a message in its own box instead of unmounting the whole site.
import { Component, type ReactNode } from 'react'

export class Boundary extends Component<{ fallback: (error: Error, retry: () => void) => ReactNode; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error(error)
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error, () => this.setState({ error: null })) : this.props.children
  }
}

const STALE = /dynamically imported module|importing a module script failed|error loading dynamically imported|failed to fetch/i
const RELOADED = 'deck-twin-reloaded'
if (typeof window !== 'undefined') addEventListener('load', () => setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOADED)
    } catch {
      /* storage blocked */
    }
  }, 3000))

/** Page-level fallback. A chunk that fails to load usually means a newer deploy replaced it, so reload once to pick it up. */
export function PageError({ error, retry }: { error: Error; retry: () => void }) {
  if (STALE.test(error.message)) {
    try {
      if (!sessionStorage.getItem(RELOADED)) {
        sessionStorage.setItem(RELOADED, '1')
        location.reload()
        return <div className="min-h-[70vh]" />
      }
    } catch {
      /* storage blocked: fall through to the message */
    }
  }
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[24px] font-semibold text-ink">This page didn't load</h1>
      <p className="mt-2 text-[15px] leading-7 text-fg-3">Something went wrong while opening it. The rest of the site still works.</p>
      <div className="mt-6 flex gap-2.5">
        <button onClick={retry} className="inline-flex h-10 items-center rounded-md bg-ink px-5 text-[15px] font-medium text-on-ink transition-colors hover:bg-ink-2">
          Try again
        </button>
        <button onClick={() => location.reload()} className="inline-flex h-10 items-center rounded-md border border-border px-5 text-[15px] font-medium text-ink transition-colors hover:bg-muted">
          Reload
        </button>
      </div>
    </div>
  )
}
