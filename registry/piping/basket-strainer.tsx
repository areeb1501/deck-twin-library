// Fabricated basket strainer: ASME VIII shell about twice the line size, B16.5 body flange with swing-bolt quick-opening cover and davit, perforated basket, legs, drain, vent and dP gauge.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, liftingLug, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { meshGuardMaterial } from '../lib/textures'
import { NPS_SIZES, flange as flangeDims, inch, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { boreOf, buttWeld, flangeLength, holedShell, nozzleSkin, portFlange, ringSheet, smallBallValve } from './_piping'

export interface BasketStrainerProps {
  /** line size, inches */
  nps?: number
  rating?: Rating
  /** basket perforation / mesh, shown on the nameplate */
  mesh?: number
  davit?: boolean
  tag?: string
  paint?: MatKey
}

export const defaults = { nps: 6, rating: 150 as Rating, mesh: 20, davit: true, tag: 'STR-101', paint: 'equipmentPaint' as MatKey }

// typical: fabricated-strainer GA dimensions by line size (inches): face-to-face, nozzle CL to top, nozzle CL to bottom of head
const FF: [number, number][] = [[2, 18], [4, 23], [6, 26.5], [8, 30], [12, 37], [16, 44], [24, 58]]
const TOP: [number, number][] = [[2, 8], [4, 10], [6, 12], [8, 14], [12, 18], [16, 24], [24, 34]]
const BOT: [number, number][] = [[2, 11], [4, 14], [6, 17.5], [8, 21], [12, 28], [16, 36], [24, 50]]
const lerp = (t: [number, number][], x: number) => {
  if (x <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (x - t[i - 1][0])) / (t[i][0] - t[i - 1][0])
  return t[t.length - 1][1] * (x / t[t.length - 1][0])
}

function dims(nps: number, rating: Rating) {
  const body = NPS_SIZES.find((s) => s >= 1.9 * nps) ?? 48
  const R = pipeOD(body) / 2
  const ri = R - pipeWall(body, 'STD')
  const f = flangeDims(body, rating)
  const fl = flangeLength(nps, rating)
  const L = Math.max(inch(lerp(FF, nps)), 2 * (R + fl + 0.08))
  const tc = f.thickness * 1.1
  const yTop = inch(lerp(TOP, nps))
  const yT = Math.max(yTop - f.thickness - tc - 0.003, pipeOD(nps) / 2 + 0.08)
  const hd = R / 2
  const yB = Math.min(-inch(lerp(BOT, nps)) + hd, -pipeOD(nps) / 2 - 0.1)
  const yF = yB - hd - 0.32
  return { body, R, ri, f, fl, L, tc, yT, yB, hd, yF }
}

export function ports(p: BasketStrainerProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const { L } = dims(nps, rating)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function BasketStrainer({ nps = defaults.nps, rating = defaults.rating, mesh = defaults.mesh, davit = defaults.davit, tag = defaults.tag, paint = defaults.paint, ...group }: BasketStrainerProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, mesh, davit, tag, paint), [nps, rating, mesh, davit, tag, paint])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default BasketStrainer

// shell frame: local x = world up, local +y = world +X (outlet), local z = world -Z
const SHELL = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1))

function build(k: Kit, nps: number, rating: Rating, mesh: number, davit: boolean, tag: string, mat: MatKey) {
  const { R, ri, f, fl, L, tc, yT, yB, hd, yF } = dims(nps, rating)
  const rn = pipeOD(nps) / 2
  const rb = boreOf(nps, '40')
  const yw = L / 2 - fl
  const hole = { A: rn, B: rn }
  const holeI = { A: rb, B: rb }

  k.with(SHELL, () => {
    const th = holedShell(k, mat, R, yB, yT, hole, hole, true)
    const thI = holedShell(k, 'pipeBore', ri, yB, yT, holeI, holeI, false)
    for (const s of [1, -1] as const) {
      nozzleSkin(k, mat, R, rn, s, yw, true)
      nozzleSkin(k, 'pipeBore', ri, rb, s, yw, false)
    }
    // 2:1 ellipsoidal bottom head, sampled on the shell's own row angles so the seam closes
    const head = (r: number) =>
      Array.from({ length: 13 }, (_, i) => {
        const a = (i / 12) * (Math.PI / 2)
        return { c: [yB - (r / 2) * Math.sin(a), 0, 0] as V3, e1: [0, 1, 0] as V3, e2: [0, 0, 1] as V3, r: Math.max(r * Math.cos(a), 1e-4) }
      })
    ringSheet(k, mat, head(R), th, 'computed', [-1, 0, 0])
    ringSheet(k, 'pipeBore', head(ri), thI, 'computed')
  })
  for (const s of [-1, 1]) {
    portFlange(k, nps, rating, [(s * L) / 2, 0, 0], [s, 0, 0], { bore: rb })
    buttWeld(k, nps, [s * yw, 0, 0], [1, 0, 0])
  }
  k.torus(mat, R + 0.002, 0.005, [0, yB, 0], 'y', 6, 48)

  // body flange (slip-on ring), gasket and cover
  const seg = 64
  k.lathe(mat, [[ri, yT], [f.od / 2, yT], [f.od / 2, yT + f.thickness], [ri, yT + f.thickness], [ri, yT]], [0, 0, 0], 'y', seg)
  k.torus(mat, R + 0.003, 0.006, [0, yT, 0], 'y', 6, 48)
  const yg = yT + f.thickness
  k.lathe('gasket', [[ri, 0], [f.raisedFace / 2, 0], [f.raisedFace / 2, 0.003], [ri, 0.003], [ri, 0]], [0, yg, 0], 'y', 40)
  const yc = yg + 0.003
  k.cyl(mat, f.od / 2, tc, [0, yc + tc / 2, 0], 'y', seg)
  const yCov = yc + tc

  // swing eye bolts: hinged on lugs under the body flange, through slotted cover ears, T-handle nuts on top
  const nb = R > 0.2 ? 8 : 6
  const bd = Math.min(f.boltDia, 0.03)
  const rbc = f.boltCircle / 2
  for (let i = 0; i < nb; i++) {
    const a = ((i + 0.5) / nb) * Math.PI * 2
    const [cx, cz] = [Math.cos(a), Math.sin(a)]
    const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
    for (const o of [-1, 1]) k.box(mat, [0.05, 0.05, 0.008], [cx * rbc - cz * o * bd, yT - 0.025, cz * rbc + cx * o * bd], tq)
    k.rod('galvanised', [cx * rbc, yT - 0.035, cz * rbc], [cx * rbc, yCov + bd * 2.2, cz * rbc], bd / 2, 8)
    k.torus('galvanised', bd * 0.9, bd * 0.3, [cx * rbc, yT - 0.035, cz * rbc], [cz, 0, -cx], 6, 12)
    k.hex('nut', bd * 1.8, bd, [cx * rbc, yCov + bd * 0.5, cz * rbc])
    k.rod('handwheel', [cx * rbc - cz * bd * 2.2, yCov + bd * 1.4, cz * rbc + cx * bd * 2.2], [cx * rbc + cz * bd * 2.2, yCov + bd * 1.4, cz * rbc - cx * bd * 2.2], bd * 0.28, 6)
  }
  liftingLug(k, [0, yCov, 0], 'x', Math.max(0.5, R * 2.2), mat)
  // cover vent valve
  const vx = f.od * 0.25
  k.cyl(mat, 0.02, 0.03, [vx, yCov + 0.015, 0], 'y', 16)
  smallBallValve(k, 0.75, [vx, yCov + 0.07, 0], [0, 1, 0], [0, 0, 1])

  // perforated basket with a top ring and bail handle, seen through the nozzles
  const rB = ri * 0.82
  const yb0 = yB + 0.04
  const yb1 = yT + f.thickness - 0.004
  const g = new THREE.CylinderGeometry(rB, rB, yb1 - yb0, 48, 1, true)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.round(rB * 60), uv.getY(i) * Math.round((yb1 - yb0) * 30))
  const perf = meshGuardMaterial('#b9bec2')
  perf.side = THREE.DoubleSide
  k.add(perf, g, new THREE.Matrix4().makeTranslation(0, (yb0 + yb1) / 2, 0))
  k.cyl('stainless', rB, 0.004, [0, yb0, 0], 'y', 48)
  k.torus('stainless', rB + 0.004, 0.006, [0, yb1 - 0.006, 0], 'y', 6, 48)
  k.torus('stainless', rB * 0.6, 0.005, [0, yb1, 0], 'x', 6, 24, Math.PI)

  // bottom drain with valve and plug
  const yd = yB - hd
  k.cyl(mat, pipeOD(1.5) / 2, 0.08, [0, yd - 0.035, 0], 'y', 20)
  smallBallValve(k, 1.5, [0, yd - 0.15, 0], [0, -1, 0], [1, 0, 0])
  k.hex('nut', pipeOD(1.5) * 1.1, 0.025, [0, yd - 0.23, 0])

  // three legs at 120° clear of the nozzles, with base plates and anchors
  for (const a of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) {
    const [cx, cz] = [Math.cos(a), Math.sin(a)]
    const r0 = R + 0.03
    const r1 = R + 0.12
    const top: V3 = [cx * r0, yB + 0.25, cz * r0]
    const bot: V3 = [cx * r1, yF + 0.02, cz * r1]
    k.box(mat, [0.12, 0.28, 0.01], [cx * (R + 0.004), yB + 0.15, cz * (R + 0.004)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2))
    k.rod(mat, top, bot, 0.03, 12)
    k.box(mat, [0.16, 0.016, 0.16], [bot[0], yF + 0.008, bot[2]])
    for (const o of [-1, 1]) {
      k.cyl('nut', 0.008, 0.04, [bot[0] + o * 0.05, yF + 0.02, bot[2]], 'y', 8)
      k.hex('nut', 0.024, 0.012, [bot[0] + o * 0.05, yF + 0.022, bot[2]])
    }
  }

  // differential-pressure gauge on a bracket, impulse tubing from both nozzles
  const gz = R + 0.16
  const gy = yT - 0.08
  for (const s of [-1, 1]) {
    const x = s * (R + 0.06)
    k.cyl(mat, 0.012, 0.03, [x, rn + 0.012, 0], 'y', 10)
    k.tube('tubing', [[x, rn + 0.025, 0], [x, gy - 0.04, 0], [x, gy - 0.04, gz - 0.05], [s * 0.04, gy - 0.04, gz - 0.05], [s * 0.04, gy - 0.02, gz - 0.05]], 0.005, 8, 0.03)
  }
  k.box('stainless', [0.16, 0.04, 0.006], [0, gy - 0.02, gz - 0.06])
  k.rod('stainless', [0, gy - 0.02, gz - 0.06], [0, gy - 0.02, R], 0.008, 8)
  gauge(k, [0, gy + 0.04, gz], 'z', 0.1, 'bar', 4)
  tagPlate(k, `${tag}  ${mesh} MESH`, [0, yB + 0.18, R + 0.002], 'z', Math.max(0.12, R * 0.6))
  k.box(mat, [0.03, 0.02, 0.012], [0, yB + 0.06, R + 0.004])

  if (davit) {
    // davit post in two sleeve brackets on the back of the shell, arm over the cover, T-handle lifting screw to the cover lug
    const pz = -(R + 0.09)
    const pr = pipeOD(2) / 2
    const yArm = yCov + 0.32
    k.tube(mat, [[0, yT - 0.55, pz], [0, yArm, pz], [0, yArm, 0]], pr, 16, 0.12)
    for (const y of [yT - 0.45, yT - 0.12]) {
      k.cyl(mat, pr + 0.01, 0.07, [0, y, pz], 'y', 16)
      k.box(mat, [0.012, 0.06, 0.09], [0, y, -(R + 0.035)])
    }
    k.cyl('galvanised', 0.012, 0.3, [0, yArm - 0.1, 0], 'y', 10)
    k.rod('handwheel', [-0.08, yArm + pr + 0.03, 0], [0.08, yArm + pr + 0.03, 0], 0.008, 8)
    k.torus('galvanised', 0.025, 0.006, [0, yCov + 0.07, 0], 'z', 6, 16)
  }
}
