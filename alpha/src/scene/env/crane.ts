/**
 * Offshore pedestal crane (diesel-hydraulic, lattice boom) on the Alpha weather deck, WORLD coordinates.
 * Modelled on fixed-platform pedestal cranes (Liebherr BOS / NOV / TTS class), parked with the boom
 * lowered onto a boom rest:
 *  - pedestal on the jacket leg: stiffened base can with gussets on a deck doubler, conical step to the
 *    upper shaft, flared top cone + flange; caged access ladders with a rest platform, ring platform
 *    with guard rail under the slew bearing, pedestal door
 *  - slew bearing (external gear ring, bolt circle) + turntable, two slew drives (pinion, gearbox, motor)
 *  - slewing platform: machinery house (louvres, doors, cooler, exhaust silencer + stack), open rear
 *    winch bay with main + auxiliary hoist winches, striped counterweight, east walkway + rails,
 *    walkway-to-ring-platform ladder
 *  - operator cab beside the boom foot: glazed front / side / roof, wipers, sun visor, door, A/C unit
 *  - A-frame gantry with crosshead, hoist lead sheaves, upper luffing block, multi-fall luffing tackle to
 *    a floating spreader block and pendants to the boom tip, luffing winch on the house roof
 *  - lattice boom: 4 tubular chords, Warren lacing on all faces, tapered foot and tip sections, foot pins
 *    in lugs, rope guide sheaves, boom angle indicator, boom-tip head with main sheaves, auxiliary whip
 *    jib, anemometer + aviation light; black/yellow hazard striping on the head and counterweight
 *  - main hook block (4 falls) lowered onto a hook pad and lashed to a padeye; whip line + headache ball
 *  - boom rest: braced 4-leg tower with saddle beam, rubber pads, guide horns, access ladder + platform
 * The boom heading is a parameter (radians from +x toward +z in plan); the Alpha crane points south.
 * Everything goes into the caller's shared batches (no extra draw calls).
 */
import * as THREE from 'three'
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, boxInFrame, boxRotY, memberFrame, place, sphere, tube, unitCyl, unitPlaneY } from '../structure/batch'
import { RAIL, railRun, type RailBatches } from '../structure/handrail'
import { ladder } from '../structure/ladder'

export interface CraneBatches {
  yellow: GeoBatch // pedestal, boom, gantry, cab, counterweight base colour
  white: GeoBatch // machinery house, A/C unit, dial
  steel: GeoBatch // ladders, roof sheet, platform brackets, doors
  steelDark: GeoBatch // bearing, sheaves, drums, bolts, louvres
  glass: GeoBatch
  soot: GeoBatch // black: hazard stripes, ropes, rubber pads
  blue: GeoBatch // hydraulic motors
  net: GeoBatch // grating (world UVs)
  light: GeoBatch // aviation obstruction lights (emissive)
  rail: RailBatches
}

export interface CraneSite {
  x: number
  z: number
  /** weather deck plate top (world y) */
  deck: number
  /** boom heading in plan, radians from +x towards +z */
  heading: number
}

/** pedestal geometry, heights above the weather deck */
export const CRANE_PED = { rCan: 1.45, rShaft: 1.25, rTop: 1.75, hCan: 3.0, hCone: 3.8, hShaft: 9.4, hTop: 10.4, bearing: 10.6, ring: 8.4, rest: 4.6 }
/** boom: foot pin ahead of the slew axis (f), pin height above the slewing deck, length to the head, droop */
const BOOM = { foot: 2.9, footH: 0.8, L: 32, angle: (7 * Math.PI) / 180, restF: 26 }

const IDENT = new THREE.Matrix4()
const ROPE = 0.022

const frustums = new Map<string, THREE.BufferGeometry>()
/** cylinder / cone frustum of unit height with baked radii (cached) */
function frustum(rTop: number, rBot: number, seg = 32, open = true) {
  const k = `${rTop}_${rBot}_${seg}_${open}`
  let g = frustums.get(k)
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1, open)
    frustums.set(k, g)
  }
  return g
}
let _wedge: THREE.BufferGeometry | null = null
/** right-triangle plate: legs along +X (1) and +Y (1), thickness 1 along Z (centred) */
function wedge() {
  if (_wedge) return _wedge
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)])
  _wedge = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5)
  return _wedge
}
let _hook: THREE.BufferGeometry | null = null
/** crane hook: 300 deg torus arc, open at the upper right, in the XY plane (radius 1) */
function hookGeo() {
  return (_hook ??= new THREE.TorusGeometry(1, 0.3, 6, 14, (5 * Math.PI) / 3).rotateZ(Math.PI / 2))
}

// ---------------------------------------------------------------- small geometry helpers (world frame)
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** flat triangles facing N (winding fixed per triangle), appended with world UVs */
function tris(b: GeoBatch, list: V3[][], N: V3) {
  const pos: number[] = []
  const nor: number[] = []
  for (const [a, c, d] of list) {
    const seq = dot(cross(sub(c, a), sub(d, a)), N) >= 0 ? [a, c, d] : [a, d, c]
    for (const p of seq) {
      pos.push(p[0], p[1], p[2])
      nor.push(N[0], N[1], N[2])
    }
  }
  if (!pos.length) return
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  b.add(g, IDENT, 'world')
}
const fan = (P: V3[]) => P.slice(1, -1).map((p, i) => [P[0], p, P[i + 2]])

type P2 = [number, number]
function clip(poly: P2[], f: (p: P2) => number): P2[] {
  const out: P2[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const fp = f(p)
    const fq = f(q)
    if (fp >= 0) out.push(p)
    if (fp >= 0 !== fq >= 0) {
      const t = fp / (fp - fq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}
/**
 * 45 deg black hazard bands on a flat yellow face: rectangle O + u U + v V (u in [0, a], v in [0, h]),
 * outward normal N, band width w (bands and gaps equal), laid 8 mm proud.
 */
function hazard(kb: GeoBatch, O: V3, U: V3, V: V3, a: number, h: number, N: V3, w = 0.3) {
  const off = 0.008
  for (let c = -h; c < a; c += 2 * w) {
    let poly: P2[] = [
      [0, 0],
      [a, 0],
      [a, h],
      [0, h],
    ]
    poly = clip(poly, (p) => p[0] + p[1] - c)
    poly = clip(poly, (p) => c + w - (p[0] + p[1]))
    if (poly.length < 3) continue
    const P = poly.map(([u, v]) => add(add(add(O, U, u), V, v), N, off))
    tris(kb, fan(P), N)
  }
}

/** annular sector platform at y (angles in world plan, from +x towards +z) */
function annulus(b: GeoBatch, cx: number, cz: number, y: number, r0: number, r1: number, a0: number, a1: number, seg: number) {
  const list: V3[][] = []
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg
    const t1 = a0 + ((a1 - a0) * (i + 1)) / seg
    const p = (r: number, t: number): V3 => [cx + r * Math.cos(t), y, cz + r * Math.sin(t)]
    list.push([p(r0, t0), p(r1, t0), p(r1, t1)], [p(r0, t0), p(r1, t1), p(r0, t1)])
  }
  tris(b, list, [0, 1, 0])
}

/** light guard rail along a circular arc (posts <= 1.25 m, top + knee rail, toe board) */
function arcRail(rb: RailBatches, cx: number, cz: number, y: number, r: number, a0: number, a1: number) {
  const n = Math.max(1, Math.ceil((r * Math.abs(a1 - a0)) / 1.25))
  const pts: V3[] = []
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n
    pts.push([cx + r * Math.cos(t), y, cz + r * Math.sin(t)])
  }
  for (const p of pts) tube(rb.rail, p, [p[0], p[1] + RAIL.top + 0.02, p[2]], RAIL.postR, 6, false)
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[i + 1]
    tube(rb.rail, [p[0], y + RAIL.top, p[2]], [q[0], y + RAIL.top, q[2]], RAIL.r, 6, true)
    tube(rb.rail, [p[0], y + RAIL.mid, p[2]], [q[0], y + RAIL.mid, q[2]], RAIL.r * 0.9, 6, true)
    bar(rb.kick, [p[0], y + 0.01 + RAIL.kick / 2, p[2]], [q[0], y + 0.01 + RAIL.kick / 2, q[2]], RAIL.kickT, RAIL.kick)
  }
}

export function buildCrane(cb: CraneBatches, site: CraneSite) {
  const { x: CX, z: CZ, deck: UD } = site
  const P = CRANE_PED
  // slewing frame: f = along the boom, s = to its left in plan (east for a south-pointing boom), y = up
  const Fx = Math.cos(site.heading)
  const Fz = Math.sin(site.heading)
  const Sx = Fz
  const Sz = -Fx
  const ry = Math.atan2(-Fz, Fx) // boxRotY angle that maps local X onto F
  const FW: V3 = [Fx, 0, Fz]
  const SW: V3 = [Sx, 0, Sz]
  const UP: V3 = [0, 1, 0]
  const W = (f: number, y: number, s: number): V3 => [CX + f * Fx + s * Sx, y, CZ + f * Fz + s * Sz]
  const rbox = (b: GeoBatch, f0: number, y0: number, s0: number, f1: number, y1: number, s1: number) =>
    boxRotY(b, W((f0 + f1) / 2, (y0 + y1) / 2, (s0 + s1) / 2), [Math.abs(f1 - f0), Math.abs(y1 - y0), Math.abs(s1 - s0)], ry)
  const cylY = (b: GeoBatch, f: number, s: number, y0: number, y1: number, r: number, seg = 16) =>
    place(b, unitCyl(seg, false), W(f, (y0 + y1) / 2, s), [0, 0, 0], [r, y1 - y0, r])
  const cylS = (b: GeoBatch, f: number, y: number, s0: number, s1: number, r: number, seg = 16) => tube(b, W(f, y, s0), W(f, y, s1), r, seg, false)
  const ring = (b: GeoBatch, rTop: number, rBot: number, y0: number, y1: number, seg = 32, open = true) =>
    place(b, frustum(rTop, rBot, seg, open), [CX, (y0 + y1) / 2, CZ], [0, 0, 0], [1, y1 - y0, 1])
  const polar = (t: number, r: number, y: number): V3 => [CX + r * Math.cos(t), y, CZ + r * Math.sin(t)]
  const grating = (f0: number, s0: number, f1: number, s1: number, y: number) =>
    place(cb.net, unitPlaneY(), W((f0 + f1) / 2, y, (s0 + s1) / 2), [0, ry, 0], [f1 - f0, 1, s1 - s0], 'world')
  const avLight = (p: V3) => {
    place(cb.steelDark, unitCyl(8, false), [p[0], p[1] - 0.09, p[2]], [0, 0, 0], [0.09, 0.08, 0.09])
    sphere(cb.light, p, 0.13, 10, 8)
  }

  const deg = Math.PI / 180
  const yB = UD + P.bearing // slew bearing seat

  // ================================================================ pedestal
  {
    // deck doubler + base can + gussets
    ring(cb.steelDark, 1.65, 1.65, UD, UD + 0.06, 32, false)
    ring(cb.yellow, P.rCan, P.rCan, UD + 0.06, UD + P.hCan)
    for (let k = 0; k < 8; k++) {
      const t = (22.5 + 45 * k) * deg
      place(cb.yellow, wedge(), polar(t, P.rCan - 0.02, UD + 0.06), [0, -t, 0], [0.22, 1.0, 0.04])
    }
    ring(cb.yellow, P.rCan + 0.06, P.rCan + 0.06, UD + P.hCan - 0.06, UD + P.hCan + 0.06, 32, false) // stiffener ring
    ring(cb.yellow, P.rShaft, P.rCan, UD + P.hCan, UD + P.hCone) // conical step
    ring(cb.yellow, P.rShaft, P.rShaft, UD + P.hCone, UD + P.hShaft)
    ring(cb.yellow, P.rShaft + 0.05, P.rShaft + 0.05, UD + 6.3, UD + 6.4, 32, false)
    ring(cb.yellow, P.rTop, P.rShaft, UD + P.hShaft, UD + P.hTop) // flared top cone
    ring(cb.yellow, 1.95, 1.95, UD + P.hTop, yB, 40, false) // top flange
    for (let k = 0; k < 36; k++) {
      const t = (k / 36) * Math.PI * 2
      boxRotY(cb.steelDark, polar(t, 1.86, UD + P.hTop - 0.035), [0.07, 0.07, 0.07], -t) // flange nuts
    }
    // pedestal door at ring-platform level
    const td = 112 * deg
    boxRotY(cb.steel, polar(td, P.rShaft + 0.01, UD + P.ring + 1.0), [0.06, 1.95, 0.85], -td)
    boxRotY(cb.steelDark, polar(td, P.rShaft + 0.05, UD + P.ring + 1.0), [0.04, 0.12, 0.08], -td + Math.PI / 2)
    // marking band at the deck
    ring(cb.soot, P.rCan + 0.005, P.rCan + 0.005, UD + 0.9, UD + 1.0)

    // ---- ladder 1: deck -> rest platform (east face), ladder 2: rest -> ring platform (south-east face)
    const t1 = 0
    const r1 = P.rCan + 0.18
    ladder(cb.steel, polar(t1, r1, UD), P.rest, [Math.cos(t1), Math.sin(t1)], true)
    for (const y of [UD + P.hCone + 0.4, UD + P.rest - 0.2])
      for (const sd of [-0.2, 0.2]) {
        const tt = t1 + sd / r1
        bar(cb.steel, polar(tt, P.rShaft - 0.02, y), polar(tt, r1, y), 0.06, 0.06)
      }
    const t2 = 52 * deg
    const r2 = P.rShaft + 0.18
    ladder(cb.steel, polar(t2, r2, UD + P.rest), P.ring - P.rest, [Math.cos(t2), Math.sin(t2)], true)
    // rest platform: sector clear of ladder 1's cage
    const ra = 14 * deg
    const rb2 = 72 * deg
    const yr = UD + P.rest
    annulus(cb.net, CX, CZ, yr, P.rShaft + 0.03, 2.5, ra, rb2, 8)
    arcRail(cb.rail, CX, CZ, yr, 2.45, ra, rb2)
    railRun(cb.rail, polar(rb2, P.rShaft + 0.05, yr), polar(rb2, 2.45, yr), { endPost: false })
    for (const t of [ra, (ra + rb2) / 2, rb2]) {
      bar(cb.steel, polar(t, P.rShaft, yr - 0.08), polar(t, 2.5, yr - 0.08), 0.08, 0.14)
      tube(cb.steel, polar(t, P.rShaft, yr - 0.9), polar(t, 2.1, yr - 0.14), 0.035, 6, true)
    }

    // ---- ring platform under the slew bearing (notch for ladder 2, bridged outboard of the cage)
    const yp = UD + P.ring
    const notch = 12 * deg
    annulus(cb.net, CX, CZ, yp, P.rShaft + 0.03, 2.9, t2 + notch, t2 - notch + Math.PI * 2, 30)
    annulus(cb.net, CX, CZ, yp, 2.25, 2.9, t2 - notch, t2 + notch, 3)
    arcRail(cb.rail, CX, CZ, yp, 2.85, 0, Math.PI * 2)
    for (let k = 0; k < 10; k++) {
      const t = t2 + notch + 0.12 + (k / 10) * (Math.PI * 2 - 2 * notch - 0.24)
      bar(cb.steel, polar(t, P.rShaft, yp - 0.09), polar(t, 2.9, yp - 0.09), 0.08, 0.16)
      tube(cb.steel, polar(t, P.rShaft, yp - 1.0), polar(t, 2.3, yp - 0.17), 0.04, 6, true)
    }
  }

  // ================================================================ slew bearing, turntable, slewing deck
  const yTT = yB + 0.25 // bearing top
  const yD = yB + 0.95 // slewing deck top
  {
    ring(cb.steelDark, 1.8, 1.8, yB, yTT, 40, false)
    for (let k = 0; k < 48; k++) {
      const t = (k / 48) * Math.PI * 2
      boxRotY(cb.steelDark, polar(t, 1.84, yB + 0.12), [0.1, 0.2, 0.08], -t) // external gear teeth
    }
    for (let k = 0; k < 36; k++) {
      const t = ((k + 0.5) / 36) * Math.PI * 2
      boxRotY(cb.steelDark, polar(t, 1.72, yTT + 0.03), [0.06, 0.06, 0.06], -t) // bolt heads
    }
    ring(cb.yellow, 1.65, 1.65, yTT, yD - 0.5, 32, false) // turntable / king ring
    rbox(cb.yellow, -2.95, yD - 0.5, -1.75, 3.3, yD, 2.0) // slewing platform frame
    // slew drives (pinion on the external gear, gearbox under the deck, motor on top)
    for (const sg of [-1, 1]) {
      const f = 2.06 * Math.cos(36 * deg)
      const s = sg * 2.06 * Math.sin(36 * deg)
      cylY(cb.steelDark, f, s, yB + 0.02, yTT - 0.02, 0.17, 12)
      cylY(cb.steelDark, f, s, yTT, yD - 0.5, 0.22, 12)
      cylY(cb.steelDark, f, s, yD, yD + 0.1, 0.22, 12)
      cylY(cb.blue, f, s, yD + 0.1, yD + 0.62, 0.16, 12)
    }
    // east walkway stringers / cab plinth
    rbox(cb.yellow, -2.95, yD - 0.3, 2.85, -0.02, yD - 0.02, 2.95)
    rbox(cb.yellow, -2.95, yD - 0.3, 2.0, -2.85, yD - 0.02, 2.95)
    for (const f of [-2.0, -1.0]) rbox(cb.yellow, f - 0.05, yD - 0.25, 2.0, f + 0.05, yD - 0.02, 2.85)
  }

  // ================================================================ machinery house, winches, counterweight
  const H = { f0: -0.9, f1: 1.45, s0: -1.75, s1: 1.95, h: 3.3 }
  const yR = yD + H.h
  {
    rbox(cb.white, H.f0, yD, H.s0, H.f1, yR, H.s1)
    rbox(cb.steel, H.f0 - 0.05, yR, H.s0 - 0.05, H.f1 + 0.05, yR + 0.08, H.s1 + 0.05) // roof sheet
    // louvre panels: west wall (2), rear wall (1); slats as proud dark strips
    const louvre = (f0: number, f1: number, s0: number, s1: number, y0: number, y1: number, face: 'f' | 's', at: number, out: number) => {
      const n = Math.round((y1 - y0) / 0.16)
      for (let i = 0; i <= n; i++) {
        const y = y0 + ((y1 - y0) * i) / n
        if (face === 's') rbox(cb.steelDark, f0, y - 0.025, at, f1, y + 0.025, at + out * 0.05)
        else rbox(cb.steelDark, at, y - 0.025, s0, at + out * 0.05, y + 0.025, s1)
      }
      if (face === 's') {
        rbox(cb.steelDark, f0 - 0.04, y0, at, f0, y1, at + out * 0.06)
        rbox(cb.steelDark, f1, y0, at, f1 + 0.04, y1, at + out * 0.06)
      } else {
        rbox(cb.steelDark, at, y0, s0 - 0.04, at + out * 0.06, y1, s0)
        rbox(cb.steelDark, at, y0, s1, at + out * 0.06, y1, s1 + 0.04)
      }
    }
    louvre(-0.65, 0.1, 0, 0, yD + 1.0, yD + 2.6, 's', H.s0, -1)
    louvre(0.35, 1.2, 0, 0, yD + 1.0, yD + 2.6, 's', H.s0, -1)
    louvre(0, 0, -1.4, -0.3, yD + 1.4, yD + 2.6, 'f', H.f0, -1)
    // doors: east wall onto the walkway, rear wall into the winch bay
    rbox(cb.steel, -0.8, yD + 0.02, H.s1, -0.08, yD + 2.05, H.s1 + 0.03)
    rbox(cb.steelDark, -0.25, yD + 1.0, H.s1 + 0.03, -0.15, yD + 1.06, H.s1 + 0.07)
    rbox(cb.steel, H.f0 - 0.03, yD + 0.02, 0.4, H.f0, yD + 2.05, 1.15)
    // vertical panel seams (east wall behind the walkway, front wall)
    for (const f of [-0.85, 0.0]) rbox(cb.steel, f, yD, H.s1, f + 0.05, yR, H.s1 + 0.02)
    for (const s of [-1.0, -0.2, 0.6, 1.4]) rbox(cb.steel, H.f1, yD, s, H.f1 + 0.02, yR, s + 0.05)
    // roof: cooler with fans, exhaust silencer + stack (diesel engine), luffing winch
    rbox(cb.white, 0.75, yR + 0.08, -1.35, 1.4, yR + 0.75, -0.2)
    for (const s of [-1.0, -0.52]) cylY(cb.soot, 1.075, s, yR + 0.75, yR + 0.78, 0.22, 14)
    tube(cb.steelDark, W(-0.8, yR + 0.42, -1.2), W(0.25, yR + 0.42, -1.2), 0.24, 14, false)
    for (const f of [-0.6, 0.05]) rbox(cb.steelDark, f - 0.04, yR + 0.08, -1.42, f + 0.04, yR + 0.3, -0.98)
    cylY(cb.steelDark, -0.75, -1.2, yR + 0.42, yR + 2.3, 0.11, 12)
    cylY(cb.soot, -0.75, -1.2, yR + 2.1, yR + 2.3, 0.125, 12)
    rbox(cb.soot, -0.95, yR + 2.33, -1.38, -0.55, yR + 2.36, -1.02) // rain flap
    const yLw = yR + 0.62
    cylS(cb.steelDark, 0.05, yLw, -0.5, 0.7, 0.4)
    cylS(cb.soot, 0.05, yLw, -0.45, 0.65, 0.44)
    for (const s of [-0.55, 0.7]) cylS(cb.yellow, 0.05, yLw, s, s + 0.05, 0.56, 18)
    for (const s of [-0.68, 0.78]) rbox(cb.yellow, -0.5, yR + 0.08, s, 0.6, yLw + 0.15, s + 0.1)
    cylS(cb.steelDark, 0.05, yLw, 0.88, 1.05, 0.24, 12)
    cylS(cb.blue, 0.05, yLw, 1.05, 1.4, 0.18, 12)

    // winch bay (open, rear): main hoist + auxiliary hoist winches, drum axes across the house
    const winch = (s0: number, s1: number, r: number, motorOut: number) => {
      const f = -1.6
      const y = yD + 0.95
      cylS(cb.steelDark, f, y, s0 + 0.1, s1 - 0.1, r)
      cylS(cb.soot, f, y, s0 + 0.16, s1 - 0.16, r + 0.05) // rope layers
      for (const s of [s0 + 0.1, s1 - 0.14]) cylS(cb.yellow, f, y, s, s + 0.04, r + 0.17, 20)
      for (const s of [s0, s1 - 0.1]) rbox(cb.yellow, f - r - 0.3, yD, s, f + r + 0.3, y + 0.2, s + 0.1)
      const sm = motorOut < 0 ? s0 : s1
      cylS(cb.steelDark, f, y, sm, sm + motorOut * 0.2, 0.3, 14) // planetary gearbox
      cylS(cb.blue, f, y, sm + motorOut * 0.2, sm + motorOut * 0.55, 0.2, 12) // hydraulic motor
      return W(f, y + r + 0.05, (s0 + s1) / 2)
    }
    const mainDrum = winch(-1.2, 0.0, 0.45, -1)
    const auxDrum = winch(0.25, 1.35, 0.38, 1)
    // counterweight with hazard striping (rear and both sides)
    const CW = { f0: -2.95, f1: -2.3, y0: yD - 0.9, y1: yD + 1.0 } // top below the drum tops; 2.25 m over the ring platform
    rbox(cb.yellow, CW.f0, CW.y0, H.s0, CW.f1, CW.y1, H.s1)
    hazard(cb.soot, W(CW.f0, CW.y0, H.s0), SW, UP, H.s1 - H.s0, CW.y1 - CW.y0, [-Fx, 0, -Fz])
    hazard(cb.soot, W(CW.f0, CW.y0, H.s0), FW, UP, CW.f1 - CW.f0, CW.y1 - CW.y0, [-Sx, 0, -Sz])
    hazard(cb.soot, W(CW.f0, CW.y0, H.s1), FW, UP, CW.f1 - CW.f0, CW.y1 - CW.y0, SW)

    // east walkway (grating, opening for the ladder down to the ring platform), rails, ladder
    grating(-2.95, 2.0, -1.3, 2.95, yD)
    grating(-0.7, 2.0, -0.02, 2.95, yD)
    railRun(cb.rail, W(-2.93, yD, 2.93), W(-0.05, yD, 2.93))
    railRun(cb.rail, W(-2.93, yD, 2.02), W(-2.93, yD, 2.93), { endPost: false })
    ladder(cb.steel, W(-1.0, UD + P.ring, 2.2), yD - UD - P.ring, [Sx, Sz], false)

    // ================================================================ operator cab (east side, beside the boom foot)
    const C = { f0: 0.0, f1: 2.5, s0: 1.98, s1: 3.1, y0: yD + 0.3, y1: yD + 2.75 }
    rbox(cb.yellow, C.f0 + 0.1, yD - 0.3, C.s0, C.f1 - 0.1, C.y0, C.s1 - 0.05) // plinth / underframe
    rbox(cb.yellow, C.f0, C.y0, C.s0, C.f1, C.y1, C.s1)
    rbox(cb.glass, C.f1, yD + 1.0, C.s0 + 0.1, C.f1 + 0.025, C.y1 - 0.12, C.s1 - 0.1) // front
    rbox(cb.glass, C.f1, C.y0 + 0.12, C.s0 + 0.14, C.f1 + 0.025, yD + 0.88, C.s1 - 0.14) // floor window
    rbox(cb.yellow, C.f1, yD + 1.0, 2.52, C.f1 + 0.035, C.y1 - 0.12, 2.58) // mullion
    rbox(cb.glass, 0.75, yD + 1.0, C.s1, C.f1 - 0.1, C.y1 - 0.12, C.s1 + 0.025) // outer side
    rbox(cb.yellow, 1.55, yD + 1.0, C.s1, 1.62, C.y1 - 0.12, C.s1 + 0.035)
    rbox(cb.glass, H.f1 + 0.1, yD + 1.0, C.s0 - 0.025, C.f1 - 0.1, C.y1 - 0.12, C.s0) // boom-side window
    rbox(cb.glass, 1.25, C.y1, C.s0 + 0.12, C.f1 - 0.1, C.y1 + 0.025, C.s1 - 0.12) // roof window
    bar(cb.steelDark, W(C.f1, C.y1 - 0.02, (C.s0 + C.s1) / 2), W(C.f1 + 0.4, C.y1 - 0.16, (C.s0 + C.s1) / 2), 1.2, 0.03) // sun visor
    for (const s of [2.25, 2.8]) bar(cb.soot, W(C.f1 + 0.035, yD + 1.08, s), W(C.f1 + 0.035, yD + 1.95, s + 0.18), 0.03, 0.02, FW) // wipers
    bar(cb.soot, W(1.4, C.y1 + 0.04, 2.35), W(2.25, C.y1 + 0.04, 2.6), 0.03, 0.02) // roof wiper
    rbox(cb.steel, C.f0 - 0.03, C.y0 + 0.03, 2.15, C.f0, yD + 2.45, 2.9) // door
    rbox(cb.glass, C.f0 - 0.04, yD + 1.5, 2.3, C.f0 - 0.03, yD + 2.25, 2.75)
    rbox(cb.steelDark, C.f0 - 0.08, yD + 1.25, 2.72, C.f0 - 0.03, yD + 1.3, 2.84)
    rbox(cb.white, 0.1, C.y1, 2.1, 0.95, C.y1 + 0.38, 2.95) // A/C unit
    rbox(cb.steel, C.f0 - 0.6, yD + 0.0, 2.1, C.f0, yD + 0.3, 2.85) // door step (on the walkway)

    // ================================================================ A-frame gantry
    const fA = -0.5
    const yA = yD + 8.6
    const legS = [-1.6, 1.75]
    for (const s of legS) {
      bar(cb.yellow, W(1.2, yR + 0.08, s), W(fA, yA, s), 0.28, 0.28, SW)
      bar(cb.yellow, W(-2.62, CW.y1, s), W(fA, yA, s), 0.26, 0.26, SW)
      rbox(cb.steelDark, 0.95, yR + 0.08, s - 0.22, 1.45, yR + 0.14, s + 0.22)
      rbox(cb.steelDark, -2.9, CW.y1, s - 0.2, -2.35, CW.y1 + 0.06, s + 0.2)
    }
    rbox(cb.yellow, fA - 0.25, yA - 0.2, -1.85, fA + 0.25, yA + 0.2, 2.0) // crosshead
    const tm = 0.49
    const fMid = 1.2 + (fA - 1.2) * tm
    const yMid = yR + 0.08 + (yA - yR - 0.08) * tm
    bar(cb.yellow, W(fMid, yMid, legS[0]), W(fMid, yMid, legS[1]), 0.16, 0.16)
    tube(cb.yellow, W(1.2, yR + 0.08, legS[0]), W(fMid, yMid, legS[1]), 0.06, 8, true)
    tube(cb.yellow, W(1.2, yR + 0.08, legS[1]), W(fMid, yMid, legS[0]), 0.06, 8, true)
    const fBk = -2.62 + (fA + 2.62) * 0.55
    const yBk = CW.y1 + (yA - CW.y1) * 0.55
    bar(cb.yellow, W(fBk, yBk, legS[0]), W(fBk, yBk, legS[1]), 0.16, 0.16)
    // floodlights on the front legs
    for (const s of legS) rbox(cb.steelDark, fMid + 0.15, yMid + 0.3, s - 0.18, fMid + 0.35, yMid + 0.55, s + 0.18)
    avLight(W(fA, yA + 0.55, 0.2))
    // hoist lead sheaves on brackets above the crosshead
    const lead = (s: number) => {
      rbox(cb.yellow, fA - 0.12, yA + 0.2, s - 0.12, fA + 0.12, yA + 0.5, s - 0.09)
      rbox(cb.yellow, fA - 0.12, yA + 0.2, s + 0.09, fA + 0.12, yA + 0.5, s + 0.12)
      cylS(cb.steelDark, fA, yA + 0.55, s - 0.08, s + 0.08, 0.3, 16)
    }
    lead(-0.95)
    lead(0.95)
    // upper luffing block hanging under the crosshead
    const uHub = W(fA + 0.35, yA - 0.6, 0)
    cylS(cb.steelDark, fA + 0.35, yA - 0.6, -0.55, 0.55, 0.36, 18)
    for (const s of [-0.62, 0.57]) rbox(cb.yellow, fA - 0.05, yA - 1.0, s, fA + 0.75, yA - 0.2, s + 0.05)

    // ================================================================ lattice boom
    const A = BOOM.angle
    const L = BOOM.L
    const yFoot = yD + BOOM.footH
    const nW: V3 = [Fx * Math.sin(A), Math.cos(A), Fz * Math.sin(A)]
    const B = (t: number, n: number, s: number): V3 => W(BOOM.foot + t * Math.cos(A) + n * Math.sin(A), yFoot - t * Math.sin(A) + n * Math.cos(A), s)
    const bbox = (b: GeoBatch, t0: number, t1: number, n0: number, n1: number, s0: number, s1: number) => {
      const nc = (n0 + n1) / 2
      const sc = (s0 + s1) / 2
      const { m, L: len } = memberFrame(B(t0, nc, sc), B(t1, nc, sc), nW)
      boxInFrame(b, m, [len / 2, 0, 0], [len, n1 - n0, Math.abs(s1 - s0)])
    }
    // foot lugs + pins
    for (const sg of [-1, 1]) {
      rbox(cb.yellow, BOOM.foot - 0.5, yD, sg * 0.98, BOOM.foot + 0.4, yFoot + 0.3, sg * 1.18)
      rbox(cb.yellow, BOOM.foot - 0.5, yD, sg * 1.28, BOOM.foot + 0.4, yFoot + 0.3, sg * 1.48)
    }
    cylS(cb.steelDark, BOOM.foot, yFoot, -1.55, 1.55, 0.11, 14)
    // stations: foot taper, parallel body, tip taper (width w across, depth d in the luffing plane)
    const st = [
      { t: 0, w: 2.2, d: 0.35 },
      { t: 5.5, w: 1.9, d: 1.9 },
      { t: L - 5.5, w: 1.9, d: 1.9 },
      { t: L, w: 1.0, d: 0.9 },
    ]
    const CORN: P2[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]
    const cp = (q: { t: number; w: number; d: number }, k: number) => B(q.t, (CORN[k][1] * q.d) / 2, (CORN[k][0] * q.w) / 2)
    for (let k = 0; k < 4; k++) for (let i = 0; i < st.length - 1; i++) tube(cb.yellow, cp(st[i], k), cp(st[i + 1], k), 0.095, 8, true)
    const stations: { t: number; w: number; d: number }[] = []
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i]
      const e = st[i + 1]
      const nb = Math.max(1, Math.round((e.t - a.t) / 1.85))
      for (let j = 0; j < nb; j++) {
        const u = j / nb
        stations.push({ t: a.t + (e.t - a.t) * u, w: a.w + (e.w - a.w) * u, d: a.d + (e.d - a.d) * u })
      }
    }
    stations.push(st[st.length - 1])
    for (let j = 0; j < stations.length; j++) {
      const a = stations[j]
      for (let k = 0; k < 4; k++) tube(cb.yellow, cp(a, k), cp(a, (k + 1) % 4), 0.04, 5, true) // battens
      if (j % 3 === 1) tube(cb.yellow, cp(a, 0), cp(a, 2), 0.035, 5, true) // section diagonal
      if (j === stations.length - 1) break
      const e = stations[j + 1]
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4
        if (j % 2 === 0) tube(cb.yellow, cp(a, k), cp(e, k2), 0.045, 5, true)
        else tube(cb.yellow, cp(a, k2), cp(e, k), 0.045, 5, true)
      }
    }
    // rope guide sheaves on the boom foot
    for (const s of [-0.25, 0.25]) {
      tube(cb.steelDark, B(0.8, 0.8, s - 0.07), B(0.8, 0.8, s + 0.07), 0.3, 14, false)
      for (const ds of [-0.11, 0.11]) {
        bar(cb.yellow, B(0.45, 0.25, s + ds), B(0.8, 0.8, s + ds), 0.03, 0.12, nW)
        bar(cb.yellow, B(1.2, 0.33, s + ds), B(0.8, 0.8, s + ds), 0.03, 0.12, nW)
      }
    }
    // boom angle indicator facing the cab
    {
      const s = 1.02 + 0.14
      const c = B(3.0, 0.1, s)
      bar(cb.yellow, B(3.0, 0.1, 1.0), c, 0.06, 0.06)
      tube(cb.white, c, B(3.0, 0.1, s + 0.04), 0.24, 18, false)
      bar(cb.soot, B(3.0, 0.1, s + 0.05), add(B(3.0, 0.1, s + 0.05), [0, -0.2, 0]), 0.025, 0.02, SW)
    }

    // ---- boom-tip head: side plates (striped), main sheaves, top plate, whip jib, anemometer, light
    for (const sg of [-1, 1]) {
      bbox(cb.yellow, L - 0.3, L + 1.05, -0.55, 0.5, sg * 0.51, sg * 0.55)
      hazard(cb.soot, B(L - 0.3, -0.55, sg * 0.55), norm(sub(B(1, 0, 0), B(0, 0, 0))), nW, 1.35, 1.05, sg > 0 ? SW : [-Sx, 0, -Sz], 0.22)
    }
    bbox(cb.yellow, L - 0.3, L + 0.7, 0.46, 0.52, -0.51, 0.51)
    const pm = B(L + 0.75, -0.05, 0)
    for (const s of [-0.22, 0.22]) tube(cb.steelDark, [pm[0] + SW[0] * (s - 0.08), pm[1], pm[2] + SW[2] * (s - 0.08)], [pm[0] + SW[0] * (s + 0.08), pm[1], pm[2] + SW[2] * (s + 0.08)], 0.5, 20, false)
    tube(cb.steelDark, add(pm, SW, -0.6), add(pm, SW, 0.6), 0.08, 10, false) // sheave axle
    // whip jib with the auxiliary sheave
    const ah = B(L + 2.7, 0.78, 0)
    for (const sg of [-1, 1]) {
      bar(cb.yellow, B(L + 0.3, 0.6, sg * 0.2), B(L + 2.75, 0.78, sg * 0.2), 0.05, 0.36, nW)
      bar(cb.yellow, B(L + 0.95, -0.2, sg * 0.42), B(L + 2.3, 0.62, sg * 0.2), 0.05, 0.14, nW)
      hazard(cb.soot, B(L + 0.3, 0.42, sg * 0.226), norm(sub(B(L + 2.75, 0.78, 0), B(L + 0.3, 0.6, 0))), nW, 2.45, 0.36, sg > 0 ? SW : [-Sx, 0, -Sz], 0.2)
    }
    tube(cb.steelDark, add(ah, SW, -0.07), add(ah, SW, 0.07), 0.33, 18, false)
    // anemometer + aviation light on the head
    {
      const base = B(L + 0.2, 0.52, -0.3)
      const top = add(base, UP, 1.3)
      tube(cb.steel, base, top, 0.03, 6, true)
      tube(cb.steel, add(top, SW, -0.25), add(top, SW, 0.25), 0.02, 5, true)
      const an = add(top, SW, -0.25)
      tube(cb.steelDark, an, add(an, UP, 0.12), 0.015, 5, true)
      for (let k = 0; k < 3; k++) {
        const t = (k / 3) * Math.PI * 2
        const tip2: V3 = add(add(an, UP, 0.12), [Math.cos(t) * 0.12, 0, Math.sin(t) * 0.12])
        tube(cb.steelDark, add(an, UP, 0.12), tip2, 0.008, 4, true)
        sphere(cb.white, tip2, 0.035, 6, 4)
      }
      const vn = add(top, SW, 0.25)
      bar(cb.steelDark, add(vn, FW, -0.15), add(add(vn, FW, 0.12), UP, 0.08), 0.015, 0.1, SW)
      const lb = B(L + 0.2, 0.52, 0.3)
      tube(cb.steel, lb, add(lb, UP, 0.5), 0.03, 6, true)
      avLight(add(lb, UP, 0.62))
    }

    // ---- ropes: main + auxiliary hoist (drum -> gantry lead sheave -> foot guide -> along the boom -> head)
    const r = (a: V3, e: V3, rad = ROPE) => tube(cb.soot, a, e, rad, 4, true)
    r(mainDrum, W(fA - 0.3, yA + 0.55, -0.95))
    r(auxDrum, W(fA - 0.3, yA + 0.55, 0.95))
    r(W(fA + 0.3, yA + 0.55, -0.95), B(0.8, 1.1, -0.25))
    r(W(fA + 0.3, yA + 0.55, 0.95), B(0.8, 1.1, 0.25))
    r(B(0.8, 1.1, -0.25), B(L + 0.75, 0.45, -0.22))
    r(B(0.8, 1.1, 0.25), B(L + 2.7, 1.11, 0))

    // ---- luffing tackle: upper block -> floating spreader block (multi-fall), pendants to the tip
    const tipTop = B(L - 0.05, 0.45, 0)
    const Q = lerp(uHub, tipTop, 0.3)
    const dir = norm(sub(Q, uHub))
    const pv = norm(sub(UP, [dir[0] * dot(UP, dir), dir[1] * dot(UP, dir), dir[2] * dot(UP, dir)]))
    for (let i = 0; i < 6; i++) {
      const s = -0.45 + 0.18 * i
      const o = i % 2 ? 1 : -1
      r(add(add(uHub, SW, s), pv, o * 0.34), add(add(Q, SW, s), pv, o * 0.27))
    }
    r(W(0.05, yLw + 0.44, 0.1), add(add(uHub, SW, 0.5), pv, -0.34)) // luffing winch lead
    tube(cb.steelDark, add(Q, SW, -0.52), add(Q, SW, 0.52), 0.3, 16, false)
    const qf = memberFrame(add(Q, SW, -0.75), add(Q, SW, 0.75), pv)
    boxInFrame(cb.yellow, qf.m, [0.75, 0, 0], [1.5, 0.22, 0.22]) // spreader bar (offset below the sheaves)
    for (const sg of [-1, 1]) {
      const cheek = memberFrame(add(Q, SW, sg * 0.58 - 0.025), add(Q, SW, sg * 0.58 + 0.025), pv)
      boxInFrame(cb.yellow, cheek.m, [0.025, 0, 0], [0.05, 0.75, 0.75])
      const pa = add(Q, SW, sg * 0.75)
      const pb = B(L - 0.05, 0.45, sg * 0.5)
      tube(cb.soot, pa, pb, 0.035, 6, true) // pendant
      bbox(cb.yellow, L - 0.35, L + 0.05, 0.45, 0.62, sg * 0.5 - 0.04, sg * 0.5 + 0.04) // pendant lug
    }

    // ---- main hook block (4 falls), lowered onto its pad and lashed to a padeye
    const yBlk = UD + 3.7
    const fm = BOOM.foot + (L + 0.75) * Math.cos(A) - 0.05 * Math.sin(A)
    for (const s of [-0.22, 0.22]) for (const df of [-0.5, 0.5]) r(W(fm + df, pm[1], s), W(fm + df, yBlk, s))
    for (const sg of [-1, 1]) {
      rbox(cb.yellow, fm - 0.62, yBlk - 0.75, sg * 0.39, fm + 0.62, yBlk + 0.55, sg * 0.45)
      hazard(cb.soot, W(fm - 0.62, yBlk - 0.75, sg * 0.45), FW, UP, 1.24, 1.3, sg > 0 ? SW : [-Sx, 0, -Sz], 0.22)
      cylS(cb.steelDark, fm, yBlk, sg * 0.11, sg * 0.33, 0.5, 18)
    }
    cylS(cb.steelDark, fm, yBlk, -0.5, 0.5, 0.09, 10)
    rbox(cb.steelDark, fm - 0.35, yBlk - 0.98, -0.39, fm + 0.35, yBlk - 0.75, 0.39)
    cylY(cb.steelDark, fm, 0, yBlk - 1.3, yBlk - 0.98, 0.1, 12)
    const hc = W(fm, yBlk - 1.3 - 0.27, 0)
    place(cb.steelDark, hookGeo(), hc, [0, ry, 0], [0.27, 0.27, 0.27])
    rbox(cb.soot, fm - 0.5, UD, -0.5, fm + 0.5, UD + 0.06, 0.5) // hook pad (rubber mat)
    rbox(cb.yellow, fm + 0.8, UD, -0.04, fm + 1.05, UD + 0.25, 0.04) // padeye
    r(add(hc, UP, -0.3), W(fm + 0.92, UD + 0.18, 0), 0.015)

    // ---- auxiliary whip line + headache ball
    const yBall = ah[1] - 2.9
    const wf = add(ah, FW, 0.33)
    r(wf, [wf[0], yBall + 0.32, wf[2]])
    const ball: V3 = [wf[0], yBall, wf[2]]
    sphere(cb.yellow, ball, 0.32, 14, 10)
    place(cb.soot, unitCyl(14, false), ball, [0, 0, 0], [0.325, 0.12, 0.325])
    tube(cb.steelDark, add(ball, UP, -0.3), add(ball, UP, -0.5), 0.05, 8, false)
    place(cb.steelDark, hookGeo(), add(ball, UP, -0.65), [0, ry, 0], [0.15, 0.15, 0.15])

    // ================================================================ boom rest (saddle under the bottom chords)
    {
      const tr = (BOOM.restF - BOOM.foot) / Math.cos(A)
      const chord = B(tr, -0.95, 0.95)
      const fr = (chord[0] - CX) * Fx + (chord[2] - CZ) * Fz
      const padTop = chord[1] - 0.1
      const beamTop = padTop - 0.12
      const yTop = beamTop - 0.4
      const lf = [fr - 0.75, fr + 0.75]
      const ls = [-1.35, 1.35]
      for (const f of lf)
        for (const s of ls) {
          bar(cb.yellow, W(f, UD, s), W(f, yTop, s), 0.24, 0.24, FW)
          rbox(cb.steelDark, f - 0.3, UD, s - 0.3, f + 0.3, UD + 0.04, s + 0.3)
        }
      rbox(cb.yellow, fr - 0.25, yTop, -1.6, fr + 0.25, beamTop, 1.6) // saddle beam
      for (const s of ls) rbox(cb.yellow, lf[0] - 0.12, yTop - 0.3, s - 0.1, lf[1] + 0.12, yTop, s + 0.1)
      for (const sg of [-1, 1]) {
        rbox(cb.soot, fr - 0.3, beamTop, sg * 0.95 - 0.2, fr + 0.3, padTop, sg * 0.95 + 0.2) // rubber pad
        bar(cb.yellow, W(fr, beamTop, sg * 1.22), W(fr, beamTop + 0.65, sg * 1.42), 0.4, 0.05, SW) // guide horns
        bar(cb.yellow, W(fr, beamTop, sg * 0.68), W(fr, beamTop + 0.5, sg * 0.5), 0.4, 0.05, SW)
      }
      // girts + X bracing, three tiers on every face
      const tiers = [UD + 0.3, UD + (yTop - UD) / 3, UD + (2 * (yTop - UD)) / 3, yTop - 0.3]
      for (let i = 0; i < 3; i++) {
        const y0 = tiers[i]
        const y1 = tiers[i + 1]
        const faces: [number, number, number, number][] = [
          [lf[0], ls[0], lf[1], ls[0]],
          [lf[0], ls[1], lf[1], ls[1]],
          [lf[0], ls[0], lf[0], ls[1]],
          [lf[1], ls[0], lf[1], ls[1]],
        ]
        for (const [f0, s0, f1, s1] of faces) {
          tube(cb.yellow, W(f0, y0, s0), W(f1, y1, s1), 0.05, 6, true)
          tube(cb.yellow, W(f1, y0, s1), W(f0, y1, s0), 0.05, 6, true)
          if (i > 0) bar(cb.yellow, W(f0, y0, s0), W(f1, y0, s1), 0.12, 0.12)
        }
      }
      // access platform on the far side + caged ladder
      const yP = padTop - 2.0
      const pf0 = lf[1] + 0.12
      const pf1 = lf[1] + 1.0
      grating(pf0, -1.35, pf1, 1.35, yP)
      for (const s of ls) {
        rbox(cb.yellow, lf[1], yP - 0.2, s - 0.06, pf1, yP - 0.02, s + 0.06)
        tube(cb.yellow, W(lf[1], yP - 1.0, s), W(pf1 - 0.1, yP - 0.12, s), 0.04, 6, true)
      }
      rbox(cb.yellow, pf1 - 0.06, yP - 0.2, -1.35, pf1, yP - 0.02, 1.35)
      const ldS = 0.62
      railRun(cb.rail, W(pf1 - 0.02, yP, -1.33), W(pf1 - 0.02, yP, ldS - 0.35))
      railRun(cb.rail, W(pf1 - 0.02, yP, ldS + 0.35), W(pf1 - 0.02, yP, 1.33))
      railRun(cb.rail, W(pf0, yP, -1.33), W(pf1 - 0.02, yP, -1.33), { endPost: false })
      railRun(cb.rail, W(pf0, yP, 1.33), W(pf1 - 0.02, yP, 1.33), { endPost: false })
      ladder(cb.steel, W(pf1 + 0.1, UD, ldS), yP - UD, [Fx, Fz], true)
    }
  }
  return { slewBearing: yB }
}
