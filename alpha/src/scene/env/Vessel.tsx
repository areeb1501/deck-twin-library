/** Platform supply vessel (PSV) standing off ~150 m south, bobbing gently. Low-poly. */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Batches, boxMinMax, tube } from '../structure/batch'
import { envMat, envTime } from './envShared'

function hullGeometry(y0: number, y1: number, inset = 0) {
  const L = 82
  const B = 18.8 - inset * 2
  const s = new THREE.Shape()
  const h = B / 2
  s.moveTo(-L / 2 + inset, -h + 0.8)
  s.quadraticCurveTo(-L / 2 + inset, -h, -L / 2 + 1.2, -h)
  s.lineTo(L * 0.18, -h)
  s.bezierCurveTo(L * 0.36, -h, L / 2 - inset - 2, -h * 0.35, L / 2 - inset, 0)
  s.bezierCurveTo(L / 2 - inset - 2, h * 0.35, L * 0.36, h, L * 0.18, h)
  s.lineTo(-L / 2 + 1.2, h)
  s.quadraticCurveTo(-L / 2 + inset, h, -L / 2 + inset, h - 0.8)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

type K = 'hull' | 'boot' | 'white' | 'deck' | 'glass' | 'dark' | 'cargo1' | 'cargo2'

export function SupplyVessel({ position = [-40, 0, 150] as [number, number, number], heading = 0.18 }) {
  const ref = useRef<THREE.Group>(null)
  const parts = useMemo(() => {
    const B = new Batches<K>()
    const id = new THREE.Matrix4()
    B.get('boot').add(hullGeometry(-5.2, 0.4), id)
    B.get('hull').add(hullGeometry(0.4, 3.6), id)
    B.get('deck').add(hullGeometry(3.6, 3.65, 0.4), id)
    // bulwark
    for (const z of [-9.25, 9.25]) boxMinMax(B.get('hull'), [-41, 3.6, z - 0.15], [14, 4.8, z + 0.15])
    boxMinMax(B.get('hull'), [-41, 3.6, -9.4], [-40.7, 4.8, 9.4])
    // superstructure forward (3 tiers + bridge)
    boxMinMax(B.get('white'), [16, 3.65, -8], [33, 7.2, 8])
    boxMinMax(B.get('white'), [18, 7.2, -7.2], [32, 10.4, 7.2])
    boxMinMax(B.get('white'), [21, 10.4, -8.8], [31, 13.4, 8.8])
    boxMinMax(B.get('glass'), [30.95, 11.4, -8.6], [31.06, 12.9, 8.6])
    boxMinMax(B.get('glass'), [20.95, 11.4, -8.6], [21.05, 12.9, 8.6])
    for (const z of [-8.85, 8.8]) boxMinMax(B.get('glass'), [21.3, 11.4, z], [30.7, 12.9, z + 0.05])
    boxMinMax(B.get('glass'), [32.95, 5.0, -7.5], [33.05, 6.2, 7.5])
    boxMinMax(B.get('white'), [22, 13.4, -2.5], [28, 14.0, 2.5])
    // mast + radar
    tube(B.get('white'), [26, 14, 0], [26, 21, 0], 0.25, 8, false)
    boxMinMax(B.get('dark'), [24.5, 19.2, -0.15], [27.5, 19.5, 0.15])
    // funnels / exhausts aft of the superstructure
    for (const z of [-5.5, 5.5]) boxMinMax(B.get('white'), [15, 7.2, z - 0.9], [17.5, 12.5, z + 0.9])
    // aft cargo: containers + deck pipes
    boxMinMax(B.get('cargo1'), [-30, 3.65, -6], [-23.9, 6.24, -3.56])
    boxMinMax(B.get('cargo2'), [-22, 3.65, -6], [-15.9, 6.24, -3.56])
    boxMinMax(B.get('cargo1'), [-28, 3.65, 2], [-21.9, 6.24, 4.44])
    for (let i = 0; i < 6; i++) tube(B.get('dark'), [-10, 3.95 + (i % 3) * 0.6, 2 + Math.floor(i / 3) * 0.6], [8, 3.95 + (i % 3) * 0.6, 2 + Math.floor(i / 3) * 0.6], 0.3, 10, false)
    // stern A-frame / crash rail
    tube(B.get('dark'), [-40.5, 3.6, -8], [-40.5, 7.5, -8], 0.2, 8, false)
    tube(B.get('dark'), [-40.5, 3.6, 8], [-40.5, 7.5, 8], 0.2, 8, false)
    tube(B.get('dark'), [-40.5, 7.5, -8], [-40.5, 7.5, 8], 0.2, 8, false)
    return B.buildAll()
  }, [])
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  const mats = useMemo<Record<K, THREE.Material>>(
    () => ({
      hull: envMat('psvHull', { color: '#b3261e', roughness: 0.5, metalness: 0.2 }),
      boot: envMat('psvBoot', { color: '#1b1c1e', roughness: 0.6, metalness: 0.2 }),
      white: envMat('psvWhite', { color: '#e9ebe8', roughness: 0.5, metalness: 0.1 }),
      deck: envMat('psvDeck', { color: '#5d6266', roughness: 0.8, metalness: 0.2 }),
      glass: envMat('psvGlass', { color: '#18232b', roughness: 0.1, metalness: 0.4 }),
      dark: envMat('psvDark', { color: '#3a3f44', roughness: 0.5, metalness: 0.5 }),
      cargo1: envMat('box1', { color: '#2f6fae', roughness: 0.6, metalness: 0.3 }),
      cargo2: envMat('box2', { color: '#d18b1c', roughness: 0.6, metalness: 0.3 }),
    }),
    [],
  )
  useFrame(() => {
    const t = envTime.value
    const g = ref.current
    if (!g) return
    g.position.y = position[1] + Math.sin(t * 0.52) * 0.35
    g.rotation.set(Math.sin(t * 0.41 + 0.7) * 0.022, heading, Math.sin(t * 0.33) * 0.01)
  })
  return (
    <group ref={ref} position={position} rotation-y={heading} name="PSV">
      {parts.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={mats[key]} castShadow={false} receiveShadow={false} raycast={() => null} />
      ))}
    </group>
  )
}
