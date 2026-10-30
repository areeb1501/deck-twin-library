/**
 * Environment outfitting that needs the shared lamp / tray / signage / paint materials: the Alpha cellar
 * deck (cellarOutfit.ts), the WHP-N cellar deck (whpCellarOutfit.ts) and the derrick floodlights
 * (drillingRig.ts, only with the upper-deck layer). Static, batched (one mesh per material and group),
 * non-pickable; only the solid items cast shadows.
 */
import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Batches } from '../structure/batch'
import { structMats } from '../structure/structMaterials'
import { buildCellarOutfit, type OutfitKey } from './cellarOutfit'
import { buildWhpCellarOutfit } from './whpCellarOutfit'
import { buildRigFloodlights } from './drillingRig'

const CAST = new Set<OutfitKey>(['equip', 'equipDark', 'blue', 'white', 'red', 'steelDark'])

interface Part {
  key: OutfitKey
  geometry: THREE.BufferGeometry
}

function build(fn: (get: (k: OutfitKey) => ReturnType<Batches<OutfitKey>['get']>) => void): Part[] {
  const B = new Batches<OutfitKey>()
  fn((k) => B.get(k))
  return B.buildAll()
}

const noRaycast = () => null

function Group({ name, parts, mats }: { name: string; parts: Part[]; mats: Record<OutfitKey, THREE.Material> }) {
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  return (
    <group name={name}>
      {parts.map((p) => (
        <mesh key={p.key} name={`${name}-${p.key}`} geometry={p.geometry} material={mats[p.key]} castShadow={CAST.has(p.key)} receiveShadow raycast={noRaycast} />
      ))}
    </group>
  )
}

export const EnvOutfit = memo(function EnvOutfit({ mats, upperDeck = true }: { mats: Partial<Record<string, THREE.Material>>; upperDeck?: boolean }) {
  const all = useMemo<Record<OutfitKey, THREE.Material>>(() => {
    const sm = structMats('env')
    const m = (k: string, fb: THREE.Material) => mats[k] ?? fb
    return {
      steel: m('steel', sm.steel),
      steelDark: m('steelDark', sm.steelDark),
      galv: m('galv', sm.galv),
      yellow: m('yellow', sm.yellow),
      green: sm.green,
      red: m('red', sm.yellow),
      equip: m('equip', sm.steel),
      equipDark: m('equipDark', sm.steelDark),
      white: m('white', sm.steel),
      blue: m('blue', sm.steel),
      tray: sm.tray,
      cable: sm.cable,
      lamp: sm.lamp,
      lampBody: sm.lampBody,
      walkway: sm.walkway,
      atlas: sm.atlas,
      signBack: sm.galv,
      buoyOrange: sm.buoyOrange,
      buoyWhite: sm.buoyWhite,
    }
  }, [mats])
  const cellar = useMemo(() => build(buildCellarOutfit), [])
  const whp = useMemo(() => build(buildWhpCellarOutfit), [])
  const rig = useMemo(() => (upperDeck ? build((get) => buildRigFloodlights({ lamp: get('lamp'), lampBody: get('lampBody') })) : []), [upperDeck])
  return (
    <>
      <Group name="AlphaCellarOutfit" parts={cellar} mats={all} />
      <Group name="WhpCellarOutfit" parts={whp} mats={all} />
      {upperDeck && <Group name="RigFloodlights" parts={rig} mats={all} />}
    </>
  )
})

export default EnvOutfit
