// PA/GA horn loudspeaker: Ex d compression driver with a hollow re-entrant round horn (central phase reflector) or a rectangular flare horn, in a U-bracket with tilt knobs on a pan base; stanchion or wall. IEC 60079-1, IEC 60079-7, EN 54-24, ISO 7240-24.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { cableToDeck, deg, mounted, stopPlug, type Mount } from './_fg'
import { horn, tagBracket } from './_detectors'

export interface PaLoudspeakerProps {
  /** re-entrant: round horn with central reflector; flare: rectangular exponential flare */
  style?: 're-entrant' | 'flare'
  mount?: Mount
  /** pivot above the deck, m */
  height?: number
  /** horn aimed down, ° */
  tilt?: number
  /** horn turned about the vertical, ° */
  pan?: number
  /** transformer tap shown on the rating plate, W */
  power?: number
  tag?: string
}

export const defaults = { style: 're-entrant' as 're-entrant' | 'flare', mount: 'pole' as Mount, height: 3, tilt: 15, pan: 0, power: 25, tag: 'PA-3101' }

const GREY: MatKey = paint('#c9ccc6', { metalness: 0.2, roughness: 0.45, clearcoat: 0.35 })
const DARK: MatKey = paint('#3c4146', { metalness: 0.3, roughness: 0.6 })
const ZP = 0.21 // bracket face to pivot, m
const YB = -0.06 // pan base below the bracket centre, m

export function PaLoudspeaker(props: PaLoudspeakerProps & GroupProps) {
  const { style, mount, height, tilt, pan, power, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(1, height)
  const data = useKit((k) => build(k, style, mount, h, tilt, pan, power, tag), [style, mount, h, tilt, pan, power, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PaLoudspeaker

/** Driver and horn along +Z from the pivot at the origin. Returns the rear gland point. */
function speaker(k: Kit, style: 're-entrant' | 'flare', power: number): V3 {
  // Ex d driver housing: back cap, flamepath flange with bolts, body, gland in the back
  const zb = -0.11
  k.cyl(GREY, 0.072, 0.14, [0, 0, zb + 0.07], 'z', 36)
  k.cyl(GREY, 0.08, 0.014, [0, 0, zb + 0.1], 'z', 36)
  k.around(8, 0.075, [0, 0, zb + 0.108], 'z', (p) => k.hex('nut', 0.011, 0.006, p, 'z'), Math.PI / 8)
  k.dome(GREY, 0.072, [0, 0, zb], '-z', Math.PI / 2, 0.35, 32)
  k.hex('brass', 0.03, 0.016, [0, -0.03, zb - 0.02], '-z')
  k.cyl('brass', 0.012, 0.018, [0, -0.03, zb - 0.036], 'z', 12)
  stopPlug(k, [0.035, 0.02, zb - 0.018], '-z', 0.022)
  k.box('nameplate', [0.06, 0.03, 0.002], [0, 0.073, zb + 0.05], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))
  k.box(DARK, [0.03, 0.006, 0.002], [0, 0.0735, zb + 0.065], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))
  // tap selector boss for the rating
  k.cyl(GREY, 0.012, 0.012, [0.07, 0.02, zb + 0.06], 'x', 12)
  k.cyl(DARK, 0.006, 0.006, [0.078, 0.02, zb + 0.06], 'x', 10)
  if (power > 15) k.cyl(DARK, 0.004, 0.004, [0.072, 0.034, zb + 0.06], 'x', 8)
  const z0 = zb + 0.107
  if (style === 're-entrant') {
    // outer bell (hollow), throat collar, central phase reflector on three vanes
    k.cyl(GREY, 0.064, 0.03, [0, 0, z0 + 0.015], 'z', 36)
    horn(k, GREY, [0, 0, z0 + 0.03], 'z', 0.06, 0.108, 0.17, 0.003, 48) // ≈ 220 mm bell, typical
    const zr = z0 + 0.12
    k.lathe(DARK, [[0.001, -0.07], [0.022, -0.06], [0.04, -0.02], [0.05, 0.03], [0.05, 0.05], [0.001, 0.05]], [0, 0, zr], 'z', 36)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a)
      k.box(GREY, [0.055, 0.003, 0.04], new THREE.Vector3(0.078, 0, 0).applyQuaternion(q).add(new THREE.Vector3(0, 0, zr + 0.03)).toArray() as V3, q)
    }
    k.disc('rubberBlack', 0.058, [0, 0, z0 + 0.031], 'z', 32)
  } else {
    // compression driver throat, rectangular exponential flare (lathe on 4 segments scaled to 275 × 200 mouth)
    k.cyl(GREY, 0.04, 0.04, [0, 0, z0 + 0.02], 'z', 24)
    k.cyl(GREY, 0.05, 0.01, [0, 0, z0 + 0.04], 'z', 24)
    const L = 0.26 // 275 × 200 mm mouth, typical
    const s = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, z0 + 0.045), new THREE.Quaternion(), new THREE.Vector3(1, 0.2 / 0.275, 1))
    k.with(s, () => {
      k.with(new THREE.Matrix4().makeRotationZ(Math.PI / 4), () => horn(k, GREY, [0, 0, 0], 'z', 0.035 * Math.SQRT2, 0.1375 * Math.SQRT2, L, 0.004, 4))
    })
    k.disc('rubberBlack', 0.03, [0, 0, z0 + 0.046], 'z', 20)
  }
  return [0, -0.03, zb - 0.045]
}

function build(k: Kit, style: 're-entrant' | 'flare', mount: Mount, h: number, tilt: number, pan: number, power: number, tag: string) {
  let gland = new THREE.Vector3()
  const zf = mounted(k, mount, h, [0.14, 0.2], () => {
    // pan base: plate, turntable with clamp bolt, arm out to the U-yoke
    k.box(GREY, [0.1, 0.1, 0.012], [0, YB, 0.006])
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.hex('nut', 0.014, 0.007, [sx * 0.036, YB + sy * 0.036, 0.0155], 'z')
    k.cyl(GREY, 0.03, 0.04, [0, YB, 0.032], 'z', 20)
    const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg(pan))
    k.with(new THREE.Matrix4().compose(new THREE.Vector3(0, YB, ZP), qp, new THREE.Vector3(1, 1, 1)), () => {
      k.box(GREY, [0.04, 0.012, ZP - 0.03], [0, 0, -(ZP - 0.03) / 2])
      k.cyl(GREY, 0.022, 0.016, [0, 0, 0], 'y', 16)
      // U-yoke round the driver, tilt knobs on the pivots
      const yw = style === 'flare' ? 0.105 : 0.098
      k.box(GREY, [2 * yw + 0.012, 0.01, 0.05], [0, 0.005, 0])
      for (const s of [-1, 1]) {
        k.box(GREY, [0.008, 0.095, 0.05], [s * yw, 0.0475, 0])
        k.cyl(DARK, 0.016, 0.02, [s * (yw + 0.014), 0.095, 0], 'x', 16)
        k.cyl(GREY, 0.006, 0.02, [s * (yw - 0.012), 0.095, 0], 'x', 10)
      }
      const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deg(tilt))
      const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.095, 0), qt, new THREE.Vector3(1, 1, 1))
      k.with(m, () => {
        // trunnion bosses on the driver
        for (const s of [-1, 1]) k.cyl(GREY, 0.014, yw - 0.072, [s * (0.072 + (yw - 0.072) / 2), 0, 0], 'x', 14)
        const g = speaker(k, style, power)
        gland = new THREE.Vector3(...g).applyMatrix4(m).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, YB, ZP), qp, new THREE.Vector3(1, 1, 1)))
      })
    })
  })
  cableToDeck(k, mount, [gland.x, gland.y + h, gland.z + zf])
  tagBracket(k, mount, Math.max(0.3, h - 0.42), tag, -0.12)
}
