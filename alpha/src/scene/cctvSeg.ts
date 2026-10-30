/**
 * Simulated SAM 3.1 for the CCTV main monitor: promptable concept segmentation from the twin's
 * ground truth. The output looks like what SAM 3.1 will return (instance masks + concept label + score),
 * and the page draws it the same way, so swapping in the real model (plan 11, 9e) changes the source,
 * not the display.
 *
 * How the masks are made: the camera's view is rendered a second time with ONE override material that
 * colours every pixel by the instance box its world position falls in (workers' hard hat / vest /
 * body, then equipment, nearest first). The depth test does the occlusion, so a mask is exactly the
 * visible part of the object. The id image is read back asynchronously and turned on the CPU into a
 * coloured mask image with outlines, plus per-instance box, label anchor and score.
 */
import * as THREE from 'three'
import type { Plant } from '../model/types'
import { footprints } from '../model/footprint'
import { labelHeight } from '../ui/labels'
import { levelAt, walkLevels } from './Walk'
import { DECK_WORLD_Y } from '../state/store'
import { useWorkers, workerPose } from '../safety/workers'
import { SEG_CLASSES, segClassOf, type SegClassId, type SegInstance } from '../safety/cctv'

export const SEG_W = 480
export const SEG_H = 270
const MAXB = 96

interface SegBox {
  min: THREE.Vector3
  max: THREE.Vector3
  cls: SegClassId
  /** plant tag or worker id */
  ref: string
  name: string
}

const VERT = /* glsl */ `
#include <common>
#include <batching_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vW;
void main() {
  #include <batching_vertex>
  #include <begin_vertex>
  #include <skinbase_vertex>
  #include <skinning_vertex>
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    wp = batchingMatrix * wp;
  #endif
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
const FRAG = /* glsl */ `
uniform vec3 uMin[${MAXB}];
uniform vec3 uMax[${MAXB}];
uniform int uCount;
varying vec3 vW;
void main() {
  float id = 0.0;
  for (int i = 0; i < ${MAXB}; i++) {
    if (i >= uCount) break;
    if (all(greaterThanEqual(vW, uMin[i])) && all(lessThanEqual(vW, uMax[i]))) { id = float(i + 1); break; }
  }
  gl_FragColor = vec4(id / 255.0, 0.0, 0.0, 1.0);
}`

export interface SegCtx {
  mat: THREE.ShaderMaterial
  rt: THREE.WebGLRenderTarget
  buf: Uint8Array
  /** static equipment boxes (world), built once per plant */
  equipment: SegBox[]
  pending: boolean
  frustum: THREE.Frustum
  m: THREE.Matrix4
}

export function makeSegCtx(plant: Plant): SegCtx {
  const levels = walkLevels(plant)
  const fps = footprints(plant.equipment, 0)
  const equipment: SegBox[] = []
  plant.equipment.forEach((e, i) => {
    const cls = segClassOf(e.kind)
    if (!cls) return
    const f = fps[i]
    const floor = levels[levelAt(levels, e.position[1])]?.y ?? 0
    const top = Math.max(floor + 1, labelHeight(e) - 0.5)
    equipment.push({ min: new THREE.Vector3(f.x0 - 0.1, floor + DECK_WORLD_Y - 0.05, f.z0 - 0.1), max: new THREE.Vector3(f.x1 + 0.1, top + DECK_WORLD_Y, f.z1 + 0.1), cls, ref: e.tag, name: e.name })
  })
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uMin: { value: Array.from({ length: MAXB }, () => new THREE.Vector3()) }, uMax: { value: Array.from({ length: MAXB }, () => new THREE.Vector3()) }, uCount: { value: 0 } },
    toneMapped: false,
    fog: false,
  })
  const rt = new THREE.WebGLRenderTarget(SEG_W, SEG_H, { type: THREE.UnsignedByteType, depthBuffer: true, samples: 0, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
  return { mat, rt, buf: new Uint8Array(SEG_W * SEG_H * 4), equipment, pending: false, frustum: new THREE.Frustum(), m: new THREE.Matrix4() }
}

export function disposeSegCtx(c: SegCtx) {
  c.mat.dispose()
  c.rt.dispose()
}

/** the instance boxes for this view: PPE first (most specific), then people, then equipment nearest first */
function boxesFor(c: SegCtx, cam3: THREE.PerspectiveCamera): SegBox[] {
  const out: SegBox[] = []
  const people: SegBox[] = []
  for (const w of useWorkers.getState().roster) {
    const p = workerPose[w.id]
    if (!p) continue
    const v = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => [new THREE.Vector3(p.x + x0, p.footY + y0, p.z + z0), new THREE.Vector3(p.x + x1, p.footY + y1, p.z + z1)] as const
    if (w.hardHat) {
      const [a, b] = v(-0.2, 1.6, -0.2, 0.2, 2.0, 0.2) // from 1.6 m: the shortest workers (×0.965) carry the rim at ~1.63 m
      out.push({ min: a, max: b, cls: 'hardHat', ref: w.id, name: w.name })
    }
    if (w.vest) {
      const [a, b] = v(-0.32, 0.95, -0.32, 0.32, 1.5, 0.32)
      out.push({ min: a, max: b, cls: 'vest', ref: w.id, name: w.name })
    }
    const [a, b] = v(-0.4, -0.05, -0.4, 0.4, 2.0, 0.4)
    people.push({ min: a, max: b, cls: 'person', ref: w.id, name: w.name })
  }
  out.push(...people)
  c.m.multiplyMatrices(cam3.projectionMatrix, cam3.matrixWorldInverse)
  c.frustum.setFromProjectionMatrix(c.m)
  const box = new THREE.Box3()
  const cp = cam3.position
  const seen = c.equipment
    .filter((e) => box.set(e.min, e.max) && c.frustum.intersectsBox(box) && box.distanceToPoint(cp) < 95)
    .sort((a, b) => box.set(a.min, a.max).distanceToPoint(cp) - box.set(b.min, b.max).distanceToPoint(cp))
  for (const e of seen) {
    if (out.length >= MAXB) break
    out.push(e)
  }
  return out.slice(0, MAXB)
}

const SEG_RGB = new Map(SEG_CLASSES.map((k) => [k.id, new THREE.Color(k.color)]))

/**
 * Render the id pass for this camera (cam3 already aimed) and resolve with the mask image + instances.
 * Returns null when a previous pass is still being read back.
 */
export function renderSeg(gl: THREE.WebGLRenderer, scene: THREE.Scene, cam3: THREE.PerspectiveCamera, c: SegCtx, enabled: Set<SegClassId>, seed: number): Promise<{ mask: ImageData; instances: SegInstance[]; ms: number }> | null {
  if (c.pending) return null
  const t0 = performance.now()
  const boxes = boxesFor(c, cam3)
  const u = c.mat.uniforms
  boxes.forEach((b, i) => {
    ;(u.uMin.value as THREE.Vector3[])[i].copy(b.min)
    ;(u.uMax.value as THREE.Vector3[])[i].copy(b.max)
  })
  u.uCount.value = boxes.length

  // hide what an opaque override would turn into walls: transparent things (gas cloud, glass, plumes), points, lines, sprites
  const hidden: THREE.Object3D[] = []
  scene.traverseVisible((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    const transparent = Array.isArray(m) ? m.some((x) => x.transparent) : !!m?.transparent
    if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite || ((o as THREE.Mesh).isMesh && transparent)) hidden.push(o)
  })
  for (const o of hidden) o.visible = false
  const prevTarget = gl.getRenderTarget()
  const prevAuto = gl.autoClear
  const prevOverride = scene.overrideMaterial
  const prevBg = scene.background
  const prevClear = gl.getClearColor(new THREE.Color())
  const prevAlpha = gl.getClearAlpha()
  scene.overrideMaterial = c.mat
  scene.background = null
  gl.setRenderTarget(c.rt)
  gl.setClearColor(0x000000, 1)
  gl.autoClear = false
  gl.clear(true, true, true)
  const aspect = cam3.aspect
  cam3.aspect = SEG_W / SEG_H
  cam3.updateProjectionMatrix()
  gl.render(scene, cam3)
  cam3.aspect = aspect
  cam3.updateProjectionMatrix()
  gl.setRenderTarget(prevTarget)
  gl.setClearColor(prevClear, prevAlpha)
  gl.autoClear = prevAuto
  scene.overrideMaterial = prevOverride
  scene.background = prevBg
  for (const o of hidden) o.visible = true

  c.pending = true
  const buf = c.buf
  return gl
    .readRenderTargetPixelsAsync(c.rt, 0, 0, SEG_W, SEG_H, buf)
    .catch(() => (gl.readRenderTargetPixels(c.rt, 0, 0, SEG_W, SEG_H, buf), buf))
    .then(() => {
      const r = toMask(buf, boxes, enabled, cam3, seed)
      return { ...r, ms: performance.now() - t0 }
    })
    .finally(() => {
      c.pending = false
    })
}

/** deterministic jitter 0..1 */
function jit(s: string, n: number) {
  let h = 2166136261 ^ n
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

/** id image (bottom-up) → coloured mask with outlines (top-down) + instances */
function toMask(buf: Uint8Array, boxes: SegBox[], enabled: Set<SegClassId>, cam3: THREE.PerspectiveCamera, seed: number) {
  const W = SEG_W
  const H = SEG_H
  const ids = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    const si = (H - 1 - y) * W * 4
    for (let x = 0; x < W; x++) ids[y * W + x] = buf[si + x * 4]
  }
  const n = boxes.length
  const cnt = new Uint32Array(n + 1)
  const x0 = new Int32Array(n + 1).fill(W)
  const y0 = new Int32Array(n + 1).fill(H)
  const x1 = new Int32Array(n + 1).fill(-1)
  const y1 = new Int32Array(n + 1).fill(-1)
  const sx = new Float64Array(n + 1)
  const sy = new Float64Array(n + 1)
  // a person's mask includes the PPE they wear (hat / vest pixels count for the person too)
  const personOf = new Int32Array(n + 1)
  const personId = new Map<string, number>()
  boxes.forEach((b, i) => b.cls === 'person' && personId.set(b.ref, i + 1))
  boxes.forEach((b, i) => (personOf[i + 1] = b.cls === 'hardHat' || b.cls === 'vest' ? (personId.get(b.ref) ?? 0) : 0))
  const acc = (id: number, x: number, y: number) => {
    cnt[id]++
    if (x < x0[id]) x0[id] = x
    if (x > x1[id]) x1[id] = x
    if (y < y0[id]) y0[id] = y
    if (y > y1[id]) y1[id] = y
    sx[id] += x
    sy[id] += y
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const id = ids[y * W + x]
      if (!id || id > n) continue
      acc(id, x, y)
      if (personOf[id]) acc(personOf[id], x, y)
    }
  // instances worth showing: enabled class, enough pixels (PPE items are small: lower threshold)
  const keep = new Uint8Array(n + 1)
  const instances: SegInstance[] = []
  const proj = new THREE.Vector3()
  for (let id = 1; id <= n; id++) {
    const b = boxes[id - 1]
    const minPx = b.cls === 'hardHat' || b.cls === 'vest' ? 2 : b.cls === 'person' ? 6 : 60
    if (!enabled.has(b.cls) || cnt[id] < minPx) continue
    keep[id] = 1
    // visible share of the projected box → lower score when mostly hidden (like a real detector)
    let px0 = Infinity
    let py0 = Infinity
    let px1 = -Infinity
    let py1 = -Infinity
    for (const xx of [b.min.x, b.max.x])
      for (const yy of [b.min.y, b.max.y])
        for (const zz of [b.min.z, b.max.z]) {
          proj.set(xx, yy, zz).project(cam3)
          const ix = ((proj.x + 1) / 2) * W
          const iy = ((1 - proj.y) / 2) * H
          px0 = Math.min(px0, ix)
          px1 = Math.max(px1, ix)
          py0 = Math.min(py0, iy)
          py1 = Math.max(py1, iy)
        }
    const area = Math.max(1, (Math.min(W, px1) - Math.max(0, px0)) * (Math.min(H, py1) - Math.max(0, py0)))
    const vis = Math.min(1, cnt[id] / (area * 0.55))
    const score = +Math.min(0.99, 0.55 + 0.4 * vis + 0.06 * (jit(b.ref, seed) - 0.5)).toFixed(2)
    instances.push({
      id: `${b.cls}:${b.ref}`,
      cls: b.cls,
      ref: b.ref,
      name: b.name,
      score,
      box: [x0[id] / W, y0[id] / H, (x1[id] + 1) / W, (y1[id] + 1) / H],
      anchor: [sx[id] / cnt[id] / W, y0[id] / H],
      pixels: cnt[id],
    })
  }
  const mask = new ImageData(W, H)
  const d = mask.data
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const id = ids[i]
      if (!id || !keep[id]) continue
      const col = SEG_RGB.get(boxes[id - 1].cls)!
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || ids[i - 1] !== id || ids[i + 1] !== id || ids[i - W] !== id || ids[i + W] !== id
      const o = i * 4
      d[o] = Math.round(col.r * 255)
      d[o + 1] = Math.round(col.g * 255)
      d[o + 2] = Math.round(col.b * 255)
      d[o + 3] = edge ? 245 : 105
    }
  instances.sort((a, b) => b.pixels - a.pixels)
  return { mask, instances }
}
