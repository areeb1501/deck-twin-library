// Temperature transmitter: flanged thermowell, lagging extension and union with a head-mounted dual-compartment Ex d transmitter. ASME PTC 19.3 TW, IEC 60751, ASME B16.5.
import type { MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { SS, exHead, flangedThermowell, tag as tagPlate } from './_parts'

export interface TemperatureTransmitterProps {
  /** thermowell flange size, inches */
  nps?: number
  rating?: Rating
  /** immersion length below the flange face, m */
  insertion?: number
  /** lagging extension, m */
  extension?: number
  housing?: MatKey
  tag?: string
}

export const defaults = { nps: 1.5, rating: 600 as Rating, insertion: 0.25, extension: 0.1, housing: 'actuatorBlue' as MatKey, tag: 'TT-1101' }

export function ports(p: TemperatureTransmitterProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  return [port('process', 'Thermowell flange', [0, 0, 0], [0, -1, 0], nps, rating)]
}

export function TemperatureTransmitter({ nps = defaults.nps, rating = defaults.rating, insertion = defaults.insertion, extension = defaults.extension, housing = defaults.housing, tag = defaults.tag, ...group }: TemperatureTransmitterProps & GroupProps) {
  const data = useKit(
    (k) => {
      const y = flangedThermowell(k, nps, rating, insertion, extension)
      k.cyl(SS, 0.012, 0.03, [0, y + 0.015, 0], 'y', 12)
      exHead(k, [0, y + 0.03 + 0.011 + 0.048 - 0.004, 0], housing)
      tagPlate(k, tag, [0, y - 0.038 - extension / 2, 0.0115], 'z', 0.06)
    },
    [nps, rating, insertion, extension, housing, tag],
  )
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default TemperatureTransmitter
