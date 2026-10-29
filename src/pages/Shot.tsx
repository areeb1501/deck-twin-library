import { useEffect, useState } from 'react'
import { BY_NAME, loadModule, type ComponentModule } from '../registry'
import { EXAMPLES } from '../plants'
import { Viewer, type Bounds } from '../viewer/Viewer'
import { PlantView } from '../viewer/PlantView'

declare global {
  interface Window {
    __ready?: boolean
    __bounds?: Bounds
    __ports?: unknown
    __issues?: unknown
  }
}

export default function Shot({ name, plant }: { name?: string; plant?: string }) {
  const params = new URLSearchParams(location.search)
  const props = params.get('props') ? JSON.parse(params.get('props')!) : {}
  const fx = params.get('fx') !== '0'
  const view = params.get('view')?.split(',').map(Number) as [number, number, number] | undefined
  const [mod, setMod] = useState<ComponentModule | null>(null)
  const item = name ? BY_NAME.get(name) : undefined
  useEffect(() => {
    if (item) loadModule(item).then(setMod)
  }, [item])
  if (plant) {
    const ex = EXAMPLES.find((e) => e.name === plant)
    return ex ? <PlantView spec={ex.spec} shot effects={fx} labels={params.get('labels') === '1'} onIssues={(i) => (window.__issues = i)} className="fixed inset-0" /> : null
  }
  if (!item || !mod) return null
  const values = { ...(mod.defaults ?? {}), ...(item.preview ?? {}), ...props }
  const ports = mod.ports?.(values) ?? []
  window.__ports = ports
  return (
    <Viewer className="fixed inset-0" shot effects={fx} view={view} fitKey={item.name} ports={ports} showPorts={params.get('ports') === '1'} onBounds={(b) => (window.__bounds = b)}>
      <mod.default {...values} />
    </Viewer>
  )
}
