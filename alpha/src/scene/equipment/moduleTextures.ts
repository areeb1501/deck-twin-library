/**
 * Procedural canvas materials for module interiors: floor finishes, wall lining, ceiling tiles,
 * cabinet fronts and lit screens (trends, mimics, CCTV, alarm lists). Created once, cached at
 * module scope and registered with the shared material system (section box + x-ray roles).
 */
import * as THREE from 'three'
import { registerMaterial, type MaterialRole } from '../../three/materials'

const cache = new Map<string, THREE.MeshStandardMaterial>()
type G = CanvasRenderingContext2D

function make(
  key: string,
  w: number,
  h: number,
  draw: (g: G, w: number, h: number) => void,
  o: { role?: MaterialRole; emissive?: number; repeat?: boolean; roughness?: number; metalness?: number; color?: string } = {},
) {
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
  const m = new THREE.MeshStandardMaterial({ map: tex, color: o.color ?? '#ffffff', metalness: o.metalness ?? 0.05, roughness: o.roughness ?? 0.6 })
  if (o.emissive) {
    m.emissive = new THREE.Color('#ffffff')
    m.emissiveMap = tex
    m.emissiveIntensity = o.emissive
  }
  m.name = `mod-${key}`
  registerMaterial(m, o.role ?? 'internal')
  cache.set(key, m)
  return m
}

/** deterministic pseudo-random */
function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
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

// ------------------------------------------------------------------ surfaces
/** Raised access-floor tile (one tile = one texture repeat, 0.6 m). */
export const raisedFloorMaterial = () =>
  make('raisedFloor', 256, 256, (g, w, h) => {
    speckle(g, w, h, '#a9aeb0', 2600, 'rgba(70,75,80,0.35)', 'rgba(230,232,235,0.35)', 3)
    g.strokeStyle = '#5c6266'
    g.lineWidth = 4
    g.strokeRect(2, 2, w - 4, h - 4)
    g.strokeStyle = 'rgba(255,255,255,0.35)'
    g.lineWidth = 2
    g.strokeRect(7, 7, w - 14, h - 14)
    g.fillStyle = '#6f7579'
    for (const [x, y] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]]) {
      g.beginPath()
      g.arc(x, y, 5, 0, Math.PI * 2)
      g.fill()
    }
  }, { repeat: true, roughness: 0.55 })

/** Carpet tile (0.5 m repeat). */
export const carpetMaterial = () =>
  make('carpet', 256, 256, (g, w, h) => {
    speckle(g, w, h, '#3f4b5a', 9000, 'rgba(25,30,38,0.5)', 'rgba(110,125,140,0.35)', 5)
    g.strokeStyle = 'rgba(20,24,30,0.55)'
    g.lineWidth = 2
    g.strokeRect(1, 1, w - 2, h - 2)
    // directional pile (quarter-turn look)
    g.strokeStyle = 'rgba(120,135,150,0.12)'
    for (let i = 0; i < w; i += 6) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i, h)
      g.stroke()
    }
  }, { repeat: true, roughness: 0.95 })

/** Painted steel deck with anti-slip epoxy (1 m repeat) for machinery rooms. */
export const epoxyFloorMaterial = () =>
  make('epoxyFloor', 256, 256, (g, w, h) => {
    speckle(g, w, h, '#77857c', 7000, 'rgba(40,50,45,0.35)', 'rgba(190,200,190,0.3)', 9)
    g.strokeStyle = 'rgba(40,46,42,0.5)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(0, 1)
    g.lineTo(w, 1)
    g.stroke()
  }, { repeat: true, roughness: 0.8 })

/** Wall lining panel (1.2 m wide repeat, full height). */
export const liningMaterial = () =>
  make('lining', 128, 256, (g, w, h) => {
    speckle(g, w, h, '#e1e3df', 600, 'rgba(150,155,150,0.25)', 'rgba(255,255,255,0.3)', 11)
    g.fillStyle = '#9da29f'
    g.fillRect(0, 0, 2, h)
    g.fillStyle = 'rgba(255,255,255,0.6)'
    g.fillRect(2, 0, 1, h)
  }, { role: 'shell', repeat: true, roughness: 0.65 })

/** Suspended ceiling tile (0.6 m repeat). */
export const ceilingMaterial = () =>
  make('ceiling', 128, 128, (g, w, h) => {
    speckle(g, w, h, '#eceeea', 1400, 'rgba(160,165,160,0.35)', 'rgba(255,255,255,0.4)', 13)
    g.strokeStyle = '#b4b8b4'
    g.lineWidth = 3
    g.strokeRect(0, 0, w, h)
  }, { role: 'shell', repeat: true, roughness: 0.85 })

// ------------------------------------------------------------------ cabinet fronts
function lamps(g: G, x: number, y: number, cols: string[], r = 6, dx = 20) {
  cols.forEach((c, i) => {
    g.fillStyle = c
    g.beginPath()
    g.arc(x + i * dx, y, r, 0, Math.PI * 2)
    g.fill()
  })
}
function label(g: G, x: number, y: number, w: number, h: number, text = '') {
  g.fillStyle = '#f4f4ef'
  g.fillRect(x, y, w, h)
  g.strokeStyle = '#333'
  g.lineWidth = 1
  g.strokeRect(x, y, w, h)
  if (text) {
    g.fillStyle = '#111'
    g.font = `bold ${Math.round(h * 0.6)}px Arial`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, x + w / 2, y + h / 2 + 1)
  }
}
function doorSeam(g: G, x: number, y: number, w: number, h: number) {
  g.strokeStyle = 'rgba(40,44,48,0.8)'
  g.lineWidth = 2
  g.strokeRect(x, y, w, h)
  g.strokeStyle = 'rgba(255,255,255,0.5)'
  g.lineWidth = 1
  g.strokeRect(x + 2, y + 2, w - 4, h - 4)
}
function vents(g: G, x: number, y: number, w: number, n: number) {
  g.fillStyle = 'rgba(30,32,34,0.75)'
  for (let i = 0; i < n; i++) g.fillRect(x, y + i * 7, w, 3)
}

/** MV / LV switchgear panel front: relay compartment, breaker compartment, cable compartment. (w:h ≈ 0.8:2.3) */
export const swgFrontMaterial = () =>
  make('swgFront', 256, 736, (g, w, h) => {
    g.fillStyle = '#c9ccc7'
    g.fillRect(0, 0, w, h)
    doorSeam(g, 6, 6, w - 12, 210)
    doorSeam(g, 6, 222, w - 12, 300)
    doorSeam(g, 6, 528, w - 12, h - 534)
    // relay + meter
    g.fillStyle = '#1b1f22'
    g.fillRect(30, 40, 90, 70)
    g.fillStyle = '#5fd18a'
    g.fillRect(36, 46, 78, 40)
    g.fillStyle = '#e8e8e2'
    g.beginPath()
    g.arc(185, 75, 34, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#222'
    g.beginPath()
    g.moveTo(185, 75)
    g.lineTo(205, 52)
    g.stroke()
    label(g, 50, 140, 156, 24, 'FEEDER')
    // mimic busbar + breaker
    g.strokeStyle = '#b52a20'
    g.lineWidth = 6
    g.beginPath()
    g.moveTo(0, 250)
    g.lineTo(w, 250)
    g.moveTo(128, 250)
    g.lineTo(128, 470)
    g.stroke()
    g.fillStyle = '#2e8b57'
    g.fillRect(108, 330, 40, 40)
    // breaker window
    g.fillStyle = 'rgba(40,60,70,0.85)'
    g.fillRect(40, 390, 176, 100)
    g.fillStyle = '#20262b'
    g.fillRect(70, 410, 116, 60)
    // cable compartment
    vents(g, 50, 560, 156, 10)
    label(g, 60, 660, 136, 22, 'DANGER 6.6 kV')
    g.fillStyle = '#e1b10f'
    g.beginPath()
    g.moveTo(128, 690)
    g.lineTo(112, 720)
    g.lineTo(144, 720)
    g.closePath()
    g.fill()
  }, { roughness: 0.5, metalness: 0.2 })

/** MCC front: tiers of withdrawable starter drawers with isolator cut-outs. (0.8:2.2) */
export const mccFrontMaterial = () =>
  make('mccFront', 256, 704, (g, w, h) => {
    g.fillStyle = '#c9ccc7'
    g.fillRect(0, 0, w, h)
    const tiers = 7
    const th = (h - 60) / tiers
    for (let i = 0; i < tiers; i++) {
      const y = 30 + i * th
      doorSeam(g, 8, y, w - 16, th - 4)
      g.fillStyle = '#2b2e31'
      g.fillRect(28, y + th * 0.3, 34, th * 0.4)
      label(g, 80, y + 12, 120, 16, `M${7100 + i * 3 + ((w * i) % 7)}`)
      lamps(g, 90, y + th - 22, ['#2fbf5f', '#c33', '#d8a21a'], 5, 18)
    }
    vents(g, 40, 6, 176, 3)
  }, { roughness: 0.5, metalness: 0.2 })

/** VSD cabinet front: keypad window, louvres, warning label. (1.0:2.2) */
export const vsdFrontMaterial = () =>
  make('vsdFront', 320, 704, (g, w, h) => {
    g.fillStyle = '#cfd1cc'
    g.fillRect(0, 0, w, h)
    doorSeam(g, 6, 6, w / 2 - 9, h - 12)
    doorSeam(g, w / 2 + 3, 6, w / 2 - 9, h - 12)
    g.fillStyle = '#1b1f22'
    g.fillRect(50, 110, 70, 90)
    g.fillStyle = '#7fe0ff'
    g.fillRect(56, 116, 58, 34)
    vents(g, 30, 420, 110, 18)
    vents(g, w / 2 + 25, 420, 110, 18)
    vents(g, w / 2 + 25, 60, 110, 12)
    label(g, 40, 260, 100, 20, 'VSD K-2200')
    g.fillStyle = '#e1b10f'
    g.fillRect(w / 2 + 40, 260, 80, 50)
    g.fillStyle = '#111'
    g.font = 'bold 14px Arial'
    g.textAlign = 'center'
    g.fillText('⚡ 690 V', w / 2 + 80, 290)
  }, { roughness: 0.5, metalness: 0.2 })

/** UPS cabinet front with mimic display. (0.8:1.9) */
export const upsFrontMaterial = () =>
  make('upsFront', 256, 608, (g, w, h) => {
    g.fillStyle = '#d9dbd7'
    g.fillRect(0, 0, w, h)
    doorSeam(g, 6, 6, w - 12, h - 12)
    g.fillStyle = '#20262b'
    g.fillRect(48, 70, 160, 110)
    g.fillStyle = '#9ee6b0'
    g.fillRect(56, 78, 144, 70)
    g.strokeStyle = '#1b3d28'
    g.lineWidth = 3
    g.strokeRect(70, 95, 30, 30)
    g.strokeRect(156, 95, 30, 30)
    g.beginPath()
    g.moveTo(100, 110)
    g.lineTo(156, 110)
    g.stroke()
    label(g, 60, 210, 136, 22, 'UPS 80 kVA')
    vents(g, 40, 300, 176, 30)
    lamps(g, 80, 160, ['#2fbf5f', '#2fbf5f', '#d8a21a'], 5, 24)
  }, { roughness: 0.5, metalness: 0.2 })

/** Fire & gas / ESD matrix panel with zone mimic. (0.8:2.1) */
export const fgPanelMaterial = (esd = false) =>
  make(esd ? 'esdFront' : 'fgFront', 256, 672, (g, w, h) => {
    g.fillStyle = esd ? '#c4c7c2' : '#d1d3ce'
    g.fillRect(0, 0, w, h)
    doorSeam(g, 6, 6, w - 12, h - 12)
    g.fillStyle = esd ? '#b52a20' : '#1f3c66'
    g.fillRect(20, 30, w - 40, 36)
    g.fillStyle = '#fff'
    g.font = 'bold 22px Arial'
    g.textAlign = 'center'
    g.fillText(esd ? 'ESD / PSD' : 'FIRE & GAS', w / 2, 56)
    // zone grid
    const r = rng(esd ? 21 : 17)
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 5; col++) {
        const x = 30 + col * 42
        const y = 100 + row * 30
        g.fillStyle = '#ece9e2'
        g.fillRect(x, y, 34, 22)
        g.fillStyle = r() < 0.08 ? '#d8a21a' : r() < 0.04 ? '#c33' : '#2fbf5f'
        g.fillRect(x + 3, y + 3, 10, 16)
      }
    g.fillStyle = '#333'
    g.fillRect(30, 480, 196, 120)
    g.fillStyle = '#89d0ff'
    g.fillRect(36, 486, 184, 70)
  }, { roughness: 0.5, metalness: 0.2 })

/** Generator control & synchronising panel. (1.6:2.1) */
export const genPanelMaterial = () =>
  make('genPanel', 512, 672, (g, w, h) => {
    g.fillStyle = '#c9ccc7'
    g.fillRect(0, 0, w, h)
    doorSeam(g, 6, 6, w / 2 - 9, h - 12)
    doorSeam(g, w / 2 + 3, 6, w / 2 - 9, h - 12)
    // analogue meters (V, A, Hz, kW, synchroscope)
    const meters = [[70, 110], [190, 110], [70, 230], [190, 230], [w / 2 + 128, 140]] as const
    meters.forEach(([x, y], i) => {
      g.fillStyle = '#efeee8'
      g.fillRect(x - 46, y - 46, 92, 92)
      g.strokeStyle = '#222'
      g.lineWidth = 2
      g.strokeRect(x - 46, y - 46, 92, 92)
      g.beginPath()
      g.arc(x, y + 10, 34, Math.PI * 1.15, Math.PI * 1.85)
      g.stroke()
      g.beginPath()
      g.moveTo(x, y + 10)
      g.lineTo(x + Math.cos(-1.2 - i * 0.2) * 32, y + 10 + Math.sin(-1.2 - i * 0.2) * 32)
      g.strokeStyle = '#b52a20'
      g.stroke()
      g.fillStyle = '#222'
      g.font = 'bold 14px Arial'
      g.textAlign = 'center'
      g.fillText(['V', 'A', 'Hz', 'kW', 'SYNC'][i], x, y + 36)
    })
    g.fillStyle = '#1b1f22'
    g.fillRect(w / 2 + 40, 260, 180, 110)
    g.fillStyle = '#7fe0ff'
    g.fillRect(w / 2 + 48, 268, 164, 70)
    g.fillStyle = '#0d2836'
    g.font = 'bold 18px "Courier New", monospace'
    g.textAlign = 'left'
    g.fillText('1500 rpm', w / 2 + 56, 292)
    g.fillText('412 V 50.0Hz', w / 2 + 56, 318)
    label(g, 40, 330, 180, 24, 'G-9310 1.5 MW')
    label(g, w / 2 + 50, 400, 160, 24, 'SYNC / AMF')
    vents(g, 40, 500, 180, 18)
    vents(g, w / 2 + 40, 500, 180, 18)
  }, { roughness: 0.5, metalness: 0.2 })

/** Firewater pump diesel controller (NFPA 20 style). (0.8:1.9) */
export const pumpCtrlMaterial = () =>
  make('pumpCtrl', 256, 608, (g, w, h) => {
    g.fillStyle = '#b52a20'
    g.fillRect(0, 0, w, h)
    doorSeam(g, 6, 6, w - 12, h - 12)
    g.fillStyle = '#fff'
    g.font = 'bold 20px Arial'
    g.textAlign = 'center'
    g.fillText('FIRE PUMP', w / 2, 50)
    g.fillText('CONTROLLER', w / 2, 74)
    g.fillStyle = '#1b1f22'
    g.fillRect(48, 100, 160, 90)
    g.fillStyle = '#9ee6b0'
    g.fillRect(56, 108, 144, 50)
    g.fillStyle = '#123'
    g.font = 'bold 16px "Courier New", monospace'
    g.fillText('AUTO  12.1 bar', w / 2, 138)
    label(g, 50, 220, 156, 22, 'DIESEL DRIVER')
    g.fillStyle = '#eee'
    g.fillRect(40, 270, 176, 200)
    g.fillStyle = '#222'
    g.font = '12px Arial'
    for (let i = 0; i < 9; i++) g.fillRect(52, 284 + i * 20, 120 - (i % 3) * 20, 4)
    vents(g, 50, 500, 156, 12)
  }, { roughness: 0.45, metalness: 0.15 })

// ------------------------------------------------------------------ screens (emissive)
/** display kinds; control rooms draw them live per room (scene/ccr), everything else uses these static pictures */
export type ScreenKind = 'trend' | 'mimic' | 'alarm' | 'cctv' | 'fgmap' | 'overview' | 'hmi' | 'esd'

function grid(g: G, w: number, h: number, step: number) {
  g.strokeStyle = 'rgba(120,140,160,0.18)'
  g.lineWidth = 1
  for (let x = 0; x < w; x += step) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, h)
    g.stroke()
  }
  for (let y = 0; y < h; y += step) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(w, y)
    g.stroke()
  }
}
function vessel(g: G, x: number, y: number, w: number, h: number, lvl: number) {
  g.fillStyle = '#9aa3ab'
  g.beginPath()
  g.roundRect(x, y, w, h, h / 2)
  g.fill()
  g.fillStyle = '#2d73b8'
  g.fillRect(x + h / 3, y + h * (1 - lvl), w - (2 * h) / 3, h * lvl - 3)
}
function header(g: G, w: number, title: string) {
  g.fillStyle = '#2b3440'
  g.fillRect(0, 0, w, 26)
  g.fillStyle = '#d7dde3'
  g.font = 'bold 15px Arial'
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillText(title, 10, 14)
  g.fillStyle = '#5fd18a'
  g.fillRect(w - 90, 8, 10, 10)
  g.fillStyle = '#d7dde3'
  g.fillText('12:47:08', w - 76, 14)
}

export function screenMaterial(kind: ScreenKind) {
  return make(`screen-${kind}`, 512, 320, (g, w, h) => {
    g.fillStyle = kind === 'cctv' ? '#1d2124' : '#0f1720'
    g.fillRect(0, 0, w, h)
    const r = rng(kind.length * 31 + 7)
    switch (kind) {
      case 'trend': {
        header(g, w, 'TREND: HP SEPARATOR V-1100')
        grid(g, w, h, 32)
        const cols = ['#4fc3f7', '#ffb74d', '#81c784', '#e57373']
        cols.forEach((c, k) => {
          g.strokeStyle = c
          g.lineWidth = 2
          g.beginPath()
          let y = 90 + k * 50
          for (let x = 0; x <= w; x += 6) {
            y += (r() - 0.5) * 8 + (150 + k * 30 - y) * 0.04
            if (x === 0) g.moveTo(x, y)
            else g.lineTo(x, y)
          }
          g.stroke()
        })
        break
      }
      case 'mimic':
      case 'overview': {
        header(g, w, kind === 'mimic' ? 'SEPARATION: TRAIN 1' : 'PLANT OVERVIEW: ALPHA')
        g.strokeStyle = '#7d8a96'
        g.lineWidth = 3
        g.beginPath()
        g.moveTo(20, 150)
        g.lineTo(80, 150)
        g.moveTo(230, 120)
        g.lineTo(300, 120)
        g.lineTo(300, 80)
        g.lineTo(440, 80)
        g.moveTo(230, 175)
        g.lineTo(330, 175)
        g.lineTo(330, 240)
        g.lineTo(480, 240)
        g.stroke()
        vessel(g, 80, 110, 150, 80, 0.45)
        vessel(g, 340, 210, 90, 50, 0.6)
        g.fillStyle = '#9aa3ab'
        g.beginPath()
        g.arc(460, 80, 22, 0, Math.PI * 2)
        g.fill()
        // values
        g.font = 'bold 14px "Courier New", monospace'
        g.textAlign = 'left'
        const vals = ['PT-1101 42.1 barg', 'LT-1102  45 %', 'FT-1301 31.2 kbd', 'TT-1104  68 °C']
        vals.forEach((v, i) => {
          g.fillStyle = '#0b0f14'
          g.fillRect(14 + (i % 2) * 250, 268 + Math.floor(i / 2) * 24, 220, 20)
          g.fillStyle = i === 1 ? '#ffd54f' : '#7cf29a'
          g.fillText(v, 20 + (i % 2) * 250, 279 + Math.floor(i / 2) * 24)
        })
        // valves
        g.fillStyle = '#5fd18a'
        for (const [x, y] of [[50, 150], [270, 120], [390, 80], [400, 240]]) {
          g.beginPath()
          g.moveTo(x - 9, y - 7)
          g.lineTo(x + 9, y + 7)
          g.lineTo(x + 9, y - 7)
          g.lineTo(x - 9, y + 7)
          g.closePath()
          g.fill()
        }
        break
      }
      case 'alarm': {
        header(g, w, 'ALARM SUMMARY')
        g.font = '13px "Courier New", monospace'
        g.textAlign = 'left'
        const pri = ['#e57373', '#ffb74d', '#ffd54f', '#90a4ae']
        for (let i = 0; i < 13; i++) {
          const y = 40 + i * 21
          g.fillStyle = i % 2 ? '#131d27' : '#18232f'
          g.fillRect(4, y - 12, w - 8, 20)
          g.fillStyle = pri[Math.floor(r() * 4)]
          g.fillText(`12:${String(46 - i).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}  ${['PAHH', 'LAL ', 'TAH ', 'FAL ', 'XA  '][i % 5]}-${1100 + Math.floor(r() * 900)}  ${['HIGH', 'LOW', 'TRIP', 'FAULT'][i % 4]}`, 12, y)
        }
        break
      }
      case 'cctv': {
        // 2×2 camera quad: grey deck scenes
        for (let q = 0; q < 4; q++) {
          const x = (q % 2) * (w / 2)
          const y = Math.floor(q / 2) * (h / 2)
          const grd = g.createLinearGradient(x, y, x, y + h / 2)
          grd.addColorStop(0, '#6d7a84')
          grd.addColorStop(0.55, '#4b555c')
          grd.addColorStop(1, '#2c3236')
          g.fillStyle = grd
          g.fillRect(x + 2, y + 2, w / 2 - 4, h / 2 - 4)
          g.fillStyle = '#8b949b'
          for (let k = 0; k < 5; k++) g.fillRect(x + 20 + r() * 180, y + 50 + r() * 60, 20 + r() * 40, 30 + r() * 50)
          g.fillStyle = '#d6dbe0'
          g.font = '12px Arial'
          g.textAlign = 'left'
          g.fillText(`CAM ${q + 1}  ${['WELLBAY', 'MODULE M2', 'LIFEBOAT', 'HELIDECK'][q]}`, x + 8, y + 16)
        }
        break
      }
      case 'fgmap': {
        header(g, w, 'F&G: FIRE AREA OVERVIEW')
        const zones = ['#2e7d4f', '#2e7d4f', '#2e7d4f', '#b8860b', '#2e7d4f', '#2e7d4f', '#2e7d4f', '#2e7d4f']
        zones.forEach((c, i) => {
          const x = 20 + (i % 4) * 120
          const y = 44 + Math.floor(i / 4) * 130
          g.fillStyle = c
          g.fillRect(x, y, 110, 120)
          g.fillStyle = '#e8f5e9'
          g.font = 'bold 13px Arial'
          g.textAlign = 'center'
          g.fillText(['WELLBAY', 'SEP', 'COMP', 'UTIL', 'PUMPS', 'LQ', 'HELI', 'BRIDGE'][i], x + 55, y + 20)
          for (let k = 0; k < 6; k++) {
            g.fillStyle = '#c8e6c9'
            g.beginPath()
            g.arc(x + 15 + r() * 80, y + 35 + r() * 75, 4, 0, Math.PI * 2)
            g.fill()
          }
        })
        break
      }
      case 'esd': {
        header(g, w, 'SHUTDOWN / ESD STATUS')
        g.font = 'bold 18px Arial'
        g.textAlign = 'center'
        ;['APS', 'ESD1', 'ESD2', 'PSD', 'USD'].forEach((l, i) => {
          g.fillStyle = '#2b3440'
          g.fillRect(14 + i * 98, 44, 90, 44)
          g.fillStyle = '#d7dde3'
          g.fillText(l, 59 + i * 98, 72)
        })
        g.fillStyle = '#7cf29a'
        g.font = 'bold 20px "Courier New", monospace'
        g.fillText('NO SHUTDOWNS LATCHED', w / 2, 200)
        break
      }
      case 'hmi': {
        g.fillStyle = '#123'
        g.fillRect(0, 0, w, h)
        header(g, w, 'LOCAL HMI')
        g.fillStyle = '#7cf29a'
        g.font = 'bold 40px "Courier New", monospace'
        g.textAlign = 'center'
        g.fillText('RUNNING', w / 2, 140)
        g.font = 'bold 26px "Courier New", monospace'
        g.fillText('1500 rpm   412 V', w / 2, 210)
        break
      }
    }
  }, { emissive: 1.1, roughness: 0.25, metalness: 0.1, color: '#cfd6dc' })
}
