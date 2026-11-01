/**
 * While the loader covers the screen nothing needs drawing. After the first full frame has uploaded the plant and built
 * its shaders, the camera is pointed at no layer, so the frames the static batcher waits on cost next to nothing.
 * Releasing puts everything back for the frame the loader fades into.
 */
import type * as THREE from 'three'

let held: { camera: THREE.Camera; mask: number } | null = null
let done = false

export function holdFrames(camera: THREE.Camera) {
  if (held || done) return
  held = { camera, mask: camera.layers.mask }
  camera.layers.disableAll()
}

export function releaseFrames() {
  done = true
  if (held) held.camera.layers.mask = held.mask
  held = null
}

/** still loading: the batcher doesn't need its usual patience with a plant being edited */
export const booting = () => !done
