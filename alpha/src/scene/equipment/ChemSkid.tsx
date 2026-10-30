/**
 * Chemical injection package: bunded skid, N vertical stainless storage tanks (manway, vent with
 * flame arrestor, fill line, magnetic level gauge, calibration pot), a row of diaphragm metering
 * pumps (duty / standby per chemical), small-bore suction & discharge tubing, pulsation dampeners,
 * PSVs, gauges, a discharge manifold and a sunshade roof.
 *
 * Local frame: origin = skid centre at deck level. Tanks occupy the -Z half, pumps the +Z half.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { ChemSkid } from '../../model/types'
import { NozzleNeck } from '../common/NozzleNeck'
import { paint } from '../../three/materials'
import { Kit, eul, mat4, type MatKey, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { ribbedPanel } from './machinery/cladding'
import { routeToNozzle, smallGauge, tagPlate, tefcMotor } from './machinery/parts'
import { dirToLocal, toLocal } from '../../model/geom'
import { pipeOD } from '../../model/catalog'
import { dialMaterial, levelFlagMaterial, signMaterial } from './machinery/textures'

const SKID: MatKey = 'equipmentPaintDark'
const SS: MatKey = 'stainless'
/** brushed 316 tank shell (lighter than polished stainless so it reads under the sky light) */
const TANK: MatKey = paint('#c4c9cd', 'detail', { metalness: 0.55, roughness: 0.38 })
const CHEMS = ['DEMULSIFIER', 'SCALE INHIBITOR', 'CORROSION INH.', 'BIOCIDE', 'ANTIFOAM', 'METHANOL']

export function buildChemSkid(eq: ChemSkid) {
  const k = new Kit()
  const [L, W] = eq.skid
  const N = Math.max(1, eq.tanks)
  const hs = 0.2
  // ---------------------------------------------------------------- skid + bund
  for (const s of [-1, 1]) {
    k.box(SKID, [L, hs, 0.1], [0, hs / 2, s * (W / 2 - 0.05)])
    k.box(SKID, [0.1, hs, W], [s * (L / 2 - 0.05), hs / 2, 0])
  }
  k.box(SKID, [L - 0.2, hs * 0.8, 0.1], [0, hs * 0.4, 0])
  k.box('deckPlate', [L, 0.01, W], [0, hs - 0.005, 0])
  const bund = 0.25
  for (const s of [-1, 1]) {
    k.box(SKID, [L, bund, 0.008], [0, hs + bund / 2, s * (W / 2 - 0.004)])
    k.box(SKID, [0.008, bund, W], [s * (L / 2 - 0.004), hs + bund / 2, 0])
    k.box(SKID, [L, 0.008, 0.05], [0, hs + bund, s * (W / 2 - 0.025)])
  }
  // bund drain valve + lifting lugs
  k.cyl(SS, 0.02, 0.15, [L / 2 + 0.05, hs + 0.04, -W / 2 + 0.2], 'x', 10)
  k.box('valveBody', [0.06, 0.06, 0.06], [L / 2 + 0.1, hs + 0.04, -W / 2 + 0.2])
  k.box('actuatorRed', [0.01, 0.01, 0.12], [L / 2 + 0.1, hs + 0.08, -W / 2 + 0.25])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.torus('nut', 0.04, 0.01, [sx * (L / 2 - 0.25), hs + bund + 0.04, sz * (W / 2 - 0.004)], 'z', 6, 16)

  // ---------------------------------------------------------------- tanks
  const pitch = (L - 0.3) / N
  const D = Math.min(pitch * 0.78, W * 0.4)
  const R = D / 2
  const tz = -W / 2 + 0.15 + R
  const legH = 0.35
  const shellH = Math.min(1.7, Math.max(1.0, D * 1.6))
  const y0 = hs + legH
  const tankX: number[] = []
  for (let i = 0; i < N; i++) {
    const x = -L / 2 + 0.15 + pitch * (i + 0.5)
    tankX.push(x)
    k.cyl(TANK, R, shellH, [x, y0 + shellH / 2, tz], 'y', 40)
    k.dome(TANK, R, [x, y0 + shellH, tz], 'y', Math.PI / 2, 0.25, 36)
    k.dome(TANK, R, [x, y0, tz], '-y', Math.PI / 2, 0.2, 36)
    // girth seams
    for (const f of [0.33, 0.66]) k.torus(SS, R, 0.003, [x, y0 + shellH * f, tz], 'y', 4, 40)
    // legs
    for (let j = 0; j < 4; j++) {
      const a = Math.PI / 4 + (j * Math.PI) / 2
      const lx = x + Math.cos(a) * R * 0.85
      const lz = tz + Math.sin(a) * R * 0.85
      k.box(SS, [0.05, legH + 0.1, 0.05], [lx, hs + (legH + 0.1) / 2, lz])
      k.box(SS, [0.12, 0.01, 0.12], [lx, hs + 0.005, lz])
    }
    // manway with bolted cover, vent with flame arrestor, fill line
    const yTop = y0 + shellH + R * 0.25
    k.cyl(TANK, R * 0.32, 0.12, [x - R * 0.2, yTop + 0.02, tz], 'y', 28)
    k.cyl(TANK, R * 0.38, 0.02, [x - R * 0.2, yTop + 0.08, tz], 'y', 28)
    k.cyl(TANK, R * 0.38, 0.02, [x - R * 0.2, yTop + 0.1, tz], 'y', 28)
    k.around(10, R * 0.34, [x - R * 0.2, yTop + 0.112, tz], 'y', (p) => k.hex('nut', 0.022, 0.012, p))
    k.torus(SS, 0.04, 0.008, [x - R * 0.2, yTop + 0.13, tz], 'x', 6, 14, Math.PI)
    const vx = x + R * 0.45
    k.cyl(SS, 0.022, 0.25, [vx, yTop + 0.1, tz], 'y', 12)
    k.cyl('flangeSteel', 0.06, 0.12, [vx, yTop + 0.28, tz], 'y', 18) // flame arrestor
    k.tube(SS, [[vx, yTop + 0.34, tz], [vx, yTop + 0.45, tz], [vx + 0.15, yTop + 0.45, tz], [vx + 0.15, yTop + 0.36, tz]], 0.022)
    k.cyl('brass', 0.045, 0.04, [vx + 0.15, yTop + 0.34, tz], 'y', 14)
    // fill line down the side with camlock and ball valve
    k.tube(SS, [[x + R * 0.1, yTop, tz - R * 0.3], [x + R * 0.1, yTop + 0.12, tz - R * 0.3], [x + R * 0.1, yTop + 0.12, tz - R - 0.08], [x + R * 0.1, hs + 0.9, tz - R - 0.08]], 0.017)
    k.box('valveBody', [0.05, 0.06, 0.05], [x + R * 0.1, hs + 1.0, tz - R - 0.08])
    k.box('actuatorRed', [0.12, 0.01, 0.01], [x + R * 0.1 + 0.05, hs + 1.03, tz - R - 0.08])
    k.cyl('brass', 0.03, 0.06, [x + R * 0.1, hs + 0.86, tz - R - 0.08], 'y', 12)
    // magnetic level gauge on the +Z (front) face of the tank
    const gz = tz + R + 0.07
    const g0 = y0 + 0.08
    const g1 = y0 + shellH - 0.08
    k.cyl(SS, 0.024, g1 - g0 + 0.16, [x - R * 0.35, (g0 + g1) / 2, gz], 'y', 16)
    for (const yy of [g0, g1]) k.rod(SS, [x - R * 0.35, yy, gz], [x - R * 0.35, yy, tz + R * 0.9], 0.012, 8)
    const flagQ = new THREE.Quaternion() // plane faces +Z, texture-up = +Y
    k.box(SS, [0.04, g1 - g0, 0.02], [x - R * 0.35 + 0.05, (g0 + g1) / 2, gz])
    k.add(levelFlagMaterial(0.4 + 0.15 * (i % 3)), new THREE.PlaneGeometry(0.026, g1 - g0 - 0.02), mat4([x - R * 0.35 + 0.05, (g0 + g1) / 2, gz + 0.0105], flagQ))
    // chemical ID sign
    k.plane(signMaterial('ler', CHEMS[i % CHEMS.length]), R * 1.0, R * 0.32, [x + R * 0.3, y0 + shellH * 0.62, tz + Math.sqrt(R * R - (R * 0.3) ** 2) + 0.004])
    // bottom outlet + isolation valve
    k.tube(SS, [[x, y0 - R * 0.15, tz], [x, hs + 0.2, tz], [x, hs + 0.2, tz + R + 0.15]], 0.017)
    k.box('valveBody', [0.06, 0.06, 0.06], [x, hs + 0.2, tz + R * 0.6])
    k.box('actuatorRed', [0.01, 0.01, 0.12], [x, hs + 0.24, tz + R * 0.6 + 0.05])
    // calibration pot (graduated glass column) beside the tank
    const cx = x + R * 0.7
    const cz = tz + R + 0.15
    k.cyl('glass', 0.035, 0.5, [cx, hs + 0.6, cz], 'y', 16)
    k.cyl(SS, 0.04, 0.02, [cx, hs + 0.35, cz], 'y', 16)
    k.cyl(SS, 0.04, 0.02, [cx, hs + 0.85, cz], 'y', 16)
    k.rod(SS, [cx + 0.05, hs + 0.3, cz], [cx + 0.05, hs + 0.9, cz], 0.006, 6)
    k.tube(SS, [[cx, hs + 0.35, cz], [cx, hs + 0.2, cz], [x, hs + 0.2, cz]], 0.008)
  }

  // ---------------------------------------------------------------- metering pumps
  const perTank = (L - 0.4) / (2 * N) >= 0.38 ? 2 : 1
  const nP = N * perTank
  const pp = (L - 0.4) / nP
  const pz = W / 2 - 0.42
  const yb = hs + 0.12
  const headerY = hs + 1.25
  const headerZ = W / 2 - 0.12
  for (let i = 0; i < nP; i++) {
    const px = -L / 2 + 0.2 + pp * (i + 0.5)
    const tank = Math.floor(i / perTank)
    k.box(SKID, [0.3, 0.12, 0.5], [px, hs + 0.06, pz])
    // pump frame: local +X = shaft; rotate so shaft points -Z (motor at +Z front, head at -Z back)
    k.at([px, yb, pz], eul(0, Math.PI / 2, 0), () => {
      // gear housing
      k.rbox('actuatorBlue', [0.18, 0.24, 0.17], 0.02, [0, 0.12, 0])
      // stroke-length adjustment knob + scale
      k.cyl('actuatorBlue', 0.03, 0.06, [0, 0.27, 0], 'y', 16)
      k.handwheel('handwheel', 0.09, [0, 0.31, 0], 'y', 3)
      // motor at -X (front)
      k.at([-0.09, 0.11, 0], undefined, () => tefcMotor(k, { R: 0.065, L: 0.24, H: 0.11, tbox: 'top', fins: 18 }))
      // liquid end at +X: diaphragm head with bolting, suction & discharge check valves
      k.cyl(SS, 0.075, 0.05, [0.115, 0.12, 0], 'x', 24)
      k.cyl(SS, 0.06, 0.04, [0.16, 0.12, 0], 'x', 24)
      k.boltCircle('nut', 'nut', 8, 0.065, [0.09, 0.12, 0], 'x', 0.008, 0.09, [0.085])
      k.hex(SS, 0.04, 0.05, [0.16, 0.04, 0], 'y')
      k.hex(SS, 0.04, 0.05, [0.16, 0.2, 0], 'y')
    })
    // world positions of check valves (local +X -> world -Z)
    const headZ = pz - 0.16
    // suction from tank outlet
    const tx = tankX[tank]
    k.tube(SS, [[tx, hs + 0.2, tz + R + 0.15], [tx, hs + 0.2, tz + R + 0.25], [px, hs + 0.2, tz + R + 0.25], [px, hs + 0.2, headZ - 0.08], [px, yb + 0.015, headZ - 0.08], [px, yb + 0.015, headZ]], 0.009)
    // discharge: up through dampener tee, PSV, gauge, to the discharge header
    const dTop = yb + 0.25
    k.tube(SS, [[px, dTop - 0.02, headZ], [px, dTop + 0.15, headZ], [px, dTop + 0.15, headZ + 0.1], [px, headerY, headZ + 0.1], [px, headerY, headerZ]], 0.008)
    k.sphere(SS, 0.06, [px + 0.09, dTop + 0.3, headZ + 0.1], undefined, 16) // pulsation dampener
    k.rod(SS, [px, dTop + 0.3, headZ + 0.1], [px + 0.09, dTop + 0.3, headZ + 0.1], 0.008, 6)
    k.cyl('actuatorRed', 0.018, 0.1, [px - 0.07, dTop + 0.45, headZ + 0.1], 'y', 10) // PSV
    k.rod(SS, [px, dTop + 0.45, headZ + 0.1], [px - 0.07, dTop + 0.45, headZ + 0.1], 0.007, 6)
    smallGauge(k, [px, dTop + 0.62, headZ + 0.16], 'z', dialMaterial('bar', 160), 0.07)
    k.rod(SS, [px, dTop + 0.62, headZ + 0.1], [px, dTop + 0.62, headZ + 0.145], 0.006, 6)
    // needle isolation on the drop to header
    k.box(SS, [0.035, 0.05, 0.035], [px, headerY - 0.2, headZ + 0.1])
    k.cyl('handwheel', 0.006, 0.07, [px, headerY - 0.2, headZ + 0.14], 'z', 6)
  }
  // discharge header + supports + outlet stubs
  k.rod(SS, [-L / 2 + 0.15, headerY, headerZ], [L / 2 - 0.1, headerY, headerZ], 0.017, 12)
  for (const x of [-L / 2 + 0.25, 0, L / 2 - 0.25]) {
    k.box('structSteel', [0.05, headerY - hs, 0.05], [x, (headerY + hs) / 2, headerZ + 0.05])
    k.torus('boltXylan', 0.022, 0.004, [x, headerY, headerZ], 'x', 6, 12, Math.PI)
  }
  // header -> each skid outlet nozzle (base in local coordinates)
  for (const n of eq.nozzles) {
    const b = toLocal(eq, n.base)
    const d = dirToLocal(eq, n.dir)
    k.tube(SS, routeToNozzle([L / 2 - 0.1, headerY, headerZ], b, d), pipeOD(n.nps) / 2, 12, pipeOD(n.nps) * 1.5)
  }
  // local control panel
  const cpx = -L / 2 + 0.25
  k.rbox(SS, [0.35, 0.45, 0.2], 0.015, [cpx, hs + 1.55, headerZ - 0.05])
  k.box('structSteel', [0.05, 1.4, 0.05], [cpx, hs + 0.7, headerZ - 0.12])
  k.box('displayLcd', [0.16, 0.08, 0.004], [cpx, hs + 1.62, headerZ + 0.052])
  for (const [i, c] of (['safetyGreen', 'actuatorRed', 'actuatorYellow'] as MatKey[]).entries()) k.cyl(c, 0.014, 0.02, [cpx - 0.07 + i * 0.07, hs + 1.45, headerZ + 0.06], 'z', 12)

  // ---------------------------------------------------------------- sunshade roof
  const roofH = Math.max(2.6, y0 + shellH + R * 0.25 + 0.75)
  const posts: V3[] = [
    [-L / 2 + 0.06, 0, -W / 2 + 0.06],
    [L / 2 - 0.06, 0, -W / 2 + 0.06],
    [-L / 2 + 0.06, 0, W / 2 - 0.06],
    [L / 2 - 0.06, 0, W / 2 - 0.06],
  ]
  for (const p of posts) {
    const h = roofH + (p[2] < 0 ? 0.15 : 0)
    k.box('structSteel', [0.1, h - hs, 0.1], [p[0], (h + hs) / 2, p[2]])
    k.box('structSteel', [0.04, 0.4, 0.04], [p[0], h - 0.35, p[2] + (p[2] < 0 ? 0.15 : -0.15)], eul(p[2] < 0 ? -0.6 : 0.6, 0, 0))
  }
  // eaves beams + purlins
  const slope = Math.atan2(0.15, W)
  for (const s of [-1, 1]) {
    const h = roofH + (s < 0 ? 0.15 : 0)
    k.box('structSteel', [L, 0.12, 0.08], [0, h + 0.06, s * (W / 2 - 0.06)])
  }
  for (const x of [-L / 2 + 0.06, 0, L / 2 - 0.06]) k.box('structSteel', [0.08, 0.1, W], [x, roofH + 0.075 + 0.12, 0], eul(-slope, 0, 0))
  // profiled roof sheet (ribs run down the slope, along Z), overhanging 0.25 m
  const sheet = ribbedPanel(L + 0.5, W + 0.5, 0.2, 0.03)
  // panel spans x (width) and y (height): map panel y -> world -Z (down-slope towards +Z), normal +Z -> +Y
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -Math.sin(slope), 1).normalize(), new THREE.Vector3(0, 1, Math.sin(slope)).normalize())
  m.setPosition(0, roofH + 0.15 + 0.12 + 0.012 + 0.25 * Math.sin(slope), -W / 2 - 0.25)
  k.add('moduleCladding', sheet, m)
  // roof edge gutter
  k.box('moduleCladding', [L + 0.5, 0.06, 0.08], [0, roofH + 0.24, W / 2 + 0.25])
  tagPlate(k, eq.tag, [0, hs + bund * 0.5, W / 2 + 0.002], 'z', 0.3)
  return k.build()
}

export function ChemSkidModel({ eq }: { eq: ChemSkid }) {
  const built = useMemo(() => buildChemSkid(eq), [eq])
  return (
    <group>
      <KitMesh data={built} />
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} />
      ))}
    </group>
  )
}
