// Wellhead control panel (WHCP): stainless cabinet with per-well SSV / SCSSV modules, gauges, reservoir, air and electric pumps, accumulator rack, on a skid. API 6A / API 14D / ISO 10418.
import * as THREE from 'three'
import { uvScale, type Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, junctionBox, liftingLug, member, skid, tagPlate } from '../lib/parts'
import { louvreMaterial, textMaterial } from '../lib/textures'

export interface WellheadControlPanelProps {
  /** number of well control modules */
  wells?: number
  /** accumulator bottles on the rack */
  accumulators?: number
  doorsOpen?: boolean
  tag?: string
}

export const defaults = { wells: 6, accumulators: 6, doorsOpen: true, tag: 'X-N270' }

type P = typeof defaults

const SKID = 'HEB 160'
const H = 2.0 // cabinet height, typical
const D = 0.75 // cabinet depth
const MOD = 0.26 // module width per well

function layout(p: P) {
  const n = Math.max(1, Math.round(p.wells))
  const Lc = Math.max(1.4, n * MOD + 0.3)
  const nb = Math.max(2, Math.round(p.accumulators))
  const La = Math.ceil(nb / 2) * 0.32 + 0.2
  const L = Lc + La + 0.3
  const W = D + 0.6
  const yb = 0.16 + 0.008
  const xc = -L / 2 + 0.1 + Lc / 2
  const xa = xc + Lc / 2 + 0.15 + La / 2
  return { n, Lc, nb, La, L, W, yb, xc, xa }
}

export function WellheadControlPanel(props: WellheadControlPanelProps & GroupProps) {
  const { wells, accumulators, doorsOpen, tag, ...group } = { ...defaults, ...props }
  const p = { wells, accumulators, doorsOpen, tag } as P
  const L = layout(p)
  const data = useKit((k) => build(k, p), Object.values(p))
  const door = useKit((k) => buildDoor(k, L.Lc / 2, true), [L.Lc])
  const door2 = useKit((k) => buildDoor(k, L.Lc / 2, false), [L.Lc])
  const z = -0.15 + D / 2
  const y = L.yb + 0.08
  const a = doorsOpen ? (110 * Math.PI) / 180 : 0
  return (
    <group {...group}>
      <KitMesh data={data} />
      <group position={[L.xc - L.Lc / 2, y, z]} rotation-y={-a}>
        <KitMesh data={door} />
      </group>
      <group position={[L.xc + L.Lc / 2, y, z]} rotation-y={a} scale-x={-1}>
        <KitMesh data={door2} />
      </group>
    </group>
  )
}

export default WellheadControlPanel

/** One door leaf, hinge at the origin, leaf along +X, outside face +Z. */
function buildDoor(k: Kit, w: number, label: boolean) {
  const t = 0.025
  k.rbox('stainless', [w - 0.01, H - 0.02, t], 0.006, [w / 2, H / 2, t / 2])
  k.box('stainless', [w - 0.1, H - 0.12, 0.004], [w / 2, H / 2, t + 0.002])
  // hinges, quarter-turn handle with padlock hasp, document pocket inside
  for (const y of [0.25, H / 2, H - 0.25]) k.cyl('stainless', 0.012, 0.09, [0, y, t / 2], 'y', 10)
  k.rbox('plasticGrey', [0.04, 0.16, 0.03], 0.008, [w - 0.06, H * 0.5, t + 0.015])
  k.box('handwheel', [0.025, 0.1, 0.02], [w - 0.06, H * 0.5, t + 0.04])
  k.box('stainless', [w * 0.5, 0.3, 0.03], [w * 0.5, H * 0.75, -0.015])
  if (label) k.box(textMaterial('WHCP', '#c3c7cb', '#1a1a1a', 256, 96), [0.2, 0.075, 0.002], [w * 0.5, H * 0.85, t + 0.005])
}

function bottle(k: Kit, x: number, z: number, y0: number, h: number, r: number) {
  k.cyl('actuatorRed', r, h - 2 * r, [x, y0 + h / 2, z], 'y', 24)
  k.dome('actuatorRed', r, [x, y0 + h - r, z], 'y', Math.PI / 2, 1, 20)
  k.dome('actuatorRed', r, [x, y0 + r, z], '-y', Math.PI / 2, 1, 20)
  k.cyl('brass', r * 0.25, 0.05, [x, y0 + h + 0.02, z], 'y', 10)
  k.cyl('stainless', r * 0.3, 0.06, [x, y0 - 0.02, z], 'y', 10)
  k.box(textMaterial('N2', '#1a1a1a', '#ffffff', 128, 64), [r * 0.8, r * 0.4, 0.002], [x, y0 + h * 0.7, z + r + 0.001])
}

function build(k: Kit, p: P) {
  const L = layout(p)
  const top = skid(k, L.L, L.W, SKID, 'galvanised')
  const y0 = top + 0.08 // cabinet on plinth feet
  const zb = -0.15 - D / 2 // cabinet back
  const zf = -0.15 + D / 2 // cabinet front
  const x0 = L.xc - L.Lc / 2
  const x1 = L.xc + L.Lc / 2

  // cabinet shell: plinth, back, sides, roof canopy, louvred sides
  for (const x of [x0 + 0.08, x1 - 0.08]) for (const z of [zb + 0.08, zf - 0.08]) k.box('stainless', [0.08, 0.08, 0.08], [x, top + 0.04, z])
  const t = 0.02
  k.box('stainless', [L.Lc, t, D], [L.xc, y0 + t / 2, -0.15])
  k.box('stainless', [L.Lc, H, t], [L.xc, y0 + H / 2, zb + t / 2])
  for (const x of [x0 + t / 2, x1 - t / 2]) k.box('stainless', [t, H, D], [x, y0 + H / 2, -0.15])
  const lv = new THREE.BoxGeometry(0.004, 0.5, D * 0.6)
  uvScale(lv, 1, 6)
  for (const x of [x0 - 0.002, x1 + 0.002]) k.add(louvreMaterial('#c3c7cb'), lv.clone(), new THREE.Matrix4().setPosition(x, y0 + H * 0.25, -0.15))
  k.rbox('stainless', [L.Lc + 0.12, 0.04, D + 0.16], 0.01, [L.xc, y0 + H + 0.02, -0.12])
  for (const x of [x0 + 0.1, x1 - 0.1]) liftingLug(k, [x, y0 + H + 0.04, -0.15], 'x', 0.7, 'stainless')
  tagPlate(k, p.tag, [x0 - 0.002 - 0.001, y0 + H * 0.75, -0.15], '-x', 0.25)

  // mounting plate and per-well control modules (SSV and SCSSV)
  const zp = zb + 0.06
  k.box('equipmentPaint', [L.Lc - 0.08, H - 0.15, 0.01], [L.xc, y0 + H / 2 + 0.05, zp])
  const yHead = y0 + H - 0.22
  // common header gauges: supply air, HP and LP hydraulic headers
  const xs = L.xc - (L.n * MOD) / 2
  for (let i = 0; i < 3; i++) gauge(k, [L.xc + (i - 1) * 0.22, yHead + 0.08, zp + 0.05], 'z', 0.12, 'bar', [16, 700, 250][i])
  k.box(textMaterial('SUPPLY   HP   LP', '#1f3e70', '#ffffff', 512, 64), [0.66, 0.05, 0.002], [L.xc, yHead - 0.02, zp + 0.006])
  for (let i = 0; i < L.n; i++) {
    const x = xs + MOD * (i + 0.5)
    k.box(textMaterial(`WELL ${i + 1}`, '#1f3e70', '#ffffff', 256, 64), [MOD * 0.85, 0.05, 0.002], [x, yHead - 0.12, zp + 0.006])
    // SCSSV (top) and SSV gauges
    gauge(k, [x, yHead - 0.25, zp + 0.05], 'z', 0.1, 'bar', 700)
    gauge(k, [x, yHead - 0.4, zp + 0.05], 'z', 0.1, 'bar', 250)
    // pilot relay / logic block with selector valves
    k.rbox('aluminium', [MOD * 0.7, 0.24, 0.07], 0.008, [x, yHead - 0.62, zp + 0.04])
    for (const [dy, col] of [[-0.05, 'actuatorRed'], [0.05, 'safetyGreen']] as const) {
      k.cyl('stainless', 0.012, 0.04, [x, yHead - 0.62 + dy, zp + 0.09], 'z', 10)
      k.box(col, [0.07, 0.015, 0.012], [x + 0.02, yHead - 0.62 + dy, zp + 0.115])
    }
    // reset / trip push-pull buttons
    k.cyl('actuatorRed', 0.016, 0.03, [x - MOD * 0.25, yHead - 0.8, zp + 0.025], 'z', 12)
    k.cyl('safetyGreen', 0.016, 0.03, [x + MOD * 0.25, yHead - 0.8, zp + 0.025], 'z', 12)
    // tubing from the module down to the bulkhead
    k.tube('tubing', [[x - 0.03, yHead - 0.74, zp + 0.04], [x - 0.03, y0 + 0.75, zp + 0.04], [x - 0.03, y0 + 0.6, zp + 0.1 + (i % 2) * 0.02], [x1 - 0.06, y0 + 0.6, zp + 0.1 + (i % 2) * 0.02]], 0.005, 6, 0.04)
    k.tube('tubing', [[x + 0.03, yHead - 0.74, zp + 0.04], [x + 0.03, y0 + 0.7, zp + 0.04], [x + 0.03, y0 + 0.55, zp + 0.14 + (i % 2) * 0.02], [x1 - 0.06, y0 + 0.55, zp + 0.14 + (i % 2) * 0.02]], 0.005, 6, 0.04)
  }
  // reservoir with sight glass and filler/breather, two air-driven pumps, one electric pump, filters
  const rx = L.xc - L.Lc * 0.2
  const rw = L.Lc * 0.5
  k.rbox('stainless', [rw, 0.42, D - 0.15], 0.015, [rx, y0 + 0.23, -0.15 - 0.03])
  k.box('glass', [0.03, 0.25, 0.01], [rx + rw * 0.35, y0 + 0.24, -0.15 + (D - 0.15) / 2 - 0.02])
  k.cyl('liquidOil', 0.012, 0.14, [rx + rw * 0.35, y0 + 0.19, -0.15 + (D - 0.15) / 2 - 0.025], 'y', 8)
  k.cyl('stainless', 0.04, 0.06, [rx - rw * 0.3, y0 + 0.47, -0.2], 'y', 16)
  k.cyl('handwheel', 0.045, 0.02, [rx - rw * 0.3, y0 + 0.51, -0.2], 'y', 16)
  const px = L.xc + L.Lc * 0.28
  for (let j = 0; j < 2; j++) {
    const zz = -0.32 + j * 0.24
    k.cyl('aluminium', 0.065, 0.24, [px, y0 + 0.16, zz], 'y', 20)
    k.dome('actuatorBlue', 0.07, [px, y0 + 0.28, zz], 'y', Math.PI / 2, 0.8, 18)
    k.cyl('stainless', 0.03, 0.14, [px, y0 + 0.4, zz], 'y', 12)
    k.cyl('stainless', 0.022, 0.08, [px + 0.08, y0 + 0.1, zz], 'x', 10)
  }
  k.cyl('motorPaint', 0.08, 0.26, [px - 0.05, y0 + 0.62, -0.2], 'x', 20)
  k.cyl('stainless', 0.05, 0.12, [px + 0.14, y0 + 0.62, -0.2], 'x', 16)
  for (let j = 0; j < 2; j++) k.cyl('stainless', 0.035, 0.18, [px - 0.22 + j * 0.09, y0 + 0.62, -0.05], 'y', 14)
  // bulkhead plate on the right side with outgoing tubing to the wells
  k.box('stainless', [0.01, 0.4, 0.5], [x1 + 0.005, y0 + 0.55, -0.15])
  for (let i = 0; i < L.n * 2; i++) {
    const yy = y0 + 0.4 + (i % 4) * 0.08
    const zz = -0.35 + Math.floor(i / 4) * 0.07
    k.hex('brass', 0.022, 0.03, [x1 + 0.025, yy, zz], 'x')
  }
  junctionBox(k, [x0 - 0.002, y0 + 1.1, -0.15], '-x', [0.3, 0.35, 0.16])
  k.spline('cable', [[x0 - 0.08, y0 + 0.9, -0.15], [x0 - 0.15, y0 + 0.4, -0.15], [x0 - 0.2, top + 0.05, -0.1]], 0.012, 6, 16)

  // accumulator rack: frame, bottles in two rows, clamp bands, manifold
  const ax0 = L.xa - L.La / 2
  const ax1 = L.xa + L.La / 2
  const ah = 1.5
  for (const x of [ax0, ax1]) for (const z of [-0.45, 0.15]) member(k, [x, top, z], [x, top + ah + 0.1, z], 'L50x50x5', 'galvanised')
  for (const y of [top + 0.05, top + ah * 0.55, top + ah + 0.1])
    for (const z of [-0.45, 0.15]) member(k, [ax0, y, z], [ax1, y, z], 'L50x50x5', 'galvanised')
  const r = 0.11
  for (let i = 0; i < L.nb; i++) {
    const col = Math.floor(i / 2)
    const x = ax0 + 0.2 + col * 0.32
    const z = i % 2 ? 0.0 : -0.3
    bottle(k, x, z, top + 0.08, ah - 0.15, r)
    k.torus('galvanised', r + 0.004, 0.008, [x, top + ah * 0.55, z], 'y', 6, 24)
  }
  k.pipe('stainless', [ax0 + 0.05, top + 0.06, -0.15], [ax1 - 0.05, top + 0.06, -0.15], 0.034, 0.005, 12)
  k.tube('tubing', [[ax0 + 0.05, top + 0.06, -0.15], [x1 + 0.08, top + 0.06, -0.15], [x1 + 0.08, y0 + 0.45, -0.15], [x1 + 0.02, y0 + 0.45, -0.15]], 0.008, 6, 0.05)
  gauge(k, [ax1 + 0.03, top + 0.9, -0.15], 'x', 0.1, 'bar', 700)
  k.box('equipmentPaint', [0.1, 0.06, 0.06], [ax1 - 0.02, top + 0.9, -0.15])
  // bundled control lines leaving the skid towards the wells
  // outgoing control lines to a skid-edge bulkhead plate (field tubing connects there)
  k.box('stainless', [0.3, 0.12, 0.01], [x1 + 0.23, top + 0.06, -L.W / 2 + 0.005])
  for (let i = 0; i < 4; i++) {
    k.tube('tubing', [[x1 + 0.03, y0 + 0.4 + i * 0.08, -0.35], [x1 + 0.2 + i * 0.02, y0 + 0.4 + i * 0.08, -0.35], [x1 + 0.2 + i * 0.02, top + 0.06, -0.35], [x1 + 0.2 + i * 0.02, top + 0.06, -L.W / 2 + 0.01]], 0.006, 6, 0.04)
    k.hex('brass', 0.022, 0.03, [x1 + 0.2 + i * 0.02, top + 0.06, -L.W / 2 - 0.01], 'z')
  }
  // ESD push-button station and fusible-loop / hi-lo pilot connections on the left side
  {
    const xe = x0 - 0.002
    k.rbox('actuatorYellow', [0.06, 0.26, 0.2], 0.01, [xe - 0.03, y0 + 1.5, 0.16])
    k.cyl('actuatorRed', 0.03, 0.03, [xe - 0.075, y0 + 1.5, 0.16], 'x', 16)
    k.dome('actuatorRed', 0.045, [xe - 0.09, y0 + 1.5, 0.16], '-x', Math.PI / 2, 0.6, 16)
    k.box(textMaterial('ESD', '#e1b10f', '#111111', 128, 64), [0.002, 0.04, 0.08], [xe - 0.061, y0 + 1.6, 0.16])
    for (const [i, label] of ['FUSIBLE LOOP', 'HI/LO PILOT'].entries()) {
      const yy = y0 + 0.5 + i * 0.14
      k.box(textMaterial(label, '#c3c7cb', '#111111', 256, 48), [0.002, 0.03, 0.16], [xe - 0.001, yy + 0.05, 0.12])
      k.hex('brass', 0.03, 0.03, [xe - 0.015, yy, 0.12], 'x')
      k.tube('tubing', [[xe - 0.03, yy, 0.12], [xe - 0.12 - i * 0.04, yy, 0.12], [xe - 0.12 - i * 0.04, top + 0.06, 0.12], [xe - 0.12 - i * 0.04, top + 0.06, L.W / 2 - 0.01]], 0.005, 6, 0.04)
      k.hex('brass', 0.022, 0.03, [xe - 0.12 - i * 0.04, top + 0.06, L.W / 2 + 0.01], 'z')
    }
    // instrument air filter-regulator with gauge
    k.cyl('aluminium', 0.04, 0.16, [xe - 0.06, y0 + 0.95, 0.12], 'y', 16)
    k.cyl('glass', 0.035, 0.08, [xe - 0.06, y0 + 0.84, 0.12], 'y', 16)
    gauge(k, [xe - 0.06, y0 + 1.07, 0.18], 'z', 0.06, 'bar', 16)
  }
  k.box('stainless', [0.2, 0.12, 0.01], [x0 - 0.14, top + 0.06, L.W / 2 - 0.005])
  // earth boss
  k.cyl('brass', 0.015, 0.03, [x0 + 0.2, top - 0.05, L.W / 2 + 0.01], 'z', 10)
}
