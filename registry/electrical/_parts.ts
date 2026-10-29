// Shared electrical details: profiled cladding sheet, cable glands, earth bosses, louvres, multi-cable transits, beacons.
import * as THREE from 'three'
import { eul, type Kit, type MatKey, type V3 } from '../lib/kit'
import { louvreMaterial } from '../lib/textures'

/** Trapezoidal (vertical-rib) profiled sheet: x ∈ [-w/2, w/2], y ∈ [0, h], ribs stand out to +Z by `depth`. */
export function ribbedPanel(w: number, h: number, pitch = 0.25, depth = 0.035, back = true): THREE.BufferGeometry {
  const n = Math.max(1, Math.round(w / pitch))
  const p = w / n
  const prof: [number, number][] = [[0, 0], [0.3, 0], [0.4, depth], [0.6, depth], [0.7, 0], [1, 0]]
  const xs: [number, number][] = []
  for (let i = 0; i < n; i++)
    for (let j = 0; j < prof.length - (i < n - 1 ? 1 : 0); j++) {
      if (i > 0 && j === 0) continue
      xs.push([-w / 2 + (i + prof[j][0]) * p, prof[j][1]])
    }
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const push = (q: number[][], nx: number, nz: number) => {
    for (const v of q) {
      pos.push(v[0], v[1], v[2])
      nor.push(nx, 0, nz)
      uv.push((v[0] + w / 2) / w, v[1] / h)
    }
  }
  for (let i = 0; i < xs.length - 1; i++) {
    const [x0, z0] = xs[i]
    const [x1, z1] = xs[i + 1]
    const l = Math.hypot(x1 - x0, z1 - z0) || 1
    push([[x0, 0, z0], [x1, 0, z1], [x1, h, z1], [x0, 0, z0], [x1, h, z1], [x0, h, z0]], -(z1 - z0) / l, (x1 - x0) / l)
  }
  if (back) push([[w / 2, 0, -0.002], [-w / 2, 0, -0.002], [-w / 2, h, -0.002], [w / 2, 0, -0.002], [-w / 2, h, -0.002], [w / 2, h, -0.002]], 0, -1)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/** Ex e / Ex d cable gland with a shroud, axis along `axis` (gland body from pos outwards), cable size by OD. */
export function cableGland(k: Kit, pos: V3, axis: 'y' | '-y' | 'x' | '-x' | 'z' | '-z', cableOD = 0.025) {
  const d: V3 = axis === 'y' ? [0, 1, 0] : axis === '-y' ? [0, -1, 0] : axis === 'x' ? [1, 0, 0] : axis === '-x' ? [-1, 0, 0] : axis === 'z' ? [0, 0, 1] : [0, 0, -1]
  const at = (t: number): V3 => [pos[0] + d[0] * t, pos[1] + d[1] * t, pos[2] + d[2] * t]
  const r = cableOD / 2
  k.hex('brass', r * 3.4, 0.012, at(0.006), axis)
  k.cyl('brass', r * 1.55, 0.03, at(0.027), axis, 12)
  k.hex('brass', r * 3.0, 0.014, at(0.049), axis)
  k.cyl('rubberBlack', r * 1.45, 0.035, at(0.073), axis, 12, r * 1.1)
  return at(0.09)
}

/** Brass earthing boss on a face (normal axis) with a bolted green/yellow bond lug. */
export function earthBoss(k: Kit, pos: V3, axis: 'x' | '-x' | 'z' | '-z') {
  const s = axis.startsWith('-') ? -1 : 1
  const off = (t: number): V3 => (axis.endsWith('x') ? [pos[0] + s * t, pos[1], pos[2]] : [pos[0], pos[1], pos[2] + s * t])
  k.cyl('brass', 0.022, 0.03, off(0.015), axis, 12)
  k.hex('nut', 0.028, 0.012, off(0.036), axis)
  k.box('copper', axis.endsWith('x') ? [0.006, 0.05, 0.02] : [0.02, 0.05, 0.006], [off(0.032)[0], pos[1] - 0.025, off(0.032)[2]])
}

/** Weather louvre in a wall frame (outer face at z = 0, +Z out): frame, angled blades, bird mesh behind. */
export function louvre(k: Kit, u: number, y: number, w: number, h: number, frame: MatKey = 'structSteelDark', blade: MatKey = 'cladding') {
  k.box(frame, [w + 0.08, 0.04, 0.08], [u, y + h / 2 + 0.02, 0.03])
  k.box(frame, [w + 0.08, 0.04, 0.08], [u, y - h / 2 - 0.02, 0.03])
  for (const s of [-1, 1]) k.box(frame, [0.04, h + 0.08, 0.08], [u + s * (w / 2 + 0.02), y, 0.03])
  k.box('rubberBlack', [w, h, 0.01], [u, y, 0.004])
  const n = Math.max(3, Math.round(h / 0.07))
  for (let i = 0; i < n; i++) k.box(blade, [w, 0.075, 0.006], [u, y - h / 2 + (i + 0.5) * (h / n), 0.04], eul(0.7, 0, 0))
}

/** Flat louvre panel (texture only), facing +normal, for small enclosures. */
export function louvrePanel(k: Kit, w: number, h: number, pos: V3, q: THREE.Quaternion, color = '#c9ccc8') {
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * Math.max(1, h / 0.08))
  k.add(louvreMaterial(color), g, new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(1, 1, 1)))
}

/** Multi-cable transit frame (MCT) on a wall face at z = 0, with packed rubber modules. */
export function cableTransit(k: Kit, u: number, y: number, cols = 6, rows = 2, frame: MatKey = 'structSteelDark') {
  const w = cols * 0.075 + 0.08
  const h = rows * 0.09 + 0.05
  k.box(frame, [w, h, 0.12], [u, y, 0.06])
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) k.box(c % 2 === r % 2 ? 'rubberBlack' : 'gasket', [0.07, 0.08, 0.02], [u - ((cols - 1) * 0.075) / 2 + c * 0.075, y - ((rows - 1) * 0.09) / 2 + r * 0.09, 0.125])
  k.box('stainless', [w - 0.04, 0.02, 0.03], [u, y + h / 2 - 0.01, 0.125])
  return { w, h }
}

/** Status beacon (sounder base + coloured lens), standing on +Y at pos. */
export function beacon(k: Kit, pos: V3, lens: MatKey) {
  k.cyl('plasticGrey', 0.06, 0.06, [pos[0], pos[1] + 0.03, pos[2]], 'y', 14)
  k.cyl(lens, 0.05, 0.11, [pos[0], pos[1] + 0.115, pos[2]], 'y', 16)
  k.dome(lens, 0.05, [pos[0], pos[1] + 0.17, pos[2]], 'y', Math.PI / 2, 0.6, 16)
}
