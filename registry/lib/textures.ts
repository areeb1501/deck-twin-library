// Procedural canvas-texture materials: dials, tag plates, LCDs, grating, mesh guards, signs, level gauges.
import * as THREE from 'three'
import { weather } from './materials'

const cache = new Map<string, THREE.MeshStandardMaterial>()

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

function texMaterial(
  key: string,
  draw: () => HTMLCanvasElement,
  opts: { metalness?: number; roughness?: number; alphaTest?: number; side?: THREE.Side; repeat?: boolean; emissive?: boolean; weather?: number } = {},
) {
  let m = cache.get(key)
  if (m) return m
  const tex = new THREE.CanvasTexture(draw())
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
  }
  m = new THREE.MeshStandardMaterial({
    map: tex,
    metalness: opts.metalness ?? 0.1,
    roughness: opts.roughness ?? 0.45,
    alphaTest: opts.alphaTest ?? 0,
    transparent: false,
    side: opts.side ?? THREE.FrontSide,
  })
  if (opts.emissive) {
    m.emissive = new THREE.Color('#ffffff')
    m.emissiveMap = tex
    m.emissiveIntensity = 0.35
  }
  m.name = key
  weather(m, opts.weather ?? 0)
  cache.set(key, m)
  return m
}

// Bourdon-tube gauge / bimetal thermometer dial (CircleGeometry UVs).
export function dialMaterial(unit: 'bar' | '°C' = 'bar', max = 100) {
  return texMaterial(`dial-${unit}-${max}`, () => {
    const S = 512
    const { c, g } = canvas(S, S)
    const cx = S / 2
    g.fillStyle = '#1a1a1a'
    g.fillRect(0, 0, S, S)
    g.beginPath()
    g.arc(cx, cx, S * 0.47, 0, Math.PI * 2)
    g.fillStyle = '#f7f6f0'
    g.fill()
    const a0 = Math.PI * 0.75
    const span = Math.PI * 1.5
    // red zone
    g.beginPath()
    g.arc(cx, cx, S * 0.38, a0 + span * 0.8, a0 + span)
    g.lineWidth = S * 0.035
    g.strokeStyle = '#d0281e'
    g.stroke()
    g.beginPath()
    g.arc(cx, cx, S * 0.38, a0 + span * 0.0, a0 + span * 0.8)
    g.strokeStyle = '#2a9a4a'
    g.lineWidth = S * 0.012
    g.stroke()
    g.strokeStyle = '#111'
    g.fillStyle = '#111'
    g.font = `bold ${S * 0.065}px Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (let i = 0; i <= 50; i++) {
      const a = a0 + (i / 50) * span
      const major = i % 5 === 0
      const r1 = S * 0.42
      const r0 = major ? S * 0.35 : S * 0.39
      g.lineWidth = major ? S * 0.012 : S * 0.005
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0)
      g.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1)
      g.stroke()
      if (i % 10 === 0) {
        const v = Math.round((i / 50) * max)
        g.fillText(String(v), cx + Math.cos(a) * S * 0.28, cx + Math.sin(a) * S * 0.28)
      }
    }
    g.font = `bold ${S * 0.07}px Arial, sans-serif`
    g.fillText(unit, cx, cx + S * 0.17)
    g.font = `${S * 0.04}px Arial, sans-serif`
    g.fillText('EN 837-1', cx, cx - S * 0.16)
    // pointer at ~58 %
    const ap = a0 + span * 0.58
    g.save()
    g.translate(cx, cx)
    g.rotate(ap)
    g.fillStyle = '#111'
    g.beginPath()
    g.moveTo(-S * 0.06, -S * 0.012)
    g.lineTo(S * 0.4, 0)
    g.lineTo(-S * 0.06, S * 0.012)
    g.closePath()
    g.fill()
    g.restore()
    g.beginPath()
    g.arc(cx, cx, S * 0.03, 0, Math.PI * 2)
    g.fillStyle = '#222'
    g.fill()
    return c
  }, { metalness: 0, roughness: 0.25 })
}

// Stamped stainless tag plate.
export function tagMaterial(tag: string) {
  return texMaterial(`tag-${tag}`, () => {
    const { c, g } = canvas(256, 80)
    const grd = g.createLinearGradient(0, 0, 256, 80)
    grd.addColorStop(0, '#d9dde0')
    grd.addColorStop(0.5, '#b8bec3')
    grd.addColorStop(1, '#d0d4d8')
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 80)
    g.strokeStyle = '#6d7378'
    g.lineWidth = 4
    g.strokeRect(3, 3, 250, 74)
    g.fillStyle = '#7a8086'
    for (const x of [14, 242]) {
      g.beginPath()
      g.arc(x, 40, 6, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#1c1f22'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = 44
    g.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`
    while (g.measureText(tag).width > 200 && size > 14) {
      size -= 2
      g.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`
    }
    g.fillText(tag, 128, 42)
    return c
  }, { metalness: 0.7, roughness: 0.35 })
}

// Transmitter LCD readout.
export function lcdMaterial() {
  return texMaterial('lcd', () => {
    const { c, g } = canvas(256, 256)
    g.fillStyle = '#9fb59a'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#1c2a1d'
    g.font = 'bold 74px "Courier New", monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('42.7', 128, 112)
    g.font = 'bold 30px Arial, sans-serif'
    g.fillText('BAR G', 128, 176)
    g.fillRect(40, 60, 176, 6)
    for (let i = 0; i < 10; i++) g.fillRect(40 + i * 18, 44, 12, 10)
    return c
  }, { metalness: 0, roughness: 0.15, emissive: true })
}

// Expanded-metal mesh (alpha-tested), for coupling guards.
export function meshGuardMaterial(color = '#e8a413') {
  return texMaterial(`mesh-${color}`, () => {
    const { c, g } = canvas(128, 128)
    g.clearRect(0, 0, 128, 128)
    g.strokeStyle = color
    g.lineWidth = 7
    for (let i = -128; i < 256; i += 32) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i + 64, 128)
      g.stroke()
      g.beginPath()
      g.moveTo(i + 64, 0)
      g.lineTo(i, 128)
      g.stroke()
    }
    return c
  }, { metalness: 0.3, roughness: 0.5, alphaTest: 0.5, side: THREE.DoubleSide, repeat: true })
}

// Bar grating (30 x 100 mm pitch), alpha-tested. UV 1 unit = 0.3 m.
export function gratingMaterial() {
  return texMaterial('grating', () => {
    const { c, g } = canvas(128, 128)
    g.clearRect(0, 0, 128, 128)
    g.fillStyle = '#8b9195'
    for (let x = 0; x < 128; x += 13) g.fillRect(x, 0, 3, 128) // bearing bars ~ every 30 mm
    for (let y = 0; y < 128; y += 42) g.fillRect(0, y, 128, 3) // cross bars ~ every 100 mm
    return c
  }, { metalness: 0.7, roughness: 0.45, alphaTest: 0.5, side: THREE.DoubleSide, repeat: true })
}

// Rectangular signage plates.
export function signMaterial(kind: 'ler' | 'hv' | 'exit' | 'muster' | 'noentry', text = 'LOCAL EQUIPMENT ROOM') {
  return texMaterial(`sign-${kind}-${text}`, () => {
    const { c, g } = canvas(512, 256)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (kind === 'hv') {
      g.fillStyle = '#f4c414'
      g.fillRect(0, 0, 512, 256)
      g.fillStyle = '#111'
      g.beginPath()
      g.moveTo(256, 20)
      g.lineTo(390, 200)
      g.lineTo(122, 200)
      g.closePath()
      g.lineWidth = 14
      g.strokeStyle = '#111'
      g.stroke()
      g.beginPath()
      g.moveTo(270, 70)
      g.lineTo(230, 140)
      g.lineTo(262, 140)
      g.lineTo(240, 190)
      g.lineTo(290, 120)
      g.lineTo(258, 120)
      g.closePath()
      g.fill()
      g.font = 'bold 34px Arial, sans-serif'
      g.fillText('DANGER  HIGH VOLTAGE', 256, 232)
    } else if (kind === 'exit') {
      g.fillStyle = '#108a3c'
      g.fillRect(0, 0, 512, 256)
      g.fillStyle = '#fff'
      g.font = 'bold 110px Arial, sans-serif'
      g.fillText('EXIT', 300, 130)
      g.fillRect(40, 110, 120, 30)
      g.beginPath()
      g.moveTo(40, 80)
      g.lineTo(0, 125)
      g.lineTo(40, 170)
      g.fill()
    } else if (kind === 'noentry') {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, 512, 256)
      g.fillStyle = '#c3221a'
      g.beginPath()
      g.arc(110, 128, 90, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#fff'
      g.fillRect(45, 112, 130, 32)
      g.fillStyle = '#111'
      g.font = 'bold 40px Arial, sans-serif'
      g.fillText('AUTHORISED', 350, 100)
      g.fillText('PERSONNEL ONLY', 350, 156)
    } else if (kind === 'muster') {
      g.fillStyle = '#108a3c'
      g.fillRect(0, 0, 512, 256)
      g.fillStyle = '#fff'
      g.font = 'bold 56px Arial, sans-serif'
      g.fillText(text, 256, 128)
    } else {
      g.fillStyle = '#1f4e9a'
      g.fillRect(0, 0, 512, 256)
      g.strokeStyle = '#fff'
      g.lineWidth = 10
      g.strokeRect(14, 14, 484, 228)
      g.fillStyle = '#fff'
      let size = 60
      g.font = `bold ${size}px Arial, sans-serif`
      while (g.measureText(text).width > 450 && size > 18) {
        size -= 2
        g.font = `bold ${size}px Arial, sans-serif`
      }
      g.fillText(text, 256, 128)
    }
    return c
  }, { metalness: 0.1, roughness: 0.5 })
}

// Magnetic level gauge flag strip + graduated scale (texture spans the box face, v = height).
export function levelFlagMaterial(level = 0.55) {
  return texMaterial(`flags-${level}`, () => {
    const { c, g } = canvas(64, 512)
    const n = 64
    for (let i = 0; i < n; i++) {
      const y = 512 - ((i + 1) / n) * 512
      g.fillStyle = i / n < level ? '#ff5a10' : '#f4f4f0'
      g.fillRect(0, y, 64, 512 / n)
      g.fillStyle = '#222'
      g.fillRect(0, y, 64, 1)
    }
    return c
  }, { metalness: 0.05, roughness: 0.4 })
}
export function levelScaleMaterial() {
  return texMaterial('lg-scale', () => {
    const { c, g } = canvas(64, 512)
    g.fillStyle = '#e8e8e2'
    g.fillRect(0, 0, 64, 512)
    g.fillStyle = '#111'
    for (let i = 0; i <= 50; i++) {
      const y = 512 - (i / 50) * 510 - 1
      g.fillRect(0, y, i % 5 === 0 ? 40 : 20, i % 5 === 0 ? 3 : 1)
    }
    g.font = 'bold 14px Arial'
    for (let i = 0; i <= 10; i++) g.fillText(String(i * 10), 40, 512 - i * 51 + 5)
    return c
  }, { metalness: 0.05, roughness: 0.5 })
}

// Louvre / fan-guard dark grille (alpha)
export function fanGuardMaterial() {
  return texMaterial('fanguard', () => {
    const { c, g } = canvas(256, 256)
    g.clearRect(0, 0, 256, 256)
    g.strokeStyle = '#2a2d30'
    g.lineWidth = 5
    for (let r = 16; r < 128; r += 14) {
      g.beginPath()
      g.arc(128, 128, r, 0, Math.PI * 2)
      g.stroke()
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      g.beginPath()
      g.moveTo(128, 128)
      g.lineTo(128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126)
      g.stroke()
    }
    return c
  }, { metalness: 0.4, roughness: 0.5, alphaTest: 0.5, side: THREE.DoubleSide })
}

// Black/yellow hazard chevrons (ISO 3864), repeat along U.
export function hazardStripeMaterial() {
  return texMaterial('hazard', () => {
    const { c, g } = canvas(128, 128)
    g.fillStyle = '#e5b114'
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = '#151515'
    for (let i = -128; i < 256; i += 64) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i + 32, 0)
      g.lineTo(i + 160, 128)
      g.lineTo(i + 128, 128)
      g.closePath()
      g.fill()
    }
    return c
  }, { metalness: 0.2, roughness: 0.5, repeat: true, weather: 0.8 })
}

// Raised-pattern checker plate. UV 1 unit = 0.25 m.
export function checkerPlateMaterial() {
  return texMaterial('checker', () => {
    const { c, g } = canvas(128, 128)
    g.fillStyle = '#7a7f83'
    g.fillRect(0, 0, 128, 128)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        g.save()
        g.translate(x * 32 + 16, y * 32 + 16)
        g.rotate((x + y) % 2 ? Math.PI / 4 : -Math.PI / 4)
        g.fillStyle = '#9aa0a4'
        g.fillRect(-11, -2.5, 22, 5)
        g.restore()
      }
    return c
  }, { metalness: 0.6, roughness: 0.45, repeat: true, weather: 1.2 })
}

// Painted or plated text panel, e.g. equipment tag stencils and signage.
export function textMaterial(text: string, bg = '#f2f2ee', fg = '#111111', w = 512, h = 128) {
  return texMaterial(`text-${text}-${bg}-${fg}-${w}x${h}`, () => {
    const { c, g } = canvas(w, h)
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.fillStyle = fg
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = Math.round(h * 0.62)
    g.font = `bold ${size}px Arial, sans-serif`
    while (g.measureText(text).width > w * 0.9 && size > 10) {
      size -= 2
      g.font = `bold ${size}px Arial, sans-serif`
    }
    g.fillText(text, w / 2, h / 2 + 2)
    return c
  }, { metalness: 0.1, roughness: 0.55 })
}

// Louvred panel (HVAC intakes, enclosure vents). Repeat along V.
export function louvreMaterial(color = '#c9ccc8') {
  return texMaterial(`louvre-${color}`, () => {
    const { c, g } = canvas(64, 64)
    g.fillStyle = color
    g.fillRect(0, 0, 64, 64)
    const grd = g.createLinearGradient(0, 0, 0, 16)
    grd.addColorStop(0, 'rgba(0,0,0,0.55)')
    grd.addColorStop(0.6, 'rgba(0,0,0,0.05)')
    grd.addColorStop(1, 'rgba(255,255,255,0.15)')
    g.fillStyle = grd
    for (let y = 0; y < 64; y += 16) {
      g.save()
      g.translate(0, y)
      g.fillRect(0, 0, 64, 16)
      g.restore()
    }
    return c
  }, { metalness: 0.4, roughness: 0.5, repeat: true, weather: 0.8 })
}
