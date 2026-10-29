// Outdoor three-pole disconnector, centre-break or pantograph, with earthing switch and motor operating mechanism. IEC 62271-102, IEC 62271-1.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { alu, cabinet, gradingRing, hv, pad, tubeColumn } from './_hv'
import { clamp, insulator, porcelain, silicone } from './_onshore'

export interface DisconnectorProps {
  /** rated voltage, kV */
  kv?: number
  style?: 'centre-break' | 'pantograph'
  /** main contacts, 0 closed … 1 fully open */
  open?: number
  /** earthing switch closed (only with the main contacts open) */
  earthed?: boolean
  insulation?: 'porcelain' | 'composite'
  tag?: string
}

export const defaults = { kv: 145, style: 'centre-break' as 'centre-break' | 'pantograph', open: 0, earthed: false, insulation: 'porcelain' as 'porcelain' | 'composite', tag: '' }

export function Disconnector(props: DisconnectorProps & GroupProps) {
  const { kv, style, open, earthed, insulation, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { kv, style, open, earthed, insulation, tag }), [kv, style, open, earthed, insulation, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Disconnector

function build(k: Kit, p: typeof defaults) {
  const d = hv(p.kv)
  const ins: MatKey = p.insulation === 'composite' ? silicone() : porcelain()
  const P = d.phase
  const S = p.style === 'pantograph' ? 1.2 : 1.0 + 0.0085 * d.kv
  const op = clamp(p.open, 0, 1)
  const earthed = p.earthed && op > 0.95
  const yb = d.sup
  const XC = P + 0.5
  // four columns and two cross beams carrying the phase frames
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tubeColumn(k, sx * XC, sz * (S / 2), yb, 0.219, sz < 0)
  for (const sz of [-1, 1]) k.box('galvanised', [2 * XC + 0.3, 0.22, 0.2], [0, yb + 0.11, sz * (S / 2)])
  const yf = yb + 0.22
  // motor operating mechanism on the front-left column, vertical drive shaft, interphase coupling rods
  const mx = -XC
  const mz = S / 2 + 0.22
  k.rbox(cabinet(), [0.55, 0.75, 0.32], 0.02, [mx, 1.35, mz])
  k.box(cabinet(), [0.5, 0.7, 0.01], [mx, 1.35, mz + 0.165])
  k.box('stainless', [0.02, 0.12, 0.03], [mx + 0.2, 1.35, mz + 0.18])
  k.cyl(paint('#2a2d30'), 0.03, 0.06, [mx - 0.15, 1.6, mz + 0.18], 'z', 12)
  k.rod('galvanised', [mx, 1.73, mz], [mx, yf + 0.05, mz], 0.022, 10)
  k.box('galvanised', [0.08, 0.06, 0.25], [mx, yf + 0.05, (mz + S / 2) / 2])
  k.rod('galvanised', [mx, yf + 0.1, S / 2], [P, yf + 0.1, S / 2 + 0.15], 0.016, 8)
  k.tube('cable', [[mx, 0.98, mz], [mx, 0.4, mz + 0.05], [mx + 0.3, 0.02, mz + 0.4]], 0.016)
  if (p.tag) tagPlate(k, p.tag, [mx, 1.55, mz + 0.171], 'z', 0.18)
  // earthing switch operating shaft along the rear frame with its manual mechanism
  k.rod('galvanised', [-XC, yf + 0.06, -S / 2 - 0.2], [XC - 0.2, yf + 0.06, -S / 2 - 0.2], 0.025, 10)
  k.rbox(cabinet(), [0.35, 0.45, 0.25], 0.02, [-XC, 1.2, -S / 2 - 0.25])
  k.rod('galvanised', [-XC, 1.42, -S / 2 - 0.25], [-XC, yf + 0.06, -S / 2 - 0.25], 0.018, 8)
  for (let i = -1; i <= 1; i++) {
    const x = i * P
    k.box('galvanised', [0.16, 0.12, S + 0.5], [x, yf + 0.06, 0])
    if (p.style === 'centre-break') centreBreak(k, x, yf + 0.12, S, d, ins, op)
    else pantograph(k, x, yf + 0.12, S, d, ins, op)
    // earthing blade hinged on the -Z end, swings up to the terminal
    const hz = -S / 2 - 0.2
    const L = d.ins + 0.35
    const a = earthed ? Math.PI / 2 - 0.08 : 0.04
    const tip: V3 = [x + 0.12, yf + 0.06 + Math.sin(a) * L, hz - Math.cos(a) * L * (earthed ? -0.05 : 1)]
    k.box('galvanised', [0.1, 0.14, 0.1], [x + 0.12, yf + 0.06, hz])
    k.rod(alu(), [x + 0.12, yf + 0.06, hz], tip, 0.022, 10)
    k.sphere(alu(), 0.035, tip, undefined, 10)
    k.box(alu(), [0.06, 0.1, 0.12], [x + 0.12, yf + 0.12 + d.ins + 0.2, -S / 2 - 0.1])
  }
}

function head(k: Kit, x: number, y: number, z: number) {
  k.cyl(alu(), 0.13, 0.16, [x, y + 0.08, z], 'y', 24)
}

function centreBreak(k: Kit, x: number, y: number, S: number, d: ReturnType<typeof hv>, ins: MatKey, op: number) {
  const th = (op * Math.PI) / 2
  for (const s of [-1, 1]) {
    const z = (s * S) / 2
    // rotating base bearing, insulator, head with the terminal pad facing out
    k.cyl('galvanised', 0.16, 0.08, [x, y + 0.04, z], 'y', 24)
    k.rod('galvanised', [x, y + 0.03, z], [x + 0.25, y + 0.03, z + s * 0.05], 0.015, 6)
    insulator(k, [x, y + 0.08, z], d.ins, d.r, ins)
    const yt = y + 0.08 + d.ins
    head(k, x, yt, z)
    pad(k, [x, yt + 0.08, z + s * 0.13], [0, 0, s], 1.1)
    // contact arm rotates about the insulator axis; both arms open to the same side
    const len = S / 2 - 0.04
    const dir = new THREE.Vector3(-s * Math.sin(-s * th), 0, -s * Math.cos(-s * th))
    const a = new THREE.Vector3(x, yt + 0.12, z)
    const b = a.clone().addScaledVector(dir, len)
    k.rod(alu(), a.toArray() as V3, b.toArray() as V3, 0.04, 14)
    if (s < 0) {
      k.cyl(alu(), 0.05, 0.16, b.clone().addScaledVector(dir, -0.04).toArray() as V3, dir.toArray() as V3, 14)
      k.sphere(alu(), 0.05, b.toArray() as V3, undefined, 12)
    } else {
      for (const o of [-0.04, 0.04]) k.box(alu(), [0.015, 0.1, 0.12], b.clone().add(new THREE.Vector3(o, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -s * th)).toArray() as V3, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -s * th))
    }
    if (d.ring) gradingRing(k, [x, yt - 0.1, z], d.r * 3, 'y', 0.03)
  }
}

function pantograph(k: Kit, x: number, y: number, S: number, d: ReturnType<typeof hv>, ins: MatKey, op: number) {
  // fixed support insulator carrying the pantograph, rotating operating insulator beside it
  insulator(k, [x, y, -S * 0.15], d.ins, d.r * 1.2, ins)
  insulator(k, [x, y, S * 0.35], d.ins, d.r * 0.8, ins)
  const yt = y + d.ins
  k.rbox(alu(), [0.3, 0.25, S * 0.7], 0.04, [x, yt + 0.12, S * 0.1])
  pad(k, [x, yt + 0.12, -S * 0.25], [0, 0, -1], 1.1)
  // scissor arms: closed reach ≈ 0.9 × insulator height above the head, folded when open
  const reach = 0.25 + (1 - op) * d.ins * 0.9
  const w = Math.sqrt(Math.max(0.01, (d.ins * 0.5) ** 2 - (reach / 4) ** 2))
  const y0 = yt + 0.25
  const pts = (side: number): V3[] => [[x, y0, 0], [x, y0 + reach / 4, side * w], [x, y0 + reach / 2, 0], [x, y0 + (3 * reach) / 4, side * w], [x, y0 + reach, 0]]
  for (const side of [-1, 1]) {
    const q = pts(side)
    for (let i = 0; i < q.length - 1; i++) k.rod(alu(), q[i], q[i + 1], 0.025, 10)
    for (const c of q) k.sphere(alu(), 0.04, c, undefined, 10)
  }
  k.box(alu(), [0.08, 0.06, 0.5], [x, y0 + reach + 0.03, 0])
  for (const s of [-1, 1]) k.box(alu(), [0.06, 0.18, 0.04], [x, y0 + reach + 0.12, s * 0.22])
  if (d.ring) gradingRing(k, [x, yt - 0.1, -S * 0.15], d.r * 3.2, 'y', 0.03)
}
