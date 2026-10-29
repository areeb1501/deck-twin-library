// Shared machinery parts for compressor, turbine and generator packages: base frames, louvres, doors, valves, gearboxes, lube consoles, fans.
import * as THREE from 'three'
import { Kit, eul, latheCrisp, mat4, orientQuat, uvScale, type MatKey, type V3 } from '../lib/kit'
import { flange, gauge, pipeRun } from '../lib/parts'
import { fanRotor, type RotorSpec } from '../lib/rotors'
import { paint } from '../lib/materials'
import { fanGuardMaterial, meshGuardMaterial, signMaterial } from '../lib/textures'
import { elbow90, flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const UP = new THREE.Vector3(0, 1, 0)
export type Face = 'x' | '-x' | 'z' | '-z'
/** Quaternion taking a face frame (x along the face, y up, z outward) onto the outward normal. */
export const faceQ = (f: Face) => new THREE.Quaternion().setFromAxisAngle(UP, f === 'z' ? 0 : f === '-z' ? Math.PI : f === 'x' ? Math.PI / 2 : -Math.PI / 2)

export const SKID: MatKey = 'equipmentPaintDark'
export const OIL: MatKey = 'machineryGreen'
export const screen = () => paint('#2c3034', { metalness: 0.4, roughness: 0.6, clearcoat: 0 })

/** Light solid pipe along an orthogonal polyline with swept bends (small-bore services, no flanges). */
export function lineRun(k: Kit, pts: V3[], nps: number, mat: MatKey = 'pipePaint') {
  const r = pipeOD(nps) / 2
  const radial = nps >= 3 ? 16 : 12
  const P = pts.map((p) => new THREE.Vector3(...p))
  let cur = P[0].clone()
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1]
    const b = P[i]
    if (i === P.length - 1) {
      k.rod(mat, cur.toArray() as V3, b.toArray() as V3, r, radial)
      break
    }
    const c = P[i + 1]
    const rb = Math.min(elbow90(Math.max(nps, 0.5)), a.distanceTo(b) * 0.45, b.distanceTo(c) * 0.45)
    const p1 = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(rb))
    const p2 = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(rb))
    if (cur.distanceTo(p1) > 1e-4) k.rod(mat, cur.toArray() as V3, p1.toArray() as V3, r, radial)
    if (rb > 1e-4) k.add(mat, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2), 6, r, radial, false))
    cur = p2
  }
}

/** Hollow pipe run ending in a weld-neck flange at `face` (pointing `dir`), with studs. Returns the face. */
export function runToFlange(k: Kit, pts: V3[], face: V3, dir: V3, nps: number, rating: Rating, mat: MatKey = 'pipePaint', cap = true) {
  const L = flange(k, nps, rating, face, dir, true)
  const end: V3 = [face[0] - dir[0] * L, face[1] - dir[1] * L, face[2] - dir[2] * L]
  if (pts.length) {
    pipeRun(k, [...pts, end], nps, { mat })
    const n = new THREE.Vector3(...pts[0]).sub(new THREE.Vector3(...(pts[1] ?? end))).normalize()
    if (cap) k.disc('pipeBore', pipeOD(nps) / 2 - pipeWall(nps) + 0.001, pts[0], n.negate().toArray() as V3, 20)
  }
  return face
}

/** Flanged nozzle neck from a base point on a casing straight out to the face; the bore is closed deep inside by a dark cap. */
export function neckTo(k: Kit, base: V3, face: V3, dir: V3, nps: number, rating: Rating, mat: MatKey, cap = true) {
  const L = flange(k, nps, rating, face, dir, true)
  k.pipe(mat, base, [face[0] - dir[0] * L, face[1] - dir[1] * L, face[2] - dir[2] * L], pipeOD(nps), pipeWall(nps, '80'))
  if (cap) k.disc('pipeBore', pipeOD(nps) / 2 - pipeWall(nps, '80') + 0.001, [base[0] + dir[0] * 0.002, base[1] + dir[1] * 0.002, base[2] + dir[2] * 0.002], dir, 24)
}

/** Ring (annulus) between radii rIn and rOut, length h centred on pos along axis: no faces cross the bore. */
export function annulus(k: Kit, mat: MatKey, rIn: number, rOut: number, h: number, pos: V3, axis: V3 | 'x' | 'y' | 'z', seg = 32) {
  const a = typeof axis === 'string' ? ({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as Record<string, V3>)[axis] : axis
  const p0: V3 = [pos[0] - (a[0] * h) / 2, pos[1] - (a[1] * h) / 2, pos[2] - (a[2] * h) / 2]
  k.add(mat, latheCrisp([[rIn, 0], [rOut, 0], [rOut, h], [rIn, h], [rIn, 0]], seg), mat4(p0, a))
}

/** Bolted flange pair with a ring gasket (open bore) and studs, centred on pos. */
export function joint(k: Kit, nps: number, rating: Rating, pos: V3, axis: V3 | 'x' | 'y' | 'z') {
  const a = typeof axis === 'string' ? ({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as Record<string, V3>)[axis] : axis
  const f = flangeDims(nps, rating)
  const g = 0.0045
  const at = (d: number): V3 => [pos[0] + a[0] * d, pos[1] + a[1] * d, pos[2] + a[2] * d]
  flange(k, nps, rating, at(-g / 2), a)
  flange(k, nps, rating, at(g / 2), [-a[0], -a[1], -a[2]])
  annulus(k, 'gasket', pipeOD(nps) / 2 - pipeWall(nps) * 0.5, f.raisedFace / 2 + 0.006, g, pos, a, 28)
  const span = 2 * (f.thickness + f.raisedFaceHeight) + g
  const studL = span + f.boltDia * 3
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, at(-studL / 2), a, f.boltDia, studL, [f.boltDia * 0.95, studL - f.boltDia * 0.95])
}

/**
 * Hollow run pipe a -> b with a set-on branch at c towards bDir. The run wall has a stepped-circle hole the size of the branch
 * bore, and the branch walls are saddle-cut to sit on the run's outer surface, so both bores read through with no gaps.
 */
export function teePipe(k: Kit, a: V3, b: V3, c: V3, bDir: V3, od: number, wall: number, bod: number, bwall: number, bLen: number, mat: MatKey) {
  const A = new THREE.Vector3(...a)
  const d = new THREE.Vector3(...b).sub(A)
  const L = d.length()
  d.normalize()
  const ro = od / 2
  const ri = ro - wall
  const rbo = Math.min(bod / 2, ro)
  const rbi = Math.max(rbo - bwall, rbo * 0.5)
  const tc = new THREE.Vector3(...c).sub(A).dot(d)
  const q = orientQuat(d.toArray() as V3)
  const lb = new THREE.Vector3(...bDir).applyQuaternion(q.clone().invert())
  const phiB = Math.atan2(lb.x, lb.z)
  const m = mat4(a, d.toArray() as V3)
  const seg = 40
  const ringSeg = (y0: number, y1: number, gap: number) => {
    if (y1 - y0 < 1e-5) return
    const ph0 = phiB + gap
    const phL = Math.PI * 2 - 2 * gap
    k.add(mat, latheCrisp([[ro, y0], [ro, y1]], seg, ph0, phL), m.clone())
    k.add('pipeBore', latheCrisp([[ri, y1], [ri, y0]], seg, ph0, phL), m.clone())
  }
  const t0 = Math.max(0.001, tc - rbi)
  const t1 = Math.min(L - 0.001, tc + rbi)
  k.add(mat, latheCrisp([[ri, 0], [ro, 0], [ro, t0]], seg), m.clone())
  k.add('pipeBore', latheCrisp([[ri, t0], [ri, 0]], seg), m.clone())
  k.add(mat, latheCrisp([[ro, t1], [ro, L], [ri, L]], seg), m.clone())
  k.add('pipeBore', latheCrisp([[ri, L], [ri, t1]], seg), m.clone())
  const N = 12
  for (let j = 0; j < N; j++) {
    const ya = t0 + ((t1 - t0) * j) / N
    const yb = t0 + ((t1 - t0) * (j + 1)) / N
    const w = Math.sqrt(Math.max(0, rbi * rbi - Math.max((ya - tc) ** 2, (yb - tc) ** 2)))
    ringSeg(ya, yb, w > 0 ? Math.asin(Math.min(0.99, w / ro)) : 0)
  }
  // saddle-cut branch: outer and inner walls start on the run's outer surface
  const e1 = d.clone()
  const e2 = new THREE.Vector3(...bDir).normalize()
  const e3 = new THREE.Vector3().crossVectors(e1, e2).normalize()
  const C = A.clone().addScaledVector(d, tc)
  const wallGeo = (r: number, inward: boolean) => {
    const pos: number[] = []
    const nor: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * Math.PI * 2
      const cs = Math.cos(ph)
      const sn = Math.sin(ph)
      const n = e1.clone().multiplyScalar(cs).addScaledVector(e3, sn).multiplyScalar(inward ? -1 : 1)
      const hb = Math.sqrt(Math.max(ro * ro - (r * sn) ** 2, 0)) - 0.0015
      for (const h of [hb, bLen]) {
        const p = C.clone().addScaledVector(e1, r * cs).addScaledVector(e3, r * sn).addScaledVector(e2, h)
        pos.push(p.x, p.y, p.z)
        nor.push(n.x, n.y, n.z)
      }
    }
    for (let i = 0; i < seg; i++) {
      const p0 = i * 2
      if (inward) idx.push(p0, p0 + 2, p0 + 1, p0 + 1, p0 + 2, p0 + 3)
      else idx.push(p0, p0 + 1, p0 + 2, p0 + 1, p0 + 3, p0 + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setIndex(idx)
    return g
  }
  k.add(mat, wallGeo(rbo, false))
  k.add('pipeBore', wallGeo(rbi, true))
  annulus(k, mat, rbi, rbo, 0.002, C.clone().addScaledVector(e2, bLen - 0.001).toArray() as V3, e2.toArray() as V3, seg)
  return C.clone().addScaledVector(e2, bLen).toArray() as V3
}

// ------------------------------------------------------------------ face-frame assemblies (x along face, y up, z outward)

/** Louvre panel centred at (cx, cy). */
export function louvre(k: Kit, w: number, h: number, cx: number, cy: number, frame: MatKey = SKID) {
  k.box(screen(), [w, h, 0.01], [cx, cy, 0.005])
  const fw = 0.05
  for (const s of [-1, 1]) {
    k.box(frame, [w + 2 * fw, fw, 0.12], [cx, cy + s * (h / 2 + fw / 2), 0.06])
    k.box(frame, [fw, h, 0.12], [cx + s * (w / 2 + fw / 2), cy, 0.06])
  }
  const n = Math.max(3, Math.floor(h / 0.09))
  for (let i = 0; i < n; i++) k.box(frame, [w, 0.008, 0.12], [cx, cy - h / 2 + ((i + 0.5) * h) / n, 0.06], eul(0.75, 0, 0))
}

/** Rows of weather hoods over a dark bird screen (filter-house inlet face). */
export function hoods(k: Kit, w: number, h: number, cx: number, cy: number, mat: MatKey) {
  const g = new THREE.PlaneGeometry(w, h)
  uvScale(g, w / 0.12, h / 0.12)
  k.add(meshGuardMaterial('#3a3f44'), g, mat4([cx, cy, 0.005]))
  const rows = Math.max(2, Math.floor(h / 0.42))
  const pitch = h / rows
  const a = 0.55
  const lp = 0.34
  const dz = Math.cos(a) * lp
  const dy = Math.sin(a) * lp
  for (let i = 0; i < rows; i++) {
    const yt = cy - h / 2 + (i + 1) * pitch
    k.box(mat, [w, 0.012, lp], [cx, yt - dy / 2, dz / 2], eul(a, 0, 0))
    k.box(mat, [w, 0.05, 0.012], [cx, yt - dy - 0.02, dz])
    for (const s of [-1, 1]) k.box(mat, [0.012, dy, dz], [cx + s * (w / 2), yt - dy / 2, dz / 2])
  }
  const nm = Math.max(1, Math.round(w / 1.4))
  for (let j = 1; j < nm; j++) k.box(mat, [0.012, h, dz], [cx - w / 2 + (j * w) / nm, cy, dz / 2])
}

/** Personnel door (single or double leaf), sill at y = 0: frame, leaves (swung open by `open` rad), handles, vision panels, signs. */
export function door(k: Kit, w: number, h: number, cx: number, double: boolean, leaf: MatKey, frame: MatKey = SKID, open = 0) {
  k.box(frame, [w + 0.14, 0.07, 0.05], [cx, h + 0.035, 0.025])
  for (const s of [-1, 1]) k.box(frame, [0.07, h, 0.05], [cx + s * (w / 2 + 0.035), h / 2, 0.025])
  k.box(frame, [w, 0.03, 0.12], [cx, 0.015, 0.06])
  const leaves = double ? 2 : 1
  const lw = w / leaves
  for (let i = 0; i < leaves; i++) {
    const lx = cx - w / 2 + lw * (i + 0.5)
    const latch = double ? (i === 0 ? 1 : -1) : 1
    const hingeX = lx - latch * (lw / 2)
    for (const yy of [0.2, h / 2, h - 0.2]) k.cyl(frame, 0.018, 0.12, [hingeX - latch * 0.01, yy, 0.06], 'y', 8)
    const m = new THREE.Matrix4().makeTranslation(hingeX, 0, 0.06).multiply(new THREE.Matrix4().makeRotationY(-latch * open)).multiply(new THREE.Matrix4().makeTranslation(-hingeX, 0, -0.06))
    k.with(m, () => {
      k.box(leaf, [lw - 0.012, h - 0.012, 0.05], [lx, h / 2, 0.03])
      for (const yy of [0.35, 0.7]) k.box(leaf, [lw - 0.18, 0.035, 0.012], [lx, h * yy, 0.06])
      const hx = lx + latch * (lw / 2 - 0.1)
      k.box('stainless', [0.04, 0.14, 0.02], [hx, 1.05, 0.065])
      k.box('stainless', [0.14, 0.022, 0.024], [hx - latch * 0.06, 1.08, 0.088])
      k.box('stainless', [0.03, 0.18, 0.02], [hx, 1.05, -0.005])
      for (const yy of [0.2, h / 2, h - 0.2]) k.box(leaf, [0.1, 0.06, 0.012], [hingeX + latch * 0.05, yy, 0.058])
      k.box('glass', [0.22, 0.3, 0.052], [lx, Math.min(1.6, h - 0.35), 0.03])
      k.plane(signMaterial('noentry'), 0.36, 0.18, [lx, Math.min(1.32, h - 0.65), 0.0565])
    })
  }
}

export function gasDetector(k: Kit, p: V3) {
  k.rbox('stainless', [0.12, 0.14, 0.08], 0.01, p)
  k.cyl('actuatorYellow', 0.035, 0.11, [p[0], p[1] - 0.12, p[2]], 'y', 14)
  k.cyl('castIron', 0.042, 0.03, [p[0], p[1] - 0.19, p[2]], 'y', 14)
}

export function beacon(k: Kit, p: V3) {
  k.box(SKID, [0.12, 0.04, 0.12], p)
  k.cyl('actuatorRed', 0.045, 0.08, [p[0], p[1] + 0.06, p[2]], 'y', 14)
  k.dome('glass', 0.045, [p[0], p[1] + 0.1, p[2]], 'y', Math.PI / 2, 1.2, 14)
}

// ------------------------------------------------------------------ in-line valves on a pipe along X

export function ballValve(k: Kit, x: number, y: number, z: number, nps: number, rating: Rating) {
  const od = pipeOD(nps)
  const L = Math.max(0.24, od * 3.2)
  k.sphere('valveBody', od * 1.0, [x, y, z], undefined, 18)
  annulus(k, 'valveBody', od / 2, od * 0.75, L * 0.8, [x, y, z], 'x', 24)
  joint(k, nps, rating, [x - L / 2, y, z], 'x')
  joint(k, nps, rating, [x + L / 2, y, z], 'x')
  const ya = y + od
  k.cyl('valveBody', od * 0.35, 0.1, [x, ya + 0.05, z], 'y', 12)
  k.rbox('actuatorYellow', [0.16, 0.14, 0.14], 0.02, [x, ya + 0.17, z])
  k.cyl('actuatorYellow', 0.065, 0.32, [x + 0.2, ya + 0.17, z], 'x', 16)
  k.rbox('stainless', [0.08, 0.07, 0.06], 0.01, [x - 0.04, ya + 0.28, z])
  return L
}

/** Globe control valve on a pipe along X; `through` draws the body bore when no pipe runs through it. */
export function controlValve(k: Kit, x: number, y: number, z: number, nps: number, rating: Rating, act: MatKey = 'actuatorBlue', through = false) {
  const od = pipeOD(nps)
  const L = Math.max(0.3, od * 3.6)
  k.sphere('valveBody', od * 1.2, [x, y, z], [1.25, 1, 1], 18)
  annulus(k, 'valveBody', od / 2, od * 0.7, L * 0.8, [x, y, z], 'x', 24)
  joint(k, nps, rating, [x - L / 2, y, z], 'x')
  joint(k, nps, rating, [x + L / 2, y, z], 'x')
  if (through) k.pipe('valveBody', [x - L / 2, y, z], [x + L / 2, y, z], od, pipeWall(nps))
  const yb = y + od * 1.15
  k.cyl('valveBody', od * 0.5, 0.12, [x, yb + 0.06, z], 'y', 14)
  for (const s of [-1, 1]) k.rod('valveBody', [x, yb + 0.12, z + s * 0.05], [x, yb + 0.33, z + s * 0.05], 0.012, 6)
  const r = clamp(0.1 + od, 0.15, 0.32)
  const yd = yb + 0.33 + r * 0.25
  k.cyl(act, r, 0.05, [x, yd, z], 'y', 24)
  k.dome(act, r, [x, yd + 0.025, z], 'y', Math.PI / 2, 0.35, 20)
  k.dome(act, r, [x, yd - 0.025, z], '-y', Math.PI / 2, 0.25, 20)
  k.rbox('stainless', [0.1, 0.12, 0.07], 0.01, [x + r * 0.8, yd - 0.15, z])
  return L
}

// ------------------------------------------------------------------ base frame

/** Deep fabricated base frame: four longitudinal I-beams, cross members, drip-pan deck (top at y = hs), upstand, padeyes, drain, earth boss. */
export function baseFrame(k: Kit, SL: number, SW: number, hs: number, o: { upstand?: boolean; drain?: boolean; holes?: { x: number; z: number; w: number }[] } = {}) {
  const holes = o.holes ?? []
  const beam = (x0: number, x1: number, z: number) => {
    const L = x1 - x0
    const xm = (x0 + x1) / 2
    k.box(SKID, [L, 0.03, 0.3], [xm, 0.015, z])
    k.box(SKID, [L, 0.03, 0.3], [xm, hs - 0.027, z])
    k.box(SKID, [L, hs - 0.072, 0.018], [xm, hs / 2 - 0.006, z])
  }
  for (const z of [-SW / 2 + 0.15, -SW * 0.2, SW * 0.2, SW / 2 - 0.15]) beam(-SL / 2, SL / 2, z)
  const nCross = Math.max(3, Math.round(SL / 1.6))
  for (let i = 0; i <= nCross; i++) {
    const x = -SL / 2 + 0.01 + (i * (SL - 0.02)) / nCross
    if (holes.some((h) => Math.abs(x - h.x) < h.w / 2 + 0.03)) continue
    k.box(SKID, [0.018, hs - 0.07, SW - 0.3], [x, hs / 2 - 0.006, 0])
  }
  // drip-pan deck, cut around deck openings (nozzles passing through the skid) with trimmers and coamings
  let xa = -SL / 2
  for (const h of [...holes].sort((a, b) => a.x - b.x)) {
    const h0 = h.x - h.w / 2
    const h1 = h.x + h.w / 2
    if (h0 > xa) k.box('deckPlate', [h0 - xa, 0.012, SW], [(xa + h0) / 2, hs - 0.006, 0])
    for (const [z0, z1] of [[-SW / 2, h.z - h.w / 2], [h.z + h.w / 2, SW / 2]]) if (z1 > z0) k.box('deckPlate', [h.w, 0.012, z1 - z0], [h.x, hs - 0.006, (z0 + z1) / 2])
    for (const s of [-1, 1]) {
      k.box(SKID, [0.018, hs - 0.07, SW - 0.3], [h.x + s * (h.w / 2 + 0.01), hs / 2 - 0.006, 0])
      k.box(SKID, [h.w + 0.03, 0.08, 0.012], [h.x, hs + 0.03, h.z + s * (h.w / 2 + 0.006)])
      k.box(SKID, [0.012, 0.08, h.w], [h.x + s * (h.w / 2 + 0.006), hs + 0.03, h.z])
    }
    xa = Math.max(xa, h1)
  }
  if (SL / 2 > xa) k.box('deckPlate', [SL / 2 - xa, 0.012, SW], [(xa + SL / 2) / 2, hs - 0.006, 0])
  if (o.upstand !== false)
    for (const s of [-1, 1]) {
      k.box(SKID, [SL, 0.1, 0.012], [0, hs + 0.02, s * (SW / 2 - 0.006)])
      k.box(SKID, [0.012, 0.1, SW], [s * (SL / 2 - 0.006), hs + 0.02, 0])
    }
  if (o.drain !== false) lineRun(k, [[-SL / 2 + 0.35, hs - 0.02, SW / 2 - 0.35], [-SL / 2 + 0.35, 0.12, SW / 2 - 0.35], [-SL / 2 - 0.08, 0.12, SW / 2 - 0.35]], 2, SKID)
  if (o.drain !== false) k.cyl('flangeSteel', 0.075, 0.02, [-SL / 2 - 0.08, 0.12, SW / 2 - 0.35], 'x', 20)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const px = sx * (SL / 2 - Math.min(1.1, SL * 0.12))
      k.box(SKID, [0.34, 0.26, 0.04], [px, hs * 0.5, sz * (SW / 2 + 0.02)])
      k.torus('nut', 0.07, 0.02, [px, hs * 0.5 + 0.03, sz * (SW / 2 + 0.045)], 'z', 6, 18)
    }
  k.box('brass', [0.12, 0.08, 0.02], [SL / 2 - 0.5, hs * 0.5, SW / 2 + 0.01])
}

// ------------------------------------------------------------------ rotating auxiliaries

/** Vertical TEFC motor on a pump head, flange at y. */
export function verticalMotorPump(k: Kit, x: number, y: number, z: number, r = 0.13) {
  k.cyl(OIL, r * 0.75, r * 1.2, [x, y + r * 0.6, z], 'y', 20)
  k.cyl(OIL, r * 0.9, 0.03, [x, y + r * 1.2, z], 'y', 20)
  const yb = y + r * 1.22
  k.cyl('motorPaint', r, r * 2.9, [x, yb + r * 1.45, z], 'y', 24)
  for (let f = 0; f < 12; f++) {
    const a = (f / 12) * Math.PI * 2
    k.box('motorPaint', [0.01, r * 2.5, 0.025], [x + Math.cos(a) * (r + 0.006), yb + r * 1.45, z + Math.sin(a) * (r + 0.006)], new THREE.Quaternion().setFromAxisAngle(UP, -a))
  }
  k.cyl('motorPaint', r * 1.12, r * 0.75, [x, yb + r * 3.25, z], 'y', 24, r * 0.9)
  k.disc(fanGuardMaterial(), r * 0.9, [x, yb + r * 3.63, z], 'y', 24)
  k.rbox('motorPaint', [r * 1.1, r * 0.9, r * 0.8], 0.015, [x, yb + r * 1.6, z + r + r * 0.35])
}

export interface LubeOpts {
  x: number
  z: number
  /** reservoir length along X and depth along Z, m */
  L: number
  D: number
  hs: number
  /** oil cooler: fin-fan on a stand above the tank, or twin vertical shell-and-tube */
  cooler?: 'finfan' | 'shell'
  /** underside of the fin-fan stand top */
  coolerY?: number
  /** side carrying the level glass and instruments (+1 = +Z) */
  front?: 1 | -1
}

/** API 614 lube-oil console: reservoir, twin motor pumps, duplex filters with transfer valve, accumulator, heater, coolers. */
export function lubeConsole(k: Kit, o: LubeOpts): RotorSpec[] {
  const { x, z, L, D, hs } = o
  const f = o.front ?? 1
  const tH = clamp(0.55 + L * 0.1, 0.65, 0.95)
  const yt = hs + tH
  const rotors: RotorSpec[] = []
  k.rbox(OIL, [L, tH, D], 0.03, [x, hs + tH / 2, z])
  k.box(OIL, [L - 0.1, 0.03, D - 0.1], [x, yt + 0.015, z])
  const pr = clamp(D * 0.2, 0.09, 0.15)
  const xf = x + L * 0.2
  for (const [i, px] of [x - L * 0.34, x - L * 0.1].entries()) {
    verticalMotorPump(k, px, yt + 0.03, z, pr)
    const yy = yt + 0.25 + i * 0.07
    lineRun(k, [[px + pr * 0.75, yt + 0.12, z], [px + pr * 0.75 + 0.08, yt + 0.12, z], [px + pr * 0.75 + 0.08, yy, z], [xf, yy, z]], 1.5, OIL)
  }
  for (const s of [-1, 1]) {
    const fz = z + s * clamp(D * 0.18, 0.09, 0.2)
    k.cyl(OIL, 0.085, 0.5, [xf, yt + 0.3, fz], 'y', 20)
    k.dome(OIL, 0.085, [xf, yt + 0.55, fz], 'y', Math.PI / 2, 0.5, 16)
    k.cyl(OIL, 0.1, 0.03, [xf, yt + 0.48, fz], 'y', 20)
  }
  k.box('valveBody', [0.12, 0.12, 0.2], [xf, yt + 0.1, z])
  k.rod('handwheel', [xf, yt + 0.16, z], [xf, yt + 0.32, z], 0.012, 6)
  k.box('handwheel', [0.22, 0.02, 0.02], [xf, yt + 0.32, z])
  gauge(k, [xf + 0.14, yt + 0.42, z], 'x', 0.08, 'bar', 10)
  // accumulator, fill breather, heater terminal box, level glass
  k.cyl(OIL, 0.09, 0.45, [x + L * 0.38, yt + 0.25, z - f * D * 0.2], 'y', 18)
  k.dome(OIL, 0.09, [x + L * 0.38, yt + 0.475, z - f * D * 0.2], 'y', Math.PI / 2, 1, 14)
  k.cyl('brass', 0.04, 0.12, [x - L * 0.45, yt + 0.06, z - f * D * 0.25], 'y', 12)
  k.rbox('stainless', [0.25, 0.25, 0.12], 0.02, [x - L / 2 - 0.06, hs + tH * 0.55, z], undefined)
  k.box('stainless', [0.05, tH * 0.7, 0.03], [x + L * 0.4, hs + tH / 2, z + f * (D / 2 + 0.015)])
  k.box('glass', [0.025, tH * 0.6, 0.006], [x + L * 0.4, hs + tH / 2, z + f * (D / 2 + 0.033)])
  if ((o.cooler ?? 'finfan') === 'shell') {
    for (const s of [-1, 1]) {
      const cz = z + s * D * 0.28
      const cx = x + L * 0.42
      k.cyl(OIL, 0.1, 0.8, [cx, yt + 0.45, cz], 'y', 20)
      for (const e of [-1, 1]) k.cyl(OIL, 0.125, 0.04, [cx, yt + 0.45 + e * 0.38, cz], 'y', 20)
      k.dome(OIL, 0.1, [cx, yt + 0.87, cz], 'y', Math.PI / 2, 0.5, 14)
      lineRun(k, [[cx + 0.1, yt + 0.75, cz], [cx + 0.2, yt + 0.75, cz], [cx + 0.2, yt + 0.95, cz]], 1, 'pipePaint')
    }
    return rotors
  }
  const yc0 = Math.max(o.coolerY ?? yt + 1.0, yt + 0.9)
  const cL = L * 0.92
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) k.box('structSteel', [0.08, yc0 - hs, 0.08], [x + sx * (cL / 2 - 0.04), (yc0 + hs) / 2, z + sz * (D / 2 - 0.04)])
  k.box('castIron', [cL - 0.24, 0.16, D], [x, yc0 + 0.08, z])
  for (const s of [-1, 1]) k.box(OIL, [0.12, 0.24, D + 0.04], [x + s * (cL / 2 - 0.06), yc0 + 0.1, z])
  k.box(OIL, [cL, 0.3, D], [x, yc0 + 0.35, z])
  const nf = cL > 2.2 ? 2 : 1
  const fr = Math.min(D / 2 - 0.04, cL / (2 * nf) - 0.06)
  const fan = fanRotor('stainless', fr * 0.93, [0, 0, 0], 'y', 0, { blades: 4, chord: fr * 0.4, pitch: 0.32, hub: fr * 0.2, hubLen: 0.06 })
  for (let i = 0; i < nf; i++) {
    const fx = x - cL / 2 + ((i + 0.5) * cL) / nf
    k.cyl(OIL, fr + 0.02, 0.14, [fx, yc0 + 0.57, z], 'y', 32, undefined, true)
    k.disc(fanGuardMaterial(), fr, [fx, yc0 + 0.64, z], 'y', 32)
    k.cyl('motorPaint', fr * 0.3, 0.22, [fx, yc0 + 0.76, z], 'y', 16)
    k.cyl('motorPaint', 0.025, 0.1, [fx, yc0 + 0.6, z], 'y', 10)
    rotors.push({ ...fan, pos: [fx, yc0 + 0.57, z], rpm: 190 })
  }
  lineRun(k, [[x + L * 0.42, yt, z], [x + L * 0.42, yc0 + 0.1, z], [x + cL / 2 - 0.06, yc0 + 0.1, z]], 2, OIL)
  lineRun(k, [[x - cL / 2 + 0.06, yc0 + 0.1, z - D * 0.25], [x - L * 0.45, yc0 + 0.1, z - D * 0.25], [x - L * 0.45, yt, z - D * 0.25]], 2, OIL)
  return rotors
}

/** Parallel-shaft gearbox between x0 and x1: slow shaft at ySlow (-X side), fast shaft at yFast (+X side), base on y = hs. */
export function gearbox(k: Kit, o: { x0: number; x1: number; ySlow: number; yFast: number; hs: number; W: number; mat?: MatKey }) {
  const { x0, x1, ySlow, yFast, hs, W } = o
  const M = o.mat ?? OIL
  const L = x1 - x0
  const gx = (x0 + x1) / 2
  const yMid = (ySlow + yFast) / 2
  const top = Math.max(ySlow, yFast) + 0.3 + W * 0.12
  k.rbox(M, [L, yMid - hs, W], 0.04, [gx, (yMid + hs) / 2, 0])
  k.rbox(M, [L * 0.94, top - yMid, W * 0.86], Math.min(0.12, L * 0.1), [gx, (yMid + top) / 2, 0])
  k.box(M, [L + 0.08, 0.06, W + 0.08], [gx, yMid, 0])
  const nb = Math.max(4, Math.round(L / 0.16))
  for (let i = 0; i < nb; i++)
    for (const s of [-1, 1]) {
      const bx = x0 + 0.06 + (i * (L - 0.12)) / (nb - 1)
      k.cyl('boltXylan', 0.012, 0.12, [bx, yMid, s * (W / 2 + 0.02)], 'y', 6)
      k.hex('nut', 0.04, 0.02, [bx, yMid + 0.04, s * (W / 2 + 0.02)])
    }
  for (const s of [-1, 1]) for (const fx of [-0.3, 0, 0.3]) k.box(M, [0.03, yMid - hs - 0.06, 0.08], [gx + fx * L, (yMid + hs) / 2, s * (W / 2 + 0.04)])
  // feet on the base
  k.box(M, [L + 0.2, 0.05, W + 0.2], [gx, hs + 0.025, 0])
  k.box(M, [L * 0.45, 0.04, W * 0.4], [gx, top + 0.02, 0])
  k.around(8, Math.min(L, W) * 0.16, [gx, top + 0.045, 0], 'y', (p) => k.hex('nut', 0.03, 0.015, p))
  k.cyl('brass', 0.03, 0.12, [gx + L * 0.3, top + 0.06, W * 0.2], 'y', 10)
  k.cyl('brass', 0.05, 0.015, [gx, yMid - 0.25, W / 2 + 0.01], 'z', 16)
  k.disc('glass', 0.04, [gx, yMid - 0.25, W / 2 + 0.018], 'z', 16)
  k.cyl(M, 0.2, 0.1, [x1 + 0.05, yFast, 0], 'x', 28)
  k.cyl(M, 0.24, 0.1, [x0 - 0.05, ySlow, 0], 'x', 28)
  // vibration probes on the bearing caps
  for (const xx of [x0 + 0.12, x1 - 0.12]) k.rod('stainless', [xx, top, -W * 0.25], [xx, top + 0.1, -W * 0.25], 0.012, 8)
  k.plane(signMaterial('ler', 'GEARBOX'), 0.4, 0.1, [gx, yMid + 0.12, W * 0.43 + 0.001])
}

/** Roof extract fan in a cowl over a damper plate; returns the turning impeller. */
export function roofFan(k: Kit, x: number, z: number, H: number, R: number, mat: MatKey): RotorSpec {
  k.box(mat, [R * 2 + 0.2, 0.25, R * 2 + 0.2], [x, H + 0.125, z])
  k.cyl(mat, R, 0.7, [x, H + 0.6, z], 'y', 32, undefined, true)
  k.disc('castIron', R, [x, H + 0.5, z], 'y', 32)
  k.cyl(mat, R + 0.03, 0.05, [x, H + 0.95, z], 'y', 32, undefined, true)
  k.disc(fanGuardMaterial(), R, [x, H + 0.976, z], 'y', 32)
  k.cyl('motorPaint', R * 0.32, 0.3, [x, H + 0.8, z], 'y', 16)
  k.rbox('stainless', [0.18, 0.2, 0.12], 0.01, [x + R + 0.14, H + 0.35, z])
  return fanRotor('stainless', R * 0.94, [x, H + 0.62, z], 'y', 170, { blades: 6, chord: R * 0.36, pitch: 0.42, hub: R * 0.3, hubLen: 0.1 })
}

/** Large induction motor (box frame, CACA cooler on top, NDE fan hood, sleeve-bearing pedestals, terminal boxes). Frame mB0..mB1 on y = hs, shaft at ym ending at xEnd. */
export function largeMotor(k: Kit, o: { mB0: number; mB1: number; xEnd: number; ym: number; hs: number; mW: number; rpm: number }): RotorSpec {
  const { mB0, mB1, xEnd, ym, hs, mW } = o
  const MOTOR: MatKey = 'motorPaint'
  const mx = (mB0 + mB1) / 2
  const mTop = ym + mW * 0.5
  k.rbox(MOTOR, [mB1 - mB0, mTop - hs - 0.12, mW], 0.06, [mx, (mTop + hs + 0.12) / 2, 0])
  for (let i = 0; i <= 5; i++) for (const sz of [-1, 1]) k.box(MOTOR, [0.05, mTop - hs - 0.2, 0.06], [mB0 + 0.1 + (i * (mB1 - mB0 - 0.2)) / 5, (mTop + hs) / 2, sz * (mW / 2 + 0.02)])
  k.box(SKID, [mB1 - mB0 + 0.2, 0.12, mW + 0.2], [mx, hs + 0.06, 0])
  const cH = clamp(0.4 + mW * 0.18, 0.5, 0.85)
  k.rbox(MOTOR, [(mB1 - mB0) * 0.92, cH, mW * 0.92], 0.05, [mx, mTop + cH / 2, 0])
  for (const sz of [-1, 1])
    for (let i = 0; i < 9; i++) k.box(MOTOR, [(mB1 - mB0) * 0.7, 0.02, 0.04], [mx, mTop + cH * 0.15 + i * (cH * 0.75) / 9, sz * (mW * 0.46 + 0.01)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sz * 0.6))
  const yHood = mTop + cH * 0.5
  const hr = Math.min(mW * 0.32, cH * 0.6)
  k.cyl(MOTOR, hr, 0.4, [mB0 - 0.15, yHood, 0], 'x', 32, undefined, true)
  k.cyl(MOTOR, hr + 0.02, 0.04, [mB0 - 0.33, yHood, 0], 'x', 32, undefined, true)
  k.disc('rubberBlack', hr, [mB0 - 0.2, yHood, 0], '-x', 32)
  k.disc(fanGuardMaterial(), hr, [mB0 - 0.352, yHood, 0], '-x', 32)
  k.cyl('stainless', 0.04, 0.12, [mB0 - 0.24, yHood, 0], 'x', 12)
  const fan = fanRotor('flangeSteel', hr * 0.9, [mB0 - 0.29, yHood, 0], 'x', o.rpm, { blades: 7, chord: hr * 0.28, pitch: 0.3, hub: hr * 0.22, hubLen: 0.05 })
  for (const sx of [mB0 + 0.2, mB1 - 0.2]) for (const sz of [-1, 1]) k.torus('nut', 0.06, 0.018, [sx, mTop + cH + 0.04, sz * mW * 0.4], 'x', 6, 16)
  for (const xbp of [mB1 + 0.22, mB0 - 0.22]) {
    k.rbox(MOTOR, [0.4, ym - hs + 0.25, 0.7], 0.04, [xbp, (ym + 0.25 + hs) / 2, 0])
    k.cyl(MOTOR, 0.26, 0.42, [xbp, ym, 0], 'x', 32)
    k.cyl('brass', 0.045, 0.02, [xbp, ym - 0.1, 0.36], 'z', 16)
    k.disc('glass', 0.035, [xbp, ym - 0.1, 0.371], 'z', 16)
    lineRun(k, [[xbp, ym + 0.26, 0], [xbp, ym + 0.45, 0], [xbp, ym + 0.45, -mW / 2 - 0.1], [xbp, hs + 0.15, -mW / 2 - 0.1]], 1, OIL)
  }
  k.cyl('stainless', 0.11, xEnd - mB1 - 0.4, [(mB1 + 0.4 + xEnd) / 2, ym, 0], 'x', 20)
  const tz = mW / 2
  const ty = (hs + mTop) / 2
  k.rbox(MOTOR, [1.1, 0.8, 0.4], 0.04, [mx + 0.3, ty + 0.05, tz + 0.2])
  k.rbox(MOTOR, [0.5, 0.5, 0.3], 0.04, [mx - 0.8, ty, tz + 0.15])
  k.plane(signMaterial('hv'), 0.4, 0.2, [mx + 0.3, ty + 0.25, tz + 0.401])
  for (let i = 0; i < 3; i++) {
    const cxg = mx + i * 0.3
    k.hex('brass', 0.09, 0.06, [cxg, ty - 0.38, tz + 0.2], 'y')
    k.spline('cable', [[cxg, ty - 0.42, tz + 0.2], [cxg, hs + 0.25, tz + 0.23], [cxg + 0.1, hs + 0.02, tz + 0.13]], 0.035, 8, 16)
  }
  k.box('nameplate', [0.5, 0.3, 0.01], [mx - 0.2, mTop - 0.25, -mW / 2 - 0.006])
  return fan
}
