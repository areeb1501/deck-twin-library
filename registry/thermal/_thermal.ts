// Shared geometry for thermal equipment: body (girth) flanges, formed heads, eccentric cones, nozzle-to-nozzle bolting.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { axisVec } from '../lib/kit'
import { gasket, nozzle, type NozzleOpts } from '../lib/parts'
import { flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export interface Girth {
  Rf: number
  tf: number
  hubL: number
  hubT: number
  Rbc: number
  nb: number
  db: number
}

/** typical: custom body flange for a shell of outside radius Ro (not B16.5/B16.47; sized like TEMA girth flanges). */
export function girthDims(Ro: number): Girth {
  const D = 2 * Ro
  const db = D < 0.6 ? 0.024 : D < 1.2 ? 0.03 : 0.036
  const Rbc = Ro + 0.04 + 1.6 * db
  const Rf = Rbc + 1.4 * db + 0.012
  const tf = clamp(0.05 + 0.06 * D, 0.06, 0.16)
  const nb = Math.max(12, 4 * Math.round((2 * Math.PI * Rbc) / 0.11 / 4))
  return { Rf, tf, hubL: clamp(0.06 + 0.04 * D, 0.07, 0.14), hubT: clamp(0.012 + 0.012 * D, 0.016, 0.04), Rbc, nb, db }
}

/** Girth flange about the X axis at y/z = 0: raised face at `x`, hub running towards `dir`. */
export function girthFlange(k: Kit, mat: MatKey, x: number, Ro: number, G: Girth, dir: 1 | -1, seg = 64) {
  const Ri = Ro * 0.97
  const { Rf, tf, hubL, hubT } = G
  if (dir > 0)
    k.lathe(mat, [[Ri, x], [Rf, x], [Rf, x + tf], [Ro + hubT, x + tf], [Ro, x + tf + hubL]], [0, 0, 0], 'x', seg)
  else k.lathe(mat, [[Ro, x - tf - hubL], [Ro + hubT, x - tf], [Rf, x - tf], [Rf, x], [Ri, x]], [0, 0, 0], 'x', seg)
}

/** Through-studs with a nut at each end, between flange back faces xa < xb, about the X axis. */
export function girthStuds(k: Kit, xa: number, xb: number, G: Girth, R = G.Rbc, n = G.nb, d = G.db, mat: MatKey = 'boltXylan') {
  const nh = d * 0.95
  const len = xb - xa + 2 * nh + 1.2 * d
  k.boltCircle(mat, 'nut', n, R, [xa - nh - 0.6 * d, 0, 0], 'x', d, len, [0.6 * d + nh / 2, len - 0.6 * d - nh / 2], Math.PI / n)
}

/** 2:1 ellipsoidal (or any depth) head about X: tangent line at x0, crown towards dir. */
export function headProfile(R: number, depth: number, x0: number, dir: 1 | -1, n = 18): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (Math.PI / 2)
    pts.push([R * Math.cos(t), x0 + dir * depth * Math.sin(t)])
  }
  return dir > 0 ? pts : pts.reverse()
}

export function head(k: Kit, mat: MatKey, R: number, depth: number, x0: number, dir: 1 | -1, seg = 64) {
  k.lathe(mat, headProfile(R, depth, x0, dir), [0, 0, 0], 'x', seg)
}

/** Shell cylinder about X between x0 < x1. */
export function shellX(k: Kit, mat: MatKey, R: number, x0: number, x1: number, seg = 64) {
  if (x1 - x0 > 1e-4) k.lathe(mat, [[R, x0], [R, x1]], [0, 0, 0], 'x', seg)
}

/** Circumferential weld seam bead about X. */
export function seamX(k: Kit, mat: MatKey, R: number, x: number) {
  k.torus(mat, R + 0.001, 0.005, [x, 0, 0], 'x', 6, 64)
}

/** Eccentric cone about X, circle (r0, centre y0) at x0 to (r1, y1) at x1 (flat-bottom kettle reducer). */
export function eccentricCone(k: Kit, mat: MatKey, x0: number, r0: number, y0: number, x1: number, r1: number, y1: number, seg = 64) {
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    pos.push(x0, y0 + r0 * s, r0 * c, x1, y1 + r1 * s, r1 * c)
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  k.add(mat, g)
}

/** Gasket + through-studs for two B16.5 flanges meeting face to face at `mid` along `axis`. */
export function jointBolting(k: Kit, nps: number, rating: Rating, mid: V3, axis: V3) {
  const f = flangeDims(nps, rating)
  const v = axisVec(axis)
  const g = 0.0045
  gasket(k, nps, rating, mid, axis, g)
  const span = 2 * (f.thickness + f.raisedFaceHeight) + g
  const studL = span + f.boltDia * 3
  const start = new THREE.Vector3(...mid).addScaledVector(v, -studL / 2).toArray() as V3
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, start, axis, f.boltDia, studL, [f.boltDia * 0.95, studL - f.boltDia * 0.95])
}

/** Earthing boss: small stainless pad with a bolt, on a surface facing +normal. */
export function earthBoss(k: Kit, pos: V3, normal: 'x' | 'z' | '-x' | '-z' | 'y') {
  k.box('stainless', [0.05, 0.05, 0.05], pos)
  const v = axisVec(normal)
  k.hex('nut', 0.022, 0.012, [pos[0] + v.x * 0.03, pos[1] + v.y * 0.03, pos[2] + v.z * 0.03], normal)
}

/** nozzle() with a dark bore end just above the shell (and pad) surface, so an open nozzle reads hollow instead of showing the painted shell. */
export function openNozzle(k: Kit, o: NozzleOpts & { shellR?: number }): V3 {
  const face = nozzle(k, o)
  if (!o.blind) {
    const ri = pipeOD(o.nps) / 2 - pipeWall(o.nps, '80')
    const sag = o.shellR ? o.shellR - Math.sqrt(Math.max(0, o.shellR ** 2 - ri ** 2)) : 0
    const d = new THREE.Vector3(...o.dir).normalize()
    const c = new THREE.Vector3(...o.base).addScaledVector(d, Math.max(sag + 0.004, o.pad ? 0.0095 : 0.004))
    k.disc('pipeBore', ri * 0.995, c.toArray() as V3, d.toArray() as V3, 28)
  }
  return face
}
