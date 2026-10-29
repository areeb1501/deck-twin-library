// ASME B16.9 butt-welding fittings (and MSS SP-43 / B16.9 long-pattern stub ends). Reference values. Verify against the current edition.
import { inch, nearest, tableKeys } from './util'
import { pipeOD } from './pipe'
import { flange } from './flange'

// 90° LR centre-to-end A (inches). A = 1.5 x NPS from 3/4 up; NPS 1/2 is 1.50.
const LR90: Record<number, number> = {
  0.5: 1.5, 0.75: 1.12, 1: 1.5, 1.25: 1.88, 1.5: 2.25, 2: 3, 2.5: 3.75, 3: 4.5, 3.5: 5.25, 4: 6, 5: 7.5,
  6: 9, 8: 12, 10: 15, 12: 18, 14: 21, 16: 24, 18: 27, 20: 30, 22: 33, 24: 36, 26: 39, 28: 42, 30: 45,
  32: 48, 34: 51, 36: 54, 42: 63, 48: 72,
}

// 45° LR centre-to-end B (inches). 42 and 48 approx.
const LR45: Record<number, number> = {
  0.5: 0.62, 0.75: 0.44, 1: 0.88, 1.25: 1, 1.5: 1.12, 2: 1.38, 2.5: 1.75, 3: 2, 3.5: 2.25, 4: 2.5, 5: 3.12,
  6: 3.75, 8: 5, 10: 6.25, 12: 7.5, 14: 8.75, 16: 10, 18: 11.25, 20: 12.5, 22: 13.5, 24: 15, 26: 16,
  28: 17.25, 30: 18.5, 32: 19.75, 34: 21, 36: 22.25, 42: 26, 48: 29.75,
}

// Tee centre-to-end, run C = outlet M for equal tees (inches). 42 and 48 approx.
const TEE: Record<number, number> = {
  0.5: 1, 0.75: 1.12, 1: 1.5, 1.25: 1.88, 1.5: 2.25, 2: 2.5, 2.5: 3, 3: 3.38, 3.5: 3.75, 4: 4.12, 5: 4.88,
  6: 5.62, 8: 7, 10: 8.5, 12: 10, 14: 11, 16: 12, 18: 13.5, 20: 15, 22: 16.5, 24: 17, 26: 19.5, 28: 20.5,
  30: 22, 32: 23.5, 34: 25, 36: 26.5, 42: 30, 48: 35,
}

// Reducer end-to-end H, set by the large end (inches). NPS 1/2 has none (uses 3/4). 42 and 48 approx.
const REDUCER: Record<number, number> = {
  0.75: 1.5, 1: 2, 1.25: 2, 1.5: 2.5, 2: 3, 2.5: 3.5, 3: 3.5, 3.5: 4, 4: 4, 5: 5, 6: 5.5, 8: 6, 10: 7,
  12: 8, 14: 13, 16: 14, 18: 15, 20: 20, 22: 20, 24: 20, 26: 24, 28: 24, 30: 24, 32: 24, 34: 24, 36: 24,
  42: 24, 48: 24,
}

// Cap E for standard wall (inches). 42 and 48 approx.
const CAP: Record<number, number> = {
  0.5: 1, 0.75: 1, 1: 1.5, 1.25: 1.5, 1.5: 1.5, 2: 1.5, 2.5: 1.5, 3: 2, 3.5: 2.5, 4: 2.5, 5: 3, 6: 3.5,
  8: 4, 10: 5, 12: 6, 14: 6.5, 16: 7, 18: 8, 20: 9, 22: 10, 24: 10.5, 26: 10.5, 28: 10.5, 30: 10.5,
  32: 10.5, 34: 10.5, 36: 10.5, 42: 12, 48: 13.5,
}

// Long-pattern stub end: [length F, lap diameter G] (inches).
const STUB: Record<number, [number, number]> = {
  0.5: [3, 1.38], 0.75: [3, 1.69], 1: [4, 2], 1.25: [4, 2.5], 1.5: [4, 2.88], 2: [6, 3.62], 2.5: [6, 4.12],
  3: [6, 5], 3.5: [6, 5.5], 4: [6, 6.19], 5: [8, 7.31], 6: [8, 8.5], 8: [8, 10.62], 10: [10, 12.75],
  12: [10, 15], 14: [12, 16.25], 16: [12, 18.5], 18: [12, 21], 20: [12, 23], 22: [12, 25.25], 24: [12, 27.25],
}

const pick = (t: Record<number, number>, nps: number) => t[nearest(tableKeys(t), nps)]
const npsOf = (t: Record<number, unknown>, nps: number) => nearest(tableKeys(t), nps)

/** 90° elbow centre-to-end A. SR (A = NPS) is defined from NPS 1; smaller sizes return LR. */
export function elbow90(nps: number, radius: 'LR' | 'SR' = 'LR'): number {
  const s = npsOf(LR90, nps)
  if (radius === 'SR' && s >= 1) return inch(s)
  return inch(LR90[s])
}

/** 45° LR elbow centre-to-end B. */
export function elbow45(nps: number): number {
  return inch(pick(LR45, nps))
}

/** 180° return: centre-to-centre O = 2A, back-to-face K = A + OD/2. */
export function elbow180(nps: number, radius: 'LR' | 'SR' = 'LR'): { centreToCentre: number; backToFace: number } {
  const s = npsOf(LR90, nps)
  const a = elbow90(s, radius)
  return { centreToCentre: 2 * a, backToFace: a + pipeOD(s) / 2 }
}

/** Tee: run C and outlet M. Equal tees per B16.9; reducing-outlet M is approx (fit to B16.9 rows). */
export function tee(nps: number, branchNps?: number): { run: number; branch: number } {
  const s = npsOf(TEE, nps)
  const c = TEE[s]
  if (branchNps === undefined) return { run: inch(c), branch: inch(c) }
  const b = Math.min(npsOf(TEE, branchNps), s)
  if (b === s) return { run: inch(c), branch: inch(c) }
  // approx: M = C - (OD_run - OD_branch)/4, never below the equal-tee C of the branch size.
  const odRun = pipeOD(s) / 0.0254
  const odBr = pipeOD(b) / 0.0254
  const m = Math.max(TEE[b], c - (odRun - odBr) / 4)
  return { run: inch(c), branch: inch(Math.round(m * 8) / 8) }
}

/** Concentric or eccentric reducer end-to-end H (set by the large end). */
export function reducer(nps: number, smallNps: number): number {
  const large = Math.max(nps, smallNps)
  return inch(pick(REDUCER, large))
}

/** Cap height E (standard wall). */
export function cap(nps: number): number {
  return inch(pick(CAP, nps))
}

/** Long-pattern stub end: length F and lap diameter G. */
export function stubEnd(nps: number): { length: number; lapDia: number } {
  // approx: above NPS 24, 12" long with the B16.47 raised-face diameter as the lap.
  if (nps > 25) return { length: inch(12), lapDia: flange(nps, 150).raisedFace }
  const [f, g] = STUB[npsOf(STUB, nps)]
  return { length: inch(f), lapDia: inch(g) }
}
