/**
 * The drilling rig at work (WORLD coordinates, like the rest of the environment). While drilling is on
 * (`knobs.drilling`) and DR-100 runs:
 *
 *   - the top drive turns the quill and the stand of drill pipe (≈ 117 rpm) and comes down the guide
 *     rails as the bit drills: one ~28 m stand in 3 minutes; then the connection — slips set, the top
 *     drive breaks out and hoists back up empty (the stick-up stays in the rotary), a new stand is
 *     latched and made up at the top — and the next stand is drilled down;
 *   - the travelling block, hook, bails and elevator ride with it, the 8 drill-line falls lengthen /
 *     shorten between the crown and the block, the rotary hose hangs in a deeper loop as it comes down;
 *   - two of the three triplex mud pumps run (crank-end covers turning, pony rods reciprocating 120°
 *     apart); they stop for the connection.
 *
 * Stopping drilling (or a blackout) brings everything to rest where it is; it carries on from there.
 * Geometry comes from drillingRig.ts (built against the same RIG constants as the static rig).
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { isRunning, useSim } from '../../state/sim'
import { Batches, unitCyl } from '../structure/batch'
import {
  buildFalls,
  buildQuill,
  buildTravellingAssembly,
  CROWN_Y,
  FALLS_BOTTOM,
  MUD_PUMPS,
  RIG,
  rotaryHosePoints,
  SAVER_SUB,
  STAND_JOINTS,
} from './drillingRig'

type RigMat = 'steelDark' | 'yellow' | 'white' | 'blue' | 'equip'
export type RigMotionMats = Record<RigMat, THREE.Material>

const F = RIG.floor
const { top: TOP, bottom: BOT } = RIG.stroke
/** drilling-cycle timing (s): drill one stand, set slips + break out, hoist, latch + make up the next */
const T_DRILL = 180
const T_SLIPS = 8
const T_HOIST = 22
const T_LATCH = 10
const T_CYCLE = T_DRILL + T_SLIPS + T_HOIST + T_LATCH
const RPM = 117 // string / quill (visual; non-round so it doesn't alias in screenshots)
const SPM = 96 // mud pump strokes per minute
const PIPE_R = 0.064
const JOINT_R = 0.085
const JOINT_L = 0.45
/** the string is hidden below this (it's inside the rotary / bell nipple) */
const Y_HIDE = F + 0.45

const _m = new THREE.Matrix4()
const _v = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q0 = new THREE.Quaternion()
const _z = new THREE.Vector3(0, 0, 1)
const _one = new THREE.Vector3(1, 1, 1)

/** drilling-cycle state (starts mid-stand so the first look shows the bit drilling) */
const RIG_STATE = { level: 1, t: 60, turn: 0, phase: 0, pump: 0, crank: 0, hoseY: NaN }

const smooth = (u: number) => u * u * (3 - 2 * u)

/** where in the cycle: top-drive height (above the floor), whether the string turns / the stand hangs from the top drive */
function cycleAt(t: number) {
  let u = ((t % T_CYCLE) + T_CYCLE) % T_CYCLE
  if (u < T_DRILL) return { h: TOP - (TOP - BOT) * (u / T_DRILL), turn: true, stand: true, pumps: true }
  u -= T_DRILL
  if (u < T_SLIPS) return { h: BOT, turn: false, stand: true, pumps: false }
  u -= T_SLIPS
  if (u < T_HOIST) return { h: BOT + (TOP - BOT) * smooth(u / T_HOIST), turn: false, stand: false, pumps: false }
  return { h: TOP, turn: false, stand: true, pumps: false }
}

function batchMeshes(build: (get: (k: RigMat) => ReturnType<Batches<RigMat>['get']>) => void) {
  const B = new Batches<RigMat>()
  build((k) => B.get(k))
  return B.buildAll().map(({ key, geometry }) => ({ key: key as RigMat, geometry }))
}

export function RigMotion({ mats }: { mats: RigMotionMats }) {
  const geo = useMemo(() => {
    const travel = batchMeshes((get) => buildTravellingAssembly({ yellow: get('yellow'), steelDark: get('steelDark'), white: get('white'), blue: get('blue') }))
    const quill = batchMeshes((get) => buildQuill({ steelDark: get('steelDark'), yellow: get('yellow') }))
    const falls = batchMeshes((get) => buildFalls(get('steelDark')))[0].geometry
    // unit pipe hanging down from y = 0 to y = −1 (scaled to the visible length)
    const pipe = unitCyl(10, false).clone().translate(0, -0.5, 0).scale(PIPE_R, 1, PIPE_R)
    // tool joint (box end) with a hard-band ring and a paint mark (so the turning shows)
    const joint = new THREE.CylinderGeometry(JOINT_R, JOINT_R, JOINT_L, 12).translate(0, -JOINT_L / 2, 0)
    const mark = new THREE.BoxGeometry(0.03, JOINT_L * 0.7, 0.04).translate(JOINT_R, -JOINT_L / 2, 0)
    // stick-up left in the rotary during the connection: pipe from the master bushing + its box end
    const stubTop = F + BOT - SAVER_SUB
    const stub = new THREE.CylinderGeometry(PIPE_R, PIPE_R, stubTop - JOINT_L - (F + 0.3), 10).translate(0, (stubTop - JOINT_L + F + 0.3) / 2, 0)
    const stubJoint = new THREE.CylinderGeometry(JOINT_R, JOINT_R, JOINT_L, 12).translate(0, stubTop - JOINT_L / 2, 0)
    // mud pumps: pony rod (+ its clamp) along x, crank-end cover disc (north face, axis z) + counterweight mark
    const rod = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 12).rotateZ(Math.PI / 2)
    const clamp = new THREE.CylinderGeometry(0.075, 0.075, 0.08, 12).rotateZ(Math.PI / 2)
    const hub = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24).rotateX(Math.PI / 2).translate(0, 0, -0.03)
    const hubMark = new THREE.BoxGeometry(0.12, 0.26, 0.04).translate(0, 0.15, -0.075)
    return { travel, quill, falls, pipe, joint, mark, stub, stubJoint, rod, clamp, hub, hubMark }
  }, [])
  useEffect(
    () => () => {
      for (const g of [...geo.travel, ...geo.quill]) g.geometry.dispose()
      for (const g of [geo.falls, geo.pipe, geo.joint, geo.mark, geo.stub, geo.stubJoint, geo.rod, geo.clamp, geo.hub, geo.hubMark]) g.dispose()
    },
    [geo],
  )

  const travel = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const pipe = useRef<THREE.Mesh>(null)
  const joints = useRef<(THREE.Group | null)[]>([])
  const stub = useRef<THREE.Group>(null)
  const falls = useRef<THREE.Mesh>(null)
  const hose = useRef<THREE.Mesh>(null)
  const rods = useRef<THREE.InstancedMesh>(null)
  const clamps = useRef<THREE.InstancedMesh>(null)
  const hubs = useRef<THREE.InstancedMesh>(null)
  const hubMarks = useRef<THREE.InstancedMesh>(null)

  // cycle state lives at module scope so the rig carries on where it was when the upper-deck layer
  // (or x-ray) unmounts / remounts this component
  const st = useRef(RIG_STATE)

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const s = st.current
    // run level (same feel as anim.useRunLevel): drilling knob AND the rig has power
    const target = useSim.getState().knobs.drilling && isRunning('DR-100') ? 1 : 0
    s.level += (target - s.level) * Math.min(1, dt * (target > s.level ? 1 : 0.5))
    if (Math.abs(target - s.level) < 1e-3) s.level = target
    s.t += dt * s.level
    const c = cycleAt(s.t)
    // string rotation: spins up / down quickly with the drilling phase (and the rig's run level)
    const turnTarget = c.turn ? s.level : 0
    s.turn += (turnTarget - s.turn) * Math.min(1, dt * 1.5)
    s.phase = (s.phase + s.turn * (RPM / 60) * Math.PI * 2 * dt) % (Math.PI * 2)
    const pumpTarget = c.pumps ? s.level : 0
    s.pump += (pumpTarget - s.pump) * Math.min(1, dt * 0.8)
    s.crank = (s.crank + s.pump * (SPM / 60) * Math.PI * 2 * dt) % (Math.PI * 2)

    const yTD = F + c.h
    travel.current?.position.set(RIG.x, yTD, RIG.z)
    if (spin.current) spin.current.rotation.y = s.phase
    // stand hanging from the saver sub, visible above the rotary
    const len = yTD - SAVER_SUB - Y_HIDE
    if (pipe.current) {
      pipe.current.visible = c.stand && len > 0.05
      pipe.current.scale.y = Math.max(0.01, len)
    }
    joints.current.forEach((j, i) => {
      if (!j) return
      const yTop = yTD - SAVER_SUB - STAND_JOINTS[i]
      j.visible = c.stand && yTop - JOINT_L > Y_HIDE
    })
    if (stub.current) stub.current.visible = !c.stand
    if (falls.current) falls.current.scale.y = CROWN_Y - (yTD + FALLS_BOTTOM)
    // rotary hose: regenerate when the top drive has moved
    if (hose.current && (!hose.current.geometry.getAttribute('position') || !(Math.abs(yTD - s.hoseY) < 0.03))) {
      s.hoseY = yTD
      const pts = rotaryHosePoints(yTD).map((p) => new THREE.Vector3(...p))
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.07, 8, false)
      hose.current.geometry.dispose()
      hose.current.geometry = g
    }
    // mud pumps
    const P = MUD_PUMPS
    let i = 0
    P.z.forEach((z, p) => {
      const a = P.running[p] ? s.crank : 0.7 * p
      P.rodDz.forEach((dz, r) => {
        const x = (P.xPower + P.xFluid) / 2 + P.throw * Math.cos(a + (r * Math.PI * 2) / 3)
        _m.compose(_v.set(x, P.yRod, z + dz), _q0, _one)
        rods.current?.setMatrixAt(i, _m)
        _m.compose(_v.set(x - 0.06, P.yRod, z + dz), _q0, _one)
        clamps.current?.setMatrixAt(i, _m)
        i++
      })
      _m.compose(_v.set(P.xCrank, P.yCrank, z - 0.7), _q.setFromAxisAngle(_z, a), _one)
      hubs.current?.setMatrixAt(p, _m)
      hubMarks.current?.setMatrixAt(p, _m)
    })
    for (const im of [rods.current, clamps.current, hubs.current, hubMarks.current]) if (im) im.instanceMatrix.needsUpdate = true
  })

  const nRods = MUD_PUMPS.z.length * MUD_PUMPS.rodDz.length
  const nPumps = MUD_PUMPS.z.length
  const noRay = () => null
  return (
    <group name="RigMotion">
      <group ref={travel} position={[RIG.x, F + TOP, RIG.z]}>
        {geo.travel.map((p) => (
          <mesh key={p.key} geometry={p.geometry} material={mats[p.key]} castShadow receiveShadow raycast={noRay} />
        ))}
        <group ref={spin}>
          {geo.quill.map((p) => (
            <mesh key={p.key} geometry={p.geometry} material={mats[p.key]} castShadow raycast={noRay} />
          ))}
          <mesh ref={pipe} geometry={geo.pipe} material={mats.steelDark} position={[0, -SAVER_SUB, 0]} castShadow raycast={noRay} />
          {STAND_JOINTS.map((d, i) => (
            <group key={d} ref={(g) => void (joints.current[i] = g)} position={[0, -SAVER_SUB - d, 0]} rotation-y={i * 2.1}>
              <mesh geometry={geo.joint} material={mats.steelDark} castShadow raycast={noRay} />
              <mesh geometry={geo.mark} material={mats.white} raycast={noRay} />
            </group>
          ))}
        </group>
      </group>
      <group ref={stub} position={[RIG.x, 0, RIG.z]} visible={false}>
        <mesh geometry={geo.stub} material={mats.steelDark} raycast={noRay} />
        <mesh geometry={geo.stubJoint} material={mats.steelDark} raycast={noRay} />
      </group>
      <mesh ref={falls} geometry={geo.falls} material={mats.steelDark} position={[RIG.x, CROWN_Y, RIG.z]} castShadow raycast={noRay} />
      <mesh ref={hose} material={mats.steelDark} castShadow raycast={noRay} />
      <instancedMesh ref={rods} args={[geo.rod, mats.steelDark, nRods]} castShadow raycast={noRay} />
      <instancedMesh ref={clamps} args={[geo.clamp, mats.yellow, nRods]} raycast={noRay} />
      <instancedMesh ref={hubs} args={[geo.hub, mats.equip, nPumps]} castShadow raycast={noRay} />
      <instancedMesh ref={hubMarks} args={[geo.hubMark, mats.yellow, nPumps]} raycast={noRay} />
    </group>
  )
}
