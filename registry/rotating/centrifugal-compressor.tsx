// API 617 centrifugal compressor package: barrel or horizontally split casing, motor + gearbox or gas turbine driver, guarded couplings, API 614 lube console, dry gas seal panel, anti-surge valve.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { flange, gauge, grating, handrail, ladder, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, guardedCoupling, type RotorSpec } from '../lib/rotors'
import { signMaterial } from '../lib/textures'
import { flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { OIL, SKID, baseFrame, clamp, annulus, controlValve, joint, faceQ, gasDetector, gearbox, largeMotor, lineRun, louvre, lubeConsole, neckTo, roofFan, teePipe, UP } from './_compressors-kit'
import { TRIM, enclosure, exhaustCollector, exhaustStack, filterHouse, fuelTrain, gtCore, gtMats, inletPlenum } from './_compressors-gt'

export interface CentrifugalCompressorProps {
  suctionNps?: number
  dischargeNps?: number
  rating?: Rating
  /** driver shaft power, MW */
  mw?: number
  casing?: 'barrel' | 'split'
  /** nozzle orientation; down nozzles pass through deck openings in the skid */
  nozzles?: 'up' | 'down'
  driver?: 'motor' | 'gas-turbine'
  /** gas turbine driver: leave out the +Z enclosure wall */
  cutaway?: boolean
  /** gas turbine driver: swing the enclosure doors open */
  doorsOpen?: boolean
  tag?: string
  running?: boolean
}

export const defaults = {
  suctionNps: 12,
  dischargeNps: 10,
  rating: 600 as Rating,
  mw: 6.5,
  casing: 'barrel' as 'barrel' | 'split',
  nozzles: 'up' as 'up' | 'down',
  driver: 'motor' as 'motor' | 'gas-turbine',
  cutaway: false,
  doorsOpen: false,
  tag: 'K-2200',
  running: true,
}

type P = typeof defaults

const WALK = 0.75
const HS = 0.5

function layout(p: P) {
  const mw = clamp(p.mw, 0.5, 40)
  const gt = p.driver === 'gas-turbine'
  const sOD = pipeOD(p.suctionNps)
  const dOD = pipeOD(p.dischargeNps)
  const fS = flangeDims(p.suctionNps, p.rating)
  const fD = flangeDims(p.dischargeNps, p.rating)
  const Rb = Math.max(clamp(0.38 + 0.11 * Math.sqrt(mw), 0.45, 1.1), Math.max(sOD, dOD) * 0.75 + 0.15)
  const R = gt ? clamp(0.25 + 0.11 * Math.sqrt(mw), 0.3, 0.85) : 0
  const ys = Math.max(HS + Rb + 0.6, gt ? HS + 0.2 + 1.3 * R : 0)
  const span = Math.max(Rb * 1.4, (fS.od + fD.od) / 2 + 0.4)
  const Lc = Math.max(2.0, 3.4 * Rb, span + 1.3)
  // stations measured from the +X skid end (x = 0)
  const c1 = -2.0
  const c0 = c1 - Lc
  const cx = (c0 + c1) / 2
  const xShaft = c0 - 0.84
  const s: Record<string, number> = { c0, c1, cx, xShaft }
  let start: number
  let encW = 0
  if (!gt) {
    const Lm = clamp(0.9 + Math.pow(mw * 1000, 0.33) * 0.13, 1.6, 4.6) // typical large induction motor frame
    s.mW = clamp(1.1 + 0.12 * mw, 1.2, 2.4)
    s.gbL = clamp(0.8 + 0.05 * mw, 0.9, 1.8)
    s.gb1 = xShaft - 0.65
    s.gb0 = s.gb1 - s.gbL
    s.m1 = s.gb0 - 0.55
    s.mB1 = s.m1 - 0.8
    s.mB0 = s.mB1 - (Lm - 0.7)
    s.lL = clamp(1.6 + 0.06 * mw, 1.8, 2.8)
    s.lx1 = s.mB0 - 0.75
    s.lx0 = s.lx1 - s.lL
    start = s.lx0 - 0.15
  } else {
    const Rs = clamp(0.1 + 0.2 * Math.sqrt(mw), 0.4, 1.2)
    encW = clamp(2.2 + 0.1 * mw, 2.6, 4.4)
    const hw = encW / 2 - 0.08
    const cW = 1.3 * R
    const Rd = Math.min(Rs, cW, hw - 0.12)
    const cHL = Rd + 0.2
    s.Rs = Rs
    s.Rsil = Math.min(Rs * 1.28, encW / 2 + 0.6)
    s.Rd = Rd
    s.cHL = cHL
    s.ex1 = xShaft - 0.85
    s.xst = s.ex1 - 0.35 - cHL
    s.xc1 = s.xst - cHL
    s.LcG = 5.4 * R
    s.xc0 = s.xc1 - s.LcG
    s.plL = Math.max(0.9, 1.6 * R)
    s.sPl1 = s.xc0
    s.sPl0 = s.sPl1 - s.plL
    s.xp = (s.sPl0 + s.sPl1) / 2
    s.FL = clamp(2.0 + 0.07 * mw, 2.4, 4.0)
    s.xh = Math.min(s.xp + (s.FL - s.plL) / 2, s.xst - s.Rsil - 1.3 - s.FL / 2)
    s.ex0 = Math.min(s.sPl0 - 1.4, s.xh - s.FL / 2 + 0.02)
    start = s.ex0 - 0.2
  }
  const SL = -start
  const shift = SL / 2
  for (const key of ['c0', 'c1', 'cx', 'xShaft', 'gb0', 'gb1', 'm1', 'mB0', 'mB1', 'lx0', 'lx1', 'ex0', 'ex1', 'xst', 'xc0', 'xc1', 'sPl0', 'sPl1', 'xp', 'xh'])
    if (key in s) s[key] += shift
  const zR = Rb + 0.75
  const m = 0.75
  const SW = Math.max(3.6, 2 * (zR + WALK), gt ? 0 : s.mW + 0.9 + 2 * WALK, gt ? encW + 2 * m : 0)
  const up = p.nozzles === 'up'
  const so = 0.45 + Math.max(sOD, dOD) * 1.5
  const yF = up ? ys + Rb + so : 0.12
  const xs = s.cx + span / 2
  const xd = s.cx - span / 2
  const yT = up ? ys + Rb + 0.12 + dOD * 0.9 : ys - Rb - 0.12 - dOD * 0.9
  const bN = Math.min(p.dischargeNps, [2, 3, 4, 6, 8, 10].find((n) => n >= p.dischargeNps * 0.5) ?? 10)
  return { mw, gt, Rb, R, ys, Lc, span, SL, SW, s, up, yF, xs, xd, yT, bN, zR, m, encW, hs: HS }
}

export function ports(props: CentrifugalCompressorProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  const dir: [number, number, number] = L.up ? [0, 1, 0] : [0, -1, 0]
  const out = [
    port('suction', 'Suction', [L.xs, L.yF, 0], dir, p.suctionNps, p.rating),
    port('discharge', 'Discharge', [L.xd, L.yF, 0], dir, p.dischargeNps, p.rating),
    port('recycle', 'Anti-surge recycle', [L.xd, L.yT, -L.zR], [0, 0, -1], L.bN, p.rating),
  ]
  if (L.gt) out.push(port('fuel-gas', 'Fuel gas', [fuelX(L), 0.9, -L.SW / 2 - 0.3], [0, 0, -1], 3, 600))
  return out
}

const fuelX = (L: ReturnType<typeof layout>) => L.s.ex0 + 0.9

export function CentrifugalCompressor(props: CentrifugalCompressorProps & GroupProps) {
  const { suctionNps, dischargeNps, rating, mw, casing, nozzles, driver, cutaway, doorsOpen, tag, running, ...group } = { ...defaults, ...props }
  const { built, rotors } = useMemo(
    () => build({ suctionNps, dischargeNps, rating, mw, casing, nozzles, driver, cutaway, doorsOpen, tag, running }),
    [suctionNps, dischargeNps, rating, mw, casing, nozzles, driver, cutaway, doorsOpen, tag, running],
  )
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default CentrifugalCompressor

const COMP: MatKey = 'equipmentPaint'

function build(p: P) {
  const k = new Kit()
  const L = layout(p)
  const { Rb, ys, SL, SW, s, up, yF, xs, xd, yT, bN, zR, hs } = L
  const { c0, c1 } = s
  const rotors: RotorSpec[] = []
  const holeW = Math.max(flangeDims(p.suctionNps, p.rating).od, flangeDims(p.dischargeNps, p.rating).od) + 0.25
  baseFrame(k, SL, SW, hs, { holes: up ? [] : [{ x: xs, z: 0, w: holeW }, { x: xd, z: 0, w: holeW }] })

  // walkways with handrails along both long edges (compressor section only behind a GT enclosure)
  const wx0 = L.gt ? s.ex1 + 0.15 : -SL / 2
  const wL = SL / 2 - wx0
  for (const sz of [-1, 1]) {
    const zw = sz * (SW / 2 - WALK / 2)
    const n = Math.max(2, Math.round(wL / 2))
    for (let i = 0; i < n; i++) grating(k, [wx0 + (wL * (i + 0.5)) / n, hs + 0.03, zw], wL / n - 0.01, WALK - 0.02)
    const ze = sz * (SW / 2 - 0.03)
    const xm = wx0 + wL * 0.5
    handrail(k, [[wx0 + 0.03, hs + 0.03, ze], [xm - 0.6, hs + 0.03, ze]])
    handrail(k, [[xm + 0.6, hs + 0.03, ze], [SL / 2 - 0.03, hs + 0.03, ze]])
    for (let j = 0; j < 2; j++) k.box('walkwayPaint', [1.0, 0.03, 0.25], [xm, hs - (j + 1) * (hs / 3), sz * (SW / 2 + 0.13 + j * 0.25)])
    for (const sx of [-1, 1]) k.box('structSteel', [0.012, hs, 0.55], [xm + sx * 0.5, hs / 2, sz * (SW / 2 + 0.27)])
    handrail(k, [[SL / 2 - 0.03, hs + 0.03, sz * (SW / 2 - 0.03)], [SL / 2 - 0.03, hs + 0.03, sz * (SW / 2 - WALK)]])
    if (!L.gt) handrail(k, [[-SL / 2 + 0.03, hs + 0.03, sz * (SW / 2 - 0.03)], [-SL / 2 + 0.03, hs + 0.03, sz * (SW / 2 - WALK)]])
  }

  // compressor casing, nozzles, anti-surge branch
  compressorCasing(k, p, L)
  const dir: V3 = up ? [0, 1, 0] : [0, -1, 0]
  const yb = ys + dir[1] * Rb
  neckTo(k, [xs, yb, 0], [xs, yF, 0], dir, p.suctionNps, p.rating, COMP)
  // temporary cone strainer between flanges in the suction neck: joint, paddle tab, dP transmitter
  const sOD = pipeOD(p.suctionNps)
  const yJ = (yb + yF) / 2 + dir[1] * 0.05
  joint(k, p.suctionNps, p.rating, [xs, yJ, 0], 'y')
  const fS = flangeDims(p.suctionNps, p.rating)
  k.box('actuatorRed', [0.03, 0.006, 0.12], [xs + fS.od / 2 + 0.01, yJ, 0])
  k.plane(signMaterial('ler', 'STRAINER'), 0.1, 0.03, [xs + fS.od / 2 + 0.01, yJ + 0.004, 0], new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)))
  for (const dy of [-0.18, 0.18]) k.rod('stainless', [xs, yJ + dy, sOD / 2 - 0.004], [xs, yJ + dy, sOD / 2 + 0.12], 0.008, 8)
  k.rod('tubing', [xs, yJ - 0.18, sOD / 2 + 0.12], [xs, yJ + 0.18, sOD / 2 + 0.12], 0.006, 6)
  k.rbox('actuatorBlue', [0.1, 0.12, 0.08], 0.015, [xs, yJ, sOD / 2 + 0.17])
  // discharge neck with a reducing tee: branch to the anti-surge valve, outlet flange facing -Z
  const dNps = p.dischargeNps
  const bOD = pipeOD(bN)
  const zv = Rb + 0.38
  const vL = controlLen(bN)
  const Lfl = flange(k, dNps, p.rating, [xd, yF, 0], dir, true)
  teePipe(k, [xd, yb, 0], [xd, yF - dir[1] * Lfl, 0], [xd, yT, 0], [0, 0, -1], pipeOD(dNps), pipeWall(dNps, '80'), bOD, pipeWall(bN, '80'), zv - vL / 2, COMP)
  k.disc('pipeBore', pipeOD(dNps) / 2 - pipeWall(dNps, '80') + 0.001, [xd, yb, 0], dir, 24)
  k.at([xd, yT, -zv], new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2), () => controlValve(k, 0, 0, 0, bN, p.rating, 'actuatorYellow', true))
  neckTo(k, [xd, yT, -(zv + vL / 2)], [xd, yT, -zR], [0, 0, -1], bN, p.rating, 'pipePaint', false)
  k.plane(signMaterial('ler', 'ANTI-SURGE'), 0.36, 0.09, [xd + 0.2, yT - bOD, -zv + 0.001], new THREE.Quaternion())
  // pipe supports under down-nozzle branch / up-nozzle tee
  if (!up) k.box(SKID, [0.12, yT - bOD / 2 - hs, 0.12], [xd, (yT - bOD / 2 + hs) / 2, -(zv + vL / 2 + 0.15)])

  // dry gas seal panel at the +X end
  const px0 = c1 + 0.14 + 0.85
  if (SL / 2 - px0 > 0.4) {
    const pw = Math.min(0.8, SL / 2 - px0 - 0.1)
    const ppx = px0 + pw / 2 + 0.05
    const ppz = -(SW / 2 - WALK) + 0.4
    for (const sx of [-1, 1]) k.box('structSteel', [0.06, 1.6, 0.06], [ppx + sx * pw / 2, hs + 0.8, ppz])
    k.box('stainless', [pw, 1.0, 0.02], [ppx, hs + 1.0, ppz + 0.04])
    k.plane(signMaterial('ler', 'DRY GAS SEAL PANEL'), pw * 0.9, pw * 0.12, [ppx, hs + 1.43, ppz + 0.052])
    for (let i = 0; i < 3; i++) {
      const gxp = ppx - pw * 0.3 + i * pw * 0.3
      gauge(k, [gxp, hs + 1.25, ppz + 0.07], 'z', 0.09, 'bar', 160)
      k.box('valveBody', [0.06, 0.06, 0.08], [gxp, hs + 0.95, ppz + 0.08])
      k.box('stainless', [0.08, 0.14, 0.06], [gxp, hs + 0.75, ppz + 0.08])
      k.tube('tubing', [[gxp, hs + 0.68, ppz + 0.08], [gxp, hs + 0.55, ppz + 0.08], [c1 + 0.5, hs + 0.55, ppz + 0.08], [c1 + 0.5, ys - Rb * 0.3, -Rb * 0.45]], 0.008)
    }
  }

  // lube oil supply / return headers along -Z with drops to each bearing
  const zh = -(SW / 2 - WALK) + 0.12
  const oilX0 = L.gt ? s.ex1 + 0.2 : s.lx1 - 0.3
  lineRun(k, [[oilX0, hs + 0.2, zh], [c1 + 0.7, hs + 0.2, zh]], 2, OIL)
  lineRun(k, [[oilX0, hs + 0.08, zh + 0.15], [c1 + 0.8, hs + 0.08, zh + 0.15]], 3, OIL)
  const bearings = [c0 - 0.5, c1 + 0.6]
  if (!L.gt) bearings.push((s.gb0 + s.gb1) / 2 - 0.3, (s.gb0 + s.gb1) / 2 + 0.3)
  for (const xb of bearings) {
    lineRun(k, [[xb, hs + 0.2, zh], [xb, ys + 0.35, zh], [xb, ys + 0.35, -0.25]], 1, 'stainless')
    lineRun(k, [[xb + 0.12, ys - 0.25, -0.25], [xb + 0.12, ys - 0.25, zh + 0.15], [xb + 0.12, hs + 0.08, zh + 0.15]], 1.5, OIL)
  }
  // F&G post and sign
  k.rod('structSteel', [SL / 2 - 0.25, hs, SW / 2 - WALK - 0.1], [SL / 2 - 0.25, hs + 2.4, SW / 2 - WALK - 0.1], 0.03, 10)
  gasDetector(k, [SL / 2 - 0.25, hs + 2.3, SW / 2 - WALK - 0.02])

  if (!L.gt) motorTrain(k, p, L, rotors)
  else gtTrain(k, p, L, rotors)
  return { built: k.build(), rotors }
}

const controlLen = (nps: number) => Math.max(0.3, pipeOD(nps) * 3.6)

function compressorCasing(k: Kit, p: P, L: ReturnType<typeof layout>) {
  const { Rb, ys, Lc, s, up, xs, xd, hs } = L
  const { c0, c1, cx } = s
  const split = p.casing === 'split'
  if (split) {
    // horizontally split casing: halves, split-line flange with bolting, stiffening ribs
    k.cyl(COMP, Rb, Lc, [cx, ys, 0], 'x', 64)
    const fw = Rb + 0.16
    k.box(COMP, [Lc + 0.1, 0.12, 2 * fw], [cx, ys, 0])
    const nb = Math.max(8, Math.round(Lc / 0.16))
    for (let i = 0; i < nb; i++)
      for (const sz of [-1, 1]) {
        const bx = c0 + 0.05 + (i * (Lc - 0.1)) / (nb - 1)
        k.cyl('boltXylan', 0.018, 0.22, [bx, ys + 0.03, sz * (fw - 0.07)], 'y', 8)
        k.hex('nut', 0.055, 0.03, [bx, ys + 0.075, sz * (fw - 0.07)])
        k.hex('nut', 0.055, 0.03, [bx, ys - 0.075, sz * (fw - 0.07)])
      }
    for (let i = 1; i < 5; i++) k.cyl(COMP, Rb * 1.03, 0.05, [c0 + (i * Lc) / 5, ys, 0], 'x', 64)
    for (const sx of [-1, 1]) k.cyl(COMP, Rb * 1.06, 0.14, [cx + sx * (Lc / 2 - 0.07), ys, 0], 'x', 64)
    // top-half lifting lugs and jacking bolts
    for (const sx of [-1, 1]) k.torus('nut', 0.07, 0.022, [cx + sx * Lc * 0.3, ys + Rb + 0.06, 0], 'x', 6, 16)
  } else {
    k.cyl(COMP, Rb, Lc, [cx, ys, 0], 'x', 64)
    for (const sx of [-1, 1]) k.cyl(COMP, Rb * 1.04, 0.12, [cx + sx * (Lc / 2 - 0.06), ys, 0], 'x', 64)
    for (const sx of [-1, 1]) k.torus('nut', 0.07, 0.022, [cx + sx * Lc * 0.22, ys + Rb + 0.04, 0], 'x', 6, 16)
  }
  // cast nozzle bosses
  const dir = up ? 1 : -1
  for (const [x, nps] of [[xs, p.suctionNps], [xd, p.dischargeNps]] as const) {
    const r = (pipeOD(nps) / 2) * 1.35
    const yb = ys + dir * Rb * 0.995
    if (split) k.rbox(COMP, [r * 2.3, Rb * 0.6, r * 2.3], 0.05, [x, ys + dir * Rb * 0.695, 0])
    else k.cyl(COMP, r, Rb * 0.55, [x, ys + dir * Rb * 0.72, 0], 'y', 32)
    annulus(k, COMP, pipeOD(nps) / 2, r * 1.15, 0.05, [x, yb + dir * 0.025, 0], 'y', 32)
  }
  // ends: end covers (barrel shear-ring studs), seal housings, bearing housings, probes, seal vents, feet
  for (const sx of [-1, 1]) {
    const xe = sx > 0 ? c1 : c0
    if (!split) {
      k.cyl(COMP, Rb * 0.86, 0.14, [xe + sx * 0.07, ys, 0], 'x', 56)
      k.boltCircle('boltXylan', 'nut', 28, Rb * 0.78, [xe + sx * 0.13, ys, 0], sx > 0 ? 'x' : '-x', 0.04, 0.12, [0.06])
    } else k.cyl(COMP, Rb * 0.8, 0.14, [xe + sx * 0.07, ys, 0], 'x', 56)
    const xb = xe + sx * 0.14
    k.cyl(COMP, Rb * 0.42, 0.25, [xb + sx * 0.125, ys, 0], 'x', 36)
    k.cyl(COMP, Rb * 0.48, 0.45, [xb + sx * 0.47, ys, 0], 'x', 36)
    k.cyl(COMP, Rb * 0.52, 0.04, [xb + sx * 0.26, ys, 0], 'x', 36)
    k.box(COMP, [0.45, 0.04, Rb * 1.08], [xb + sx * 0.47, ys, 0])
    k.boltCircle('boltXylan', 'nut', 12, Rb * 0.5, [xb + sx * 0.25, ys, 0], sx > 0 ? 'x' : '-x', 0.018, 0.06, [0.04])
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4]) {
      const q: V3 = [xb + sx * 0.4, ys + Math.sin(a) * Rb * 0.48, Math.cos(a) * Rb * 0.48]
      k.rod('stainless', q, [q[0], ys + Math.sin(a) * (Rb * 0.48 + 0.08), Math.cos(a) * (Rb * 0.48 + 0.08)], 0.015, 10)
    }
    k.tube('tubing', [[xb + sx * 0.12, ys + Rb * 0.42, 0], [xb + sx * 0.12, ys + Rb * 0.42 + 0.25, 0], [xb + sx * 0.12, ys + Rb * 0.42 + 0.25, -Rb * 0.6]], 0.01)
    for (const sz of [-1, 1]) {
      k.box(COMP, [0.3, 0.1, 0.35], [xe + sx * 0.05, ys - 0.05, sz * (Rb + 0.12)])
      k.box(SKID, [0.4, ys - 0.1 - hs, 0.32], [xe + sx * 0.05, (ys - 0.1 + hs) / 2, sz * (Rb + 0.12)])
      k.box('stainless', [0.32, 0.006, 0.36], [xe + sx * 0.05, ys - 0.1 + 0.003, sz * (Rb + 0.12)])
    }
  }
  k.dome(COMP, Rb * 0.42, [c1 + 0.14 + 0.7, ys, 0], 'x', Math.PI / 2, 0.4)
  k.cyl('stainless', 0.08, 0.2, [s.xShaft - 0.1, ys, 0], 'x', 20)
  // casing drain, nameplate, tag
  if (up) {
    k.cyl(COMP, 0.05, ys - Rb - hs - 0.05, [cx, (ys - Rb + hs + 0.05) / 2, 0], 'y', 14)
    k.hex('nut', 0.1, 0.04, [cx, hs + 0.07, 0])
  }
  k.box('nameplate', [0.4, 0.25, 0.01], [cx + 0.3, ys + 0.05, Rb + 0.004])
  tagPlate(k, p.tag, [cx - 0.25, ys + 0.1, Rb + 0.012], 'z', 0.4)
}

function motorTrain(k: Kit, p: P, L: ReturnType<typeof layout>, rotors: RotorSpec[]) {
  const { ys, SL, SW, s, hs, mw } = L
  const { xShaft, gb0, gb1, m1, mB0, mB1, mW, lx0, lx1 } = s
  // speed-increasing gearbox: motor shaft low, pinion at compressor height
  const ym = ys - clamp(0.25 + 0.03 * mw, 0.25, 0.55)
  gearbox(k, { x0: gb0, x1: gb1, ySlow: ym, yFast: ys, hs, W: Math.min(1.5, SW - 2 * WALK - 0.4) })
  rotors.push(guardedCoupling(k, gb1 + 0.05, xShaft - 0.18, ys, 0.28, hs + 0.03, 'safetyYellow', 235, 0, 0.08))
  rotors.push(guardedCoupling(k, m1 - 0.05, gb0 - 0.05, ym, 0.3, hs + 0.03, 'safetyYellow', 125, 0, 0.11))
  rotors.push(largeMotor(k, { mB0, mB1, xEnd: m1, ym, hs, mW, rpm: 125 }))
  const mx = (mB0 + mB1) / 2
  k.plane(signMaterial('ler', `${p.tag}  ${Math.round(mw * 10) / 10} MW`), 1.2, 0.3, [mx, hs + 0.25, SW / 2 + 0.005])
  // lube oil console at the -X end
  const lD = SW - 2 * WALK - 0.4
  // API 614 overhead rundown tank on a stand above the console, drop line to the supply header
  const rx = (lx0 + lx1) / 2
  const rL = Math.min(lx1 - lx0 - 0.3, 1.6)
  const rR = 0.28
  const yR = ys + 1.25
  const yBeam = yR - rR - 0.05
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.box('structSteel', [0.08, yBeam - 0.05 - hs, 0.08], [rx + sx * (rL / 2 - 0.1), (yBeam - 0.05 + hs) / 2, sz * (lD / 2 + 0.1)])
    k.box('structSteel', [0.1, 0.1, lD + 0.28], [rx + sx * (rL / 2 - 0.1), yBeam, 0])
  }
  k.cyl('stainless', rR, rL, [rx, yR, -lD / 2 + 0.1], 'x', 28)
  for (const sx of [-1, 1]) k.dome('stainless', rR, [rx + sx * rL / 2, yR, -lD / 2 + 0.1], sx > 0 ? 'x' : '-x', Math.PI / 2, 0.4, 24)
  k.box('glass', [0.3, 0.12, 0.012], [rx, yR, -lD / 2 + 0.1 + rR + 0.004])
  k.rod('stainless', [rx + rL * 0.3, yR + rR - 0.02, -lD / 2 + 0.1], [rx + rL * 0.3, yR + rR + 0.25, -lD / 2 + 0.1], 0.02, 8)
  k.dome('stainless', 0.04, [rx + rL * 0.3, yR + rR + 0.25, -lD / 2 + 0.1], '-y', Math.PI / 2, 1, 10)
  lineRun(k, [[rx - rL * 0.3, yR - rR + 0.02, -lD / 2 + 0.1], [rx - rL * 0.3, hs + 0.2, -lD / 2 + 0.1], [rx - rL * 0.3, hs + 0.2, -(SW / 2 - WALK) + 0.12]], 2, 'stainless')
  tagPlate(k, 'RUNDOWN TANK', [rx, yR - 0.12, -lD / 2 + 0.1 + rR * 0.95], 'z', 0.24)
  rotors.push(...lubeConsole(k, { x: (lx0 + lx1) / 2, z: 0, L: lx1 - lx0, D: lD, hs, cooler: 'shell', front: 1 }))
  void SL
}

function gtTrain(k: Kit, p: P, L: ReturnType<typeof layout>, rotors: RotorSpec[]) {
  const { ys, SL, SW, s, hs, mw, R, m, encW } = L
  const M = gtMats()
  const t = 0.08
  const z0 = -encW / 2
  const z1 = encW / 2
  const hw = encW / 2 - t
  const { ex0, ex1, xst, xc0, xc1, sPl0, sPl1, xp, xh, FL, Rs, Rsil, Rd, cHL, LcG } = s
  const H = Math.max(clamp(3.3 + 0.075 * mw, 3.6, 6.5), ys + 1.3 * R + 0.5)
  // couplings: power turbine output through the enclosure wall to the compressor
  k.cyl('stainless', 0.09, ex1 + 0.1 - xst, [(xst + ex1 + 0.1) / 2, ys, 0], 'x', 16)
  rotors.push(guardedCoupling(k, ex1 + 0.1, s.xShaft - 0.18, ys, 0.3, hs + 0.03, 'safetyYellow', 230, 0, 0.09))
  const xl = clamp((ex0 + ex1) / 2, ex0 + 1.2, ex1 - 1.2)
  const lcL = clamp(ex1 - ex0 - 2.8, 1.8, 3.0)
  const xGas = fuelX(L)
  const xpen = xGas + 1.5
  const doorsNz = xpen + 1.0 < ex1 - 0.7 ? [Math.min(ex1 - 0.8, xpen + 1.0)] : []
  const doorsPz = xl + lcL / 2 + 1.0 < ex1 - 0.7 ? [ex1 - 0.8] : []
  const { dH, wallH } = enclosure(k, { ex0, ex1, z0, z1, hs, H, t, doorsPz, doorsNz, endNx: Math.min(1.6, encW - 1.2), endPx: [encW / 2 - 0.6, 0.8], cutaway: p.cutaway, open: p.doorsOpen, monorail: [sPl1 + 0.15, xst - Rd - 0.2] })
  k.at([ex0, hs, 0], faceQ('-x'), () => louvre(k, Math.min(1.0, encW * 0.3), 0.45, 0, Math.min(wallH - 0.4, dH + 0.5)))
  ladder(k, [ex0 + 0.5, hs, z1 + 0.2], H, [0, 0, 1], { cage: true })
  const plW = 2 * (hw - 0.04)
  inletPlenum(k, { a: sPl0, b: sPl1, ys, R, hs, top: H - 0.1, W: plW, M })
  const core = gtCore(k, { xc0, Lc: LcG, ys, R, hs, MW: mw, xBleed: xc1 + 0.05, M })
  exhaustCollector(k, { xst, ys, R, cHL, cW: 1.3 * R, Rd, hs, H, rExit: core.prof(0.99), M })
  // starter / accessory skid in front of the plenum
  k.rbox(OIL, [Math.max(0.5, sPl0 - ex0 - 0.5), 0.7, Math.min(1.0, encW - 0.6)], 0.03, [(ex0 + sPl0) / 2, hs + 0.35, 0])
  // fuel gas skid on the -Z apron, gas line to the manifold
  const zA = -SW / 2 + m / 2
  fuelTrain(k, { xGas, xLiq: null, y: 0.9, faceZ: -SW / 2 - 0.3, gasNps: 3, rating: 600, xpen, z0, zA, m, hs })
  const zf = -core.rr - clamp((hw - core.rr) * 0.5, 0.06, 0.35)
  lineRun(k, [[xpen, 0.9, z0], [xpen, 0.9, zf], [core.xcomb, 0.9, zf], [core.xcomb, ys, zf], [core.xcomb, ys, -core.rr]], 2, 'stainless')
  // roof: filter house and stack, ventilation fan
  const dHt = clamp(0.9 + 0.02 * mw, 1.0, 1.4)
  filterHouse(k, { xp, xh, dL: sPl1 - sPl0, dW: plW, H, dHt, FL, FW: Math.min(SW - 0.65, encW + 0.9), FH: clamp(1.8 + 0.05 * mw, 2.0, 3.2), roofHalfW: encW / 2 })
  exhaustStack(k, { xst, H, Rd, Rs, Rsil, stackH: 6, legR: Math.min(Rsil * 0.72, encW / 2 - 0.1), M })
  if (xh + FL / 2 + 0.9 < xst - Rsil) rotors.push(roofFan(k, (xh + FL / 2 + xst - Rsil) / 2, -encW * 0.2, H, 0.32, TRIM))
  // lube console with fin-fan cooler on the +Z apron, oil through the wall
  const lD = m - 0.14
  const lzc = (z1 + SW / 2) / 2
  rotors.push(...lubeConsole(k, { x: xl, z: lzc, L: lcL, D: lD, hs, cooler: 'finfan', coolerY: Math.min(hs + 2.0, H + 0.2), front: 1 }))
  for (const [i, xx] of [xl, xl + 0.25].entries()) lineRun(k, [[xx, hs + 0.45, lzc - lD / 2 + 0.01], [xx, hs + 0.45, z1 - 0.01]], i === 0 ? 1.5 : 2, OIL)
  if (!p.cutaway) k.plane(signMaterial('ler', `${p.tag}  GAS TURBINE DRIVER`), 2.0, 0.5, [(ex0 + ex1) / 2 + 0.6, H - 0.6, z1 + 0.02])
  void SL
}
