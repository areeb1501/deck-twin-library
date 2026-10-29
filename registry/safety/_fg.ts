// Shared fire & gas hardware: galvanised pole stanchion, pole and wall brackets, field cable, LEDs, lenses and canvas faces.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint, weather } from '../lib/materials'
import { pipeOD } from '../lib/standards'

export type Mount = 'pole' | 'wall'

export const LENS: MatKey = paint('#15202b', { metalness: 0.3, roughness: 0.06 })
export const WHITE: MatKey = paint('#eceae4', { metalness: 0.05, roughness: 0.55 })
export const LED_GREEN: MatKey = paint('#2bff6e', { emissive: '#2bff6e', emissiveIntensity: 0.9, roughness: 0.3 })
export const LED_RED: MatKey = paint('#ff3b30', { emissive: '#ff3b30', emissiveIntensity: 0.9, roughness: 0.3 })

/** 2" galvanised stanchion pipe */
export const POLE_R = pipeOD(2) / 2
const PLATE_T = 0.006

const deg = (d: number) => (d * Math.PI) / 180
export { deg }

/** Free-standing stanchion: base plate with four anchor bolts and gussets, 2" pole to `top`, welded cap. Pole on the origin. */
export function poleStanchion(k: Kit, top: number, mat: MatKey = 'galvanised') {
  const B = 0.26
  k.box(mat, [B, 0.016, B], [0, 0.008, 0])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p: V3 = [sx * (B / 2 - 0.035), 0, sz * (B / 2 - 0.035)]
      k.cyl('galvanised', 0.008, 0.05, [p[0], 0.035, p[2]], 'y', 8)
      k.hex('nut', 0.03, 0.014, [p[0], 0.023, p[2]], 'y')
      k.cyl('galvanised', 0.017, 0.003, [p[0], 0.0175, p[2]], 'y', 12)
    }
  k.cyl(mat, POLE_R, top - 0.016, [0, 0.016 + (top - 0.016) / 2, 0], 'y', 20)
  k.cyl(mat, POLE_R + 0.004, 0.008, [0, top + 0.004, 0], 'y', 20)
  const g = new THREE.Shape()
  g.moveTo(0, 0).lineTo(0.09, 0).lineTo(0, 0.16).closePath()
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.016, 0).add(new THREE.Vector3(POLE_R, 0, -0.004).applyQuaternion(q)), q, new THREE.Vector3(1, 1, 1))
    k.extrude(mat, g, 0.008, m)
  }
}

/** Plate clamped to the front (+Z) of the pole by two U-bolts. Returns the z of the plate front face. */
export function polePlate(k: Kit, y: number, w: number, h: number, mat: MatKey = 'stainless') {
  const z0 = POLE_R + 0.004
  k.box(mat, [w, h, PLATE_T], [0, y, z0 + PLATE_T / 2])
  for (const s of [-1, 1]) {
    const yy = y + s * (h / 2 - 0.025)
    k.torus('galvanised', POLE_R + 0.006, 0.005, [0, yy, 0], 'y', 6, 20, Math.PI)
    k.rod('galvanised', [-(POLE_R + 0.006), yy, 0], [-(POLE_R + 0.006), yy, z0 + PLATE_T + 0.012], 0.005, 6)
    k.rod('galvanised', [POLE_R + 0.006, yy, 0], [POLE_R + 0.006, yy, z0 + PLATE_T + 0.012], 0.005, 6)
    for (const sx of [-1, 1]) k.hex('nut', 0.017, 0.008, [sx * (POLE_R + 0.006), yy, z0 + PLATE_T + 0.005], 'z')
  }
  // the U-bolt arcs sit behind the pole (torus half facing -Z)
  return z0 + PLATE_T
}

/** Stainless wall plate in the XY plane (back face on z = 0), four fixings. Returns the front face z. */
export function wallPlate(k: Kit, y: number, w: number, h: number) {
  k.box('stainless', [w, h, 0.008], [0, y, 0.004])
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.hex('nut', 0.016, 0.008, [sx * (w / 2 - 0.014), y + sy * (h / 2 - 0.014), 0.012], 'z')
  return 0.008
}

/** z of the bracket face that mounted() builds on. */
export const faceZ = (mount: Mount) => (mount === 'pole' ? POLE_R + 0.004 + PLATE_T : 0.008)

/** Builds the stanchion (pole) or wall plate, then runs `fn` with the origin on the bracket face at `y`, +Z out of the bracket. */
export function mounted(k: Kit, mount: Mount, y: number, plate: [number, number], fn: (zFace: number) => void, poleTop = y + plate[1] / 2 + 0.05) {
  let zf: number
  if (mount === 'pole') {
    poleStanchion(k, poleTop)
    zf = polePlate(k, y, plate[0], plate[1])
  } else zf = wallPlate(k, y, plate[0], plate[1])
  k.at([0, y, zf], undefined, () => fn(zf))
  return zf
}

/** Armoured field cable (SWA, black sheath). */
export function cable(k: Kit, pts: V3[], r = 0.0065) {
  k.spline('cable', pts, r, 6, Math.max(16, pts.length * 8))
}

/** Cable from `from` down the left side of the pole (or the wall) to the deck, cleated every ~0.5 m. */
export function cableToDeck(k: Kit, mount: Mount, from: V3, r = 0.0065) {
  const x = mount === 'pole' ? -(POLE_R + r + 0.001) : from[0]
  const z = mount === 'pole' ? 0 : r + 0.009
  const yTop = Math.min(from[1] - 0.08, from[1])
  cable(k, [from, [from[0], from[1] - 0.05, from[2]], [(from[0] + x) / 2, yTop - 0.05, (from[2] + z) / 2], [x, yTop - 0.14, z], [x, 0.2, z]], r)
  k.tube('cable', [[x, 0.2, z], [x, 0.03, z], mount === 'pole' ? [x - 0.2, 0.03, z] : [x, 0.03, z + 0.2]], r, 6, 0.06)
  for (let y = 0.4; y < yTop - 0.2; y += 0.5) {
    if (mount === 'pole') k.torus('stainless', POLE_R + 0.002, 0.003, [0, y, 0], 'y', 4, 18)
    else k.box('stainless', [0.03, 0.012, 0.004], [x, y, 2 * r + 0.011])
  }
}

// ------------------------------------------------------------------ canvas faces (created lazily, browser only)

const texCache = new Map<string, THREE.MeshStandardMaterial>()

export function canvasMat(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, opts: { emissive?: number; roughness?: number } = {}) {
  let m = texCache.get(key)
  if (m) return m
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  m = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.1, roughness: opts.roughness ?? 0.45 })
  if (opts.emissive) {
    m.emissive = new THREE.Color('#ffffff')
    m.emissiveMap = tex
    m.emissiveIntensity = opts.emissive
  }
  m.name = key
  weather(m, 0.3)
  texCache.set(key, m)
  return m
}

function fit(g: CanvasRenderingContext2D, text: string, max: number, size: number, weight = 'bold') {
  g.font = `${weight} ${size}px Arial, sans-serif`
  while (g.measureText(text).width > max && size > 10) g.font = `${weight} ${(size -= 2)}px Arial, sans-serif`
}

/** ISO 7010-style sign: coloured field, white border, optional pictogram square on the left, one or two text lines. */
export function signMat(lines: string[], bg: string, fg = '#ffffff', icon?: (g: CanvasRenderingContext2D, s: number) => void) {
  return canvasMat(`fgsign-${lines.join('|')}-${bg}-${fg}-${icon ? 1 : 0}`, 512, 256, (g) => {
    g.fillStyle = bg
    g.fillRect(0, 0, 512, 256)
    g.strokeStyle = fg
    g.lineWidth = 8
    g.strokeRect(10, 10, 492, 236)
    let x0 = 256
    let w = 460
    if (icon) {
      g.save()
      g.translate(28, 28)
      icon(g, 200)
      g.restore()
      x0 = 370
      w = 250
    }
    g.fillStyle = fg
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const n = lines.length
    lines.forEach((t, i) => {
      fit(g, t, w, n > 2 ? 46 : 60)
      g.fillText(t, x0, 128 + (i - (n - 1) / 2) * (n > 2 ? 58 : 72))
    })
  })
}

/** Black/yellow hazard-bordered warning plate. */
export function warnMat(lines: string[]) {
  return canvasMat(`fgwarn-${lines.join('|')}`, 512, 256, (g) => {
    g.fillStyle = '#f2c318'
    g.fillRect(0, 0, 512, 256)
    g.save()
    g.beginPath()
    g.rect(0, 0, 512, 256)
    g.rect(22, 22, 468, 212)
    g.clip('evenodd')
    g.fillStyle = '#141414'
    for (let x = -256; x < 768; x += 44) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + 22, 0)
      g.lineTo(x - 234, 256)
      g.lineTo(x - 256, 256)
      g.closePath()
      g.fill()
    }
    g.restore()
    g.fillStyle = '#141414'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    lines.forEach((t, i) => {
      fit(g, t, 440, i === 0 ? 70 : 44)
      g.fillText(t, 256, lines.length === 1 ? 128 : i === 0 ? 100 : 176)
    })
  })
}

/** White pictogram helpers drawn into an s × s square. */
export const ICON = {
  flame(g: CanvasRenderingContext2D, s: number) {
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(s * 0.5, s * 0.08)
    g.bezierCurveTo(s * 0.85, s * 0.4, s * 0.82, s * 0.7, s * 0.5, s * 0.9)
    g.bezierCurveTo(s * 0.18, s * 0.7, s * 0.2, s * 0.45, s * 0.38, s * 0.3)
    g.bezierCurveTo(s * 0.4, s * 0.45, s * 0.48, s * 0.5, s * 0.52, s * 0.42)
    g.closePath()
    g.fill()
  },
  shower(g: CanvasRenderingContext2D, s: number) {
    g.fillStyle = '#ffffff'
    g.strokeStyle = '#ffffff'
    g.lineWidth = s * 0.04
    g.beginPath()
    g.arc(s * 0.62, s * 0.18, s * 0.12, Math.PI, 0)
    g.fill()
    for (let i = 0; i < 5; i++) {
      g.beginPath()
      g.moveTo(s * (0.52 + i * 0.05), s * 0.24)
      g.lineTo(s * (0.48 + i * 0.05), s * 0.42)
      g.stroke()
    }
    g.beginPath()
    g.arc(s * 0.4, s * 0.38, s * 0.07, 0, Math.PI * 2)
    g.fill()
    g.fillRect(s * 0.34, s * 0.47, s * 0.12, s * 0.28)
    g.fillRect(s * 0.34, s * 0.75, s * 0.05, s * 0.18)
    g.fillRect(s * 0.41, s * 0.75, s * 0.05, s * 0.18)
  },
  extinguisher(g: CanvasRenderingContext2D, s: number) {
    g.fillStyle = '#ffffff'
    g.fillRect(s * 0.36, s * 0.3, s * 0.28, s * 0.6)
    g.beginPath()
    g.arc(s * 0.5, s * 0.3, s * 0.14, Math.PI, 0)
    g.fill()
    g.fillRect(s * 0.45, s * 0.1, s * 0.1, s * 0.08)
    g.lineWidth = s * 0.04
    g.strokeStyle = '#ffffff'
    g.beginPath()
    g.moveTo(s * 0.55, s * 0.14)
    g.quadraticCurveTo(s * 0.85, s * 0.18, s * 0.8, s * 0.5)
    g.stroke()
  },
  hose(g: CanvasRenderingContext2D, s: number) {
    g.strokeStyle = '#ffffff'
    g.lineWidth = s * 0.06
    for (const r of [0.14, 0.24, 0.34]) {
      g.beginPath()
      g.arc(s * 0.45, s * 0.5, s * r, 0, Math.PI * 2)
      g.stroke()
    }
    g.beginPath()
    g.moveTo(s * 0.79, s * 0.5)
    g.lineTo(s * 0.92, s * 0.85)
    g.stroke()
  },
}

/** Ex d stopping (blanking) plug in an unused cable entry, axis out of the entry. */
export function stopPlug(k: Kit, pos: V3, axis: 'x' | '-x' | 'y' | '-y' | 'z' | '-z', d = 0.026) {
  k.hex('castIron', d, 0.006, pos, axis)
  const v = { x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1] }[axis]
  k.cyl('castIron', d * 0.36, 0.006, [pos[0] + v[0] * 0.006, pos[1] + v[1] * 0.006, pos[2] + v[2] * 0.006], axis, 12)
}

/**
 * Flameproof (Ex d) cast junction box: body with a wide flamepath flange, bolted lid, earth stud and bottom entries.
 * Back face at `pos`, lid facing +Z. `used` entries get brass glands, the rest stopping plugs. Returns the entry centres (bottom face).
 */
export function exdBox(k: Kit, pos: V3, size: V3 = [0.18, 0.18, 0.12], entries = 2, used = 1, mat: MatKey = 'castIron'): V3[] {
  const [w, h, d] = size
  const [x, y, z] = pos
  k.rbox(mat, [w, h, d * 0.62], 0.01, [x, y, z + d * 0.31])
  k.rbox(mat, [w + 0.024, h + 0.024, d * 0.12], 0.006, [x, y, z + d * 0.68])
  k.rbox(mat, [w, h, d * 0.26], 0.012, [x, y, z + d * 0.87])
  // cover bolts round the flamepath flange
  const nx = Math.max(2, Math.round(w / 0.05))
  const ny = Math.max(2, Math.round(h / 0.05))
  for (let i = 0; i <= nx; i++)
    for (const s of [-1, 1]) k.cyl('stainless', 0.006, 0.006, [x - w / 2 + (w * i) / nx, y + s * (h / 2 + 0.006), z + d * 0.74 + 0.003], 'z', 8)
  for (let i = 1; i < ny; i++)
    for (const s of [-1, 1]) k.cyl('stainless', 0.006, 0.006, [x + s * (w / 2 + 0.006), y - h / 2 + (h * i) / ny, z + d * 0.74 + 0.003], 'z', 8)
  // mounting lugs, earth stud
  for (const s of [-1, 1]) {
    k.box(mat, [0.03, 0.03, 0.012], [x + s * (w / 2 + 0.012), y + s * (h / 2 - 0.02), z + 0.006])
    k.hex('nut', 0.014, 0.007, [x + s * (w / 2 + 0.014), y + s * (h / 2 - 0.02), z + 0.0155], 'z')
  }
  k.cyl('brass', 0.004, 0.025, [x + w / 2 + 0.012, y - h * 0.25, z + d * 0.35], 'x', 8)
  k.hex('brass', 0.012, 0.006, [x + w / 2 + 0.018, y - h * 0.25, z + d * 0.35], 'x')
  const out: V3[] = []
  for (let i = 0; i < entries; i++) {
    const ex = x + (entries === 1 ? 0 : -w * 0.3 + (w * 0.6 * i) / (entries - 1))
    const p: V3 = [ex, y - h / 2, z + d * 0.31]
    k.cyl(mat, 0.016, 0.008, [p[0], p[1] - 0.004, p[2]], 'y', 14)
    if (i < used) {
      k.hex('brass', 0.03, 0.014, [p[0], p[1] - 0.015, p[2]], 'y')
      k.cyl('brass', 0.012, 0.02, [p[0], p[1] - 0.032, p[2]], 'y', 12)
      k.cyl('rubberBlack', 0.0085, 0.012, [p[0], p[1] - 0.046, p[2]], 'y', 10)
    } else stopPlug(k, [p[0], p[1] - 0.011, p[2]], '-y')
    out.push([p[0], p[1] - 0.05, p[2]])
  }
  return out
}
