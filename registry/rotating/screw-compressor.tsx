// Oil-injected screw compressor package (API 619 / ISO 1217): twin-rotor block, TEFC motor, horizontal oil separator, combined oil / aftercooler, filters, control panel, optional acoustic enclosure.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, mat4, uvScale, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { flange, gauge, motor, motorSize, saddle, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, cowlFan, fanRotor, guardedCoupling, type RotorSpec } from '../lib/rotors'
import { fanGuardMaterial, lcdMaterial, louvreMaterial, signMaterial } from '../lib/textures'
import { elbow90, pipeOD, type Rating } from '../lib/standards'
import { OIL, SKID, annulus, clamp, faceQ, lineRun, louvre, neckTo, runToFlange } from './_compressors-kit'

export interface ScrewCompressorProps {
  /** motor rated power, kW */
  kw?: number
  service?: 'air' | 'gas'
  enclosure?: boolean
  /** swing the front enclosure doors open */
  doorsOpen?: boolean
  inletNps?: number
  outletNps?: number
  rating?: Rating
  tag?: string
  running?: boolean
}

export const defaults = {
  kw: 250,
  service: 'air' as 'air' | 'gas',
  enclosure: true,
  doorsOpen: false,
  inletNps: 6,
  outletNps: 3,
  rating: 300 as Rating,
  tag: 'K-4600',
  running: true,
}

type P = typeof defaults

function layout(p: P) {
  const kw = clamp(p.kw, 30, 1500)
  const ms = motorSize(Math.min(kw, 1000), 2)
  const Rr = clamp(0.1 + kw * 0.0003, 0.12, 0.42) // rotor housing radius, typical
  const Lb = Rr * 5.2
  const cowl = Math.max(0.12, ms.R * 0.6)
  const Ds = clamp(0.45 + kw / 1400, 0.5, 1.3)
  const Hcool = clamp(0.9 + kw / 700, 1.0, 2.4)
  const hs = 0.208
  const ys = hs + Math.max(ms.H + 0.12, Rr * 1.4 + 0.35)
  // stations from the -X end
  const xmL = 0.25
  const xm = xmL + cowl + ms.L
  const xc0 = xm + 0.12 + ms.R * 0.2
  const xc1 = xc0 + 0.3
  const xb0 = xc1 + 0.15
  const xb1 = xb0 + Lb
  const xcool = xb1 + 0.7 + Rr
  const SL = xcool + 0.5
  const shift = -SL / 2
  const S = (x: number) => x + shift
  const trainHalf = Math.max(ms.R + 0.25, 2.6 * Rr + 0.15)
  const SW = Math.max(1.6, 2 * trainHalf + Ds + 0.7)
  const zt = SW / 2 - trainHalf - 0.1
  const zs = -SW / 2 + Ds / 2 + 0.2
  const ysep = hs + Ds / 2 + 0.35
  const blockTop = ys + Rr * 1.3
  const Hc = Math.max(hs + Hcool + 0.55, ysep + Ds / 2 + 0.75, blockTop + 0.75, ys + ms.R + 0.6) + 0.15
  const yIn = p.enclosure ? Hc + 0.35 : blockTop + 0.85
  const xi = S(xb0 + Lb * 0.3)
  const yOut = hs + 0.45
  const xo = S(xcool - 0.45)
  return { kw, ms, Rr, Lb, cowl, Ds, Hcool, hs, ys, xmL: S(xmL), xm: S(xm), xc0: S(xc0), xc1: S(xc1), xb0: S(xb0), xb1: S(xb1), xcool: S(xcool), SL, SW, zt, zs, ysep, blockTop, Hc, yIn, xi, yOut, xo }
}

export function ports(props: ScrewCompressorProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  const air = p.service === 'air'
  return [
    port('inlet', air ? 'Air intake' : 'Gas inlet', [L.xi, L.yIn, L.zt], [0, 1, 0], p.inletNps, p.rating, air ? 'vent' : 'process'),
    port('outlet', air ? 'Compressed air outlet' : 'Gas outlet', [L.xo, L.yOut, -L.SW / 2 - 0.2], [0, 0, -1], p.outletNps, p.rating),
  ]
}

export function ScrewCompressor(props: ScrewCompressorProps & GroupProps) {
  const { kw, service, enclosure, doorsOpen, inletNps, outletNps, rating, tag, running, ...group } = { ...defaults, ...props }
  const { built, rotors } = useMemo(() => build({ kw, service, enclosure, doorsOpen, inletNps, outletNps, rating, tag, running }), [kw, service, enclosure, doorsOpen, inletNps, outletNps, rating, tag, running])
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default ScrewCompressor

const BLOCK: MatKey = 'equipmentPaintDark'
const VESSEL: MatKey = 'equipmentPaint'

function build(p: P) {
  const k = new Kit()
  const L = layout(p)
  const { Rr, Lb, hs, ys, zt, zs, Ds, ysep, SL, SW, ms } = L
  const rotors: RotorSpec[] = []
  skid(k, SL, SW, 'HEB 200', SKID)

  // motor on a pedestal, coupling under its guard
  const ped = ys - ms.H - hs
  k.box(SKID, [ms.L + 0.1, ped, ms.R * 2 + 0.2], [L.xm - ms.L / 2, hs + ped / 2, zt])
  k.at([L.xm, ys, zt], undefined, () => motor(k, { R: ms.R, L: ms.L, H: ms.H, tbox: 'side', cable: true }))
  rotors.push(cowlFan(ms.R, ms.L, 300, [L.xm, ys, zt]))
  rotors.push(guardedCoupling(k, L.xc0, L.xc1, ys, Math.max(0.14, Rr * 0.8), hs, 'safetyYellow', 300, zt, Math.max(0.03, ms.shaftDia / 2)))

  // twin-rotor block: male rotor on the drive shaft, female alongside (+Z), cast ribs, end covers, feet
  const xbm = (L.xb0 + L.xb1) / 2
  const zf = zt + 1.5 * Rr
  k.cyl(BLOCK, Rr * 1.15, Lb, [xbm, ys, zt], 'x', 40)
  k.cyl(BLOCK, Rr, Lb, [xbm, ys, zf], 'x', 40)
  k.box(BLOCK, [Lb, Rr * 1.7, 1.5 * Rr], [xbm, ys, (zt + zf) / 2])
  for (let i = 1; i < 5; i++) {
    const x = L.xb0 + (i * Lb) / 5
    k.cyl(BLOCK, Rr * 1.2, 0.035, [x, ys, zt], 'x', 40)
    k.cyl(BLOCK, Rr * 1.05, 0.035, [x, ys, zf], 'x', 40)
  }
  for (const [x, d] of [[L.xb0, -1], [L.xb1, 1]] as const) {
    k.rbox(BLOCK, [0.1, Rr * 2.6, 2.9 * Rr], 0.03, [x + d * 0.05, ys, (zt + zf) / 2])
    k.boltCircle('boltXylan', 'nut', 10, Rr * 0.95, [x + d * 0.06, ys, zt], d > 0 ? 'x' : '-x', 0.014, 0.06, [0.05])
    k.boltCircle('boltXylan', 'nut', 8, Rr * 0.85, [x + d * 0.06, ys, zf], d > 0 ? 'x' : '-x', 0.014, 0.06, [0.05])
  }
  k.dome(BLOCK, Rr * 0.6, [L.xb1 + 0.1, ys, zt], 'x', Math.PI / 2, 0.5, 24)
  k.dome(BLOCK, Rr * 0.55, [L.xb1 + 0.1, ys, zf], 'x', Math.PI / 2, 0.5, 24)
  k.cyl(BLOCK, Rr * 0.5, 0.15, [L.xb0 - 0.075, ys, zt], 'x', 24)
  for (const x of [L.xb0 + Lb * 0.15, L.xb1 - Lb * 0.15]) {
    k.box(BLOCK, [0.14, ys - Rr * 0.8 - hs, Rr * 2.8], [x, (ys - Rr * 0.8 + hs) / 2, (zt + zf) / 2])
    k.box(SKID, [0.25, 0.02, Rr * 3.1], [x, hs + 0.01, (zt + zf) / 2])
  }
  k.box('nameplate', [0.22, 0.14, 0.006], [xbm, ys, zf + Rr + 0.003])
  // inlet: boss, unloader / inlet valve with actuator, riser to the inlet flange
  const iN = p.inletNps
  const iOD = pipeOD(iN)
  k.cyl(BLOCK, iOD * 0.7, Rr * 0.4, [L.xi, ys + Rr * 1.05, zt], 'y', 24)
  const yv = L.blockTop + 0.12
  k.cyl('valveBody', iOD * 0.85, 0.12, [L.xi, yv, zt], 'y', 28)
  k.rbox('actuatorYellow', [0.2, 0.16, 0.16], 0.02, [L.xi, yv, zt - iOD * 0.85 - 0.12])
  k.cyl('actuatorYellow', 0.06, 0.3, [L.xi + 0.18, yv, zt - iOD * 0.85 - 0.12], 'x', 14)
  neckTo(k, [L.xi, yv + 0.06, zt], [L.xi, L.yIn, zt], [0, 1, 0], iN, p.rating, 'pipePaint')
  if (p.service === 'air') {
    // intake filter housing on the riser: body ring, bolted cover band, restriction indicator
    const fy = Math.min(yv + 0.45, (yv + L.yIn) / 2)
    annulus(k, 'motorPaint', iOD / 2, iOD * 1.45, 0.42, [L.xi, fy, zt], 'y', 32)
    for (const dy of [-0.19, 0.19]) annulus(k, 'flangeSteel', iOD * 1.45, iOD * 1.5, 0.03, [L.xi, fy + dy, zt], 'y', 32)
    k.cyl('actuatorYellow', 0.025, 0.06, [L.xi + iOD * 1.45 + 0.03, fy + 0.1, zt], 'x', 12)
    k.disc('glass', 0.02, [L.xi + iOD * 1.45 + 0.061, fy + 0.1, zt], 'x', 12)
  }
  if (p.enclosure) k.box(SKID, [iOD + 0.12, 0.04, iOD + 0.12], [L.xi, L.Hc + 0.06, zt])

  // horizontal oil separator on saddles: element cover at +X, PSV and minimum pressure valve on top, sight glass
  const Ls = Math.max(1.4, L.xb1 - L.xm + 0.2)
  const xs = (L.xm + L.xb1) / 2 - 0.1
  const hd = Ds / 4
  const prof: [number, number][] = [[0, -Ls / 2 - hd]]
  for (let i = 1; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2)
    prof.push([(Ds / 2) * Math.sin(t), -Ls / 2 - hd * Math.cos(t)])
  }
  prof.push([Ds / 2, Ls / 2], [Ds / 2 + 0.06, Ls / 2], [Ds / 2 + 0.06, Ls / 2 + 0.08], [0, Ls / 2 + 0.08])
  k.lathe(VESSEL, prof, [xs, ysep, zs], 'x', 40)
  k.boltCircle('boltXylan', 'nut', 16, Ds / 2 + 0.03, [xs + Ls / 2 - 0.04, ysep, zs], 'x', 0.016, 0.16, [0.03, 0.13])
  k.torus('nut', 0.05, 0.012, [xs + Ls / 2 + 0.1, ysep, zs], 'x', 6, 14)
  k.at([xs, ysep, zs], undefined, () => {
    saddle(k, -Ls * 0.32, Ds / 2, -(ysep), { mat: VESSEL })
    saddle(k, Ls * 0.32, Ds / 2, -(ysep), { mat: VESSEL, sliding: true })
  })
  k.cyl('brass', 0.035, 0.02, [xs - Ls * 0.1, ysep - Ds * 0.15, zs + Ds / 2], 'z', 14)
  k.box('glass', [0.05, Ds * 0.35, 0.012], [xs + Ls * 0.05, ysep - Ds * 0.1, zs + Ds / 2 + 0.006])
  tagPlate(k, 'OIL SEPARATOR', [xs - Ls * 0.25, ysep + Ds * 0.15, zs + Ds * 0.49], 'z', 0.24)
  const yST = ysep + Ds / 2
  k.rod(VESSEL, [xs - Ls * 0.3, yST - 0.02, zs], [xs - Ls * 0.3, yST + 0.12, zs], pipeOD(1) / 2, 10)
  k.cyl('actuatorRed', 0.04, 0.2, [xs - Ls * 0.3, yST + 0.22, zs], 'y', 14)
  k.cyl('actuatorRed', 0.025, 0.12, [xs - Ls * 0.3, yST + 0.38, zs], 'y', 10)
  gauge(k, [xs, yST + 0.2, zs + 0.06], 'z', 0.1, 'bar', 16)
  k.rod('stainless', [xs, yST - 0.02, zs], [xs, yST + 0.2, zs], 0.008, 8)
  // discharge: block bottom to the separator inlet
  const dN = Math.max(p.outletNps, 2)
  const xd = L.xb1 - Lb * 0.25
  k.cyl(BLOCK, pipeOD(dN) * 0.7, Rr * 0.3, [xd, ys - Rr * 1.05, zt], 'y', 20)
  lineRun(k, [[xd, ys - Rr * 1.1, zt], [xd, ysep, zt], [xd, ysep, zs + Ds / 2 - 0.02]], dN, 'pipePaint')
  // minimum pressure valve and line to the aftercooler
  const xmpv = xs + Ls * 0.3
  k.rod(VESSEL, [xmpv, yST - 0.02, zs], [xmpv, yST + 0.1, zs], pipeOD(dN) / 2, 14)
  k.rbox('valveBody', [0.16, 0.14, 0.16], 0.02, [xmpv, yST + 0.17, zs])
  const yAir = Math.min(hs + L.Hcool, yST + 0.42)
  lineRun(k, [[xmpv, yST + 0.24, zs], [xmpv, yAir, zs], [L.xcool - 0.2, yAir, zs]], dN, 'pipePaint')

  // combined cooler at the +X end: oil section below, aftercooler above, fan shroud on the -X side
  const Wc = SW - 0.3
  const yc0 = hs + 0.1
  const Hc = L.Hcool
  const xcl = L.xcool
  k.box('aluminium', [0.22, Hc, Wc - 0.12], [xcl, yc0 + Hc / 2, 0])
  // finned core face: fine fin pitch via the louvre texture tiled every ~25 mm
  const core = new THREE.PlaneGeometry(Wc - 0.16, Hc - 0.04)
  uvScale(core, 1, (Hc - 0.04) / 0.025)
  k.add(louvreMaterial('#9aa1a6'), core, mat4([xcl + 0.112, yc0 + Hc / 2, 0], faceQ('x')))
  for (const s of [-1, 1]) k.box(SKID, [0.26, Hc + 0.06, 0.06], [xcl, yc0 + Hc / 2, s * (Wc / 2 - 0.03)])
  k.box(SKID, [0.26, 0.05, Wc], [xcl, yc0 + Hc * 0.42, 0])
  k.box(SKID, [0.26, 0.06, Wc], [xcl, yc0 + Hc + 0.03, 0])
  for (const s of [-1, 1]) k.box(SKID, [0.3, yc0 - hs, 0.12], [xcl, (yc0 + hs) / 2, s * (Wc / 2 - 0.1)])
  const fr = Math.min(Hc, Wc) * 0.42
  const yfan = yc0 + Hc / 2
  k.lathe(SKID, [[fr + 0.05, 0], [fr + 0.02, 0.25], [fr * 1.25, 0.32], [fr * 1.25, 0.34], [fr + 0.01, 0.34]], [xcl - 0.45, yfan, 0], 'x', 40)
  k.box(SKID, [0.02, Hc * 0.98, Wc * 0.9], [xcl - 0.12, yfan, 0])
  k.disc(fanGuardMaterial(), fr + 0.03, [xcl - 0.46, yfan, 0], '-x', 32)
  k.cyl('motorPaint', fr * 0.22, 0.28, [xcl - 0.62, yfan, 0], 'x', 20)
  for (const s of [-1, 1]) k.rod(SKID, [xcl - 0.52, yfan, 0], [xcl - 0.46, yfan + s * fr, 0], 0.012, 6)
  rotors.push(fanRotor('aluminium', fr * 0.94, [xcl - 0.33, yfan, 0], 'x', 600, { blades: 7, chord: fr * 0.3, pitch: 0.35, hub: fr * 0.2, hubLen: 0.08 }))
  // aftercooler outlet header to the outlet flange (-Z), moisture separator drain
  const oN = p.outletNps
  k.cyl(SKID, pipeOD(oN) * 0.8, Hc * 0.5, [xcl - 0.16, yc0 + Hc * 0.72, -Wc / 2 + 0.12], 'y', 16)
  runToFlange(k, [[xcl - 0.16, yc0 + Hc * 0.5, -Wc / 2 + 0.12], [xcl - 0.16, L.yOut, -Wc / 2 + 0.12], [L.xo, L.yOut, -Wc / 2 + 0.12]], [L.xo, L.yOut, -SW / 2 - 0.2], [0, 0, -1], oN, p.rating)
  void elbow90
  // oil circuit: separator sump -> thermostatic valve -> oil cooler -> duplex filters -> injection
  const yOil = hs + 0.18
  k.rbox('valveBody', [0.16, 0.16, 0.16], 0.02, [xs + Ls * 0.42, yOil + 0.02, zs + Ds * 0.3])
  lineRun(k, [[xs + Ls * 0.42, ysep - Ds / 2 + 0.02, zs], [xs + Ls * 0.42, yOil, zs], [xs + Ls * 0.42, yOil, zs + Ds * 0.3], [xcl - 0.16, yOil, zs + Ds * 0.3], [xcl - 0.16, yc0 + 0.15, zs + Ds * 0.3]], 1.5, OIL)
  const xfl = L.xb1 + 0.3
  for (const s of [-1, 1]) {
    k.cyl(OIL, 0.07, 0.32, [xfl, hs + 0.55, zt + s * 0.1], 'y', 18)
    k.cyl(OIL, 0.08, 0.04, [xfl, hs + 0.73, zt + s * 0.1], 'y', 18)
  }
  k.rbox(OIL, [0.12, 0.08, 0.36], 0.01, [xfl, hs + 0.79, zt])
  k.rod(SKID, [xfl, hs, zt], [xfl, hs + 0.39, zt], 0.03, 8)
  lineRun(k, [[xcl - 0.16, yc0 + 0.3, zt], [xfl + 0.15, yc0 + 0.3, zt], [xfl + 0.15, hs + 0.79, zt], [xfl + 0.06, hs + 0.79, zt]], 1.5, OIL)
  lineRun(k, [[xfl, hs + 0.83, zt], [xfl, ys + Rr * 1.3, zt], [L.xb1 - Lb * 0.4, ys + Rr * 1.3, zt], [L.xb1 - Lb * 0.4, ys + Rr * 0.95, zt]], 1, OIL)
  gauge(k, [xfl, hs + 1.0, zt + 0.06], 'z', 0.09, 'bar', 16)

  if (!p.enclosure) {
    // free-standing control panel with HMI at the -X front corner
    const px = L.xmL + 0.35
    const pz = SW / 2 - 0.3
    k.box('stainless', [0.6, 1.3, 0.3], [px, hs + 0.2 + 0.65, pz])
    k.box(SKID, [0.5, 0.2, 0.25], [px, hs + 0.1, pz])
    k.plane(lcdMaterial(), 0.3, 0.2, [px, hs + 1.15, pz + 0.151])
    k.cyl('actuatorRed', 0.025, 0.03, [px + 0.2, hs + 0.9, pz + 0.16], 'z', 16)
    k.plane(signMaterial('ler', p.tag), 0.5, 0.1, [px, hs + 1.42, pz + 0.151])
    return { built: k.build(), rotors }
  }

  // acoustic enclosure: framed panels with seams and handles, intake louvres, cooler discharge grille, HMI door
  const H = L.Hc
  const ex0 = -SL / 2 + 0.04
  const ex1 = SL / 2 - 0.04
  const ez = SW / 2 - 0.04
  const t = 0.05
  const PANEL: MatKey = 'cladding'
  const TRIM: MatKey = 'motorPaint'
  const wallH = H - hs
  const yw = hs + wallH / 2
  const EL = ex1 - ex0
  const zm = 0
  const iz = (z: number, w: number, x: number) => k.box(PANEL, [w, wallH, t], [x, yw, z])
  // -Z wall with the outlet penetration
  iz(-ez + t / 2, EL, (ex0 + ex1) / 2)
  k.box(TRIM, [0.3, 0.3, 0.02], [L.xo, L.yOut, -ez - 0.01])
  // +Z front: panels, HMI, intake louvres
  // front wall: door pair in the middle (swung open on request), HMI panel on the solid part
  const d0 = ex0 + EL * 0.38
  const d1 = ex0 + EL * 0.86
  iz(ez - t / 2, d0 - ex0, (ex0 + d0) / 2)
  iz(ez - t / 2, ex1 - d1, (d1 + ex1) / 2)
  const dlw = (d1 - d0) / 2
  const op = p.doorsOpen ? 1.75 : 0
  for (const [hx, sgn] of [[d0, 1], [d1, -1]] as const) {
    const m = new THREE.Matrix4().makeTranslation(hx, 0, ez).multiply(new THREE.Matrix4().makeRotationY(-sgn * op)).multiply(new THREE.Matrix4().makeTranslation(-hx, 0, -ez))
    k.with(m, () => {
      k.box(PANEL, [dlw - 0.01, wallH - 0.02, t], [hx + sgn * dlw / 2, yw, ez - t / 2])
      k.box(TRIM, [0.04, wallH - 0.02, 0.015], [hx + sgn * (dlw - 0.02), yw, ez + 0.006])
      for (const yy of [hs + wallH * 0.3, hs + wallH * 0.75]) k.box('stainless', [0.12, 0.025, 0.03], [hx + sgn * (dlw - 0.12), yy, ez + 0.02])
    })
    for (const yy of [hs + 0.3, hs + wallH - 0.3]) k.cyl(TRIM, 0.015, 0.1, [hx, yy, ez + 0.01], 'y', 8)
  }
  k.box(PANEL, [t, wallH, 2 * ez], [ex0 + t / 2, yw, zm])
  k.box(PANEL, [t, wallH * 0.12, 2 * ez], [ex1 - t / 2, H - wallH * 0.06, zm])
  k.box(PANEL, [t, 0.08, 2 * ez], [ex1 - t / 2, hs + 0.04, zm])
  k.box(PANEL, [EL + 0.04, 0.06, 2 * ez + 0.04], [(ex0 + ex1) / 2, H + 0.03, zm])
  const np = Math.max(3, Math.round(EL / 0.9))
  for (let i = 0; i <= np; i++) {
    const x = ex0 + (i * EL) / np
    for (const s of [-1, 1]) if (s < 0 || x < d0 - 0.03 || x > d1 + 0.03) k.box(TRIM, [0.04, wallH, 0.015], [x, yw, s * (ez + 0.006)])
    k.box(TRIM, [0.04, 0.02, 2 * ez], [x, H + 0.07, zm])
    if (i < np) {
      const xc = x + EL / np / 2
      for (const s of [-1, 1]) for (const yy of [hs + wallH * 0.3, hs + wallH * 0.75]) if (s < 0 || xc + EL / np * 0.32 < d0 || xc + EL / np * 0.32 > d1) k.box('stainless', [0.12, 0.025, 0.03], [xc + EL / np * 0.32, yy, s * (ez + 0.02)])
    }
  }
  for (const s of [-1, 1]) {
    k.box(TRIM, [EL + 0.04, 0.08, 0.03], [(ex0 + ex1) / 2, hs + 0.04, s * (ez + 0.01)])
    k.box(TRIM, [EL + 0.04, 0.06, 0.03], [(ex0 + ex1) / 2, H - 0.03, s * (ez + 0.01)])
  }
  // intake louvres low on both long sides near the motor
  const lw = Math.min(1.2, EL * 0.3)
  k.at([ex0 + 0.25 + lw / 2, hs, ez], faceQ('z'), () => louvre(k, lw, wallH * 0.3, 0, wallH * 0.25, TRIM))
  k.at([ex0 + 0.25 + lw / 2, hs, -ez], faceQ('-z'), () => louvre(k, lw, wallH * 0.3, 0, wallH * 0.25, TRIM))
  // cooling-air discharge grille over the cooler face (+X end)
  k.at([ex1, hs, 0], faceQ('x'), () => louvre(k, 2 * ez - 0.2, wallH * 0.76 - 0.12, 0, wallH * 0.12 + 0.06 + (wallH * 0.76 - 0.12) / 2 + 0.02, TRIM))
  // HMI and emergency stop on the front, warning and tag signs
  const hx = ex0 + 0.6
  k.rbox('stainless', [0.5, 0.42, 0.06], 0.02, [hx, hs + 1.2, ez + 0.03])
  k.plane(lcdMaterial(), 0.32, 0.22, [hx, hs + 1.24, ez + 0.061])
  k.cyl('actuatorYellow', 0.04, 0.01, [hx + 0.17, hs + 1.08, ez + 0.065], 'z', 18)
  k.cyl('actuatorRed', 0.025, 0.035, [hx + 0.17, hs + 1.08, ez + 0.08], 'z', 16)
  k.plane(signMaterial('ler', `${p.tag}  ${p.service === 'air' ? 'INSTRUMENT AIR' : 'GAS BOOST'} COMPRESSOR`), Math.min(1.4, d0 - ex0 - 0.2), 0.2, [(ex0 + d0) / 2, H - 0.3, ez + 0.012])
  tagPlate(k, p.tag, [hx, hs + 0.85, ez + 0.012], 'z', 0.2)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.torus('nut', 0.05, 0.014, [sx * (EL / 2 - 0.2), H + 0.12, sz * (ez - 0.2)], 'z', 6, 14)
  void ([] as V3[])
  void flange
  return { built: k.build(), rotors }
}
