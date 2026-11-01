// PlantView for prerendered pages: it mounts after hydration, so three.js stays out of the first load and out of the build-time render.
import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react'

const PlantView = lazy(() => import('./PlantView').then((m) => ({ default: m.PlantView })))
const Rising = lazy(() => import('./RisingPlant').then((m) => ({ default: m.RisingPlant })))

export function ClientPlant(props: ComponentProps<typeof PlantView>) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return ready ? (
    <Suspense fallback={null}>
      <PlantView {...props} />
    </Suspense>
  ) : null
}

export function ClientRisingPlant(props: ComponentProps<typeof Rising>) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return ready ? (
    <Suspense fallback={null}>
      <Rising {...props} />
    </Suspense>
  ) : null
}
