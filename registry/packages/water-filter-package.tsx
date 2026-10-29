// Multimedia (sand / anthracite) pressure filter package: vertical filter vessels with front face piping, actuated butterfly valves, backwash headers. ASME VIII-1, AWWA B100 media.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, manway, nozzle, pipeRun, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { SECTIONS, headDepth, pipeOD, shellThickness, type Rating } from '../lib/standards'
import { blFlange, branchMouth, butterflySpan, butterflyValve, cableTray, earthBoss, localPanel, mateFlange, padeyeShackles, pipeSupport, shellLabel, smallValve, transmitter, vVessel, vesselLegs } from './_skid'

export interface WaterFilterPackageProps {
  /** filter vessels (duty + backwash standby) */
  filters?: number
  /** vessel inside diameter, m */
  filterDiameter?: number
  /** vessel tangent height (media bed + freeboard), m */
  filterHeight?: number
  /** design pressure, barg */
  pressure?: number
  headerNps?: number
  branchNps?: number
  rating?: Rating
  tag?: string
}

export const defaults = {
  filters: 3,
  filterDiameter: 1.2,
  filterHeight: 1.8,
  pressure: 10,
  headerNps: 6,
  branchNps: 4,
  rating: 150 as Rating,
  tag: 'X-W330',
}

type P = typeof defaults

const SKID = 'HEB 200'
const VES: MatKey = 'equipmentPaint'
const FACE: MatKey = 'pipePaint'

function layout(p: P) {
  const N = Math.max(2, Math.min(4, Math.round(p.filters)))
  const D = p.filterDiameter
  const wall = shellThickness(p.pressure, D)
  const Ro = D / 2 + wall
  const hd = headDepth('2:1-ellipsoidal', D) + wall
  const TT = p.filterHeight
  const sp = D + 0.75
  const xs = Array.from({ length: N }, (_, i) => (i - (N - 1) / 2) * sp)
  const L = N * sp + 1.3
  const y0 = SECTIONS[SKID].d + 0.008
  const yTL = y0 + 0.55 + hd
  const yL = yTL + 0.3
  const yU = yTL + TT - 0.3
  const Dh = pipeOD(p.headerNps)
  const yOH = yL - 0.55
  const yIH = yU + 0.6
  const zV = -0.45
  const zN = zV + Ro + 0.22
  const zP1 = zN + 0.3
  const zP2 = zP1 + butterflySpan(p.branchNps, p.rating) + 0.55
  const W = zP2 + Dh / 2 + 0.45 - (zV - Ro - 0.35)
  const zc = (zP2 + Dh / 2 + 0.45 + zV - Ro - 0.35) / 2
  return { N, D, wall, Ro, hd, TT, sp, xs, L, W, y0, yTL, yL, yU, yOH, yIH, Dh, zV: zV - zc, zN: zN - zc, zP1: zP1 - zc, zP2: zP2 - zc }
}

export function ports(props: WaterFilterPackageProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [
    port('inlet', 'Raw water in', [-g.L / 2, g.yIH, g.zP1], [-1, 0, 0], p.headerNps, p.rating),
    port('outlet', 'Filtered water out', [g.L / 2, g.yOH, g.zP1], [1, 0, 0], p.headerNps, p.rating),
    port('backwash', 'Backwash waste out', [g.L / 2, g.yU, g.zP2], [1, 0, 0], p.headerNps, p.rating, 'drain'),
  ]
}

export function WaterFilterPackage(props: WaterFilterPackageProps & GroupProps) {
  const { filters, filterDiameter, filterHeight, pressure, headerNps, branchNps, rating, tag, ...group } = { ...defaults, ...props }
  const p = { filters, filterDiameter, filterHeight, pressure, headerNps, branchNps, rating, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default WaterFilterPackage

function build(k: Kit, p: P) {
  const g = layout(p)
  const { L, W, y0, yTL, yL, yU, yOH, yIH, Dh, zV, zN, zP1, zP2, Ro, TT } = g
  const R = p.rating
  const bn = p.branchNps
  const Db = pipeOD(bn)
  const hn = p.headerNps
  const Sb = butterflySpan(bn, R)
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)
  tagPlate(k, p.tag, [-L / 2 + 0.8, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.3)
  earthBoss(k, [L / 2 - 0.4, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])

  for (const [i, x] of g.xs.entries()) {
    const V = vVessel(k, x, zV, yTL, g.D, TT, g.wall, VES)
    vesselLegs(k, x, zV, Ro, yTL + 0.1, y0, 4, VES)
    shellLabel(k, `MULTIMEDIA FILTER ${String.fromCharCode(65 + i)}`, x, yTL + TT * 0.55, zV, Ro, Ro * 0.12, 1.3)
    tagPlate(k, `${p.tag}${String.fromCharCode(65 + i)}`, [x + Ro * 0.5, yTL + TT * 0.35, zV + Ro * 0.87 + 0.002], [0.5, 0, 0.87], 0.16)
    // top manway (media loading), side media-removal manway on the back, air release valve
    manway(k, [x, V.yTop - 0.05, zV], [0, 1, 0], 0.18, 18, 150, VES)
    manway(k, [x - Ro * 0.7, yTL + 0.25, zV - Ro * 0.7], [-0.7, 0, -0.7], 0.15, 12, 150, VES)
    k.tube('pipePaint', [[x + Ro * 0.55, yTL + TT + g.hd * 0.6, zV], [x + Ro * 0.55, V.yTop + 0.12, zV]], 0.018, 8)
    k.rbox('valveBody', [0.08, 0.1, 0.08], 0.01, [x + Ro * 0.55, V.yTop + 0.16, zV])
    k.tube('tubing', [[x + Ro * 0.55, V.yTop + 0.21, zV], [x + Ro * 0.55, V.yTop + 0.3, zV], [x + Ro * 0.75, V.yTop + 0.3, zV]], 0.006, 6, 0.02)
    // bottom drain
    k.tube('pipePaint', [[x, V.yBot + 0.01, zV], [x, y0 + 0.2, zV], [x, y0 + 0.2, zV - Ro - 0.15]], 0.02, 8, 0.04)
    smallValve(k, 'ball', [x, y0 + 0.2, zV - Ro * 0.5], [0, 0, -1], 0.014)

    // upper nozzle: run forward through V2 (backwash out) with V1 (service inlet) branching up to the inlet header
    const up = nozzle(k, { base: [x, yU, zV + Ro], dir: [0, 0, 1], nps: bn, rating: R, standout: zN - zV - Ro, mat: VES, studs: false })
    const uw = mateFlange(k, up, [0, 0, 1], bn, R)
    k.pipe(FACE, uw, [x, yU, zP1 + Db], Db, 0.006)
    butterflyValve(k, [x, yU, zP1 + Db + Sb / 2], [0, 0, 1], bn, R, [1, 0, 0])
    k.pipe(FACE, [x, yU, zP1 + Db + Sb], [x, yU, zP2 - Dh / 2 + 0.004], Db, 0.006)
    branchMouth(k, [x, yU, zP2 - Dh / 2 + 0.0035], [0, 0, -1], bn)
    k.pipe(FACE, [x, yU + Db / 2 - 0.004, zP1], [x, yU + 0.12, zP1], Db, 0.006)
    branchMouth(k, [x, yU + Db / 2 - 0.0035, zP1], [0, 1, 0], bn)
    butterflyValve(k, [x, yU + 0.12 + Sb / 2, zP1], [0, 1, 0], bn, R, [0, 0, 1])
    k.pipe(FACE, [x, yU + 0.12 + Sb, zP1], [x, yIH - Dh / 2 + 0.004, zP1], Db, 0.006)
    branchMouth(k, [x, yIH - Dh / 2 + 0.0035, zP1], [0, -1, 0], bn)
    // lower nozzle: run forward through V4 (backwash in) with V3 (service outlet) branching down to the outlet header
    const lo = nozzle(k, { base: [x, yL, zV + Ro], dir: [0, 0, 1], nps: bn, rating: R, standout: zN - zV - Ro, mat: VES, studs: false })
    const lw = mateFlange(k, lo, [0, 0, 1], bn, R)
    k.pipe(FACE, lw, [x, yL, zP1 + Db], Db, 0.006)
    butterflyValve(k, [x, yL, zP1 + Db + Sb / 2], [0, 0, 1], bn, R, [1, 0, 0])
    k.pipe(FACE, [x, yL, zP1 + Db + Sb], [x, yL, zP2 - Dh / 2 + 0.004], Db, 0.006)
    branchMouth(k, [x, yL, zP2 - Dh / 2 + 0.0035], [0, 0, -1], bn)
    k.pipe(FACE, [x, yL - Db / 2 + 0.004, zP1], [x, yL - 0.12, zP1], Db, 0.006)
    branchMouth(k, [x, yL - Db / 2 + 0.0035, zP1], [0, -1, 0], bn)
    butterflyValve(k, [x, yL - 0.12 - Sb / 2, zP1], [0, -1, 0], bn, R, [0, 0, 1])
    k.pipe(FACE, [x, yL - 0.12 - Sb, zP1], [x, yOH + Dh / 2 - 0.004, zP1], Db, 0.006)
    branchMouth(k, [x, yOH + Dh / 2 - 0.0035, zP1], [0, 1, 0], bn)
    // differential pressure gauge across the bed, sample points
    k.tube('tubing', [[x - 0.12, yU, zN - 0.05], [x - 0.12, (yU + yL) / 2, zN + 0.05], [x - 0.12, yL, zN - 0.05]], 0.005, 6, 0.04)
    gauge(k, [x - 0.12, (yU + yL) / 2, zN + 0.08], 'z', 0.1, 'bar', 2)
    for (const y of [yU, yL]) smallValve(k, 'needle', [x + 0.14, y - 0.05, zN + 0.02], [0, -1, 0], 0.007, [0, 0, 1])
  }

  // headers: inlet (top, BL at -X), outlet (bottom, BL at +X), backwash out (front top, BL at +X), backwash in (front bottom)
  const x0 = g.xs[0] - 0.35
  const x1 = g.xs[g.N - 1] + 0.35
  const cap = (pos: V3, dir: V3) => k.dome(FACE, Dh / 2, pos, dir, Math.PI / 2, 0.5, 28)
  const iw = blFlange(k, [-L / 2, yIH, zP1], [-1, 0, 0], hn, R)
  pipeRun(k, [iw, [x1, yIH, zP1]], hn)
  cap([x1, yIH, zP1], [1, 0, 0])
  const ow = blFlange(k, [L / 2, yOH, zP1], [1, 0, 0], hn, R)
  const xc0 = x0 - 0.3
  pipeRun(k, [[xc0 - 0.15, yOH, zP1], ow], hn)
  cap([xc0 - 0.15, yOH, zP1], [-1, 0, 0])
  const bw = blFlange(k, [L / 2, yU, zP2], [1, 0, 0], hn, R)
  pipeRun(k, [[x0, yU, zP2], bw], hn)
  cap([x0, yU, zP2], [-1, 0, 0])
  // backwash-in header, fed from the outlet header through a gear-operated butterfly valve
  const Sh = butterflySpan(hn, R)
  const zVs = zP2 - 0.26 - Sh / 2
  pipeRun(k, [[x1, yL, zP2], [xc0, yL, zP2], [xc0, yOH, zP2], [xc0, yOH, zVs + Sh / 2]], hn)
  cap([x1, yL, zP2], [1, 0, 0])
  butterflyValve(k, [xc0, yOH, zVs], [0, 0, -1], hn, R, [0, 1, 0], 'gear')
  k.pipe(FACE, [xc0, yOH, zVs - Sh / 2], [xc0, yOH, zP1 + Dh / 2 - 0.004], Dh, 0.007)
  branchMouth(k, [xc0, yOH, zP1 + Dh / 2 - 0.0035], [0, 0, 1], hn)
  // header instruments and flow meters
  transmitter(k, [-L / 2 + 0.5, yIH + Dh / 2, zP1], [0, 1, 0], 0.08)
  transmitter(k, [L / 2 - 0.5, yOH + Dh / 2, zP1], [0, 1, 0], 0.08)
  for (const [x, y] of [[-L / 2 + 0.8, yIH], [L / 2 - 0.85, yOH]] as const) {
    k.cyl('valveBody', Dh / 2 + 0.02, 0.35, [x, y, zP1], 'x', 28)
    k.rbox('actuatorBlue', [0.16, 0.14, 0.14], 0.02, [x, y + Dh / 2 + 0.12, zP1])
    k.cyl('actuatorBlue', 0.025, 0.08, [x, y + Dh / 2 + 0.04, zP1], 'y', 10)
  }
  // supports
  for (const x of [-L / 2 + 0.35, x1 + 0.1]) pipeSupport(k, [x, yIH, zP1], Dh, y0, 'x')
  for (const x of [x0 + 0.15, L / 2 - 0.35]) pipeSupport(k, [x, yOH, zP1], Dh, y0, 'x')
  for (const x of [x0 + 0.15, x1 - 0.1]) pipeSupport(k, [x, yL, zP2], Dh, y0, 'x')
  for (const x of g.xs) k.box('galvanised', [0.06, 0.06, 0.06], [x + 0.25, yU - Dh / 2 - 0.03, zP2])
  for (const x of [g.xs[0] + 0.25, x1]) {
    k.box('galvanised', [0.06, yU - Dh / 2 - yL - Dh / 2 - 0.03, 0.06], [x, (yU + yL) / 2, zP2])
  }

  // valve control panel (solenoid manifold + PLC) with air tubing, cable tray
  const px = g.xs[g.N - 1] + 0.5
  const pz = W / 2 - 0.25
  const gl = localPanel(k, [px, y0, pz], [0, 0, 1], { w: 0.55, h: 0.65, top: 1.85, title: 'FILTER CONTROL PANEL', buttons: 4 })
  for (const x of g.xs) {
    const s = THREE.MathUtils.clamp(Db * 2.2, 0.18, 0.6)
    k.tube('tubing', [[px - 0.2, y0 + 1.1, pz + 0.05], [px - 0.2, yU + 0.12 + Sb / 2 + 0.1, pz - 0.1], [x + s * 0.3, yU + 0.12 + Sb / 2 + 0.1, zP1 + 0.1]], 0.004, 6, 0.05)
  }
  cableTray(k, [[px, gl[1] - 0.04, gl[2]], [px, y0 + 0.2, gl[2]], [px, y0 + 0.2, W / 2 - 0.1], [g.xs[0], y0 + 0.2, W / 2 - 0.1]], [1, 0, 0], 0.15, 2)
}
