// TEG regeneration package: fire-tube reboiler over a surge drum, still column with reflux condenser, flash drum, sock / carbon filters, lean/rich exchanger, glycol pumps, burner and stack. API 12GDU, ASME VIII-1.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { flange, flangedJoint, gauge, grating, handrail, ladder, member, motorSize, nozzle, pipeRun, saddle, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { SECTIONS, flange as flangeDims, headDepth, pipeOD, saddle as saddleDims, shellThickness, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { addv, blFlange, branchMouth, mateFlange, padeyeShackles, spoolJoint, earthBoss, gaugeTap, localPanel, cableTray, pipeSupport, shellLabel, smallPsv, smallValve, tempElement, transmitter, vVessel, vesselLegs, valve, valveSpan } from './_skid'

export interface TegRegenerationProps {
  /** reboiler inside diameter, m */
  reboilerDiameter?: number
  /** reboiler tangent length, m */
  reboilerLength?: number
  /** still column inside diameter, m */
  stillDiameter?: number
  /** exhaust stack top above the skid base, m */
  stackHeight?: number
  /** glycol circulation pumps (duty / standby) */
  pumps?: number
  /** pump motor, kW */
  kw?: number
  glycolNps?: number
  /** lean glycol discharge class (contactor pressure) */
  leanRating?: Rating
  tag?: string
}

export const defaults = {
  reboilerDiameter: 1.0,
  reboilerLength: 4.0,
  stillDiameter: 0.36,
  stackHeight: 7.5,
  pumps: 2,
  kw: 7.5,
  glycolNps: 2,
  leanRating: 600 as Rating,
  tag: 'C-5350',
}

type P = typeof defaults

const SKID = 'HEB 200'
const LP: Rating = 150
const STACK: MatKey = paint('#8f969a', { metalness: 0.55, roughness: 0.55 })
const INSUL: MatKey = 'insulation'

function layout(p: P) {
  const D = p.reboilerDiameter
  const TT = p.reboilerLength
  const wall = shellThickness(3.5, D)
  const Ro = D / 2 + wall
  const hd = headDepth('2:1-ellipsoidal', D) + wall
  const Ds = D * 0.8
  const walls = shellThickness(3.5, Ds)
  const Ros = Ds / 2 + walls
  const hds = headDepth('2:1-ellipsoidal', Ds) + walls
  const Rof = 0.3 + shellThickness(10, 0.6)
  const N = Math.max(1, Math.min(3, Math.round(p.pumps)))
  const y0 = SECTIONS[SKID].d + 0.008
  const W = 1.75 + 2 * Ro
  const b = -W / 2
  const zr = b + 0.4 + Ro
  const zp = zr + Ro + 0.75
  const L0 = 1.5 + TT + hd + 0.55 + 2 * Rof + 0.75
  const a = -L0 / 2
  const xr0 = a + 1.5
  const xr1 = xr0 + TT
  const xf = xr1 + hd + 0.55 + Rof
  const ycs = y0 + 0.35 + Ros
  const ybt = ycs + Ros + 0.18
  const ycr = ybt + 0.25 + Ro
  const xc = xr1 - 0.55
  const Dc = p.stillDiameter
  const Rc = Dc / 2 + 0.006
  const yj = ycr + Ro + 0.2
  const ypl = ycr + Ro + 0.15
  const Hc = 2.4
  const Hf = 0.6
  const yfin0 = yj + Hc
  const yColTop = yfin0 + Hf + Dc / 4 + 0.006
  const fv = flangeDims(3, LP)
  const yVent = yColTop + 0.25
  const ziRich = b + 0.22
  const xpl = xr0 + 0.45
  const zlh = zp + 0.38
  return { D, TT, wall, Ro, hd, Ds, walls, Ros, hds, Rof, N, y0, W, L: L0, a, b, zr, zp, xr0, xr1, xf, ycs, ybt, ycr, xc, Dc, Rc, yj, ypl, Hc, Hf, yfin0, yColTop, yVent, fv, ziRich, xpl, zlh, yRich: y0 + 1.0, yLean: y0 + 1.25, zFuel: zr + Ro + 0.3, yFuel: y0 + 0.75, xLeanOut: xpl + 0.85 * (N - 1) + 0.55 }
}

export function ports(props: TegRegenerationProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [
    port('rich-in', 'Rich glycol in', [g.L / 2, g.yRich, g.ziRich], [1, 0, 0], p.glycolNps, LP),
    port('lean-out', 'Lean glycol out', [g.xLeanOut, g.yLean, g.W / 2], [0, 0, 1], p.glycolNps, p.leanRating),
    port('vent', 'Still vent', [g.xc, g.yVent, g.zr], [0, 1, 0], 3, LP, 'vent'),
    port('fuel', 'Fuel gas', [-g.L / 2, g.yFuel, g.zFuel], [-1, 0, 0], 1, LP, 'utility'),
  ]
}

export function TegRegeneration(props: TegRegenerationProps & GroupProps) {
  const { reboilerDiameter, reboilerLength, stillDiameter, stackHeight, pumps, kw, glycolNps, leanRating, tag, ...group } = { ...defaults, ...props }
  const p = { reboilerDiameter, reboilerLength, stillDiameter, stackHeight, pumps, kw, glycolNps, leanRating, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default TegRegeneration

function hVessel(k: Kit, x0: number, x1: number, yc: number, z: number, Ro: number, hd: number, mat: MatKey, flatStart = false) {
  const prof: [number, number][] = []
  if (flatStart) prof.push([0, x0], [Ro, x0])
  else for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2)
    prof.push([Ro * Math.sin(t), x0 - hd * Math.cos(t)])
  }
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2)
    prof.push([Ro * Math.cos(t), x1 + hd * Math.sin(t)])
  }
  k.lathe(mat, prof, [0, yc, z], 'x', 48)
  for (const x of [x0, x1]) k.torus(mat, Ro + 0.001, 0.005, [x, yc, z], 'x', 6, 48)
}

function build(k: Kit, p: P) {
  const g = layout(p)
  const { L, W, y0, zr, zp, xr0, xr1, Ro, Ros, ycr, ycs, ybt, xc, xf, a } = g
  const gn = p.glycolNps
  const od = pipeOD(gn)
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)
  tagPlate(k, p.tag, [a + 1.0, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.3)
  earthBoss(k, [-a - 0.5, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])

  // ---------------------------------------------------------------- surge drum (deck) and reboiler (on a portal frame above)
  hVessel(k, xr0, xr1, ycs, zr, Ros, g.hds, 'equipmentPaint')
  const sds = saddleDims(2 * Ros, g.TT)
  const xsd = [xr0 + sds.positionFromTangent + 0.2, xr1 - sds.positionFromTangent - 0.2]
  k.at([0, ycs, zr], undefined, () => {
    saddle(k, xsd[0], Ros, y0 - ycs)
    saddle(k, xsd[1], Ros, y0 - ycs, { sliding: true })
  })
  k.plane(textMaterial('GLYCOL SURGE DRUM', '#f2f2ee', '#111', 512, 64), 0.9, 0.11, [(xr0 + xr1) / 2 - 0.5, ycs, zr + Ros + 0.004])
  k.plane(textMaterial('GLYCOL REBOILER', '#f2f2ee', '#111', 512, 64), 0.9, 0.11, [(xr0 + xr1) / 2 - 0.5, ycr - 0.15, zr + Ro + 0.005])
  // reboiler shell: flat bolted bundle flange at -X, 2:1 head at +X
  hVessel(k, xr0, xr1, ycr, zr, Ro, g.hd, INSUL, true)
  k.cyl('equipmentPaint', Ro + 0.07, 0.06, [xr0 + 0.03, ycr, zr], 'x', 48)
  k.cyl('equipmentPaint', Ro + 0.07, 0.05, [xr0 - 0.025, ycr, zr], 'x', 48)
  k.around(28, Ro + 0.04, [xr0 - 0.06, ycr, zr], 'x', (q) => {
    k.cyl('boltXylan', 0.011, 0.17, addv(q, [0.075, 0, 0]), 'x', 6)
    k.hex('nut', 0.036, 0.018, addv(q, [0.0, 0, 0]), 'x')
  })
  for (let x = xr0 + 0.6; x < xr1; x += 0.6) k.torus(INSUL, Ro + 0.002, 0.004, [x, ycr, zr], 'x', 6, 48)
  // portal frame carrying the reboiler saddles over the surge drum
  const sdr = saddleDims(2 * Ro, g.TT)
  const xrs = [xr0 + sdr.positionFromTangent + 0.35, xr1 - sdr.positionFromTangent - 0.35]
  const zc = Ro * 0.9 + 0.12
  for (const x of xrs) {
    for (const s of [-1, 1]) {
      member(k, [x, y0, zr + s * zc], [x, ybt - 0.16, zr + s * zc], 'HEB 160', 'structSteel', [1, 0, 0])
      k.box('structSteel', [0.26, 0.016, 0.26], [x, y0 + 0.008, zr + s * zc])
    }
    member(k, [x, ybt - 0.08, zr - zc - 0.08], [x, ybt - 0.08, zr + zc + 0.08], 'HEB 160', 'structSteel', [0, 1, 0])
  }
  for (const s of [-1, 1]) member(k, [xrs[0], ybt - 0.4, zr + s * zc], [xrs[1], ybt - 0.4, zr + s * zc], 'UPN 160', 'structSteel', [0, 1, 0])
  k.at([0, ycr, zr], undefined, () => {
    saddle(k, xrs[0], Ro, ybt - ycr)
    saddle(k, xrs[1], Ro, ybt - ycr, { sliding: true })
  })
  // downcomer (reboiler overflow into the surge drum) and surge vent / blanket gas
  k.pipe('pipePaint', [xr1 - 0.2, ycr - Ro + 0.02, zr], [xr1 - 0.2, ycs + Ros - 0.02, zr], pipeOD(3), 0.0055)
  flangedJoint(k, 3, LP, [xr1 - 0.2, (ycr - Ro + ycs + Ros) / 2, zr], 'y')
  // reboiler instruments: temperature control, level glass, thermowells
  tempElement(k, [xr0 + 0.8, ycr + Ro * 0.5, zr + Ro * 0.87], [0, 0.5, 0.87], 0)
  tempElement(k, [xr1 - 1.2, ycr + Ro * 0.5, zr + Ro * 0.87], [0, 0.5, 0.87], 0)
  k.rbox('aluminium', [0.25, 0.3, 0.14], 0.015, [xr0 + 1.4, ycr, zr + Ro + 0.2])
  k.box('structSteel', [0.04, 0.04, 0.2], [xr0 + 1.4, ycr, zr + Ro + 0.08])
  const lgx = xr1 - 1.0
  for (const [yc, R] of [[ycr, Ro], [ycs, Ros]] as const) {
    k.cyl('stainless', 0.03, R * 1.1, [lgx, yc, zr + R + 0.14], 'y', 14)
    k.box('glass', [0.025, R * 0.9, 0.02], [lgx, yc, zr + R + 0.175])
    for (const s of [-1, 1]) k.rod('stainless', [lgx, yc + s * R * 0.45, zr + R * 0.85], [lgx, yc + s * R * 0.45, zr + R + 0.14], 0.012, 8)
  }
  gaugeTap(k, [xr0 + 2.2, ycs + Ros, zr], [0, 1, 0], 4, 0.08)

  // ---------------------------------------------------------------- fire tube, burner and exhaust stack
  const yLow = ycr - Ro * 0.38
  const yHi = ycr + Ro * 0.38
  const rFt = Math.min(0.22, Ro * 0.3)
  k.cyl('equipmentPaintDark', rFt + 0.05, 0.55, [xr0 - 0.33, yLow, zr], 'x', 28)
  k.cyl('equipmentPaintDark', rFt + 0.1, 0.05, [xr0 - 0.08, yLow, zr], 'x', 28)
  k.around(8, rFt + 0.08, [xr0 - 0.1, yLow, zr], 'x', (q) => k.hex('nut', 0.03, 0.02, q, 'x'))
  // flame arrestor housing on the burner air intake
  k.cyl(STACK, rFt + 0.16, 0.38, [xr0 - 0.82, yLow, zr], 'x', 28)
  for (const s of [-1, 1]) k.cyl('flangeSteel', rFt + 0.2, 0.04, [xr0 - 0.82 + s * 0.2, yLow, zr], 'x', 28)
  k.disc('rubberBlack', rFt + 0.12, [xr0 - 1.035, yLow, zr], '-x', 28)
  k.cyl('actuatorYellow', 0.04, 0.12, [xr0 - 0.45, yLow - rFt - 0.1, zr], 'y', 12) // pilot assembly
  k.rbox('stainless', [0.12, 0.08, 0.08], 0.01, [xr0 - 0.3, yLow + rFt + 0.08, zr]) // flame scanner
  // fire-tube return leg to the stack
  const xs = xr0 - 0.75
  const rs = 0.18 + g.D * 0.05
  pipeRun(k, [[xr0 - 0.05, yHi, zr], [xs, yHi, zr], [xs, yHi + 0.9, zr]], 12, { mat: STACK })
  k.cyl(STACK, rs, p.stackHeight - (yHi + 0.9), [xs, (p.stackHeight + yHi + 0.9) / 2, zr], 'y', 28)
  k.cyl(STACK, rs + 0.03, 0.04, [xs, yHi + 0.92, zr], 'y', 28)
  for (let y = yHi + 2; y < p.stackHeight - 0.3; y += 1.8) k.cyl(STACK, rs + 0.02, 0.03, [xs, y, zr], 'y', 28)
  k.cyl(STACK, rs + 0.06, 0.12, [xs, p.stackHeight + 0.18, zr], 'y', 28, rs * 0.2)
  for (let i = 0; i < 4; i++) {
    const an = (i / 4) * Math.PI * 2 + Math.PI / 4
    k.rod(STACK, [xs + Math.cos(an) * rs, p.stackHeight - 0.02, zr + Math.sin(an) * rs], [xs + Math.cos(an) * rs, p.stackHeight + 0.14, zr + Math.sin(an) * rs], 0.012, 6)
  }
  k.cyl('stainless', 0.025, 0.12, [xs + rs + 0.06, p.stackHeight - 1.2, zr], 'x', 10)
  // stack support: braced post pair from the deck
  for (const s of [-1, 1]) {
    member(k, [xs, y0, zr + s * (rs + 0.15)], [xs, yHi + 2.6, zr + s * (rs + 0.15)], 'HEB 100', 'structSteel', [0, 0, 1])
    k.box('structSteel', [0.2, 0.016, 0.2], [xs, y0 + 0.008, zr + s * (rs + 0.15)])
  }
  for (const y of [yHi + 1.0, yHi + 2.5]) {
    member(k, [xs, y, zr - rs - 0.2], [xs, y, zr + rs + 0.2], 'UPN 100', 'structSteel', [1, 0, 0])
    k.torus('structSteel', rs + 0.015, 0.012, [xs, y, zr], 'y', 6, 28)
  }
  member(k, [xs, yHi + 2.5, zr - rs - 0.15], [xr0 + 0.4, ybt + 0.8, zr - Ro - 0.02], 'L70x70x7', 'structSteel')

  // fuel gas train: BL → ball valve → filter → regulator → shutdown valve → burner
  const zF = g.zFuel
  const fw = blFlange(k, [a, g.yFuel, zF], [-1, 0, 0], 1, LP)
  const xb = xr0 - 0.45
  pipeRun(k, [fw, [xb, g.yFuel, zF], [xb, yLow - rFt - 0.3, zF], [xb, yLow - rFt - 0.3, zr], [xb, yLow - rFt - 0.04, zr]], 1)
  const xm = (a + xb) / 2
  smallValve(k, 'ball', [a + 0.3, g.yFuel, zF], [1, 0, 0], 0.016)
  k.cyl('aluminium', 0.05, 0.2, [xm - 0.1, g.yFuel - 0.08, zF], 'y', 16)
  k.cyl('actuatorBlue', 0.045, 0.05, [xm + 0.12, g.yFuel + 0.1, zF], 'y', 18)
  k.cyl('actuatorBlue', 0.07, 0.04, [xm + 0.12, g.yFuel + 0.16, zF], 'y', 20)
  k.rbox('valveBody', [0.08, 0.07, 0.07], 0.01, [xm + 0.12, g.yFuel, zF])
  k.rbox('actuatorRed', [0.08, 0.12, 0.08], 0.01, [xb, g.yFuel + 0.45, zF])
  gaugeTap(k, [xm + 0.32, g.yFuel + pipeOD(1) / 2, zF], [0, 1, 0], 10, 0.07)
  pipeSupport(k, [a + 0.6, g.yFuel, zF], pipeOD(1), y0, 'x')
  // stripping gas from the fuel train into the reboiler, through a needle valve and rotameter
  const ysg = yLow - rFt - 0.5
  const xsg = xr0 + 0.55
  const zsg = zr + Ro * 0.95
  k.tube('tubing', [[xb, ysg, zF], [xsg, ysg, zF], [xsg, ycr - Ro * 0.3, zF], [xsg, ycr - Ro * 0.3, zsg]], 0.0095, 8, 0.04)
  smallValve(k, 'needle', [(xb + xsg) / 2, ysg, zF], [1, 0, 0], 0.008)
  const yrm = (ysg + ycr - Ro * 0.3) / 2
  k.cyl('glass', 0.025, 0.22, [xsg, yrm, zF], 'y', 14)
  for (const s of [-1, 1]) k.cyl('stainless', 0.03, 0.03, [xsg, yrm + s * 0.12, zF], 'y', 14)
  k.sphere('actuatorRed', 0.012, [xsg, yrm + 0.03, zF], undefined, 8)

  // ---------------------------------------------------------------- still column with reflux condenser
  const Rc = g.Rc
  nozzle(k, { base: [xc, ycr + Ro - 0.02, zr], dir: [0, 1, 0], nps: 12, rating: LP, standout: g.yj - 0.00225 - (ycr + Ro - 0.02), mat: INSUL, studs: false })
  const fc = flangeDims(12, LP)
  mateFlange(k, [xc, g.yj - 0.00225, zr], [0, 1, 0], 12, LP)
  const cy0 = g.yj + fc.hubLength + fc.raisedFaceHeight
  k.cyl('equipmentPaint', Math.max(Rc, pipeOD(12) / 2), g.yfin0 - cy0, [xc, (g.yfin0 + cy0) / 2, zr], 'y', 32)
  for (let i = 0; i < 14; i++) k.cyl('aluminium', Rc + 0.14, 0.006, [xc, g.yfin0 + 0.03 + i * (g.Hf - 0.06) / 13, zr], 'y', 32)
  k.cyl('equipmentPaint', Rc, g.Hf, [xc, g.yfin0 + g.Hf / 2, zr], 'y', 32)
  k.dome('equipmentPaint', Rc, [xc, g.yfin0 + g.Hf, zr], 'y', Math.PI / 2, 0.5, 32)
  for (const s of [-1, 1]) k.box('structSteel', [0.02, g.Hf, 0.05], [xc + s * (Rc + 0.15), g.yfin0 + g.Hf / 2, zr])
  // vent nozzle (port), coil connections, feed nozzle, packing support / manways
  const vw = addv([xc, g.yVent, zr], [0, -1, 0], g.fv.hubLength + g.fv.raisedFaceHeight)
  flange(k, 3, LP, [xc, g.yVent, zr], [0, 1, 0], true)
  k.pipe('equipmentPaint', [xc, g.yColTop - 0.03, zr], vw, pipeOD(3), 0.0055)
  k.disc('pipeBore', pipeOD(3) / 2 - 0.004, [xc, g.yColTop - 0.025, zr], 'y', 20)
  const yci = g.yfin0 + g.Hf - 0.06
  const yco = g.yfin0 + 0.08
  for (const y of [yci, yco]) k.pipe('stainless', [xc + Rc - 0.01, y, zr], [xc + Rc + 0.2, y, zr], od, 0.004)
  const yfeed = g.ypl + 1.45
  nozzle(k, { base: [xc, yfeed, zr + Rc], dir: [0, 0, 1], nps: gn, rating: LP, standout: 0.18, mat: 'equipmentPaint', studs: false })
  for (const y of [g.yj + 0.6, g.yj + 1.9]) nozzle(k, { base: [xc, y, zr - Rc], dir: [0, 0, -1], nps: 8, rating: LP, standout: 0.15, mat: 'equipmentPaint', blind: true })
  shellLabel(k, 'STILL', xc, g.yj + 1.2, zr, Rc, 0.08, 1.4)
  for (const y of [g.yj + 0.9, g.yj + 1.8]) k.torus('structSteel', Rc + 0.02, 0.012, [xc, y, zr], 'y', 6, 28)

  // reboiler top platform with caged ladder (access to the still and level instruments)
  const px0 = xr0 + 0.4
  const px1 = xr1 + 0.15
  const pw = 1.25
  grating(k, [(px0 + px1) / 2, g.ypl + 0.05, zr], px1 - px0, pw)
  for (const s of [-1, 1]) member(k, [px0, g.ypl, zr + s * (pw / 2 - 0.04)], [px1, g.ypl, zr + s * (pw / 2 - 0.04)], 'UPN 100', 'galvanised', [0, 1, 0])
  for (const x of [px0 + 0.1, (px0 + px1) / 2, px1 - 0.1]) {
    member(k, [x, g.ypl - 0.02, zr - pw / 2], [x, g.ypl - 0.02, zr + pw / 2], 'UPN 100', 'galvanised', [0, 1, 0])
    for (const s of [-1, 1]) member(k, [x, g.ypl - 0.08, zr + s * pw * 0.35], [x, ycr + Ro * 0.6, zr + s * Ro * 0.6], 'L50x50x5', 'galvanised')
  }
  const lx = xr0 + 1.6
  handrail(k, [[lx + 0.35, g.ypl + 0.05, zr - pw / 2], [px1, g.ypl + 0.05, zr - pw / 2], [px1, g.ypl + 0.05, zr + pw / 2], [px0, g.ypl + 0.05, zr + pw / 2], [px0, g.ypl + 0.05, zr - pw / 2], [lx - 0.35, g.ypl + 0.05, zr - pw / 2]])
  ladder(k, [lx, y0, zr - pw / 2 - 0.02], g.ypl + 0.05, [0, 0, -1])

  // ---------------------------------------------------------------- flash drum, filters, lean/rich exchanger
  const F = vVessel(k, xf, zr, y0 + 0.75, 0.6, 1.5, g.Rof - 0.3, 'equipmentPaint', 32)
  vesselLegs(k, xf, zr, g.Rof, y0 + 0.75 + 0.1, y0, 4, 'equipmentPaint')
  shellLabel(k, 'FLASH DRUM', xf, y0 + 1.3, zr, g.Rof, 0.07, 1.4)
  const fp = smallPsv(k, [xf - 0.15, F.yTop - 0.03, zr], [-1, 0, 0], 0.025)
  k.tube('pipePaint', [fp, addv(fp, [-0.1, 0, 0]), addv(fp, [-0.1, 0.25, 0])], 0.02, 8, 0.04)
  k.rbox('actuatorBlue', [0.12, 0.2, 0.1], 0.015, [xf + g.Rof + 0.12, y0 + 1.45, zr])
  for (const y of [y0 + 1.2, y0 + 1.75]) k.rod('stainless', [xf + g.Rof - 0.01, y, zr], [xf + g.Rof + 0.08, y, zr], 0.012, 8)
  const yF0 = y0 + 0.45
  const filt = (x: number, label: string) => {
    const f = vVessel(k, x, zp, yF0 + 0.1, 0.3, 1.0, 0.006, 'equipmentPaint', 24)
    vesselLegs(k, x, zp, 0.156, yF0 + 0.18, y0, 3, 'equipmentPaint', Math.PI / 2)
    k.cyl('equipmentPaint', 0.2, 0.04, [x, f.yTop - 0.04, zp], 'y', 24)
    k.around(8, 0.185, [x, f.yTop - 0.015, zp], 'y', (q) => k.hex('nut', 0.022, 0.012, q))
    shellLabel(k, label, x, yF0 + 0.7, zp, 0.156, 0.05, 1.6)
    k.rod('stainless', [x + 0.15, yF0 + 0.3, zp], [x + 0.15, yF0 + 0.95, zp], 0.006, 6)
    gauge(k, [x + 0.15, yF0 + 1.0, zp + 0.01], 'z', 0.07, 'bar', 4)
    return f
  }
  const xF1 = xf - 0.3
  const xF2 = xf + 0.32
  const F1 = filt(xF1, 'SOCK')
  const F2 = filt(xF2, 'CARBON')
  const xe1 = xr1 + 0.1
  const xe0 = Math.max(xe1 - 1.5, g.xpl + 0.85 * (g.N - 1) + 0.5)
  const ye = y0 + 0.5
  const Re = 0.17
  k.cyl('equipmentPaint', Re, xe1 - xe0, [(xe0 + xe1) / 2, ye, zp], 'x', 32)
  k.dome('equipmentPaint', Re, [xe0, ye, zp], '-x', Math.PI / 2, 0.5, 32)
  k.cyl('equipmentPaint', Re + 0.04, 0.05, [xe1 + 0.025, ye, zp], 'x', 32)
  k.cyl('equipmentPaint', Re, 0.25, [xe1 + 0.175, ye, zp], 'x', 32)
  k.cyl('equipmentPaint', Re + 0.04, 0.04, [xe1 + 0.32, ye, zp], 'x', 32)
  for (const s of [xe1 + 0.025, xe1 + 0.32]) k.around(12, Re + 0.025, [s, ye, zp], 'x', (q) => k.hex('nut', 0.022, 0.03, q, 'x'))
  for (const x of [xe0 + 0.25, xe1 - 0.25]) {
    k.box('equipmentPaint', [0.12, ye - Re - y0, 0.3], [x, (ye - Re + y0) / 2, zp])
    k.box('equipmentPaint', [0.2, 0.014, 0.4], [x, y0 + 0.007, zp])
  }
  k.plane(textMaterial('LEAN / RICH EXCHANGER', '#f2f2ee', '#111', 512, 64), 0.6, 0.075, [(xe0 + xe1) / 2, ye, zp + Re + 0.002])

  // rich glycol: BL → reflux coil → flash drum → LV → sock → carbon → exchanger tubes → still feed
  const zi = g.ziRich
  const rW = blFlange(k, [L / 2, g.yRich, zi], [1, 0, 0], gn, LP)
  pipeRun(k, [rW, [xc + 0.5, g.yRich, zi], [xc + 0.5, yci, zi], [xc + 0.5, yci, zr], [xc + Rc + 0.2, yci, zr]], gn, { mat: 'stainless', schedule: '40S' })
  pipeRun(k, [[xc + Rc + 0.2, yco, zr], [xf, yco, zr], [xf, F.yTop - 0.02, zr]], gn, { mat: 'stainless', schedule: '40S' })
  pipeSupport(k, [xr1 + 0.4, g.yRich, zi], od, y0, 'x')
  const Sl = valveSpan('globe', 1.5, LP)
  const zLv = (zr + zp) / 2
  pipeRun(k, [[xf, F.yBot + 0.02, zr], [xf, y0 + 0.22, zr], [xf, y0 + 0.22, zLv - Sl / 2]], 1.5)
  valve(k, 'globe', [xf, y0 + 0.22, zLv], [0, 0, 1], 1.5, LP, [0, 1, 0], 'valveBody', 1, 'diaphragm')
  pipeRun(k, [[xf, y0 + 0.22, zLv + Sl / 2], [xf, y0 + 0.22, zp - 0.3], [xF1, y0 + 0.22, zp - 0.3], [xF1, y0 + 0.22, zp], [xF1, F1.yBot + 0.02, zp]], 1.5)
  pipeRun(k, [[xF1, F1.yTop - 0.02, zp], [xF1, F1.yTop + 0.2, zp], [xF2, F1.yTop + 0.2, zp], [xF2, F2.yTop - 0.02, zp]], 1.5)
  pipeRun(k, [[xF2, F2.yBot + 0.02, zp], [xF2, y0 + 0.3, zp], [xF2, y0 + 0.3, zp + 0.36], [xe1 + 0.18, y0 + 0.3, zp + 0.36], [xe1 + 0.18, y0 + 0.3, zp], [xe1 + 0.18, ye - Re + 0.02, zp]], 1.5)
  pipeRun(k, [[xe1 + 0.18, ye + Re - 0.02, zp], [xe1 + 0.18, yfeed, zp], [xc, yfeed, zp], [xc, yfeed, zr + Rc + 0.18 + 0.0045 + flangeDims(gn, LP).hubLength + flangeDims(gn, LP).raisedFaceHeight]], gn)
  mateFlange(k, [xc, yfeed, zr + Rc + 0.18], [0, 0, 1], gn, LP)
  for (const x of [xe1 + 0.18]) pipeSupport(k, [x, g.ypl + 0.6, zp + 0.0], od, ye + Re + 0.3, 'z')

  // lean glycol: surge → exchanger shell → pump suction header → pumps → lean header → BL
  pipeRun(k, [[xr1 - 0.7, ycs - Ros + 0.02, zr], [xr1 - 0.7, y0 + 0.2, zr], [xr1 - 0.7, y0 + 0.2, zp - Re - 0.1], [xe1 - 0.3, y0 + 0.2, zp - Re - 0.1], [xe1 - 0.3, y0 + 0.2, zp], [xe1 - 0.3, ye - Re + 0.02, zp]], gn)
  const zh = zp - 0.42
  const ypn = y0 + 0.42
  const xLast = g.xpl + 0.85 * (g.N - 1)
  pipeRun(k, [[xe0 + 0.3, ye - Re + 0.02, zp], [xe0 + 0.3, ypn, zp], [xe0 + 0.3, ypn, zh], [g.xpl - 0.25, ypn, zh]], gn)
  k.dome('pipePaint', od / 2, [g.xpl - 0.25, ypn, zh], '-x', Math.PI / 2, 0.5, 20)
  const ms = motorSize(p.kw, 4)
  const Lp = 0.5
  const fl = flangeDims(gn, p.leanRating)
  const fj = fl.hubLength + fl.raisedFaceHeight + 0.00225
  for (let i = 0; i < g.N; i++) {
    const x = g.xpl + 0.85 * i
    pipeRun(k, [[x, ypn, zh + od / 2 - 0.004], [x, ypn, zp - Lp / 2 - fj]], gn)
    branchMouth(k, [x, ypn, zh + od / 2 - 0.0035], [0, 0, 1], gn)
    smallValve(k, 'ball', [x, ypn, zh + 0.12], [0, 0, 1], 0.02)
    inlinePump(k, x, ypn, zp, Lp, ms.R, ms.L, gn, p.leanRating, y0)
    const Sc = valveSpan('check', gn, p.leanRating)
    pipeRun(k, [[x, ypn, zp + Lp / 2 + fj], [x, ypn, zp + Lp / 2 + 0.2], [x, ypn + 0.28, zp + Lp / 2 + 0.2]], gn, { schedule: '80' })
    valve(k, 'check', [x, ypn + 0.28 + Sc / 2, zp + Lp / 2 + 0.2], [0, 1, 0], gn, p.leanRating, [0, 0, 1])
    pipeRun(k, [[x, ypn + 0.28 + Sc, zp + Lp / 2 + 0.2], [x, g.yLean, zp + Lp / 2 + 0.2], [x, g.yLean, g.zlh - od / 2 + 0.004]], gn, { schedule: '80' })
    branchMouth(k, [x, g.yLean, g.zlh - od / 2 + 0.0035], [0, 0, -1], gn)
    gaugeTap(k, [x + od / 2, ypn + 0.28 + Sc + 0.1, zp + Lp / 2 + 0.2], [1, 0, 0], 100, 0.08)
  }
  const lw = blFlange(k, [g.xLeanOut, g.yLean, W / 2], [0, 0, 1], gn, p.leanRating)
  pipeRun(k, [[g.xpl - 0.05, g.yLean, g.zlh], [g.xLeanOut, g.yLean, g.zlh], lw], gn, { schedule: '80' })
  k.dome('pipePaint', od / 2, [g.xpl - 0.05, g.yLean, g.zlh], '-x', Math.PI / 2, 0.5, 20)
  transmitter(k, [xLast + 0.3, g.yLean + od / 2, g.zlh], [0, 1, 0], 0.06)
  pipeSupport(k, [(g.xpl + xLast) / 2 + 0.42, g.yLean, g.zlh], od, y0, 'x')

  // ---------------------------------------------------------------- BMS panel and cable tray
  const gl = localPanel(k, [a + 0.45, y0, W / 2 - 0.4], [0, 0, 1], { w: 0.6, h: 0.75, top: 1.9, title: 'BMS / TEG LCP', buttons: 4 })
  cableTray(k, [[a + 0.45, gl[1] - 0.04, gl[2]], [a + 0.45, y0 + 0.2, gl[2]], [a + 0.45, y0 + 0.2, W / 2 - 0.12], [xLast + 0.3, y0 + 0.2, W / 2 - 0.12]], [1, 0, 0], 0.15, 3)
}

/** Vertical in-line glycol pump: casing with suction (−Z) / discharge (+Z) flanges, lantern, vertical TEFC motor, pedestal. */
function inlinePump(k: Kit, x: number, y: number, z: number, Lp: number, Rm: number, Lm: number, nps: number, rating: Rating, deck: number) {
  const C: MatKey = 'machineryGreen'
  const f = flangeDims(nps, rating)
  const fl = f.hubLength + f.raisedFaceHeight
  k.cyl(C, 0.16, 0.26, [x, y, z], 'y', 32)
  k.cyl(C, 0.18, 0.04, [x, y + 0.15, z], 'y', 32)
  k.around(8, 0.165, [x, y + 0.175, z], 'y', (q) => k.hex('nut', 0.024, 0.015, q))
  for (const s of [-1, 1]) {
    const face: V3 = [x, y, z + (s * Lp) / 2 - s * 0.00225]
    k.pipe(C, [x, y, z + s * 0.1], addv(face, [0, 0, s], -fl), pipeOD(nps) * 1.05, 0.008)
    spoolJoint(k, [x, y, z + (s * Lp) / 2], [0, 0, s], nps, rating)
  }
  k.cyl(C, 0.1, 0.22, [x, y + 0.28, z], 'y', 24)
  for (let i = 0; i < 4; i++) k.box('rubberBlack', [0.06, 0.12, 0.004], [x + Math.cos((i * Math.PI) / 2) * 0.1, y + 0.28, z + Math.sin((i * Math.PI) / 2) * 0.1], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(i * Math.PI) / 2 + Math.PI / 2))
  k.cyl(C, Rm + 0.03, 0.04, [x, y + 0.41, z], 'y', 32)
  const ym = y + 0.43
  for (let i = 0; i < 20; i++) {
    const an = (i / 20) * Math.PI * 2
    k.box('motorPaint', [0.012, Lm * 0.8, Rm * 0.18], [x + Math.cos(an) * Rm * 1.02, ym + Lm * 0.45, z + Math.sin(an) * Rm * 1.02], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -an))
  }
  k.cyl('motorPaint', Rm, Lm * 0.9, [x, ym + Lm * 0.45, z], 'y', 32)
  k.cyl('motorPaint', Rm * 1.12, Lm * 0.3, [x, ym + Lm * 0.9 + Lm * 0.15, z], 'y', 32, Rm * 1.05)
  k.disc('rubberBlack', Rm * 0.9, [x, ym + Lm * 1.2 + 0.001, z], 'y', 28)
  k.rbox('motorPaint', [Rm * 0.9, Rm * 0.7, Rm * 0.6], 0.015, [x + Rm + Rm * 0.25, ym + Lm * 0.6, z])
  k.box('nameplate', [Rm * 0.5, Rm * 0.35, 0.003], [x, ym + Lm * 0.45, z + Rm * 1.02 + 0.005])
  k.box(C, [0.3, y - 0.13 - deck, 0.24], [x, (y - 0.13 + deck) / 2, z])
  k.box(C, [0.42, 0.02, 0.36], [x, deck + 0.01, z])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.03, 0.02, [x + sx * 0.17, deck + 0.03, z + sz * 0.14])
}
