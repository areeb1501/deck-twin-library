/**
 * Production Deck structure (deck-local coordinates, y = 0 = top of deck plate, EL +28.0).
 *
 * Draws: deck framing + grating / drip-pan plating, escape-route markings, jacket legs and
 * deck-to-deck columns, central pipe rack, stair towers (cellar -> production -> upper deck),
 * perimeter guard rails, cable trays, upper-deck underside framing + plate (the "ceiling"),
 * light fittings, lifebuoys and signage.
 *
 * Everything static is merged into ONE mesh per (system, material): ~35 draw calls total.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Batches } from './batch'
import { structMats, SHADOW_PROXY_LAYER, type StructMats } from './structMaterials'
import { DEFAULT_SOLID_AREAS, type SolidArea } from './deckConst'
import { buildDeckSurface, buildFraming, buildLegsColumns, buildPerimeterRail, buildUpperDeck } from './deckSteel'
import { buildRack } from './rack'
import { buildStairTower, STAIR_TOWERS } from './stairs'
import { buildCableTrays } from './cableTray'
import { buildFixtures } from './fixtures'
import type { PickData } from '../../model/types'

type Key =
  | 'deckPrimary'
  | 'deckSecondary'
  | 'legs'
  | 'columns'
  | 'grating'
  | 'gratingEdge'
  | 'gratingShadow'
  | 'plate'
  | 'kerb'
  | 'drain'
  | 'paint'
  | 'atlas'
  | 'rack'
  | 'rackBracing'
  | 'rail'
  | 'kick'
  | 'stairSteel'
  | 'nosing'
  | 'tray'
  | 'cable'
  | 'hanger'
  | 'jbox'
  | 'upperPrimary'
  | 'upperSecondary'
  | 'upperPlate'
  | 'lamp'
  | 'lampBody'
  | 'buoyOrange'
  | 'buoyWhite'
  | 'signBack'

const SPEC: Record<Key, { mat: keyof StructMats; tag: string; shadow?: 'cast' | 'receive' | 'both' | 'proxy' | 'none' }> = {
  deckPrimary: { mat: 'steel', tag: 'STR-PD-GIRDERS' },
  deckSecondary: { mat: 'steelDark', tag: 'STR-PD-BEAMS' },
  legs: { mat: 'steel', tag: 'STR-JACKET-LEGS' },
  columns: { mat: 'steel', tag: 'STR-COLUMNS' },
  grating: { mat: 'grating', tag: 'STR-GRATING', shadow: 'receive' },
  gratingEdge: { mat: 'galv', tag: 'STR-GRATING' },
  gratingShadow: { mat: 'gratingShadow', tag: 'STR-GRATING', shadow: 'proxy' },
  plate: { mat: 'plate', tag: 'STR-PD-PLATE' },
  kerb: { mat: 'steelDark', tag: 'STR-PD-DRIPPAN' },
  drain: { mat: 'drain', tag: 'STR-PD-DRIPPAN' },
  paint: { mat: 'walkway', tag: 'STR-ESCAPE-ROUTE', shadow: 'receive' },
  atlas: { mat: 'atlas', tag: 'STR-SIGNAGE', shadow: 'receive' },
  rack: { mat: 'steel', tag: 'STR-PIPERACK' },
  rackBracing: { mat: 'steelDark', tag: 'STR-PIPERACK' },
  rail: { mat: 'yellow', tag: 'STR-HANDRAIL' },
  kick: { mat: 'yellow', tag: 'STR-HANDRAIL' },
  stairSteel: { mat: 'steel', tag: 'STR-STAIR-TOWERS' },
  nosing: { mat: 'yellow', tag: 'STR-STAIR-TOWERS' },
  tray: { mat: 'tray', tag: 'STR-CABLE-TRAY' },
  cable: { mat: 'cable', tag: 'STR-CABLE-TRAY' },
  hanger: { mat: 'galv', tag: 'STR-CABLE-TRAY' },
  jbox: { mat: 'steelDark', tag: 'STR-CABLE-TRAY' },
  upperPrimary: { mat: 'steel', tag: 'STR-UD-GIRDERS' },
  upperSecondary: { mat: 'steelDark', tag: 'STR-UD-BEAMS' },
  upperPlate: { mat: 'plate', tag: 'STR-UD-PLATE' },
  lamp: { mat: 'lamp', tag: 'STR-LIGHTING', shadow: 'none' },
  lampBody: { mat: 'lampBody', tag: 'STR-LIGHTING' },
  buoyOrange: { mat: 'buoyOrange', tag: 'STR-LIFEBUOY' },
  buoyWhite: { mat: 'buoyWhite', tag: 'STR-LIFEBUOY' },
  signBack: { mat: 'galv', tag: 'STR-SIGNAGE' },
}

export interface DeckStructureProps {
  /** plated (drip-pan) equipment footprints, deck-local metres */
  solidAreas?: SolidArea[]
  /**
   * draw the upper-deck plate, its framing and the cable trays hung from it (default true).
   * false = open view from above; columns, legs and tall rack posts still rise to y = 9.4.
   */
  ceiling?: boolean
}

function build(solidAreas: SolidArea[], ceiling: boolean) {
  const B = new Batches<Key>()
  const rb = { rail: B.get('rail'), kick: B.get('kick') }
  const gb = { grating: B.get('grating'), shadow: B.get('gratingShadow'), edge: B.get('gratingEdge') }

  buildFraming(B.get('deckPrimary'), B.get('deckSecondary'), -0.03)
  buildDeckSurface({ ...gb, plate: B.get('plate'), kerb: B.get('kerb'), drain: B.get('drain'), paint: B.get('paint'), decal: B.get('atlas') }, solidAreas)
  buildLegsColumns(B.get('legs'), B.get('columns'), !ceiling)
  buildRack(B.get('rack'), B.get('rackBracing'))
  buildPerimeterRail(rb)
  for (const t of STAIR_TOWERS)
    buildStairTower(t, { ...rb, steel: B.get('stairSteel'), grating: { grating: gb.grating, shadow: gb.shadow }, nosing: B.get('nosing'), lamp: B.get('lamp'), lampBody: B.get('lampBody') })
  // cable trays hang from the upper deck, so they go with the ceiling; columns / rack posts stay
  if (ceiling) {
    buildCableTrays({ tray: B.get('tray'), cable: B.get('cable'), hanger: B.get('hanger'), box: B.get('jbox') })
    buildUpperDeck(B.get('upperPrimary'), B.get('upperSecondary'), B.get('upperPlate'))
  }
  buildFixtures(ceiling, {
    lamp: B.get('lamp'),
    lampBody: B.get('lampBody'),
    buoyOrange: B.get('buoyOrange'),
    buoyWhite: B.get('buoyWhite'),
    atlas: B.get('atlas'),
    signBack: B.get('signBack'),
  })
  return B.buildAll()
}

export function DeckStructure({ solidAreas = DEFAULT_SOLID_AREAS, ceiling = true }: DeckStructureProps = {}) {
  const mats = structMats('structure')
  const key = JSON.stringify(solidAreas) + ceiling
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parts = useMemo(() => build(solidAreas, ceiling), [key])
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])

  return (
    <group name="DeckStructure">
      {parts.map(({ key, geometry }) => {
        const spec = SPEC[key]
        const sh = spec.shadow ?? 'both'
        const userData: PickData = { tag: spec.tag, kind: 'structure' }
        return (
          <mesh
            key={key}
            name={key}
            geometry={geometry}
            material={mats[spec.mat]}
            castShadow={sh === 'cast' || sh === 'both' || sh === 'proxy'}
            receiveShadow={sh === 'receive' || sh === 'both'}
            userData={userData}
            onUpdate={sh === 'proxy' ? (o: THREE.Object3D) => o.layers.set(SHADOW_PROXY_LAYER) : undefined}
            raycast={sh === 'proxy' ? () => null : undefined}
          />
        )
      })}
    </group>
  )
}

export default DeckStructure
