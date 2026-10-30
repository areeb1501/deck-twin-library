/** Onshore site: reinforced-concrete pad with kerbs, drainage gullies and a gravel surround. */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Plant } from '../../model/types'
import { registerMaterial } from '../../three/materials'

const concrete = registerMaterial(new THREE.MeshStandardMaterial({ color: '#a7a59f', roughness: 0.92, metalness: 0 }), 'structure')
const kerb = registerMaterial(new THREE.MeshStandardMaterial({ color: '#c9c6bd', roughness: 0.85 }), 'structure')
const gravel = new THREE.MeshStandardMaterial({ color: '#6f6a60', roughness: 1 })
const grate = registerMaterial(new THREE.MeshStandardMaterial({ color: '#4a4e52', roughness: 0.6, metalness: 0.6 }), 'structure')

export function GradePad({ plant }: { plant: Plant }) {
  const e = plant.deck.extent
  const w = e.maxX - e.minX
  const d = e.maxZ - e.minZ
  const cx = (e.maxX + e.minX) / 2
  const cz = (e.maxZ + e.minZ) / 2
  const joints = useMemo(() => {
    // saw-cut joints every 6 m
    const g: THREE.BufferGeometry[] = []
    for (let x = e.minX + 6; x < e.maxX; x += 6) g.push(new THREE.BoxGeometry(0.012, 0.004, d).translate(x, 0.001, cz))
    for (let z = e.minZ + 6; z < e.maxZ; z += 6) g.push(new THREE.BoxGeometry(w, 0.004, 0.012).translate(cx, 0.001, z))
    return g
  }, [e, w, d, cx, cz])
  return (
    <group>
      <mesh position={[cx, -0.15, cz]} receiveShadow material={concrete}>
        <boxGeometry args={[w, 0.3, d]} />
      </mesh>
      {joints.map((g, i) => (
        <mesh key={i} geometry={g} material={grate} />
      ))}
      {[
        [cx, e.minZ - 0.1, w + 0.4, 0.2],
        [cx, e.maxZ + 0.1, w + 0.4, 0.2],
      ].map(([x, z, lx, lz], i) => (
        <mesh key={`k${i}`} position={[x, 0.08, z]} material={kerb} castShadow receiveShadow>
          <boxGeometry args={[lx, 0.16, lz]} />
        </mesh>
      ))}
      {[
        [e.minX - 0.1, cz, 0.2, d],
        [e.maxX + 0.1, cz, 0.2, d],
      ].map(([x, z, lx, lz], i) => (
        <mesh key={`kk${i}`} position={[x, 0.08, z]} material={kerb} castShadow receiveShadow>
          <boxGeometry args={[lx, 0.16, lz]} />
        </mesh>
      ))}
      {/* trench drain along the centre */}
      <mesh position={[cx, 0.003, cz]} material={grate}>
        <boxGeometry args={[w - 2, 0.006, 0.3]} />
      </mesh>
      <mesh position={[cx, -0.32, cz]} rotation-x={-Math.PI / 2} receiveShadow material={gravel}>
        <circleGeometry args={[4000, 64]} />
      </mesh>
    </group>
  )
}
