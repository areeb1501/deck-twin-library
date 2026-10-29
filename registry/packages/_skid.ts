// Shared package-skid parts: battery-limit flanges, in-kit valves, instruments, local panels, cable tray, supports, vessels, drip pans.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { flange, flangedJoint, gasket, gauge, member } from '../lib/parts'
import { faceToFace, flange as flangeDims, handwheelDia, headDepth, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { lcdMaterial, textMaterial } from '../lib/textures'

const V = (v: V3) => new THREE.Vector3(...v)
const arr = (v: THREE.Vector3) => v.toArray() as V3
export const addv = (a: V3, d: V3, s = 1): V3 => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s]

/** Local frame with +X along `dir` and +Y as close to `up` as possible, origin at `pos`. */
export function frame(pos: V3, dir: V3, up: V3 = [0, 1, 0]) {
  const x = V(dir).normalize()
  let u = V(up).normalize()
  if (Math.abs(u.dot(x)) > 0.99) u = Math.abs(x.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const z = new THREE.Vector3().crossVectors(x, u).normalize()
  const y = new THREE.Vector3().crossVectors(z, x).normalize()
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(V(pos))
}

/** Battery-limit weld-neck flange with studs, face at `face` pointing along `dir`. Returns the weld end for the neck pipe. */
export function blFlange(k: Kit, face: V3, dir: V3, nps: number, rating: Rating, studs = true): V3 {
  const L = flange(k, nps, rating, face, dir, studs)
  liner(k, nps, face, dir, L)
  return addv(face, dir, -L)
}

/** Bore lining through a weld-neck flange (face to weld end) so a flange reads hollow when looked into. */
export function liner(k: Kit, nps: number, face: V3, dir: V3, len: number) {
  const ro = pipeOD(nps) / 2
  const ri = ro - pipeWall(nps, 'STD')
  k.lathe('machined', [[ro * 0.88, 0], [ri, 0]], face, dir, 24)
  k.lathe('pipeBore', [[ri, 0], [ri, -len]], face, dir, 24)
}

export type ValveKind = 'ball' | 'gate' | 'globe' | 'check'

/** Overall length of an in-kit flanged valve including both mating pipe flanges (weld end to weld end). */
export function valveSpan(kind: ValveKind, nps: number, rating: Rating) {
  const f = flangeDims(nps, rating)
  const fam = kind === 'ball' ? 'ball-full' : kind === 'check' ? 'swing-check' : kind
  return faceToFace(fam, nps, rating) + 2 * (0.0045 + f.hubLength + f.raisedFaceHeight)
}

/**
 * Flanged valve centred at `pos` on a line along `dir`, operator towards `up`. Both mating pipe flanges, gaskets
 * and studs are included, so the line pipe stops at pos ± dir·valveSpan/2.
 */
export function valve(k: Kit, kind: ValveKind, pos: V3, dir: V3, nps: number, rating: Rating, up: V3 = [0, 1, 0], body: MatKey = 'valveBody', open = 1, op: 'manual' | 'mov' | 'diaphragm' = 'manual') {
  const fam = kind === 'ball' ? 'ball-full' : kind === 'check' ? 'swing-check' : kind
  const L = faceToFace(fam, nps, rating)
  const f = flangeDims(nps, rating)
  const D = pipeOD(nps)
  const fl = f.thickness + f.raisedFaceHeight
  k.with(frame(pos, dir, up), () => {
    spoolJoint(k, [L / 2 + 0.00225, 0, 0], [1, 0, 0], nps, rating)
    spoolJoint(k, [-L / 2 - 0.00225, 0, 0], [-1, 0, 0], nps, rating)
    const inner = L / 2 - fl
    const ri = D / 2 - pipeWall(nps, 'STD')
    k.pipe(body, [-inner - 0.002, 0, 0], [inner + 0.002, 0, 0], D * 1.24, D * 0.62 - ri + 0.003, 28)
    if (kind === 'ball') {
      k.sphere(body, D * 0.82, [0, 0, 0], [1.05, 1, 1], 28)
      for (const s of [-1, 1]) k.cyl(body, D * 0.78, 0.012, [s * D * 0.55, 0, 0], 'x', 28)
      k.around(8, D * 0.7, [D * 0.55, 0, 0], 'x', (p) => k.hex('nut', 0.016, 0.01, addv(p, [0.008, 0, 0])))
      const yTop = D * 0.95
      k.cyl(body, D * 0.3, yTop - D * 0.6, [0, (yTop + D * 0.6) / 2, 0], 'y', 16)
      k.cyl(body, D * 0.36, 0.012, [0, yTop, 0], 'y', 16)
      if (op === 'mov') movActuator(k, yTop, D, body)
      else if (nps <= 4) {
        const lever = Math.max(0.15, handwheelDia('ball-full', nps, rating))
        const a = (1 - open) * (Math.PI / 2)
        k.cyl('nut', D * 0.12, 0.04, [0, yTop + 0.02, 0], 'y', 10)
        k.box('actuatorRed', [lever, 0.012, 0.03], [(Math.cos(a) * lever) / 2 - Math.cos(a) * 0.02, yTop + 0.045, (-Math.sin(a) * lever) / 2], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a))
      } else {
        const gb = Math.max(0.12, D * 0.7)
        k.rbox(body, [gb, gb * 0.6, gb * 0.8], gb * 0.08, [0, yTop + gb * 0.3, 0])
        k.cyl(body, gb * 0.15, gb * 0.5, [0, yTop + gb * 0.3, gb * 0.6], 'z', 12)
        k.handwheel('handwheel', Math.max(0.3, gb * 1.8), [0, yTop + gb * 0.3, gb * 0.85], 'z', 5)
      }
    } else if (kind === 'check') {
      k.sphere(body, D * 0.78, [0, 0, 0], [1.25, 1, 0.95], 24)
      const yc = D * 0.72
      k.cyl(body, D * 0.62, 0.04, [0, yc, 0], 'y', 24)
      k.cyl(body, D * 0.66, 0.025, [0, yc + 0.032, 0], 'y', 24)
      k.around(8, D * 0.58, [0, yc + 0.045, 0], 'y', (p) => k.hex('nut', 0.018, 0.012, p))
      k.box('stainless', [D * 0.5, 0.002, D * 0.25], [0, 0, D * 0.79])
    } else {
      // gate / globe: bolted bonnet, yoke, rising stem, handwheel
      if (kind === 'globe') k.sphere(body, D * 0.85, [0, 0, 0], [1.2, 1, 0.95], 24)
      else k.add(body, new THREE.CylinderGeometry(1, 1, D * 1.5, 28), new THREE.Matrix4().compose(new THREE.Vector3(0, D * 0.15, 0), new THREE.Quaternion(), new THREE.Vector3(D * 0.62, 1, D * 0.72)))
      const yb = kind === 'globe' ? D * 0.8 : D * 0.9
      k.cyl(body, D * 0.62, 0.03, [0, yb, 0], 'y', 24)
      k.around(8, D * 0.55, [0, yb + 0.02, 0], 'y', (p) => k.hex('nut', 0.018, 0.012, p))
      const hB = Math.max(0.08, D * 0.9)
      k.cyl(body, D * 0.3, hB, [0, yb + hB / 2, 0], 'y', 16, D * 0.22)
      const yoke = Math.max(0.12, D * 1.3)
      const y0 = yb + hB
      for (const s of [-1, 1]) k.box(body, [Math.max(0.012, D * 0.12), yoke, Math.max(0.012, D * 0.1)], [s * D * 0.28, y0 + yoke / 2, 0])
      k.box(body, [D * 0.7, Math.max(0.016, D * 0.12), D * 0.2], [0, y0 + yoke, 0])
      if (op === 'diaphragm') {
        // spring-opposed diaphragm actuator with positioner
        const Ra = THREE.MathUtils.clamp(D * 1.6, 0.14, 0.3)
        const ya = y0 + yoke + 0.02
        k.cyl('stainless', Math.max(0.006, D * 0.05), yoke * 0.8, [0, y0 + yoke * 0.5, 0], 'y', 10)
        k.lathe('actuatorBlue', [[0.02, 0], [Ra * 0.9, 0], [Ra, Ra * 0.12], [Ra, Ra * 0.18], [Ra * 0.9, Ra * 0.2]], [0, ya, 0], 'y', 32)
        k.lathe('actuatorBlue', [[Ra * 0.9, Ra * 0.2], [Ra, Ra * 0.22], [Ra, Ra * 0.28], [Ra * 0.7, Ra * 0.55], [0.02, Ra * 0.6]], [0, ya, 0], 'y', 32)
        k.around(12, Ra * 0.95, [0, ya + Ra * 0.2, 0], 'y', (p) => k.hex('nut', 0.014, 0.012, p))
        k.rbox('aluminium', [0.1, 0.12, 0.06], 0.01, [D * 0.35 + 0.05, y0 + yoke * 0.5, 0.04])
        k.tube('tubing', [[D * 0.35 + 0.05, y0 + yoke * 0.5 + 0.06, 0.04], [D * 0.35 + 0.05, ya + Ra * 0.4, 0.04], [0.02, ya + Ra * 0.62, 0.04]], 0.004, 6, 0.02)
      } else {
        const stemTop = y0 + yoke + 0.04 + open * D * 0.6
        k.cyl('stainless', Math.max(0.006, D * 0.05), stemTop - y0, [0, (stemTop + y0) / 2, 0], 'y', 10)
        k.handwheel('handwheel', Math.max(0.16, handwheelDia(kind, nps, rating)), [0, y0 + yoke + 0.04, 0], 'y', 4)
      }
    }
    k.box('stainless', [D * 0.45, D * 0.2, 0.002], [0, -D * 0.2, D * 0.63])
  })
  return valveSpan(kind, nps, rating)
}

/** Electric multi-turn actuator on a gearbox (valve-local frame, stem +Y from `y`). */
function movActuator(k: Kit, y: number, D: number, body: MatKey) {
  const s = THREE.MathUtils.clamp(D * 1.8, 0.45, 1.2)
  k.cyl(body, D * 0.36, 0.06 * s, [0, y + 0.03 * s, 0], 'y', 20)
  k.rbox(body, [0.24 * s, 0.2 * s, 0.26 * s], 0.02 * s, [0, y + 0.16 * s, 0])
  k.rbox('actuatorBlue', [0.2 * s, 0.26 * s, 0.22 * s], 0.025 * s, [0, y + 0.39 * s, 0])
  k.cyl('actuatorBlue', 0.08 * s, 0.28 * s, [0, y + 0.37 * s, 0.24 * s], 'z', 20)
  k.cyl('actuatorBlue', 0.085 * s, 0.03 * s, [0, y + 0.37 * s, 0.38 * s], 'z', 20)
  k.rbox('actuatorBlue', [0.16 * s, 0.1 * s, 0.14 * s], 0.015 * s, [0, y + 0.57 * s, 0])
  k.disc('glass', 0.035 * s, [0, y + 0.39 * s, 0.111 * s], 'z', 18)
  k.handwheel('handwheel', 0.3 * s, [-0.16 * s, y + 0.39 * s, 0], '-x', 4)
  for (const dx of [-0.05, 0.05]) k.cyl('brass', 0.012 * s, 0.04 * s, [dx * s, y + 0.25 * s, -0.12 * s], 'z', 8)
}

/** Small-bore instrument / tubing valve (needle or ball) on a line along `dir`, handle towards `up`. Body length ≈ 8 r. */
export function smallValve(k: Kit, kind: 'needle' | 'ball', pos: V3, dir: V3, r: number, up: V3 = [0, 1, 0], mat: MatKey = 'stainless') {
  const b = Math.max(0.012, r * 2.2)
  k.with(frame(pos, dir, up), () => {
    k.box(mat, [b * 2.6, b * 1.4, b * 1.4], [0, 0, 0])
    for (const s of [-1, 1]) k.hex(mat, b * 1.25, b * 0.8, [s * b * 1.6, 0, 0], 'x')
    if (kind === 'needle') {
      k.cyl(mat, b * 0.45, b * 1.6, [0, b * 1.4, 0], 'y', 10)
      k.hex(mat, b * 1.1, b * 0.5, [0, b * 1.1, 0], 'y')
      k.box('handwheel', [b * 2.2, b * 0.35, b * 0.4], [0, b * 2.25, 0])
    } else {
      k.cyl(mat, b * 0.35, b * 0.8, [0, b * 1.0, 0], 'y', 10)
      k.box('actuatorRed', [b * 4, b * 0.25, b * 0.6], [b * 1.6, b * 1.45, 0])
    }
  })
}

/** Small conventional relief valve: inlet at `inlet` going up (+Y), outlet towards `out`. Returns the outlet connection point. */
export function smallPsv(k: Kit, inlet: V3, out: V3, size = 0.025, body: MatKey = 'stainless', bonnet: MatKey = 'actuatorRed') {
  const s = size
  const o = V(out).normalize()
  const c = addv(inlet, [0, 1, 0], s * 2.2)
  k.hex(body, s * 1.6, s * 0.9, addv(inlet, [0, 1, 0], s * 0.45))
  k.cyl(body, s * 1.0, s * 2.4, addv(c, [0, -1, 0], s * 0.3), 'y', 16)
  k.sphere(body, s * 1.15, c, undefined, 14)
  const oc = addv(c, arr(o), s * 1.4)
  k.rod(body, c, oc, s * 0.7, 12)
  k.hex(body, s * 1.6, s * 0.9, addv(c, arr(o), s * 1.9), arr(o))
  k.cyl(bonnet, s * 0.75, s * 3.2, addv(c, [0, 1, 0], s * 2.4), 'y', 14, s * 0.55)
  k.cyl(bonnet, s * 0.6, s * 0.9, addv(c, [0, 1, 0], s * 4.4), 'y', 12, s * 0.4)
  k.box('nut', [s * 2.2, s * 0.2, s * 0.35], addv(c, [0, 1, 0], s * 4.2))
  k.box('stainless', [s * 0.03 + 0.012, s * 1.2, 0.0015], addv(addv(c, [0, 1, 0], s * 2.4), [0, 0, 1], s * 0.8))
  return addv(c, arr(o), s * 2.35)
}

/** Pressure transmitter (coplanar, 2-valve manifold) on an impulse stub from `tap` along `n`; dual-compartment head with LCD. */
export function transmitter(k: Kit, tap: V3, n: V3, standoff = 0.1, housing: MatKey = 'actuatorBlue') {
  const d = V(n).normalize()
  const m = addv(tap, arr(d), standoff)
  k.rod('tubing', tap, m, 0.007, 8)
  k.with(frame(m, arr(d)), () => {
    k.box('stainless', [0.05, 0.05, 0.07], [0.025, 0, 0])
    for (const s of [-1, 1]) k.cyl('handwheel', 0.006, 0.04, [0.025, 0, s * 0.055], 'z', 6)
    k.box('stainless', [0.03, 0.06, 0.06], [0.065, 0.01, 0])
    k.cyl('stainless', 0.03, 0.07, [0.07, 0.075, 0], 'y', 16)
    k.cyl(housing, 0.042, 0.1, [0.07, 0.15, 0], 'x', 20)
    for (const s of [-1, 1]) k.cyl(housing, 0.046, 0.022, [0.07 + s * 0.06, 0.15, 0], 'x', 20)
    k.disc(lcdMaterial(), 0.03, [0.132, 0.15, 0], 'x', 20)
    k.disc('glass', 0.034, [0.133, 0.15, 0], 'x', 20)
    k.cyl('brass', 0.011, 0.03, [0.07, 0.15, 0.055], 'z', 8)
  })
}

/** Thermowell with transmitter head, inserted at `at` on a pipe, head out along `n`. */
export function tempElement(k: Kit, at: V3, n: V3, od: number) {
  const d = V(n).normalize()
  const base = addv(at, arr(d), od / 2)
  k.with(frame(base, arr(d)), () => {
    k.cyl('stainless', 0.02, 0.04, [0.02, 0, 0], 'x', 12)
    k.hex('stainless', 0.032, 0.02, [0.05, 0, 0], 'x')
    k.cyl('stainless', 0.008, 0.06, [0.09, 0, 0], 'x', 8)
    k.cyl('aluminium', 0.04, 0.06, [0.15, 0, 0], 'x', 18)
    k.cyl('aluminium', 0.043, 0.015, [0.185, 0, 0], 'x', 18)
    k.cyl('brass', 0.009, 0.025, [0.15, -0.045, 0], 'y', 8)
  })
}

/** Instrument tapping with root valve and pressure gauge, from `tap` along `n`. */
export function gaugeTap(k: Kit, tap: V3, n: V3, max = 100, d = 0.1, unit: 'bar' | '°C' = 'bar') {
  const v = V(n).normalize()
  const a = addv(tap, arr(v), 0.05)
  k.rod('tubing', tap, addv(tap, arr(v), 0.12), 0.007, 8)
  smallValve(k, 'needle', a, arr(v), 0.006, Math.abs(v.y) > 0.9 ? [0, 0, 1] : [0, 1, 0])
  const g = addv(tap, arr(v), 0.12 + d * 0.16)
  const face: V3 = Math.abs(v.y) > 0.9 ? [0, 0, 1] : arr(v)
  if (Math.abs(v.y) > 0.9) {
    k.rod('tubing', addv(tap, arr(v), 0.12), addv(addv(tap, arr(v), 0.12), [0, 0, 1], 0.001), 0.007, 8)
    gauge(k, addv(tap, arr(v), 0.12 + d / 2), face, d, unit, max)
  } else gauge(k, g, face, d, unit, max)
}

/** Ladder cable tray along a polyline. Horizontal runs lie flat; vertical runs use `side` (horizontal) as the width direction. */
export function cableTray(k: Kit, pts: V3[], side: V3, w = 0.15, cables = 3) {
  const sv = V(side).normalize()
  const UP = new THREE.Vector3(0, 1, 0)
  const sideOf = (d: THREE.Vector3) => (Math.abs(d.y) > 0.9 ? sv.clone() : new THREE.Vector3().crossVectors(UP, d).normalize())
  const segs: { a: THREE.Vector3; d: THREE.Vector3; L: number; s: THREE.Vector3; n: THREE.Vector3 }[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = V(pts[i])
    const d = V(pts[i + 1]).sub(a)
    const L = d.length()
    if (L < 1e-4) continue
    d.normalize()
    const s = sideOf(d)
    let n = new THREE.Vector3().crossVectors(s, d).normalize()
    if (Math.abs(d.y) < 0.9 && n.y < 0) n = n.negate()
    segs.push({ a, d, L, s, n })
  }
  for (const { a, d, L, s, n } of segs) {
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, n, new THREE.Vector3().crossVectors(d, n)))
    const mid = a.clone().addScaledVector(d, L / 2)
    for (const sg of [-1, 1]) k.box('cableTray', [L + 0.01, 0.05, 0.003], arr(mid.clone().addScaledVector(s, (sg * w) / 2).addScaledVector(n, 0.02)), q)
    const nr = Math.max(1, Math.floor(L / 0.25))
    for (let j = 0; j <= nr; j++) k.box('cableTray', [0.02, 0.006, w], arr(a.clone().addScaledVector(d, (j / nr) * L).addScaledVector(n, 0.003)), q)
  }
  for (let c = 0; c < cables; c++) {
    const off = ((c + 0.5) / cables - 0.5) * w * 0.7
    const P: V3[] = []
    segs.forEach(({ a, d, L, s, n }, i) => {
      if (i === 0) P.push(arr(a.clone().addScaledVector(s, off).addScaledVector(n, 0.014)))
      P.push(arr(a.clone().addScaledVector(d, L).addScaledVector(s, off).addScaledVector(n, 0.014)))
    })
    k.tube('cable', P, 0.008, 6, 0.08)
  }
}

/**
 * Local control panel on two posts, door facing `n` (±X or ±Z), standing on the deck at `base`.
 * Returns the cable-gland point under the enclosure (for a tray run).
 */
export function localPanel(k: Kit, base: V3, n: V3, opts: { w?: number; h?: number; top?: number; title?: string; screen?: boolean; buttons?: number } = {}) {
  const w = opts.w ?? 0.6
  const h = opts.h ?? 0.7
  const top = opts.top ?? 1.75
  const dep = 0.25
  const nn = V(n).normalize()
  const side = new THREE.Vector3(0, 1, 0).cross(nn).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nn)
  const at = (x: number, y: number, z: number) => arr(V(base).addScaledVector(side, x).add(new THREE.Vector3(0, y, 0)).addScaledVector(nn, z))
  for (const s of [-1, 1]) {
    member(k, at(s * (w / 2 - 0.05), 0, -0.05), at(s * (w / 2 - 0.05), top + 0.15, -0.05), 'UPN 80', 'galvanised', arr(nn))
    k.box('galvanised', [0.16, 0.012, 0.16], at(s * (w / 2 - 0.05), 0.006, -0.05), q)
  }
  for (const y of [0.35, top - h - 0.05]) member(k, at(-w / 2, y, -0.03), at(w / 2, y, -0.03), 'L50x50x5', 'galvanised', [0, 1, 0])
  const yc = top - h / 2
  k.rbox('stainless', [w, h, dep], 0.015, at(0, yc, dep / 2), q)
  k.rbox('stainless', [w - 0.03, h - 0.03, 0.012], 0.006, at(0, yc, dep + 0.006), q)
  for (const s of [-0.3, 0.3]) k.box('nut', [0.02, 0.06, 0.012], at(w / 2 - 0.04, yc + s * h, dep + 0.016), q)
  k.box('stainless', [w + 0.12, 0.01, dep + 0.2], at(0, top + 0.1, dep / 2 + 0.03), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nn).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12)))
  const fz = dep + 0.013
  if (opts.screen !== false) {
    k.box('rubberBlack', [w * 0.5, h * 0.3, 0.006], at(0, yc + h * 0.18, fz), q)
    k.plane(lcdMaterial(), w * 0.45, h * 0.26, at(0, yc + h * 0.18, fz + 0.0035), q)
  }
  const nb = opts.buttons ?? 3
  const mats: MatKey[] = ['safetyGreen', 'actuatorRed', 'actuatorYellow', 'lampLens', 'safetyGreen', 'actuatorRed']
  for (let i = 0; i < nb; i++) k.cyl(mats[i % mats.length], 0.016, 0.02, at(-w * 0.3 + (i * w * 0.6) / Math.max(1, nb - 1), yc - h * 0.18, fz + 0.01), arr(nn), 14)
  k.cyl('actuatorYellow', 0.04, 0.004, at(w * 0.3, yc - h * 0.36, fz), arr(nn), 20)
  k.dome('actuatorRed', 0.025, at(w * 0.3, yc - h * 0.36, fz + 0.01), arr(nn), Math.PI / 2, 0.7, 16)
  if (opts.title) k.plane(textMaterial(opts.title, '#f2f2ee', '#111', 512, 96), w * 0.7, w * 0.13, at(0, yc + h * 0.42, fz + 0.001), q)
  for (let i = 0; i < 4; i++) k.cyl('brass', 0.012, 0.035, at(-w * 0.3 + i * w * 0.2, top - h - 0.015, dep / 2), 'y', 8)
  return at(0, top - h - 0.04, dep / 2)
}

/** Pipe stanchion from the deck to under a pipe centred at `at`, with saddle plate and U-bolt. Pipe runs along `along`. */
export function pipeSupport(k: Kit, at: V3, od: number, deckY: number, along: 'x' | 'z', mat: MatKey = 'galvanised') {
  const top = at[1] - od / 2 - 0.006
  if (top - deckY < 0.05) return
  const big = od > 0.12
  const sec = big ? 'HEB 100' : 'L50x50x5'
  member(k, [at[0], deckY, at[2]], [at[0], top - 0.01, at[2]], sec, mat, along === 'x' ? [1, 0, 0] : [0, 0, 1])
  const w = Math.max(0.1, od + 0.06)
  k.box(mat, along === 'x' ? [0.1, 0.012, w] : [w, 0.012, 0.1], [at[0], top - 0.004, at[2]])
  k.box(mat, [0.16, 0.012, 0.16], [at[0], deckY + 0.006, at[2]])
  k.torus('boltXylan', od / 2 + 0.006, Math.max(0.004, od * 0.03), [at[0], at[1], at[2]], along === 'x' ? 'x' : 'z', 6, 20, Math.PI)
  for (const s of [-1, 1]) {
    const p: V3 = along === 'x' ? [at[0], top + 0.004, at[2] + s * (od / 2 + 0.006)] : [at[0] + s * (od / 2 + 0.006), top + 0.004, at[2]]
    k.hex('nut', Math.max(0.014, od * 0.12), 0.01, p)
  }
}

export interface VesselDims {
  Ro: number
  hd: number
  /** bottom of the lower head */
  yBot: number
  /** top of the upper head */
  yTop: number
}

/** Vertical 2:1 ellipsoidal-head vessel, bottom tangent line at `yTL`, with girth seams. */
export function vVessel(k: Kit, x: number, z: number, yTL: number, id: number, tt: number, wall: number, mat: MatKey = 'equipmentPaint', seg = 48): VesselDims {
  const Ro = id / 2 + wall
  const hd = headDepth('2:1-ellipsoidal', id) + wall
  const prof: [number, number][] = [[0, -hd]]
  for (let i = 1; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2)
    prof.push([Ro * Math.sin(t), -hd * Math.cos(t)])
  }
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2)
    prof.push([Ro * Math.cos(t), tt + hd * Math.sin(t)])
  }
  k.lathe(mat, prof, [x, yTL, z], 'y', seg)
  for (const y of [0, tt]) k.torus(mat, Ro + 0.0008, Math.max(0.003, Ro * 0.008), [x, yTL + y, z], 'y', 6, seg)
  return { Ro, hd, yBot: yTL - hd, yTop: yTL + tt + hd }
}

/** Angle or pipe legs welded to a vertical shell, with base plates and anchor nuts. */
export function vesselLegs(k: Kit, x: number, z: number, Ro: number, yAttach: number, deckY: number, n = 4, mat: MatKey = 'equipmentPaint', phase = Math.PI / 4) {
  const lr = Math.max(0.03, Ro * 0.12)
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2
    const px = x + Math.cos(a) * (Ro + lr * 0.6)
    const pz = z + Math.sin(a) * (Ro + lr * 0.6)
    k.cyl(mat, lr, yAttach - deckY, [px, (yAttach + deckY) / 2, pz], 'y', 12)
    k.box(mat, [0.01, Math.min(0.3, (yAttach - deckY) * 0.3), lr * 2.4], [x + Math.cos(a) * (Ro + 0.005), yAttach - 0.1, z + Math.sin(a) * (Ro + 0.005)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
    const bp = lr * 3.2
    k.box(mat, [bp, 0.014, bp], [px, deckY + 0.007, pz])
    for (const s of [-1, 1]) k.hex('nut', 0.026, 0.016, [px + s * bp * 0.32, deckY + 0.022, pz + s * bp * 0.32])
  }
}

/** Bunded drip tray: floor plate, upstand rim and a drain coupling on the -X end. */
export function dripPan(k: Kit, cx: number, cz: number, sx: number, sz: number, y: number, rim = 0.06, mat: MatKey = 'stainless') {
  k.box(mat, [sx, 0.005, sz], [cx, y + 0.0025, cz])
  for (const s of [-1, 1]) {
    k.box(mat, [sx, rim, 0.004], [cx, y + rim / 2, cz + s * (sz / 2 - 0.002)])
    k.box(mat, [0.004, rim, sz], [cx + s * (sx / 2 - 0.002), y + rim / 2, cz])
  }
  k.cyl(mat, 0.016, 0.06, [cx - sx / 2 - 0.02, y + 0.02, cz], 'x', 10)
  k.hex('nut', 0.03, 0.02, [cx - sx / 2 - 0.05, y + 0.02, cz], 'x')
}

/** Brass earth boss on a steel face. */
export function earthBoss(k: Kit, pos: V3, n: V3) {
  k.cyl('brass', 0.014, 0.025, pos, n, 10)
  k.hex('brass', 0.024, 0.008, addv(pos, n, 0.012), n)
}

/** Flanged spool joint inside the skid piping (both flanges, gasket, studs), centred at `pos` along `dir`. */
export function spoolJoint(k: Kit, pos: V3, dir: V3, nps: number, rating: Rating) {
  flangedJoint(k, nps, rating, pos, dir)
  const f = flangeDims(nps, rating)
  const L = f.hubLength + f.raisedFaceHeight
  liner(k, nps, addv(pos, dir, -0.00225), dir, L)
  liner(k, nps, addv(pos, dir, 0.00225), [-dir[0], -dir[1], -dir[2]], L)
}

/** Curved painted label band on a vertical shell (axis +Y at x, z), centred on the +Z side, `h` tall over `arc` radians. */
export function shellLabel(k: Kit, text: string, x: number, y: number, z: number, Ro: number, h: number, arc = 1.1, bg = '#1f5fa0', fg = '#ffffff') {
  k.add(textMaterial(text, bg, fg, 512, Math.round((512 * h) / (Ro * arc))), new THREE.CylinderGeometry(Ro + 0.003, Ro + 0.003, h, 24, 1, true, -arc / 2, arc), new THREE.Matrix4().makeTranslation(x, y, z))
}

/** Open mouth where a branch meets a run or shell: dark bore disc on the surface at `at` facing `dir`, plus the fillet weld. */
export function branchMouth(k: Kit, at: V3, dir: V3, nps: number, wall = 0.006) {
  const r = pipeOD(nps) / 2
  k.disc('pipeBore', r - wall, addv(at, dir, 0.0012), dir, 24)
  k.torus('flangeSteel', r + 0.001, Math.max(0.003, r * 0.06), addv(at, dir, 0.002), dir, 6, 24)
}

/** Bow shackles with screw pins through the four lib `skid()` padeyes (skid of length L, width W, deck top `deckY`). */
export function padeyeShackles(k: Kit, L: number, W: number, deckY: number) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (L / 2 - 0.25)
      const z = sz * (W / 2 - 0.03)
      const hy = deckY + 0.078
      k.rod('galvanised', [x, hy, z - 0.05], [x, hy, z + 0.05], 0.011, 10)
      k.hex('nut', 0.03, 0.016, [x, hy, z - 0.055], 'z')
      k.cyl('galvanised', 0.02, 0.012, [x, hy, z + 0.055], 'z', 12)
      k.tube('actuatorRed', [[x, hy, z - 0.042], [x, hy + 0.11, z - 0.042], [x, hy + 0.11, z + 0.042], [x, hy, z + 0.042]], 0.011, 8, 0.04)
    }
}

/** Basket strainer on a line along +X centred at `pos` (flanged ends are spool joints at ±len/2), with pot, cover, drain and DP gauge. */
export function basketStrainer(k: Kit, pos: V3, nps: number, rating: Rating, len: number, mat: MatKey = 'valveBody') {
  const D = pipeOD(nps)
  const f = flangeDims(nps, rating)
  const fl = f.hubLength + f.raisedFaceHeight
  const [x, y, z] = pos
  for (const s of [-1, 1]) spoolJoint(k, [x + (s * len) / 2, y, z], [s, 0, 0], nps, rating)
  const inner = len / 2 - fl
  k.pipe(mat, [x - inner - 0.002, y, z], [x + inner + 0.002, y, z], D * 1.1, D * 0.05 + 0.004, 28)
  const R = D * 0.85
  k.cyl(mat, R, D * 1.9, [x, y + D * 0.15, z], 'y', 32)
  k.dome(mat, R, [x, y - D * 0.8, z], '-y', Math.PI / 2, 0.6, 32)
  const yc = y + D * 1.1
  k.cyl(mat, R + 0.05, 0.05, [x, yc, z], 'y', 32)
  k.cyl(mat, R + 0.05, 0.04, [x, yc + 0.045, z], 'y', 32)
  k.around(12, R + 0.025, [x, yc + 0.07, z], 'y', (p) => k.hex('nut', 0.03, 0.02, p))
  k.box('handwheel', [R * 1.2, 0.025, 0.03], [x, yc + 0.08, z])
  k.cyl('stainless', 0.012, 0.08, [x, y - D * 0.8 - R * 0.6 - 0.03, z], 'y', 10)
  k.hex('nut', 0.03, 0.02, [x, y - D * 0.8 - R * 0.6 - 0.08, z])
  k.tube('tubing', [[x - R * 0.7, y + D * 0.3, z + R * 0.75], [x - R * 0.7, yc + 0.15, z + R + 0.08], [x + R * 0.7, yc + 0.15, z + R + 0.08], [x + R * 0.7, y + D * 0.3, z + R * 0.75]], 0.005, 6, 0.03)
  gauge(k, [x, yc + 0.2, z + R + 0.1], 'z', 0.1, 'bar', 2)
}

/** Spring-loaded back-pressure / thermal relief valve body on a line point, bonnet towards `up`. */
export function reliefBody(k: Kit, pos: V3, up: V3, s = 0.02) {
  k.sphere('valveBody', s * 1.2, pos, undefined, 14)
  k.cyl('actuatorRed', s * 0.7, s * 3, addv(pos, up, s * 2.4), up, 12, s * 0.5)
  k.cyl('actuatorRed', s * 0.5, s * 0.8, addv(pos, up, s * 4.2), up, 10)
}

/**
 * Mating pipe flange bolted to a nozzle face that points along `dir` (nozzle drawn with studs: false): gasket, flange
 * facing back, bore liner and through-studs with two nuts. Returns the weld end of the mating flange.
 */
export function mateFlange(k: Kit, face: V3, dir: V3, nps: number, rating: Rating): V3 {
  const f = flangeDims(nps, rating)
  const g = 0.0045
  gasket(k, nps, rating, addv(face, dir, g / 2), dir, g)
  const mf = addv(face, dir, g)
  const back: V3 = [-dir[0], -dir[1], -dir[2]]
  blFlange(k, mf, back, nps, rating, false)
  const span = 2 * (f.thickness + f.raisedFaceHeight) + g
  const studL = span + f.boltDia * 3
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, addv(addv(face, dir, g / 2), dir, -studL / 2), dir, f.boltDia, studL, [f.boltDia * 0.95, studL - f.boltDia * 0.95])
  return addv(mf, dir, f.hubLength + f.raisedFaceHeight)
}

/** Weld-to-weld length of an in-kit wafer butterfly valve between two weld-neck flanges. */
export function butterflySpan(nps: number, rating: Rating) {
  const f = flangeDims(nps, rating)
  return faceToFace('butterfly-wafer', nps, rating) + 2 * (0.003 + f.hubLength + f.raisedFaceHeight)
}

/** Wafer butterfly valve clamped between two pipe flanges, centred at `pos` on a line along `dir`; lever, gear or pneumatic rack-and-pinion actuator towards `up`. */
export function butterflyValve(k: Kit, pos: V3, dir: V3, nps: number, rating: Rating, up: V3 = [0, 1, 0], op: 'lever' | 'gear' | 'pneumatic' = 'pneumatic') {
  const f = flangeDims(nps, rating)
  const w = faceToFace('butterfly-wafer', nps, rating)
  const D = pipeOD(nps)
  const fl = f.hubLength + f.raisedFaceHeight
  k.with(frame(pos, dir, up), () => {
    for (const s of [-1, 1]) {
      const face: V3 = [s * (w / 2 + 0.003), 0, 0]
      flange(k, nps, rating, face, [-s, 0, 0], false)
      liner(k, nps, face, [-s, 0, 0], fl)
      gasket(k, nps, rating, [s * (w / 2 + 0.0015), 0, 0], 'x', 0.003)
    }
    const ri = D / 2 - 0.004
    k.lathe('valveBody', [[ri, -w / 2], [f.raisedFace / 2 + 0.01, -w / 2], [f.raisedFace / 2 + 0.01, w / 2], [ri, w / 2]], [0, 0, 0], 'x', 32)
    k.lathe('pipeBore', [[ri, w / 2], [ri, -w / 2]], [0, 0, 0], 'x', 24)
    k.box('stainless', [0.006, 2 * ri, 2 * ri * 0.15], [0, 0, 0]) // disc edge-on (open)
    const studL = w + 2 * (f.thickness + f.raisedFaceHeight) + f.boltDia * 3.2
    k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, [-studL / 2, 0, 0], 'x', f.boltDia, studL, [f.boltDia * 0.95, studL - f.boltDia * 0.95])
    const yN = f.raisedFace / 2 + 0.01
    k.cyl('valveBody', Math.max(0.018, D * 0.14), 0.09 + D * 0.2, [0, yN + (0.09 + D * 0.2) / 2, 0], 'y', 16)
    const yT = yN + 0.09 + D * 0.2
    k.box('valveBody', [0.1 + D * 0.3, 0.012, 0.1 + D * 0.3], [0, yT, 0])
    if (op === 'pneumatic') {
      const s = THREE.MathUtils.clamp(D * 2.2, 0.18, 0.6)
      k.rbox('actuatorYellow', [s * 0.45, s * 0.4, s * 1.2], s * 0.06, [0, yT + s * 0.2 + 0.006, 0])
      for (const sz of [-1, 1]) k.cyl('actuatorYellow', s * 0.22, s * 0.03, [0, yT + s * 0.2 + 0.006, sz * s * 0.6], 'z', 18)
      k.rbox('aluminium', [s * 0.3, s * 0.2, s * 0.3], s * 0.03, [0, yT + s * 0.5, 0]) // limit switch box
      k.cyl('actuatorRed', s * 0.08, s * 0.05, [0, yT + s * 0.62, 0], 'y', 12)
    } else if (op === 'gear') {
      const gb = Math.max(0.1, D * 0.6)
      k.rbox('valveBody', [gb, gb * 0.6, gb * 0.8], gb * 0.08, [0, yT + gb * 0.3, 0])
      k.handwheel('handwheel', Math.max(0.25, gb * 1.8), [0, yT + gb * 0.3, gb * 0.7], 'z', 5)
    } else k.box('actuatorRed', [0.04, 0.02, Math.max(0.2, D * 1.6)], [0, yT + 0.02, Math.max(0.1, D * 0.8) - 0.03])
  })
  return w + 2 * (0.003 + fl)
}
