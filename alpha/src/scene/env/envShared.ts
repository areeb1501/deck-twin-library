/**
 * Shared environment constants + materials (role 'env': never clipped by the section box).
 */
import * as THREE from 'three'
import { registerMaterial } from '../../three/materials'

/** Unit vector towards the sun: mid-morning, ESE, ~33 deg elevation (rakes in under the upper deck). */
const EL = THREE.MathUtils.degToRad(33)
const AZ = THREE.MathUtils.degToRad(22) // from east towards south
export const SUN_DIR = new THREE.Vector3(Math.cos(EL) * Math.cos(AZ), Math.sin(EL), Math.cos(EL) * Math.sin(AZ)).normalize()

/** Haze / fog colour == sky colour at the horizon (linear-sRGB Color). */
export const HAZE = new THREE.Color('#a8c8e4')
/** Deep-water colour used for the underwater tint and the backdrop below the horizon. */
export const DEEP = new THREE.Color('#0a2e3a')
export const FOG_DENSITY = 0.0003

/** Global environment clock shared by ocean, flare, vessel. */
export const envTime = { value: 0 }
/** 0 = day … 1 = night, eased by SkyAndLights; for unlit env shaders (vent plumes) that must darken */
export const envNight = { value: 0 }

const UNDERWATER = /* glsl */ `
float uwD = clamp(-vUwPos.y, 0.0, 400.0);
float uwK = 1.0 - exp(-uwD / 8.0);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeep * (0.55 + 0.45 * exp(-uwD / 25.0)), uwK);
`

/** value noise (smooth, 3-D, world metres) for the splash-zone / marine-growth shading */
const UW_NOISE = /* glsl */ `
float uwHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float uwNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(uwHash(i), uwHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(uwHash(i + vec3(0.0, 1.0, 0.0)), uwHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(uwHash(i + vec3(0.0, 0.0, 1.0)), uwHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(uwHash(i + vec3(0.0, 1.0, 1.0)), uwHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
// 3 octaves on rotated lattices (no axis-aligned blotches), ~0..1
float uwFbm(vec3 p) {
  const mat3 R = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
  float n = 0.5 * uwNoise(p);
  p = R * p * 2.03;
  n += 0.3 * uwNoise(p);
  p = R * p * 2.01;
  n += 0.2 * uwNoise(p);
  return n;
}
`

/**
 * Splash zone + marine growth on jacket steel (world y; sea level 0):
 *  - above +5 m: the member's own paint, with thin rust weeps just above the coating line;
 *  - -3 .. +5 m: dark glass-flake epoxy splash-zone coating (sharp painted top edge), salt-chalked above
 *    the tide band, and a crusty barnacle / dried-weed tide band from about -1 to +1.2 m;
 *  - below about -2 m (patchy edge): marine growth - olive hard growth (mussels, barnacles with pale
 *    shell specks) near the surface turning to greener, thinner soft growth with depth; matte, rough,
 *    with a procedural bump that fades out with distance.
 * Writes uwCoat / uwGrowth / uwBumpH (main scope) for the roughness, metalness and normal patches.
 */
const SPLASH = /* glsl */ `
float uwCoat = 0.0;
float uwGrowth = 0.0;
float uwBumpH = 0.0;
{
  vec3 wp = vUwPos;
  float y = wp.y;
  float nA = uwFbm(wp * vec3(0.45, 0.8, 0.45));
  float nB = uwFbm(wp * 2.1 + 11.7);
  float nC = uwFbm(wp * 6.7 + 3.1);
  float cTop = 5.0 + (nA - 0.5) * 0.08;
  uwCoat = 1.0 - smoothstep(cTop - 0.02, cTop + 0.02, y);
  vec3 coatCol = mix(vec3(0.07, 0.068, 0.064), vec3(0.115, 0.108, 0.098), nB);
  coatCol = mix(coatCol, vec3(0.28, 0.27, 0.25), smoothstep(1.4, 4.8, y) * smoothstep(0.5, 0.75, nB * 0.7 + nC * 0.3) * 0.28);
  float tide = smoothstep(-0.9, -0.4, y) * (1.0 - smoothstep(0.5, 1.1, y + (nA - 0.5) * 0.4));
  float tideSpots = smoothstep(0.38, 0.62, nC * 0.6 + nB * 0.4);
  coatCol = mix(coatCol, mix(vec3(0.27, 0.26, 0.23), vec3(0.36, 0.35, 0.31), nC), tide * tideSpots * 0.75);
  float weed = smoothstep(-0.7, -0.2, y) * (1.0 - smoothstep(0.1, 0.45, y + (nB - 0.5) * 0.3));
  coatCol = mix(coatCol, vec3(0.11, 0.14, 0.07), weed * smoothstep(0.35, 0.6, nB) * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, coatCol, uwCoat);
  float streak = uwNoise(vec3(wp.x * 4.0, wp.y * 0.18, wp.z * 4.0) + 5.0);
  float rs = smoothstep(cTop, cTop + 0.12, y) * (1.0 - smoothstep(cTop + 0.5, cTop + 3.5, y)) * smoothstep(0.68, 0.88, streak);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.2, 0.1), rs * 0.4);
  float gEdge = -1.9 + (nA - 0.5) * 1.6 + (nB - 0.5) * 0.6;
  float gMask = 1.0 - smoothstep(gEdge - 0.3, gEdge + 0.3, y);
  float deep = smoothstep(-6.0, -40.0, y);
  float patchy = smoothstep(0.3, 0.6, nA * 0.55 + nB * 0.45);
  uwGrowth = gMask * mix(0.8 + 0.2 * patchy, 0.5 + 0.3 * patchy, deep);
  vec3 hard = mix(vec3(0.08, 0.09, 0.055), vec3(0.2, 0.21, 0.13), smoothstep(0.3, 0.7, nB));
  hard = mix(hard, vec3(0.29, 0.28, 0.24), smoothstep(0.6, 0.74, nC) * 0.45);
  vec3 soft = mix(vec3(0.11, 0.17, 0.1), vec3(0.21, 0.26, 0.16), smoothstep(0.3, 0.7, nB));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(hard, soft, deep), uwGrowth);
  uwBumpH = uwGrowth * (nC * 0.7 + nB * 0.3) * (1.0 - 0.6 * deep) + tide * tideSpots * uwCoat * 0.45 * nC;
}
`
const SPLASH_ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.42, uwCoat);
roughnessFactor = mix(roughnessFactor, 0.96, uwGrowth);
`
const SPLASH_METAL = /* glsl */ `
metalnessFactor = mix(metalnessFactor, 0.0, max(uwCoat, uwGrowth));
`
/** derivative bump from uwBumpH (three's perturbNormalArb), faded out beyond ~45 m to avoid shimmer */
const SPLASH_BUMP = /* glsl */ `
{
  float uwBF = 1.0 - smoothstep(10.0, 45.0, length(vViewPosition));
  vec2 uwDH = vec2(dFdx(uwBumpH), dFdy(uwBumpH)) * 1.6 * uwBF;
  vec3 uwSX = normalize(dFdx(-vViewPosition));
  vec3 uwSY = normalize(dFdy(-vViewPosition));
  vec3 uwR1 = cross(uwSY, normal);
  vec3 uwR2 = cross(normal, uwSX);
  float uwDet = dot(uwSX, uwR1) * faceDirection;
  vec3 uwGrad = sign(uwDet) * (uwDH.x * uwR1 + uwDH.y * uwR2);
  normal = normalize(abs(uwDet) * normal - uwGrad);
}
`

/** Add depth-based underwater tint (and optional splash-zone marine growth) to a standard material. */
export function withUnderwater<T extends THREE.MeshStandardMaterial>(m: T, splash = false): T {
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r)
    sh.uniforms.uDeep = { value: DEEP }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUwPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvUwPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUwPos;\nuniform vec3 uDeep;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + UNDERWATER)
    if (splash)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + UW_NOISE)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + SPLASH)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + SPLASH_ROUGH)
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + SPLASH_METAL)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SPLASH_BUMP)
  }
  m.customProgramCacheKey = () => (splash ? 'uw-splash3' : 'uw')
  return m
}

const cache = new Map<string, THREE.MeshStandardMaterial>()
/** Cached env material. All env materials get the underwater tint (cheap; only matters below y=0). */
export function envMat(
  name: string,
  p: THREE.MeshStandardMaterialParameters & { physical?: THREE.MeshPhysicalMaterialParameters },
  opts: { splash?: boolean; underwater?: boolean } = {},
) {
  let m = cache.get(name)
  if (m) return m
  const { physical, ...rest } = p
  m = physical ? new THREE.MeshPhysicalMaterial({ ...rest, ...physical }) : new THREE.MeshStandardMaterial(rest)
  m.name = `env-${name}`
  if (opts.underwater !== false) withUnderwater(m, !!opts.splash)
  registerMaterial(m, 'env')
  cache.set(name, m)
  return m
}

export const noRaycast = () => null
