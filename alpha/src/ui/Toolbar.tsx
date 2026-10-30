import { useEffect, useState } from 'react'
import { SERVICE } from '../model/catalog'
import { useStore, type CameraPreset, type LayerId } from '../state/store'
import { findItemIn, usePlant } from '../state/plantStore'
import { DeckNavigator } from './DeckNavigator'
import { startTour, exitTour, useTour } from '../tour/engine'
import { ALPHA_TOUR } from '../tour/alphaTour'

const PRESETS: [CameraPreset, string][] = [
  ['overview', 'Platform'],
  ['deck', 'Deck'],
  ['plan', 'Plan'],
]
/** more views, in the Views menu */
const MORE: [CameraPreset, string][] = [
  ['field', 'Field — WHP-N, Alpha & LQ'],
  ['whp', 'Wellhead platform (WHP-N)'],
  ['bridgeN', 'North bridge'],
  ['rig', 'Drilling rig'],
  ['wellbay', 'Well bay (cellar deck)'],
  ['rack', 'Pipe rack'],
  ['separator', 'HP separator'],
  ['compressor', 'Compressor'],
  ['bridge', 'South bridge'],
  ['lq', 'Accommodation platform'],
  ['underdeck', 'Jacket'],
]

const LAYERS: [LayerId, string][] = [
  ['equipment', 'Equipment'],
  ['piping', 'Piping & valves'],
  ['instruments', 'Instruments'],
  ['structure', 'Structure'],
  ['ceiling', 'Weather deck'],
  ['environment', 'Sea & jacket'],
  ['labels', 'Labels'],
  ['flow', 'Flow'],
  ['fireGas', 'F&G coverage'],
  ['fgCoverage', 'F&G mapping (heatmap)'],
]

export function Toolbar() {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const preset = useStore((s) => s.requestPreset)
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const [menu, setMenu] = useState<'layers' | 'section' | 'views' | 'decks' | null>(null)
  const walk = useStore((s) => s.walk)
  const setWalk = useStore((s) => s.setWalk)
  const plant = usePlant()
  const setHmi = useStore((s) => s.setHmi)
  const touring = useTour((s) => s.on)
  // the tour's routes are laid out on the Alpha field
  const tourable = plant.deck.site === 'offshoreAlpha' && !!plant.deck.walk?.some((l) => l.id === 'drillfloor')
  // another plant loaded mid-tour: the tour's routes don't apply to it
  useEffect(() => {
    if (!tourable && useTour.getState().on) exitTour()
  }, [tourable])

  return (
    <div className="toolbar">
      {tourable && (
        <div className="seg">
          <button className={`tour-btn ${touring ? 'on' : ''}`} onClick={(e) => (e.currentTarget.blur(), touring ? exitTour() : (setMenu(null), startTour(ALPHA_TOUR)))} title="One-click guided tour of the whole field: fly-overs and a walk through every deck, with live data">
            {touring ? 'End tour' : '▶ Guided tour'}
          </button>
        </div>
      )}
      <div className="seg">
        <button className={walk ? 'on' : ''} onClick={() => setWalk(!walk)} title="Walk through the deck with the arrow keys and inspect what you look at (G)">
          {walk ? 'Exit walk' : 'Walk'}
        </button>
        <button className={menu === 'decks' ? 'on' : ''} onClick={() => setMenu(menu === 'decks' ? null : 'decks')} title="Go to a deck: drill floor, weather, production, cellar, seabed, LQ">
          Decks ▾
        </button>
      </div>
      <div className="seg">
        <button onClick={(e) => (e.currentTarget.blur(), setMenu(null), setHmi('overview'))} title="Open the control-room DCS console: live process, alarms, shutdowns, F&G, trends, machines and the instructor station" data-hmi-open>
          Control room
        </button>
      </div>
      <div className="seg">
        {PRESETS.map(([k, label]) => (
          <button key={k} onClick={() => preset(k)}>
            {label}
          </button>
        ))}
        <button className={menu === 'views' ? 'on' : ''} onClick={() => setMenu(menu === 'views' ? null : 'views')}>
          Views ▾
        </button>
      </div>
      <div className="seg">
        <button className={viewMode === 'shaded' ? 'on' : ''} onClick={() => setViewMode('shaded')} title="Shaded (S)">
          Shaded
        </button>
        <button className={viewMode === 'xray' ? 'on' : ''} onClick={() => setViewMode('xray')} title="X-ray: see through shells, flow inside (X)">
          X-ray
        </button>
        <button className={section.enabled ? 'on' : ''} onClick={() => setMenu(menu === 'section' ? null : 'section')} title="Section box (C)">
          Section
        </button>
        <button className={menu === 'layers' ? 'on' : ''} onClick={() => setMenu(menu === 'layers' ? null : 'layers')}>
          Layers
        </button>
      </div>
      {menu === 'views' && (
        <div className="pop views">
          {MORE.map(([k, label]) => (
            <button key={k} className="pop-item" onClick={() => (preset(k), setMenu(null))}>
              {label}
            </button>
          ))}
        </div>
      )}
      {menu === 'decks' && <DeckNavigator onClose={() => setMenu(null)} />}
      {menu === 'layers' && <LayersMenu />}
      {menu === 'section' && <SectionMenu onEnable={(v) => setSection({ enabled: v })} />}
    </div>
  )
}

function LayersMenu() {
  const layers = useStore((s) => s.layers)
  const toggle = useStore((s) => s.toggleLayer)
  return (
    <div className="pop">
      {LAYERS.map(([k, label]) => (
        <label key={k} className="check">
          <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  )
}

const AXES = ['X (west → east)', 'Y (elevation)', 'Z (north → south)']
const LIMITS: [number, number][] = [
  [-32, 32],
  [-2, 14],
  [-22, 22],
]

function SectionMenu({ onEnable }: { onEnable: (v: boolean) => void }) {
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const set = (which: 'min' | 'max', axis: number, v: number) => {
    const arr = [...section[which]] as [number, number, number]
    arr[axis] = v
    setSection({ [which]: arr, enabled: true })
  }
  const quick = (min: [number, number, number], max: [number, number, number]) => setSection({ enabled: true, min, max })
  return (
    <div className="pop wide">
      <label className="check">
        <input type="checkbox" checked={section.enabled} onChange={(e) => onEnable(e.target.checked)} />
        <span>Section box enabled</span>
      </label>
      <div className="quick">
        <button onClick={() => quick([-32, -2, -22], [32, 14, -9])}>Cut along separators</button>
        <button onClick={() => quick([-32, -2, -22], [32, 5.2, 22])}>Cut at 5.2 m</button>
        <button onClick={() => quick([-32, -2, -22], [32, 14, 0])}>North half</button>
        <button onClick={() => quick([-32, -2, -22], [32, 14, 22])}>Reset</button>
      </div>
      {AXES.map((label, a) => (
        <div key={a} className="range">
          <div className="small muted">{label}</div>
          <div className="range-row">
            <input type="range" min={LIMITS[a][0]} max={LIMITS[a][1]} step={0.1} value={section.min[a]} onChange={(e) => set('min', a, Math.min(+e.target.value, section.max[a] - 0.2))} />
            <input type="range" min={LIMITS[a][0]} max={LIMITS[a][1]} step={0.1} value={section.max[a]} onChange={(e) => set('max', a, Math.max(+e.target.value, section.min[a] + 0.2))} />
          </div>
          <div className="small mono muted">
            {section.min[a].toFixed(1)} … {section.max[a].toFixed(1)} m
          </div>
        </div>
      ))}
    </div>
  )
}

export function Legend() {
  const viewMode = useStore((s) => s.viewMode)
  const section = useStore((s) => s.section.enabled)
  if (viewMode !== 'xray' && !section) return null
  const services = ['multiphase', 'oil', 'gas', 'water', 'flare', 'cooling', 'firewater', 'drain'] as const
  return (
    <div className="legend">
      {services.map((s) => (
        <div key={s} className="legend-row">
          <i className="sw" style={{ background: SERVICE[s].flow }} />
          <span>{SERVICE[s].label}</span>
        </div>
      ))}
    </div>
  )
}

export function HoverTip() {
  const hovered = useStore((s) => s.hovered)
  const sel = useStore((s) => s.selected)
  const plant = usePlant()
  if (!hovered || hovered.tag === sel?.tag) return null
  const it = findItemIn(plant, hovered.tag)
  const sub = it && 'name' in it ? it.name : it && 'service' in it ? SERVICE[it.service].label : hovered.kind
  return (
    <div className="hovertip">
      <span className="mono">{hovered.tag}</span>
      <span className="muted">{sub}</span>
    </div>
  )
}
