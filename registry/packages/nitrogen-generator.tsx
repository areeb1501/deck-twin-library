// Membrane nitrogen generator package: coalescing / carbon filters, air heater, hollow-fibre membrane rack, O2 analyser with off-spec vent, buffer receiver. ISO 8573-1, ASME VIII-1.
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { gauge, member, nozzle, pipeRun, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { SECTIONS, flange as flangeDims, pipeOD, shellThickness, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { addv, blFlange, branchMouth, cableTray, dripPan, earthBoss, localPanel, mateFlange, padeyeShackles, pipeSupport, shellLabel, smallPsv, smallValve, spoolJoint, tempElement, transmitter, vVessel, vesselLegs, valve, valveSpan } from './_skid'

export interface NitrogenGeneratorProps {
  /** membrane modules in the rack */
  modules?: number
  /** buffer receiver inside diameter, m */
  receiverDiameter?: number
  /** buffer receiver tangent height, m */
  receiverHeight?: number
  /** design pressure, barg */
  pressure?: number
  airNps?: number
  n2Nps?: number
  tag?: string
}

export const defaults = {
  modules: 6,
  receiverDiameter: 0.8,
  receiverHeight: 1.8,
  pressure: 13,
  airNps: 2,
  n2Nps: 1.5,
  tag: 'X-8300',
}

type P = typeof defaults

const SKID = 'HEB 160'
const R150: Rating = 150
const MEM: MatKey = paint('#d8dbd6', { metalness: 0.35, roughness: 0.4 })
const CAP: MatKey = paint('#2a6f4f', { metalness: 0.3, roughness: 0.45 })

function layout(p: P) {
  const Nm = Math.max(2, Math.min(16, Math.round(p.modules)))
  const rows = Nm > 8 ? 2 : 1
  const perRow = Math.ceil(Nm / rows)
  const wall = shellThickness(p.pressure, p.receiverDiameter)
  const Ro = p.receiverDiameter / 2 + wall
  const xF = [0.75, 1.15, 1.55]
  const xH0 = 1.9
  const xH1 = 2.6
  const xm0 = 3.05
  const pitch = 0.27
  const xm1 = xm0 + pitch * (perRow - 1)
  const xR = xm1 + 0.75 + Ro
  const L0 = xR + Ro + 0.75
  const W = Math.max(1.7, 2 * Ro + 0.9)
  const a = -L0 / 2
  const y0 = SECTIONS[SKID].d + 0.008
  const yp = y0 + 1.15
  const zP = -0.42
  const yTL = y0 + 0.4 + p.receiverDiameter / 4 + wall
  return { Nm, rows, perRow, wall, Ro, xF: xF.map((x) => a + x), xH0: a + xH0, xH1: a + xH1, xm0: a + xm0, xm1: a + xm1, pitch, xR: a + xR, L: L0, W, a, y0, yp, zP, yTL, yOut: yTL + p.receiverHeight * 0.75, xVent: a + xm0 - 0.4, yVent: y0 + 2.75, zVent: -0.15 }
}

export function ports(props: NitrogenGeneratorProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [
    port('air-in', 'Compressed air in', [-g.L / 2, g.yp, g.zP], [-1, 0, 0], p.airNps, R150, 'utility'),
    port('n2-out', 'Nitrogen out', [g.L / 2, g.yOut, 0], [1, 0, 0], p.n2Nps, R150, 'utility'),
    port('vent', 'Permeate / off-spec vent', [g.xVent, g.yVent, g.zVent], [0, 1, 0], 2, R150, 'vent'),
  ]
}

export function NitrogenGenerator(props: NitrogenGeneratorProps & GroupProps) {
  const { modules, receiverDiameter, receiverHeight, pressure, airNps, n2Nps, tag, ...group } = { ...defaults, ...props }
  const p = { modules, receiverDiameter, receiverHeight, pressure, airNps, n2Nps, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default NitrogenGenerator

function build(k: Kit, p: P) {
  const g = layout(p)
  const { L, W, y0, yp, zP, a } = g
  const na = p.airNps
  const od = pipeOD(na)
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)
  tagPlate(k, p.tag, [a + 0.7, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.3)
  earthBoss(k, [-a - 0.4, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])

  // air inlet: BL → ball valve → coalescer, fine coalescer, activated carbon (auto drains to a tray)
  const iw = blFlange(k, [-L / 2, yp, zP], [-1, 0, 0], na, R150)
  const Sv = valveSpan('ball', na, R150)
  const xv = a + 0.3 + Sv / 2
  pipeRun(k, [iw, [xv - Sv / 2, yp, zP]], na)
  valve(k, 'ball', [xv, yp, zP], [1, 0, 0], na, R150)
  const names = ['COALESCER', 'FINE COALESCER', 'CARBON']
  let x = xv + Sv / 2
  g.xF.forEach((fx, i) => {
    pipeRun(k, [[x, yp, zP], [fx - 0.1, yp, zP]], na)
    k.rbox('aluminium', [0.2, 0.15, 0.15], 0.02, [fx, yp, zP])
    k.cyl('aluminium', 0.08, 0.5, [fx, yp - 0.33, zP], 'y', 24)
    k.cyl('aluminium', 0.085, 0.04, [fx, yp - 0.1, zP], 'y', 24)
    k.rbox('rubberBlack', [0.05, 0.06, 0.05], 0.008, [fx, yp - 0.64, zP])
    k.tube('tubing', [[fx, yp - 0.67, zP], [fx, y0 + 0.07, zP], [fx, y0 + 0.07, zP + 0.32]], 0.005, 6, 0.04)
    gauge(k, [fx, yp + 0.13, zP + 0.02], 'z', 0.06, 'bar', 1)
    k.rod('stainless', [fx, yp + 0.075, zP], [fx, yp + 0.13, zP], 0.006, 6)
    k.plane(textMaterial(names[i], '#2a6f4f', '#fff', 256, 64), 0.13, 0.032, [fx, yp - 0.3, zP + 0.081])
    member(k, [fx, y0, zP - 0.16], [fx, yp - 0.08, zP - 0.16], 'L50x50x5', 'galvanised', [0, 0, 1])
    k.box('galvanised', [0.05, 0.05, 0.12], [fx, yp - 0.05, zP - 0.1])
    k.box('galvanised', [0.12, 0.012, 0.12], [fx, y0 + 0.006, zP - 0.16])
    x = fx + 0.1
  })
  dripPan(k, (g.xF[0] + g.xF[2]) / 2, zP + 0.35, g.xF[2] - g.xF[0] + 0.5, 0.3, y0, 0.05)

  // electric air heater (flanged, terminal box, TT / TSH) ahead of the membranes
  const fj = flangeDims(na, R150).hubLength + flangeDims(na, R150).raisedFaceHeight + 0.00225
  pipeRun(k, [[x, yp, zP], [g.xH0 - fj, yp, zP]], na)
  spoolJoint(k, [g.xH0, yp, zP], [1, 0, 0], na, R150)
  spoolJoint(k, [g.xH1, yp, zP], [1, 0, 0], na, R150)
  k.cyl('equipmentPaint', 0.13, g.xH1 - g.xH0 - 2 * fj + 0.01, [(g.xH0 + g.xH1) / 2, yp, zP], 'x', 32)
  k.rbox('equipmentPaintDark', [0.3, 0.22, 0.2], 0.02, [(g.xH0 + g.xH1) / 2, yp + 0.24, zP])
  k.box('equipmentPaintDark', [0.1, 0.06, 0.1], [(g.xH0 + g.xH1) / 2, yp + 0.11, zP])
  k.plane(textMaterial('AIR HEATER', '#f2f2ee', '#111', 256, 64), 0.2, 0.05, [(g.xH0 + g.xH1) / 2, yp, zP + 0.132])
  for (const hx of [g.xH0 + 0.15, g.xH1 - 0.15]) {
    k.box('galvanised', [0.08, yp - 0.13 - y0, 0.2], [hx, (yp - 0.13 + y0) / 2, zP])
    k.box('galvanised', [0.14, 0.012, 0.26], [hx, y0 + 0.006, zP])
  }
  tempElement(k, [g.xH1 + 0.15, yp, zP], [0, 1, 0], od)

  // ---------------------------------------------------------------- membrane rack
  const yb = y0 + 0.42
  const hM = 1.6
  const rM = 0.075
  const zRows = g.rows === 2 ? [-0.12, 0.2] : [0.05]
  const yFeed = yb - 0.14
  const yN2 = yb + hM + 0.14
  const zVh = zRows[0] - 0.17
  pipeRun(k, [[g.xH1 + fj, yp, zP], [g.xH1 + 0.3, yp, zP], [g.xH1 + 0.3, yFeed, zP], [g.xH1 + 0.3, yFeed, zRows[0]], [g.xm1 + 0.1, yFeed, zRows[0]]], 1.5)
  for (const z of zRows.slice(1)) k.pipe('pipePaint', [g.xm0 - 0.1, yFeed, z], [g.xm1 + 0.1, yFeed, z], pipeOD(1.5), 0.004)
  if (zRows.length > 1) k.pipe('pipePaint', [g.xm0 - 0.05, yFeed, zRows[0]], [g.xm0 - 0.05, yFeed, zRows[1]], pipeOD(1.5), 0.004)
  for (const z of zRows) k.pipe('pipePaint', [g.xm0 - 0.1, yN2, z], [g.xm1 + 0.35, yN2, z], pipeOD(1.5), 0.004)
  for (const z of zRows) {
    k.dome('pipePaint', pipeOD(1.5) / 2, [g.xm0 - 0.1, yN2, z], '-x', Math.PI / 2, 0.5, 16)
    k.dome('pipePaint', pipeOD(1.5) / 2, [g.xm1 + 0.1, yFeed, z], 'x', Math.PI / 2, 0.5, 16)
  }
  if (zRows.length > 1) k.dome('pipePaint', pipeOD(1.5) / 2, [g.xm0 - 0.1, yFeed, zRows[1]], '-x', Math.PI / 2, 0.5, 16)
  if (zRows.length > 1) k.dome('pipePaint', pipeOD(1.5) / 2, [g.xm1 + 0.35, yN2, zRows[0]], 'x', Math.PI / 2, 0.5, 16)
  k.pipe('pipePaint', [g.xm0 - 0.1, yb + 0.25, zVh], [g.xVent + pipeOD(2) / 2 - 0.004, yb + 0.25, zVh], pipeOD(2), 0.004)
  k.dome('pipePaint', pipeOD(2) / 2, [g.xm0 - 0.1, yb + 0.25, zVh], '-x', Math.PI / 2, 0.5, 16)
  let n = 0
  for (const z of zRows)
    for (let i = 0; i < g.perRow; i++) {
      if (n++ >= g.Nm) break
      const mx = g.xm0 + g.pitch * i
      k.cyl(MEM, rM, hM - 0.16, [mx, yb + hM / 2, z], 'y', 24)
      for (const y of [yb + 0.04, yb + hM - 0.04]) {
        k.cyl(CAP, rM + 0.018, 0.08, [mx, y, z], 'y', 24)
        k.around(6, rM + 0.008, [mx, y + (y > yb + 1 ? 0.045 : -0.045), z], 'y', (q) => k.hex('nut', 0.016, 0.01, q))
      }
      k.rod('stainless', [mx, yb, z], [mx, yFeed, z], 0.014, 10)
      k.rod('stainless', [mx, yb + hM, z], [mx, yN2, z], 0.014, 10)
      k.rod('stainless', [mx, yb + 0.25, z - rM], [mx, yb + 0.25, zVh], 0.016, 10) // permeate port
      k.plane(textMaterial('N2 MEMBRANE', '#2a6f4f', '#fff', 256, 48), 0.1, 0.019, [mx, yb + hM * 0.6, z + rM + 0.002])
    }
  // rack frame with clamp beams
  const zF0 = zRows[0] - 0.12
  const zF1 = zRows[zRows.length - 1] + 0.12
  for (const xx of [g.xm0 - 0.16, g.xm1 + 0.16]) for (const z of [zF0, zF1]) {
    member(k, [xx, y0, z], [xx, yN2 + 0.1, z], 'L60x60x6', 'galvanised', [1, 0, 0])
    k.box('galvanised', [0.12, 0.012, 0.12], [xx, y0 + 0.006, z])
  }
  for (const y of [yb + 0.4, yb + hM - 0.4]) for (const z of [zF0, zF1]) member(k, [g.xm0 - 0.16, y, z], [g.xm1 + 0.16, y, z], 'L50x50x5', 'galvanised', [0, 1, 0])
  // permeate / off-spec vent riser to the vent flange (port)
  const vf = flangeDims(2, R150)
  const vw = addv([g.xVent, g.yVent, g.zVent], [0, -1, 0], vf.hubLength + vf.raisedFaceHeight)
  blFlange(k, [g.xVent, g.yVent, g.zVent], [0, 1, 0], 2, R150)
  pipeRun(k, [[g.xVent, yb + 0.25, zVh - 0.1], [g.xVent, yb + 0.25, g.zVent], vw], 2)
  k.dome('pipePaint', pipeOD(2) / 2, [g.xVent, yb + 0.25, zVh - 0.1], '-z', Math.PI / 2, 0.5, 16)
  branchMouth(k, [g.xVent + pipeOD(2) / 2 - 0.0035, yb + 0.25, zVh], [1, 0, 0], 2)
  k.box('galvanised', [0.06, g.yVent - 0.4 - y0, 0.06], [g.xVent - 0.1, (g.yVent - 0.4 + y0) / 2, g.zVent])
  k.box('galvanised', [0.14, 0.04, 0.04], [g.xVent - 0.04, g.yVent - 0.5, g.zVent])

  // ---------------------------------------------------------------- O2 analyser cabinet, product control, off-spec valve
  const xa = (g.xm0 + g.xm1) / 2
  const gl = localPanel(k, [xa, y0, W / 2 - 0.35], [0, 0, 1], { w: 0.65, h: 0.75, top: 1.9, title: 'N2 GENERATOR / O2 ANALYSER', buttons: 3 })
  k.cyl('glass', 0.018, 0.16, [xa + 0.42, y0 + 1.45, W / 2 - 0.12], 'y', 12) // sample rotameter
  for (const s of [-1, 1]) k.cyl('stainless', 0.022, 0.02, [xa + 0.42, y0 + 1.45 + s * 0.09, W / 2 - 0.12], 'y', 12)
  k.tube('tubing', [[g.xm1 + 0.2, yN2, zRows[zRows.length - 1]], [g.xm1 + 0.2, yN2, W / 2 - 0.12], [xa + 0.42, yN2, W / 2 - 0.12], [xa + 0.42, y0 + 1.54, W / 2 - 0.12]], 0.004, 6, 0.03)
  k.tube('tubing', [[xa + 0.42, y0 + 1.36, W / 2 - 0.12], [xa + 0.42, y0 + 1.25, W / 2 - 0.12], [xa + 0.33, y0 + 1.25, W / 2 - 0.12]], 0.004, 6, 0.02)
  const zN = zRows[zRows.length - 1]
  const xPc = g.xm1 + 0.35
  const Sg = valveSpan('globe', 1.5, R150)
  pipeRun(k, [[xPc, yN2, zN], [xPc + 0.2, yN2, zN], [xPc + 0.2, yN2 - 0.3, zN]], 1.5)
  valve(k, 'globe', [xPc + 0.2, yN2 - 0.3 - Sg / 2, zN], [0, -1, 0], 1.5, R150, [-1, 0, 0], 'valveBody', 1, 'diaphragm')
  const yB = yN2 - 0.3 - Sg
  k.rbox('actuatorYellow', [0.12, 0.12, 0.1], 0.015, [xPc + 0.2, yB - 0.12, zN]) // 3-way off-spec solenoid valve
  k.rbox('valveBody', [0.1, 0.1, 0.1], 0.01, [xPc + 0.2, yB - 0.22, zN])
  k.tube('pipePaint', [[xPc + 0.2, yB - 0.22, zN - 0.05], [xPc + 0.2, yB - 0.22, zVh], [g.xm1 + 0.05, yB - 0.22, zVh], [g.xm1 + 0.05, yb + 0.25, zVh]], 0.02, 10, 0.05)
  k.pipe('pipePaint', [xPc + 0.2, yB, zN], [xPc + 0.2, yB - 0.17, zN], pipeOD(1.5), 0.004)
  transmitter(k, [xPc + 0.1, yN2 + pipeOD(1.5) / 2, zN], [0, 1, 0], 0.06)

  // ---------------------------------------------------------------- buffer receiver
  const R = vVessel(k, g.xR, 0, g.yTL, p.receiverDiameter, p.receiverHeight, g.wall, 'equipmentPaint')
  vesselLegs(k, g.xR, 0, g.Ro, g.yTL + 0.12, y0, 3, 'equipmentPaint', Math.PI / 2)
  shellLabel(k, 'NITROGEN', g.xR, g.yTL + p.receiverHeight * 0.55, 0, g.Ro, g.Ro * 0.22, 1.1, '#2a6f4f')
  const yIn = g.yTL + p.receiverHeight * 0.3
  const inFace = nozzle(k, { base: [g.xR - g.Ro, yIn, 0], dir: [-1, 0, 0], nps: 1.5, rating: R150, standout: 0.2, mat: 'equipmentPaint', studs: false })
  const inW = mateFlange(k, inFace, [-1, 0, 0], 1.5, R150)
  pipeRun(k, [[xPc + 0.2, yB - 0.27, zN], [xPc + 0.2, yIn, zN], [xPc + 0.2, yIn, 0], inW], 1.5)
  const Sv2 = valveSpan('ball', p.n2Nps, R150)
  const xo = g.xR + g.Ro + 0.18
  k.pipe('equipmentPaint', [g.xR + g.Ro - 0.02, g.yOut, 0], [xo, g.yOut, 0], pipeOD(p.n2Nps), 0.004)
  valve(k, 'ball', [xo + Sv2 / 2, g.yOut, 0], [1, 0, 0], p.n2Nps, R150)
  const ow = blFlange(k, [L / 2, g.yOut, 0], [1, 0, 0], p.n2Nps, R150)
  pipeRun(k, [[xo + Sv2, g.yOut, 0], ow], p.n2Nps)
  k.pipe('equipmentPaint', [g.xR, R.yTop - 0.02, 0], [g.xR, R.yTop + 0.08, 0], 0.05, 0.005)
  const po = smallPsv(k, [g.xR, R.yTop + 0.08, 0], [0, 0, -1], 0.026)
  k.tube('pipePaint', [po, addv(po, [0, 0, -0.08]), addv(addv(po, [0, 0, -0.08]), [0, 0.15, 0])], 0.018, 8, 0.04)
  k.tube('pipePaint', [[g.xR + 0.2, R.yTop - 0.06, 0], [g.xR + 0.2, R.yTop + 0.1, 0]], 0.01, 8)
  gauge(k, [g.xR + 0.2, R.yTop + 0.16, 0.02], 'z', 0.1, 'bar', 16)
  transmitter(k, [g.xR - g.Ro * 0.7, g.yTL + p.receiverHeight * 0.7, g.Ro * 0.7], [-0.7, 0, 0.7], 0.12)
  k.tube('pipePaint', [[g.xR, R.yBot + 0.01, 0], [g.xR, y0 + 0.2, 0], [g.xR, y0 + 0.2, -g.Ro - 0.1]], 0.012, 8, 0.04)
  smallValve(k, 'ball', [g.xR, y0 + 0.2, -g.Ro * 0.5], [0, 0, -1], 0.01)
  tagPlate(k, 'ASME VIII-1', [g.xR - g.Ro * 0.5, g.yTL + p.receiverHeight * 0.35, g.Ro * 0.87 + 0.002], [-0.5, 0, 0.87], 0.16)

  // supports and cable tray
  for (const sx of [g.xH0 - 0.25]) pipeSupport(k, [sx, yp, zP], od, y0, 'x')
  const tz = W / 2 - 0.12
  cableTray(k, [[xa, gl[1] - 0.04, gl[2]], [xa, y0 + 0.22, gl[2]], [xa, y0 + 0.22, tz], [g.xH0, y0 + 0.22, tz]], [1, 0, 0], 0.15, 2)
  k.spline('cable', [[g.xH0, y0 + 0.24, tz], [(g.xH0 + g.xH1) / 2, y0 + 0.5, 0.0], [(g.xH0 + g.xH1) / 2, yp + 0.13, zP + 0.1]], 0.01, 6, 16)
}
