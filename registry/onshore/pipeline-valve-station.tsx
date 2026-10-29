// Buried pipeline block-valve station: full-bore ball valve with stem extension and actuator, bypass, blowdown stack with silencer, fenced compound. ASME B31.8, API 6D.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, gasket, gauge, junctionBox, member, pipeRun, tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { port, type Port } from '../lib/ports'
import { faceToFace, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { signMaterial, textMaterial } from '../lib/textures'
import { GateValve } from '../valves/gate-valve'
import { fenceRun, swingGate } from './_fence'
import { basePlate, clamp, earthBond, plinth } from './_onshore'

export interface PipelineValveStationProps {
  /** mainline size, inches */
  nps?: number
  rating?: Rating
  actuator?: 'gas-over-oil' | 'electric'
  /** cover over the pipe crown, m */
  cover?: number
  /** leave the trench open to show the buried pipe */
  cutaway?: boolean
  /** mainline valve, 0 closed … 1 open */
  open?: number
  tag?: string
}

export const defaults = { nps: 24, rating: 600 as Rating, actuator: 'gas-over-oil' as 'gas-over-oil' | 'electric', cover: 1.2, cutaway: true, open: 1, tag: '' }

const LP = 7 // trench limit, port faces
const BYPASS: [number, number][] = [[8, 2], [12, 3], [16, 4], [24, 6], [36, 8], [48, 10]]
const COAT = () => paint('#2f5d50', { metalness: 0.1, roughness: 0.55, clearcoat: 0.3, weather: 0.4 })
const YELLOW = () => paint('#c9a227', { metalness: 0.2, roughness: 0.45, clearcoat: 0.3 })

function layout(p: typeof defaults) {
  const nps = p.nps
  const od = pipeOD(nps)
  const cover = clamp(p.cover, 0.6, 3)
  const yc = -(cover + od / 2)
  const tw = od + 0.6
  const yb = yc - od / 2 - 0.15
  const nb = BYPASS.find(([m]) => nps <= m)?.[1] ?? 12
  const s = clamp(nps / 24, 0.6, 1.8)
  return { nps, od, cover, yc, tw, yb, nb, s, ys: yb - 0.5 }
}

export function ports(props: PipelineValveStationProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [port('upstream', 'Upstream pipeline', [-LP, g.yc, 0], [-1, 0, 0], p.nps, p.rating), port('downstream', 'Downstream pipeline', [LP, g.yc, 0], [1, 0, 0], p.nps, p.rating)]
}

export function PipelineValveStation(props: PipelineValveStationProps & GroupProps) {
  const { nps, rating, actuator, cover, cutaway, open, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, actuator, cover, cutaway, open, tag }
  const g = layout(p)
  const data = useKit((k) => build(k, p, g), [nps, rating, actuator, cover, cutaway, tag])
  const ball = useKit((k) => ballCore(k, g), [nps])
  const pointer = useKit((k) => {
    k.box('actuatorRed', [0.16, 0.02, 0.03], [0.03, 0, 0])
    k.cyl('actuatorRed', 0.02, 0.025, [0, 0, 0], 'y', 10)
  }, [])
  const ya = 0.5 * g.s + 0.35
  const yInd = actuator === 'gas-over-oil' ? ya + 0.49 * g.s : ya + 0.75 * g.s + 0.04
  const yv = 0.9
  return (
    <group {...group}>
      <KitMesh data={data} />
      <KitMesh data={ball} position={[0, g.yc, 0]} rotation-y={(1 - clamp(open, 0, 1)) * (Math.PI / 2)} />
      <KitMesh data={pointer} position={[0, yInd, 0]} rotation-y={(1 - clamp(open, 0, 1)) * (Math.PI / 2)} />
      {[-1, 1].map((sx) => (
        <GateValve key={'b' + sx} nps={g.nb} rating={rating} operator={g.nb >= 6 ? 'gear' : 'handwheel'} open={0} position={[sx * 1.3, yv, -1.6]} tag={`HV-${sx < 0 ? 'U' : 'D'}1`} />
      ))}
      {[-1, 1].map((sx) => (
        <GateValve key={'d' + sx} nps={g.nb} rating={rating} operator={g.nb >= 6 ? 'gear' : 'handwheel'} open={0} position={[sx * 2.4, yv, -3.2]} tag={`BDV-${sx < 0 ? 'U' : 'D'}1`} />
      ))}
    </group>
  )
}

export default PipelineValveStation

type P = typeof defaults
type G = ReturnType<typeof layout>
const soilM = () => paint('#6e5238', { metalness: 0, roughness: 0.97, clearcoat: 0, weather: 1.4 })
const topsoil = () => paint('#5a4630', { metalness: 0, roughness: 1, clearcoat: 0, weather: 1.2 })
const sand = () => paint('#c8b48a', { metalness: 0, roughness: 1, clearcoat: 0, weather: 0.8 })
const gravel = () => paint('#a29d92', { metalness: 0, roughness: 1, clearcoat: 0, weather: 1.5 })

/** Ported ball seen down the bore; turns with `open`. */
function ballCore(k: Kit, g: G) {
  const r = g.od * 0.62
  k.lathe('stainless', [[r * 0.98, -r * 0.8], [r, -r * 0.5], [r, r * 0.5], [r * 0.98, r * 0.8]].map(([a, b]) => [a, b] as [number, number]), [0, 0, 0], 'x', 32)
  k.cyl('pipeBore', g.od * 0.47, r * 1.6, [0, 0, 0], 'x', 32, undefined, true)
}

function valveEnds(k: Kit, nps: number, rating: Rating, x: number, y: number, z: number, L: number) {
  // mating flanges, gaskets and studs either side of an inline valve centred on x; returns the weld ends
  const ends: number[] = []
  for (const s of [-1, 1]) {
    const face = x + s * (L / 2 + 0.0045)
    const hub = flange(k, nps, rating, [face, y, z], s < 0 ? 'x' : '-x', true)
    gasket(k, nps, rating, [x + s * (L / 2 + 0.00225), y, z], 'x')
    ends.push(face + s * hub)
  }
  return ends
}

function build(k: Kit, p: P, g: G) {
  const { od, yc, tw, yb, ys, nb, s } = g
  const nbOd = pipeOD(nb)
  const coat = COAT()
  // ground: soil either side of the trench, sand bedding, backfill unless cut away
  const z0 = -5.2
  const z1 = 3.4
  const soil = soilM()
  // with the cut-away the earth in front of the trench is ghosted so the buried pipe and valve show through
  const ghost = paint('#6a4c30', { metalness: 0, roughness: 1, clearcoat: 0, weather: 0, transparent: true, opacity: 0.22 })
  for (const [za, zb] of [[z0, -tw / 2], [tw / 2, z1]]) {
    const front = za > 0 && p.cutaway
    k.box(front ? ghost : soil, [2 * LP, -ys - 0.25, zb - za], [0, (ys - 0.25) / 2, (za + zb) / 2])
    k.box(front ? ghost : topsoil(), [2 * LP, 0.25, zb - za], [0, -0.125, (za + zb) / 2])
  }
  k.box(soil, [2 * LP, yb - ys, tw], [0, (yb + ys) / 2, 0])
  const ySand = p.cutaway ? yc - od / 2 : yc + od * 0.3
  k.box(sand(), [2 * LP, ySand - yb, tw], [0, (ySand + yb) / 2, 0])
  if (!p.cutaway) k.box(soil, [2 * LP, -(yc + od * 0.3), tw], [0, (yc + od * 0.3) / 2, 0])
  for (const [za, zb] of p.cutaway ? [[-4.6, -tw / 2], [tw / 2, 2.6]] : [[-4.6, 2.6]]) k.box(gravel(), [12.4, 0.04, zb - za], [0, 0.02, (za + zb) / 2])

  // mainline: flanged pup ends at the trench limits, 3LPE-coated pipe, welded ball valve body
  const Lb = Math.max(faceToFace('ball-full', g.nps, p.rating), od * 2.2)
  const Rb = od * 0.82
  for (const sx of [-1, 1]) {
    const hub = flange(k, g.nps, p.rating, [sx * LP, yc, 0], sx < 0 ? '-x' : 'x', true)
    k.pipe(coat, [sx * (LP - hub), yc, 0], [sx * (Lb / 2), yc, 0], od, pipeWall(g.nps, 'XS'))
    k.lathe(coat, [[od / 2, 0], [od * 0.6, od * 0.18], [Rb * 0.95, Lb / 2 - Rb * 0.95], [Rb, Lb / 2 - Rb * 0.7]], [sx * Lb / 2, yc, 0], sx < 0 ? 'x' : '-x', 40)
  }
  k.cyl(coat, Rb, Lb - 2 * Rb * 0.7 + 0.02, [0, yc, 0], 'x', 40)
  k.sphere(coat, Rb * 1.02, [0, yc, 0], [0.8, 1, 1], 32)
  // trunnion bosses, body support pad, vent / drain / sealant extension lines
  for (const sz of [-1, 1]) k.cyl(coat, od * 0.3, 0.12, [0, yc, sz * (Rb + 0.02)], 'z', 20)
  k.cyl(coat, od * 0.28, 0.12, [0, yc - Rb - 0.03, 0], 'y', 20)
  k.box('concrete', [Lb * 0.7, yc - Rb - 0.08 - yb + 0.05, tw - 0.1], [0, (yc - Rb - 0.08 + yb - 0.05) / 2, 0])
  const yTop = yc + Rb
  // stem extension: housing tube up through grade to the actuator adapter
  const ya = 0.5 * s + 0.35
  k.cyl(coat, od * 0.32, 0.1, [0, yTop + 0.04, 0], 'y', 28)
  k.cyl(coat, Math.max(0.11, od * 0.2), -yTop + 0.1, [0, (yTop + 0.1) / 2, 0], 'y', 24)
  k.cyl(YELLOW(), Math.max(0.11, od * 0.2), ya - 0.1, [0, (ya + 0.1) / 2, 0], 'y', 24)
  k.cyl('flangeSteel', Math.max(0.17, od * 0.3), 0.04, [0, ya, 0], 'y', 28)
  for (const [dx, dz, c] of [[0.22, 0.18, 'brass'], [-0.22, 0.18, 'brass'], [0.22, -0.18, 'stainless']] as [number, number, MatKey][]) {
    k.tube('tubing', [[dx * 0.5, yTop - 0.02, dz * 0.5], [dx, yTop + 0.25, dz], [dx, 0.35, dz]], 0.012)
    k.cyl(c, 0.025, 0.08, [dx, 0.39, dz], 'y', 10)
    k.hex('nut', 0.05, 0.03, [dx, 0.44, dz])
  }
  // valve pad spanning the trench
  k.box('concrete', [2.4, 0.2, Math.max(2.4, tw + 1)], [0, 0.1, 0])
  if (p.actuator === 'gas-over-oil') gasOverOil(k, ya, s)
  else electricActuator(k, ya, s)

  // risers through grade: bypass at ±2.6, blowdown at ±4.4
  const yv = 0.9
  const Lg = faceToFace('gate', nb, p.rating)
  const riser = (x: number, zTo: number, valveX: number, valveL: number) => {
    const top = yc + od / 2
    k.cyl(coat, nbOd * 0.9, 0.06, [x, top + 0.01, 0], 'y', 20)
    k.pipe(coat, [x, top - 0.02, 0], [x, 0.12, 0], nbOd, pipeWall(nb, 'XS'))
    k.cyl(paint('#3b3226', { roughness: 0.9 }), nbOd / 2 + 0.006, 0.3, [x, 0, 0], 'y', 20)
    const sx = Math.sign(x)
    const end = valveX + sx * (valveL / 2 + 0.0045 + 0.1)
    pipeRun(k, [[x, 0.12, 0], [x, yv, 0], [x, yv, zTo], [end, yv, zTo]], nb, { mat: YELLOW() })
    // pipe support on a concrete sleeper
    plinth(k, x, zTo, 0.4, 0.4, yv - nbOd / 2 - 0.06)
    k.box('galvanised', [0.2, 0.06, 0.25], [x, yv - nbOd / 2 - 0.03, zTo])
  }
  for (const sx of [-1, 1]) {
    riser(sx * 2.6, -1.6, sx * 1.3, Lg)
    const [eA, eB] = valveEnds(k, nb, p.rating, sx * 1.3, yv, -1.6, Lg)
    // the inner end runs to the centre: bypass header between the two valves
    k.pipe(YELLOW(), [sx < 0 ? eB : eA, yv, -1.6], [0, yv, -1.6], nbOd, pipeWall(nb, 'XS'))
    riser(sx * 4.4, -3.2, sx * 2.4, Lg)
    const [dA, dB] = valveEnds(k, nb, p.rating, sx * 2.4, yv, -3.2, Lg)
    k.pipe(YELLOW(), [sx < 0 ? dB : dA, yv, -3.2], [0, yv, -3.2], nbOd, pipeWall(nb, 'XS'))
    // pressure transmitter on the bypass riser, earth on the riser
    pt(k, [sx * 2.6, 0.55, 0], sx)
  }
  k.sphere(YELLOW(), nbOd * 0.56, [0, yv, -1.6], undefined, 16)
  plinth(k, 0, -1.6, 0.4, 0.4, yv - nbOd / 2 - 0.06)
  // blowdown stack with silencer, supported by a column
  const stackTop = 3.2 + s
  k.sphere(YELLOW(), nbOd * 0.56, [0, yv, -3.2], undefined, 16)
  k.pipe(YELLOW(), [0, yv, -3.2], [0, 2.2, -3.2], nbOd, pipeWall(nb, 'XS'))
  const Rs = Math.max(0.25, nbOd * 1.9)
  k.cyl(YELLOW(), nbOd * 0.7, 0.15, [0, 2.25, -3.2], 'y', 24, Rs)
  k.cyl('galvanised', Rs, 1.6, [0, 3.1, -3.2], 'y', 36)
  for (const y of [2.3, 3.1, 3.9]) k.torus('galvanised', Rs + 0.01, 0.015, [0, y, -3.2], 'y', 6, 36)
  k.cyl('galvanised', Rs, 0.15, [0, 3.98, -3.2], 'y', 24, nbOd * 0.7)
  k.pipe('galvanised', [0, 4.0, -3.2], [0, stackTop + 0.8, -3.2], nbOd * 1.3, 0.006)
  plinth(k, 0, -4.0, 0.6, 0.6, 0.3)
  basePlate(k, 0, 0.33, -4.0, 0.35, 0.35)
  member(k, [0, 0.33, -4.0], [0, stackTop, -4.0], 'CHS 168.3x8', 'galvanised')
  for (const y of [1.5, 2.8, stackTop - 0.3]) {
    k.box('galvanised', [0.08, 0.08, 0.8 - (y > 2.2 && y < 4 ? Rs - nbOd / 2 : 0)], [0, y, -4.0 + (0.8 - (y > 2.2 && y < 4 ? Rs - nbOd / 2 : 0)) / 2])
  }

  // RTU kiosk with solar panel and antenna, CP test post, pipeline markers
  plinth(k, -4.6, -3.9, 1.1, 0.8, 0.15)
  k.rbox(paint('#d8d4c4', { roughness: 0.6 }), [0.9, 1.3, 0.6], 0.03, [-4.6, 0.8, -3.9])
  k.box(paint('#bdb8a6'), [0.9, 0.04, 0.6], [-4.6, 1.47, -3.9])
  member(k, [-5.2, 0.15, -3.9], [-5.2, 3.2, -3.9], 'CHS 88.9x6.3', 'galvanised')
  k.box(paint('#1a2a44', { metalness: 0.5, roughness: 0.25 }), [1.2, 0.03, 0.8], [-5.2, 3.2, -3.85], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.6))
  k.rod('galvanised', [-5.2, 3.2, -3.9], [-5.2, 4.6, -3.9], 0.015, 6)
  k.cyl('plasticGrey', 0.03, 0.6, [-5.2, 4.9, -3.9], 'y', 8)
  k.tube('cable', [[-5.2, 2.0, -3.85], [-5.0, 1.6, -3.85], [-4.9, 1.2, -3.6]], 0.01)
  for (const [x, z, c] of [[5.0, 1.9, '#e5b114'], [-6.8, 1.0, '#e2671f'], [6.8, 1.0, '#e2671f']] as [number, number, string][]) {
    k.cyl(paint(c), 0.05, 1.3, [x, 0.65, z], 'y', 12)
    k.box(paint(c), [0.25, 0.3, 0.02], [x, 1.1, z + 0.06])
  }
  // compound fence (chain-link, barbed topping) with a double gate, gap where the trench passes
  const fo = { style: 'chain-link' as const, height: 2.1, topping: 'barbed' as const }
  const X = 6.2
  const zf0 = -4.6
  const zf1 = 2.6
  const tr = tw / 2 + 0.3
  fenceRun(k, [-X, 0, zf1], [-2, 0, zf1], fo, true, [0, 0, 1])
  swingGate(k, [-2, 0, zf1], [2, 0, zf1], fo)
  fenceRun(k, [2, 0, zf1], [X, 0, zf1], fo, true, [0, 0, 1])
  fenceRun(k, [X, 0, zf1], [X, 0, tr], fo, false, [1, 0, 0])
  fenceRun(k, [X, 0, tr], [X, 0, -tr], fo, false, [1, 0, 0])
  fenceRun(k, [X, 0, -tr], [X, 0, zf0], fo, false, [1, 0, 0])
  fenceRun(k, [X, 0, zf0], [-X, 0, zf0], fo, false, [0, 0, -1])
  fenceRun(k, [-X, 0, zf0], [-X, 0, -tr], fo, false, [-1, 0, 0])
  fenceRun(k, [-X, 0, -tr], [-X, 0, tr], fo, false, [-1, 0, 0])
  fenceRun(k, [-X, 0, tr], [-X, 0, zf1], fo, false, [-1, 0, 0])
  // warning signs and station name plate on the gate side
  const sq = new THREE.Quaternion()
  k.plane(signMaterial('noentry'), 0.6, 0.3, [-3.5, 1.4, zf1 + 0.05], sq)
  k.plane(textMaterial('DANGER  HIGH PRESSURE GAS', '#c3221a', '#ffffff'), 0.9, 0.22, [3.5, 1.4, zf1 + 0.05], sq)
  if (p.tag) {
    k.plane(textMaterial(p.tag, '#1f4e9a', '#ffffff'), 0.9, 0.22, [3.5, 1.1, zf1 + 0.05], sq)
    tagPlate(k, p.tag, [0.4, ya - 0.2, Math.max(0.11, g.od * 0.2) + 0.002], 'z', 0.14)
  }
  earthBond(k, [0.2, 0.6, 0.62 * s], [0.4, 0, 1], 0.2, 0.3)
}

function pt(k: Kit, p: V3, sx: number) {
  const z = p[2] + 0.12
  k.rod('stainless', [p[0], p[1], p[2]], [p[0], p[1], z + 0.1], 0.012, 8)
  k.box('valveBody', [0.07, 0.07, 0.09], [p[0], p[1], z + 0.05])
  k.box('stainless', [0.12, 0.05, 0.05], [p[0], p[1], z + 0.13])
  k.cyl(paint('#3a6ea5'), 0.045, 0.09, [p[0], p[1] + 0.09, z + 0.13], 'y', 16)
  k.cyl(paint('#3a6ea5'), 0.05, 0.05, [p[0], p[1] + 0.16, z + 0.13], 'z', 16)
  gauge(k, [p[0] + sx * 0.12, p[1] + 0.06, z + 0.13], 'z', 0.08, 'bar', 160)
}

function gasOverOil(k: Kit, y: number, s: number) {
  const body = paint('#e1b10f', { clearcoat: 0.5 })
  // scotch-yoke housing on the adapter, hydraulic cylinder along +Z, spring-free double acting
  k.rbox(body, [0.45 * s, 0.42 * s, 0.7 * s], 0.03, [0, y + 0.21 * s, 0])
  k.cyl(body, 0.15 * s, 0.85 * s, [0, y + 0.21 * s, 0.35 * s + 0.42 * s], 'z', 28)
  k.cyl(body, 0.17 * s, 0.04, [0, y + 0.21 * s, 0.35 * s + 0.02], 'z', 28)
  k.cyl(body, 0.17 * s, 0.05, [0, y + 0.21 * s, 0.35 * s + 0.85 * s], 'z', 28)
  k.boltCircle('boltXylan', 'nut', 6, 0.13 * s, [0, y + 0.21 * s, 0.35 * s + 0.82 * s], 'z', 0.012, 0.1, [0.08])
  // position indicator
  k.cyl('plasticGrey', 0.07, 0.06, [0, y + 0.45 * s, 0], 'y', 20)
  // gas / oil tanks on a frame behind
  for (const sx of [-1, 1]) {
    const x = sx * 0.4 * s
    const zt = -0.55 * s
    k.cyl(body, 0.15 * s, 1.0 * s, [x, y + 0.55 * s, zt], 'y', 24)
    k.dome(body, 0.15 * s, [x, y + 1.05 * s, zt], 'y', Math.PI / 2, 0.5)
    k.dome(body, 0.15 * s, [x, y + 0.05 * s, zt], '-y', Math.PI / 2, 0.5)
    k.cyl('brass', 0.015, 0.06, [x, y + 1.15 * s, zt], 'y', 8)
    k.box('galvanised', [0.06, y + 0.05 * s - 0.2, 0.06], [x, (y + 0.05 * s + 0.2) / 2, zt])
    k.tube('tubing', [[x, y + 0.08 * s, zt + 0.12 * s], [x, y + 0.08 * s, -0.1], [x * 0.4, y + 0.1 * s, 0.25 * s]], 0.008)
  }
  // control manifold with manual hydraulic pump and lever, power-gas filter
  k.rbox('stainless', [0.5 * s, 0.35 * s, 0.18 * s], 0.02, [0.62 * s, y + 0.3 * s, 0.25 * s])
  k.cyl('handwheel', 0.012, 0.6 * s, [0.62 * s + 0.2 * s, y + 0.6 * s, 0.25 * s], 'y', 8)
  gauge(k, [0.62 * s - 0.12 * s, y + 0.38 * s, 0.25 * s + 0.09 * s], 'z', 0.07, 'bar', 100)
  k.cyl('stainless', 0.04, 0.16, [0.62 * s - 0.15 * s, y + 0.1 * s, 0.25 * s], 'y', 12)
  k.tube('tubing', [[0.62 * s - 0.15 * s, y + 0.02 * s, 0.25 * s], [0.62 * s - 0.15 * s, 0.25, 0.25 * s], [2.6 - 0.1, 0.25, 0.25], [2.6 - 0.05, 0.4, 0.06]], 0.006)
  junctionBox(k, [-0.62 * s, y + 0.15 * s, 0.1], 'x', [0.2, 0.25, 0.12], 'stainless')
  for (const [x, z, top] of [[-0.62 * s - 0.03, 0.1, y + 0.15 * s - 0.12], [0.62 * s, 0.25 * s - 0.12 * s, y + 0.3 * s - 0.175 * s]] as [number, number, number][]) {
    k.box('galvanised', [0.05, top - 0.2, 0.05], [x, (top + 0.2) / 2, z])
    k.box('galvanised', [0.15, 0.012, 0.15], [x, 0.206, z])
  }
}

function electricActuator(k: Kit, y: number, s: number) {
  const body = paint('#2f4f7a', { clearcoat: 0.5 })
  k.rbox(body, [0.5 * s, 0.35 * s, 0.5 * s], 0.04, [0, y + 0.18 * s, 0])
  k.cyl(body, 0.16 * s, 0.6 * s, [0.5 * s, y + 0.2 * s, 0], 'x', 28)
  k.rbox(body, [0.3 * s, 0.4 * s, 0.35 * s], 0.04, [0, y + 0.55 * s, 0])
  k.cyl('glass', 0.06, 0.02, [0, y + 0.55 * s, 0.18 * s], 'z', 20)
  k.cyl('plasticGrey', 0.07, 0.03, [0, y + 0.75 * s + 0.015, 0], 'y', 20)
  k.handwheel('handwheel', 0.45 * s, [0, y + 0.2 * s, -0.32 * s], 'z', 5)
  junctionBox(k, [-0.25 * s, y + 0.3 * s, 0], '-x', [0.18, 0.22, 0.1], 'stainless')
}
