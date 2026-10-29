// Rupture (bursting) disc assembly: insert-type holder between ASME B16.5 flanges with a reverse-acting domed disc, stamped disc tag and burst-indicator sensor.
import * as THREE from 'three'
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { tagMaterial } from '../lib/textures'
import { flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { boltHole, seg, waferFlanges } from './_flanges'

export interface RuptureDiscProps {
  /** nominal size, inches */
  nps?: number
  rating?: Rating
  /** marked burst pressure, barg */
  burst?: number
  /** draw the companion weld-neck flanges and through studs */
  flanges?: boolean
  /** burst indicator sensor with Ex connector and cable tail */
  indicator?: boolean
  tag?: string
}

export const defaults = { nps: 3, rating: 300 as Rating, burst: 42, flanges: true, indicator: true, tag: 'PSE-1101' }

/** typical insert holder: OD inside the bolts, total thickness from the bore. */
function holder(nps: number, rating: Rating) {
  const f = flangeDims(nps, rating)
  const od = f.boltCircle - boltHole(f.boltDia) - 0.004
  const w = Math.max(0.03, pipeOD(nps) * 0.28 + 0.018)
  return { f, od, w }
}

// Ports are the holder faces: A inlet (process), B outlet (relief); the line flanges bolt straight onto them.
export function ports(p: RuptureDiscProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const { w } = holder(nps, rating)
  return [port('A', 'Inlet (process side)', [-w / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Outlet (vent side)', [w / 2, 0, 0], [1, 0, 0], nps, rating, 'relief')]
}

export function RuptureDisc({ nps = defaults.nps, rating = defaults.rating, burst = defaults.burst, flanges = defaults.flanges, indicator = defaults.indicator, tag = defaults.tag, ...group }: RuptureDiscProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, burst, flanges, indicator, tag), [nps, rating, burst, flanges, indicator, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default RuptureDisc

function build(k: Kit, nps: number, rating: Rating, burst: number, flanges: boolean, indicator: boolean, tag: string) {
  const { od, w } = holder(nps, rating)
  const ri = pipeOD(nps) / 2 - pipeWall(nps, '40')
  const R = od / 2
  const n = seg(od)
  const xi = -w * 0.12 // disc seat between inlet and outlet holder
  // inlet holder (bevelled seat) and outlet holder, with the parting line and cap screws
  k.lathe('stainless', [[ri, -w / 2], [R - 0.002, -w / 2], [R, -w / 2 + 0.002], [R, xi - 0.0008], [R - 0.0015, xi]], [0, 0, 0], 'x', n)
  k.lathe('stainless', [[R - 0.0015, xi + 0.0012], [R, xi + 0.002], [R, w / 2 - 0.002], [R - 0.002, w / 2], [ri, w / 2]], [0, 0, 0], 'x', n)
  k.lathe('pipeBore', [[ri, w / 2], [ri, xi + 0.0012], [ri, xi - 0.0008], [ri, -w / 2]], [0, 0, 0], 'x', n)
  k.lathe('rubberBlack', [[R - 0.0015, xi], [R - 0.0015, xi + 0.0012]], [0, 0, 0], 'x', n)
  const ns = nps <= 2 ? 4 : 6
  for (let i = 0; i < ns; i++) {
    const a = (i / ns) * Math.PI * 2 + 0.3
    const r = R - Math.max(0.008, (R - ri) * 0.35)
    k.cyl('nut', 0.0045, 0.004, [w / 2 + 0.001, Math.sin(a) * r, Math.cos(a) * r], 'x', 10)
  }
  // reverse-acting disc: dome convex towards the inlet, with its flat seat ring
  const dh = ri * 0.32
  const rs = (ri * ri + dh * dh) / (2 * dh)
  const th = Math.asin(ri / rs)
  const dome = new THREE.SphereGeometry(rs, n, 12, 0, Math.PI * 2, 0, th)
  k.add('machined', dome, new THREE.Matrix4().compose(new THREE.Vector3(xi + rs - dh, 0, 0), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)), new THREE.Vector3(1, 1, 1)))
  k.add('machined', dome.clone(), new THREE.Matrix4().compose(new THREE.Vector3(xi + rs - dh + 0.0006, 0, 0), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)), new THREE.Vector3(1, 1, 1)))
  // stamped disc tag projecting above the flanges between the holder halves
  const f = flangeDims(nps, rating)
  const tagH = Math.max(0.05, f.od / 2 - R + 0.05)
  const tw = Math.min(0.08, Math.max(0.05, od * 0.4))
  k.box('stainless', [0.0012, tagH, tw * 0.35], [xi + 0.0006, R + tagH / 2 - 0.004, 0])
  const plate = Math.min(0.09, tw * 1.4)
  const yT = R + tagH + plate * 0.16
  k.box('stainless', [0.0015, plate * 0.34, plate], [xi + 0.0006, yT, 0])
  const label = `${tag} ${burst} BARG ↑FLOW→`
  for (const s of [-1, 1]) k.plane(tagMaterial(label), plate * 0.92, plate * 0.29, [xi + 0.0006 + s * 0.0009, yT, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (s * Math.PI) / 2))
  if (indicator) {
    // burst sensor: Ex connector on the outlet holder rim with its gland and field cable tail
    const y0 = -R
    k.cyl('stainless', 0.009, 0.022, [w * 0.25, y0 - 0.011, 0], 'y', 16)
    k.hex('brass', 0.022, 0.012, [w * 0.25, y0 - 0.028, 0], 'y')
    k.spline('cable', [[w * 0.25, y0 - 0.034, 0], [w * 0.25, y0 - 0.09, 0.01], [w * 0.25 + 0.03, y0 - 0.16, 0.06], [w * 0.25 + 0.05, y0 - 0.2, 0.14]], 0.0035, 6, 24)
  }
  if (flanges) waferFlanges(k, nps, rating, w, '40', 0.1)
}
