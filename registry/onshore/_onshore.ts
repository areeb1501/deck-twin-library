// Shared onshore parts: plinths, anchor bolts, earth bonds, ISO 14122 stairs, shedded insulators, lattice steel and swivel joints.
import * as THREE from 'three'
import { axisVec, type Axis, type Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { grating, handrail, member } from '../lib/parts'
import { stairFlight } from '../lib/standards'

export const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
export const deg = (d: number) => (d * Math.PI) / 180
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export const porcelain = () => paint('#6e3420', { metalness: 0.05, roughness: 0.12, clearcoat: 0.9, clearcoatRoughness: 0.1, weather: 0 })
export const silicone = () => paint('#8b9399', { metalness: 0, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5, weather: 0.3 })
export const earthLead = () => paint('#5c9e33', { metalness: 0, roughness: 0.6, clearcoat: 0, weather: 0 })
export const lightGrey = () => paint('#cfd2cf', { metalness: 0.2, roughness: 0.5, clearcoat: 0.25, weather: 1 })

/** Concrete plinth from y0 up to y0 + h with a small arris, centred on (cx, cz). */
export function plinth(k: Kit, cx: number, cz: number, sx: number, sz: number, h: number, y0 = 0) {
  const c = Math.min(0.025, h * 0.2)
  k.box('concrete', [sx, h - c, sz], [cx, y0 + (h - c) / 2, cz])
  k.box('concrete', [sx - 2 * c, c, sz - 2 * c], [cx, y0 + h - c / 2, cz])
}

/** Cast-in anchor bolt standing on a surface at p: washer, double nut, projecting thread. */
export function anchorBolt(k: Kit, p: V3, dia = 0.024) {
  k.cyl('galvanised', dia * 1.1, 0.005, [p[0], p[1] + 0.0025, p[2]], 'y', 12)
  k.hex('nut', dia * 1.85, dia * 0.9, [p[0], p[1] + 0.005 + dia * 0.45, p[2]])
  k.hex('nut', dia * 1.85, dia * 0.9, [p[0], p[1] + 0.005 + dia * 1.4, p[2]])
  k.cyl('boltXylan', dia / 2, dia * 2.6, [p[0], p[1] + dia * 1.3, p[2]], 'y', 8)
}

/** Steel base plate with its top at y, on a grout bed, anchored near each corner. */
export function basePlate(k: Kit, cx: number, y: number, cz: number, sx: number, sz: number, t = 0.025, dia = 0.024, mat: MatKey = 'galvanised') {
  k.box(mat, [sx, t, sz], [cx, y - t / 2, cz])
  const ix = sx / 2 - dia * 2.2
  const iz = sz / 2 - dia * 2.2
  for (const a of [-1, 1]) for (const b of [-1, 1]) anchorBolt(k, [cx + a * ix, y, cz + b * iz], dia)
}

/** Earth boss with a bolted lug and a green/yellow bonding lead down to an inspection pit at grade. */
export function earthBond(k: Kit, pos: V3, out: V3, ground = 0, pitOffset = 0.3) {
  const o = new THREE.Vector3(...out).normalize().toArray() as V3
  k.cyl('brass', 0.017, 0.03, add(pos, o, 0.015), o, 10)
  k.box('copper', [0.03, 0.05, 0.004], add(add(pos, o, 0.032), [0, -0.012, 0]), o)
  k.hex('nut', 0.022, 0.012, add(pos, o, 0.04), o)
  const lug = add(add(pos, o, 0.035), [0, -0.035, 0])
  const pit: V3 = [pos[0] + o[0] * pitOffset, ground, pos[2] + o[2] * pitOffset]
  if (pos[1] - ground > 0.12) {
    k.spline(earthLead(), [lug, add(lug, [0, -0.08, 0]), add([pit[0], ground + 0.25, pit[2]], o, -pitOffset * 0.3), [pit[0], ground + 0.1, pit[2]], [pit[0], ground + 0.03, pit[2]]], 0.0065, 6, 24)
    k.cyl('concrete', 0.14, 0.05, [pit[0], ground + 0.025, pit[2]], 'y', 16)
    k.cyl('castIron', 0.1, 0.008, [pit[0], ground + 0.054, pit[2]], 'y', 16)
  }
}

/** ISO 14122-3 straight stair: first riser at `foot`, climbing along `dir` by `rise`. Channel stringers, grating treads, handrails. Returns the horizontal run. */
export function stair(k: Kit, foot: V3, dir: Axis, rise: number, width = 0.9, rails: 'both' | 'left' | 'right' | 'none' = 'both') {
  const f = stairFlight(rise)
  const n = f.steps
  const g = f.going
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), axisVec(dir).setY(0).normalize())
  const w = width / 2
  const slope = f.riser / g
  k.with(new THREE.Matrix4().compose(new THREE.Vector3(...foot), q, new THREE.Vector3(1, 1, 1)), () => {
    const sd = 0.18
    const yAt = (x: number) => f.riser + x * slope - 0.07
    const x0 = (sd * 0.45 + 0.07 - f.riser) / slope
    const run = (n - 1) * g
    for (const s of [-1, 1]) {
      const z = s * (w + 0.04)
      member(k, [x0, yAt(x0), z], [run, yAt(run), z], 'UPN 180', 'galvanised', [-slope, 1, 0])
      k.box('galvanised', [0.22, 0.015, 0.16], [x0 + 0.06, 0.0075, z])
    }
    for (let i = 1; i < n; i++) {
      const y = i * f.riser
      grating(k, [(i - 1) * g + g / 2 + 0.0125, y, 0], g + 0.025, width)
      k.box('safetyYellow', [0.03, 0.032, width], [(i - 1) * g + 0.015, y - 0.016, 0])
    }
    const pts = (z: number): V3[] => [[0, f.riser * 0.5, z], [run, rise, z]]
    if (rails === 'both' || rails === 'left') handrail(k, pts(w + 0.04), 'safetyYellow')
    if (rails === 'both' || rails === 'right') handrail(k, pts(-w - 0.04), 'safetyYellow')
  })
  return (n - 1) * g
}

/** Shedded post insulator from `base` along `axis` for L: galvanised end caps, alternating sheds of radius ~2.2 r. */
export function insulator(k: Kit, base: V3, L: number, r: number, mat: MatKey, axis: Axis = 'y') {
  const v = axisVec(axis).toArray() as V3
  const cap = Math.min(0.08, L * 0.08)
  const prof: [number, number][] = [[0, cap], [r, cap]]
  const body = L - 2 * cap
  const n = Math.max(3, Math.round(body / Math.max(0.045, r * 0.75)))
  const pitch = body / n
  let y = cap
  for (let i = 0; i < n; i++) {
    const big = i % 2 === 0 ? 2.3 : 1.85
    prof.push([r * 1.05, y + pitch * 0.15], [r * big, y + pitch * 0.42], [r * (big - 0.1), y + pitch * 0.55], [r, y + pitch * 0.62])
    y += pitch
    prof.push([r, y])
  }
  prof.push([0, L - cap])
  k.lathe(mat, prof, base, v, 20)
  for (const t of [cap / 2, L - cap / 2]) k.cyl('galvanised', r * 1.25, cap, add(base, v, t), v, 18)
  for (const t of [0.006, L - 0.006]) k.cyl('galvanised', r * 1.9, 0.012, add(base, v, t), v, 18)
}

/** Square lattice column of four angle legs with zig-zag bracing on every face, (cx, cz) centre, from y0 to y1. */
export function latticeColumn(k: Kit, cx: number, cz: number, y0: number, y1: number, w: number, leg = 'L100x100x10', brace = 'L50x50x5', mat: MatKey = 'galvanised') {
  const h = w / 2
  const c: [number, number][] = [[-h, -h], [h, -h], [h, h], [-h, h]]
  for (const [x, z] of c) member(k, [cx + x, y0, cz + z], [cx + x, y1, cz + z], leg, mat, [-x, 0, -z])
  const H = y1 - y0
  const nb = Math.max(1, Math.round(H / w))
  const dy = H / nb
  for (let f = 0; f < 4; f++) {
    const [ax, az] = c[f]
    const [bx, bz] = c[(f + 1) % 4]
    for (let i = 0; i < nb; i++) {
      const ya = y0 + i * dy
      const flip = (i + f) % 2 === 0
      const p0: V3 = [cx + (flip ? ax : bx), ya, cz + (flip ? az : bz)]
      const p1: V3 = [cx + (flip ? bx : ax), ya + dy, cz + (flip ? bz : az)]
      member(k, p0, p1, brace, mat, [ax + bx, 0, az + bz])
    }
    member(k, [cx + ax, y1 - 0.03, cz + az], [cx + bx, y1 - 0.03, cz + bz], brace, mat)
  }
}

/** Swivel joint between a and b: two ball-race housings, seal ring, grease nipples and plug bolts. od = pipe OD. */
export function swivel(k: Kit, a: V3, b: V3, od: number, mat: MatKey = 'flangeSteel') {
  const A = new THREE.Vector3(...a)
  const d = new THREE.Vector3(...b).sub(A)
  const L = d.length()
  d.normalize()
  const v = d.toArray() as V3
  const at = (t: number) => A.clone().addScaledVector(d, t).toArray() as V3
  const R = od * 0.82
  const ri = od * 0.44
  ring(k, mat, ri, od * 0.56, L, at(L / 2), v)
  k.cyl('pipeBore', ri, L, at(L / 2), v, 32, undefined, true)
  ring(k, mat, od * 0.55, R, L * 0.36, at(L * 0.3), v)
  ring(k, 'machined', od * 0.55, R * 0.96, L * 0.04, at(L * 0.5), v)
  ring(k, mat, od * 0.55, R * 0.92, L * 0.3, at(L * 0.69), v)
  for (const t of [0.12, 0.88]) ring(k, mat, od * 0.55, od * 0.7, L * 0.06, at(L * t), v)
  const [u, w] = perpOf(d)
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2
    const r = new THREE.Vector3().addScaledVector(u, Math.cos(ang) * R).addScaledVector(w, Math.sin(ang) * R)
    const p = new THREE.Vector3(...at(L * 0.3)).add(r)
    k.hex('nut', Math.max(0.018, od * 0.06), 0.012, p.toArray() as V3, r.clone().normalize().toArray() as V3)
  }
  const gp = new THREE.Vector3(...at(L * 0.69)).addScaledVector(u, R * 0.92)
  k.cyl('brass', Math.max(0.006, od * 0.02), 0.03, gp.clone().addScaledVector(u, 0.012).toArray() as V3, u.toArray() as V3, 8)
}

function perpOf(d: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(d, ref).normalize()
  return [u, new THREE.Vector3().crossVectors(d, u).normalize()]
}

/** Annular ring (hollow short cylinder) centred on pos along axis, open through the middle. */
export function ring(k: Kit, mat: MatKey, ri: number, ro: number, h: number, pos: V3, axis: Axis = 'y', seg = 36) {
  const v = axisVec(axis)
  const base = new THREE.Vector3(...pos).addScaledVector(v, -h / 2).toArray() as V3
  k.lathe(mat, [[ro, 0], [ro, h], [ri, h], [ri, 0], [ro, 0]], base, v.toArray() as V3, seg)
}

/** Hydraulic cylinder from a (barrel end clevis) to b (rod eye). */
export function hydraulicCylinder(k: Kit, a: V3, b: V3, bore: number, mat: MatKey = 'actuatorBlue') {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const L = A.distanceTo(B)
  if (L < 1e-3) return
  const d = B.clone().sub(A).normalize()
  const bl = Math.min(L * 0.62, L - 0.1)
  const p = (t: number) => A.clone().addScaledVector(d, t).toArray() as V3
  k.rod(mat, p(0.04), p(bl), bore / 2, 16)
  k.rod(mat, p(0.04), p(0.1), bore * 0.62, 16)
  k.rod(mat, p(bl - 0.06), p(bl), bore * 0.62, 16)
  k.rod('stainless', p(bl), p(L - 0.04), bore * 0.28, 12)
  const side = Math.abs(d.x) > 0.9 ? 'z' : 'x'
  for (const t of [0.02, L - 0.02]) k.cyl('flangeSteel', bore * 0.45, bore * 0.6, p(t), side, 12)
  k.rod('tubing', add(p(0.12), [0, bore * 0.6, 0]), add(p(bl - 0.08), [0, bore * 0.6, 0]), 0.006, 6)
}

/**
 * Trapezoidal profiled sheet (wall or roof cladding): profile runs along `u` for `length`, ribs stand out along `n`,
 * extruded `height` along `w`; `origin` is the (0, 0, 0) corner. Typical 35 mm rib at 200 mm pitch.
 */
export function profiledSheet(k: Kit, mat: MatKey, length: number, height: number, origin: V3, u: V3, n: V3, w: V3, pitch = 0.2, depth = 0.035) {
  const top = pitch * 0.2
  const slope = pitch * 0.15
  const pts: [number, number][] = [[0, 0]]
  const ribs = Math.max(1, Math.round(length / pitch))
  const sc = length / (ribs * pitch)
  for (let i = 0; i < ribs; i++) {
    const a = i * pitch * sc
    const m = a + (pitch * sc) / 2
    pts.push([m - (top / 2 + slope) * sc, 0], [m - (top / 2) * sc, depth], [m + (top / 2) * sc, depth], [m + (top / 2 + slope) * sc, 0])
  }
  pts.push([length, 0])
  const sh = new THREE.Shape()
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)))
  for (let i = pts.length - 1; i >= 0; i--) sh.lineTo(pts[i][0], pts[i][1] - 0.0015)
  sh.closePath()
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...u), new THREE.Vector3(...n), new THREE.Vector3(...w)).setPosition(...origin)
  k.extrude(mat, sh, height, m, 1)
}
