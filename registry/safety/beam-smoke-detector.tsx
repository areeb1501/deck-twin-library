// Reflective optical beam smoke detector: transceiver head with lens, alignment LEDs and pan/tilt bracket, low-level controller, and a cube-corner prism reflector across the protected space; walls or stanchions facing along X. EN 54-12, UL 268.
import * as THREE from 'three'
import { Kit, mat4, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { LED_GREEN, LENS, cable, canvasMat, faceZ, mounted, polePlate, wallPlate, type Mount } from './_fg'
import { LED_AMBER } from './_detectors'

export interface BeamSmokeDetectorProps {
  mount?: Mount
  /** head to reflector, m (one prism to 50 m, four beyond) */
  separation?: number
  /** beam height above the floor, m */
  height?: number
  /** draw the IR beam for coverage studies */
  beam?: boolean
  tag?: string
}

export const defaults = { mount: 'wall' as Mount, separation: 30, height: 4, beam: false, tag: 'SDB-9201' }

const CASE = paint('#ecebe6', { metalness: 0.05, roughness: 0.45 })
const BEAM = paint('#ff4a6a', { emissive: '#ff2a4a', emissiveIntensity: 0.8, transparent: true, opacity: 0.3, roughness: 0.5, weather: 0 })
const ZH = 0.11 // bracket face to head centre, m
const HB = 0.134 // head body cube, m (typical)
const CY = 1.5 // controller height, m

export function BeamSmokeDetector(props: BeamSmokeDetectorProps & GroupProps) {
  const { mount, separation, height, beam, tag, ...group } = { ...defaults, ...props }
  const sep = Math.max(5, Math.min(100, separation))
  const h = Math.max(2.2, height)
  const data = useKit((k) => build(k, mount, sep, h, tag), [mount, sep, h, tag])
  const ray = useKit((k) => {
    const L = sep - 2 * faceZ(mount) - ZH - HB / 2 - 0.03
    if (beam) k.cyl(BEAM, 0.01, L, [-sep / 2 + faceZ(mount) + ZH + HB / 2 + L / 2, h, 0], 'x', 10)
  }, [mount, sep, h, beam])
  return (
    <group {...group}>
      <KitMesh data={data} />
      <KitMesh data={ray} shadows={false} />
    </group>
  )
}

export default BeamSmokeDetector

function prismMat() {
  return canvasMat('beam-prism', 256, 256, (g) => {
    g.fillStyle = '#c9ced3'
    g.fillRect(0, 0, 256, 256)
    // cube-corner facets
    const r = 16
    for (let row = 0; row < 10; row++)
      for (let col = 0; col < 10; col++) {
        const cx = col * r * 1.732 + (row % 2) * r * 0.866
        const cy = row * r * 1.5
        for (let i = 0; i < 3; i++) {
          g.fillStyle = ['#f2f4f6', '#a7aeb5', '#cfd4d9'][i]
          g.beginPath()
          g.moveTo(cx, cy)
          for (let j = 0; j < 3; j++) {
            const a = ((i * 2 + j) * Math.PI) / 3 - Math.PI / 2
            g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
          }
          g.closePath()
          g.fill()
        }
      }
  }, { roughness: 0.15 })
}

function controllerMat() {
  return canvasMat('beam-ctrl', 256, 256, (g) => {
    g.fillStyle = '#ecebe6'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#2b2f33'
    g.fillRect(28, 28, 200, 80)
    g.fillStyle = '#7dff9a'
    g.font = 'bold 30px "Courier New", monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('SIG 100%', 128, 68)
    g.fillStyle = '#2b2f33'
    g.font = 'bold 22px Arial, sans-serif'
    g.fillText('BEAM DETECTOR', 128, 140)
    for (const [i, c] of ['#ff3b30', '#ffae1a', '#2bff6e'].entries()) {
      g.fillStyle = c
      g.beginPath()
      g.arc(70 + i * 58, 190, 12, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#2b2f33'
    g.font = '16px Arial, sans-serif'
    ;['FIRE', 'FAULT', 'OK'].forEach((t, i) => g.fillText(t, 70 + i * 58, 222))
  }, { emissive: 0.15 })
}

/** Transceiver head on a pan/tilt bracket, +Z towards the reflector, axis at y = 0; origin on the bracket face. */
function head(k: Kit) {
  k.box('stainless', [0.07, 0.1, 0.006], [0, -0.01, 0.003])
  for (const sy of [-1, 1]) k.hex('nut', 0.014, 0.006, [0, -0.01 + sy * 0.038, 0.009], 'z')
  k.box('stainless', [0.04, 0.012, ZH - HB / 2], [0, -HB / 2 - 0.006, (ZH - HB / 2) / 2 + 0.006])
  k.box('stainless', [0.04, HB / 2 - 0.02, 0.008], [0, -HB / 2 - 0.006 + (HB / 2 - 0.02) / 2, 0.01])
  k.cyl('stainless', 0.022, 0.012, [0, -HB / 2 - 0.006, ZH], 'y', 20)
  // pan/tilt yoke with adjuster knobs
  for (const s of [-1, 1]) {
    k.box('stainless', [0.006, 0.06, 0.05], [s * (HB / 2 + 0.006), -0.035, ZH])
    k.cyl('plasticGrey', 0.012, 0.016, [s * (HB / 2 + 0.017), 0, ZH], 'x', 16)
  }
  k.box('stainless', [HB + 0.018, 0.006, 0.05], [0, -HB / 2 - 0.003, ZH])
  // body, front bezel, lens, alignment LEDs, rear gland
  k.rbox(CASE, [HB, HB * 0.98, HB], 0.018, [0, 0, ZH])
  const zF = ZH + HB / 2
  k.rbox('plasticGrey', [HB - 0.01, HB - 0.012, 0.012], 0.008, [0, 0, zF + 0.002])
  k.disc(LENS, 0.042, [0, 0.008, zF + 0.0085], 'z', 32)
  k.torus('plasticGrey', 0.043, 0.003, [0, 0.008, zF + 0.0085], 'z', 6, 32)
  k.disc(LENS, 0.012, [0.042, -0.042, zF + 0.0085], 'z', 16)
  k.sphere(LED_GREEN, 0.004, [-0.045, -0.048, zF + 0.008], undefined, 8)
  k.sphere(LED_AMBER, 0.004, [-0.032, -0.048, zF + 0.008], undefined, 8)
  k.hex('brass', 0.026, 0.014, [0.03, -HB / 2 - 0.004, ZH - 0.03], 'y')
}

/** Prism reflector plate (1 or 2 × 2 prisms) facing +Z on the bracket face. */
function reflector(k: Kit, n: number) {
  const s = 0.1 // 100 × 100 mm prism, typical
  const W = n * s + 0.02
  k.box('stainless', [W, W, 0.006], [0, 0, 0.003])
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.hex('nut', 0.012, 0.005, [sx * (W / 2 - 0.008), sy * (W / 2 - 0.008), 0.0085], 'z')
  const mat = prismMat()
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = (i - (n - 1) / 2) * s
      const y = (j - (n - 1) / 2) * s
      k.box('plasticGrey', [s - 0.004, s - 0.004, 0.01], [x, y, 0.011])
      k.add(mat, new THREE.PlaneGeometry(s - 0.012, s - 0.012), mat4([x, y, 0.0162]))
    }
}

function build(k: Kit, mount: Mount, sep: number, h: number, tag: string) {
  const n = sep > 50 ? 2 : 1
  for (const side of [-1, 1] as const) {
    const m = new THREE.Matrix4().makeTranslation(side * (sep / 2), 0, 0).multiply(new THREE.Matrix4().makeRotationY(-side * (Math.PI / 2)))
    k.with(m, () => {
      if (side < 0) {
        const face = mounted(k, mount, h, [0.12, 0.32], () => head(k))
        tagPlate(k, tag, [0, h + 0.1, face + 0.001], 'z', 0.1)
        // low-level controller with display and test key, cabled to the head
        const cy = Math.min(CY, h - 0.6)
        const cz = mount === 'pole' ? polePlate(k, cy, 0.2, 0.24) : wallPlate(k, cy, 0.2, 0.24)
        k.rbox(CASE, [0.18, 0.18, 0.065], 0.01, [0, cy, cz + 0.0325])
        k.add(controllerMat(), new THREE.PlaneGeometry(0.16, 0.16), mat4([0, cy, cz + 0.0655]))
        k.cyl('stainless', 0.006, 0.008, [0.06, cy - 0.07, cz + 0.069], 'z', 10)
        tagPlate(k, `${tag} CTRL`, [0, cy - 0.11, cz + 0.001], 'z', 0.09)
        const xc = mount === 'pole' ? -0.045 : 0.03
        const gl: V3 = [0.03, h - HB / 2 - 0.02, face + ZH - 0.03]
        cable(k, [gl, [0.03, h - HB / 2 - 0.06, face + ZH - 0.03], [xc, h - 0.25, mount === 'pole' ? 0 : 0.016], [xc, cy + 0.2, mount === 'pole' ? 0 : 0.016], [0.05, cy + 0.09, cz + 0.03]], 0.005)
        cable(k, [[-0.05, cy - 0.09, cz + 0.03], [-0.05, cy - 0.2, cz + 0.02], [xc, cy - 0.35, mount === 'pole' ? 0 : 0.016], [xc, 0.03, mount === 'pole' ? 0 : 0.016]], 0.005)
        for (const s of [-1, 1]) k.hex('brass', 0.022, 0.012, [s * 0.05, cy - 0.096, cz + 0.03], 'y')
      } else {
        const W = n * 0.1 + 0.02
        const face = mounted(k, mount, h, [W + 0.04, W + 0.16], () => reflector(k, n))
        tagPlate(k, `${tag} REF`, [0, h - W / 2 - 0.025, face + 0.001], 'z', 0.08)
      }
    })
  }
}
