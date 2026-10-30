/**
 * Animated flare flame: noise-driven emissive billboard + soft glow + flickering point light, sized by
 * the live flare rate (`result.flare`, MMscfd):
 *
 *   purge / pilots 0.4 MMscfd → ~5 m · 10 → ~16 m · compressor trip ~76 → ~32 m · blowdown 150 → ~41 m
 *
 * The flame eases to the new size (~1 s up, ~2 s down); brightness, glow and the light grow with it.
 * Above ~30 MMscfd a dark smoke plume fades in over the flame; at very high rates, or while the
 * blowdown inventory is falling, the tip glows white-hot with a fast heat-shimmer flicker.
 * Pass `rate` to pin the flame to a fixed rate (otherwise it follows the simulation).
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { envTime } from './envShared'
import { blowdownInventory, flareRate, PURGE_MMSCFD } from '../fx/simRead'

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const flameFrag = /* glsl */ `
uniform float uTime;
uniform float uGain;
uniform float uHot;
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
  // heat shimmer: fine fast ripple across the flame while it roars
  p.x += sin(y * 46.0 + uTime * 31.0) * 0.008 * uHot;
  // wind lean: flame bends towards +u with height
  float x = (p.x - 0.5) - y * y * 0.18;
  float spd = 2.6 + 1.6 * uHot;
  float n = fbm(vec2(x * 3.0, y * 2.2 - uTime * spd));
  float n2 = fbm(vec2(x * 6.0 + 3.0, y * 4.0 - uTime * spd * 1.6));
  float width = mix(0.16, 0.30, smoothstep(0.0, 0.45, y)) * (1.0 - smoothstep(0.55, 1.0, y) * 0.75);
  float d = abs(x) / max(width, 1e-3);
  float body = 1.0 - smoothstep(0.35, 1.0, d + (n - 0.5) * 1.1);
  body *= smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.55 + n * 0.35, 0.98, y));
  float core = (1.0 - smoothstep(0.0, 0.55 + 0.15 * uHot, d + (n2 - 0.5) * 0.6)) * (1.0 - smoothstep(0.1, 0.45 + 0.15 * uHot, y));
  vec3 col = mix(vec3(0.95, 0.22, 0.03), vec3(1.0, 0.5, 0.1), n);
  col = mix(col, mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.95, 0.85), uHot), core);
  float a = clamp(body * (0.65 + 0.5 * n2) + core * 0.6, 0.0, 1.0);
  gl_FragColor = vec4(col * a * 1.25 * uGain, a);
}`

const glowFrag = /* glsl */ `
uniform float uTime;
uniform float uGain;
uniform vec3 uColor;
uniform float uFlick;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = pow(max(1.0 - r, 0.0), 2.2) * (0.32 + 0.05 * sin(uTime * 13.0) + uFlick * 0.12 * sin(uTime * 41.0) * sin(uTime * 23.0 + 1.3)) * uGain;
  gl_FragColor = vec4(uColor * a, a);
}`

const smokeFrag = /* glsl */ `
uniform float uTime;
uniform float uSmoke;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.07 + 11.3; a *= 0.5; }
  return v;
}
void main() {
  float y = vUv.y;
  // plume drifts down-wind (+u) and widens as it rises
  float x = (vUv.x - 0.5) - y * 0.22;
  float w = mix(0.12, 0.42, y);
  float n = fbm(vec2(x * 3.5, y * 2.4 - uTime * 0.55));
  float d = abs(x) / w + (n - 0.5) * 0.9;
  float body = (1.0 - smoothstep(0.3, 1.0, d)) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.55, 1.0, y));
  float a = clamp(body * (0.6 + 0.6 * n), 0.0, 1.0) * uSmoke * 0.85;
  vec3 col = mix(vec3(0.05, 0.045, 0.04), vec3(0.17, 0.155, 0.14), n);
  gl_FragColor = vec4(col, a);
}`

/** flame height (m) for a flare rate (MMscfd): ~16 m at 10 MMscfd, sub-linear, 3.5 … 42 m */
function flameHeight(q: number) {
  return THREE.MathUtils.clamp(16 * Math.pow(Math.max(q, 0.05) / 10, 0.35), 3.5, 42)
}

const H_NOMINAL = 16
const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b)

export function FlareFlame({ position, rate }: { position: [number, number, number]; rate?: number }) {
  const camera = useThree((s) => s.camera)
  const flame = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)
  const tip = useRef<THREE.Mesh>(null)
  const smoke = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  // eased state: flame height, smoke amount, white-hot tip; blowdown tracking
  const st = useRef({ h: flameHeight(rate ?? PURGE_MMSCFD), smoke: 0, hot: 0, bdPrev: NaN, bdFallAt: -1e9 })
  const mats = useMemo(() => {
    const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, side: THREE.DoubleSide }
    return {
      // premultiplied "over" blending: the flame keeps its orange against a bright sky (pure additive washes
      // out to white there) and still brightens what's behind it where it's thin
      flame: new THREE.ShaderMaterial({
        uniforms: { uTime: envTime, uGain: { value: 1 }, uHot: { value: 0 } },
        vertexShader: vert,
        fragmentShader: flameFrag,
        ...common,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
      glow: new THREE.ShaderMaterial({
        uniforms: { uTime: envTime, uGain: { value: 1 }, uColor: { value: new THREE.Color(1.0, 0.55, 0.2) }, uFlick: { value: 0 } },
        vertexShader: vert,
        fragmentShader: glowFrag,
        ...common,
      }),
      tip: new THREE.ShaderMaterial({
        uniforms: { uTime: envTime, uGain: { value: 0 }, uColor: { value: new THREE.Color(2.4, 2.0, 1.5) }, uFlick: { value: 1 } },
        vertexShader: vert,
        fragmentShader: glowFrag,
        ...common,
      }),
      smoke: new THREE.ShaderMaterial({
        uniforms: { uTime: envTime, uSmoke: { value: 0 } },
        vertexShader: vert,
        fragmentShader: smokeFrag,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      }),
    }
  }, [])
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), [])
  const glowGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const t = (envTime.value = state.clock.elapsedTime)
    const s = st.current
    const q = rate ?? flareRate()
    // ease the flame to the new size: quick to roar up, slower to die back
    const target = flameHeight(q)
    s.h += (target - s.h) * Math.min(1, dt * (target > s.h ? 1.4 : 0.6))
    // blowdown: inventory falling → the tip runs white-hot
    const bd = blowdownInventory()
    if (bd !== undefined) {
      if (Number.isFinite(s.bdPrev) && bd < s.bdPrev - 1e-4) s.bdFallAt = t
      s.bdPrev = bd
    }
    const blowingDown = t - s.bdFallAt < 2.5
    const hotT = Math.max(smooth(55, 140, q), blowingDown ? 1 : 0)
    s.hot += (hotT - s.hot) * Math.min(1, dt * 1.5)
    const smokeT = smooth(25, 120, q)
    s.smoke += (smokeT - s.smoke) * Math.min(1, dt * 0.8)

    const h = s.h
    const k = h / H_NOMINAL
    mats.flame.uniforms.uGain.value = 0.75 + 0.35 * Math.min(1.6, k) + 0.25 * s.hot
    mats.flame.uniforms.uHot.value = s.hot
    const yaw = Math.atan2(camera.position.x - position[0], camera.position.z - position[2])
    if (flame.current) {
      // cylindrical billboard (stays upright, faces the camera around Y)
      flame.current.rotation.set(0, yaw, 0)
      flame.current.scale.set(h * 0.55, h, 1)
    }
    if (smoke.current) {
      smoke.current.visible = s.smoke > 0.01
      smoke.current.rotation.set(0, yaw, 0)
      smoke.current.position.set(0, h * 0.5, 0)
      smoke.current.scale.set(h * 1.1, h * 1.5, 1)
      mats.smoke.uniforms.uSmoke.value = s.smoke
    }
    // glow grows sub-linearly so a big flame doesn't wash out the sky
    const gs = 35 * Math.pow(k, 0.6)
    if (glow.current) {
      glow.current.quaternion.copy(camera.quaternion)
      glow.current.position.set(0, h * 0.35, 0)
      glow.current.scale.setScalar(gs)
    }
    mats.glow.uniforms.uGain.value = 0.7 + 0.3 * Math.min(1.5, k) + 0.3 * s.hot
    if (tip.current) {
      tip.current.visible = s.hot > 0.01
      tip.current.quaternion.copy(camera.quaternion)
      tip.current.position.set(0, 1.2 + h * 0.06, 0)
      tip.current.scale.setScalar(5 + h * 0.3)
    }
    mats.tip.uniforms.uGain.value = s.hot * 1.4
    if (light.current) {
      light.current.position.set(0, h * 0.3, 0)
      const flick = 0.85 + 0.15 * Math.sin(t * 17.0) * Math.sin(t * 7.3 + 1.0)
      light.current.intensity = Math.min(42000, 9000 * Math.pow(k, 1.5)) * (1 + 0.4 * s.hot) * flick
    }
  })
  const h0 = flameHeight(rate ?? PURGE_MMSCFD)
  return (
    <group position={position}>
      <mesh ref={flame} geometry={geo} material={mats.flame} scale={[h0 * 0.55, h0, 1]} renderOrder={5} frustumCulled={false} raycast={() => null} />
      <mesh ref={smoke} geometry={geo} material={mats.smoke} renderOrder={6} frustumCulled={false} visible={false} raycast={() => null} />
      <mesh ref={glow} geometry={glowGeo} material={mats.glow} position={[0, h0 * 0.35, 0]} scale={h0 * 2.2} renderOrder={4} frustumCulled={false} raycast={() => null} />
      <mesh ref={tip} geometry={glowGeo} material={mats.tip} renderOrder={6} frustumCulled={false} visible={false} raycast={() => null} />
      <pointLight ref={light} position={[0, h0 * 0.3, 0]} color="#ff8a3a" intensity={9000} distance={0} decay={2} />
    </group>
  )
}
