/** F&G page: hosts the F&G coverage / zone table panel (src/ui/FgPanel.tsx, built separately) — a placeholder until it exists. */
import { Suspense, lazy, type ComponentType } from 'react'
import { ErrorBoundary } from '../ErrorBoundary'

// import.meta.glob instead of a literal import: resolves to nothing (no build error) until the file exists
const mods = import.meta.glob<{ FgPanel?: ComponentType }>('../FgPanel.tsx')
const load = Object.values(mods)[0]
const Panel = load
  ? lazy(() => load().then((m) => ({ default: m.FgPanel ?? (() => <div className="h-placeholder">FgPanel.tsx does not export FgPanel.</div>) })))
  : null

export function FgPage() {
  if (!Panel) return <div className="h-placeholder">The fire & gas coverage and zone panel (src/ui/FgPanel.tsx) is being built: it appears here as soon as it exists.</div>
  return (
    <ErrorBoundary label="FgPanel" fallback={<div className="h-placeholder">The F&G panel failed to render: see the console.</div>}>
      <Suspense fallback={<div className="h-placeholder">Loading fire & gas…</div>}>
        <div className="hmi-fg">
          <Panel />
        </div>
      </Suspense>
    </ErrorBoundary>
  )
}
