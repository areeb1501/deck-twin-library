/**
 * Moving-part builders for the machinery models (rendered by <Rotors> / <Doors> in Moving.tsx).
 *
 * A model's static Kit stays one merged mesh; every assembly that turns (fan impeller, coupling,
 * cardan shaft …) is built in its OWN small Kit about the origin with the spin axis along a local
 * axis, and handed back as a RotorSpec: the renderer wraps it in <Spinner tag axis rpm> placed at
 * `pos` (and `rot`, for inclined shafts) in the equipment-local frame. Keep each rotor to one or two
 * materials so it costs one or two draw calls.
 *
 * Visual speeds: keep rpm ≲ 300 and use "odd" numbers (e.g. 170, 215) so the n-fold symmetry of
 * blades / bolts doesn't alias into a stationary or backwards-turning wheel.
 */
import * as THREE from 'three'
import { Kit, type Built, type MatKey, type V3 } from './kit'
import { meshGuardMaterial } from './textures'

export type SpinAxis = 'x' | 'y' | 'z'

export interface RotorSpec {
  built: Built
  axis: SpinAxis
  /** rotor origin in the equipment-local (model) frame */
  pos: V3
  /** optional Euler (XYZ) orientation of the rotor frame, e.g. for an inclined cardan shaft */
  rot?: V3
  /** visual speed */
  rpm: number
}

export interface DoorSpec {
  id: string
  /** hinge point in the equipment-local frame */
  hinge: V3
  /** orientation of the closed leaf about +Y (= the wall's face angle) */
  rotationY: number
  /** swing when open, radians (sign = direction) */
  openAngle: number
  /** leaf geometry, relative to the hinge */
  built: Built
  /** leaf width (for reports / tools) */
  width: number
}

/** New Kit sharing the parent's material aliases (so colours match the static model). */
export function subKit(parent?: Kit) {
  const k = new Kit()
  if (parent) k.alias = { ...parent.alias }
  return k
}

const Y = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)

/**
 * Fan impeller in the plane perpendicular to `axis` (through the origin): n pitched blades from a
 * hub out to radius R. One material unless `hubMat` differs.
 */
export function fanImpeller(
  k: Kit,
  mat: MatKey,
  R: number,
  o: { axis?: SpinAxis; blades?: number; chord?: number; pitch?: number; hub?: number; hubLen?: number; thick?: number; hubMat?: MatKey } = {},
) {
  const n = o.blades ?? 4
  const hubR = o.hub ?? Math.max(0.025, R * 0.2)
  const chord = o.chord ?? Math.max(0.03, R * 0.42)
  const pitch = o.pitch ?? 0.38
  const th = o.thick ?? Math.max(0.004, R * 0.025)
  const axis = o.axis ?? 'y'
  k.at([0, 0, 0], axis, () => {
    k.cyl(o.hubMat ?? mat, hubR, o.hubLen ?? Math.max(th * 4, chord * 0.55), [0, 0, 0], 'y', 20)
    const span = R - hubR * 0.8
    const rc = hubR * 0.8 + span / 2
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const q = new THREE.Quaternion().setFromAxisAngle(Y, -a).multiply(new THREE.Quaternion().setFromAxisAngle(X, pitch))
      k.box(mat, [span, th, chord], [Math.cos(a) * rc, 0, Math.sin(a) * rc], q)
      // wider, rounded-off tip so the blade reads as a fan blade, not a stick
      k.box(mat, [span * 0.35, th, chord * 1.25], [Math.cos(a) * (R - span * 0.2), 0, Math.sin(a) * (R - span * 0.2)], q)
    }
  })
  return k
}

/** Single-material impeller as a rotor spec. */
export function fanRotor(parent: Kit | undefined, mat: MatKey, R: number, pos: V3, axis: SpinAxis, rpm: number, o: Parameters<typeof fanImpeller>[3] = {}): RotorSpec {
  const k = subKit(parent)
  fanImpeller(k, mat, R, { ...o, axis })
  return { built: k.build(), axis, pos, rpm }
}

/**
 * Flexible spacer coupling + both shaft ends, centred on the origin, axis +X, between x = −len/2 and
 * +len/2 (same proportions as parts.couplingGuard). A dark key bar on the hubs and the bolt heads make
 * the turning visible. Materials: 'flangeSteel' + 'nut'.
 */
export function couplingRotor(parent: Kit | undefined, len: number, r: number, shaftR = 0) {
  const k = subKit(parent)
  const hub = Math.max(0.05, r * 0.45)
  const x0 = -len / 2
  const x1 = len / 2
  k.cyl('flangeSteel', hub, len * 0.18, [x0 + len * 0.12, 0, 0], 'x', 24)
  k.cyl('flangeSteel', hub, len * 0.18, [x1 - len * 0.12, 0, 0], 'x', 24)
  k.cyl('flangeSteel', hub * 0.45, len * 0.6, [0, 0, 0], 'x', 16)
  for (const xx of [x0 + len * 0.23, x1 - len * 0.23]) {
    k.cyl('nut', hub * 1.1, len * 0.04, [xx, 0, 0], 'x', 24)
    k.boltCircle('nut', 'nut', 6, hub * 0.8, [xx - len * 0.04, 0, 0], 'x', hub * 0.12, len * 0.08, [len * 0.01, len * 0.07])
  }
  // keys / paint marks on the hubs (one side only)
  for (const xx of [x0 + len * 0.12, x1 - len * 0.12]) k.box('nut', [len * 0.16, hub * 0.22, hub * 0.3], [xx, hub, 0])
  // shaft ends inside the guard, a touch proud of the static shafts so they cover them
  if (shaftR > 0) {
    for (const s of [-1, 1]) {
      k.cyl('flangeSteel', shaftR * 1.06, len * 0.12, [s * (len / 2 - len * 0.03), 0, 0], 'x', 16)
      k.box('nut', [len * 0.1, shaftR * 0.3, shaftR * 0.45], [s * (len / 2 - len * 0.03), shaftR * 1.02, 0])
    }
  }
  return k.build()
}

/**
 * The guard half of parts.couplingGuard (expanded-mesh U tunnel + solid rims + bottom flanges),
 * without the coupling — use with couplingRotor() so the coupling can turn inside it.
 */
export function couplingGuardShell(k: Kit, x0: number, x1: number, y: number, r: number, base: number, frame: MatKey = 'safetyYellow') {
  const len = x1 - x0
  const W = r
  const H = y - base + r
  const prof = new THREE.Shape()
  prof.moveTo(-W, 0)
  prof.lineTo(-W, H - W)
  prof.absarc(0, H - W, W, Math.PI, 0, true)
  prof.lineTo(W, 0)
  prof.lineTo(W - 0.004, 0)
  prof.absarc(0, H - W, W - 0.004, 0, Math.PI, false)
  prof.lineTo(-W + 0.004, 0)
  prof.closePath()
  const q = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2)
  const meshGeo = new THREE.ExtrudeGeometry(prof, { depth: len - 0.04, bevelEnabled: false, curveSegments: 16 })
  const uv = meshGeo.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 8)
  k.add(meshGuardMaterial(), meshGeo, new THREE.Matrix4().compose(new THREE.Vector3(x0 + 0.02, base, 0), q, new THREE.Vector3(1, 1, 1)))
  for (const xx of [x0 + 0.01, x1 - 0.03]) {
    const rim = new THREE.Shape()
    rim.moveTo(-W - 0.012, 0)
    rim.lineTo(-W - 0.012, H - W)
    rim.absarc(0, H - W, W + 0.012, Math.PI, 0, true)
    rim.lineTo(W + 0.012, 0)
    rim.lineTo(W - 0.02, 0)
    rim.absarc(0, H - W, W - 0.02, 0, Math.PI, false)
    rim.lineTo(-W + 0.02, 0)
    rim.closePath()
    k.extrude(frame, rim, 0.02, new THREE.Matrix4().compose(new THREE.Vector3(xx, base, 0), q, new THREE.Vector3(1, 1, 1)), 16)
  }
  for (const s of [-1, 1]) k.box(frame, [len, 0.006, 0.05], [(x0 + x1) / 2, base + 0.003, s * (W + 0.02)])
}

/**
 * Guarded coupling: static guard into `k`, turning coupling as a rotor spec. Same arguments as
 * parts.couplingGuard plus the shaft line z and the shaft radius.
 */
export function guardedCoupling(k: Kit, x0: number, x1: number, y: number, r: number, base: number, frame: MatKey, rpm: number, z = 0, shaftR = 0): RotorSpec {
  k.at([0, 0, z], undefined, () => couplingGuardShell(k, x0, x1, y, r, base, frame))
  return { built: couplingRotor(k, x1 - x0, r, shaftR), axis: 'x', pos: [(x0 + x1) / 2, y, z], rpm }
}

/**
 * Cooling fan inside a parts.tefcMotor fan cowl (motor-local frame: shaft along +X, coupling face at
 * x = 0, cowl at −X). It sits in the gap between the cowl's black baffle disc and the grille, so it
 * shows through the guard. Returns the rotor position in the motor frame (add the motor origin).
 */
export function tefcCowlFan(parent: Kit | undefined, R: number, L: number, rpm: number, at: V3 = [0, 0, 0]): RotorSpec {
  // mirrors tefcMotor's cowl maths
  const finH = Math.max(0.012, R * 0.12)
  const cowlR = R + finH + 0.012
  const cowlL = Math.max(0.12, R * 0.6)
  const xc = -L - cowlL
  const k = subKit(parent)
  fanImpeller(k, 'flangeSteel', cowlR * 0.76, { axis: 'x', blades: 7, chord: cowlR * 0.28, thick: 0.004, pitch: 0.12, hub: cowlR * 0.22, hubLen: 0.016 })
  return { built: k.build(), axis: 'x', pos: [at[0] + xc + 0.0095, at[1], at[2]], rpm }
}
