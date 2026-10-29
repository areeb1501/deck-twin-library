// IR3 flame detector: Ex d housing with three IR windows and BIT lamp, weather hood, on a ball-swivel mount aimed by tilt and pan, on a stanchion or wall bracket. EN 54-10, FM 3260.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { LED_GREEN, LENS, cableToDeck, deg, mounted, stopPlug, type Mount } from './_fg'

export interface FlameDetectorProps {
  mount?: Mount
  /** swivel pivot above the deck, m */
  height?: number
  /** aim below horizontal, degrees */
  tilt?: number
  /** aim about the vertical, degrees (0 = +Z, positive turns towards +X) */
  pan?: number
  hood?: boolean
  tag?: string
}

export const defaults = { mount: 'pole' as Mount, height: 2.5, tilt: 20, pan: 0, hood: true, tag: 'FD-2105' }

export function FlameDetector(props: FlameDetectorProps & GroupProps) {
  const { mount, height, tilt, pan, hood, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, mount, Math.max(0.8, height), tilt, mount === 'wall' ? Math.max(-70, Math.min(70, pan)) : pan, hood, tag), [mount, height, tilt, pan, hood, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default FlameDetector

function build(k: Kit, mount: Mount, height: number, tilt: number, pan: number, hood: boolean, tag: string) {
  const ballZ = 0.06
  let gland = new THREE.Vector3()
  const zf = mounted(k, mount, height, [0.1, 0.18], () => {
    // swivel arm, clamp block and ball joint
    k.box('stainless', [0.05, 0.05, 0.014], [0, 0, 0.007])
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.hex('nut', 0.012, 0.006, [sx * 0.018, sy * 0.018, 0.017], 'z')
    k.rod('stainless', [0, 0, 0.014], [0, 0, ballZ], 0.013, 12)
    k.sphere('stainless', 0.021, [0, 0, ballZ], undefined, 14)
    k.cyl('stainless', 0.026, 0.012, [0, 0, ballZ - 0.012], 'z', 12)
    k.hex('nut', 0.022, 0.012, [0.028, 0, ballZ - 0.012], 'x')
    tagPlate(k, tag, [0, -0.07, 0.001], 'z', 0.08)
    const F = new THREE.Matrix4()
      .makeTranslation(0, 0, ballZ)
      .multiply(new THREE.Matrix4().makeRotationY(deg(pan)))
      .multiply(new THREE.Matrix4().makeRotationX(deg(tilt)))
    k.with(F, () => {
      k.rod('stainless', [0, 0, 0], [0, 0.024, 0], 0.01, 10)
      k.hex('nut', 0.03, 0.012, [0, 0.01, 0], 'y')
      k.box('stainless', [0.05, 0.012, 0.08], [0, 0.026, 0.015])
      k.with(new THREE.Matrix4().makeTranslation(0, 0.097, -0.06), () => housing(k, hood))
    })
    gland = new THREE.Vector3(0, 0.097 - 0.082, -0.02).applyMatrix4(F)
  })
  const g: V3 = [gland.x, gland.y + height, gland.z + zf]
  cableToDeck(k, mount, g)
}

/** Housing along +Z from z = 0 (rear) to the window at z ≈ 0.15. */
function housing(k: Kit, hood: boolean) {
  k.cyl('actuatorRed', 0.058, 0.02, [0, 0, 0.01], 'z', 24)
  k.cyl('actuatorRed', 0.065, 0.11, [0, 0, 0.075], 'z', 28)
  k.torus('actuatorRed', 0.065, 0.004, [0, 0, 0.03], 'z', 6, 28)
  k.cyl('stainless', 0.068, 0.018, [0, 0, 0.139], 'z', 28)
  k.disc(LENS, 0.058, [0, 0, 0.1485], 'z', 28)
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3
    const p: V3 = [Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.149]
    k.cyl('stainless', 0.015, 0.004, p, 'z', 16)
    k.dome(LENS, 0.012, [p[0], p[1], 0.151], 'z', Math.PI / 2, 0.55, 14)
  }
  k.sphere(LED_GREEN, 0.006, [0, 0, 0.151], undefined, 10)
  k.dome('glass', 0.054, [0, 0, 0.149], 'z', Math.PI / 2, 0.22, 24)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    k.hex('nut', 0.01, 0.005, [Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.1505], 'z')
  }
  // weather hood over the top of the window (sunshade)
  if (hood) {
    k.lathe('actuatorRed', [[0.07, 0.1], [0.075, 0.1], [0.075, 0.205], [0.07, 0.205], [0.07, 0.1]], [0, 0, 0], 'z', 20, 0.4 * Math.PI, 1.2 * Math.PI)
    // close the two cut edges of the hood shell
    for (const phi of [0.4 * Math.PI, 1.6 * Math.PI]) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(-Math.cos(phi), Math.sin(phi)))
      k.box('actuatorRed', [0.005, 0.0016, 0.105], [0.0725 * Math.sin(phi), -0.0725 * Math.cos(phi), 0.1525], q)
    }
  }
  k.box('nameplate', [0.002, 0.03, 0.05], [0.066, 0, 0.075])
  k.hex('brass', 0.03, 0.02, [0, -0.072, 0.04], 'y')
  stopPlug(k, [0, -0.068, 0.1], '-y')
  k.hex('brass', 0.012, 0.006, [-0.068, 0, 0.03], 'x')
}
