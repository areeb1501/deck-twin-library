/**
 * The offshore operator's body and kit, as pieces per joint segment, at two levels of detail:
 *  - HI: the walk-mode avatar (scene/Avatar.tsx) — smooth limbs, sculpted head (jaw, brow, nose, ears, eyes),
 *    short haircut under the hat, FR coverall with seams / pockets / knee pads / retro tape, chin-strapped hard hat
 *    with ribs, lamp clip and parked ear defenders, wrap-around glasses, radio, 4-gas monitor at the collar,
 *    gloves with fingers and thumb, steel-toe boots with laces and a flexing toe;
 *  - LO: the CCTV-visible field workers (people/crowd.ts) — same profiles with few radial segments and only what
 *    reads at 10–25 m (tape, belt, hat, hair, vest, gas monitor, boots, gloves).
 *
 * Frames: every segment is built at its joint, the figure faces −Z, +X is the figure's right. Joint offsets
 * (below) are shared with the gait (people/gait.ts), the avatar rig and the instanced crowd.
 */
import * as THREE from 'three'
import { G, band, between, box, cyl, deform, ell, lathe, put, radiusAt, rbox, ribbon, smoothstep, sphere, surface, tube, withRows, type ColorFn, type P2, type Piece, type V3 } from './geom'

// ---------------------------------------------------------------- skeleton (m)
export const THIGH = 0.43
export const SHIN = 0.41
export const ANKLE_H = 0.09 // ankle joint above the sole
export const HIP_H = THIGH + SHIN + ANKLE_H // 0.93
export const HIP_X = 0.095
export const WAIST = 0.12 // spine joint above the hip joints
export const SHOULDER: [number, number] = [0.178, 0.39] // in the spine frame
export const NECK = 0.43
export const UPPER_ARM = 0.29
export const FOREARM = 0.245
/** sole contact points in the ankle frame: [forward, up]; the toe joint sits at the ball of the foot */
export const HEEL: [number, number] = [-0.075, -ANKLE_H]
export const BALL: [number, number] = [0.12, -ANKLE_H]
/** toe tip, forward of the ball */
export const TOE_TIP = 0.086

// ---------------------------------------------------------------- surfaces
export const S = {
  Cloth: 0,
  Tape: 1,
  Rubber: 2,
  Skin: 3,
  Plastic: 4,
  Lens: 5,
  Glove: 6,
  HiVis: 7,
  Leather: 8,
  Metal: 9,
  Hair: 10,
} as const
export const SLOT_COUNT = 11
export const PALETTE: Record<number, string> = {
  [S.Cloth]: '#de5f1a', // FR coverall, orange
  [S.Tape]: '#d3d8dc', // retroreflective tape
  [S.Rubber]: '#1f2125', // webbing, straps, soles, radio
  [S.Skin]: '#c48d6b',
  [S.Plastic]: '#f1f1ec', // hard hat
  [S.Lens]: '#2b3a42',
  [S.Glove]: '#3b4048', // nitrile palm
  [S.HiVis]: '#e4d51d', // glove backs, ear cups, torch
  [S.Leather]: '#3e2b1d', // boots
  [S.Metal]: '#a3a9af',
  [S.Hair]: '#2a2018',
}
/** workers: slots coloured per instance (1 = the mesh's instance colour, 2 = its accent) */
export const WORKER_TINT: Record<number, number> = { [S.Cloth]: 1, [S.Skin]: 1, [S.Hair]: 2 }

export interface Detail {
  hi: boolean
  /** radial segments: torso / pelvis / hat, limbs, small parts */
  big: number
  mid: number
  small: number
}
export const HI: Detail = { hi: true, big: 36, mid: 22, small: 12 }
export const LO: Detail = { hi: false, big: 12, mid: 8, small: 6 }

// colours used inside the builders (sRGB)
const C = {
  seam: 0.78,
  pocket: 0.93,
  gasBody: '#ffb10a',
  gasFace: '#14191c',
  display: '#1b3b2c',
  alarm: '#e0362c',
  earCup: '#e2c81a',
  sole: '#141414',
  midsole: '#3b3e43',
  lace: '#1b1a18',
  pad: '#2b2e33',
  vest: '#cfe62a',
  radio: '#25282d',
  sclera: '#d6cdc1',
  iris: '#2b1f17',
}

const ZERO = new THREE.Vector3()
/** rounded box (HI) or a plain box (LO: 12 triangles) */
const rb = (d: Detail, w: number, h: number, dd: number, r: number) => (d.hi ? rbox(w, h, dd, r) : box(w, h, dd))
/** sphere: HI segments, or a 6 × 4 LO sphere */
const sph = (d: Detail, r: number, w: number, h: number) => (d.hi ? sphere(r, w, h) : sphere(r, 6, 4))

// ---------------------------------------------------------------- pelvis (hips frame)
const PELVIS: P2[] = [[0, -0.13], [0.09, -0.12], [0.15, -0.08], [0.175, -0.02], [0.176, 0.04], [0.168, 0.1], [0.162, 0.15]]
const PELVIS_Z = 0.72
const seatDz = (x: number, y: number) => 0.16 * G(y, -0.035, 0.06) * (1 - 0.4 * G(x, 0, 0.022))
/** half-depth of the pelvis surface (back side includes the seat) */
const pelvisZ = (x: number, y: number, side: number) => {
  const r = radiusAt(PELVIS, y)
  const z0 = PELVIS_Z * Math.sqrt(Math.max(r * r - x * x, 0))
  return side > 0 ? z0 * (1 + seatDz(Math.abs(x), y)) : z0
}
/** place a geometry on a surface z = side·zf(x, y), tilted to its slope */
function onSurf(g: THREE.BufferGeometry, zf: (x: number, y: number, side: number) => number, x: number, y: number, depth: number, side: -1 | 1, lift = 0, roll = 0) {
  const e = 0.01
  const fy = (zf(x, y + e, side) - zf(x, y - e, side)) / (2 * e)
  const fx = (zf(x + e, y, side) - zf(x - e, y, side)) / (2 * e)
  const z = zf(x, y, side) + depth / 2 + lift
  return put(g, [x, y, side * z], [side * Math.atan(fy), -side * Math.atan(fx), roll])
}

export function pelvis(d: Detail, opts: { radioOnBelt?: boolean } = {}): Piece[] {
  const body = deform(ell(d.hi ? PELVIS : withRows(PELVIS, [0.07, 0.122]), 1, PELVIS_Z, d.big), (p) => {
    if (p.z > 0) p.z *= 1 + seatDz(Math.abs(p.x), p.y)
  })
  const p: Piece[] = [
    // LO: the belt is painted on
    [body, S.Cloth, d.hi ? undefined : { bands: [[0.07, 0.122, S.Rubber]] }],
    [onSurf(rb(d, 0.062, 0.046, 0.012, 0.004), pelvisZ, 0, 0.096, 0.012, -1, d.hi ? 0.006 : 0.002), S.Metal], // buckle
    [put(rb(d, 0.05, 0.1, 0.075, 0.012), [0.18, 0.035, 0.005], [0, 0, 0.06]), S.Rubber], // tool pouch (right hip)
  ]
  if (d.hi) p.push([band(PELVIS, 0.07, 0.122, 0.009, 1, PELVIS_Z, d.big), S.Rubber]) // belt
  if (opts.radioOnBelt) {
    // workers: radio holstered on the left hip
    p.push([put(rb(d, 0.04, 0.11, 0.062, 0.008), [-0.192, 0.03, 0.01], [0, 0, -0.05]), S.Rubber, { c: C.radio }])
    p.push([put(cyl(0.007, 0.008, 0.08, 5), [-0.195, 0.12, 0.025]), S.Rubber])
  } else {
    p.push([put(cyl(0.017, 0.017, 0.11, d.small), [-0.17, 0.035, 0.05], [0, 0, -0.08]), S.Rubber]) // torch holster (left hip)
    p.push([put(cyl(0.021, 0.019, 0.032, d.small), [-0.17, 0.1, 0.05]), S.HiVis]) // torch head
  }
  if (d.hi) {
    // hip pockets with flaps on the seat
    for (const s of [-1, 1] as const) {
      p.push([onSurf(rbox(0.105, 0.115, 0.008, 0.004), pelvisZ, s * 0.078, -0.015, 0.008, 1, 0.001), S.Cloth, { k: C.pocket }])
      p.push([onSurf(rbox(0.112, 0.03, 0.01, 0.004), pelvisZ, s * 0.078, 0.04, 0.01, 1, 0.002), S.Cloth, { k: 0.86 }])
    }
    // belt keeper loops
    for (const x of [-0.12, -0.05, 0.05, 0.12]) p.push([onSurf(box(0.012, 0.06, 0.006), pelvisZ, x, 0.096, 0.006, 1, 0.01), S.Cloth, { k: 0.9 }])
  }
  return p
}

// ---------------------------------------------------------------- torso (spine frame)
export const TORSO: P2[] = [[0.15, -0.035], [0.16, 0.06], [0.175, 0.16], [0.19, 0.26], [0.19, 0.33], [0.182, 0.385], [0.145, 0.425], [0.075, 0.448], [0, 0.452]]
export const TORSO_Z = 0.62
/** front: chest (pectorals) + belly; back: shoulder blades, a slight lumbar hollow */
function torsoDz(x: number, y: number, side: number) {
  const ax = Math.abs(x)
  return side < 0
    ? 0.017 * G(y, 0.3, 0.06) * smoothstep(0.0, 0.06, ax) * (1 - smoothstep(0.12, 0.17, ax)) + 0.008 * G(y, 0.12, 0.08)
    : 0.013 * G(y, 0.31, 0.07) * G(ax, 0.085, 0.05) - 0.007 * G(y, 0.08, 0.06)
}
/** half-depth of the torso surface at (x, y); side −1 front, +1 back */
export function torsoZ(x: number, y: number, side: number) {
  const r = radiusAt(TORSO, y)
  const zmax = TORSO_Z * r
  if (zmax <= 1e-6) return 0
  const z0 = TORSO_Z * Math.sqrt(Math.max(r * r - x * x, 0))
  return z0 + torsoDz(x, y, side) * (z0 / zmax)
}
const torsoShape = (p: THREE.Vector3) => {
  const zmax = TORSO_Z * radiusAt(TORSO, p.y)
  if (zmax <= 1e-6) return
  const side = p.z < 0 ? -1 : 1
  p.z += side * torsoDz(p.x, p.y, side) * Math.min(1, Math.abs(p.z) / zmax)
}
const torsoOut = (p: THREE.Vector3) => ZERO.set(p.x * 0.5, p.y - Math.min(p.y, 0.36), p.z)
/** points up the front (side −1) or back (+1) of the torso at x, from y0 over the top of the shoulder */
function overShoulder(x: number, side: -1 | 1, y0: number, lift: number, n: number): V3[] {
  let yTop = 0.45
  for (let y = 0.33; y <= 0.452; y += 0.002)
    if (radiusAt(TORSO, y) < Math.abs(x) + 0.004) {
      yTop = y
      break
    }
  const pts: V3[] = []
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((yTop - 0.008 - y0) * Math.sqrt(i / n)) // denser towards the curved top
    pts.push([x, y, side * (torsoZ(x, y, side) + lift)])
  }
  pts.push([x, yTop + lift, 0])
  return pts
}
/** a strip down the torso front/back surface at x between y0 and y1 */
function torsoLine(x: number, side: -1 | 1, y0: number, y1: number, lift: number, n: number): V3[] {
  const pts: V3[] = []
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n
    pts.push([x, y, side * (torsoZ(x, y, side) + lift)])
  }
  return pts
}
const tband = (y0: number, y1: number, out: number, d: Detail, rows = 3) => deform(band(TORSO, y0, y1, out, 1, TORSO_Z, d.big, rows), torsoShape)

export function torso(d: Detail, opts: { chestKit?: boolean } = {}): Piece[] {
  const tapes: [number, number][] = [
    [0.05, 0.1], // waist
    [0.235, 0.285], // chest
  ]
  const p: Piece[] = [
    // standing collar
    [put(lathe(d.hi ? [[0.079, 0.414], [0.092, 0.432], [0.099, 0.452], [0.091, 0.465], [0.077, 0.463], [0.07, 0.44]] : [[0.079, 0.414], [0.097, 0.452], [0.072, 0.462]], d.mid), [0, 0, 0.004], [0, 0, 0], [1, 1, 0.9]), S.Cloth, { k: 0.95 }],
  ]
  if (d.hi) {
    p.push([deform(ell(TORSO, 1, TORSO_Z, d.big), torsoShape), S.Cloth])
    for (const [a, b] of tapes) p.push([tband(a, b, 0.004, d), S.Tape])
  } else p.push([deform(ell(withRows(TORSO, tapes.flat()), 1, TORSO_Z, d.big), torsoShape), S.Cloth, { bands: tapes.map(([a, b]) => [a, b, S.Tape]) }])
  // reflective braces over the shoulders, front and back
  const n = d.hi ? 6 : 1
  for (const x of [-0.126, 0.126])
    for (const side of [-1, 1] as const) for (const g of ribbon(overShoulder(x, side, 0.282, 0.003, n), [1, 0, 0], 0.046, 0.004, torsoOut)) p.push([g, S.Tape])
  // zip placket
  for (const g of ribbon(torsoLine(0, -1, -0.03, 0.43, 0.002, d.hi ? 8 : 1), [1, 0, 0], 0.024, 0.004, torsoOut)) p.push([g, S.Cloth, { k: 0.84 }])
  if (d.hi) {
    p.push([onSurf(box(0.012, 0.026, 0.006), torsoZ, 0.006, 0.405, 0.006, -1, 0.005), S.Metal]) // zip pull
    // chest pockets with flaps
    for (const s of [-1, 1]) {
      p.push([onSurf(rbox(0.104, 0.072, 0.008, 0.003), torsoZ, s * 0.094, 0.318, 0.008, -1, 0), S.Cloth, { k: C.pocket }])
      p.push([onSurf(rbox(0.11, 0.03, 0.011, 0.004), torsoZ, s * 0.094, 0.352, 0.011, -1, 0.001), S.Cloth, { k: 0.86 }])
    }
    // back yoke seam + side seams
    const yoke: V3[] = []
    for (let i = 0; i <= 8; i++) {
      const x = -0.165 + (0.33 * i) / 8
      yoke.push([x, 0.372, torsoZ(x, 0.372, 1) + 0.001])
    }
    for (const g of ribbon(yoke, [0, 1, 0], 0.01, 0.003, torsoOut)) p.push([g, S.Cloth, { k: C.seam }])
    for (const s of [-1, 1]) {
      const side: V3[] = []
      for (let i = 0; i <= 5; i++) {
        const y = 0.0 + (0.36 * i) / 5
        side.push([s * (radiusAt(TORSO, y) + 0.001), y, 0])
      }
      for (const g of ribbon(side, [0, 0, 1], 0.01, 0.003, (q) => ZERO.set(q.x, 0, 0))) p.push([g, S.Cloth, { k: C.seam }])
    }
  }
  if (opts.chestKit) {
    // radio clipped over the left chest pocket: body, speaker grille, display, PTT, channel knob, stubby antenna
    const rx = -0.094
    const ry = 0.3
    p.push([onSurf(rbox(0.058, 0.11, 0.034, 0.01), torsoZ, rx, ry, 0.034, -1, 0.006), S.Rubber, { c: C.radio }])
    p.push([onSurf(rbox(0.044, 0.046, 0.004, 0.002), torsoZ, rx, ry - 0.02, 0.004, -1, 0.04), S.Rubber, { k: 0.6 }])
    p.push([onSurf(box(0.032, 0.016, 0.003), torsoZ, rx, ry + 0.03, 0.003, -1, 0.04), S.Lens, { c: C.display }])
    p.push([onSurf(rbox(0.008, 0.032, 0.014, 0.003), torsoZ, rx + 0.032, ry + 0.012, 0.014, -1, 0.016), S.HiVis])
    const top = -torsoZ(rx, ry + 0.055, -1) - 0.03
    p.push([put(cyl(0.008, 0.008, 0.016, 8), [rx + 0.014, ry + 0.065, top]), S.Rubber])
    p.push([put(cyl(0.0065, 0.008, 0.085, 8), [rx - 0.014, ry + 0.098, top]), S.Rubber])
    p.push([put(sphere(0.0068, 8, 6), [rx - 0.014, ry + 0.141, top]), S.Rubber])
    p.push(...gasMonitor(d, 0.003))
  }
  return p
}

/** personal 4-gas monitor clipped at the right collar (bright housing, dark bezel + display, alarm bar, clip) */
export function gasMonitor(d: Detail, lift: number, big = false): Piece[] {
  const [w, h, t] = big ? [0.07, 0.1, 0.036] : [0.052, 0.085, 0.028]
  const x = 0.07
  const y = 0.392
  const p: Piece[] = [
    [onSurf(rb(d, w, h, t, 0.009), torsoZ, x, y, t, -1, lift), S.Plastic, { c: C.gasBody }],
    [onSurf(rb(d, w * 0.82, h * 0.52, 0.006, 0.002), torsoZ, x, y + h * 0.08, 0.006, -1, lift + t - 0.002), S.Rubber, { c: C.gasFace }],
    [onSurf(box(w * 0.76, h * 0.06, 0.006), torsoZ, x, y + h * 0.43, 0.006, -1, lift + t - 0.004), S.Plastic, { c: C.alarm }],
  ]
  if (d.hi) {
    p.push([onSurf(box(w * 0.6, h * 0.26, 0.003), torsoZ, x, y + h * 0.12, 0.003, -1, lift + t + 0.003), S.Lens, { c: C.display }])
    p.push([onSurf(box(w * 0.5, h * 0.12, 0.004), torsoZ, x, y - h * 0.3, 0.004, -1, lift + t - 0.001), S.Rubber, { k: 0.5 }]) // sensor grille
    p.push([onSurf(box(0.016, 0.034, 0.006), torsoZ, x, y + h * 0.42, 0.006, -1, lift - 0.004), S.Metal]) // crocodile clip
  }
  return p
}

/** hi-vis vest over the torso: fluorescent body, shoulder straps, two bands + braces of retro tape */
export const VEST_OUT = 0.014
export function vest(d: Detail): Piece[] {
  const tapes: [number, number][] = [
    [0.095, 0.14],
    [0.205, 0.25],
  ]
  const p: Piece[] = []
  if (d.hi) {
    p.push([tband(0.025, 0.37, VEST_OUT, d, 6), S.HiVis, { c: C.vest }])
    for (const [a, b] of tapes) p.push([tband(a, b, VEST_OUT + 0.005, d), S.Tape])
  } else p.push([deform(band(TORSO, 0.025, 0.37, VEST_OUT, 1, TORSO_Z, d.big, 2, tapes.flat()), torsoShape), S.HiVis, { c: C.vest, bands: tapes.map(([a, b]) => [a, b, S.Tape]) }])
  const n = d.hi ? 6 : 1
  for (const x of [-0.108, 0.108])
    for (const side of [-1, 1] as const) {
      for (const g of ribbon(overShoulder(x, side, 0.33, VEST_OUT - 0.002, n), [1, 0, 0], 0.088, 0.006, torsoOut)) p.push([g, S.HiVis, { c: C.vest }])
      if (d.hi) for (const g of ribbon(overShoulder(x, side, 0.25, VEST_OUT + 0.005, n), [1, 0, 0], 0.048, 0.004, torsoOut)) p.push([g, S.Tape])
    }
  // front closure
  if (d.hi) for (const g of ribbon(torsoLine(0, -1, 0.03, 0.37, VEST_OUT + 0.004, 2), [1, 0, 0], 0.014, 0.004, torsoOut)) p.push([g, S.HiVis, { c: C.vest, k: 0.8 }])
  return p
}

// ---------------------------------------------------------------- neck + head (neck frame)
/** cranium centre in the neck frame */
const HC: V3 = [0, 0.168, -0.008]
const HR: V3 = [0.079, 0.112, 0.1]
/** the sculpted head as a parametric surface: u around (0 = front), v from the crown (0) to under the jaw (π) */
function headAt(u: number, v: number, off: number, out: THREE.Vector3) {
  const sv = Math.sin(v)
  let x = Math.sin(u) * sv * HR[0]
  let y = Math.cos(v) * HR[1]
  let z = -Math.cos(u) * sv * HR[2]
  if (z > 0) z *= 1 + 0.07 * smoothstep(-0.07, 0.02, y) // fuller occiput
  x *= 1 + 0.05 * G(y, 0.03, 0.05) // widest above the ears
  const low = smoothstep(-0.005, -0.105, y)
  x *= 1 - 0.3 * low * (z < 0 ? 1 : 0.75) // jaw narrows
  if (z > 0) z *= 1 - 0.5 * smoothstep(-0.02, -0.11, y) // back of the jaw tucks into the neck
  if (z < 0) {
    const ax = Math.abs(x)
    z *= 1 - 0.05 * smoothstep(0.03, 0.09, y) // sloping forehead
    z -= 0.0065 * G(y, 0.034, 0.012) * G(ax, 0.03, 0.032) // brow ridge
    z += 0.0095 * G(ax, 0.031, 0.015) * G(y, 0.011, 0.012) // eye sockets
    z -= 0.006 * G(ax, 0.046, 0.018) * G(y, -0.022, 0.018) // cheekbones
    z -= 0.009 * G(ax, 0, 0.026) * G(y, -0.056, 0.022) // mouth
    z -= 0.011 * G(ax, 0, 0.022) * G(y, -0.093, 0.016) // chin
    z -= 0.004 * G(ax, 0, 0.012) * G(y, 0.012, 0.014) // nose root
  }
  if (off) {
    const l = Math.hypot(x, y, z)
    const k = (l + off) / l
    x *= k
    y *= k
    z *= k
  }
  out.set(x + HC[0], y + HC[1], z + HC[2])
}
/** hairline: polar angle where the hair ends, by |azimuth| (0 front … π back) */
const HAIRLINE: [number, number][] = [[0, 0.6], [0.8, 0.74], [1.12, 1.18], [1.3, 1.56], [1.44, 1.52], [1.56, 1.3], [1.76, 1.32], [1.96, 1.52], [2.4, 1.86], [Math.PI, 1.98]]
function hairline(u: number) {
  const a = Math.abs(Math.atan2(Math.sin(u), Math.cos(u)))
  for (let i = 1; i < HAIRLINE.length; i++) {
    const [a0, v0] = HAIRLINE[i - 1]
    const [a1, v1] = HAIRLINE[i]
    if (a <= a1) {
      const t = (a - a0) / (a1 - a0)
      return v0 + (v1 - v0) * t * t * (3 - 2 * t)
    }
  }
  return HAIRLINE[HAIRLINE.length - 1][1]
}

const RED = new THREE.Color('#bf6a58')
const LIP = new THREE.Color('#9b5549')
const STUBBLE = new THREE.Color('#5d4c43')
const skinFn: ColorFn = (p, _n, c) => {
  const x = p.x - HC[0]
  const y = p.y - HC[1]
  const z = p.z - HC[2]
  const ax = Math.abs(x)
  const front = smoothstep(-0.02, -0.075, z)
  c.multiplyScalar(1 + 0.035 * Math.sin(x * 90 + y * 47) * Math.sin(z * 73 - y * 31))
  const flush = front * (0.55 * G(ax, 0.045, 0.02) * G(y, -0.028, 0.02) + 0.6 * G(ax, 0, 0.014) * G(y, -0.035, 0.016)) + 0.45 * G(ax, 0.083, 0.012) * G(y, -0.008, 0.035)
  c.lerp(RED, Math.min(1, flush) * 0.35)
  const lip = front * G(ax, 0, 0.021) * G(y, -0.057, 0.0068)
  const beard = smoothstep(-0.032, -0.055, y) * smoothstep(0.035, -0.015, z) * (1 - lip) + front * 0.7 * G(y, -0.046, 0.006) * G(ax, 0, 0.022)
  c.lerp(STUBBLE, Math.min(1, beard) * 0.2)
  c.lerp(LIP, lip * 0.55)
  c.multiplyScalar(1 - 0.4 * front * G(ax, 0, 0.018) * G(y, -0.0572, 0.0016)) // mouth line
  c.multiplyScalar(1 - 0.12 * front * G(ax, 0.031, 0.017) * G(y, 0.006, 0.012)) // under-eye shade
}
const earFn = (s: number): ColorFn => (_p, n, c) => {
  c.lerp(RED, 0.18)
  if (n.x * s > 0.4) c.multiplyScalar(0.86) // the concha side
}

export function neckHead(d: Detail, opts: { hairTop?: number } = {}): Piece[] {
  const hairTop = opts.hairTop ?? 0.005
  const hi = d.hi
  const neck = put(lathe(hi ? [[0.054, -0.035], [0.051, 0.03], [0.049, 0.08], [0.05, 0.12], [0.044, 0.155]] : [[0.053, -0.035], [0.049, 0.06], [0.046, 0.155]], hi ? d.mid : 6), [0, 0, 0.002], [-0.12, 0, 0], [1, 1, 0.94])
  const head = surface((u, v, o) => headAt(u, v, 0, o), -Math.PI, Math.PI, hi ? 52 : 10, () => 0, () => Math.PI, hi ? 38 : 7, HC)
  const hair = surface(
    (u, v, o) => {
      const t = v / hairline(u)
      headAt(u, v, 0.0022 + (hairTop - 0.0022) * (1 - t * t), o)
    },
    -Math.PI,
    Math.PI,
    hi ? 48 : 9,
    () => 0,
    hairline,
    hi ? 14 : 3,
    HC,
  )
  const [, hy, hz] = HC
  const p: Piece[] = [
    [neck, S.Skin],
    [head, S.Skin, hi ? { fn: skinFn } : undefined],
    [hair, S.Hair, hi ? { fn: (q, _n, c) => c.multiplyScalar(0.92 + 0.08 * Math.sin(q.x * 400 + q.z * 260)) } : undefined],
  ]
  // ears
  for (const s of [-1, 1]) p.push([put(sphere(1, hi ? 14 : 5, hi ? 10 : 3), [s * 0.0815, hy - 0.008, hz + 0.012], [0.18, 0, -s * 0.2], [0.012, 0.031, 0.02]), S.Skin, hi ? { fn: earFn(s) } : undefined])
  if (hi) {
    // nose: dorsum, tip, alae
    p.push([put(sphere(1, 14, 10), [0, hy - 0.019, hz - 0.0885], [0.38, 0, 0], [0.0098, 0.027, 0.0108]), S.Skin, { fn: skinFn }])
    p.push([put(sphere(0.0094, 12, 8), [0, hy - 0.039, hz - 0.0985]), S.Skin, { fn: skinFn }])
    for (const s of [-1, 1]) p.push([put(sphere(0.0076, 10, 6), [s * 0.0108, hy - 0.0425, hz - 0.0925], [0, 0, 0], [1, 0.8, 1]), S.Skin, { fn: skinFn }])
    // eyes (sclera, iris), upper lids, brows
    for (const s of [-1, 1]) {
      const eye: V3 = [s * 0.031, hy + 0.011, hz - 0.0768]
      p.push([put(sphere(0.012, 14, 10), eye), S.Plastic, { c: C.sclera }])
      p.push([put(sphere(0.0052, 12, 8), [eye[0], eye[1], eye[2] - 0.0115], [0, 0, 0], [1, 1, 0.45]), S.Plastic, { c: C.iris }])
      // upper and lower lids leave an almond-shaped opening
      p.push([put(new THREE.SphereGeometry(0.0131, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), eye, [-0.3, 0, 0]), S.Skin, { fn: skinFn }])
      p.push([put(new THREE.SphereGeometry(0.0129, 14, 4, 0, Math.PI * 2, Math.PI * 0.66, Math.PI * 0.34), eye, [0.25, 0, 0]), S.Skin, { fn: skinFn }])
      p.push([put(rbox(0.033, 0.0075, 0.009, 0.003), [s * 0.033, hy + 0.033, hz - 0.0925], [0, s * 0.3, -s * 0.12]), S.Hair])
    }
  } else {
    p.push([put(sphere(1, 6, 4), [0, hy - 0.025, hz - 0.095], [0.42, 0, 0], [0.012, 0.03, 0.016]), S.Skin])
    // eyebrow / eye shadow band reads as a face at a distance
    for (const s of [-1, 1]) p.push([put(box(0.026, 0.008, 0.006), [s * 0.031, hy + 0.026, hz - 0.091], [0, s * 0.3, 0]), S.Hair])
  }
  return p
}

/** wrap-around safety glasses: smoke lens, top frame, temples */
export function glasses(d: Detail): Piece[] {
  const [, hy, hz] = HC
  const seg = d.hi ? 22 : 8
  const p: Piece[] = [[put(new THREE.CylinderGeometry(0.104, 0.104, 0.034, seg, 1, true, Math.PI - 0.95, 1.9), [0, hy + 0.012, hz + 0.004], [0, 0, 0], [0.9, 1, 1]), S.Lens]]
  if (d.hi) {
    p.push([put(new THREE.CylinderGeometry(0.1065, 0.1065, 0.007, seg, 1, false, Math.PI - 0.97, 1.94), [0, hy + 0.029, hz + 0.004], [0, 0, 0], [0.9, 1, 1]), S.Rubber])
    for (const s of [-1, 1]) p.push([between([s * 0.077, hy + 0.025, hz - 0.058], [s * 0.088, hy + 0.019, hz + 0.034], 0.0032, 5, false), S.Rubber])
  }
  return p
}

// ---------------------------------------------------------------- hard hat (neck frame)
const HAT_C: V3 = [0, 0, -0.004]
const HAT_SX = 0.87
const SHELL: P2[] = [[0.13, 0.212], [0.131, 0.232], [0.125, 0.268], [0.106, 0.302], [0.068, 0.322], [0, 0.329]]
/** a point on the hat shell at (x, y) on the front (−1) or back (+1) */
function shellZ(x: number, y: number, side: number) {
  const r = radiusAt(SHELL, y)
  return HAT_C[2] + side * Math.sqrt(Math.max(r * r - (x / HAT_SX) ** 2, 0))
}
/** chin-strapped cap-style hard hat: shell, gutter rim, front peak, ribs, harness band, lamp + cable clips, parked ear defenders */
export function hardHat(d: Detail): Piece[] {
  const sc = [HAT_SX, 1, 1]
  const hat = { t: 1 } // workers: hat colour per instance
  const hs = d.hi ? d.big : 10
  const p: Piece[] = [
    [put(lathe(SHELL, hs), HAT_C, [0, 0, 0], sc), S.Plastic, hat],
    // rain gutter rim (closed profile: bottom → outer → top → inner)
    [put(lathe(d.hi ? [[0.128, 0.209], [0.14, 0.207], [0.142, 0.214], [0.131, 0.222], [0.128, 0.209]] : [[0.128, 0.209], [0.141, 0.208], [0.131, 0.222]], hs), HAT_C, [0, 0, 0], sc), S.Plastic, hat],
  ]
  // headband of the suspension, visible under the rim
  if (d.hi) p.push([put(lathe([[0.1, 0.194], [0.102, 0.215]], hs), HAT_C, [0, 0, 0], [0.84, 1, 1]), S.Rubber])
  // front peak, tapering into the rim at its ends
  const peak = lathe([[0.128, 0.211], [0.172, 0.197], [0.175, 0.203], [0.131, 0.224], [0.128, 0.211]], d.hi ? 24 : 6, Math.PI - 0.95, 1.9)
  p.push([
    deform(put(peak, HAT_C, [0, 0, 0], sc), (q) => {
      const ux = q.x / HAT_SX
      const uz = q.z - HAT_C[2]
      const a = Math.abs(Math.atan2(ux, -uz))
      const r = Math.hypot(ux, uz)
      const k = smoothstep(0.95, 0.45, a)
      const r2 = 0.13 + (r - 0.13) * k
      q.x = (ux / r) * r2 * HAT_SX
      q.z = (uz / r) * r2 + HAT_C[2]
      q.y += (1 - k) * 0.006
    }),
    S.Plastic,
    hat,
  ])
  // ribs: one over the crown, two shallow side ribs (hi)
  const ribXs = d.hi ? [0, -0.045, 0.045] : [0]
  for (const x of ribXs) {
    // the crown height at x (where the shell radius meets |x|)
    let yTop = SHELL[SHELL.length - 1][1]
    for (let y = 0.3; y <= yTop; y += 0.0005)
      if (radiusAt(SHELL, y) * HAT_SX < Math.abs(x)) {
        yTop = y
        break
      }
    const n = d.hi ? 7 : 2
    const ys = (i: number) => 0.222 + (yTop - 0.004 - 0.222) * Math.sin(((i / n) * Math.PI) / 2)
    const pts: V3[] = []
    for (let i = 0; i <= n; i++) pts.push([x, ys(i), shellZ(x, ys(i), -1)])
    pts.push([x, yTop, HAT_C[2]])
    for (let i = n; i >= 0; i--) pts.push([x, ys(i), shellZ(x, ys(i), 1)])
    // a tube centred on the shell surface → a rounded ridge
    p.push([tube(pts, x === 0 ? 0.0065 : 0.0042, d.hi ? 40 : 6, d.hi ? 8 : 4), S.Plastic, hat])
  }
  // ear defenders parked up against the shell: arm, cup, cushion
  for (const s of [-1, 1]) {
    const tilt = 0.5
    const cup: V3 = [s * 0.126, 0.256, 0.036]
    p.push([between([s * 0.113, 0.222, -0.004], cup, 0.004, d.hi ? 6 : 4, false), S.Rubber])
    p.push([put(cyl(0.031, 0.035, 0.026, d.hi ? 18 : 8), cup, [0, 0, s * (Math.PI / 2 - tilt)]), S.HiVis, { c: C.earCup }])
    if (d.hi) {
      // cushion ring on the inner face, against the shell
      const ci: V3 = [cup[0] - s * 0.015 * Math.cos(tilt), cup[1] - 0.015 * Math.sin(tilt), cup[2]]
      p.push([new THREE.TorusGeometry(0.024, 0.007, 6, 18).rotateY(Math.PI / 2).rotateZ(-s * tilt).translate(ci[0], ci[1], ci[2]), S.Rubber])
    }
  }
  if (d.hi) {
    // lamp clip (front) and cable clip (back)
    const fy = 0.256
    const fz = shellZ(0, fy, -1)
    p.push([put(rbox(0.032, 0.024, 0.012, 0.004), [0, fy, fz - 0.004], [-0.5, 0, 0]), S.Rubber])
    p.push([put(box(0.012, 0.018, 0.006), [0, fy + 0.004, fz - 0.011], [-0.5, 0, 0]), S.Metal])
    const by = 0.248
    p.push([put(rbox(0.026, 0.02, 0.01, 0.003), [0, by, shellZ(0, by, 1) + 0.003], [0.5, 0, 0]), S.Rubber])
    // chin strap from the harness, in front of the ears, under the chin
    for (const s of [-1, 1])
      p.push([
        tube(
          [
            [s * 0.097, 0.206, -0.002],
            [s * 0.086, 0.16, -0.022],
            [s * 0.062, 0.106, -0.04],
            [s * 0.031, 0.068, -0.062],
            [0, 0.059, -0.068],
          ],
          0.0034,
          12,
          5,
        ),
        S.Rubber,
      ])
    p.push([put(rbox(0.012, 0.022, 0.008, 0.003), [0.084, 0.153, -0.024], [0, 0, 0.3]), S.Rubber]) // strap buckle
  }
  return p
}

// ---------------------------------------------------------------- arms (shoulder / elbow / wrist frames)
const UPPER: P2[] = [[0.047, -0.3], [0.049, -0.27], [0.055, -0.17], [0.058, -0.07], [0.058, 0.0]]
const UPPER_LO: P2[] = [[0.047, -0.3], [0.056, -0.15], [0.058, 0.0]]
const seamOut = (q: THREE.Vector3) => ZERO.set(q.x, 0, q.z)
/** a seam down the outer side (+X) of a limb profile */
function sideSeam(pts: P2[], y0: number, y1: number, n = 5): THREE.BufferGeometry[] {
  const line: V3[] = []
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n
    line.push([radiusAt(pts, y) + 0.001, y, 0])
  }
  return ribbon(line, [0, 0, 1], 0.009, 0.003, seamOut)
}
export function upperArm(d: Detail): Piece[] {
  const p: Piece[] = [[put(d.hi ? sphere(0.06, d.mid, 14) : sphere(0.06, 6, 4), [0.006, -0.032, 0], [0, 0, 0], [1, 1.28, 1.06]), S.Cloth]] // deltoid
  if (d.hi) {
    p.push([lathe(UPPER, d.mid), S.Cloth], [band(UPPER, -0.165, -0.115, 0.004, 1, 1, d.mid), S.Tape])
    for (const g of sideSeam(UPPER, -0.06, -0.29)) p.push([g, S.Cloth, { k: C.seam }])
  } else
    p.push([
      lathe(withRows(UPPER_LO, [-0.215, -0.165, -0.115, -0.06]), d.mid),
      S.Cloth,
      // workers: accent sleeve panel (navy hi-vis) under the tape
      { bands: [[-0.215, -0.06, S.Cloth, { t: 2 }], [-0.165, -0.115, S.Tape]] },
    ])
  return p
}
const FORE: P2[] = [[0.043, -0.245], [0.041, -0.225], [0.042, -0.18], [0.047, -0.08], [0.049, 0.0]]
const FORE_LO: P2[] = [[0.042, -0.245], [0.043, -0.16], [0.049, 0.0]]
export function forearm(d: Detail): Piece[] {
  const p: Piece[] = [[sph(d, 0.048, d.mid, 12), S.Cloth]] // elbow
  if (d.hi) {
    p.push([lathe(FORE, d.mid), S.Cloth])
    p.push([band(FORE, -0.245, -0.21, 0.004, 1, 1, d.mid), S.Cloth, { k: 0.85 }]) // cuff
    p.push([band(FORE, -0.155, -0.105, 0.004, 1, 1, d.mid), S.Tape])
    for (const g of sideSeam(FORE, -0.02, -0.2, 4)) p.push([g, S.Cloth, { k: C.seam }])
  } else p.push([lathe(withRows(FORE_LO, [-0.155, -0.105]), d.mid), S.Cloth, { bands: [[-0.155, -0.105, S.Tape]] }])
  return p
}
/** right glove hanging relaxed: palm toward the body (−X), thumb forward (−Z), fingers slightly curled */
export function hand(d: Detail): Piece[] {
  const p: Piece[] = [
    [put(cyl(0.04, 0.043, 0.055, d.hi ? d.mid : 6, !d.hi), [0, -0.01, 0]), S.Glove], // knit cuff
    [put(rb(d, 0.03, 0.09, 0.08, 0.013), [0, -0.077, 0]), S.Glove], // palm
    [put(d.hi ? rbox(0.008, 0.078, 0.072, 0.003, 1) : box(0.008, 0.078, 0.072), [0.0135, -0.078, 0]), S.HiVis], // hi-vis back
  ]
  if (d.hi) {
    const zs = [-0.0275, -0.009, 0.009, 0.0265]
    const len = [0.072, 0.08, 0.075, 0.06]
    zs.forEach((z, i) => {
      const L = len[i]
      const a: V3 = [0.002, -0.114, z]
      const c1 = 0.22
      const b: V3 = [a[0] - Math.sin(c1) * L * 0.55, a[1] - Math.cos(c1) * L * 0.55, z]
      const c2 = 0.78
      const c: V3 = [b[0] - Math.sin(c2) * L * 0.45, b[1] - Math.cos(c2) * L * 0.45, z]
      p.push([between(a, b, 0.0098, 7), S.Glove], [between(b, c, 0.0092, 7), S.Glove])
    })
    p.push([put(rbox(0.012, 0.022, 0.076, 0.005), [0.013, -0.112, 0]), S.Rubber, { c: C.pad }]) // knuckle guard
    p.push([between([-0.006, -0.05, -0.036], [-0.019, -0.084, -0.052], 0.0118, 7), S.Glove])
    p.push([between([-0.019, -0.084, -0.052], [-0.03, -0.106, -0.049], 0.0105, 7), S.Glove])
  } else {
    p.push([put(box(0.026, 0.066, 0.076), [-0.008, -0.148, 0], [0, 0, -0.25]), S.Glove]) // fingers (mitten)
    p.push([between([-0.008, -0.055, -0.036], [-0.026, -0.1, -0.05], 0.011, 4, false), S.Glove]) // thumb
  }
  return p
}

// ---------------------------------------------------------------- legs (hip / knee / ankle / toe frames)
const THIGH_P: P2[] = [[0.064, -0.43], [0.07, -0.36], [0.082, -0.2], [0.089, -0.06], [0.09, 0.03], [0.085, 0.08]]
const THIGH_LO: P2[] = [[0.064, -0.43], [0.08, -0.22], [0.09, 0.0], [0.085, 0.08]]
export function thigh(d: Detail): Piece[] {
  const p: Piece[] = [[lathe(d.hi ? THIGH_P : THIGH_LO, d.mid), S.Cloth]]
  if (d.hi) {
    // cargo pocket with flap on the outer thigh, seam down the side
    p.push([put(rbox(0.016, 0.15, 0.13, 0.005), [radiusAt(THIGH_P, -0.21) + 0.004, -0.21, 0.004]), S.Cloth, { k: C.pocket }])
    p.push([put(rbox(0.02, 0.036, 0.136, 0.005), [radiusAt(THIGH_P, -0.132) + 0.008, -0.132, 0.004]), S.Cloth, { k: 0.86 }])
    for (const g of sideSeam(THIGH_P, 0.0, -0.1, 2)) p.push([g, S.Cloth, { k: C.seam }])
    for (const g of sideSeam(THIGH_P, -0.3, -0.42, 2)) p.push([g, S.Cloth, { k: C.seam }])
  }
  return p
}
const SHIN_P: P2[] = [[0.064, -0.338], [0.06, -0.31], [0.056, -0.24], [0.057, -0.13], [0.059, -0.04], [0.06, 0.0]]
const SHIN_LO: P2[] = [[0.064, -0.338], [0.057, -0.24], [0.06, 0.0]]
export function shin(d: Detail): Piece[] {
  const tapes: [number, number][] = [
    [-0.205, -0.16],
    [-0.29, -0.245],
  ]
  const p: Piece[] = [
    [sph(d, 0.062, d.mid, 12), S.Cloth], // knee
    // knee pad
    [put(sph(d, 1, d.mid, 12), [0, -0.035, -0.05], [0.12, 0, 0], [0.058, 0.08, 0.03]), S.Rubber, { c: C.pad }],
  ]
  if (d.hi) {
    p.push([lathe(SHIN_P, d.mid), S.Cloth])
    for (const [a, b] of tapes) p.push([band(SHIN_P, a, b, 0.004, 1, 1, d.mid), S.Tape])
    p.push([band(SHIN_P, -0.1, -0.084, 0.006, 1, 1, d.mid), S.Rubber, { c: C.pad }]) // pad strap
    for (const g of sideSeam(SHIN_P, -0.11, -0.15, 1)) p.push([g, S.Cloth, { k: C.seam }])
  } else
    p.push([
      lathe(withRows(SHIN_LO, [-0.315, -0.135, ...tapes.flat()]), d.mid),
      S.Cloth,
      // workers: accent panel (navy hi-vis) under the tape
      { bands: [[-0.315, -0.135, S.Cloth, { t: 2 }], ...tapes.map(([a, b]): [number, number, number] => [a, b, S.Tape])] },
    ])
  return p
}
/** steel-toe boot: [rear foot in the ankle frame, toe box in the toe frame (pivot at the ball, on the sole)] */
export function boot(d: Detail): [Piece[], Piece[]] {
  const rear: Piece[] = [
    // shaft with padded collar
    [put(lathe(d.hi ? [[0.056, -0.03], [0.058, 0.03], [0.056, 0.08], [0.054, 0.104], [0.049, 0.108]] : [[0.056, -0.03], [0.057, 0.06], [0.05, 0.108]], d.mid), [0, 0, 0.008], [0, 0, 0], [0.98, 1, 1.08]), S.Leather],
    [put(d.hi ? rbox(0.1, 0.075, 0.2, 0.03, 3) : box(0.1, 0.075, 0.2), [0, -0.035, -0.03]), S.Leather], // foot
    [put(sph(d, 0.05, d.mid, 10), [0, -0.033, 0.034], [0, 0, 0], [1, 0.85, 0.9]), S.Leather], // heel counter
    [put(rb(d, 0.088, 0.03, 0.11, 0.012), [0, 0.012, -0.088], [-0.7, 0, 0]), S.Leather], // instep / vamp
    [put(rb(d, 0.108, 0.03, 0.2, 0.008), [0, -0.075, -0.028]), S.Rubber, { c: C.sole }], // sole
  ]
  const toe: Piece[] = [
    [put(sph(d, 0.052, d.mid, 10), [0, 0.042, -0.03], [0, 0, 0], [0.97, 0.72, 0.98]), S.Leather, { k: 0.8 }], // steel toe cap
    [put(rb(d, 0.108, 0.03, 0.09, 0.008), [0, 0.015, -0.041]), S.Rubber, { c: C.sole }],
  ]
  if (d.hi) {
    rear.push([put(lathe([[0.058, 0.088], [0.06, 0.098], [0.055, 0.111], [0.05, 0.112]], d.mid), [0, 0, 0.008], [0, 0, 0], [0.98, 1, 1.08]), S.Leather, { k: 0.7 }])
    rear.push([put(rbox(0.11, 0.009, 0.2, 0.003), [0, -0.0615, -0.028]), S.Rubber, { c: C.midsole }]) // midsole stripe
    toe.push([put(rbox(0.11, 0.009, 0.09, 0.003), [0, 0.0285, -0.041]), S.Rubber, { c: C.midsole }])
    rear.push([put(rbox(0.042, 0.06, 0.01, 0.004), [0, 0.07, -0.052], [-0.28, 0, 0]), S.Leather, { k: 0.85 }]) // tongue
    // laces criss-crossing up the instep (on the vamp's top face)
    const th = -0.7
    const dir = [0, Math.sin(th), -Math.cos(th)] // along the vamp, forward + down
    const nrm = [0, Math.cos(th), Math.sin(th)] // its top-face normal
    for (let i = 0; i < 5; i++) {
      const s = -0.038 + (0.07 * i) / 4
      const at = [0, 0.012 + dir[1] * s + nrm[1] * 0.0175, -0.088 + dir[2] * s + nrm[2] * 0.0175]
      rear.push([put(box(0.05, 0.0055, 0.0055), at, [th, i % 2 ? 0.35 : -0.35, 0]), S.Rubber, { c: C.lace }])
    }
    rear.push([put(new THREE.TorusGeometry(0.013, 0.0035, 4, 10, Math.PI), [0, 0.104, 0.064], [0, Math.PI / 2, 0]), S.Rubber]) // pull loop
  }
  return [rear, toe]
}
/** the toe frame's origin in the ankle frame */
export const TOE_JOINT: V3 = [0, BALL[1], -BALL[0]]
