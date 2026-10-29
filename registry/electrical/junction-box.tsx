// Ex e increased-safety junction box on a floor stand: bolted lid, gland plate with cable glands, cables to a deck tray, earth stud, breather. IEC 60079-7, IEC 62444.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { member, tagPlate } from '../lib/parts'
import { cableGland, earthBoss } from './_parts'
import { legendMaterial } from './_textures'

export interface JunctionBoxProps {
  size?: 'small' | 'medium' | 'large'
  enclosure?: 'stainless' | 'grp'
  /** number of cable glands on the bottom gland plate */
  glands?: number
  /** box centre above deck, m */
  height?: number
  /** lid swung open, showing the DIN rail terminals and cable cores inside */
  open?: boolean
  tag?: string
}

export const defaults = {
  size: 'medium' as 'small' | 'medium' | 'large',
  enclosure: 'stainless' as 'stainless' | 'grp',
  glands: 6,
  height: 1.2,
  open: false,
  tag: 'JB-4101',
}

const SIZES: Record<string, V3> = { small: [0.3, 0.3, 0.15], medium: [0.5, 0.4, 0.2], large: [0.8, 0.6, 0.25] } // typical

export function JunctionBox(props: JunctionBoxProps & GroupProps) {
  const { size, enclosure, glands, height, open, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { size, enclosure, glands, height, open, tag }), [size, enclosure, glands, height, open, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default JunctionBox

function build(k: Kit, p: typeof defaults) {
  const [W, H, D] = SIZES[p.size] ?? SIZES.medium
  const box: MatKey = p.enclosure === 'grp' ? 'plasticGrey' : 'stainless'
  const yc = Math.max(H / 2 + 0.45, p.height)
  const zp = 0.04 // stand front face
  const zf = zp + 0.008 + D // lid front face
  const legs = W > 0.6 ? [-W * 0.35, W * 0.35] : [0]

  // stand: UPN 100 legs on base plates with anchors, horizontal rails carrying the box
  for (const x of legs) {
    member(k, [x, 0.015, -0.01], [x, yc + H / 2 + 0.05, -0.01], 'UPN 100', 'galvanised', [0, 0, 1])
    k.box('galvanised', [0.22, 0.015, 0.22], [x, 0.0075, -0.01])
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.026, 0.014, [x + sx * 0.08, 0.022, -0.01 + sz * 0.08])
  }
  for (const y of [yc - H / 2 + 0.06, yc + H / 2 - 0.06]) k.box('galvanised', [W + 0.12, 0.04, 0.03], [0, y, zp - 0.01])
  // enclosure: hollow body (back, four walls), lid with captive screws, hinges, earth stud, breather / drain
  const t = 0.004
  const Db = D - 0.035
  const zc = zp + Db / 2
  k.box(box, [W, H, t], [0, yc, zp + t / 2])
  for (const s of [-1, 1]) {
    k.box(box, [W, t, Db], [0, yc + s * (H / 2 - t / 2), zc])
    k.box(box, [t, H, Db], [s * (W / 2 - t / 2), yc, zc])
  }
  for (const s of [-1, 1]) {
    k.box('rubberBlack', [W, 0.012, 0.004], [0, yc + s * (H / 2 - 0.006), zp + Db - 0.002]) // lid gasket
    k.box('rubberBlack', [0.012, H, 0.004], [s * (W / 2 - 0.006), yc, zp + Db - 0.002])
  }
  // inside: mounting plate, DIN rail with terminals, cores from the glands
  k.box('galvanised', [W - 0.04, H - 0.04, 0.003], [0, yc, zp + t + 0.0015])
  const nT = Math.max(4, Math.floor((W - 0.1) / 0.0125))
  k.box('aluminium', [W - 0.08, 0.035, 0.008], [0, yc + 0.02, zp + 0.012])
  for (let i = 0; i < nT; i++) {
    const tx = -W / 2 + 0.05 + i * 0.0125
    k.box(i % 6 === 5 ? paint('#d8c21a', { roughness: 0.5, metalness: 0, clearcoat: 0, weather: 0 }) : paint('#3b6ea8', { roughness: 0.5, metalness: 0, clearcoat: 0, weather: 0 }), [0.01, 0.06, 0.045], [tx, yc + 0.02, zp + 0.038])
  }
  k.box('rubberBlack', [W - 0.08, 0.025, 0.03], [0, yc + H * 0.32, zp + 0.02]) // trunking
  k.box('rubberBlack', [W - 0.08, 0.025, 0.03], [0, yc - H * 0.25, zp + 0.02])
  // cable cores from each gland up the trunking to the terminals
  {
    const ng = Math.max(1, Math.min(20, Math.round(p.glands)))
    for (let i = 0; i < ng; i++) {
      const gx = -W * 0.38 + (ng === 1 ? W * 0.38 : (i * W * 0.76) / (ng - 1))
      for (const [c, col] of (['#2b5fae', '#8a5a2b', '#3a3a3a'] as const).entries()) {
        const tx = Math.max(-W / 2 + 0.06, Math.min(W / 2 - 0.06, gx + (c - 1) * 0.012))
        k.spline(paint(col, { roughness: 0.6, metalness: 0, clearcoat: 0, weather: 0 }), [[gx + (c - 1) * 0.006, yc - H / 2 + t, zp + Db * 0.5], [gx, yc - H * 0.25, zp + 0.04], [tx, yc - 0.01, zp + 0.05]], 0.0025, 4, 10)
      }
    }
  }
  // lid (hinged on the left edge), drawn in a hinge frame so it can swing open
  const lidQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.open ? -1.9 : 0)
  const hinge = new THREE.Vector3(-W / 2 - 0.008, yc, zf - 0.0175)
  const L = (x: number, y: number, z: number): V3 => new THREE.Vector3(x + W / 2 + 0.008, y - yc, z - (zf - 0.0175)).applyQuaternion(lidQ).add(hinge).toArray() as V3
  k.at(hinge.toArray() as V3, lidQ, () => {
    k.rbox(box, [W + 0.01, H + 0.01, 0.035], 0.012, [W / 2 + 0.008, 0, 0])
  })
  const nx = Math.max(2, Math.round(W / 0.2))
  const ny = Math.max(2, Math.round(H / 0.2))
  for (let i = 0; i <= nx; i++) for (const s of [-1, 1]) k.cyl('stainless', 0.007, 0.01, L(-W / 2 + 0.02 + (i * (W - 0.04)) / nx, yc + s * (H / 2 - 0.012), zf + 0.004), lidQ.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))), 8)
  for (let i = 1; i < ny; i++) for (const s of [-1, 1]) k.cyl('stainless', 0.007, 0.01, L(s * (W / 2 - 0.012), yc - H / 2 + (i * H) / ny, zf + 0.004), lidQ.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))), 8)
  for (const y of [yc - H * 0.3, yc + H * 0.3]) k.cyl('stainless', 0.01, 0.06, [-W / 2 - 0.008, y, zf - 0.0175], 'y', 10)
  k.cyl('brass', 0.012, 0.03, [W * 0.35, yc - H / 2 - 0.015, zp + D * 0.8], 'y', 10) // breather / drain
  earthBoss(k, [W / 2, yc - H * 0.3, zp + D / 2], 'x')
  k.add(legendMaterial('Ex eb IIC T6 Gb  IP66'), new THREE.PlaneGeometry(Math.min(0.2, W * 0.5), 0.022), new THREE.Matrix4().compose(new THREE.Vector3(...L(0, yc + H * 0.25, zf + 0.001)), lidQ, new THREE.Vector3(1, 1, 1)))
  k.at(L(0, yc - H * 0.15, zf + 0.001), lidQ, () => k.box('actuatorYellow', [Math.min(0.16, W * 0.4), 0.06, 0.002], [0, 0, 0]))
  k.add(legendMaterial('ISOLATE ELSEWHERE BEFORE OPENING', true), new THREE.PlaneGeometry(Math.min(0.15, W * 0.38), 0.03), new THREE.Matrix4().compose(new THREE.Vector3(...L(0, yc - H * 0.15, zf + 0.0025)), lidQ, new THREE.Vector3(1, 1, 1)))
  tagPlate(k, p.tag, [-W / 2 - 0.002, yc - H * 0.15, zc], '-x', Math.min(0.12, D * 0.6))

  // gland plate underneath with glands in a row, cables down and away to a deck tray
  const n = Math.max(1, Math.min(20, Math.round(p.glands)))
  const gz = zp + D / 2 - 0.015
  k.box(box, [W * 0.85, 0.008, D * 0.6], [0, yc - H / 2 - 0.004, gz])
  const yTray = 0.12
  const xT = W / 2 + 0.25
  for (let i = 0; i < n; i++) {
    const x = -W * 0.38 + (n === 1 ? W * 0.38 : (i * W * 0.76) / (n - 1))
    const od = i % 3 === 0 ? 0.03 : 0.022
    const end = cableGland(k, [x, yc - H / 2 - 0.008, gz], '-y', od)
    const zc = gz + 0.25 + (i % 3) * 0.035
    k.spline('cable', [end, [x, end[1] - 0.2, gz], [x, yTray + 0.3, zc - 0.05], [x + 0.1, yTray + 0.04, zc], [xT + 0.6, yTray + 0.04, zc]], od / 2, 6, 40)
  }
  // ladder cable tray at deck level running out along +X
  const zt0 = gz + 0.2
  const zt1 = gz + 0.42
  for (const z of [zt0, zt1]) k.box('cableTray', [W + 1.2, 0.08, 0.006], [W * 0.0 + 0.35, yTray, z])
  for (let x = -W / 2 - 0.2; x < W / 2 + 0.9; x += 0.3) k.box('cableTray', [0.03, 0.015, zt1 - zt0], [x, yTray - 0.03, (zt0 + zt1) / 2])
  for (const x of [-W / 2 - 0.15, W / 2 + 0.85]) k.box('galvanised', [0.05, yTray - 0.04, zt1 - zt0 + 0.04], [x, (yTray - 0.04) / 2, (zt0 + zt1) / 2])
}
