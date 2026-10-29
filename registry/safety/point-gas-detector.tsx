// Point gas detector: IR detector screwed horizontally into an Ex d junction box under a sunshade/deluge hood with remote gassing line, or a catalytic transmitter with display and down-pointing sensor; stanchion or wall bracket. IEC 60079-29-1, IEC 60079-29-2.
import * as THREE from 'three'
import { Kit, mat4, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { LED_GREEN, canvasMat, cable, cableToDeck, exdBox, faceZ, mounted, polePlate, stopPlug, type Mount } from './_fg'

export interface PointGasDetectorProps {
  mount?: Mount
  /** sensor centre above the deck, m (above the leak source for lighter-than-air gas, below it for heavier) */
  height?: number
  /** ir: horizontal optical detector on an Ex d box; catalytic: transmitter with display, sensor pointing down */
  sensor?: 'ir' | 'catalytic'
  /** target gas shown on the transmitter display */
  gas?: string
  /** sunshade/deluge hood over the IR detector */
  sunshade?: boolean
  /** remote gassing line to a calibration port at hand height */
  gassing?: boolean
  /** separate Ex d junction box under a catalytic transmitter */
  junction?: boolean
  tag?: string
}

export const defaults = { mount: 'pole' as Mount, height: 1.2, sensor: 'ir' as 'ir' | 'catalytic', gas: 'CH4', sunshade: true, gassing: true, junction: true, tag: 'GD-2101' }

export function PointGasDetector(props: PointGasDetectorProps & GroupProps) {
  const { mount, height, sensor, gas, sunshade, gassing, junction, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(0.5, height)
  const data = useKit(
    (k) => (sensor === 'ir' ? buildIr(k, mount, h, sunshade, gassing, tag) : buildCat(k, mount, h, gas, junction, tag)),
    [mount, h, sensor, gas, sunshade, gassing, junction, tag],
  )
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PointGasDetector

const BOX: V3 = [0.16, 0.16, 0.11]

/** IR detector along +X from the box side wall; origin on the bracket face, detector axis at y = 0. */
function buildIr(k: Kit, mount: Mount, h: number, sunshade: boolean, gassing: boolean, tag: string) {
  const zf = faceZ(mount)
  const za = BOX[2] * 0.31 // detector axis out from the bracket face
  const x0 = BOX[0] / 2 // box side wall
  const L1 = 0.1 // stainless body
  const L2 = 0.075 // weather protection
  let entry: V3 = [0, 0, 0]
  mounted(k, mount, h, [0.2, 0.24], () => {
    entry = exdBox(k, [0, 0, 0], BOX, 2, 1)[0]
    tagPlate(k, tag, [0, 0, BOX[2] + 0.001], 'z', 0.1)
    // threaded boss and locknut in the box wall, stainless body, weather protection with gas holes on the underside
    k.cyl('stainless', 0.016, 0.02, [x0 + 0.01, 0, za], 'x', 14)
    k.hex('stainless', 0.042, 0.01, [x0 + 0.016, 0, za], 'x')
    k.cyl('stainless', 0.03, L1, [x0 + 0.02 + L1 / 2, 0, za], 'x', 28)
    for (const dx of [0.03, 0.07]) k.torus('stainless', 0.031, 0.0025, [x0 + 0.02 + dx, 0, za], 'x', 6, 28)
    const xw = x0 + 0.02 + L1
    k.lathe('rubberBlack', [[0.03, 0], [0.037, 0.002], [0.037, L2], [0.03, L2]], [xw, 0, za], 'x', 32)
    k.disc('rubberBlack', 0.03, [xw + L2, 0, za], 'x', 32)
    // semicircular hole pattern on the lower half of the end face, gas venting slot on the side
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.1 + (0.8 * i) / 6)
      k.disc('pipeBore', 0.0035, [xw + L2 + 0.0006, Math.sin(a) * 0.021, za + Math.cos(a) * 0.021], 'x', 8)
    }
    k.box('pipeBore', [0.03, 0.004, 0.006], [xw + L2 * 0.55, -0.0368, za])
    if (gassing) {
      // gassing nipple on the weather protection and stainless 1/8" line down the bracket to a capped port
      const n: V3 = [xw + L2 * 0.45, -0.036, za]
      k.cyl('stainless', 0.004, 0.012, [n[0], n[1] - 0.006, n[2]], 'y', 8)
      k.tube('tubing', [[n[0], n[1] - 0.012, n[2]], [n[0], -0.1, n[2]], [0.09, -0.1, za]], 0.0032, 6, 0.02)
      k.box('stainless', [0.03, 0.026, za], [0.072, -0.1, za / 2])
      k.cyl('stainless', 0.006, 0.016, [0.072, -0.1, za + 0.008], 'z', 10)
      k.cyl('actuatorRed', 0.009, 0.012, [0.072, -0.1, za + 0.02], 'z', 12)
    }
    if (sunshade) {
      // hollow stainless sunshade/deluge hood over the top, clamped round the base of the weather protection
      const xs = x0 + 0.004
      const Ls = L1 + L2 + 0.04
      const R = 0.055
      const a0 = 0.9 * Math.PI
      const al = 1.2 * Math.PI
      k.lathe('stainless', [[R - 0.002, 0], [R, 0], [R, Ls], [R - 0.002, Ls], [R - 0.002, 0]], [xs, 0, za], 'x', 28, a0, al)
      for (const phi of [a0, a0 + al]) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.atan2(Math.cos(phi), -Math.sin(phi)))
        k.box('stainless', [Ls, 0.002, 0.0016], [xs + Ls / 2, -(R - 0.001) * Math.sin(phi), za + (R - 0.001) * Math.cos(phi)], q)
      }
      k.torus('stainless', 0.0385, 0.003, [xw + 0.012, 0, za], 'x', 6, 28)
      for (const s of [-1, 1]) {
        k.rod('stainless', [xw + 0.012, 0.03, za + s * 0.024], [xw + 0.012, R * 0.82, za + s * 0.032], 0.002, 6)
        k.hex('nut', 0.01, 0.005, [xw + 0.012, 0.03, za + s * 0.024], 'y')
      }
    }
  })
  cableToDeck(k, mount, [entry[0], entry[1] + h + 0.005, entry[2] + zf])
}

function lcdMat(gas: string) {
  return canvasMat(`gd-lcd-${gas}`, 256, 256, (g) => {
    g.fillStyle = '#9fb59a'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#1c2a1d'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = 'bold 84px "Courier New", monospace'
    g.fillText('0', 128, 112)
    g.font = 'bold 32px Arial, sans-serif'
    g.fillText(gas === 'H2S' || gas === 'CO' ? 'ppm' : '%LEL', 128, 176)
    g.font = 'bold 26px Arial, sans-serif'
    g.fillText(gas, 128, 58)
    g.fillRect(56, 204, 144, 5)
  }, { emissive: 0.25 })
}

/** Catalytic transmitter: Ex d housing with display facing +Z, sensor and weather cap pointing down. */
function buildCat(k: Kit, mount: Mount, h: number, gas: string, junction: boolean, tag: string) {
  const zc = 0.07
  let gland = new THREE.Vector3()
  mounted(k, mount, h, [0.14, 0.22], (zf) => {
    k.box('stainless', [0.16, 0.03, 0.012], [0, 0.02, 0.006])
    for (const sx of [-1, 1]) k.hex('nut', 0.014, 0.007, [sx * 0.068, 0.02, 0.0155], 'z')
    k.box('stainless', [0.03, 0.03, zc - 0.03], [0, 0.02, 0.012 + (zc - 0.03) / 2])
    k.cyl('actuatorYellow', 0.062, 0.085, [0, 0, zc - 0.005], 'z', 28)
    k.cyl('actuatorYellow', 0.066, 0.022, [0, 0, zc + 0.048], 'z', 28)
    k.torus('nut', 0.058, 0.004, [0, 0, zc + 0.06], 'z', 6, 28)
    k.add(lcdMat(gas), new THREE.CircleGeometry(0.034, 24), mat4([0, 0, zc + 0.0595]))
    k.disc('glass', 0.04, [0, 0, zc + 0.0615], 'z', 24)
    k.sphere(LED_GREEN, 0.005, [0.045, 0.022, zc + 0.059], undefined, 8)
    for (const s of [-1, 1]) k.cyl('nut', 0.006, 0.006, [s * 0.05, -0.03, zc + 0.06], 'z', 8)
    // sensor down: adaptor, sinter head under a hollow weather cap with calibration nozzle
    k.cyl('actuatorYellow', 0.03, 0.02, [0, -0.068, zc], 'y', 18)
    k.hex('stainless', 0.05, 0.016, [0, -0.085, zc], 'y')
    k.cyl('stainless', 0.03, 0.05, [0, -0.118, zc], 'y', 20)
    k.cyl('castIron', 0.024, 0.012, [0, -0.149, zc], 'y', 18)
    k.lathe('plasticGrey', [[0.03, 0], [0.042, 0], [0.042, 0.06], [0.036, 0.06], [0.036, 0.006], [0.03, 0.006], [0.03, 0]], [0, -0.1, zc], '-y', 24)
    k.cyl('plasticGrey', 0.006, 0.026, [0, -0.135, zc + 0.052], 'z', 10)
    k.cyl('actuatorRed', 0.009, 0.012, [0, -0.135, zc + 0.07], 'z', 12)
    // cable entries: one gland, one stopping plug
    k.hex('brass', 0.03, 0.02, [0.042, -0.052, zc - 0.012], 'y')
    stopPlug(k, [-0.042, -0.048, zc - 0.012], '-y')
    gland = new THREE.Vector3(0.042, h - 0.064, zf + zc - 0.012)
  })
  const zf = faceZ(mount)
  if (junction) {
    const jy = h - 0.42
    const jz = mount === 'pole' ? polePlate(k, jy, 0.24, 0.24) : 0.008
    if (mount === 'wall') k.box('stainless', [0.24, 0.24, 0.008], [0, jy, 0.004])
    const e = exdBox(k, [0, jy, jz], [0.18, 0.16, 0.11], 3, 2)
    tagPlate(k, tag, [0, jy + 0.02, jz + 0.11 + 0.001], 'z', 0.1)
    cable(k, [gland.toArray() as V3, [gland.x + 0.06, gland.y - 0.1, gland.z], [0.13, jy + 0.1, e[1][2] + 0.03], [0.13, e[1][1] - 0.05, e[1][2]], [e[1][0], e[1][1] - 0.04, e[1][2]], e[1]])
    cableToDeck(k, mount, e[0])
  } else {
    tagPlate(k, tag, [0, h - 0.085, zf + 0.001], 'z', 0.09)
    cableToDeck(k, mount, gland.toArray() as V3)
  }
}
