/**
 * Avatar sandbox: /?sandbox=avatar[&mode=cycle|walk|run|idle|turn|back|fallback][&cam=orbit|side|front|back|close]
 *
 * Drives the shared `walkPose` with a scripted path (walk a circle, stop, turn on the spot, run,
 * stop, walk backwards, walk with the `speed` field removed to exercise the fallback estimate).
 * `cam` presets follow the figure. Exposes window.__avatar = { phase, triangles }.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SandboxCanvas } from './SandboxCanvas'
import { Avatar } from '../scene/Avatar'
import { walkPose } from '../scene/Walk'

const params = new URLSearchParams(location.search)
const MODE = params.get('mode') ?? 'cycle'
const CAM = params.get('cam') ?? 'orbit'

type Phase = 'walk' | 'idle' | 'turn' | 'run' | 'stop' | 'back' | 'fallback'
const SCRIPT: [Phase, number][] = [
  ['walk', 8],
  ['idle', 3],
  ['turn', 2.5],
  ['run', 5],
  ['stop', 2],
  ['back', 5],
  ['fallback', 5],
]
const R_WALK = 3
const R_RUN = 3.6
const WALK = 2.2
const RUN = 6.5
const BACK = -2.2

const info = { phase: 'walk' as Phase, triangles: 0 }
;(window as unknown as Record<string, unknown>).__avatar = info

function phaseAt(t: number): Phase {
  if (MODE !== 'cycle') return MODE as Phase
  const total = SCRIPT.reduce((s, [, d]) => s + d, 0)
  let u = t % total
  for (const [p, d] of SCRIPT) {
    if (u < d) return p
    u -= d
  }
  return 'walk'
}

/** writes the fake pose every frame (runs before the Avatar's frame callback) */
function Driver() {
  const ref = useRef({ t: 0, a: 0 })
  useFrame((_, rawDt) => {
    const s = ref.current
    const dt = Math.min(rawDt, 0.1)
    s.t += dt
    const phase = phaseAt(s.t)
    info.phase = phase
    const pose = walkPose
    pose.footY = 0
    let speed = 0
    // on a circle of radius r around the origin, heading along the tangent (counter-clockwise from above)
    const circle = (r: number, v: number, backwards = false) => {
      s.a += (Math.abs(v) / r) * dt
      walkPose.x = r * Math.cos(s.a)
      walkPose.z = -r * Math.sin(s.a)
      // tangent (−sin a, −cos a) → yaw = a; walking backwards faces the other way
      walkPose.yaw = s.a + (backwards ? Math.PI : 0)
      speed = v
    }
    switch (phase) {
      case 'walk':
      case 'fallback':
        circle(R_WALK, WALK)
        break
      case 'run':
        circle(R_RUN, RUN)
        break
      case 'back':
        circle(R_WALK, BACK, true)
        break
      case 'turn':
        walkPose.yaw += 1.6 * dt
        break
      default:
        break
    }
    if (phase === 'fallback') Reflect.deleteProperty(pose, 'speed')
    else pose.speed = speed
  }, -1)
  return null
}

/** camera presets that follow the walker */
function FollowCam() {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, scene }) => {
    const root = scene.getObjectByName('avatar')
    if (root) info.triangles = root.userData.triangles
    if (CAM === 'orbit') return
    const { x, z, yaw } = walkPose
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    // right = forward × up
    const rx = -fz
    const rz = fx
    let target: [number, number, number] = [x, 1.0, z]
    if (CAM === 'side') v.set(x + rx * 4.2, 1.2, z + rz * 4.2)
    else if (CAM === 'front') v.set(x + fx * 4.2 + rx * 0.8, 1.4, z + fz * 4.2 + rz * 0.8)
    else if (CAM === 'back') v.set(x - fx * 4 + rx * 1.2, 2.0, z - fz * 4 + rz * 1.2)
    else if (CAM === 'close') {
      v.set(x + fx * 1.25 + rx * 0.55, 1.62, z + fz * 1.25 + rz * 0.55)
      target = [x, 1.45, z]
    }
    camera.position.copy(v)
    camera.lookAt(target[0], target[1], target[2])
    if (controls) {
      controls.target.set(target[0], target[1], target[2])
    }
  })
  return null
}

export default function AvatarSandbox() {
  return (
    <SandboxCanvas camera={[7, 3.5, 7]} target={[0, 0.9, 0]}>
      <Driver />
      <Avatar />
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.35} />
      </mesh>
      <FollowCam />
    </SandboxCanvas>
  )
}
