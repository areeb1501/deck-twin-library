// Canvas materials for control-room interiors: wall lining, raised floor, ceiling tiles, LED panels, perforated doors, shutter slats, labels.
import * as THREE from 'three'

type G = CanvasRenderingContext2D
const cache = new Map<string, THREE.MeshStandardMaterial>()

/** Cached canvas-texture material; `draw` runs once, on first use. */
export function canvasMaterial(key: string, w: number, h: number, draw: (g: G, w: number, h: number) => void, o: { repeat?: boolean; roughness?: number; metalness?: number; emissive?: number; alphaTest?: number; transparent?: boolean; side?: THREE.Side } = {}) {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!, w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  if (o.repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  const m = new THREE.MeshStandardMaterial({ map: tex, metalness: o.metalness ?? 0.05, roughness: o.roughness ?? 0.6, alphaTest: o.alphaTest ?? 0, transparent: o.transparent ?? false, side: o.side ?? THREE.FrontSide })
  if (o.emissive) {
    m.emissive = new THREE.Color('#ffffff')
    m.emissiveMap = tex
    m.emissiveIntensity = o.emissive
  }
  m.name = `int-${key}`
  cache.set(key, m)
  return m
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}
function speckle(g: G, w: number, h: number, base: string, n: number, dark: string, light: string, seed = 1) {
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.5 ? dark : light
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2)
  }
}

/** Steel-faced wall lining panel, 600 mm module with a shadow-gap joint. UV 1 = 0.6 m. */
export function liningMaterial(color = '#e3e4e0') {
  return canvasMaterial(`lining-${color}`, 128, 128, (g, w, h) => {
    speckle(g, w, h, color, 220, 'rgba(0,0,0,0.035)', 'rgba(255,255,255,0.05)', 3)
    g.fillStyle = 'rgba(40,44,48,0.45)'
    g.fillRect(0, 0, 2, h)
    g.fillStyle = 'rgba(255,255,255,0.4)'
    g.fillRect(2, 0, 1, h)
  }, { repeat: true, roughness: 0.55, metalness: 0.15 })
}

/** 600 × 600 raised-access floor tile with an anti-static vinyl finish. UV 1 = 0.6 m. */
export function raisedFloorMaterial(color = '#8d9396') {
  return canvasMaterial(`rf-${color}`, 256, 256, (g, w, h) => {
    speckle(g, w, h, color, 2600, 'rgba(0,0,0,0.12)', 'rgba(255,255,255,0.1)', 7)
    g.strokeStyle = 'rgba(30,32,34,0.75)'
    g.lineWidth = 3
    g.strokeRect(1.5, 1.5, w - 3, h - 3)
    g.strokeStyle = 'rgba(255,255,255,0.18)'
    g.lineWidth = 1
    g.strokeRect(4, 4, w - 8, h - 8)
  }, { repeat: true, roughness: 0.7 })
}

/** Carpet tile, 500 mm module. UV 1 = 0.5 m. */
export function carpetMaterial(color = '#4a5058') {
  return canvasMaterial(`carpet-${color}`, 256, 256, (g, w, h) => {
    speckle(g, w, h, color, 9000, 'rgba(0,0,0,0.16)', 'rgba(255,255,255,0.07)', 9)
    g.strokeStyle = 'rgba(0,0,0,0.25)'
    g.lineWidth = 2
    g.strokeRect(1, 1, w - 2, h - 2)
  }, { repeat: true, roughness: 0.95, metalness: 0 })
}

/** Mineral-fibre suspended ceiling tile on a 600 mm exposed grid. UV 1 = 0.6 m. */
export function ceilingMaterial() {
  return canvasMaterial('ceiling', 256, 256, (g, w, h) => {
    speckle(g, w, h, '#ecece8', 1800, 'rgba(0,0,0,0.08)', 'rgba(255,255,255,0.4)', 5)
    g.fillStyle = '#f7f7f5'
    g.fillRect(0, 0, w, 6)
    g.fillRect(0, 0, 6, h)
    g.fillStyle = 'rgba(0,0,0,0.12)'
    g.fillRect(6, 6, w - 6, 2)
    g.fillRect(6, 6, 2, h - 6)
  }, { repeat: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
}

/** Flat 600 × 600 LED panel: opal diffuser with a slightly brighter edge-lit rim. */
export function ledPanelMaterial(intensity = 1.6) {
  return canvasMaterial(`led-${intensity}`, 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7)
    grd.addColorStop(0, '#fffdf6')
    grd.addColorStop(1, '#fff6e6')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
  }, { emissive: intensity, roughness: 0.4, metalness: 0 })
}

/** Square-perforated steel (cabinet doors, ceiling diffusers). UV 1 = 0.1 m. */
export function perforatedMaterial(color = '#2f3337') {
  return canvasMaterial(`perf-${color}`, 64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h)
    g.fillStyle = color
    g.fillRect(0, 0, w, h)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        g.clearRect(x * 8 + 2 + (y % 2) * 4, y * 8 + 2, 4, 4)
      }
  }, { repeat: true, transparent: true, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.5 })
}

/** Linear slot diffuser face. */
export function diffuserMaterial() {
  return canvasMaterial('diffuser', 128, 32, (g, w, h) => {
    g.fillStyle = '#f2f2f0'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#25282b'
    for (let i = 0; i < 4; i++) g.fillRect(4, 4 + i * 7, w - 8, 3)
  }, { roughness: 0.5 })
}

/** Interlocking roller-shutter slats, repeat along V. UV 1 = 0.075 m slat. */
export function slatMaterial(color = '#b9bec2') {
  return canvasMaterial(`slat-${color}`, 32, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, 'rgba(0,0,0,0.35)')
    grd.addColorStop(0.15, color)
    grd.addColorStop(0.55, '#e0e4e7')
    grd.addColorStop(0.85, color)
    grd.addColorStop(1, 'rgba(0,0,0,0.4)')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
  }, { repeat: true, metalness: 0.6, roughness: 0.4 })
}

/** Engraved traffolyte label (white on black, or black on white). */
export function labelMaterial(text: string, bg = '#1b1d1f', fg = '#f1f1ed', w = 512, h = 96) {
  return canvasMaterial(`label-${text}-${bg}-${fg}-${w}x${h}`, w, h, (g) => {
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.fillStyle = fg
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = Math.round(h * 0.6)
    g.font = `bold ${size}px Arial, sans-serif`
    while (g.measureText(text).width > w * 0.9 && size > 8) g.font = `bold ${(size -= 1)}px Arial, sans-serif`
    g.fillText(text, w / 2, h / 2 + 1)
  }, { roughness: 0.45 })
}

/** Door / window certification plate: rating, standard, serial. */
export function ratingLabelMaterial(rating: string) {
  return canvasMaterial(`rating-${rating}`, 256, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h)
    grd.addColorStop(0, '#d8dcdf')
    grd.addColorStop(1, '#b8bec2')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#555b60'
    g.lineWidth = 4
    g.strokeRect(3, 3, w - 6, h - 6)
    g.fillStyle = '#b52a20'
    g.fillRect(10, 10, 90, h - 20)
    g.fillStyle = '#fff'
    g.font = 'bold 34px Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(rating, 55, h / 2)
    g.fillStyle = '#1b1e21'
    g.textAlign = 'left'
    g.font = 'bold 17px Arial, sans-serif'
    g.fillText(rating.startsWith('H') ? 'H-CLASS DIVISION' : rating.startsWith('A') ? 'A-CLASS DIVISION' : 'FIRE DOOR', 110, 32)
    g.font = '15px Arial, sans-serif'
    g.fillText('IMO FTP CODE', 110, 58)
    g.fillText('SN 000000', 110, 82)
    g.fillText('TYPE APPROVED', 110, 104)
  }, { metalness: 0.6, roughness: 0.35 })
}

/** ISO 7010 E001-style emergency exit sign (running man, door, arrow). */
export function exitSignMaterial(lit = true) {
  return canvasMaterial(`exit-${lit}`, 512, 256, (g, w, h) => {
    g.fillStyle = '#0f8a3d'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#fff'
    // door frame
    g.fillRect(300, 30, 12, 196)
    g.fillRect(300, 30, 150, 12)
    g.fillRect(438, 30, 12, 196)
    // running figure
    g.beginPath()
    g.arc(240, 62, 22, 0, Math.PI * 2)
    g.fill()
    g.lineCap = 'round'
    g.strokeStyle = '#fff'
    g.lineWidth = 26
    const ln = (a: [number, number][]) => {
      g.beginPath()
      a.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
    }
    ln([[226, 100], [196, 160]])
    ln([[196, 160], [238, 186], [228, 230]])
    ln([[196, 160], [160, 200], [128, 196]])
    ln([[222, 104], [262, 130], [290, 116]])
    ln([[222, 104], [182, 112], [164, 140]])
    // arrow
    g.beginPath()
    g.moveTo(24, 128)
    g.lineTo(78, 78)
    g.lineTo(78, 108)
    g.lineTo(124, 108)
    g.lineTo(124, 148)
    g.lineTo(78, 148)
    g.lineTo(78, 178)
    g.closePath()
    g.fill()
  }, { emissive: lit ? 0.9 : 0, roughness: 0.4 })
}

/** Room name sign: white on blue (mandatory-style) or black on white. */
export function roomSignMaterial(text: string) {
  return canvasMaterial(`room-${text}`, 512, 128, (g, w, h) => {
    g.fillStyle = '#f4f4f0'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#1f4e9a'
    g.fillRect(0, 0, 18, h)
    g.fillStyle = '#16191c'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = 52
    g.font = `bold ${size}px Arial, sans-serif`
    while (g.measureText(text).width > w - 60 && size > 12) g.font = `bold ${(size -= 2)}px Arial, sans-serif`
    g.fillText(text, w / 2 + 9, h / 2 + 2)
  }, { roughness: 0.4 })
}

/** Keyboard key field. */
export function keyboardMaterial() {
  return canvasMaterial('keyboard', 256, 96, (g, w, h) => {
    g.fillStyle = '#1b1c1e'
    g.fillRect(0, 0, w, h)
    const kw = 14
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 15; c++) {
        const x = 4 + c * (kw + 2) + (r % 2) * 4
        if (x + kw > 200) continue
        g.fillStyle = '#2d2f32'
        g.fillRect(x, 6 + r * 17, kw, 14)
        g.fillStyle = 'rgba(255,255,255,0.35)'
        g.fillRect(x + 4, 10 + r * 17, 4, 3)
      }
    g.fillStyle = '#2d2f32'
    g.fillRect(60, 6 + 5 * 17 - 2, 90, 10)
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.fillRect(206 + c * 16, 6 + r * 20, 14, 16)
  }, { roughness: 0.6 })
}
