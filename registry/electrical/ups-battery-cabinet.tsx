// Industrial UPS line-up: rectifier / charger, inverter with static bypass, distribution and VRLA battery cabinets on a base frame. IEC 62040-1/3, IEC 62485-2.
import * as THREE from 'three'
import { Kit, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, tagPlate } from '../lib/parts'
import { textMaterial } from '../lib/textures'
import { cableGland, earthBoss, louvrePanel } from './_parts'
import { lamp, legendMaterial, relayFaceMaterial } from './_textures'

export interface UpsBatteryCabinetProps {
  /** UPS rating, kVA (sets the number of power sections) */
  kva?: number
  /** number of battery cabinets */
  batteryCabinets?: number
  /** battery cabinet doors open: shelves of VRLA blocks with links and the DC breaker */
  doorOpen?: boolean
  tag?: string
}

export const defaults = {
  kva: 60,
  batteryCabinets: 2,
  doorOpen: false,
  tag: 'UPS-8701',
}

const CW = 0.8 // section width, typical
const CH = 2.0
const CD = 0.8
const front = new THREE.Quaternion()

export function UpsBatteryCabinet(props: UpsBatteryCabinetProps & GroupProps) {
  const { kva, batteryCabinets, doorOpen, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { kva, batteryCabinets, doorOpen, tag }), [kva, batteryCabinets, doorOpen, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default UpsBatteryCabinet

function build(k: Kit, p: typeof defaults) {
  const body = paint('#d5d7d3', { metalness: 0.2, roughness: 0.45, clearcoat: 0.2, weather: 0 })
  const dark = paint('#3c4146', { metalness: 0.3, roughness: 0.5, clearcoat: 0, weather: 0 })
  const kinds: ('rect' | 'inv' | 'dist' | 'bat')[] = ['rect', 'inv']
  if (p.kva > 120) kinds.push('inv')
  kinds.push('dist')
  const nb = Math.max(1, Math.min(6, Math.round(p.batteryCabinets)))
  for (let i = 0; i < nb; i++) kinds.push('bat')
  const n = kinds.length
  const W = n * CW
  const yb = 0.1
  // base frame, end covers
  k.box('structSteelDark', [W + 0.04, yb, CD], [0, yb / 2, 0])
  for (const s of [-1, 1]) k.box(body, [0.03, CH, CD], [s * (W / 2 + 0.015), yb + CH / 2, 0])
  earthBoss(k, [W / 2 + 0.03, yb + 0.15, -CD * 0.3], 'x')

  kinds.forEach((kind, i) => {
    const xc = -W / 2 + CW * (i + 0.5)
    const zf = CD / 2
    const open = kind === 'bat' && p.doorOpen
    // carcass: hollow for battery cabinets (back, sides, roof, floor), solid for the power sections
    if (kind === 'bat') {
      const t = 0.015
      k.box(body, [CW - 0.004, CH, t], [xc, yb + CH / 2, -CD / 2 + t / 2])
      k.box(body, [CW - 0.004, t, CD], [xc, yb + CH - t / 2, 0])
      k.box(body, [CW - 0.004, t, CD], [xc, yb + t / 2, 0])
      for (const s of [-1, 1]) k.box(body, [t, CH, CD], [xc + s * (CW / 2 - t / 2 - 0.002), yb + CH / 2, 0])
      // shelves of 12 V VRLA blocks with inter-block links, DC breaker on top
      const shelves = 5
      for (let sh = 0; sh < shelves; sh++) {
        const ys = yb + 0.12 + sh * 0.34
        k.box('galvanised', [CW - 0.04, 0.012, CD - 0.06], [xc, ys, 0])
        for (let b = 0; b < 3; b++) {
          const bx = xc - 0.25 + b * 0.25
          k.box(dark, [0.17, 0.22, 0.48], [bx, ys + 0.116, -0.04])
          k.box(paint('#2a2c2e', { roughness: 0.6 }), [0.175, 0.03, 0.485], [bx, ys + 0.236, -0.04])
          for (const [tz, c] of [[0.17, 'actuatorRed'], [-0.25, 'rubberBlack']] as [number, MatKey][]) k.cyl(c, 0.012, 0.025, [bx, ys + 0.26, tz], 'y', 10)
          if (b < 2) k.box('copper', [0.25, 0.006, 0.02], [bx + 0.125, ys + 0.27, 0.17])
        }
        k.plane(legendMaterial(`STRING A  ${sh * 3 + 1}-${sh * 3 + 3}`), 0.2, 0.025, [xc, ys - 0.01, CD / 2 - 0.029], front)
      }
      k.rbox(dark, [0.18, 0.16, 0.12], 0.01, [xc, yb + CH - 0.15, 0.2])
      k.box('actuatorRed', [0.03, 0.06, 0.02], [xc, yb + CH - 0.15, 0.27])
      // louvred door, hinged on the left, swung open about 100°
      const hinge = new THREE.Vector3(xc - CW / 2 + 0.01, 0, zf + 0.012)
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), open ? -1.5 : 0)
      k.at([hinge.x, 0, hinge.z], q, () => {
        k.box(body, [CW - 0.02, CH - 0.02, 0.02], [CW / 2 - 0.01, yb + CH / 2, 0])
        for (const y of [yb + 0.35, yb + CH - 0.35]) louvrePanel(k, CW * 0.6, 0.4, [CW / 2, y, 0.0105], front, '#d5d7d3')
        k.box('stainless', [0.03, 0.18, 0.03], [CW - 0.08, yb + CH * 0.5, 0.025])
        k.plane(textMaterial('BATTERY  DC 220 V', '#f4c414', '#111111', 256, 48), 0.3, 0.056, [CW / 2, yb + CH * 0.62, 0.0105], front)
        for (const y of [0.3, CH - 0.3]) k.cyl('nut', 0.012, 0.08, [0.0, yb + y, 0], 'y', 8)
      })
    } else {
      k.box(body, [CW - 0.004, CH, CD - 0.02], [xc, yb + CH / 2, -0.01])
      // door with louvres at the bottom (air in) and fan grilles on the roof (air out)
      k.box(body, [CW - 0.02, CH - 0.02, 0.02], [xc, yb + CH / 2, zf + 0.01])
      louvrePanel(k, CW * 0.65, 0.45, [xc, yb + 0.35, zf + 0.0205], front, '#d5d7d3')
      k.box('stainless', [0.03, 0.18, 0.03], [xc + CW / 2 - 0.08, yb + CH * 0.5, zf + 0.035])
      for (const y of [0.3, CH - 0.3]) k.cyl('nut', 0.012, 0.08, [xc - CW / 2 + 0.012, yb + y, zf + 0.012], 'y', 8)
      k.box(dark, [CW * 0.5, 0.06, CD * 0.5], [xc, yb + CH + 0.03, -0.05])
      if (kind === 'inv' || kind === 'rect') {
        // touch-screen mimic panel, status lamps, emergency power off under a flap
        k.box(dark, [0.26, 0.2, 0.02], [xc, yb + 1.55, zf + 0.03])
        k.plane(relayFaceMaterial(), 0.22, 0.16, [xc, yb + 1.55, zf + 0.0405], front)
        ;(['green', 'amber', 'red'] as const).forEach((c, j) => k.cyl(lamp(c), 0.012, 0.012, [xc - 0.05 + j * 0.05, yb + 1.38, zf + 0.026], 'z', 12))
        k.plane(legendMaterial(kind === 'rect' ? 'RECTIFIER / CHARGER' : 'INVERTER + STATIC BYPASS', true), 0.36, 0.04, [xc, yb + 1.78, zf + 0.0205], front)
      } else {
        // distribution: meters and a window over the outgoing MCBs
        gauge(k, [xc - 0.15, yb + 1.6, zf + 0.02], 'z', 0.09, 'bar', 250)
        gauge(k, [xc + 0.15, yb + 1.6, zf + 0.02], 'z', 0.09, 'bar', 250)
        k.box('glass', [0.5, 0.4, 0.008], [xc, yb + 1.15, zf + 0.024])
        k.box(dark, [0.48, 0.38, 0.004], [xc, yb + 1.15, zf + 0.0205])
        k.plane(legendMaterial('UPS DISTRIBUTION 230 V AC', true), 0.36, 0.04, [xc, yb + 1.85, zf + 0.0205], front)
      }
    }
  })
  // top cable entry gland plates
  for (let i = 0; i < 3; i++) {
    const x = -W / 2 + CW * (i + 0.5)
    k.box('galvanised', [0.4, 0.006, 0.2], [x, yb + CH + 0.003, -CD / 2 + 0.15])
    for (let c = 0; c < 3; c++) {
      cableGland(k, [x - 0.1 + c * 0.1, yb + CH + 0.006, -CD / 2 + 0.15], 'y', 0.03)
    }
  }
  tagPlate(k, p.tag, [-W / 2 + CW / 2, yb + CH - 0.08, CD / 2 + 0.0215], 'z', 0.16)
}
