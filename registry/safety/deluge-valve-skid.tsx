// Deluge valve set on a skid: OS&Y isolation valves either side of a clapper-type deluge valve with priming, solenoid release, manual release, alarm pressure switch, gauges and drain to a tundish. NFPA 15, EN 12259-9, ASME B16.5.
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, gauge, junctionBox, pipe, skid, tagPlate, weldBead, member } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { GASKET_SPIRAL_WOUND, faceToFace, pipeOD, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { cable } from './_fg'
import { boltUp, osyGate, portBore } from './_valves'

export interface DelugeValveSkidProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** upstream and downstream OS&Y isolation valves */
  isolation?: boolean
  frame?: boolean
  tag?: string
}

export const defaults = { nps: 6, rating: 150 as Rating, isolation: true, frame: true, tag: 'DV-1101' }

const G = GASKET_SPIRAL_WOUND
const RED = 'firewaterRed'

function layout(p: typeof defaults) {
  const { nps, rating, isolation, frame } = p
  const D = pipeOD(nps)
  const Ls = 0.3 + D // end spools, flange face to face
  const Lg = isolation ? faceToFace('gate', nps, rating) : 0
  const Ld = 0.14 + 0.05 * nps // typical deluge valve body face to face
  const Lm = 0.25 + D
  const parts: [string, number][] = [['in', Ls]]
  if (isolation) parts.push(['g1', Lg])
  parts.push(['dv', Ld], ['mid', Lm])
  if (isolation) parts.push(['g2', Lg])
  parts.push(['out', Ls])
  const total = parts.reduce((s, [, l]) => s + l, 0) + (parts.length - 1) * G
  let x = -total / 2
  const at: Record<string, [number, number]> = {}
  const joints: number[] = []
  parts.forEach(([n, l], i) => {
    at[n] = [x, x + l]
    x += l
    if (i < parts.length - 1) {
      joints.push(x + G / 2)
      x += G
    }
  })
  const hs = frame ? 0.168 : 0 // UPN 160 skid + plate
  const c = hs + Math.max(0.75, D * 1.4 + 0.45)
  return { D, Ld, total, at, joints, hs, c }
}

export function ports(props: DelugeValveSkidProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const { total, c } = layout(p)
  return [
    port('inlet', 'Firewater inlet', [-total / 2, c, 0], [-1, 0, 0], p.nps, p.rating),
    port('outlet', 'Deluge outlet', [total / 2, c, 0], [1, 0, 0], p.nps, p.rating),
  ]
}

export function DelugeValveSkid(props: DelugeValveSkidProps & GroupProps) {
  const { nps, rating, isolation, frame, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, isolation, frame, tag }
  const data = useKit((k) => build(k, p), [nps, rating, isolation, frame, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default DelugeValveSkid

function spool(k: Kit, nps: number, rating: Rating, x0: number, x1: number, c: number, studs: [boolean, boolean]) {
  const a = flange(k, nps, rating, [x0, c, 0], '-x', studs[0])
  const b = flange(k, nps, rating, [x1, c, 0], 'x', studs[1])
  pipe(k, [x0 + a, c, 0], [x1 - b, c, 0], nps, RED)
  weldBead(k, nps, [x0 + a, c, 0], 'x')
  weldBead(k, nps, [x1 - b, c, 0], 'x')
}

/** small-bore trim pipe */
const trim = (k: Kit, pts: V3[]) => k.tube('galvanised', pts, 0.0134, 8, 0.04)

function ballValve(k: Kit, p: V3) {
  k.box('brass', [0.05, 0.04, 0.04], p)
  k.cyl('stainless', 0.005, 0.03, [p[0], p[1] + 0.035, p[2]], 'y', 8)
  k.box(RED, [0.11, 0.008, 0.018], [p[0] + 0.045, p[1] + 0.052, p[2]])
}

function build(k: Kit, p: typeof defaults) {
  const { nps, rating, frame, tag } = p
  const { D, Ld, total, at, joints, hs, c } = layout(p)
  // end spools and the mid spool
  spool(k, nps, rating, at.in[0], at.in[1], c, [true, false])
  portBore(k, nps, rating, [at.in[0], c, 0], '-x')
  portBore(k, nps, rating, [at.out[1], c, 0], 'x')
  spool(k, nps, rating, at.mid[0], at.mid[1], c, [false, false])
  spool(k, nps, rating, at.out[0], at.out[1], c, [false, true])
  for (const x of joints) boltUp(k, nps, rating, [x, c, 0], 'x')
  if (p.isolation) for (const n of ['g1', 'g2']) k.at([(at[n][0] + at[n][1]) / 2, c, 0], undefined, () => osyGate(k, nps, rating))

  // deluge valve body: flanged ends, ductile-iron casting, bolted clapper cover on +Z
  const [xa, xb] = at.dv
  const xd = (xa + xb) / 2
  const fa = flange(k, nps, rating, [xa, c, 0], '-x')
  const fb = flange(k, nps, rating, [xb, c, 0], 'x')
  pipe(k, [xa + fa - 0.002, c, 0], [xb - fb + 0.002, c, 0], nps, RED)
  k.sphere(RED, 1, [xd, c, 0], [Math.max(D * 0.9, (xb - xa - fa - fb) * 0.6), D * 1.0, D * 0.92], 32)
  const zc0 = D * 0.9
  const rc = D * 0.6
  k.cyl(RED, rc * 0.92, zc0, [xd, c, zc0 / 2], 'z', 32)
  k.cyl(RED, rc, 0.03, [xd, c, zc0 + 0.015], 'z', 32)
  const zc = zc0 + 0.03
  k.around(8, rc * 0.82, [xd, c, zc], 'z', (q) => k.hex('nut', 0.026, 0.012, [q[0], q[1], q[2] + 0.006], 'z'), Math.PI / 8)
  k.cyl(RED, 0.04, D * 0.4, [xd, c + D * 1.05, 0], 'y', 16)
  k.hex('brass', 0.05, 0.02, [xd, c + D * 1.25 + 0.01, 0], 'y')
  k.plane(textMaterial(tag, '#e9eae6', '#111111', 512, 128), 0.16, 0.04, [xd, c + rc * 0.45, zc + 0.0015])
  k.plane(textMaterial('DELUGE', '#b1261d', '#ffffff', 512, 128), 0.16, 0.04, [xd, c - rc * 0.45, zc + 0.0015])

  // trim on the +Z side
  const zt = zc + 0.09
  const yP = c + Math.max(0.42, D * 1.2)
  const xs = xa + Ld * 0.18
  // priming line: body inlet side → ball valve → strainer → check valve → priming chamber (cover)
  k.cyl(RED, 0.022, D * 0.25, [xs, c + D * 0.3, D * 0.6], 'z', 12)
  trim(k, [[xs, c + D * 0.3, D * 0.7], [xs, c + D * 0.3, zt], [xs, yP, zt], [xd + 0.02, yP, zt], [xd + 0.02, c + rc * 0.62, zt], [xd + 0.02, c + rc * 0.62, zc]])
  ballValve(k, [xs, c + D * 0.3 + (yP - c - D * 0.3) * 0.5, zt])
  const xq = (xs + xd) / 2
  k.cyl('brass', 0.022, 0.07, [xq, yP, zt], 'x', 12)
  k.cyl('brass', 0.018, 0.06, [xq + 0.01, yP - 0.03, zt], [0.5, -1, 0], 12)
  k.hex('brass', 0.04, 0.05, [xd - 0.06, yP, zt], 'x')
  // restriction orifice union between strainer and check valve
  for (const dx of [-0.012, 0.012]) k.hex('brass', 0.036, 0.012, [(xq + xd - 0.06) / 2 + dx, yP, zt], 'x')
  k.rod('galvanised', [xs + 0.06, yP, zt], [xs + 0.06, yP + 0.09, zt], 0.007, 8)
  gauge(k, [xs + 0.06, yP + 0.13, zt], 'z', 0.1, 'bar', 25)
  k.rod('galvanised', [xd + 0.02, c + rc + 0.06, zt], [xd + 0.15, c + rc + 0.06, zt], 0.007, 8)
  gauge(k, [xd + 0.2, c + rc + 0.06, zt], 'z', 0.1, 'bar', 25)

  // release line: chamber → solenoid valve → manual release → tundish
  const yR = c - Math.max(0.3, D * 0.9)
  const xF = xd + Math.max(0.42, D * 2.2)
  const yF = hs + 0.32
  trim(k, [[xd, c - rc * 0.62, zc], [xd, c - rc * 0.62, zt], [xd, yR, zt], [xF, yR, zt], [xF, yF + 0.12, zt]])
  const xsol = xd + (xF - xd) * 0.4
  k.box('brass', [0.07, 0.05, 0.05], [xsol, yR, zt])
  k.cyl('castIron', 0.03, 0.08, [xsol, yR + 0.065, zt], 'y', 16)
  k.cyl('castIron', 0.034, 0.01, [xsol, yR + 0.11, zt], 'y', 16)
  k.hex('brass', 0.026, 0.02, [xsol + 0.04, yR + 0.07, zt], 'x')
  const xm = xd + (xF - xd) * 0.75
  k.rbox(RED, [0.1, 0.14, 0.07], 0.01, [xm, yR + 0.11, zt])
  k.rod('stainless', [xm, yR + 0.12, zt + 0.035], [xm, yR + 0.12, zt + 0.08], 0.006, 8)
  k.rod('stainless', [xm - 0.04, yR + 0.12, zt + 0.08], [xm + 0.04, yR + 0.12, zt + 0.08], 0.008, 8)
  k.plane(textMaterial('PULL', '#ffffff', '#b1261d', 256, 128), 0.06, 0.03, [xm, yR + 0.155, zt + 0.0355])
  // solenoid junction box on a stand, cable to the coil
  const jx = xF + 0.18
  k.rod('galvanised', [jx, hs, zt - 0.06], [jx, yR + 0.25, zt - 0.06], 0.02, 10)
  junctionBox(k, [jx, yR + 0.15, zt - 0.04], 'z', [0.16, 0.16, 0.1])
  cable(k, [[xsol + 0.05, yR + 0.07, zt], [xsol + 0.12, yR + 0.03, zt + 0.04], [jx - 0.03, yR + 0.0, zt + 0.02], [jx - 0.028, yR + 0.05, zt + 0.01]])

  // alarm line: outlet side boss → pressure switch
  const xo = xb - Ld * 0.18
  k.cyl(RED, 0.02, D * 0.25, [xo, c + D * 0.3, D * 0.6], 'z', 12)
  const yS = c + Math.max(0.3, D * 1.0)
  trim(k, [[xo, c + D * 0.3, D * 0.7], [xo, c + D * 0.3, zt - 0.03], [xo, yS, zt - 0.03]])
  k.rbox('stainless', [0.09, 0.12, 0.07], 0.01, [xo, yS + 0.06, zt - 0.03])
  // alarm test valve and automatic (ball-drip) drain on the alarm line
  ballValve(k, [xo, c + D * 0.3 + (yS - c - D * 0.3) * 0.45, zt - 0.03])
  k.cyl('brass', 0.014, 0.05, [xo + 0.03, c + D * 0.3 + 0.002, zt - 0.03], 'x', 10)
  k.cyl('brass', 0.008, 0.06, [xo + 0.055, c + D * 0.3 - 0.03, zt - 0.03], 'y', 8)
  k.cyl(RED, 0.02, 0.008, [xo, yS + 0.06, zt + 0.009], 'z', 16)
  k.hex('brass', 0.026, 0.018, [xo + 0.054, yS + 0.06, zt - 0.03], 'x')

  // system drain / test valve under the downstream spool
  const xm2 = (at.mid[0] + at.mid[1]) / 2
  k.cyl(RED, 0.02, 0.05, [xm2, c - D / 2 - 0.02, 0], 'y', 12)
  k.box('brass', [0.05, 0.045, 0.045], [xm2, c - D / 2 - 0.07, 0])
  k.box(RED, [0.008, 0.012, 0.12], [xm2, c - D / 2 - 0.07, 0.06])
  k.lathe('pipeBore', [[0.012, 0], [0.012, 0.03]], [xm2, c - D / 2 - 0.12, 0], 'y', 12)
  k.pipe('galvanised', [xm2, c - D / 2 - 0.0925, 0], [xm2, c - D / 2 - 0.15, 0], 0.033, 0.004)
  // main drain: bottom boss → angle valve → tundish; tundish to deck drain
  const yb = c - D * 0.98
  k.cyl(RED, 0.03, 0.05, [xd, yb - 0.02, 0], 'y', 14)
  k.sphere('brass', 0.04, [xd, yb - 0.08, 0], [1, 0.9, 1], 14)
  k.cyl('stainless', 0.006, 0.08, [xd, yb - 0.08, 0.06], 'z', 8)
  k.handwheel('handwheel', 0.12, [xd, yb - 0.08, 0.1], 'z', 4)
  pipe(k, [xd, yb - 0.11, 0], [xd, yF + 0.22, 0], 1.5, 'galvanised')
  k.bend('galvanised', [xd, yF + 0.22, 0], [0, -1, 0], [1, 0, 0], 0.06, pipeOD(1.5))
  pipe(k, [xd + 0.06, yF + 0.16, 0], [xF - 0.06, yF + 0.16, 0], 1.5, 'galvanised')
  k.bend('galvanised', [xF - 0.06, yF + 0.16, 0], [1, 0, 0], [0, 0, 1], 0.06, pipeOD(1.5))
  pipe(k, [xF, yF + 0.16, 0.06], [xF, yF + 0.16, zt * 0.5 - 0.04], 1.5, 'galvanised')
  k.lathe('galvanised', [[0.03, 0], [0.032, 0], [0.11, 0.14], [0.115, 0.14], [0.105, 0.135], [0.026, 0.004]], [xF, yF - 0.04, zt * 0.5 + 0.03], 'y', 28)
  pipe(k, [xF, hs, zt * 0.5 + 0.03], [xF, yF - 0.04, zt * 0.5 + 0.03], 2, 'galvanised')
  trim(k, [[xF, yF + 0.12, zt], [xF, yF + 0.12, zt * 0.5 + 0.09]])

  // skid (or deck base plates) and pipe supports with U-bolts
  if (frame) skid(k, total + 0.2, Math.max(0.9, zt * 2 + 0.25), 'UPN 160')
  for (const x of [(at.in[0] + at.in[1]) / 2, (at.out[0] + at.out[1]) / 2]) {
    const top = c - D / 2 - 0.012
    if (!frame) {
      k.box('structSteel', [0.24, 0.016, 0.24], [x, 0.008, 0])
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.03, 0.014, [x + sx * 0.085, 0.023, sz * 0.085], 'y')
    }
    member(k, [x, hs + (frame ? 0 : 0.016), 0], [x, top - 0.012, 0], 'SHS 100x100x6.3', 'structSteel')
    k.box('structSteel', [0.14, 0.012, D + 0.12], [x, top - 0.006, 0])
    const R = D / 2 + 0.006
    k.tube('galvanised', [[x, top, -R], [x, c + R, -R], [x, c + R, R], [x, top, R]], 0.006, 6, R)
    for (const s of [-1, 1]) k.hex('nut', 0.02, 0.012, [x, top - 0.018, s * R], 'y')
  }
  tagPlate(k, tag, [(at.in[0] + at.in[1]) / 2, hs + 0.25, 0.051], 'z', 0.09)
}
