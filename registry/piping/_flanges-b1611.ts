// ASME B16.11 forged socket-weld / threaded fitting and MSS SP-97 branch-outlet dimension tables (mm), plus grid-mesh and ray-surface helpers.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { mm, nearest, tableKeys } from '../lib/standards'

export type Klass = 3000 | 6000
const at = <T>(t: Record<number, T>, nps: number): T => t[nearest(tableKeys(t), nps)]

// B16.11 socket-weld: [socket bore B, socket depth J, socket wall C 3000, C 6000, bore D 3000, D 6000, A90 3000, A90 6000, A45 3000, A45 6000]
const SW: Record<number, number[]> = {
  0.5: [21.95, 10, 4.65, 5.95, 16.6, 12.5, 15.5, 19.5, 11.5, 12.5],
  0.75: [27.3, 13, 4.9, 6.95, 21.7, 16.3, 19.5, 22.5, 12.5, 14.5],
  1: [34.05, 13, 5.7, 7.9, 27.4, 21.5, 22, 27, 14, 17],
  1.25: [42.8, 13, 6.05, 7.9, 35.8, 30.2, 27, 32, 17, 21],
  1.5: [48.9, 13, 6.35, 8.9, 41.7, 34.7, 32, 38, 21, 25],
  2: [61.35, 16, 6.95, 10.9, 53.5, 43.6, 38, 41, 25, 29],
  // approx: 6000 above NPS 2 is not in B16.11; extrapolated
  2.5: [74.2, 16, 8.75, 12.5, 64.2, 52, 41.5, 50, 29, 33],
  3: [90.15, 16, 9.5, 14, 79.5, 64, 57.5, 60, 31.5, 37],
  4: [115.8, 19, 10.7, 16, 103.8, 86, 66.5, 72, 41.5, 46],
}
export function socket(nps: number, cls: Klass) {
  const r = at(SW, nps)
  const s = cls === 6000 ? 1 : 0
  return { bore: mm(r[0]), depth: mm(r[1]), wall: mm(r[2 + s]), d: mm(r[4 + s]), a90: mm(r[6 + s]), a45: mm(r[8 + s]) }
}

// approx: B16.11 threaded fittings [A90, A45, band OD H, min thread length] for Class 3000 / 6000, from the B16.11 tables (threaded 3000 pairs with SW 6000 wall).
const THD: Record<number, [number[], number[]]> = {
  0.5: [[33.5, 25, 38, 10.9], [38, 28.5, 46, 10.9]],
  0.75: [[38, 28.5, 46, 12.7], [44.5, 33.5, 56, 12.7]],
  1: [[44.5, 33.5, 56, 14.7], [51, 35, 62, 14.7]],
  1.25: [[51, 35, 62, 17], [60.5, 43.5, 75, 17]],
  1.5: [[60.5, 43.5, 75, 17.8], [64, 44.5, 84, 17.8]],
  2: [[64, 44.5, 84, 19], [83, 52, 102, 19]],
  2.5: [[83, 52, 102, 23.6], [95, 64, 121, 23.6]],
  3: [[95, 64, 121, 25.9], [106, 79, 146, 25.9]],
  4: [[114, 79, 152, 27.7], [114, 79, 152, 27.7]],
}
export function threaded(nps: number, cls: Klass) {
  const r = at(THD, nps)[cls === 6000 ? 1 : 0]
  return { a90: mm(r[0]), a45: mm(r[1]), od: mm(r[2]), thread: mm(r[3]) }
}

// MSS SP-97 Weldolet (standard weight): [A height, B base OD, C base bore].
const WELDOLET: Record<number, number[]> = {
  0.25: [14.3, 25.4, 15.9], 0.375: [19.05, 31.75, 19.05], 0.5: [19.05, 34.93, 23.81], 0.75: [22.23, 44.45, 30.16], 1: [26.99, 53.98, 36.51],
  1.25: [31.75, 65.09, 44.45], 1.5: [33.34, 73.03, 50.8], 2: [38.1, 88.9, 65.09], 2.5: [41.28, 103.19, 76.2], 3: [44.45, 122.24, 93.66],
  3.5: [47.63, 142.88, 112.71], 4: [50.8, 152.4, 120.65], 5: [57.15, 179.3, 141.29], 6: [60.33, 215.9, 169.86], 8: [69.85, 263.53, 220.66],
  10: [77.79, 322.26, 274.64], 12: [85.73, 377.83, 325.44], 14: [88.9, 409.58, 357.19], 16: [93.6, 463.55, 407.99], 18: [96.84, 520.7, 458.79],
  20: [101.6, 571.5, 508], 24: [144.5, 717.5, 609.6],
}
// MSS SP-97 Sockolet [A, B body OD, D bore] for Class 3000 and 6000 (Thredolet shares the envelope, approx).
const SOCKOLET: Record<Klass, Record<number, number[]>> = {
  3000: {
    0.25: [19.05, 25.4, 9.25], 0.375: [20.64, 31.75, 12.52], 0.5: [25.4, 35.72, 15.8], 0.75: [26.99, 43.66, 20.93], 1: [33.34, 50.8, 26.64],
    1.25: [33.34, 65.09, 35.05], 1.5: [34.93, 72.23, 40.89], 2: [38.1, 88.11, 52.5], 2.5: [39.69, 103.19, 62.71], 3: [44.45, 122.24, 77.93],
    4: [47.63, 151.61, 102.26],
  },
  6000: { 0.5: [31.75, 43.66, 11.84], 0.75: [36.51, 49.61, 15.6], 1: [39.69, 61.91, 20.7], 1.25: [41.28, 69.06, 29.46], 1.5: [42.86, 82.55, 33.99], 2: [52.39, 102.39, 42.9] },
}
export const weldolet = (nps: number) => at(WELDOLET, nps).map(mm)
export const sockolet = (nps: number, cls: Klass) => at(SOCKOLET[cls], nps).map(mm)

// ------------------------------------------------------------------ meshing

/** Quad grid P[i][j] with optional explicit normals; otherwise normals from central differences, oriented by `ref`. `wrap` joins the last column to the first. */
export function gridMesh(k: Kit, mat: MatKey, P: V3[][], opts: { N?: V3[][]; ref?: (p: V3, i: number, j: number) => V3; wrap?: boolean } = {}) {
  const nr = P.length
  const nc = P[0].length
  const V = (q: V3) => new THREE.Vector3(...q)
  const pos: number[] = []
  const nor: number[] = []
  const N: THREE.Vector3[][] = []
  for (let i = 0; i < nr; i++) {
    N.push([])
    for (let j = 0; j < nc; j++) {
      let n: THREE.Vector3
      if (opts.N) n = V(opts.N[i][j])
      else {
        const jm = j > 0 ? j - 1 : opts.wrap ? nc - 2 : 0
        const jp = j < nc - 1 ? j + 1 : opts.wrap ? 1 : nc - 1
        const im = Math.max(0, i - 1)
        const ip = Math.min(nr - 1, i + 1)
        n = V(P[i][jp]).sub(V(P[i][jm])).cross(V(P[ip][j]).sub(V(P[im][j])))
        if (n.lengthSq() < 1e-20) n.set(0, 1, 0)
        n.normalize()
        if (opts.ref && n.dot(V(opts.ref(P[i][j], i, j))) < 0) n.negate()
      }
      N[i].push(n)
      pos.push(...P[i][j])
      nor.push(n.x, n.y, n.z)
    }
  }
  let sign = 0
  for (let i = 0; i < nr - 1 && !sign; i++)
    for (let j = 0; j < nc - 1 && !sign; j++) {
      const a = V(P[i][j])
      const g = V(P[i + 1][j]).sub(a).cross(V(P[i][j + 1]).sub(a))
      if (g.lengthSq() > 1e-16) sign = g.dot(N[i][j]) >= 0 ? 1 : -1
    }
  const idx: number[] = []
  for (let i = 0; i < nr - 1; i++)
    for (let j = 0; j < nc - 1; j++) {
      const a = i * nc + j
      const b = a + nc
      if (sign >= 0) idx.push(a, b, a + 1, b, b + 1, a + 1)
      else idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  k.add(mat, g)
}

/** Bisection along q + s·a for where f (distance-minus-radius, < 0 inside) crosses zero between s0 (inside) and s1 (outside). */
export function rayHit(f: (p: THREE.Vector3) => number, q: THREE.Vector3, a: THREE.Vector3, s0: number, s1: number) {
  const p = new THREE.Vector3()
  let lo = s0
  let hi = s1
  for (let it = 0; it < 48; it++) {
    const m = (lo + hi) / 2
    if (f(p.copy(q).addScaledVector(a, m)) < 0) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

/**
 * Cylinder about X from x0 to x1 (radius r) with a round hole of radius h on its +Y side centred at x = 0, so a
 * perpendicular branch bore can open into it. Shares one angular sampling across the patch, strip and ends.
 */
export function cutCylinder(k: Kit, mat: MatKey, r: number, x0: number, x1: number, h: number, inward: boolean, nv = 48) {
  h = Math.min(h, r * 0.95)
  const step = (Math.PI * 2) / nv
  const du = Math.min(h * 1.3 + 0.0015, Math.min(-x0, x1) * 0.95)
  const kv = Math.min(Math.ceil((Math.asin(h / r) * 1.2 + 0.05) / step), nv / 2 - 2)
  const dv = kv * step
  const S = (u: number, v: number): V3 => [u, r * Math.cos(v), r * Math.sin(v)]
  const Nn = (v: number): V3 => (inward ? [0, -Math.cos(v), -Math.sin(v)] : [0, Math.cos(v), Math.sin(v)])
  const nuS = 6
  const rect: [number, number][] = []
  for (let m = 0; m <= 2 * kv; m++) rect.push([du, -dv + step * m])
  for (let i = 1; i <= nuS; i++) rect.push([du - (2 * du * i) / nuS, dv])
  for (let m = 1; m <= 2 * kv; m++) rect.push([-du, dv - step * m])
  for (let i = 1; i <= nuS; i++) rect.push([-du + (2 * du * i) / nuS, -dv])
  const P: V3[][] = []
  const N: V3[][] = []
  for (let i = 0; i <= 4; i++) {
    P.push([])
    N.push([])
    for (const [qu, qv] of rect) {
      const t = Math.atan2(qv / dv, qu / du)
      const hu = h * Math.cos(t)
      const hv = Math.atan2(h * Math.sin(t), Math.sqrt(r * r - (h * Math.sin(t)) ** 2))
      const u = hu + (qu - hu) * (i / 4)
      const v = hv + (qv - hv) * (i / 4)
      P[i].push(S(u, v))
      N[i].push(Nn(v))
    }
  }
  gridMesh(k, mat, P, { N })
  const band = (u0: number, u1: number, v0: number, v1: number, nu: number, n: number) => {
    const Q: V3[][] = []
    const M: V3[][] = []
    for (let i = 0; i <= nu; i++) {
      Q.push([])
      M.push([])
      for (let j = 0; j <= n; j++) {
        const v = v0 + ((v1 - v0) * j) / n
        Q[i].push(S(u0 + ((u1 - u0) * i) / nu, v))
        M[i].push(Nn(v))
      }
    }
    gridMesh(k, mat, Q, { N: M })
  }
  band(-du, du, dv, Math.PI * 2 - dv, nuS, nv - 2 * kv)
  band(x0, -du, 0, Math.PI * 2, 1, nv)
  band(du, x1, 0, Math.PI * 2, 1, nv)
}

/** Branch tube of radius rb along +Y from its saddle on an X-axis cylinder of radius rr up to y1. */
export function saddleTube(k: Kit, mat: MatKey, rb: number, rr: number, y1: number, inward: boolean, nT = 48) {
  rb = Math.min(rb, rr * 0.95)
  const P: V3[][] = []
  const N: V3[][] = []
  for (let i = 0; i <= 3; i++) {
    P.push([])
    N.push([])
    for (let j = 0; j <= nT; j++) {
      const t = (j / nT) * Math.PI * 2
      const ys = Math.sqrt(rr * rr - (rb * Math.sin(t)) ** 2)
      P[i].push([rb * Math.cos(t), ys + ((y1 - ys) * i) / 3, rb * Math.sin(t)])
      N[i].push(inward ? [-Math.cos(t), 0, -Math.sin(t)] : [Math.cos(t), 0, Math.sin(t)])
    }
  }
  gridMesh(k, mat, P, { N })
}
