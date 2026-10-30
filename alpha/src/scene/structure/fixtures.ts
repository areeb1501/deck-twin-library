/**
 * Small outfitting items: Ex-d light fittings, lifebuoy stations, safety signage.
 */
import * as THREE from 'three'
import type { GeoBatch, V3 } from './batch'
import { box, place, sphere, tube } from './batch'
import { DECK } from './deckConst'
import { RACK } from './rack'
import { signUV, type SignId } from './textures'
import { STAIR_TOWERS, towerGap } from './stairs'

export interface FixtureBatches {
  lamp: GeoBatch
  lampBody: GeoBatch
  buoyOrange: GeoBatch
  buoyWhite: GeoBatch
  atlas: GeoBatch
  signBack: GeoBatch
}

/** Pendant Ex-d luminaire hung from structure at yHang. */
function pendant(fb: FixtureBatches, x: number, z: number, yHang: number, yLamp: number) {
  tube(fb.lampBody, [x, yLamp + 0.12, z], [x, yHang, z], 0.015, 6, true)
  place(fb.lampBody, cyl(16), [x, yLamp + 0.06, z], [0, 0, 0], [0.15, 0.14, 0.15])
  place(fb.lampBody, cyl(16, false), [x, yLamp - 0.005, z], [0, 0, 0], [0.17, 0.02, 0.17])
  sphere(fb.lamp, [x, yLamp - 0.06, z], 0.1, 14, 8)
  // wire guard
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2
    tube(fb.lampBody, [x + Math.cos(a) * 0.115, yLamp - 0.005, z + Math.sin(a) * 0.115], [x, yLamp - 0.18, z], 0.004, 4)
  }
}

/** Bracket floodlight mounted on a vertical member, pointing along `dir` (horizontal unit). */
function bracketLight(fb: FixtureBatches, p: V3, dir: [number, number]) {
  const [dx, dz] = dir
  const e: V3 = [p[0] + dx * 0.35, p[1], p[2] + dz * 0.35]
  tube(fb.lampBody, p, e, 0.025, 6, true)
  const ry = Math.atan2(dx, dz)
  place(fb.lampBody, boxGeo(), [e[0] + dx * 0.12, e[1], e[2] + dz * 0.12], [0, ry, 0], [0.32, 0.2, 0.18])
  place(fb.lamp, boxGeo(), [e[0] + dx * 0.215, e[1], e[2] + dz * 0.215], [0, ry, 0], [0.26, 0.15, 0.01])
}

const geos = new Map<string, THREE.BufferGeometry>()
const cyl = (seg: number, open = false) => {
  const k = `c${seg}${open}`
  if (!geos.has(k)) geos.set(k, new THREE.CylinderGeometry(1, 1, 1, seg, 1, open))
  return geos.get(k)!
}
const boxGeo = () => {
  if (!geos.has('b')) geos.set('b', new THREE.BoxGeometry(1, 1, 1))
  return geos.get('b')!
}
const arc = (k: number) => {
  const key = `arc${k}`
  if (!geos.has(key)) {
    const g = new THREE.TorusGeometry(0.31, 0.055, 8, 6, Math.PI / 4)
    g.rotateZ((k * Math.PI) / 4)
    geos.set(key, g)
  }
  return geos.get(key)!
}

/**
 * Lifebuoy hung on a guard rail. (x, z) on the rail line; `along` = rail axis ('x' | 'z');
 * `inward` sign moves the ring to the walkway side.
 */
function lifebuoy(fb: FixtureBatches, x: number, z: number, along: 'x' | 'z', inward: number) {
  const off = 0.09 * inward
  const cx = along === 'x' ? x : x + off
  const cz = along === 'x' ? z + off : z
  const ry = along === 'x' ? 0 : Math.PI / 2
  for (let k = 0; k < 8; k++) place(k % 2 ? fb.buoyWhite : fb.buoyOrange, arc(k), [cx, 0.72, cz], [0, ry, 0])
  // bracket + grab line housing
  const bx = along === 'x' ? 0.12 : 0.04
  const bz = along === 'x' ? 0.04 : 0.12
  box(fb.lampBody, [along === 'x' ? x : x + off * 0.5, 1.06, along === 'x' ? z + off * 0.5 : z], [bx, 0.06, bz])
  // sign above the buoy
  sign(fb, 'lifebuoy', [cx, 1.38, cz], along === 'x' ? [0, inward] : [inward, 0], 0.36)
}

/**
 * Sign plate (3:2) facing `n` (horizontal unit [nx, nz]) centred at c, width w.
 */
export function sign(fb: FixtureBatches, id: SignId, c: V3, n: [number, number], w = 0.6) {
  const h = id === 'arrow' ? w : w * (2 / 3)
  const ry = Math.atan2(n[0], n[1])
  const g = signGeo(id)
  place(fb.atlas, g, [c[0] + n[0] * 0.004, c[1], c[2] + n[1] * 0.004], [0, ry, 0], [w, h, 1])
  place(fb.signBack, boxGeo(), [c[0] - n[0] * 0.002, c[1], c[2] - n[1] * 0.002], [0, ry, 0], [w + 0.02, h + 0.02, 0.006])
}
function signGeo(id: SignId) {
  const key = `sign-${id}`
  if (!geos.has(key)) {
    const g = new THREE.PlaneGeometry(1, 1)
    const [u0, v0, u1, v1] = signUV(id)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
    geos.set(key, g)
  }
  return geos.get(key)!
}

export function buildFixtures(ceiling: boolean, fb: FixtureBatches) {
  // pendants from upper-deck secondaries (bottom of IPE 300 at ~9.685) — only with the ceiling
  const yHang = DECK.upperTop - 0.015 - 0.3
  if (ceiling) {
    for (const x of [-26, -16, -4, 4, 16, 26]) for (const z of [-9.5, 9.5]) pendant(fb, x, z, yHang, 8.2)
    for (const x of [-20, 20]) for (const z of [-14.5, 14.5]) pendant(fb, x, z, yHang, 8.2)
  }
  // floodlights on tall rack posts, facing the aisles
  for (const x of RACK.tallBents) {
    bracketLight(fb, [x, 3.4, RACK.zMax + 0.15], [0, 1])
    bracketLight(fb, [x, 3.4, RACK.zMin - 0.15], [0, -1])
  }
  // floodlights on the deck-to-deck columns
  for (const [x, z] of DECK.columns) bracketLight(fb, [x, 5.5, z + Math.sign(-z) * 0.2], [0, Math.sign(-z)])

  // lifebuoy stations on the perimeter rail
  const e = 0.05
  lifebuoy(fb, -15, DECK.z0 + e, 'x', 1)
  lifebuoy(fb, 15, DECK.z0 + e, 'x', 1)
  lifebuoy(fb, -15, DECK.z1 - e, 'x', -1)
  lifebuoy(fb, 15, DECK.z1 - e, 'x', -1)
  lifebuoy(fb, DECK.x0 + e, -6, 'z', 1)
  lifebuoy(fb, DECK.x1 - e, 6, 'z', -1)

  // signage on rack posts (faces towards the aisles)
  sign(fb, 'noSmoking', [-12, 1.9, RACK.zMax + 0.155], [0, 1])
  sign(fb, 'hearing', [12, 1.9, RACK.zMax + 0.155], [0, 1])
  sign(fb, 'escape', [-24, 1.9, RACK.zMax + 0.155], [0, 1])
  sign(fb, 'escape', [24, 1.9, RACK.zMin - 0.155], [0, -1])
  sign(fb, 'noSmoking', [0, 1.9, RACK.zMin - 0.155], [0, -1])
  sign(fb, 'muster', [-12, 1.9, RACK.zMin - 0.155], [0, -1])
  // deck ID + stair signs at each stair opening (on the rail next to the gap)
  for (const t of STAIR_TOWERS) {
    const [g0, g1] = towerGap(t)
    const x = t.edgeX - t.outward * 0.08
    const zEnd = t.uDir > 0 ? g1 + 0.35 : g0 - 0.35
    const nIn: [number, number] = [-t.outward, 0]
    sign(fb, 'stair', [x, 1.45, zEnd], nIn, 0.6)
    sign(fb, 'deckId', [x, 1.45, t.uDir > 0 ? g0 - 0.5 : g1 + 0.5], nIn, 0.6)
  }
  // muster-point sign on a deck-to-deck column
  sign(fb, 'muster', [8, 1.9, 17 - 0.155], [0, -1])
}
