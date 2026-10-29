// Fire extinguishers: portable units (dry powder, CO2, foam) on a bracket or in a red cabinet, or a wheeled unit on its trolley; EN 3 red bodies with agent colour bands, capacity sets the size. EN 3-7, EN 1866-1, ISO 7010.
import * as THREE from 'three'
import { Kit, mat4, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, tagPlate } from '../lib/parts'
import { ICON, canvasMat, faceZ, mounted, polePlate, signMat, type Mount } from './_fg'

export type Agent = 'dry-powder' | 'co2' | 'foam'
export type ExtinguisherUnit = 'portable-bracket' | 'cabinet' | 'wheeled'

export interface FireExtinguisherProps {
  /** how the extinguisher is kept (named `unit` because `type` is reserved by Object3D) */
  unit?: ExtinguisherUnit
  agent?: Agent
  /** agent charge, kg (foam: litres); portable 1–12, wheeled 25–150 */
  capacity?: number
  /** extinguishers in the cabinet */
  count?: number
  door?: 'glazed' | 'solid'
  /** bracket on a free-standing post or a wall */
  mount?: Mount
  sign?: boolean
  tag?: string
}

export const defaults = {
  unit: 'cabinet' as ExtinguisherUnit,
  agent: 'dry-powder' as Agent,
  capacity: 9,
  count: 2,
  door: 'glazed' as 'glazed' | 'solid',
  mount: 'pole' as Mount,
  sign: true,
  tag: 'EXT-12',
}

const BODY = paint('#c1121c', { metalness: 0.2, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 })
const HEAD = paint('#1d1f22', { metalness: 0.5, roughness: 0.35 })
const RED = 'firewaterRed'
// EN 3-7 colour zones: dry powder blue, CO2 black, foam cream
const AGENT: Record<Agent, { band: string; text: string; ink: string; cls: string }> = {
  'dry-powder': { band: '#1f4e9a', text: 'DRY POWDER', ink: '#ffffff', cls: 'A B C' },
  co2: { band: '#141414', text: 'CO2', ink: '#ffffff', cls: 'B' },
  foam: { band: '#eadcae', text: 'FOAM', ink: '#141414', cls: 'A B' },
}
const BAND: Record<Agent, ReturnType<typeof paint>> = {
  'dry-powder': paint(AGENT['dry-powder'].band, { metalness: 0.2, roughness: 0.4, clearcoat: 0.6 }),
  co2: paint(AGENT.co2.band, { metalness: 0.2, roughness: 0.4, clearcoat: 0.6 }),
  foam: paint(AGENT.foam.band, { metalness: 0.2, roughness: 0.4, clearcoat: 0.6 }),
}

/** cylinder radius and shell height from the charge (cube-root scaling from a 9 kg powder / 5 kg CO2 unit) */
export function extinguisherSize(agent: Agent, kg: number) {
  if (agent === 'co2') {
    const s = Math.cbrt(kg / 5)
    return { r: 0.07 * s, h: 0.6 * s }
  }
  const s = Math.cbrt(kg / 9)
  return { r: 0.085 * s, h: 0.5 * s }
}

export function FireExtinguisher(props: FireExtinguisherProps & GroupProps) {
  const { unit, agent, capacity, count, door, mount, sign, tag, ...group } = { ...defaults, ...props }
  const n = Math.max(1, Math.min(3, Math.round(count)))
  const data = useKit(
    (k) => {
      if (unit === 'wheeled') wheeled(k, agent, capacity >= 25 ? Math.min(150, capacity) : 50, tag)
      else {
        const kg = Math.max(1, Math.min(12, capacity))
        if (unit === 'cabinet') cabinet(k, agent, kg, n, door, sign, tag)
        else bracket(k, agent, kg, mount, sign, tag)
      }
    },
    [unit, agent, capacity, n, door, mount, sign, tag],
  )
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default FireExtinguisher

function labelMat(agent: Agent, kg: number) {
  const a = AGENT[agent]
  return canvasMat(`fe-label-${agent}-${kg}`, 256, 384, (g) => {
    g.fillStyle = '#f4f2ec'
    g.fillRect(0, 0, 256, 384)
    g.fillStyle = a.band
    g.fillRect(0, 0, 256, 70)
    g.fillStyle = a.ink
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `bold ${a.text.length > 4 ? 34 : 46}px Arial, sans-serif`
    g.fillText(a.text, 128, 36)
    g.fillStyle = '#111'
    g.font = 'bold 40px Arial, sans-serif'
    g.fillText(`${kg} ${agent === 'foam' ? 'L' : 'kg'}`, 128, 108)
    g.font = 'bold 26px Arial, sans-serif'
    g.fillText(`CLASS ${a.cls}`, 128, 150)
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = '#111'
      g.lineWidth = 3
      g.strokeRect(24 + i * 72, 176, 60, 60)
      g.fillText(['1', '2', '3'][i], 54 + i * 72, 206)
    }
    for (let i = 0; i < 6; i++) g.fillRect(24, 256 + i * 18, 208 - (i % 2) * 50, 6)
  })
}

/** Curved instruction label centred on +Z (open cylinder strip, UVs 0…1). */
function label(k: Kit, m: THREE.Material, r: number, h: number, c: V3) {
  k.add(m, new THREE.CylinderGeometry(r, r, h, 16, 1, true, -0.75, 1.5), mat4(c))
}

/** Portable extinguisher standing on `p` (base centre), front +Z. Returns the top of the head. */
function portable(k: Kit, p: V3, agent: Agent, kg: number) {
  const co2 = agent === 'co2'
  const { r, h } = extinguisherSize(agent, kg)
  const s = r / 0.085
  const [x, y, z] = p
  // moulded foot ring, shell, shoulder, colour band, front label
  k.lathe('rubberBlack', [[r * 0.6, 0], [r + 0.006, 0], [r + 0.006, 0.03], [r - 0.002, 0.034]], [x, y, z], 'y', 28)
  k.cyl(BODY, r, h - 0.03, [x, y + 0.03 + (h - 0.03) / 2, z], 'y', 32)
  k.dome(BODY, r, [x, y + h, z], 'y', Math.PI / 2, 0.55, 28)
  k.cyl(BAND[agent], r + 0.0008, h * 0.09, [x, y + h * 0.83, z], 'y', 32, undefined, true)
  label(k, labelMat(agent, kg), r + 0.0012, h * 0.46, [x, y + h * 0.51, z])
  // valve: brass neck, head, carry handle, squeeze lever, safety pin with tamper tie
  const yv = y + h + r * 0.55
  k.cyl('brass', 0.017 * s + 0.004, 0.035, [x, yv, z], 'y', 14)
  k.rbox(HEAD, [0.04 * s + 0.01, 0.045, 0.05 * s + 0.012], 0.006, [x, yv + 0.04, z])
  k.box(HEAD, [0.02, 0.012, 0.15 * s], [x, yv + 0.03, z - 0.07 * s])
  k.box(HEAD, [0.02, 0.012, 0.14 * s], [x, yv + 0.07, z - 0.055 * s], [0, 0.97, -0.24])
  k.torus('safetyYellow', 0.012, 0.0025, [x + 0.028, yv + 0.045, z], 'x', 6, 12)
  k.rod('safetyYellow', [x - 0.025, yv + 0.045, z], [x + 0.03, yv + 0.045, z], 0.0025, 6)
  k.cyl('actuatorRed', 0.004, 0.012, [x + 0.032, yv + 0.04, z + 0.008], 'y', 6)
  if (!co2) gauge(k, [x, yv + 0.04, z + 0.025 * s + 0.006], 'z', 0.034, 'bar', 25)
  // discharge hose, nozzle (or CO2 horn) parked in a clip on the side
  const xs = x + r + 0.022
  k.box('stainless', [0.018, 0.03, 0.014], [x + r + 0.008, y + h * 0.58, z + 0.02])
  if (co2) {
    k.tube('rubberBlack', [[x, yv + 0.04, z + 0.028], [x + r * 0.9, yv + 0.01, z + 0.035], [xs, y + h * 0.78, z + 0.02], [xs, y + h * 0.66, z + 0.02]], 0.008, 6, 0.04)
    k.cyl(HEAD, 0.016, 0.04, [xs, y + h * 0.64, z + 0.02], 'y', 12)
    // hollow discharge horn
    k.lathe(HEAD, [[0.014, 0], [0.05 * s, 0.24 * s], [0.046 * s, 0.24 * s], [0.01, 0.004]], [xs, y + h * 0.62, z + 0.02], '-y', 24)
  } else {
    k.tube('rubberBlack', [[x, yv + 0.04, z + 0.028], [x + r * 0.9, yv + 0.01, z + 0.035], [xs, y + h * 0.78, z + 0.02], [xs, y + h * 0.66, z + 0.02]], 0.008, 6, 0.04)
    k.lathe(HEAD, [[0.012, 0], [0.012, 0.09], [0.008, 0.1], [0.005, 0.1], [0.005, 0.07]], [xs, y + h * 0.66, z + 0.02], '-y', 12)
  }
  return yv + 0.075
}

/** ISO 7010 F001 sign plate centred at (0, y), plate face at z. */
function signPlate(k: Kit, y: number, z: number, w = 0.3) {
  k.box('stainless', [w + 0.006, w / 2 + 0.006, 0.003], [0, y, z + 0.0015])
  k.plane(signMat(['FIRE', 'EXTINGUISHER'], '#c22a20', '#ffffff', ICON.extinguisher), w, w / 2, [0, y, z + 0.0045])
}

function bracket(k: Kit, agent: Agent, kg: number, mount: Mount, sign: boolean, tag: string) {
  const { r, h } = extinguisherSize(agent, kg)
  const yb = 0.35 // cylinder base above the deck
  const zc = r + 0.03
  const yc = yb + h * 0.55
  const ph = h + 0.2
  mounted(k, mount, yc, [0.12, ph], () => {
    // neck cradle under the valve (hook) and a quick-release strap round the body
    const yn = yb + h + r * 0.3 - yc
    k.box('stainless', [0.07, 0.03, 0.012], [0, yn - 0.02, 0.006])
    k.box('stainless', [0.07, 0.006, zc + 0.03], [0, yn, (zc + 0.03) / 2])
    for (const sx of [-1, 1]) k.box('stainless', [0.006, 0.03, 0.03], [sx * 0.032, yn + 0.015, zc])
    const ys = -h * 0.25
    k.box('stainless', [0.08, 0.04, 0.012], [0, ys, 0.006])
    k.lathe('rubberBlack', [[r + 0.002, ys - 0.012], [r + 0.006, ys - 0.012], [r + 0.006, ys + 0.012], [r + 0.002, ys + 0.012], [r + 0.002, ys - 0.012]], [0, 0, zc], 'y', 28, -Math.PI * 0.7, Math.PI * 1.4)
    k.box('stainless', [0.03, 0.026, 0.01], [0, ys, zc + r + 0.008])
    for (const sx of [-1, 1]) for (const yy of [yn - 0.02, ys]) k.hex('nut', 0.014, 0.006, [sx * 0.027, yy, 0.015], 'z')
  }, Math.max(yc + ph / 2 + 0.05, sign ? yb + h + 0.55 : 0))
  const zf = faceZ(mount)
  portable(k, [0, yb, zf + zc], agent, kg)
  if (sign) {
    const ys = yb + h + 0.38
    const z = mount === 'pole' ? polePlate(k, ys, 0.16, 0.12) + 0.012 : 0.008
    if (mount === 'pole') for (const sx of [-1, 1]) k.cyl('stainless', 0.008, 0.012, [sx * 0.06, ys, z - 0.006], 'z', 8)
    else k.box('stainless', [0.32, 0.17, 0.008], [0, ys, 0.004])
    signPlate(k, ys, z)
  }
  tagPlate(k, tag, [0, yb - 0.06, zf + 0.001], 'z', 0.1)
}

function cabinet(k: Kit, agent: Agent, kg: number, n: number, door: 'glazed' | 'solid', sign: boolean, tag: string) {
  const { r, h } = extinguisherSize(agent, kg)
  const pitch = 2 * r + 0.12
  const W = 0.08 + n * pitch
  const H = Math.max(0.6, h + r * 0.55 + 0.32)
  const D = Math.max(0.26, 2 * r + 0.12)
  const y0 = 0.15
  const t = 0.004
  // GRP shell: back, sides, floor, roof with drip lip
  k.box(RED, [W, H, t], [0, y0 + H / 2, t / 2])
  for (const s of [-1, 1]) k.box(RED, [t, H, D - t], [s * (W / 2 - t / 2), y0 + H / 2, (D + t) / 2])
  k.box(RED, [W - 2 * t, t, D - t], [0, y0 + t / 2, (D + t) / 2])
  k.box(RED, [W - 2 * t, t, D - t], [0, y0 + H - t / 2, (D + t) / 2])
  k.rbox(RED, [W + 0.04, 0.03, D + 0.05], 0.008, [0, y0 + H + 0.015, D / 2 + 0.01])
  // plinth stand
  for (const sx of [-1, 1])
    for (const sz of [0.03, D - 0.03]) {
      k.box('galvanised', [0.04, y0 - 0.008, 0.04], [sx * (W / 2 - 0.03), (y0 - 0.008) / 2 + 0.008, sz])
      k.box('galvanised', [0.08, 0.008, 0.08], [sx * (W / 2 - 0.03), 0.004, sz])
      k.hex('nut', 0.022, 0.01, [sx * (W / 2 - 0.03) + 0.025, 0.013, sz + 0.025], 'y')
    }
  for (const sz of [0.03, D - 0.03]) k.box('galvanised', [W - 0.02, 0.04, 0.04], [0, y0 - 0.02, sz])
  // door on the front: frame, glazing or solid panel with louvres, hinges, latch, seal
  const fw = 0.045
  const yc = y0 + H / 2
  const zd = D + 0.01
  k.box(RED, [W, fw, 0.02], [0, y0 + fw / 2, zd])
  k.box(RED, [W, fw * 2.6, 0.02], [0, y0 + H - fw * 1.3, zd])
  for (const s of [-1, 1]) k.box(RED, [fw, H - fw * 3.6, 0.02], [s * (W / 2 - fw / 2), y0 + fw + (H - fw * 3.6) / 2, zd])
  const wy = y0 + fw + (H - fw * 3.6) / 2
  const wh = H - fw * 3.6
  if (door === 'glazed') {
    k.box('glass', [W - 2 * fw, wh, 0.004], [0, wy, zd])
    k.box('rubberBlack', [W - 2 * fw + 0.006, 0.006, 0.008], [0, wy + wh / 2, zd])
    k.box('rubberBlack', [W - 2 * fw + 0.006, 0.006, 0.008], [0, wy - wh / 2, zd])
  } else {
    k.box(RED, [W - 2 * fw, wh, 0.012], [0, wy, zd - 0.002])
    for (let i = 0; i < 5; i++) k.box('castIron', [W * 0.5, 0.008, 0.004], [0, y0 + fw + 0.04 + i * 0.022, zd + 0.005])
  }
  for (const y of [y0 + 0.1, y0 + H - 0.1]) k.cyl('stainless', 0.008, 0.07, [-W / 2 - 0.006, y, zd], 'y', 10)
  k.rbox('stainless', [0.022, 0.1, 0.02], 0.004, [W / 2 - fw / 2, yc, zd + 0.02])
  k.cyl('castIron', 0.008, 0.008, [W / 2 - fw / 2, yc + 0.07, zd + 0.014], 'z', 10)
  if (sign) {
    const w = Math.min(W - 0.06, door === 'solid' ? 0.34 : 0.2)
    const ys = door === 'solid' ? wy + wh * 0.18 : y0 + H - fw * 1.3
    signPlate(k, ys, zd + (door === 'solid' ? 0.004 : 0.01), w)
  }
  for (let i = 0; i < n; i++) portable(k, [-W / 2 + 0.04 + pitch / 2 + i * pitch, y0 + t, D / 2 + 0.01], agent, kg)
  tagPlate(k, tag, [W / 2 + 0.001, yc + 0.2, D / 2], 'x', 0.09)
}

/** Wheeled unit, cylinder upright on its trolley, hose on a rack, front +Z. */
function wheeled(k: Kit, agent: Agent, kg: number, tag: string) {
  const s = Math.cbrt(kg / 50)
  const r = 0.16 * s
  const h = 0.82 * s
  const yb = 0.1
  const co2 = agent === 'co2'
  k.cyl(BODY, r, h, [0, yb + h / 2, 0], 'y', 40)
  k.dome(BODY, r, [0, yb + h, 0], 'y', Math.PI / 2, 0.5, 36)
  k.dome(BODY, r, [0, yb, 0], '-y', Math.PI / 2, 0.35, 36)
  k.cyl(BAND[agent], r + 0.0008, h * 0.08, [0, yb + h * 0.86, 0], 'y', 40, undefined, true)
  label(k, labelMat(agent, kg), r + 0.0012, h * 0.45, [0, yb + h * 0.525, 0])
  // trolley: axle, wheels with hubs, tubular frame, handle, toe plate, cylinder clamps
  const wr = 0.2
  const zA = -r + 0.04
  const xw = Math.max(0.3, r + 0.14)
  const xf = xw - 0.1
  k.rod('stainless', [-xw - 0.03, wr, zA], [xw + 0.03, wr, zA], 0.015, 10)
  for (const sx of [-1, 1]) {
    k.lathe('rubberBlack', [[wr * 0.62, -0.035], [wr - 0.01, -0.035], [wr, -0.02], [wr, 0.02], [wr - 0.01, 0.035], [wr * 0.62, 0.035]], [sx * xw, wr, zA], 'x', 32)
    k.cyl('galvanised', wr * 0.62, 0.06, [sx * xw, wr, zA], 'x', 24)
    k.cyl('galvanised', 0.035, 0.09, [sx * xw, wr, zA], 'x', 12)
    k.hex('nut', 0.03, 0.012, [sx * (xw + 0.05), wr, zA], 'x')
    k.tube(RED, [[sx * xf, wr, zA], [sx * xf, yb + h + 0.25, zA - 0.08]], 0.016, 8)
    k.tube(RED, [[sx * xf, 0.03, r + 0.04], [sx * xf, 0.03, zA], [sx * xf, wr, zA]], 0.016, 8, 0.05)
    k.box('rubberBlack', [0.05, 0.03, 0.05], [sx * xf, 0.015, r + 0.04])
  }
  for (const y of [yb + h * 0.25, yb + h * 0.8]) {
    k.lathe(RED, [[r + 0.001, y - 0.015], [r + 0.006, y - 0.015], [r + 0.006, y + 0.015], [r + 0.001, y + 0.015], [r + 0.001, y - 0.015]], [0, 0, 0], 'y', 32, Math.PI * 0.55, Math.PI * 0.9)
    k.box(RED, [2 * xf, 0.03, 0.02], [0, y, zA - 0.03])
    k.hex('nut', 0.02, 0.01, [0, y, zA - 0.045], 'z')
  }
  k.tube(RED, [[-xf, yb + h + 0.25, zA - 0.08], [xf, yb + h + 0.25, zA - 0.08]], 0.016, 8)
  k.cyl('rubberBlack', 0.02, 0.2, [0, yb + h + 0.25, zA - 0.08], 'x', 12)
  k.box(RED, [2 * xf, 0.03, 0.03], [0, 0.03, r + 0.04])
  // valve head with gauge, hose coiled on a rack, nozzle gun or CO2 horn
  const yv = yb + h + r * 0.5
  k.cyl('brass', 0.03, 0.06, [0, yv + 0.03, 0], 'y', 14)
  k.rbox(HEAD, [0.07, 0.05, 0.07], 0.008, [0, yv + 0.085, 0])
  k.cyl('stainless', 0.008, 0.12, [0, yv + 0.15, 0], 'y', 8)
  k.handwheel('handwheel', 0.1, [0, yv + 0.2, 0], 'y', 3)
  if (!co2) gauge(k, [0.05, yv + 0.09, 0.03], 'z', 0.06, 'bar', 25)
  const xr = xf + 0.02
  k.box('galvanised', [0.01, 0.28, 0.18], [xr, yb + h * 0.62, zA + 0.04])
  // ~5 m discharge hose coiled on the rack
  for (let i = 0; i < 6; i++) k.torus('rubberBlack', 0.13, 0.013, [xr + 0.02 + i * 0.026, yb + h * 0.62, zA + 0.04], 'x', 8, 32)
  k.tube('rubberBlack', [[0, yv + 0.085, 0.035], [xr * 0.5, yv + 0.05, 0.08], [xr + 0.02, yb + h * 0.62 + 0.13, zA + 0.08]], 0.013, 8, 0.05)
  const xn = xr + 0.06
  if (co2) k.lathe(HEAD, [[0.02, 0], [0.08, 0.3], [0.075, 0.3], [0.016, 0.005]], [xn, yb + h * 0.45, zA + 0.12], '-y', 24)
  else {
    k.lathe(HEAD, [[0.02, 0], [0.02, 0.18], [0.012, 0.2], [0.008, 0.2], [0.008, 0.16]], [xn, yb + h * 0.55, zA + 0.12], '-y', 14)
    k.cyl('safetyYellow', 0.024, 0.04, [xn, yb + h * 0.55 + 0.02, zA + 0.12], 'y', 12)
  }
  k.box('stainless', [0.03, 0.03, 0.04], [xr + 0.02, yb + h * 0.48, zA + 0.1])
  tagPlate(k, tag, [0, yb + h * 0.18, r + 0.002], 'z', 0.09)
}
