// Canvas materials for electrical equipment: rating plates, switchgear / MCC fronts, room finishes, indicator lamps.
import * as THREE from 'three'
import { paint } from '../lib/materials'

type G = CanvasRenderingContext2D
const cache = new Map<string, THREE.MeshStandardMaterial>()

function make(key: string, w: number, h: number, draw: (g: G, w: number, h: number) => void, o: { repeat?: boolean; roughness?: number; metalness?: number; emissive?: number } = {}) {
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
  const m = new THREE.MeshStandardMaterial({ map: tex, metalness: o.metalness ?? 0.1, roughness: o.roughness ?? 0.55 })
  if (o.emissive) {
    m.emissive = new THREE.Color('#ffffff')
    m.emissiveMap = tex
    m.emissiveIntensity = o.emissive
  }
  m.name = `el-${key}`
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
function label(g: G, x: number, y: number, w: number, h: number, text = '', bg = '#f4f4ef', fg = '#111') {
  g.fillStyle = bg
  g.fillRect(x, y, w, h)
  g.strokeStyle = '#333'
  g.lineWidth = 1
  g.strokeRect(x, y, w, h)
  if (!text) return
  g.fillStyle = fg
  let size = Math.round(h * 0.62)
  g.font = `bold ${size}px Arial, sans-serif`
  while (g.measureText(text).width > w * 0.92 && size > 6) g.font = `bold ${(size -= 1)}px Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, x + w / 2, y + h / 2 + 1)
}
function seam(g: G, x: number, y: number, w: number, h: number) {
  g.strokeStyle = 'rgba(30,34,38,0.85)'
  g.lineWidth = 3
  g.strokeRect(x, y, w, h)
  g.strokeStyle = 'rgba(255,255,255,0.45)'
  g.lineWidth = 1
  g.strokeRect(x + 3, y + 3, w - 6, h - 6)
}
function vents(g: G, x: number, y: number, w: number, n: number) {
  g.fillStyle = 'rgba(28,30,32,0.8)'
  for (let i = 0; i < n; i++) g.fillRect(x, y + i * 8, w, 4)
}
function bolt(g: G, x: number, y: number) {
  g.fillStyle = '#7a8086'
  g.beginPath()
  g.arc(x, y, 5, 0, Math.PI * 2)
  g.fill()
}

/** Stamped rating plate: a title then key/value lines. */
export function ratingPlateMaterial(title: string, lines: string[]) {
  return make(`plate-${title}-${lines.join('|')}`, 384, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h)
    grd.addColorStop(0, '#d6dadd')
    grd.addColorStop(1, '#b9bfc4')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#555b60'
    g.lineWidth = 5
    g.strokeRect(4, 4, w - 8, h - 8)
    g.fillStyle = '#1b1e21'
    g.textAlign = 'left'
    g.font = 'bold 26px Arial, sans-serif'
    g.fillText(title, 18, 40)
    g.font = '20px Arial, sans-serif'
    lines.forEach((t, i) => g.fillText(t, 18, 76 + i * 29))
    for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) bolt(g, x, y)
  }, { metalness: 0.6, roughness: 0.35 })
}

/** MV metal-clad panel front (UV 0..1 over the whole door face): LV / relay, breaker and cable compartments with mimic. */
export function mvFrontMaterial(feeder: string, kv: number, incomer: boolean) {
  return make(`mv-${feeder}-${kv}-${incomer}`, 256, 736, (g, w, h) => {
    g.fillStyle = '#cfd2cd'
    g.fillRect(0, 0, w, h)
    seam(g, 6, 6, w - 12, 214)
    seam(g, 6, 228, w - 12, 290)
    seam(g, 6, 526, w - 12, h - 532)
    label(g, 40, 18, 176, 26, feeder)
    // busbar + breaker mimic
    g.strokeStyle = '#b52a20'
    g.lineWidth = 7
    g.beginPath()
    g.moveTo(0, 252)
    g.lineTo(w, 252)
    g.moveTo(128, 252)
    g.lineTo(128, 300)
    g.moveTo(128, 340)
    g.lineTo(128, 500)
    g.stroke()
    g.strokeRect(108, 300, 40, 40)
    if (incomer) {
      g.beginPath()
      g.arc(128, 470, 14, 0, Math.PI * 2)
      g.arc(128, 448, 14, 0, Math.PI * 2)
      g.stroke()
    }
    vents(g, 46, 560, 164, 9)
    label(g, 46, 650, 164, 24, `DANGER ${kv} kV`, '#f4c414')
    g.fillStyle = '#111'
    g.beginPath()
    g.moveTo(128, 684)
    g.lineTo(112, 716)
    g.lineTo(144, 716)
    g.closePath()
    g.fill()
    g.fillStyle = '#f4c414'
    g.beginPath()
    g.moveTo(128, 692)
    g.lineTo(119, 711)
    g.lineTo(137, 711)
    g.closePath()
    g.fill()
  }, { metalness: 0.2, roughness: 0.5 })
}

/** LV MCC front: tiers of withdrawable starter drawers with labels. */
export function mccFrontMaterial(seed: number, tiers: number) {
  return make(`mcc-${seed}-${tiers}`, 256, 736, (g, w, h) => {
    g.fillStyle = '#cfd2cd'
    g.fillRect(0, 0, w, h)
    vents(g, 40, 10, 176, 3)
    const th = (h - 60) / tiers
    for (let i = 0; i < tiers; i++) {
      const y = 40 + i * th
      seam(g, 8, y, w - 16, th - 6)
      label(g, 120, y + 10, 120, Math.min(20, th * 0.22), `M-${(seed * 10 + i + 101).toString()}`)
    }
  }, { metalness: 0.2, roughness: 0.5 })
}

export const liningMaterial = () =>
  make('lining', 128, 256, (g, w, h) => {
    speckle(g, w, h, '#e1e3df', 600, 'rgba(150,155,150,0.25)', 'rgba(255,255,255,0.3)', 11)
    g.fillStyle = '#9da29f'
    g.fillRect(0, 0, 2, h)
  }, { repeat: true, roughness: 0.65 })

export const raisedFloorMaterial = () =>
  make('raisedFloor', 256, 256, (g, w, h) => {
    speckle(g, w, h, '#a9aeb0', 2600, 'rgba(70,75,80,0.35)', 'rgba(230,232,235,0.35)', 3)
    g.strokeStyle = '#5c6266'
    g.lineWidth = 4
    g.strokeRect(2, 2, w - 4, h - 4)
  }, { repeat: true, roughness: 0.55 })

export const ceilingMaterial = () =>
  make('ceiling', 128, 128, (g, w, h) => {
    speckle(g, w, h, '#eceeea', 1400, 'rgba(160,165,160,0.35)', 'rgba(255,255,255,0.4)', 13)
    g.strokeStyle = '#b4b8b4'
    g.lineWidth = 3
    g.strokeRect(0, 0, w, h)
  }, { repeat: true, roughness: 0.85 })

/** GRP panel with a faint woven gel-coat texture. */
export const grpMaterial = (color = '#e9e4d4') =>
  make(`grp-${color}`, 128, 128, (g, w, h) => speckle(g, w, h, color, 900, 'rgba(120,110,90,0.12)', 'rgba(255,255,255,0.25)', 21), { repeat: true, roughness: 0.4, metalness: 0 })

/** Engraved legend plate (white on black or black on white). */
export const legendMaterial = (text: string, dark = false) =>
  make(`legend-${text}-${dark}`, 256, 64, (g, w, h) => label(g, 0, 0, w, h, text, dark ? '#1b1d1f' : '#f2f2ee', dark ? '#f2f2ee' : '#111'), { roughness: 0.5 })

/** Protection relay HMI: small LCD with text + LED column. */
export const relayFaceMaterial = () =>
  make('relayFace', 128, 160, (g, w, h) => {
    g.fillStyle = '#26292c'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#9ec7d8'
    g.fillRect(14, 14, 80, 56)
    g.fillStyle = '#1d3440'
    g.font = 'bold 11px monospace'
    for (const [i, t] of ['I 412 A', 'P 7.1 MW', 'CB CLOSED'].entries()) g.fillText(t, 18, 30 + i * 15)
    const leds = ['#2fbf5f', '#d8a21a', '#c33', '#c33', '#555', '#555']
    leds.forEach((c, i) => {
      g.fillStyle = c
      g.beginPath()
      g.arc(110, 20 + i * 14, 4, 0, Math.PI * 2)
      g.fill()
    })
    g.fillStyle = '#4a4e52'
    for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) g.fillRect(16 + q * 20, 86 + r * 22, 14, 14)
    g.fillStyle = '#ddd'
    g.font = '9px Arial'
    g.fillText('SEL / ABB REF', 16, h - 6)
  }, { emissive: 0.25, roughness: 0.3 })

/** Emissive indicator lamp lenses (IEC 60073 colours). */
export const lamp = (c: 'red' | 'green' | 'amber' | 'white' | 'blue') => {
  const hex = { red: '#ff3b2e', green: '#35e06a', amber: '#ffb31a', white: '#fff4dc', blue: '#4aa3ff' }[c]
  return paint(hex, { emissive: hex, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0, clearcoat: 0.8, weather: 0 })
}

/** Moving-iron ammeter face (square, 0..max A with 2x overload scale). */
export const ammeterMaterial = (max = 100) =>
  make(`ammeter-${max}`, 128, 128, (g, w, h) => {
    g.fillStyle = '#f4f4ef'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#222'
    g.lineWidth = 2
    g.strokeRect(2, 2, w - 4, h - 4)
    const cx = w / 2
    const cy = h * 0.82
    const R = h * 0.6
    g.lineWidth = 3
    g.beginPath()
    g.arc(cx, cy, R, Math.PI * 1.25, Math.PI * 1.75)
    g.stroke()
    g.strokeStyle = '#c33'
    g.beginPath()
    g.arc(cx, cy, R, Math.PI * 1.62, Math.PI * 1.75)
    g.stroke()
    g.strokeStyle = '#222'
    g.font = 'bold 11px Arial'
    g.fillStyle = '#222'
    g.textAlign = 'center'
    for (let i = 0; i <= 4; i++) {
      const a = Math.PI * (1.25 + (i / 4) * 0.5)
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
      g.lineTo(cx + Math.cos(a) * (R - 9), cy + Math.sin(a) * (R - 9))
      g.stroke()
      g.fillText(String(Math.round((i * max * 2) / 4)), cx + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18))
    }
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(cx, cy)
    const a = Math.PI * 1.43
    g.lineTo(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4))
    g.stroke()
    g.font = 'bold 16px Arial'
    g.fillText('A', cx, h * 0.62)
  }, { roughness: 0.3 })
