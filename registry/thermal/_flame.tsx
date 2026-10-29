// Animated flare flame: noise-driven camera-facing billboard plus a soft glow, sized by flame height in metres.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { V3 } from '../lib/kit'

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const frag = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
void main() {
  float y = vUv.y;
  float x = (vUv.x - 0.5) - y * y * 0.18;
  float n = fbm(vec2(x * 3.0, y * 2.2 - uTime * 2.6));
  float n2 = fbm(vec2(x * 6.0 + 3.0, y * 4.0 - uTime * 4.0));
  float width = mix(0.14, 0.3, smoothstep(0.0, 0.45, y)) * (1.0 - smoothstep(0.55, 1.0, y) * 0.75);
  float d = abs(x) / max(width, 1e-3);
  float body = 1.0 - smoothstep(0.35, 1.0, d + (n - 0.5) * 1.1);
  body *= smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.55 + n * 0.35, 0.98, y));
  float core = (1.0 - smoothstep(0.0, 0.55, d + (n2 - 0.5) * 0.6)) * (1.0 - smoothstep(0.1, 0.45, y));
  vec3 col = mix(vec3(0.95, 0.22, 0.03), vec3(1.0, 0.5, 0.1), n);
  col = mix(col, vec3(1.0, 0.88, 0.6), core);
  float a = clamp(body * (0.65 + 0.5 * n2) + core * 0.6, 0.0, 1.0);
  gl_FragColor = vec4(col * a * 1.3, a);
}`

const glowFrag = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() { float r = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - r, 0.0), 2.2) * (0.3 + 0.05 * sin(uTime * 13.0));
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * a, a); }`

const tmp = new THREE.Vector3()

export function Flame({ position, height = 8 }: { position: V3; height?: number }) {
  const flame = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)
  const { mats, geo, glowGeo } = useMemo(() => {
    const uTime = { value: 0 }
    const common = { transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }
    return {
      mats: {
        uTime,
        flame: new THREE.ShaderMaterial({ uniforms: { uTime }, vertexShader: vert, fragmentShader: frag, ...common, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }),
        glow: new THREE.ShaderMaterial({ uniforms: { uTime }, vertexShader: vert, fragmentShader: glowFrag, ...common, blending: THREE.AdditiveBlending }),
      },
      geo: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
      glowGeo: new THREE.PlaneGeometry(1, 1),
    }
  }, [])
  useEffect(() => () => [mats.flame, mats.glow, geo, glowGeo].forEach((o) => o.dispose()), [mats, geo, glowGeo])
  useFrame((state) => {
    mats.uTime.value = state.clock.elapsedTime
    const cam = state.camera
    if (flame.current) {
      const wp = flame.current.getWorldPosition(tmp)
      flame.current.rotation.y = Math.atan2(cam.position.x - wp.x, cam.position.z - wp.z)
    }
    if (glow.current) glow.current.quaternion.copy(cam.quaternion)
  })
  return (
    <group position={position}>
      <mesh ref={flame} geometry={geo} material={mats.flame} scale={[height * 0.55, height, 1]} renderOrder={5} frustumCulled={false} raycast={() => null} />
      <mesh ref={glow} geometry={glowGeo} material={mats.glow} position={[0, height * 0.35, 0]} scale={height * 2} renderOrder={4} frustumCulled={false} raycast={() => null} />
      <pointLight position={[0, height * 0.3, 0]} color="#ff8a3a" intensity={height * height * 30} distance={height * 8} decay={2} />
    </group>
  )
}
