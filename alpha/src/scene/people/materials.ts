/**
 * Materials for the walk-mode avatar (one per surface slot, see body.ts `S`), with small procedural tiling
 * normal maps generated in code (no image assets): twill weave for the coverall, knit for the gloves, grain for
 * leather / rubber, pores for skin, strands for hair, micro-prisms for the retroreflective tape.
 *
 * All materials take their albedo from vertex colours. Two shader tweaks (onBeforeCompile):
 *  - fluorescent hi-vis glows a little from its own colour;
 *  - retro tape brightens toward the viewer (light comes back along the view direction), so the bands catch the
 *    light the way they do in photos and at night.
 * Private materials: not registered with the x-ray / section system.
 */
import * as THREE from 'three'
import { S, SLOT_COUNT } from './body'

type Height = (u: number, v: number) => number

function hash(i: number, j: number, seed: number) {
  let h = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** tileable value noise on [0,1)², `period` cells per tile */
function noise(u: number, v: number, period: number, seed: number) {
  const x = u * period
  const y = v * period
  const i = Math.floor(x)
  const j = Math.floor(y)
  const fx = x - i
  const fy = y - j
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const w = (a: number) => ((a % period) + period) % period
  const a = hash(w(i), w(j), seed)
  const b = hash(w(i + 1), w(j), seed)
  const c = hash(w(i), w(j + 1), seed)
  const d = hash(w(i + 1), w(j + 1), seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** a tiling normal map from a height field on [0,1)² */
function normalMap(size: number, h: Height, strength: number): THREE.DataTexture {
  const hs = new Float32Array(size * size)
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) hs[j * size + i] = h(i / size, j / size)
  const data = new Uint8Array(size * size * 4)
  const at = (i: number, j: number) => hs[(((j + size) % size) * size + ((i + size) % size))]
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const nx = -(at(i + 1, j) - at(i - 1, j)) * strength
      const ny = -(at(i, j + 1) - at(i, j - 1)) * strength
      const l = Math.hypot(nx, ny, 1)
      const o = (j * size + i) * 4
      data[o] = Math.round(((nx / l) * 0.5 + 0.5) * 255)
      data[o + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255)
      data[o + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255)
      data[o + 3] = 255
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/** 2/2 twill: threads float over two, under two, shifted one per thread → diagonal wales */
const twill =
  (threads: number): Height =>
  (u, v) => {
    const a = u * threads
    const b = v * threads
    const i = Math.floor(a)
    const j = Math.floor(b)
    const fu = a - i
    const fv = b - j
    const warp = Math.sin(Math.PI * fu)
    const weft = Math.sin(Math.PI * fv)
    const over = (((i + j) % 4) + 4) % 4 < 2
    return (over ? 0.5 + 0.5 * warp * (0.75 + 0.25 * weft) : 0.5 + 0.5 * weft * (0.75 + 0.25 * warp)) + 0.08 * noise(u, v, 16, 3)
  }
const grain =
  (period: number, seed: number): Height =>
  (u, v) =>
    0.6 * noise(u, v, period, seed) + 0.3 * noise(u, v, period * 2, seed + 1) + 0.1 * noise(u, v, period * 4, seed + 2)
const strands: Height = (u, v) => 0.7 * noise(u * 1, v, 24, 7) + 0.3 * noise(u, v, 48, 8) * 0.5 + 0.2 * noise(u, v * 0.25, 4, 9)
const prisms: Height = (u, v) => {
  const a = (u * 12) % 1
  const b = (v * 12) % 1
  return Math.min(a, 1 - a, b, 1 - b) < 0.1 ? 0 : 1
}

/** albedo-driven emission: constant glow (fluorescent) + view-facing retroreflection */
function glow<M extends THREE.MeshStandardMaterial>(m: M, k: number, retro = 0): M {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * ( ${k.toFixed(3)} + ${retro.toFixed(3)} * pow( max( dot( normal, normalize( vViewPosition ) ), 0.0 ), 3.0 ) );`,
    )
  }
  m.customProgramCacheKey = () => `people-glow-${k}-${retro}`
  return m
}

export function avatarMaterials(): { materials: THREE.Material[]; textures: THREE.Texture[] } {
  const textures: THREE.Texture[] = []
  /** a normal map tiling every `tile` metres (UVs are in metres) */
  const nm = (size: number, h: Height, strength: number, tile: number) => {
    const t = normalMap(size, h, strength)
    t.repeat.set(1 / tile, 1 / tile)
    textures.push(t)
    return t
  }
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p })
  const ns = (s: number) => new THREE.Vector2(s, s)
  const m: THREE.Material[] = new Array(SLOT_COUNT)
  m[S.Cloth] = std({ roughness: 0.88, normalMap: nm(64, twill(8), 2.2, 0.02), normalScale: ns(0.6) })
  m[S.Tape] = glow(std({ roughness: 0.3, metalness: 0.5, normalMap: nm(48, prisms, 1.5, 0.015), normalScale: ns(0.25) }), 0.1, 0.85)
  m[S.Rubber] = std({ roughness: 0.66, normalMap: nm(64, grain(8, 11), 3, 0.05), normalScale: ns(0.3) })
  m[S.Skin] = std({ roughness: 0.56, normalMap: nm(64, grain(16, 21), 2, 0.025), normalScale: ns(0.12) })
  m[S.Plastic] = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, clearcoat: 0.75, clearcoatRoughness: 0.16 })
  m[S.Lens] = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.25, clearcoat: 1, transparent: true, opacity: 0.55 })
  m[S.Glove] = std({ roughness: 0.8, normalMap: nm(64, twill(8), 2.5, 0.009), normalScale: ns(0.55) })
  m[S.HiVis] = glow(std({ roughness: 0.6, normalMap: nm(64, twill(8), 2, 0.012), normalScale: ns(0.3) }), 0.16)
  m[S.Leather] = std({ roughness: 0.48, normalMap: nm(64, grain(10, 31), 3.5, 0.04), normalScale: ns(0.45) })
  m[S.Metal] = std({ roughness: 0.3, metalness: 0.9 })
  m[S.Hair] = std({ roughness: 0.66, normalMap: nm(64, strands, 4, 0.03), normalScale: ns(0.8) })
  return { materials: m, textures }
}
