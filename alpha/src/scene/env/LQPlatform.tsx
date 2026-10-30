/**
 * Accommodation (LQ) platform + south bridge as a few batched, non-pickable env meshes.
 * Geometry: accommodation.ts. Materials: the Surroundings env materials passed in (`mats`, same keys as
 * Surroundings) plus a handful of LQ-only ones created here (facade aligned to the LQ storeys, signage,
 * lights, cable tray).
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Batches } from '../structure/batch'
import { structMats } from '../structure/structMaterials'
import { envMat } from './envShared'
import { FACADE, facadeTextures } from './envTextures'
import { buildAccommodation, type LqKey } from './accommodation'
import { LQ_JACKET } from './lqJacket'

/** batch key -> Surroundings material key (string) or an LQ-only material (resolved in lqMaterials) */
const MAT: Record<LqKey, string | null> = {
  jacket: 'jacket',
  anode: 'anode',
  landing: 'landing',
  ladder: 'ladder',
  steel: 'steel',
  steelDark: 'steelDark',
  grating: 'grating',
  gratingEdge: 'galv',
  discard: null,
  plate: 'plate',
  yellow: 'yellow',
  galv: 'galv',
  equip: 'equip',
  equipDark: 'equipDark',
  red: 'red',
  white: 'white',
  roof: 'roof',
  glass: 'glass',
  orange: 'orange',
  heli: 'heli',
  heliLights: 'heliLights',
  net: 'grating',
  facade: 'lq:facade',
  signGreen: 'lq:signGreen',
  signBlue: 'lq:signBlue',
  lamp: 'lq:lamp',
  lampBody: 'lq:lampBody',
  tray: 'lq:tray',
  cable: 'lq:cable',
  aviation: 'lq:aviation',
}
const NO_SHADOW = new Set<LqKey>(['grating', 'net', 'heliLights', 'lamp', 'aviation', 'anode'])

function lqMaterials(): Record<string, THREE.Material> {
  const sm = structMats('env')
  const fac = facadeTextures()
  // same facade tile, re-anchored so the window rows line up with the LQ storeys (base y = 28)
  const [map, emissiveMap] = [fac.map.clone(), fac.emissive.clone()]
  for (const t of [map, emissiveMap]) {
    t.offset.set(0.37, -LQ_JACKET.mainY / FACADE.h)
    t.needsUpdate = true
  }
  return {
    'lq:facade': envMat('lqFacade', { map, emissiveMap, emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.45, metalness: 0.15 }),
    'lq:signGreen': sm.green,
    'lq:signBlue': envMat('lqSignBlue', { color: '#1f5fa8', roughness: 0.5, metalness: 0.1 }),
    'lq:lamp': sm.lamp,
    'lq:lampBody': sm.lampBody,
    'lq:tray': sm.tray,
    'lq:cable': sm.cable,
    'lq:aviation': envMat('lqAviation', { color: '#ff3a26', emissive: '#ff1a08', emissiveIntensity: 3, roughness: 0.3 }),
  }
}

interface Part {
  key: LqKey
  geometry: THREE.BufferGeometry
}

function build(): Part[] {
  const B = new Batches<LqKey>()
  buildAccommodation((k) => B.get(k))
  return B.buildAll().filter((p) => MAT[p.key] !== null)
}

const noRaycast = () => null

export function LQPlatform({ mats }: { mats: Partial<Record<string, THREE.Material>> }) {
  const parts = useMemo(() => build(), [])
  const extra = useMemo(() => lqMaterials(), [])
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  return (
    <group name="LQPlatform">
      {parts.map((p) => {
        const mk = MAT[p.key] as string
        const material = extra[mk] ?? mats[mk]
        if (!material) return null
        return (
          <mesh key={p.key} name={`lq-${p.key}`} geometry={p.geometry} material={material} castShadow={!NO_SHADOW.has(p.key)} receiveShadow raycast={noRaycast} />
        )
      })}
    </group>
  )
}

export default LQPlatform
