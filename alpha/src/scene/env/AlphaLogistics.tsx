/**
 * Environment parts of the plan-13 plant items (model/logistics.ts, layout model/site.ts), WORLD coordinates
 * (deck-local + [0, 28, 0]). Static, merged per material, never pickable (the plant items B-9510 and X-R155
 * carry the inspector / knowledge card):
 *
 *   - Alpha weather-deck SE laydown: kerb marking, a 10 ft spares container with its sling set, a cargo basket,
 *     a pipe rack with pipe joints
 *   - pallet racking with stock and an issue counter inside the materials store B-9510
 *   - the compact prover skid on RP: base frame, actuator, detector switches, prover loop to the X-R150 skid
 *
 * `upperDeck={false}` hides the weather-deck parts (with the weather-deck plate); the RP prover is always drawn.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Batches, boxMinMax, tube, type GeoBatch, type V3 } from '../structure/batch'
import { structMats } from '../structure/structMaterials'
import { envMat, noRaycast } from './envShared'
import { ALPHA_LAYDOWN, RP_PROVER, STORE_RACKS, WEATHER_FLOOR } from '../../model/site'
import { PROVER_BARREL } from '../../model/logistics'

const WY = 28
const UD = WY + WEATHER_FLOOR // weather-deck plate top, world

type K = 'yellow' | 'dark' | 'galv' | 'steel' | 'orange' | 'green' | 'wood' | 'pipe' | 'rackBlue' | 'rackOrange' | 'carton' | 'bin' | 'crate' | 'drum' | 'motor' | 'casing' | 'pkg' | 'black' | 'stainless'

function materials(): Record<K, THREE.Material> {
  const sm = structMats('env')
  return {
    yellow: sm.yellow,
    dark: sm.steelDark,
    galv: sm.galv,
    steel: sm.steel,
    orange: envMat('lgContainer', { color: '#c4561c', roughness: 0.6, metalness: 0.3 }),
    green: envMat('container3', { color: '#3f7a3a', roughness: 0.6, metalness: 0.3 }),
    wood: envMat('lgWood', { color: '#8a6a43', roughness: 0.9, metalness: 0 }),
    pipe: envMat('lgPipe', { color: '#4b5054', roughness: 0.55, metalness: 0.5 }),
    rackBlue: envMat('lgRackBlue', { color: '#2d5e9e', roughness: 0.5, metalness: 0.3 }),
    rackOrange: envMat('lgRackOrange', { color: '#e07a1f', roughness: 0.5, metalness: 0.3 }),
    carton: envMat('lgCarton', { color: '#b48a5a', roughness: 0.85, metalness: 0 }),
    bin: envMat('lgBin', { color: '#6f7a83', roughness: 0.6, metalness: 0.1 }),
    crate: envMat('lgCrate', { color: '#d9b21c', roughness: 0.6, metalness: 0.1 }),
    drum: envMat('lgDrum', { color: '#1f5fa8', roughness: 0.5, metalness: 0.3 }),
    motor: envMat('lgMotor', { color: '#355f80', roughness: 0.45, metalness: 0.35 }),
    casing: envMat('lgCasing', { color: '#4f6b5a', roughness: 0.5, metalness: 0.35 }),
    pkg: envMat('lgPkg', { color: '#c9ccc8', roughness: 0.5, metalness: 0.25 }),
    black: envMat('lgRubber', { color: '#1c1d1f', roughness: 0.85, metalness: 0 }),
    stainless: envMat('lgStainless', { color: '#c3c7cb', roughness: 0.25, metalness: 0.85 }),
  }
}

type Get = (k: K) => GeoBatch
/** deterministic 0…1 sequence (stock sizes on the shelves) */
function seq(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}
/** pipe run through points, with an elbow ball at each bend */
function run(b: GeoBatch, pts: V3[], r: number) {
  for (let i = 0; i < pts.length - 1; i++) tube(b, pts[i], pts[i + 1], r, 12, false)
}
function flange(b: GeoBatch, p: V3, axis: 'x' | 'y' | 'z', r: number) {
  const h = 0.03
  const a: V3 = [...p]
  const e: V3 = [...p]
  const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  a[i] -= h
  e[i] += h
  tube(b, a, e, r * 1.7, 14, false)
}

// ================================================================= weather-deck laydown
function laydown(get: Get) {
  const L = ALPHA_LAYDOWN
  const Y = UD
  const line = (x0: number, z0: number, x1: number, z1: number) => boxMinMax(get('yellow'), [x0, Y, z0], [x1, Y + 0.006, z1])
  line(L.x0, L.z0, L.x1, L.z0 + 0.12)
  line(L.x0, L.z1 - 0.12, L.x1, L.z1)
  line(L.x0, L.z0, L.x0 + 0.12, L.z1)
  line(L.x1 - 0.12, L.z0, L.x1, L.z1)
  // 10 ft spares container (door end east), corrugated, corner castings, locking bars, sling set on the roof
  {
    const [x0, x1, z0, z1, h] = [16.75, 19.74, 10.55, 12.99, 2.59]
    boxMinMax(get('orange'), [x0 + 0.04, Y + 0.12, z0 + 0.04], [x1 - 0.04, Y + h - 0.1, z1 - 0.04])
    for (const y of [0, h - 0.12]) {
      boxMinMax(get('orange'), [x0, Y + y, z0], [x1, Y + y + 0.12, z0 + 0.1])
      boxMinMax(get('orange'), [x0, Y + y, z1 - 0.1], [x1, Y + y + 0.12, z1])
      boxMinMax(get('orange'), [x0, Y + y, z0], [x0 + 0.1, Y + y + 0.12, z1])
      boxMinMax(get('orange'), [x1 - 0.1, Y + y, z0], [x1, Y + y + 0.12, z1])
    }
    boxMinMax(get('orange'), [x0 + 0.08, Y + h - 0.1, z0 + 0.08], [x1 - 0.08, Y + h - 0.04, z1 - 0.08])
    for (let x = x0 + 0.2; x < x1 - 0.15; x += 0.26)
      for (const [za, zb] of [[z0 - 0.02, z0 + 0.04], [z1 - 0.04, z1 + 0.02]]) boxMinMax(get('orange'), [x, Y + 0.12, za], [x + 0.11, Y + h - 0.12, zb])
    for (let z = z0 + 0.2; z < z1 - 0.15; z += 0.26) boxMinMax(get('orange'), [x0 - 0.02, Y + 0.12, z], [x0 + 0.04, Y + h - 0.12, z + 0.11])
    for (const x of [x0, x1 - 0.18]) for (const z of [z0, z1 - 0.16]) for (const y of [0, h - 0.12]) boxMinMax(get('dark'), [x, Y + y, z], [x + 0.18, Y + y + 0.13, z + 0.16])
    // door end: two leaves, four locking bars with cam keepers and handles
    boxMinMax(get('dark'), [x1 - 0.02, Y + 0.14, (z0 + z1) / 2 - 0.01], [x1 + 0.01, Y + h - 0.14, (z0 + z1) / 2 + 0.01])
    for (const z of [z0 + 0.45, z0 + 0.9, z1 - 0.9, z1 - 0.45]) {
      tube(get('galv'), [x1 + 0.04, Y + 0.18, z], [x1 + 0.04, Y + h - 0.16, z], 0.022, 6, false)
      boxMinMax(get('galv'), [x1 + 0.02, Y + 1.1, z - 0.02], [x1 + 0.12, Y + 1.16, z + 0.25])
    }
    // four-leg sling set to a master link, lying over the roof
    const top = Y + h + 0.03
    const mid: V3 = [(x0 + x1) / 2, top + 0.45, (z0 + z1) / 2]
    for (const [x, z] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]] as [number, number][]) tube(get('dark'), [x, top, z], mid, 0.014, 4, true)
    tube(get('yellow'), [mid[0] - 0.12, mid[1], mid[2]], [mid[0] + 0.12, mid[1], mid[2]], 0.035, 8, false)
  }
  // open cargo basket with drums and a crate
  {
    const [bx0, bx1, z0, z1] = [19.95, 21.65, 10.55, 12.95]
    boxMinMax(get('green'), [bx0, Y, z0], [bx1, Y + 0.08, z1])
    for (const x of [bx0, bx1 - 0.08]) for (const z of [z0, z1 - 0.08]) boxMinMax(get('green'), [x, Y, z], [x + 0.08, Y + 1.05, z + 0.08])
    for (const y of [0.55, 1.0]) {
      boxMinMax(get('green'), [bx0, Y + y, z0], [bx1, Y + y + 0.06, z0 + 0.04])
      boxMinMax(get('green'), [bx0, Y + y, z1 - 0.04], [bx1, Y + y + 0.06, z1])
      boxMinMax(get('green'), [bx0, Y + y, z0], [bx0 + 0.04, Y + y + 0.06, z1])
      boxMinMax(get('green'), [bx1 - 0.04, Y + y, z0], [bx1, Y + y + 0.06, z1])
    }
    for (const [x, z] of [[20.35, 10.95], [20.35, 11.6], [21.0, 10.95]] as [number, number][]) tube(get('drum'), [x, Y + 0.08, z], [x, Y + 0.96, z], 0.29, 16, false)
    boxMinMax(get('wood'), [20.7, Y + 0.08, 11.55], [21.55, Y + 0.7, 12.8])
  }
  // pipe rack: three stanchion frames, dunnage, two layers of pipe joints
  {
    const [z0, z1] = [13.15, 13.9]
    for (const x of [16.95, 19.2, 21.45]) {
      for (const z of [z0 + 0.04, z1 - 0.04]) boxMinMax(get('yellow'), [x - 0.05, Y, z - 0.05], [x + 0.05, Y + 0.95, z + 0.05])
      boxMinMax(get('yellow'), [x - 0.06, Y + 0.12, z0], [x + 0.06, Y + 0.22, z1])
      boxMinMax(get('wood'), [x - 0.08, Y + 0.22, z0 + 0.06], [x + 0.08, Y + 0.3, z1 - 0.06])
    }
    for (const [z, y] of [[13.32, 0.4], [13.53, 0.4], [13.74, 0.4], [13.43, 0.585], [13.64, 0.585]] as [number, number][])
      tube(get('pipe'), [16.8, Y + y, z], [21.6, Y + y, z], 0.1, 12, false)
  }
}

// ================================================================= racking inside B-9510
function storeRacks(get: Get) {
  const floor = UD + 0.6
  const rnd = seq(9510)
  const stock: K[] = ['carton', 'carton', 'bin', 'crate', 'carton', 'bin']
  const [east, west, counter] = STORE_RACKS
  for (const r of [east, west]) {
    const alongZ = r.z1 - r.z0
    const bays = Math.max(1, Math.round(alongZ / 1.4))
    const bw = alongZ / bays
    for (let i = 0; i <= bays; i++) {
      const z = r.z0 + i * bw
      for (const x of [r.x0, r.x1 - 0.06]) boxMinMax(get('rackBlue'), [x, floor, Math.min(z, r.z1 - 0.06)], [x + 0.06, floor + 2.2, Math.min(z, r.z1 - 0.06) + 0.06])
    }
    for (const lv of [0.1, 0.65, 1.2, 1.75]) {
      for (const x of [r.x0, r.x1 - 0.05]) boxMinMax(get('rackOrange'), [x, floor + lv - 0.1, r.z0], [x + 0.05, floor + lv, r.z1])
      boxMinMax(get('galv'), [r.x0 + 0.02, floor + lv, r.z0], [r.x1 - 0.02, floor + lv + 0.025, r.z1])
      // stock on the shelf: cartons, bins, crates of varied size
      let z = r.z0 + 0.06
      while (z < r.z1 - 0.3) {
        const w = 0.25 + rnd() * 0.45
        const h = Math.min(0.42, 0.15 + rnd() * 0.3)
        const d = (r.x1 - r.x0) * (0.6 + rnd() * 0.3)
        const k = stock[Math.floor(rnd() * stock.length)]
        const xc = (r.x0 + r.x1) / 2
        if (rnd() > 0.12) boxMinMax(get(k), [xc - d / 2, floor + lv + 0.025, z], [xc + d / 2, floor + lv + 0.025 + h, Math.min(z + w, r.z1 - 0.05)])
        z += w + 0.04 + rnd() * 0.08
      }
    }
  }
  // issue counter with a terminal
  boxMinMax(get('pkg'), [counter.x0, floor, counter.z0], [counter.x1, floor + 1.0, counter.z1])
  boxMinMax(get('dark'), [counter.x0 - 0.03, floor + 1.0, counter.z0 - 0.03], [counter.x1 + 0.03, floor + 1.04, counter.z1 + 0.03])
  boxMinMax(get('black'), [counter.x0 + 0.25, floor + 1.04, counter.z0 + 0.25], [counter.x0 + 0.3, floor + 1.4, counter.z0 + 0.55])
}

// ================================================================= compact prover skid on RP
function prover(get: Get) {
  const R = RP_PROVER.skid
  const Y = WY
  for (const x of [R.x0, R.x1 - 0.18]) boxMinMax(get('dark'), [x, Y, R.z0], [x + 0.18, Y + 0.2, R.z1])
  for (const z of [R.z0, (R.z0 + R.z1) / 2 - 0.09, R.z1 - 0.18]) boxMinMax(get('dark'), [R.x0 + 0.18, Y, z], [R.x1 - 0.18, Y + 0.2, z + 0.18])
  boxMinMax(get('galv'), [R.x0 + 0.05, Y + 0.04, R.z0 + 0.05], [R.x1 - 0.05, Y + 0.08, R.z1 - 0.05])
  const P = PROVER_BARREL
  const axisY = Y + P.elevation + P.id / 2 + 0.007
  const headS = P.z + P.tt / 2 + P.id / 4 + 0.007
  // hydraulic actuator on the south head, plenum and its little HPU
  tube(get('crate'), [P.x, axisY, headS], [P.x, axisY, headS + 0.5], 0.15, 16, false)
  tube(get('dark'), [P.x, axisY, headS + 0.5], [P.x, axisY, headS + 0.56], 0.19, 16, false)
  boxMinMax(get('crate'), [R.x0 + 0.08, Y + 0.2, R.z1 - 0.95], [R.x0 + 0.45, Y + 0.85, R.z1 - 0.3])
  // detector switches on top of the barrel
  for (const z of [P.z - 0.5, P.z + 0.45]) boxMinMax(get('stainless'), [P.x - 0.06, axisY + P.id / 2, z - 0.05], [P.x + 0.06, axisY + P.id / 2 + 0.16, z + 0.05])
  // prover loop: overhead to the X-R150 prover header (clear of the walkway, under the gas line at +3.6)
  const headN = P.z - P.tt / 2 - P.id / 4 - 0.007 - 0.45
  run(get('pipe'), [[P.x, axisY, headN], [P.x, axisY, headN - 0.15], [P.x, Y + 2.75, headN - 0.15], [P.x, Y + 2.75, -21.2], [-76.6, Y + 2.75, -21.2], [-76.6, Y + 1.3, -21.2]], 0.084)
  // outlet from N2 (top, 0.4 tt south of centre)
  const n2: V3 = [P.x, axisY + P.id / 2 + 0.007 + 0.4, P.z + P.tt * 0.4]
  run(get('pipe'), [n2, [n2[0], Y + 2.95, n2[2]], [P.x, Y + 2.95, -19.95], [-76.6, Y + 2.95, -19.95], [-76.6, Y + 1.3, -19.95]], 0.084)
  for (const z of [-21.2, -19.95]) flange(get('dark'), [-76.6, Y + 1.32, z], 'y', 0.084)
}

function build(upper: boolean) {
  const B = new Batches<K>()
  const get: Get = (k) => B.get(k)
  if (upper) {
    laydown(get)
    storeRacks(get)
  }
  prover(get)
  return B.buildAll()
}

export function AlphaLogistics({ upperDeck = true }: { upperDeck?: boolean }) {
  const parts = useMemo(() => build(upperDeck), [upperDeck])
  const mats = useMemo(() => materials(), [])
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  return (
    <group name="AlphaLogistics">
      {parts.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={mats[key]} castShadow={key !== 'yellow'} receiveShadow raycast={noRaycast} />
      ))}
    </group>
  )
}

export default AlphaLogistics
