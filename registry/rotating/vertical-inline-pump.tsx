// API 610 OH3 vertical inline pump: horizontal volute casing with in-line suction and discharge, bearing bracket, guarded coupling and a vertical IEC motor on top.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, type RotorSpec } from '../lib/rotors'
import { flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { TAU, anchorBolt, annulus, castExtrude, clamp, flangeLen, flangedBranch, meshTube, motorEnvelope, pipeGauge, smallValve, strut, verticalMotor, voluteShape } from './_pumps'

export interface VerticalInlinePumpProps {
  suctionNps?: number
  dischargeNps?: number
  rating?: Rating
  /** motor rated power, kW */
  kw?: number
  casing?: MatKey
  tag?: string
  running?: boolean
}

export const defaults = {
  suctionNps: 4,
  dischargeNps: 4,
  rating: 300 as Rating,
  kw: 55,
  casing: 'machineryGreen' as MatKey,
  running: true,
}

type P = Omit<typeof defaults, 'running'> & { tag?: string }

function layout(p: P) {
  const dOD = pipeOD(p.dischargeNps)
  const r0 = 0.1 + 0.02 * p.dischargeNps
  const r1 = r0 + dOD * 0.85
  const wv = Math.max(dOD, pipeOD(p.suctionNps)) * 1.25
  const zs = -(r0 + r1) / 2 // shaft axis z, so the volute outlet lands on z = 0
  const fOD = Math.max(flangeDims(p.suctionNps, p.rating).od, flangeDims(p.dischargeNps, p.rating).od)
  const yN = Math.max(0.42, fOD / 2 + 0.2)
  const reach = r1 * 0.85 + 0.08
  const xS = -(reach + flangeLen(p.suctionNps, p.rating))
  const xD = reach + flangeLen(p.dischargeNps, p.rating)
  return { dOD, r0, r1, wv, zs, yN, xS, xD }
}

export function ports(props: VerticalInlinePumpProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  return [
    port('suction', 'Suction', [L.xS, L.yN, 0], [-1, 0, 0], p.suctionNps, p.rating),
    port('discharge', 'Discharge', [L.xD, L.yN, 0], [1, 0, 0], p.dischargeNps, p.rating),
  ]
}

export function VerticalInlinePump({ tag, ...rest }: VerticalInlinePumpProps & GroupProps) {
  const { suctionNps, dischargeNps, rating, kw, casing, running, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(() => build({ suctionNps, dischargeNps, rating, kw, casing, tag }), [suctionNps, dischargeNps, rating, kw, casing, tag])
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default VerticalInlinePump

function build(p: P) {
  const k = new Kit()
  const C = p.casing
  const { r0, r1, wv, zs, yN, xS, xD } = layout(p)
  const m = motorEnvelope(p.kw, 2)
  const Rm = clamp(m.R, 0.08, 0.6)
  const Hm = clamp(m.L, 0.25, 2)
  const rs = Math.max(0.02, m.shaftDia * 0.55)

  // volute scroll in the XZ plane around the shaft (x = 0, z = zs), outlet heading +X on z = 0
  const vm = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)).setPosition(0, yN, zs)
  castExtrude(k, C, voluteShape(r0, r1, r1 * 0.5), wv, Math.min(0.03, wv * 0.15), vm, 16)
  flangedBranch(k, C, [r1 * 0.4, yN, 0], [xD, yN, 0], p.dischargeNps, p.rating, '80')
  // suction passage: neck from the flange into a bowl under the impeller eye
  const sOD = pipeOD(p.suctionNps)
  flangedBranch(k, C, [-r1 * 0.3, yN, 0], [xS, yN, 0], p.suctionNps, p.rating, '80')
  k.lathe(C, [[0, yN - wv / 2 - sOD * 0.5], [r0 * 0.8, yN - wv / 2 - sOD * 0.45], [r0 * 1.05, yN - wv * 0.3], [r0 * 1.05, yN], [0, yN]], [0, 0, zs], 'y', 36)
  k.rod(C, [-r1 * 0.5, yN, 0], [0, yN, zs * 0.6], sOD * 0.55, 24)
  // casing foot on a soleplate with anchor bolts
  const yFoot = yN - wv / 2 - sOD * 0.5
  const fr = Math.max(0.12, r0 * 0.8)
  k.lathe(C, [[fr * 0.7, 0.04], [fr, 0.06], [r0 * 0.6, yFoot + 0.01], [0, yFoot + 0.01]], [0, 0, zs], 'y', 32)
  annulus(k, C, 0, fr * 1.15, 0.04, 0.07, [0, 0, zs], 'y', 32)
  const sp = Math.max(0.5, fr * 2.6)
  k.box('equipmentPaintDark', [sp, 0.04, sp], [0, 0.02, zs])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) anchorBolt(k, [sx * (sp / 2 - 0.05), 0.04, zs + sz * (sp / 2 - 0.05)], 0.018)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4
    k.hex('nut', 0.034, 0.02, [Math.cos(a) * fr * 1.0, 0.08, zs + Math.sin(a) * fr * 1.0])
  }
  // casing drain valve + plug, vent valve on the cover, gauges on both nozzles
  k.rod(C, [0, yFoot + 0.05, zs + r0 * 0.6], [0, yFoot + 0.05, zs + r0 * 0.6 + 0.12], 0.014, 8)
  smallValve(k, [0, yFoot + 0.05, zs + r0 * 0.6 + 0.15], 0.7, 'z')
  k.hex('nut', 0.03, 0.02, [0, yFoot + 0.05, zs + r0 * 0.6 + 0.24], 'z')
  pipeGauge(k, [xS * 0.55, yN + sOD / 2, 0], [0, 0, 1], 25)
  pipeGauge(k, [xD * 0.55, yN + pipeOD(p.dischargeNps) / 2, 0], [0, 0, 1], 60)

  // casing cover with stud ring, seal chamber + gland with Plan 11 flush line
  const yC0 = yN + wv / 2
  const Rcov = r0 * 0.95
  annulus(k, C, 0, Rcov, yC0 - 0.01, yC0 + 0.04, [0, 0, zs], 'y', 40)
  k.boltCircle('boltXylan', 'nut', 10, Rcov - 0.022, [0, yC0 - 0.02, zs], 'y', 0.014, 0.08, [0.07])
  k.cyl(C, 0.012, 0.05, [-Rcov * 0.75, yC0 + 0.065, zs], 'y', 8)
  smallValve(k, [-Rcov * 0.75, yC0 + 0.1, zs], 0.6)
  const sealR = Math.max(0.07, r0 * 0.45)
  const yS0 = yC0 + 0.04
  k.cyl(C, sealR, 0.12, [0, yS0 + 0.06, zs], 'y', 28)
  k.cyl('stainless', sealR * 1.1, 0.03, [0, yS0 + 0.135, zs], 'y', 24)
  k.boltCircle('boltXylan', 'nut', 4, sealR * 0.92, [0, yS0 + 0.1, zs], 'y', 0.012, 0.07, [0.06], Math.PI / 4)
  k.tube('tubing', [[xD * 0.45, yN + pipeOD(p.dischargeNps) / 2, 0], [xD * 0.45, yS0 + 0.135, 0], [sealR * 1.1, yS0 + 0.135, zs * 0.5], [sealR * 0.8, yS0 + 0.135, zs]], 0.007)
  // bearing bracket: lantern with windows, bearing housing, oiler
  const yB0 = yS0 + 0.15
  const hBr = clamp(0.22 + Rm * 0.3, 0.25, 0.45)
  const bhR = Math.max(0.08, Rm * 0.45, sealR * 1.1)
  const rL = Math.max(bhR * 1.15, r0 * 0.7)
  annulus(k, C, rs * 1.2, rL * 1.1, yB0, yB0 + 0.03, [0, 0, zs], 'y', 32)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 2
    const u = [Math.cos(a), Math.sin(a)]
    strut(k, C, [u[0] * rL, yB0 + 0.03, zs + u[1] * rL], [u[0] * bhR, yB0 + hBr * 0.5, zs + u[1] * bhR], 0.07, 0.025, [-u[1], 0, u[0]])
  }
  k.lathe(C, [[bhR * 0.8, yB0 + hBr * 0.45], [bhR, yB0 + hBr * 0.5], [bhR, yB0 + hBr], [bhR * 1.2, yB0 + hBr], [bhR * 1.2, yB0 + hBr + 0.04]], [0, 0, zs], 'y', 32)
  for (let i = 0; i < 4; i++) annulus(k, C, bhR, bhR * 1.1, yB0 + hBr * (0.6 + i * 0.1), yB0 + hBr * (0.6 + i * 0.1) + 0.008, [0, 0, zs], 'y', 32)
  // grease-lubricated bearings: nipples top and bottom, relief plugs; RTD head
  for (const yy of [yB0 + hBr * 0.62, yB0 + hBr * 0.92]) {
    k.cyl('brass', 0.007, 0.03, [0, yy, zs + bhR * 1.1 + 0.015], 'z', 8)
    k.sphere('brass', 0.01, [0, yy, zs + bhR * 1.1 + 0.032], undefined, 8)
  }
  k.hex('nut', 0.02, 0.012, [bhR * 1.1 + 0.004, yB0 + hBr * 0.62, zs], 'x')
  k.cyl('stainless', 0.007, 0.05, [-bhR * 1.1 - 0.02, yB0 + hBr * 0.8, zs], 'x', 8)
  k.cyl('stainless', 0.018, 0.03, [-bhR * 1.1 - 0.055, yB0 + hBr * 0.8, zs], 'x', 12)
  // motor adapter (stool) with mesh windows around the coupling
  const yA0 = yB0 + hBr + 0.04
  const hA = clamp(0.24 + Rm * 0.35, 0.28, 0.6)
  const yA1 = yA0 + hA
  const rA0 = bhR * 1.2
  const rA1 = Math.max(Rm * 0.9, rA0)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4
    const u = [Math.cos(a), Math.sin(a)]
    strut(k, C, [u[0] * (rA0 - 0.01), yA0, zs + u[1] * (rA0 - 0.01)], [u[0] * (rA1 - 0.02), yA1 - 0.03, zs + u[1] * (rA1 - 0.02)], Math.max(0.06, Rm * 0.25), 0.02, [-u[1], 0, u[0]])
  }
  annulus(k, C, rA1 - 0.06, rA1 + 0.04, yA1 - 0.035, yA1, [0, 0, zs], 'y', 40)
  k.at([0, 0, zs], undefined, () => meshTube(k, [0, yA0, 0], [0, yA1 - 0.035, 0], rA0 + 0.008, rA1 - 0.006))
  // spacer coupling + shaft ends
  const yCp = (yA0 + yA1) / 2
  const r = new Kit()
  r.cyl('flangeSteel', rs, hA + 0.08, [0, 0, 0], 'y', 12)
  for (const s of [-1, 1]) {
    r.cyl('flangeSteel', rs * 2.4, hA * 0.22, [0, s * hA * 0.3, 0], 'y', 20)
    r.cyl('nut', rs * 2.9, 0.012, [0, s * hA * 0.17, 0], 'y', 20)
    r.box('nut', [rs * 0.5, hA * 0.2, rs * 0.5], [rs * 2.4, s * hA * 0.3, 0])
  }
  const rotors: RotorSpec[] = [{ built: r.build(), axis: 'y', pos: [0, yCp, zs], rpm: 160 }]

  k.at([0, 0, zs], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), () => verticalMotor(k, { R: Rm, H: Hm, yF: yA1, plate: `IEC ${m.frame} ${p.kw} kW 2P`, deck: 0.04 }))
  if (p.tag) tagPlate(k, p.tag, [0, yN + wv * 0.15, zs + r1 + 0.003], 'z', 0.14)
  return { built: k.build(), rotors }
}
