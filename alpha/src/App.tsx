import { useEffect } from 'react'
import { Scene } from './scene/Scene'
import { TagTree } from './ui/TagTree'
import { Inspector } from './ui/Inspector'
import { HoverTip, Legend, Toolbar } from './ui/Toolbar'
import { WalkHud } from './ui/WalkHud'
import { IsolationPanel } from './ui/IsolationPanel'
import { useStore } from './state/store'
import { usePlant } from './state/plantStore'
import { PlantMenu } from './ui/PlantMenu'
import { LabelOverlay } from './ui/labels'
import { BuilderPanel } from './ui/builder/BuilderPanel'
import { useSpecStore } from './state/specStore'
import './app.css'

export default function App() {
  const plant = usePlant()
  const building = useSpecStore((s) => s.active)
  const setBuilding = useSpecStore((s) => s.setActive)
  const walking = useStore((s) => s.walk)
  const isolating = useStore((s) => !!s.isolation)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      const s = useStore.getState()
      if (e.key === 'Escape' && s.isolation) return s.setIsolation(null)
      if (e.key === 'Escape') s.selected ? s.select(null) : s.walk ? s.setWalk(false) : s.setSection({ enabled: false })
      if (e.key === 'x') s.setViewMode(s.viewMode === 'xray' ? 'shaded' : 'xray')
      if (s.walk) return // WASD / arrows belong to the walker
      if (e.key === 'g') s.setWalk(true)
      if (e.key === 's') s.setViewMode('shaded')
      if (e.key === 'c') s.setSection({ enabled: !s.section.enabled })
      if (e.key === 'f' && s.selected) s.requestFocus(s.selected.tag)
      if (e.key === 'l') s.toggleLayer('labels')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app ${building ? 'building' : ''} ${walking ? 'walking' : ''}`}>
      <div className="viewport">
        <Scene />
        <LabelOverlay />
      </div>
      <aside className="panel left">
        <div className="mode-switch seg">
          <button className={building ? '' : 'on'} onClick={() => setBuilding(false)}>Viewer</button>
          <button className={building ? 'on' : ''} onClick={() => setBuilding(true)} title="Build your own plant from library components">Builder</button>
        </div>
        {building ? (
          <BuilderPanel />
        ) : (
          <>
            <header className="brand">
              <div className="brand-title">{plant.name}</div>
              <div className="muted small">{plant.deck.name}</div>
              <PlantMenu />
            </header>
            <TagTree />
          </>
        )}
      </aside>
      <Toolbar />
      {isolating ? <IsolationPanel /> : <Inspector />}
      <Legend />
      <HoverTip />
      <WalkHud />
      <div className="hint muted small">Drag to orbit · right-drag to pan · scroll to zoom · click to inspect · X x-ray · C section · F frame · Esc clear</div>
    </div>
  )
}
