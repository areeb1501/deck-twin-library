// Pillar fire hydrant (dry barrel): flanged shoe on the buried firewater riser with thrust block and drain, breakaway flange at grade, red barrel with two 2½" hose outlets and optional 4½" pumper outlet, chained caps, bonnet with pentagon operating nut. AWWA C502, EN 14384, NFPA 24, ASME B16.5.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, flangedJoint, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { elbow90, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { portBore } from './_valves'

export interface FireHydrantProps {
  /** inlet (riser) size, inches */
  nps?: number
  rating?: Rating
  /** 2: two hose outlets; 3: adds a pumper outlet on the front */
  outlets?: number
  /** inlet centreline below grade, m */
  bury?: number
  tag?: string
}

export const defaults = { nps: 6, rating: 150 as Rating, outlets: 3, bury: 1.2, tag: 'FH-7101' }

const RED = 'firewaterRed'
const GRAVEL = paint('#7a766e', { metalness: 0, roughness: 0.95 })
const XI = -0.55 // inlet flange face, m
const HB = 0.8 // barrel top above grade, m
const YO = 0.55 // hose outlet centreline above grade, m

export function ports(p: FireHydrantProps = {}): Port[] {
  const { nps, rating, bury } = { ...defaults, ...p }
  return [port('inlet', 'Firewater inlet', [XI, -Math.max(0.6, bury), 0], [-1, 0, 0], nps, rating, 'utility')]
}

export function FireHydrant(props: FireHydrantProps & GroupProps) {
  const { nps, rating, outlets, bury, tag, ...group } = { ...defaults, ...props }
  const b = Math.max(0.6, bury)
  const data = useKit((k) => build(k, nps, rating, outlets >= 3, b, tag), [nps, rating, outlets, b, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default FireHydrant

/** Threaded outlet nozzle along `dir` from the barrel wall, with its cap, cap nut and chain back to a lug. */
function outlet(k: Kit, y: number, dir: V3, r0: number, ro: number, L: number) {
  const d = new THREE.Vector3(...dir)
  const at = (s: number, dy = 0): V3 => [d.x * s, y + dy, d.z * s]
  const ax = dir as V3
  k.cyl(RED, ro * 1.25, 0.03, at(r0 + 0.005), ax, 28)
  k.cyl('brass', ro, L - 0.03, at(r0 + 0.02 + (L - 0.03) / 2), ax, 28)
  for (let i = 0; i < 5; i++) k.torus('brass', ro + 0.001, 0.0015, at(r0 + 0.035 + i * ((L - 0.05) / 5)), ax, 4, 28)
  // cap: skirt over the thread, face, pentagon nut, chain lug
  const zc = r0 + L - 0.005
  k.cyl(RED, ro + 0.008, 0.045, at(zc), ax, 28)
  k.cyl(RED, ro + 0.004, 0.008, at(zc + 0.026), ax, 28)
  k.cyl(RED, ro * 0.38, 0.03, at(zc + 0.04), ax, 5)
  for (const s of [-1, 1]) k.box(RED, [0.012, 0.03, 0.03], [d.x * zc + d.z * s * (ro + 0.012), y + 0.0, d.z * zc - d.x * s * (ro + 0.012)])
  // chain from the cap lug down to a lug on the barrel
  const a = new THREE.Vector3(d.x * zc, y - ro - 0.01, d.z * zc)
  const bb = new THREE.Vector3(d.x * (r0 + 0.01), y - ro - 0.07, d.z * (r0 + 0.01))
  k.box(RED, [0.02, 0.02, 0.02], [bb.x, bb.y + 0.005, bb.z])
  const n = 7
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    const p = a.clone().lerp(bb, t)
    p.y -= Math.sin(t * Math.PI) * 0.03
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), bb.clone().sub(a).normalize())
    if (i % 2) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
    k.torus('galvanised', 0.008, 0.0018, p.toArray() as V3, q, 4, 10)
  }
}

function build(k: Kit, nps: number, rating: Rating, pumper: boolean, bury: number, tag: string) {
  const D = pipeOD(nps)
  const R = elbow90(nps)
  const yi = -bury
  // buried section: flanged inlet, duckfoot shoe on its thrust block, riser up to grade (bitumen coated)
  const L = flange(k, nps, rating, [XI, yi, 0], '-x', true)
  portBore(k, nps, rating, [XI, yi, 0], '-x')
  k.pipe('castIron', [XI + L, yi, 0], [-R, yi, 0], D, pipeWall(nps, 'STD'))
  k.bend('castIron', [-R, yi, 0], [1, 0, 0], [0, 1, 0], R, D)
  const xf = -R * 0.85
  k.cyl('castIron', D * 0.35, 0.12, [xf, yi - D / 2 - 0.055, 0], 'y', 20)
  k.cyl('castIron', D * 0.5, 0.015, [xf, yi - D / 2 - 0.1125, 0], 'y', 20)
  k.box('concrete', [0.5, 0.25, 0.5], [xf, yi - D / 2 - 0.12 - 0.125, 0])
  // drain outlet at the foot of the riser into a gravel pocket
  const yd = yi + R + 0.06
  k.cyl('castIron', 0.014, 0.07, [D / 2 + 0.03, yd, 0], 'x', 10)
  k.box(GRAVEL, [0.22, 0.14, 0.26], [D / 2 + 0.11, yd - 0.02, 0])
  const yg = -0.06
  k.pipe('castIron', [0, yi + R, 0], [0, yg - 0.03, 0], D, pipeWall(nps, 'STD'))
  // breakaway (traffic) flange at grade
  flangedJoint(k, nps, 150, [0, yg, 0], 'y')
  // barrel: base collar, body with casting ribs, nozzle section, bonnet, weather shield, operating nut
  const rb = D / 2 + 0.02
  k.cyl(RED, rb, HB - 0.02, [0, 0.01 + (HB - 0.02) / 2, 0], 'y', 36)
  k.cyl(RED, rb + 0.015, 0.05, [0, 0.03, 0], 'y', 36)
  for (const y of [0.25, YO + 0.11]) k.cyl(RED, rb + 0.008, 0.02, [0, y, 0], 'y', 36)
  k.cyl(RED, rb + 0.012, 0.04, [0, HB, 0], 'y', 36)
  k.around(8, rb + 0.004, [0, HB + 0.022, 0], 'y', (p) => k.hex('nut', 0.018, 0.012, p, 'y'), Math.PI / 8)
  k.dome(RED, rb, [0, HB + 0.02, 0], 'y', Math.PI / 2, 0.55, 36)
  k.cyl(RED, rb * 0.45, 0.05, [0, HB + 0.02 + rb * 0.55, 0], 'y', 24)
  k.lathe(RED, [[rb * 0.42, 0], [rb * 0.7, 0.0], [rb * 0.72, 0.008], [rb * 0.44, 0.03]], [0, HB + rb * 0.55 + 0.03, 0], 'y', 32)
  k.cyl('castIron', 0.024, 0.03, [0, HB + rb * 0.55 + 0.075, 0], 'y', 5)
  k.disc('nameplate', 0.02, [0, HB + rb * 0.55 + 0.0905, 0], 'y', 5)
  // hose outlets left and right, pumper outlet to the front
  outlet(k, YO, [1, 0, 0], rb - 0.005, 0.038, 0.11)
  outlet(k, YO, [-1, 0, 0], rb - 0.005, 0.038, 0.11)
  if (pumper) outlet(k, YO - 0.02, [0, 0, 1], rb - 0.005, 0.064, 0.12)
  // red reflective marker band and tag on the back
  k.cyl('nameplate', rb + 0.001, 0.03, [0, 0.4, 0], 'y', 36, undefined, true)
  tagPlate(k, tag, [0, 0.2, -rb - 0.002], '-z', 0.1)
}
