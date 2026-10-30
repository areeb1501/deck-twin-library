/**
 * Walkthrough "eye" markers: when you're near equipment (≈9 m, same deck) or right beside a valve or
 * instrument (≈3.5 m), an eye icon floats on it. Click it for the knowledge card — what it is, how
 * it's used in oil & gas, ideal parameters, problems, maintenance, safety, standards.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import type { BuiltPiping } from '../scene/piping/build'
import { usePlantStore } from '../state/plantStore'
import { DECK_WORLD_Y, useStore } from '../state/store'
import { labelHeight } from './labels'
import { levelAt, walkLevels, walkPose } from '../scene/Walk'

interface Eye {
  tag: string
  kind: 'equipment' | 'valve' | 'instrument'
  x: number
  y: number
  d: number
}
const useEyes = create<{ eyes: Eye[] }>(() => ({ eyes: [] }))

const EQ_RANGE = 9
const SMALL_RANGE = 3.5
const MAX = 7

/** canvas side: pick the nearby items and project them to the screen */
export function EyeProjector({ built }: { built: BuiltPiping }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const acc = useRef(0)
  const v = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    const walk = useStore.getState().walk
    if (!walk) {
      if (useEyes.getState().eyes.length) useEyes.setState({ eyes: [] })
      return
    }
    acc.current += dt
    if (acc.current < 0.12) return
    acc.current = 0
    const plant = usePlantStore.getState().plant
    const levels = walkLevels(plant)
    const li = walkPose.level
    const me = new THREE.Vector3(walkPose.x, walkPose.footY + 1.6, walkPose.z)
    const cands: { tag: string; kind: Eye['kind']; p: THREE.Vector3; d: number }[] = []
    for (const e of plant.equipment) {
      if (e.kind !== 'proxy' && levelAt(levels, e.position[1]) !== li) continue
      const p = new THREE.Vector3(e.position[0], DECK_WORLD_Y + Math.min(labelHeight(e) - 0.4, (levels[li]?.y ?? 0) + 3.2), e.position[2])
      if (e.kind === 'proxy') p.set(e.position[0] + 2, me.y + 0.6, e.position[2] + 2)
      const d = Math.hypot(p.x - me.x, p.z - me.z)
      if (d < EQ_RANGE) cands.push({ tag: e.tag, kind: 'equipment', p, d })
    }
    for (const vp of built.valves) {
      const p = vp.pos.clone().add(new THREE.Vector3(0, DECK_WORLD_Y + 0.35, 0))
      const d = p.distanceTo(me)
      if (d < SMALL_RANGE) cands.push({ tag: vp.valve.tag, kind: 'valve', p, d })
    }
    for (const ip of built.instruments) {
      const p = ip.pos.clone().add(new THREE.Vector3(0, DECK_WORLD_Y + 0.3, 0))
      const d = p.distanceTo(me)
      if (d < SMALL_RANGE) cands.push({ tag: ip.inst.tag, kind: 'instrument', p, d })
    }
    cands.sort((a, b) => a.d - b.d)
    const eyes: Eye[] = []
    for (const c of cands) {
      if (eyes.length >= MAX) break
      v.current.copy(c.p).project(camera)
      if (v.current.z > 1 || Math.abs(v.current.x) > 1.05 || Math.abs(v.current.y) > 1.05) continue
      eyes.push({ tag: c.tag, kind: c.kind, d: c.d, x: ((v.current.x + 1) / 2) * size.width, y: ((1 - v.current.y) / 2) * size.height })
    }
    useEyes.setState({ eyes })
  })
  return null
}

/** DOM side: the eye buttons */
export function EyeOverlay() {
  const eyes = useEyes((s) => s.eyes)
  const setKb = useStore((s) => s.setKbTag)
  const kb = useStore((s) => s.kbTag)
  return (
    <div className="eye-layer">
      {eyes.map((e) => (
        <button
          key={e.tag}
          className={`eye-btn ${e.kind} ${kb === e.tag ? 'on' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${e.x}px, ${e.y}px)`, opacity: Math.max(0.55, 1 - e.d / 12) }}
          onClick={() => setKb(kb === e.tag ? null : e.tag)}
          title={`About ${e.tag}`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M12 5C6.5 5 2.7 9.3 1.5 12c1.2 2.7 5 7 10.5 7s9.3-4.3 10.5-7C21.3 9.3 17.5 5 12 5z" />
            <circle cx="12" cy="12" r="3.4" />
          </svg>
          <span className="mono">{e.tag}</span>
        </button>
      ))}
    </div>
  )
}
