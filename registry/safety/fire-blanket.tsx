// Fire blanket: rigid red quick-release container with printed instructions, open bottom slot and two pull tapes, fire-blanket sign above; on a wall plate or stanchion. EN 1869, BS 7944, ISO 7010-style signage.
import * as THREE from 'three'
import { Kit, mat4, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { SAFETY } from '../lib/standards'
import { canvasMat, mounted, polePlate, type Mount } from './_fg'
import { blanketPictogram, safetySign, tagBracket } from './_detectors'

export interface FireBlanketProps {
  /** blanket size, m */
  size?: '1.0x1.0' | '1.2x1.2' | '1.8x1.2'
  mount?: Mount
  /** container centre above the deck, m */
  height?: number
  sign?: boolean
  tag?: string
}

export const defaults = { size: '1.2x1.2' as '1.0x1.0' | '1.2x1.2' | '1.8x1.2', mount: 'wall' as Mount, height: 1.5, sign: true, tag: 'FB-0601' }

const CASE: MatKey = paint('#c0261d', { metalness: 0.05, roughness: 0.4, clearcoat: 0.5 })
const TAPE: MatKey = paint('#1d1e20', { metalness: 0, roughness: 0.85 })
const DIMS: Record<string, [number, number, number]> = { '1.0x1.0': [0.165, 0.185, 0.043], '1.2x1.2': [0.177, 0.203, 0.046], '1.8x1.2': [0.177, 0.253, 0.05] } // typical rigid cases, W × H × D

export function FireBlanket(props: FireBlanketProps & GroupProps) {
  const { size, mount, height, sign, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(0.8, height)
  const data = useKit((k) => build(k, DIMS[size] ? size : '1.2x1.2', mount, h, sign, tag), [size, mount, h, sign, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default FireBlanket

function labelMat(size: string) {
  return canvasMat(`fb-label-${size}`, 256, 256, (g) => {
    g.fillStyle = '#c0261d'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = 'bold 34px Arial, sans-serif'
    g.fillText('FIRE', 128, 34)
    g.fillText('BLANKET', 128, 70)
    g.save()
    g.translate(78, 92)
    blanketPictogram(g, 100)
    g.restore()
    g.font = 'bold 17px Arial, sans-serif'
    g.fillText('PULL TAPES DOWN', 128, 212)
    g.fillText('SHARPLY', 128, 232)
    g.font = '13px Arial, sans-serif'
    g.fillText(`${size} m`, 210, 34)
  })
}

function build(k: Kit, size: string, mount: Mount, h: number, sign: boolean, tag: string) {
  const [W, H, D] = DIMS[size]
  const zf = mounted(k, mount, h, [W - 0.06, H + 0.04], () => {
    // back plate, shell (front, sides, top), open bottom slot with the folded blanket inside
    k.rbox(CASE, [W, H, 0.006], 0.004, [0, 0, 0.003])
    k.rbox(CASE, [W, 0.008, D], 0.004, [0, H / 2 - 0.004, D / 2])
    for (const s of [-1, 1]) k.rbox(CASE, [0.008, H, D], 0.003, [s * (W / 2 - 0.004), 0, D / 2])
    k.rbox(CASE, [W, H - 0.03, 0.008], 0.004, [0, 0.015, D - 0.004])
    k.box(CASE, [W, 0.01, 0.02], [0, -H / 2 + 0.005, 0.01])
    k.box(paint('#d9d3c2', { metalness: 0, roughness: 0.9 }), [W - 0.02, H - 0.06, D - 0.03], [0, 0.0, D / 2])
    k.add(labelMat(size), new THREE.PlaneGeometry(W - 0.03, H - 0.05), mat4([0, 0.02, D + 0.0005]))
    // pull tapes: down out of the slot with finger loops
    for (const s of [-1, 1]) {
      const x = s * W * 0.25
      k.box(TAPE, [0.025, 0.14, 0.002], [x, -H / 2 - 0.06, D - 0.02])
      k.torus(TAPE, 0.022, 0.003, [x, -H / 2 - 0.15, D - 0.02], 'z', 6, 20)
    }
  }, h + H / 2 + (sign ? 0.25 : 0.05))
  tagBracket(k, mount, Math.max(0.3, h - H / 2 - 0.3), tag)
  if (sign) {
    const ys = h + H / 2 + 0.15
    // on a stanchion the sign stands off a U-bolted plate, clear of the nuts
    const zs = mount === 'pole' ? polePlate(k, ys, 0.3, 0.15) + 0.012 : zf
    if (mount === 'pole') for (const sx of [-0.1, 0.1]) k.box('stainless', [0.03, 0.03, 0.012], [sx, ys, zs - 0.006])
    k.box('stainless', [0.3, 0.15, 0.004], [0, ys, zs + 0.002])
    k.add(safetySign('fb', SAFETY.red, ['FIRE', 'BLANKET'], blanketPictogram), new THREE.PlaneGeometry(0.29, 0.145), mat4([0, ys, zs + 0.0045]))
  }
}
