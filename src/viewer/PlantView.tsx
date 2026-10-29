import { useCallback, useEffect, useState } from 'react'
import { Plant, type ComponentMap } from '../../registry/assembly/plant'
import type { Issue, PlantSpec } from '../../registry/assembly/spec'
import { loadAll } from '../registry'
import { componentsOf } from '../plants'
import { Viewer } from './Viewer'

export function PlantView({ spec, labels, onIssues, className, shot, effects }: { spec: PlantSpec; labels?: boolean; onIssues?: (i: Issue[]) => void; className?: string; shot?: boolean; effects?: boolean }) {
  const [components, setComponents] = useState<ComponentMap | null>(null)
  useEffect(() => {
    let live = true
    loadAll(componentsOf(spec)).then((c) => live && setComponents(c as ComponentMap))
    return () => {
      live = false
    }
  }, [spec])
  const report = useCallback((i: Issue[]) => onIssues?.(i), [onIssues])
  return (
    <Viewer className={className} fitKey={spec.name} shot={shot} effects={effects} view={spec.camera?.direction ?? [1, 0.75, 1.05]} focus={spec.camera}>
      {components && <Plant spec={spec} components={components} labels={labels} onReport={report} />}
    </Viewer>
  )
}

export function Issues({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <div className="rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">No issues. Every port is connected and nothing overlaps or floats.</div>
  return (
    <ul className="space-y-1.5">
      {issues.map((i, n) => (
        <li key={n} className={`rounded-md px-3 py-2 text-[13px] ${i.level === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
          <span className="font-mono font-medium">{i.where}</span> {i.message}
        </li>
      ))}
    </ul>
  )
}
