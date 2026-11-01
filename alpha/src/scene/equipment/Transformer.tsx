/**
 * Oil-immersed power transformer (ONAN / ONAF) on a bunded steel plinth, built like the real unit:
 *
 *   - BUND: steel drip tray with walls, support beams, grating over the oil sump, drain valve.
 *   - TANK: welded rectangular tank on base skids (haul holes, jacking pads), vertical wall stiffeners,
 *     bolted cover with a flange rim, lifting lugs, drain / filter / sampling valves.
 *   - COOLING: detachable pressed-steel radiator banks on both long sides (top + bottom headers,
 *     radiator isolating valves, vent / drain plugs, stays) and, from 10 MVA, ONAF side-blow fans.
 *   - CONSERVATOR on brackets above the cover, split main / OLTC compartments, magnetic oil-level
 *     gauge, Buchholz relay in the rising pipe between isolating valves, silica-gel breathers.
 *   - PRESSURE RELIEF DEVICE with a directed-discharge hood piped down to the bund.
 *   - HV (+X end) and LV (−X end) air-filled CABLE BOXES with the porcelain bushings inside
 *     (visible in x-ray / section), gland plates and cables down to the deck; LV neutral to earth.
 *   - ON-LOAD TAP CHANGER compartment (+Z side, +X end) with motor-drive cabinet and drive shaft,
 *     its own protective relay and conservator compartment.
 *   - Marshalling kiosk with oil (OTI) and winding (WTI) temperature indicators and capillaries to
 *     the cover pockets, rating plate, earthing bar.
 *   - Inside (x-ray / section): 3-limb core with yokes and the concentric LV/HV windings.
 *
 * Local frame (types.ts): origin = plinth centre at deck level, tank along local X,
 * size = [tank length (X), tank height, tank width (Z)]. Everything stays inside the footprint
 * reserved in model/footprint.ts (tank ± 0.6 m in X, ± 0.7 m in Z); the conservator, cable boxes
 * and fittings rise to about tank height + 1.3 m.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Transformer } from '../../model/types'
import { paint, registerMaterial } from '../../three/materials'
import { Kit, mat4, type MatKey, type Orient, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { Rotors } from './machinery/Moving'
import { fanRotor, type RotorSpec } from './machinery/rotors'
import { gratingPanel, smallGauge, tagPlate } from './machinery/parts'
import { dialMaterial, fanGuardMaterial, signMaterial } from './machinery/textures'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const TAU = Math.PI * 2

// ------------------------------------------------------------------ materials
/** tank skin (RAL 7033-ish grey) — fades in x-ray so the core and windings show */
const TANK = () => paint('#9aa39c', 'shell', { metalness: 0.3, roughness: 0.5 })
/** fittings in the tank colour that should stay readable in x-ray */
const FIT = () => paint('#9aa39c', 'detail', { metalness: 0.3, roughness: 0.5 })
const PORCELAIN = () => paint('#6e3420', 'internal', { metalness: 0.05, roughness: 0.12 })
const CORE = () => paint('#55595d', 'internal', { metalness: 0.6, roughness: 0.45 })
const WINDING = () => paint('#9a6a35', 'internal', { metalness: 0.2, roughness: 0.6 })
const SPACER = () => paint('#4a3221', 'internal', { metalness: 0.1, roughness: 0.7 })
const COPPER = () => paint('#b8733a', 'detail', { metalness: 0.85, roughness: 0.3 })
const SILICA = () => paint('#d9892b', 'detail', { metalness: 0.0, roughness: 0.7 })
const BUND = () => paint('#7f878b', 'structure', { metalness: 0.3, roughness: 0.6 })
const XLPE: MatKey = 'cable'

// ------------------------------------------------------------------ helpers
function annulus(k: Kit, mat: MatKey, rIn: number, rOut: number, y0: number, y1: number, pos: V3 = [0, 0, 0], axis: Orient = 'y', seg = 32) {
  k.lathe(mat, [[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1], [rIn, y0]], pos, axis, seg)
}
const faceQ = (n: V3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n).normalize())

/** Porcelain bushing with sheds, axis along `axis` from `pos` (flange) for length L. */
function bushing(k: Kit, mat: MatKey, pos: V3, axis: Orient, L: number, r: number) {
  const prof: [number, number][] = [[0, 0], [r * 1.6, 0], [r * 1.6, 0.03]]
  const n = Math.max(3, Math.round((L * 0.75) / (r * 0.9)))
  const pitch = (L * 0.8) / n
  let y = 0.03
  prof.push([r, y])
  for (let i = 0; i < n; i++) {
    prof.push([r * 1.75, y + pitch * 0.25], [r * 1.7, y + pitch * 0.4], [r, y + pitch * 0.55])
    y += pitch
    prof.push([r, y])
  }
  prof.push([r * 0.9, L * 0.92], [r * 0.45, L * 0.92], [r * 0.45, L], [0, L])
  k.lathe(mat, prof, pos, axis, 24)
  k.cyl('flangeSteel', r * 1.75, 0.03, pos, axis, 24)
}

/** Stamped rating plate (canvas texture). */
const plateCache = new Map<string, THREE.MeshStandardMaterial>()
function ratingPlateMaterial(eq: Transformer) {
  const cool = eq.ratingMVA >= 10 ? 'ONAN / ONAF' : 'ONAN'
  const key = `${eq.tag}|${eq.ratingMVA}|${eq.voltage}`
  let m = plateCache.get(key)
  if (m) return m
  const c = document.createElement('canvas')
  c.width = 384
  c.height = 256
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 384, 256)
  grd.addColorStop(0, '#d6dadd')
  grd.addColorStop(1, '#b9bfc4')
  g.fillStyle = grd
  g.fillRect(0, 0, 384, 256)
  g.strokeStyle = '#555b60'
  g.lineWidth = 5
  g.strokeRect(4, 4, 376, 248)
  g.fillStyle = '#1b1e21'
  g.textAlign = 'left'
  g.font = 'bold 26px Arial, sans-serif'
  g.fillText('POWER TRANSFORMER', 18, 38)
  g.font = '20px Arial, sans-serif'
  const lines = [
    `Tag  ${eq.tag}`,
    `Rating  ${eq.ratingMVA} MVA   ${cool}`,
    `Voltage  ${eq.voltage}`,
    'Vector group  Dyn11   50 Hz',
    'Tap changer  OLTC ±10 %, 17 pos',
    'Oil  mineral, IEC 60296',
  ]
  lines.forEach((t, i) => g.fillText(t, 18, 74 + i * 30))
  for (const [x, y] of [[14, 14], [370, 14], [14, 242], [370, 242]]) {
    g.beginPath()
    g.arc(x, y, 5, 0, TAU)
    g.fillStyle = '#7a8086'
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  m = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.6, roughness: 0.35 })
  m.name = `rating-${key}`
  registerMaterial(m, 'detail')
  plateCache.set(key, m)
  return m
}

/** Wafer butterfly radiator valve on a short pipe along `axis` (lever up). */
function radValve(k: Kit, pos: V3, axis: Orient, r: number) {
  k.cyl('valveBody', r * 1.7, 0.05, pos, axis, 20)
  k.box('handwheel', [0.015, 0.1, 0.015], [pos[0], pos[1] + r * 1.7 + 0.05, pos[2]])
  k.box('handwheel', [0.12, 0.012, 0.02], [pos[0] + 0.05, pos[1] + r * 1.7 + 0.1, pos[2]])
}

// ------------------------------------------------------------------ build
function buildTransformer(eq: Transformer) {
  const k = new Kit()
  const [L, H, W] = eq.size
  const mva = eq.ratingMVA
  const [hvKv, lvKv] = eq.voltage.split('/').map((s) => parseFloat(s) || 11)
  const tank = TANK()
  const fit = FIT()
  const bundM = BUND()
  const onaf = mva >= 10

  // ---------------------------------------------------------------- bund (steel drip tray)
  const Lb = L + 1.0
  const Wb = W + 1.2
  const hb = 0.3
  k.box(bundM, [Lb, 0.02, Wb], [0, 0.01, 0])
  for (const s of [-1, 1]) {
    k.box(bundM, [Lb, hb, 0.012], [0, hb / 2, s * (Wb / 2 - 0.006)])
    k.box(bundM, [0.012, hb, Wb], [s * (Lb / 2 - 0.006), hb / 2, 0])
    k.box(bundM, [Lb, 0.012, 0.06], [0, hb, s * (Wb / 2 - 0.03)])
    k.box(bundM, [0.06, 0.012, Wb], [s * (Lb / 2 - 0.03), hb, 0])
    // external stiffeners
    for (let i = 1; i < Math.round(Lb / 0.8); i++) k.box(bundM, [0.01, hb - 0.03, 0.06], [-Lb / 2 + (i * Lb) / Math.round(Lb / 0.8), hb / 2, s * (Wb / 2 + 0.03)])
  }
  // support beams under the skids, grating over the sump
  const zs = Math.min(W * 0.3, W / 2 - 0.15)
  for (const s of [-1, 1]) k.box(bundM, [L + 0.3, hb - 0.02, 0.2], [0, (hb - 0.02) / 2 + 0.02, s * zs])
  gratingPanel(k, [0, hb - 0.03, 0], Lb - 0.03, Wb - 0.03, bundM)
  // bund drain valve (−Z wall, +X end)
  const xd = Lb / 2 - 0.3
  k.cyl(bundM, 0.03, 0.06, [xd, 0.06, -Wb / 2 - 0.02], 'z', 12)
  k.box('valveBody', [0.08, 0.08, 0.06], [xd, 0.06, -Wb / 2 - 0.045])
  k.cyl('handwheel', 0.006, 0.08, [xd, 0.14, -Wb / 2 - 0.045], 'y', 6)
  k.handwheel('handwheel', 0.08, [xd, 0.18, -Wb / 2 - 0.045], 'y')

  // ---------------------------------------------------------------- skids + tank
  const yS = hb
  const hSk = 0.16
  const y0 = yS + hSk // tank bottom
  const y1 = y0 + H // tank top (cover underside)
  for (const s of [-1, 1]) {
    const z = s * zs
    k.box('equipmentPaintDark', [L + 0.2, 0.014, 0.16], [0, yS + 0.007, z])
    k.box('equipmentPaintDark', [L + 0.2, 0.014, 0.16], [0, y0 - 0.007, z])
    k.box('equipmentPaintDark', [L + 0.2, hSk, 0.014], [0, yS + hSk / 2, z])
    for (const sx of [-1, 1]) k.torus('nut', 0.04, 0.012, [sx * (L / 2 + 0.06), yS + hSk / 2, z], 'z', 6, 14) // haul holes
  }
  // jacking pads at the corners
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.box(fit, [0.22, 0.05, 0.2], [sx * (L / 2 + 0.08), y0 + 0.25, sz * (W / 2 - 0.15)])
      for (const dz of [-0.08, 0.08]) k.box(fit, [0.18, 0.15, 0.012], [sx * (L / 2 + 0.07), y0 + 0.16, sz * (W / 2 - 0.15) + dz])
    }
  // tank walls (outer skin) + inside surface for sections
  k.rbox(tank, [L, H, W], 0.05, [0, y0 + H / 2, 0])
  k.add('vesselInner', new THREE.BoxGeometry(L - 0.02, H - 0.02, W - 0.02), mat4([0, y0 + H / 2, 0]))
  // base frame
  k.box(fit, [L + 0.04, 0.06, W + 0.04], [0, y0 + 0.03, 0])
  // cover with flange rim + bolts, slight crown
  k.box(fit, [L + 0.1, 0.04, W + 0.1], [0, y1 - 0.02, 0])
  k.box(tank, [L + 0.06, 0.03, W + 0.06], [0, y1 + 0.015, 0])
  k.box(tank, [L - 0.1, 0.02, W - 0.1], [0, y1 + 0.04, 0])
  {
    const pitch = 0.16
    const nx = Math.max(4, Math.round((L + 0.04) / pitch))
    const nz = Math.max(3, Math.round((W + 0.04) / pitch))
    for (let i = 0; i <= nx; i++)
      for (const s of [-1, 1]) k.hex('nut', 0.03, 0.02, [-L / 2 - 0.02 + (i * (L + 0.04)) / nx, y1 + 0.04, s * (W / 2 + 0.03)])
    for (let i = 1; i < nz; i++)
      for (const s of [-1, 1]) k.hex('nut', 0.03, 0.02, [s * (L / 2 + 0.03), y1 + 0.04, -W / 2 - 0.02 + (i * (W + 0.04)) / nz])
  }
  // lifting lugs (end walls, top corners)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p: V3 = [sx * (L / 2 + 0.05), y1 - 0.12, sz * (W / 2 - 0.12)]
      k.box(fit, [0.1, 0.22, 0.03], p)
      k.torus('nut', 0.035, 0.008, [p[0], p[1] + 0.05, p[2]], 'z', 6, 14)
    }

  // ---------------------------------------------------------------- core + windings (x-ray / section)
  {
    const core = CORE()
    const wind = WINDING()
    const spc = SPACER()
    const rw = Math.min((L - 0.3) / 6.6, W * 0.36, 0.7)
    const hw = H * 0.6
    const yw = y0 + 0.12 + H * 0.42
    const legs = [-2.2 * rw, 0, 2.2 * rw]
    const yoke = rw * 0.65
    for (const x of legs) {
      k.box(core, [rw * 1.0, hw + 2 * yoke, rw * 0.8], [x, yw, 0])
      k.cyl(wind, rw * 0.72, hw * 0.92, [x, yw, 0], 'y', 28) // LV (inner)
      k.cyl(wind, rw, hw, [x, yw, 0], 'y', 32) // HV (outer)
      for (const f of [-0.5, 0.5]) annulus(k, spc, rw * 0.6, rw * 1.04, yw + f * hw - 0.03, yw + f * hw + 0.03, [x, 0, 0], 'y', 32)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU
        k.box(spc, [0.025, hw * 0.98, 0.012], [x + Math.cos(a) * rw * 1.003, yw, Math.sin(a) * rw * 1.003], faceQ([Math.cos(a), 0, Math.sin(a)]))
      }
    }
    for (const s of [-1, 1]) {
      k.box(core, [legs[2] - legs[0] + rw, yoke, rw * 0.8], [0, yw + s * (hw / 2 + yoke / 2), 0])
      // clamping frames
      for (const sz of [-1, 1]) k.box('equipmentPaintDark', [legs[2] - legs[0] + rw * 1.4, yoke * 0.8, 0.03], [0, yw + s * (hw / 2 + yoke / 2), sz * (rw * 0.4 + 0.02)])
    }
  }

  // ---------------------------------------------------------------- radiators (+ ONAF fans)
  const dp = clamp(0.25 + mva * 0.01, 0.28, onaf ? 0.38 : 0.52) // panel depth out from the header
  const hp = H * 0.72
  const yRb = y0 + H * 0.12 // bottom header
  const yRt = yRb + hp // top header
  const oltcW = clamp(L * 0.22, 0.4, 0.75)
  const oltcX0 = L / 2 - 0.1 - oltcW // OLTC compartment starts here on the +Z side
  const pitch = 0.05
  const rotors: RotorSpec[] = []
  const fans = new Map<string, RotorSpec>() // one impeller geometry per fan size
  for (const s of [-1, 1]) {
    const xa = -L / 2 + 0.22
    const xb = s > 0 ? oltcX0 - 0.1 : L / 2 - 0.22
    const span = xb - xa
    if (span < 0.4) continue
    const nB = Math.max(1, Math.round(span / 1.4))
    const bl = span / nB
    for (let b = 0; b < nB; b++) {
      const x0 = xa + b * bl + 0.06
      const x1 = x0 + bl - 0.12
      const xc = (x0 + x1) / 2
      const zH = s * (W / 2 + 0.16) // header line
      // tank-side connections: pipe, radiator valve, flanges (top + bottom)
      for (const y of [yRt, yRb]) {
        k.rod(fit, [xc, y, s * (W / 2 - 0.01)], [xc, y, zH], 0.045, 16)
        radValve(k, [xc, y, s * (W / 2 + 0.06)], 'z', 0.045)
        k.rod(fit, [x0, y, zH], [x1, y, zH], 0.04, 14) // header
        k.dome(fit, 0.04, [x1, y, zH], 'x', Math.PI / 2, 1, 12)
        k.dome(fit, 0.04, [x0, y, zH], '-x', Math.PI / 2, 1, 12)
      }
      k.hex('brass', 0.03, 0.02, [x1 - 0.03, yRt + 0.045, zH]) // vent plug
      k.hex('brass', 0.03, 0.02, [x1 - 0.03, yRb - 0.045, zH]) // drain plug
      // pressed-steel panels
      const np = Math.max(3, Math.floor((x1 - x0) / pitch))
      for (let i = 0; i < np; i++) {
        const x = x0 + (i + 0.5) * ((x1 - x0) / np)
        k.box(fit, [0.012, hp + 0.06, dp], [x, (yRt + yRb) / 2, zH + s * (dp / 2 - 0.02)])
        k.box(fit, [0.02, hp * 0.9, 0.012], [x, (yRt + yRb) / 2, zH + s * (dp - 0.02)]) // rolled edge
      }
      // panel tie bars + stays to the tank
      for (const y of [yRt - 0.02, yRb + 0.02]) k.box(fit, [x1 - x0, 0.02, 0.012], [xc, y, zH + s * (dp - 0.01)])
      k.rod('equipmentPaintDark', [xc, yRt + 0.08, s * W / 2], [xc, yRt + 0.08, zH + s * (dp - 0.02)], 0.012, 6)
      k.torus('nut', 0.03, 0.008, [xc, yRt + 0.1, zH + s * dp * 0.5], 'z', 6, 12)
      // ONAF side-blow fans on the outer face
      if (onaf) {
        const nf = Math.max(1, Math.round((x1 - x0) / 1.1))
        const rf = Math.min(0.3, (x1 - x0) / nf / 2 - 0.05, hp * 0.22)
        for (let f = 0; f < nf; f++) {
          const xf = x0 + ((f + 0.5) * (x1 - x0)) / nf
          const yf = yRb + hp * 0.35
          const zf = zH + s * (dp + 0.1)
          k.cyl('equipmentPaintDark', rf + 0.02, 0.12, [xf, yf, zf], 'z', 32, undefined, true)
          k.disc(fanGuardMaterial(), rf + 0.015, [xf, yf, zf + s * 0.061], s > 0 ? 'z' : '-z', 32)
          k.cyl('motorPaint', rf * 0.3, 0.12, [xf, yf, zf + s * 0.02], 'z', 16)
          for (const dy of [-1, 1]) k.box('equipmentPaintDark', [0.03, 0.03, 0.14], [xf, yf + dy * (rf + 0.03), zf - s * 0.07])
          k.box('equipmentPaintDark', [0.1, 0.08, 0.06], [xf + rf + 0.08, yf - rf * 0.6, zf]) // fan terminal box
          // impeller (turns while energised), behind the motor, blowing onto the radiator panels
          const key = rf.toFixed(3)
          if (!fans.has(key)) fans.set(key, fanRotor(k, 'stainless', rf * 0.94, [0, 0, 0], 'z', 0, { blades: 5, chord: rf * 0.42, pitch: 0.34, hub: rf * 0.2, hubLen: 0.03 }))
          rotors.push({ ...fans.get(key)!, pos: [xf, yf, zf - s * 0.045], rpm: 205 })
        }
      }
    }
  }

  // ---------------------------------------------------------------- OLTC compartment + motor drive (+Z, +X end)
  {
    const xo = (oltcX0 + L / 2 - 0.1) / 2
    const wo = L / 2 - 0.1 - oltcX0
    const dO = 0.32
    const yo0 = y0 + H * 0.3
    const yo1 = y1 - 0.06
    k.rbox(tank, [wo, yo1 - yo0, dO], 0.03, [xo, (yo0 + yo1) / 2, W / 2 + dO / 2 - 0.01])
    k.box(fit, [wo + 0.05, 0.03, dO + 0.04], [xo, yo1 + 0.015, W / 2 + dO / 2])
    for (let i = 0; i < 5; i++) k.hex('nut', 0.026, 0.018, [xo - wo / 2 + (i + 0.5) * (wo / 5), yo1 + 0.04, W / 2 + dO + 0.005])
    // diverter head on top, pipe + protective relay to the conservator OLTC compartment (set later)
    k.cyl(fit, 0.13, 0.08, [xo, yo1 + 0.07, W / 2 + dO / 2], 'y', 24)
    // motor-drive cabinet below, vertical drive shaft + bevel gearbox into the compartment
    const md: V3 = [xo, y0 + 0.55, W / 2 + 0.17]
    k.rbox(fit, [Math.min(0.55, wo), 0.7, 0.3], 0.02, md)
    k.box('glass', [0.16, 0.12, 0.004], [md[0], md[1] + 0.12, md[2] + 0.152])
    k.box('stainless', [0.02, 0.1, 0.03], [md[0] + Math.min(0.55, wo) / 2 - 0.06, md[1], md[2] + 0.16])
    k.rod('stainless', [xo, md[1] + 0.35, W / 2 + 0.2], [xo, yo0 - 0.06, W / 2 + 0.2], 0.012, 8)
    k.rbox(fit, [0.1, 0.1, 0.1], 0.015, [xo, yo0 - 0.05, W / 2 + 0.2])
    k.cyl('brass', 0.02, 0.05, [xo + 0.12, md[1] - 0.37, md[2]], 'y', 8)
    k.spline(XLPE, [[xo + 0.12, md[1] - 0.4, md[2]], [xo + 0.12, yS + 0.05, md[2] + 0.05]], 0.012, 6, 8)
    tagPlate(k, 'OLTC', [xo, (yo0 + yo1) / 2 + 0.1, W / 2 + dO + 0.002], 'z', 0.14)
  }

  // ---------------------------------------------------------------- cable boxes + bushings
  const cableBox = (end: 1 | -1, kv: number, nPh: number, cablesPerPh: number) => {
    const depth = clamp(0.32 + kv * 0.006, 0.35, 0.5)
    const wBox = clamp(0.5 + kv * 0.018 + (nPh - 3) * 0.12, 0.5, W - 0.2)
    const hBox = clamp(0.55 + kv * 0.012, 0.55, H * 0.45)
    const yc = y1 - 0.1 - hBox / 2
    const xw = end * (L / 2)
    const xc = xw + end * depth / 2
    k.rbox(tank, [depth, hBox, wBox], 0.025, [xc, yc, 0])
    // bolted cover frame on the outer face + gland plate below
    k.box(fit, [0.02, hBox + 0.04, wBox + 0.04], [xw + end * (depth + 0.005), yc, 0])
    const nb = Math.max(3, Math.round(wBox / 0.15))
    for (let i = 0; i <= nb; i++)
      for (const sy of [-1, 1]) k.hex('nut', 0.024, 0.014, [xw + end * (depth + 0.018), yc + sy * (hBox / 2 + 0.008), -wBox / 2 + (i * wBox) / nb], 'x')
    k.box('equipmentPaintDark', [depth * 0.8, 0.02, wBox * 0.85], [xc, yc - hBox / 2 - 0.01, 0])
    k.plane(signMaterial('hv'), 0.24, 0.12, [xw + end * (depth + 0.017), yc + hBox * 0.2, 0], faceQ([end, 0, 0]))
    // bushings from the tank wall into the box
    const rB = clamp(0.03 + kv * 0.0012, 0.035, 0.08)
    const LB = Math.min(depth - 0.06, 0.18 + kv * 0.008)
    for (let i = 0; i < nPh; i++) {
      const z = -wBox / 2 + ((i + 0.5) * wBox) / nPh
      bushing(k, PORCELAIN(), [xw, yc + hBox * 0.12, z], end > 0 ? 'x' : '-x', LB, rB)
      // cable terminations rising from the gland plate to the bushing stems
      for (let c = 0; c < cablesPerPh; c++) {
        const zc = z + (c - (cablesPerPh - 1) / 2) * 0.07
        const xg = xw + end * (depth * 0.55)
        k.cyl('brass', 0.03, 0.05, [xg, yc - hBox / 2 - 0.035, zc], 'y', 12) // gland
        k.spline(XLPE, [[xg, yc - hBox / 2 - 0.06, zc], [xg + end * 0.04, (yc - hBox / 2 + yS) / 2, zc], [xg + end * 0.12, yS + 0.08, zc * 1.1], [xg + end * 0.14, 0.04, zc * 1.1]], 0.025, 8, 24)
        k.rod('internalsSteel', [xg, yc - hBox / 2, zc], [xg, yc + hBox * 0.12 - 0.04, zc], 0.018, 8)
      }
    }
    return { yc, hBox, depth, wBox }
  }
  cableBox(1, hvKv, 3, 1)
  const lv = cableBox(-1, lvKv, 4, clamp(Math.ceil(mva / (lvKv * 1.2)), 1, 3))
  // LV neutral earth (copper strip down the end wall to the earth bar)
  k.box(COPPER(), [0.006, lv.yc - lv.hBox / 2 - y0 - 0.1, 0.04], [-L / 2 - 0.02, (lv.yc - lv.hBox / 2 + y0 + 0.1) / 2, -lv.wBox / 2 + 0.05])

  // ---------------------------------------------------------------- earthing bar, earth bosses, valves
  const cu = COPPER()
  k.box(cu, [0.3, 0.05, 0.008], [-L / 2 + 0.35, y0 + 0.12, -W / 2 - 0.02])
  for (const dx of [-0.1, 0, 0.1]) k.hex('nut', 0.02, 0.012, [-L / 2 + 0.35 + dx, y0 + 0.12, -W / 2 - 0.028], 'z')
  for (const p of [[-L / 2 + 0.35, -W / 2 - 0.02], [L / 2 - 0.2, W / 2 + 0.02]] as [number, number][]) {
    k.cyl('brass', 0.025, 0.04, [p[0], y0 + 0.06, p[1]], 'z', 10)
    k.spline(cu, [[p[0], y0 + 0.06, p[1]], [p[0], yS + 0.02, p[1] * 1.05], [p[0] + 0.1, yS + 0.01, p[1] * 1.05]], 0.01, 6, 10)
  }
  // drain / filter valve (bottom), top filter valve, sampling cock
  const valveAt = (pos: V3, dir: 1 | -1) => {
    k.rod(fit, [pos[0], pos[1], pos[2] - dir * 0.02], [pos[0], pos[1], pos[2] + dir * 0.1], 0.03, 12)
    k.box('valveBody', [0.09, 0.09, 0.1], [pos[0], pos[1], pos[2] + dir * 0.15])
    k.cyl('handwheel', 0.006, 0.1, [pos[0], pos[1] + 0.09, pos[2] + dir * 0.15], 'y', 6)
    k.handwheel('handwheel', 0.12, [pos[0], pos[1] + 0.14, pos[2] + dir * 0.15], 'y')
    k.cyl('flangeSteel', 0.06, 0.02, [pos[0], pos[1], pos[2] + dir * 0.21], 'z', 18)
  }
  valveAt([L / 2 - 0.25, y0 + 0.14, -W / 2], -1)
  valveAt([-L / 2 + 0.7, y1 - 0.15, -W / 2], -1)
  k.cyl('brass', 0.012, 0.06, [L / 2 - 0.45, y0 + 0.14, -W / 2 - 0.03], 'z', 8)

  // ---------------------------------------------------------------- wall stiffeners (between fittings)
  for (const s of [-1, 1]) {
    // end walls: either side of the cable box
    for (const z of [-W / 2 + 0.12, W / 2 - 0.12]) k.box(fit, [0.06, H * 0.82, 0.08], [s * (L / 2 + 0.03), y0 + H * 0.45, z])
  }
  {
    // long walls: a stiffener between each radiator bank (and at the ends)
    const n = Math.max(2, Math.round(L / 0.9))
    for (let i = 0; i <= n; i++) {
      const x = -L / 2 + 0.1 + (i * (L - 0.2)) / n
      for (const s of [-1, 1]) {
        if (s > 0 && x > oltcX0 - 0.05) continue
        k.box(fit, [0.07, H * 0.08, 0.06], [x, y0 + 0.1 + H * 0.04, s * (W / 2 + 0.03)])
        k.box(fit, [0.07, H * 0.12, 0.06], [x, y1 - 0.06 - H * 0.06, s * (W / 2 + 0.03)])
      }
    }
  }

  // ---------------------------------------------------------------- conservator, Buchholz, breathers
  const Dc = clamp(0.22 + 0.008 * mva, 0.25, Math.min(0.8, W * 0.45))
  const Lcn = clamp(L * 0.62, 0.7, 3.5)
  const xC = -L * 0.08
  const zC = -W / 2 + Math.max(Dc / 2, 0.2)
  const yC = y1 + 0.45 + Dc / 2
  const xOl = xC - Lcn / 2 + Lcn * 0.2 // OLTC / main compartment partition
  k.cyl(fit, Dc / 2, Lcn, [xC, yC, zC], 'x', 36)
  for (const s of [-1, 1]) k.dome(fit, Dc / 2, [xC + s * Lcn / 2, yC, zC], s > 0 ? 'x' : '-x', Math.PI / 2, 0.35, 32)
  annulus(k, fit, Dc / 2, Dc / 2 + 0.012, -0.015, 0.015, [xOl, yC, zC], 'x', 36) // partition seam
  for (const s of [-1, 1]) annulus(k, fit, Dc / 2, Dc / 2 + 0.015, -0.02, 0.02, [xC + s * (Lcn / 2 - 0.02), yC, zC], 'x', 36)
  // cradle brackets on the cover
  for (const x of [xC - Lcn * 0.33, xC + Lcn * 0.33]) {
    for (const dz of [-Dc * 0.3, Dc * 0.3]) k.box('equipmentPaintDark', [0.08, yC - y1 - 0.02, 0.06], [x, (yC + y1) / 2, zC + dz])
    k.torus('equipmentPaintDark', Dc / 2 + 0.01, 0.015, [x, yC, zC], 'x', 6, 32, Math.PI)
    k.box('equipmentPaintDark', [0.1, 0.03, Dc * 0.9], [x, y1 + 0.06, zC])
  }
  // magnetic oil-level gauge on the +X end
  smallGauge(k, [xC + Lcn / 2 + Dc * 0.18, yC, zC], 'x', dialMaterial('bar', 10), Math.min(0.16, Dc * 0.4))
  k.cyl('brass', 0.04, 0.05, [xC + Lcn * 0.25, yC + Dc / 2 + 0.02, zC], 'y', 14) // filler cap
  k.cyl('brass', 0.03, 0.05, [xOl - 0.15, yC + Dc / 2 + 0.02, zC], 'y', 14)

  // Buchholz pipe: riser from the cover, slightly rising run with the relay, up into the conservator
  const rP = 0.04
  const xa = Math.min(xC + Lcn / 2 + 0.38, L / 2 - 0.12)
  const xIn = Math.min(xC + Lcn / 2 - Math.min(0.25, Lcn * 0.2), xa - 0.35)
  const yR = y1 + 0.24
  const pts: V3[] = [[xa, y1 + 0.03, zC], [xa, yR, zC], [xIn, yR + 0.025, zC], [xIn, yC - Dc / 2 + 0.02, zC]]
  k.tube(fit, pts, rP, 14, 0.08)
  const xr = (xa + xIn) / 2
  const yr = yR + 0.012
  k.rbox('castIron', [0.2, 0.18, 0.16], 0.02, [xr, yr, zC]) // relay body
  for (const s of [-1, 1]) {
    k.cyl('castIron', 0.075, 0.02, [xr + s * 0.11, yr, zC], 'x', 20)
    k.disc('glass', 0.045, [xr, yr, zC + s * 0.081], s > 0 ? 'z' : '-z', 20) // inspection windows
  }
  k.rbox('castIron', [0.12, 0.08, 0.1], 0.015, [xr, yr + 0.13, zC]) // terminal box
  k.cyl('brass', 0.008, 0.05, [xr - 0.06, yr + 0.12, zC + 0.04], 'y', 6) // test cock
  for (const xv of [xa, xIn]) {
    const yv = xv === xa ? y1 + 0.13 : yC - Dc / 2 - 0.12
    k.box('valveBody', [0.11, 0.08, 0.11], [xv, yv, zC])
    k.handwheel('handwheel', 0.1, [xv, yv, zC - 0.1], 'z')
    k.rod('handwheel', [xv, yv, zC - 0.05], [xv, yv, zC - 0.1], 0.006, 6)
  }
  // OLTC compartment pipe from the diverter head to the conservator OLTC section (protective relay)
  {
    const xo = (oltcX0 + L / 2 - 0.1) / 2
    const zo = W / 2 + 0.16
    const yTopO = y1 + 0.12
    const xEnd = xOl - Lcn * 0.1
    const op: V3[] = [[xo, yTopO, zo], [xo, yTopO + 0.18, zo], [xo, yTopO + 0.18, zC + Dc * 0.35], [xEnd, yTopO + 0.2, zC + Dc * 0.35], [xEnd, yC - Dc * 0.3, zC + Dc * 0.35]]
    k.tube(fit, op, 0.025, 10, 0.06)
    k.rbox('castIron', [0.14, 0.12, 0.1], 0.015, [(xo + xEnd) / 2 + 0.3, yTopO + 0.19, zC + Dc * 0.35])
  }
  // silica-gel breathers (main + OLTC) piped down the −X end wall
  const breather = (xTop: number, zb: number, yb: number, sz: number) => {
    k.tube('tubing', [[xTop, yC + Dc / 2 - 0.01, zC], [xTop, yC + Dc / 2 + 0.08, zC], [-L / 2 - 0.1, yC + Dc / 2 + 0.08, zC], [-L / 2 - 0.1, yC + Dc / 2 + 0.08, zb], [-L / 2 - 0.1, yb + sz * 0.25, zb]], 0.016, 8, 0.05)
    const x = -L / 2 - 0.1
    k.cyl(fit, sz * 0.32, 0.03, [x, yb + sz * 0.22, zb], 'y', 20)
    k.cyl('glass', sz * 0.27, sz * 0.4, [x, yb, zb], 'y', 20)
    k.cyl(SILICA(), sz * 0.24, sz * 0.36, [x, yb, zb], 'y', 16)
    k.cyl(fit, sz * 0.32, 0.03, [x, yb - sz * 0.22, zb], 'y', 20)
    k.cyl('glass', sz * 0.2, sz * 0.14, [x, yb - sz * 0.32, zb], 'y', 16) // oil cup
    k.box('equipmentPaintDark', [0.04, 0.06, 0.08], [x + 0.06, yb + sz * 0.22, zb]) // wall clip
  }
  const yBr = y0 + Math.min(1.25, H * 0.5)
  breather(xC - Lcn / 2 + Lcn * 0.45, -W / 2 + 0.12, yBr, 0.45)
  breather(xOl - 0.15, -W / 2 + 0.32, yBr + 0.1, 0.3)

  // ---------------------------------------------------------------- pressure relief device (+X, +Z cover corner)
  {
    const p: V3 = [L / 2 - 0.35, y1 + 0.05, W / 2 - 0.35]
    annulus(k, fit, 0, 0.14, p[1], p[1] + 0.03, [p[0], 0, p[2]], 'y', 28)
    k.cyl('castIron', 0.11, 0.1, [p[0], p[1] + 0.08, p[2]], 'y', 24)
    k.dome('castIron', 0.11, [p[0], p[1] + 0.13, p[2]], 'y', Math.PI / 2, 0.35, 24)
    k.cyl('actuatorYellow', 0.012, 0.08, [p[0], p[1] + 0.2, p[2]], 'y', 8) // operation indicator pin
    // directed-discharge hood + pipe down to the bund
    k.cyl(fit, 0.17, 0.22, [p[0], p[1] + 0.11, p[2]], 'y', 28, undefined, true)
    k.tube(fit, [[p[0] + 0.15, p[1] + 0.08, p[2]], [L / 2 + 0.12, p[1] + 0.08, p[2]], [L / 2 + 0.12, yS + 0.15, p[2]]], 0.05, 12, 0.1)
  }

  // ---------------------------------------------------------------- marshalling kiosk with OTI / WTI, rating plate
  {
    const xw = L / 2
    const hvBottom = y1 - 0.1 - clamp(0.55 + hvKv * 0.012, 0.55, H * 0.45)
    const hK = clamp(hvBottom - (y0 + 0.2) - 0.08, 0.25, 0.6)
    const yK = y0 + 0.2 + hK / 2
    const zK = W * 0.25
    const wK = Math.min(0.38, W * 0.4)
    k.rbox(fit, [0.2, hK, wK], 0.015, [xw + 0.1, yK, zK])
    k.box('stainless', [0.03, 0.08, 0.02], [xw + 0.21, yK, zK + wK / 2 - 0.04])
    const d = Math.min(0.11, hK * 0.4, wK * 0.4)
    smallGauge(k, [xw + 0.205, yK + hK * 0.18, zK - wK * 0.22], 'x', dialMaterial('°C', 150), d) // OTI
    smallGauge(k, [xw + 0.205, yK + hK * 0.18, zK + wK * 0.18], 'x', dialMaterial('°C', 150), d) // WTI
    // capillaries to the thermometer pockets on the cover
    for (const dz of [-wK * 0.22, wK * 0.18]) {
      k.tube('tubing', [[xw + 0.15, yK + hK / 2, zK + dz], [xw + 0.15, y1 + 0.02, zK + dz], [xw - 0.3, y1 + 0.06, zK + dz]], 0.004, 6, 0.04)
      k.cyl('brass', 0.02, 0.06, [xw - 0.3, y1 + 0.08, zK + dz], 'y', 10)
    }
    k.cyl('brass', 0.02, 0.05, [xw + 0.1, yK - hK / 2 - 0.03, zK], 'y', 8)
    k.spline(XLPE, [[xw + 0.1, yK - hK / 2 - 0.05, zK], [xw + 0.14, yS + 0.08, zK + 0.05], [xw + 0.18, 0.04, zK + 0.06]], 0.012, 6, 12)
    // rating plate
    const plate = ratingPlateMaterial(eq)
    const wp = Math.min(0.36, W * 0.36)
    const zP = -W * 0.25
    k.box('stainless', [0.004, wp * 0.67 + 0.01, wp + 0.01], [xw + 0.002, y0 + 0.2 + wp * 0.34, zP])
    k.plane(plate, wp, wp * 0.667, [xw + 0.0045, y0 + 0.2 + wp * 0.34, zP], faceQ([1, 0, 0]))
  }

  tagPlate(k, eq.tag, [0, y0 + H * 0.88, W / 2 + 0.003], 'z', 0.2)
  tagPlate(k, eq.tag, [0, y0 + H * 0.88, -W / 2 - 0.003], '-z', 0.2)

  return { built: k.build(), rotors }
}

export function TransformerModel({ eq }: { eq: Transformer }) {
  const { built, rotors } = useMemo(() => buildTransformer(eq), [eq])
  return (
    <group>
      <KitMesh data={built} />
      <Rotors tag={eq.tag} rotors={rotors} />
    </group>
  )
}
