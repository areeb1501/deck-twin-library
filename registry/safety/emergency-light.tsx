// Ex emergency luminaire: linear LED fitting (GRP body, clear diffuser, stainless toggle clips, battery end, status LED, test switch) on a crossbar and arms, or a cast bulkhead with glass and guard; maintained escape-route lighting with 3 h battery. IEC 60079-7, IEC 60598-2-22, EN 1838.
import * as THREE from 'three'
import { Kit, mat4, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { LED_GREEN, canvasMat, cableToDeck, mounted, stopPlug, type Mount } from './_fg'
import { LAMP_OFF, LAMP_WHITE, tagBracket } from './_detectors'

export interface EmergencyLightProps {
  style?: 'linear' | 'bulkhead'
  mount?: Mount
  /** fitting centre above the deck, m */
  height?: number
  /** linear fitting overall length, m */
  length?: number
  lit?: boolean
  tag?: string
}

export const defaults = { style: 'linear' as 'linear' | 'bulkhead', mount: 'wall' as Mount, height: 2.6, length: 0.9, lit: true, tag: 'EL-9301' }

const BODY: MatKey = paint('#4b5157', { metalness: 0.1, roughness: 0.55 })
const SEAL_DARK: MatKey = paint('#202224', { metalness: 0, roughness: 0.9, weather: 0 })
const DIFF: MatKey = paint('#dfe6ea', { metalness: 0, roughness: 0.15, transparent: true, opacity: 0.55, weather: 0 })
const ALU: MatKey = paint('#a9adb0', { metalness: 0.6, roughness: 0.45 })
const ARM = 0.16 // bracket face to fitting axis, m

export function EmergencyLight(props: EmergencyLightProps & GroupProps) {
  const { style, mount, height, length, lit, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(1, height)
  const L = Math.max(0.5, Math.min(1.6, length))
  const data = useKit((k) => build(k, style, mount, h, L, lit, tag), [style, mount, h, L, lit, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default EmergencyLight

function emMat() {
  return canvasMat('el-em', 128, 64, (g) => {
    g.fillStyle = '#237f52'
    g.fillRect(0, 0, 128, 64)
    g.fillStyle = '#ffffff'
    g.font = 'bold 34px Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('EM 3h', 64, 34)
  })
}

/** Linear fitting along X, diffuser facing down, top of the body at y = 0, centred on (0, 0, z). */
function linear(k: Kit, L: number, z: number, lit: boolean) {
  const W = 0.188 // typical linear Ex LED fitting section
  const H = 0.13 // typical
  // GRP body (upper half), diffuser (lower half), end caps
  k.rbox(BODY, [L - 0.04, H * 0.5, W], 0.02, [0, -H * 0.25, z])
  k.rbox(DIFF, [L - 0.05, H * 0.5, W - 0.01], 0.03, [0, -H * 0.72, z])
  k.box(lit ? LAMP_WHITE : LAMP_OFF, [L - 0.12, 0.012, 0.05], [0, -H * 0.55, z])
  for (const s of [-1, 1]) {
    k.rbox(BODY, [0.03, H * 0.98, W + 0.004], 0.012, [s * (L / 2 - 0.015), -H * 0.49, z])
    stopPlug(k, [s * (L / 2 + 0.003), -H * 0.3, z], s > 0 ? 'x' : '-x', 0.024)
  }
  // stainless toggle clips holding the diffuser
  const n = Math.max(2, Math.round(L / 0.25))
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.08 + ((L - 0.16) * i) / (n - 1)
    for (const s of [-1, 1]) {
      k.box('stainless', [0.02, 0.045, 0.006], [x, -H * 0.5, z + s * (W / 2 + 0.003)])
      k.cyl('stainless', 0.004, 0.024, [x, -H * 0.36, z + s * (W / 2 + 0.006)], 'x', 8)
    }
  }
  // status LED, test switch and EM label on the front face
  const zf = z + W / 2 + 0.0005
  k.add(emMat(), new THREE.PlaneGeometry(0.06, 0.03), mat4([-L / 2 + 0.1, -H * 0.25, zf]))
  k.sphere(LED_GREEN, 0.004, [-L / 2 + 0.16, -H * 0.25, zf], undefined, 8)
  k.cyl('rubberBlack', 0.007, 0.006, [-L / 2 + 0.19, -H * 0.25, zf], 'z', 12)
}

function bulkhead(k: Kit, lit: boolean) {
  // cast body with fixing lugs, gasketed glass, guard bars; front faces +Z, back on z = 0
  const s = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1.35, 1, 1))
  k.with(s, () => {
    k.cyl(ALU, 0.11, 0.06, [0, 0, 0.03], 'z', 40)
    k.cyl(ALU, 0.116, 0.012, [0, 0, 0.066], 'z', 40)
    k.cyl(SEAL_DARK, 0.1, 0.006, [0, 0, 0.074], 'z', 40)
    k.dome(lit ? LAMP_WHITE : LAMP_OFF, 0.09, [0, 0, 0.074], 'z', Math.PI / 2, 0.38, 32)
    k.dome('glass', 0.096, [0, 0, 0.074], 'z', Math.PI / 2, 0.42, 32)
    for (const a of [0, Math.PI / 2]) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a)
      k.with(new THREE.Matrix4().makeRotationFromQuaternion(q), () => k.torus(ALU, 0.098, 0.006, [0, 0, 0.074], '-y', 6, 32, Math.PI))
    }
  })
  for (const sx of [-1, 1]) {
    k.box(ALU, [0.03, 0.04, 0.012], [sx * 0.16, 0, 0.006])
    k.hex('nut', 0.014, 0.007, [sx * 0.16, 0, 0.016], 'z')
  }
  // battery / control gear box under the body with EM label, status LED and test switch
  k.rbox(ALU, [0.14, 0.055, 0.05], 0.008, [0, -0.135, 0.025])
  k.add(emMat(), new THREE.PlaneGeometry(0.05, 0.025), mat4([-0.025, -0.135, 0.0505]))
  k.sphere(LED_GREEN, 0.004, [0.025, -0.135, 0.0505], undefined, 8)
  k.cyl('rubberBlack', 0.006, 0.006, [0.047, -0.135, 0.051], 'z', 12)
}

function build(k: Kit, style: 'linear' | 'bulkhead', mount: Mount, h: number, L: number, lit: boolean, tag: string) {
  let gland: V3 = [0, 0, 0]
  const zf = mounted(k, mount, h, style === 'linear' ? [0.16, 0.2] : [0.2, 0.2], () => {
    if (style === 'bulkhead') {
      bulkhead(k, lit)
      k.hex('brass', 0.026, 0.014, [-0.045, -0.169, 0.025], 'y')
      gland = [-0.045, -0.18, 0.025]
      return
    }
    // crossbar on the bracket, two arms out to clamp brackets over the fitting
    const xa = Math.min(0.2, L / 2 - 0.1)
    k.box('stainless', [2 * xa + 0.06, 0.05, 0.008], [0, 0.03, 0.004])
    for (const s of [-1, 1]) k.hex('nut', 0.014, 0.007, [s * (xa + 0.015), 0.03, 0.011], 'z')
    for (const s of [-1, 1]) {
      k.box('stainless', [0.04, 0.008, ARM + 0.08], [s * xa, 0.05, (ARM + 0.08) / 2])
      k.box('stainless', [0.04, 0.05, 0.008], [s * xa, 0.03, 0.012])
      k.box('stainless', [0.05, 0.04, 0.006], [s * xa, 0.026, ARM])
      k.hex('nut', 0.016, 0.008, [s * xa, 0.05, ARM], 'y')
    }
    k.at([0, 0.006, 0], undefined, () => linear(k, L, ARM, lit))
    k.hex('brass', 0.026, 0.014, [-L / 2 - 0.01, -0.02, ARM], 'x')
    gland = [-L / 2 - 0.02, -0.02, ARM]
  })
  cableToDeck(k, mount, [gland[0], gland[1] + h, gland[2] + zf])
  tagBracket(k, mount, Math.max(0.3, h - 0.45), tag, 0.12)
}
