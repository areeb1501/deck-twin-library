/**
 * Shared animation primitives for equipment models. Their moving groups carry userData.noBatch so the
 * static batcher (scene/perf/StaticBatcher) leaves them alone.
 *
 *   <Spinner tag="GT-8100A" axis="y" rpm={240}>…fan blades…</Spinner>
 *     rotates its children about a local axis while the equipment runs; spins up / coasts down.
 *
 *   <Door tag="B-9100" id="D1" hinge={[x, y, z]} openAngle={-1.7}>…leaf geometry relative to the hinge…</Door>
 *     a hinged leaf that swings open when the door is open in the simulation (walk up to it, or click
 *     it). Children are drawn relative to the hinge point; the leaf turns about the hinge's local +Y.
 *     Meshes inside carry userData.door so the scene can toggle the door on click.
 *
 *   <Slider tag … from={[…]} to={[…]}> — same idea for sliding doors / moving parts (travelling block).
 *
 *   useRunLevel(tag) → a ref whose .current eases between 0 (stopped) and 1 (running), for custom motion.
 */
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { isRunning, useSim } from '../state/sim'

/** eased 0…1 run level (spin-up ~2 s, coast-down ~4 s) */
export function useRunLevel(tag: string) {
  const level = useRef(isRunning(tag) ? 1 : 0)
  useFrame((_, dt) => {
    const target = isRunning(tag) ? 1 : 0
    const k = target > level.current ? 0.5 : 0.25
    level.current += (target - level.current) * Math.min(1, dt * k * 2)
    if (Math.abs(target - level.current) < 1e-3) level.current = target
  })
  return level
}

/** Rotates children about a local axis while `tag` runs. rpm is the visual speed (keep ≤ ~400 to avoid strobing). */
export function Spinner({ tag, axis = 'y', rpm = 240, position, rotation, children }: {
  tag: string
  axis?: 'x' | 'y' | 'z'
  rpm?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  children: ReactNode
}) {
  const g = useRef<THREE.Group>(null)
  const level = useRunLevel(tag)
  const phase = useRef(Math.random() * Math.PI * 2)
  useFrame((_, dt) => {
    if (!g.current) return
    phase.current += level.current * (rpm / 60) * Math.PI * 2 * Math.min(dt, 0.1)
    g.current.rotation[axis] = phase.current % (Math.PI * 2)
  })
  return (
    <group position={position} rotation={rotation} userData={{ noBatch: true }}>
      <group ref={g}>{children}</group>
    </group>
  )
}

const tagDoor = (root: THREE.Object3D, tag: string, id: string) =>
  root.traverse((o) => {
    o.userData.door = { tag, id }
  })

/** Hinged door leaf. Open state lives in the simulation store (`${tag}/${id}`). */
export function Door({ tag, id, hinge, rotationY = 0, openAngle = -1.75, children }: {
  tag: string
  id: string
  /** hinge point in the parent (equipment-local) frame */
  hinge: [number, number, number]
  /** orientation of the closed leaf about +Y */
  rotationY?: number
  /** swing when open (radians, sign = direction) */
  openAngle?: number
  children: ReactNode
}) {
  const leaf = useRef<THREE.Group>(null)
  const a = useRef(0)
  useLayoutEffect(() => {
    if (leaf.current) tagDoor(leaf.current, tag, id)
  })
  useFrame((_, dt) => {
    const open = !!useSim.getState().doors[`${tag}/${id}`]
    const target = open ? openAngle : 0
    a.current += (target - a.current) * Math.min(1, dt * 3.2)
    if (leaf.current) leaf.current.rotation.y = a.current
  })
  // doorRoot: the walker finds doors near it by this marker (world position = the hinge)
  return (
    <group position={hinge} rotation-y={rotationY} userData={{ doorRoot: { tag, id }, noBatch: true }}>
      <group ref={leaf}>{children}</group>
    </group>
  )
}

/** Sliding part (sliding door, travelling block): moves from `from` to `to` (local) while open / with `t()` */
export function Slider({ tag, id, from, to, children }: { tag: string; id: string; from: [number, number, number]; to: [number, number, number]; children: ReactNode }) {
  const g = useRef<THREE.Group>(null)
  const u = useRef(0)
  useLayoutEffect(() => {
    if (g.current) tagDoor(g.current, tag, id)
  })
  useFrame((_, dt) => {
    const open = !!useSim.getState().doors[`${tag}/${id}`]
    u.current += ((open ? 1 : 0) - u.current) * Math.min(1, dt * 3)
    g.current?.position.set(from[0] + (to[0] - from[0]) * u.current, from[1] + (to[1] - from[1]) * u.current, from[2] + (to[2] - from[2]) * u.current)
  })
  return (
    <group ref={g} userData={{ noBatch: true }}>
      {children}
    </group>
  )
}
