// Security perimeter fence: chain-link or steel palisade with barbed-wire or razor-coil topping and an optional swing or sliding gate. BS 1722-10 / -12, ASTM F567.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { signMaterial } from '../lib/textures'
import { fenceRun, slidingGate, swingGate, type FenceOpts, type FenceStyle, type Topping } from './_fence'
import { clamp, earthBond } from './_onshore'

export interface PerimeterFenceProps {
  /** run length along X, m */
  length?: number
  style?: FenceStyle
  /** fabric or pale height, m */
  height?: number
  topping?: Topping
  gate?: 'none' | 'swing' | 'sliding'
  /** clear gate opening, m */
  gateWidth?: number
  finish?: 'galvanised' | 'green'
  tag?: string
}

export const defaults = { length: 30, style: 'palisade' as FenceStyle, height: 2.4, topping: 'razor' as Topping, gate: 'sliding' as 'none' | 'swing' | 'sliding', gateWidth: 6, finish: 'galvanised' as 'galvanised' | 'green', tag: '' }

export function PerimeterFence(props: PerimeterFenceProps & GroupProps) {
  const { length, style, height, topping, gate, gateWidth, finish, tag, ...group } = { ...defaults, ...props }
  const p = { length, style, height, topping, gate, gateWidth, finish, tag }
  const data = useKit((k) => build(k, p), [length, style, height, topping, gate, gateWidth, finish, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PerimeterFence

function build(k: Kit, p: typeof defaults) {
  const L = clamp(p.length, 2, 300)
  const o: FenceOpts = { style: p.style, height: clamp(p.height, 1.2, 3.6), topping: p.topping, mat: p.finish === 'green' ? paint('#2f5a3a', { clearcoat: 0.2 }) : 'galvanised' }
  const gw = p.gate === 'none' ? 0 : clamp(p.gateWidth, 1, Math.max(1, L * 0.6))
  const a = -L / 2
  const b = L / 2
  if (!gw) fenceRun(k, [a, 0, 0], [b, 0, 0], o, true, [0, 0, 1])
  else {
    const g0 = -gw / 2
    const g1 = gw / 2
    if (p.gate === 'sliding') {
      // the leaf parks behind the fence on the -X side, so keep the run clear of its tail
      fenceRun(k, [a, 0, 0], [g0, 0, 0], o, true, [0, 0, 1])
      slidingGate(k, [g0, 0, 0], [g1, 0, 0], o)
      fenceRun(k, [g1 + 0.2, 0, 0], [b, 0, 0], o, true, [0, 0, 1])
    } else {
      fenceRun(k, [a, 0, 0], [g0, 0, 0], o, true, [0, 0, 1])
      swingGate(k, [g0, 0, 0], [g1, 0, 0], o)
      fenceRun(k, [g1, 0, 0], [b, 0, 0], o, true, [0, 0, 1])
    }
    // warning signs either side of the gate, earth bond on the gate post
    k.plane(signMaterial('noentry'), 0.6, 0.3, [g0 - 1.2, 1.5, 0.12], undefined)
    k.plane(signMaterial('hv', 'DANGER'), 0.5, 0.25, [g1 + 1.2, 1.5, 0.12], undefined)
    earthBond(k, [g1 + 0.25, 0.35, 0.06], [0, 0, 1], 0, 0.35)
  }
  if (p.tag) k.plane(signMaterial('muster', p.tag), 0.8, 0.4, [a + 2, 1.4, 0.12], undefined)
}
