// Chemical injection package: bunded skid, stainless storage tank, N diaphragm metering pumps with PSVs, dampeners, calibration pot and local panel. API 675, ASME B31.3.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, eul, mat4, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { gauge, junctionBox, motor, motorSize, pipeRun, skid, tagPlate, weldCap } from '../lib/parts'
import { paint } from '../lib/materials'
import { port, type Port } from '../lib/ports'
import { Rotors, cowlFan, type RotorSpec } from '../lib/rotors'
import { SECTIONS, flange as flangeDims, headDepth, pipeOD, shellThickness, type Rating } from '../lib/standards'
import { levelFlagMaterial, textMaterial } from '../lib/textures'
import { addv, blFlange, cableTray, dripPan, earthBoss, gaugeTap, localPanel, pipeSupport, smallPsv, padeyeShackles, reliefBody, smallValve, spoolJoint, transmitter, valve, valveSpan, vVessel, vesselLegs } from './_skid'

export interface ChemicalInjectionSkidProps {
  /** metering pumps, one per injection point */
  pumps?: number
  /** storage tank inside diameter, m */
  tankDiameter?: number
  /** storage tank tangent-to-tangent height, m */
  tankHeight?: number
  /** metering pump motor, kW */
  kw?: number
  fillNps?: number
  outletNps?: number
  /** injection outlet class (process side) */
  outletRating?: Rating
  chemical?: string
  canopy?: boolean
  tag?: string
  running?: boolean
}

export const defaults = {
  pumps: 3,
  tankDiameter: 1.0,
  tankHeight: 1.4,
  kw: 0.75,
  fillNps: 2,
  outletNps: 0.5,
  outletRating: 1500 as Rating,
  chemical: 'CORROSION INHIBITOR',
  canopy: false,
  tag: 'X-1700',
  running: true,
}

type P = typeof defaults

const SKID = 'HEB 160'
const TANK: MatKey = paint('#c4c9cd', { metalness: 0.55, roughness: 0.38, clearcoat: 0, weather: 0.3 })
const SS: MatKey = 'stainless'

function layout(p: P) {
  const N = Math.max(1, Math.min(6, Math.round(p.pumps)))
  const D = p.tankDiameter
  const wall = shellThickness(1, D)
  const Ro = D / 2 + wall
  const hd = headDepth('2:1-ellipsoidal', D) + wall
  const pitch = 0.62
  const W = Math.max(1.9, D + 0.9)
  const xl = 0.25 + Ro // tank centre from the left edge
  const xs = xl + Ro + 0.8 // first pump
  const xLast = xs + pitch * (N - 1)
  const xPanel = xLast + 0.8
  const L = xPanel + 0.45
  const sh = -L / 2
  const y0 = SECTIONS[SKID].d + 0.008
  const zp = W / 2 - 0.55 // pump frame origin (shaft centre line crosses here)
  const zLE = zp - 0.23 // liquid-end centre
  const ypd = y0 + 0.3 // pump pedestal top
  const ms = motorSize(p.kw, 4)
  const H = Math.max(ms.H, ms.R * 1.2)
  const yb = ypd + H // shaft height
  const yh = y0 + 1.35 // discharge rack
  const yr = y0 + 1.62 // relief return header
  const ys = y0 + 0.14 // suction header
  const zt = -W / 2 + 0.25 + Ro
  const yTL = y0 + 0.32 + hd
  const tt = p.tankHeight
  const rack = Array.from({ length: N }, (_, i) => zLE - 0.2 - i * 0.15)
  const pumpX = Array.from({ length: N }, (_, i) => sh + xs + pitch * i)
  return { N, D, Ro, hd, wall, W, L, xt: sh + xl, xs: sh + xs, xLast: sh + xLast, xPanel: sh + xPanel, y0, zp, zLE, ypd, ms, H, yb, yh, yr, ys, zt, yTL, tt, rack, pumpX, yFill: y0 + 0.95 }
}

export function ports(props: ChemicalInjectionSkidProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  const out = [port('fill', 'Chemical fill', [-g.L / 2 - 0.02, g.yFill, g.zt], [-1, 0, 0], p.fillNps, 150, 'utility')]
  for (let i = 0; i < g.N; i++) out.push(port(`outlet-${i + 1}`, `Injection outlet ${i + 1}`, [g.L / 2 + 0.02, g.yh, g.rack[i]], [1, 0, 0], p.outletNps, p.outletRating, 'utility'))
  return out
}

export function ChemicalInjectionSkid(props: ChemicalInjectionSkidProps & GroupProps) {
  const { pumps, tankDiameter, tankHeight, kw, fillNps, outletNps, outletRating, chemical, canopy, tag, running, ...group } = { ...defaults, ...props }
  const p = { pumps, tankDiameter, tankHeight, kw, fillNps, outletNps, outletRating, chemical, canopy, tag, running }
  const { built, rotors } = useMemo(() => build(p), [pumps, tankDiameter, tankHeight, kw, fillNps, outletNps, outletRating, chemical, canopy, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default ChemicalInjectionSkid

function build(p: P) {
  const k = new Kit()
  const g = layout(p)
  const { L, W, y0, Ro, xt, zt, yTL, tt, zLE, zp, yb, yh, yr, ys } = g
  const d05 = pipeOD(0.5)
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)

  // bund upstand inside the skid rim, bund drain
  const bh = 0.15
  for (const s of [-1, 1]) {
    k.box('equipmentPaintDark', [L - 0.03, bh, 0.006], [0, y0 + bh / 2, s * (W / 2 - 0.016)])
    k.box('equipmentPaintDark', [0.006, bh, W - 0.03], [s * (L / 2 - 0.016), y0 + bh / 2, 0])
  }
  smallValve(k, 'ball', [L / 2 + 0.06, y0 + 0.03, -W / 2 + 0.3], [1, 0, 0], 0.012)
  k.rod(SS, [L / 2 - 0.02, y0 + 0.03, -W / 2 + 0.3], [L / 2 + 0.1, y0 + 0.03, -W / 2 + 0.3], 0.012, 10)
  tagPlate(k, p.tag, [-L / 2 + 0.7, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.3)
  earthBoss(k, [L / 2 - 0.4, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])

  // ---------------------------------------------------------------- storage tank
  const T = vVessel(k, xt, zt, yTL, g.D, tt, g.wall, TANK)
  vesselLegs(k, xt, zt, Ro, yTL + 0.05, y0, 4, SS)
  const headY = (r: number) => yTL + tt + (T.hd - g.wall * 0) * Math.sqrt(Math.max(0, 1 - (r / Ro) ** 2))
  // top manway (18", bolted cover with lifting handle)
  const mx = xt - Ro * 0.15
  const mz = zt - Ro * 0.25
  const mR = 0.24
  const my = headY(Math.hypot(mx - xt, mz - zt)) + 0.12
  k.cyl(TANK, mR, 0.22, [mx, my - 0.11, mz], 'y', 32)
  k.cyl(SS, mR + 0.04, 0.025, [mx, my, mz], 'y', 32)
  k.cyl(SS, mR + 0.04, 0.02, [mx, my + 0.0225, mz], 'y', 32)
  k.around(16, mR + 0.02, [mx, my + 0.04, mz], 'y', (q) => k.hex('nut', 0.022, 0.012, q))
  k.torus(SS, 0.06, 0.008, [mx, my + 0.033, mz], 'x', 6, 14, Math.PI)
  // breather vent: gooseneck with flame arrestor
  const vx = xt + Ro * 0.45
  const vz = zt - Ro * 0.3
  const vy0 = headY(Math.hypot(vx - xt, vz - zt)) - 0.02
  k.cyl(SS, 0.03, 0.22, [vx, vy0 + 0.11, vz], 'y', 14)
  k.cyl('flangeSteel', 0.07, 0.04, [vx, vy0 + 0.24, vz], 'y', 20)
  k.cyl('flangeSteel', 0.06, 0.12, [vx, vy0 + 0.32, vz], 'y', 20)
  k.cyl('flangeSteel', 0.07, 0.04, [vx, vy0 + 0.4, vz], 'y', 20)
  k.tube(SS, [[vx, vy0 + 0.42, vz], [vx, vy0 + 0.56, vz], [vx, vy0 + 0.56, vz - 0.16], [vx, vy0 + 0.46, vz - 0.16]], 0.03, 12, 0.07)
  k.cyl(SS, 0.045, 0.05, [vx, vy0 + 0.44, vz - 0.16], 'y', 14)
  // radar level transmitter
  const lx = xt + Ro * 0.2
  const lz = zt + Ro * 0.45
  const ly = headY(Math.hypot(lx - xt, lz - zt))
  k.cyl(TANK, 0.05, 0.12, [lx, ly + 0.04, lz], 'y', 16)
  k.cyl(SS, 0.075, 0.02, [lx, ly + 0.11, lz], 'y', 18)
  k.cyl('aluminium', 0.04, 0.1, [lx, ly + 0.17, lz], 'y', 16)
  k.cyl('actuatorBlue', 0.06, 0.1, [lx, ly + 0.27, lz], 'z', 18)
  // magnetic level gauge with flag strip on the front face
  const gx = xt - Ro * 0.35
  const gz = zt + Ro + 0.09
  const g0 = yTL + 0.06
  const g1 = yTL + tt - 0.06
  const shellZ = (x: number) => zt + Math.sqrt(Math.max(0, Ro * Ro - (x - xt) ** 2))
  k.cyl(SS, 0.026, g1 - g0 + 0.18, [gx, (g0 + g1) / 2, gz], 'y', 16)
  for (const y of [g0, g1]) {
    k.rod(SS, [gx, y, shellZ(gx) - 0.01], [gx, y, gz], 0.014, 10)
    smallValve(k, 'ball', [gx, y, (shellZ(gx) + gz) / 2], [0, 0, 1], 0.008)
  }
  k.box(SS, [0.045, g1 - g0, 0.02], [gx + 0.05, (g0 + g1) / 2, gz])
  k.add(levelFlagMaterial(0.55), new THREE.PlaneGeometry(0.03, g1 - g0 - 0.02), mat4([gx + 0.05, (g0 + g1) / 2, gz + 0.0105]))
  k.hex(SS, 0.03, 0.02, [gx, g0 - 0.11, gz])
  // chemical ID sign
  const sx = xt + Ro * 0.3
  k.add(textMaterial(p.chemical.toUpperCase(), '#f5c400', '#111111', 512, 96), new THREE.CylinderGeometry(Ro + 0.003, Ro + 0.003, Ro * 0.2, 24, 1, true, -0.25, 1.2), mat4([xt, yTL + tt * 0.62, zt]))
  tagPlate(k, `${p.tag}-T`, [sx, yTL + tt * 0.45, shellZ(sx) + 0.004], 'z', 0.18)

  // fill line: BL flange (-X end) → ball valve → up and over → top nozzle
  const fz = zt
  const fw = blFlange(k, [-L / 2 - 0.02, g.yFill, fz], [-1, 0, 0], p.fillNps, 150)
  const fxr = xt - Ro - 0.12
  const fnx = xt - Ro * 0.5
  const fTop = T.yTop + 0.28
  const fNozY = headY(Math.abs(fnx - xt))
  const fSpan = valveSpan('ball', p.fillNps, 150)
  const fvy = g.yFill + 0.35 + fSpan / 2
  pipeRun(k, [fw, [fxr, g.yFill, fz], [fxr, fvy - fSpan / 2, fz]], p.fillNps)
  valve(k, 'ball', [fxr, fvy, fz], [0, 1, 0], p.fillNps, 150, [-1, 0, 0])
  const fjY = fNozY + 0.14 + 0.06
  pipeRun(k, [[fxr, fvy + fSpan / 2, fz], [fxr, fTop, fz], [fnx, fTop, fz], [fnx, fjY + 0.06, fz]], p.fillNps)
  const ff = flangeDims(p.fillNps, 150)
  const fjL = ff.hubLength + ff.raisedFaceHeight
  k.pipe(TANK, [fnx, fNozY - 0.03, fz], [fnx, fjY - fjL, fz], pipeOD(p.fillNps), 0.004)
  k.pipe('pipePaint', [fnx, fjY + fjL, fz], [fnx, fjY + 0.06, fz], pipeOD(p.fillNps), 0.004)
  spoolJoint(k, [fnx, fjY, fz], [0, 1, 0], p.fillNps, 150)
  pipeSupport(k, [fxr, g.yFill + 0.2, fz], pipeOD(p.fillNps), y0, 'z')
  k.box('galvanised', [0.08, 0.012, 0.08], [fxr + 0.0, g.yFill + 0.6, fz])

  // tank outlet → ball valve → suction header along the pump liquid ends
  const oy = yTL + 0.12
  const ox0 = xt + Ro - 0.01
  const os = valveSpan('ball', 1, 150)
  const ox1 = xt + Ro + 0.1
  k.pipe(TANK, [ox0 - 0.02, oy, zt], [ox1, oy, zt], pipeOD(1), 0.004)
  valve(k, 'ball', [ox1 + os / 2, oy, zt], [1, 0, 0], 1, 150)
  const hx = ox1 + os + 0.08
  const hEnd = g.xLast + 0.18
  pipeRun(k, [[ox1 + os, oy, zt], [hx, oy, zt], [hx, ys, zt], [hx, ys, zLE], [hEnd, ys, zLE]], 1, { mat: SS, schedule: '40S' })
  weldCap(k, 1, [hEnd, ys, zLE], 'x', SS)
  smallValve(k, 'ball', [hEnd - 0.05, ys - 0.03, zLE], [0, -1, 0], 0.008, [1, 0, 0])
  for (const x of [hx + 0.25, g.xLast - 0.3]) pipeSupport(k, [x, ys, zLE], pipeOD(1), y0, 'x')

  // calibration pot: graduated column on the suction header, vented to the relief return header
  const cx = g.xs - 0.32
  const cz = zLE + 0.14
  const c0 = ys + 0.28
  const c1 = ys + 0.98
  k.cyl('glass', 0.04, c1 - c0, [cx, (c0 + c1) / 2, cz], 'y', 20)
  for (const y of [c0, c1]) k.cyl(SS, 0.05, 0.03, [cx, y, cz], 'y', 20)
  for (const a of [0, 1, 2, 3]) k.rod(SS, [cx + Math.cos(a * 1.57 + 0.78) * 0.045, c0, cz + Math.sin(a * 1.57 + 0.78) * 0.045], [cx + Math.cos(a * 1.57 + 0.78) * 0.045, c1, cz + Math.sin(a * 1.57 + 0.78) * 0.045], 0.004, 6)
  k.box(textMaterial('ml', '#f2f2ee', '#111', 64, 256), [0.012, c1 - c0 - 0.06, 0.004], [cx, (c0 + c1) / 2, cz + 0.052])
  k.rod('galvanised', [cx, y0, cz - 0.08], [cx, c1, cz - 0.08], 0.02, 10)
  k.box('galvanised', [0.15, 0.012, 0.15], [cx, y0 + 0.006, cz - 0.08])
  for (const y of [c0 + 0.1, c1 - 0.1]) k.box('galvanised', [0.03, 0.03, 0.06], [cx, y, cz - 0.05])
  k.tube(SS, [[cx, c0 - 0.015, cz], [cx, ys, cz], [cx, ys, zLE]], d05 / 2, 10, 0.03)
  smallValve(k, 'ball', [cx, ys + 0.12, cz], [0, 1, 0], 0.008, [0, 0, 1])
  k.tube(SS, [[cx, c1 + 0.015, cz], [cx, yr, cz], [cx, yr, zLE]], d05 / 2, 10, 0.03)
  smallValve(k, 'needle', [cx, c1 + 0.12, cz], [0, 1, 0], 0.008, [0, 0, 1])

  // ---------------------------------------------------------------- metering pumps
  const rotors: RotorSpec[] = []
  const { ms, H } = g
  const q = eul(0, Math.PI / 2, 0) // pump-local +X (shaft towards the liquid end) → world -Z
  for (let i = 0; i < g.N; i++) {
    const px = g.pumpX[i]
    dripPan(k, px, zp - 0.02, 0.48, 0.78, y0)
    k.box('equipmentPaintDark', [0.3, g.ypd - y0 - 0.005, 0.46], [px, (g.ypd + y0 + 0.005) / 2, zp - 0.02])
    k.box('equipmentPaintDark', [0.36, 0.012, 0.52], [px, g.ypd - 0.006, zp - 0.02])
    k.at([px, yb, zp], q, () => {
      k.rbox('actuatorBlue', [0.2, 0.26, 0.2], 0.025, [0.1, 0.02, 0])
      k.cyl('actuatorBlue', 0.035, 0.07, [0.08, 0.18, 0], 'y', 16)
      k.cyl('nameplate', 0.045, 0.012, [0.08, 0.22, 0], 'y', 20)
      k.handwheel('handwheel', 0.1, [0.08, 0.24, 0], 'y', 3)
      k.box('nameplate', [0.08, 0.05, 0.002], [0.1, 0.03, 0.101])
      k.cyl('brass', 0.012, 0.02, [0.03, 0.15, 0.06], 'y', 8)
      k.at([0, 0, 0], undefined, () => motor(k, { R: ms.R, L: ms.L, H, tbox: 'top', fins: 20 }))
      // diaphragm liquid end: housing, cover, bolting, suction / discharge check valves
      k.cyl(SS, 0.085, 0.05, [0.225, 0, 0], 'x', 28)
      k.cyl(SS, 0.075, 0.035, [0.265, 0, 0], 'x', 28)
      k.boltCircle('boltXylan', 'nut', 8, 0.072, [0.195, 0, 0], 'x', 0.008, 0.09, [0.086])
      k.cyl(SS, 0.02, 0.06, [0.225, -0.11, 0], 'y', 12)
      k.hex(SS, 0.045, 0.05, [0.225, -0.1, 0], 'y')
      k.cyl(SS, 0.02, 0.06, [0.225, 0.11, 0], 'y', 12)
      k.hex(SS, 0.045, 0.05, [0.225, 0.1, 0], 'y')
    })
    const fan = cowlFan(ms.R, ms.L, 1450 / 10)
    const local = new THREE.Vector3(...fan.pos).applyQuaternion(q).add(new THREE.Vector3(px, yb, zp))
    rotors.push({ ...fan, pos: local.toArray() as V3, rot: [0, Math.PI / 2, 0] })

    // suction branch from the header
    const sTop = yb - 0.13
    k.tube(SS, [[px, ys + pipeOD(1) / 2 - 0.004, zLE], [px, sTop, zLE]], d05 / 2, 10)
    smallValve(k, 'ball', [px, ys + 0.1, zLE], [0, 1, 0], 0.008, [0, 0, 1])
    k.hex(SS, 0.04, 0.03, [px, ys + 0.2, zLE]) // y-strainer body
    k.rod(SS, [px, ys + 0.2, zLE], [px + 0.05, ys + 0.15, zLE], 0.012, 8)

    // discharge riser: dampener, gauge, PSV, then jog to its rack lane
    const y1d = yb + 0.13
    const yD = y0 + 0.72
    const yP = y0 + 0.9
    const yG = y0 + 1.0
    const y1 = y0 + 1.12
    const zr = g.rack[i]
    const fo = flangeDims(p.outletNps, p.outletRating)
    const face: V3 = [L / 2 + 0.02, yh, zr]
    const weld = addv(face, [-1, 0, 0], fo.hubLength + fo.raisedFaceHeight)
    blFlange(k, face, [1, 0, 0], p.outletNps, p.outletRating)
    pipeRun(k, [[px, y1d, zLE], [px, y1, zLE], [px, y1, zr], [px, yh, zr], weld], 0.5, { mat: SS, schedule: '160' })
    smallValve(k, 'needle', [px, yh - 0.12, zr], [0, 1, 0], 0.009, [0, 0, 1])
    smallValve(k, 'ball', [L / 2 - 0.3, yh, zr], [1, 0, 0], 0.009)
    k.hex(SS, 0.032, 0.05, [L / 2 - 0.18, yh, zr], 'x') // non-return valve
    reliefBody(k, [L / 2 - 0.45, yh, zr], [0, 1, 0], 0.016) // back-pressure valve
    // pulsation dampener (bladder type) on a +X branch
    k.tube(SS, [[px, yD, zLE], [px + 0.11, yD, zLE], [px + 0.11, yD + 0.05, zLE]], d05 / 2, 10, 0.025)
    k.cyl(SS, 0.055, 0.2, [px + 0.11, yD + 0.15, zLE], 'y', 20)
    k.dome(SS, 0.055, [px + 0.11, yD + 0.25, zLE], 'y', Math.PI / 2, 0.6, 20)
    k.dome(SS, 0.055, [px + 0.11, yD + 0.05, zLE], '-y', Math.PI / 2, 0.4, 20)
    k.cyl('brass', 0.012, 0.04, [px + 0.11, yD + 0.29, zLE], 'y', 8)
    gauge(k, [px + 0.11, yD + 0.35, zLE + 0.012], 'z', 0.06, 'bar', 250)
    // discharge pressure gauge
    gaugeTap(k, [px, yG, zLE + d05 / 2], [0, 0, 1], 250, 0.08)
    // PSV on a -X branch, discharge back to the tank via the relief return header
    k.tube(SS, [[px, yP, zLE], [px - 0.1, yP, zLE], [px - 0.1, yP + 0.04, zLE]], d05 / 2, 10, 0.025)
    const po = smallPsv(k, [px - 0.1, yP + 0.04, zLE], [-1, 0, 0], 0.016)
    k.tube(SS, [po, [po[0] - 0.04, po[1], zLE], [po[0] - 0.04, yr, zLE]], d05 / 2, 10, 0.03)
  }
  // discharge pressure transmitter on the first lane, rack portal frames
  transmitter(k, [g.xLast + 0.35, yh, g.rack[0] + d05 / 2], [0, 0, 1], 0.06)
  const zA = zLE - 0.08
  const zB = g.rack[g.N - 1] - 0.12
  const portals = [g.xLast + 0.45]
  for (let i = 0; i < g.N - 1; i += 2) portals.push((g.pumpX[i] + g.pumpX[i + 1]) / 2)
  for (const x of portals) {
    k.box('galvanised', [0.07, yr - y0 - 0.02, 0.07], [x, (yr + y0) / 2 - 0.01 - pipeOD(1) / 2, zA])
    k.box('galvanised', [0.07, yh - y0 - 0.03, 0.07], [x, (yh + y0) / 2 - 0.015 - d05 / 2, zB])
    k.box('galvanised', [0.07, 0.05, zA - zB + 0.07], [x, yh - d05 / 2 - 0.03, (zA + zB) / 2])
    k.box('galvanised', [0.07, 0.05, 0.2], [x, yr - pipeOD(1) / 2 - 0.03, zA + 0.06])
    for (const z of [zA, zB]) k.box('galvanised', [0.14, 0.012, 0.14], [x, y0 + 0.006, z])
    for (const z of g.rack) k.torus('boltXylan', d05 / 2 + 0.004, 0.003, [x, yh, z], 'x', 6, 12, Math.PI)
  }
  // relief return header back over the tank head
  const rnx = xt + Ro * 0.55
  const rnz = zLE
  const rTop = Math.max(yr, T.yTop + 0.18)
  const rNozY = headY(Math.hypot(rnx - xt, Math.min(Ro * 0.9, rnz - zt)))
  const rz = Math.min(rnz, zt + Ro * 0.6)
  pipeRun(k, [[g.xLast - 0.05, yr, zLE], [g.xs - 0.6, yr, zLE], [rnx, yr, zLE], [rnx, rTop, zLE], [rnx, rTop, rz], [rnx, rNozY - 0.02, rz]], 1, { mat: SS })
  weldCap(k, 1, [g.xLast - 0.05, yr, zLE], 'x', SS)

  // ---------------------------------------------------------------- local control panel and cable tray
  const pz = W / 2 - 0.32
  const gland = localPanel(k, [g.xPanel, y0, pz], [0, 0, 1], { w: 0.55, h: 0.65, top: 1.85, title: 'CHEM INJ LCP', buttons: Math.min(6, g.N * 2) })
  const tz = W / 2 - 0.13
  const ty = y0 + 0.22
  cableTray(k, [[g.xPanel, gland[1] - 0.05, gland[2]], [g.xPanel, ty, gland[2]], [g.xPanel, ty, tz], [g.xs - 0.25, ty, tz]], [1, 0, 0], 0.15, 3)
  junctionBox(k, [g.xs - 0.3, y0 + 0.55, tz + 0.03], 'z', [0.26, 0.3, 0.14])
  k.box('galvanised', [0.05, 0.75, 0.05], [g.xs - 0.3, y0 + 0.375, tz + 0.0])
  for (const px of g.pumpX) {
    const tbz = zp + ms.L * 0.4
    k.spline('cable', [[px, ty + 0.03, tz], [px, ty + 0.1, tz - 0.05], [px + 0.05, yb + ms.R + 0.05, tbz + 0.12], [px + 0.04, yb + ms.R + 0.04, tbz + 0.04]], 0.008, 6, 20)
  }

  // ---------------------------------------------------------------- sunshade canopy
  if (p.canopy) {
    const roof = Math.max(2.6, T.yTop + 0.7)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const h = roof + (sz < 0 ? 0.12 : 0)
        k.box('structSteel', [0.1, h - y0, 0.1], [sx * (L / 2 - 0.08), (h + y0) / 2, sz * (W / 2 - 0.08)])
        k.box('structSteel', [0.2, 0.012, 0.2], [sx * (L / 2 - 0.08), y0 + 0.006, sz * (W / 2 - 0.08)])
      }
    const slope = Math.atan2(0.12, W - 0.16)
    for (const s of [-1, 1]) k.box('structSteel', [L, 0.12, 0.08], [0, roof + (s < 0 ? 0.12 : 0) + 0.06, s * (W / 2 - 0.08)])
    for (let x = -L / 2 + 0.08; x <= L / 2 - 0.07; x += (L - 0.16) / Math.max(1, Math.round(L / 1.5))) k.box('structSteel', [0.08, 0.1, W], [x, roof + 0.18, 0], eul(slope, 0, 0))
    const sheet = paint('#9fa6aa', { metalness: 0.6, roughness: 0.5, clearcoat: 0 })
    k.at([0, roof + 0.25, 0], eul(slope, 0, 0), () => {
      k.box(sheet, [L + 0.4, 0.012, W + 0.5], [0, 0, 0])
      for (let x = -L / 2 - 0.15; x <= L / 2 + 0.2; x += 0.2) k.box(sheet, [0.04, 0.03, W + 0.5], [x, 0.015, 0])
    })
  }
  return { built: k.build(), rotors }
}

