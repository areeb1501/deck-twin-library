/**
 * Engineering catalogue — real dimensional data so the geometry reads as a plant,
 * not as primitives. Sources: ASME B36.10M (pipe), B16.5 (flanges, Class 300),
 * B16.10 (valve face-to-face), B16.9 (long-radius elbows).
 * All values returned in METRES.
 */
import type { Rating, Service, ValveType } from './types'

const mm = (v: number) => v / 1000

/** NPS -> [OD mm, wall STD/Sch40 mm, wall XS/Sch80 mm, wall Sch160 mm] */
const PIPE: Record<number, [number, number, number, number]> = {
  0.5: [21.3, 2.77, 3.73, 4.78],
  0.75: [26.7, 2.87, 3.91, 5.56],
  1: [33.4, 3.38, 4.55, 6.35],
  1.5: [48.3, 3.68, 5.08, 7.14],
  2: [60.3, 3.91, 5.54, 8.74],
  3: [88.9, 5.49, 7.62, 11.13],
  4: [114.3, 6.02, 8.56, 13.49],
  6: [168.3, 7.11, 10.97, 18.26],
  8: [219.1, 8.18, 12.7, 23.01],
  10: [273.1, 9.27, 12.7, 28.58],
  12: [323.9, 9.53, 12.7, 33.32],
  14: [355.6, 9.53, 12.7, 35.71],
  16: [406.4, 9.53, 12.7, 40.49],
  18: [457.2, 9.53, 12.7, 45.24],
  20: [508.0, 9.53, 12.7, 50.01],
  24: [609.6, 9.53, 12.7, 59.54],
}

export const NPS_SIZES = Object.keys(PIPE).map(Number).sort((a, b) => a - b)

function nearest(nps: number) {
  let best = NPS_SIZES[0]
  for (const s of NPS_SIZES) if (Math.abs(s - nps) < Math.abs(best - nps)) best = s
  return best
}

export function pipeOD(nps: number) {
  return mm(PIPE[nearest(nps)][0])
}

export function pipeWall(nps: number, schedule: string = '40') {
  const r = PIPE[nearest(nps)]
  if (schedule === '80' || schedule === 'XS') return mm(r[2])
  if (schedule === '160') return mm(r[3])
  return mm(r[1])
}

/** Long-radius elbow centreline radius (1.5 x NPS) */
export function elbowRadius(nps: number) {
  return Math.max(mm(1.5 * nps * 25.4), pipeOD(nps) * 0.75)
}

/**
 * Class 300 weld-neck flange (B16.5):
 * od, thickness, bolt count, bolt dia, bolt circle, hub length (Y), hub base dia (X), raised face dia
 */
const FLANGE_300: Record<number, [number, number, number, number, number, number, number, number]> = {
  0.5: [95, 14.2, 4, 12.7, 66.5, 52, 38, 34.9],
  0.75: [117, 15.7, 4, 15.9, 82.6, 57, 48, 42.9],
  1: [124, 17.5, 4, 15.9, 88.9, 62, 54, 50.8],
  1.5: [156, 20.6, 4, 19.1, 114.3, 67, 70, 73.2],
  2: [165, 22.4, 8, 15.9, 127.0, 68, 84, 91.9],
  3: [210, 28.4, 8, 19.1, 168.1, 79, 117, 127.0],
  4: [254, 31.8, 8, 19.1, 200.2, 86, 146, 157.2],
  6: [318, 36.6, 12, 19.1, 269.7, 98, 206, 215.9],
  8: [381, 41.1, 12, 22.2, 330.2, 111, 260, 269.7],
  10: [444, 47.8, 16, 25.4, 387.4, 117, 321, 323.9],
  12: [521, 50.8, 16, 28.6, 450.8, 130, 375, 381.0],
  14: [584, 53.8, 20, 28.6, 514.4, 143, 425, 412.8],
  16: [648, 57.2, 20, 31.8, 571.5, 146, 483, 469.9],
  18: [711, 60.5, 24, 31.8, 628.6, 159, 533, 533.4],
  20: [775, 63.5, 24, 31.8, 685.8, 162, 587, 584.2],
  24: [914, 69.9, 24, 38.1, 812.8, 168, 702, 692.2],
}

export interface FlangeDims {
  od: number
  thickness: number
  bolts: number
  boltDia: number
  boltCircle: number
  hubLength: number
  hubDia: number
  raisedFaceDia: number
  /** total length from weld bevel to flange face */
  length: number
}

export function flange(nps: number, rating: Rating = 300): FlangeDims {
  const r = FLANGE_300[nearest(nps)]
  const k = rating === 150 ? 0.88 : rating === 600 ? 1.12 : rating === 900 ? 1.25 : 1
  const thickness = mm(r[1]) * k
  return {
    od: mm(r[0]) * Math.min(k, 1.08),
    thickness,
    bolts: r[2],
    boltDia: mm(r[3]),
    boltCircle: mm(r[4]) * Math.min(k, 1.08),
    hubLength: mm(r[5]) * k,
    hubDia: mm(r[6]),
    raisedFaceDia: mm(r[7]),
    length: mm(r[5]) * k,
  }
}

/** Gasket thickness between two flange faces (spiral wound) */
export const GASKET = 0.0045

/** Face-to-face length (B16.10 Class 300, flanged ends) */
const F2F: Partial<Record<ValveType, Record<number, number>>> = {
  gate: { 1: 165, 1.5: 191, 2: 216, 3: 283, 4: 305, 6: 403, 8: 419, 10: 457, 12: 502, 14: 762, 16: 838, 18: 914, 20: 991, 24: 1143 },
  ball: { 1: 165, 1.5: 191, 2: 216, 3: 283, 4: 305, 6: 403, 8: 502, 10: 568, 12: 648, 14: 762, 16: 838, 18: 914, 20: 991, 24: 1143 },
  globe: { 1: 216, 1.5: 241, 2: 267, 3: 318, 4: 356, 6: 444, 8: 559, 10: 622, 12: 711 },
  check: { 1: 216, 1.5: 241, 2: 267, 3: 318, 4: 356, 6: 444, 8: 533, 10: 622, 12: 711, 14: 838, 16: 864, 18: 978, 20: 1016, 24: 1346 },
  control: { 1: 210, 1.5: 251, 2: 282, 3: 337, 4: 394, 6: 508, 8: 610, 10: 752, 12: 819 },
  butterfly: { 2: 43, 3: 46, 4: 52, 6: 56, 8: 60, 10: 68, 12: 78, 14: 92, 16: 102, 18: 114, 20: 127, 24: 154 },
  needle: { 0.5: 110, 0.75: 120, 1: 140 },
}

export function valveLength(type: ValveType, nps: number) {
  const key: ValveType = type === 'esdv' || type === 'bdv' ? 'ball' : type
  const table = F2F[key] ?? F2F.gate!
  const sizes = Object.keys(table).map(Number)
  let best = sizes[0]
  for (const s of sizes) if (Math.abs(s - nps) < Math.abs(best - nps)) best = s
  return mm(table[best])
}

/**
 * Service colours. `paint` follows ISO 14726 identification bands (marine/offshore),
 * `flow` is a more saturated colour for the animated flow particles and UI swatches.
 */
export const SERVICE: Record<Service, { label: string; code: string; paint: string; flow: string }> = {
  multiphase: { label: 'Well fluids (multiphase)', code: 'PM', paint: '#6b4e2e', flow: '#c98b3a' },
  oil: { label: 'Crude oil', code: 'PO', paint: '#5c3d1e', flow: '#a8641e' },
  gas: { label: 'Hydrocarbon gas', code: 'PG', paint: '#c9a227', flow: '#f2c230' },
  water: { label: 'Produced water', code: 'PW', paint: '#3d7a4a', flow: '#3fb6a8' },
  flare: { label: 'Flare / relief', code: 'FL', paint: '#b0602a', flow: '#ff7a2f' },
  cooling: { label: 'Cooling medium', code: 'CM', paint: '#2f6f8f', flow: '#4aa8e0' },
  firewater: { label: 'Firewater', code: 'FW', paint: '#b3261e', flow: '#ff3b30' },
  chemical: { label: 'Chemical injection', code: 'CI', paint: '#6d4c8a', flow: '#b18cff' },
  drain: { label: 'Closed drain', code: 'CD', paint: '#3a3a3a', flow: '#8e8e93' },
  instrumentAir: { label: 'Instrument air', code: 'IA', paint: '#6fa8dc', flow: '#9fd0ff' },
}

/** Steel sections (metres): depth, flange width, web t, flange t */
export const SECTIONS = {
  'HEB 600': { d: 0.6, b: 0.3, tw: 0.0155, tf: 0.03 },
  'HEB 400': { d: 0.4, b: 0.3, tw: 0.0135, tf: 0.024 },
  'HEB 300': { d: 0.3, b: 0.3, tw: 0.011, tf: 0.019 },
  'HEB 200': { d: 0.2, b: 0.2, tw: 0.009, tf: 0.015 },
  'IPE 300': { d: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107 },
  'IPE 200': { d: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085 },
  'UPN 160': { d: 0.16, b: 0.065, tw: 0.0075, tf: 0.0105 },
} as const

export type SectionName = keyof typeof SECTIONS
