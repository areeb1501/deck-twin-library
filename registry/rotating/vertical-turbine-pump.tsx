// API 610 VS1 vertical turbine caisson pump: IEC vertical motor on a guarded stool, discharge head on a soleplate, column and bowls hanging in a caisson.
import { useEffect, useMemo } from 'react'
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { port, type Port } from '../lib/ports'
import { Rotors, type RotorSpec } from '../lib/rotors'
import { type Rating } from '../lib/standards'
import { TAU, annulus, clamp, meshTube, motorEnvelope, strut, verticalMotor } from './_pumps'
import { caisson, caissonLayout, dischargeHead, pumpColumn } from './_pumpsCaisson'

export interface VerticalTurbinePumpProps {
  /** motor rated power, kW */
  kw?: number
  dischargeNps?: number
  rating?: Rating
  /** caisson length below the deck, m */
  depth?: number
  /** caisson outside diameter, m */
  caissonDiameter?: number
  stages?: number
  /** remove a quadrant of the caisson to show the column and bowls */
  cutaway?: boolean
  /** discharge head paint */
  color?: string
  tag?: string
  running?: boolean
}

export const defaults = {
  kw: 400,
  dischargeNps: 12,
  rating: 150 as Rating,
  depth: 25,
  caissonDiameter: 0.9,
  stages: 3,
  cutaway: false,
  color: '#5f7487',
  running: true,
}

export function ports(props: VerticalTurbinePumpProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = caissonLayout(p)
  return [port('discharge', 'Discharge', [L.xFace, L.yOut, 0], [1, 0, 0], p.dischargeNps, p.rating)]
}

export function VerticalTurbinePump({ tag, ...rest }: VerticalTurbinePumpProps & GroupProps) {
  const { kw, dischargeNps, rating, depth, caissonDiameter, stages, cutaway, color, running, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(
    () => build({ kw, dischargeNps, rating, depth, caissonDiameter, stages, cutaway, color, tag }),
    [kw, dischargeNps, rating, depth, caissonDiameter, stages, cutaway, color, tag],
  )
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default VerticalTurbinePump

function build(p: Omit<typeof defaults, 'running'> & { tag?: string }) {
  const k = new Kit()
  const L = caissonLayout(p)
  const drv = paint(p.color, { metalness: 0.3, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4 })
  caisson(k, L, p.cutaway)
  pumpColumn(k, L)
  dischargeHead(k, L, drv, p.tag)

  const { rb, rs, yTop } = L
  const m = motorEnvelope(p.kw, 4)
  const Rm = clamp(m.R, 0.16, 0.9)
  const Hm = clamp(m.L, 0.5, 3)
  // motor stool: flanged ends, four legs, expanded-metal windows around the coupling
  const yS0 = yTop
  const hS = clamp(0.62 + Rm * 0.35, 0.68, 0.95)
  const yS1 = yS0 + hS
  const rS0 = Math.max(rb + 0.02, Rm * 0.7)
  const rS1 = Rm * 1.02
  annulus(k, drv, rS0 - 0.08, rS0 + 0.05, yS0 - 0.01, yS0 + 0.04, [0, 0, 0], 'y', 40)
  annulus(k, drv, rS1 - 0.1, rS1 + 0.06, yS1 - 0.045, yS1, [0, 0, 0], 'y', 40)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4
    const u: V3 = [Math.cos(a), 0, Math.sin(a)]
    strut(k, drv, [u[0] * (rS0 - 0.01), yS0 + 0.04, u[2] * (rS0 - 0.01)], [u[0] * (rS1 - 0.03), yS1 - 0.045, u[2] * (rS1 - 0.03)], Math.max(0.1, Rm * 0.28), 0.03, [-u[2], 0, u[0]])
  }
  meshTube(k, [0, yS0 + 0.04, 0], [0, yS1 - 0.045, 0], rS0 + 0.012, rS1 - 0.012)

  // adjustable rigid flanged coupling + shaft ends, turning as one rotor
  const yC = yS0 + Math.max(0.42, hS * 0.55)
  const r = new Kit()
  r.cyl('flangeSteel', rs, yC - yTop - 0.2, [0, (yTop + 0.2 - yC) / 2, 0], 'y', 14)
  r.cyl('flangeSteel', rs * 2.3, 0.1, [0, -0.07, 0], 'y', 20)
  r.cyl('flangeSteel', rs * 3.6, 0.035, [0, -0.02, 0], 'y', 24)
  r.cyl('nut', rs * 2.2, 0.03, [0, 0.005, 0], 'y', 16)
  r.cyl('flangeSteel', rs * 3.6, 0.035, [0, 0.03, 0], 'y', 24)
  r.cyl('flangeSteel', rs * 2.3, 0.1, [0, 0.1, 0], 'y', 20)
  r.boltCircle('nut', 'nut', 6, rs * 2.9, [0, -0.05, 0], 'y', 0.01, 0.11, [0.005, 0.1])
  r.cyl('flangeSteel', rs * 1.1, yS1 - yC - 0.1, [0, (yS1 - yC + 0.1) / 2, 0], 'y', 14)
  for (const y of [-0.07, 0.1]) r.box('nut', [rs * 0.5, 0.09, rs * 0.5], [rs * 2.3, y, 0])
  r.box('nut', [rs * 0.4, 0.25, rs * 0.4], [rs * 1.1, -0.3, 0])
  const rotors: RotorSpec[] = [{ built: r.build(), axis: 'y', pos: [0, yC, 0], rpm: 150 }]

  verticalMotor(k, { R: Rm, H: Hm, yF: yS1, plate: `IEC ${m.frame} ${p.kw} kW` })
  return { built: k.build(), rotors }
}
