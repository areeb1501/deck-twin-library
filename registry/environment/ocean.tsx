// Animated open sea: Gerstner swell on a polar LOD grid, physical water with Fresnel, sun glints, whitecaps and foam rings; origin at mean sea level (ported from the Deck Twin app).
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { GroupProps } from '../lib/mesh'

export interface OceanProps {
  /** significant wave height Hs, m */
  waveHeight?: number
  /** wind speed at 10 m, m/s (chop and whitecaps) */
  wind?: number
  /** sea surface radius, m */
  radius?: number
  /** keep the dense centre of the grid under the camera */
  follow?: boolean
  /** darker water for night scenes */
  night?: boolean
  color?: string
  /** opacity looking straight down; grazing views are opaque */
  opacity?: number
  /** animation speed, 1 = real time */
  speed?: number
  /** foam ring centres [x, z, radius] in m, local frame (jacket legs, risers, piles) */
  foam?: [number, number, number][]
}

export const defaults = {
  waveHeight: 1.5,
  wind: 7,
  radius: 4000,
  follow: true,
  night: false,
  color: '#0c4a62',
  opacity: 0.8,
  speed: 1,
  foam: [] as [number, number, number][],
}

const FOAM_SLOTS = 32
const HS_REF = 1.5

const WAVES_GLSL = /* glsl */ `
const int NW = 6;
// dir.x, dir.z, amplitude (m at Hs 1.5 m), wavelength (m)
const vec4 WAVES[6] = vec4[6](
  vec4(0.94, 0.34, 0.50, 96.0),
  vec4(0.70, 0.71, 0.32, 58.0),
  vec4(0.99, -0.14, 0.20, 34.0),
  vec4(0.52, 0.85, 0.11, 19.5),
  vec4(0.86, -0.51, 0.065, 11.3),
  vec4(0.28, 0.96, 0.04, 6.7)
);
const float STEEP = 0.62;
uniform float uTime;
uniform float uAmp;
uniform float uChop;
uniform float uWhite;
uniform float uNight;
uniform float uOpacity;
uniform vec2 uOffset;
uniform mat3 uRot;
float waveFade(float L, float spacing) { return smoothstep(2.5 * spacing, 5.0 * spacing, L); }
float pixFade(float L, float pix) { return smoothstep(5.0 * pix, 14.0 * pix, L); }
vec3 gerstner(vec2 p, float t, float spacing, out float h) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < NW; i++) {
    vec4 w = WAVES[i];
    vec2 dir = normalize(w.xy);
    float k = 6.2831853 / w.w;
    float f = k * (dot(dir, p) - sqrt(9.81 / k) * t);
    float fade = waveFade(w.w, spacing);
    float q = STEEP * min(uAmp, 1.35) / (k * float(NW));
    d.xz += q * dir * cos(f) * fade;
    d.y += w.z * uAmp * fade * sin(f);
  }
  h = d.y;
  return d;
}
vec3 gerstnerNormal(vec2 p, float t, float pix) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < NW; i++) {
    vec4 w = WAVES[i];
    vec2 dir = normalize(w.xy);
    float k = 6.2831853 / w.w;
    float f = k * (dot(dir, p) - sqrt(9.81 / k) * t);
    float fade = pixFade(w.w, pix);
    float wa = k * w.z * uAmp * fade;
    n.x -= dir.x * wa * cos(f);
    n.z -= dir.y * wa * cos(f);
    n.y -= (STEEP * min(uAmp, 1.35) / float(NW)) * sin(f) * fade;
  }
  // wind chop (normal only)
  const vec4 DET[6] = vec4[6](
    vec4(0.80, 0.60, 0.030, 4.3), vec4(-0.30, 0.95, 0.020, 2.9), vec4(0.97, -0.25, 0.015, 2.05),
    vec4(0.45, -0.89, 0.010, 1.42), vec4(0.10, 0.99, 0.007, 0.97), vec4(0.70, 0.71, 0.005, 0.66)
  );
  for (int i = 0; i < 6; i++) {
    vec4 w = DET[i];
    vec2 dir = normalize(w.xy);
    float k = 6.2831853 / w.w;
    float f = k * dot(dir, p) - sqrt(9.81 * k) * t;
    float wa = k * w.z * uChop * pixFade(w.w, pix);
    n.x -= dir.x * wa * cos(f);
    n.z -= dir.y * wa * cos(f);
  }
  return normalize(n);
}
float oHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float oNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(oHash(i), oHash(i + vec2(1, 0)), u.x), mix(oHash(i + vec2(0, 1)), oHash(i + vec2(1, 1)), u.x), u.y);
}
float oFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * oNoise(p); p = p * 2.07 + 11.3; a *= 0.5; }
  return v;
}
`

function polarGrid(radius: number) {
  const segments = radius > 600 ? 384 : 256
  const rings = radius > 600 ? 190 : 120
  const first = Math.min(0.55, radius / 300)
  let lo = 1.000001
  let hi = 1.2
  for (let i = 0; i < 60; i++) {
    const q = (lo + hi) / 2
    if ((first * (Math.pow(q, rings) - 1)) / (q - 1) > radius) hi = q
    else lo = q
  }
  const q = (lo + hi) / 2
  const pos = new Float32Array((1 + rings * segments) * 3)
  let o = 3
  for (let n = 1; n <= rings; n++) {
    const r = (first * (Math.pow(q, n) - 1)) / (q - 1)
    const off = n % 2 ? 0.5 : 0
    for (let s = 0; s < segments; s++) {
      const a = ((s + off) / segments) * Math.PI * 2
      pos[o++] = Math.cos(a) * r
      pos[o++] = 0
      pos[o++] = Math.sin(a) * r
    }
  }
  const idx: number[] = []
  for (let s = 0; s < segments; s++) idx.push(0, 1 + ((s + 1) % segments), 1 + s)
  for (let n = 1; n < rings; n++) {
    const a0 = 1 + (n - 1) * segments
    const b0 = 1 + n * segments
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments
      idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s)
    }
  }
  const nor = new Float32Array(pos.length)
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setIndex(idx)
  g.computeBoundingBox()
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius)
  return g
}

type Uniforms = Record<'uTime' | 'uAmp' | 'uChop' | 'uWhite' | 'uNight' | 'uOpacity', { value: number }> & {
  uOffset: { value: THREE.Vector2 }
  uRot: { value: THREE.Matrix3 }
  uFoam: { value: THREE.Vector3[] }
}

function makeMaterial(u: Uniforms, nFoam: number) {
  const m = new THREE.MeshPhysicalMaterial({ color: defaults.color, roughness: 0.06, metalness: 0, ior: 1.333, transparent: true, envMapIntensity: 1 })
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vOWPos;\nvarying vec2 vLocal;\nvarying float vWaveH;\n${WAVES_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        {
          vec2 lp = position.xz + uOffset;
          vec4 wp0 = modelMatrix * vec4(position, 1.0);
          float camD = length(wp0.xz - cameraPosition.xz) + abs(cameraPosition.y - wp0.y) * 0.5;
          float spacing = 0.036 * length(position.xz) + 0.25;
          float h;
          vec3 d = gerstner(lp, uTime, spacing, h);
          d *= 1.0 - smoothstep(1200.0, 3200.0, camD);
          transformed += d;
          vLocal = lp + d.xz;
          vOWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWaveH = h / (1.25 * max(uAmp, 0.3));
        }`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n#define FOAM_N ${nFoam}\n${nFoam ? `uniform vec3 uFoam[${nFoam}];` : ''}\nvarying vec3 vOWPos;\nvarying vec2 vLocal;\nvarying float vWaveH;\n${WAVES_GLSL}\nfloat gFoam = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec2 p = vLocal;
          float ring = 0.0;
          #if FOAM_N > 0
          for (int i = 0; i < FOAM_N; i++) {
            float d = length(p - uFoam[i].xy) - uFoam[i].z;
            ring = max(ring, 1.0 - smoothstep(0.0, 3.2, d));
          }
          #endif
          float nn = oFbm(p * 0.85 + vec2(uTime * 0.21, uTime * 0.13));
          float nn2 = oFbm(p * 0.23 - vec2(uTime * 0.05, 0.0));
          float foam = smoothstep(0.42, 0.85, ring * (0.45 + nn));
          foam = max(foam, smoothstep(0.62 - 0.1 * uWhite, 1.0, vWaveH) * smoothstep(0.58 - 0.12 * uWhite, 0.78, nn2) * (0.25 + 0.6 * uWhite));
          vec3 V = normalize(cameraPosition - vOWPos);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
          vec3 water = mix(diffuseColor.rgb, vec3(0.06, 0.32, 0.33), clamp(vWaveH * 0.5 + 0.25, 0.0, 1.0) * 0.35);
          water *= mix(1.0, 0.3, uNight);
          diffuseColor.rgb = mix(water, vec3(0.74, 0.8, 0.82) * mix(1.0, 0.25, uNight), foam * 0.7);
          diffuseColor.a = mix(uOpacity, 1.0, max(clamp(fres * 2.0, 0.0, 1.0), foam));
          gFoam = foam;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.06, 0.24, smoothstep(40.0, 1800.0, length(cameraPosition - vOWPos))) + gFoam * 0.7;`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
        {
          float pix = length(fwidth(vLocal)) + 0.02;
          vec3 nW = gerstnerNormal(vLocal, uTime, pix);
          nW = normalize(mix(nW, vec3(0.0, 1.0, 0.0), gFoam * 0.6));
          normal = normalize((viewMatrix * vec4(normalize(uRot * nW), 0.0)).xyz);
          vec3 toEye = normalize(vViewPosition);
          vec3 up = normalize((viewMatrix * vec4(normalize(uRot * vec3(0.0, 1.0, 0.0)), 0.0)).xyz);
          normal = normalize(mix(normal, up, smoothstep(0.16, -0.04, dot(normal, toEye))));
          normal = normalize(normal + toEye * max(0.0, 0.05 - dot(normal, toEye)));
        }`,
      )
  }
  m.customProgramCacheKey = () => `deck-twin-ocean-${nFoam}`
  m.name = 'ocean'
  return m
}

const _v = new THREE.Vector3()

export function Ocean({
  waveHeight = defaults.waveHeight,
  wind = defaults.wind,
  radius = defaults.radius,
  follow = defaults.follow,
  night = defaults.night,
  color = defaults.color,
  opacity = defaults.opacity,
  speed = defaults.speed,
  foam = defaults.foam,
  ...group
}: OceanProps & GroupProps) {
  const ref = useRef<THREE.Mesh>(null)
  const camera = useThree((s) => s.camera)
  const nFoam = Math.min(FOAM_SLOTS, foam.length)
  const u = useMemo<Uniforms>(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 1 },
      uChop: { value: 1 },
      uWhite: { value: 0.3 },
      uNight: { value: 0 },
      uOpacity: { value: defaults.opacity },
      uOffset: { value: new THREE.Vector2() },
      uRot: { value: new THREE.Matrix3() },
      uFoam: { value: Array.from({ length: FOAM_SLOTS }, () => new THREE.Vector3(1e5, 1e5, 0)) },
    }),
    [],
  )
  const geometry = useMemo(() => polarGrid(Math.max(10, radius)), [radius])
  const material = useMemo(() => makeMaterial(u, nFoam), [u, nFoam])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.color.set(color)
    u.uAmp.value = Math.max(0.05, waveHeight / HS_REF)
    u.uChop.value = 0.55 + wind / 14
    u.uWhite.value = Math.min(1.4, Math.max(0, (wind - 4) / 10))
    u.uNight.value = night ? 1 : 0
    u.uOpacity.value = opacity
  }, [material, u, color, waveHeight, wind, night, opacity])
  const pool = useMemo(() => foam.map(([x, z, r]) => new THREE.Vector3(x, z, r)), [foam])
  const lastPick = useRef(new THREE.Vector2(1e9, 1e9))
  useEffect(() => {
    lastPick.current.set(1e9, 1e9)
  }, [pool])
  useFrame((_, dt) => {
    const m = ref.current
    if (!m?.parent) return
    u.uTime.value += Math.min(dt, 0.1) * speed
    _v.copy(camera.position)
    m.parent.worldToLocal(_v)
    if (follow) m.position.set(_v.x, 0, _v.z)
    else m.position.set(0, 0, 0)
    u.uOffset.value.set(m.position.x, m.position.z)
    m.updateMatrixWorld()
    u.uRot.value.setFromMatrix4(m.matrixWorld)
    if (pool.length && Math.hypot(_v.x - lastPick.current.x, _v.z - lastPick.current.y) > 8) {
      lastPick.current.set(_v.x, _v.z)
      const near = pool.length > FOAM_SLOTS ? [...pool].sort((a, b) => Math.hypot(a.x - _v.x, a.y - _v.z) - Math.hypot(b.x - _v.x, b.y - _v.z)) : pool
      for (let i = 0; i < nFoam; i++) u.uFoam.value[i].copy(near[i])
    }
  })
  return (
    <group {...group}>
      <mesh ref={ref} geometry={geometry} material={material} receiveShadow frustumCulled={false} renderOrder={-1} raycast={() => null} userData={{ noFit: true }} name="Ocean" />
    </group>
  )
}

export default Ocean
