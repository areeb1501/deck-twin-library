// Tank bund (secondary containment): reinforced concrete wall on a footing, lined floor falling to a sump, drain valve, step-over stairs. NFPA 30, API 2610, EN 1992-3.
import * as THREE from 'three'
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { grating, handrail, member, nozzle, pipeRun, tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { port, type Port } from '../lib/ports'
import { textMaterial } from '../lib/textures'
import { clamp, stair } from './_onshore'

export interface BundWallProps {
  /** complete rectangular bund, or a single straight segment along X */
  complete?: boolean
  /** along X, m */
  length?: number
  /** along Z (complete bund), m */
  width?: number
  /** wall height above grade, m */
  height?: number
  /** wall thickness, m */
  thickness?: number
  /** step-over stairs */
  stairs?: boolean
  drainNps?: number
  tag?: string
}

export const defaults = { complete: true, length: 30, width: 22, height: 1.5, thickness: 0.3, stairs: true, drainNps: 4, tag: '' }

const FLOOR = 0.15 // lined floor slab top at the walls, typical

function layout(p: typeof defaults) {
  const L = clamp(p.length, 3, 200)
  const W = clamp(p.width, 3, 200)
  const H = clamp(p.height, 0.4, 4)
  const t = clamp(p.thickness, 0.2, 0.6)
  const sump = { x: L / 2 - t - 0.9, z: W / 2 - t - 0.9 }
  return { L, W, H, t, sump, drainY: 0.35, drainX: L / 2 + 0.6 }
}

export function ports(props: BundWallProps = {}): Port[] {
  const p = { ...defaults, ...props }
  if (!p.complete) return []
  const g = layout(p)
  return [port('drain', 'Bund drain', [g.drainX, g.drainY, g.sump.z], [1, 0, 0], p.drainNps, 150, 'drain')]
}

export function BundWall(props: BundWallProps & GroupProps) {
  const { complete, length, width, height, thickness, stairs, drainNps, tag, ...group } = { ...defaults, ...props }
  const p = { complete, length, width, height, thickness, stairs, drainNps, tag }
  const data = useKit((k) => build(k, p, layout(p)), [complete, length, width, height, thickness, stairs, drainNps, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default BundWall

type P = typeof defaults
type G = ReturnType<typeof layout>

/** Straight wall from a to b (centreline) along X or Z, with footing toe, coping and expansion joints. */
function wall(k: Kit, x0: number, z0: number, x1: number, z1: number, g: G, inside: THREE.Vector3) {
  const along = x1 !== x0 ? 'x' : 'z'
  const len = Math.abs(along === 'x' ? x1 - x0 : z1 - z0)
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const size = (a: number, b: number, h: number): [number, number, number] => (along === 'x' ? [a, h, b] : [b, h, a])
  const { t, H } = g
  k.box('concrete', size(len, t, H), [cx, H / 2, cz])
  // footing toe either side, at grade
  k.box('concrete', size(len, t + 0.5, 0.08), [cx, 0.04, cz])
  // coping chamfer and inner coating band
  k.box('concrete', size(len, t + 0.04, 0.05), [cx, H + 0.025, cz])
  const coat = paint('#4d5a5e', { roughness: 0.6, clearcoat: 0.1, weather: 0.4 })
  const off = inside.clone().multiplyScalar(t / 2 + 0.003)
  k.box(coat, size(len, 0.006, H - FLOOR - 0.02), [cx + off.x, FLOOR + (H - FLOOR) / 2, cz + off.z])
  // vertical expansion joints with sealant every ~10 m
  const n = Math.floor(len / 10)
  for (let i = 1; i <= n; i++) {
    const s = -len / 2 + (i * len) / (n + 1)
    const p = along === 'x' ? [cx + s, cz] : [cx, cz + s]
    k.box('rubberBlack', along === 'x' ? [0.02, H + 0.01, t + 0.045] : [t + 0.045, H + 0.01, 0.02], [p[0], H / 2, p[1]])
  }
}

/** Step-over: stair up the outside, landing on the coping, stair down inside; centred on (x, z) facing `out`. */
function stepOver(k: Kit, x: number, z: number, out: THREE.Vector3, g: G, floor = FLOOR) {
  const { H, t } = g
  const top = H + 0.05 + 0.03
  const run = (rise: number) => {
    const n = Math.max(1, Math.round(rise / 0.18))
    return ((n - 1) * rise) / n / Math.tan((38 * Math.PI) / 180)
  }
  const land = t + 0.9
  const dir = (v: THREE.Vector3) => (Math.abs(v.x) > 0.5 ? (v.x > 0 ? '-x' : 'x') : v.z > 0 ? '-z' : 'z')
  // landing across the wall
  const w = 0.9
  const side = new THREE.Vector3(-out.z, 0, out.x)
  const c = new THREE.Vector3(x, top, z)
  const lx = Math.abs(out.x) > 0.5 ? land : w
  const lz = Math.abs(out.x) > 0.5 ? w : land
  grating(k, [x, top, z], lx, lz)
  for (const s of [-1, 1]) {
    const e = c.clone().addScaledVector(side, (s * w) / 2)
    const a = e.clone().addScaledVector(out, -land / 2)
    const b = e.clone().addScaledVector(out, land / 2)
    member(k, [a.x, top - 0.08, a.z], [b.x, top - 0.08, b.z], 'UPN 100', 'galvanised', [0, 1, 0])
    handrail(k, [[a.x, top, a.z], [b.x, top, b.z]], 'safetyYellow')
  }
  // outside flight from grade, inside flight down to the bund floor
  const ro = run(top)
  const fo = c.clone().addScaledVector(out, land / 2 + ro)
  stair(k, [fo.x, 0, fo.z], dir(out), top, w - 0.1)
  const ri = run(top - floor)
  const fi = c.clone().addScaledVector(out, -(land / 2 + ri))
  stair(k, [fi.x, floor, fi.z], dir(out.clone().negate()), top - floor, w - 0.1)
}

function build(k: Kit, p: P, g: G) {
  const { L, W, H, t } = g
  if (!p.complete) {
    wall(k, -L / 2, 0, L / 2, 0, g, new THREE.Vector3(0, 0, -1))
    if (p.stairs) stepOver(k, 0, 0, new THREE.Vector3(0, 0, 1), g, 0)
    if (p.tag) tagPlate(k, p.tag, [-L / 2 + 1, H * 0.6, t / 2 + 0.002], 'z', 0.3)
    return
  }
  const xi = L / 2 - t / 2
  const zi = W / 2 - t / 2
  wall(k, -L / 2, -zi, L / 2, -zi, g, new THREE.Vector3(0, 0, 1))
  wall(k, -L / 2, zi, L / 2, zi, g, new THREE.Vector3(0, 0, -1))
  wall(k, -xi, -zi + t / 2, -xi, zi - t / 2, g, new THREE.Vector3(1, 0, 0))
  wall(k, xi, -zi + t / 2, xi, zi - t / 2, g, new THREE.Vector3(-1, 0, 0))
  // lined floor slab falling to the sump; perimeter fillet
  const lining = paint('#585f5c', { metalness: 0, roughness: 0.75, clearcoat: 0.05, weather: 1.1 })
  const Li = L - 2 * t
  const Wi = W - 2 * t
  k.box(lining, [Li, FLOOR, Wi], [0, FLOOR / 2, 0])
  for (const s of [-1, 1]) {
    k.box(lining, [Li, 0.08, 0.08], [0, FLOOR + 0.0, s * (Wi / 2 - 0.03)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4))
    k.box(lining, [0.08, 0.08, Wi], [s * (Li / 2 - 0.03), FLOOR, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4))
  }
  // drainage channel to the sump along the +Z wall
  k.box('castIron', [Li - 1.6, 0.006, 0.3], [-0.8 + 0.0, FLOOR + 0.003, Wi / 2 - 0.5])
  // sump with grating and the drain line through the wall to a normally-closed valve outside
  const { x: sx, z: sz } = g.sump
  k.box('concrete', [1.06, 0.06, 1.06], [sx, FLOOR + 0.0, sz])
  k.box('rubberBlack', [0.9, 0.004, 0.9], [sx, FLOOR + 0.03, sz])
  grating(k, [sx, FLOOR + 0.035, sz], 0.9, 0.9)
  const dn = p.drainNps
  pipeRun(k, [[sx + 0.2, FLOOR + 0.02, sz], [sx + 0.2, g.drainY, sz], [L / 2 + 0.15, g.drainY, sz]], dn)
  nozzle(k, { base: [L / 2 + 0.15, g.drainY, sz], dir: [1, 0, 0], nps: dn, rating: 150, standout: 0.45, mat: 'pipePaint' })
  k.box('valveBody', [0.2, 0.2, 0.22], [L / 2 + 0.36, g.drainY, sz])
  k.box('actuatorRed', [0.03, 0.02, 0.3], [L / 2 + 0.36, g.drainY + 0.13, sz + 0.1])
  k.cyl('brass', 0.03, 0.05, [L / 2 + 0.36, g.drainY + 0.12, sz], 'y', 10)
  k.box('concrete', [0.5, g.drainY - 0.08, 0.4], [L / 2 + 0.35, (g.drainY - 0.08) / 2, sz])
  k.plane(textMaterial('BUND DRAIN  KEEP CLOSED', '#c3221a', '#ffffff'), 0.5, 0.12, [L / 2 + 0.003, H * 0.6, sz], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
  // step-overs on the two long walls
  if (p.stairs) {
    stepOver(k, -L / 4, -zi, new THREE.Vector3(0, 0, -1), g)
    stepOver(k, L / 4, zi, new THREE.Vector3(0, 0, 1), g)
  }
  // capacity sign
  const cap = Li * Wi * (H - FLOOR)
  k.plane(textMaterial(`BUND ${Math.round(cap)} m³`, '#1f4e9a', '#ffffff'), 1.2, 0.3, [0, H * 0.55, W / 2 + 0.003], new THREE.Quaternion())
  if (p.tag) tagPlate(k, p.tag, [-L / 2 + 1, H * 0.55, W / 2 + 0.002], 'z', 0.3)
}
