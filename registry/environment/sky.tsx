// Day or night sky and lighting rig: physical sky or star dome with moon, sun or moon light with shadows, hemisphere fill, offline environment map, haze and horizon band (ported from the Deck Twin app).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, Sky as DreiSky } from '@react-three/drei'
import type { GroupProps } from '../lib/mesh'
import { Ocean } from './ocean'

export interface SkyProps {
  mode?: 'day' | 'night'
  /** sun (day) or moon (night) elevation above the horizon, degrees */
  elevation?: number
  /** compass bearing of the sun or moon, degrees from north (-Z) through east (+X) */
  azimuth?: number
  /** sun or moon light, hemisphere fill and environment map; false draws only the sky, haze and fog */
  lights?: boolean
  /** scene radius the sun shadow covers, m */
  shadowRadius?: number
  shadowCenter?: [number, number, number]
  /** fog density multiplier, 0 = clear */
  haze?: number
  stars?: boolean
  /** warm fill at night standing in for deck floodlights, 0 to 2 */
  deckLights?: number
  /** reference scene: a pile with chrome and matte spheres in a small sea */
  preview?: boolean
}

export const defaults = {
  mode: 'day' as 'day' | 'night',
  elevation: 33,
  azimuth: 112,
  lights: true,
  shadowRadius: 40,
  shadowCenter: [0, 0, 0] as [number, number, number],
  haze: 1,
  stars: true,
  deckLights: 1,
  preview: false,
}

const HAZE = '#cfe0ee'
const NIGHT_HAZE = '#0d1522'
const DEEP = '#0a2e3a'
const NIGHT_DEEP = '#03080c'
const FOG_DENSITY = 0.0008
const SKY = { turbidity: 1.7, rayleigh: 2.9, mieCoefficient: 0.0025, mieDirectionalG: 0.8 }

export function sunDirection(elevation: number, azimuth: number) {
  const e = THREE.MathUtils.degToRad(elevation)
  const a = THREE.MathUtils.degToRad(azimuth)
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).normalize()
}

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

function useDome(ref: React.RefObject<THREE.Mesh | null>, k: number, onFrame?: (t: number) => void) {
  const camera = useThree((s) => s.camera)
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    onFrame?.(clock.elapsedTime)
    m.position.copy(camera.position)
    if (m.parent) m.parent.worldToLocal(m.position)
    m.scale.setScalar(Math.min(3000 * k, ((camera as THREE.PerspectiveCamera).far ?? 8000) * 0.85 * k))
  })
}

function HorizonHaze({ haze, deep }: { haze: string; deep: string }) {
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uHaze: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() } },
        vertexShader: DOME_VERT,
        fragmentShader: /* glsl */ `
          uniform vec3 uHaze;
          uniform vec3 uDeep;
          varying vec3 vDir;
          void main() {
            float y = normalize(vDir).y;
            float above = 1.0 - smoothstep(0.0, 0.05, y);
            above = above * above * (3.0 - 2.0 * above);
            vec3 col = mix(uHaze, uDeep, smoothstep(-0.004, -0.09, y));
            gl_FragColor = vec4(col, y < 0.0 ? 1.0 : above * 0.8);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        fog: false,
      }),
    [],
  )
  useEffect(() => {
    mat.uniforms.uHaze.value.set(haze)
    mat.uniforms.uDeep.value.set(deep)
  }, [mat, haze, deep])
  useEffect(() => () => mat.dispose(), [mat])
  const geo = useMemo(() => new THREE.SphereGeometry(1, 64, 32), [])
  useDome(ref, 1)
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-2} frustumCulled={false} raycast={() => null} />
}

function StarDome({ moon, stars }: { moon: THREE.Vector3; stars: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uHorizon: { value: new THREE.Color(NIGHT_HAZE) }, uZenith: { value: new THREE.Color('#020409') }, uMoon: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uStars: { value: 1 } },
        vertexShader: DOME_VERT,
        fragmentShader: /* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uZenith;
          uniform vec3 uMoon;
          uniform float uTime;
          uniform float uStars;
          varying vec3 vDir;
          float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            float y = max(d.y, 0.0);
            vec3 col = mix(uHorizon, uZenith, pow(y, 0.45));
            vec3 g = d * 260.0;
            vec3 c = floor(g);
            float h = hash(c);
            if (uStars > 0.5 && h > 0.985) {
              vec3 j = vec3(hash(c + 1.7), hash(c + 3.1), hash(c + 5.3));
              float r = length(fract(g) - j);
              float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * h) + h * 60.0);
              float b = (h - 0.985) / 0.015;
              col += vec3(0.9, 0.93, 1.0) * smoothstep(0.22, 0.0, r) * (0.25 + 1.6 * b * b) * tw * smoothstep(0.004, 0.12, y);
            }
            float m = dot(d, normalize(uMoon));
            col += vec3(1.0, 0.97, 0.9) * 2.2 * smoothstep(0.99996, 0.99999, m);
            col += vec3(0.35, 0.42, 0.6) * 0.18 * pow(max(m, 0.0), 300.0);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        depthWrite: false,
        side: THREE.BackSide,
        fog: false,
      }),
    [],
  )
  useEffect(() => {
    mat.uniforms.uMoon.value.copy(moon)
    mat.uniforms.uStars.value = stars ? 1 : 0
  }, [mat, moon, stars])
  useEffect(() => () => mat.dispose(), [mat])
  const geo = useMemo(() => new THREE.SphereGeometry(1, 64, 32), [])
  useDome(ref, 0.96, (t) => (mat.uniforms.uTime.value = t))
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-3} frustumCulled={false} raycast={() => null} />
}

function EnvSea({ horizon, sea }: { horizon: string; sea: string }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uHorizon: { value: new THREE.Color(horizon) }, uSea: { value: new THREE.Color(sea) } },
        vertexShader: DOME_VERT,
        fragmentShader: /* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uSea;
          varying vec3 vDir;
          void main() {
            float y = normalize(vDir).y;
            if (y > 0.0) discard;
            gl_FragColor = vec4(mix(uHorizon, uSea, smoothstep(0.02, -0.7, y)), 1.0);
          }`,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [horizon, sea],
  )
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh material={mat} scale={400} renderOrder={1}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  )
}

function Reference({ night }: { night: boolean }) {
  return (
    <group>
      <Ocean waveHeight={1.2} night={night} />
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.45, 4.5, 32]} />
        <meshStandardMaterial color="#d9a300" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, -11, 0]} userData={{ noFit: true }}>
        <cylinderGeometry args={[0.45, 0.45, 18, 32]} />
        <meshStandardMaterial color="#5b5a3e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[3, 0.1, 1.6]} />
        <meshStandardMaterial color="#8a8f93" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[-0.75, 3.1, 0]} castShadow>
        <sphereGeometry args={[0.5, 48, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.04} metalness={1} />
      </mesh>
      <mesh position={[0.75, 3.1, 0]} castShadow>
        <sphereGeometry args={[0.5, 48, 32]} />
        <meshStandardMaterial color="#9a9a9a" roughness={0.85} metalness={0} />
      </mesh>
    </group>
  )
}

export function Sky({
  mode = defaults.mode,
  elevation = defaults.elevation,
  azimuth = defaults.azimuth,
  lights = defaults.lights,
  shadowRadius = defaults.shadowRadius,
  shadowCenter = defaults.shadowCenter,
  haze = defaults.haze,
  stars = defaults.stars,
  deckLights = defaults.deckLights,
  preview = defaults.preview,
  ...group
}: SkyProps & GroupProps) {
  const night = mode === 'night'
  const scene = useThree((s) => s.scene)
  const dir = useMemo(() => sunDirection(elevation, azimuth), [elevation, azimuth])
  const sunPos = useMemo(() => dir.clone().multiplyScalar(1000), [dir])
  const hazeCol = night ? NIGHT_HAZE : HAZE
  const [cx, cy, cz] = shadowCenter
  const r = Math.max(2, shadowRadius)

  useLayoutEffect(() => {
    const fog = scene.fog
    const bg = scene.background
    const myFog = haze > 0 ? new THREE.FogExp2(hazeCol, FOG_DENSITY * haze * (night ? 1.5 : 1)) : null
    const myBg = new THREE.Color(hazeCol)
    scene.fog = myFog
    scene.background = myBg
    return () => {
      if (scene.fog === myFog) scene.fog = fog
      if (scene.background === myBg) scene.background = bg
    }
  }, [scene, haze, hazeCol, night])

  const target = useMemo(() => new THREE.Object3D(), [])
  const light = useRef<THREE.DirectionalLight>(null)
  useLayoutEffect(() => {
    const l = light.current
    if (!l) return
    const cam = l.shadow.camera
    const half = r * 1.3
    cam.left = -half
    cam.right = half
    cam.top = half
    cam.bottom = -half
    cam.near = 1
    cam.far = r * 6 + 40
    cam.updateProjectionMatrix()
    l.shadow.normalBias = 0.02 + r * 0.0006
    l.shadow.needsUpdate = true
  }, [r, lights])
  const lightPos = useMemo(() => dir.clone().multiplyScalar(r * 3 + 20).add(new THREE.Vector3(cx, cy, cz)), [dir, r, cx, cy, cz])
  const nightFill = 0.3 + 0.6 * deckLights

  return (
    <group {...group}>
      <group userData={{ noFit: true }}>
        {night ? <StarDome moon={dir} stars={stars} /> : <DreiSky distance={4000} sunPosition={sunPos} {...SKY} />}
        <HorizonHaze haze={hazeCol} deep={night ? NIGHT_DEEP : DEEP} />
      </group>
      {lights && (
        <>
          <primitive object={target} position={[cx, cy, cz]} />
          <directionalLight
            ref={light}
            target={target}
            position={lightPos}
            color={night ? '#9fb4d8' : '#fff1dc'}
            intensity={night ? 0.45 : 3.1}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0002}
          />
          {night ? <hemisphereLight args={['#ffdcb4', '#2a3036', nightFill]} /> : <hemisphereLight args={['#b9d5f2', '#6d7c80', 0.4]} />}
          <directionalLight position={[-20, -60, 10]} intensity={night ? 0.04 : 0.25} color="#9fb8c0" />
          {night ? (
            <Environment key="night" resolution={128} frames={1} environmentIntensity={0.3 + 0.1 * deckLights}>
              <color attach="background" args={['#04070c']} />
              <EnvSea horizon="#1a2433" sea="#05090d" />
              <Lightformer form="circle" intensity={1.2} color="#c8d6ff" position={dir.clone().multiplyScalar(80).toArray()} scale={6} target={[0, 0, 0]} />
              <Lightformer form="rect" intensity={0.12 * deckLights} color="#ffb877" position={[0, 40, 0]} rotation-x={Math.PI / 2} scale={[120, 120, 1]} />
            </Environment>
          ) : (
            <Environment key={`day-${elevation}-${azimuth}`} resolution={256} frames={1} environmentIntensity={0.75}>
              <DreiSky distance={500} sunPosition={sunPos} {...SKY} />
              <EnvSea horizon="#b8d0de" sea="#3f7c93" />
              <Lightformer form="circle" intensity={14} color="#fff0d6" position={dir.clone().multiplyScalar(80).toArray()} scale={10} target={[0, 0, 0]} />
            </Environment>
          )}
        </>
      )}
      {preview && <Reference night={night} />}
    </group>
  )
}

export default Sky
