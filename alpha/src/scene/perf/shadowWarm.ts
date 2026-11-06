/**
 * The shadow pass compiles its own depth variant for every kind of caster (plain, instanced, skinned, batched) and material
 * state (side, map, alpha test, clipped shadows), one by one at the first shadow render. A representative of each is compiled
 * here ahead of it, in the driver's threads with the rest, with the lights cloned so the program parameters see the same counts.
 */
import * as THREE from 'three'

const shadowSide: Record<number, THREE.Side> = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide }
let tri: THREE.BufferGeometry | null = null

type Textured = THREE.Material & { map?: THREE.Texture | null; alphaMap?: THREE.Texture | null; displacementMap?: THREE.Texture | null; displacementScale?: number; displacementBias?: number }

/** compile the depth variants the casters under `roots` will need; returns the materials, whose programs can be waited on */
export function precompileShadows(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, roots: THREE.Object3D[]) {
  if (!gl.shadowMap.enabled) return []
  tri ??= new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
    .setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
    .setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2))
    .setIndex([0, 1, 2])
  const seen = new Set<string>()
  const holder = new THREE.Group()
  const out: THREE.MeshDepthMaterial[] = []
  const add = (o: THREE.Object3D, m: Textured) => {
    if (!m?.isMaterial || !m.visible) return
    const kind = (o as THREE.BatchedMesh).isBatchedMesh ? 'b' : (o as THREE.InstancedMesh).isInstancedMesh ? 'i' : (o as THREE.SkinnedMesh).isSkinnedMesh ? 's' : 'm'
    const side = m.shadowSide ?? shadowSide[m.side]
    const clipped = gl.localClippingEnabled && m.clipShadows && !!m.clippingPlanes?.length
    const coloured = kind === 'i' && !!(o as THREE.InstancedMesh).instanceColor
    const key = [kind, side, m.map?.uuid, m.alphaMap?.uuid, m.alphaToCoverage ? 0.5 : m.alphaTest, clipped ? m.clippingPlanes!.length : 0, m.clipIntersection, m.displacementMap?.uuid, coloured].join('|')
    if (seen.has(key)) return
    seen.add(key)
    const d = new THREE.MeshDepthMaterial() // basic depth packing, as the shadow pass uses with its depth textures
    d.side = side
    d.map = m.map ?? null
    d.alphaMap = m.alphaMap ?? null
    d.alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest
    d.clipShadows = m.clipShadows
    d.clippingPlanes = clipped ? m.clippingPlanes : null
    d.clipIntersection = m.clipIntersection
    d.displacementMap = m.displacementMap ?? null
    d.displacementScale = m.displacementScale ?? 1
    d.displacementBias = m.displacementBias ?? 0
    let rep: THREE.Object3D
    if (kind === 'b') rep = new THREE.BatchedMesh(1, 3, 3, d)
    else if (kind === 'i') {
      const im = new THREE.InstancedMesh(tri!, d, 1)
      if (coloured) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3)
      rep = im
    } else if (kind === 's') {
      const sm = new THREE.SkinnedMesh(tri!, d)
      sm.bind(new THREE.Skeleton([new THREE.Bone()]))
      rep = sm
    } else rep = new THREE.Mesh(tri!, d)
    holder.add(rep)
    out.push(d)
  }
  for (const r of roots)
    r.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.castShadow) return
      if (Array.isArray(mesh.material)) for (const m of mesh.material) add(o, m)
      else add(o, mesh.material)
    })
  if (!out.length) return out
  scene.traverseVisible((o) => {
    if ((o as THREE.Light).isLight && o.layers.test(camera.layers)) holder.add(o.clone())
  })
  try {
    // an empty target scene: the shadow pass draws with no fog and no environment
    gl.compile(holder, camera, new THREE.Scene())
  } catch {
    /* compiled at the first shadow render instead */
  }
  return out
}
