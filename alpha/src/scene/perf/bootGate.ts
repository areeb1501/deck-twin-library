/**
 * While the loader covers the screen nothing needs drawing. The camera is pointed at the staging layer only, so the frames
 * the static batcher waits on cost next to nothing, while the batches it stages still upload and bind their programs.
 * Releasing puts everything back for good.
 */
import type * as THREE from 'three'
import { WebGLRenderTarget } from 'three'

/** batches under construction sit here too: drawn (empty) while the camera holds, so their upload happens under the loader */
export const STAGE_LAYER = 31

let held: { camera: THREE.Camera; mask: number } | null = null
let done = false

export function holdFrames(camera: THREE.Camera) {
  if (held || done) return
  held = { camera, mask: camera.layers.mask }
  camera.layers.set(STAGE_LAYER)
}

let target: THREE.WebGLRenderTarget | null = null

/**
 * Run fn with the camera seeing the real view and a render target bound: programs compiled while holding would otherwise be
 * variants for a view with no lights, tone-mapped straight to the canvas, when the plant is drawn through the post-processing
 * composer (no tone mapping, linear output), so every one of them would be compiled again at the first real frame.
 */
export function withView<T>(gl: THREE.WebGLRenderer, fn: () => T): T {
  const c = held?.camera
  if (c) c.layers.mask = held!.mask
  target ??= new WebGLRenderTarget(4, 4)
  const prev = gl.getRenderTarget()
  gl.setRenderTarget(target)
  try {
    return fn()
  } finally {
    gl.setRenderTarget(prev)
    if (c && held) c.layers.set(STAGE_LAYER)
  }
}

export function releaseFrames() {
  done = true
  if (held) held.camera.layers.mask = held.mask
  held = null
}

/** still loading: the batcher doesn't need its usual patience with a plant being edited */
export const booting = () => !done
