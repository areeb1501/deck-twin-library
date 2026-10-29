// IEC 60072-1 frame sizes and IEC 60034 / EN 50347 output assignment for TEFC (IC411) cage motors. Reference values — verify against the current edition.
import { mm } from './util'

export interface MotorFrame {
  frame: string
  kw: number
  poles: 2 | 4 | 6
  shaftHeight: number
  length: number
  width: number
  height: number
  shaftDia: number
  mass: number
}

export const IEC_POWERS: readonly number[] = [
  0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160,
  200, 250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000,
]

// Frame -> [H shaft height (exact, IEC 60072), typical: L overall, AC housing dia, A foot span, HD overall height,
// shaft dia 2-pole, shaft dia 4/6-pole, mass 4-pole kg]. mm.
type Row = [h: number, l: number, ac: number, a: number, hd: number, d2: number, d4: number, kg: number]
const FRAMES: Record<string, Row> = {
  '80M': [80, 300, 165, 125, 220, 19, 19, 12],
  '90S': [90, 330, 185, 140, 240, 24, 24, 15],
  '90L': [90, 355, 185, 140, 240, 24, 24, 18],
  '100L': [100, 390, 205, 160, 260, 28, 28, 24],
  '112M': [112, 400, 230, 190, 290, 28, 28, 32],
  '132S': [132, 460, 270, 216, 335, 38, 38, 50],
  '132M': [132, 500, 270, 216, 335, 38, 38, 62],
  '160M': [160, 610, 330, 254, 420, 42, 42, 105],
  '160L': [160, 650, 330, 254, 420, 42, 42, 120],
  '180M': [180, 680, 360, 279, 455, 48, 48, 160],
  '180L': [180, 720, 360, 279, 455, 48, 48, 180],
  '200L': [200, 770, 400, 318, 505, 55, 55, 230],
  '225S': [225, 820, 450, 356, 560, 55, 60, 290],
  '225M': [225, 850, 450, 356, 560, 55, 60, 320],
  '250M': [250, 930, 500, 406, 620, 60, 65, 400],
  '280S': [280, 1050, 560, 457, 690, 65, 75, 540],
  '280M': [280, 1100, 560, 457, 690, 65, 75, 600],
  '315S': [315, 1200, 630, 508, 850, 65, 80, 850],
  '315M': [315, 1300, 630, 508, 850, 65, 80, 1000],
  '315L': [315, 1400, 630, 508, 850, 65, 80, 1200],
  '355': [355, 1600, 710, 610, 1000, 75, 100, 1700],
  '400': [400, 1800, 800, 686, 1100, 80, 110, 2400],
  '450': [450, 2100, 900, 750, 1250, 90, 120, 3300],
}

// Output (kW) per frame. EN 50347 to frame 315; 355–450 are typical manufacturer assignments.
const OUTPUT: Record<2 | 4 | 6, [string, number[]][]> = {
  2: [
    ['80M', [0.75, 1.1]], ['90S', [1.5]], ['90L', [2.2]], ['100L', [3]], ['112M', [4]], ['132S', [5.5, 7.5]],
    ['160M', [11, 15]], ['160L', [18.5]], ['180M', [22]], ['200L', [30, 37]], ['225M', [45]], ['250M', [55]],
    ['280S', [75]], ['280M', [90]], ['315S', [110]], ['315M', [132]], ['315L', [160, 200]],
    ['355', [250, 315, 355]], ['400', [400, 450, 500]], ['450', [560, 630, 710, 800, 900, 1000]],
  ],
  4: [
    ['80M', [0.55, 0.75]], ['90S', [1.1]], ['90L', [1.5]], ['100L', [2.2, 3]], ['112M', [4]], ['132S', [5.5]],
    ['132M', [7.5]], ['160M', [11]], ['160L', [15]], ['180M', [18.5]], ['180L', [22]], ['200L', [30]],
    ['225S', [37]], ['225M', [45]], ['250M', [55]], ['280S', [75]], ['280M', [90]], ['315S', [110]],
    ['315M', [132]], ['315L', [160, 200]], ['355', [250, 315, 355]], ['400', [400, 450, 500]],
    ['450', [560, 630, 710, 800, 900, 1000]],
  ],
  6: [
    ['80M', [0.37, 0.55]], ['90S', [0.75]], ['90L', [1.1]], ['100L', [1.5]], ['112M', [2.2]], ['132S', [3]],
    ['132M', [4, 5.5]], ['160M', [7.5]], ['160L', [11]], ['180L', [15]], ['200L', [18.5, 22]], ['225M', [30]],
    ['250M', [37]], ['280S', [45]], ['280M', [55]], ['315S', [75]], ['315M', [90]], ['315L', [110, 132]],
    ['355', [160, 200, 250]], ['400', [315, 355, 400]], ['450', [450, 500, 560, 630]],
  ],
}

const MASS_K: Record<2 | 4 | 6, number> = { 2: 0.92, 4: 1, 6: 1.12 } // typical

/**
 * Smallest standard motor whose rated output covers `kw` (2 % tolerance), largest frame if none.
 * Shaft height is exact per IEC 60072; length, width, height, shaft dia and mass are typical cast-iron values.
 */
export function iecMotor(kw: number, poles: 2 | 4 | 6 = 4): MotorFrame {
  const p: 2 | 4 | 6 = poles === 2 || poles === 6 ? poles : 4
  const list = OUTPUT[p].flatMap(([frame, kws]) => kws.map((k) => [frame, k] as const))
  const need = Number.isFinite(kw) ? kw : 0
  const [frame, rated] = list.find(([, k]) => k >= need * 0.98) ?? list[list.length - 1]
  const [h, l, ac, a, hd, d2, d4, kg] = FRAMES[frame]
  return {
    frame,
    kw: rated,
    poles: p,
    shaftHeight: mm(h),
    length: mm(l),
    width: mm(Math.max(ac, a + 50)),
    height: mm(hd),
    shaftDia: mm(p === 2 ? d2 : d4),
    mass: kg * MASS_K[p],
  }
}
