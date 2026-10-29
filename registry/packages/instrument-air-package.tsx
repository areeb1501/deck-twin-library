// Instrument air package: oil-free screw compressor in an acoustic enclosure, pre / after filters, twin-tower desiccant dryer and air receiver on one skid. ISO 8573-1, ASME VIII-1.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, mat4, uvScale, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { gauge, manway, nozzle, pipeRun, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, fanRotor, type RotorSpec } from '../lib/rotors'
import { SECTIONS, flange as flangeDims, pipeOD, shellThickness, type Rating } from '../lib/standards'
import { fanGuardMaterial, lcdMaterial, louvreMaterial, textMaterial } from '../lib/textures'
import { addv, blFlange, mateFlange, padeyeShackles, spoolJoint, cableTray, dripPan, earthBoss, localPanel, pipeSupport, shellLabel, smallPsv, smallValve, transmitter, valve, valveSpan, vVessel, vesselLegs } from './_skid'

export interface InstrumentAirPackageProps {
  /** compressor motor, kW */
  kw?: number
  /** receiver inside diameter, m */
  receiverDiameter?: number
  /** receiver tangent-to-tangent height, m */
  receiverHeight?: number
  /** receiver design pressure, barg */
  pressure?: number
  outletNps?: number
  tag?: string
  running?: boolean
}

export const defaults = {
  kw: 55,
  receiverDiameter: 1.0,
  receiverHeight: 2.2,
  pressure: 13,
  outletNps: 2,
  tag: 'K-4600',
  running: true,
}

type P = typeof defaults

const SKID = 'HEB 160'
const RATING: Rating = 150
const ENC: MatKey = paint('#d9dcd8', { metalness: 0.2, roughness: 0.5 })
const TRIM: MatKey = paint('#1f5fa0', { metalness: 0.25, roughness: 0.45 })
const TOWER: MatKey = paint('#3a6ea5', { metalness: 0.25, roughness: 0.45 })

function layout(p: P) {
  const kw = THREE.MathUtils.clamp(p.kw, 11, 250)
  const encL = 1.3 + kw * 0.006
  const encW = 0.95 + kw * 0.0028
  const encH = 1.45 + kw * 0.003
  const W = Math.max(2.0, encW + 0.9, p.receiverDiameter + 1.0)
  const y0 = SECTIONS[SKID].d + 0.008
  const x0 = 0.2
  const xe1 = x0 + encL
  const xF1 = xe1 + 0.45
  const xF2 = xF1 + 0.38
  const xD0 = xF2 + 0.5
  const xD1 = xD0 + 0.62
  const xF3 = xD1 + 0.5
  const wall = shellThickness(p.pressure, p.receiverDiameter)
  const Ro = p.receiverDiameter / 2 + wall
  const xR = xF3 + 0.45 + Ro
  const Sv = valveSpan('ball', p.outletNps, RATING)
  const fo = flangeDims(p.outletNps, RATING)
  const xFace = xR + Ro + 0.22 + Sv + 0.25 + fo.hubLength + fo.raisedFaceHeight
  const L = xFace + 0.05
  const sh = -L / 2
  const yTL = y0 + 0.45 + p.receiverDiameter / 4 + wall
  const yo = yTL + p.receiverHeight * 0.78
  return { kw, encL, encW, encH, W, L, y0, x0: sh + x0, xe1: sh + xe1, xF1: sh + xF1, xF2: sh + xF2, xD0: sh + xD0, xD1: sh + xD1, xF3: sh + xF3, xR: sh + xR, Ro, wall, yTL, yo, Sv, yp: y0 + 1.25, zP: -0.2 }
}

export function ports(props: InstrumentAirPackageProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [port('outlet', 'Dry instrument air', [g.L / 2, g.yo, 0], [1, 0, 0], p.outletNps, RATING, 'utility')]
}

export function InstrumentAirPackage(props: InstrumentAirPackageProps & GroupProps) {
  const { kw, receiverDiameter, receiverHeight, pressure, outletNps, tag, running, ...group } = { ...defaults, ...props }
  const p = { kw, receiverDiameter, receiverHeight, pressure, outletNps, tag, running }
  const { built, rotors } = useMemo(() => build(p), [kw, receiverDiameter, receiverHeight, pressure, outletNps, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default InstrumentAirPackage

function louvre(k: Kit, w: number, h: number, pos: V3, n: V3) {
  const g = new THREE.PlaneGeometry(w, h)
  uvScale(g, 1, h / 0.06)
  k.add(louvreMaterial('#c9ccc8'), g, mat4(pos, undefined).multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n)))))
}

function build(p: P) {
  const k = new Kit()
  const g = layout(p)
  const { L, W, y0, encL, encW, encH, yp, zP } = g
  const np = 2 // interconnecting piping, NPS
  const od = pipeOD(np)
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)
  tagPlate(k, p.tag, [-L / 2 + 0.8, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.3)
  earthBoss(k, [L / 2 - 0.4, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])
  const rotors: RotorSpec[] = []

  // ---------------------------------------------------------------- compressor enclosure
  const ex = g.x0 + encL / 2
  const ez = 0
  k.box('equipmentPaintDark', [encL + 0.04, 0.12, encW + 0.04], [ex, y0 + 0.06, ez])
  for (const s of [-1, 1]) k.box('rubberBlack', [0.25, 0.07, encW - 0.1], [ex + s * encL * 0.28, y0 + 0.06, ez])
  const yb = y0 + 0.12
  k.rbox(ENC, [encL, encH, encW], 0.02, [ex, yb + encH / 2, ez])
  k.box(TRIM, [encL + 0.004, 0.08, encW + 0.004], [ex, yb + encH - 0.18, ez])
  // door panels with seams, handles, hinges on the front (+Z) and back
  const nd = Math.max(2, Math.round(encL / 0.75))
  for (const s of [-1, 1]) {
    const zf = ez + s * (encW / 2 + 0.002)
    for (let i = 0; i < nd; i++) {
      const dx = ex - encL / 2 + (encL * (i + 0.5)) / nd
      const dw = encL / nd - 0.03
      k.box('equipmentPaintDark', [0.008, encH - 0.32, 0.004], [ex - encL / 2 + (encL * i) / nd + 0.01, yb + (encH - 0.25) / 2, zf])
      k.box('nut', [0.02, 0.12, 0.025], [dx + dw / 2 - 0.06, yb + encH * 0.5, zf + s * 0.012])
      for (const hy of [0.25, encH - 0.45]) k.cyl('nut', 0.01, 0.06, [dx - dw / 2 + 0.02, yb + hy, zf + s * 0.006], 'y', 8)
      if (i < nd - 1 || s < 0) louvre(k, dw * 0.8, 0.45, [dx, yb + 0.35, zf + s * 0.002], [0, 0, s])
    }
  }
  louvre(k, encW * 0.7, encH * 0.45, [ex - encL / 2 - 0.002, yb + encH * 0.4, ez], [-1, 0, 0])
  // controller display and e-stop on the front door
  const dxC = ex + encL / 2 - encL / nd / 2
  const zf = ez + encW / 2 + 0.004
  k.box('rubberBlack', [0.3, 0.22, 0.01], [dxC, yb + encH * 0.68, zf])
  k.plane(lcdMaterial(), 0.24, 0.15, [dxC, yb + encH * 0.68, zf + 0.0055])
  k.cyl('actuatorYellow', 0.045, 0.006, [dxC + 0.2, yb + encH * 0.68, zf], 'z', 20)
  k.dome('actuatorRed', 0.03, [dxC + 0.2, yb + encH * 0.68, zf + 0.004], 'z', Math.PI / 2, 0.7, 16)
  k.plane(textMaterial('OIL-FREE SCREW', '#1f5fa0', '#ffffff', 512, 64), encL * 0.5, encL * 0.0625, [ex - encL * 0.15, yb + encH - 0.18, zf + 0.002])
  // roof cooling-air outlet: raised hood with grille and the fan below
  const hx = ex - encL * 0.18
  const hw = Math.min(encW * 0.75, encL * 0.45)
  k.box(ENC, [hw + 0.08, 0.2, hw + 0.08], [hx, yb + encH + 0.1, ez])
  k.disc('rubberBlack', hw * 0.45, [hx, yb + encH + 0.17, ez], 'y', 32)
  k.disc(fanGuardMaterial(), hw * 0.46, [hx, yb + encH + 0.205, ez], 'y', 32)
  rotors.push(fanRotor('flangeSteel', hw * 0.42, [hx, yb + encH + 0.18, ez], 'y', 600, { blades: 7, pitch: 0.3 }))
  // lifting points on the roof
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.torus('nut', 0.04, 0.01, [ex + sx * (encL / 2 - 0.12), yb + encH + 0.03, ez + sz * (encW / 2 - 0.12)], sz > 0 ? 'z' : 'z', 6, 14, Math.PI)

  // discharge out of the enclosure end (+X), along the pipe rack line
  const dOut: V3 = [ex + encL / 2, yp, zP]
  k.box('equipmentPaintDark', [0.01, 0.22, 0.22], [dOut[0] + 0.005, yp, zP])
  const ff = flangeDims(np, RATING)
  const fj = ff.hubLength + ff.raisedFaceHeight + 0.00225
  k.pipe('pipePaint', [dOut[0], yp, zP], [dOut[0] + 0.12 - fj, yp, zP], od, 0.004)
  spoolJoint(k, [dOut[0] + 0.12, yp, zP], [1, 0, 0], np, RATING)
  // power cable from the enclosure gland box to the LCP tray
  k.rbox('stainless', [0.25, 0.25, 0.12], 0.01, [ex + encL * 0.3, yb + 0.5, ez - encW / 2 - 0.06])

  // ---------------------------------------------------------------- filters (pre, coalescing, after)
  const filter = (x: number, label: string) => {
    const hy = yp
    k.rbox('aluminium', [0.2, 0.14, 0.14], 0.02, [x, hy, zP])
    k.cyl('aluminium', 0.075, 0.42, [x, hy - 0.29, zP], 'y', 24)
    k.cyl('aluminium', 0.08, 0.04, [x, hy - 0.09, zP], 'y', 24)
    k.cyl('stainless', 0.012, 0.08, [x, hy - 0.54, zP], 'y', 10)
    k.rbox('rubberBlack', [0.05, 0.06, 0.05], 0.008, [x, hy - 0.6, zP])
    k.tube('tubing', [[x, hy - 0.63, zP], [x, y0 + 0.08, zP], [x, y0 + 0.08, zP + 0.3]], 0.005, 6, 0.04)
    gauge(k, [x, hy + 0.12, zP + 0.02], 'z', 0.06, 'bar', 1)
    k.rod('stainless', [x, hy + 0.07, zP], [x, hy + 0.12, zP], 0.006, 6)
    k.plane(textMaterial(label, '#1f5fa0', '#fff', 256, 64), 0.12, 0.03, [x, hy - 0.25, zP + 0.076])
    k.box('galvanised', [0.06, hy - 0.2 - y0, 0.06], [x, (hy - 0.2 + y0) / 2, zP - 0.16])
    k.box('galvanised', [0.06, 0.06, 0.12], [x, hy - 0.05, zP - 0.1])
    k.box('galvanised', [0.14, 0.012, 0.14], [x, y0 + 0.006, zP - 0.16])
  }
  filter(g.xF1, 'PRE-FILTER')
  filter(g.xF2, 'COALESCER')
  pipeRun(k, [[dOut[0] + 0.12 + fj, yp, zP], [g.xF1 - 0.1, yp, zP]], np)
  k.pipe('pipePaint', [g.xF1 + 0.1, yp, zP], [g.xF2 - 0.1, yp, zP], od, 0.004)
  // condensate drain header to the drip pan
  dripPan(k, (g.xF1 + g.xD1) / 2, zP + 0.35, g.xD1 - g.xF1 + 0.6, 0.3, y0, 0.05)

  // ---------------------------------------------------------------- twin-tower desiccant dryer
  const tId = 0.3
  const tWall = shellThickness(p.pressure, tId)
  const tTT = 1.45
  const tTL = y0 + 0.55
  const xm = (g.xD0 + g.xD1) / 2
  for (const x of [g.xD0, g.xD1]) {
    const T = vVessel(k, x, 0, tTL, tId, tTT, tWall, TOWER, 32)
    k.box('structSteel', [0.25, 0.012, 0.25], [x, tTL - T.hd - 0.12, 0])
    k.cyl(TOWER, 0.05, 0.1, [x, tTL - T.hd - 0.06, 0], 'y', 16)
    k.cyl(TOWER, 0.05, 0.12, [x, T.yTop + 0.04, 0], 'y', 16)
    gauge(k, [x, T.yTop + 0.06, 0.12], 'z', 0.08, 'bar', 16)
    k.rod('stainless', [x, T.yTop + 0.06, 0.05], [x, T.yTop + 0.06, 0.1], 0.006, 6)
    for (const y of [tTL + 0.3, tTL + tTT - 0.3]) k.torus('structSteel', T.Ro + 0.012, 0.01, [x, y, 0], 'y', 6, 32)
    k.plane(textMaterial('DESICCANT', '#3a6ea5', '#ffffff', 256, 64), 0.18, 0.045, [x, tTL + tTT * 0.55, T.Ro + 0.003])
  }
  // dryer frame
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.box('structSteel', [0.06, tTT + 0.5, 0.06], [xm + sx * 0.55, y0 + (tTT + 0.5) / 2, sz * 0.3])
      k.box('structSteel', [0.12, 0.012, 0.12], [xm + sx * 0.55, y0 + 0.006, sz * 0.3])
    }
  for (const y of [tTL + 0.3, tTL + tTT - 0.3]) for (const sz of [-1, 1]) k.box('structSteel', [1.16, 0.05, 0.03], [xm, y, sz * 0.3])
  for (const y of [tTL + 0.3, tTL + tTT - 0.3]) for (const x of [g.xD0, g.xD1]) k.box('structSteel', [0.03, 0.05, 0.6], [x, y, 0])
  // inlet / exhaust manifold with switching valves and purge silencers
  const yBm = tTL - 0.4
  pipeRun(k, [[g.xF2 + 0.1, yp, zP], [g.xF2 + 0.25, yp, zP], [g.xF2 + 0.25, yBm, zP], [xm, yBm, zP], [xm, yBm, 0]], np)
  k.pipe('pipePaint', [g.xD0, yBm, 0], [g.xD1, yBm, 0], od, 0.004)
  for (const x of [g.xD0, g.xD1]) k.pipe('pipePaint', [x, yBm, 0], [x, tTL - 0.25, 0], od, 0.004)
  for (const [i, x] of [g.xD0 + 0.16, g.xD1 - 0.16].entries()) {
    k.rbox('valveBody', [0.1, 0.1, 0.1], 0.01, [x, yBm, 0])
    k.rbox('actuatorYellow', [0.2, 0.09, 0.1], 0.015, [x, yBm + 0.12, 0])
    k.rbox('valveBody', [0.1, 0.1, 0.1], 0.01, [x, yBm, 0.14])
    k.pipe('pipePaint', [x, yBm, 0.03], [x, yBm, 0.14], od * 0.6, 0.003)
    k.cyl('stainless', 0.07, 0.3, [x, yBm - 0.2, 0.14], 'y', 18)
    k.dome('stainless', 0.07, [x, yBm - 0.35, 0.14], '-y', Math.PI / 2, 0.5, 18)
    k.rbox('actuatorYellow', [0.16, 0.08, 0.08], 0.012, [x, yBm + 0.1, 0.14])
    void i
  }
  // top manifold with check valves, purge line and outlet
  const yTm = tTL + tTT + tId / 4 + 0.35
  for (const x of [g.xD0, g.xD1]) k.pipe('pipePaint', [x, yTm, 0], [x, tTL + tTT + tId / 4 + 0.08, 0], od * 0.8, 0.004)
  k.pipe('pipePaint', [g.xD0 - 0.04, yTm, 0], [g.xD1 + 0.04, yTm, 0], od, 0.004)
  for (const x of [g.xD0 + 0.18, g.xD1 - 0.18]) k.rbox('valveBody', [0.12, 0.09, 0.09], 0.01, [x, yTm, 0])
  k.tube('tubing', [[g.xD0 + 0.05, yTm + 0.05, 0], [g.xD0 + 0.05, yTm + 0.14, 0], [g.xD1 - 0.05, yTm + 0.14, 0], [g.xD1 - 0.05, yTm + 0.05, 0]], 0.008, 8, 0.03)
  smallValve(k, 'needle', [xm, yTm + 0.14, 0], [1, 0, 0], 0.007, [0, 1, 0])
  // dryer controller with cable to the tray
  k.rbox('stainless', [0.35, 0.4, 0.15], 0.012, [xm, tTL + 0.45, 0.42])
  k.plane(lcdMaterial(), 0.16, 0.08, [xm, tTL + 0.55, 0.496])
  k.cyl('safetyGreen', 0.012, 0.01, [xm - 0.08, tTL + 0.35, 0.5], 'z', 10)
  k.cyl('actuatorRed', 0.012, 0.01, [xm + 0.08, tTL + 0.35, 0.5], 'z', 10)
  for (const sx of [-1, 1]) k.box('structSteel', [0.04, 0.5, 0.04], [xm + sx * 0.12, tTL + 0.45, 0.33])
  // after-filter and dry-air line to the receiver
  filter(g.xF3, 'AFTER-FILTER')
  pipeRun(k, [[xm, yTm, 0], [xm, yTm + 0.0, 0], [g.xD1 + 0.04, yTm, 0]], np)
  pipeRun(k, [[g.xD1 + 0.04, yTm, 0], [g.xD1 + 0.28, yTm, 0], [g.xD1 + 0.28, yp, 0], [g.xD1 + 0.28, yp, zP], [g.xF3 - 0.1, yp, zP]], np)
  transmitter(k, [g.xD1 + 0.28 + od / 2, (yTm + yp) / 2, 0], [1, 0, 0], 0.06)
  transmitter(k, [(g.xD1 + 0.28 + g.xF3) / 2, yp + od / 2, zP], [0, 1, 0], 0.08, 'aluminium') // dew-point transmitter
  k.box('stainless', [0.08, 0.05, 0.05], [g.xD1 + 0.28, (yTm + yp) / 2 - 0.25, od / 2 + 0.03])

  // ---------------------------------------------------------------- air receiver
  const R = vVessel(k, g.xR, 0, g.yTL, p.receiverDiameter, p.receiverHeight, g.wall, 'equipmentPaint')
  vesselLegs(k, g.xR, 0, g.Ro, g.yTL + 0.15, y0, 3, 'equipmentPaint', Math.PI / 2)
  const yIn = g.yTL + p.receiverHeight * 0.3
  const inFace = nozzle(k, { base: [g.xR - g.Ro, yIn, 0], dir: [-1, 0, 0], nps: np, rating: RATING, standout: 0.2, mat: 'equipmentPaint', studs: false })
  const inWeld = mateFlange(k, inFace, [-1, 0, 0], np, RATING)
  pipeRun(k, [[g.xF3 + 0.1, yp, zP], [g.xF3 + 0.25, yp, zP], [g.xF3 + 0.25, yIn, zP], [g.xF3 + 0.25, yIn, 0], inWeld], np)
  pipeSupport(k, [g.xF3 + 0.25, yIn, zP * 0.5], od, y0, 'z')
  // outlet: nozzle neck, ball valve, battery limit
  const xo0 = g.xR + g.Ro - 0.02
  const xo1 = g.xR + g.Ro + 0.22
  k.pipe('equipmentPaint', [xo0, g.yo, 0], [xo1, g.yo, 0], pipeOD(p.outletNps), 0.005)
  valve(k, 'ball', [xo1 + g.Sv / 2, g.yo, 0], [1, 0, 0], p.outletNps, RATING)
  const w = blFlange(k, [L / 2, g.yo, 0], [1, 0, 0], p.outletNps, RATING)
  pipeRun(k, [[xo1 + g.Sv, g.yo, 0], w], p.outletNps)
  // relief valve, gauge, transmitter, inspection opening, auto drain
  const top = R.yTop
  k.pipe('equipmentPaint', [g.xR, top - 0.02, 0], [g.xR, top + 0.08, 0], 0.06, 0.005)
  const po = smallPsv(k, [g.xR, top + 0.08, 0], [0, 0, 1], 0.03)
  k.tube('pipePaint', [po, addv(po, [0, 0, 1], 0.08), addv(addv(po, [0, 0, 1], 0.08), [0, 1, 0], 0.12)], 0.02, 10, 0.05)
  k.tube('pipePaint', [[g.xR + 0.25, top - 0.08, 0], [g.xR + 0.25, top + 0.12, 0]], 0.012, 8)
  gauge(k, [g.xR + 0.25, top + 0.18, 0.02], 'z', 0.12, 'bar', 16)
  transmitter(k, [g.xR - g.Ro * 0.7, g.yTL + p.receiverHeight * 0.7, g.Ro * 0.7], [-0.7, 0, 0.7], 0.12)
  manway(k, [g.xR, g.yTL + 0.45, g.Ro], [0, 0, 1], 0.15, 12, RATING)
  k.tube('pipePaint', [[g.xR, R.yBot + 0.01, 0], [g.xR, y0 + 0.2, 0], [g.xR, y0 + 0.2, -g.Ro - 0.1]], 0.012, 8, 0.04)
  smallValve(k, 'ball', [g.xR, y0 + 0.2, -g.Ro * 0.5], [0, 0, -1], 0.01)
  k.rbox('rubberBlack', [0.12, 0.14, 0.1], 0.015, [g.xR, y0 + 0.2, -g.Ro - 0.16])
  tagPlate(k, 'ASME VIII-1', [g.xR - g.Ro * 0.5, g.yTL + p.receiverHeight * 0.45, g.Ro * 0.87 + 0.002], [-0.5, 0, 0.87], 0.16)
  shellLabel(k, 'INSTRUMENT AIR', g.xR, g.yTL + p.receiverHeight * 0.6, 0, g.Ro, g.Ro * 0.22)

  // ---------------------------------------------------------------- LCP and cable tray along the back
  const zb = -W / 2 + 0.15
  const gl = localPanel(k, [g.xD0 - 0.1, y0, -W / 2 + 0.42], [0, 0, -1], { w: 0.5, h: 0.6, top: 1.8, title: 'IA PACKAGE LCP', buttons: 4 })
  cableTray(k, [[g.xD0 - 0.1, gl[1] - 0.04, gl[2]], [g.xD0 - 0.1, y0 + 0.2, gl[2]], [g.xD0 - 0.1, y0 + 0.2, zb], [ex + encL * 0.3, y0 + 0.2, zb]], [1, 0, 0], 0.15, 2)
  k.spline('cable', [[ex + encL * 0.3, y0 + 0.22, zb], [ex + encL * 0.3, y0 + 0.4, ez - encW / 2 - 0.08], [ex + encL * 0.3, yb + 0.37, ez - encW / 2 - 0.06]], 0.012, 6, 16)
  k.spline('cable', [[g.xD0 - 0.05, y0 + 0.22, zb], [xm, y0 + 0.4, 0.1], [xm, tTL + 0.25, 0.42]], 0.008, 6, 16)
  return { built: k.build(), rotors }
}
