// Road-tanker loading gantry: canopy, island platform with fold-down gangway, bottom and top loading arms, meter run, overfill and earth monitor. API RP 1004, EN 13083, API 2610.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, gasket, gauge, grating, handrail, member, pipe, pipeRun, tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { port, type Port } from '../lib/ports'
import { faceToFace, pipeOD, type Rating } from '../lib/standards'
import { hazardStripeMaterial, textMaterial } from '../lib/textures'
import { GateValve } from '../valves/gate-valve'
import { anchorBolt, basePlate, clamp, earthBond, plinth, stair, swivel } from './_onshore'

type Product = 'gasoline' | 'diesel' | 'jet' | 'crude'
type Loading = 'bottom' | 'top' | 'both'

export interface TruckLoadingBayProps {
  /** loading lanes, each with its own island */
  bays?: number
  product?: Product
  loading?: Loading
  /** product line size, inches */
  nps?: number
  rating?: Rating
  /** gangways lowered onto the tanker */
  gangwayDown?: boolean
  tag?: string
}

export const defaults = { bays: 2, product: 'gasoline' as Product, loading: 'both' as Loading, nps: 4, rating: 150 as Rating, gangwayDown: true, tag: '' }

// typical: product identification colours after API RP 1637 / EI 1542
const BAND = { gasoline: '#c0262a', diesel: '#e3b40f', jet: '#1d1d1d', crude: '#5b3a1e' }
const LANE = 4.5
const ISLAND = 1.6
const PITCH = LANE + ISLAND
const X0 = -8 // island west end
const X1 = 9
const YH = 0.75 // meter run centreline
const PLAT = 3.9 // gantry deck, typical tanker top + 0.3 m
const ROOF = 7.6

function layout(p: typeof defaults) {
  const n = clamp(Math.round(p.bays), 1, 6)
  const W = n * PITCH
  const zi = (i: number) => -W / 2 + ISLAND / 2 + i * PITCH
  return { n, W, zi, xIn: X0 - 0.6, zm: (i: number) => zi(i) - 0.4 }
}

export function ports(props: TruckLoadingBayProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return Array.from({ length: g.n }, (_, i) => port(`inlet-${i + 1}`, `Bay ${i + 1} product inlet`, [g.xIn, YH, g.zm(i)], [-1, 0, 0], p.nps, p.rating))
}

export function TruckLoadingBay(props: TruckLoadingBayProps & GroupProps) {
  const { bays, product, loading, nps, rating, gangwayDown, tag, ...group } = { ...defaults, ...props }
  const p = { bays, product, loading, nps, rating, gangwayDown, tag }
  const g = layout(p)
  const data = useKit((k) => build(k, p, g), [bays, product, loading, nps, rating, gangwayDown, tag])
  const L = faceToFace('gate', nps, rating)
  return (
    <group {...group}>
      <KitMesh data={data} />
      {Array.from({ length: g.n }, (_, i) => (
        <GateValve key={i} nps={nps} rating={rating} position={[g.xIn + 0.45 + L / 2, YH, g.zm(i)]} tag={`XV-${i + 1}01`} />
      ))}
    </group>
  )
}

export default TruckLoadingBay

type P = typeof defaults
type G = ReturnType<typeof layout>

function build(k: Kit, p: P, g: G) {
  const band = paint(BAND[p.product])
  const kerb = paint('#e7e3d6', { metalness: 0, roughness: 0.85, clearcoat: 0 })
  // paved apron with a grated drain channel along each lane
  const zA = -g.W / 2 - 0.5
  const zB = g.W / 2 + 0.5
  k.box('concrete', [X1 - X0 + 6, 0.06, zB - zA], [(X0 + X1) / 2, 0.03, (zA + zB) / 2])
  for (let i = 0; i < g.n; i++) {
    const zc = g.zi(i) + ISLAND / 2 + LANE / 2
    k.box('castIron', [X1 - X0 + 4, 0.004, 0.3], [(X0 + X1) / 2, 0.062, zc])
    for (const s of [-1, 1]) k.box(kerb, [X1 - X0 + 5, 0.003, 0.1], [(X0 + X1) / 2, 0.0615, zc + s * (LANE / 2 - 0.1)])
    bay(k, p, g, i, band)
  }
  canopy(k, g)
  if (p.tag) {
    const zEnd = -g.W / 2 - 0.05
    k.box('stainless', [2.4, 0.5, 0.02], [0, ROOF - 0.9, zEnd - 0.2])
    k.plane(textMaterial(p.tag, '#1f4e9a', '#ffffff'), 2.3, 0.42, [0, ROOF - 0.9, zEnd - 0.212], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
  }
}

function canopy(k: Kit, g: G) {
  const xs = [-5.6, 8.4]
  const z0 = -g.W / 2 - 0.3
  const z1 = g.W / 2 + 0.3
  for (const x of xs) {
    for (let i = 0; i < g.n; i++) {
      const z = g.zi(i) + 0.45
      plinth(k, x, z, 0.7, 0.7, 0.25)
      basePlate(k, x, 0.29, z, 0.5, 0.5, 0.03, 0.03)
      member(k, [x, 0.29, z], [x, ROOF - 0.5, z], 'HEB 300', 'structSteel', [1, 0, 0])
      // knee braces to the rafter
      for (const s of [-1, 1]) member(k, [x, ROOF - 1.8, z], [x, ROOF - 0.62, z + s * 1.4], 'L80x80x8', 'structSteel')
      earthBond(k, [x, 0.6, z + 0.16], [0, 0, 1], 0.06, 0.25)
    }
    member(k, [x, ROOF - 0.3, z0], [x, ROOF - 0.3, z1], 'IPE 500', 'structSteel', [0, 1, 0])
  }
  // purlins, deck sheet, fascia and gutters
  const xa = -7
  const xb = 9.8
  for (let z = z0 + 0.1; z <= z1 - 0.05; z += 1.5) member(k, [xa, ROOF - 0.01, z], [xb, ROOF - 0.01, z], 'UPN 160', 'galvanised', [0, 1, 0])
  k.box('cladding', [xb - xa, 0.04, z1 - z0], [(xa + xb) / 2, ROOF + 0.1, (z0 + z1) / 2])
  for (const z of [z0, z1]) {
    k.box('cladding', [xb - xa, 0.6, 0.03], [(xa + xb) / 2, ROOF - 0.15, z])
    k.box('galvanised', [xb - xa, 0.12, 0.14], [(xa + xb) / 2, ROOF - 0.5, z + (z > 0 ? 0.08 : -0.08)])
  }
  for (const x of [xa, xb]) k.box('cladding', [0.03, 0.6, z1 - z0], [x, ROOF - 0.15, (z0 + z1) / 2])
  // lighting under the canopy
  for (const x of [-3, 1.5, 6])
    for (let i = 0; i < g.n; i++) {
      const z = g.zi(i) + ISLAND / 2 + LANE / 2
      k.rbox('aluminium', [1.2, 0.1, 0.3], 0.02, [x, ROOF - 0.12, z])
      k.box('lampLens', [1.1, 0.01, 0.24], [x, ROOF - 0.175, z])
    }
}

function bay(k: Kit, p: P, g: G, i: number, band: THREE.Material) {
  const zi = g.zi(i)
  const zm = g.zm(i)
  const zE = zi + ISLAND / 2 // lane-side kerb
  const top = 0.2
  // island with painted kerb ends
  k.box('concrete', [X1 - X0, top - 0.06, ISLAND], [(X0 + X1) / 2, 0.06 + (top - 0.06) / 2, zi])
  for (const x of [X0, X1]) {
    const geo = new THREE.BoxGeometry(0.3, top - 0.06 + 0.002, ISLAND + 0.002)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * 4, uv.getY(j) * 0.5)
    k.add(hazardStripeMaterial(), geo, new THREE.Matrix4().makeTranslation(x + (x < 0 ? 0.15 : -0.15), 0.06 + (top - 0.06) / 2, zi))
  }
  // crash bollards at both island ends
  for (const x of [X0 - 0.5, X1 + 0.5])
    for (const s of [-0.5, 0.5]) {
      k.cyl(paint('#e5b114'), 0.085, 1.1, [x, 0.6, zi + s], 'y', 16)
      k.dome(paint('#e5b114'), 0.085, [x, 1.15, zi + s], 'y')
    }

  // meter run: inlet spool, block valve (component), strainer, air eliminator, meter, set-stop valve
  const nps = p.nps
  const od = pipeOD(nps)
  const L = faceToFace('gate', nps, p.rating)
  const xv = g.xIn + 0.45
  const fi = flange(k, nps, p.rating, [g.xIn, YH, zm], '-x', true)
  const ha = flange(k, nps, p.rating, [xv - 0.0045, YH, zm], 'x', true)
  k.pipe('pipePaint', [g.xIn + fi, YH, zm], [xv - 0.0045 - ha, YH, zm], od, od * 0.07)
  gasket(k, nps, p.rating, [xv - 0.00225, YH, zm], 'x')
  const hb = flange(k, nps, p.rating, [xv + L + 0.0045, YH, zm], '-x', true)
  gasket(k, nps, p.rating, [xv + L + 0.00225, YH, zm], 'x')
  for (const x of [g.xIn + 0.2, X0 + 0.25]) {
    plinth(k, x, zm, 0.3, 0.4, x < X0 ? 0.55 : 0.35, x < X0 ? 0 : top)
    k.box('galvanised', [0.2, YH - od / 2 - (x < X0 ? 0.55 : 0.35 + top), 0.3], [x, (YH - od / 2 + (x < X0 ? 0.55 : 0.35 + top)) / 2, zm])
  }
  let x = xv + L + 0.0045 + hb
  const seg = (x1: number) => {
    k.pipe('pipePaint', [x, YH, zm], [x1, YH, zm], od, od * 0.07)
    x = x1
  }
  seg(X0 + 0.9)
  // basket strainer with quick-opening cover
  k.cyl('valveBody', od * 1.1, od * 2.6, [x + od * 1.2, YH - od * 0.4, zm], 'y', 24)
  k.cyl('valveBody', od * 1.35, 0.04, [x + od * 1.2, YH + od * 0.95, zm], 'y', 24)
  k.cyl('handwheel', 0.02, 0.12, [x + od * 1.2, YH + od * 1.05, zm], 'z', 8)
  k.cyl('valveBody', od * 0.6, od * 2.4, [x + od * 1.2, YH, zm], 'x', 20)
  x += od * 2.4
  seg(x + 0.4)
  // air eliminator above the meter inlet
  k.cyl('equipmentPaint', 0.11, 0.7, [x - 0.2, YH + 0.45, zm], 'y', 24)
  k.dome('equipmentPaint', 0.11, [x - 0.2, YH + 0.8, zm], 'y', Math.PI / 2, 0.5)
  k.cyl('valveBody', 0.025, 0.12, [x - 0.2, YH + 0.9, zm], 'y', 10)
  // positive-displacement meter with register and pulser
  const mL = 0.55
  k.cyl('castIron', 0.24, mL, [x + mL / 2, YH + 0.05, zm], 'x', 32)
  for (const s of [-1, 1]) k.cyl('castIron', 0.27, 0.04, [x + mL / 2 + s * mL * 0.45, YH + 0.05, zm], 'x', 32)
  k.box('castIron', [0.32, 0.25, 0.28], [x + mL / 2, YH + 0.4, zm])
  k.rbox('stainless', [0.28, 0.24, 0.12], 0.02, [x + mL / 2, YH + 0.64, zm + 0.04])
  k.plane(textMaterial('0 0 0 4 2 7 L', '#101418', '#9ef0a0', 256, 64), 0.2, 0.05, [x + mL / 2, YH + 0.66, zm + 0.101])
  k.box('castIron', [0.22, od * 0.8, 0.22], [x + mL / 2, YH + 0.05 - 0.28, zm])
  x += mL
  seg(x + 0.25)
  // digital set-stop control valve with solenoid pilots
  k.sphere('valveBody', od * 1.0, [x + od, YH, zm], [1.2, 1, 1], 20)
  k.cyl('valveBody', od * 0.9, od * 0.7, [x + od, YH + od * 0.95, zm], 'y', 20)
  for (const s of [-1, 1]) {
    k.cyl('actuatorBlue', 0.03, 0.12, [x + od + s * 0.06, YH + od * 1.45, zm], 'y', 12)
    k.box('actuatorBlue', [0.06, 0.05, 0.06], [x + od + s * 0.06, YH + od * 1.45 + 0.08, zm])
  }
  k.tube('tubing', [[x + od - 0.06, YH + od * 1.3, zm], [x + od - 0.06, YH + od * 1.3, zm + 0.12], [x - 0.1, YH + 0.1, zm + 0.12], [x - 0.1, YH + 0.06, zm]], 0.004)
  x += od * 2
  gauge(k, [x + 0.12, YH + od / 2 + 0.12, zm], 'z', 0.08, 'bar', 16)
  k.rod('stainless', [x + 0.12, YH + od / 2, zm], [x + 0.12, YH + od / 2 + 0.08, zm], 0.007, 8)
  // run on to the arm manifold, rise and supports
  const xr = -1.2
  seg(xr - 0.3)
  for (const xs of [X0 + 2, X0 + 4]) {
    k.box('galvanised', [0.1, YH - od / 2 - top, 0.25], [xs, (YH - od / 2 + top) / 2, zm])
    k.box('galvanised', [0.25, 0.012, 0.3], [xs, top + 0.006, zm])
  }
  const hdr: V3 = [xr - 0.3, YH, zm]
  const bottom = p.loading !== 'top'
  const topArm = p.loading !== 'bottom'
  // product header along the island feeding the bottom arms
  if (bottom) {
    pipeRun(k, [hdr, [2.3, YH, zm]], nps)
    k.dome('pipePaint', od / 2, [2.3, YH, zm], 'x', Math.PI / 2, 0.5)
    for (const [j, xb] of [0.4, 1.6].entries()) {
      bottomArm(k, nps, [xb, YH, zm], zE, band, j === 0 ? 1 : -1)
    }
    // vapour recovery arm and header back to the vapour line
    const vz = zi + 0.05
    pipeRun(k, [[X0 + 0.3, top + 0.35, vz], [3.7, top + 0.35, vz]], nps, { mat: 'equipmentPaint' })
    k.dome('equipmentPaint', od / 2, [3.7, top + 0.35, vz], 'x', Math.PI / 2, 0.5)
    k.dome('equipmentPaint', od / 2, [X0 + 0.3, top + 0.35, vz], '-x', Math.PI / 2, 0.5)
    bottomArm(k, nps, [3.4, top + 0.35, vz], zE, paint('#e8e8e2'), 1, true)
    for (const xs of [X0 + 1.5, 0, 3.0]) k.box('galvanised', [0.08, 0.35 - od / 2, 0.15], [xs, top + (0.35 - od / 2) / 2, vz])
  }
  // top-loading arm: riser through the gantry, swivel, counterbalanced boom and drop tube
  if (topArm) {
    const hr = PLAT + 1.6
    pipeRun(k, [hdr, [xr, YH, zm], [xr, hr, zm]], nps)
    swivel(k, [xr, hr, zm], [xr, hr + 0.3, zm], od)
    const ang = Math.PI / 3
    const reach = 2.6
    const d: V3 = [Math.cos(ang), 0, Math.sin(ang)]
    const tip: V3 = [xr + d[0] * reach, hr + 0.55, zm + d[2] * reach]
    pipeRun(k, [[xr, hr + 0.3, zm], [xr, hr + 0.55, zm], tip, [tip[0], hr - 0.05, tip[2]]], nps, { mat: 'aluminium' })
    swivel(k, [tip[0], hr - 0.05, tip[2]], [tip[0], hr - 0.3, tip[2]], od)
    k.pipe('aluminium', [tip[0], hr - 0.3, tip[2]], [tip[0], PLAT + 0.55, tip[2]], od, od * 0.06)
    k.cyl('aluminium', 0.28, 0.14, [tip[0], hr - 0.55, tip[2]], 'y', 28, 0.18)
    k.rod('handwheel', [tip[0], hr - 0.45, tip[2]], [tip[0] + 0.35, hr - 0.45, tip[2]], 0.015, 8)
    k.torus(band, od / 2 + 0.006, 0.012, [tip[0], hr - 0.8, tip[2]], 'y', 6, 20)
    // balance spring cylinder from the riser to the boom
    k.rod('actuatorYellow', [xr + 0.08, hr - 0.4, zm], [xr + d[0] * 1.0, hr + 0.48, zm + d[2] * 1.0], 0.045, 12)
    k.rod('stainless', [xr + d[0] * 0.75, hr + 0.32, zm + d[2] * 0.75], [xr + d[0] * 1.0, hr + 0.48, zm + d[2] * 1.0], 0.018, 8)
    k.torus(band, od / 2 + 0.006, 0.012, [xr, PLAT + 0.5, zm], 'y', 6, 20)
  }

  // gantry platform over the island, stair, fold-down gangway
  const xp0 = -3
  const xp1 = 3
  const zp0 = zi - 0.7
  const zp1 = zi + 0.7
  for (const xc of [xp0 + 0.1, xp1 - 0.1])
    for (const zc of [zp0 + 0.1, zp1 - 0.1]) {
      basePlate(k, xc, top + 0.02, zc, 0.3, 0.3, 0.02, 0.02)
      member(k, [xc, top + 0.02, zc], [xc, PLAT - 0.2, zc], 'SHS 150x150x8', 'galvanised')
    }
  for (const zc of [zp0 + 0.1, zp1 - 0.1]) member(k, [xp0, PLAT - 0.1, zc], [xp1, PLAT - 0.1, zc], 'UPN 200', 'galvanised', [0, 1, 0])
  for (let xc = xp0 + 0.1; xc <= xp1 - 0.05; xc += 1.2) member(k, [xc, PLAT - 0.1, zp0 + 0.1], [xc, PLAT - 0.1, zp1 - 0.1], 'UPN 160', 'galvanised', [0, 1, 0])
  grating(k, [0, PLAT, zi], xp1 - xp0, zp1 - zp0)
  const gw = 0.8
  const gx = 0.6
  handrail(k, [[xp1, PLAT, zp0], [xp0, PLAT, zp0], [xp0, PLAT, zp1], [gx - gw / 2 - 0.05, PLAT, zp1]], 'safetyYellow')
  handrail(k, [[gx + gw / 2 + 0.05, PLAT, zp1], [xp1 - 1.05, PLAT, zp1]], 'safetyYellow')
  stair(k, [xp1 + 0.01 + stairRun(PLAT - top), top, zi - 0.2], '-x', PLAT - top, 0.8)
  // gangway: hinged at the deck edge, counterbalanced, cage rails
  const down = p.gangwayDown ? -0.42 : 1.45
  const Lg = 1.9
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -down)
  k.with(new THREE.Matrix4().compose(new THREE.Vector3(gx, PLAT, zp1), q, new THREE.Vector3(1, 1, 1)), () => {
    k.cyl('stainless', 0.03, gw + 0.1, [0, -0.03, 0], 'x', 10)
    grating(k, [0, 0, Lg / 2], gw, Lg)
    for (const s of [-1, 1]) {
      k.box('galvanised', [0.01, 0.12, Lg], [s * gw / 2, -0.05, Lg / 2])
      k.rod('safetyYellow', [s * gw / 2, 0, 0.05], [s * gw / 2, 1.0, 0.05], 0.02, 8)
      k.rod('safetyYellow', [s * gw / 2, 0, Lg - 0.05], [s * gw / 2, 1.0, Lg - 0.05], 0.02, 8)
      k.rod('safetyYellow', [s * gw / 2, 1.0, 0.05], [s * gw / 2, 1.0, Lg - 0.05], 0.02, 8)
      k.rod('safetyYellow', [s * gw / 2, 0.5, 0.05], [s * gw / 2, 0.5, Lg - 0.05], 0.016, 8)
    }
    k.box('rubberBlack', [gw, 0.05, 0.08], [0, -0.04, Lg])
  })
  const att = new THREE.Vector3(gw / 2 + 0.04, 0.5, Lg * 0.35).applyQuaternion(q).add(new THREE.Vector3(gx, PLAT, zp1))
  k.rod('actuatorYellow', [gx + gw / 2 + 0.12, PLAT + 1.7, zp1 - 0.1], att.toArray() as V3, 0.025, 10)
  member(k, [gx + gw / 2 + 0.12, PLAT, zp1 - 0.1], [gx + gw / 2 + 0.12, PLAT + 1.8, zp1 - 0.1], 'SHS 100x100x6', 'galvanised')

  // batch controller, overfill / earth monitor with plug and clamp reel, emergency stop
  const pedestal = (xp: number, h: number) => {
    k.box('galvanised', [0.25, 0.012, 0.25], [xp, top + 0.006, zE - 0.25])
    for (const a of [-1, 1]) for (const b of [-1, 1]) anchorBolt(k, [xp + a * 0.09, top + 0.012, zE - 0.25 + b * 0.09], 0.012)
    k.box('galvanised', [0.08, h, 0.08], [xp, top + h / 2, zE - 0.25])
  }
  pedestal(-0.4, 1.3)
  k.rbox('stainless', [0.42, 0.5, 0.18], 0.02, [-0.4, top + 1.45, zE - 0.12])
  k.plane(textMaterial('BAY ' + (i + 1) + '  PRESET 32000 L', '#0f2a1a', '#8ff59b', 512, 96), 0.34, 0.07, [-0.4, top + 1.6, zE - 0.029])
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) k.box('plasticGrey', [0.05, 0.035, 0.01], [-0.4 - 0.09 + c * 0.06, top + 1.47 - r * 0.05, zE - 0.025])
  pedestal(4.2, 1.2)
  k.rbox(paint('#d5d8d6'), [0.4, 0.5, 0.2], 0.02, [4.2, top + 1.35, zE - 0.12])
  for (const [j, c] of ['#27c24a', '#e5b114', '#d22a1f'].entries()) k.cyl(paint(c, { emissive: c, emissiveIntensity: 0.6 }), 0.025, 0.02, [4.08 + j * 0.12, top + 1.52, zE - 0.015], 'z', 14)
  k.spline('cable', [[4.1, top + 1.12, zE - 0.06], [4.1, top + 0.7, zE + 0.02], [4.25, top + 0.45, zE + 0.03], [4.38, top + 0.8, zE + 0.0], [4.42, top + 1.12, zE - 0.03]], 0.008, 6, 30)
  k.cyl('plasticGrey', 0.03, 0.1, [4.42, top + 1.18, zE - 0.03], 'y', 12)
  k.cyl('safetyGreen', 0.12, 0.08, [4.2, top + 0.75, zE - 0.06], 'z', 20)
  k.box('copper', [0.04, 0.06, 0.03], [4.38, top + 0.55, zE - 0.02])
  pedestal(5.5, 1.1)
  k.rbox('safetyYellow', [0.14, 0.18, 0.1], 0.015, [5.5, top + 1.2, zE - 0.2])
  k.cyl('actuatorRed', 0.04, 0.04, [5.5, top + 1.22, zE - 0.13], 'z', 16)
  // island earth bar
  k.box('copper', [0.5, 0.05, 0.008], [X0 + 1.6, top + 0.3, zE - 0.004])
  for (let j = 0; j < 5; j++) k.hex('nut', 0.018, 0.01, [X0 + 1.4 + j * 0.1, top + 0.3, zE + 0.004], 'z')
  if (p.tag) tagPlate(k, `${p.tag}-B${i + 1}`, [X0 + 2.4, top + 0.18, zE + 0.002], 'z', 0.18)
}

function stairRun(rise: number) {
  const n = Math.max(1, Math.round(rise / 0.18))
  const going = rise / n / Math.tan((38 * Math.PI) / 180)
  return (n - 1) * going
}

/** API RP 1004 bottom-loading arm parked along the island: base swivel, two arms, API coupler. */
function bottomArm(k: Kit, nps: number, base: V3, zE: number, band: THREE.Material, side: 1 | -1, vapour = false) {
  const od = pipeOD(nps)
  const mat = vapour ? 'equipmentPaint' : 'aluminium'
  const [x, y0, z0] = base
  const y1 = y0 + 0.3
  const yb = y1 + 0.55
  pipe(k, [x, y0, z0], [x, y1, z0], nps)
  swivel(k, [x, y1, z0], [x, y1 + 0.25, z0], od)
  const ze = zE + 0.15
  pipeRun(k, [[x, y1 + 0.25, z0], [x, yb, z0], [x, yb, ze]], nps, { mat })
  swivel(k, [x, yb, ze], [x, yb, ze + 0.25], od)
  const Li = 1.9
  const elbow: V3 = [x + side * Li, yb, ze + 0.6]
  pipeRun(k, [[x, yb, ze + 0.25], [x, yb, ze + 0.45], elbow], nps, { mat })
  swivel(k, elbow, [elbow[0], elbow[1] - 0.25, elbow[2]], od)
  const back: V3 = [elbow[0] - side * 1.6, elbow[1] - 0.45, elbow[2] + 0.2]
  pipeRun(k, [[elbow[0], elbow[1] - 0.25, elbow[2]], [elbow[0], elbow[1] - 0.45, elbow[2]], back], nps, { mat })
  // API coupler with operating handle, parked on its hook
  k.cyl('aluminium', od * 0.85, 0.22, [back[0] - side * 0.11, back[1], back[2]], 'x', 24)
  k.torus('aluminium', od * 0.95, 0.02, [back[0] - side * 0.2, back[1], back[2]], 'x', 8, 24)
  k.rod('handwheel', [back[0] - side * 0.1, back[1], back[2] + od], [back[0] - side * 0.1, back[1] + 0.25, back[2] + od + 0.12], 0.016, 8)
  k.torus(band, od / 2 + 0.006, 0.014, [elbow[0] - side * 0.4, elbow[1], elbow[2]], 'x', 6, 20)
  // balance spring cylinder and parking hook post
  k.rod('actuatorYellow', [x, y1 + 0.1, z0 + 0.1], [x + side * 0.7, yb - 0.04, ze + 0.5], 0.035, 10)
  const hx = back[0] - side * 0.35
  k.box('galvanised', [0.06, back[1] - od / 2 - 0.2, 0.06], [hx, 0.2 + (back[1] - od / 2 - 0.2) / 2, zE - 0.06])
  k.box('galvanised', [0.06, 0.06, back[2] - zE + 0.06], [hx, back[1] - od / 2 - 0.03, (back[2] + zE - 0.06) / 2])
}
