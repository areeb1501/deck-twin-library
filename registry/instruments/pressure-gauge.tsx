// Bourdon tube pressure gauge: 1/2" flanged connection, block-and-bleed gauge valve, optional siphon, solid-front safety case with blow-out back. EN 837-1 / ASME B40.100, ASME B16.5.
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { SS, tag as tagPlate, valveHandle, flange } from './_parts'

export interface PressureGaugeProps {
  rating?: Rating
  /** dial size, m */
  dial?: number
  /** full-scale, bar */
  max?: number
  /** pigtail siphon for steam / hot service */
  siphon?: boolean
  tag?: string
}

export const defaults = { rating: 600 as Rating, dial: 0.1, max: 100, siphon: false, tag: 'PI-1101' }

export function ports(p: PressureGaugeProps = {}): Port[] {
  const { rating } = { ...defaults, ...p }
  return [port('process', 'Process connection', [0, 0, 0], [0, -1, 0], 0.5, rating, 'instrument')]
}

export function PressureGauge({ rating = defaults.rating, dial = defaults.dial, max = defaults.max, siphon = defaults.siphon, tag = defaults.tag, ...group }: PressureGaugeProps & GroupProps) {
  const data = useKit((k) => build(k, rating, dial, max, siphon, tag), [rating, dial, max, siphon, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PressureGauge

function build(k: Kit, rating: Rating, dial: number, max: number, siphon: boolean, tag: string) {
  let y = flange(k, 0.5, rating, [0, 0, 0], '-y')
  const yTag = y + 0.02
  const r = 0.0107
  k.cyl(SS, r, 0.04, [0, y + 0.02, 0], 'y', 14)
  y += 0.04
  // block-and-bleed gauge valve: bar-stock body, block handle on +Z, bleed screw on -X
  k.box(SS, [0.04, 0.05, 0.036], [0, y + 0.025, 0])
  valveHandle(k, [0, y + 0.03, 0.018], [0, 0, 1], 'handwheel')
  k.cyl(SS, 0.005, 0.016, [-0.028, y + 0.014, 0], 'x', 8)
  k.hex(SS, 0.012, 0.008, [-0.038, y + 0.014, 0], 'x')
  y += 0.05
  if (siphon) {
    const R = 0.026
    k.cyl(SS, 0.007, 0.02, [0, y + 0.01, 0], 'y', 10)
    k.torus(SS, R, 0.006, [R, y + 0.02 + R, 0], 'z', 8, 32)
    k.cyl(SS, 0.007, 0.024, [0, y + 0.02 + 2 * R + 0.012, 0], 'y', 10)
    y += 0.02 + 2 * R + 0.024
  }
  k.hex(SS, 0.026, 0.018, [0, y + 0.009, 0])
  k.cyl(SS, 0.008, 0.016, [0, y + 0.026, 0], 'y', 10)
  const c: V3 = [0, y + 0.034 + dial / 2, 0]
  k.hex('brass', 0.022, 0.014, [0, y + 0.03, 0])
  gauge(k, c, 'z', dial, 'bar', max)
  k.cyl('rubberBlack', dial * 0.2, 0.004, [0, c[1], -dial * 0.16 - 0.002], 'z', 16)
  tagPlate(k, tag, [0, yTag, 0.0116], 'z', 0.045)
}
