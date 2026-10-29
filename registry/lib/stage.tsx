// Lighting rig for components and plants: low sun with soft shadows, sky fill and a local reflection environment (no network).
import type { ReactNode } from 'react'
import { Environment, Lightformer } from '@react-three/drei'

export interface StageProps {
  /** rough scene radius in metres; sizes the shadow camera */
  radius?: number
  /** shadow-catching ground plane at y = 0 */
  ground?: boolean
  shadows?: boolean
  /** environment reflection tint */
  sky?: string
  /** height of the shadow-catching ground (default 0) */
  groundY?: number
  children?: ReactNode
}

export function Stage({ radius = 8, ground = true, shadows = true, sky = '#c9d3dc', groundY = 0, children }: StageProps) {
  const r = Math.max(radius, 2)
  return (
    <>
      <hemisphereLight args={['#eef3f8', '#5d5a52', 0.45]} />
      <directionalLight
        castShadow={shadows}
        position={[r * 1.1, r * 2.2, r * 0.8]}
        intensity={3.1}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.025}
      >
        <orthographicCamera attach="shadow-camera" args={[-r * 1.6, r * 1.6, r * 1.6, -r * 1.6, 0.1, r * 10]} />
      </directionalLight>
      <directionalLight position={[-r, r * 0.6, -r * 1.4]} intensity={0.35} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={[sky]} />
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 6, -10]} scale={[16, 6, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#f4efe6" position={[-10, 3, 0]} rotation-y={Math.PI / 2} scale={[24, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#e8eef6" position={[10, 3, 0]} rotation-y={-Math.PI / 2} scale={[24, 3, 1]} />
        <Lightformer form="circle" intensity={4} color="#fff7e8" position={[6, 12, 4]} scale={3} />
        <Lightformer form="rect" intensity={0.6} color="#7d776c" position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[30, 30, 1]} />
      </Environment>
      {ground && (
        <mesh rotation-x={-Math.PI / 2} position-y={groundY - 0.002} receiveShadow>
          <circleGeometry args={[r * 6, 64]} />
          <shadowMaterial transparent opacity={0.28} />
        </mesh>
      )}
      {children}
    </>
  )
}
