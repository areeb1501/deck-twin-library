// Fixed fire monitor on a firewater riser: flanged inlet and long-radius elbow on a dummy-leg foot plate, OS&Y isolation valve, slewing turret, elevating gooseneck, fog nozzle with tiller and optional water-powered oscillator. EN 15767, NFPA 15, ASME B16.5.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, pipe, tagPlate, weldBead } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { GASKET_SPIRAL_WOUND, elbow90, faceToFace, flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { deg } from './_fg'
import { boltUp, osyGate, portBore } from './_valves'

export interface FireMonitorProps {
  /** riser size, inches */
  nps?: number
  rating?: Rating
  /** monitor base flange above the deck, m */
  height?: number
  /** turret rotation about the vertical, degrees (0 = nozzle to +Z) */
  slew?: number
  /** nozzle elevation above horizontal, degrees */
  elevation?: number
  oscillating?: boolean
  tag?: string
}

export const defaults = { nps: 4, rating: 150 as Rating, height: 1.5, slew: 0, elevation: 20, oscillating: true, tag: 'FM-7101' }

const RED = 'firewaterRed'
const G = GASKET_SPIRAL_WOUND
const OSC_H = 0.2 // typical inline water-powered oscillator height, m

function layout(nps: number, rating: Rating, height: number) {
  const D = pipeOD(nps)
  const f = flangeDims(nps, rating)
  const R = elbow90(nps)
  const yi = Math.max(0.35, f.od / 2 + 0.15)
  const xi = -R - Math.max(0.25, D * 2)
  const Lg = faceToFace('gate', nps, rating)
  const yv0 = yi + R + 0.2 // valve bottom face
  const yTop = Math.max(height, yv0 + Lg + G + 0.35)
  return { D, f, R, yi, xi, Lg, yv0, yTop }
}

export function ports(props: FireMonitorProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const { yi, xi } = layout(p.nps, p.rating, p.height)
  return [port('inlet', 'Firewater inlet', [xi, yi, 0], [-1, 0, 0], p.nps, p.rating)]
}

export function FireMonitor(props: FireMonitorProps & GroupProps) {
  const { nps, rating, height, slew, elevation, oscillating, tag, ...group } = { ...defaults, ...props }
  const L = layout(nps, rating, height)
  const Dw = pipeOD(Math.min(nps, 4))
  const y0 = L.yTop + G + 0.1 + (oscillating ? OSC_H : 0)
  const fixed = useKit((k) => build(k, nps, rating, height, oscillating, tag), [nps, rating, height, oscillating, tag])
  const turret = useKit((k) => buildTurret(k, Dw), [Dw])
  const nozzle = useKit((k) => buildNozzle(k, Dw), [Dw])
  const { y1, Rw, xs } = turretDims(Dw)
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <group position={[0, y0, 0]} rotation-y={deg(slew)}>
        <KitMesh data={turret} />
        <group position={[xs, y1 + Rw, 0]} rotation-x={-deg(Math.max(-15, Math.min(80, elevation)))}>
          <KitMesh data={nozzle} />
        </group>
      </group>
    </group>
  )
}

export default FireMonitor

function build(k: Kit, nps: number, rating: Rating, height: number, osc: boolean, tag: string) {
  const { D, f, R, yi, xi, Lg, yv0, yTop } = layout(nps, rating, height)
  // inlet spool, LR elbow, dummy leg on a foot plate
  const a = flange(k, nps, rating, [xi, yi, 0], '-x', true)
  portBore(k, nps, rating, [xi, yi, 0], '-x')
  pipe(k, [xi + a, yi, 0], [-R, yi, 0], nps, RED)
  weldBead(k, nps, [xi + a, yi, 0], 'x')
  k.bend(RED, [-R, yi, 0], [1, 0, 0], [0, 1, 0], R, D)
  weldBead(k, nps, [-R, yi, 0], 'x')
  weldBead(k, nps, [0, yi + R, 0], 'y')
  const xl = -R * 0.3
  const yl = yi + 0.28 * R - D * 0.42
  pipe(k, [xl, 0.02, 0], [xl, yl, 0], nps, RED)
  k.cyl(RED, D / 2 + 0.002, 0.006, [xl, yl, 0], 'y', 24)
  k.box('galvanised', [D + 0.2, 0.02, D + 0.2], [xl, 0.01, 0])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl('galvanised', 0.009, 0.05, [xl + sx * (D / 2 + 0.06), 0.035, sz * (D / 2 + 0.06)], 'y', 8)
    k.hex('nut', 0.032, 0.015, [xl + sx * (D / 2 + 0.06), 0.028, sz * (D / 2 + 0.06)], 'y')
  }
  // low-point drain valve under the inlet spool
  const xd = (xi + a - R) / 2
  k.cyl(RED, 0.016, 0.06, [xd, yi - D / 2 - 0.02, 0], 'y', 10)
  k.box('brass', [0.045, 0.04, 0.04], [xd, yi - D / 2 - 0.07, 0])
  k.box(RED, [0.008, 0.012, 0.1], [xd, yi - D / 2 - 0.07, 0.05])
  // riser: elbow → valve → spool → monitor flange
  const b = flange(k, nps, rating, [0, yv0 - G / 2, 0], 'y')
  pipe(k, [0, yi + R, 0], [0, yv0 - G / 2 - b, 0], nps, RED)
  boltUp(k, nps, rating, [0, yv0, 0], 'y')
  const yv = yv0 + G / 2 + Lg / 2
  // valve along +Y, stem towards +Z
  k.with(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)).setPosition(0, yv, 0), () => osyGate(k, nps, rating))
  const y2 = yv + Lg / 2 + G / 2
  boltUp(k, nps, rating, [0, y2, 0], 'y')
  const c0 = flange(k, nps, rating, [0, y2 + G / 2, 0], '-y')
  const c1 = flange(k, nps, rating, [0, yTop, 0], 'y')
  pipe(k, [0, y2 + G / 2 + c0, 0], [0, yTop - c1, 0], nps, RED)
  weldBead(k, nps, [0, yTop - c1, 0], 'y')
  boltUp(k, nps, rating, [0, yTop + G / 2, 0], 'y')
  tagPlate(k, tag, [0, (y2 + yTop) / 2, D / 2 + 0.004], 'z', 0.09)
  // water-powered oscillator between the riser flange and the monitor (flanged both ends), then the monitor base
  const Dw = pipeOD(Math.min(nps, 4))
  const ft = f.thickness + f.raisedFaceHeight
  let yb = yTop + G
  if (osc) {
    k.cyl('stainless', f.od / 2, ft, [0, yb + ft / 2, 0], 'y', 32)
    k.cyl('stainless', Dw * 0.72, OSC_H - 2 * ft, [0, yb + OSC_H / 2, 0], 'y', 28)
    k.cyl('stainless', f.od / 2, ft, [0, yb + OSC_H - ft / 2, 0], 'y', 32)
    k.around(f.bolts, f.boltCircle / 2, [0, yb + OSC_H, 0], 'y', (q) => k.hex('nut', f.boltDia * 1.85, f.boltDia * 0.9, [q[0], q[1] + f.boltDia * 0.45, q[2]], 'y'), Math.PI / f.bolts)
    // drive housing with speed and arc controls, manual override lever
    k.rbox('stainless', [0.11, OSC_H - 2 * ft - 0.01, 0.12], 0.012, [-Dw * 0.72 - 0.04, yb + OSC_H / 2, 0])
    for (const dz of [-0.03, 0.03]) k.cyl('castIron', 0.012, 0.02, [-Dw * 0.72 - 0.1, yb + OSC_H / 2, dz], 'x', 12)
    k.rod('stainless', [Dw * 0.72, yb + OSC_H / 2, 0], [Dw * 0.72 + 0.1, yb + OSC_H / 2 + 0.04, 0], 0.006, 8)
    k.sphere('rubberBlack', 0.014, [Dw * 0.72 + 0.1, yb + OSC_H / 2 + 0.04, 0], undefined, 10)
    yb += OSC_H
  }
  k.cyl(RED, f.od / 2, ft, [0, yb + ft / 2, 0], 'y', 32)
  k.cyl(RED, Dw * 0.62, 0.1 - f.thickness, [0, yb + f.thickness + (0.1 - f.thickness) / 2, 0], 'y', 28)
  k.torus('castIron', Dw * 0.64, 0.006, [0, yb + 0.085, 0], 'y', 6, 28)
  k.cyl('brass', 0.005, 0.02, [Dw * 0.62 + 0.008, yb + 0.06, 0], 'x', 8)
}

function turretDims(Dw: number) {
  const y1 = 0.13
  const Rw = Dw * 1.5
  const xs = Rw + 0.06
  return { y1, Rw, xs }
}

/** Slewing body, origin on the turret axis at the slew bearing. */
function buildTurret(k: Kit, Dw: number) {
  const { y1, Rw, xs } = turretDims(Dw)
  k.cyl(RED, Dw * 0.66, 0.05, [0, 0.025, 0], 'y', 28)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    k.hex('nut', 0.016, 0.008, [Math.cos(a) * Dw * 0.56, 0.054, Math.sin(a) * Dw * 0.56], 'y')
  }
  k.cyl(RED, Dw * 0.5, y1 - 0.05, [0, 0.05 + (y1 - 0.05) / 2, 0], 'y', 24)
  k.bend(RED, [0, y1, 0], [0, 1, 0], [1, 0, 0], Rw, Dw)
  k.pipe(RED, [Rw, y1 + Rw, 0], [xs - 0.02, y1 + Rw, 0], Dw)
  k.cyl(RED, Dw * 0.62, 0.04, [xs - 0.02, y1 + Rw, 0], 'x', 24)
  // slew lock handwheel
  k.rod('stainless', [0, 0.03, Dw * 0.66], [0, 0.03, Dw * 0.66 + 0.06], 0.006, 8)
  k.handwheel('handwheel', 0.11, [0, 0.03, Dw * 0.66 + 0.06], 'z', 3)
  // elevation lock handwheel on the far side of the swivel
  k.rod('stainless', [xs, y1 + Rw, -Dw * 0.62], [xs, y1 + Rw, -Dw * 0.62 - 0.05], 0.006, 8)
  k.handwheel('handwheel', 0.11, [xs, y1 + Rw, -Dw * 0.62 - 0.05], '-z', 3)
}

/** Elevating barrel and nozzle; origin at the elevation swivel, nozzle along +Z at zero elevation. */
function buildNozzle(k: Kit, Dw: number) {
  const Rw = Dw * 1.5
  k.cyl(RED, Dw * 0.62, 0.04, [0.02, 0, 0], 'x', 24)
  k.torus('castIron', Dw * 0.63, 0.005, [0.0, 0, 0], 'x', 6, 24)
  k.pipe(RED, [0.04, 0, 0], [0.06, 0, 0], Dw)
  k.bend(RED, [0.06, 0, 0], [1, 0, 0], [0, 0, 1], Rw, Dw)
  const xn = 0.06 + Rw
  const z0 = Rw
  k.cyl(RED, Dw / 2, 0.06, [xn, 0, z0 + 0.03], 'z', 24)
  k.cyl(RED, Dw * 0.6, 0.025, [xn, 0, z0 + 0.07], 'z', 24)
  k.lathe('stainless', [[Dw * 0.5, 0], [Dw * 0.5, 0.08], [Dw * 0.4, 0.26], [Dw * 0.42, 0.27], [Dw * 0.42, 0.29]], [xn, 0, z0 + 0.08], 'z', 28)
  // fog nozzle: pattern ring and rubber bumper
  k.lathe('brass', [[Dw * 0.42, 0], [Dw * 0.6, 0.02], [Dw * 0.6, 0.12], [Dw * 0.5, 0.14], [Dw * 0.3, 0.14]], [xn, 0, z0 + 0.37], 'z', 28)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    k.box('brass', [0.012, 0.012, 0.08], [xn + Math.cos(a) * Dw * 0.62, Math.sin(a) * Dw * 0.62, z0 + 0.44])
  }
  k.torus('rubberBlack', Dw * 0.56, 0.018, [xn, 0, z0 + 0.51], 'z', 10, 28)
  k.lathe('pipeBore', [[Dw * 0.3, 0.14], [Dw * 0.3, -0.3]], [xn, 0, z0 + 0.37], 'z', 20)
  // tiller handle with grip
  const g: V3 = [xn, 0.2, -0.32]
  k.rod('stainless', [xn, Dw * 0.5, z0 + 0.12], [xn, 0.16, z0 - 0.05], 0.012, 10)
  k.rod('stainless', [xn, 0.16, z0 - 0.05], g, 0.012, 10)
  k.cyl('rubberBlack', 0.017, 0.12, [g[0], g[1] + 0.012, g[2] - 0.045], [0, 0.25, -1], 10)
}
