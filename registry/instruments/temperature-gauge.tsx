// Bimetal dial thermometer: every-angle stainless case on a hinged stem in a flanged thermowell. EN 13190 / ASME B40.200, ASME PTC 19.3 TW, ASME B16.5.
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { SS, flangedThermowell, tag as tagPlate } from './_parts'

export interface TemperatureGaugeProps {
  /** thermowell flange size, inches */
  nps?: number
  rating?: Rating
  /** immersion length below the flange face, m */
  insertion?: number
  /** lagging extension, m */
  extension?: number
  /** dial size, m */
  dial?: number
  /** full-scale, °C */
  max?: number
  tag?: string
}

export const defaults = { nps: 1.5, rating: 600 as Rating, insertion: 0.25, extension: 0.08, dial: 0.125, max: 200, tag: 'TI-1101' }

export function ports(p: TemperatureGaugeProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  return [port('process', 'Thermowell flange', [0, 0, 0], [0, -1, 0], nps, rating)]
}

export function TemperatureGauge({ nps = defaults.nps, rating = defaults.rating, insertion = defaults.insertion, extension = defaults.extension, dial = defaults.dial, max = defaults.max, tag = defaults.tag, ...group }: TemperatureGaugeProps & GroupProps) {
  const data = useKit(
    (k) => {
      const y = flangedThermowell(k, nps, rating, insertion, extension)
      // stem, swivel knuckle and back-connected case
      k.cyl(SS, 0.0045, 0.05, [0, y + 0.025, 0], 'y', 10)
      const yk = y + 0.055
      k.sphere(SS, 0.011, [0, yk, 0], undefined, 14)
      k.cyl(SS, 0.009, 0.026, [0, yk, 0], 'x', 12)
      const depth = dial * 0.32
      const yc = yk + dial * 0.55
      const zc = depth / 2 + 0.014
      k.rod(SS, [0, yk, 0], [0, yc, 0], 0.006, 10)
      k.cyl(SS, 0.013, 0.014, [0, yc, 0.007], 'z', 14)
      gauge(k, [0, yc, zc], 'z', dial, '°C', max)
      tagPlate(k, tag, [0, y - 0.038 - extension / 2, 0.0115], 'z', 0.06)
    },
    [nps, rating, insertion, extension, dial, max, tag],
  )
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default TemperatureGauge
