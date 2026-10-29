// Fire & gas / fire alarm control panel or ESD mimic panel: wall cabinet or floor desk, mimic, LEDs, push-buttons under flaps, keyswitches. EN 54-2, IEC 61511.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { furnitureMats } from './_furniture'
import { canvasMaterial } from './_textures'

export interface FireAlarmPanelProps {
  panel?: 'fire-alarm' | 'esd-mimic'
  /** wall cabinet (wall plane z = 0) or floor-standing desk */
  mount?: 'wall' | 'floor'
  /** zone LEDs on the fire alarm panel */
  zones?: number
  /** wall cabinet centre above the floor, m */
  elevation?: number
  tag?: string
}

export const defaults = {
  panel: 'fire-alarm' as 'fire-alarm' | 'esd-mimic',
  mount: 'wall' as 'wall' | 'floor',
  zones: 16,
  elevation: 1.5,
  tag: 'FACP-01',
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function FireAlarmPanel(props: FireAlarmPanelProps & GroupProps) {
  const { panel, mount, zones, elevation, tag, ...group } = { ...defaults, ...props }
  const b = useMemo(() => build({ panel, mount, zones, elevation, tag }), [panel, mount, zones, elevation, tag])
  useEffect(() => () => b.geometry.dispose(), [b])
  return (
    <group {...group}>
      <KitMesh data={b} />
    </group>
  )
}

export default FireAlarmPanel

type G = CanvasRenderingContext2D
function txt(g: G, s: string, x: number, y: number, px: number, color = '#16191c', align: CanvasTextAlign = 'center', bold = true) {
  g.font = `${bold ? 'bold ' : ''}${px}px Arial, sans-serif`
  g.fillStyle = color
  g.textAlign = align
  g.textBaseline = 'middle'
  g.fillText(s, x, y)
}

/** Fire alarm front fascia, 600 × 700 mm at 1 px = 1 mm. LED / button positions match facpLayout(). */
function facpMaterial(zones: number) {
  return canvasMaterial(`facp-${zones}`, 600, 700, (g, w, h) => {
    g.fillStyle = '#d7d8d2'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#b8241c'
    g.fillRect(0, 0, w, 70)
    txt(g, 'FIRE & GAS ALARM PANEL', w / 2, 35, 30, '#ffffff')
    // LCD bezel
    g.fillStyle = '#26292c'
    g.fillRect(40, 100, 360, 140)
    g.fillStyle = '#2f6fbf'
    g.fillRect(52, 112, 336, 116)
    txt(g, 'SYSTEM NORMAL', 220, 140, 24, '#e8f1ff')
    txt(g, '29/10/26  14:32', 220, 170, 20, '#e8f1ff', 'center', false)
    txt(g, 'SAMPLE · SIMULATED', 220, 205, 16, '#c9dcff')
    // status LED labels
    const st = ['FIRE', 'GAS', 'FAULT', 'DISABLED', 'TEST', 'POWER']
    st.forEach((s, i) => txt(g, s, 470, 115 + i * 24, 15, '#16191c', 'left'))
    // zone LEDs
    txt(g, 'ZONES', 40, 270, 16, '#16191c', 'left')
    const n = Math.min(32, zones)
    for (let i = 0; i < n; i++) {
      const c = i % 2
      const r = Math.floor(i / 2)
      txt(g, `Z${String(i + 1).padStart(2, '0')}`, 40 + c * 270, 300 + r * 22, 14, '#16191c', 'left', false)
      g.strokeStyle = '#9a9c98'
      g.lineWidth = 1
      g.strokeRect(100 + c * 270, 291 + r * 22, 190, 18)
    }
    // button legends
    const bl = ['SILENCE', 'MUTE', 'RESET', 'EVACUATE', 'MORE']
    bl.forEach((s, i) => txt(g, s, 70 + i * 115, h - 40, 14))
    txt(g, 'ACCESS', 520, 270, 14)
  }, { roughness: 0.5 })
}

/** ESD mimic: platform outline, process blocks, flow lines, shutdown legends. 1000 × 600 px. */
function mimicMaterial() {
  return canvasMaterial('esd-mimic', 1000, 600, (g, w, h) => {
    g.fillStyle = '#c9ccc6'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#20252b'
    g.fillRect(0, 0, w, 56)
    txt(g, 'EMERGENCY SHUTDOWN MIMIC', w / 2, 28, 28, '#ffffff')
    g.strokeStyle = '#2b3036'
    g.lineWidth = 4
    g.strokeRect(40, 80, w - 80, h - 140)
    const blocks: [string, number, number][] = [
      ['WELLS', 70, 260],
      ['INLET', 230, 260],
      ['SEPARATION', 390, 260],
      ['COMPRESSION', 600, 160],
      ['OIL EXPORT', 600, 360],
      ['GAS EXPORT', 810, 160],
      ['RISERS', 810, 360],
    ]
    g.strokeStyle = '#3a4047'
    g.lineWidth = 6
    const ln = (a: [number, number], b: [number, number]) => {
      g.beginPath()
      g.moveTo(...a)
      g.lineTo(...b)
      g.stroke()
    }
    ln([190, 300], [230, 300])
    ln([350, 300], [390, 300])
    ln([530, 280], [560, 200])
    ln([560, 200], [600, 200])
    ln([530, 320], [560, 400])
    ln([560, 400], [600, 400])
    ln([740, 200], [810, 200])
    ln([740, 400], [810, 400])
    for (const [s, x, y] of blocks) {
      g.fillStyle = '#e8e9e4'
      g.fillRect(x, y, 140 - (x === 390 ? 0 : 0), 80)
      g.strokeStyle = '#2b3036'
      g.lineWidth = 3
      g.strokeRect(x, y, 140, 80)
      txt(g, s, x + 70, y + 26, 16)
      g.strokeStyle = '#2b3036'
      g.beginPath()
      g.arc(x + 70, y + 56, 11, 0, Math.PI * 2)
      g.stroke()
    }
    txt(g, 'LAMP TEST', 100, h - 30, 15)
    txt(g, 'SAMPLE LAYOUT · SIMULATED', w - 40, h - 30, 15, '#6b2d82', 'right')
  }, { roughness: 0.5 })
}

/** LED positions on the mimic (texture px) for each process block. */
const MIMIC_LEDS: [number, number][] = [[140, 316], [300, 316], [460, 316], [670, 216], [670, 416], [880, 216], [880, 416]]

function build(p: typeof defaults) {
  const k = new Kit()
  const M = furnitureMats()
  const body = paint('#d5d6d0', { metalness: 0.25, roughness: 0.45, clearcoat: 0.2, weather: 0 })
  const red = paint('#c0261c', { metalness: 0.2, roughness: 0.35, clearcoat: 0.5, weather: 0 })
  const yellow = paint('#e5b114', { metalness: 0.2, roughness: 0.4, clearcoat: 0.4, weather: 0 })
  const flap = paint('#d8f0ff', { metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 0, weather: 0 })
  const led = (pos: V3, mat: THREE.Material, axis: 'z' | V3 = 'z') => {
    k.cyl('rubberBlack', 0.0065, 0.004, pos, axis, 10)
    const n = new THREE.Vector3(...(axis === 'z' ? [0, 0, 1] : axis)).normalize()
    k.cyl(mat, 0.0045, 0.004, new THREE.Vector3(...pos).addScaledVector(n, 0.003).toArray() as V3, axis, 10)
  }
  /** red mushroom button under a hinged clear flap, on a face whose normal is the local +Z of frame m */
  const guarded = (m: THREE.Matrix4, color: THREE.Material) =>
    k.with(m, () => {
      k.box(yellow, [0.09, 0.09, 0.006], [0, 0, 0.003])
      k.cyl('nut', 0.022, 0.02, [0, 0, 0.016], 'z', 16)
      k.cyl(color, 0.026, 0.016, [0, 0, 0.032], 'z', 20)
      k.box(flap, [0.08, 0.08, 0.004], [0, 0, 0.058])
      for (const s of [-1, 1]) k.box(flap, [0.004, 0.08, 0.05], [s * 0.04, 0, 0.034])
      k.box(flap, [0.08, 0.004, 0.05], [0, -0.04, 0.034])
      k.cyl(M.housing, 0.005, 0.07, [0, 0.044, 0.058], 'x', 8)
    })
  const keyswitch = (m: THREE.Matrix4) =>
    k.with(m, () => {
      k.cyl('stainless', 0.015, 0.012, [0, 0, 0.006], 'z', 16)
      k.cyl('brass', 0.008, 0.006, [0, 0, 0.014], 'z', 12)
      k.box('stainless', [0.004, 0.012, 0.004], [0, 0, 0.018])
    })

  if (p.panel === 'fire-alarm') {
    const W = 0.6
    const H = 0.7
    const D = 0.18
    const floor = p.mount === 'floor'
    const yc = floor ? 1.3 : clamp(p.elevation, 0.8, 2.2)
    const zc = floor ? 0 : D / 2
    if (floor) {
      k.box(body, [W, yc - H / 2, D + 0.1], [0, (yc - H / 2) / 2, zc])
      k.box('rubberBlack', [W - 0.04, 0.08, D + 0.06], [0, 0.04, zc])
    }
    k.rbox(body, [W, H, D], 0.008, [0, yc, zc])
    k.plane(facpMaterial(clamp(Math.round(p.zones), 4, 32)), W - 0.02, H - 0.02, [0, yc, zc + D / 2 + 0.0005])
    const px = (x: number, y: number, z = 0): V3 => [-W / 2 + 0.01 + (x / 600) * (W - 0.02), yc + H / 2 - 0.01 - (y / 700) * (H - 0.02), zc + D / 2 + z]
    // status LEDs
    for (let i = 0; i < 6; i++) led(px(455, 115 + i * 24, 0.002), i === 5 ? M.ledGreen : paint('#5a5d60', { weather: 0 }))
    // zone LEDs (all quiescent but one fault)
    const n = clamp(Math.round(p.zones), 4, 32)
    for (let i = 0; i < n; i++) led(px(86 + (i % 2) * 270, 300 + Math.floor(i / 2) * 22, 0.002), i === 5 ? M.ledAmber : paint('#6d1e18', { weather: 0 }))
    // buttons and access keyswitch
    for (let i = 0; i < 5; i++) {
      const q = px(70 + i * 115, 700 - 75, 0.008)
      k.rbox(i === 3 ? red : M.housing, [0.06, 0.035, 0.016], 0.006, q)
    }
    keyswitch(new THREE.Matrix4().makeTranslation(...px(520, 300, 0)))
    // hinge side, lock, cable glands on top, tag
    k.cyl('stainless', 0.008, 0.012, [W / 2 - 0.03, yc, zc + D / 2 + 0.006], 'z', 12)
    for (let i = 0; i < 4; i++) k.cyl('brass', 0.012, 0.03, [-W / 2 + 0.1 + i * 0.08, yc + H / 2 + 0.015, zc - 0.03], 'y', 10)
    for (let i = 0; i < 3; i++) {
      const x = -W / 2 + 0.1 + i * 0.08
      const y = yc + H / 2 + 0.03
      k.spline('cable', [[x, y, zc - 0.03], [x, y + 0.08, zc - 0.03], [x, y + 0.14, floor ? zc - D / 2 + 0.01 : 0.01], [x, y + 0.35, floor ? zc - D / 2 + 0.01 : 0.01]], 0.008, 6, 16)
    }
    tagPlate(k, p.tag, [0, yc - H / 2 - 0.04, floor ? zc + D / 2 + 0.05 + 0.001 : zc + D / 2 - 0.05], 'z', 0.15)
    if (!floor) k.box(body, [0.2, 0.05, 0.01], [0, yc - H / 2 - 0.04, zc + D / 2 - 0.055])
    // sounder beacon above a wall panel
    if (!floor) {
      k.box(red, [0.14, 0.14, 0.03], [0.12, yc + H / 2 + 0.12, 0.015])
      k.cyl(red, 0.06, 0.06, [0.12, yc + H / 2 + 0.12, 0.06], 'z', 24)
      k.cyl(paint('#ff6a3a', { emissive: '#ff3a10', emissiveIntensity: 0.4, weather: 0 }), 0.045, 0.03, [0.12, yc + H / 2 + 0.12, 0.1], 'z', 20)
    }
    return k.build()
  }

  // ESD mimic: wall cabinet with the mimic and guarded buttons below, or a floor desk with a raked button shelf
  const W = 1.2
  const mh = 0.72
  const floor = p.mount !== 'wall'
  const mimicY = floor ? 1.55 : clamp(p.elevation, 1.0, 2.2) + 0.15
  const zf = floor ? 0.2 : 0.16
  k.rbox(body, [W, mh + 0.06, 0.16], 0.008, [0, mimicY, zf - 0.08])
  k.plane(mimicMaterial(), W - 0.04, mh - 0.02, [0, mimicY, zf + 0.0005])
  const mx = (x: number, y: number): V3 => [-(W - 0.04) / 2 + (x / 1000) * (W - 0.04), mimicY + (mh - 0.02) / 2 - (y / 600) * (mh - 0.02), zf + 0.002]
  MIMIC_LEDS.forEach(([x, y], i) => led(mx(x, y), i === 3 ? M.ledAmber : M.ledGreen))
  led(mx(100, 520), M.ledGreen)
  const btnLabels = ['APS', 'ESD 1', 'ESD 2', 'PSD']
  const labelOf = (l: string) =>
    canvasMaterial(`lbl-${l}`, 256, 64, (g, w, h) => {
      g.fillStyle = '#1b1d1f'
      g.fillRect(0, 0, w, h)
      txt(g, l, w / 2, h / 2, 34, '#ffffff')
    })
  if (floor) {
    // desk: side profile with a 30° raked button shelf, plinth; buttons, keyswitches and lamps on the rake
    const z0 = zf - 0.16
    const z1 = zf + 0.42
    const tan = Math.tan(Math.PI / 6)
    const yTop = mimicY - mh / 2 - 0.03
    const prof = new THREE.Shape([
      new THREE.Vector2(z0, 0.1),
      new THREE.Vector2(z1, 0.1),
      new THREE.Vector2(z1, 0.86),
      new THREE.Vector2(zf, 0.86 + (z1 - zf) * tan),
      new THREE.Vector2(zf, yTop),
      new THREE.Vector2(z0, yTop),
    ])
    k.extrude(body, prof, W, new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(-W / 2, 0, 0))
    k.box('rubberBlack', [W - 0.04, 0.1, z1 - z0 - 0.04], [0, 0.05, (z0 + z1) / 2])
    const zc = (zf + z1) / 2
    const yc = 0.86 + (z1 - zc) * tan
    const onRake = (x: number, v: number) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, yc, zc), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 6 - Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, v, 0))
    btnLabels.forEach((l, i) => {
      const m = onRake(-0.42 + i * 0.22, 0.04)
      guarded(m, M.ledRed)
      k.with(m, () => k.plane(labelOf(l), 0.08, 0.02, [0, -0.065, 0.001]))
    })
    for (let i = 0; i < 2; i++) keyswitch(onRake(0.45 + i * 0.07, 0.06))
    k.with(onRake(0.45, -0.06), () => {
      for (let i = 0; i < 3; i++) k.cyl(i === 0 ? M.ledGreen : M.housing, 0.012, 0.012, [i * 0.05 - 0.02, 0, 0.006], 'z', 14)
    })
    tagPlate(k, p.tag, [0, 0.5, z1 + 0.001], 'z', 0.18)
  } else {
    // wall: button strip below the mimic
    const yb = mimicY - mh / 2 - 0.15
    k.rbox(body, [W, 0.22, 0.16], 0.008, [0, yb, zf - 0.08])
    btnLabels.forEach((l, i) => {
      const m = new THREE.Matrix4().makeTranslation(-0.42 + i * 0.22, yb + 0.01, zf)
      guarded(m, M.ledRed)
      k.plane(labelOf(l), 0.08, 0.02, [-0.42 + i * 0.22, yb - 0.075, zf + 0.0005])
    })
    for (let i = 0; i < 2; i++) keyswitch(new THREE.Matrix4().makeTranslation(0.45 + i * 0.07, yb + 0.03, zf))
    k.cyl(M.housing, 0.012, 0.012, [0.48, yb - 0.05, zf + 0.006], 'z', 14)
    tagPlate(k, p.tag, [0, mimicY + mh / 2 + 0.06, zf - 0.08], 'z', 0.15)
    k.box(body, [0.2, 0.06, 0.08], [0, mimicY + mh / 2 + 0.06, zf - 0.12])
  }
  return k.build()
}
