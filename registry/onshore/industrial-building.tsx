// Portal-frame industrial building: steel frames, profiled cladding on a dado wall, duo-pitch roof, roller shutters, personnel doors, louvres, roof vents. EN 1993-1-1, EN 14509 / EN 508, EN 13241.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { member, tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { hazardStripeMaterial, louvreMaterial, signMaterial, textMaterial } from '../lib/textures'
import { anchorBolt, clamp, earthBond, profiledSheet } from './_onshore'

export interface IndustrialBuildingProps {
  kind?: 'warehouse' | 'workshop' | 'control'
  /** along X, m */
  length?: number
  /** span along Z, m */
  width?: number
  /** eaves height above floor, m */
  eaves?: number
  /** roof pitch, degrees */
  pitch?: number
  /** roller shutters on the +Z wall */
  rollerDoors?: number
  personnelDoors?: number
  /** roller shutters, 0 closed … 1 open */
  doorOpen?: number
  cladding?: string
  tag?: string
}

export const defaults = { kind: 'workshop' as 'warehouse' | 'workshop' | 'control', length: 30, width: 18, eaves: 7, pitch: 6, rollerDoors: 2, personnelDoors: 2, doorOpen: 0.6, cladding: '#9fb0b6', tag: '' }

const FFL = 0.15
const DADO = 1.2

export function IndustrialBuilding(props: IndustrialBuildingProps & GroupProps) {
  const { kind, length, width, eaves, pitch, rollerDoors, personnelDoors, doorOpen, cladding, tag, ...group } = { ...defaults, ...props }
  const p = { kind, length, width, eaves, pitch, rollerDoors, personnelDoors, doorOpen, cladding, tag }
  const data = useKit((k) => build(k, p), [kind, length, width, eaves, pitch, rollerDoors, personnelDoors, doorOpen, cladding, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default IndustrialBuilding

type Opening = { x0: number; x1: number; top: number; kind: 'roller' | 'door' | 'window' }

function build(k: Kit, p: typeof defaults) {
  const L = clamp(p.length, 6, 120)
  const W = clamp(p.width, 6, 40)
  const H = clamp(p.eaves, 3, 15)
  const pit = (clamp(p.pitch, 3, 20) * Math.PI) / 180
  const rise = (W / 2) * Math.tan(pit)
  const ctrl = p.kind === 'control'
  const clad = paint(p.cladding, { metalness: 0.35, roughness: 0.45, clearcoat: 0.3 })
  const roofM = paint('#8d9599', { metalness: 0.45, roughness: 0.4, clearcoat: 0.2 })
  const trim = paint('#3e4a52', { metalness: 0.3, roughness: 0.5 })
  const yE = FFL + H
  const yR = yE + rise
  // slab, dado wall, ramp aprons
  k.box('concrete', [L + 0.8, FFL, W + 0.8], [0, FFL / 2, 0])
  // portal frames
  const bays = Math.max(1, Math.round(L / 6))
  const bay = L / bays
  const sec = W <= 15 ? 'IPE 330' : W <= 25 ? 'IPE 450' : 'IPE 600'
  const d = W <= 15 ? 0.33 : W <= 25 ? 0.45 : 0.6
  const zc = W / 2 - 0.12 - d / 2
  for (let i = 0; i <= bays; i++) {
    const x = -L / 2 + 0.15 + (i * (L - 0.3)) / bays
    for (const s of [-1, 1]) {
      member(k, [x, FFL + 0.03, s * zc], [x, yE - 0.1, s * zc], sec, 'structSteel', [0, 0, s])
      k.box('structSteel', [0.35, 0.03, d + 0.15], [x, FFL + 0.015, s * zc])
      for (const a of [-1, 1]) for (const b of [-1, 1]) anchorBolt(k, [x + a * 0.12, FFL + 0.03, s * zc + b * (d / 2 + 0.03)], 0.02)
      member(k, [x, yE - 0.1, s * zc], [x, yR - 0.2, 0], sec, 'structSteel', [0, 1, 0])
      // eaves haunch
      member(k, [x, yE - 0.9, s * (zc - d / 2)], [x, yE - 0.25, s * (zc - 1.8)], 'IPE 200', 'structSteel', [0, 1, 0])
    }
  }
  // purlins and eaves beams
  const slopeL = W / 2 / Math.cos(pit)
  for (const s of [-1, 1]) for (let t = 0.2; t < slopeL - 0.2; t += 1.6) {
    const z = s * (W / 2 - t * Math.cos(pit) - 0.1)
    const y = yE + t * Math.sin(pit) - 0.08
    member(k, [-L / 2 + 0.05, y, z], [L / 2 - 0.05, y, z], 'UPN 160', 'galvanised', [0, Math.cos(pit), s * Math.sin(pit)])
  }
  // openings in the +Z wall
  const opens: Opening[] = []
  const nR = ctrl ? 0 : clamp(Math.round(p.rollerDoors), 0, Math.max(0, Math.floor(L / 8)))
  const rw = clamp(W / 4, 3.5, 6)
  const rh = Math.min(H - 1, 5.5)
  for (let i = 0; i < nR; i++) {
    const xc = -L / 2 + (L * (i + 1)) / (nR + 1)
    opens.push({ x0: xc - rw / 2, x1: xc + rw / 2, top: FFL + rh, kind: 'roller' })
  }
  const nP = clamp(Math.round(p.personnelDoors), 0, 6)
  const free = (x: number, w: number) => !opens.some((o) => x + w / 2 > o.x0 - 0.6 && x - w / 2 < o.x1 + 0.6)
  const cands = [-L / 2 + 1.5, L / 2 - 1.5, ...Array.from({ length: bays }, (_, i) => -L / 2 + (i + 0.5) * bay)]
  for (let i = 0, placed = 0; i < cands.length && placed < nP; i++)
    if (free(cands[i], 1.1)) {
      opens.push({ x0: cands[i] - 0.55, x1: cands[i] + 0.55, top: FFL + 2.2, kind: 'door' })
      placed++
    }
  if (ctrl) for (let x = -L / 2 + 2.5; x < L / 2 - 2.5; x += 3) if (free(x, 1.6)) opens.push({ x0: x - 0.8, x1: x + 0.8, top: FFL + 2.4, kind: 'window' })
  opens.sort((a, b) => a.x0 - b.x0)
  // walls: dado blockwork to 1.2 m, profiled sheet above, cut round the openings on the front
  const tw = 0.2
  const wallZ = W / 2 - tw / 2
  const dado = (x0: number, x1: number, z: number) => k.box('concrete', [x1 - x0, DADO, tw], [(x0 + x1) / 2, FFL + DADO / 2, z])
  const sheet = (x0: number, x1: number, y0: number, y1: number, z: number, out: number) =>
    profiledSheet(k, clad, x1 - x0, y1 - y0, [x0, y0, z], [1, 0, 0], [0, 0, out], [0, 1, 0])
  let cur = -L / 2
  for (const o of opens) {
    if (o.x0 > cur + 0.01) {
      dado(cur, o.x0, wallZ)
      sheet(cur, o.x0, FFL + DADO, yE, W / 2, 1)
    }
    if (o.kind === 'window') {
      dado(o.x0, o.x1, wallZ)
      sheet(o.x0, o.x1, FFL + DADO, FFL + 1.25, W / 2, 1)
    }
    sheet(o.x0, o.x1, o.top, yE, W / 2, 1)
    cur = o.x1
  }
  dado(cur, L / 2, wallZ)
  sheet(cur, L / 2, FFL + DADO, yE, W / 2, 1)
  dado(-L / 2, L / 2, -wallZ)
  sheet(-L / 2, L / 2, FFL + DADO, yE, -W / 2, -1)
  for (const s of [-1, 1]) {
    k.box('concrete', [tw, DADO, W - 2 * tw], [s * (L / 2 - tw / 2), FFL + DADO / 2, 0])
    profiledSheet(k, clad, W, yE - FFL - DADO, [s * L / 2, FFL + DADO, s > 0 ? W / 2 : -W / 2], [0, 0, -s], [s, 0, 0], [0, 1, 0])
    // gable triangle
    const g = new THREE.Shape()
    g.moveTo(-W / 2, 0)
    g.lineTo(W / 2, 0)
    g.lineTo(0, rise)
    g.closePath()
    k.extrude(clad, g, 0.03, new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(s * L / 2 + (s > 0 ? 0.03 : 0), yE, 0))
    // corner and verge flashings
    for (const z of [-W / 2, W / 2]) k.box(trim, [0.1, yE - FFL - DADO, 0.1], [s * (L / 2 + 0.02), (yE + FFL + DADO) / 2, z])
  }
  k.box(trim, [L + 0.1, 0.06, tw + 0.06], [0, FFL + DADO + 0.03, wallZ])
  k.box(trim, [L + 0.1, 0.06, tw + 0.06], [0, FFL + DADO + 0.03, -wallZ])
  // roof slopes, ridge, gutters, downpipes, rooflights
  for (const s of [-1, 1]) {
    const o: V3 = [-L / 2 - 0.15, yE + 0.02, s * (W / 2 + 0.25)]
    const up = new THREE.Vector3(0, Math.sin(pit), -s * Math.cos(pit))
    const nrm = new THREE.Vector3(0, Math.cos(pit), s * Math.sin(pit))
    const len = slopeL + 0.25 / Math.cos(pit)
    profiledSheet(k, roofM, L + 0.3, len, o, [1, 0, 0], nrm.toArray() as V3, up.toArray() as V3, 0.33, 0.04)
    for (let i = 1; i < bays; i += 2) {
      const x = -L / 2 + (i + 0.5) * bay
      const c = new THREE.Vector3(x, 0, 0).add(new THREE.Vector3(...o).setX(x)).addScaledVector(up, len * 0.5).addScaledVector(nrm, 0.045)
      k.box(paint('#dfe6e3', { transparent: true, opacity: 0.75, metalness: 0, roughness: 0.3, clearcoat: 0 }), [1.0, 0.01, len * 0.6], c.toArray() as V3, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -s), up))
    }
    const gz = s * (W / 2 + 0.33)
    k.box(trim, [L + 0.3, 0.12, 0.16], [0, yE - 0.03, gz])
    for (const x of [-L / 2 + 0.3, L / 2 - 0.3]) {
      k.cyl(trim, 0.05, yE - 0.1, [x, (yE - 0.1) / 2 + 0.05, s * (W / 2 + 0.12)], 'y', 12)
      k.rod(trim, [x, yE - 0.1, s * (W / 2 + 0.12)], [x, yE - 0.05, gz], 0.05, 12)
      k.box('concrete', [0.35, 0.08, 0.35], [x, 0.04, s * (W / 2 + 0.2)])
    }
  }
  k.box(trim, [L + 0.3, 0.05, 0.5], [0, yR + 0.08, 0])
  // ridge ventilators every other bay
  for (let i = 0; i < bays; i += 2) {
    const x = -L / 2 + (i + 0.5) * bay
    const g = new THREE.BoxGeometry(1.6, 0.45, 0.7)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j), uv.getY(j) * 4)
    k.add(louvreMaterial('#9aa3a7'), g, new THREE.Matrix4().makeTranslation(x, yR + 0.33, 0))
    k.box(trim, [1.8, 0.05, 0.9], [x, yR + 0.58, 0])
  }
  // high-level louvres on the gables and the rear wall
  for (const s of [-1, 1]) {
    const lv = new THREE.PlaneGeometry(2.4, 1.0)
    const uv = lv.getAttribute('uv') as THREE.BufferAttribute
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j), uv.getY(j) * 6)
    k.add(louvreMaterial('#6e7b82'), lv, new THREE.Matrix4().compose(new THREE.Vector3(s * (L / 2 + 0.05), yE - 1.2, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (s * Math.PI) / 2), new THREE.Vector3(1, 1, 1)))
  }
  for (let x = -L / 2 + bay / 2; x < L / 2; x += bay * 2) {
    const lv = new THREE.PlaneGeometry(1.8, 0.8)
    const uv = lv.getAttribute('uv') as THREE.BufferAttribute
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j), uv.getY(j) * 5)
    k.add(louvreMaterial('#6e7b82'), lv, new THREE.Matrix4().compose(new THREE.Vector3(x, yE - 1.2, -W / 2 - 0.05), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1)))
  }
  // openings: roller shutters, personnel doors, windows
  for (const o of opens) {
    const w = o.x1 - o.x0
    const xc = (o.x0 + o.x1) / 2
    const z = W / 2
    if (o.kind === 'roller') {
      const h = o.top - FFL
      const curtain = h * (1 - clamp(p.doorOpen, 0, 1))
      if (curtain > 0.05) {
        const g = new THREE.BoxGeometry(w - 0.1, curtain, 0.03)
        const uv = g.getAttribute('uv') as THREE.BufferAttribute
        for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j), (uv.getY(j) * curtain) / 0.1)
        k.add(louvreMaterial('#b8bec0'), g, new THREE.Matrix4().makeTranslation(xc, o.top - curtain / 2, z + 0.06))
        k.box(trim, [w - 0.1, 0.06, 0.06], [xc, o.top - curtain, z + 0.06])
      }
      k.cyl(trim, 0.32, w + 0.2, [xc, o.top + 0.34, z + 0.33], 'x', 20)
      k.box(trim, [w + 0.2, 0.68, 0.02], [xc, o.top + 0.34, z + 0.01])
      k.rbox('motorPaint', [0.25, 0.3, 0.3], 0.03, [o.x1 + 0.25, o.top + 0.3, z + 0.3])
      k.rbox('stainless', [0.18, 0.25, 0.1], 0.01, [o.x1 + 0.5, FFL + 1.4, z + 0.06])
      for (const x of [o.x0, o.x1]) {
        k.box(trim, [0.1, h, 0.12], [x + (x === o.x0 ? -0.05 : 0.05), FFL + h / 2, z + 0.06])
        const jamb = new THREE.BoxGeometry(0.12, 1.2, 0.14)
        const uv = jamb.getAttribute('uv') as THREE.BufferAttribute
        for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j), uv.getY(j) * 4)
        k.add(hazardStripeMaterial(), jamb, new THREE.Matrix4().makeTranslation(x + (x === o.x0 ? -0.05 : 0.05), FFL + 0.6, z + 0.06))
        k.cyl(paint('#e5b114'), 0.1, 1.1, [x + (x === o.x0 ? -0.35 : 0.35), FFL + 0.55, z + 0.5], 'y', 16)
      }
      // ramp apron down to grade
      k.box('concrete', [w + 0.6, 0.15, 1.2], [xc, 0.075, W / 2 + 0.6 + 0.4], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.0))
      lamp(k, [o.x1 + 0.6, o.top + 0.6, z + 0.15])
    } else if (o.kind === 'door') {
      k.box(trim, [w, 2.2, 0.06], [xc, FFL + 1.1, z - 0.02])
      k.box(paint('#d5d9d3'), [w - 0.12, 2.1, 0.04], [xc, FFL + 1.05, z + 0.02])
      k.box('stainless', [0.14, 0.03, 0.05], [xc + w / 2 - 0.2, FFL + 1.05, z + 0.06])
      k.box(trim, [w + 0.6, 0.06, 0.9], [xc, FFL + 2.55, z + 0.45])
      k.plane(signMaterial('exit'), 0.4, 0.2, [xc, FFL + 2.35, z + 0.03])
      k.box('concrete', [w + 0.6, FFL, 1.0], [xc, FFL / 2, W / 2 + 0.4 + 0.5])
      lamp(k, [xc + w / 2 + 0.3, FFL + 2.5, z + 0.12])
    } else {
      k.box(trim, [w, o.top - FFL - 1.25, 0.08], [xc, (o.top + FFL + 1.25) / 2, z - 0.05])
      k.box('glass', [w - 0.1, o.top - FFL - 1.35, 0.02], [xc, (o.top + FFL + 1.25) / 2, z])
      k.box(trim, [w + 0.1, 0.05, 0.15], [xc, FFL + 1.25, z + 0.05])
    }
  }
  // workshop: overhead crane runway beams and bridge girder; control building: condenser units
  if (p.kind === 'workshop') {
    const yr = yE - 1.4
    for (const s of [-1, 1]) member(k, [-L / 2 + 0.3, yr, s * (zc - d / 2 - 0.25)], [L / 2 - 0.3, yr, s * (zc - d / 2 - 0.25)], 'HEB 300', 'structSteel', [0, 1, 0])
    member(k, [-L / 4, yr + 0.35, -(zc - d / 2 - 0.25)], [-L / 4, yr + 0.35, zc - d / 2 - 0.25], 'HEB 500', paint('#e5b114'), [0, 1, 0])
    k.rbox(paint('#e5b114'), [0.6, 0.5, 0.6], 0.04, [-L / 4, yr + 0.0, 0])
    k.rod('cable', [-L / 4, yr - 0.25, 0], [-L / 4, FFL + 2.2, 0], 0.012, 6)
    k.box('nut', [0.25, 0.3, 0.12], [-L / 4, FFL + 2.05, 0])
  }
  if (ctrl) for (let i = 0; i < 3; i++) {
    const x = -L / 2 + 3 + i * 2.2
    k.box('concrete', [1.6, 0.15, 1.0], [x, 0.075, -W / 2 - 1.0])
    k.rbox(paint('#d5d9d3'), [1.4, 1.1, 0.8], 0.04, [x, 0.7, -W / 2 - 1.0])
    k.cyl(paint('#3a3f44'), 0.42, 0.02, [x, 0.7, -W / 2 - 0.59], 'z', 28)
  }
  // lightning down-conductors and earth pits at the corners, signage
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box('copper', [0.025, yE - 0.3, 0.004], [sx * (L / 2 + 0.06), (yE + 0.3) / 2, sz * (W / 2 - 0.3)])
    earthBond(k, [sx * (L / 2 + 0.06), 0.45, sz * (W / 2 - 0.3)], [sx, 0, 0], 0, 0.35)
  }
  if (p.tag) {
    k.plane(textMaterial(p.tag, '#1f4e9a', '#ffffff'), 3.2, 0.6, [0, yE - 0.6, W / 2 + 0.05])
    tagPlate(k, p.tag, [L / 2 + 0.05, FFL + 1.6, W / 2 - 1], 'x', 0.3)
  }
}

function lamp(k: Kit, pos: V3) {
  k.rbox('aluminium', [0.35, 0.12, 0.25], 0.02, pos)
  k.box('lampLens', [0.3, 0.01, 0.2], [pos[0], pos[1] - 0.065, pos[2]])
}
