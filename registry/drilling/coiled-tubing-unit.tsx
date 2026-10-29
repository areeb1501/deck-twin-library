// Offshore coiled-tubing spread (API RP 16ST / API 5ST): reel skid with level wind and hydraulic drive, operator control cabin, hydraulic power pack.
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { flange, gauge, ladder, liftingLug, motor, motorSize, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, fanRotor, type RotorSpec } from '../lib/rotors'
import { inch } from '../lib/standards'

export interface CoiledTubingUnitProps {
  /** coiled tubing OD, inches */
  tubingOd?: number
  /** reel flange diameter, m */
  flangeDia?: number
  /** reel core diameter, m */
  coreDia?: number
  /** tubing on the reel, fraction of the core-to-flange depth */
  fill?: number
  /** level-wind carriage position across the reel, 0 … 1 */
  wind?: number
  /** include the control cabin and power pack skids */
  spread?: boolean
  color?: string
  tag?: string
  /** turn the reel and the cooler fan */
  running?: boolean
}

export const defaults = { tubingOd: 1.75, flangeDia: 4.3, coreDia: 2.9, fill: 0.7, wind: 0.4, spread: true, color: '#1f5fa8', tag: 'CTU-01', running: false }

type P = typeof defaults

// typical offshore reel skid: 5.6 × 3.0 × 4.7 m, core 2.9 m (114"), drum width 2.3 m
const RL = 5.6
const RW = 3.0
const DW = 2.3

function layout(p: Omit<P, 'tag' | 'running' | 'color' | 'fill' | 'wind' | 'tubingOd'>) {
  const Rf = Math.max(1.6, Math.min(2.4, p.flangeDia / 2))
  const yA = Rf + 0.35
  return { Rf, yA, inlet: [0, yA, -DW / 2 - 0.62] as V3 }
}

export function ports(props: CoiledTubingUnitProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [port('inlet', 'Reel swivel inlet', l.inlet, [0, 0, -1], 2, 2500)]
}

export function CoiledTubingUnit({ tag = defaults.tag, ...rest }: CoiledTubingUnitProps & GroupProps) {
  const { tubingOd, flangeDia, coreDia, fill, wind, spread, color, running, ...group } = { ...defaults, ...rest }
  const out = useMemo(() => build({ tubingOd, flangeDia, coreDia, fill, wind, spread, color, tag, running }), [tubingOd, flangeDia, coreDia, fill, wind, spread, color, tag])
  useEffect(() => () => [out.built, ...out.rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [out])
  return (
    <group {...group}>
      <KitMesh data={out.built} />
      <Rotors rotors={out.rotors} running={running} />
    </group>
  )
}

export default CoiledTubingUnit

function build(p: P) {
  const k = new Kit()
  const l = layout(p)
  const { Rf, yA } = l
  const C: MatKey = paint(p.color)
  const rotors: RotorSpec[] = []
  const od = inch(Math.max(1, Math.min(3.5, p.tubingOd)))
  const Rc = Math.min(Rf - 0.3, Math.max(0.9, p.coreDia / 2))
  const Rt = Rc + (Rf - 0.08 - Rc) * Math.max(0, Math.min(1, p.fill))

  // reel skid: base frame, A-frame stands with pillow-block bearings
  k.at([0, 0, 0], undefined, () => skid(k, RL, RW, 'HEB 300', 'structSteelDark'))
  const top = 0.308
  for (const s of [-1, 1]) {
    const z = s * (DW / 2 + 0.38)
    for (const sx of [-1, 1]) k.rod(C, [sx * 1.6, top, z], [sx * 0.12, yA - 0.2, z], 0.1, 12)
    k.box(C, [3.4, 0.25, 0.25], [0, top + 0.125, z])
    k.rbox(C, [0.5, 0.4, 0.3], 0.03, [0, yA - 0.1, z])
    k.cyl('nut', 0.14, 0.34, [0, yA, z], 'z', 24)
  }

  // reel (rotor about Z): core, flanges with spokes, tubing wraps, drive sprocket
  const rk = new Kit()
  rk.cyl(C, Rc, DW, [0, 0, 0], 'z', 64)
  const wraps = Math.max(8, Math.round(DW / od))
  const prof: [number, number][] = [[Rc, -DW / 2]]
  for (let i = 0; i < wraps; i++) {
    const z0 = -DW / 2 + (DW * i) / wraps
    prof.push([Rt - od * 0.15, z0], [Rt, z0 + DW / wraps / 2])
  }
  prof.push([Rt - od * 0.15, DW / 2], [Rc, DW / 2])
  rk.lathe(paint('#2a2c2f', { metalness: 0.6, roughness: 0.35 }), prof, [0, 0, 0], 'z', 72)
  for (const s of [-1, 1]) {
    const z = s * (DW / 2 + 0.03)
    rk.lathe(C, [[Rf - 0.08, z - 0.03], [Rf, z - 0.03], [Rf, z + 0.03], [Rf - 0.08, z + 0.03], [Rf - 0.08, z - 0.03]], [0, 0, 0], 'z', 72)
    rk.cyl(C, Rc + 0.05, 0.05, [0, 0, z], 'z', 64)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      rk.rod(C, [Math.cos(a) * (Rc - 0.1), Math.sin(a) * (Rc - 0.1), z], [Math.cos(a) * (Rf - 0.06), Math.sin(a) * (Rf - 0.06), z], 0.035, 8)
    }
    rk.cyl(C, 0.25, 0.1, [0, 0, z + s * 0.05], 'z', 24)
  }
  rk.cyl('stainless', 0.1, DW + 0.9, [0, 0, 0], 'z', 20)
  // drive sprocket on the +Z flange
  rk.lathe('nut', [[Rc + 0.05, DW / 2 + 0.07], [Rc + 0.14, DW / 2 + 0.07], [Rc + 0.14, DW / 2 + 0.11], [Rc + 0.05, DW / 2 + 0.11]], [0, 0, 0], 'z', 96)
  rotors.push({ built: rk.build(), axis: 'z', pos: [0, yA, 0], rpm: 6 })
  // chain guard and twin hydraulic drive motors with brake on the +Z side
  const zg = DW / 2 + 0.18
  k.lathe(C, [[Rc + 0.02, zg - 0.06], [Rc + 0.22, zg - 0.06], [Rc + 0.22, zg + 0.08], [Rc + 0.02, zg + 0.08]], [0, yA, 0], 'z', 64, Math.PI * 1.15, Math.PI * 0.7)
  for (const dx of [-0.35, 0.35]) {
    const mp: V3 = [dx, yA - Rc - 0.45, zg + 0.1]
    k.cyl(C, 0.12, 0.3, mp, 'z', 20)
    k.cyl('actuatorYellow', 0.14, 0.12, [mp[0], mp[1], mp[2] + 0.2], 'z', 20)
    k.box(C, [0.3, mp[1] - top, 0.2], [dx, (mp[1] + top) / 2 - 0.1, zg + 0.1])
  }
  // HP swivel and inlet piping on the -Z axle end
  const zi = -DW / 2 - 0.5
  k.cyl('stainless', 0.11, 0.2, [0, yA, zi + 0.05], 'z', 20)
  k.cyl('nut', 0.13, 0.04, [0, yA, zi + 0.12], 'z', 20)
  flange(k, 2, 2500, l.inlet, '-z', true)
  k.cyl('stainless', 0.045, 0.06, [0, yA, zi - 0.06], 'z', 14)
  k.rbox('valveBody', [0.12, 0.16, 0.12], 0.02, [0, yA - 0.2, zi])
  k.cyl('stainless', 0.03, 0.2, [0, yA - 0.1, zi], 'y', 10)
  gauge(k, [0.15, yA + 0.1, zi], 'x', 0.12, 'bar', 1000)
  k.rod('stainless', [0, yA + 0.1, zi], [0.15, yA + 0.1, zi], 0.01, 8)
  // level wind: twin guide tubes and diamond screw across the reel front, traversing carriage, depth counter
  const xl = Rf + 0.25
  const ylw = yA + Rt * 0.55
  for (const s of [-1, 1]) {
    k.rod(C, [xl - 0.25, top, s * (DW / 2 + 0.38)], [xl, ylw - 0.1, s * (DW / 2 + 0.38)], 0.07, 10)
    k.rod(C, [-0.4, yA - 0.15, s * (DW / 2 + 0.38)], [xl, ylw - 0.1, s * (DW / 2 + 0.38)], 0.06, 10)
  }
  k.rod('stainless', [xl, ylw, -DW / 2 - 0.4], [xl, ylw, DW / 2 + 0.4], 0.035, 12)
  k.rod('stainless', [xl, ylw + 0.22, -DW / 2 - 0.4], [xl, ylw + 0.22, DW / 2 + 0.4], 0.035, 12)
  k.rod('machined', [xl, ylw + 0.11, -DW / 2 - 0.4], [xl, ylw + 0.11, DW / 2 + 0.4], 0.05, 12)
  const zc = -DW / 2 + 0.1 + (DW - 0.2) * Math.max(0, Math.min(1, p.wind))
  k.rbox('actuatorYellow', [0.3, 0.4, 0.3], 0.03, [xl, ylw + 0.11, zc])
  for (const dy of [0.29, -0.07]) k.cyl('rubberBlack', 0.06, 0.18, [xl + 0.2, ylw + dy, zc], 'z', 16)
  k.rbox('stainless', [0.15, 0.12, 0.12], 0.02, [xl + 0.15, ylw + 0.44, zc])
  // tubing paying off the top of the reel through the carriage towards the injector (+X)
  const ty = yA + Rt
  k.tube('tubing', [[0.2, ty, zc], [xl - 0.1, ylw + 0.11 + od, zc], [xl + 0.8, ylw + 0.4, zc], [xl + 1.4, ylw + 0.8, zc]], od / 2, 10, 1.2)
  k.cyl('nut', od * 0.8, 0.08, [xl + 1.4, ylw + 0.8, zc], [0.8, 0.6, 0], 12)
  // crash frame / lifting frame over the reel
  const yf = yA + Rf + 0.15
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) k.box(C, [0.15, yf - top, 0.15], [sx * (RL / 2 - 0.1), (yf + top) / 2, sz * (RW / 2 - 0.1)])
  for (const sz of [-1, 1]) k.box(C, [RL, 0.15, 0.15], [0, yf, sz * (RW / 2 - 0.1)])
  for (const sx of [-1, 1]) k.box(C, [0.15, 0.15, RW], [sx * (RL / 2 - 0.1), yf, 0])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sx * (RL / 2 - 0.1), yf + 0.075, sz * (RW / 2 - 0.1)], 'x', 1.5, C)
  tagPlate(k, p.tag, [-RL / 2 + 0.8, 0.15, RW / 2 + 0.002], 'z', 0.3)

  if (p.spread) {
    // control cabin skid (-X), elevated cab with wraparound windows and access stair
    const xc = -RL / 2 - 0.4 - 1.6
    k.at([xc, 0, 0], undefined, () => {
      skid(k, 3.2, 2.6, 'HEB 200', 'structSteelDark')
      const yc0 = 1.0
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('structSteelDark', [0.15, yc0 - 0.21, 0.15], [sx * 1.4, (yc0 + 0.21) / 2, sz * 1.15])
      k.box('cladding', [3.0, 0.1, 2.4], [0, yc0 + 0.05, 0])
      for (const sz of [-1, 1]) k.box('cladding', [3.0, 0.9, 0.05], [0, yc0 + 0.55, sz * 1.175])
      k.box('cladding', [0.05, 2.5, 2.4], [-1.475, yc0 + 1.35, 0])
      k.box('cladding', [0.05, 0.9, 2.4], [1.475, yc0 + 0.55, 0])
      k.box('glass', [0.02, 1.2, 2.3], [1.48, yc0 + 1.6, 0])
      for (const sz of [-1, 1]) k.box('glass', [2.9, 1.2, 0.02], [0, yc0 + 1.6, sz * 1.18])
      k.box('cladding', [3.1, 0.4, 2.5], [0, yc0 + 2.4, 0])
      k.rbox('cladding', [0.8, 0.3, 0.9], 0.04, [-0.6, yc0 + 2.75, 0])
      k.box('plasticGrey', [0.6, 0.8, 1.8], [0.9, yc0 + 0.5, 0])
      k.box('rubberBlack', [0.05, 0.35, 0.6], [1.2, yc0 + 1.2, 0])
      ladder(k, [-1.2, 0.21, 1.3], yc0 + 0.1, [0, 0, 1], { cage: false })
      tagPlate(k, 'CT CONTROL CABIN', [0, yc0 + 0.6, 1.205], 'z', 0.4)
    })
    // hydraulic power pack (-X of the cabin): electric motor, pump stack, reservoir, fan cooler, hose reels
    const xp = xc - 1.6 - 0.4 - 1.5
    const m = motorSize(150, 4)
    k.at([xp, 0, 0], undefined, () => {
      const t2 = skid(k, 3.0, 2.4, 'HEB 200', 'structSteelDark')
      k.at([0.2, t2 + m.H, -0.5], undefined, () => motor(k, { R: m.R, L: m.L, H: m.H, tbox: 'top' }))
      for (let i = 0; i < 3; i++) k.cyl('castIron', 0.15 - i * 0.02, 0.22, [0.45 + i * 0.24, t2 + m.H, -0.5], 'x', 20)
      k.rbox(C, [1.4, 1.0, 0.9], 0.04, [0.2, t2 + 0.5, 0.65])
      k.cyl('glass', 0.025, 0.5, [0.2, t2 + 0.5, 1.105], 'y', 12)
      k.cyl('brass', 0.05, 0.08, [-0.2, t2 + 1.04, 0.65], 'y', 12)
      k.box('structSteelDark', [1.0, 1.3, 0.2], [-1.0, t2 + 0.9, 0])
      k.box('nut', [0.9, 1.1, 0.06], [-1.0, t2 + 0.95, 0.12])
      rotors.push(fanRotor('flangeSteel', 0.45, [xp - 1.0, t2 + 0.95, 0.2], 'z', 400, { blades: 6 }))
      k.cyl('nut', 0.47, 0.04, [-1.0, t2 + 0.95, 0.23], 'z', 32)
      for (const dz of [-0.9, 0.9]) {
        k.cyl(C, 0.35, 0.4, [1.1, t2 + 0.55, dz], 'z', 28)
        k.cyl('rubberBlack', 0.3, 0.38, [1.1, t2 + 0.55, dz], 'z', 28)
      }
      tagPlate(k, 'HPU', [0.2, t2 + 0.6, 1.106], 'z', 0.2)
    })
    // hydraulic hoses: power pack → reel drive motors, cabin control umbilical
    for (const dz of [-0.06, 0.06]) k.spline('rubberBlack', [[xp + 1.1, 0.6, 0.9 + dz], [xp + 2.5, 0.35, 1.4 + dz], [-RL / 2 + 0.3, 0.4, 1.6 + dz], [0, 0.45, 1.65 + dz], [0.35, yA - Rc - 0.45, zg + 0.32 + dz]], 0.025, 10, 80)
    k.spline('cable', [[xc + 1.0, 1.0, -1.2], [xc + 1.8, 0.4, -1.4], [-RL / 2 + 0.5, 0.4, -1.4]], 0.02, 8, 30)
  }
  return { built: k.build(), rotors }
}
