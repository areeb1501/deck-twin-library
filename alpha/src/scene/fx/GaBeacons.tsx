/**
 * General-alarm (GA / PAGA) beacons on Alpha, WHP-N and the LQ, flashing with each platform's
 * `result.platforms[pid].ga`:
 *
 *   gas     amber, slow flash (1 Hz)
 *   fire    red, fast flash (2 Hz)
 *   muster  red / white alternating (neighbouring beacons in opposite phase)
 *   abandon double strobe, red then white, 1 cycle a second
 *
 * Beacons sit on the jacket legs (production / cellar / weather deck), at the stair towers, the bridge
 * ends and the LQ quarters. Three instanced meshes (housing, lens, billboard halo) = 3 draw calls; the
 * colours are only re-uploaded while some platform is in alarm. WORLD coordinates (mounted in
 * Surroundings); positions are built from model/site.ts (deck-local + [0, 28, 0]).
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PlatformId, PlatformResult } from '../../sim/types'
import { ALPHA_DECK, BRIDGE_N, BRIDGE_S, CELLAR_FLOOR, LQ, RP, WEATHER_FLOOR, WHP, WI } from '../../model/site'
import { DECK } from '../structure/deckConst'
import { STAIR_TOWERS } from '../structure/stairs'
import { platformGa } from './simRead'

const WY = 28 // deck-local → world
type Ga = PlatformResult['ga']

interface Beacon {
  pos: THREE.Vector3
  platform: PlatformId
  /** on the weather deck (hidden with the upper deck) */
  upper?: boolean
}

/** beacon on a leg face 3 m above the floor, on the side facing the deck centre (or away from it) */
function onLeg(leg: [number, number], centre: [number, number], floor: number, platform: PlatformId, r = 0.9, upper = false, outboard = false): Beacon {
  const sgn = outboard ? -1 : 1
  const dx = (centre[0] - leg[0]) * sgn
  const dz = (centre[1] - leg[1]) * sgn
  const l = Math.hypot(dx, dz) || 1
  return { pos: new THREE.Vector3(leg[0] + (dx / l) * (r + 0.15), floor + 3.0 + WY, leg[1] + (dz / l) * (r + 0.15)), platform, upper }
}

function gaBeaconLayout(): Beacon[] {
  const out: Beacon[] = []
  const P = (x: number, y: number, z: number, platform: PlatformId, upper = false) => out.push({ pos: new THREE.Vector3(x, y + WY, z), platform, upper })
  const ac: [number, number] = [(ALPHA_DECK.x0 + ALPHA_DECK.x1) / 2, (ALPHA_DECK.z0 + ALPHA_DECK.z1) / 2]
  // Alpha: every main leg at the cellar, production and weather decks
  for (const leg of DECK.legs) {
    out.push(onLeg(leg, ac, CELLAR_FLOOR, 'Alpha', DECK.legOD / 2))
    out.push(onLeg(leg, ac, 0, 'Alpha', DECK.legOD / 2))
    out.push(onLeg(leg, ac, 0, 'Alpha', DECK.legOD / 2, false, true))
    out.push(onLeg(leg, ac, WEATHER_FLOOR, 'Alpha', DECK.legOD / 2, true))
  }
  // Alpha stair towers: beside the deck-edge opening at each level
  for (const t of STAIR_TOWERS)
    for (const y of t.levels) P(t.edgeX - t.outward * 0.35, y + 2.7, t.zA - t.uDir * 0.6, 'Alpha', y >= WEATHER_FLOOR)
  // bridge ends (each end belongs to the platform it stands on)
  P(BRIDGE_S.walk.x0 - 0.3, 2.6, ALPHA_DECK.z1 + 0.4, 'Alpha')
  P(BRIDGE_S.walk.x0 - 0.3, 2.6, LQ.deck.z0 - 0.4, 'LQ')
  P(BRIDGE_N.walk.x1 + 0.3, 2.6, ALPHA_DECK.z0 - 0.4, 'Alpha')
  P(BRIDGE_N.walk.x1 + 0.3, 2.6, WHP.deck.z1 + 0.4, 'WHP-N')
  // LQ: legs on the main deck, the quarters' corners (2nd storey) and the lifeboat embarkation deck
  const lc: [number, number] = [(LQ.deck.x0 + LQ.deck.x1) / 2, (LQ.deck.z0 + LQ.deck.z1) / 2]
  for (const leg of LQ.legs) out.push(onLeg(leg, lc, 0, 'LQ', 0.75), onLeg(leg, lc, 0, 'LQ', 0.75, false, true))
  const Q = LQ.quarters
  P(Q.x0 - 0.2, Q.storey * 2 + 0.6, Q.z0 - 0.2, 'LQ')
  P(Q.x1 + 0.2, Q.storey * 2 + 0.6, Q.z0 - 0.2, 'LQ')
  P(Q.x0 - 0.2, Q.storey * 2 + 0.6, Q.z1 + 0.2, 'LQ')
  P(LQ.deck.x1 + 1.3, 3.0, 71, 'LQ')
  // WHP-N: legs on the wellhead and cellar decks, the stair tower
  const wc: [number, number] = [(WHP.deck.x0 + WHP.deck.x1) / 2, (WHP.deck.z0 + WHP.deck.z1) / 2]
  for (const leg of WHP.legs) {
    out.push(onLeg(leg, wc, 0, 'WHP-N', 0.75), onLeg(leg, wc, 0, 'WHP-N', 0.75, false, true))
    out.push(onLeg(leg, wc, WHP.cellarY, 'WHP-N', 0.75))
  }
  // RP and WI: on every leg at main and cellar deck, inboard and outboard
  for (const [pf, id] of [[RP, 'RP'], [WI, 'WI']] as const) {
    const c: [number, number] = [(pf.deck.x0 + pf.deck.x1) / 2, (pf.deck.z0 + pf.deck.z1) / 2]
    for (const leg of pf.legs) out.push(onLeg(leg, c, 0, id, 0.75), onLeg(leg, c, 0, id, 0.75, false, true), onLeg(leg, c, pf.cellarY, id, 0.75))
  }
  P(WHP.deck.x0 + 0.35, 2.7, -80.6, 'WHP-N')
  return out
}

const AMBER = new THREE.Color(1.0, 0.5, 0.02)
const RED = new THREE.Color(1.0, 0.06, 0.03)
const WHITE = new THREE.Color(1.0, 0.95, 0.9)
const DARK = new THREE.Color(0.22, 0.09, 0.05)
const _c = new THREE.Color()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()

/** lens colour (linear, can be > 1) and halo strength for an alarm state at time t */
function pattern(ga: Ga, t: number, i: number, out: THREE.Color): number {
  const ph = (hz: number, duty = 0.5) => ((t * hz) % 1) < duty
  switch (ga) {
    case 'gas':
      return ph(1) ? (out.copy(AMBER).multiplyScalar(2.2), 1) : (out.copy(AMBER).multiplyScalar(0.55), 0.45)
    case 'fire':
      return ph(2) ? (out.copy(RED).multiplyScalar(2.4), 1) : (out.copy(RED).multiplyScalar(0.55), 0.45)
    case 'muster': {
      const white = (Math.floor(t * 1.5) + i) % 2 === 0
      out.copy(white ? WHITE : RED).multiplyScalar(white ? 1.6 : 2.2)
      return 0.9
    }
    case 'abandon': {
      const u = t % 1
      if (u < 0.1 || (u > 0.2 && u < 0.3)) return out.copy(RED).multiplyScalar(2.6), 1.15
      if ((u > 0.5 && u < 0.6) || (u > 0.7 && u < 0.8)) return out.copy(WHITE).multiplyScalar(2.2), 1.15
      return out.copy(RED).multiplyScalar(0.9), 0.6
    }
    default:
      out.copy(DARK)
      return 0
  }
}

const haloVert = /* glsl */ `
uniform float uPx;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = uv;
#ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
#else
  vCol = vec3(1.0);
#endif
  float s = length(instanceMatrix[0].xyz);
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  // never smaller than ~34 px across, so a flashing platform reads from the field view
  float ws = s > 0.0 ? max(s, 34.0 * max(-c.z, 0.1) / uPx) : 0.0;
  c.xy += position.xy * ws;
  gl_Position = projectionMatrix * c;
}`
const haloFrag = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = pow(max(1.0 - r, 0.0), 1.5);
  // premultiplied: tints bright backgrounds too (pure additive vanishes against sky and white paint)
  gl_FragColor = vec4(vCol * a, a * 0.85);
}`

function housingGeometry() {
  // bracket plate + short stand-off arm + base can under the lens
  const plate = new THREE.BoxGeometry(0.22, 0.3, 0.03).translate(0, -0.12, 0)
  const arm = new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8).translate(0, -0.1, 0)
  const can = new THREE.CylinderGeometry(0.14, 0.15, 0.1, 16).translate(0, 0.0, 0)
  const cage = new THREE.TorusGeometry(0.145, 0.014, 6, 16).rotateX(Math.PI / 2).translate(0, 0.22, 0)
  const g = mergeGeometries([plate, arm, can, cage].map((x) => x.toNonIndexed()))!
  for (const x of [plate, arm, can, cage]) x.dispose()
  return g
}

export function GaBeacons({ upperDeck = true }: { upperDeck?: boolean }) {
  const beacons = useMemo(() => gaBeaconLayout().filter((b) => upperDeck || !b.upper), [upperDeck])
  const n = beacons.length
  const meshes = useMemo(() => {
    const housing = new THREE.InstancedMesh(housingGeometry(), new THREE.MeshStandardMaterial({ color: '#3a3d40', roughness: 0.6, metalness: 0.4 }), n)
    const lensGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.3, 16).translate(0, 0.2, 0)
    const lens = new THREE.InstancedMesh(lensGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), n)
    const halo = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 600 } },
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        toneMapped: false,
      }),
      n,
    )
    lens.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    halo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    beacons.forEach((b, i) => {
      _m.makeTranslation(b.pos.x, b.pos.y, b.pos.z)
      housing.setMatrixAt(i, _m)
      lens.setMatrixAt(i, _m)
      lens.setColorAt(i, DARK)
      halo.setMatrixAt(i, _m.makeScale(0, 0, 0))
      halo.setColorAt(i, _c.setRGB(0, 0, 0))
    })
    for (const m of [housing, lens, halo]) {
      m.frustumCulled = false
      m.raycast = () => null
    }
    halo.renderOrder = 7
    housing.castShadow = false
    return { housing, lens, halo }
  }, [beacons, n])
  useEffect(
    () => () => {
      for (const m of Object.values(meshes)) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    },
    [meshes],
  )
  // (new meshes start dark = the quiet state, so a rebuild needs no reset)
  const last = useRef({ quiet: false }).current

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const cam = state.camera as THREE.PerspectiveCamera
    ;(meshes.halo.material as THREE.ShaderMaterial).uniforms.uPx.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 38) / 2)))
    const ga: Record<PlatformId, Ga> = { Alpha: platformGa('Alpha'), 'WHP-N': platformGa('WHP-N'), LQ: platformGa('LQ'), RP: platformGa('RP'), WI: platformGa('WI'), Plant: 'normal' }
    const quiet = ga.Alpha === 'normal' && ga['WHP-N'] === 'normal' && ga.LQ === 'normal' && ga.RP === 'normal' && ga.WI === 'normal'
    if (quiet && last.quiet) return
    last.quiet = quiet
    const { lens, halo } = meshes
    beacons.forEach((b, i) => {
      const k = pattern(ga[b.platform], t, i, _c)
      lens.setColorAt(i, _c)
      if (k > 0) {
        _m.compose(_p.copy(b.pos).setY(b.pos.y + 0.2), _q.identity(), _s.setScalar(3.2 * k))
        halo.setMatrixAt(i, _m)
        halo.setColorAt(i, _c.multiplyScalar(0.8))
      } else halo.setMatrixAt(i, _m.makeScale(0, 0, 0))
    })
    if (lens.instanceColor) lens.instanceColor.needsUpdate = true
    if (halo.instanceColor) halo.instanceColor.needsUpdate = true
    halo.instanceMatrix.needsUpdate = true
  })

  return (
    <group name="GaBeacons">
      <primitive object={meshes.housing} />
      <primitive object={meshes.lens} />
      <primitive object={meshes.halo} />
    </group>
  )
}
