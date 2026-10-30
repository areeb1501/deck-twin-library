/**
 * Procedural CanvasTextures (no network): grating alpha, grating shadow dither, signage atlas.
 */
import * as THREE from 'three'

/** One grating tile = GRATING_TILE metres square: 10 bearing bars @30 mm x 3 cross bars @100 mm. */
export const GRATING_TILE = 0.3

let gratingTex: THREE.CanvasTexture | null = null
/**
 * Alpha map for 30x100 pressure-locked grating. White = steel, black = hole.
 * Bearing bars run along texture V (world Z when UVs are world x/z), cross bars along U.
 * alphaMap samples the GREEN channel.
 */
export function gratingAlpha(): THREE.CanvasTexture {
  if (gratingTex) return gratingTex
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.fillStyle = '#fff'
  const px = S / 300 // px per mm
  // bearing bars: 5 mm thick every 30 mm
  for (let i = 0; i < 10; i++) {
    const x = (i * 30 + 15) * px
    g.fillRect(Math.round(x - 2.5 * px), 0, Math.round(5 * px), S)
  }
  // twisted cross bars: ~7 mm visible every 100 mm
  for (let i = 0; i < 3; i++) {
    const y = (i * 100 + 50) * px
    g.fillRect(0, Math.round(y - 3.5 * px), S, Math.round(7 * px))
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / GRATING_TILE, 1 / GRATING_TILE)
  t.anisotropy = 8
  t.colorSpace = THREE.NoColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  gratingTex = t
  return t
}

let ditherTex: THREE.CanvasTexture | null = null
/**
 * Coarse checker used ONLY by the grating shadow proxy: ~50 % of texels block light, so the
 * deck below a grating gets a believable half-shadow instead of moiré from 30 mm bars.
 */
export function gratingShadowDither(): THREE.CanvasTexture {
  if (ditherTex) return ditherTex
  const S = 8
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.fillStyle = '#fff'
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x + y) % 2 === 0) g.fillRect(x, y, 1, 1)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  // 8 cells per 0.4 m => 50 mm cells (~2 shadow texels)
  t.repeat.set(1 / 0.4, 1 / 0.4)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.NoColorSpace
  ditherTex = t
  return t
}

// ------------------------------------------------------------------ signage atlas

export type SignId =
  | 'escape'
  | 'muster'
  | 'lifebuoy'
  | 'noSmoking'
  | 'hearing'
  | 'deckId'
  | 'arrow'
  | 'stair'

const ORDER: SignId[] = ['escape', 'muster', 'lifebuoy', 'noSmoking', 'hearing', 'deckId', 'arrow', 'stair']
const CELL = 256
const COLS = 4

/** UV rect (u0, v0, u1, v1) of a sign within the atlas (3:2 landscape plate, arrow is square). */
export function signUV(id: SignId): [number, number, number, number] {
  const i = ORDER.indexOf(id)
  const cx = i % COLS
  const cy = Math.floor(i / COLS)
  const W = CELL * COLS
  const H = CELL * 2
  const pad = 4
  const h = id === 'arrow' ? CELL - 2 * pad : (CELL - 2 * pad) * (2 / 3)
  const x0 = cx * CELL + pad
  const y0 = cy * CELL + (CELL - h) / 2
  // canvas y down -> uv v up (flipY default true)
  return [x0 / W, 1 - (y0 + h) / H, (x0 + CELL - 2 * pad) / W, 1 - y0 / H]
}

let atlasTex: THREE.CanvasTexture | null = null
export function signAtlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex
  const W = CELL * COLS
  const H = CELL * 2
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.clearRect(0, 0, W, H)
  const font = (px: number, w = 700) => `${w} ${px}px "Helvetica Neue", Arial, sans-serif`
  const plate = (i: number, bg: string, fg: string, lines: string[], icon?: (x: number, y: number, s: number) => void) => {
    const cx = (i % COLS) * CELL
    const cy = Math.floor(i / COLS) * CELL
    const pad = 4
    const w = CELL - 2 * pad
    const h = w * (2 / 3)
    const x = cx + pad
    const y = cy + (CELL - h) / 2
    g.fillStyle = bg
    g.fillRect(x, y, w, h)
    g.strokeStyle = fg
    g.lineWidth = 5
    g.strokeRect(x + 6, y + 6, w - 12, h - 12)
    if (icon) icon(x + w / 2, y + h * 0.36, h * 0.42)
    g.fillStyle = fg
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const fs = lines.length > 1 ? 21 : 26
    lines.forEach((l, k) => {
      g.font = font(fs)
      g.fillText(l, x + w / 2, y + h * (icon ? 0.74 : 0.5) + (k - (lines.length - 1) / 2) * (fs + 3), w - 20)
    })
  }
  const arrowGlyph = (x: number, y: number, s: number, col: string) => {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(x - s * 0.5, y - s * 0.16)
    g.lineTo(x + s * 0.05, y - s * 0.16)
    g.lineTo(x + s * 0.05, y - s * 0.4)
    g.lineTo(x + s * 0.55, y)
    g.lineTo(x + s * 0.05, y + s * 0.4)
    g.lineTo(x + s * 0.05, y + s * 0.16)
    g.lineTo(x - s * 0.5, y + s * 0.16)
    g.closePath()
    g.fill()
  }
  // 0 escape route
  plate(0, '#1f8a4c', '#ffffff', ['ESCAPE ROUTE'], (x, y, s) => arrowGlyph(x, y, s * 1.2, '#fff'))
  // 1 muster station
  plate(1, '#1f8a4c', '#ffffff', ['MUSTER', 'STATION'], (x, y, s) => {
    g.fillStyle = '#fff'
    for (let k = -1; k <= 1; k++) {
      g.beginPath()
      g.arc(x + k * s * 0.42, y - s * 0.22, s * 0.11, 0, Math.PI * 2)
      g.fill()
      g.fillRect(x + k * s * 0.42 - s * 0.1, y - s * 0.08, s * 0.2, s * 0.38)
    }
  })
  // 2 lifebuoy
  plate(2, '#1f8a4c', '#ffffff', ['LIFEBUOY'], (x, y, s) => {
    g.lineWidth = s * 0.16
    for (let k = 0; k < 8; k++) {
      g.strokeStyle = k % 2 ? '#ffffff' : '#ff6a1a'
      g.beginPath()
      g.arc(x, y, s * 0.32, (k * Math.PI) / 4, ((k + 1) * Math.PI) / 4)
      g.stroke()
    }
  })
  // 3 no smoking
  plate(3, '#ffffff', '#111111', ['NO SMOKING', 'NO NAKED FLAMES'], (x, y, s) => {
    g.strokeStyle = '#c8102e'
    g.lineWidth = s * 0.1
    g.beginPath()
    g.arc(x, y, s * 0.36, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#111'
    g.fillRect(x - s * 0.28, y - s * 0.05, s * 0.5, s * 0.1)
    g.beginPath()
    g.moveTo(x - s * 0.25, y - s * 0.25)
    g.lineTo(x + s * 0.25, y + s * 0.25)
    g.stroke()
  })
  // 4 hearing protection
  plate(4, '#ffffff', '#0b4ea2', ['EAR PROTECTION', 'MUST BE WORN'], (x, y, s) => {
    g.fillStyle = '#0b4ea2'
    g.beginPath()
    g.arc(x, y, s * 0.4, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#fff'
    g.lineWidth = s * 0.08
    g.beginPath()
    g.arc(x, y + s * 0.02, s * 0.22, Math.PI, 0)
    g.stroke()
    g.fillStyle = '#fff'
    g.fillRect(x - s * 0.3, y - s * 0.02, s * 0.14, s * 0.22)
    g.fillRect(x + s * 0.16, y - s * 0.02, s * 0.14, s * 0.22)
  })
  // 5 deck id
  plate(5, '#f2c200', '#111111', ['PRODUCTION DECK', 'EL +28.000'])
  // 6 floor arrow (transparent background)
  {
    const cx = 2 * CELL
    const cy = CELL
    arrowGlyph(cx + CELL / 2, cy + CELL / 2, CELL * 0.8, '#ffffff')
  }
  // 7 stair tower
  plate(7, '#1f8a4c', '#ffffff', ['STAIR  ▲ UPPER DECK', '▼ CELLAR DECK'])

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  atlasTex = t
  return t
}
