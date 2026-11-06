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
const lit = new Set<THREE.Object3D>()

export function holdFrames(camera: THREE.Camera, scene: THREE.Object3D) {
  if (held || done) return
  held = { camera, mask: camera.layers.mask }
  camera.layers.set(STAGE_LAYER)
  stageLights(scene)
}

/** the lights see the staging layer too: a frame drawn without them would compile shadowless variants of every batch */
export function stageLights(scene: THREE.Object3D) {
  if (!held) return
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight && !lit.has(o)) {
      lit.add(o)
      o.layers.enable(STAGE_LAYER)
    }
  })
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
  for (const o of lit) o.layers.disable(STAGE_LAYER)
  lit.clear()
}

/** still loading: the batcher doesn't need its usual patience with a plant being edited */
export const booting = () => !done
