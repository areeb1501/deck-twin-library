/**
 * RP (riser & export platform + west bridge) and WI (water-injection platform + north-north bridge) as
 * batched, non-pickable env meshes. Geometry: satDeck.ts / satJacket.ts / satBridge.ts. Materials: the
 * Surroundings env materials passed in (`mats`) plus a few shared ones (nav lanterns, lamps, cable tray and
 * the two ID-board textures).
 *
 * Performance: each platform is its own batch set (one mesh per material, ~25 meshes per platform), so an
 * off-screen platform frustum-culls as a whole; static (no per-frame work, no re-render on sim ticks);
 * raycast off; only the big silhouettes (jacket, deck steel, plate, risers, cargo) cast shadows.
 */
import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Batches } from '../structure/batch'
import { structMats } from '../structure/structMaterials'
import { envMat } from './envShared'
import { buildRpPlatform, buildWiPlatform, type SatGet, type SatKey } from './satDeck'

/** batch key -> Surroundings material key or a satellite material (resolved in satMaterials); null = not drawn */
const MAT: Record<SatKey, string | null> = {
  jacket: 'jacket',
  riser: 'riser',
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
  blue: 'blue',
  green: 'green',
  soot: 'soot',
  lamp: 'sat:lamp',
  lampBody: 'sat:lampBody',
  tray: 'sat:tray',
  cable: 'sat:cable',
  navLight: 'sat:navLight',
  idRP: 'sat:idRP',
  idWI: 'sat:idWI',
}
/** only big silhouettes cast shadows (no rails, grating, lamps, small steel) */
const CAST = new Set<SatKey>(['jacket', 'riser', 'steel', 'plate', 'landing', 'blue', 'white'])

function idBoardTexture(text: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 184
  const g = c.getContext('2d')!
  g.fillStyle = '#f2c400'
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = '#151515'
  g.lineWidth = 10
  g.strokeRect(8, 8, c.width - 16, c.height - 16)
  g.fillStyle = '#151515'
  g.font = 'bold 128px Arial, Helvetica, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, c.width / 2, c.height / 2 + 6)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function satMaterials(): Record<string, THREE.Material> {
  const sm = structMats('env')
  return {
    'sat:lamp': sm.lamp,
    'sat:lampBody': sm.lampBody,
    'sat:tray': sm.tray,
    'sat:cable': sm.cable,
    // same cache key as WHP-N's lanterns: one shared material / shader program
    'sat:navLight': envMat('whpNavLight', { color: '#fff6d8', emissive: '#fff1c2', emissiveIntensity: 2.2, roughness: 0.2 }),
    'sat:idRP': envMat('satIdBoardRP', { map: idBoardTexture('RP'), roughness: 0.6, metalness: 0.05 }),
    'sat:idWI': envMat('satIdBoardWI', { map: idBoardTexture('WI'), roughness: 0.6, metalness: 0.05 }),
  }
}

interface Part {
  key: string
  mat: string
  cast: boolean
  geometry: THREE.BufferGeometry
}

function build(fn: (get: SatGet) => void): Part[] {
  const B = new Batches<SatKey>()
  fn((k) => B.get(k))
  return B.buildAll()
    .filter((p) => MAT[p.key] !== null)
    .map((p) => {
      p.geometry.computeBoundingSphere()
      return { key: p.key, mat: MAT[p.key] as string, cast: CAST.has(p.key), geometry: p.geometry }
    })
}

const noRaycast = () => null

function Platform({ name, parts, mats, extra }: { name: string; parts: Part[]; mats: Partial<Record<string, THREE.Material>>; extra: Record<string, THREE.Material> }) {
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  return (
    <group name={name}>
      {parts.map((p) => {
        const material = extra[p.mat] ?? mats[p.mat]
        if (!material) return null
        return <mesh key={p.key} name={`${name}-${p.key}`} geometry={p.geometry} material={material} castShadow={p.cast} receiveShadow raycast={noRaycast} />
      })}
    </group>
  )
}

export const SatellitePlatforms = memo(function SatellitePlatforms({ mats }: { mats: Partial<Record<string, THREE.Material>> }) {
  const rp = useMemo(() => build(buildRpPlatform), [])
  const wi = useMemo(() => build(buildWiPlatform), [])
  const extra = useMemo(() => satMaterials(), [])
  return (
    <>
      <Platform name="RPPlatform" parts={rp} mats={mats} extra={extra} />
      <Platform name="WIPlatform" parts={wi} mats={mats} extra={extra} />
    </>
  )
})

export default SatellitePlatforms
