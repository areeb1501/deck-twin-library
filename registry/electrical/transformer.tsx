// Oil-immersed power transformer (ONAN / ONAF) on a bunded steel plinth: radiators, fans, bushings or cable boxes, conservator, Buchholz, OLTC. IEC 60076.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey, type Orient, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { gauge, grating, ladder, tagPlate } from '../lib/parts'
import { Rotors, fanRotor, type RotorSpec } from '../lib/rotors'
import { fanGuardMaterial, signMaterial } from '../lib/textures'
import { ratingPlateMaterial } from './_textures'

export interface TransformerProps {
  /** rated power, MVA (sets tank, radiators, conservator) */
  mva?: number
  /** HV / LV line voltage, kV */
  hvKv?: number
  lvKv?: number
  cooling?: 'ONAN' | 'ONAF'
  /** cable boxes on the tank ends, or porcelain bushings on the cover */
  terminations?: 'cable-box' | 'outdoor'
  /** on-load tap changer compartment and motor drive */
  oltc?: boolean
  tag?: string
  /** spin the ONAF fans */
  running?: boolean
}

export const defaults = {
  mva: 20,
  hvKv: 33,
  lvKv: 11,
  cooling: 'ONAF' as 'ONAN' | 'ONAF',
  terminations: 'cable-box' as 'cable-box' | 'outdoor',
  oltc: true,
  tag: 'TR-101',
  running: true,
}

type P = Omit<typeof defaults, 'running'>

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const faceQ = (n: V3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n).normalize())

/** Tank length (X), height, width (Z) from the rating. */
function tankSize(mva: number): V3 {
  const m = clamp(mva, 0.5, 100)
  return [1.1 + 0.63 * Math.sqrt(m), 1.1 + 0.5 * Math.pow(m, 0.42), 0.75 + 0.3 * Math.pow(m, 0.42)] // typical
}

export function Transformer({ running = true, ...rest }: TransformerProps & GroupProps) {
  const { mva, hvKv, lvKv, cooling, terminations, oltc, tag, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(() => build({ mva, hvKv, lvKv, cooling, terminations, oltc, tag }), [mva, hvKv, lvKv, cooling, terminations, oltc, tag])
  useEffect(() => () => [built, ...new Set(rotors.map((r) => r.built))].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default Transformer

function annulus(k: Kit, mat: MatKey, rIn: number, rOut: number, y0: number, y1: number, pos: V3, axis: Orient = 'y', seg = 32) {
  k.lathe(mat, [[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1], [rIn, y0]], pos, axis, seg)
}

/** Porcelain bushing with alternating sheds, flange at pos, along axis for L. */
function bushing(k: Kit, porcelain: MatKey, pos: V3, axis: 'y' | 'x' | '-x', L: number, r: number) {
  const prof: [number, number][] = [[0, 0], [r * 1.6, 0], [r * 1.6, 0.03], [r, 0.03]]
  const n = Math.max(3, Math.round((L * 0.78) / (r * 0.75)))
  const pitch = (L * 0.8) / n
  let y = 0.03
  for (let i = 0; i < n; i++) {
    const big = i % 2 === 0 ? 1.85 : 1.55
    prof.push([r * big, y + pitch * 0.3], [r * (big - 0.05), y + pitch * 0.45], [r, y + pitch * 0.62])
    y += pitch
    prof.push([r, y])
  }
  prof.push([r * 0.9, L * 0.9], [r * 0.5, L * 0.9], [r * 0.5, L], [0, L])
  k.lathe(porcelain, prof, pos, axis, 24)
  k.cyl('flangeSteel', r * 2.1, 0.03, pos, axis, 24)
  k.boltCircle('boltXylan', 'nut', 8, r * 1.85, pos, axis, Math.max(0.01, r * 0.16), 0.05, [0.02], Math.PI / 8)
}

/** Wafer radiator valve with lever. */
function radValve(k: Kit, pos: V3, r: number) {
  k.cyl('valveBody', r * 1.7, 0.05, pos, 'z', 20)
  k.box('handwheel', [0.015, 0.1, 0.015], [pos[0], pos[1] + r * 1.7 + 0.05, pos[2]])
  k.box('handwheel', [0.12, 0.012, 0.02], [pos[0] + 0.05, pos[1] + r * 1.7 + 0.1, pos[2]])
}

function build(p: P) {
  const k = new Kit()
  const [L, H, W] = tankSize(p.mva)
  const onaf = p.cooling === 'ONAF'
  const outdoor = p.terminations === 'outdoor'
  const sealed = p.mva < 2.5 // small units are hermetically sealed, no conservator
  const tank = paint('#9aa39c', { metalness: 0.3, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.45 })
  const fit = paint('#9aa39c', { metalness: 0.3, roughness: 0.5, clearcoat: 0, weather: 0.6 })
  const porcelain = paint('#6e3420', { metalness: 0.05, roughness: 0.12, clearcoat: 0.9, clearcoatRoughness: 0.1, weather: 0 })
  const silica = paint('#d9892b', { metalness: 0, roughness: 0.7, clearcoat: 0, weather: 0 })
  const bundM = paint('#7f878b', { metalness: 0.3, roughness: 0.6, clearcoat: 0, weather: 1.2 })
  const cu: MatKey = 'copper'

  // bund: steel drip tray, beams under the skids, grating over the sump, drain valve
  const Lb = L + 1.0
  const Wb = W + 1.2
  const hb = 0.3
  k.box(bundM, [Lb, 0.02, Wb], [0, 0.01, 0])
  for (const s of [-1, 1]) {
    k.box(bundM, [Lb, hb, 0.012], [0, hb / 2, s * (Wb / 2 - 0.006)])
    k.box(bundM, [0.012, hb, Wb], [s * (Lb / 2 - 0.006), hb / 2, 0])
    k.box(bundM, [Lb, 0.012, 0.06], [0, hb, s * (Wb / 2 - 0.03)])
    k.box(bundM, [0.06, 0.012, Wb], [s * (Lb / 2 - 0.03), hb, 0])
    const n = Math.round(Lb / 0.8)
    for (let i = 1; i < n; i++) k.box(bundM, [0.01, hb - 0.03, 0.06], [-Lb / 2 + (i * Lb) / n, hb / 2, s * (Wb / 2 + 0.03)])
  }
  const zs = Math.min(W * 0.3, W / 2 - 0.15)
  for (const s of [-1, 1]) k.box(bundM, [L + 0.3, hb - 0.05, 0.2], [0, (hb - 0.05) / 2 + 0.02, s * zs])
  grating(k, [0, hb - 0.03, 0], Lb - 0.03, Wb - 0.03, bundM)
  const xd = Lb / 2 - 0.3
  k.cyl(bundM, 0.03, 0.06, [xd, 0.06, -Wb / 2 - 0.02], 'z', 12)
  k.box('valveBody', [0.08, 0.08, 0.06], [xd, 0.06, -Wb / 2 - 0.045])
  k.cyl('handwheel', 0.006, 0.08, [xd, 0.14, -Wb / 2 - 0.045], 'y', 6)
  k.handwheel('handwheel', 0.08, [xd, 0.18, -Wb / 2 - 0.045], 'y')

  // skids (haul holes), jacking pads, tank, cover with bolted rim, lifting lugs
  const yS = hb
  const hSk = 0.16
  const y0 = yS + hSk
  const y1 = y0 + H
  for (const s of [-1, 1]) {
    const z = s * zs
    k.box('equipmentPaintDark', [L + 0.2, 0.014, 0.16], [0, yS + 0.007, z])
    k.box('equipmentPaintDark', [L + 0.2, 0.014, 0.16], [0, y0 - 0.007, z])
    k.box('equipmentPaintDark', [L + 0.2, hSk - 0.028, 0.014], [0, yS + hSk / 2, z])
    for (const sx of [-1, 1]) k.torus('nut', 0.04, 0.012, [sx * (L / 2 + 0.06), yS + hSk / 2, z], 'z', 6, 14)
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.box(fit, [0.22, 0.05, 0.2], [sx * (L / 2 + 0.08), y0 + 0.25, sz * (W / 2 - 0.15)])
      for (const dz of [-0.08, 0.08]) k.box(fit, [0.18, 0.15, 0.012], [sx * (L / 2 + 0.07), y0 + 0.16, sz * (W / 2 - 0.15) + dz])
    }
  k.rbox(tank, [L, H, W], 0.05, [0, y0 + H / 2, 0])
  k.box(fit, [L + 0.04, 0.06, W + 0.04], [0, y0 + 0.03, 0])
  k.box(fit, [L + 0.1, 0.04, W + 0.1], [0, y1 - 0.02, 0])
  k.box(tank, [L + 0.06, 0.03, W + 0.06], [0, y1 + 0.015, 0])
  k.box(tank, [L - 0.1, 0.02, W - 0.1], [0, y1 + 0.04, 0])
  {
    const nx = Math.max(4, Math.round((L + 0.04) / 0.16))
    const nz = Math.max(3, Math.round((W + 0.04) / 0.16))
    for (let i = 0; i <= nx; i++) for (const s of [-1, 1]) k.hex('nut', 0.03, 0.02, [-L / 2 - 0.02 + (i * (L + 0.04)) / nx, y1 + 0.04, s * (W / 2 + 0.03)])
    for (let i = 1; i < nz; i++) for (const s of [-1, 1]) k.hex('nut', 0.03, 0.02, [s * (L / 2 + 0.03), y1 + 0.04, -W / 2 - 0.02 + (i * (W + 0.04)) / nz])
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const lp: V3 = [sx * (L / 2 + 0.05), y1 - 0.12, sz * (W / 2 - 0.12)]
      k.box(fit, [0.1, 0.22, 0.03], lp)
      k.torus('nut', 0.035, 0.008, [lp[0], lp[1] + 0.05, lp[2]], 'z', 6, 14)
    }

  // radiator banks on both long sides (OLTC end of +Z kept clear), ONAF side-blow fans
  const dp = clamp(0.25 + p.mva * 0.01, 0.28, onaf ? 0.38 : 0.52)
  const hp = H * 0.72
  const yRb = y0 + H * 0.12
  const yRt = yRb + hp
  const oltcW = clamp(L * 0.22, 0.4, 0.75)
  const oltcX0 = L / 2 - 0.1 - oltcW
  const rotors: RotorSpec[] = []
  const fans = new Map<string, RotorSpec>()
  for (const s of [-1, 1]) {
    const xa = -L / 2 + 0.22
    const xb = s > 0 && p.oltc ? oltcX0 - 0.1 : L / 2 - 0.22
    const span = xb - xa
    if (span < 0.4) continue
    const nB = Math.max(1, Math.round(span / 1.4))
    const bl = span / nB
    for (let b = 0; b < nB; b++) {
      const x0 = xa + b * bl + 0.06
      const x1 = x0 + bl - 0.12
      const xc = (x0 + x1) / 2
      const zH = s * (W / 2 + 0.16)
      for (const y of [yRt, yRb]) {
        k.rod(fit, [xc, y, s * (W / 2 - 0.01)], [xc, y, zH], 0.045, 16)
        radValve(k, [xc, y, s * (W / 2 + 0.06)], 0.045)
        k.rod(fit, [x0, y, zH], [x1, y, zH], 0.04, 14)
        k.dome(fit, 0.04, [x1, y, zH], 'x', Math.PI / 2, 1, 12)
        k.dome(fit, 0.04, [x0, y, zH], '-x', Math.PI / 2, 1, 12)
      }
      k.hex('brass', 0.03, 0.02, [x1 - 0.03, yRt + 0.045, zH])
      k.hex('brass', 0.03, 0.02, [x1 - 0.03, yRb - 0.045, zH])
      const np = Math.max(3, Math.floor((x1 - x0) / 0.05))
      for (let i = 0; i < np; i++) {
        const x = x0 + (i + 0.5) * ((x1 - x0) / np)
        k.box(fit, [0.012, hp + 0.06, dp], [x, (yRt + yRb) / 2, zH + s * (dp / 2 - 0.02)])
        k.box(fit, [0.02, hp * 0.9, 0.012], [x, (yRt + yRb) / 2, zH + s * (dp - 0.02)])
      }
      for (const y of [yRt - 0.02, yRb + 0.02]) k.box(fit, [x1 - x0, 0.02, 0.012], [xc, y, zH + s * (dp - 0.01)])
      k.rod('equipmentPaintDark', [xc, yRt + 0.08, (s * W) / 2], [xc, yRt + 0.08, zH + s * (dp - 0.02)], 0.012, 6)
      if (!onaf) continue
      const nf = Math.max(1, Math.round((x1 - x0) / 1.1))
      const rf = Math.max(0.12, Math.min(0.3, (x1 - x0) / nf / 2 - 0.05, hp * 0.22))
      for (let f = 0; f < nf; f++) {
        const xf = x0 + ((f + 0.5) * (x1 - x0)) / nf
        const yf = yRb + hp * 0.35
        const zf = zH + s * (dp + 0.1)
        k.cyl('equipmentPaintDark', rf + 0.02, 0.12, [xf, yf, zf], 'z', 32, undefined, true)
        k.disc(fanGuardMaterial(), rf + 0.015, [xf, yf, zf + s * 0.061], s > 0 ? 'z' : '-z', 32)
        k.cyl('motorPaint', rf * 0.3, 0.12, [xf, yf, zf + s * 0.02], 'z', 16)
        // support brackets back to the radiator edge
        for (const dy of [-1, 1]) k.box('equipmentPaintDark', [0.03, 0.03, 0.16], [xf, yf + dy * (rf + 0.03), zf - s * 0.09])
        k.box('equipmentPaintDark', [0.1, 0.08, 0.06], [xf + rf + 0.08, yf - rf * 0.6, zf])
        const key = rf.toFixed(3)
        if (!fans.has(key)) fans.set(key, fanRotor('stainless', rf * 0.94, [0, 0, 0], 'z', 205, { blades: 5, chord: rf * 0.42, pitch: 0.34, hub: rf * 0.2, hubLen: 0.03 }))
        rotors.push({ ...fans.get(key)!, pos: [xf, yf, zf - s * 0.045] })
      }
    }
  }

  // OLTC compartment, diverter head, motor-drive cabinet with drive shaft (+Z side, +X end)
  const xo = (oltcX0 + L / 2 - 0.1) / 2
  if (p.oltc) {
    const wo = L / 2 - 0.1 - oltcX0
    const dO = 0.32
    const yo0 = y0 + H * 0.3
    const yo1 = y1 - 0.06
    k.rbox(tank, [wo, yo1 - yo0, dO], 0.03, [xo, (yo0 + yo1) / 2, W / 2 + dO / 2 - 0.01])
    k.box(fit, [wo + 0.05, 0.03, dO + 0.04], [xo, yo1 + 0.015, W / 2 + dO / 2])
    for (let i = 0; i < 5; i++) k.hex('nut', 0.026, 0.018, [xo - wo / 2 + (i + 0.5) * (wo / 5), yo1 + 0.04, W / 2 + dO + 0.005])
    k.cyl(fit, 0.13, 0.08, [xo, yo1 + 0.07, W / 2 + dO / 2], 'y', 24)
    const mw = Math.min(0.55, wo)
    const md: V3 = [xo, y0 + 0.55, W / 2 + dO + 0.16]
    k.rbox(fit, [mw, 0.7, 0.3], 0.02, md)
    k.box('glass', [0.16, 0.12, 0.004], [md[0], md[1] + 0.12, md[2] + 0.152])
    k.box('stainless', [0.02, 0.1, 0.03], [md[0] + mw / 2 - 0.06, md[1], md[2] + 0.16])
    k.box('equipmentPaintDark', [0.06, 0.5, 0.17], [md[0], md[1], W / 2 + dO / 2 + 0.08])
    k.rod('stainless', [xo, md[1] + 0.35, md[2] - 0.08], [xo, yo0 - 0.06, md[2] - 0.08], 0.012, 8)
    k.rbox(fit, [0.1, 0.1, 0.1], 0.015, [xo, yo0 - 0.05, md[2] - 0.08])
    k.cyl('brass', 0.02, 0.05, [xo + 0.12, md[1] - 0.37, md[2]], 'y', 8)
    k.spline('cable', [[xo + 0.12, md[1] - 0.4, md[2]], [xo + 0.14, yS + 0.1, md[2] + 0.05], [xo + 0.16, hb - 0.02, md[2] + 0.06]], 0.012, 6, 8)
    tagPlate(k, 'OLTC', [xo, (yo0 + yo1) / 2 + 0.1, W / 2 + dO + 0.002], 'z', 0.14)
  }

  // terminations
  const rHV = clamp(0.03 + p.hvKv * 0.0009, 0.035, 0.09) * clamp(W / 1.6, 0.7, 1)
  const rLV = clamp(0.03 + p.lvKv * 0.0012, 0.035, 0.07) * clamp(W / 1.6, 0.7, 1)
  let xHv = L / 2
  let xLv = -L / 2
  let hvBottom = y1 - 0.3
  if (outdoor) {
    xHv = L / 2 - 0.3 - rHV * 1.85
    xLv = -L / 2 + 0.3 + rLV * 1.85
    const LH = 0.35 + p.hvKv * 0.014 // typical creepage-driven length
    const LL = 0.25 + p.lvKv * 0.012
    const row = (x: number, n: number, Lb: number, r: number, neutral: boolean) => {
      const pitch = (W - 0.4) / (n - 1)
      for (let i = 0; i < n; i++) {
        const z = -W / 2 + 0.2 + i * pitch
        const yt = y1 + 0.05
        k.cyl(fit, r * 2.1, 0.12, [x, yt + 0.06, z], 'y', 24) // turret
        // bushing CT terminal box on the turret
        k.rbox(fit, [0.1, 0.08, 0.06], 0.01, [x + (x > 0 ? 1 : -1) * (r * 2.1 + 0.04), yt + 0.06, z])
        k.rod('tubing', [x + (x > 0 ? 1 : -1) * (r * 2.1 + 0.04), yt + 0.02, z], [x + (x > 0 ? 1 : -1) * (r * 2.1 + 0.04), y1 + 0.02, z], 0.006, 6)
        bushing(k, porcelain, [x, yt + 0.12, z], 'y', Lb, r)
        k.cyl('aluminium', r * 0.35, 0.12, [x, yt + 0.12 + Lb + 0.06, z], 'y', 10)
        k.box('aluminium', [0.08, 0.03, 0.05], [x, yt + 0.12 + Lb + 0.1, z])
        if (neutral && i === n - 1) k.tube(cu, [[x, yt + 0.12 + Lb + 0.1, z], [x, yt + 0.12 + Lb + 0.2, z], [-L / 2 - 0.05, yt + 0.12 + Lb + 0.2, z], [-L / 2 - 0.05, y0 + 0.12, z]], 0.008, 6, 0.05)
      }
    }
    row(xHv, 3, LH, rHV, false)
    row(xLv, 4, LL, rLV, true)
  } else {
    const cableBox = (end: 1 | -1, kv: number, nPh: number, perPh: number, r: number) => {
      const depth = clamp(0.32 + kv * 0.006, 0.35, 0.5)
      const wBox = clamp(0.5 + kv * 0.018 + (nPh - 3) * 0.12, 0.5, W - 0.2)
      const hBox = clamp(0.55 + kv * 0.012, 0.55, H * 0.45)
      const yc = y1 - 0.1 - hBox / 2
      const xw = (end * L) / 2
      const xc = xw + (end * depth) / 2
      k.rbox(tank, [depth, hBox, wBox], 0.025, [xc, yc, 0])
      k.box(fit, [0.02, hBox + 0.04, wBox + 0.04], [xw + end * (depth + 0.005), yc, 0])
      const nb = Math.max(3, Math.round(wBox / 0.15))
      for (let i = 0; i <= nb; i++) for (const sy of [-1, 1]) k.hex('nut', 0.024, 0.014, [xw + end * (depth + 0.018), yc + sy * (hBox / 2 + 0.008), -wBox / 2 + (i * wBox) / nb], 'x')
      k.box('equipmentPaintDark', [depth * 0.8, 0.02, wBox * 0.85], [xc, yc - hBox / 2 - 0.01, 0])
      k.plane(signMaterial('hv'), 0.24, 0.12, [xw + end * (depth + 0.017), yc + hBox * 0.2, 0], faceQ([end, 0, 0]))
      for (let i = 0; i < nPh; i++) {
        const z = -wBox / 2 + ((i + 0.5) * wBox) / nPh
        bushing(k, porcelain, [xw, yc + hBox * 0.12, z], end > 0 ? 'x' : '-x', Math.min(depth - 0.06, 0.18 + kv * 0.008), r)
        for (let c = 0; c < perPh; c++) {
          const zc = z + (c - (perPh - 1) / 2) * 0.07
          const xg = xw + end * (depth * 0.55)
          k.cyl('brass', 0.03, 0.05, [xg, yc - hBox / 2 - 0.035, zc], 'y', 12)
          k.spline('cable', [[xg, yc - hBox / 2 - 0.06, zc], [xg + end * 0.04, (yc - hBox / 2 + yS) / 2, zc], [xg + end * 0.12, yS + 0.08, zc * 1.1], [xg + end * 0.16, hb + 0.03, zc * 1.1]], 0.025, 8, 24)
        }
      }
      return { yc, hBox, wBox }
    }
    const hv = cableBox(1, p.hvKv, 3, 1, rHV)
    hvBottom = hv.yc - hv.hBox / 2
    const lv = cableBox(-1, p.lvKv, 4, clamp(Math.ceil(p.mva / (p.lvKv * 1.2)), 1, 3), rLV)
    // LV neutral earth strap down the end wall
    k.box(cu, [0.006, lv.yc - lv.hBox / 2 - y0 - 0.1, 0.04], [-L / 2 - 0.02, (lv.yc - lv.hBox / 2 + y0 + 0.1) / 2, -lv.wBox / 2 + 0.05])
  }

  // earth bar + bosses, drain / filter valves, sampling cock
  k.box(cu, [0.3, 0.05, 0.008], [-L / 2 + 0.35, y0 + 0.12, -W / 2 - 0.02])
  for (const dx of [-0.1, 0, 0.1]) k.hex('nut', 0.02, 0.012, [-L / 2 + 0.35 + dx, y0 + 0.12, -W / 2 - 0.028], 'z')
  for (const e of [[-L / 2 + 0.35, -W / 2 - 0.02], [-L / 2 + 0.25, W / 2 + 0.02]] as [number, number][]) {
    k.cyl('brass', 0.025, 0.04, [e[0], y0 + 0.06, e[1]], 'z', 10)
    k.spline(cu, [[e[0], y0 + 0.06, e[1]], [e[0], yS + 0.04, e[1] * 1.05], [e[0] + 0.1, hb + 0.01, e[1] * 1.05]], 0.01, 6, 10)
  }
  const valveAt = (pos: V3) => {
    k.rod(fit, [pos[0], pos[1], pos[2] + 0.02], [pos[0], pos[1], pos[2] - 0.1], 0.03, 12)
    k.box('valveBody', [0.09, 0.09, 0.1], [pos[0], pos[1], pos[2] - 0.15])
    k.cyl('handwheel', 0.006, 0.1, [pos[0], pos[1] + 0.09, pos[2] - 0.15], 'y', 6)
    k.handwheel('handwheel', 0.12, [pos[0], pos[1] + 0.14, pos[2] - 0.15], 'y')
    k.cyl('flangeSteel', 0.06, 0.02, [pos[0], pos[1], pos[2] - 0.21], 'z', 18)
  }
  valveAt([L / 2 - 0.25, y0 + 0.14, -W / 2])
  valveAt([-L / 2 + 0.7, y1 - 0.15, -W / 2])
  k.cyl('brass', 0.012, 0.06, [L / 2 - 0.45, y0 + 0.14, -W / 2 - 0.03], 'z', 8)

  // wall stiffeners
  for (const s of [-1, 1]) for (const z of [-W / 2 + 0.12, W / 2 - 0.12]) k.box(fit, [0.06, H * 0.82, 0.08], [s * (L / 2 + 0.03), y0 + H * 0.45, z])
  {
    const n = Math.max(2, Math.round(L / 0.9))
    for (let i = 0; i <= n; i++) {
      const x = -L / 2 + 0.1 + (i * (L - 0.2)) / n
      for (const s of [-1, 1]) {
        if (s > 0 && p.oltc && x > oltcX0 - 0.05) continue
        k.box(fit, [0.07, H * 0.08, 0.06], [x, y0 + 0.1 + H * 0.04, s * (W / 2 + 0.03)])
        k.box(fit, [0.07, H * 0.12, 0.06], [x, y1 - 0.06 - H * 0.06, s * (W / 2 + 0.03)])
      }
    }
  }

  // conservator with Buchholz relay, breathers and OLTC protective relay (free-breathing units only)
  const Dc = clamp(0.22 + 0.008 * p.mva, 0.25, Math.min(0.8, W * 0.45))
  const c0 = outdoor ? xLv + rLV * 1.85 + 0.35 : -L / 2 + 0.3
  const c1 = outdoor ? xHv - rHV * 1.85 - 0.75 : L / 2 - 0.8
  const Lcn = clamp(c1 - c0, 0.6, 3.5)
  const xC = c1 - c0 >= 0.6 ? (c0 + c1) / 2 : c0 + 0.3
  const zC = -W / 2 + Math.max(Dc / 2, 0.2)
  const yC = y1 + 0.45 + Dc / 2
  const xa = Math.min(xC + Lcn / 2 + 0.4, L / 2 - 0.15)
  if (!sealed) {
    const xOl = xC - Lcn / 2 + Lcn * 0.2
    k.cyl(fit, Dc / 2, Lcn, [xC, yC, zC], 'x', 36)
    for (const s of [-1, 1]) k.dome(fit, Dc / 2, [xC + (s * Lcn) / 2, yC, zC], s > 0 ? 'x' : '-x', Math.PI / 2, 0.35, 32)
    annulus(k, fit, Dc / 2, Dc / 2 + 0.012, -0.015, 0.015, [xOl, yC, zC], 'x', 36)
    for (const s of [-1, 1]) annulus(k, fit, Dc / 2, Dc / 2 + 0.015, -0.02, 0.02, [xC + s * (Lcn / 2 - 0.02), yC, zC], 'x', 36)
    for (const x of [xC - Lcn * 0.33, xC + Lcn * 0.33]) {
      for (const dz of [-Dc * 0.3, Dc * 0.3]) k.box('equipmentPaintDark', [0.08, yC - y1 - 0.02, 0.06], [x, (yC + y1) / 2, zC + dz])
      k.torus('equipmentPaintDark', Dc / 2 + 0.01, 0.015, [x, yC, zC], 'x', 6, 32, Math.PI)
      k.box('equipmentPaintDark', [0.1, 0.03, Dc * 0.9], [x, y1 + 0.06, zC])
    }
    gauge(k, [xC - Lcn / 2 - Dc * 0.18, yC, zC], '-x', Math.min(0.16, Dc * 0.4), 'bar', 10) // magnetic oil-level gauge
    // OLTC compartment sight glass on the conservator end segment
    if (p.oltc) {
      k.cyl('brass', 0.05, 0.02, [xC - Lcn / 2 + Lcn * 0.1, yC, zC + Dc / 2 + 0.005], 'z', 18)
      k.disc('glass', 0.038, [xC - Lcn / 2 + Lcn * 0.1, yC, zC + Dc / 2 + 0.016], 'z', 18)
    }
    k.cyl('brass', 0.04, 0.05, [xC + Lcn * 0.25, yC + Dc / 2 + 0.02, zC], 'y', 14)
    // Buchholz pipe: riser from the cover, rising run with the relay between isolating valves
    const xIn = xC + Lcn / 2 - Math.min(0.25, Lcn * 0.2)
    const yR = y1 + 0.24
    k.tube(fit, [[xa, y1 + 0.03, zC], [xa, yR, zC], [xIn, yR + 0.025, zC], [xIn, yC - Dc / 2 + 0.02, zC]], 0.04, 14, 0.08)
    const xr = (xa + xIn) / 2
    const yr = yR + 0.012
    k.rbox('castIron', [0.2, 0.18, 0.16], 0.02, [xr, yr, zC])
    for (const s of [-1, 1]) {
      k.cyl('castIron', 0.075, 0.02, [xr + s * 0.11, yr, zC], 'x', 20)
      k.disc('glass', 0.045, [xr, yr, zC + s * 0.081], s > 0 ? 'z' : '-z', 20)
    }
    k.rbox('castIron', [0.12, 0.08, 0.1], 0.015, [xr, yr + 0.13, zC])
    k.cyl('brass', 0.008, 0.05, [xr - 0.06, yr + 0.12, zC + 0.04], 'y', 6)
    for (const [xv, yv] of [[xa, y1 + 0.13], [xIn, yC - Dc / 2 - 0.12]]) {
      k.box('valveBody', [0.11, 0.08, 0.11], [xv, yv, zC])
      k.handwheel('handwheel', 0.1, [xv, yv, zC + 0.1], 'z')
      k.rod('handwheel', [xv, yv, zC + 0.05], [xv, yv, zC + 0.1], 0.006, 6)
    }
    // OLTC pipe: up from the diverter head, outboard of the tank to the conservator end, across, up into its compartment
    if (p.oltc) {
      const zo = W / 2 + 0.16
      const yTopO = y1 + 0.12
      const xEnd = xOl - Lcn * 0.1
      const yRun = yTopO + 0.18
      k.tube(fit, [[xo, yTopO, zo], [xo, yRun, zo], [xEnd, yRun, zo], [xEnd, yRun, zC + Dc * 0.35], [xEnd, yC - Dc * 0.3, zC + Dc * 0.35]], 0.025, 10, 0.06)
      k.rbox('castIron', [0.14, 0.12, 0.1], 0.015, [(xo + xEnd) / 2, yRun, zo])
    }
    // silica-gel breathers piped down the -X end wall
    const breather = (xTop: number, zb: number, yb: number, sz: number) => {
      const xw = -L / 2 - 0.1
      k.tube('tubing', [[xTop, yC + Dc / 2 - 0.01, zC], [xTop, yC + Dc / 2 + 0.08, zC], [xw, yC + Dc / 2 + 0.08, zC], [xw, yC + Dc / 2 + 0.08, zb], [xw, yb + sz * 0.25, zb]], 0.016, 8, 0.05)
      k.cyl(fit, sz * 0.32, 0.03, [xw, yb + sz * 0.22, zb], 'y', 20)
      k.cyl('glass', sz * 0.27, sz * 0.4, [xw, yb, zb], 'y', 20)
      k.cyl(silica, sz * 0.24, sz * 0.36, [xw, yb, zb], 'y', 16)
      k.cyl(fit, sz * 0.32, 0.03, [xw, yb - sz * 0.22, zb], 'y', 20)
      k.cyl('glass', sz * 0.2, sz * 0.14, [xw, yb - sz * 0.32, zb], 'y', 16)
      k.box('equipmentPaintDark', [0.1, 0.06, 0.08], [xw + 0.06, yb + sz * 0.22, zb])
    }
    const yBr = y0 + Math.min(1.25, H * 0.5)
    breather(xC - Lcn / 2 + Lcn * 0.45, -W / 2 + 0.12, yBr, 0.45)
    if (p.oltc) breather(xOl - 0.15, -W / 2 + 0.32, yBr + 0.1, 0.3)
  }

  // pressure relief device with directed-discharge hood piped to the bund
  {
    const s = clamp(W / 1.8, 0.6, 1)
    const pr: V3 = [sealed ? 0 : xa, y1 + 0.05, W / 2 - 0.3 * s]
    annulus(k, fit, 0, 0.14 * s, pr[1], pr[1] + 0.03, [pr[0], 0, pr[2]], 'y', 28)
    k.cyl('castIron', 0.11 * s, 0.1, [pr[0], pr[1] + 0.08, pr[2]], 'y', 24)
    k.dome('castIron', 0.11 * s, [pr[0], pr[1] + 0.13, pr[2]], 'y', Math.PI / 2, 0.35, 24)
    k.cyl('actuatorYellow', 0.012, 0.08, [pr[0], pr[1] + 0.2, pr[2]], 'y', 8)
    k.cyl(fit, 0.17 * s, 0.22, [pr[0], pr[1] + 0.11, pr[2]], 'y', 28, undefined, true)
    const xOut = L / 2 + 0.12
    k.tube(fit, [[pr[0] + 0.15 * s, pr[1] + 0.08, pr[2]], [xOut, pr[1] + 0.08, pr[2]], [xOut, pr[1] + 0.08, W / 2 + 0.07], [xOut, hb + 0.15, W / 2 + 0.07]], 0.05 * s, 12, 0.1)
  }

  // marshalling kiosk with OTI / WTI on the +X end, capillaries to cover pockets, rating plate
  {
    const xw = L / 2
    const hK = clamp(hvBottom - (y0 + 0.2) - 0.08, 0.25, 0.6)
    const yK = y0 + 0.2 + hK / 2
    const zK = W * 0.25
    const wK = Math.min(0.38, W * 0.4)
    const xK = xw + 0.1
    k.rbox(fit, [0.2, hK, wK], 0.015, [xK, yK, zK])
    k.box('stainless', [0.03, 0.08, 0.02], [xK + 0.11, yK, zK + wK / 2 - 0.04])
    const d = Math.min(0.11, hK * 0.4, wK * 0.4)
    gauge(k, [xK + 0.105, yK + hK * 0.18, zK - wK * 0.22], 'x', d, '°C', 150)
    gauge(k, [xK + 0.105, yK + hK * 0.18, zK + wK * 0.18], 'x', d, '°C', 150)
    for (const dz of [-wK * 0.22, wK * 0.18]) {
      k.tube('tubing', [[xK + 0.05, yK + hK / 2, zK + dz], [xK + 0.05, y1 + 0.02, zK + dz], [xw - 0.12, y1 + 0.06, zK + dz]], 0.004, 6, 0.04)
      k.cyl('brass', 0.02, 0.06, [xw - 0.12, y1 + 0.08, zK + dz], 'y', 10)
    }
    k.cyl('brass', 0.02, 0.05, [xK, yK - hK / 2 - 0.03, zK], 'y', 8)
    k.spline('cable', [[xK, yK - hK / 2 - 0.05, zK], [xK + 0.04, yS + 0.08, zK + 0.05], [xK + 0.08, hb + 0.02, zK + 0.06]], 0.012, 6, 12)
    const plate = ratingPlateMaterial('POWER TRANSFORMER', [
      `Tag  ${p.tag}`,
      `Rating  ${p.mva} MVA   ${onaf ? 'ONAN / ONAF' : 'ONAN'}`,
      `Voltage  ${p.hvKv} / ${p.lvKv} kV`,
      'Vector group  Dyn11   50 Hz',
      p.oltc ? 'Tap changer  OLTC ±10 %, 17 pos' : 'Tap changer  off-circuit ±5 %',
      'Oil  mineral, IEC 60296',
    ])
    const wp = Math.min(0.36, W * 0.36)
    const zP = -W * 0.25
    k.box('stainless', [0.004, wp * 0.67 + 0.01, wp + 0.01], [xw + 0.002, y0 + 0.2 + wp * 0.34, zP])
    k.plane(plate, wp, wp * 0.667, [xw + 0.0045, y0 + 0.2 + wp * 0.34, zP], faceQ([1, 0, 0]))
  }

  // fixed ladder to the cover (Buchholz / breather access) on the -X end, larger units
  if (p.mva >= 10) {
    const zl = W / 2 - 0.3
    ladder(k, [-L / 2 - 0.22, hb, zl], y1 + 0.05, [-1, 0, 0], { cage: false, extend: 1.0 })
    for (const y of [y0 + 0.4, y1 - 0.25]) for (const s of [-1, 1]) k.box('safetyYellow', [0.22, 0.04, 0.04], [-L / 2 - 0.11, y, zl + s * 0.225])
  }
  tagPlate(k, p.tag, [0, y0 + H * 0.88, W / 2 + 0.003], 'z', 0.2)
  tagPlate(k, p.tag, [0, y0 + H * 0.88, -W / 2 - 0.003], '-z', 0.2)

  return { built: k.build(), rotors }
}
