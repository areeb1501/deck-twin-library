/**
 * Static batching of the plant: after the plant has mounted and settled, every static, non-instanced
 * mesh under the plant root (equipment kits, valve bodies, instruments, merged pipe runs) is copied,
 * one draw group at a time, into THREE.BatchedMesh objects — one per material (+ shadow flags), drawn
 * with WEBGL_multi_draw. ~9 000 draw groups become a few hundred multi-draw calls, which is what the
 * frame time was spent on (per-draw uniform uploads), with identical pixels: the batches use the very
 * same material objects, so x-ray, the section box / ceiling cut, live screens and any per-material
 * change apply unchanged.
 *
 * The originals stay in the scene graph (see batching.ts for the layer scheme) so picking, selection,
 * framing, the outline and every traversal behave exactly as before (see RELEASE_ORIGINAL_GPU).
 *
 * In x-ray every original is drawn as itself (translucent blending is ordered per mesh; a batch would
 * be ordered as one unit) — x-ray then costs what it always did.
 *
 * Excluded: anything under a `userData.noBatch` ancestor (Spinner / Door / Slider in anim.tsx, valve
 * moving parts), instanced / skinned / morphed meshes, custom shaders, non-zero renderOrder, custom
 * onBeforeRender, mirrored transforms. Safety nets: a batched mesh whose world matrix, material or
 * geometry changes is handed back to normal rendering at once; one that unmounts or is hidden has its
 * batch copies hidden in the same frame.
 *
 * Rebuilds (plant / layer changes, remounts) are debounced and run in ≤ 7 ms slices off the critical
 * path; shaders are compiled with compileAsync, GPU uploads are staged ≤ ~1 M vertices per frame, and
 * the switch-over happens in one frame. `?nobatch` disables it (A/B comparisons).
 */
import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore } from '../../state/store'
import { BATCH_LAYER, CULL_LAYER, batchRegistry, refreshEntry, releaseEntry, setShown, type Entry, type Slot } from './batching'
import { requestShadows } from './shadows'

const DISABLED = new URLSearchParams(location.search).has('nobatch')
/** vertices per BatchedMesh: bounds the size of each GPU upload */
const MAX_VERTS = 1_000_000
/** main-thread budget per build slice */
const SLICE_MS = 7
/** GPU upload budget per frame while staging */
const UPLOAD_VERTS_PER_FRAME = 1_200_000
/**
 * Free the originals' GPU buffers once batched. Off: x-ray (and the first select of each item) draws
 * the originals, and re-uploading ~300 MB of plant geometry on the x-ray toggle froze the page for
 * seconds. The price is that plant geometry sits in GPU memory twice (batch + original, ~+280 MB on
 * Alpha); the batches' CPU copies are released after upload, so JS memory is unchanged.
 */
const RELEASE_ORIGINAL_GPU = false
const ALLOWED = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial'])
/** materials only visible through a section cut or in x-ray (which draws the originals): their batches are skipped otherwise */
const INSIDE = /^batch:(pipeBore|vesselInner|internalsSteel|meshPad|liquid)/
const noRaycast = () => {}
const baseBeforeRender = THREE.Object3D.prototype.onBeforeRender
const baseAfterRender = THREE.Object3D.prototype.onAfterRender
const baseBeforeCompile = THREE.Material.prototype.onBeforeCompile

interface Piece {
  key: string
  material: THREE.Material
  cast: boolean
  receive: boolean
  geo: THREE.BufferGeometry
  start: number
  count: number
  mesh: THREE.Mesh
  matrix: THREE.Matrix4
  cell: number
}

interface Planned {
  mesh: THREE.Mesh
  world: THREE.Matrix4
  slots: Slot[]
}

interface Job {
  cancelled: boolean
  phase: 'build' | 'stage' | 'swap' | 'done'
  batches: THREE.BatchedMesh[]
  planned: Planned[]
  geoUsers: Map<THREE.BufferGeometry, number>
  stageIndex: number
  /** progress / timing, for the dev tools (window.__batch) */
  stats: { t0: number; step: string; slices: number; pieces: number; meshes: number; buildMs: number; activeMs: number; compileMs: number; swapAt: number }
}

const CANCEL = Symbol('cancel')

/** yield to the browser (input, rendering) and resume as soon as possible */
const yieldTask = (() => {
  const sch = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (sch?.yield) return () => sch.yield!()
  const ch = new MessageChannel()
  const q: (() => void)[] = []
  ch.port1.onmessage = () => q.shift()?.()
  return () =>
    new Promise<void>((r) => {
      q.push(r)
      ch.port2.postMessage(0)
    })
})()

/** 1 = visible, 0 = hidden (itself or an ancestor), -1 = no longer under the plant root */
function visibility(o: THREE.Object3D, root: THREE.Object3D): number {
  let vis = true
  let a: THREE.Object3D | null = o
  while (a) {
    if (a === root) return vis ? 1 : 0
    if (!a.visible) vis = false
    a = a.parent
  }
  return -1
}

function pickTag(o: THREE.Object3D): string | undefined {
  let a: THREE.Object3D | null = o
  while (a) {
    const t = (a.userData?.pick as { tag?: string } | undefined)?.tag
    if (t) return t
    a = a.parent
  }
  return undefined
}

function sameMaterial(a: THREE.Material | THREE.Material[], b: THREE.Material | THREE.Material[]) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function matEq(a: THREE.Matrix4, b: THREE.Matrix4) {
  const x = a.elements
  const y = b.elements
  for (let i = 0; i < 16; i++) if (Math.abs(x[i] - y[i]) > 1e-5) return false
  return true
}

function materialOk(m: THREE.Material | undefined) {
  if (!m) return true // three skips groups without a material; so do we
  if (!ALLOWED.has(m.type)) return false
  // the shared weathering patch handles batching (materials.ts); any other custom shader might not
  if (m.onBeforeCompile !== baseBeforeCompile && !String(m.customProgramCacheKey()).startsWith('weather')) return false
  return true
}

function attrOk(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined, size: number) {
  return !!a && !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && a.itemSize === size && !a.normalized && a.array instanceof Float32Array
}

/** pieces of a mesh (one per drawn group), or null when the mesh must stay as it is */
function piecesOf(mesh: THREE.Mesh, rootInv: THREE.Matrix4): Piece[] | null {
  const g = mesh.geometry
  if (!g || !g.index || mesh.renderOrder !== 0) return null
  if (mesh.onBeforeRender !== baseBeforeRender || mesh.onAfterRender !== baseAfterRender) return null
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return null
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || Object.keys(g.morphAttributes).length) return null
  const names = Object.keys(g.attributes)
  if (names.length !== 3 || !attrOk(g.attributes.position, 3) || !attrOk(g.attributes.normal, 3) || !attrOk(g.attributes.uv, 2)) return null
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return null
  const matrix = rootInv.clone().multiply(mesh.matrixWorld)
  if (matrix.determinant() <= 0) return null // mirrored: one batch can't flip winding per item
  const p = new THREE.Vector3().setFromMatrixPosition(matrix)
  const cell = Math.floor(p.x / 40) * 1000 + Math.floor(p.z / 40)
  const idxCount = g.index.count
  const out: Piece[] = []
  const add = (material: THREE.Material | undefined, start: number, count: number) => {
    if (!material) return
    count = Math.min(count, idxCount - start)
    if (count <= 0) return
    out.push({ key: `${material.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}`, material, cast: mesh.castShadow, receive: mesh.receiveShadow, geo: g, start, count, mesh, matrix, cell })
  }
  if (Array.isArray(mesh.material)) {
    if (!g.groups.length) return null
    for (const m of mesh.material) if (!materialOk(m)) return null
    for (const gr of g.groups) add(mesh.material[gr.materialIndex ?? 0], gr.start, gr.count)
  } else {
    if (!materialOk(mesh.material)) return null
    add(mesh.material, 0, idxCount)
  }
  return out.length ? out : null
}

let scratch = new Int32Array(1 << 16)

/** compact copy of one index range of a geometry (only the vertices it uses) */
function extract(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const idx = g.index!.array
  let mn = Infinity
  let mx = -1
  for (let i = start, e = start + count; i < e; i++) {
    const v = idx[i]
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const range = mx - mn + 1
  if (scratch.length < range) scratch = new Int32Array(Math.max(range, scratch.length * 2))
  const remap = scratch
  remap.fill(-1, 0, range)
  let n = 0
  const tmpIdx = new Uint32Array(count)
  for (let i = 0; i < count; i++) {
    const v = idx[start + i] - mn
    let r = remap[v]
    if (r < 0) r = remap[v] = n++
    tmpIdx[i] = r
  }
  const P = g.attributes.position.array as Float32Array
  const N = g.attributes.normal.array as Float32Array
  const U = g.attributes.uv.array as Float32Array
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  const uv = new Float32Array(n * 2)
  for (let v = 0; v < range; v++) {
    const r = remap[v]
    if (r < 0) continue
    const s = mn + v
    pos[r * 3] = P[s * 3]
    pos[r * 3 + 1] = P[s * 3 + 1]
    pos[r * 3 + 2] = P[s * 3 + 2]
    nor[r * 3] = N[s * 3]
    nor[r * 3 + 1] = N[s * 3 + 1]
    nor[r * 3 + 2] = N[s * 3 + 2]
    uv[r * 2] = U[s * 2]
    uv[r * 2 + 1] = U[s * 2 + 1]
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  out.setIndex(new THREE.BufferAttribute(n > 65535 ? tmpIdx : new Uint16Array(tmpIdx), 1))
  // bounds now, while the data is here: the batch keeps them, and its own CPU copy is released after upload
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

/** batches with more items than this cull / sort per item; smaller ones are drawn whole (no per-pass work) */
const PER_ITEM_MIN = 32

/**
 * BatchedMesh re-culls, re-sorts and re-uploads its indirect texture on every pass whenever per-item
 * culling or sorting is on. Skip that while nothing changed for this camera (the same pass camera, at
 * rest, item visibility unchanged): the previous draw list and texture are still valid.
 */
function cacheDrawList(b: THREE.BatchedMesh) {
  const run = THREE.BatchedMesh.prototype.onBeforeRender
  const lastV = new Float32Array(16)
  const lastP = new Float32Array(16)
  let lastCam = -1
  let lastT = false
  const internal = b as unknown as { _visibilityChanged: boolean }
  b.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    const v = camera.matrixWorldInverse.elements
    const pr = camera.projectionMatrix.elements
    if (!internal._visibilityChanged && camera.id === lastCam && material.transparent === lastT) {
      let same = true
      for (let i = 0; i < 16 && same; i++) same = v[i] === lastV[i] && pr[i] === lastP[i]
      if (same) return
    }
    run.call(this, renderer, scene, camera, geometry, material, group)
    lastCam = camera.id
    lastT = material.transparent
    lastV.set(v)
    lastP.set(pr)
  }
}

/** after the first upload a batch's CPU copy is not needed (it is never edited, only shown / hidden) */
function releaseAfterUpload(b: THREE.BatchedMesh) {
  const free = function (this: THREE.BufferAttribute) {
    const C = this.array.constructor as new (n: number) => THREE.TypedArray
    this.array = new C(0)
  }
  for (const a of Object.values(b.geometry.attributes)) (a as THREE.BufferAttribute).onUpload(free)
  b.geometry.index?.onUpload(free)
}

export function StaticBatcher({ root }: { root: RefObject<THREE.Object3D | null> }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const raycaster = useThree((s) => s.raycaster)
  const st = useRef({
    job: null as Job | null,
    batches: [] as THREE.BatchedMesh[],
    rejected: new WeakSet<THREE.Object3D>(),
    dynamic: new WeakSet<THREE.Object3D>(),
    nextScan: 0,
    lastPending: -1,
    dirty: true,
    rr: 0,
    sel: undefined as string | undefined,
    /** x-ray: everything is translucent and blend order matters per mesh — draw the originals */
    xray: false,
    last: null as Job['stats'] | null,
  })
  const supported = !DISABLED && gl.extensions.has('WEBGL_multi_draw')
  if (import.meta.env.DEV) Object.assign(window, { __batch: st.current, __batchRegistry: batchRegistry })

  useEffect(() => {
    if (!supported) return
    raycaster.layers.enable(BATCH_LAYER)
    const s = st.current
    const read = (x: ReturnType<typeof useStore.getState>) => {
      s.sel = x.selected?.tag
      s.xray = x.viewMode === 'xray'
    }
    const unsub = useStore.subscribe(read)
    read(useStore.getState())
    return () => {
      unsub()
      raycaster.layers.disable(BATCH_LAYER)
      if (s.job) s.job.cancelled = true
      for (const b of s.job?.batches ?? []) {
        b.removeFromParent()
        b.dispose()
      }
      s.job = null
      for (const e of [...batchRegistry.entries.values()]) releaseEntry(e)
      for (const b of s.batches) {
        b.removeFromParent()
        b.dispose()
      }
      s.batches = []
    }
  }, [supported, raycaster])

  /** meshes under the root that are not batched yet and might be (cheap test, no validation) */
  const pendingCount = (r: THREE.Object3D) => {
    const s = st.current
    let n = 0
    const stack: THREE.Object3D[] = [...r.children]
    while (stack.length) {
      const o = stack.pop()!
      if (o.userData.noBatch || (o as THREE.BatchedMesh).isBatchedMesh) continue
      const m = o as THREE.Mesh
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !batchRegistry.entries.has(m) && !s.rejected.has(m) && !s.dynamic.has(m)) n++
      for (const c of o.children) stack.push(c)
    }
    return n
  }

  async function build(job: Job, r: THREE.Object3D) {
    const s = st.current
    let t = performance.now()
    const tick = async () => {
      if (performance.now() - t < SLICE_MS) return
      job.stats.slices++
      job.stats.activeMs += performance.now() - t
      await yieldTask()
      t = performance.now()
      if (job.cancelled) throw CANCEL
    }
    r.updateWorldMatrix(true, true)
    const rootInv = r.matrixWorld.clone().invert()
    // every mesh's geometry users under the root (to know which originals' GPU buffers can go)
    const geoUsers = new Map<THREE.BufferGeometry, number>()
    r.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !(m as THREE.BatchedMesh).isBatchedMesh) geoUsers.set(m.geometry, (geoUsers.get(m.geometry) ?? 0) + 1)
    })
    job.geoUsers = geoUsers
    // 1. candidates → pieces
    const pieces: Piece[] = []
    const stack: THREE.Object3D[] = [...r.children]
    while (stack.length) {
      const o = stack.pop()!
      if (o.userData.noBatch || (o as THREE.BatchedMesh).isBatchedMesh) continue
      for (const c of o.children) stack.push(c)
      const m = o as THREE.Mesh
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || s.dynamic.has(m) || s.rejected.has(m)) continue
      if (visibility(m, r) < 0) continue
      const ps = piecesOf(m, rootInv)
      if (!ps) {
        s.rejected.add(m)
        continue
      }
      for (const p of ps) pieces.push(p)
      await tick()
    }
    job.stats.pieces = pieces.length
    job.stats.step = 'extract'
    // 2. group by batch key, spatially ordered so each chunk is a compact region
    const byKey = new Map<string, Piece[]>()
    for (const p of pieces) {
      let a = byKey.get(p.key)
      if (!a) byKey.set(p.key, (a = []))
      a.push(p)
    }
    const planned = new Map<THREE.Mesh, Planned>()
    const subCache = new Map<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>()
    const sub = (p: Piece) => {
      let m = subCache.get(p.geo)
      if (!m) subCache.set(p.geo, (m = new Map()))
      const k = `${p.start}:${p.count}`
      let gg = m.get(k)
      if (!gg) m.set(k, (gg = extract(p.geo, p.start, p.count)))
      return gg
    }
    for (const list of byKey.values()) {
      list.sort((a, b) => a.cell - b.cell)
      // chunk by vertex budget
      let i = 0
      while (i < list.length) {
        const chunk: Piece[] = []
        const geos = new Map<THREE.BufferGeometry, number>()
        let verts = 0
        let idx = 0
        while (i < list.length) {
          const p = list[i]
          const g = sub(p)
          const nv = geos.has(g) ? 0 : g.attributes.position.count
          if (chunk.length && verts + nv > MAX_VERTS) break
          if (!geos.has(g)) {
            geos.set(g, -1)
            verts += nv
            idx += g.index!.count
          }
          chunk.push(p)
          i++
          await tick()
        }
        const p0 = chunk[0]
        const b = new THREE.BatchedMesh(chunk.length, Math.max(verts, 3), Math.max(idx, 3), p0.material)
        b.name = `batch:${p0.material.name || p0.material.type}`
        b.castShadow = p0.cast
        b.receiveShadow = p0.receive
        b.raycast = noRaycast
        b.userData.noCull = true
        b.userData.noBatch = true
        b.frustumCulled = false // until it has been uploaded (staging), then true
        for (const g of geos.keys()) {
          geos.set(g, b.addGeometry(g))
          await tick()
        }
        for (const p of chunk) {
          const id = b.addInstance(geos.get(sub(p))!)
          b.setMatrixAt(id, p.matrix)
          b.setVisibleAt(id, false)
          let pl = planned.get(p.mesh)
          if (!pl) planned.set(p.mesh, (pl = { mesh: p.mesh, world: p.mesh.matrixWorld.clone(), slots: [] }))
          pl.slots.push({ batch: b, id })
        }
        b.computeBoundingBox()
        b.computeBoundingSphere()
        // per-item culling / sorting only pays off for big batches; small ones take three's fast path
        const big = chunk.length > PER_ITEM_MIN
        b.perObjectFrustumCulled = big
        b.sortObjects = big
        if (big) cacheDrawList(b)
        releaseAfterUpload(b)
        job.batches.push(b)
        await tick()
      }
    }
    subCache.clear()
    job.planned = [...planned.values()]
    job.stats.meshes = job.planned.length
    job.stats.buildMs = Math.round(performance.now() - job.stats.t0)
    job.stats.step = 'compile'
    const tc = performance.now()
    // 3. compile the batching shader variants without blocking (KHR_parallel_shader_compile)
    if (job.batches.length) {
      const holder = new THREE.Group()
      for (const b of job.batches) holder.add(b)
      try {
        await gl.compileAsync(holder, camera, scene)
      } catch {
        /* compiled synchronously on first draw instead */
      }
      for (const b of job.batches) holder.remove(b)
    }
    if (job.cancelled) throw CANCEL
    job.stats.compileMs = Math.round(performance.now() - tc)
    job.stats.step = 'stage'
    job.phase = 'stage'
  }

  function swap(job: Job, r: THREE.Object3D) {
    const s = st.current
    const keep = new Set(job.planned.map((p) => p.mesh))
    // originals no longer batched (or batched anew) go back to themselves first
    const prevCulled = new Map<THREE.Mesh, boolean>()
    for (const e of [...batchRegistry.entries.values()]) {
      prevCulled.set(e.mesh, e.culled)
      if (!keep.has(e.mesh)) releaseEntry(e)
      else batchRegistry.entries.delete(e.mesh)
    }
    for (const b of s.batches) {
      b.removeFromParent()
      b.dispose()
    }
    s.batches = job.batches
    for (const b of job.batches) b.frustumCulled = true
    const counts = new Map<THREE.BufferGeometry, number>()
    for (const p of job.planned) {
      const m = p.mesh
      const L = m.layers
      const culled = prevCulled.get(m) ?? (!L.isEnabled(0) && L.isEnabled(CULL_LAYER))
      const e: Entry = { mesh: m, slots: p.slots, tag: pickTag(m), world: p.world, material: m.material, geometry: m.geometry, culled, solo: false, shown: false, dead: false }
      e.solo = s.xray || (!!s.sel && e.tag === s.sel)
      batchRegistry.entries.set(m, e)
      const v = visibility(m, r)
      if (v < 0) e.dead = true
      refreshEntry(e, v === 1)
      counts.set(m.geometry, (counts.get(m.geometry) ?? 0) + 1)
    }
    // the originals' GPU copies are now unused (unless something unbatched shares the geometry)
    if (RELEASE_ORIGINAL_GPU) for (const [g, n] of counts) if (job.geoUsers.get(g) === n) g.dispose()
    // the shadow map content is unchanged, but warm the batched depth shaders now, during the load
    requestShadows(0)
    job.phase = 'done'
    job.stats.step = 'done'
    job.stats.swapAt = Math.round(performance.now())
    s.last = job.stats
    s.job = null
    if (import.meta.env.DEV) {
      let inst = 0
      for (const b of s.batches) inst += b.instanceCount
      console.debug(`[batch] ${s.batches.length} batches, ${inst} items from ${batchRegistry.entries.size} meshes`)
    }
  }

  // bores and vessel internals are a seventh of the triangles and can't be seen from outside
  useFrame(() => {
    const ui = useStore.getState()
    const cut = ui.section.enabled || ui.viewMode !== 'shaded' || !ui.layers.ceiling
    for (const b of st.current.batches) if (INSIDE.test(b.name)) b.visible = cut
  })
  useFrame(() => {
    if (!supported) return
    const r = root.current
    if (!r) return
    const s = st.current
    const now = performance.now()

    // ---- keep batch copies in step with the originals (every frame, cheap)
    const sel = s.sel
    for (const e of batchRegistry.entries.values()) {
      if (e.dead) continue
      const v = visibility(e.mesh, r)
      if (v < 0) {
        e.dead = true
        setShown(e, false)
        s.dirty = true
        continue
      }
      if (e.mesh.geometry !== e.geometry || !sameMaterial(e.mesh.material, e.material)) {
        releaseEntry(e)
        s.dirty = true
        continue
      }
      const solo = s.xray || (!!sel && e.tag === sel)
      if (solo !== e.solo) {
        e.solo = solo
        refreshEntry(e, v === 1)
      } else setShown(e, v === 1 && !e.culled && !e.solo)
    }
    // matrix drift (something animates a mesh we thought static): a slice of the entries per frame
    const list = batchRegistry.entries.size ? [...batchRegistry.entries.values()] : []
    for (let k = 0; k < Math.min(256, list.length); k++) {
      s.rr = (s.rr + 1) % list.length
      const e = list[s.rr]
      if (!e.dead && !matEq(e.mesh.matrixWorld, e.world)) {
        s.dynamic.add(e.mesh)
        releaseEntry(e)
      }
    }

    // ---- staged upload, then the one-frame switch-over
    const job = s.job
    if (job?.phase === 'stage') {
      let budget = UPLOAD_VERTS_PER_FRAME
      while (job.stageIndex < job.batches.length && budget > 0) {
        const b = job.batches[job.stageIndex++]
        budget -= b.geometry.attributes.position.count
        r.add(b) // drawn with every instance hidden: uploads geometry + binds programs, draws nothing
      }
      if (job.stageIndex >= job.batches.length) job.phase = 'swap'
      return
    }
    if (job?.phase === 'swap') {
      swap(job, r)
      return
    }

    // ---- look for changes once a second; rebuild once the plant has been stable for a scan
    if (job || now < s.nextScan) return
    s.nextScan = now + 1000
    let dead = 0
    for (const e of batchRegistry.entries.values()) if (e.dead) dead++
    const pending = pendingCount(r)
    const changed = pending > 0 || dead > 0
    if (!changed) {
      s.lastPending = -1
      return
    }
    const sig = pending * 100000 + dead
    if (sig !== s.lastPending) {
      s.lastPending = sig // wait one more scan: the plant may still be mounting
      return
    }
    s.lastPending = -1
    const nj: Job = { cancelled: false, phase: 'build', batches: [], planned: [], geoUsers: new Map(), stageIndex: 0, stats: { t0: now, step: 'collect', slices: 0, pieces: 0, meshes: 0, buildMs: 0, activeMs: 0, compileMs: 0, swapAt: 0 } }
    s.job = nj
    build(nj, r).catch((err) => {
      if (err !== CANCEL) console.warn('[batch] build failed', err)
      for (const b of nj.batches) b.dispose()
      if (s.job === nj) s.job = null
    })
  })
  return null
}
