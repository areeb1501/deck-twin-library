// Hydrogen detector for battery rooms, UPS rooms and electrolysers: round Ex d head on a stainless angle bracket, catalytic sinter or MEMS sensor pointing down with a collector cone for lighter-than-air gas; under the ceiling on a drop rod, or on a wall near the top. IEC 60079-29-1, IEC 60079-29-2, IEC 60079-1.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { LED_GREEN, cable, cableToDeck, mounted, stopPlug } from './_fg'
import { ceilingMount } from './_detectors'

export interface HydrogenDetectorProps {
  /** ceiling: origin on the ceiling or steel underside, head hangs below; wall: origin on the deck at the wall */
  mount?: 'ceiling' | 'wall'
  /** drop rod length under the ceiling, m */
  drop?: number
  /** wall mount: head centre above the deck, m (within 0.3 m of the ceiling for H2) */
  height?: number
  /** catalytic pellistor behind a sinter, or MEMS thermal-conductivity sensor behind a PTFE membrane */
  sensor?: 'catalytic' | 'mems'
  /** inverted collector cone round the sensor */
  collector?: boolean
  tag?: string
}

export const defaults = { mount: 'ceiling' as 'ceiling' | 'wall', drop: 0.15, height: 2.7, sensor: 'catalytic' as 'catalytic' | 'mems', collector: true, tag: 'GDH-8401' }

const BODY = paint('#c9cdd0', { metalness: 0.55, roughness: 0.35 })
const R = 0.06 // head radius, m (typical)
const D = 0.085 // head depth, m (typical)

export function HydrogenDetector(props: HydrogenDetectorProps & GroupProps) {
  const { mount, drop, height, sensor, collector, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, mount, Math.max(0, drop), Math.max(0.8, height), sensor, collector, tag), [mount, drop, height, sensor, collector, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default HydrogenDetector

/** Round Ex d head, back on z = 0 at the origin, lid facing +Z, sensor down. Returns the gland tail. */
function head(k: Kit, sensor: 'catalytic' | 'mems', collector: boolean, tag: string): V3 {
  const zc = D / 2
  for (const s of [-1, 1]) {
    k.box(BODY, [0.03, 0.026, 0.012], [s * (R + 0.008), 0.02, 0.006])
    k.hex('nut', 0.015, 0.008, [s * (R + 0.012), 0.02, 0.016], 'z')
  }
  k.cyl(BODY, R, D * 0.7, [0, 0, D * 0.35], 'z', 40)
  k.cyl(BODY, R + 0.005, 0.01, [0, 0, D * 0.7], 'z', 40)
  k.cyl(BODY, R - 0.002, D * 0.3 - 0.005, [0, 0, D * 0.85 + 0.0025], 'z', 40)
  k.torus(BODY, R - 0.006, 0.004, [0, 0, D], 'z', 6, 36)
  // lid lock screw, earth stud, LED window, tag on the lid
  k.cyl('nut', 0.0045, 0.012, [R - 0.002, -0.03, D * 0.72], 'x', 8)
  k.cyl('brass', 0.004, 0.02, [-R - 0.008, 0.02, D * 0.4], 'x', 8)
  k.cyl('stainless', 0.009, 0.004, [0, 0.032, D + 0.002], 'z', 16)
  k.sphere(LED_GREEN, 0.005, [0, 0.032, D + 0.003], undefined, 10)
  tagPlate(k, tag, [0, -0.008, D + 0.001], 'z', 0.08)
  // side cable entry with gland, opposite entry plugged
  k.cyl(BODY, 0.014, 0.012, [R + 0.004, -0.02, zc], 'x', 14)
  k.hex('brass', 0.03, 0.014, [R + 0.017, -0.02, zc], 'x')
  k.cyl('brass', 0.011, 0.016, [R + 0.031, -0.02, zc], 'x', 12)
  k.cyl(BODY, 0.014, 0.012, [-R - 0.004, -0.02, zc], 'x', 14)
  stopPlug(k, [-R - 0.011, -0.02, zc], '-x')
  // sensor boss on the underside
  const yb = -R
  k.cyl(BODY, 0.02, 0.016, [0, yb - 0.002, zc], 'y', 20)
  k.hex('stainless', 0.044, 0.012, [0, yb - 0.016, zc], 'y')
  const ys = yb - 0.022
  if (sensor === 'catalytic') {
    k.cyl('stainless', 0.022, 0.04, [0, ys - 0.02, zc], 'y', 28)
    k.torus('stainless', 0.0222, 0.0015, [0, ys - 0.012, zc], 'y', 4, 28)
    k.cyl('brass', 0.017, 0.006, [0, ys - 0.043, zc], 'y', 24)
    k.disc('castIron', 0.012, [0, ys - 0.0461, zc], '-y', 20)
  } else {
    k.cyl('stainless', 0.02, 0.03, [0, ys - 0.015, zc], 'y', 28)
    k.cyl('stainless', 0.023, 0.006, [0, ys - 0.033, zc], 'y', 28)
    k.disc('plasticGrey', 0.016, [0, ys - 0.0362, zc], '-y', 24)
    k.disc(paint('#f4f4f1', { roughness: 0.8, weather: 0 }), 0.014, [0, ys - 0.0363, zc], '-y', 24)
  }
  if (collector) {
    // hollow collector cone open downwards, clamped to the sensor body, calibration spout
    k.lathe('plasticGrey', [[0.024, 0], [0.024, 0.012], [0.065, 0.06], [0.065, 0.064], [0.061, 0.064], [0.021, 0.016], [0.021, 0]], [0, ys - 0.004, zc], '-y', 40)
    k.cyl('plasticGrey', 0.004, 0.02, [0.045, ys - 0.045, zc], [0.8, -0.6, 0], 10)
    k.cyl('actuatorRed', 0.006, 0.01, [0.054, ys - 0.052, zc], [0.8, -0.6, 0], 12)
  }
  return [R + 0.04, -0.02, zc]
}

function build(k: Kit, mount: 'ceiling' | 'wall', drop: number, height: number, sensor: 'catalytic' | 'mems', collector: boolean, tag: string) {
  if (mount === 'ceiling') {
    const y0 = ceilingMount(k, drop, [0.12, 0.12])
    // stainless angle bracket: top flange bolted to the plate, leg down carrying the head
    const leg = 0.2
    const zb = -0.05
    k.box('stainless', [0.1, 0.006, 0.07], [0, y0 - 0.003, zb + 0.035])
    k.box('stainless', [0.18, leg, 0.006], [0, y0 - leg / 2, zb + 0.003])
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape().moveTo(0, 0).lineTo(0.05, 0).lineTo(0, -0.05).closePath()
      k.extrude('stainless', sh, 0.005, new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(s * 0.045 + 0.0025, y0 - 0.006, zb + 0.006))
    }
    const yh = y0 - leg / 2 - 0.02
    let g: V3 = [0, 0, 0]
    k.at([0, yh, zb + 0.006], undefined, () => (g = head(k, sensor, collector, tag)))
    const p: V3 = [g[0], g[1] + yh, g[2] + zb + 0.006]
    // cable back along the bracket leg, cleated up the drop rod into the ceiling
    const xr = 0.016
    cable(k, [p, [p[0] + 0.025, p[1] + 0.005, p[2]], [0.105, yh + 0.03, zb - 0.01], [0.105, yh + 0.06, zb - 0.01]])
    k.tube('cable', [[0.105, yh + 0.06, zb - 0.01], [0.105, y0 - 0.02, zb - 0.01], [0.075, y0 - 0.02, -0.012], [0.075, y0 + 0.04, -0.012], [xr, y0 + 0.07, -0.012], [xr, 0, -0.012]], 0.0065, 6, 0.03)
    for (let y = y0 + 0.06; y < -0.04; y += 0.15) k.torus('stainless', 0.017, 0.002, [0.006, y, -0.004], 'y', 4, 16)
    return
  }
  let g: V3 = [0, 0, 0]
  const zf = mounted(k, 'wall', height, [0.18, 0.12], () => (g = head(k, sensor, collector, tag)))
  cableToDeck(k, 'wall', [g[0], g[1] + height, g[2] + zf])
}
