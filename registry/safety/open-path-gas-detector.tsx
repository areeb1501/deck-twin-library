// Open-path IR gas detector: transmitter and receiver heads on pan/tilt alignment mounts facing each other across the path, each on a stanchion or wall bracket. IEC 60079-29-4.
import * as THREE from 'three'
import { Kit } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { LED_GREEN, LENS, cableToDeck, faceZ, mounted, stopPlug, type Mount } from './_fg'

export interface OpenPathGasDetectorProps {
  mount?: Mount
  /** stanchion-to-stanchion (or wall-to-wall) distance, m */
  separation?: number
  /** optical axis above the deck, m */
  height?: number
  beam?: boolean
  tag?: string
}

export const defaults = { mount: 'pole' as Mount, separation: 20, height: 1.0, beam: true, tag: 'OGD-1101' }

const BEAM = paint('#ff5a3c', { emissive: '#ff3b20', emissiveIntensity: 0.8, transparent: true, opacity: 0.35, roughness: 0.5 })
const HEAD = 0.535 // bracket face to hood rim along the optical axis, m

export function OpenPathGasDetector(props: OpenPathGasDetectorProps & GroupProps) {
  const { mount, separation, height, beam, tag, ...group } = { ...defaults, ...props }
  const sep = Math.max(2, Math.min(120, separation))
  const h = Math.max(0.5, height)
  const data = useKit((k) => build(k, mount, sep, h, tag), [mount, sep, h, tag])
  const ray = useKit((k) => {
    const L = sep - 2 * (faceZ(mount) + 0.5005)
    if (beam && L > 0.1) k.cyl(BEAM, 0.004, L, [0, h, 0], 'x', 8)
  }, [mount, sep, h, beam])
  return (
    <group {...group}>
      <KitMesh data={data} />
      <KitMesh data={ray} shadows={false} />
    </group>
  )
}

export default OpenPathGasDetector

function build(k: Kit, mount: Mount, sep: number, h: number, tag: string) {
  for (const side of [-1, 1] as const) {
    // each unit's +Z faces the other end: transmitter at -X, receiver at +X
    const m = new THREE.Matrix4().makeTranslation(side * (sep / 2), 0, 0).multiply(new THREE.Matrix4().makeRotationY(-side * (Math.PI / 2)))
    k.with(m, () => {
      const face = mounted(k, mount, h, [0.14, 0.3], () => head(k, side < 0), h + 0.2)
      tagPlate(k, `${tag} ${side < 0 ? 'TX' : 'RX'}`, [0, h - 0.125, face + 0.001], 'z', 0.1)
      cableToDeck(k, mount, [0, h - 0.06, face + 0.12])
    })
  }
}

/** Optical head along +Z on a pan/tilt mount hung below the axis; origin on the bracket face, axis at y = 0. */
function head(k: Kit, tx: boolean) {
  k.box('stainless', [0.06, 0.012, 0.2], [0, -0.105, 0.108])
  k.box('stainless', [0.06, 0.06, 0.012], [0, -0.08, 0.006])
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.hex('nut', 0.012, 0.006, [sx * 0.022, -0.08 + sy * 0.022, 0.015], 'z')
  k.cyl('stainless', 0.03, 0.02, [0, -0.09, 0.24], 'y', 18)
  k.box('stainless', [0.1, 0.012, 0.07], [0, -0.074, 0.24])
  for (const s of [-1, 1]) {
    k.box('stainless', [0.008, 0.06, 0.06], [s * 0.05, -0.045, 0.24])
    k.hex('nut', 0.022, 0.012, [s * 0.058, -0.03, 0.24], 'x')
    k.rod('stainless', [s * 0.035, -0.068, 0.205], [s * 0.035, -0.068, 0.14], 0.005, 8)
    k.cyl('nut', 0.012, 0.016, [s * 0.035, -0.068, 0.135], 'z', 10)
  }
  k.box('stainless', [0.05, 0.016, 0.16], [0, -0.066, 0.29])
  // head: yellow rear cap, stainless barrel with band clamps, front flange, hood and lens
  k.cyl('actuatorYellow', 0.064, 0.05, [0, 0, 0.165], 'z', 28)
  k.cyl('stainless', 0.06, 0.3, [0, 0, 0.34], 'z', 28)
  for (const z of [0.24, 0.34]) k.torus('stainless', 0.062, 0.006, [0, 0, z], 'z', 6, 28)
  k.cyl('stainless', 0.066, 0.02, [0, 0, 0.49], 'z', 28)
  k.lathe('actuatorYellow', [[0.066, 0.5], [0.072, 0.5], [0.072, HEAD], [0.066, HEAD], [0.066, 0.5]], [0, 0, 0], 'z', 28)
  k.disc(LENS, 0.062, [0, 0, 0.5005], 'z', 28)
  k.torus('stainless', 0.04, 0.0022, [0, 0, 0.501], 'z', 6, 28)
  k.torus('stainless', 0.022, 0.0018, [0, 0, 0.501], 'z', 6, 24)
  k.dome(tx ? 'lampLens' : LENS, 0.012, [0, 0, 0.5005], 'z', Math.PI / 2, 0.5, 14)
  // alignment sight on top, status LED, rear cable gland
  k.cyl('stainless', 0.008, 0.09, [0, 0.072, 0.36], 'z', 10)
  k.box('stainless', [0.012, 0.012, 0.03], [0, 0.064, 0.36])
  k.sphere(LED_GREEN, 0.006, [0.04, 0.03, 0.14], undefined, 8)
  k.hex('brass', 0.03, 0.02, [0, -0.02, 0.13], 'z')
  stopPlug(k, [0, 0.03, 0.137], '-z')
  k.spline('cable', [[0, -0.02, 0.12], [0, -0.04, 0.115], [0, -0.06, 0.12]], 0.0065, 6, 10)
}
