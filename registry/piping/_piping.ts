// Shared piping geometry: port flanges with joint studs, B16.25 bevelled pipe, grid-swept surfaces, ISO 14726 bands, clad insulation, small valves.
import * as THREE from 'three'
import { mat4, type Kit, type MatKey, type Orient, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { textMaterial } from '../lib/textures'
import { GASKET_SPIRAL_WOUND, SERVICE, flange as flangeDims, pipeOD, pipeWall, studLength, type Rating, type Schedule, type Service } from '../lib/standards'

export const GAP = GASKET_SPIRAL_WOUND
/** Radial segments for a size; every lathe and ring sheet of that size uses it so joints share vertices. */
export const SEG = (nps: number) => (nps >= 10 ? 64 : nps >= 4 ? 48 : 32)
export const add = (a: V3, d: V3, s = 1): V3 => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s]
export const neg = (d: V3): V3 => [-d[0], -d[1], -d[2]]

/** Weld end to raised face of a WN flange. */
export function flangeLength(nps: number, rating: Rating) {
  const f = flangeDims(nps, rating)
  return f.hubLength + f.raisedFaceHeight
}

export interface FlangeOpts {
  /** draw the back half of the joint studs and nuts (default true) */
  studs?: boolean
  /** body material for integral cast / forged flanges; default a forged WN flange in flange steel */
  mat?: MatKey
  /** bore radius, m (default: Sch 40 / STD bore of the size) */
  bore?: number
}

/**
 * Weld-neck (or integral) RF flange whose raised face is a port face pointing along `dir`: closed solid with the bore
 * open through, plus the back half of the joint studs and nuts exactly where the plant assembler draws its mating
 * joint. Returns weld-end-to-face length.
 */
export function portFlange(k: Kit, nps: number, rating: Rating, face: V3, dir: V3, o: FlangeOpts = {}) {
  const f = flangeDims(nps, rating)
  const ro = pipeOD(nps) / 2
  const ri = Math.min(o.bore ?? ro - pipeWall(nps, 'STD'), ro - 0.0015)
  const rf = f.raisedFaceHeight
  const L = f.hubLength + rf
  const back = L - rf - f.thickness
  const hubR = Math.max(f.hubDia / 2, ro * 1.05)
  const cast = o.mat !== undefined
  const mat: MatKey = o.mat ?? 'flangeSteel'
  const r0 = cast ? Math.max(ro * 1.08, ri + 0.004) : ro
  const seg = SEG(nps)
  const base = add(face, dir, -L)
  k.lathe(mat, [[ri, 0], [r0, 0], [hubR, Math.max(back - 0.004, back * 0.7)], [hubR + 0.004, back], [f.od / 2, back], [f.od / 2, L - rf], [f.raisedFace / 2, L - rf]], base, dir, seg)
  k.lathe('machined', [[f.raisedFace / 2, L - rf], [f.raisedFace / 2, L], [ri, L]], base, dir, seg)
  k.lathe('pipeBore', [[ri, L], [ri, 0]], base, dir, seg)
  if (o.studs !== false) {
    const half = studLength(nps, rating) / 2
    k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, add(face, dir, GAP / 2 - half), dir, f.boltDia, half, [f.boltDia * 0.6])
  }
  return L
}

/** Bore radius of a pipe size and schedule. */
export const boreOf = (nps: number, schedule: Schedule) => pipeOD(nps) / 2 - pipeWall(nps, schedule)

/** Full joint stud set (studs + two nuts each) centred on the gasket plane at `centre`, as the assembler draws it. */
export function jointStuds(k: Kit, nps: number, rating: Rating, centre: V3, dir: V3, studL = studLength(nps, rating)) {
  const f = flangeDims(nps, rating)
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, add(centre, dir, -studL / 2), dir, f.boltDia, studL, [f.boltDia * 0.6, studL - f.boltDia * 0.6])
}

const BEVEL = Math.tan((37.5 * Math.PI) / 180)
export const LAND = 0.0016

/** Axial depth of an ASME B16.25 37.5° weld bevel with a 1.6 mm land. */
export const bevelDepth = (nps: number, schedule: Schedule) => Math.max(0, pipeWall(nps, schedule) - LAND) * BEVEL

/** Straight pipe from `start` along `dir` for length L. Ends: 'bevel' (machined B16.25 prep), 'square' (closed wall end) or 'open' (no end face, for joints). */
export type PipeEnd = 'bevel' | 'square' | 'open'
export function straight(k: Kit, mat: MatKey, start: V3, dir: V3, L: number, nps: number, schedule: Schedule, endA: PipeEnd = 'square', endB: PipeEnd = 'square', seg = SEG(nps)) {
  if (L <= 1e-5) return
  const ro = pipeOD(nps) / 2
  const ri = ro - pipeWall(nps, schedule)
  const h = Math.min(bevelDepth(nps, schedule), L / 3)
  const hA = endA === 'bevel' ? h : 0
  const hB = endB === 'bevel' ? h : 0
  k.lathe(mat, [[ro, hA], [ro, L - hB]], start, dir, seg)
  if (hA) k.lathe('machined', [[ri, 0], [ri + LAND, 0], [ro, hA]], start, dir, seg)
  else if (endA === 'square') k.lathe(mat, [[ri, 0], [ro, 0]], start, dir, seg)
  if (hB) k.lathe('machined', [[ro, L - hB], [ri + LAND, L], [ri, L]], start, dir, seg)
  else if (endB === 'square') k.lathe(mat, [[ro, L], [ri, L]], start, dir, seg)
  k.lathe('pipeBore', [[ri, L], [ri, 0]], start, dir, seg)
}

/**
 * Quad mesh from rows of points P[i][j]. With `normal`, normals are analytic and the winding follows them;
 * otherwise `out` (a rough outward direction) picks the winding and normals are computed.
 */
export function sheet(k: Kit, mat: MatKey, P: V3[][], normal?: (i: number, j: number) => V3, out?: (i: number, j: number) => V3) {
  const nr = P.length
  const nc = P[0].length
  const pos: number[] = []
  const nor: number[] = []
  for (let i = 0; i < nr; i++)
    for (let j = 0; j < nc; j++) {
      pos.push(...P[i][j])
      if (normal) nor.push(...normal(i, j))
    }
  const V = (q: V3) => new THREE.Vector3(...q)
  let sign = 0
  for (let i = 0; i < nr - 1 && !sign; i++)
    for (let j = 0; j < nc - 1 && !sign; j++) {
      const a = V(P[i][j])
      const n = V(P[i + 1][j]).sub(a).cross(V(P[i][j + 1]).sub(a))
      if (n.lengthSq() < 1e-14) continue
      const ref = normal?.(i, j) ?? out?.(i, j)
      sign = !ref || n.dot(V(ref)) >= 0 ? 1 : -1
    }
  const idx: number[] = []
  for (let i = 0; i < nr - 1; i++)
    for (let j = 0; j < nc - 1; j++) {
      const a = i * nc + j
      const b = a + nc
      const c = a + 1
      const d = b + 1
      if (sign >= 0) idx.push(a, b, c, b, d, c)
      else idx.push(a, c, b, b, c, d)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  if (normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  if (!normal) g.computeVertexNormals()
  k.add(mat, g)
}

/** Circumferential butt weld cap: slightly proud bead. */
export function buttWeld(k: Kit, nps: number, pos: V3, dir: V3) {
  const r = pipeOD(nps) / 2
  const w = Math.max(0.006, Math.min(0.02, pipeWall(nps, 'STD') * 1.6))
  k.torus('flangeSteel', r + 0.0006, w / 2, pos, dir, 6, nps >= 6 ? 48 : 32)
}

/**
 * Surface swept as a grid: f(s, phi) returns a local point (s along +Y from 0 to 1, phi around); x = .. sin(phi), z = .. cos(phi)
 * keeps the same handedness as a lathe so normals face out. Placed at `pos` with local +Y on `axis`.
 */
export function gridSurface(k: Kit, mat: MatKey, f: (s: number, phi: number) => V3, nu: number, nv: number, pos: V3 = [0, 0, 0], axis: Orient = 'y', inward = false) {
  const p: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const q = f(i / nu, (j / nv) * Math.PI * 2)
      p.push(q[0], q[1], q[2])
      uv.push(j / nv, i / nu)
    }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j
      const b = a + nv + 1
      if (inward) idx.push(a, b, a + 1, b, b + 1, a + 1)
      else idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // weld the seam normals (phi = 0 and 2π are duplicate vertices)
  const n = g.getAttribute('normal') as THREE.BufferAttribute
  const t = new THREE.Vector3()
  for (let i = 0; i <= nu; i++) {
    const a = i * (nv + 1)
    const b = a + nv
    t.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize()
    n.setXYZ(a, t.x, t.y, t.z)
    n.setXYZ(b, t.x, t.y, t.z)
  }
  k.add(mat, g, mat4(pos, axis))
}

/** ISO 14726 identification band (basic colour) around a pipe of outer radius r. */
export function serviceBand(k: Kit, service: Service, pos: V3, dir: V3, r: number) {
  const w = Math.min(0.15, Math.max(0.05, r * 1.6 + 0.02))
  k.cyl(paint(SERVICE[service].band), r + 0.0012, w, pos, dir, 40, undefined, true)
  return w
}

/** typical: insulation thickness for hot / personnel-protection service, m. */
export const insulationThickness = (nps: number) => (nps <= 2 ? 0.04 : nps <= 6 ? 0.05 : nps <= 12 ? 0.065 : 0.075)

/**
 * Aluminium-jacketed insulation from `start` along `dir` for length L on pipe NPS `nps`: bevelled weather end caps,
 * 0.9 m sheet laps and stainless bands at 229 mm. Returns the jacket radius.
 */
export function cladding(k: Kit, start: V3, dir: V3, L: number, nps: number) {
  const ro = pipeOD(nps) / 2
  const R = ro + insulationThickness(nps)
  const cap = Math.min(insulationThickness(nps) * 0.9, L / 4)
  if (L < 2 * cap + 0.02) return R
  k.lathe('insulation', [[ro + 0.001, 0], [R, cap], [R, L - cap], [ro + 0.001, L]], start, dir, 48)
  const at = (s: number) => add(start, dir, s)
  for (let s = 0.9; s < L - cap - 0.05; s += 0.9) k.cyl('insulation', R + 0.0009, 0.05, at(s), dir, 48, undefined, true)
  // bands at most 229 mm (9 in) on centre
  const n = Math.max(1, Math.ceil((L - 2 * cap) / 0.229))
  for (let i = 0; i <= n; i++) {
    const s = cap + 0.04 + ((L - 2 * cap - 0.08) * i) / n
    k.cyl('stainless', R + 0.0016, 0.019, at(s), dir, 48, undefined, true)
  }
  return R
}

/** Small quarter-turn ball valve centred at `pos`, bore along `dir`, lever lying along `lever` (unit, not parallel to dir). */
export function smallBallValve(k: Kit, nps: number, pos: V3, dir: V3, lever: V3, leverMat: MatKey = 'actuatorRed', bodyMat: MatKey = 'stainless') {
  const d = pipeOD(nps)
  const L = d * 2.6
  const D = new THREE.Vector3(...dir).normalize()
  const up = new THREE.Vector3(...lever).normalize()
  const stem = new THREE.Vector3().crossVectors(up, D).normalize()
  const S = stem.toArray() as V3
  k.cyl(bodyMat, d * 0.62, L * 0.55, pos, dir, 16)
  k.sphere(bodyMat, d * 0.85, pos, undefined, 16)
  for (const s of [-1, 1]) k.hex(bodyMat, d * 1.5, L * 0.22, add(pos, dir, (s * L) / 2 - s * L * 0.11), dir)
  const top = add(pos, S, d * 1.15)
  k.rod(bodyMat, add(pos, S, d * 0.6), top, d * 0.18, 8)
  k.hex('nut', d * 0.5, d * 0.25, top, S)
  const ll = Math.max(0.1, d * 4.5)
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(up, stem, up.clone().cross(stem)))
  k.box(leverMat, [ll, d * 0.12, d * 0.4], add(add(top, S, d * 0.18), [up.x, up.y, up.z], ll / 2 - d * 0.2), q)
  return L
}

/** ASME B16.20 spiral-wound gasket (approx dims): inner ring, 316L / graphite winding, colour-coded centring ring against the studs. */
export function spiralWound(k: Kit, nps: number, rating: Rating, centre: V3, dir: V3) {
  const f = flangeDims(nps, rating)
  const ro = pipeOD(nps) / 2
  const wi = ro + 0.003
  const wo = f.raisedFace / 2 - 0.0015
  const co = f.boltCircle / 2 - f.boltDia / 2 - 0.001
  const t = 0.0032
  const ring = (mat: MatKey, r0: number, r1: number, h: number) => k.lathe(mat, [[r0, -h / 2], [r1, -h / 2], [r1, h / 2], [r0, h / 2], [r0, -h / 2]], centre, dir, 48)
  ring('stainless', ro * 0.94, wi, t)
  ring('gasket', wi, wo, GAP)
  ring('galvanised', wo, co, t)
  // periphery colour code: continuous green (316L winding) with grey stripes (flexible graphite filler)
  k.cyl(paint('#2f8f46'), co + 0.0004, t * 0.9, centre, dir, 48, undefined, true)
  const d = new THREE.Vector3(...dir).normalize()
  const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(d, ref).normalize()
  const w = new THREE.Vector3().crossVectors(d, u)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const p = new THREE.Vector3(...centre).addScaledVector(u, Math.cos(a) * (co + 0.0008)).addScaledVector(w, Math.sin(a) * (co + 0.0008))
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)), d.clone().cross(u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)))))
    k.box(paint('#5a5d60'), [t * 0.95, 0.001, 0.012], p.toArray() as V3, q)
  }
}

/** Laminated joint tag cable-tied to the outermost stud on the +Z side, hanging past the nut. */
export function jointTag(k: Kit, nps: number, rating: Rating, tag: string, studL = studLength(nps, rating)) {
  const f = flangeDims(nps, rating)
  let best = 0
  let bz = -1
  for (let i = 0; i < f.bolts; i++) {
    const a = Math.PI / f.bolts + (i / f.bolts) * Math.PI * 2
    if (Math.cos(a) > bz) [bz, best] = [Math.cos(a), a]
  }
  const R = f.boltCircle / 2
  const y = -Math.sin(best) * R
  const z = Math.cos(best) * R
  const x = studL / 2 - f.boltDia * 0.1
  k.torus('rubberBlack', f.boltDia * 0.62, 0.0012, [x, y, z], 'x', 4, 16)
  const q = new THREE.Quaternion()
  const p: V3 = [x + 0.001, y - f.boltDia * 0.6 - 0.025, z + f.boltDia * 0.2]
  k.box('plasticGrey', [0.0015, 0.05, 0.034], p, q)
  k.plane(textMaterial(tag, '#f4c400', '#111111', 256, 128), 0.032, 0.046, [p[0] + 0.0009, p[1], p[2]], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
}

export interface Ring {
  c: V3
  e1: V3
  e2: V3
  r: number
}

/** Sheet through rings: point = c + r (cos a e1 + sin a e2) for each angle a. Radial normals, or computed with `out` picking the winding. */
export function ringSheet(k: Kit, mat: MatKey, rings: Ring[], angles: number[], normals: 'out' | 'in' | 'computed', out?: V3) {
  const P = rings.map((g) => angles.map((a) => [0, 1, 2].map((i) => g.c[i] + g.r * (Math.cos(a) * g.e1[i] + Math.sin(a) * g.e2[i])) as V3))
  const rad = (i: number, j: number): V3 => {
    const g = rings[i]
    const a = angles[j]
    const sg = normals === 'in' ? -1 : 1
    return [0, 1, 2].map((q) => sg * (Math.cos(a) * g.e1[q] + Math.sin(a) * g.e2[q])) as V3
  }
  if (normals === 'computed') sheet(k, mat, P, undefined, (i, j) => (out ? add(out, rad(i, j), 0.3) : rad(i, j)))
  else sheet(k, mat, P, rad)
}

/** Uniform angles 0…2π for n segments. */
export const turn = (n: number) => Array.from({ length: n + 1 }, (_, j) => (j / n) * Math.PI * 2)

/**
 * B16.25 weld prep on a ring-sampled end: bevel from the outer skin at `inner` (h back from the face) to the land at
 * the face `c`, then the land down to the bore. t points out of the end.
 */
export function bevelEnd(k: Kit, c: V3, t: V3, e1: V3, e2: V3, ro: number, ri: number, h: number, angles: number[]) {
  const back = add(c, t, -h)
  ringSheet(k, 'machined', [{ c: back, e1, e2, r: ro }, { c, e1, e2, r: ri + LAND }], angles, 'computed', t)
  ringSheet(k, 'machined', [{ c, e1, e2, r: ri + LAND }, { c, e1, e2, r: ri }], angles, 'computed', t)
}

export interface Hole {
  /** half-width of the hole edge across the shell (z) */
  A: number
  /** half-length of the hole edge along the shell (x) */
  B: number
}

const NH = 24
/** Angles shared by holed shells and the nozzles that fit them (2·NH + 1 samples from -π/2). */
export const nozzleAngles = Array.from({ length: 2 * NH + 1 }, (_, j) => -Math.PI / 2 + (j * Math.PI) / NH)
const ysq = (R: number, z: number) => Math.sqrt(Math.max(R * R - z * z, 0))

/**
 * Cylinder of radius R along local X from x0 to x1 with optional holes centred at x = 0 on +Y (top) and -Y (bottom).
 * Hole edge: (B cos φ, ±√(R² − z²), z = ±A sin φ). Points are (x, R cos θ, R sin θ); returns the row angles θ.
 */
export function holedShell(k: Kit, mat: MatKey, R: number, x0: number, x1: number, top: Hole | null, bottom: Hole | null, outward: boolean) {
  const rows: { th: number; xb: number }[] = []
  const band = (h: Hole | null, c: number) => {
    if (!h) return void rows.push({ th: c, xb: 0 })
    for (let j = 0; j <= NH; j++) rows.push({ th: c + Math.asin((h.A * Math.sin(nozzleAngles[j])) / R), xb: h.B * Math.cos(nozzleAngles[j]) })
  }
  const fill = (a: number, b: number, n: number) => {
    for (let i = 1; i < n; i++) rows.push({ th: a + ((b - a) * i) / n, xb: 0 })
  }
  const t1 = top ? Math.asin(Math.min(top.A / R, 1)) : 0
  const t2 = bottom ? Math.asin(Math.min(bottom.A / R, 1)) : 0
  band(top, 0)
  fill(t1, Math.PI - t2, 20)
  band(bottom, Math.PI)
  fill(Math.PI + t2, 2 * Math.PI - t1, 20)
  rows.push({ ...rows[0], th: rows[0].th + 2 * Math.PI })
  const pt = (x: number, th: number): V3 => [x, R * Math.cos(th), R * Math.sin(th)]
  const sg = outward ? 1 : -1
  const n = (i: number): V3 => [0, sg * Math.cos(rows[i].th), sg * Math.sin(rows[i].th)]
  sheet(k, mat, rows.map((r) => [pt(Math.max(r.xb, 0), r.th), pt(x1, r.th)]), (i) => n(i))
  sheet(k, mat, rows.map((r) => [pt(x0, r.th), pt(-Math.max(r.xb, 0), r.th)]), (i) => n(i))
  return rows.map((r) => r.th)
}

/** Nozzle skin of radius r (= hole A = B) from its intersection with a shell of radius R out to |y| = yEnd, on side ±1 of a holedShell. */
export function nozzleSkin(k: Kit, mat: MatKey, R: number, r: number, side: 1 | -1, yEnd: number, outward: boolean) {
  const base = nozzleAngles.map((f) => [r * Math.cos(f), side * ysq(R, r * Math.sin(f)), side * r * Math.sin(f)] as V3)
  const end = nozzleAngles.map((f) => [r * Math.cos(f), side * yEnd, side * r * Math.sin(f)] as V3)
  const sg = outward ? 1 : -1
  sheet(k, mat, [base, end], (_, j) => [sg * Math.cos(nozzleAngles[j]), 0, sg * side * Math.sin(nozzleAngles[j])])
}
