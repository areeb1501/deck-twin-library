// Pressure switch: 1/2" flanged connection, block valve, diaphragm-sealed sensing element and an Ex d switch enclosure with threaded cover, set-point cap and conduit entry. IEC 60079-1, ASME B16.5.
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { SS, flange, tag as tagPlate, valveHandle } from './_parts'

export interface PressureSwitchProps {
  rating?: Rating
  housing?: MatKey
  tag?: string
}

export const defaults = { rating: 600 as Rating, housing: 'equipmentPaintDark' as MatKey, tag: 'PSHH-1101' }

export function ports(p: PressureSwitchProps = {}): Port[] {
  const { rating } = { ...defaults, ...p }
  return [port('process', 'Process connection', [0, 0, 0], [0, -1, 0], 0.5, rating, 'instrument')]
}

export function PressureSwitch({ rating = defaults.rating, housing = defaults.housing, tag = defaults.tag, ...group }: PressureSwitchProps & GroupProps) {
  const data = useKit((k) => build(k, rating, housing, tag), [rating, housing, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PressureSwitch

function build(k: Kit, rating: Rating, housing: MatKey, tag: string) {
  let y = flange(k, 0.5, rating, [0, 0, 0], '-y')
  const yTag = y + 0.02
  k.cyl(SS, 0.0107, 0.04, [0, y + 0.02, 0], 'y', 14)
  y += 0.04
  // bar-stock block valve with bleed plug
  k.box(SS, [0.04, 0.05, 0.036], [0, y + 0.025, 0])
  valveHandle(k, [0, y + 0.03, 0.018], [0, 0, 1], 'handwheel')
  k.hex(SS, 0.012, 0.008, [-0.024, y + 0.014, 0], 'x')
  y += 0.05
  k.cyl(SS, 0.0107, 0.03, [0, y + 0.015, 0], 'y', 14)
  y += 0.03
  // diaphragm-sealed sensing element: upper and lower housings with a bolt ring
  k.cyl(SS, 0.04, 0.014, [0, y + 0.007, 0], 'y', 32)
  k.cyl(SS, 0.042, 0.004, [0, y + 0.016, 0], 'y', 32)
  k.cyl(SS, 0.04, 0.014, [0, y + 0.025, 0], 'y', 32)
  k.around(6, 0.034, [0, y + 0.033, 0], 'y', (p) => k.hex('nut', 0.009, 0.005, p, 'y'), Math.PI / 6)
  y += 0.032
  k.cyl(housing, 0.022, 0.016, [0, y + 0.008, 0], 'y', 20)
  y += 0.016
  // Ex d switch enclosure: cast body, round threaded cover on +Z, set-point cap on top, conduit entry on +X
  const W = 0.11
  const H = 0.14
  const Dp = 0.085
  const yc = y + H / 2
  k.rbox(housing, [W, H, Dp], 0.01, [0, yc, 0])
  k.cyl(housing, 0.044, 0.018, [0, yc, Dp / 2 + 0.009], 'z', 32)
  k.torus(housing, 0.044, 0.003, [0, yc, Dp / 2 + 0.004], 'z', 6, 32)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    k.box(housing, [0.006, 0.006, 0.012], [Math.cos(a) * 0.045, yc + Math.sin(a) * 0.045, Dp / 2 + 0.012])
  }
  k.box('nameplate', [0.05, 0.022, 0.0015], [0, yc, Dp / 2 + 0.0185])
  k.cyl(housing, 0.016, 0.014, [0, y + H + 0.007, 0], 'y', 16)
  k.hex(SS, 0.024, 0.012, [0, y + H + 0.02, 0])
  k.cyl(housing, 0.014, 0.016, [W / 2 + 0.008, yc - H * 0.25, 0], 'x', 14)
  k.hex('brass', 0.028, 0.018, [W / 2 + 0.025, yc - H * 0.25, 0], 'x')
  k.cyl('rubberBlack', 0.0085, 0.012, [W / 2 + 0.04, yc - H * 0.25, 0], 'x', 10)
  k.cyl(SS, 0.005, 0.008, [-W / 2 - 0.004, yc - H * 0.35, 0], 'x', 8)
  tagPlate(k, tag, [0, yTag, 0.0116], 'z', 0.045)
}
