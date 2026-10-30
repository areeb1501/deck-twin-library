/**
 * DeckLights — night floodlighting. Real (unshadowed) point lights over every walkable area, each with a
 * visible fixture: a lamp housing with a glowing lens, a pole where it stands in the open, and a soft
 * additive halo.
 *
 *   Alpha     production deck: 3 × 2 lamps under the weather deck · cellar deck: 3 × 2 under the production
 *             deck · weather deck: two mast floods
 *   LQ, WHP-N, RP, WI   one mast flood on the main deck, one lamp under it on the cellar deck
 *   bridges   one lamp mid-span each
 *   onshore   mast floods on a grid over the plant extent
 *
 * Mounted only at night (adding lights recompiles the materials once, so daytime pays nothing), and
 * faded with the dusk/dawn factor `envNight`. The decay is gentler than physical (1.3, not 2) so a lamp
 * lights its whole bay evenly instead of a hot spot.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { envNight } from './envShared'
import { ALPHA_DECK, BRIDGE_N, BRIDGE_NN, BRIDGE_S, BRIDGE_W, CELLAR_FLOOR, LQ, RP, WEATHER_FLOOR, WHP, WI } from '../../model/site'
import type { PlanRect, Plant } from '../../model/types'
import { DECK_WORLD_Y, useStore } from '../../state/store'
import { usePlantStore } from '../../state/plantStore'

/** a lamp: deck-local position, candela-ish intensity, reach (m); `base` = floor y of its pole (open-air lamps) */
type Lamp = { p: [number, number, number]; k: number; reach: number; base?: number }

const LAMP_COLOR = '#ffd9ae'
/** lamps under a deck: just below the deck above's beams */
const UNDER_PROD = WEATHER_FLOOR - 1.6
const UNDER_CELLAR = -2.4
const MAST = 9

const mid = (r: PlanRect): [number, number] => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]

function offshoreLamps(): Lamp[] {
  const out: Lamp[] = []
  const A = ALPHA_DECK
  for (const x of [-20, 0, 20]) for (const z of [-10, 10]) out.push({ p: [x, UNDER_PROD, z], k: 26, reach: 30 })
  for (const x of [-20, 0, 20]) for (const z of [-11, 9]) out.push({ p: [x, UNDER_CELLAR, z], k: 22, reach: 30 })
  // weather deck floods on the SW and NE corners
  out.push({ p: [A.x0 + 1.5, WEATHER_FLOOR + MAST + 2, A.z1 - 1.5], k: 80, reach: 55, base: WEATHER_FLOOR })
  out.push({ p: [A.x1 - 1.5, WEATHER_FLOOR + MAST + 2, A.z0 + 6], k: 80, reach: 55, base: WEATHER_FLOOR })
  // satellite platforms: a mast flood on the main deck (outboard of the deck centre), a lamp in the cellar
  const sats: [PlanRect, [number, number]][] = [
    [LQ.deck, [-7.5, 66]], // west of the quarters
    [WHP.deck, [24.5, -74]],
    [RP.deck, [-71.5, -14]],
    [WI.deck, [0.5, -142]],
  ]
  for (const [deck, [x, z]] of sats) {
    out.push({ p: [x, MAST, z], k: 70, reach: 48, base: 0 })
    const [cx, cz] = mid(deck)
    out.push({ p: [cx, CELLAR_FLOOR + 5.6, cz], k: 30, reach: 30 })
  }
  for (const b of [BRIDGE_S.walk, BRIDGE_N.walk, BRIDGE_W.walk, BRIDGE_NN.walk]) {
    const [x, z] = mid(b)
    out.push({ p: [x, 4.2, z], k: 12, reach: 26, base: 0 })
  }
  return out
}

function onshoreLamps(plant: Plant): Lamp[] {
  const e = plant.deck.extent
  const nx = Math.max(1, Math.round((e.maxX - e.minX) / 25))
  const nz = Math.max(1, Math.round((e.maxZ - e.minZ) / 25))
  const out: Lamp[] = []
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = e.minX + ((i + 0.5) * (e.maxX - e.minX)) / nx
      const z = e.minZ + ((j + 0.5) * (e.maxZ - e.minZ)) / nz
      out.push({ p: [x, 12, z], k: 70, reach: 45, base: 0 })
    }
  return out.slice(0, 16)
}

const haloVert = /* glsl */ `
uniform float uPx;
uniform float uSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uPx / max(-mv.z, 0.1), 2.0, 160.0);
}`
const haloFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uK;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  if (r > 1.0) discard;
  float a = (exp(-r * r * 9.0) * 0.9 + (1.0 - r) * 0.12) * uK;
  gl_FragColor = vec4(uColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _v = new THREE.Vector3()

function Lamps({ lamps }: { lamps: Lamp[] }) {
  const lights = useRef<(THREE.PointLight | null)[]>([])
  const lens = useMemo(() => new THREE.MeshBasicMaterial({ color: LAMP_COLOR, toneMapped: false }), [])
  const housing = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3d40', metalness: 0.6, roughness: 0.5 }), [])
  const halo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 600 }, uSize: { value: 2.6 }, uColor: { value: new THREE.Color(LAMP_COLOR) }, uK: { value: 0 } },
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  )
  const geo = useMemo(() => {
    const box = new THREE.BoxGeometry(0.7, 0.22, 0.45)
    const glass = new THREE.PlaneGeometry(0.6, 0.36).rotateX(Math.PI / 2).translate(0, -0.115, 0)
    const pole = new THREE.CylinderGeometry(0.07, 0.09, 1, 8).translate(0, 0.5, 0)
    const pts = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lamps.flatMap((l) => [l.p[0], l.p[1] - 0.25, l.p[2]]), 3))
    return { box, glass, pole, pts }
  }, [lamps])
  const poles = useMemo(() => lamps.filter((l) => l.base !== undefined), [lamps])
  const boxRef = useRef<THREE.InstancedMesh>(null)
  const glassRef = useRef<THREE.InstancedMesh>(null)
  const poleRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    lamps.forEach((l, i) => {
      _m.compose(_v.set(...l.p), _q.identity(), _s.set(1, 1, 1))
      boxRef.current?.setMatrixAt(i, _m)
      glassRef.current?.setMatrixAt(i, _m)
    })
    poles.forEach((l, i) => {
      const h = l.p[1] - 0.11 - (l.base as number)
      _m.compose(_v.set(l.p[0], l.base as number, l.p[2]), _q.identity(), _s.set(1, h, 1))
      poleRef.current?.setMatrixAt(i, _m)
    })
    for (const r of [boxRef, glassRef, poleRef]) {
      if (!r.current) continue
      r.current.instanceMatrix.needsUpdate = true
      r.current.computeBoundingSphere()
    }
  }, [lamps, poles])

  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose()
      for (const m of [lens, housing, halo]) m.dispose()
    },
    [geo, lens, housing, halo],
  )

  useFrame((state) => {
    const n = envNight.value
    lamps.forEach((l, i) => {
      const L = lights.current[i]
      if (L) L.intensity = l.k * n
    })
    lens.color.set(LAMP_COLOR).multiplyScalar(0.3 + 2.7 * n)
    halo.uniforms.uK.value = n
    const cam = state.camera as THREE.PerspectiveCamera
    halo.uniforms.uPx.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 38) / 2)))
  })

  return (
    <group raycast={() => null}>
      {lamps.map((l, i) => (
        <pointLight key={i} ref={(r) => void (lights.current[i] = r)} position={[l.p[0], l.p[1] - 0.3, l.p[2]]} color={LAMP_COLOR} intensity={0} distance={l.reach} decay={1.3} />
      ))}
      <instancedMesh ref={boxRef} args={[geo.box, housing, lamps.length]} raycast={() => null} />
      <instancedMesh ref={glassRef} args={[geo.glass, lens, lamps.length]} raycast={() => null} />
      {poles.length > 0 && <instancedMesh ref={poleRef} args={[geo.pole, housing, poles.length]} castShadow raycast={() => null} />}
      <points geometry={geo.pts} material={halo} frustumCulled={false} renderOrder={5} raycast={() => null} />
    </group>
  )
}

export function DeckLights() {
  const night = useStore((s) => s.night)
  const plant = usePlantStore((s) => s.plant)
  const offshore = (plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha'
  const lamps = useMemo(() => (offshore ? offshoreLamps() : onshoreLamps(plant)), [offshore, plant])
  // stay mounted through dawn so the lamps fade out with the sky
  const [on, setOn] = useState(night)
  if (night && !on) setOn(true)
  useFrame(() => {
    if (on && !night && envNight.value === 0) setOn(false)
  })
  if (!on) return null
  return (
    <group position={[0, DECK_WORLD_Y, 0]}>
      <Lamps lamps={lamps} />
    </group>
  )
}

export default DeckLights
