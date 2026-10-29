// IEC TEFC foot-mounted induction motor (IM B3, IC411) sized from kW and poles per IEC 60072, on machined soleplates with anchor bolts.
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { motor, tagPlate } from '../lib/parts'
import { Rotors, cowlFan, type RotorSpec } from '../lib/rotors'
import { anchorBolt, clamp, motorEnvelope, topCooler } from './_pumps'

export interface ElectricMotorProps {
  /** rated power, kW */
  kw?: number
  poles?: 2 | 4 | 6
  /** anti-condensation heater terminal box */
  heater?: boolean
  /** terminal box on the side (+Z) or on top */
  terminalBox?: 'side' | 'top'
  color?: string
  tag?: string
  running?: boolean
}

export const defaults = {
  kw: 75,
  poles: 4 as 2 | 4 | 6,
  heater: true,
  terminalBox: 'side' as 'side' | 'top',
  color: '#355f80',
  running: true,
}

const SOLE = 0.04 // soleplate + grout height

function layout(kw: number, poles: 2 | 4 | 6) {
  const m = motorEnvelope(clamp(kw, 0.37, 20000), poles)
  const cowl = Math.max(0.12, m.R * 0.6)
  const stub = 0.12 + m.R * 0.2
  // centre the footprint (frame + cowl + shaft end) on x = 0
  const xm = (m.L + cowl - stub) / 2
  return { ...m, cowl, stub, xm, ys: SOLE + m.H }
}

export function ElectricMotor({ tag, ...rest }: ElectricMotorProps & GroupProps) {
  const { kw, poles, heater, terminalBox, color, running, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(() => build({ kw, poles, heater, terminalBox, color, tag }), [kw, poles, heater, terminalBox, color, tag])
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default ElectricMotor

function build(p: Omit<typeof defaults, 'running'> & { tag?: string }) {
  const k = new Kit()
  const L = layout(p.kw, p.poles)
  const { R, xm, ys } = L
  const mat: MatKey = p.color === defaults.color ? 'motorPaint' : paint(p.color, { metalness: 0.35, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.35, weather: 0.5 })
  k.at([xm, ys, 0], undefined, () => motor(k, { R, L: L.L, H: ys - SOLE, tbox: p.terminalBox, mat, cable: false }))
  if (p.kw > 1000) topCooler(k, xm, ys, R, L.L, mat)

  // nameplate with the IEC frame
  const pole = `${p.poles}P`
  tagPlate(k, `${L.frame === 'HV' ? 'HV' : 'IEC ' + L.frame} ${p.kw} kW ${pole}`, [xm - L.L * 0.62, ys + R * 0.62, R * 0.82], [0, 0.5, 0.87], Math.max(0.1, R * 0.5))

  // anti-condensation heater box on the -Z side with its gland
  if (p.heater) {
    const hb = Math.max(0.1, R * 0.4)
    const fin = Math.max(0.012, R * 0.12)
    const c: [number, number, number] = [xm - L.L * 0.4, ys + R * 0.1, -(R + fin + hb * 0.22)]
    k.box(mat, [hb * 0.4, hb * 0.4, fin + 0.02], [c[0], c[1], -(R + fin * 0.5)])
    k.rbox(mat, [hb, hb * 0.8, hb * 0.45], hb * 0.06, c)
    k.cyl('brass', hb * 0.08, hb * 0.14, [c[0], c[1] - hb * 0.45, c[2]], 'y', 10)
    k.box('nameplate', [hb * 0.6, hb * 0.25, 0.002], [c[0], c[1] + hb * 0.15, c[2] - hb * 0.226])
  }

  // regreasing nipples on both end shields from frame 225 (IEC 60072 shaft height), condensate drain plugs underneath
  const shL = Math.max(0.04, R * 0.22)
  for (const x of [xm - shL * 0.55, xm - L.L + shL * 0.55]) {
    if (L.H >= 0.225) {
      k.cyl('brass', 0.007, 0.03, [x, ys + R * 0.86, R * 0.25], 'y', 8)
      k.sphere('brass', 0.01, [x, ys + R * 0.86 + 0.018, R * 0.25], undefined, 8)
    }
    k.hex('rubberBlack', 0.022, 0.012, [x, ys - R * 0.88, R * 0.2])
  }

  // turning shaft extension with key
  const sr = Math.max(0.02, R * 0.13)
  const r = new Kit()
  r.cyl('stainless', sr * 1.01, L.stub * 0.9, [L.stub * 0.45, 0, 0], 'x', 20)
  r.box('nut', [L.stub * 0.55, sr * 0.35, sr * 0.5], [L.stub * 0.55, sr * 0.95, 0])
  const rotors: RotorSpec[] = [{ built: r.build(), axis: 'x', pos: [xm, ys, 0], rpm: 160 }, cowlFan(R, L.L, 160, [xm, ys, 0])]

  // machined soleplates under each foot pair, anchor bolts
  const fw = Math.max(0.06, R * 0.35)
  for (const fx of [xm - L.L * 0.82, xm - L.L * 0.18]) {
    k.box('flangeSteel', [fw * 2.4, SOLE, R * 1.56 + fw * 1.8], [fx, SOLE / 2, 0])
    for (const s of [-1, 1]) for (const dx of [-fw * 0.9, fw * 0.9]) anchorBolt(k, [fx + dx, SOLE, s * (R * 0.78 + fw * 0.75)], Math.max(0.012, fw * 0.25))
  }
  // earth boss on a foot
  k.cyl('brass', 0.012, 0.025, [xm - L.L * 0.82, SOLE + 0.03, R * 0.78 + fw * 0.7], 'z', 8)
  if (p.tag) tagPlate(k, p.tag, [xm - L.L * 0.3, ys - R * 0.55, R * 0.86], [0, -0.3, 0.95], Math.max(0.08, R * 0.4))
  return { built: k.build(), rotors }
}
