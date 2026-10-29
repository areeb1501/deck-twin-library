// Breathing apparatus cabinet: hollow GRP cabinet with hinged door, latches and mandatory sign, holding an SCBA set (composite cylinder, backplate and harness, full-face mask, demand valve, gauge) and optionally a spare cylinder; on a wall or a galvanised stand. EN 137, ISO 7010, SOLAS FSS Code ch. 3.
import * as THREE from 'three'
import { Kit, mat4, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, tagPlate } from '../lib/parts'
import { SAFETY } from '../lib/standards'
import { GRP_ORANGE, GRP_RED, cabinet, respiratorPictogram, safetySign } from './_detectors'

export interface BreathingApparatusCabinetProps {
  /** 1: one SCBA set; 2: SCBA set plus a spare cylinder (wider cabinet) */
  sets?: number
  /** door swing, 0 closed … 1 open */
  open?: number
  mount?: 'wall' | 'stand'
  colour?: 'red' | 'orange'
  sign?: boolean
  tag?: string
}

export const defaults = { sets: 1, open: 0.8, mount: 'wall' as 'wall' | 'stand', colour: 'red' as 'red' | 'orange', sign: true, tag: 'BA-0301' }

const CYL: MatKey = paint('#2b2d30', { metalness: 0.2, roughness: 0.35, clearcoat: 0.6 })
const SHOULDER: MatKey = paint('#e9e9e4', { metalness: 0.1, roughness: 0.4 })
const STRAP: MatKey = paint('#1d1e20', { metalness: 0, roughness: 0.85 })
const WEB: MatKey = paint('#e0b21a', { metalness: 0, roughness: 0.8 })
const VISOR: MatKey = paint('#a9c4d2', { metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55, weather: 0 })

export function BreathingApparatusCabinet(props: BreathingApparatusCabinetProps & GroupProps) {
  const { sets, open, mount, colour, sign, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, sets >= 2 ? 2 : 1, open, mount, colour, sign, tag), [sets, open, mount, colour, sign, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default BreathingApparatusCabinet

/** 6.8 L composite cylinder standing on its base at the origin, valve up. */
function cylinder(k: Kit, x: number, y: number, z: number) {
  const r = 0.078
  const L = 0.5
  k.cyl(CYL, r, L - r, [x, y + (L - r) / 2, z], 'y', 32)
  k.dome(CYL, r, [x, y + 0.002, z], '-y', Math.PI / 2, 0.3, 32)
  k.dome(SHOULDER, r, [x, y + L - r, z], 'y', Math.PI / 2, 0.75, 32)
  k.cyl(SHOULDER, r + 0.0005, 0.05, [x, y + L - r - 0.025, z], 'y', 32)
  // valve with handwheel and side outlet
  const yv = y + L - r + r * 0.75
  k.cyl('stainless', 0.016, 0.03, [x, yv + 0.015, z], 'y', 16)
  k.box('stainless', [0.04, 0.03, 0.03], [x, yv + 0.04, z])
  k.cyl('rubberBlack', 0.025, 0.014, [x, yv + 0.07, z], 'y', 20)
  k.cyl('stainless', 0.008, 0.03, [x + 0.03, yv + 0.04, z], 'x', 10)
}

/** SCBA set hung on the back wall: backplate, harness, cylinder, reducer hose, gauge, mask with demand valve. */
function scba(k: Kit, x: number, h: number) {
  const zb = 0.04
  // hanger bracket
  k.box('stainless', [0.16, 0.03, 0.04], [x, h * 0.84, 0.026])
  // backplate (moulded), waist belt, shoulder straps
  k.rbox(STRAP, [0.28, 0.56, 0.03], 0.03, [x, h * 0.5, zb])
  for (const s of [-1, 1]) {
    k.tube(WEB, [[x + s * 0.08, h * 0.78, zb + 0.016], [x + s * 0.12, h * 0.7, zb + 0.2], [x + s * 0.12, h * 0.45, zb + 0.22], [x + s * 0.1, h * 0.33, zb + 0.03]], 0.008, 6, 0.06)
    k.box(STRAP, [0.12, 0.05, 0.012], [x + s * 0.14, h * 0.24, zb + 0.06], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s * 0.6))
  }
  k.box('stainless', [0.05, 0.04, 0.012], [x, h * 0.24, zb + 0.105])
  // cylinder lying on the backplate, valve down, strapped
  const zc = zb + 0.015 + 0.078
  k.with(mat4([x, h * 0.86, zc], '-y'), () => cylinder(k, 0, 0, 0))
  for (const y of [0.62, 0.74]) k.torus(STRAP, 0.08, 0.006, [x, h * y, zc], 'y', 6, 32)
  // pressure reducer, gauge hose and gauge
  k.box('stainless', [0.05, 0.05, 0.04], [x, h * 0.25, zc])
  k.tube('rubberBlack', [[x + 0.02, h * 0.25, zc], [x + 0.09, h * 0.3, zc + 0.08], [x + 0.13, h * 0.55, zc + 0.12]], 0.006, 8, 0.05)
  gauge(k, [x + 0.13, h * 0.58, zc + 0.12], 'z', 0.06)
  // full-face mask hung on its hook with demand valve
  const ym = h * 0.32
  k.tube('rubberBlack', [[x - 0.02, h * 0.25, zc], [x - 0.12, h * 0.22, zc + 0.1], [x - 0.1, ym - 0.03, zc + 0.16]], 0.008, 8, 0.05)
  k.sphere(STRAP, 0.09, [x - 0.1, ym + 0.05, zc + 0.12], [0.8, 1.1, 0.55], 24)
  k.sphere(VISOR, 0.075, [x - 0.1, ym + 0.07, zc + 0.15], [0.85, 1, 0.5], 24)
  k.cyl('plasticGrey', 0.026, 0.04, [x - 0.1, ym - 0.03, zc + 0.17], 'z', 20)
}

function build(k: Kit, sets: number, open: number, mount: 'wall' | 'stand', colour: 'red' | 'orange', sign: boolean, tag: string) {
  const mat = colour === 'orange' ? GRP_ORANGE : GRP_RED
  // JB83-type single set ≈ 0.548 W × 0.816 H × 0.344 D; set + spare ≈ 0.835 × 0.937 × 0.347
  const w = sets === 2 ? 0.835 : 0.548
  const h = sets === 2 ? 0.937 : 0.816
  const d = 0.345 // typical
  let y0: number
  if (mount === 'stand') {
    y0 = 0.45
    for (const s of [-1, 1]) {
      k.box('galvanised', [0.05, y0 - 0.01, 0.05], [s * (w / 2 - 0.05), 0.01 + (y0 - 0.01) / 2, d / 2])
      k.box('galvanised', [0.12, 0.01, 0.12], [s * (w / 2 - 0.05), 0.005, d / 2])
      for (const dz of [-1, 1]) k.hex('nut', 0.018, 0.01, [s * (w / 2 - 0.05) + dz * 0.04, 0.015, d / 2 + dz * 0.04], 'y')
    }
    k.box('galvanised', [w - 0.05, 0.05, 0.05], [0, y0 - 0.025, d / 2])
    k.box('galvanised', [w - 0.05, 0.05, 0.05], [0, 0.2, d / 2])
  } else {
    y0 = 0.9
    // wall cleats top and bottom
    for (const y of [y0 + 0.04, y0 + h - 0.04]) {
      k.box('stainless', [w * 0.7, 0.05, 0.006], [0, y, 0.003])
    }
  }
  const sx = sets === 2 ? -w / 2 + 0.25 : 0
  cabinet(k, {
    w,
    h,
    d,
    mat,
    open,
    y0,
    inside: (k, w2, h2) => {
      k.at([0, y0, 0.006], undefined, () => {
        scba(k, sx, h2)
        if (sets === 2) {
          // spare cylinder standing in a cradle with a strap
          const xc = w2 / 2 - 0.16
          k.box('stainless', [0.18, 0.02, 0.12], [xc, 0.016, 0.1])
          cylinder(k, xc, 0.026, 0.1)
          k.torus(STRAP, 0.08, 0.006, [xc, 0.3, 0.1], 'y', 6, 32)
          k.box('stainless', [0.18, 0.03, 0.006], [xc, 0.3, 0.003])
        }
      })
    },
    face: (k, w2, h2) => {
      if (sign) {
        const sw = Math.min(w2 - 0.12, 0.4)
        k.add(safetySign('ba', SAFETY.blue, ['BREATHING', 'APPARATUS'], respiratorPictogram, true), new THREE.PlaneGeometry(sw, sw / 2), mat4([0, h2 * 0.18, 0.0008]))
      }
      tagPlate(k, tag, [0, -h2 * 0.32, 0.0008], 'z', 0.1)
    },
  })
}
