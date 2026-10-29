// Butterfly valve: concentric rubber-lined wafer or lug body, double-flanged, or metal-seated triple-offset; notch-plate lever or worm gear. API 609, ISO 5752.
import * as THREE from 'three'
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { faceToFace, flange, handwheelDia, inch, nearest, pipeOD, pipeWall, tableKeys, type Rating } from '../lib/standards'
import { bore, clamp, classK, companionFlanges, endFlange, dims, isoPadSize, plateText, revolveX, useKit2 } from './_body'
import { isoPad, notchLever, wormGear } from './_operators'

export type ButterflyStyle = 'wafer' | 'lug' | 'double-flanged' | 'triple-offset'

export interface ButterflyValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  style?: ButterflyStyle
  /** auto: notch lever up to NPS 6 on resilient-seated valves, gear otherwise */
  operator?: 'auto' | 'lever' | 'gear'
  /** disc rotation, 0 closed … 1 open */
  open?: number
  /** wafer / lug only: draw the pipe-side flanges, gaskets and studs (leave off inside a plant) */
  companionFlanges?: boolean
  body?: MatKey
  tag?: string
}

export const defaults = {
  nps: 8,
  rating: 150 as Rating,
  style: 'wafer' as ButterflyStyle,
  operator: 'auto' as 'auto' | 'lever' | 'gear',
  open: 1,
  companionFlanges: false,
  body: 'valveBody' as MatKey,
  tag: '',
}

// typical: ISO 5752 series 13 (EN 558-1 basic series 13) double-flanged face-to-face, inches NPS -> mm
const SERIES13: Record<number, number> = { 2: 108, 2.5: 112, 3: 114, 4: 127, 5: 140, 6: 140, 8: 152, 10: 165, 12: 178, 14: 190, 16: 216, 18: 222, 20: 229, 24: 267, 30: 292, 36: 318, 42: 330, 48: 410 }

/** Face-to-face (or wafer length) for the style; flanged bodies never shorter than both flanges plus a body. */
export function butterflyLength(style: ButterflyStyle, nps: number, rating: Rating) {
  if (style === 'wafer') return faceToFace('butterfly-wafer', nps, rating)
  if (style === 'lug') return faceToFace('butterfly-lug', nps, rating)
  const f = flange(nps, rating)
  const min = 2 * (f.thickness + f.raisedFaceHeight) + faceToFace('butterfly-wafer', nps, rating) * 0.8
  return Math.max(SERIES13[nearest(tableKeys(SERIES13), nps)] / 1000, min, inch(4))
}

export function ports(p: ButterflyValveProps = {}): Port[] {
  const { nps, rating, style } = { ...defaults, ...p }
  const L = butterflyLength(style, nps, rating)
  return [port('A', 'End A', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'End B', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function ButterflyValve(props: ButterflyValveProps & GroupProps) {
  const { nps, rating, style, operator, open, companionFlanges: cf, body, tag, ...group } = { ...defaults, ...props }
  const gear = operator === 'gear' || (operator === 'auto' && (nps > 6 || style === 'triple-offset'))
  const [fixed, moving] = useKit2((k, mv) => build(k, mv, nps, rating, style, gear, cf, body, tag), [nps, rating, style, gear, cf, body, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} rotation-y={-(1 - clamp(open, 0, 1)) * (Math.PI / 2)} />
    </group>
  )
}

export default ButterflyValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, style: ButterflyStyle, gear: boolean, cf: boolean, M: MatKey, tag: string) {
  const L = butterflyLength(style, nps, rating)
  const f = flange(nps, rating)
  const D = pipeOD(nps)
  const ri = D / 2 - pipeWall(nps, 'STD')
  const seg = nps >= 6 ? 48 : 32
  const lined = style === 'wafer' || style === 'lug'
  const rb = lined ? ri * 0.97 : ri
  let Rw: number
  if (style === 'wafer' || style === 'lug') {
    Rw = f.boltCircle / 2 - f.boltDia * 0.62 - 0.003
    k.lathe(M, [[f.raisedFace / 2, -L / 2 + 0.002], [Rw - 0.004, -L / 2 + 0.002], [Rw, -L / 2 + 0.006], [Rw, L / 2 - 0.006], [Rw - 0.004, L / 2 - 0.002], [f.raisedFace / 2, L / 2 - 0.002]], [0, 0, 0], 'x', seg)
    // rubber liner: faces wrap over the body ends, bore lining
    for (const s of [-1, 1]) k.lathe('rubberBlack', [[f.raisedFace / 2, 0], [f.raisedFace / 2, 0.002], [rb, 0.002], [rb, 0]], [s * (L / 2 - 0.002), 0, 0], s > 0 ? 'x' : '-x', seg)
    bore(k, rb, -L / 2, L / 2, seg, 'rubberBlack')
    if (style === 'lug') {
      k.around(f.bolts, f.boltCircle / 2, [0, 0, 0], 'x', (p, a) => {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a)
        const r = f.boltCircle / 2
        const h = r + f.boltDia * 1.25 - Rw + 0.006
        k.box(M, [L - 0.004, h, f.boltDia * 2.3], new THREE.Vector3(0, Rw - 0.006 + h / 2, 0).applyQuaternion(q).toArray() as [number, number, number], q)
        for (const s of [-1, 1]) k.disc('pipeBore', f.boltDia * 0.5, [s * (L / 2 - 0.0015), p[1], p[2]], s > 0 ? 'x' : '-x', 10)
      }, Math.PI / f.bolts)
    } else {
      // centring ears at the lower bolt holes
      for (const a of [Math.PI * 0.75, Math.PI * 1.25]) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a)
        const r = f.boltCircle / 2
        k.box(M, [L * 0.7, f.boltDia * 0.9 + 0.006, f.boltDia * 2.1], new THREE.Vector3(0, r - f.boltDia * 0.55, 0).applyQuaternion(q).toArray() as [number, number, number], q)
      }
    }
  } else {
    const d = dims(nps, rating, L)
    const rn = Math.max(D / 2 * 1.12, (f.hubDia / 2) * 0.95)
    Rw = Math.max(rn * 1.08, D / 2 + 0.03)
    for (const s of [-1, 1] as const) endFlange(k, d, s, Rw * 0.98, ri, M)
    revolveX(k, M, ri, [[Rw, -d.xf - 0.004], [Rw, d.xf + 0.004]], seg)
    bore(k, ri, -L / 2, L / 2, seg)
    if (style === 'triple-offset') {
      // laminated seal-ring seat and seat retainer ring bolting on the downstream face
      k.lathe('machined', [[ri * 1.0, 0], [ri * 0.94, 0.004], [ri * 0.94, 0.008]], [L * 0.08, 0, 0], 'x', seg)
    }
  }
  // stem neck, top flange, bottom trunnion boss
  const rnk = Math.max(0.022, D * 0.12)
  // extended neck clears 50 mm of pipe insulation; triple-offset valves carry a long packing bonnet
  const yT = Math.max(f.od / 2, Rw) + Math.max(0.06, D * 0.28) * (style === 'triple-offset' ? 1.8 : 1)
  k.cyl(M, rnk, yT - Rw * 0.95, [0, (yT + Rw * 0.95) / 2, 0], 'y', 24)
  k.cyl(M, rnk * 1.3, Math.max(0.02, D * 0.12), [0, -Rw - Math.max(0.01, D * 0.06) + 0.004, 0], 'y', 24)
  k.hex('nut', rnk * 1.1, 0.012, [0, -Rw - Math.max(0.02, D * 0.12) + 0.006 - 0.006, 0])
  const y = isoPad(k, M, yT, isoPadSize(D) * 1.1)
  const label = tag || plateText(nps, rating, style === 'triple-offset' ? 'TOV' : '')
  tagPlate(k, label, [0, (yT + Rw) / 2, rnk + 0.002], 'z', clamp(rnk * 2.6, 0.05, 0.12))
  // disc, hubs and stem (moving, drawn open: disc in the XY plane)
  const dt = style === 'triple-offset' ? Math.max(0.014, D * 0.09) : Math.max(0.008, D * 0.05)
  const off = style === 'triple-offset' ? dt * 0.9 : 0
  const pr = rb * 0.985
  const disc = new THREE.CylinderGeometry(pr, pr * (style === 'triple-offset' ? 0.97 : 1), dt, seg)
  mv.add('stainless', disc, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, off))
  mv.cyl('stainless', Math.max(0.012, D * 0.08), pr * 2 * 0.98, [0, 0, off * 0.5], 'y', 16)
  mv.cyl('stainless', Math.max(0.007, D * 0.04), y - pr * 0.9 + 0.01, [0, (y + pr * 0.9) / 2, 0], 'y', 12)
  if (style === 'triple-offset') for (const s of [-1, 1]) mv.box('stainless', [D * 0.12, pr * 0.25, Math.abs(off)], [0, s * pr * 0.5, off * 0.5])
  if (gear) {
    const g = clamp((0.08 + D * 0.6) * classK(rating), 0.14, 0.6)
    wormGear(k, mv, y, g, nps > 4 ? Math.min(handwheelDia('butterfly-wafer', nps, rating), clamp(0.2 + 0.02 * nps, 0.25, 0.8)) : 0.3, M, Math.max(f.od / 2, Rw) + 0.08)
  } else notchLever(k, mv, y, Math.max(0.008, D * 0.05), clamp(0.2 + nps * 0.04, 0.22, 0.5))
  if (cf && lined) companionFlanges(k, nps, rating, L)
}
