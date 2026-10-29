// Lifebuoy station: SOLAS lifebuoy with retro-reflective bands and grab line on a quick-release holder, buoyant lifeline, optional self-activating light and smoke signal, sign; on a post or rail bracket. SOLAS LSA Code 2.1, ISO 7010 / IMO.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { canvasMat, faceZ, mounted, polePlate, type Mount } from './_fg'

export interface LifeRingProps {
  mount?: Mount
  /** lifebuoy centre above the deck, m */
  height?: number
  /** man-overboard light and smoke signal on its own bracket */
  signal?: boolean
  /** platform or vessel name stencilled on the buoy */
  name?: string
  tag?: string
}

export const defaults = { mount: 'pole' as Mount, height: 1.3, signal: true, name: 'ALPHA PDQ', tag: 'LB-01' }

const ORANGE = paint('#f05a1a', { roughness: 0.6 })
const RETRO = paint('#e8ecef', { metalness: 0.4, roughness: 0.25 })
const LINE = paint('#e9b310', { roughness: 0.8 })
const RO = 0.365 // outside radius (OD 730 mm, SOLAS ≤ 800)
const RI = 0.22 // inside radius (ID 440 mm, SOLAS ≥ 400)

export function LifeRing(props: LifeRingProps & GroupProps) {
  const { mount, height, signal, name, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, mount, Math.max(0.9, height), signal, name, tag), [mount, height, signal, name, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default LifeRing

function nameMat(name: string) {
  return canvasMat(`lb-name-${name}`, 512, 64, (g) => {
    g.fillStyle = '#f05a1a'
    g.fillRect(0, 0, 512, 64)
    g.fillStyle = '#111'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = 'bold 40px Arial, sans-serif'
    g.fillText(name, 256, 34)
  })
}

function signMat() {
  return canvasMat('lb-sign', 256, 256, (g) => {
    g.fillStyle = '#237f52'
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = '#fff'
    g.lineWidth = 8
    g.strokeRect(10, 10, 236, 236)
    g.lineWidth = 26
    g.beginPath()
    g.arc(128, 112, 62, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#fff'
    g.font = 'bold 30px Arial, sans-serif'
    g.textAlign = 'center'
    g.fillText('LIFEBUOY', 128, 226)
  })
}

/** Lifebuoy in the XY plane facing +Z, centre at c. */
function buoy(k: Kit, c: V3, name: string) {
  const R = (RO + RI) / 2
  const r = (RO - RI) / 2
  k.torus(ORANGE, R, r, c, 'z', 16, 64)
  // four retro-reflective bands, 50 mm wide
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a)
    k.cyl(RETRO, r + 0.0025, 0.05, [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R, c[2]], q, 24, undefined, true)
  }
  // grab line in four festoons, seized at eight points
  const pts: V3[] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    const sag = 0.035 * Math.abs(Math.sin(a * 4))
    pts.push([c[0] + Math.cos(a) * (RO + sag), c[1] + Math.sin(a) * (RO + sag), c[2]])
  }
  k.spline(LINE, pts, 0.005, 6, 160)
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    k.torus(LINE, r + 0.003, 0.004, [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R, c[2]], [-Math.sin(a), Math.cos(a), 0], 4, 20)
  }
  // stencilled name on the top arc
  k.plane(nameMat(name), 0.2, 0.025, [c[0], c[1] + R, c[2] + r + 0.001])
}

function build(k: Kit, mount: Mount, h: number, signal: boolean, name: string, tag: string) {
  const zc = (RO - RI) / 2 + 0.03 // buoy centre plane out from the bracket face
  mounted(k, mount, h, [0.16, 0.5], () => {
    // holder: two hooks at the top and a quick-release strap at the bottom
    for (const s of [-1, 1]) {
      const x = s * 0.1
      k.box('stainless', [0.03, 0.03, 0.012], [x, 0.22, 0.006])
      k.tube('stainless', [[x, 0.22, 0.012], [x, 0.22, zc + 0.08], [x, 0.29, zc + 0.08]], 0.007, 8, 0.02)
    }
    k.box('stainless', [0.24, 0.03, 0.008], [0, 0.22, 0.004])
    k.box('stainless', [0.04, 0.03, 0.03], [0, -0.32, 0.015])
    k.tube('rubberBlack', [[0, -0.31, 0.03], [0, -0.32, zc + 0.08], [0, -0.26, zc + 0.08]], 0.008, 6, 0.03)
    k.box('stainless', [0.03, 0.02, 0.012], [0, -0.28, zc + 0.08])
    buoy(k, [0, 0, zc], name)
    // buoyant lifeline coiled in a bag below
    k.box('stainless', [0.16, 0.012, 0.16], [0, -0.42, 0.08])
    k.cyl(ORANGE, 0.07, 0.12, [0, -0.36, 0.09], 'y', 20)
    for (let i = 0; i < 4; i++) k.torus(LINE, 0.06, 0.006, [0, -0.33 + i * 0.012, 0.09], 'y', 6, 24)
    k.tube(LINE, [[0.04, -0.29, 0.1], [0.12, -0.2, zc], [RO * 0.7, -RO * 0.7 + 0.02, zc]], 0.005, 6, 0.04)
  }, h + 0.7)
  if (signal) {
    // light and smoke signal on a quick-release bracket beside the buoy, attached by its lanyard
    const x = RO + 0.16
    const y = h + 0.1
    const zf = mount === 'pole' ? 0 : 0.008
    if (mount === 'pole') k.box('stainless', [x + 0.04, 0.04, 0.012], [x / 2, h + 0.4, 0.04])
    k.box('stainless', [0.1, 0.36, 0.008], [x, y + 0.1, zf + 0.04])
    if (mount === 'pole') k.box('stainless', [0.012, 0.04, 0.04], [x, h + 0.4, 0.04])
    k.cyl(ORANGE, 0.05, 0.3, [x, y + 0.05, zf + 0.1], 'y', 24)
    k.cyl('castIron', 0.052, 0.05, [x, y - 0.11, zf + 0.1], 'y', 24)
    k.cyl('lampLens', 0.03, 0.05, [x, y + 0.225, zf + 0.1], 'y', 16)
    k.dome('lampLens', 0.03, [x, y + 0.25, zf + 0.1], 'y', Math.PI / 2, 0.6, 16)
    for (const yy of [y - 0.05, y + 0.15]) k.torus('stainless', 0.053, 0.004, [x, yy, zf + 0.1], 'y', 6, 24)
    k.tube(LINE, [[x - 0.05, y - 0.1, zf + 0.1], [x - 0.15, y - 0.15, zf + 0.1], [RO * 0.9, -RO * 0.3 + h, zc + 0.03]], 0.004, 6, 0.03)
  }
  // sign above and tag plate
  const zs = mount === 'pole' ? polePlate(k, h + 0.52, 0.12, 0.2) + 0.012 : 0.008
  if (mount === 'pole') for (const sy of [-1, 1]) k.cyl('stainless', 0.008, 0.012, [0, h + 0.52 + sy * 0.06, zs - 0.006], 'z', 8)
  k.box('stainless', [0.26, 0.26, 0.004], [0, h + 0.52, zs + 0.002])
  k.plane(signMat(), 0.25, 0.25, [0, h + 0.52, zs + 0.0045])
  tagPlate(k, tag, [0, h - 0.15, faceZ(mount) + 0.001], 'z', 0.09)
}
