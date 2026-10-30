/**
 * API 610 horizontal centrifugal pump package (OH2-style end-suction / top-discharge; extra stage
 * rings are drawn for stages > 1).
 *
 * Local frame (types.ts): origin = baseplate centre at deck level, shaft along +X, motor at -X.
 * The casing is DERIVED FROM THE NOZZLES so the necks always emerge from it:
 *   - suction  = nozzle whose local dir ≈ +X (axial end suction): its base gives shaft height and the
 *                front end of the suction bell;
 *   - discharge = nozzle whose local dir ≈ +Y: its base x is the volute centre plane, its base y is the
 *                top of the volute throat.
 * Fallbacks are used if a nozzle is missing.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { PumpPackage } from '../../model/types'
import { pipeOD } from '../../model/catalog'
import { dirToLocal, toLocal } from '../../model/geom'
import { materials } from '../../three/materials'
import { NozzleNeck } from '../common/NozzleNeck'
import { Kit, sweepGeometry, type MatKey, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { couplingGuard, smallGauge, tagPlate, tefcMotor } from './machinery/parts'
import { dialMaterial } from './machinery/textures'

const CASING: MatKey = 'machineryGreen'
const BASE: MatKey = 'equipmentPaintDark'

/** angle (in the u=z, v=y plane) where the scroll hands over to the discharge throat */
const THE = Math.PI / 4

/** Planar volute scroll in the YZ plane at x = xc, centred on the shaft (y = ys, z = zc). */
class ScrollCurve extends THREE.Curve<THREE.Vector3> {
  xc: number
  ys: number
  zc: number
  Rimp: number
  r0: number
  r1: number
  th0: number
  constructor(xc: number, ys: number, zc: number, Rimp: number, r0: number, r1: number, th0: number) {
    super()
    this.xc = xc
    this.ys = ys
    this.zc = zc
    this.Rimp = Rimp
    this.r0 = r0
    this.r1 = r1
    this.th0 = th0
  }
  r(t: number) {
    return Math.sqrt(this.r0 * this.r0 + (this.r1 * this.r1 - this.r0 * this.r0) * t)
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    // theta runs from (THE - 2π + th0) to THE (upper +u quadrant), counter-clockwise in (u, v)
    const th = THE - 2 * Math.PI + this.th0 + t * (2 * Math.PI - this.th0)
    const R = this.Rimp + this.r(t)
    return target.set(this.xc, this.ys + Math.sin(th) * R, this.zc + Math.cos(th) * R)
  }
}

interface LocalNozzle {
  base: V3
  dir: V3
  nps: number
}

export function buildPump(eq: PumpPackage) {
  const k = new Kit()
  const [BL, BW] = eq.baseplate
  const loc: LocalNozzle[] = eq.nozzles.map((n) => ({ base: toLocal(eq, n.base), dir: dirToLocal(eq, n.dir), nps: n.nps }))
  const suction = loc.find((n) => n.dir[0] > 0.7)
  const discharge = loc.find((n) => n.dir[1] > 0.7)
  const ys = suction ? suction.base[1] : discharge ? discharge.base[1] - 0.4 : 0.75
  const xs = suction ? suction.base[0] : BL / 2 - 0.2
  const xc = discharge ? discharge.base[0] : xs - 0.4
  const zc = discharge ? discharge.base[2] : suction ? suction.base[2] : 0
  const H = discharge ? discharge.base[1] - ys : 0.4
  const dNps = discharge?.nps ?? 4
  const sNps = suction?.nps ?? 6
  const hb = Math.min(0.3, ys - 0.3) // baseplate top height

  // ---------------------------------------------------------------- volute casing
  const r1 = Math.max((pipeOD(dNps) / 2) * 1.08, 0.05)
  const r0 = r1 * 0.32
  const Rimp = Math.min(Math.max(0.5 * H, 0.1), 0.5)
  const Rend = Rimp + r1
  const scroll = new ScrollCurve(xc, ys, zc, Rimp, r0, r1, 0.5)
  k.add(CASING, sweepGeometry(scroll, (t) => [scroll.r(t), scroll.r(t) * 0.88], 72, 24, true))
  // throat: S-bend from the scroll end up into the discharge nozzle base
  const P0 = new THREE.Vector3(xc, ys + Math.sin(THE) * Rend, zc + Math.cos(THE) * Rend)
  const P3 = new THREE.Vector3(xc, ys + H + 0.02, zc)
  const rise = P3.y - P0.y
  const T0 = new THREE.Vector3(0, Math.cos(THE), -Math.sin(THE))
  const throat = new THREE.CubicBezierCurve3(P0, P0.clone().addScaledVector(T0, rise * 0.55), P3.clone().add(new THREE.Vector3(0, -rise * 0.5, 0)), P3)
  const rTop = (pipeOD(dNps) / 2) * 1.06
  k.add(CASING, sweepGeometry(throat, (t) => {
    const r = r1 + (rTop - r1) * t
    return [r, r * (0.88 + 0.12 * t)]
  }, 24, 24, false))
  // hub (impeller chamber) + front / back covers
  const wHub = r1 * 0.85
  const Rhub = Rimp + r0 * 1.2
  k.cyl(CASING, Rhub, wHub * 2, [xc, ys, zc], 'x', 40)
  // web joining throat to hub so there is no visual gap
  k.box(CASING, [wHub * 1.4, Rhub * 0.5, Rhub * 0.9], [xc, ys + Rhub * 0.75, zc + Rhub * 0.25])
  // discharge boss
  k.cyl(CASING, rTop * 1.12, 0.04, [xc, ys + H - 0.0, zc], 'y', 28)
  // cover joint flanges with studs (front and back)
  const Rj = Rhub + 0.035
  for (const s of [-1, 1]) {
    const xj = xc + s * wHub
    k.cyl(CASING, Rj, 0.03, [xj + s * 0.015, ys, zc], 'x', 40)
    k.boltCircle('boltXylan', 'nut', 12, Rj - 0.018, [xj - (s > 0 ? -0.0 : 0.05), ys, zc], 'x', 0.016, 0.05, s > 0 ? [0.045] : [0.005])
  }
  // casing vent (top) + drain (bottom) plugs
  k.hex('nut', 0.03, 0.02, [xc - wHub * 0.5, ys + Rhub + 0.005, zc - Rhub * 0.3])
  k.cyl(CASING, 0.025, 0.06, [xc, ys - Rend - r1 * 0.6, zc], 'y', 14)
  k.hex('nut', 0.034, 0.02, [xc, ys - Rend - r1 * 0.6 - 0.035, zc], 'y')

  // ---------------------------------------------------------------- stage rings + suction bell
  const front = xc + wHub + 0.03
  let x = front
  const extra = Math.max(0, eq.stages - 1)
  const sR = (pipeOD(sNps) / 2) * 1.08
  const avail = xs - front
  const ringW = extra ? Math.min(0.14, (avail * 0.6) / extra) : 0
  for (let i = 0; i < extra; i++) {
    k.lathe(CASING, [
      [Rhub * 0.85, x],
      [Rhub * 0.98, x + ringW * 0.15],
      [Rhub * 0.98, x + ringW * 0.85],
      [Rhub * 0.85, x + ringW],
      [Rhub * 0.4, x + ringW],
    ], [0, ys, zc], 'x', 36)
    x += ringW
  }
  if (extra) {
    // tie bolts across the stage rings
    k.around(6, Rhub * 0.98, [0, ys, zc], 'x', (p) => {
      k.rod('boltXylan', [front - 0.01, p[1], p[2]], [x + 0.03, p[1], p[2]], 0.009, 6)
      k.hex('nut', 0.03, 0.02, [x + 0.02, p[1], p[2]], 'x')
    }, Math.PI / 6)
  }
  // suction bell (lathe along +X) up to the suction nozzle base
  const bellEnd = Math.max(xs + 0.05, x + 0.06)
  k.lathe(CASING, [
    [Rhub * 0.8, x - 0.02],
    [Rhub * 0.72, x + 0.02],
    [sR * 1.15, x + (bellEnd - x) * 0.6],
    [sR, bellEnd],
    [0, bellEnd],
  ], [0, ys, zc], 'x', 36)

  // ---------------------------------------------------------------- seal chamber + bearing frame
  const back = xc - wHub - 0.03
  const sealL = 0.14
  const sealR = Math.max(0.07, Rhub * 0.42)
  k.cyl(CASING, sealR, sealL, [back - sealL / 2, ys, zc], 'x', 32)
  // seal gland plate with 4 studs + plan 53 ports
  const xg = back - sealL - 0.015
  k.cyl('stainless', sealR * 1.15, 0.03, [xg, ys, zc], 'x', 28)
  k.boltCircle('boltXylan', 'nut', 4, sealR * 0.95, [xg - 0.035, ys, zc], 'x', 0.012, 0.06, [0.006], Math.PI / 4)
  const portIn: V3 = [xg, ys + sealR * 1.15 + 0.02, zc - 0.03]
  const portOut: V3 = [xg, ys + sealR * 1.15 + 0.02, zc + 0.03]
  for (const p of [portIn, portOut]) k.cyl('stainless', 0.011, 0.04, [p[0], p[1] - 0.02, p[2]], 'y', 8)
  // bearing bracket (lantern with windows) then bearing housing
  const brL = 0.18
  const xbr = xg - 0.015
  k.lathe(CASING, [
    [sealR * 1.1, xbr - brL],
    [Rhub * 0.55, xbr - brL * 0.1],
    [Rhub * 0.62, xbr],
  ], [0, ys, zc], 'x', 32)
  const bhL = Math.max(0.36, Rhub * 1.4)
  const bhR = Math.max(0.1, Rhub * 0.48)
  const xbh = xbr - brL
  k.lathe(CASING, [
    [bhR * 0.75, xbh - bhL],
    [bhR, xbh - bhL + 0.03],
    [bhR, xbh - 0.03],
    [bhR * 0.9, xbh],
  ], [0, ys, zc], 'x', 36)
  // cooling fins on bearing housing
  for (let i = 0; i < 6; i++) k.cyl(CASING, bhR * 1.12, 0.008, [xbh - bhL * 0.2 - i * bhL * 0.11, ys, zc], 'x', 32)
  // bearing end cover + shaft
  k.cyl(CASING, bhR * 0.7, 0.03, [xbh - bhL - 0.015, ys, zc], 'x', 28)
  // oil sight glass (bullseye), constant-level oiler, breather
  k.cyl('brass', bhR * 0.22, 0.012, [xbh - bhL * 0.5, ys - bhR * 0.35, zc + bhR * 0.96], 'z', 18)
  k.disc('glass', bhR * 0.17, [xbh - bhL * 0.5, ys - bhR * 0.35, zc + bhR * 0.96 + 0.0065], 'z', 18)
  k.rod('stainless', [xbh - bhL * 0.35, ys - bhR * 0.5, zc + bhR * 0.9], [xbh - bhL * 0.35, ys - bhR * 0.5, zc + bhR + 0.07], 0.008, 8)
  k.cyl('stainless', 0.03, 0.03, [xbh - bhL * 0.35, ys - bhR * 0.5 + 0.015, zc + bhR + 0.08], 'y', 16)
  k.cyl('glass', 0.032, 0.09, [xbh - bhL * 0.35, ys - bhR * 0.5 + 0.075, zc + bhR + 0.08], 'y', 16)
  k.dome('glass', 0.032, [xbh - bhL * 0.35, ys - bhR * 0.5 + 0.12, zc + bhR + 0.08], 'y', Math.PI / 2, 1)
  k.cyl('brass', 0.01, 0.04, [xbh - bhL * 0.6, ys + bhR + 0.02, zc], 'y', 8)
  k.sphere('brass', 0.018, [xbh - bhL * 0.6, ys + bhR + 0.045, zc], undefined, 10)
  // bearing-housing support foot (OH2)
  k.box(CASING, [0.05, ys - hb - bhR * 0.6, bhR * 1.2], [xbh - bhL * 0.55, (ys - bhR * 0.6 + hb) / 2, zc])
  k.box('flangeSteel', [0.12, 0.02, bhR * 1.5], [xbh - bhL * 0.55, hb + 0.01, zc])
  // vibration probes on bearing housing
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4]) {
    const p: V3 = [xbh - bhL * 0.25, ys + Math.sin(a) * bhR, zc + Math.cos(a) * bhR]
    k.rod('stainless', p, [p[0], ys + Math.sin(a) * (bhR + 0.06), zc + Math.cos(a) * (bhR + 0.06)], 0.012, 10)
  }
  const shaftR = Math.max(0.025, bhR * 0.28)
  const xShaftEnd = xbh - bhL - 0.12
  k.cyl('stainless', shaftR, 0.12, [xShaftEnd + 0.06, ys, zc], 'x', 16)

  // centreline-mounted casing feet + pedestals
  const zFoot = Rend + r1 * 0.6
  for (const s of [-1, 1]) {
    k.box(CASING, [0.1, 0.05, zFoot - Rhub * 0.7], [xc, ys, zc + s * (Rhub * 0.7 + (zFoot - Rhub * 0.7) / 2)])
    k.box(CASING, [0.16, 0.035, 0.12], [xc, ys - 0.04, zc + s * zFoot])
    k.box(BASE, [0.14, ys - 0.06 - hb, 0.11], [xc, (ys - 0.06 + hb) / 2, zc + s * zFoot])
    k.box(BASE, [0.2, 0.02, 0.17], [xc, hb + 0.01, zc + s * zFoot])
    k.box('stainless', [0.17, 0.006, 0.13], [xc, ys - 0.06 + 0.003 - 0.0, zc + s * zFoot])
    for (const dx of [-0.045, 0.045]) k.hex('nut', 0.03, 0.02, [xc + dx, ys - 0.012, zc + s * zFoot])
  }

  // ---------------------------------------------------------------- coupling + motor
  const coupL = 0.26
  const xCoupEnd = xShaftEnd
  const xMotorShaft = xCoupEnd - coupL
  const finFrac = 0.12
  let Rm = 0.12 + 0.03 * Math.pow(Math.max(eq.motorKw, 1), 0.4)
  Rm = Math.min(Rm, (ys - hb - 0.04) / (1 + finFrac) - 0.02, BW / 2 - 0.12)
  const stub = 0.1 + Rm * 0.2
  const xm = xMotorShaft - stub + 0.02 // motor local origin (DE shield face)
  const cowl = Math.max(0.12, Rm * 0.6)
  const Lwant = 2.6 * Rm + 0.35
  const Lm = Math.max(0.5, Math.min(Lwant, xm - (-BL / 2 + 0.06) - cowl))
  k.at([xm, ys, zc], undefined, () => tefcMotor(k, { R: Rm, L: Lm, H: ys - hb, tbox: 'side', cable: true }))
  // motor sole plates (shims) visible under feet already; coupling guard
  couplingGuard(k, xMotorShaft - 0.02, xCoupEnd + 0.04, ys, Math.max(0.16, shaftR * 4.2), hb)

  // ---------------------------------------------------------------- baseplate (drain-rim, grout holes, anchor bolts)
  const t = 0.012
  // bottom flange (anchor flange) wider than the frame
  k.box(BASE, [BL, 0.016, BW + 0.08], [0, 0.008, 0])
  // side + end channels
  for (const s of [-1, 1]) {
    k.box(BASE, [BL, hb - 0.016, t], [0, hb / 2 + 0.008, s * (BW / 2 - t / 2)])
    k.box(BASE, [t, hb - 0.016, BW], [s * (BL / 2 - t / 2), hb / 2 + 0.008, 0])
    // stiffeners on the side channels
    for (let i = 1; i < Math.round(BL / 0.45); i++) {
      const xx = -BL / 2 + (i * BL) / Math.round(BL / 0.45)
      k.box(BASE, [0.01, hb - 0.03, 0.04], [xx, hb / 2 + 0.008, s * (BW / 2 + 0.02)])
    }
  }
  // drain-rim deck: top plate slightly below the rim, rim lip around the edge
  k.box(BASE, [BL - 2 * t, 0.01, BW - 2 * t], [0, hb - 0.03, 0])
  for (const s of [-1, 1]) {
    k.box(BASE, [BL, 0.045, 0.02], [0, hb - 0.005, s * (BW / 2 - 0.01)])
    k.box(BASE, [0.02, 0.045, BW], [s * (BL / 2 - 0.01), hb - 0.005, 0])
  }
  // longitudinal sub-beams under pump/motor pads
  for (const s of [-1, 1]) k.box(BASE, [BL - 0.1, hb - 0.05, 0.12], [0, (hb - 0.05) / 2 + 0.016, s * BW * 0.28])
  // motor pads + jack-screw blocks
  for (const fx of [xm - Lm * 0.82, xm - Lm * 0.18])
    for (const s of [-1, 1]) {
      k.box('flangeSteel', [0.22, 0.025, 0.2], [fx, hb - 0.012, zc + s * Rm * 0.78])
      k.box(BASE, [0.04, 0.06, 0.06], [fx + 0.16, hb + 0.02, zc + s * Rm * 0.78])
      k.cyl('boltXylan', 0.008, 0.08, [fx + 0.14, hb + 0.03, zc + s * Rm * 0.78], 'x', 6)
    }
  // grout / vent holes along the centreline
  const nG = Math.max(2, Math.round(BL / 0.9))
  for (let i = 0; i < nG; i++) {
    const gx = -BL / 2 + (BL * (i + 0.5)) / nG
    for (const gz of [-BW * 0.12, BW * 0.12]) {
      k.torus(BASE, 0.05, 0.008, [gx, hb - 0.022, gz], 'y', 6, 24)
      k.disc('rubberBlack', 0.048, [gx, hb - 0.0245, gz], 'y', 24)
    }
  }
  // anchor bolts with washers + nuts along both long sides and ends
  const nA = Math.max(3, Math.round(BL / 0.7) + 1)
  for (let i = 0; i < nA; i++) {
    const ax = -BL / 2 + 0.08 + ((BL - 0.16) * i) / (nA - 1)
    for (const s of [-1, 1]) {
      const az = s * (BW / 2 + 0.035)
      k.cyl('stainless', 0.02, 0.004, [ax, 0.018, az], 'y', 16)
      k.hex('nut', 0.042, 0.024, [ax, 0.032, az])
      k.cyl('boltXylan', 0.011, 0.07, [ax, 0.05, az], 'y', 8)
    }
  }
  // lifting lugs at the 4 corners
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.box(BASE, [0.1, 0.1, 0.02], [sx * (BL / 2 - 0.12), hb * 0.55, sz * (BW / 2 + 0.01)])
      k.torus('nut', 0.025, 0.006, [sx * (BL / 2 - 0.12), hb * 0.55 + 0.02, sz * (BW / 2 + 0.022)], 'z', 6, 14)
    }
  // drain connection at the low corner
  k.cyl(BASE, 0.022, 0.12, [BL / 2 + 0.05, hb - 0.04, -BW / 2 + 0.15], 'x', 12)
  k.hex('nut', 0.05, 0.03, [BL / 2 + 0.11, hb - 0.04, -BW / 2 + 0.15], 'x')
  // earth boss + tag sign
  k.cyl('brass', 0.015, 0.03, [-BL / 2 + 0.3, hb * 0.5, BW / 2 + 0.015], 'z', 10)
  tagPlate(k, eq.tag, [-BL / 2 + 0.6, hb * 0.5, BW / 2 + 0.002], 'z', 0.22)

  // ---------------------------------------------------------------- API Plan 53A seal reservoir
  const px = Math.min(xbh - bhL * 0.2, xc - 0.25)
  const pz = -(BW / 2 - 0.12)
  const vy0 = Math.max(ys + 0.25, 0.95)
  const vH = 0.5
  const vr = 0.075
  k.rod('structSteel', [px, hb, pz], [px, vy0 - 0.05, pz], 0.025, 10)
  k.box('structSteel', [0.16, 0.012, 0.16], [px, hb + 0.006, pz])
  k.box('structSteel', [0.2, 0.012, 0.2], [px, vy0 - 0.05, pz])
  k.cyl('stainless', vr, vH, [px, vy0 + vH / 2, pz], 'y', 28)
  k.dome('stainless', vr, [px, vy0 + vH, pz], 'y', Math.PI / 2, 0.5)
  k.dome('stainless', vr, [px, vy0, pz], '-y', Math.PI / 2, 0.5)
  for (const s of [-1, 1]) k.box('structSteel', [0.03, 0.08, 0.012], [px + s * (vr + 0.012), vy0 - 0.02, pz])
  // level transmitter chamber on reservoir + PI gauge + N2 inlet + fill cap
  k.cyl('stainless', 0.018, vH * 0.7, [px + vr + 0.06, vy0 + vH / 2, pz], 'y', 12)
  for (const yy of [vy0 + vH * 0.2, vy0 + vH * 0.8]) k.rod('tubing', [px + vr * 0.9, yy, pz], [px + vr + 0.06, yy, pz], 0.006, 8)
  k.rbox('actuatorBlue', [0.06, 0.08, 0.06], 0.01, [px + vr + 0.06, vy0 + vH * 0.85 + 0.06, pz])
  k.cyl('stainless', 0.008, 0.08, [px, vy0 + vH + 0.07, pz], 'y', 8)
  smallGauge(k, [px, vy0 + vH + 0.14, pz], 'z', dialMaterial('bar', 60), 0.08)
  k.cyl('brass', 0.016, 0.05, [px - 0.035, vy0 + vH + 0.02, pz], 'y', 10)
  k.rod('tubing', [px + 0.03, vy0 + vH + 0.02, pz], [px + 0.03, vy0 + vH + 0.1, pz + 0.1], 0.005, 6)
  // seal supply / return tubing between gland and reservoir
  k.tube('tubing', [[portIn[0], portIn[1], portIn[2]], [portIn[0], portIn[1] + 0.06, portIn[2]], [px, portIn[1] + 0.06, portIn[2]], [px, portIn[1] + 0.06, pz + vr + 0.08], [px, vy0 + 0.05, pz + vr + 0.08], [px, vy0 + 0.05, pz + vr * 0.7]], 0.006)
  k.tube('tubing', [[portOut[0], portOut[1], portOut[2]], [portOut[0], portOut[1] + 0.12, portOut[2]], [px + 0.04, portOut[1] + 0.12, portOut[2]], [px + 0.04, portOut[1] + 0.12, pz + vr + 0.12], [px + 0.04, vy0 + vH * 0.7, pz + vr + 0.12], [px + 0.04, vy0 + vH * 0.7, pz + vr * 0.6]], 0.006)

  // ---------------------------------------------------------------- local control station
  const lx = -BL / 2 + 0.14
  const lz = BW / 2 - 0.14
  k.rod('structSteel', [lx, hb, lz], [lx, 1.45, lz], 0.03, 12)
  k.box('structSteel', [0.15, 0.012, 0.15], [lx, hb + 0.006, lz])
  const by = 1.2
  k.box('structSteel', [0.04, 0.3, 0.02], [lx, by, lz + 0.04])
  k.rbox('stainless', [0.24, 0.32, 0.13], 0.012, [lx, by, lz + 0.115])
  k.box('stainless', [0.3, 0.012, 0.2], [lx, by + 0.18, lz + 0.12], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.15))
  const fz = lz + 0.18
  k.cyl('safetyGreen', 0.016, 0.02, [lx - 0.055, by + 0.05, fz], 'z', 16)
  k.cyl('actuatorRed', 0.016, 0.02, [lx + 0.055, by + 0.05, fz], 'z', 16)
  k.cyl('actuatorYellow', 0.04, 0.004, [lx, by - 0.07, fz - 0.002], 'z', 24)
  k.cyl('actuatorRed', 0.012, 0.03, [lx, by - 0.07, fz + 0.012], 'z', 12)
  k.dome('actuatorRed', 0.028, [lx, by - 0.07, fz + 0.025], 'z', Math.PI / 2, 0.6)
  smallGauge(k, [lx, by + 0.11, fz - 0.01], 'z', dialMaterial('bar', 600), 0.06)
  k.hex('brass', 0.03, 0.02, [lx, by - 0.17, lz + 0.11])
  k.spline('cable', [[lx, by - 0.18, lz + 0.11], [lx, by - 0.35, lz + 0.06], [lx, hb + 0.2, lz + 0.04], [lx + 0.1, hb + 0.02, lz]], 0.008, 6, 24)

  return k.build()
}

export function PumpPackageModel({ eq }: { eq: PumpPackage }) {
  const built = useMemo(() => buildPump(eq), [eq])
  const m = materials()
  return (
    <group>
      <KitMesh data={built} />
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} paintMaterial={m.machineryGreen} />
      ))}
    </group>
  )
}
