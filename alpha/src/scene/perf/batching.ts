/**
 * Registry shared by the static batcher (StaticBatcher.tsx) and small-detail culling (DetailCull.tsx).
 *
 * A batched original keeps living in the scene graph exactly where React put it (picking, selection,
 * framing, the outline and every traversal still find it), but it is moved off render layer 0 so only
 * its copy inside a THREE.BatchedMesh is drawn:
 *
 *   state                layer 0   BATCH_LAYER   CULL_LAYER   batch instances
 *   batched (normal)     off       on            off          shown (when the original is visible)
 *   culled (DetailCull)  off       off           on           hidden
 *   solo (selected)      on        off           off          hidden  — drawn as itself so the outline
 *                                                                     and depth passes see the real mesh
 *
 * The scene's raycaster also tests BATCH_LAYER, so pointer events still hit the original meshes
 * (e.object, userData.pick / door, e.instanceId) exactly as before; culled detail stays unpickable as
 * it always was.
 */
import * as THREE from 'three'

export const BATCH_LAYER = 29
export const CULL_LAYER = 30

export interface Slot {
  batch: THREE.BatchedMesh
  id: number
}

export interface Entry {
  mesh: THREE.Mesh
  slots: Slot[]
  tag: string | undefined
  /** world matrix when batched (drift → the mesh is dynamic after all) */
  world: THREE.Matrix4
  material: THREE.Material | THREE.Material[]
  geometry: THREE.BufferGeometry
  culled: boolean
  solo: boolean
  /** batch instances currently visible */
  shown: boolean
  /** detached from the plant (unmounted) */
  dead: boolean
}

export const batchRegistry = {
  entries: new Map<THREE.Mesh, Entry>(),
}

function applyLayers(e: Entry) {
  const L = e.mesh.layers
  if (e.culled) {
    L.disable(0)
    L.disable(BATCH_LAYER)
    L.enable(CULL_LAYER)
  } else if (e.solo) {
    L.enable(0)
    L.disable(BATCH_LAYER)
    L.disable(CULL_LAYER)
  } else {
    L.disable(0)
    L.enable(BATCH_LAYER)
    L.disable(CULL_LAYER)
  }
}

export function setShown(e: Entry, shown: boolean) {
  if (e.shown === shown) return
  e.shown = shown
  for (const s of e.slots) s.batch.setVisibleAt(s.id, shown)
}

/** apply an entry's culled / solo state (layers now, instance visibility on the next sync) */
export function refreshEntry(e: Entry, visible: boolean) {
  applyLayers(e)
  setShown(e, visible && !e.culled && !e.solo && !e.dead)
}

/** DetailCull hook: returns false when the mesh is not batched (DetailCull flips its layers itself) */
export function setBatchedCulled(mesh: THREE.Object3D, cull: boolean): boolean {
  const e = batchRegistry.entries.get(mesh as THREE.Mesh)
  if (!e) return false
  if (e.culled !== cull) {
    e.culled = cull
    applyLayers(e)
    if (cull) setShown(e, false)
    // un-culling: the batcher's per-frame sync shows the instances again (it knows ancestor visibility)
  }
  return true
}

/** put an original back to being drawn as itself */
export function releaseEntry(e: Entry) {
  setShown(e, false)
  const L = e.mesh.layers
  L.disable(BATCH_LAYER)
  if (e.culled) {
    L.disable(0)
    L.enable(CULL_LAYER)
  } else {
    L.enable(0)
    L.disable(CULL_LAYER)
  }
  batchRegistry.entries.delete(e.mesh)
}
