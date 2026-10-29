// Shared valve operators: wrench lever, notch-plate lever, quarter-turn worm gear, scotch-yoke spring-return, spring-diaphragm + positioner, multi-turn electric.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { gauge, tagPlate } from '../lib/parts'
import { lcdMaterial, textMaterial } from '../lib/textures'

/** Instrument-air supply termination at p (tube arrives from +Y): isolation ball valve with lever and a bulkhead union below. */
export function airInlet(k: Kit, p: V3, s = 1) {
  const [x, y, z] = p
  k.hex('brass', 0.016 * s, 0.012 * s, [x, y - 0.006 * s, z])
  k.box('stainless', [0.024 * s, 0.03 * s, 0.024 * s], [x, y - 0.027 * s, z])
  k.box('actuatorRed', [0.05 * s, 0.004 * s, 0.01 * s], [x + 0.025 * s, y - 0.02 * s, z])
  k.hex('brass', 0.016 * s, 0.012 * s, [x, y - 0.048 * s, z])
  k.cyl('stainless', 0.0045 * s, 0.03 * s, [x, y - 0.069 * s, z], 'y', 8)
  k.hex('brass', 0.02 * s, 0.008 * s, [x, y - 0.088 * s, z])
}

/** Small stainless field junction box, back at `back`, door facing +normal (z), glands underneath. */
export function smallJB(k: Kit, c: V3, w = 0.12, h = 0.14, d = 0.07, glands = 2) {
  k.rbox('stainless', [w, h, d], 0.008, c)
  k.box('stainless', [w * 0.92, h * 0.92, 0.004], [c[0], c[1], c[2] + d / 2 + 0.002])
  for (let i = 0; i < glands; i++) k.cyl('brass', 0.011, 0.03, [c[0] + (i - (glands - 1) / 2) * w * 0.4, c[1] - h / 2 - 0.012, c[2]], 'y', 10)
}

/** ISO 5211 top pad + travel-stop plate at y. Returns the pad top. */
export function isoPad(k: Kit, mat: MatKey, y: number, pad: number) {
  const t = Math.max(0.01, pad * 0.12)
  k.box(mat, [pad, t, pad], [0, y + t / 2, 0])
  k.around(4, pad * 0.36, [0, y + t, 0], 'y', (p) => k.hex('nut', pad * 0.11, pad * 0.06, [p[0], p[1] + pad * 0.03, p[2]]), Math.PI / 4)
  return y + t
}

/** Wrench lever on a square stem head at y, handle along +X (open). Stops and lock tab fixed; head, bar and grip in mv. */
export function wrenchLever(k: Kit, mv: Kit, y: number, stemR: number, Lh: number, grip: MatKey = 'actuatorRed') {
  const w = Math.max(0.02, Lh * 0.075)
  const t = Math.max(0.006, Lh * 0.022)
  // stop plate with open / closed stops and padlock tab
  k.box('valveBody', [stemR * 7, 0.004, stemR * 7], [0, y + 0.002, 0])
  k.box('valveBody', [stemR * 1.4, 0.014, stemR * 1.4], [stemR * 3, y + 0.009, -stemR * 2.4])
  k.box('valveBody', [stemR * 1.4, 0.014, stemR * 1.4], [-stemR * 2.4, y + 0.009, -stemR * 3])
  // flat padlock ears on the stop plate at the open (+X) and closed (+Z) positions; the lever ear lies on top
  for (const [ex, ez] of [[1, 0], [0, 1]]) {
    k.box('valveBody', [ex ? stemR * 2.6 : stemR * 1.8, 0.004, ez ? stemR * 2.6 : stemR * 1.8], [ex * stemR * 4.6, y + 0.002, ez * stemR * 4.6])
    k.disc('pipeBore', stemR * 0.4, [ex * stemR * 5.2, y + 0.0042, ez * stemR * 5.2], 'y', 10)
  }
  const h = Math.max(0.018, stemR * 2.4)
  mv.box('handwheel', [stemR * 4.4, h, stemR * 4.4], [0, y + 0.004 + h / 2, 0])
  mv.hex('nut', stemR * 2.6, stemR * 1.1, [0, y + 0.004 + h + stemR * 0.55, 0])
  mv.box('handwheel', [stemR * 2, t, w], [stemR * 3.2, y + 0.004 + h - t / 2, 0])
  const yb = y + 0.004 + h - t / 2 + t * 0.6
  const x0 = stemR * 3.8
  mv.add('handwheel', new THREE.BoxGeometry(Lh - x0, t, w), new THREE.Matrix4().makeRotationZ(0.06).setPosition((Lh + x0) / 2, yb + (Lh - x0) * 0.03, 0))
  const gl = Lh * 0.38
  mv.rbox(grip, [gl, t * 2.6, w * 1.35], t * 1.1, [Lh - gl / 2 - 0.004, yb + (Lh - x0) * 0.055, 0])
  mv.box('handwheel', [stemR * 2.4, 0.003, stemR * 1.6], [stemR * 4.9, y + 0.0058, 0])
  mv.box('handwheel', [0.003, h - t - 0.002, stemR * 1.6], [stemR * 3.8, y + 0.004 + (h - t) / 2, 0])
  mv.disc('pipeBore', stemR * 0.4, [stemR * 5.2, y + 0.0075, 0], 'y', 10)
}

/** Butterfly lever with squeeze trigger over a 10-position notch quadrant (fixed); handle along +X when open. */
export function notchLever(k: Kit, mv: Kit, y: number, stemR: number, Lh: number) {
  const R = Lh * 0.32
  // notch quadrant from +X (open) to +Z (closed)
  k.lathe('valveBody', [[stemR * 2, 0], [R, 0], [R, 0.004], [stemR * 2, 0.004]], [0, y, 0], 'y', 20, 0, Math.PI / 2)
  for (let i = 0; i <= 9; i++) {
    const a = (i / 9) * (Math.PI / 2)
    k.box('nut', [R * 0.12, 0.007, 0.004], [Math.cos(a) * R * 0.9, y + 0.006, Math.sin(a) * R * 0.9], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
  }
  const w = Math.max(0.02, Lh * 0.08)
  const t = Math.max(0.007, Lh * 0.03)
  const yl = y + 0.03
  mv.cyl('handwheel', stemR * 2.4, 0.03, [0, y + 0.018, 0], 'y', 16)
  mv.box('handwheel', [Lh, t, w], [Lh / 2, yl, 0])
  mv.box('handwheel', [Lh * 0.5, t * 0.8, w * 0.6], [Lh * 0.62, yl - t * 1.4, 0])
  mv.rbox('actuatorRed', [Lh * 0.34, t * 2.6, w * 1.3], t, [Lh * 0.8, yl + t * 0.2, 0])
  mv.box('stainless', [t * 0.8, yl - y, t * 0.8], [R * 0.9, (yl + y) / 2, 0])
  mv.hex('nut', stemR * 2.4, stemR, [0, yl + t, 0])
}

/** Quarter-turn worm gearbox on the stem at y (handwheel on +Z). Position pointer in mv. Returns the top. */
export function wormGear(k: Kit, mv: Kit, y: number, g: number, hwD: number, mat: MatKey = 'valveBody', reach = 0) {
  const ys = y + g * 0.3
  const zw = Math.max(g * 1.1, reach)
  k.cyl(mat, g * 0.24, g * 0.3, [0, y + g * 0.15, 0], 'y', 20)
  k.cyl(mat, g * 0.3, 0.012, [0, y + 0.006, 0], 'y', 24)
  const yc = ys + g * 0.3
  k.rbox(mat, [g * 1.05, g * 0.6, g * 0.9], g * 0.12, [0, yc, -g * 0.05])
  k.cyl(mat, g * 0.48, g * 0.62, [0, yc, -g * 0.05], 'y', 32)
  const zh = zw - g * 0.25
  k.cyl(mat, g * 0.17, zh + g * 0.25, [g * 0.3, yc - g * 0.04, (zh - g * 0.25) / 2], 'z', 20)
  k.cyl(mat, g * 0.2, g * 0.04, [g * 0.3, yc - g * 0.04, zh], 'z', 20)
  k.cyl('stainless', Math.max(0.008, g * 0.05), zw - zh + 0.02, [g * 0.3, yc - g * 0.04, (zw + zh) / 2], 'z', 10)
  k.handwheel('handwheel', hwD, [g * 0.3, yc - g * 0.04, zw], 'z', hwD > 0.35 ? 5 : 4)
  const yt = yc + g * 0.31
  k.cyl(mat, g * 0.4, 0.008, [0, yt + 0.004, -g * 0.05], 'y', 28)
  k.around(8, g * 0.42, [0, yt, -g * 0.05], 'y', (p) => k.hex('nut', g * 0.06, g * 0.03, [p[0], p[1] + g * 0.015, p[2]]))
  k.box('valveBody', [g * 0.5, 0.004, 0.012], [0, yt + 0.01, -g * 0.05 - g * 0.12])
  k.box('safetyYellow', [g * 0.08, 0.004, g * 0.08], [g * 0.25, yt + 0.01, -g * 0.05])
  k.dome('glass', g * 0.26, [0, yt + 0.008, -g * 0.05], 'y', Math.PI / 2, 0.45, 28)
  mv.box('safetyYellow', [g * 0.42, 0.012, g * 0.06], [0, yt + 0.02, 0])
  mv.box('safetyYellow', [g * 0.08, 0.012, g * 0.12], [g * 0.2, yt + 0.02, 0])
  return yt + g * 0.12
}

export interface ScotchYokeOpts {
  /** housing size, m */
  s: number
  /** paint */
  A: MatKey
  text: string
  /** lowest point of the valve, cables and supply tubing run down past it */
  yLow: number
}

/** Spring-return scotch-yoke actuator on the stem at y0, axis along X (cylinder −X, spring can +X), with LSB, solenoid, QEV, AFR, jackscrew. */
export function scotchYoke(k: Kit, mv: Kit, y0: number, o: ScotchYokeOpts) {
  const { s, A } = o
  const yA = y0 + s * 0.62
  // mounting bracket + coupling spool
  k.cyl('valveBody', s * 0.22, yA - y0 - s * 0.36, [0, (y0 + yA - s * 0.36) / 2, 0], 'y', 20)
  k.cyl('valveBody', s * 0.3, s * 0.03, [0, y0 + s * 0.015, 0], 'y', 24)
  k.cyl('valveBody', s * 0.3, s * 0.03, [0, yA - s * 0.37, 0], 'y', 24)
  // yoke housing
  k.rbox(A, [s * 1.0, s * 0.74, s * 0.78], s * 0.1, [0, yA, 0])
  k.cyl(A, s * 0.42, s * 0.82, [0, yA, 0], 'z', 32)
  k.cyl(A, s * 0.3, s * 0.08, [0, yA + s * 0.39, 0], 'y', 24)
  k.around(6, s * 0.36, [0, yA, s * 0.41], 'z', (p) => k.hex('nut', s * 0.05, s * 0.02, p, 'z'))
  // pneumatic cylinder (−X): end plates, tie rods
  const cr = s * 0.34
  const cl = s * 1.25
  const xc0 = -s * 0.5
  const xc1 = xc0 - cl
  k.cyl(A, cr, cl, [(xc0 + xc1) / 2, yA, 0], 'x', 36)
  for (const x of [xc0, xc1]) k.rbox(A, [s * 0.09, cr * 2.3, cr * 2.3], s * 0.02, [x, yA, 0])
  k.around(4, cr * 1.13, [xc0, yA, 0], '-x', (p) => {
    k.rod('stainless', p, [p[0] - cl - s * 0.1, p[1], p[2]], Math.max(0.005, s * 0.022), 8)
    k.hex('nut', s * 0.07, s * 0.035, [p[0] - cl - s * 0.11, p[1], p[2]], 'x')
  }, Math.PI / 4)
  // jackscrew manual override on the cylinder end
  const xj = xc1 - s * 0.1
  k.cyl(A, s * 0.07, s * 0.2, [xj - s * 0.1, yA, 0], 'x', 16)
  k.cyl('stainless', s * 0.025, s * 0.25, [xj - s * 0.3, yA, 0], 'x', 10)
  k.handwheel('handwheel', s * 0.75, [xj - s * 0.42, yA, 0], '-x', 5)
  // spring cartridge (+X) with dished end, lifting lug, stroke stop
  const sr = s * 0.46
  const sl = s * 1.8
  const xs0 = s * 0.56
  k.cyl(A, sr * 0.82, s * 0.12, [xs0, yA, 0], 'x', 32)
  k.cyl(A, sr * 1.06, s * 0.05, [xs0 + s * 0.08, yA, 0], 'x', 36)
  k.cyl(A, sr, sl, [xs0 + s * 0.1 + sl / 2, yA, 0], 'x', 40)
  k.around(12, sr * 0.95, [xs0 + s * 0.08, yA, 0], 'x', (p) => k.hex('nut', s * 0.045, s * 0.03, [p[0] - s * 0.04, p[1], p[2]], 'x'))
  const xe = xs0 + s * 0.1 + sl
  k.lathe(A, [[sr, 0], [sr * 1.05, 0], [sr * 1.05, s * 0.05], [sr * 0.7, s * 0.13], [s * 0.08, s * 0.16], [0, s * 0.16]], [xe, yA, 0], 'x', 40)
  k.cyl('nut', s * 0.045, s * 0.14, [xe + s * 0.2, yA, 0], 'x', 6)
  k.hex('nut', s * 0.1, s * 0.05, [xe + s * 0.14, yA, 0], 'x')
  k.box(A, [s * 0.12, s * 0.1, s * 0.03], [xs0 + s * 0.1 + sl * 0.5, yA + sr + s * 0.04, 0])
  k.torus(A, s * 0.035, s * 0.012, [xs0 + s * 0.1 + sl * 0.5, yA + sr + s * 0.1, 0], 'z', 6, 14)
  tagPlate(k, o.text, [xs0 + s * 0.1 + sl * 0.5, yA, sr + 0.002], 'z', Math.min(0.16, s * 0.5))
  // limit switch box with domed indicator (indicator turns with the valve)
  const ly = yA + s * 0.43
  k.box('valveBody', [s * 0.2, s * 0.08, s * 0.2], [0, ly + s * 0.04, 0])
  k.rbox('stainless', [s * 0.46, s * 0.26, s * 0.36], s * 0.04, [0, ly + s * 0.08 + s * 0.13, 0])
  k.cyl('stainless', s * 0.14, s * 0.03, [0, ly + s * 0.355, 0], 'y', 24)
  k.dome('glass', s * 0.13, [0, ly + s * 0.37, 0], 'y', Math.PI / 2, 0.75, 28)
  mv.box('safetyGreen', [s * 0.22, s * 0.05, s * 0.05], [0, ly + s * 0.4, 0])
  mv.box('actuatorRed', [s * 0.05, s * 0.05, s * 0.2], [0, ly + s * 0.395, 0])
  k.cyl('brass', s * 0.03, s * 0.07, [s * 0.26, ly + s * 0.16, 0], 'x', 8)
  const jz = -s * 0.39 - 0.035
  k.box('valveBody', [0.06, 0.03, 0.02], [s * 0.15, yA, -s * 0.39 - 0.01])
  smallJB(k, [s * 0.15, yA, jz], 0.12, 0.14, 0.07, 2)
  k.spline('cable', [[s * 0.3, ly + s * 0.16, 0], [s * 0.42, ly + s * 0.12, -s * 0.1], [s * 0.32, yA - 0.07 - 0.07, jz - 0.02], [s * 0.15 + 0.024, yA - 0.07 - 0.024, jz]], 0.007, 6, 36)
  // solenoid valve, quick exhaust, filter regulator with gauge, tubing (front, +Z)
  const z = cr + s * 0.1
  const sx = xc0 - cl * 0.55
  const sy = yA - cr * 0.3
  k.box('valveBody', [s * 0.07, s * 0.07, z - cr * 0.6], [sx, sy, (z + cr * 0.6) / 2 - s * 0.04])
  k.box('stainless', [s * 0.16, s * 0.1, s * 0.1], [sx, sy, z])
  k.cyl('handwheel', s * 0.065, s * 0.16, [sx, sy + s * 0.13, z], 'y', 20)
  k.cyl('handwheel', s * 0.07, s * 0.02, [sx, sy + s * 0.22, z], 'y', 20)
  k.cyl('actuatorRed', s * 0.02, s * 0.04, [sx - s * 0.1, sy, z], 'x', 10)
  k.cyl('brass', s * 0.025, s * 0.07, [sx, sy + s * 0.26, z], 'y', 8)
  k.spline('cable', [[sx, sy + s * 0.3, z], [sx + s * 0.02, sy + s * 0.42, z + 0.02], [s * 0.12, ly + s * 0.12, s * 0.3], [s * 0.12, ly + s * 0.17, s * 0.2]], 0.005, 6, 30)
  k.cyl('brass', s * 0.025, s * 0.04, [s * 0.12, ly + s * 0.17, s * 0.18 + s * 0.02], 'z', 8)
  const qx = xc0 - cl * 0.12
  k.box('stainless', [s * 0.1, s * 0.1, s * 0.08], [qx, sy, z])
  k.cyl('brass', s * 0.035, s * 0.05, [qx, sy - s * 0.07, z], 'y', 12)
  const tr = Math.max(0.004, s * 0.016)
  k.tube('tubing', [[sx + s * 0.08, sy, z], [qx - s * 0.05, sy, z]], tr)
  k.tube('tubing', [[qx, sy + s * 0.05, z], [qx, yA + cr * 0.75, z], [qx, yA + cr * 0.75, cr * 0.5], [qx, yA + cr * 0.55, cr * 0.5]], tr)
  const ax = sx - s * 0.3
  const ay = y0 - s * 0.05
  k.tube('tubing', [[sx, sy - s * 0.05, z], [sx, ay + s * 0.12, z], [ax, ay + s * 0.12, z]], tr)
  k.box('valveBody', [s * 0.03, ay + s * 0.12 - (yA - cr), s * 0.06], [ax, (ay + s * 0.12 + yA - cr) / 2, z - s * 0.06])
  filterRegulator(k, [ax, ay, z], s * 0.75)
  k.tube('tubing', [[ax + s * 0.12, ay + s * 0.09, z], [ax + s * 0.2, ay + s * 0.09, z], [ax + s * 0.2, ay - s * 0.15, z]], tr)
  airInlet(k, [ax + s * 0.2, ay - s * 0.15, z])
}

/** Air filter-regulator with bowl, drain, adjusting knob and outlet gauge; body centre at p, front +Z. */
export function filterRegulator(k: Kit, p: V3, s = 0.2) {
  const [x, y, z] = p
  k.rbox('aluminium', [s * 0.32, s * 0.3, s * 0.3], s * 0.04, [x, y + s * 0.12, z])
  k.cyl('aluminium', s * 0.14, s * 0.2, [x, y + s * 0.37, z], 'y', 16)
  k.cyl('handwheel', s * 0.1, s * 0.08, [x, y + s * 0.5, z], 'y', 16)
  k.cyl('aluminium', s * 0.15, s * 0.04, [x, y - s * 0.05, z], 'y', 18)
  k.cyl('glass', s * 0.12, s * 0.3, [x, y - s * 0.22, z], 'y', 18)
  k.cyl('brass', s * 0.025, s * 0.08, [x, y - s * 0.41, z], 'y', 8)
  gauge(k, [x, y + s * 0.15, z + s * 0.21], 'z', s * 0.26, 'bar', 10)
  k.cyl('brass', s * 0.03, s * 0.08, [x, y + s * 0.15, z + s * 0.17], 'z', 8)
}

export interface DiaphragmOpts {
  /** casing diameter, m */
  Da: number
  A: MatKey
  text: string
}

/** Multi-spring diaphragm actuator from its bottom boss at y0 upward. Returns the lower casing mid-height and top. */
export function diaphragmActuator(k: Kit, y0: number, { Da, A, text }: DiaphragmOpts) {
  const R = Da / 2
  const hL = Da * 0.2
  const hU = Da * 0.26
  const rim = Math.max(0.012, Da * 0.028)
  const boss = Math.max(0.035, Da * 0.13)
  k.cyl(A, boss, Da * 0.09, [0, y0 + Da * 0.045, 0], 'y', 24)
  const yRim = y0 + Da * 0.09 + hL
  k.lathe(A, [
    [boss, y0 + Da * 0.09],
    [R * 0.55, y0 + Da * 0.09 + hL * 0.22],
    [R * 0.88, yRim - hL * 0.4],
    [R * 0.98, yRim - rim],
    [R + rim * 1.6, yRim - rim],
    [R + rim * 1.6, yRim],
  ], [0, 0, 0], 'y', 56)
  k.lathe(A, [
    [R + rim * 1.6, yRim],
    [R + rim * 1.6, yRim + rim],
    [R * 0.98, yRim + rim],
    [R * 0.93, yRim + hU * 0.5],
    [R * 0.66, yRim + hU * 0.92],
    [R * 0.2, yRim + hU],
    [0, yRim + hU],
  ], [0, 0, 0], 'y', 56)
  const nb = Math.round(16 + Da * 24)
  const bd = Math.max(0.007, rim * 0.6)
  k.boltCircle('boltXylan', 'nut', nb, R + rim * 0.8, [0, yRim - rim - bd * 1.2, 0], 'y', bd, 2 * rim + bd * 2.6, [bd * 0.5, 2 * rim + bd * 2.1])
  const yTop = yRim + hU
  k.torus('stainless', Da * 0.05, Da * 0.009, [0, yTop + Da * 0.06, 0], 'z', 6, 20)
  k.cyl('stainless', Da * 0.025, Da * 0.03, [0, yTop + 0.006, 0], 'y', 12)
  k.cyl('nut', Da * 0.012, Da * 0.03, [R * 0.5, yTop - hU * 0.12, 0], 'y', 8)
  k.cyl('brass', Da * 0.012, Da * 0.04, [-R * 0.55, yRim - hL * 0.4, 0], 'x', 8)
  tagPlate(k, text, [0, yRim + rim + (hU * 0.5 - rim) * 0.5, R * 0.958 + 0.0015], [0, 0.11, 1], Math.min(0.12, (hU * 0.5 - rim) * 2.6))
  return { yLower: yRim - hL * 0.5, yRim, yTop, R }
}

/** Digital valve positioner on a bracket at p (back face), front +Z, with gauges, cable gland, feedback arm. */
export function positioner(k: Kit, p: V3, s = 1) {
  const [x, y, z] = p
  const w = 0.17 * s
  const h = 0.2 * s
  const d = 0.11 * s
  const zc = z + d / 2
  k.rbox('actuatorBlue', [w, h, d], 0.018 * s, [x, y, zc])
  k.rbox('handwheel', [w * 0.92, h * 0.88, 0.02 * s], 0.008 * s, [x, y, zc + d / 2 + 0.008 * s])
  k.plane(lcdMaterial(), w * 0.42, h * 0.22, [x, y + h * 0.18, zc + d / 2 + 0.0185 * s])
  for (const s2 of [-1, 1]) gauge(k, [x + s2 * w * 0.24, y - h / 2 - 0.028 * s, zc + 0.02 * s], 'z', 0.044 * s, 'bar', 10)
  for (const s2 of [-1, 1]) k.cyl('brass', 0.005 * s, 0.03 * s, [x + s2 * w * 0.24, y - h / 2 - 0.006 * s, zc + 0.02 * s], 'y', 6)
  k.cyl('brass', 0.011 * s, 0.03 * s, [x + w / 2 + 0.012 * s, y - h * 0.25, zc], 'x', 8)
  return { w, h, d, zc }
}

/** Multi-turn electric actuator (IQ style) on its thrust base at y0: gearcase, motor, display cover, local controls, terminal box, handwheel. */
export function electricActuator(k: Kit, y0: number, s: number, A: MatKey, text: string) {
  k.cyl('valveBody', 0.085 * s, 0.035 * s, [0, y0 + 0.0175 * s, 0], 'y', 28)
  k.around(4, 0.07 * s, [0, y0 + 0.035 * s, 0], 'y', (p) => k.hex('nut', 0.018 * s, 0.01 * s, [p[0], p[1] + 0.005 * s, p[2]]), Math.PI / 4)
  const yg = y0 + 0.035 * s + 0.13 * s
  k.rbox(A, [0.28 * s, 0.26 * s, 0.26 * s], 0.05 * s, [0, yg, 0], undefined, 3)
  // electrical housing, display window and selector knobs on the front (+Z)
  const ye = yg + 0.04 * s
  k.cyl(A, 0.125 * s, 0.11 * s, [0, ye, 0.17 * s], 'z', 40)
  k.cyl(A, 0.135 * s, 0.03 * s, [0, ye, 0.235 * s], 'z', 40)
  k.around(6, 0.12 * s, [0, ye, 0.25 * s], 'z', (p) => k.hex('nut', 0.014 * s, 0.008 * s, p, 'z'))
  k.cyl('handwheel', 0.07 * s, 0.006 * s, [0, ye + 0.015 * s, 0.252 * s], 'z', 32)
  k.disc(textMaterial('REMOTE', '#9fb59a', '#1c2a1d', 256, 256), 0.055 * s, [0, ye + 0.015 * s, 0.2555 * s], 'z', 32)
  k.disc('glass', 0.06 * s, [0, ye + 0.015 * s, 0.257 * s], 'z', 32)
  k.cyl('actuatorRed', 0.022 * s, 0.035 * s, [-0.07 * s, ye - 0.07 * s, 0.26 * s], 'z', 12)
  k.box('actuatorRed', [0.034 * s, 0.01 * s, 0.012 * s], [-0.07 * s, ye - 0.07 * s, 0.28 * s])
  k.cyl('handwheel', 0.022 * s, 0.035 * s, [0.07 * s, ye - 0.07 * s, 0.26 * s], 'z', 12)
  k.box('handwheel', [0.01 * s, 0.034 * s, 0.012 * s], [0.07 * s, ye - 0.07 * s, 0.28 * s])
  // motor housing (−X) with cooling ribs
  k.cyl(A, 0.09 * s, 0.24 * s, [-0.24 * s, yg - 0.01 * s, 0], 'x', 32)
  k.cyl(A, 0.095 * s, 0.025 * s, [-0.37 * s, yg - 0.01 * s, 0], 'x', 32)
  for (const x of [-0.14, -0.17, -0.31, -0.34]) k.torus(A, 0.092 * s, 0.005 * s, [x * s, yg - 0.01 * s, 0], 'x', 6, 28)
  // terminal box on top-back with conduit entries and cables
  const yt = yg + 0.13 * s + 0.04 * s
  k.rbox(A, [0.2 * s, 0.08 * s, 0.16 * s], 0.02 * s, [0.02 * s, yt, -0.04 * s])
  for (const dz of [-0.09, 0.0]) {
    k.cyl('brass', 0.016 * s, 0.05 * s, [0.145 * s, yt - 0.01 * s, dz * s], 'x', 10)
    k.hex('brass', 0.03 * s, 0.015 * s, [0.175 * s, yt - 0.01 * s, dz * s], 'x')
    k.cyl('nut', 0.012 * s, 0.025 * s, [0.195 * s, yt - 0.01 * s, dz * s], 'x', 10)
  }
  // handwheel on +X with hand/auto lever
  k.cyl(A, 0.05 * s, 0.07 * s, [0.175 * s, yg, 0], 'x', 20)
  k.handwheel('handwheel', 0.34 * s, [0.24 * s, yg, 0], 'x', 4)
  k.box('actuatorRed', [0.02 * s, 0.12 * s, 0.02 * s], [0.12 * s, yg + 0.1 * s, -0.1 * s])
  k.sphere('handwheel', 0.016 * s, [0.12 * s, yg + 0.165 * s, -0.1 * s], undefined, 10)
  tagPlate(k, text, [-0.24 * s, yg - 0.01 * s, 0.092 * s], 'z', 0.1 * s)
  return { top: yg + 0.13 * s }
}
