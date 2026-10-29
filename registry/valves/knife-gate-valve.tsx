// Knife gate valve: one-piece lug body with tapped bolt holes, bevelled gate plate, packing gland, two-post yoke, rising stem, handwheel. MSS SP-81.
import * as THREE from 'three'
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { flange, inch, nearest, pipeOD, pipeWall, tableKeys, type Rating } from '../lib/standards'
import { bore, clamp, plateText, useKit2 } from './_body'

export interface KnifeGateValveProps {
  /** nominal pipe size, inches */
  nps?: number
  /** flange drilling class (knife gates are Class 150 bodies) */
  rating?: Rating
  /** gate travel, 0 closed … 1 open */
  open?: number
  body?: MatKey
  tag?: string
}

export const defaults = { nps: 8, rating: 150 as Rating, open: 1, body: 'valveBody' as MatKey, tag: '' }

// typical: MSS SP-81 face-to-face, NPS -> mm
const SP81: Record<number, number> = { 2: 48, 3: 51, 4: 51, 6: 57, 8: 70, 10: 70, 12: 76, 14: 76, 16: 89, 18: 89, 20: 114, 24: 114, 30: 127, 36: 152 }
export const knifeGateLength = (nps: number) => SP81[nearest(tableKeys(SP81), nps)] / 1000
const stroke = (nps: number) => (pipeOD(nps) / 2 - pipeWall(nps, 'STD')) * 2 + inch(0.5)

export function ports(p: KnifeGateValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = knifeGateLength(nps)
  return [port('A', 'End A', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'End B', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function KnifeGateValve(props: KnifeGateValveProps & GroupProps) {
  const { nps, rating, open, body, tag, ...group } = { ...defaults, ...props }
  const [fixed, moving] = useKit2((k, mv) => build(k, mv, nps, rating, body, tag), [nps, rating, body, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} position-y={-(1 - clamp(open, 0, 1)) * stroke(nps)} />
    </group>
  )
}

export default KnifeGateValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, M: MatKey, tag: string) {
  const L = knifeGateLength(nps)
  const f = flange(nps, rating)
  const D = pipeOD(nps)
  const ri = D / 2 - pipeWall(nps, 'STD')
  const R = f.od / 2
  const T = stroke(nps)
  const yC = R + D * 0.35
  // lug body seen along the bore: round bottom, straight chest up to the gland; bore and tapped holes go through
  const sh = new THREE.Shape()
  sh.moveTo(R, 0)
  sh.lineTo(R * 0.8, yC)
  sh.lineTo(-R * 0.8, yC)
  sh.lineTo(-R, 0)
  sh.absarc(0, 0, R, Math.PI, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, ri, 0, Math.PI * 2, true)
  sh.holes.push(hole)
  for (let i = 0; i < f.bolts; i++) {
    const a = Math.PI / f.bolts + (i / f.bolts) * Math.PI * 2
    const h = new THREE.Path()
    h.absarc(Math.cos(a) * f.boltCircle / 2, Math.sin(a) * f.boltCircle / 2, f.boltDia * 0.55, 0, Math.PI * 2, true)
    sh.holes.push(h)
  }
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(-L / 2, 0, 0)
  k.extrude(M, sh, L, basis, 32)
  bore(k, ri, -L / 2, L / 2, 40)
  for (const s of [-1, 1]) k.lathe('machined', [[ri * 1.18, 0], [ri * 1.18, 0.0008], [ri, 0.0008]], [s * (L / 2 - 0.0002), 0, 0], s > 0 ? 'x' : '-x', 40)
  // packing gland box, gland follower and studs
  const gw = R * 1.5
  const gt = Math.max(0.03, D * 0.15)
  k.box(M, [L * 1.25, gt, gw], [0, yC + gt / 2, 0])
  k.box(M, [L * 1.1, gt * 0.5, gw * 0.9], [0, yC + gt * 1.25, 0])
  const sd = clamp(f.boltDia * 0.6, 0.008, 0.02)
  for (const z of [-gw * 0.4, gw * 0.4]) {
    k.rod('boltXylan', [0, yC + gt * 0.2, z], [0, yC + gt * 1.9, z], sd / 2, 8)
    k.hex('nut', sd * 1.85, sd * 0.9, [0, yC + gt * 1.5 + sd * 0.45, z])
  }
  // two-post yoke, top plate, yoke nut and handwheel
  const yG = yC + gt * 1.5
  const H = T + R * 0.6 + 0.08
  const zp = gw * 0.42
  for (const s of [-1, 1]) k.box(M, [L * 0.9, H, Math.max(0.012, D * 0.05)], [0, yG + H / 2, s * zp])
  const yT = yG + H
  k.box(M, [L * 1.1, Math.max(0.02, D * 0.08), zp * 2 + Math.max(0.012, D * 0.05)], [0, yT + Math.max(0.01, D * 0.04), 0])
  const stemR = Math.max(0.008, D * 0.05)
  k.cyl(M, stemR * 2.4, Math.max(0.03, D * 0.12), [0, yT + Math.max(0.02, D * 0.08) + Math.max(0.015, D * 0.06), 0], 'y', 16)
  const hw = clamp(0.2 + 0.03 * nps, 0.25, 0.8)
  const yH = yT + Math.max(0.05, D * 0.22)
  k.handwheel('handwheel', hw, [0, yH, 0], 'y', hw > 0.35 ? 6 : 4)
  tagPlate(k, tag || plateText(nps, rating, 'KGV'), [L / 2 + 0.001, yC - R * 0.22, 0], 'x', clamp(R * 0.6, 0.05, 0.14))
  // gate plate with bevelled edge, clevis, rising stem (drawn open)
  const gw2 = ri * 2.2
  const gtk = Math.max(0.006, L * 0.18)
  const yb = -ri * 1.05 + T
  const ytop = yC + gt * 2 + T * 0.15 + T
  mv.box('stainless', [gtk, ytop - yb, gw2], [0, (ytop + yb) / 2, 0])
  mv.box('stainless', [gtk * 0.4, gtk * 1.2, gw2 * 0.96], [0, yb - gtk * 0.3, 0])
  mv.box(M, [gtk * 3, Math.max(0.03, D * 0.15), stemR * 4], [0, ytop + Math.max(0.015, D * 0.075), 0])
  const yS = ytop + Math.max(0.03, D * 0.15)
  const yE = yH + 0.04 + T
  mv.cyl('stainless', stemR, yE - yS, [0, (yE + yS) / 2, 0], 'y', 12)
}
