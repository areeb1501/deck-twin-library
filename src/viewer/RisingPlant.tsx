// The home hero's plant: it starts as the flat plan drawing, stands up once, then stays still until someone drags it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { Plant, type ComponentMap } from '../../registry/assembly/plant'
import type { PlantSpec } from '../../registry/assembly/spec'
import { loadAll } from '../registry'
import { componentsOf } from '../plants'
import { Boundary } from '../components/Boundary'
import { PLAN, SHEET } from './plan'

const INK = '#0f1015'
const FOV = 20
const HOLD = 520
const STAND = 2600
const FLAT = 0.012
const END = { target: new THREE.Vector3(-4.2, 1.5, -1.2), polar: 0.98, azimuth: 0.5, zoom: 0.68 }

const clay = new THREE.MeshLambertMaterial({ color: '#ffffff' })
const steel = new THREE.MeshLambertMaterial({ color: INK })
const edge = new THREE.LineBasicMaterial({ color: '#c8481a', transparent: true, opacity: 0.42 })
const edges = new Map<string, THREE.EdgesGeometry>()

/** every part white with a fine edge line, every pipe, flange and inline valve ink: a maquette rather than a render */
function dress(root: THREE.Object3D) {
  const [items, ...piping] = root.children
  const paint = (o: THREE.Object3D, material: THREE.Material, outline: boolean) =>
    o.traverse((m) => {
      if (!(m instanceof THREE.Mesh) || m.userData.dressed) return
      m.userData.dressed = true
      m.material = material
      m.castShadow = true
      m.receiveShadow = true
      const g = m.geometry as THREE.BufferGeometry
      if (!outline || m instanceof THREE.InstancedMesh || g.attributes.position.count > 12000) return
      g.computeBoundingSphere()
      if ((g.boundingSphere?.radius ?? 0) < 0.12) return
      let e = edges.get(g.uuid)
      if (!e) edges.set(g.uuid, (e = new THREE.EdgesGeometry(g, 32)))
      m.add(new THREE.LineSegments(e, edge))
    })
  if (items) paint(items, clay, true)
  for (const p of piping) paint(p, steel, false)
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const rise = (t: number) => 1 - (1 - t) ** 4

function Stand({ spec, components, still, onReady, onStood, plant }: { spec: PlantSpec; components: ComponentMap; still: boolean; onReady: () => void; onStood: () => void; plant: RefObject<THREE.Group | null> }) {
  const { camera, size, invalidate } = useThree()
  const started = useRef<number | null>(null)
  const dressed = useRef(0)
  const done = useRef(false)
  const top = useMemo(() => new THREE.Vector3(SHEET.cx, 0, SHEET.cz), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const spot = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => invalidate(), [size, invalidate])

  useFrame(() => {
    const group = plant.current
    if (!group || !group.children.length) return
    if (dressed.current < 3) {
      dress(group.children[0])
      invalidate()
      if (++dressed.current < 3) return
      started.current = performance.now()
      onReady()
    }
    const perM = Math.min(size.width / SHEET.w, size.height / SHEET.h)
    const far = size.height / perM / (2 * Math.tan((FOV * Math.PI) / 360))
    if (done.current) return
    const t = still ? 1 : Math.min(1, (performance.now() - started.current! - HOLD) / STAND)
    const k = ease(Math.max(0, t))
    group.scale.y = FLAT + (1 - FLAT) * rise(Math.max(0, t))
    target.lerpVectors(top, END.target, k)
    spot.setFromSphericalCoords(far * (1 + (END.zoom - 1) * k), 0.0015 + (END.polar - 0.0015) * k, END.azimuth * k).add(target)
    camera.position.copy(spot)
    camera.lookAt(target)
    if (t >= 1) {
      done.current = true
      onStood()
    } else invalidate()
  })
  return <Plant spec={spec} components={components} />
}

function Ground() {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[SHEET.cx, -0.01, SHEET.cz]} receiveShadow>
        <planeGeometry args={[220, 160]} />
        <shadowMaterial color="#6d1d00" opacity={0.42} />
      </mesh>
      <group position-y={0.02}>
        {PLAN.lines.map((l) => (
          <Line key={l.tag} points={l.path.map((p) => [p[0], 0, p[1]] as [number, number, number])} color={INK} lineWidth={1.25} />
        ))}
      </group>
    </>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#ff6a2c', 2.3]} />
      <directionalLight
        position={[-30, 62, 34]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-far={180}
        shadow-bias={-0.0006}
      />
    </>
  )
}

function Scene({ spec, components, still, onReady, onStood }: { spec: PlantSpec; components: ComponentMap; still: boolean; onReady: () => void; onStood: () => void }) {
  const plant = useRef<THREE.Group>(null)
  const [orbit, setOrbit] = useState(false)
  const fine = useMemo(() => matchMedia('(pointer: fine)').matches, [])
  return (
    <>
      <Lights />
      <Ground />
      <group ref={plant}>
        <Stand spec={spec} components={components} still={still} plant={plant} onReady={onReady} onStood={() => (setOrbit(true), onStood())} />
      </group>
      {orbit && fine && <OrbitControls makeDefault target={END.target} enableZoom={false} enablePan={false} enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI * 0.46} />}
    </>
  )
}

export function RisingPlant({ spec, onReady, onStood, onLost, className }: { spec: PlantSpec; onReady: () => void; onStood: () => void; onLost: () => void; className?: string }) {
  const [components, setComponents] = useState<ComponentMap | null>(null)
  const [broken, setBroken] = useState(false)
  const still = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  useLayoutEffect(() => {
    let live = true
    loadAll(componentsOf(spec)).then((c) => live && setComponents(c as ComponentMap))
    return () => {
      live = false
    }
  }, [spec])
  if (broken || !components) return null
  return (
    <Boundary fallback={() => (queueMicrotask(() => (setBroken(true), onLost())), null)}>
      <div className={className}>
        <Canvas
          frameloop="demand"
          shadows
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
          camera={{ fov: FOV, near: 1, far: 900, position: [SHEET.cx, 200, SHEET.cz] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NoToneMapping
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.setClearColor(0x000000, 0)
            gl.domElement.addEventListener('webglcontextlost', onLost)
          }}
        >
          <Scene spec={spec} components={components} still={still} onReady={onReady} onStood={onStood} />
        </Canvas>
      </div>
    </Boundary>
  )
}
