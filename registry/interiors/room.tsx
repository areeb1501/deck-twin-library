// Walk-through room shell: lined walls with real door and window openings, raised access floor, suspended ceiling with LED panels and diffusers, cutaway view. ISO 11064-3, EN 12825.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, eul, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import Door, { doorOpening, type DoorKind } from './door'
import Window, { windowOpening } from './window'
import { furnitureMats } from './_furniture'
import { ceilingMaterial, diffuserMaterial, exitSignMaterial, ledPanelMaterial, liningMaterial, raisedFloorMaterial, carpetMaterial } from './_textures'
import { wallWithHoles, type Hole } from './_wall'

export type WallSide = '+z' | '-z' | '+x' | '-x'

/** Door in a wall: `offset` runs along the wall, left to right seen from outside; leaves swing outwards. */
export interface RoomDoor {
  wall: WallSide
  offset?: number
  kind?: DoorKind
  width?: number
  height?: number
  open?: number
  hand?: 'left' | 'right'
  hardware?: 'lever' | 'panic'
  tag?: string
}
export interface RoomWindow {
  wall: WallSide
  offset?: number
  width?: number
  height?: number
  sill?: number
  kind?: 'fixed' | 'blast'
  panes?: number
  sunshade?: boolean
}

export interface RoomProps {
  /** clear inside width along X, m */
  width?: number
  /** clear inside depth along Z, m */
  depth?: number
  /** finished floor to ceiling, m */
  height?: number
  wallThickness?: number
  /** raised access floor; the slab is y = 0 and the finished floor is at `floorHeight` */
  raisedFloor?: boolean
  floorHeight?: number
  /** suspended ceiling with LED panels, diffusers, detectors */
  ceiling?: boolean
  /** ladder tray in the ceiling void */
  cableTray?: boolean
  /** leave out the ceiling and the +Z wall so you can look in */
  cutaway?: boolean
  doors?: RoomDoor[]
  windows?: RoomWindow[]
  fireRating?: 'A60' | 'H120' | 'none'
  label?: string
  tag?: string
}

export const defaults = {
  width: 8,
  depth: 6,
  height: 3,
  wallThickness: 0.15,
  raisedFloor: true,
  floorHeight: 0.3,
  ceiling: true,
  cableTray: true,
  cutaway: true,
  doors: [
    { wall: '-x', offset: 1.4, kind: 'single', open: 0.5, hardware: 'panic' },
    { wall: '+x', offset: -1.2, kind: 'double', open: 0 },
  ] as RoomDoor[],
  windows: [{ wall: '-z', offset: 1.6, width: 1.8, height: 0.9, sill: 1.0 }] as RoomWindow[],
  fireRating: 'A60' as 'A60' | 'H120' | 'none',
  label: 'CENTRAL CONTROL ROOM',
  tag: 'B-300',
}

const PLENUM = 0.6
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

type P = typeof defaults

/** Wall frames: centre-line origin, rotation so local +Z points out of the room, length, which spans the corners. */
function walls(W: number, D: number, T: number) {
  const mk = (id: WallSide, rotY: number, pos: V3, len: number) => ({ id, rotY, pos, len, m: new THREE.Matrix4().makeRotationY(rotY).setPosition(...pos) })
  return [mk('+z', 0, [0, 0, D / 2 + T / 2], W + 2 * T), mk('-z', Math.PI, [0, 0, -D / 2 - T / 2], W + 2 * T), mk('+x', Math.PI / 2, [W / 2 + T / 2, 0, 0], D), mk('-x', -Math.PI / 2, [-W / 2 - T / 2, 0, 0], D)]
}

export function Room(props: RoomProps & GroupProps) {
  const { width, depth, height, wallThickness, raisedFloor, floorHeight, ceiling, cableTray, cutaway, doors, windows, fireRating, label, tag, ...group } = { ...defaults, ...props }
  const doorsKey = JSON.stringify(doors)
  const winKey = JSON.stringify(windows)
  const p: P = { width, depth, height, wallThickness, raisedFloor, floorHeight, ceiling, cableTray, cutaway, doors, windows, fireRating, label, tag }
  const b = useMemo(() => build(p), [width, depth, height, wallThickness, raisedFloor, floorHeight, ceiling, cableTray, cutaway, doorsKey, winKey, fireRating, label, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => b.built.geometry.dispose(), [b])
  return (
    <group {...group}>
      <KitMesh data={b.built} />
      {b.doors.map((d, i) => (
        <Door key={`d${i}`} {...d.props} wall="none" wallThickness={b.T} sign="room" label={label} fireRating={fireRating} position={d.pos} rotation={[0, d.rotY, 0]} />
      ))}
      {b.windows.map((w, i) => (
        <Window key={`w${i}`} {...w.props} wall="none" wallThickness={b.T} fireRating={fireRating} position={w.pos} rotation={[0, w.rotY, 0]} />
      ))}
    </group>
  )
}

export default Room

function build(p: P) {
  const k = new Kit()
  const M = furnitureMats()
  const W = clamp(p.width, 2, 40)
  const D = clamp(p.depth, 2, 30)
  const T = clamp(p.wallThickness, 0.06, 0.4)
  const FH = p.raisedFloor ? clamp(p.floorHeight, 0.1, 1.2) : 0
  const CH = FH + clamp(p.height, 2.3, 6)
  const top = CH + PLENUM
  const ws = walls(W, D, T)
  const skirt = paint('#3a3d40', { metalness: 0, roughness: 0.7, clearcoat: 0, weather: 0 })
  const doors: { props: Omit<RoomDoor, 'wall' | 'offset'>; pos: V3; rotY: number }[] = []
  const wins: { props: Omit<RoomWindow, 'wall' | 'offset'>; pos: V3; rotY: number }[] = []

  for (const w of ws) {
    if (p.cutaway && w.id === '+z') continue
    const holes: Hole[] = []
    const inner: { u: number; hw: number; top: number; door: boolean; hand: number }[] = []
    for (const d of p.doors.filter((x) => x.wall === w.id)) {
      const o = doorOpening(d)
      const u = clamp(d.offset ?? 0, -w.len / 2 + o.holeW / 2 + 0.05, w.len / 2 - o.holeW / 2 - 0.05)
      holes.push({ u, w: o.holeW, y0: FH, y1: FH + o.holeH })
      inner.push({ u, hw: o.holeW, top: FH + (d.kind === 'roller-shutter' ? o.H : o.holeH), door: true, hand: d.hand === 'right' ? -1 : 1 })
      doors.push({ props: strip(d), pos: new THREE.Vector3(u, FH, 0).applyMatrix4(w.m).toArray() as V3, rotY: w.rotY })
    }
    for (const win of p.windows.filter((x) => x.wall === w.id)) {
      const o = windowOpening(win)
      const u = clamp(win.offset ?? 0, -w.len / 2 + o.holeW / 2 + 0.05, w.len / 2 - o.holeW / 2 - 0.05)
      holes.push({ u, w: o.holeW, y0: FH + o.y0, y1: FH + o.y1 })
      wins.push({ props: strip(win), pos: new THREE.Vector3(u, FH, 0).applyMatrix4(w.m).toArray() as V3, rotY: w.rotY })
    }
    k.with(w.m, () => {
      wallWithHoles(k, w.len, top, T, holes, liningMaterial())
      // cove skirting on the inside face, broken at door openings
      const zi = -T / 2 - 0.006
      const cuts = holes.filter((h) => h.y0 <= FH + 0.01).sort((a, b) => a.u - b.u)
      const inL = w.id === '+z' || w.id === '-z' ? W : D
      let cur = -inL / 2
      for (const h of [...cuts, { u: inL / 2 + 1, w: 0, y0: 0, y1: 0 }]) {
        const a = cur
        const b = Math.min(inL / 2, h.u - h.w / 2)
        if (b - a > 0.02) k.box(skirt, [b - a, 0.1, 0.012], [(a + b) / 2, FH + 0.05, zi])
        cur = h.u + h.w / 2
      }
      // inside each door: maintained exit sign, manual call point, light switch, CO2 extinguisher
      for (const d of inner) {
        const back = eul(0, Math.PI, 0)
        k.rbox(M.housing, [0.42, 0.22, 0.03], 0.01, [d.u, d.top + 0.25, zi - 0.009])
        k.plane(exitSignMaterial(), 0.4, 0.2, [d.u, d.top + 0.25, zi - 0.0245], back)
        const lx = d.u + d.hand * (d.hw / 2 + 0.25)
        k.rbox('actuatorRed', [0.1, 0.1, 0.05], 0.01, [lx, FH + 1.4, zi - 0.019])
        k.box('glass', [0.06, 0.06, 0.004], [lx, FH + 1.4, zi - 0.045])
        k.rbox('plasticGrey', [0.08, 0.08, 0.015], 0.006, [lx, FH + 1.05, zi - 0.0015])
        const ex = d.u - d.hand * (d.hw / 2 + 0.35)
        const co2 = paint('#1c1e20', { roughness: 0.4, weather: 0 })
        k.box(M.housing, [0.14, 0.05, 0.05], [ex, FH + 1.0, zi - 0.019])
        k.cyl(co2, 0.075, 0.6, [ex, FH + 0.62, zi - 0.1], 'y', 18)
        k.dome(co2, 0.075, [ex, FH + 0.92, zi - 0.1], 'y', Math.PI / 2, 0.5, 16)
        k.cyl('actuatorRed', 0.012, 0.12, [ex, FH + 1.0, zi - 0.1], 'y', 8)
        k.rod('rubberBlack', [ex + 0.03, FH + 0.98, zi - 0.1], [ex + 0.12, FH + 0.6, zi - 0.13], 0.012, 8)
      }
    })
  }
  // outside: room tag on the -X end
  tagPlate(k, p.tag, [-W / 2 - T - 0.001, FH + 2.6, -D / 2 + 0.6], '-x', 0.3)

  // floor: raised access floor tiles on pedestals (void visible at the cut), or carpet tiles on the slab
  if (p.raisedFloor) {
    const g = new THREE.BoxGeometry(W, 0.03, D)
    remapTop(g, W, D, 0.6)
    k.add(raisedFloorMaterial(), g, new THREE.Matrix4().makeTranslation(0, FH - 0.015, 0))
    // pedestals and stringers along the front rows; a few cable bundles in the void
    const rows = p.cutaway ? 3 : 1
    for (let r = 0; r < rows; r++) {
      const z = D / 2 - 0.3 - r * 0.6
      for (let x = -W / 2 + 0.6; x < W / 2 - 0.01; x += 0.6) {
        k.box('galvanised', [0.1, 0.004, 0.1], [x, 0.002, z])
        k.cyl('galvanised', 0.012, FH - 0.04, [x, (FH - 0.04) / 2, z], 'y', 8)
        k.box('galvanised', [0.08, 0.008, 0.08], [x, FH - 0.034, z])
      }
      k.box('galvanised', [W, 0.025, 0.02], [0, FH - 0.0425, z])
    }
    k.box('aluminium', [W, 0.035, 0.012], [0, FH - 0.0175, D / 2 + 0.006])
    for (let c = 0; c < 6; c++) {
      const z = D / 2 - 0.9 - (c % 3) * 0.08
      k.rod('cable', [-W / 2, 0.05 + Math.floor(c / 3) * 0.05, z], [W / 2, 0.05 + Math.floor(c / 3) * 0.05, z], 0.022, 8)
    }
    // perforated supply tiles in front of where consoles go
    for (const x of [-1.2, 1.2]) k.box(paint('#6b7176', { weather: 0 }), [0.58, 0.002, 0.58], [x, FH + 0.001, 0.9])
  } else {
    const g = new THREE.BoxGeometry(W, 0.01, D)
    remapTop(g, W, D, 0.5)
    k.add(carpetMaterial(), g, new THREE.Matrix4().makeTranslation(0, 0.005, 0))
  }

  // suspended ceiling with LED panels, slot diffusers, smoke detectors, PA speakers, gas suppression nozzles
  if (p.ceiling && !p.cutaway) {
    const g = new THREE.BoxGeometry(W, 0.02, D)
    remapTop(g, W, D, 0.6)
    k.add(ceilingMaterial(), g, new THREE.Matrix4().makeTranslation(0, CH + 0.01, 0))
    const nx = Math.max(1, Math.round(W / 1.8))
    const nz = Math.max(1, Math.round(D / 1.8))
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = snap(-W / 2 + ((i + 0.5) * W) / nx)
        const z = snap(-D / 2 + ((j + 0.5) * D) / nz)
        k.box(M.alu, [0.6, 0.012, 0.6], [x, CH - 0.006, z])
        k.plane(ledPanelMaterial(), 0.57, 0.57, [x, CH - 0.0125, z], eul(Math.PI / 2, 0, 0))
      }
    for (let i = 0; i < Math.max(1, nx - 1); i++) {
      const x = snap(-W / 2 + ((i + 1) * W) / nx)
      for (const z of [-D / 4, D / 4]) k.plane(diffuserMaterial(), 1.2, 0.12, [x, CH - 0.002, snap(z)], eul(Math.PI / 2, 0, Math.PI / 2))
    }
    for (const [x, z] of [[-W / 4, 0], [W / 4, 0]] as const) {
      k.cyl('plasticGrey', 0.05, 0.04, [x, CH - 0.02, z + 0.3], 'y', 18)
      k.cyl(M.ledRed, 0.006, 0.004, [x + 0.03, CH - 0.042, z + 0.3], 'y', 8)
      k.cyl('plasticGrey', 0.09, 0.02, [x + 0.6, CH - 0.01, z - 0.3], 'y', 24)
      k.cyl('stainless', 0.02, 0.05, [x - 0.6, CH - 0.025, z], 'y', 10)
    }
  }
  // ceiling void: ladder tray on unistrut trapezes spanning the room (cut away with the ceiling)
  if (p.cableTray && !p.cutaway) {
    const yT = CH + 0.25
    const tw = 0.45
    const zc = -D / 2 + 0.6
    for (const s of [-1, 1]) k.box('cableTray', [W, 0.1, 0.006], [0, yT + 0.05, zc + (s * tw) / 2])
    for (let x = -W / 2 + 0.15; x < W / 2; x += 0.3) k.box('cableTray', [0.03, 0.02, tw], [x, yT + 0.01, zc])
    for (let x = -W / 2 + 1; x < W / 2; x += 1.5) {
      k.box('galvanised', [0.041, 0.041, D], [x, yT - 0.0205, 0])
    }
    for (let c = 0; c < 8; c++) k.rod('cable', [-W / 2, yT + 0.03 + (c % 2) * 0.03, zc - 0.17 + c * 0.045], [W / 2, yT + 0.03 + (c % 2) * 0.03, zc - 0.17 + c * 0.045], 0.014, 6)
  }
  return { built: k.build(), doors, windows: wins, T }
}

const strip = <T extends { wall: WallSide; offset?: number }>({ wall: _w, offset: _o, ...rest }: T) => rest
const snap = (v: number) => Math.round(v / 0.6 - 0.5) * 0.6 + 0.3

/** UVs on a flat box so the top face tiles at `module` metres. */
function remapTop(g: THREE.BufferGeometry, W: number, D: number, module: number) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / module, (pos.getZ(i) + D / 2) / module)
}
