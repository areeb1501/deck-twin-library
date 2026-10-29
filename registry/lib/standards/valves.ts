// ASME B16.10 valve face-to-face (RF flanged), API 609 / API 594 / ISA 75.08.01 wafer and control valves, API 526 PSVs. Reference values. Verify against the current edition.
import { inch, mm, nearest, tableKeys } from './util'
import { flange, RATINGS } from './flange'
import type { Rating } from './flange'

export type ValveFamily =
  | 'gate' | 'globe' | 'swing-check' | 'ball-full' | 'ball-reduced' | 'plug'
  | 'butterfly-wafer' | 'butterfly-lug' | 'dual-plate-check' | 'control-globe' | 'needle'

type ByClass = Partial<Record<Rating, Record<number, number>>>

// B16.10 gate (inches). NPS 30/36 approx. Class 600+ globe and swing check share these.
const GATE: ByClass = {
  150: {
    0.5: 4.25, 0.75: 4.62, 1: 5, 1.25: 5.5, 1.5: 6.5, 2: 7, 2.5: 7.5, 3: 8, 4: 9, 5: 10, 6: 10.5, 8: 11.5,
    10: 13, 12: 14, 14: 15, 16: 16, 18: 17, 20: 18, 24: 20, 30: 24, 36: 28,
  },
  300: {
    0.5: 5.5, 0.75: 6, 1: 6.5, 1.25: 7, 1.5: 7.5, 2: 8.5, 2.5: 9.5, 3: 11.12, 4: 12, 5: 15, 6: 15.88, 8: 16.5,
    10: 18, 12: 19.75, 14: 30, 16: 33, 18: 36, 20: 39, 24: 45, 30: 55, 36: 68,
  },
  600: {
    0.5: 6.5, 0.75: 7.5, 1: 8.5, 1.25: 9, 1.5: 9.5, 2: 11.5, 2.5: 13, 3: 14, 4: 17, 5: 20, 6: 22, 8: 26,
    10: 31, 12: 33, 14: 35, 16: 39, 18: 43, 20: 47, 24: 55, 30: 65, 36: 82,
  },
  900: {
    0.5: 8.5, 0.75: 9, 1: 10, 1.25: 11, 1.5: 12, 2: 14.5, 2.5: 16.5, 3: 15, 4: 18, 5: 22, 6: 24, 8: 29,
    10: 33, 12: 38, 14: 40.5, 16: 44.5, 18: 48, 20: 52, 24: 61,
  },
  1500: {
    0.5: 8.5, 0.75: 9, 1: 10, 1.25: 11, 1.5: 12, 2: 14.5, 2.5: 16.5, 3: 18.5, 4: 21.5, 5: 26.5, 6: 27.75,
    8: 32.75, 10: 39, 12: 44.5, 14: 49.5, 16: 54.5, 18: 60.5, 20: 65.5, 24: 76.5,
  },
  2500: {
    0.5: 10.38, 0.75: 10.75, 1: 12.12, 1.25: 13.75, 1.5: 15.12, 2: 17.75, 2.5: 20, 3: 22.75, 4: 26.5,
    5: 31.25, 6: 36, 8: 40.25, 10: 50, 12: 56,
  },
}

const HIGH = { 600: GATE[600], 900: GATE[900], 1500: GATE[1500], 2500: GATE[2500] }

// B16.10 globe (inches); Class 150 NPS 14/16 approx.
const GLOBE: ByClass = {
  150: {
    0.5: 4.25, 0.75: 4.62, 1: 5, 1.25: 5.5, 1.5: 6.5, 2: 8, 2.5: 8.5, 3: 9.5, 4: 11.5, 5: 14, 6: 16, 8: 19.5,
    10: 24.5, 12: 27.5, 14: 31, 16: 36,
  },
  300: {
    0.5: 6, 0.75: 7, 1: 8, 1.25: 8.5, 1.5: 9, 2: 10.5, 2.5: 11.5, 3: 12.5, 4: 14, 5: 15.75, 6: 17.5, 8: 22,
    10: 24.5, 12: 28,
  },
  ...HIGH,
}

// B16.10 swing check (inches).
const SWING_CHECK: ByClass = {
  150: {
    0.5: 4.25, 0.75: 4.62, 1: 5, 1.25: 5.5, 1.5: 6.5, 2: 8, 2.5: 8.5, 3: 9.5, 4: 11.5, 5: 13, 6: 14, 8: 19.5,
    10: 24.5, 12: 27.5, 14: 31, 16: 34, 18: 38.5, 20: 38.5, 24: 51,
  },
  300: {
    0.5: 6, 0.75: 7, 1: 8, 1.25: 8.5, 1.5: 9, 2: 10.5, 2.5: 11.5, 3: 12.5, 4: 14, 5: 15.75, 6: 17.5, 8: 21,
    10: 24.5, 12: 28, 14: 33, 16: 34, 18: 38.5, 20: 40, 24: 53,
  },
  ...HIGH,
}

// B16.10 full-bore (long pattern) ball (inches); NPS 30+ approx.
const BALL_FULL: ByClass = {
  150: {
    ...GATE[150], 6: 15.5, 8: 18, 10: 21, 12: 24, 14: 27, 16: 30, 18: 34, 20: 36, 24: 42,
    30: 51, 36: 60, 42: 68, 48: 76,
  },
  300: {
    ...GATE[300], 8: 19.75, 10: 22.38, 12: 25.5, 14: 30, 16: 33, 18: 36, 20: 39, 24: 45,
    30: 55, 36: 68, 42: 76, 48: 86,
  },
  600: { ...GATE[600], 42: 94, 48: 106 },
  900: GATE[900],
  1500: GATE[1500],
  2500: GATE[2500],
}

// Reduced-bore ball and plug use the B16.10 short pattern, equal to gate.
const SHORT: ByClass = GATE

// API 609 Category B wafer/lug (mm). Class 150 NPS 30+ and Class 600 approx.
const BUTTERFLY: ByClass = {
  150: { 3: 48, 4: 54, 6: 57, 8: 64, 10: 71, 12: 81, 14: 92, 16: 102, 18: 114, 20: 127, 24: 154, 30: 165, 36: 200, 42: 251, 48: 276 },
  300: { 3: 48, 4: 54, 6: 59, 8: 73, 10: 83, 12: 92, 14: 117, 16: 133, 18: 149, 20: 159, 24: 181 },
  600: { 3: 54, 4: 64, 6: 78, 8: 102, 10: 117, 12: 140, 14: 155, 16: 178, 18: 200, 20: 216, 24: 232 },
}

// API 594 Type A wafer dual-plate check (mm). Class 900+ approx.
const DUAL_PLATE: ByClass = {
  150: { 2: 60, 2.5: 67, 3: 73, 4: 73, 6: 98, 8: 127, 10: 146, 12: 181, 14: 184, 16: 191, 18: 203, 20: 219, 24: 222 },
  300: { 2: 60, 2.5: 67, 3: 73, 4: 73, 6: 98, 8: 127, 10: 146, 12: 181, 14: 222, 16: 232, 18: 264, 20: 292, 24: 318 },
  600: { 2: 60, 2.5: 67, 3: 73, 4: 79, 6: 137, 8: 165, 10: 213, 12: 229, 14: 273, 16: 305, 18: 362, 20: 368, 24: 438 },
  900: { 2: 70, 3: 83, 4: 102, 6: 159, 8: 206, 10: 241, 12: 292, 14: 356, 16: 384, 18: 451, 20: 468, 24: 533 },
  1500: { 2: 70, 3: 83, 4: 102, 6: 159, 8: 206, 10: 248, 12: 305, 14: 356, 16: 384, 18: 468, 20: 533, 24: 559 },
  2500: { 2: 70, 3: 86, 4: 105, 6: 159, 8: 206, 10: 250, 12: 305 },
}

// ISA 75.08.01 flanged globe control valve (mm). Class 900+ approx (ISA 75.08.06 style).
const CONTROL: ByClass = {
  150: { 1: 184, 1.5: 222, 2: 254, 2.5: 276, 3: 298, 4: 352, 6: 451, 8: 543, 10: 673, 12: 737, 14: 889, 16: 1016 },
  300: { 1: 197, 1.5: 235, 2: 267, 2.5: 292, 3: 318, 4: 368, 6: 473, 8: 568, 10: 708, 12: 775, 14: 927, 16: 1057 },
  600: { 1: 210, 1.5: 251, 2: 286, 2.5: 311, 3: 337, 4: 394, 6: 508, 8: 610, 10: 752, 12: 819, 14: 972, 16: 1108 },
  900: { 1: 273, 1.5: 311, 2: 340, 3: 387, 4: 464, 6: 600, 8: 781, 10: 864, 12: 1022 },
  1500: { 1: 273, 1.5: 311, 2: 375, 3: 460, 4: 530, 6: 768, 8: 832, 10: 991, 12: 1130 },
  2500: { 1: 308, 1.5: 359, 2: 400, 3: 498, 4: 575, 6: 819, 8: 1029 },
}

// typical: flanged instrument needle valve (mm), scaled by class below.
const NEEDLE_150: Record<number, number> = { 0.25: 100, 0.5: 110, 0.75: 120, 1: 140 }
const NEEDLE_K: Record<Rating, number> = { 150: 1, 300: 1.05, 600: 1.1, 900: 1.3, 1500: 1.3, 2500: 1.5 }

const TABLES: Record<Exclude<ValveFamily, 'needle'>, { t: ByClass; unit: 'in' | 'mm' }> = {
  gate: { t: GATE, unit: 'in' },
  globe: { t: GLOBE, unit: 'in' },
  'swing-check': { t: SWING_CHECK, unit: 'in' },
  'ball-full': { t: BALL_FULL, unit: 'in' },
  'ball-reduced': { t: SHORT, unit: 'in' },
  plug: { t: SHORT, unit: 'in' },
  'butterfly-wafer': { t: BUTTERFLY, unit: 'mm' },
  'butterfly-lug': { t: BUTTERFLY, unit: 'mm' },
  'dual-plate-check': { t: DUAL_PLATE, unit: 'mm' },
  'control-globe': { t: CONTROL, unit: 'mm' },
}

/** Snap NPS over every class of the family, then use the nearest class that defines that size. */
function lookup(t: ByClass, nps: number, rating: Rating): number {
  const classes = RATINGS.filter((r) => t[r] !== undefined)
  const all = [...new Set(classes.flatMap((r) => tableKeys(t[r]!)))].sort((a, b) => a - b)
  const size = nearest(all, nps)
  const want = RATINGS.indexOf(RATINGS.includes(rating) ? rating : 300)
  const order = [...classes].sort((a, b) => {
    const da = Math.abs(RATINGS.indexOf(a) - want)
    const db = Math.abs(RATINGS.indexOf(b) - want)
    return da - db || b - a
  })
  for (const r of order) {
    const v = t[r]![size]
    if (v !== undefined) return v
  }
  const r = order[0]
  return t[r]![nearest(tableKeys(t[r]!), size)]
}

/** Flanged (RF) face-to-face, or wafer body length for butterfly / dual-plate. */
export function faceToFace(family: ValveFamily, nps: number, rating: Rating = 300): number {
  if (family === 'needle') {
    const r = RATINGS.includes(rating) ? rating : 300
    return mm(NEEDLE_150[nearest(tableKeys(NEEDLE_150), nps)] * NEEDLE_K[r])
  }
  const { t, unit } = TABLES[family] ?? TABLES.gate
  const v = lookup(t, nps, rating)
  return unit === 'in' ? inch(v) : mm(v)
}

const classK = (r: Rating) => 1 + 0.06 * Math.max(0, RATINGS.indexOf(r))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * typical: handwheel diameter. For ball, plug and butterfly up to NPS 4 this is the lever length;
 * larger sizes assume a gear operator handwheel. Check valves have none (0); control valves return
 * the actuator diaphragm case diameter.
 */
export function handwheelDia(family: ValveFamily, nps: number, rating: Rating = 300): number {
  const k = classK(rating)
  switch (family) {
    case 'gate':
    case 'globe':
      return clamp((0.1 + 0.04 * nps) * k * (family === 'globe' ? 1.1 : 1), 0.1, 0.9)
    case 'ball-full':
    case 'ball-reduced':
    case 'plug':
    case 'butterfly-wafer':
    case 'butterfly-lug':
      return nps <= 4 ? clamp(0.15 + 0.06 * nps, 0.12, 0.5) : clamp((0.2 + 0.03 * nps) * k, 0.25, 0.9)
    case 'control-globe':
      return clamp(0.3 + 0.03 * nps, 0.25, 0.7)
    case 'needle':
      return 0.05
    default:
      return 0
  }
}

/** typical: valve centreline to top of stem / operator, valve open (rising stem fully out). */
export function stemHeight(family: ValveFamily, nps: number, rating: Rating = 300): number {
  const k = classK(rating)
  switch (family) {
    case 'gate':
      return (0.15 + 0.12 * nps) * k
    case 'globe':
      return (0.15 + 0.07 * nps) * k
    case 'control-globe':
      return (0.4 + 0.06 * nps) * k
    case 'ball-full':
    case 'ball-reduced':
    case 'plug':
      return (nps <= 4 ? 0.06 + 0.04 * nps : 0.1 + 0.035 * nps) * k
    case 'butterfly-wafer':
    case 'butterfly-lug':
      return (0.1 + 0.04 * nps) * k
    case 'swing-check':
      return (0.05 + 0.03 * nps) * k
    case 'dual-plate-check':
      return flange(nps, rating).raisedFace / 2
    case 'needle':
      return 0.1 + 0.02 * nps
    default:
      return 0.2
  }
}

// API 526 pressure relief valves (flanged steel, spring-loaded).
export type Orifice = 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'M' | 'N' | 'P' | 'Q' | 'R' | 'T'

export interface PsvSize {
  orifice: Orifice
  area: number
  inletNps: number
  outletNps: number
  inletRating: Rating
  outletRating: Rating
  centreToInlet: number
  centreToOutlet: number
  height: number
}

export const PSV_ORIFICES: readonly Orifice[] = ['D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'T']

// Effective orifice area, in².
const AREA: Record<Orifice, number> = {
  D: 0.11, E: 0.196, F: 0.307, G: 0.503, H: 0.785, J: 1.287, K: 1.838, L: 2.853,
  M: 3.6, N: 4.34, P: 6.38, Q: 11.05, R: 16.0, T: 26.0,
}

// Inlet class -> [inlet NPS, outlet NPS, outlet class, centre-to-inlet face A, centre-to-outlet face B (in)].
// Sizes per API 526; approx: A/B dimensions (±1/2"), verify against the vendor's API 526 table.
type PsvRow = [inNps: number, outNps: number, outRating: Rating, a: number, b: number]
const PSV_TABLE: Record<Orifice, Partial<Record<Rating, PsvRow>>> = {
  D: { 150: [1, 2, 150, 4.125, 4.5], 300: [1, 2, 150, 4.125, 4.5], 600: [1, 2, 150, 4.125, 4.75], 900: [1.5, 2, 300, 5.5, 4.5], 1500: [1.5, 2, 300, 5.5, 4.5], 2500: [1.5, 3, 300, 6.5, 5.5] },
  E: { 150: [1, 2, 150, 4.125, 4.5], 300: [1, 2, 150, 4.125, 4.5], 600: [1, 2, 150, 4.125, 4.75], 900: [1.5, 2, 300, 5.5, 4.5], 1500: [1.5, 2, 300, 5.5, 4.5], 2500: [1.5, 3, 300, 6.5, 5.5] },
  F: { 150: [1.5, 2, 150, 4.875, 4.75], 300: [1.5, 2, 150, 4.875, 4.75], 600: [1.5, 2, 150, 4.875, 4.75], 900: [1.5, 3, 300, 6.125, 5.5], 1500: [1.5, 3, 300, 6.125, 5.5], 2500: [1.5, 3, 300, 6.5, 5.5] },
  G: { 150: [1.5, 2.5, 150, 4.875, 4.75], 300: [1.5, 2.5, 150, 4.875, 4.75], 600: [1.5, 3, 150, 4.875, 4.75], 900: [2, 3, 300, 6.125, 4.875], 1500: [2, 3, 300, 6.125, 4.875], 2500: [2, 3, 300, 6.875, 5.5] },
  H: { 150: [1.5, 3, 150, 5.125, 4.875], 300: [1.5, 3, 150, 5.125, 4.875], 600: [2, 3, 150, 6.0, 5.5], 900: [2, 3, 300, 6.0, 5.5], 1500: [2, 3, 300, 6.0, 5.5] },
  // API 526 also lists 2J3 at Class 150/300; 3J4 is used here.
  J: { 150: [3, 4, 150, 5.375, 6.5], 300: [3, 4, 150, 5.375, 6.5], 600: [3, 4, 150, 6.125, 6.5], 900: [3, 4, 300, 6.875, 6.5], 1500: [3, 4, 300, 7.0, 7.25] },
  K: { 150: [3, 4, 150, 6.125, 6.5], 300: [3, 4, 150, 6.125, 6.5], 600: [3, 4, 150, 6.125, 6.5], 900: [3, 6, 150, 7.125, 7.5], 1500: [3, 6, 150, 7.125, 7.5] },
  L: { 150: [3, 4, 150, 6.125, 6.5], 300: [4, 6, 150, 7.125, 7.25], 600: [4, 6, 150, 7.125, 7.25], 900: [4, 6, 150, 7.5, 7.25], 1500: [4, 6, 150, 7.5, 8.5] },
  M: { 150: [4, 6, 150, 7.0, 7.25], 300: [4, 6, 150, 7.0, 7.25], 600: [4, 6, 150, 7.0, 7.25], 900: [4, 6, 150, 7.5, 8.5] },
  N: { 150: [4, 6, 150, 7.5, 8.25], 300: [4, 6, 150, 7.5, 8.25], 600: [4, 6, 150, 7.5, 8.25], 900: [4, 6, 150, 7.875, 8.5] },
  P: { 150: [4, 6, 150, 7.125, 9.0], 300: [4, 6, 150, 7.125, 9.0], 600: [4, 6, 150, 7.5, 9.0], 900: [4, 6, 150, 8.0, 9.0], 1500: [4, 6, 300, 8.5, 9.5] },
  Q: { 150: [6, 8, 150, 9.4375, 9.5], 300: [6, 8, 150, 9.4375, 9.5], 600: [6, 8, 150, 9.9375, 9.5] },
  R: { 150: [6, 8, 150, 9.4375, 9.5], 300: [6, 8, 150, 9.4375, 9.5], 600: [6, 10, 150, 10.5, 10.5] },
  T: { 150: [8, 10, 150, 10.875, 11.0], 300: [8, 10, 150, 10.875, 11.0] },
}

// typical: overall height, inlet face to top of cap, conventional spring-loaded valve (m).
const HEIGHT: Record<Orifice, number> = {
  D: 0.45, E: 0.45, F: 0.5, G: 0.52, H: 0.6, J: 0.7, K: 0.8, L: 0.9,
  M: 1.0, N: 1.05, P: 1.15, Q: 1.45, R: 1.6, T: 1.9,
}

/** API 526 PSV. If the orifice is not offered for the inlet class, the nearest lower class is used (else next higher). */
export function psv(orifice: Orifice, inletRating: Rating = 150): PsvSize {
  const o: Orifice = PSV_ORIFICES.includes(orifice) ? orifice : 'J'
  const rows = PSV_TABLE[o]
  const want = RATINGS.includes(inletRating) ? inletRating : 150
  const avail = RATINGS.filter((r) => rows[r] !== undefined)
  const r = rows[want] ? want : [...avail].reverse().find((c) => c < want) ?? avail[0]
  const [inNps, outNps, outRating, a, b] = rows[r]!
  return {
    orifice: o,
    area: AREA[o] * 6.4516e-4,
    inletNps: inNps,
    outletNps: outNps,
    inletRating: r,
    outletRating: outRating,
    centreToInlet: inch(a),
    centreToOutlet: inch(b),
    height: HEIGHT[o] * (r >= 900 ? 1.15 : 1),
  }
}
