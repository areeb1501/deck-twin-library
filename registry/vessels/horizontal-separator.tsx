// Horizontal separator / KO drum on saddles: 2:1 ellipsoidal heads, water boot (3-phase), level bridle, manway, top platform. ASME VIII-1, API 12J.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, handrail, grating, junctionBox, ladder, liftingLug, manway, member, nozzle, saddle, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { headDepth, nozzleStandout, pipeOD, saddle as saddleDims, shellThickness, type Rating } from '../lib/standards'
import { earthBoss, holeR, shell, type Hole, capNps } from './_vessel'
import { textMaterial } from '../lib/textures'

export interface HorizontalSeparatorProps {
  service?: '3-phase' | '2-phase' | 'ko-drum'
  /** inside diameter, m */
  diameter?: number
  /** tangent-to-tangent length, m */
  length?: number
  /** shell bottom above deck, m */
  elevation?: number
  /** design pressure, barg (sets the shell wall per UG-27) */
  pressure?: number
  rating?: Rating
  inletNps?: number
  gasNps?: number
  liquidNps?: number
  waterNps?: number
  psvNps?: number
  insulated?: boolean
  platform?: boolean
  tag?: string
  paint?: MatKey
}

export const defaults = {
  service: '3-phase' as const,
  diameter: 2.4,
  length: 8,
  elevation: 1.8,
  pressure: 40,
  rating: 600 as Rating,
  inletNps: 10,
  gasNps: 8,
  liquidNps: 6,
  waterNps: 4,
  psvNps: 3,
  insulated: false,
  platform: true,
  tag: 'V-100',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults & { service: HorizontalSeparatorProps['service'] }

/** Nozzles kept in proportion to the shell (typical upper bounds). */
const fit = (p: P): P => ({ ...p, inletNps: capNps(p.inletNps, p.diameter * 0.45), gasNps: capNps(p.gasNps, p.diameter * 0.5), liquidNps: capNps(p.liquidNps, p.diameter * 0.3), waterNps: capNps(p.waterNps, p.diameter * 0.3), psvNps: capNps(p.psvNps, p.diameter * 0.25) })

function dims(p: P) {
  const wall = shellThickness(p.pressure, p.diameter)
  const Ro = p.diameter / 2 + wall
  const yc = p.elevation + Ro
  const hd = headDepth('2:1-ellipsoidal', p.diameter) + wall
  const bootR = Math.min(Math.max(p.diameter * 0.15, 0.25), 0.5)
  const boot = p.service === '3-phase' ? { x: Math.min(p.length * 0.3, p.length * 0.4 - 1.4 * (bootR + pipeOD(p.liquidNps) / 2) - 0.1), r: bootR, h: Math.min(0.9, p.elevation - 0.5) } : null
  const so = (nps: number) => nozzleStandout(nps, p.rating, p.insulated)
  return { wall, Ro, yc, hd, boot, so }
}

export function ports(props: HorizontalSeparatorProps = {}): Port[] {
  const p = fit({ ...defaults, ...props } as P)
  const { Ro, yc, hd, boot, so } = dims(p)
  const L = p.length
  const out = [
    port('inlet', 'Inlet', [-L / 2 - hd - so(p.inletNps), yc, 0], [-1, 0, 0], p.inletNps, p.rating),
    port('gas', 'Gas outlet', [L * 0.4, yc + Ro + so(p.gasNps), 0], [0, 1, 0], p.gasNps, p.rating),
    port('liquid', p.service === '3-phase' ? 'Oil outlet' : 'Liquid outlet', [L * 0.4, yc - Ro - so(p.liquidNps), 0], [0, -1, 0], p.liquidNps, p.rating),
  ]
  if (boot) out.push(port('water', 'Water outlet', [boot.x, yc - Ro - boot.h * 0.55, -boot.r - so(p.waterNps)], [0, 0, -1], p.waterNps, p.rating))
  out.push(port('psv', 'PSV', [-L * 0.1, yc + Ro + so(p.psvNps), 0], [0, 1, 0], p.psvNps, p.rating, 'relief'))
  return out
}

export function HorizontalSeparator(props: HorizontalSeparatorProps & GroupProps) {
  const { service, diameter, length, elevation, pressure, rating, inletNps, gasNps, liquidNps, waterNps, psvNps, insulated, platform, tag, paint, ...group } = { ...defaults, ...props }
  const p = fit({ service, diameter, length, elevation, pressure, rating, inletNps, gasNps, liquidNps, waterNps, psvNps, insulated, platform, tag, paint } as P)
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default HorizontalSeparator

function build(k: Kit, p: P) {
  const { Ro, yc, hd, boot } = dims(p)
  const L = p.length
  const a = p.diameter / 2
  const ins = p.insulated ? 0.06 : 0
  const bdr = boot ? boot.r : 0
  const holes: Hole[] = [
    { p: [-L / 2 - hd, yc, 0], d: [-1, 0, 0], r: holeR(p.inletNps) },
    { p: [L * 0.4, yc + Ro, 0], d: [0, 1, 0], r: holeR(p.gasNps) },
    { p: [L * 0.4, yc - Ro, 0], d: [0, -1, 0], r: holeR(p.liquidNps) },
    { p: [-L * 0.1, yc + Ro, 0], d: [0, 1, 0], r: holeR(p.psvNps) },
    { p: [L / 2 + hd, yc, 0], d: [1, 0, 0], r: holeR(24) },
    { p: [-L * 0.35, yc - Ro, 0], d: [0, -1, 0], r: holeR(2) },
    { p: [L * 0.25, yc + Ro, 0], d: [0, 1, 0], r: holeR(2) },
  ]
  if (boot) holes.push({ p: [boot.x, yc - Ro, 0], d: [0, -1, 0], r: bdr - 0.012 })
  shell(k, { Ro, bo: hd, e0: -L / 2, e1: L / 2, mat: p.paint, axis: 'x', centre: [0, yc, 0], insulated: p.insulated, ins, holes })
  internals(k, p, yc, a)
  nozzle(k, { base: [L * 0.25, yc + Ro, 0], dir: [0, 1, 0], nps: 2, rating: p.rating, standout: nozzleStandout(2, p.rating, p.insulated), mat: p.paint, blind: true })

  const sd = saddleDims(2 * Ro, L)
  k.at([0, yc, 0], undefined, () => {
    saddle(k, -L / 2 + sd.positionFromTangent, Ro, -yc, { mat: p.paint })
    saddle(k, L / 2 - sd.positionFromTangent, Ro, -yc, { mat: p.paint, sliding: true })
  })
  earthBoss(k, p.paint, [-L / 2 + sd.positionFromTangent + 0.12, 0.15, Ro * 0.88 + 0.045], [0, 0, 1])

  const nz = (base: V3, dir: V3, nps: number, studs = true) => nozzle(k, { base, dir, nps, rating: p.rating, standout: nozzleStandout(nps, p.rating, p.insulated), pad: pipeOD(nps) * 2, mat: p.paint, studs })
  nz([-L / 2 - hd, yc, 0], [-1, 0, 0], p.inletNps)
  nz([L * 0.4, yc + Ro, 0], [0, 1, 0], p.gasNps)
  nz([L * 0.4, yc - Ro, 0], [0, -1, 0], p.liquidNps)
  nz([-L * 0.1, yc + Ro, 0], [0, 1, 0], p.psvNps)
  manway(k, [L / 2 + hd, yc, 0], [1, 0, 0], 0.25, 24, Math.min(p.rating, 600) as Rating, p.paint)
  nozzle(k, { base: [-L * 0.35, yc - Ro, 0], dir: [0, -1, 0], nps: 2, rating: p.rating, standout: 0.2, mat: p.paint, blind: true })

  if (boot) {
    const yb = yc - Ro
    const bh: Hole[] = [
      { p: [boot.x, yb - boot.h * 0.55, -boot.r], d: [0, 0, -1], r: holeR(p.waterNps) },
      { p: [boot.x, yb - boot.h - boot.r * 0.5, 0], d: [0, -1, 0], r: holeR(2) },
    ]
    shell(k, { Ro: boot.r, bo: boot.r / 2, e0: -boot.h, e1: 0.05 + Ro - Math.sqrt(Ro * Ro - boot.r * boot.r), top: false, centre: [boot.x, yb, 0], mat: p.paint, seg: 40, course: 9, holes: bh })
    nozzle(k, { base: [boot.x, yb - boot.h * 0.55, -boot.r], dir: [0, 0, -1], nps: p.waterNps, rating: p.rating, standout: nozzleStandout(p.waterNps, p.rating, p.insulated), mat: p.paint })
    nozzle(k, { base: [boot.x, yb - boot.h - boot.r * 0.5, 0], dir: [0, -1, 0], nps: 2, rating: p.rating, standout: 0.15, mat: p.paint, blind: true })
  }

  // level bridle with magnetic gauge, GWR transmitter and isolation tappings on the +Z side
  const bx = -L * 0.2
  const bz = Ro + 0.45
  const yTop = yc + a * 0.7
  const yBot = (boot ? yc - Ro - boot.h * 0.8 : yc - a * 0.8)
  k.cyl('stainless', 0.045, yTop - yBot + 0.2, [bx, (yTop + yBot) / 2, bz], 'y', 20)
  for (const y of [yTop, yc - a * 0.6]) k.pipe('stainless', [bx, y, Ro * Math.sqrt(Math.max(0, 1 - ((y - yc) / Ro) ** 2)) - 0.02], [bx, y, bz], 0.06, 0.005)
  k.box('stainless', [0.07, yTop - yBot, 0.05], [bx + 0.09, (yTop + yBot) / 2, bz])
  k.box(textMaterial('LG', '#ff5a10', '#ffffff', 64, 512), [0.03, (yTop - yBot) * 0.55, 0.052], [bx + 0.09, yBot + (yTop - yBot) * 0.28, bz])
  k.cyl('actuatorBlue', 0.07, 0.16, [bx, yTop + 0.25, bz], 'y', 20)
  k.rbox('actuatorBlue', [0.14, 0.12, 0.12], 0.02, [bx, yTop + 0.4, bz])
  gauge(k, [L * 0.2, yc + a * 0.2, Ro + 0.12], 'z', 0.15, 'bar', 100)
  k.pipe('stainless', [L * 0.2, yc + a * 0.2, Ro - 0.02], [L * 0.2, yc + a * 0.2, Ro + 0.07], 0.03, 0.004)
  junctionBox(k, [-L * 0.25, p.elevation * 0.5, 0.0], 'z', [0.32, 0.36, 0.18])
  member(k, [-L * 0.25, 0, -0.1], [-L * 0.25, p.elevation * 0.8, -0.1], 'UPN 100', 'galvanised')

  for (const x of [-L * 0.3, L * 0.3]) liftingLug(k, [x, yc + Ro - 0.01, 0], 'x', 1.2, p.paint)
  tagPlate(k, p.tag, [0, yc - Ro * 0.25, Ro * 0.97 + 0.002], 'z', 0.35)

  if (p.platform) {
    const y = yc + Ro + 0.15
    const x0 = -L * 0.32
    const x1 = L * 0.48
    const w = 1.2
    grating(k, [(x0 + x1) / 2, y, 0], x1 - x0, w)
    for (const x of [x0 + 0.1, (x0 + x1) / 2, x1 - 0.1]) {
      member(k, [x, y - 0.03, -w / 2], [x, y - 0.03, w / 2], 'UPN 100', 'galvanised', [0, 1, 0])
      for (const s of [-1, 1]) member(k, [x, y - 0.08, s * w * 0.38], [x, yc + Ro * 0.75, s * Ro * 0.55], 'L50x50x5', 'galvanised')
    }
    for (const s of [-1, 1]) member(k, [x0, y - 0.08, s * (w / 2 - 0.05)], [x1, y - 0.08, s * (w / 2 - 0.05)], 'UPN 100', 'galvanised', [0, 1, 0])
    handrail(k, [[x0 + 0.9, y, w / 2], [x1, y, w / 2], [x1, y, -w / 2], [x0, y, -w / 2], [x0, y, w / 2 - 0.05]])
    ladder(k, [x0 + 0.45, 0, w / 2 + 0.25], y, [0, 0, 1])
  }
}

/** Internals seen through the nozzles: inlet deflector, perforated calming baffle, weir (3-phase), mesh pad under the gas outlet, vortex breakers. */
function internals(k: Kit, p: P, yc: number, a: number) {
  const L = p.length
  // half-pipe style deflector in front of the inlet
  k.lathe('internalsSteel', [[a * 0.42, 0], [a * 0.42, 0.012]], [-L / 2 + 0.25, yc, 0], 'x', 32)
  k.cyl('internalsSteel', a * 0.42, 0.012, [-L / 2 + 0.25, yc, 0], 'x', 32)
  for (const s of [-1, 1]) k.rod('internalsSteel', [-L / 2 + 0.25, yc + s * a * 0.4, 0], [-L / 2 - 0.05, yc + s * a * 0.4, 0], 0.012, 6)
  // calming baffle across the liquid section, weir plate ahead of the oil bucket
  k.extrude('internalsSteel', segmentShape(a - 0.004, a * 0.1), 0.01, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-L * 0.28, yc, 0))
  if (p.service === '3-phase') k.extrude('internalsSteel', segmentShape(a - 0.004, -a * 0.05), 0.012, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(L * 0.32, yc, 0))
  // mesh pad with support grid under the gas outlet
  const mw = Math.min(1.2, L * 0.18)
  const yPad = yc + a * 0.55
  const half = Math.sqrt(Math.max(0, a * a - (a * 0.55) ** 2)) - 0.01
  k.box('galvanised', [mw, 0.15, 2 * half], [L * 0.4, yPad, 0])
  k.box('internalsSteel', [mw + 0.04, 0.02, 2 * half], [L * 0.4, yPad - 0.085, 0])
  // vortex breakers over the bottom outlets
  for (const x of [L * 0.4]) for (const r of [0, Math.PI / 2]) k.box('internalsSteel', [pipeOD(p.liquidNps) * 2, pipeOD(p.liquidNps), 0.01], [x, yc - a + pipeOD(p.liquidNps) * 0.5, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r))
}

/** Circular segment below a horizontal chord at height yTop (vessel-centre frame), in the YZ plane after rotation. */
function segmentShape(r: number, yTop: number) {
  const th = Math.asin(Math.max(-0.999, Math.min(0.999, yTop / r)))
  const sh = new THREE.Shape()
  sh.moveTo(r * Math.cos(th), yTop)
  sh.absarc(0, 0, r, th, Math.PI - th, true)
  sh.lineTo(r * Math.cos(th), yTop)
  return sh
}
