/** Procedural textures for the environment (accommodation facade, helideck markings, PSV). */
import * as THREE from 'three'

/** Facade tile: 25.6 m wide x 12.8 m (4 storeys of 3.2 m). Used with world-metre UVs. */
export const FACADE = { w: 25.6, h: 12.8, baseY: 38 }

let facade: { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } | null = null
export function facadeTextures() {
  if (facade) return facade
  const PX = 40 // px per metre
  const W = FACADE.w * PX
  const H = FACADE.h * PX
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    return c
  }
  const cm = mk()
  const ce = mk()
  const g = cm.getContext('2d')!
  const e = ce.getContext('2d')!
  g.fillStyle = '#e7e9e6'
  g.fillRect(0, 0, W, H)
  e.fillStyle = '#000'
  e.fillRect(0, 0, W, H)
  // cladding panel joints
  g.strokeStyle = 'rgba(80,90,95,0.35)'
  g.lineWidth = 2
  for (let x = 0; x <= W; x += 1.2 * PX) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, H)
    g.stroke()
  }
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let s = 0; s < 4; s++) {
    const yTop = H - (s + 1) * 3.2 * PX // canvas y down
    // floor band
    g.fillStyle = '#c9cdcb'
    g.fillRect(0, yTop + 3.2 * PX - 0.25 * PX, W, 0.25 * PX)
    for (let k = 0; k < 12; k++) {
      const x = (0.75 + k * 2.13) * PX
      const y = yTop + 1.0 * PX
      const w = 1.2 * PX
      const h = 1.05 * PX
      g.fillStyle = '#3b4a55'
      g.fillRect(x - 3, y - 3, w + 6, h + 6)
      const sky = g.createLinearGradient(0, y, 0, y + h)
      sky.addColorStop(0, '#5f7d92')
      sky.addColorStop(1, '#22313b')
      g.fillStyle = sky
      g.fillRect(x, y, w, h)
      g.fillStyle = '#9aa6ad'
      g.fillRect(x + w / 2 - 1, y, 2, h)
      if (rnd() > 0.55) {
        e.fillStyle = rnd() > 0.5 ? '#ffd9a0' : '#fff1d6'
        e.fillRect(x, y, w, h)
        g.fillStyle = '#d8c8a8'
        g.fillRect(x, y, w, h)
      }
    }
  }
  const map = new THREE.CanvasTexture(cm)
  map.colorSpace = THREE.SRGBColorSpace
  const emissive = new THREE.CanvasTexture(ce)
  emissive.colorSpace = THREE.SRGBColorSpace
  for (const t of [map, emissive]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1 / FACADE.w, 1 / FACADE.h)
    t.offset.set(0, -FACADE.baseY / FACADE.h)
    t.anisotropy = 8
  }
  facade = { map, emissive }
  return facade
}

let heli: THREE.CanvasTexture | null = null
/** Helideck surface (CAP 437 style): dark green, white perimeter line, yellow TD/PM circle and H, landing net. */
export function helideckTexture() {
  if (heli) return heli
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const R = S / 2
  const m = (metres: number) => (metres / 11.5) * R // circumradius 11.5 m == R px
  g.fillStyle = '#2f5d3a'
  g.fillRect(0, 0, S, S)
  // octagon perimeter line (white, 0.3 m)
  g.strokeStyle = '#f4f4f0'
  g.lineWidth = m(0.3)
  g.beginPath()
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8
    const r = m(11.5 - 0.35)
    const x = R + Math.cos(a) * r
    const y = R + Math.sin(a) * r
    if (k === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  // landing net (rope grid 12 x 12 m)
  g.strokeStyle = 'rgba(25,35,25,0.55)'
  g.lineWidth = m(0.05)
  const n = m(6)
  for (let v = -n; v <= n + 1; v += m(0.25)) {
    g.beginPath()
    g.moveTo(R + v, R - n)
    g.lineTo(R + v, R + n)
    g.stroke()
    g.beginPath()
    g.moveTo(R - n, R + v)
    g.lineTo(R + n, R + v)
    g.stroke()
  }
  // TD/PM circle (yellow, 1 m wide, inner diameter ~ 0.5 D)
  g.strokeStyle = '#f2c200'
  g.lineWidth = m(1.0)
  g.beginPath()
  g.arc(R, R, m(3.4), 0, Math.PI * 2)
  g.stroke()
  // H (yellow per spec of this model): 4 x 3 m, bars 0.75 m
  g.fillStyle = '#f2c200'
  const hw = m(1.5)
  const hh = m(2.0)
  const b = m(0.75)
  g.fillRect(R - hw, R - hh, b, 2 * hh)
  g.fillRect(R + hw - b, R - hh, b, 2 * hh)
  g.fillRect(R - hw, R - b / 2, 2 * hw, b)
  // max weight box
  g.fillStyle = '#f4f4f0'
  g.font = `700 ${Math.round(m(0.9))}px Arial, sans-serif`
  g.textAlign = 'center'
  g.fillText('12.8t', R, R + m(8.3))
  heli = new THREE.CanvasTexture(c)
  heli.colorSpace = THREE.SRGBColorSpace
  heli.anisotropy = 8
  return heli
}
