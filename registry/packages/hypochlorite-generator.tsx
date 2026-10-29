// Seawater electrochlorination (hypochlorite generator) package: auto-backwash strainer, electrolyser cell stack, transformer-rectifier, degassing tank with H2 dilution blowers, dosing pumps. NORSOK / ISO 15589-2 style, ASME B16.5.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { gauge, member, motor, motorSize, pipeRun, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, cowlFan, type RotorSpec } from '../lib/rotors'
import { SECTIONS, flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { louvreMaterial, textMaterial } from '../lib/textures'
import { addv, blFlange, cableTray, earthBoss, localPanel, padeyeShackles, pipeSupport, shellLabel, smallValve, spoolJoint, transmitter, valve, valveSpan } from './_skid'

export interface HypochloriteGeneratorProps {
  /** electrolyser cells in series */
  cells?: number
  /** degassing tank diameter, m */
  tankDiameter?: number
  /** degassing tank height, m */
  tankHeight?: number
  seawaterNps?: number
  hypoNps?: number
  tag?: string
  running?: boolean
}

export const defaults = {
  cells: 4,
  tankDiameter: 1.2,
  tankHeight: 1.8,
  seawaterNps: 3,
  hypoNps: 2,
  tag: 'X-6500',
  running: true,
}

type P = typeof defaults

const SKID = 'HEB 160'
const R150: Rating = 150
const GRP: MatKey = paint('#cdbf8e', { metalness: 0.05, roughness: 0.6, clearcoat: 0 })
const CELL: MatKey = paint('#8d9399', { metalness: 0.7, roughness: 0.35, clearcoat: 0 })
const PVC: MatKey = paint('#6f747a', { metalness: 0.05, roughness: 0.5, clearcoat: 0 })

function layout(p: P) {
  const Nc = Math.max(2, Math.min(8, Math.round(p.cells)))
  const Rt = p.tankDiameter / 2
  const L = 4.6 + 2 * Rt + 0.4
  const W = Math.max(2.6, 2 * Rt + 1.6)
  const a = -L / 2
  const y0 = SECTIONS[SKID].d + 0.008
  const cp = 0.3 // cell pitch (vertical)
  return { Nc, Rt, L, W, a, y0, cp, xS: a + 0.9, xM: a + 1.55, xc: a + 2.85, Lc: 1.3, zc: -W / 2 + 0.55, yc0: y0 + 0.45, xT: a + 4.25 + Rt, zT: -W / 2 + 0.35 + Rt, ySw: y0 + 0.6, yHy: y0 + 0.75, zHy: W / 2 - 0.45, yVent: y0 + p.tankHeight + 1.55 }
}

export function ports(props: HypochloriteGeneratorProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [
    port('seawater-in', 'Seawater in', [-g.L / 2, g.ySw, g.zc], [-1, 0, 0], p.seawaterNps, R150),
    port('hypo-out', 'Hypochlorite out', [g.L / 2, g.yHy, g.zHy], [1, 0, 0], p.hypoNps, R150),
    port('vent', 'H2 / air vent', [g.xT, g.yVent, g.zT], [0, 1, 0], 4, R150, 'vent'),
  ]
}

export function HypochloriteGenerator(props: HypochloriteGeneratorProps & GroupProps) {
  const { cells, tankDiameter, tankHeight, seawaterNps, hypoNps, tag, running, ...group } = { ...defaults, ...props }
  const p = { cells, tankDiameter, tankHeight, seawaterNps, hypoNps, tag, running }
  const { built, rotors } = useMemo(() => build(p), [cells, tankDiameter, tankHeight, seawaterNps, hypoNps, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default HypochloriteGenerator

function build(p: P) {
  const k = new Kit()
  const g = layout(p)
  const { L, W, y0, a, zc, xc, Lc, Rt, xT, zT } = g
  const sn = p.seawaterNps
  const sod = pipeOD(sn)
  const rotors: RotorSpec[] = []
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)
  tagPlate(k, p.tag, [a + 0.8, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.3)
  earthBoss(k, [-a - 0.4, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])

  // seawater inlet: BL → ball valve → auto-backwash strainer → mag flowmeter (low-flow trip) → cells
  const iw = blFlange(k, [-L / 2, g.ySw, zc], [-1, 0, 0], sn, R150)
  const Sv = valveSpan('ball', sn, R150)
  const xv = a + 0.25 + Sv / 2
  pipeRun(k, [iw, [xv - Sv / 2, g.ySw, zc]], sn)
  valve(k, 'ball', [xv, g.ySw, zc], [1, 0, 0], sn, R150)
  const fj = flangeDims(sn, R150).hubLength + flangeDims(sn, R150).raisedFaceHeight + 0.00225
  const xs0 = g.xS - 0.22
  const xs1 = g.xS + 0.22
  pipeRun(k, [[xv + Sv / 2, g.ySw, zc], [xs0 - fj, g.ySw, zc]], sn)
  for (const x of [xs0, xs1]) spoolJoint(k, [x, g.ySw, zc], [1, 0, 0], sn, R150)
  k.cyl(PVC, 0.17, 0.75, [g.xS, g.ySw + 0.12, zc], 'y', 28)
  k.dome(PVC, 0.17, [g.xS, g.ySw - 0.255, zc], '-y', Math.PI / 2, 0.5, 28)
  k.cyl(PVC, 0.2, 0.05, [g.xS, g.ySw + 0.52, zc], 'y', 28)
  k.around(10, 0.185, [g.xS, g.ySw + 0.55, zc], 'y', (q) => k.hex('nut', 0.022, 0.014, q))
  for (const s of [-1, 1]) k.pipe(PVC, [g.xS + s * 0.15, g.ySw, zc], [g.xS + s * (0.22 - fj), g.ySw, zc], sod, 0.006)
  const ms = motorSize(0.37, 4)
  k.cyl('actuatorBlue', 0.06, 0.12, [g.xS, g.ySw + 0.61, zc], 'y', 16) // backwash drive gearbox
  k.cyl('motorPaint', ms.R, ms.L * 0.8, [g.xS, g.ySw + 0.67 + ms.L * 0.4, zc], 'y', 22)
  k.tube('pipePaint', [[g.xS, g.ySw - 0.33, zc], [g.xS, y0 + 0.12, zc], [g.xS, y0 + 0.12, zc + 0.35]], 0.024, 10, 0.05) // backwash drain
  k.rbox('valveBody', [0.1, 0.09, 0.09], 0.01, [g.xS, y0 + 0.12, zc + 0.2])
  k.rbox('actuatorYellow', [0.12, 0.1, 0.1], 0.01, [g.xS, y0 + 0.23, zc + 0.2])
  for (const s of [-1, 1]) gauge(k, [g.xS + s * 0.15, g.ySw + 0.2, zc + 0.04], 'z', 0.07, 'bar', 10)
  k.tube('tubing', [[g.xS - 0.15, g.ySw + 0.05, zc], [g.xS - 0.15, g.ySw + 0.16, zc]], 0.004, 6)
  k.tube('tubing', [[g.xS + 0.15, g.ySw + 0.05, zc], [g.xS + 0.15, g.ySw + 0.16, zc]], 0.004, 6)
  // electromagnetic flowmeter between flanges
  const xm0 = g.xM - 0.18
  const xm1 = g.xM + 0.18
  pipeRun(k, [[xs1 + fj, g.ySw, zc], [xm0 - fj, g.ySw, zc]], sn)
  for (const x of [xm0, xm1]) spoolJoint(k, [x, g.ySw, zc], [1, 0, 0], sn, R150)
  k.cyl('actuatorBlue', sod / 2 + 0.05, 0.3, [g.xM, g.ySw, zc], 'x', 28)
  k.rbox('actuatorBlue', [0.14, 0.12, 0.12], 0.02, [g.xM, g.ySw + sod / 2 + 0.12, zc])
  k.disc('glass', 0.04, [g.xM, g.ySw + sod / 2 + 0.12, zc + 0.061], 'z', 18)
  transmitter(k, [g.xM + 0.4, g.ySw + sod / 2, zc], [0, 1, 0], 0.06)

  // ---------------------------------------------------------------- electrolyser cell stack (series, U-bends alternate ends)
  const cx0 = xc - Lc / 2
  const cx1 = xc + Lc / 2
  const rC = 0.085
  const fx = (end: number) => (end ? cx1 + 0.06 : cx0 - 0.06)
  for (let i = 0; i < g.Nc; i++) {
    const y = g.yc0 + i * g.cp
    k.cyl(CELL, rC, Lc - 0.12, [xc, y, zc], 'x', 28)
    for (const s of [-1, 1]) {
      k.cyl('aluminium', rC + 0.04, 0.05, [xc + s * (Lc / 2 - 0.03), y, zc], 'x', 28)
      k.around(8, rC + 0.025, [xc + s * (Lc / 2 - 0.06), y, zc], 'x', (q) => k.hex('nut', 0.022, 0.03, q, 'x'))
      k.box('copper', [0.03, 0.05, 0.16], [xc + s * (Lc / 2 - 0.03), y + rC + 0.03, zc]) // DC terminal
      k.cyl('aluminium', rC * 0.5, 0.06, [xc + s * (Lc / 2 + 0.02), y, zc], 'x', 18)
    }
    k.plane(textMaterial(`CELL ${i + 1}`, '#2a5d8a', '#fff', 256, 48), 0.18, 0.034, [xc, y, zc + rC + 0.002])
    if (i < g.Nc - 1) {
      const end = i % 2 === 0 ? 1 : 0
      const x = fx(end)
      const sgn = end ? 1 : -1
      const pts: V3[] = []
      for (let j = 0; j <= 10; j++) {
        const t = (j / 10) * Math.PI
        pts.push([x + sgn * Math.sin(t) * g.cp * 0.5, y + g.cp * 0.5 - Math.cos(t) * g.cp * 0.5, zc])
      }
      k.tube(PVC, pts, rC * 0.45, 12, 0.02)
    }
  }
  // cell rack and copper busbars to the transformer-rectifier
  const yTop = g.yc0 + (g.Nc - 1) * g.cp + 0.2
  for (const x of [cx0 + 0.15, cx1 - 0.15]) for (const z of [zc - 0.18, zc + 0.18]) {
    member(k, [x, y0, z], [x, yTop, z], 'L50x50x5', 'galvanised', [1, 0, 0])
    k.box('galvanised', [0.1, 0.012, 0.1], [x, y0 + 0.006, z])
  }
  for (let i = 0; i < g.Nc; i++) for (const x of [cx0 + 0.15, cx1 - 0.15]) k.box('rubberBlack', [0.05, 0.04, 0.36], [x, g.yc0 + i * g.cp - rC - 0.02, zc])
  // seawater into the bottom cell (-X end), product out of the top cell
  pipeRun(k, [[xm1 + fj, g.ySw, zc], [cx0 - 0.25, g.ySw, zc], [cx0 - 0.25, g.yc0, zc], [cx0 - 0.04, g.yc0, zc]], sn, { mat: PVC })
  const topEnd = (g.Nc - 1) % 2 === 0 ? 1 : 0
  const yLast = g.yc0 + (g.Nc - 1) * g.cp
  const yIn = y0 + p.tankHeight - 0.25
  const xTin = xT - Rt
  pipeRun(k, [[fx(topEnd) - (topEnd ? 0.02 : -0.02), yLast, zc], [topEnd ? cx1 + 0.2 : cx0 - 0.4, yLast, zc], [topEnd ? cx1 + 0.2 : cx0 - 0.4, yIn, zc], [topEnd ? cx1 + 0.2 : cx0 - 0.4, yIn, zT], [xTin + 0.01, yIn, zT]], sn, { mat: PVC })

  // ---------------------------------------------------------------- transformer-rectifier cabinet (front) with DC cables
  const trx = xc
  const trz = W / 2 - 0.5
  const trW = 1.2
  const trH = 1.9
  const trD = 0.7
  k.box('equipmentPaintDark', [trW + 0.06, 0.1, trD + 0.06], [trx, y0 + 0.05, trz])
  k.rbox('equipmentPaint', [trW, trH, trD], 0.015, [trx, y0 + 0.1 + trH / 2, trz])
  for (const s of [-1, 1]) {
    k.box('equipmentPaintDark', [0.008, trH - 0.1, 0.004], [trx + s * 0.002, y0 + 0.1 + trH / 2, trz + trD / 2 + 0.002])
    const lv = new THREE.PlaneGeometry(trW * 0.35, 0.5)
    const uv = lv.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 8)
    k.add(louvreMaterial('#c9ccc8'), lv, new THREE.Matrix4().makeTranslation(trx + s * trW * 0.25, y0 + 0.45, trz + trD / 2 + 0.003))
    k.box('nut', [0.02, 0.14, 0.03], [trx + s * 0.08, y0 + 1.1, trz + trD / 2 + 0.015])
  }
  k.box('rubberBlack', [0.3, 0.2, 0.01], [trx - trW * 0.25, y0 + 1.5, trz + trD / 2 + 0.005])
  k.plane(textMaterial('DC 450 A', '#1d2b1d', '#7fe08a', 256, 128), 0.26, 0.15, [trx - trW * 0.25, y0 + 1.5, trz + trD / 2 + 0.011])
  for (const [i, c] of (['safetyGreen', 'actuatorRed', 'actuatorYellow'] as MatKey[]).entries()) k.cyl(c, 0.015, 0.02, [trx + trW * 0.12 + i * 0.07, y0 + 1.5, trz + trD / 2 + 0.01], 'z', 12)
  k.plane(textMaterial('TRANSFORMER RECTIFIER', '#f2f2ee', '#111', 512, 64), trW * 0.6, trW * 0.075, [trx, y0 + 1.82, trz + trD / 2 + 0.004])
  k.box('equipmentPaint', [trW * 0.6, 0.16, trD * 0.6], [trx, y0 + 0.1 + trH + 0.08, trz]) // roof fan housing
  for (const s of [-1, 1]) {
    const tx = s > 0 ? cx1 - 0.03 : cx0 + 0.03
    k.spline('cable', [[trx + s * 0.2, y0 + 0.1 + trH, trz - 0.1], [trx + s * 0.25, y0 + trH + 0.45, trz - 0.3], [tx, yTop + 0.3, zc + 0.05], [tx, g.yc0 + rC + 0.05, zc + 0.05]], 0.022, 8, 28)
  }
  for (let i = 0; i < g.Nc - 1; i++) {
    const end = i % 2 === 0 ? 1 : 0
    const x = end ? cx1 - 0.03 : cx0 + 0.03
    k.box('copper', [0.025, g.cp - 0.04, 0.02], [x, g.yc0 + (i + 0.5) * g.cp + rC * 0.4, zc + 0.07]) // inter-cell busbar
  }

  // ---------------------------------------------------------------- degassing tank, H2 dilution blowers, vent stack
  k.cyl('equipmentPaintDark', Rt + 0.05, 0.12, [xT, y0 + 0.06, zT], 'y', 40)
  k.cyl(GRP, Rt, p.tankHeight, [xT, y0 + 0.12 + p.tankHeight / 2, zT], 'y', 40)
  k.cyl(GRP, Rt + 0.02, 0.04, [xT, y0 + 0.12 + p.tankHeight, zT], 'y', 40)
  k.dome(GRP, Rt + 0.02, [xT, y0 + 0.14 + p.tankHeight, zT], 'y', Math.PI / 2, 0.15, 40)
  for (const f of [0.33, 0.66]) k.torus(GRP, Rt + 0.004, 0.012, [xT, y0 + 0.12 + p.tankHeight * f, zT], 'y', 6, 40)
  shellLabel(k, 'HYPOCHLORITE DEGASSING TANK', xT, y0 + 0.12 + p.tankHeight * 0.5, zT, Rt, Rt * 0.12, 1.4, '#f5c400', '#111')
  const yRoof = y0 + 0.14 + p.tankHeight + (Rt + 0.02) * 0.15
  const vf = flangeDims(4, R150)
  const vw = addv([xT, g.yVent, zT], [0, -1, 0], vf.hubLength + vf.raisedFaceHeight)
  k.pipe(GRP, [xT, yRoof - 0.04, zT], vw, pipeOD(4) + 0.01, 0.008)
  k.disc('pipeBore', pipeOD(4) / 2 - 0.004, [xT, yRoof - 0.035, zT], 'y', 20)
  blFlange(k, [xT, g.yVent, zT], [0, 1, 0], 4, R150)
  k.box('galvanised', [0.05, g.yVent - 0.35 - yRoof, 0.05], [xT + 0.1, (g.yVent - 0.35 + yRoof) / 2, zT])
  // level transmitter and gauge, manway
  k.cyl(GRP, 0.06, 0.15, [xT - Rt * 0.5, yRoof, zT + Rt * 0.3], 'y', 16)
  k.cyl('actuatorBlue', 0.055, 0.12, [xT - Rt * 0.5, yRoof + 0.15, zT + Rt * 0.3], 'y', 16)
  k.cyl(GRP, 0.28, 0.08, [xT + Rt * 0.4, yRoof - 0.01, zT - Rt * 0.2], 'y', 28)
  k.around(10, 0.25, [xT + Rt * 0.4, yRoof + 0.035, zT - Rt * 0.2], 'y', (q) => k.hex('nut', 0.022, 0.012, q))
  const lgx = xT + Rt * 0.7
  const lgz = zT + Rt * 0.71 + 0.08
  k.cyl('glass', 0.025, p.tankHeight * 0.75, [lgx, y0 + 0.12 + p.tankHeight * 0.45, lgz], 'y', 14)
  for (const f of [0.1, 0.8]) k.rod(PVC, [lgx, y0 + 0.12 + p.tankHeight * f, lgz], [lgx - 0.05, y0 + 0.12 + p.tankHeight * f, lgz - 0.08], 0.014, 8)
  // twin H2 dilution blowers with ducts into the tank roof space
  const bz = zT + Rt + 0.55
  const mb = motorSize(2.2, 2)
  const Hb = Math.max(mb.H, mb.R * 1.25)
  for (const [i, bx] of [xT - 0.45, xT + 0.45].entries()) {
    k.box('equipmentPaintDark', [0.6, 0.08, 0.4], [bx, y0 + 0.04, bz])
    k.cyl('actuatorYellow', 0.22, 0.14, [bx + 0.15, y0 + 0.08 + 0.26, bz], 'x', 32) // scroll
    k.box('actuatorYellow', [0.14, 0.24, 0.16], [bx + 0.15, y0 + 0.08 + 0.4, bz - 0.12])
    k.disc(louvreMaterial('#666'), 0.1, [bx + 0.225, y0 + 0.34, bz], 'x', 20)
    k.at([bx + 0.06, y0 + 0.08 + Hb, bz], undefined, () => k.at([0, 0, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), () => motor(k, { R: mb.R, L: mb.L, H: Hb, tbox: 'top', fins: 20 })))
    const fan = cowlFan(mb.R, mb.L, 290)
    const fp = new THREE.Vector3(...fan.pos).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)).add(new THREE.Vector3(bx + 0.06, y0 + 0.08 + Hb, bz))
    rotors.push({ ...fan, pos: fp.toArray() as V3, rot: [0, Math.PI, 0] })
    const ductTop = yRoof - 0.15 - i * 0.12
    k.tube(PVC, [[bx + 0.15, y0 + 0.08 + 0.52, bz - 0.12], [bx + 0.15, ductTop, bz - 0.12], [bx + 0.15, ductTop, zT + Rt * Math.cos(Math.asin(Math.min(0.9, Math.abs(bx + 0.15 - xT) / Rt))) - 0.02]], 0.06, 14, 0.12)
    smallValve(k, 'ball', [bx + 0.15, ductTop - 0.4, bz - 0.12], [0, 1, 0], 0.03, [1, 0, 0])
  }
  k.rbox('stainless', [0.12, 0.15, 0.08], 0.01, [xT, y0 + 0.9, bz - 0.1]) // airflow switch

  // dosing pumps: tank bottom → duty / standby pumps → hypo header → BL
  const hn = p.hypoNps
  const yPs = y0 + 0.35
  const zs = zT + Rt * 0.3
  const xpA = xT + Rt + 0.35
  const mp = motorSize(1.5, 4)
  const Hp = Math.max(mp.H, mp.R * 1.25)
  pipeRun(k, [[xT + Rt - 0.02, yPs, zs], [xpA - 0.3, yPs, zs], [xpA - 0.3, yPs, g.zHy - 0.55]], hn, { mat: PVC })
  for (const [i, zz] of [zs - 0.1, g.zHy - 0.55].entries()) {
    const x = xpA + 0.12
    const z = i === 0 ? zz : zz
    k.box('equipmentPaintDark', [0.7, 0.06, 0.3], [x + 0.05, y0 + 0.03, z])
    k.cyl('machineryGreen', 0.1, 0.1, [x + 0.25, yPs, z], 'x', 24)
    k.cyl('machineryGreen', 0.05, 0.12, [x + 0.25, yPs + 0.13, z], 'y', 14)
    k.at([x + 0.18, yPs, z], undefined, () => motor(k, { R: mp.R, L: mp.L, H: Hp, tbox: 'top', fins: 18 }))
    k.tube(PVC, [[xpA - 0.3, yPs, i === 0 ? zs : g.zHy - 0.55], [xpA - 0.3, yPs, z], [x + 0.32, yPs, z]], pipeOD(hn) / 2, 10, 0.05)
    k.tube(PVC, [[x + 0.25, yPs + 0.19, z], [x + 0.25, g.yHy, z], [x + 0.25, g.yHy, g.zHy]], pipeOD(hn) / 2, 10, 0.06)
    smallValve(k, 'ball', [x + 0.25, (yPs + g.yHy) / 2 + 0.05, z], [0, 1, 0], 0.016, [1, 0, 0])
    k.hex(PVC, 0.06, 0.08, [x + 0.25, (yPs + g.yHy) / 2 - 0.08, z], 'y') // check valve
  }
  const hw = blFlange(k, [L / 2, g.yHy, g.zHy], [1, 0, 0], hn, R150)
  pipeRun(k, [[xpA + 0.37 - 0.05, g.yHy, g.zHy], hw], hn, { mat: PVC })
  k.dome(PVC, pipeOD(hn) / 2, [xpA + 0.32, g.yHy, g.zHy], '-x', Math.PI / 2, 0.5, 20)
  gauge(k, [L / 2 - 0.3, g.yHy + pipeOD(hn) / 2 + 0.12, g.zHy + 0.02], 'z', 0.08, 'bar', 10)
  k.rod('stainless', [L / 2 - 0.3, g.yHy + pipeOD(hn) / 2 - 0.01, g.zHy], [L / 2 - 0.3, g.yHy + pipeOD(hn) / 2 + 0.08, g.zHy], 0.007, 8)
  pipeSupport(k, [L / 2 - 0.45, g.yHy, g.zHy], pipeOD(hn), y0, 'x')
  pipeSupport(k, [cx0 - 0.25, g.ySw * 0.5 + g.yc0 * 0.5, zc], sod, y0, 'z')

  // ---------------------------------------------------------------- LCP and cable tray
  const lx = a + 0.55
  const gl = localPanel(k, [lx, y0, W / 2 - 0.3], [0, 0, 1], { w: 0.5, h: 0.6, top: 1.85, title: 'ELECTROCHLORINATION LCP', buttons: 4 })
  const tz = W / 2 - 0.12
  cableTray(k, [[lx, gl[1] - 0.04, gl[2]], [lx, y0 + 0.22, gl[2]], [lx, y0 + 0.22, tz], [xpA + 0.2, y0 + 0.22, tz]], [1, 0, 0], 0.15, 3)
  k.spline('cable', [[trx - trW / 2 - 0.05, y0 + 0.24, tz], [trx - trW / 2 + 0.05, y0 + 0.3, trz], [trx - trW / 2 + 0.15, y0 + 0.12, trz]], 0.015, 6, 12)
  return { built: k.build(), rotors }
}
