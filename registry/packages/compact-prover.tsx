// Compact (small-volume) piston prover skid: honed flow tube with inlet / outlet housings, nitrogen plenum, optical switch housing, hydraulic return pack, 4-way diverter valve. API MPMS 4.2, ASME B16.5.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { gauge, member, motor, motorSize, nozzle, pipeRun, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { SECTIONS, flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { addv, blFlange, cableTray, earthBoss, localPanel, mateFlange, padeyeShackles, pipeSupport, smallValve, spoolJoint, tempElement, transmitter } from './_skid'

export interface CompactProverProps {
  /** line size of the inlet / outlet connections */
  nps?: number
  rating?: Rating
  /** flow tube length between housings, m */
  tubeLength?: number
  tag?: string
}

export const defaults = {
  nps: 6,
  rating: 300 as Rating,
  tubeLength: 2.0,
  tag: 'X-R155',
}

type P = typeof defaults

const SKID = 'HEB 200'
const TUBE: MatKey = paint('#c9ccc6', { metalness: 0.35, roughness: 0.4 })
const BODY: MatKey = paint('#2e5d8a', { metalness: 0.3, roughness: 0.45 })

function layout(p: P) {
  const D = pipeOD(p.nps)
  const f = flangeDims(p.nps, p.rating)
  const fl = f.hubLength + f.raisedFaceHeight
  const Rt = Math.max(0.12, D * 1.05) // flow tube outer radius
  const Rh = Rt + 0.06 // housings
  const Lt = p.tubeLength
  const xT0 = -(Lt + 1.6) / 2 + 0.2
  const xT1 = xT0 + Lt
  const Lp = 0.9
  const L = Lt + 0.6 + 0.35 + Lp + 1.4
  const W = 2.0
  const y0 = SECTIONS[SKID].d + 0.008
  const yt = y0 + 1.6
  const zt = -0.4
  const zv = 0.3
  const yv = y0 + 0.42
  const h = D * 1.25 + 0.05 // 4-way port face from body axis
  const xv = (xT0 + xT1) / 2
  const yNz = yt - Rh - 0.18 // housing nozzle face
  return { D, f, fl, Rt, Rh, Lt, xT0, xT1, Lp, L, W, y0, yt, zt, zv, yv, h, xv, yNz, yB: y0 + 0.72, zf: zv + h + 0.42 }
}

export function ports(props: CompactProverProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [
    port('inlet', 'Inlet (from meter)', [-g.L / 2, g.yv, g.zv], [-1, 0, 0], p.nps, p.rating),
    port('outlet', 'Outlet (to line)', [g.L / 2, g.yv, g.zv], [1, 0, 0], p.nps, p.rating),
  ]
}

export function CompactProver(props: CompactProverProps & GroupProps) {
  const { nps, rating, tubeLength, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, tubeLength, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default CompactProver

function build(k: Kit, p: P) {
  const g = layout(p)
  const { L, W, y0, yt, zt, zv, yv, h, xv, D, Rt, Rh, xT0, xT1, fl } = g
  const R = p.rating
  const n = p.nps
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)
  tagPlate(k, p.tag, [-L / 2 + 0.8, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.3)
  earthBoss(k, [L / 2 - 0.4, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])

  // ---------------------------------------------------------------- flow tube, housings, plenum, switch housing
  k.cyl(TUBE, Rt, xT1 - xT0, [(xT0 + xT1) / 2, yt, zt], 'x', 40)
  for (const [x, label] of [[xT0, 'INLET'], [xT1, 'OUTLET']] as const) {
    k.cyl(BODY, Rh, 0.36, [x, yt, zt], 'x', 40)
    for (const s of [-1, 1]) {
      k.cyl(BODY, Rh + 0.05, 0.05, [x + s * 0.2, yt, zt], 'x', 40)
      k.around(12, Rh + 0.025, [x + s * 0.2, yt, zt], 'x', (q) => k.hex('nut', 0.03, 0.07, q, 'x'))
    }
    k.plane(textMaterial(label, '#2e5d8a', '#fff', 256, 64), 0.18, 0.045, [x, yt + 0.05, zt + Rh + 0.003])
  }
  k.cyl(BODY, Rh + 0.03, 0.04, [xT0 - 0.2, yt, zt], 'x', 40)
  k.disc(BODY, Rh + 0.03, [xT0 - 0.22, yt, zt], '-x', 40)
  const xp0 = xT1 + 0.22
  const xp1 = xp0 + g.Lp
  k.cyl(BODY, Rt * 0.85, g.Lp, [(xp0 + xp1) / 2, yt, zt], 'x', 36)
  k.cyl(BODY, Rt * 0.95, 0.05, [xp1, yt, zt], 'x', 36)
  k.around(10, Rt * 0.9, [xp1 + 0.03, yt, zt], 'x', (q) => k.hex('nut', 0.026, 0.02, q, 'x'))
  for (let x = xp0 + 0.15; x < xp1 - 0.05; x += 0.25) k.cyl('boltXylan', 0.01, 0.02, [x, yt + Rt * 0.85, zt], 'y', 8)
  k.plane(textMaterial('N2 PLENUM', '#2e5d8a', '#fff', 256, 64), 0.22, 0.055, [(xp0 + xp1) / 2, yt, zt + Rt * 0.85 + 0.003])
  // optical switch housing on top: guide tube, switch blocks, conduit
  const ys = yt + Rh + 0.12
  k.box('aluminium', [xp1 - xT0 + 0.1, 0.1, 0.12], [(xT0 + xp1) / 2, ys, zt])
  for (const x of [xT0 + 0.35, xT1 - 0.35]) {
    k.rbox('actuatorBlue', [0.1, 0.12, 0.14], 0.012, [x, ys + 0.1, zt])
    k.cyl('brass', 0.012, 0.03, [x, ys + 0.18, zt], 'y', 8)
  }
  for (const x of [xT0 + 0.1, xT1 + 0.1, xp1 - 0.1]) k.box('aluminium', [0.05, Rh + 0.08, 0.05], [x, yt + (Rh + 0.08) / 2, zt - 0.08])
  k.tube('cable', [[xT0 + 0.35, ys + 0.2, zt], [xT0 + 0.35, ys + 0.26, zt], [xT1 - 0.35, ys + 0.26, zt], [xT1 - 0.35, ys + 0.2, zt]], 0.01, 6, 0.04)
  // flow tube temperature, inlet / outlet housing PT and TT
  tempElement(k, [(xT0 + xT1) / 2, yt, zt], [0, 0, 1], Rt * 2)
  tempElement(k, [(xT0 + xT1) / 2 + 0.3, yt, zt], [0, 0, 1], Rt * 2)
  for (const x of [xT0, xT1]) transmitter(k, [x, yt + Rh * 0.7, zt + Rh * 0.7], [0, 0.7, 0.7], 0.08)
  // tube saddles and frame
  for (const x of [xT0, xT1, (xp0 + xp1) / 2]) {
    const top = yt - (x > xT1 + 0.1 ? Rt * 0.85 : Rh)
    for (const s of [-1, 1]) {
      member(k, [x, y0, zt + s * (Rh * 0.75)], [x, top - 0.02, zt + s * (Rh * 0.75)], 'HEB 100', 'structSteel', [0, 0, 1])
      k.box('structSteel', [0.2, 0.016, 0.2], [x, y0 + 0.008, zt + s * (Rh * 0.75)])
    }
    k.box('structSteel', [0.14, 0.04, Rh * 1.8], [x, top - 0.02, zt])
  }

  // ---------------------------------------------------------------- 4-way diverter valve
  const Rb = D * 0.95
  k.cyl('valveBody', Rb, D * 1.6, [xv, yv, zv], 'y', 32)
  k.dome('valveBody', Rb, [xv, yv - D * 0.8, zv], '-y', Math.PI / 2, 0.45, 32)
  k.cyl('valveBody', Rb * 1.12, 0.05, [xv, yv + D * 0.8 + 0.025, zv], 'y', 32)
  k.around(12, Rb * 1.05, [xv, yv + D * 0.8 + 0.055, zv], 'y', (q) => k.hex('nut', 0.026, 0.02, q))
  const ya = yv + D * 0.8 + 0.06
  k.cyl('valveBody', D * 0.3, 0.12, [xv, ya + 0.06, zv], 'y', 20)
  k.rbox('actuatorBlue', [0.32, 0.3, 0.34], 0.03, [xv, ya + 0.27, zv])
  k.cyl('actuatorBlue', 0.1, 0.32, [xv, ya + 0.25, zv + 0.32], 'z', 20)
  k.rbox('actuatorBlue', [0.2, 0.12, 0.18], 0.02, [xv, ya + 0.48, zv])
  k.handwheel('handwheel', 0.32, [xv - 0.22, ya + 0.27, zv], '-x', 5)
  k.plane(textMaterial('4-WAY VALVE', '#2e5d8a', '#fff', 256, 64), 0.16, 0.04, [xv, yv, zv + Rb + 0.003])
  const dirs: V3[] = [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]]
  const weld: V3[] = []
  for (const d of dirs) {
    const face = addv([xv, yv, zv], d, h)
    k.pipe('valveBody', addv([xv, yv, zv], d, Rb * 0.8), addv(face, d, -fl - 0.00225), D * 1.1, D * 0.08)
    spoolJoint(k, face, d, n, R)
    weld.push(addv(face, d, fl + 0.00225))
  }
  smallValve(k, 'needle', [xv, yv - D * 0.8 - Rb * 0.45 - 0.03, zv], [0, -1, 0], 0.008, [0, 0, 1]) // body bleed (seal check)

  // inlet / outlet to the battery limits
  const iw = blFlange(k, [-L / 2, yv, zv], [-1, 0, 0], n, R)
  pipeRun(k, [iw, weld[0]], n)
  const ow = blFlange(k, [L / 2, yv, zv], [1, 0, 0], n, R)
  pipeRun(k, [weld[1], ow], n)
  // diverter legs up to the housing nozzles (pointing down)
  const nz0 = nozzle(k, { base: [xT0, yt - Rh, zt], dir: [0, -1, 0], nps: n, rating: R, standout: g.yt - Rh - g.yNz, mat: BODY, studs: false })
  const nz1 = nozzle(k, { base: [xT1, yt - Rh, zt], dir: [0, -1, 0], nps: n, rating: R, standout: g.yt - Rh - g.yNz, mat: BODY, studs: false })
  const a0 = mateFlange(k, nz0, [0, -1, 0], n, R)
  const a1 = mateFlange(k, nz1, [0, -1, 0], n, R)
  pipeRun(k, [weld[2], [xv, yv, zt], [xT0, yv, zt], a0], n)
  pipeRun(k, [weld[3], [xv, yv, g.zf], [xv, g.yB, g.zf], [xT1, g.yB, g.zf], [xT1, g.yB, zt], a1], n)
  for (const x of [xT0 + 0.5]) pipeSupport(k, [x, yv, zt], D, y0, 'x')
  pipeSupport(k, [(xv + xT1) / 2, g.yB, g.zf], D, y0, 'x')
  pipeSupport(k, [-L / 2 + 0.45, yv, zv], D, y0, 'x')
  pipeSupport(k, [L / 2 - 0.45, yv, zv], D, y0, 'x')
  gauge(k, [xv - 0.6, yv + D / 2 + 0.15, zv + 0.02], 'z', 0.1, 'bar', 60)
  k.rod('stainless', [xv - 0.6, yv + D / 2 - 0.01, zv], [xv - 0.6, yv + D / 2 + 0.1, zv], 0.008, 8)

  // ---------------------------------------------------------------- hydraulic return pack and N2 charge panel under the plenum
  const xh = (xp0 + xp1) / 2
  const zh = zt + 0.45
  k.rbox('stainless', [0.6, 0.35, 0.4], 0.015, [xh, y0 + 0.2, zh])
  const ms = motorSize(1.5, 4)
  const Hm = Math.max(ms.H, ms.R * 1.25)
  k.at([xh + 0.05, y0 + 0.375 + Hm, zh], undefined, () => motor(k, { R: ms.R, L: ms.L, H: Hm, tbox: 'top', fins: 18 }))
  k.rbox('aluminium', [0.1, 0.1, 0.1], 0.01, [xh + 0.11, y0 + 0.375 + Hm, zh])
  k.tube('tubing', [[xh + 0.16, y0 + 0.375 + Hm, zh], [xh + 0.25, y0 + 0.375 + Hm, zh], [xh + 0.25, yt - Rt * 0.6, zh], [xh + 0.25, yt - Rt * 0.6, zt + Rt * 0.6]], 0.008, 8, 0.03)
  const np0: V3 = [xp1 + 0.25, y0 + 1.1, zt + 0.25]
  k.box('stainless', [0.3, 0.4, 0.006], np0)
  k.box('galvanised', [0.05, 1.1, 0.05], [np0[0], y0 + 0.55, np0[2] - 0.04])
  gauge(k, addv(np0, [0, 0.08, 0.03]), 'z', 0.1, 'bar', 100)
  smallValve(k, 'needle', addv(np0, [0, -0.1, 0.02]), [1, 0, 0], 0.008, [0, 0, 1])
  k.plane(textMaterial('N2 CHARGE', '#111', '#fff', 256, 48), 0.14, 0.026, addv(np0, [0, 0.17, 0.004]))
  k.tube('tubing', [addv(np0, [0, 0.2, -0.01]), [np0[0], yt, np0[2] - 0.01], [xp1 - 0.1, yt, zt + Rt * 0.8]], 0.005, 6, 0.03)

  // ---------------------------------------------------------------- prover controller and cable tray
  const px = xT0 - 0.15
  const gl = localPanel(k, [px, y0, W / 2 - 0.3], [0, 0, 1], { w: 0.55, h: 0.65, top: 1.85, title: 'PROVER CONTROLLER', buttons: 3 })
  const tz = W / 2 - 0.12
  cableTray(k, [[px, gl[1] - 0.04, gl[2]], [px, y0 + 0.22, gl[2]], [px, y0 + 0.22, tz], [xh, y0 + 0.22, tz]], [1, 0, 0], 0.15, 2)
  k.spline('cable', [[xh, y0 + 0.24, tz], [xh + 0.1, y0 + 0.5, zh + 0.3], [xh - 0.05, y0 + 0.375 + Hm + ms.R + 0.05, zh + 0.05]], 0.009, 6, 16)
  k.spline('cable', [[xT1 - 0.2, y0 + 0.24, tz], [xT1 - 0.3, y0 + 1.2, zt + 0.5], [xT1 - 0.35, ys + 0.2, zt + 0.08]], 0.008, 6, 20)
}
