/**
 * Invisible pick box for environment-drawn items (drilling rig, BOP): clickable and gaze-able, never drawn. A proxy with
 * `library` also draws that component-library part, with its materials joined to the section box and x-ray.
 */
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { LIBRARY } from '../../model/libraryItems'
import type { Proxy } from '../../model/types'
import { materials, registerMaterial } from '../../three/materials'

const hidden = { transparent: true, opacity: 0, depthWrite: false, colorWrite: false }
const joined = new WeakSet<THREE.Material>()

/** the plant's material of the same name where it has one, so the part ages alike and shares the plant's draw batches */
function adopt(m: THREE.Material) {
  const own = (materials() as Record<string, THREE.Material>)[m.name]
  if (own) return own
  if (!joined.has(m)) {
    joined.add(m)
    registerMaterial(m, 'detail')
  }
  return m
}

function LibraryPart({ eq }: { eq: Proxy }) {
  const root = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    root.current?.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.material) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(adopt) : adopt(mesh.material)
    })
  }, [])
  const Part = LIBRARY[eq.library!.component].default
  return (
    <group ref={root}>
      <Part {...eq.library!.props} tag={eq.tag} />
    </group>
  )
}

export function ProxyModel({ eq }: { eq: Proxy }) {
  const [x, y, z] = eq.size
  return (
    <>
      {eq.library && <LibraryPart eq={eq} />}
      <mesh position={[0, y / 2, 0]}>
        <boxGeometry args={[x, y, z]} />
        <meshBasicMaterial {...hidden} />
      </mesh>
    </>
  )
}
