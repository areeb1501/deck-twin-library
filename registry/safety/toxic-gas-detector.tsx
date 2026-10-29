// Toxic gas detector: Ex d transmitter with ppm display and magnetic-key targets, electrochemical sensor pointing down under a colour-coded weather cap with calibration nozzle and splash guard; stanchion or wall. IEC 60079-29-1, IEC 60079-1, EN 45544.
import * as THREE from 'three'
import { Kit, mat4, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { LED_GREEN, canvasMat, cableToDeck, mounted, polePlate, stopPlug, warnMat, type Mount } from './_fg'
import { tagBracket } from './_detectors'

export type ToxicGas = 'H2S' | 'CO' | 'SO2' | 'NH3' | 'Cl2' | 'O2'

export interface ToxicGasDetectorProps {
  mount?: Mount
  /** transmitter centre above the deck, m (breathing zone ~1.5; lower for heavier-than-air H2S, SO2, Cl2) */
  height?: number
  gas?: ToxicGas
  /** flared splash guard round the sensor cap */
  splashGuard?: boolean
  tag?: string
}

export const defaults = { mount: 'pole' as Mount, height: 1.5, gas: 'H2S' as ToxicGas, splashGuard: true, tag: 'GDT-1101' }

// sensor cap colours by target gas: no common standard, typical of maker colour coding
const CAP: Record<ToxicGas, string> = { H2S: '#e3b20d', CO: '#2a2c30', SO2: '#3c8d4f', NH3: '#2f6db5', Cl2: '#7a4aa0', O2: '#ecebe6' } // typical
const RANGE: Record<ToxicGas, [string, string, string]> = {
  H2S: ['0.0', 'ppm', '0–50 ppm'],
  CO: ['0', 'ppm', '0–300 ppm'],
  SO2: ['0.0', 'ppm', '0–20 ppm'],
  NH3: ['0', 'ppm', '0–200 ppm'],
  Cl2: ['0.00', 'ppm', '0–10 ppm'],
  O2: ['20.9', '%vol', '0–25 %vol'],
}
const BODY: MatKey = paint('#4a5560', { metalness: 0.35, roughness: 0.45, clearcoat: 0.3 })
const ZB = 0.012 // body back off the bracket face, m
const DB = 0.09 // body depth, m

export function ToxicGasDetector(props: ToxicGasDetectorProps & GroupProps) {
  const { mount, height, gas, splashGuard, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(0.5, height)
  const g = (CAP[gas] ? gas : 'H2S') as ToxicGas
  const data = useKit((k) => build(k, mount, h, g, splashGuard, tag), [mount, h, g, splashGuard, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ToxicGasDetector

function lcd(gas: ToxicGas) {
  const [val, unit, range] = RANGE[gas]
  return canvasMat(`tox-lcd-${gas}`, 256, 256, (g) => {
    g.fillStyle = '#a9c2a2'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#16231a'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = 'bold 34px Arial, sans-serif'
    g.fillText(gas, 128, 54)
    g.font = 'bold 80px "Courier New", monospace'
    g.fillText(val, 128, 122)
    g.font = 'bold 30px Arial, sans-serif'
    g.fillText(unit, 128, 176)
    g.font = '20px Arial, sans-serif'
    g.fillText(range, 128, 210)
    g.fillRect(40, 228, 176, 4)
  }, { emissive: 0.25 })
}

function build(k: Kit, mount: Mount, h: number, gas: ToxicGas, splash: boolean, tag: string) {
  const cap = paint(CAP[gas], { metalness: 0.05, roughness: 0.5, clearcoat: 0.3 })
  const zc = ZB + DB / 2 // sensor axis out from the bracket face
  const yb = -0.065 // body underside
  let gland: V3 = [0, 0, 0]
  const zf = mounted(k, mount, h, [0.16, 0.3], () => {
    // cast Ex d enclosure with integral lugs, bolted to the plate
    for (const s of [-1, 1]) {
      k.box(BODY, [0.05, 0.03, ZB], [0, 0.02 + s * 0.1, ZB / 2])
      k.hex('nut', 0.016, 0.008, [0, 0.02 + s * 0.1, ZB + 0.004], 'z')
    }
    k.rbox(BODY, [0.15, 0.17, DB], 0.014, [0, 0.02, ZB + DB / 2])
    // screwed flameproof cover with window, display and non-intrusive magnetic-key targets
    const zw = ZB + DB
    k.cyl(BODY, 0.07, 0.008, [0, 0.03, zw + 0.004], 'z', 40)
    k.cyl(BODY, 0.064, 0.024, [0, 0.03, zw + 0.02], 'z', 40)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      k.box(BODY, [0.008, 0.006, 0.022], [Math.cos(a) * 0.065, 0.03 + Math.sin(a) * 0.065, zw + 0.02], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a))
    }
    k.add(lcd(gas), new THREE.CircleGeometry(0.044, 32), mat4([0, 0.03, zw + 0.0325]))
    k.torus('stainless', 0.048, 0.003, [0, 0.03, zw + 0.033], 'z', 6, 32)
    k.disc('glass', 0.049, [0, 0.03, zw + 0.0345], 'z', 32)
    k.sphere(LED_GREEN, 0.004, [0.034, 0.064, zw + 0.033], undefined, 8)
    for (const s of [-1, 1]) {
      k.cyl('stainless', 0.008, 0.004, [s * 0.05, -0.048, zw + 0.002], 'z', 16)
      k.cyl('rubberBlack', 0.004, 0.0045, [s * 0.05, -0.048, zw + 0.002], 'z', 12)
    }
    k.box('nameplate', [0.05, 0.016, 0.0015], [0, -0.048, zw + 0.001])
    k.cyl('brass', 0.004, 0.02, [0.075 + 0.01, -0.04, ZB + 0.03], 'x', 8)
    k.hex('brass', 0.012, 0.006, [0.091, -0.04, ZB + 0.03], 'x')
    // cable entries on the underside: armoured gland in one, stopping plug in the other
    k.cyl(BODY, 0.015, 0.008, [-0.045, yb - 0.004, zc], 'y', 16)
    k.hex('brass', 0.032, 0.016, [-0.045, yb - 0.016, zc], 'y')
    k.cyl('brass', 0.012, 0.018, [-0.045, yb - 0.033, zc], 'y', 12)
    k.cyl('rubberBlack', 0.0085, 0.012, [-0.045, yb - 0.047, zc], 'y', 10)
    k.cyl(BODY, 0.015, 0.008, [0.045, yb - 0.004, zc], 'y', 16)
    stopPlug(k, [0.045, yb - 0.011, zc], '-y')
    gland = [-0.045, h + yb - 0.05, zc]
    // sensor: hex boss, stainless cell housing, colour-coded weather cap (hollow), sinter, calibration nozzle
    k.hex('stainless', 0.05, 0.014, [0, yb - 0.007, zc], 'y')
    k.cyl('stainless', 0.026, 0.035, [0, yb - 0.031, zc], 'y', 28)
    k.torus('stainless', 0.0262, 0.0015, [0, yb - 0.02, zc], 'y', 4, 28)
    const yc = yb - 0.044
    k.lathe(cap, [[0.026, 0], [0.034, 0], [0.036, 0.008], [0.036, 0.058], [0.0315, 0.058], [0.0315, 0.012], [0.026, 0.012]], [0, yc, zc], '-y', 36)
    k.disc('castIron', 0.03, [0, yc - 0.03, zc], '-y', 28)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      k.disc('rubberBlack', 0.0035, [Math.cos(a) * 0.019, yc - 0.0302, zc + Math.sin(a) * 0.019], '-y', 8)
    }
    k.disc('rubberBlack', 0.004, [0, yc - 0.0302, zc], '-y', 8)
    k.cyl(cap, 0.005, 0.024, [0, yc - 0.03, zc + 0.044], 'z', 12)
    k.cyl(cap, 0.0035, 0.012, [0, yc - 0.03, zc + 0.06], 'z', 10)
    k.cyl('actuatorRed', 0.0065, 0.012, [0, yc - 0.03, zc + 0.068], 'z', 12)
    k.torus('rubberBlack', 0.0035, 0.0015, [0, yc - 0.03, zc + 0.062], 'z', 4, 10)
    if (splash) {
      // slotted flared splash guard clipped over the cap, open underneath
      k.lathe('plasticGrey', [[0.037, 0], [0.058, 0.034], [0.058, 0.04], [0.055, 0.04], [0.035, 0.006]], [0, yc - 0.022, zc], '-y', 36)
      for (let i = 0; i < 6; i++) {
        const a = ((i + 0.5) / 6) * Math.PI * 2
        k.box('rubberBlack', [0.012, 0.004, 0.0015], [Math.cos(a) * 0.0475, yc - 0.041, zc + Math.sin(a) * 0.0475], new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -1.0)))
      }
    }
  }, h + 0.42)
  // black and yellow toxic-gas warning plate above the transmitter
  const yw = h + 0.31
  const zw = mount === 'pole' ? polePlate(k, yw, 0.24, 0.13) + 0.012 : 0.004
  if (mount === 'pole') for (const sx of [-0.08, 0.08]) k.box('stainless', [0.03, 0.03, 0.012], [sx, yw, zw - 0.006])
  k.box('stainless', [0.24, 0.12, 0.003], [0, yw, zw + 0.0015])
  k.plane(warnMat(['TOXIC GAS', `${gas} DETECTOR`]), 0.234, 0.114, [0, yw, zw + 0.0035])
  tagBracket(k, mount, mount === 'pole' ? Math.max(0.3, h - 0.45) : h - 0.27, tag, 0.04)
  cableToDeck(k, mount, [gland[0], gland[1], gland[2] + zf])
}
