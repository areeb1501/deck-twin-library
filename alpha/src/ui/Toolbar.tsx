import { useEffect, useState } from 'react'
import { SERVICE } from '../model/catalog'
import { useStore, type CameraPreset, type LayerId } from '../state/store'
import { findItemIn, usePlant } from '../state/plantStore'
import { DeckNavigator } from './DeckNavigator'
import { startTour, exitTour, useTour } from '../tour/engine'
import { ALPHA_TOUR } from '../tour/alphaTour'
import { OIL_TOUR } from '../tour/oilTour'
import { CRANES } from '../model/cranes'

const PRESETS: [CameraPreset, string][] = [
  ['overview', 'Platform'],
  ['deck', 'Deck'],
  ['plan', 'Plan'],
]
/** more views, in the Views menu */
const MORE: [CameraPreset, string][] = [
  ['field', 'Field — WI, WHP-N, RP, Alpha & LQ'],
  ['whp', 'Wellhead platform (WHP-N)'],
  ['bridgeN', 'North bridge'],
  ['rp', 'Riser platform (RP)'],
  ['wi', 'Water-injection platform (WI)'],
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
  ['hazAreas', 'Hazardous areas (Zone 0/1/2)'],
]

export function Toolbar() {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const night = useStore((s) => s.night)
  const setNight = useStore((s) => s.setNight)
  const preset = useStore((s) => s.requestPreset)
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const [menu, setMenu] = useState<'layers' | 'section' | 'views' | 'decks' | 'cranes' | null>(null)
  const workers = useStore((s) => s.workers)
  const setWorkers = useStore((s) => s.setWorkers)
  const craneCab = useStore((s) => s.craneCab)
  const setCraneCab = useStore((s) => s.setCraneCab)
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
      {/* explore: move around the field */}
      <div className="seg" role="group" aria-label="Explore">
        <button className={walk ? 'on' : ''} onClick={() => setWalk(!walk)} title="Walk through the deck with the arrow keys and inspect what you look at (G)">
          {walk ? 'Exit walk' : 'Walk'}
        </button>
        <button className={menu === 'decks' ? 'on' : ''} onClick={() => setMenu(menu === 'decks' ? null : 'decks')} title="Go to a deck on any platform">
          Decks ▾
        </button>
        <button className={menu === 'views' ? 'on' : ''} onClick={() => setMenu(menu === 'views' ? null : 'views')} title="Camera views: platform, deck, plan, each platform, key equipment">
          Views ▾
        </button>
      </div>
      {/* display: how the plant is drawn */}
      <div className="seg" role="group" aria-label="Display">
        <button className={viewMode === 'xray' ? 'on' : ''} onClick={() => setViewMode(viewMode === 'xray' ? 'shaded' : 'xray')} title="X-ray: see through shells, live flow inside (X)">
          X-ray
        </button>
        <button className={section.enabled || menu === 'section' ? 'on' : ''} onClick={() => setMenu(menu === 'section' ? null : 'section')} title="Section box (C)">
          Section
        </button>
        <button className={menu === 'layers' ? 'on' : ''} onClick={() => setMenu(menu === 'layers' ? null : 'layers')} title="Layers: equipment, piping, structure, sea, labels, flow, F&G coverage and mapping">
          Layers ▾
        </button>
        <button className={night ? 'on' : ''} onClick={() => setNight(!night)} title="Night: dark sky, moonlight and floodlit decks (N)">
          Night
        </button>
      </div>
      {/* operate: run the plant */}
      <div className="seg" role="group" aria-label="Operate">
        {!plant.custom && <button onClick={(e) => (e.currentTarget.blur(), setMenu(null), setHmi('economics'))} title="Open the control-room console: asset & economics, spares & supply, live dashboard, risk & what-if, CCTV & PPE, alerts & assistant, process, alarms, shutdowns, F&G, maintenance and scenarios" data-hmi-open>
          Control room
        </button>}
        {tourable && (
          <button className={workers ? 'on' : ''} onClick={(e) => (e.currentTarget.blur(), setWorkers(!workers))} title="Simulated field workers walking the decks — the CCTV PPE detector watches them" data-workers>
            Workers
          </button>
        )}
        {tourable && (
          <button className={craneCab || menu === 'cranes' ? 'on' : ''} onClick={(e) => (e.currentTarget.blur(), craneCab ? setCraneCab(null) : setMenu(menu === 'cranes' ? null : 'cranes'))} title="Sit in a crane cab: operate the crane and look around the field" data-crane-menu>
            {craneCab ? 'Leave cab' : 'Crane ▾'}
          </button>
        )}
        {tourable && (
          <button className={`tour-btn ${touring ? 'on' : ''}`} onClick={(e) => (e.currentTarget.blur(), touring ? exitTour() : (setMenu(null), startTour(ALPHA_TOUR)))} title="One-click guided tour of the whole field: fly-overs and a walk through every deck, with live data">
            {touring ? 'End tour' : '▶ Tour'}
          </button>
        )}
        {tourable && !touring && OIL_TOUR.length > 0 && (
          <button className="tour-btn" onClick={(e) => (e.currentTarget.blur(), setMenu(null), startTour(OIL_TOUR))} title="Follow the oil: from the reservoir through every process step to the export riser" data-oil-tour>
            ▶ Oil path
          </button>
        )}
      </div>
      {menu === 'cranes' && (
        <div className="pop views">
          <div className="pop-head">Sit in a crane cab</div>
          {CRANES.map((c) => (
            <button key={c.tag} className="pop-item" onClick={() => (setMenu(null), setCraneCab(c.tag))} data-crane={c.tag}>
              {c.tag} · {c.platform}
            </button>
          ))}
        </div>
      )}
      {menu === 'views' && (
        <div className="pop views">
          <div className="pop-head">Quick views</div>
          <div className="quick">
            {PRESETS.map(([k, label]) => (
              <button key={k} onClick={() => (preset(k), setMenu(null))}>
                {label}
              </button>
            ))}
          </div>
          <div className="pop-head">Places</div>
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
