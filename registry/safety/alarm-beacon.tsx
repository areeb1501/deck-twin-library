// Ex d status / general-alarm beacon with guarded lens and optional horn sounder on a shelf bracket, on a stanchion or wall. EN 54-23, EN 54-3.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { cableToDeck, faceZ, mounted, stopPlug, type Mount } from './_fg'

export type BeaconColour = 'red' | 'amber' | 'blue' | 'green' | 'white'

export interface AlarmBeaconProps {
  colour?: BeaconColour
  sounder?: boolean
  mount?: Mount
  /** beacon base above the deck, m */
  height?: number
  /** flashes per second, 0 = steady */
  flash?: number
  lit?: boolean
  tag?: string
}

export const defaults = { colour: 'red' as BeaconColour, sounder: true, mount: 'pole' as Mount, height: 2.5, flash: 1, lit: true, tag: 'XA-1101' }

const COLOURS: Record<BeaconColour, string> = { red: '#ff2a1a', amber: '#ff9a10', blue: '#2a6bff', green: '#22d36a', white: '#fff4e0' }
const SHELF = 0.075 // shelf top above the bracket centre, m
const BZ = 0.085 // beacon axis out from the bracket face, m

export function AlarmBeacon(props: AlarmBeaconProps & GroupProps) {
  const { colour, sounder, mount, height, flash, lit, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(0.8, height)
  const data = useKit((k) => build(k, mount, h, sounder, tag), [mount, h, sounder, tag])
  const lensMat = useMemo(() => {
    const c = COLOURS[colour] ?? COLOURS.red
    return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.88 })
  }, [colour])
  useEffect(() => () => lensMat.dispose(), [lensMat])
  const lens = useKit((k) => {
    const y = h + SHELF + 0.075
    k.cyl(lensMat, 0.042, 0.1, [0, y + 0.05, faceZ(mount) + BZ], 'y', 24)
    k.dome(lensMat, 0.042, [0, y + 0.1, faceZ(mount) + BZ], 'y', Math.PI / 2, 0.5, 20)
  }, [lensMat, mount, h])
  useFrame(({ clock }) => {
    const on = lit && (flash <= 0 || (clock.elapsedTime * flash) % 1 < 0.2)
    lensMat.emissiveIntensity = on ? 2.2 : lit ? 0.12 : 0.04
  })
  return (
    <group {...group}>
      <KitMesh data={data} />
      <KitMesh data={lens} shadows={false} />
    </group>
  )
}

export default AlarmBeacon

function build(k: Kit, mount: Mount, h: number, sounder: boolean, tag: string) {
  const zf = mounted(k, mount, h, [0.14, sounder ? 0.5 : 0.2], () => {
    // shelf bracket: flat plate on two gussets, beacon bolted on top
    k.box('stainless', [0.12, 0.006, 0.16], [0, SHELF - 0.003, 0.08])
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape().moveTo(0, 0).lineTo(0.14, 0).lineTo(0, -0.08).closePath()
      k.extrude('stainless', sh, 0.005, new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(s * 0.05 + 0.0025, SHELF - 0.006, 0))
    }
    beacon(k, [0, SHELF, BZ])
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.014, 0.007, [sx * 0.048, SHELF + 0.0035, BZ + sz * 0.048], 'y')
    if (sounder) horn(k, -0.11)
  }, h + SHELF + 0.08)
  tagPlate(k, tag, [0, h + (sounder ? -0.225 : -0.07), zf + 0.001], 'z', 0.1)
  cableToDeck(k, mount, [-0.077, h + SHELF + 0.03, zf + BZ])
}

/** Ex d beacon: base housing with glands, lens (separate mesh) inside a four-bar guard and top cap. */
function beacon(k: Kit, p: V3) {
  const [x, y, z] = p
  k.cyl('actuatorRed', 0.058, 0.06, [x, y + 0.03, z], 'y', 28)
  k.cyl('actuatorRed', 0.062, 0.015, [x, y + 0.0675, z], 'y', 28)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    k.hex('nut', 0.01, 0.006, [x + Math.cos(a) * 0.054, y + 0.078, z + Math.sin(a) * 0.054], 'y')
  }
  const y0 = y + 0.075
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    k.rod('stainless', [x + Math.cos(a) * 0.05, y0, z + Math.sin(a) * 0.05], [x + Math.cos(a) * 0.05, y0 + 0.13, z + Math.sin(a) * 0.05], 0.0035, 6)
  }
  for (const yy of [y0 + 0.05, y0 + 0.13]) k.torus('stainless', 0.05, 0.0035, [x, yy, z], 'y', 6, 24)
  k.cyl('stainless', 0.012, 0.012, [x, y0 + 0.136, z], 'y', 12)
  k.hex('brass', 0.03, 0.02, [x - 0.066, y + 0.03, z], 'x')
  stopPlug(k, [x + 0.061, y + 0.03, z], 'x')
  k.box('nameplate', [0.04, 0.025, 0.002], [x, y + 0.03, z + 0.0585])
}

/** Ex d horn sounder on a U-bracket, projecting +Z. */
function horn(k: Kit, y: number) {
  k.box('stainless', [0.11, 0.08, 0.006], [0, y, 0.003])
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.hex('nut', 0.014, 0.006, [sx * 0.045, y + sy * 0.03, 0.009], 'z')
  for (const s of [-1, 1]) {
    k.box('stainless', [0.006, 0.04, 0.06], [s * 0.065, y, 0.03])
    k.hex('nut', 0.02, 0.01, [s * 0.072, y, 0.045], 'x')
  }
  k.cyl('actuatorRed', 0.06, 0.12, [0, y, 0.07], 'z', 28)
  k.cyl('actuatorRed', 0.064, 0.014, [0, y, 0.012], 'z', 28)
  k.lathe('actuatorRed', [[0.045, 0], [0.05, 0], [0.065, 0.06], [0.1, 0.1], [0.104, 0.104], [0.096, 0.104], [0.06, 0.07], [0.042, 0.012]], [0, y, 0.13], 'z', 32)
  k.disc('castIron', 0.045, [0, y, 0.145], 'z', 20)
  k.hex('brass', 0.03, 0.02, [0, y - 0.07, 0.06], 'y')
  stopPlug(k, [0, y - 0.064, 0.1], '-y')
}
