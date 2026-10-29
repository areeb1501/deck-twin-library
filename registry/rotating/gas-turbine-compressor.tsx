// Gas-turbine-driven centrifugal compressor train (API 616 driver, API 617 compressor): the centrifugal-compressor package with a two-shaft GT in its own enclosure.
import type { GroupProps } from '../lib/mesh'
import type { Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { CentrifugalCompressor, ports as trainPorts } from './centrifugal-compressor'

export interface GasTurbineCompressorProps {
  suctionNps?: number
  dischargeNps?: number
  rating?: Rating
  /** turbine shaft power, MW */
  mw?: number
  casing?: 'barrel' | 'split'
  nozzles?: 'up' | 'down'
  /** leave out the +Z enclosure wall */
  cutaway?: boolean
  doorsOpen?: boolean
  tag?: string
  running?: boolean
}

export const defaults = {
  suctionNps: 16,
  dischargeNps: 12,
  rating: 600 as Rating,
  mw: 12,
  casing: 'barrel' as 'barrel' | 'split',
  nozzles: 'up' as 'up' | 'down',
  cutaway: false,
  doorsOpen: false,
  tag: 'K-2300',
  running: true,
}

export function ports(p: GasTurbineCompressorProps = {}): Port[] {
  return trainPorts({ ...defaults, ...p, driver: 'gas-turbine' })
}

export function GasTurbineCompressor(props: GasTurbineCompressorProps & GroupProps) {
  return <CentrifugalCompressor {...defaults} {...props} driver="gas-turbine" />
}

export default GasTurbineCompressor
