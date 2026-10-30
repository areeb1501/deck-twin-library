/**
 * Vertical line-shaft caisson pump (seawater lift / firewater), built the way the real thing is:
 *
 *   - CAISSON: a steel pipe hung from a support plate on the deck, a bolted top flange at deck level
 *     (the equipment origin), guide / clamp rings every ~6 m where it passes the jacket framing,
 *     sacrificial anodes on the submerged length and an open, barred strainer end at the bottom.
 *   - PUMP (inside the caisson, drawn with x-ray-aware materials: the caisson is a `shell` skin that
 *     fades, the column a `detail` part, the bowls / shaft / bell `internal` parts that stay solid):
 *     flanged 3 m column sections with an enclosed line shaft, bearing spiders and shaft couplings,
 *     a multi-stage bowl assembly with discharge case, suction bell and basket strainer.
 *   - DISCHARGE HEAD: fabricated head on a soleplate, gusseted base, side outlet that ends exactly at
 *     the N1 nozzle base (the neck + flange are drawn by <NozzleNeck>), stuffing box with gland and
 *     leak-off, air-release valve and pressure gauge on the outlet.
 *   - DRIVER: `electric` → vertical solid-shaft TEFC motor on a windowed motor stool with a guarded
 *     rigid coupling; `diesel` → right-angle gear drive on the head, guarded cardan shaft to a diesel
 *     engine on a raised skid (radiator, turbo, exhaust silencer + tail pipe, day tank, starter
 *     batteries A/B, engine controller) — the classic offshore firewater pump arrangement.
 *
 * Paint: firewater (system 'safety') red, seawater lift blue-grey.
 *
 * Local frame (types.ts): origin = caisson top flange at deck level, +Y up, the caisson hangs to
 * y = −caissonLength. Everything above the deck is DERIVED FROM N1: the model is built in a frame whose
 * +X is the discharge direction, so the engine of a diesel set always sits opposite the discharge.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { CaissonPump } from '../../model/types'
import { NPS_SIZES, pipeOD } from '../../model/catalog'
import { dirToLocal, rotY, toLocal } from '../../model/geom'
import { paint } from '../../three/materials'
import { NozzleNeck } from '../common/NozzleNeck'
import { Kit, mat4, uvScale, type MatKey, type Orient, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { Rotors } from './machinery/Moving'
import { fanImpeller, subKit, type RotorSpec } from './machinery/rotors'
import { smallGauge, tagPlate } from './machinery/parts'
import { dialMaterial, fanGuardMaterial, meshGuardMaterial } from './machinery/textures'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const TAU = Math.PI * 2

// ------------------------------------------------------------------ materials
const RED = () => paint('#b1261d', 'detail', { metalness: 0.25, roughness: 0.42, physical: { clearcoat: 0.5, clearcoatRoughness: 0.3 } })
const BLUEGREY = () => paint('#5f7487', 'detail', { metalness: 0.3, roughness: 0.45, physical: { clearcoat: 0.35, clearcoatRoughness: 0.4 } })
/** caisson skin: coal-tar epoxy grey; fades in x-ray like a vessel shell */
const CAISSON = () => paint('#6f7774', 'shell', { metalness: 0.3, roughness: 0.65 })
/** column pipe: fades partly in x-ray so the line shaft shows */
const COLUMN = () => paint('#55697a', 'detail', { metalness: 0.35, roughness: 0.5 })
/** bowls, bell: fusion-bonded epoxy blue, stay solid in x-ray */
const BOWL = () => paint('#2f5f8a', 'internal', { metalness: 0.3, roughness: 0.45 })
const ANODE = () => paint('#9a9d9b', 'detail', { metalness: 0.55, roughness: 0.75 })
const EXHAUST = () => paint('#a3a6a2', 'detail', { metalness: 0.65, roughness: 0.38 })
const CORE = () => paint('#2a2e31', 'detail', { metalness: 0.5, roughness: 0.6 })

// ------------------------------------------------------------------ small helpers
/** Kit for a turning assembly: few materials (one or two draw calls) */
function rotorKit() {
  const r = subKit()
  r.alias = { stainless: 'flangeSteel', boltXylan: 'nut' }
  return r
}

/** Flat ring / disc (rIn = 0) between y0 and y1 along `axis` from `pos`. */
function annulus(k: Kit, mat: MatKey, rIn: number, rOut: number, y0: number, y1: number, pos: V3 = [0, 0, 0], axis: Orient = 'y', seg = 40) {
  k.lathe(mat, [[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1], [rIn, y0]], pos, axis, seg)
}

/** Open (uncapped) cylinder between two points. */
function openTube(k: Kit, mat: MatKey, a: V3, b: V3, r: number, seg = 24, r2?: number) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const d = vb.clone().sub(va)
  const L = d.length()
  if (L < 1e-6) return
  const mid = va.add(vb).multiplyScalar(0.5)
  k.add(mat, new THREE.CylinderGeometry(r2 ?? r, r, L, seg, 1, true), mat4([mid.x, mid.y, mid.z], d.toArray() as V3))
}

/** Expanded-metal guard tube between two points (UVs scaled to a ~30 mm diamond). */
function meshTube(k: Kit, a: V3, b: V3, r: number, r2?: number) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const d = vb.clone().sub(va)
  const L = d.length()
  const g = new THREE.CylinderGeometry(r2 ?? r, r, L, 28, 1, true)
  uvScale(g, TAU * Math.max(r, r2 ?? r) * 8, L * 8)
  const mid = va.add(vb).multiplyScalar(0.5)
  k.add(meshGuardMaterial(), g, mat4([mid.x, mid.y, mid.z], d.toArray() as V3))
}

/** Plate (box) from a to b: width w along `side` (made perpendicular), thickness t. */
function strut(k: Kit, mat: MatKey, a: V3, b: V3, w: number, t: number, side: V3) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const Y = B.clone().sub(A)
  const L = Y.length()
  if (L < 1e-6) return
  Y.normalize()
  const X = new THREE.Vector3(...side)
  X.addScaledVector(Y, -X.dot(Y)).normalize()
  const Z = new THREE.Vector3().crossVectors(X, Y)
  const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(A.add(B).multiplyScalar(0.5))
  k.add(mat, new THREE.BoxGeometry(w, L, t), m)
}

/** Triangular gusset in the radial plane at angle `ang` (about +Y), r0 → r1 along the plate at yPlate. */
function gusset(k: Kit, mat: MatKey, ang: number, r0: number, r1: number, yPlate: number, h: number, t: number) {
  const s = new THREE.Shape()
  s.moveTo(r0, yPlate)
  s.lineTo(r1, yPlate)
  s.lineTo(r0, yPlate + h) // h < 0 hangs below the plate
  s.closePath()
  const m = new THREE.Matrix4().makeRotationY(ang).multiply(new THREE.Matrix4().makeTranslation(0, 0, -t / 2))
  k.extrude(mat, s, t, m, 1)
}

/** Toothed (cooling-fin) section of a TEFC frame, in the XY plane. */
function finnedShape(R: number, finH: number, nFin: number) {
  const sh = new THREE.Shape()
  const step = TAU / nFin
  const finW = Math.min(0.012, step * R * 0.28)
  const da = finW / 2 / R
  const pts: [number, number][] = []
  for (let i = 0; i < nFin; i++) {
    const a = i * step
    for (let s = 0; s < 3; s++) {
      const aa = a - step / 2 + (s / 3) * (step / 2 - da)
      pts.push([Math.cos(aa) * R, Math.sin(aa) * R])
    }
    pts.push([Math.cos(a - da) * R, Math.sin(a - da) * R])
    pts.push([Math.cos(a - da * 0.6) * (R + finH), Math.sin(a - da * 0.6) * (R + finH)])
    pts.push([Math.cos(a + da * 0.6) * (R + finH), Math.sin(a + da * 0.6) * (R + finH)])
    pts.push([Math.cos(a + da) * R, Math.sin(a + da) * R])
  }
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)))
  sh.closePath()
  return sh
}

/** Quaternion turning local +Z onto n (for boxes / plates facing n). */
const faceQ = (n: V3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n).normalize())

// ------------------------------------------------------------------ build
interface Ctx {
  k: Kit
  eq: CaissonPump
  drv: MatKey
  R: number
  /** outlet base (canonical frame: discharge along +X) */
  bx: number
  bz: number
  yOut: number
  dNps: number
  dOD: number
  colR: number
  /** head barrel radius */
  rb: number
  /** top of the head cover plate */
  yTop: number
  /** line-shaft radius */
  rs: number
  /** turning assemblies (canonical frame) */
  rotors: RotorSpec[]
}

function buildCaissonPump(eq: CaissonPump) {
  const k = new Kit()
  const fw = eq.system === 'safety'
  const drv = fw ? RED() : BLUEGREY()
  const R = eq.caissonOD / 2

  // discharge nozzle (N1) in the local frame; fall back to the library default
  const n1 = eq.nozzles.find((n) => n.id === 'N1') ?? eq.nozzles[0]
  const b1: V3 = n1 ? (toLocal(eq, n1.base) as V3) : [R + 0.35, 1.1, 0]
  const dRaw = n1 ? dirToLocal(eq, n1.dir) : [1, 0, 0]
  const hl = Math.hypot(dRaw[0], dRaw[2]) || 1
  const theta = Math.atan2(-dRaw[2] / hl, dRaw[0] / hl) // rotation about +Y taking +X onto the discharge
  const bc = rotY(b1, -theta) // outlet base in the canonical frame
  const dNps = n1?.nps ?? 8
  const dOD = pipeOD(dNps)

  // column one or two sizes above the discharge, but well clear of the caisson wall
  const fits = NPS_SIZES.filter((s) => pipeOD(s) <= eq.caissonOD * 0.6)
  const colNps = fits.find((s) => s >= dNps + 2) ?? fits[fits.length - 1] ?? dNps
  const colR = pipeOD(colNps) / 2
  const reach = Math.hypot(bc[0], bc[2])
  const rb = clamp(Math.max(colR + 0.05, (dOD / 2) * 1.3), 0.14, Math.min(R + 0.05, reach - 0.1))
  const yOut = bc[1]
  const yTop = yOut + Math.max(dOD / 2, rb * 0.8) + 0.14
  const rs = clamp(0.018 + colR * 0.12, 0.025, 0.06)

  const c: Ctx = { k, eq, drv, R, bx: bc[0], bz: bc[2], yOut, dNps, dOD, colR, rb, yTop, rs, rotors: [] }
  k.with(mat4([0, 0, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta)), () => {
    caisson(c)
    pumpInternals(c)
    head(c)
    if (eq.driver === 'diesel') dieselSet(c)
    else electricMotor(c)
  })
  // rotors are built in the canonical (discharge = +X) frame: the model turns them by theta
  return { built: k.build(), headPaint: drv, rotors: c.rotors, theta }
}

// ------------------------------------------------------------------ caisson
function caisson(c: Ctx) {
  const { k, eq, R } = c
  const Lc = eq.caissonLength
  const shell = CAISSON()
  const DARK: MatKey = 'equipmentPaintDark'
  const flR = R + 0.11
  const cageH = Math.min(1.6, Lc * 0.1)
  const yCage = -Lc + cageH
  const seg = 48

  // deck support plate (square, flush with the deck) + gussets hanging under it
  const sp = 2 * flR + 0.4
  k.box(DARK, [sp, 0.05, sp], [0, -0.025, 0])
  for (let i = 0; i < 8; i++) gusset(k, DARK, (i / 8) * TAU + Math.PI / 8, R, sp / 2 - 0.04, -0.05, -0.45, 0.02)
  // top flange (origin plane)
  annulus(k, DARK, R - 0.014, flR, 0, 0.05, [0, 0, 0], 'y', seg)

  // shell (outer skin fades in x-ray; inner wall stays as a backdrop, like the vessels)
  openTube(k, shell, [0, yCage, 0], [0, -0.05, 0], R, seg)
  openTube(k, 'vesselInner', [0, yCage, 0], [0, 0.05, 0], R - 0.014, seg)
  // girth welds (12 m mill lengths)
  for (let y = -12; y > yCage + 0.5; y -= 12) annulus(k, shell, R, R + 0.004, y - 0.012, y + 0.012, [0, 0, 0], 'y', seg)

  // guide / clamp rings every ~6 m (split clamps with bolted ears, guide-frame stubs)
  for (let y = -6; y > yCage + 1; y -= 6) {
    annulus(k, DARK, R, R + 0.035, y - 0.15, y + 0.15, [0, 0, 0], 'y', seg)
    // wear-plate lips top and bottom
    for (const s of [-1, 1]) annulus(k, DARK, R + 0.035, R + 0.06, y + s * 0.15 - 0.012, y + s * 0.15 + 0.012, [0, 0, 0], 'y', seg)
    for (const s of [-1, 1]) {
      const z = s * (R + 0.035 + 0.07)
      for (const dx of [-0.028, 0.028]) k.box(DARK, [0.022, 0.28, 0.14], [dx, y, z])
      for (const dy of [-0.08, 0.08]) {
        k.cyl('boltXylan', 0.011, 0.15, [0, y + dy, z + 0.02], 'x', 8)
        for (const sx of [-1, 1]) k.hex('nut', 0.036, 0.018, [sx * 0.05, y + dy, z + 0.02], 'x')
      }
    }
    // guide-frame stubs towards the jacket bracing (cut ends)
    for (const s of [-1, 1]) {
      const x0 = s * (R + 0.035)
      const x1 = s * (R + 0.75)
      k.box(DARK, [Math.abs(x1 - x0), 0.012, 0.2], [(x0 + x1) / 2, y + 0.14, 0])
      k.box(DARK, [Math.abs(x1 - x0), 0.012, 0.2], [(x0 + x1) / 2, y - 0.14, 0])
      k.box(DARK, [Math.abs(x1 - x0), 0.28, 0.012], [(x0 + x1) / 2, y, 0])
    }
  }

  // sacrificial anodes on the lower, submerged length
  const anodeRows = Math.min(3, Math.floor((Lc - cageH - 2) / 4))
  for (let r = 0; r < anodeRows; r++) {
    const ya = yCage + 1.6 + r * 4
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + r * 0.6
      const ux = Math.cos(a)
      const uz = Math.sin(a)
      for (const dy of [-0.5, 0.5]) k.rod('equipmentPaintDark', [ux * R, ya + dy, uz * R], [ux * (R + 0.13), ya + dy, uz * (R + 0.13)], 0.012, 6)
      k.box(ANODE(), [0.13, 0.85, 0.12], [ux * (R + 0.15), ya, uz * (R + 0.15)], faceQ([ux, 0, uz]))
    }
  }

  // open strainer end: vertical bars between hoop rings, heavy bottom ring
  const nBars = Math.max(16, Math.round((TAU * R) / 0.11))
  for (let i = 0; i < nBars; i++) {
    const a = (i / nBars) * TAU
    k.rod(shell, [Math.cos(a) * (R - 0.012), yCage + 0.02, Math.sin(a) * (R - 0.012)], [Math.cos(a) * (R - 0.012), -Lc + 0.06, Math.sin(a) * (R - 0.012)], 0.016, 6)
  }
  annulus(k, DARK, R - 0.03, R + 0.02, yCage - 0.03, yCage + 0.05, [0, 0, 0], 'y', seg)
  annulus(k, DARK, R - 0.03, R + 0.02, yCage - cageH / 2 - 0.02, yCage - cageH / 2 + 0.02, [0, 0, 0], 'y', seg)
  annulus(k, DARK, R - 0.04, R + 0.03, -Lc, -Lc + 0.08, [0, 0, 0], 'y', seg)
}

// ------------------------------------------------------------------ pump inside the caisson
function pumpInternals(c: Ctx) {
  const { k, eq, R, colR, rs } = c
  const Lc = eq.caissonLength
  const bowl = BOWL()
  const col = COLUMN()
  const STEEL: MatKey = 'internalsSteel'
  const bowlR = clamp(Math.min(R - 0.06, colR * 1.9), colR * 1.15, R - 0.03)
  const nSt = clamp(Math.round(2 + eq.motorKw / 450), 2, 8)
  const hSt = bowlR * 0.95
  const yBell = -Lc + Math.min(1.1, Lc * 0.08)
  const hBell = bowlR * 0.75

  // basket strainer under the bell
  const hBk = Math.min(0.45, yBell + Lc - 0.1)
  const rBk = bowlR * 0.95
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU
    k.rod(STEEL, [Math.cos(a) * rBk, yBell - hBk, Math.sin(a) * rBk], [Math.cos(a) * rBk * 1.08, yBell, Math.sin(a) * rBk * 1.08], 0.008, 5)
  }
  annulus(k, STEEL, 0, rBk + 0.01, yBell - hBk - 0.012, yBell - hBk, [0, 0, 0], 'y', 32)
  annulus(k, STEEL, rBk * 0.95, rBk * 1.1, yBell - hBk * 0.5 - 0.01, yBell - hBk * 0.5 + 0.01, [0, 0, 0], 'y', 32)
  // suction bell (flared, open below)
  k.lathe(bowl, [
    [bowlR * 1.0, yBell + 0.02],
    [bowlR * 1.22, yBell],
    [bowlR * 1.24, yBell + 0.03],
    [bowlR * 1.05, yBell + hBell * 0.35],
    [bowlR * 0.88, yBell + hBell],
    [bowlR * 0.74, yBell + hBell],
    [bowlR * 0.82, yBell + hBell * 0.5],
    [bowlR * 1.0, yBell + 0.02],
  ], [0, 0, 0], 'y', 36)
  // bowls (one per stage) with bolted flanges
  const yb0 = yBell + hBell
  for (let i = 0; i < nSt; i++) {
    const y0 = yb0 + i * hSt
    k.lathe(bowl, [
      [bowlR * 0.84, y0],
      [bowlR * 0.97, y0 + hSt * 0.06],
      [bowlR, y0 + hSt * 0.2],
      [bowlR, y0 + hSt * 0.62],
      [bowlR * 0.9, y0 + hSt * 0.9],
      [bowlR * 0.84, y0 + hSt],
    ], [0, 0, 0], 'y', 36)
    annulus(k, bowl, bowlR * 0.8, bowlR * 1.05, y0 - 0.018, y0 + 0.018, [0, 0, 0], 'y', 36)
    k.boltCircle('boltXylan', 'nut', 8, bowlR * 0.96, [0, y0 - 0.03, 0], 'y', 0.014, 0.07, [0.006, 0.06])
  }
  const yb1 = yb0 + nSt * hSt
  annulus(k, bowl, bowlR * 0.8, bowlR * 1.05, yb1 - 0.018, yb1 + 0.018, [0, 0, 0], 'y', 36)
  // discharge case: cone up to the column
  const yDc = yb1 + bowlR * 0.8
  k.lathe(bowl, [
    [bowlR * 0.86, yb1],
    [bowlR * 0.82, yb1 + bowlR * 0.2],
    [colR * 1.05, yDc - 0.04],
    [colR * 1.05, yDc],
  ], [0, 0, 0], 'y', 36)

  // column: flanged 3 m sections from the head base down to the discharge case
  const yTopCol = 0.08
  openTube(k, col, [0, yDc, 0], [0, yTopCol, 0], colR, 32)
  const joints: number[] = [yDc + 0.04]
  for (let y = yTopCol - 3; y > yDc + 0.5; y -= 3) joints.push(y)
  joints.push(yTopCol - 0.06)
  const fR = colR + 0.065
  for (const y of joints) {
    annulus(k, col, colR - 0.004, fR, y - 0.035, y + 0.035, [0, 0, 0], 'y', 32)
    k.boltCircle('boltXylan', 'nut', 8, colR + 0.035, [0, y - 0.06, 0], 'y', 0.016, 0.12, [0.012, 0.108])
  }
  // line shaft + bearing spiders + threaded couplings
  k.cyl(STEEL, rs, c.yTop + 0.25 - (yb0 + 0.05), [0, (c.yTop + 0.25 + yb0 + 0.05) / 2, 0], 'y', 14)
  for (const y of joints.slice(1, -1)) {
    annulus(k, STEEL, colR * 0.86, colR * 0.94, y - 0.04, y + 0.04, [0, 0, 0], 'y', 24)
    k.cyl('brass', rs * 1.7, 0.14, [0, y, 0], 'y', 14)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU
      k.rod(STEEL, [Math.cos(a) * rs * 1.6, y, Math.sin(a) * rs * 1.6], [Math.cos(a) * colR * 0.88, y, Math.sin(a) * colR * 0.88], 0.012, 6)
    }
    k.cyl(STEEL, rs * 1.6, 0.16, [0, y + 0.35, 0], 'y', 14) // shaft coupling sleeve
  }
}

// ------------------------------------------------------------------ discharge head
function head(c: Ctx) {
  const { k, R, rb, yOut, yTop, dOD, bx, bz, drv, rs } = c
  const flR = R + 0.11
  const DARK: MatKey = 'equipmentPaintDark'
  const yBase = 0.08 // soleplate top
  const yHb = 0.13 // head base plate top

  // soleplate (machined, square) on the caisson flange + head base plate + studs
  k.box(DARK, [2 * flR + 0.12, 0.03, 2 * flR + 0.12], [0, 0.065, 0])
  annulus(k, drv, 0, flR - 0.01, yBase, yHb, [0, 0, 0], 'y', 48)
  k.boltCircle('boltXylan', 'nut', Math.max(8, Math.round((TAU * (R + 0.06)) / 0.16)), R + 0.06, [0, 0.0, 0], 'y', 0.022, 0.17, [0.145])
  // jack screws / leveling bolts at the soleplate corners
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p: V3 = [sx * (flR + 0.02), 0.08, sz * (flR + 0.02)]
      k.hex('nut', 0.04, 0.025, [p[0], p[1] + 0.012, p[2]])
      k.cyl('boltXylan', 0.01, 0.06, [p[0], p[1] + 0.03, p[2]], 'y', 6)
    }

  // barrel + gussets
  openTube(k, drv, [0, yHb, 0], [0, yTop, 0], rb, 40)
  k.lathe(drv, [[rb * 1.5, yHb], [rb * 1.18, yHb + 0.06], [rb, yHb + 0.14]], [0, 0, 0], 'y', 40)
  const nG = 6
  for (let i = 0; i < nG; i++) {
    const a = (i / nG) * TAU + Math.PI / nG // skip the outlet direction (a = 0)
    gusset(k, drv, a, rb * 0.98, flR - 0.05, yHb, Math.min(0.5, yOut - dOD / 2 - yHb - 0.04), 0.018)
  }
  // top cover plate + bolts
  annulus(k, drv, 0, rb + 0.05, yTop - 0.04, yTop, [0, 0, 0], 'y', 40)
  k.boltCircle('boltXylan', 'nut', 8, rb + 0.025, [0, yTop - 0.06, 0], 'y', 0.014, 0.08, [0.07])

  // side outlet ending exactly at the N1 nozzle base (slightly fuller than the neck it receives)
  const t = bx // projection of the base onto the discharge axis (canonical frame)
  const a0: V3 = [0, yOut, bz]
  const a1: V3 = [t, yOut, bz]
  k.rod(drv, a0, a1, dOD / 2 + 0.006, 32)
  k.cyl(drv, dOD / 2 + 0.03, 0.03, [rb + 0.012, yOut, bz], 'x', 32) // reinforcing pad / weld bead
  // outlet support rib under the branch
  k.box(drv, [Math.max(0.05, t - rb - 0.12), Math.max(0.05, yOut - dOD / 2 - yHb), 0.016], [rb + (t - rb - 0.12) / 2, (yOut - dOD / 2 + yHb) / 2, bz])

  // stuffing box (packing) housing, gland, gland studs, leak-off drain
  const ySb = yTop
  k.cyl(drv, rs * 3.4, 0.16, [0, ySb + 0.08, 0], 'y', 28)
  annulus(k, drv, rs * 1.2, rs * 3.9, ySb + 0.15, ySb + 0.18, [0, 0, 0], 'y', 28)
  k.cyl('stainless', rs * 2.6, 0.05, [0, ySb + 0.205, 0], 'y', 24)
  annulus(k, 'stainless', rs * 1.1, rs * 3.4, ySb + 0.23, ySb + 0.245, [0, 0, 0], 'y', 24)
  for (const s of [-1, 1]) {
    k.cyl('boltXylan', 0.008, 0.12, [0, ySb + 0.22, s * rs * 3.0], 'y', 6)
    k.hex('nut', 0.026, 0.014, [0, ySb + 0.255, s * rs * 3.0])
  }
  const lk: V3 = [-rs * 3.4, ySb + 0.06, 0]
  k.tube('tubing', [lk, [-rb - 0.06, ySb + 0.03, 0], [-rb - 0.06, yHb + 0.04, 0], [-rb - 0.06, yHb + 0.04, rb * 0.9]], 0.008)

  // air release / vacuum breaker valve on top of the outlet
  const xa = rb + (t - rb) * 0.55
  const yTopBr = yOut + dOD / 2
  k.cyl(drv, 0.03, 0.08, [xa, yTopBr + 0.03, bz], 'y', 14)
  annulus(k, 'flangeSteel', 0, 0.06, yTopBr + 0.07, yTopBr + 0.09, [xa, 0, bz], 'y', 18)
  k.box('valveBody', [0.08, 0.1, 0.07], [xa, yTopBr + 0.14, bz]) // isolating gate valve
  k.cyl('handwheel', 0.006, 0.08, [xa, yTopBr + 0.23, bz], 'y', 6)
  k.handwheel('handwheel', 0.1, [xa, yTopBr + 0.27, bz], 'y')
  k.cyl('castIron', 0.065, 0.16, [xa + 0.13, yTopBr + 0.2, bz], 'y', 20) // ARV body
  k.dome('castIron', 0.065, [xa + 0.13, yTopBr + 0.28, bz], 'y', Math.PI / 2, 0.6, 20)
  k.rod('castIron', [xa, yTopBr + 0.14, bz], [xa + 0.13, yTopBr + 0.14, bz], 0.022, 10)
  const zDr = bz - dOD / 2 - 0.12 // ARV discharge piped down beside (not through) the outlet
  k.tube('tubing', [[xa + 0.19, yTopBr + 0.24, bz], [xa + 0.19, yTopBr + 0.24, zDr], [xa + 0.19, yHb + 0.02, zDr]], 0.012)

  // pressure gauge on the outlet with root valve + siphon
  const xg = rb + (t - rb) * 0.22
  const n: V3 = [0, 0, 1]
  k.cyl('stainless', 0.012, 0.1, [xg, yTopBr + 0.05, bz], 'y', 8)
  k.hex('stainless', 0.04, 0.035, [xg, yTopBr + 0.09, bz])
  k.torus('stainless', 0.025, 0.006, [xg, yTopBr + 0.14, bz], 'z', 6, 18)
  k.cyl('stainless', 0.01, 0.05, [xg, yTopBr + 0.19, bz], 'y', 8)
  smallGauge(k, [xg, yTopBr + 0.26, bz + 0.02], n, dialMaterial('bar', 25), 0.1)

  // head drain plug, lifting lugs, tag plate
  k.hex('nut', 0.04, 0.03, [-rb * 1.2, yHb + 0.02, -rb * 0.6])
  for (const s of [-1, 1]) {
    k.box(drv, [0.12, 0.1, 0.02], [0, yTop + 0.05, s * (rb + 0.02)])
    k.torus('nut', 0.025, 0.007, [0, yTop + 0.08, s * (rb + 0.02)], 'z', 6, 14)
  }
  tagPlate(k, c.eq.tag, [0, (yHb + yTop) / 2 + 0.05, rb + 0.003], 'z', 0.16)
}

// ------------------------------------------------------------------ electric driver
function electricMotor(c: Ctx) {
  const { k, eq, yTop, rb, rs, drv } = c
  const kw = eq.motorKw
  const Rm = clamp(0.12 + 0.03 * Math.pow(Math.max(kw, 1), 0.42), 0.26, 0.8)
  const Hm = clamp(1.9 * Rm + 0.45, 0.9, 2.2)
  const finH = Math.max(0.014, Rm * 0.1)

  // motor stool: flanged ends, 4 legs, expanded-metal window guards, coupling inside
  const yS0 = yTop
  const hS = clamp(0.62 + Rm * 0.35, 0.68, 0.95)
  const yS1 = yS0 + hS
  const rS0 = Math.max(rb + 0.02, Rm * 0.7)
  const rS1 = Rm * 1.02
  annulus(k, drv, rS0 - 0.08, rS0 + 0.05, yS0 - 0.01, yS0 + 0.04, [0, 0, 0], 'y', 40)
  annulus(k, drv, rS1 - 0.1, rS1 + 0.06, yS1 - 0.045, yS1, [0, 0, 0], 'y', 40)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4
    const u: V3 = [Math.cos(a), 0, Math.sin(a)]
    const tng: V3 = [-u[2], 0, u[0]]
    strut(k, drv, [u[0] * (rS0 - 0.01), yS0 + 0.04, u[2] * (rS0 - 0.01)], [u[0] * (rS1 - 0.03), yS1 - 0.045, u[2] * (rS1 - 0.03)], Math.max(0.1, Rm * 0.28), 0.03, tng)
  }
  meshTube(k, [0, yS0 + 0.04, 0], [0, yS1 - 0.045, 0], rS0 + 0.012, rS1 - 0.012)
  // pump shaft + adjustable flanged coupling + motor shaft
  // (the whole shaft line turns while the pump runs: drawn as a rotor about the shaft axis, origin yC)
  const yC = yS0 + Math.max(0.42, hS * 0.55)
  {
    const r = rotorKit()
    r.cyl('stainless', rs, yC - yTop - 0.2, [0, (yTop + 0.2 - yC) / 2, 0], 'y', 14)
    r.cyl('flangeSteel', rs * 2.3, 0.1, [0, -0.07, 0], 'y', 20)
    r.cyl('flangeSteel', rs * 3.6, 0.035, [0, -0.02, 0], 'y', 24)
    r.cyl('nut', rs * 2.2, 0.03, [0, 0.005, 0], 'y', 16) // adjusting nut
    r.cyl('flangeSteel', rs * 3.6, 0.035, [0, 0.03, 0], 'y', 24)
    r.cyl('flangeSteel', rs * 2.3, 0.1, [0, 0.1, 0], 'y', 20)
    r.boltCircle('boltXylan', 'nut', 6, rs * 2.9, [0, -0.05, 0], 'y', 0.01, 0.11, [0.005, 0.1])
    r.cyl('stainless', rs * 1.1, yS1 - yC - 0.1, [0, (yS1 - yC + 0.1) / 2, 0], 'y', 14)
    // keys in the hub keyways + a paint mark, so the turning shows
    for (const y of [-0.07, 0.1]) r.box('nut', [rs * 0.5, 0.09, rs * 0.5], [rs * 2.3, y, 0])
    r.box('nut', [rs * 0.4, 0.25, rs * 0.4], [rs * 1.1, -0.3, 0])
    c.rotors.push({ built: r.build(), axis: 'y', pos: [0, yC, 0], rpm: 155 })
  }

  // motor: D-flange, lower end shield, finned frame, upper shield, fan cowl + drip canopy
  const shL = Math.max(0.06, Rm * 0.22)
  const yF = yS1
  annulus(k, drv, 0, Rm * 1.12, yF, yF + 0.05, [0, 0, 0], 'y', 48)
  k.boltCircle('boltXylan', 'nut', 8, Rm * 1.04, [0, yF - 0.04, 0], 'y', 0.018, 0.12, [0.105], Math.PI / 8)
  const y0f = yF + 0.05 + shL
  const yM1 = yF + 0.05 + Hm
  const y1f = yM1 - shL
  k.lathe(drv, [[Rm * 0.6, yF + 0.05], [Rm + finH * 0.6, yF + 0.05 + shL * 0.55], [Rm + finH * 0.6, y0f]], [0, 0, 0], 'y', 48)
  const nFin = Math.max(28, Math.round(Rm * 100))
  k.extrude(drv, finnedShape(Rm, finH, nFin), y1f - y0f, new THREE.Matrix4().makeTranslation(0, y0f, 0).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)), 2)
  k.lathe(drv, [[Rm + finH * 0.6, y1f], [Rm + finH * 0.6, y1f + shL * 0.4], [Rm * 0.7, yM1]], [0, 0, 0], 'y', 48)
  // bearing-housing bolts on the lower shield
  k.boltCircle('nut', 'nut', 8, Rm + finH * 0.3, [0, yF + 0.05 + shL * 0.7, 0], 'y', Math.max(0.01, Rm * 0.03), 0.03, [0.02])
  const cR = Rm + finH + 0.015
  const cowlH = Math.max(0.16, Rm * 0.45)
  k.lathe(drv, [
    [cR - 0.005, y1f - shL * 0.3],
    [cR, y1f - shL * 0.3],
    [cR, yM1 + cowlH * 0.8],
    [cR * 0.94, yM1 + cowlH],
    [cR * 0.94 - 0.004, yM1 + cowlH],
  ], [0, 0, 0], 'y', 48)
  k.disc('rubberBlack', cR * 0.9, [0, yM1 + cowlH - 0.02, 0], 'y', 32)
  k.disc(fanGuardMaterial(), cR * 0.92, [0, yM1 + cowlH + 0.001, 0], 'y', 32)
  // drip-proof canopy on standoffs (air drawn in under its rim)
  const yCan = yM1 + cowlH + Math.max(0.07, Rm * 0.14)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU
    k.rod(drv, [Math.cos(a) * cR * 0.88, yM1 + cowlH, Math.sin(a) * cR * 0.88], [Math.cos(a) * cR * 0.88, yCan, Math.sin(a) * cR * 0.88], 0.012, 6)
  }
  k.lathe(drv, [[cR * 1.12, yCan - 0.04], [cR * 1.12, yCan], [cR * 0.4, yCan + Math.max(0.05, Rm * 0.1)], [0, yCan + Math.max(0.05, Rm * 0.1)]], [0, 0, 0], 'y', 48)
  k.lathe(drv, [[0, yCan - 0.005], [cR * 1.1, yCan - 0.04]], [0, 0, 0], 'y', 48)

  // terminal box (+Z), auxiliary (heater / RTD) box (−Z), cables to deck
  const tb = clamp(Rm * 0.75, 0.2, 0.5)
  const yT = yF + Hm * 0.45
  const zT = Rm + finH + tb * 0.28
  k.box(drv, [tb * 0.5, tb * 0.5, finH + 0.03], [0, yT, Rm + finH * 0.5])
  k.rbox(drv, [tb * 1.1, tb * 0.9, tb * 0.55], tb * 0.06, [0, yT, zT])
  k.rbox(drv, [tb * 1.0, tb * 0.8, tb * 0.06], tb * 0.03, [0, yT, zT + tb * 0.3])
  k.around(6, tb * 0.42, [0, yT, zT + tb * 0.335], 'z', (p) => k.hex('nut', 0.016, 0.01, p, 'z'), Math.PI / 6)
  for (const dx of [-tb * 0.25, tb * 0.25]) {
    k.cyl('brass', tb * 0.08, tb * 0.14, [dx, yT - tb * 0.5, zT], 'y', 12)
    k.spline('cable', [[dx, yT - tb * 0.56, zT], [dx, yT - tb * 1.4, zT + 0.04], [dx * 1.4, (yT + 0.2) / 2, zT + 0.1], [dx * 1.6, 0.03, zT + 0.12]], tb * 0.065, 8, 30)
  }
  const ta = tb * 0.5
  k.rbox(drv, [ta, ta * 0.8, ta * 0.45], ta * 0.08, [0, yT + tb * 0.2, -(Rm + finH + ta * 0.22)])
  k.cyl('brass', ta * 0.1, ta * 0.18, [0, yT + tb * 0.2 - ta * 0.45, -(Rm + finH + ta * 0.22)], 'y', 10)
  k.spline('cable', [[0, yT + tb * 0.2 - ta * 0.5, -(Rm + finH + ta * 0.22)], [0, yT - 0.4, -(Rm + finH + 0.12)], [0.1, 0.03, -(Rm + finH + 0.15)]], 0.012, 6, 24)

  // lifting lugs on the upper frame, nameplate, earth boss, vibration probes
  for (const s of [-1, 1]) {
    const x = s * (Rm + finH + 0.03)
    k.box(drv, [0.08, 0.16, 0.035], [x, y1f - 0.06, 0])
    k.torus('nut', 0.035, 0.009, [x + s * 0.02, y1f + 0.03, 0], 'z', 6, 14)
  }
  k.box('nameplate', [Rm * 0.45, Rm * 0.28, 0.003], [Rm * 0.62, yF + Hm * 0.7, Rm * 0.62 + finH + 0.01], faceQ([0.707, 0, 0.707]))
  k.cyl('brass', 0.012, 0.03, [-(Rm + finH * 0.5) * 0.7, yF + 0.2, (Rm + finH * 0.5) * 0.7], [-0.7, 0, 0.7], 8)
  for (const a of [Math.PI / 2 + 0.6, Math.PI / 2 - 0.6]) {
    const u: V3 = [Math.cos(a), 0, Math.sin(a)]
    k.rod('stainless', [u[0] * (Rm * 0.75), yF + 0.05 + shL * 0.5, u[2] * (Rm * 0.75)], [u[0] * (Rm * 0.75 + 0.08), yF + 0.05 + shL * 0.5 + 0.04, u[2] * (Rm * 0.75 + 0.08)], 0.012, 8)
  }
}

// ------------------------------------------------------------------ diesel driver
function dieselSet(c: Ctx) {
  const { k, eq, yTop, rb, rs, drv } = c
  const kw = eq.motorKw
  const DARK: MatKey = 'equipmentPaintDark'
  const ex = EXHAUST()

  // ---- right-angle gear drive on a short guarded stand on the head
  const Rg = clamp(0.2 + 0.00011 * kw, 0.24, 0.45)
  const yG0 = yTop
  const hGs = 0.45
  const yG1 = yG0 + hGs
  const rSt = Math.max(rb + 0.02, Rg * 0.85)
  annulus(k, drv, rSt - 0.07, rSt + 0.05, yG0 - 0.01, yG0 + 0.04, [0, 0, 0], 'y', 40)
  annulus(k, drv, rSt - 0.07, rSt + 0.05, yG1 - 0.04, yG1, [0, 0, 0], 'y', 40)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4
    k.box(drv, [0.08, hGs - 0.08, 0.025], [Math.cos(a) * rSt, (yG0 + yG1) / 2, Math.sin(a) * rSt], faceQ([Math.cos(a), 0, Math.sin(a)]))
  }
  meshTube(k, [0, yG0 + 0.04, 0], [0, yG1 - 0.04, 0], rSt + 0.01)
  k.cyl('stainless', rs, yG1 - yTop - 0.2, [0, (yG1 + yTop + 0.2) / 2, 0], 'y', 14)
  k.cyl('flangeSteel', rs * 3.2, 0.05, [0, yG0 + 0.36, 0], 'y', 20)
  // gearbox: base flange, finned vertical housing, horizontal bevel-gear housing
  const Hl = Rg * 1.0
  annulus(k, drv, 0, Rg * 1.18, yG1, yG1 + 0.05, [0, 0, 0], 'y', 40)
  k.boltCircle('boltXylan', 'nut', 8, Rg * 1.08, [0, yG1 - 0.03, 0], 'y', 0.016, 0.1, [0.09], Math.PI / 8)
  k.cyl(drv, Rg, Hl, [0, yG1 + 0.05 + Hl / 2, 0], 'y', 40)
  for (let i = 1; i <= 5; i++) annulus(k, drv, Rg, Rg + 0.03, yG1 + 0.05 + (Hl * i) / 6 - 0.006, yG1 + 0.05 + (Hl * i) / 6 + 0.006, [0, 0, 0], 'y', 40)
  const yIn = yG1 + 0.05 + Hl + Rg * 0.5
  const rH = Rg * 0.82
  k.cyl(drv, Rg * 0.9, yIn - (yG1 + 0.05 + Hl), [0, (yIn + yG1 + 0.05 + Hl) / 2, 0], 'y', 40)
  k.cyl(drv, rH, Rg * 1.75, [-Rg * 0.25, yIn, 0], 'x', 40)
  k.dome(drv, rH, [Rg * 0.62, yIn, 0], 'x', Math.PI / 2, 0.35, 32)
  k.cyl(drv, Rg * 0.92, 0.06, [0, yIn + rH * 0.75, 0], 'y', 40) // top cover
  k.boltCircle('boltXylan', 'nut', 8, Rg * 0.8, [0, yIn + rH * 0.75, 0], 'y', 0.012, 0.05, [0.04])
  // input bearing housing + companion flange (towards −X)
  const xIn0 = -Rg * 1.12
  k.cyl(drv, Rg * 0.42, 0.06, [xIn0 + 0.03, yIn, 0], 'x', 32)
  k.cyl(drv, Rg * 0.34, 0.18, [xIn0 - 0.09, yIn, 0], 'x', 28)
  const xGi = xIn0 - 0.22
  k.cyl('stainless', 0.04, 0.06, [xGi + 0.03, yIn, 0], 'x', 14)
  k.cyl('flangeSteel', 0.11, 0.035, [xGi, yIn, 0], 'x', 24)
  // oil sight glass, breather, fill plug, drain, nameplate, lifting eyes
  k.cyl('brass', 0.04, 0.02, [0, yG1 + 0.05 + Hl * 0.3, Rg + 0.01], 'z', 18)
  k.disc('glass', 0.03, [0, yG1 + 0.05 + Hl * 0.3, Rg + 0.021], 'z', 18)
  k.cyl('brass', 0.012, 0.06, [-Rg * 0.4, yIn + rH * 0.75 + 0.06, Rg * 0.3], 'y', 8)
  k.sphere('brass', 0.025, [-Rg * 0.4, yIn + rH * 0.75 + 0.1, Rg * 0.3], undefined, 10)
  k.hex('nut', 0.05, 0.03, [Rg * 0.3, yIn + rH * 0.75 + 0.045, -Rg * 0.3])
  k.hex('nut', 0.04, 0.025, [Rg * 0.7, yG1 + 0.1, Rg * 0.7], [0.7, 0, 0.7])
  k.box('nameplate', [0.16, 0.1, 0.003], [Rg * 0.5, yG1 + 0.05 + Hl * 0.6, Rg * 0.866 + 0.004], faceQ([0.5, 0, 0.866]))
  for (const s of [-1, 1]) k.torus('nut', 0.035, 0.009, [0, yIn + rH * 0.75 + 0.06, s * Rg * 0.6], 'z', 6, 14)

  // ---- engine dimensions (scaled from kW, clamped to fit the cellar deck)
  const Le = clamp(1.3 + 0.0011 * kw, 1.4, 3.2)
  const We = clamp(0.75 + 0.00028 * kw, 0.8, 1.5)
  const He = clamp(0.9 + 0.0004 * kw, 0.9, 1.8)
  const hc = clamp(0.5 + 0.00012 * kw, 0.55, 0.8) // crank above skid top
  const vee = kw > 1100

  // ---- cardan shaft (slightly inclined, as installed) with guard
  const Ls = 1.1
  const drop = 0.09
  const xF = xGi - 0.04 - Ls // engine flywheel output flange
  const yCr = yIn - drop
  const P1 = new THREE.Vector3(xGi - 0.02, yIn, 0)
  const P2 = new THREE.Vector3(xF + 0.02, yCr, 0)
  const dir = P1.clone().sub(P2).normalize()
  const at = (t: number) => P2.clone().lerp(P1, t).toArray() as V3
  {
    // yokes, spiders, slip sleeve and tube turn (rotor along +X about the shaft midpoint)
    const Lsh = P1.distanceTo(P2)
    const r = rotorKit()
    const xt = (t: number) => -Lsh / 2 + t * Lsh
    for (const [x0, s] of [[Lsh / 2, -1], [-Lsh / 2, 1]] as [number, number][]) {
      r.cyl('flangeSteel', 0.11, 0.03, [x0 + s * 0.05, 0, 0], 'x', 24) // flange yoke
      const j = x0 + s * 0.13
      for (const zz of [-1, 1]) r.box('flangeSteel', [0.1, 0.05, 0.03], [j, 0, zz * 0.06])
      r.box('nut', [0.04, 0.13, 0.04], [j, 0, 0]) // cross / spider
      r.box('nut', [0.04, 0.04, 0.13], [j, 0, 0])
      const j2 = x0 + s * 0.2
      for (const yy of [-1, 1]) r.box('flangeSteel', [0.1, 0.03, 0.05], [j2, yy * 0.06, 0])
    }
    r.cyl('stainless', 0.06, (0.55 - 0.22) * Lsh, [xt(0.385), 0, 0], 'x', 18) // slip-yoke sleeve
    r.cyl('flangeSteel', 0.045, (0.82 - 0.18) * Lsh, [0, 0, 0], 'x', 18) // tube
    r.box('nut', [0.06, 0.02, 0.04], [xt(0.68), 0.05, 0]) // balance weight
    const mid = P1.clone().add(P2).multiplyScalar(0.5)
    c.rotors.push({ built: r.build(), axis: 'x', pos: mid.toArray() as V3, rot: [0, 0, Math.atan2(dir.y, dir.x)], rpm: 150 })
  }
  meshTube(k, at(0.06), at(0.94), 0.2)
  for (const tt of [0.06, 0.94]) k.torus('safetyYellow', 0.2, 0.012, at(tt), dir.toArray() as V3, 6, 28)
  // guard support legs
  for (const tt of [0.3, 0.7]) {
    const p = at(tt)
    k.rod('safetyYellow', [p[0], p[1] - 0.2, p[2]], [p[0], 0.02, p[2]], 0.02, 8)
    k.box('safetyYellow', [0.14, 0.012, 0.14], [p[0], 0.006, p[2]])
  }

  // ---- raised engine skid (pedestal frame)
  const yk = yCr - hc // skid top
  const zb = We / 2 + 0.1
  const xBack = xF - 0.3 // block rear face (flywheel housing between)
  const xFront = xBack - Le
  const xRad = xFront - 0.45
  const xs1 = xF + 0.12
  const xs0 = xRad - 0.25
  const Lk = xs1 - xs0
  const xm = (xs0 + xs1) / 2
  const hbm = 0.22
  for (const s of [-1, 1]) {
    const z = s * zb
    k.box(DARK, [Lk, 0.016, 0.16], [xm, yk - 0.008, z])
    k.box(DARK, [Lk, 0.016, 0.16], [xm, yk - hbm + 0.008, z])
    k.box(DARK, [Lk, hbm, 0.012], [xm, yk - hbm / 2, z])
  }
  for (const x of [xs0 + 0.08, xs1 - 0.08]) k.box(DARK, [0.14, hbm * 0.8, 2 * zb], [x, yk - hbm / 2, 0])
  k.box(DARK, [Lk - 0.2, 0.008, 2 * zb - 0.1], [xm, yk - hbm + 0.03, 0]) // drip tray
  const nP = Math.max(2, Math.ceil(Lk / 1.6) + 1)
  const yPost = yk - hbm
  if (yPost > 0.05) {
    for (let i = 0; i < nP; i++) {
      const x = xs0 + 0.1 + ((Lk - 0.2) * i) / (nP - 1)
      for (const s of [-1, 1]) {
        k.box(DARK, [0.16, yPost, 0.012], [x, yPost / 2, s * zb])
        k.box(DARK, [0.012, yPost, 0.16], [x - 0.074, yPost / 2, s * zb])
        k.box(DARK, [0.012, yPost, 0.16], [x + 0.074, yPost / 2, s * zb])
        k.box(DARK, [0.26, 0.02, 0.26], [x, 0.01, s * zb])
        if (i < nP - 1) {
          const x2 = xs0 + 0.1 + ((Lk - 0.2) * (i + 1)) / (nP - 1)
          k.rod('structSteelDark', [x + 0.08, 0.05, s * zb], [x2 - 0.08, yPost - 0.04, s * zb], 0.03, 8)
        }
      }
    }
  }

  // ---- engine
  const xEm = (xBack + xFront) / 2
  const yBlk0 = yCr - 0.12
  const hBlk = He * 0.62
  const yBT = yBlk0 + hBlk // block top / head deck
  k.rbox(drv, [Le, hBlk, We * 0.72], 0.04, [xEm, yBlk0 + hBlk / 2, 0])
  k.rbox(drv, [Le * 0.88, yBlk0 - (yk + 0.06), We * 0.55], 0.03, [xEm, (yBlk0 + yk + 0.06) / 2, 0]) // oil sump
  // crankcase doors along both sides
  const nCyl = 6
  const pitch = (Le * 0.9) / nCyl
  for (let i = 0; i < nCyl; i++) {
    const x = xFront + Le * 0.05 + pitch * (i + 0.5)
    for (const s of [-1, 1]) k.rbox(drv, [pitch * 0.6, hBlk * 0.3, 0.02], 0.01, [x, yBlk0 + hBlk * 0.3, s * We * 0.36])
  }
  // engine mounts on anti-vibration pads
  for (const x of [xFront + 0.2, xBack - 0.2])
    for (const s of [-1, 1]) {
      k.box(drv, [0.16, 0.05, zb - We * 0.36], [x, yBlk0 + 0.06, s * (We * 0.36 + (zb - We * 0.36) / 2)])
      k.cyl('rubberBlack', 0.06, 0.06, [x, yk + 0.03, s * zb], 'y', 16)
      k.box(drv, [0.14, yBlk0 + 0.06 - yk - 0.06, 0.04], [x, (yBlk0 + 0.06 + yk + 0.06) / 2, s * zb])
    }
  // cylinder heads + rocker covers (inline 6, or a V12 above 1100 kW)
  const banks: { z: number; tilt: number }[] = vee ? [{ z: -We * 0.18, tilt: 0.45 }, { z: We * 0.18, tilt: -0.45 }] : [{ z: 0, tilt: 0 }]
  const wHead = vee ? We * 0.32 : We * 0.55
  for (const b of banks) {
    k.at([0, yBT, b.z], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), b.tilt), () => {
      for (let i = 0; i < nCyl; i++) {
        const x = xFront + Le * 0.05 + pitch * (i + 0.5)
        k.rbox(drv, [pitch * 0.94, 0.17, wHead], 0.012, [x, 0.085, 0])
        k.rbox('castIron', [pitch * 0.82, 0.1, wHead * 0.78], 0.035, [x, 0.215, 0])
        for (const dx of [-pitch * 0.25, pitch * 0.25]) k.hex('nut', 0.025, 0.02, [x + dx, 0.275, 0])
      }
      // fuel injection lines
      for (let i = 0; i < nCyl; i++) {
        const x = xFront + Le * 0.05 + pitch * (i + 0.5)
        k.tube('tubing', [[x, 0.17, -wHead * 0.5], [x, 0.2, -wHead * 0.62], [xFront + Le * 0.55, 0.0, -wHead * 0.7]], 0.005)
      }
    })
  }
  const yHT = yBT + 0.3 // top of rocker covers (approx.)
  // exhaust manifold (+Z, lagged) to the turbocharger over the flywheel housing
  const zEx = vee ? 0 : We * 0.38
  const yEx = vee ? yHT + 0.05 : yBT + 0.12
  k.rod(ex, [xFront + 0.1, yEx, zEx], [xBack - 0.35, yEx, zEx], 0.07, 16)
  for (let i = 0; i < nCyl; i++) {
    const x = xFront + Le * 0.05 + pitch * (i + 0.5)
    if (!vee) k.rod(ex, [x, yEx, zEx], [x, yEx, wHead * 0.45], 0.045, 10)
  }
  const tx = xBack - 0.38
  const ty = yHT + 0.18
  const tz = vee ? 0 : We * 0.25
  k.rod(ex, [xBack - 0.35, yEx, zEx], [tx, ty - 0.12, tz], 0.07, 12)
  k.cyl(ex, 0.15, 0.16, [tx, ty, tz], 'x', 24) // turbine housing
  k.cyl('flangeSteel', 0.07, 0.12, [tx + 0.13, ty, tz], 'x', 16) // bearing housing
  k.cyl('stainless', 0.14, 0.14, [tx + 0.26, ty, tz], 'x', 24) // compressor housing
  // air filter + intake hose (−Z side)
  k.spline('rubberBlack', [[tx + 0.34, ty, tz], [tx + 0.45, ty + 0.05, tz - 0.2], [tx + 0.4, ty + 0.05, -We * 0.3]], 0.065, 10, 16)
  k.cyl('castIron', 0.18, 0.45, [tx + 0.35, ty + 0.05, -We * 0.3 - 0.2], 'z', 24)
  k.cyl('rubberBlack', 0.19, 0.04, [tx + 0.35, ty + 0.05, -We * 0.3 - 0.44], 'z', 24)
  // charge-air cooler / intake manifold (−Z side)
  k.rbox('castIron', [Le * 0.8, 0.16, 0.14], 0.03, [xEm, yBT - 0.05, -We * 0.42])
  // oil + fuel filters, fuel pump, starter motor (+Z near flywheel), alternator (front)
  for (let i = 0; i < 3; i++) k.cyl(i < 2 ? 'castIron' : 'stainless', 0.06, 0.24, [xFront + Le * (0.3 + i * 0.1), yBlk0 + hBlk * 0.45, -We * 0.36 - 0.07], 'y', 16)
  k.rbox('castIron', [0.25, 0.18, 0.12], 0.02, [xFront + Le * 0.6, yCr + 0.05, -We * 0.36 - 0.06])
  k.cyl('castIron', 0.085, 0.36, [xBack - 0.05, yCr - 0.12, We * 0.36 + 0.09], 'x', 18)
  k.cyl('castIron', 0.045, 0.14, [xBack - 0.1, yCr - 0.01, We * 0.36 + 0.09], 'x', 12)
  k.cyl('castIron', 0.1, 0.18, [xFront + 0.1, yBT - 0.1, We * 0.3], 'x', 18)
  // flywheel housing (SAE bell) + output flange
  k.cyl(drv, Math.min(We * 0.42, hc + 0.05), 0.3, [xBack + 0.15, yCr, 0], 'x', 36, Math.min(We * 0.34, hc - 0.02))
  k.cyl('flangeSteel', 0.12, 0.04, [xF, yCr, 0], 'x', 24)
  // front: crank pulley + belts to the fan
  const yFan = yBlk0 + hBlk * 0.75
  {
    // crank pulley (turns), with a damper and timing mark
    const r = rotorKit()
    r.cyl('castIron', 0.13, 0.08, [0, 0, 0], 'x', 24)
    r.box('nut', [0.085, 0.03, 0.02], [-0.002, 0.09, 0])
    c.rotors.push({ built: r.build(), axis: 'x', pos: [xFront - 0.04, yCr, 0], rpm: 150 })
  }
  for (const z of [-0.02, 0.02]) k.rod('rubberBlack', [xFront - 0.05, yCr + 0.1, z], [xFront - 0.05, yFan - 0.07, z], 0.012, 6)

  // ---- radiator (engine-driven pusher fan), header tank, hoses
  const Hr = clamp(yHT - yk, 1.0, 2.2)
  const Wr = We + 0.3
  const yR0 = yk + 0.05
  k.box(CORE(), [0.14, Hr - 0.12, Wr - 0.12], [xRad, yR0 + Hr / 2, 0])
  for (const s of [-1, 1]) {
    k.box(drv, [0.18, Hr, 0.06], [xRad, yR0 + Hr / 2, s * (Wr / 2 - 0.03)])
    k.box(drv, [0.2, 0.08, Wr], [xRad, s > 0 ? yR0 + Hr - 0.04 : yR0 + 0.04, 0])
  }
  const rFan = Math.min(Hr, Wr) * 0.42
  openTube(k, drv, [xRad + 0.08, yFan, 0], [xFront - 0.08, yFan, 0], rFan, 32, rFan * 0.9)
  k.box(drv, [0.02, Hr - 0.1, Wr - 0.1], [xRad + 0.085, yR0 + Hr / 2, 0])
  k.disc(fanGuardMaterial(), rFan * 0.98, [xRad + 0.1, yFan, 0], 'x', 32)
  k.cyl('castIron', 0.06, 0.12, [xFront - 0.14, yFan, 0], 'x', 14) // fan bearing housing
  {
    // engine-driven pusher fan + its belt pulley (one rotor on the fan spindle)
    const xf = xRad + 0.2
    const r = rotorKit()
    fanImpeller(r, 'castIron', rFan * 0.92, { axis: 'x', blades: 6, chord: rFan * 0.32, pitch: 0.36, hub: 0.07, hubLen: 0.08 })
    const xp = xFront - 0.05 - xf
    r.cyl('castIron', 0.09, 0.06, [xp, 0, 0], 'x', 20)
    r.box('nut', [0.065, 0.025, 0.02], [xp, 0.06, 0])
    c.rotors.push({ built: r.build(), axis: 'x', pos: [xf, yFan, 0], rpm: 195 })
  }
  k.cyl(drv, 0.1, Wr * 0.6, [xRad + 0.02, yR0 + Hr + 0.1, 0], 'z', 18) // header tank
  k.cyl('brass', 0.035, 0.05, [xRad + 0.02, yR0 + Hr + 0.21, 0], 'y', 14)
  k.spline('rubberBlack', [[xFront + 0.05, yBT + 0.06, 0], [xFront - 0.15, yBT + 0.15, We * 0.25], [xRad + 0.1, yR0 + Hr - 0.15, We * 0.3]], 0.045, 10, 20)
  k.spline('rubberBlack', [[xFront + 0.05, yCr + 0.05, -We * 0.3], [xFront - 0.15, yCr - 0.05, -We * 0.35], [xRad + 0.1, yR0 + 0.2, -We * 0.3]], 0.045, 10, 20)
  for (const s of [-1, 1]) k.box(drv, [0.3, 0.05, 0.12], [xRad, yk + 0.025, s * (Wr / 2 - 0.08)])

  // ---- exhaust: bellows, residential silencer on supports over the engine, tail pipe with rain cap
  const rSil = clamp(0.16 + 0.00008 * kw, 0.18, 0.35)
  const LSil = clamp(Le * 0.85, 1.0, 2.6)
  const ySil = yHT + 0.55 + rSil
  const zSil = zb * 0.55
  const xSil1 = xBack - 0.3
  const xSil0 = xSil1 - LSil
  k.cyl(ex, 0.09, 0.2, [tx, ty + 0.25, tz], 'y', 16)
  for (let i = 0; i < 5; i++) k.torus('stainless', 0.1, 0.012, [tx, ty + 0.38 + i * 0.03, tz], 'y', 6, 20) // bellows
  k.tube(ex, [[tx, ty + 0.36, tz], [tx, ty + 0.55, tz], [tx, ySil - rSil * 0.5, zSil]], 0.085, 14)
  k.cyl(ex, rSil, LSil - 0.12, [(xSil0 + xSil1) / 2, ySil, zSil], 'x', 32)
  for (const [x, s] of [[xSil0 + 0.06, -1], [xSil1 - 0.06, 1]] as [number, number][]) {
    k.dome(ex, rSil, [x, ySil, zSil], s > 0 ? 'x' : '-x', Math.PI / 2, 0.4, 32)
    annulus(k, ex, rSil, rSil + 0.012, -0.02, 0.02, [x, ySil, zSil], 'x', 32)
  }
  const yTail = ySil + rSil + 1.0
  k.rod(ex, [xSil0 + 0.25, ySil, zSil], [xSil0 + 0.25, yTail, zSil], 0.09, 18)
  k.box(ex, [0.26, 0.012, 0.22], [xSil0 + 0.25 + 0.03, yTail + 0.06, zSil], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.5)) // rain flap
  for (const x of [xSil0 + 0.3, xSil1 - 0.3]) {
    k.rod('structSteelDark', [x, yk, zb], [x, ySil - rSil, zb], 0.035, 8)
    k.box('structSteelDark', [0.1, 0.03, zb - zSil + rSil], [x, ySil - rSil - 0.02, (zb + zSil) / 2])
    k.torus('structSteelDark', rSil + 0.012, 0.012, [x, ySil, zSil], 'x', 6, 32, Math.PI)
  }

  // ---- diesel day tank on its own stand (−Z side), with bund, sight glass, vent, fill, fuel lines
  const vol = clamp((kw * 0.25 * 8) / 1000 * 1.1, 0.4, 4)
  const Wt = 0.8
  const Ht = 1.0
  const Lt = clamp(vol / (Wt * Ht), 0.7, 2.6)
  const xt = xEm
  const zt = -(zb + 0.35 + Wt / 2)
  const yt0 = 0.5
  k.box(DARK, [Lt + 0.3, 0.02, Wt + 0.3], [xt, 0.01, zt]) // bund
  for (const s of [-1, 1]) {
    k.box(DARK, [Lt + 0.3, 0.15, 0.012], [xt, 0.085, zt + s * (Wt / 2 + 0.15)])
    k.box(DARK, [0.012, 0.15, Wt + 0.3], [xt + s * (Lt / 2 + 0.15), 0.085, zt])
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(DARK, [0.08, yt0, 0.08], [xt + sx * (Lt / 2 - 0.06), yt0 / 2, zt + sz * (Wt / 2 - 0.06)])
  k.rbox(drv, [Lt, Ht, Wt], 0.03, [xt, yt0 + Ht / 2, zt])
  for (let i = 1; i < Math.round(Lt / 0.5); i++) k.box(drv, [0.04, Ht - 0.1, 0.012], [xt - Lt / 2 + (i * Lt) / Math.round(Lt / 0.5), yt0 + Ht / 2, zt - Wt / 2 - 0.006])
  const xsg = xt + Lt / 2 + 0.05
  k.rod('glass', [xsg, yt0 + 0.1, zt], [xsg, yt0 + Ht - 0.1, zt], 0.016, 10)
  for (const y of [yt0 + 0.1, yt0 + Ht - 0.1]) k.rod('brass', [xt + Lt / 2, y, zt], [xsg, y, zt], 0.014, 8)
  k.tube('tubing', [[xt - Lt * 0.3, yt0 + Ht, zt], [xt - Lt * 0.3, yt0 + Ht + 0.9, zt], [xt - Lt * 0.3 + 0.12, yt0 + Ht + 0.9, zt], [xt - Lt * 0.3 + 0.12, yt0 + Ht + 0.75, zt]], 0.025, 10, 0.06)
  k.cyl('castIron', 0.045, 0.1, [xt - Lt * 0.3 + 0.12, yt0 + Ht + 0.72, zt], 'y', 12) // flame arrester
  k.cyl('castIron', 0.06, 0.06, [xt + Lt * 0.25, yt0 + Ht + 0.03, zt], 'y', 16) // fill cap
  k.box('valveBody', [0.08, 0.08, 0.08], [xt + Lt * 0.4, yt0 - 0.06, zt]) // drain valve
  k.tube('tubing', [[xt + Lt * 0.3, yt0 + 0.08, zt + Wt / 2], [xt + Lt * 0.3, yt0 + 0.08, -zb + 0.05], [xFront + Le * 0.6, yCr + 0.05, -We * 0.42]], 0.012)
  k.tube('tubing', [[xFront + Le * 0.5, yBT - 0.15, -We * 0.42], [xt - Lt * 0.2, yBT - 0.15, -zb], [xt - Lt * 0.2, yt0 + Ht + 0.05, zt + Wt * 0.3], [xt - Lt * 0.2, yt0 + Ht, zt + Wt * 0.3]], 0.01)
  tagPlate(k, 'DIESEL', [xt, yt0 + Ht * 0.6, zt + Wt / 2 + 0.003], 'z', 0.2)

  // ---- starter batteries A + B on a rack (+Z side, by the starter)
  const zbat = zb + 0.45
  const xbat = xBack - 0.3
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(DARK, [0.05, 0.42, 0.05], [xbat + sx * 0.6, 0.21, zbat + sz * 0.2])
  k.box(DARK, [1.3, 0.03, 0.46], [xbat, 0.42, zbat])
  for (const dx of [-0.31, 0.31]) {
    k.rbox('stainless', [0.56, 0.34, 0.4], 0.015, [xbat + dx, 0.6, zbat])
    k.box('stainless', [0.58, 0.02, 0.42], [xbat + dx, 0.78, zbat])
    for (const vx of [-0.15, 0, 0.15]) k.cyl('rubberBlack', 0.015, 0.03, [xbat + dx + vx, 0.8, zbat], 'y', 8)
    k.spline('cable', [[xbat + dx, 0.79, zbat - 0.15], [xbat + dx * 0.5, 0.95, zbat - 0.3], [xBack - 0.05, yCr - 0.05, We * 0.36 + 0.18]], 0.014, 6, 24)
  }

  // ---- engine controller (fire-pump controller cabinet), +Z side towards the radiator end
  const xc = xFront + 0.2
  const zc = zb + 0.55
  const Hc = 1.8
  k.box(DARK, [0.86, 0.1, 0.46], [xc, 0.05, zc])
  k.rbox(drv, [0.8, Hc, 0.42], 0.02, [xc, 0.1 + Hc / 2, zc])
  k.box(drv, [0.86, 0.03, 0.5], [xc, 0.1 + Hc + 0.015, zc]) // canopy
  const fz = zc + 0.212
  k.box('rubberBlack', [0.004, Hc - 0.1, 0.004], [xc, 0.1 + Hc / 2, fz])
  k.box('displayLcd', [0.22, 0.14, 0.006], [xc - 0.18, 0.1 + Hc * 0.72, fz])
  const lamps: MatKey[] = ['safetyGreen', 'actuatorYellow', 'actuatorRed', 'actuatorRed']
  lamps.forEach((m, i) => k.cyl(m, 0.018, 0.02, [xc + 0.08 + i * 0.07, 0.1 + Hc * 0.74, fz + 0.005], 'z', 14))
  k.cyl('handwheel', 0.03, 0.03, [xc + 0.18, 0.1 + Hc * 0.6, fz + 0.01], 'z', 16) // mode selector
  k.cyl('actuatorRed', 0.035, 0.03, [xc - 0.18, 0.1 + Hc * 0.58, fz + 0.01], 'z', 16) // stop
  for (const dx of [-0.05, 0.05]) k.box('stainless', [0.02, 0.12, 0.03], [xc + dx, 0.1 + Hc * 0.48, fz + 0.012])
  tagPlate(k, `${eq.tag} CONTROLLER`, [xc, 0.1 + Hc * 0.86, fz + 0.002], 'z', 0.3)
  k.spline('cable', [[xc, 0.1 + Hc + 0.03, zc - 0.1], [xc + 0.3, 0.1 + Hc + 0.25, zc - 0.3], [xFront + Le * 0.3, yBT + 0.3, We * 0.2]], 0.02, 6, 24)
}

export function CaissonPumpModel({ eq }: { eq: CaissonPump }) {
  const { built, headPaint, rotors, theta } = useMemo(() => buildCaissonPump(eq), [eq])
  return (
    <group>
      <KitMesh data={built} />
      <group rotation-y={theta}>
        <Rotors tag={eq.tag} rotors={rotors} />
      </group>
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} paintMaterial={headPaint} />
      ))}
    </group>
  )
}
