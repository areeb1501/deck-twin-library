// Horizontal two-stage gas filter-separator: davit-hinged quick-opening closure, coalescing + vane sections, twin-compartment liquid sump, saddles, DP gauge. ASME VIII-1, ASME B16.5.
import * as THREE from 'three'
import { Kit, mat4, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { liftingLug, pipeRun, saddle } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { headDepth, nozzleStandout, pipeOD, saddle as saddleDims, shellThickness, type Rating } from '../lib/standards'
import { dialMaterial, levelFlagMaterial, textMaterial } from '../lib/textures'
import { earthBoss, holeR, pad, type Hole, projector, shell, shellNozzle, smoothLathe, vesselProfile, capNps } from './_vessel'

export interface FilterSeparatorProps {
  /** barrel inside diameter, m */
  diameter?: number
  /** barrel length, closure hub to far tangent line, m */
  length?: number
  /** liquid sump inside diameter, m */
  sumpDiameter?: number
  /** design pressure, barg */
  pressure?: number
  rating?: Rating
  inletNps?: number
  outletNps?: number
  drainNps?: number
  psvNps?: number
  insulated?: boolean
  tag?: string
  paint?: MatKey
}

export const defaults = {
  diameter: 0.9,
  length: 4.5,
  sumpDiameter: 0.4,
  pressure: 90,
  rating: 600 as Rating,
  inletNps: 8,
  outletNps: 8,
  drainNps: 2,
  psvNps: 2,
  insulated: false,
  tag: 'F-100',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

/** Nozzles kept in proportion to the shell (typical upper bounds). */
const fit = (p: P): P => ({ ...p, inletNps: capNps(p.inletNps, p.diameter * 0.55), outletNps: capNps(p.outletNps, p.diameter * 0.55), psvNps: capNps(p.psvNps, p.diameter * 0.25) })

function layout(p: P) {
  const wall = shellThickness(p.pressure, p.diameter)
  const Ro = p.diameter / 2 + wall
  const bo = headDepth('2:1-ellipsoidal', p.diameter) + wall
  const wS = shellThickness(p.pressure, p.sumpDiameter)
  const RoS = p.sumpDiameter / 2 + wS
  const boS = headDepth('2:1-ellipsoidal', p.sumpDiameter) + wS
  const so = (nps: number) => nozzleStandout(nps, p.rating, p.insulated)
  const L = p.length
  const yS = RoS + so(p.drainNps) + 0.3
  const gap = 0.3 // downcomer length, typical
  const yc = yS + RoS + gap + Ro
  const sd = saddleDims(2 * Ro, L)
  const xs = L / 2 - Math.max(sd.positionFromTangent, 0.35)
  // one sump barrel per stage, each with its own heads (typical)
  const Ls = Math.max(0.5, (2 * (xs - 0.3) - 0.3) / 2 - 2 * boS)
  const cs = [-(0.15 + Ls / 2 + boS), 0.15 + Ls / 2 + boS]
  const x0 = -L / 2
  const n = {
    inlet: { base: [x0 + L * 0.2, yc + Ro, 0] as V3, dir: [0, 1, 0] as V3, nps: p.inletNps },
    outlet: { base: [L * 0.36, yc + Ro, 0] as V3, dir: [0, 1, 0] as V3, nps: p.outletNps },
    psv: { base: [L * 0.06, yc + Ro, 0] as V3, dir: [0, 1, 0] as V3, nps: p.psvNps },
    'drain-1': { base: [cs[0] + Ls * 0.22, yS - RoS, 0] as V3, dir: [0, -1, 0] as V3, nps: p.drainNps },
    'drain-2': { base: [cs[1] + Ls * 0.22, yS - RoS, 0] as V3, dir: [0, -1, 0] as V3, nps: p.drainNps },
  }
  const face = (k: keyof typeof n) => {
    const z = n[k]
    const s = so(z.nps)
    return [z.base[0] + z.dir[0] * s, z.base[1] + z.dir[1] * s, z.base[2]] as V3
  }
  return { wall, Ro, bo, RoS, boS, so, L, yS, yc, xs, Ls, cs, x0, n, face }
}

export function ports(props: FilterSeparatorProps = {}): Port[] {
  const p = fit({ ...defaults, ...props } as P)
  const L = layout(p)
  return [
    port('inlet', 'Inlet', L.face('inlet'), [0, 1, 0], p.inletNps, p.rating),
    port('outlet', 'Outlet', L.face('outlet'), [0, 1, 0], p.outletNps, p.rating),
    port('drain-1', 'Drain, filter section', L.face('drain-1'), [0, -1, 0], p.drainNps, p.rating, 'drain'),
    port('drain-2', 'Drain, vane section', L.face('drain-2'), [0, -1, 0], p.drainNps, p.rating, 'drain'),
    port('psv', 'PSV', L.face('psv'), [0, 1, 0], p.psvNps, p.rating, 'relief'),
  ]
}

export function FilterSeparator(props: FilterSeparatorProps & GroupProps) {
  const { diameter, length, sumpDiameter, pressure, rating, inletNps, outletNps, drainNps, psvNps, insulated, tag, paint, ...group } = { ...defaults, ...props }
  const p = fit({ diameter, length, sumpDiameter, pressure, rating, inletNps, outletNps, drainNps, psvNps, insulated, tag, paint } as P)
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default FilterSeparator

function build(k: Kit, p: P) {
  const G = layout(p)
  const { Ro, bo, RoS, boS, so, L, yS, yc, xs, Ls, cs, x0 } = G
  const m = p.paint
  const ins = p.insulated ? 0.05 : 0
  const proj = projector('x', [0, yc, 0], L / 2, Ro, bo)
  const projS = (x: number) => projector('x', [x, yS, 0], Ls / 2, RoS, boS)
  const dc = cs.map((c) => c - Ls * 0.22)
  const dr = pipeOD(3) / 2 - 0.004
  const hb = (key: keyof typeof G.n): Hole => ({ p: G.n[key].base, d: G.n[key].dir, r: holeR(G.n[key].nps) })
  const barrelHoles: Hole[] = [hb('inlet'), hb('outlet'), hb('psv'), { p: [L * 0.22, yc + Ro, 0], d: [0, 1, 0], r: holeR(2) }, ...dc.map((x): Hole => ({ p: [x, yc - Ro, 0], d: [0, -1, 0], r: dr }))]

  shell(k, { Ro, bo, e0: x0, e1: L / 2, mat: m, axis: 'x', centre: [0, yc, 0], bottom: false, insulated: p.insulated, ins, holes: barrelHoles })
  cs.forEach((c, i) => {
    const h: Hole[] = [hb(i ? 'drain-2' : 'drain-1'), { p: [dc[i], yS + RoS, 0], d: [0, 1, 0], r: dr }]
    shell(k, { Ro: RoS, bo: boS, e0: -Ls / 2, e1: Ls / 2, mat: m, axis: 'x', centre: [c, yS, 0], insulated: p.insulated, ins, seg: 40, course: 9, holes: h })
  })

  for (const key of ['inlet', 'outlet', 'psv', 'drain-1', 'drain-2'] as const) {
    const z = G.n[key]
    shellNozzle(k, { ...z, rating: p.rating, standout: so(z.nps), mat: m, proj: key === 'drain-1' ? projS(cs[0]) : key === 'drain-2' ? projS(cs[1]) : proj, insulated: p.insulated })
  }
  shellNozzle(k, { base: [L * 0.22, yc + Ro, 0], dir: [0, 1, 0], nps: 2, rating: p.rating, standout: so(2), mat: m, proj, insulated: p.insulated, blind: true })

  // downcomer from each stage into its own sump barrel
  dc.forEach((x, i) => {
    const nps = 3
    k.pipe(m, [x, yc - Ro + 0.02, 0], [x, yS + RoS - 0.02, 0], pipeOD(nps), 0.008)
    if (!p.insulated) {
      pad(k, m, proj, [x, yc - Ro, 0], [0, -1, 0], pipeOD(nps) / 2, pipeOD(nps) * 0.95, 0.012, 28)
      pad(k, m, projS(cs[i]), [x, yS + RoS, 0], [0, 1, 0], pipeOD(nps) / 2, pipeOD(nps) * 0.95, 0.012, 28)
    }
  })

  // saddles under the barrel, clear of the sump
  k.at([0, yc, 0], undefined, () => {
    saddle(k, -xs, Ro, -yc, { mat: m })
    saddle(k, xs, Ro, -yc, { mat: m, sliding: true })
  })
  for (const x of [-xs, xs]) earthBoss(k, m, [x + 0.1, 0.12, Ro * 0.88 + 0.04], [0, 0, 1])

  closure(k, p, G, m)

  // sump level gauges, one per compartment
  for (const x of cs) {
    const z = RoS + 0.22
    for (const y of [yS - RoS * 0.55, yS + RoS * 0.55]) k.pipe('stainless', [x, y, Math.sqrt(RoS * RoS - (y - yS) ** 2) - 0.01], [x, y, z], 0.033, 0.004)
    k.cyl('stainless', 0.03, RoS * 1.6, [x, yS, z], 'y', 16)
    k.box('stainless', [0.06, RoS * 1.5, 0.05], [x + 0.065, yS, z])
    k.box(levelFlagMaterial(0.4), [0.03, RoS * 1.4, 0.002], [x + 0.065, yS, z + 0.026])
    k.rbox('actuatorBlue', [0.1, 0.1, 0.1], 0.015, [x, yS + RoS * 0.8 + 0.06, z])
  }

  // differential pressure gauge across the coalescer elements on a shell bracket
  const gz = Ro + ins + 0.3
  const gy = yc - Ro * 0.35
  const tapA: V3 = [x0 + L * 0.12, yc + Ro * 0.5, Ro * 0.866]
  const tapB: V3 = [L * 0.2, yc + Ro * 0.5, Ro * 0.866]
  for (const t of [tapA, tapB]) {
    const out: V3 = [t[0], t[1] + 0.08, t[2] + 0.14 + ins]
    k.pipe(m, t, out, 0.033, 0.004)
    k.cyl('valveBody', 0.03, 0.08, add(out, [0, 0, 0.02]), 'z', 12)
  }
  k.tube('tubing', [[tapA[0], tapA[1] + 0.08, tapA[2] + 0.2 + ins], [tapA[0], gy + 0.05, gz - 0.02], [-0.06, gy + 0.05, gz - 0.02]], 0.006, 8, 0.05)
  k.tube('tubing', [[tapB[0], tapB[1] + 0.08, tapB[2] + 0.2 + ins], [tapB[0], gy + 0.05, gz - 0.02], [0.06, gy + 0.05, gz - 0.02]], 0.006, 8, 0.05)
  k.box(m, [0.3, 0.2, 0.012], [0, gy, Ro * 0.94 + ins + 0.02], new THREE.Quaternion())
  k.box(m, [0.02, 0.16, gz - Ro * 0.94 - ins], [0, gy, (gz + Ro * 0.94 + ins) / 2])
  k.cyl('stainless', 0.1, 0.07, [0, gy + 0.05, gz + 0.02], 'z', 28)
  k.add(dialMaterial('bar', 2), new THREE.CircleGeometry(0.088, 28), mat4([0, gy + 0.05, gz + 0.056]))
  k.disc('glass', 0.092, [0, gy + 0.05, gz + 0.06], 'z', 28)
  k.box(textMaterial('PDI', '#f2f2ee', '#111', 128, 64), [0.09, 0.045, 0.004], [0, gy - 0.1, gz + 0.02])

  for (const x of [-L * 0.28, L * 0.28]) liftingLug(k, [x, yc + Ro + ins - 0.01, 0], 'x', 1, m)
  const q = new THREE.Quaternion()
  k.box(m, [0.42, 0.28, 0.006], [L * 0.05, yc - Ro * 0.1, Ro + ins + 0.04], q)
  k.box('nameplate', [0.36, 0.2, 0.003], [L * 0.05, yc - Ro * 0.1 + 0.02, Ro + ins + 0.044], q)
  for (const s of [-1, 1]) k.box(m, [0.03, 0.07, 0.04], [L * 0.05 + s * 0.15, yc - Ro * 0.1, Ro + ins + 0.02], q)
  k.box(textMaterial(p.tag, '#f2f2ee', '#111', 256, 64), [0.3, 0.075, 0.003], [L * 0.05, yc - Ro * 0.1 - 0.105, Ro + ins + 0.044], q)
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** Quick-opening closure on the -X end: forged hub, locking band, dished door, davit hinge post and arm, handwheel and pressure-warning lock. */
function closure(k: Kit, p: P, G: ReturnType<typeof layout>, m: MatKey) {
  const { Ro, yc, x0 } = G
  const hubL = 0.16
  const Rh = Ro + 0.07
  const xF = x0 - hubL
  k.lathe(m, [[Ro - 0.02, hubL + 0.08], [Ro, hubL + 0.08], [Rh, hubL - 0.02], [Rh, 0], [Ro - 0.03, 0], [Ro - 0.02, hubL + 0.08]], [xF, yc, 0], 'x', 64)
  const tD = 0.07
  k.lathe('flangeSteel', [[Ro - 0.02, 0], [Rh, 0], [Rh, -tD], [Ro - 0.02, -tD]], [xF, yc, 0], 'x', 64)
  const db = 0.2 * p.diameter
  const dome = smoothLathe(vesselProfile(Ro + 0.01, db, 0, 0, 20, false, true).filter(([, y]) => y >= 0), 56)
  k.add(m, dome, mat4([xF - tD, yc, 0], '-x'))
  // locking band with closing lugs, screw and safety lock
  k.lathe('flangeSteel', [[Rh + 0.035, -tD - 0.03], [Rh + 0.035, 0.05], [Rh - 0.005, 0.05], [Rh - 0.005, -tD - 0.03]], [xF, yc, 0], 'x', 64)
  for (const s of [-1, 1]) k.box('flangeSteel', [0.12, 0.09, 0.04], [xF - tD / 2 + 0.01, yc + Rh + 0.07, s * 0.04])
  k.rod('boltXylan', [xF - tD / 2 + 0.01, yc + Rh + 0.08, -0.12], [xF - tD / 2 + 0.01, yc + Rh + 0.08, 0.12], 0.012, 8)
  for (const s of [-1, 1]) k.hex('nut', 0.04, 0.025, [xF - tD / 2 + 0.01, yc + Rh + 0.08, s * 0.08], 'z')
  k.box('brass', [0.06, 0.05, 0.05], [xF - tD / 2 + 0.01, yc + Rh + 0.15, 0.0])
  // davit: hinge post on the hub (+Z side), arm round to a boss on the door centre
  const zP = Rh + 0.18
  const xP = xF + 0.08
  for (const y of [yc - 0.25, yc + 0.25]) {
    k.box('equipmentPaintDark', [0.1, 0.05, zP - Ro + 0.02], [xP, y, (zP + Ro) / 2])
    k.cyl('equipmentPaintDark', 0.045, 0.06, [xP, y, zP], 'y', 16)
  }
  k.rod('equipmentPaintDark', [xP, yc - 0.32, zP], [xP, yc + 0.34, zP], 0.028, 12)
  const xA = xF - tD - db - 0.12
  pipeRun(k, [[xP, yc + 0.32, zP], [xA, yc + 0.32, zP], [xA, yc + 0.32, 0], [xA, yc + 0.06, 0]], 2, { mat: 'equipmentPaintDark', welds: false })
  k.cyl('equipmentPaintDark', 0.06, 0.12, [xF - tD - db + 0.03, yc, 0], 'x', 20)
  k.rod('equipmentPaintDark', [xA - 0.02, yc, 0], [xF - tD - db, yc, 0], 0.03, 12)
  k.handwheel('handwheel', 0.3, [xA - 0.04, yc, 0], '-x', 4)
}
