// API 675 hydraulically actuated diaphragm metering pump: IEC motor, worm-gear drive with micrometer stroke adjuster, diaphragm liquid end with double-ball check valves.
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { gauge, motor, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, cowlFan, type RotorSpec } from '../lib/rotors'
import { type Rating } from '../lib/standards'
import { anchorBolt, clamp, flangeLen, flangedBranch, motorEnvelope } from './_pumps'

export interface MeteringPumpProps {
  suctionNps?: number
  dischargeNps?: number
  suctionRating?: Rating
  /** discharge flange class */
  rating?: Rating
  /** motor rated power, kW */
  kw?: number
  /** stroke length setting, 0 … 100 % (micrometer position) */
  stroke?: number
  housing?: MatKey
  tag?: string
  running?: boolean
}

export const defaults = {
  suctionNps: 1,
  dischargeNps: 0.5,
  suctionRating: 300 as Rating,
  rating: 1500 as Rating,
  kw: 1.5,
  stroke: 60,
  housing: 'actuatorBlue' as MatKey,
  running: true,
}

type P = Omit<typeof defaults, 'running'> & { tag?: string }

function layout(p: P) {
  const kw = clamp(p.kw, 0.25, 30)
  const m = motorEnvelope(kw, 4)
  const hb = 0.3 // pedestal top
  const g = clamp(0.24 + 0.03 * Math.sqrt(kw), 0.26, 0.45) // gearbox cube, typical
  const ys = hb + Math.max(m.H, g * 0.45) // worm (motor) shaft height
  const yh = ys + g * 0.15 // plunger / diaphragm axis
  const Rh = clamp(0.08 + 0.025 * Math.sqrt(kw), 0.09, 0.2) // diaphragm head radius
  const xG = 0
  const xH = xG + g / 2 + 0.18 // head centre (diaphragm plane)
  const vS = 0.13 // check-valve cartridge length, typical
  const ySuc = yh - Rh - vS - flangeLen(p.suctionNps, p.suctionRating) - 0.03
  const yDis = yh + Rh + vS + flangeLen(p.dischargeNps, p.rating) + 0.03
  const xm = xG - g / 2 - 0.12
  const x0 = xm - m.L - Math.max(0.12, m.R * 0.6) - 0.05
  const x1 = xG + g / 2 + 0.05
  const cx = (x0 + xH + 0.1) / 2
  return { kw, m, hb, g, ys, yh, Rh, xG, xH, vS, ySuc, yDis, xm, x0, x1, cx }
}

export function ports(props: MeteringPumpProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  return [
    port('suction', 'Suction', [L.xH - L.cx, L.ySuc, 0], [0, -1, 0], p.suctionNps, p.suctionRating),
    port('discharge', 'Discharge', [L.xH - L.cx, L.yDis, 0], [0, 1, 0], p.dischargeNps, p.rating),
  ]
}

export function MeteringPump({ tag, ...rest }: MeteringPumpProps & GroupProps) {
  const { suctionNps, dischargeNps, suctionRating, rating, kw, stroke, housing, running, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(
    () => build({ suctionNps, dischargeNps, suctionRating, rating, kw, stroke, housing, tag }),
    [suctionNps, dischargeNps, suctionRating, rating, kw, stroke, housing, tag],
  )
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default MeteringPump

function build(p: P) {
  const k = new Kit()
  const L = layout(p)
  const rotors: RotorSpec[] = []
  k.at([-L.cx, 0, 0], undefined, () => draw(k, p, L, rotors))
  for (const r of rotors) r.pos = [r.pos[0] - L.cx, r.pos[1], r.pos[2]]
  return { built: k.build(), rotors }
}

function draw(k: Kit, p: P, L: ReturnType<typeof layout>, rotors: RotorSpec[]) {
  const H = p.housing
  const { hb, g, ys, yh, Rh, xG, xH, vS, xm, x0, x1, m } = L
  const D: MatKey = 'equipmentPaintDark'

  // fabricated pedestal: top plate, legs, base plate with anchors; liquid end overhangs for the suction pipe
  const W = Math.max(0.42, m.R * 2 + 0.16, g + 0.1)
  k.box(D, [x1 - x0, 0.02, W], [(x0 + x1) / 2, hb - 0.01, 0])
  for (const s of [-1, 1]) k.box(D, [x1 - x0, hb - 0.04, 0.012], [(x0 + x1) / 2, (hb - 0.02) / 2 + 0.01, s * (W / 2 - 0.006)])
  for (const s of [-1, 1]) k.box(D, [0.012, hb - 0.04, W], [s > 0 ? x1 - 0.006 : x0 + 0.006, (hb - 0.02) / 2 + 0.01, 0])
  k.box(D, [x1 - x0 + 0.1, 0.016, W + 0.1], [(x0 + x1) / 2, 0.008, 0])
  for (const sx of [x0 + 0.03, x1 - 0.03]) for (const sz of [-1, 1]) anchorBolt(k, [sx, 0.016, sz * (W / 2 + 0.025)], 0.014)
  k.box(D, [0.05, 0.05, 0.012], [x0 + 0.08, hb * 0.5, W / 2 + 0.006])
  k.cyl('brass', 0.01, 0.025, [x0 + 0.2, hb * 0.5, W / 2 + 0.012], 'z', 8)

  // worm gear housing with oil level window, breather, drain, cooling ribs
  const yg = hb + g * 0.5
  k.rbox(H, [g, g, g * 0.85], g * 0.12, [xG, yg, 0])
  k.box(H, [g + 0.05, 0.02, g * 0.85 + 0.05], [xG, hb + 0.01, 0])
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.box(H, [0.01, g * 0.7, 0.02], [xG - g * 0.25 + i * g * 0.25, yg, s * (g * 0.425 + 0.01)])
  k.cyl('brass', 0.022, 0.01, [xG + g * 0.2, hb + g * 0.3, g * 0.425 + 0.005], 'z', 16)
  k.disc('glass', 0.017, [xG + g * 0.2, hb + g * 0.3, g * 0.425 + 0.0105], 'z', 16)
  k.cyl('brass', 0.008, 0.03, [xG - g * 0.25, hb + g + 0.015, -g * 0.2], 'y', 8)
  k.sphere('brass', 0.014, [xG - g * 0.25, hb + g + 0.035, -g * 0.2], undefined, 10)
  k.hex('nut', 0.026, 0.015, [xG + g * 0.35, hb + 0.04, g * 0.425 + 0.008], 'z')
  k.box('nameplate', [g * 0.4, g * 0.22, 0.002], [xG - g * 0.1, yg + g * 0.18, g * 0.425 + 0.002])
  // motor adapter (C-face lantern)
  k.cyl(H, m.R * 0.75, 0.1, [xG - g / 2 - 0.05, ys, 0], 'x', 24, m.R * 0.6)

  // micrometer stroke adjuster on top: sleeve, graduated barrel, knob, lock lever
  const st = clamp(p.stroke, 0, 100) / 100
  const xa = xG + g * 0.15
  const ya = hb + g
  k.cyl(H, 0.045, 0.06, [xa, ya + 0.03, 0], 'y', 20)
  k.cyl('stainless', 0.03, 0.08 + 0.03 * st, [xa, ya + 0.1 + 0.015 * st, 0], 'y', 20)
  for (let i = 0; i < 5; i++) k.torus('nut', 0.0305, 0.0015, [xa, ya + 0.075 + i * 0.012, 0], 'y', 4, 24)
  k.cyl('handwheel', 0.05, 0.035, [xa, ya + 0.16 + 0.03 * st, 0], 'y', 18)
  k.rod('actuatorRed', [xa + 0.03, ya + 0.09, 0], [xa + 0.1, ya + 0.1, 0.03], 0.006, 6)
  k.sphere('actuatorRed', 0.012, [xa + 0.1, ya + 0.1, 0.03], undefined, 8)

  // hydraulic diaphragm liquid end: plunger housing, intermediate ring, head with bolt circle
  const xi0 = xG + g / 2
  k.cyl(H, Rh * 0.75, 0.1, [xi0 + 0.05, yh, 0], 'x', 28, Rh * 0.9)
  k.cyl(H, Rh * 1.08, 0.04, [xi0 + 0.12, yh, 0], 'x', 32)
  k.cyl('stainless', Rh, 0.08, [xH, yh, 0], 'x', 32)
  k.cyl('stainless', Rh * 0.65, 0.03, [xH + 0.055, yh, 0], 'x', 28)
  k.boltCircle('boltXylan', 'nut', 8, Rh * 0.86, [xi0 + 0.09, yh, 0], 'x', 0.01, 0.15, [0.005, 0.145], Math.PI / 8)
  // refill / relief valve and diaphragm-rupture pressure gauge
  k.cyl('stainless', 0.018, 0.05, [xi0 + 0.06, yh + Rh * 0.8, -Rh * 0.3], 'y', 12)
  k.cyl('brass', 0.02, 0.04, [xi0 + 0.06, yh + Rh * 0.8 + 0.045, -Rh * 0.3], 'y', 12)
  k.rod('stainless', [xH, yh, Rh * 0.9], [xH, yh, Rh + 0.06], 0.007, 8)
  gauge(k, [xH, yh, Rh + 0.08], 'z', 0.06, 'bar', 250)

  // double-ball check valve cartridges, suction below, discharge above
  const xv = xH
  for (const s of [-1, 1]) {
    const y0 = yh + s * Rh * 0.85
    const y1 = yh + s * (Rh + vS)
    k.box('stainless', [0.07, Math.abs(y1 - y0) * 0.35, 0.07], [xv, y0 + s * Math.abs(y1 - y0) * 0.175, 0])
    k.cyl('stainless', 0.03, Math.abs(y1 - y0) * 0.65, [xv, y1 - s * Math.abs(y1 - y0) * 0.325, 0], 'y', 18)
    k.hex('nut', 0.075, 0.02, [xv, y1 - s * Math.abs(y1 - y0) * 0.6, 0])
  }
  flangedBranch(k, 'stainless', [xv, yh - Rh - vS - 0.005, 0], [xv, L.ySuc, 0], p.suctionNps, p.suctionRating, '80')
  flangedBranch(k, 'stainless', [xv, yh + Rh + vS + 0.005, 0], [xv, L.yDis, 0], p.dischargeNps, p.rating, '80')

  // motor (B3/B5) and its fan
  k.at([xm, ys, 0], undefined, () => motor(k, { R: m.R, L: m.L, H: ys - hb, tbox: 'top' }))
  tagPlate(k, `${m.frame} ${p.kw} kW`, [xm - m.L * 0.5, ys, m.R * 1.13], 'z', Math.max(0.06, m.R * 0.6))
  rotors.push(cowlFan(m.R, m.L, 160, [xm, ys, 0]))
  if (p.tag) tagPlate(k, p.tag, [(x0 + x1) / 2, hb * 0.55, W / 2 + 0.002], 'z', 0.14)
}
