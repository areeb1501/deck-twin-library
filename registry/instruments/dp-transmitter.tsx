// Differential pressure transmitter: coplanar sensor and Ex d head with LCD on a 5-valve manifold, 2" pipe stand, HP / LP impulse tubing to flanged process connections. IEC 60079-1, ASME B16.5.
import type { MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { buildStand, standLayout } from './_stand'

export interface DpTransmitterProps {
  /** LCD centreline height above deck, m */
  height?: number
  /** class of the 1/2" process flanges */
  rating?: Rating
  housing?: MatKey
  /** stainless sunshade over the head */
  sunshade?: boolean
  tag?: string
}

export const defaults = { height: 1.35, rating: 600 as Rating, housing: 'actuatorBlue' as MatKey, tag: 'PDT-1001', sunshade: true }

export function ports(p: DpTransmitterProps = {}): Port[] {
  const { height, rating } = { ...defaults, ...p }
  const { faces } = standLayout({ valves: 5, height })
  return [
    port('hp', 'High-pressure side', faces[0], [-1, 0, 0], 0.5, rating, 'instrument'),
    port('lp', 'Low-pressure side', faces[1], [-1, 0, 0], 0.5, rating, 'instrument'),
  ]
}

export function DpTransmitter({ height = defaults.height, rating = defaults.rating, housing = defaults.housing, tag = defaults.tag, sunshade = defaults.sunshade, ...group }: DpTransmitterProps & GroupProps) {
  const data = useKit((k) => buildStand(k, { valves: 5, height, rating, housing, tag, sunshade }), [height, rating, housing, tag, sunshade])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default DpTransmitter
