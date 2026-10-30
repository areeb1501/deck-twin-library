/**
 * Tripped machines: a pulsing red ring on the deck around every machine the simulation reports
 * `tripped` (its footprint from model/footprint.ts). One instanced mesh; colours are only uploaded
 * while something is tripped. DECK-LOCAL — mount inside the deck group (or under a [0, 28, 0] group).
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Plant } from '../../model/types'
import { footprints } from '../../model/footprint'
import { simStatus } from './simRead'

const MACHINES = new Set(['pumpPackage', 'compressorPackage', 'gasTurbineGenerator', 'caissonPump', 'chemSkid', 'transformer'])
const RED = new THREE.Color(1.0, 0.05, 0.03)
const _m = new THREE.Matrix4()
const _c = new THREE.Color()

export function TripHalos({ plant }: { plant: Plant }) {
  const items = useMemo(() => {
    const eq = plant.equipment.filter((e) => MACHINES.has(e.kind))
    const fp = footprints(eq, 0.5)
    return eq.map((e, i) => {
      const f = fp[i]
      return { tag: e.tag, m: new THREE.Matrix4().compose(new THREE.Vector3((f.x0 + f.x1) / 2, e.position[1] + 0.06, (f.z0 + f.z1) / 2), new THREE.Quaternion(), new THREE.Vector3((f.x1 - f.x0) / 2, 1, (f.z1 - f.z0) / 2)) }
    })
  }, [plant])
  const mesh = useMemo(() => {
    // unit square frame (follows rectangular skids better than a circle), flat on the deck
    const s = new THREE.Shape([new THREE.Vector2(-1, -1), new THREE.Vector2(1, -1), new THREE.Vector2(1, 1), new THREE.Vector2(-1, 1)])
    s.holes.push(new THREE.Path([new THREE.Vector2(-0.92, -0.92), new THREE.Vector2(-0.92, 0.92), new THREE.Vector2(0.92, 0.92), new THREE.Vector2(0.92, -0.92)]))
    const g = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
    const n = Math.max(1, items.length)
    const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), n)
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    for (let i = 0; i < n; i++) im.setMatrixAt(i, _m.makeScale(0, 0, 0))
    im.count = items.length
    im.frustumCulled = false
    im.raycast = () => null
    im.renderOrder = 2
    return im
  }, [items])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    },
    [mesh],
  )
  const st = useRef({ any: true }).current
  useFrame((state) => {
    const t = state.clock.elapsedTime
    let any = false
    const k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 5))
    items.forEach((it, i) => {
      const tripped = simStatus(it.tag) === 'tripped'
      any ||= tripped
      if (!tripped && !st.any) return
      mesh.setMatrixAt(i, tripped ? it.m : _m.makeScale(0, 0, 0))
      mesh.setColorAt(i, _c.copy(RED).multiplyScalar(tripped ? 1.6 * k : 0))
    })
    if (any || st.any) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    st.any = any
  })
  return items.length ? <primitive object={mesh} /> : null
}
