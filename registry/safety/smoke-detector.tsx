// Optical smoke detector: white head on a mounting base and conduit back box, fixed to the ceiling or under steelwork on a drop rod, with remote indicator LED. EN 54-7.
import * as THREE from 'three'
import { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { LED_RED, WHITE, cable, stopPlug } from './_fg'

export interface SmokeDetectorProps {
  /** steel or ceiling to the detector base, m (0 = flush on the ceiling); origin on the ceiling, detector hangs below */
  drop?: number
  /** head lit (alarm) */
  alarm?: boolean
  tag?: string
}

export const defaults = { drop: 0, alarm: false, tag: 'SD-9101' }

export function SmokeDetector(props: SmokeDetectorProps & GroupProps) {
  const { drop, alarm, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, Math.max(0, drop), alarm, tag), [drop, alarm, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SmokeDetector

function build(k: Kit, drop: number, alarm: boolean, tag: string) {
  if (drop > 0.02) {
    // beam clamp, drop rod and plate when hung under steel
    k.box('galvanised', [0.12, 0.012, 0.08], [0, -0.006, 0])
    for (const s of [-1, 1]) k.hex('nut', 0.022, 0.012, [s * 0.04, -0.018, 0], 'y')
    k.cyl('galvanised', 0.008, drop, [0, -drop / 2, 0], 'y', 10)
    k.hex('nut', 0.02, 0.01, [0, -drop + 0.012, 0], 'y')
    k.box('galvanised', [0.14, 0.006, 0.14], [0, -drop + 0.003, 0])
  }
  const y = -drop - (drop > 0.02 ? 0.006 : 0)
  // steel conduit back box with entries (one conduit, one stopping plug)
  k.cyl('galvanised', 0.045, 0.035, [0, y - 0.0175, 0], 'y', 24)
  k.cyl('galvanised', 0.012, 0.03, [0.055, y - 0.0175, 0], 'x', 10)
  stopPlug(k, [-0.047, y - 0.0175, 0], '-x', 0.022)
  k.tube('galvanised', [[0.07, y - 0.0175, 0], [0.12, y - 0.0175, 0], [0.12, -0.012, 0], [0.12, -0.012, -0.3]], 0.01, 8, 0.03)
  // mounting base, head, smoke entry vents, dome
  const yb = y - 0.035
  k.cyl(WHITE, 0.062, 0.016, [0, yb - 0.008, 0], 'y', 32)
  k.cyl(WHITE, 0.053, 0.026, [0, yb - 0.029, 0], 'y', 32)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    k.box('rubberBlack', [0.004, 0.014, 0.01], [Math.cos(a) * 0.0525, yb - 0.029, Math.sin(a) * 0.0525], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
  }
  k.dome(WHITE, 0.053, [0, yb - 0.042, 0], '-y', Math.PI / 2, 0.42, 28)
  k.sphere(alarm ? LED_RED : 'plasticGrey', 0.0045, [0.03, yb - 0.06, 0], undefined, 8)
  // remote indicator next to the detector
  k.rbox(WHITE, [0.05, 0.03, 0.08], 0.004, [0.18, -0.015, 0])
  k.sphere(alarm ? LED_RED : 'plasticGrey', 0.007, [0.18, -0.03, 0.02], undefined, 8)
  cable(k, [[0.18, -0.002, -0.03], [0.18, -0.006, -0.1], [0.14, -0.012, -0.2]], 0.004)
  tagPlate(k, tag, [0.18, -0.015, 0.0405], 'z', 0.044)
}
