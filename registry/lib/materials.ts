// Shared PBR materials. Created once, reused by every component, with subtle world-space weathering.
import * as THREE from 'three'

interface Spec {
  color: string
  metalness?: number
  roughness?: number
  side?: THREE.Side
  emissive?: string
  emissiveIntensity?: number
  transparent?: boolean
  opacity?: number
  alphaTest?: number
  clearcoat?: number
  clearcoatRoughness?: number
  weather?: number
}

const SPECS = {
  // equipment
  equipmentPaint: { color: '#d6d8d4', metalness: 0.15, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5, weather: 1 },
  equipmentPaintDark: { color: '#7d8389', metalness: 0.3, roughness: 0.5, weather: 0.6 },
  vesselInner: { color: '#7d746b', metalness: 0.25, roughness: 0.85, side: THREE.BackSide },
  internalsSteel: { color: '#a9aeb2', metalness: 0.8, roughness: 0.35 },
  motorPaint: { color: '#355f80', metalness: 0.35, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.35, weather: 0.5 },
  machineryGreen: { color: '#4f6b5a', metalness: 0.3, roughness: 0.5, weather: 0.6 },
  castIron: { color: '#3d4247', metalness: 0.55, roughness: 0.55, weather: 0.6 },
  stainless: { color: '#c3c7cb', metalness: 0.92, roughness: 0.22 },
  galvanised: { color: '#b4b9bc', metalness: 0.85, roughness: 0.42, weather: 0.8 },
  aluminium: { color: '#d3d6d9', metalness: 0.9, roughness: 0.3 },
  brass: { color: '#b08d57', metalness: 0.9, roughness: 0.3 },
  copper: { color: '#b0643a', metalness: 0.95, roughness: 0.3 },
  rubberBlack: { color: '#1c1d1f', metalness: 0, roughness: 0.85 },
  plasticGrey: { color: '#6e7378', metalness: 0, roughness: 0.55 },
  nameplate: { color: '#e9eae6', metalness: 0.6, roughness: 0.3 },
  cladding: { color: '#c9ccc8', metalness: 0.35, roughness: 0.55, weather: 1 },
  concrete: { color: '#9c9a94', metalness: 0, roughness: 0.92, weather: 1.2 },
  glass: { color: '#9fb6c3', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.35 },
  lampLens: { color: '#fff6d8', metalness: 0, roughness: 0.2, emissive: '#fff1c4', emissiveIntensity: 1.2 },
  // piping
  pipePaint: { color: '#b9bdbf', metalness: 0.35, roughness: 0.45, weather: 1 },
  pipeBore: { color: '#5d554e', metalness: 0.35, roughness: 0.9, side: THREE.DoubleSide },
  machined: { color: '#d9d2c4', metalness: 0.9, roughness: 0.3 },
  insulation: { color: '#cfd3d6', metalness: 0.88, roughness: 0.33, weather: 0.8 },
  flangeSteel: { color: '#8e9498', metalness: 0.6, roughness: 0.42, weather: 0.6 },
  boltXylan: { color: '#27427a', metalness: 0.45, roughness: 0.4 },
  nut: { color: '#2b3443', metalness: 0.6, roughness: 0.38 },
  gasket: { color: '#3b3d3f', metalness: 0.7, roughness: 0.5 },
  valveBody: { color: '#4a5056', metalness: 0.5, roughness: 0.5, weather: 0.6 },
  handwheel: { color: '#2a2d30', metalness: 0.4, roughness: 0.5 },
  actuatorYellow: { color: '#e1b10f', metalness: 0.25, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25, weather: 0.5 },
  actuatorBlue: { color: '#4d6a8c', metalness: 0.35, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3, weather: 0.5 },
  actuatorRed: { color: '#b52a20', metalness: 0.25, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25, weather: 0.5 },
  firewaterRed: { color: '#b1261d', metalness: 0.2, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3, weather: 0.8 },
  tubing: { color: '#cfd3d7', metalness: 0.95, roughness: 0.2 },
  // structure
  structSteel: { color: '#a8adb0', metalness: 0.3, roughness: 0.6, weather: 1.25 },
  structSteelDark: { color: '#7b8186', metalness: 0.35, roughness: 0.6, weather: 1.25 },
  deckPlate: { color: '#666c70', metalness: 0.25, roughness: 0.75, weather: 1.25 },
  safetyYellow: { color: '#e5b114', metalness: 0.2, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.4, weather: 1 },
  safetyGreen: { color: '#2e8b57', metalness: 0.1, roughness: 0.6, weather: 1 },
  cableTray: { color: '#9ea4a8', metalness: 0.8, roughness: 0.4, weather: 0.8 },
  cable: { color: '#1e1f21', metalness: 0, roughness: 0.7 },
  walkwayPaint: { color: '#4d7a5a', metalness: 0.1, roughness: 0.8, weather: 1.25 },
  // fluids
  liquidOil: { color: '#5a3613', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.82, emissive: '#2a1405', emissiveIntensity: 0.4 },
  liquidWater: { color: '#1f6f78', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.7, emissive: '#06262a', emissiveIntensity: 0.5 },
} satisfies Record<string, Spec>

export type MaterialName = keyof typeof SPECS
export type MaterialSet = Record<MaterialName, THREE.MeshStandardMaterial>

/** World Y of the ground plane, used for the darker band where steel meets the deck. */
export const WEATHER = { groundY: { value: 0 } }

const NOISE = /* glsl */ `
varying vec3 vWPos;
float w_hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float w_noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(w_hash(i),w_hash(i+vec3(1,0,0)),f.x),mix(w_hash(i+vec3(0,1,0)),w_hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(w_hash(i+vec3(0,0,1)),w_hash(i+vec3(1,0,1)),f.x),mix(w_hash(i+vec3(0,1,1)),w_hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float w_fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*w_noise(p); p*=2.03; a*=0.5; } return s; }
`

/** Adds deterministic tone mottling, speckle and gloss variation so surfaces don't read as CG-new. */
export function weather(m: THREE.Material, k = 1) {
  if (k <= 0 || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m
  m.onBeforeCompile = (shader) => {
    shader.uniforms.wGroundY = WEATHER.groundY
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 w_wp = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        w_wp = batchingMatrix * w_wp;
      #endif
      #ifdef USE_INSTANCING
        w_wp = instanceMatrix * w_wp;
      #endif
      vWPos = (modelMatrix * w_wp).xyz;`,
    )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float wGroundY;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float w_m = w_fbm(vWPos * 0.55);
        float w_s = w_noise(vWPos * 9.0);
        float w_low = 1.0 - smoothstep(wGroundY + 0.02, wGroundY + 0.55, vWPos.y);
        float w_g = (smoothstep(0.42, 0.85, w_m) * 0.085 + (w_s - 0.5) * 0.03 + w_low * 0.07) * ${k.toFixed(2)};
        diffuseColor.rgb *= 1.0 - w_g;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.02, 0.99, 0.95), w_low * 0.6 * ${k.toFixed(2)});`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (w_fbm(vWPos * 1.7 + 11.0) - 0.5) * 0.16 * ${k.toFixed(2)} + w_low * 0.12, 0.04, 1.0);`,
      )
  }
  m.customProgramCacheKey = () => `weather-${k.toFixed(2)}`
  return m
}

function make(spec: Spec, name: string): THREE.MeshStandardMaterial {
  const params: THREE.MeshPhysicalMaterialParameters = {
    color: spec.color,
    metalness: spec.metalness ?? 0.2,
    roughness: spec.roughness ?? 0.6,
    side: spec.side ?? THREE.FrontSide,
    transparent: spec.transparent ?? false,
    opacity: spec.opacity ?? 1,
    alphaTest: spec.alphaTest ?? 0,
  }
  if (spec.emissive) {
    params.emissive = new THREE.Color(spec.emissive)
    params.emissiveIntensity = spec.emissiveIntensity ?? 1
  }
  const m =
    spec.clearcoat !== undefined
      ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: spec.clearcoat, clearcoatRoughness: spec.clearcoatRoughness ?? 0.4 })
      : new THREE.MeshStandardMaterial(params)
  m.name = name
  return weather(m, spec.weather ?? 0) as THREE.MeshStandardMaterial
}

let cache: MaterialSet | null = null

export function materials(): MaterialSet {
  if (cache) return cache
  const out = {} as MaterialSet
  for (const [name, spec] of Object.entries(SPECS) as [MaterialName, Spec][]) out[name] = make(spec, name)
  return (cache = out)
}

const painted = new Map<string, THREE.MeshStandardMaterial>()

/** Cached painted steel in any colour (RAL hex, service band, brand colour). */
export function paint(color: string, opts: Partial<Omit<Spec, 'color'>> = {}) {
  const key = `${color}|${JSON.stringify(opts)}`
  let m = painted.get(key)
  if (!m) painted.set(key, (m = make({ color, metalness: 0.2, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.45, weather: 0.8, ...opts }, `paint-${color}`)))
  return m
}
