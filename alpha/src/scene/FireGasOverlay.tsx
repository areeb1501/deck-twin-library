/**
 * Fire & gas coverage: flame-detector cones of vision (90°, 16 m for the 1 MW reference fire, tilted
 * 20° down), point gas detector reach, open-path gas beams between transmitter and receiver, heat /
 * smoke detector zones. The numbers come from sim/fg.ts (the same model as the F&G mapping and the
 * live detection). Shown for every detector with the "F&G coverage" layer, always for a selected
 * detector, and for an open-path beam in alarm; anything in alarm is tinted amber (low) or red (high / fire).
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { BuiltPiping } from './piping/build'
import { useStore } from '../state/store'
import { useSim } from '../state/sim'
import { FD_HALF_FOV, FD_RANGE, FD_TILT, GD_RADIUS, HS_RANGE } from '../sim/fg'
import { alarmKey } from '../sim/fg/live'

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
/** alarm tint: [low, high] per shape kind */
const ALARM = {
  vol: [mat('#ffb020', 0.1), mat('#ff3b30', 0.13)],
  beam: [mat('#ffb020', 0.95), mat('#ff3b30', 1)],
} as const
const TILT = FD_TILT
const cone = new THREE.ConeGeometry(FD_RANGE * Math.tan(FD_HALF_FOV), FD_RANGE, 40, 1, true).translate(0, -FD_RANGE / 2, 0)
const sphere = new THREE.SphereGeometry(1, 24, 16)
const beam = new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true)
const DOWN = new THREE.Vector3(0, -1, 0)
const UP = new THREE.Vector3(0, 1, 0)

export function FireGasOverlay({ built }: { built: BuiltPiping }) {
  const all = useStore((s) => s.layers.fireGas)
  const sel = useStore((s) => s.selected?.tag)
  const aKey = useSim(alarmKey)
  const alarms = useMemo(() => new Map(aKey ? aKey.split('|').map((x) => x.split(':') as [string, string]) : []), [aKey])
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
      } else if (t === 'GD') out.push({ key: d.inst.tag, type: t, geo: sphere, pos: d.pos, quat: new THREE.Quaternion(), scale: new THREE.Vector3(GD_RADIUS, GD_RADIUS, GD_RADIUS), tags: [d.inst.tag] })
      else if (t === 'HD' || t === 'SD') out.push({ key: d.inst.tag, type: t, geo: sphere, pos: d.pos, quat: new THREE.Quaternion(), scale: new THREE.Vector3(HS_RANGE, HS_RANGE / 2, HS_RANGE), tags: [d.inst.tag] })
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
        const al = alarms.get(it.tags[0])
        // an alarmed detector's beam always shows; its volume only on request, or a large incident tints the whole deck
        const volume = it.type !== 'OGD'
        if (!all && !on && !(al && !volume)) return null
        const material = al ? ALARM[volume ? 'vol' : 'beam'][al === 'high' ? 1 : 0] : M[it.type][on ? 1 : 0]
        return <mesh key={it.key} geometry={it.geo} position={it.pos} quaternion={it.quat} scale={it.scale} material={material} raycast={noPick} renderOrder={4} />
      })}
    </group>
  )
}
