// Wellhead hydraulic power unit: stainless reservoir, duty / standby motor-pump sets, HP filters, bladder accumulator bank, gauge panel and LCP. API 6A / ISO 4413, ISO 10945 accumulators.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, eul, mat4, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { gauge, member, motor, motorSize, pipeRun, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, cowlFan, type RotorSpec } from '../lib/rotors'
import { SECTIONS, pipeOD, type Rating } from '../lib/standards'
import { levelFlagMaterial, textMaterial } from '../lib/textures'
import { addv, blFlange, cableTray, earthBoss, localPanel, padeyeShackles, smallPsv, smallValve, transmitter } from './_skid'

export interface HydraulicPowerUnitProps {
  /** reservoir working volume, litres */
  reservoir?: number
  /** motor-pump sets (duty / standby) */
  pumps?: number
  /** motor rated power, kW */
  kw?: number
  /** bladder accumulators in the bank */
  accumulators?: number
  supplyNps?: number
  /** supply class (HP hydraulic) */
  supplyRating?: Rating
  returnNps?: number
  tag?: string
  running?: boolean
}

export const defaults = {
  reservoir: 400,
  pumps: 2,
  kw: 5.5,
  accumulators: 6,
  supplyNps: 0.75,
  supplyRating: 2500 as Rating,
  returnNps: 1.5,
  tag: 'X-1900',
  running: true,
}

type P = typeof defaults

const SKID = 'HEB 160'
const SS: MatKey = 'stainless'
const ACC: MatKey = paint('#c7372b', { metalness: 0.3, roughness: 0.4 })
const RET: Rating = 150

function layout(p: P) {
  const N = Math.max(1, Math.min(3, Math.round(p.pumps)))
  const Na = Math.max(2, Math.min(12, Math.round(p.accumulators)))
  const rh = 0.7
  const rw = 0.9
  const rl = THREE.MathUtils.clamp(p.reservoir / 1000 / (rh * rw * 0.8), N * 0.45 + 0.2, 2.6)
  const pitchA = 0.3
  const rows = Na > 6 ? 2 : 1
  const perRow = Math.ceil(Na / rows)
  const L = 0.15 + rl + 0.45 + perRow * pitchA + 0.85
  const W = 1.9
  const a = -L / 2
  const y0 = SECTIONS[SKID].d + 0.008
  const xr = a + 0.15 + rl / 2
  const zr = -0.2
  const yt = y0 + 0.15 + rh
  const xa0 = a + 0.15 + rl + 0.45
  const zA = rows === 2 ? [-0.55, -0.22] : [-0.4]
  return { N, Na, rl, rh, rw, rows, perRow, pitchA, L, W, a, y0, xr, zr, yt, xa0, zA, ySup: y0 + 0.62, zSup: -0.2, yRet: y0 + 0.32, zRet: 0.25, xEnd: xa0 + perRow * pitchA }
}

export function ports(props: HydraulicPowerUnitProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [
    port('supply', 'HP hydraulic supply', [g.L / 2, g.ySup, g.zSup], [1, 0, 0], p.supplyNps, p.supplyRating, 'utility'),
    port('return', 'Hydraulic return', [g.L / 2, g.yRet, g.zRet], [1, 0, 0], p.returnNps, RET, 'utility'),
  ]
}

export function HydraulicPowerUnit(props: HydraulicPowerUnitProps & GroupProps) {
  const { reservoir, pumps, kw, accumulators, supplyNps, supplyRating, returnNps, tag, running, ...group } = { ...defaults, ...props }
  const p = { reservoir, pumps, kw, accumulators, supplyNps, supplyRating, returnNps, tag, running }
  const { built, rotors } = useMemo(() => build(p), [reservoir, pumps, kw, accumulators, supplyNps, supplyRating, returnNps, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default HydraulicPowerUnit

function build(p: P) {
  const k = new Kit()
  const g = layout(p)
  const { L, W, y0, xr, zr, yt, rl, rh, rw, a } = g
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)
  tagPlate(k, p.tag, [a + 0.6, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.3)
  earthBoss(k, [-a - 0.4, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])
  // bund upstand (hydraulic oil spill containment) and bund drain
  for (const s of [-1, 1]) {
    k.box('equipmentPaintDark', [L - 0.03, 0.12, 0.006], [0, y0 + 0.06, s * (W / 2 - 0.016)])
    k.box('equipmentPaintDark', [0.006, 0.12, W - 0.03], [s * (L / 2 - 0.016), y0 + 0.06, 0])
  }
  smallValve(k, 'ball', [a - 0.05, y0 + 0.03, W / 2 - 0.3], [-1, 0, 0], 0.012)

  // ---------------------------------------------------------------- reservoir
  const yb = y0 + 0.15
  for (const sx of [-1, 1]) {
    k.box(SS, [0.08, 0.15, rw + 0.06], [xr + sx * (rl / 2 - 0.1), y0 + 0.075, zr])
    k.box(SS, [0.14, 0.012, rw + 0.1], [xr + sx * (rl / 2 - 0.1), y0 + 0.006, zr])
  }
  k.rbox(SS, [rl, rh, rw], 0.02, [xr, yb + rh / 2, zr])
  k.box(SS, [rl + 0.04, 0.02, rw + 0.04], [xr, yt + 0.01, zr]) // top plate flange
  // bolted inspection covers on the back half of the top
  for (const sx of [-0.25, 0.25]) {
    const cx = xr + sx * rl
    k.box(SS, [0.3, 0.012, 0.22], [cx, yt + 0.026, zr - rw * 0.28])
    for (const dx of [-0.12, 0, 0.12]) for (const dz of [-0.09, 0.09]) k.hex('nut', 0.016, 0.01, [cx + dx, yt + 0.037, zr - rw * 0.28 + dz])
  }
  // level / temperature gauge, low-level switch, drain, filler-breather
  const fz = zr + rw / 2
  const gx = xr - rl * 0.3
  k.box(SS, [0.06, rh * 0.7, 0.03], [gx, yb + rh * 0.5, fz + 0.03])
  k.add(levelFlagMaterial(0.68), new THREE.PlaneGeometry(0.03, rh * 0.62), mat4([gx, yb + rh * 0.5, fz + 0.046]))
  gauge(k, [gx, yb + rh * 0.92, fz + 0.035], 'z', 0.06, '°C', 100)
  k.rbox('actuatorBlue', [0.08, 0.1, 0.06], 0.01, [gx + 0.18, yb + rh * 0.25, fz + 0.03])
  transmitter(k, [gx + 0.38, yb + rh * 0.4, fz], [0, 0, 1], 0.06)
  k.rod(SS, [xr + rl * 0.35, yb + 0.05, fz - 0.01], [xr + rl * 0.35, yb + 0.05, fz + 0.12], 0.016, 10)
  smallValve(k, 'ball', [xr + rl * 0.35, yb + 0.05, fz + 0.08], [0, 0, 1], 0.012)
  const bx = xr - rl * 0.4
  k.cyl(SS, 0.04, 0.08, [bx, yt + 0.06, zr + rw * 0.3], 'y', 16)
  k.cyl('plasticGrey', 0.055, 0.14, [bx, yt + 0.17, zr + rw * 0.3], 'y', 20) // desiccant breather
  k.plane(textMaterial('HYDRAULIC OIL ISO VG 32', '#1f5fa0', '#fff', 512, 64), 0.5, 0.06, [xr + 0.05, yb + rh * 0.82, fz + 0.002])

  // ---------------------------------------------------------------- motor-pump sets on the reservoir top
  const ms = motorSize(p.kw, 4)
  const H = Math.max(ms.H, ms.R * 1.25)
  const q = eul(0, Math.PI / 2, 0) // pump-local +X (towards the pump) → world -Z
  const rotors: RotorSpec[] = []
  const pitch = rl / g.N
  const yHdr = yt + 0.55
  const zHdr = zr - rw / 2 + 0.06
  for (let i = 0; i < g.N; i++) {
    const px = xr - rl / 2 + pitch * (i + 0.5)
    const zc = zr + 0.12 // bellhousing flange
    const ys = yt + 0.02 + H
    k.box('equipmentPaintDark', [0.3, 0.02, Math.min(rw - 0.1, ms.L + 0.3)], [px, yt + 0.03, zr + 0.12])
    k.at([px, ys, zc], q, () => {
      k.at([0, 0, 0], undefined, () => motor(k, { R: ms.R, L: ms.L, H, tbox: 'top', fins: 22 }))
      // bellhousing, foot bracket, gear pump
      k.cyl('equipmentPaintDark', ms.R * 0.95, 0.16, [0.08, 0, 0], 'x', 28, ms.R * 0.75)
      k.box('equipmentPaintDark', [0.03, H, ms.R * 1.6], [0.02, -H / 2, 0])
      k.rbox('aluminium', [0.12, 0.13, 0.12], 0.012, [0.22, 0, 0])
      k.cyl('aluminium', 0.03, 0.04, [0.3, 0, 0], 'x', 12)
    })
    rotors.push({ ...cowlFan(ms.R, ms.L, 1450 / 10), pos: new THREE.Vector3(...cowlFan(ms.R, ms.L, 145).pos).applyQuaternion(q).add(new THREE.Vector3(px, ys, zc)).toArray() as V3, rot: [0, Math.PI / 2, 0] })
    // suction down into the tank, discharge up through the HP filter to the header
    const zP = zc - 0.22
    k.rod(SS, [px, ys - 0.065, zP], [px, yt + 0.0, zP], 0.022, 12)
    k.cyl(SS, 0.04, 0.012, [px, yt + 0.026, zP], 'y', 16)
    const fx = px + 0.16
    k.tube('tubing', [[px, ys + 0.065, zP], [px, ys + 0.12, zP], [fx, ys + 0.12, zP], [fx, ys + 0.16, zP]], 0.011, 8, 0.03)
    k.cyl('aluminium', 0.05, 0.05, [fx, ys + 0.18, zP], 'y', 18) // HP filter head
    k.cyl(SS, 0.045, 0.24, [fx, ys + 0.03 + 0.0, zP], 'y', 18) // bowl
    k.cyl('actuatorRed', 0.014, 0.02, [fx, ys + 0.22, zP + 0.04], 'z', 10) // clogging indicator
    k.tube('tubing', [[fx, ys + 0.205, zP], [fx, yHdr, zP], [fx, yHdr, zHdr]], 0.011, 8, 0.03)
    smallValve(k, 'needle', [fx, yHdr - 0.12, zP], [0, 1, 0], 0.008, [1, 0, 0])
    k.hex(SS, 0.03, 0.04, [fx, yHdr - 0.24, zP]) // check valve
  }
  // discharge header along the back, PSV back to the tank
  const xh1 = g.xa0 + 0.1
  k.rod(SS, [xr - rl / 2 + 0.05, yHdr, zHdr], [xh1, yHdr, zHdr], 0.014, 10)
  for (const x of [xr - rl / 2 + 0.1, xr + rl / 2 - 0.1]) k.box('galvanised', [0.04, yHdr - yt, 0.04], [x, (yHdr + yt) / 2, zHdr])
  const po = smallPsv(k, [xr + rl / 2 - 0.25, yHdr + 0.014, zHdr], [1, 0, 0], 0.016)
  k.tube('tubing', [po, addv(po, [0.05, 0, 0]), [po[0] + 0.05, yt + 0.06, zHdr], [po[0] + 0.05, yt + 0.06, zHdr + 0.12], [po[0] + 0.05, yt + 0.02, zHdr + 0.12]], 0.009, 8, 0.03)
  transmitter(k, [xr - rl / 2 + 0.3, yHdr + 0.014, zHdr], [0, 1, 0], 0.06)

  // ---------------------------------------------------------------- accumulator bank
  const yA0 = y0 + 0.2
  const hA = 0.82
  const rA = 0.115
  const xs: number[] = []
  for (let i = 0; i < g.perRow; i++) xs.push(g.xa0 + g.pitchA * (i + 0.5))
  const zF0 = g.zA[0] - 0.2
  const zF1 = g.zA[g.zA.length - 1] + 0.2
  for (const x of [g.xa0, g.xEnd]) for (const z of [zF0, zF1]) {
    member(k, [x, y0, z], [x, yA0 + hA + 0.05, z], 'L50x50x5', 'galvanised', [1, 0, 0])
    k.box('galvanised', [0.1, 0.012, 0.1], [x, y0 + 0.006, z])
  }
  for (const y of [yA0 + 0.25, yA0 + hA - 0.2]) for (const z of [zF0, zF1]) member(k, [g.xa0, y, z], [g.xEnd, y, z], 'L50x50x5', 'galvanised', [0, 1, 0])
  let n = 0
  for (const z of g.zA)
    for (const x of xs) {
      if (n++ >= g.Na) break
      k.cyl(ACC, rA, hA - 2 * rA, [x, yA0 + hA / 2, z], 'y', 28)
      k.sphere(ACC, rA, [x, yA0 + hA - rA, z], undefined, 24)
      k.sphere(ACC, rA, [x, yA0 + rA, z], undefined, 24)
      k.cyl('brass', 0.022, 0.06, [x, yA0 + hA + 0.02, z], 'y', 12) // gas charging valve
      k.cyl('actuatorRed', 0.026, 0.03, [x, yA0 + hA + 0.06, z], 'y', 12)
      for (const y of [yA0 + 0.25, yA0 + hA - 0.2]) k.torus('galvanised', rA + 0.008, 0.008, [x, y, z], 'y', 6, 24)
      k.cyl(SS, 0.03, 0.08, [x, yA0 - 0.03, z], 'y', 12)
      k.rod(SS, [x, yA0 - 0.07, z], [x, y0 + 0.12, z], 0.009, 8)
      smallValve(k, 'needle', [x, y0 + 0.16, z], [0, -1, 0], 0.007, [0, 0, 1])
      k.plane(textMaterial('N2 PRECHARGE', '#ffffff', '#c7372b', 256, 48), 0.12, 0.022, [x, yA0 + hA * 0.55, z + rA + 0.002])
    }
  // accumulator manifold, bleed, header drop to it, supply BL
  const ym = y0 + 0.12
  for (const z of g.zA) k.rod(SS, [g.xa0, ym, z], [g.xEnd, ym, z], 0.016, 12)
  if (g.zA.length > 1) k.rod(SS, [g.xa0 + 0.05, ym, g.zA[0]], [g.xa0 + 0.05, ym, g.zA[1]], 0.014, 10)
  smallValve(k, 'needle', [g.xa0 + 0.08, ym, g.zA[0] - 0.08], [0, 0, -1], 0.008)
  k.tube('tubing', [[xh1, yHdr, zHdr], [xh1, yHdr, g.zA[0]], [xh1, ym + 0.02, g.zA[0]]], 0.011, 8, 0.03)
  const sw = blFlange(k, [L / 2, g.ySup, g.zSup], [1, 0, 0], p.supplyNps, p.supplyRating)
  const zLast = g.zA[g.zA.length - 1]
  pipeRun(k, [[g.xEnd - 0.05, ym, zLast], [g.xEnd + 0.15, ym, zLast], [g.xEnd + 0.15, g.ySup, zLast], [g.xEnd + 0.15, g.ySup, g.zSup], sw], p.supplyNps, { mat: SS, schedule: '160' })
  smallValve(k, 'ball', [g.xEnd + 0.15, ym + 0.25, zLast], [0, 1, 0], 0.014, [1, 0, 0])

  // return: BL → front run → return filter on the reservoir top
  const rw0 = blFlange(k, [L / 2, g.yRet, g.zRet], [1, 0, 0], p.returnNps, RET)
  const rfx = xr + rl / 2 - 0.15
  const rfz = zr + rw * 0.32
  pipeRun(k, [rw0, [rfx, g.yRet, g.zRet], [rfx, yt + 0.32, g.zRet], [rfx, yt + 0.32, rfz]], p.returnNps, { mat: SS })
  k.cyl('aluminium', 0.08, 0.1, [rfx, yt + 0.22, rfz], 'y', 20) // tank-top return filter
  k.cyl('aluminium', 0.09, 0.02, [rfx, yt + 0.035, rfz], 'y', 20)
  k.cyl(SS, 0.06, 0.12, [rfx, yt + 0.1, rfz], 'y', 20)
  gauge(k, [rfx + 0.1, yt + 0.25, rfz + 0.02], 'z', 0.06, 'bar', 6)
  k.box('galvanised', [0.05, g.yRet - y0 - pipeOD(p.returnNps) / 2, 0.05], [L / 2 - 0.35, (g.yRet - pipeOD(p.returnNps) / 2 + y0) / 2, g.zRet])

  // ---------------------------------------------------------------- gauge panel (front of the accumulator bank)
  const gpx = (g.xa0 + g.xEnd) / 2
  const gpz = W / 2 - 0.32
  const gw = Math.min(0.9, g.xEnd - g.xa0)
  for (const s of [-1, 1]) {
    member(k, [gpx + s * (gw / 2 - 0.04), y0, gpz - 0.04], [gpx + s * (gw / 2 - 0.04), y0 + 1.75, gpz - 0.04], 'UPN 80', 'galvanised', [0, 0, 1])
    k.box('galvanised', [0.14, 0.012, 0.14], [gpx + s * (gw / 2 - 0.04), y0 + 0.006, gpz - 0.04])
  }
  k.box(SS, [gw, 0.7, 0.006], [gpx, y0 + 1.35, gpz])
  k.plane(textMaterial('HPU GAUGE PANEL', '#f2f2ee', '#111', 512, 64), gw * 0.6, 0.05, [gpx, y0 + 1.66, gpz + 0.004])
  const labels = ['PUMP A', 'PUMP B', 'ACCUM', 'SUPPLY', 'RETURN', 'PILOT']
  for (let i = 0; i < 6; i++) {
    const gx2 = gpx - gw * 0.33 + (i % 3) * gw * 0.33
    const gy = y0 + 1.48 - Math.floor(i / 3) * 0.28
    gauge(k, [gx2, gy, gpz + 0.03], 'z', 0.1, 'bar', i === 4 ? 10 : 400)
    k.plane(textMaterial(labels[i], '#111', '#fff', 256, 48), 0.09, 0.017, [gx2, gy - 0.08, gpz + 0.004])
    k.cyl('handwheel', 0.012, 0.03, [gx2, gy - 0.12, gpz + 0.015], 'z', 10)
  }
  k.tube('tubing', [[gpx - 0.2, y0 + 1.0, gpz - 0.01], [gpx - 0.2, ym + 0.05, gpz - 0.01], [gpx - 0.2, ym + 0.05, zLast + 0.05]], 0.005, 6, 0.03)
  k.tube('tubing', [[gpx + 0.2, y0 + 1.0, gpz - 0.01], [gpx + 0.2, ym + 0.08, gpz - 0.01], [gpx + 0.2, ym + 0.08, zLast + 0.05]], 0.005, 6, 0.03)

  // ---------------------------------------------------------------- LCP and cable tray
  const lx = a + 0.45
  const gl = localPanel(k, [lx, y0, W / 2 - 0.3], [0, 0, 1], { w: 0.5, h: 0.6, top: 1.85, title: 'HPU LCP', buttons: 2 * g.N })
  const tz = W / 2 - 0.12
  cableTray(k, [[lx, gl[1] - 0.04, gl[2]], [lx, y0 + 0.22, gl[2]], [lx, y0 + 0.22, tz], [xr + rl / 2, y0 + 0.22, tz]], [1, 0, 0], 0.15, 2)
  for (let i = 0; i < g.N; i++) {
    const px = xr - rl / 2 + pitch * (i + 0.5)
    const tbz = zr + 0.12 + ms.L * 0.4
    const ytb = yt + 0.02 + H + ms.R + 0.05
    k.spline('cable', [[px, y0 + 0.24, tz], [px + 0.05, yt - 0.1, tz - 0.05], [px + 0.06, ytb + 0.05, tbz + 0.15], [px + 0.04, ytb, tbz + 0.04]], 0.008, 6, 20)
  }
  return { built: k.build(), rotors }
}
