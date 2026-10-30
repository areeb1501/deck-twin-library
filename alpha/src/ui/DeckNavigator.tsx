/**
 * Deck navigator: every level of the platform, top to bottom. "Show" flies the camera there and cuts
 * away what's above it; "Walk" drops you onto it in the walkthrough.
 */
import { usePlant } from '../state/plantStore'
import { useStore } from '../state/store'
import type { Vec3 } from '../model/types'
import { walkLevels } from '../scene/Walk'
import { BRIDGE_NN, BRIDGE_S, BRIDGE_W, RIG_SLOT, RP, WI } from '../model/site'

interface Deck {
  id: string
  label: string
  el: string
  blurb: string
  /** cut: section-box top (deck-local y) over Alpha; box: an explicit section box (deck-local) instead */
  view: { pos: Vec3; target: Vec3; ceiling: boolean; cut?: number; box?: { min: Vec3; max: Vec3 } }
  walk?: { level: string; at: [number, number]; face?: [number, number] }
}

const [RX, RZ] = RIG_SLOT
const ALPHA: Deck[] = [
  {
    id: 'drillfloor', label: 'Drill floor & derrick', el: 'EL +46',
    blurb: 'Rotary table over the well being drilled, top drive, racked stands, driller’s cabin. The derrick tops out at EL +89.',
    view: { pos: [38, 62, 10], target: [RX, 52, RZ], ceiling: true },
    walk: { level: 'drillfloor', at: [RX + 4.6, RZ + 5.6], face: [RX, RZ] },
  },
  {
    id: 'weather', label: 'Weather deck', el: 'EL +38',
    blurb: 'Gas turbine generators, transformers, nitrogen package, mud module and pipe deck, crane, quarters & helideck.',
    view: { pos: [52, 72, 52], target: [2, 40, 0], ceiling: true },
    walk: { level: 'weather', at: [17.5, 12.5], face: [7, 8] },
  },
  {
    id: 'production', label: 'Production deck', el: 'EL +28',
    blurb: 'Separation, compression, export, produced water, TEG & fuel gas, utilities, pipe rack. Weather deck lifted off.',
    view: { pos: [44, 64, 40], target: [0, 29, 0], ceiling: false },
    walk: { level: 'production', at: [0, 3.5], face: [-10, 3.5] },
  },
  {
    id: 'cellar', label: 'Cellar deck: wellheads', el: 'EL +20',
    blurb: 'Christmas trees and the BOP on the conductors, flowlines rising to the manifold, caisson pumps, HPU. Production deck cut away.',
    view: { pos: [30, 40, 22], target: [2, 21, -8], ceiling: false, cut: -0.8 },
    walk: { level: 'cellar', at: [0, -7], face: [0, -12] },
  },
  {
    id: 'subsea', label: 'Wells, conductors & seabed', el: 'EL −62',
    blurb: 'Conductors and caissons down the jacket, risers, and the drill string with its bit below the mudline.',
    view: { pos: [34, -40, 26], target: [RX, -62, RZ], ceiling: true },
  },
  {
    id: 'whp', label: 'North bridge & wellhead platform (WHP-N)', el: 'EL +28',
    blurb: '40 m bridge to WHP-N: six-well bay, production & test manifolds, multiphase meter, desander, chemical injection, vent KO drum, temporary refuge.',
    view: { pos: [58, 46, -118], target: [12, 28, -74], ceiling: true },
    walk: { level: 'production', at: [12, -21], face: [12, -60] },
  },
  {
    id: 'rp', label: 'West bridge & riser platform (RP)', el: 'EL +28',
    blurb: '40 m bridge to RP: oil & gas fiscal metering, pig launchers, riser drops, riser blowdown to the cold vent, SSIV panel, temporary refuge, crane.',
    view: { pos: [-48, 50, 18], target: [-84, 28, -14], ceiling: true },
    walk: { level: 'production', at: [BRIDGE_W.walk.x0 - 0.8, (BRIDGE_W.walk.z0 + BRIDGE_W.walk.z1) / 2], face: [-90, (BRIDGE_W.walk.z0 + BRIDGE_W.walk.z1) / 2] },
  },
  {
    id: 'rp-cellar', label: 'RP cellar deck: riser tops & riser ESDVs', el: 'EL +20',
    blurb: 'Oil and gas export riser tops with their topsides ESD valves and hang-offs, the boat-landing ladder and the stair up to the main deck.',
    view: { pos: [-60, 24.6, -21], target: [-78, 20.6, -6], ceiling: true, box: { min: [RP.deck.x0 - 2, -14, RP.deck.z0 - 4], max: [RP.deck.x1 + 2, -0.8, RP.deck.z1 + 2] } },
    walk: { level: 'cellar', at: [-80, -14], face: [-75, -7] },
  },
  {
    id: 'wi', label: 'North-north bridge & water-injection platform (WI)', el: 'EL +28',
    blurb: '40 m bridge from WHP-N to WI: filtration, vacuum deaerator, 2 × 2.6 MW injection pumps, injection ESDV, chemical injection, local equipment room, crane.',
    view: { pos: [52, 48, -110], target: [11, 29, -142], ceiling: true },
    walk: { level: 'production', at: [(BRIDGE_NN.walk.x0 + BRIDGE_NN.walk.x1) / 2, WI.deck.z1 - 0.8], face: [12, -145] },
  },
  {
    id: 'wi-cellar', label: 'WI cellar deck: seawater lift pumps', el: 'EL +20',
    blurb: 'The two seawater lift caisson pumps with their discharge header rising to the filters, the boat-landing ladder and the stair up to the main deck.',
    view: { pos: [-16, 25, -120], target: [5, 20.5, -144], ceiling: true, box: { min: [WI.deck.x0 - 4, -14, WI.deck.z0 - 2], max: [WI.deck.x1 + 2, -0.8, WI.deck.z1 + 2] } },
    walk: { level: 'cellar', at: [6.5, -140], face: [3, -145] },
  },
  {
    id: 'lq', label: 'South bridge & accommodation platform', el: 'EL +28',
    blurb: '40 m bridge to the LQ: control room, emergency generator, quarters, helideck, telecom tower, lifeboats.',
    view: { pos: [52, 46, 112], target: [8, 34, 72], ceiling: true },
    walk: { level: 'production', at: [(BRIDGE_S.walk.x0 + BRIDGE_S.walk.x1) / 2, 21], face: [6, 60] },
  },
]

function show(d: Deck) {
  const s = useStore.getState()
  s.setLayer('ceiling', d.view.ceiling)
  if (d.view.box) s.setSection({ enabled: true, min: d.view.box.min, max: d.view.box.max })
  else if (d.view.cut !== undefined) s.setSection({ enabled: true, min: [-31, -14, -21], max: [31, d.view.cut, 21] })
  else s.setSection({ enabled: false })
  s.requestFlyTo(d.view.pos, d.view.target)
}

export function DeckNavigator({ onClose }: { onClose: () => void }) {
  const plant = usePlant()
  const alpha = plant.deck.site === 'offshoreAlpha' && plant.deck.walk?.some((l) => l.id === 'drillfloor')
  const levels = walkLevels(plant)
  const decks: Deck[] = alpha
    ? ALPHA
    : levels.map((l) => ({ id: l.id, label: l.label, el: '', blurb: '', view: { pos: [40, 40 + l.y, 40], target: [0, 28 + l.y, 0], ceiling: true }, walk: { level: l.id, at: [0, 0] } }))
  return (
    <div className="pop decks">
      <div className="decks-head">
        <b>Decks</b>
        <button
          className="pop-item"
          onClick={() => {
            const s = useStore.getState()
            s.setLayer('ceiling', true)
            s.setSection({ enabled: false })
            s.requestPreset(alpha ? 'field' : 'overview')
            onClose()
          }}
        >
          Show everything
        </button>
      </div>
      {decks.map((d) => (
        <div key={d.id} className="deck-row">
          <div className="deck-info">
            <div>
              {d.label} {d.el && <span className="muted small mono">{d.el}</span>}
            </div>
            {d.blurb && <div className="muted small">{d.blurb}</div>}
          </div>
          <div className="deck-actions">
            <button onClick={() => (show(d), onClose())}>Show</button>
            {d.walk && (
              <button onClick={() => (useStore.getState().startWalk(d.walk!), onClose())} title="Walk around this deck (arrow keys)">
                Walk
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
