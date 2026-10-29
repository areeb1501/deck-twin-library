// API 674 horizontal plunger pump package (triplex / quintuplex): power frame, crosshead extensions, fluid end with valve covers, manifolds with pulsation dampeners, gear reducer, IEC motor, structural skid.
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { gauge, liftingLug, motor, pipeRun, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, cowlFan, guardedCoupling, type RotorSpec } from '../lib/rotors'
import { SECTIONS, pipeOD, type Rating } from '../lib/standards'
import { clamp, controlStation, flangeLen, flangedBranch, meshPanel, motorEnvelope, mountPad } from './_pumps'

export interface ReciprocatingPumpProps {
  suctionNps?: number
  dischargeNps?: number
  /** suction flange class */
  suctionRating?: Rating
  /** discharge flange class */
  rating?: Rating
  /** motor rated power, kW */
  kw?: number
  /** 3 = triplex, 5 = quintuplex */
  plungers?: number
  frame?: MatKey
  tag?: string
  running?: boolean
}

export const defaults = {
  suctionNps: 4,
  dischargeNps: 2,
  suctionRating: 300 as Rating,
  rating: 1500 as Rating,
  kw: 250,
  plungers: 3,
  frame: 'machineryGreen' as MatKey,
  running: true,
}

type P = Omit<typeof defaults, 'running'> & { tag?: string }

function layout(p: P) {
  const n = p.plungers >= 5 ? 5 : 3
  const kw = clamp(p.kw, 10, 2000)
  const m = motorEnvelope(kw, 4)
  const top = SECTIONS['HEB 200'].d + 0.008
  const pitch = 0.17 + 0.00018 * kw // plunger centres, typical
  const Lf = n * pitch + 0.25
  const yc = top + clamp(0.38 + 0.0003 * kw, 0.4, 0.85) // crank / plunger centreline
  const Hf = (yc - top) * 1.9
  const zCase1 = 0.28
  const zSB = zCase1 + clamp(0.3 + 0.0002 * kw, 0.32, 0.6) // crosshead extension
  const zFE0 = zSB + 0.12
  const dFE = clamp(0.36 + 0.0002 * kw, 0.38, 0.7)
  const zFE = zFE0 + dFE / 2
  const hFE = clamp(0.32 + 0.0002 * kw, 0.34, 0.6)
  const ySm = yc - hFE / 2 - 0.22
  const yDm = yc + hFE / 2 + 0.2
  const xf0 = 0.2 // frame -X face
  const xf1 = xf0 + Lf
  const xEnd = xf1 + 0.45
  const xGb = xf0 - 0.42 // gearbox centre
  const xSE = xGb - 0.3 // gearbox input shaft end
  const xMS = xSE - 0.32
  const Rm = m.R
  const stub = 0.1 + Rm * 0.2
  const xm = xMS - stub + 0.02
  const x0 = xm - m.L - Math.max(0.12, Rm * 0.6) - 0.15
  const x1 = xEnd + 0.1
  const cx = (x0 + x1) / 2
  const zMin = Math.min(-0.6, -Rm - 0.35)
  const zMax = zFE0 + dFE + 0.3
  const W = zMax - zMin
  const zc = -(zMax + zMin) / 2 // drive-train line z (crank axis), centres the package on the skid
  const ym = top + m.H
  return { n, kw, m, top, pitch, Lf, yc, Hf, zCase1, zSB, zFE0, dFE, zFE, hFE, ySm, yDm, xf0, xf1, xEnd, xGb, xSE, xMS, xm, x0, x1, cx, W, zc, ym }
}

export function ports(props: ReciprocatingPumpProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  const z = L.zc + L.zFE
  const xs = L.xEnd + flangeLen(p.suctionNps, p.suctionRating)
  const xd = L.xEnd + flangeLen(p.dischargeNps, p.rating)
  return [
    port('suction', 'Suction', [xs - L.cx, L.ySm, z], [1, 0, 0], p.suctionNps, p.suctionRating),
    port('discharge', 'Discharge', [xd - L.cx, L.yDm, z], [1, 0, 0], p.dischargeNps, p.rating),
  ]
}

export function ReciprocatingPump({ tag, ...rest }: ReciprocatingPumpProps & GroupProps) {
  const { suctionNps, dischargeNps, suctionRating, rating, kw, plungers, frame, running, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(
    () => build({ suctionNps, dischargeNps, suctionRating, rating, kw, plungers, frame, tag }),
    [suctionNps, dischargeNps, suctionRating, rating, kw, plungers, frame, tag],
  )
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default ReciprocatingPump

function build(p: P) {
  const k = new Kit()
  const L = layout(p)
  const rotors: RotorSpec[] = []
  k.at([-L.cx, 0, 0], undefined, () => skid(k, L.x1 - L.x0, L.W, 'HEB 200'))
  k.at([-L.cx, 0, L.zc], undefined, () => draw(k, p, L, rotors))
  for (const r of rotors) r.pos = [r.pos[0] - L.cx, r.pos[1], r.pos[2] + L.zc]
  if (p.tag) tagPlate(k, p.tag, [0, L.top * 0.5, L.W / 2 + 0.002], 'z', 0.24)
  controlStation(k, [L.x0 + 0.25 - L.cx, L.top, L.W / 2 - 0.2])
  return { built: k.build(), rotors }
}

function draw(k: Kit, p: P, L: ReturnType<typeof layout>, rotors: RotorSpec[]) {
  const F = p.frame
  const { n, pitch, top, yc, Hf, zCase1, zSB, zFE0, dFE, zFE, hFE, ySm, yDm, xf0, xf1, xEnd, xGb, xSE, xMS, xm, ym, Lf } = L
  const xp = (i: number) => xf0 + 0.125 + pitch * (i + 0.5)

  // power frame: crankcase with ribs, inspection covers, breather, sight glass, crank bearing caps
  const zCase0 = -0.42
  k.rbox(F, [Lf, Hf, zCase1 - zCase0], 0.03, [(xf0 + xf1) / 2, top + Hf / 2, (zCase0 + zCase1) / 2])
  k.box(F, [Lf + 0.12, 0.03, zCase1 - zCase0 + 0.12], [(xf0 + xf1) / 2, top + 0.015, (zCase0 + zCase1) / 2])
  for (let i = 0; i < n; i++) {
    k.rbox(F, [pitch * 0.7, 0.02, (zCase1 - zCase0) * 0.6], 0.008, [xp(i), top + Hf + 0.01, (zCase0 + zCase1) / 2])
    for (const dx of [-pitch * 0.28, pitch * 0.28]) for (const dz of [-0.12, 0.12]) k.hex('nut', 0.024, 0.014, [xp(i) + dx, top + Hf + 0.027, (zCase0 + zCase1) / 2 + dz])
  }
  for (const x of [xf0 + 0.06, xf1 - 0.06]) k.box(F, [0.03, Hf * 0.8, zCase1 - zCase0 + 0.06], [x, top + Hf * 0.45, (zCase0 + zCase1) / 2])
  k.cyl(F, 0.13, 0.08, [xf1 + 0.04, yc, 0], 'x', 28)
  k.boltCircle('boltXylan', 'nut', 6, 0.1, [xf1 + 0.02, yc, 0], 'x', 0.012, 0.08, [0.07])
  k.cyl('brass', 0.012, 0.06, [xf0 + 0.2, top + Hf + 0.05, zCase0 + 0.1], 'y', 8)
  k.sphere('brass', 0.025, [xf0 + 0.2, top + Hf + 0.09, zCase0 + 0.1], undefined, 10)
  k.cyl('brass', 0.03, 0.012, [xf1 - 0.15, top + Hf * 0.3, zCase0 - 0.006], '-z', 16)
  k.disc('glass', 0.024, [xf1 - 0.15, top + Hf * 0.3, zCase0 - 0.013], '-z', 16)
  for (const sx of [0.15, 0.85]) liftingLug(k, [xf0 + Lf * sx, top + Hf, zCase0 + 0.06], 'x', 0.8, F)

  // crosshead extensions with guarded windows, stuffing boxes, plungers, drip tray
  const Hx = Math.min(Hf * 0.75, 2 * (yc - top) - 0.02)
  const zxm = (zCase1 + zSB) / 2
  const zxl = zSB - zCase1
  k.box(F, [Lf, Hx * 0.35, zxl], [(xf0 + xf1) / 2, yc - Hx / 2 + Hx * 0.175, zxm])
  for (let i = 0; i <= n; i++) k.box(F, [0.04, Hx, zxl], [i === 0 ? xf0 + 0.04 : i === n ? xf1 - 0.04 : xf0 + 0.125 + pitch * i, yc, zxm])
  for (const z of [zCase1 + 0.02, zSB - 0.02]) k.box(F, [Lf, 0.03, 0.04], [(xf0 + xf1) / 2, yc + Hx / 2 - 0.015, z])
  meshPanel(k, Lf - 0.08, zxl - 0.06, [(xf0 + xf1) / 2, yc + Hx / 2 - 0.004, zxm], [0, 1, 0])
  k.box(F, [Lf, 0.03, zxl + 0.02], [(xf0 + xf1) / 2, top + 0.015, zxm])
  for (let i = 0; i < n; i++) {
    k.cyl('stainless', 0.032 + 0.00003 * L.kw, zSB - zCase1 + 0.05, [xp(i), yc, (zCase1 + zSB) / 2], 'z', 14)
    k.cyl(F, pitch * 0.32, 0.12, [xp(i), yc, zSB + 0.06], 'z', 20)
    k.cyl('stainless', pitch * 0.24, 0.03, [xp(i), yc, zSB + 0.015], 'z', 18)
    k.boltCircle('boltXylan', 'nut', 4, pitch * 0.27, [xp(i), yc, zSB - 0.02], 'z', 0.01, 0.06, [0.01], Math.PI / 4)
    k.tube('tubing', [[xp(i), yc + pitch * 0.32, zSB + 0.06], [xp(i), yc + pitch * 0.32 + 0.08, zSB + 0.06], [xf0 - 0.02, yc + pitch * 0.32 + 0.08, zSB]], 0.005)
  }
  k.box('stainless', [Lf, 0.01, zSB - zCase1 + 0.15], [(xf0 + xf1) / 2, top + 0.06, (zCase1 + zSB) / 2 + 0.05])
  // plunger lubricator box
  k.rbox('actuatorBlue', [0.22, 0.18, 0.14], 0.01, [xf0 - 0.05, yc + pitch * 0.32 + 0.12, zSB - 0.05])

  // fluid end: forged block, plunger-bore covers (+Z), discharge valve covers on top, suction covers under
  const xfe0 = xf0 + 0.08
  const xfe1 = xf1 - 0.08
  k.rbox('stainless', [xfe1 - xfe0, hFE, dFE], 0.02, [(xfe0 + xfe1) / 2, yc, zFE])
  for (let i = 0; i < n; i++) {
    const x = xp(i)
    k.cyl('stainless', pitch * 0.3, 0.05, [x, yc, zFE0 + dFE + 0.025], 'z', 24)
    k.cyl('nut', pitch * 0.22, 0.04, [x, yc, zFE0 + dFE + 0.07], 'z', 6)
    for (const sy of [1, -1]) {
      const yv = yc + sy * (hFE / 2 + 0.025)
      k.cyl('stainless', pitch * 0.3, 0.05, [x, yv, zFE], 'y', 24)
      k.boltCircle('boltXylan', 'nut', 6, pitch * 0.24, [x, yv - sy * 0.04, zFE], sy > 0 ? 'y' : '-y', 0.012, 0.09, [0.075])
    }
  }
  // fluid-end tie studs into the frame
  for (const sy of [-1, 1]) for (const xx of [xfe0 + 0.04, xfe1 - 0.04]) k.rod('boltXylan', [xx, yc + sy * hFE * 0.38, zSB], [xx, yc + sy * hFE * 0.38, zFE0 + 0.02], 0.018, 8)

  // suction manifold below, discharge manifold above, risers to every valve
  const sNps = p.suctionNps
  const dNps = p.dischargeNps
  const zM = zFE
  const xm0 = xfe0 - 0.12
  for (let i = 0; i < n; i++) {
    k.pipe('equipmentPaint', [xp(i), ySm, zM], [xp(i), yc - hFE / 2, zM], pipeOD(sNps) * 0.8, 0.008, 20)
    k.pipe('stainless', [xp(i), yc + hFE / 2 + 0.05, zM], [xp(i), yDm, zM], pipeOD(dNps) * 0.9, 0.006, 16)
  }
  k.pipe('equipmentPaint', [xm0, ySm, zM], [xEnd - 0.35, ySm, zM], pipeOD(sNps), 0.008, 28)
  k.dome('equipmentPaint', pipeOD(sNps) / 2, [xm0, ySm, zM], '-x', Math.PI / 2, 0.5, 24)
  flangedBranch(k, 'equipmentPaint', [xEnd - 0.36, ySm, zM], [xEnd + flangeLen(sNps, p.suctionRating), ySm, zM], sNps, p.suctionRating, 'STD')
  k.pipe('stainless', [xm0, yDm, zM], [xEnd - 0.35, yDm, zM], pipeOD(dNps), 0.01, 24)
  k.dome('stainless', pipeOD(dNps) / 2, [xm0, yDm, zM], '-x', Math.PI / 2, 0.5, 20)
  flangedBranch(k, 'stainless', [xEnd - 0.36, yDm, zM], [xEnd + flangeLen(dNps, p.rating), yDm, zM], dNps, p.rating, '80')

  // suction stabiliser (vertical vessel on the suction header) and discharge bladder dampener
  const rSt = clamp(pipeOD(sNps) * 1.4, 0.12, 0.3)
  const xSt = xm0 + 0.05
  const ySt0 = top + 0.05
  k.cyl('equipmentPaint', rSt, ySm - ySt0 + 0.25, [xSt - rSt - 0.05, (ySm + 0.25 + ySt0) / 2, zM], 'y', 32)
  k.dome('equipmentPaint', rSt, [xSt - rSt - 0.05, ySm + 0.25, zM], 'y', Math.PI / 2, 0.5, 32)
  k.pipe('equipmentPaint', [xSt - 0.06, ySm, zM], [xm0 + 0.02, ySm, zM], pipeOD(sNps) * 0.8, 0.008, 20)
  gauge(k, [xSt - rSt - 0.05, ySm + 0.25 + rSt * 0.5 + 0.08, zM], 'z', 0.08, 'bar', 10)
  const rDp = clamp(0.1 + 0.00012 * L.kw, 0.12, 0.3)
  const xDp = (xfe0 + xfe1) / 2
  k.pipe('stainless', [xDp, yDm, zM], [xDp, yDm + 0.18, zM], pipeOD(dNps) * 0.8, 0.008, 16)
  k.sphere('stainless', rDp, [xDp, yDm + 0.18 + rDp * 0.9, zM], undefined, 28)
  k.cyl('stainless', rDp * 0.45, 0.04, [xDp, yDm + 0.18 + rDp * 0.05, zM], 'y', 20)
  k.cyl('brass', 0.02, 0.06, [xDp, yDm + 0.18 + rDp * 1.9, zM], 'y', 10)
  gauge(k, [xDp + rDp + 0.06, yDm + 0.18 + rDp, zM], 'z', 0.08, 'bar', 400)
  k.rod('stainless', [xDp + rDp * 0.7, yDm + 0.18 + rDp, zM], [xDp + rDp + 0.06, yDm + 0.18 + rDp, zM - 0.02], 0.006, 8)
  // discharge relief valve back to suction
  const xRv = xEnd - 0.55
  k.pipe('stainless', [xRv, yDm, zM], [xRv, yDm + 0.15, zM], 0.06, 0.006, 14)
  k.cyl('actuatorRed', 0.05, 0.12, [xRv, yDm + 0.2, zM], 'y', 16)
  k.cyl('actuatorRed', 0.03, 0.2, [xRv, yDm + 0.36, zM], 'y', 14)
  pipeRun(k, [[xRv, yDm + 0.2, zM], [xRv, yDm + 0.2, zM + dFE / 2 + 0.16], [xRv, ySm, zM + dFE / 2 + 0.16], [xRv, ySm, zM + pipeOD(sNps) / 2 - 0.004]], 1, { mat: 'stainless' })

  // gear reducer (parallel shaft, input at motor height, output on the crank)
  const gbH = Math.max(yc, ym) - top + 0.25
  const gbW = 0.5
  k.rbox(F, [0.5, gbH, gbW], 0.04, [xGb, top + gbH / 2, 0])
  for (const dz of [-gbW / 2 - 0.01, gbW / 2 + 0.01]) for (let i = 0; i < 3; i++) k.box(F, [0.02, gbH * 0.8, 0.02], [xGb - 0.15 + i * 0.15, top + gbH * 0.45, dz])
  k.box(F, [0.54, 0.03, gbW + 0.06], [xGb, top + gbH * 0.62, 0])
  k.cyl(F, 0.08, 0.08, [xGb - 0.29, ym, 0], 'x', 20)
  k.cyl('flangeSteel', Math.max(0.025, L.m.shaftDia * 0.55), 0.12, [xSE + 0.06, ym, 0], 'x', 14)
  k.cyl(F, 0.11, 0.06, [xGb + 0.28, yc, 0], 'x', 24)
  k.cyl('brass', 0.012, 0.05, [xGb, top + gbH + 0.025, 0.1], 'y', 8)
  k.box('nameplate', [0.12, 0.07, 0.003], [xGb, top + gbH * 0.4, gbW / 2 + 0.022])
  for (const s of [-1, 1]) k.box(F, [0.6, 0.03, 0.12], [xGb, top + 0.015, s * (gbW / 2 + 0.03)])

  // motor + guarded coupling
  const Rm = L.m.R
  const Lm = L.m.L
  k.at([xm, ym, 0], undefined, () => motor(k, { R: Rm, L: Lm, H: ym - top, tbox: 'side', cable: true }))
  tagPlate(k, `${L.m.frame} ${p.kw} kW`, [xm - Lm * 0.62, ym + Rm * 0.62, Rm * 0.82], [0, 0.5, 0.87], Math.max(0.1, Rm * 0.45))
  for (const fx of [xm - Lm * 0.82, xm - Lm * 0.18]) for (const s of [-1, 1]) mountPad(k, fx, top, s * Rm * 0.78, 0.22, 0.2, 1, 'structSteel')
  const rsh = Math.max(0.025, L.m.shaftDia * 0.55)
  rotors.push(guardedCoupling(k, xMS - 0.02, xSE + 0.04, ym, Math.max(0.15, rsh * 4.2), top, 'safetyYellow', 160, 0, rsh))
  rotors.push(cowlFan(Rm, Lm, 160, [xm, ym, 0]))
}
