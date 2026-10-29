// LPG bullet: horizontal pressure storage on a fixed and a sliding saddle, hemispherical or 2:1 heads, twin PSVs, manways, level bridle, top walkway and deluge. ASME VIII-1, API 2510.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, gauge, grating, ladder, manway, member, nozzle, saddle, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, headDepth, nozzleStandout, pipeOD, psv, saddle as saddleDims, shellThickness, type Rating } from '../lib/standards'
import { paint } from '../lib/materials'
import { levelFlagMaterial } from '../lib/textures'
import { earthBoss, holeR, mateFlange, pad, pipeSkin, projector, reliefValve, shell, shellNozzle, smallValve, type Hole } from './_vessel'

export interface BulletTankProps {
  /** inside diameter, m */
  diameter?: number
  /** tangent-to-tangent length, m */
  length?: number
  /** design pressure, barg */
  pressure?: number
  rating?: Rating
  heads?: 'hemispherical' | '2:1'
  inletNps?: number
  outletNps?: number
  vapourNps?: number
  /** relief header size */
  psvNps?: number
  deluge?: boolean
  tag?: string
}

export const defaults = {
  diameter: 3,
  length: 16,
  pressure: 17.5,
  rating: 300 as Rating,
  heads: 'hemispherical' as 'hemispherical' | '2:1',
  inletNps: 4,
  outletNps: 4,
  vapourNps: 3,
  psvNps: 6,
  deluge: true,
  tag: 'V-600',
}

type P = typeof defaults

function layout(p: P) {
  const wall = shellThickness(p.pressure, p.diameter)
  const Ro = p.diameter / 2 + wall
  const bo = headDepth(p.heads === '2:1' ? '2:1-ellipsoidal' : 'hemispherical', p.diameter) + wall
  const yc = Ro + 1.4 // bottom outlet clearance, typical
  const L = p.length
  const so = (nps: number) => nozzleStandout(nps, p.rating)
  const top = (x: number): V3 => [x, yc + Ro, 0]
  const bot = (x: number): V3 => [x, yc - Ro, 0]
  const n = {
    inlet: { base: top(-L * 0.3), dir: [0, 1, 0] as V3, nps: p.inletNps },
    vapour: { base: top(L * 0.3), dir: [0, 1, 0] as V3, nps: p.vapourNps },
    outlet: { base: bot(-L * 0.18), dir: [0, -1, 0] as V3, nps: p.outletNps },
    drain: { base: bot(L * 0.18), dir: [0, -1, 0] as V3, nps: 2 },
  }
  const face = (k: keyof typeof n) => [n[k].base[0], n[k].base[1] + n[k].dir[1] * so(n[k].nps), 0] as V3
  const sv = psv('J', p.rating)
  const psvX = [-0.55, 0.55]
  const yH = yc + Ro + so(3) + sv.centreToInlet
  const hz = -0.45
  const hEnd: V3 = [1.35, yH, hz]
  return { wall, Ro, bo, yc, L, so, n, face, sv, psvX, yH, hz, hEnd }
}

export function ports(props: BulletTankProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const G = layout(p)
  return [
    port('inlet', 'Liquid inlet', G.face('inlet'), [0, 1, 0], p.inletNps, p.rating),
    port('outlet', 'Liquid outlet', G.face('outlet'), [0, -1, 0], p.outletNps, p.rating),
    port('vapour', 'Vapour balance', G.face('vapour'), [0, 1, 0], p.vapourNps, p.rating),
    port('psv', 'Relief header', G.hEnd, [1, 0, 0], p.psvNps, 150, 'relief'),
    port('drain', 'Drain', G.face('drain'), [0, -1, 0], 2, p.rating, 'drain'),
  ]
}

export function BulletTank(props: BulletTankProps & GroupProps) {
  const { diameter, length, pressure, rating, heads, inletNps, outletNps, vapourNps, psvNps, deluge, tag, ...group } = { ...defaults, ...props }
  const p = { diameter, length, pressure, rating, heads, inletNps, outletNps, vapourNps, psvNps, deluge, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default BulletTank

function build(k: Kit, p: P) {
  const G = layout(p)
  const { Ro, bo, yc, L, so } = G
  const m: MatKey = paint('#E6E7E2')
  const proj = projector('x', [0, yc, 0], L / 2, Ro, bo)
  const mwX = [-L * 0.42, L * 0.42]
  const bx = L * 0.08
  const bz = Ro + 0.45
  const tapY = [yc - Ro * 0.6, yc + Ro * 0.6]
  const tapZ = (y: number) => Math.sqrt(Ro * Ro - (y - yc) ** 2)
  const holes: Hole[] = [
    ...(['inlet', 'vapour', 'outlet', 'drain'] as const).map((key): Hole => ({ p: G.n[key].base, d: G.n[key].dir, r: holeR(G.n[key].nps) })),
    ...G.psvX.map((x): Hole => ({ p: [x, yc + Ro, 0], d: [0, 1, 0], r: holeR(3) })),
    ...mwX.map((x): Hole => ({ p: [x, yc + Ro, 0], d: [0, 1, 0], r: holeR(24) })),
    ...tapY.map((y): Hole => ({ p: [bx, y, tapZ(y)], d: [0, 0, 1], r: holeR(2) })),
  ]
  shell(k, { Ro, bo, e0: -L / 2, e1: L / 2, mat: m, axis: 'x', centre: [0, yc, 0], holes, course: 2.4 })
  for (const key of ['inlet', 'vapour', 'outlet', 'drain'] as const) shellNozzle(k, { ...G.n[key], rating: p.rating, standout: so(G.n[key].nps), mat: m, proj })
  for (const x of mwX) {
    manway(k, [x, yc + Ro, 0], [0, 1, 0], 0.3, 24, Math.min(p.rating, 600) as Rating, m)
    pad(k, m, proj, [x, yc + Ro, 0], [0, 1, 0], pipeOD(24) / 2, pipeOD(24) / 2 + 0.14, 0.02, 48)
  }

  // saddles: fixed at -X, sliding (slotted holes) at +X
  const sd = saddleDims(2 * Ro, L)
  const xs = L / 2 - sd.positionFromTangent
  k.at([0, yc, 0], undefined, () => {
    saddle(k, -xs, Ro, -yc, { mat: m })
    saddle(k, xs, Ro, -yc, { mat: m, sliding: true })
  })
  for (const x of [-xs, xs]) earthBoss(k, m, [x + 0.15, 0.2, Ro * 0.88 + 0.06], [0, 0, 1])

  // twin PSVs into a relief header (branches open into the header bore)
  const hR = pipeOD(p.psvNps) / 2
  const on = G.sv.outletNps
  for (const x of G.psvX) {
    const f = nozzle(k, { base: [x, yc + Ro, 0], dir: [0, 1, 0], nps: 3, rating: p.rating, standout: so(3), mat: m, studs: false })
    const out = reliefValve(k, f, p.rating, 'J', [0, 0, -1])
    const hub = mateFlange(k, on, 150, out, [0, 0, -1])
    k.pipe('pipePaint', hub, [out[0], out[1], G.hz + hR * 0.6], pipeOD(on), 0.006)
  }
  const x0 = G.psvX[0] - 0.25
  const fe = flangeDims(p.psvNps, 150)
  pipeSkin(k, 'pipePaint', [x0, G.yH, G.hz], [G.hEnd[0] - fe.hubLength - fe.raisedFaceHeight, G.yH, G.hz], 2 * hR, G.psvX.map((x): Hole => ({ p: [x, G.yH, G.hz + hR], d: [0, 0, 1], r: pipeOD(on) / 2 - 0.004 })))
  k.dome('pipePaint', hR, [x0, G.yH, G.hz], '-x', Math.PI / 2, 0.5, 20)
  k.dome('vesselInner', hR, [x0, G.yH, G.hz], '-x', Math.PI / 2, 0.5, 20)
  flange(k, p.psvNps, 150, G.hEnd, [1, 0, 0], true)

  // side level bridle with magnetic flap gauge, PI and TI on top
  for (const y of tapY) {
    const z0 = tapZ(y)
    k.pipe('stainless', [bx, y, z0 - 0.02], [bx, y, bz], pipeOD(2), 0.005)
    smallValve(k, [bx, y, z0 + 0.18], [0, 0, 1], [0, 1, 0], pipeOD(2))
  }
  k.pipe('stainless', [bx, tapY[0] - 0.3, bz], [bx, tapY[1] + 0.2, bz], pipeOD(3), 0.006)
  k.box('stainless', [0.07, tapY[1] - tapY[0] + 0.2, 0.06], [bx + 0.1, (tapY[0] + tapY[1]) / 2, bz])
  k.box(levelFlagMaterial(0.6), [0.03, tapY[1] - tapY[0] + 0.1, 0.004], [bx + 0.1, (tapY[0] + tapY[1]) / 2, bz + 0.032])
  smallValve(k, [bx, tapY[0] - 0.4, bz], [0, 1, 0], [0, 0, 1], pipeOD(1))
  k.rbox('actuatorBlue', [0.15, 0.14, 0.14], 0.03, [bx, tapY[1] + 0.32, bz])
  for (const [x, unit, max] of [[L * 0.12, 'bar', 25], [L * 0.16, '°C', 100]] as const) {
    k.pipe('stainless', [x, yc + Ro - 0.01, 0.35], [x, yc + Ro + 0.22, 0.35], 0.03, 0.005)
    gauge(k, [x, yc + Ro + 0.3, 0.35], [0, 0.4, 1], 0.12, unit, max)
  }

  walkway(k, G, m)
  if (p.deluge) deluge(k, G)
  k.box('nameplate', [0.4, 0.26, 0.006], [-L * 0.1, yc - Ro * 0.15, Ro * 0.99 + 0.004])
  tagPlate(k, p.tag, [-L * 0.1, yc - Ro * 0.15 - 0.2, Ro * 0.98 + 0.005], 'z', 0.35)
}

/** Top walkway beside the nozzle centreline, on shell brackets, with handrail and a caged ladder at the -X end. */
function walkway(k: Kit, G: ReturnType<typeof layout>, m: MatKey) {
  const { Ro, yc, L } = G
  const y = yc + Ro + 0.12
  const z0 = Ro * 0.32
  const z1 = z0 + 0.8
  const x0 = -L * 0.46
  const x1 = L * 0.46
  grating(k, [0, y, (z0 + z1) / 2], x1 - x0, z1 - z0)
  for (let x = x0 + 0.1; x <= x1; x += 1.8) {
    member(k, [x, y - 0.06, z0 - 0.15], [x, y - 0.06, z1], 'UPN 100', 'galvanised')
    const zs = Ro * 0.25
    member(k, [x, yc + Math.sqrt(Ro * Ro - zs * zs) - 0.01, zs], [x, y - 0.11, zs], 'L60x60x6', 'galvanised')
    const zk = Ro * 0.8
    member(k, [x, yc + Math.sqrt(Ro * Ro - zk * zk) - 0.01, zk], [x, y - 0.11, z1 - 0.05], 'L60x60x6', 'galvanised')
    k.box(m, [0.15, 0.012, 0.15], [x, yc + Math.sqrt(Ro * Ro - zs * zs) - 0.006, zs])
  }
  for (const z of [z0, z1 - 0.05]) member(k, [x0, y - 0.06, z], [x1, y - 0.06, z], 'UPN 100', 'galvanised')
  const rails: V3[] = [[x0 + 0.9, y, z1], [x1, y, z1], [x1, y, z0]]
  handrailSimple(k, rails)
  handrailSimple(k, [[x0, y, z0], [x0, y, z1 - 0.7]])
  ladder(k, [x0 + 0.45, 0, z1 + 0.3], y, [0, 0, 1])
}

function handrailSimple(k: Kit, pts: V3[]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const len = Math.hypot(b[0] - a[0], b[2] - a[2])
    const n = Math.max(1, Math.ceil(len / 1.5))
    for (let j = 0; j <= n; j++) {
      const f = j / n
      const x = a[0] + (b[0] - a[0]) * f
      const z = a[2] + (b[2] - a[2]) * f
      k.rod('safetyYellow', [x, a[1], z], [x, a[1] + 1.1, z], 0.024, 8)
    }
    for (const h of [1.1, 0.5]) k.rod('safetyYellow', [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], h > 1 ? 0.024 : 0.018, 8)
    k.box('safetyYellow', [Math.abs(b[0] - a[0]) || 0.006, 0.1, Math.abs(b[2] - a[2]) || 0.006], [(a[0] + b[0]) / 2, a[1] + 0.05, (a[2] + b[2]) / 2])
  }
}

/** Two deluge spray headers along the upper shell, fed by a riser at the +X end. */
function deluge(k: Kit, G: ReturnType<typeof layout>) {
  const { Ro, yc, L, bo } = G
  const f = (40 * Math.PI) / 180
  const r = Ro + 0.25
  const xA = -L / 2 + 0.3
  const xB = L / 2 - 0.3
  for (const s of [-1, 1]) {
    const y = yc + r * Math.cos(f)
    const z = s * r * Math.sin(f)
    k.pipe('firewaterRed', [xA, y, z], [xB, y, z], pipeOD(3), 0.005)
    for (let x = xA + 0.4; x < xB; x += 1.2) {
      k.cyl('brass', 0.016, 0.06, [x, y - 0.06, z * 0.95], 'y', 8)
      k.rod('galvanised', [x, y, z], [x, yc + Ro * Math.cos(f), s * Ro * Math.sin(f)], 0.01, 6)
    }
  }
  const xr = L / 2 + bo + 0.6
  const yT = yc + r * Math.cos(f)
  k.tube('firewaterRed', [[xr, 0.2, 0], [xr, yT + 0.4, 0], [xB, yT + 0.4, 0]], pipeOD(4) / 2, 12, 0.3)
  for (const s of [-1, 1]) k.tube('firewaterRed', [[xB, yT + 0.4, 0], [xB, yT + 0.4, s * r * Math.sin(f) * 0.6], [xB, yT, s * r * Math.sin(f)]], pipeOD(3) / 2, 10, 0.15)
  k.box('firewaterRed', [0.25, 0.3, 0.25], [xr, 0.15, 0])
}
