// Produced-water de-oiling hydrocyclone package: horizontal multi-liner vessels on saddles, inlet / outlet / reject headers, PDR-controlled reject valve, OIW monitor. ASME VIII-1, ASME B16.5.
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, nozzle, pipeRun, saddle, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { SECTIONS, flange as flangeDims, headDepth, pipeOD, shellThickness, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { addv, blFlange, branchMouth, cableTray, earthBoss, localPanel, mateFlange, padeyeShackles, pipeSupport, smallValve, transmitter, valve, valveSpan } from './_skid'

export interface HydrocyclonePackageProps {
  /** hydrocyclone vessels in parallel */
  vessels?: number
  /** vessel inside diameter, m */
  vesselDiameter?: number
  /** vessel tangent length (liner length + chambers), m */
  vesselLength?: number
  /** design pressure, barg */
  pressure?: number
  inletNps?: number
  outletNps?: number
  rejectNps?: number
  rating?: Rating
  tag?: string
}

export const defaults = {
  vessels: 2,
  vesselDiameter: 0.6,
  vesselLength: 3.0,
  pressure: 30,
  inletNps: 8,
  outletNps: 8,
  rejectNps: 2,
  rating: 300 as Rating,
  tag: 'X-4200',
}

type P = typeof defaults

const SKID = 'HEB 200'
const VES: MatKey = 'equipmentPaint'

function layout(p: P) {
  const N = Math.max(1, Math.min(4, Math.round(p.vessels)))
  const D = p.vesselDiameter
  const wall = shellThickness(p.pressure, D)
  const Ro = D / 2 + wall
  const hd = headDepth('2:1-ellipsoidal', D) + wall
  const TT = p.vesselLength
  const sp = 2 * Ro + 0.9
  const zV = Array.from({ length: N }, (_, i) => (i - (N - 1) / 2) * sp)
  const zBack = zV[0] - Ro - 0.45
  const zFront = zV[N - 1] + Ro + 0.45
  const W = zFront - zBack + 1.0
  const zc = (zFront + zBack) / 2
  const shift = (z: number) => z - zc
  const xV0 = -TT / 2
  const xV1 = TT / 2
  const bn = Math.min(6, p.inletNps)
  const Sg = valveSpan('gate', bn, p.rating)
  const Sr = valveSpan('ball', p.rejectNps, p.rating)
  const xUf = xV0 - hd - 0.25 // underflow nozzle face
  const xOH = xUf - Sg - 0.25 - pipeOD(p.outletNps) / 2
  const coverT = 0.09
  const xRf = xV1 + coverT + 0.12 // reject neck end (valve weld end)
  const xRH = xRf + Sr + 0.2
  const L = Math.max(xRH + 1.4, -xOH + 1.0) * 2
  const y0 = SECTIONS[SKID].d + 0.008
  const yc = y0 + 0.65 + Ro
  const yH = yc + Ro + 0.25 + Sg + 0.35
  return { N, D, wall, Ro, hd, TT, sp, zV: zV.map(shift), zBack: shift(zBack), zFront: shift(zFront), W, xV0, xV1, bn, Sg, Sr, xUf, xOH, coverT, xRf, xRH, L, y0, yc, yH, xIn: xV1 - 0.6 }
}

export function ports(props: HydrocyclonePackageProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [
    port('inlet', 'Produced water in', [-g.L / 2, g.yH, g.zBack], [-1, 0, 0], p.inletNps, p.rating),
    port('outlet', 'Treated water out', [-g.L / 2, g.yc, g.zFront], [-1, 0, 0], p.outletNps, p.rating),
    port('reject', 'Oily reject', [g.L / 2, g.yc, g.zFront], [1, 0, 0], p.rejectNps, p.rating),
  ]
}

export function HydrocyclonePackage(props: HydrocyclonePackageProps & GroupProps) {
  const { vessels, vesselDiameter, vesselLength, pressure, inletNps, outletNps, rejectNps, rating, tag, ...group } = { ...defaults, ...props }
  const p = { vessels, vesselDiameter, vesselLength, pressure, inletNps, outletNps, rejectNps, rating, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default HydrocyclonePackage

function build(k: Kit, p: P) {
  const g = layout(p)
  const { L, W, y0, yc, yH, Ro, hd, xV0, xV1, zV, zBack, zFront } = g
  const R = p.rating
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)
  tagPlate(k, p.tag, [-L / 2 + 0.8, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.3)
  earthBoss(k, [L / 2 - 0.4, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])

  for (const [i, z] of zV.entries()) {
    // shell with 2:1 head at the underflow (-X) end and a body flange at the reject (+X) end
    const prof: [number, number][] = []
    for (let j = 0; j <= 12; j++) {
      const t = (j / 12) * (Math.PI / 2)
      prof.push([Ro * Math.sin(t), xV0 - hd * Math.cos(t)])
    }
    prof.push([Ro, xV1])
    k.lathe(VES, prof, [0, yc, z], 'x', 48)
    k.torus(VES, Ro + 0.001, 0.005, [xV0, yc, z], 'x', 6, 48)
    k.cyl(VES, Ro + 0.08, 0.06, [xV1 - 0.03, yc, z], 'x', 48)
    k.cyl(VES, Ro + 0.08, g.coverT, [xV1 + g.coverT / 2 + 0.003, yc, z], 'x', 48)
    k.cyl('gasket', Ro + 0.02, 0.006, [xV1 + 0.003, yc, z], 'x', 48)
    k.around(Math.max(12, Math.round(Ro * 60)), Ro + 0.05, [xV1 - 0.065, yc, z], 'x', (q) => {
      k.cyl('boltXylan', 0.012, 0.21, addv(q, [0.105, 0, 0]), 'x', 6)
      k.hex('nut', 0.036, 0.02, q, 'x')
      k.hex('nut', 0.036, 0.02, addv(q, [0.2, 0, 0]), 'x')
    })
    // liner end caps on the reject cover (hex pattern)
    const lr = 0.032
    const pitch = 0.085
    for (let row = -6; row <= 6; row++)
      for (let col = -6; col <= 6; col++) {
        const yy = row * pitch * 0.866
        const zz = (col + (row % 2 ? 0.5 : 0)) * pitch
        const r = Math.hypot(yy, zz)
        if (r > Ro * 0.78 || r < 0.06) continue
        k.cyl('stainless', lr, 0.03, [xV1 + g.coverT + 0.018, yc + yy, z + zz], 'x', 14)
        k.dome('stainless', lr, [xV1 + g.coverT + 0.033, yc + yy, z + zz], 'x', Math.PI / 2, 0.4, 14)
      }
    k.torus('nut', 0.05, 0.012, [xV1 + g.coverT + 0.02, yc + Ro * 0.85, z], 'z', 6, 16, Math.PI) // cover lifting eye
    k.plane(textMaterial(`HYDROCYCLONE ${String.fromCharCode(65 + i)}`, '#f2f2ee', '#111', 512, 64), 0.6, 0.075, [0, yc, z + Ro + 0.004])
    k.at([0, yc, z], undefined, () => {
      saddle(k, xV0 + 0.45, Ro, y0 - yc)
      saddle(k, xV1 - 0.5, Ro, y0 - yc, { sliding: true })
    })
    // inlet branch from the header through a gate valve into the top nozzle
    const inFace = nozzle(k, { base: [g.xIn, yc + Ro, z], dir: [0, 1, 0], nps: g.bn, rating: R, standout: 0.25, mat: VES, studs: false })
    const w1 = mateFlange(k, inFace, [0, 1, 0], g.bn, R)
    valve(k, 'gate', [g.xIn, w1[1] + 0.05 + g.Sg / 2, z], [0, 1, 0], g.bn, R, [1, 0, 0])
    const yBr = yH - pipeOD(p.inletNps) / 2 + 0.004
    k.pipe('pipePaint', w1, [g.xIn, w1[1] + 0.05, z], pipeOD(g.bn), 0.007)
    k.pipe('pipePaint', [g.xIn, w1[1] + 0.05 + g.Sg, z], [g.xIn, yBr, z], pipeOD(g.bn), 0.007)
    branchMouth(k, [g.xIn, yBr - 0.0005, z], [0, -1, 0], g.bn)
    // underflow (clean water) through a gate valve into the outlet header
    const uf = nozzle(k, { base: [xV0 - hd, yc, z], dir: [-1, 0, 0], nps: g.bn, rating: R, standout: 0.25, mat: VES, studs: false })
    const w2 = mateFlange(k, uf, [-1, 0, 0], g.bn, R)
    valve(k, 'gate', [w2[0] - 0.05 - g.Sg / 2, yc, z], [-1, 0, 0], g.bn, R)
    k.pipe('pipePaint', w2, [w2[0] - 0.05, yc, z], pipeOD(g.bn), 0.007)
    const xOHs = g.xOH + pipeOD(p.outletNps) / 2 - 0.004
    k.pipe('pipePaint', [w2[0] - 0.05 - g.Sg, yc, z], [xOHs, yc, z], pipeOD(g.bn), 0.007)
    branchMouth(k, [xOHs + 0.0005, yc, z], [1, 0, 0], g.bn)
    // reject (overflow) through a ball valve into the reject header
    k.pipe(VES, [xV1 + g.coverT - 0.01, yc, z], [g.xRf, yc, z], pipeOD(p.rejectNps), 0.006)
    valve(k, 'ball', [g.xRf + g.Sr / 2, yc, z], [1, 0, 0], p.rejectNps, R)
    k.pipe('pipePaint', [g.xRf + g.Sr, yc, z], [g.xRH - pipeOD(p.rejectNps) / 2, yc, z], pipeOD(p.rejectNps), 0.005)
    // drains and vent, sample points
    nozzle(k, { base: [xV0 + 0.25, yc - Ro, z], dir: [0, -1, 0], nps: 2, rating: R, standout: 0.15, mat: VES, blind: true })
    nozzle(k, { base: [xV1 - 0.25, yc + Ro, z], dir: [0, 1, 0], nps: 1, rating: R, standout: 0.15, mat: VES, blind: true })
    gauge(k, [xV0 + 0.6, yc + Ro + 0.16, z + 0.02], 'z', 0.1, 'bar', 40)
    k.rod('stainless', [xV0 + 0.6, yc + Ro - 0.01, z], [xV0 + 0.6, yc + Ro + 0.1, z], 0.008, 8)
  }

  // inlet: BL → back lane → header across the vessels (blind end), PT and PSV
  const fi = flangeDims(p.inletNps, R)
  const iw = blFlange(k, [-L / 2, yH, zBack], [-1, 0, 0], p.inletNps, R)
  const zEnd = zFront - 0.15
  pipeRun(k, [iw, [g.xIn, yH, zBack], [g.xIn, yH, zEnd - fi.hubLength - fi.raisedFaceHeight]], p.inletNps)
  blFlange(k, [g.xIn, yH, zEnd], [0, 0, 1], p.inletNps, R)
  k.cyl('flangeSteel', fi.od / 2, fi.thickness * 1.15, [g.xIn, yH, zEnd + 0.0045 + fi.thickness * 0.575], 'z', 32)
  transmitter(k, [g.xIn - 0.3, yH + pipeOD(p.inletNps) / 2, zBack], [0, 1, 0], 0.08)
  for (const z of [zBack + 0.2, zFront - 0.6]) pipeSupport(k, [g.xIn, yH, z], pipeOD(p.inletNps), y0, 'z')
  // outlet header → level control valve → BL
  const Sl = valveSpan('globe', p.outletNps, R)
  const xLv = -L / 2 + 0.25 + fi.hubLength + Sl / 2 + 0.1
  const ow = blFlange(k, [-L / 2, yc, zFront], [-1, 0, 0], p.outletNps, R)
  pipeRun(k, [[g.xOH, yc, zV[0] - 0.3], [g.xOH, yc, zFront], [xLv + Sl / 2, yc, zFront]], p.outletNps)
  k.dome('pipePaint', pipeOD(p.outletNps) / 2, [g.xOH, yc, zV[0] - 0.3], '-z', Math.PI / 2, 0.5, 24)
  valve(k, 'globe', [xLv, yc, zFront], [-1, 0, 0], p.outletNps, R, [0, 1, 0], 'valveBody', 1, 'diaphragm')
  pipeRun(k, [[xLv - Sl / 2, yc, zFront], ow], p.outletNps)
  // OIW monitor on the outlet header
  k.tube('tubing', [[g.xOH, yc + pipeOD(p.outletNps) / 2, zFront - 0.3], [g.xOH, yc + 0.45, zFront - 0.3], [g.xOH + 0.5, yc + 0.45, zFront - 0.3]], 0.006, 6, 0.03)
  k.rbox('stainless', [0.35, 0.45, 0.2], 0.015, [g.xOH + 0.7, yc + 0.35, zFront - 0.3])
  k.plane(textMaterial('OIW MONITOR', '#f2f2ee', '#111', 256, 64), 0.25, 0.06, [g.xOH + 0.7, yc + 0.5, zFront - 0.199])
  k.box('galvanised', [0.05, yc + 0.12 - y0, 0.05], [g.xOH + 0.7, (yc + 0.12 + y0) / 2, zFront - 0.42])
  smallValve(k, 'needle', [g.xOH + 0.25, yc + 0.45, zFront - 0.3], [1, 0, 0], 0.007)
  for (const z of [zV[0], zFront - 0.6]) pipeSupport(k, [g.xOH, yc, z + 0.25], pipeOD(p.outletNps), y0, 'z')
  // reject header → PDR control valve → BL
  const Sp = valveSpan('globe', p.rejectNps, R)
  const xPd = L / 2 - 0.3 - Sp / 2
  const rw = blFlange(k, [L / 2, yc, zFront], [1, 0, 0], p.rejectNps, R)
  pipeRun(k, [[g.xRH, yc, zV[0] - 0.15], [g.xRH, yc, zFront], [xPd - Sp / 2, yc, zFront]], p.rejectNps)
  k.dome('pipePaint', pipeOD(p.rejectNps) / 2, [g.xRH, yc, zV[0] - 0.15], '-z', Math.PI / 2, 0.5, 16)
  valve(k, 'globe', [xPd, yc, zFront], [1, 0, 0], p.rejectNps, R, [0, 1, 0], 'valveBody', 1, 'diaphragm')
  pipeRun(k, [[xPd + Sp / 2, yc, zFront], rw], p.rejectNps)
  pipeSupport(k, [g.xRH, yc, zFront - 0.3], pipeOD(p.rejectNps), y0, 'z')
  // PDR instrumentation: DP transmitters inlet-reject and inlet-outlet on a stand, impulse tubing
  const sx = g.xRH + 0.45
  const sz = zBack + 0.1
  k.box('galvanised', [0.06, 1.45, 0.06], [sx, y0 + 0.725, sz])
  k.box('galvanised', [0.18, 0.012, 0.18], [sx, y0 + 0.006, sz])
  for (const [j, y] of [y0 + 1.2, y0 + 0.85].entries()) {
    k.box('stainless', [0.18, 0.08, 0.06], [sx, y, sz + 0.06])
    k.cyl('actuatorBlue', 0.045, 0.1, [sx, y + 0.1, sz + 0.06], 'z', 18)
    k.plane(textMaterial(j ? 'PDT IN-OUT' : 'PDT IN-REJ', '#111', '#fff', 256, 48), 0.12, 0.022, [sx, y - 0.06, sz + 0.092])
  }
  k.tube('tubing', [[g.xIn + 0.2, yH, zBack], [sx - 0.05, yH, zBack], [sx - 0.05, y0 + 1.2, sz + 0.06]], 0.005, 6, 0.03)
  k.tube('tubing', [[g.xRH, yc + 0.03, zV[0] - 0.1], [g.xRH, y0 + 1.2, zV[0] - 0.1], [sx + 0.05, y0 + 1.2, sz + 0.06]], 0.005, 6, 0.03)
  // junction box, cable tray and local panel
  const px = 0.2
  const gl = localPanel(k, [px, y0, W / 2 - 0.3], [0, 0, 1], { w: 0.5, h: 0.6, top: 1.8, title: 'HYDROCYCLONE JB', screen: false, buttons: 0 })
  const tz = W / 2 - 0.12
  cableTray(k, [[px, gl[1] - 0.04, gl[2]], [px, y0 + 0.2, gl[2]], [px, y0 + 0.2, tz], [g.xRH + 0.2, y0 + 0.2, tz]], [1, 0, 0], 0.15, 2)
  k.spline('cable', [[g.xRH + 0.2, y0 + 0.22, tz], [sx, y0 + 0.3, zFront - 0.6], [sx, y0 + 0.75, sz + 0.06]], 0.008, 6, 16)
}
