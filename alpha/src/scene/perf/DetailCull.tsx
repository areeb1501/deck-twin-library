/**
 * Small-detail culling: anything under the plant root that would cover only a pixel or two on screen
 * (instruments, small valves, bolts, supports seen from across the field) is not drawn. Up close every
 * detail is there; from the overview the GPU skips thousands of sub-pixel draw calls.
 *
 * Culled objects are moved to an unused render layer instead of toggling `visible`, so nothing else that
 * shows / hides meshes is disturbed; the camera, the shadow camera and the raycaster only see layer 0.
 * Instanced meshes (bolts, nuts, fittings) are judged by one instance's size at the nearest point of
 * their spread. Re-evaluated only when the camera moves. Statically batched meshes (StaticBatcher) are
 * culled by hiding their batch copies.
 */
import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { QUALITY, useQuality } from './quality'
import { useStore } from '../../state/store'
import { CULL_LAYER, setBatchedCulled } from './batching'

interface Rec {
  o: THREE.Mesh
  c: THREE.Vector3
  /** world radius of the whole mesh */
  r: number
  /** radius that decides visibility (one instance for instanced meshes) */
  feature: number
  instanced: boolean
  tag: string | undefined
  culled: boolean
}

const _s = new THREE.Sphere()

function pickTag(o: THREE.Object3D): string | undefined {
  let a: THREE.Object3D | null = o
  while (a) {
    const t = (a.userData?.pick as { tag?: string } | undefined)?.tag
    if (t) return t
    a = a.parent
  }
  return undefined
}

export function DetailCull({ roots }: { roots: RefObject<THREE.Object3D | null>[] }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const recs = useRef<Rec[]>([])
  const seen = useRef(new WeakSet<THREE.Object3D>())
  const last = useRef({ pos: new THREE.Vector3(1e9, 0, 0), q: new THREE.Quaternion(), fov: 0, h: 0, level: -1, n: -1, sel: '' as string | undefined })
  const level = useQuality((s) => s.level)
  const selected = useStore((s) => s.selected?.tag)

  // (re)collect meshes: on mount and every 2 s (equipment, piping and overlays mount lazily)
  useEffect(() => {
    const collect = () => {
      const keep: Rec[] = []
      for (const rec of recs.current) if (rec.o.parent) keep.push(rec)
      for (const ref of roots) {
        ref.current?.traverse((o) => {
          const m = o as THREE.Mesh
          if (!m.isMesh || seen.current.has(m) || m.userData?.noCull) return
          seen.current.add(m)
          const g = m.geometry
          if (!g.boundingSphere) g.computeBoundingSphere()
          if (!g.boundingSphere) return
          const inst = (m as THREE.InstancedMesh).isInstancedMesh
          m.updateWorldMatrix(true, false)
          if (inst) {
            const im = m as THREE.InstancedMesh
            if (!im.boundingSphere) im.computeBoundingSphere()
            _s.copy(im.boundingSphere!).applyMatrix4(m.matrixWorld)
          } else _s.copy(g.boundingSphere).applyMatrix4(m.matrixWorld)
          const scale = m.matrixWorld.getMaxScaleOnAxis()
          keep.push({ o: m, c: _s.center.clone(), r: _s.radius, feature: inst ? g.boundingSphere.radius * scale : _s.radius, instanced: inst, tag: pickTag(m), culled: false })
        })
      }
      recs.current = keep
    }
    collect()
    const id = setInterval(collect, 2000)
    return () => {
      clearInterval(id)
      for (const r of recs.current) if (r.culled && !setBatchedCulled(r.o, false)) r.o.layers.enable(0)
      recs.current = []
      seen.current = new WeakSet()
    }
  }, [roots])

  useFrame(() => {
    const L = last.current
    const cam = camera as THREE.PerspectiveCamera
    const moved = L.pos.distanceToSquared(cam.position) > 0.04 || L.q.angleTo(cam.quaternion) > 0.002 || L.fov !== cam.fov || L.h !== size.height
    if (!moved && L.level === level && L.n === recs.current.length && L.sel === selected) return
    L.pos.copy(cam.position)
    L.q.copy(cam.quaternion)
    L.fov = cam.fov
    L.h = size.height
    L.level = level
    L.n = recs.current.length
    L.sel = selected
    const k = size.height / 2 / Math.tan((cam.fov * Math.PI) / 360)
    const min = QUALITY.cullPx[level]
    for (const r of recs.current) {
      // distance to the nearest point of the object (its spread, for instanced detail)
      const d = Math.max(0.5, r.c.distanceTo(cam.position) - (r.instanced ? r.r : 0))
      const cull = (r.feature / d) * k < min && r.tag !== selected
      if (cull === r.culled) continue
      r.culled = cull
      // statically batched originals: hide / show their batch copies instead (see batching.ts)
      if (setBatchedCulled(r.o, cull)) continue
      if (cull) {
        r.o.layers.disable(0)
        r.o.layers.enable(CULL_LAYER)
      } else {
        r.o.layers.enable(0)
        r.o.layers.disable(CULL_LAYER)
      }
    }
  })
  return null
}
