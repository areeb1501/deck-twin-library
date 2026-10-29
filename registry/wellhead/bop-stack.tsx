// Surface BOP stack: casing head, single ram, drilling spool with choke / kill HCR lines, double ram, annular, handling frame and hoses. API 16A / API 53 / API 6A.
import type { Kit, V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, liftingLug, member, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { apiFlange, apiGateLength, asmeEquivalent, type Psi } from './_api6a'
import { G, NUT, SPOOL, SS, STUD, at, bore, boredBlock, ring, crossover, crossoverLength, flangeAt, frame, gateValve, joint, openFace, studded } from './_wellparts'

export interface BopStackProps {
  /** stack bore, inches (11, 13-5/8, 18-3/4, 21-1/4) */
  bore?: number
  pressureRating?: Psi
  /** handling / transport frame */
  handlingFrame?: boolean
  /** rams closed (operators retracted pistons extended) */
  closed?: boolean
  tag?: string
}

export const defaults = {
  bore: 13.625,
  pressureRating: 10000 as Psi,
  handlingFrame: true,
  closed: false,
  tag: 'BOP-100',
}

type P = typeof defaults

const RED = paint('#b3342a', { metalness: 0.3, roughness: 0.45, clearcoat: 0.4 })
const CHOKE_BORE = 3.0625
const KILL_BORE = 2.0625
const BASE_Y = 0.04

function layout(p: P) {
  const psi = p.pressureRating
  const dF = apiFlange(p.bore, psi)
  const f = (dF.bore / 13.625) ** 0.8 * (psi >= 15000 ? 1.12 : psi >= 10000 ? 1 : 0.88) // typical scale vs a 13-5/8" 10k stack
  const dC = apiFlange(CHOKE_BORE, psi)
  const dK = apiFlange(KILL_BORE, psi)
  const yA = BASE_Y + 0.6 * f
  const hs = 1.0 * f
  const hsp = Math.max(0.6, 2 * (G + dF.t) + Math.max(dC.od, 0.25) + 0.12)
  const hd = 1.7 * f
  const ha = 1.45 * f
  const yB = yA + hs
  const yC = yB + hsp
  const yD = yC + hd
  const yE = yD + ha
  const ySp = (yB + yC) / 2
  const Rsp = dF.od * 0.36
  const kr = asmeEquivalent(psi)
  const Lc = apiGateLength(dC.bore, psi)
  const Lk = apiGateLength(dK.bore, psi)
  const chokeEnd = Rsp + 0.08 + 2 * Lc + crossoverLength(dC, 3, kr)
  const killEnd = Rsp + 0.08 + 2 * Lk + crossoverLength(dK, 2, kr)
  const bl = dF.od * 1.3 // ram body length along X
  const bonnet = 0.5 * f
  const op = 0.42 * f
  const xR = bl / 2 + bonnet + op + 0.12 * f // ram operator end
  return { psi, dF, f, dC, dK, yA, yB, yC, yD, yE, hs, hsp, hd, ha, ySp, Rsp, kr, Lc, Lk, chokeEnd, killEnd, bl, bonnet, op, xR }
}

export function ports(props: BopStackProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const L = layout(p)
  return [port('choke', 'Choke line', [0, L.ySp, L.chokeEnd], [0, 0, 1], 3, L.kr), port('kill', 'Kill line', [0, L.ySp, -L.killEnd], [0, 0, -1], 2, L.kr)]
}

export function BopStack(props: BopStackProps & GroupProps) {
  const { bore, pressureRating, handlingFrame, closed, tag, ...group } = { ...defaults, ...props }
  const p = { bore, pressureRating, handlingFrame, closed, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default BopStack

/** Ram preventer between faces y0 and y1 with `n` ram cavities; bonnets and operators along ±X. Returns hose port points. */
function ramBop(k: Kit, L: ReturnType<typeof layout>, y0: number, y1: number, n: 1 | 2, closed: boolean): V3[] {
  const { dF, f, bl, bonnet, op } = L
  k.at([0, y0, 0], undefined, () => flangeAt(k, dF, 0, 1, RED))
  k.at([0, y1, 0], undefined, () => flangeAt(k, dF, 0, -1, RED))
  const b0 = y0 + G + dF.t
  const b1 = y1 - G - dF.t
  const bd = dF.od * 1.02
  const rb = dF.bore * 0.0127
  boredBlock(k, RED, [bl, b1 - b0 + 0.02, bd], rb, [0, (b0 + b1) / 2, 0], 0.03 * f)
  const hosePts: V3[] = []
  for (let i = 0; i < n; i++) {
    const yr = b0 + ((b1 - b0) * (i + 0.5)) / n
    const hb = Math.min((b1 - b0) / n - 0.06, 0.5 * f)
    for (const s of [-1, 1]) {
      const x0 = s * (bl / 2)
      // bonnet flange plate with bolts, bonnet body
      k.rbox(RED, [0.06 * f, hb * 1.05, bd * 0.9], 0.015, [x0 + s * 0.03 * f, yr, 0])
      for (const dy of [-1, 1]) for (const dz of [-0.36, -0.12, 0.12, 0.36]) k.hex(NUT, 0.06 * f, 0.03 * f, [x0 + s * 0.075 * f, yr + dy * hb * 0.42, dz * bd], 'x')
      k.rbox(RED, [bonnet - 0.06 * f, hb * 0.86, bd * 0.7], 0.04 * f, [x0 + s * (0.06 * f + (bonnet - 0.06 * f) / 2), yr, 0])
      // operating cylinder with end cap and tie rods
      const xc0 = x0 + s * bonnet
      const ro = Math.min(hb * 0.42, 0.26 * f)
      k.cyl(RED, ro, op, [xc0 + (s * op) / 2, yr, 0], 'x', 32)
      k.cyl(RED, ro * 1.08, 0.05 * f, [xc0 + s * (op - 0.025 * f), yr, 0], 'x', 32)
      k.around(6, ro * 1.02, [0, yr, 0], 'x', (q) => k.hex(NUT, 0.045 * f, 0.03 * f, [xc0 + s * (op + 0.01), q[1], q[2]], 'x'))
      // manual ram lock (locking screw) or tail rod, longer when the rams are open
      const lock = (closed ? 0.08 : 0.2) * f
      k.cyl(SS, 0.035 * f, lock + 0.06, [xc0 + s * (op + (lock + 0.06) / 2), yr, 0], 'x', 12)
      k.hex(NUT, 0.1 * f, 0.05 * f, [xc0 + s * (op + lock + 0.06), yr, 0], 'x')
      // open / close hydraulic ports on top of the bonnet
      for (const dx of [0.15, 0.35]) {
        const pp: V3 = [x0 + s * dx * bonnet * 2, yr + hb * 0.43, 0]
        k.cyl('brass', 0.02, 0.06, [pp[0], pp[1] + 0.03, pp[2]], 'y', 10)
        hosePts.push([pp[0], pp[1] + 0.06, pp[2]])
      }
    }
  }
  // body side outlets (blanked) and nameplate
  k.box('nameplate', [0.3 * f, 0.18 * f, 0.004], [0, (b0 + b1) / 2, bd / 2 + 0.002])
  return hosePts
}

function build(k: Kit, p: P) {
  const L = layout(p)
  const { dF, f, dC, dK, yA, yB, yC, yD, yE, ySp, Rsp } = L

  // conductor through the deck, landing plate
  k.cyl('equipmentPaintDark', 0.381, 0.4, [0, -0.2, 0], 'y', 40)
  k.box('structSteel', [1.3 * f, BASE_Y, 1.3 * f], [0, BASE_Y / 2, 0])
  // casing head with two annulus outlets (studded, gate valve)
  const rb = dF.od * 0.36
  k.lathe(SPOOL, [[dF.bore * 0.0127, BASE_Y], [dF.od * 0.55, BASE_Y], [dF.od * 0.55, BASE_Y + 0.06], [rb, BASE_Y + 0.08], [rb, yA - G - dF.t], [dF.od / 2, yA - G - dF.t], [dF.od / 2, yA - G], [dF.bore * 0.0127, yA - G], [dF.bore * 0.0127, BASE_Y]], [0, 0, 0], 'y', 48)
  k.boltCircle(STUD, NUT, 12, dF.od * 0.5, [0, BASE_Y - 0.01, 0], 'y', 0.025, 0.1, [0.075])
  const dA = apiFlange(2.0625, L.psi)
  const yo = (BASE_Y + yA - dF.t) / 2
  for (const s of [-1, 1]) {
    const M = frame([s * (rb + 0.04), yo, 0], [s, 0, 0], [0, 1, 0])
    k.rod(SPOOL, [s * rb * 0.8, yo, 0], [s * (rb + 0.01), yo, 0], 0.06, 16)
    k.with(M, () => {
      k.box(SPOOL, [dA.od * 0.9, 0.04, dA.od * 0.9], [0, -0.02, 0])
      studded(k, dA, 0)
      gateValve(k, dA, apiGateLength(2.0625, L.psi) * 0.8, { kind: 'handwheel', D: 0.22, mat: 'actuatorYellow' })
      flangeAt(k, dA, apiGateLength(2.0625, L.psi) * 0.8, 1, 'flangeSteel')
    })
  }

  // stack joints and bodies
  for (const y of [yA, yB, yC, yD]) k.at([0, y, 0], undefined, () => joint(k, dF, 0))
  const hoses: V3[][] = []
  hoses.push(ramBop(k, L, yA, yB, 1, p.closed))
  // drilling spool with choke (+Z) and kill (-Z) outlets
  k.at([0, yB, 0], undefined, () => flangeAt(k, dF, 0, 1, SPOOL))
  k.at([0, yC, 0], undefined, () => flangeAt(k, dF, 0, -1, SPOOL))
  k.lathe(SPOOL, [[dF.bore * 0.0127, yB + G + dF.t - 0.005], [Rsp, yB + G + dF.t - 0.005], [Rsp, yC - G - dF.t + 0.005], [dF.bore * 0.0127, yC - G - dF.t + 0.005]], [0, 0, 0], 'y', 40)
  // bore liner through the whole stack
  bore(k, dF.bore * 0.0127, BASE_Y, yE - G)
  const hcr: V3[] = []
  for (const [s, d, Lv, end, nps] of [[1, dC, L.Lc, L.chokeEnd, 3], [-1, dK, L.Lk, L.killEnd, 2]] as const) {
    const z0 = s * (Rsp + 0.08)
    k.at([0, ySp, 0], s > 0 ? 'z' : '-z', () => {
      ring(k, SPOOL, d.od * 0.3, d.bore * 0.0127, Rsp * 0.9, Math.abs(z0) - 0.04, 20)
      boredBlock(k, SPOOL, [d.od * 0.95, 0.05, d.od * 0.95], d.bore * 0.0127, [0, Math.abs(z0) - 0.025, 0], 0.01)
    })
    // the main bore seen down the outlet
    k.disc('pipeBore', d.bore * 0.0127 + 0.002, [0, ySp, s * (Rsp + 0.002)], s > 0 ? 'z' : '-z', 24)
    const M = frame([0, ySp, z0], [0, 0, s], [0, 1, 0])
    let hp: V3 | null = null
    k.with(M, () => {
      studded(k, d, 0)
      gateValve(k, d, Lv, { kind: 'handwheel', D: 0.3 })
      joint(k, d, Lv)
      k.at([0, Lv, 0], undefined, () => {
        hp = gateValve(k, d, Lv, { kind: 'hydraulic', r: 0.1 * f + 0.02, len: 0.28 * f }, 'valveBody')
      })
      joint(k, d, 2 * Lv)
    })
    k.with(frame([0, ySp, z0 + s * 2 * Lv], [0, 0, s], [1, 0, 0]), () => crossover(k, d, nps, L.kr, end - Math.abs(z0) - 2 * Lv))
    if (hp) hcr.push(at(M, [hp[0], hp[1] + Lv, hp[2]]))
    // valves on the outlet sit on a pipe stand
    const ys = ySp - d.od / 2
    const zs = s * (Math.abs(z0) + Lv * 1.5)
    k.pipe('structSteel', [0, BASE_Y + 0.015, zs], [0, ys - 0.012, zs], 0.114, 0.006, 16)
    k.box('structSteel', [0.25, 0.015, 0.25], [0, BASE_Y / 2 + 0.0075, zs])
    k.box('structSteel', [d.od * 0.7, 0.012, 0.12], [0, ys - 0.006, zs])
  }
  hoses.push(ramBop(k, L, yC, yD, 2, p.closed))

  // annular preventer: bottom flange, body, latched head, spherical cap, studded top
  {
    const Ra = dF.od * 0.98
    const y0 = yD + G
    const yt = yE - G - dF.t * 0.6
    k.lathe(RED, [
      [dF.bore * 0.0127, y0],
      [dF.od / 2, y0],
      [dF.od / 2, y0 + dF.t],
      [Ra * 0.85, y0 + dF.t + 0.03],
      [Ra, y0 + dF.t + 0.12 * L.f],
      [Ra, y0 + L.ha * 0.48],
      [Ra * 1.04, y0 + L.ha * 0.5],
      [Ra * 1.04, y0 + L.ha * 0.56],
      [Ra * 0.98, y0 + L.ha * 0.58],
      [Ra * 0.9, y0 + L.ha * 0.7],
      [Ra * 0.72, y0 + L.ha * 0.82],
      [Ra * 0.5, yt - 0.04],
      [dF.od * 0.42, yt],
      [dF.bore * 0.0127, yt],
    ], [0, 0, 0], 'y', 64)
    // head latch screws round the body joint
    k.around(16, Ra * 1.04, [0, y0 + L.ha * 0.53, 0], 'y', (q) => k.hex(NUT, 0.06 * L.f, 0.04 * L.f, q, [q[0], 0, q[2]]))
    // studded top with ring groove and studs
    k.lathe(RED, [[dF.bore * 0.0127, yt - 0.01], [dF.od * 0.42, yt - 0.01], [dF.od * 0.42, yt + dF.t * 0.6], [dF.bore * 0.0127, yt + dF.t * 0.6]], [0, 0, 0], 'y', 40)
    k.at([0, yE, 0], undefined, () => openFace(k, { ...dF, t: dF.t * 0.6 }))
    // open / close ports
    for (const dy of [0.25, 0.4]) {
      const y = y0 + L.ha * dy
      k.cyl('brass', 0.025, 0.08, [Ra + 0.03, y, 0], 'x', 10)
      hoses.push([[Ra + 0.07, y, 0]])
    }
    for (const a of [0, Math.PI]) liftingLug(k, [Math.cos(a) * Ra * 0.6, y0 + L.ha * 0.78, Math.sin(a) * Ra * 0.6], 'z', 1.4 * L.f, RED)
  }
  tagPlate(k, p.tag, [0, yE - L.ha * 0.6, dF.od * 0.98 * 0.99], 'z', 0.25)
  gauge(k, [0.25, ySp + 0.3, Rsp + 0.08], 'z', 0.12, 'bar', L.psi >= 10000 ? 1000 : 400)
  k.rod(SS, [0.25, ySp + 0.1, Rsp], [0.25, ySp + 0.3, Rsp + 0.04], 0.008, 8)

  // handling frame: four columns, top and mid frames, padeyes; hose junction plate on a column
  const hx = L.xR + 0.25
  const hz = Math.max(dF.od * 0.75 + 0.35, 0.9)
  const yTop = yE + 0.25
  const hoseHub: V3 = [-hx + 0.15, yC, -hz + 0.15]
  if (p.handlingFrame) {
    const sec = 'HEB 200'
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        member(k, [sx * hx, 0, sz * hz], [sx * hx, yTop, sz * hz], sec, 'safetyYellow')
        k.box('safetyYellow', [0.35, 0.025, 0.35], [sx * hx, 0.0125, sz * hz])
      }
    for (const y of [0.25, yTop - 0.1]) {
      for (const sz of [-1, 1]) member(k, [-hx, y, sz * hz], [hx, y, sz * hz], sec, 'safetyYellow')
      for (const sx of [-1, 1]) member(k, [sx * hx, y, -hz], [sx * hx, y, hz], sec, 'safetyYellow')
    }
    // diagonal braces on the X faces
    for (const sx of [-1, 1]) member(k, [sx * hx, 0.35, -hz + 0.1], [sx * hx, yTop * 0.55, hz - 0.1], 'SHS 100x100x6.3', 'safetyYellow')
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sx * (hx - 0.05), yTop, sz * (hz - 0.05)], 'x', 2.2, 'safetyYellow')
  } else {
    // free-standing hose stand when there is no frame
    member(k, [hoseHub[0] - 0.16, 0, hoseHub[2] + 0.2], [hoseHub[0] - 0.16, hoseHub[1] + 0.45, hoseHub[2] + 0.2], 'SHS 100x100x6.3', 'safetyYellow')
    k.box('safetyYellow', [0.35, 0.02, 0.35], [hoseHub[0] - 0.16, 0.01, hoseHub[2] + 0.2])
  }
  // hose junction plate with bulkhead fittings
  k.box(SS, [0.04, 0.9, 0.5], [hoseHub[0] - 0.12, hoseHub[1], hoseHub[2] + 0.2])
  for (let j = 0; j < 11; j++) k.hex('brass', 0.035, 0.03, [hoseHub[0] - 0.09, hoseHub[1] - 0.35 + j * 0.07, hoseHub[2] + 0.2], 'x')
  // hydraulic hoses from the junction plate to every function
  const src = (i: number): V3 => [hoseHub[0] - 0.1, hoseHub[1] - 0.35 + i * 0.07, hoseHub[2] + 0.2]
  let i = 0
  for (const group of hoses)
    for (const q of group) {
      const a = src(i % 11)
      const mid: V3 = [(a[0] + q[0]) / 2, Math.max(a[1], q[1]) + 0.25, (a[2] + q[2]) / 2 - 0.3]
      k.spline('rubberBlack', [a, [a[0] + 0.2, a[1], a[2]], mid, [q[0], q[1] + 0.2, q[2]], q], 0.017, 6, 28)
      i++
    }
  for (const q of hcr) {
    const a = src(i % 11)
    k.spline('rubberBlack', [a, [a[0] + 0.2, a[1], a[2]], [q[0] * 0.5, q[1] + 0.4, q[2]], q], 0.017, 6, 28)
    i++
  }
}

