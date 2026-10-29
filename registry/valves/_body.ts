// Shared valve bodies: integral RF end flanges, see-through bores, ball / globe / gate castings, bolted bonnets, OS&Y yokes, plates.
import * as THREE from 'three'
import { useEffect, useMemo, type DependencyList } from 'react'
import { Kit, mat4, type Built, type MatKey, type Profile, type V3 } from '../lib/kit'
import { flange as weldNeck, liftingLug, tagPlate } from '../lib/parts'
import { flange, GASKET_SPIRAL_WOUND, pipeOD, pipeWall, RATINGS, type FlangeDims, type Rating } from '../lib/standards'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** typical: casting / operator growth with pressure class */
export const classK = (r: Rating) => 1 + 0.06 * Math.max(0, RATINGS.indexOf(r))

const FRAC: Record<number, string> = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4', 1.25: '1-1/4', 1.5: '1-1/2', 2.5: '2-1/2', 3.5: '3-1/2' }
/** typical: ISO 5211 top pad width for a valve of pipe OD D */
export const isoPadSize = (D: number) => Math.max(0.07, D * 0.55)

export const npsLabel = (nps: number) => `${FRAC[nps] ?? nps}"`
export const plateText = (nps: number, rating: Rating, extra = '') => `${npsLabel(nps)} CL${rating}${extra ? ' ' + extra : ''}`

/** Fixed + moving Kit pair built together, disposed on change. */
export function useKit2(draw: (k: Kit, mv: Kit) => void, deps: DependencyList): [Built, Built] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => {
    const k = new Kit()
    const mv = new Kit()
    draw(k, mv)
    return [k.build(), mv.build()] as [Built, Built]
  }, deps)
  useEffect(() => () => built.forEach((b) => b.geometry.dispose()), [built])
  return built
}

export interface Dims {
  D: number
  f: FlangeDims
  L: number
  ri: number
  /** flange back face, |x| */
  xf: number
  seg: number
}

export function dims(nps: number, rating: Rating, L: number): Dims {
  const f = flange(nps, rating)
  const D = pipeOD(nps)
  return { D, f, L, ri: D / 2 - pipeWall(nps, '80'), xf: L / 2 - f.raisedFaceHeight - f.thickness, seg: nps >= 6 ? 48 : 36 }
}

/** Integral RF flange with its raised face at `face`, facing `axis`; hub fillet back to neckR, machined face down to rb, dark bolt holes. */
export function integralFlange(k: Kit, f: FlangeDims, face: V3, axis: 'x' | '-x' | 'y' | '-y' | 'z' | '-z', neckR: number, rb: number, mat: MatKey, seg = 32) {
  k.at(face, axis, () => {
    const rf = f.raisedFaceHeight
    const yb = -rf - f.thickness
    const fil = Math.min(0.012, f.thickness * 0.4)
    k.lathe(mat, [[neckR, yb - fil], [neckR + fil, yb], [f.od / 2, yb], [f.od / 2, -rf], [f.raisedFace / 2, -rf]], [0, 0, 0], 'y', seg)
    k.lathe('machined', [[f.raisedFace / 2, -rf], [f.raisedFace / 2, 0], [rb, 0]], [0, 0, 0], 'y', seg)
    k.around(f.bolts, f.boltCircle / 2, [0, 0, 0], 'y', (p) => {
      k.disc('pipeBore', f.boltDia * 0.56, [p[0], yb - 0.0006, p[2]], '-y', 10)
      k.disc('pipeBore', f.boltDia * 0.56, [p[0], -rf + 0.0006, p[2]], 'y', 10)
    }, Math.PI / f.bolts)
  })
}

/** Integral RF end flange with its face at x = s·L/2. */
export function endFlange(k: Kit, d: Dims, s: 1 | -1, neckR: number, rb: number, mat: MatKey) {
  integralFlange(k, d.f, [(s * d.L) / 2, 0, 0], s > 0 ? 'x' : '-x', neckR, rb, mat, d.seg)
}

/** Geometry transformed by m with every triangle whose centroid lies within r of the X axis removed: opens a through-bore in a casting that crosses the axis. Tessellate finely. */
export function punchX(g: THREE.BufferGeometry, r: number, m?: THREE.Matrix4) {
  const src = g.index ? g.toNonIndexed() : g
  if (!src.getAttribute('normal')) src.computeVertexNormals()
  if (m) src.applyMatrix4(m)
  const p = src.getAttribute('position')
  const n = src.getAttribute('normal')
  const P: number[] = []
  const N: number[] = []
  for (let i = 0; i < p.count; i += 3) {
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3
    if (cy * cy + cz * cz < r * r) continue
    for (let j = 0; j < 3; j++) {
      P.push(p.getX(i + j), p.getY(i + j), p.getZ(i + j))
      N.push(n.getX(i + j), n.getY(i + j), n.getZ(i + j))
    }
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  g.dispose()
  if (src !== g) src.dispose()
  return out
}

/** Dark bore lining along X between x0 and x1. */
export function bore(k: Kit, r: number, x0: number, x1: number, seg = 24, mat: MatKey = 'pipeBore') {
  k.lathe(mat, [[r, Math.max(x0, x1)], [r, Math.min(x0, x1)]], [0, 0, 0], 'x', seg)
}

/** Pipe-side weld-neck companion flanges, spiral-wound gaskets, through-studs and short pipe stubs around a wafer of length L. */
export function companionFlanges(k: Kit, nps: number, rating: Rating, L: number) {
  const f = flange(nps, rating)
  const D = pipeOD(nps)
  const ri = D / 2 - pipeWall(nps, 'STD')
  const g = GASKET_SPIRAL_WOUND
  for (const s of [-1, 1]) {
    const face: V3 = [s * (L / 2 + g), 0, 0]
    const hub = weldNeck(k, nps, rating, face, s > 0 ? '-x' : 'x')
    k.lathe('gasket', [[f.raisedFace / 2 + 0.006, -g / 2], [f.raisedFace / 2 + 0.006, g / 2], [ri + 0.004, g / 2], [ri + 0.004, -g / 2]], [s * (L / 2 + g / 2), 0, 0], 'x', 32)
    k.lathe('stainless', [[ri + 0.004, g / 2], [ri + 0.004, -g / 2]], [s * (L / 2 + g / 2), 0, 0], 'x', 32)
    const x0 = s * (L / 2 + g + hub)
    k.pipe('pipePaint', [x0, 0, 0], [x0 + s * Math.max(0.12, D * 0.6), 0, 0], D, pipeWall(nps, 'STD'), nps >= 6 ? 32 : 20)
    bore(k, ri, s * (L / 2 + g), x0)
  }
  const span = L + 2 * g + 2 * (f.thickness + f.raisedFaceHeight)
  const len = span + f.boltDia * 2.6
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, [-len / 2, 0, 0], 'x', f.boltDia, len, [f.boltDia * 0.65, len - f.boltDia * 0.65])
}

/** Casting of revolution about X from an outer (r, x) profile, closed down to rb at both ends (bore stays open). */
export function revolveX(k: Kit, mat: MatKey, rb: number, outer: Profile, seg = 40) {
  k.lathe(mat, [[rb, outer[0][1]], ...outer, [rb, outer[outer.length - 1][1]]], [0, 0, 0], 'x', seg)
}

/** Ellipsoidal barrel r(x) = R·sqrt(1 − (x/a)²), sampled between x0 and x1, floored at rMin. */
export function barrel(R: number, a: number, x0: number, x1: number, rMin: number, n = 22): Profile {
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / n
    return [Math.max(rMin, R * Math.sqrt(Math.max(0, 1 - (x / a) ** 2))), x] as [number, number]
  })
}

/** Ball with a through port of radius rb along `axis`. */
export function portedBall(k: Kit, mat: MatKey, R: number, rb: number, axis: 'x' | 'y' = 'x', seg = 36) {
  const xs = Math.sqrt(Math.max(R * R - rb * rb, 1e-6))
  const t0 = Math.asin(xs / R)
  const p: Profile = [[rb, xs], [rb, -xs]]
  for (let i = 0; i <= 18; i++) {
    const t = -t0 + (2 * t0 * i) / 18
    p.push([R * Math.cos(t), R * Math.sin(t)])
  }
  k.lathe(mat, p, [0, 0, 0], axis, seg)
  return xs
}

/** Oval bolted joint (bonnet / cover) two plates thick t each, joint plane at y, studs with nuts both ends. */
export function ovalJoint(k: Kit, mat: MatKey, y: number, rx: number, rz: number, t: number, n: number, bd: number) {
  k.add(mat, new THREE.CylinderGeometry(1, 1, 2 * t, 40), mat4([0, y, 0], 'y', [rx, 1, rz]))
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2
    const x = Math.cos(a) * (rx - bd * 1.6)
    const z = Math.sin(a) * (rz - bd * 1.6)
    const y0 = y - t - bd * 0.9
    const len = 2 * t + bd * 2.2
    k.cyl('boltXylan', bd / 2, len, [x, y0 + len / 2, z], 'y', 6)
    k.hex('nut', bd * 1.85, bd * 0.9, [x, y0 + len - bd * 0.45, z])
    k.hex('nut', bd * 1.85, bd * 0.9, [x, y0 + bd * 0.45, z])
  }
}

/** Ring of studs parallel to X through a body joint ring at x (width w), nuts both sides. */
export function jointStuds(k: Kit, n: number, R: number, x: number, w: number, bd: number) {
  const len = w + bd * 2.4
  k.boltCircle('boltXylan', 'nut', n, R, [x - len / 2, 0, 0], 'x', bd, len, [bd * 0.45, len - bd * 0.45])
}

/** Raised cast flow arrow on a +Z facing surface, pointing +X. */
export function flowArrow(k: Kit, mat: MatKey, c: V3, len: number) {
  const w = len * 0.13
  const s = new THREE.Shape()
  s.moveTo(-len / 2, -w / 2)
  s.lineTo(len * 0.18, -w / 2)
  s.lineTo(len * 0.18, -w * 1.5)
  s.lineTo(len / 2, 0)
  s.lineTo(len * 0.18, w * 1.5)
  s.lineTo(len * 0.18, w / 2)
  s.lineTo(-len / 2, w / 2)
  s.closePath()
  k.extrude(mat, s, 0.003, mat4([c[0], c[1], c[2] - 0.001]))
}

/** Hex pipe plug in a small boss pointing along `dir` from `at`. */
export function plug(k: Kit, mat: MatKey, at: V3, dir: 'x' | '-x' | 'y' | '-y' | 'z' | '-z', size: number) {
  const v = new THREE.Vector3(...({ x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1] } as Record<string, V3>)[dir])
  const p = new THREE.Vector3(...at)
  k.cyl(mat, size * 0.75, size * 0.9, p.clone().addScaledVector(v, size * 0.35).toArray() as V3, dir, 14)
  k.hex('nut', size * 1.15, size * 0.45, p.clone().addScaledVector(v, size * 0.95).toArray() as V3, dir)
}

// ---------------------------------------------------------------- ball body

export interface BallBodyOpts {
  nps: number
  rating: Rating
  L: number
  reduced: boolean
  trunnion: boolean
  mat: MatKey
  text: string
}

/** Ball valve body; ball and stem go into mv (open = port along X). Returns the operator mounting face height. */
export function ballBody(k: Kit, mv: Kit, o: BallBodyOpts) {
  const d = dims(o.nps, o.rating, o.L)
  const { D, f, xf, ri } = d
  const rb = o.reduced ? ri * 0.76 : ri
  const Rball = rb * 1.7 + 0.004
  const Rb = Math.min(Rball * 1.13 + Math.max(0.008, D * 0.05), f.od / 2 * (o.trunnion ? 1.05 : 0.95))
  const rn = Math.max(D / 2 * 1.1, (f.hubDia / 2) * 0.94)
  const bd = clamp(f.boltDia * 0.85, 0.01, 0.04)
  const M = o.mat
  for (const s of [-1, 1] as const) endFlange(k, d, s, rn, rb, M)
  const stemR = Math.max(0.008, D * 0.075)
  const rs = Math.max(0.026, D * 0.26)
  let yTop: number
  let plateW = 1
  if (!o.trunnion) {
    // two-piece end-entry body: main body + bolted end connector on +X
    const a = Rb * 1.55
    const xj = Math.min(Rb * 0.5, xf * 0.5)
    const jt = Math.max(0.012, D * 0.09)
    revolveX(k, M, rb, [[rn, -xf - 0.004], ...barrel(Rb, a, -Math.min(xf, a), xj - jt / 2, rn)], d.seg)
    revolveX(k, M, rb, [...barrel(Rb * 0.96, a, xj + jt / 2, Math.min(xf, a), rn), [rn, xf + 0.004]], d.seg)
    const bs = bd * 0.75
    const Rsc = Rb * Math.sqrt(1 - (xj / a) ** 2) + bs * 1.3
    const Rj = Rsc + bs * 1.5
    revolveX(k, M, rb, [[Rj, xj - jt / 2], [Rj, xj + jt / 2]], d.seg)
    jointStuds(k, o.nps >= 3 ? 8 : 4, Rsc, xj, jt, bs)
    yTop = Rb + Math.max(0.022, D * 0.24)
    k.cyl(M, rs, yTop - Rb * 0.6, [0, (yTop + Rb * 0.6) / 2, 0], 'y', 24)
    k.cyl(M, rs * 1.25, 0.008, [0, yTop - 0.004, 0], 'y', 24)
    // packing gland nut and body drain
    k.hex('nut', rs * 1.1, 0.01, [0, yTop - 0.013, rs * 0.0])
    plug(k, M, [-Rb * 0.3, -Rb * 0.86, 0], '-y', Math.max(0.01, D * 0.06))
  } else {
    // three-piece side-entry trunnion body
    const xb = Math.min(xf * 0.6, Rb * 1.0)
    const jt = Math.max(0.016, D * 0.09)
    const Rj = Rb + bd * 2.6
    plateW = 2 * xb - jt - 3.2 * bd
    revolveX(k, M, rb, [[Rb * 0.94, -xb], [Rb, -xb + 0.006], [Rb, xb - 0.006], [Rb * 0.94, xb]], d.seg + 8)
    for (const s of [-1, 1] as const) {
      revolveX(k, M, rb, s < 0 ? [[rn, -xf - 0.004], [rn, -xf + (xf - xb) * 0.35], [Rb * 0.86, -xb - jt * 1.5], [Rb * 0.86, -xb]] : [[Rb * 0.86, xb], [Rb * 0.86, xb + jt * 1.5], [rn, xf - (xf - xb) * 0.35], [rn, xf + 0.004]], d.seg)
      revolveX(k, M, rb, [[Rj, s * xb - jt / 2], [Rj, s * xb + jt / 2]], d.seg + 8)
      jointStuds(k, o.nps >= 10 ? 20 : o.nps >= 6 ? 16 : 12, Rj - bd * 1.35, s * xb, jt, bd)
      // seat sealant injection fittings
      const xs = s * (xb + jt * 1.6)
      const ys = Rb * 0.84
      k.cyl(M, Math.max(0.01, D * 0.05), 0.02, [xs, ys + 0.004, 0], 'y', 12)
      k.hex('brass', Math.max(0.016, D * 0.07), 0.016, [xs, ys + 0.02, 0])
      k.sphere('brass', Math.max(0.008, D * 0.035), [xs, ys + 0.03, 0], undefined, 10)
    }
    yTop = Rb + Math.max(0.03, D * 0.32)
    k.cyl(M, rs, yTop - Rb * 0.7, [0, (yTop + Rb * 0.7) / 2, 0], 'y', 28)
    const tf = Math.max(0.014, D * 0.08)
    k.cyl(M, rs * 1.55, tf, [0, yTop - tf / 2, 0], 'y', 32)
    k.boltCircle('boltXylan', 'nut', 8, rs * 1.3, [0, yTop - tf - 0.006, 0], 'y', bd * 0.6, tf + 0.012 + bd, [0.004])
    // emergency stem sealant fitting on the stem housing
    k.cyl(M, Math.max(0.009, D * 0.04), rs * 0.4, [0, yTop - tf - rs * 0.5, rs * 1.0], 'z', 12)
    k.hex('brass', Math.max(0.014, D * 0.06), 0.012, [0, yTop - tf - rs * 0.5, rs * 1.25], 'z')
    k.sphere('brass', Math.max(0.007, D * 0.03), [0, yTop - tf - rs * 0.5, rs * 1.25 + 0.01], undefined, 10)
    // trunnion cover underneath
    const yb = -Rb - Math.max(0.02, D * 0.2)
    k.cyl(M, rs * 0.9, -yb - Rb * 0.7, [0, (yb - Rb * 0.7) / 2, 0], 'y', 24)
    k.cyl(M, rs * 1.25, tf, [0, yb + tf / 2, 0], 'y', 28)
    k.boltCircle('boltXylan', 'nut', 6, rs * 1.05, [0, yb - bd * 0.6, 0], 'y', bd * 0.6, tf + bd * 1.2, [bd * 0.3])
    plug(k, M, [0, yb, 0], '-y', Math.max(0.014, D * 0.08))
    // body vent on the front, drain under the end adapter
    plug(k, M, [0, Rb * 0.45, Rb * 0.88], 'z', Math.max(0.014, D * 0.08))
    plug(k, M, [-(xb + jt * 2), -Rb * 0.8, 0], '-y', Math.max(0.014, D * 0.07))
    if (o.nps >= 6) for (const s of [-1, 1]) liftingLug(k, [s * xb * 0.62, Rb * 0.96, 0], 'x', clamp(D * 2.4, 0.35, 1.6), M)
    // support feet down to the flange rim
    if (o.nps >= 8) {
      const yf = -f.od / 2
      const w = Math.max(0.012, D * 0.05)
      for (const s of [-1, 1]) {
        k.box(M, [w, -yf - Rb * 0.6, Rb * 1.1], [s * xb * 0.55, (yf - Rb * 0.6) / 2, 0])
        k.box(M, [Rb * 0.5, w * 1.2, Rb * 1.3], [s * xb * 0.55, yf + w * 0.6, 0])
      }
    }
  }
  tagPlate(k, o.text, o.trunnion ? [0, -Rb * 0.25, Rb + 0.002] : [-Rb * 0.35, -Rb * 0.2, Rb * 0.9 + 0.003], 'z', o.trunnion ? clamp(Math.min(Rb * 1.1, plateW), 0.04, 0.16) : clamp(Rb * 0.75, 0.06, 0.16))
  // seats + ball + stem (moving)
  const xs = portedBall(mv, 'stainless', Rball, rb, 'x', d.seg)
  bore(k, rb, -o.L / 2, -xs + 0.0005)
  bore(k, rb, xs - 0.0005, o.L / 2)
  mv.cyl('stainless', stemR, yTop - Rball * 0.8 + 0.03, [0, (yTop + Rball * 0.8 + 0.03) / 2, 0], 'y', 12)
  if (o.trunnion) k.cyl('stainless', stemR * 1.4, Rball * 0.4, [0, -Rball * 1.0, 0], 'y', 12)
  return { yTop, stemR, rs, Rb, D }
}

// ---------------------------------------------------------------- globe body

/** Globe body (bulb, seat-bridge bulge, bolted bonnet). Returns the bonnet top height and radii. */
export function globeBody(k: Kit, nps: number, rating: Rating, L: number, mat: MatKey, control: boolean, text: string, bonnet = true) {
  const d = dims(nps, rating, L)
  const { D, f, xf, ri } = d
  const rn = Math.max(D / 2 * 1.1, (f.hubDia / 2) * 0.94)
  for (const s of [-1, 1] as const) endFlange(k, d, s, rn, ri, mat)
  const Rg = D * (control ? 0.92 : 0.82) + 0.016
  const a = Math.min(Rg * 1.3, xf + Rg * 0.1)
  revolveX(k, mat, ri, [[rn, -xf - 0.004], ...barrel(Rg, a, -Math.min(xf, a * 0.97), Math.min(xf, a * 0.97), rn, 28), [rn, xf + 0.004]], d.seg + 8)
  bore(k, ri, -L / 2, -Rg * 0.55)
  bore(k, ri, Rg * 0.55, L / 2)
  for (const s of [-1, 1]) k.disc('pipeBore', ri, [s * Rg * 0.55, 0, 0], s > 0 ? 'x' : '-x', 20)
  // seat bridge bulge underneath, drain boss
  const yS = -Math.max(Rg * 0.5, ri * 1.08)
  k.cyl(mat, Rg * 0.7, Rg + yS, [0, (yS - Rg) / 2, 0], 'y', 28)
  k.sphere(mat, Rg * 0.7, [0, -Rg * 1.0, 0], [1, 0.32, 1], 28)
  plug(k, mat, [Rg * 0.3, -Rg * 1.15, 0], '-y', Math.max(0.012, D * 0.07))
  const yTop = Rg * 0.95
  const yN = Math.max(Rg * 0.5, ri * 1.08)
  k.cyl(mat, Rg * 0.66, yTop - yN, [0, (yTop + yN) / 2, 0], 'y', 32)
  const t = Math.max(0.01, D * 0.1)
  const bd = clamp(f.boltDia * 0.85, 0.01, 0.032)
  const rj = Rg * 0.72 + bd * 2.4
  ovalJoint(k, mat, yTop, rj, rj, t, nps >= 6 ? 12 : 8, bd)
  const stemR = Math.max(0.007, D * 0.075)
  const hB = control ? Math.max(0.08, D * 0.9 + 0.04) : Math.max(0.05, D * 0.7)
  const yb0 = yTop + t
  if (bonnet) k.cyl(mat, Math.max(stemR * 2.4, Rg * 0.3), hB, [0, yb0 + hB / 2, 0], 'y', 28, Math.max(stemR * 2.6, Rg * 0.46))
  tagPlate(k, text, [0, Rg * 0.22, Rg * 0.98 + 0.004], 'z', clamp(Rg * 0.9, 0.06, 0.16))
  flowArrow(k, 'stainless', [0, -Rg * 0.45, Rg * 0.9], clamp(Rg * 1.0, 0.05, 0.3))
  return { yB: bonnet ? yb0 + hB : yb0, stemR, Rg, D, f, rj }
}

// ---------------------------------------------------------------- gate body

/** Flexible wedge centred at yc (moving with the stem), across the bore, with its stem T-slot stub. */
export function gateWedge(mv: Kit, D: number, ri: number, yc: number) {
  const r = ri * 1.06
  const t = Math.max(0.012, D * 0.14)
  mv.add('stainless', new THREE.CylinderGeometry(r, r * 0.97, t, 36, 1), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, yc, 0))
  mv.box('stainless', [t * 0.7, r * 0.5, t * 1.4], [0, yc + r * 0.95, 0])
}

/** Wedge-gate body with oval bolted bonnet; bore open right through. Returns the bonnet top. */
export function gateBody(k: Kit, nps: number, rating: Rating, L: number, mat: MatKey, text: string) {
  const d = dims(nps, rating, L)
  const { D, f, xf, ri } = d
  const neck = Math.max(D / 2 * 1.12, (f.hubDia / 2) * 0.94)
  for (const s of [-1, 1] as const) endFlange(k, d, s, neck, ri, mat)
  revolveX(k, mat, ri, [[neck, -xf - 0.004], [neck, xf + 0.004]], d.seg)
  const rx = Math.min(D * 0.55 + 0.012, xf)
  const rz = D * 0.66 + 0.014
  const yTop = D * 0.85 + 0.02
  const yBot = -D * 0.5
  // wedge chamber, opened where the bore passes through (the neck covers the cut edge)
  const hole = (ri + neck) / 2
  k.add(mat, punchX(new THREE.CylinderGeometry(1, 1, yTop - yBot, 72, 36), hole, mat4([0, (yTop + yBot) / 2, 0], 'y', [rx, 1, rz])))
  k.add(mat, punchX(new THREE.SphereGeometry(1, 40, 24), hole, mat4([0, yBot, 0], undefined, [rx, D * 0.25, rz])))
  for (const s of [-1, 1]) {
    k.box(mat, [rx * 0.4, yTop - neck, 0.006 + D * 0.03], [s * rx * 0.75, (yTop + neck) / 2, 0])
    k.box(mat, [rx * 0.4, -neck - yBot, 0.006 + D * 0.03], [s * rx * 0.75, (yBot - neck) / 2, 0])
  }
  bore(k, ri, -L / 2, L / 2)
  plug(k, mat, [0, yBot - D * 0.2, 0], '-y', Math.max(0.012, D * 0.07))
  const t = Math.max(0.01, D * 0.11)
  const bd = clamp(f.boltDia * 0.9, 0.01, 0.032)
  ovalJoint(k, mat, yTop, rx + f.boltDia * 2.4, rz + f.boltDia * 2.4, t, nps >= 8 ? 16 : nps >= 4 ? 12 : 8, bd)
  const stemR = Math.max(0.008, D * 0.085)
  const hB = Math.max(0.06, D * 1.2 + 0.03)
  const yb0 = yTop + t
  k.add(mat, new THREE.CylinderGeometry(1, 1, hB, 36), mat4([0, yb0 + hB / 2, 0], 'y', [Math.max(stemR * 2.2, rx * 0.7), 1, Math.max(stemR * 2.2, rz * 0.75)]))
  tagPlate(k, text, [0, yTop * 0.62, rz + 0.003], 'z', clamp(rx * 1.2, 0.06, 0.16))
  return { yB: yb0 + hB, stemR, D, rx, rz, ri }
}

// ---------------------------------------------------------------- OS&Y yoke

/** Packing gland, gland studs, two cast legs in the XY plane and the yoke head with its nut boss. Returns the head top. */
export function osyYoke(k: Kit, mat: MatKey, yB: number, D: number, stemR: number, H: number) {
  const legX = stemR * 2.4 + Math.max(0.02, D * 0.22)
  const legW = Math.max(0.014, D * 0.16)
  const legT = Math.max(0.01, D * 0.09)
  k.cyl(mat, stemR * 2.6, Math.max(0.012, D * 0.1), [0, yB + Math.max(0.006, D * 0.05), 0], 'y', 20)
  k.box(mat, [stemR * 7, Math.max(0.008, D * 0.05), stemR * 3], [0, yB + Math.max(0.016, D * 0.13), 0])
  for (const s of [-1, 1]) k.rod('boltXylan', [s * stemR * 2.8, yB, 0], [s * stemR * 2.8, yB + Math.max(0.03, D * 0.25), 0], Math.max(0.003, stemR * 0.35), 6)
  for (const s of [-1, 1]) {
    k.box(mat, [legW, H, legT], [s * legX, yB + H / 2, 0])
    k.box(mat, [legX - stemR * 1.5, legT * 1.2, legT * 1.4], [s * (legX / 2 + stemR * 0.75), yB + legT * 0.6, 0])
  }
  const yT = yB + H
  k.box(mat, [legX * 2 + legW, legT * 1.6, legT * 2.2], [0, yT - legT * 0.8, 0])
  // yoke sleeve (stem nut) boss with its grease nipple
  k.cyl(mat, stemR * 2.5, legT * 3, [0, yT, 0], 'y', 20)
  k.cyl('brass', Math.max(0.003, stemR * 0.3), legT * 1.2, [stemR * 2.5 + legT * 0.5, yT, 0], 'x', 8)
  k.sphere('brass', Math.max(0.004, stemR * 0.4), [stemR * 2.5 + legT * 1.15, yT, 0], undefined, 8)
  return { top: yT + legT * 1.5, legX, legW, legT }
}

export { pipeOD }
