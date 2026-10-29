// Horizontal progressive cavity pump (bearing-housing design): suction housing with top inlet and inspection cover, stator on tie rods, axial discharge, helical gear motor on a drain-rim baseplate.
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { motor, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, cowlFan, guardedCoupling, type RotorSpec } from '../lib/rotors'
import { pipeOD, type Rating } from '../lib/standards'
import { clamp, drainRimBaseplate, flangeLen, flangedBranch, motorEnvelope, mountPad, pipeGauge, smallValve } from './_pumps'

export interface ProgressiveCavityPumpProps {
  suctionNps?: number
  dischargeNps?: number
  rating?: Rating
  /** motor rated power, kW */
  kw?: number
  /** pressure stages (stator length) */
  stages?: number
  casing?: MatKey
  tag?: string
  running?: boolean
}

export const defaults = {
  suctionNps: 4,
  dischargeNps: 3,
  rating: 150 as Rating,
  kw: 11,
  stages: 2,
  casing: 'actuatorBlue' as MatKey,
  running: true,
}

type P = Omit<typeof defaults, 'running'> & { tag?: string }

function layout(p: P) {
  const st = clamp(Math.round(p.stages), 1, 6)
  const m = motorEnvelope(clamp(p.kw, 0.75, 250), 4)
  const Ds = 0.12 + 0.03 * p.dischargeNps // stator OD, typical
  const Ls = st * Ds * 2.2
  const Dh = Math.max(Ds * 1.7, pipeOD(p.suctionNps) * 1.5) // suction housing
  const Lh = Math.max(Dh * 1.3, pipeOD(p.suctionNps) * 1.8)
  const hb = 0.22
  const ys = hb + Math.max(m.H + 0.04, Dh / 2 + 0.12)
  const gH = Math.max(m.R * 1.6, 0.22, ys - hb + 0.1) // gear unit height
  // along +X: gear motor | coupling | bearing housing | suction housing | stator | discharge housing
  const xBh0 = 0
  const Lbh = Math.max(0.28, Ds * 1.6)
  const xSh0 = xBh0 + Lbh
  const xSt0 = xSh0 + Lh
  const xSt1 = xSt0 + Ls
  const Ld = Math.max(0.16, Ds * 0.9)
  const xDe = xSt1 + Ld
  const xFace = xDe + 0.1 + flangeLen(p.dischargeNps, p.rating)
  const xSuc = xSh0 + Lh * 0.5
  const ySuc = ys + Dh / 2 + 0.18 + flangeLen(p.suctionNps, p.rating)
  const xSE = xBh0 - 0.1
  const xMS = xSE - 0.24
  const gL = Math.max(0.3, m.R * 2) // gear unit length
  const xg1 = xMS - 0.02
  const xg0 = xg1 - gL
  const xm = xg0 - 0.02
  const x0 = xm - m.L - Math.max(0.12, m.R * 0.6) - 0.12
  const x1 = xDe + 0.1
  const cx = (x0 + x1) / 2
  const W = Math.max(0.7, Dh + 0.35, 2 * m.R + 0.4)
  return { st, m, Ds, Ls, Dh, Lh, hb, gH, ys, xBh0, Lbh, xSh0, xSt0, xSt1, Ld, xDe, xFace, xSuc, ySuc, xSE, xMS, gL, xg0, xg1, xm, x0, x1, cx, W }
}

export function ports(props: ProgressiveCavityPumpProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  return [
    port('suction', 'Suction', [L.xSuc - L.cx, L.ySuc, 0], [0, 1, 0], p.suctionNps, p.rating),
    port('discharge', 'Discharge', [L.xFace - L.cx, L.ys, 0], [1, 0, 0], p.dischargeNps, p.rating),
  ]
}

export function ProgressiveCavityPump({ tag, ...rest }: ProgressiveCavityPumpProps & GroupProps) {
  const { suctionNps, dischargeNps, rating, kw, stages, casing, running, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(() => build({ suctionNps, dischargeNps, rating, kw, stages, casing, tag }), [suctionNps, dischargeNps, rating, kw, stages, casing, tag])
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default ProgressiveCavityPump

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
  const { m, Ds, Dh, Lh, hb, gH, ys, xBh0, Lbh, xSh0, xSt0, xSt1, Ld, xDe, xFace, xSuc, ySuc, xSE, xMS, xg0, xg1, xm, W } = L
  const rsh = Math.max(0.025, m.shaftDia * 0.6)

  // bearing housing (lantern with seal access windows), shaft seal at the suction-housing wall
  k.lathe(C, [[Ds * 0.42, xBh0], [Ds * 0.5, xBh0 + 0.02], [Ds * 0.5, xBh0 + Lbh * 0.45], [Ds * 0.4, xBh0 + Lbh * 0.55], [Ds * 0.62, xSh0 - 0.03], [Ds * 0.66, xSh0]], [0, ys, 0], 'x', 32)
  for (let i = 0; i < 4; i++) k.cyl(C, Ds * 0.55, 0.008, [xBh0 + 0.04 + i * Lbh * 0.08, ys, 0], 'x', 28)
  k.cyl('stainless', Ds * 0.22, 0.05, [xSh0 - Lbh * 0.25, ys, 0], 'x', 20)
  k.box(C, [Lbh * 0.7, ys - Ds * 0.45 - hb, Ds * 0.6], [xBh0 + Lbh * 0.35, (ys - Ds * 0.45 + hb) / 2, 0])
  k.box('flangeSteel', [Lbh * 0.8, 0.02, Ds * 0.9], [xBh0 + Lbh * 0.35, hb + 0.01, 0])
  k.cyl('brass', 0.008, 0.03, [xBh0 + Lbh * 0.2, ys + Ds * 0.5 + 0.015, 0], 'y', 8)
  k.sphere('brass', 0.011, [xBh0 + Lbh * 0.2, ys + Ds * 0.5 + 0.035, 0], undefined, 8)
  k.cyl('flangeSteel', rsh, xBh0 - xSE + 0.02, [(xBh0 + xSE) / 2, ys, 0], 'x', 14)

  // suction housing: body, end flanges, top inlet branch, bolted inspection cover, drain
  k.cyl(C, Dh / 2, Lh, [xSh0 + Lh / 2, ys, 0], 'x', 40)
  for (const x of [xSh0 + 0.015, xSt0 - 0.015]) {
    k.cyl(C, Dh / 2 + 0.03, 0.03, [x, ys, 0], 'x', 40)
    k.boltCircle('boltXylan', 'nut', 8, Dh / 2 + 0.012, [x - 0.03, ys, 0], 'x', 0.012, 0.06, [0.006, 0.054])
  }
  k.lathe(C, [[0, 0], [pipeOD(p.suctionNps) * 0.62, 0], [pipeOD(p.suctionNps) * 0.56, Dh / 2 + 0.06], [pipeOD(p.suctionNps) * 0.44, Dh / 2 + 0.06]], [xSuc, ys, 0], 'y', 32)
  flangedBranch(k, C, [xSuc, ys + Dh * 0.25, 0], [xSuc, ySuc, 0], p.suctionNps, p.rating, 'STD')
  const cw = Lh * 0.55
  k.rbox(C, [cw, Dh * 0.5, 0.03], 0.01, [xSuc, ys, Dh / 2 + 0.01])
  for (const dx of [-cw * 0.4, 0, cw * 0.4]) for (const dy of [-Dh * 0.2, Dh * 0.2]) k.hex('nut', 0.026, 0.016, [xSuc + dx, ys + dy, Dh / 2 + 0.032], 'z')
  k.box('handwheel', [cw * 0.35, 0.025, 0.03], [xSuc, ys, Dh / 2 + 0.045])
  k.cyl(C, 0.02, 0.05, [xSuc, ys - Dh / 2 - 0.02, 0], 'y', 10)
  k.hex('nut', 0.035, 0.02, [xSuc, ys - Dh / 2 - 0.05, 0])
  for (const sz of [-1, 1]) k.box(C, [Lh * 0.6, ys - Dh * 0.35 - hb, 0.04], [xSuc, (ys - Dh * 0.35 + hb) / 2, sz * Dh * 0.3])
  k.box('flangeSteel', [Lh * 0.7, 0.02, Dh * 0.8], [xSuc, hb + 0.01, 0])
  pipeGauge(k, [xSuc + pipeOD(p.suctionNps) * 0.6 + 0.03, ys + Dh / 2, 0], [0, 0, 1], 10, 0.08)

  // stator: rubber-lined tube with end collars, four tie rods with nuts, support saddle
  k.cyl('castIron', Ds / 2, xSt1 - xSt0, [(xSt0 + xSt1) / 2, ys, 0], 'x', 32)
  for (const x of [xSt0 + 0.02, xSt1 - 0.02]) k.cyl('castIron', Ds / 2 + 0.012, 0.04, [x, ys, 0], 'x', 32)
  const rT = Ds / 2 + 0.035
  k.around(4, rT, [0, ys, 0], 'x', (q) => {
    k.rod('boltXylan', [xSt0 - 0.03, q[1], q[2]], [xDe - Ld * 0.3, q[1], q[2]], 0.009, 8)
    for (const x of [xSt0 - 0.04, xDe - Ld * 0.3]) k.hex('nut', 0.03, 0.018, [x, q[1], q[2]], 'x')
  }, Math.PI / 4)
  const xSup = (xSt0 + xSt1) / 2
  k.box(C, [0.06, ys - Ds / 2 - hb, Ds * 0.9], [xSup, (ys - Ds / 2 + hb) / 2, 0])
  k.box(C, [0.08, 0.02, Ds * 1.1], [xSup, ys - Ds / 2 - 0.01, 0])
  k.box('flangeSteel', [0.14, 0.02, Ds * 1.1], [xSup, hb + 0.01, 0])

  // discharge housing with tie-rod flange, axial discharge branch, pressure gauge and drain
  k.cyl(C, Ds / 2 + 0.05, 0.04, [xSt1 + 0.02, ys, 0], 'x', 32)
  k.cyl(C, Ds * 0.42, Ld - 0.04, [xSt1 + 0.04 + (Ld - 0.04) / 2, ys, 0], 'x', 32, Ds * 0.32)
  flangedBranch(k, C, [xDe - 0.02, ys, 0], [xFace, ys, 0], p.dischargeNps, p.rating, 'STD')
  pipeGauge(k, [xDe + 0.05, ys + pipeOD(p.dischargeNps) / 2, 0], [0, 0, 1], 25, 0.08)
  k.box(C, [Ld * 0.6, ys - Ds * 0.4 - hb, 0.05], [xSt1 + Ld * 0.5, (ys - Ds * 0.4 + hb) / 2, 0])
  k.box('flangeSteel', [Ld * 0.8, 0.02, Ds * 0.8], [xSt1 + Ld * 0.5, hb + 0.01, 0])
  k.rod(C, [xSt1 + Ld * 0.6, ys - Ds * 0.38, Ds * 0.2], [xSt1 + Ld * 0.6, ys - Ds * 0.38 - 0.05, Ds * 0.3], 0.012, 8)
  smallValve(k, [xSt1 + Ld * 0.6, ys - Ds * 0.38 - 0.07, Ds * 0.3 + 0.03], 0.6, 'z')

  // helical gear unit + motor (gear motor on the baseplate), guarded coupling to the pump shaft
  const gW = Math.max(m.R * 1.9, 0.24)
  const gC = (xg0 + xg1) / 2
  k.rbox('motorPaint', [xg1 - xg0, gH, gW], 0.03, [gC, hb + gH / 2 + 0.03, 0])
  k.box('motorPaint', [xg1 - xg0 + 0.08, 0.03, gW + 0.08], [gC, hb + 0.045, 0])
  for (const s of [-1, 1]) k.box('motorPaint', [0.02, gH * 0.7, 0.012], [gC, hb + gH * 0.5, s * (gW / 2 + 0.006)])
  k.cyl('motorPaint', rsh * 2.2, 0.06, [xg1 + 0.03, ys, 0], 'x', 20)
  k.cyl('brass', 0.01, 0.04, [gC, hb + gH + 0.05, 0], 'y', 8)
  k.cyl('brass', 0.016, 0.01, [gC + (xg1 - xg0) * 0.25, hb + gH * 0.35, gW / 2 + 0.005], 'z', 14)
  k.box('nameplate', [0.08, 0.05, 0.002], [gC - (xg1 - xg0) * 0.2, hb + gH * 0.6, gW / 2 + 0.002])
  const yM = Math.max(m.H + hb, ys - gH * 0.2)
  k.at([xm, yM, 0], undefined, () => motor(k, { R: m.R, L: m.L, H: yM - hb, tbox: 'top' }))
  for (const fx of [xm - m.L * 0.82, xm - m.L * 0.18]) for (const s of [-1, 1]) mountPad(k, fx, hb, s * m.R * 0.78, 0.18, 0.16, 0)
  rotors.push(guardedCoupling(k, xMS - 0.02, xSE + 0.04, ys, Math.max(0.12, rsh * 4), hb, 'safetyYellow', 60, 0, rsh))
  rotors.push(cowlFan(m.R, m.L, 160, [xm, yM, 0]))
  tagPlate(k, `${m.frame} ${p.kw} kW`, [xm - m.L * 0.55, yM, m.R * 1.13], 'z', Math.max(0.07, m.R * 0.6))

  drainRimBaseplate(k, L.x1 - L.x0, W, hb, 'equipmentPaintDark', (L.x0 + L.x1) / 2)
  if (p.tag) tagPlate(k, p.tag, [(L.x0 + L.x1) / 2, hb * 0.5, W / 2 + 0.002], 'z', 0.18)
}
