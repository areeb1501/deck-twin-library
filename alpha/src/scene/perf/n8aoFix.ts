/**
 * Two fixes for the N8AO post pass (n8ao 1.x, transparency-aware mode, auto-enabled because the scene
 * has glass / liquids / the sea):
 *
 *  1. Its depth-write transparency pass hides everything but transparent objects with
 *     `obj.visible = old && obj.material.transparent && …`. For a multi-material mesh `material` is an
 *     array, the expression is `undefined`, and three only skips `visible === false` — so every
 *     multi-material mesh in the scene was drawn a second time each frame (~7 000 extra draw calls).
 *     The replacement below coerces to a boolean and walks the scene once instead of four times.
 *  2. `detectTransparency()` traverses the whole scene every frame; once transparency is detected it
 *     can never switch back off, so stop looking after that (and look at most twice a second before).
 */
import * as THREE from 'three'

interface N8AOLike {
  scene: THREE.Scene
  camera: THREE.Camera
  configuration: { transparencyAware: boolean; depthBufferType: number }
  autoDetectTransparency: boolean
  depthTexture: THREE.Texture
  depthCopyPass: { material: THREE.ShaderMaterial; render: (r: THREE.WebGLRenderer) => void }
  transparencyRenderTargetDWFalse: THREE.WebGLRenderTarget
  transparencyRenderTargetDWTrue: THREE.WebGLRenderTarget
  renderTransparency: (r: THREE.WebGLRenderer) => void
  detectTransparency: () => void
  __patched?: boolean
}

const REVERSE_DEPTH = 3 // n8ao DepthType.Reverse (Default 1, Log 2)

export function patchN8AO(pass: unknown) {
  const p = pass as N8AOLike | null
  if (!p || p.__patched || typeof p.renderTransparency !== 'function') return
  p.__patched = true

  const origDetect = p.detectTransparency.bind(p)
  let lastDetect = 0
  p.detectTransparency = () => {
    if (p.configuration.transparencyAware || !p.autoDetectTransparency) return
    const now = performance.now()
    if (now - lastDetect < 500) return
    lastDetect = now
    origDetect()
  }

  const objs: THREE.Object3D[] = []
  const vis: boolean[] = []
  const clear = new THREE.Color()
  p.renderTransparency = (renderer: THREE.WebGLRenderer) => {
    const scene = p.scene
    const oldBackground = scene.background
    renderer.getClearColor(clear)
    const oldClearAlpha = renderer.getClearAlpha()
    const oldAutoClearDepth = renderer.autoClearDepth
    objs.length = 0
    vis.length = 0
    scene.traverse((o) => {
      if ((o as THREE.Mesh).material) {
        objs.push(o)
        vis.push(o.visible)
      }
    })
    scene.background = null
    renderer.autoClearDepth = false
    renderer.setClearColor(0x000000, 0)
    const u = p.depthCopyPass.material.uniforms
    u.depthTexture.value = p.depthTexture
    u.reverseDepthBuffer.value = p.configuration.depthBufferType === REVERSE_DEPTH
    // transparent objects WITHOUT depth write
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i]
      const m = (o as THREE.Mesh).material as THREE.Material
      o.visible = vis[i] && ((!!m.transparent && !m.depthWrite && !o.userData.treatAsOpaque) || !!o.userData.cannotReceiveAO)
    }
    renderer.setRenderTarget(p.transparencyRenderTargetDWFalse)
    renderer.clear(true, true, true)
    p.depthCopyPass.render(renderer)
    renderer.render(scene, p.camera)
    // transparent objects WITH depth write
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i]
      const m = (o as THREE.Mesh).material as THREE.Material
      o.visible = vis[i] && !!m.transparent && !!m.depthWrite && !o.userData.treatAsOpaque
    }
    renderer.setRenderTarget(p.transparencyRenderTargetDWTrue)
    renderer.clear(true, true, true)
    p.depthCopyPass.render(renderer)
    renderer.render(scene, p.camera)
    for (let i = 0; i < objs.length; i++) objs[i].visible = vis[i]
    renderer.setClearColor(clear, oldClearAlpha)
    scene.background = oldBackground
    renderer.autoClearDepth = oldAutoClearDepth
  }
}
