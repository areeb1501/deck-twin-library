/** Procedural textures for the environment (accommodation facade, PSV). */
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
