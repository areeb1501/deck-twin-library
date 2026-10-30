/**
 * Walkthrough avatar — a procedural offshore operator (~1.78 m) that follows the live `walkPose`.
 *
 * Figure: orange FR coverall with silver reflective tape, white hard hat (brim, ridge, chin strap),
 * safety glasses, two-tone gloves, steel-toe boots, chest radio, clipped gas detector, belt + pouch.
 * Built from lathe / primitive pieces merged into ONE geometry per body segment (one draw group per
 * material), on a joint hierarchy:
 *
 *   root (x, footY, z, yaw) → hips (pelvis) → spine (torso) → neck (head)
 *                                            → shoulder → elbow → wrist      (×2)
 *                           → hip → knee → ankle (boot)                      (×2)
 *
 * Every joint group sits AT the joint, so segment rotations are plain hinge angles. The model faces
 * −Z, so `root.rotation.y = yaw` matches the walker (forward = (−sin yaw, 0, −cos yaw)).
 *
 * Animation (procedural, no clips):
 *  - gait phase advances with signed distance travelled (one step ≈ 0.78 m walking, ≈ 1.75 m running),
 *    so walking backwards plays the cycle in reverse and stopping freezes it;
 *  - walk ↔ run pose blend on |speed|; gait ↔ idle blend (breathing, slow weight shift) as speed → 0;
 *  - turning on the spot advances the phase with |Δyaw| at reduced amplitude (step-shuffle);
 *  - pelvis height comes from leg forward kinematics: the lowest heel/toe touches the floor, so the
 *    vertical bob is emergent and the stance foot never sinks or floats.
 *
 * Materials are private MeshStandardMaterials — not registered with the x-ray / section system.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { walkPose } from './Walk'

// ---------------------------------------------------------------- body dimensions (m)
const THIGH = 0.43
const SHIN = 0.41
const ANKLE_H = 0.09 // ankle joint above the sole
const HIP_H = THIGH + SHIN + ANKLE_H // 0.93
const HIP_X = 0.095
const WAIST = 0.12 // spine joint above the hip joints
const SHOULDER: [number, number] = [0.178, 0.39] // in the spine frame
const NECK = 0.43
const UPPER_ARM = 0.29
const FOREARM = 0.245
/** sole contact points in the ankle frame: [forward, up] */
const HEEL: [number, number] = [-0.07, -ANKLE_H]
const TOE: [number, number] = [0.2, -ANKLE_H]
const DEFAULT_FOOT_Y = 28

// ---------------------------------------------------------------- materials (slot indices)
const S = {
  Coverall: 0,
  Tape: 1,
  Dark: 2,
  Skin: 3,
  Hat: 4,
  Lens: 5,
  Glove: 6,
  HiVis: 7,
  Leather: 8,
  Sole: 9,
  Detector: 10,
  Metal: 11,
} as const
type S = (typeof S)[keyof typeof S]
function makeMaterials(): THREE.MeshStandardMaterial[] {
  const m = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
  return [
    m('#e2621b', 0.82), // FR coverall
    m('#d4d9dd', 0.28, 0.75, { emissive: '#8a9095', emissiveIntensity: 0.35 }), // reflective tape
    m('#1d1f22', 0.6), // straps, belt, radio
    m('#c18d6c', 0.68), // skin
    m('#f3f3ef', 0.32), // hard hat
    m('#1c2a33', 0.08, 0.6), // glasses
    m('#3a3f46', 0.75), // glove
    m('#e3c41f', 0.55), // hi-vis glove backs / cuffs
    m('#3d2a1c', 0.62), // boot leather
    m('#121212', 0.85), // sole
    m('#f0b90f', 0.45), // gas detector body
    m('#9aa0a6', 0.35, 0.8), // buckle, clips
  ]
}

// ---------------------------------------------------------------- geometry helpers
type Piece = [THREE.BufferGeometry, S]
type P2 = [number, number] // [radius, y]

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
/** transform a geometry in place: scale, then rotate (Euler XYZ), then translate */
function put(g: THREE.BufferGeometry, p: number[] = [0, 0, 0], r: number[] = [0, 0, 0], s: number[] = [1, 1, 1]) {
  g.applyMatrix4(_m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2])))
  return g
}
/** lathe about +Y from [radius, y] points (increasing y → outward normals) */
const lathe = (pts: P2[], seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)
const ell = (pts: P2[], sx: number, sz: number, seg = 16) => put(lathe(pts, seg), [0, 0, 0], [0, 0, 0], [sx, 1, sz])
function radiusAt(pts: P2[], y: number) {
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1]
    const [r1, y1] = pts[i]
    if (y >= y0 && y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)
  }
  return y < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0]
}
/** a band hugging a lathe profile between y0 and y1 (tape, belt) */
function band(pts: P2[], y0: number, y1: number, out: number, sx = 1, sz = 1, seg = 16) {
  const n = 4
  const ring: P2[] = []
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n
    ring.push([radiusAt(pts, y) + out, y])
  }
  return ell(ring, sx, sz, seg)
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r)
const sphere = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h)
const cyl = (rt: number, rb: number, h: number, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)

/** merge pieces into one geometry with one draw group per material slot; optionally mirrored in X */
function merge(pieces: Piece[], mirror = false): THREE.BufferGeometry {
  const slots = new Map<number, THREE.BufferGeometry[]>()
  for (const [g0, slot] of pieces) {
    const g = g0.index ? g0.toNonIndexed() : g0
    if (g !== g0) g0.dispose()
    if (mirror) {
      g.applyMatrix4(_m.makeScale(-1, 1, 1))
      // mirroring flips the winding: swap the 2nd and 3rd vertex of every triangle
      for (const name of ['position', 'normal'] as const) {
        const a = g.getAttribute(name).array as Float32Array
        for (let i = 0; i < a.length; i += 9)
          for (let k = 0; k < 3; k++) {
            const t = a[i + 3 + k]
            a[i + 3 + k] = a[i + 6 + k]
            a[i + 6 + k] = t
          }
      }
    }
    const list = slots.get(slot) ?? []
    list.push(g)
    slots.set(slot, list)
  }
  let count = 0
  for (const list of slots.values()) for (const g of list) count += g.getAttribute('position').count
  const pos = new Float32Array(count * 3)
  const nor = new Float32Array(count * 3)
  const out = new THREE.BufferGeometry()
  let o = 0
  for (const slot of [...slots.keys()].sort((a, b) => a - b)) {
    const start = o
    for (const g of slots.get(slot)!) {
      pos.set(g.getAttribute('position').array as Float32Array, o * 3)
      nor.set(g.getAttribute('normal').array as Float32Array, o * 3)
      o += g.getAttribute('position').count
      g.dispose()
    }
    out.addGroup(start, o - start, slot)
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.computeBoundingSphere()
  return out
}

// ---------------------------------------------------------------- body segments (right side, facing −Z)
const PELVIS: P2[] = [[0, -0.13], [0.09, -0.12], [0.15, -0.08], [0.175, -0.02], [0.175, 0.04], [0.165, 0.1], [0.16, 0.15]]
const PELVIS_Z = 0.72
function pelvis(): Piece[] {
  const zf = (y: number) => -radiusAt(PELVIS, y) * PELVIS_Z
  return [
    [ell(PELVIS, 1, PELVIS_Z, 20), S.Coverall],
    [band(PELVIS, 0.07, 0.125, 0.008, 1, PELVIS_Z, 20), S.Dark], // belt
    [put(box(0.062, 0.046, 0.012), [0, 0.098, zf(0.1) - 0.012]), S.Metal], // buckle
    [put(rbox(0.05, 0.1, 0.075, 0.012), [0.178, 0.04, 0.0], [0, 0, 0.06]), S.Dark], // tool pouch (right hip)
    [put(cyl(0.017, 0.017, 0.11, 10), [-0.17, 0.035, 0.05], [0, 0, -0.08]), S.Dark], // torch holster (left hip)
    [put(cyl(0.02, 0.02, 0.03, 10), [-0.17, 0.1, 0.05]), S.HiVis], // torch head
  ]
}

const TORSO: P2[] = [[0.15, -0.035], [0.16, 0.06], [0.175, 0.16], [0.19, 0.26], [0.19, 0.33], [0.182, 0.385], [0.145, 0.425], [0.075, 0.448], [0, 0.452]]
const TORSO_Z = 0.62
/** half-depth of the torso surface at (x, y) */
const torsoZ = (x: number, y: number) => {
  const r = radiusAt(TORSO, y)
  return TORSO_Z * Math.sqrt(Math.max(r * r - x * x, 0))
}
/** a flat strip laid on the torso front (side −1) or back (+1), following the surface in short pieces */
function torsoStrip(x: number, y0: number, y1: number, w: number, side: -1 | 1, slot: S, t = 0.005, lift = 0): Piece[] {
  const out: Piece[] = []
  const n = 3
  for (let i = 0; i < n; i++) {
    const a = y0 + ((y1 - y0) * i) / n
    const b = y0 + ((y1 - y0) * (i + 1)) / n
    const za = torsoZ(x, a)
    const zb = torsoZ(x, b)
    const len = Math.hypot(b - a, zb - za)
    const tilt = Math.atan2(zb - za, b - a) // rotation about X so the strip follows the slope
    out.push([put(box(w, len + 0.004, t), [x, (a + b) / 2, side * ((za + zb) / 2 + t / 2 + lift)], [side * tilt, 0, 0]), slot])
  }
  return out
}
/** something clipped on the chest: a box centred on the torso front at (x, y) */
function onChest(g: THREE.BufferGeometry, x: number, y: number, depth: number, slot: S): Piece {
  const z = -torsoZ(x, y) - depth / 2
  const tilt = Math.atan2(torsoZ(x, y + 0.02) - torsoZ(x, y - 0.02), 0.04)
  return [put(g, [x, y, z], [-tilt, 0, 0]), slot]
}
function torso(): Piece[] {
  const p: Piece[] = [
    [ell(TORSO, 1, TORSO_Z, 24), S.Coverall],
    [band(TORSO, 0.05, 0.1, 0.004, 1, TORSO_Z, 24), S.Tape], // waist tape
    [band(TORSO, 0.235, 0.285, 0.004, 1, TORSO_Z, 24), S.Tape], // chest tape
    [put(new THREE.TorusGeometry(0.072, 0.022, 8, 20), [0, 0.432, 0.004], [Math.PI / 2, 0, 0], [1, 0.92, 1]), S.Coverall], // collar
  ]
  // shoulder tape, front and back
  for (const x of [-0.128, 0.128]) p.push(...torsoStrip(x, 0.285, 0.4, 0.042, -1, S.Tape, 0.005, 0.002), ...torsoStrip(x, 0.285, 0.4, 0.042, 1, S.Tape, 0.005, 0.002))
  p.push(...torsoStrip(0, 0.0, 0.42, 0.014, -1, S.Dark, 0.003, 0.005)) // zip placket
  // radio on the left chest + antenna
  p.push(onChest(rbox(0.056, 0.1, 0.032, 0.008), -0.082, 0.325, 0.032, S.Dark))
  p.push([put(cyl(0.005, 0.007, 0.075, 6), [-0.064, 0.41, -torsoZ(-0.082, 0.33) - 0.02]), S.Dark])
  p.push(onChest(box(0.03, 0.012, 0.006), -0.082, 0.36, 0.04, S.HiVis)) // PTT key
  // gas detector clipped on the right chest
  p.push(onChest(rbox(0.05, 0.078, 0.03, 0.008), 0.082, 0.335, 0.03, S.Detector))
  p.push(onChest(box(0.032, 0.024, 0.004), 0.082, 0.345, 0.034, S.Lens)) // display
  p.push(onChest(box(0.016, 0.03, 0.006), 0.082, 0.39, 0.012, S.Metal)) // crocodile clip
  // badge lanyard
  p.push(...torsoStrip(-0.04, 0.2, 0.43, 0.01, -1, S.Dark, 0.003, 0.006), ...torsoStrip(0.04, 0.2, 0.43, 0.01, -1, S.Dark, 0.003, 0.006))
  p.push(onChest(box(0.055, 0.075, 0.004), 0, 0.17, 0.022, S.Hat)) // ID card (in front of zip + lanyard)
  return p
}

function head(): Piece[] {
  const HAT: P2[] = [[0.128, 0.205], [0.128, 0.225], [0.12, 0.26], [0.1, 0.29], [0.06, 0.31], [0, 0.316]]
  const BRIM: P2[] = [[0.122, 0.198], [0.152, 0.192], [0.157, 0.197], [0.126, 0.212], [0.122, 0.198]]
  const lens = new THREE.CylinderGeometry(0.108, 0.108, 0.034, 16, 1, true, Math.PI - 0.88, 1.76)
  return [
    [put(cyl(0.05, 0.054, 0.13), [0, 0.05, 0.005]), S.Skin], // neck
    [put(sphere(0.105, 20, 14), [0, 0.165, 0.005], [0, 0, 0], [0.86, 1.06, 0.98]), S.Skin], // cranium
    [put(sphere(0.07, 14, 10), [0, 0.115, -0.028], [0, 0, 0], [1, 0.82, 1]), S.Skin], // jaw
    [put(box(0.02, 0.036, 0.03), [0, 0.155, -0.1], [0.32, 0, 0]), S.Skin], // nose
    [put(sphere(0.022, 8, 6), [0.09, 0.165, 0.005], [0, 0, 0], [0.4, 1, 0.7]), S.Skin], // ears
    [put(sphere(0.022, 8, 6), [-0.09, 0.165, 0.005], [0, 0, 0], [0.4, 1, 0.7]), S.Skin],
    [put(lens, [0, 0.178, 0.005], [0, 0, 0], [0.85, 1, 1]), S.Lens], // wrap-around glasses
    [put(box(0.006, 0.008, 0.095), [0.093, 0.182, 0.045]), S.Dark], // temple arms
    [put(box(0.006, 0.008, 0.095), [-0.093, 0.182, 0.045]), S.Dark],
    [put(lathe(HAT, 24), [0, 0, 0.004], [0, 0, 0], [0.88, 1, 1]), S.Hat], // shell
    [put(lathe(BRIM, 24), [0, 0, -0.012], [0, 0, 0], [0.88, 1, 1.1]), S.Hat], // brim with front peak
    [put(new THREE.TorusGeometry(0.118, 0.011, 6, 18, Math.PI), [0, 0.205, 0.004], [0, Math.PI / 2, 0], [1, 0.93, 1.02]), S.Hat], // ridge
    [put(band([[0.11, 0.18], [0.112, 0.205]], 0.18, 0.205, 0, 1, 1, 20), [0, 0, 0.004], [0, 0, 0], [0.88, 1, 1]), S.Dark], // harness band
    [put(new THREE.TorusGeometry(0.112, 0.0045, 4, 16, Math.PI), [0, 0.195, 0.0], [0.32, 0, Math.PI], [0.86, 1.15, 1]), S.Dark], // chin strap
  ]
}

const UPPER: P2[] = [[0.046, -0.3], [0.047, -0.27], [0.053, -0.17], [0.058, -0.06], [0.06, 0.0]]
function upperArm(): Piece[] {
  return [
    [put(sphere(0.063, 16, 12), [0, 0.0, 0], [0, 0, 0], [1, 0.95, 1]), S.Coverall], // deltoid
    [lathe(UPPER, 14), S.Coverall],
    [band(UPPER, -0.165, -0.115, 0.004, 1, 1, 14), S.Tape],
  ]
}
const FORE: P2[] = [[0.044, -0.245], [0.04, -0.23], [0.041, -0.18], [0.046, -0.07], [0.048, 0.0]]
function forearm(): Piece[] {
  return [
    [sphere(0.048, 12, 8), S.Coverall], // elbow
    [lathe(FORE, 14), S.Coverall],
    [band(FORE, -0.155, -0.105, 0.004, 1, 1, 14), S.Tape],
  ]
}
/** right hand hanging, palm toward the body (−X), thumb forward (−Z) */
function hand(): Piece[] {
  return [
    [put(cyl(0.041, 0.044, 0.055, 12), [0, -0.012, 0]), S.HiVis], // gauntlet cuff
    [put(sphere(1, 12, 8), [0, -0.075, 0], [0, 0, 0], [0.026, 0.058, 0.044]), S.Glove], // palm
    [put(sphere(1, 12, 8), [-0.004, -0.13, 0.004], [0.12, 0, 0], [0.023, 0.05, 0.041]), S.Glove], // fingers
    [put(new THREE.CapsuleGeometry(0.012, 0.035, 3, 8), [-0.01, -0.075, -0.042], [0.65, 0, 0.15]), S.Glove], // thumb
    [put(rbox(0.008, 0.065, 0.06, 0.003), [0.024, -0.085, 0]), S.HiVis], // impact pad (back of hand)
  ]
}
const THIGH_P: P2[] = [[0.062, -0.43], [0.07, -0.33], [0.083, -0.17], [0.09, -0.03], [0.088, 0.06]]
function thigh(): Piece[] {
  return [
    [lathe(THIGH_P, 16), S.Coverall],
    [put(rbox(0.014, 0.13, 0.11, 0.005), [radiusAt(THIGH_P, -0.2) + 0.003, -0.2, 0.005]), S.Coverall], // cargo pocket
    [put(box(0.006, 0.03, 0.115), [radiusAt(THIGH_P, -0.14) + 0.009, -0.14, 0.005]), S.Coverall], // pocket flap
  ]
}
const SHIN_P: P2[] = [[0.058, -0.33], [0.055, -0.28], [0.055, -0.16], [0.058, -0.06], [0.06, 0.0]]
function shin(): Piece[] {
  return [
    [sphere(0.062, 14, 10), S.Coverall], // knee
    [lathe(SHIN_P, 16), S.Coverall],
    [band(SHIN_P, -0.205, -0.16, 0.004, 1, 1, 16), S.Tape],
    [band(SHIN_P, -0.29, -0.245, 0.004, 1, 1, 16), S.Tape],
  ]
}
function boot(): Piece[] {
  return [
    [put(cyl(0.052, 0.05, 0.14, 14), [0, 0.04, 0.005]), S.Leather], // shaft
    [put(rbox(0.1, 0.075, 0.25, 0.03), [0, -0.03, -0.06]), S.Leather], // foot
    [put(sphere(0.052, 12, 8), [0, -0.045, -0.15], [0, 0, 0], [0.98, 0.74, 0.95]), S.Leather], // steel toe cap
    [put(rbox(0.108, 0.026, 0.275, 0.009), [0, -0.077, -0.065]), S.Sole],
    [put(box(0.03, 0.05, 0.004), [0, 0.0, -0.051], [-0.25, 0, 0]), S.Dark], // tongue / laces
  ]
}

// ---------------------------------------------------------------- rig
interface Rig {
  root: THREE.Group
  hips: THREE.Group
  spine: THREE.Group
  neck: THREE.Group
  shoulder: [THREE.Group, THREE.Group] // [left, right]
  elbow: [THREE.Group, THREE.Group]
  wrist: [THREE.Group, THREE.Group]
  hip: [THREE.Group, THREE.Group]
  knee: [THREE.Group, THREE.Group]
  ankle: [THREE.Group, THREE.Group]
  geometries: THREE.BufferGeometry[]
  materials: THREE.Material[]
  triangles: number
}

function buildRig(): Rig {
  const materials = makeMaterials()
  const geometries: THREE.BufferGeometry[] = []
  const noRay = () => {}
  const seg = (parent: THREE.Object3D, pieces: Piece[], mirror = false) => {
    const g = merge(pieces, mirror)
    geometries.push(g)
    const mesh = new THREE.Mesh(g, materials)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.raycast = noRay // never steal picks / gaze from the plant
    parent.add(mesh)
  }
  const joint = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const j = new THREE.Group()
    j.position.set(x, y, z)
    parent.add(j)
    return j
  }

  const root = new THREE.Group()
  root.name = 'avatar'
  const hips = joint(root, 0, HIP_H)
  seg(hips, pelvis())
  const spine = joint(hips, 0, WAIST)
  seg(spine, torso())
  const neck = joint(spine, 0, NECK)
  seg(neck, head())

  const side = (s: -1 | 1) => {
    const mirror = s < 0
    const shoulder = joint(spine, s * SHOULDER[0], SHOULDER[1])
    seg(shoulder, upperArm(), mirror)
    const elbow = joint(shoulder, 0, -UPPER_ARM)
    seg(elbow, forearm(), mirror)
    const wrist = joint(elbow, 0, -FOREARM)
    seg(wrist, hand(), mirror)
    const hip = joint(hips, s * HIP_X, 0)
    seg(hip, thigh(), mirror)
    const knee = joint(hip, 0, -THIGH)
    seg(knee, shin(), mirror)
    const ankle = joint(knee, 0, -SHIN)
    seg(ankle, boot(), mirror)
    return { shoulder, elbow, wrist, hip, knee, ankle }
  }
  const L = side(-1)
  const R = side(1)
  const triangles = geometries.reduce((n, g) => n + g.getAttribute('position').count / 3, 0)
  root.userData.triangles = triangles
  return {
    root, hips, spine, neck,
    shoulder: [L.shoulder, R.shoulder], elbow: [L.elbow, R.elbow], wrist: [L.wrist, R.wrist],
    hip: [L.hip, R.hip], knee: [L.knee, R.knee], ankle: [L.ankle, R.ankle],
    geometries, materials, triangles,
  }
}

// ---------------------------------------------------------------- animation
const TAU = Math.PI * 2
const lerp = THREE.MathUtils.lerp
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number, a: number, b: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const damp = (x: number, target: number, rate: number, dt: number) => x + (target - x) * (1 - Math.exp(-rate * dt))
const wrapPi = (a: number) => a - TAU * Math.round(a / TAU)
/** smooth periodic bump centred at c (width w, radians) */
const bump = (x: number, c: number, w: number) => {
  const d = wrapPi(x - c)
  return Math.exp(-(d * d) / (w * w))
}
/** step length (m) for a given |speed| */
const stepLength = (a: number) => (a <= 2.2 ? 0.5 + 0.28 * (a / 2.2) : Math.min(1.85, 0.78 + ((a - 2.2) / 4.3) * 0.97))

/** gait parameters, blended walk → run */
interface Gait {
  hipAmp: number
  hipOff: number
  kneeSwing: number
  kneeStance: number
  toeOff: number
  heelStrike: number
  armAmp: number
  armOff: number
  elbow: number
  elbowSwing: number
  lean: number
  twist: number // pelvis yaw
  shoulderTwist: number // net shoulder yaw
  roll: number
  sway: number
  flight: number
}
const WALK_G: Gait = {
  hipAmp: 0.44, hipOff: 0.03, kneeSwing: 1.0, kneeStance: 0.16, toeOff: 0.5, heelStrike: 0.22,
  armAmp: 0.36, armOff: 0.02, elbow: 0.2, elbowSwing: 0.3, lean: -0.04, twist: 0.08, shoulderTwist: 0.07,
  roll: 0.035, sway: 0.022, flight: 0,
}
const RUN_G: Gait = {
  hipAmp: 0.66, hipOff: 0.2, kneeSwing: 1.85, kneeStance: 0.42, toeOff: 0.75, heelStrike: 0.1,
  armAmp: 0.72, armOff: 0.12, elbow: 1.45, elbowSwing: 0.25, lean: -0.2, twist: 0.1, shoulderTwist: 0.17,
  roll: 0.03, sway: 0.012, flight: 0.06,
}
const gaitKeys = Object.keys(WALK_G) as (keyof Gait)[]

interface LegAngles {
  hip: number
  knee: number
  ankle: number
}
/** one leg at gait phase ψ (hip forward-most at ψ = π/2, swing for cos ψ > 0) */
function legAt(psi: number, g: Gait, amp: number, out: LegAngles) {
  const hip = g.hipOff * amp + g.hipAmp * amp * Math.sin(psi)
  const swing = Math.max(0, Math.cos(psi + 0.25))
  const knee = -(0.04 + g.kneeSwing * Math.sqrt(amp) * Math.pow(swing, 1.5) + g.kneeStance * amp * bump(psi, 2.25, 0.55))
  // global foot pitch: toe up at heel strike, toe down through push-off, flat in mid-stance
  const foot = amp * (g.heelStrike * bump(psi, Math.PI / 2 - 0.1, 0.45) - g.toeOff * bump(psi, -Math.PI / 2 + 0.15, 0.5))
  // stance: sole kept near level; swing: the foot hangs off the shin (slightly dorsiflexed for clearance)
  const sw = 0.6 * Math.pow(Math.max(0, Math.cos(psi + 0.35)), 0.7)
  out.hip = hip
  out.knee = knee
  out.ankle = (foot - hip - knee) * (1 - sw) + sw * amp * 0.12
}
/** lowest sole point below the hip joint (negative), by sagittal forward kinematics */
function soleLow(l: LegAngles) {
  const a1 = l.hip
  const a2 = a1 + l.knee
  const a3 = a2 + l.ankle
  const ky = -THIGH * Math.cos(a1)
  const ay = ky - SHIN * Math.cos(a2)
  // rotate [f, y] by a3: y' = f sin a3 + y cos a3
  const h = ay + HEEL[0] * Math.sin(a3) + HEEL[1] * Math.cos(a3)
  const t = ay + TOE[0] * Math.sin(a3) + TOE[1] * Math.cos(a3)
  return Math.min(h, t)
}

export function Avatar(): JSX.Element | null {
  const rig = useMemo(() => buildRig(), [])
  useEffect(
    () => () => {
      rig.geometries.forEach((g) => g.dispose())
      rig.materials.forEach((m) => m.dispose())
    },
    [rig],
  )
  // per-instance animation state (mutated every frame through the ref)
  const state = useRef({
    rig, init: false, prevX: 0, prevZ: 0, prevYaw: 0, speed: 0, move: 0, run: 0, turn: 0, phase: 0, t: 0,
    g: { ...WALK_G } as Gait, L: { hip: 0, knee: 0, ankle: 0 } as LegAngles, R: { hip: 0, knee: 0, ankle: 0 } as LegAngles,
  })

  useFrame((_, rawDt) => {
    const st = state.current
    const rig = st.rig
    const p = walkPose
    const dt = Math.min(Math.max(rawDt, 1e-4), 0.1)
    st.t += dt
    const x = p.x
    const z = p.z
    const yaw = p.yaw
    if (!st.init) {
      st.init = true
      st.prevX = x
      st.prevZ = z
      st.prevYaw = yaw
    }
    let dx = x - st.prevX
    let dz = z - st.prevZ
    let dyaw = wrapPi(yaw - st.prevYaw)
    st.prevX = x
    st.prevZ = z
    st.prevYaw = yaw
    const dist = Math.hypot(dx, dz)
    // teleports (walk-to, level change, re-entering walk mode): no stride, no spin
    if (dist > 1.5 || Math.abs(dyaw) > 0.8) dx = dz = dyaw = 0

    // ---- speed (signed: negative walking backwards). Walk.tsx publishes a smoothed forward-projected
    // speed; the measured plan distance also covers sideways steps (Q/E), so take the larger.
    const d = Math.hypot(dx, dz)
    const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz
    const published = Number.isFinite(p.speed) ? p.speed : 0
    const sign = published !== 0 ? Math.sign(published) : fwd < -0.3 * d ? -1 : 1
    const sp = sign * Math.max(Math.abs(published), d / dt)
    st.speed = damp(st.speed, sp, 9, dt)
    const a = Math.abs(st.speed)
    st.move = damp(st.move, smooth(a, 0.05, 1.0), 10, dt)
    st.run = damp(st.run, smooth(a, 2.8, 5.2), 6, dt)
    const yawRate = Math.abs(dyaw) / dt
    st.turn = damp(st.turn, (1 - smooth(a, 0.2, 0.8)) * smooth(yawRate, 0.15, 0.9), 8, dt)

    // ---- phase: distance travelled (signed), plus a shuffle while turning on the spot
    st.phase += (sign * d * Math.PI) / stepLength(Math.max(a, d / dt)) // one step = half a cycle
    st.phase += (Math.abs(dyaw) / 0.75) * Math.PI * (1 - st.move)
    st.phase = wrapPi(st.phase)

    const g = st.g
    for (const k of gaitKeys) g[k] = lerp(WALK_G[k], RUN_G[k], st.run)
    const w = Math.max(st.move, st.turn) // gait weight vs idle
    const amp = clamp01(st.move * lerp(0.55, 1, smooth(a, 0.3, 2.0)) + st.turn * 0.4)
    const phL = st.phase
    const phR = st.phase + Math.PI
    const sL = Math.sin(phL)
    const cL = Math.cos(phL)

    // ---- legs
    legAt(phL, g, amp, st.L)
    legAt(phR, g, amp, st.R)
    const idleShift = Math.sin(st.t * 0.42) // slow weight shift
    const idleW = 1 - w
    const legs = [st.L, st.R]
    for (const l of legs) {
      l.hip *= w
      l.knee = l.knee * w + -0.035 * idleW
      l.ankle = l.ankle * w + 0.035 * idleW
    }
    // ---- pelvis
    const sway = w * g.sway * amp * cL + idleW * 0.018 * idleShift
    const roll = w * g.roll * amp * cL - idleW * 0.025 * idleShift
    const twist = -w * g.twist * amp * sL
    rig.hips.rotation.set(0, twist, roll)
    rig.hips.position.x = sway
    // hip joint heights from the roll; pelvis height so the lowest sole touches the floor
    const yL = -HIP_X * Math.sin(roll)
    const yR = HIP_X * Math.sin(roll)
    let hipsY = Math.max(-yL - soleLow(st.L), -yR - soleLow(st.R))
    hipsY += st.run * w * g.flight * Math.max(0, Math.sin(2 * phL - 0.6))
    rig.hips.position.y = hipsY
    for (let i = 0; i < 2; i++) {
      const l = legs[i]
      // legs stay plumb under lateral sway / roll
      rig.hip[i].rotation.set(l.hip, 0, -roll - sway / HIP_H)
      rig.knee[i].rotation.set(l.knee, 0, 0)
      rig.ankle[i].rotation.set(l.ankle, 0, 0)
    }

    // ---- spine, head
    const breathe = Math.sin(st.t * 1.65)
    const lean = w * g.lean * amp + idleW * 0.012 * breathe
    const shoulderTwist = w * g.shoulderTwist * amp * sL
    rig.spine.rotation.set(lean, shoulderTwist - twist, -roll * 0.6)
    rig.spine.scale.set(1 + 0.008 * breathe * idleW, 1, 1 + 0.012 * breathe * idleW)
    const look = idleW * 0.12 * Math.sin(st.t * 0.23) * Math.sin(st.t * 0.11 + 1)
    rig.neck.rotation.set(-lean * 0.85, -shoulderTwist + look, roll * 0.4)

    // ---- arms (left arm swings with the right leg)
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1
      const swing = (i === 0 ? -sL : sL) * g.armAmp * amp
      const shoulderX = w * (g.armOff * amp + swing) + idleW * (0.03 + 0.01 * breathe)
      const elbow = w * (g.elbow * Math.max(amp, st.run) + g.elbowSwing * Math.max(0, swing)) + idleW * 0.16
      rig.shoulder[i].rotation.set(shoulderX, 0, s * (0.075 + 0.03 * st.run * w) + s * 0.006 * breathe * idleW)
      rig.elbow[i].rotation.set(elbow, 0, 0)
      rig.wrist[i].rotation.set(-0.04 * elbow, s * -0.15 * st.run * w, 0)
    }

    // ---- placement
    rig.root.position.set(x, Number.isFinite(p.footY) ? p.footY : DEFAULT_FOOT_Y, z)
    rig.root.rotation.y = yaw
  })

  return <primitive object={rig.root} />
}
