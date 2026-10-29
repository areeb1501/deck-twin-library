import { Suspense, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Stage } from '../../registry/lib/stage'
import { Sky } from '../../registry/environment/sky'
import type { Port } from '../../registry/lib/ports'
import { useTheme } from '../theme'

export interface Bounds {
  size: [number, number, number]
  center: [number, number, number]
  radius: number
}

export interface ViewerProps {
  children: ReactNode
  ports?: Port[]
  showPorts?: boolean
  /** change to re-frame the camera */
  fitKey?: string
  onBounds?: (b: Bounds) => void
  shot?: boolean
  effects?: boolean
  view?: [number, number, number]
  /** frame this sphere instead of the whole scene */
  focus?: { target: [number, number, number]; radius: number }
  /** frame this sphere when nothing in the scene is fittable (environment components) */
  frame?: { target: [number, number, number]; radius: number }
  /** studio: white backdrop and studio lights; day / night: the registry sky with its lights, haze and reflections; none: the children bring their own */
  env?: ViewerEnv
  className?: string
}

export type ViewerEnv = 'studio' | 'day' | 'night' | 'none'

const DEFAULT_VIEW: [number, number, number] = [1, 0.62, 1.18]
/** studio backdrop per site theme; /shot renders always use the dark one so thumbnails stay consistent */
const STUDIO_BG = { dark: '#23242b', light: '#e9eaee' }
const sameV = (a: [number, number, number], b: [number, number, number]) => (a.every((v, i) => Math.abs(v - b[i]) < 0.5) ? a : b)

export function Viewer({ children, ports, showPorts, fitKey, onBounds, shot, effects = true, view = DEFAULT_VIEW, focus, frame, env = 'studio', className }: ViewerProps) {
  const [radius, setRadius] = useState(6)
  const [groundY, setGroundY] = useState(0)
  const [center, setCenter] = useState<[number, number, number]>([0, 0, 0])
  const studio = env === 'studio'
  const theme = useTheme()
  const bg = STUDIO_BG[shot ? 'dark' : theme]
  const content = (
    <>
      <Suspense fallback={null}>
        <Fit
          fitKey={fitKey}
          view={view}
          shot={shot}
          focus={focus}
          frame={frame}
          minFar={studio ? 0 : 9000}
          onBounds={(b) => (setRadius(Math.max(2, focus ? Math.min(b.radius, focus.radius * 1.5) : b.radius)), setGroundY(Math.min(0, b.center[1] - b.size[1] / 2)), setCenter((c) => sameV(c, focus?.target ?? b.center)), onBounds?.(b))}
        >
          {children}
        </Fit>
      </Suspense>
      {showPorts && ports?.map((p) => <PortMarker key={p.id} port={p} scale={radius} />)}
    </>
  )
  return (
    <div className={className}>
      <Canvas
        shadows="soft"
        dpr={shot ? 1.5 : [1, 2]}
        camera={{ fov: 32, near: 0.05, far: 2000, position: [8, 5, 9] }}
        gl={{ antialias: true, preserveDrawingBuffer: !!shot, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
      >
        {studio && <color attach="background" args={[bg]} />}
        {studio && <fog attach="fog" args={[bg, radius * 6, radius * 14]} />}
        {studio && <Stage radius={radius} groundY={groundY} />}
        {env === 'day' && <Sky mode="day" shadowRadius={radius} shadowCenter={center} />}
        {env === 'night' && <Sky mode="night" azimuth={(Math.atan2(-view[0], view[2]) * 180) / Math.PI + 345} elevation={4} shadowRadius={radius} shadowCenter={center} />}
        {content}
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI * 0.495} enabled={!shot} />
        {effects ? (
          <EffectComposer multisampling={4} enableNormalPass={false}>
            <N8AO aoRadius={Math.min(2, radius * 0.18)} intensity={2.2} distanceFalloff={0.6} quality="high" halfRes={false} />
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          </EffectComposer>
        ) : null}
      </Canvas>
    </div>
  )
}

function Fit({ children, fitKey, view, shot, focus, frame, minFar, onBounds }: { children: ReactNode; fitKey?: string; view: [number, number, number]; shot?: boolean; focus?: ViewerProps['focus']; frame?: ViewerProps['frame']; minFar: number; onBounds: (b: Bounds) => void }) {
  const group = useRef<THREE.Group>(null)
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null }
  const pending = useRef(3)
  const last = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    if (last.current !== fitKey) pending.current = 3
    last.current = fitKey
  }, [fitKey])
  const report = useRef(0)
  useFrame(() => {
    const g = group.current
    if (!g) return
    if (report.current++ % 30 === 0 || pending.current > 0) {
      const box = fitBox(g)
      const empty = box.isEmpty()
      if (empty && !frame) return
      const center = box.getCenter(new THREE.Vector3())
      if (!empty) {
        const size = box.getSize(new THREE.Vector3())
        const sphere = box.getBoundingSphere(new THREE.Sphere())
        onBounds({ size: size.toArray() as [number, number, number], center: center.toArray() as [number, number, number], radius: sphere.radius })
      }
      if (pending.current > 0 && --pending.current === 0) {
        const dir = new THREE.Vector3(...view).normalize()
        const f = focus ?? (empty ? frame : undefined)
        if (f) {
          center.set(...f.target)
          box.setFromCenterAndSize(center, new THREE.Vector3(1, 1, 1).multiplyScalar(f.radius * 1.6))
        }
        const dist = fitDistance(box, center, dir, camera) * (shot ? 1.06 : 1.14)
        camera.position.copy(center).addScaledVector(dir, dist)
        camera.near = Math.max(0.02, dist / 200)
        camera.far = Math.max(dist * 20, minFar)
        camera.updateProjectionMatrix()
        if (controls) {
          controls.target.copy(center)
          controls.update()
        } else camera.lookAt(center)
        if (shot) requestAnimationFrame(() => requestAnimationFrame(() => ((window as unknown as { __ready: boolean }).__ready = true)))
      }
    }
  })
  return <group ref={group}>{children}</group>
}

/** Bounding box of everything except subtrees marked userData.noFit (sea, backdrops). */
function fitBox(o: THREE.Object3D, box = new THREE.Box3()) {
  if (o.userData.noFit) return box
  let skip = false
  o.traverse((c) => (skip ||= !!c.userData.noFit))
  if (!skip) return box.union(new THREE.Box3().setFromObject(o))
  for (const c of o.children) fitBox(c, box)
  return box
}

/** Smallest camera distance along `dir` that keeps all eight box corners inside the frustum. */
function fitDistance(box: THREE.Box3, center: THREE.Vector3, dir: THREE.Vector3, camera: THREE.PerspectiveCamera) {
  const fwd = dir.clone().negate()
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize()
  const tv = Math.tan(((camera.fov * Math.PI) / 180) / 2)
  const th = tv * camera.aspect
  let d = 0
  for (let i = 0; i < 8; i++) {
    const q = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center)
    const along = q.dot(dir)
    d = Math.max(d, Math.abs(q.dot(right)) / th + along, Math.abs(q.dot(up)) / tv + along)
  }
  return d
}

function PortMarker({ port, scale }: { port: Port; scale: number }) {
  const r = Math.min(0.12, Math.max(0.03, scale * 0.012))
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...port.direction).normalize()), [port.direction])
  return (
    <group position={port.position}>
      <mesh>
        <sphereGeometry args={[r, 16, 12]} />
        <meshBasicMaterial color="#3b46cf" />
      </mesh>
      <mesh quaternion={q} position={new THREE.Vector3(...port.direction).multiplyScalar(r * 2.5)}>
        <coneGeometry args={[r * 0.7, r * 2.2, 12]} />
        <meshBasicMaterial color="#3b46cf" />
      </mesh>
      <Html center zIndexRange={[20, 0]} position={new THREE.Vector3(...port.direction).multiplyScalar(r * 6).toArray()} style={{ pointerEvents: 'none' }}>
        <div className="rounded bg-indigo px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-white shadow">{port.id}</div>
      </Html>
    </group>
  )
}
