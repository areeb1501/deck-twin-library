/**
 * The field workers' figures, drawn instanced: the walk-mode avatar's body (people/body.ts) at the LO detail level,
 * one InstancedMesh per body segment for ALL workers (11 draw calls), posed every frame from the shared gait
 * (people/gait.ts) by composing joint matrices — no scene-graph objects per worker.
 *
 * Per-worker look without extra draw calls: every vertex carries a `tint` channel (0 fixed colour, 1 the
 * instance colour, 2 the instance accent); the material swaps three's `color_vertex` chunk so instanceColor /
 * instanceAccent only recolour the tinted parts: coverall + sleeve / leg panels on the body, skin + hair on the
 * head, the shell on the hard hat — tape, boots, gloves, belt stay as built.
 *
 * PPE is shown per frame from the live flags: no hard hat → the hat instance collapses and the hair (always on
 * the head) shows; no vest → the hi-vis vest collapses; no gas monitor → the bright monitor at the collar goes.
 */
import * as THREE from 'three'
import { FOREARM, HIP_X, LO, NECK, PALETTE, SHIN, SHOULDER, THIGH, TOE_JOINT, UPPER_ARM, VEST_OUT, WAIST, WORKER_TINT, boot, forearm, gasMonitor, glasses, hand, hardHat, neckHead, pelvis, shin, thigh, torso, upperArm, vest } from './body'
import { mergePieces, type Piece } from './geom'
import type { Pose } from './gait'

export interface Look {
  coverall: string
  /** sleeve / lower-leg panels (= coverall for plain coveralls, hi-vis yellow on navy) */
  accent: string
  skin: string
  hair: string
  hat: string
  /** height factor */
  scale: number
}
export interface Ppe {
  hardHat: boolean
  vest: boolean
  gasMonitor: boolean
}

/** offshore coverall palette: orange FR, red FR, navy FR with hi-vis panels */
export const COVERALLS: Pick<Look, 'coverall' | 'accent'>[] = [
  { coverall: '#dc5b17', accent: '#dc5b17' },
  { coverall: '#ad221b', accent: '#ad221b' },
  { coverall: '#1e2b49', accent: '#d8e01f' },
]
export const SKINS = ['#efc4a0', '#d9a984', '#c38a67', '#a26946', '#7b4a31', '#583524']
export const HAIRS = ['#15100c', '#2a1f17', '#3f2d1e', '#6b4f33', '#7e776f']
export const HATS = ['#f2f2ee', '#f2f2ee', '#f2f2ee', '#ec7418']

/** a stable look per worker id: coverall, skin, hair, hat colour, height 0.965–1.05 */
export function lookFor(id: string): Look {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  const r = (k: number) => {
    let x = Math.imul(h ^ (k * 0x9e3779b9), 0x85ebca6b)
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296
  }
  const c = COVERALLS[Math.floor(r(1) * COVERALLS.length)]
  return { ...c, skin: SKINS[Math.floor(r(2) * SKINS.length)], hair: HAIRS[Math.floor(r(3) * HAIRS.length)], hat: HATS[Math.floor(r(4) * HATS.length)], scale: 0.965 + 0.085 * r(5) }
}

const PARTS = { pelvis: 1, torso: 1, head: 1, upperArm: 2, forearm: 2, thigh: 2, shin: 2, boot: 2, hat: 1, vest: 1, gas: 1 } as const
type Part = keyof typeof PARTS
const PART_NAMES = Object.keys(PARTS) as Part[]

const shift = (pieces: Piece[], x: number, y: number, z: number): Piece[] => pieces.map(([g, s, o]) => [g.translate(x, y, z), s, o])

function crowdGeometries(): Record<Part, THREE.BufferGeometry> {
  const d = LO
  const m = (pieces: Piece[]) => mergePieces(pieces, { palette: PALETTE, tint: WORKER_TINT })
  const [rear, toe] = boot(d)
  return {
    pelvis: m(pelvis(d, { radioOnBelt: true })),
    torso: m(torso(d)),
    head: m([...neckHead(d, { hairTop: 0.012 }), ...glasses(d)]),
    upperArm: m(upperArm(d)),
    forearm: m([...forearm(d), ...shift(hand(d), 0, -FOREARM, 0)]),
    thigh: m(thigh(d)),
    shin: m(shin(d)),
    boot: m([...rear, ...shift(toe, TOE_JOINT[0], TOE_JOINT[1], TOE_JOINT[2])]),
    hat: m(hardHat(d)),
    vest: m(vest(d)),
    gas: m(gasMonitor(d, VEST_OUT + 0.004, true)),
  }
}

const TINT_VERTEX = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= tint < 0.5 ? vec3( 1.0 ) : ( tint < 1.5 ? instanceColor.rgb : instanceAccent );
#endif
`
function crowdMaterial(roughness: number) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float tint;\nattribute vec3 instanceAccent;\n' + sh.vertexShader.replace('#include <color_vertex>', TINT_VERTEX)
  }
  m.customProgramCacheKey = () => 'people-crowd-tint'
  return m
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)
const noRaycast = () => {}
const _root = new THREE.Matrix4()
const _hips = new THREE.Matrix4()
const _spine = new THREE.Matrix4()
const _neck = new THREE.Matrix4()
const _a = new THREE.Matrix4()
const _b = new THREE.Matrix4()
const _c = new THREE.Matrix4()
const _l = new THREE.Matrix4()
const _e = new THREE.Euler()
const _s = new THREE.Vector3()
const _col = new THREE.Color()
/** out = parent · T(p) · R(euler XYZ) */
function joint(out: THREE.Matrix4, parent: THREE.Matrix4, px: number, py: number, pz: number, rx: number, ry: number, rz: number) {
  _l.makeRotationFromEuler(_e.set(rx, ry, rz)).setPosition(px, py, pz)
  return out.multiplyMatrices(parent, _l)
}

export class Crowd {
  readonly group = new THREE.Group()
  readonly meshes = {} as Record<Part, THREE.InstancedMesh>
  /** triangles of one figure (all parts, PPE included) */
  readonly trianglesPerFigure: number
  private looks: Look[]
  private readonly geos: Record<Part, THREE.BufferGeometry>
  private readonly mats: THREE.Material[]

  readonly capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
    this.group.name = 'field-workers'
    this.geos = crowdGeometries()
    const cloth = crowdMaterial(0.8)
    const gloss = crowdMaterial(0.36)
    this.mats = [cloth, gloss]
    this.looks = Array.from({ length: capacity }, (_, i) => lookFor(`w${i}`))
    let tris = 0
    const parts: Record<string, number> = {}
    for (const k of PART_NAMES) {
      const per = PARTS[k]
      const geo = this.geos[k]
      parts[k] = (geo.getAttribute('position').count / 3) * per
      tris += parts[k]
      const n = capacity * per
      geo.setAttribute('instanceAccent', new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3))
      const mesh = new THREE.InstancedMesh(geo, k === 'hat' || k === 'gas' ? gloss : cloth, n)
      mesh.name = `worker-${k}`
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.raycast = noRaycast
      for (let i = 0; i < n; i++) {
        mesh.setMatrixAt(i, HIDDEN)
        mesh.setColorAt(i, _col.set('#ffffff'))
      }
      this.meshes[k] = mesh
      this.group.add(mesh)
    }
    this.trianglesPerFigure = Math.round(tris)
    this.group.userData.trianglesPerFigure = this.trianglesPerFigure
    this.group.userData.trianglesByPart = parts
    for (let i = 0; i < capacity; i++) this.setLook(i, this.looks[i])
  }

  /** colours for figure i (call when the roster is (re)assigned, not per frame) */
  setLook(i: number, look: Look) {
    this.looks[i] = look
    const paint = (k: Part, color: string, accent: string) => {
      const mesh = this.meshes[k]
      const acc = mesh.geometry.getAttribute('instanceAccent') as THREE.InstancedBufferAttribute
      _col.set(accent)
      for (let j = 0; j < PARTS[k]; j++) {
        const idx = i * PARTS[k] + j
        mesh.setColorAt(idx, _col.set(color))
        _col.set(accent)
        acc.setXYZ(idx, _col.r, _col.g, _col.b)
      }
      acc.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    for (const k of ['pelvis', 'torso', 'upperArm', 'forearm', 'thigh', 'shin'] as const) paint(k, look.coverall, look.accent)
    paint('head', look.skin, look.hair)
    paint('hat', look.hat, '#ffffff')
  }

  /** pose figure i at plan (x, z), feet at world y, heading yaw */
  setFigure(i: number, x: number, footY: number, z: number, yaw: number, P: Pose, ppe: Ppe) {
    const M = this.meshes
    const sc = this.looks[i].scale
    _root.makeRotationY(yaw).scale(_s.set(sc, sc, sc)).setPosition(x, footY, z)
    joint(_hips, _root, P.hipsX, P.hipsY, 0, P.hips[0], P.hips[1], P.hips[2])
    joint(_spine, _hips, 0, WAIST, 0, P.spine[0], P.spine[1], P.spine[2])
    joint(_neck, _spine, 0, NECK, 0, P.neck[0], P.neck[1], P.neck[2])
    M.pelvis.setMatrixAt(i, _hips)
    M.torso.setMatrixAt(i, _spine)
    M.vest.setMatrixAt(i, ppe.vest ? _spine : HIDDEN)
    M.gas.setMatrixAt(i, ppe.gasMonitor ? _spine : HIDDEN)
    M.head.setMatrixAt(i, _neck)
    M.hat.setMatrixAt(i, ppe.hardHat ? _neck : HIDDEN)
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? -1 : 1
      const j = i * 2 + k
      const sh = P.shoulder[k]
      joint(_a, _spine, s * SHOULDER[0], SHOULDER[1] + P.shoulderLift[k], 0, sh[0], sh[1], sh[2])
      M.upperArm.setMatrixAt(j, _a)
      joint(_b, _a, 0, -UPPER_ARM, 0, P.elbow[k], 0, 0)
      M.forearm.setMatrixAt(j, _b)
      const hp = P.hip[k]
      joint(_a, _hips, s * HIP_X, 0, 0, hp[0], hp[1], hp[2])
      M.thigh.setMatrixAt(j, _a)
      joint(_b, _a, 0, -THIGH, 0, P.knee[k], 0, 0)
      M.shin.setMatrixAt(j, _b)
      joint(_c, _b, 0, -SHIN, 0, P.ankle[k], 0, 0)
      M.boot.setMatrixAt(j, _c)
    }
  }

  /** collapse figures i ≥ from */
  hideFrom(from: number) {
    for (const k of PART_NAMES) for (let j = from * PARTS[k]; j < this.capacity * PARTS[k]; j++) this.meshes[k].setMatrixAt(j, HIDDEN)
  }

  commit() {
    for (const k of PART_NAMES) this.meshes[k].instanceMatrix.needsUpdate = true
  }

  dispose() {
    for (const k of PART_NAMES) {
      this.geos[k].dispose()
      this.meshes[k].dispose()
    }
    for (const m of this.mats) m.dispose()
  }
}
