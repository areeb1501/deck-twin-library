// Shared surface wellhead stack: conductor and landing plate, casing head, casing / tubing head spools with annulus outlets. API 6A.
import { eul, type Kit, type V3 } from '../lib/kit'
import { gauge } from '../lib/parts'
import type { Rating } from '../lib/standards'
import { apiFlange, apiGateLength, asmeEquivalent, type ApiFlange, type Psi } from './_api6a'
import { G, NUT, SPOOL, SS, STUD, at, crossover, crossoverLength, flangeAt, frame, gateValve, joint, needleValve, studded, tubing } from './_wellparts'

export const BASE_Y = 0.04 // landing plate on the deck

export interface WellheadOpts {
  psi: Psi
  /** casing head + spools height above the landing plate, m */
  height: number
  /** annulus outlets end in a crossover to an ASME flange (ports) instead of a blind */
  crossovers?: boolean
}

type Spool = { y0: number; y1: number; fb: ApiFlange | null; ft: ApiFlange; dirs: V3[] }

export interface Outlet {
  id: string
  /** outward unit direction */
  u: V3
  y: number
  R0: number
  /** port face (crossover end) */
  face: V3
  nps: number
  rating: Rating
}

export function wellheadLayout(o: WellheadOpts) {
  const psi = o.psi
  const F11 = apiFlange(11, psi)
  const F13 = apiFlange(13.625, psi >= 10000 ? 5000 : 3000)
  const F20 = apiFlange(20.75, 3000)
  const H = o.height
  const y0 = BASE_Y
  const T = y0 + H
  const X: V3 = [1, 0, 0]
  const D1: V3 = [Math.SQRT1_2, 0, -Math.SQRT1_2]
  const spools: Spool[] =
    H < 0.6
      ? [{ y0, y1: T, fb: null, ft: F11, dirs: [X, D1] }]
      : H <= 1.3
        ? [
            { y0, y1: y0 + 0.48 * H, fb: null, ft: F13, dirs: [D1] },
            { y0: y0 + 0.48 * H, y1: T, fb: F13, ft: F11, dirs: [X] },
          ]
        : [
            { y0, y1: y0 + 0.34 * H, fb: null, ft: F20, dirs: [D1] },
            { y0: y0 + 0.34 * H, y1: y0 + 0.67 * H, fb: F20, ft: F13, dirs: [D1] },
            { y0: y0 + 0.67 * H, y1: T, fb: F13, ft: F11, dirs: [X] },
          ]
  const ap: Psi = psi >= 10000 ? 10000 : 5000
  const dA = apiFlange(2.0625, ap)
  const LA = apiGateLength(2.0625, ap) * 0.8
  const kr = asmeEquivalent(ap)
  const Lx = crossoverLength(dA, 2, kr, 0.05)
  const outlets: (Outlet & { spool: number; j: number })[] = []
  const names = ['annulus-a', 'annulus-b', 'annulus-c', 'annulus-d']
  // numbered from the tubing head (A annulus) downwards
  for (let i = spools.length - 1; i >= 0; i--) {
    const sp = spools[i]
    const fbT = sp.fb ? sp.fb.t : 0.05
    const rb = Math.max(sp.ft.od, sp.fb?.od ?? 0) * 0.36
    const yb0 = sp.y0 + (sp.fb ? G : 0) + fbT
    const yb1 = sp.y1 - G - sp.ft.t
    const bodyH = yb1 - yb0
    if (bodyH < 0.1) continue
    sp.dirs.forEach((u, j) => {
      const y = sp.dirs.length > 1 ? yb0 + bodyH * (j === 0 ? 0.68 : 0.3) : (yb0 + yb1) / 2
      const R0 = rb + 0.05
      const d = R0 + LA + Lx
      outlets.push({ id: names[outlets.length] ?? `annulus-${outlets.length + 1}`, u, y, R0, face: [u[0] * d, y, u[2] * d], nps: 2, rating: kr, spool: i, j })
    })
  }
  return { F11, F13, F20, T, spools, dA, LA, kr, Lx, outlets }
}

/** Conductor stub, landing plate and the wellhead spools. Returns the layout. */
export function buildWellhead(k: Kit, o: WellheadOpts) {
  const W = wellheadLayout(o)
  const { spools, dA, LA } = W

  // conductor through the deck, landing plate with gussets and hold-down bolts
  k.cyl('equipmentPaintDark', 0.381, 0.5, [0, -0.25, 0], 'y', 40)
  k.cyl('equipmentPaintDark', 0.3, 0.02, [0, -0.49, 0], 'y', 32)
  k.box('structSteel', [1.0, BASE_Y, 1.0], [0, BASE_Y / 2, 0])
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    k.box('structSteel', [0.012, 0.1, 0.09], [Math.cos(a) * 0.43, BASE_Y + 0.05, Math.sin(a) * 0.43], eul(0, -a, 0))
  }
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    k.hex(NUT, 0.04, 0.025, [sx * 0.44, BASE_Y + 0.012, sz * 0.44])
    k.cyl(STUD, 0.011, 0.05, [sx * 0.44, BASE_Y + 0.02, sz * 0.44], 'y', 8)
  }

  spools.forEach((sp, i) => {
    const fbT = sp.fb ? sp.fb.t : 0.05
    const fbOd = sp.fb ? sp.fb.od : Math.max(sp.ft.od, 0.7)
    const rb = Math.max(sp.ft.od, sp.fb?.od ?? 0) * 0.36
    const g0 = sp.y0 + (sp.fb ? G : 0)
    const yb0 = g0 + fbT
    const yb1 = sp.y1 - G - sp.ft.t
    const ri = Math.min(rb * 0.55, 0.16)
    const fil = Math.min(0.03, Math.max(0.005, (yb1 - yb0) * 0.15))
    k.lathe(SPOOL, [[ri, g0], [fbOd / 2, g0], [fbOd / 2, yb0], [rb * 1.12, yb0], [rb, yb0 + fil], [rb, yb1 - fil], [rb * 1.12, yb1], [sp.ft.od / 2, yb1], [sp.ft.od / 2, sp.y1 - G], [ri, sp.y1 - G], [ri, g0]], [0, 0, 0], 'y', 48)
    if (sp.fb) {
      k.at([0, sp.y0, 0], undefined, () => joint(k, sp.fb!, 0))
      // secondary-seal test port in the lower flange
      k.hex('brass', 0.03, 0.02, [0, sp.y0 + G + fbT / 2, -(fbOd / 2 + 0.008)], 'z')
    } else k.boltCircle(STUD, NUT, 12, fbOd / 2 - 0.035, [0, BASE_Y - 0.01, 0], 'y', 0.022, fbT + 0.05, [fbT + 0.022])
    // hanger lockdown screws in the upper flange
    const yl = sp.y1 - G - sp.ft.t / 2
    k.around(8, sp.ft.od / 2, [0, yl, 0], 'y', (q) => {
      const r = Math.hypot(q[0], q[2])
      const n: V3 = [q[0] / r, 0, q[2] / r]
      k.hex('brass', 0.045, 0.03, [q[0] + n[0] * 0.012, yl, q[2] + n[2] * 0.012], n)
      k.rod(SS, [q[0] + n[0] * 0.02, yl, q[2] + n[2] * 0.02], [q[0] + n[0] * 0.055, yl, q[2] + n[2] * 0.055], 0.008, 8)
    }, Math.PI / 8)
    const bodyH = yb1 - yb0
    if (bodyH < 0.1) return
    sp.dirs.forEach((u, j) => {
      const y = sp.dirs.length > 1 ? yb0 + bodyH * (j === 0 ? 0.68 : 0.3) : (yb0 + yb1) / 2
      const padSize = Math.min(dA.od * 0.95, bodyH - 0.01, sp.dirs.length > 1 ? bodyH * 0.45 : 1)
      for (const s of [1, -1]) {
        const uu: V3 = [u[0] * s, 0, u[2] * s]
        const R0 = rb + 0.05
        const M = frame([uu[0] * R0, y, uu[2] * R0], uu, [0, 1, 0])
        k.rod(SPOOL, [uu[0] * rb * 0.8, y, uu[2] * rb * 0.8], [uu[0] * (R0 - 0.03), y, uu[2] * (R0 - 0.03)], Math.min(0.06, padSize * 0.4), 16)
        k.with(M, () => {
          k.box(SPOOL, [padSize, 0.035, padSize], [0, -0.0175, 0])
          studded(k, dA, 0)
        })
        if (s === 1) {
          k.with(M, () => {
            gateValve(k, dA, LA, { kind: 'handwheel', mat: 'actuatorYellow', D: 0.2 })
            joint(k, dA, LA)
            if (o.crossovers) k.at([0, LA, 0], undefined, () => crossover(k, dA, 2, W.kr, W.Lx))
            else {
              flangeAt(k, dA, LA, 1, 'flangeSteel')
              needleValve(k, [0, LA + G + dA.t, 0], 'y', 'actuatorYellow')
            }
          })
          if (!o.crossovers) gauge(k, at(M, [0, LA + G + dA.t + 0.16, 0]), uu, 0.1, 'bar', 100)
          else {
            // annulus pressure gauge on a needle valve on top of the gate valve body
            const q = at(M, [0, LA * 0.5, 0])
            k.rod(SS, [q[0], q[1] + 0.03, q[2]], [q[0], q[1] + 0.2, q[2]], 0.008, 8)
            gauge(k, [q[0], q[1] + 0.26, q[2]], [-uu[2], 0, uu[0]], 0.1, 'bar', 100)
          }
        } else {
          // VR-plugged outlet: blind flange with a needle valve
          k.with(M, () => {
            flangeAt(k, dA, 0, 1, 'flangeSteel')
            needleValve(k, [0, G + dA.t, 0], 'y', 'actuatorYellow')
          })
        }
      }
    })
    // tubing head: SCSSV control-line exit tubed down to the deck
    if (i === spools.length - 1) {
      const yc = yb0 + bodyH * 0.5
      k.hex(SS, 0.034, 0.025, [0, yc, rb + 0.01], 'z')
      k.box(SS, [0.04, 0.04, 0.05], [0, yc, rb + 0.06])
      k.box('actuatorRed', [0.012, 0.06, 0.012], [0.025, yc + 0.03, rb + 0.06])
      tubing(k, [[0, yc, rb + 0.08], [0, yc, 0.5], [0, BASE_Y + 0.03, 0.5], [-0.05, BASE_Y + 0.03, 0.56]])
      k.box(SS, [0.12, 0.08, 0.01], [-0.05, BASE_Y + 0.04, 0.565])
    }
  })
  return W
}
