// Vertical cartridge filter / coalescer housing on legs: davit-hinged swing-bolt, quick-opening or bolted top closure, inlet below and outlet above the tube sheet, DP indicator, vent and drain. ASME VIII-1, ASME B16.5.
import * as THREE from 'three'
import { Kit, mat4, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { liftingLug } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { headDepth, nozzleStandout, shellThickness, type Rating } from '../lib/standards'
import { dialMaterial, textMaterial } from '../lib/textures'
import { at, deg, holeR, ringSector, type Hole, dirOf, earthBoss, legs, nameplate, projector, shell, shellNozzle, smallValve, smoothLathe, vesselProfile, capNps } from './_vessel'

export interface CartridgeFilterProps {
  /** inside diameter, m */
  diameter?: number
  /** tangent-to-tangent height, m */
  height?: number
  /** design pressure, barg */
  pressure?: number
  rating?: Rating
  inletNps?: number
  outletNps?: number
  closure?: 'swing-bolt' | 'quick-opening' | 'bolted'
  tag?: string
  paint?: MatKey
}

export const defaults = {
  diameter: 0.6,
  height: 1.6,
  pressure: 20,
  rating: 300 as Rating,
  inletNps: 4,
  outletNps: 4,
  closure: 'swing-bolt' as 'swing-bolt' | 'quick-opening' | 'bolted',
  tag: 'F-200',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

/** Nozzles kept in proportion to the shell (typical upper bounds). */
const fit = (p: P): P => ({ ...p, inletNps: capNps(p.inletNps, p.diameter * 0.5), outletNps: capNps(p.outletNps, p.diameter * 0.5) })

const A = { inlet: deg(180), outlet: deg(0), vent: deg(90), davit: deg(135), dp: deg(-90) }

function layout(p: P) {
  const wall = shellThickness(p.pressure, p.diameter)
  const Ro = p.diameter / 2 + wall
  const bo = headDepth('2:1-ellipsoidal', p.diameter) + wall
  const so = (nps: number) => nozzleStandout(nps, p.rating)
  const e0 = bo + so(1) + 0.45
  const e1 = e0 + p.height
  const yIn = e0 + Math.max(0.25, p.height * 0.12) // dirty side below the tube sheet, elements flow inside-out
  const yOut = e1 - Math.max(0.3, p.height * 0.22)
  const yVent = e1 - 0.12
  return { wall, Ro, bo, so, e0, e1, yIn, yOut, yVent }
}

export function ports(props: CartridgeFilterProps = {}): Port[] {
  const p = fit({ ...defaults, ...props } as P)
  const L = layout(p)
  return [
    port('inlet', 'Inlet', at(A.inlet, L.Ro + L.so(p.inletNps), L.yIn), dirOf(A.inlet), p.inletNps, p.rating),
    port('outlet', 'Outlet', at(A.outlet, L.Ro + L.so(p.outletNps), L.yOut), dirOf(A.outlet), p.outletNps, p.rating),
    port('vent', 'Vent', at(A.vent, L.Ro + L.so(1), L.yVent), dirOf(A.vent), 1, p.rating, 'vent'),
    port('drain', 'Drain', [0, L.e0 - L.bo - L.so(1), 0], [0, -1, 0], 1, p.rating, 'drain'),
  ]
}

export function CartridgeFilter(props: CartridgeFilterProps & GroupProps) {
  const { diameter, height, pressure, rating, inletNps, outletNps, closure, tag, paint, ...group } = { ...defaults, ...props }
  const p = fit({ diameter, height, pressure, rating, inletNps, outletNps, closure, tag, paint } as P)
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default CartridgeFilter

function build(k: Kit, p: P) {
  const L = layout(p)
  const { Ro, bo, so, e0, e1 } = L
  const m = p.paint
  const proj = projector('y', [0, (e0 + e1) / 2, 0], p.height / 2, Ro, bo)
  const holes: Hole[] = [
    { p: at(A.inlet, Ro, L.yIn), d: dirOf(A.inlet), r: holeR(p.inletNps) },
    { p: at(A.outlet, Ro, L.yOut), d: dirOf(A.outlet), r: holeR(p.outletNps) },
    { p: at(A.vent, Ro, L.yVent), d: dirOf(A.vent), r: holeR(1) },
    { p: [0, e0 - bo, 0], d: [0, -1, 0], r: holeR(1) },
  ]
  shell(k, { Ro, bo, e0, e1, mat: m, top: false, seg: 56, course: 1.8, holes })
  shellNozzle(k, { base: at(A.inlet, Ro, L.yIn), dir: dirOf(A.inlet), nps: p.inletNps, rating: p.rating, standout: so(p.inletNps), mat: m, proj })
  shellNozzle(k, { base: at(A.outlet, Ro, L.yOut), dir: dirOf(A.outlet), nps: p.outletNps, rating: p.rating, standout: so(p.outletNps), mat: m, proj })
  shellNozzle(k, { base: at(A.vent, Ro, L.yVent), dir: dirOf(A.vent), nps: 1, rating: p.rating, standout: so(1), mat: m })
  shellNozzle(k, { base: [0, e0 - bo, 0], dir: [0, -1, 0], nps: 1, rating: p.rating, standout: so(1), mat: m })
  legs(k, m, Ro, e0, proj, 4, deg(45))
  earthBoss(k, m, at(deg(-60), Ro, e0 + 0.15), dirOf(deg(-60)))
  nameplate(k, m, deg(-40), Ro, e0 + p.height * 0.45, p.tag, 0.6)
  for (const a of [deg(60), deg(240)]) liftingLug(k, at(a, Ro + 0.005, e1 - 0.18), Math.abs(Math.cos(a)) > 0.7 ? 'z' : 'x', 0.8, m)

  // DP indicator across the elements, on a bracket at the front
  const g = at(A.dp, Ro + 0.2, (L.yIn + L.yOut) / 2)
  const qd = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dirOf(A.dp)))
  k.box(m, [0.02, 0.14, 0.18], at(A.dp, Ro + 0.09, g[1]), qd)
  k.cyl('stainless', 0.075, 0.06, g, dirOf(A.dp), 24)
  k.add(dialMaterial('bar', 2), new THREE.CircleGeometry(0.066, 24), mat4(at(A.dp, Ro + 0.231, g[1]), qd))
  k.disc('glass', 0.07, at(A.dp, Ro + 0.234, g[1]), dirOf(A.dp), 24)
  k.box(textMaterial('PDI', '#f2f2ee', '#111', 128, 64), [0.07, 0.035, 0.004], at(A.dp, Ro + 0.2, g[1] - 0.11), qd)
  for (const [y, s] of [[L.yIn, 1], [L.yOut, -1]] as const) {
    const a = A.dp + s * 0.35
    const t0 = at(a, Ro - 0.005, y)
    const t1 = at(a, Ro + 0.08, y)
    k.pipe(m, t0, t1, 0.027, 0.004)
    smallValve(k, at(a, Ro + 0.12, y), dirOf(a), [0, 1, 0], 0.025)
    k.tube('tubing', [at(a, Ro + 0.16, y), at(a, Ro + 0.2, y), at(a, Ro + 0.2, g[1] + s * 0.03), at(A.dp, Ro + 0.2, g[1] + s * 0.03)], 0.005, 8, 0.03)
  }

  closure(k, p, Ro, e1, m)
}

/** Top closure: forged hub with locking band and dished door (quick-opening), or a body-flange pair with studs and a dished cover; both on a davit with a lifting screw. */
function closure(k: Kit, p: P, Ro: number, e1: number, m: MatKey) {
  const quick = p.closure === 'quick-opening'
  const Rh = Ro + (quick ? 0.06 : p.closure === 'swing-bolt' ? 0.05 : 0.11)
  const hubL = 0.12
  const yF = e1 + hubL
  const tD = quick ? 0.06 : 0.07
  k.lathe(m, [[Ro - 0.02, -0.06], [Ro, -0.06], [Rh, quick ? 0.03 : hubL - 0.07], [Rh, hubL], [Ro - 0.03, hubL], [Ro - 0.02, -0.06]], [0, e1, 0], 'y', 56)
  k.lathe('flangeSteel', [[Rh, 0], [Rh, tD], [Ro - 0.02, tD], [Ro - 0.02, 0], [Rh, 0]], [0, yF, 0], 'y', 56)
  const db = 0.2 * p.diameter
  k.add(m, smoothLathe(vesselProfile(Ro + 0.01, db, 0, 0, 18, false, true), 48), mat4([0, yF + tD, 0]))
  if (quick) {
    k.lathe('flangeSteel', [[Rh + 0.03, -0.04], [Rh + 0.03, tD + 0.03], [Rh - 0.005, tD + 0.03], [Rh - 0.005, -0.04], [Rh + 0.03, -0.04]], [0, yF, 0], 'y', 56)
    const c = at(deg(-90), Rh + 0.06, yF + tD / 2)
    for (const s of [-1, 1]) k.box('flangeSteel', [0.04, 0.08, 0.1], [c[0] + s * 0.04, c[1], c[2]])
    k.rod('boltXylan', [c[0] - 0.11, c[1], c[2] + 0.01], [c[0] + 0.11, c[1], c[2] + 0.01], 0.011, 8)
    for (const s of [-1, 1]) k.hex('nut', 0.036, 0.022, [c[0] + s * 0.075, c[1], c[2] + 0.01], 'x')
    k.box('brass', [0.05, 0.05, 0.05], [c[0], c[1] + 0.07, c[2]])
  } else if (p.closure === 'swing-bolt') {
    // hinged eyebolts on lug pairs under the body flange, swinging up into slotted lugs on the cover flange
    const nb = Math.max(6, 2 * Math.round((Math.PI * 2 * Rh) / 0.5))
    for (let i = 0; i < nb; i++) {
      const a = ((i + 0.5) / nb) * Math.PI * 2
      const d = dirOf(a)
      const lat: V3 = [-d[2], 0, d[0]]
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
      const pin = at(a, Rh + 0.035, yF - 0.05)
      for (const s of [-1, 1]) k.box(m, [0.07, 0.07, 0.012], [pin[0] + lat[0] * s * 0.022, pin[1] + 0.01, pin[2] + lat[2] * s * 0.022], q)
      k.rod('boltXylan', [pin[0] - lat[0] * 0.03, pin[1], pin[2] - lat[2] * 0.03], [pin[0] + lat[0] * 0.03, pin[1], pin[2] + lat[2] * 0.03], 0.008, 8)
      k.rod('boltXylan', pin, [pin[0], yF + tD + 0.08, pin[2]], 0.011, 8)
      k.box('flangeSteel', [0.05, tD, 0.05], at(a, Rh + 0.025, yF + tD / 2), q)
      k.hex('nut', 0.036, 0.022, [pin[0], yF + tD + 0.015, pin[2]])
      k.cyl('nut', 0.026, 0.005, [pin[0], yF + tD + 0.002, pin[2]], 'y', 12)
    }
    ringSector(k, 'gasket', Ro - 0.03, Rh - 0.004, yF, yF + 0.004, 0, Math.PI * 2, 48)
  } else {
    const nb = Math.max(8, 4 * Math.round((Math.PI * 2 * (Ro + 0.06)) / 0.4))
    k.boltCircle('boltXylan', 'nut', nb, Ro + 0.065, [0, yF - 0.09, 0], 'y', 0.024, 0.06 + tD + 0.11, [0.02, 0.06 + tD + 0.07])
    ringSector(k, 'gasket', Ro - 0.03, Rh - 0.004, yF, yF + 0.004, 0, Math.PI * 2, 48)
  }
  // davit: post in two sleeves on the shell, arm over the cover, lifting screw with handwheel
  const d = dirOf(A.davit)
  const zP = Rh + 0.16
  const P0 = at(A.davit, zP, 0)
  for (const y of [e1 - 0.35, e1 - 0.05]) {
    k.box('equipmentPaintDark', [zP - Ro + 0.02, 0.05, 0.08], at(A.davit, (zP + Ro) / 2, y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), A.davit))
    k.cyl('equipmentPaintDark', 0.045, 0.07, [P0[0], y, P0[2]], 'y', 16)
  }
  const yArm = yF + tD + db + 0.22
  k.rod('equipmentPaintDark', [P0[0], e1 - 0.42, P0[2]], [P0[0], yArm + 0.04, P0[2]], 0.03, 12)
  k.rod('equipmentPaintDark', [P0[0], yArm, P0[2]], [0, yArm, 0], 0.028, 12)
  k.rod('equipmentPaintDark', [P0[0], yArm - 0.3, P0[2]], [P0[0] - d[0] * zP * 0.45, yArm - 0.02, P0[2] - d[2] * zP * 0.45], 0.016, 8)
  k.rod('stainless', [0, yF + tD + db - 0.01, 0], [0, yArm + 0.14, 0], 0.016, 10)
  k.cyl('equipmentPaintDark', 0.05, 0.05, [0, yF + tD + db + 0.02, 0], 'y', 16)
  k.cyl('equipmentPaintDark', 0.04, 0.06, [0, yArm, 0], 'y', 16)
  k.handwheel('handwheel', 0.22, [0, yArm + 0.12, 0], 'y', 4)
}
