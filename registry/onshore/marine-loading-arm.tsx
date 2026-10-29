// Marine loading arm on a jetty riser: counterbalanced inboard and outboard arms, style 80 swivels, hydraulics, ERS and QC/DC coupler. OCIMF MLA, EN 1474.
import * as THREE from 'three'
import { type Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flangedJoint, gauge, junctionBox, ladder, nozzle, pipe, ringPlatform, tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { port, type Port } from '../lib/ports'
import { elbow90, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { hazardStripeMaterial } from '../lib/textures'
import { add, basePlate, clamp, deg, earthBond, hydraulicCylinder, plinth, ring, swivel } from './_onshore'

export interface MarineLoadingArmProps {
  /** product line size, inches */
  nps?: number
  rating?: Rating
  /** inboard and outboard arm length, m */
  reach?: number
  /** inboard arm angle above horizontal, degrees */
  luff?: number
  /** slew about the riser, degrees (0 = reaching +Z) */
  slew?: number
  /** outboard arm angle from plumb, degrees (+ swings out) */
  outboard?: number
  /** emergency release system (ERC with twin ball valves) */
  ers?: boolean
  /** hydraulic operation with power unit; false = manual */
  hydraulic?: boolean
  tag?: string
}

export const defaults = { nps: 12, rating: 150 as Rating, reach: 11, luff: 55, slew: 0, outboard: 30, ers: true, hydraulic: true, tag: '' }

// stand post height and arm length by size (B0030-type data; NPS 20 extrapolated, typical)
const SIZES: [number, number, number][] = [[6, 4.5, 8], [8, 4.5, 9], [10, 6, 10], [12, 7, 11], [16, 7, 11], [20, 7.5, 12]]
const RISER: Record<number, number> = { 6: 10, 8: 12, 10: 16, 12: 18, 16: 20, 20: 24 }

function layout(p: typeof defaults) {
  const row = SIZES.reduce((a, b) => (Math.abs(b[0] - p.nps) < Math.abs(a[0] - p.nps) ? b : a))
  const nps = row[0]
  const od = pipeOD(nps)
  const R = elbow90(nps, 'LR')
  const sw = Math.max(0.35, od * 1.6) // swivel length, typical
  const C = clamp(p.reach, 5, 16)
  const riserNps = RISER[nps]
  const Ro = pipeOD(riserNps) / 2
  const ph = 0.3
  const Hr = row[1]
  const hs = sw
  const Hp = Hr + hs + R + 0.35
  const xa = 2 * R + sw
  const xt = xa + R + sw * 0.4
  const xo = xa + 2 * R + sw
  const inlet = { base: [0, ph + 0.9, -Ro] as V3, standout: 0.25 + od * 0.5 }
  const s = clamp(0.55 + nps / 28, 0.7, 1.35)
  // bearing cheek between the inboard counterweight (half width 0.25 s) and the outboard lever
  const xc = (xa + 0.25 * s + 0.03 + xt - 0.05) / 2
  return { nps, od, R, sw, C, D: C, riserNps, Ro, ph, Hr, hs, Hp, xa, xt, xc, xo, inlet, s, a: 0.9 * s, b: 0.24 * C }
}
type L = ReturnType<typeof layout>

export function ports(props: MarineLoadingArmProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [port('riser', 'Riser inlet', [0, g.inlet.base[1], -(g.Ro + g.inlet.standout)], [0, 0, -1], g.nps, p.rating)]
}

export function MarineLoadingArm(props: MarineLoadingArmProps & GroupProps) {
  const { nps, rating, reach, luff, slew, outboard, ers, hydraulic, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, reach, luff, slew, outboard, ers, hydraulic, tag }
  const g = layout(p)
  const L = deg(clamp(luff, 20, 85))
  const O = deg(clamp(outboard, -15, 90))
  const key = [nps, rating, reach, ers, hydraulic, tag]
  const fixed = useKit((k) => buildFixed(k, g, p), key)
  const turret = useKit((k) => buildTurret(k, g, p), key)
  const inboard = useKit((k) => buildInboard(k, g), key)
  const lever = useKit((k) => buildLever(k, g), key)
  const out = useKit((k) => buildOutboard(k, g), key)
  const coupler = useKit((k) => buildCoupler(k, g, p), key)
  const dyn = useKit((k) => buildDyn(k, g, L, O, hydraulic), [...key, L, O])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <group rotation-y={deg(clamp(slew, -60, 60))}>
        <KitMesh data={turret} />
        <KitMesh data={dyn} />
        <group position={[0, g.Hp, 0]} rotation-x={-O}>
          <KitMesh data={lever} />
        </group>
        <group position={[0, g.Hp, 0]} rotation-x={-L}>
          <KitMesh data={inboard} />
          <group position={[0, 0, g.C]} rotation-x={L - O}>
            <KitMesh data={out} />
            <group position={[g.xo, -g.D, 0]} rotation-x={O}>
              <KitMesh data={coupler} />
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

export default MarineLoadingArm

const wall = (g: L) => pipeWall(g.nps, 'STD')
const ARM = 'equipmentPaint'
const STEEL = 'structSteelDark'

function counterweight(k: Kit, c: V3, size: V3) {
  const geo = new THREE.BoxGeometry(...size)
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3)
  k.add(hazardStripeMaterial(), geo, new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]))
  k.box(STEEL, [size[0] + 0.03, 0.04, size[2] + 0.03], [c[0], c[1] + size[1] / 2 + 0.02, c[2]])
  for (const s of [-1, 1]) k.torus('nut', 0.05, 0.012, [c[0] + s * size[0] * 0.3, c[1] + size[1] / 2 + 0.07, c[2]], 'z', 6, 14)
}

function buildFixed(k: Kit, g: L, p: typeof defaults) {
  const { Ro, ph, Hr, od } = g
  // plinth, base plate with gussets, closed riser bottom
  plinth(k, 0, 0, Ro * 2 + 0.9, Ro * 2 + 0.9, ph)
  basePlate(k, 0, ph + 0.04, 0, Ro * 2 + 0.6, Ro * 2 + 0.6, 0.04, 0.036)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    k.box(STEEL, [0.2, 0.35, 0.02], [Math.cos(a) * (Ro + 0.1), ph + 0.04 + 0.175, Math.sin(a) * (Ro + 0.1)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
  }
  const rw = pipeWall(g.riserNps, 'STD')
  const yRed = Hr - 0.55
  k.pipe(ARM, [0, ph + 0.04, 0], [0, yRed, 0], Ro * 2, rw, 48)
  // concentric reducer to the arm size, flanged joint, base slewing swivel
  k.lathe(ARM, [[Ro, yRed], [od / 2, Hr - 0.2], [od / 2 - 0.01, Hr - 0.2]].map(([r, y]) => [r, y - yRed]) as [number, number][], [0, yRed, 0], 'y', 48)
  pipe(k, [0, Hr - 0.2, 0], [0, Hr - 0.12, 0], g.nps, ARM)
  flangedJoint(k, g.nps, p.rating, [0, Hr - 0.06, 0], 'y')
  swivel(k, [0, Hr, 0], [0, Hr + g.hs, 0], od)
  // slew ring gear
  k.cyl(STEEL, Ro + 0.12, 0.06, [0, Hr - 0.6, 0], 'y', 48)
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    k.box(STEEL, [0.04, 0.06, 0.03], [Math.cos(a) * (Ro + 0.135), Hr - 0.6, Math.sin(a) * (Ro + 0.135)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
  }
  // inlet nozzle, drain, vent
  nozzle(k, { base: g.inlet.base, dir: [0, 0, -1], nps: g.nps, rating: p.rating, standout: g.inlet.standout, mat: ARM })
  k.pipe(ARM, [Ro * 0.7, ph + 0.18, 0], [Ro + 0.25, ph + 0.18, 0], 0.06, 0.005)
  k.box('valveBody', [0.12, 0.1, 0.1], [Ro + 0.32, ph + 0.18, 0])
  k.box('actuatorRed', [0.03, 0.02, 0.2], [Ro + 0.32, ph + 0.25, 0.08])
  k.cyl('brass', 0.035, 0.06, [Ro + 0.41, ph + 0.18, 0], 'x', 12)
  // platform under the swivels, caged ladder, tag, earth
  const yp = Hr - 1.2
  ringPlatform(k, yp, Ro + 0.01, 0.85, Math.PI / 2, (3 * Math.PI) / 2)
  const lx = -(Ro + 0.95)
  ladder(k, [lx, ph, 0], yp, [-1, 0, 0])
  for (const y of [ph + 1.2, yp - 1.5]) k.box(STEEL, [0.95 - 0.02, 0.06, 0.06], [lx / 2 - Ro / 2, y, 0])
  if (p.tag) tagPlate(k, p.tag, [0, ph + 1.7, Ro + 0.003], 'z', 0.32)
  earthBond(k, [Ro * 0.7, ph + 0.35, Ro * 0.72], [0.7, 0, 0.72], 0, Ro + 0.25)
  // hydraulic power unit with accumulators and tubing up the riser
  if (p.hydraulic) {
    const hx = Ro + 1.6
    const hz = -0.9
    plinth(k, hx, hz, 1.9, 1.2, 0.15)
    k.box(STEEL, [1.7, 0.12, 1.0], [hx, 0.21, hz])
    k.rbox('actuatorBlue', [0.9, 0.6, 0.7], 0.02, [hx - 0.25, 0.57, hz])
    k.cyl('motorPaint', 0.16, 0.45, [hx + 0.45, 0.45, hz], 'x', 24)
    k.cyl('motorPaint', 0.11, 0.2, [hx + 0.2, 0.45, hz], 'x', 20)
    for (const dx of [-0.55, -0.35]) {
      k.cyl('actuatorRed', 0.09, 0.7, [hx + dx, 1.22, hz - 0.3], 'y', 20)
      k.dome('actuatorRed', 0.09, [hx + dx, 1.57, hz - 0.3], 'y')
    }
    k.box(STEEL, [0.05, 0.9, 0.05], [hx + 0.3, 0.72, hz + 0.45])
    junctionBox(k, [hx + 0.3, 1.0, hz + 0.475], 'z', [0.4, 0.35, 0.14], 'stainless')
    gauge(k, [hx - 0.25, 0.95, hz + 0.36], 'z', 0.08, 'bar', 250)
    const ty = 0.35
    k.tube('tubing', [[hx - 0.6, ty, hz + 0.2], [Ro + 0.06, ty, hz + 0.2], [Ro + 0.06, ty, -0.05], [Ro + 0.04, ty + 0.2, -0.05], [Ro + 0.04, Hr - 0.7, -0.05]], 0.009)
    k.tube('tubing', [[hx - 0.6, ty + 0.05, hz + 0.25], [Ro + 0.1, ty + 0.05, hz + 0.25], [Ro + 0.1, ty + 0.05, 0.05], [Ro + 0.04, ty + 0.25, 0.05], [Ro + 0.04, Hr - 0.7, 0.05]], 0.009)
    for (let y = 1; y < Hr - 0.8; y += 1.5) k.box(STEEL, [0.06, 0.04, 0.16], [Ro + 0.03, y, 0])
  }
}

function buildTurret(k: Kit, g: L, p: typeof defaults) {
  const { R, Hr, hs, Hp, xc, Ro } = g
  const y0 = Hr + hs
  // vertical riser stub and bend to the luffing swivel (axis +X)
  pipe(k, [0, y0, 0], [0, Hp - R, 0], g.nps, ARM)
  k.bend(ARM, [0, Hp - R, 0], [0, 1, 0], [1, 0, 0], R, g.od, Math.PI / 2, wall(g))
  swivel(k, [R, Hp, 0], [R + g.sw, Hp, 0], g.od)
  // slewing head on the swivel, box girder forward of the pivot (clear of the counterweight sweep), bearing cheek
  const x0 = -(Ro + 0.35)
  const x1 = g.xt + 0.2
  const z0 = g.od * 0.5 + 0.02
  const zg = 0.6
  k.cyl(STEEL, g.od * 0.9, 0.12, [0, y0 + 0.06, 0], 'y', 32)
  k.box(STEEL, [x1 - x0, 0.3, zg], [(x1 + x0) / 2, y0 + 0.15, z0 + zg / 2])
  k.box(STEEL, [0.5, 0.3, z0 + 0.1], [0, y0 + 0.15, z0 / 2])
  for (const x of [x0 + 0.02, -0.25, g.xa - 0.35, x1 - 0.02]) k.box(STEEL, [0.02, 0.26, zg - 0.04], [x, y0 + 0.15, z0 + zg / 2])
  const cheek = new THREE.Shape()
  cheek.moveTo(-0.25, Hp - y0 + 0.25)
  cheek.lineTo(0.22, Hp - y0 + 0.25)
  cheek.lineTo(z0 + zg, 0.3)
  cheek.lineTo(z0, 0.3)
  cheek.lineTo(-0.25, Hp - y0 - 0.3)
  cheek.closePath()
  k.extrude(STEEL, cheek, 0.05, new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(xc + 0.025, y0, 0))
  k.cyl('machined', 0.21, 0.16, [xc, Hp, 0], 'x', 28)
  k.boltCircle('boltXylan', 'nut', 6, 0.16, [xc - 0.1, Hp, 0], 'x', 0.02, 0.2, [0.02, 0.18])
  k.cyl('stainless', 0.09, g.xt - xc + 0.06, [(xc + g.xt) / 2, Hp, 0], 'x', 16)
  // slew drive: hydraulic motor and pinion on a bracket
  if (p.hydraulic) {
    const mx = -(Ro + 0.2)
    k.box(STEEL, [0.3, y0 - (Hr - 0.6) + 0.1, 0.04], [mx, (y0 + Hr - 0.6) / 2, Ro * 0.3 + 0.12])
    k.cyl(STEEL, 0.07, 0.07, [mx, Hr - 0.6, Ro * 0.3], 'y', 14)
    k.cyl('actuatorBlue', 0.1, 0.35, [mx, Hr - 0.35, Ro * 0.3], 'y', 20)
  }
  // luff end stops and envelope limit switches
  for (const x of [g.xa - 0.2, x1 - 0.1]) {
    k.box('rubberBlack', [0.12, 0.15, 0.15], [x, y0 + 0.375, z0 + 0.1])
    k.box('actuatorYellow', [0.08, 0.12, 0.08], [x, y0 + 0.36, z0 + zg - 0.08])
  }
}

function buildInboard(k: Kit, g: L) {
  const { R, sw, xa, xt, C, od, s } = g
  // heel bend from the swivel into the arm, trunnion hub
  k.bend(ARM, [R + sw, 0, 0], [1, 0, 0], [0, 0, 1], R, od, Math.PI / 2, wall(g))
  k.cyl(STEEL, od * 0.6 + 0.05, xt - (R + sw) - 0.05, [(xt + R + sw) / 2 - 0.025, 0, 0], 'x', 28)
  // inboard arm, apex bend, outboard swivel, vacuum breaker
  pipe(k, [xa, 0, R], [xa, 0, C - R], g.nps, ARM)
  k.bend(ARM, [xa, 0, C - R], [0, 0, 1], [1, 0, 0], R, od, Math.PI / 2, wall(g))
  swivel(k, [xa + R, 0, C], [xa + R + sw, 0, C], od)
  k.cyl('valveBody', 0.05, 0.16, [xa + R * 0.35, od / 2 + 0.06, C - R * 0.06], 'y', 14)
  k.cyl('actuatorRed', 0.065, 0.04, [xa + R * 0.35, od / 2 + 0.16, C - R * 0.06], 'y', 14)
  // counterweight boom and block behind the pivot
  const Lc = 0.3 * C
  for (const dx of [-0.12, 0.12]) k.box(STEEL, [0.08, 0.3, Lc + 0.3], [xa + dx, 0, -Lc / 2 + 0.15])
  k.box(STEEL, [0.34, 0.06, 0.6], [xa, od / 2 + 0.02, R + 0.3])
  counterweight(k, [xa, -0.15 * s, -Lc], [0.5 * s, 1.1 * s, 1.0 * s])
  // lug for the luffing cylinder, hose bundle along the arm
  k.box(STEEL, [0.04, 0.25, 0.3], [xa - 0.25, -od / 2 - 0.08, 0.28 * C])
  k.box(STEEL, [0.3, 0.04, 0.3], [xa - 0.12, -od / 2 + 0.01, 0.28 * C])
  k.rod('rubberBlack', [xa, od / 2 + 0.03, R + 0.3], [xa, od / 2 + 0.03, C - R], 0.024, 8)
  for (let z = R + 1; z < C - R; z += 1.6) k.torus('stainless', od / 2 + 0.004, 0.008, [xa, 0, z], 'z', 6, 24)
}

function buildLever(k: Kit, g: L) {
  const { xt, a, b, s } = g
  // outboard pantograph lever: crank up to the tie rod, rear arm with the outboard counterweight
  k.cyl(STEEL, 0.17, 0.08, [xt, 0, 0], 'x', 24)
  k.box(STEEL, [0.04, a + 0.15, 0.18], [xt, a / 2, 0])
  k.cyl('machined', 0.05, 0.12, [xt, a, 0], 'x', 14)
  k.box(STEEL, [0.04, 0.2, b], [xt, 0, -b / 2])
  k.box(STEEL, [0.04, 0.2, b], [xt + 0.12, 0, -b / 2])
  counterweight(k, [xt + 0.3 * s, 0, -b], [0.55 * s, 0.8 * s, 0.75 * s])
}

function buildOutboard(k: Kit, g: L) {
  const { xa, R, sw, xo, D, od, a, xt } = g
  k.bend(ARM, [xa + R + sw, 0, 0], [1, 0, 0], [0, -1, 0], R, od, Math.PI / 2, wall(g))
  pipe(k, [xo, -R, 0], [xo, -D, 0], g.nps, ARM)
  // crank at the apex, parallel to the base lever
  k.box(STEEL, [xo - xt + 0.05, 0.16, 0.16], [(xo + xt) / 2, 0.06, 0])
  k.box(STEEL, [0.04, a + 0.1, 0.18], [xt, a / 2, 0])
  k.cyl('machined', 0.05, 0.12, [xt, a, 0], 'x', 14)
  k.rod('rubberBlack', [xo, -R - 0.3, od / 2 + 0.03], [xo, -D + 0.3, od / 2 + 0.03], 0.024, 8)
  for (let y = -R - 1; y > -D + 0.4; y -= 1.6) k.torus('stainless', od / 2 + 0.004, 0.008, [xo, y, 0], 'y', 6, 24)
  // parking pin bracket near the lower end
  k.box(STEEL, [0.2, 0.25, 0.05], [xo, -D + 0.6, -od / 2 - 0.03])
}

function buildCoupler(k: Kit, g: L, p: typeof defaults) {
  const { R, sw, od, nps } = g
  // triple swivel: Y, X then Z axes
  swivel(k, [0, 0, 0], [0, -sw, 0], od)
  k.bend(ARM, [0, -sw, 0], [0, -1, 0], [1, 0, 0], R, od, Math.PI / 2, wall(g))
  swivel(k, [R, -sw - R, 0], [R + sw, -sw - R, 0], od)
  k.bend(ARM, [R + sw, -sw - R, 0], [1, 0, 0], [0, -1, 0], R, od, Math.PI / 2, wall(g))
  const x = 2 * R + sw
  let y = -sw - 2 * R
  // insulating flange (orange sleeve kit)
  pipe(k, [x, y, 0], [x, y - 0.15, 0], nps, ARM)
  flangedJoint(k, nps, p.rating, [x, y - 0.2, 0], '-y')
  ring(k, paint('#d9661f', { clearcoat: 0 }), od / 2 + 0.01, od * 0.68, 0.012, [x, y - 0.2, 0], 'y')
  y -= 0.25
  pipe(k, [x, y, 0], [x, y - 0.08, 0], nps, ARM)
  y -= 0.08
  if (p.ers) {
    // emergency release coupler: twin ball valves either side of the release collar
    const vb = od * 1.5
    for (const [yc, sgn] of [[y - vb * 0.6, 1], [y - vb * 1.9, -1]] as const) {
      ring(k, 'valveBody', od / 2 - wall(g), od * 0.95, vb * 0.9, [x, yc, 0], 'y')
      k.cyl('pipeBore', od / 2 - wall(g), vb * 0.9, [x, yc, 0], 'y', 32, undefined, true)
      k.rbox('actuatorYellow', [0.22, 0.2, 0.25], 0.02, [x, yc, od * 0.95 + 0.12])
      k.cyl('actuatorBlue', 0.05, 0.3, [x + 0.1, yc + sgn * 0.02, od * 0.95 + 0.12], 'x', 14)
    }
    const yr = y - vb * 1.25
    ring(k, 'flangeSteel', od / 2 - wall(g), od * 1.0, 0.14, [x, yr, 0], 'y')
    ring(k, 'actuatorRed', od / 2, od * 1.05, 0.05, [x, yr, 0], 'y')
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      k.box('flangeSteel', [0.05, 0.22, 0.05], [x + Math.cos(a) * od * 1.05, yr, Math.sin(a) * od * 1.05])
    }
    hydraulicCylinder(k, [x + od * 1.15, y - vb * 0.6, 0.08], [x + od * 1.15, y - vb * 1.9, 0.08], 0.05)
    y -= vb * 2.5
  }
  pipe(k, [x, y, 0], [x, y - 0.05, 0], nps, ARM)
  y -= 0.05
  k.bend(ARM, [x, y, 0], [0, -1, 0], [0, 0, 1], R, od, Math.PI / 2, wall(g))
  const z0 = R
  swivel(k, [x, y - R, z0], [x, y - R, z0 + sw], od)
  // hydraulic QC/DC coupler: body, clamp jaws, drive motor, presentation flange face
  const zq = z0 + sw
  const lq = Math.max(0.25, od * 1.1)
  const yq = y - R
  ring(k, 'flangeSteel', od / 2 - wall(g), od * 0.75, lq, [x, yq, zq + lq / 2], 'z')
  k.cyl('pipeBore', od / 2 - wall(g), lq, [x, yq, zq + lq / 2], 'z', 32, undefined, true)
  k.torus('machined', od * 0.75, 0.012, [x, yq, zq + lq * 0.15], 'z', 6, 36)
  const nj = nps >= 12 ? 6 : 4
  for (let i = 0; i < nj; i++) {
    const a = (i / nj) * Math.PI * 2
    const c = [x + Math.cos(a) * od * 0.88, yq + Math.sin(a) * od * 0.88] as const
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a)
    k.box('actuatorYellow', [0.07, 0.08, lq * 0.9], [c[0], c[1], zq + lq * 0.5], q)
    k.box('flangeSteel', [0.09, 0.06, 0.05], [x + Math.cos(a) * od * 0.82, yq + Math.sin(a) * od * 0.82, zq + lq + 0.02], q)
  }
  k.cyl('actuatorBlue', 0.07, 0.22, [x, yq + od * 0.88 + 0.1, zq + lq * 0.4], 'y', 18)
  ring(k, 'machined', od / 2 - wall(g), od * 0.52, 0.012, [x, yq, zq + lq + 0.004], 'z')
  k.spline('rubberBlack', [[x, yq + od * 0.88 + 0.2, zq + lq * 0.4], [x, yq + od * 0.88 + 0.5, zq * 0.5], [0, -sw - 0.2, od * 0.9], [0, -0.3, od / 2 + 0.03]], 0.018, 8, 30)
  // drain at the low point
  k.cyl('valveBody', 0.04, 0.12, [x, yq - od / 2 - 0.08, z0 + sw * 0.4], 'y', 12)
  k.box('actuatorRed', [0.12, 0.015, 0.025], [x + 0.05, yq - od / 2 - 0.12, z0 + sw * 0.4])
}

function buildDyn(k: Kit, g: L, L: number, O: number, hydraulic: boolean) {
  const { Hp, Hr, hs, C, a, xa, xt } = g
  const rx = (v: V3, ang: number): V3 => [v[0], v[1] * Math.cos(ang) - v[2] * Math.sin(ang), v[1] * Math.sin(ang) + v[2] * Math.cos(ang)]
  const piv: V3 = [0, Hp, 0]
  const luffPt = (v: V3) => add(piv, rx(v, -L))
  const leverPt = (v: V3) => add(piv, rx(v, -O))
  const apex = luffPt([0, 0, C])
  // pantograph tie rod: base lever crank pin to apex crank pin, parallel to the inboard arm
  const crank = rx([0, a, 0], -O)
  const t0 = add(piv, [xt, crank[1], crank[2]])
  const t1 = add(apex, [xt, crank[1], crank[2]])
  k.rod('structSteel', t0, t1, 0.055, 12)
  for (const t of [t0, t1]) k.cyl('flangeSteel', 0.07, 0.1, add(t, [0.07, 0, 0]), 'x', 14)
  if (!hydraulic) return
  const y0 = Hr + hs + 0.3
  const zf = g.od * 0.5 + 0.5
  hydraulicCylinder(k, [xa - 0.35, y0, zf], luffPt([xa - 0.25, -g.od / 2 - 0.15, 0.28 * C]), 0.14)
  hydraulicCylinder(k, [xt + 0.08, y0, zf], leverPt([xt + 0.08, a * 0.6, 0]), 0.11)
}
