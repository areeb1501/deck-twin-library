/** Animated flare flame: noise-driven emissive billboard + soft glow + flickering point light. */
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { envTime } from './envShared'

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const flameFrag = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vUv;
  float y = p.y;
  // wind lean: flame bends towards +u with height
  float x = (p.x - 0.5) - y * y * 0.18;
  float n = fbm(vec2(x * 3.0, y * 2.2 - uTime * 2.6));
  float n2 = fbm(vec2(x * 6.0 + 3.0, y * 4.0 - uTime * 4.1));
  float width = mix(0.16, 0.30, smoothstep(0.0, 0.45, y)) * (1.0 - smoothstep(0.55, 1.0, y) * 0.75);
  float d = abs(x) / max(width, 1e-3);
  float body = 1.0 - smoothstep(0.35, 1.0, d + (n - 0.5) * 1.1);
  body *= smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.55 + n * 0.35, 0.98, y));
  float core = (1.0 - smoothstep(0.0, 0.55, d + (n2 - 0.5) * 0.6)) * (1.0 - smoothstep(0.1, 0.45, y));
  vec3 col = mix(vec3(0.95, 0.22, 0.03), vec3(1.0, 0.5, 0.1), n);
  col = mix(col, vec3(1.0, 0.85, 0.55), core);
  float a = clamp(body * (0.65 + 0.5 * n2) + core * 0.6, 0.0, 1.0);
  gl_FragColor = vec4(col * a * 1.25, a);
}`

const glowFrag = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = pow(max(1.0 - r, 0.0), 2.2) * (0.32 + 0.05 * sin(uTime * 13.0));
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * a, a);
}`

export function FlareFlame({ position, height = 15 }: { position: [number, number, number]; height?: number }) {
  const camera = useThree((s) => s.camera)
  const flame = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const mats = useMemo(() => {
    const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, side: THREE.DoubleSide }
    return {
      flame: new THREE.ShaderMaterial({ uniforms: { uTime: envTime }, vertexShader: vert, fragmentShader: flameFrag, ...common }),
      glow: new THREE.ShaderMaterial({ uniforms: { uTime: envTime }, vertexShader: vert, fragmentShader: glowFrag, ...common }),
    }
  }, [])
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), [])
  const glowGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  useFrame((state) => {
    const t = (envTime.value = state.clock.elapsedTime)
    // cylindrical billboard (stays upright, faces the camera around Y)
    if (flame.current) {
      flame.current.rotation.set(0, Math.atan2(camera.position.x - position[0], camera.position.z - position[2]), 0)
    }
    if (glow.current) glow.current.quaternion.copy(camera.quaternion)
    if (light.current) light.current.intensity = 9000 * (0.85 + 0.15 * Math.sin(t * 17.0) * Math.sin(t * 7.3 + 1.0))
  })
  return (
    <group position={position}>
      <mesh ref={flame} geometry={geo} material={mats.flame} scale={[height * 0.55, height, 1]} renderOrder={5} frustumCulled={false} raycast={() => null} />
      <mesh ref={glow} geometry={glowGeo} material={mats.glow} position={[0, height * 0.35, 0]} scale={height * 2.2} renderOrder={4} raycast={() => null} />
      <pointLight ref={light} position={[0, height * 0.3, 0]} color="#ff8a3a" intensity={9000} distance={0} decay={2} />
    </group>
  )
}
