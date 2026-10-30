/**
 * Enclosed module — walk-in equipment room (A60 steel container building).
 *
 * Local frame: origin = centre of the module footprint at deck level, size = [x, y, z] extents.
 * The building sits on a 0.6 m skid / cable cellar, so the internal floor and door thresholds are
 * at y = HF and every door has an external landing with a stair down to the deck.
 *
 * The building is hollow: walls WALL_T thick (profiled cladding outside, lined panels inside) with
 * real openings where `doors` (and the interior's louvres / radiator ducts) say, an internal floor
 * (raised-floor tiles / carpet / epoxy deck), a suspended ceiling with lit panels (or exposed roof
 * beams + battens in machinery rooms). Each door leaf is a <Door> that swings outward; fans are
 * <Spinner>s. What's inside comes from moduleInteriors.ts (switchgear, control room, generator,
 * firewater pump house). Door geometry conventions: see moduleLayout.ts.
 *
 * Meshes: shell (one Kit, 'shell'/'structure' roles fade in x-ray), interior (one Kit, 'internal'
 * role stays opaque), one small mesh per door leaf and per fan rotor.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Module } from '../../model/types'
import { paint } from '../../three/materials'
import { Door, Spinner } from '../anim'
import { NozzleNeck } from '../common/NozzleNeck'
import { Kit, eul, mat4, uvScale, type Built, type MatKey, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { ribbedPanel } from './machinery/cladding'
import { gratingPanel, handrail, tagPlate } from './machinery/parts'
import { fanGuardMaterial, signMaterial } from './machinery/textures'
import { buildInterior, fanRotor, type Spin } from './moduleInteriors'
import {
  FRAME_W,
  HF,
  POST,
  WALL_IDS,
  WALL_T,
  doorGeometry,
  doorKeepOuts,
  freeAt,
  innerRect,
  resolveInterior,
  wallFrame,
  wallMatrix,
  type DoorGeom,
  type WallFrame,
} from './moduleLayout'
import { carpetMaterial, ceilingMaterial, epoxyFloorMaterial, liningMaterial, raisedFloorMaterial } from './moduleTextures'

const CLAD: MatKey = 'moduleCladding'
const FRAME: MatKey = 'structSteelDark'
const DOOR: MatKey = 'equipmentPaint'
const T = WALL_T

const lightPanel = () => paint('#ffffff', 'shell', { emissive: '#fff3dc', emissiveIntensity: 1.5, roughness: 0.4, metalness: 0 })
const lightFrame = () => paint('#d9dcd8', 'shell', { metalness: 0.4, roughness: 0.4 })
const extRed = () => paint('#c0261c', 'internal', { roughness: 0.35, metalness: 0.2 })
const exitGreen = () => paint('#1f9a4a', 'internal', { emissive: '#2bff7a', emissiveIntensity: 1.4 })

interface ModuleBuild {
  shell: Built
  interior: Built
  leaves: { id: string; hinge: V3; rotationY: number; openAngle: number; width: number; height: number; dir: 1 | -1 }[]
  spinners: Spin[]
}

function buildModule(eq: Module): ModuleBuild {
  const size = eq.size as V3
  const [SX, SY, SZ] = size
  const kind = resolveInterior(eq)
  const doors = doorGeometry(eq)
  const keep = doorKeepOuts(size, doors)
  const inner = innerRect(size)
  const hasCeiling = kind === 'switchgear' || kind === 'controlRoom' || kind === 'none'
  const CH = hasCeiling ? SY - 0.5 : SY - 0.125
  const k = new Kit()
  const kIn = new Kit()
  const spinners: Spin[] = []

  // ---------------------------------------------------------------- interior first (it may ask for wall openings + roof parts)
  const { openings, spinners: inSpin } = buildInterior(kind, { eq, size, inner, CH, hasCeiling, doors, keep }, kIn, k)
  spinners.push(...inSpin)

  const walls = WALL_IDS.map((id) => wallFrame(id, size))
  const onWall = (w: WallFrame, fn: () => void) => k.with(wallMatrix(w), fn)

  // ---------------------------------------------------------------- skid / cable cellar
  k.box(FRAME, [SX + 0.1, 0.3, SZ + 0.1], [0, 0.15, 0])
  k.box(FRAME, [SX + 0.14, 0.03, SZ + 0.14], [0, 0.315, 0])
  // cellar wall up to the underside of the floor slab, then a sill ring under the walls (the floor
  // slab itself is part of the interior mesh — no coplanar faces)
  k.box(CLAD, [SX - 0.02, HF - 0.38, SZ - 0.02], [0, 0.33 + (HF - 0.38) / 2, 0])
  for (const s of [-1, 1]) {
    k.box(FRAME, [SX - 0.02, 0.05, T], [0, HF - 0.025, s * (SZ / 2 - T / 2 - 0.01)])
    k.box(FRAME, [T, 0.05, SZ - 2 * T - 0.02], [s * (SX / 2 - T / 2 - 0.01), HF - 0.025, 0])
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(FRAME, [0.2, 0.18, 0.04], [sx * (SX / 2 - 0.5), 0.39, sz * (SZ / 2 + 0.07)])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(FRAME, [POST, SY - HF, POST], [sx * (SX / 2 - POST / 2), HF + (SY - HF) / 2, sz * (SZ / 2 - POST / 2)])

  // ---------------------------------------------------------------- walls with openings
  const lining = liningMaterial()
  const wallTop = SY - 0.125
  const cladTop = SY - 0.35
  for (const w of walls) {
    const ext: [number, number] = w.id === '+z' || w.id === '-z' ? [-w.len / 2, w.len / 2] : [-w.len / 2 + T, w.len / 2 - T]
    const holes: { a: number; b: number; y0: number; y1: number }[] = []
    for (const d of doors) if (d.wall === w.id) holes.push({ a: d.u - d.width / 2 - FRAME_W, b: d.u + d.width / 2 + FRAME_W, y0: HF, y1: HF + d.height + FRAME_W })
    for (const o of openings) if (o.wall === w.id) holes.push({ a: o.u - o.w / 2, b: o.u + o.w / 2, y0: o.y0, y1: o.y1 })
    holes.sort((p, q) => p.a - q.a)
    const seg = (a: number, b: number, y0: number, y1: number) => {
      if (b - a < 0.005 || y1 - y0 < 0.005) return
      // lining (inner face + reveal), cladding sheet outside (between corner posts)
      const g = new THREE.BoxGeometry(b - a, y1 - y0, T - 0.045)
      uvScale(g, (b - a) / 1.2, 1)
      k.add(lining, g, mat4([(a + b) / 2, (y0 + y1) / 2, -(T + 0.045) / 2]))
      const ca = Math.max(a, -w.len / 2 + POST)
      const cb = Math.min(b, w.len / 2 - POST)
      const cy0 = y0
      const cy1 = Math.min(y1, cladTop)
      if (cb - ca > 0.01 && cy1 - cy0 > 0.01) k.add(CLAD, ribbedPanel(cb - ca, cy1 - cy0, 0.25, 0.035), mat4([(ca + cb) / 2, cy0, -0.04]))
      if (y0 <= HF + 1e-3 && cb - ca > 0.01) k.box(FRAME, [cb - ca, 0.06, 0.06], [(ca + cb) / 2, HF + 0.03, -0.02])
    }
    onWall(w, () => {
      let cur = ext[0]
      for (const h of holes) {
        seg(cur, Math.max(cur, h.a), HF, wallTop)
        seg(h.a, h.b, HF, h.y0)
        seg(h.a, h.b, h.y1, wallTop)
        cur = Math.max(cur, h.b)
      }
      seg(cur, ext[1], HF, wallTop)
      // eaves flashing
      k.box(CLAD, [w.len + 0.08, 0.35, 0.05], [0, SY - 0.175, 0])
      // sleeves round the interior's openings (louvre ducts)
      for (const o of openings) {
        if (o.wall !== w.id) continue
        for (const s of [-1, 1]) k.box(FRAME, [0.03, o.y1 - o.y0, T + 0.02], [o.u + s * (o.w / 2 - 0.015), (o.y0 + o.y1) / 2, -T / 2])
        for (const y of [o.y0 + 0.015, o.y1 - 0.015]) k.box(FRAME, [o.w, 0.03, T + 0.02], [o.u, y, -T / 2])
        louvre(k, o.u, (o.y0 + o.y1) / 2, o.w, o.y1 - o.y0, false)
      }
    })
  }

  // ---------------------------------------------------------------- roof
  k.box(CLAD, [SX - 0.1, 0.05, SZ - 0.1], [0, SY - 0.1, 0])
  const roofSheet = ribbedPanel(SX - 0.3, SZ - 0.3, 0.3, 0.03, false)
  k.add(CLAD, roofSheet, new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)).setPosition(0, SY - 0.075, -(SZ - 0.3) / 2))

  // ---------------------------------------------------------------- floor + ceiling
  const IX = inner.x1 - inner.x0
  const IZ = inner.z1 - inner.z0
  {
    const tile = kind === 'controlRoom' ? 0.5 : kind === 'generator' || kind === 'pumpHouse' ? 1.0 : 0.6
    const fm = kind === 'controlRoom' ? carpetMaterial() : kind === 'generator' || kind === 'pumpHouse' ? epoxyFloorMaterial() : raisedFloorMaterial()
    const g = new THREE.BoxGeometry(IX, 0.05, IZ)
    uvScale(g, IX / tile, IZ / tile)
    kIn.add(fm, g, mat4([0, HF - 0.025, 0]))
    // skirting
    const sk = paint('#3a3e42', 'internal', { roughness: 0.6 })
    for (const s of [-1, 1]) {
      kIn.box(sk, [IX, 0.08, 0.01], [0, HF + 0.04, s * (IZ / 2 - 0.005)])
      kIn.box(sk, [0.01, 0.08, IZ], [s * (IX / 2 - 0.005), HF + 0.04, 0])
    }
  }
  if (hasCeiling) {
    const g = new THREE.BoxGeometry(IX, 0.03, IZ)
    uvScale(g, IX / 0.6, IZ / 0.6)
    k.add(ceilingMaterial(), g, mat4([0, CH + 0.015, 0]))
    const nx = Math.max(1, Math.round(IX / 2.2))
    const nz = Math.max(1, Math.round(IZ / 2.4))
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = inner.x0 + ((i + 0.5) * IX) / nx
        const z = inner.z0 + ((j + 0.5) * IZ) / nz
        k.box(lightFrame(), [0.64, 0.02, 1.24], [x, CH - 0.004, z])
        k.box(lightPanel(), [0.58, 0.012, 1.18], [x, CH - 0.012, z])
      }
    // supply / return diffusers
    for (const [fx, fz] of [[0.25, 0.3], [0.75, 0.7]]) {
      const x = inner.x0 + IX * fx
      const z = inner.z0 + IZ * fz
      k.box(lightFrame(), [0.6, 0.02, 0.6], [x, CH - 0.004, z])
      for (let r = 0; r < 4; r++) k.box('nut', [0.5 - r * 0.12, 0.012, 0.025], [x, CH - 0.012, z - 0.2 + r * 0.13])
    }
  } else {
    // exposed roof beams + Ex LED battens
    const nb = Math.max(2, Math.round(IX / 1.5))
    for (let i = 0; i <= nb; i++) {
      const x = inner.x0 + (i * IX) / nb
      k.box(FRAME, [0.1, 0.2, IZ], [x, SY - 0.125 - 0.1, 0])
      k.box(FRAME, [0.008, 0.2, IZ], [x, SY - 0.125 - 0.1, 0])
    }
    for (let i = 0; i < nb; i++)
      for (const fz of [0.25, 0.75]) {
        const x = inner.x0 + ((i + 0.5) * IX) / nb
        const z = inner.z0 + IZ * fz
        k.rbox(lightFrame(), [1.25, 0.09, 0.14], 0.02, [x, SY - 0.4, z])
        k.box(lightPanel(), [1.15, 0.01, 0.1], [x, SY - 0.45, z])
        for (const s of [-1, 1]) k.rod('nut', [x + s * 0.5, SY - 0.36, z], [x + s * 0.5, SY - 0.13, z], 0.006, 5)
      }
  }

  // ---------------------------------------------------------------- doors: frames, thresholds, landings, stairs, signage
  const leaves: ModuleBuild['leaves'] = []
  for (const [di, d] of doors.entries()) {
    const w = walls.find((x) => x.id === d.wall)!
    for (const l of d.leaves) leaves.push({ id: d.id, hinge: l.hinge, rotationY: l.rotationY, openAngle: l.openAngle, width: l.width, height: d.height, dir: l.dir })
    onWall(w, () => doorDressing(k, kIn, w, d, eq.name.toUpperCase(), di === 0 ? eq : null))
  }

  // ---------------------------------------------------------------- HVAC louvres (high level, clear of doors)
  if (hasCeiling) {
    let n = 0
    for (const w of walls)
      for (const f of [0.25, -0.25]) {
        if (n >= 3) break
        const u = w.len * f
        if (!freeAt(doors, w, u, 0.6)) continue
        if (openings.some((o) => o.wall === w.id && Math.abs(o.u - u) < o.w / 2 + 0.6)) continue
        onWall(w, () => louvre(k, u, SY - 1.0, 0.8, 0.5, true))
        n++
      }
  }

  // ---------------------------------------------------------------- cable transits (MCT) into the cellar, on the wall with fewest doors
  {
    const ranked = [...walls].sort((a, b) => doors.filter((d) => d.wall === a.id).length - doors.filter((d) => d.wall === b.id).length || b.len - a.len)
    const w = ranked[0]
    const clear = !doors.some((d) => d.wall === w.id) && !openings.some((o) => o.wall === w.id)
    const us = [-w.len * 0.25, 0, w.len * 0.25].filter((u) => freeAt(doors, w, u, 0.35))
    onWall(w, () => {
      for (const [i, u] of us.entries()) {
        const y = 0.45
        k.box(FRAME, [0.5, 0.22, 0.12], [u, y, 0.05])
        for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) k.box(c % 2 === r % 2 ? 'rubberBlack' : 'gasket', [0.07, 0.08, 0.02], [u - 0.19 + c * 0.075, y - 0.045 + r * 0.09, 0.115])
        k.box('stainless', [0.46, 0.02, 0.03], [u, y + 0.11, 0.115])
        if (!clear) continue
        for (let c = 0; c < 4; c++) {
          const x = u - 0.15 + c * 0.1
          k.spline('cable', [[x, y, 0.12], [x, y, 0.5], [x, 1.2, 0.5], [x + i * 0.02, 2.3 + c * 0.02, 0.62]], 0.016, 6, 24)
        }
      }
      if (clear && us.length) {
        const span = w.len * 0.7
        k.box('cableTray', [span, 0.08, 0.5], [0, 2.4, 0.62])
        for (let i = 0; i < 12; i++) k.box('cableTray', [0.03, 0.02, 0.5], [-span / 2 + (i * span) / 11, 2.35, 0.62])
        for (const u of [-span * 0.48, span * 0.48]) k.box(FRAME, [0.06, 0.06, 0.7], [u, 2.3, 0.35])
      }
    })
  }

  // ---------------------------------------------------------------- roof: HVAC units (rooms with a ceiling), beacons, pad-eyes
  if (hasCeiling) {
    for (const [i, ux] of [-SX * 0.22, SX * 0.22].entries()) {
      const hz = -SZ * 0.15
      const hb = SY - 0.075
      k.box(FRAME, [2.0, 0.15, 1.3], [ux, hb + 0.075, hz])
      k.rbox(CLAD, [1.9, 1.0, 1.2], 0.03, [ux, hb + 0.15 + 0.5, hz])
      for (const fx of [-0.45, 0.45]) {
        k.cyl(CLAD, 0.36, 0.14, [ux + fx, hb + 1.21, hz], 'y', 32, undefined, true)
        k.disc('rubberBlack', 0.355, [ux + fx, hb + 1.14, hz], 'y', 28)
        k.cyl('nut', 0.05, 0.08, [ux + fx, hb + 1.18, hz], 'y', 12)
        k.disc(fanGuardMaterial(), 0.355, [ux + fx, hb + 1.285, hz], 'y', 28)
        spinners.push({ pos: [ux + fx, hb + 1.22, hz], rot: [0, 0, 0], r: 0.32, blades: 4, rpm: 220, dark: true })
      }
      for (const s of [-1, 1]) for (let j = 0; j < 8; j++) k.box('nut', [1.6, 0.03, 0.01], [ux, hb + 0.3 + j * 0.08, hz + s * 0.605])
      k.box('stainless', [0.5, 0.45, 0.4], [ux + (i ? -0.65 : 0.65), hb + 0.375, hz + 0.95])
      k.box('stainless', [0.5, 0.25, 0.7], [ux + (i ? -0.65 : 0.65), hb + 0.45, hz + 0.5])
      k.box('actuatorRed', [0.16, 0.12, 0.1], [ux + (i ? -0.65 : 0.65) + 0.33, hb + 0.4, hz + 0.95])
      k.rbox('stainless', [0.35, 0.3, 0.15], 0.02, [ux, hb + 0.45, hz - 0.68])
    }
  }
  for (const [x, c] of (['actuatorRed', 'actuatorYellow'] as MatKey[]).entries()) {
    k.cyl('nut', 0.06, 0.06, [-SX / 2 + 0.4 + x * 0.25, SY + 0.0, SZ / 2 - 0.4], 'y', 14)
    k.cyl(c, 0.055, 0.12, [-SX / 2 + 0.4 + x * 0.25, SY + 0.09, SZ / 2 - 0.4], 'y', 16)
  }
  k.cyl('nut', 0.08, 0.1, [-SX / 2 + 0.9, SY + 0.0, SZ / 2 - 0.4], 'y', 16)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(FRAME, [0.25, 0.15, 0.03], [sx * (SX / 2 - 0.3), SY + 0.07, sz * (SZ / 2 - 0.3)])

  // ---------------------------------------------------------------- roof access cage ladder (first wall spot clear of doors / openings)
  ladder: for (const id of ['+x', '-x', '+z', '-z'] as const) {
    const w = walls.find((x) => x.id === id)!
    for (const f of [0.42, -0.42, 0.3, -0.3]) {
      const lu = w.len * f
      if (!freeAt(doors, w, lu, 0.35)) continue
      if (openings.some((o) => o.wall === id && Math.abs(o.u - lu) < o.w / 2 + 0.4)) continue
      onWall(w, () => {
        for (const s of [-1, 1]) k.box('safetyYellow', [0.06, SY - 0.2, 0.012], [lu + s * 0.22, (SY - 0.2) / 2 + 0.25, 0.2])
        for (let i = 0; i < Math.floor((SY - 0.4) / 0.3); i++) k.rod('safetyYellow', [lu - 0.22, 0.4 + i * 0.3, 0.2], [lu + 0.22, 0.4 + i * 0.3, 0.2], 0.012, 6)
        for (const s of [-1, 1]) k.box('safetyYellow', [0.06, 0.06, 0.25], [lu + s * 0.22, SY - 0.4, 0.09])
        handrail(k, [[lu - 0.6, SY - 0.05, -0.05], [lu + 0.6, SY - 0.05, -0.05]], 'safetyYellow', 1.0)
        k.cyl('brass', 0.03, 0.04, [lu, 0.45, 0.02], 'z', 10) // earthing boss
      })
      break ladder
    }
  }

  return { shell: k.build(), interior: kIn.build(), leaves, spinners }
}

/** Louvre on the outer face (wall frame). `backed` adds the dark plenum behind decorative louvres. */
function louvre(k: Kit, u: number, y: number, w: number, h: number, backed: boolean) {
  k.box(FRAME, [w + 0.08, 0.04, 0.08], [u, y + h / 2 + 0.02, 0.02])
  k.box(FRAME, [w + 0.08, 0.04, 0.08], [u, y - h / 2 - 0.02, 0.02])
  for (const s of [-1, 1]) k.box(FRAME, [0.04, h + 0.08, 0.08], [u + s * (w / 2 + 0.02), y, 0.02])
  if (backed) k.box('rubberBlack', [w, h, 0.02], [u, y, 0.03])
  const n = Math.round(h / 0.07)
  for (let i = 0; i < n; i++) k.box(CLAD, [w, 0.075, 0.006], [u, y - h / 2 + (i + 0.5) * (h / n), 0.05], eul(0.7, 0, 0))
  if (backed) k.box('actuatorRed', [0.18, 0.12, 0.1], [u + w / 2 + 0.15, y + h / 2 - 0.06, 0.06])
}

/** Frame, threshold, canopy, lights, signs, landing + stair for one door — built in the wall frame. */
function doorDressing(k: Kit, kIn: Kit, w: WallFrame, d: DoorGeom, name: string, tagEq: Module | null) {
  const { u, width: dw, height: h } = d
  const fr = FRAME_W
  // frame through the wall thickness + stainless threshold
  k.box(FRAME, [dw + 2 * fr, fr, T + 0.04], [u, HF + h + fr / 2, -T / 2 + 0.01])
  for (const s of [-1, 1]) k.box(FRAME, [fr, h, T + 0.04], [u + s * (dw / 2 + fr / 2), HF + h / 2, -T / 2 + 0.01])
  // door stop rebate (inner edge of the frame)
  k.box(FRAME, [dw, 0.025, 0.03], [u, HF + h - 0.012, -0.08])
  for (const s of [-1, 1]) k.box(FRAME, [0.025, h, 0.03], [u + s * (dw / 2 - 0.012), HF + h / 2, -0.08])
  k.box('stainless', [dw + 2 * fr, 0.012, T + 0.06], [u, HF + 0.004, -T / 2])
  // outside: canopy, bulkhead light, EXIT sign, room signs
  const sd = d.stairDir
  k.box(CLAD, [dw + 0.6, 0.04, 0.6], [u, HF + h + 0.35, 0.3])
  k.box(CLAD, [dw + 0.6, 0.15, 0.03], [u, HF + h + 0.29, 0.6])
  k.rbox('stainless', [0.3, 0.12, 0.1], 0.03, [u - sd * (dw / 2 + 0.35), HF + h + 0.15, 0.06])
  k.box(lightPanel(), [0.25, 0.08, 0.02], [u - sd * (dw / 2 + 0.35), HF + h + 0.15, 0.115])
  k.plane(signMaterial('exit'), 0.4, 0.2, [u, HF + h + 0.18, 0.075])
  const signU = u + sd * (dw / 2 + 0.65)
  if (Math.abs(signU) < w.len / 2 - POST - 0.4) {
    k.plane(signMaterial(tagEq ? 'ler' : 'hv', name), 0.8, 0.4, [signU, HF + 1.55, 0.04])
    k.plane(signMaterial('noentry'), 0.5, 0.25, [signU, HF + 1.05, 0.04])
    if (tagEq) tagPlate(k, tagEq.tag, [signU, HF + 2.05, 0.005], 'z', 0.6)
  }
  // inside: EXIT sign over the door, extinguisher + call point beside it
  kIn.with(wallMatrix(w), () => {
    kIn.box(exitGreen(), [0.36, 0.16, 0.04], [u, HF + h + 0.2, -T - 0.02])
    kIn.plane(signMaterial('exit'), 0.34, 0.15, [u, HF + h + 0.2, -T - 0.041], eul(0, Math.PI, 0))
    const eu = u - sd * (dw / 2 + 0.4)
    if (Math.abs(eu) < w.len / 2 - T - 0.3) {
      kIn.box('nut', [0.16, 0.06, 0.06], [eu, HF + 0.95, -T - 0.03])
      kIn.cyl(extRed(), 0.085, 0.5, [eu, HF + 0.62, -T - 0.11], 'y', 16)
      kIn.dome(extRed(), 0.085, [eu, HF + 0.87, -T - 0.11], 'y', Math.PI / 2, 0.6, 16)
      kIn.cyl('nut', 0.025, 0.08, [eu, HF + 0.93, -T - 0.11], 'y', 8)
      kIn.box('rubberBlack', [0.12, 0.02, 0.03], [eu + 0.03, HF + 0.98, -T - 0.11])
      kIn.spline('rubberBlack', [[eu + 0.02, HF + 0.95, -T - 0.12], [eu + 0.1, HF + 0.8, -T - 0.2], [eu + 0.08, HF + 0.55, -T - 0.2]], 0.012, 6, 12)
      kIn.box(extRed(), [0.09, 0.09, 0.05], [eu, HF + 1.45, -T - 0.025])
      kIn.box('glass', [0.06, 0.06, 0.005], [eu, HF + 1.45, -T - 0.052])
    }
  })
  // landing (grating) + stair down to deck along the wall, handrails
  const lw2 = dw + 0.9
  const ld = d.landingDepth
  const sz = 0.62 // stair centre line out from the wall (treads 0.9 wide)
  gratingPanel(k, [u, HF - 0.015, ld / 2 + 0.02], lw2, ld)
  for (const s of [-1, 1]) for (const o of [0.1, ld - 0.05]) k.box(FRAME, [0.08, HF - 0.03, 0.08], [u + s * (lw2 / 2 - 0.05), (HF - 0.03) / 2, o])
  const steps = Math.ceil(HF / 0.2)
  const run = 0.25
  const sx0 = u + sd * (lw2 / 2)
  for (let i = 1; i < steps; i++) {
    const y = HF - i * (HF / steps)
    gratingPanel(k, [sx0 + sd * (i - 0.5) * run, y - 0.015, sz], run - 0.02, 0.9)
  }
  for (const o of [sz - 0.47, sz + 0.47]) {
    k.rod(FRAME, [sx0, HF - 0.04, o], [sx0 + sd * ((steps - 1) * run + 0.1), 0.05, o], 0.03, 6)
    handrail(k, [[sx0, HF, o], [sx0 + sd * (steps - 1) * run, HF / steps, o]], 'safetyYellow', 1.0)
  }
  const far = u - sd * (lw2 / 2 - 0.03)
  const rail: V3[] = [[far, HF, 0.06], [far, HF, ld], [sx0, HF, ld]]
  if (ld > sz + 0.6) rail.push([sx0, HF, sz + 0.47]) // close the deep landing down to the stair's outer rail
  handrail(k, rail, 'safetyYellow', 1.0)
}

// ---------------------------------------------------------------- door leaf (drawn relative to its hinge)
const leafCache = new Map<string, Built>()
/**
 * A60 steel door leaf. Hinge at the origin on the outer face of the frame; the leaf runs along
 * local ±X (dir) for `w`, from the floor up `h`, and sits just inside the outer face (z < 0).
 */
function leafBuilt(w: number, h: number, dir: 1 | -1): Built {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${dir}`
  const hit = leafCache.get(key)
  if (hit) return hit
  const k = new Kit()
  const t = 0.05
  const zc = -0.04
  const X = (x: number) => dir * x // distance from the hinge → local x
  const lw = w - 0.012
  const x0 = 0.006
  // body with a vision-panel cut-out
  const ww = Math.min(0.3, lw * 0.35)
  const wy0 = h * 0.6
  const wy1 = Math.min(h - 0.25, wy0 + 0.55)
  const wc = x0 + lw / 2
  const piece = (a: number, b: number, y0: number, y1: number) => k.box(DOOR, [b - a, y1 - y0, t], [X((a + b) / 2), (y0 + y1) / 2, zc])
  piece(x0, x0 + lw, 0.005, wy0)
  piece(x0, x0 + lw, wy1, h - 0.005)
  piece(x0, wc - ww / 2, wy0, wy1)
  piece(wc + ww / 2, x0 + lw, wy0, wy1)
  k.box('glass', [ww, wy1 - wy0, 0.012], [X(wc), (wy0 + wy1) / 2, zc])
  for (const zz of [zc + t / 2 + 0.004, zc - t / 2 - 0.004]) {
    for (const yy of [wy0, wy1]) k.box('stainless', [ww + 0.04, 0.02, 0.008], [X(wc), yy, zz])
    for (const s of [-1, 1]) k.box('stainless', [0.02, wy1 - wy0 + 0.04, 0.008], [X(wc + s * (ww / 2)), (wy0 + wy1) / 2, zz])
  }
  // kick plates both faces
  for (const zz of [zc + t / 2 + 0.002, zc - t / 2 - 0.002]) k.box('stainless', [lw * 0.95, 0.22, 0.004], [X(wc), 0.13, zz])
  // hinges (barrels on the hinge line)
  for (const hy of [0.22, h / 2, h - 0.25]) k.cyl('nut', 0.016, 0.12, [X(0.004), hy, -0.012], 'y', 10)
  // inside: panic (push) bar across the leaf
  const zi = zc - t / 2
  const bx0 = 0.12
  const bx1 = lw - 0.06
  k.rod('stainless', [X(bx0), 1.0, zi - 0.075], [X(bx1), 1.0, zi - 0.075], 0.017, 10)
  k.rbox('nut', [0.08, 0.1, 0.07], 0.01, [X(bx0), 1.0, zi - 0.035])
  k.rbox('nut', [0.14, 0.12, 0.07], 0.01, [X(bx1 - 0.03), 1.0, zi - 0.035])
  // outside: pull handle + lock cylinder at the lock edge
  const zo = zc + t / 2
  const hx = lw - 0.08
  k.rod('stainless', [X(hx), 0.85, zo + 0.05], [X(hx), 1.25, zo + 0.05], 0.014, 8)
  for (const yy of [0.88, 1.22]) k.rod('stainless', [X(hx), yy, zo], [X(hx), yy, zo + 0.05], 0.01, 6)
  k.cyl('brass', 0.016, 0.02, [X(hx), 1.32, zo + 0.008], 'z', 12)
  // overhead closer on the inside face near the hinge, arm to the frame head
  k.rbox('nut', [0.3, 0.065, 0.06], 0.015, [X(0.25), h - 0.1, zi - 0.03])
  k.box('nut', [0.25, 0.015, 0.025], [X(0.38), h - 0.05, zi - 0.075], eul(0, dir * 0.6, 0))
  // A60 label plate
  k.box('nameplate', [0.12, 0.05, 0.003], [X(0.1), h - 0.3, zo + 0.002])
  const b = k.build()
  leafCache.set(key, b)
  return b
}

export function ModuleModel({ eq }: { eq: Module }) {
  const built = useMemo(() => buildModule(eq), [eq])
  return (
    <group>
      <KitMesh data={built.shell} />
      <KitMesh data={built.interior} />
      {built.leaves.map((l, i) => (
        <Door key={`${l.id}-${i}`} tag={eq.tag} id={l.id} hinge={l.hinge} rotationY={l.rotationY} openAngle={l.openAngle}>
          <KitMesh data={leafBuilt(l.width, l.height, l.dir)} />
        </Door>
      ))}
      {built.spinners.map((s, i) => (
        <Spinner key={i} tag={eq.tag} axis="y" rpm={s.rpm} position={s.pos} rotation={s.rot}>
          <KitMesh data={fanRotor(s.r, s.blades, !!s.dark)} shadows={false} />
        </Spinner>
      ))}
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} />
      ))}
    </group>
  )
}
