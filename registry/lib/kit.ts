// Geometry kit: build parts in a local frame, bucket by material, merge into one mesh with one draw group per material.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { materials, type MaterialName } from './materials'

export type V3 = [number, number, number]
export type MatKey = MaterialName | THREE.Material
export type Profile = [number, number][]
export type Axis = 'x' | 'y' | 'z' | '-x' | '-y' | '-z' | V3
export type Orient = Axis | THREE.Quaternion

export interface Built {
  geometry: THREE.BufferGeometry
  material: THREE.Material[]
}

const UP = new THREE.Vector3(0, 1, 0)

export function axisVec(a: Axis): THREE.Vector3 {
  if (Array.isArray(a)) return new THREE.Vector3(a[0], a[1], a[2]).normalize()
  switch (a) {
    case 'x':
      return new THREE.Vector3(1, 0, 0)
    case '-x':
      return new THREE.Vector3(-1, 0, 0)
    case 'y':
      return new THREE.Vector3(0, 1, 0)
    case '-y':
      return new THREE.Vector3(0, -1, 0)
    case 'z':
      return new THREE.Vector3(0, 0, 1)
    case '-z':
      return new THREE.Vector3(0, 0, -1)
  }
}

// Quaternion taking +Y onto the axis. Deterministic roll: x -> rotateZ(-90), z -> rotateX(+90).
export function orientQuat(o: Orient = 'y'): THREE.Quaternion {
  if (o instanceof THREE.Quaternion) return o.clone()
  if (o === 'x') return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
  if (o === '-x') return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
  if (o === 'z') return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
  if (o === '-z') return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
  if (o === '-y') return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
  if (o === 'y') return new THREE.Quaternion()
  const v = axisVec(o)
  if (v.dot(UP) < -0.9999) return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
  return new THREE.Quaternion().setFromUnitVectors(UP, v)
}

// Euler (radians, XYZ) as quaternion.
export const eul = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z))

// Two unit vectors perpendicular to an axis (for bolt circles etc.).
export function perp(a: Axis): [THREE.Vector3, THREE.Vector3] {
  const v = axisVec(a)
  const ref = Math.abs(v.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(v, ref).normalize()
  const w = new THREE.Vector3().crossVectors(v, u).normalize()
  return [u, w]
}

export function mat4(pos: V3 = [0, 0, 0], o?: Orient, s?: V3 | number) {
  const q = o ? orientQuat(o) : new THREE.Quaternion()
  const sc = s === undefined ? new THREE.Vector3(1, 1, 1) : typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s)
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, sc)
}

function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
  g.morphAttributes = {}
  const n = g.getAttribute('position').count
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
  if (!g.index) {
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n)
    for (let i = 0; i < n; i++) idx[i] = i
    g.setIndex(new THREE.BufferAttribute(idx, 1))
  }
  g.clearGroups()
  return g
}

function flipWinding(g: THREE.BufferGeometry) {
  const a = g.index!.array as Uint16Array | Uint32Array
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1]
    a[i + 1] = a[i + 2]
    a[i + 2] = t
  }
}

// Multiply the uv attribute (to tile a texture).
export function uvScale(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined
  if (!uv) return g
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  return g
}

// Sweep a circle (optionally elliptical) of varying radius along a curve.
export function sweepGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  radius: (t: number) => [number, number],
  tubular = 48,
  radial = 20,
  cap = false,
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubular, false)
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    curve.getPointAt(t, p)
    const N = frames.normals[i]
    const B = frames.binormals[i]
    const [ra, rb] = radius(t)
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2
      const c = Math.cos(v)
      const s = -Math.sin(v)
      pos.push(p.x + ra * c * N.x + rb * s * B.x, p.y + ra * c * N.y + rb * s * B.y, p.z + ra * c * N.z + rb * s * B.z)
      // ellipse normal
      const nx = (c / (ra || 1e-6)) * N.x + (s / (rb || 1e-6)) * B.x
      const ny = (c / (ra || 1e-6)) * N.y + (s / (rb || 1e-6)) * B.y
      const nz = (c / (ra || 1e-6)) * N.z + (s / (rb || 1e-6)) * B.z
      const l = Math.hypot(nx, ny, nz) || 1
      nor.push(nx / l, ny / l, nz / l)
      uv.push(t, j / radial)
    }
  }
  for (let i = 0; i < tubular; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = (i + 1) * (radial + 1) + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  if (cap) {
    for (const end of [0, tubular]) {
      const t = end / tubular
      curve.getPointAt(t, p)
      const T = frames.tangents[end].clone().multiplyScalar(end === 0 ? -1 : 1)
      const centre = pos.length / 3
      pos.push(p.x, p.y, p.z)
      nor.push(T.x, T.y, T.z)
      uv.push(0.5, 0.5)
      const start = pos.length / 3
      for (let j = 0; j <= radial; j++) {
        const k = (end * (radial + 1) + j) * 3
        pos.push(pos[k], pos[k + 1], pos[k + 2])
        nor.push(T.x, T.y, T.z)
        uv.push(0, 0)
      }
      for (let j = 0; j < radial; j++) {
        if (end === 0) idx.push(centre, start + j + 1, start + j)
        else idx.push(centre, start + j, start + j + 1)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

// Polyline with rounded corners as a curve path (for tubing, cables, small-bore pipe).
export function roundedPath(pts: V3[], bend: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>()
  const P = pts.map((p) => new THREE.Vector3(...p))
  let cur = P[0].clone()
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1]
    const b = P[i]
    if (i === P.length - 1) {
      if (cur.distanceTo(b) > 1e-6) path.add(new THREE.LineCurve3(cur.clone(), b.clone()))
      break
    }
    const c = P[i + 1]
    const d1 = b.distanceTo(a)
    const d2 = c.distanceTo(b)
    const r = Math.min(bend, d1 * 0.45, d2 * 0.45)
    const p1 = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(r))
    const p2 = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(r))
    if (cur.distanceTo(p1) > 1e-6) path.add(new THREE.LineCurve3(cur.clone(), p1))
    path.add(new THREE.QuadraticBezierCurve3(p1.clone(), b.clone(), p2.clone()))
    cur = p2
  }
  return path
}

// Lathe a (radius, y) profile with crisp creases. Walk outer walls upward, inner walls downward.
export function latheCrisp(profile: Profile, segments = 32, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let vbase = 0
  let vAcc = 0
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i]
    const [r1, y1] = profile[i + 1]
    const dr = r1 - r0
    const dy = y1 - y0
    const l = Math.hypot(dr, dy)
    if (l < 1e-7) continue
    // outward normal in (r, y) plane
    const nr = dy / l
    const ny = -dr / l
    for (let s = 0; s <= segments; s++) {
      const phi = phiStart + (s / segments) * phiLength
      const sin = Math.sin(phi)
      const cos = Math.cos(phi)
      pos.push(r0 * sin, y0, r0 * cos, r1 * sin, y1, r1 * cos)
      nor.push(nr * sin, ny, nr * cos, nr * sin, ny, nr * cos)
      uv.push(s / segments, vAcc, s / segments, vAcc + l)
    }
    for (let s = 0; s < segments; s++) {
      const a = vbase + s * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      idx.push(a, c, b, b, c, d)
    }
    vbase += (segments + 1) * 2
    vAcc += l
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}


class ArcCurve extends THREE.Curve<THREE.Vector3> {
  c: THREE.Vector3
  n: THREE.Vector3
  t: THREE.Vector3
  R: number
  angle: number
  constructor(c: THREE.Vector3, n: THREE.Vector3, t: THREE.Vector3, R: number, angle: number) {
    super()
    this.c = c
    this.n = n
    this.t = t
    this.R = R
    this.angle = angle
  }
  getPoint(u: number, out = new THREE.Vector3()) {
    const a = u * this.angle
    return out.copy(this.c).addScaledVector(this.n, -this.R * Math.cos(a)).addScaledVector(this.t, this.R * Math.sin(a))
  }
}

export class Kit {
  private buckets = new Map<MatKey, THREE.BufferGeometry[]>()
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()]

  private get top() {
    return this.stack[this.stack.length - 1]
  }

  // Run fn with an extra transform pushed on the stack.
  with(m: THREE.Matrix4, fn: () => void) {
    this.stack.push(this.top.clone().multiply(m))
    fn()
    this.stack.pop()
  }
  at(pos: V3, o: Orient | undefined, fn: () => void) {
    this.with(mat4(pos, o), fn)
  }

  // Takes ownership of geo.
  add(mat: MatKey, geo: THREE.BufferGeometry, local?: THREE.Matrix4) {
    const g = normalise(geo)
    const m = local ? this.top.clone().multiply(local) : this.top
    g.applyMatrix4(m)
    if (m.determinant() < 0) flipWinding(g)
    let list = this.buckets.get(mat)
    if (!list) this.buckets.set(mat, (list = []))
    list.push(g)
    return this
  }
  // Clones first, for cached geometry.
  addShared(mat: MatKey, geo: THREE.BufferGeometry, local?: THREE.Matrix4) {
    return this.add(mat, geo.clone(), local)
  }

  box(mat: MatKey, size: V3, pos: V3 = [0, 0, 0], o?: Orient) {
    return this.add(mat, new THREE.BoxGeometry(size[0], size[1], size[2]), mat4(pos, o))
  }
  // Rounded-corner box (castings, enclosures).
  rbox(mat: MatKey, size: V3, radius: number, pos: V3 = [0, 0, 0], o?: Orient, seg = 2) {
    const r = Math.min(radius, size[0] / 2 - 1e-4, size[1] / 2 - 1e-4, size[2] / 2 - 1e-4)
    return this.add(mat, new RoundedBoxGeometry(size[0], size[1], size[2], seg, Math.max(r, 1e-4)), mat4(pos, o))
  }
  // Cylinder centred on pos, axis along `axis`. r2 = top radius (towards +axis).
  cyl(mat: MatKey, r: number, h: number, pos: V3 = [0, 0, 0], axis: Orient = 'y', seg = 24, r2?: number, open = false) {
    return this.add(mat, new THREE.CylinderGeometry(r2 ?? r, r, h, seg, 1, open), mat4(pos, axis))
  }
  // Cylinder between two points.
  rod(mat: MatKey, a: V3, b: V3, r: number, seg = 10, r2?: number) {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const d = vb.clone().sub(va)
    const L = d.length()
    if (L < 1e-6) return this
    const mid = va.clone().add(vb).multiplyScalar(0.5)
    return this.add(mat, new THREE.CylinderGeometry(r2 ?? r, r, L, seg, 1, false), mat4([mid.x, mid.y, mid.z], d.toArray() as V3))
  }
  // Lathe profile (r, y) about `axis`, profile y measured from pos along the axis.
  lathe(mat: MatKey, profile: Profile, pos: V3 = [0, 0, 0], axis: Orient = 'y', seg = 32, phiStart = 0, phiLength = Math.PI * 2) {
    return this.add(mat, latheCrisp(profile, seg, phiStart, phiLength), mat4(pos, axis))
  }
  // Torus whose ring lies perpendicular to `axis`.
  torus(mat: MatKey, R: number, r: number, pos: V3 = [0, 0, 0], axis: Orient = 'y', radial = 8, tubular = 32, arc = Math.PI * 2) {
    const g = new THREE.TorusGeometry(R, r, radial, tubular, arc)
    g.rotateX(-Math.PI / 2)
    return this.add(mat, g, mat4(pos, axis))
  }
  sphere(mat: MatKey, r: number, pos: V3 = [0, 0, 0], scale?: V3, seg = 20, o?: Orient) {
    return this.add(mat, new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.6))), mat4(pos, o, scale))
  }
  // Partial sphere (dome). thetaLength from the +Y pole.
  dome(mat: MatKey, r: number, pos: V3, axis: Orient = 'y', thetaLength = Math.PI / 2, scaleAxis = 1, seg = 28) {
    const g = new THREE.SphereGeometry(r, seg, Math.round(seg / 3), 0, Math.PI * 2, 0, thetaLength)
    g.scale(1, scaleAxis, 1)
    return this.add(mat, g, mat4(pos, axis))
  }
  // Small-bore tubing / cable along a polyline with bends.
  tube(mat: MatKey, pts: V3[], r: number, radial = 8, bend?: number) {
    if (pts.length < 2) return this
    const path = roundedPath(pts, bend ?? Math.max(r * 4, 0.02))
    const L = path.getLength()
    const seg = Math.max(4, Math.min(160, Math.round(L / Math.max(r * 2.5, 0.01)) + pts.length * 4))
    return this.add(mat, new THREE.TubeGeometry(path, seg, r, radial, false))
  }
  // Smooth spline tube (cables).
  spline(mat: MatKey, pts: V3[], r: number, radial = 6, seg = 40) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
    return this.add(mat, new THREE.TubeGeometry(c, seg, r, radial, false))
  }
  // Extrude a 2D shape (XY) by depth along +Z, then place.
  extrude(mat: MatKey, shape: THREE.Shape | THREE.Shape[], depth: number, m: THREE.Matrix4, curveSegments = 8) {
    return this.add(mat, new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments }), m)
  }
  // Flat disc (e.g. dial face) facing +axis.
  disc(mat: MatKey, r: number, pos: V3, axis: Orient = 'y', seg = 32) {
    const g = new THREE.CircleGeometry(r, seg)
    g.rotateX(-Math.PI / 2)
    return this.add(mat, g, mat4(pos, axis))
  }
  // Flat rectangle facing +Z in its own frame.
  plane(mat: MatKey, w: number, h: number, pos: V3, o?: Orient | THREE.Quaternion) {
    return this.add(mat, new THREE.PlaneGeometry(w, h), mat4(pos, o))
  }
  // Hex nut / bolt head. Axis along `axis`. across = across-corners diameter.
  hex(mat: MatKey, across: number, h: number, pos: V3, axis: Orient = 'y') {
    return this.add(mat, new THREE.CylinderGeometry(across / 2, across / 2, h, 6), mat4(pos, axis))
  }
  // Stud bolts on a circle: stud from `center` along +axis for `len`, a nut sitting at `nutAt`
  boltCircle(
    matStud: MatKey,
    matNut: MatKey,
    n: number,
    R: number,
    center: V3,
    axis: Axis,
    dia: number,
    len: number,
    nutAt: number[] = [len - dia * 0.6],
    phase = Math.PI / n,
  ) {
    const v = axisVec(axis)
    const [u, w] = perp(axis)
    const c = new THREE.Vector3(...center)
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2
      const p = c.clone().addScaledVector(u, Math.cos(a) * R).addScaledVector(w, Math.sin(a) * R)
      const mid = p.clone().addScaledVector(v, len / 2)
      this.cyl(matStud, dia / 2, len, mid.toArray() as V3, axis, 6)
      for (const t of nutAt) {
        const q = p.clone().addScaledVector(v, t)
        this.hex(matNut, dia * 1.85, dia * 0.9, q.toArray() as V3, axis)
      }
    }
    return this
  }
  // Generic: repeat fn at points around a circle.
  around(n: number, R: number, center: V3, axis: Axis, fn: (p: V3, angle: number) => void, phase = 0) {
    const [u, w] = perp(axis)
    const c = new THREE.Vector3(...center)
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2
      const p = c.clone().addScaledVector(u, Math.cos(a) * R).addScaledVector(w, Math.sin(a) * R)
      fn(p.toArray() as V3, a)
    }
  }
  // Handwheel: rim torus + spokes + hub, wheel plane perpendicular to axis.
  handwheel(mat: MatKey, D: number, pos: V3, axis: Orient = 'y', spokes = 4) {
    const R = D / 2
    const rr = Math.max(D * 0.035, 0.005)
    this.with(mat4(pos, axis), () => {
      this.torus(mat, R, rr, [0, 0, 0], 'y', 8, 40)
      this.cyl(mat, D * 0.09, D * 0.12, [0, 0, 0], 'y', 12)
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2 + Math.PI / 4
        this.rod(mat, [Math.cos(a) * D * 0.08, 0, Math.sin(a) * D * 0.08], [Math.cos(a) * R, -D * 0.02, Math.sin(a) * R], rr * 0.75, 6)
      }
      // spinner knob for larger wheels
      if (D > 0.3) this.rod(mat, [R, 0, 0], [R, D * 0.18, 0], rr * 1.1, 8)
    })
    return this
  }

  // Hollow straight pipe from a to b with a visible bore.
  pipe(mat: MatKey, a: V3, b: V3, od: number, wall = od * 0.08, seg = od > 0.5 ? 64 : od > 0.25 ? 48 : 32, bore: MatKey = 'pipeBore') {
    const va = new THREE.Vector3(...a)
    const d = new THREE.Vector3(...b).sub(va)
    const L = d.length()
    if (L < 1e-6) return this
    const ro = od / 2
    const ri = Math.max(ro - wall, ro * 0.5)
    const m = mat4(a, d.toArray() as V3)
    this.add(mat, latheCrisp([[ri, 0], [ro, 0], [ro, L], [ri, L]], seg), m)
    return this.add(bore, latheCrisp([[ri, L], [ri, 0]], seg), m.clone())
  }
  // Hollow pipe bend: starts at `start` heading `dir`, turns towards `toward` about centreline radius R.
  bend(mat: MatKey, start: V3, dir: V3, toward: V3, R: number, od: number, angle = Math.PI / 2, wall = od * 0.08, bore: MatKey = 'pipeBore') {
    const s = new THREE.Vector3(...start)
    const t = new THREE.Vector3(...dir).normalize()
    const n = new THREE.Vector3(...toward).normalize()
    const c = s.clone().addScaledVector(n, R)
    const curve = new ArcCurve(c, n, t, R, angle)
    const tub = Math.max(8, Math.round((angle / (Math.PI / 2)) * 16))
    const radial = od > 0.5 ? 64 : od > 0.25 ? 48 : 32
    this.add(mat, sweepGeometry(curve, () => [od / 2, od / 2], tub, radial))
    const inner = sweepGeometry(curve, () => [od / 2 - wall, od / 2 - wall], tub, radial)
    flipWinding(normalise(inner))
    const nrm = inner.getAttribute('normal') as THREE.BufferAttribute
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i))
    return this.add(bore, inner)
  }

  isEmpty() {
    return this.buckets.size === 0
  }

  build(): Built {
    const m = materials()
    const keys = [...this.buckets.keys()].filter((k) => this.buckets.get(k)!.length)
    const geometry = mergeLists(keys.map((k) => this.buckets.get(k)!))
    geometry.computeBoundingSphere()
    geometry.computeBoundingBox()
    this.buckets.clear()
    return { geometry, material: keys.map((k) => (typeof k === 'string' ? m[k] : k)) }
  }
}

// One geometry from the buckets, one draw group per bucket, in a single pass over typed arrays (every part is normalised
// to indexed position / normal / uv, so three's mergeGeometries and its index built with push() are not needed).
function mergeLists(lists: THREE.BufferGeometry[][]): THREE.BufferGeometry {
  let nv = 0
  let ni = 0
  for (const list of lists)
    for (const g of list) {
      nv += g.attributes.position.count
      ni += g.index!.count
    }
  const pos = new Float32Array(nv * 3)
  const nor = new Float32Array(nv * 3)
  const uv = new Float32Array(nv * 2)
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)
  const out = new THREE.BufferGeometry()
  let vo = 0
  let io = 0
  lists.forEach((list, k) => {
    const start = io
    for (const g of list) {
      const a = g.attributes
      const ia = g.index!.array
      pos.set(a.position.array as Float32Array, vo * 3)
      nor.set(a.normal.array as Float32Array, vo * 3)
      uv.set(a.uv.array as Float32Array, vo * 2)
      if (vo === 0) idx.set(ia, 0)
      else for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo
      vo += a.position.count
      io += ia.length
    }
    if (io > start) out.addGroup(start, io - start, k)
  })
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  return out
}
