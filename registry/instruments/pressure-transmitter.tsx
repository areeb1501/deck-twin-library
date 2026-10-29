// Gauge pressure transmitter: coplanar sensor and dual-compartment Ex d head with LCD on a 2-valve manifold, 2" pipe stand, 1/2" impulse tubing to a flanged process connection. IEC 60079-1, ASME B16.5.
import type { MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { buildStand, standLayout } from './_stand'

export interface PressureTransmitterProps {
  /** LCD centreline height above deck, m */
  height?: number
  /** class of the 1/2" process flange */
  rating?: Rating
  housing?: MatKey
  /** stainless sunshade over the head */
  sunshade?: boolean
  tag?: string
}

export const defaults = { height: 1.35, rating: 600 as Rating, housing: 'actuatorBlue' as MatKey, tag: 'PT-1001', sunshade: true }

export function ports(p: PressureTransmitterProps = {}): Port[] {
  const { height } = { ...defaults, ...p }
  const { faces } = standLayout({ valves: 2, height })
  return [port('process', 'Process connection', faces[0], [-1, 0, 0], 0.5, p.rating ?? defaults.rating, 'instrument')]
}

export function PressureTransmitter({ height = defaults.height, rating = defaults.rating, housing = defaults.housing, tag = defaults.tag, sunshade = defaults.sunshade, ...group }: PressureTransmitterProps & GroupProps) {
  const data = useKit((k) => buildStand(k, { valves: 2, height, rating, housing, tag, sunshade }), [height, rating, housing, tag, sunshade])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PressureTransmitter
