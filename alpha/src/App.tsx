import { useEffect, useState } from 'react'
import { Scene } from './scene/Scene'
import { TagTree } from './ui/TagTree'
import { Inspector } from './ui/Inspector'
import { HoverTip, Legend, Toolbar } from './ui/Toolbar'
import { WalkHud } from './ui/WalkHud'
import { IsolationPanel } from './ui/IsolationPanel'
import { useStore } from './state/store'
import { usePlant, usePlantStore } from './state/plantStore'
import { PlantMenu } from './ui/PlantMenu'
import { LabelOverlay } from './ui/labels'
import { BuilderPanel } from './ui/builder/BuilderPanel'
import { useSpecStore } from './state/specStore'
import { OperationsPanel } from './ui/OperationsPanel'
import { OpsTicker } from './ui/OpsTicker'
import { EyeOverlay } from './ui/Eyes'
import { KnowledgeCard } from './ui/KnowledgeCard'
import { TourPlayer } from './ui/TourPlayer'
import { AlarmBanner } from './ui/AlarmBanner'
import { Hmi } from './ui/hmi/Hmi'
import { FgMappingLegend } from './ui/FgPanel'
import { PanelHandles } from './ui/PanelHandles'
// simulation plugins: they step with the engine whether or not their panels are open
import './sim/cranes'
import './sim/scenarios'
import './sim/maintenance'
import { ScenarioChip } from './ui/ScenarioChip'
import { CraneCabHud } from './ui/CraneCabHud'
// safety twin: risk engine and alert rules step with the simulation
import './safety/risk'
import './safety/alerts'
// asset & economics (plan 13): spares and supply, finance, insights, demo stories — sim plugins
import './sim/spares'
import './sim/finance'
import './sim/insights'
import './sim/demoStory'
import { useSim } from './state/sim'
import { sample } from './ui/live'
import { enterRoom, goToTag, walkToTag } from './ui/walkTo'
import { startTour } from './tour/engine'
import './app.css'

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__sim = useSim
// dev: hooks for the demo-video recorder (video/) and scripted checks
if (import.meta.env.DEV)
  Object.assign(window, {
    __live: (tag: string) => {
      const inst = usePlantStore.getState().plant.instruments.find((i) => i.tag === tag)
      return inst ? { v: sample(inst, useSim.getState().t), unit: inst.unit } : null
    },
    __walkTo: { walkToTag, enterRoom, goToTag },
    __startTour: startTour,
  })

export default function App() {
  const plant = usePlant()
  const building = useSpecStore((s) => s.active)
  const setBuilding = useSpecStore((s) => s.setActive)
  const walking = useStore((s) => s.walk)
  const isolating = useStore((s) => !!s.isolation)
  const panels = useStore((s) => s.panels)
  const inCab = useStore((s) => !!s.craneCab)
  const [ops, setOps] = useState(false)
  // an imported plant is viewed, walked and inspected: it has no process model behind it, so nothing here pretends to
  const simulated = !plant.custom
  // the plant simulation steps twice a second (× the clock speed) for the whole session
  useEffect(() => {
    useSim.getState().tick(0.5)
    const id = setInterval(() => useSim.getState().tick(0.5), 500)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      const s = useStore.getState()
      if (e.key === 'Escape' && s.isolation) return s.setIsolation(null)
      if (e.key === 'Escape') s.selected ? s.select(null) : s.walk ? s.setWalk(false) : s.setSection({ enabled: false })
      if (e.key === 'x') s.setViewMode(s.viewMode === 'xray' ? 'shaded' : 'xray')
      // side panels: [ left · ] right · \ both
      if (e.key === '[') return s.togglePanel('left')
      if (e.key === ']') return s.togglePanel('right')
      if (e.key === '\\') return s.togglePanel('both')
      if (s.walk) return // WASD / arrows belong to the walker
      if (e.key === 'g') s.setWalk(true)
      if (e.key === 's') s.setViewMode('shaded')
      if (e.key === 'c') s.setSection({ enabled: !s.section.enabled })
      if (e.key === 'f' && s.selected) s.requestFocus(s.selected.tag)
      if (e.key === 'l') s.toggleLayer('labels')
      if (e.key === 'n') s.setNight(!s.night)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app ${building ? 'building' : ''} ${walking ? 'walking' : ''} ${panels.left ? '' : 'left-off'} ${panels.right ? '' : 'right-off'}`}>
      <div className="viewport">
        <Scene />
        {!inCab && <LabelOverlay />}
        {!inCab && <EyeOverlay />}
        <FgMappingLegend />
      </div>
      <aside className="panel left">
        <div className="mode-switch seg">
          <button className={building || ops ? '' : 'on'} onClick={() => (setBuilding(false), setOps(false))}>Viewer</button>
          {simulated && <button className={ops && !building ? 'on' : ''} onClick={() => (setBuilding(false), setOps(true))} title="Production, availability and the knobs to run the plant">Operations</button>}
          <button className={building ? 'on' : ''} onClick={() => (setOps(false), setBuilding(true))} title="Build your own plant from library components">Builder</button>
        </div>
        {building ? (
          <BuilderPanel />
        ) : ops && simulated ? (
          <>
            <header className="brand">
              <div className="brand-title">{plant.name} — operations</div>
              <div className="muted small">Live simulation · turn the knobs, start / stop / trip machines</div>
            </header>
            <OperationsPanel />
          </>
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
      <PanelHandles />
      {isolating ? <IsolationPanel /> : <Inspector />}
      <Legend />
      <HoverTip />
      <WalkHud />
      {simulated && <OpsTicker />}
      <KnowledgeCard />
      <TourPlayer />
      {simulated && <AlarmBanner />}
      {simulated && <ScenarioChip />}
      <CraneCabHud />
      <Hmi />
      <div className="hint muted small">Drag to orbit · Shift + drag to pan · scroll to zoom · click to inspect · X x-ray · C section · F frame · Esc clear</div>
    </div>
  )
}
