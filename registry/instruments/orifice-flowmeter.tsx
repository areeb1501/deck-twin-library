// Orifice flowmeter: ASME B16.36 orifice flange pair with paddle plate, jack screws and flange taps, root valves, close-coupled 5-valve manifold and DP transmitter on a short meter run. ISO 5167-2, ASME B16.36 / B16.5.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { textMaterial } from '../lib/textures'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { weldBead } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { GASKET_SPIRAL_WOUND, flange as flangeDims, inch, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { SS, cable, coplanarSensor, manifold, tag as tagPlate, tubeFitting, tubing, valveHandle, flange, pipe, segFor } from './_parts'

export interface OrificeFlowmeterProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** orifice bore / pipe bore (β) */
  beta?: number
  /** straight length from the plate to the inlet flange face, pipe diameters */
  upstream?: number
  /** straight length from the plate to the outlet flange face, pipe diameters */
  downstream?: number
  housing?: MatKey
  tag?: string
}

export const defaults = { nps: 6, rating: 600 as Rating, beta: 0.6, upstream: 5, downstream: 3, housing: 'actuatorBlue' as MatKey, tag: 'FT-1001' }

type P = typeof defaults

function dims(p: P) {
  const D = pipeOD(p.nps)
  const ofRating = Math.max(p.rating, 300) as Rating
  const f = flangeDims(p.nps, ofRating)
  const t = Math.max(f.thickness, inch(1.5)) // B16.36 minimum orifice flange thickness
  const hub = Math.max(f.hubLength, t + inch(1))
  const tp = p.nps <= 8 ? 0.0032 : p.nps <= 14 ? 0.0064 : 0.0095 // typical plate thickness
  const half = tp / 2 + GASKET_SPIRAL_WOUND
  const fe = flangeDims(p.nps, p.rating)
  const endL = fe.hubLength + fe.raisedFaceHeight
  const weldOF = half + f.raisedFaceHeight + hub
  const minRun = weldOF + endL + 0.08
  const xA = -Math.max(p.upstream * D, minRun)
  const xB = Math.max(p.downstream * D, minRun)
  return { D, f, t, hub, tp, half, endL, weldOF, xA, xB }
}

export function ports(props: OrificeFlowmeterProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const { xA, xB } = dims(p)
  return [port('A', 'Inlet (upstream)', [xA, 0, 0], [-1, 0, 0], p.nps, p.rating), port('B', 'Outlet (downstream)', [xB, 0, 0], [1, 0, 0], p.nps, p.rating)]
}

export function OrificeFlowmeter(props: OrificeFlowmeterProps & GroupProps) {
  const { nps, rating, beta, upstream, downstream, housing, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, beta, upstream, downstream, housing, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default OrificeFlowmeter

/** Weld-neck orifice flange, raised face at x = face pointing along s. */
function orificeFlange(k: Kit, nps: number, f: ReturnType<typeof flangeDims>, t: number, hub: number, face: number, s: 1 | -1) {
  const ro = pipeOD(nps) / 2
  const ri = ro - pipeWall(nps, '80')
  const rf = f.raisedFaceHeight
  const hubR = Math.max(f.hubDia / 2, ro * 1.05)
  const seg = segFor(f.od)
  k.at([face, 0, 0], s > 0 ? 'x' : '-x', () => {
    k.lathe('flangeSteel', [[ro * 0.999, -hub - rf], [hubR, -rf - t - 0.006], [hubR + 0.004, -rf - t], [f.od / 2, -rf - t], [f.od / 2, -rf], [f.raisedFace / 2, -rf]], [0, 0, 0], 'y', seg)
    k.lathe('machined', [[f.raisedFace / 2, -rf], [f.raisedFace / 2, 0], [ri, 0]], [0, 0, 0], 'y', seg)
    k.lathe('pipeBore', [[ri, 0], [ri, -hub - rf]], [0, 0, 0], 'y', segFor(2 * ri))
  })
}

function build(k: Kit, p: P) {
  const { D, f, t, hub, tp, half, endL, weldOF, xA, xB } = dims(p)
  const rf = f.raisedFaceHeight
  const g = GASKET_SPIRAL_WOUND

  // meter run: end flanges, spools, orifice flanges
  flange(k, p.nps, p.rating, [xA, 0, 0], '-x')
  flange(k, p.nps, p.rating, [xB, 0, 0], 'x')
  pipe(k, [xA + endL, 0, 0], [-weldOF, 0, 0], p.nps, 'pipePaint', '80')
  pipe(k, [weldOF, 0, 0], [xB - endL, 0, 0], p.nps, 'pipePaint', '80')
  for (const x of [xA + endL, -weldOF, weldOF, xB - endL]) weldBead(k, p.nps, [x, 0, 0], 'x')
  orificeFlange(k, p.nps, f, t, hub, -half, 1)
  orificeFlange(k, p.nps, f, t, hub, half, -1)

  // paddle plate, gaskets, stamped tab towards +Z
  const plateR = f.boltCircle / 2 - f.boltDia * 0.75
  const ri = D / 2 - pipeWall(p.nps, '80')
  const rb = Math.min(0.75, Math.max(0.2, p.beta)) * ri
  k.lathe(SS, [[rb, -tp / 2], [plateR, -tp / 2], [plateR, tp / 2], [rb, tp / 2], [rb, -tp / 2]], [0, 0, 0], 'x', segFor(2 * plateR))
  const rg = f.raisedFace / 2 + 0.006
  for (const s of [-1, 1]) k.lathe('gasket', [[ri, -g / 2], [rg, -g / 2], [rg, g / 2], [ri, g / 2], [ri, -g / 2]], [s * (tp / 2 + g / 2), 0, 0], 'x', segFor(2 * rg))
  const tabEnd = f.od / 2 + 0.065
  k.box(SS, [tp, 0.038, tabEnd - plateR + 0.01], [0, 0, (tabEnd + plateR - 0.01) / 2])
  // tab stamping: size, class, bore ratio (read from upstream side)
  const stamp = textMaterial(`${p.nps}" ${p.rating}# B${Math.min(0.75, Math.max(0.2, p.beta)).toFixed(3)}`, '#d4d8dc', '#202326', 512, 96)
  for (const s of [-1, 1]) k.plane(stamp, 0.056, 0.026, [s * (tp / 2 + 0.0004), 0, (f.od / 2 + tabEnd) / 2], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s, 0, 0)))

  // studs through both flanges; bolt holes sit between the mid-angles a = i·2π/n (a = 0 is +Z, a = 3π/2 is +Y)
  const studL = 2 * (t + rf) + 2 * g + tp + f.boltDia * 2.6
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, [-studL / 2, 0, 0], 'x', f.boltDia, studL, [f.boltDia * 0.8, studL - f.boltDia * 0.8])
  const aj = ((2 * Math.PI) / f.bolts) * Math.round(f.bolts / 8)
  for (const a of [aj, aj + Math.PI]) {
    const y = -Math.sin(a) * (f.boltCircle / 2)
    const z = Math.cos(a) * (f.boltCircle / 2)
    const x0 = -(half + rf + t) - 0.012
    k.rod('boltXylan', [x0, y, z], [half + rf, y, z], f.boltDia * 0.42, 8)
    k.hex('nut', f.boltDia * 1.7, f.boltDia * 0.8, [x0, y, z], 'x')
  }

  // flange taps 1" from each face, root valves, tubing to a close-coupled 5-valve manifold
  const yTap = f.od / 2
  const yR = yTap + 0.041 + 0.022
  const xt = half + 0.0254
  for (const s of [-1, 1]) {
    const x = s * xt
    k.cyl(SS, 0.0107, 0.048, [x, yTap + 0.02, 0], 'y', 12)
    k.box(SS, [0.034, 0.044, 0.034], [x, yR, 0])
    valveHandle(k, [x, yR, -s * 0.017], [0, 0, -s])
  }
  // second tap on each flange, 180° opposite, plugged
  for (const s of [-1, 1]) {
    k.cyl(SS, 0.012, 0.012, [s * xt, -yTap - 0.004, 0], 'y', 12)
    k.hex(SS, 0.024, 0.012, [s * xt, -yTap - 0.016, 0])
  }
  const yM = yR + 0.022 + 0.026 + 0.11
  const m = manifold(k, [0, yM, 0], 5)
  m.inlets.forEach((inl, i) => {
    const x = (i === 0 ? -1 : 1) * xt
    const a = tubeFitting(k, [x, yR + 0.022, 0], [0, 1, 0])
    const b = tubeFitting(k, inl, [0, -1, 0])
    tubing(k, [a, [x, a[1] + 0.025, 0], [inl[0], b[1] - 0.025, 0], b])
  })
  const head = coplanarSensor(k, [0, m.top, 0], p.housing, true)
  tagPlate(k, p.tag, [xt, yR - 0.004, 0.0178], 'z', 0.06)

  const gl: V3 = [head[0] + 0.106, head[1], head[2] + 0.02]
  const xs = weldOF + 0.04
  const xe = Math.max(xs + 0.06, xB - endL - 0.04)
  cable(k, [gl, [gl[0] + 0.05, gl[1] - 0.06, 0.03], [xs + 0.03, D / 2 + 0.12, 0.02], [xs + 0.02, D / 2 + 0.008, 0], [xe, D / 2 + 0.008, 0]])
}
