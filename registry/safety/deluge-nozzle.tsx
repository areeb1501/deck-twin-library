// Fire-protection discharge head on a short flanged drop: open medium-velocity spray nozzle (external deflector), high-velocity nozzle (open conical orifice), glass-bulb sprinkler (temperature-coded bulb) or multi-orifice water-mist head; optional spray cone. NFPA 15, NFPA 13, EN 12259-1, ISO 6182-1, ASME B16.5.
import * as THREE from 'three'
import { Kit, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { pipeOD, pipeWall, type Rating } from '../lib/standards'
import { portBore } from './_valves'

export type NozzleKind = 'mv' | 'hv' | 'sprinkler' | 'water-mist'

export interface DelugeNozzleProps {
  /** mv: medium-velocity spray; hv: high-velocity; sprinkler: glass-bulb; water-mist: multi-orifice head */
  kind?: NozzleKind
  /** drop size, inches */
  nps?: number
  rating?: Rating
  /** flange face above the nozzle body centre, m */
  drop?: number
  /** spray cone included angle, ° */
  angle?: number
  /** sprinkler bulb rating, °C (57 orange, 68 red, 79 yellow, 93 green, 141 blue) */
  temperature?: number
  spray?: boolean
  tag?: string
}

export const defaults = { kind: 'mv' as NozzleKind, nps: 1, rating: 150 as Rating, drop: 0.2, angle: 110, temperature: 68, spray: false, tag: 'DN-7201' }

const BULB: [number, string][] = [[57, '#ff8a1a'], [68, '#e8241a'], [79, '#f2d21a'], [93, '#2fb34a'], [141, '#2a6bff'], [182, '#8a3cc7']]
const WATER = paint('#bfe3f2', { transparent: true, opacity: 0.22, roughness: 0.2, metalness: 0, weather: 0 })

export function ports(p: DelugeNozzleProps = {}): Port[] {
  const { nps, rating, drop } = { ...defaults, ...p }
  return [port('A', 'Inlet', [0, Math.max(0.12, drop), 0], [0, 1, 0], nps, rating, 'utility')]
}

export function DelugeNozzle(props: DelugeNozzleProps & GroupProps) {
  const { kind, nps, rating, drop, angle, temperature, spray, tag, ...group } = { ...defaults, ...props }
  const L = Math.max(0.12, drop)
  const data = useKit((k) => build(k, kind, nps, rating, L, temperature, tag), [kind, nps, rating, L, temperature, tag])
  const cone = useKit((k) => {
    if (!spray) return
    const a = (Math.max(10, Math.min(175, angle)) * Math.PI) / 360
    const len = kind === 'hv' ? 1.2 : 0.8
    const r = Math.min(3, Math.tan(a) * len)
    k.cyl(WATER, 0.006, kind === 'sprinkler' ? 0.25 : len, [0, -0.04 - (kind === 'sprinkler' ? 0.125 : len / 2), 0], '-y', 32, kind === 'sprinkler' ? 0.6 : r, true)
  }, [spray, angle, kind])
  return (
    <group {...group}>
      <KitMesh data={data} />
      <KitMesh data={cone} shadows={false} />
    </group>
  )
}

export default DelugeNozzle

function bulbColour(t: number) {
  let c = BULB[0][1]
  for (const [deg, col] of BULB) if (t >= deg) c = col
  return c
}

/** Male ½" NPT thread and wrench hex of a brass head, thread top at y = 0.03. */
function threadHex(k: Kit, mat: MatKey) {
  k.cyl(mat, 0.0105, 0.014, [0, 0.023, 0], 'y', 20)
  for (let i = 0; i < 4; i++) k.torus(mat, 0.0106, 0.0008, [0, 0.018 + i * 0.0032, 0], 'y', 4, 20)
  k.hex(mat, 0.03, 0.012, [0, 0.01, 0], 'y')
}

function build(k: Kit, kind: NozzleKind, nps: number, rating: Rating, L: number, temperature: number, tag: string) {
  const D = pipeOD(nps)
  // flanged drop: weld-neck flange (port A), pipe, forged half-coupling reducing to ½" NPT
  const fl = flange(k, nps, rating, [0, L, 0], 'y', true)
  portBore(k, nps, rating, [0, L, 0], 'y')
  const yc = 0.045
  k.pipe('galvanised', [0, yc + 0.03, 0], [0, L - fl, 0], D, pipeWall(nps, '80'))
  k.torus('flangeSteel', D / 2 + 0.0008, 0.0025, [0, L - fl, 0], 'y', 6, 24)
  k.cyl('galvanised', 0.016, yc + 0.03 - 0.025, [0, (yc + 0.03 + 0.025) / 2, 0], 'y', 24, D / 2 + 0.004)
  tagPlate(k, tag, [0, L - fl - 0.04, D / 2 + 0.006], 'z', 0.06)
  k.rod('stainless', [-0.03, L - fl - 0.04 + 0.009, D / 2 + 0.004], [-0.03, L - fl - 0.04 + 0.009, 0], 0.0012, 6)
  const brass: MatKey = 'brass'
  if (kind === 'mv') {
    // body with orifice (hollow), two frame arms to an external slotted deflector
    threadHex(k, brass)
    k.lathe(brass, [[0.007, 0.004], [0.007, -0.008], [0.013, -0.008], [0.015, 0.004]], [0, 0, 0], 'y', 24)
    k.pipe('pipeBore', [0, 0.004, 0], [0, -0.008, 0], 0.012, 0.0004, 16)
    for (const s of [-1, 1]) k.box(brass, [0.004, 0.034, 0.006], [s * 0.014, -0.025, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s * 0.18))
    k.cyl(brass, 0.006, 0.01, [0, -0.04, 0], 'y', 16)
    k.lathe(brass, [[0.001, -0.045], [0.004, -0.045], [0.017, -0.039], [0.018, -0.042], [0.001, -0.049]], [0, 0, 0], 'y', 32)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      k.box('pipeBore', [0.006, 0.0015, 0.0018], [Math.cos(a) * 0.014, -0.0402, Math.sin(a) * 0.014], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.45)))
    }
  } else if (kind === 'hv') {
    // conical body with swirl plate and a hollow open orifice facing down
    threadHex(k, brass)
    k.lathe(brass, [[0.006, -0.05], [0.009, -0.05], [0.016, -0.02], [0.016, 0.004], [0.012, 0.004], [0.012, -0.02], [0.006, -0.046]], [0, 0, 0], 'y', 32)
    k.disc('pipeBore', 0.0105, [0, -0.012, 0], '-y', 24)
    k.box(brass, [0.022, 0.003, 0.003], [0, -0.0118, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6))
    k.torus(brass, 0.0075, 0.0015, [0, -0.05, 0], 'y', 6, 20)
  } else if (kind === 'sprinkler') {
    // pendent sprinkler: yoke arms, glass bulb on the orifice cap, serrated deflector
    threadHex(k, brass)
    k.cyl(brass, 0.011, 0.008, [0, 0, 0], 'y', 20)
    k.cyl('stainless', 0.006, 0.004, [0, -0.006, 0], 'y', 16)
    const bulb = paint(bulbColour(temperature), { roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, weather: 0 })
    k.sphere(bulb, 0.0045, [0, -0.02, 0], [1, 2.6, 1], 16)
    for (const s of [-1, 1]) {
      k.tube(brass, [[s * 0.011, 0.002, 0], [s * 0.014, -0.02, 0], [s * 0.004, -0.036, 0]], 0.0024, 6, 0.006)
    }
    k.cyl(brass, 0.005, 0.006, [0, -0.036, 0], 'y', 16)
    k.cyl(brass, 0.02, 0.0015, [0, -0.04, 0], 'y', 36)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      k.box('pipeBore', [0.006, 0.0018, 0.0016], [Math.cos(a) * 0.017, -0.04, Math.sin(a) * 0.017], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
    }
  } else {
    // water-mist head: stainless body with nine micro-nozzles, each with a hollow orifice
    k.cyl('stainless', 0.0105, 0.014, [0, 0.023, 0], 'y', 20)
    k.hex('stainless', 0.032, 0.014, [0, 0.009, 0], 'y')
    k.dome('stainless', 0.02, [0, 0.002, 0], '-y', Math.PI / 2, 1, 32)
    const dirs: THREE.Vector3[] = [new THREE.Vector3(0, -1, 0)]
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      dirs.push(new THREE.Vector3(Math.cos(a) * 0.7, -0.71, Math.sin(a) * 0.7).normalize())
    }
    for (const d of dirs) {
      const p0 = d.clone().multiplyScalar(0.018).add(new THREE.Vector3(0, 0.002, 0))
      const p1 = d.clone().multiplyScalar(0.026).add(new THREE.Vector3(0, 0.002, 0))
      k.rod('stainless', p0.toArray() as [number, number, number], p1.toArray() as [number, number, number], 0.0035, 12)
      k.disc('pipeBore', 0.0012, p1.clone().addScaledVector(d, 0.0002).toArray() as [number, number, number], d.toArray() as [number, number, number], 10)
    }
  }
}
