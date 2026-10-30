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
  physical?: { clearcoat?: number; clearcoatRoughness?: number; transmission?: number; ior?: number; thickness?: number }
  flatShading?: boolean
}

const SPECS = {
  // --- equipment
  equipmentPaint: { role: 'shell', color: '#d6d8d4', metalness: 0.15, roughness: 0.52, physical: { clearcoat: 0.25, clearcoatRoughness: 0.5 } },
  equipmentPaintDark: { role: 'detail', color: '#7d8389', metalness: 0.3, roughness: 0.5 },
  vesselInner: { role: 'internal', color: '#7d746b', metalness: 0.25, roughness: 0.85, side: THREE.BackSide, emissive: '#3a342e', emissiveIntensity: 0.55 },
  internalsSteel: { role: 'internal', color: '#a9aeb2', metalness: 0.8, roughness: 0.35 },
  meshPad: { role: 'internal', color: '#9aa1a6', metalness: 0.7, roughness: 0.6, transparent: true, opacity: 0.55 },
  liquidOil: { role: 'internal', color: '#5a3613', metalness: 0.0, roughness: 0.08, transparent: true, opacity: 0.82, emissive: '#2a1405', emissiveIntensity: 0.4 },
  liquidWater: { role: 'internal', color: '#1f6f78', metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.7, emissive: '#06262a', emissiveIntensity: 0.5 },
  motorPaint: { role: 'detail', color: '#355f80', metalness: 0.35, roughness: 0.45, physical: { clearcoat: 0.4, clearcoatRoughness: 0.35 } },
  machineryGreen: { role: 'detail', color: '#4f6b5a', metalness: 0.3, roughness: 0.5 },
  castIron: { role: 'detail', color: '#3d4247', metalness: 0.55, roughness: 0.55 },
  stainless: { role: 'detail', color: '#c3c7cb', metalness: 0.92, roughness: 0.22 },
  brass: { role: 'detail', color: '#b08d57', metalness: 0.9, roughness: 0.3 },
  rubberBlack: { role: 'detail', color: '#1c1d1f', metalness: 0.0, roughness: 0.85 },
  nameplate: { role: 'detail', color: '#e9eae6', metalness: 0.6, roughness: 0.3 },
  moduleCladding: { role: 'shell', color: '#c9ccc8', metalness: 0.35, roughness: 0.55 },
  glass: { role: 'detail', color: '#9fb6c3', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.35 },
  displayLcd: { role: 'detail', color: '#0f1a14', metalness: 0.2, roughness: 0.2, emissive: '#3dff9a', emissiveIntensity: 0.25 },

  // --- piping
  pipePaint: { role: 'shell', color: '#b9bdbf', metalness: 0.35, roughness: 0.45 },
  pipeBore: { role: 'bore', color: '#5d554e', metalness: 0.35, roughness: 0.9, emissive: '#221e1b', emissiveIntensity: 0.6 },
  pipeCut: { role: 'internal', color: '#d9d2c4', metalness: 0.9, roughness: 0.3 }, // machined ring faces
  insulation: { role: 'shell', color: '#cfd3d6', metalness: 0.88, roughness: 0.33 },
  firewaterPaint: { role: 'shell', color: '#b1261d', metalness: 0.2, roughness: 0.45, physical: { clearcoat: 0.5, clearcoatRoughness: 0.3 } },
  flangeSteel: { role: 'detail', color: '#8e9498', metalness: 0.6, roughness: 0.42 },
  boltXylan: { role: 'detail', color: '#27427a', metalness: 0.45, roughness: 0.4 },
  nut: { role: 'detail', color: '#2b3443', metalness: 0.6, roughness: 0.38 },
  gasket: { role: 'detail', color: '#3b3d3f', metalness: 0.7, roughness: 0.5 },
  valveBody: { role: 'detail', color: '#4a5056', metalness: 0.5, roughness: 0.5 },
  handwheel: { role: 'detail', color: '#2a2d30', metalness: 0.4, roughness: 0.5 },
  actuatorYellow: { role: 'detail', color: '#e1b10f', metalness: 0.25, roughness: 0.4, physical: { clearcoat: 0.6, clearcoatRoughness: 0.25 } },
  actuatorBlue: { role: 'detail', color: '#4d6a8c', metalness: 0.35, roughness: 0.4, physical: { clearcoat: 0.5, clearcoatRoughness: 0.3 } },
  actuatorRed: { role: 'detail', color: '#b52a20', metalness: 0.25, roughness: 0.4, physical: { clearcoat: 0.6, clearcoatRoughness: 0.25 } },
  tubing: { role: 'detail', color: '#cfd3d7', metalness: 0.95, roughness: 0.2 },

  // --- structure
  structSteel: { role: 'structure', color: '#a8adb0', metalness: 0.3, roughness: 0.6 },
  structSteelDark: { role: 'structure', color: '#7b8186', metalness: 0.35, roughness: 0.6 },
  grating: { role: 'structure', color: '#8b9195', metalness: 0.7, roughness: 0.45, alphaTest: 0.5, side: THREE.DoubleSide },
  deckPlate: { role: 'structure', color: '#666c70', metalness: 0.25, roughness: 0.75 },
  safetyYellow: { role: 'structure', color: '#e5b114', metalness: 0.2, roughness: 0.5, physical: { clearcoat: 0.4, clearcoatRoughness: 0.4 } },
  safetyGreen: { role: 'structure', color: '#2e8b57', metalness: 0.1, roughness: 0.6 },
  cableTray: { role: 'structure', color: '#9ea4a8', metalness: 0.8, roughness: 0.4 },
  cable: { role: 'structure', color: '#1e1f21', metalness: 0.0, roughness: 0.7 },
  walkwayPaint: { role: 'structure', color: '#4d7a5a', metalness: 0.1, roughness: 0.8 },
} satisfies Record<string, Spec>

export type MaterialName = keyof typeof SPECS
export type MaterialSet = Record<MaterialName, THREE.MeshStandardMaterial>


// ---------------------------------------------------------------- natural weathering
/**
 * Subtle, world-space surface variation so nothing looks factory-new CG: low-frequency
 * tone mottling, fine speckle, a slightly darker/rougher band where things meet the deck,
 * and gloss variation. Deterministic (no textures), tiles nowhere, costs a few ALU ops.
 */
const WEATHER_NOISE = /* glsl */ `
varying vec3 vWPos;
float w_hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float w_noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(w_hash(i+vec3(0,0,0)),w_hash(i+vec3(1,0,0)),f.x),mix(w_hash(i+vec3(0,1,0)),w_hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(w_hash(i+vec3(0,0,1)),w_hash(i+vec3(1,0,1)),f.x),mix(w_hash(i+vec3(0,1,1)),w_hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float w_fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*w_noise(p); p*=2.03; a*=0.5; } return s; }
`
const WEATHER_STRENGTH: Partial<Record<MaterialRole, number>> = { shell: 1, structure: 1.25, detail: 0.6 }
export const WEATHER = { deckY: { value: 28 } }

function applyWeather(m: THREE.Material, role: MaterialRole) {
  const k = WEATHER_STRENGTH[role]
  if (!k || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return // already customised
  m.onBeforeCompile = (shader) => {
    shader.uniforms.wDeckY = WEATHER.deckY
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 w_wp = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          w_wp = batchingMatrix * w_wp; // perf: static batching (scene/perf/StaticBatcher) — world position per batched item
        #endif
        #ifdef USE_INSTANCING
          w_wp = instanceMatrix * w_wp;
        #endif
        vWPos = (modelMatrix * w_wp).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float wDeckY;\n${WEATHER_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float w_m = w_fbm(vWPos * 0.55);
        float w_s = w_noise(vWPos * 9.0);
        float w_low = 1.0 - smoothstep(wDeckY + 0.02, wDeckY + 0.55, vWPos.y);
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
  m.customProgramCacheKey = () => `weather-${k}`
}

let cache: MaterialSet | null = null
const roles = new Map<THREE.Material, MaterialRole>()
const base = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>()

function build(spec: Spec): THREE.MeshStandardMaterial {
  const params: THREE.MeshPhysicalMaterialParameters = {
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
  const m = spec.physical ? new THREE.MeshPhysicalMaterial({ ...params, ...spec.physical }) : new THREE.MeshStandardMaterial(params)
  return m
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
