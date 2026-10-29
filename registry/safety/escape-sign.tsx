// Escape-route sign: ISO 7010 emergency exit (E001 / E002) with direction arrow, or evacuation assembly point (E007), as an internally lit Ex sign box or a photoluminescent aluminium plate; on a post or wall. ISO 7010, ISO 3864-1, ISO 16069, EN 1838.
import * as THREE from 'three'
import { Kit, mat4, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { SAFETY } from '../lib/standards'
import { LED_GREEN, canvasMat, cableToDeck, mounted, stopPlug, type Mount } from './_fg'
import { arrow, assemblyPictogram, exitPictogram, tagBracket } from './_detectors'

export type EscapeSymbol = 'E001' | 'E002' | 'E007'
export type EscapeArrow = 'left' | 'right' | 'up' | 'down' | 'none'

export interface EscapeSignProps {
  /** E001 exit (left hand), E002 exit (right hand), E007 evacuation assembly point */
  symbol?: EscapeSymbol
  /** supplementary direction arrow (exit signs) */
  arrow?: EscapeArrow
  /** internal: Ex sign box with lit face; photoluminescent: aluminium plate */
  lighting?: 'internal' | 'photoluminescent'
  mount?: Mount
  /** sign centre above the deck, m */
  height?: number
  /** text band under the symbol */
  legend?: string
  lit?: boolean
  tag?: string
}

export const defaults = { symbol: 'E002' as EscapeSymbol, arrow: 'right' as EscapeArrow, lighting: 'internal' as 'internal' | 'photoluminescent', mount: 'pole' as Mount, height: 2.2, legend: 'EXIT', lit: true, tag: 'ES-0101' }

export function EscapeSign(props: EscapeSignProps & GroupProps) {
  const { symbol, arrow: arr, lighting, mount, height, legend, lit, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(1, height)
  const data = useKit((k) => build(k, symbol, arr, lighting, mount, h, legend, lit, tag), [symbol, arr, lighting, mount, h, legend, lit, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default EscapeSign

/** Sign face: exit signs are landscape (pictogram + arrow over a legend band), E007 is square over a legend band. */
function faceMat(symbol: EscapeSymbol, arr: EscapeArrow, legend: string, glow: number, photo: boolean) {
  const muster = symbol === 'E007'
  const W = 512
  const H = muster ? 640 : 336
  return canvasMat(`esc-${symbol}-${arr}-${legend}-${glow}-${photo}`, W, H, (g) => {
    const green = SAFETY.green
    g.fillStyle = photo ? '#f4f1d0' : '#ffffff'
    g.fillRect(0, 0, W, H)
    if (muster) {
      g.fillStyle = green
      g.fillRect(16, 16, 480, 480)
      g.save()
      g.translate(56, 56)
      assemblyPictogram(g, 400)
      g.restore()
    } else {
      g.fillStyle = green
      g.fillRect(16, 16, 480, 240)
      const toLeft = symbol === 'E001'
      const xs = arr === 'none' ? 136 : toLeft ? 256 : 16
      g.save()
      g.translate(xs + 20, 36)
      exitPictogram(g, 200, toLeft)
      g.restore()
      if (arr !== 'none') {
        g.save()
        g.translate(toLeft ? 36 : 276, 36)
        arrow(g, 200, arr)
        g.restore()
        g.fillStyle = photo ? '#f4f1d0' : '#ffffff'
        g.fillRect(254, 16, 4, 240)
      }
    }
    if (legend) {
      const y0 = muster ? 496 : 256
      const hb = H - y0 - 16
      g.fillStyle = green
      g.fillRect(16, y0 + 8, 480, hb - 8)
      g.fillStyle = photo ? '#f4f1d0' : '#ffffff'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      let size = Math.min(64, hb * 0.6)
      g.font = `bold ${size}px Arial, sans-serif`
      while (g.measureText(legend.toUpperCase()).width > 440 && size > 12) g.font = `bold ${(size -= 2)}px Arial, sans-serif`
      g.fillText(legend.toUpperCase(), 256, y0 + 4 + hb / 2)
    }
  }, glow ? { emissive: glow } : {})
}

function build(k: Kit, symbol: EscapeSymbol, arr: EscapeArrow, lighting: 'internal' | 'photoluminescent', mount: Mount, h: number, legend: string, lit: boolean, tag: string) {
  const muster = symbol === 'E007'
  const W = muster ? 0.6 : 0.33 // typical: Ex exit box ≈ 356 × 175 mm, muster board 600 mm
  const H = W * ((muster ? 640 : 336) / 512)
  const internal = lighting === 'internal'
  const D = internal ? 0.07 : 0.003 // typical
  const glow = internal ? (lit ? 0.55 : 0.05) : 0.12
  const mat = faceMat(symbol, arr, legend, glow, !internal)
  let gland: V3 = [0, 0, 0]
  const zf = mounted(k, mount, h, [0.06, H - 0.04], () => {
    // stand-off rails behind the sign
    for (const s of [-1, 1]) k.box('stainless', [0.04, 0.025, 0.02], [0, s * (H / 2 - 0.06), 0.01])
    const z0 = 0.02
    if (internal) {
      // extruded aluminium Ex sign box: frame, back, polycarbonate face over the printed legend, gland under
      k.rbox('aluminium', [W + 0.03, H + 0.03, D], 0.01, [0, 0, z0 + D / 2])
      k.add(mat, new THREE.PlaneGeometry(W, H), mat4([0, 0, z0 + D + 0.0005]))
      k.box('glass', [W, H, 0.003], [0, 0, z0 + D + 0.002])
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.cyl('stainless', 0.004, 0.004, [sx * (W / 2 + 0.008), sy * (H / 2 + 0.008), z0 + D + 0.002], 'z', 8)
      k.sphere(LED_GREEN, 0.004, [W / 2 - 0.0, -H / 2 - 0.0085, z0 + D - 0.005], undefined, 8)
      k.hex('brass', 0.026, 0.014, [-W / 4, -H / 2 - 0.022, z0 + D / 2], 'y')
      stopPlug(k, [W / 4, -H / 2 - 0.019, z0 + D / 2], '-y', 0.022)
      gland = [-W / 4, -H / 2 - 0.035, z0 + D / 2]
    } else {
      // 2 mm aluminium plate with rolled edge, photoluminescent face, four rivets
      k.box('aluminium', [W + 0.01, H + 0.01, D], [0, 0, z0 + D / 2])
      k.add(mat, new THREE.PlaneGeometry(W, H), mat4([0, 0, z0 + D + 0.0005]))
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.cyl('stainless', 0.005, 0.002, [sx * (W / 2 - 0.012), sy * (H / 2 - 0.012), z0 + D + 0.001], 'z', 10)
    }
  }, h + H / 2 + 0.06)
  if (internal) cableToDeck(k, mount, [gland[0], gland[1] + h, gland[2] + zf])
  tagBracket(k, mount, Math.max(0.3, h - H / 2 - 0.25), tag, 0.12)
}
