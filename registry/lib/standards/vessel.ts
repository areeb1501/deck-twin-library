// ASME BPVC Section VIII Div. 1 pressure-vessel geometry helpers (UG-27, UG-32, UG-34) and typical layout rules. Reference values. Verify against the current edition.
import { mm } from './util'
import { flange } from './flange'
import type { Rating } from './flange'

export type HeadType = '2:1-ellipsoidal' | 'hemispherical' | 'torispherical' | 'flat'

/** ASME flanged & dished head: crown radius = Do, knuckle = 6 % Do. The inside diameter stands in for Do. */
export function torispherical(id: number): { crown: number; knuckle: number; depth: number } {
  const crown = id
  const knuckle = 0.06 * id
  const depth = crown - Math.sqrt((crown - knuckle) ** 2 - (id / 2 - knuckle) ** 2)
  return { crown, knuckle, depth }
}

/** Inside depth of a head (straight flange excluded). */
export function headDepth(type: HeadType, id: number): number {
  switch (type) {
    case '2:1-ellipsoidal':
      return id / 4
    case 'hemispherical':
      return id / 2
    case 'torispherical':
      return torispherical(id).depth
    default:
      return 0
  }
}

const PLATE_MM = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100]

/** Round up to the next standard plate thickness (beyond 100 mm, the next 5 mm). */
function plate(tM: number): number {
  const t = tM * 1000
  const p = PLATE_MM.find((s) => s >= t - 1e-9)
  return mm(p ?? Math.ceil(t / 5) * 5)
}

/** UG-27(c)(1) circumferential stress: t = PR/(SE − 0.6P) + CA. Defaults SA-516-70 (S = 138 MPa), E = 1, CA = 3 mm. */
export function shellThickness(pBarg: number, id: number, allowableMPa = 138, jointEff = 1, corrosion = 0.003): number {
  const p = Math.max(0, pBarg) * 0.1
  const r = id / 2 + corrosion
  const t = (p * r) / Math.max(1e-6, allowableMPa * jointEff - 0.6 * p) + corrosion
  return plate(t)
}

/** UG-32 formed heads (2:1, F&D with L = D and r = 6 %, hemi) and UG-34 flat heads (C = 0.33, typical). */
export function headThickness(
  type: HeadType,
  pBarg: number,
  id: number,
  allowableMPa = 138,
  jointEff = 1,
  corrosion = 0.003,
): number {
  const p = Math.max(0, pBarg) * 0.1
  const se = allowableMPa * jointEff
  const d = id + 2 * corrosion
  let t: number
  switch (type) {
    case '2:1-ellipsoidal':
      t = (p * d) / Math.max(1e-6, 2 * se - 0.2 * p)
      break
    case 'torispherical':
      t = (0.885 * p * d) / Math.max(1e-6, se - 0.1 * p)
      break
    case 'hemispherical':
      t = (p * (d / 2)) / Math.max(1e-6, 2 * se - 0.2 * p)
      break
    default:
      t = d * Math.sqrt((0.33 * p) / Math.max(1e-6, se))
  }
  return plate(t + corrosion)
}

/**
 * typical: minimum projection from the shell outside surface to the nozzle flange face. Covers the
 * weld-neck hub plus a short neck for stud removal (≈150–350 mm); insulated adds 75 mm.
 */
export function nozzleStandout(nps: number, rating: Rating = 300, insulated = false): number {
  const f = flange(nps, rating)
  const base = Math.max(0.15, 0.1 + f.hubLength + f.raisedFaceHeight)
  return base + (insulated ? 0.075 : 0)
}

/**
 * typical: horizontal-vessel saddles, Zick-style. A ≤ 0.2 L, preferably ≈ R/2 from the tangent line;
 * height is base plate underside to vessel centreline; wear plate angle (degrees) = 120° contact + θ/12.
 */
export function saddle(od: number, tt: number): { positionFromTangent: number; width: number; height: number; wearPlateAngle: number } {
  const r = od / 2
  const positionFromTangent = Math.min(0.2 * tt, Math.max(0.5 * r, 0.1 * tt))
  const width = Math.min(0.5, Math.max(0.15, 0.15 + 0.06 * od))
  const height = r + Math.max(0.3, 0.15 * od)
  return { positionFromTangent, width, height, wearPlateAngle: 130 }
}

/** typical: skirt height for a vertical vessel (bottom-head access and outlet piping). */
export function skirtHeight(id: number): number {
  return Math.min(4, Math.max(1.5, 1.2 + 0.5 * id))
}

export const MANWAY_NPS = 24 // typical
