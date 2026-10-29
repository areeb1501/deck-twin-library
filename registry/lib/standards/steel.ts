// Structural sections: EN 10365 (IPE, HEA, HEB, UPN), EN 10056-1 angles, EN 10210 hollow sections, AISC W-shapes. Reference values. Verify against the current edition.
import { inch, mm } from './util'

export interface Section {
  kind: 'I' | 'H' | 'U' | 'L' | 'CHS' | 'SHS' | 'RHS'
  d: number
  b: number
  tw: number
  tf: number
  r: number
  mass: number
}

type Kind = Section['kind']
// mm: [h, b, tw, tf, r, kg/m]
type Row = [h: number, b: number, tw: number, tf: number, r: number, m: number]

const IPE: Record<number, Row> = {
  80: [80, 46, 3.8, 5.2, 5, 6.0], 100: [100, 55, 4.1, 5.7, 7, 8.1], 120: [120, 64, 4.4, 6.3, 7, 10.4],
  140: [140, 73, 4.7, 6.9, 7, 12.9], 160: [160, 82, 5.0, 7.4, 9, 15.8], 180: [180, 91, 5.3, 8.0, 9, 18.8],
  200: [200, 100, 5.6, 8.5, 12, 22.4], 220: [220, 110, 5.9, 9.2, 12, 26.2], 240: [240, 120, 6.2, 9.8, 15, 30.7],
  270: [270, 135, 6.6, 10.2, 15, 36.1], 300: [300, 150, 7.1, 10.7, 15, 42.2], 330: [330, 160, 7.5, 11.5, 18, 49.1],
  360: [360, 170, 8.0, 12.7, 18, 57.1], 400: [400, 180, 8.6, 13.5, 21, 66.3], 450: [450, 190, 9.4, 14.6, 21, 77.6],
  500: [500, 200, 10.2, 16.0, 21, 90.7], 550: [550, 210, 11.1, 17.2, 24, 106], 600: [600, 220, 12.0, 19.0, 24, 122],
}

const HEA: Record<number, Row> = {
  100: [96, 100, 5, 8, 12, 16.7], 120: [114, 120, 5, 8, 12, 19.9], 140: [133, 140, 5.5, 8.5, 12, 24.7],
  160: [152, 160, 6, 9, 15, 30.4], 180: [171, 180, 6, 9.5, 15, 35.5], 200: [190, 200, 6.5, 10, 18, 42.3],
  220: [210, 220, 7, 11, 18, 50.5], 240: [230, 240, 7.5, 12, 21, 60.3], 260: [250, 260, 7.5, 12.5, 24, 68.2],
  280: [270, 280, 8, 13, 24, 76.4], 300: [290, 300, 8.5, 14, 27, 88.3], 320: [310, 300, 9, 15.5, 27, 97.6],
  340: [330, 300, 9.5, 16.5, 27, 105], 360: [350, 300, 10, 17.5, 27, 112], 400: [390, 300, 11, 19, 27, 125],
  450: [440, 300, 11.5, 21, 27, 140], 500: [490, 300, 12, 23, 27, 155], 550: [540, 300, 12.5, 24, 27, 166],
  600: [590, 300, 13, 25, 27, 178],
}

const HEB: Record<number, Row> = {
  100: [100, 100, 6, 10, 12, 20.4], 120: [120, 120, 6.5, 11, 12, 26.7], 140: [140, 140, 7, 12, 12, 33.7],
  160: [160, 160, 8, 13, 15, 42.6], 180: [180, 180, 8.5, 14, 15, 51.2], 200: [200, 200, 9, 15, 18, 61.3],
  220: [220, 220, 9.5, 16, 18, 71.5], 240: [240, 240, 10, 17, 21, 83.2], 260: [260, 260, 10, 17.5, 24, 93.0],
  280: [280, 280, 10.5, 18, 24, 103], 300: [300, 300, 11, 19, 27, 117], 320: [320, 300, 11.5, 20.5, 27, 127],
  340: [340, 300, 12, 21.5, 27, 134], 360: [360, 300, 12.5, 22.5, 27, 142], 400: [400, 300, 13.5, 24, 27, 155],
  450: [450, 300, 14, 26, 27, 171], 500: [500, 300, 14.5, 28, 27, 187], 550: [550, 300, 15, 29, 27, 199],
  600: [600, 300, 15.5, 30, 27, 212], 650: [650, 300, 16, 31, 27, 225], 700: [700, 300, 17, 32, 27, 241],
  800: [800, 300, 17.5, 33, 30, 262], 900: [900, 300, 18.5, 35, 30, 291], 1000: [1000, 300, 19, 36, 30, 314],
}

const UPN: Record<number, Row> = {
  80: [80, 45, 6, 8, 8, 8.64], 100: [100, 50, 6, 8.5, 8.5, 10.6], 120: [120, 55, 7, 9, 9, 13.4],
  140: [140, 60, 7, 10, 10, 16.0], 160: [160, 65, 7.5, 10.5, 10.5, 18.8], 180: [180, 70, 8, 11, 11, 22.0],
  200: [200, 75, 8.5, 11.5, 11.5, 25.3], 220: [220, 80, 9, 12.5, 12.5, 29.4], 240: [240, 85, 9.5, 13, 13, 33.2],
  260: [260, 90, 10, 14, 14, 37.9], 280: [280, 95, 10, 15, 15, 41.8], 300: [300, 100, 10, 16, 16, 46.2],
  320: [320, 100, 14, 17.5, 17.5, 59.5], 350: [350, 100, 14, 16, 16, 60.6], 380: [380, 102, 13.5, 16, 16, 63.1],
  400: [400, 110, 14, 18, 18, 71.8],
}

// Equal angles: [leg, t, root radius, kg/m]
const ANGLES: [number, number, number, number][] = [
  [50, 5, 7, 3.77], [60, 6, 8, 5.42], [70, 7, 9, 7.38], [75, 8, 9, 8.99], [80, 8, 10, 9.63], [90, 9, 11, 12.2],
  [100, 10, 12, 15.0], [120, 10, 13, 18.2], [120, 12, 13, 21.6], [150, 12, 16, 27.3], [150, 15, 16, 33.8],
  [200, 16, 18, 48.5], [200, 20, 18, 59.9],
]

// EN 10210 CHS [D, t] mm; mass computed at 7850 kg/m3.
const CHS: [number, number][] = [
  [60.3, 5], [88.9, 6.3], [114.3, 6.3], [139.7, 8], [168.3, 8], [219.1, 10], [273, 12.5], [323.9, 12.5],
  [355.6, 16], [406.4, 16], [457, 20], [508, 20], [610, 25], [711, 25], [762, 25], [813, 30], [914, 25], [914, 32],
]

// EN 10210 hot-finished SHS/RHS [H, B, t] mm; corner radii ro = 1.5t, ri = t; mass computed.
const BOX: [number, number, number][] = [
  [100, 100, 6.3], [150, 150, 8], [200, 200, 10], [250, 250, 12.5], [300, 300, 12.5], [400, 400, 16],
  [200, 100, 8], [300, 200, 10], [400, 200, 12.5],
]

// AISC W-shapes, inches: [d, bf, tw, tf, r, lb/ft]. approx: r = k_des − tf.
const W: Record<string, [number, number, number, number, number, number]> = {
  W8x31: [8.0, 8.0, 0.285, 0.435, 0.39, 31], W10x49: [9.98, 10.0, 0.34, 0.56, 0.5, 49],
  W12x65: [12.1, 12.0, 0.39, 0.605, 0.6, 65], W14x90: [14.0, 14.5, 0.44, 0.71, 0.6, 90],
  W16x67: [16.3, 10.2, 0.395, 0.665, 0.4, 67], W18x97: [18.6, 11.1, 0.535, 0.87, 0.4, 97],
  W21x111: [21.5, 12.3, 0.55, 0.875, 0.5, 111], W24x146: [24.7, 12.9, 0.65, 1.09, 0.5, 146],
  W27x178: [27.8, 14.1, 0.725, 1.19, 0.58, 178], W30x211: [30.9, 15.1, 0.775, 1.32, 0.79, 211],
  W36x300: [36.7, 16.7, 0.945, 1.68, 0.8, 300],
}

const fromRow = (kind: Kind, [h, b, tw, tf, r, m]: Row): Section =>
  ({ kind, d: mm(h), b: mm(b), tw: mm(tw), tf: mm(tf), r: mm(r), mass: m })

const fmt = (v: number) => String(v)

function build(): Record<string, Section> {
  const out: Record<string, Section> = {}
  for (const [n, r] of Object.entries(IPE)) out[`IPE ${n}`] = fromRow('I', r)
  for (const [n, r] of Object.entries(HEA)) out[`HEA ${n}`] = fromRow('H', r)
  for (const [n, r] of Object.entries(HEB)) out[`HEB ${n}`] = fromRow('H', r)
  for (const [n, r] of Object.entries(UPN)) out[`UPN ${n}`] = fromRow('U', r)
  for (const [a, t, r, m] of ANGLES) out[`L${a}x${a}x${t}`] = fromRow('L', [a, a, t, t, r, m])
  for (const [d, t] of CHS) {
    const mass = Math.PI * (d - t) * t * 7850e-6
    out[`CHS ${fmt(d)}x${fmt(t)}`] = { kind: 'CHS', d: mm(d), b: mm(d), tw: mm(t), tf: mm(t), r: 0, mass }
  }
  for (const [h, b, t] of BOX) {
    const area = 2 * t * (h + b - 2 * t) - (4 - Math.PI) * ((1.5 * t) ** 2 - t ** 2)
    const kind: Kind = h === b ? 'SHS' : 'RHS'
    out[`${kind} ${h}x${b}x${fmt(t)}`] = { kind, d: mm(h), b: mm(b), tw: mm(t), tf: mm(t), r: mm(1.5 * t), mass: area * 7850e-6 }
  }
  for (const [n, [d, bf, tw, tf, r, lb]] of Object.entries(W)) {
    out[n] = { kind: 'I', d: inch(d), b: inch(bf), tw: inch(tw), tf: inch(tf), r: inch(r), mass: lb * 1.48816 }
  }
  return out
}

export const SECTIONS: Record<string, Section> = build()

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/×/g, 'X')
const INDEX = new Map(Object.keys(SECTIONS).map((k) => [norm(k), k]))

/** Look up a section by name (case and spacing insensitive). Unknown names warn and return HEB 300. */
export function section(name: string): Section {
  const exact = SECTIONS[name]
  if (exact) return exact
  const key = INDEX.get(norm(String(name)))
  if (key) return SECTIONS[key]
  console.warn(`[standards] unknown section "${name}", using HEB 300`)
  return SECTIONS['HEB 300']
}

// typical offshore grating: 30 x 3 mm bearing bars at 30 mm pitch, cross bars at 100 mm; FRP 38 mm.
export const GRATING = { bearingBar: { h: 0.03, t: 0.003 }, pitch: 0.03, crossPitch: 0.1, frpThickness: 0.038 }
