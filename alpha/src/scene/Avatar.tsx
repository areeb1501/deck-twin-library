/**
 * Walkthrough avatar — a procedural offshore operator (~1.76 m, 1.81 m to the top of the hard hat) that follows
 * the live `walkPose`.
 *
 * Figure (people/body.ts, HI detail): sculpted head (jaw, brow, cheekbones, nose, ears, eyes, lips, stubble) with a
 * short haircut under the hat; orange FR coverall with seams, chest / cargo / hip pockets, zip, collar and cuffs,
 * retroreflective tape round chest, waist, arms and legs plus braces over the shoulders, knee pads; white cap-style
 * hard hat (ribs, gutter rim, front peak, lamp + cable clips, chin strap, ear defenders parked on the shell);
 * wrap-around smoke safety glasses; radio with antenna on the chest, 4-gas monitor clipped at the collar; belt with
 * buckle, tool pouch and torch; gloves with fingers, thumb, hi-vis backs and knuckle guard; steel-toe boots with
 * soles, midsole stripe, tongue, laces and pull loop.
 *
 * Built from lathe / parametric / primitive pieces merged into ONE geometry per body segment (one draw group per
 * surface material), on a joint hierarchy:
 *
 *   root (x, footY, z, yaw) → hips (pelvis) → spine (torso) → neck (head, hat, glasses)
 *                                            → shoulder → elbow → wrist          (×2)
 *                           → hip → knee → ankle (boot) → toe (toe box)          (×2)
 *
 * Every joint group sits AT the joint, so segment rotations are plain hinge angles. The model faces −Z, so
 * `root.rotation.y = yaw` matches the walker (forward = (−sin yaw, 0, −cos yaw)).
 *
 * Materials (people/materials.ts): vertex-coloured, with small procedural tiling normal maps (twill weave, knit,
 * leather grain, skin pores, hair strands, micro-prism tape), clear-coated hat plastic, smoke lens, fluorescent
 * hi-vis and retroreflective tape that brightens toward the camera. Private — not registered with x-ray / section.
 *
 * Animation (people/gait.ts, shared with the field workers): stride phase from signed distance travelled, walk ↔ run
 * and gait ↔ idle blends, kinematic foot planting with a heel → ball → toe roll, counter-rotating pelvis and
 * shoulders, arm swing with elbow bend and wrist follow-through, a stabilised head, breathing and contrapposto at rest.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import * as THREE from 'three'
import { walkPose } from './Walk'
import { FOREARM, HI, HIP_H, HIP_X, NECK, PALETTE, SHIN, SHOULDER, THIGH, TOE_JOINT, UPPER_ARM, WAIST, boot, forearm, glasses, hand, hardHat, neckHead, pelvis, shin, thigh, torso, upperArm } from './people/body'
import { mergePieces, type Piece } from './people/geom'
import { avatarMaterials } from './people/materials'
import { createGait, stepGait } from './people/gait'

const DEFAULT_FOOT_Y = 28

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
  toe: [THREE.Group, THREE.Group]
  geometries: THREE.BufferGeometry[]
  materials: THREE.Material[]
  textures: THREE.Texture[]
  triangles: number
}

function buildRig(): Rig {
  const { materials, textures } = avatarMaterials()
  const geometries: THREE.BufferGeometry[] = []
  const noRay = () => {}
  const seg = (parent: THREE.Object3D, pieces: Piece[], mirror = false) => {
    const g = mergePieces(pieces, { palette: PALETTE, mirror, groups: true, uv: true })
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
  seg(hips, pelvis(HI))
  const spine = joint(hips, 0, WAIST)
  seg(spine, torso(HI, { chestKit: true }))
  const neck = joint(spine, 0, NECK)
  seg(neck, [...neckHead(HI), ...glasses(HI), ...hardHat(HI)])

  const side = (s: -1 | 1) => {
    const mirror = s < 0
    const shoulder = joint(spine, s * SHOULDER[0], SHOULDER[1])
    seg(shoulder, upperArm(HI), mirror)
    const elbow = joint(shoulder, 0, -UPPER_ARM)
    seg(elbow, forearm(HI), mirror)
    const wrist = joint(elbow, 0, -FOREARM)
    seg(wrist, hand(HI), mirror)
    const hip = joint(hips, s * HIP_X, 0)
    seg(hip, thigh(HI), mirror)
    const knee = joint(hip, 0, -THIGH)
    seg(knee, shin(HI), mirror)
    const ankle = joint(knee, 0, -SHIN)
    const [rear, toeBox] = boot(HI)
    seg(ankle, rear, mirror)
    const toe = joint(ankle, TOE_JOINT[0], TOE_JOINT[1], TOE_JOINT[2])
    seg(toe, toeBox, mirror)
    return { shoulder, elbow, wrist, hip, knee, ankle, toe }
  }
  const L = side(-1)
  const R = side(1)
  const triangles = geometries.reduce((n, g) => n + g.getAttribute('position').count / 3, 0)
  root.userData.triangles = triangles
  root.userData.drawGroups = geometries.reduce((n, g) => n + g.groups.length, 0)
  return {
    root, hips, spine, neck,
    shoulder: [L.shoulder, R.shoulder], elbow: [L.elbow, R.elbow], wrist: [L.wrist, R.wrist],
    hip: [L.hip, R.hip], knee: [L.knee, R.knee], ankle: [L.ankle, R.ankle], toe: [L.toe, R.toe],
    geometries, materials, textures, triangles,
  }
}

export function Avatar(): JSX.Element | null {
  const rig = useMemo(() => buildRig(), [])
  useEffect(
    () => () => {
      rig.geometries.forEach((g) => g.dispose())
      rig.materials.forEach((m) => m.dispose())
      rig.textures.forEach((t) => t.dispose())
    },
    [rig],
  )
  // per-instance animation state (mutated every frame through the ref)
  const state = useRef({ rig, gait: createGait(0) })

  useFrame((_, rawDt) => {
    const { rig, gait } = state.current
    const p = walkPose
    const dt = Math.min(Math.max(rawDt, 1e-4), 0.1)
    // Walk.tsx publishes a smoothed forward-projected speed (absent in the sandbox's fallback mode)
    stepGait(gait, p.x, p.z, p.yaw, p.speed, dt, true)
    const P = gait.pose
    rig.hips.position.set(P.hipsX, P.hipsY, 0)
    rig.hips.rotation.set(P.hips[0], P.hips[1], P.hips[2])
    rig.spine.rotation.set(P.spine[0], P.spine[1], P.spine[2])
    rig.spine.scale.set(1 + 0.008 * P.breathe * P.idle, 1, 1 + 0.014 * P.breathe * P.idle)
    rig.neck.rotation.set(P.neck[0], P.neck[1], P.neck[2])
    for (let i = 0; i < 2; i++) {
      rig.shoulder[i].position.y = SHOULDER[1] + P.shoulderLift[i]
      rig.shoulder[i].rotation.set(P.shoulder[i][0], P.shoulder[i][1], P.shoulder[i][2])
      rig.elbow[i].rotation.set(P.elbow[i], 0, 0)
      rig.wrist[i].rotation.set(P.wrist[i][0], P.wrist[i][1], P.wrist[i][2])
      rig.hip[i].rotation.set(P.hip[i][0], P.hip[i][1], P.hip[i][2])
      rig.knee[i].rotation.set(P.knee[i], 0, 0)
      rig.ankle[i].rotation.set(P.ankle[i], 0, 0)
      rig.toe[i].rotation.set(P.toe[i], 0, 0)
    }
    rig.root.position.set(p.x, Number.isFinite(p.footY) ? p.footY : DEFAULT_FOOT_Y, p.z)
    rig.root.rotation.y = p.yaw
  })

  return <primitive object={rig.root} />
}
