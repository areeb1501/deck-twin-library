/**
 * Surface wellhead + christmas tree (API 6A, 5000 psi class) on a conductor.
 *
 * Local frame (types.ts): origin = wellhead base flange on top of the conductor, axis +Y.
 *   y < 0                   conductor stub + load plate (below the deck plate)
 *   0 … wellheadHeight      wellhead spools with studded flanges: a compact unitised head (< 0.6 m), casing head
 *                           + tubing head spool, or casing head + casing spool + tubing head (> 1.3 m). Annulus
 *                           side outlets: tubing head along ±X, casing head / spool on the diagonals; one side has
 *                           a gate valve + blind + gauge, the other a VR-plugged blind flange with a needle valve.
 *   wellheadHeight + …      tubing-head adapter, lower master gate (handwheel), upper master gate (= SSV with a
 *                           hydraulic piston actuator when eq.ssv), studded cross at XT_CROSS, swab valve, tree cap
 *                           with needle valve + pressure gauge.
 *   wings (cross height)    production along +X: actuated wing valve → flow tee with THP gauge → adjustable choke →
 *                           companion weld-neck flange whose weld end is exactly N1.base. Kill along −X: manual wing
 *                           valve → companion flange ending exactly at N2.base.
 * Stack valve stems and the SSV actuator point +Z (operator side); wing-valve and choke bonnets point +Y.
 *
 * Like PumpPackage, wing ends / height / sizes are DERIVED FROM THE NOZZLES (local dir ≈ ±X), with
 * the XT_* library constants as fallback, so the necks always start where the wings end.
 * Every flanged joint is laid out from a fixed end backwards, so the stack and wings are contiguous for
 * any wellheadHeight / bore / wing size. Flange faces sit G (half the ring-gasket gap) off each joint plane.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Rating, XmasTree } from '../../model/types'
import { pipeOD, pipeWall } from '../../model/catalog'
import { dirToLocal, toLocal } from '../../model/geom'
import { XT_CROSS, XT_WING_KILL, XT_WING_PROD } from '../../library/components'
import { materials, paint } from '../../three/materials'
import { NozzleNeck } from '../common/NozzleNeck'
import { Kit, eul, type MatKey, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { smallGauge, tagPlate } from './machinery/parts'
import { dialMaterial } from './machinery/textures'

/** forged valve bodies / cross / adapters (dark grey) */
const BODY: MatKey = 'valveBody'
/** wellhead spools (slightly lighter grey) */
const SPOOL: MatKey = paint('#5d646b', 'detail', { metalness: 0.4, roughness: 0.5 })
const ACT: MatKey = 'actuatorYellow'
const HW: MatKey = 'actuatorRed'
const HW_ANN: MatKey = 'actuatorYellow'
const STUD: MatKey = 'boltXylan'
const NUT: MatKey = 'nut'
const SS: MatKey = 'stainless'
/** hydraulic control lines (SSV, wing actuator) drop to the deck in the plane z = HYD_Z, clear of handwheels and outlets */
const HYD_Z = 0.25
/** half of the ring-gasket gap at every flanged joint */
const G = 0.003

interface Api {
  od: number
  t: number
  n: number
  bd: number
  bc: number
  /** gate-valve face-to-face */
  L: number
}

/** API 6A 5000-psi flange / gate valve dims, keyed by nominal bore (in): od, thickness, studs, stud dia, bolt circle, F2F. */
const API6A: Record<number, [number, number, number, number, number, number]> = {
  1: [0.185, 0.04, 8, 0.019, 0.146, 0.3], // 1-13/16
  2: [0.216, 0.046, 8, 0.022, 0.165, 0.371], // 2-1/16
  3: [0.267, 0.056, 8, 0.029, 0.216, 0.473], // 3-1/16
  4: [0.311, 0.062, 8, 0.032, 0.241, 0.524], // 4-1/16
  5: [0.375, 0.07, 8, 0.035, 0.292, 0.6], // 5-1/8
  6: [0.394, 0.072, 12, 0.035, 0.318, 0.65], // 7-1/16
  8: [0.483, 0.09, 12, 0.041, 0.394, 0.75], // 9
  10: [0.584, 0.1, 12, 0.048, 0.483, 0.85], // 11
  12: [0.673, 0.09, 20, 0.035, 0.59, 0.95], // 13-5/8 (3000)
  20: [0.857, 0.1, 20, 0.045, 0.768, 1.1], // 20-3/4 (3000)
}

function api(nps: number, rating: Rating = 900, scale = 1): Api {
  const keys = Object.keys(API6A).map(Number)
  let best = keys[0]
  for (const s of keys) if (Math.abs(s - nps) < Math.abs(best - nps)) best = s
  const [od, t, n, bd, bc, L] = API6A[best]
  const k = (rating >= 900 ? 1 : 0.94) * scale
  return { od: od * k, t: t * k, n, bd: bd * Math.sqrt(k), bc: bc * k, L: L * scale }
}

/** Frame whose local +Y = flow, local +Z = stem/bonnet, local +X = flow × stem, origin at `o`. */
function frame(o: V3, flow: V3, stem: V3) {
  const y = new THREE.Vector3(...flow).normalize()
  const z = new THREE.Vector3(...stem).normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...o)
}
const at = (M: THREE.Matrix4, p: V3) => new THREE.Vector3(...p).applyMatrix4(M).toArray() as V3

// ------------------------------------------------------------------ parts (local frame: flow along +Y, stem +Z)

/** 1/4" stainless control-line tubing along a polyline: straight rods with ball elbows (cheap). */
function tubing(k: Kit, pts: V3[], r = 0.0048) {
  for (let i = 0; i < pts.length - 1; i++) {
    k.rod('tubing', pts[i], pts[i + 1], r, 6)
    if (i > 0) k.sphere('tubing', r, pts[i], undefined, 6)
  }
}

const nutH = (d: Api) => d.bd * 0.9

/** Studs + nuts through two equal flanges meeting at y = yj, plus the RTJ ring visible in the gap. */
function joint(k: Kit, d: Api, yj: number) {
  const so = d.bd * 0.4
  const len = 2 * (G + d.t) + 2 * nutH(d) + 2 * so
  k.boltCircle(STUD, NUT, d.n, d.bc / 2, [0, yj - len / 2, 0], 'y', d.bd, len, [so + nutH(d) / 2, len - so - nutH(d) / 2])
  k.torus(SS, d.od * 0.27, 0.0045, [0, yj, 0], 'y', 4, 20)
}

/** Studs screwed into a studded block face at y = yf (block below), nut on the flange of the part above. */
function studded(k: Kit, d: Api, yf: number) {
  const so = d.bd * 0.4
  const inBlock = 0.03
  const len = inBlock + G + d.t + nutH(d) + so
  k.boltCircle(STUD, NUT, d.n, d.bc / 2, [0, yf - inBlock, 0], 'y', d.bd, len, [inBlock + G + d.t + nutH(d) / 2])
  k.torus(SS, d.od * 0.27, 0.0045, [0, yf, 0], 'y', 4, 20)
}

/** Integral flange whose face is at y = face, body on the side `s` (+1: above the face, -1: below). */
function flangeAt(k: Kit, d: Api, face: number, s: 1 | -1, mat: MatKey = BODY) {
  k.cyl(mat, d.od / 2, d.t, [0, face + s * (G + d.t / 2), 0], 'y', d.n >= 12 ? 36 : 28)
}

type Operator = { kind: 'handwheel'; mat: MatKey; D: number } | { kind: 'hydraulic'; r: number; len: number }

/**
 * API 6A slab gate valve between flange faces y = 0 and y = L. Forged body block, bolted bonnet on +Z,
 * handwheel or hydraulic piston actuator. Returns the hydraulic port (local) for tubing hook-up.
 */
function gateValve(k: Kit, d: Api, L: number, op: Operator): V3 | null {
  flangeAt(k, d, 0, 1)
  flangeAt(k, d, L, -1)
  const neckR = d.od * 0.3
  const inner = L - 2 * (G + d.t)
  k.cyl(BODY, neckR, inner + 0.004, [0, L / 2, 0], 'y', 24)
  const w = d.od * 0.8
  const dz = d.od * 0.92
  const hb = Math.max(0.05, Math.min(d.od, inner - 0.02))
  const yc = L / 2
  k.rbox(BODY, [w, hb, dz], Math.min(0.025, w * 0.1), [0, yc, 0])
  // body sealant injection fitting + seat grease fitting
  k.cyl('brass', 0.008, 0.03, [w / 2 + 0.012, yc + hb * 0.25, 0], 'x', 8)
  k.hex('brass', 0.017, 0.012, [w / 2 + 0.029, yc + hb * 0.25, 0], 'x')
  k.hex('brass', 0.015, 0.012, [-w / 2 - 0.006, yc - hb * 0.2, dz * 0.2], 'x')
  // bonnet flange + nuts + bonnet
  const rbf = Math.min(w * 0.5, hb * 0.5)
  let z = dz / 2
  k.cyl(BODY, rbf, 0.035, [0, yc, z + 0.0175], 'z', 28)
  k.around(8, rbf * 0.8, [0, yc, z + 0.035 + 0.008], 'z', (p) => k.hex(NUT, Math.max(0.022, d.bd * 1.3), 0.016, p, 'z'), Math.PI / 8)
  z += 0.035
  const bl = 0.07 + d.od * 0.15
  const rbo = rbf * 0.66
  k.cyl(BODY, rbo, bl, [0, yc, z + bl / 2], 'z', 24)
  z += bl
  if (op.kind === 'handwheel') {
    k.cyl(BODY, rbo * 0.62, 0.04, [0, yc, z + 0.02], 'z', 18) // stem bearing cap
    k.hex('brass', 0.016, 0.01, [rbo * 0.62, yc, z + 0.02], 'x') // bearing grease nipple
    const sr = Math.max(0.011, d.od * 0.045)
    k.cyl(SS, sr, 0.12, [0, yc, z + 0.06], 'z', 12)
    k.handwheel(op.mat, op.D, [0, yc, z + 0.1], 'z', 4)
    k.hex(NUT, sr * 2.4, 0.02, [0, yc, z + 0.12], 'z')
    return null
  }
  // hydraulic piston actuator: bonnet adapter, cylinder with end caps + tie rods, stem protector / indicator
  const { r, len } = op
  k.cyl(BODY, rbo * 0.85, 0.05, [0, yc, z + 0.025], 'z', 24)
  z += 0.05
  k.cyl(ACT, r * 1.08, 0.03, [0, yc, z + 0.015], 'z', 32)
  k.cyl(ACT, r, len, [0, yc, z + 0.03 + len / 2], 'z', 32)
  k.cyl(ACT, r * 1.08, 0.035, [0, yc, z + 0.03 + len + 0.0175], 'z', 32)
  k.around(4, r * 1.04, [0, yc, 0], 'z', (p) => {
    k.rod(SS, [p[0], p[1], z], [p[0], p[1], z + 0.065 + len + 0.012], 0.007, 8)
    k.hex(NUT, 0.02, 0.012, [p[0], p[1], z + 0.065 + len + 0.006], 'z')
  }, Math.PI / 4)
  const zt = z + 0.065 + len
  k.cyl(SS, 0.02, 0.1, [0, yc, zt + 0.05], 'z', 14) // stem protector
  k.cyl('safetyGreen', 0.023, 0.025, [0, yc, zt + 0.03], 'z', 14) // open/closed indicator band
  k.cyl(ACT, 0.03, 0.012, [0, yc, zt + 0.104], 'z', 14)
  // hydraulic supply port (+X side, near the base of the cylinder) with a quick-connect
  const zp = z + 0.03 + len * 0.22
  k.cyl('brass', 0.012, 0.04, [r + 0.012, yc, zp], 'x', 10)
  k.hex('brass', 0.026, 0.016, [r + 0.036, yc, zp], 'x')
  // fusible lock-open cap / name band
  k.cyl('nameplate', r * 1.002, 0.04, [0, yc, z + 0.03 + len * 0.62], 'z', 32)
  return [r + 0.046, yc, zp]
}

/** Adjustable choke between flange faces y = 0 and y = L: forged body, hammer-nut bonnet on +Z, stem indicator. */
function choke(k: Kit, dIn: Api, dOut: Api, L: number, actuated: boolean) {
  flangeAt(k, dIn, 0, 1)
  flangeAt(k, dOut, L, -1)
  const inner = L - 2 * G - dIn.t - dOut.t
  const od = Math.max(dIn.od, dOut.od)
  k.cyl(BODY, od * 0.3, inner + 0.004, [0, G + dIn.t + inner / 2, 0], 'y', 24)
  const w = od * 0.86
  const hb = Math.max(0.05, Math.min(od * 0.95, inner - 0.01))
  const yc = G + dIn.t + inner / 2
  k.rbox(BODY, [w, hb, w], 0.02, [0, yc, 0])
  // body drain/bleed plug on the underside
  k.hex('brass', 0.022, 0.016, [0, yc, -w / 2 - 0.008], 'z')
  // bonnet: hammer (wing) nut with three lugs
  let z = w / 2
  const rn = w * 0.42
  k.cyl(BODY, rn * 0.9, 0.02, [0, yc, z + 0.01], 'z', 24)
  z += 0.02
  k.cyl(BODY, rn, 0.07, [0, yc, z + 0.035], 'z', 24)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    k.box(BODY, [0.07, 0.035, 0.06], [Math.cos(a) * (rn + 0.03), yc + Math.sin(a) * (rn + 0.03), z + 0.035], eul(0, 0, a))
  }
  z += 0.07
  k.cyl(BODY, rn * 0.55, 0.1, [0, yc, z + 0.05], 'z', 20)
  z += 0.1
  // position indicator sleeve with a brass scale ring
  k.cyl(SS, rn * 0.4, 0.07, [0, yc, z + 0.035], 'z', 18)
  k.cyl('brass', rn * 0.42, 0.012, [0, yc, z + 0.02], 'z', 18)
  z += 0.07
  if (actuated) {
    // electro-hydraulic stepping actuator
    k.cyl(BODY, rn * 0.35, 0.05, [0, yc, z + 0.025], 'z', 14)
    z += 0.05
    k.rbox(ACT, [0.2, 0.17, 0.16], 0.02, [0, yc, z + 0.08])
    k.cyl(ACT, 0.05, 0.14, [0.0, yc + 0.13, z + 0.08], 'y', 18)
    k.cyl(NUT, 0.052, 0.012, [0.0, yc + 0.2, z + 0.08], 'y', 18)
    k.box('nameplate', [0.08, 0.002, 0.05], [0, yc - 0.086, z + 0.09])
    k.hex('brass', 0.024, 0.02, [0.1 + 0.01, yc, z + 0.05], 'x')
  } else {
    k.cyl(SS, 0.014, 0.1, [0, yc, z + 0.05], 'z', 10)
    k.handwheel(HW, 0.3, [0, yc, z + 0.08], 'z', 4)
  }
}

/** Short flanged spool (flow tee) between faces 0 and L with a small top branch (+Z) of height returned. */
function flowTee(k: Kit, d: Api, L: number) {
  flangeAt(k, d, 0, 1)
  flangeAt(k, d, L, -1)
  const inner = L - 2 * (G + d.t)
  const r = d.od * 0.3
  k.cyl(BODY, r, inner + 0.004, [0, L / 2, 0], 'y', 24)
  // forged branch boss + 1/2" needle valve
  k.cyl(BODY, r * 0.55, r + 0.04, [0, L / 2, (r + 0.04) / 2], 'z', 16)
  const z = r + 0.04
  k.hex(SS, 0.032, 0.02, [0, L / 2, z + 0.01], 'z')
  k.box(SS, [0.035, 0.035, 0.045], [0, L / 2, z + 0.042])
  k.cyl(SS, 0.006, 0.05, [0.04, L / 2, z + 0.045], 'x', 8)
  k.box(HW, [0.012, 0.06, 0.012], [0.068, L / 2, z + 0.045])
  k.cyl(SS, 0.008, 0.04, [0, L / 2, z + 0.085], 'z', 8)
  return z + 0.105
}

/** Plain flanged spacer spool between faces 0 and L. */
function spacer(k: Kit, d: Api, L: number) {
  flangeAt(k, d, 0, 1)
  flangeAt(k, d, L, -1)
  k.cyl(BODY, d.od * 0.3, L - 2 * (G + d.t) + 0.004, [0, L / 2, 0], 'y', 24)
}

/** Companion weld-neck flange: flange face at y = 0, hub tapering to the pipe OD whose weld end is exactly y = L. */
function companion(k: Kit, d: Api, nps: number, L: number) {
  flangeAt(k, d, 0, 1, 'flangeSteel')
  const rp = pipeOD(nps) / 2
  const y0 = G + d.t
  k.lathe('flangeSteel', [
    [0, y0],
    [Math.max(rp * 1.25, d.od * 0.3), y0],
    [rp, L],
    [0, L],
  ], [0, 0, 0], 'y', 28)
}

/** Studded square pad (block face) seen from the part side: block occupies y < 0. */
function pad(k: Kit, mat: MatKey, size: number, depth: number) {
  k.box(mat, [size, depth, size], [0, -depth / 2, 0])
}

// ------------------------------------------------------------------ assembly

interface Wing {
  x: number
  y: number
  nps: number
}

export function buildXmasTree(eq: XmasTree) {
  const k = new Kit()
  const T = eq.wellheadHeight
  const rating: Rating = eq.nozzles[0]?.rating ?? 900
  const loc = eq.nozzles.map((n) => ({ base: toLocal(eq, n.base), dir: dirToLocal(eq, n.dir), nps: n.nps }))
  const prodN = loc.find((n) => n.dir[0] > 0.7)
  const killN = loc.find((n) => n.dir[0] < -0.7)
  const yC = prodN ? prodN.base[1] : killN ? killN.base[1] : T + XT_CROSS
  const prod: Wing = { x: prodN ? prodN.base[0] : XT_WING_PROD, y: yC, nps: prodN?.nps ?? 4 }
  const kill: Wing = { x: killN ? killN.base[0] : -XT_WING_KILL, y: yC, nps: killN?.nps ?? 2 }

  const dB = api(eq.boreNps, rating)
  const dW = api(prod.nps, rating)
  const dK = api(kill.nps, rating)
  const F20 = api(20, 600)
  const F13 = api(12, 600)
  const F11 = api(10, rating)

  // ---------------------------------------------------------------- conductor + load plate (below the base flange)
  k.cyl('equipmentPaintDark', 0.381, 0.6, [0, -0.34, 0], 'y', 40)
  k.box('structSteel', [0.92, 0.04, 0.92], [0, -0.032, 0]) // top 12 mm below the deck plate (no z-fight)
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    // gussets between plate and conductor
    const c = Math.cos(a)
    const s = Math.sin(a)
    k.box('structSteel', [0.012, 0.18, 0.06], [c * 0.42, -0.142, s * 0.42], eul(0, -a, 0))
  }

  // ---------------------------------------------------------------- wellhead spools (0 … T)
  type Spool = { y0: number; y1: number; fb: Api | null; ft: Api; dirs: V3[] }
  const X: V3 = [1, 0, 0]
  const D1: V3 = [Math.SQRT1_2, 0, -Math.SQRT1_2]
  const spools: Spool[] =
    T < 0.6
      ? [{ y0: 0, y1: T, fb: null, ft: F11, dirs: [X, D1] }]
      : T <= 1.3
        ? [
            { y0: 0, y1: 0.45 * T, fb: null, ft: F13, dirs: [D1] },
            { y0: 0.45 * T, y1: T, fb: F13, ft: F11, dirs: [X] },
          ]
        : [
            { y0: 0, y1: 0.34 * T, fb: null, ft: F20, dirs: [D1] },
            { y0: 0.34 * T, y1: 0.67 * T, fb: F20, ft: F13, dirs: [D1] },
            { y0: 0.67 * T, y1: T, fb: F13, ft: F11, dirs: [X] },
          ]
  const dA = api(2, rating, 0.8) // annulus outlets: 2-1/16" valves (slightly compacted)
  const annDial = dialMaterial('bar', 100)
  spools.forEach((sp, i) => {
    const baseT = 0.05
    const fbT = sp.fb ? sp.fb.t : baseT
    const fbOd = sp.fb ? sp.fb.od : Math.max(sp.ft.od, 0.7)
    const rb = Math.max(sp.ft.od, sp.fb?.od ?? 0) * 0.36
    const yb0 = sp.y0 + (sp.fb ? G : 0) + fbT
    const yb1 = sp.y1 - G - sp.ft.t
    const ri = Math.min(rb * 0.55, 0.14)
    const fil = Math.min(0.03, Math.max(0.005, (yb1 - yb0) * 0.15))
    k.lathe(SPOOL, [
      [ri, sp.y0 + (sp.fb ? G : 0)],
      [fbOd / 2, sp.y0 + (sp.fb ? G : 0)],
      [fbOd / 2, yb0],
      [rb * 1.12, yb0],
      [rb, yb0 + fil],
      [rb, yb1 - fil],
      [rb * 1.12, yb1],
      [sp.ft.od / 2, yb1],
      [sp.ft.od / 2, sp.y1 - G],
      [ri, sp.y1 - G],
      [ri, sp.y0 + (sp.fb ? G : 0)],
    ], [0, 0, 0], 'y', 48)
    // flanged joint to the spool below
    if (sp.fb) k.at([0, sp.y0, 0], undefined, () => joint(k, sp.fb!, 0))
    else {
      // base flange hold-down studs into the load plate
      k.boltCircle(STUD, NUT, 12, fbOd / 2 - 0.035, [0, -0.01, 0], 'y', 0.022, baseT + 0.05, [baseT + 0.012])
    }
    // annulus outlets at mid-body
    const bodyH = yb1 - yb0
    if (bodyH < 0.1) return
    sp.dirs.forEach((u, j) => {
      const y = sp.dirs.length > 1 ? yb0 + bodyH * (j === 0 ? 0.68 : 0.3) : (yb0 + yb1) / 2
      const padSize = Math.min(dA.od * 0.95, bodyH - 0.01, sp.dirs.length > 1 ? bodyH * 0.45 : 1)
      for (const s of [1, -1]) {
        const uu: V3 = [u[0] * s, 0, u[2] * s]
        const R0 = rb + 0.05
        const M = frame([uu[0] * R0, y, uu[2] * R0], uu, [0, 1, 0])
        k.rod(SPOOL, [uu[0] * rb * 0.8, y, uu[2] * rb * 0.8], [uu[0] * (R0 - 0.03), y, uu[2] * (R0 - 0.03)], Math.min(0.06, padSize * 0.4), 16)
        k.with(M, () => {
          pad(k, SPOOL, padSize, 0.035)
          studded(k, dA, 0)
        })
        if (s === 1) {
          // gate valve (yellow handwheel) + blind flange + needle valve + gauge riser
          const LA = dA.L * 0.75
          k.with(M, () => {
            gateValve(k, dA, LA, { kind: 'handwheel', mat: HW_ANN, D: 0.2 })
            joint(k, dA, LA)
            flangeAt(k, dA, LA, 1, 'flangeSteel')
            const yb = LA + G + dA.t
            k.hex(SS, 0.03, 0.025, [0, yb + 0.012, 0], 'y')
            k.box(SS, [0.035, 0.04, 0.035], [0, yb + 0.045, 0])
            k.box(HW_ANN, [0.06, 0.01, 0.01], [0.03, yb + 0.045, 0.024])
            k.cyl(SS, 0.007, 0.1, [0, yb + 0.045, 0.06], 'z', 8)
          })
          smallGauge(k, at(M, [0, LA + G + dA.t + 0.045, 0.14]), uu, annDial, 0.1)
        } else {
          // VR-plugged outlet: blind flange with a needle valve
          k.with(M, () => {
            flangeAt(k, dA, 0, 1, 'flangeSteel')
            const yb = G + dA.t
            k.hex(SS, 0.028, 0.02, [0, yb + 0.01, 0], 'y')
            k.box(SS, [0.03, 0.035, 0.03], [0, yb + 0.037, 0])
            k.box(HW_ANN, [0.012, 0.012, 0.055], [0, yb + 0.037, 0.03])
          })
        }
      }
    })
    // tubing-head extras: hanger lock-down screws + SCSSV control-line exit
    if (i === spools.length - 1) {
      const yl = sp.y1 - G - sp.ft.t / 2
      k.around(8, sp.ft.od / 2, [0, yl, 0], 'y', (p) => {
        const r = Math.hypot(p[0], p[2])
        const n: V3 = [p[0] / r, 0, p[2] / r]
        k.hex('brass', 0.045, 0.03, [p[0] + n[0] * 0.012, yl, p[2] + n[2] * 0.012], n)
        k.rod(SS, [p[0] + n[0] * 0.02, yl, p[2] + n[2] * 0.02], [p[0] + n[0] * 0.055, yl, p[2] + n[2] * 0.055], 0.008, 8)
      }, Math.PI / 8)
      const yc = yb0 + bodyH * 0.5 + (bodyH > 0.2 ? 0.05 : 0)
      const z0 = rb
      k.hex(SS, 0.034, 0.025, [0, yc, z0 + 0.01], 'z')
      k.box(SS, [0.04, 0.04, 0.05], [0, yc, z0 + 0.06])
      k.box('actuatorRed', [0.012, 0.06, 0.012], [0.025, yc + 0.03, z0 + 0.06])
      tubing(k, [[0, yc, z0 + 0.08], [0, yc, 0.47], [0, 0.04, 0.47], [-0.12, 0.04, 0.47]])
    }
  })

  // ---------------------------------------------------------------- tree stack (T … cross … cap)
  const maxOd = Math.max(dB.od, dW.od, dK.od)
  const cH = maxOd * 0.46 // studded cross half size (cube)
  const aMin = F11.t + dB.t + 2 * G + 0.04
  const hvMax = Math.max(0.15, (yC - cH - T - aMin) / 2)
  const hv = Math.min(hvMax, Math.max(dB.L, hvMax * 0.85))
  const ySSV = yC - cH - hv // SSV lower face
  const yLMV = ySSV - hv // LMV lower face (= adapter top)
  const hwD = 0.28 + eq.boreNps * 0.035
  const vert = (y: number) => frame([0, y, 0], [0, 1, 0], [0, 0, 1])

  // tubing-head adapter: F11 (bottom) × bore flange (top)
  {
    const y0 = T
    const y1 = yLMV
    k.at([0, T, 0], undefined, () => joint(k, F11, 0))
    const yb0 = y0 + G + F11.t
    const yb1 = y1 - G - dB.t
    k.lathe(BODY, [
      [0.05, y0 + G],
      [F11.od / 2, y0 + G],
      [F11.od / 2, yb0],
      [Math.max(dB.od * 0.42, F11.od * 0.3), yb0],
      [dB.od * 0.34, Math.max(yb0 + 0.01, yb1 - 0.02)],
      [dB.od * 0.34, yb1],
      [dB.od / 2, yb1],
      [dB.od / 2, y1 - G],
      [0.05, y1 - G],
      [0.05, y0 + G],
    ], [0, 0, 0], 'y', 40)
    // adapter test port
    k.hex('brass', 0.022, 0.016, [Math.max(dB.od * 0.42, F11.od * 0.3) + 0.005, yb0 + 0.02, 0], 'x')
  }

  // lower master (manual)
  k.with(vert(yLMV), () => {
    joint(k, dB, 0)
    gateValve(k, dB, hv, { kind: 'handwheel', mat: HW, D: hwD })
    joint(k, dB, hv)
  })
  // upper master: SSV with hydraulic actuator, or a second manual master
  const ssvPort = (() => {
    let port: V3 | null = null
    k.with(vert(ySSV), () => {
      port = gateValve(k, dB, hv, eq.ssv ? { kind: 'hydraulic', r: 0.09 + eq.boreNps * 0.012, len: 0.2 + eq.boreNps * 0.012 } : { kind: 'handwheel', mat: HW, D: hwD })
    })
    return port ? at(vert(ySSV), port) : null
  })()

  // studded cross
  k.rbox(BODY, [2 * cH, 2 * cH, 2 * cH * 0.92], 0.012, [0, yC, 0])
  k.with(frame([0, yC - cH, 0], [0, -1, 0], [0, 0, 1]), () => studded(k, dB, 0))
  k.with(frame([0, yC + cH, 0], [0, 1, 0], [0, 0, 1]), () => studded(k, dB, 0))
  k.with(frame([cH, yC, 0], [1, 0, 0], [0, 1, 0]), () => studded(k, dW, 0))
  k.with(frame([-cH, yC, 0], [-1, 0, 0], [0, 1, 0]), () => studded(k, dK, 0))
  // tag plate(s) on the cross front face
  const tagW = Math.min(0.17, cH * 1.6)
  tagPlate(k, eq.tag, [0, yC + (eq.wellType === 'suspended' ? cH * 0.35 : 0), cH * 0.92 + 0.001], 'z', tagW)
  if (eq.wellType === 'suspended') tagPlate(k, 'SUSPENDED', [0, yC - cH * 0.35, cH * 0.92 + 0.001], 'z', tagW)

  // swab valve + tree cap with gauge
  const hs = Math.max(0.15, Math.min(hv * 0.9, dB.L))
  const yS = yC + cH
  k.with(vert(yS), () => {
    gateValve(k, dB, hs, { kind: 'handwheel', mat: HW, D: hwD * 0.9 })
    joint(k, dB, hs)
    // tree cap: flange, body, hammer-union cap with lugs, top needle valve
    flangeAt(k, dB, hs, 1)
    let y = hs + G + dB.t
    const rc = dB.od * 0.3
    k.cyl(BODY, rc, 0.12, [0, y + 0.06, 0], 'y', 24)
    y += 0.12
    const ru = dB.od * 0.38
    k.cyl(BODY, ru, 0.075, [0, y + 0.0375, 0], 'y', 24)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      k.box(BODY, [0.07, 0.05, 0.035], [Math.cos(a) * (ru + 0.03), y + 0.0375, Math.sin(a) * (ru + 0.03)], eul(0, -a, 0))
    }
    y += 0.075
    k.cyl(BODY, rc * 0.7, 0.03, [0, y + 0.015, 0], 'y', 20)
    y += 0.03
    k.hex(SS, 0.032, 0.02, [0, y + 0.01, 0])
    k.box(SS, [0.036, 0.045, 0.036], [0, y + 0.042, 0])
    k.cyl(SS, 0.006, 0.05, [0.04, y + 0.042, 0], 'x', 8)
    k.box(HW, [0.012, 0.012, 0.06], [0.068, y + 0.042, 0])
    k.cyl(SS, 0.008, 0.05, [0, y + 0.09, 0], 'y', 8)
  })
  {
    const yTop = yS + hs + G + dB.t + 0.12 + 0.075 + 0.03 + 0.115
    smallGauge(k, [0, yTop + 0.05, 0.0], 'z', dialMaterial('bar', 400), 0.1)
  }

  // ---------------------------------------------------------------- production wing (+X): laid out from N1.base backwards
  const actuated = eq.ssv
  {
    const xEnd = prod.x
    const cL = dW.t + G + 0.05 + 0.006 * prod.nps // companion flange + hub
    const avail = xEnd - cH - cL
    const Lw0 = Math.max(2 * dW.t + 0.12, dW.L * 0.8)
    const Lc0 = Math.max(dW.t * 2 + 0.12, 0.24 + 0.012 * prod.nps)
    const tee0 = 0.12
    let Lw = Lw0
    let Lc = Lc0
    let Lt = avail - Lw0 - Lc0
    if (Lt < tee0) {
      const s = avail / (Lw0 + Lc0 + tee0)
      Lw = Lw0 * s
      Lc = Lc0 * s
      Lt = tee0 * s
    }
    const x1 = cH + Lw
    const x2 = x1 + Lt
    const x3 = x2 + Lc
    const Mw = frame([cH, yC, 0], [1, 0, 0], [0, 1, 0])
    let port: V3 | null = null
    k.with(Mw, () => {
      port = gateValve(k, dW, Lw, { kind: 'hydraulic', r: 0.08 + prod.nps * 0.01, len: 0.16 + prod.nps * 0.01 })
      joint(k, dW, Lw)
    })
    const Mt = frame([x1, yC, 0], [1, 0, 0], [0, 1, 0])
    let gy = 0
    k.with(Mt, () => {
      gy = flowTee(k, dW, Lt)
      joint(k, dW, Lt)
    })
    smallGauge(k, at(Mt, [0, Lt / 2, gy + 0.05]), 'z', dialMaterial('bar', 400), 0.1)
    k.with(frame([x2, yC, 0], [1, 0, 0], [0, 1, 0]), () => {
      choke(k, dW, dW, Lc, actuated)
      joint(k, dW, Lc)
    })
    k.with(frame([x3, yC, 0], [1, 0, 0], [0, 1, 0]), () => companion(k, dW, prod.nps, xEnd - x3))
    // hydraulic control lines from the SSV and wing actuators down to the deck (wellhead control panel)
    if (port) {
      const p = at(Mw, port)
      tubing(k, [p, [p[0], p[1], HYD_Z], [0.38, p[1], HYD_Z], [0.38, 0.04, HYD_Z], [0.38, 0.04, HYD_Z + 0.25]])
    }
  }
  if (ssvPort) {
    const p = ssvPort
    const x = Math.max(p[0] + 0.06, 0.3)
    tubing(k, [p, [x, p[1], p[2]], [x, p[1], HYD_Z], [x, 0.04, HYD_Z], [x, 0.04, HYD_Z + 0.25]])
  }

  // ---------------------------------------------------------------- kill wing (−X): manual wing valve, laid out from N2.base backwards
  {
    const xEnd = -kill.x // positive distance from the axis
    const cL = dK.t + G + 0.05 + 0.006 * kill.nps
    const avail = Math.max(0.12, xEnd - cH - cL)
    // valve at its API length; any surplus becomes a flanged spacer spool against the cross
    const Lk = Math.min(avail, dK.L)
    const Ls = avail - Lk > 2 * (G + dK.t) + 0.02 ? avail - Lk : 0
    const Lv = avail - Ls
    if (Ls) k.with(frame([-cH, yC, 0], [-1, 0, 0], [0, 1, 0]), () => {
      spacer(k, dK, Ls)
      joint(k, dK, Ls)
    })
    k.with(frame([-(cH + Ls), yC, 0], [-1, 0, 0], [0, 1, 0]), () => {
      gateValve(k, dK, Lv, { kind: 'handwheel', mat: HW, D: 0.2 + kill.nps * 0.03 })
      joint(k, dK, Lv)
    })
    k.with(frame([-(cH + avail), yC, 0], [-1, 0, 0], [0, 1, 0]), () => companion(k, dK, kill.nps, xEnd - cH - avail))
  }

  // ---------------------------------------------------------------- through-bores (inward-facing liners: show in section / x-ray)
  const boreR = (nps: number) => pipeOD(nps) / 2 - pipeWall(nps, '160')
  const liner = (r: number, y0: number, y1: number) => k.lathe('pipeBore', [[r, y1], [r, y0]], [0, 0, 0], 'y', 20)
  liner(Math.min(boreR(eq.boreNps), dB.od * 0.2), T + G, yS + hs - G)
  k.with(frame([0, yC, 0], [1, 0, 0], [0, 1, 0]), () => liner(Math.min(boreR(prod.nps), dW.od * 0.2), 0, prod.x))
  k.with(frame([0, yC, 0], [-1, 0, 0], [0, 1, 0]), () => liner(Math.min(boreR(kill.nps), dK.od * 0.2), 0, -kill.x))

  return k.build()
}

export function XmasTreeModel({ eq }: { eq: XmasTree }) {
  const built = useMemo(() => buildXmasTree(eq), [eq])
  const m = materials()
  return (
    <group>
      <KitMesh data={built} />
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} paintMaterial={m.valveBody} />
      ))}
    </group>
  )
}
