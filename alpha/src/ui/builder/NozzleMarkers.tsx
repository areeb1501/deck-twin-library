/** Builder aid: nozzle ids drawn at the flange faces of the selected equipment (yellow = free, grey = connected). */
import { Html } from '@react-three/drei'
import { useSpecStore } from '../../state/specStore'
import { usePlantStore } from '../../state/plantStore'
import { useStore } from '../../state/store'

export function NozzleMarkers() {
  const active = useSpecStore((s) => s.active)
  const sel = useStore((s) => s.selected)
  const plant = usePlantStore((s) => s.plant)
  if (!active || sel?.kind !== 'equipment') return null
  const eq = plant.equipment.find((e) => e.tag === sel.tag)
  if (!eq) return null
  const used = new Set<string>()
  for (const l of plant.lines) for (const end of [l.from, l.to]) if ('equipment' in end && end.equipment === eq.tag) used.add(end.nozzle)
  return (
    <group>
      {eq.nozzles.map((n) => (
        <Html key={n.id} position={n.pos} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`noz-chip ${used.has(n.id) ? 'used' : ''}`}>
            {n.id} · {n.nps}"
          </div>
        </Html>
      ))}
    </group>
  )
}
