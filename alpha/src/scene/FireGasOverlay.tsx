/**
 * Fire & gas coverage: flame-detector cones of vision (90°, 16 m, tilted down), point gas detector
 * radius, open-path gas beams between transmitter and receiver, heat / smoke detector zones.
 * Shown for every detector with the "F&G coverage" layer, and always for a selected detector.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { BuiltPiping } from './piping/build'
import { useStore } from '../state/store'

const noPick = () => null
const FG = new Set(['FD', 'GD', 'OGD', 'HD', 'SD'])
const mat = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
const M = {
  FD: [mat('#ff6b4a', 0.07), mat('#ff6b4a', 0.2)],
  GD: [mat('#ffd479', 0.07), mat('#ffd479', 0.22)],
  OGD: [mat('#ffb340', 0.55), mat('#ffb340', 0.9)],
  HD: [mat('#ff8a80', 0.06), mat('#ff8a80', 0.2)],
  SD: [mat('#c7d0d8', 0.06), mat('#c7d0d8', 0.2)],
} as const
const FD_RANGE = 16
const FD_HALF = Math.PI / 4
const TILT = (20 * Math.PI) / 180
const cone = new THREE.ConeGeometry(FD_RANGE * Math.tan(FD_HALF), FD_RANGE, 40, 1, true).translate(0, -FD_RANGE / 2, 0)
const sphere = new THREE.SphereGeometry(1, 24, 16)
const beam = new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true)
const DOWN = new THREE.Vector3(0, -1, 0)
const UP = new THREE.Vector3(0, 1, 0)

export function FireGasOverlay({ built }: { built: BuiltPiping }) {
  const all = useStore((s) => s.layers.fireGas)
  const sel = useStore((s) => s.selected?.tag)
  const items = useMemo(() => {
    const out: { key: string; type: keyof typeof M; geo: THREE.BufferGeometry; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3; tags: string[] }[] = []
    const dets = built.instruments.filter((p) => FG.has(p.inst.type))
    for (const d of dets) {
      const t = d.inst.type as keyof typeof M
      if (t === 'FD') {
        const aim = UP.clone().applyQuaternion(d.quat)
        aim.y = 0
        aim.normalize().multiplyScalar(Math.cos(TILT)).setY(-Math.sin(TILT))
        out.push({ key: d.inst.tag, type: t, geo: cone, pos: d.pos, quat: new THREE.Quaternion().setFromUnitVectors(DOWN, aim.normalize()), scale: new THREE.Vector3(1, 1, 1), tags: [d.inst.tag] })
      } else if (t === 'GD') out.push({ key: d.inst.tag, type: t, geo: sphere, pos: d.pos, quat: new THREE.Quaternion(), scale: new THREE.Vector3(4.5, 4.5, 4.5), tags: [d.inst.tag] })
      else if (t === 'HD' || t === 'SD') out.push({ key: d.inst.tag, type: t, geo: sphere, pos: d.pos, quat: new THREE.Quaternion(), scale: new THREE.Vector3(5, 2.5, 5), tags: [d.inst.tag] })
      else if (t === 'OGD' && d.inst.tag.endsWith('T')) {
        const rx = dets.find((x) => x.inst.tag === d.inst.tag.slice(0, -1) + 'R')
        if (!rx) continue
        const v = rx.pos.clone().sub(d.pos)
        out.push({ key: d.inst.tag, type: t, geo: beam, pos: d.pos.clone().addScaledVector(v, 0.5), quat: new THREE.Quaternion().setFromUnitVectors(UP, v.clone().normalize()), scale: new THREE.Vector3(1, v.length(), 1), tags: [d.inst.tag, rx.inst.tag] })
      }
    }
    return out
  }, [built])
  return (
    <group>
      {items.map((it) => {
        const on = it.tags.includes(sel ?? '')
        if (!all && !on) return null
        return <mesh key={it.key} geometry={it.geo} position={it.pos} quaternion={it.quat} scale={it.scale} material={M[it.type][on ? 1 : 0]} raycast={noPick} renderOrder={4} />
      })}
    </group>
  )
}
