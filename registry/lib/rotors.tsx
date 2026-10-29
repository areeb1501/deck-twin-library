// Turning assemblies (fans, couplings) built in their own Kit about a spin axis, plus <Rotors> to animate them.
import { useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Kit, type Built, type MatKey, type V3 } from './kit'
import { KitMesh } from './mesh'
import { meshGuardMaterial } from './textures'

export type SpinAxis = 'x' | 'y' | 'z'

export interface RotorSpec {
  built: Built
  axis: SpinAxis
  // rotor origin in the equipment-local (model) frame
  pos: V3
  // optional Euler (XYZ) orientation of the rotor frame, e.g. for an inclined cardan shaft
  rot?: V3
  // visual speed
  rpm: number
}

const Y = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)

// Fan impeller in the plane perpendicular to `axis`: n pitched blades from a hub out to radius R.
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

// Single-material impeller as a rotor spec.
export function fanRotor(mat: MatKey, R: number, pos: V3, axis: SpinAxis, rpm: number, o: Parameters<typeof fanImpeller>[3] = {}): RotorSpec {
  const k = new Kit()
  fanImpeller(k, mat, R, { ...o, axis })
  return { built: k.build(), axis, pos, rpm }
}

// Flexible spacer coupling and shaft ends, centred on the origin, axis +X.
export function couplingRotor(len: number, r: number, shaftR = 0) {
  const k = new Kit()
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

// Coupling guard shell only (expanded-mesh tunnel, rims, base flanges), for use with couplingRotor().
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

// Guarded coupling: static guard into `k`, the turning coupling returned as a rotor.
export function guardedCoupling(k: Kit, x0: number, x1: number, y: number, r: number, base: number, frame: MatKey, rpm: number, z = 0, shaftR = 0): RotorSpec {
  k.at([0, 0, z], undefined, () => couplingGuardShell(k, x0, x1, y, r, base, frame))
  return { built: couplingRotor(x1 - x0, r, shaftR), axis: 'x', pos: [(x0 + x1) / 2, y, z], rpm }
}

// Cooling fan behind a parts.motor() cowl grille, in the motor frame.
export function cowlFan(R: number, L: number, rpm: number, at: V3 = [0, 0, 0]): RotorSpec {
  const finH = Math.max(0.012, R * 0.12)
  const cowlR = R + finH + 0.012
  const cowlL = Math.max(0.12, R * 0.6)
  const xc = -L - cowlL
  const k = new Kit()
  fanImpeller(k, 'flangeSteel', cowlR * 0.76, { axis: 'x', blades: 7, chord: cowlR * 0.28, thick: 0.004, pitch: 0.12, hub: cowlR * 0.22, hubLen: 0.016 })
  return { built: k.build(), axis: 'x', pos: [at[0] + xc + 0.0095, at[1], at[2]], rpm }
}

// Spins each rotor about its axis while `running`.
export function Rotors({ rotors, running = true }: { rotors: RotorSpec[]; running?: boolean }) {
  return (
    <>
      {rotors.map((r, i) => (
        <Spinner key={i} axis={r.axis} rpm={running ? r.rpm : 0} position={r.pos} rotation={r.rot}>
          <KitMesh data={r.built} shadows={false} />
        </Spinner>
      ))}
    </>
  )
}

export function Spinner({ axis = 'y', rpm = 120, position, rotation, children }: { axis?: SpinAxis; rpm?: number; position?: V3; rotation?: V3; children: ReactNode }) {
  const g = useRef<THREE.Group>(null)
  const phase = useRef(0)
  useFrame((_, dt) => {
    if (!g.current || !rpm) return
    phase.current = (phase.current + (rpm / 60) * Math.PI * 2 * Math.min(dt, 0.1)) % (Math.PI * 2)
    g.current.rotation[axis] = phase.current
  })
  return (
    <group position={position} rotation={rotation}>
      <group ref={g}>{children}</group>
    </group>
  )
}
