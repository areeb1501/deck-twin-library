import { useCallback, useEffect, useState } from 'react'
import { Plant, type ComponentMap } from '../../registry/assembly/plant'
import type { Issue, PlantSpec } from '../../registry/assembly/spec'
import { loadAll } from '../registry'
import { componentsOf } from '../plants'
import { Viewer, type ViewerEnv } from './Viewer'

/** env applies only to plants with a sea; the rest always use the studio look. */
export function PlantView({ spec, labels, onIssues, className, shot, effects, env = 'studio' }: { spec: PlantSpec; labels?: boolean; onIssues?: (i: Issue[]) => void; className?: string; shot?: boolean; effects?: boolean; env?: ViewerEnv }) {
  const [components, setComponents] = useState<ComponentMap | null>(null)
  useEffect(() => {
    let live = true
    loadAll(componentsOf(spec)).then((c) => live && setComponents(c as ComponentMap))
    return () => {
      live = false
    }
  }, [spec])
  const report = useCallback((i: Issue[]) => onIssues?.(i), [onIssues])
  const look = spec.sea ? env : 'studio'
  const dir = spec.camera?.direction ?? [1, 0.75, 1.05]
  const view: [number, number, number] = look === 'studio' ? dir : [dir[0], dir[1] * 0.45, dir[2]]
  return (
    <Viewer className={className} fitKey={`${spec.name}${look === "studio" ? "" : "-sky"}`} shot={shot} effects={effects} env={look} view={view} focus={spec.camera}>
      {components && <Plant spec={spec} components={components} labels={labels} night={look === 'night'} onReport={report} />}
    </Viewer>
  )
}

export function Issues({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <div className="rounded-md bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-300">No issues. Every port is connected and nothing overlaps or floats.</div>
  return (
    <ul className="space-y-1.5">
      {issues.map((i, n) => (
        <li key={n} className={`rounded-md px-3 py-2 text-[13px] ${i.level === 'error' ? 'bg-red-400/10 text-red-300' : 'bg-amber-400/10 text-amber-200'}`}>
          <span className="font-mono font-medium">{i.where}</span> {i.message}
        </li>
      ))}
    </ul>
  )
}
