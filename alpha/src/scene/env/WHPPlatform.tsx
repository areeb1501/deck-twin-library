/**
 * WHP-N wellhead platform + north bridge as a few batched, non-pickable env meshes.
 * Geometry: whpDeck.ts (jacket, conductors, decks, rails, stair, laydown, nav aids, bridge) and the
 * offshore pedestal crane from crane.ts, built at the origin and scaled down to a WHP-size crane on the
 * NE leg. Materials: the Surroundings env materials passed in (`mats`, same keys as Surroundings) plus a
 * few WHP-only ones created here (nav lanterns, ID boards, conductors, lights, cable tray).
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Batches } from '../structure/batch'
import { structMats } from '../structure/structMaterials'
import { envMat } from './envShared'
import { buildWhp, type WhpKey } from './whpDeck'
import { buildCrane } from './crane'
import { WHP } from '../../model/site'

/** batch key -> Surroundings material key or a WHP-only material (resolved in whpMaterials); null = not drawn */
const MAT: Record<WhpKey, string | null> = {
  jacket: 'jacket',
  conductor: 'riser',
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
  orange: 'orange',
  blue: 'blue',
  green: 'green',
  soot: 'soot',
  lamp: 'whp:lamp',
  lampBody: 'whp:lampBody',
  tray: 'whp:tray',
  cable: 'whp:cable',
  navLight: 'whp:navLight',
  idBoard: 'whp:idBoard',
}
const NO_SHADOW = new Set<string>(['grating', 'lamp', 'navLight', 'cr:net', 'cr:light'])

function idBoardTexture() {
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
  g.font = 'bold 116px Arial, Helvetica, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('WHP-N', c.width / 2, c.height / 2 + 6)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function whpMaterials(): Record<string, THREE.Material> {
  const sm = structMats('env')
  return {
    'whp:lamp': sm.lamp,
    'whp:lampBody': sm.lampBody,
    'whp:tray': sm.tray,
    'whp:cable': sm.cable,
    'whp:navLight': envMat('whpNavLight', { color: '#fff6d8', emissive: '#fff1c2', emissiveIntensity: 2.2, roughness: 0.2 }),
    'whp:idBoard': envMat('whpIdBoard', { map: idBoardTexture(), roughness: 0.6, metalness: 0.05 }),
  }
}

interface Part {
  key: string
  mat: string
  geometry: THREE.BufferGeometry
}

function build(): Part[] {
  const B = new Batches<WhpKey>()
  buildWhp((k) => B.get(k))
  const parts: Part[] = B.buildAll()
    .filter((p) => MAT[p.key] !== null)
    .map((p) => ({ key: p.key, mat: MAT[p.key] as string, geometry: p.geometry }))

  // pedestal crane: built at the origin, scaled to WHP size and moved onto the NE leg
  const C = new Batches<string>()
  const cg = (k: string) => C.get(`cr:${k}`)
  buildCrane(
    {
      yellow: cg('yellow'),
      white: cg('white'),
      steel: cg('steel'),
      steelDark: cg('steelDark'),
      glass: cg('glass'),
      soot: cg('soot'),
      blue: cg('blue'),
      net: cg('net'),
      light: cg('light'),
      rail: { rail: cg('yellow'), kick: cg('yellow') },
    },
    { x: 0, z: 0, deck: 0, heading: WHP.crane.heading },
  )
  const s = WHP.crane.scale
  const m = new THREE.Matrix4().compose(new THREE.Vector3(WHP.crane.x, 28, WHP.crane.z), new THREE.Quaternion(), new THREE.Vector3(s, s, s))
  const CMAT: Record<string, string> = { yellow: 'yellow', white: 'white', steel: 'steel', steelDark: 'steelDark', glass: 'glass', soot: 'soot', blue: 'blue', net: 'grating', light: 'avLight' }
  for (const p of C.buildAll()) {
    p.geometry.applyMatrix4(m)
    p.geometry.computeBoundingSphere()
    p.geometry.computeBoundingBox()
    parts.push({ key: p.key, mat: CMAT[p.key.slice(3)], geometry: p.geometry })
  }
  return parts
}

const noRaycast = () => null

export function WHPPlatform({ mats }: { mats: Partial<Record<string, THREE.Material>> }) {
  const parts = useMemo(() => build(), [])
  const extra = useMemo(() => whpMaterials(), [])
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  return (
    <group name="WHPPlatform">
      {parts.map((p) => {
        const material = extra[p.mat] ?? mats[p.mat]
        if (!material) return null
        return <mesh key={p.key} name={`whp-${p.key}`} geometry={p.geometry} material={material} castShadow={!NO_SHADOW.has(p.key)} receiveShadow raycast={noRaycast} />
      })}
    </group>
  )
}

export default WHPPlatform
