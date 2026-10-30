/**
 * Ocean: camera-following polar LOD grid (dense under the camera, 4 km radius) displaced by
 * Gerstner waves in the vertex shader of a MeshPhysicalMaterial (onBeforeCompile), so env-map
 * reflections, Fresnel (ior 1.333), sun glints, fog, shadows and tone mapping all come for free.
 * Per-pixel analytic normals + small detail waves; waves fade with grid spacing / pixel footprint
 * (no swimming or aliasing). Foam rings around the jacket legs, conductors, risers, boat landing.
 *
 * Material role 'env' -> never clipped. Slightly transparent looking down so the (tinted)
 * underwater jacket reads through.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { registerMaterial } from '../../three/materials'
import { DEEP, envTime } from './envShared'
import { foamPoints } from './jacket'

const MAX_FOAM = 24

const WAVES_GLSL = /* glsl */ `
const int NW = 6;
// dir.x, dir.z, amplitude (m), wavelength (m)
const vec4 WAVES[6] = vec4[6](
  vec4(0.94, 0.34, 0.50, 96.0),
  vec4(0.70, 0.71, 0.32, 58.0),
  vec4(0.99, -0.14, 0.20, 34.0),
  vec4(0.52, 0.85, 0.11, 19.5),
  vec4(0.86, -0.51, 0.065, 11.3),
  vec4(0.28, 0.96, 0.04, 6.7)
);
const float STEEP = 0.62;
float waveFade(float L, float spacing) { return smoothstep(2.5 * spacing, 5.0 * spacing, L); }
float pixFade(float L, float pix) { return smoothstep(5.0 * pix, 14.0 * pix, L); }
vec3 gerstner(vec2 p, float t, float spacing, out float h) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < NW; i++) {
    vec4 w = WAVES[i];
    vec2 dir = normalize(w.xy);
    float k = 6.2831853 / w.w;
    float c = sqrt(9.81 / k);
    float f = k * (dot(dir, p) - c * t);
    float a = w.z * waveFade(w.w, spacing);
    float q = STEEP / (k * float(NW));
    d.xz += q * dir * cos(f) * waveFade(w.w, spacing);
    d.y += a * sin(f);
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
    float c = sqrt(9.81 / k);
    float f = k * (dot(dir, p) - c * t);
    float fade = pixFade(w.w, pix);
    float wa = k * w.z * fade;
    n.x -= dir.x * wa * cos(f);
    n.z -= dir.y * wa * cos(f);
    n.y -= (STEEP / float(NW)) * sin(f) * fade;
  }
  // capillary / wind-chop detail (normal only)
  const vec4 DET[6] = vec4[6](
    vec4(0.80, 0.60, 0.030, 4.3), vec4(-0.30, 0.95, 0.020, 2.9), vec4(0.97, -0.25, 0.015, 2.05),
    vec4(0.45, -0.89, 0.010, 1.42), vec4(0.10, 0.99, 0.007, 0.97), vec4(0.70, 0.71, 0.005, 0.66)
  );
  for (int i = 0; i < 6; i++) {
    vec4 w = DET[i];
    vec2 dir = normalize(w.xy);
    float k = 6.2831853 / w.w;
    float f = k * dot(dir, p) - sqrt(9.81 * k) * t * 1.0;
    float wa = k * w.z * pixFade(w.w, pix);
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

function polarGrid(segments = 384, rings = 190, radius = 4000, first = 0.55) {
  // ring radii r_n = first * (q^n - 1) / (q - 1); solve q for r_rings = radius
  let lo = 1.0001
  let hi = 1.2
  for (let i = 0; i < 60; i++) {
    const q = (lo + hi) / 2
    const r = (first * (Math.pow(q, rings) - 1)) / (q - 1)
    if (r > radius) hi = q
    else lo = q
  }
  const q = (lo + hi) / 2
  const pos: number[] = [0, 0, 0]
  const idx: number[] = []
  for (let n = 1; n <= rings; n++) {
    const r = (first * (Math.pow(q, n) - 1)) / (q - 1)
    const off = n % 2 ? 0.5 : 0 // stagger rings -> nicer triangles
    for (let s = 0; s < segments; s++) {
      const a = ((s + off) / segments) * Math.PI * 2
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r)
    }
  }
  for (let s = 0; s < segments; s++) idx.push(0, 1 + ((s + 1) % segments), 1 + s)
  for (let n = 1; n < rings; n++) {
    const a0 = 1 + (n - 1) * segments
    const b0 = 1 + n * segments
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments
      idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const nor = new Float32Array(pos.length)
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setIndex(idx)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius)
  return g
}

function makeOceanMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#0d3d4b',
    roughness: 0.06,
    metalness: 0,
    ior: 1.333,
    transparent: true,
    envMapIntensity: 1.0,
  })
  const pts = foamPoints().slice(0, MAX_FOAM)
  const foam = Array.from({ length: MAX_FOAM }, (_, i) => new THREE.Vector3(...(pts[i] ?? [1e5, 1e5, 0])))
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = envTime
    sh.uniforms.uFoam = { value: foam }
    sh.uniforms.uDeep = { value: DEEP }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec3 vOWPos;\nvarying float vWaveH;\n${WAVES_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        {
          vec4 wp0 = modelMatrix * vec4(position, 1.0);
          float camD = length(wp0.xz - cameraPosition.xz) + abs(cameraPosition.y) * 0.5;
          float spacing = 0.036 * length(position.xz) + 0.25;
          float h;
          vec3 d = gerstner(wp0.xz, uTime, spacing, h);
          d *= 1.0 - smoothstep(1200.0, 3200.0, camD);
          transformed += d;
          vOWPos = wp0.xyz + d;
          vWaveH = h / 1.25;
        }`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uTime;\nuniform vec3 uFoam[${MAX_FOAM}];\nuniform vec3 uDeep;\nvarying vec3 vOWPos;\nvarying float vWaveH;\n${WAVES_GLSL}\nfloat gFoam = 0.0;\nfloat gFres = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec2 p = vOWPos.xz;
          float ring = 0.0;
          for (int i = 0; i < ${MAX_FOAM}; i++) {
            float d = length(p - uFoam[i].xy) - uFoam[i].z;
            ring = max(ring, 1.0 - smoothstep(0.0, 3.2, d));
          }
          float nn = oFbm(p * 0.85 + vec2(uTime * 0.21, uTime * 0.13));
          float nn2 = oFbm(p * 0.23 - vec2(uTime * 0.05, 0.0));
          float foam = smoothstep(0.42, 0.85, ring * (0.45 + nn));
          foam = max(foam, smoothstep(0.62, 1.0, vWaveH) * smoothstep(0.58, 0.78, nn2) * 0.55);
          vec3 V = normalize(cameraPosition - vOWPos);
          gFres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
          vec3 water = mix(diffuseColor.rgb, vec3(0.06, 0.32, 0.33), clamp(vWaveH * 0.5 + 0.25, 0.0, 1.0) * 0.35);
          diffuseColor.rgb = mix(water, vec3(0.74, 0.8, 0.82), foam * 0.7);
          diffuseColor.a = mix(0.84, 1.0, max(clamp(gFres * 2.0, 0.0, 1.0), foam));
          gFoam = foam;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        {
          float dist = length(cameraPosition - vOWPos);
          roughnessFactor = mix(0.04, 0.24, smoothstep(40.0, 1800.0, dist)) + gFoam * 0.7;
        }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
        {
          float pix = length(fwidth(vOWPos.xz)) + 0.02;
          vec3 nW = gerstnerNormal(vOWPos.xz, uTime, pix);
          nW = normalize(mix(nW, vec3(0.0, 1.0, 0.0), gFoam * 0.6));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'ocean-v1'
  m.name = 'env-ocean'
  registerMaterial(m, 'env')
  return m
}

export function Ocean() {
  const ref = useRef<THREE.Mesh>(null)
  const camera = useThree((s) => s.camera)
  const geometry = useMemo(() => polarGrid(), [])
  const material = useMemo(() => makeOceanMaterial(), [])
  useFrame((state) => {
    envTime.value = state.clock.elapsedTime
    const m = ref.current
    if (m) m.position.set(camera.position.x, 0, camera.position.z)
  })
  return <mesh ref={ref} geometry={geometry} material={material} receiveShadow frustumCulled={false} renderOrder={-1} raycast={() => null} name="Ocean" />
}

export default Ocean
