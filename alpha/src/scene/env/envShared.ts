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
export const HAZE = new THREE.Color('#c3d3df')
/** Deep-water colour used for the underwater tint and the backdrop below the horizon. */
export const DEEP = new THREE.Color('#0a2e3a')
export const FOG_DENSITY = 0.00042

/** Global environment clock shared by ocean, flare, vessel. */
export const envTime = { value: 0 }

const UNDERWATER = /* glsl */ `
float uwD = clamp(-vUwPos.y, 0.0, 400.0);
float uwK = 1.0 - exp(-uwD / 8.0);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeep * (0.55 + 0.45 * exp(-uwD / 25.0)), uwK);
`

const SPLASH = /* glsl */ `
{
  float sz = smoothstep(-3.0, -1.6, vUwPos.y) * (1.0 - smoothstep(3.2, 4.6, vUwPos.y));
  vec2 q = floor(vUwPos.xz * 6.0 + vUwPos.y * 4.0);
  float h = fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453);
  vec3 growth = mix(vec3(0.09, 0.09, 0.06), vec3(0.20, 0.19, 0.14), h);
  diffuseColor.rgb = mix(diffuseColor.rgb, growth, sz * 0.9);
  // rust streaking just above the splash zone
  float rs = smoothstep(3.5, 4.5, vUwPos.y) * (1.0 - smoothstep(4.5, 9.0, vUwPos.y)) * step(0.72, h);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.17, 0.08), rs * 0.35);
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
    if (splash) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + SPLASH)
  }
  m.customProgramCacheKey = () => (splash ? 'uw-splash' : 'uw')
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
