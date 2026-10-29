// Offshore open-top cargo basket after DNV 2.7-1 / EN 12079-1: RHS base frame with fork pockets, posts and rails, kick plates and mesh sides, padeyes with a 4-leg sling set.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { checkerPlate, member, tagPlate } from '../lib/parts'
import { SECTIONS } from '../lib/standards'
import { meshGuardMaterial, textMaterial } from '../lib/textures'
import { boxMM, padeyeShackle, slingSet } from './_rigging'

export interface CargoBasketProps {
  /** external length, m */
  length?: number
  /** external width, m */
  width?: number
  /** side wall height above the deck, m */
  height?: number
  color?: string
  /** maximum gross weight, t (marking plate) */
  swl?: number
  liftingSet?: boolean
  tag?: string
}

export const defaults = {
  length: 6,
  width: 2.5,
  height: 1.2,
  color: '#e8641c',
  swl: 10,
  liftingSet: true,
  tag: 'CB-101',
}

export function CargoBasket({ length = defaults.length, width = defaults.width, height = defaults.height, color = defaults.color, swl = defaults.swl, liftingSet = defaults.liftingSet, tag = defaults.tag, ...group }: CargoBasketProps & GroupProps) {
  const data = useKit((k) => build(k, length, width, height, color, swl, liftingSet, tag), [length, width, height, color, swl, liftingSet, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default CargoBasket

function build(k: Kit, Lx: number, Wz: number, Hy: number, color: string, swl: number, lifting: boolean, tag: string) {
  const L = Math.max(1.5, Lx)
  const W = Math.max(1.0, Wz)
  const H = Math.max(0.6, Hy)
  const P = paint(color, { weather: 1.2 })
  const dark: MatKey = 'rubberBlack'
  const base = 'RHS 200x100x8'
  const bd = SECTIONS[base].d
  const bb = SECTIONS[base].b
  const sq = 'SHS 100x100x6.3'
  const s = SECTIONS[sq].b
  const hx = L / 2
  const hz = W / 2
  const ex = hx - bb / 2
  const ez = hz - bb / 2

  // base frame, cross members, plate floor
  for (const sz of [-1, 1]) member(k, [-hx, bd / 2, sz * ez], [hx, bd / 2, sz * ez], base, P)
  for (const sx of [-1, 1]) member(k, [sx * ex, bd / 2, -ez + bb / 2], [sx * ex, bd / 2, ez - bb / 2], base, P)
  const n = Math.max(2, Math.round(L / 0.6))
  for (let i = 1; i < n; i++) {
    const x = -ex + (2 * ex * i) / n
    member(k, [x, bd / 2 + 0.02, -ez + bb / 2], [x, bd / 2 + 0.02, ez - bb / 2], 'UPN 160', P)
  }
  checkerPlate(k, [0, bd + 0.008, 0], L - 2 * bb + 0.02, W - 2 * bb + 0.02)
  // fork pockets across the width (two tunnels, openings framed in the side beams)
  const fork = Math.min(2.05, L * 0.34)
  for (const sx of [-1, 1]) {
    const x = (sx * fork) / 2
    boxMM(k, P, [x - 0.2, 0.012, -hz + bb], [x + 0.2, 0.02, hz - bb])
    for (const dx of [-0.2, 0.2]) boxMM(k, P, [x + dx - 0.006, 0.012, -hz + bb], [x + dx + 0.006, bd, hz - bb])
    for (const sz of [-1, 1]) {
      boxMM(k, P, [x - 0.23, 0.0, sz * (hz + 0.006) - 0.006], [x + 0.23, bd + 0.01, sz * (hz + 0.006) + 0.006])
      boxMM(k, dark, [x - 0.185, 0.03, sz * (hz + 0.013) - 0.002], [x + 0.185, 0.14, sz * (hz + 0.013) + 0.002])
    }
  }

  // posts (corners + intermediates ≤ 1.6 m), top rail, mid rail
  const nx = Math.max(1, Math.ceil(L / 1.6))
  const nz = Math.max(1, Math.ceil(W / 1.6))
  const px = (i: number) => -hx + s / 2 + ((L - s) * i) / nx
  const pz = (j: number) => -hz + s / 2 + ((W - s) * j) / nz
  const posts: [number, number][] = []
  for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) posts.push([px(i), sz * (hz - s / 2)])
  for (let j = 1; j < nz; j++) for (const sx of [-1, 1]) posts.push([sx * (hx - s / 2), pz(j)])
  for (const [x, z] of posts) member(k, [x, bd, z], [x, H - s, z], sq, P, [1, 0, 0])
  const ym = (bd + H) / 2
  for (const y of [H - s / 2, ym]) {
    const sec = y === ym ? 'SHS 100x100x6.3' : sq
    for (const sz of [-1, 1]) member(k, [-hx, y, sz * (hz - s / 2)], [hx, y, sz * (hz - s / 2)], sec, P)
    for (const sx of [-1, 1]) member(k, [sx * (hx - s / 2), y, -hz + s], [sx * (hx - s / 2), y, hz - s], sec, P)
  }
  // kick plates and expanded-metal mesh infill on the inside face of each side
  const kick = Math.min(0.3, ym - bd - 0.06)
  const mesh = meshGuardMaterial('#5b6066')
  const panel = (a: V3, b: V3, y0: number, y1: number, n2: THREE.Vector3) => {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2])
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n2)
    const c = new THREE.Vector3((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[2] + b[2]) / 2)
    const g = new THREE.PlaneGeometry(len, y1 - y0)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 0.12), uv.getY(i) * ((y1 - y0) / 0.12))
    k.add(mesh, g, new THREE.Matrix4().compose(c, q, new THREE.Vector3(1, 1, 1)))
  }
  for (const sz of [-1, 1]) {
    const z = sz * (hz - s / 2)
    boxMM(k, P, [-hx + s, bd, z - 0.004], [hx - s, bd + kick, z + 0.004])
    panel([-hx + s, 0, z], [hx - s, 0, z], ym + s / 2, H - s, new THREE.Vector3(0, 0, sz))
    panel([-hx + s, 0, z], [hx - s, 0, z], bd + kick, ym - s / 2, new THREE.Vector3(0, 0, sz))
  }
  for (const sx of [-1, 1]) {
    const x = sx * (hx - s / 2)
    boxMM(k, P, [x - 0.004, bd, -hz + s], [x + 0.004, bd + kick, hz - s])
    panel([x, 0, -hz + s], [x, 0, hz - s], ym + s / 2, H - s, new THREE.Vector3(sx, 0, 0))
    panel([x, 0, -hz + s], [x, 0, hz - s], bd + kick, ym - s / 2, new THREE.Vector3(sx, 0, 0))
  }
  // floor lashing D-rings by each post, tag-line D-rings at mid-length on the outside of each side
  for (const [x, z] of posts) {
    const ix = Math.abs(x) > hx - s ? x - Math.sign(x) * (s / 2 + 0.06) : x
    const iz = Math.abs(z) > hz - s ? z - Math.sign(z) * (s / 2 + 0.06) : z
    boxMM(k, 'galvanised', [ix - 0.04, bd + 0.008, iz - 0.03], [ix + 0.04, bd + 0.03, iz + 0.03])
    k.torus('galvanised', 0.035, 0.008, [ix, bd + 0.06, iz], Math.abs(x) > hx - s ? 'x' : 'z', 6, 14)
  }
  for (const sz of [-1, 1]) k.torus('galvanised', 0.045, 0.01, [0, H - s - 0.05, sz * (hz + 0.01)], 'z', 6, 16)
  for (const sx of [-1, 1]) k.torus('galvanised', 0.045, 0.01, [sx * (hx + 0.01), H - s - 0.05, 0], 'x', 6, 16)
  // drain holes in the floor corners, marking plates
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.disc(dark, 0.03, [sx * (hx - bb - 0.12), bd + 0.0085, sz * (hz - bb - 0.12)], 'y', 12)
  const plate = textMaterial(`MGW ${swl} t  DNV 2.7-1`, '#f4f4ef', '#111111', 768, 96)
  k.plane(plate, 0.8, 0.1, [hx - 0.75, bd / 2, hz + 0.004])
  if (tag) tagPlate(k, tag, [-hx + 0.75, bd / 2, hz + 0.003], 'z', 0.3)
  k.plane(textMaterial('CARGO BASKET', color, '#151515', 768, 112), 1.2, 0.175, [0, H - s / 2, hz + 0.003])

  if (lifting) {
    const eyes: V3[] = []
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) eyes.push(padeyeShackle(k, [sx * (hx - s / 2), H, sz * (hz - s / 2)], 'z', 1.2, P))
    slingSet(k, eyes, [0, H + Math.hypot(hx, hz) * 1.05, 0], 0.26, 0.013)
  }
}
