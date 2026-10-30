/**
 * The inspection units in 3D (plan 12): a clean industrial quadcopter and a tracked robot, plus their bay on the LQ
 * main deck. Mounted by Scene.tsx only while useStore.inspection is on, on the Alpha field, in WORLD coordinates
 * outside the plant root, so the static batcher and the detail cull never touch them.
 *
 * Each unit is a few merged meshes (vertex colours, like the CCTV housings), not pickable, no shadow casting: the
 * shadow map updates on demand, so a moving caster would leave a stale shadow. Motion comes from
 * safety/inspection.ts: stepUnits runs here once a frame, this file only draws the pose.
 *
 * tools/floating.mjs skips the group named `drone`: it hovers on purpose. The robot and the bay are not skipped.
 * userData.auditOwner makes each unit one item to that audit, so its parts can't vouch for each other.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { DRONE_PAD, ROBOT_PAD } from '../model/inspectionSite'
import { UNIT_SPEC, stepUnits, unitBodies, unitPose, useInspection, type UnitId } from '../safety/inspection'

const noRaycast = () => null

function tinted(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g
  const c = new THREE.Color(color)
  const n = geo.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3))
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k)
  return geo
}
type P = [THREE.BufferGeometry, string]
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z)
const merged = (parts: P[]) => mergeGeometries(parts.map(([g, c]) => tinted(g, c)), false)!

const GRAPHITE = '#2c3136'
const CARBON = '#1b1e21'
const PANEL = '#d9dcdd'
const SIGNAL = '#e8a317'
const STEEL = '#aeb4b9'

// ---------------------------------------------------------------- drone (reference point: body centre; forward −Z)

const ROTOR = 0.46
const R_XZ: [number, number][] = [
  [ROTOR, ROTOR],
  [-ROTOR, ROTOR],
  [ROTOR, -ROTOR],
  [-ROTOR, -ROTOR],
]

function droneBody() {
  const parts: P[] = [
    [at(new RoundedBoxGeometry(0.46, 0.13, 0.34, 3, 0.05), 0, 0, 0), GRAPHITE],
    [at(new RoundedBoxGeometry(0.34, 0.05, 0.24, 3, 0.022), 0, 0.085, 0), PANEL],
    [at(new THREE.CylinderGeometry(0.055, 0.06, 0.03, 20), 0, 0.125, 0.03), PANEL], // GNSS puck
    [at(new RoundedBoxGeometry(0.16, 0.06, 0.1, 2, 0.02), 0, 0.03, 0.22), GRAPHITE], // battery
    [at(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), 0.1, -0.19, 0.0), STEEL],
    [at(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), -0.1, -0.19, 0.0), STEEL],
    [at(new THREE.BoxGeometry(0.02, 0.018, 0.5), 0.1, -0.325, 0), CARBON], // skids
    [at(new THREE.BoxGeometry(0.02, 0.018, 0.5), -0.1, -0.325, 0), CARBON],
    [at(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 12), 0, -0.1, -0.1), GRAPHITE], // gimbal yoke
    [at(new THREE.SphereGeometry(0.075, 18, 14), 0, -0.17, -0.1), PANEL], // gimbal
  ]
  for (const [x, z] of R_XZ) {
    const len = Math.hypot(x, z)
    const arm = new THREE.CylinderGeometry(0.016, 0.02, len, 10).rotateZ(Math.PI / 2).rotateY(Math.atan2(-z, x))
    parts.push([at(arm, x / 2, 0.02, z / 2), CARBON])
    parts.push([at(new THREE.CylinderGeometry(0.038, 0.042, 0.06, 16), x, 0.05, z), GRAPHITE])
    parts.push([at(new THREE.TorusGeometry(0.235, 0.008, 8, 40).rotateX(Math.PI / 2), x, 0.085, z), SIGNAL]) // prop guard
    for (const a of [0, Math.PI / 2]) parts.push([at(new THREE.BoxGeometry(0.47, 0.006, 0.012).rotateY(a), x, 0.085, z), CARBON])
  }
  return merged(parts)
}
function droneGlass() {
  return merged([
    [at(new THREE.CylinderGeometry(0.038, 0.038, 0.016, 18).rotateX(Math.PI / 2), 0, -0.17, -0.172), '#0b0e11'],
    [at(new THREE.SphereGeometry(0.012, 8, 6), 0.05, -0.17, -0.16), '#0b0e11'],
  ])
}

// ---------------------------------------------------------------- robot (reference point: deck under its centre; forward −Z)

/** between the end wheels' axles, m */
const TRACK_L = 0.92
const TRACK_R = 0.13
const TRACK_X = 0.34
const TREADS = 42

/** the rubber belt round the wheels: a stadium ring, the grousers run on it */
function trackBelt(x: number) {
  const hl = TRACK_L / 2
  const R = TRACK_R
  const outer = new THREE.Shape()
  outer.moveTo(-hl, 0)
  outer.lineTo(hl, 0)
  outer.absarc(hl, R, R, -Math.PI / 2, Math.PI / 2, false)
  outer.lineTo(-hl, 2 * R)
  outer.absarc(-hl, R, R, Math.PI / 2, (3 * Math.PI) / 2, false)
  const r = R - 0.016
  const hole = new THREE.Path()
  hole.moveTo(-hl, R - r)
  hole.lineTo(hl, R - r)
  hole.absarc(hl, R, r, -Math.PI / 2, Math.PI / 2, false)
  hole.lineTo(-hl, R + r)
  hole.absarc(-hl, R, r, Math.PI / 2, (3 * Math.PI) / 2, false)
  outer.holes.push(hole)
  // the shape is drawn in (z, y): turn its depth axis onto x
  const g = new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: false, curveSegments: 14 })
  g.translate(0, 0, -0.06).rotateY(Math.PI / 2)
  return at(g, x, 0, 0)
}

function robotBody() {
  const parts: P[] = [
    [at(new RoundedBoxGeometry(0.5, 0.22, 1.0, 3, 0.05), 0, 0.3, 0), GRAPHITE],
    [at(new RoundedBoxGeometry(0.46, 0.05, 0.92, 3, 0.02), 0, 0.43, 0), PANEL],
    [at(new RoundedBoxGeometry(0.36, 0.08, 0.3, 3, 0.03), 0, 0.49, 0.2), GRAPHITE], // electronics
    [at(new THREE.BoxGeometry(0.5, 0.05, 0.03), 0, 0.31, -0.51), SIGNAL], // bumper
    [at(new THREE.BoxGeometry(0.5, 0.05, 0.03), 0, 0.31, 0.51), SIGNAL],
    [at(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 20), 0, 0.5, -0.32), STEEL], // lidar base
    [at(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 20), 0, 0.545, -0.32), CARBON],
    // mast and pan-tilt head
    [at(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 16), 0, 0.5, -0.05), GRAPHITE],
    [at(new THREE.CylinderGeometry(0.024, 0.024, 0.72, 12), 0, 0.88, -0.05), STEEL],
    [at(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8), 0.16, 0.66, 0.34), CARBON], // antenna
  ]
  for (const sx of [-1, 1]) {
    const x = sx * TRACK_X
    parts.push([trackBelt(x), '#17191c'])
    // side plate between the sprockets, and the road wheels
    parts.push([at(new THREE.BoxGeometry(0.024, 0.13, TRACK_L - 0.06), x + sx * 0.066, TRACK_R, 0), SIGNAL])
    for (const z of [-0.46, -0.23, 0, 0.23, 0.46]) parts.push([at(new THREE.CylinderGeometry(TRACK_R - 0.03, TRACK_R - 0.03, 0.09, 18).rotateZ(Math.PI / 2), x, TRACK_R, z), z === -0.46 || z === 0.46 ? STEEL : '#5a6066'])
  }
  return merged(parts)
}
function robotHead() {
  return merged([
    [at(new RoundedBoxGeometry(0.2, 0.11, 0.16, 3, 0.03), 0, 0, 0), PANEL],
    [at(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 18).rotateX(Math.PI / 2), 0.05, 0, -0.09), '#0b0e11'],
    [at(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 18).rotateX(Math.PI / 2), -0.05, 0, -0.09), '#3a1d10'], // thermal
    [at(new THREE.BoxGeometry(0.22, 0.012, 0.18), 0, 0.062, 0), GRAPHITE],
  ])
}

/** a point on the track loop at s (m around it): along the bottom, up the rear, back along the top, down the front */
function treadAt(s: number, m: THREE.Matrix4, x: number) {
  const L = TRACK_L
  const R = TRACK_R
  const perim = 2 * L + 2 * Math.PI * R
  const u = ((s % perim) + perim) % perim
  let y: number
  let z: number
  let a: number
  if (u < L) {
    y = -0.004
    z = -L / 2 + u
    a = 0
  } else if (u < L + Math.PI * R) {
    a = (u - L) / R
    y = R - (R + 0.004) * Math.cos(a)
    z = L / 2 + (R + 0.004) * Math.sin(a)
  } else if (u < 2 * L + Math.PI * R) {
    y = 2 * R + 0.004
    z = L / 2 - (u - L - Math.PI * R)
    a = Math.PI
  } else {
    a = Math.PI + (u - 2 * L - Math.PI * R) / R
    y = R - (R + 0.004) * Math.cos(a)
    z = -L / 2 + (R + 0.004) * Math.sin(a)
  }
  m.makeRotationX(a).setPosition(x, y, z)
}

// ---------------------------------------------------------------- the bay

function Bay() {
  const geo = useMemo(() => {
    const [dx, dz] = DRONE_PAD
    const [rx, rz] = ROBOT_PAD
    return merged([
      // drone pad: a low plate with a marked ring
      [at(new THREE.CylinderGeometry(0.85, 0.88, 0.06, 40), dx, 28.03, dz), '#3a3f44'],
      [at(new THREE.RingGeometry(0.62, 0.72, 40).rotateX(-Math.PI / 2), dx, 28.063, dz), SIGNAL],
      [at(new RoundedBoxGeometry(0.34, 0.5, 0.22, 2, 0.03), dx - 1.02, 28.25, dz), PANEL], // charger
      // robot pad: marked outline, charger post behind it
      [at(new THREE.BoxGeometry(1.16, 0.012, 1.66), rx, 28.006, rz), '#3a3f44'],
      [at(new THREE.BoxGeometry(0.06, 0.003, 1.66), rx - 0.55, 28.014, rz), SIGNAL],
      [at(new THREE.BoxGeometry(0.06, 0.003, 1.66), rx + 0.55, 28.014, rz), SIGNAL],
      [at(new RoundedBoxGeometry(0.4, 0.72, 0.16, 2, 0.03), rx, 28.36, rz + 1.0), PANEL],
      [at(new THREE.BoxGeometry(0.18, 0.05, 0.12), rx, 28.5, rz + 0.86), CARBON], // contacts
    ])
  }, [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.6, side: THREE.DoubleSide }), [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  return <mesh name="inspection-bay" geometry={geo} material={mat} raycast={noRaycast} receiveShadow />
}

// ---------------------------------------------------------------- scan cone, standoff ring

const BEAM_MAX_M = 3
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _m = new THREE.Matrix4()

function Beam({ unit, y }: { unit: UnitId; y: number }) {
  const ref = useRef<THREE.Mesh>(null)
  // apex at the lens, opening down −Z: Matrix4.lookAt points −Z at the target
  const geo = useMemo(() => new THREE.ConeGeometry(0.7, 1, 28, 1, true).translate(0, -0.5, 0).rotateX(Math.PI / 2), [])
  useEffect(() => () => geo.dispose(), [geo])
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    const p = unitPose[unit]
    m.visible = p.scanning
    if (!p.scanning) return
    _a.set(p.x, p.y + y, p.z)
    _b.set(p.look.x, p.look.y, p.look.z)
    // a short sensor cone off the lens, not a searchlight across the deck
    const d = Math.min(_a.distanceTo(_b), BEAM_MAX_M)
    m.position.copy(_a)
    m.quaternion.setFromRotationMatrix(_m.lookAt(_a, _b, _up))
    m.scale.set(d * 0.14, d * 0.14, d)
    ;(m.material as THREE.MeshBasicMaterial).opacity = 0.09 + 0.05 * Math.sin(clock.elapsedTime * 4.5)
  })
  return (
    <mesh ref={ref} geometry={geo} raycast={noRaycast} visible={false} name="overlay-scan-beam">
      <meshBasicMaterial color="#9fe0ff" transparent opacity={0.14} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/** the standoff on the deck under the unit: faint on a mission, solid red while it holds for someone */
function StandoffRing({ unit }: { unit: UnitId }) {
  const ref = useRef<THREE.Mesh>(null)
  const r = UNIT_SPEC[unit].stopM
  const geo = useMemo(() => new THREE.RingGeometry(r - 0.07, r, 72).rotateX(-Math.PI / 2), [r])
  useEffect(() => () => geo.dispose(), [geo])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const p = unitPose[unit]
    const on = !!useInspection.getState().units[unit].mission
    m.visible = on && (unit === 'robot' || p.holding)
    if (!m.visible) return
    m.position.set(p.x, unit === 'robot' ? p.y + 0.03 : p.y - 3.4, p.z)
    const mat = m.material as THREE.MeshBasicMaterial
    mat.color.set(p.holding ? '#ff5147' : '#ffd479')
    mat.opacity = p.holding ? 0.9 : 0.32
  })
  return (
    <mesh ref={ref} geometry={geo} raycast={noRaycast} visible={false} name="overlay-standoff">
      <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ---------------------------------------------------------------- the units

function Drone() {
  const root = useRef<THREE.Group>(null)
  const props = useRef<THREE.InstancedMesh>(null)
  const led = useRef<THREE.MeshStandardMaterial>(null)
  const geo = useMemo(() => ({ body: droneBody(), glass: droneGlass(), disc: new THREE.CircleGeometry(0.22, 28).rotateX(-Math.PI / 2) }), [])
  const mats = useMemo(() => ({ body: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.42 }), glass: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.08 }) }), [])
  useEffect(() => {
    unitBodies.drone = root.current ?? undefined
    return () => {
      delete unitBodies.drone
      for (const g of Object.values(geo)) g.dispose()
      mats.body.dispose()
      mats.glass.dispose()
    }
  }, [geo, mats])
  const spin = useRef(0)
  const tilt = useRef({ x: 0, z: 0 })
  useFrame((_, rawDt) => {
    const g = root.current
    if (!g) return
    const dt = Math.min(rawDt, 0.1)
    const p = unitPose.drone
    const u = useInspection.getState().units.drone
    const flying = !!u.mission
    g.position.set(p.x, p.y, p.z)
    g.rotation.y = p.yaw
    // leans into the move, level on station
    const lean = flying ? Math.min(0.2, (p.moved / Math.max(dt, 1e-3)) * 0.02) : 0
    tilt.current.x += (-lean - tilt.current.x) * Math.min(1, dt * 4)
    g.rotation.x = tilt.current.x
    // bobbing in the hover
    if (flying) g.position.y += Math.sin(performance.now() / 700) * 0.03
    const m = props.current
    if (m) {
      spin.current += dt * (flying ? 90 : 0)
      for (let i = 0; i < R_XZ.length; i++) {
        _m.makeRotationY(spin.current + i).setPosition(R_XZ[i][0], 0.1, R_XZ[i][1])
        m.setMatrixAt(i, _m)
      }
      m.visible = flying
      m.instanceMatrix.needsUpdate = true
    }
    if (led.current) {
      const c = p.holding ? '#ff3b30' : u.battery < 30 ? '#ffb020' : '#46d27c'
      led.current.color.set(c)
      led.current.emissive.set(c)
      led.current.emissiveIntensity = 1.4 + Math.sin(performance.now() / 180) * 0.8
    }
  })
  return (
    <group ref={root} name="drone" scale={1.2} userData={{ auditOwner: 'drone' }}>
      <mesh geometry={geo.body} material={mats.body} raycast={noRaycast} />
      <mesh geometry={geo.glass} material={mats.glass} raycast={noRaycast} />
      <instancedMesh ref={props} args={[geo.disc, undefined, 4]} raycast={noRaycast} frustumCulled={false}>
        <meshBasicMaterial color="#20252a" transparent opacity={0.28} depthWrite={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <mesh position={[0, -0.075, 0.16]} raycast={noRaycast}>
        <sphereGeometry args={[0.022, 10, 8]} />
        <meshStandardMaterial ref={led} color="#46d27c" emissive="#46d27c" emissiveIntensity={1.4} />
      </mesh>
    </group>
  )
}

function Robot() {
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Mesh>(null)
  const beacon = useRef<THREE.MeshStandardMaterial>(null)
  const treads = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => ({ body: robotBody(), head: robotHead(), tread: new THREE.BoxGeometry(0.128, 0.012, 0.03) }), [])
  const mats = useMemo(() => ({ body: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.5 }), tread: new THREE.MeshStandardMaterial({ color: '#17191c', metalness: 0.15, roughness: 0.85 }) }), [])
  useEffect(() => {
    unitBodies.robot = root.current ?? undefined
    return () => {
      delete unitBodies.robot
      for (const g of Object.values(geo)) g.dispose()
      mats.body.dispose()
      mats.tread.dispose()
    }
  }, [geo, mats])
  const yaw = useRef(unitPose.robot.yaw)
  const roll = useRef(0)
  const drawn = useRef(-1)
  useFrame((_, rawDt) => {
    const g = root.current
    if (!g) return
    const dt = Math.min(rawDt, 0.1)
    const p = unitPose.robot
    g.position.set(p.x, p.y, p.z)
    const dy = Math.atan2(Math.sin(p.yaw - yaw.current), Math.cos(p.yaw - yaw.current))
    yaw.current += dy * Math.min(1, dt * 7)
    g.rotation.y = yaw.current
    if (head.current) {
      _a.set(p.look.x - p.x, 0, p.look.z - p.z)
      const want = Math.atan2(-_a.x, -_a.z) - yaw.current
      head.current.rotation.y = want
    }
    roll.current += p.moved
    const m = treads.current
    if (m && (drawn.current !== roll.current || drawn.current < 0)) {
      drawn.current = roll.current
      const perim = 2 * TRACK_L + 2 * Math.PI * TRACK_R
      for (let i = 0; i < TREADS * 2; i++) {
        const side = i < TREADS ? 1 : -1
        treadAt(roll.current + ((i % TREADS) / TREADS) * perim, _m, side * TRACK_X)
        m.setMatrixAt(i, _m)
      }
      m.instanceMatrix.needsUpdate = true
    }
    if (beacon.current) {
      const c = p.holding ? '#ff3b30' : '#f7b733'
      beacon.current.color.set(c)
      beacon.current.emissive.set(c)
      beacon.current.emissiveIntensity = p.moved > 0 || p.holding ? 1.2 + Math.sin(performance.now() / 150) * 1 : 0.3
    }
  })
  return (
    <group ref={root} name="robot-unit" userData={{ auditOwner: 'robot-unit' }}>
      <mesh geometry={geo.body} material={mats.body} raycast={noRaycast} />
      <mesh ref={head} geometry={geo.head} material={mats.body} position={[0, 1.28, -0.05]} raycast={noRaycast} />
      <instancedMesh ref={treads} args={[geo.tread, mats.tread, TREADS * 2]} raycast={noRaycast} frustumCulled={false} />
      <mesh position={[0.17, 0.56, 0.3]} raycast={noRaycast}>
        <cylinderGeometry args={[0.028, 0.034, 0.05, 14]} />
        <meshStandardMaterial ref={beacon} color="#f7b733" emissive="#f7b733" emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

export function InspectionUnits() {
  useFrame((_, rawDt) => stepUnits(Math.min(rawDt, 0.1)))
  return (
    <>
      <Bay />
      <Robot />
      <Drone />
      <Beam unit="robot" y={1.28} />
      <Beam unit="drone" y={-0.34} />
      <StandoffRing unit="robot" />
      <StandoffRing unit="drone" />
    </>
  )
}
