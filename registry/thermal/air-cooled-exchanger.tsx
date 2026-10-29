// Air-cooled heat exchanger (fin-fan), forced or induced draft, plug-type box headers, belt-driven fans, column structure and header walkways. API 661 / ISO 13706.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, mat4, uvScale, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { flange, grating, handrail, ladder, liftingLug, member, motor, motorSize, nozzle, pipe, tagPlate, weldBead, weldCap } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, fanImpeller, type RotorSpec } from '../lib/rotors'
import { ACCESS, flange as flangeDims, nozzleStandout, pipeOD, type Rating } from '../lib/standards'
import { fanGuardMaterial, louvreMaterial, meshGuardMaterial } from '../lib/textures'
import { clamp, jointBolting, openNozzle } from './_thermal'

export interface AirCooledExchangerProps {
  bays?: number
  /** fans per bay, along the tubes */
  fansPerBay?: 1 | 2 | 3
  /** finned tube length, m */
  tubeLength?: number
  /** bundle width per bay, m */
  bayWidth?: number
  /** tube rows */
  rows?: number
  draft?: 'forced' | 'induced'
  /** top-of-steel under the bundles, m */
  height?: number
  passes?: 1 | 2
  louvres?: boolean
  header?: 'plug' | 'cover-plate'
  inletNps?: number
  outletNps?: number
  rating?: Rating
  /** motor power per fan, kW */
  kw?: number
  running?: boolean
  tag?: string
  paint?: MatKey
}

export const defaults = {
  bays: 2,
  fansPerBay: 2 as 1 | 2 | 3,
  tubeLength: 9.1,
  bayWidth: 3.0,
  rows: 6,
  draft: 'forced' as 'forced' | 'induced',
  height: 4.5,
  passes: 2 as 1 | 2,
  louvres: true,
  header: 'plug' as 'plug' | 'cover-plate',
  inletNps: 10,
  outletNps: 8,
  rating: 300 as Rating,
  kw: 30,
  running: true,
  tag: 'E-200',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

const NPS = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24]
const down = (n: number) => NPS[Math.max(0, NPS.findIndex((v) => v >= n) - 1)]
const GASKET = 0.0045
const PITCH = 0.0635 // typical 2.5" transverse tube pitch
const ROW = 0.055 // typical row pitch

function dims(p: P) {
  const bays = Math.max(1, Math.round(p.bays))
  const L = p.tubeLength
  const W = p.bayWidth
  const Wt = bays * W
  const n = p.fansPerBay
  const forced = p.draft === 'forced'
  const hb = p.rows * ROW + 0.06
  const hs = hb + 0.1 // side frame depth
  const hw = 0.32 // header box, along the tubes
  const hh = hb + 0.14
  const yB = p.height
  const yHc = yB + hs / 2
  // API 661: fans cover ≥ 40 % of the bundle face; ≤ 4.3 m typical
  const D = clamp(Math.ceil(Math.sqrt((1.6 * L * W) / (Math.PI * n)) / 0.15) * 0.15, 1.2, Math.min(W - 0.25, L / n - 0.3, 4.3))
  const plen = Math.max(0.9, 0.35 * D)
  const ringH = clamp(0.25 * D, 0.35, 0.6)
  const yF = forced ? yB - plen : yB + hs + plen // fan deck plate
  const yFan = forced ? yF - ringH / 2 : yF + ringH * 0.45
  const yP = forced ? yFan - 0.85 : yB - 0.18 // drive plate top
  const fans = Array.from({ length: n }, (_, j) => -L / 2 + ((j + 0.5) * L) / n)
  const bayZ = Array.from({ length: bays }, (_, i) => -Wt / 2 + (i + 0.5) * W)
  const xh = L / 2 + hw / 2 // header centre (front header at -xh)
  const branch = bays > 1
  const inB = branch ? down(p.inletNps) : p.inletNps
  const outB = branch ? down(p.outletNps) : p.outletNps
  const so = (nps: number) => nozzleStandout(nps, p.rating)
  const yHt = yHc + hh / 2
  const yHb = yHc - hh / 2
  const xOut = p.passes === 2 ? -xh : xh
  const yMi = yHt + so(inB) + GASKET + 0.35 + pipeOD(p.inletNps) / 2 // inlet manifold axis
  const yMo = yHb - so(outB) - GASKET - 0.35 - pipeOD(p.outletNps) / 2
  const zPort = Wt / 2 + 0.7
  return { bays, L, W, Wt, n, forced, hb, hs, hw, hh, yB, yHc, D, plen, ringH, yF, yFan, yP, fans, bayZ, xh, branch, inB, outB, so, yHt, yHb, xOut, yMi, yMo, zPort }
}

type Dims = ReturnType<typeof dims>

export function ports(props: AirCooledExchangerProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  if (!d.branch)
    return [
      port('inlet', 'Inlet header', [-d.xh, d.yHt + d.so(d.inB), d.bayZ[0]], [0, 1, 0], d.inB, p.rating),
      port('outlet', 'Outlet header', [d.xOut, d.yHb - d.so(d.outB), d.bayZ[0]], [0, -1, 0], d.outB, p.rating),
    ]
  return [
    port('inlet', 'Inlet manifold', [-d.xh, d.yMi, d.zPort], [0, 0, 1], p.inletNps, p.rating),
    port('outlet', 'Outlet manifold', [d.xOut, d.yMo, d.zPort], [0, 0, 1], p.outletNps, p.rating),
  ]
}

export function AirCooledExchanger(props: AirCooledExchangerProps & GroupProps) {
  const { bays, fansPerBay, tubeLength, bayWidth, rows, draft, height, passes, louvres, header, inletNps, outletNps, rating, kw, running, tag, paint, ...group } = { ...defaults, ...props }
  const p = { bays, fansPerBay, tubeLength, bayWidth, rows, draft, height, passes, louvres, header, inletNps, outletNps, rating, kw, running, tag, paint } as P
  const deps = Object.entries(p).filter(([key]) => key !== 'running').map(([, v]) => v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { built, rotors } = useMemo(() => build(p), deps)
  useEffect(() => () => [built, ...new Set(rotors.map((r) => r.built))].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default AirCooledExchanger

function build(p: P) {
  const k = new Kit()
  const d = dims(p)
  const rotors: RotorSpec[] = []
  structure(k, d)
  for (const zb of d.bayZ) bundle(k, p, d, zb)
  plenum(k, d)
  const m = motorSize(p.kw, 4)
  const Rl = clamp(d.D * 0.11, 0.18, 0.42) // fan sheave
  const Rs = Rl * 0.32
  const c = Rl + Math.max(m.R + 0.06, Rs) + 0.2
  const yS = d.yP - 0.13
  const fanRpm = clamp(Math.round(3600 / d.D / 10) * 10, 200, 450) // typical tip speed ≈ 55 m/s
  const fanB = fanBuilt(d, Rl, yS)
  const sheaveK = new Kit()
  sheaveK.cyl('castIron', Rs, 0.09, [0, 0, 0], 'y', 20)
  for (const dy of [-0.02, 0.02]) sheaveK.torus('rubberBlack', Rs + 0.004, 0.008, [0, dy, 0], 'y', 6, 20)
  const sheaveB = sheaveK.build()
  for (const zb of d.bayZ)
    for (const fx of d.fans) {
      drive(k, d, fx, zb, Rl, Rs, c, m)
      rotors.push({ built: fanB, axis: 'y', pos: [fx, d.yFan, zb], rpm: fanRpm })
      rotors.push({ built: sheaveB, axis: 'y', pos: [fx + c, yS, zb], rpm: (fanRpm * Rl) / Rs })
    }
  piping(k, p, d)
  access(k, d)
  return { built: k.build(), rotors }
}

// Fan impeller with its shaft and driven sheave, about +Y at the fan plane.
function fanBuilt(d: Dims, Rl: number, yS: number) {
  const k = new Kit()
  const R = d.D / 2
  fanImpeller(k, 'aluminium', R, { axis: 'y', blades: d.D > 3 ? 6 : 4, chord: R * 0.26, pitch: 0.24, hub: R * 0.13, hubLen: 0.18, thick: 0.012, hubMat: 'castIron' })
  const drop = d.yFan - yS
  k.cyl('flangeSteel', 0.035, drop, [0, -drop / 2, 0], 'y', 12)
  k.cyl('castIron', Rl, 0.1, [0, -drop, 0], 'y', 32)
  for (const dy of [-0.025, 0.025]) k.torus('rubberBlack', Rl + 0.004, 0.009, [0, -drop + dy, 0], 'y', 6, 32)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    k.box('castIron', [Rl * 0.8, 0.03, 0.03], [Math.cos(a) * Rl * 0.5, -drop - 0.03, Math.sin(a) * Rl * 0.5], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
  }
  return k.build()
}

function structure(k: Kit, d: Dims) {
  const xc = d.L / 2 - 0.2
  const zs = Array.from({ length: d.bays + 1 }, (_, j) => -d.Wt / 2 + j * d.W)
  const yT = d.yB - 0.1
  for (const z of zs) {
    member(k, [-xc - 0.1, yT, z], [xc + 0.1, yT, z], 'HEB 200', 'galvanised', [0, 1, 0])
    for (const x of [-xc, xc]) {
      member(k, [x, 0.025, z], [x, d.yB - 0.2, z], 'HEB 200', 'galvanised', [1, 0, 0])
      k.box('galvanised', [0.4, 0.025, 0.4], [x, 0.0125, z])
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          k.rod('nut', [x + sx * 0.15, 0, z + sz * 0.15], [x + sx * 0.15, 0.08, z + sz * 0.15], 0.012, 8)
          k.hex('nut', 0.04, 0.02, [x + sx * 0.15, 0.035, z + sz * 0.15])
        }
      // knee braces
      for (const s of [-1, 1]) if ((s < 0 && z > zs[0]) || (s > 0 && z < zs[zs.length - 1])) member(k, [x, yT - 0.9, z], [x, yT - 0.1, z + s * 0.8], 'L70x70x7', 'galvanised')
      member(k, [x, yT - 0.9, z], [x - Math.sign(x) * 0.8, yT - 0.1, z], 'L70x70x7', 'galvanised')
    }
  }
  for (const x of [-xc, xc]) member(k, [x, yT, zs[0]], [x, yT, zs[zs.length - 1]], 'HEB 200', 'galvanised', [0, 1, 0])
  // X-bracing on the outer faces, horizontal girts at drive level
  const yG = d.forced ? d.yP - 0.09 : 1.6
  for (const z of [zs[0], zs[zs.length - 1]]) {
    member(k, [-xc, 0.35, z], [xc, yG - 0.1, z], 'L80x80x8', 'galvanised')
    member(k, [xc, 0.35, z], [-xc, yG - 0.1, z], 'L80x80x8', 'galvanised')
  }
  for (const z of zs) member(k, [-xc, yG, z], [xc, yG, z], 'UPN 160', 'galvanised', [0, 1, 0])
}

function bundle(k: Kit, p: P, d: Dims, zb: number) {
  const { L, W, hs, hw, hh, yB, yHc } = d
  const P = p.paint
  const zl = W / 2 - 0.05
  // side frames (channel) and finned-tube bundle
  for (const s of [-1, 1]) {
    k.box('galvanised', [L, hs, 0.008], [0, yB + hs / 2, zb + s * zl])
    for (const y of [yB + 0.005, yB + hs - 0.005]) k.box('galvanised', [L, 0.01, 0.08], [0, y, zb + s * (zl - 0.036)])
  }
  k.box('equipmentPaintDark', [L, hs - 0.07, 2 * zl - 0.02], [0, yB + hs / 2, zb])
  const nt = Math.floor((W - 0.2) / PITCH)
  for (const y of [yB + hs - 0.032, yB + 0.032])
    for (let i = 0; i < nt; i++) {
      const z = zb - ((nt - 1) / 2) * PITCH + i * PITCH
      k.cyl('aluminium', 0.0285, L, [0, y, z], 'x', 8)
    }
  for (let x = -L / 2 + 1.5; x < L / 2 - 0.5; x += 1.5)
    for (const y of [yB + hs - 0.003, yB + 0.003]) k.box('galvanised', [0.06, 0.006, 2 * zl], [x, y, zb])
  // box headers: plug or cover-plate type
  for (const s of [-1, 1]) {
    const x = s * d.xh
    k.rbox(P, [hw, hh, W - 0.06], 0.01, [x, yHc, zb])
    k.box(P, [0.035, hh + 0.04, W - 0.03], [s * (L / 2 + hw - 0.0175), yHc, zb])
    k.box(P, [0.03, hh + 0.04, W - 0.03], [s * (L / 2 + 0.015), yHc, zb])
    if (p.header === 'cover-plate') {
      // bolted removable cover plate on a perimeter flange (low-pressure, fouling service)
      const xo = s * (L / 2 + hw)
      const ch = hh + 0.16
      const cw = W - 0.03
      k.box(P, [0.04, ch, cw], [xo + s * 0.02, yHc, zb])
      k.box('gasket', [0.006, ch - 0.02, cw - 0.02], [xo + s * 0.003, yHc, zb])
      const bolt = (y: number, z: number) => {
        k.cyl('boltXylan', 0.008, 0.07, [xo + s * 0.035, y, z], 'x', 6)
        k.hex('nut', 0.03, 0.016, [xo + s * 0.048, y, z], 'x')
      }
      for (let z = zb - cw / 2 + 0.05; z <= zb + cw / 2 - 0.04; z += 0.11) for (const sy of [-1, 1]) bolt(yHc + sy * (ch / 2 - 0.035), z)
      for (let y = yHc - ch / 2 + 0.12; y < yHc + ch / 2 - 0.08; y += 0.11) for (const sz of [-1, 1]) bolt(y, zb + sz * (cw / 2 - 0.035))
      for (const sz of [-1, 1]) liftingLug(k, [xo + s * 0.02, yHc + ch / 2, zb + sz * cw * 0.3], 'z', 0.6, P)
    } else {
      // plug-type: a threaded shoulder plug opposite every tube
      const xf = s * (L / 2 + hw + 0.008)
      for (let r = 0; r < p.rows; r++) {
        const y = yHc - ((p.rows - 1) / 2) * ROW + r * ROW
        for (let i = 0; i < nt - (r % 2); i++) {
          const z = zb - ((nt - 1) / 2) * PITCH + i * PITCH + (r % 2) * PITCH * 0.5
          k.hex('flangeSteel', 0.034, 0.016, [xf, y, z], 'x')
        }
      }
    }
    for (const sz of [-1, 1]) liftingLug(k, [x, yHc + hh / 2, zb + sz * (W / 2 - 0.3)], 'x', 0.8, P)
  }
  // louvres on top (forced draft)
  if (p.louvres && d.forced) {
    const yl = yB + hs + 0.12
    const segs = Math.max(1, Math.round(L / 4.6))
    const sl = L / segs
    for (let i = 0; i < segs; i++) {
      const xm = -L / 2 + (i + 0.5) * sl
      const g = new THREE.PlaneGeometry(sl - 0.1, 2 * zl - 0.1)
      g.rotateX(-Math.PI / 2)
      uvScale(g, 1, (2 * zl) / 0.15)
      k.add(louvreMaterial('#b4b9bc'), g, mat4([xm, yl, zb]))
      for (const s of [-1, 1]) {
        k.box('galvanised', [sl - 0.04, 0.15, 0.05], [xm, yl, zb + s * (zl - 0.025)])
        k.box('galvanised', [0.05, 0.15, 2 * zl], [xm + s * (sl / 2 - 0.045), yl, zb])
      }
      k.box('galvanised', [0.06, 0.12, 2 * zl], [xm - sl / 2 + 0.045, yl - 0.13, zb])
    }
    // louvre actuator on the +Z frame
    const za = zb + zl + 0.06
    k.rbox('actuatorBlue', [0.35, 0.12, 0.1], 0.02, [-L / 2 + 0.6, yl, za])
    k.rod('stainless', [-L / 2 + 0.78, yl, za], [-L / 2 + 1.2, yl, za], 0.012, 8)
  }
  // nameplate on the outer side frame
  if (zb === d.bayZ[d.bayZ.length - 1]) tagPlate(k, p.tag, [-L / 4, yB + hs / 2, zb + zl + 0.006], 'z', 0.35)
}

function plenum(k: Kit, d: Dims) {
  const { L, W, yB, yF, hs } = d
  const yTop = d.forced ? yB - 0.2 : yF
  const yBot = d.forced ? yF : yB + hs
  const h = yTop - yBot
  const Rr = d.D / 2 + 0.025
  for (const zb of d.bayZ) {
    const zl = W / 2 - 0.05
    const yc = (yTop + yBot) / 2
    for (const s of [-1, 1]) {
      k.box('galvanised', [L - 0.1, h, 0.005], [0, yc, zb + s * zl])
      k.box('galvanised', [0.005, h, 2 * zl], [s * (L / 2 - 0.05), yc, zb])
    }
    for (let x = -L / 2 + 1; x < L / 2 - 0.3; x += 1) for (const s of [-1, 1]) k.box('galvanised', [0.05, h, 0.03], [x, yc, zb + s * (zl + 0.015)])
    // fan deck plate with fan openings
    const sh = new THREE.Shape()
    sh.moveTo(-L / 2 + 0.05, -zl).lineTo(L / 2 - 0.05, -zl).lineTo(L / 2 - 0.05, zl).lineTo(-L / 2 + 0.05, zl).closePath()
    for (const fx of d.fans) {
      const hole = new THREE.Path()
      hole.absarc(fx, 0, Rr, 0, Math.PI * 2, true)
      sh.holes.push(hole)
    }
    k.extrude('galvanised', sh, 0.006, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, yF + 0.003, zb), 48)
    for (const fx of d.fans) fanRing(k, d, fx, zb, Rr)
  }
}

function fanRing(k: Kit, d: Dims, fx: number, zb: number, Rr: number) {
  const t = 0.005
  const y0 = d.forced ? d.yF - d.ringH : d.yF
  const y1 = y0 + d.ringH
  k.lathe('galvanised', [[Rr + t, y0], [Rr + t, y1], [Rr, y1], [Rr, y0], [Rr + t, y0]], [fx, 0, zb], 'y', 64)
  // inlet bell and stiffening flange
  k.torus('galvanised', Rr + 0.06, 0.06, [fx, y0, zb], 'y', 10, 64, Math.PI * 2)
  k.torus('galvanised', Rr + t + 0.01, 0.012, [fx, (y0 + y1) / 2, zb], 'y', 6, 64)
  // guard on the open side
  const yG = d.forced ? y0 - 0.07 : y1 + 0.06
  k.disc(fanGuardMaterial(), Rr + 0.04, [fx, yG, zb], 'y', 48)
  k.torus('galvanised', Rr + 0.04, 0.01, [fx, yG, zb], 'y', 6, 48)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const r = Rr + 0.04
    k.rod('galvanised', [fx + Math.cos(a) * r, yG, zb + Math.sin(a) * r], [fx + Math.cos(a) * (Rr + 0.03), d.forced ? y0 + 0.02 : y1 - 0.02, zb + Math.sin(a) * (Rr + 0.03)], 0.01, 6)
  }
}

// Bearing housing, belt drive and vertical TEFC motor under (forced) or below the bundle (induced).
function drive(k: Kit, d: Dims, fx: number, zb: number, Rl: number, Rs: number, c: number, m: ReturnType<typeof motorSize>) {
  const yP = d.yP
  const yS = yP - 0.13
  const zl = d.W / 2
  const xa = fx - Rl - 0.1
  const xb = fx + c + m.H + 0.08
  // cross beams spanning the bay and the drive plate on them
  const yCB = d.forced ? yP - 0.01 - 0.08 : yP + 0.08
  for (const x of [xa, xb]) member(k, [x, yCB, zb - zl], [x, yCB, zb + zl], 'UPN 160', 'galvanised', [0, 1, 0])
  k.box('galvanised', [xb - xa + 0.12, 0.02, Math.max(2 * Rl, 2 * m.R) + 0.25], [(xa + xb) / 2, yP - 0.01, zb])
  // fan shaft bearing housing
  const yTopH = d.forced ? d.yFan - 0.14 : yP + 0.6
  k.cyl('castIron', 0.075, yTopH - yP, [fx, (yTopH + yP) / 2, zb], 'y', 20)
  for (const y of [yP + 0.06, yTopH - 0.06]) k.cyl('castIron', 0.11, 0.08, [fx, y, zb], 'y', 20)
  k.cyl('brass', 0.008, 0.05, [fx + 0.12, yTopH - 0.06, zb], 'x', 8)
  // vibration switch on the drive frame (trips the fan on imbalance)
  k.rbox('actuatorBlue', [0.1, 0.09, 0.07], 0.01, [xa + 0.02, yCB + (d.forced ? 0.13 : -0.13), zb + 0.25])
  // belt and guard
  const belt = beltShape(Rl + 0.012, Rs + 0.012, c, 0.012)
  k.extrude('rubberBlack', belt, 0.05, new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(fx, yS - 0.025, zb), 24)
  const gw = 2 * Rl + 0.12
  const gl = c + Rl + Rs + 0.16
  const gx = fx - Rl - 0.06 + gl / 2
  const gg = new THREE.BoxGeometry(gl, 0.17, gw)
  uvScale(gg, gl / 0.25, 1)
  k.add(meshGuardMaterial(), gg, mat4([gx, yS, zb]))
  for (const s of [-1, 1]) {
    k.box('safetyYellow', [gl, 0.02, 0.02], [gx, yS + s * 0.085, zb - gw / 2])
    k.box('safetyYellow', [gl, 0.02, 0.02], [gx, yS + s * 0.085, zb + gw / 2])
  }
  // motor hung from the plate on a side bracket, shaft up
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
  k.with(mat4([fx + c, yS - 0.1, zb], q), () => motor(k, { R: m.R, L: m.L, H: m.H, tbox: 'side', mat: 'motorPaint' }))
  k.box('galvanised', [0.02, m.L * 0.9 + 0.12, m.R * 2.2], [fx + c + m.H + 0.01, yS - 0.1 - m.L * 0.45 + 0.06, zb])
  member(k, [fx + c + m.H + 0.06, yP - 0.02, zb], [fx + c + m.H + 0.06, yS - 0.1 - m.L * 0.8, zb], 'L60x60x6', 'galvanised')
}

function beltShape(R1: number, R2: number, c: number, t: number) {
  const hull = (a: number, b: number, rev: boolean) => {
    const phi = Math.acos(clamp((a - b) / c, -1, 1))
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 20; i++) {
      const u = phi + (i / 20) * (2 * Math.PI - 2 * phi)
      pts.push(new THREE.Vector2(Math.cos(u) * a, Math.sin(u) * a))
    }
    for (let i = 0; i <= 10; i++) {
      const u = -phi + (i / 10) * 2 * phi
      pts.push(new THREE.Vector2(c + Math.cos(u) * b, Math.sin(u) * b))
    }
    return rev ? pts.reverse() : pts
  }
  const sh = new THREE.Shape(hull(R1, R2, false))
  sh.holes.push(new THREE.Path(hull(R1 - t, R2 - t, true)))
  return sh
}

// Header nozzles and, for several bays, inlet/outlet manifolds with flanged ends on +Z.
function piping(k: Kit, p: P, d: Dims) {
  const P = p.paint
  for (const [i, zb] of d.bayZ.entries()) {
    const inFace = openNozzle(k, { base: [-d.xh, d.yHt, zb], dir: [0, 1, 0], nps: d.inB, rating: p.rating, standout: d.so(d.inB), mat: P, studs: !d.branch })
    const outFace = openNozzle(k, { base: [d.xOut, d.yHb, zb], dir: [0, -1, 0], nps: d.outB, rating: p.rating, standout: d.so(d.outB), mat: P, studs: !d.branch })
    // 1-pass: blinded vent on the outlet header top, drain on the inlet header bottom
    if (p.passes === 1) {
      nozzle(k, { base: [d.xh, d.yHt, zb + 0.4], dir: [0, 1, 0], nps: 1.5, rating: p.rating, standout: 0.18, mat: P, blind: true })
      nozzle(k, { base: [-d.xh, d.yHb, zb + 0.4], dir: [0, -1, 0], nps: 1.5, rating: p.rating, standout: 0.18, mat: P, blind: true })
    } else {
      nozzle(k, { base: [-d.xh, d.yHt, zb + 0.45], dir: [0, 1, 0], nps: 1.5, rating: p.rating, standout: 0.18, mat: P, blind: true })
      nozzle(k, { base: [d.xh, d.yHb, zb + 0.45], dir: [0, -1, 0], nps: 1.5, rating: p.rating, standout: 0.18, mat: P, blind: true })
    }
    if (!d.branch) continue
    for (const [face, nps, main, yM, dir] of [
      [inFace, d.inB, p.inletNps, d.yMi, 1],
      [outFace, d.outB, p.outletNps, d.yMo, -1],
    ] as const) {
      const f2: V3 = [face[0], face[1] + dir * GASKET, face[2]]
      const Lf = flange(k, nps, p.rating, f2, [0, -dir, 0])
      jointBolting(k, nps, p.rating, [face[0], face[1] + (dir * GASKET) / 2, face[2]], [0, 1, 0])
      pipe(k, [f2[0], f2[1] + dir * Lf, f2[2]], [f2[0], yM - (dir * pipeOD(main)) / 2 + dir * 0.01, f2[2]], nps, 'pipePaint')
      weldBead(k, nps, [f2[0], f2[1] + dir * Lf, f2[2]], [0, 1, 0])
      if (i === 0) {
        const x = face[0]
        const z0 = d.bayZ[0] - 0.45
        pipe(k, [x, yM, z0], [x, yM, d.zPort - flangeLen(main, p.rating)], main)
        weldCap(k, main, [x, yM, z0], [0, 0, -1], 'pipePaint')
        k.disc('pipeBore', pipeOD(main) / 2 - 0.01, [x, yM, z0 + 0.002], 'z', 32) // cap seen from inside the bore
        flange(k, main, p.rating, [x, yM, d.zPort], [0, 0, 1], true)
        // manifold supports from the header
        for (const zb2 of d.bayZ) {
          const zs = zb2 - 0.6
          const ys = dir > 0 ? d.yHt : d.yHb
          k.box('galvanised', [0.08, Math.abs(yM - ys) - pipeOD(main) / 2, 0.08], [x, (yM - (dir * pipeOD(main)) / 2 + ys) / 2, zs])
        }
      }
    }
  }
}

const flangeLen = (nps: number, rating: Rating) => {
  const f = flangeDims(nps, rating)
  return f.hubLength + f.raisedFaceHeight
}

// Header walkways at both ends with handrails, cantilevered from the columns, and a caged ladder to each.
function access(k: Kit, d: Dims) {
  const yw = d.yHc - 1.15
  const w = 0.9
  const zs = Array.from({ length: d.bays + 1 }, (_, j) => -d.Wt / 2 + j * d.W)
  const zA = -d.Wt / 2 - 0.1
  const zB = d.Wt / 2 + 1.1
  for (const s of [-1, 1]) {
    const xi = s * (d.L / 2 + d.hw + 0.12)
    const xo = xi + s * w
    const xm = (xi + xo) / 2
    grating(k, [xm, yw, (zA + zB) / 2], w, zB - zA)
    for (const x of [xi, xo]) member(k, [x, yw - 0.1, zA], [x, yw - 0.1, zB], 'UPN 140', 'galvanised', [0, 1, 0])
    const xc = s * (d.L / 2 - 0.2)
    for (const z of zs) {
      member(k, [xc, yw - 0.1, z], [xo, yw - 0.1, z], 'UPN 140', 'galvanised', [0, 1, 0])
      member(k, [xc, yw - 0.9, z], [xi + s * 0.3, yw - 0.18, z], 'L70x70x7', 'galvanised')
    }
    member(k, [xc, yw - 0.1, zB - 0.05], [xo, yw - 0.1, zB - 0.05], 'UPN 140', 'galvanised', [0, 1, 0])
    for (const z of [zB - 0.2]) member(k, [xi, 0.0, z], [xi, yw - 0.18, z], 'L80x80x8', 'galvanised')
    handrail(k, [[xi, yw, zA], [xo, yw, zA], [xo, yw, zB], [xm + (s * ACCESS.ladder.width) / 2 + s * 0.12, yw, zB]])
    k.box('safetyYellow', [0.006, ACCESS.handrail.toePlate, zB - zA], [xi, yw + 0.05, (zA + zB) / 2])
    ladder(k, [xm - s * 0.05, 0, zB + 0.2], yw, [0, 0, 1])
  }
}
