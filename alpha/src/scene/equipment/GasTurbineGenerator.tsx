/**
 * Gas turbine generator package (aeroderivative / light-industrial GT, cold-end drive), modelled
 * the way offshore GTG packages (SGT-400 / LM2500 / Titan class) are built:
 *
 *   - deep structural base frame with drip-pan upstand, lifting padeyes and trunnions;
 *   - acoustic enclosure (insulated panels, cover battens, girts, access doors, CO₂ warning
 *     beacons, roof ventilation fans, outlet louvres) — shell materials, so x-ray / section
 *     show the machinery inside;
 *   - inside, along +X: brushless exciter → generator (CACW cooler on top, line-side terminal
 *     box with cables) → coupling → parallel-shaft reduction gearbox → coupling → air-inlet
 *     plenum with bell-mouth, nose cone and FOD screen → gas turbine core (compressor casing with
 *     VSV rings and bleed lines, combustor with gas + liquid fuel manifold rings and pigtails,
 *     HP turbine, power turbine) → exhaust collector;
 *   - roof: inlet silencer + multi-stage filter house (weather hoods, coalescer pads, pocket
 *     filters), exhaust duct → fabric expansion joint → silencer → flanged stack sections with a
 *     sampling platform + caged ladder, soot-darkened top, rain cap and aviation light;
 *   - −Z apron: fuel gas conditioning skid (coalescing filter, double-block-and-bleed ESDVs,
 *     metering valve) and liquid fuel duplex filter + shut-off valve, ending exactly at the
 *     N1 / N2 nozzle bases; CO₂ fire-suppression cylinder cabinet;
 *   - +Z apron: lube-oil console (reservoir, motor pumps, duplex filters) with fin-fan oil cooler.
 *
 * Local frame (types.ts): origin = skid centre at deck level, train along +X, generator at −X,
 * exhaust stack centred at x = skid[0]/2 − 2.0.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { GasTurbineGenerator, Rating } from '../../model/types'
import { elbowRadius, pipeOD } from '../../model/catalog'
import { dirToLocal, toLocal } from '../../model/geom'
import { materials, paint } from '../../three/materials'
import { NozzleNeck } from '../common/NozzleNeck'
import { Kit, eul, uvScale, mat4, type MatKey, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { flangedJoint, pipeFlange, routeToNozzle, smallGauge, tagPlate } from './machinery/parts'
import { Doors, Rotors } from './machinery/Moving'
import { fanRotor, guardedCoupling, subKit, type DoorSpec, type RotorSpec } from './machinery/rotors'
import { dialMaterial, fanGuardMaterial, gratingMaterial, meshGuardMaterial, signMaterial } from './machinery/textures'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const UP = new THREE.Vector3(0, 1, 0)
type Face = 'x' | '-x' | 'z' | '-z'
/** quaternion taking a face frame (x along the face, y up, z outward) onto the given outward normal */
const faceQ = (f: Face) => new THREE.Quaternion().setFromAxisAngle(UP, f === 'z' ? 0 : f === '-z' ? Math.PI : f === 'x' ? Math.PI / 2 : -Math.PI / 2)

const SKID: MatKey = 'equipmentPaintDark'
const CLAD: MatKey = 'moduleCladding' // enclosure panels (shell → fades in x-ray)
const TRIM: MatKey = 'equipmentPaint' // battens, doors, filter house, plenum (shell)
const OIL: MatKey = 'machineryGreen'

function mats() {
  return {
    GT: paint('#a4a9ad', 'internal', { metalness: 0.72, roughness: 0.33 }), // cold casings
    HOT: paint('#7b6c5f', 'internal', { metalness: 0.6, roughness: 0.55 }), // hot section, heat-tinted
    GEN: paint('#3d5d79', 'internal', { metalness: 0.35, roughness: 0.45 }),
    GEAR: paint('#4f6b5a', 'internal', { metalness: 0.3, roughness: 0.5 }),
    MEDIA: paint('#e3ddcc', 'internal', { metalness: 0, roughness: 0.9 }), // filter media
    STACK: paint('#8c9194', 'shell', { metalness: 0.55, roughness: 0.5 }),
    SOOT: paint('#262321', 'shell', { metalness: 0.2, roughness: 0.95 }),
    SOOT2: paint('#4b4744', 'shell', { metalness: 0.35, roughness: 0.8 }),
    SCREEN: paint('#2c3034', 'shell', { metalness: 0.4, roughness: 0.6 }), // bird screens behind hoods / louvres
  }
}

/**
 * Pipe along an orthogonal polyline: straight cylinders plus short swept bends. Much lighter than
 * one TubeGeometry over the whole path (whose segment count scales with length / radius).
 */
function pipeRun(k: Kit, pts: V3[], nps: number, mat: MatKey = 'pipePaint') {
  const r = pipeOD(nps) / 2
  const radial = nps >= 3 ? 16 : 12
  const P = pts.map((p) => new THREE.Vector3(...p))
  let cur = P[0].clone()
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1]
    const b = P[i]
    if (i === P.length - 1) {
      k.rod(mat, cur.toArray() as V3, b.toArray() as V3, r, radial)
      break
    }
    const c = P[i + 1]
    const rb = Math.min(elbowRadius(nps), a.distanceTo(b) * 0.45, b.distanceTo(c) * 0.45)
    const p1 = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(rb))
    const p2 = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(rb))
    if (cur.distanceTo(p1) > 1e-4) k.rod(mat, cur.toArray() as V3, p1.toArray() as V3, r, radial)
    if (rb > 1e-4) k.add(mat, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2), 6, r, radial, false))
    cur = p2
  }
}

// ------------------------------------------------------------------ small assemblies (face frame)

/** Louvre panel in a face frame (x along face, y up, z outward), centred at (cx, cy). */
function louvre(k: Kit, w: number, h: number, cx: number, cy: number, frame: MatKey = SKID) {
  k.box(mats().SCREEN, [w, h, 0.01], [cx, cy, 0.005])
  const fw = 0.05
  for (const s of [-1, 1]) {
    k.box(frame, [w + 2 * fw, fw, 0.12], [cx, cy + s * (h / 2 + fw / 2), 0.06])
    k.box(frame, [fw, h, 0.12], [cx + s * (w / 2 + fw / 2), cy, 0.06])
  }
  const n = Math.max(3, Math.floor(h / 0.09))
  for (let i = 0; i < n; i++) k.box(frame, [w, 0.008, 0.12], [cx, cy - h / 2 + ((i + 0.5) * h) / n, 0.06], eul(0.75, 0, 0))
}

/** Rows of weather hoods over a dark bird-screen face (filter house inlet face). */
function hoods(k: Kit, w: number, h: number, cx: number, cy: number) {
  k.box(mats().SCREEN, [w, h, 0.01], [cx, cy, 0.005])
  const rows = Math.max(2, Math.floor(h / 0.42))
  const pitch = h / rows
  const a = 0.55
  const lp = 0.34
  const dz = Math.cos(a) * lp
  const dy = Math.sin(a) * lp
  for (let i = 0; i < rows; i++) {
    const yt = cy - h / 2 + (i + 1) * pitch
    k.box(TRIM, [w, 0.012, lp], [cx, yt - dy / 2, dz / 2], eul(a, 0, 0))
    k.box(TRIM, [w, 0.05, 0.012], [cx, yt - dy - 0.02, dz])
    for (const s of [-1, 1]) k.box(TRIM, [0.012, dy, dz], [cx + s * (w / 2), yt - dy / 2, dz / 2])
  }
  const nm = Math.max(1, Math.round(w / 1.4))
  for (let j = 1; j < nm; j++) k.box(TRIM, [0.012, h, dz], [cx - w / 2 + (j * w) / nm, cy, dz / 2])
}

/** hinge-pin line of a door leaf, in front of the leaf (face frame z) */
const HINGE_Z = 0.06

/**
 * Door leaf drawn relative to its hinge pin (face frame: x along the face, y up, z outward).
 * latch = +1: hinge on the face-left edge, leaf extends +x; −1: hinge on the right, leaf extends −x.
 */
function doorLeaf(k: Kit, lw: number, h: number, latch: 1 | -1) {
  const lx = latch * (lw / 2) // leaf centre
  const z = (v: number) => v - HINGE_Z
  k.box(TRIM, [lw - 0.012, h - 0.012, 0.05], [lx, h / 2, z(0.03)])
  for (const yy of [0.35, 0.7]) k.box(TRIM, [lw - 0.18, 0.035, 0.012], [lx, h * yy, z(0.06)])
  // lever handle outside + pull handle inside
  const hx = lx + latch * (lw / 2 - 0.1)
  k.box('stainless', [0.04, 0.14, 0.02], [hx, 1.05, z(0.065)])
  k.box('stainless', [0.14, 0.022, 0.024], [hx - latch * 0.06, 1.08, z(0.088)])
  k.box('stainless', [0.03, 0.18, 0.02], [hx, 1.05, z(-0.005)])
  for (const yy of [0.2, h / 2, h - 0.2]) k.box(TRIM, [0.1, 0.06, 0.012], [latch * 0.05, yy, z(0.058)]) // hinge straps
  k.box('glass', [0.22, 0.3, 0.06], [lx, 1.6, z(0.03)])
  k.plane(signMaterial('noentry'), 0.36, 0.18, [lx, 1.32, z(0.0565)])
}

/**
 * Personnel door frame (single / double leaf) in a face frame with its sill at y = 0: jambs, head,
 * sill and hinge knuckles. The leaves are separate <Door>s (see doorLeaf); returns them as
 * { hingeX (face frame), latch, lw }.
 */
function doorFrame(k: Kit, w: number, h: number, cx: number, double = false) {
  k.box(SKID, [w + 0.14, 0.07, 0.05], [cx, h + 0.035, 0.025])
  for (const s of [-1, 1]) k.box(SKID, [0.07, h, 0.05], [cx + s * (w / 2 + 0.035), h / 2, 0.025])
  k.box(SKID, [w, 0.03, 0.12], [cx, 0.015, 0.06])
  const leaves = double ? 2 : 1
  const lw = w / leaves
  const out: { hingeX: number; latch: 1 | -1; lw: number }[] = []
  for (let i = 0; i < leaves; i++) {
    const lx = cx - w / 2 + lw * (i + 0.5)
    const latch: 1 | -1 = double ? (i === 0 ? 1 : -1) : 1 // +1: hinge on the left, handle on the right
    const hingeX = lx - latch * (lw / 2)
    for (const yy of [0.2, h / 2, h - 0.2]) k.cyl(SKID, 0.018, 0.12, [hingeX - latch * 0.01, yy, HINGE_Z], 'y', 8)
    out.push({ hingeX, latch, lw })
  }
  return out
}

/** Fixed ladder with cage on a face (stiles at z = 0.2 outward), from y = 0 to `height`. */
function ladder(k: Kit, height: number, cageFrom = 2.2) {
  const off = 0.2
  const hw = 0.23
  const top = height + 1.0
  for (const s of [-1, 1]) k.rod('safetyYellow', [s * hw, 0, off], [s * hw, top, off], 0.028, 8)
  for (let y = 0.3; y < height + 0.01; y += 0.3) k.rod('safetyYellow', [-hw, y, off], [hw, y, off], 0.012, 6)
  for (let y = 0.6; y < top; y += 2) for (const s of [-1, 1]) k.box('safetyYellow', [0.04, 0.04, off], [s * hw, y, off / 2])
  if (height > cageFrom + 0.4) {
    const cq = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI)
    const cz = off + 0.12
    for (let y = cageFrom; y <= top + 0.01; y += 0.9) k.torus('safetyYellow', 0.36, 0.014, [0, y, cz], cq, 6, 18, Math.PI)
    for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI])
      k.rod('safetyYellow', [Math.cos(a) * 0.36, cageFrom, cz + Math.sin(a) * 0.36], [Math.cos(a) * 0.36, top, cz + Math.sin(a) * 0.36], 0.01, 6)
  }
}

function gasDetector(k: Kit, p: V3) {
  k.rbox('stainless', [0.12, 0.14, 0.08], 0.01, p)
  k.cyl('actuatorYellow', 0.035, 0.11, [p[0], p[1] - 0.12, p[2]], 'y', 14)
  k.cyl('castIron', 0.042, 0.03, [p[0], p[1] - 0.19, p[2]], 'y', 14)
}

function beacon(k: Kit, p: V3) {
  k.box(SKID, [0.12, 0.04, 0.12], p)
  k.cyl('actuatorRed', 0.045, 0.08, [p[0], p[1] + 0.06, p[2]], 'y', 14)
  k.dome('glass', 0.045, [p[0], p[1] + 0.1, p[2]], 'y', Math.PI / 2, 1.2, 14)
}

// ------------------------------------------------------------------ in-line valves (pipe along X)

function ballValve(k: Kit, x: number, y: number, z: number, nps: number, rating: Rating) {
  const od = pipeOD(nps)
  const L = Math.max(0.24, od * 3.2)
  k.sphere('valveBody', od * 1.0, [x, y, z], undefined, 18)
  k.cyl('valveBody', od * 0.75, L * 0.8, [x, y, z], 'x', 18)
  flangedJoint(k, nps, rating, [x - L / 2, y, z], 'x')
  flangedJoint(k, nps, rating, [x + L / 2, y, z], 'x')
  const ya = y + od * 1.0
  k.cyl('valveBody', od * 0.35, 0.1, [x, ya + 0.05, z], 'y', 12)
  k.rbox('actuatorYellow', [0.16, 0.14, 0.14], 0.02, [x, ya + 0.17, z])
  k.cyl('actuatorYellow', 0.065, 0.32, [x + 0.2, ya + 0.17, z], 'x', 16)
  k.rbox('stainless', [0.08, 0.07, 0.06], 0.01, [x - 0.04, ya + 0.28, z])
}

function controlValve(k: Kit, x: number, y: number, z: number, nps: number, rating: Rating) {
  const od = pipeOD(nps)
  const L = Math.max(0.3, od * 3.6)
  k.sphere('valveBody', od * 1.2, [x, y, z], [1.25, 1, 1], 18)
  k.cyl('valveBody', od * 0.7, L * 0.8, [x, y, z], 'x', 18)
  flangedJoint(k, nps, rating, [x - L / 2, y, z], 'x')
  flangedJoint(k, nps, rating, [x + L / 2, y, z], 'x')
  const yb = y + od * 1.15
  k.cyl('valveBody', od * 0.5, 0.12, [x, yb + 0.06, z], 'y', 14)
  for (const s of [-1, 1]) k.rod('valveBody', [x, yb + 0.12, z + s * 0.05], [x, yb + 0.33, z + s * 0.05], 0.012, 6)
  const yd = yb + 0.38
  k.cyl('actuatorBlue', 0.15, 0.05, [x, yd, z], 'y', 24)
  k.dome('actuatorBlue', 0.15, [x, yd + 0.025, z], 'y', Math.PI / 2, 0.35, 20)
  k.dome('actuatorBlue', 0.15, [x, yd - 0.025, z], '-y', Math.PI / 2, 0.25, 20)
  k.rbox('stainless', [0.1, 0.12, 0.07], 0.01, [x + 0.12, yd - 0.15, z])
}

// ------------------------------------------------------------------ the package

export function buildGasTurbineGenerator(eq: GasTurbineGenerator) {
  const k = new Kit()
  k.alias = { gasket: 'nut', handwheel: 'nut', nameplate: 'stainless', brass: 'flangeSteel', safetyGreen: OIL, castIron: SKID, tubing: 'stainless', pipeCut: 'flangeSteel' }
  const M = mats()
  k.alias.internalsSteel = M.GT
  const [SL, SW] = eq.skid
  const MW = clamp(eq.ratedMW || 20, 1, 60)
  const hs = clamp(0.4 + SL * 0.012, 0.45, 0.65) // base frame top
  const H = Math.max(eq.enclosureHeight, hs + 2.6) // roof level above deck
  const stackH = Math.max(eq.stackHeight, 3)

  // ---- plan: aprons on ±Z (fuel skid / lube console), enclosure between
  const m = clamp(SW * 0.17, 0.55, 1.0)
  const t = 0.08 // panel thickness
  const z0 = -SW / 2 + m // −Z wall outer face
  const z1 = SW / 2 - m // +Z wall outer face
  const encW = z1 - z0
  const hw = encW / 2 - t // interior half width
  const zi1 = z1 - t
  const ex0 = -SL / 2 + 0.2
  const ex1 = SL / 2 - 0.2

  // ---- machine sizes
  const R = Math.min(0.25 + 0.11 * Math.sqrt(MW), (hw - 0.2) / 1.35, (H - hs - 0.6) / 2.7) // core reference radius
  const ys = hs + 0.2 + 1.3 * R // GT shaft height
  const xst = SL / 2 - 2.0 // stack axis
  const Rs = clamp(0.1 + 0.2 * Math.sqrt(MW), 0.45, Math.min(1.5, (SW / 2 - 0.05) / 1.25))
  const Rsil = Math.min(Rs * 1.28, SW / 2 - 0.05, 1.95)
  const cW = 1.3 * R // collector half width
  const Rd = Math.min(Rs, cW, hw - 0.12) // exhaust duct radius
  const cHL = Rd + 0.2 // collector half length
  const xc1 = xst - cHL

  // ---- stations along X (from the generator end to the collector)
  const xa = ex0 + t + 0.15
  const A = xc1 - xa
  const sGen1 = xa + 0.34 * A
  const sGb0 = sGen1 + 0.05 * A
  const sGb1 = sGb0 + 0.11 * A
  const sPl0 = sGb1 + 0.04 * A
  const sPl1 = sPl0 + 0.11 * A
  const xc0 = sPl1
  const Lc = xc1 - xc0
  const xp = (sPl0 + sPl1) / 2

  // ================================================================ base frame
  const beam = (x0: number, x1: number, z: number) => {
    const L = x1 - x0
    const xm = (x0 + x1) / 2
    k.box(SKID, [L, 0.03, 0.32], [xm, 0.015, z])
    k.box(SKID, [L, 0.03, 0.32], [xm, hs - 0.045, z])
    k.box(SKID, [L, hs - 0.09, 0.018], [xm, hs / 2 - 0.015, z])
  }
  for (const z of [-SW / 2 + 0.16, -SW * 0.2, SW * 0.2, SW / 2 - 0.16]) beam(-SL / 2, SL / 2, z)
  const nCross = Math.max(4, Math.round(SL / 1.6))
  for (let i = 0; i <= nCross; i++) {
    const x = -SL / 2 + 0.01 + (i * (SL - 0.02)) / nCross
    k.box(SKID, [0.018, hs - 0.07, SW - 0.32], [x, hs / 2 - 0.015, 0])
  }
  k.box('deckPlate', [SL, 0.012, SW], [0, hs - 0.024, 0])
  // drip-pan upstand all round + drain
  for (const s of [-1, 1]) {
    k.box(SKID, [SL, 0.1, 0.012], [0, hs + 0.02, s * (SW / 2 - 0.006)])
    k.box(SKID, [0.012, 0.1, SW], [s * (SL / 2 - 0.006), hs + 0.02, 0])
  }
  pipeRun(k, [[-SL / 2 + 0.35, hs - 0.02, SW / 2 - 0.35], [-SL / 2 + 0.35, 0.12, SW / 2 - 0.35], [-SL / 2 + 0.02, 0.12, SW / 2 - 0.35]], 2, SKID)
  // lifting padeyes + trunnions
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const px = sx * (SL / 2 - 1.1)
      // padeyes welded to the side-beam web, inside the skid footprint
      k.box(SKID, [0.34, 0.3, 0.04], [px, hs * 0.55, sz * (SW / 2 - 0.04)])
      k.torus('nut', 0.07, 0.02, [px, hs * 0.55 + 0.04, sz * (SW / 2 - 0.015)], 'z', 6, 18)
    }
  // earth boss
  k.box('flangeSteel', [0.12, 0.08, 0.02], [SL / 2 - 0.5, hs * 0.5, SW / 2 + 0.01])

  // ================================================================ enclosure
  const wallH = H - hs - 0.1
  const yw = hs + wallH / 2
  const EL = ex1 - ex0
  const exm = (ex0 + ex1) / 2

  // -------- door positions (decided first: the wall panels, girts and battens are cut around them)
  const xcomb = xc0 + 0.48 * Lc
  const gx = (sGb0 + sGb1) / 2
  // nozzles (local)
  const nz = (id: string) => {
    const n = eq.nozzles.find((q) => q.id === id)
    return n ? { base: toLocal(eq, n.base), dir: dirToLocal(eq, n.dir), nps: n.nps, rating: n.rating } : null
  }
  const n1 = nz('N1')
  const n2 = nz('N2')
  const x1 = n1 ? n1.base[0] : SL * 0.15
  const x2 = n2 ? n2.base[0] : SL * 0.05
  const gtL = clamp(SL * 0.12, 1.1, 2.0)
  const xpen = Math.max(x1, x2) + gtL
  const lcL = clamp(SL * 0.2, 1.6, 3.2)
  const xl = clamp(gx, -SL / 2 + 0.4 + lcL / 2, SL / 2 - 0.4 - lcL / 2)
  const cabL = clamp(SL * 0.09, 1.0, 1.6)
  const cab0 = -SL / 2 + 0.3
  const blockedNeg: [number, number][] = [[Math.min(x1, x2) - 0.5, xpen + 0.5], [cab0 - 0.2, cab0 + cabL + 0.2]]
  const xLad = ex0 + 0.55 // roof access ladder on the +Z wall
  const blockedPos: [number, number][] = [[xl - lcL / 2 - 0.3, xl + lcL / 2 + 0.3], [xLad - 0.5, xLad + 0.5]]
  const freeX = (want: number, w: number, blocked: [number, number][]) => {
    const lo = ex0 + w / 2 + 0.25
    const hi = ex1 - w / 2 - 0.25
    for (let d = 0; d < SL; d += 0.1)
      for (const x of [want + d, want - d]) {
        if (x < lo || x > hi) continue
        if (blocked.every(([a, b]) => x + w / 2 < a || x - w / 2 > b)) return x
      }
    return null
  }
  const dH = Math.min(2.1, wallH - 0.4)
  const gMid = (xa + sGen1) / 2
  const pick = (xs: (number | null)[]) => {
    const out: number[] = []
    for (const x of xs) if (x !== null && out.every((p) => Math.abs(p - x) > 1.2)) out.push(x)
    return out
  }
  const doorsPos = pick([freeX(gMid, 0.9, blockedPos), freeX(xcomb + 0.5, 0.9, blockedPos)])
  const doorsNeg = pick([freeX(gMid, 0.9, blockedNeg), freeX(xst, 0.9, blockedNeg)])
  const endW = encW - 1.45
  const wEndN = endW >= 1.3 ? Math.min(1.8, endW) : 0.85 // −X maintenance door (double if room)
  const cEndP = encW / 2 - 0.65 // +X door centre in its face frame (face x = −z)
  // openings along each wall: [centre, width] in the wall's own coordinate (x for ±Z walls, z for ±X)
  const holes = {
    pz: doorsPos.map((x) => [x, 0.9] as [number, number]),
    nz: doorsNeg.map((x) => [x, 0.9] as [number, number]),
    nx: [[0, wEndN]] as [number, number][],
    px: [[-cEndP, 0.85]] as [number, number][],
  }
  /** pieces [a, b] of [a0, a1] outside the openings */
  const solid = (a0: number, a1: number, hs_: [number, number][], pad = 0) => {
    const out: [number, number][] = []
    let a = a0
    for (const [c, w] of [...hs_].sort((p, q) => p[0] - q[0])) {
      if (c - w / 2 - pad > a) out.push([a, c - w / 2 - pad])
      a = Math.max(a, c + w / 2 + pad)
    }
    if (a1 > a) out.push([a, a1])
    return out
  }
  const inHole = (v: number, hs_: [number, number][], pad: number) => hs_.some(([c, w]) => Math.abs(v - c) < w / 2 + pad)
  const yHead = hs + dH
  // wall panels with door openings (full-height pieces between doors, a header panel over each door)
  const panelZ = (z: number, hl: [number, number][]) => {
    for (const [a, b] of solid(ex0, ex1, hl)) k.box(CLAD, [b - a, wallH, t], [(a + b) / 2, yw, z])
    for (const [c, w] of hl) k.box(CLAD, [w, hs + wallH - yHead, t], [c, (yHead + hs + wallH) / 2, z])
  }
  const panelX = (x: number, hl: [number, number][]) => {
    for (const [a, b] of solid(z0 + t, z1 - t, hl)) k.box(CLAD, [t, wallH, b - a], [x, yw, (a + b) / 2])
    for (const [c, w] of hl) k.box(CLAD, [t, hs + wallH - yHead, w], [x, (yHead + hs + wallH) / 2, c])
  }
  panelZ(z0 + t / 2, holes.nz)
  panelZ(z1 - t / 2, holes.pz)
  panelX(ex0 + t / 2, holes.nx)
  panelX(ex1 - t / 2, holes.px)
  k.box(CLAD, [EL + 0.12, 0.1, encW + 0.12], [exm, H - 0.05, 0]) // roof
  // cover battens (panel seams), girts, sill and eaves — none across a door opening
  const nb = Math.max(4, Math.round(EL / 1.2))
  for (let i = 0; i <= nb; i++) {
    const x = ex0 + (i * EL) / nb
    for (const [z, s, hl] of [[z0, -1, holes.nz], [z1, 1, holes.pz]] as const) if (!inHole(x, hl, 0.12)) k.box(TRIM, [0.06, wallH, 0.018], [x, yw, z + s * 0.009])
    k.box(TRIM, [0.05, 0.03, encW + 0.1], [x, H + 0.015, 0]) // roof seam cappings
  }
  const ne = Math.max(2, Math.round(encW / 1.2))
  for (let i = 1; i < ne; i++)
    for (const [x, s, hl] of [[ex0, -1, holes.nx], [ex1, 1, holes.px]] as const) {
      const z = z0 + (i * encW) / ne
      if (!inHole(z, hl, 0.12)) k.box(TRIM, [0.018, wallH, 0.06], [x + s * 0.009, yw, z])
    }
  const yGirt = hs + wallH * 0.52
  const girtCut = yGirt - 0.035 < yHead + 0.08
  for (const [z, s, hl] of [[z0, -1, holes.nz], [z1, 1, holes.pz]] as const) {
    for (const [a, b] of girtCut ? solid(ex0, ex1, hl, 0.1) : [[ex0, ex1] as [number, number]]) k.box(TRIM, [b - a, 0.07, 0.03], [(a + b) / 2, yGirt, z + s * 0.024])
    for (const [a, b] of solid(ex0 - 0.02, ex1 + 0.02, hl, 0.07)) k.box(SKID, [b - a, 0.14, 0.05], [(a + b) / 2, hs + 0.07, z + s * 0.02])
    k.box(TRIM, [EL + 0.12, 0.14, 0.04], [exm, H - 0.07, z + s * 0.08])
  }
  for (const [x, s, hl] of [[ex0, -1, holes.nx], [ex1, 1, holes.px]] as const) {
    for (const [a, b] of solid(-encW / 2, encW / 2, hl, 0.07)) k.box(SKID, [0.05, 0.14, b - a], [x + s * 0.02, hs + 0.07, (a + b) / 2])
    k.box(TRIM, [0.04, 0.14, encW + 0.2], [x + s * 0.08, H - 0.07, 0])
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(TRIM, [0.1, wallH, 0.1], [sx > 0 ? ex1 - 0.04 : ex0 + 0.04, yw, sz > 0 ? z1 - 0.04 : z0 + 0.04])
  // roof padeyes
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p: V3 = [sx > 0 ? ex1 - 0.35 : ex0 + 0.35, H + 0.12, sz * (encW / 2 - 0.3)]
      k.box('structSteel', [0.22, 0.2, 0.03], p)
      k.torus('nut', 0.05, 0.015, [p[0], p[1] + 0.03, p[2] + 0.02], 'z', 6, 14)
    }

  // -------- doors (frames static, leaves as hinged <Door>s), louvres, signage
  const doors: DoorSpec[] = []
  let doorNo = 0
  const doorAt = (origin: V3, f: Face, w: number, cx: number, double = false) => {
    const id = `D${++doorNo}`
    const q = faceQ(f)
    const ang = f === 'z' ? 0 : f === '-z' ? Math.PI : f === 'x' ? Math.PI / 2 : -Math.PI / 2
    let leaves: ReturnType<typeof doorFrame> = []
    k.at(origin, q, () => (leaves = doorFrame(k, w, dH, cx, double)))
    for (const L of leaves) {
      const lk = subKit(k)
      doorLeaf(lk, L.lw, dH, L.latch)
      const hp = new THREE.Vector3(L.hingeX, 0, HINGE_Z).applyQuaternion(q).add(new THREE.Vector3(...origin))
      // both leaves of a double door share the id: one click / one walk-up opens the pair
      doors.push({ id, hinge: hp.toArray() as V3, rotationY: ang, openAngle: L.latch > 0 ? -1.75 : 1.75, built: lk.build(), width: L.lw })
    }
  }
  for (const x of doorsPos) {
    doorAt([x, hs, z1], 'z', 0.9, 0)
    beacon(k, [x + 0.7, hs + dH + 0.15, z1 + 0.08])
  }
  for (const x of doorsNeg) {
    doorAt([x, hs, z0], '-z', 0.9, 0)
    beacon(k, [x - 0.7, hs + dH + 0.15, z0 - 0.08])
  }
  // −X end: maintenance door (double if room) + roof access ladder; +X end: door + outlet louvre
  doorAt([ex0, hs, 0], '-x', wEndN, 0, endW >= 1.3)
  k.at([ex0, hs, 0], faceQ('-x'), () => louvre(k, Math.min(1.2, encW * 0.35), 0.5, 0, Math.min(wallH - 0.45, dH + 0.55)))
  doorAt([ex1, hs, 0], 'x', 0.85, cEndP)
  k.at([ex1, hs, 0], faceQ('x'), () => {
    const lw = Math.min(1.6, encW * 0.42)
    louvre(k, lw, Math.min(0.9, wallH * 0.25), -encW / 2 + lw / 2 + 0.25, wallH - Math.min(0.9, wallH * 0.25) / 2 - 0.3)
  })
  k.at([xLad, hs, z1], faceQ('z'), () => ladder(k, H - hs, m >= 0.7 ? 2.2 : 99))
  gasDetector(k, [ex1 + 0.1, H - 0.9, encW / 2 - 0.25])
  // name sign + tag on +Z wall
  const signX = clamp(xcomb - 0.6, ex0 + 1.4, ex1 - 1.4)
  k.plane(signMaterial('ler', `${eq.tag}  GAS TURBINE GENERATOR  ${MW} MW`), 2.4, 0.6, [signX, H - 0.6, z1 + 0.02])
  tagPlate(k, eq.tag, [signX + 1.45, H - 0.6, z1 + 0.02], 'z', 0.3)

  // ================================================================ generator + exciter
  const gR = sGen1 - xa
  const eL = clamp(0.14 * gR, 0.35, 0.8)
  const gF0 = xa + eL + 0.3
  const gF1 = sGen1 - 0.45
  const gFL = gF1 - gF0
  const gfx = (gF0 + gF1) / 2
  const gBH = clamp(1.0 + 0.035 * MW, 1.0, H - hs - 1.2)
  const gWd = Math.min(2 * hw - 0.7, 1.2 + 0.035 * MW)
  const gCH = clamp(H - hs - 0.45 - 0.12 - gBH, 0, 0.7)
  const yg = hs + 0.12 + gBH * 0.5
  const gTop = hs + 0.12 + gBH
  k.box(SKID, [gFL + eL + 0.9, 0.12, gWd + 0.25], [(xa + sGen1) / 2, hs + 0.06, 0])
  k.rbox(M.GEN, [gFL, gBH, gWd], 0.06, [gfx, hs + 0.12 + gBH / 2, 0])
  k.box('vesselInner', [gFL - 0.02, gBH - 0.02, gWd - 0.02], [gfx, hs + 0.12 + gBH / 2, 0])
  // stator core + rotor (visible in section)
  k.cyl(M.GEN, Math.min(gBH, gWd) * 0.42, gFL * 0.8, [gfx, yg, 0], 'x', 40)
  k.cyl('stainless', 0.1, gFL, [gfx, yg, 0], 'x', 16)
  const nr = Math.max(3, Math.round(gFL / 0.5))
  for (let i = 0; i <= nr; i++)
    for (const s of [-1, 1]) k.box(M.GEN, [0.05, gBH - 0.12, 0.06], [gF0 + 0.08 + (i * (gFL - 0.16)) / nr, hs + 0.12 + gBH / 2, s * (gWd / 2 + 0.02)])
  for (const s of [-1, 1]) k.box(M.GEN, [gFL + 0.06, 0.08, 0.1], [gfx, gTop - 0.04, s * (gWd / 2 + 0.02)])
  if (gCH > 0.25) {
    k.rbox(M.GEN, [gFL * 0.86, gCH, gWd * 0.86], 0.05, [gfx, gTop + gCH / 2, 0])
    for (const s of [-1, 1]) {
      const cx = gfx + s * gFL * 0.3
      k.cyl('flangeSteel', 0.07, 0.25, [cx, gTop + gCH * 0.5, -gWd * 0.43 - 0.1], 'z', 16)
      pipeRun(k, [[cx, gTop + gCH * 0.5, -gWd * 0.43 - 0.2], [cx, gTop + gCH * 0.5, -hw + 0.12], [cx, hs + 0.2, -hw + 0.12]], 3, 'stainless')
    }
  }
  // lifting lugs
  for (const sx of [gF0 + 0.25, gF1 - 0.25]) for (const s of [-1, 1]) k.torus('nut', 0.06, 0.018, [sx, gTop + 0.04, s * gWd * 0.42], 'x', 6, 14)
  // bearing pedestals + shaft
  for (const xb of [gF0 - 0.17, gF1 + 0.17]) {
    k.rbox(M.GEN, [0.34, yg - hs + 0.15, Math.min(0.85, gWd * 0.6)], 0.04, [xb, (yg + 0.15 + hs + 0.12) / 2, 0])
    k.cyl(M.GEN, 0.24, 0.38, [xb, yg, 0], 'x', 28)
    k.cyl('flangeSteel', 0.045, 0.02, [xb, yg - 0.12, 0.2], 'z', 12)
  }
  k.cyl('stainless', 0.1, sGen1 - gF1 - 0.3, [(gF1 + 0.3 + sGen1) / 2, yg, 0], 'x', 20)
  // brushless exciter at NDE
  const eR = Math.min(gBH, gWd) * 0.28
  k.cyl(M.GEN, eR, eL, [xa + eL / 2 + 0.05, yg, 0], 'x', 32)
  k.dome(M.GEN, eR, [xa + 0.05, yg, 0], '-x', Math.PI / 2, 0.35, 28)
  for (let i = 0; i < 6; i++) k.cyl(M.GEN, eR * 1.04, 0.025, [xa + 0.1 + (i * (eL - 0.1)) / 5, yg, 0], 'x', 32)
  // line-side terminal box (+Z) with power cables down into the skid
  const tbD = clamp(hw - gWd / 2 - 0.05, 0.15, 0.45)
  const tbL = Math.min(1.2, gFL * 0.35)
  const tbH = gBH * 0.55
  const tbx = gfx + gFL * 0.15
  const tbY = hs + 0.25 + tbH / 2
  k.rbox(M.GEN, [tbL, tbH, tbD], 0.03, [tbx, tbY, gWd / 2 + tbD / 2])
  k.box(M.GEN, [tbL - 0.08, tbH - 0.08, 0.02], [tbx, tbY, gWd / 2 + tbD + 0.01])
  k.around(8, Math.min(tbL, tbH) * 0.42, [tbx, tbY, gWd / 2 + tbD + 0.025], 'z', (p) => k.hex('nut', 0.025, 0.012, p, 'z'), Math.PI / 8)
  for (let i = 0; i < 3; i++) {
    const cx = tbx - tbL * 0.3 + i * tbL * 0.3
    const yb = tbY - tbH / 2
    k.hex('brass', 0.1, 0.06, [cx, yb - 0.03, gWd / 2 + tbD / 2], 'y')
    k.spline('cable', [[cx, yb - 0.05, gWd / 2 + tbD / 2], [cx, hs + 0.25, gWd / 2 + tbD / 2 + 0.03], [cx + 0.08, hs + 0.02, gWd / 2 + tbD / 2 - 0.05]], 0.04, 8, 14)
  }
  k.rbox(M.GEN, [0.4, 0.4, 0.2], 0.02, [gfx - gFL * 0.25, hs + 0.55, -gWd / 2 - 0.1]) // neutral / RTD box
  k.box('nameplate', [0.45, 0.28, 0.01], [gfx + gFL * 0.1, gTop - 0.35, -gWd / 2 - 0.006])

  // ================================================================ gearbox + couplings
  const gbL = sGb1 - sGb0
  const gbW = Math.min(2 * hw - 0.6, 0.8 + 0.6 * R)
  const yMid = (ys + yg) / 2
  const gbTop = Math.max(ys, yg) + 0.3 + 0.2 * R
  k.rbox(M.GEAR, [gbL, yMid - hs, gbW], 0.04, [gx, (yMid + hs) / 2, 0])
  k.box('vesselInner', [gbL - 0.02, gbTop - hs - 0.03, gbW * 0.84], [gx, (gbTop + hs) / 2, 0])
  // meshing gear pair (axes along X): bull gear on the generator shaft, pinion on the GT shaft
  const rPin = 0.1
  const rBull = Math.max(0.12, Math.abs(ys - yg) - rPin)
  k.cyl(M.GEAR, rBull, 0.3 * gbL, [gx, yg, 0], 'x', 36)
  k.cyl(M.GEAR, rPin, 0.34 * gbL, [gx, ys, 0], 'x', 20)
  k.cyl('stainless', 0.07, gbL + 0.1, [gx, yg, 0], 'x', 14)
  k.cyl('stainless', 0.06, gbL + 0.1, [gx, ys, 0], 'x', 14)
  k.rbox(M.GEAR, [gbL * 0.94, gbTop - yMid, gbW * 0.86], 0.12, [gx, (yMid + gbTop) / 2, 0])
  k.box(M.GEAR, [gbL + 0.08, 0.06, gbW + 0.08], [gx, yMid, 0])
  for (let i = 0; i < 7; i++)
    for (const s of [-1, 1]) {
      const bx = sGb0 + 0.06 + (i * (gbL - 0.12)) / 6
      k.cyl('boltXylan', 0.012, 0.12, [bx, yMid, s * (gbW / 2 + 0.02)], 'y', 6)
      k.hex('nut', 0.04, 0.02, [bx, yMid + 0.04, s * (gbW / 2 + 0.02)])
    }
  for (const s of [-1, 1]) for (const fx of [-0.3, 0, 0.3]) k.box(M.GEAR, [0.03, yMid - hs - 0.06, 0.08], [gx + fx * gbL, (yMid + hs) / 2, s * (gbW / 2 + 0.04)])
  k.box(M.GEAR, [gbL * 0.45, 0.04, gbW * 0.4], [gx, gbTop + 0.02, 0])
  k.cyl('brass', 0.03, 0.12, [gx + gbL * 0.3, gbTop + 0.06, gbW * 0.2], 'y', 10)
  k.cyl('brass', 0.05, 0.015, [gx, yMid - 0.25, gbW / 2 + 0.01], 'z', 16)
  k.disc('glass', 0.04, [gx, yMid - 0.25, gbW / 2 + 0.018], 'z', 16)
  k.cyl(M.GEAR, 0.2, 0.1, [sGb1 + 0.05, ys, 0], 'x', 28)
  k.cyl(M.GEAR, 0.24, 0.1, [sGb0 - 0.05, yg, 0], 'x', 28)
  // couplings turn inside their mesh guards (generator side slow, turbine side fast)
  const rotors: RotorSpec[] = []
  rotors.push(guardedCoupling(k, sGen1 - 0.02, sGb0 - 0.1, yg, 0.3, hs, 'safetyYellow', 135, 0, 0.1))
  rotors.push(guardedCoupling(k, sGb1 + 0.1, sPl0 - 0.03, ys, 0.27, hs, 'safetyYellow', 215, 0, 0.08))

  // ================================================================ air-inlet plenum + bell-mouth
  const plL = sPl1 - sPl0
  const plW = 2 * (hw - 0.04)
  const plTop = H - 0.1
  k.box(TRIM, [0.05, plTop - hs, plW], [sPl0 + 0.025, (plTop + hs) / 2, 0])
  for (const s of [-1, 1]) k.box(TRIM, [plL, plTop - hs, 0.05], [xp, (plTop + hs) / 2, s * (plW / 2 - 0.025)])
  {
    const sh = new THREE.Shape()
    sh.moveTo(-plW / 2, hs)
    sh.lineTo(plW / 2, hs)
    sh.lineTo(plW / 2, plTop)
    sh.lineTo(-plW / 2, plTop)
    sh.closePath()
    const hole = new THREE.Path()
    hole.absarc(0, ys, 0.84 * R, 0, Math.PI * 2, true)
    sh.holes.push(hole)
    k.extrude(TRIM, sh, 0.05, new THREE.Matrix4().compose(new THREE.Vector3(sPl1 - 0.05, 0, 0), new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2), new THREE.Vector3(1, 1, 1)), 32)
  }
  // bell-mouth (thin flared shell), nose cone with struts, FOD screen
  const bL = Math.min(plL * 0.6, 0.9 * R)
  const ri = 0.8 * R
  const rl = Math.min(1.3 * R, plW / 2 - 0.1, plTop - ys - 0.1)
  k.lathe(M.GT, [
    [ri, bL],
    [ri * 1.03, bL * 0.6],
    [(ri + rl) / 2, bL * 0.25],
    [rl, bL * 0.06],
    [rl + 0.03, 0],
    [rl + 0.07, 0.02],
    [rl + 0.05, bL * 0.12],
    [(ri + rl) / 2 + 0.05, bL * 0.3],
    [ri * 1.03 + 0.04, bL * 0.62],
    [ri + 0.04, bL],
  ], [sPl1 - bL, ys, 0], 'x', 48)
  k.dome(M.GT, 0.35 * R, [sPl1 - bL * 0.2, ys, 0], '-x', Math.PI / 2, 1.6, 28)
  k.cyl(M.GT, 0.35 * R, bL * 0.25, [sPl1 - bL * 0.1, ys, 0], 'x', 28)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    k.box(M.GT, [bL * 0.3, ri * 0.66, 0.02], [sPl1 - bL * 0.15, ys + Math.sin(a) * ri * 0.66, Math.cos(a) * ri * 0.66], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -a + Math.PI / 2))
  }
  k.cyl('stainless', 0.08, sPl1 - sPl0, [xp, ys, 0], 'x', 16) // drive shaft through the plenum
  {
    const fodR = rl + 0.08
    const fodL = Math.max(0.15, plL - bL - 0.1)
    const g = new THREE.CylinderGeometry(fodR, fodR, fodL, 40, 1, true)
    uvScale(g, (2 * Math.PI * fodR) / 0.25, fodL / 0.25)
    k.add(meshGuardMaterial('#b4b9bd'), g, mat4([sPl0 + 0.05 + fodL / 2, ys, 0], 'x'))
  }

  // ================================================================ gas turbine core
  const prof = (u: number) => {
    if (u <= 0.4) return R * (0.8 - (0.2 * u) / 0.4)
    if (u <= 0.43) return R * (0.6 + (0.14 * (u - 0.4)) / 0.03)
    if (u <= 0.56) return R * 0.74
    if (u <= 0.6) return R * (0.74 - (0.1 * (u - 0.56)) / 0.04)
    if (u <= 0.68) return R * (0.64 + (0.04 * (u - 0.6)) / 0.08)
    if (u <= 0.72) return R * (0.68 + (0.12 * (u - 0.68)) / 0.04)
    if (u <= 0.97) return R * (0.8 + (0.12 * (u - 0.72)) / 0.25)
    return R * 0.92
  }
  const xu = (u: number) => xc0 + u * Lc
  const lathe = (mat: MatKey, u0: number, u1: number, steps: number[]) => {
    const pts: [number, number][] = [[0, 0]]
    for (const u of [u0, ...steps.filter((s) => s > u0 && s < u1), u1]) pts.push([prof(u), (u - u0) * Lc])
    pts.push([0, (u1 - u0) * Lc])
    k.lathe(mat, pts, [xu(u0), ys, 0], 'x', 48)
    k.lathe('vesselInner', pts, [xu(u0), ys, 0], 'x', 48) // casing interior, seen when sectioned
  }
  const brk = [0.4, 0.43, 0.56, 0.6, 0.68, 0.72, 0.97]
  lathe(M.GT, 0, 0.4, [0.2])
  lathe(M.HOT, 0.4, 1, brk)
  // rotor (visible in section): shaft, compressor stages, combustor liner, turbine stages
  k.cyl('stainless', 0.12 * R, Lc * 0.96, [xu(0.49), ys, 0], 'x', 16)
  for (let i = 0; i < 12; i++) {
    const u = 0.03 + (i * 0.35) / 11
    k.cyl(M.GT, prof(u) - 0.035, 0.035, [xu(u), ys, 0], 'x', 40)
  }
  k.cyl(M.HOT, prof(0.5) * 0.78, 0.12 * Lc, [xu(0.49), ys, 0], 'x', 40, prof(0.5) * 0.7, true)
  for (const u of [0.62, 0.66, 0.76, 0.82, 0.88, 0.94]) k.cyl(M.HOT, prof(u) - 0.04, 0.04, [xu(u), ys, 0], 'x', 40)
  // casing flanges with bolting
  for (const [u, mat, nb] of [[0.005, M.GT, 24], [0.2, M.GT, 20], [0.4, M.HOT, 20], [0.56, M.HOT, 20], [0.68, M.HOT, 22], [0.72, M.HOT, 26], [0.995, M.HOT, 26]] as [number, MatKey, number][]) {
    const r = prof(Math.min(u, 0.999)) + (u < 0.01 ? 0.1 * R : 0.04)
    k.cyl(mat, r, 0.05, [xu(u), ys, 0], 'x', 48)
    k.boltCircle('boltXylan', 'nut', nb, r - 0.02, [xu(u) - 0.045, ys, 0], 'x', 0.016, 0.09, [0.078])
  }
  // VSV actuation rings with lever arms + actuator
  for (const u of [0.05, 0.09, 0.13]) {
    const r = prof(u) + 0.06
    k.torus('stainless', r, 0.012, [xu(u), ys, 0], 'x', 6, 48)
    k.around(20, prof(u) + 0.02, [xu(u) - 0.025, ys, 0], 'x', (p) => k.box('stainless', [0.06, 0.012, 0.012], p))
  }
  k.cyl('actuatorYellow', 0.04, Lc * 0.12, [xu(0.12), ys + 0.1 * R, prof(0.1) + 0.12], 'x', 12)
  k.rod('stainless', [xu(0.05), ys + 0.1 * R, prof(0.05) + 0.07], [xu(0.13), ys + 0.1 * R, prof(0.05) + 0.12], 0.012, 6)
  // accessory gearbox + starter under the compressor front
  k.rbox(M.GT, [Lc * 0.15, 0.25 * R, 0.6 * R], 0.03, [xu(0.12), ys - 0.82 * R - 0.12 * R, 0])
  k.cyl(M.GT, 0.12 * R, Lc * 0.08, [xu(0.12) - Lc * 0.1, ys - 0.9 * R, 0], 'x', 16)
  k.rod(M.GT, [xu(0.12), ys - 0.82 * R, 0], [xu(0.12), ys - 0.72 * R, 0], 0.08 * R, 12)
  // compressor bleed lines with bleed valves → exhaust collector
  for (const s of [-1, 1]) {
    const a = s * 0.6
    const rb = prof(0.3)
    const zb = Math.sin(a) * rb
    const yb = ys + Math.cos(a) * rb
    const yt = ys + 0.95 * R + (s > 0 ? 0 : 0.12)
    const bn = R > 0.7 ? 4 : 3
    pipeRun(k, [[xu(0.3), yb, zb], [xu(0.3), yt, zb], [xc1 + 0.05, yt, zb]], bn, M.GT)
    k.cyl(M.GT, pipeOD(bn) * 0.8, 0.06, [xu(0.3), yb + 0.02, zb], 'y', 16)
    const xv = xu(0.62)
    k.sphere('valveBody', pipeOD(bn) * 1.05, [xv, yt, zb], undefined, 14)
    k.rbox('actuatorYellow', [0.12, 0.14, 0.12], 0.02, [xv, yt + pipeOD(bn) + 0.08, zb])
  }
  // combustor: gas + liquid fuel manifold rings, pigtails to fuel nozzles, igniters
  const rcomb = prof(0.5)
  const rr = rcomb + 0.16
  const xL = xcomb + Math.max(0.12, 0.05 * Lc)
  k.torus('stainless', rr, pipeOD(2) / 2, [xcomb, ys, 0], 'x', 10, 64)
  k.torus('stainless', rr - 0.02, pipeOD(1) / 2, [xL, ys, 0], 'x', 8, 64)
  const nN = clamp(Math.round(8 + MW * 0.4), 10, 24)
  for (let i = 0; i < nN; i++) {
    const a = ((i + 0.5) / nN) * Math.PI * 2
    const c = Math.cos(a)
    const sn = Math.sin(a)
    const xn = (xcomb + xL) / 2
    k.cyl(M.HOT, 0.035, 0.08, [xn, ys + c * (rcomb + 0.03), sn * (rcomb + 0.03)], [0, c, sn], 10)
    const head: V3 = [xn, ys + c * (rcomb + 0.075), sn * (rcomb + 0.075)]
    const g1: V3 = [xcomb, ys + c * (rr - 0.05), sn * (rr - 0.05)]
    const g2: V3 = [xL, ys + c * (rr - 0.06), sn * (rr - 0.06)]
    k.rod('tubing', [xcomb, ys + c * rr, sn * rr], g1, 0.01, 5)
    k.rod('tubing', g1, head, 0.01, 5)
    k.rod('tubing', [xL, ys + c * (rr - 0.02), sn * (rr - 0.02)], g2, 0.008, 5)
    k.rod('tubing', g2, head, 0.008, 5)
  }
  for (const s of [-1, 1]) {
    const p: V3 = [xu(0.52), ys - 0.5 * R, s * 0.55 * R]
    k.rod('stainless', p, [p[0], p[1] - 0.15, p[2] * 1.25], 0.02, 8)
    k.spline('cable', [[p[0], p[1] - 0.15, p[2] * 1.25], [p[0] + 0.2, hs + 0.3, p[2] * 1.3], [p[0] + 0.5, hs + 0.05, p[2] * 1.3]], 0.012, 6, 16)
  }
  // EGT thermocouple harness + PT speed probes
  k.torus('tubing', prof(0.75) + 0.06, 0.008, [xu(0.75), ys, 0], 'x', 6, 48)
  k.around(12, prof(0.75) + 0.03, [xu(0.75), ys, 0], 'x', (p) => k.cyl('stainless', 0.012, 0.07, p, 'x', 6))
  // supports
  for (const s of [-1, 1]) {
    k.box(SKID, [0.14, ys - 0.62 * R - hs, 0.14], [xu(0.06), (ys - 0.62 * R + hs) / 2, s * 0.45 * R])
    k.box(SKID, [0.16, ys - 0.7 * R - hs, 0.16], [xu(0.8), (ys - 0.7 * R + hs) / 2, s * 0.55 * R])
  }
  k.box(SKID, [0.25, 0.04, 1.2 * R], [xu(0.06), ys - 0.62 * R, 0])
  k.box(SKID, [0.28, 0.04, 1.4 * R], [xu(0.8), ys - 0.7 * R, 0])
  k.box(SKID, [Lc * 0.9, 0.08, 1.4 * R], [xu(0.45), hs + 0.04, 0])

  // ================================================================ exhaust collector + duct
  const colTop = ys + 1.3 * R
  // insulated + clad (shell → fades in x-ray so the power-turbine exhaust end stays visible)
  k.rbox('insulation', [2 * cHL, colTop - (ys - 1.3 * R), 2 * cW], 0.12, [xst, ys, 0])
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.box('insulation', [0.03, 2.6 * R, 0.03], [xst - cHL * 0.6 + i * cHL * 0.6, ys, s * (cW + 0.012)])
  k.cyl('insulation', Rd, H + 0.3 - colTop, [xst, (H + 0.3 + colTop) / 2, 0], 'y', 48)
  for (let y = colTop + 0.6; y < H - 0.2; y += 0.8) k.cyl('insulation', Rd + 0.012, 0.03, [xst, y, 0], 'y', 48) // cladding bands
  // power-turbine exhaust diffuser cone inside the collector
  k.cyl(M.HOT, prof(0.99), 0.5 * cHL, [xc1 + 0.25 * cHL, ys, 0], 'x', 40, prof(0.99) * 1.1)
  k.dome(M.HOT, prof(0.99) * 0.45, [xc1 + 0.5 * cHL, ys, 0], 'x', Math.PI / 2, 1.2, 24)
  for (const s of [-1, 1]) k.box(SKID, [0.2, ys - 1.3 * R - hs, 2 * cW * 0.8], [xst + s * cHL * 0.6, (ys - 1.3 * R + hs) / 2, 0])

  // ================================================================ internal services
  // lube oil supply header (+Z side) with drops to bearings
  const zh = zi1 - 0.12
  const lyP = hs + 0.18
  pipeRun(k, [[xl, hs + 0.45, z1], [xl, hs + 0.45, zh], [xl, lyP, zh], [xa + 0.3, lyP, zh]], 1.5, 'stainless')
  pipeRun(k, [[xl, lyP, zh], [xu(0.85), lyP, zh]], 1.5, 'stainless')
  for (const [xb, yb, zb] of [
    [gF0 - 0.17, yg - 0.1, 0.25],
    [gF1 + 0.17, yg - 0.1, 0.25],
    [gx, yMid - 0.15, gbW / 2],
    [xu(0.06) + 0.12, ys - 0.55 * R, 0.4 * R],
    [xu(0.8) + 0.14, ys - 0.62 * R, 0.5 * R],
  ] as V3[])
    if (zh - zb > 0.08) pipeRun(k, [[xb, lyP, zh], [xb, yb, zh], [xb, yb, zb]], 1, 'stainless')
  // CO₂ discharge header along the ceiling with nozzles
  const yco = H - 0.35
  const zco = -hw * 0.35
  const cabX = cab0 + cabL / 2
  pipeRun(k, [[cabX, yco, z0], [cabX, yco, zco], [xc1 + cHL * 0.4, yco, zco]], 1.5, 'stainless')
  for (let x = cabX + 1.0; x < xc1 + cHL * 0.4; x += 2.4) {
    k.rod('stainless', [x, yco, zco], [x, yco - 0.18, zco], 0.02, 8)
    k.cyl('brass', 0.035, 0.06, [x, yco - 0.21, zco], 'y', 10)
  }
  gasDetector(k, [xcomb, H - 0.25, hw * 0.6])
  gasDetector(k, [xst - cHL - 0.25, H - 0.25, -hw * 0.6])
  // internal fuel lines from the wall penetration to the manifold rings
  const gap = hw - rr
  const zf = -rr - clamp(gap * 0.5, 0.06, 0.35)
  const yG = n1 ? n1.base[1] : 0.9
  const yG2 = n2 ? n2.base[1] : 0.9
  const yL = Math.max(yG + 1.0, 1.85)
  const gasNps = n1 ? n1.nps : 3
  const liqNps = n2 ? n2.nps : 2
  pipeRun(k, [[xpen, yG, z0], [xpen, yG, zf], [xcomb, yG, zf], [xcomb, ys, zf], [xcomb, ys, -rr]], Math.min(gasNps, 2), 'stainless')
  pipeRun(k, [[xpen, yL, z0], [xpen, yL, zf], [xL, yL, zf], [xL, ys, zf], [xL, ys, -rr + 0.02]], 1, 'stainless')

  // ================================================================ inlet silencer + filter house
  const dHt = clamp(0.9 + 0.02 * MW, 1.0, 1.6)
  const dW = plW
  const FLmax = 2 * Math.min(xp - ex0, xst - Rsil - 1.3 - xp)
  const FL = Math.max(Math.min(clamp(2.0 + 0.07 * MW, 2.4, 5.0), FLmax), plL + 0.2)
  const FW = Math.min(SW - 0.65, encW + 0.9) // hoods stand ~0.28 m proud
  const FH = clamp(1.8 + 0.05 * MW, 2.0, 3.8)
  const fy0 = H + dHt
  const fy1 = fy0 + FH
  k.box(TRIM, [plL, dHt, dW], [xp, H + dHt / 2, 0])
  for (const s of [-1, 1]) k.box(TRIM, [plL + 0.08, 0.08, dW + 0.08], [xp, H + dHt / 2 + s * dHt * 0.3, 0])
  const nsp = Math.max(3, Math.round(dW / 0.35))
  for (let i = 1; i < nsp; i++) k.box('internalsSteel', [plL - 0.1, dHt + 0.1, 0.1], [xp, H + dHt / 2 - 0.1, -dW / 2 + (i * dW) / nsp]) // splitters
  // filter house shell
  k.box(TRIM, [FL, 0.08, FW], [xp, fy0 + 0.04, 0])
  k.box(TRIM, [FL + 0.1, 0.1, FW + 0.1], [xp, fy1 - 0.05, 0])
  for (const s of [-1, 1]) {
    k.box(TRIM, [FL, FH, 0.04], [xp, (fy0 + fy1) / 2, s * (FW / 2 - 0.02)])
    k.box(TRIM, [0.04, FH, FW], [xp + s * (FL / 2 - 0.02), (fy0 + fy1) / 2, 0])
  }
  // weather hoods on ±Z and −X faces
  k.at([xp, fy0, FW / 2], faceQ('z'), () => hoods(k, FL - 0.25, FH - 0.35, 0, FH / 2))
  k.at([xp, fy0, -FW / 2], faceQ('-z'), () => hoods(k, FL - 0.25, FH - 0.35, 0, FH / 2))
  k.at([xp - FL / 2, fy0, 0], faceQ('-x'), () => hoods(k, FW - 0.25, FH - 0.35, 0, FH / 2))
  k.at([xp + FL / 2, fy0, 0], faceQ('x'), () => {
    // filter-house access door (stays shut: it opens onto the filter stages, not the machine)
    const fdH = Math.min(1.8, FH - 0.3)
    for (const L of doorFrame(k, 0.7, fdH, FW / 2 - 0.6)) k.at([L.hingeX, 0, HINGE_Z], undefined, () => doorLeaf(k, L.lw, fdH, L.latch))
    k.rbox('stainless', [0.5, 0.6, 0.12], 0.02, [-FW / 2 + 0.6, FH * 0.55, 0.06])
    for (let i = 0; i < 3; i++) smallGauge(k, [-FW / 2 + 0.45 + i * 0.15, FH * 0.55 + 0.12, 0.13], 'z', dialMaterial('bar', 10), 0.09)
  })
  gasDetector(k, [xp + FL / 2 + 0.12, fy0 + 0.4, -FW / 2 + 0.3])
  // filter stages inside: coalescer pads behind hoods, pocket-filter banks
  for (const s of [-1, 1]) {
    k.box('meshPad', [FL - 0.3, FH - 0.4, 0.05], [xp, (fy0 + fy1) / 2, s * (FW / 2 - 0.12)])
    const zb = s * (FW / 2 - 0.45)
    const nc = Math.max(2, Math.floor((FL - 0.3) / 0.62))
    const nrw = Math.max(2, Math.floor((FH - 0.4) / 0.62))
    // holding-frame grid of the filter bank (open, so x-ray sees through between the cells)
    for (let i = 0; i <= nc; i++) k.box('internalsSteel', [0.04, nrw * 0.62, 0.05], [xp - (nc * 0.62) / 2 + i * 0.62, fy0 + 0.2 + (nrw * 0.62) / 2, zb])
    for (let j = 0; j <= nrw; j++) k.box('internalsSteel', [nc * 0.62, 0.04, 0.05], [xp, fy0 + 0.2 + j * 0.62, zb])
    for (let i = 0; i < nc; i++)
      for (let j = 0; j < nrw; j++)
        k.box(M.MEDIA, [0.54, 0.54, 0.3], [xp - (nc * 0.62) / 2 + 0.31 + i * 0.62, fy0 + 0.2 + 0.31 + j * 0.62, zb - s * 0.17])
  }
  // support legs + knee braces
  const lz = Math.min(FW / 2 - 0.1, encW / 2 - 0.12)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const lx = xp + sx * (FL / 2 - 0.12)
      k.box('structSteel', [0.12, dHt, 0.12], [lx, H + dHt / 2, sz * lz])
      k.rod('structSteel', [lx, H + 0.1, sz * lz], [lx - sx * 0.5, fy0 - 0.02, sz * lz], 0.03, 8)
    }

  // ================================================================ ventilation fans on the roof (generator end)
  const fanR = clamp(0.3 + 0.005 * MW, 0.3, 0.5)
  const fanXmax = xp - FL / 2 - fanR - 0.3
  let roofFan: RotorSpec | undefined
  for (const fx of [xa + gR * 0.3, xa + gR * 0.68]) {
    if (fx > fanXmax) continue
    const fz = -encW * 0.18
    k.box(TRIM, [fanR * 2 + 0.2, 0.25, fanR * 2 + 0.2], [fx, H + 0.125, fz])
    k.cyl(TRIM, fanR, 0.7, [fx, H + 0.6, fz], 'y', 32, undefined, true)
    k.disc('castIron', fanR, [fx, H + 0.5, fz], 'y', 32)
    k.cyl(TRIM, fanR + 0.03, 0.05, [fx, H + 0.95, fz], 'y', 32, undefined, true) // rim (open: the impeller shows through the guard)
    k.disc(fanGuardMaterial(), fanR, [fx, H + 0.976, fz], 'y', 32)
    k.cyl('motorPaint', fanR * 0.32, 0.3, [fx, H + 0.8, fz], 'y', 16)
    // impeller (turns): aluminium blades over the dark damper plate
    roofFan ??= fanRotor(k, 'stainless', fanR * 0.94, [0, 0, 0], 'y', 0, { blades: 6, chord: fanR * 0.36, pitch: 0.42, hub: fanR * 0.3, hubLen: 0.1 })
    rotors.push({ ...roofFan, pos: [fx, H + 0.62, fz], rpm: 170 })
    k.rbox('stainless', [0.18, 0.2, 0.12], 0.01, [fx + fanR + 0.14, H + 0.35, fz])
  }

  // ================================================================ exhaust: expansion joint, silencer, stack
  const yE0 = H + 0.25
  const yE1 = H + 0.65
  const cone1 = Math.max(0.3, (Rsil - Rd) * 0.8)
  const cone2 = Math.max(0.3, (Rsil - Rs) * 0.9)
  let silH = clamp(stackH * 0.3, 1.2, 5)
  silH = Math.max(0.8, Math.min(silH, stackH - 0.65 - cone1 - cone2 - 1.0))
  const ySil0 = yE1 + cone1
  const ySil1 = ySil0 + silH
  const yS0 = ySil1 + cone2
  const yTop = Math.max(H + stackH, yS0 + 0.6)
  const sootH = clamp(0.06 * stackH, 0.35, 1.0)
  // duct stub + fabric expansion joint
  k.cyl(M.STACK, Rd, yE0 - H, [xst, (H + yE0) / 2, 0], 'y', 48)
  for (const y of [yE0, yE1]) k.cyl(M.STACK, Rd + 0.08, 0.05, [xst, y, 0], 'y', 48)
  k.lathe('rubberBlack', [[Rd + 0.01, yE0], [Rd + 0.07, yE0 + 0.12], [Rd + 0.1, (yE0 + yE1) / 2], [Rd + 0.07, yE1 - 0.12], [Rd + 0.01, yE1]], [xst, 0, 0], 'y', 48)
  // silencer + transition cones + stack shell (outer)
  k.lathe(M.STACK, [[0, yE1], [Rd, yE1], [Rsil, ySil0], [Rsil, ySil1], [Rs, yS0], [Rs, yTop - sootH * 2.2]], [xst, 0, 0], 'y', 48)
  k.lathe(M.SOOT2, [[Rs, yTop - sootH * 2.2], [Rs, yTop - sootH]], [xst, 0, 0], 'y', 48)
  k.lathe(M.SOOT, [[Rs, yTop - sootH], [Rs, yTop], [Rs + 0.05, yTop], [Rs + 0.05, yTop + 0.04], [Rs - 0.012, yTop + 0.04], [Rs - 0.012, yTop - 2.0]], [xst, 0, 0], 'y', 48)
  k.disc(M.SOOT, Rs, [xst, yTop - 1.9, 0], 'y', 40)
  // flanges: silencer ends, stack sections
  const flg = (y: number, r: number, n: number) => {
    k.cyl(M.STACK, r + 0.07, 0.06, [xst, y, 0], 'y', 48)
    k.boltCircle('boltXylan', 'nut', n, r + 0.04, [xst, y - 0.06, 0], 'y', 0.018, 0.12, [0.108])
  }
  flg(ySil0, Rsil, 28)
  flg(ySil1, Rsil, 28)
  flg(yS0, Rs, 20)
  const nSec = Math.max(1, Math.round((yTop - yS0) / 3.2))
  for (let i = 1; i < nSec; i++) flg(yS0 + (i * (yTop - yS0)) / nSec, Rs, 20)
  for (let i = 1; i < 4; i++) k.cyl(M.STACK, Rsil + 0.025, 0.08, [xst, ySil0 + (i * silH) / 4, 0], 'y', 48)
  // silencer support frame on the roof
  const lr = Math.min(Rsil * 0.72, encW / 2 - 0.1)
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const p: V3 = [xst + Math.cos(a) * lr, H, Math.sin(a) * lr]
    k.box('structSteel', [0.16, ySil0 - H, 0.16], [p[0], (H + ySil0) / 2, p[2]])
    k.box('structSteel', [0.3, 0.03, 0.3], [p[0], H + 0.015, p[2]])
  }
  k.torus('structSteel', lr, 0.05, [xst, ySil0 - 0.08, 0], 'y', 6, 40)
  // sampling platform + ladder from the roof
  const Rp = Math.max(Rs + 0.85, Rsil + 0.55)
  const yP = clamp(ySil1 + 1.2, yS0 + 0.3, yTop - 1.6)
  {
    const rg = new THREE.RingGeometry(Rs + 0.02, Rp, 48, 1)
    uvScale(rg, (2 * Rp) / 0.3, (2 * Rp) / 0.3)
    k.add(gratingMaterial(), rg, mat4([xst, yP, 0], eul(-Math.PI / 2, 0, 0)))
  }
  k.cyl('safetyYellow', Rp, 0.1, [xst, yP + 0.05, 0], 'y', 48, undefined, true)
  // handrail arc (Kit torus point t sits at (cos t, −sin t) in x/z; rotating by φ about Y adds φ to t):
  // leave the gap centred on −X where the ladder arrives
  const arc = Math.PI * 1.8
  const phi = Math.PI - (arc + Math.PI * 2) / 2
  const qArc = new THREE.Quaternion().setFromAxisAngle(UP, phi)
  for (const hh of [0.55, 1.1]) k.torus('safetyYellow', Rp - 0.02, 0.021, [xst, yP + hh, 0], qArc, 6, 56, arc)
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * arc + phi
    const px = xst + Math.cos(a) * (Rp - 0.02)
    const pz = -Math.sin(a) * (Rp - 0.02)
    k.rod('safetyYellow', [px, yP, pz], [px, yP + 1.1, pz], 0.021, 8)
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    k.rod('structSteel', [xst + Math.cos(a) * Rs, yP - 0.7, Math.sin(a) * Rs], [xst + Math.cos(a) * (Rp - 0.1), yP - 0.03, Math.sin(a) * (Rp - 0.1)], 0.03, 8)
    k.box('structSteel', [Rp - Rs, 0.08, 0.06], [xst + Math.cos(a) * (Rs + Rp) / 2, yP - 0.06, Math.sin(a) * (Rs + Rp) / 2], new THREE.Quaternion().setFromAxisAngle(UP, -a))
  }
  // ladder: −X side of the stack, from the roof to the platform (the handrail gap faces it)
  k.at([xst - Rsil - 0.25, H, 0], faceQ('-x'), () => ladder(k, yP - H))
  // sampling ports
  for (const a of [Math.PI / 2, -Math.PI / 2, 0]) {
    const d: V3 = [Math.cos(a), 0, Math.sin(a)]
    const ysp = Math.min(yP + 1.2, yTop - 0.4)
    k.rod(M.STACK, [xst + d[0] * (Rs - 0.02), ysp, d[2] * (Rs - 0.02)], [xst + d[0] * (Rs + 0.16), ysp, d[2] * (Rs + 0.16)], pipeOD(4) / 2, 16)
    pipeFlange(k, 4, 150, [xst + d[0] * (Rs + 0.24), ysp, d[2] * (Rs + 0.24)], d, true)
    k.cyl('flangeSteel', 0.115, 0.025, [xst + d[0] * (Rs + 0.253), ysp, d[2] * (Rs + 0.253)], d, 24)
  }
  // rain cap + aviation light
  const capY = yTop + 0.45 * Rs
  k.cyl(M.SOOT, Rs * 1.15, 0.35 * Rs, [xst, capY + 0.175 * Rs, 0], 'y', 40, 0.06)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    k.rod(M.SOOT, [xst + Math.cos(a) * (Rs + 0.03), yTop - 0.3, Math.sin(a) * (Rs + 0.03)], [xst + Math.cos(a) * Rs * 1.05, capY, Math.sin(a) * Rs * 1.05], 0.03, 6)
  }
  k.box('structSteel', [0.06, 0.06, 0.35], [xst, yTop - 0.6, Rs + 0.17])
  k.cyl('actuatorRed', 0.06, 0.12, [xst, yTop - 0.51, Rs + 0.3], 'y', 14)
  k.dome('glass', 0.06, [xst, yTop - 0.45, Rs + 0.3], 'y', Math.PI / 2, 1.3, 14)

  // ================================================================ −Z apron: fuel gas + liquid fuel skids
  const zA = (-SW / 2 + z0) / 2
  const fx0 = Math.min(x1, x2) - 0.35
  const fx1 = xpen + 0.25
  k.box(SKID, [fx1 - fx0, 0.1, m - 0.08], [(fx0 + fx1) / 2, hs + 0.05, zA])
  // gas line: N1 base → coalescer → ESDV → vent → ESDV → metering valve → wall
  if (n1) {
    const gs = xpen - x1
    const route: V3[] = [[xpen, yG, z0 + 0.01], [xpen, yG, zA], ...routeToNozzle([x1, yG, zA], n1.base, n1.dir)]
    pipeRun(k, route, gasNps, 'pipePaint')
    const rf = clamp(pipeOD(gasNps) * 1.6, 0.12, m / 2 - 0.05)
    const xf = x1 + gs * 0.2
    const fy0b = hs + 0.18
    const fy1b = yG + 0.75
    k.cyl('equipmentPaint', rf, fy1b - fy0b, [xf, (fy0b + fy1b) / 2, zA], 'y', 28)
    k.dome('equipmentPaint', rf, [xf, fy1b, zA], 'y', Math.PI / 2, 0.5, 24)
    k.cyl('flangeSteel', rf + 0.04, 0.05, [xf, fy1b - 0.1, zA], 'y', 28)
    k.around(12, rf + 0.02, [xf, fy1b - 0.07, zA], 'y', (p) => k.hex('nut', 0.025, 0.015, p))
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      k.rod(SKID, [xf + Math.cos(a) * rf * 0.8, hs + 0.1, zA + Math.sin(a) * rf * 0.8], [xf + Math.cos(a) * rf * 0.8, fy0b + 0.05, zA + Math.sin(a) * rf * 0.8], 0.025, 6)
    }
    smallGauge(k, [xf, yG + 0.35, zA - rf - 0.04], '-z', dialMaterial('bar', 10), 0.09)
    ballValve(k, x1 + gs * 0.42, yG, zA, gasNps, n1.rating)
    // bleed (vent) valve between the ESDVs
    const xvn = x1 + gs * 0.56
    k.rod('pipePaint', [xvn, yG, zA], [xvn, yG + 0.45, zA], pipeOD(1) / 2, 10)
    k.sphere('valveBody', 0.045, [xvn, yG + 0.25, zA], undefined, 12)
    k.rbox('actuatorYellow', [0.1, 0.1, 0.1], 0.015, [xvn, yG + 0.25, zA - 0.11])
    k.dome('pipePaint', pipeOD(1) / 2, [xvn, yG + 0.45, zA], 'y', Math.PI / 2, 0.5, 10)
    ballValve(k, x1 + gs * 0.7, yG, zA, gasNps, n1.rating)
    controlValve(k, x1 + gs * 0.9, yG, zA, gasNps, n1.rating)
    for (const xs of [x1 + gs * 0.3, x1 + gs * 0.8]) {
      k.rod('structSteel', [xs, hs + 0.1, zA], [xs, yG - pipeOD(gasNps) / 2 - 0.02, zA], 0.03, 8)
      k.box('structSteel', [0.12, 0.02, 0.14], [xs, yG - pipeOD(gasNps) / 2 - 0.01, zA])
    }
    // wall penetration plates
    for (const y of [yG, yL]) k.box(TRIM, [0.3, 0.3, 0.02], [xpen, y, z0 - 0.005])
  }
  // liquid fuel: N2 base → duplex filter → shut-off valve → riser → high run to the wall
  if (n2) {
    const xr = Math.max(x2 + 0.4, x1 - 0.28)
    const route: V3[] = [[xpen, yL, z0 + 0.01], [xpen, yL, zA], [xr, yL, zA], [xr, yG2, zA], ...routeToNozzle([x2, yG2, zA], n2.base, n2.dir)]
    pipeRun(k, route, liqNps, 'pipePaint')
    const ls = xr - x2
    const xdf = x2 + ls * 0.35
    for (const s of [-1, 1]) {
      k.cyl(OIL, 0.065, yG2 + 0.12 - (hs + 0.12), [xdf + s * 0.09, (yG2 + 0.12 + hs + 0.12) / 2, zA], 'y', 18)
      k.cyl(OIL, 0.075, 0.03, [xdf + s * 0.09, yG2 + 0.12, zA], 'y', 18)
    }
    k.rod('handwheel', [xdf, yG2 + 0.06, zA], [xdf, yG2 + 0.24, zA], 0.012, 6)
    k.box('handwheel', [0.22, 0.02, 0.02], [xdf, yG2 + 0.24, zA])
    ballValve(k, x2 + ls * 0.75, yG2, zA, liqNps, n2.rating)
    k.rod('structSteel', [xr, hs + 0.1, zA + 0.1], [xr, yL, zA + 0.1], 0.025, 8)
  }
  // apron gas detector on a post
  {
    const gx0 = Math.min(x1, x2) - 0.2
    k.rod('structSteel', [gx0, hs + 0.1, zA - 0.15], [gx0, 2.4, zA - 0.15], 0.025, 8)
    gasDetector(k, [gx0, 2.3, zA - 0.08])
  }
  // CO₂ fire-suppression cylinder cabinet (−Z apron, generator end)
  {
    const cd = m - 0.12
    const cz = z0 - cd / 2 - 0.02
    const ch = Math.min(2.0, H - hs - 0.4)
    const cx = cab0 + cabL / 2
    k.box('actuatorRed', [cabL, ch, 0.03], [cx, hs + ch / 2, z0 - 0.035])
    for (const s of [-1, 1]) k.box('actuatorRed', [0.03, ch, cd], [cx + s * (cabL / 2 - 0.015), hs + ch / 2, cz])
    k.box('actuatorRed', [cabL + 0.06, 0.04, cd + 0.08], [cx, hs + ch + 0.02, cz])
    k.box(SKID, [cabL, 0.06, cd], [cx, hs + 0.03, cz])
    const nbt = Math.max(2, Math.floor((cabL - 0.1) / 0.28))
    const bR = Math.min(0.12, cd / 2 - 0.04)
    const bH = ch - 0.55
    for (let i = 0; i < nbt; i++) {
      const bx = cx - cabL / 2 + 0.05 + (i + 0.5) * ((cabL - 0.1) / nbt)
      k.cyl('actuatorRed', bR, bH, [bx, hs + 0.06 + bH / 2, cz], 'y', 20)
      k.dome('actuatorRed', bR, [bx, hs + 0.06 + bH, cz], 'y', Math.PI / 2, 0.6, 16)
      k.cyl('brass', 0.035, 0.12, [bx, hs + bH + 0.18, cz], 'y', 10)
      k.tube('tubing', [[bx, hs + bH + 0.24, cz], [bx, hs + bH + 0.32, cz], [bx, hs + bH + 0.38, z0 - 0.08]], 0.01, 6, 0.04)
    }
    k.box('structSteel', [cabL - 0.06, 0.04, 0.05], [cx, hs + bH * 0.6, cz - bR - 0.03])
    pipeRun(k, [[cx - cabL / 2 + 0.08, hs + bH + 0.38, z0 - 0.08], [cx, hs + bH + 0.38, z0 - 0.08], [cx, yco, z0 - 0.08], [cx, yco, z0 + 0.02]], 1.5, 'stainless')
    k.box('actuatorRed', [cabL, 0.3, 0.02], [cx, hs + ch - 0.2, z0 - cd - 0.015])
    k.plane(signMaterial('ler', 'CO₂ FIRE SUPPRESSION'), Math.min(0.9, cabL - 0.1), 0.25, [cx, hs + ch - 0.2, z0 - cd - 0.03], new THREE.Quaternion().setFromAxisAngle(UP, Math.PI))
    // manual release station
    k.rbox('safetyGreen', [0.2, 0.26, 0.1], 0.02, [cx + cabL / 2 + 0.25, 1.4, z0 - 0.05])
  }

  // ================================================================ +Z apron: lube-oil console + fin-fan cooler
  {
    const lD = m - 0.14
    const zc = (z1 + SW / 2) / 2
    const tH = 0.8
    const yt = hs + tH
    k.rbox(OIL, [lcL, tH, lD], 0.03, [xl, hs + tH / 2, zc])
    for (const px of [xl - lcL * 0.32, xl - lcL * 0.08]) {
      k.cyl(OIL, 0.1, 0.16, [px, yt + 0.08, zc], 'y', 20)
      k.cyl('motorPaint', 0.13, 0.38, [px, yt + 0.35, zc], 'y', 24)
      for (let f = 0; f < 10; f++) {
        const a = (f / 10) * Math.PI * 2
        k.box('motorPaint', [0.01, 0.32, 0.025], [px + Math.cos(a) * 0.135, yt + 0.35, zc + Math.sin(a) * 0.135], new THREE.Quaternion().setFromAxisAngle(UP, -a))
      }
      k.cyl('motorPaint', 0.15, 0.1, [px, yt + 0.59, zc], 'y', 24, 0.12)
      pipeRun(k, [[px + 0.1, yt + 0.08, zc], [px + 0.2, yt + 0.08, zc], [px + 0.2, yt + 0.75, zc], [xl + lcL * 0.2, yt + 0.75, zc]], 1.5, OIL)
    }
    const fxl = xl + lcL * 0.2
    for (const s of [-1, 1]) {
      k.cyl(OIL, 0.09, 0.55, [fxl + s * 0.12, yt + 0.32, zc], 'y', 20)
      k.dome(OIL, 0.09, [fxl + s * 0.12, yt + 0.6, zc], 'y', Math.PI / 2, 0.5, 16)
    }
    k.box('valveBody', [0.12, 0.12, 0.2], [fxl, yt + 0.1, zc])
    k.rod('handwheel', [fxl, yt + 0.16, zc], [fxl, yt + 0.3, zc], 0.012, 6)
    smallGauge(k, [fxl, yt + 0.45, zc + 0.12], 'z', dialMaterial('bar', 10), 0.08)
    k.box('stainless', [0.05, tH * 0.7, 0.03], [xl + lcL * 0.4, hs + tH / 2, zc + lD / 2 + 0.015])
    k.box('glass', [0.025, tH * 0.6, 0.006], [xl + lcL * 0.4, hs + tH / 2, zc + lD / 2 + 0.033])
    k.rbox('stainless', [0.25, 0.25, 0.12], 0.02, [xl - lcL / 2 - 0.0, hs + tH * 0.55, zc], undefined)
    // supply / return through the enclosure wall
    for (const [i, xx] of [xl, xl + 0.25].entries()) {
      pipeRun(k, [[xx, hs + 0.45, zc - lD / 2 + 0.01], [xx, hs + 0.45, z1 - 0.01]], i === 0 ? 1.5 : 2, OIL)
      k.box(TRIM, [0.22, 0.22, 0.02], [xx, hs + 0.45, z1 + 0.005])
    }
    // fin-fan cooler on a stand above the tank
    const yc0 = Math.min(yt + 1.15, H + 0.2)
    const cL = lcL * 0.92
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) k.box('structSteel', [0.08, yc0 - hs, 0.08], [xl + sx * (cL / 2 - 0.04), (yc0 + hs) / 2, zc + sz * (lD / 2 - 0.04)])
    k.box('castIron', [cL - 0.24, 0.16, lD], [xl, yc0 + 0.08, zc])
    for (const s of [-1, 1]) k.box(OIL, [0.12, 0.24, lD + 0.04], [xl + s * (cL / 2 - 0.06), yc0 + 0.1, zc])
    k.box(OIL, [cL, 0.3, lD], [xl, yc0 + 0.35, zc])
    const nf = cL > 2.2 ? 2 : 1
    let coolFan: RotorSpec | undefined
    const fr = Math.min(lD / 2 - 0.04, cL / (2 * nf) - 0.06)
    for (let i = 0; i < nf; i++) {
      const fx = xl - cL / 2 + ((i + 0.5) * cL) / nf
      k.cyl(OIL, fr + 0.02, 0.14, [fx, yc0 + 0.57, zc], 'y', 32, undefined, true)
      k.disc(fanGuardMaterial(), fr, [fx, yc0 + 0.64, zc], 'y', 32)
      k.cyl('motorPaint', fr * 0.3, 0.22, [fx, yc0 + 0.76, zc], 'y', 16)
      k.cyl('motorPaint', 0.025, 0.1, [fx, yc0 + 0.6, zc], 'y', 10) // motor shaft through the guard
      // fin-fan impeller (turns) under the guard, drawing air up through the cooler core
      coolFan ??= fanRotor(k, 'stainless', fr * 0.93, [0, 0, 0], 'y', 0, { blades: 4, chord: fr * 0.4, pitch: 0.32, hub: fr * 0.2, hubLen: 0.06 })
      rotors.push({ ...coolFan, pos: [fx, yc0 + 0.57, zc], rpm: 190 })
    }
    pipeRun(k, [[xl + lcL * 0.42, yt, zc], [xl + lcL * 0.42, yc0 + 0.1, zc], [xl + cL / 2 - 0.06, yc0 + 0.1, zc]], 2, OIL)
    pipeRun(k, [[xl - cL / 2 + 0.06, yc0 + 0.1, zc - lD * 0.25], [xl - lcL * 0.45, yc0 + 0.1, zc - lD * 0.25], [xl - lcL * 0.45, yt, zc - lD * 0.25]], 2, OIL)
  }

  return { built: k.build(), rotors, doors }
}

export function GasTurbineGeneratorModel({ eq }: { eq: GasTurbineGenerator }) {
  const { built, rotors, doors } = useMemo(() => buildGasTurbineGenerator(eq), [eq])
  const m = materials()
  return (
    <group>
      <KitMesh data={built} />
      <Rotors tag={eq.tag} rotors={rotors} />
      <Doors tag={eq.tag} doors={doors} />
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} paintMaterial={m.pipePaint} />
      ))}
    </group>
  )
}
