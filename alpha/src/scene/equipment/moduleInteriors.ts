/**
 * What's inside an enclosed module, by `interior` type:
 *
 *   switchgear  — MV/LV switchboard line-up, free-standing MCC line-up, VSD cabinets, UPS +
 *                 battery racks, F&G / ESD panels, desk, overhead ladder trays, ceiling extract fan
 *   controlRoom — curved operator consoles (4 lit monitors each) with chairs, 3×2 video wall,
 *                 shift-supervisor desk, F&G mimic, telephone / radio rack, printer
 *   generator   — diesel generator set on an AV-mounted skid (V-engine, turbos, lagged exhaust
 *                 through the roof to a silencer, alternator + terminal box), radiator with a fan
 *                 blowing out through a wall louvre, day tank, start batteries, control /
 *                 synchronising panel, CO₂ bottles, supply fan
 *   pumpHouse   — firewater diesel driver on its skid, cardan shaft to a right-angle gear head over
 *                 the caisson floor penetration, radiator + fan, controller, day tank, batteries,
 *                 exhaust silencer on the roof, extract fan
 *
 * Layout is driven by the doors: every item's footprint is kept out of the clear zone inside each
 * door (moduleLayout.doorKeepOuts) and off the other items, so a person can always walk in.
 * Everything inside uses 'internal'-role materials (stays opaque in x-ray); fans are returned as
 * Spin specs and rendered as <Spinner>s by Module.tsx.
 */
import * as THREE from 'three'
import type { Module } from '../../model/types'
import { paint } from '../../three/materials'
import { Kit, eul, mat4, type Built, type V3 } from './machinery/kit'
import { couplingGuard } from './machinery/parts'
import { fanGuardMaterial } from './machinery/textures'
import { HF, WALL_T, freeAt, overlaps, wallFrame, wallMatrix, wallPoint, type DoorGeom, type Interior, type Rect, type WallId } from './moduleLayout'
import {
  fgPanelMaterial,
  genPanelMaterial,
  mccFrontMaterial,
  pumpCtrlMaterial,
  screenMaterial,
  swgFrontMaterial,
  upsFrontMaterial,
  vsdFrontMaterial,
  type ScreenKind,
} from './moduleTextures'

export interface Spin {
  pos: V3
  rot: V3
  r: number
  blades: number
  rpm: number
  dark?: boolean
}
export interface WallOpening {
  wall: WallId
  /** centre along the wall (wall-local x) */
  u: number
  w: number
  y0: number
  y1: number
}
export interface RoomCtx {
  eq: Module
  size: V3
  inner: Rect
  /** ceiling underside (or roof underside) y */
  CH: number
  hasCeiling: boolean
  doors: DoorGeom[]
  keep: Rect[]
}

// ------------------------------------------------------------------ materials (cached by paint())
let mats: ReturnType<typeof makeMats> | null = null
const M = () => (mats ??= makeMats())
const makeMats = () => ({
  cab: paint('#c9ccc7', 'internal', { metalness: 0.25, roughness: 0.5 }),
  cabDark: paint('#555b60', 'internal', { metalness: 0.3, roughness: 0.5 }),
  plinth: paint('#202224', 'internal', { roughness: 0.7 }),
  black: paint('#18191b', 'internal', { roughness: 0.55 }),
  chrome: paint('#c7cbce', 'internal', { metalness: 0.9, roughness: 0.25 }),
  steel: paint('#8f969b', 'internal', { metalness: 0.55, roughness: 0.45 }),
  rack: paint('#3d4a57', 'internal', { metalness: 0.4, roughness: 0.5 }),
  lampG: paint('#1c7a3a', 'internal', { emissive: '#3dff7a', emissiveIntensity: 2.4 }),
  lampR: paint('#8a1b14', 'internal', { emissive: '#ff3b2f', emissiveIntensity: 2.4 }),
  lampA: paint('#8a5a0a', 'internal', { emissive: '#ffb020', emissiveIntensity: 2.4 }),
  lampW: paint('#c8d4dc', 'internal', { emissive: '#e8f4ff', emissiveIntensity: 1.6 }),
  red: paint('#b8261c', 'internal', { roughness: 0.4, metalness: 0.2 }),
  engine: paint('#2f5874', 'internal', { metalness: 0.35, roughness: 0.42 }),
  engineDark: paint('#22313d', 'internal', { metalness: 0.4, roughness: 0.5 }),
  cast: paint('#41474d', 'internal', { metalness: 0.55, roughness: 0.55 }),
  skid: paint('#3a3f44', 'internal', { metalness: 0.3, roughness: 0.6 }),
  yellow: paint('#e1b10f', 'internal', { roughness: 0.4 }),
  lagging: paint('#cfd3d6', 'internal', { metalness: 0.85, roughness: 0.32 }),
  rubber: paint('#141516', 'internal', { roughness: 0.9 }),
  core: paint('#23272a', 'internal', { metalness: 0.5, roughness: 0.6 }),
  copper: paint('#b87333', 'internal', { metalness: 0.9, roughness: 0.3 }),
  tank: paint('#b7a24a', 'internal', { metalness: 0.2, roughness: 0.5 }),
  battery: paint('#2b2e33', 'internal', { roughness: 0.5 }),
  desk: paint('#d8d3c8', 'internal', { roughness: 0.45 }),
  deskDark: paint('#3a3e44', 'internal', { roughness: 0.5 }),
  fabric: paint('#25292e', 'internal', { roughness: 0.95 }),
  bezel: paint('#101113', 'internal', { roughness: 0.35, metalness: 0.2 }),
  white: paint('#e9eae6', 'internal', { roughness: 0.5 }),
  glass: paint('#9fb6c3', 'internal', { transparent: true, opacity: 0.3, roughness: 0.05 }),
  tray: paint('#a3a9ad', 'internal', { metalness: 0.75, roughness: 0.4 }),
  cable: paint('#1e1f21', 'internal', { roughness: 0.7 }),
})

// ------------------------------------------------------------------ placement
class Plan {
  placed: Rect[] = []
  readonly c: RoomCtx
  constructor(c: RoomCtx) {
    this.c = c
  }
  /** inside the room, off the door keep-outs (with margin) and off everything placed */
  ok(r: Rect, margin = 0) {
    const i = this.c.inner
    if (r.x0 < i.x0 - 0.01 || r.x1 > i.x1 + 0.01 || r.z0 < i.z0 - 0.01 || r.z1 > i.z1 + 0.01) return false
    const g = { x0: r.x0 - margin, x1: r.x1 + margin, z0: r.z0 - margin, z1: r.z1 + margin }
    return !this.c.keep.some((k) => overlaps(g, k)) && !this.placed.some((p) => overlaps(r, p))
  }
}

function rectOf(m: THREE.Matrix4, x0: number, x1: number, z0: number, z1: number): Rect {
  const r = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }
  const v = new THREE.Vector3()
  for (const x of [x0, x1])
    for (const z of [z0, z1]) {
      v.set(x, 0, z).applyMatrix4(m)
      r.x0 = Math.min(r.x0, v.x)
      r.x1 = Math.max(r.x1, v.x)
      r.z0 = Math.min(r.z0, v.z)
      r.z1 = Math.max(r.z1, v.z)
    }
  return r
}
const pt = (m: THREE.Matrix4, p: V3): V3 => new THREE.Vector3(...p).applyMatrix4(m).toArray() as V3

interface Unit {
  w: number
  d: number
  build: (k: Kit) => void
}

/** Row frame on the inner face of a wall: row x runs along the wall, +z into the room. */
function wallRowFrame(c: RoomCtx, id: WallId, gap = 0.03) {
  return wallMatrix(wallFrame(id, c.size)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -WALL_T - gap)).multiply(new THREE.Matrix4().makeRotationY(Math.PI))
}
/** half the inner length of a wall */
const halfIn = (c: RoomCtx, id: WallId) => (id === '+z' || id === '-z' ? (c.inner.x1 - c.inner.x0) / 2 : (c.inner.z1 - c.inner.z0) / 2)

/**
 * Place units side by side along a row (row-local x from `from` to `to`, backs on z = 0, fronts
 * +z). A unit that doesn't fit slides along until it does, or is dropped. Unit origin = centre of
 * its footprint at floor level (y = HF), front face at z = +d/2.
 */
function row(p: Plan, k: Kit, m: THREE.Matrix4, from: number, to: number, units: Unit[], gap = 0, margin = 0): THREE.Matrix4[] {
  let cur = from
  const out: THREE.Matrix4[] = []
  for (const u of units) {
    while (cur + u.w <= to + 1e-6) {
      const r = rectOf(m, cur, cur + u.w, 0, u.d)
      if (p.ok(r, margin)) {
        p.placed.push(r)
        const um = m.clone().multiply(mat4([cur + u.w / 2, HF, u.d / 2]))
        k.with(um, () => u.build(k))
        out.push(um)
        cur += u.w + gap
        break
      }
      cur += 0.1
    }
  }
  return out
}

/** Walls ranked for "put the big stuff here": fewest doors, then longest. */
function rankWalls(c: RoomCtx, exclude: WallId[] = []): WallId[] {
  const ids: WallId[] = ['+z', '-z', '+x', '-x']
  return ids
    .filter((i) => !exclude.includes(i))
    .sort((a, b) => c.doors.filter((d) => d.wall === a).length - c.doors.filter((d) => d.wall === b).length || halfIn(c, b) - halfIn(c, a))
}

/** Try a unit along each wall in turn (whole length), return its frame or null. */
function againstWalls(p: Plan, k: Kit, walls: WallId[], unit: Unit, prefer: 'start' | 'end' | 'mid' = 'start') {
  for (const id of walls) {
    const h = halfIn(p.c, id)
    const m = wallRowFrame(p.c, id)
    const starts = prefer === 'mid' ? [-unit.w / 2, -h] : prefer === 'end' ? [h - unit.w - 0.05] : [-h + 0.05]
    for (const s of starts) {
      const r = row(p, k, m, s, prefer === 'end' ? h : h - 0.05, [unit])
      if (r.length) return r[0]
    }
    if (prefer === 'end') {
      const r = row(p, k, m, -h + 0.05, h, [unit])
      if (r.length) return r[0]
    }
  }
  return null
}

// ------------------------------------------------------------------ small parts
function lamps(k: Kit, x: number, y: number, z: number, mats: THREE.Material[], dx = 0.05) {
  mats.forEach((m, i) => {
    k.cyl(m, 0.011, 0.016, [x + i * dx, y, z + 0.008], 'z', 12)
    k.cyl(M().chrome, 0.016, 0.006, [x + i * dx, y, z + 0.003], 'z', 12)
  })
}

/** Floor-standing cabinet: plinth, body, textured front, roof plate, handle. Front at z = d/2. */
function cabinet(k: Kit, w: number, d: number, h: number, front: THREE.Material) {
  const m = M()
  k.box(m.plinth, [w, 0.1, d - 0.03], [0, 0.05, 0])
  k.box(m.cab, [w - 0.004, h - 0.1, d], [0, 0.1 + (h - 0.1) / 2, 0])
  k.plane(front, w - 0.02, h - 0.14, [0, 0.12 + (h - 0.14) / 2, d / 2 + 0.002])
  k.box(m.cabDark, [w - 0.01, 0.012, d - 0.02], [0, h + 0.006, 0])
  k.box(m.black, [0.022, 0.16, 0.03], [w / 2 - 0.07, 0.1 + (h - 0.1) * 0.52, d / 2 + 0.016])
  for (const s of [-1, 1]) k.box(m.cabDark, [0.008, h - 0.1, 0.012], [s * (w / 2 - 0.004), 0.1 + (h - 0.1) / 2, d / 2 - 0.004])
}

const swgUnit = (i: number): Unit => ({
  w: 0.8,
  d: 1.0,
  build: (k) => {
    const m = M()
    cabinet(k, 0.8, 1.0, 2.2, swgFrontMaterial())
    lamps(k, -0.12, 1.8, 0.5, [i % 4 === 3 ? m.lampR : m.lampG, m.lampW, i % 5 === 2 ? m.lampA : m.lampG], 0.06)
    k.box(m.black, [0.3, 0.12, 0.05], [0, 1.18, 0.525]) // racking / trip unit
    k.cyl(m.red, 0.025, 0.03, [0.2, 1.18, 0.52], 'z', 12)
    k.cyl(m.lampG, 0.025, 0.03, [-0.2, 1.18, 0.52], 'z', 12)
    k.box(m.cabDark, [0.76, 0.1, 0.96], [0, 2.26, 0]) // busbar / arc-vent chamber
  },
})
const mccUnit = (i: number): Unit => ({
  w: 0.8,
  d: 0.6,
  build: (k) => {
    const m = M()
    cabinet(k, 0.8, 0.6, 2.2, mccFrontMaterial())
    const th = (2.06 * (704 - 60)) / 704 / 7
    for (let t = 0; t < 7; t++) {
      const y = 0.12 + 2.06 - (30 / 704) * 2.06 - (t + 0.5) * th
      k.cyl(m.black, 0.028, 0.03, [-0.255, y, 0.315], 'z', 14)
      k.box(m.black, [0.012, 0.07, 0.02], [-0.255, y, 0.335], eul(0, 0, (i + t) % 3 === 0 ? 0 : Math.PI / 2))
    }
  },
})
const vsdUnit: Unit = {
  w: 1.0,
  d: 0.6,
  build: (k) => {
    const m = M()
    cabinet(k, 1.0, 0.6, 2.2, vsdFrontMaterial())
    k.box(m.cab, [0.5, 0.18, 0.5], [0.2, 2.31, 0])
    k.disc(fanGuardMaterial(), 0.18, [0.2, 2.405, 0], 'y', 24)
    lamps(k, -0.38, 1.95, 0.3, [m.lampG, m.lampG, m.lampA], 0.05)
  },
}
const upsUnit: Unit = {
  w: 0.8,
  d: 0.8,
  build: (k) => {
    cabinet(k, 0.8, 0.8, 1.9, upsFrontMaterial())
    k.plane(screenMaterial('hmi'), 0.4, 0.16, [0, 1.58, 0.403])
  },
}
const fgUnit = (esd: boolean): Unit => ({
  w: 0.8,
  d: 0.6,
  build: (k) => {
    const m = M()
    cabinet(k, 0.8, 0.6, 2.1, fgPanelMaterial(esd))
    // live zone lamps over the painted grid
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) k.box((r * 5 + c) % 11 === 4 ? m.lampA : m.lampG, [0.022, 0.03, 0.006], [-0.26 + c * 0.131, 1.73 - r * 0.094, 0.305])
    if (esd) {
      k.box(m.yellow, [0.16, 0.16, 0.02], [0, 0.95, 0.31])
      k.cyl(m.red, 0.05, 0.05, [0, 0.95, 0.34], 'z', 20)
      k.cyl(m.lampR, 0.03, 0.02, [0.22, 0.95, 0.31], 'z', 12)
    }
  },
})
const batteryRack: Unit = {
  w: 1.4,
  d: 0.5,
  build: (k) => {
    const m = M()
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(m.rack, [0.04, 1.8, 0.04], [sx * 0.68, 0.9, sz * 0.23])
    for (const y of [0.12, 0.72, 1.32]) {
      k.box(m.rack, [1.4, 0.03, 0.5], [0, y, 0])
      for (let i = 0; i < 6; i++) {
        const x = -0.55 + i * 0.22
        k.box(m.battery, [0.18, 0.24, 0.36], [x, y + 0.135, 0])
        k.cyl(m.red, 0.012, 0.03, [x - 0.05, y + 0.27, 0.1], 'y', 8)
        k.cyl(m.black, 0.012, 0.03, [x + 0.05, y + 0.27, 0.1], 'y', 8)
        if (i < 5) k.box(m.copper, [0.14, 0.006, 0.02], [x + 0.11, y + 0.285, 0.1])
      }
    }
    k.box(m.white, [0.3, 0.12, 0.005], [0, 1.7, 0.255])
  },
}

/** Office chair facing +z at the origin. */
function chair(k: Kit, at: V3, rotY = 0) {
  const m = M()
  k.with(mat4(at, eul(0, rotY, 0)), () => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      k.rod(m.black, [0, 0.09, 0], [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], 0.015, 6)
      k.sphere(m.black, 0.028, [Math.cos(a) * 0.3, 0.028, Math.sin(a) * 0.3], undefined, 8)
    }
    k.cyl(m.chrome, 0.025, 0.36, [0, 0.27, 0], 'y', 12)
    k.rbox(m.fabric, [0.5, 0.08, 0.48], 0.03, [0, 0.48, 0.02])
    k.rbox(m.fabric, [0.47, 0.58, 0.07], 0.03, [0, 0.86, -0.25], eul(-0.12, 0, 0))
    k.box(m.black, [0.05, 0.25, 0.04], [0, 0.6, -0.23])
    for (const s of [-1, 1]) {
      k.box(m.black, [0.04, 0.2, 0.04], [s * 0.26, 0.6, 0.0])
      k.rbox(m.black, [0.06, 0.03, 0.26], 0.012, [s * 0.26, 0.7, 0.02])
    }
  })
}

/** Flat monitor on a stand, screen facing +z, base at the origin. */
function monitor(k: Kit, at: V3, rotY: number, kind: ScreenKind, w = 0.5, h = 0.31) {
  const m = M()
  k.with(mat4(at, eul(0, rotY, 0)), () => {
    k.box(m.bezel, [0.22, 0.012, 0.18], [0, 0.006, 0])
    k.box(m.bezel, [0.05, 0.16, 0.03], [0, 0.09, -0.04])
    k.box(m.bezel, [w, h, 0.03], [0, 0.12 + h / 2, -0.01])
    k.plane(screenMaterial(kind), w - 0.02, h - 0.02, [0, 0.12 + h / 2, 0.0055])
  })
}

/** Desk with a monitor, keyboard and a chair in front. Footprint w × 1.35 (desk at the back). */
const deskUnit = (w: number, screens: ScreenKind[]): Unit => ({
  w,
  d: 1.35,
  build: (k) => {
    const m = M()
    const zd = -1.35 / 2 + 0.375
    k.box(m.desk, [w, 0.035, 0.75], [0, 0.735, zd])
    for (const s of [-1, 1]) k.box(m.deskDark, [0.04, 0.72, 0.7], [s * (w / 2 - 0.03), 0.36, zd])
    k.box(m.deskDark, [w - 0.1, 0.4, 0.02], [0, 0.45, zd - 0.34])
    k.box(m.deskDark, [0.42, 0.6, 0.6], [w / 2 - 0.28, 0.3, zd])
    screens.forEach((s, i) => monitor(k, [(i - (screens.length - 1) / 2) * 0.55, 0.755, zd - 0.12], i === 0 && screens.length > 1 ? 0.15 : i === screens.length - 1 && screens.length > 1 ? -0.15 : 0, s))
    k.box(m.black, [0.44, 0.02, 0.14], [0, 0.76, zd + 0.18])
    k.rbox(m.black, [0.06, 0.025, 0.1], 0.01, [0.32, 0.76, zd + 0.18])
    k.rbox(m.deskDark, [0.2, 0.06, 0.18], 0.02, [-w / 2 + 0.2, 0.78, zd + 0.1])
    chair(k, [0, 0, zd + 0.75], Math.PI)
  },
})

/** Ladder cable tray between two points (horizontal) at y, with a cable bed and drop rods to the ceiling. */
function tray(k: Kit, a: V3, b: V3, wdt: number, ceil: number) {
  const m = M()
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const L = Math.hypot(dx, dz)
  if (L < 0.2) return
  const mid: V3 = [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2]
  k.with(mat4(mid, eul(0, Math.atan2(dx, dz), 0)), () => {
    for (const s of [-1, 1]) k.box(m.tray, [0.006, 0.08, L], [(s * wdt) / 2, 0, 0])
    for (let i = 0; i <= Math.floor(L / 0.3); i++) k.box(m.tray, [wdt, 0.012, 0.03], [0, -0.034, -L / 2 + i * 0.3])
    k.box(m.cable, [wdt * 0.85, 0.035, L], [0, -0.012, 0])
    for (let i = 0; i <= Math.floor(L / 1.5); i++) {
      const z = -L / 2 + 0.1 + i * 1.5
      for (const s of [-1, 1]) k.rod(m.tray, [(s * (wdt + 0.04)) / 2, -0.04, z], [(s * (wdt + 0.04)) / 2, ceil - a[1], z], 0.006, 5)
      k.box(m.tray, [wdt + 0.08, 0.02, 0.04], [0, -0.05, z])
    }
  })
}

/** Fan rotor about local +Y (hub + pitched blades), cached. */
const rotorCache = new Map<string, Built>()
export function fanRotor(r: number, blades: number, dark: boolean): Built {
  const key = `${r.toFixed(3)}|${blades}|${dark}`
  const hit = rotorCache.get(key)
  if (hit) return hit
  const k = new Kit()
  const mat = dark ? 'nut' : M().steel
  k.cyl(mat, r * 0.18, r * 0.25, [0, 0, 0], 'y', 16)
  k.dome(mat, r * 0.18, [0, r * 0.125, 0], 'y', Math.PI / 2, 0.6, 16)
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45))
    const len = r * 0.8
    const off = new THREE.Vector3(r * 0.15 + len / 2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), a)
    k.box(mat, [len, 0.006, r * 0.42], [off.x, 0, off.z], q)
  }
  const b = k.build()
  rotorCache.set(key, b)
  return b
}
/** Euler that turns the rotor's +Y onto a module axis */
const AXIS_ROT: Record<'x' | 'y' | 'z', V3> = { x: [0, 0, -Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] }

/**
 * Wall-mounted axial fan (supply / extract) through an opening at high level: square housing on
 * the inner face, guard, rotor (Spinner), and the opening (exterior louvre is added by the shell).
 * Reserves a floor strip under it so nothing tall is placed in front. Returns false if no room.
 */
function wallFan(p: Plan, k: Kit, walls: WallId[], spins: Spin[], openings: WallOpening[], r = 0.3): boolean {
  const c = p.c
  const y = Math.min(c.size[1] - 0.6 - r, c.CH - r - 0.15)
  if (y - r < HF + 1.9) return false
  for (const id of walls) {
    const w = wallFrame(id, c.size)
    const h = halfIn(c, id)
    for (const f of [0.55, -0.55, 0.2, -0.2]) {
      const u = h * f
      if (!freeAt(c.doors, w, u, r + 0.2)) continue
      if (openings.some((o) => o.wall === id && Math.abs(o.u - u) < o.w / 2 + r + 0.3)) continue
      const a = wallPoint(w, u - r - 0.1, 0, -WALL_T)
      const b = wallPoint(w, u + r + 0.1, 0, -WALL_T - 0.35)
      const rect = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]) }
      if (!p.ok(rect)) continue
      p.placed.push(rect)
      openings.push({ wall: id, u, w: 2 * r + 0.1, y0: y - r - 0.05, y1: y + r + 0.05 })
      const m = M()
      k.with(wallMatrix(w), () => {
        const s = 2 * r + 0.16
        const zc = -WALL_T - 0.12
        for (const t of [-1, 1]) {
          k.box(m.steel, [s, 0.03, 0.24], [u, y + (t * s) / 2, zc])
          k.box(m.steel, [0.03, s, 0.24], [u + (t * s) / 2, y, zc])
        }
        k.torus(m.steel, r + 0.01, 0.015, [u, y, -WALL_T - 0.03], 'z', 6, 32)
        k.disc(fanGuardMaterial(), r + 0.02, [u, y, -WALL_T - 0.245], '-z', 32)
        k.box(m.steel, [0.05, 0.05, 0.2], [u, y, -WALL_T - 0.12])
        k.rbox(m.cabDark, [0.16, 0.16, 0.12], 0.02, [u, y, -WALL_T - 0.2])
      })
      const pos = wallPoint(w, u, y, -WALL_T - 0.12)
      spins.push({ pos, rot: AXIS_ROT[id === '+x' || id === '-x' ? 'x' : 'z'], r: r - 0.02, blades: 6, rpm: 300 })
      return true
    }
  }
  return false
}

/** Exhaust from (x, yRoof, z) up through the roof to a horizontal silencer and a rain-capped tail pipe. */
function roofSilencer(kOut: Kit, c: RoomCtx, x: number, z: number, r: number, pipeR: number) {
  const [SX, SY] = c.size
  const dir = x > 0 ? -1 : 1
  const yS = SY + 0.25 + r
  const x0 = x + dir * (0.3 + pipeR)
  const L = Math.max(0.6, Math.min(r * 6, Math.abs(dir * (SX / 2 - 0.35) - x0) - pipeR * 3))
  const x1 = x0 + dir * L
  kOut.box('moduleCladding', [0.5, 0.06, 0.5], [x, SY + 0.02, z]) // roof penetration flashing
  kOut.cyl('stainless', pipeR + 0.05, 0.3, [x, SY + 0.15, z], 'y', 20)
  kOut.tube('insulation', [[x, SY - 0.1, z], [x, yS, z], [x0, yS, z]], pipeR, 16, pipeR * 2)
  kOut.cyl('insulation', r, Math.abs(L), [(x0 + x1) / 2, yS, z], 'x', 28)
  for (const xe of [x0, x1]) kOut.cyl('structSteelDark', r + 0.02, 0.04, [xe, yS, z], 'x', 28)
  for (const t of [0.2, 0.8]) {
    const xs = x0 + (x1 - x0) * t
    kOut.box('structSteelDark', [0.08, yS - SY, r * 1.4], [xs, SY + (yS - SY) / 2, z])
    kOut.box('structSteelDark', [0.2, 0.02, r * 1.6], [xs, SY + 0.01, z])
  }
  kOut.tube('insulation', [[x1, yS, z], [x1 + dir * (pipeR * 2.5), yS, z], [x1 + dir * (pipeR * 2.5), yS + 0.9, z]], pipeR * 0.9, 16, pipeR * 2)
  kOut.box('structSteelDark', [pipeR * 2.4, 0.01, pipeR * 2.4], [x1 + dir * (pipeR * 2.5), yS + 0.95, z], eul(0, 0, dir * 0.5)) // rain cap flap
}

// ------------------------------------------------------------------ switchgear
function switchgear(c: RoomCtx, k: Kit, spins: Spin[]) {
  const p = new Plan(c)
  const [wA, wB, wC] = rankWalls(c)
  const hA = halfIn(c, wA)
  // A: switchboard line-up on the best wall
  const nA = Math.max(1, Math.floor((2 * hA - 0.4) / 0.8))
  row(p, k, wallRowFrame(c, wA), -hA + 0.2, hA - 0.2, Array.from({ length: nA }, (_, i) => swgUnit(i)))
  // B: VSDs + UPS + batteries on the second wall, C: F&G / ESD + desk on the third
  const hB = halfIn(c, wB)
  row(p, k, wallRowFrame(c, wB), -hB + 0.1, hB - 0.1, [vsdUnit, vsdUnit, vsdUnit, upsUnit, upsUnit, batteryRack, batteryRack], 0.05)
  const hC = halfIn(c, wC)
  row(p, k, wallRowFrame(c, wC), -hC + 0.1, hC - 0.1, [fgUnit(false), fgUnit(false), fgUnit(true)], 0)
  againstWalls(p, k, [wC, ...rankWalls(c, [wC])], deskUnit(1.4, ['alarm']), 'end')
  // MCC line-up free-standing, parallel to A, facing away from it (rear access aisle 1.2 m)
  const fA = wallFrame(wA, c.size)
  const dist = WALL_T + 0.03 + 1.0 + 1.2
  let fan: V3 = [(c.inner.x0 + c.inner.x1) / 2 + 0.6, 0, (c.inner.z0 + c.inner.z1) / 2 + 0.6]
  const room = wA === '+z' || wA === '-z' ? c.inner.z1 - c.inner.z0 : c.inner.x1 - c.inner.x0
  if (room > 1.0 + 1.2 + 0.6 + 1.4) {
    const mm = wallMatrix(fA).multiply(new THREE.Matrix4().makeTranslation(0, 0, -dist)).multiply(new THREE.Matrix4().makeRotationY(Math.PI))
    const n = Math.floor((2 * hA - 2.0) / 0.8)
    row(p, k, mm, -hA + 1.0, hA - 1.0, Array.from({ length: n }, (_, i) => mccUnit(i)))
    // trays over both line-ups + a cross tray
    const yT = c.CH - 0.25
    const t0 = wallPoint(fA, -hA + 0.3, yT, -WALL_T - 0.5)
    const t1 = wallPoint(fA, hA - 0.3, yT, -WALL_T - 0.5)
    tray(k, t0, t1, 0.45, c.CH)
    tray(k, wallPoint(fA, -hA + 1.1, yT, -dist - 0.3), wallPoint(fA, hA - 1.1, yT, -dist - 0.3), 0.45, c.CH)
    tray(k, wallPoint(fA, 0, yT - 0.0, -WALL_T - 0.75), wallPoint(fA, 0, yT, -dist - 0.05), 0.3, c.CH)
    fan = wallPoint(fA, hA * 0.3, 0, -dist - 0.6 - Math.min(1.0, (room - 1.0 - 1.2 - 0.6 - WALL_T) / 2))
  }
  ceilingFan(c, k, spins, fan[0], fan[2])
}

/** Ceiling extract fan (grille + rotor) — sits between trays. */
function ceilingFan(c: RoomCtx, k: Kit, spins: Spin[], x: number, z: number) {
  const m = M()
  k.box(m.white, [0.7, 0.04, 0.7], [x, c.CH - 0.02, z])
  k.cyl(m.steel, 0.29, 0.12, [x, c.CH - 0.08, z], 'y', 32, undefined, true)
  k.disc(m.black, 0.29, [x, c.CH - 0.03, z], '-y', 28)
  k.disc(fanGuardMaterial(), 0.3, [x, c.CH - 0.145, z], '-y', 32)
  spins.push({ pos: [x, c.CH - 0.09, z], rot: [0, 0, 0], r: 0.26, blades: 5, rpm: 280 })
}

// ------------------------------------------------------------------ control room
function controlRoom(c: RoomCtx, k: Kit) {
  const p = new Plan(c)
  const m = M()
  const [wV, wS] = rankWalls(c)
  const hV = halfIn(c, wV)
  const fV = wallFrame(wV, c.size)
  // video wall: 3×2 lit panels on a frame + low credenza
  const vw = Math.min(3 * 1.24, 2 * hV - 1.0)
  const pw = vw / 3 - 0.02
  const ph = pw * 0.5625
  const videoWall: Unit = {
    w: vw + 0.2,
    d: 0.55,
    build: (kk) => {
      kk.box(m.deskDark, [vw + 0.2, 0.5, 0.5], [0, 0.25, 0])
      kk.box(m.desk, [vw + 0.24, 0.03, 0.54], [0, 0.515, 0])
      kk.box(m.black, [vw + 0.1, 2 * ph + 0.1, 0.08], [0, 0.95 + ph, -0.22])
      const kinds: ScreenKind[] = ['overview', 'mimic', 'cctv', 'trend', 'fgmap', 'alarm']
      for (let r = 0; r < 2; r++)
        for (let col = 0; col < 3; col++) {
          const x = (col - 1) * (pw + 0.02)
          const y = 1.0 + ph / 2 + (1 - r) * (ph + 0.02)
          kk.box(m.bezel, [pw + 0.012, ph + 0.012, 0.06], [x, y, -0.15])
          kk.plane(screenMaterial(kinds[r * 3 + col]), pw, ph, [x, y, -0.118])
        }
    },
  }
  row(p, k, wallRowFrame(c, wV), -(vw + 0.2) / 2, (vw + 0.2) / 2, [videoWall])
  // operator consoles facing the video wall
  const depthV = wV === '+z' || wV === '-z' ? c.inner.z1 - c.inner.z0 : c.inner.x1 - c.inner.x0
  const cd = 1.75
  const back = Math.min(3.2, depthV - cd - 1.4) // distance from the video wall to the console backs (chair side)
  const n = Math.max(1, Math.min(3, Math.floor((2 * hV - 0.6) / 2.4)))
  const cm = wallMatrix(fV).multiply(new THREE.Matrix4().makeTranslation(0, 0, -WALL_T - back))
  // row frame: backs on z = 0 (chair side), fronts (+z) towards the wall
  const units = Array.from({ length: n }, (_, i) => console4(i))
  const span = n * 2.3 + (n - 1) * 0.15
  const placed = row(p, k, cm, -span / 2, hV - 0.2, units, 0.15, 0.1)
  if (placed.length < n) row(p, k, cm, -hV + 0.2, hV - 0.2, units.slice(placed.length), 0.15, 0.1)
  // supervisor desk behind the consoles, F&G mimic + radio rack + printer on the remaining walls
  // row frame turned round: backs towards the consoles, the supervisor sits facing the video wall
  const sm = wallMatrix(fV).multiply(new THREE.Matrix4().makeTranslation(0, 0, -WALL_T - back - 0.6)).multiply(new THREE.Matrix4().makeRotationY(Math.PI))
  if (!row(p, k, sm, -hV + 0.3, hV - 0.3, [deskUnit(1.8, ['trend', 'alarm'])], 0, 0.05).length) againstWalls(p, k, rankWalls(c, [wV]), deskUnit(1.8, ['trend', 'alarm']), 'mid')
  const fgMimic: Unit = {
    w: 1.8,
    d: 0.25,
    build: (kk) => {
      kk.box(m.cabDark, [1.8, 1.1, 0.08], [0, 1.55, -0.08])
      kk.box(m.bezel, [1.7, 1.0, 0.04], [0, 1.55, -0.02])
      kk.plane(screenMaterial('fgmap'), 1.64, 0.94, [0, 1.55, 0.001])
      for (let i = 0; i < 6; i++) kk.cyl(i === 2 ? m.lampA : m.lampG, 0.018, 0.02, [-0.75 + i * 0.3, 0.93, 0.0], 'z', 10)
      kk.box(m.cab, [0.9, 0.9, 0.22], [0, 0.45, 0.01])
      kk.box(m.red, [0.2, 0.2, 0.04], [0.25, 0.75, 0.13])
    },
  }
  againstWalls(p, k, [wS, ...rankWalls(c, [wV, wS])], fgMimic, 'mid')
  const radioRack: Unit = {
    w: 0.62,
    d: 0.8,
    build: (kk) => {
      kk.box(m.black, [0.6, 2.0, 0.8], [0, 1.0, 0])
      for (let i = 0; i < 9; i++) {
        const y = 0.25 + i * 0.19
        kk.box(i % 3 === 0 ? m.cabDark : m.bezel, [0.48, 0.15, 0.02], [0, y, 0.39])
        kk.box(i % 4 === 1 ? m.lampA : m.lampG, [0.012, 0.012, 0.004], [-0.2, y + 0.04, 0.402])
        kk.box(m.lampG, [0.012, 0.012, 0.004], [-0.17, y + 0.04, 0.402])
      }
      kk.plane(m.glass, 0.52, 1.85, [0, 1.0, 0.405])
      kk.rbox(m.black, [0.22, 0.06, 0.1], 0.02, [0, 2.04, 0.2]) // desk radio handset on top
    },
  }
  const printer: Unit = {
    w: 0.7,
    d: 0.55,
    build: (kk) => {
      kk.box(m.deskDark, [0.7, 0.7, 0.55], [0, 0.35, 0])
      kk.rbox(m.white, [0.55, 0.35, 0.45], 0.03, [0, 0.875, 0])
      kk.box(m.black, [0.4, 0.02, 0.2], [0, 1.06, 0.05])
      kk.box(m.white, [0.3, 0.004, 0.22], [0, 0.92, 0.3])
      kk.box(m.lampG, [0.015, 0.015, 0.004], [0.2, 0.98, 0.226])
    },
  }
  const rest = rankWalls(c, [wV])
  againstWalls(p, k, rest, radioRack, 'end')
  againstWalls(p, k, rest, radioRack, 'end')
  againstWalls(p, k, rest, printer, 'start')
  // trays above the consoles (cable feeds to the desks) — none; HVAC diffusers are in the ceiling
}

/** Curved operator console with 4 monitors + chair. Row frame: chair at −z, monitors towards +z. */
const console4 = (i: number): Unit => ({
  w: 2.3,
  d: 1.75,
  build: (k) => {
    const m = M()
    const cz = -1.75 / 2 + 0.42
    const R1 = 0.55
    const R2 = 1.25
    const a0 = Math.PI / 2 - 1.05
    const a1 = Math.PI / 2 + 1.05
    const sector = (r1: number, r2: number) => {
      const s = new THREE.Shape()
      s.moveTo(Math.cos(a0) * r2, Math.sin(a0) * r2)
      s.absarc(0, 0, r2, a0, a1, false)
      s.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1)
      s.absarc(0, 0, r1, a1, a0, true)
      s.closePath()
      return s
    }
    // shape (sx, sy) → (x = sx, z = cz + sy); extrusion runs downwards from y
    const at = (y: number) => new THREE.Matrix4().makeTranslation(0, y, cz).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    k.extrude(m.desk, sector(R1, R2), 0.035, at(0.75), 32)
    k.extrude(m.black, sector(R1 - 0.03, R1), 0.05, at(0.755), 32)
    k.extrude(m.deskDark, sector(R2 - 0.3, R2 - 0.05), 0.715, at(0.715), 32)
    k.extrude(m.deskDark, sector(R2 - 0.12, R2 - 0.08), 0.25, at(1.0), 32) // monitor rail
    const kinds: ScreenKind[][] = [
      ['alarm', 'mimic', 'trend', 'cctv'],
      ['trend', 'overview', 'mimic', 'alarm'],
      ['fgmap', 'mimic', 'alarm', 'trend'],
    ]
    const ks = kinds[i % kinds.length]
    const step = 0.45
    for (let j = 0; j < 4; j++) {
      const ph = (j - 1.5) * step
      const R = 1.08
      monitor(k, [Math.sin(ph) * R, 0.75, cz + Math.cos(ph) * R], ph + Math.PI, ks[j], 0.5, 0.31)
    }
    k.box(m.black, [0.44, 0.02, 0.15], [0, 0.76, cz + 0.72])
    k.rbox(m.black, [0.06, 0.025, 0.1], 0.01, [0.3, 0.763, cz + 0.72])
    k.rbox(m.deskDark, [0.2, 0.06, 0.18], 0.02, [-0.62, 0.78, cz + 0.72], eul(0, 0.6, 0))
    k.box(m.red, [0.07, 0.02, 0.07], [0.55, 0.76, cz + 0.75]) // ESD push-button cover
    chair(k, [0, 0, cz + 0.05], 0)
  },
})

// ------------------------------------------------------------------ machinery rooms
interface MachineFrame {
  m: THREE.Matrix4
  end: WallId
  zc: number
}
/** Machine frame: origin on the floor at the inner face of the end wall without doors, +x into the room. */
function placeMachine(p: Plan, len: number, width: number): MachineFrame {
  const c = p.c
  const nDoors = (w: WallId) => c.doors.filter((d) => d.wall === w).length
  const ends: WallId[] = nDoors('-x') <= nDoors('+x') ? ['-x', '+x'] : ['+x', '-x']
  const zs = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.5, -1.5]
  const frame = (end: WallId, zc: number) => {
    const x = end === '-x' ? c.inner.x0 : c.inner.x1
    return new THREE.Matrix4().makeTranslation(x, HF, zc).multiply(new THREE.Matrix4().makeRotationY(end === '-x' ? 0 : Math.PI))
  }
  for (const margin of [0.2, 0])
    for (const end of ends)
      for (const zc of zs) {
        const m = frame(end, zc)
        const r = rectOf(m, 0, len, -width / 2, width / 2)
        if (p.ok(r, margin)) {
          p.placed.push(r)
          return { m, end, zc }
        }
      }
  if (import.meta.env.DEV) console.warn(`[module ${c.eq.tag}] machine (${len.toFixed(1)} m) does not fit clear of the doors`)
  const m = frame(ends[0], 0)
  p.placed.push(rectOf(m, 0, len, -width / 2, width / 2))
  return { m, end: ends[0], zc: 0 }
}

/** Radiator core + fan shroud against the end wall; returns the wall opening and the fan spec. */
function radiator(k: Kit, mf: MachineFrame, c: RoomCtx, x0: number, Wr: number, Hr: number, y0: number, Rf: number, spins: Spin[], openings: WallOpening[]) {
  const m = M()
  k.with(mf.m, () => {
    // duct sleeve to the wall
    for (const s of [-1, 1]) k.box(m.steel, [x0, Hr + 0.1, 0.02], [x0 / 2, y0 + Hr / 2, (s * (Wr + 0.08)) / 2])
    for (const y of [y0 - 0.04, y0 + Hr + 0.04]) k.box(m.steel, [x0, 0.02, Wr + 0.1], [x0 / 2, y, 0])
    // core + tanks + frame
    k.box(m.core, [0.22, Hr - 0.2, Wr - 0.1], [x0 + 0.11, y0 + Hr / 2, 0])
    for (let i = 0; i < Math.floor((Wr - 0.15) / 0.05); i++) k.box(m.steel, [0.226, Hr - 0.22, 0.004], [x0 + 0.11, y0 + Hr / 2, -Wr / 2 + 0.1 + i * 0.05])
    k.box(m.engine, [0.3, 0.12, Wr], [x0 + 0.11, y0 + Hr - 0.06, 0])
    k.box(m.engine, [0.3, 0.12, Wr], [x0 + 0.11, y0 + 0.06, 0])
    for (const s of [-1, 1]) k.box(m.engine, [0.3, Hr, 0.06], [x0 + 0.11, y0 + Hr / 2, (s * (Wr - 0.06)) / 2])
    k.cyl(m.chrome, 0.05, 0.08, [x0 + 0.11, y0 + Hr + 0.04, Wr * 0.3], 'y', 14)
    for (const s of [-1, 1]) k.box(m.skid, [0.12, y0, 0.12], [x0 + 0.11, y0 / 2, (s * (Wr - 0.2)) / 2])
    // fan shroud (square plate with a ring) on the engine side
    const xs = x0 + 0.22
    const yc = y0 + Hr / 2
    k.cyl(m.engine, Rf + 0.03, 0.28, [xs + 0.14, yc, 0], 'x', 40, undefined, true)
    k.torus(m.engine, Rf + 0.03, 0.02, [xs + 0.28, yc, 0], 'x', 6, 40)
    for (const s of [-1, 1]) {
      k.box(m.engine, [0.02, Hr - 0.1, (Wr - 2 * Rf - 0.06) / 2], [xs + 0.01, yc, s * (Rf + 0.03 + (Wr - 2 * Rf - 0.06) / 4)])
      k.box(m.engine, [0.02, (Hr - 2 * Rf - 0.06) / 2, 2 * Rf + 0.06], [xs + 0.01, yc + s * (Rf + 0.03 + (Hr - 2 * Rf - 0.06) / 4), 0])
    }
    k.disc(fanGuardMaterial(), Rf + 0.02, [xs + 0.285, yc, 0], 'x', 36)
  })
  spins.push({ pos: pt(mf.m, [x0 + 0.38, y0 + Hr / 2, 0]), rot: AXIS_ROT.x, r: Rf - 0.03, blades: 6, rpm: 320 })
  const w = wallFrame(mf.end, c.size)
  openings.push({ wall: mf.end, u: mf.zc * w.s, w: Wr + 0.1, y0: HF + y0 - 0.05, y1: HF + y0 + Hr + 0.05 })
}

function generator(c: RoomCtx, k: Kit, kOut: Kit, spins: Spin[], openings: WallOpening[]) {
  const p = new Plan(c)
  const m = M()
  const IX = c.inner.x1 - c.inner.x0
  const IZ = c.inner.z1 - c.inner.z0
  const s = Math.max(0.6, Math.min(1, (IX - 1.8) / 5.3))
  const Le = 2.4 * s
  const La = 1.45 * s
  const Wr = Math.min(1.9, IZ - 1.8) * Math.min(1, s + 0.1)
  const Hr = Math.min(1.9, c.size[1] - HF - 1.3)
  const xr = 0.12
  const xe0 = 0.95
  const xe1 = xe0 + Le
  const xa0 = xe1 + 0.25
  const xa1 = xa0 + La
  const len = xa1 + 0.15
  const mf = placeMachine(p, len, Math.max(Wr, 1.6))
  const yS = 0.25
  const yc = yS + 0.8
  const Rf = Math.min(0.78, Wr / 2 - 0.08, Hr / 2 - 0.08)
  radiator(k, mf, c, xr, Wr, Hr, 0.3, Rf, spins, openings)
  const exh: V3[] = []
  k.with(mf.m, () => {
    // skid (two I-beams + cross members), AV mounts
    for (const sz of [-1, 1]) {
      k.box(m.skid, [len - 0.6, 0.02, 0.18], [0.6 + (len - 0.6) / 2, yS - 0.04, sz * 0.55])
      k.box(m.skid, [len - 0.6, yS - 0.07, 0.02], [0.6 + (len - 0.6) / 2, (yS - 0.07) / 2 + 0.01, sz * 0.55])
      k.box(m.skid, [len - 0.6, 0.02, 0.18], [0.6 + (len - 0.6) / 2, 0.01, sz * 0.55])
    }
    for (let x = 0.7; x < len; x += 0.9) k.box(m.skid, [0.12, yS - 0.07, 1.1], [x, (yS - 0.07) / 2 + 0.01, 0])
    k.box(m.skid, [len - 0.6, 0.006, 1.2], [0.6 + (len - 0.6) / 2, 0.06, 0]) // drip tray
    for (const x of [xe0 + 0.3, xe1 - 0.3, xa0 + 0.3, xa1 - 0.3])
      for (const sz of [-1, 1]) {
        k.cyl(m.rubber, 0.07, 0.07, [x, yS + 0.035, sz * 0.5], 'y', 14)
        k.box(m.engineDark, [0.24, 0.03, 0.2], [x, yS + 0.085, sz * 0.5])
      }
    // engine: sump, crankcase, V banks with rocker covers, charge-air cooler in the V
    const xm = (xe0 + xe1) / 2
    k.rbox(m.engineDark, [Le * 0.85, 0.35, 0.72], 0.04, [xm, yS + 0.33, 0])
    k.rbox(m.engine, [Le, 0.62, 1.0], 0.05, [xm, yc, 0])
    for (const sz of [-1, 1]) {
      k.box(m.engineDark, [0.24, 0.3, 0.12], [xe0 + 0.3, yS + 0.25, sz * 0.5]) // engine feet
      k.box(m.engineDark, [0.24, 0.3, 0.12], [xe1 - 0.3, yS + 0.25, sz * 0.5])
      const q = eul(sz * 0.5, 0, 0)
      k.with(mat4([xm, yc + 0.42, sz * 0.27], q), () => {
        k.rbox(m.engine, [Le * 0.92, 0.42, 0.42], 0.04, [0, 0, 0])
        const nc = 6
        for (let i = 0; i < nc; i++) {
          const x = -Le * 0.4 + ((i + 0.5) * Le * 0.8) / nc
          k.rbox(m.cast, [(Le * 0.8) / nc - 0.04, 0.1, 0.3], 0.03, [x, 0.26, 0])
          k.rod(m.lagging, [x, 0.0, sz * 0.21], [x, 0.0, sz * 0.32], 0.045, 10) // exhaust runner
        }
        k.cyl(m.lagging, 0.09, Le * 0.85, [0, 0.0, sz * 0.36], 'x', 16) // exhaust manifold (lagged)
      })
    }
    k.rbox(m.cast, [Le * 0.6, 0.24, 0.32], 0.04, [xm, yc + 0.72, 0])
    // fan drive: crank pulley → belt → fan pulley; damper at the free end
    const yF = 0.3 + Hr / 2
    k.cyl(m.cast, 0.2, 0.1, [xe0 - 0.05, yc, 0], 'x', 28)
    k.cyl(m.cast, 0.14, 0.08, [xe0 - 0.32, yF, 0], 'x', 24)
    k.rod(m.steel, [xe0 - 0.32, yF, 0], [xr + 0.45, yF, 0], 0.035, 10)
    for (const s2 of [-1, 1]) k.rod(m.rubber, [xe0 - 0.05, yc + s2 * 0.19, 0.0], [xe0 - 0.32, yF + s2 * 0.13, 0.0], 0.012, 6)
    // turbochargers at the flywheel end, air filters
    for (const sz of [-1, 1]) {
      const tp: V3 = [xe1 - 0.25, yc + 0.95, sz * 0.32]
      k.cyl(m.cast, 0.18, 0.2, tp, 'z', 24)
      k.torus(m.cast, 0.17, 0.06, [tp[0], tp[1], tp[2] + sz * 0.1], 'z', 10, 24)
      k.cyl(m.chrome, 0.12, 0.16, [tp[0], tp[1], tp[2] - sz * 0.15], 'z', 20)
      k.cyl(m.cabDark, 0.2, 0.42, [xe1 - 0.85, yc + 0.95, sz * 0.36], 'z', 20) // air filter
      k.disc(m.black, 0.2, [xe1 - 0.85, yc + 0.95, sz * 0.57], sz > 0 ? 'z' : '-z', 20)
      k.tube(m.cabDark, [[xe1 - 0.85, yc + 0.95, sz * 0.15], [xe1 - 0.85, yc + 0.95, sz * 0.05], [xe1 - 0.45, yc + 0.95, sz * 0.05], [xe1 - 0.4, yc + 0.95, sz * 0.2]], 0.07, 12, 0.1)
      k.tube(m.lagging, [[tp[0], tp[1] + 0.15, tp[2]], [tp[0], tp[1] + 0.3, tp[2]], [tp[0], tp[1] + 0.3, 0]], 0.1, 14, 0.12)
    }
    // flywheel housing + alternator
    k.cyl(m.engineDark, 0.62, 0.25, [xe1 + 0.125, yc, 0], 'x', 36)
    const Ra = 0.62 * Math.min(1, s + 0.1)
    k.cyl(m.engine, Ra, La - 0.3, [(xa0 + xa1) / 2, yc, 0], 'x', 40)
    k.cyl(m.engineDark, Ra * 0.92, 0.15, [xa0 + 0.075, yc, 0], 'x', 36)
    k.cyl(m.engineDark, Ra * 0.88, 0.15, [xa1 - 0.075, yc, 0], 'x', 36)
    k.cyl(m.cast, Ra * 0.3, 0.06, [xa1 + 0.03, yc, 0], 'x', 20)
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 6; i++) k.box(m.black, [0.2, 0.02, 0.01], [xa1 - 0.35, yc - 0.15 + i * 0.06, sz * (Ra + 0.005)])
      for (const x of [xa0 + 0.3, xa1 - 0.3]) k.box(m.engineDark, [0.25, yc - Ra * 0.5 - yS - 0.1, 0.14], [x, yS + 0.1 + (yc - Ra * 0.5 - yS - 0.1) / 2, sz * Ra * 0.75])
    }
    // terminal box + cables down to the floor trench
    const tb: V3 = [(xa0 + xa1) / 2, yc + Ra + 0.22, 0]
    k.rbox(m.engine, [0.6, 0.44, 0.72], 0.03, tb)
    k.box('nameplate', [0.2, 0.1, 0.004], [tb[0], tb[1], 0.362])
    for (let i = 0; i < 3; i++) {
      const z = 0.38
      const x = tb[0] - 0.18 + i * 0.18
      k.cyl(m.copper, 0.03, 0.05, [x, tb[1] - 0.1, z], 'z', 10)
      k.spline(m.cable, [[x, tb[1] - 0.1, z + 0.02], [x, tb[1] - 0.25, z + 0.18], [x + 0.05, yc - 0.2, Ra + 0.35], [x + 0.08, 0.05, Ra + 0.4], [x + 0.1, -0.05, Ra + 0.45]], 0.028, 8, 24)
    }
    k.box(m.steel, [0.8, 0.01, 0.4], [tb[0], 0.005, Ra + 0.45]) // trench cover
    // local engine gauge panel
    k.rbox(m.cabDark, [0.36, 0.28, 0.12], 0.02, [xe0 + 0.5, yc + 0.35, 0.62])
    k.plane(screenMaterial('hmi'), 0.26, 0.15, [xe0 + 0.5, yc + 0.37, 0.681])
    // exhaust: turbo outlets → collector → bellows → vertical through the roof
    const xEx = xe1 - 0.25
    k.cyl(m.lagging, 0.17, 0.5, [xEx, yc + 1.25, 0], 'z', 20)
    for (let i = 0; i < 5; i++) k.torus(m.chrome, 0.16, 0.018, [xEx, yc + 1.45 + i * 0.045, 0], 'y', 6, 24)
    k.cyl(m.lagging, 0.15, c.size[1] - HF - (yc + 1.4), [xEx, (yc + 1.4 + c.size[1] - HF) / 2, 0], 'y', 20)
    exh.push(pt(mf.m, [xEx, 0, 0]))
  })
  roofSilencer(kOut, c, exh[0][0], exh[0][2], 0.36, 0.15)
  // around the walls: control / sync panel, day tank, batteries, CO2 bottles, supply fan
  const walls = rankWalls(c, [mf.end])
  wallFan(p, k, walls, spins, openings, 0.3)
  const genPanel: Unit = {
    w: 1.6,
    d: 0.6,
    build: (kk) => {
      cabinet(kk, 1.6, 0.6, 2.05, genPanelMaterial())
      lamps(kk, -0.6, 1.8, 0.3, [m.lampG, m.lampG, m.lampW, m.lampA], 0.06)
      lamps(kk, 0.25, 1.8, 0.3, [m.lampG, m.lampR, m.lampG], 0.06)
      kk.box(m.black, [0.2, 0.1, 0.04], [0.55, 1.1, 0.32])
      kk.cyl(m.red, 0.035, 0.04, [-0.55, 1.05, 0.32], 'z', 16)
    },
  }
  againstWalls(p, k, walls, genPanel, 'end')
  const dayTank: Unit = {
    w: 1.5,
    d: 0.75,
    build: (kk) => {
      kk.box(m.skid, [1.5, 0.2, 0.75], [0, 0.1, 0]) // bund
      kk.box(m.black, [1.44, 0.01, 0.69], [0, 0.2, 0])
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kk.box(m.skid, [0.06, 0.3, 0.06], [sx * 0.6, 0.35, sz * 0.25])
      kk.rbox(m.tank, [1.35, 0.9, 0.62], 0.04, [0, 0.95, 0])
      kk.cyl(m.glass, 0.02, 0.7, [0.55, 0.95, 0.34], 'y', 10)
      kk.cyl(m.steel, 0.03, 0.04, [0.55, 0.58, 0.34], 'y', 10)
      kk.cyl(m.steel, 0.03, 0.04, [0.55, 1.32, 0.34], 'y', 10)
      kk.rod(m.steel, [-0.4, 1.4, 0], [-0.4, c.CH - HF - 0.25, -0.2], 0.03, 10) // vent
      kk.rod(m.steel, [0.3, 1.4, -0.1], [0.3, 1.7, -0.1], 0.03, 10)
      kk.box(m.white, [0.4, 0.15, 0.005], [-0.2, 1.0, 0.313])
      kk.rod(m.steel, [-0.55, 0.5, 0.3], [-0.55, 0.3, 0.45], 0.02, 8)
      kk.handwheel(m.red, 0.12, [-0.55, 0.45, 0.42], 'z')
    },
  }
  againstWalls(p, k, walls, dayTank, 'start')
  const batteries: Unit = {
    w: 0.9,
    d: 0.5,
    build: (kk) => {
      kk.box(m.skid, [0.9, 0.5, 0.5], [0, 0.25, 0])
      for (const x of [-0.22, 0.22]) {
        kk.box(m.battery, [0.36, 0.28, 0.42], [x, 0.64, 0])
        kk.cyl(m.red, 0.018, 0.04, [x - 0.1, 0.8, 0.1], 'y', 8)
        kk.cyl(m.black, 0.018, 0.04, [x + 0.1, 0.8, 0.1], 'y', 8)
      }
      kk.spline(m.red, [[-0.32, 0.8, 0.1], [-0.4, 0.95, 0.1], [-0.45, 0.6, 0.26]], 0.015, 6, 12)
      kk.spline(m.cable, [[0.32, 0.8, 0.1], [0.4, 0.95, 0.1], [0.45, 0.6, 0.26]], 0.015, 6, 12)
    },
  }
  againstWalls(p, k, walls, batteries, 'start')
  const co2: Unit = {
    w: 1.65,
    d: 0.36,
    build: (kk) => {
      for (let i = 0; i < 6; i++) {
        const x = -0.69 + i * 0.275
        kk.cyl(m.red, 0.115, 1.3, [x, 0.7, 0], 'y', 20)
        kk.dome(m.red, 0.115, [x, 1.35, 0], 'y', Math.PI / 2, 0.6, 20)
        kk.cyl(m.copper, 0.03, 0.12, [x, 1.48, 0], 'y', 10)
        kk.box(m.chrome, [0.05, 0.05, 0.05], [x, 1.56, 0])
        kk.rod(m.chrome, [x, 1.58, 0], [x, 1.72, -0.1], 0.01, 6)
      }
      kk.rod(m.steel, [-0.8, 1.72, -0.1], [0.8, 1.72, -0.1], 0.03, 10)
      for (const y of [0.5, 1.15]) kk.box(m.steel, [1.65, 0.05, 0.03], [0, y, 0.12])
      kk.box(m.red, [0.4, 0.25, 0.005], [0, 1.95, -0.15])
    },
  }
  againstWalls(p, k, walls, co2, 'end')
}

function pumpHouse(c: RoomCtx, k: Kit, kOut: Kit, spins: Spin[], openings: WallOpening[]) {
  const p = new Plan(c)
  const m = M()
  const IX = c.inner.x1 - c.inner.x0
  const IZ = c.inner.z1 - c.inner.z0
  const s = Math.max(0.6, Math.min(1, (IX - 1.6) / 3.7))
  const Le = 1.5 * s
  const Wr = Math.min(1.1, IZ - 1.6)
  const Hr = Math.min(1.2, c.size[1] - HF - 1.4)
  const xe0 = 0.78
  const xe1 = xe0 + Le
  const xg = xe1 + 0.15 + 0.6 * s + 0.25 // gear head centre
  const len = xg + 0.35
  const mf = placeMachine(p, len, Math.max(Wr, 0.85))
  const yS = 0.22
  const yc = yS + 0.52
  const Rf = Math.min(0.46, Wr / 2 - 0.06, Hr / 2 - 0.06)
  radiator(k, mf, c, 0.1, Wr, Hr, 0.3, Rf, spins, openings)
  const exh: V3[] = []
  k.with(mf.m, () => {
    // skid
    for (const sz of [-1, 1]) {
      k.box(m.skid, [len - 0.45, yS - 0.02, 0.12], [0.45 + (len - 0.45) / 2, (yS - 0.02) / 2, sz * 0.36])
    }
    k.box(m.skid, [len - 0.45, 0.02, 0.84], [0.45 + (len - 0.45) / 2, yS - 0.01, 0])
    // engine (inline 6): sump, block, head, rocker cover, manifold, turbo, filter
    const xm = (xe0 + xe1) / 2
    k.rbox(m.engineDark, [Le * 0.85, 0.28, 0.48], 0.03, [xm, yS + 0.2, 0])
    k.rbox(m.red, [Le, 0.55, 0.62], 0.04, [xm, yc, 0])
    k.rbox(m.red, [Le * 0.96, 0.16, 0.5], 0.03, [xm, yc + 0.35, 0])
    k.rbox(m.cast, [Le * 0.9, 0.12, 0.36], 0.03, [xm, yc + 0.49, 0])
    for (const sz of [-1, 1]) for (const x of [xe0 + 0.15, xe1 - 0.15]) k.box(m.engineDark, [0.18, 0.2, 0.1], [x, yS + 0.1, sz * 0.32])
    for (let i = 0; i < 6; i++) k.rod(m.lagging, [xe0 + 0.12 + i * (Le - 0.24) / 5, yc + 0.32, 0.25], [xe0 + 0.12 + i * (Le - 0.24) / 5, yc + 0.32, 0.36], 0.035, 8)
    k.cyl(m.lagging, 0.07, Le * 0.9, [xm, yc + 0.32, 0.38], 'x', 14)
    const tp: V3 = [xe1 - 0.2, yc + 0.62, 0.3]
    k.cyl(m.cast, 0.13, 0.15, tp, 'z', 20)
    k.torus(m.cast, 0.12, 0.045, [tp[0], tp[1], tp[2] + 0.08], 'z', 8, 20)
    k.cyl(m.cabDark, 0.16, 0.36, [xe0 + 0.35, yc + 0.68, -0.05], 'z', 20)
    k.tube(m.cabDark, [[xe0 + 0.35, yc + 0.68, 0.13], [xe0 + 0.35, yc + 0.68, 0.3], [tp[0] - 0.15, yc + 0.68, 0.3]], 0.05, 10, 0.08)
    // fan drive
    const yF = 0.3 + Hr / 2
    k.cyl(m.cast, 0.14, 0.08, [xe0 - 0.04, yc, 0], 'x', 24)
    k.cyl(m.cast, 0.1, 0.07, [xe0 - 0.2, yF, 0], 'x', 20)
    k.rod(m.steel, [xe0 - 0.2, yF, 0], [0.5, yF, 0], 0.025, 10)
    for (const s2 of [-1, 1]) k.rod(m.rubber, [xe0 - 0.04, yc + s2 * 0.13, 0], [xe0 - 0.2, yF + s2 * 0.09, 0], 0.01, 6)
    // flywheel housing, cardan shaft under a guard, right-angle gear head on the discharge head
    k.cyl(m.engineDark, 0.4, 0.15, [xe1 + 0.075, yc, 0], 'x', 32)
    couplingGuard(k, xe1 + 0.15, xg - 0.25, yc, 0.17, yS)
    k.rbox(m.cast, [0.5, 0.5, 0.5], 0.05, [xg, yc, 0])
    k.cyl(m.cast, 0.17, 0.2, [xg - 0.3, yc, 0], 'x', 20)
    k.cyl(m.cast, 0.22, 0.3, [xg, yc - 0.38, 0], 'y', 24)
    k.box(m.white, [0.16, 0.08, 0.004], [xg, yc + 0.05, 0.252])
    k.cyl(m.chrome, 0.05, 0.06, [xg, yc + 0.28, 0], 'y', 12) // breather
    // discharge-head stool: four posts round the vertical shaft, down to the floor penetration
    for (const a of [0.785, 2.356, 3.927, 5.498]) k.box(m.cast, [0.06, yc - 0.53, 0.06], [xg + Math.cos(a) * 0.25, (yc - 0.53) / 2, Math.sin(a) * 0.25])
    k.cyl(m.chrome, 0.05, yc - 0.5, [xg, (yc - 0.5) / 2, 0], 'y', 12)
    k.cyl(m.cast, 0.32, 0.04, [xg, 0.02, 0], 'y', 32)
    k.disc(m.black, 0.26, [xg, 0.045, 0], 'y', 28)
    k.boltCircle(m.steel, m.steel, 12, 0.29, [xg, 0.04, 0], 'y', 0.016, 0.04, [0.02])
    // controller-panel cable + exhaust up through the roof
    k.cyl(m.lagging, 0.1, c.size[1] - HF - (tp[1] + 0.15), [tp[0], (tp[1] + 0.15 + c.size[1] - HF) / 2, tp[2]], 'y', 18)
    for (let i = 0; i < 4; i++) k.torus(m.chrome, 0.105, 0.012, [tp[0], tp[1] + 0.25 + i * 0.035, tp[2]], 'y', 6, 20)
    exh.push(pt(mf.m, tp))
  })
  roofSilencer(kOut, c, exh[0][0], exh[0][2], 0.24, 0.1)
  const walls = rankWalls(c, [mf.end])
  const ctrl: Unit = {
    w: 0.8,
    d: 0.42,
    build: (kk) => {
      cabinet(kk, 0.8, 0.42, 1.9, pumpCtrlMaterial())
      lamps(kk, -0.25, 1.55, 0.21, [m.lampG, m.lampW, m.lampA], 0.06)
    },
  }
  againstWalls(p, k, walls, ctrl, 'end')
  const dayTank: Unit = {
    w: 1.2,
    d: 0.45,
    build: (kk) => {
      kk.box(m.skid, [1.2, 0.15, 0.45], [0, 0.075, 0])
      for (const sx of [-1, 1]) kk.box(m.skid, [0.05, 0.3, 0.05], [sx * 0.5, 0.3, 0])
      kk.rbox(m.tank, [1.1, 0.75, 0.4], 0.03, [0, 0.83, 0])
      kk.cyl(m.glass, 0.018, 0.6, [0.45, 0.83, 0.215], 'y', 10)
      kk.rod(m.steel, [-0.3, 1.2, 0], [-0.3, c.CH - HF - 0.25, -0.1], 0.025, 10)
      kk.handwheel(m.red, 0.1, [-0.45, 0.42, 0.25], 'z')
      kk.box(m.white, [0.3, 0.12, 0.005], [0, 0.95, 0.202])
    },
  }
  againstWalls(p, k, walls, dayTank, 'start')
  const batteries: Unit = {
    w: 0.75,
    d: 0.42,
    build: (kk) => {
      kk.box(m.skid, [0.75, 0.4, 0.42], [0, 0.2, 0])
      for (const x of [-0.18, 0.18]) {
        kk.box(m.battery, [0.3, 0.25, 0.34], [x, 0.525, 0])
        kk.cyl(m.red, 0.015, 0.035, [x - 0.08, 0.66, 0.08], 'y', 8)
        kk.cyl(m.black, 0.015, 0.035, [x + 0.08, 0.66, 0.08], 'y', 8)
      }
    },
  }
  againstWalls(p, k, walls, batteries, 'start')
  wallFan(p, k, walls, spins, openings, 0.22)
}

// ------------------------------------------------------------------ entry
export function buildInterior(kind: Interior, c: RoomCtx, kIn: Kit, kOut: Kit): { spinners: Spin[]; openings: WallOpening[] } {
  const spinners: Spin[] = []
  const openings: WallOpening[] = []
  switch (kind) {
    case 'switchgear':
      switchgear(c, kIn, spinners)
      break
    case 'controlRoom':
      controlRoom(c, kIn)
      break
    case 'generator':
      generator(c, kIn, kOut, spinners, openings)
      break
    case 'pumpHouse':
      pumpHouse(c, kIn, kOut, spinners, openings)
      break
    case 'none':
      break
  }
  return { spinners, openings }
}
