// Ultrasonic gas leak detector: 316 stainless Ex d housing on a swivel arm, microphone pointing down in a foam windscreen under a rain hood (or a four-sensor array in guard tubes), self-test transducer; stanchion or wall. IEC 60079-1, IEC 60079-11, ISA TR84.00.07.
import * as THREE from 'three'
import { Kit, mat4, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { LED_GREEN, cableToDeck, mounted, stopPlug, type Mount } from './_fg'
import { tagBracket } from './_detectors'

export interface AcousticGasLeakDetectorProps {
  mount?: Mount
  /** housing centre above the deck, m */
  height?: number
  /** four-sensor array instead of a single microphone */
  array?: boolean
  /** turn of the swivel arm about the bracket, ° (0 = straight out along +Z) */
  swivel?: number
  tag?: string
}

export const defaults = { mount: 'pole' as Mount, height: 2.5, array: false, swivel: 0, tag: 'GDU-2201' }

const FOAM = paint('#2c2f33', { metalness: 0, roughness: 1, clearcoat: 0, weather: 0 })
const R = 0.07 // housing radius, m (typical)
const H = 0.2 // housing height, m (typical)
const ARM = 0.16 // bracket face to housing axis, m

export function AcousticGasLeakDetector(props: AcousticGasLeakDetectorProps & GroupProps) {
  const { mount, height, array, swivel, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(0.8, height)
  const data = useKit((k) => build(k, mount, h, array, swivel, tag), [mount, h, array, swivel, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default AcousticGasLeakDetector

/** Microphone barrel pointing down from (x, y, z): stainless sensor, foam windscreen, optional rain hood. */
function microphone(k: Kit, p: V3, hood: boolean, r = 0.024) {
  const [x, y, z] = p
  k.hex('stainless', r * 2.3, 0.014, [x, y - 0.007, z], 'y')
  k.cyl('stainless', r, 0.07, [x, y - 0.049, z], 'y', 24)
  for (const dy of [0.03, 0.06]) k.torus('stainless', r + 0.0005, 0.0015, [x, y - dy, z], 'y', 4, 24)
  // open-cell foam windscreen over the capsule
  k.cyl(FOAM, r + 0.012, 0.05, [x, y - 0.1, z], 'y', 28)
  k.dome(FOAM, r + 0.012, [x, y - 0.125, z], '-y', Math.PI / 2, 0.55, 28)
  if (hood) {
    // hollow stainless rain hood clamped to the barrel
    k.lathe('stainless', [[r + 0.002, 0], [r + 0.03, 0.03], [r + 0.03, 0.05], [r + 0.028, 0.05], [r + 0.028, 0.031], [r, 0.002]], [x, y - 0.04, z], '-y', 36)
    k.torus('stainless', r + 0.002, 0.003, [x, y - 0.04, z], 'y', 6, 24)
  }
}

function build(k: Kit, mount: Mount, h: number, array: boolean, swivel: number, tag: string) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (swivel * Math.PI) / 180)
  let gland: V3 = [0, 0, 0]
  const zf = mounted(k, mount, h, [0.16, 0.24], () => {
    // swivel bracket: base block on the plate, pivot pin, arm out to the housing clamp
    k.box('stainless', [0.08, 0.08, 0.016], [0, 0, 0.008])
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.hex('nut', 0.016, 0.008, [sx * 0.028, sy * 0.028, 0.02], 'z')
    k.box('stainless', [0.05, 0.05, 0.03], [0, 0, 0.031])
    k.cyl('stainless', 0.012, 0.07, [0, 0, 0.046], 'y', 16)
    k.hex('nut', 0.026, 0.012, [0, 0.041, 0.046], 'y')
    k.with(new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0.046), q, new THREE.Vector3(1, 1, 1)), () => {
      k.box('stainless', [0.03, 0.04, ARM - 0.046 - R], [0, 0, (ARM - 0.046 - R) / 2])
      const zc = ARM - 0.046
      // clamp band round the housing
      k.lathe('stainless', [[R, -0.02], [R + 0.006, -0.02], [R + 0.006, 0.02], [R, 0.02]], [0, 0, zc], 'y', 40)
      for (const s of [-1, 1]) k.hex('nut', 0.018, 0.012, [s * 0.012, 0, zc - R - 0.012], 'z')
      // 316 stainless Ex d housing: body, screwed top cover with flats, cover lock screw
      k.cyl('stainless', R, H, [0, 0, zc], 'y', 48)
      k.cyl('stainless', R + 0.006, 0.012, [0, H / 2 - 0.03, zc], 'y', 48)
      k.cyl('stainless', R - 0.002, 0.04, [0, H / 2 + 0.006, zc], 'y', 48)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        k.box('stainless', [0.012, 0.03, 0.006], [Math.cos(a) * (R - 0.001), H / 2 + 0.006, zc + Math.sin(a) * (R - 0.001)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2))
      }
      k.cyl('nut', 0.005, 0.01, [R + 0.008, H / 2 - 0.03, zc], 'x', 8)
      // status window with LED and nameplate on the front
      k.cyl('stainless', 0.018, 0.01, [0, 0.04, zc + R + 0.003], 'z', 20)
      k.disc('glass', 0.014, [0, 0.04, zc + R + 0.0085], 'z', 20)
      k.sphere(LED_GREEN, 0.006, [0, 0.04, zc + R + 0.004], undefined, 10)
      k.add('nameplate', new THREE.CylinderGeometry(R + 0.0008, R + 0.0008, 0.04, 24, 1, true, -0.45, 0.9), mat4([0, -0.02, zc]))
      // cable entries on the sides, low on the body
      k.cyl('stainless', 0.016, 0.014, [-R - 0.005, -H / 2 + 0.04, zc], 'x', 16)
      k.hex('brass', 0.032, 0.016, [-R - 0.019, -H / 2 + 0.04, zc], 'x')
      k.cyl('brass', 0.012, 0.018, [-R - 0.036, -H / 2 + 0.04, zc], 'x', 12)
      k.cyl('rubberBlack', 0.0085, 0.012, [-R - 0.05, -H / 2 + 0.04, zc], 'x', 10)
      k.cyl('stainless', 0.016, 0.014, [R + 0.005, -H / 2 + 0.04, zc], 'x', 16)
      stopPlug(k, [R + 0.012, -H / 2 + 0.04, zc], 'x')
      const yb = -H / 2
      if (array) {
        // four acoustic sensors on a square under the housing, each in a slotted guard tube
        k.cyl('stainless', R, 0.02, [0, yb - 0.01, zc], 'y', 48)
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + (i * Math.PI) / 2
          const x = Math.cos(a) * 0.04
          const z = zc + Math.sin(a) * 0.04
          k.cyl('stainless', 0.014, 0.08, [x, yb - 0.06, z], 'y', 20)
          k.lathe('stainless', [[0.016, 0], [0.019, 0], [0.019, 0.1], [0.016, 0.1]], [x, yb - 0.02, z], '-y', 24)
          k.disc(FOAM, 0.016, [x, yb - 0.105, z], '-y', 20)
          for (let j = 0; j < 4; j++) {
            const b = (j * Math.PI) / 2
            k.box('pipeBore', [0.006, 0.03, 0.0015], [x + Math.cos(b) * 0.0192, yb - 0.08, z + Math.sin(b) * 0.0192], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -b + Math.PI / 2))
          }
        }
      } else {
        k.cyl('stainless', 0.04, 0.012, [0, yb - 0.006, zc], 'y', 32)
        microphone(k, [0, yb - 0.012, zc], true)
        // self-test transducer beside the microphone
        k.cyl('stainless', 0.01, 0.05, [0.05, yb - 0.025, zc], 'y', 16)
        k.disc('castIron', 0.008, [0.05, yb - 0.0505, zc], '-y', 16)
        k.box('stainless', [0.03, 0.01, 0.016], [0.035, yb - 0.005, zc])
      }
      const g = new THREE.Vector3(-R - 0.056, yb + 0.04, zc).applyQuaternion(q)
      gland = [g.x, g.y + h, g.z + 0.046]
    })
  })
  // field cable: out of the side gland, loop back to the bracket and down
  cableToDeck(k, mount, [gland[0], gland[1], gland[2] + zf])
  tagBracket(k, mount, Math.max(0.3, h - 0.42), tag, 0.08)
}
