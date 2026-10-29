// Lifejacket storage chest: hollow GRP box with gel-coat lining on galvanised skids with deck lugs, hinged lid (gas stays, hasps, drain), stacked lifejackets inside, lifejacket sign; capacity sets the length. SOLAS LSA Code 2.2, IMO A.1116, ISO 12402-2.
import * as THREE from 'three'
import { Kit, mat4, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { SAFETY } from '../lib/standards'
import { GRP_INNER, GRP_ORANGE, lifejacketPictogram, safetySign } from './_detectors'

export interface LifejacketBoxProps {
  /** lifejackets stored */
  capacity?: number
  /** lid opening, 0 closed … 1 open */
  open?: number
  colour?: 'orange' | 'white'
  tag?: string
}

export const defaults = { capacity: 24, open: 0.6, colour: 'orange' as 'orange' | 'white', tag: 'LJ-0501' }

const WHITE: MatKey = paint('#ecebe5', { metalness: 0.05, roughness: 0.45, clearcoat: 0.4 })
const JACKET: MatKey = paint('#ff8c00', { metalness: 0, roughness: 0.8 })
const BUCKLE: MatKey = paint('#1d1e20', { metalness: 0, roughness: 0.8 })
const RETRO: MatKey = paint('#dfe3e6', { metalness: 0.4, roughness: 0.3 })
const H = 0.78 // body height, m (typical: 15–24 jacket chests ≈ 0.88 m overall)
const D = 0.78 // depth, m (typical)
const T = 0.008 // wall, m
const YS = 0.1 // skid height, m

export function LifejacketBox(props: LifejacketBoxProps & GroupProps) {
  const { capacity, open, colour, tag, ...group } = { ...defaults, ...props }
  const n = Math.max(6, Math.min(60, Math.round(capacity)))
  const data = useKit((k) => build(k, n, open, colour, tag), [n, open, colour, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default LifejacketBox

function build(k: Kit, n: number, open: number, colour: 'orange' | 'white', tag: string) {
  const mat = colour === 'white' ? WHITE : GRP_ORANGE
  // typical sizing: ≈ 1.18 m long for 15 jackets, ≈ 1.48 m for 24
  const cols = Math.ceil(n / 16)
  const W = Math.max(0.9, 0.75 + 0.03 * n, cols * 0.44 + 0.1)
  // skids with lashing lugs and deck bolts
  for (const sz of [-1, 1]) {
    k.box('galvanised', [W + 0.1, YS, 0.08], [0, YS / 2, sz * (D / 2 - 0.08)])
    for (const sx of [-1, 1]) {
      k.box('galvanised', [0.06, 0.01, 0.12], [sx * (W / 2 + 0.02), 0.005, sz * (D / 2 - 0.08)])
      k.hex('nut', 0.022, 0.012, [sx * (W / 2 + 0.02), 0.016, sz * (D / 2 - 0.08)], 'y')
    }
  }
  const y0 = YS
  // hollow body: floor, four walls, lining, top rim, drain plug
  k.box(mat, [W, T, D], [0, y0 + T / 2, 0])
  for (const s of [-1, 1]) {
    k.box(mat, [W, H, T], [0, y0 + H / 2, s * (D / 2 - T / 2)])
    k.box(mat, [T, H, D - 2 * T], [s * (W / 2 - T / 2), y0 + H / 2, 0])
  }
  k.box(GRP_INNER, [W - 2 * T - 0.002, 0.001, D - 2 * T - 0.002], [0, y0 + T + 0.0005, 0])
  for (const s of [-1, 1]) {
    k.plane(GRP_INNER, W - 2 * T, H - T, [0, y0 + T + (H - T) / 2, s * (D / 2 - T - 0.0005)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s > 0 ? Math.PI : 0))
    k.plane(GRP_INNER, D - 2 * T, H - T, [s * (W / 2 - T - 0.0005), y0 + T + (H - T) / 2, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-s * Math.PI) / 2))
  }
  for (const s of [-1, 1]) {
    k.box(mat, [W + 0.03, 0.02, 0.016], [0, y0 + H - 0.01, s * (D / 2 + 0.008)])
    k.box(mat, [0.016, 0.02, D], [s * (W / 2 + 0.008), y0 + H - 0.01, 0])
  }
  k.cyl('brass', 0.012, 0.01, [W / 2 - 0.08, y0 + 0.03, D / 2 + 0.005], 'z', 6)
  // stacked lifejackets: two rows deep, up to eight high per column (folded foam jackets with retro-reflective patches)
  let left = n
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 8 && left > 0; i++, left--) {
        const x = (c - (cols - 1) / 2) * 0.44
        const z = (r - 0.5) * 0.36
        const y = y0 + T + 0.045 + 0.09 * i
        k.rbox(JACKET, [0.42, 0.088, 0.34], 0.025, [x, y, z])
        k.box(RETRO, [0.07, 0.002, 0.07], [x - 0.1, y + 0.045, z + 0.06])
        k.box(RETRO, [0.07, 0.002, 0.07], [x + 0.1, y + 0.045, z + 0.06])
        k.box(BUCKLE, [0.4, 0.003, 0.03], [x, y + 0.0445, z - 0.09])
        k.box(BUCKLE, [0.05, 0.01, 0.036], [x, y + 0.046, z - 0.09])
      }
  // lid hinged at the back top edge, opens upwards, with gas stays
  const a = (Math.max(0, Math.min(1, open)) * 100 * Math.PI) / 180
  const hinge = new THREE.Vector3(0, y0 + H + 0.004, -D / 2 - 0.01)
  k.with(new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z).multiply(new THREE.Matrix4().makeRotationX(-a)), () => {
    k.rbox(mat, [W + 0.05, 0.03, D + 0.04], 0.01, [0, 0.015, (D + 0.04) / 2])
    for (const s of [-1, 1]) k.box(mat, [W + 0.05, 0.05, 0.012], [0, -0.01, s > 0 ? D + 0.034 : 0.006])
    for (const s of [-1, 1]) k.box(mat, [0.012, 0.05, D + 0.04], [s * (W / 2 + 0.019), -0.01, (D + 0.04) / 2])
    k.box(GRP_INNER, [W - 0.02, 0.001, D - 0.02], [0, -0.0005, (D + 0.04) / 2])
    // hasps on the front edge
    for (const s of [-1, 1]) k.box('stainless', [0.04, 0.07, 0.006], [s * W * 0.3, -0.03, D + 0.043])
  })
  for (const s of [-1, 1]) {
    k.cyl('stainless', 0.008, 0.08, [s * (W / 2 - 0.15), y0 + H + 0.004, -D / 2 - 0.012], 'x', 10)
    k.box('stainless', [0.04, 0.025, 0.012], [s * W * 0.3, y0 + H - 0.05, D / 2 + 0.006])
    k.cyl('stainless', 0.004, 0.012, [s * W * 0.3, y0 + H - 0.05, D / 2 + 0.016], 'z', 8)
    // gas stay from the body side to the lid
    const p0 = new THREE.Vector3(s * (W / 2 - 0.03), y0 + H - 0.2, -D / 2 + 0.06)
    const p1 = new THREE.Vector3(s * (W / 2 - 0.03), -0.012, 0.25).applyMatrix4(new THREE.Matrix4().makeRotationX(-a)).add(hinge)
    const mid = p0.clone().lerp(p1, 0.5)
    k.rod('castIron', p0.toArray() as [number, number, number], mid.toArray() as [number, number, number], 0.01, 10)
    k.rod('stainless', mid.toArray() as [number, number, number], p1.toArray() as [number, number, number], 0.005, 8)
  }
  // lifejacket sign and tag on the front
  const sw = Math.min(0.6, W - 0.2)
  k.add(safetySign('lj', SAFETY.green, ['LIFEJACKETS'], lifejacketPictogram), new THREE.PlaneGeometry(sw, sw / 2), mat4([-0.04, y0 + H * 0.52, D / 2 + 0.0008]))
  tagPlate(k, tag, [W / 2 - 0.12, y0 + 0.12, D / 2 + 0.0008], 'z', 0.1)
}
