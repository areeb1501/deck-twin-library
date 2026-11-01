/**
 * Structure-specific material variants. All derived from the shared library and re-registered
 * (role 'structure') so x-ray and the section box keep working. NOTE: Material.clone() deep-copies
 * clippingPlanes, which is why every clone goes through registerMaterial (re-links sectionPlanes).
 */
import * as THREE from 'three'
import { age, materials, paint, registerMaterial, type MaterialRole } from '../../three/materials'
import { gratingAlpha, gratingShadowDither, signAtlas } from './textures'

/** Layer used by shadow-only proxies (the sun's shadow camera enables it; main camera doesn't). */
export const SHADOW_PROXY_LAYER = 7

/**
 * Patch a grating material so it reads correctly at every distance:
 *  - mip-aware alpha boost keeps bars from vanishing as mipmaps average them out;
 *  - at grazing view angles (and at long range) the 30 mm-deep bars visually close up, so alpha
 *    is pushed to 1 and colour darkened slightly (cavity shading).
 */
export function patchGrating(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <alphatest_fragment>',
      /* glsl */ `
#ifdef USE_ALPHAMAP
      {
        vec2 tuv = vAlphaMapUv * 512.0;
        vec2 ddx = dFdx(tuv);
        vec2 ddy = dFdy(tuv);
        float lod = 0.5 * log2(max(max(dot(ddx, ddx), dot(ddy, ddy)), 1e-6));
        diffuseColor.a = clamp(diffuseColor.a * (1.0 + max(lod, 0.0) * 0.55), 0.0, 1.0);
        vec3 gN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        float ndv = abs(dot(gN, normalize(vViewPosition)));
        float closed = 1.0 - smoothstep(0.07, 0.3, ndv);
        float far = smoothstep(3.0, 4.6, lod);
        float solid = max(closed, far);
        diffuseColor.a = mix(diffuseColor.a, 1.0, solid);
        diffuseColor.rgb *= mix(1.0, 0.58, solid);
      }
#endif
#include <alphatest_fragment>`,
    )
  }
  m.customProgramCacheKey = () => 'grating-v2'
  m.needsUpdate = true
  return m
}

export interface StructMats {
  steel: THREE.Material
  steelDark: THREE.Material
  grating: THREE.Material
  gratingShadow: THREE.Material
  plate: THREE.Material
  yellow: THREE.Material
  green: THREE.Material
  tray: THREE.Material
  cable: THREE.Material
  walkway: THREE.Material
  atlas: THREE.Material
  lamp: THREE.Material
  lampBody: THREE.Material
  buoyOrange: THREE.Material
  buoyWhite: THREE.Material
  galv: THREE.Material
  drain: THREE.Material
}

const cache = new Map<MaterialRole, StructMats>()

/**
 * role 'structure' -> plant materials (clipped, x-ray). role 'env' -> same looks but unclipped,
 * used by Surroundings (cellar deck, topsides) so the section box never cuts the environment.
 */
export function structMats(role: 'structure' | 'env' = 'structure'): StructMats {
  const hit = cache.get(role)
  if (hit) return hit
  const lib = materials()
  const reg = <T extends THREE.Material>(m: T, name: string): T => {
    m.name = name
    if (role === 'env') m.clippingPlanes = null
    registerMaterial(m, role)
    return m
  }
  // a clone keeps the look but not the shader patch: environment steel is aged here
  const pick = (m: THREE.MeshStandardMaterial, name: string) => {
    if (role === 'structure') return m
    const c = reg(m.clone(), name + '-env')
    age(c)
    return c
  }

  const grating = reg(lib.grating.clone(), `grating-${role}`)
  grating.alphaMap = gratingAlpha()
  grating.alphaTest = 0.5
  grating.side = THREE.DoubleSide
  grating.alphaToCoverage = true
  patchGrating(grating)

  const gratingShadow = new THREE.MeshBasicMaterial({ alphaMap: gratingShadowDither(), alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false, depthWrite: false })
  reg(gratingShadow, `gratingShadow-${role}`)

  const walkway = reg(lib.walkwayPaint.clone(), `walkway-${role}`)
  walkway.color.set('#2f9e57')
  walkway.polygonOffset = true
  walkway.polygonOffsetFactor = -2
  walkway.polygonOffsetUnits = -2

  const atlas = reg(
    new THREE.MeshStandardMaterial({ map: signAtlas(), metalness: 0.1, roughness: 0.55, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.FrontSide }),
    `signAtlas-${role}`,
  )

  const out: StructMats = {
    steel: pick(lib.structSteel, 'structSteel'),
    steelDark: pick(lib.structSteelDark, 'structSteelDark'),
    grating,
    gratingShadow,
    plate: pick(lib.deckPlate, 'deckPlate'),
    yellow: pick(lib.safetyYellow, 'safetyYellow'),
    green: pick(lib.safetyGreen, 'safetyGreen'),
    tray: pick(lib.cableTray, 'cableTray'),
    cable: pick(lib.cable, 'cable'),
    walkway,
    atlas,
    lamp: paint('#fff6e0', role, { emissive: '#ffe7b0', emissiveIntensity: 2.2, roughness: 0.2, metalness: 0 }),
    lampBody: paint('#3b4146', role, { metalness: 0.5, roughness: 0.45 }),
    buoyOrange: paint('#ff5a14', role, { metalness: 0, roughness: 0.55 }),
    buoyWhite: paint('#f2f2ee', role, { metalness: 0, roughness: 0.55 }),
    galv: paint('#9ba2a6', role, { metalness: 0.75, roughness: 0.42 }),
    drain: paint('#1a1c1e', role, { metalness: 0.3, roughness: 0.8 }),
  }
  cache.set(role, out)
  return out
}
