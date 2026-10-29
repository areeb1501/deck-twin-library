// Subsea umbilical termination assembly (UTA): mudmat, frame, umbilical termination head with bend restrictor, MQC stab plate, wet-mate electrical plate, parked flying leads (API 17E / ISO 13628-5).
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { member, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { anode, grabBar, mudmat, rovBucket } from './_drill'

export interface UmbilicalTerminationAssemblyProps {
  /** umbilical outside diameter, m */
  umbilicalOd?: number
  /** hydraulic / chemical couplers on the MQC plate */
  couplers?: number
  /** wet-mate electrical connectors */
  electrical?: number
  tag?: string
}

export const defaults = { umbilicalOd: 0.16, couplers: 8, electrical: 2, tag: 'UTA-01' }

type P = typeof defaults

const Lm = 4.4
const Wm = 3.2

function layout(p: Omit<P, 'tag'>) {
  const ne = Math.max(1, Math.min(4, Math.round(p.electrical)))
  const yPlate = 1.05
  const xPlate = Lm / 2 - 0.55
  return {
    ne,
    yPlate,
    xPlate,
    umb: [-Lm / 2 - 1.6, p.umbilicalOd / 2, 0] as V3,
    park: [Lm / 2 - 0.45, 0.62, -Wm / 2 + 0.55] as V3,
    elec: Array.from({ length: ne }, (_, i) => [xPlate + 0.06, yPlate + 0.15 - (i % 2) * 0.22, Wm / 2 - 0.95 - Math.floor(i / 2) * 0.24] as V3),
  }
}

export function ports(props: UmbilicalTerminationAssemblyProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [
    port('umbilical', 'Umbilical (cut end)', l.umb, [-1, 0, 0], 6, undefined, 'utility'),
    port('hydraulic', 'Hydraulic flying lead (parked MQC head)', [l.park[0] + 0.02, l.park[1], l.park[2]], [1, 0, 0], 2, undefined, 'utility'),
    ...l.elec.map((e, i) => port(`electrical-${i + 1}`, `Wet-mate electrical ${i + 1}`, e, [1, 0, 0], 1, undefined, 'electrical')),
  ]
}

export function UmbilicalTerminationAssembly({ umbilicalOd = defaults.umbilicalOd, couplers = defaults.couplers, electrical = defaults.electrical, tag = defaults.tag, ...group }: UmbilicalTerminationAssemblyProps & GroupProps) {
  const data = useKit((k) => build(k, { umbilicalOd, couplers, electrical, tag }), [umbilicalOd, couplers, electrical, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default UmbilicalTerminationAssembly

/** MQC plate (fixed or flying half) facing +X at c: plate, guide pins, couplers on a circle, central latch screw. */
function mqc(k: Kit, c: V3, R: number, n: number, mat: MatKey, flying: boolean) {
  k.cyl(mat, R, 0.05, [c[0] - 0.025, c[1], c[2]], 'x', 40)
  k.around(n, R * 0.62, [c[0], c[1], c[2]], 'x', (q) => {
    k.cyl('stainless', 0.032, 0.06, [q[0] + (flying ? -0.06 : 0.01), q[1], q[2]], 'x', 14)
    k.cyl('brass', 0.022, 0.012, [q[0] + (flying ? -0.095 : 0.045), q[1], q[2]], 'x', 12)
  })
  for (const s of [-1, 1]) k.cyl('stainless', 0.025, 0.12, [c[0] + 0.04, c[1] + s * R * 0.85, c[2]], 'x', 12)
  k.cyl('nut', 0.05, 0.08, [c[0] + (flying ? -0.08 : 0.04), c[1], c[2]], 'x', 6)
}

function build(k: Kit, p: P) {
  const l = layout(p)
  const { yPlate, xPlate, umb, park, elec } = l
  const Y: MatKey = paint('#e3b512', { weather: 1 })
  const UMB: MatKey = paint('#2b2d30', { metalness: 0.1, roughness: 0.7 })
  const t = mudmat(k, Lm, Wm, { mat: Y, skirt: 0.25 })
  const ro = p.umbilicalOd / 2

  // frame: corner posts, top rails, mid bulkhead frame carrying the termination head
  const fx = Lm / 2 - 0.12
  const fz = Wm / 2 - 0.12
  const yTop = 1.65
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) member(k, [sx * fx, t, sz * fz], [sx * fx, yTop, sz * fz], 'SHS 150x150x8', Y)
  for (const sz of [-1, 1]) member(k, [-fx, yTop, sz * fz], [fx, yTop, sz * fz], 'SHS 150x150x8', Y)
  for (const sx of [-1, 1]) member(k, [sx * fx, yTop, -fz], [sx * fx, yTop, fz], 'SHS 150x150x8', Y)
  for (const sz of [-1, 1]) member(k, [-fx, t + 0.1, sz * fz], [-0.2, yTop - 0.1, sz * fz], 'CHS 88.9x6.3', Y)
  const xb = -0.55
  for (const sz of [-1, 1]) member(k, [xb, t, sz * 0.7], [xb, 1.35, sz * 0.7], 'HEA 200', Y)
  member(k, [xb, 1.35, -0.8], [xb, 1.35, 0.8], 'HEA 200', Y)
  k.box(Y, [0.04, 0.9, 1.3], [xb + 0.12, 0.85, 0])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.box(Y, [0.28, 0.2, 0.04], [sx * fx, yTop + 0.17, sz * fz])
      k.torus('nut', 0.05, 0.012, [sx * fx, yTop + 0.22, sz * fz], 'z', 6, 16)
    }

  // umbilical termination head: armour pot, split flange, bolted to the bulkhead plate
  const yH = 0.85
  const xh0 = xb - 0.1
  k.cyl(Y, 0.3, 0.06, [xh0 + 0.12 + 0.03, yH, 0], 'x', 40)
  k.around(12, 0.26, [xh0 + 0.12, yH, 0], 'x', (q) => k.hex('nut', 0.03, 0.02, [q[0] + 0.06, q[1], q[2]], 'x'))
  k.lathe(Y, [[ro * 1.6, xh0 - 0.85], [0.17, xh0 - 0.55], [0.22, xh0 - 0.25], [0.22, xh0 + 0.12]], [0, yH, 0], 'x', 36)
  k.cyl(Y, 0.24, 0.03, [xh0 - 0.25, yH, 0], 'x', 36)
  k.around(8, 0.21, [xh0 - 0.22, yH, 0], 'x', (q) => k.hex('nut', 0.025, 0.02, q, 'x'))
  k.box(Y, [0.6, yH - 0.22 - t, 0.06], [xh0 - 0.3, (yH - 0.22 + t) / 2, 0])
  // bend restrictor (vertebrae) dropping to the seabed, then the umbilical lying on the seabed to its cut end
  const c = new THREE.CubicBezierCurve3(new THREE.Vector3(xh0 - 0.85, yH, 0), new THREE.Vector3(xh0 - 1.6, yH, 0), new THREE.Vector3(-Lm / 2 - 0.2, ro + 0.02, 0), new THREE.Vector3(-Lm / 2 - 0.8, ro + 0.02, 0))
  const N = 22
  for (let i = 0; i < N; i++) {
    const a = c.getPointAt(i / N)
    const b = c.getPointAt((i + 0.85) / N)
    k.rod(UMB, a.toArray() as V3, b.toArray() as V3, ro * 1.55, 20)
    k.rod(UMB, b.toArray() as V3, c.getPointAt(Math.min(1, (i + 1) / N)).toArray() as V3, ro * 1.25, 20)
  }
  k.tube(UMB, [[-Lm / 2 - 0.8, ro + 0.001, 0], [umb[0], ro + 0.001, 0]], ro, 20)
  k.disc('copper', ro * 0.95, [umb[0] - 0.001, umb[1], 0], '-x', 20)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    k.disc('rubberBlack', ro * 0.18, [umb[0] - 0.002, umb[1] + Math.sin(a) * ro * 0.55, Math.cos(a) * ro * 0.55], '-x', 10)
  }

  // ROV panel at +X: fixed MQC stab plate (hydraulic / chemical), wet-mate electrical plate; tubing and cables from the bulkhead
  k.box(Y, [0.04, 1.0, 2.2], [xPlate - 0.02, 0.9 + 0.1, 0])
  for (const sz of [-1, 1]) member(k, [xPlate - 0.06, t, sz * 1.1], [xPlate - 0.06, 1.55, sz * 1.1], 'HEA 160', Y)
  const zq = -0.55
  const R = 0.24
  const nc = Math.max(4, Math.min(16, Math.round(p.couplers)))
  mqc(k, [xPlate, yPlate, zq], R, nc, 'stainless', false)
  // flying MQC half mated on the plate, ROV handle and bucket for the latch
  mqc(k, [xPlate + 0.2, yPlate, zq], R, nc, Y, true)
  k.rod(Y, [xPlate + 0.2, yPlate + R + 0.02, zq - 0.15], [xPlate + 0.35, yPlate + R + 0.18, zq - 0.15], 0.02, 8)
  k.rod(Y, [xPlate + 0.2, yPlate + R + 0.02, zq + 0.15], [xPlate + 0.35, yPlate + R + 0.18, zq + 0.15], 0.02, 8)
  k.rod(Y, [xPlate + 0.35, yPlate + R + 0.18, zq - 0.15], [xPlate + 0.35, yPlate + R + 0.18, zq + 0.15], 0.025, 8)
  rovBucket(k, [xPlate + 0.24, yPlate, zq], 'x', Y)
  // hydraulic flying lead: steel tube bundle in a sheath from the flying MQC down to the parking stand, cobra head parked
  const hose: V3[] = [[xPlate + 0.45, yPlate, zq], [xPlate + 0.7, yPlate - 0.2, zq], [xPlate + 0.55, 0.3, zq - 0.2], [park[0] - 0.35, 0.3, park[2] + 0.2], [park[0] - 0.25, park[1], park[2]]]
  k.spline(UMB, hose, 0.04, 12, 60)
  k.lathe(Y, [[0.04, -0.25], [0.11, -0.08], [0.11, 0], [0, 0]], [park[0], park[1], park[2]], 'x', 24)
  mqc(k, [park[0] + 0.02, park[1], park[2]], 0.16, nc, Y, true)
  for (const sz of [-1, 1]) member(k, [park[0] - 0.05, t, park[2] + sz * 0.2], [park[0] - 0.05, park[1] + 0.2, park[2] + sz * 0.2], 'SHS 100x100x6.3', Y)
  k.box(Y, [0.03, 0.42, 0.5], [park[0] - 0.05, park[1], park[2]])
  k.box('nut', [0.003, 0.08, 0.3], [park[0] - 0.034, park[1] + 0.25, park[2]])
  // electrical plate: receptacles with dust caps (free) and one mated jumper looping to a second parking slot
  for (const e of elec) {
    k.cyl('stainless', 0.06, 0.12, [e[0] - 0.06, e[1], e[2]], 'x', 20)
    k.cyl('actuatorRed', 0.065, 0.05, [e[0] - 0.025, e[1], e[2]], 'x', 20)
    k.rod('actuatorRed', [e[0] - 0.025, e[1] + 0.065, e[2]], [e[0] + 0.02, e[1] + 0.1, e[2]], 0.01, 6)
  }
  const em: V3 = [xPlate, yPlate - 0.15, 0.25]
  k.cyl('stainless', 0.06, 0.12, [em[0] + 0.04, em[1], em[2]], 'x', 20)
  k.cyl(Y, 0.075, 0.2, [em[0] + 0.2, em[1], em[2]], 'x', 20)
  k.rod(Y, [em[0] + 0.2, em[1] + 0.08, em[2]], [em[0] + 0.2, em[1] + 0.2, em[2]], 0.015, 8)
  k.spline('cable', [[em[0] + 0.3, em[1], em[2]], [em[0] + 0.6, em[1] - 0.2, em[2] + 0.1], [em[0] + 0.35, 0.25, em[2] + 0.55], [em[0] - 0.4, 0.2, Wm / 2 - 0.45], [em[0] - 0.8, 0.45, Wm / 2 - 0.45]], 0.025, 10, 60)
  k.box(Y, [0.03, 0.4, 0.4], [em[0] - 0.85, 0.45, Wm / 2 - 0.45])
  k.cyl(Y, 0.07, 0.18, [em[0] - 0.75, 0.45, Wm / 2 - 0.45], 'x', 20)
  for (const sz of [-1, 1]) member(k, [em[0] - 0.87, t, Wm / 2 - 0.45 + sz * 0.15], [em[0] - 0.87, 0.65, Wm / 2 - 0.45 + sz * 0.15], 'SHS 100x100x6.3', Y)
  // internal tubing and cables from the termination head through the bulkhead to the plates
  for (let i = 0; i < nc; i++) {
    const a = (i / nc) * Math.PI * 2
    const q: V3 = [xPlate - 0.04, yPlate + Math.sin(a) * R * 0.62, zq + Math.cos(a) * R * 0.62]
    const off = (i - nc / 2) * 0.03
    k.tube('tubing', [[xb + 0.14, yH + off * 0.5, off], [xb + 0.5, yH + off * 0.5, off], [xb + 0.9, q[1], zq + off], [q[0] - 0.2, q[1], q[2]], q], 0.008, 6, 0.08)
  }
  for (const e of [...elec, [em[0] + 0.04, em[1], em[2]] as V3]) k.spline('cable', [[xb + 0.14, yH - 0.1, 0.1], [xb + 0.6, yH - 0.1, 0.25], [e[0] - 0.5, e[1], e[2]], [e[0] - 0.12, e[1], e[2]]], 0.012, 8, 30)

  // grab bars, anodes, nameplate
  for (const sz of [-1, 1]) grabBar(k, [-1.2, yTop - 0.4, sz * fz], [1.0, yTop - 0.4, sz * fz], [0, 0, sz])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) anode(k, [sx * (fx - 0.3), t + 0.5, sz * (fz + 0.14)], 'y', 0.5)
  k.box(Y, [1.0, 0.36, 0.02], [0, yTop - 0.75, fz + 0.1])
  for (const s of [-1, 1]) k.box(Y, [0.06, 0.62, 0.02], [s * 0.4, yTop - 0.36, fz + 0.09])
  tagPlate(k, p.tag, [0, yTop - 0.75, fz + 0.112], 'z', 0.9)
}
