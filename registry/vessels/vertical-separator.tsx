// Vertical separator / gas scrubber on a skirt or legs: 2:1 heads, UG-27 shell, level bridle, mist-eliminator manway, platforms and caged ladders. ASME VIII-1, API 12J, ISO 14122.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, liftingLug, manway } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, headDepth, nozzleStandout, pipeOD, shellThickness, skirtHeight, elbow90, type Rating } from '../lib/standards'
import { vInternals, at, cagedLadder, holeR, manwayNps, type Hole, clamp, deg, dirOf, earthBoss, legs, levelBridle, nameplate, pad, platform, projector, shell, shellNozzle, skirt, skirtLine, skirtRunY, topDavit, capNps } from './_vessel'

export interface VerticalSeparatorProps {
  /** inside diameter, m */
  diameter?: number
  /** tangent-to-tangent height, m */
  height?: number
  /** design pressure, barg (sets the shell wall per UG-27) */
  pressure?: number
  rating?: Rating
  inletNps?: number
  gasNps?: number
  liquidNps?: number
  psvNps?: number
  drainNps?: number
  support?: 'skirt' | 'legs'
  insulated?: boolean
  platform?: boolean
  tag?: string
  paint?: MatKey
}

export const defaults = {
  diameter: 1.8,
  height: 5.5,
  pressure: 40,
  rating: 600 as Rating,
  inletNps: 10,
  gasNps: 8,
  liquidNps: 4,
  psvNps: 3,
  drainNps: 2,
  support: 'skirt' as 'skirt' | 'legs',
  insulated: false,
  platform: true,
  tag: 'V-200',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

/** Nozzles kept in proportion to the shell (typical upper bounds). */
const fit = (p: P): P => ({ ...p, inletNps: capNps(p.inletNps, p.diameter * 0.45), gasNps: capNps(p.gasNps, p.diameter * 0.5), liquidNps: capNps(p.liquidNps, p.diameter * 0.3), psvNps: capNps(p.psvNps, p.diameter * 0.25), drainNps: capNps(p.drainNps, p.diameter * 0.2) })

const A = {
  inlet: deg(180),
  manway: deg(290),
  bridle: deg(245),
  liquid: deg(0),
  drain: deg(60),
  psv: deg(90),
  vent: deg(210),
  opening: deg(270),
  ladder: deg(338),
  ladder2: deg(212),
  davit: deg(30),
}

function layout(p: P) {
  const wall = shellThickness(p.pressure, p.diameter)
  const Ro = p.diameter / 2 + wall
  const bo = headDepth('2:1-ellipsoidal', p.diameter) + wall
  const ins = p.insulated ? 0.06 : 0
  const so = (nps: number) => nozzleStandout(nps, p.rating, p.insulated)
  const skirted = p.support === 'skirt'
  const fL = flangeDims(p.liquidNps, p.rating)
  const e0 = skirted
    ? Math.max(skirtHeight(p.diameter), bo + elbow90(p.liquidNps) + 0.12 + 0.38 + fL.od / 2)
    : bo + so(p.liquidNps) + 0.45
  const e1 = e0 + p.height
  const tt = p.height
  const headBot = (r: number) => e0 - bo * Math.sqrt(Math.max(0, 1 - (r / Ro) ** 2))
  const headTop = (r: number) => e1 + bo * Math.sqrt(Math.max(0, 1 - (r / Ro) ** 2))
  const rPsv = Ro * 0.5
  const rDrain = Ro * 0.45
  const yIn = e0 + 0.5 * tt
  const yMw = Math.min(e0 + 0.76 * tt, e1 - 0.75)
  const tipY = e0 - bo
  const liquid = skirted
    ? { start: [0, tipY + 0.03, 0] as V3, yRun: skirtRunY(tipY, p.liquidNps), face: at(A.liquid, Ro + so(p.liquidNps), skirtRunY(tipY, p.liquidNps)), dir: dirOf(A.liquid) }
    : { start: [0, tipY, 0] as V3, yRun: 0, face: [0, tipY - so(p.liquidNps), 0] as V3, dir: [0, -1, 0] as V3 }
  const dStart = at(A.drain, rDrain, headBot(rDrain))
  const dRun = Math.min(skirtRunY(dStart[1], p.drainNps), liquid.yRun + 0.0)
  const drain = skirted
    ? { start: [dStart[0], dStart[1] + 0.03, dStart[2]] as V3, yRun: dRun, face: at(A.drain, Ro + so(p.drainNps), dRun), dir: dirOf(A.drain) }
    : { start: dStart, yRun: 0, face: [dStart[0], dStart[1] - so(p.drainNps), dStart[2]] as V3, dir: [0, -1, 0] as V3 }
  const n = {
    inlet: { base: at(A.inlet, Ro, yIn), dir: dirOf(A.inlet), nps: p.inletNps },
    gas: { base: [0, e1 + bo, 0] as V3, dir: [0, 1, 0] as V3, nps: p.gasNps },
    psv: { base: at(A.psv, rPsv, headTop(rPsv)), dir: [0, 1, 0] as V3, nps: p.psvNps },
    vent: { base: at(A.vent, rPsv, headTop(rPsv)), dir: [0, 1, 0] as V3, nps: 2 },
  }
  const face = (k: keyof typeof n) => [n[k].base[0] + n[k].dir[0] * so(n[k].nps), n[k].base[1] + n[k].dir[1] * so(n[k].nps), n[k].base[2] + n[k].dir[2] * so(n[k].nps)] as V3
  // platforms: top one serves the top-head nozzles, a mid one the manway when the climb would exceed one flight
  const yTop = e1 - 0.15
  const yMid = yMw - 0.85
  const mid = p.platform && yMid > 1.8 && yTop - yMid > 1.2
  const top = p.platform && yTop > 2.2
  return { wall, Ro, bo, ins, so, skirted, e0, e1, tt, headTop, headBot, yIn, yMw, liquid, drain, n, face, yTop, yMid, mid, top }
}

export function ports(props: VerticalSeparatorProps = {}): Port[] {
  const p = fit({ ...defaults, ...props } as P)
  const L = layout(p)
  return [
    port('inlet', 'Inlet', L.face('inlet'), L.n.inlet.dir, p.inletNps, p.rating),
    port('gas', 'Gas outlet', L.face('gas'), [0, 1, 0], p.gasNps, p.rating),
    port('liquid', 'Liquid outlet', L.liquid.face, L.liquid.dir, p.liquidNps, p.rating),
    port('psv', 'PSV', L.face('psv'), [0, 1, 0], p.psvNps, p.rating, 'relief'),
    port('vent', 'Vent', L.face('vent'), [0, 1, 0], 2, p.rating, 'vent'),
    port('drain', 'Drain', L.drain.face, L.drain.dir, p.drainNps, p.rating, 'drain'),
  ]
}

export function VerticalSeparator(props: VerticalSeparatorProps & GroupProps) {
  const { diameter, height, pressure, rating, inletNps, gasNps, liquidNps, psvNps, drainNps, support, insulated, platform, tag, paint, ...group } = { ...defaults, ...props }
  const p = fit({ diameter, height, pressure, rating, inletNps, gasNps, liquidNps, psvNps, drainNps, support, insulated, platform, tag, paint } as P)
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default VerticalSeparator

function build(k: Kit, p: P) {
  const L = layout(p)
  const { Ro, bo, e0, e1, ins, so } = L
  const m = p.paint
  const Rc = Ro + ins
  const proj = projector('y', [0, (e0 + e1) / 2, 0], L.tt / 2, Ro, bo)
  const yHi = Math.max(Math.min(e0 + 0.45 * L.tt, L.mid ? L.yMid - 1.5 : e0 + 0.45 * L.tt, L.yIn - 0.5), e0 + 0.9)
  const yG = L.yIn + 0.6
  const hole = (pt: V3, d: V3, nps: number): Hole => ({ p: pt, d, r: holeR(nps) })
  const holes: Hole[] = [
    ...(['inlet', 'gas', 'psv', 'vent'] as const).map((key) => hole(L.n[key].base, L.n[key].dir, L.n[key].nps)),
    hole(at(A.manway, Ro, L.yMw), dirOf(A.manway), manwayNps(p.diameter)),
    hole(at(A.bridle, Ro, e0 + 0.2), dirOf(A.bridle), 2),
    hole(at(A.bridle, Ro, yHi), dirOf(A.bridle), 2),
    hole(at(deg(150), Ro, yG), dirOf(deg(150)), 1),
    hole([L.liquid.start[0], L.headBot(0), L.liquid.start[2]], [0, -1, 0], p.liquidNps),
    hole([L.drain.start[0], L.headBot(Ro * 0.45), L.drain.start[2]], [0, -1, 0], p.drainNps),
  ]
  if (L.skirted) {
    holes[holes.length - 2].r = pipeOD(p.liquidNps) / 2 - 0.003
    holes[holes.length - 1].r = pipeOD(p.drainNps) / 2 - 0.003
  }
  shell(k, { Ro, bo, e0, e1, mat: m, insulated: p.insulated, ins, holes })

  const nz = (key: keyof typeof L.n, blind = false) => shellNozzle(k, { ...L.n[key], rating: p.rating, standout: so(L.n[key].nps), mat: m, proj, insulated: p.insulated, blind })
  nz('inlet')
  vInternals(k, { Ri: p.diameter / 2, inlet: { a: A.inlet, y: L.yIn, nps: p.inletNps }, padY: Math.max(L.yMw + 0.6, e1 - 0.45), vortex: [[0, L.headBot(0) + 0.02, 0]] })
  nz('gas')
  nz('psv')
  nz('vent', true)
  const mw = manwayNps(p.diameter)
  manway(k, at(A.manway, Ro, L.yMw), dirOf(A.manway), 0.25 + ins, mw, Math.min(p.rating, 600) as Rating, m)
  if (!p.insulated) pad(k, m, proj, at(A.manway, Ro, L.yMw), dirOf(A.manway), pipeOD(mw) / 2, pipeOD(mw) / 2 + 0.12, 0.02, 48)

  // supports + bottom connections
  if (L.skirted) {
    const ts = clamp(L.wall * 0.8, 0.01, 0.025)
    const dOp = clamp(Ro * 0.5, 0.45, 0.6)
    const sl = (nps: number) => pipeOD(nps) + 0.08
    skirt(k, m, Ro, e0, ts, [
      { a: A.opening, y: 0.18 + dOp / 2, d: dOp, access: true },
      { a: A.liquid, y: L.liquid.yRun, d: sl(p.liquidNps) },
      { a: A.drain, y: L.drain.yRun, d: sl(p.drainNps) },
    ])
    skirtLine(k, L.liquid.start, A.liquid, L.liquid.yRun, p.liquidNps, p.rating, Ro + so(p.liquidNps), m)
    skirtLine(k, L.drain.start, A.drain, L.drain.yRun, p.drainNps, p.rating, Ro + so(p.drainNps), m)
    for (const a of [deg(120), deg(305)]) earthBoss(k, m, at(a, Ro, 0.42), dirOf(a))
  } else {
    const lr = legs(k, m, Ro, e0, proj, 4, deg(45))
    shellNozzle(k, { base: L.liquid.start, dir: [0, -1, 0], nps: p.liquidNps, rating: p.rating, standout: so(p.liquidNps), mat: m, proj, insulated: p.insulated })
    shellNozzle(k, { base: L.drain.start, dir: [0, -1, 0], nps: p.drainNps, rating: p.rating, standout: so(p.drainNps), mat: m, proj, insulated: p.insulated })
    for (const a of [deg(45), deg(225)]) earthBoss(k, m, at(a + 0.25, Ro + lr, 0.25), dirOf(a + 0.25))
  }

  // instruments: level bridle (LG + LT), pressure gauge
  levelBridle(k, { shellR: Ro, a: A.bridle, yLo: e0 + 0.2, yHi, rating: p.rating, insulated: p.insulated })
  const gD = dirOf(deg(150))
  nz2(k, at(deg(150), Ro, yG), gD, p.rating, so(1), m)
  gauge(k, [at(deg(150), Ro + so(1) + 0.09, yG)[0], yG + 0.0, at(deg(150), Ro + so(1) + 0.09, yG)[2]], gD, 0.15, 'bar', Math.ceil((p.pressure * 1.6) / 10) * 10)

  // lifting lugs on the top head, nameplate
  for (const a of [deg(150), deg(330)]) {
    const r = Ro * 0.62
    const lug = at(a, r, L.headTop(r) - 0.03)
    liftingLug(k, lug, Math.abs(Math.cos(a)) > 0.7 ? 'x' : 'z', clamp(Ro / 0.9, 0.8, 1.6), m)
  }
  nameplate(k, m, deg(315), Rc, L.skirted ? e0 + 0.45 : Math.max(e0 + 0.3, 1.4), p.tag)

  // access
  const rIn = Rc + 0.08
  if (L.mid && L.top) {
    const rOut = platform(k, { y: L.yMid, shellR: Ro, rIn, a0: deg(198), a1: deg(360), gate: A.ladder })
    cagedLadder(k, A.ladder, rOut + 0.06, 0, L.yMid, Ro)
    const eps = 0.45 / (Ro + 0.6)
    platform(k, { y: L.yTop, shellR: Ro, rIn, a0: A.ladder2 + eps, a1: A.ladder2 + Math.PI * 2 - eps })
    cagedLadder(k, A.ladder2, rIn + 0.22, L.yMid, L.yTop, Ro)
    topDavit(k, A.davit, Rc, L.yTop, L.headTop(0) + so(p.gasNps) + 1.2)
  } else if (L.top) {
    const rOut = platform(k, { y: L.yTop, shellR: Ro, rIn, a0: A.ladder - deg(160), a1: A.ladder + deg(160), gate: A.ladder })
    cagedLadder(k, A.ladder, rOut + 0.06, 0, L.yTop, Ro)
    topDavit(k, A.davit, Rc, L.yTop, L.headTop(0) + so(p.gasNps) + 1.2)
  }
}

function nz2(k: Kit, base: V3, dir: V3, rating: Rating, standout: number, mat: MatKey) {
  shellNozzle(k, { base, dir, nps: 1, rating, standout, mat })
}
