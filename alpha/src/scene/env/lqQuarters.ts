/**
 * LQ accommodation block on the main deck (WORLD coordinates): 5-storey clad block (procedural facade
 * texture with window rows), doors, HVAC louvres, roof plant, external escape stair on the east wall that
 * continues up to the helideck, east embarkation / muster deck with 2 TEMPSC lifeboats in gravity davits
 * hanging outboard, liferaft canisters, safety signage panels, and the helideck on the roof (net, H
 * marking from the shared helideck texture, perimeter lights, safety-net shelf).
 */
import * as THREE from 'three'
import type { V3 } from '../structure/batch'
import { bar, box, boxMinMax, ibeam, place, sphere, tube, unitCyl } from '../structure/batch'
import { railRun, type RailBatches } from '../structure/handrail'
import type { GratingBatches } from '../structure/panels'
import { LQ } from '../../model/site'
import { buildLqStair, LQ_STAIR, type LqStairDef } from './lqStairs'
import type { LqGet } from './accommodation'

const Y = 28
const Q = LQ.quarters
export const LQ_ROOF_Y = Y + Q.storeys * Q.storey
export const LQ_HELI_Y = LQ_ROOF_Y + Q.storey

/** East embarkation (muster) deck at main-deck level, cantilevered off the east edge; lifeboat stations. */
export const EMBARK = { x0: LQ.deck.x1, x1: LQ.deck.x1 + 2.7, z0: LQ.deck.z0, z1: 80, boats: [65, 74.6] }

/** External escape stair on the east wall: main deck -> every storey -> roof -> helideck. */
export const LQ_ESCAPE_STAIR: LqStairDef = {
  o: [EMBARK.x0, EMBARK.z1],
  u: [0, 1],
  v: [1, 0],
  L: 4.8,
  W: 2.7,
  landing: 1.3,
  lanes: LQ_STAIR.lanes,
  levels: Array.from({ length: Q.storeys + 2 }, (_, i) => Y + i * Q.storey),
  flights: Array.from({ length: Q.storeys + 1 }, () => 2),
  openEndA: (y) => y < Y + 0.01,
  openV0: (y) => y < Y + 0.01,
  // storey landings reach back to the wall doors (x = 20); the top one bridges to the helideck edge
  reach: (y) => (y < Y + 0.01 ? 0 : y > LQ_HELI_Y - 0.01 ? EMBARK.x0 - (LQ.helideck.x + LQ.helideck.r * Math.cos(Math.PI / 8)) : EMBARK.x0 - Q.x1),
}

const capsule = new THREE.CapsuleGeometry(1, 1, 6, 16)
const octagon = (() => {
  const g = new THREE.CircleGeometry(1, 8, Math.PI / 8)
  g.rotateX(-Math.PI / 2)
  return g
})()
const octRim = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false, Math.PI / 8 + Math.PI / 2)

/** Totally enclosed lifeboat, long axis along Z, centre c. */
function tempsc(get: LqGet, c: V3) {
  const [x, y, z] = c
  place(get('white'), capsule, [x, y - 0.45, z], [Math.PI / 2, 0, 0], [1.5, 2.8, 0.95])
  place(get('orange'), capsule, [x, y, z], [Math.PI / 2, 0, 0], [1.4, 2.7, 1.2])
  // coxswain's cupola + windows, hatches, release hooks, fender strake
  boxMinMax(get('orange'), [x - 0.45, y + 0.9, z + 0.7], [x + 0.45, y + 1.65, z + 1.8])
  boxMinMax(get('glass'), [x - 0.47, y + 1.3, z + 0.75], [x + 0.47, y + 1.55, z + 1.75])
  boxMinMax(get('orange'), [x - 0.35, y + 1.0, z - 2.6], [x + 0.35, y + 1.35, z - 1.6])
  for (const dz of [-2.6, 2.6]) tube(get('steelDark'), [x, y + 1.0, z + dz], [x, y + 1.5, z + dz], 0.05, 6, false)
  boxMinMax(get('orange'), [x - 1.47, y - 0.1, z - 0.55], [x - 1.2, y + 0.9, z + 0.55]) // boarding door (inboard)
  tube(get('white'), [x - 1.32, y - 0.32, z - 3.3], [x - 1.32, y - 0.32, z + 3.3], 0.07, 6, true)
  tube(get('white'), [x + 1.32, y - 0.32, z - 3.3], [x + 1.32, y - 0.32, z + 3.3], 0.07, 6, true)
}

function lifeboatStations(get: LqGet) {
  const E = EMBARK
  const bx = E.x1 + 0.35 + 1.45 // boat centre line, outboard of the embarkation deck
  const by = Y + 0.9
  for (const zc of E.boats) {
    tempsc(get, [bx, by, zc])
    for (const dz of [-3.0, 3.0]) {
      const z = zc + dz
      // gravity davit: deck frame, inclined track, arm, back stay, winch, falls
      boxMinMax(get('steelDark'), [E.x1 - 1.1, Y, z - 0.3], [E.x1 - 0.2, Y + 0.35, z + 0.3])
      bar(get('steelDark'), [E.x1 - 0.5, Y + 0.35, z], [E.x1 - 0.05, Y + 5.8, z], 0.3, 0.3, [1, 0, 0])
      bar(get('steelDark'), [E.x1 - 0.05, Y + 5.8, z], [bx, Y + 6.3, z], 0.26, 0.36)
      bar(get('steelDark'), [E.x0 + 0.4, Y, z], [E.x1 - 0.3, Y + 3.6, z], 0.14, 0.14, [1, 0, 0])
      tube(get('steelDark'), [bx, Y + 6.1, z], [bx, by + 1.0, zc + Math.sign(dz) * 2.6], 0.018, 4, true)
      sphere(get('steelDark'), [bx, Y + 6.15, z], 0.16, 8, 6)
      // lifeboat station sign on the davit
      boxMinMax(get('signGreen'), [E.x1 - 0.42, Y + 1.6, z - 0.32], [E.x1 - 0.36, Y + 2.1, z + 0.32])
    }
    boxMinMax(get('equipDark'), [E.x0 + 0.3, Y, zc - 0.5], [E.x0 + 1.0, Y + 0.8, zc + 0.5]) // davit winch
    boxMinMax(get('orange'), [E.x0 + 0.32, Y + 0.95, zc - 0.25], [E.x0 + 0.36, Y + 1.45, zc + 0.25]) // boat no. plate
  }
}

/** Liferaft canisters on cradles hung outboard of the south deck edge. */
function liferafts(get: LqGet) {
  const z = LQ.deck.z1 + 0.5
  for (const x of [5, 6.4, 15.6, 17]) {
    tube(get('white'), [x - 0.62, Y + 0.55, z], [x + 0.62, Y + 0.55, z], 0.32, 16, false)
    for (const dx of [-0.62, 0.62]) place(get('white'), unitCyl(16, false), [x + dx, Y + 0.55, z], [0, 0, Math.PI / 2], [0.3, 0.02, 0.3])
    for (const dx of [-0.35, 0.35]) {
      tube(get('steelDark'), [x + dx - 0.02, Y + 0.55, z], [x + dx + 0.02, Y + 0.55, z], 0.335, 16, true) // strap
      bar(get('galv'), [x + dx, Y + 0.2, LQ.deck.z1], [x + dx, Y + 0.2, z + 0.42], 0.05, 0.05)
      bar(get('galv'), [x + dx, Y - 0.3, LQ.deck.z1], [x + dx, Y + 0.2, z + 0.42], 0.05, 0.05)
    }
    box(get('red'), [x, Y + 0.95, z - 0.25], [0.12, 0.1, 0.06]) // hydrostatic release
  }
}

/** HVAC louvre: frame + horizontal blades on a wall plane `x = wx` (facing -x) spanning z0..z1. */
function louvreX(get: LqGet, wx: number, z0: number, z1: number, y0: number, y1: number) {
  boxMinMax(get('equipDark'), [wx - 0.08, y0, z0], [wx, y1, z1])
  for (let y = y0 + 0.08; y < y1 - 0.04; y += 0.1) bar(get('galv'), [wx - 0.12, y, z0 + 0.05], [wx - 0.12, y, z1 - 0.05], 0.06, 0.025)
}
/** Same on a wall plane `z = wz` (facing -z) spanning x0..x1. */
function louvreZ(get: LqGet, wz: number, x0: number, x1: number, y0: number, y1: number) {
  boxMinMax(get('equipDark'), [x0, y0, wz - 0.08], [x1, y1, wz])
  for (let y = y0 + 0.08; y < y1 - 0.04; y += 0.1) bar(get('galv'), [x0 + 0.05, y, wz - 0.12], [x1 - 0.05, y, wz - 0.12], 0.06, 0.025)
}

function helideck(get: LqGet) {
  const H = LQ.helideck
  const hy = LQ_HELI_Y
  const ap = H.r * Math.cos(Math.PI / 8)
  place(get('heli'), octagon, [H.x, hy, H.z], [0, 0, 0], [H.r, 1, H.r])
  place(get('steelDark'), octRim, [H.x, hy - 0.25, H.z], [0, 0, 0], [H.r, 0.48, H.r])
  // under-frame: radial girders + ring, columns + bracing down to the roof
  const vtx = (k: number, r = H.r): V3 => {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8
    return [H.x + Math.cos(a) * r, hy - 0.75, H.z - Math.sin(a) * r]
  }
  for (let k = 0; k < 8; k++) {
    bar(get('steel'), [H.x, hy - 0.75, H.z], vtx(k, H.r - 0.1), 0.2, 0.5)
    const m0 = vtx(k, ap - 0.4)
    const m1 = vtx(k + 1, ap - 0.4)
    bar(get('steel'), m0, m1, 0.2, 0.5)
  }
  const roof = LQ_ROOF_Y + 0.25
  const cols: [number, number][] = [
    [Q.x0 + 1.2, Q.z0 + 1.2],
    [Q.x1 - 1.2, Q.z0 + 1.2],
    [Q.x0 + 1.2, Q.z1 - 1.2],
    [Q.x1 - 1.2, Q.z1 - 1.2],
    [H.x, Q.z0 + 1.2],
    [H.x, Q.z1 - 1.2],
  ]
  for (const [x, z] of cols) {
    ibeam(get('steel'), [x, roof, z], [x, hy - 1.0, z], [1, 0, 0], 'HEB 300')
    boxMinMax(get('steel'), [x - 0.25, roof, z - 0.25], [x + 0.25, roof + 0.03, z + 0.25])
    // knee braces to the radial frame
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      bar(get('steel'), [x, hy - 2.2, z], [x + dx * 1.2, hy - 1.0, z + dz * 1.2], 0.1, 0.1)
  }
  // perimeter lights (green) + safety-net shelf (open at the escape-stair landing on the east side)
  const stair = { z0: LQ_ESCAPE_STAIR.o[1] - 0.3, z1: LQ_ESCAPE_STAIR.o[1] + LQ_ESCAPE_STAIR.landing + 0.3 }
  const o = 1.5
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2 + Math.PI / 8
    const a1 = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8
    const p0: V3 = [H.x + Math.cos(a0) * H.r, hy, H.z - Math.sin(a0) * H.r]
    const p1: V3 = [H.x + Math.cos(a1) * H.r, hy, H.z - Math.sin(a1) * H.r]
    for (let j = 0; j < 4; j++) {
      const t = (j + 0.5) / 4
      box(get('heliLights'), [p0[0] + (p1[0] - p0[0]) * t, hy + 0.06, p0[2] + (p1[2] - p0[2]) * t], [0.18, 0.12, 0.18])
    }
    const q0: V3 = [H.x + Math.cos(a0) * (H.r + o), hy + 0.15, H.z - Math.sin(a0) * (H.r + o)]
    const q1: V3 = [H.x + Math.cos(a1) * (H.r + o), hy + 0.15, H.z - Math.sin(a1) * (H.r + o)]
    const N = 4
    for (let j = 0; j < N; j++) {
      const t0 = j / N
      const t1 = (j + 1) / N
      const L = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]
      const a = L(p0, p1, t0)
      const b = L(p0, p1, t1)
      const c = L(q0, q1, t1)
      const d = L(q0, q1, t0)
      const midZ = (a[2] + b[2]) / 2
      const midX = (a[0] + b[0]) / 2
      if (midX > H.x + ap - 0.5 && midZ > stair.z0 - 1 && midZ < stair.z1 + 1) continue // access opening
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
      g.setIndex([0, 1, 2, 0, 2, 3])
      g.computeVertexNormals()
      get('net').add(g, new THREE.Matrix4(), 'world', 1)
      tube(get('steel'), d, c, 0.04, 6, true)
      bar(get('steel'), [(a[0] + b[0]) / 2, hy - 0.1, (a[2] + b[2]) / 2], [(c[0] + d[0]) / 2, hy + 0.12, (c[2] + d[2]) / 2], 0.05, 0.05)
    }
  }
  // windsock on the NW net shelf corner
  const ws = vtx(3, H.r + 1.2)
  tube(get('galv'), [ws[0], hy, ws[2]], [ws[0], hy + 3.2, ws[2]], 0.05, 6, true)
  place(get('orange'), new THREE.ConeGeometry(0.3, 1.6, 10, 1, true), [ws[0] + 0.8, hy + 3.0, ws[2]], [0, 0, Math.PI / 2 + 0.2])
}

export function buildQuarters(get: LqGet, gb: GratingBatches, rb: RailBatches) {
  const roofY = LQ_ROOF_Y
  // block
  boxMinMax(get('facade'), [Q.x0, Y, Q.z0], [Q.x1, roofY, Q.z1], 'world')
  boxMinMax(get('roof'), [Q.x0 - 0.05, roofY, Q.z0 - 0.05], [Q.x1 + 0.05, roofY + 0.25, Q.z1 + 0.05])
  // floor-slab edge bands (cladding joints) every storey
  for (let s = 1; s < Q.storeys; s++) {
    const y = Y + s * Q.storey - 0.02
    boxMinMax(get('white'), [Q.x0 - 0.04, y, Q.z0 - 0.04], [Q.x1 + 0.04, y + 0.16, Q.z1 + 0.04])
  }
  // parapet (opening on the east side at the escape-stair landing)
  const st = LQ_ESCAPE_STAIR
  const pz0 = st.o[1] + 0.02
  const pz1 = st.o[1] + st.landing - 0.02
  const p0 = roofY + 0.25
  const p1 = roofY + 1.1
  boxMinMax(get('white'), [Q.x0, p0, Q.z0], [Q.x1, p1, Q.z0 + 0.15])
  boxMinMax(get('white'), [Q.x0, p0, Q.z1 - 0.15], [Q.x1, p1, Q.z1])
  boxMinMax(get('white'), [Q.x0, p0, Q.z0 + 0.15], [Q.x0 + 0.15, p1, Q.z1 - 0.15])
  boxMinMax(get('white'), [Q.x1 - 0.15, p0, Q.z0 + 0.15], [Q.x1, p1, pz0])
  boxMinMax(get('white'), [Q.x1 - 0.15, p0, pz1], [Q.x1, p1, Q.z1 - 0.15])

  // roof plant under the helideck: AHUs, exhaust fans
  boxMinMax(get('equipDark'), [5, roofY + 0.25, 72.5], [9, roofY + 1.9, 75])
  boxMinMax(get('equipDark'), [14, roofY + 0.25, 80], [18, roofY + 1.6, 83])
  for (const x of [15.5, 17.2]) {
    place(get('galv'), unitCyl(16, false), [x, roofY + 0.65, 73], [0, 0, 0], [0.42, 0.8, 0.42])
    place(get('steelDark'), unitCyl(16, false), [x, roofY + 1.1, 73], [0, 0, 0], [0.5, 0.1, 0.5])
  }

  // doors: bridge-facing main entrance (north) with canopy, east doors onto the escape stair, west door
  boxMinMax(get('steelDark'), [5.4, Y, Q.z0 - 0.05], [7.0, Y + 2.3, Q.z0])
  boxMinMax(get('glass'), [5.55, Y + 1.2, Q.z0 - 0.06], [6.15, Y + 2.1, Q.z0 - 0.05])
  boxMinMax(get('glass'), [6.25, Y + 1.2, Q.z0 - 0.06], [6.85, Y + 2.1, Q.z0 - 0.05])
  boxMinMax(get('roof'), [5.0, Y + 2.6, Q.z0 - 1.2], [7.4, Y + 2.75, Q.z0])
  box(get('lampBody'), [6.2, Y + 2.55, Q.z0 - 0.6], [0.3, 0.08, 0.3])
  box(get('lamp'), [6.2, Y + 2.5, Q.z0 - 0.6], [0.24, 0.03, 0.24])
  for (let s = 0; s < Q.storeys; s++) boxMinMax(get('steelDark'), [Q.x1, Y + s * Q.storey, st.o[1] + 0.2], [Q.x1 + 0.05, Y + s * Q.storey + 2.1, st.o[1] + 1.1])
  boxMinMax(get('steelDark'), [Q.x0 - 0.05, Y, 77], [Q.x0, Y + 2.1, 78])

  // HVAC louvres: west wall (supply) and north wall top storey (exhaust)
  louvreX(get, Q.x0, 71.5, 74, Y + 0.9, Y + 2.3)
  louvreX(get, Q.x0, 81, 83.5, Y + 0.9, Y + 2.3)
  louvreX(get, Q.x0, 79, 81.4, roofY - 2.4, roofY - 1.0)
  louvreZ(get, Q.z0, 14, 17, roofY - 2.4, roofY - 1.0)
  louvreZ(get, Q.z0, 10, 12.4, Y + 0.9, Y + 2.3)

  // safety signage panels
  boxMinMax(get('signGreen'), [Q.x1, Y + 1.4, 72.2], [Q.x1 + 0.05, Y + 2.4, 73.8]) // MUSTER STATION board
  boxMinMax(get('white'), [Q.x1, Y + 1.45, 73.95], [Q.x1 + 0.04, Y + 2.35, 74.75]) // muster list
  boxMinMax(get('signGreen'), [Q.x1, Y + 2.6, 76.4], [Q.x1 + 0.05, Y + 3.0, 78.4]) // lifeboat direction
  boxMinMax(get('red'), [Q.x1, Y + 0.3, 75.2], [Q.x1 + 0.25, Y + 1.5, 76.0]) // fire hose cabinet
  boxMinMax(get('signGreen'), [5.2, Y + 2.85, Q.z0 - 0.06], [7.2, Y + 3.2, Q.z0]) // entrance / LQ
  boxMinMax(get('signBlue'), [7.6, Y + 1.2, Q.z0 - 0.05], [8.4, Y + 2.0, Q.z0]) // PPE / info
  boxMinMax(get('red'), [3.5, Y + 0.3, Q.z0 - 0.25], [4.3, Y + 1.5, Q.z0]) // fire cabinet
  boxMinMax(get('yellow'), [3.55, Y + 1.6, Q.z0 - 0.04], [4.25, Y + 1.9, Q.z0]) // hazard plate
  boxMinMax(get('signGreen'), [Q.x0 - 0.05, Y + 2.4, 76.8], [Q.x0, Y + 2.75, 78.2]) // west exit
  // storey numbers on the escape-stair doors' side panels
  for (let s = 0; s < Q.storeys; s++) boxMinMax(get('signGreen'), [Q.x1, Y + s * Q.storey + 2.2, st.o[1] + 0.3], [Q.x1 + 0.04, Y + s * Q.storey + 2.5, st.o[1] + 1.0])

  // escape stair (east wall) up to the helideck
  buildLqStair(st, { ...rb, steel: get('steel'), grating: { grating: gb.grating, shadow: gb.shadow }, nosing: get('yellow') })
  // stair -> wall bridging landings get end rails on their open north side (z = o.z)
  for (let s = 1; s <= Q.storeys + 1; s++) {
    const y = Y + s * Q.storey
    const xr = s === Q.storeys + 1 ? EMBARK.x0 - (st.reach?.(y) ?? 0) : Q.x1
    railRun(rb, [xr + 0.04, y, st.o[1] + st.landing - 0.04], [EMBARK.x0, y, st.o[1] + st.landing - 0.04], { startPost: true, endPost: false })
  }

  lifeboatStations(get)
  liferafts(get)
  helideck(get)
}
