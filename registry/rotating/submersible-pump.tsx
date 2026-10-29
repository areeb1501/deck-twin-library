// Electric submersible caisson pump (seawater lift): pump-motor unit hung on a flanged riser stack with centralisers, top plate with discharge bend, junction box and air release.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { junctionBox, liftingLug, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { elbow90, flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { TAU, annulus, clamp, flangeLen, flangedBranch, pipeGauge, smallValve } from './_pumps'
import { caisson, caissonLayout } from './_pumpsCaisson'

export interface SubmersiblePumpProps {
  /** motor rated power, kW */
  kw?: number
  dischargeNps?: number
  rating?: Rating
  /** caisson length below the deck, m */
  depth?: number
  caissonDiameter?: number
  cutaway?: boolean
  color?: string
  tag?: string
}

export const defaults = {
  kw: 300,
  dischargeNps: 12,
  rating: 150 as Rating,
  depth: 25,
  caissonDiameter: 0.9,
  cutaway: false,
  color: '#5f7487',
}

type P = typeof defaults & { tag?: string }

function layout(p: P) {
  const C = caissonLayout({ caissonDiameter: p.caissonDiameter, depth: p.depth, dischargeNps: p.dischargeNps, rating: p.rating, stages: 1 })
  const R = C.R
  const dOD = pipeOD(p.dischargeNps)
  const yTp = 0.13 // top plate top
  const Re = elbow90(p.dischargeNps, 'LR')
  const yB = yTp + 0.25 + flangeDims(p.dischargeNps, p.rating).od / 2 // bend centre height
  const xFace = Re + 0.35 + flangeLen(p.dischargeNps, p.rating)
  // pump-motor unit sized from kW (typical): motor shell, pump below, suction strainer at the bottom
  const Ru = clamp(0.12 + 0.012 * Math.sqrt(p.kw), Math.max(dOD / 2 + 0.04, 0.15), R - 0.05)
  const Lm = clamp(1.2 + 0.0035 * p.kw, 1.4, 5)
  const Lp = clamp(0.5 + Ru * 1.8, 0.7, 1.8)
  const unit = Lm + Lp + 0.5
  const depth = Math.max(C.depth, unit + 2.5)
  return { C: { ...C, depth }, R, dOD, yTp, Re, yB, xFace, Ru, Lm, Lp, depth }
}

export function ports(props: SubmersiblePumpProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  return [port('discharge', 'Discharge', [L.xFace, L.yB, 0], [1, 0, 0], p.dischargeNps, p.rating)]
}

export function SubmersiblePump({ tag, ...rest }: SubmersiblePumpProps & GroupProps) {
  const { kw, dischargeNps, rating, depth, caissonDiameter, cutaway, color, ...group } = { ...defaults, ...rest }
  const built = useMemo(() => build({ kw, dischargeNps, rating, depth, caissonDiameter, cutaway, color, tag }), [kw, dischargeNps, rating, depth, caissonDiameter, cutaway, color, tag])
  useEffect(() => () => built.geometry.dispose(), [built])
  return (
    <group {...group}>
      <KitMesh data={built} />
    </group>
  )
}

export default SubmersiblePump

function build(p: P) {
  const k = new Kit()
  const L = layout(p)
  const { R, dOD, yTp, Re, yB, xFace, Ru, Lm, Lp, depth } = L
  const H: MatKey = paint(p.color, { metalness: 0.3, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4 })
  const STEEL: MatKey = 'internalsSteel'
  const nps = p.dischargeNps
  caisson(k, L.C, p.cutaway)

  // top plate on the caisson flange, studs, lifting lugs, riser hanger
  const flR = R + 0.11
  k.box('equipmentPaintDark', [2 * flR + 0.12, 0.03, 2 * flR + 0.12], [0, 0.065, 0])
  annulus(k, H, 0, flR - 0.01, 0.08, yTp, [0, 0, 0], 'y', 48)
  k.boltCircle('boltXylan', 'nut', Math.max(8, Math.round((TAU * (R + 0.06)) / 0.16)), R + 0.06, [0, 0, 0], 'y', 0.022, 0.17, [0.145])
  for (const s of [-1, 1]) liftingLug(k, [0, yTp, s * (flR - 0.12)], 'x', 1, H)

  // riser through the top plate, long-radius bend, spool and WN flange at the discharge port
  const yRT = yB - Re
  k.pipe(H, [0, 0.05, 0], [0, yRT, 0], dOD, pipeWall(nps, 'STD'), 32)
  k.cyl(H, dOD / 2 + 0.04, 0.06, [0, yTp + 0.03, 0], 'y', 32)
  k.bend(H, [0, yRT, 0], [0, 1, 0], [1, 0, 0], Re, dOD, Math.PI / 2, pipeWall(nps, 'STD'))
  flangedBranch(k, H, [Re - 0.002, yB, 0], [xFace, yB, 0], nps, p.rating, 'STD')
  // air release valve on the crown, gauge, hypochlorite injection quill
  const yTopP = yB + dOD / 2
  k.cyl(H, 0.03, 0.1, [Re + 0.08, yTopP + 0.03, 0], 'y', 12)
  smallValve(k, [Re + 0.08, yTopP + 0.1, 0], 0.9)
  k.rod('castIron', [Re + 0.08, yTopP + 0.1, 0], [Re + 0.08, yTopP + 0.1, -0.12], 0.02, 10)
  k.cyl('castIron', 0.06, 0.15, [Re + 0.08, yTopP + 0.12, -0.17], 'y', 18)
  k.dome('castIron', 0.06, [Re + 0.08, yTopP + 0.195, -0.17], 'y', Math.PI / 2, 0.6, 18)
  pipeGauge(k, [Re + 0.25, yTopP, 0], [0, 0, 1], 16)
  k.rod('stainless', [-dOD / 2 - 0.15, yTp + 0.2, 0], [-dOD / 2 + 0.005, yTp + 0.2, 0], 0.012, 8)
  smallValve(k, [-dOD / 2 - 0.12, yTp + 0.2, 0], 0.7, '-x')
  k.rod('stainless', [-dOD / 2 - 0.1, yTp + 0.2, 0], [-dOD / 2 - 0.1, yTp, 0], 0.01, 8)

  // power cable junction box and gland on the top plate (-Z side)
  const jz = -(R * 0.55)
  k.box('equipmentPaintDark', [0.05, 0.6, 0.05], [-0.25, yTp + 0.3, jz])
  junctionBox(k, [-0.25, yTp + 0.45, jz + 0.025], [0, 0, 1], [0.35, 0.3, 0.18])
  k.cyl('brass', 0.035, 0.08, [-0.25, yTp + 0.04, jz + 0.12], 'y', 12)
  k.spline('cable', [[-0.25, yTp + 0.27, jz + 0.12], [-0.25, yTp + 0.15, jz + 0.12], [-0.25, yTp + 0.06, jz + 0.12]], 0.022, 8, 12)
  if (p.tag) tagPlate(k, p.tag, [0, yTp - 0.02, flR - 0.009], 'z', 0.16)
  tagPlate(k, `${p.kw} kW SUBMERSIBLE`, [-0.25, yTp + 0.2, jz + 0.03], 'z', 0.18)

  // riser stack: 6 m flanged sections with centralisers, cable clamped alongside
  const yU = -depth + 0.6 + Lp + Lm + 0.25 // riser bottom = unit top
  const joints: number[] = []
  for (let y = -0.5; y > yU + 0.5; y -= 6) joints.push(y)
  k.pipe(H, [0, yU, 0], [0, 0.05, 0], dOD, pipeWall(nps, 'STD'), 32)
  const f = flangeDims(nps, p.rating)
  for (const y of joints) {
    annulus(k, 'flangeSteel', dOD / 2 - 0.002, f.od / 2, y - f.thickness, y + f.thickness, [0, 0, 0], 'y', 32)
    k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, [0, y - f.thickness - f.boltDia, 0], 'y', f.boltDia, f.thickness * 2 + f.boltDia * 2, [f.boltDia * 0.5, f.thickness * 2 + f.boltDia * 1.5])
    // centraliser: three bow arms to the caisson wall
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.3
      const u = [Math.cos(a), Math.sin(a)]
      k.box(STEEL, [0.012, 0.35, R - 0.02 - f.od / 2], [u[0] * (f.od / 2 + (R - 0.02 - f.od / 2) / 2), y - 0.3, u[1] * (f.od / 2 + (R - 0.02 - f.od / 2) / 2)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2))
    }
  }
  const zc = dOD / 2 + 0.04
  k.rod('cable', [0, yU + 0.1, -zc], [0, 0.05, -zc], 0.02, 8)
  for (let y = yU + 1.5; y < -0.2; y += 1.5) k.torus('stainless', zc, 0.006, [0, y, 0], 'y', 4, 24)

  // pump-motor unit: outer shell (water rises around the motor), motor inside, pump and strainer below
  const yUt = yU
  const yM0 = yUt - 0.25 - Lm
  k.lathe(H, [[dOD / 2, yUt + 0.01], [Ru * 0.8, yUt - 0.1], [Ru, yUt - 0.25], [Ru, yM0], [Ru * 0.9, yM0 - 0.08]], [0, 0, 0], 'y', 40)
  for (let i = 1; i < 4; i++) annulus(k, H, Ru, Ru + 0.012, yM0 + (Lm * i) / 4 - 0.01, yM0 + (Lm * i) / 4 + 0.01, [0, 0, 0], 'y', 40)
  k.boltCircle('boltXylan', 'nut', 12, Ru + 0.02, [0, yUt - 0.27, 0], 'y', 0.012, 0.06, [0.005, 0.055])
  const yP1 = yM0 - 0.08
  const yP0 = yP1 - Lp
  k.lathe(H, [[Ru * 0.9, yP1], [Ru * 0.95, yP1 - Lp * 0.2], [Ru * 0.95, yP0 + Lp * 0.3], [Ru * 0.75, yP0]], [0, 0, 0], 'y', 36)
  for (const y of [yP1 - Lp * 0.2, yP0 + Lp * 0.3]) annulus(k, H, Ru * 0.94, Ru * 1.02, y - 0.015, y + 0.015, [0, 0, 0], 'y', 36)
  k.disc('pipeBore', Ru * 0.75, [0, yP0 + 0.002, 0], '-y', 32)
  const yS1 = yP0
  const yS0 = Math.max(yS1 - 0.45, -depth + 0.15)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU
    k.rod(STEEL, [Math.cos(a) * Ru * 0.72, yS1, Math.sin(a) * Ru * 0.72], [Math.cos(a) * Ru * 0.72, yS0, Math.sin(a) * Ru * 0.72], 0.008, 5)
  }
  annulus(k, STEEL, 0, Ru * 0.75, yS0 - 0.01, yS0 + 0.01, [0, 0, 0], 'y', 32)
  annulus(k, STEEL, Ru * 0.68, Ru * 0.76, (yS0 + yS1) / 2 - 0.01, (yS0 + yS1) / 2 + 0.01, [0, 0, 0], 'y', 32)
  // unit centralisers
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU
    k.box(STEEL, [0.012, 0.3, R - 0.02 - Ru], [Math.cos(a) * (Ru + (R - 0.02 - Ru) / 2), yM0 + Lm * 0.5, Math.sin(a) * (Ru + (R - 0.02 - Ru) / 2)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2))
  }
  return k.build()
}
