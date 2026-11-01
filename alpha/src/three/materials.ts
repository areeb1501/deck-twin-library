/**
 * Shared PBR material library.
 *
 * Every plant material is created once here and shared, so that:
 *  - the section box (clipping planes) applies to everything consistently,
 *  - X-ray mode can fade shells while keeping internals and flow visible,
 *  - draw-call batching stays effective.
 *
 * Usage in components:  const m = useMaterials();  <mesh material={m.pipePaint} />
 * or outside React:      materials().pipePaint
 */
import * as THREE from 'three'

export type MaterialRole =
  | 'shell' // outer skins: vessel shells, pipe outer walls, insulation — fade in x-ray
  | 'detail' // valves, flanges, bolts, nozzles — fade less in x-ray
  | 'structure' // steelwork, grating, handrails — fade in x-ray
  | 'internal' // vessel internals, fluids — stay opaque in x-ray
  | 'bore' // pipe/nozzle bores — mostly transparent in x-ray so the flow shows
  | 'env' // ocean, sky, distant platform parts — never clipped

/** Section box: 6 planes. When disabled the constants are pushed far away. */
export const sectionPlanes: THREE.Plane[] = [
  new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e5), // x >= min  -> normal +X, constant -min
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e5), // x <= max
  new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e5),
  new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e5),
  new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e5),
]

/**
 * The plant is rendered inside a group translated to the deck elevation, so the
 * section box is expressed in WORLD coordinates. Callers pass deck-local bounds plus
 * the deck group's world Y offset.
 */
export function setSectionBox(
  enabled: boolean,
  min: [number, number, number],
  max: [number, number, number],
  worldYOffset = 0,
) {
  if (!enabled) {
    for (const p of sectionPlanes) p.constant = 1e5
    return
  }
  sectionPlanes[0].constant = -min[0]
  sectionPlanes[1].constant = max[0]
  sectionPlanes[2].constant = -(min[1] + worldYOffset)
  sectionPlanes[3].constant = max[1] + worldYOffset
  sectionPlanes[4].constant = -min[2]
  sectionPlanes[5].constant = max[2]
}

interface Spec {
  role: MaterialRole
  color: string
  metalness?: number
  roughness?: number
  side?: THREE.Side
  emissive?: string
  emissiveIntensity?: number
  transparent?: boolean
  opacity?: number
  alphaTest?: number
  flatShading?: boolean
}

const SPECS = {
  // --- equipment
  equipmentPaint: { role: 'shell', color: '#b4b7b0', metalness: 0.1, roughness: 0.62 },
  equipmentPaintDark: { role: 'detail', color: '#7d8389', metalness: 0.3, roughness: 0.5 },
  vesselInner: { role: 'internal', color: '#7d746b', metalness: 0.25, roughness: 0.85, side: THREE.BackSide, emissive: '#3a342e', emissiveIntensity: 0.55 },
  internalsSteel: { role: 'internal', color: '#a9aeb2', metalness: 0.8, roughness: 0.35 },
  meshPad: { role: 'internal', color: '#9aa1a6', metalness: 0.7, roughness: 0.6, transparent: true, opacity: 0.55 },
  liquidOil: { role: 'internal', color: '#5a3613', metalness: 0.0, roughness: 0.08, transparent: true, opacity: 0.82, emissive: '#2a1405', emissiveIntensity: 0.4 },
  liquidWater: { role: 'internal', color: '#1f6f78', metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.7, emissive: '#06262a', emissiveIntensity: 0.5 },
  motorPaint: { role: 'detail', color: '#355f80', metalness: 0.35, roughness: 0.45 },
  machineryGreen: { role: 'detail', color: '#4f6b5a', metalness: 0.3, roughness: 0.5 },
  castIron: { role: 'detail', color: '#3d4247', metalness: 0.55, roughness: 0.55 },
  stainless: { role: 'detail', color: '#c3c7cb', metalness: 0.92, roughness: 0.22 },
  brass: { role: 'detail', color: '#b08d57', metalness: 0.9, roughness: 0.3 },
  rubberBlack: { role: 'detail', color: '#1c1d1f', metalness: 0.0, roughness: 0.85 },
  nameplate: { role: 'detail', color: '#e9eae6', metalness: 0.6, roughness: 0.3 },
  moduleCladding: { role: 'shell', color: '#aeb1ab', metalness: 0.3, roughness: 0.62 },
  glass: { role: 'detail', color: '#9fb6c3', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.35 },
  displayLcd: { role: 'detail', color: '#0f1a14', metalness: 0.2, roughness: 0.2, emissive: '#3dff9a', emissiveIntensity: 0.25 },

  // --- piping
  pipePaint: { role: 'shell', color: '#8f9496', metalness: 0.3, roughness: 0.58 },
  pipeBore: { role: 'bore', color: '#5d554e', metalness: 0.35, roughness: 0.9, emissive: '#221e1b', emissiveIntensity: 0.6 },
  pipeCut: { role: 'internal', color: '#d9d2c4', metalness: 0.9, roughness: 0.3 }, // machined ring faces
  insulation: { role: 'shell', color: '#aab0b3', metalness: 0.7, roughness: 0.52 },
  firewaterPaint: { role: 'shell', color: '#b1261d', metalness: 0.2, roughness: 0.45 },
  flangeSteel: { role: 'detail', color: '#8e9498', metalness: 0.6, roughness: 0.42 },
  boltXylan: { role: 'detail', color: '#27427a', metalness: 0.45, roughness: 0.4 },
  nut: { role: 'detail', color: '#2b3443', metalness: 0.6, roughness: 0.38 },
  gasket: { role: 'detail', color: '#3b3d3f', metalness: 0.7, roughness: 0.5 },
  valveBody: { role: 'detail', color: '#4a5056', metalness: 0.5, roughness: 0.5 },
  handwheel: { role: 'detail', color: '#2a2d30', metalness: 0.4, roughness: 0.5 },
  actuatorYellow: { role: 'detail', color: '#e1b10f', metalness: 0.25, roughness: 0.4 },
  actuatorBlue: { role: 'detail', color: '#4d6a8c', metalness: 0.35, roughness: 0.4 },
  actuatorRed: { role: 'detail', color: '#b52a20', metalness: 0.25, roughness: 0.4 },
  tubing: { role: 'detail', color: '#cfd3d7', metalness: 0.95, roughness: 0.2 },

  // --- structure
  structSteel: { role: 'structure', color: '#8b9195', metalness: 0.25, roughness: 0.68 },
  structSteelDark: { role: 'structure', color: '#62686c', metalness: 0.3, roughness: 0.68 },
  grating: { role: 'structure', color: '#6d7276', metalness: 0.45, roughness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide },
  deckPlate: { role: 'structure', color: '#565a5b', metalness: 0.2, roughness: 0.82 },
  safetyYellow: { role: 'structure', color: '#e5b114', metalness: 0.2, roughness: 0.5 },
  safetyGreen: { role: 'structure', color: '#2e8b57', metalness: 0.1, roughness: 0.6 },
  cableTray: { role: 'structure', color: '#9ea4a8', metalness: 0.8, roughness: 0.4 },
  cable: { role: 'structure', color: '#1e1f21', metalness: 0.0, roughness: 0.7 },
  walkwayPaint: { role: 'structure', color: '#4d7a5a', metalness: 0.1, roughness: 0.8 },
} satisfies Record<string, Spec>

export type MaterialName = keyof typeof SPECS
export type MaterialSet = Record<MaterialName, THREE.MeshStandardMaterial>


// ---------------------------------------------------------------- natural weathering
/**
 * World-space ageing so nothing looks factory-new CG, the way paint goes on a platform at sea: tone mottling, fine
 * speckle, grime streaks running down surfaces, salt bloom, rust where the streaks gather, a darker and rougher band
 * where things meet the deck, and gloss variation. Deterministic (no textures), tiles nowhere.
 */
const WEATHER_NOISE = /* glsl */ `
varying vec3 vWPos;
float w_hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float w_noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(w_hash(i+vec3(0,0,0)),w_hash(i+vec3(1,0,0)),f.x),mix(w_hash(i+vec3(0,1,0)),w_hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(w_hash(i+vec3(0,0,1)),w_hash(i+vec3(1,0,1)),f.x),mix(w_hash(i+vec3(0,1,1)),w_hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float w_fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*w_noise(p); p*=2.03; a*=0.5; } return s; }
`
const WEATHER_STRENGTH: Partial<Record<MaterialRole, number>> = { shell: 1, structure: 1.25, detail: 0.7 }
export const WEATHER = { deckY: { value: 28 } }

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0]

function ageShader(shader: Shader, k: number) {
  shader.uniforms.wDeckY = WEATHER.deckY
  shader.uniforms.wK = { value: k }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 w_wp = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        w_wp = batchingMatrix * w_wp; // perf: static batching (scene/perf/StaticBatcher), world position per batched item
      #endif
      #ifdef USE_INSTANCING
        w_wp = instanceMatrix * w_wp;
      #endif
      vWPos = (modelMatrix * w_wp).xyz;`,
    )
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nuniform float wDeckY;\nuniform float wK;\n${WEATHER_NOISE}`)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float w_m = w_fbm(vWPos * 0.55);
      float w_s = w_noise(vWPos * 9.0);
      float w_low = 1.0 - smoothstep(wDeckY + 0.02, wDeckY + 0.55, vWPos.y);
      float w_g = (smoothstep(0.42, 0.85, w_m) * 0.14 + (w_s - 0.5) * 0.05 + w_low * 0.12) * wK;
      // grime streaks: noise stretched down the height, so they run the way rain and salt water do
      float w_run = w_noise(vec3(vWPos.x * 6.0, vWPos.y * 0.42, vWPos.z * 6.0)) * 0.6 + w_s * 0.4;
      float w_str = smoothstep(0.54, 0.76, w_run);
      // rust gathers in blotches, stronger low down and along the streaks
      float w_b = w_noise(vWPos * 1.25 + vec3(3.1, 7.7, 1.3)) * 0.7 + w_m * 0.3;
      float w_rust = smoothstep(0.62, 0.8, w_b + w_str * 0.14 + w_low * 0.1) * smoothstep(0.42, 0.66, w_s * 0.6 + w_run * 0.5);
      // salt dries pale on the upper faces
      float w_salt = smoothstep(0.6, 0.8, w_m) * (1.0 - w_str);
      diffuseColor.rgb *= 1.0 - w_g - w_str * 0.17 * wK;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.73, 0.69), w_salt * 0.09 * wK);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.1, 0.05) * (0.7 + 0.7 * w_s), min(0.55, w_rust * 0.42 * wK));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.02, 0.97, 0.9), w_low * 0.7 * wK);`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (w_m + w_str * 0.3 - 0.6) * 0.22 * wK + w_low * 0.14, 0.04, 1.0);`,
    )
}

function applyWeather(m: THREE.Material, role: MaterialRole) {
  const k = WEATHER_STRENGTH[role]
  if (!k || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return // already customised
  m.onBeforeCompile = (shader) => ageShader(shader, k)
  m.customProgramCacheKey = () => 'weather'
}

/** age a material that already has its own shader patch (the environment's splash-zone steel) */
export function age(m: THREE.Material, k = 0.9) {
  const prev = m.onBeforeCompile
  const key = m.customProgramCacheKey?.bind(m)
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer)
    ageShader(shader, k)
  }
  m.customProgramCacheKey = () => `${key ? key() : ''}|aged`
}

let cache: MaterialSet | null = null
const roles = new Map<THREE.Material, MaterialRole>()
const base = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>()

function build(spec: Spec): THREE.MeshStandardMaterial {
  const params: THREE.MeshStandardMaterialParameters = {
    color: spec.color,
    metalness: spec.metalness ?? 0.2,
    roughness: spec.roughness ?? 0.6,
    side: spec.side ?? THREE.FrontSide,
    transparent: spec.transparent ?? false,
    opacity: spec.opacity ?? 1,
    alphaTest: spec.alphaTest ?? 0,
    flatShading: spec.flatShading ?? false,
    clippingPlanes: spec.role === 'env' ? null : sectionPlanes,
    clipShadows: true,
  }
  if (spec.emissive) {
    params.emissive = new THREE.Color(spec.emissive)
    params.emissiveIntensity = spec.emissiveIntensity ?? 1
  }
  return new THREE.MeshStandardMaterial(params)
}

export function materials(): MaterialSet {
  if (cache) return cache
  const out = {} as MaterialSet
  for (const [name, spec] of Object.entries(SPECS) as [MaterialName, Spec][]) {
    const m = build(spec)
    m.name = name
    out[name] = m
    roles.set(m, spec.role)
    base.set(m, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite })
    applyWeather(m, spec.role)
  }
  cache = out
  return out
}

export const useMaterials = materials

const extra = new Map<string, THREE.MeshStandardMaterial>()
/** A cached painted material for an arbitrary colour (service bands, labels). */
export function paint(color: string, role: MaterialRole = 'detail', opts: Partial<Spec> = {}) {
  const key = `${color}|${role}|${JSON.stringify(opts)}`
  let m = extra.get(key)
  if (!m) {
    m = build({ role, color, metalness: 0.25, roughness: 0.5, ...opts })
    applyWeather(m, role)
    roles.set(m, role)
    base.set(m, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite })
    extra.set(key, m)
  }
  return m
}

/** Register a material created elsewhere so it participates in x-ray/section. */
export function registerMaterial(m: THREE.Material, role: MaterialRole) {
  applyWeather(m, role)
  roles.set(m, role)
  base.set(m, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite })
  if (role !== 'env') {
    m.clippingPlanes = sectionPlanes
    m.clipShadows = true
  }
  return m
}

const XRAY_OPACITY: Record<MaterialRole, number | null> = {
  shell: 0.1,
  structure: 0.14,
  detail: 0.45,
  bore: 0.22,
  internal: null,
  env: null,
}

export function setXray(on: boolean) {
  materials()
  for (const [m, role] of roles) {
    const b = base.get(m)!
    const target = XRAY_OPACITY[role]
    if (!on || target === null) {
      m.opacity = b.opacity
      m.transparent = b.transparent
      m.depthWrite = b.depthWrite
    } else {
      m.opacity = Math.min(b.opacity, target)
      m.transparent = true
      m.depthWrite = false
    }
    m.needsUpdate = true
  }
}
