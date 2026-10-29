// Trayed or packed column (TEG contactor, amine absorber, stabiliser) on a skirt: UG-27 shell, manways per section, ring platforms ≤ 6 m apart with caged ladders, top davit. ASME VIII-1, ISO 14122.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, liftingLug, manway } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { ACCESS, elbow90, flange as flangeDims, headDepth, nozzleStandout, pipeOD, shellThickness, skirtHeight, type Rating } from '../lib/standards'
import { vInternals, at, cagedLadder, holeR, manwayNps, type Hole, clamp, deg, dirOf, earthBoss, levelBridle, nameplate, pad, platform, projector, shell, shellNozzle, skirt, skirtLine, skirtRunY, topDavit, capNps } from './_vessel'

export interface ColumnProps {
  /** inside diameter, m */
  diameter?: number
  /** tangent-to-tangent height, m */
  height?: number
  /** number of tray or packing sections */
  sections?: number
  internals?: 'trayed' | 'packed'
  /** design pressure, barg */
  pressure?: number
  rating?: Rating
  feedNps?: number
  overheadNps?: number
  bottomsNps?: number
  refluxNps?: number
  reboilerNps?: number
  psvNps?: number
  insulated?: boolean
  /** concrete fireproofing on the skirt (API 2218) */
  fireproofing?: boolean
  tag?: string
  paint?: MatKey
}

export const defaults = {
  diameter: 1.5,
  height: 18,
  sections: 2,
  internals: 'trayed' as 'trayed' | 'packed',
  pressure: 70,
  rating: 600 as Rating,
  feedNps: 8,
  overheadNps: 8,
  bottomsNps: 4,
  refluxNps: 3,
  reboilerNps: 8,
  psvNps: 3,
  insulated: false,
  fireproofing: true,
  tag: 'T-300',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

/** Nozzles kept in proportion to the shell (typical upper bounds). */
const fit = (p: P): P => ({ ...p, feedNps: capNps(p.feedNps, p.diameter * 0.4), overheadNps: capNps(p.overheadNps, p.diameter * 0.5), bottomsNps: capNps(p.bottomsNps, p.diameter * 0.3), refluxNps: capNps(p.refluxNps, p.diameter * 0.3), reboilerNps: capNps(p.reboilerNps, p.diameter * 0.4), psvNps: capNps(p.psvNps, p.diameter * 0.25) })

const A = {
  ladderA: deg(330),
  ladderB: deg(250),
  manway: deg(290),
  feed: deg(180),
  reflux: deg(150),
  reboiler: deg(120),
  bridle: deg(165),
  bottoms: deg(0),
  drain: deg(60),
  psv: deg(90),
  vent: deg(210),
  opening: deg(270),
  dump: deg(30),
}

function layout(p: P) {
  const wall = shellThickness(p.pressure, p.diameter)
  const Ro = p.diameter / 2 + wall
  const bo = headDepth('2:1-ellipsoidal', p.diameter) + wall
  const ins = p.insulated ? 0.06 : 0
  const so = (nps: number) => nozzleStandout(nps, p.rating, p.insulated)
  const fB = flangeDims(p.bottomsNps, p.rating)
  const e0 = Math.max(skirtHeight(p.diameter) + 1, bo + elbow90(p.bottomsNps) + 0.5 + fB.od / 2) // typical: raised for bottoms-pump NPSH
  const tt = p.height
  const e1 = e0 + tt
  const n = clamp(Math.round(p.sections), 1, 6)
  const sump = clamp(0.12 * tt, 1.6, 3)
  const disengage = 1.1
  const hSec = (tt - sump - disengage) / n
  const secTop = (i: number) => e0 + sump + (i + 1) * hSec
  const headTop = (r: number) => e1 + bo * Math.sqrt(Math.max(0, 1 - (r / Ro) ** 2))
  const headBot = (r: number) => e0 - bo * Math.sqrt(Math.max(0, 1 - (r / Ro) ** 2))
  // manways: one in the sump, one above every section (below the next distributor / tray stack)
  const manways = [e0 + 0.9, ...Array.from({ length: n }, (_, i) => Math.min(secTop(i) + 0.5, e1 - 0.6))]
  const yTop = e1 - 0.15
  let levels = manways.map((y) => y - 0.85).filter((y) => y > 1.8 && yTop - y > 1.2)
  levels.push(yTop)
  // ISO 14122-4: rest platform at least every 6 m of climb
  const out: number[] = []
  let prev = 0
  for (const y of levels) {
    while (y - prev > ACCESS.ladder.maxFlight) {
      prev += Math.min(ACCESS.ladder.maxFlight, (y - prev) / Math.ceil((y - prev) / ACCESS.ladder.maxFlight))
      out.push(prev)
    }
    out.push(y)
    prev = y
  }
  levels = out
  const tipY = e0 - bo
  const yRun = skirtRunY(tipY, p.bottomsNps)
  const dStart = at(A.drain, Ro * 0.45, headBot(Ro * 0.45))
  const dRun = Math.min(skirtRunY(dStart[1], 2), yRun)
  const feedY = n > 1 ? secTop(Math.floor(n / 2) - 1) + 0.25 : e0 + sump + hSec * 0.5
  const side = (a: number, y: number, nps: number) => ({ base: at(a, Ro, y), dir: dirOf(a), nps })
  const noz = {
    overhead: { base: [0, e1 + bo, 0] as V3, dir: [0, 1, 0] as V3, nps: p.overheadNps },
    psv: { base: at(A.psv, Ro * 0.5, headTop(Ro * 0.5)), dir: [0, 1, 0] as V3, nps: p.psvNps },
    vent: { base: at(A.vent, Ro * 0.5, headTop(Ro * 0.5)), dir: [0, 1, 0] as V3, nps: 2 },
    reflux: side(A.reflux, e1 - 0.45, p.refluxNps),
    feed: side(A.feed, feedY, p.feedNps),
    reboiler: side(A.reboiler, e0 + sump - 0.45, p.reboilerNps),
  }
  const face = (k: keyof typeof noz) => {
    const z = noz[k]
    const s = so(z.nps)
    return [z.base[0] + z.dir[0] * s, z.base[1] + z.dir[1] * s, z.base[2] + z.dir[2] * s] as V3
  }
  return {
    wall, Ro, bo, ins, so, e0, e1, tt, n, sump, hSec, secTop, headTop, manways, levels, noz, face,
    bottoms: { start: [0, tipY + 0.03, 0] as V3, yRun, face: at(A.bottoms, Ro + so(p.bottomsNps), yRun) },
    drain: { start: [dStart[0], dStart[1] + 0.03, dStart[2]] as V3, yRun: dRun, face: at(A.drain, Ro + so(2), dRun) },
  }
}

export function ports(props: ColumnProps = {}): Port[] {
  const p = fit({ ...defaults, ...props } as P)
  const L = layout(p)
  return [
    port('feed', 'Feed', L.face('feed'), L.noz.feed.dir, p.feedNps, p.rating),
    port('overhead', 'Overhead vapour', L.face('overhead'), [0, 1, 0], p.overheadNps, p.rating),
    port('reflux', 'Reflux / lean solvent', L.face('reflux'), L.noz.reflux.dir, p.refluxNps, p.rating),
    port('reboiler', 'Reboiler return', L.face('reboiler'), L.noz.reboiler.dir, p.reboilerNps, p.rating),
    port('bottoms', 'Bottoms', L.bottoms.face, dirOf(A.bottoms), p.bottomsNps, p.rating),
    port('psv', 'PSV', L.face('psv'), [0, 1, 0], p.psvNps, p.rating, 'relief'),
    port('vent', 'Vent', L.face('vent'), [0, 1, 0], 2, p.rating, 'vent'),
    port('drain', 'Drain', L.drain.face, dirOf(A.drain), 2, p.rating, 'drain'),
  ]
}

export function Column(props: ColumnProps & GroupProps) {
  const { diameter, height, sections, internals, pressure, rating, feedNps, overheadNps, bottomsNps, refluxNps, reboilerNps, psvNps, insulated, fireproofing, tag, paint, ...group } = { ...defaults, ...props }
  const p = fit({ diameter, height, sections, internals, pressure, rating, feedNps, overheadNps, bottomsNps, refluxNps, reboilerNps, psvNps, insulated, fireproofing, tag, paint } as P)
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Column

function build(k: Kit, p: P) {
  const L = layout(p)
  const { Ro, bo, e0, e1, ins, so } = L
  const m = p.paint
  const Rc = Ro + ins
  const proj = projector('y', [0, (e0 + e1) / 2, 0], L.tt / 2, Ro, bo)
  const mw = manwayNps(p.diameter)
  const taps = Array.from({ length: L.n }, (_, i) => L.secTop(i) - 0.25)
  const hole = (pt: V3, d: V3, nps: number): Hole => ({ p: pt, d, r: holeR(nps) })
  const holes: Hole[] = [
    ...(['overhead', 'psv', 'vent', 'reflux', 'feed', 'reboiler'] as const).map((key) => hole(L.noz[key].base, L.noz[key].dir, L.noz[key].nps)),
    ...L.manways.map((y) => hole(at(A.manway, Ro, y), dirOf(A.manway), mw)),
    ...taps.flatMap((y) => [hole(at(deg(20), Ro, y), dirOf(deg(20)), 1), hole(at(deg(40), Ro, y), dirOf(deg(40)), 1)]),
    hole(at(A.bridle, Ro, e0 + 0.25), dirOf(A.bridle), 2),
    hole(at(A.bridle, Ro, e0 + L.sump - 0.8), dirOf(A.bridle), 2),
    { p: [0, e0 - bo, 0], d: [0, -1, 0], r: pipeOD(p.bottomsNps) / 2 - 0.003 },
    { p: [L.drain.start[0], L.drain.start[1] - 0.03, L.drain.start[2]], d: [0, -1, 0], r: pipeOD(2) / 2 - 0.003 },
  ]
  if (p.internals === 'packed') for (let i = 0; i < L.n; i++) holes.push(hole(at(A.dump, Ro, L.secTop(i) - L.hSec + 0.35), dirOf(A.dump), 8))
  shell(k, { Ro, bo, e0, e1, mat: m, insulated: p.insulated, ins, course: 3, holes })

  const trays: number[] = []
  const beds: [number, number][] = []
  for (let i = 0; i < L.n; i++) {
    const y0 = L.secTop(i) - L.hSec + 0.3
    const y1 = L.secTop(i) - 0.35
    if (p.internals === 'packed') beds.push([y0 + 0.3, y1 - 0.4])
    else for (let y = y0; y < y1; y += 0.61) trays.push(y) // 24" tray spacing
  }
  vInternals(k, { Ri: p.diameter / 2, padY: e1 - 0.35, vortex: [[0, e0 - bo + 0.02, 0]], trays, beds })
  for (const key of ['overhead', 'psv', 'reflux', 'feed', 'reboiler'] as const) shellNozzle(k, { ...L.noz[key], rating: p.rating, standout: so(L.noz[key].nps), mat: m, proj, insulated: p.insulated })
  shellNozzle(k, { ...L.noz.vent, rating: p.rating, standout: so(2), mat: m, proj, insulated: p.insulated, blind: true })

  const mwRating = Math.min(p.rating, 600) as Rating
  for (const y of L.manways) {
    manway(k, at(A.manway, Ro, y), dirOf(A.manway), 0.25 + ins, mw, mwRating, m)
    if (!p.insulated) pad(k, m, proj, at(A.manway, Ro, y), dirOf(A.manway), pipeOD(mw) / 2, pipeOD(mw) / 2 + 0.12, 0.02, 48)
  }
  // packed beds: blinded packing-dump nozzle at the foot of each bed
  if (p.internals === 'packed')
    for (let i = 0; i < L.n; i++) shellNozzle(k, { base: at(A.dump, Ro, L.secTop(i) - L.hSec + 0.35), dir: dirOf(A.dump), nps: 8, rating: mwRating, standout: so(8), mat: m, proj, insulated: p.insulated, blind: true })

  // pressure and temperature tappings at each section top, gauges facing out
  for (const y of taps) {
    for (const [a, unit, max] of [[deg(20), 'bar', Math.ceil((p.pressure * 1.6) / 10) * 10], [deg(40), '°C', 150]] as const) {
      shellNozzle(k, { base: at(a, Ro, y), dir: dirOf(a), nps: 1, rating: p.rating, standout: so(1), mat: m })
      gauge(k, at(a, Ro + so(1) + 0.08, y), dirOf(a), 0.15, unit, max)
      k.pipe('stainless', at(a, Ro + so(1) - 0.01, y), at(a, Ro + so(1) + 0.03, y), 0.03, 0.004)
    }
  }

  // skirt, bottoms and drain lines
  const ts = clamp(L.wall * 0.8, 0.012, 0.03)
  const dOp = clamp(Ro * 0.6, 0.5, 0.6)
  const openings = [
    { a: A.opening, y: 0.18 + dOp / 2, d: dOp, access: true },
    { a: A.opening + Math.PI, y: 0.18 + dOp / 2, d: dOp, access: true },
    { a: A.bottoms, y: L.bottoms.yRun, d: pipeOD(p.bottomsNps) + 0.08 },
    { a: A.drain, y: L.drain.yRun, d: pipeOD(2) + 0.08 },
  ]
  skirt(k, m, Ro, e0, ts, openings)
  // 50 mm dense concrete fireproofing outside the skirt, cut back at the openings (typical)
  if (p.fireproofing) skirt(k, 'concrete', Ro + 0.05, e0 - 0.15, 0.05, openings.map((o) => ({ ...o, d: o.d + 0.1 })), 72, { bandsOnly: true, y0: 0.36 })
  // lifting trunnions near the top, tailing lug on the base ring
  for (const a of [deg(15), deg(195)]) {
    const y = e1 - 1.3
    const d = dirOf(a)
    k.cyl(m, 0.11, 0.38 + ins, at(a, Ro + (0.38 + ins) / 2 - 0.01, y), d, 24)
    k.cyl(m, 0.17, 0.025, at(a, Ro + 0.38 + ins, y), d, 24)
    if (!p.insulated) pad(k, m, proj, at(a, Ro, y), d, 0, 0.24, 0.02, 32)
  }
  liftingLug(k, at(deg(180), Ro + 0.2, 0.03), 'x', 1.6, m)
  skirtLine(k, L.bottoms.start, A.bottoms, L.bottoms.yRun, p.bottomsNps, p.rating, Ro + so(p.bottomsNps), m)
  skirtLine(k, L.drain.start, A.drain, L.drain.yRun, 2, p.rating, Ro + so(2), m)
  for (const a of [deg(120), deg(305)]) earthBoss(k, m, at(a, Ro, 0.26), dirOf(a))
  nameplate(k, m, deg(315), Ro, 1.6, p.tag)
  levelBridle(k, { shellR: Ro, a: A.bridle, yLo: e0 + 0.25, yHi: e0 + L.sump - 0.8, rating: p.rating, insulated: p.insulated })

  for (const a of [deg(150), deg(330)]) {
    const r = Ro * 0.62
    liftingLug(k, at(a, r, L.headTop(r) - 0.03), Math.abs(Math.cos(a)) > 0.7 ? 'x' : 'z', clamp(Ro / 0.8, 1, 2), m)
  }

  // platforms and ladders: deck ladder enters P1 through a gate; upper flights alternate A/B and step off sideways
  const rIn = Rc + 0.08
  const eps = 0.45 / (Rc + 0.6)
  const lv = L.levels
  const { ladderA: LA, ladderB: LB } = A
  lv.forEach((y, i) => {
    const last = i === lv.length - 1
    const arrive = i === 0 ? LA : i % 2 ? LB : LA
    if (i === 0) {
      const rOut = platform(k, { y, shellR: Ro, rIn, a0: last ? LA - deg(170) : LB - deg(45), a1: last ? LA + deg(170) : LA + deg(45), gate: LA })
      cagedLadder(k, LA, rOut + 0.06, 0, y, Ro)
      return
    }
    if (last) platform(k, { y, shellR: Ro, rIn, a0: arrive + eps, a1: arrive + Math.PI * 2 - eps })
    else if (arrive === LB) platform(k, { y, shellR: Ro, rIn, a0: LB + eps, a1: LA + deg(45) })
    else platform(k, { y, shellR: Ro, rIn, a0: LB - deg(45), a1: LA - eps })
    cagedLadder(k, arrive, rIn + 0.22, lv[i - 1], y, Ro)
  })
  topDavit(k, deg(60), Rc, lv[lv.length - 1], L.headTop(0) + so(p.overheadNps) + 1.3)
}
