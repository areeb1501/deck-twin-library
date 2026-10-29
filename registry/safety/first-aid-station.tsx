// First-aid station: hollow green GRP first-aid cabinet with hinged door (kits, dressings, eyewash bottles, foil blankets on shelves), optional basket stretcher on wall hooks, ISO 7010 E003 and E013 signs; on a wall or a galvanised stand. ISO 7010, ISO 3864-1, BS 8599-1.
import * as THREE from 'three'
import { Kit, mat4, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { SAFETY } from '../lib/standards'
import { GRP_GREEN, GRP_ORANGE, cabinet, crossPictogram, safetySign, shell, stretcherPictogram } from './_detectors'

export interface FirstAidStationProps {
  /** door swing, 0 closed … 1 open */
  open?: number
  /** basket stretcher on wall hooks beside the cabinet */
  stretcher?: boolean
  mount?: 'wall' | 'stand'
  sign?: boolean
  tag?: string
}

export const defaults = { open: 0.7, stretcher: true, mount: 'wall' as 'wall' | 'stand', sign: true, tag: 'FA-0401' }

const KITBOX: MatKey = paint('#1f7a4c', { metalness: 0, roughness: 0.5 })
const WHITE: MatKey = paint('#f1f1ec', { metalness: 0, roughness: 0.5 })
const FOIL: MatKey = paint('#d9b45a', { metalness: 0.8, roughness: 0.3 })
const W = 0.6 // typical
const H = 0.8 // typical
const D = 0.3 // typical

export function FirstAidStation(props: FirstAidStationProps & GroupProps) {
  const { open, stretcher, mount, sign, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, open, stretcher, mount, sign, tag), [open, stretcher, mount, sign, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default FirstAidStation

/** Green first-aid kit box with a white cross on the front at (x, y, z) (bottom centre). */
function kitBox(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number) {
  k.rbox(KITBOX, [w, h, d], 0.008, [x, y + h / 2, z])
  k.box(WHITE, [w * 0.12, h * 0.5, 0.002], [x, y + h / 2, z + d / 2 + 0.001])
  k.box(WHITE, [h * 0.5, w * 0.12, 0.002], [x, y + h / 2, z + d / 2 + 0.001])
  k.box('plasticGrey', [w * 0.3, 0.012, 0.012], [x, y + h + 0.004, z])
}

function contents(k: Kit) {
  // two shelves; kits, dressings, eyewash bottles, foil blankets, gloves
  for (const y of [0.27, 0.53]) {
    k.box(WHITE, [W - 0.014, 0.006, D - 0.03], [0, y, (D - 0.03) / 2 + 0.006])
    k.box(WHITE, [W - 0.014, 0.03, 0.004], [0, y + 0.015, D - 0.03])
  }
  kitBox(k, -0.14, 0.012, 0.13, 0.26, 0.17, 0.12)
  kitBox(k, 0.12, 0.012, 0.13, 0.2, 0.13, 0.1)
  for (let i = 0; i < 3; i++) {
    const x = -0.18 + i * 0.08
    k.cyl(WHITE, 0.03, 0.15, [x, 0.27 + 0.003 + 0.075, 0.12], 'y', 20)
    k.cyl(KITBOX, 0.02, 0.03, [x, 0.27 + 0.165, 0.12], 'y', 16)
    k.box(KITBOX, [0.04, 0.05, 0.001], [x, 0.27 + 0.08, 0.15])
  }
  for (let i = 0; i < 3; i++) k.box(FOIL, [0.14, 0.02, 0.1], [0.14, 0.276 + 0.01 + i * 0.021, 0.12])
  kitBox(k, -0.1, 0.536, 0.12, 0.3, 0.1, 0.12)
  k.box('plasticGrey', [0.12, 0.08, 0.08], [0.17, 0.536 + 0.04, 0.12])
}

/** Basket stretcher stored upright on two wall hooks, foot on a deck shoe; centre line at x, back on z = 0. */
function basket(k: Kit, x: number) {
  const L = 2.1 // basket stretcher, typical (stretcher cabinets ≈ 2.2 × 0.6 m aperture)
  const w = 0.58
  const y0 = 0.12
  const z = 0.12
  // stainless rail frame, orange polyethylene shell, cross straps, lifting bridle rings
  const rail = (dx: number) => k.rod('stainless', [x + dx, y0, z + 0.06], [x + dx, y0 + L, z + 0.06], 0.012, 10)
  rail(-w / 2)
  rail(w / 2)
  for (const y of [y0, y0 + L]) k.rod('stainless', [x - w / 2, y, z + 0.06], [x + w / 2, y, z + 0.06], 0.012, 10)
  k.at([x, 0, z - 0.08], undefined, () => shell(k, GRP_ORANGE, w - 0.04, L - 0.04, 0.14, 0.006, y0 + 0.02, paint('#c45410', { metalness: 0, roughness: 0.6, weather: 0 })))
  for (const y of [0.45, 0.85, 1.25, 1.6]) k.box(paint('#1d1e20', { metalness: 0, roughness: 0.85 }), [w, 0.045, 0.006], [x, y0 + y, z + 0.066])
  for (const sx of [-1, 1]) for (const y of [0.15, L - 0.15]) k.torus('stainless', 0.025, 0.005, [x + sx * (w / 2 + 0.02), y0 + y, z + 0.06], 'z', 6, 16)
  // wall hooks and deck shoe
  // J-hooks round the side rails
  for (const y of [y0 + L * 0.72, y0 + L * 0.28])
    for (const sx of [-1, 1]) {
      const xr = x + sx * (w / 2 + 0.018)
      k.box('galvanised', [0.05, 0.1, 0.008], [xr, y, 0.004])
      k.box('galvanised', [0.03, 0.012, z + 0.08], [xr, y - 0.018, (z + 0.08) / 2])
      k.box('galvanised', [0.03, 0.05, 0.01], [xr, y + 0.001, z + 0.085])
    }
  k.box('galvanised', [w + 0.06, 0.012, 0.22], [x, 0.006, z])
  k.box('galvanised', [w + 0.06, 0.1, 0.008], [x, 0.05, z + 0.11])
  k.box('galvanised', [0.02, y0 - 0.012, 0.02], [x - w / 2, 0.012 + (y0 - 0.012) / 2, z + 0.06])
  k.box('galvanised', [0.02, y0 - 0.012, 0.02], [x + w / 2, 0.012 + (y0 - 0.012) / 2, z + 0.06])
}

function build(k: Kit, open: number, stretcher: boolean, mount: 'wall' | 'stand', sign: boolean, tag: string) {
  let y0 = 1.0
  if (mount === 'stand') {
    y0 = 0.5
    for (const s of [-1, 1]) {
      k.box('galvanised', [0.05, y0 - 0.01, 0.05], [s * (W / 2 - 0.05), 0.01 + (y0 - 0.01) / 2, D / 2])
      k.box('galvanised', [0.12, 0.01, 0.12], [s * (W / 2 - 0.05), 0.005, D / 2])
    }
    k.box('galvanised', [W - 0.05, 0.05, 0.05], [0, y0 - 0.025, D / 2])
    k.box('galvanised', [W - 0.05, 0.05, 0.05], [0, 0.2, D / 2])
  } else for (const y of [y0 + 0.04, y0 + H - 0.04]) k.box('stainless', [W * 0.7, 0.05, 0.006], [0, y, 0.003])
  cabinet(k, {
    w: W,
    h: H,
    d: D,
    mat: GRP_GREEN,
    open,
    y0,
    inside: (k) => k.at([0, y0 + 0.006, 0.006], undefined, () => contents(k)),
    face: (k) => {
      // large white cross on the door, legend and tag
      k.box(WHITE, [0.09, 0.3, 0.002], [0, 0.06, 0.001])
      k.box(WHITE, [0.3, 0.09, 0.002], [0, 0.06, 0.001])
      k.add(safetySign('fa-legend', SAFETY.green, ['FIRST AID'], undefined, false, 512, 102), new THREE.PlaneGeometry(0.4, 0.08), mat4([0, -0.2, 0.0015]))
      tagPlate(k, tag, [0, -0.3, 0.0015], 'z', 0.1)
    },
  })
  if (sign) {
    const ys = y0 + H + 0.2
    const zs = mount === 'stand' ? D / 2 : 0
    k.box('stainless', [0.42, 0.21, 0.004], [0, ys, zs + 0.002])
    k.add(safetySign('E003', SAFETY.green, ['FIRST AID'], crossPictogram), new THREE.PlaneGeometry(0.41, 0.205), mat4([0, ys, zs + 0.0045]))
    // on a stand the sign rides on two flat bars from the cabinet roof
    if (mount === 'stand') for (const sx of [-0.15, 0.15]) k.box('stainless', [0.03, ys - 0.1 - (y0 + H), 0.006], [sx, (ys - 0.1 + y0 + H) / 2, zs - 0.003])
  }
  if (stretcher) {
    const xs = W / 2 + 0.45
    basket(k, xs)
    if (sign) {
      const ys = 2.17
      k.box('stainless', [0.42, 0.21, 0.004], [xs, ys, 0.002])
      k.add(safetySign('E013', SAFETY.green, ['STRETCHER'], stretcherPictogram), new THREE.PlaneGeometry(0.41, 0.205), mat4([xs, ys, 0.0045]))
    }
  }
}
