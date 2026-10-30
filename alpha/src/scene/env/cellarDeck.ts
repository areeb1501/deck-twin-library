/**
 * Cellar deck (WORLD coords, plate top y = 20 = deck-local -8): framing, plate + grating bays,
 * outline equipment (drain drums, firewater pumps + caissons, wellheads on the conductors),
 * guard rails with openings for the stair towers and the boat-landing ladder.
 */
import type { GeoBatch } from '../structure/batch'
import { boxMinMax, place, tube, unitCyl } from '../structure/batch'
import { DECK } from '../structure/deckConst'
import { buildFraming } from '../structure/deckSteel'
import { gratingRect, partition, plateRect, type GratingBatches } from '../structure/panels'
import { perimeterDistance, railPolyline, type RailBatches } from '../structure/handrail'
import { STAIR_TOWERS, towerGap } from '../structure/stairs'
import { JACKET, legAt } from './jacket'

export const CELLAR_Y = 20

export interface CellarBatches extends GratingBatches {
  primary: GeoBatch
  secondary: GeoBatch
  plate: GeoBatch
  rail: RailBatches
  equip: GeoBatch
  equipDark: GeoBatch
  red: GeoBatch
  tree: GeoBatch
}

const cylY = (b: GeoBatch, x: number, y0: number, y1: number, z: number, r: number, seg = 20) =>
  place(b, unitCyl(seg, false), [x, (y0 + y1) / 2, z], [0, 0, 0], [r, y1 - y0, r])
const cylX = (b: GeoBatch, x0: number, x1: number, y: number, z: number, r: number, seg = 20) =>
  place(b, unitCyl(seg, false), [(x0 + x1) / 2, y, z], [0, 0, Math.PI / 2], [r, x1 - x0, r])

export function buildCellarDeck(cb: CellarBatches) {
  const Y = CELLAR_Y
  buildFraming(cb.primary, cb.secondary, Y - 0.03)
  // surfaces: plate except two grating bays and the well bay
  const G = [
    { x0: -22, x1: -9, z0: -6, z1: 6 },
    { x0: 9, x1: 22, z0: -6, z1: 6 },
    { x0: -5, x1: 5, z0: -15, z1: -8.5 },
  ]
  for (const { rect: r, solid } of partition({ x0: DECK.x0, x1: DECK.x1, z0: DECK.z0, z1: DECK.z1 }, G)) {
    if (solid) {
      for (let x = r.x0; x < r.x1 - 0.01; x += 1) gratingRect(cb, x, r.z0, Math.min(x + 1, r.x1), r.z1, Y)
    } else plateRect(cb.plate, r.x0, r.z0, r.x1, r.z1, Y, 0.03)
  }
  // guard rails
  const e = 0.05
  const pts: [number, number][] = [
    [DECK.x0 + e, DECK.z0 + e],
    [DECK.x1 - e, DECK.z0 + e],
    [DECK.x1 - e, DECK.z1 - e],
    [DECK.x0 + e, DECK.z1 - e],
  ]
  const gaps: [number, number][] = STAIR_TOWERS.map((t) => {
    const [g0, g1] = towerGap(t)
    const x = t.edgeX > 0 ? DECK.x1 - e : DECK.x0 + e
    const a = perimeterDistance(pts, x, g0)
    const b = perimeterDistance(pts, x, g1)
    return [Math.min(a, b), Math.max(a, b)]
  })
  const la = perimeterDistance(pts, 4.05, DECK.z1 - e)
  const lb = perimeterDistance(pts, 4.95, DECK.z1 - e)
  gaps.push([Math.min(la, lb), Math.max(la, lb)])
  railPolyline(cb.rail, pts, Y, gaps, true)

  // wellheads + christmas trees on the conductors
  for (const [x, z] of JACKET.conductors) {
    cylY(cb.tree, x, Y, Y + 0.6, z, 0.42)
    cylY(cb.tree, x, Y + 0.6, Y + 1.0, z, 0.5)
    boxMinMax(cb.tree, [x - 0.28, Y + 1.0, z - 0.28], [x + 0.28, Y + 2.1, z + 0.28])
    cylX(cb.tree, x - 0.75, x + 0.75, Y + 1.5, z, 0.12, 12)
    cylY(cb.equipDark, x, Y + 2.1, Y + 2.6, z, 0.2, 12)
    place(cb.equipDark, unitCyl(16, false), [x + 0.75, Y + 1.5, z], [0, 0, Math.PI / 2], [0.25, 0.08, 0.25])
  }
  // closed drain drum on saddles
  cylX(cb.equip, -21, -14, Y + 1.5, -12.5, 1.1, 28)
  for (const x of [-20, -15]) boxMinMax(cb.equipDark, [x - 0.2, Y, -13.4], [x + 0.2, Y + 1.0, -11.6])
  // open drain tank
  cylY(cb.equip, -26, Y, Y + 3.2, -4, 1.4, 28)
  // firewater pumps (red) + lift caissons through the east edge
  for (const z of [11.5, 15]) {
    boxMinMax(cb.equipDark, [17, Y, z - 1], [25, Y + 0.3, z + 1])
    cylX(cb.red, 17.5, 21.5, Y + 1.1, z, 0.6)
    boxMinMax(cb.red, [21.8, Y + 0.3, z - 0.6], [24.2, Y + 1.8, z + 0.6])
    tube(cb.red, [24.2, Y + 1.0, z], [28.6, Y + 1.0, z], 0.2, 12, true)
    tube(cb.red, [28.6, -18, z], [28.6, Y + 1.0, z], 0.36, 16, false)
    for (const y of [JACKET.frames[0], JACKET.frames[1]]) tube(cb.equipDark, [legAt(1, 1, y)[0], y, z], [28.6, y, z], 0.15, 8, true)
  }
  // HPU / utility skids
  boxMinMax(cb.equip, [-6, Y, 9], [-1, Y + 2.2, 12.5])
  boxMinMax(cb.equipDark, [2, Y, 9.5], [6, Y + 1.6, 12])
}
