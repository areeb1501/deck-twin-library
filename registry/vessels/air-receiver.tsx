// Vertical air / nitrogen receiver on legs or a base ring: 2:1 heads, elliptical inspection manway with yoke, PSV, pressure gauge, timer auto-drain. ASME VIII-1.
import * as THREE from 'three'
import { Kit, mat4, type MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, liftingLug, nozzle } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { headDepth, nozzleStandout, pipeOD, shellThickness, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { at, deg, dirOf, earthBoss, holeR, legs, mateFlange, nameplate, projector, reliefValve, shell, shellNozzle, skirt, smallValve, type Hole, capNps } from './_vessel'

export interface AirReceiverProps {
  /** inside diameter, m */
  diameter?: number
  /** tangent-to-tangent height, m */
  height?: number
  /** design pressure, barg */
  pressure?: number
  rating?: Rating
  inletNps?: number
  outletNps?: number
  support?: 'legs' | 'base-ring'
  tag?: string
  paint?: MatKey
}

export const defaults = {
  diameter: 0.9,
  height: 2.0,
  pressure: 11,
  rating: 150 as Rating,
  inletNps: 2,
  outletNps: 2,
  support: 'legs' as 'legs' | 'base-ring',
  tag: 'V-4700',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

/** Nozzles kept in proportion to the shell (typical upper bounds). */
const fit = (p: P): P => ({ ...p, inletNps: capNps(p.inletNps, p.diameter * 0.35), outletNps: capNps(p.outletNps, p.diameter * 0.35) })

const A = { inlet: deg(180), outlet: deg(0), manway: deg(-90), gauge: deg(-128), drain: deg(-90) }

function layout(p: P) {
  const wall = shellThickness(p.pressure, p.diameter)
  const Ro = p.diameter / 2 + wall
  const bo = headDepth('2:1-ellipsoidal', p.diameter) + wall
  const so = (nps: number) => nozzleStandout(nps, p.rating)
  const e0 = bo + 0.72
  const e1 = e0 + p.height
  const yIn = e0 + Math.max(0.25, p.height * 0.18) // inlet low, outlet high on the opposite side: forces flow through the vessel
  const yOut = e1 - Math.max(0.25, p.height * 0.18)
  return { wall, Ro, bo, so, e0, e1, yIn, yOut }
}

export function ports(props: AirReceiverProps = {}): Port[] {
  const p = fit({ ...defaults, ...props } as P)
  const L = layout(p)
  return [
    port('inlet', 'Inlet', at(A.inlet, L.Ro + L.so(p.inletNps), L.yIn), dirOf(A.inlet), p.inletNps, p.rating),
    port('outlet', 'Outlet', at(A.outlet, L.Ro + L.so(p.outletNps), L.yOut), dirOf(A.outlet), p.outletNps, p.rating),
  ]
}

export function AirReceiver(props: AirReceiverProps & GroupProps) {
  const { diameter, height, pressure, rating, inletNps, outletNps, support, tag, paint, ...group } = { ...defaults, ...props }
  const p = fit({ diameter, height, pressure, rating, inletNps, outletNps, support, tag, paint } as P)
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default AirReceiver

function build(k: Kit, p: P) {
  const L = layout(p)
  const { Ro, bo, so, e0, e1 } = L
  const m = p.paint
  const proj = projector('y', [0, (e0 + e1) / 2, 0], p.height / 2, Ro, bo)
  const yMw = e0 + Math.min(0.45, p.height * 0.25)
  const yG = (e0 + e1) / 2
  const mwA = Math.min(0.2, Ro * 0.45) // elliptical opening half-width (≈ 12" × 16"), typical
  const holes: Hole[] = [
    { p: at(A.inlet, Ro, L.yIn), d: dirOf(A.inlet), r: holeR(p.inletNps) },
    { p: at(A.outlet, Ro, L.yOut), d: dirOf(A.outlet), r: holeR(p.outletNps) },
    { p: [0, e1 + bo, 0], d: [0, 1, 0], r: holeR(1) },
    { p: [0, e0 - bo, 0], d: [0, -1, 0], r: holeR(1) },
    { p: at(A.manway, Ro, yMw), d: dirOf(A.manway), r: mwA * 0.75 },
    { p: at(A.gauge, Ro, yG), d: dirOf(A.gauge), r: 0.01 },
  ]
  shell(k, { Ro, bo, e0, e1, mat: m, seg: 56, course: 2, holes })
  shellNozzle(k, { base: at(A.inlet, Ro, L.yIn), dir: dirOf(A.inlet), nps: p.inletNps, rating: p.rating, standout: so(p.inletNps), mat: m, proj })
  shellNozzle(k, { base: at(A.outlet, Ro, L.yOut), dir: dirOf(A.outlet), nps: p.outletNps, rating: p.rating, standout: so(p.outletNps), mat: m, proj })

  // elliptical manway: reinforcing ring, inward-opening cover, yoke (dog) and nut
  const d = dirOf(A.manway)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d))
  const ringG = new THREE.CylinderGeometry(1, 1, 0.07, 32, 1, true)
  const c = at(A.manway, Ro + 0.02, yMw)
  k.add(m, ringG.clone(), new THREE.Matrix4().compose(new THREE.Vector3(...c), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)), new THREE.Vector3(mwA * 0.75, 1, mwA)))
  k.add(m, new THREE.CylinderGeometry(1, 1, 0.03, 32), new THREE.Matrix4().compose(new THREE.Vector3(...at(A.manway, Ro + 0.01, yMw)), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)), new THREE.Vector3(mwA * 0.82, 1, mwA * 1.07)))
  k.add('equipmentPaintDark', new THREE.CylinderGeometry(1, 1, 0.02, 32), new THREE.Matrix4().compose(new THREE.Vector3(...at(A.manway, Ro + 0.035, yMw)), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)), new THREE.Vector3(mwA * 0.72, 1, mwA * 0.95)))
  k.box('flangeSteel', [0.05, mwA * 2.5, 0.04], at(A.manway, Ro + 0.08, yMw), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), A.manway))
  k.rod('boltXylan', at(A.manway, Ro + 0.03, yMw), at(A.manway, Ro + 0.13, yMw), 0.012, 8)
  k.hex('nut', 0.04, 0.025, at(A.manway, Ro + 0.11, yMw), d)

  // PSV on the top head, pressure gauge on a siphon, timer auto-drain under the bottom head
  const topF = nozzle(k, { base: [0, e1 + bo, 0], dir: [0, 1, 0], nps: 1, rating: p.rating, standout: so(1), mat: m, studs: false })
  const out = reliefValve(k, topF, p.rating, 'D', [1, 0, 0])
  const hub = mateFlange(k, 2, 150, out, [1, 0, 0])
  k.pipe('pipePaint', hub, [hub[0] + 0.1, hub[1], hub[2]], pipeOD(2), 0.004)
  const g0 = at(A.gauge, Ro, yG)
  k.pipe('stainless', g0, at(A.gauge, Ro + 0.12, yG), 0.021, 0.003)
  smallValve(k, at(A.gauge, Ro + 0.16, yG), dirOf(A.gauge), [0, 1, 0], 0.02)
  k.torus('stainless', 0.03, 0.006, at(A.gauge, Ro + 0.24, yG + 0.03), dirOf(A.gauge + Math.PI / 2), 6, 16)
  k.pipe('stainless', at(A.gauge, Ro + 0.2, yG), at(A.gauge, Ro + 0.27, yG), 0.016, 0.003)
  gauge(k, at(A.gauge, Ro + 0.3, yG), dirOf(A.gauge), 0.1, 'bar', p.pressure > 16 ? 25 : 16)
  const dF = nozzle(k, { base: [0, e0 - bo, 0], dir: [0, -1, 0], nps: 1, rating: p.rating, standout: so(1), mat: m })
  k.pipe('stainless', dF, [dF[0], dF[1] - 0.1, dF[2]], pipeOD(1), 0.004)
  smallValve(k, [dF[0], dF[1] - 0.16, dF[2]], [0, 1, 0], [0, 0, 1], pipeOD(1) * 0.7)
  k.rbox('plasticGrey', [0.1, 0.09, 0.07], 0.01, [dF[0], dF[1] - 0.3, dF[2]])
  k.add(textMaterial('DRAIN', '#2a2d30', '#f2f2ee', 128, 48), new THREE.PlaneGeometry(0.07, 0.025), mat4([dF[0], dF[1] - 0.29, dF[2] + 0.0355]))
  k.cyl('brass', 0.008, 0.03, [dF[0], dF[1] - 0.36, dF[2]], 'y', 8)

  if (p.support === 'legs') legs(k, m, Ro, e0, proj, 4, deg(45))
  else skirt(k, m, Ro, e0, 0.008, [{ a: deg(150), y: 0.18 + 0.12, d: 0.24, access: true }])
  earthBoss(k, m, at(deg(-150), Ro, e0 + 0.12), dirOf(deg(-150)))
  nameplate(k, m, deg(-45), Ro, e0 + p.height * 0.3, p.tag, 0.6)
  for (const a of [deg(90), deg(270)]) {
    const r = Ro * 0.6
    liftingLug(k, at(a, r, e1 + bo * Math.sqrt(1 - 0.36) - 0.02), 'z', 0.7, m)
  }
}
