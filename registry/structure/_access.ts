// Shared access steel after ISO 14122-3/-4: stair flights with channel stringers and grating treads, landings, caged ladders with rest platforms.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { ACCESS, stairFlight } from '../lib/standards'
import { anchorBolt, bar, beamTOS, bolt, boxMM, column, gratingBay, railRun, sec, strip } from './_steel'

export interface FlightOpts {
  /** clear width between stringers, m */
  width: number
  angle: number
  stringer?: string
  mat?: MatKey
  railLeft?: boolean
  railRight?: boolean
  /** base cleats with anchor bolts at the foot */
  footCleats?: boolean
}

/** One straight flight: foot (first riser) at (x0, y0), centred on z = zc, climbing +X by `rise`. Upper floor edge at x0 + run. */
export function flight(k: Kit, x0: number, y0: number, zc: number, rise: number, o: FlightOpts) {
  const f = stairFlight(rise, o.angle)
  const { steps, riser: r, going: g, run } = f
  const mat = o.mat ?? 'galvanised'
  const s = sec(o.stringer ?? 'UPN 200')
  const w = o.width
  if (steps < 2) return f
  const tan = r / g
  const cos = Math.cos(Math.atan(tan))
  const yN = (x: number) => y0 + r + (x - x0) * tan
  const yT = (x: number) => yN(x) + 0.04
  const dv = s.d / cos
  const top = y0 + rise
  const xF = x0 + (y0 - yT(x0)) / tan // back of foot, top edge on the floor
  const xB = x0 + (y0 - yT(x0) + dv) / tan // front of foot, bottom edge on the floor
  const xE = x0 + run
  const xT = x0 + (top - yT(x0)) / tan
  // stringers: channel web as a plumb/level-cut plate, flanges along the slope, toes outward
  for (const side of [-1, 1]) {
    const zIn = zc + side * (w / 2)
    const sh = new THREE.Shape()
    sh.moveTo(xF, y0).lineTo(xB, y0).lineTo(xE, yT(xE) - dv).lineTo(xE, top).lineTo(xT, top).closePath()
    const z0 = side < 0 ? zIn - s.tw : zIn
    k.extrude(mat, sh, s.tw, new THREE.Matrix4().makeTranslation(0, 0, z0), 1)
    const zf = zIn + side * (s.b / 2)
    const dt = s.tf / 2 / cos
    strip(k, mat, [xF, y0 - dt, zf], [xT, top - dt, zf], s.b, s.tf)
    strip(k, mat, [xB, y0 + dt, zf], [xE, yT(xE) - dv + dt, zf], s.b, s.tf)
    if (o.footCleats ?? true) {
      boxMM(k, mat, [xF - 0.02, y0, zf - s.b / 2 - 0.03], [xB + 0.02, y0 + 0.015, zf + s.b / 2 + 0.03])
      anchorBolt(k, xF + 0.04, y0 + 0.015, zf + side * 0.02, 0.016)
      anchorBolt(k, xB - 0.04, y0 + 0.015, zf + side * 0.02, 0.016)
    }
  }
  // treads: grating with chequer nosing and bolted end plates
  for (let i = 1; i <= steps - 1; i++) {
    const yk = y0 + i * r
    const xa = x0 + (i - 1) * g
    const xb = Math.min(x0 + i * g + 0.02, xE)
    gratingBay(k, xa, zc - w / 2 + 0.008, xb, zc + w / 2 - 0.008, yk, 'z', 0.03, false)
    k.box('safetyYellow', [0.035, 0.034, w - 0.016], [xa + 0.0175, yk - 0.015, zc])
    for (const side of [-1, 1]) {
      const z = zc + side * (w / 2 - 0.004)
      k.box(mat, [xb - xa, 0.06, 0.008], [(xa + xb) / 2, yk - 0.03, z])
      bolt(k, [(xa + xb) / 2, yk - 0.03, zc + side * (w / 2 + s.tw / 2)], [0, 0, 1], 0.012, s.tw + 0.008)
    }
  }
  // handrails each side on the stringer top flange: 1.0 m above the nosing line
  for (const side of [-1, 1]) {
    if ((side < 0 && o.railLeft === false) || (side > 0 && o.railRight === false)) continue
    const z = zc + side * (w / 2 + s.b / 2)
    railRun(k, [x0, yN(x0), z], [xE, yN(xE), z], { top: 1.0, toe: false, basePlates: false })
  }
  return f
}

/** Horizontal length of a straight stair of total `rise` with landings every ≤ 3 m (top landing excluded). */
export function stairLength(rise: number, angle: number, landingLength = 1.0) {
  const n = Math.max(1, Math.ceil(rise / ACCESS.stair.landingEvery - 1e-6))
  return n * stairFlight(rise / n, angle).run + (n - 1) * Math.max(0.8, landingLength)
}

/** Straight stair from (0, 0) climbing +X, centred on z = 0: flights with intermediate landings on posts, optional top landing. */
export function stairRun(k: Kit, rise: number, o: FlightOpts & { landingLength?: number; topLanding?: boolean }) {
  const n = Math.max(1, Math.ceil(rise / ACCESS.stair.landingEvery - 1e-6))
  const h = rise / n
  const Ll = Math.max(0.8, o.landingLength ?? 1.0)
  const sb = sec(o.stringer ?? 'UPN 200').b
  const mat = o.mat ?? 'galvanised'
  let x = 0
  for (let i = 0; i < n; i++) {
    x += flight(k, x, i * h, 0, h, { ...o, footCleats: i === 0 }).run
    const last = i === n - 1
    if (!last || o.topLanding) {
      landing(k, x, x + Ll, -o.width / 2 - sb, o.width / 2 + sb, (i + 1) * h, { rails: [false, last, true, true], post: 'SHS 100x100x6.3', mat, flightAtX1: !last })
      x += Ll
    }
  }
  return x
}

export interface LandingOpts {
  /** guard rails on each edge: x-min, x-max, z-min, z-max */
  rails?: [boolean, boolean, boolean, boolean]
  /** post section down to y = 0, or '' for none (landing carried by other steel) */
  post?: string
  frame?: string
  mat?: MatKey
  /** a flight starts at the x1 edge (its rail posts replace the landing's end posts) */
  flightAtX1?: boolean
}

/** Rectangular landing / platform deck: grating top at y over x0..x1, z0..z1, channel frame, optional posts with base plates. */
export function landing(k: Kit, x0: number, x1: number, z0: number, z1: number, y: number, o: LandingOpts = {}) {
  const mat = o.mat ?? 'galvanised'
  const fr = o.frame ?? 'UPN 160'
  const f = sec(fr)
  const tos = y - 0.03
  gratingBay(k, x0, z0, x1, z1, y, (x1 - x0) > (z1 - z0) ? 'z' : 'x')
  const e = f.b / 2
  beamTOS(k, x0, z0 + e, x1, z0 + e, tos, fr, mat)
  beamTOS(k, x0, z1 - e, x1, z1 - e, tos, fr, mat)
  beamTOS(k, x0 + e, z0 + f.b, x0 + e, z1 - f.b, tos, fr, mat)
  beamTOS(k, x1 - e, z0 + f.b, x1 - e, z1 - f.b, tos, fr, mat)
  const nMid = Math.floor((x1 - x0) / 1.2)
  for (let i = 1; i <= nMid; i++) {
    const x = x0 + ((x1 - x0) * i) / (nMid + 1)
    beamTOS(k, x, z0 + f.b, x, z1 - f.b, tos, 'L60x60x6', mat)
  }
  if (o.post) {
    const p = sec(o.post)
    const yb = tos - f.d
    const corners: [number, number][] = [[x0 + p.b / 2, z0 + p.b / 2], [x1 - p.b / 2, z0 + p.b / 2], [x0 + p.b / 2, z1 - p.b / 2], [x1 - p.b / 2, z1 - p.b / 2]]
    for (const [x, z] of corners) {
      const t = postBase(k, x, z, p.b, mat)
      column(k, x, z, t, yb, o.post, mat)
    }
    if (yb > 2.2) {
      // X bracing on the two z faces, single diagonals on the x faces
      for (const z of [z0 + p.b / 2, z1 - p.b / 2]) {
        bar(k, [x0 + p.b, 0.3, z], [x1 - p.b, yb - 0.15, z], 'L60x60x6', mat, [0, 0, 1])
        bar(k, [x1 - p.b, 0.3, z], [x0 + p.b, yb - 0.15, z], 'L60x60x6', mat, [0, 0, 1])
      }
      for (const x of [x0 + p.b / 2, x1 - p.b / 2]) bar(k, [x, 0.3, z0 + p.b], [x, yb - 0.15, z1 - p.b], 'L60x60x6', mat, [1, 0, 0])
    }
  }
  const [rx0, rx1, rz0, rz1] = o.rails ?? [true, true, true, true]
  const i = 0.03
  // an open x end continues into a stair flight whose rail already has a post there
  if (rz0) railRun(k, [x0 + i, y, z0 + i], [x1 - i, y, z0 + i], { startPost: rx0, endPost: rx1 || !o.flightAtX1 })
  if (rz1) railRun(k, [x0 + i, y, z1 - i], [x1 - i, y, z1 - i], { startPost: rx0, endPost: rx1 || !o.flightAtX1 })
  if (rx0) railRun(k, [x0 + i, y, z0 + i], [x0 + i, y, z1 - i], { startPost: !rz0, endPost: !rz1 })
  if (rx1) railRun(k, [x1 - i, y, z0 + i], [x1 - i, y, z1 - i], { startPost: !rz0, endPost: !rz1 })
}

/** Small base plate with four anchors for a post of flange width b at y = 0. Returns plate top. */
export function postBase(k: Kit, x: number, z: number, b: number, mat: MatKey = 'galvanised') {
  const s = b + 0.12
  k.box(mat, [s, 0.02, s], [x, 0.01, z])
  for (const a of [-1, 1]) for (const c of [-1, 1]) anchorBolt(k, x + a * (s / 2 - 0.035), 0.02, z + c * (s / 2 - 0.035), 0.016)
  return 0.02
}

export interface LadderOpts {
  mat?: MatKey
  /** first hoop above the foot (ISO 14122-4: 2.2–3.0 m) */
  cageFrom?: number
  /** stile extension above the top rung */
  extend?: number
  cage?: boolean
  /** wall brackets back to z = -standoff every ~2 m */
  standoff?: number
}

/**
 * Fixed ladder in the x-y plane at z = zr (rungs), foot at (x, y0), top rung at y1. The climber and cage are on +Z;
 * the structure is at z = zr - standoff. 65×12 flat-bar stiles at 450 mm, Ø25 rungs at 300 mm, cage Ø720 with 5 bars.
 */
export function ladderFlight(k: Kit, x: number, y0: number, y1: number, zr: number, o: LadderOpts = {}) {
  const mat = o.mat ?? 'galvanised'
  const half = ACCESS.ladder.width / 2
  const ext = o.extend ?? 1.1
  const yTop = y1 + ext
  for (const s of [-1, 1]) k.box(mat, [0.012, yTop - y0, 0.065], [x + s * half, (y0 + yTop) / 2, zr])
  const n = Math.max(1, Math.round((y1 - y0) / ACCESS.ladder.rungPitch))
  const pitch = (y1 - y0) / n
  for (let i = 1; i <= n; i++) k.rod(mat, [x - half, y0 + i * pitch, zr], [x + half, y0 + i * pitch, zr], 0.0125, 8)
  // stile ends turned back as grab handles
  for (const s of [-1, 1]) k.box(mat, [0.012, 0.065, (o.standoff ?? 0.2) + 0.03], [x + s * half, yTop - 0.03, zr - (o.standoff ?? 0.2) / 2])
  if (o.standoff) {
    for (let y = y0 + 0.6; y < y1; y += 2.0)
      for (const s of [-1, 1]) {
        k.box(mat, [0.08, 0.008, o.standoff], [x + s * half, y, zr - o.standoff / 2 - 0.032])
        k.box(mat, [0.08, 0.1, 0.008], [x + s * half, y, zr - o.standoff - 0.032])
      }
  }
  const cageFrom = o.cageFrom ?? ACCESS.ladder.cageStart
  if (o.cage === false || yTop - y0 < cageFrom + 0.6) return
  const R = ACCESS.ladder.cageDia / 2 + 0.01
  const cz = zr + R
  const pts: V3[] = [[x - half, 0, zr]]
  const N = 10
  for (let i = 0; i <= N; i++) {
    const a = Math.PI + (i / N) * Math.PI
    pts.push([x + Math.cos(a) * R, 0, cz - Math.sin(a) * R])
  }
  pts.push([x + half, 0, zr])
  const hoops: number[] = []
  for (let y = y0 + cageFrom; y < yTop - 0.2; y += Math.min(ACCESS.ladder.hoopSpacing, 1.5)) hoops.push(y)
  hoops.push(yTop - 0.05)
  for (const y of hoops)
    for (let i = 0; i < pts.length - 1; i++) strip(k, mat, [pts[i][0], y, pts[i][2]], [pts[i + 1][0], y, pts[i + 1][2]], 0.008, 0.05)
  for (let j = 1; j <= 5; j++) {
    const a = Math.PI + (j / 6) * Math.PI
    const px = x + Math.cos(a) * (R - 0.012)
    const pz = cz - Math.sin(a) * (R - 0.012)
    strip(k, mat, [px, y0 + cageFrom, pz], [px, yTop - 0.05, pz], 0.05, 0.008, [px - x, 0, pz - cz])
  }
}

/**
 * Caged ladder from y0 up to a landing at y1, rungs in the plane z = zr, climber on +Z, structure face at z = zr - standoff.
 * Climbs over 10 m are split into staggered flights of ≤ ACCESS.ladder.maxFlight, 0.9 m apart, with bracketed rest platforms.
 * The top flight is centred on x. Returns the x extent [min, max] of the ladder steel.
 */
export function ladderRun(k: Kit, x: number, y0: number, y1: number, zr: number, o: LadderOpts = {}): [number, number] {
  const H = y1 - y0
  // single flight up to 10 m of climb, otherwise flights of at most 6 m (EN ISO 14122-4)
  const n = H <= 10 ? 1 : Math.max(2, Math.ceil(H / ACCESS.ladder.maxFlight - 1e-6))
  const h = H / n
  const off = 0.9
  const so = o.standoff ?? 0.2
  const mat = o.mat ?? 'galvanised'
  let lo = x - 0.4
  const hi = x + 0.4
  for (let i = 0; i < n; i++) {
    const xi = x - ((n - 1 - i) % 2) * off
    lo = Math.min(lo, xi - 0.4)
    const fy0 = y0 + i * h
    ladderFlight(k, xi, fy0, fy0 + h, zr, { ...o, standoff: so, cageFrom: i === 0 ? o.cageFrom : 1.2 })
    if (i === n - 1) break
    // rest platform under the next flight, open towards the flight below
    const xn = x - ((n - 2 - i) % 2) * off
    const dir = xn > xi ? 1 : -1
    const xa = xn - 0.45 * dir
    const xb = xn + 0.45 * dir
    const za = zr - so
    const zb = zr + 0.78
    const y = fy0 + h
    gratingBay(k, Math.min(xa, xb), za, Math.max(xa, xb), zb, y, 'z')
    for (const xx of [xa, xb]) {
      beamTOS(k, xx - dir * 0.04, za, xx - dir * 0.04, zb, y - 0.03, 'UPN 100', mat)
      bar(k, [xx - dir * 0.04, y - 0.75, za], [xx - dir * 0.04, y - 0.12, zb - 0.1], 'L60x60x6', mat, [1, 0, 0])
      k.box(mat, [0.12, 0.25, 0.012], [xx - dir * 0.04, y - 0.12, za - 0.006])
    }
    beamTOS(k, xa, zb - 0.04, xb, zb - 0.04, y - 0.03, 'UPN 100', mat)
    railRun(k, [xa, y, zb - 0.03], [xb - dir * 0.03, y, zb - 0.03])
    railRun(k, [xb - dir * 0.03, y, za + 0.03], [xb - dir * 0.03, y, zb - 0.03], { endPost: false })
  }
  return [lo, hi]
}
