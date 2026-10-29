// Gas turbine generator package (API 616, ISO 3977): acoustic enclosure, roof filter house, exhaust silencer and stack, gearbox, generator, lube console, dual-fuel skid.
import { useEffect, useMemo } from 'react'
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { ladder, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, guardedCoupling, type RotorSpec } from '../lib/rotors'
import { signMaterial } from '../lib/textures'
import { pipeOD, type Rating } from '../lib/standards'
import { SKID, baseFrame, clamp, faceQ, gasDetector, gearbox, lineRun, louvre, lubeConsole, roofFan } from './_compressors-kit'
import { TRIM, co2Cabinet, enclosure, exhaustCollector, exhaustStack, filterHouse, fuelTrain, gtCore, gtMats, inletPlenum } from './_compressors-gt'

export interface GasTurbineGeneratorProps {
  /** ISO site rating, MW */
  mw?: number
  fuel?: 'gas' | 'dual'
  fuelNps?: number
  rating?: Rating
  /** stack height above the enclosure roof, m */
  stackHeight?: number
  /** leave out the +Z enclosure wall to show the machinery */
  cutaway?: boolean
  /** swing the enclosure doors open */
  doorsOpen?: boolean
  tag?: string
  running?: boolean
}

export const defaults = {
  mw: 25,
  fuel: 'dual' as 'gas' | 'dual',
  fuelNps: 3,
  rating: 600 as Rating,
  stackHeight: 10,
  cutaway: false,
  doorsOpen: false,
  tag: 'GT-8100A',
  running: true,
}

type P = typeof defaults

const NECK = 0.3

function layout(p: P) {
  const MW = clamp(p.mw, 1, 60)
  const SL = clamp(8 + 0.3 * MW, 9, 22) // typical package lengths: SGT-400 ~14 m, LM2500 ~18 m
  const SW = clamp(2.9 + 0.07 * MW, 3.1, 6.2)
  const hs = clamp(0.4 + SL * 0.012, 0.45, 0.65)
  const H = clamp(3.3 + 0.075 * MW, 3.6, 7.5)
  const m = clamp(SW * 0.17, 0.55, 1.0)
  const yFuel = 0.9
  return { MW, SL, SW, hs, H, m, xGas: SL * 0.15, xLiq: SL * 0.05, yFuel, faceZ: -SW / 2 - NECK }
}

export function ports(props: GasTurbineGeneratorProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  const out = [port('fuel-gas', 'Fuel gas', [L.xGas, L.yFuel, L.faceZ], [0, 0, -1], p.fuelNps, p.rating)]
  if (p.fuel === 'dual') out.push(port('diesel', 'Liquid fuel (diesel)', [L.xLiq, L.yFuel, L.faceZ], [0, 0, -1], 2, 150, 'utility'))
  return out
}

export function GasTurbineGenerator(props: GasTurbineGeneratorProps & GroupProps) {
  const { mw, fuel, fuelNps, rating, stackHeight, cutaway, doorsOpen, tag, running, ...group } = { ...defaults, ...props }
  const { built, rotors } = useMemo(
    () => build({ mw, fuel, fuelNps, rating, stackHeight, cutaway, doorsOpen, tag, running }),
    [mw, fuel, fuelNps, rating, stackHeight, cutaway, doorsOpen, tag, running],
  )
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default GasTurbineGenerator

function build(p: P) {
  const k = new Kit()
  const M = gtMats()
  const { MW, SL, SW, hs, H, m } = layout(p)
  const t = 0.08
  const z0 = -SW / 2 + m
  const z1 = SW / 2 - m
  const encW = z1 - z0
  const hw = encW / 2 - t
  const ex0 = -SL / 2 + 0.2
  const ex1 = SL / 2 - 0.2

  // machine sizes: core reference radius, stack, collector
  const R = Math.min(0.25 + 0.11 * Math.sqrt(MW), (hw - 0.2) / 1.35, (H - hs - 0.6) / 2.7)
  const ys = hs + 0.2 + 1.3 * R
  const Rs = clamp(0.1 + 0.2 * Math.sqrt(MW), 0.45, Math.min(1.5, (SW / 2 - 0.05) / 1.25))
  const Rsil = Math.min(Rs * 1.28, SW / 2 - 0.05, 1.95)
  const xst = SL / 2 - Math.max(2.0, Rsil + 0.45)
  const cW = 1.3 * R
  const Rd = Math.min(Rs, cW, hw - 0.12)
  const cHL = Rd + 0.2
  const xc1 = xst - cHL

  // stations along X: exciter, generator, gearbox, plenum, core, collector
  const xa = ex0 + t + 0.15
  const A = xc1 - xa
  const sGen1 = xa + 0.34 * A
  const sGb0 = sGen1 + 0.05 * A
  const sGb1 = sGb0 + 0.11 * A
  const sPl0 = sGb1 + 0.04 * A
  const sPl1 = sPl0 + 0.11 * A
  const xc0 = sPl1
  const Lc = xc1 - xc0
  const xp = (sPl0 + sPl1) / 2
  const xcomb = xc0 + 0.48 * Lc
  const gx = (sGb0 + sGb1) / 2

  baseFrame(k, SL, SW, hs)

  // door positions avoid the fuel skid, CO₂ cabinet, lube console and ladder
  const L0 = layout(p)
  const x1 = L0.xGas
  const x2 = p.fuel === 'dual' ? L0.xLiq : x1
  const gtL = clamp(SL * 0.14, 1.4, 2.2)
  const xpen = Math.max(x1, x2) + gtL
  const lcL = clamp(SL * 0.2, 1.8, 3.2)
  const xl = clamp(gx, -SL / 2 + 0.4 + lcL / 2, SL / 2 - 0.4 - lcL / 2)
  const cabL = clamp(SL * 0.09, 1.0, 1.6)
  const cab0 = -SL / 2 + 0.3
  const xLad = ex0 + 0.55
  const xNer = cab0 + cabL + 0.65
  const blockedNeg: [number, number][] = [[Math.min(x1, x2) - 0.5, xpen + 0.5], [cab0 - 0.2, xNer + 0.6]]
  const blockedPos: [number, number][] = [[xl - lcL / 2 - 0.3, xl + lcL / 2 + 0.3], [xLad - 0.5, xLad + 0.5]]
  const freeX = (want: number, w: number, blocked: [number, number][]) => {
    const lo = ex0 + w / 2 + 0.25
    const hi = ex1 - w / 2 - 0.25
    for (let d = 0; d < SL; d += 0.1)
      for (const x of [want + d, want - d]) {
        if (x < lo || x > hi) continue
        if (blocked.every(([a, b]) => x + w / 2 < a || x - w / 2 > b)) return x
      }
    return null
  }
  const pick = (xs: (number | null)[]) => {
    const out: number[] = []
    for (const x of xs) if (x !== null && out.every((q) => Math.abs(q - x) > 1.2)) out.push(x)
    return out
  }
  const gMid = (xa + sGen1) / 2
  const doorsPz = pick([freeX(gMid, 0.9, blockedPos), freeX(xcomb + 0.5, 0.9, blockedPos)])
  const doorsNz = pick([freeX(gMid, 0.9, blockedNeg), freeX(xst, 0.9, blockedNeg)])
  const endW = encW - 1.45
  const wEndN = endW >= 1.3 ? Math.min(1.8, endW) : 0.85
  const cEndP = encW / 2 - 0.65
  const { dH, wallH } = enclosure(k, { ex0, ex1, z0, z1, hs, H, t, doorsPz, doorsNz, endNx: wEndN, endPx: [cEndP, 0.85], cutaway: p.cutaway, open: p.doorsOpen, monorail: [sPl1 + 0.15, xst - Rd - 0.2] })
  k.at([ex0, hs, 0], faceQ('-x'), () => louvre(k, Math.min(1.2, encW * 0.35), 0.5, 0, Math.min(wallH - 0.45, dH + 0.55)))
  k.at([ex1, hs, 0], faceQ('x'), () => {
    const lh = Math.min(0.9, wallH * 0.25)
    const lw = Math.min(1.6, encW * 0.42)
    louvre(k, lw, lh, -encW / 2 + lw / 2 + 0.25, wallH - lh / 2 - 0.3)
  })
  ladder(k, [xLad, hs, z1 + 0.2], H, [0, 0, 1], { cage: m >= 0.7 })
  gasDetector(k, [ex1 + 0.1, H - 0.9, encW / 2 - 0.25])
  const signX = clamp(xcomb - 0.6, ex0 + 1.4, ex1 - 1.4)
  if (!p.cutaway) {
    k.plane(signMaterial('ler', `${p.tag}  GAS TURBINE GENERATOR  ${Math.round(MW)} MW`), 2.4, 0.6, [signX, H - 0.6, z1 + 0.02])
    tagPlate(k, p.tag, [signX + 1.45, H - 0.6, z1 + 0.02], 'z', 0.3)
  } else tagPlate(k, p.tag, [signX, H - 0.6, z0 - 0.02], '-z', 0.3)

  // generator with brushless exciter, CACW cooler, line-side terminal box
  const gR = sGen1 - xa
  const eL = clamp(0.14 * gR, 0.35, 0.8)
  const gF0 = xa + eL + 0.3
  const gF1 = sGen1 - 0.45
  const gFL = gF1 - gF0
  const gfx = (gF0 + gF1) / 2
  const gBH = clamp(1.0 + 0.035 * MW, 1.0, H - hs - 1.2)
  const gWd = Math.min(2 * hw - 0.7, 1.2 + 0.035 * MW)
  const gCH = clamp(H - hs - 0.45 - 0.12 - gBH, 0, 0.7)
  const yg = hs + 0.12 + gBH * 0.5
  const gTop = hs + 0.12 + gBH
  k.box(SKID, [gFL + eL + 0.9, 0.12, gWd + 0.25], [(xa + sGen1) / 2, hs + 0.06, 0])
  k.rbox(M.GEN, [gFL, gBH, gWd], 0.06, [gfx, hs + 0.12 + gBH / 2, 0])
  const nr = Math.max(3, Math.round(gFL / 0.5))
  for (let i = 0; i <= nr; i++)
    for (const s of [-1, 1]) k.box(M.GEN, [0.05, gBH - 0.12, 0.06], [gF0 + 0.08 + (i * (gFL - 0.16)) / nr, hs + 0.12 + gBH / 2, s * (gWd / 2 + 0.02)])
  for (const s of [-1, 1]) k.box(M.GEN, [gFL + 0.06, 0.08, 0.1], [gfx, gTop - 0.04, s * (gWd / 2 + 0.02)])
  if (gCH > 0.25) {
    k.rbox(M.GEN, [gFL * 0.86, gCH, gWd * 0.86], 0.05, [gfx, gTop + gCH / 2, 0])
    for (const s of [-1, 1]) {
      const cx = gfx + s * gFL * 0.3
      k.cyl('flangeSteel', 0.07, 0.25, [cx, gTop + gCH * 0.5, -gWd * 0.43 - 0.1], 'z', 16)
      lineRun(k, [[cx, gTop + gCH * 0.5, -gWd * 0.43 - 0.2], [cx, gTop + gCH * 0.5, -hw + 0.12], [cx, hs + 0.2, -hw + 0.12]], 3, 'stainless')
    }
  }
  for (const sx of [gF0 + 0.25, gF1 - 0.25]) for (const s of [-1, 1]) k.torus('nut', 0.06, 0.018, [sx, gTop + 0.04, s * gWd * 0.42], 'x', 6, 14)
  for (const xb of [gF0 - 0.17, gF1 + 0.17]) {
    k.rbox(M.GEN, [0.34, yg - hs + 0.15, Math.min(0.85, gWd * 0.6)], 0.04, [xb, (yg + 0.15 + hs + 0.12) / 2, 0])
    k.cyl(M.GEN, 0.24, 0.38, [xb, yg, 0], 'x', 28)
    k.cyl('brass', 0.045, 0.02, [xb, yg - 0.12, 0.2], 'z', 12)
  }
  k.cyl('stainless', 0.1, sGen1 - gF1 - 0.3, [(gF1 + 0.3 + sGen1) / 2, yg, 0], 'x', 20)
  const eR = Math.min(gBH, gWd) * 0.28
  k.cyl(M.GEN, eR, eL, [xa + eL / 2 + 0.05, yg, 0], 'x', 32)
  k.dome(M.GEN, eR, [xa + 0.05, yg, 0], '-x', Math.PI / 2, 0.35, 28)
  for (let i = 0; i < 6; i++) k.cyl(M.GEN, eR * 1.04, 0.025, [xa + 0.1 + (i * (eL - 0.1)) / 5, yg, 0], 'x', 32)
  const tbD = clamp(hw - gWd / 2 - 0.05, 0.15, 0.45)
  const tbL = Math.min(1.2, gFL * 0.35)
  const tbH = gBH * 0.55
  const tbx = gfx + gFL * 0.15
  const tbY = hs + 0.25 + tbH / 2
  k.rbox(M.GEN, [tbL, tbH, tbD], 0.03, [tbx, tbY, gWd / 2 + tbD / 2])
  k.box(M.GEN, [tbL - 0.08, tbH - 0.08, 0.02], [tbx, tbY, gWd / 2 + tbD + 0.01])
  k.around(8, Math.min(tbL, tbH) * 0.42, [tbx, tbY, gWd / 2 + tbD + 0.025], 'z', (q) => k.hex('nut', 0.025, 0.012, q, 'z'), Math.PI / 8)
  k.plane(signMaterial('hv'), Math.min(0.4, tbL * 0.5), Math.min(0.2, tbL * 0.25), [tbx, tbY + tbH * 0.2, gWd / 2 + tbD + 0.021])
  for (let i = 0; i < 3; i++) {
    const cx = tbx - tbL * 0.3 + i * tbL * 0.3
    const yb = tbY - tbH / 2
    k.hex('brass', 0.1, 0.06, [cx, yb - 0.03, gWd / 2 + tbD / 2], 'y')
    k.spline('cable', [[cx, yb - 0.05, gWd / 2 + tbD / 2], [cx, hs + 0.25, gWd / 2 + tbD / 2 + 0.03], [cx + 0.08, hs + 0.02, gWd / 2 + tbD / 2 - 0.05]], 0.04, 8, 14)
  }
  k.rbox(M.GEN, [0.4, 0.4, 0.2], 0.02, [gfx - gFL * 0.25, hs + 0.55, -gWd / 2 - 0.1])
  k.box('nameplate', [0.45, 0.28, 0.01], [gfx + gFL * 0.1, gTop - 0.35, -gWd / 2 - 0.006])

  // reduction gearbox and couplings (generator side slow, turbine side fast)
  gearbox(k, { x0: sGb0, x1: sGb1, ySlow: yg, yFast: ys, hs, W: Math.min(2 * hw - 0.6, 0.8 + 0.6 * R) })
  const rotors: RotorSpec[] = [
    guardedCoupling(k, sGen1 - 0.02, sGb0 - 0.1, yg, 0.3, hs, 'safetyYellow', 135, 0, 0.1),
    guardedCoupling(k, sGb1 + 0.1, sPl0 - 0.03, ys, 0.27, hs, 'safetyYellow', 215, 0, 0.08),
  ]

  // air inlet plenum, gas turbine core, exhaust collector
  const plW = 2 * (hw - 0.04)
  inletPlenum(k, { a: sPl0, b: sPl1, ys, R, hs, top: H - 0.1, W: plW, M })
  const core = gtCore(k, { xc0, Lc, ys, R, hs, MW, xBleed: xc1 + 0.05, M })
  exhaustCollector(k, { xst, ys, R, cHL, cW, Rd, hs, H, rExit: core.prof(0.99), M })

  // internal services: lube oil header with drops, CO₂ header and nozzles, fuel lines to the manifolds
  const zh = z1 - t - 0.12
  const lyP = hs + 0.18
  lineRun(k, [[xl, hs + 0.45, z1], [xl, hs + 0.45, zh], [xl, lyP, zh], [xa + 0.3, lyP, zh]], 1.5, 'stainless')
  lineRun(k, [[xl, lyP, zh], [core.xu(0.85), lyP, zh]], 1.5, 'stainless')
  for (const [xb, yb, zb] of [[gF0 - 0.17, yg - 0.1, 0.25], [gF1 + 0.17, yg - 0.1, 0.25], [core.xu(0.06) + 0.12, ys - 0.55 * R, 0.4 * R], [core.xu(0.8) + 0.14, ys - 0.62 * R, 0.5 * R]] as V3[])
    if (zh - zb > 0.08) lineRun(k, [[xb, lyP, zh], [xb, yb, zh], [xb, yb, zb]], 1, 'stainless')
  const yco = H - 0.35
  const zco = -hw * 0.35
  const cabX = cab0 + cabL / 2
  lineRun(k, [[cabX, yco, z0], [cabX, yco, zco], [xc1 + cHL * 0.4, yco, zco]], 1.5, 'stainless')
  for (let x = cabX + 1.0; x < xc1 + cHL * 0.4; x += 2.4) {
    k.rod('stainless', [x, yco, zco], [x, yco - 0.18, zco], 0.02, 8)
    k.cyl('brass', 0.035, 0.06, [x, yco - 0.21, zco], 'y', 10)
  }
  gasDetector(k, [xcomb, H - 0.25, hw * 0.6])
  gasDetector(k, [xst - cHL - 0.25, H - 0.25, -hw * 0.6])
  const zf = -core.rr - clamp((hw - core.rr) * 0.5, 0.06, 0.35)
  const zA = (-SW / 2 + z0) / 2
  const { yL } = fuelTrain(k, { xGas: x1, xLiq: p.fuel === 'dual' ? x2 : null, y: L0.yFuel, faceZ: L0.faceZ, gasNps: p.fuelNps, rating: p.rating, xpen, z0, zA, m, hs })
  lineRun(k, [[xpen, L0.yFuel, z0], [xpen, L0.yFuel, zf], [core.xcomb, L0.yFuel, zf], [core.xcomb, ys, zf], [core.xcomb, ys, -core.rr]], Math.min(p.fuelNps, 2), 'stainless')
  if (p.fuel === 'dual') lineRun(k, [[xpen, yL, z0], [xpen, yL, zf], [core.xL, yL, zf], [core.xL, ys, zf], [core.xL, ys, -core.rr + 0.02]], 1, 'stainless')
  co2Cabinet(k, { x0: cab0, L: cabL, z0, m, hs, H, yHdr: yco })
  // neutral earthing resistor on the -Z apron, cable from the generator neutral box through the wall
  const nD = Math.min(0.6, m - 0.15)
  const nz = z0 - nD / 2 - 0.05
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(SKID, [0.06, 0.35, 0.06], [xNer + sx * 0.35, hs + 0.175, nz + sz * (nD / 2 - 0.05)])
  k.box('galvanised', [0.85, 1.0, nD], [xNer, hs + 0.85, nz])
  k.box('galvanised', [0.95, 0.04, nD + 0.1], [xNer, hs + 1.37, nz])
  for (const sx of [-1, 1]) k.at([xNer + sx * 0.43, hs + 0.35, nz], faceQ(sx > 0 ? 'x' : '-x'), () => louvre(k, nD - 0.15, 0.8, 0, 0.5, 'galvanised'))
  k.at([xNer, hs + 0.35, nz - nD / 2], faceQ('-z'), () => louvre(k, 0.6, 0.6, 0, 0.5, 'galvanised'))
  k.plane(signMaterial('hv'), 0.3, 0.15, [xNer, hs + 1.15, nz - nD / 2 - 0.13])
  tagPlate(k, 'NER', [xNer + 0.25, hs + 1.15, nz - nD / 2 - 0.13], '-z', 0.14)
  k.spline('cable', [[xNer, hs + 1.39, nz], [xNer, hs + 1.6, nz + 0.1], [xNer, hs + 1.6, z0 - 0.02]], 0.03, 8, 12)
  k.box(TRIM, [0.2, 0.2, 0.02], [xNer, hs + 1.6, z0 - 0.01])
  // lube tank vent: run along the +Z wall to the generator end, up to an oil-mist separator with flame trap on the roof,
  // discharging 2.5 m above the roof, well away from the combustion-air hoods
  const vx0 = xl - lcL / 2 + 0.1
  const vx = ex0 + 1.4
  const vz = z1 - 0.45
  lineRun(k, [[vx0, hs + 0.75, z1 + 0.12], [vx0, H - 0.45, z1 + 0.12], [vx + 0.35, H - 0.45, z1 + 0.12], [vx + 0.35, H + 0.25, z1 + 0.12], [vx + 0.35, H + 0.25, vz], [vx + 0.14, H + 0.25, vz]], 2, 'stainless')
  for (let x = vx + 0.9; x < vx0 - 0.3; x += 2.0) k.box(SKID, [0.05, 0.05, 0.1], [x, H - 0.45 - pipeOD(2) / 2 - 0.025, z1 + 0.06])
  k.cyl('stainless', 0.13, 0.55, [vx, H + 0.4, vz], 'y', 20)
  k.dome('stainless', 0.13, [vx, H + 0.675, vz], 'y', Math.PI / 2, 0.4, 16)
  for (const sx of [-1, 1]) k.box(SKID, [0.05, 0.12, 0.3], [vx + sx * 0.1, H + 0.06, vz])
  k.box(SKID, [0.06, 0.25, 0.06], [vx + 0.35, H + 0.125, vz])
  k.rod('stainless', [vx, H + 0.72, vz], [vx, H + 2.5, vz], pipeOD(2) / 2, 12)
  k.cyl('flangeSteel', 0.08, 0.16, [vx, H + 2.4, vz], 'y', 16)
  k.lathe('stainless', [[0.035, 0], [0.035, 0.12], [0.08, 0.14], [0.08, 0.16], [0.03, 0.16]], [vx, H + 2.5, vz], 'y', 16)
  for (const sx of [-1, 1]) k.rod('structSteel', [vx + sx * 0.3, H, vz], [vx, H + 1.6, vz], 0.015, 6)

  // roof: inlet duct and filter house over the plenum, ventilation fans, exhaust stack
  const plL = sPl1 - sPl0
  const dHt = clamp(0.9 + 0.02 * MW, 1.0, 1.6)
  const FLmax = 2 * Math.min(xp - ex0, xst - Rsil - 1.3 - xp)
  const FL = Math.max(Math.min(clamp(2.0 + 0.07 * MW, 2.4, 5.0), FLmax), plL + 0.2)
  const FW = Math.min(SW - 0.65, encW + 0.9)
  const FH = clamp(1.8 + 0.05 * MW, 2.0, 3.8)
  filterHouse(k, { xp, dL: plL, dW: plW, H, dHt, FL, FW, FH, roofHalfW: encW / 2, platform: xst - Rsil - (xp + FL / 2) > 1.05 && xp + FL / 2 + 1.0 < ex1 })
  const fanR = clamp(0.3 + 0.005 * MW, 0.3, 0.5)
  const fanXmax = xp - FL / 2 - fanR - 0.3
  for (const fx of [xa + gR * 0.3, xa + gR * 0.68]) if (fx < fanXmax) rotors.push(roofFan(k, fx, -encW * 0.18, H, fanR, TRIM))
  exhaustStack(k, { xst, H, Rd, Rs, Rsil, stackH: p.stackHeight, legR: Math.min(Rsil * 0.72, encW / 2 - 0.1), M })

  // +Z apron: lube oil console with fin-fan cooler, supply / return through the wall
  const lD = m - 0.14
  const lzc = (z1 + SW / 2) / 2
  rotors.push(...lubeConsole(k, { x: xl, z: lzc, L: lcL, D: lD, hs, cooler: 'finfan', coolerY: Math.min(hs + 2.0, H + 0.2), front: 1 }))
  for (const [i, xx] of [xl, xl + 0.25].entries()) {
    lineRun(k, [[xx, hs + 0.45, lzc - lD / 2 + 0.01], [xx, hs + 0.45, z1 - 0.01]], i === 0 ? 1.5 : 2, 'machineryGreen')
    if (!p.cutaway) k.box(TRIM, [0.22, 0.22, 0.02], [xx, hs + 0.45, z1 + 0.005])
  }
  return { built: k.build(), rotors }
}
