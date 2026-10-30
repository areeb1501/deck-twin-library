/**
 * Renders an equipment nozzle in EQUIPMENT-LOCAL coordinates: a hollow neck pipe from the
 * shell (nozzle.base) to the back of its weld-neck flange, and the flange whose raised face
 * sits exactly on nozzle.pos. The mating pipe flange, gasket and stud bolts are rendered
 * by the piping system, so equipment never needs to know what is connected.
 *
 * Usage inside an equipment component (which is itself rendered inside a group that applies
 * eq.position / eq.rotationY):
 *     {eq.nozzles.map(n => <NozzleNeck key={n.id} eq={eq} nozzle={n} />)}
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Equipment, Nozzle } from '../../model/types'
import { dirToLocal, toLocal, sub, len } from '../../model/geom'
import { pipeOD, pipeWall } from '../../model/catalog'
import { cached, hollowPipe, quatYTo, weldNeckFlange } from '../../three/pipeGeometry'
import { materials } from '../../three/materials'

export function NozzleNeck({
  eq,
  nozzle,
  /** extra length to bury the neck into the shell so curved shells don't show a gap */
  embed = 0.05,
  paintMaterial,
}: {
  eq: Pick<Equipment, 'position' | 'rotationY'>
  nozzle: Nozzle
  embed?: number
  paintMaterial?: THREE.Material
}) {
  const m = materials()
  const { neckGeo, flangeGeo, quat, basePos, flangePos } = useMemo(() => {
    const base = toLocal(eq, nozzle.base)
    const face = toLocal(eq, nozzle.pos)
    const dir = dirToLocal(eq, nozzle.dir)
    const fl = cached(`wn-${nozzle.nps}-${nozzle.rating}`, () => weldNeckFlange(nozzle.nps, nozzle.rating))
    const neckLen = Math.max(len(sub(face, base)) - fl.length + embed, 0.01)
    const neckGeo = cached(`neck-${nozzle.nps}-${neckLen.toFixed(3)}`, () =>
      hollowPipe(neckLen, pipeOD(nozzle.nps), pipeWall(nozzle.nps, '80'), nozzle.nps >= 8 ? 36 : 24),
    )
    const q = quatYTo(dir)
    const d = new THREE.Vector3(...dir)
    const basePos = new THREE.Vector3(...base).addScaledVector(d, -embed)
    const flangePos = new THREE.Vector3(...face).addScaledVector(d, -fl.length)
    return { neckGeo, flangeGeo: fl.geometry, quat: q, basePos, flangePos }
  }, [eq, nozzle, embed])

  const paint = paintMaterial ?? m.equipmentPaint
  return (
    <group>
      <mesh geometry={neckGeo} position={basePos} quaternion={quat} material={[paint, m.pipeBore]} castShadow receiveShadow />
      <mesh
        geometry={flangeGeo}
        position={flangePos}
        quaternion={quat}
        material={[m.flangeSteel, m.pipeBore, m.pipeCut]}
        castShadow
        receiveShadow
      />
    </group>
  )
}
