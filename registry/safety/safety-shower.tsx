// Combination emergency shower and eyewash: green column on a floor flange, stay-open shower valve with pull rod, eyewash bowl with push flag, foot treadle, flow switch, alarm lamp and ISO 7010 sign. ANSI Z358.1, EN 15154.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, junctionBox, pipeRun, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { elbow90, pipeOD, type Rating } from '../lib/standards'
import { ICON, cable, signMat } from './_fg'
import { portBore } from './_valves'

export interface SafetyShowerProps {
  /** supply size, inches */
  nps?: number
  rating?: Rating
  /** shower head (spray) height above the deck, m; ANSI Z358.1 82–96 in */
  headHeight?: number
  foot?: boolean
  alarm?: boolean
  sign?: boolean
  tag?: string
}

export const defaults = { nps: 1.25, rating: 150 as Rating, headHeight: 2.2, foot: true, alarm: true, sign: true, tag: 'SS-9001' }

const GREEN = 'safetyGreen'
const LAMP = paint('#3cff7a', { emissive: '#22ff66', emissiveIntensity: 0.7, roughness: 0.2, transparent: true, opacity: 0.9 })
const YI = 0.35 // supply branch height, m
const XI = -0.3 // inlet flange face, m

export function ports(props: SafetyShowerProps = {}): Port[] {
  const p = { ...defaults, ...props }
  return [port('inlet', 'Potable water inlet', [XI, YI, 0], [-1, 0, 0], p.nps, p.rating, 'utility')]
}

export function SafetyShower(props: SafetyShowerProps & GroupProps) {
  const { nps, rating, headHeight, foot, alarm, sign, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(2.08, Math.min(2.44, headHeight))
  const data = useKit((k) => build(k, nps, rating, h, foot, alarm, sign, tag), [nps, rating, h, foot, alarm, sign, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SafetyShower

function ballValve(k: Kit, p: V3, d: number, along: 'x' | 'z') {
  k.cyl('stainless', d * 0.75, d * 2.2, p, along, 16)
  k.sphere('stainless', d * 0.95, p, undefined, 16)
}

function build(k: Kit, nps: number, rating: Rating, h: number, foot: boolean, alarm: boolean, sign: boolean, tag: string) {
  const d = pipeOD(nps)
  const R = elbow90(nps)
  const top = h + 0.14 // column top, arm level
  const zh = 0.6 // shower head out from the column
  // floor flange and column
  k.cyl(GREEN, 0.13, 0.014, [0, 0.007, 0], 'y', 32)
  k.cyl(GREEN, d / 2 + 0.02, 0.06, [0, 0.044, 0], 'y', 20)
  k.around(4, 0.1, [0, 0.014, 0], 'y', (q) => k.hex('nut', 0.026, 0.012, [q[0], 0.02, q[2]], 'y'), Math.PI / 4)
  k.pipe(GREEN, [0, 0.014, 0], [0, top - R, 0], d)
  // supply branch: tee on the column, flanged inlet
  k.cyl(GREEN, d / 2 + 0.006, d * 1.6, [0, YI, 0], 'y', 16)
  const L = flange(k, nps, rating, [XI, YI, 0], '-x', true)
  portBore(k, nps, rating, [XI, YI, 0], '-x')
  k.pipe(GREEN, [XI + L, YI, 0], [-d / 2, YI, 0], d)
  // top arm to the shower head with stay-open valve and pull rod
  pipeRun(k, [[0, top - R - 0.001, 0], [0, top, 0], [0, top, zh], [0, top - 0.1, zh]], nps, { mat: GREEN })
  ballValve(k, [0, top, 0.2], d, 'z')
  k.box('stainless', [0.012, 0.012, 0.16], [0, top + d, 0.27])
  const rodX = 0
  k.rod('stainless', [rodX, top + d, 0.35], [rodX, 1.75, 0.35], 0.004, 6)
  // triangular pull handle
  k.tube('stainless', [[rodX, 1.75, 0.35], [rodX - 0.08, 1.62, 0.35], [rodX + 0.08, 1.62, 0.35], [rodX, 1.75, 0.35]], 0.007, 6, 0.01)
  // shower head: bowl facing down with a perforated rose
  const yH = top - 0.1
  k.cyl(GREEN, d / 2 + 0.008, 0.03, [0, yH - 0.015, zh], 'y', 16)
  k.lathe(GREEN, [[0.02, 0], [0.05, -0.01], [0.12, -0.06], [0.135, -0.08], [0.13, -0.085]], [0, yH - 0.02, zh], 'y', 36)
  k.disc('stainless', 0.128, [0, yH - 0.104, zh], '-y', 36)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    for (const r of [0.04, 0.085]) k.disc('pipeBore', 0.005, [Math.cos(a) * r, yH - 0.1045, zh + Math.sin(a) * r], '-y', 6)
  }

  // eyewash: arm with push-flag valve, bowl, twin heads with dust caps, drain
  const ye = 0.95
  const ze = 0.36
  pipeRun(k, [[0, ye - 0.15, 0], [0, ye - 0.15, ze], [0, ye - 0.02, ze]], 1, { mat: GREEN })
  k.cyl(GREEN, d / 2 + 0.006, d * 1.6, [0, ye - 0.15, 0], 'y', 16)
  ballValve(k, [0, ye - 0.15, 0.14], pipeOD(1), 'z')
  // push flag on the valve stem
  k.rod('stainless', [0, ye - 0.15, 0.14], [0.12, ye - 0.15, 0.14], 0.005, 6)
  k.box(GREEN, [0.12, 0.09, 0.006], [0.18, ye - 0.12, 0.14])
  k.plane(signMat(['PUSH'], '#237f52'), 0.11, 0.055, [0.18, ye - 0.12, 0.1435])
  k.lathe('stainless', [[0.03, 0], [0.06, 0.005], [0.15, 0.06], [0.16, 0.08], [0.155, 0.082], [0.145, 0.062], [0.05, 0.012], [0.02, 0.01]], [0, ye - 0.08, ze], 'y', 40)
  for (const s of [-1, 1]) {
    k.rod('stainless', [0, ye - 0.02, ze], [s * 0.055, ye + 0.02, ze], 0.008, 8)
    k.cyl(GREEN, 0.022, 0.03, [s * 0.055, ye + 0.035, ze], 'y', 16)
    k.dome('safetyYellow', 0.024, [s * 0.055, ye + 0.05, ze], 'y', Math.PI / 2, 0.45, 16)
  }
  k.pipe(GREEN, [0, ye - 0.08, ze], [0, 0.0, ze], pipeOD(1.25))
  k.cyl('castIron', 0.06, 0.01, [0, 0.005, ze], 'y', 20)

  if (foot) {
    // foot treadle on a pivot frame, linkage rod to the eyewash valve
    k.box('galvanised', [0.08, 0.06, 0.04], [0.15, 0.03, 0.22])
    k.rod('galvanised', [0.15, 0.05, 0.22], [0.15, 0.05, 0.42], 0.006, 8)
    k.box(GREEN, [0.18, 0.012, 0.22], [0.15, 0.07, 0.42], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12))
    k.box('safetyYellow', [0.16, 0.002, 0.04], [0.15, 0.085, 0.5])
    k.rod('stainless', [0.15, 0.08, 0.32], [0.15, ye - 0.15, 0.2], 0.005, 6)
    k.rod('stainless', [0.15, ye - 0.15, 0.2], [0.12, ye - 0.15, 0.14], 0.005, 6)
  }

  // flow switch on the column, cable down; alarm lamp on the column cap
  const fy = top - R - 0.25
  junctionBox(k, [0, fy, d / 2], 'z', [0.12, 0.12, 0.08], 'stainless')
  cable(k, [[0.034, fy - 0.08, d / 2 + 0.04], [0.04, fy - 0.2, d / 2 + 0.02], [d / 2 + 0.008, fy - 0.4, 0], [d / 2 + 0.008, 0.2, 0], [d / 2 + 0.2, 0.02, 0]])
  k.cyl(GREEN, d / 2, 0.36, [0, top + 0.18, 0], 'y', 16)
  k.cyl(GREEN, d / 2 + 0.006, 0.01, [0, top + 0.365, 0], 'y', 16)
  if (alarm) {
    k.cyl('castIron', 0.05, 0.05, [0, top + 0.395, 0], 'y', 20)
    k.cyl(LAMP, 0.04, 0.08, [0, top + 0.46, 0], 'y', 20)
    k.dome(LAMP, 0.04, [0, top + 0.5, 0], 'y', Math.PI / 2, 0.5, 20)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      k.rod('stainless', [Math.cos(a) * 0.046, top + 0.42, Math.sin(a) * 0.046], [Math.cos(a) * 0.046, top + 0.52, Math.sin(a) * 0.046], 0.003, 6)
    }
  }
  if (sign) {
    const ys = top + 0.22
    k.box('stainless', [0.5, 0.25, 0.004], [0, ys, d / 2 + 0.012])
    for (const s of [-1, 1]) k.box('stainless', [0.03, 0.02, 0.012], [s * 0.025, ys + s * 0.08, d / 2 + 0.004])
    k.plane(signMat(['EMERGENCY', 'SHOWER &', 'EYEWASH'], '#237f52', '#ffffff', ICON.shower), 0.49, 0.245, [0, ys, d / 2 + 0.0155])
  }
  tagPlate(k, tag, [0, 0.6, d / 2 + 0.002], 'z', 0.08)
}
