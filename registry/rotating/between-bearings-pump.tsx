// API 610 BB3 axially split multistage pump: bolted horizontal split casing, bearing housings at both ends, guarded coupling, IEC/HV motor, forced-feed lube oil console, drain-rim baseplate.
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { gauge, liftingLug, motor, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, cowlFan, guardedCoupling, type RotorSpec } from '../lib/rotors'
import { flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { anchorBolt, clamp, controlStation, drainRimBaseplate, flangeLen, flangedBranch, motorEnvelope, mountPad, oiler, pipeGauge, sealCooler, smallValve, topCooler } from './_pumps'

export interface BetweenBearingsPumpProps {
  suctionNps?: number
  dischargeNps?: number
  rating?: Rating
  /** motor rated power, kW */
  kw?: number
  stages?: number
  casing?: MatKey
  /** forced-feed lube oil console on the baseplate */
  lubeConsole?: boolean
  tag?: string
  running?: boolean
}

export const defaults = {
  suctionNps: 8,
  dischargeNps: 6,
  rating: 900 as Rating,
  kw: 1500,
  stages: 6,
  casing: 'machineryGreen' as MatKey,
  lubeConsole: true,
  running: true,
}

type P = Omit<typeof defaults, 'running'> & { tag?: string }

function layout(p: P) {
  const st = clamp(Math.round(p.stages), 2, 14)
  const m = motorEnvelope(p.kw, 2)
  const Rimp = 0.12 + 0.014 * Math.max(p.dischargeNps, p.suctionNps * 0.8)
  const Rc = Rimp + 0.09
  const sp = 0.13 + Rimp * 0.3 // stage pitch, typical
  const Lc = st * sp + 0.55
  const fOD = Math.max(flangeDims(p.suctionNps, p.rating).od, flangeDims(p.dischargeNps, p.rating).od)
  const hb = 0.32
  const Rm = m.R
  const ys = hb + Math.max(m.H, Rc + 0.32, Rc * 0.35 + fOD / 2 + 0.12)
  const yN = ys - Rc * 0.35
  const bhR = Math.max(0.12, Rc * 0.42)
  const bhL = Math.max(0.3, Rc * 1.0)
  const xDE = -Lc / 2 - 0.28 - bhL / 2
  const xNDE = Lc / 2 + 0.28 + bhL / 2
  const xSE = xDE - bhL / 2 - 0.12
  const xMS = xSE - 0.36
  const stub = 0.1 + Rm * 0.2
  const xm = xMS - stub + 0.02
  const cowl = Math.max(0.12, Rm * 0.6)
  const x0 = xm - m.L - cowl - 0.2
  const xCon = xNDE + bhL / 2 + 0.25
  const x1 = p.lubeConsole ? xCon + 1.3 : xNDE + bhL / 2 + 0.25
  const cx = (x0 + x1) / 2
  const zFace = (nps: number) => Rc + 0.32 + pipeOD(nps) * 0.3 + flangeLen(nps, p.rating)
  const xS = Lc / 2 - 0.12 - pipeOD(p.suctionNps) * 0.6
  const xD = -Lc / 2 + 0.12 + pipeOD(p.dischargeNps) * 0.6
  const W = Math.max(2 * (Rc + 0.62), 2 * Rm * 1.15 + 0.2, 1.1)
  return { st, m, Rimp, Rc, sp, Lc, hb, ys, yN, bhR, bhL, xDE, xNDE, xSE, xMS, xm, x0, x1, cx, xCon, xS, xD, zFace, W }
}

export function ports(props: BetweenBearingsPumpProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  return [
    port('suction', 'Suction', [L.xS - L.cx, L.yN, L.zFace(p.suctionNps)], [0, 0, 1], p.suctionNps, p.rating),
    port('discharge', 'Discharge', [L.xD - L.cx, L.yN, L.zFace(p.dischargeNps)], [0, 0, 1], p.dischargeNps, p.rating),
  ]
}

export function BetweenBearingsPump({ tag, ...rest }: BetweenBearingsPumpProps & GroupProps) {
  const { suctionNps, dischargeNps, rating, kw, stages, casing, lubeConsole, running, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(
    () => build({ suctionNps, dischargeNps, rating, kw, stages, casing, lubeConsole, tag }),
    [suctionNps, dischargeNps, rating, kw, stages, casing, lubeConsole, tag],
  )
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default BetweenBearingsPump

function build(p: P) {
  const k = new Kit()
  const L = layout(p)
  const rotors: RotorSpec[] = []
  k.at([-L.cx, 0, 0], undefined, () => draw(k, p, L, rotors))
  for (const r of rotors) r.pos = [r.pos[0] - L.cx, r.pos[1], r.pos[2]]
  return { built: k.build(), rotors }
}

function draw(k: Kit, p: P, L: ReturnType<typeof layout>, rotors: RotorSpec[]) {
  const C = p.casing
  const { Rc, Lc, sp, st, hb, ys, yN, bhR, bhL, xDE, xNDE, xSE, xMS, xm, W } = L
  const x0c = -Lc / 2
  const x1c = Lc / 2

  // casing barrel: end hubs, stage bulges, horizontal split flange
  k.lathe(C, [
    [Rc * 0.55, x0c - 0.12],
    [Rc * 0.8, x0c - 0.02],
    [Rc, x0c + 0.12],
    [Rc, x1c - 0.12],
    [Rc * 0.8, x1c + 0.02],
    [Rc * 0.55, x1c + 0.12],
  ], [0, ys, 0], 'x', 48)
  const xs0 = -((st - 1) * sp) / 2
  for (let i = 0; i < st; i++) {
    const x = xs0 + i * sp
    k.lathe(C, [[Rc, x - sp * 0.32], [Rc * 1.07, x - sp * 0.2], [Rc * 1.07, x + sp * 0.2], [Rc, x + sp * 0.32]], [0, ys, 0], 'x', 48)
  }
  // back-to-back crossover over the top
  const xc0 = xs0 + ((st - 1) * sp) * 0.15
  const xc1 = xs0 + ((st - 1) * sp) * 0.85
  const rX = Rc * 0.32
  k.tube(C, [[xc0, ys + Rc * 0.6, 0], [xc0, ys + Rc + rX * 0.6, -Rc * 0.15], [xc1, ys + Rc + rX * 0.6, -Rc * 0.15], [xc1, ys + Rc * 0.6, 0]], rX, 20, rX * 1.4)
  const fw = Rc + 0.1
  const ft = 0.07
  k.box(C, [Lc + 0.1, ft, fw * 2], [0, ys, 0])
  const nStud = Math.max(6, Math.round(Lc / 0.11))
  for (const s of [-1, 1])
    for (let i = 0; i < nStud; i++) {
      const x = x0c + 0.05 + ((Lc - 0.1) * i) / (nStud - 1)
      const z = s * (fw - 0.04)
      k.cyl('boltXylan', 0.016, 0.1, [x, ys + 0.04, z], 'y', 8)
      k.hex('nut', 0.05, 0.03, [x, ys + ft / 2 + 0.015, z])
    }
  for (const sx of [-1, 1]) liftingLug(k, [sx * Lc * 0.3, ys + Rc * 1.0, 0], 'x', 1.2, C)
  // casing vent valve on top, drain line with valve and plug underneath
  k.cyl(C, 0.018, 0.06, [x1c - 0.2, ys + Rc * 0.98 + 0.02, Rc * 0.15], 'y', 10)
  smallValve(k, [x1c - 0.2, ys + Rc * 0.98 + 0.08, Rc * 0.15], 0.8)
  k.cyl(C, 0.03, 0.06, [0, ys - Rc * 1.05, 0], 'y', 12)
  k.rod('tubing', [0, ys - Rc * 1.05, 0], [0, hb + 0.14, 0], 0.016, 10)
  smallValve(k, [0, hb + 0.1, 0.0], 0.8, 'z')
  k.hex('nut', 0.04, 0.03, [0, hb + 0.05, 0])

  // side-side nozzles on the lower half
  for (const [x, nps] of [[L.xS, p.suctionNps], [L.xD, p.dischargeNps]] as [number, number][]) {
    const od = pipeOD(nps)
    const zf = L.zFace(nps)
    k.lathe(C, [[0, Rc * 0.4], [od * 0.62, Rc * 0.4], [od * 0.56, Rc + 0.12], [od * 0.44, Rc + 0.12]], [x, yN, 0], 'z', 32)
    flangedBranch(k, C, [x, yN, Rc * 0.6], [x, yN, zf], nps, p.rating, '80')
    pipeGauge(k, [x + od * 0.6 + 0.06, yN + od / 2, Rc + 0.2], [0, 0, 1], nps === p.suctionNps ? 40 : 400)
  }

  // casing support feet at both ends (centreline mounted)
  for (const sx of [-1, 1]) {
    const x = sx * (Lc / 2 + 0.02)
    for (const sz of [-1, 1]) {
      k.box(C, [0.16, 0.06, 0.18], [x, ys - ft / 2 - 0.03, sz * (fw + 0.05)])
      k.box('equipmentPaintDark', [0.16, ys - ft / 2 - 0.06 - hb, 0.16], [x, (ys - ft / 2 - 0.06 + hb) / 2, sz * (fw + 0.05)])
      k.box('equipmentPaintDark', [0.24, 0.02, 0.24], [x, hb + 0.01, sz * (fw + 0.05)])
      for (const dx of [-0.05, 0.05]) k.hex('nut', 0.036, 0.022, [x + dx, ys - ft / 2 + 0.012, sz * (fw + 0.05)])
    }
  }

  // seal chambers, cartridge seal glands, bearing brackets and housings at both ends
  const rsh = Math.max(0.035, L.m.shaftDia * 0.55)
  for (const [xh, s] of [[xDE, -1], [xNDE, 1]] as [number, number][]) {
    const xe = s * (Lc / 2 + 0.12)
    k.cyl(C, Rc * 0.42, 0.14, [xe + s * 0.07, ys, 0], 'x', 32)
    k.cyl('stainless', Rc * 0.36, 0.05, [xe + s * 0.165, ys, 0], 'x', 28)
    k.boltCircle('boltXylan', 'nut', 4, Rc * 0.3, [xe + s * 0.13, ys, 0], s > 0 ? 'x' : '-x', 0.012, 0.08, [0.07], Math.PI / 4)
    // bracket arms from the casing end to the housing
    const xa = xe + s * 0.2
    const xb = xh - (s * bhL) / 2
    for (const sz of [-1, 1]) k.box(C, [Math.abs(xb - xa) + 0.04, bhR * 0.5, 0.04], [(xa + xb) / 2, ys - bhR * 0.4, sz * bhR * 0.75])
    k.box(C, [Math.abs(xb - xa) + 0.04, 0.04, bhR * 1.5], [(xa + xb) / 2, ys - bhR * 0.65, 0])
    k.lathe(C, [
      [bhR * 0.75, -bhL / 2],
      [bhR, -bhL / 2 + 0.03],
      [bhR, bhL / 2 - 0.03],
      [bhR * 0.75, bhL / 2],
    ], [xh, ys, 0], 'x', 36)
    for (let i = 0; i < 5; i++) k.cyl(C, bhR * 1.1, 0.008, [xh - bhL * 0.3 + i * bhL * 0.15, ys, 0], 'x', 32)
    k.box(C, [bhL * 0.9, 0.035, bhR * 2.3], [xh, ys, 0])
    for (const sz of [-1, 1]) for (const dx of [-bhL * 0.3, bhL * 0.3]) k.hex('nut', 0.03, 0.02, [xh + dx, ys + 0.03, sz * bhR * 1.05])
    // vibration probes (X-Y) and an RTD
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4]) {
      const q: V3 = [xh - s * bhL * 0.2, ys + Math.sin(a) * bhR, Math.cos(a) * bhR]
      k.rod('stainless', q, [q[0], ys + Math.sin(a) * (bhR + 0.07), Math.cos(a) * (bhR + 0.07)], 0.012, 10)
    }
    k.cyl('brass', 0.022, 0.012, [xh, ys - bhR * 0.4, bhR * 0.92 + 0.006], 'z', 16)
    k.disc('glass', 0.017, [xh, ys - bhR * 0.4, bhR * 0.92 + 0.0125], 'z', 16)
    // ring-oil lubrication: constant-level oiler (pressure lube from the console replaces it)
    if (!p.lubeConsole) oiler(k, [xh + s * bhL * 0.25, ys - bhR * 0.45, bhR * 0.88], [0, 0, 1])
    // bearing RTD head on top
    k.cyl('stainless', 0.008, 0.06, [xh + s * bhL * 0.25, ys + bhR + 0.03, 0], 'y', 8)
    k.cyl('stainless', 0.022, 0.035, [xh + s * bhL * 0.25, ys + bhR + 0.075, 0], 'y', 14)
    // Plan 23 seal cooler on the -Z side, loop from the gland and back
    const cx = xe + s * 0.17
    const zc = -(fw + 0.3)
    const sc = sealCooler(k, [cx, hb, zc], ys + Rc * 0.6)
    const gy = ys + Rc * 0.36
    k.tube('tubing', [[cx, gy, -0.03], [cx, gy + 0.05, -0.03], [cx, gy + 0.05, zc + 0.02], [cx, sc.top[1] + 0.06, zc + 0.02], [cx, sc.top[1] + 0.06, zc], [cx, sc.top[1], zc]], 0.008)
    k.tube('tubing', [[cx, ys - Rc * 0.36, -0.03], [cx, ys - Rc * 0.36 - 0.05, -0.03], [cx, ys - Rc * 0.36 - 0.05, zc + 0.08], [cx, sc.bottom[1] - 0.05, zc + 0.08], [cx, sc.bottom[1] - 0.05, zc], [cx, sc.bottom[1], zc]], 0.008)
    // pedestal under the housing
    k.box(C, [bhL * 0.5, ys - bhR * 0.8 - hb, bhR * 1.2], [xh, (ys - bhR * 0.8 + hb) / 2, 0])
    k.box('flangeSteel', [bhL * 0.7, 0.02, bhR * 1.6], [xh, hb + 0.01, 0])
  }
  // NDE thrust bearing end cover with axial probes
  k.cyl(C, bhR * 0.8, 0.06, [xNDE + bhL / 2 + 0.03, ys, 0], 'x', 32)
  k.boltCircle('boltXylan', 'nut', 6, bhR * 0.68, [xNDE + bhL / 2 + 0.03, ys, 0], 'x', 0.01, 0.05, [0.04])
  for (const dz of [-0.04, 0.04]) k.rod('stainless', [xNDE + bhL / 2 + 0.06, ys + 0.03, dz], [xNDE + bhL / 2 + 0.14, ys + 0.03, dz], 0.01, 8)
  k.cyl('flangeSteel', rsh, xNDE - xSE + 0.0, [(xNDE + xSE) / 2, ys, 0], 'x', 16)

  // coupling + motor
  const Rm = L.m.R
  const Lm = L.m.L
  k.at([xm, ys, 0], undefined, () => motor(k, { R: Rm, L: Lm, H: ys - hb, tbox: 'side', cable: true }))
  tagPlate(k, `${L.m.frame} ${p.kw} kW 2P`, [xm - Lm * 0.62, ys + Rm * 0.62, Rm * 0.82], [0, 0.5, 0.87], Math.max(0.12, Rm * 0.45))
  if (p.kw >= 1000) topCooler(k, xm, ys, Rm, Lm)
  for (const fx of [xm - Lm * 0.82, xm - Lm * 0.18]) for (const s of [-1, 1]) mountPad(k, fx, hb, s * Rm * 0.78, 0.24, 0.22, 1)
  rotors.push(guardedCoupling(k, xMS - 0.02, xSE + 0.04, ys, Math.max(0.18, rsh * 4.2), hb, 'safetyYellow', 165, 0, rsh))
  rotors.push(cowlFan(Rm, Lm, 165, [xm, ys, 0]))

  drainRimBaseplate(k, L.x1 - L.x0, W, hb, 'equipmentPaintDark', (L.x0 + L.x1) / 2)
  if (p.tag) tagPlate(k, p.tag, [(L.x0 + L.x1) / 2, hb * 0.5, W / 2 + 0.002], 'z', 0.24)
  controlStation(k, [L.x0 + 0.2, hb, W / 2 - 0.15])

  if (p.lubeConsole) lubeConsole(k, L)
}

// forced-feed lube oil console: reservoir, main + aux pumps, twin cooler, duplex filter, supply / return to both housings
function lubeConsole(k: Kit, L: ReturnType<typeof layout>) {
  const { xCon, hb, W, ys, bhR, xDE, xNDE } = L
  const cx = xCon + 0.55
  const LW = Math.min(W - 0.2, 1.0)
  const rH = 0.55
  const G: MatKey = 'equipmentPaint'
  k.rbox(G, [1.0, rH, LW], 0.02, [cx, hb + rH / 2, 0])
  k.box(G, [1.04, 0.02, LW + 0.04], [cx, hb + rH + 0.01, 0])
  k.rod('glass', [cx + 0.505, hb + 0.1, LW * 0.3], [cx + 0.505, hb + rH - 0.08, LW * 0.3], 0.012, 8)
  k.cyl('castIron', 0.04, 0.05, [cx + 0.3, hb + rH + 0.045, -LW * 0.3], 'y', 14)
  k.cyl('brass', 0.012, 0.06, [cx - 0.35, hb + rH + 0.05, -LW * 0.35], 'y', 8)
  k.sphere('brass', 0.022, [cx - 0.35, hb + rH + 0.09, -LW * 0.35], undefined, 10)
  // main + auxiliary pumps with small vertical motors
  for (const dz of [-0.22, 0.22]) {
    const x = cx - 0.2
    const y0 = hb + rH + 0.02
    k.cyl('machineryGreen', 0.06, 0.12, [x, y0 + 0.06, dz], 'y', 18)
    k.cyl('machineryGreen', 0.05, 0.1, [x, y0 + 0.17, dz], 'y', 18)
    k.cyl('motorPaint', 0.08, 0.26, [x, y0 + 0.35, dz], 'y', 24)
    k.cyl('motorPaint', 0.085, 0.06, [x, y0 + 0.51, dz], 'y', 24)
    k.rbox('motorPaint', [0.08, 0.08, 0.06], 0.008, [x, y0 + 0.35, dz + Math.sign(dz) * 0.1])
  }
  // duplex filter with changeover valve, cooler, PCV
  for (const dz of [-0.1, 0.1]) {
    k.cyl('stainless', 0.06, 0.32, [cx + 0.2, hb + rH + 0.2, dz], 'y', 18)
    k.dome('stainless', 0.06, [cx + 0.2, hb + rH + 0.36, dz], 'y', Math.PI / 2, 0.5, 18)
  }
  k.box('valveBody', [0.08, 0.08, 0.14], [cx + 0.2, hb + rH + 0.07, 0])
  k.handwheel('handwheel', 0.12, [cx + 0.2, hb + rH + 0.15, 0], 'y', 2)
  k.cyl(G, 0.1, 0.7, [cx + 0.05, hb + rH + 0.75, 0], 'x', 24)
  for (const s of [-1, 1]) k.cyl('flangeSteel', 0.12, 0.03, [cx + 0.05 + s * 0.35, hb + rH + 0.75, 0], 'x', 24)
  for (const s of [-1, 1]) k.box(G, [0.04, 0.25, 0.04], [cx + 0.05 + s * 0.25, hb + rH + 0.55, 0])
  gauge(k, [cx + 0.42, hb + rH + 0.5, LW / 2 - 0.05], 'z', 0.08, 'bar', 6)
  k.rod('stainless', [cx + 0.42, hb + rH, LW / 2 - 0.08], [cx + 0.42, hb + rH + 0.46, LW / 2 - 0.08], 0.008, 8)
  // supply header to both bearings and drains back
  const yS = ys + bhR + 0.18
  const zP = -bhR - 0.12
  k.tube('tubing', [[cx + 0.2, hb + rH + 0.4, -0.1], [cx + 0.2, yS, -0.1], [cx + 0.2, yS, zP], [xDE, yS, zP], [xDE, yS, 0], [xDE, ys + bhR, 0]], 0.012, 8, 0.05)
  k.tube('tubing', [[xNDE, yS, zP], [xNDE, yS, 0], [xNDE, ys + bhR, 0]], 0.012, 8, 0.05)
  for (const xh of [xDE, xNDE]) k.tube('equipmentPaintDark', [[xh, ys - bhR * 0.9, -bhR * 0.6], [xh, hb + 0.08, -bhR * 0.6], [xh, hb + 0.08, -W / 2 + 0.12], [cx - 0.45, hb + 0.08, -W / 2 + 0.12], [cx - 0.45, hb + 0.2, -LW / 2 + 0.05]], 0.022, 10, 0.06)
  for (const dz of [-0.22, 0.22]) anchorBolt(k, [cx + 0.45, hb, dz], 0.014)
}
