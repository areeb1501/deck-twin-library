/**
 * 3D view of an isolation plan: the envelope (pipe pieces and equipment inside the isolation)
 * glows orange, every isolation point gets a numbered chip matching the procedure, spades are
 * marked on their nozzles and open ends are flagged. Nothing here is pickable.
 */
import { Html } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { BuiltPiping } from './piping/build'
import { insulationThickness } from './piping/build'
import { pipeOD } from '../model/catalog'
import { footprints } from '../model/footprint'
import { labelHeight } from '../ui/labels'
import { usePlant } from '../state/plantStore'
import { isolationSteps, useIsolationPlan } from '../ui/IsolationPanel'

const noPick = () => null
const glow = new THREE.MeshBasicMaterial({ color: '#ff8a1f', transparent: true, opacity: 0.38, depthWrite: false })
const edgeTarget = new THREE.LineBasicMaterial({ color: '#ff8a1f' })
const edgeAlso = new THREE.LineBasicMaterial({ color: '#ffd479' })
const UP = new THREE.Vector3(0, 1, 0)

export function IsolationOverlay({ built }: { built: BuiltPiping }) {
  const plant = usePlant()
  const plan = useIsolationPlan()

  const tubes = useMemo(() => {
    if (!plan) return []
    const out: { pos: THREE.Vector3; quat: THREE.Quaternion; len: number; r: number }[] = []
    for (const p of plan.envelope.pieces) {
      const l = plant.lines.find((x) => x.tag === p.line)
      if (!l) continue
      const r = pipeOD(l.nps) / 2 + (l.insulation ? insulationThickness(l.nps) : 0) + 0.035
      for (let i = 0; i < p.pts.length - 1; i++) {
        const a = new THREE.Vector3(...p.pts[i])
        const b = new THREE.Vector3(...p.pts[i + 1])
        const d = b.clone().sub(a)
        const len = d.length()
        if (len < 1e-3) continue
        out.push({ pos: a.add(b).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), len, r })
      }
    }
    return out
  }, [plan, plant])

  const boxes = useMemo(() => {
    if (!plan) return []
    const fps = footprints(plant.equipment, 0.25)
    return plant.equipment
      .map((e, i) => ({ e, f: fps[i] }))
      .filter(({ e }) => plan.envelope.equipment.includes(e.tag))
      .map(({ e, f }) => {
        const h = Math.max(1.2, labelHeight(e) - 0.7)
        const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(f.x1 - f.x0, h, f.z1 - f.z0))
        return { tag: e.tag, geo: g, pos: new THREE.Vector3((f.x0 + f.x1) / 2, h / 2, (f.z0 + f.z1) / 2), target: e.tag === plan.target }
      })
  }, [plan, plant])

  const chips = useMemo(() => {
    if (!plan) return []
    const steps = isolationSteps(plan)
    const stepOf = (tag: string) => steps.find((s) => s.tags.includes(tag) && s.kind !== 'bleed')?.n ?? steps.find((s) => s.tags.includes(tag))?.n
    const out: { key: string; pos: THREE.Vector3; text: string; cls: string }[] = []
    for (const pt of plan.points) {
      const v = built.valves.find((x) => x.valve.tag === pt.tag)
      if (!v) continue
      const verb = pt.type === 'psv' ? 'RELIEF' : pt.bleedRoute ? 'BLEED' : pt.verify ? 'VERIFY' : 'CLOSE'
      out.push({ key: pt.tag, pos: v.pos.clone().add(new THREE.Vector3(0, 0.25 + pipeOD(v.nps), 0)), text: `${stepOf(pt.tag) ?? ''} ${verb} ${pt.tag}`, cls: verb.toLowerCase() })
    }
    plan.blinds.forEach((b, i) => out.push({ key: `S${b.nozzle}`, pos: new THREE.Vector3(...b.pos), text: `S${i + 1} SPADE ${b.nozzle}`, cls: 'spade' }))
    for (const o of plan.openEnds) {
      const l = plant.lines.find((x) => x.tag === o.line)
      if (!l) continue
      const end = 'offDeck' in l.to && l.to.offDeck === o.label ? l.route[l.route.length - 1] : l.route[0]
      out.push({ key: `open-${o.line}`, pos: new THREE.Vector3(...end), text: `OPEN END · ${o.label}`, cls: 'open' })
    }
    return out
  }, [plan, built, plant])

  if (!plan) return null
  return (
    <group>
      {tubes.map((t, i) => (
        <mesh key={i} position={t.pos} quaternion={t.quat} material={glow} raycast={noPick} renderOrder={5}>
          <cylinderGeometry args={[t.r, t.r, t.len, 16, 1, true]} />
        </mesh>
      ))}
      {boxes.map((b) => (
        <lineSegments key={b.tag} geometry={b.geo} position={b.pos} material={b.target ? edgeTarget : edgeAlso} raycast={noPick} />
      ))}
      {chips.map((c) => (
        <Html key={c.key} position={c.pos} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`iso-chip ${c.cls}`}>{c.text}</div>
        </Html>
      ))}
    </group>
  )
}
