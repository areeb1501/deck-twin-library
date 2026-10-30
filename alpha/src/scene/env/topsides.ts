/**
 * Everything standing ON the upper (weather) deck, world coordinates (deck plate top y = 38).
 * Lower-poly but well proportioned: living quarters + lifeboats, helideck, turbine enclosures + exhaust
 * stacks, switchgear module, containers (the pedestal cranes are Cranes.tsx, the vent stack Vents.tsx),
 * perimeter guard rail. The flare boom is separate (kept when topsides are hidden). The drilling rig,
 * pipe deck, mud module and bulk silos are in drillingRig.ts.
 */
import * as THREE from 'three'
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, box, boxMinMax, place, tube } from '../structure/batch'
import { railPolyline, perimeterDistance, type RailBatches } from '../structure/handrail'
import { ladder } from '../structure/ladder'
import { STAIR_TOWERS, towerGap } from '../structure/stairs'
import { DECK } from '../structure/deckConst'
import { CRANE_PED } from './crane'

export const UD = 38 // weather-deck plate top, world
export const QUARTERS = { x0: -29, x1: -15, z0: -12, z1: 6, storeys: 4, storey: 3.2 }
export const HELIDECK = { x: -31, z: -3, y: UD + 4 * 3.2 + 4.6, r: 11.5 }
export const CRANE = { x: 24, z: -17, pedestalTop: UD + CRANE_PED.bearing }
export const FLARE = {
  base: [29.6, UD + 1.5, 8] as V3,
  dir: new THREE.Vector3(0.924 * Math.SQRT1_2, Math.SQRT1_2, 0.383 * Math.SQRT1_2).normalize(),
  length: 70,
}
export function flareTip(): V3 {
  const d = FLARE.dir
  const b = FLARE.base
  return [b[0] + d.x * FLARE.length, b[1] + d.y * FLARE.length, b[2] + d.z * FLARE.length]
}

export interface TopsideBatches {
  steel: GeoBatch
  steelDark: GeoBatch
  white: GeoBatch
  facade: GeoBatch
  roof: GeoBatch
  glass: GeoBatch
  yellow: GeoBatch
  orange: GeoBatch
  heli: GeoBatch
  heliLights: GeoBatch
  net: GeoBatch
  soot: GeoBatch
  red: GeoBatch
  blue: GeoBatch
  green: GeoBatch
  /** aviation obstruction lights (emissive); falls back to red */
  light?: GeoBatch
  rail: RailBatches
}

const capsule = new THREE.CapsuleGeometry(1, 1, 6, 16)
const octagon = (() => {
  const g = new THREE.CircleGeometry(1, 8, Math.PI / 8)
  g.rotateX(-Math.PI / 2)
  return g
})()
const cylClosed = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false)

/** Lattice: 4 chords from heel section to tip section with zig-zag lacing on every face. */
function lattice(b: GeoBatch, lace: GeoBatch, a: V3, e: V3, w0: number, w1: number, up: V3, chordR: number, laceR: number, bay = 1.6, tri = false) {
  const A = new THREE.Vector3(...a)
  const E = new THREE.Vector3(...e)
  const ax = E.clone().sub(A)
  const L = ax.length()
  ax.normalize()
  const u = new THREE.Vector3(...up)
  u.sub(ax.clone().multiplyScalar(u.dot(ax))).normalize()
  const s = new THREE.Vector3().crossVectors(ax, u).normalize()
  const corners: [number, number][] = tri
    ? [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0, 0.5],
      ]
    : [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ]
  const at = (t: number, k: number): V3 => {
    const w = w0 + (w1 - w0) * t
    const [cs, cu] = corners[k]
    const p = A.clone().addScaledVector(ax, L * t).addScaledVector(s, cs * w).addScaledVector(u, cu * w)
    return [p.x, p.y, p.z]
  }
  for (let k = 0; k < corners.length; k++) tube(b, at(0, k), at(1, k), chordR, 8, true)
  const n = Math.max(2, Math.round(L / bay))
  for (let i = 0; i < n; i++) {
    const t0 = i / n
    const t1 = (i + 1) / n
    for (let k = 0; k < corners.length; k++) {
      const k2 = (k + 1) % corners.length
      if (i % 2 === 0) tube(lace, at(t0, k), at(t1, k2), laceR, 5, true)
      else tube(lace, at(t0, k2), at(t1, k), laceR, 5, true)
      // battens
      tube(lace, at(t0, k), at(t0, k2), laceR * 0.8, 5, true)
    }
  }
  return { at }
}

export function buildFlareBoom(steel: GeoBatch, lace: GeoBatch, dark: GeoBatch) {
  const b = FLARE.base
  const tip = flareTip()
  lattice(steel, lace, b, tip, 2.6, 1.3, [0, 1, 0], 0.1, 0.045, 2.4, true)
  // flare header inside the boom
  tube(dark, [b[0], b[1] + 0.1, b[2]], tip, 0.32, 12, true)
  // base pedestal / hinge frame on the deck edge
  tube(steel, [b[0] - 1.5, UD, b[2] - 1.5], [b[0], b[1], b[2]], 0.25, 10, true)
  tube(steel, [b[0] - 1.5, UD, b[2] + 1.5], [b[0], b[1], b[2]], 0.25, 10, true)
  boxMinMax(steel, [b[0] - 2.2, UD, b[2] - 2.2], [b[0] - 0.8, UD + 0.4, b[2] + 2.2])
  // back-stay ties to a support frame on the deck
  const mid = new THREE.Vector3(...b).addScaledVector(FLARE.dir, 26)
  tube(steel, [22, UD, 4], [mid.x, mid.y - 0.6, mid.z], 0.18, 8, true)
  tube(steel, [22, UD, 12], [mid.x, mid.y - 0.6, mid.z], 0.18, 8, true)
  // flare tip: burner + wind shield, pilot lines
  const d = FLARE.dir
  const t1: V3 = [tip[0] + d.x * 3.2, tip[1] + d.y * 3.2, tip[2] + d.z * 3.2]
  tube(dark, tip, t1, 0.45, 18, false)
  tube(dark, [tip[0] + d.x * 2.3, tip[1] + d.y * 2.3, tip[2] + d.z * 2.3], t1, 0.62, 18, true)
  // service platform at the tip
  const pl = new THREE.Vector3(...tip).addScaledVector(d, -2)
  boxMinMax(steel, [pl.x - 1.6, pl.y - 1.4, pl.z - 1.6], [pl.x + 1.6, pl.y - 1.32, pl.z + 1.6])
}

export function buildTopsides(tb: TopsideBatches) {
  // ---------------- jacket leg stubs above the weather deck (padeye caps)
  for (const [x, z] of DECK.legs) {
    if ((x > 20 && z < -10) || (x < -20 && z > 10)) continue // NE + SW legs carry the crane pedestals
    place(tb.steel, cylClosed, [x, UD + 0.35, z], [0, 0, 0], [DECK.legOD / 2, 0.7, DECK.legOD / 2])
    box(tb.steel, [x, UD + 0.95, z], [0.08, 0.5, 0.6])
  }
  // ---------------- perimeter guard rail with stair openings
  {
    const e = 0.05
    const pts: [number, number][] = [
      [DECK.x0 + e, DECK.z0 + e],
      [DECK.x1 - e, DECK.z0 + e],
      [DECK.x1 - e, DECK.z1 - e],
      [DECK.x0 + e, DECK.z1 - e],
    ]
    const gaps = STAIR_TOWERS.map((t) => {
      const [g0, g1] = towerGap(t)
      const x = t.edgeX > 0 ? DECK.x1 - e : DECK.x0 + e
      const a = perimeterDistance(pts, x, g0)
      const b2 = perimeterDistance(pts, x, g1)
      return [Math.min(a, b2), Math.max(a, b2)] as [number, number]
    })
    // the quarters west wall sits near the edge; the flare boom base needs an opening
    const fz = FLARE.base[2]
    const fa = perimeterDistance(pts, DECK.x1 - e, fz - 2.6)
    const fb = perimeterDistance(pts, DECK.x1 - e, fz + 2.6)
    gaps.push([Math.min(fa, fb), Math.max(fa, fb)])
    railPolyline(tb.rail, pts, UD, gaps, true)
  }

  // ---------------- living quarters
  const Q = QUARTERS
  const qTop = UD + Q.storeys * Q.storey
  boxMinMax(tb.facade, [Q.x0, UD, Q.z0], [Q.x1, qTop, Q.z1], 'world')
  boxMinMax(tb.roof, [Q.x0 - 0.05, qTop, Q.z0 - 0.05], [Q.x1 + 0.05, qTop + 0.25, Q.z1 + 0.05])
  // parapet + roof plant
  for (const [a, b] of [
    [[Q.x0, Q.z0], [Q.x1, Q.z0 + 0.15]],
    [[Q.x0, Q.z1 - 0.15], [Q.x1, Q.z1]],
    [[Q.x0, Q.z0], [Q.x0 + 0.15, Q.z1]],
    [[Q.x1 - 0.15, Q.z0], [Q.x1, Q.z1]],
  ] as [[number, number], [number, number]][])
    boxMinMax(tb.white, [a[0], qTop + 0.25, a[1]], [b[0], qTop + 1.1, b[1]])
  boxMinMax(tb.steelDark, [-20, qTop + 0.25, 1], [-16, qTop + 2.2, 5]) // HVAC
  boxMinMax(tb.white, [-27, qTop + 0.25, 2], [-24, qTop + 3.0, 5]) // stair house
  // external escape stair landings on the east wall (simple slabs)
  for (let s = 1; s <= Q.storeys; s++) boxMinMax(tb.steel, [Q.x1, UD + s * Q.storey - 0.15, -11], [Q.x1 + 1.4, UD + s * Q.storey, -7])
  for (let s = 1; s <= Q.storeys; s++) railPolyline(tb.rail, [[Q.x1 + 1.35, -11], [Q.x1 + 1.35, -7]], UD + s * Q.storey)
  // doors
  boxMinMax(tb.steelDark, [Q.x1, UD, -2.6], [Q.x1 + 0.05, UD + 2.2, -1.4])
  boxMinMax(tb.steelDark, [Q.x1, UD + Q.storey, -10.2], [Q.x1 + 0.05, UD + Q.storey + 2.1, -9.2])

  // ---------------- lifeboats (TEMPSC) in davits on the west face, under the helideck
  for (const zc of [-7.2, 2.2]) {
    const x = -31.8
    const y = UD + 3.4
    place(tb.orange, capsule, [x, y, zc], [Math.PI / 2, 0, 0], [1.45, 2.8, 1.2])
    // white canopy band + hatch
    place(tb.white, capsule, [x, y + 0.55, zc], [Math.PI / 2, 0, 0], [1.2, 2.0, 0.85])
    boxMinMax(tb.orange, [x - 0.5, y + 1.25, zc - 1.5], [x + 0.5, y + 1.55, zc - 0.6])
    // gravity davits: two arms + falls
    for (const dz of [-2.8, 2.8]) {
      const z = zc + dz
      bar(tb.steelDark, [-29.6, UD, z], [-29.6, UD + 6.0, z], 0.3, 0.3)
      bar(tb.steelDark, [-29.6, UD + 6.0, z], [-31.8, UD + 6.6, z], 0.25, 0.35)
      tube(tb.steelDark, [-31.8, UD + 6.5, z], [x, y + 1.0, z * 0.85 + zc * 0.15], 0.015, 4, true)
    }
  }

  // ---------------- helideck on a support truss above the quarters, cantilevered west
  {
    const H = HELIDECK
    place(tb.heli, octagon, [H.x, H.y, H.z], [0, 0, 0], [H.r, 1, H.r])
    // deck edge / sub-structure plate
    place(tb.steelDark, new THREE.CylinderGeometry(1, 1, 1, 8, 1, false, Math.PI / 8 + Math.PI / 2), [H.x, H.y - 0.25, H.z], [0, 0, 0], [H.r, 0.48, H.r])
    // perimeter lights + safety net shelf (grating-like mesh)
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2 + Math.PI / 8
      const a1 = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8
      const p0: V3 = [H.x + Math.cos(a0) * H.r, H.y, H.z - Math.sin(a0) * H.r]
      const p1: V3 = [H.x + Math.cos(a1) * H.r, H.y, H.z - Math.sin(a1) * H.r]
      for (let j = 0; j < 4; j++) {
        const t = (j + 0.5) / 4
        box(tb.heliLights, [p0[0] + (p1[0] - p0[0]) * t, H.y + 0.06, p0[2] + (p1[2] - p0[2]) * t], [0.18, 0.12, 0.18])
      }
      // net shelf: quad from rim outward 1.5 m, sloping up 10 deg
      const o = 1.5
      const q0: V3 = [H.x + Math.cos(a0) * (H.r + o), H.y + 0.15, H.z - Math.sin(a0) * (H.r + o)]
      const q1: V3 = [H.x + Math.cos(a1) * (H.r + o), H.y + 0.15, H.z - Math.sin(a1) * (H.r + o)]
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...q1, ...q0], 3))
      g.setIndex([0, 1, 2, 0, 2, 3])
      g.computeVertexNormals()
      tb.net.add(g, new THREE.Matrix4(), 'world')
      tube(tb.steel, q0, q1, 0.04, 6, true)
      // radial truss members down to the quarters roof / west wall
      const rim: V3 = [H.x + Math.cos(a0) * H.r * 0.95, H.y - 0.5, H.z - Math.sin(a0) * H.r * 0.95]
      const foot: V3 = [
        Math.min(Math.max(rim[0], Q.x0 + 0.5), Q.x1 - 0.5),
        rim[0] < Q.x0 ? UD + 6.5 : qTop + 0.3,
        Math.min(Math.max(rim[2], Q.z0 + 0.5), Q.z1 - 0.5),
      ]
      if (rim[0] < Q.x0) foot[0] = Q.x0
      tube(tb.steel, rim, foot, 0.2, 10, true)
      tube(tb.steel, rim, [H.x, H.y - 0.5, H.z], 0.16, 8, true)
    }
    // vertical posts from the roof
    for (const [x, z] of [
      [-27, -10],
      [-17, -10],
      [-27, 4],
      [-17, 4],
    ])
      tube(tb.steel, [x, qTop + 0.25, z], [x, H.y - 0.5, z], 0.3, 12, true)
    // access ladder from the roof
    ladder(tb.steel, [-16, qTop + 0.25, 5.2], H.y - qTop - 0.25, [1, 0], true)
  }

  // ---------------- pedestal cranes CR-A1 (NE leg) and CR-A2 (SW leg): drawn and animated by Cranes.tsx
  // (geometry crane.ts, layout model/cranes.ts)

  // (turbine generators are plant equipment now: GT-8100A/B in model/alphaSite.ts)

  // ---------------- switchgear / LER module, 2-storey (moved south-west: the mud module took its slot)
  boxMinMax(tb.white, [-13, UD, 8], [-3, UD + 7.0, 17], 'world')
  boxMinMax(tb.roof, [-13.1, UD + 7.0, 7.9], [-2.9, UD + 7.25, 17.1])
  boxMinMax(tb.steelDark, [-10, UD + 7.25, 10.5], [-6, UD + 8.8, 14.5])
  for (const x of [-11.5, -5.5]) boxMinMax(tb.steelDark, [x, UD, 7.95], [x + 1.2, UD + 2.2, 8.0])

  // ---------------- laydown: ISO containers + cargo baskets (south strip; the pipe deck took the old laydown)
  boxMinMax(tb.red, [3, UD, 15.5], [9.06, UD + 2.59, 17.94])
  boxMinMax(tb.blue, [9.5, UD, 15.5], [15.56, UD + 2.59, 17.94])
  boxMinMax(tb.green, [3.5, UD + 2.59, 15.7], [6.5, UD + 4.9, 17.7])
  boxMinMax(tb.steelDark, [17, UD, 15.8], [20, UD + 1.0, 18.3])

  // ---------------- deck crane laydown markings: hatched yellow kerb boxes
  for (const [x0, z0, x1, z1] of [[2.5, 15, 21, 18.8]] as [number, number, number, number][]) {
    boxMinMax(tb.yellow, [x0, UD, z0], [x1, UD + 0.08, z0 + 0.12])
    boxMinMax(tb.yellow, [x0, UD, z1 - 0.12], [x1, UD + 0.08, z1])
    boxMinMax(tb.yellow, [x0, UD, z0], [x0 + 0.12, UD + 0.08, z1])
    boxMinMax(tb.yellow, [x1 - 0.12, UD, z0], [x1, UD + 0.08, z1])
  }
}
