/**
 * Platform supply vessel (PSV), ~82 m: low-poly, merged per material, never pickable. WORLD coordinates.
 *
 * Model (local frame: +x bow, +y up from the waterline, +z starboard): lofted hull with a raked, flared bow
 * and a full-width transom, antifouling / black boot-top / red topsides, rubbing fenders, bow- and
 * stern-thruster marks; accommodation block and wrap-around bridge forward with a mast (radars, sat-com,
 * antennas) and twin exhaust funnels; long open aft cargo deck with high bulwarks, cargo rails, a crash
 * barrier, containers, baskets and pipe bundles (two more containers while the leg carries cargo); a bow
 * wave and a stern wake that fade with speed.
 *
 * Motion follows the supply-boat leg of the spares logistics (sim/spares.ts `useSpares.getState().boat`,
 * read in useFrame; nothing is set in React state per frame):
 *   no schedule (the stub: atBase, since = until = next = 0) or 'idle'  → today's stand-off pose (−40, 150)
 *   atBase / loading (scheduled)  → today's stand-off pose until the vessel has sailed once this session, then at
 *                                   the supply base: over the horizon (hidden)
 *   sailing    → sails in from the horizon (the first sailing after a reset: from the stand-off position),
 *                slowing as it comes alongside (progress 0 … 1)
 *   alongside  → holds station on DP alongside Alpha's east face, its cargo deck under CR-A1's boat spot
 *   returning  → sails out to the horizon
 *   weatherHold → stands off ~470 m south-east of Alpha, waiting on weather
 * A display timeline chases the leg (forward only, at least ~10 s per transit even at 60×) and glides
 * between poses, so a fast clock or a state jump never makes the vessel pop.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Batches, boxMinMax, box, boxRotY, tube, type GeoBatch, type V3 } from '../structure/batch'
import { envMat, envTime, noRaycast } from './envShared'
import { useSpares } from '../../sim/spares'
import { seaStateNow } from '../../sim/cranes'
import { CRANE_BY_TAG } from '../../model/cranes'
import type { LogisticsLeg } from '../../sim/assetTypes'
import { chaseTimeline, legProgress, simNowSmooth } from './logisticsMotion'

// ================================================================= hull form
const X_STERN = -41
const B2 = 9.4 // half beam
const AFT_DECK = 3.8 // aft (cargo) deck above the waterline — the cranes land boat loads at world y ≈ 4 (model/cranes.ts BOAT_Y)
const BULWARK = 6.3 // top of the aft bulwark
const X_FOC = 10 // forecastle starts (front of the cargo deck)
/** stem line: raked forward with height (flare) */
const xStem = (y: number) => 37 + (y + 3) * 0.38
const X_BOW = xStem(7.9) - 0.02

function keelY(x: number) {
  if (x > 37) return (x - 37) / 0.38 - 3 // forefoot up the stem
  if (x > 28) return -5.6 + ((x - 28) / 9) * 2.6
  if (x < -30) return -5.6 + ((-30 - x) / 11) * 4.6 // run up to the transom
  return -5.6
}
/** hull side top (sheer): bulwark aft, forecastle rising to the bow */
function topY(x: number) {
  if (x >= X_FOC) return 6.5 + Math.pow((x - X_FOC) / (X_BOW - X_FOC), 2) * 1.4
  if (x < -38) return BULWARK - ((-38 - x) / 3) * 1.4
  return BULWARK
}
/** half-breadth at station x, height y */
function hb(x: number, y: number) {
  let b = x < -36 ? B2 - (-36 - x) * 0.06 : B2
  if (x > 20) {
    const xs = y >= -3 ? xStem(y) : 37 - (-3 - y) * 3.2
    const f = Math.min(1, Math.max(0, (x - 20) / Math.max(0.01, xs - 20)))
    b *= Math.pow(Math.max(0, 1 - f * f), 0.55)
  }
  const R = 1.6
  const dy = y - keelY(x)
  if (dy < R) b = Math.max(0, Math.min(b, b - R + Math.sqrt(Math.max(0, R * R - (R - dy) * (R - dy)))))
  return b
}

type K =
  | 'hull' | 'boot' | 'band' | 'deck' | 'white' | 'glass' | 'dark' | 'rubber' | 'soot' | 'yellow' | 'blue' | 'orange' | 'green' | 'pipe' | 'grey' | 'mark' | 'light'

/** one lofted surface strip (both sides), indexed, smooth normals */
function hullSide(B: Batches<K>) {
  const xs: number[] = []
  for (let x = X_STERN; x < 20; x += x < -30 ? 1.1 : 2.5) xs.push(x)
  for (let x = 20; x < X_BOW; x += 0.9) xs.push(x)
  xs.push(X_BOW)
  // profile: keel centreline, bilge (relative to the keel), then fixed heights through the waterline bands up to
  // the sheer; clamped, never deduplicated, so every ring has the same count and strips line up
  const REL = [0, 0.12, 0.35, 0.7, 1.1, 1.6]
  const ABS = [-2.6, -1.4, -0.7, -0.62, 0.55, 0.62, 1.6, 2.6, 3.6, 4.6, 5.6]
  const ring = (x: number) => {
    const k = keelY(x)
    const t = topY(x)
    const out: [number, number][] = [[k, 0]]
    let last = k
    for (const y of [...REL.map((r) => k + r), ...ABS, t]) {
      last = Math.min(t, Math.max(last, y))
      out.push([last, hb(x, last)])
    }
    return out
  }
  const rings = xs.map(ring)
  const M = rings[0].length
  const bandOf = (y: number): K => (y < -0.64 ? 'boot' : y < 0.6 ? 'band' : 'hull')
  // shared vertices per band (smooth normals across stations), one geometry per band
  const per = new Map<K, { pos: number[]; idx: number[]; map: Map<number, number> }>()
  const vtx = (g: { pos: number[]; map: Map<number, number> }, i: number, j: number, s: number) => {
    const key = (i * 64 + j) * 2 + (s > 0 ? 1 : 0)
    let n = g.map.get(key)
    if (n === undefined) {
      n = g.pos.length / 3
      g.pos.push(xs[i], rings[i][j][0], s * rings[i][j][1])
      g.map.set(key, n)
    }
    return n
  }
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < M - 1; j++) {
      const k = bandOf((rings[i][j][0] + rings[i][j + 1][0] + rings[i + 1][j][0] + rings[i + 1][j + 1][0]) / 4)
      let g = per.get(k)
      if (!g) per.set(k, (g = { pos: [], idx: [], map: new Map() }))
      for (const s of [1, -1]) {
        const a = vtx(g, i, j, s)
        const b = vtx(g, i + 1, j, s)
        const c = vtx(g, i + 1, j + 1, s)
        const d = vtx(g, i, j + 1, s)
        if (s > 0) g.idx.push(a, b, c, a, c, d)
        else g.idx.push(a, c, b, a, d, c)
      }
    }
  }
  const id = new THREE.Matrix4()
  for (const [k, g] of per) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
    geo.setIndex(g.idx)
    geo.computeVertexNormals()
    B.get(k).add(geo, id)
    geo.dispose()
  }
  // transom (flat stern) up to the aft deck, bulwark ends above it
  {
    const x = X_STERN
    const k = keelY(x)
    const pts: [number, number][] = []
    for (let y = k; y <= AFT_DECK + 1e-6; y += (AFT_DECK - k) / 8) pts.push([y, hb(x, y)])
    const shape = new THREE.Shape()
    shape.moveTo(-pts[0][1], pts[0][0])
    for (const [y, z] of pts) shape.lineTo(-z, y)
    for (const [y, z] of [...pts].reverse()) shape.lineTo(z, y)
    const g = new THREE.ShapeGeometry(shape)
    // shape (u = −z, v = y) → the stern face at x = X_STERN, normal −x
    g.rotateY(-Math.PI / 2)
    g.translate(x - 0.01, 0, 0)
    B.get('hull').add(g, new THREE.Matrix4())
    g.dispose()
    for (const s of [1, -1]) boxMinMax(B.get('hull'), [x - 0.02, AFT_DECK, s > 0 ? B2 - 0.95 : -B2 + 0.6], [x + 0.25, topY(x), s > 0 ? B2 - 0.6 : -B2 + 0.95])
    // black boot-top band and dark antifouling across the transom
    boxMinMax(B.get('band'), [x - 0.05, -0.62, -hb(x, 0) + 0.05], [x - 0.02, 0.6, hb(x, 0) - 0.05])
    boxMinMax(B.get('boot'), [x - 0.05, k + 0.05, -hb(x, k + 0.3) + 0.05], [x - 0.02, -0.62, hb(x, k + 0.3) - 0.05])
    // low stern rail between the bulwark ends
    for (let z = -7.5; z <= 7.5; z += 2.5) tube(B.get('yellow'), [x + 0.2, AFT_DECK, z], [x + 0.2, AFT_DECK + 0.95, z], 0.05, 6, false)
    tube(B.get('yellow'), [x + 0.2, AFT_DECK + 0.95, -8.2], [x + 0.2, AFT_DECK + 0.95, 8.2], 0.05, 6, false)
  }
  // decks: aft cargo deck inside the bulwarks; forecastle deck following the sheer
  boxMinMax(B.get('deck'), [X_STERN + 0.05, AFT_DECK - 0.3, -B2 + 0.45], [X_FOC + 0.6, AFT_DECK, B2 - 0.45])
  {
    const pos: number[] = []
    const idx: number[] = []
    const fx: number[] = []
    for (let x = X_FOC; x < X_BOW; x += 0.9) fx.push(x)
    fx.push(X_BOW)
    fx.forEach((x, i) => {
      const y = topY(x) - 0.25
      const w = Math.max(0, hb(x, y) - 0.25)
      pos.push(x, y, -w, x, y, w)
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i - 2, 2 * i + 1, 2 * i)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    B.get('deck').add(g, new THREE.Matrix4())
    g.dispose()
  }
}

function superstructure(B: Batches<K>) {
  const W = B.get('white')
  const G = B.get('glass')
  const D = B.get('dark')
  const fy = 6.5 // forecastle deck level at the block
  // inner face of the bulwarks (white), bulwark cap rail, cargo rails (stanchions) and the crash barrier
  for (const s of [1, -1]) {
    const zIn = s * (B2 - 0.42)
    boxMinMax(W, [-38, AFT_DECK, Math.min(zIn, zIn + s * 0.08)], [X_FOC + 0.4, BULWARK - 0.05, Math.max(zIn, zIn + s * 0.08)])
    boxMinMax(B.get('hull'), [-38, BULWARK - 0.05, s > 0 ? B2 - 0.5 : -B2], [X_FOC + 0.4, BULWARK + 0.08, s > 0 ? B2 : -B2 + 0.5])
    for (let x = X_STERN + 1.5; x < X_FOC - 0.5; x += 2.0) {
      const z = s * (B2 - 1.15)
      box(B.get('yellow'), [x, AFT_DECK + 1.25, z], [0.22, 2.5, 0.22])
    }
    tube(B.get('yellow'), [X_STERN + 1.5, AFT_DECK + 2.45, s * (B2 - 1.15)], [X_FOC - 0.6, AFT_DECK + 2.45, s * (B2 - 1.15)], 0.08, 8, false)
  }
  for (const z of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) tube(B.get('yellow'), [X_FOC - 0.4, AFT_DECK, z], [X_FOC - 0.4, AFT_DECK + 3.2, z], 0.14, 8, false)
  for (const y of [1.2, 2.4, 3.2]) tube(B.get('yellow'), [X_FOC - 0.4, AFT_DECK + y, -8.4], [X_FOC - 0.4, AFT_DECK + y, 8.4], 0.1, 8, false)
  // stern: low rail + bollards
  for (const z of [-6.5, -3.5, 3.5, 6.5]) tube(D, [X_STERN + 0.8, AFT_DECK, z], [X_STERN + 0.8, AFT_DECK + 0.7, z], 0.22, 10, false)
  // forecastle bulkhead (front of the cargo deck) up to the forecastle deck
  boxMinMax(W, [X_FOC, AFT_DECK, -B2 + 0.4], [X_FOC + 0.5, fy, B2 - 0.4])
  // accommodation: three tiers, stepping in
  const tiers: [number, number, number, number, number][] = [
    // x0, x1, half-width, y0, y1
    [11, 28.5, 8.2, fy, fy + 2.9],
    [12, 28.0, 7.9, fy + 2.9, fy + 5.8],
    [13.5, 27.5, 7.4, fy + 5.8, fy + 8.6],
  ]
  for (const [x0, x1, w, y0, y1] of tiers) {
    boxMinMax(W, [x0, y0, -w], [x1, y1, w])
    // window rows (front, sides)
    boxMinMax(G, [x1 + 0.01, y0 + 1.1, -w + 0.8], [x1 + 0.05, y0 + 2.0, w - 0.8])
    for (const s of [1, -1]) for (let x = x0 + 1.2; x < x1 - 1; x += 2.2) boxMinMax(G, [x, y0 + 1.15, s > 0 ? w + 0.01 : -w - 0.05], [x + 1.2, y0 + 1.95, s > 0 ? w + 0.05 : -w - 0.01])
    boxMinMax(D, [x0 - 0.1, y1 - 0.12, -w - 0.1], [x1 + 0.1, y1, w + 0.1])
  }
  // bridge (wheelhouse) on top, full width with wings; wrap-around windows (front raked, chamfered corners, sides, aft)
  const by0 = fy + 8.6
  const by1 = by0 + 3.0
  const [bx0, bx1] = [16, 28]
  boxMinMax(W, [bx0, by0, -B2 + 0.2], [bx1 - 1.0, by1, B2 - 0.2])
  boxMinMax(W, [bx1 - 1.0, by0, -6.5], [bx1, by1, 6.5])
  for (const s of [1, -1]) boxRotY(W, [bx1 - 1.05, (by0 + by1) / 2, s * 7.55], [1.6, by1 - by0, 2.0], s * 0.6)
  boxMinMax(G, [bx1 + 0.01, by0 + 1.0, -6.3], [bx1 + 0.06, by1 - 0.25, 6.3])
  for (const s of [1, -1]) boxRotY(G, [bx1 - 0.55 + 0.1, by0 + 1.62, s * 7.95], [0.06, 1.25, 2.3], s * 0.6 + Math.PI / 2)
  for (const s of [1, -1]) boxMinMax(G, [bx0 + 0.6, by0 + 1.0, s > 0 ? B2 - 0.19 : -B2 + 0.15], [bx1 - 1.6, by1 - 0.25, s > 0 ? B2 - 0.15 : -B2 + 0.19])
  boxMinMax(G, [bx0 - 0.05, by0 + 1.0, -7.8], [bx0 - 0.01, by1 - 0.25, 7.8]) // aft windows over the cargo deck
  for (let z = -7.6; z <= 7.6; z += 1.9) boxMinMax(D, [bx1 + 0.02, by0 + 1.0, z - 0.04], [bx1 + 0.08, by1 - 0.25, z + 0.04]) // mullions
  boxMinMax(D, [bx0 - 0.2, by1, -B2], [bx1 + 0.4, by1 + 0.18, B2]) // roof with sun visor overhang
  boxMinMax(D, [bx1 - 0.1, by1 - 0.3, -6.6], [bx1 + 0.55, by1 - 0.1, 6.6])
  // mast: pole, yard with two radar scanners, sat-com radome, whip antennas, nav lights
  const mx = 23.5
  tube(W, [mx, by1 + 0.18, 0], [mx, by1 + 7.2, 0], 0.22, 10, false)
  boxMinMax(W, [mx - 1.2, by1 + 3.9, -1.6], [mx + 1.2, by1 + 4.1, 1.6])
  boxMinMax(D, [mx - 0.2, by1 + 4.25, -2.3], [mx + 0.2, by1 + 4.45, 2.3])
  boxMinMax(D, [mx + 0.6, by1 + 5.45, -1.4], [mx + 0.85, by1 + 5.6, 1.4])
  tube(W, [mx + 0.72, by1 + 4.1, 0], [mx + 0.72, by1 + 5.45, 0], 0.08, 6, false)
  tube(W, [20.2, by1 + 0.18, -3.2], [20.2, by1 + 1.4, -3.2], 0.1, 8, false)
  {
    const g = new THREE.SphereGeometry(0.62, 14, 10)
    B.get('white').add(g, new THREE.Matrix4().makeTranslation(20.2, by1 + 1.9, -3.2))
    B.get('white').add(g, new THREE.Matrix4().makeTranslation(20.2, by1 + 1.9, 3.2))
    g.dispose()
  }
  tube(W, [20.2, by1 + 0.18, 3.2], [20.2, by1 + 1.4, 3.2], 0.1, 8, false)
  for (const [x, z, h] of [[26.5, -5, 5], [26.5, 5, 5], [18.5, 0, 4], [mx, 0, 2.6]] as [number, number, number][]) tube(D, [x, by1 + (x === mx ? 7.2 : 0.18), z], [x, by1 + (x === mx ? 7.2 : 0.18) + h, z], 0.035, 4, false)
  box(B.get('light'), [mx, by1 + 7.3, 0], [0.25, 0.25, 0.25])
  for (const s of [1, -1]) box(B.get('light'), [bx1 - 2, by1 - 0.6, s * (B2 - 0.1)], [0.3, 0.3, 0.12])
  // twin exhaust funnels at the aft corners of the block, soot tops
  for (const s of [1, -1]) {
    boxMinMax(W, [11.6, fy, s > 0 ? 5.1 : -7.1], [14.0, by1 + 1.6, s > 0 ? 7.1 : -5.1])
    boxMinMax(B.get('soot'), [11.6, by1 + 1.6, s > 0 ? 5.1 : -7.1], [14.0, by1 + 2.1, s > 0 ? 7.1 : -5.1])
    for (const z of [5.6, 6.6]) tube(B.get('soot'), [12.8, by1 + 2.1, s * z], [12.8, by1 + 2.8, s * z], 0.22, 10, false)
  }
  // forecastle: anchor windlass, bollards, guard rail
  for (const s of [1, -1]) {
    tube(D, [33, fy + 0.6, s * 2.0], [33, fy + 1.4, s * 2.0], 0.5, 12, false)
    tube(D, [36, topY(36) - 0.25, s * 3.2], [36, topY(36) + 0.45, s * 3.2], 0.22, 10, false)
  }
  boxMinMax(D, [31.6, fy, -2.8], [34.2, fy + 0.7, 2.8])
  {
    const pts: V3[] = []
    for (let x = 31.5; x <= X_BOW - 0.4; x += 1.2) pts.push([x, topY(x) - 0.25, hb(x, topY(x)) - 0.25])
    for (let i = 0; i < pts.length - 1; i++)
      for (const s of [1, -1]) {
        tube(W, [pts[i][0], pts[i][1] + 1.0, s * pts[i][2]], [pts[i + 1][0], pts[i + 1][1] + 1.0, s * pts[i + 1][2]], 0.04, 6, false)
        tube(W, [pts[i][0], pts[i][1], s * pts[i][2]], [pts[i][0], pts[i][1] + 1.0, s * pts[i][2]], 0.035, 6, false)
      }
  }
}

/** rubbing fenders, thruster marks, draught marks */
function hullFittings(B: Batches<K>) {
  for (const y of [2.2, 5.6]) {
    const x1 = y > 4 ? X_FOC : 22
    for (const s of [1, -1]) {
      tube(B.get('rubber'), [X_STERN + 0.4, y, s * (hb(X_STERN + 0.4, y) + 0.06)], [-36, y, s * (hb(-36, y) + 0.06)], 0.17, 8, false)
      tube(B.get('rubber'), [-36, y, s * (hb(-36, y) + 0.06)], [x1, y, s * (hb(x1, y) + 0.06)], 0.17, 8, false)
    }
  }
  const mark = (x: number, y: number) => {
    for (const s of [1, -1]) {
      const z = s * (hb(x, y + 0.75) + 0.05)
      tube(B.get('mark'), [x, y, z - 0.03], [x, y, z + 0.03], 0.75, 20, false)
      for (const r of [Math.PI / 4, -Math.PI / 4]) {
        const g = new THREE.BoxGeometry(0.14, 1.3, 0.02)
        B.get('band').add(g, new THREE.Matrix4().makeRotationZ(r).setPosition(x, y, z + s * 0.035))
        g.dispose()
      }
    }
  }
  mark(33.5, 1.5)
  mark(-35, 1.4)
  for (const x of [X_STERN + 0.6, 37]) for (let y = -2; y <= 1.2; y += 0.4) for (const s of [1, -1]) boxMinMax(B.get('mark'), [x, y, s > 0 ? hb(x, y) + 0.01 : -hb(x, y) - 0.04], [x + 0.35, y + 0.1, s > 0 ? hb(x, y) + 0.04 : -hb(x, y) - 0.01])
}

/** deck cargo: base load always; `extra` = two more containers while the leg carries cargo */
function deckCargo(get: (k: K) => GeoBatch, extra: boolean) {
  const Y = AFT_DECK
  const cont = (k: K, x0: number, z0: number, len = 6.06, w = 2.44, h = 2.59, y = Y) => {
    boxMinMax(get(k), [x0, y, z0], [x0 + len, y + h, z0 + w])
    for (let x = x0 + 0.3; x < x0 + len - 0.2; x += 0.6) for (const [za, zb] of [[z0 - 0.03, z0], [z0 + w, z0 + w + 0.03]]) boxMinMax(get(k), [x, y + 0.1, za], [x + 0.2, y + h - 0.1, zb])
    for (const x of [x0, x0 + len - 0.18]) for (const z of [z0, z0 + w - 0.16]) for (const yy of [y, y + h - 0.12]) boxMinMax(get('dark'), [x, yy, z], [x + 0.18, yy + 0.13, z + 0.16])
  }
  if (!extra) {
    cont('blue', -33, -6.8)
    cont('orange', -26, -6.8)
    cont('blue', -33, 4.2, 3.0)
    cont('green', -28.8, 4.4, 3.0, 2.0, 1.3)
    // cargo baskets
    for (const [x0, z0] of [[-16, -6.6], [-16, 4.6]] as [number, number][]) {
      boxMinMax(get('green'), [x0, Y, z0], [x0 + 5.5, Y + 0.1, z0 + 2.0])
      for (const x of [x0, x0 + 5.42]) for (const z of [z0, z0 + 1.92]) boxMinMax(get('green'), [x, Y, z], [x + 0.08, Y + 1.2, z + 0.08])
      for (const z of [z0, z0 + 1.96]) boxMinMax(get('green'), [x0, Y + 1.15, z], [x0 + 5.5, Y + 1.2, z + 0.04])
      for (let i = 0; i < 4; i++) tube(get('grey'), [x0 + 0.3, Y + 0.3 + (i % 2) * 0.35, z0 + 0.4 + Math.floor(i / 2) * 0.9], [x0 + 5.2, Y + 0.3 + (i % 2) * 0.35, z0 + 0.4 + Math.floor(i / 2) * 0.9], 0.16, 10, false)
    }
    // pipe bundles on dunnage, chained
    for (const z0 of [-2.2, 0.6]) {
      for (const x of [-8, -1, 6]) boxMinMax(get('orange'), [x - 0.15, Y, z0 - 0.2], [x + 0.15, Y + 0.25, z0 + 1.8])
      for (let i = 0; i < 9; i++) tube(get('pipe'), [-9.5, Y + 0.42 + Math.floor(i / 4) * 0.33, z0 + (i % 4) * 0.38 + (Math.floor(i / 4) % 2) * 0.19], [7.5, Y + 0.42 + Math.floor(i / 4) * 0.33, z0 + (i % 4) * 0.38 + (Math.floor(i / 4) % 2) * 0.19], 0.17, 10, false)
      for (const x of [-6, 4]) tube(get('dark'), [x, Y + 0.25, z0 - 0.15], [x, Y + 1.3, z0 + 0.8], 0.03, 4, true)
    }
  } else {
    cont('orange', -24, 4.2)
    cont('blue', -33, -6.8, 6.06, 2.44, 2.59, Y + 2.59)
  }
}

function buildVessel() {
  const B = new Batches<K>()
  hullSide(B)
  superstructure(B)
  hullFittings(B)
  deckCargo((k) => B.get(k), false)
  const X = new Batches<K>()
  deckCargo((k) => X.get(k), true)
  return { base: B.buildAll(), extra: X.buildAll() }
}

// ================================================================= wake
function foamTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const g = c.getContext('2d')!
  const img = g.createImageData(64, 256)
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 64; x++) {
      const along = 1 - y / 255 // 1 at the ship, 0 far astern
      const across = 1 - Math.abs(x / 31.5 - 1)
      const streak = 0.55 + 0.45 * Math.sin(x * 0.9 + Math.sin(y * 0.05) * 3)
      const a = Math.pow(along, 1.6) * Math.pow(Math.max(0, across), 0.6) * (0.55 + 0.45 * rnd()) * streak
      const i = (y * 64 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(Math.min(1, a) * 255)
    }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

function wakeGeometry() {
  // stern wake: trapezoid astern (v = 0 at the stern); bow waves: two strips from the stem along the sides
  const sternW = new THREE.BufferGeometry()
  {
    const x0 = X_STERN + 0.5
    const x1 = X_STERN - 110
    const pos = [x0, 0, -8.5, x0, 0, 8.5, x1, 0, 26, x1, 0, -26]
    sternW.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    sternW.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2))
    sternW.setIndex([0, 2, 1, 0, 3, 2])
    sternW.computeVertexNormals()
  }
  const bow = new THREE.BufferGeometry()
  {
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (const s of [1, -1]) {
      const n = pos.length / 3
      // inner edge along the hull, outer edge spreading out; v = 1 at the stem
      const p = (x: number, off: number): V3 => [x, 0, s * (hb(x, 0) + off)]
      const a = p(38.2, 0.2)
      const b = p(38.2, 1.0)
      const c = p(6, 9)
      const d = p(6, 0.3)
      pos.push(...a, ...b, ...c, ...d)
      uv.push(0.5, 1, 1, 1, 1, 0, 0.5, 0)
      idx.push(...(s > 0 ? [n, n + 1, n + 2, n, n + 2, n + 3] : [n, n + 2, n + 1, n, n + 3, n + 2]))
    }
    bow.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    bow.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    bow.setIndex(idx)
    bow.computeVertexNormals()
  }
  return { sternW, bow }
}

let foamTex: THREE.Texture | null = null
const foam = () => (foamTex ??= foamTexture())
/** wake materials (cached by name in envMat; opacity driven per frame) */
const wakeMaterial = () =>
  envMat('psvWakeFoam', { color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, alphaMap: foam(), transparent: true, opacity: 0, depthWrite: false, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4 }, { underwater: false })
const bowMaterial = () =>
  envMat('psvBowFoam', { color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, alphaMap: foam(), transparent: true, opacity: 0, depthWrite: false, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4 }, { underwater: false })

// ================================================================= motion from the logistics leg
interface Pose {
  x: number
  z: number
  h: number
}
type P2 = [number, number]
const bez = (p: P2[], u: number): P2 => {
  const v = 1 - u
  const a = v * v * v
  const b = 3 * v * v * u
  const c = 3 * v * u * u
  const d = u * u * u
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]]
}
const bezHeading = (p: P2[], u: number) => {
  const a = bez(p, Math.max(0, u - 0.002))
  const b = bez(p, Math.min(1, u + 0.002))
  return Math.atan2(-(b[1] - a[1]), b[0] - a[0]) // bow direction (cos h, −sin h)
}
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** cargo deck station (local x) placed under the crane's boat spot */
const CARGO_LX = -18
const SPOT = CRANE_BY_TAG.get('CR-A1')?.jobs.find((j) => j.kind === 'boat')?.from ?? { x: 47.5, z: -21.8 }
// heading π/2 (bow north): local (lx, 0) → world offset (0, −lx), so the cargo point lands on the spot
const ALONG: Pose = { x: SPOT.x, z: SPOT.z + CARGO_LX, h: Math.PI / 2 }
/** today's stand-off pose (Surroundings default props) */
const STANDOFF: Pose = { x: -40, z: 150, h: 0.18 }
const FAR: P2 = [380, 4300]
/** sail in from the horizon (supply base to the south) … */
const SAIL_FAR: P2[] = [FAR, [300, 2600], [75, 520], [ALONG.x, ALONG.z]]
/** … or, on the first sailing after a reset, from the stand-off position, east past the LQ and north alongside */
const SAIL_SO: P2[] = [[STANDOFF.x, STANDOFF.z], [60, 140], [55, 60], [ALONG.x, ALONG.z]]
const RETURN: P2[] = [[ALONG.x, ALONG.z], [ALONG.x + 12, ALONG.z - 220], [700, -150], FAR]
const holdAt = bez(SAIL_FAR, 0.8)
/** waiting on weather ~470 m south-east, on the approach */
const HOLD: Pose = { x: holdAt[0], z: holdAt[1], h: bezHeading(SAIL_FAR, 0.8) }
const HIDE_BEYOND = 3600

function timelinePose(s: number, t: number, fromStandoff: boolean): Pose {
  if (s < 1) {
    const path = fromStandoff ? SAIL_SO : SAIL_FAR
    const u = 1 - (1 - s) * (1 - s)
    const [x, z] = bez(path, u)
    let h = bezHeading(path, Math.min(u, 0.995))
    if (fromStandoff) h += wrapA(STANDOFF.h - h) * (1 - smooth(0, 0.1, s))
    return { x, z, h: h + wrapA(ALONG.h - h) * smooth(0.85, 1, s) }
  }
  if (s < 2) {
    // holding station on DP: a slow drift of a few decimetres and a small yaw
    return { x: ALONG.x + Math.sin(t * 0.21) * 0.35, z: ALONG.z + Math.sin(t * 0.13 + 1) * 0.25, h: ALONG.h + Math.sin(t * 0.17) * 0.006 }
  }
  const r = Math.min(1, s - 2)
  const u = Math.pow(r, 1.6)
  const [x, z] = bez(RETURN, u)
  const h = bezHeading(RETURN, Math.max(u, 0.005))
  return { x, z, h: ALONG.h + wrapA(h - ALONG.h) * smooth(0, 0.08, r) }
}

const RATE_SHIP = (ph: number) => (ph === 1 ? 1 / 2.5 : 1 / 10)

type ShipMode = 'standoff' | 'timeline' | 'hold'
/**
 * Where the leg puts the vessel. `away` = it has sailed out at least once since the session (re)started: until
 * then a scheduled atBase / loading keeps today's stand-off look, and the first sailing starts from there.
 */
function shipTarget(leg: LogisticsLeg, now: number, away: boolean): { mode: ShipMode; s: number } {
  const stub = !leg.next && !leg.until && !leg.since
  switch (leg.state) {
    case 'sailing':
      return { mode: 'timeline', s: legProgress(leg, now) * 0.999 }
    case 'alongside':
      return { mode: 'timeline', s: 1 + legProgress(leg, now) * 0.999 }
    case 'returning':
      return { mode: 'timeline', s: 2 + legProgress(leg, now) * 0.999 }
    case 'weatherHold':
      return { mode: 'hold', s: 0 }
    case 'atBase':
    case 'loading':
      return stub || !away ? { mode: 'standoff', s: 0 } : { mode: 'timeline', s: 3 }
    default:
      return { mode: 'standoff', s: 0 }
  }
}

export function SupplyVessel({ position = [-40, 0, 150] as [number, number, number], heading = 0.18 }) {
  const ref = useRef<THREE.Group>(null)
  const extraRef = useRef<THREE.Group>(null)
  const parts = useMemo(() => buildVessel(), [])
  const wake = useMemo(() => wakeGeometry(), [])
  useEffect(
    () => () => {
      for (const p of [...parts.base, ...parts.extra]) p.geometry.dispose()
      wake.sternW.dispose()
      wake.bow.dispose()
    },
    [parts, wake],
  )
  const mats = useMemo<Record<K, THREE.Material>>(
    () => ({
      hull: envMat('psvHull2', { color: '#c4361c', roughness: 0.5, metalness: 0.2 }),
      boot: envMat('psvBoot2', { color: '#4a1714', roughness: 0.7, metalness: 0.1 }),
      band: envMat('psvBand', { color: '#17181a', roughness: 0.6, metalness: 0.2 }),
      deck: envMat('psvDeck', { color: '#5d6266', roughness: 0.8, metalness: 0.2 }),
      white: envMat('psvWhite', { color: '#e9ebe8', roughness: 0.5, metalness: 0.1 }),
      glass: envMat('psvGlass', { color: '#18232b', roughness: 0.1, metalness: 0.4 }),
      dark: envMat('psvDark', { color: '#3a3f44', roughness: 0.5, metalness: 0.5 }),
      rubber: envMat('psvFender', { color: '#121314', roughness: 0.9, metalness: 0 }),
      soot: envMat('soot', { color: '#1f1d1b', roughness: 0.9, metalness: 0.1 }),
      yellow: envMat('psvYellow', { color: '#e0b21a', roughness: 0.5, metalness: 0.3 }),
      blue: envMat('box1', { color: '#2f6fae', roughness: 0.6, metalness: 0.3 }),
      orange: envMat('box2', { color: '#d18b1c', roughness: 0.6, metalness: 0.3 }),
      green: envMat('container3', { color: '#3f7a3a', roughness: 0.6, metalness: 0.3 }),
      pipe: envMat('psvPipe', { color: '#53585c', roughness: 0.55, metalness: 0.5 }),
      grey: envMat('psvGrey', { color: '#8d9398', roughness: 0.5, metalness: 0.4 }),
      mark: envMat('psvMark', { color: '#f1f1ec', roughness: 0.5, metalness: 0.05 }),
      light: envMat('psvLight', { color: '#fff4d6', emissive: '#ffe6a8', emissiveIntensity: 1.6, roughness: 0.3 }),
    }),
    [],
  )
  const st = useRef({ init: false, mode: 'standoff' as ShipMode, s: 0, x: 0, z: 0, h: 0, glide: null as null | { from: Pose; t: number; dur: number }, wake: 0, px: Number.NaN, pz: 0, away: false, fromSO: false, lastNow: 0 })

  useFrame((_, dtRaw) => {
    const g = ref.current
    if (!g) return
    const dt = Math.min(dtRaw, 0.1)
    const t = envTime.value
    const S = st.current
    const leg = useSpares.getState().boat
    const now = simNowSmooth()
    if (now < S.lastNow - 5) S.away = false // session reset: back to the stand-off look until the next sailing
    S.lastNow = now
    const stand: Pose = { x: position[0], z: position[2], h: heading }
    const tg = leg ? shipTarget(leg, now, S.away) : { mode: 'standoff' as ShipMode, s: 0 }
    if (!S.init) {
      S.init = true
      S.mode = tg.mode
      S.s = tg.mode === 'timeline' ? (tg.s >= 3 ? 0 : tg.s) : 0
      S.fromSO = false
    }
    let raw: Pose
    if (tg.mode === 'timeline') {
      if (S.mode !== 'timeline') {
        S.fromSO = S.mode === 'standoff' && tg.s < 1
        S.s = tg.s >= 3 ? 0 : tg.s
      }
      const prev = S.s
      S.s = chaseTimeline(S.s, tg.s, dt, RATE_SHIP)
      if (S.s >= 2) S.away = true
      if (S.s < prev - 1) S.fromSO = false // a cycle completed: later sailings come from the horizon
      raw = timelinePose(S.s, t, S.fromSO)
    } else raw = tg.mode === 'hold' ? HOLD : stand
    if (tg.mode !== S.mode) {
      // the pose changes discontinuously: glide from where the vessel is now (snap if either end is out of sight)
      const dist = Math.hypot(raw.x - S.x, raw.z - S.z)
      const hidden = Math.hypot(S.x, S.z) > HIDE_BEYOND || Math.hypot(raw.x, raw.z) > HIDE_BEYOND
      S.glide = hidden ? null : { from: { x: S.x, z: S.z, h: S.h }, t: 0, dur: Math.min(12, Math.max(2.5, dist / 45)) }
      S.mode = tg.mode
    }
    let x = raw.x
    let z = raw.z
    let h = raw.h
    if (S.glide) {
      S.glide.t += dt
      const k = smooth(0, 1, S.glide.t / S.glide.dur)
      x = S.glide.from.x + (raw.x - S.glide.from.x) * k
      z = S.glide.from.z + (raw.z - S.glide.from.z) * k
      h = S.glide.from.h + wrapA(raw.h - S.glide.from.h) * k
      if (S.glide.t >= S.glide.dur) S.glide = null
    }
    const speed = Number.isNaN(S.px) || dt <= 0 ? 0 : Math.hypot(x - S.px, z - S.pz) / dt
    S.px = S.x = x
    S.pz = S.z = z
    S.h = h
    // wake: fades in with speed (none on DP alongside or standing off)
    const want = Math.min(0.85, speed / 7)
    S.wake += (want - S.wake) * (1 - Math.exp(-dt / 0.8))
    wakeMaterial().opacity = S.wake * 0.8
    bowMaterial().opacity = Math.max(0, S.wake - 0.15) * 0.9
    g.visible = Math.hypot(x, z) < HIDE_BEYOND
    // sea-state scaled motions (today's amplitudes at Hs ≤ 2 m)
    const k = Math.max(1, seaStateNow() / 2)
    g.position.set(x, position[1] + Math.sin(t * 0.52) * 0.35 * k, z)
    g.rotation.set(Math.sin(t * 0.41 + 0.7) * 0.022 * k, h, Math.sin(t * 0.33) * 0.01 * k)
    if (extraRef.current) extraRef.current.visible = (leg?.cargo?.length ?? 0) > 0
  })
  return (
    <group ref={ref} position={position} rotation-y={heading} name="PSV">
      {parts.base.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={mats[key]} castShadow={false} receiveShadow={false} raycast={noRaycast} />
      ))}
      <group ref={extraRef} visible={false}>
        {parts.extra.map(({ key, geometry }) => (
          <mesh key={key} geometry={geometry} material={mats[key]} castShadow={false} receiveShadow={false} raycast={noRaycast} />
        ))}
      </group>
      <mesh geometry={wake.sternW} material={wakeMaterial()} position={[0, 0.3, 0]} raycast={noRaycast} renderOrder={2} />
      <mesh geometry={wake.bow} material={bowMaterial()} position={[0, 0.35, 0]} raycast={noRaycast} renderOrder={2} />
    </group>
  )
}
