/**
 * Minimal harness for developing a component in isolation.
 * Open http://localhost:<port>/?sandbox=<name>  (see src/dev/sandboxes.ts)
 */
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, Grid } from '@react-three/drei'
import type { ReactNode } from 'react'
import * as THREE from 'three'

export function SandboxCanvas({ children, target = [0, 1, 0], camera = [8, 6, 10] }: {
  children: ReactNode
  target?: [number, number, number]
  camera?: [number, number, number]
}) {
  return (
    <Canvas
      shadows
      camera={{ position: camera, fov: 40, near: 0.05, far: 5000 }}
      gl={{ antialias: true, localClippingEnabled: true } as THREE.WebGLRendererParameters}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
        gl.toneMapping = THREE.ACESFilmicToneMapping
      }}
      style={{ position: 'fixed', inset: 0, background: '#9fb3c2' }}
    >
      <hemisphereLight args={['#dfe9f2', '#5b5f63', 0.6]} />
      <directionalLight position={[30, 40, 20]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} />
        <Lightformer form="rect" intensity={1} color="#bcd4ff" position={[-20, 5, -10]} scale={[30, 10, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#ffe6c4" position={[20, 3, 10]} scale={[30, 10, 1]} />
      </Environment>
      <Grid args={[60, 60]} cellSize={1} sectionSize={5} infiniteGrid fadeDistance={80} position={[0, -0.001, 0]} />
      {children}
      <OrbitControls makeDefault target={target} />
    </Canvas>
  )
}
