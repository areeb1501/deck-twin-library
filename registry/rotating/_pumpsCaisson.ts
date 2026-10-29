// Vertical line-shaft caisson pump below the driver (API 610 VS1 / NFPA 20): caisson, column and bowls, discharge head with side outlet.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { NPS_SIZES, flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { TAU, annulus, clamp, faceQ, flangeLen, flangedBranch, gusset, openTube, pipeGauge } from './_pumps'

export interface CaissonInput {
  caissonDiameter: number
  depth: number
  dischargeNps: number
  rating: Rating
  stages: number
}

/** Shared layout for the caisson pump geometry and its ports. Origin: caisson top flange centre at deck level, discharge along +X. */
export function caissonLayout(p: CaissonInput) {
  const R = Math.max(p.caissonDiameter, 0.4) / 2
  const dNps = p.dischargeNps
  const dOD = pipeOD(dNps)
  const fits = NPS_SIZES.filter((s) => pipeOD(s) <= 2 * R * 0.6)
  const colNps = fits.find((s) => s >= dNps + 2) ?? fits[fits.length - 1] ?? dNps
  const colR = pipeOD(colNps) / 2
  const rb = clamp(Math.max(colR + 0.05, (dOD / 2) * 1.3), 0.14, R + 0.05)
  const fOD = flangeDims(dNps, p.rating).od
  const yOut = Math.max(0.6 + dOD / 2, fOD / 2 + 0.3)
  const yTop = yOut + Math.max(dOD / 2, rb * 0.8) + 0.14
  const rs = clamp(0.018 + colR * 0.12, 0.025, 0.06)
  const xFace = Math.max(rb + 0.3, R + 0.25) + flangeLen(dNps, p.rating)
  const bowlR = clamp(Math.min(R - 0.06, colR * 1.9), colR * 1.15, R - 0.03)
  const stages = clamp(Math.round(p.stages), 1, 10)
  // never shorter than the bowl stack, bell, discharge case and one column joint
  const depth = Math.max(p.depth, 1.1 + bowlR * (0.75 + stages * 0.95 + 0.8) + 0.8)
  return { R, depth, dNps, rating: p.rating, dOD, colR, rb, yOut, yTop, rs, xFace, bowlR, stages }
}
export type CaissonLayout = ReturnType<typeof caissonLayout>

const CAISSON = () => paint('#6f7774', { metalness: 0.3, roughness: 0.65, clearcoat: 0, weather: 1 })
const COLUMN = () => paint('#55697a', { metalness: 0.35, roughness: 0.5, clearcoat: 0 })
const BOWL = () => paint('#2f5f8a', { metalness: 0.3, roughness: 0.45 })
const ANODE = () => paint('#9a9d9b', { metalness: 0.55, roughness: 0.75, clearcoat: 0 })
const DARK: MatKey = 'equipmentPaintDark'

// the quadrant facing the default camera (+X..+Z) is removed in cutaway mode
const CUT0 = Math.PI / 2
const CUT1 = TAU
const inCut = (a: number) => {
  const phi = (Math.atan2(Math.cos(a), Math.sin(a)) + TAU) % TAU // lathe phi of a point at angle a (x = cos a, z = sin a)
  return phi < CUT0
}

/** Caisson: deck support plate, top flange, shell, guide clamps every 6 m, anodes, barred open end. */
export function caisson(k: Kit, L: CaissonLayout, cutaway = false) {
  const { R, depth: Lc } = L
  const shell = CAISSON()
  const flR = R + 0.11
  const cageH = Math.min(1.6, Lc * 0.12)
  const yCage = -Lc + cageH
  const seg = 48
  const p0 = cutaway ? CUT0 : 0
  const pl = cutaway ? CUT1 - CUT0 : TAU
  const ring = (mat: MatKey, r0: number, r1: number, y0: number, y1: number) =>
    k.lathe(mat, [[r0, y0], [r1, y0], [r1, y1], [r0, y1], [r0, y0]], [0, 0, 0], 'y', seg, p0, pl)

  const sp = 2 * flR + 0.4
  k.box(DARK, [sp, 0.05, sp], [0, -0.025, 0])
  for (let i = 0; i < 8; i++) gusset(k, DARK, (i / 8) * TAU + Math.PI / 8, R, sp / 2 - 0.04, -0.05, -0.45, 0.02)
  annulus(k, DARK, R - 0.014, flR, 0, 0.05, [0, 0, 0], 'y', seg)
  ring(shell, R - 0.014, R, yCage, -0.05)
  for (let y = -12; y > yCage + 0.5; y -= 12) ring(shell, R, R + 0.004, y - 0.012, y + 0.012)

  for (let y = -6; y > yCage + 1; y -= 6) {
    ring(DARK, R, R + 0.035, y - 0.15, y + 0.15)
    for (const s of [-1, 1]) ring(DARK, R + 0.035, R + 0.06, y + s * 0.15 - 0.012, y + s * 0.15 + 0.012)
    for (const s of [-1, 1]) {
      const z = s * (R + 0.035 + 0.07)
      for (const dx of [-0.028, 0.028]) k.box(DARK, [0.022, 0.28, 0.14], [dx, y, z])
      for (const dy of [-0.08, 0.08]) {
        k.cyl('boltXylan', 0.011, 0.15, [0, y + dy, z + 0.02], 'x', 8)
        for (const sx of [-1, 1]) k.hex('nut', 0.036, 0.018, [sx * 0.05, y + dy, z + 0.02], 'x')
      }
    }
    // guide-frame stubs towards the jacket bracing
    for (const s of [-1, 1]) {
      if (cutaway && s > 0) continue
      const x0 = s * (R + 0.035)
      const x1 = s * (R + 0.75)
      k.box(DARK, [Math.abs(x1 - x0), 0.012, 0.2], [(x0 + x1) / 2, y + 0.14, 0])
      k.box(DARK, [Math.abs(x1 - x0), 0.012, 0.2], [(x0 + x1) / 2, y - 0.14, 0])
      k.box(DARK, [Math.abs(x1 - x0), 0.28, 0.012], [(x0 + x1) / 2, y, 0])
    }
  }

  const anodeRows = Math.min(3, Math.floor((Lc - cageH - 2) / 4))
  for (let r = 0; r < anodeRows; r++) {
    const ya = yCage + 1.6 + r * 4
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + r * 0.6 + 2.2
      if (cutaway && inCut(a)) continue
      const ux = Math.cos(a)
      const uz = Math.sin(a)
      for (const dy of [-0.5, 0.5]) k.rod(DARK, [ux * R, ya + dy, uz * R], [ux * (R + 0.13), ya + dy, uz * (R + 0.13)], 0.012, 6)
      k.box(ANODE(), [0.13, 0.85, 0.12], [ux * (R + 0.15), ya, uz * (R + 0.15)], faceQ([ux, 0, uz]))
    }
  }

  const nBars = Math.max(16, Math.round((TAU * R) / 0.11))
  for (let i = 0; i < nBars; i++) {
    const a = (i / nBars) * TAU
    if (cutaway && inCut(a)) continue
    k.rod(shell, [Math.cos(a) * (R - 0.012), yCage + 0.02, Math.sin(a) * (R - 0.012)], [Math.cos(a) * (R - 0.012), -Lc + 0.06, Math.sin(a) * (R - 0.012)], 0.016, 6)
  }
  ring(DARK, R - 0.03, R + 0.02, yCage - 0.03, yCage + 0.05)
  ring(DARK, R - 0.03, R + 0.02, yCage - cageH / 2 - 0.02, yCage - cageH / 2 + 0.02)
  ring(DARK, R - 0.04, R + 0.03, -Lc, -Lc + 0.08)
}

/** Column (flanged 3 m sections, line shaft, bearing spiders), bowl assembly (one bowl per stage), suction bell and basket strainer. */
export function pumpColumn(k: Kit, L: CaissonLayout) {
  const { depth: Lc, colR, rs, bowlR, stages: nSt } = L
  const bowl = BOWL()
  const col = COLUMN()
  const STEEL: MatKey = 'internalsSteel'
  const hSt = bowlR * 0.95
  const yBell = -Lc + Math.min(1.1, Lc * 0.12)
  const hBell = bowlR * 0.75

  const hBk = Math.min(0.45, yBell + Lc - 0.1)
  const rBk = bowlR * 0.95
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU
    k.rod(STEEL, [Math.cos(a) * rBk, yBell - hBk, Math.sin(a) * rBk], [Math.cos(a) * rBk * 1.08, yBell, Math.sin(a) * rBk * 1.08], 0.008, 5)
  }
  annulus(k, STEEL, 0, rBk + 0.01, yBell - hBk - 0.012, yBell - hBk, [0, 0, 0], 'y', 32)
  annulus(k, STEEL, rBk * 0.95, rBk * 1.1, yBell - hBk * 0.5 - 0.01, yBell - hBk * 0.5 + 0.01, [0, 0, 0], 'y', 32)
  k.lathe(bowl, [
    [bowlR * 1.0, yBell + 0.02],
    [bowlR * 1.22, yBell],
    [bowlR * 1.24, yBell + 0.03],
    [bowlR * 1.05, yBell + hBell * 0.35],
    [bowlR * 0.88, yBell + hBell],
    [bowlR * 0.74, yBell + hBell],
    [bowlR * 0.82, yBell + hBell * 0.5],
    [bowlR * 1.0, yBell + 0.02],
  ], [0, 0, 0], 'y', 36)
  const yb0 = yBell + hBell
  for (let i = 0; i < nSt; i++) {
    const y0 = yb0 + i * hSt
    k.lathe(bowl, [
      [bowlR * 0.84, y0],
      [bowlR * 0.97, y0 + hSt * 0.06],
      [bowlR, y0 + hSt * 0.2],
      [bowlR, y0 + hSt * 0.62],
      [bowlR * 0.9, y0 + hSt * 0.9],
      [bowlR * 0.84, y0 + hSt],
    ], [0, 0, 0], 'y', 36)
    annulus(k, bowl, bowlR * 0.8, bowlR * 1.05, y0 - 0.018, y0 + 0.018, [0, 0, 0], 'y', 36)
    k.boltCircle('boltXylan', 'nut', 8, bowlR * 0.96, [0, y0 - 0.03, 0], 'y', 0.014, 0.07, [0.006, 0.06])
  }
  const yb1 = yb0 + nSt * hSt
  annulus(k, bowl, bowlR * 0.8, bowlR * 1.05, yb1 - 0.018, yb1 + 0.018, [0, 0, 0], 'y', 36)
  const yDc = yb1 + bowlR * 0.8
  k.lathe(bowl, [
    [bowlR * 0.86, yb1],
    [bowlR * 0.82, yb1 + bowlR * 0.2],
    [colR * 1.05, yDc - 0.04],
    [colR * 1.05, yDc],
  ], [0, 0, 0], 'y', 36)

  const yTopCol = 0.08
  openTube(k, col, [0, yDc, 0], [0, yTopCol, 0], colR, 32)
  const joints: number[] = [yDc + 0.04]
  for (let y = yTopCol - 3; y > yDc + 0.5; y -= 3) joints.push(y)
  joints.push(yTopCol - 0.06)
  const fR = colR + 0.065
  for (const y of joints) {
    annulus(k, col, colR - 0.004, fR, y - 0.035, y + 0.035, [0, 0, 0], 'y', 32)
    k.boltCircle('boltXylan', 'nut', 8, colR + 0.035, [0, y - 0.06, 0], 'y', 0.016, 0.12, [0.012, 0.108])
  }
  k.cyl(STEEL, rs, L.yTop + 0.25 - (yb0 + 0.05), [0, (L.yTop + 0.25 + yb0 + 0.05) / 2, 0], 'y', 14)
  for (const y of joints.slice(1, -1)) {
    annulus(k, STEEL, colR * 0.86, colR * 0.94, y - 0.04, y + 0.04, [0, 0, 0], 'y', 24)
    k.cyl('brass', rs * 1.7, 0.14, [0, y, 0], 'y', 14)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU
      k.rod(STEEL, [Math.cos(a) * rs * 1.6, y, Math.sin(a) * rs * 1.6], [Math.cos(a) * colR * 0.88, y, Math.sin(a) * colR * 0.88], 0.012, 6)
    }
    k.cyl(STEEL, rs * 1.6, 0.16, [0, y + 0.35, 0], 'y', 14)
  }
}

/** Fabricated discharge head on a soleplate: gusseted barrel, side outlet with WN flange at the port, stuffing box, ARV, gauge, tag. */
export function dischargeHead(k: Kit, L: CaissonLayout, drv: MatKey, tag?: string) {
  const { R, rb, yOut, yTop, dOD, rs, xFace, dNps, rating } = L
  const flR = R + 0.11
  const yHb = 0.13

  k.box(DARK, [2 * flR + 0.12, 0.03, 2 * flR + 0.12], [0, 0.065, 0])
  annulus(k, drv, 0, flR - 0.01, 0.08, yHb, [0, 0, 0], 'y', 48)
  k.boltCircle('boltXylan', 'nut', Math.max(8, Math.round((TAU * (R + 0.06)) / 0.16)), R + 0.06, [0, 0.0, 0], 'y', 0.022, 0.17, [0.145])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p: V3 = [sx * (flR + 0.02), 0.08, sz * (flR + 0.02)]
      k.hex('nut', 0.04, 0.025, [p[0], p[1] + 0.012, p[2]])
      k.cyl('boltXylan', 0.01, 0.06, [p[0], p[1] + 0.03, p[2]], 'y', 6)
    }

  openTube(k, drv, [0, yHb, 0], [0, yTop, 0], rb, 40)
  k.lathe(drv, [[rb * 1.5, yHb], [rb * 1.18, yHb + 0.06], [rb, yHb + 0.14]], [0, 0, 0], 'y', 40)
  for (let i = 0; i < 6; i++) gusset(k, drv, (i / 6) * TAU + Math.PI / 6, rb * 0.98, flR - 0.05, yHb, Math.min(0.5, yOut - dOD / 2 - yHb - 0.04), 0.018)
  annulus(k, drv, 0, rb + 0.05, yTop - 0.04, yTop, [0, 0, 0], 'y', 40)
  k.boltCircle('boltXylan', 'nut', 8, rb + 0.025, [0, yTop - 0.06, 0], 'y', 0.014, 0.08, [0.07])

  // side outlet: branch + reinforcing pad + WN flange at the discharge port
  flangedBranch(k, drv, [0, yOut, 0], [xFace, yOut, 0], dNps, rating, 'STD')
  k.cyl(drv, dOD / 2 + 0.03, 0.03, [rb + 0.012, yOut, 0], 'x', 32)
  const xEnd = xFace - flangeLen(dNps, rating)
  k.box(drv, [Math.max(0.05, xEnd - rb - 0.06), Math.max(0.05, yOut - dOD / 2 - yHb), 0.016], [rb + (xEnd - rb - 0.06) / 2, (yOut - dOD / 2 + yHb) / 2, 0])

  // stuffing box, gland, leak-off
  const ySb = yTop
  k.cyl(drv, rs * 3.4, 0.16, [0, ySb + 0.08, 0], 'y', 28)
  annulus(k, drv, rs * 1.2, rs * 3.9, ySb + 0.15, ySb + 0.18, [0, 0, 0], 'y', 28)
  k.cyl('stainless', rs * 2.6, 0.05, [0, ySb + 0.205, 0], 'y', 24)
  annulus(k, 'stainless', rs * 1.1, rs * 3.4, ySb + 0.23, ySb + 0.245, [0, 0, 0], 'y', 24)
  for (const s of [-1, 1]) {
    k.cyl('boltXylan', 0.008, 0.12, [0, ySb + 0.22, s * rs * 3.0], 'y', 6)
    k.hex('nut', 0.026, 0.014, [0, ySb + 0.255, s * rs * 3.0])
  }
  k.tube('tubing', [[-rs * 3.4, ySb + 0.06, 0], [-rb - 0.06, ySb + 0.03, 0], [-rb - 0.06, yHb + 0.04, 0], [-rb - 0.06, yHb + 0.04, rb * 0.9]], 0.008)

  // air release / vacuum breaker valve on the outlet
  const xa = rb + (xEnd - rb) * 0.55
  const yTopBr = yOut + dOD / 2
  k.cyl(drv, 0.03, 0.08, [xa, yTopBr + 0.03, 0], 'y', 14)
  annulus(k, 'flangeSteel', 0, 0.06, yTopBr + 0.07, yTopBr + 0.09, [xa, 0, 0], 'y', 18)
  k.box('valveBody', [0.08, 0.1, 0.07], [xa, yTopBr + 0.14, 0])
  k.cyl('handwheel', 0.006, 0.08, [xa, yTopBr + 0.23, 0], 'y', 6)
  k.handwheel('handwheel', 0.1, [xa, yTopBr + 0.27, 0], 'y')
  k.cyl('castIron', 0.065, 0.16, [xa + 0.13, yTopBr + 0.2, 0], 'y', 20)
  k.dome('castIron', 0.065, [xa + 0.13, yTopBr + 0.28, 0], 'y', Math.PI / 2, 0.6, 20)
  k.rod('castIron', [xa, yTopBr + 0.14, 0], [xa + 0.13, yTopBr + 0.14, 0], 0.022, 10)
  const zDr = -dOD / 2 - 0.12
  k.tube('tubing', [[xa + 0.19, yTopBr + 0.24, 0], [xa + 0.19, yTopBr + 0.24, zDr], [xa + 0.19, yHb + 0.02, zDr]], 0.012)
  pipeGauge(k, [rb + (xEnd - rb) * 0.2, yTopBr, 0], [0, 0, 1], 25)

  k.hex('nut', 0.04, 0.03, [-rb * 1.2, yHb + 0.02, -rb * 0.6])
  for (const s of [-1, 1]) {
    k.box(drv, [0.12, 0.1, 0.02], [0, yTop + 0.05, s * (rb + 0.02)])
    k.torus('nut', 0.025, 0.007, [0, yTop + 0.08, s * (rb + 0.02)], 'z', 6, 14)
  }
  const ty = (yHb + yTop) / 2 + 0.05
  const tq = new THREE.Vector3(0, 0, 1)
  if (tag) tagPlate(k, tag, [0, ty, rb + 0.003], tq.toArray() as V3, 0.16)
}
