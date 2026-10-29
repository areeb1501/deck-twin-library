// Shared rigging for the lifting category: wire rope, shackles, master links, 4-leg sling sets, hooks, hazard panels and oriented bars.
import * as THREE from 'three'
import { useMemo } from 'react'
import { Kit, mat4, uvScale, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { liftingLug } from '../lib/parts'
import { hazardStripeMaterial } from '../lib/textures'

const UNIT_ROPE = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false)

/** Galvanised wire rope (dark, oily). */
export const ropeMaterial = () => paint('#3a3d40', { metalness: 0.75, roughness: 0.42, clearcoat: 0, weather: 0 })
/** Offshore crane / lifting-gear yellow (RAL 1003). */
export const craneYellow = () => paint('#eab308', { weather: 0.9 })

/** Axis-aligned box from min to max corners. */
export function boxMM(k: Kit, mat: MatKey, a: V3, b: V3) {
  k.box(mat, [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
}

/** Rectangular bar from a to b, w across (perpendicular to up), h along `up`. */
export function bar(k: Kit, mat: MatKey, a: V3, b: V3, w: number, h: number, up: V3 = [0, 1, 0]) {
  const A = new THREE.Vector3(...a)
  const d = new THREE.Vector3(...b).sub(A)
  const L = d.length()
  if (L < 1e-6) return
  const x = d.normalize()
  let u = new THREE.Vector3(...up).normalize()
  if (Math.abs(u.dot(x)) > 0.99) u = Math.abs(x.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const z = new THREE.Vector3().crossVectors(x, u).normalize()
  const y = new THREE.Vector3().crossVectors(z, x).normalize()
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(A.addScaledVector(x, L / 2))
  k.add(mat, new THREE.BoxGeometry(L, h, w), m)
}

/** Black/yellow hazard chevron panel of w × h, centred at pos, facing `normal`, laid 4 mm proud. */
export function hazardPanel(k: Kit, pos: V3, w: number, h: number, normal: V3, stripe = 0.3) {
  const n = new THREE.Vector3(...normal).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  const g = new THREE.PlaneGeometry(w, h)
  uvScale(g, w / (stripe * 2), h / (stripe * 2))
  const p = new THREE.Vector3(...pos).addScaledVector(n, 0.004)
  k.add(hazardStripeMaterial(), g, mat4(p.toArray() as V3, q))
}

/** Bow shackle: bow and pin in the plane of `along` and +Y, pin centre at pos (pairs with a padeye plate across `along`). s = jaw width. */
export function shackle(k: Kit, pos: V3, s = 0.06, along: 'x' | 'z' = 'x', mat: MatKey = 'galvanised') {
  const r = s * 0.22
  const q = along === 'x' ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  const m = (p: V3) => new THREE.Matrix4().compose(new THREE.Vector3(...p).applyQuaternion(q).add(new THREE.Vector3(...pos)), q, new THREE.Vector3(1, 1, 1))
  const bow = new THREE.TorusGeometry(s / 2, r, 6, 16, Math.PI)
  k.add(mat, bow, m([0, s * 0.9, 0]))
  for (const sx of [-1, 1]) k.add(mat, new THREE.CylinderGeometry(r, r, s * 0.9, 6), m([sx * (s / 2), s * 0.45, 0]))
  k.add('nut', new THREE.CylinderGeometry(r * 0.95, r * 0.95, s + r * 6, 8).rotateZ(Math.PI / 2), m([0, 0, 0]))
  for (const sx of [-1, 1]) k.add(mat, new THREE.SphereGeometry(r * 1.25, 8, 6), m([sx * (s / 2), 0, 0]))
}

/** Top of a shackle's bow (where a sling eye sits). */
export const shackleTop = (pos: V3, s = 0.06): V3 => [pos[0], pos[1] + s * 1.4, pos[2]]

/** Oblong master link, long axis vertical, centre at pos. */
export function masterLink(k: Kit, pos: V3, s = 0.25, mat: MatKey = 'galvanised') {
  const g = new THREE.TorusGeometry(s * 0.32, s * 0.08, 8, 24)
  g.scale(1, 1.55, 1)
  k.add(mat, g, mat4(pos))
}

/** Four-leg sling set: legs from each attachment point to a master link at `apex`, with thimble eyes and ferrules. */
export function slingSet(k: Kit, eyes: V3[], apex: V3, s = 0.25, rope = 0.012) {
  const rm = ropeMaterial()
  const link = s * 0.32 * 1.55
  const bottom: V3 = [apex[0], apex[1] - link + s * 0.04, apex[2]]
  masterLink(k, apex, s)
  // intermediate links (one per pair of legs)
  for (const sx of [-1, 1]) {
    const g = new THREE.TorusGeometry(s * 0.16, s * 0.05, 6, 18)
    g.scale(1, 1.4, 1)
    k.add('galvanised', g, mat4([bottom[0] + sx * s * 0.12, bottom[1] - s * 0.12, bottom[2]], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)))
  }
  const hang: V3 = [bottom[0], bottom[1] - s * 0.3, bottom[2]]
  for (const e of eyes) {
    const top: V3 = [hang[0] + Math.sign(e[0] - hang[0]) * s * 0.12, hang[1], hang[2] + Math.sign(e[2] - hang[2]) * s * 0.02]
    const E = new THREE.Vector3(...e)
    const T = new THREE.Vector3(...top)
    const dir = T.clone().sub(E).normalize()
    // thimble eye at the shackle, ferrule a little up the leg
    const eyeC = E.clone().addScaledVector(dir, 0.06)
    k.rod(rm, eyeC.toArray() as V3, T.toArray() as V3, rope, 6)
    k.rod('aluminium', eyeC.clone().addScaledVector(dir, 0.12).toArray() as V3, eyeC.clone().addScaledVector(dir, 0.22).toArray() as V3, rope * 1.9, 8)
    k.torus('galvanised', 0.035, rope * 0.9, eyeC.toArray() as V3, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dir.z, 0, dir.x).normalize()), 6, 14)
    k.rod(rm, T.toArray() as V3, [top[0], top[1] + 0.04, top[2]], rope, 6)
  }
}

/** Forged single hook (DIN 15401 shape): shank up from pos, bowl below, latch. size = bowl inner radius. */
export function hook(k: Kit, pos: V3, size = 0.12, mat: MatKey = 'castIron', latch: MatKey = 'safetyYellow') {
  const [x, y, z] = pos
  const r = size
  const t = size * 0.42
  k.cyl(mat, t * 0.55, r * 1.3, [x, y + r * 0.65, z], 'y', 12)
  k.hex('nut', t * 1.6, t * 0.6, [x, y + r * 1.35, z])
  // bowl: 300° arc of a tapered section, open towards +X
  const arc = new THREE.TorusGeometry(r, t * 0.6, 10, 24, (5 * Math.PI) / 3)
  arc.rotateZ(Math.PI / 2 + Math.PI / 6)
  k.add(mat, arc, mat4([x, y - r * 1.0, z], undefined, [1, 1.05, 1.3]))
  k.sphere(mat, t * 0.55, [x + r * Math.cos(Math.PI / 6 + Math.PI / 2 + (5 * Math.PI) / 3), y - r + r * Math.sin(Math.PI / 6 + Math.PI / 2 + (5 * Math.PI) / 3), z], undefined, 10)
  k.rod(latch, [x + t * 0.5, y + r * 0.1, z], [x + r * 0.95, y - r * 0.45, z], t * 0.12, 6)
}

/** Stretched-rope mesh between two points (moves with props without rebuilding geometry). */
export function Rope({ a, b, r = 0.022, material }: { a: V3; b: V3; r?: number; material?: THREE.Material }) {
  const t = useMemo(() => {
    const A = new THREE.Vector3(...a)
    const d = new THREE.Vector3(...b).sub(A)
    const L = Math.max(d.length(), 1e-4)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    return { p: A.addScaledVector(d, L / 2), q, s: new THREE.Vector3(r, L, r) }
  }, [a[0], a[1], a[2], b[0], b[1], b[2], r]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = material ?? ropeMaterial()
  return <mesh geometry={UNIT_ROPE} material={m} position={t.p} quaternion={t.q} scale={t.s} castShadow />
}

/** Padeye plate (across `across`) with a bow shackle through its hole; returns the bow top for the sling eye. */
export function padeyeShackle(k: Kit, pos: V3, across: 'x' | 'z' = 'x', s = 1, mat: MatKey = 'structSteel'): V3 {
  liftingLug(k, pos, across === 'x' ? 'z' : 'x', s, mat)
  const pin: V3 = [pos[0], pos[1] + 0.12 * s * 0.65, pos[2]]
  shackle(k, pin, 0.065 * s, across)
  return shackleTop(pin, 0.065 * s)
}
