/**
 * Surroundings (WORLD coordinates, sea level y = 0; production deck plate top at y = 28).
 * Jacket + risers + boat landing, cellar deck (y = 20), everything on the weather deck (y = 38:
 * quarters, lifeboats, helideck, crane, turbine stacks, modules), flare boom + animated flame,
 * supply vessel. All materials role 'env' (never clipped by the section box).
 *
 * Live plant state (scene/fx): the flare flame sizes itself from the flare rate, general-alarm beacons
 * flash with each platform's GA status, and tripped machines get a pulsing red ring on the deck.
 *
 * The weather-deck PLATE itself is drawn by <DeckStructure ceiling />; this component draws only
 * what stands on it. upperDeck={false} hides all of that (pair it with DeckStructure ceiling={false}).
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Batches } from '../structure/batch'
import { structMats } from '../structure/structMaterials'
import { buildJacket } from './jacket'
import { buildCellarDeck } from './cellarDeck'
import { buildFlareBoom, buildTopsides, flareTip, FLARE } from './topsides'
import { buildDrillingRig } from './drillingRig'
import { RigMotion } from './RigMotion'
import { envMat } from './envShared'
import { facadeTextures } from './envTextures'
import { FlareFlame } from './Flare'
import { SupplyVessel } from './Vessel'
import { Helicopter } from './Helicopter'
import { AlphaHelideck } from './Helidecks'
import { AlphaLogistics } from './AlphaLogistics'
import { LQPlatform } from './LQPlatform'
import { WHPPlatform } from './WHPPlatform'
import { SatellitePlatforms } from './SatellitePlatforms'
import { EnvOutfit } from './EnvOutfit'
import { Cranes } from './Cranes'
import { Vents } from './Vents'
import { Windsocks } from './Windsock'
import { GaBeacons } from '../fx/GaBeacons'
import { TripHalos } from '../fx/TripHalos'
import { usePlantStore } from '../../state/plantStore'
import { DECK_WORLD_Y } from '../../state/store'

type MatKey =
  | 'jacket'
  | 'riser'
  | 'anode'
  | 'landing'
  | 'ladder'
  | 'steel'
  | 'steelDark'
  | 'grating'
  | 'plate'
  | 'yellow'
  | 'galv'
  | 'equip'
  | 'equipDark'
  | 'red'
  | 'tree'
  | 'white'
  | 'facade'
  | 'roof'
  | 'glass'
  | 'orange'
  | 'soot'
  | 'blue'
  | 'green'
  | 'flareSteel'
  | 'avLight'

function useEnvMaterials(): Record<MatKey, THREE.Material> {
  return useMemo(() => {
    const sm = structMats('env')
    const fac = facadeTextures()
    return {
      jacket: envMat('jacket', { color: '#a8a18c', roughness: 0.68, metalness: 0.3 }, { splash: true, aged: 0.9 }),
      riser: envMat('riser', { color: '#454a4e', roughness: 0.5, metalness: 0.4 }, { splash: true }),
      anode: envMat('anode', { color: '#a7aba9', roughness: 0.82, metalness: 0.2 }), // matte cast aluminium
      landing: envMat('landing', { color: '#7b7f80', roughness: 0.7, metalness: 0.3 }, { splash: true, aged: 1 }),
      ladder: sm.galv,
      steel: sm.steel,
      steelDark: sm.steelDark,
      grating: sm.grating,
      plate: sm.plate,
      yellow: sm.yellow,
      galv: sm.galv,
      equip: envMat('equip', { color: '#b4b7b0', roughness: 0.6, metalness: 0.15 }, { aged: 1 }),
      equipDark: envMat('equipDark', { color: '#5e656a', roughness: 0.55, metalness: 0.3 }, { aged: 0.8 }),
      red: envMat('fwRed', { color: '#b1261d', roughness: 0.45, metalness: 0.2 }),
      tree: envMat('xmasTree', { color: '#d7a514', roughness: 0.45, metalness: 0.3 }),
      white: envMat('cladding', { color: '#c2c4bf', roughness: 0.62, metalness: 0.12 }, { aged: 0.9 }),
      facade: envMat('facade', { map: fac.map, emissiveMap: fac.emissive, emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.45, metalness: 0.15 }),
      roof: envMat('roof', { color: '#7e8487', roughness: 0.85, metalness: 0.15 }, { aged: 1.1 }),
      glass: envMat('glass', { color: '#17222a', roughness: 0.08, metalness: 0.5 }),
      orange: envMat('lifeboat', { color: '#ff6512', roughness: 0.45, metalness: 0.05 }),
      soot: envMat('soot', { color: '#1f1d1b', roughness: 0.9, metalness: 0.1 }),
      blue: envMat('container2', { color: '#285f9c', roughness: 0.6, metalness: 0.3 }),
      green: envMat('container3', { color: '#3f7a3a', roughness: 0.6, metalness: 0.3 }),
      flareSteel: envMat('flareSteel', { color: '#8a8f90', roughness: 0.62, metalness: 0.35 }, { aged: 1 }),
      avLight: envMat('avLight', { color: '#b00d06', emissive: '#ff1a0a', emissiveIntensity: 1.4, roughness: 0.3 }),
    }
  }, [])
}

type BK = string
interface Part {
  key: BK
  mat: MatKey
  geometry: THREE.BufferGeometry
  cast: boolean
}

function collect(B: Batches<BK>, matOf: Record<BK, MatKey>, cast: (k: BK) => boolean): Part[] {
  return B.buildAll().map(({ key, geometry }) => ({ key, geometry, mat: matOf[key], cast: cast(key) }))
}

function buildBase(): Part[] {
  const B = new Batches<BK>()
  const m: Record<BK, MatKey> = {}
  const get = (k: BK, mat: MatKey) => {
    m[k] = mat
    return B.get(k)
  }
  buildJacket({ steel: get('jacket', 'jacket'), riser: get('riser', 'riser'), anode: get('anode', 'anode'), grating: get('landing', 'landing'), ladder: get('jLadder', 'ladder') })
  buildCellarDeck({
    primary: get('cdPrimary', 'steel'),
    secondary: get('cdSecondary', 'steelDark'),
    plate: get('cdPlate', 'plate'),
    grating: get('cdGrating', 'grating'),
    shadow: new Batches<BK>().get('discard'), // cellar grating doesn't need a shadow proxy
    edge: get('cdGratingEdge', 'galv'),
    rail: { rail: get('cdRail', 'yellow'), kick: get('cdKick', 'yellow') },
    equip: get('cdEquip', 'equip'),
    equipDark: get('cdEquipDark', 'equipDark'),
    red: get('cdRed', 'red'),
    tree: get('cdTree', 'tree'),
  })
  buildFlareBoom(get('flare', 'flareSteel'), get('flareLace', 'flareSteel'), get('flareDark', 'steelDark'))
  return collect(B, m, (k) => k !== 'cdGrating' && k !== 'anode')
}

function buildUpper(): Part[] {
  const B = new Batches<BK>()
  const m: Record<BK, MatKey> = {}
  const get = (k: BK, mat: MatKey) => {
    m[k] = mat
    return B.get(k)
  }
  buildTopsides({
    steel: get('tsSteel', 'steel'),
    steelDark: get('tsDark', 'steelDark'),
    white: get('tsWhite', 'white'),
    facade: get('tsFacade', 'facade'),
    roof: get('tsRoof', 'roof'),
    glass: get('tsGlass', 'glass'),
    yellow: get('tsYellow', 'yellow'),
    orange: get('tsOrange', 'orange'),
    soot: get('tsSoot', 'soot'),
    red: get('tsRed', 'red'),
    blue: get('tsBlue', 'blue'),
    green: get('tsGreen', 'green'),
    light: get('rigLight', 'avLight'), // crane obstruction lights share the rig's emissive batch
    rail: { rail: get('tsRail', 'yellow'), kick: get('tsKick', 'yellow') },
  })
  buildDrillingRig({
    steel: get('rigSteel', 'steel'),
    steelDark: get('rigDark', 'steelDark'),
    derrick: get('rigDerrick', 'red'),
    plate: get('rigPlate', 'plate'),
    grating: get('rigGrating', 'grating'),
    shadow: new Batches<BK>().get('discard'),
    edge: get('rigSteel', 'steel'),
    white: get('rigWhite', 'white'),
    glass: get('rigGlass', 'glass'),
    yellow: get('rigYellow', 'yellow'),
    equip: get('rigEquip', 'equip'),
    blue: get('rigBlue', 'blue'),
    red: get('rigRed', 'red'),
    light: get('rigLight', 'avLight'),
    rail: { rail: get('tsRail', 'yellow'), kick: get('tsKick', 'yellow') },
  })
  return collect(B, m, (k) => k !== 'rigGrating' && k !== 'rigLight')
}

function PartMeshes({ parts, mats }: { parts: Part[]; mats: Record<MatKey, THREE.Material> }) {
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  return (
    <>
      {parts.map((p) => (
        <mesh key={p.key} name={p.key} geometry={p.geometry} material={mats[p.mat]} castShadow={p.cast} receiveShadow raycast={() => null} />
      ))}
    </>
  )
}

export interface SurroundingsProps {
  /** show everything standing on the weather deck (crane, quarters, helideck, stacks, modules). */
  upperDeck?: boolean
  /** supply vessel stand-by (default true) */
  vessel?: boolean
}

export function Surroundings({ upperDeck = true, vessel = true }: SurroundingsProps = {}) {
  const mats = useEnvMaterials()
  const base = useMemo(() => buildBase(), [])
  const upper = useMemo(() => (upperDeck ? buildUpper() : []), [upperDeck])
  const tip = flareTip()
  const d = FLARE.dir
  const plant = usePlantStore((s) => s.plant)
  return (
    <group name="Surroundings">
      <PartMeshes parts={base} mats={mats} />
      {upperDeck && <PartMeshes parts={upper} mats={mats} />}
      {upperDeck && <RigMotion mats={mats} />}
      {upperDeck && <AlphaHelideck />}
      <FlareFlame position={[tip[0] + d.x * 3.4, tip[1] + d.y * 3.4 - 0.5, tip[2] + d.z * 3.4]} />
      <GaBeacons upperDeck={upperDeck} />
      <group position={[0, DECK_WORLD_Y, 0]}>
        <TripHalos plant={plant} />
      </group>
      {vessel && <SupplyVessel />}
      <Helicopter />
      <AlphaLogistics upperDeck={upperDeck} />
      <LQPlatform mats={mats} />
      <WHPPlatform mats={mats} />
      <SatellitePlatforms mats={mats} />
      <EnvOutfit mats={mats} upperDeck={upperDeck} />
      <Cranes mats={mats} upperDeck={upperDeck} />
      <Vents upperDeck={upperDeck} />
      <Windsocks upperDeck={upperDeck} />
    </group>
  )
}

export default Surroundings
