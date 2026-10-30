/**
 * Centrifugal compressor package on a common skid: VSD motor (box frame, air-to-air cooler on top)
 * -> speed-increasing gearbox -> barrel compressor, plus a lube-oil console (reservoir, vertical
 * pumps, duplex filters, twin coolers, accumulator, oil headers), dry-gas-seal panel and grating
 * walkways with handrails along both long edges.
 *
 * Local frame (types.ts): origin = skid centre at deck level, train along +X (motor at -X,
 * compressor at +X). The barrel is DERIVED from the nozzles: nozzles with dir ±Y set the barrel
 * centre x (mean of their x) and the barrel radius / shaft height so their bases sit on the barrel.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { CompressorPackage } from '../../model/types'
import { pipeOD } from '../../model/catalog'
import { dirToLocal, toLocal } from '../../model/geom'
import { materials } from '../../three/materials'
import { NozzleNeck } from '../common/NozzleNeck'
import { Kit, type MatKey, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { couplingGuard, gratingPanel, handrail, pipeRun, smallGauge, tagPlate } from './machinery/parts'
import { dialMaterial, signMaterial } from './machinery/textures'

const SKID: MatKey = 'equipmentPaintDark'
const COMP: MatKey = 'equipmentPaint'
const GEAR: MatKey = 'machineryGreen'
const MOTOR: MatKey = 'motorPaint'
const OIL: MatKey = 'machineryGreen'

export function buildCompressor(eq: CompressorPackage) {
  const k = new Kit()
  const [SL, SW] = eq.skid
  const hs = 0.45 // skid top
  const walk = Math.min(0.8, SW * 0.2)
  const loc = eq.nozzles.map((n) => ({ base: toLocal(eq, n.base), dir: dirToLocal(eq, n.dir), nps: n.nps }))
  const vert = loc.filter((n) => Math.abs(n.dir[1]) > 0.7)
  const maxNps = Math.max(8, ...loc.map((n) => n.nps))
  let ys = 1.6
  let Rb = 0.75
  let cx = SL / 2 - 2.6
  let span = 1.2
  if (vert.length) {
    const xs = vert.map((n) => n.base[0])
    cx = xs.reduce((a, b) => a + b, 0) / xs.length
    span = Math.max(...xs) - Math.min(...xs)
    const up = vert.find((n) => n.dir[1] > 0)
    const dn = vert.find((n) => n.dir[1] < 0)
    if (up) {
      Rb = Math.min(Math.max((up.base[1] - hs) * 0.4, 0.5, pipeOD(maxNps) * 1.5), 1.0)
      ys = up.base[1] - Rb
    } else if (dn) {
      Rb = Math.min(Math.max(pipeOD(maxNps) * 1.8, 0.55), 0.9)
      ys = dn.base[1] + Rb
    }
  }
  const zc = 0

  // ---------------------------------------------------------------- skid base
  const beam = (x0: number, x1: number, z: number) => {
    const L = x1 - x0
    const xm = (x0 + x1) / 2
    k.box(SKID, [L, 0.025, 0.3], [xm, 0.0125, z])
    k.box(SKID, [L, 0.025, 0.3], [xm, hs - 0.0375, z])
    k.box(SKID, [L, hs - 0.075, 0.016], [xm, hs / 2 - 0.0125, z])
  }
  for (const z of [-SW / 2 + 0.15, -SW * 0.18, SW * 0.18, SW / 2 - 0.15]) beam(-SL / 2, SL / 2, z)
  for (let i = 0; i <= Math.round(SL / 1.8); i++) {
    const x = -SL / 2 + 0.008 + (i * (SL - 0.016)) / Math.round(SL / 1.8)
    k.box(SKID, [0.016, hs - 0.06, SW - 0.3], [x, hs / 2 - 0.0125, 0])
  }
  // deck plate (drip pan) inside walkways
  k.box('deckPlate', [SL, 0.012, SW - 2 * walk], [0, hs - 0.019, 0])
  // lifting trunnions
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(SKID, 0.09, 0.22, [sx * (SL / 2 - 0.6), hs * 0.5, sz * (SW / 2 + 0.1)], 'z', 18)
  // walkways + handrails (gap at mid-length for access steps)
  for (const s of [-1, 1]) {
    const zw = s * (SW / 2 - walk / 2)
    const n = Math.max(2, Math.round(SL / 2))
    for (let i = 0; i < n; i++) gratingPanel(k, [-SL / 2 + (SL * (i + 0.5)) / n, hs - 0.015, zw], SL / n - 0.01, walk - 0.01)
    const ze = s * (SW / 2 - 0.03)
    handrail(k, [[-SL / 2 + 0.03, hs, ze], [-0.6, hs, ze]])
    handrail(k, [[0.6, hs, ze], [SL / 2 - 0.03, hs, ze]])
    // access step
    for (let j = 0; j < 2; j++) k.box('walkwayPaint', [1.0, 0.03, 0.25], [0, hs - (j + 1) * (hs / 3), s * (SW / 2 + 0.13 + j * 0.25)])
    for (const sx of [-1, 1]) k.box('structSteel', [0.012, hs, 0.55], [sx * 0.5, hs / 2, s * (SW / 2 + 0.27)])
  }
  for (const s of [-1, 1]) handrail(k, [[s * (SL / 2 - 0.03), hs, -SW / 2 + 0.03], [s * (SL / 2 - 0.03), hs, -SW / 2 + walk]])
  for (const s of [-1, 1]) handrail(k, [[s * (SL / 2 - 0.03), hs, SW / 2 - walk], [s * (SL / 2 - 0.03), hs, SW / 2 - 0.03]])

  // ---------------------------------------------------------------- barrel compressor
  const Lc = Math.max(2.2, span + 1.5)
  const c0 = cx - Lc / 2
  const c1 = cx + Lc / 2
  k.cyl(COMP, Rb, Lc, [cx, ys, zc], 'x', 64)
  // forged rings at the ends
  for (const s of [-1, 1]) k.cyl(COMP, Rb * 1.04, 0.12, [cx + s * (Lc / 2 - 0.06), ys, zc], 'x', 64)
  // nozzle bosses up to each nozzle base
  for (const n of vert) {
    const r = (pipeOD(n.nps) / 2) * 1.35
    const yb = n.base[1]
    const ym = n.dir[1] > 0 ? (ys + yb) / 2 : (ys + yb) / 2
    k.cyl(COMP, r, Math.abs(yb - ys) + 0.04, [n.base[0], ym, n.base[2]], 'y', 32)
    k.cyl(COMP, r * 1.15, 0.05, [n.base[0], yb - Math.sign(n.dir[1]) * 0.05, n.base[2]], 'y', 32)
  }
  // end covers + shear-ring studs
  for (const s of [-1, 1]) {
    const xe = s > 0 ? c1 : c0
    k.cyl(COMP, Rb * 0.86, 0.14, [xe + s * 0.07, ys, zc], 'x', 56)
    k.boltCircle('boltXylan', 'nut', 28, Rb * 0.78, [xe + s * 0.13 - (s > 0 ? 0 : 0.0), ys, zc], s > 0 ? 'x' : '-x', 0.04, 0.12, [0.06])
    // dry gas seal housing + bearing housing
    const xb = xe + s * 0.14
    k.cyl(COMP, Rb * 0.42, 0.25, [xb + s * 0.125, ys, zc], 'x', 36)
    k.cyl(COMP, Rb * 0.48, 0.45, [xb + s * 0.47, ys, zc], 'x', 36)
    k.cyl(COMP, Rb * 0.52, 0.04, [xb + s * 0.26, ys, zc], 'x', 36)
    k.boltCircle('boltXylan', 'nut', 12, Rb * 0.5, [xb + s * 0.25, ys, zc], s > 0 ? 'x' : '-x', 0.018, 0.06, [0.04])
    // proximity probes (X-Y) + cable
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4]) {
      const p: V3 = [xb + s * 0.4, ys + Math.sin(a) * Rb * 0.48, zc + Math.cos(a) * Rb * 0.48]
      k.rod('stainless', p, [p[0], ys + Math.sin(a) * (Rb * 0.48 + 0.08), zc + Math.cos(a) * (Rb * 0.48 + 0.08)], 0.015, 10)
    }
    // seal gas vents
    k.tube('tubing', [[xb + s * 0.12, ys + Rb * 0.42, zc], [xb + s * 0.12, ys + Rb + 0.3, zc], [xb + s * 0.12, ys + Rb + 0.3, -Rb * 0.6]], 0.01)
    // support feet at centreline + pedestals
    for (const sz of [-1, 1]) {
      k.box(COMP, [0.3, 0.1, 0.35], [xe + s * 0.05, ys, sz * (Rb + 0.12)])
      k.box(SKID, [0.4, ys - 0.05 - hs, 0.32], [xe + s * 0.05, (ys - 0.05 + hs) / 2, sz * (Rb + 0.12)])
    }
  }
  // thrust bearing end cover at +X and shaft end at -X
  k.dome(COMP, Rb * 0.42, [c1 + 0.14 + 0.7, ys, zc], 'x', Math.PI / 2, 0.4)
  const xCompShaft = c0 - 0.14 - 0.7
  k.cyl('stainless', 0.08, 0.2, [xCompShaft - 0.1, ys, zc], 'x', 20)
  // casing drains + nameplate + tag
  k.cyl(COMP, 0.05, 0.3, [cx, ys - Rb - 0.12, zc], 'y', 14)
  k.box('nameplate', [0.4, 0.25, 0.01], [cx, ys, Rb + 0.003], undefined)
  tagPlate(k, eq.tag, [cx, ys + 0.2, Rb + 0.01], 'z', 0.4)

  // ---------------------------------------------------------------- gearbox
  const cpl = 0.45
  const gbL = 1.15
  const gb1 = xCompShaft - 0.2 - cpl
  const gb0 = gb1 - gbL
  const gx = (gb0 + gb1) / 2
  const gW = Math.min(1.5, SW - 2 * walk - 0.4)
  const gTop = ys + 0.55
  couplingGuard(k, gb1 + 0.05, xCompShaft - 0.18, ys, 0.28, hs, 'safetyYellow')
  k.rbox(GEAR, [gbL, ys - hs, gW], 0.04, [gx, (ys + hs) / 2, zc])
  k.rbox(GEAR, [gbL * 0.92, gTop - ys, gW * 0.8], 0.15, [gx, (ys + gTop) / 2, zc])
  // split flange with bolts
  k.box(GEAR, [gbL + 0.08, 0.06, gW + 0.08], [gx, ys, zc])
  for (let i = 0; i < 8; i++)
    for (const sz of [-1, 1]) {
      const bx = gb0 + 0.05 + (i * (gbL - 0.1)) / 7
      k.cyl('boltXylan', 0.012, 0.12, [bx, ys, sz * (gW / 2 + 0.02)], 'y', 6)
      k.hex('nut', 0.04, 0.02, [bx, ys + 0.04, sz * (gW / 2 + 0.02)])
    }
  // ribs
  for (const sz of [-1, 1]) for (const fx of [-0.3, 0, 0.3]) k.box(GEAR, [0.03, ys - hs - 0.05, 0.1], [gx + fx * gbL, (ys + hs) / 2, sz * (gW / 2 + 0.05)])
  // inspection cover, breather, sight glass, shaft caps
  k.box(GEAR, [gbL * 0.45, 0.04, gW * 0.4], [gx, gTop + 0.02, zc])
  k.around(8, 0.2, [gx, gTop + 0.045, zc], 'y', (p) => k.hex('nut', 0.03, 0.015, p))
  k.cyl('brass', 0.03, 0.12, [gx + gbL * 0.3, gTop + 0.06, zc + gW * 0.2], 'y', 10)
  k.cyl('brass', 0.05, 0.015, [gx, ys - 0.25, zc + gW / 2 + 0.01], 'z', 18)
  k.disc('glass', 0.04, [gx, ys - 0.25, zc + gW / 2 + 0.018], 'z', 18)
  for (const s of [-1, 1]) k.cyl(GEAR, 0.22, 0.1, [s > 0 ? gb1 + 0.05 : gb0 - 0.05, ys, zc], 'x', 32)
  // gearbox oil drain to reservoir
  pipeRun(k, [[gx, hs + 0.1, zc + gW / 2], [gx, hs + 0.1, zc + gW / 2 + 0.15]], 2, OIL)

  // ---------------------------------------------------------------- VSD motor (box frame + CACA cooler)
  const m1 = gb0 - 0.1 - cpl // motor coupling-end shaft
  const avail = m1 - (-SL / 2 + 0.1)
  // the motor gets priority; the lube-oil console takes what is left at the -X end (>= ~1 m)
  const Lm = Math.max(1.6, Math.min(0.9 + Math.pow(eq.motorKw, 0.33) * 0.13, avail - 1.25))
  const mW = Math.min(2.0, SW - 2 * walk - 0.2)
  const mE = m1 - 0.35 // DE bearing pedestal outer
  const mB1 = mE - 0.45 // frame DE face
  const mB0 = mB1 - (Lm - 0.7)
  const mx = (mB0 + mB1) / 2
  const mTop = ys + mW * 0.5
  couplingGuard(k, m1 - 0.05, gb0 - 0.05, ys, 0.3, hs, 'safetyYellow')
  k.rbox(MOTOR, [mB1 - mB0, mTop - hs - 0.12, mW], 0.06, [mx, (mTop + hs + 0.12) / 2, zc])
  // frame stiffeners
  for (let i = 0; i <= 5; i++) for (const sz of [-1, 1]) k.box(MOTOR, [0.05, mTop - hs - 0.2, 0.06], [mB0 + 0.1 + (i * (mB1 - mB0 - 0.2)) / 5, (mTop + hs) / 2, sz * (mW / 2 + 0.02)])
  // base frame / sole plates
  k.box(SKID, [mB1 - mB0 + 0.2, 0.12, mW + 0.2], [mx, hs + 0.06, zc])
  // cooler on top
  const cH = 0.75
  k.rbox(MOTOR, [(mB1 - mB0) * 0.92, cH, mW * 0.92], 0.05, [mx, mTop + cH / 2, zc])
  // cooler tube-bank ends (louvred panels on both sides)
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 9; i++) k.box(MOTOR, [(mB1 - mB0) * 0.7, 0.02, 0.04], [mx, mTop + 0.12 + i * 0.065, sz * (mW * 0.46 + 0.01)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sz * 0.6))
  }
  // external cooling fan hood at NDE end
  k.cyl(MOTOR, mW * 0.32, 0.4, [mB0 - 0.15, mTop + cH * 0.5, zc], 'x', 32)
  k.disc('rubberBlack', mW * 0.3, [mB0 - 0.351, mTop + cH * 0.5, zc], '-x', 32)
  // lifting lugs
  for (const sx of [mB0 + 0.2, mB1 - 0.2]) for (const sz of [-1, 1]) k.torus('nut', 0.06, 0.018, [sx, mTop + cH + 0.04, sz * mW * 0.4], 'x', 6, 16)
  // sleeve-bearing pedestals at both ends with sight glass + oil supply
  for (const xbp of [mB1 + 0.22, mB0 - 0.22]) {
    k.rbox(MOTOR, [0.4, ys - hs + 0.25, 0.7], 0.04, [xbp, (ys + 0.25 + hs) / 2, zc])
    k.cyl(MOTOR, 0.26, 0.42, [xbp, ys, zc], 'x', 32)
    k.cyl('brass', 0.045, 0.02, [xbp, ys - 0.1, 0.36], 'z', 16)
    k.disc('glass', 0.035, [xbp, ys - 0.1, 0.371], 'z', 16)
    pipeRun(k, [[xbp, ys + 0.26, zc], [xbp, ys + 0.45, zc], [xbp, ys + 0.45, -mW / 2 - 0.1], [xbp, hs + 0.15, -mW / 2 - 0.1]], 1, OIL)
  }
  k.cyl('stainless', 0.11, 0.35, [mB1 + 0.45 + 0.1, ys, zc], 'x', 20)
  // terminal boxes (+Z) with cable glands down into skid
  const tz = mW / 2
  k.rbox(MOTOR, [1.1, 0.8, 0.45], 0.04, [mx + 0.3, (hs + mTop) / 2 + 0.05, tz + 0.22])
  k.rbox(MOTOR, [0.5, 0.5, 0.35], 0.04, [mx - 0.8, (hs + mTop) / 2, tz + 0.17])
  for (let i = 0; i < 3; i++) {
    const cxg = mx + 0.0 + i * 0.3
    k.hex('brass', 0.09, 0.06, [cxg, (hs + mTop) / 2 - 0.38, tz + 0.22], 'y')
    k.spline('cable', [[cxg, (hs + mTop) / 2 - 0.42, tz + 0.22], [cxg, hs + 0.25, tz + 0.25], [cxg + 0.1, hs + 0.02, tz + 0.15]], 0.035, 8, 16)
  }
  k.box('nameplate', [0.5, 0.3, 0.01], [mx - 0.2, mTop - 0.25, -mW / 2 - 0.006])
  k.plane(signMaterial('hv'), 0.4, 0.2, [mx + 0.3, (hs + mTop) / 2 + 0.25, tz + 0.448])

  // ---------------------------------------------------------------- lube-oil console (-X end)
  const lx1 = mB0 - 0.5
  const lx0 = -SL / 2 + 0.15
  const lL = lx1 - lx0
  const lW = SW - 2 * walk - 0.15
  const lxm = (lx0 + lx1) / 2
  const tH = 0.9
  k.rbox(OIL, [lL, tH, lW * 0.62], 0.03, [lxm, hs + tH / 2, -lW * 0.19])
  // tank top fittings: two vertical motor-pumps, fill breather, level gauge, heater
  for (const [i, px] of [lx0 + lL * 0.25, lx0 + lL * 0.6].entries()) {
    const pz = -lW * 0.32
    const yt = hs + tH
    k.cyl(OIL, 0.14, 0.18, [px, yt + 0.09, pz], 'y', 24)
    k.cyl(OIL, 0.16, 0.03, [px, yt + 0.195, pz], 'y', 24)
    // vertical TEFC motor (finned)
    k.cyl(MOTOR, 0.17, 0.42, [px, yt + 0.42, pz], 'y', 28)
    for (let f = 0; f < 20; f++) {
      const a = (f / 20) * Math.PI * 2
      k.box(MOTOR, [0.012, 0.36, 0.03], [px + Math.cos(a) * 0.18, yt + 0.42, pz + Math.sin(a) * 0.18], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
    }
    k.cyl(MOTOR, 0.2, 0.12, [px, yt + 0.69, pz], 'y', 28, 0.17)
    k.rbox(MOTOR, [0.18, 0.14, 0.12], 0.02, [px, yt + 0.45, pz + 0.24])
    // discharge up and over to the filters
    pipeRun(k, [[px + 0.12, yt + 0.12, pz], [px + 0.25, yt + 0.12, pz], [px + 0.25, yt + 0.9 + i * 0.08, pz], [lx1 - 0.25, yt + 0.9 + i * 0.08, pz]], 2, OIL)
  }
  k.cyl('brass', 0.05, 0.15, [lx0 + 0.15, hs + tH + 0.08, -lW * 0.05], 'y', 14)
  k.box('stainless', [0.06, tH * 0.7, 0.04], [lx0 + lL * 0.45, hs + tH * 0.5, lW * 0.12 + 0.02])
  k.box('glass', [0.03, tH * 0.6, 0.006], [lx0 + lL * 0.45, hs + tH * 0.5, lW * 0.12 + 0.043])
  k.rbox('actuatorBlue', [0.25, 0.25, 0.15], 0.02, [lx0 + 0.25, hs + tH * 0.55, lW * 0.12 + 0.07])
  // duplex filters with change-over valve
  const fx = lx1 - 0.25
  for (const sz of [-1, 1]) {
    const fz = -lW * 0.19 + sz * 0.22
    k.cyl(OIL, 0.13, 0.75, [fx, hs + tH + 0.42, fz], 'y', 28)
    k.dome(OIL, 0.13, [fx, hs + tH + 0.795, fz], 'y', Math.PI / 2, 0.5)
    k.cyl(OIL, 0.15, 0.04, [fx, hs + tH + 0.72, fz], 'y', 28)
    k.around(8, 0.14, [fx, hs + tH + 0.745, fz], 'y', (p) => k.hex('nut', 0.025, 0.015, p))
  }
  k.box('valveBody', [0.15, 0.15, 0.25], [fx, hs + tH + 0.15, -lW * 0.19])
  k.cyl('handwheel', 0.012, 0.35, [fx, hs + tH + 0.25, -lW * 0.19], 'x', 8)
  smallGauge(k, [fx - 0.12, hs + tH + 0.5, -lW * 0.19], '-x', dialMaterial('bar', 10), 0.1)
  // twin oil coolers (small shell & tube) on stands along +Z of tank
  for (const [i, cy] of [hs + 0.35, hs + 0.8].entries()) {
    const cz = lW * 0.3
    k.cyl(OIL, 0.13, lL * 0.75, [lxm, cy, cz], 'x', 28)
    for (const s of [-1, 1]) {
      k.cyl(OIL, 0.16, 0.05, [lxm + s * lL * 0.375, cy, cz], 'x', 28)
      k.dome(OIL, 0.13, [lxm + s * (lL * 0.375 + 0.025), cy, cz], s > 0 ? 'x' : '-x', Math.PI / 2, 0.5)
      k.cyl(OIL, 0.04, 0.16, [lxm + s * lL * 0.3, cy + 0.17, cz], 'y', 12)
    }
    if (i === 0) for (const s of [-1, 1]) k.box(SKID, [0.08, cy - hs - 0.1, 0.25], [lxm + s * lL * 0.3, (cy + hs) / 2 - 0.05, cz])
    else for (const s of [-1, 1]) k.box(SKID, [0.08, 0.28, 0.08], [lxm + s * lL * 0.3, cy - 0.21, cz])
  }
  // accumulator bottle
  k.cyl(OIL, 0.12, 0.6, [lx1 - 0.1, hs + 0.45, lW * 0.05], 'y', 24)
  k.dome(OIL, 0.12, [lx1 - 0.1, hs + 0.75, lW * 0.05], 'y', Math.PI / 2, 1)
  // oil supply + return headers along the skid (-Z side of the train) with drops to bearings
  const zh = -(SW / 2 - walk) + 0.12
  pipeRun(k, [[fx, hs + tH + 0.05, -lW * 0.19 - 0.12], [fx, hs + 0.2, -lW * 0.19 - 0.12], [fx, hs + 0.2, zh], [c1 + 0.7, hs + 0.2, zh]], 2, OIL)
  pipeRun(k, [[lx1 - 0.6, hs + 0.08, zh + 0.15], [c1 + 0.8, hs + 0.08, zh + 0.15]], 3, OIL)
  for (const xb of [c0 - 0.5, c1 + 0.6, gx - 0.3, gx + 0.3]) {
    pipeRun(k, [[xb, hs + 0.2, zh], [xb, ys + 0.35, zh], [xb, ys + 0.35, zc - 0.25]], 1, 'stainless')
    pipeRun(k, [[xb + 0.12, ys - 0.25, zc - 0.25], [xb + 0.12, ys - 0.25, zh + 0.15], [xb + 0.12, hs + 0.08, zh + 0.15]], 1.5, OIL)
  }

  // ---------------------------------------------------------------- dry gas seal panel (+X end)
  const px0 = c1 + 0.14 + 0.85
  if (SL / 2 - px0 > 0.4) {
    const pw = Math.min(0.8, SL / 2 - px0 - 0.1)
    const ppx = px0 + pw / 2 + 0.05
    const ppz = -(SW / 2 - walk) + 0.4
    k.box('structSteel', [0.06, 1.6, 0.06], [ppx - pw / 2, hs + 0.8, ppz])
    k.box('structSteel', [0.06, 1.6, 0.06], [ppx + pw / 2, hs + 0.8, ppz])
    k.box('stainless', [pw, 1.0, 0.02], [ppx, hs + 1.0, ppz + 0.04])
    for (let i = 0; i < 3; i++) smallGauge(k, [ppx - pw * 0.3 + i * pw * 0.3, hs + 1.3, ppz + 0.1], 'z', dialMaterial('bar', 160), 0.09)
    for (let i = 0; i < 3; i++) {
      k.box('valveBody', [0.06, 0.06, 0.08], [ppx - pw * 0.3 + i * pw * 0.3, hs + 0.95, ppz + 0.08])
      k.box('stainless', [0.08, 0.14, 0.06], [ppx - pw * 0.3 + i * pw * 0.3, hs + 0.75, ppz + 0.08])
      k.tube('tubing', [[ppx - pw * 0.3 + i * pw * 0.3, hs + 0.68, ppz + 0.08], [ppx - pw * 0.3 + i * pw * 0.3, hs + 0.55, ppz + 0.08], [c1 + 0.5, hs + 0.55, ppz + 0.08], [c1 + 0.5, ys - Rb * 0.3, zc - Rb * 0.45]], 0.008)
    }
  }
  // F&G detector post + sign
  k.rod('structSteel', [-SL / 2 + 0.25, hs, SW / 2 - walk - 0.1], [-SL / 2 + 0.25, hs + 2.4, SW / 2 - walk - 0.1], 0.03, 10)
  k.cyl('actuatorRed', 0.06, 0.12, [-SL / 2 + 0.25, hs + 2.35, SW / 2 - walk + 0.0], 'z', 16)
  k.plane(signMaterial('ler', `${eq.tag}  ${eq.name.toUpperCase()}`), 1.2, 0.3, [mx, hs + 0.25, SW / 2 + 0.005])
  return k.build()
}

export function CompressorPackageModel({ eq }: { eq: CompressorPackage }) {
  const built = useMemo(() => buildCompressor(eq), [eq])
  const m = materials()
  return (
    <group>
      <KitMesh data={built} />
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} paintMaterial={m.equipmentPaint} />
      ))}
    </group>
  )
}
