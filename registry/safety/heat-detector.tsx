// Ex d heat detector (fixed temperature / rate of rise): red flameproof head with finned element and guard, hung under steelwork on a beam clamp and drop rod, or on a wall bracket. EN 54-5, IEC 60079-1.
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { LED_RED, cable, stopPlug } from './_fg'

export interface HeatDetectorProps {
  /** ceiling: origin on the underside of the steel above, head hangs below; wall: origin on the wall at deck level */
  mount?: 'ceiling' | 'wall'
  /** ceiling: steel to the head, m; wall: head above the deck, m */
  drop?: number
  /** operating temperature, °C (shown on the head label) */
  rating?: number
  tag?: string
}

export const defaults = { mount: 'ceiling' as 'ceiling' | 'wall', drop: 0.3, rating: 78, tag: 'HD-2101' }

export function HeatDetector(props: HeatDetectorProps & GroupProps) {
  const { mount, drop, rating, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, mount, Math.max(0.12, drop), rating, tag), [mount, drop, rating, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default HeatDetector

/** Head with its mounting face at `p` (top), element pointing down. */
function head(k: Kit, p: V3) {
  const [x, y, z] = p
  k.box('stainless', [0.1, 0.008, 0.1], [x, y - 0.004, z])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.014, 0.006, [x + sx * 0.038, y - 0.011, z + sz * 0.038], 'y')
  k.cyl('actuatorRed', 0.045, 0.06, [x, y - 0.038, z], 'y', 28)
  k.cyl('actuatorRed', 0.048, 0.014, [x, y - 0.075, z], 'y', 28)
  k.hex('stainless', 0.04, 0.014, [x, y - 0.089, z], 'y')
  // finned sensing element inside an open guard cage
  k.cyl('stainless', 0.009, 0.06, [x, y - 0.12, z], 'y', 10)
  for (let i = 0; i < 5; i++) k.cyl('stainless', 0.027, 0.003, [x, y - 0.104 - i * 0.009, z], 'y', 18)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    k.rod('castIron', [x + Math.cos(a) * 0.034, y - 0.096, z + Math.sin(a) * 0.034], [x + Math.cos(a) * 0.034, y - 0.156, z + Math.sin(a) * 0.034], 0.0025, 6)
  }
  k.torus('castIron', 0.034, 0.003, [x, y - 0.156, z], 'y', 6, 20)
  k.rod('castIron', [x - 0.034, y - 0.156, z], [x + 0.034, y - 0.156, z], 0.0025, 6)
  k.sphere(LED_RED, 0.005, [x - 0.03, y - 0.062, z + 0.036], undefined, 8)
  // cable entries: gland and stopping plug on the sides
  k.hex('brass', 0.028, 0.018, [x + 0.054, y - 0.038, z], 'x')
  stopPlug(k, [x - 0.047, y - 0.038, z], '-x')
}

function build(k: Kit, mount: 'ceiling' | 'wall', drop: number, rating: number, tag: string) {
  if (mount === 'ceiling') {
    // beam clamp on a flange under the steel, 1/2" drop rod, plate and head
    k.box('galvanised', [0.12, 0.012, 0.08], [0, -0.006, 0])
    for (const s of [-1, 1]) {
      k.box('galvanised', [0.02, 0.03, 0.08], [s * 0.065, 0.003, 0])
      k.box('galvanised', [0.03, 0.006, 0.08], [s * 0.065 - s * 0.012, 0.015, 0])
      k.hex('nut', 0.022, 0.012, [s * 0.04, -0.018, 0], 'y')
    }
    k.cyl('galvanised', 0.008, drop, [0, -drop / 2, 0], 'y', 10)
    for (const y of [-0.025, -drop + 0.02]) k.hex('nut', 0.02, 0.01, [0, y, 0], 'y')
    head(k, [0, -drop, 0])
    cable(k, [[0.064, -drop - 0.038, 0], [0.09, -drop - 0.03, 0], [0.1, -drop * 0.5, 0], [0.1, -0.03, 0], [0.1, -0.005, -0.1]])
    tagPlate(k, `${tag} ${rating}°C`, [0, -drop - 0.03, 0.0465], 'z', 0.07)
  } else {
    // wall bracket: angle bracket off the wall, head hanging under its shelf
    const y = drop
    k.box('stainless', [0.1, 0.16, 0.008], [0, y, 0.004])
    for (const sy of [-1, 1]) k.hex('nut', 0.016, 0.008, [0, y + sy * 0.06, 0.012], 'z')
    k.box('stainless', [0.1, 0.008, 0.14], [0, y + 0.076, 0.07])
    for (const s of [-1, 1]) k.box('stainless', [0.006, 0.07, 0.006], [s * 0.045, y + 0.04, 0.1])
    head(k, [0, y + 0.072, 0.09])
    cable(k, [[0.064, y + 0.034, 0.09], [0.09, y + 0.02, 0.09], [0.08, y - 0.1, 0.02], [0.07, 0.05, 0.012], [0.07, 0.01, 0.15]])
    tagPlate(k, `${tag} ${rating}°C`, [0, y - 0.03, 0.009], 'z', 0.08)
  }
}
