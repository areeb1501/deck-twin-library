// Shared detector and emergency-equipment hardware: ceiling drop mount, open-front GRP shells, hollow horns, ISO 7010-style pictograms and sign faces.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { SAFETY } from '../lib/standards'
import { tagPlate } from '../lib/parts'
import { canvasMat, polePlate, wallPlate, type Mount } from './_fg'

export const GRP_RED: MatKey = paint('#b3221b', { metalness: 0.05, roughness: 0.42, clearcoat: 0.5 })
export const GRP_GREEN: MatKey = paint('#1f7a4c', { metalness: 0.05, roughness: 0.45, clearcoat: 0.4 })
export const GRP_ORANGE: MatKey = paint('#e8641c', { metalness: 0.05, roughness: 0.45, clearcoat: 0.4 })
export const GRP_INNER: MatKey = paint('#d8d6cf', { metalness: 0, roughness: 0.8, weather: 0 })
export const SEAL: MatKey = paint('#202224', { metalness: 0, roughness: 0.9, weather: 0 })
export const LAMP_WHITE: MatKey = paint('#fffaf0', { emissive: '#fff4dc', emissiveIntensity: 1.6, roughness: 0.25, metalness: 0, weather: 0 })
export const LAMP_OFF: MatKey = paint('#e9e6dc', { roughness: 0.3, metalness: 0, weather: 0 })
export const LED_AMBER: MatKey = paint('#ffae1a', { emissive: '#ffae1a', emissiveIntensity: 0.9, roughness: 0.3, weather: 0 })

/** Beam clamp, drop rod and fixing plate under steelwork; origin on the steel underside, returns the plate underside y (≤ 0). */
export function ceilingMount(k: Kit, drop: number, plate: [number, number] = [0.16, 0.16]) {
  if (drop <= 0.02) {
    k.box('stainless', [plate[0], 0.008, plate[1]], [0, -0.004, 0])
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.016, 0.007, [sx * (plate[0] / 2 - 0.014), -0.0115, sz * (plate[1] / 2 - 0.014)], 'y')
    return -0.008
  }
  k.box('galvanised', [0.12, 0.012, 0.08], [0, -0.006, 0])
  for (const s of [-1, 1]) k.hex('nut', 0.022, 0.012, [s * 0.04, -0.018, 0], 'y')
  k.cyl('galvanised', 0.008, drop, [0, -drop / 2, 0], 'y', 10)
  k.hex('nut', 0.022, 0.012, [0, -drop + 0.014, 0], 'y')
  k.box('galvanised', [plate[0], 0.008, plate[1]], [0, -drop - 0.004, 0])
  k.hex('nut', 0.022, 0.012, [0, -drop - 0.014, 0], 'y')
  return -drop - 0.008
}

/** Small stainless tag bracket on the stanchion (U-bolted) or wall at height y, offset x along the wall. */
export function tagBracket(k: Kit, mount: Mount, y: number, tag: string, x = 0) {
  if (mount === 'pole') {
    const z = polePlate(k, y, 0.13, 0.11)
    tagPlate(k, tag, [0, y, z + 0.001], 'z', 0.1)
  } else
    k.at([x, 0, 0], undefined, () => {
      const z = wallPlate(k, y, 0.13, 0.11)
      tagPlate(k, tag, [0, y, z + 0.001], 'z', 0.1)
    })
}

/** Open-front box shell (five walls, wall thickness t): back on z = 0, opening at z = d, x ∈ ±w/2, y from y0 to y0 + h. */
export function shell(k: Kit, mat: MatKey, w: number, h: number, d: number, t: number, y0 = 0, inner: MatKey = GRP_INNER) {
  const yc = y0 + h / 2
  k.box(mat, [w, h, t], [0, yc, t / 2])
  for (const s of [-1, 1]) k.box(mat, [t, h, d - t], [s * (w / 2 - t / 2), yc, t + (d - t) / 2])
  for (const y of [y0 + t / 2, y0 + h - t / 2]) k.box(mat, [w - 2 * t, t, d - t], [0, y, t + (d - t) / 2])
  // light gel-coat lining on the inside faces
  k.plane(inner, w - 2 * t, h - 2 * t, [0, yc, t + 0.0006])
  for (const s of [-1, 1]) k.plane(inner, d - t, h - 2 * t, [s * (w / 2 - t - 0.0006), yc, t + (d - t) / 2], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-s * Math.PI) / 2))
  k.plane(inner, w - 2 * t, d - t, [0, y0 + t + 0.0006, t + (d - t) / 2], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))
  k.plane(inner, w - 2 * t, d - t, [0, y0 + h - t - 0.0006, t + (d - t) / 2], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
}

/** Hollow flared horn of wall t along +axis from pos: throat radius r0, mouth radius r1, length L, exponential-ish flare, rolled lip. */
export function horn(k: Kit, mat: MatKey, pos: V3, axis: 'x' | 'y' | 'z' | '-x' | '-y' | '-z' | V3, r0: number, r1: number, L: number, t = 0.003, seg = 40) {
  const n = 10
  const outer: [number, number][] = []
  const inner: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const r = r0 + (r1 - r0) * Math.pow(u, 2.2)
    outer.push([r + t, u * L])
    inner.push([r, u * L])
  }
  // outside up to the mouth, round the rolled lip, back down the inside to the throat
  k.lathe(mat, [...outer, [r1 + t * 1.8, L + t * 0.5], [r1 + t * 0.6, L + t * 1.4], [r1 - t * 0.2, L], ...inner.reverse()], pos, axis, seg)
}

// ------------------------------------------------------------------ pictograms (white on the sign colour, drawn into an s × s square)

type Draw = (g: CanvasRenderingContext2D, s: number) => void

function limb(g: CanvasRenderingContext2D, pts: [number, number][], s: number, w: number, flip: boolean) {
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo((flip ? 1 - x : x) * s, y * s) : g.moveTo((flip ? 1 - x : x) * s, y * s)))
  g.lineWidth = w * s
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.stroke()
}

/** Running figure (escape pictogram) heading +x, or -x when flip. */
export function runningMan(g: CanvasRenderingContext2D, s: number, flip = false) {
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#ffffff'
  g.beginPath()
  g.arc((flip ? 0.38 : 0.62) * s, 0.13 * s, 0.085 * s, 0, Math.PI * 2)
  g.fill()
  limb(g, [[0.56, 0.28], [0.43, 0.54]], s, 0.15, flip)
  limb(g, [[0.55, 0.31], [0.7, 0.42], [0.84, 0.33]], s, 0.085, flip)
  limb(g, [[0.53, 0.31], [0.37, 0.37], [0.25, 0.48]], s, 0.085, flip)
  limb(g, [[0.44, 0.55], [0.63, 0.68], [0.6, 0.9], [0.72, 0.9]], s, 0.1, flip)
  limb(g, [[0.42, 0.56], [0.32, 0.72], [0.12, 0.8]], s, 0.1, flip)
}

/** Emergency exit pictogram: door frame on the running side with the figure heading into it (ISO 7010 E001 left / E002 right). */
export function exitPictogram(g: CanvasRenderingContext2D, s: number, toLeft: boolean) {
  g.save()
  g.fillStyle = '#ffffff'
  const dx = toLeft ? 0.04 * s : 0.6 * s
  g.fillRect(dx, 0.04 * s, 0.36 * s, 0.92 * s)
  g.fillStyle = SAFETY.green
  g.fillRect(dx + 0.05 * s, 0.09 * s, 0.26 * s, 0.87 * s)
  g.restore()
  g.save()
  g.translate(toLeft ? 0.28 * s : 0.04 * s, 0.16 * s)
  runningMan(g, s * 0.68, toLeft)
  g.restore()
}

/** Direction arrow pointing to `dir` (supplementary sign). */
export function arrow(g: CanvasRenderingContext2D, s: number, dir: 'left' | 'right' | 'up' | 'down') {
  g.save()
  g.translate(s / 2, s / 2)
  g.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir])
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(0.42 * s, 0)
  g.lineTo(0.02 * s, -0.36 * s)
  g.lineTo(0.02 * s, -0.14 * s)
  g.lineTo(-0.4 * s, -0.14 * s)
  g.lineTo(-0.4 * s, 0.14 * s)
  g.lineTo(0.02 * s, 0.14 * s)
  g.lineTo(0.02 * s, 0.36 * s)
  g.closePath()
  g.fill()
  g.restore()
}

function person(g: CanvasRenderingContext2D, x: number, y: number, h: number) {
  g.beginPath()
  g.arc(x, y + h * 0.12, h * 0.12, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.roundRect(x - h * 0.16, y + h * 0.28, h * 0.32, h * 0.42, h * 0.08)
  g.fill()
  g.fillRect(x - h * 0.13, y + h * 0.6, h * 0.11, h * 0.4)
  g.fillRect(x + h * 0.02, y + h * 0.6, h * 0.11, h * 0.4)
}

/** Assembly point pictogram: group of four with arrows converging from the corners (ISO 7010 E007). */
export const assemblyPictogram: Draw = (g, s) => {
  g.fillStyle = '#ffffff'
  person(g, s * 0.43, s * 0.29, s * 0.3)
  person(g, s * 0.57, s * 0.29, s * 0.3)
  person(g, s * 0.33, s * 0.42, s * 0.3)
  person(g, s * 0.67, s * 0.42, s * 0.3)
  for (let i = 0; i < 4; i++) {
    g.save()
    g.translate(s / 2, s / 2)
    g.rotate(Math.PI / 4 + (i * Math.PI) / 2)
    g.beginPath()
    g.moveTo(s * 0.3, 0)
    g.lineTo(s * 0.4, -s * 0.07)
    g.lineTo(s * 0.4, -s * 0.03)
    g.lineTo(s * 0.5, -s * 0.03)
    g.lineTo(s * 0.5, s * 0.03)
    g.lineTo(s * 0.4, s * 0.03)
    g.lineTo(s * 0.4, s * 0.07)
    g.closePath()
    g.fill()
    g.restore()
  }
}

/** First-aid cross (ISO 7010 E003). */
export const crossPictogram: Draw = (g, s) => {
  g.fillStyle = '#ffffff'
  g.fillRect(s * 0.36, s * 0.1, s * 0.28, s * 0.8)
  g.fillRect(s * 0.1, s * 0.36, s * 0.8, s * 0.28)
}

/** Telephone handset with a small cross (ISO 7010 E004 style). */
export const phonePictogram: Draw = (g, s) => {
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#ffffff'
  g.lineCap = 'round'
  g.lineWidth = s * 0.13
  g.beginPath()
  g.arc(s * 0.42, s * 0.6, s * 0.3, Math.PI * 0.95, Math.PI * 1.85)
  g.stroke()
  for (const a of [Math.PI * 0.95, Math.PI * 1.85]) {
    g.beginPath()
    g.ellipse(s * 0.42 + Math.cos(a) * s * 0.3, s * 0.6 + Math.sin(a) * s * 0.3, s * 0.12, s * 0.07, a + Math.PI / 2, 0, Math.PI * 2)
    g.fill()
  }
  g.fillRect(s * 0.66, s * 0.62, s * 0.08, s * 0.26)
  g.fillRect(s * 0.57, s * 0.71, s * 0.26, s * 0.08)
}

/** Stretcher pictogram (side view). */
export const stretcherPictogram: Draw = (g, s) => {
  g.fillStyle = '#ffffff'
  g.fillRect(s * 0.08, s * 0.5, s * 0.84, s * 0.08)
  for (const x of [0.2, 0.8]) g.fillRect(s * (x - 0.03), s * 0.58, s * 0.06, s * 0.16)
  g.beginPath()
  g.arc(s * 0.22, s * 0.4, s * 0.08, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.roundRect(s * 0.32, s * 0.36, s * 0.52, s * 0.12, s * 0.05)
  g.fill()
}

/** Lifejacket pictogram (front view of an inflatable/foam vest). */
export const lifejacketPictogram: Draw = (g, s) => {
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(s * 0.3, s * 0.12)
  g.quadraticCurveTo(s * 0.5, s * 0.34, s * 0.7, s * 0.12)
  g.lineTo(s * 0.84, s * 0.2)
  g.lineTo(s * 0.8, s * 0.88)
  g.lineTo(s * 0.55, s * 0.88)
  g.lineTo(s * 0.55, s * 0.42)
  g.lineTo(s * 0.45, s * 0.42)
  g.lineTo(s * 0.45, s * 0.88)
  g.lineTo(s * 0.2, s * 0.88)
  g.lineTo(s * 0.16, s * 0.2)
  g.closePath()
  g.fill()
  g.fillStyle = '#1f7a4c'
  for (const y of [0.56, 0.7]) g.fillRect(s * 0.2, s * y, s * 0.6, s * 0.03)
}

/** Fire blanket pictogram: blanket hanging from its pouch over a flame. */
export const blanketPictogram: Draw = (g, s) => {
  g.fillStyle = '#ffffff'
  g.fillRect(s * 0.2, s * 0.08, s * 0.6, s * 0.16)
  g.beginPath()
  g.moveTo(s * 0.26, s * 0.24)
  g.lineTo(s * 0.74, s * 0.24)
  g.lineTo(s * 0.8, s * 0.62)
  g.lineTo(s * 0.2, s * 0.62)
  g.closePath()
  g.fill()
  g.beginPath()
  g.moveTo(s * 0.5, s * 0.66)
  g.bezierCurveTo(s * 0.7, s * 0.76, s * 0.66, s * 0.92, s * 0.5, s * 0.94)
  g.bezierCurveTo(s * 0.34, s * 0.92, s * 0.32, s * 0.78, s * 0.44, s * 0.7)
  g.closePath()
  g.fill()
}

/** Respirator pictogram (mandatory sign: head with a twin-filter respirator over nose and mouth). */
export const respiratorPictogram: Draw = (g, s) => {
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.ellipse(s * 0.5, s * 0.4, s * 0.22, s * 0.28, 0, 0, Math.PI * 2)
  g.fill()
  g.fillRect(s * 0.4, s * 0.62, s * 0.2, s * 0.2)
  g.beginPath()
  g.moveTo(s * 0.18, s * 0.98)
  g.quadraticCurveTo(s * 0.5, s * 0.72, s * 0.82, s * 0.98)
  g.fill()
  g.fillStyle = SAFETY.blue
  for (const x of [0.42, 0.58]) {
    g.beginPath()
    g.ellipse(s * x, s * 0.33, s * 0.035, s * 0.02, 0, 0, Math.PI * 2)
    g.fill()
  }
  // half mask with two filter cartridges and head strap
  g.beginPath()
  g.moveTo(s * 0.5, s * 0.36)
  g.quadraticCurveTo(s * 0.68, s * 0.42, s * 0.62, s * 0.6)
  g.quadraticCurveTo(s * 0.5, s * 0.66, s * 0.38, s * 0.6)
  g.quadraticCurveTo(s * 0.32, s * 0.42, s * 0.5, s * 0.36)
  g.fill()
  g.fillRect(s * 0.27, s * 0.44, s * 0.46, s * 0.025)
  for (const x of [0.32, 0.68]) {
    g.beginPath()
    g.arc(s * x, s * 0.56, s * 0.085, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(s * x, s * 0.56, s * 0.04, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = SAFETY.blue
  }
}

/** Safety sign face: field colour, white border, pictogram square on the left (round for mandatory blue), one to three text lines. */
export function safetySign(key: string, bg: string, lines: string[], icon?: Draw, round = false, w = 512, h = 256, emissive = 0) {
  return canvasMat(`det-sign-${key}-${bg}-${lines.join('|')}-${w}x${h}-${emissive}`, w, h, (g) => {
    g.fillStyle = round ? '#ffffff' : bg
    g.fillRect(0, 0, w, h)
    const ic = icon ? h - 40 : 0
    if (icon) {
      g.save()
      g.translate(20, 20)
      if (round) {
        g.fillStyle = bg
        g.beginPath()
        g.arc(ic / 2, ic / 2, ic / 2, 0, Math.PI * 2)
        g.fill()
        g.translate(ic * 0.12, ic * 0.12)
        icon(g, ic * 0.76)
      } else icon(g, ic)
      g.restore()
    }
    g.strokeStyle = round ? bg : '#ffffff'
    g.lineWidth = 8
    g.strokeRect(6, 6, w - 12, h - 12)
    if (!lines.length) return
    const x0 = icon ? ic + 40 : 0
    const tw = w - x0 - 30
    g.fillStyle = round ? '#111111' : '#ffffff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const n = lines.length
    const fs = Math.min(64, (h - 50) / n / 1.15)
    lines.forEach((t, i) => {
      let size = fs
      g.font = `bold ${size}px Arial, sans-serif`
      while (g.measureText(t).width > tw && size > 10) g.font = `bold ${(size -= 2)}px Arial, sans-serif`
      g.fillText(t, x0 + (w - x0) / 2, h / 2 + (i - (n - 1) / 2) * fs * 1.15)
    })
  }, emissive ? { emissive } : {})
}

export interface CabinetOpts {
  w: number
  h: number
  d: number
  mat: MatKey
  /** door swing 0 closed … 1 fully open (110°) */
  open: number
  /** cabinet bottom above the origin, m */
  y0: number
  /** draws on the door's outer face: origin at the door centre, +Z out of the face */
  face?: (k: Kit, w: number, h: number) => void
  /** draws the contents: origin at the inside back-bottom-centre */
  inside?: (k: Kit, w: number, h: number, d: number) => void
}

/** Hollow GRP cabinet with gel-coat lining, hinged door (left-hand piano hinge, toggle latches, seal), back on z = 0. */
export function cabinet(k: Kit, o: CabinetOpts) {
  const t = 0.006
  const { w, h, d, mat, y0 } = o
  shell(k, mat, w, h, d, t, y0)
  // moulded front flange, door seal
  for (const s of [-1, 1]) {
    k.box(mat, [0.03, h, 0.012], [s * (w / 2 - 0.015), y0 + h / 2, d - 0.006])
    k.box(mat, [w, 0.03, 0.012], [0, y0 + (s > 0 ? h - 0.015 : 0.015), d - 0.006])
  }
  k.box(SEAL, [w - 0.05, 0.008, 0.004], [0, y0 + h - 0.034, d + 0.002])
  k.box(SEAL, [w - 0.05, 0.008, 0.004], [0, y0 + 0.034, d + 0.002])
  o.inside?.(k, w, h, d)
  // door: hinge on the left edge, swings out
  const a = (Math.max(0, Math.min(1, o.open)) * 110 * Math.PI) / 180
  const m = new THREE.Matrix4().makeTranslation(-w / 2, y0 + h / 2, d + 0.004).multiply(new THREE.Matrix4().makeRotationY(-a))
  k.with(m, () => {
    const dt = 0.022
    k.rbox(mat, [w, h, dt], 0.008, [w / 2, 0, dt / 2])
    k.box(GRP_INNER, [w - 0.06, h - 0.06, 0.002], [w / 2, 0, -0.001])
    // piano hinge, toggle latches with keeper, pull handle
    k.cyl('stainless', 0.006, h - 0.04, [-0.004, 0, dt / 2], 'y', 10)
    for (const s of [-1, 1]) {
      const y = s * h * 0.3
      k.box('stainless', [0.03, 0.05, 0.012], [w - 0.03, y, dt + 0.006])
      k.box('stainless', [0.012, 0.03, 0.02], [w - 0.012, y, dt + 0.01])
    }
    k.tube('stainless', [[w - 0.07, -0.08, dt], [w - 0.07, -0.08, dt + 0.035], [w - 0.07, 0.08, dt + 0.035], [w - 0.07, 0.08, dt]], 0.007, 8, 0.02)
    k.at([w / 2, 0, dt], undefined, () => o.face?.(k, w, h))
  })
}
