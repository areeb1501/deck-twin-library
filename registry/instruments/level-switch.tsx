// Vibrating fork level switch: flanged process connection, tuning fork with vertical drain gap, thermal neck and a compact housing with status LEDs and two cable entries. IEC 62828, ASME B16.5.
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { SS, instFlange, tag as tagPlate } from './_parts'

export interface LevelSwitchProps {
  /** process flange size, inches */
  nps?: number
  rating?: Rating
  /** fork length from the flange face to the tip, m */
  length?: number
  housing?: MatKey
  tag?: string
}

export const defaults = { nps: 2, rating: 300 as Rating, length: 0.102, housing: 'aluminium' as MatKey, tag: 'LSHH-1101' }

export function ports(p: LevelSwitchProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  return [port('process', 'Process flange', [0, 0, 0], [-1, 0, 0], nps, rating)]
}

export function LevelSwitch({ nps = defaults.nps, rating = defaults.rating, length = defaults.length, housing = defaults.housing, tag = defaults.tag, ...group }: LevelSwitchProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, Math.max(0.06, length), housing, tag), [nps, rating, length, housing, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default LevelSwitch

function build(k: Kit, nps: number, rating: Rating, length: number, housing: MatKey, tag: string) {
  // process side (-X): extension tube, fork root, two flat tines side by side so the gap is vertical
  const xr = -length + 0.044
  k.cyl(SS, 0.0125, -xr, [xr / 2, 0, 0], 'x', 20)
  k.cyl(SS, 0.0135, 0.008, [xr + 0.004, 0, 0], 'x', 20)
  for (const z of [-0.0065, 0.0065]) {
    k.box(SS, [0.012, 0.012, 0.004], [xr - 0.006, 0, z])
    k.rbox(SS, [0.032, 0.022, 0.004], 0.0018, [xr - 0.012 - 0.016, 0, z])
  }
  // flange, hex, thermal neck, housing with LED cover facing +X
  let x = instFlange(k, nps, rating, 'x')
  k.hex(SS, 0.05, 0.018, [x + 0.009, 0, 0], 'x')
  x += 0.018
  k.cyl(SS, 0.016, 0.05, [x + 0.025, 0, 0], 'x', 20)
  for (let i = 0; i < 4; i++) k.cyl(SS, 0.02, 0.003, [x + 0.008 + i * 0.011, 0, 0], 'x', 20)
  x += 0.05
  k.cyl(housing, 0.046, 0.075, [x + 0.0375, 0, 0], 'x', 32)
  k.cyl(housing, 0.049, 0.022, [x + 0.075 + 0.011, 0, 0], 'x', 32)
  k.torus(housing, 0.049, 0.0025, [x + 0.075 + 0.003, 0, 0], 'x', 6, 32)
  const xc = x + 0.097
  k.disc('glass', 0.03, [xc + 0.0005, 0, 0], 'x', 28)
  for (const [y, z] of [[0.012, -0.012], [0.012, 0], [0.012, 0.012]] as const) k.disc('lampLens', 0.0035, [xc + 0.001, y, z], 'x', 12)
  // two cable entries underneath: gland and stopping plug
  for (const [z, gland] of [[-0.022, true], [0.022, false]] as const) {
    k.cyl(housing, 0.012, 0.012, [x + 0.04, -0.046, z], 'y', 12)
    if (gland) {
      k.hex('brass', 0.026, 0.018, [x + 0.04, -0.06, z], 'y')
      k.cyl('rubberBlack', 0.008, 0.012, [x + 0.04, -0.074, z], 'y', 10)
    } else k.hex(SS, 0.024, 0.01, [x + 0.04, -0.057, z], 'y')
  }
  k.box('nameplate', [0.05, 0.002, 0.03], [x + 0.04, 0.0465, 0])
  tagPlate(k, tag, [x + 0.0375, 0, 0.0468], 'z', 0.05)
}
