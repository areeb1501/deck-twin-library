/**
 * Shared geometry kit for pressure vessels (horizontal / vertical vessels, shell & tube
 * exchangers, pig traps).
 *
 * Everything is built in EQUIPMENT-LOCAL coordinates and collected into a `Parts`
 * bucket keyed by material, so each model ends up with ~one draw call per material.
 *
 * Conventions
 *  - `lathe()` revolves a (r, y) profile around +Y (x = r sin phi, z = r cos phi).
 *    Walk the profile so the solid is on the LEFT (outer walls go up, inner walls go down).
 *  - `toX()` turns a +Y lathe into a +X lathe (rotateZ(-pi/2): y -> x). After it, lathe
 *    phi = 0 points at +Z, phi = pi/2 at -Y (bottom), phi = -pi/2 at +Y (top).
 *  - `vesselInner` is BackSide, so cavity surfaces are built with OUTWARD normals at the
 *    inner radius. A copy of the outer skin is added too so a section cut through the wall
 *    reads as solid steel.
 */
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { computeBounds, mergeFast, transformGeometry, unit } from '../../three/fastGeo'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { materials, registerMaterial, type MaterialName } from '../../three/materials'
import { GASKET, flange, pipeOD } from '../../model/catalog'
import { weldNeckFlange } from '../../three/pipeGeometry'
import { dirToLocal, toLocal } from '../../model/geom'
import type { Equipment, Nozzle, Rating } from '../../model/types'

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
export const UP = V(0, 1, 0)
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const TAU = Math.PI * 2

// ===================================================================== geometry plumbing

/** Make a geometry mergeable: indexed, position/normal/uv only, no groups. */
export function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let out = g
  if (!out.index) {
    // extrusions / non-indexed builders: weld identical vertices (keeps creases, since
    // normals differ across a crease)
    if (!out.getAttribute('normal')) out.computeVertexNormals()
    out = mergeVertices(out, 1e-6)
  }
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name)
  }
  out.morphAttributes = {}
  if (!out.getAttribute('normal')) out.computeVertexNormals()
  if (!out.getAttribute('uv')) {
    const n = out.getAttribute('position').count
    out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
  }
  out.clearGroups()
  return out
}

export type MatKey = MaterialName | THREE.Material

export interface PartEntry {
  key: string
  material: THREE.Material
  geometry: THREE.BufferGeometry
  shadow: boolean
}

/** Material-keyed geometry bucket. */
export class Parts {
  private map = new Map<MatKey, THREE.BufferGeometry[]>()
  add(mat: MatKey, g: THREE.BufferGeometry | null | undefined, m?: THREE.Matrix4) {
    if (!g) return
    if (m) transformGeometry(g, m)
    const list = this.map.get(mat) ?? []
    list.push(prep(g))
    this.map.set(mat, list)
  }
  build(): PartEntry[] {
    const all = materials()
    const out: PartEntry[] = []
    let i = 0
    for (const [k, list] of this.map) {
      if (!list.length) continue
      const geometry = list.length === 1 ? list[0] : mergeFast(list)
      if (!geometry) {
        console.warn('[vesselParts] merge failed for', typeof k === 'string' ? k : k.name)
        continue
      }
      if (list.length > 1) list.forEach((g) => g.dispose())
      computeBounds(geometry)
      const material = typeof k === 'string' ? all[k] : k
      out.push({
        key: `${typeof k === 'string' ? k : material.uuid}-${i++}`,
        material,
        geometry,
        shadow: !material.transparent && material.side !== THREE.BackSide && material.alphaTest === 0,
      })
    }
    return out
  }
}

/** Renders a built Parts list; disposes geometry when it changes/unmounts. */
export function PartMeshes({ entries }: { entries: PartEntry[] }) {
  useEffect(() => () => entries.forEach((e) => e.geometry.dispose()), [entries])
  return (
    <>
      {entries.map((e) => (
        <mesh key={e.key} geometry={e.geometry} material={e.material} castShadow={e.shadow} receiveShadow />
      ))}
    </>
  )
}

/** One InstancedMesh with fixed matrices (tubes, cyclones...). */
export function Instances({
  geometry,
  material,
  matrices,
  shadow = true,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrices: THREE.Matrix4[]
  shadow?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat))
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    m.computeBoundingBox()
  }, [matrices])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (!matrices.length) return null
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} castShadow={shadow} receiveShadow />
}

// ===================================================================== transforms

/** Matrix whose local +Y maps to `yAxis` and local +Z (lathe phi=0) towards `zRef`. */
export function frame(origin: THREE.Vector3, yAxis: THREE.Vector3, zRef?: THREE.Vector3): THREE.Matrix4 {
  const y = yAxis.clone().normalize()
  let z = zRef ? zRef.clone() : Math.abs(y.y) < 0.9 ? V(0, 1, 0) : V(0, 0, 1)
  z.addScaledVector(y, -z.dot(y))
  if (z.lengthSq() < 1e-8) {
    z = Math.abs(y.x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1)
    z.addScaledVector(y, -z.dot(y))
  }
  z.normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin)
}

/** Matrix with explicit local X and Y axes (Z = X x Y). */
export function basisM(origin: THREE.Vector3, xAxis: THREE.Vector3, yAxis: THREE.Vector3): THREE.Matrix4 {
  const x = xAxis.clone().normalize()
  const y = yAxis.clone().addScaledVector(x, -yAxis.dot(x)).normalize()
  const z = new THREE.Vector3().crossVectors(x, y)
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin)
}

export const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)

/** lathe around +Y  ->  lathe around +X */
export function toX(g: THREE.BufferGeometry) {
  g.rotateZ(-Math.PI / 2)
  return g
}

// ===================================================================== primitives

const _t = new THREE.Matrix4()
const _s = new THREE.Matrix4()

export function box(w: number, h: number, d: number, m?: THREE.Matrix4) {
  const g: THREE.BufferGeometry = new THREE.BoxGeometry(w, h, d)
  if (m) transformGeometry(g, m)
  return g
}
export function boxAt(w: number, h: number, d: number, x: number, y: number, z: number) {
  return box(w, h, d, T(x, y, z))
}

/** Solid round bar from a to b. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 10, open = false) {
  const d = b.clone().sub(a)
  const L = d.length()
  const g = unit(`cyl|${seg}|${open ? 1 : 0}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open))
  const m = frame(a, L > 1e-6 ? d : UP).multiply(_t.makeTranslation(0, L / 2, 0)).multiply(_s.makeScale(r, Math.max(L, 1e-4), r))
  return transformGeometry(g, m)
}

/** Hex nut centred at c with axis `axis`. af = across flats. */
export function hexNut(c: THREE.Vector3, axis: THREE.Vector3, af: number, h: number) {
  const R = af / Math.sqrt(3)
  const g = unit('cyl|6|0', () => new THREE.CylinderGeometry(1, 1, 1, 6))
  return transformGeometry(g, frame(c, axis).multiply(_s.makeScale(R, h, R)))
}

export type Prof = [number, number][]

/**
 * Lathe with crease control: profile segments meeting at less than `crease` degrees share
 * a smoothed normal, sharper corners are split. Same winding as latheCrisp.
 */
export function lathe(profile: Prof, segments = 48, phiStart = 0, phiLength = TAU, crease = 32): THREE.BufferGeometry {
  type S = { r0: number; y0: number; r1: number; y1: number; nr: number; ny: number; l: number }
  const segs: S[] = []
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i]
    const [r1, y1] = profile[i + 1]
    const l = Math.hypot(r1 - r0, y1 - y0)
    if (l < 1e-7) continue
    segs.push({ r0, y0, r1, y1, nr: (y1 - y0) / l, ny: -(r1 - r0) / l, l })
  }
  const cosC = Math.cos((crease * Math.PI) / 180)
  const smooth = (a: S | undefined, b: S | undefined): [number, number] | null => {
    if (!a || !b) return null
    const joined = Math.abs(a.r1 - b.r0) < 1e-6 && Math.abs(a.y1 - b.y0) < 1e-6
    if (!joined || a.nr * b.nr + a.ny * b.ny < cosC) return null
    const r = a.nr + b.nr
    const y = a.ny + b.ny
    const l = Math.hypot(r, y) || 1
    return [r / l, y / l]
  }
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let vbase = 0
  let vAcc = 0
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const nS = smooth(segs[i - 1], s) ?? [s.nr, s.ny]
    const nE = smooth(s, segs[i + 1]) ?? [s.nr, s.ny]
    for (let k = 0; k <= segments; k++) {
      const phi = phiStart + (k / segments) * phiLength
      const sn = Math.sin(phi)
      const cs = Math.cos(phi)
      pos.push(s.r0 * sn, s.y0, s.r0 * cs, s.r1 * sn, s.y1, s.r1 * cs)
      nor.push(nS[0] * sn, nS[1], nS[0] * cs, nE[0] * sn, nE[1], nE[0] * cs)
      uv.push(k / segments, vAcc, k / segments, vAcc + s.l)
    }
    for (let k = 0; k < segments; k++) {
      const a = vbase + k * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    vbase += (segments + 1) * 2
    vAcc += s.l
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Small triangle-soup builder that orients each face towards an expected direction. */
export class MB {
  pos: number[] = []
  idx: number[] = []
  private a = V()
  private b = V()
  private c = V()
  v(p: THREE.Vector3) {
    this.pos.push(p.x, p.y, p.z)
    return this.pos.length / 3 - 1
  }
  private get(i: number, out: THREE.Vector3) {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2])
  }
  tri(i0: number, i1: number, i2: number, expect?: THREE.Vector3) {
    if (expect) {
      this.get(i0, this.a)
      this.get(i1, this.b).sub(this.a)
      this.get(i2, this.c).sub(this.a)
      const n = this.b.cross(this.c)
      if (n.dot(expect) < 0) {
        this.idx.push(i0, i2, i1)
        return
      }
    }
    this.idx.push(i0, i1, i2)
  }
  quad(i0: number, i1: number, i2: number, i3: number, expect?: THREE.Vector3) {
    this.tri(i0, i1, i2, expect)
    this.tri(i0, i2, i3, expect)
  }
  centroid(ids: number[]) {
    const c = V()
    for (const i of ids) c.add(this.get(i, this.a))
    return c.multiplyScalar(1 / ids.length)
  }
  geo() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    return g
  }
}

/** Thick annular ring / sector around +Y: r in [r0,r1], y in [y0,y1]. Partial sectors get end caps. */
export function ring(r0: number, r1: number, y0: number, y1: number, seg = 48, phiStart = 0, phiLength = TAU) {
  const g = lathe(
    [
      [r0, y0],
      [r1, y0],
      [r1, y1],
      [r0, y1],
      [r0, y0],
    ],
    seg,
    phiStart,
    phiLength,
    10,
  )
  if (phiLength >= TAU - 1e-6) return g
  const mb = new MB()
  for (const [phi, sgn] of [
    [phiStart, -1],
    [phiStart + phiLength, 1],
  ] as const) {
    const p = (r: number, y: number) => V(r * Math.sin(phi), y, r * Math.cos(phi))
    const t = V(Math.cos(phi), 0, -Math.sin(phi)).multiplyScalar(sgn)
    mb.quad(mb.v(p(r0, y0)), mb.v(p(r1, y0)), mb.v(p(r1, y1)), mb.v(p(r0, y1)), t)
  }
  return mergeFast([prep(g), prep(mb.geo())])!
}

/** Raised circumferential weld bead on a radius-R surface at station y (lathe Y). */
export function seamRing(R: number, y: number, w = 0.024, h = 0.0032, seg = 72) {
  return lathe(
    [
      [R - 0.002, y - w / 2],
      [R + h * 0.7, y - w / 4],
      [R + h, y],
      [R + h * 0.7, y + w / 4],
      [R - 0.002, y + w / 2],
    ],
    seg,
    0,
    TAU,
    50,
  )
}

/** Full vessel outer/inner profile (2:1 heads), lathe Y from bottom tip to top tip. */
export function vesselProfile(a: number, b: number, y0: number, y1: number, n = 36): Prof {
  const p: Prof = []
  for (let i = 0; i <= n; i++) {
    const t = (Math.PI / 2) * (1 - i / n)
    p.push([a * Math.cos(t), y0 - b * Math.sin(t)])
  }
  for (let i = 0; i <= n; i++) {
    const t = (Math.PI / 2) * (i / n)
    p.push([a * Math.cos(t), y1 + b * Math.sin(t)])
  }
  return p
}

/** Ellipsoidal head only (tangent at y0, dome towards sign). Outer-wall winding. */
export function headProfile(a: number, b: number, y0: number, sign: 1 | -1, n = 32): Prof {
  const p: Prof = []
  for (let i = 0; i <= n; i++) {
    const t = (Math.PI / 2) * (sign > 0 ? i / n : 1 - i / n)
    p.push([a * Math.cos(t), y0 + sign * b * Math.sin(t)])
  }
  return p
}

/** Thick dished cover (closed profile), rim at y0, dome towards +Y. */
export function dishedShell(ao: number, bo: number, t: number, y0: number, n = 24): THREE.BufferGeometry {
  const ai = ao - t
  const bi = Math.max(bo - t, 0.001)
  const p: Prof = [[ai, y0]]
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI / 2) * (i / n)
    p.push([ao * Math.cos(a), y0 + bo * Math.sin(a)])
  }
  for (let i = n; i >= 0; i--) {
    const a = (Math.PI / 2) * (i / n)
    p.push([ai * Math.cos(a), y0 + bi * Math.sin(a)])
  }
  return lathe(p, 48, 0, TAU, 40)
}

/** Circular segment plate in the YZ plane (thickness along X, centred on x = 0). */
export function segmentPlate(R: number, yCut: number, keep: 'below' | 'above', t: number, hole?: [number, number, number, number]) {
  const c = clamp(yCut / R, -0.999, 0.999)
  const th = Math.asin(c)
  const sh = new THREE.Shape()
  sh.moveTo(R * Math.cos(th), R * Math.sin(th))
  sh.absarc(0, 0, R, th, Math.PI - th, keep === 'below')
  sh.lineTo(R * Math.cos(th), R * Math.sin(th))
  if (hole) {
    const [z0, y0, z1, y1] = hole
    const h = new THREE.Path()
    h.moveTo(z0, y0)
    h.lineTo(z1, y0)
    h.lineTo(z1, y1)
    h.lineTo(z0, y1)
    h.lineTo(z0, y0)
    sh.holes.push(h)
  }
  let g: THREE.BufferGeometry
  if (t <= 0) g = new THREE.ShapeGeometry(sh, 48)
  else {
    g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 48 })
    g.translate(0, 0, -t / 2)
  }
  g.rotateY(Math.PI / 2) // shape (u,v) -> (z=-u, y=v); thickness along X
  return g
}

/** Point-to-point tube along an arbitrary curve. */
export class ArcCurve extends THREE.Curve<THREE.Vector3> {
  c: THREE.Vector3
  e1: THREE.Vector3
  e2: THREE.Vector3
  r: number
  a0: number
  a1: number
  constructor(c: THREE.Vector3, e1: THREE.Vector3, e2: THREE.Vector3, r: number, a0: number, a1: number) {
    super()
    this.c = c
    this.e1 = e1
    this.e2 = e2
    this.r = r
    this.a0 = a0
    this.a1 = a1
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = this.a0 + (this.a1 - this.a0) * t
    return target
      .copy(this.c)
      .addScaledVector(this.e1, this.r * Math.cos(a))
      .addScaledVector(this.e2, this.r * Math.sin(a))
  }
}
export function arcTube(c: THREE.Vector3, e1: THREE.Vector3, e2: THREE.Vector3, r: number, a0: number, a1: number, tubeR: number, seg?: number) {
  const n = seg ?? Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 0.08))
  return new THREE.TubeGeometry(new ArcCurve(c, e1, e2, r, a0, a1), n, tubeR, 6, false) as THREE.BufferGeometry
}

// ===================================================================== surface projection

export type Projector = (q: THREE.Vector3, d: THREE.Vector3) => number | null

function roots(A: number, B: number, C: number): number[] {
  if (Math.abs(A) < 1e-12) return Math.abs(B) > 1e-12 ? [-C / B] : []
  const disc = B * B - 4 * A * C
  if (disc < 0) return []
  const s = Math.sqrt(disc)
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)]
}

/**
 * Ray/surface solver for a cylinder of radius a (axis 'x' or 'y' through `center`,
 * half-length halfL) closed by 2:1 ellipsoidal heads of depth b (b = 0: no heads).
 * Returns t (closest to 0) with q + t d on the surface.
 */
export function vesselProjector(axis: 'x' | 'y', center: THREE.Vector3, halfL: number, a: number, b: number): Projector {
  return (q, d) => {
    const qa = axis === 'x' ? q.x - center.x : q.y - center.y
    const da = axis === 'x' ? d.x : d.y
    const q1 = axis === 'x' ? q.y - center.y : q.x - center.x
    const d1 = axis === 'x' ? d.y : d.x
    const q2 = q.z - center.z
    const d2 = d.z
    const cands: number[] = []
    for (const t of roots(d1 * d1 + d2 * d2, 2 * (q1 * d1 + q2 * d2), q1 * q1 + q2 * q2 - a * a)) {
      if (Math.abs(qa + t * da) <= halfL + 1e-6) cands.push(t)
    }
    if (b > 0) {
      for (const s of [-1, 1]) {
        const X = qa - s * halfL
        const A = (da * da) / (b * b) + (d1 * d1 + d2 * d2) / (a * a)
        const B = 2 * ((X * da) / (b * b) + (q1 * d1 + q2 * d2) / (a * a))
        const C = (X * X) / (b * b) + (q1 * q1 + q2 * q2) / (a * a) - 1
        for (const t of roots(A, B, C)) if (s * (X + t * da) >= -1e-6) cands.push(t)
      }
    }
    if (!cands.length) return null
    return cands.reduce((p, c) => (Math.abs(c) < Math.abs(p) ? c : p))
  }
}

/** Reinforcement pad / doubler conforming to a curved surface around an axis (base, dir). */
export function conformPad(base: THREE.Vector3, dir: THREE.Vector3, rIn: number, rOut: number, t: number, proj: Projector, seg = 40) {
  const d = dir.clone().normalize()
  const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? UP : V(1, 0, 0)).normalize()
  const v = new THREE.Vector3().crossVectors(d, u).normalize()
  const mb = new MB()
  const topIn: number[] = []
  const topOut: number[] = []
  const rimBot: number[] = []
  const rimTop: number[] = []
  const offs: THREE.Vector3[] = []
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * TAU
    const off = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a))
    offs.push(off)
    const qi = base.clone().addScaledVector(off, rIn)
    const qo = base.clone().addScaledVector(off, rOut)
    const ti = proj(qi, d)
    const to = proj(qo, d)
    if (ti === null || to === null) return null
    const si = qi.addScaledVector(d, ti)
    const so = qo.addScaledVector(d, to)
    topIn.push(mb.v(si.clone().addScaledVector(d, t)))
    topOut.push(mb.v(so.clone().addScaledVector(d, t)))
    rimTop.push(mb.v(so.clone().addScaledVector(d, t)))
    rimBot.push(mb.v(so.clone().addScaledVector(d, -0.004)))
  }
  for (let k = 0; k < seg; k++) {
    mb.quad(topIn[k], topOut[k], topOut[k + 1], topIn[k + 1], d)
    mb.quad(rimBot[k], rimBot[k + 1], rimTop[k + 1], rimTop[k], offs[k])
  }
  return mb.geo()
}

// ===================================================================== liquid volumes

export interface Station {
  x: number
  r: number
}

/** Axial stations (x, r) of a horizontal vessel cavity: head, shell, head. */
export function hStations(L: number, a: number, b: number, nHead = 20): Station[] {
  const s: Station[] = []
  for (let i = 0; i <= nHead; i++) {
    const t = (Math.PI / 2) * (1 - i / nHead)
    s.push({ x: -L / 2 - b * Math.sin(t), r: a * Math.cos(t) })
  }
  for (let i = 0; i <= nHead; i++) {
    const t = (Math.PI / 2) * (i / nHead)
    s.push({ x: L / 2 + b * Math.sin(t), r: a * Math.cos(t) })
  }
  return s
}

export function rAtStations(L: number, a: number, b: number, x: number) {
  const e = Math.abs(x) - L / 2
  if (e <= 0) return a
  const k = 1 - (e / b) ** 2
  return k <= 0 ? 0 : a * Math.sqrt(k)
}

export function clipStations(st: Station[], x0: number, x1: number, rAt: (x: number) => number): Station[] {
  const inner = st.filter((s) => s.x > x0 + 1e-4 && s.x < x1 - 1e-4)
  return [{ x: x0, r: rAt(x0) }, ...inner, { x: x1, r: rAt(x1) }]
}

/**
 * Liquid body inside a horizontal cavity between levels yLo..yHi (local Y), lofted through
 * the axial stations. Flat free surface on top, flat interface at the bottom (if any) and
 * flat end caps where the body is cut by a weir.
 */
export function liquidX(st: Station[], yLo: number, yHi: number, nArc = 22, nChord = 6): THREE.BufferGeometry | null {
  if (st.length < 2 || yHi <= yLo) return null
  type Ring = { arcR: THREE.Vector3[]; top: THREE.Vector3[]; arcL: THREE.Vector3[]; bot: THREE.Vector3[]; empty: boolean }
  const rings: Ring[] = st.map(({ x, r }) => {
    const lo = Math.max(yLo, -r)
    const hi = Math.min(yHi, r)
    if (r < 1e-5 || hi <= lo + 1e-6) {
      const y = yHi <= -r ? -r : yLo >= r ? r : (lo + hi) / 2
      const P = V(x, y, 0)
      const fill = (n: number) => Array.from({ length: n }, () => P.clone())
      return { arcR: fill(nArc), top: fill(nChord + 2), arcL: fill(nArc), bot: fill(nChord + 2), empty: true }
    }
    const tl = Math.asin(lo / r)
    const th = Math.asin(hi / r)
    const arcR: THREE.Vector3[] = []
    const arcL: THREE.Vector3[] = []
    for (let j = 0; j < nArc; j++) {
      const a = tl + ((th - tl) * j) / (nArc - 1)
      arcR.push(V(x, r * Math.sin(a), r * Math.cos(a)))
      const b = th + ((tl - th) * j) / (nArc - 1)
      arcL.push(V(x, r * Math.sin(b), -r * Math.cos(b)))
    }
    const top: THREE.Vector3[] = []
    const bot: THREE.Vector3[] = []
    const zt = r * Math.cos(th)
    const zb = r * Math.cos(tl)
    for (let j = 0; j < nChord + 2; j++) {
      const f = j / (nChord + 1)
      top.push(V(x, hi, zt * (1 - 2 * f)))
      bot.push(V(x, lo, -zb * (1 - 2 * f)))
    }
    return { arcR, top, arcL, bot, empty: false }
  })
  const mb = new MB()
  const parts: (keyof Omit<Ring, 'empty'>)[] = ['arcR', 'top', 'arcL', 'bot']
  for (const part of parts) {
    const ids = rings.map((rg) => rg[part].map((p) => mb.v(p)))
    for (let i = 0; i < rings.length - 1; i++) {
      const A = ids[i]
      const B = ids[i + 1]
      for (let j = 0; j < A.length - 1; j++) {
        let e: THREE.Vector3
        if (part === 'top') e = UP
        else if (part === 'bot') e = V(0, -1, 0)
        else {
          const c = mb.centroid([A[j], A[j + 1], B[j], B[j + 1]])
          e = V(0, c.y, c.z)
          if (e.lengthSq() < 1e-10) e = V(0, 0, part === 'arcR' ? 1 : -1)
        }
        mb.quad(A[j], A[j + 1], B[j + 1], B[j], e)
      }
    }
  }
  // end caps
  for (const [i, sx] of [
    [0, -1],
    [rings.length - 1, 1],
  ] as const) {
    const rg = rings[i]
    if (rg.empty) continue
    const loop = [...rg.arcR, ...rg.top.slice(1, -1), ...rg.arcL, ...rg.bot.slice(1, -1)]
    const ids = loop.map((p) => mb.v(p))
    const c = mb.v(mb.centroid(ids))
    for (let j = 0; j < ids.length; j++) mb.tri(c, ids[j], ids[(j + 1) % ids.length], V(sx, 0, 0))
  }
  return mb.geo()
}

const liquidMats = new Map<string, THREE.Material>()
/** Double-sided clones of the shared liquid materials so a section cut still reads as a volume. */
export function liquidMaterial(name: 'liquidOil' | 'liquidWater') {
  let m = liquidMats.get(name)
  if (!m) {
    m = materials()[name].clone()
    m.side = THREE.DoubleSide
    m.name = `${name}-2s`
    registerMaterial(m, 'internal')
    liquidMats.set(name, m)
  }
  return m
}

// ===================================================================== textures

let perfMat: THREE.MeshStandardMaterial | null = null
/** Hole pitch of the perforated plate texture (m). UVs of plates must be in metres. */
export const PERF_TILE = 0.4
/** Perforated plate: staggered 32 mm holes at 50 mm pitch via alpha-tested canvas. */
export function perforatedMaterial() {
  if (perfMat) return perfMat
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, S, S)
  g.fillStyle = '#000000'
  const n = 8
  const p = S / n
  for (let j = 0; j < n; j++) {
    for (let i = -1; i <= n; i++) {
      const x = (i + 0.5) * p + (j % 2) * (p / 2)
      const y = (j + 0.5) * p
      g.beginPath()
      g.arc(x, y, p * 0.32, 0, TAU)
      g.fill()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1 / PERF_TILE, 1 / PERF_TILE)
  tex.anisotropy = 4
  perfMat = new THREE.MeshStandardMaterial({
    color: '#a9aeb2',
    metalness: 0.8,
    roughness: 0.38,
    alphaMap: tex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  })
  perfMat.name = 'perforatedPlate'
  registerMaterial(perfMat, 'internal')
  return perfMat
}

/**
 * Tubesheet face texture: the actual tube-hole layout (tube ends + tie rods + pass groove).
 * Disc UVs must map (z, y) in [-R, R] to [0, 1].
 */
export function tubesheetMaterial(tubes: [number, number][], tubeOd: number, R: number, tieRods: [number, number][], passLane: boolean) {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const k = S / (2 * R)
  const px = (z: number) => (z / (2 * R) + 0.5) * S
  const py = (y: number) => (0.5 - y / (2 * R)) * S
  g.fillStyle = '#9da3a7'
  g.fillRect(0, 0, S, S)
  // faint machining rings
  g.strokeStyle = 'rgba(255,255,255,0.05)'
  for (let r = 4; r < S / 2; r += 6) {
    g.beginPath()
    g.arc(S / 2, S / 2, r, 0, TAU)
    g.stroke()
  }
  if (passLane) {
    g.fillStyle = '#5d6367'
    g.fillRect(0, py(0.007), S, 0.014 * k)
  }
  for (const [y, z] of tubes) {
    g.fillStyle = '#d4d6d6'
    g.beginPath()
    g.arc(px(z), py(y), (tubeOd / 2 + 0.0006) * k, 0, TAU)
    g.fill()
    g.fillStyle = '#231f1c'
    g.beginPath()
    g.arc(px(z), py(y), (tubeOd / 2 - 0.0021) * k, 0, TAU)
    g.fill()
  }
  for (const [y, z] of tieRods) {
    g.fillStyle = '#6b7176'
    g.beginPath()
    g.arc(px(z), py(y), 0.0085 * k, 0, TAU)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const m = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.4 })
  m.name = 'tubesheetFace'
  registerMaterial(m, 'internal')
  return m
}

// ===================================================================== nozzle helpers

export interface LocalNozzle {
  n: Nozzle
  base: THREE.Vector3
  face: THREE.Vector3
  dir: THREE.Vector3
}
export function localNozzles(eq: Equipment): LocalNozzle[] {
  return eq.nozzles.map((n) => ({
    n,
    base: V(...toLocal(eq, n.base)),
    face: V(...toLocal(eq, n.pos)),
    dir: V(...dirToLocal(eq, n.dir)).normalize(),
  }))
}

/** Reinforcement pads for every nozzle >= 2" whose base sits on one of the given surfaces. */
export function addNozzlePads(p: Parts, noz: LocalNozzle[], projectors: Projector[], thick: number, mat: MatKey = 'equipmentPaint') {
  for (const l of noz) {
    if (l.n.nps < 2) continue
    const proj = projectors.find((pr) => {
      const t = pr(l.base, l.dir)
      return t !== null && Math.abs(t) < 0.03
    })
    if (!proj) continue
    const od = pipeOD(l.n.nps)
    const rOut = od / 2 + Math.max(0.05, od * 0.45)
    p.add(mat, conformPad(l.base, l.dir, od / 2 + 0.0005, rOut, thick, proj, l.n.nps >= 8 ? 48 : 32))
  }
}

/** Vortex breaker (cross plates + cap) sitting on the cavity floor above an outlet. */
export function addVortexBreaker(p: Parts, inside: THREE.Vector3, axisIn: THREE.Vector3, od: number) {
  const s = Math.max(od * 2.2, 0.12)
  const h = Math.max(od * 0.9, 0.08)
  const ax = axisIn.clone().normalize()
  const ref = Math.abs(ax.y) > 0.9 ? V(1, 0, 0) : UP
  const m0 = basisM(inside.clone().addScaledVector(ax, h / 2 - 0.01), ref, ax)
  p.add('internalsSteel', box(s, h, 0.01), m0)
  p.add('internalsSteel', box(0.01, h, s), m0)
  p.add('internalsSteel', box(s * 1.05, 0.01, s * 1.05), basisM(inside.clone().addScaledVector(ax, h - 0.01), ref, ax))
}

// ===================================================================== saddles

/**
 * Welded saddle for a horizontal shell (axis +X): wear plate, curved top flange,
 * web, ribs, base plate and anchor bolts. 120 deg contact.
 */
export function addSaddle(p: Parts, xs: number, Ro: number, yDeck: number, opts: { sliding?: boolean } = {}) {
  const k = clamp(Ro / 1.8, 0.35, 1.4)
  const tw = Math.max(0.008, 0.012 * k)
  const Rw = Ro + tw
  const tc = Math.max(0.012, 0.02 * k)
  const Rc = Rw + tc
  const tWeb = Math.max(0.012, 0.022 * k)
  const tb = Math.max(0.016, 0.028 * k)
  const tr = Math.max(0.01, 0.016 * k)
  const baseLen = Math.max(0.16, 0.3 * k)
  const halfW = 0.88 * Ro
  const yBase = yDeck + tb
  const horn = Math.PI / 3
  // web
  const sh = new THREE.Shape()
  sh.moveTo(-halfW, yBase)
  sh.lineTo(halfW, yBase)
  sh.lineTo(Rc * Math.sin(horn), -Rc * Math.cos(horn))
  sh.absarc(0, 0, Rc, -Math.PI / 2 + horn, -Math.PI / 2 - horn, true)
  sh.lineTo(-halfW, yBase)
  const web = new THREE.ExtrudeGeometry(sh, { depth: tWeb, bevelEnabled: false, curveSegments: 40 })
  web.translate(0, 0, -tWeb / 2)
  web.rotateY(Math.PI / 2)
  web.translate(xs, 0, 0)
  p.add('equipmentPaint', web)
  // curved top flange + wear plate
  p.add('equipmentPaint', toX(ring(Rw - 0.001, Rc, -baseLen / 2, baseLen / 2, 48, Math.PI / 2 - horn, 2 * horn)), T(xs, 0, 0))
  const wa = horn + (6 * Math.PI) / 180
  p.add('equipmentPaint', toX(ring(Ro - 0.003, Rw, -baseLen / 2 - 0.05 * k, baseLen / 2 + 0.05 * k, 56, Math.PI / 2 - wa, 2 * wa)), T(xs, 0, 0))
  // ribs (gussets parallel to the axis)
  const zMax = 0.8 * Rc * Math.sin(horn)
  for (let i = 0; i < 5; i++) {
    const z = -zMax + (2 * zMax * i) / 4
    if (Math.abs(z) < 1e-6) continue // web carries the centre
    const yTop = -Math.sqrt(Rc * Rc - (Math.abs(z) + tr / 2) ** 2) + 0.004
    const h = yTop - yBase
    p.add('equipmentPaint', boxAt(baseLen - 0.004, h, tr, xs, yBase + h / 2, z))
  }
  // end ribs at the horns
  for (const s of [-1, 1]) {
    const yTop = -Rc * Math.cos(horn) - 0.01
    const h = yTop - yBase
    p.add('equipmentPaint', boxAt(baseLen - 0.004, h, tr, xs, yBase + h / 2, s * (halfW - tr / 2)))
  }
  // base plate
  const bl = baseLen + 0.06 * k
  const bw = 2 * halfW + 0.08 * k
  p.add('equipmentPaint', boxAt(bl, tb, bw, xs, yDeck + tb / 2, 0))
  // anchor bolts (+ slotted holes on the sliding saddle)
  const bd = Math.max(0.016, 0.024 * k)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = xs + sx * baseLen * 0.3
      const bz = sz * (halfW - 0.035 - 0.03 * k)
      if (opts.sliding) p.add('nut', boxAt(bd * 3.6, 0.0016, bd * 1.3, bx, yBase + 0.0008, bz))
      p.add('nut', rod(V(bx, yBase - 0.01, bz), V(bx, yBase + bd * 3.6, bz), bd / 2, 8))
      p.add('nut', boxAt(bd * 2.6, 0.006, bd * 2.6, bx, yBase + 0.003, bz))
      p.add('nut', hexNut(V(bx, yBase + 0.006 + bd * 0.5, bz), UP, bd * 1.6, bd))
    }
  }
}

// ===================================================================== manway

/**
 * 24" davit-hinged manway: neck, WN flange, gasket, blind flange, studs, nuts and davit.
 * `base` is on the outer shell surface, `dir` points outward.
 */
export function addManway(
  p: Parts,
  base: THREE.Vector3,
  dir: THREE.Vector3,
  o: { neck: number; nps?: number; rating?: Rating; embed?: number; side?: THREE.Vector3 },
) {
  const nps = o.nps ?? 24
  const rating = o.rating ?? 300
  const f = flange(nps, rating)
  const od = pipeOD(nps)
  const ro = od / 2
  const ri = ro - 0.0127
  const d = dir.clone().normalize()
  const M = frame(base, d)
  const emb = o.embed ?? 0.07
  p.add(
    'equipmentPaint',
    lathe(
      [
        [ri, -emb],
        [ro, -emb],
        [ro, o.neck + 0.002],
        [ri, o.neck + 0.002],
        [ri, -emb],
      ],
      56,
      0,
      TAU,
      10,
    ),
    M,
  )
  const wn = weldNeckFlange(nps, rating, '80', 56)
  wn.geometry.translate(0, o.neck, 0)
  p.add('equipmentPaint', wn.geometry, M)
  const yRF = o.neck + wn.length
  const yBack = o.neck + wn.discBack
  p.add('gasket', ring(ri + 0.012, f.raisedFaceDia / 2, yRF, yRF + GASKET, 56), M)
  const yb0 = yRF + GASKET
  const rfH = 0.0036
  const tB = f.thickness * 1.05
  const yb1 = yb0 + rfH + tB
  p.add(
    'equipmentPaint',
    lathe(
      [
        [0, yb0],
        [f.raisedFaceDia / 2, yb0],
        [f.raisedFaceDia / 2, yb0 + rfH],
        [f.od / 2, yb0 + rfH],
        [f.od / 2, yb1],
        [f.od * 0.18, yb1],
        [f.od * 0.16, yb1 + 0.006],
        [0, yb1 + 0.006],
      ],
      56,
      0,
      TAU,
      10,
    ),
    M,
  )
  // studs + nuts
  const nutH = f.boltDia
  const af = f.boltDia * 1.6 + 0.003
  const bc = f.boltCircle / 2
  for (let i = 0; i < f.bolts; i++) {
    const a = ((i + 0.5) / f.bolts) * TAU
    const x = bc * Math.sin(a)
    const z = bc * Math.cos(a)
    p.add('boltXylan', rod(V(x, yBack - nutH - 0.6 * f.boltDia, z), V(x, yb1 + nutH + 0.6 * f.boltDia, z), f.boltDia / 2, 8), M)
    p.add('nut', hexNut(V(x, yBack - nutH / 2, z), UP, af, nutH), M)
    p.add('nut', hexNut(V(x, yb1 + nutH / 2, z), UP, af, nutH), M)
  }
  // davit (vessel-local, vertical hinge pin)
  const c = V(0, yb1, 0).applyMatrix4(M)
  const isVert = Math.abs(d.y) > 0.8
  let s = o.side?.clone() ?? (isVert ? V(0, 0, -1) : new THREE.Vector3().crossVectors(d, UP).normalize())
  if (!o.side && !isVert && s.z > 0) s = s.negate()
  const dh = V(d.x, 0, d.z)
  const pin = c
    .clone()
    .addScaledVector(dh, -(tB + f.thickness + 0.1))
    .addScaledVector(s, f.od / 2 + 0.11)
  const hook = c.clone().addScaledVector(d, 0.045)
  const yP1 = isVert ? c.y + 0.38 : c.y + f.od / 2 + 0.2
  const yb = isVert ? V(0, o.neck * 0.5, 0).applyMatrix4(M).y : c.y
  const yP0 = yb - 0.08
  const rp = 0.028
  p.add('equipmentPaintDark', rod(V(pin.x, yP0, pin.z), V(pin.x, yP1 + 0.03, pin.z), rp, 12))
  // hinge brackets to the neck flange
  const neckSide = V(0, isVert ? o.neck * 0.5 : o.neck + wn.length * 0.5, 0).applyMatrix4(M).addScaledVector(s, ro + (isVert ? 0 : f.od / 2 - ro))
  for (const dy of [0, 0.1]) {
    p.add('equipmentPaintDark', rod(V(pin.x, yb + dy - 0.03, pin.z), V(neckSide.x, yb + dy - 0.03, neckSide.z), 0.016, 8))
  }
  p.add('equipmentPaintDark', ring(rp, rp + 0.014, -0.025, 0.025, 16), T(pin.x, yb - 0.03, pin.z))
  // arm + brace + drop
  const armEnd = V(hook.x, yP1, hook.z)
  p.add('equipmentPaintDark', rod(V(pin.x, yP1, pin.z), armEnd, 0.024, 10))
  const along = armEnd.clone().sub(V(pin.x, yP1, pin.z))
  p.add('equipmentPaintDark', rod(V(pin.x, yP1 - 0.28, pin.z), V(pin.x, yP1, pin.z).addScaledVector(along, 0.45), 0.014, 8))
  p.add('equipmentPaintDark', rod(armEnd, V(hook.x, hook.y + (isVert ? 0 : 0.02), hook.z), 0.016, 8))
  p.add('equipmentPaintDark', box(0.09, 0.09, 0.04, frame(c.clone().addScaledVector(d, 0.02), d)))
  return { od, flangeOd: f.od }
}

// ===================================================================== small fittings

/** Lifting lug (plate with eye) standing on a shell top at (x, y), plate in the XY plane. */
export function liftingLug(x: number, y: number, k: number, along: 'x' | 'z' = 'x') {
  const w = 0.26 * k
  const h = 0.24 * k
  const t = 0.04 * k
  const sh = new THREE.Shape()
  sh.moveTo(-w / 2, -0.03)
  sh.lineTo(w / 2, -0.03)
  sh.lineTo(w / 2, h - w / 2)
  sh.absarc(0, h - w / 2, w / 2, 0, Math.PI, false)
  sh.lineTo(-w / 2, -0.03)
  const hole = new THREE.Path()
  hole.absarc(0, h - w / 2, w * 0.24, 0, TAU, true)
  sh.holes.push(hole)
  const g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 20 })
  g.translate(0, 0, -t / 2)
  if (along === 'z') g.rotateY(Math.PI / 2)
  g.translate(x, y, 0)
  return g
}

/** Caged ladder (stringers, rungs, hoops, straps, wall brackets). `out` = horizontal unit away from the wall. */
export function addCagedLadder(p: Parts, mat: MatKey, foot: THREE.Vector3, out: THREE.Vector3, yPlat: number, standoff: number) {
  const o = V(out.x, 0, out.z).normalize()
  const lat = V(-o.z, 0, o.x)
  const yTop = yPlat + 1.1
  const h = yTop - foot.y
  const half = 0.23
  for (const s of [-1, 1]) {
    const c = foot.clone().addScaledVector(lat, s * half)
    p.add(mat, box(0.014, h, 0.065, basisM(V(c.x, foot.y + h / 2, c.z), lat, UP)))
    // wall brackets
    for (let y = foot.y + 1.2; y < yPlat - 0.4; y += 2.4) {
      p.add('structSteel', rod(V(c.x, y, c.z), V(c.x, y, c.z).addScaledVector(o, -standoff), 0.014, 8))
    }
  }
  for (let y = foot.y + 0.3; y <= yPlat + 0.01; y += 0.3) {
    p.add(mat, rod(V(foot.x, y, foot.z).addScaledVector(lat, -half), V(foot.x, y, foot.z).addScaledVector(lat, half), 0.0125, 8))
  }
  const y0 = foot.y + 2.3
  if (yTop > y0 + 0.2) {
    const cR = 0.43
    const cc = foot.clone().addScaledVector(o, 0.36)
    const aEnd = Math.atan2(half, -0.36)
    const ys: number[] = []
    for (let y = y0; y < yTop - 0.15; y += 0.9) ys.push(y)
    ys.push(yTop)
    for (const y of ys) p.add(mat, arcTube(V(cc.x, y, cc.z), o, lat, cR, -aEnd, aEnd, 0.009))
    for (let i = 0; i < 5; i++) {
      const a = -2.0 + i
      const pt = V(cc.x, 0, cc.z).addScaledVector(o, cR * Math.cos(a)).addScaledVector(lat, cR * Math.sin(a))
      const tan = o.clone().multiplyScalar(-Math.sin(a)).addScaledVector(lat, Math.cos(a))
      p.add(mat, box(0.05, yTop - y0, 0.008, basisM(V(pt.x, (y0 + yTop) / 2, pt.z), tan, UP)))
    }
  }
}
