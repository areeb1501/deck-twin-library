// Shared structural steel details: sections placed by top of steel, plate girders, base/cap/end/fin plates, bolts, gussets, grating bays, ISO 14122 guard rails and gates.
import * as THREE from 'three'
import { mat4, uvScale, type Kit, type MatKey, type V3 } from '../lib/kit'
import { sectionShape } from '../lib/parts'
import { ACCESS, SECTIONS, type Section } from '../lib/standards'
import { gratingMaterial, hazardStripeMaterial } from '../lib/textures'

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Section by name. Also accepts welded plate girders "PG <depth mm>[x<flange mm>]", e.g. "PG 1200" or "PG 1500x500". */
export function sec(name: string): Section {
  const m = /^PG\s*(\d+)(?:\s*[xX]\s*(\d+))?$/.exec(String(name).trim())
  if (m) {
    const d = +m[1] / 1000
    const b = m[2] ? +m[2] / 1000 : Math.round(d * 0.38 * 20) / 20 // typical
    const tw = clamp(Math.round(d / 70 / 0.002) * 0.002, 0.012, 0.03) // typical
    const tf = clamp(Math.round(d / 32 / 0.005) * 0.005, 0.025, 0.07) // typical
    return { kind: 'I', d, b, tw, tf, r: 0, mass: (2 * b * tf + (d - 2 * tf) * tw) * 7850 }
  }
  return SECTIONS[name] ?? SECTIONS['HEB 300']
}

function shapeOf(name: string): THREE.Shape {
  if (!/^PG/i.test(String(name).trim())) return sectionShape(SECTIONS[name] ? name : 'HEB 300')
  const { d, b, tw, tf } = sec(name)
  const sh = new THREE.Shape()
  sh.moveTo(-b / 2, -d / 2).lineTo(b / 2, -d / 2).lineTo(b / 2, -d / 2 + tf).lineTo(tw / 2, -d / 2 + tf)
  sh.lineTo(tw / 2, d / 2 - tf).lineTo(b / 2, d / 2 - tf).lineTo(b / 2, d / 2).lineTo(-b / 2, d / 2)
  sh.lineTo(-b / 2, d / 2 - tf).lineTo(-tw / 2, d / 2 - tf).lineTo(-tw / 2, -d / 2 + tf).lineTo(-b / 2, -d / 2 + tf).closePath()
  return sh
}

/** Member of any section (incl. plate girders) between a and b; `up` is the depth (web) direction. */
export function bar(k: Kit, a: V3, b: V3, name: string, mat: MatKey = 'structSteel', up: V3 = [0, 1, 0]) {
  const A = new THREE.Vector3(...a)
  const z = new THREE.Vector3(...b).sub(A)
  const L = z.length()
  if (L < 1e-4) return
  z.normalize()
  let u = new THREE.Vector3(...up).normalize()
  if (Math.abs(u.dot(z)) > 0.99) u = Math.abs(z.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const x = new THREE.Vector3().crossVectors(u, z).normalize()
  const y = new THREE.Vector3().crossVectors(z, x).normalize()
  const s = sec(name)
  k.extrude(mat, shapeOf(name), L, new THREE.Matrix4().makeBasis(x, y, z).setPosition(A), s.kind === 'CHS' ? 10 : 4)
}

/** Horizontal beam with its top of steel at `tos`, web vertical. */
export function beamTOS(k: Kit, x0: number, z0: number, x1: number, z1: number, tos: number, name: string, mat: MatKey = 'structSteel') {
  const h = sec(name).d / 2
  bar(k, [x0, tos - h, z0], [x1, tos - h, z1], name, mat, [0, 1, 0])
}

/** Vertical column from y0 to y1; `web` is the axis the web (depth) runs along. */
export function column(k: Kit, x: number, z: number, y0: number, y1: number, name: string, mat: MatKey = 'structSteel', web: 'x' | 'z' = 'x') {
  bar(k, [x, y0, z], [x, y1, z], name, mat, web === 'x' ? [1, 0, 0] : [0, 0, 1])
}

/** Axis-aligned box from min to max corner. */
export function boxMM(k: Kit, mat: MatKey, a: V3, b: V3) {
  const s: V3 = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])]
  if (s[0] < 1e-5 || s[1] < 1e-5 || s[2] < 1e-5) return
  k.box(mat, s, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
}

/** Box oriented along a→b (length), with cross-section w (horizontal, ⟂) × h (in the plane containing `up`). */
export function strip(k: Kit, mat: MatKey, a: V3, b: V3, w: number, h: number, up: V3 = [0, 1, 0]) {
  const A = new THREE.Vector3(...a)
  const z = new THREE.Vector3(...b).sub(A)
  const L = z.length()
  if (L < 1e-5) return
  z.normalize()
  let u = new THREE.Vector3(...up).normalize()
  if (Math.abs(u.dot(z)) > 0.99) u = new THREE.Vector3(1, 0, 0)
  const x = new THREE.Vector3().crossVectors(u, z).normalize()
  const y = new THREE.Vector3().crossVectors(z, x).normalize()
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(A.add(new THREE.Vector3(...b)).multiplyScalar(0.5))
  k.add(mat, new THREE.BoxGeometry(w, h, L), m)
}

/** Bolt (stud + nut each side) through a plate pack centred at p, along `axis`. */
export function bolt(k: Kit, p: V3, axis: V3, dia = 0.02, grip = 0.03, mat: MatKey = 'galvanised') {
  const v = new THREE.Vector3(...axis).normalize()
  const P = new THREE.Vector3(...p)
  const e = grip / 2 + dia * 0.5
  k.rod(mat, P.clone().addScaledVector(v, -e - dia * 0.3).toArray() as V3, P.clone().addScaledVector(v, e + dia * 0.3).toArray() as V3, dia / 2, 6)
  for (const s of [-1, 1]) k.hex('nut', dia * 1.8, dia * 0.8, P.clone().addScaledVector(v, s * (grip / 2 + dia * 0.4)).toArray() as V3, axis)
}

/** Anchor bolt projecting above a base plate whose top is at y: stud, washer and nut. */
export function anchorBolt(k: Kit, x: number, y: number, z: number, dia = 0.024) {
  k.cyl('galvanised', dia / 2, dia * 3, [x, y + dia * 1.5 - 0.01, z], 'y', 6)
  k.cyl('galvanised', dia * 1.1, 0.004, [x, y + 0.002, z], 'y', 10)
  k.hex('nut', dia * 1.8, dia * 0.8, [x, y + 0.004 + dia * 0.4, z], 'y')
}

/** Base plate (bottom at y) with anchor bolts at the corners and an optional grout bed below. Returns the plate top. */
export function basePlate(k: Kit, x: number, y: number, z: number, sx: number, sz: number, t = 0.025, dia = 0.024, mat: MatKey = 'structSteel', grout = 0) {
  if (grout > 0) k.box('concrete', [sx + 0.08, grout, sz + 0.08], [x, y - grout / 2, z])
  k.box(mat, [sx, t, sz], [x, y + t / 2, z])
  const e = Math.max(0.045, dia * 2)
  for (const a of [-1, 1]) for (const b of [-1, 1]) anchorBolt(k, x + a * (sx / 2 - e), y + t, z + b * (sz / 2 - e), dia)
  return y + t
}

/** Triangular gusset plate: right angle at `corner`, legs la along dirA and lb along dirB, thickness t. */
export function gusset(k: Kit, corner: V3, dirA: V3, dirB: V3, la: number, lb: number, t = 0.012, mat: MatKey = 'structSteel') {
  const a = new THREE.Vector3(...dirA).normalize()
  const b = new THREE.Vector3(...dirB).normalize()
  const n = new THREE.Vector3().crossVectors(a, b).normalize()
  const c = Math.min(la, lb) * 0.12 // snipe at the root
  const sh = new THREE.Shape()
  sh.moveTo(c, 0).lineTo(la, 0).lineTo(la, lb * 0.1).lineTo(la * 0.1, lb).lineTo(0, lb).lineTo(0, c).closePath()
  const o = new THREE.Vector3(...corner).addScaledVector(n, -t / 2)
  k.extrude(mat, sh, t, new THREE.Matrix4().makeBasis(a, b, n).setPosition(o), 1)
}

/** Full-depth web stiffener pair on a horizontal beam (along `along` = 'x'|'z') at position p (centre of the beam). */
export function webStiffeners(k: Kit, p: V3, along: 'x' | 'z', s: Section, mat: MatKey = 'structSteel') {
  const h = s.d - 2 * s.tf
  const w = (s.b - s.tw) / 2 - 0.004
  const t = clamp(s.tw * 1.2, 0.008, 0.025)
  for (const sg of [-1, 1]) {
    const off = sg * (s.tw / 2 + w / 2)
    if (along === 'x') k.box(mat, [t, h, w], [p[0], p[1], p[2] + off])
    else k.box(mat, [w, h, t], [p[0] + off, p[1], p[2]])
  }
}

/**
 * Bolted end-plate connection at the end of a horizontal beam (along x or z): the beam ends at `p` (web centre) and the
 * plate runs from p to p + dir·t, where `dir` = +1/-1 points from the beam out through the plate.
 */
export function endPlate(k: Kit, p: V3, along: 'x' | 'z', dir: number, s: Section, mat: MatKey = 'structSteel') {
  const t = s.d > 0.5 ? 0.025 : 0.02
  const h = s.d + 0.03
  const w = s.b + 0.02
  const c: V3 = along === 'x' ? [p[0] + dir * t / 2, p[1], p[2]] : [p[0], p[1], p[2] + dir * t / 2]
  k.box(mat, along === 'x' ? [t, h, w] : [w, h, t], c)
  const rows = Math.max(2, Math.min(6, Math.floor((s.d - 0.06) / 0.09)))
  const g = Math.min(w * 0.6, 0.14) / 2
  const dia = s.d > 0.5 ? 0.024 : 0.02
  for (let i = 0; i < rows; i++) {
    const y = p[1] - s.d / 2 + 0.05 + ((s.d - 0.1) * i) / (rows - 1)
    for (const sg of [-1, 1]) {
      const q: V3 = along === 'x' ? [c[0], y, c[2] + sg * g] : [c[0] + sg * g, y, c[2]]
      bolt(k, q, along === 'x' ? [1, 0, 0] : [0, 0, 1], dia, t * 2)
    }
  }
}

/** Fin-plate shear connection: plate welded to a supporting web face at `p`, projecting `len` along ±x|z, bolted to the supported web. */
export function finPlate(k: Kit, p: V3, along: 'x' | 'z', dir: number, depth: number, len = 0.13, mat: MatKey = 'structSteel') {
  const h = clamp(depth * 0.7, 0.12, 0.6)
  const t = 0.01
  const c: V3 = along === 'x' ? [p[0] + dir * len / 2, p[1], p[2] + 0.011] : [p[0] + 0.011, p[1], p[2] + dir * len / 2]
  k.box(mat, along === 'x' ? [len, h, t] : [t, h, len], c)
  const n = Math.max(2, Math.floor(h / 0.075))
  for (let i = 0; i < n; i++) {
    const y = p[1] - h / 2 + 0.04 + ((h - 0.08) * i) / Math.max(1, n - 1)
    const q: V3 = along === 'x' ? [p[0] + dir * (len - 0.045), y, p[2] + 0.006] : [p[0] + 0.006, y, p[2] + dir * (len - 0.045)]
    bolt(k, q, along === 'x' ? [0, 0, 1] : [1, 0, 0], 0.016, 0.026)
  }
}

/**
 * Bar-grating bay from (x0,z0) to (x1,z1), top at `top`: one textured box plus flat-bar banding.
 * `bars` = direction the bearing bars run (they span between the supports).
 */
export function gratingBay(k: Kit, x0: number, z0: number, x1: number, z1: number, top: number, bars: 'x' | 'z' = 'z', t = 0.03, band = true) {
  const sx = Math.abs(x1 - x0)
  const sz = Math.abs(z1 - z0)
  if (sx < 0.02 || sz < 0.02) return
  const g = new THREE.BoxGeometry(sx, t, sz)
  uvScale(g, sx / 0.3, sz / 0.3)
  if (bars === 'x') {
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i))
  }
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  k.add(gratingMaterial(), g, mat4([cx, top - t / 2, cz]))
  if (!band) return
  const bt = 0.004
  for (const s of [-1, 1]) {
    k.box('galvanised', [sx, t, bt], [cx, top - t / 2, cz + s * (sz / 2 - bt / 2)])
    k.box('galvanised', [bt, t, sz - 2 * bt], [cx + s * (sx / 2 - bt / 2), top - t / 2, cz])
  }
}

/** Hazard-striped (black/yellow) band from a to b, w wide and h tall, oriented like strip(). Stripe pitch ~0.2 m. */
export function hazardBand(k: Kit, a: V3, b: V3, w: number, h: number, up: V3 = [0, 1, 0]) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const A = new THREE.Vector3(...a)
  const z = new THREE.Vector3(...b).sub(A).normalize()
  let u = new THREE.Vector3(...up).normalize()
  if (Math.abs(u.dot(z)) > 0.99) u = new THREE.Vector3(1, 0, 0)
  const x = new THREE.Vector3().crossVectors(u, z).normalize()
  const y = new THREE.Vector3().crossVectors(z, x).normalize()
  // box with its length along local X so the stripe texture repeats along U
  const g = new THREE.BoxGeometry(L, h, w)
  uvScale(g, L / 0.25, 1)
  const m = new THREE.Matrix4().makeBasis(z, y, x.clone().negate()).setPosition(A.add(new THREE.Vector3(...b)).multiplyScalar(0.5))
  k.add(hazardStripeMaterial(), g, m)
}

// ------------------------------------------------------------------ guard rails (ISO 14122-3)

export const RAIL = {
  top: ACCESS.handrail.height,
  knee: ACCESS.handrail.kneeRail,
  toe: ACCESS.handrail.toePlate,
  postR: 0.0242, // 48.3 mm tube
  railR: 0.0212, // 42.4 mm
  kneeR: 0.0169, // 33.7 mm
  maxPost: ACCESS.handrail.postSpacingMax,
}

export interface RailOpts {
  top?: number
  knee?: number
  /** toe plate on the walking edge */
  toe?: boolean
  startPost?: boolean
  endPost?: boolean
  /** square base plate under each post */
  basePlates?: boolean
  mat?: MatKey
}

/** Straight guard-rail run a → b; a and b are on the walking surface (may slope). */
export function railRun(k: Kit, a: V3, b: V3, o: RailOpts = {}) {
  const { top = RAIL.top, knee = RAIL.knee, toe = true, startPost = true, endPost = true, basePlates = true, mat = 'safetyYellow' } = o
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const L = Math.hypot(dx, dz)
  if (L < 0.08) return
  const n = Math.max(1, Math.ceil(L / RAIL.maxPost))
  for (let i = 0; i <= n; i++) {
    if ((i === 0 && !startPost) || (i === n && !endPost)) continue
    const t = i / n
    const p: V3 = [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t]
    k.rod(mat, p, [p[0], p[1] + top, p[2]], RAIL.postR, 8)
    if (basePlates) k.box(mat, [0.1, 0.01, 0.1], [p[0], p[1] + 0.005, p[2]])
  }
  k.rod(mat, [a[0], a[1] + top, a[2]], [b[0], b[1] + top, b[2]], RAIL.railR, 8)
  k.rod(mat, [a[0], a[1] + knee, a[2]], [b[0], b[1] + knee, b[2]], RAIL.kneeR, 8)
  if (startPost) k.sphere(mat, RAIL.railR * 1.15, [a[0], a[1] + top, a[2]], undefined, 8)
  if (endPost) k.sphere(mat, RAIL.railR * 1.15, [b[0], b[1] + top, b[2]], undefined, 8)
  if (toe) strip(k, mat, [a[0], a[1] + 0.005 + RAIL.toe / 2, a[2]], [b[0], b[1] + 0.005 + RAIL.toe / 2, b[2]], 0.006, RAIL.toe)
}

/**
 * Guard rail along a polyline of (x, z) points at height y, leaving gaps [s0, s1] (metres along the line) open.
 * `ends` drops the post at the very start / end of the polyline (where a neighbouring run already has one).
 */
export function railPath(k: Kit, pts: [number, number][], y: number, gaps: [number, number][] = [], closed = false, o: RailOpts = {}, ends: [boolean, boolean] = [true, true]) {
  const P = closed ? [...pts, pts[0]] : pts
  let s = 0
  for (let i = 0; i < P.length - 1; i++) {
    const [x0, z0] = P[i]
    const [x1, z1] = P[i + 1]
    const L = Math.hypot(x1 - x0, z1 - z0)
    let pieces: [number, number][] = [[0, L]]
    for (const [g0, g1] of gaps) {
      const a = g0 - s
      const b = g1 - s
      const next: [number, number][] = []
      for (const [p0, p1] of pieces) {
        if (b <= p0 || a >= p1) next.push([p0, p1])
        else {
          if (a > p0) next.push([p0, a])
          if (b < p1) next.push([b, p1])
        }
      }
      pieces = next
    }
    const ux = (x1 - x0) / L
    const uz = (z1 - z0) / L
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < 0.1) continue
      const startPost = !(i === 0 && p0 < 1e-6 && !ends[0] && !closed)
      const endPost = !(i === P.length - 2 && p1 > L - 1e-6 && !ends[1] && !closed)
      railRun(k, [x0 + ux * p0, y, z0 + uz * p0], [x0 + ux * p1, y, z0 + uz * p1], { ...o, startPost, endPost })
    }
    s += L
  }
}

/** Self-closing swing gate (shown closed) across an opening from hinge point h to latch point e on the walking surface. */
export function gate(k: Kit, h: V3, e: V3, mat: MatKey = 'safetyYellow') {
  const d = new THREE.Vector3(e[0] - h[0], 0, e[2] - h[2])
  const L = d.length()
  d.normalize()
  const at = (s: number, y: number): V3 => [h[0] + d.x * s, h[1] + y, h[2] + d.z * s]
  const g0 = 0.06
  const g1 = L - 0.05
  const r = 0.0169
  // frame: two verticals, top rail, mid rail, diagonal
  for (const s of [g0, g1]) k.rod(mat, at(s, 0.15), at(s, RAIL.top - 0.02), r, 8)
  k.rod(mat, at(g0, RAIL.top - 0.02), at(g1, RAIL.top - 0.02), r, 8)
  k.rod(mat, at(g0, RAIL.knee), at(g1, RAIL.knee), r * 0.9, 8)
  k.rod(mat, at(g0, 0.15), at(g1, 0.15), r * 0.9, 8)
  // hinge barrels with spring housings on the hinge post side
  for (const y of [0.3, 0.9]) {
    k.cyl('galvanised', 0.022, 0.09, at(0.03, y), 'y', 10)
    k.box('galvanised', [0.03, 0.012, 0.03], at(0.045, y))
  }
  k.cyl('nut', 0.026, 0.05, at(0.03, 0.96), 'y', 10)
  // latch stop on the far post
  k.box(mat, [0.05, 0.05, 0.05], at(L - 0.01, RAIL.knee + 0.1))
}

/** Toe plate / coaming only (no rail), a → b at walking-surface level. */
export function toePlate(k: Kit, a: V3, b: V3, h: number = RAIL.toe, mat: MatKey = 'safetyYellow') {
  strip(k, mat, [a[0], a[1] + h / 2, a[2]], [b[0], b[1] + h / 2, b[2]], 0.008, h)
}
