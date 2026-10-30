/**
 * Low-level geometry builders for piping components.
 *
 * Every builder produces REAL wall thickness: an outer painted skin and an inner bore
 * surface (geometry group 1) so that a section cut or a close camera shows a hollow pipe.
 *
 * Conventions: builders produce geometry along +Y starting at y = 0 unless stated.
 * Material groups:  0 = outer / paint,  1 = bore (inner),  2 = machined faces.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flange, pipeOD, pipeWall } from '../model/catalog'
import type { Rating } from '../model/types'

export type Profile = [number, number][] // (radius, y)

/**
 * Lathe a profile with crisp creases: consecutive profile segments get their own
 * normals (duplicated vertices), unlike THREE.LatheGeometry which smooths everything.
 * Profile order: walk so that the solid is on the LEFT when going from point i to i+1
 * in (r, y) space viewed with r to the right, y up — i.e. outer walls go upward,
 * inner walls go downward.
 */
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

/** Merge parts, each assigned a material group index. */
export function mergeGroups(parts: { geo: THREE.BufferGeometry; group: number }[]): THREE.BufferGeometry {
  // group parts by material index so the merged geometry has one draw group per material
  const byGroup = new Map<number, THREE.BufferGeometry[]>()
  for (const p of parts) {
    const g = p.geo.index ? p.geo : p.geo
    if (!byGroup.has(p.group)) byGroup.set(p.group, [])
    byGroup.get(p.group)!.push(g)
  }
  const keys = [...byGroup.keys()].sort((a, b) => a - b)
  const merged = keys.map((k) => mergeGeometries(byGroup.get(k)!.map(stripGroups), false)!)
  const out = mergeGeometries(merged, true)!
  // mergeGeometries(useGroups=true) assigns materialIndex = array position; remap to keys
  out.groups.forEach((gr, i) => (gr.materialIndex = keys[i]))
  return out
}

function stripGroups(g: THREE.BufferGeometry) {
  const c = g.index ? g : g
  c.clearGroups()
  // ensure identical attribute sets for merging
  if (!c.getAttribute('uv')) {
    const n = c.getAttribute('position').count
    c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
  }
  return c
}

/** Hollow straight pipe along +Y, length L. groups: 0 outer+ends, 1 bore */
export function hollowPipe(L: number, od: number, wall: number, segments = 28) {
  const ro = od / 2
  const ri = ro - wall
  const outer = latheCrisp(
    [
      [ri, 0],
      [ro, 0],
      [ro, L],
      [ri, L],
    ],
    segments,
  )
  const bore = latheCrisp(
    [
      [ri, L],
      [ri, 0],
    ],
    segments,
  )
  return mergeGroups([
    { geo: outer, group: 0 },
    { geo: bore, group: 1 },
  ])
}

/** Flip a geometry inside-out (reverse winding + negate normals). */
export function flipGeometry(g: THREE.BufferGeometry) {
  const idx = g.index
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]
      a[i + 1] = a[i + 2]
      a[i + 2] = t
    }
    idx.needsUpdate = true
  }
  const n = g.getAttribute('normal') as THREE.BufferAttribute
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  n.needsUpdate = true
  return g
}

/**
 * Hollow long-radius elbow. Lies in the XY plane: starts at the origin heading +Y,
 * bends towards +X with centreline radius R through `angle` radians.
 * groups: 0 outer, 1 bore
 */
export function hollowElbow(R: number, od: number, wall: number, angle = Math.PI / 2, radial = 24, tubular = 16) {
  const ro = od / 2
  const ri = ro - wall
  const mk = (r: number) => {
    const t = new THREE.TorusGeometry(R, r, radial, tubular, angle)
    // torus arc starts at (R,0,0) heading +Y around Z; shift so start is at origin heading +Y,
    // bending toward +X:  rotate 180° about Y -> start at (-R,0,0) heading +Y bending to +X? Use mirror.
    t.translate(-R, 0, 0) // start point now at origin, heading +Y, centre at (-R,0,0) -> bends toward -X
    t.scale(-1, 1, 1) // mirror so it bends toward +X
    return t
  }
  const outer = mk(ro)
  // mirroring flips winding; fix it
  flipWinding(outer)
  const inner = mk(ri)
  // inner: after mirror its winding is reversed already (faces inward) but normals point outward
  negateNormals(inner)
  return mergeGroups([
    { geo: outer, group: 0 },
    { geo: inner, group: 1 },
  ])
}

function flipWinding(g: THREE.BufferGeometry) {
  const idx = g.index!
  const a = idx.array as Uint16Array | Uint32Array
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1]
    a[i + 1] = a[i + 2]
    a[i + 2] = t
  }
  idx.needsUpdate = true
}
function negateNormals(g: THREE.BufferGeometry) {
  const n = g.getAttribute('normal') as THREE.BufferAttribute
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  n.needsUpdate = true
}

/**
 * ASME B16.5 weld-neck flange, along +Y: weld bevel at y = 0, raised face at y = length.
 * groups: 0 forged body, 1 bore, 2 raised face (machined)
 */
export function weldNeckFlange(nps: number, rating: Rating = 300, schedule = '80', segments = 36) {
  const f = flange(nps, rating)
  const ro = pipeOD(nps) / 2
  const ri = ro - pipeWall(nps, schedule)
  const hubR = Math.max(f.hubDia / 2, ro * 1.05)
  const rfH = 0.0016 * (rating >= 600 ? 4 : 1) + 0.002 // raised face height
  const L = f.length
  const yDiscBack = L - rfH - f.thickness
  const yDiscFront = L - rfH
  const body = latheCrisp(
    [
      [ri, 0],
      [ro, 0],
      [hubR, Math.max(yDiscBack - 0.004, 0.002)],
      [hubR + 0.004, yDiscBack], // small fillet
      [f.od / 2, yDiscBack],
      [f.od / 2, yDiscFront],
      [f.raisedFaceDia / 2, yDiscFront],
    ],
    segments,
  )
  const face = latheCrisp(
    [
      [f.raisedFaceDia / 2, yDiscFront],
      [f.raisedFaceDia / 2, L],
      [ri, L],
    ],
    segments,
  )
  const bore = latheCrisp(
    [
      [ri, L],
      [ri, 0],
    ],
    segments,
  )
  return {
    geometry: mergeGroups([
      { geo: body, group: 0 },
      { geo: bore, group: 1 },
      { geo: face, group: 2 },
    ]),
    dims: f,
    length: L,
    discBack: yDiscBack,
  }
}

const UP = new THREE.Vector3(0, 1, 0)
/** Quaternion that rotates +Y onto `dir`. */
export function quatYTo(dir: THREE.Vector3Like | [number, number, number]) {
  const d = Array.isArray(dir) ? new THREE.Vector3(dir[0], dir[1], dir[2]) : new THREE.Vector3(dir.x, dir.y, dir.z)
  d.normalize()
  return new THREE.Quaternion().setFromUnitVectors(UP, d)
}

/** Simple geometry cache keyed by string so identical fittings share buffers. */
const geoCache = new Map<string, unknown>()
export function cached<T>(key: string, make: () => T): T {
  if (!geoCache.has(key)) geoCache.set(key, make())
  return geoCache.get(key) as T
}
