// Wellhead cyclonic desander skid: tangential-entry liner housing over a sand accumulator, dual isolation valves between them, sand dump valve, flush and depressuring connections, DNV 2.7-1 style frame. ASME VIII-1, ASME B16.5.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, gauge, liftingLug, member, nozzle, pipeRun, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { elbow90, faceToFace, flange as flangeDims, headDepth, nozzleStandout, pipeOD, shellThickness, type Rating } from '../lib/standards'
import { GateValve } from '../valves/gate-valve'
import { at, deg, dirOf, earthBoss, holeR, jointBolts, ringSector, shell, shellNozzle, skinGeometry, smoothLathe, projector, type Hole } from './_vessel'

export interface DesanderProps {
  /** accumulator inside diameter, m */
  diameter?: number
  /** accumulator tangent-to-tangent height, m */
  height?: number
  /** design pressure, barg */
  pressure?: number
  rating?: Rating
  inletNps?: number
  outletNps?: number
  sandNps?: number
  tag?: string
  paint?: MatKey
}

export const defaults = {
  diameter: 0.6,
  height: 1.8,
  pressure: 250,
  rating: 1500 as Rating,
  inletNps: 4,
  outletNps: 4,
  sandNps: 3,
  tag: 'V-N230',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

const GASKET = 0.0045
const SKID = 'HEB 200'

function layout(p: P) {
  const so = (nps: number) => nozzleStandout(nps, p.rating)
  const ff = (nps: number) => faceToFace('gate', nps, p.rating)
  const hs = 0.2 + 0.008
  // sand outlet run below the accumulator: elbow + flange, dump valve, nozzle
  const fS = flangeDims(p.sandNps, p.rating)
  const ySand = hs + fS.od / 2 + 0.12
  const F1 = ySand + elbow90(p.sandNps) + 0.12 + ff(p.sandNps) + 2 * GASKET
  const wall = shellThickness(p.pressure, p.diameter)
  const Ro = p.diameter / 2 + wall
  const bo = headDepth('2:1-ellipsoidal', p.diameter) + wall
  const e0 = F1 + so(p.sandNps) + bo
  const e1 = e0 + p.height
  // dual isolation between the accumulator and the liner housing
  const nI = Math.max(p.inletNps, 3)
  const F2 = e1 + bo + so(nI)
  const F3 = F2 + 2 * ff(nI) + 3 * GASKET
  // liner housing: neck, cone, barrel, bolted cover
  const idC = Math.max(0.3, pipeOD(p.inletNps) * 2.4)
  const wC = shellThickness(p.pressure, idC)
  const Rc = idC / 2 + wC
  const fN = flangeDims(nI, p.rating)
  const yNeck = F3 + fN.hubLength + fN.raisedFaceHeight
  const yc0 = yNeck + 0.12
  const yc1 = yc0 + 0.45
  const yc2 = yc1 + Math.max(0.8, idC * 2.6)
  const tF = 0.09
  const yCov = yc2 + 2 * tF
  const yIn = yc2 - pipeOD(p.inletNps) * 0.9 - 0.1
  const zIn = idC / 2 - pipeOD(p.inletNps) / 2 // tangential: nozzle bore flush with the liner wall
  const xIn = -Math.sqrt(Rc * Rc - zIn * zIn)
  const W = Math.max(0.75, Ro + 0.45)
  return { so, ff, hs, ySand, F1, Ro, bo, e0, e1, nI, F2, F3, idC, Rc, yNeck, yc0, yc1, yc2, tF, yCov, yIn, zIn, xIn, W }
}

export function ports(props: DesanderProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const L = layout(p)
  return [
    port('inlet', 'Inlet (tangential)', [L.xIn - L.so(p.inletNps), L.yIn, L.zIn], [-1, 0, 0], p.inletNps, p.rating),
    port('outlet', 'Overflow outlet', [0, L.yCov + L.so(p.outletNps), 0], [0, 1, 0], p.outletNps, p.rating),
    port('sand', 'Sand dump', [elbow90(p.sandNps) + 0.35, L.ySand, 0], [1, 0, 0], p.sandNps, p.rating),
  ]
}

export function Desander(props: DesanderProps & GroupProps) {
  const { diameter, height, pressure, rating, inletNps, outletNps, sandNps, tag, paint, ...group } = { ...defaults, ...props }
  const p = { diameter, height, pressure, rating, inletNps, outletNps, sandNps, tag, paint } as P
  const L = layout(p)
  const data = useKit((k) => build(k, p, L), Object.values(p))
  const v = (nps: number, y0: number, key: string, stemZ = 1) => (
    <GateValve key={key} nps={nps} rating={p.rating} position={[0, y0 + L.ff(nps) / 2, 0]} rotation={[0, stemZ > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI / 2]} />
  )
  return (
    <group {...group}>
      <KitMesh data={data} />
      {v(p.sandNps, L.F1 - GASKET - L.ff(p.sandNps), 'dump')}
      {v(L.nI, L.F2 + GASKET, 'iso-1')}
      {v(L.nI, L.F2 + 2 * GASKET + L.ff(L.nI), 'iso-2', -1)}
    </group>
  )
}

export default Desander

function build(k: Kit, p: P, L: ReturnType<typeof layout>) {
  const m = p.paint
  const { Ro, bo, e0, e1, so } = L
  const flushA = deg(-90)
  const depA = deg(90)
  // accumulator
  const holes: Hole[] = [
    { p: [0, e0 - bo, 0], d: [0, -1, 0], r: holeR(p.sandNps) },
    { p: [0, e1 + bo, 0], d: [0, 1, 0], r: holeR(L.nI) },
    { p: at(flushA, Ro, e0 + 0.2), d: dirOf(flushA), r: holeR(2) },
    { p: at(depA, Ro, e1 - 0.2), d: dirOf(depA), r: holeR(2) },
  ]
  const proj = projector('y', [0, (e0 + e1) / 2, 0], p.height / 2, Ro, bo)
  shell(k, { Ro, bo, e0, e1, mat: m, seg: 48, course: 2, holes })
  nozzle(k, { base: [0, e0 - bo, 0], dir: [0, -1, 0], nps: p.sandNps, rating: p.rating, standout: so(p.sandNps), mat: m, studs: false })
  nozzle(k, { base: [0, e1 + bo, 0], dir: [0, 1, 0], nps: L.nI, rating: p.rating, standout: so(L.nI), mat: m, studs: false })
  shellNozzle(k, { base: at(flushA, Ro, e0 + 0.2), dir: dirOf(flushA), nps: 2, rating: p.rating, standout: so(2), mat: m, proj, blind: true })
  shellNozzle(k, { base: at(depA, Ro, e1 - 0.2), dir: dirOf(depA), nps: 2, rating: p.rating, standout: so(2), mat: m, proj, blind: true })
  gauge(k, at(deg(-45), Ro + 0.16, e1 - 0.35), dirOf(deg(-45)), 0.15, 'bar', 400)
  k.pipe('stainless', at(deg(-45), Ro - 0.01, e1 - 0.35), at(deg(-45), Ro + 0.13, e1 - 0.35), 0.03, 0.005)

  // gasket + through-studs at every valve joint
  const yV = L.F1 - 2 * GASKET - L.ff(p.sandNps)
  jointBolts(k, p.sandNps, p.rating, [0, yV, 0], [0, 1, 0])
  jointBolts(k, p.sandNps, p.rating, [0, L.F1 - GASKET, 0], [0, 1, 0])
  jointBolts(k, L.nI, p.rating, [0, L.F2, 0], [0, 1, 0])
  jointBolts(k, L.nI, p.rating, [0, L.F2 + GASKET + L.ff(L.nI), 0], [0, 1, 0])
  jointBolts(k, L.nI, p.rating, [0, L.F3 - GASKET, 0], [0, 1, 0])

  // sand run below the dump valve: flange, elbow, spool, outlet flange
  const fl = flange(k, p.sandNps, p.rating, [0, yV, 0], [0, 1, 0])
  const fS = flangeDims(p.sandNps, p.rating)
  const xOut = elbow90(p.sandNps) + 0.35
  pipeRun(k, [[0, yV - fl, 0], [0, L.ySand, 0], [xOut - fS.hubLength - fS.raisedFaceHeight, L.ySand, 0]], p.sandNps, { mat: 'pipePaint', schedule: 'XXS' })
  flange(k, p.sandNps, p.rating, [xOut, L.ySand, 0], [1, 0, 0], true)

  // liner housing: neck flange facing down, cone, barrel with tangential inlet, bolted cover with overflow
  const fN = flangeDims(L.nI, p.rating)
  flange(k, L.nI, p.rating, [0, L.F3, 0], [0, -1, 0])
  const rN = pipeOD(L.nI) / 2
  const cone: [number, number][] = [[rN, L.yNeck - 0.01], [rN, L.yc0], [L.Rc, L.yc1]]
  k.add(m, smoothLathe(cone, 40, 0, Math.PI * 2, 5))
  k.add('vesselInner', smoothLathe(cone, 40, 0, Math.PI * 2, 5))
  const inletBase: V3 = [L.xIn, L.yIn, L.zIn]
  const barrel = skinGeometry({ Ro: L.Rc, bo: 0, e0: L.yc1, e1: L.yc2, top: false, bottom: false, holes: [{ p: inletBase, d: [-1, 0, 0], r: holeR(p.inletNps) }], seg: 48 })
  k.add(m, barrel.g.clone())
  k.add('vesselInner', barrel.g)
  nozzle(k, { base: [L.xIn + 0.04, L.yIn, L.zIn], dir: [-1, 0, 0], nps: p.inletNps, rating: p.rating, standout: so(p.inletNps) + 0.04, mat: m })
  const Rf = L.Rc + 0.1
  k.lathe(m, [[L.Rc - 0.01, L.yc2 - 0.12], [L.Rc, L.yc2 - 0.12], [Rf, L.yc2 - 0.02], [Rf, L.yc2 + L.tF], [L.Rc - 0.03, L.yc2 + L.tF]], [0, 0, 0], 'y', 48)
  ringSector(k, 'gasket', L.Rc - 0.03, L.Rc + 0.02, L.yc2 + L.tF, L.yc2 + L.tF + GASKET, 0, Math.PI * 2, 40)
  k.lathe('flangeSteel', [[Rf, L.yc2 + L.tF + GASKET], [Rf, L.yCov], [pipeOD(p.outletNps) * 0.75, L.yCov]], [0, 0, 0], 'y', 48)
  k.disc('vesselInner', L.Rc, [0, L.yc2 + L.tF + GASKET, 0], 'y', 40)
  const nb = Math.max(8, 4 * Math.round((Math.PI * 2 * (L.Rc + 0.05)) / 0.4))
  k.boltCircle('boltXylan', 'nut', nb, L.Rc + 0.055, [0, L.yc2 - 0.06, 0], 'y', 0.03, L.yCov - L.yc2 + 0.12, [0.02, L.yCov - L.yc2 + 0.08])
  nozzle(k, { base: [0, L.yCov, 0], dir: [0, 1, 0], nps: p.outletNps, rating: p.rating, standout: so(p.outletNps), mat: m })
  for (const a of [deg(0), deg(180)]) liftingLug(k, at(a, L.Rc + 0.06, L.yCov), 'x', 0.6, 'flangeSteel')
  k.pipe(m, [0, L.yc0, 0], [0, L.yNeck - fN.thickness, 0], pipeOD(L.nI), 0.01)

  frame(k, p, L, m)
  earthBoss(k, 'structSteel', [L.W - 0.1, L.hs, L.W - 0.05], [0, 0, 1])
}

/** Skid base, four corner columns, support beams with shell lugs, bracing, top lifting frame with padeyes, tag sign. */
function frame(k: Kit, p: P, L: ReturnType<typeof layout>, m: MatKey) {
  const W = L.W
  const top = L.yCov + 0.5
  skid(k, 2 * W, 2 * W, SKID)
  const col = 'SHS 150x150x8'
  const c = 0.075
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) member(k, [x * (W - c), L.hs, z * (W - c)], [x * (W - c), top, z * (W - c)], col)
  const ring = (y: number, sec = 'HEA 160') => {
    for (const s of [-1, 1]) {
      member(k, [-W + c, y, s * (W - c)], [W - c, y, s * (W - c)], sec)
      member(k, [s * (W - c), y, -W + c], [s * (W - c), y, W - c], sec)
    }
  }
  ring(top - 0.08)
  // accumulator support beams + lugs
  const yA = L.e0 + 0.35
  ring(yA - 0.09)
  for (const s of [-1, 1]) member(k, [s * (L.Ro + 0.09), yA - 0.09, -W + c], [s * (L.Ro + 0.09), yA - 0.09, W - c], 'HEA 160')
  for (const s of [-1, 1]) k.box(m, [0.2, 0.2, 0.03], [s * (L.Ro + 0.06), yA + 0.1, 0], new THREE.Quaternion())
  for (const s of [-1, 1]) for (const z of [-0.06, 0.06]) k.box(m, [0.16, 0.18, 0.02], [s * (L.Ro + 0.05), yA + 0.09, z])
  // liner-housing support
  const yH = L.yc1 + 0.25
  ring(yH - 0.09)
  for (const s of [-1, 1]) member(k, [s * (L.Rc + 0.09), yH - 0.09, -W + c], [s * (L.Rc + 0.09), yH - 0.09, W - c], 'HEA 160')
  for (const s of [-1, 1]) k.box(m, [0.18 + (s > 0 ? 0 : 0), 0.16, 0.16], [s * (L.Rc + 0.07), yH + 0.08, 0])
  // diagonal bracing on the two closed sides
  for (const s of [-1, 1]) {
    member(k, [s * (W - c), L.hs + 0.1, -W + c + 0.1], [s * (W - c), yA - 0.2, W - c - 0.1], 'L80x80x8')
    member(k, [s * (W - c), yA, W - c - 0.1], [s * (W - c), yH - 0.2, -W + c + 0.1], 'L80x80x8')
  }
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) liftingLug(k, [x * (W - c), top, z * (W - c)], 'x', 1.4, 'structSteel')
  const q = new THREE.Quaternion()
  k.box('structSteel', [0.5, 0.18, 0.01], [0, L.hs + 0.6, W - c + 0.08], q)
  tagPlate(k, p.tag, [0, L.hs + 0.6, W - c + 0.086], 'z', 0.45)
}
