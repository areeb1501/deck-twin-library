// Offshore twin-pump cementing skid (API 10A / API 7K / DNV 2.7-3 practice): electric-driven triplex plunger pumps, recirculating mixer tub, displacement tanks, HP manifold, control cabin.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { flange, gauge, grating, handrail, ladder, motor, motorSize, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, cowlFan, guardedCoupling, type RotorSpec } from '../lib/rotors'
import { flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { hammerCap } from './_drill'

export interface CementUnitProps {
  /** drive motor per pump, kW */
  kw?: number
  /** displacement tank volume each, bbl */
  tankBbl?: number
  dischargeRating?: Rating
  color?: string
  tag?: string
  /** turn the drives and the tub agitator */
  running?: boolean
}

export const defaults = { kw: 300, tankBbl: 10, dischargeRating: 2500 as Rating, color: '#c8352b', tag: 'CU-01', running: true }

type P = typeof defaults

// typical 7.5 × 2.5 m skid, two 10 bbl displacement tanks
const L = 7.5
const W = 2.5
const yb = 0.208

function layout(p: Omit<P, 'tag' | 'running' | 'color' | 'kw'>) {
  const v = Math.max(5, Math.min(20, p.tankBbl)) * 0.159
  const th = 1.4
  const tw = Math.min(1.15, Math.sqrt(v / th))
  const tl = v / th / tw
  return {
    th, tw, tl,
    discharge: [-0.3, 1.55, -W / 2 - 0.25] as V3,
    water: [0.1, yb + 0.55, W / 2 + 0.3] as V3,
    bulk: [-0.1, yb + 2.15, 0.45] as V3,
  }
}

export function ports(props: CementUnitProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [
    port('discharge', 'HP discharge (to cement head)', l.discharge, [0, 0, -1], 2, p.dischargeRating),
    port('water', 'Mix water supply', l.water, [0, 0, 1], 4, 150),
    port('bulk', 'Dry cement (bulk) inlet', l.bulk, [0, 1, 0], 5, 150, 'utility'),
  ]
}

export function CementUnit({ tag = defaults.tag, ...rest }: CementUnitProps & GroupProps) {
  const { kw, tankBbl, dischargeRating, color, running, ...group } = { ...defaults, ...rest }
  const out = useMemo(() => build({ kw, tankBbl, dischargeRating, color, tag, running }), [kw, tankBbl, dischargeRating, color, tag])
  useEffect(() => () => [out.built, ...out.rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [out])
  return (
    <group {...group}>
      <KitMesh data={out.built} />
      <Rotors rotors={out.rotors} running={running} />
    </group>
  )
}

export default CementUnit

function build(p: P) {
  const k = new Kit()
  const l = layout(p)
  const C: MatKey = paint(p.color)
  const FE: MatKey = paint('#5b6168', { metalness: 0.45, roughness: 0.45 })
  const rotors: RotorSpec[] = []
  const top = skid(k, L, W, 'HEB 200', 'structSteelDark')

  // two pump trains: TEFC motor, guarded coupling, reduction gearbox, triplex plunger pump
  const m = motorSize(p.kw, 4)
  const ys = top + m.H
  const xm = -2.05
  for (const zp of [-0.62, 0.62]) {
    k.box('structSteelDark', [m.L + 0.2, 0.03, 0.7], [xm - m.L / 2, top + 0.015, zp])
    k.at([xm, ys, zp], undefined, () => motor(k, { R: m.R, L: m.L, H: m.H - 0.03, tbox: 'top', cable: true }))
    rotors.push(cowlFan(m.R, m.L, 300, [xm, ys, zp]))
    rotors.push(guardedCoupling(k, xm + 0.04, xm + 0.3, ys, 0.17, top + 0.03, 'safetyYellow', 300, zp, 0.05))
    // gearbox (input on the motor shaft line, output low to the crank)
    const xg = xm + 0.3
    k.rbox(C, [0.42, ys + 0.2 - top, 0.55], 0.04, [xg + 0.21, (ys + 0.2 + top) / 2, zp])
    k.cyl('brass', 0.02, 0.08, [xg + 0.15, ys + 0.24, zp], 'y', 10)
    // power end: crankcase, crosshead section, plunger windows
    const xp = xg + 0.42
    k.rbox(C, [0.6, 0.62, 0.85], 0.06, [xp + 0.3, top + 0.31, zp])
    k.cyl(C, 0.3, 0.86, [xp + 0.25, top + 0.48, zp], 'z', 32)
    k.box(C, [0.25, 0.42, 0.75], [xp + 0.72, top + 0.33, zp])
    // fluid end with three plungers, valve caps on top and front, suction manifold below
    const xf = xp + 0.95
    k.rbox(FE, [0.32, 0.4, 0.82], 0.03, [xf, top + 0.36, zp])
    for (const dz of [-0.26, 0, 0.26]) {
      k.cyl('stainless', 0.045, 0.14, [xp + 0.88, top + 0.33, zp + dz], 'x', 16)
      k.at([xf, top + 0.56, zp + dz], 'y', () => hammerCap(k, FE, 0.075, 0.07))
      k.at([xf + 0.16, top + 0.33, zp + dz], 'x', () => hammerCap(k, FE, 0.07, 0.06))
    }
    k.cyl(FE, 0.07, 0.95, [xf, top + 0.1, zp], 'z', 20)
    k.box('nameplate', [0.2, 0.12, 0.003], [xp + 0.3, top + 0.4, zp + Math.sign(zp) * 0.428])
    // HP discharge riser with plug valve to the common header
    k.cyl('flangeSteel', 0.04, 1.55 - (top + 0.54), [xf - 0.22, (1.55 + top + 0.54) / 2, zp], 'y', 14)
    k.rbox('valveBody', [0.14, 0.14, 0.16], 0.02, [xf - 0.22, 1.15, zp])
    k.rod('safetyYellow', [xf - 0.22, 1.15, zp], [xf - 0.22, 1.17, zp - 0.3 * Math.sign(zp)], 0.012, 8)
  }

  // HP header across the pumps, transducer and gauge, pop-off valve, discharge flange at -Z
  const xh = -0.3
  const xfR = xm + 0.3 + 0.42 + 0.95 - 0.22
  for (const zp of [-0.62, 0.62]) k.tube('flangeSteel', [[xfR, 1.55, zp], [xh, 1.55, zp]], 0.04, 12, 0.1)
  k.pipe('flangeSteel', [xh, 1.55, 0.7], [xh, 1.55, l.discharge[2] + flangeDims(2, p.dischargeRating).hubLength + flangeDims(2, p.dischargeRating).raisedFaceHeight], 0.1, 0.03)
  flange(k, 2, p.dischargeRating, l.discharge, '-z', true)
  k.box('structSteelDark', [0.08, 1.55 - top - 0.05, 0.08], [xh, (1.55 + top) / 2 - 0.025, -W / 2 + 0.15])
  k.cyl('stainless', 0.025, 0.14, [xh, 1.62, -0.3], 'y', 12)
  gauge(k, [xh, 1.74, -0.3], 'x', 0.14, 'bar', 1000)
  k.rbox('actuatorRed', [0.12, 0.18, 0.12], 0.02, [xh, 1.67, 0.3])
  k.cyl('actuatorRed', 0.035, 0.18, [xh, 1.85, 0.3], 'y', 14)

  // recirculating mixer: tub on legs with agitator, jet mixing head and bulk inlet, recirc pump, densitometer
  const xt = 0.25
  const zt = 0.45
  const rT = 0.62
  const y0 = yb + 0.75
  const y1 = y0 + 0.95
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    k.box('structSteelDark', [0.08, y0 - top, 0.08], [xt + Math.cos(a) * rT * 0.8, (y0 + top) / 2, zt + Math.sin(a) * rT * 0.8])
  }
  k.lathe(C, [[0.1, y0 - 0.15], [rT, y0], [rT, y1], [rT + 0.03, y1], [rT + 0.03, y1 + 0.03], [rT - 0.01, y1 + 0.03], [rT - 0.01, y0 + 0.01], [0.1, y0 - 0.14]], [xt, 0, zt], 'y', 40)
  k.disc(paint('#a7a49c', { metalness: 0, roughness: 0.3, weather: 0 }), rT - 0.012, [xt, y1 - 0.25, zt], 'y', 40)
  k.box(C, [2 * rT + 0.1, 0.1, 0.12], [xt, y1 + 0.08, zt])
  k.rbox('machineryGreen', [0.25, 0.25, 0.25], 0.02, [xt, y1 + 0.26, zt])
  k.at([xt, y1 + 0.26, zt + 0.13], undefined, () => k.cyl('motorPaint', 0.11, 0.3, [0, 0, 0.15], 'z', 24))
  const ag = new Kit()
  ag.cyl('stainless', 0.025, y1 + 0.13 - (y0 + 0.15), [0, (y1 + 0.13 + y0 + 0.15) / 2, 0], 'y', 10)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    ag.box('stainless', [0.22, 0.01, 0.08], [Math.cos(a) * 0.13, y0 + 0.2, Math.sin(a) * 0.13], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6)))
  }
  rotors.push({ built: ag.build(), axis: 'y', pos: [xt, 0, zt], rpm: 80 })
  // mixing head on the tub rim and the bulk cement inlet line
  const b = l.bulk
  k.cyl(C, 0.16, 0.35, [b[0], y1 + 0.2, b[2]], 'y', 24)
  k.cyl(C, 0.09, b[1] - flangeDims(5, 150).hubLength - (y1 + 0.37), [b[0], (b[1] - flangeDims(5, 150).hubLength + y1 + 0.37) / 2, b[2]], 'y', 20)
  flange(k, 5, 150, b, 'y', true)
  // recirc pump set under the tub on the -Z side, densitometer spool and lines into the tub
  const rm = motorSize(37, 4)
  const zr = -0.45
  k.at([xt + 0.25, top + rm.H, zr], undefined, () => motor(k, { R: rm.R, L: rm.L, H: rm.H, tbox: 'top' }))
  k.cyl(C, 0.17, 0.12, [xt + 0.45, top + rm.H, zr], 'x', 28)
  k.tube(C, [[xt + 0.45, top + rm.H + 0.15, zr], [xt + 0.45, y1 + 0.15, zr], [xt + 0.45, y1 + 0.15, zt - rT * 0.5], [xt + 0.3, y1 - 0.05, zt - rT * 0.5]], 0.05, 12, 0.1)
  k.rbox('stainless', [0.14, 0.18, 0.2], 0.02, [xt + 0.45, top + 1.0, zr])
  k.tube(C, [[xt, y0 - 0.14, zt], [xt, top + 0.2, zt], [xt + 0.57, top + 0.2, zt], [xt + 0.57, top + rm.H, zr + 0.05]], 0.055, 12, 0.1)
  // mix-water inlet (+Z) with butterfly valve
  const w = l.water
  const fw = flange(k, 4, 150, w, 'z', true)
  k.tube('pipePaint', [[w[0], w[1], w[2] - fw], [w[0], w[1], zt + rT + 0.05], [w[0], y1 - 0.1, zt + rT + 0.05], [w[0], y1 - 0.1, zt + rT - 0.05]], pipeOD(4) / 2, 16, 0.12)
  k.cyl('valveBody', 0.08, 0.06, [w[0], w[1], w[2] - fw - 0.25], 'z', 24)
  k.rod('actuatorRed', [w[0], w[1] + 0.08, w[2] - fw - 0.25], [w[0] + 0.25, w[1] + 0.1, w[2] - fw - 0.25], 0.012, 8)

  // displacement tanks with sight gauges, top grating, handrail and ladder; outlets to the pump suction header
  const xd = 1.75
  const yTop = yb + l.th + 0.05
  for (const s of [-1, 1]) {
    const zc = s * (l.tw / 2 + 0.05)
    k.box(C, [l.tl, l.th, l.tw], [xd, yb + l.th / 2 + 0.03, zc])
    for (let i = 1; i < 3; i++) k.box(C, [l.tl + 0.03, 0.05, l.tw + 0.03], [xd, yb + (l.th * i) / 3, zc])
    k.cyl('glass', 0.025, l.th - 0.2, [xd - l.tl / 4, yb + l.th / 2, zc + s * (l.tw / 2 + 0.05)], 'y', 12)
    k.box('stainless', [0.03, l.th - 0.2, 0.01], [xd - l.tl / 4 + 0.05, yb + l.th / 2, zc + s * (l.tw / 2 + 0.035)])
    for (const yy of [yb + 0.15, yb + l.th - 0.08]) k.rod('stainless', [xd - l.tl / 4, yy, zc + s * l.tw / 2], [xd - l.tl / 4, yy, zc + s * (l.tw / 2 + 0.05)], 0.01, 8)
    tagPlate(k, `DISP TANK ${s < 0 ? 'A' : 'B'}  ${p.tankBbl} BBL`, [xd + 0.15, yb + l.th * 0.8, zc + s * (l.tw / 2 + 0.002)], s < 0 ? '-z' : 'z', 0.32)
    k.tube(C, [[xd - l.tl / 2, yb + 0.15, zc], [xd - l.tl / 2 - 0.2, yb + 0.15, zc], [xd - l.tl / 2 - 0.2, yb + 0.15, 0]], pipeOD(4) / 2, 12, 0.1)
  }
  grating(k, [xd, yTop, 0], l.tl, 2 * l.tw + 0.1)
  handrail(k, [[xd + 0.05, yTop, l.tw + 0.05], [xd - l.tl / 2, yTop, l.tw + 0.05], [xd - l.tl / 2, yTop, -l.tw - 0.05], [xd + l.tl / 2, yTop, -l.tw - 0.05], [xd + l.tl / 2, yTop, l.tw + 0.05], [xd + 0.55, yTop, l.tw + 0.05]])
  ladder(k, [xd + 0.3, top, W / 2 - 0.04], yTop, [0, 0, 1], { cage: false })
  for (const dx of [0.075, 0.525]) k.box('safetyYellow', [0.04, 0.04, W / 2 - 0.04 - l.tw], [xd + dx, yTop - 0.3, (W / 2 - 0.04 + l.tw) / 2])
  // suction header (4") from the tanks and tub to both pump suction manifolds
  const xfS = xm + 0.3 + 0.42 + 0.95
  k.pipe(C, [xd - l.tl / 2 - 0.2, yb + 0.15, 0], [xfS, yb + 0.15, 0], pipeOD(4), pipeWall(4))
  for (const zp of [-0.62, 0.62]) k.tube(C, [[xfS, yb + 0.15, 0], [xfS + 0.15, yb + 0.15, 0], [xfS + 0.15, yb + 0.15, zp * 0.6], [xfS, top + 0.1, zp * 0.6]], 0.05, 12, 0.08)

  // control cabin: insulated house with windows, door, roof A/C, console visible inside
  const xc0 = 2.55
  const xc1 = L / 2 - 0.05
  const hc = 2.35
  const cx = (xc0 + xc1) / 2
  const cl = xc1 - xc0
  k.box('cladding', [cl, 0.04, W - 0.1], [cx, top + 0.02, 0])
  for (const s of [-1, 1]) k.box('cladding', [cl, hc, 0.05], [cx, top + hc / 2, s * (W / 2 - 0.075)])
  k.box('cladding', [0.05, hc, W - 0.1], [xc0 + 0.025, top + hc / 2, 0])
  k.box('cladding', [0.05, 0.9, W - 0.1], [xc1 - 0.025, top + 0.45, 0])
  k.box('cladding', [0.05, 0.45, W - 0.1], [xc1 - 0.025, top + hc - 0.225, 0])
  k.box('glass', [0.02, hc - 1.35, W - 0.3], [xc1 - 0.02, top + 0.9 + (hc - 1.35) / 2, 0])
  k.box('cladding', [cl + 0.1, 0.08, W], [cx, top + hc + 0.04, 0])
  k.rbox('cladding', [0.7, 0.35, 0.9], 0.04, [cx, top + hc + 0.255, 0])
  k.box('glass', [0.6, 0.6, 0.02], [cx + 0.1, top + 1.5, W / 2 - 0.045])
  k.box(C, [0.8, 2.0, 0.03], [cx + 0.1, top + 1.0, -W / 2 + 0.035])
  k.rod('stainless', [cx + 0.42, top + 1.0, -W / 2 + 0.02], [cx + 0.42, top + 1.0, -W / 2 - 0.03], 0.01, 8)
  k.box('plasticGrey', [0.5, 0.85, 1.5], [xc1 - 0.35, top + 0.45, 0])
  k.box('plasticGrey', [0.4, 0.04, 1.5], [xc1 - 0.32, top + 0.9, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.25))
  k.box('rubberBlack', [0.1, 0.4, 0.5], [xc1 - 0.6, top + 1.15, 0])

  tagPlate(k, p.tag, [-L / 2 + 0.9, 0.11, W / 2 + 0.002], 'z', 0.3)
  tagPlate(k, 'DNV 2.7-3', [-L / 2 + 1.3, 0.11, W / 2 + 0.002], 'z', 0.2)
  return { built: k.build(), rotors }
}
