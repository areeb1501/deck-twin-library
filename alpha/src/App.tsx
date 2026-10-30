import { useEffect } from 'react'
import { Scene } from './scene/Scene'
import { TagTree } from './ui/TagTree'
import { Inspector } from './ui/Inspector'
import { HoverTip, Legend, Toolbar } from './ui/Toolbar'
import { useStore } from './state/store'
import { usePlant } from './state/plantStore'
import { PlantMenu } from './ui/PlantMenu'
import { LabelOverlay } from './ui/labels'
import './app.css'

export default function App() {
  const plant = usePlant()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const s = useStore.getState()
      if (e.key === 'Escape') s.selected ? s.select(null) : s.setSection({ enabled: false })
      if (e.key === 'x') s.setViewMode(s.viewMode === 'xray' ? 'shaded' : 'xray')
      if (e.key === 's') s.setViewMode('shaded')
      if (e.key === 'c') s.setSection({ enabled: !s.section.enabled })
      if (e.key === 'f' && s.selected) s.requestFocus(s.selected.tag)
      if (e.key === 'l') s.toggleLayer('labels')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <div className="viewport">
        <Scene />
        <LabelOverlay />
      </div>
      <aside className="panel left">
        <header className="brand">
          <div className="brand-title">{plant.name}</div>
          <div className="muted small">{plant.deck.name}</div>
          <PlantMenu />
        </header>
        <TagTree />
      </aside>
      <Toolbar />
      <Inspector />
      <Legend />
      <HoverTip />
      <div className="hint muted small">Drag to orbit · right-drag to pan · scroll to zoom · click to inspect · X x-ray · C section · F frame · Esc clear</div>
    </div>
  )
}
