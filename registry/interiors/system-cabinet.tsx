// Row of DCS / SIS / F&G system, marshalling or server cabinets: 2000 mm frames on 100 mm plinths, glazed or perforated doors, interior equipment, cable entry. IEC 61439, IEC 60297.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, type Built } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { louvreMaterial } from '../lib/textures'
import { furnitureMats } from './_furniture'
import { labelMaterial, perforatedMaterial } from './_textures'

export type CabinetSystem = 'dcs' | 'sis' | 'fg' | 'marshalling' | 'server'

export interface SystemCabinetProps {
  /** cabinets in the row */
  count?: number
  system?: CabinetSystem
  /** cabinet width, m */
  width?: number
  /** cabinet depth, m */
  depth?: number
  /** frame height without plinth, m */
  height?: number
  door?: 'glazed' | 'perforated' | 'solid'
  /** front doors, 0 closed … 1 open */
  open?: number
  /** rear doors (front-and-rear access) */
  rearDoors?: boolean
  /** cables rising from a raised floor through the bottom gland plates */
  cableEntry?: boolean
  tag?: string
}

export const defaults = {
  count: 4,
  system: 'dcs' as CabinetSystem,
  width: 0.8,
  depth: 0.8,
  height: 2.0,
  door: 'glazed' as 'glazed' | 'perforated' | 'solid',
  open: 0,
  rearDoors: true,
  cableEntry: true,
  tag: 'SC-101',
}

type P = Omit<typeof defaults, 'open'>
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const PLINTH = 0.1

export function SystemCabinet(props: SystemCabinetProps & GroupProps) {
  const { count, system, width, depth, height, door, open, rearDoors, cableEntry, tag, ...group } = { ...defaults, ...props }
  const b = useMemo(() => build({ count, system, width, depth, height, door, rearDoors, cableEntry, tag }), [count, system, width, depth, height, door, rearDoors, cableEntry, tag])
  useEffect(() => () => [b.built, ...b.leaves].forEach((x) => x.geometry.dispose()), [b])
  const a = clamp(open, 0, 1) * 1.75
  return (
    <group {...group}>
      <KitMesh data={b.built} />
      {b.hinges.map((x, i) => (
        <group key={i} position={[x, PLINTH, b.zDoor]} rotation={[0, a, 0]}>
          <KitMesh data={b.leaves[i]} />
        </group>
      ))}
    </group>
  )
}

export default SystemCabinet

function build(p: P) {
  const k = new Kit()
  const M = furnitureMats()
  const n = clamp(Math.round(p.count), 1, 12)
  const w = clamp(p.width, 0.6, 1.2)
  const d = clamp(p.depth, 0.4, 1.2)
  const h = clamp(p.height, 1.2, 2.4)
  const L = n * w
  const body = paint('#d5d6d0', { metalness: 0.25, roughness: 0.45, clearcoat: 0.2, weather: 0 }) // RAL 7035
  const plinth = paint('#1d1f21', { metalness: 0.2, roughness: 0.6, clearcoat: 0, weather: 0 })
  const mount = paint('#b9bec2', { metalness: 0.7, roughness: 0.4, clearcoat: 0, weather: 0 }) // zinc-plated mounting plate
  const y0 = PLINTH
  const y1 = PLINTH + h
  const zDoor = d / 2 + 0.02

  // plinths with trim panels, frames, roof plates with cable-entry brush, side panels at the row ends, baying
  k.box(plinth, [L, PLINTH, d - 0.02], [0, PLINTH / 2, 0])
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * w
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) k.box(body, [0.035, h, 0.035], [x + sx * (w / 2 - 0.0175), y0 + h / 2, sz * (d / 2 - 0.0175)])
    k.box(body, [w - 0.004, 0.012, d], [x, y1 - 0.006, 0])
    k.box('rubberBlack', [w * 0.5, 0.004, 0.15], [x, y1 + 0.002, -d / 2 + 0.15])
    k.box(body, [w - 0.07, 0.04, 0.03], [x, y1 - 0.03, d / 2 - 0.035])
    // interior: zinc mounting plate / 19" rails, equipment by system
    k.box(mount, [w - 0.1, h - 0.15, 0.003], [x, y0 + (h - 0.15) / 2 + 0.05, -d / 2 + 0.12])
    interior(k, p.system, x, y0, w, h, d, i)
    // cabinet light
    k.box(M.led, [w * 0.5, 0.01, 0.02], [x, y1 - 0.06, d / 2 - 0.12])
    if (p.rearDoors) rearDoor(k, x, y0, w, h, d, body)
    else k.box(body, [w - 0.004, h, 0.015], [x, y0 + h / 2, -d / 2 + 0.0075])
    if (p.cableEntry) {
      // bottom gland plate and cables rising to the trunking
      k.box(plinth, [w - 0.1, 0.004, d * 0.4], [x, y0 + 0.002, -d / 2 + d * 0.25])
      for (let c = 0; c < 6; c++) {
        const cx = x - w * 0.3 + c * w * 0.1
        k.spline('cable', [[cx, -0.1, -d / 2 + 0.2], [cx, y0 + 0.05, -d / 2 + 0.2], [cx + 0.01, y0 + 0.25, -d / 2 + 0.16], [cx, y0 + 0.45, -d / 2 + 0.15]], 0.009, 6, 16)
      }
    }
  }
  for (const s of [-1, 1]) {
    k.box(body, [0.015, h, d], [s * (L / 2 + 0.0075), y0 + h / 2, 0])
    k.plane(louvreMaterial('#d5d6d0'), d * 0.5, 0.25, [s * (L / 2 + 0.0155), y1 - 0.3, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (s * Math.PI) / 2))
  }
  tagPlate(k, p.tag, [-L / 2 - 0.016, y1 - 0.12, d / 4], '-x', 0.15)

  // front door leaf, hinged on the right (opens to the right), outer face on z = 0 of the leaf frame
  const leaves = Array.from({ length: n }, (_, i) => leafBuilt(w, h, p.door, body, `${p.tag}-${String(i + 1).padStart(2, '0')}`, p.system))
  const hinges = Array.from({ length: n }, (_, i) => -L / 2 + (i + 1) * w - 0.003)
  return { built: k.build(), leaves, hinges, zDoor }
}

function leafBuilt(w: number, h: number, door: P['door'], body: THREE.Material, label: string, sys: CabinetSystem): Built {
  const k = new Kit()
  const M = furnitureMats()
  const lw = w - 0.01
  const t = 0.02
  const X = (x: number) => -x
  const fr = 0.06
  const piece = (a: number, b: number, ya: number, yb: number) => k.box(body, [b - a, yb - ya, t], [X((a + b) / 2), (ya + yb) / 2, -t / 2])
  if (door === 'solid') piece(0, lw, 0.005, h - 0.005)
  else {
    piece(0, lw, 0.005, fr)
    piece(0, lw, h - fr - 0.06, h - 0.005)
    piece(0, fr, fr, h - fr - 0.06)
    piece(lw - fr, lw, fr, h - fr - 0.06)
    const gw = lw - 2 * fr
    const gh = h - 2 * fr - 0.06
    if (door === 'glazed') k.box('glass', [gw, gh, 0.004], [X(lw / 2), fr + gh / 2, -t / 2])
    else {
      const g = new THREE.PlaneGeometry(gw, gh)
      const uv = g.getAttribute('uv') as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * gw) / 0.05, (uv.getY(i) * gh) / 0.05)
      k.add(perforatedMaterial('#cfd0ca'), g, new THREE.Matrix4().makeTranslation(X(lw / 2), fr + gh / 2, -t / 2))
    }
  }
  // label strip and status lamps on the top rail
  k.plane(labelMaterial(label, '#f1f1ed', '#111111', 512, 96), Math.min(0.3, lw * 0.45), 0.05, [X(lw / 2), h - 0.055, 0.0005])
  if (sys === 'sis' || sys === 'fg') {
    k.cyl(M.ledGreen, 0.012, 0.012, [X(lw * 0.15), h - 0.055, 0.006], 'z', 14)
    k.cyl(sys === 'sis' ? M.ledAmber : 'plasticGrey', 0.012, 0.012, [X(lw * 0.22), h - 0.055, 0.006], 'z', 14)
  }
  // swing handle with lock, hinge barrels, earth strap stud
  k.rbox(M.housing, [0.035, 0.2, 0.02], 0.006, [X(lw - 0.035), h * 0.52, 0.01])
  k.rbox(M.housing, [0.025, 0.13, 0.03], 0.006, [X(lw - 0.035), h * 0.52 - 0.02, 0.03])
  k.cyl('stainless', 0.008, 0.006, [X(lw - 0.035), h * 0.52 + 0.075, 0.023], 'z', 12)
  for (const y of [0.15, h / 2, h - 0.2]) k.cyl(M.housing, 0.008, 0.06, [0.0, y, -0.004], 'y', 10)
  k.cyl('brass', 0.005, 0.015, [X(0.03), 0.1, -t - 0.007], 'z', 8)
  return k.build()
}

function rearDoor(k: Kit, x: number, y0: number, w: number, h: number, d: number, body: THREE.Material) {
  const M = furnitureMats()
  k.box(body, [w - 0.01, h - 0.01, 0.02], [x, y0 + h / 2, -d / 2 - 0.01])
  const g = new THREE.PlaneGeometry(w * 0.7, 0.4)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w * 0.7) / 0.05, (uv.getY(i) * 0.4) / 0.05)
  for (const y of [y0 + 0.35, y0 + h - 0.35]) k.add(perforatedMaterial('#cfd0ca'), g.clone(), new THREE.Matrix4().makeRotationY(Math.PI).setPosition(x, y, -d / 2 - 0.0205))
  k.rbox(M.housing, [0.035, 0.2, 0.02], 0.006, [x - w / 2 + 0.05, y0 + h * 0.52, -d / 2 - 0.03])
}

/** Equipment behind the door, against the mounting plate (z = -d/2 + 0.12). */
function interior(k: Kit, sys: CabinetSystem, x: number, y0: number, w: number, h: number, d: number, i: number) {
  const M = furnitureMats()
  const zp = -d / 2 + 0.122
  const iw = w - 0.16
  const duct = paint('#9fa4a6', { metalness: 0, roughness: 0.7, clearcoat: 0, weather: 0 })
  if (sys === 'server') {
    // 19" rails, 42U of servers, switches and a patch panel
    const U = 0.04445
    for (const s of [-1, 1]) k.box(M.housing, [0.02, h - 0.1, 0.02], [x + s * 0.24, y0 + h / 2, d / 2 - 0.13])
    let y = y0 + 0.1
    let j = 0
    while (y + 2 * U < y0 + h - 0.12) {
      const u = j % 5 === 0 ? 1 : 2
      const blank = (j + i) % 7 === 3
      k.box(blank ? M.housing : M.bezel, [0.482, u * U - 0.002, d - 0.3], [x, y + (u * U) / 2, -0.03])
      if (!blank) {
        k.box(j % 5 === 0 ? 'plasticGrey' : M.housing, [0.44, u * U * 0.6, 0.002], [x, y + (u * U) / 2, d / 2 - 0.179])
        for (let l = 0; l < 3; l++) k.box(l === 2 && (i + j) % 6 === 0 ? M.ledAmber : M.ledGreen, [0.005, 0.004, 0.002], [x - 0.2 + l * 0.012, y + (u * U) / 2, d / 2 - 0.178])
      }
      y += u * U
      j++
    }
    return
  }
  // trunking frame on the mounting plate
  const ductW = 0.06
  for (const s of [-1, 1]) k.box(duct, [ductW, h - 0.2, 0.08], [x + s * (iw / 2 - ductW / 2), y0 + h / 2, zp + 0.04])
  const rows = sys === 'marshalling' ? 7 : 5
  const pitch = (h - 0.35) / rows
  for (let r = 0; r <= rows; r++) k.box(duct, [iw - 2 * ductW, ductW * 0.8, 0.08], [x, y0 + 0.15 + r * pitch, zp + 0.04])
  for (let r = 0; r < rows; r++) {
    const yc = y0 + 0.15 + (r + 0.5) * pitch
    k.box('galvanised', [iw - 2 * ductW - 0.02, 0.035, 0.008], [x, yc, zp + 0.004])
    const top = rows - 1 - r
    const modules = sys === 'marshalling' ? false : top < 2
    if (modules) {
      // controller / I-O carriers: modules with status LEDs
      const nm = Math.floor((iw - 2 * ductW - 0.04) / 0.045)
      for (let m = 0; m < nm; m++) {
        const mx = x - (iw - 2 * ductW) / 2 + 0.03 + m * 0.045
        const col = sys === 'sis' ? paint('#c9a227', { weather: 0 }) : sys === 'fg' ? paint('#b9332a', { weather: 0 }) : M.bezel
        k.box(m === 0 ? M.housing : col, [0.042, pitch * 0.62, 0.13], [mx, yc, zp + 0.07])
        k.box(m % 5 === 2 && r === rows - 1 ? M.ledAmber : M.ledGreen, [0.006, 0.006, 0.002], [mx, yc + pitch * 0.25, zp + 0.136])
        k.box(M.ledGreen, [0.006, 0.006, 0.002], [mx, yc + pitch * 0.2, zp + 0.136])
      }
    } else {
      // terminal rows (grey, orange for intrinsically safe / blue for IS on marshalling)
      const nt = Math.floor((iw - 2 * ductW - 0.04) / 0.0062)
      const tc = r % 3 === 1 && sys === 'marshalling' ? paint('#3d6fb6', { weather: 0 }) : paint('#9a9da0', { weather: 0 })
      k.box(tc, [nt * 0.0062, pitch * 0.45, 0.045], [x, yc, zp + 0.03])
      for (let t = 0; t < nt; t += 4) k.box(M.housing, [0.0015, pitch * 0.45, 0.002], [x - (nt * 0.0062) / 2 + t * 0.0062, yc, zp + 0.054])
      if (r === 0) {
        // power supplies at the bottom
        for (let s = 0; s < 3; s++) k.box('plasticGrey', [0.09, pitch * 0.75, 0.12], [x - 0.15 + s * 0.15, yc, zp + 0.065])
      }
    }
  }
}
