/**
 * In-line valves.
 *
 * CONVENTIONS (all types except PSV)
 *   - origin = valve centre, flow axis = local X (inlet at -X, outlet at +X), stem / operator along +Y.
 *   - the valve's own integral end flanges have their RAISED FACES exactly at x = ±L/2 where
 *     L = valveLength(type, nps) (ASME B16.10). Piping renders mating flanges / gaskets / studs outside.
 *   - butterfly valves are wafer bodies: the machined wafer faces sit at x = ±L/2 (no flange discs).
 *
 * PSV CONVENTION (type 'psv', API 526 angle body)
 *   - origin = centre of the INLET flange raised face. The inlet faces -Y (it bolts onto a nozzle /
 *     riser coming up from below), the body extends +Y.
 *   - outlet flange (outletNps, Class 150) faces +X; its raised face centre is at psvDims().outletFace
 *     = [B, A, 0] (A = centre-to-inlet-face, B = centre-to-outlet-face).
 *   - spring bonnet, cap and lifting lever above the body (+Y).
 *
 * Geometry is cached at module level per (type, nps, rating, actuator, outletNps) so all instances
 * share one merged buffer. Each valve renders 1 merged mesh (≤ 8 draw groups) plus, for valves with
 * moving parts (rising stem, lever, butterfly disc, control-valve stem connector, quarter-turn position
 * indicator), 1 more mesh driven by `open` — or, with `tag`, by the valve's live travel in the simulation
 * (`valves[tag].pos`, eased in useFrame; no React re-render).
 */
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { flange, pipeOD, pipeWall, valveLength } from '../../model/catalog'
import type { Rating, Valve, ValveType } from '../../model/types'
import { cached } from '../../three/pipeGeometry'
import { Kit, mat4, type Built, type MatKey, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { valvePos } from '../fx/simRead'

type Actuator = NonNullable<Valve['actuator']>

const BODY: MatKey = 'valveBody'
const RF: MatKey = 'pipeCut'
const BORE: MatKey = 'pipeBore'
const BOLT: MatKey = 'nut'
const SS: MatKey = 'stainless'
const HW: MatKey = 'handwheel'

const rfHeight = (rating: Rating) => 0.0016 * (rating >= 600 ? 4 : 1) + 0.002

/** Next-size-up outlet for PSVs (API 526 style). */
export function psvDefaultOutlet(nps: number) {
  const map: Record<number, number> = { 0.5: 1, 0.75: 1, 1: 2, 1.5: 2, 2: 3, 3: 4, 4: 6, 6: 8, 8: 10, 10: 12, 12: 16 }
  return map[nps] ?? Math.round(nps * 1.5)
}

/** API 526-like PSV dimensions. A = centre-to-inlet face (outlet axis height), B = centre-to-outlet face. */
export function psvDims(nps: number, outletNps?: number) {
  const out = outletNps ?? psvDefaultOutlet(nps)
  const fo = flange(out, 150)
  const fi = flange(nps, 300)
  const A = Math.max(0.08 + 0.025 * nps, fi.thickness + rfHeight(300) + pipeOD(out) * 0.6 + 0.02)
  const B = Math.max(A * 1.05, fo.od / 2 + 0.035, pipeOD(nps) * 0.9 + fo.thickness + 0.03)
  const D = pipeOD(nps)
  const bodyR = Math.max(D * 0.85, pipeOD(out) * 0.62)
  const springH = 0.28 + 2.2 * D
  const height = A + bodyR + springH + 0.16
  return {
    outletNps: out,
    A,
    B,
    inletFace: [0, 0, 0] as V3,
    outletFace: [B, A, 0] as V3,
    outletDir: [1, 0, 0] as V3,
    height,
    bodyR,
    springH,
  }
}

/**
 * Lead contract: PSV outlet flange FACE centre in the PSV local frame (origin = inlet flange face,
 * inlet axis +Y, outlet face normal +X). ValveModel type 'psv' uses exactly these numbers — call
 * both with the SAME (inletNps, outletNps) arguments (outletNps omitted = default next size up).
 * Independent of rating.
 */
export function psvGeometry(inletNps: number, outletNps?: number): { outletNps: number; outletX: number; outletY: number } {
  const d = psvDims(inletNps, outletNps)
  return { outletNps: d.outletNps, outletX: d.B, outletY: d.A }
}

export function defaultActuator(type: ValveType, nps: number): Actuator {
  switch (type) {
    case 'gate':
      return nps >= 14 ? 'gear' : 'handwheel'
    case 'globe':
      return nps >= 10 ? 'gear' : 'handwheel'
    case 'ball':
    case 'butterfly':
      return nps >= 6 ? 'gear' : 'lever'
    case 'control':
      return 'diaphragm'
    case 'esdv':
    case 'bdv':
      return 'pistonSpring'
    case 'needle':
      return 'handwheel'
    default:
      return 'none'
  }
}

interface MovingPart {
  built: Built
  /** 'rise': translate +Y by `amount` when open. 'rotY': rotate about Y by `amount` when CLOSED. */
  mode: 'rise' | 'rotY' | 'rotYOpen'
  amount: number
  pivot: V3
}
export interface ValveGeo {
  fixed: Built
  moving?: MovingPart
  /** valve-local point just above the operator (stem axis) — where a position flag can sit */
  flagAt: V3
  /** size of the operator (m), to scale a position flag */
  opSize: number
}

interface Ctx {
  k: Kit
  mv: Kit
  nps: number
  rating: Rating
  L: number
  D: number
  ri: number
  f: ReturnType<typeof flange>
  rfH: number
  act: Actuator
  type: ValveType
  moving?: Omit<MovingPart, 'built'>
  /** colour for powered actuators */
  actMat: MatKey
}

/** End flange (disc + raised face + short bore) with its raised face at `face` along `axis`. */
function endFlange(k: Kit, nps: number, rating: Rating, axis: 'x' | '-x' | 'y' | '-y', face: V3, neckR: number) {
  const f = flange(nps, rating)
  const rfH = rfHeight(rating)
  const ri = pipeOD(nps) / 2 - pipeWall(nps, '80')
  const yb = -rfH - f.thickness
  const yf = -rfH
  const depth = f.thickness + rfH + Math.max(0.01, pipeOD(nps) * 0.25)
  k.at(face, axis, () => {
    k.lathe(BODY, [
      [neckR, yb - 0.003],
      [neckR + 0.003, yb],
      [f.od / 2, yb],
      [f.od / 2, yf],
      [f.raisedFaceDia / 2, yf],
    ], [0, 0, 0], 'y', nps >= 6 ? 40 : 28)
    k.lathe(RF, [
      [f.raisedFaceDia / 2, yf],
      [f.raisedFaceDia / 2, 0],
      [ri, 0],
    ], [0, 0, 0], 'y', nps >= 6 ? 40 : 28)
    k.lathe(BORE, [
      [ri, 0],
      [ri, -depth],
    ], [0, 0, 0], 'y', 20)
    k.disc(BORE, ri, [0, -depth, 0], 'y', 20)
  })
}

/** Body neck along X joining the two end flanges. */
function neckX(c: Ctx, r: number) {
  const x = c.L / 2 - c.rfH - c.f.thickness
  c.k.cyl(BODY, r, 2 * x + 0.004, [0, 0, 0], 'x', 28)
}

function ellipseBolts(k: Kit, n: number, rx: number, rz: number, y: number, dia: number, len: number) {
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2
    const x = Math.cos(a) * rx
    const z = Math.sin(a) * rz
    k.cyl(BOLT, dia / 2, len, [x, y + len / 2, z], 'y', 6)
    k.hex(BOLT, dia * 1.85, dia * 0.9, [x, y + len - dia * 0.45, z], 'y')
    k.hex(BOLT, dia * 1.85, dia * 0.9, [x, y + dia * 0.45 - 0.0, z], 'y')
  }
}

/** Bolted joint: two plates of thickness t each, joint plane at y. Round (rz = rx) or oval. */
function bonnetJoint(c: Ctx, y: number, rx: number, rz: number, n: number) {
  const t = Math.max(0.01, c.D * 0.11)
  const bd = Math.max(0.01, Math.min(0.032, c.f.boltDia * 0.9))
  c.k.add(BODY, new THREE.CylinderGeometry(1, 1, 2 * t, 36), mat4([0, y, 0], 'y', [rx, 1, rz]))
  ellipseBolts(c.k, n, rx - bd * 1.6, rz - bd * 1.6, y - t - bd * 0.9, bd, 2 * t + bd * 2.2)
  return t
}


function nameplate(c: Ctx, pos: V3, w: number, h: number, axis: 'x' | 'z' = 'z') {
  c.k.box(SS, axis === 'z' ? [w, h, 0.002] : [0.002, h, w], pos)
}

// ---------------------------------------------------------------- linear operators (gate / globe / control)

/** Yoke + chosen operator starting at yoke base yB (top of bonnet). */
function linearOperator(c: Ctx, yB: number, stemR: number) {
  const { k, D } = c
  const act = c.act
  const yokeH = act === 'diaphragm' ? Math.max(0.12, 0.1 + D * 0.9) : Math.max(0.1, 0.06 + D * 1.6)
  const legX = stemR * 2.4 + Math.max(0.02, D * 0.22)
  const legW = Math.max(0.014, D * 0.16)
  const legT = Math.max(0.01, D * 0.09)
  const yT = yB + yokeH
  // packing gland + 2 gland studs
  k.cyl(BODY, stemR * 2.6, Math.max(0.012, D * 0.1), [0, yB + Math.max(0.006, D * 0.05), 0], 'y', 20)
  k.box(BODY, [stemR * 7, Math.max(0.008, D * 0.05), stemR * 3], [0, yB + Math.max(0.016, D * 0.13), 0])
  for (const s of [-1, 1]) k.rod(BOLT, [s * stemR * 2.8, yB, 0], [s * stemR * 2.8, yB + Math.max(0.03, D * 0.25), 0], Math.max(0.003, stemR * 0.35), 6)
  // yoke legs (in the XY plane so the stem/window is visible from the side)
  for (const s of [-1, 1]) {
    k.box(BODY, [legW, yokeH, legT], [s * legX, yB + yokeH / 2, 0])
    k.box(BODY, [legX - stemR * 1.5, legT * 1.2, legT * 1.4], [s * (legX / 2 + stemR * 0.75), yB + legT * 0.6, 0])
  }
  k.box(BODY, [legX * 2 + legW, legT * 1.6, legT * 2.2], [0, yT - legT * 0.8, 0])
  k.cyl(BODY, stemR * 2.5, legT * 3, [0, yT, 0], 'y', 20)

  if (act === 'diaphragm' || act === 'pistonSpring') {
    // travel scale on the yoke leg (closed at 25 %, open at 75 % of the yoke)
    k.box(SS, [0.002, yokeH * 0.5, legW * 0.9], [legX + legW / 2 + 0.001, yB + yokeH * 0.5, 0])
    for (let i = 0; i <= 4; i++) k.box(BOLT, [0.003, 0.0015, legW * 0.5], [legX + legW / 2 + 0.003, yB + yokeH * (0.25 + i * 0.125), 0])
    k.cyl(SS, stemR, yokeH + 0.02, [0, yB + yokeH / 2, 0], 'y', 10)
    // stem connector + pointer ride the stem (drawn open; 'rise' drops them by the travel when closed)
    stemConnector(c, yB + yokeH * 0.75, stemR, legX, legW, yokeH * 0.5)
    if (act === 'diaphragm') diaphragmActuator(c, yT + legT * 1.5)
    else pistonLinear(c, yT + legT * 1.5)
    return
  }
  if (act === 'electric') {
    k.cyl(SS, stemR, yokeH, [0, yB + yokeH / 2, 0], 'y', 10)
    stemConnector(c, yB + yokeH * 0.75, stemR, legX, legW, yokeH * 0.5)
    electricActuator(c, yT + legT * 1.5)
    return
  }
  if (act === 'gear') {
    k.cyl(SS, stemR, yokeH, [0, yB + yokeH / 2, 0], 'y', 10)
    const gb = Math.max(0.12, D * 0.9)
    k.rbox(BODY, [gb, gb * 0.7, gb * 0.8], gb * 0.08, [0, yT + legT * 1.5 + gb * 0.35, 0])
    k.cyl(BODY, gb * 0.22, gb * 0.7, [0, yT + legT * 1.5 + gb * 0.3, gb * 0.6], 'z', 16)
    k.handwheel(HW, Math.max(0.3, gb * 2.2), [0, yT + legT * 1.5 + gb * 0.3, gb * 1.0], 'z', 5)
    // stem protector pipe
    k.cyl(SS, stemR * 1.6, D * 2.2, [0, yT + legT * 1.5 + gb * 0.7 + D * 1.1, 0], 'y', 14)
    k.disc(SS, stemR * 1.6, [0, yT + legT * 1.5 + gb * 0.7 + D * 2.2, 0], 'y', 14)
    return
  }
  // handwheel with rising stem (moving)
  const hwD = Math.min(0.75, Math.max(0.14, 0.1 + D * 1.25))
  const yHw = yT + legT * 1.5 + 0.01
  k.handwheel(HW, hwD, [0, yHw, 0], 'y', hwD > 0.35 ? 6 : 4)
  const rise = Math.max(0.03, D * 0.95)
  const stemTop = yHw + 0.03 + rise
  c.mv.cyl(SS, stemR, stemTop - yB, [0, (stemTop + yB) / 2, 0], 'y', 12)
  c.mv.cyl(SS, stemR * 1.15, 0.006, [0, stemTop, 0], 'y', 12)
  c.moving = { mode: 'rise', amount: rise, pivot: [0, 0, 0] }
}

/** Stem connector block + travel pointer at height y (open position); moves with the stem. */
function stemConnector(c: Ctx, y: number, stemR: number, legX: number, legW: number, travel: number) {
  c.mv.box(SS, [stemR * 4.5, Math.max(0.02, c.D * 0.18), stemR * 3], [0, y, 0])
  c.mv.box('actuatorYellow', [legX + legW, 0.004, 0.01], [legX / 2 + legW / 2, y, legW * 0.3])
  c.moving = { mode: 'rise', amount: travel, pivot: [0, 0, 0] }
}

/** Spring-diaphragm actuator (Fisher 667 style) + DVC-style positioner + air tubing. */
function diaphragmActuator(c: Ctx, y0: number) {
  const { k, D } = c
  const Da = Math.min(0.75, Math.max(0.28, 0.24 + D * 1.3))
  const R = Da / 2
  const hL = Da * 0.22 // lower casing height
  const hU = Da * 0.3
  const rim = Math.max(0.012, Da * 0.03)
  const A = c.actMat
  // actuator stem boss / spring barrel bottom
  k.cyl(A, Math.max(0.03, D * 0.3), Da * 0.08, [0, y0 + Da * 0.04, 0], 'y', 20)
  const yRim = y0 + Da * 0.08 + hL
  // lower casing (dished upward)
  k.lathe(A, [
    [Math.max(0.03, D * 0.3), y0 + Da * 0.08],
    [R * 0.55, y0 + Da * 0.08 + hL * 0.25],
    [R * 0.9, yRim - hL * 0.35],
    [R * 0.98, yRim - rim],
    [R + rim * 1.6, yRim - rim],
    [R + rim * 1.6, yRim],
  ], [0, 0, 0], 'y', 48)
  // upper casing
  k.lathe(A, [
    [R + rim * 1.6, yRim],
    [R + rim * 1.6, yRim + rim],
    [R * 0.98, yRim + rim],
    [R * 0.92, yRim + hU * 0.55],
    [R * 0.6, yRim + hU * 0.95],
    [R * 0.18, yRim + hU],
    [0.0, yRim + hU],
  ], [0, 0, 0], 'y', 48)
  // rim bolting
  const nb = Math.round(16 + Da * 20)
  k.boltCircle(BOLT, BOLT, nb, R + rim * 0.8, [0, yRim - rim - 0.008, 0], 'y', Math.max(0.006, rim * 0.6), 2 * rim + 0.016, [0.004, 2 * rim + 0.012])
  // lifting ring + top travel stop / vent
  k.torus(SS, Da * 0.05, Da * 0.008, [0, yRim + hU + Da * 0.055, 0], 'z', 6, 20)
  k.cyl(SS, Da * 0.03, Da * 0.03, [0, yRim + hU + 0.012, 0], 'y', 12)
  k.cyl(BOLT, Da * 0.012, Da * 0.04, [R * 0.55, yRim + hU * 0.8, 0], 'y', 8)
  // positioner (DVC6200-like) on the yoke, +Z side
  const py = y0 - Math.max(0.09, 0.05 + D * 0.5)
  const pw = 0.17
  const ph = 0.2
  const pd = 0.11
  const pz = Math.max(0.09, D * 0.45) + pd / 2
  k.box(BODY, [0.05, 0.05, pz - pd / 2 + 0.01], [0, py, (pz - pd / 2) / 2])
  k.rbox(HW, [pw, ph, pd], 0.018, [0, py, pz])
  k.rbox(A, [pw * 0.92, ph * 0.9, 0.02], 0.008, [0, py, pz + pd / 2 + 0.008])
  // gauges (supply / output)
  for (const s of [-1, 1]) {
    k.cyl(SS, 0.022, 0.018, [s * 0.04, py - ph / 2 - 0.02, pz + 0.02], 'z', 18)
    k.disc('glass', 0.019, [s * 0.04, py - ph / 2 - 0.02, pz + 0.03], 'z', 18)
    k.cyl(BRASS, 0.005, 0.02, [s * 0.04, py - ph / 2 - 0.002, pz + 0.02], 'y', 6)
  }
  // filter regulator below, cable gland
  k.cyl(SS, 0.028, 0.08, [-pw / 2 - 0.05, py - 0.03, pz], 'y', 14)
  k.cyl('glass', 0.022, 0.04, [-pw / 2 - 0.05, py - 0.09, pz], 'y', 14)
  k.cyl(BRASS, 0.008, 0.03, [pw / 2 + 0.012, py - 0.04, pz], 'x', 6)
  k.spline('cable', [[pw / 2 + 0.025, py - 0.04, pz], [pw / 2 + 0.1, py - 0.08, pz], [pw / 2 + 0.14, py - 0.4, pz - 0.05]], 0.006, 6, 24)
  // air tubing: supply into regulator, output up to the diaphragm casing
  const tr = 0.0045
  k.tube('tubing', [[-pw / 2 - 0.05, py - 0.12, pz], [-pw / 2 - 0.05, py - 0.25, pz], [-pw / 2 - 0.05, py - 0.25, pz - 0.15]], tr)
  k.tube('tubing', [[-pw / 2 - 0.05, py + 0.01, pz], [-pw / 2 - 0.05, py + 0.04, pz], [-pw / 2, py + 0.04, pz]], tr)
  k.tube('tubing', [[pw * 0.3, py + ph / 2, pz], [pw * 0.3, py + ph / 2 + 0.03, pz], [pw * 0.3, py + ph / 2 + 0.03, R * 0.55], [pw * 0.3, yRim - hL * 0.5, R * 0.75]], tr)
}

const BRASS: MatKey = 'brass'

function pistonLinear(c: Ctx, y0: number) {
  const { k, D } = c
  const r = Math.max(0.08, 0.06 + D * 0.5)
  const A = c.actMat
  k.cyl(A, r * 1.12, 0.03, [0, y0 + 0.015, 0], 'y', 32)
  k.cyl(A, r, r * 2.2, [0, y0 + 0.03 + r * 1.1, 0], 'y', 32)
  k.cyl(A, r * 1.12, 0.03, [0, y0 + 0.045 + r * 2.2, 0], 'y', 32)
  k.around(4, r * 1.02, [0, y0, 0], 'y', (p) => k.rod(BOLT, p, [p[0], p[1] + r * 2.3 + 0.06, p[2]], 0.006, 6), Math.PI / 4)
  k.rbox(HW, [0.12, 0.1, 0.08], 0.01, [0, y0 + r * 1.2, r + 0.06])
}

/** Rotork IQ-style electric actuator, base at y0 (works for linear and quarter-turn). */
function electricActuator(c: Ctx, y0: number) {
  const { k, D } = c
  const s = Math.min(1.6, Math.max(0.85, 0.8 + D * 1.2))
  const A = c.actMat
  k.cyl(BODY, 0.07 * s, 0.03 * s, [0, y0 + 0.015 * s, 0], 'y', 20) // thrust base / adapter
  // gearcase
  k.rbox(A, [0.24 * s, 0.22 * s, 0.24 * s], 0.05 * s, [0, y0 + 0.14 * s, 0], undefined, 3)
  // electrical housing with display window facing +Z
  k.cyl(A, 0.12 * s, 0.1 * s, [0, y0 + 0.19 * s, 0.14 * s], 'z', 32)
  k.cyl(A, 0.13 * s, 0.025 * s, [0, y0 + 0.19 * s, 0.2 * s], 'z', 32)
  k.disc('displayLcd', 0.06 * s, [0, y0 + 0.2 * s, 0.2135 * s], 'z', 28)
  k.torus(BODY, 0.062 * s, 0.006 * s, [0, y0 + 0.2 * s, 0.2135 * s], 'z', 6, 28)
  // local control knobs (red selector, black stop)
  k.cyl('actuatorRed', 0.018 * s, 0.03 * s, [-0.07 * s, y0 + 0.11 * s, 0.215 * s], 'z', 12)
  k.cyl(HW, 0.018 * s, 0.03 * s, [0.07 * s, y0 + 0.11 * s, 0.215 * s], 'z', 12)
  // motor housing along -X
  k.cyl(A, 0.085 * s, 0.22 * s, [-0.2 * s, y0 + 0.12 * s, 0], 'x', 28)
  k.cyl(A, 0.09 * s, 0.02 * s, [-0.31 * s, y0 + 0.12 * s, 0], 'x', 28)
  // terminal cover on top
  k.cyl(A, 0.09 * s, 0.07 * s, [0.02 * s, y0 + 0.28 * s, -0.02 * s], 'y', 28)
  // conduit entries
  for (const zz of [-0.05, 0.05]) k.cyl(BRASS, 0.012 * s, 0.04 * s, [0.13 * s, y0 + 0.28 * s, zz * s], 'x', 8)
  // handwheel on the back (-Z)
  k.cyl(A, 0.03 * s, 0.08 * s, [0, y0 + 0.14 * s, -0.16 * s], 'z', 14)
  k.handwheel(HW, 0.3 * s, [0, y0 + 0.14 * s, -0.2 * s], '-z', 3)
}

// ---------------------------------------------------------------- quarter-turn operators (ball / butterfly / esdv / bdv)

function quarterOperator(c: Ctx, y0: number, stemR: number) {
  const { k, D } = c
  // ISO 5211 mounting pad + bracket
  const pad = Math.max(0.07, D * 0.55)
  k.box(BODY, [pad, Math.max(0.012, D * 0.06), pad], [0, y0 + Math.max(0.006, D * 0.03), 0])
  const y1 = y0 + Math.max(0.012, D * 0.06)
  const act = c.act
  if (act === 'lever' || act === 'handwheel' && c.nps < 4) {
    k.cyl(SS, stemR, 0.04, [0, y1 + 0.02, 0], 'y', 10)
    // stop plate
    k.box(BODY, [pad * 0.9, 0.004, pad * 0.9], [0, y1 + 0.006, 0])
    const Lh = Math.max(0.15, Math.min(0.6, D * 3.2))
    const yl = y1 + 0.035
    // butterfly: the disc is the moving part, so its lever is drawn fixed (open position)
    const lk = c.type === 'butterfly' ? c.k : c.mv
    lk.box(HW, [stemR * 4, 0.012, stemR * 4], [0, yl, 0])
    lk.box(HW, [Lh, 0.006, 0.026], [Lh / 2, yl + 0.006, 0])
    lk.box(HW, [0.026, 0.03, 0.026], [stemR * 1.6, yl - 0.012, 0])
    lk.cyl('actuatorRed', 0.015, Lh * 0.38, [Lh * 0.78, yl + 0.012, 0], 'x', 12)
    lk.hex(BOLT, stemR * 2.2, 0.012, [0, yl + 0.012, 0])
    if (c.type !== 'butterfly') c.moving = { mode: 'rotY', amount: Math.PI / 2, pivot: [0, 0, 0] }
    return
  }
  if (act === 'electric') {
    electricActuator(c, y1)
    return
  }
  if (act === 'pistonSpring' || act === 'diaphragm') {
    scotchYoke(c, y1)
    return
  }
  // worm gear operator
  const g = Math.max(0.14, 0.08 + D * 0.7)
  k.cyl(BODY, pad * 0.35, g * 0.4, [0, y1 + g * 0.2, 0], 'y', 20) // adaptor spool
  const yg = y1 + g * 0.4
  k.rbox(BODY, [g * 1.15, g * 0.55, g * 1.1], g * 0.1, [0, yg + g * 0.275, -g * 0.05])
  k.cyl(BODY, g * 0.2, g * 1.0, [g * 0.32, yg + g * 0.28, g * 0.35], 'z', 18) // worm housing
  k.cyl(SS, Math.max(0.008, g * 0.05), g * 0.4, [g * 0.32, yg + g * 0.28, g * 1.0], 'z', 8)
  k.handwheel(HW, Math.max(0.22, g * 1.6), [g * 0.32, yg + g * 0.28, g * 1.15], 'z', 5)
  // position indicator dome with arrow
  k.dome('glass', g * 0.25, [0, yg + g * 0.55, -g * 0.05], 'y', Math.PI / 2, 0.5)
  // indicator arrow turns with the ball (a butterfly's disc is its moving part, so its arrow stays put)
  if (c.type !== 'butterfly') {
    c.mv.box('actuatorYellow', [g * 0.35, 0.006, 0.03], [0, yg + g * 0.57, -g * 0.05])
    c.moving = { mode: 'rotY', amount: Math.PI / 2, pivot: [0, 0, 0] }
  } else k.box('actuatorYellow', [g * 0.35, 0.006, 0.03], [0, yg + g * 0.57, -g * 0.05])
  k.around(6, g * 0.48, [0, yg + g * 0.55, -g * 0.05], 'y', (p) => k.hex(BOLT, 0.016, 0.008, p))
}

/** Spring-return scotch-yoke actuator (ESDV / BDV) — axis parallel to the pipe. */
function scotchYoke(c: Ctx, y0: number) {
  const { k, D } = c
  const A = c.actMat
  const s = Math.max(0.16, 0.12 + D * 0.85) // housing size
  const yA = y0 + s * 0.55 // actuator axis height
  // adaptor spool + coupling
  k.cyl(BODY, s * 0.18, yA - y0 - s * 0.35, [0, (y0 + yA - s * 0.35) / 2, 0], 'y', 18)
  // yoke housing
  k.rbox(A, [s * 1.0, s * 0.75, s * 0.75], s * 0.08, [0, yA, 0])
  k.cyl(A, s * 0.42, s * 0.1, [0, yA + s * 0.38, 0], 'y', 28)
  // pneumatic cylinder (-X) with tie rods
  const cr = s * 0.34
  const cl = s * 1.3
  k.cyl(A, cr, cl, [-s * 0.5 - cl / 2, yA, 0], 'x', 32)
  for (const x of [-s * 0.52, -s * 0.5 - cl]) k.box(A, [s * 0.08, cr * 2.3, cr * 2.3], [x - s * 0.04, yA, 0])
  k.around(4, cr * 1.12, [-s * 0.5, yA, 0], 'x', (p) => k.rod(BOLT, p, [p[0] - cl - s * 0.08, p[1], p[2]], Math.max(0.005, s * 0.022), 6), Math.PI / 4)
  // spring can (+X), larger, with end cap and lifting lug
  const sr = s * 0.45
  const sl = s * 1.9
  k.cyl(A, sr * 0.9, s * 0.1, [s * 0.55, yA, 0], 'x', 32)
  k.cyl(A, sr, sl, [s * 0.6 + sl / 2, yA, 0], 'x', 36)
  k.lathe(A, [
    [sr, 0],
    [sr * 1.04, 0],
    [sr * 1.04, s * 0.06],
    [sr * 0.6, s * 0.12],
    [0, s * 0.12],
  ], [s * 0.6 + sl, yA, 0], 'x', 36)
  k.box(A, [s * 0.1, s * 0.12, s * 0.025], [s * 0.6 + sl * 0.5, yA + sr + s * 0.05, 0])
  // stroke-adjust stops
  k.cyl(BOLT, s * 0.04, s * 0.18, [s * 0.6 + sl + s * 0.2, yA, 0], 'x', 6)
  k.cyl(BOLT, s * 0.04, s * 0.18, [-s * 0.6 - cl - s * 0.12, yA, 0], 'x', 6)
  // limit switch box (Topworx-style) + beacon on top
  const ly = yA + s * 0.43
  k.box(BODY, [s * 0.18, s * 0.08, s * 0.18], [0, ly + s * 0.04, 0])
  k.rbox(SS, [s * 0.5, s * 0.3, s * 0.36], s * 0.04, [0, ly + s * 0.08 + s * 0.15, 0])
  k.dome('actuatorYellow', s * 0.13, [0, ly + s * 0.38, 0], 'y', Math.PI / 2, 0.8)
  // position indicator bar on the limit-switch box: along the pipe = open, across = closed
  if (c.type !== 'butterfly') {
    c.mv.box(HW, [s * 0.34, s * 0.045, s * 0.06], [0, ly + s * 0.42, 0])
    c.moving = { mode: 'rotY', amount: Math.PI / 2, pivot: [0, 0, 0] }
  } else k.box(HW, [s * 0.26, s * 0.035, s * 0.05], [0, ly + s * 0.42, 0])
  k.cyl(BRASS, s * 0.035, s * 0.08, [s * 0.29, ly + s * 0.2, 0], 'x', 8)
  k.spline('cable', [[s * 0.33, ly + s * 0.2, 0], [s * 0.45, ly + s * 0.12, 0], [s * 0.52, yA, s * 0.25], [s * 0.5, y0 - 0.02, s * 0.55]], 0.007, 6, 30)
  // solenoid valve + quick exhaust on the cylinder end, tubing
  const sx = -s * 0.5 - cl * 0.55
  const sz = cr + s * 0.12
  k.box(SS, [s * 0.16, s * 0.12, s * 0.1], [sx, yA - cr * 0.4, sz])
  k.cyl(HW, s * 0.06, s * 0.14, [sx, yA - cr * 0.4 + s * 0.13, sz], 'y', 18)
  k.cyl(BRASS, s * 0.025, s * 0.06, [sx, yA - cr * 0.4 + s * 0.23, sz], 'y', 8)
  k.box(SS, [s * 0.1, s * 0.1, s * 0.08], [-s * 0.5 - cl * 0.15, yA - cr * 0.2, sz])
  const tr = Math.max(0.004, s * 0.018)
  k.tube('tubing', [[sx + s * 0.08, yA - cr * 0.4, sz], [-s * 0.5 - cl * 0.15 - s * 0.05, yA - cr * 0.2, sz]], tr)
  k.tube('tubing', [[-s * 0.5 - cl * 0.15, yA - cr * 0.2 + s * 0.05, sz], [-s * 0.5 - cl * 0.15, yA + cr * 0.6, sz], [-s * 0.5 - cl * 0.15, yA + cr * 0.6, cr * 0.7]], tr)
  k.tube('tubing', [[sx, yA - cr * 0.4 - s * 0.06, sz], [sx, y0 - 0.05, sz], [sx - 0.2, y0 - 0.05, sz]], tr)
  // air supply filter-regulator
  k.cyl(SS, s * 0.06, s * 0.16, [sx - 0.2, y0 - 0.05, sz], 'y', 14)
  // nameplate on spring can
  nameplate(c, [s * 0.6 + sl * 0.5, yA, sr + 0.002], s * 0.4, s * 0.16, 'z')
}

// ---------------------------------------------------------------- body builders

function gateBody(c: Ctx) {
  const { k, D, L, f } = c
  const nf = flange(c.nps, c.rating)
  neckX(c, D / 2 * 1.12)
  for (const s of [-1, 1]) endFlange(k, c.nps, c.rating, s > 0 ? 'x' : '-x', [s * L / 2, 0, 0], D / 2 * 1.12)
  const rx = Math.min(D * 0.55 + 0.012, L / 2 - c.rfH - f.thickness)
  const rz = D * 0.66 + 0.014
  const yTop = D * 0.85 + 0.02
  const yBot = -D * 0.5
  k.add(BODY, new THREE.CylinderGeometry(1, 1, yTop - yBot, 36), mat4([0, (yTop + yBot) / 2, 0], 'y', [rx, 1, rz]))
  k.sphere(BODY, 1, [0, yBot, 0], [rx, D * 0.25, rz], 28)
  // body ribs
  for (const s of [-1, 1]) k.box(BODY, [rx * 0.4, yTop - yBot, 0.006 + D * 0.03], [s * rx * 0.75, (yTop + yBot) / 2, 0])
  const t = bonnetJoint(c, yTop, rx + nf.boltDia * 2.4, rz + nf.boltDia * 2.4, c.nps >= 8 ? 16 : c.nps >= 4 ? 12 : 8)
  const yb0 = yTop + t
  const stemR = Math.max(0.007, D * 0.085)
  const hB = Math.max(0.06, D * 1.2 + 0.03)
  k.add(BODY, new THREE.CylinderGeometry(1, 1, hB, 32), mat4([0, yb0 + hB / 2, 0], 'y', [Math.max(stemR * 2.2, rx * 0.7), 1, Math.max(stemR * 2.2, rz * 0.62)]))
  k.cyl(BODY, Math.max(stemR * 2.2, rz * 0.62), 0.004, [0, yb0 + hB, 0], 'y', 28, stemR * 2.4)
  nameplate(c, [0, yTop * 0.5, rz + 0.003], Math.max(0.03, rx * 0.9), Math.max(0.02, D * 0.25))
  // drain boss
  k.cyl(BODY, Math.max(0.008, D * 0.08), 0.02, [0, yBot - D * 0.22, 0], 'y', 12)
  linearOperator(c, yb0 + hB, stemR)
}

function globeBody(c: Ctx, control = false) {
  const { k, D, L } = c
  const nf = flange(c.nps, c.rating)
  neckX(c, D / 2 * 1.1)
  for (const s of [-1, 1]) endFlange(k, c.nps, c.rating, s > 0 ? 'x' : '-x', [s * L / 2, 0, 0], D / 2 * 1.1)
  const Rg = D * (control ? 0.95 : 0.85) + 0.016
  const sx = Math.min(1.3, (L / 2 - c.rfH - nf.thickness) / Rg)
  k.sphere(BODY, Rg, [0, 0, 0], [sx, 1, 1.05], 36)
  // seat ring bulge (S-shaped globe partition boss)
  k.cyl(BODY, Rg * 0.75, Rg * 0.4, [0, -Rg * 0.8, 0], 'y', 28)
  k.sphere(BODY, Rg * 0.75, [0, -Rg * 1.0, 0], [1, 0.35, 1], 24)
  const yTop = Rg * 0.92
  k.cyl(BODY, Rg * 0.65, yTop, [0, yTop / 2, 0], 'y', 28)
  const t = bonnetJoint(c, yTop, Rg * 0.72 + nf.boltDia * 2.2, Rg * 0.72 + nf.boltDia * 2.2, c.nps >= 6 ? 12 : 8)
  const stemR = Math.max(0.007, D * 0.08)
  const hB = control ? Math.max(0.08, D * 1.0 + 0.04) : Math.max(0.05, D * 0.75)
  const yb0 = yTop + t
  k.cyl(BODY, Math.max(stemR * 2.5, Rg * 0.45), hB, [0, yb0 + hB / 2, 0], 'y', 28, Math.max(stemR * 2.3, Rg * 0.3))
  if (control) {
    // bonnet cooling / packing flange
    k.cyl(BODY, Math.max(stemR * 3.2, Rg * 0.42), 0.012, [0, yb0 + hB - 0.006, 0], 'y', 24)
    k.boltCircle(BOLT, BOLT, 4, Math.max(stemR * 2.6, Rg * 0.34), [0, yb0 + hB - 0.012, 0], 'y', 0.007, 0.03, [0.024])
  }
  nameplate(c, [0, 0, Rg * 1.05 + 0.002], Math.max(0.03, Rg * 0.8), Math.max(0.02, Rg * 0.35))
  // flow arrow on body
  k.box(SS, [Rg * 0.9, 0.006, 0.003], [0, -Rg * 0.45, Rg * 0.98])
  linearOperator(c, yb0 + hB, stemR)
}

function ballBody(c: Ctx) {
  const { k, D, L } = c
  const nf = flange(c.nps, c.rating)
  const xf = L / 2 - c.rfH - nf.thickness
  const Rb = D * 0.9 + 0.02
  const neck = D / 2 * 1.15
  neckX(c, neck)
  for (const s of [-1, 1]) endFlange(k, c.nps, c.rating, s > 0 ? 'x' : '-x', [s * L / 2, 0, 0], neck)
  // body barrel + two side adapters with bolted joints (side-entry trunnion)
  const lb = Math.min(xf * 2 * 0.62, Rb * 2.2)
  k.cyl(BODY, Rb, lb, [0, 0, 0], 'x', 40)
  const adR = Rb * 0.86
  for (const s of [-1, 1]) {
    k.cyl(BODY, adR, xf - lb / 2, [s * (lb / 2 + (xf - lb / 2) / 2), 0, 0], 'x', 36, s > 0 ? neck * 1.05 : adR)
    // joint flange ring
    const jr = Rb + Math.max(0.012, D * 0.1)
    const jt = Math.max(0.012, D * 0.08)
    k.cyl(BODY, jr, jt, [s * (lb / 2 - jt / 2), 0, 0], 'x', 40)
    const bd = Math.max(0.008, Math.min(0.03, nf.boltDia * 0.8))
    k.boltCircle(BOLT, BOLT, c.nps >= 8 ? 16 : c.nps >= 4 ? 12 : 8, jr - bd * 1.4, [s * (lb / 2 - jt) - (s > 0 ? 0 : 0), 0, 0], s > 0 ? 'x' : '-x', bd, jt + bd * 2.2, [-bd * 0.45, jt + bd * 1.2], 0)
  }
  // top stem housing
  const ys = Rb + Math.max(0.02, D * 0.25)
  k.cyl(BODY, Math.max(0.025, D * 0.3), ys, [0, ys / 2, 0], 'y', 24)
  // trunnion boss bottom + cover bolts, drain plug, lifting lugs
  const yt = -Rb - Math.max(0.015, D * 0.18)
  k.cyl(BODY, Math.max(0.025, D * 0.3), -yt, [0, yt / 2, 0], 'y', 24)
  k.cyl(BODY, Math.max(0.03, D * 0.36), Math.max(0.01, D * 0.06), [0, yt, 0], 'y', 24)
  k.boltCircle(BOLT, BOLT, 6, Math.max(0.024, D * 0.29), [0, yt - 0.012, 0], 'y', Math.max(0.006, D * 0.035), Math.max(0.012, D * 0.06) + 0.012, [0.004])
  if (c.nps >= 4) {
    for (const s of [-1, 1]) k.box(BODY, [0.02, Rb * 0.5, Rb * 0.3], [s * lb * 0.3, Rb * 0.9, 0])
    // sealant injection fittings
    for (const s of [-1, 1]) k.cyl(BRASS, 0.008, 0.03, [s * Rb * 0.3, Rb * 0.95, Rb * 0.25], 'y', 6)
  }
  nameplate(c, [0, 0, Rb + 0.002], Math.max(0.03, Rb * 0.6), Math.max(0.02, Rb * 0.3))
  quarterOperator(c, ys, Math.max(0.008, D * 0.08))
}

function butterflyBody(c: Ctx) {
  const { k, D, L, f, ri } = c
  const Rw = Math.max(D / 2 + 0.01, f.boltCircle / 2 - f.boltDia * 0.95)
  k.lathe(BODY, [
    [Rw, -L / 2 + 0.002],
    [Rw, L / 2 - 0.002],
  ], [0, 0, 0], 'x', 40)
  for (const s of [-1, 1])
    k.lathe(RF, [
      [Rw, 0],
      [Rw, 0.002],
      [ri, 0.002],
    ], [s * (L / 2 - 0.002), 0, 0], s > 0 ? 'x' : '-x', 40)
  k.lathe(BORE, [
    [ri, L / 2],
    [ri, -L / 2],
  ], [0, 0, 0], 'x', 32)
  // centring lugs for the flange studs
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const r = Rw + f.boltDia * 0.5
    k.box(BODY, [L * 0.8, f.boltDia * 1.5, f.boltDia * 1.6], [0, Math.sin(a) * r, Math.cos(a) * r], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -a))
  }
  // neck to top pad, bottom boss
  const ytop = f.od / 2 + Math.max(0.03, D * 0.3)
  k.cyl(BODY, Math.max(0.02, D * 0.14), ytop - Rw + 0.005, [0, (ytop + Rw) / 2, 0], 'y', 20)
  k.cyl(BODY, Math.max(0.018, D * 0.12), Math.max(0.03, D * 0.15), [0, -Rw - Math.max(0.015, D * 0.075), 0], 'y', 20)
  // disc (moving: rotates about Y)
  const dt = Math.max(0.006, D * 0.06)
  c.mv.add(SS, new THREE.CylinderGeometry(ri * 0.985, ri * 0.985, dt, 32), mat4([0, 0, 0], 'x'))
  c.mv.cyl(SS, Math.max(0.006, D * 0.05), ri * 2, [0, 0, 0], 'y', 10)
  c.moving = { mode: 'rotYOpen', amount: Math.PI / 2, pivot: [0, 0, 0] }
  quarterOperator(c, ytop, Math.max(0.008, D * 0.06))
}

function checkBody(c: Ctx) {
  const { k, D, L } = c
  const nf = flange(c.nps, c.rating)
  neckX(c, D / 2 * 1.1)
  for (const s of [-1, 1]) endFlange(k, c.nps, c.rating, s > 0 ? 'x' : '-x', [s * L / 2, 0, 0], D / 2 * 1.1)
  const R = D * 0.75 + 0.015
  const xf = L / 2 - c.rfH - nf.thickness
  const sx = Math.min(1.5, xf / R)
  k.sphere(BODY, R, [0, R * 0.15, 0], [sx, 1.05, 1.0], 32)
  const yTop = R * 1.05
  k.cyl(BODY, R * 0.8, yTop, [0, yTop / 2, 0], 'y', 32)
  // bolted cover
  const t = bonnetJoint(c, yTop, R * 0.85 + nf.boltDia * 2.2, R * 0.85 + nf.boltDia * 2.2, c.nps >= 6 ? 12 : 8)
  k.dome(BODY, R * 0.6, [0, yTop + t, 0], 'y', Math.PI / 2, 0.35)
  k.torus(SS, R * 0.12, R * 0.02, [0, yTop + t + R * 0.25, 0], 'z', 6, 16)
  // hinge pin boss on +Z side near the inlet
  const hz = R * 0.98
  k.cyl(BODY, Math.max(0.012, D * 0.12), Math.max(0.03, D * 0.25), [-R * 0.35, R * 0.55, hz], 'z', 20)
  k.hex(BOLT, Math.max(0.018, D * 0.16), Math.max(0.01, D * 0.06), [-R * 0.35, R * 0.55, hz + Math.max(0.015, D * 0.13)], 'z')
  k.hex(BOLT, Math.max(0.018, D * 0.16), Math.max(0.01, D * 0.06), [-R * 0.35, R * 0.55, -hz * 0.9], '-z')
  // flow arrow (raised) on +Z flank
  const shape = new THREE.Shape()
  const a = R * 0.9
  shape.moveTo(-a * 0.6, -0.008)
  shape.lineTo(a * 0.25, -0.008)
  shape.lineTo(a * 0.25, -0.022)
  shape.lineTo(a * 0.6, 0)
  shape.lineTo(a * 0.25, 0.022)
  shape.lineTo(a * 0.25, 0.008)
  shape.lineTo(-a * 0.6, 0.008)
  shape.closePath()
  k.extrude(SS, shape, 0.003, mat4([0, -R * 0.2, R * 0.97], undefined, [1, Math.max(0.5, D * 6), 1]))
  k.cyl(BODY, Math.max(0.008, D * 0.07), 0.015, [0, -R * 0.95, 0], 'y', 10)
}

function needleBody(c: Ctx) {
  const { k, D, L } = c
  const nf = flange(c.nps, c.rating)
  const xf = L / 2 - c.rfH - nf.thickness
  k.cyl(SS, D / 2 * 1.1, 2 * xf, [0, 0, 0], 'x', 20)
  for (const s of [-1, 1]) {
    c.k.at([s * L / 2, 0, 0], s > 0 ? 'x' : '-x', () => {
      const f = nf
      const yb = -c.rfH - f.thickness
      k.lathe(SS, [
        [D / 2 * 1.1, yb],
        [f.od / 2, yb],
        [f.od / 2, -c.rfH],
        [f.raisedFaceDia / 2, -c.rfH],
      ], [0, 0, 0], 'y', 24)
      k.lathe(RF, [
        [f.raisedFaceDia / 2, -c.rfH],
        [f.raisedFaceDia / 2, 0],
        [c.ri, 0],
      ], [0, 0, 0], 'y', 24)
      k.disc(BORE, c.ri, [0, -0.004, 0], 'y', 16)
    })
  }
  // bar-stock body block
  const b = Math.max(0.04, D * 1.5)
  k.box(SS, [b, b * 1.1, b * 0.9], [0, 0, 0])
  // bonnet (hex), packing nut, stem, T-bar handle
  k.hex(SS, b * 0.75, b * 0.35, [0, b * 0.72, 0])
  k.cyl(SS, b * 0.25, b * 0.5, [0, b * 1.1, 0], 'y', 16)
  k.hex(BRASS, b * 0.45, b * 0.2, [0, b * 1.4, 0])
  k.cyl(SS, b * 0.09, b * 0.5, [0, b * 1.7, 0], 'y', 10)
  k.cyl(HW, b * 0.06, b * 1.6, [0, b * 1.95, 0], 'x', 10)
  for (const s of [-1, 1]) k.sphere(HW, b * 0.09, [s * b * 0.8, b * 1.95, 0], undefined, 10)
}

function psvBody(c: Ctx, outletNps: number) {
  const { k, D, nps, rating } = c
  const d = psvDims(nps, outletNps)
  const fi = flange(nps, rating)
  const Do = pipeOD(outletNps)
  // inlet flange: raised face at y = 0 facing -Y
  endFlange(k, nps, rating, '-y', [0, 0, 0], D / 2 * 1.15)
  const yIn = c.rfH + fi.thickness
  // inlet neck
  k.cyl(BODY, D / 2 * 1.15, d.A - yIn, [0, (d.A + yIn) / 2, 0], 'y', 28, D / 2 * 1.3)
  // body bulb
  k.sphere(BODY, d.bodyR, [0, d.A, 0], [1.05, 1.0, 1.0], 32)
  // outlet neck + flange (Class 150), raised face at x = B
  const fo = flange(outletNps, 150)
  const xo = d.B - rfHeight(150) - fo.thickness
  k.cyl(BODY, Do / 2 * 1.08, xo, [xo / 2, d.A, 0], 'x', 28)
  endFlange(k, outletNps, 150, 'x', [d.B, d.A, 0], Do / 2 * 1.08)
  // body drain + vent plugs
  k.hex(BOLT, Math.max(0.014, D * 0.25), 0.012, [-d.bodyR * 0.95, d.A - d.bodyR * 0.3, 0], '-x')
  // bonnet flange + studs
  const yBf = d.A + d.bodyR * 0.85
  const rB = Math.max(d.bodyR * 0.85, 0.04)
  k.cyl(BODY, rB * 0.8, d.bodyR * 0.35, [0, yBf - d.bodyR * 0.1, 0], 'y', 28)
  k.cyl(BODY, rB, Math.max(0.014, D * 0.18), [0, yBf + Math.max(0.007, D * 0.09), 0], 'y', 32)
  const bd = Math.max(0.008, Math.min(0.025, fi.boltDia * 0.8))
  k.boltCircle(BOLT, BOLT, 8, rB - bd * 1.5, [0, yBf - 0.004, 0], 'y', bd, Math.max(0.014, D * 0.18) + bd * 2, [Math.max(0.014, D * 0.18) + bd * 1.2])
  // spring bonnet (tapered, closed) — red
  const y1 = yBf + Math.max(0.014, D * 0.18)
  const H = d.springH
  const red: MatKey = 'actuatorRed'
  k.lathe(red, [
    [rB * 0.82, y1],
    [rB * 0.82, y1 + H * 0.06],
    [rB * 0.72, y1 + H * 0.1],
    [rB * 0.6, y1 + H * 0.88],
    [rB * 0.66, y1 + H * 0.9],
    [rB * 0.66, y1 + H * 0.96],
    [rB * 0.5, y1 + H],
    [0, y1 + H],
  ], [0, 0, 0], 'y', 32)
  // spring-bonnet stiffening ribs
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2])
    k.box(red, [rB * 0.16, H * 0.75, rB * 0.05], [Math.cos(a) * rB * 0.66, y1 + H * 0.45, Math.sin(a) * rB * 0.66], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
  // adjusting screw locknut, cap
  k.hex(BOLT, rB * 0.55, 0.018, [0, y1 + H + 0.009, 0])
  k.cyl(red, rB * 0.42, 0.07, [0, y1 + H + 0.053, 0], 'y', 24)
  k.dome(red, rB * 0.42, [0, y1 + H + 0.088, 0], 'y', Math.PI / 2, 0.35)
  // packed lifting lever
  const yl = y1 + H + 0.06
  k.cyl(BOLT, 0.008, rB * 1.1, [0, yl, 0], 'z', 8)
  k.box(red, [rB * 2.4, 0.012, 0.022], [rB * 1.1, yl - 0.02, rB * 0.55])
  k.box(red, [0.02, 0.05, 0.022], [-0.0, yl - 0.0, rB * 0.55])
  k.sphere(HW, 0.018, [rB * 2.3, yl - 0.03, rB * 0.55], undefined, 10)
  // seal wire + nameplate
  k.torus(SS, 0.012, 0.0012, [rB * 0.42, y1 + H + 0.05, 0], 'x', 4, 12)
  nameplate(c, [0, d.A + d.bodyR * 0.2, d.bodyR * 1.0 + 0.003], Math.max(0.04, d.bodyR * 0.7), Math.max(0.025, d.bodyR * 0.35))
}

// ---------------------------------------------------------------- builder

function buildValve(type: ValveType, nps: number, rating: Rating, act: Actuator, outletNps: number): ValveGeo {
  const k = new Kit()
  const mv = new Kit()
  // keep every valve at <= 8 draw groups: small accessories share the main metal materials
  const alias = { tubing: SS, glass: SS, brass: SS, cable: HW, gasket: BOLT } as const
  k.alias = alias
  mv.alias = alias
  const L = valveLength(type, nps)
  const D = pipeOD(nps)
  const c: Ctx = {
    k,
    mv,
    nps,
    rating,
    L,
    D,
    ri: D / 2 - pipeWall(nps, '80'),
    f: flange(nps, rating),
    rfH: rfHeight(rating),
    act,
    type,
    actMat: type === 'bdv' ? 'actuatorRed' : type === 'esdv' ? 'actuatorYellow' : act === 'electric' ? 'actuatorRed' : 'actuatorBlue',
  }
  switch (type) {
    case 'gate':
      gateBody(c)
      break
    case 'globe':
      globeBody(c)
      break
    case 'control':
      globeBody(c, true)
      break
    case 'ball':
    case 'esdv':
    case 'bdv':
      ballBody(c)
      break
    case 'butterfly':
      butterflyBody(c)
      break
    case 'check':
      checkBody(c)
      break
    case 'needle':
      needleBody(c)
      break
    case 'psv':
      psvBody(c, outletNps)
      break
  }
  const fixed = k.build()
  fixed.geometry.computeBoundingBox()
  const bb = fixed.geometry.boundingBox!
  const op = type === 'psv' ? 0 : Math.max(0.12, bb.max.y - Math.max(c.D, c.f.od / 2))
  const out: ValveGeo = { fixed, flagAt: [0, bb.max.y + 0.05, 0], opSize: op }
  if (!mv.isEmpty() && c.moving) out.moving = { built: mv.build(), ...c.moving }
  return out
}

export function valveGeometry(type: ValveType, nps: number, rating: Rating = 300, actuator?: Actuator, outletNps?: number): ValveGeo {
  const act = actuator ?? defaultActuator(type, nps)
  const out = type === 'psv' ? outletNps ?? psvDefaultOutlet(nps) : 0
  return cached(`valve|${type}|${nps}|${rating}|${act}|${out}`, () => buildValve(type, nps, rating, act, out))
}

/** pose the moving part for travel u (0 closed … 1 open) */
function poseMoving(g: THREE.Object3D, mv: MovingPart, u: number) {
  if (mv.mode === 'rise') g.position.set(0, -(1 - u) * mv.amount, 0)
  else if (mv.mode === 'rotY') g.rotation.set(0, -(1 - u) * mv.amount, 0)
  else g.rotation.set(0, u * mv.amount, 0)
}

export function ValveModel(props: {
  type: ValveType
  nps: number
  rating?: Rating
  actuator?: Valve['actuator']
  /** static position (no `tag`), or the normal position while the simulation doesn't operate it */
  open?: boolean
  outletNps?: number
  /** follow the simulation's travel of this valve (`valves[tag].pos`) */
  tag?: string
}) {
  const { type, nps, rating = 300, actuator, open = true, outletNps, tag } = props
  const geo = useMemo(() => valveGeometry(type, nps, rating, actuator, outletNps), [type, nps, rating, actuator, outletNps])
  const mv = geo.moving
  const mvRef = useRef<THREE.Group>(null)
  const u = useRef(open ? 1 : 0)
  useLayoutEffect(() => {
    if (!mv || !mvRef.current) return
    u.current = tag ? valvePos(tag, open ? 'open' : 'closed') : open ? 1 : 0
    poseMoving(mvRef.current, mv, u.current)
  }, [mv, open, tag])
  useFrame((_, dt) => {
    if (!tag || !mv || !mvRef.current) return
    const target = valvePos(tag, open ? 'open' : 'closed')
    if (u.current === target) return
    // the sim strokes the valve at 1 Hz ticks: ease between them
    u.current += (target - u.current) * Math.min(1, Math.min(dt, 0.1) * 6)
    if (Math.abs(target - u.current) < 1e-3) u.current = target
    poseMoving(mvRef.current, mv, u.current)
  })
  return (
    <group>
      <KitMesh data={geo.fixed} />
      {mv && (
        <group ref={mvRef}>
          <KitMesh data={mv.built} />
        </group>
      )}
    </group>
  )
}
