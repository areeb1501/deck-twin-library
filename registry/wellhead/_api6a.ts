// API 6A type 6B / 6BX flange and full-bore gate valve dimensions (typical, from published 6A tables; verify against the current edition).
import { inch, nearest, type Rating } from '../lib/standards'

export type Psi = 2000 | 3000 | 5000 | 10000 | 15000

export interface ApiFlange {
  /** nominal bore, inches (e.g. 2.0625) */
  bore: number
  od: number
  /** total thickness, ring-joint face to back */
  t: number
  bolts: number
  boltDia: number
  boltCircle: number
  /** ring groove pitch diameter (approx) */
  ring: number
  /** 6BX (true for 10k+, and for 13-5/8 and up at 5k) */
  bx: boolean
}

// inches: [OD, thickness, bolt circle, bolt count, bolt dia]
type Row = [od: number, t: number, bc: number, n: number, bd: number]

const T: Record<Psi, Record<number, Row>> = {
  2000: {
    2.0625: [6.5, 1.31, 5.0, 8, 0.625], 2.5625: [7.5, 1.44, 5.88, 8, 0.75], 3.125: [8.25, 1.56, 6.62, 8, 0.75],
    4.0625: [10.75, 1.81, 8.5, 8, 0.875], 7.0625: [14.0, 2.19, 11.5, 12, 1.0], 9: [16.5, 2.5, 13.75, 12, 1.125],
    11: [20.0, 2.81, 17.0, 16, 1.25], 13.625: [22.0, 2.94, 19.25, 20, 1.25], 16.75: [27.0, 3.31, 23.75, 20, 1.5],
    21.25: [32.0, 3.88, 28.5, 24, 1.625],
  },
  3000: {
    2.0625: [8.5, 1.81, 6.5, 8, 0.875], 2.5625: [9.62, 1.94, 7.5, 8, 1.0], 3.125: [9.5, 1.81, 7.5, 8, 0.875],
    4.0625: [11.5, 2.06, 9.25, 8, 1.125], 7.0625: [15.0, 2.5, 12.5, 12, 1.125], 9: [18.5, 2.81, 15.5, 12, 1.375],
    11: [21.5, 3.06, 18.5, 16, 1.375], 13.625: [24.0, 3.44, 21.0, 20, 1.375], 16.75: [27.75, 3.94, 24.25, 20, 1.625],
    20.75: [33.75, 4.75, 29.5, 20, 2.0],
  },
  5000: {
    2.0625: [8.5, 1.81, 6.5, 8, 0.875], 2.5625: [9.62, 1.94, 7.5, 8, 1.0], 3.125: [10.5, 2.19, 8.0, 8, 1.125],
    4.0625: [12.25, 2.44, 9.5, 8, 1.25], 5.125: [14.75, 3.19, 11.5, 8, 1.5], 7.0625: [15.5, 3.62, 12.5, 12, 1.375],
    9: [19.0, 4.06, 15.5, 12, 1.625], 11: [23.0, 4.69, 19.0, 12, 1.875], 13.625: [26.5, 4.44, 23.25, 16, 1.625],
    16.75: [30.38, 5.12, 26.62, 16, 1.875], 21.25: [39.38, 7.12, 35.38, 24, 2.0],
  },
  10000: {
    1.8125: [7.38, 1.66, 5.75, 8, 0.75], 2.0625: [7.88, 1.73, 6.25, 8, 0.75], 2.5625: [9.12, 2.02, 7.25, 8, 0.875],
    3.0625: [10.62, 2.3, 8.5, 8, 1.0], 4.0625: [12.44, 2.77, 10.19, 8, 1.125], 5.125: [14.06, 3.12, 11.81, 12, 1.125],
    7.0625: [18.88, 4.06, 15.88, 12, 1.5], 9: [21.75, 4.88, 18.75, 16, 1.5], 11: [25.75, 5.56, 22.25, 16, 1.75],
    13.625: [30.25, 6.62, 26.5, 20, 1.875], 16.75: [34.31, 6.62, 30.56, 24, 1.875], 18.75: [40.94, 8.78, 36.44, 24, 2.25],
    21.25: [45.0, 9.5, 40.25, 24, 2.5],
  },
  15000: {
    1.8125: [8.19, 1.78, 6.31, 8, 0.875], 2.0625: [8.75, 2.0, 6.88, 8, 0.875], 2.5625: [10.0, 2.25, 7.88, 8, 1.0],
    3.0625: [11.31, 2.53, 9.06, 8, 1.125], 4.0625: [14.19, 3.09, 11.44, 8, 1.375], 5.125: [16.5, 3.88, 13.63, 12, 1.5],
    7.0625: [19.88, 4.69, 16.88, 16, 1.5], 9: [25.5, 5.75, 21.75, 16, 1.875], 11: [32.0, 7.38, 28.0, 20, 2.0],
    13.625: [34.88, 8.06, 30.38, 20, 2.25], 18.75: [45.75, 10.06, 40.0, 20, 3.0],
  },
}

/** API 6B / 6BX flange for a nominal bore (snapped to the nearest size the pressure class defines). Typical dims. */
export function apiFlange(bore: number, psi: Psi = 5000): ApiFlange {
  const tbl = T[psi] ?? T[5000]
  const b = nearest(Object.keys(tbl).map(Number), bore)
  const [od, t, bc, n, bd] = tbl[b]
  return { bore: b, od: inch(od), t: inch(t), bolts: n, boltDia: inch(bd), boltCircle: inch(bc), ring: inch(bc - bd * 1.9), bx: psi >= 10000 || b >= 13.625 }
}

// Full-bore flanged gate valve face-to-face, inches (typical API 6A, slab gate).
const GATE: Record<Psi, Record<number, number>> = {
  2000: { 2.0625: 11.62, 2.5625: 13.12, 3.125: 14.12, 4.0625: 17.12, 7.0625: 22.12 },
  3000: { 2.0625: 14.62, 2.5625: 16.62, 3.125: 17.12, 4.0625: 20.12, 7.0625: 24.12 },
  5000: { 2.0625: 14.62, 2.5625: 16.62, 3.125: 18.62, 4.0625: 21.62, 5.125: 28.62, 7.0625: 29.0 },
  10000: { 1.8125: 18.25, 2.0625: 20.5, 2.5625: 22.25, 3.0625: 24.38, 4.0625: 26.38, 5.125: 29.0, 7.0625: 35.0 },
  15000: { 1.8125: 18.0, 2.0625: 19.0, 2.5625: 21.0, 3.0625: 23.56, 4.0625: 29.0, 5.125: 35.0, 7.0625: 40.0 },
}

export function apiGateLength(bore: number, psi: Psi = 5000): number {
  const tbl = GATE[psi] ?? GATE[5000]
  return inch(tbl[nearest(Object.keys(tbl).map(Number), bore)])
}

/** Nearest bore the pressure class actually defines (2-9/16 vs 3-1/8 at 5k, 3-1/16 at 10k, …). */
export function apiBore(bore: number, psi: Psi = 5000): number {
  return apiFlange(bore, psi).bore
}

/** ASME B16.5 class whose bolt pattern matches the API 6B class (2000→600, 3000→900, 5000→1500); 10k+ → 2500 is the closest, not interchangeable. */
export function asmeEquivalent(psi: Psi): Rating {
  return psi <= 2000 ? 600 : psi <= 3000 ? 900 : psi <= 5000 ? 1500 : 2500
}

/** Line-pipe NPS for an API nominal bore (2-1/16 → 2, 3-1/16 / 3-1/8 → 3, 4-1/16 → 4, 13-5/8 → 14…). */
export function boreNps(bore: number): number {
  return nearest([1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20], bore - 0.07)
}

export const BORE_LABEL: Record<number, string> = {
  1.8125: '1-13/16"', 2.0625: '2-1/16"', 2.5625: '2-9/16"', 3.0625: '3-1/16"', 3.125: '3-1/8"', 4.0625: '4-1/16"',
  5.125: '5-1/8"', 7.0625: '7-1/16"', 9: '9"', 11: '11"', 13.625: '13-5/8"', 16.75: '16-3/4"', 18.75: '18-3/4"', 20.75: '20-3/4"', 21.25: '21-1/4"',
}
