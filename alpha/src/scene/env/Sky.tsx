/**
 * SkyAndLights — procedural sky (drei <Sky>, no network), sun + hemisphere light, offline
 * environment map (Sky + Lightformers rendered to a cube map, NO presets), exponential haze and
 * a camera-following horizon band that hides the sea/sky seam.
 *
 * The ONLY shadow-casting light in the scene is the sun directional light created here.
 * The field spans x −98…+76, z −156…+86, too much for one sharp ortho shadow map, so the shadow frustum
 * FOLLOWS the camera target (orbit target, or the walker's look point — both are CameraControls'
 * target): ±56 m when close (2.7 cm texels at 4096²), growing in fixed steps with the camera distance
 * so the overview shadows the whole field. The centre is snapped to a ~10 m grid that is a whole
 * number of shadow texels in light space, so it only moves (and the on-demand shadow map is only
 * re-rendered) when the target has moved ~10 m, and never shimmers.
 *
 * Weather: with high wind / sea state (knobs.wind, knobs.seaState) the haze and fog turn greyer and
 * thicker, the sky more turbid and the sun weaker.
 *
 * Night (store.night, N): the day sky gives way to a camera-following star dome with the moon where the
 * sun was. The sun light becomes the moonlight — same direction, so the shadow frustum above still
 * applies — and the hemisphere fill drops to a faint warm spill; the decks themselves are lit by the
 * floodlights in DeckLights.tsx. The environment map is re-baked dark so metals and the sea stop
 * reflecting a daylit sky.
 */
import { Environment, Lightformer, Sky } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DEEP, envNight, FOG_DENSITY, HAZE, SUN_DIR } from './envShared'
import { SHADOW_PROXY_LAYER } from '../structure/structMaterials'
import { DECK_WORLD_Y } from '../../state/store'
import { seaStateNow, windNow } from '../../sim/cranes'
import { useStore } from '../../state/store'

/** live haze colour (fog + horizon band), greyed by the weather */
const HAZE_NOW = HAZE.clone()
const STORM_GREY = new THREE.Color('#9aa4aa')
/** night haze == the star dome's horizon colour */
const NIGHT_HAZE = new THREE.Color('#0d1522')
const NIGHT_STORM = new THREE.Color('#11161b')
const SUN_COLOR = new THREE.Color('#fff1dc')
const MOON_COLOR = new THREE.Color('#9fb4d8')
const HEMI_DAY = { sky: new THREE.Color('#c4d8ea'), ground: new THREE.Color('#6d7c80'), k: 0.4 }
const HEMI_NIGHT = { sky: new THREE.Color('#ffcf9e'), ground: new THREE.Color('#2a3036'), k: 0.22 }
/** shadow frustum half-sizes (m), picked by camera distance */
const SHADOW_HALF = [56, 84, 126, 170]
const SUN_DIST = 220

const SKY = { turbidity: 2.4, rayleigh: 2.2, mieCoefficient: 0.003, mieDirectionalG: 0.8 }
const SUN_POS = SUN_DIR.clone().multiplyScalar(1000)

function HorizonHaze() {
  const ref = useRef<THREE.Mesh>(null)
  const camera = useThree((s) => s.camera)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uHaze: { value: HAZE_NOW }, uDeep: { value: DEEP } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uHaze;
          uniform vec3 uDeep;
          varying vec3 vDir;
          void main() {
            float y = normalize(vDir).y;
            float above = 1.0 - smoothstep(0.0, 0.085, y);
            above = above * above * (3.0 - 2.0 * above);
            vec3 col = mix(uHaze, uDeep, smoothstep(-0.004, -0.09, y));
            float a = y < 0.0 ? 1.0 : above * 0.92;
            gl_FragColor = vec4(col, a);
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
  const geo = useMemo(() => new THREE.SphereGeometry(1, 64, 32), [])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    m.position.copy(camera.position)
    const far = (camera as THREE.PerspectiveCamera).far ?? 8000
    m.scale.setScalar(Math.min(3000, far * 0.85))
  })
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-2} frustumCulled={false} raycast={() => null} />
}

/** night sky: dark gradient, hashed star field and a moon in the sun's direction (camera-following dome) */
function NightSky({ dome }: { dome: React.RefObject<THREE.Mesh | null> }) {
  const camera = useThree((s) => s.camera)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uHorizon: { value: NIGHT_HAZE }, uZenith: { value: new THREE.Color('#020409') }, uMoon: { value: SUN_DIR }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uZenith;
          uniform vec3 uMoon;
          uniform float uTime;
          varying vec3 vDir;
          float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            float y = max(d.y, 0.0);
            vec3 col = mix(uHorizon, uZenith, pow(y, 0.45));
            // stars: one candidate per grid cell on the direction, jittered inside the cell
            vec3 g = d * 260.0;
            vec3 c = floor(g);
            float h = hash(c);
            if (h > 0.985) {
              vec3 j = vec3(hash(c + 1.7), hash(c + 3.1), hash(c + 5.3));
              float r = length(fract(g) - j);
              float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * h) + h * 60.0);
              float b = (h - 0.985) / 0.015;
              col += vec3(0.9, 0.93, 1.0) * smoothstep(0.22, 0.0, r) * (0.25 + 1.6 * b * b) * tw * smoothstep(0.02, 0.25, y);
            }
            // moon: disc + halo
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
  const geo = useMemo(() => new THREE.SphereGeometry(1, 64, 32), [])
  useFrame(({ clock }) => {
    const m = dome.current
    if (!m || !m.visible) return
    mat.uniforms.uTime.value = clock.elapsedTime
    m.position.copy(camera.position)
    const far = (camera as THREE.PerspectiveCamera).far ?? 8000
    m.scale.setScalar(Math.min(2900, far * 0.8))
  })
  return <mesh ref={dome} geometry={geo} material={mat} renderOrder={-3} frustumCulled={false} visible={false} raycast={() => null} />
}

/** light-space basis of the sun's shadow camera (lookAt from SUN_DIR towards the target) */
const LZ = SUN_DIR.clone()
const LX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LZ).normalize()
const LY = new THREE.Vector3().crossVectors(LZ, LX)
const _t = new THREE.Vector3()
const _c = new THREE.Vector3()
/** light-space depth of the deck centre (the target stays at this depth) */
const D0 = DECK_WORLD_Y * LZ.y

function ShadowFollow({ light, target, mapSize }: { light: React.RefObject<THREE.DirectionalLight | null>; target: THREE.Object3D; mapSize: number }) {
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as { getTarget?: (v: THREE.Vector3) => THREE.Vector3 } | null
  const last = useRef({ a: NaN, b: NaN, half: 56 })
  useFrame(({ camera }) => {
    const l = light.current
    if (!l) return
    if (controls?.getTarget) controls.getTarget(_t)
    else _t.set(0, DECK_WORLD_Y, 0)
    const dist = camera.position.distanceTo(_t)
    // frustum size: smallest step that covers ~0.6 × the view distance
    let half = SHADOW_HALF[SHADOW_HALF.length - 1]
    for (const h of SHADOW_HALF) if (h >= dist * 0.6) {
      half = h
      break
    }
    // hysteresis on the way down (don't flip-flop at a step boundary)
    const prev = last.current.half
    if (half < prev && dist * 0.6 > half * 0.85) half = prev
    // snap the centre in light space: a whole number of texels, ~10 m (or more for big frusta)
    const texel = (2 * half) / mapSize
    const step = texel * Math.round(Math.max(10, half / 6) / texel)
    _c.set(_t.x, DECK_WORLD_Y, _t.z)
    const a = Math.round(_c.dot(LX) / step) * step
    const b = Math.round(_c.dot(LY) / step) * step
    if (a === last.current.a && b === last.current.b && half === prev) return
    last.current = { a, b, half }
    target.position.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZ, D0)
    target.updateMatrixWorld()
    const reach = 1.2 * half + 70
    const sunDist = Math.max(SUN_DIST, reach + 20)
    l.position.copy(target.position).addScaledVector(SUN_DIR, sunDist)
    const cam = l.shadow.camera
    cam.left = -half
    cam.right = half
    cam.top = half
    cam.bottom = -half
    cam.near = Math.max(1, sunDist - reach)
    cam.far = sunDist + reach
    cam.updateProjectionMatrix()
    l.shadow.normalBias = 0.035 * (half / 56)
    gl.shadowMap.needsUpdate = true
  })
  return null
}

type Lights = {
  light: React.RefObject<THREE.DirectionalLight | null>
  sky: React.RefObject<THREE.Mesh | null>
  dome: React.RefObject<THREE.Mesh | null>
  hemi: React.RefObject<THREE.HemisphereLight | null>
  bounce: React.RefObject<THREE.DirectionalLight | null>
}

/** greyer, hazier sky / fog and a weaker sun in strong wind and high seas; day ↔ night */
function Weather({ light, sky, dome, hemi, bounce }: Lights) {
  const scene = useThree((s) => s.scene)
  const night = useStore((s) => s.night)
  // n starts at its target: a remembered night loads straight into night
  const st = useRef({ s: 0, n: night ? 1 : 0, applied: -1, appliedN: -1 })
  useFrame((_, dtRaw) => {
    const target = Math.min(1, Math.max(0, (windNow().speed - 12) / 14 + (seaStateNow() - 2.5) / 4))
    const x = st.current
    const dt = Math.min(dtRaw, 0.1)
    x.s += (target - x.s) * Math.min(1, dt * 0.5)
    // dusk / dawn in ~1.5 s
    x.n += ((night ? 1 : 0) - x.n) * Math.min(1, dt * 3)
    if (Math.abs(x.n - (night ? 1 : 0)) < 0.002) x.n = night ? 1 : 0
    if (Math.abs(x.s - x.applied) < 0.004 && x.n === x.appliedN) return
    x.applied = x.s
    x.appliedN = x.n
    const n = x.n
    envNight.value = n
    HAZE_NOW.copy(HAZE).lerp(STORM_GREY, x.s * 0.85)
    _night.copy(NIGHT_HAZE).lerp(NIGHT_STORM, x.s * 0.85)
    HAZE_NOW.lerp(_night, n)
    const fog = scene.fog as THREE.FogExp2 | null
    if (fog) {
      fog.color.copy(HAZE_NOW)
      fog.density = FOG_DENSITY * (1 + 2.2 * x.s) * (1 + 0.5 * n)
    }
    if (light.current) {
      light.current.intensity = THREE.MathUtils.lerp(3.1, 0.32, n) * (1 - 0.45 * x.s)
      light.current.color.copy(SUN_COLOR).lerp(MOON_COLOR, n)
    }
    if (hemi.current) {
      hemi.current.color.copy(HEMI_DAY.sky).lerp(HEMI_NIGHT.sky, n)
      hemi.current.groundColor.copy(HEMI_DAY.ground).lerp(HEMI_NIGHT.ground, n)
      hemi.current.intensity = THREE.MathUtils.lerp(HEMI_DAY.k, HEMI_NIGHT.k, n)
    }
    if (bounce.current) bounce.current.intensity = THREE.MathUtils.lerp(0.25, 0.04, n)
    // the day sky hands over to the star dome at mid-dusk (the haze band hides the swap at the horizon)
    if (sky.current) sky.current.visible = n < 0.5
    if (dome.current) dome.current.visible = n >= 0.5
    const u = (sky.current?.material as THREE.ShaderMaterial | undefined)?.uniforms
    if (u?.turbidity) u.turbidity.value = SKY.turbidity + 9 * x.s
    if (u?.rayleigh) u.rayleigh.value = SKY.rayleigh * (1 - 0.6 * x.s)
  })
  return null
}
const _night = new THREE.Color()

export function SkyAndLights({ shadowMapSize = 4096 }: { shadowMapSize?: number }) {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const skyRef = useRef<THREE.Mesh>(null)
  const domeRef = useRef<THREE.Mesh>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const bounceRef = useRef<THREE.DirectionalLight>(null)
  const night = useStore((s) => s.night)
  const scene = useThree((s) => s.scene)
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(0, DECK_WORLD_Y, 0)
    o.name = 'sunTarget'
    return o
  }, [])
  const lightPos = useMemo(() => SUN_DIR.clone().multiplyScalar(220).add(target.position), [target])

  useEffect(() => {
    scene.add(target)
    target.updateMatrixWorld()
    const l = lightRef.current
    if (l) {
      l.target = target
      l.shadow.camera.layers.enable(SHADOW_PROXY_LAYER)
      l.shadow.needsUpdate = true
    }
    return () => {
      scene.remove(target)
    }
  }, [scene, target])

  return (
    <>
      <fogExp2 attach="fog" args={[HAZE, FOG_DENSITY]} />
      <Sky ref={skyRef as never} distance={4000} sunPosition={SUN_POS} {...SKY} />
      <ShadowFollow light={lightRef} target={target} mapSize={shadowMapSize} />
      <NightSky dome={domeRef} />
      <Weather light={lightRef} sky={skyRef} dome={domeRef} hemi={hemiRef} bounce={bounceRef} />
      <HorizonHaze />
      <hemisphereLight ref={hemiRef} args={['#c4d8ea', '#6d7c80', 0.4]} />
      {/* sea/deck bounce: lifts the undersides of decks and beams (no shadows) */}
      <directionalLight ref={bounceRef} position={[-20, -60, 10]} intensity={0.25} color="#9fb8c0" />
      <directionalLight
        ref={lightRef}
        position={lightPos}
        color="#fff1dc"
        intensity={3.1}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.035}
        shadow-camera-left={-56}
        shadow-camera-right={56}
        shadow-camera-top={56}
        shadow-camera-bottom={-56}
        shadow-camera-near={60}
        shadow-camera-far={400}
      />
      {night ? (
        // re-baked on the switch (key): a dark sea and sky, the moon, a faint warm glow of the deck lights
        <Environment key="night" resolution={128} frames={1} environmentIntensity={0.3}>
          <color attach="background" args={['#04070c']} />
          <mesh position={[0, -20, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[900, 48]} />
            <meshBasicMaterial color="#0a1014" toneMapped={false} />
          </mesh>
          <Lightformer form="circle" intensity={1.2} color="#c8d6ff" position={SUN_DIR.clone().multiplyScalar(80).toArray()} scale={6} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.35} color="#ffb877" position={[0, 40, 0]} rotation-x={Math.PI / 2} scale={[120, 120, 1]} />
        </Environment>
      ) : (
        <Environment key="day" resolution={256} frames={1} environmentIntensity={0.75}>
          <Sky distance={500} sunPosition={SUN_POS} {...SKY} />
          {/* sea below the horizon so metals don't reflect a black void */}
          <mesh position={[0, -20, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[900, 48]} />
            <meshBasicMaterial color="#7a8e93" toneMapped={false} />
          </mesh>
          {/* soft sun key + sky fill (Lightformers, no CDN presets) */}
          <Lightformer form="circle" intensity={14} color="#fff0d6" position={SUN_DIR.clone().multiplyScalar(80).toArray()} scale={10} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.8} color="#d8e8ff" position={[0, 90, 0]} rotation-x={Math.PI / 2} scale={[160, 160, 1]} />
        </Environment>
      )}
    </>
  )
}

export default SkyAndLights
