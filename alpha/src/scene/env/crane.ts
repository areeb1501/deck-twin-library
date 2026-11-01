/**
 * The parts of a pedestal crane that follow the simulation (scene/env/Cranes.tsx animates them from sim/cranes.ts): the
 * boom rest and the rope sets. The crane itself is the component library's pedestal-crane. Dimensions and the kinematics
 * live in model/cranes.ts (craneDims, boomPoint), so the simulation and the geometry agree.
 *
 * Each part is built in its OWN local frame (all metres, deck plate top y = 0):
 *   rest      boom rest (+ hook pad) for a boom parked along +x (static; rotate to the park heading)
 *   lead      hoist ropes gantry lead sheaves → boom foot, unit length along +y (stretched)
 *   tackle    luffing tackle + pendants, upper block → boom tip, unit length along +y (stretched)
 *   falls     4 main hoist falls hanging from the head sheaves, unit length along −y (stretched)
 * Everything goes into the caller's batches (one per part × material).
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, boxRotY, place, tube, unitPlaneY } from '../structure/batch'
import { railRun, type RailBatches } from '../structure/handrail'
import { ladder } from '../structure/ladder'
import { craneDims, type CraneSpec } from '../../model/cranes'

export interface CraneBatches {
  yellow: GeoBatch // pedestal, boom, gantry, cab, counterweight base colour
  white: GeoBatch // machinery house, A/C unit, dial
  steel: GeoBatch // ladders, roof sheet, platform brackets, doors
  steelDark: GeoBatch // bearing, sheaves, drums, bolts, louvres
  glass: GeoBatch
  soot: GeoBatch // black: hazard stripes, ropes, rubber pads
  blue: GeoBatch // hydraulic motors
  net: GeoBatch // grating (world UVs)
  light: GeoBatch // aviation obstruction lights (emissive)
  rail: RailBatches
}

export type CranePart = 'rest' | 'lead' | 'tackle' | 'falls'
export const CRANE_PARTS: CranePart[] = ['rest', 'lead', 'tackle', 'falls']

/** pedestal of the full-size (Alpha) crane: slew-bearing seat above the weather deck */
export const CRANE_PED = { bearing: 10.6 }

const ROPE = 0.022

export interface CraneBuildOpts {
  /** boom-rest station (plan distance from the slew axis to the rest), m */
  restF: number
  /** the parked hook sits on a hook pad (with padeye) on deck under the boom head */
  hookPad: boolean
}

export function buildCrane(get: (part: CranePart) => CraneBatches, spec: CraneSpec, opts: CraneBuildOpts) {
  const D = craneDims(spec)
  const k = D.k

  // slewing frame: f along the boom (+x), s to its left in plan (z = −s), y up
  const FW: V3 = [1, 0, 0]
  const SW: V3 = [0, 0, -1]
  const W = (f: number, y: number, s: number): V3 => [f, y, -s]
  const rbox = (b: GeoBatch, f0: number, y0: number, s0: number, f1: number, y1: number, s1: number) =>
    boxRotY(b, W((f0 + f1) / 2, (y0 + y1) / 2, (s0 + s1) / 2), [Math.abs(f1 - f0), Math.abs(y1 - y0), Math.abs(s1 - s0)], 0)
  const grating = (b: GeoBatch, f0: number, s0: number, f1: number, s1: number, y: number) =>
    place(b, unitPlaneY(), W((f0 + f1) / 2, y, (s0 + s1) / 2), [0, 0, 0], [f1 - f0, 1, s1 - s0], 'world')
  const rope = (b: GeoBatch, a: V3, e: V3, rad = ROPE) => tube(b, a, e, rad, 4, true)

  const A = -D.luffRest // parked droop (positive = tip down)
  const L = D.L

  // stations: foot taper, parallel body, tip taper (width w across, depth d in the luffing plane)
  const st = [
    { t: 0, w: Math.max(2.2 * k, 1.6), d: 0.35 },
    { t: 5.5 * Math.min(1, L / 32 + 0.2), w: D.bodyW, d: D.bodyD },
    { t: L - 5.5 * Math.min(1, L / 32 + 0.2), w: D.bodyW, d: D.bodyD },
    { t: L, w: 1.0, d: 0.9 },
  ]
  /** depth / width of the boom at station t (for the boom rest) */
  const sectionAt = (t: number) => {
    for (let i = 0; i < st.length - 1; i++)
      if (t <= st[i + 1].t) {
        const u = (t - st[i].t) / (st[i + 1].t - st[i].t)
        return { w: st[i].w + (st[i + 1].w - st[i].w) * u, d: st[i].d + (st[i + 1].d - st[i].d) * u }
      }
    return { w: st[st.length - 1].w, d: st[st.length - 1].d }
  }
  // ================================================================ stretched rope sets (unit length along ±y)
  {
    // hoist ropes: gantry lead sheaves (s = ∓0.95) → boom-foot guide sheaves (s = ∓0.25)
    const cb = get('lead')
    for (const s of [-1, 1]) rope(cb.soot, [0, 0, s * 0.95], [0, 1, s * 0.25])
  }
  {
    // luffing tackle: 6 falls upper block → spreader (first 30 %), two pendants spreader → boom tip
    const cb = get('tackle')
    for (let i = 0; i < 6; i++) {
      const s = -0.45 + 0.18 * i
      const o = i % 2 ? 1 : -1
      rope(cb.soot, [o * 0.42, 0, -s], [o * 0.42, 0.3, -s])
    }
    for (const sg of [-1, 1]) tube(cb.soot, [0, 0.3, sg * 0.62], [0, 1, sg * 0.5], 0.035, 6, true)
  }
  {
    // main hoist: 4 falls from the head sheaves (df = ±0.5 along the boom, s = ±0.22) down to the block
    const cb = get('falls')
    for (const s of [-0.22, 0.22]) for (const df of [-0.5, 0.5]) rope(cb.soot, [df, 0, -s], [df, -1, -s])
  }

  // ================================================================ boom rest (+ hook pad), boom parked along +x
  {
    const cb = get('rest')
    // the parked boom: pin at (foot, yFoot), drooping by A
    const Br = (t: number, n: number, s: number): V3 => W(D.foot + t * Math.cos(A) + n * Math.sin(A), D.yFoot - t * Math.sin(A) + n * Math.cos(A), s)
    const tr = (opts.restF - D.foot) / Math.cos(A)
    const sec = sectionAt(tr)
    const chord = Br(tr, -sec.d / 2, sec.w / 2)
    const fr = chord[0]
    const padTop = chord[1] - 0.1
    const beamTop = padTop - 0.12
    const yTop = beamTop - 0.4
    const half = Math.max(0.95, sec.w / 2 + 0.4)
    const lf = [fr - 0.75, fr + 0.75]
    const ls = [-half, half]
    for (const f of lf)
      for (const s of ls) {
        bar(cb.yellow, W(f, 0, s), W(f, yTop, s), 0.24, 0.24, FW)
        rbox(cb.steelDark, f - 0.3, 0, s - 0.3, f + 0.3, 0.04, s + 0.3)
      }
    rbox(cb.yellow, fr - 0.25, yTop, -half - 0.25, fr + 0.25, beamTop, half + 0.25) // saddle beam
    for (const s of ls) rbox(cb.yellow, lf[0] - 0.12, yTop - 0.3, s - 0.1, lf[1] + 0.12, yTop, s + 0.1)
    const pad = sec.w / 2
    for (const sg of [-1, 1]) {
      rbox(cb.soot, fr - 0.3, beamTop, sg * pad - 0.2, fr + 0.3, padTop, sg * pad + 0.2) // rubber pad
      bar(cb.yellow, W(fr, beamTop, sg * (pad + 0.27)), W(fr, beamTop + 0.65, sg * (pad + 0.47)), 0.4, 0.05, SW) // guide horns
      bar(cb.yellow, W(fr, beamTop, sg * (pad - 0.27)), W(fr, beamTop + 0.5, sg * (pad - 0.45)), 0.4, 0.05, SW)
    }
    // girts + X bracing, three tiers on every face
    const tiers = [0.3, yTop / 3, (2 * yTop) / 3, yTop - 0.3]
    for (let i = 0; i < 3; i++) {
      const y0 = tiers[i]
      const y1 = tiers[i + 1]
      const faces: [number, number, number, number][] = [
        [lf[0], ls[0], lf[1], ls[0]],
        [lf[0], ls[1], lf[1], ls[1]],
        [lf[0], ls[0], lf[0], ls[1]],
        [lf[1], ls[0], lf[1], ls[1]],
      ]
      for (const [f0, s0, f1, s1] of faces) {
        tube(cb.yellow, W(f0, y0, s0), W(f1, y1, s1), 0.05, 6, true)
        tube(cb.yellow, W(f1, y0, s1), W(f0, y1, s0), 0.05, 6, true)
        if (i > 0) bar(cb.yellow, W(f0, y0, s0), W(f1, y0, s1), 0.12, 0.12)
      }
    }
    // access platform on the far side + caged ladder (taller rests only)
    const yP = padTop - 2.0
    if (yP > 2.2) {
      const pf0 = lf[1] + 0.12
      const pf1 = lf[1] + 1.0
      grating(cb.net, pf0, -half, pf1, half, yP)
      for (const s of ls) {
        rbox(cb.yellow, lf[1], yP - 0.2, s - 0.06, pf1, yP - 0.02, s + 0.06)
        tube(cb.yellow, W(lf[1], yP - 1.0, s), W(pf1 - 0.1, yP - 0.12, s), 0.04, 6, true)
      }
      rbox(cb.yellow, pf1 - 0.06, yP - 0.2, -half, pf1, yP - 0.02, half)
      const ldS = Math.min(0.62, half - 0.4)
      railRun(cb.rail, W(pf1 - 0.02, yP, -half + 0.02), W(pf1 - 0.02, yP, ldS - 0.35))
      railRun(cb.rail, W(pf1 - 0.02, yP, ldS + 0.35), W(pf1 - 0.02, yP, half - 0.02))
      railRun(cb.rail, W(pf0, yP, -half + 0.02), W(pf1 - 0.02, yP, -half + 0.02), { endPost: false })
      railRun(cb.rail, W(pf0, yP, half - 0.02), W(pf1 - 0.02, yP, half - 0.02), { endPost: false })
      ladder(cb.steel, W(pf1 + 0.1, 0, ldS), yP, [1, 0], true)
    }
    // hook pad (rubber mat) + padeye under the parked head
    if (opts.hookPad) {
      const fm = D.foot + D.tip.t * Math.cos(A) - D.tip.n * Math.sin(A)
      rbox(cb.soot, fm - 0.5, 0, -0.5, fm + 0.5, 0.06, 0.5)
      rbox(cb.yellow, fm + 0.8, 0, -0.04, fm + 1.05, 0.25, 0.04)
    }
  }
  return { bearing: D.yB, dims: D }
}
