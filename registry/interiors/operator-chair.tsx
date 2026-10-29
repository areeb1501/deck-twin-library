// 24/7 control-room operator chair: five-star aluminium base with twin-wheel castors, gas lift, synchro mechanism, lumbar back, headrest, adjustable arms. EN 1335, BS 5459-2.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { chair } from './_furniture'

export interface OperatorChairProps {
  /** seat top above the floor, m (gas-lift range about 0.45–0.62) */
  seatHeight?: number
  headrest?: boolean
  arms?: boolean
  /** upholstery colour */
  color?: string
  /** swivel about the gas lift, degrees */
  swivel?: number
  tag?: string
}

export const defaults = { seatHeight: 0.5, headrest: true, arms: true, color: '#2b2f35', swivel: 0, tag: '' }

export function OperatorChair(props: OperatorChairProps & GroupProps) {
  const { seatHeight, headrest, arms, color, swivel, tag, ...group } = { ...defaults, ...props }
  const sh = Math.min(0.64, Math.max(0.43, seatHeight))
  const b = useMemo(() => {
    const base = new Kit()
    const top = new Kit()
    const up = paint(color, { metalness: 0, roughness: 0.95, clearcoat: 0, weather: 0 })
    // build whole chair once, then split: base (static) and the swivelling upper part
    chair(base, new THREE.Matrix4(), { seat: sh, headrest, arms, upholstery: up, part: 'base' })
    chair(top, new THREE.Matrix4(), { seat: sh, headrest, arms, upholstery: up, part: 'top' })
    return { base: base.build(), top: top.build() }
  }, [sh, headrest, arms, color])
  useEffect(() => () => [b.base, b.top].forEach((x) => x.geometry.dispose()), [b])
  void tag
  return (
    <group {...group}>
      <KitMesh data={b.base} />
      <group rotation={[0, (swivel * Math.PI) / 180, 0]}>
        <KitMesh data={b.top} />
      </group>
    </group>
  )
}

export default OperatorChair
