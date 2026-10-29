// Shared control-room furniture parts: monitors, keyboards, phones, radios, task lights and the 24/7 operator chair.
import * as THREE from 'three'
import { Kit, eul, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import type { ScreenKind, ScreenPlacement } from './_screens'
import { keyboardMaterial } from './_textures'

export const INCH = 0.0254

/** Active area of a 16:9 display of diagonal `d` inches, metres. */
export function panelSize(d: number): [number, number] {
  const k = (d * INCH) / Math.hypot(16, 9)
  return [16 * k, 9 * k]
}

/** Matrix for a position plus an XYZ Euler rotation (radians). */
export const frame = (pos: V3, rot: V3 = [0, 0, 0]) => new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1))

/** Screen placement for a face at `local` inside frame `m`. */
export function placeScreen(m: THREE.Matrix4, local: V3, w: number, h: number, kind: ScreenKind): ScreenPlacement {
  const mm = m.clone().multiply(new THREE.Matrix4().makeTranslation(...local))
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  mm.decompose(p, q, new THREE.Vector3())
  const e = new THREE.Euler().setFromQuaternion(q)
  return { pos: p.toArray() as V3, rot: [e.x, e.y, e.z], w, h, kind }
}

export const furnitureMats = () => ({
  housing: paint('#1d1f22', { metalness: 0.2, roughness: 0.55, clearcoat: 0, weather: 0 }),
  bezel: paint('#101113', { metalness: 0.1, roughness: 0.4, clearcoat: 0.2, weather: 0 }),
  alu: paint('#c4c8cb', { metalness: 0.75, roughness: 0.32, clearcoat: 0, weather: 0 }),
  fabric: paint('#2b2f35', { metalness: 0, roughness: 0.95, clearcoat: 0, weather: 0 }),
  mesh: paint('#1e2124', { metalness: 0, roughness: 0.9, clearcoat: 0, weather: 0 }),
  led: paint('#ffffff', { emissive: '#f4fbff', emissiveIntensity: 2.2, roughness: 0.3, metalness: 0, clearcoat: 0, weather: 0 }),
  ledGreen: paint('#3bd16f', { emissive: '#36e070', emissiveIntensity: 1.6, roughness: 0.3, metalness: 0, clearcoat: 0, weather: 0 }),
  ledAmber: paint('#ffb020', { emissive: '#ffa500', emissiveIntensity: 1.6, roughness: 0.3, metalness: 0, clearcoat: 0, weather: 0 }),
  ledRed: paint('#ff3020', { emissive: '#ff2a10', emissiveIntensity: 1.6, roughness: 0.3, metalness: 0, clearcoat: 0, weather: 0 }),
})

/**
 * Narrow-bezel desktop monitor in frame `m`: screen face centred on the origin facing +Z, housing behind, VESA 100 plate.
 * Returns the screen placement. `arm` adds a short arm stub back to z = -armLen.
 */
export function monitor(k: Kit, m: THREE.Matrix4, diag: number, kind: ScreenKind, o: { arm?: number; stand?: boolean } = {}): ScreenPlacement {
  const M = furnitureMats()
  const [w, h] = panelSize(diag)
  const b = 0.007 // bezel
  const t = 0.018 + diag * 0.0006
  k.with(m, () => {
    k.rbox(M.bezel, [w + 2 * b, h + 2 * b + 0.004, 0.012], 0.004, [0, -0.002, -0.006])
    k.rbox(M.housing, [w * 0.92, h * 0.86, t], 0.012, [0, -0.004, -0.012 - t / 2])
    k.box(M.housing, [w * 0.6, h * 0.5, 0.02], [0, 0, -0.012 - t - 0.008])
    k.box('aluminium', [0.11, 0.11, 0.006], [0, 0, -0.012 - t - 0.021])
    k.box(M.ledGreen, [0.004, 0.003, 0.002], [w / 2 - 0.02, -h / 2 - b + 0.001, 0.001])
    const back = -0.012 - t - 0.024
    if (o.arm) {
      k.rod(M.alu, [0, 0, back], [0, 0, back - o.arm], 0.014, 12)
      k.cyl(M.alu, 0.022, 0.05, [0, 0, back - 0.01], 'z', 14)
    }
    if (o.stand) {
      const y0 = -h / 2 - b - 0.12
      k.rbox(M.housing, [0.06, h * 0.75, 0.025], 0.008, [0, y0 + (h * 0.75) / 2 + 0.01, back - 0.02])
      k.rbox(M.housing, [0.26, 0.012, 0.2], 0.005, [0, y0 + 0.006, back - 0.02])
    }
  })
  return placeScreen(m, [0, 0, 0.0008], w, h, kind)
}

/** Full-size keyboard (front edge towards +Z) and mouse, standing on y = 0 of frame m. */
export function keyboardAndMouse(k: Kit, m: THREE.Matrix4, mouseX = 0.3) {
  const M = furnitureMats()
  k.with(m, () => {
    k.rbox(M.housing, [0.44, 0.022, 0.135], 0.006, [0, 0.011, 0], eul(0.06, 0, 0))
    k.plane(keyboardMaterial(), 0.42, 0.115, [0, 0.0235, -0.002], eul(-Math.PI / 2 + 0.06, 0, 0))
    k.sphere(M.housing, 0.032, [mouseX, 0.014, 0.01], [0.95, 0.42, 1.7], 14)
    k.box('rubberBlack', [0.22, 0.003, 0.19], [mouseX, 0.0015, 0.0])
  })
}

/** Desk phone with handset, on y = 0 of frame m, facing +Z. */
export function deskPhone(k: Kit, m: THREE.Matrix4) {
  const M = furnitureMats()
  k.with(m, () => {
    k.rbox(M.housing, [0.2, 0.05, 0.19], 0.012, [0, 0.03, 0], eul(-0.25, 0, 0))
    k.rbox(M.housing, [0.05, 0.035, 0.21], 0.015, [-0.065, 0.075, -0.005], eul(-0.25, 0, 0))
    k.box('glass', [0.09, 0.04, 0.002], [0.035, 0.07, -0.02], eul(-0.25 - Math.PI / 2 + 1.3, 0, 0))
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) k.box('plasticGrey', [0.018, 0.006, 0.012], [0.01 + c * 0.024, 0.052 + r * -0.008 + 0.012, 0.03 + r * 0.02])
  })
}

/** UHF desk radio base station with fist microphone, on y = 0 of frame m. */
export function deskRadio(k: Kit, m: THREE.Matrix4) {
  const M = furnitureMats()
  k.with(m, () => {
    k.rbox(M.housing, [0.24, 0.07, 0.2], 0.01, [0, 0.035, 0])
    k.box(M.bezel, [0.1, 0.035, 0.002], [-0.04, 0.04, 0.1])
    k.box(M.ledAmber, [0.08, 0.02, 0.001], [-0.04, 0.043, 0.1015])
    k.cyl('plasticGrey', 0.018, 0.02, [0.07, 0.04, 0.105], 'z', 16)
    k.rbox(M.housing, [0.055, 0.08, 0.03], 0.012, [0.16, 0.05, 0.03], eul(0, 0, 0.2))
    k.spline('cable', [[0.15, 0.015, 0.03], [0.13, 0.02, 0.09], [0.1, 0.03, 0.1]], 0.003, 5, 12)
    k.rod('rubberBlack', [0.09, 0.07, -0.08], [0.09, 0.2, -0.08], 0.005, 6)
  })
}

/** Clamp-on LED task light on an articulated arm, base at the origin of m, head reaching +Z. */
export function taskLight(k: Kit, m: THREE.Matrix4) {
  const M = furnitureMats()
  k.with(m, () => {
    k.cyl(M.housing, 0.035, 0.03, [0, 0.015, 0], 'y', 16)
    const a: V3 = [0, 0.03, 0]
    const b: V3 = [0, 0.38, -0.04]
    const c: V3 = [0, 0.46, 0.3]
    k.rod(M.alu, a, b, 0.008, 8)
    k.sphere(M.housing, 0.014, b, undefined, 10)
    k.rod(M.alu, b, c, 0.007, 8)
    k.rbox(M.housing, [0.26, 0.016, 0.05], 0.006, [0, c[1] - 0.006, c[2] + 0.02])
    k.box(M.led, [0.23, 0.002, 0.03], [0, c[1] - 0.015, c[2] + 0.02])
  })
}

export interface ChairOpts {
  /** seat top height, m */
  seat?: number
  headrest?: boolean
  arms?: boolean
  upholstery?: MatKey | THREE.Material
  /** draw only the static base or only the swivelling part */
  part?: 'all' | 'base' | 'top'
}

/**
 * 24/7 intensive-use control-room chair facing +Z: five-star base with twin-wheel castors, gas lift,
 * synchro mechanism, upholstered seat, tall back with lumbar shaping, headrest and height-adjustable arms.
 */
export function chair(k: Kit, m: THREE.Matrix4, o: ChairOpts = {}) {
  const M = furnitureMats()
  const seatY = o.seat ?? 0.5
  const up = o.upholstery ?? M.fabric
  const part = o.part ?? 'all'
  const hubY = 0.1
  const top = seatY - 0.11
  k.with(m, () => {
    if (part === 'top') return
    // base: 5 polished aluminium legs (700 mm span), castors
    k.cyl(M.alu, 0.045, 0.06, [0, hubY, 0], 'y', 20)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      const R = 0.33
      k.add(M.alu, legGeo(R), new THREE.Matrix4().makeRotationY(-a).setPosition(0, hubY, 0))
      const cx = c * R
      const cz = s * R
      k.cyl(M.housing, 0.012, 0.035, [cx, 0.075, cz], 'y', 10)
      k.rbox(M.housing, [0.055, 0.03, 0.03], 0.008, [cx, 0.06, cz])
      for (const sd of [-1, 1]) k.cyl('rubberBlack', 0.03, 0.014, [cx + -s * sd * 0.016, 0.03, cz + c * sd * 0.016], [-s, 0, c] as V3, 14)
    }
    // gas lift: column, telescoping shroud
    k.cyl(M.housing, 0.028, Math.max(0.05, top - 0.25), [0, 0.13 + Math.max(0.05, top - 0.25) / 2, 0], 'y', 16)
    k.cyl('stainless', 0.014, top - hubY, [0, (top + hubY) / 2, 0], 'y', 12)
  })
  if (part === 'base') return
  k.with(m, () => {
    // mechanism and seat pan
    k.rbox(M.housing, [0.26, 0.06, 0.3], 0.015, [0, top + 0.02, -0.01])
    k.rod(M.housing, [0.12, top + 0.03, 0.08], [0.2, top + 0.0, 0.12], 0.008, 6)
    k.rbox(M.housing, [0.5, 0.025, 0.47], 0.01, [0, seatY - 0.075, 0.02])
    k.rbox(up, [0.52, 0.075, 0.5], 0.035, [0, seatY - 0.035, 0.02], undefined, 4)
    k.cyl(up, 0.035, 0.5, [0, seatY - 0.04, 0.26], 'x', 14) // waterfall front edge
    // back: shell with lumbar, upholstered front
    const by = seatY + 0.05
    const bh = 0.62
    k.box(M.housing, [0.08, 0.3, 0.03], [0, seatY - 0.08 + 0.12, -0.28], eul(-0.35, 0, 0))
    k.with(new THREE.Matrix4().compose(new THREE.Vector3(0, by, -0.26), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, 0, 0)), new THREE.Vector3(1, 1, 1)), () => {
      k.rbox(M.housing, [0.47, bh, 0.04], 0.03, [0, bh / 2, -0.04], undefined, 4)
      k.rbox(up, [0.49, bh * 0.55, 0.08], 0.035, [0, bh * 0.68, 0.0], undefined, 4)
      k.rbox(up, [0.48, bh * 0.42, 0.1], 0.04, [0, bh * 0.22, 0.012], undefined, 4) // lumbar
      if (o.headrest !== false) {
        k.box(M.alu, [0.03, 0.14, 0.02], [0, bh + 0.05, -0.05])
        k.rbox(up, [0.3, 0.16, 0.08], 0.035, [0, bh + 0.15, -0.01], eul(0.15, 0, 0), 4)
      }
    })
    // arms: posts from under the seat, height-adjustable, soft pads
    if (o.arms !== false)
      for (const s of [-1, 1]) {
        k.box(M.housing, [0.04, 0.02, 0.18], [s * 0.2, seatY - 0.1, -0.02])
        k.box(M.housing, [0.2, 0.02, 0.04], [s * 0.15, seatY - 0.1, -0.02])
        k.rbox(M.housing, [0.035, 0.24, 0.06], 0.01, [s * 0.285, seatY + 0.03, -0.02])
        k.rbox('rubberBlack', [0.08, 0.035, 0.26], 0.015, [s * 0.285, seatY + 0.165, 0.0])
      }
  })
}

/** Tapered chair leg from the hub out along +X to radius R, curving down at the tip. */
function legGeo(R: number) {
  const s = new THREE.Shape()
  s.moveTo(0.03, 0.02)
  s.lineTo(R, -0.005)
  s.lineTo(R + 0.02, -0.02)
  s.lineTo(R, -0.03)
  s.lineTo(0.03, -0.025)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 })
  g.translate(0, 0, -0.0225)
  return g
}
