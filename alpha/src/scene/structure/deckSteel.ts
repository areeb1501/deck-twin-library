/**
 * Deck framing (production deck + upper-deck "ceiling"), walking surfaces, markings, legs,
 * columns and the perimeter guard rail.
 */
import * as THREE from 'three'
import type { GeoBatch } from './batch'
import { beamTOS, boxMinMax, ibeam, spans, tube, unitPlaneY } from './batch'
import { SECTIONS, type SectionName } from '../../model/catalog'
import { DECK, type SolidArea } from './deckConst'
import { gratingRect, partition, plateRect, type GratingBatches, type Rect } from './panels'
import { perimeterDistance, railPolyline, type RailBatches } from './handrail'
import { STAIR_TOWERS, towerGap } from './stairs'
import { signUV } from './textures'
import { BRIDGE_S } from '../../model/site'

const half = (s: SectionName) => SECTIONS[s].b / 2

/**
 * Orthogonal floor framing at a given top-of-steel. X-primaries continuous; Z-primaries frame
 * between X-primaries; X-secondaries frame between Z-members. Edge beams around the perimeter.
 */
export function buildFraming(primary: GeoBatch, secondary: GeoBatch, tos: number) {
  const { x0, x1, z0, z1, edgeInset } = DECK
  const ex0 = x0 + edgeInset
  const ex1 = x1 - edgeInset
  const ez0 = z0 + edgeInset
  const ez1 = z1 - edgeInset
  const P = 'HEB 600' as const
  const S = 'IPE 300' as const
  // edge beams along Z (continuous) and along X (between them)
  for (const x of [ex0, ex1]) beamTOS(secondary, x, z0, x, z1, tos, S)
  const xin0 = ex0 + half(S)
  const xin1 = ex1 - half(S)
  for (const z of [ez0, ez1]) beamTOS(secondary, xin0, z, xin1, z, tos, S)
  // primaries along X (continuous between edge beams)
  for (const z of DECK.primaryX) beamTOS(primary, xin0, z, xin1, z, tos, P)
  // primaries along Z, framing between X primaries and the edge beams
  const zCuts = [...DECK.primaryX.map((z) => ({ at: z, half: half(P) })), { at: ez0, half: half(S) }, { at: ez1, half: half(S) }]
  for (const x of DECK.primaryZ) {
    for (const [a, b] of spans(z0, z1, zCuts)) beamTOS(primary, x, a, x, b, tos, P)
  }
  // secondaries along X between Z members
  const xCuts = [...DECK.primaryZ.map((x) => ({ at: x, half: half(P) })), { at: ex0, half: half(S) }, { at: ex1, half: half(S) }]
  for (const z of DECK.secondaryX) {
    for (const [a, b] of spans(x0, x1, xCuts)) beamTOS(secondary, a, z, b, z, tos, S)
  }
  // short secondaries along Z in the cantilever bays (x beyond +-24) at mid-bay, stiffening the edge
  for (const x of [-27, 27]) {
    for (const [a, b] of spans(z0, z1, [...zCuts, ...DECK.secondaryX.map((z) => ({ at: z, half: half(S) }))])) {
      if (b - a > 1.0) beamTOS(secondary, x, a, x, b, tos, S)
    }
  }
}

export interface SurfaceBatches extends GratingBatches {
  plate: GeoBatch
  kerb: GeoBatch
  drain: GeoBatch
  paint: GeoBatch
  decal: GeoBatch
}

/** Panelise the production deck: grating everywhere except plated areas. */
export function buildDeckSurface(sb: SurfaceBatches, solidAreas: SolidArea[]) {
  const { x0, x1, z0, z1, perimeterWalk: pw } = DECK
  const outer: Rect = { x0, x1, z0, z1 }
  const plated: Rect[] = [
    ...solidAreas,
    // escape aisles
    ...DECK.aisles.map((a) => ({ x0: x0 + pw, x1: x1 - pw, z0: a.z0, z1: a.z1 })),
    // perimeter walkway
    { x0, x1, z0, z1: z0 + pw },
    { x0, x1, z0: z1 - pw, z1 },
    { x0, x1: x0 + pw, z0, z1 },
    { x0: x1 - pw, x1, z0, z1 },
    // collars around legs and columns
    ...DECK.legs.map(([x, z]) => ({ x0: x - 1.3, x1: x + 1.3, z0: z - 1.3, z1: z + 1.3 })),
    ...DECK.columns.map(([x, z]) => ({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45 })),
  ]
  const cells = partition(outer, plated)
  // support lines along X (where grating panels butt) -> split panels there
  const zLines = [...DECK.primaryX, ...DECK.secondaryX].sort((a, b) => a - b)
  for (const { rect: r, solid } of cells) {
    if (solid) {
      plateRect(sb.plate, r.x0, r.z0, r.x1, r.z1, 0, 0.03)
      continue
    }
    // grating panels ~1 m wide (bearing bars along Z), split at support lines
    const zs = [r.z0, ...zLines.filter((z) => z > r.z0 + 0.3 && z < r.z1 - 0.3), r.z1]
    const xs: number[] = [r.x0]
    for (let x = Math.ceil(r.x0 + 0.35); x < r.x1 - 0.35; x += 1) xs.push(x)
    xs.push(r.x1)
    for (let j = 0; j < zs.length - 1; j++)
      for (let i = 0; i < xs.length - 1; i++) gratingRect(sb, xs[i], zs[j], xs[i + 1], zs[j + 1], 0, 0.025)
  }
  // drip-pan kerbs (60 mm coaming) + drain sump on the equipment footprints
  for (const a of solidAreas) {
    const h = 0.06
    const t = 0.01
    boxMinMax(sb.kerb, [a.x0, 0, a.z0], [a.x1, h, a.z0 + t])
    boxMinMax(sb.kerb, [a.x0, 0, a.z1 - t], [a.x1, h, a.z1])
    boxMinMax(sb.kerb, [a.x0, 0, a.z0 + t], [a.x0 + t, h, a.z1 - t])
    boxMinMax(sb.kerb, [a.x1 - t, 0, a.z0 + t], [a.x1, h, a.z1 - t])
    const cx = a.x0 + 0.6
    const cz = a.z1 - 0.6
    boxMinMax(sb.drain, [cx - 0.2, 0, cz - 0.2], [cx + 0.2, 0.012, cz + 0.2])
  }
  buildMarkings(sb)
}

const _m = new THREE.Matrix4()
const _r = new THREE.Matrix4()

function paintStrip(b: GeoBatch, x0: number, z0: number, x1: number, z1: number) {
  _m.makeScale(x1 - x0, 1, z1 - z0).setPosition((x0 + x1) / 2, 0, (z0 + z1) / 2)
  b.add(unitPlaneY(), _m)
}

let arrowGeo: THREE.BufferGeometry | null = null
function arrowPlane() {
  if (arrowGeo) return arrowGeo
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const [u0, v0, u1, v1] = signUV('arrow')
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
  arrowGeo = g
  return g
}

/** Green escape-route edge lines + direction arrows (polygon-offset decals on plate). */
function buildMarkings(sb: SurfaceBatches) {
  const { x0, x1, z0, z1, perimeterWalk: pw } = DECK
  const w = 0.08
  for (const a of DECK.aisles) {
    paintStrip(sb.paint, x0 + pw, a.z0 + 0.06, x1 - pw, a.z0 + 0.06 + w)
    paintStrip(sb.paint, x0 + pw, a.z1 - 0.06 - w, x1 - pw, a.z1 - 0.06)
  }
  // perimeter inner edge line
  const i = pw - 0.06
  paintStrip(sb.paint, x0 + i - w, z0 + i - w, x1 - i + w, z0 + i)
  paintStrip(sb.paint, x0 + i - w, z1 - i, x1 - i + w, z1 - i + w)
  paintStrip(sb.paint, x0 + i - w, z0 + i, x0 + i, z1 - i)
  paintStrip(sb.paint, x1 - i, z0 + i, x1 - i + w, z1 - i)
  // arrows: +z aisle leads west (ST-W), -z aisle leads east (ST-E)
  for (const a of DECK.aisles) {
    const zc = (a.z0 + a.z1) / 2
    const dir = zc > 0 ? -1 : 1
    for (let x = -24; x <= 24; x += 8) {
      _r.makeRotationY(dir > 0 ? 0 : Math.PI)
      _m.makeScale(0.9, 1, 0.9).premultiply(_r).setPosition(x + 3, 0, zc)
      sb.decal.add(arrowPlane(), _m)
    }
  }
}

/** Jacket legs (vertical part through the topsides) and deck-to-deck columns. */
export function buildLegsColumns(legs: GeoBatch, steel: GeoBatch, capLegs = false) {
  const [ya, yb] = DECK.legSpan
  for (const [x, z] of DECK.legs) {
    tube(legs, [x, ya, z], [x, yb, z], DECK.legOD / 2, 40, true)
    // closing cap when the upper-deck plate is hidden (otherwise it would be coplanar with the plate)
    if (capLegs) tube(legs, [x, yb - 0.03, z], [x, yb, z], DECK.legOD / 2 - 0.001, 40, false)
    // leg can rings (thicker section) at both deck levels
    for (const y of [-0.66, DECK.upperUnderside - 0.02]) tube(legs, [x, y, z], [x, y + 0.04, z], DECK.legOD / 2 + 0.025, 40, false)
  }
  for (const [x, z] of DECK.columns) {
    ibeam(steel, [x, DECK.girderTop, z], [x, DECK.upperUnderside, z], [1, 0, 0], 'HEB 400')
    // cap / base stiffener plates
    boxMinMax(steel, [x - 0.2, DECK.upperUnderside - 0.03, z - 0.17], [x + 0.2, DECK.upperUnderside, z + 0.17])
  }
}

/** Upper-deck ceiling: framing from below + single plate (top at y = 10). */
export function buildUpperDeck(primary: GeoBatch, secondary: GeoBatch, plate: GeoBatch) {
  const tos = DECK.upperTop - 0.015
  buildFraming(primary, secondary, tos)
  plateRect(plate, DECK.x0, DECK.z0, DECK.x1, DECK.z1, DECK.upperTop, 0.015)
}

/** Production-deck perimeter guard rail with stair-tower openings. */
export function buildPerimeterRail(rb: RailBatches, y = 0, inset = 0.05) {
  const { x0, x1, z0, z1 } = DECK
  const pts: [number, number][] = [
    [x0 + inset, z0 + inset],
    [x1 - inset, z0 + inset],
    [x1 - inset, z1 - inset],
    [x0 + inset, z1 - inset],
  ]
  const gaps: [number, number][] = STAIR_TOWERS.map((t) => {
    const [g0, g1] = towerGap(t)
    const x = t.edgeX > 0 ? x1 - inset : x0 + inset
    const a = perimeterDistance(pts, x, g0)
    const b = perimeterDistance(pts, x, g1)
    return [Math.min(a, b), Math.max(a, b)]
  })
  // south edge: landing of the walkway bridge to the LQ platform
  const ba = perimeterDistance(pts, BRIDGE_S.walk.x0, z1 - inset)
  const bb = perimeterDistance(pts, BRIDGE_S.walk.x1, z1 - inset)
  gaps.push([Math.min(ba, bb), Math.max(ba, bb)])
  railPolyline(rb, pts, y, gaps, true)
}
