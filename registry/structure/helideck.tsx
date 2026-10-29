// Offshore helideck after CAP 437: 1D octagonal aluminium deck with perimeter, TD/PM circle, H, D-value and mass markings, safety netting, perimeter and circle lighting, steel grillage on braced CHS legs.
import * as THREE from 'three'
import { eul, mat4, uvScale, type Kit } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { meshGuardMaterial, textMaterial } from '../lib/textures'
import { landing, stairLength, stairRun } from './_access'
import { bar, basePlate, beamTOS, gratingBay, gusset, railRun, sec } from './_steel'

export interface HelideckProps {
  /** D-value of the largest helicopter (overall length, rotors turning), m */
  dValue?: number
  /** top of the landing surface above y = 0, m */
  height?: number
  /** maximum allowable mass, tonnes */
  maxMass?: number
  installation?: string
  netting?: boolean
  lights?: boolean
  /** two stair access routes on ±Z */
  access?: boolean
}

export const defaults = {
  dValue: 20.88, // Sikorsky S-92
  height: 4.5,
  maxMass: 12.8,
  installation: 'ALPHA',
  netting: true,
  lights: true,
  access: true,
}

type P = typeof defaults

export function Helideck(props: HelideckProps & GroupProps) {
  const { dValue, height, maxMass, installation, netting, lights, access, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { dValue, height, maxMass, installation, netting, lights, access }), [dValue, height, maxMass, installation, netting, lights, access])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Helideck

const COS = Math.cos(Math.PI / 8)
const ACCESS_W = 1.2
// flat on the deck, text reading along -Z with its top towards -X (read from the obstacle-free sector side)
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))

function build(k: Kit, p: P) {
  const D = Math.max(12, p.dValue)
  const H = Math.max(1.5, p.height)
  const ri = D / 2 // inscribed radius: the deck contains a 1D circle
  const rc = ri / COS
  const deckT = 0.13 // extruded aluminium planks
  const ytop = H
  const deckCol = '#3d4743'
  const deck = paint(deckCol, { roughness: 0.85, clearcoat: 0, metalness: 0.1, weather: 1 })
  const white = paint('#eeeeea', { roughness: 0.7, clearcoat: 0, weather: 0.6 })
  const yellow = paint('#e8b81a', { roughness: 0.7, clearcoat: 0, weather: 0.6 })
  const vtx = (r: number, i: number): [number, number] => [Math.cos(Math.PI / 8 + (i * Math.PI) / 4) * r, Math.sin(Math.PI / 8 + (i * Math.PI) / 4) * r]
  const flat = (geo: THREE.BufferGeometry, y: number, mat: THREE.Material) => k.add(mat, geo.rotateX(-Math.PI / 2), mat4([0, y, 0]))

  // ---- deck slab (octagon), plank seams, perimeter gutter
  const oct = new THREE.Shape()
  for (let i = 0; i < 8; i++) {
    const [x, z] = vtx(rc, i)
    if (i) oct.lineTo(x, z)
    else oct.moveTo(x, z)
  }
  oct.closePath()
  k.extrude(deck, oct, deckT, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, ytop, 0), 1)
  const seam = paint('#323a37', { roughness: 0.9, clearcoat: 0 })
  for (let z = -ri + 0.25; z < ri; z += 0.25 * 2) {
    const half = Math.min(ri, rc - Math.abs(z) * Math.tan(Math.PI / 8)) - 0.05
    const hw = Math.min(half, Math.sqrt(Math.max(0, rc * rc - z * z)))
    if (Math.abs(z) < ri - 0.1) k.box(seam, [2 * Math.min(hw, ri - 0.05) * 1, 0.001, 0.01], [0, ytop + 0.0005, z])
  }
  for (let i = 0; i < 8; i++) {
    const a = vtx(rc + 0.12, i)
    const b = vtx(rc + 0.12, i + 1)
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    k.box('aluminium', [len + 0.1, 0.12, 0.24], [(a[0] + b[0]) / 2, ytop - 0.08, (a[1] + b[1]) / 2], eul(0, -ang, 0))
  }

  // ---- markings: perimeter line, TD/PM circle, H, chevron, D-value, mass and name
  const yM = ytop + 0.0015
  flat(new THREE.RingGeometry(rc - 0.3 / COS, rc - 0.01, 8, 1, Math.PI / 8), yM, white)
  flat(new THREE.RingGeometry(D * 0.25, D * 0.25 + 1, 72), yM, yellow)
  // H: 4 m × 3 m, 0.75 m strokes, crossbar along the obstacle-free sector bisector (+X)
  for (const s of [-1, 1]) k.box(white, [0.75, 0.003, 4], [s * (1.5 - 0.375), yM, 0])
  k.box(white, [1.5, 0.003, 0.75], [0, yM, 0])
  // OFS chevron (black/white) at the +X edge
  const chev = paint('#151515', { roughness: 0.7, clearcoat: 0 })
  for (const s of [-1, 1]) k.box(chev, [1.5, 0.004, 0.25], [ri - 0.75, yM + 0.0005, s * 0.5], eul(0, s * Math.PI / 4, 0))
  const dTxt = textMaterial(D.toFixed(0), deckCol, '#eeeeea', 256, 128)
  for (const i of [2, 4, 6]) {
    const a = Math.PI / 8 + (i * Math.PI) / 4 + Math.PI / 8
    const r = ri - 0.95
    k.plane(dTxt, 1.6, 0.8, [Math.cos(a) * r, yM, Math.sin(a) * r], FLAT)
  }
  const mTxt = textMaterial(`${p.maxMass.toFixed(1)} t`, deckCol, '#eeeeea', 256, 128)
  k.plane(mTxt, 2.4, 1.2, [-(D * 0.25 + 2.4), yM, 0], FLAT)
  for (const [w, h, x] of [[2.6, 0.08, 0.66], [2.6, 0.08, -0.66]] as const) k.box(white, [h, 0.003, w], [-(D * 0.25 + 2.4) + x, yM, 0])
  for (const zz of [-1.3, 1.3]) k.box(white, [1.4, 0.003, 0.08], [-(D * 0.25 + 2.4), yM, zz])
  if (p.installation) {
    const nTxt = textMaterial(p.installation.toUpperCase(), deckCol, '#eeeeea', 768, 128)
    k.plane(nTxt, Math.min(6, D * 0.3), 1.0, [D * 0.25 + 1.9, yM, 0], FLAT)
  }

  // ---- lights: green perimeter lights (≤ 3 m), yellow TD/PM circle lights, green H lights
  if (p.lights) {
    const green = paint('#43f08a', { emissive: '#1fd067', emissiveIntensity: 1.4, clearcoat: 0.6, roughness: 0.2, weather: 0 })
    const amber = paint('#ffd84a', { emissive: '#ffc21a', emissiveIntensity: 1.2, clearcoat: 0.6, roughness: 0.2, weather: 0 })
    for (let i = 0; i < 8; i++) {
      const a = vtx(rc + 0.12, i)
      const b = vtx(rc + 0.12, i + 1)
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3)
      for (let j = 0; j < n; j++) {
        const t = j / n
        const x = a[0] + (b[0] - a[0]) * t
        const z = a[1] + (b[1] - a[1]) * t
        k.cyl('castIron', 0.07, 0.05, [x, ytop - 0.005, z], 'y', 12)
        k.cyl(green, 0.05, 0.05, [x, ytop + 0.04, z], 'y', 12)
      }
    }
    for (let j = 0; j < 16; j++) {
      const a = (j / 16) * Math.PI * 2
      const r = D * 0.25 + 0.5
      k.cyl(amber, 0.09, 0.012, [Math.cos(a) * r, ytop + 0.006, Math.sin(a) * r], 'y', 12)
    }
  }

  // ---- safety netting: 1.5 m wide, rising outboard but < 0.25 m above deck level
  if (p.netting) {
    const net = meshGuardMaterial('#2f342f')
    // net rises outboard but its outer edge stays at deck level (CAP 437 / ICAO 2012 new builds)
    const y0 = ytop - 0.27
    const y1 = ytop - 0.01
    const r0 = rc + 0.24
    const r1 = rc + 0.24 + 1.5 / COS
    const quad = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([a[0], y0, a[1], b[0], y0, b[1], c[0], y1, c[1], d[0], y1, d[1]], 3))
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
      g.setIndex([0, 2, 1, 0, 3, 2])
      g.computeVertexNormals()
      uvScale(g, L * 3, 1.5 * 3)
      k.add(net, g)
      k.rod('aluminium', [d[0], y1, d[1]], [c[0], y1, c[1]], 0.025, 8)
      k.rod('aluminium', [a[0], y0, a[1]], [b[0], y0, b[1]], 0.025, 8)
      const n = Math.ceil(L / 2)
      const sIn = (rc - 0.2) / r0 // same bracket line on the edge beam
      for (let j = 0; j <= n; j++) {
        const t = j / n
        const ix = a[0] + (b[0] - a[0]) * t
        const iz = a[1] + (b[1] - a[1]) * t
        k.rod('aluminium', [ix, y0 - 0.01, iz], [d[0] + (c[0] - d[0]) * t, y1, d[1] + (c[1] - d[1]) * t], 0.022, 8)
        // outrigger arm from the edge beam web out to the inner net rail
        k.rod('galvanised', [ix * sIn, ytop - deckT - 0.15, iz * sIn], [ix, y0, iz], 0.03, 8)
      }
    }
    const at = (r: number, i: number, x: number): [number, number] => {
      const [ax, az] = vtx(r, i)
      const [bx, bz] = vtx(r, i + 1)
      const t = (ax - x) / (ax - bx)
      return [ax + (bx - ax) * t, az + (bz - az) * t]
    }
    for (let i = 0; i < 8; i++) {
      if (p.access && (i === 1 || i === 5)) {
        const g = i === 1 ? ACCESS_W / 2 : -ACCESS_W / 2
        quad(vtx(r0, i), at(r0, i, g), at(r1, i, g), vtx(r1, i))
        quad(at(r0, i, -g), vtx(r0, i + 1), vtx(r1, i + 1), at(r1, i, -g))
      } else quad(vtx(r0, i), vtx(r0, i + 1), vtx(r1, i + 1), vtx(r1, i))
    }
  }

  // ---- tie-down points: flush rings on a 1.5 m grid inside 0.84D
  const ring = paint('#1d2120', { roughness: 0.6, clearcoat: 0 })
  for (let x = -ri; x <= ri; x += 1.5)
    for (let z = -ri; z <= ri; z += 1.5) {
      const r = Math.hypot(x, z)
      if (r > D * 0.42 || (Math.abs(x) < 1.9 && Math.abs(z) < 2.4)) continue
      k.cyl(ring, 0.09, 0.002, [x + 0.75, ytop + 0.001, z + 0.75], 'y', 12)
    }

  // ---- two access routes (±Z): grating link across the net band, landing and stair down to y = 0
  if (p.access)
    for (const rot of [0, Math.PI])
      k.with(new THREE.Matrix4().makeRotationY(rot), () => {
        const sw = 1.0
        const sb = sec('UPN 200').b
        const zc = ri + 0.24 + 1.65 + sw / 2 + sb
        const run = stairLength(H, 35, 1.0)
        k.at([-ACCESS_W / 2 - run, 0, zc], undefined, () => stairRun(k, H, { width: sw, angle: 35, landingLength: 1.0 }))
        landing(k, -ACCESS_W / 2, ACCESS_W / 2 + 0.2, zc - sw / 2 - sb, zc + sw / 2 + sb, H, { rails: [false, true, false, true], post: 'SHS 150x150x8' })
        const z0 = ri + 0.24
        const z1 = zc - sw / 2 - sb
        gratingBay(k, -ACCESS_W / 2, z0, ACCESS_W / 2, z1, H, 'z')
        for (const s of [-1, 1]) {
          beamTOS(k, s * (ACCESS_W / 2 - 0.04), z0, s * (ACCESS_W / 2 - 0.04), z1, H - 0.03, 'UPN 160')
          railRun(k, [s * (ACCESS_W / 2 - 0.03), H, z0], [s * (ACCESS_W / 2 - 0.03), H, z1], { endPost: s > 0 })
        }
      })

  // ---- steel grillage under the deck: primaries on the leg lines, secondaries, octagonal edge beams
  const P = 'HEB 500'
  const S = 'IPE 300'
  const Ps = sec(P)
  const tos = ytop - deckT
  const a = Math.round(D * 0.27 * 2) / 2
  const halfAt = (z: number) => Math.min(rc, (rc * COS - Math.abs(z) * Math.sin(Math.PI / 8)) / COS) // octagon half-width at z
  for (const s of [-1, 1]) {
    const h = halfAt(s * a) - 0.15
    beamTOS(k, -h, s * a, h, s * a, tos, P)
    beamTOS(k, s * a, -h, s * a, h, tos, P)
  }
  for (let z = -ri + 0.9; z < ri - 0.5; z += 1.6) {
    if (Math.abs(Math.abs(z) - a) < 0.4) continue
    const h = halfAt(z) - 0.15
    beamTOS(k, -h, z, h, z, tos, S)
  }
  for (let i = 0; i < 8; i++) {
    const [ax, az] = vtx(rc - 0.12, i)
    const [bx, bz] = vtx(rc - 0.12, i + 1)
    beamTOS(k, ax, az, bx, bz, tos, 'UPN 300')
  }

  // ---- legs: CHS columns on base plates, cap plates, X-bracing, knee struts to the cantilevers
  const legR = 0.2032 // CHS 406.4
  const yb = tos - Ps.d
  const legs: [number, number][] = [[-a, -a], [a, -a], [a, a], [-a, a]]
  for (const [x, z] of legs) {
    const t = basePlate(k, x, 0, z, 0.75, 0.75, 0.04, 0.03, 'structSteel')
    bar(k, [x, t, z], [x, yb - 0.03, z], 'CHS 406.4x16')
    k.box('structSteel', [0.6, 0.03, 0.6], [x, yb - 0.015, z])
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      gusset(k, [x + dx * legR, t, z + dz * legR], [dx, 0, dz], [0, 1, 0], 0.13, 0.35, 0.02)
      gusset(k, [x + dx * legR, yb - 0.03, z + dz * legR], [dx, 0, dz], [0, -1, 0], 0.18, 0.45, 0.02)
    }
    // knee struts to the primary girder ends (cantilevers)
    const ex = Math.sign(x) * (halfAt(z) - 0.6)
    const ez = Math.sign(z) * (halfAt(x) - 0.6)
    const yk = Math.max(0.5, yb - Math.min(3.5, H * 0.6))
    bar(k, [x + Math.sign(x) * legR, yk, z], [ex, yb - 0.05, z], 'CHS 219.1x10')
    bar(k, [x, yk, z + Math.sign(z) * legR], [x, yb - 0.05, ez], 'CHS 219.1x10')
  }
  if (yb > 2.5) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i]
      const [bx, bz] = legs[(i + 1) % 4]
      const ya = 0.4
      const yc = yb - 0.4
      const ins = (x0: number, x1: number) => x0 + Math.sign(x1 - x0) * legR
      bar(k, [ins(ax, bx), ya, ins(az, bz)], [ins(bx, ax), yc, ins(bz, az)], 'CHS 219.1x10')
      bar(k, [ins(bx, ax), ya, ins(bz, az)], [ins(ax, bx), yc, ins(az, bz)], 'CHS 219.1x10')
    }
  }
}
