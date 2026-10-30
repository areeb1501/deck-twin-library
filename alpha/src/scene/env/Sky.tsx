/**
 * SkyAndLights — procedural sky (drei <Sky>, no network), sun + hemisphere light, offline
 * environment map (Sky + Lightformers rendered to a cube map, NO presets), exponential haze and
 * a camera-following horizon band that hides the sea/sky seam.
 *
 * The ONLY shadow-casting light in the scene is the sun directional light created here.
 * Its shadow frustum is fixed (static light + static target at world (0, 28, 0)); it does not
 * depend on any scene object, so it is unaffected by hiding topsides / ceiling / layers.
 */
import { Environment, Lightformer, Sky } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DEEP, FOG_DENSITY, HAZE, SUN_DIR } from './envShared'
import { SHADOW_PROXY_LAYER } from '../structure/structMaterials'
import { DECK_WORLD_Y } from '../../state/store'

const SKY = { turbidity: 2.4, rayleigh: 2.2, mieCoefficient: 0.003, mieDirectionalG: 0.8 }
const SUN_POS = SUN_DIR.clone().multiplyScalar(1000)

function HorizonHaze() {
  const ref = useRef<THREE.Mesh>(null)
  const camera = useThree((s) => s.camera)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uHaze: { value: HAZE }, uDeep: { value: DEEP } },
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

export function SkyAndLights({ shadowMapSize = 4096 }: { shadowMapSize?: number }) {
  const lightRef = useRef<THREE.DirectionalLight>(null)
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
      <Sky distance={4000} sunPosition={SUN_POS} {...SKY} />
      <HorizonHaze />
      <hemisphereLight args={['#c4d8ea', '#6d7c80', 0.4]} />
      {/* sea/deck bounce: lifts the undersides of decks and beams (no shadows) */}
      <directionalLight position={[-20, -60, 10]} intensity={0.25} color="#9fb8c0" />
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
      <Environment resolution={256} frames={1} environmentIntensity={0.75}>
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
    </>
  )
}

export default SkyAndLights
