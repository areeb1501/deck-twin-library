/**
 * The two helidecks, drawn by the library's Helideck component. Same footprint and deck height as the site
 * data (LQ.helideck, HELIDECK), so the helicopter, walk surfaces and stairs stay as they are. Both obstacle-free
 * sectors face open sea. WORLD coordinates.
 */
import { useLayoutEffect, useRef, type ComponentProps } from 'react'
import * as THREE from 'three'
import { Helideck } from '../../../../registry/structure/helideck'
import { LQ } from '../../model/site'
import { LQ_HELI_Y, LQ_ROOF_Y } from './lqQuarters'
import { HELIDECK } from './topsides'

const noRay = () => null
const dValue = (r: number) => 2 * r * Math.cos(Math.PI / 8)

/** the LQ deck stands on the roof slab */
const LQ_HEIGHT = LQ_HELI_Y - LQ_ROOF_Y - 0.25
/** net opening for the escape stair's top landing and top flight, on the east and south-east sides */
const LQ_STAIR_GAPS = [
  [5, 0.76, 1],
  [6, 0, 0.25],
] as const
/** the Alpha deck sits on the quarters' own posts and braces, so only the grillage is drawn */
const ALPHA_HEIGHT = 2
/** net opening for the access ladder on the east edge */
const ALPHA_LADDER_GAP = [[3, 0.12, 0.25]] as const

function EnvHelideck(props: ComponentProps<typeof Helideck>) {
  const top = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    top.current?.traverse((o) => {
      o.raycast = noRay
      o.userData.noCull = true
    })
  }, [])
  return (
    <group ref={top} userData={{ noBatch: true }}>
      <Helideck access={false} {...props} />
    </group>
  )
}

export function LqHelideck() {
  const H = LQ.helideck
  return <EnvHelideck position={[H.x, LQ_HELI_Y - LQ_HEIGHT, H.z]} rotation={[0, -Math.PI / 2, 0]} dValue={dValue(H.r)} height={LQ_HEIGHT} installation="ALPHA LQ" netGaps={LQ_STAIR_GAPS} />
}

export function AlphaHelideck() {
  const H = HELIDECK
  return <EnvHelideck position={[H.x, H.y - ALPHA_HEIGHT, H.z]} rotation={[0, Math.PI, 0]} dValue={dValue(H.r)} height={ALPHA_HEIGHT} installation="ALPHA" legs={false} netGaps={ALPHA_LADDER_GAP} />
}
