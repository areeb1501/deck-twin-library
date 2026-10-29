// Emergency / standby diesel generator set (ISO 8528, IEC 60034): turbocharged diesel engine, alternator, radiator, sub-base day tank, exhaust silencer, open skid or ISO container.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, eul, mat4, uvScale, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { gauge, ladder, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, fanRotor, type RotorSpec } from '../lib/rotors'
import { fanGuardMaterial, lcdMaterial, louvreMaterial, signMaterial } from '../lib/textures'
import { pipeOD, pipeWall } from '../lib/standards'
import { SKID, annulus, clamp, door, faceQ, lineRun, louvre, neckTo, runToFlange } from './_compressors-kit'

export interface DieselGeneratorProps {
  /** electrical rating, kWe */
  kw?: number
  enclosure?: 'open' | 'container'
  /** container: swing the side doors open */
  doorsOpen?: boolean
  fuelNps?: number
  tag?: string
  running?: boolean
}

export const defaults = {
  kw: 1000,
  enclosure: 'open' as 'open' | 'container',
  doorsOpen: false,
  fuelNps: 1,
  tag: 'G-9310',
  running: true,
}

type P = typeof defaults

const FLOOR = 0.15 // container floor above deck

function layout(p: P) {
  const kw = clamp(p.kw, 100, 3000)
  const box = p.enclosure === 'container'
  const Lset = 3.2 + 0.0017 * kw // typical open-set length: 4.0 m at 500 kWe, 6.6 m at 2 MWe
  const Wset = 1.5 + 0.0004 * kw
  const hb = box ? 0.3 : clamp(0.3 + kw * 0.0002, 0.35, 0.7) // sub-base day tank (shallow inside a container)
  const hs = hb + 0.2
  const yk = hs + 0.55 + Math.min(kw * 0.0001, box ? 0.12 : 0.3)
  const roof = box ? 2.896 - FLOOR - 0.12 : 99
  const ncyl = kw <= 600 ? 6 : kw <= 1300 ? 12 : kw <= 2200 ? 16 : 20
  const vee = ncyl > 6
  const Ra = clamp(0.35 + kw * 0.00018, 0.4, 0.85)
  const La = clamp(1.0 + kw * 0.0005, 1.1, 2.2)
  const Le = Lset - 0.15 - La - 0.25 - 0.75
  const bw = clamp(0.7 + kw * 0.0002, 0.75, 1.2)
  const Hr = Math.min(clamp(1.4 + kw * 0.0004, 1.5, 2.4), roof - hs - 0.45)
  const exNps = [6, 8, 10, 12, 14, 16, 18, 20].find((n) => n >= 4 + kw * 0.008) ?? 20
  const Ds = Math.max(clamp(0.35 + kw * 0.0002, 0.4, 0.9), pipeOD(exNps) * 1.8)
  const engTop = yk + 0.25 + (vee ? 0.75 : 0.85)
  // container: ISO 668 20 ft or 40 ft high cube
  const CL = kw <= 1100 ? 6.058 : 12.192
  const CW = 2.438
  const CH = 2.896
  const y0 = box ? FLOOR : 0
  const xoff = box ? CL / 2 - 0.2 - Lset / 2 : 0
  const ySil = box ? CH + 0.35 + Ds / 2 : Math.max(engTop + 0.45, yk + Ra + 0.6) + Ds / 2
  const Lsil = Ds * 2.6
  const xSil = box ? xoff : -Lset / 2 + La * 0.6
  const yEx = ySil + Ds / 2 + 0.6
  const xEx = xSil + Lsil / 2 - Ds * 0.35
  const zFuel = -(box ? CW / 2 : Wset / 2) - 0.25
  const xFuel = xoff - Lset * 0.25
  const yFuel = y0 + hb * 0.5
  return { roof, kw, box, Lset, Wset, hb, hs, yk, ncyl, vee, Ra, La, Le, bw, Hr, exNps, Ds, engTop, CL, CW, CH, y0, xoff, ySil, Lsil, xSil, yEx, xEx, zFuel, xFuel, yFuel }
}

export function ports(props: DieselGeneratorProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  return [
    port('exhaust', 'Exhaust outlet', [L.xEx, L.yEx, 0], [0, 1, 0], L.exNps, 150, 'vent'),
    port('fuel', 'Diesel supply', [L.xFuel, L.yFuel, L.zFuel], [0, 0, -1], p.fuelNps, 150, 'utility'),
  ]
}

export function DieselGenerator(props: DieselGeneratorProps & GroupProps) {
  const { kw, enclosure, doorsOpen, fuelNps, tag, running, ...group } = { ...defaults, ...props }
  const { built, rotors } = useMemo(() => build({ kw, enclosure, doorsOpen, fuelNps, tag, running }), [kw, enclosure, doorsOpen, fuelNps, tag, running])
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default DieselGenerator

const ENGINE: MatKey = 'equipmentPaint'
const ALT: MatKey = 'motorPaint'

function build(p: P) {
  const k = new Kit()
  const L = layout(p)
  const rotors: RotorSpec[] = []
  k.at([L.xoff, L.y0, 0], undefined, () => genset(k, p, L, rotors))
  for (const r of rotors) r.pos = [r.pos[0] + L.xoff, r.pos[1] + L.y0, r.pos[2]]
  if (L.box) container(k, p, L)
  exhaust(k, L)
  return { built: k.build(), rotors }
}

/** The set in its own frame: sub-base tank, rails, alternator at -X, engine, radiator at +X. */
function genset(k: Kit, p: P, L: ReturnType<typeof layout>, rotors: RotorSpec[]) {
  const { Lset, Wset, hb, hs, yk, Ra, La, Le, bw, Hr, vee, ncyl } = L
  const x0 = -Lset / 2 + 0.15
  const xa1 = x0 + La
  const xe0 = xa1 + 0.25
  const xe1 = xe0 + Le
  // double-wall sub-base day tank: fill cap, vent, level gauge, leak detector, rails on top with isolators
  k.rbox(SKID, [Lset, hb, Wset], 0.02, [0, hb / 2, 0])
  for (const s of [-1, 1]) k.box(SKID, [Lset, 0.2, 0.1], [0, hb + 0.1, s * (Wset / 2 - 0.12)])
  for (let i = 0; i <= 4; i++) k.box(SKID, [0.08, 0.2, Wset - 0.24], [-Lset / 2 + 0.04 + (i * (Lset - 0.08)) / 4, hb + 0.1, 0])
  k.cyl('flangeSteel', 0.07, 0.08, [Lset * 0.3, hb + 0.04, Wset / 2 - 0.3], 'y', 16)
  k.cyl('handwheel', 0.08, 0.03, [Lset * 0.3, hb + 0.09, Wset / 2 - 0.3], 'y', 16)
  lineRun(k, [[Lset * 0.36, hb, Wset / 2 - 0.3], [Lset * 0.36, hs + 1.6, Wset / 2 - 0.3]], 1, SKID)
  k.dome(SKID, 0.05, [Lset * 0.36, hs + 1.62, Wset / 2 - 0.3], '-y', Math.PI / 2, 1, 12)
  k.box('stainless', [0.08, hb * 0.7, 0.02], [Lset * 0.15, hb / 2, Wset / 2 + 0.01])
  k.box('glass', [0.04, hb * 0.6, 0.006], [Lset * 0.15, hb / 2, Wset / 2 + 0.022])
  tagPlate(k, 'DAY TANK  DIESEL', [-Lset * 0.2, hb / 2, Wset / 2 + 0.002], 'z', 0.36)
  for (const s of [-1, 1]) for (const sx of [-1, 1]) k.torus('nut', 0.05, 0.015, [sx * (Lset / 2 - 0.3), hb * 0.5, s * (Wset / 2 + 0.01)], 'z', 6, 14)
  // fuel supply connection on -Z: neck through the tank wall to the flange
  neckTo(k, [L.xFuel - L.xoff, L.yFuel - L.y0, -Wset / 2], [L.xFuel - L.xoff, L.yFuel - L.y0, L.zFuel], [0, 0, -1], p.fuelNps, 150, SKID)
  // anti-vibration isolators
  const iso = (x: number, z: number) => {
    k.box('flangeSteel', [0.2, 0.02, 0.16], [x, hs + 0.01, z])
    k.cyl('rubberBlack', 0.06, 0.08, [x, hs + 0.06, z], 'y', 14)
    k.box('flangeSteel', [0.16, 0.02, 0.12], [x, hs + 0.11, z])
  }

  // alternator: ribbed frame, feet, DE screen, NDE exciter cover, terminal box with cables, nameplate
  const xam = (x0 + xa1) / 2
  k.cyl(ALT, Ra, La, [xam, yk, 0], 'x', 40)
  for (let i = 0; i <= 6; i++) k.cyl(ALT, Ra * 1.03, 0.03, [x0 + 0.05 + (i * (La - 0.1)) / 6, yk, 0], 'x', 40)
  k.cyl(ALT, Ra * 0.85, 0.12, [x0 - 0.06, yk, 0], 'x', 32)
  k.dome(ALT, Ra * 0.6, [x0 - 0.12, yk, 0], '-x', Math.PI / 2, 0.3, 24)
  const scr = new THREE.CylinderGeometry(Ra * 1.01, Ra * 1.01, La * 0.22, 32, 1, true)
  uvScale(scr, 10, 1.5)
  k.add(louvreMaterial('#2c3238'), scr, mat4([xa1 - La * 0.14, yk, 0], 'x'))
  for (const s of [-1, 1]) {
    k.box(ALT, [La * 0.7, yk - hs - 0.12 - Ra * 0.6, 0.12], [xam, (yk - Ra * 0.6 + hs + 0.12) / 2, s * Ra * 0.75])
    for (const xx of [xam - La * 0.3, xam + La * 0.3]) iso(xx, s * Ra * 0.75)
  }
  const tb: V3 = [xam - La * 0.1, yk + Ra + 0.22, 0]
  k.rbox(ALT, [La * 0.45, 0.42, Ra * 1.2], 0.03, tb)
  k.box(ALT, [La * 0.3, 0.06, Ra * 0.9], [tb[0], yk + Ra + 0.02, 0])
  k.plane(signMaterial('hv'), 0.3, 0.15, [tb[0], tb[1], Ra * 0.6 + 0.001])
  for (let i = 0; i < 3; i++) {
    const cz = -Ra * 0.35 + i * Ra * 0.35
    k.hex('brass', 0.07, 0.05, [tb[0] - La * 0.18, tb[1], cz], 'x')
    k.spline('cable', [[tb[0] - La * 0.21, tb[1], cz], [x0 - 0.05, tb[1] - 0.1, cz], [x0 - 0.15, hs + 0.1, cz * 1.3], [x0 - 0.1, hb + 0.02, cz * 1.5]], 0.025, 8, 18)
  }
  k.box('nameplate', [0.3, 0.18, 0.006], [xam + La * 0.25, yk + Ra * 0.3, Ra * 0.96])
  // genset controller on a stand at the alternator end (+Z side)
  const cx = x0 + 0.25
  const cz = Wset / 2 - 0.2
  k.rod(SKID, [cx, hs, cz], [cx, hs + 1.0, cz], 0.03, 10)
  k.rbox('stainless', [0.5, 0.6, 0.25], 0.02, [cx, hs + 1.25, cz])
  k.plane(lcdMaterial(), 0.26, 0.18, [cx, hs + 1.33, cz + 0.126])
  k.cyl('actuatorRed', 0.025, 0.03, [cx + 0.17, hs + 1.08, cz + 0.135], 'z', 16)
  k.plane(signMaterial('ler', p.tag), 0.4, 0.08, [cx, hs + 1.5, cz + 0.126])

  // flywheel housing (SAE bell) with starters
  k.lathe(ENGINE, [[Ra * 0.95, 0], [Ra * 0.9, 0.08], [bw * 0.7, 0.25], [0, 0.25]], [xa1, yk, 0], 'x', 40)
  for (const s of [-1, 1]) k.cyl('motorPaint', 0.09, 0.4, [xe0 - 0.05, yk - Ra * 0.5, s * bw * 0.45], 'x', 16)

  // engine: crankcase, oil pan, banks with rocker covers, aftercooler in the vee, exhaust manifolds, turbochargers
  const xem = (xe0 + xe1) / 2
  const ccTop = yk + 0.25
  k.rbox(ENGINE, [Le, 0.6, bw], 0.04, [xem, yk - 0.05, 0])
  const panB = Math.max(hs + 0.06, yk - 0.75)
  k.rbox(ENGINE, [Le * 0.9, yk - 0.35 - panB, bw * 0.85], 0.03, [xem, (yk - 0.35 + panB) / 2, 0])
  for (const s of [-1, 1]) {
    k.box(ENGINE, [Le * 0.18, 0.08, 0.25], [xe0 + Le * 0.2, yk - 0.3, s * (bw / 2 + 0.1)])
    k.box(ENGINE, [Le * 0.18, 0.08, 0.25], [xe1 - Le * 0.15, yk - 0.3, s * (bw / 2 + 0.1)])
    for (const xx of [xe0 + Le * 0.2, xe1 - Le * 0.15]) {
      k.box(SKID, [0.14, yk - 0.34 - hs - 0.12, 0.14], [xx, (yk - 0.34 + hs + 0.12) / 2, s * (bw / 2 + 0.1)])
      iso(xx, s * (bw / 2 + 0.1))
    }
  }
  const perBank = vee ? ncyl / 2 : ncyl
  const banks = vee ? [-1, 1] : [0]
  const bH = vee ? 0.55 : 0.6
  const bW = vee ? bw * 0.42 : bw * 0.7
  const pitchC = (Le * 0.88) / perBank
  for (const s of banks) {
    const ang = vee ? s * 0.55 : 0
    const base: V3 = [xem, ccTop, s * bw * 0.18]
    k.at(base, eul(ang, 0, 0), () => {
      k.rbox(ENGINE, [Le * 0.92, bH, bW], 0.03, [0, bH / 2, 0])
      for (let i = 0; i < perBank; i++) {
        const x = -Le * 0.44 + pitchC * (i + 0.5)
        k.rbox('aluminium', [pitchC * 0.86, 0.12, bW * 0.9], 0.03, [x, bH + 0.06, 0])
        k.hex('nut', 0.035, 0.02, [x, bH + 0.13, 0])
        // injector / fuel line
        k.rod('tubing', [x + pitchC * 0.3, bH - 0.05, (s >= 0 ? 1 : -1) * bW * 0.5], [x + pitchC * 0.3, bH - 0.05, (s >= 0 ? 1 : -1) * bW * 0.62], 0.006, 6)
      }
      // exhaust manifold (insulated) along the outboard face
      const side = vee ? s : -1
      k.cyl('insulation', 0.09, Le * 0.9, [-Le * 0.02, bH * 0.65, side * (bW / 2 + 0.09)], 'x', 20)
      for (let i = 0; i < perBank; i++) k.cyl('insulation', 0.05, 0.1, [-Le * 0.44 + pitchC * (i + 0.5), bH * 0.65, side * (bW / 2 + 0.03)], 'z', 12)
    })
  }
  const engTop = L.engTop
  if (vee) k.rbox('aluminium', [Le * 0.8, 0.25, bw * 0.38], 0.04, [xem, ccTop + 0.35, 0])
  // turbochargers at the flywheel end, air cleaners on top, outlets up into the exhaust
  const tz = vee ? [-1, 1].map((s) => s * bw * 0.48) : [-bw * 0.45]
  const yT = engTop - 0.05
  const xT = xe0 + 0.25
  for (const z of tz) {
    k.cyl('castIron', 0.17, 0.2, [xT, yT, z], 'x', 24)
    k.cyl('aluminium', 0.2, 0.18, [xT + 0.2, yT, z], 'x', 24)
    k.lathe('insulation', [[0.1, 0], [0.12, 0.1], [0.1, 0.25]], [xT - 0.12, yT, z], '-x', 16)
    const hAc = clamp(L.roof - (yT + 0.2) - 0.1, 0.2, 0.45)
    k.cyl('equipmentPaintDark', 0.17, hAc, [xT + 0.25, yT + 0.18 + hAc / 2, z], 'y', 24)
    k.dome('equipmentPaintDark', 0.17, [xT + 0.25, yT + 0.18 + hAc, z], 'y', Math.PI / 2, 0.3, 20)
    k.rod('rubberBlack', [xT + 0.22, yT + 0.12, z], [xT + 0.25, yT + 0.18, z], 0.08, 12)
  }
  // front end: damper, belts, water pumps, thermostat housing, oil and fuel filters
  k.cyl('castIron', 0.22, 0.1, [xe1 + 0.05, yk, 0], 'x', 32)
  k.cyl('flangeSteel', 0.14, 0.08, [xe1 + 0.14, yk, 0], 'x', 24)
  for (const s of [-1, 1]) k.cyl(ENGINE, 0.13, 0.18, [xe1 + 0.05, yk + 0.35, s * bw * 0.3], 'x', 20)
  k.rbox(ENGINE, [0.2, 0.18, bw * 0.5], 0.03, [xe1 - 0.05, engTop - 0.1, 0])
  for (let i = 0; i < 3; i++) k.cyl('actuatorYellow', 0.06, 0.25, [xe0 + Le * (0.45 + i * 0.1), yk - 0.1, bw / 2 + 0.08], 'y', 16)
  for (let i = 0; i < 2; i++) k.cyl('handwheel', 0.05, 0.2, [xe0 + Le * (0.75 + i * 0.08), yk - 0.1, -bw / 2 - 0.07], 'y', 14)
  gauge(k, [xe0 + Le * 0.6, ccTop, bw / 2 + 0.05], 'z', 0.08, 'bar', 10)
  lineRun(k, [[Lset * 0.36 - 0.1, hb, Wset / 2 - 0.3], [Lset * 0.36 - 0.1, yk - 0.2, Wset / 2 - 0.3], [xe0 + Le * 0.8, yk - 0.2, Wset / 2 - 0.3], [xe0 + Le * 0.8, yk - 0.2, -bw / 2 - 0.07]], 0.5, 'tubing')
  tagPlate(k, p.tag, [xe0 + Le * 0.3, yk - 0.05, bw / 2 + 0.002], 'z', 0.25)
  // closed crankcase ventilation filter with the fume line out towards the radiator discharge
  const cvx = xe1 - Le * 0.18
  k.cyl('equipmentPaintDark', 0.11, 0.3, [cvx, ccTop + 0.15, -bw / 2 - 0.12], 'y', 18)
  k.dome('equipmentPaintDark', 0.11, [cvx, ccTop + 0.3, -bw / 2 - 0.12], 'y', Math.PI / 2, 0.4, 14)
  k.box(ENGINE, [0.06, 0.06, 0.12], [cvx, ccTop, -bw / 2 - 0.03])
  lineRun(k, [[cvx, ccTop + 0.34, -bw / 2 - 0.12], [cvx, ccTop + 0.45, -bw / 2 - 0.12], [Lset / 2 - 0.45, ccTop + 0.45, -bw / 2 - 0.12], [Lset / 2 - 0.45, hs + 0.2, -Wset / 2 + 0.12]], 1.5, 'rubberBlack')

  // radiator: core with fins, top and bottom tanks, frame, fan shroud with guard, coolant hoses
  const xr = Lset / 2 - 0.2
  const Wr = Wset * 0.95
  const yr0 = hs + 0.12
  k.box('aluminium', [0.2, Hr, Wr - 0.2], [xr, yr0 + Hr / 2, 0])
  const core = new THREE.PlaneGeometry(Wr - 0.2, Hr)
  uvScale(core, 1, Hr / 0.02)
  k.add(louvreMaterial('#8a9196'), core, mat4([xr + 0.101, yr0 + Hr / 2, 0], faceQ('x')))
  k.box(SKID, [0.3, 0.14, Wr], [xr, yr0 + Hr + 0.07, 0])
  k.box(SKID, [0.3, 0.12, Wr], [xr, yr0 - 0.06, 0])
  for (const s of [-1, 1]) k.box(SKID, [0.3, Hr + 0.26, 0.1], [xr, yr0 + Hr / 2, s * (Wr / 2 - 0.05)])
  for (const s of [-1, 1]) k.rod(SKID, [xr - 0.12, yr0 + Hr, s * (Wr / 2 - 0.05)], [xe1 - 0.1, engTop, s * bw * 0.4], 0.025, 8)
  k.cyl('brass', 0.05, 0.08, [xr, yr0 + Hr + 0.18, Wr * 0.3], 'y', 14)
  const fr = Math.min(Hr, Wr) * 0.43
  const yf = yr0 + Hr / 2
  k.box(SKID, [0.04, Hr, Wr - 0.2], [xr - 0.12, yf, 0])
  k.lathe(SKID, [[fr + 0.04, 0], [fr + 0.04, 0.22], [fr * 1.2, 0.3]], [xr - 0.42, yf, 0], 'x', 40)
  k.disc(fanGuardMaterial(), fr + 0.05, [xr - 0.43, yf, 0], '-x', 32)
  rotors.push(fanRotor('safetyYellow', fr * 0.92, [xr - 0.3, yf, 0], 'x', 300, { blades: 8, chord: fr * 0.32, pitch: 0.4, hub: fr * 0.18, hubLen: 0.1 }))
  k.rod('flangeSteel', [xe1 + 0.14, yf, 0], [xr - 0.36, yf, 0], 0.04, 12)
  lineRun(k, [[xe1 - 0.05, engTop - 0.05, 0], [xe1 + 0.2, engTop - 0.05, 0], [xe1 + 0.2, yr0 + Hr + 0.05, Wr * 0.3], [xr - 0.12, yr0 + Hr + 0.05, Wr * 0.3]], 4, 'rubberBlack')
  lineRun(k, [[xr - 0.12, yr0 + 0.08, -Wr * 0.3], [xe1 + 0.2, yr0 + 0.08, -Wr * 0.3], [xe1 + 0.2, yk + 0.35, -bw * 0.3], [xe1 + 0.14, yk + 0.35, -bw * 0.3]], 4, 'rubberBlack')
  // batteries and charger
  k.rbox('plasticGrey', [0.6, 0.3, 0.35], 0.02, [x0 + 0.5, hs + 0.15, -Wset / 2 + 0.3])
  k.rbox('stainless', [0.3, 0.4, 0.15], 0.02, [x0 + 0.5, hs + 0.55, -Wset / 2 + 0.2])
}

/** Exhaust: turbo outlets up through bellows into the silencer, silencer outlet riser to the exhaust flange. */
function exhaust(k: Kit, L: ReturnType<typeof layout>) {
  const { exNps, Ds, Lsil, xSil, ySil, xEx, yEx, xoff, y0, Wset, Lset, box } = L
  const od = pipeOD(exNps)
  // silencer: insulated drum with flanged ends
  const x0 = xSil - Lsil / 2
  const x1 = xSil + Lsil / 2
  k.cyl('stainless', Ds / 2, Lsil, [xSil, ySil, 0], 'x', 40)
  for (const x of [x0, x1]) {
    k.dome('stainless', Ds / 2, [x, ySil, 0], x > xSil ? 'x' : '-x', Math.PI / 2, 0.35, 32)
    k.torus('stainless', Ds / 2 + 0.005, 0.01, [x, ySil, 0], 'x', 6, 40)
  }
  for (let i = 1; i < 4; i++) k.torus('stainless', Ds / 2 + 0.004, 0.008, [x0 + (i * Lsil) / 4, ySil, 0], 'x', 6, 40)
  tagPlate(k, 'EXHAUST SILENCER', [xSil, ySil, Ds / 2 + 0.002], 'z', 0.3)
  // silencer supports
  const yb = box ? L.CH : L.engTop + 0.05
  for (const xx of [x0 + Lsil * 0.2, x1 - Lsil * 0.2]) {
    k.box(SKID, [0.12, ySil - yb - Ds * 0.3, Ds * 0.7], [xx, (ySil - Ds * 0.3 + yb) / 2, 0])
    k.box(SKID, [0.25, 0.02, Ds * 0.9], [xx, yb + 0.01, 0])
  }
  if (!box) {
    // support frame from the skid rails up to the silencer cradles
    const yr = L.hs
    for (const xx of [x0 + Lsil * 0.2, x1 - Lsil * 0.2])
      for (const s of [-1, 1]) k.box(SKID, [0.1, yb - yr, 0.1], [xx + xoff, (yb + yr) / 2 + y0, s * (Wset / 2 - 0.12)])
    for (const xx of [x0 + Lsil * 0.2, x1 - Lsil * 0.2]) k.box(SKID, [0.12, 0.12, Wset - 0.14], [xx, yb + 0.06, 0])
  }
  // outlet riser to the exhaust flange (port), rain-proof flanged end
  const sOut: V3 = [xEx, ySil + Ds * 0.4, 0]
  annulus(k, 'stainless', od / 2, od * 0.7, 0.06, [xEx, ySil + Ds / 2 - 0.01, 0], 'y', 28)
  runToFlange(k, [sOut], [xEx, yEx, 0], [0, 1, 0], exNps, 150, 'stainless')
  // inlet from the turbos: drops to the turbo outlet(s) through a bellows
  const xi = x0 + Ds * 0.4
  const xT = xoff - Lset / 2 + 0.15 + L.La + 0.25 + 0.25
  const yT = y0 + L.engTop + 0.15
  const iN = Math.max(6, exNps - 2)
  const iod = pipeOD(iN)
  lineRun(k, [[xi, ySil - Ds * 0.3, 0], [xi, ySil - Ds / 2 - 0.3, 0], [xT, ySil - Ds / 2 - 0.3, 0], [xT, yT + 0.35, 0]], iN, 'insulation')
  k.lathe('rubberBlack', [[iod / 2 + 0.01, 0], [iod / 2 + 0.04, 0.05], [iod / 2 + 0.01, 0.1], [iod / 2 + 0.04, 0.15], [iod / 2 + 0.01, 0.2]], [xT, yT + 0.12, 0], 'y', 24)
  const tz = L.vee ? [-1, 1].map((s) => s * L.bw * 0.48) : [-L.bw * 0.45]
  for (const z of tz) lineRun(k, [[xT, yT + 0.12, 0], [xT, yT + 0.12, z * 0.6], [xT, yT, z]], Math.max(4, iN - 2), 'insulation')
  if (box) annulus(k, 'flangeSteel', iod / 2, iod / 2 + 0.08, 0.06, [xT, L.CH - 0.03, 0], 'y', 24)
  void pipeWall
}

/** ISO 668 high-cube container: corrugated walls, corner castings, cargo doors, side doors, intake louvres, radiator discharge louvre. */
function container(k: Kit, p: P, L: ReturnType<typeof layout>) {
  const { CL, CW, CH } = L
  const C: MatKey = 'equipmentPaint'
  const R: MatKey = 'equipmentPaintDark'
  const x0 = -CL / 2
  const x1 = CL / 2
  // bottom side rails, floor, cross members, corner posts, top rails, roof
  for (const s of [-1, 1]) {
    k.box(R, [CL, 0.16, 0.1], [0, 0.08, s * (CW / 2 - 0.05)])
    k.box(R, [CL, 0.1, 0.06], [0, CH - 0.05, s * (CW / 2 - 0.03)])
  }
  k.box('deckPlate', [CL, 0.03, CW - 0.1], [0, FLOOR - 0.015, 0])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.box(R, [0.16, CH, 0.16], [sx * (CL / 2 - 0.08), CH / 2, sz * (CW / 2 - 0.08)])
      for (const y of [0.06, CH - 0.06]) {
        k.box('castIron', [0.178, 0.118, 0.162], [sx * (CL / 2 - 0.089), y, sz * (CW / 2 - 0.081)])
        k.box('rubberBlack', [0.01, 0.05, 0.08], [sx * (CL / 2 + 0.001), y, sz * (CW / 2 - 0.081)])
      }
    }
  k.box(C, [CL - 0.3, 0.04, CW - 0.12], [0, CH - 0.06, 0])
  for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.6) k.box(C, [0.24, 0.025, CW - 0.2], [x, CH - 0.03, 0])
  // corrugated side walls with openings: intake louvres near the alternator, personnel doors, fuel penetration
  const H = CH - 0.26
  const yMid = 0.16 + H / 2
  const xi = L.xoff - L.Lset / 2 + L.La * 0.5
  const xd = Math.min(L.xoff + L.Lset * 0.1, x1 - 1.2)
  const openings = (s: number): [number, number][] => (s > 0 ? [[xi, 1.4], [xd, 1.0]] : [[xi, 1.4], [xd + (CL > 7 ? 0 : -0.2), 1.0]])
  for (const s of [-1, 1]) {
    const z = s * (CW / 2 - 0.03)
    const ops = openings(s).sort((a, b) => a[0] - b[0])
    let a = x0 + 0.16
    for (const [c, w] of [...ops, [x1 - 0.16 + 10, 0] as [number, number]]) {
      const b = Math.min(c - w / 2, x1 - 0.16)
      if (b > a) {
        k.box(C, [b - a, H, 0.02], [(a + b) / 2, yMid, z])
        for (let x = a + 0.14; x < b - 0.07; x += 0.278) k.box(C, [0.1, H, 0.036], [x, yMid, z + s * 0.02])
      }
      a = c + w / 2
    }
    for (const [c, w] of ops) {
      const hh = c === xi ? 1.2 : 2.05
      k.box(C, [w, H - hh, 0.02], [c, 0.16 + hh + (H - hh) / 2, z])
      if (c === xi) {
        k.at([c, 0.16, z], faceQ(s > 0 ? 'z' : '-z'), () => louvre(k, w - 0.1, hh - 0.1, 0, hh / 2, R))
        // sand-trap intake louvre with motorised damper actuator
        k.rbox('actuatorBlue', [0.14, 0.12, 0.1], 0.015, [c + w / 2 - 0.15, 0.16 + hh + 0.12, z + s * 0.08])
      } else k.at([c, FLOOR, z], faceQ(s > 0 ? 'z' : '-z'), () => door(k, w - 0.1, 2.0, 0, false, C, R, p.doorsOpen ? 1.7 : 0))
    }
  }
  // -X end: cargo doors with locking bars
  k.at([x0, 0.16, 0], faceQ('-x'), () => {
    for (const s of [-1, 1]) {
      k.box(C, [CW / 2 - 0.1, H, 0.03], [s * (CW / 4 - 0.02), H / 2, 0.01])
      for (const xx of [0.3, 0.75]) k.rod('flangeSteel', [s * (CW / 4 - 0.02) + s * (xx - 0.5) * 0.9, 0.1, 0.05], [s * (CW / 4 - 0.02) + s * (xx - 0.5) * 0.9, H - 0.1, 0.05], 0.014, 8)
      for (let i = 0; i < 4; i++) k.box(C, [CW / 2 - 0.2, 0.08, 0.02], [s * (CW / 4 - 0.02), 0.3 + (i * (H - 0.6)) / 3, 0.035])
    }
  })
  // +X end: radiator discharge louvre with attenuator frame
  k.box(C, [0.03, 0.15, CW - 0.2], [x1 - 0.02, CH - 0.2, 0])
  k.at([x1, 0.16, 0], faceQ('x'), () => louvre(k, CW - 0.4, H - 0.3, 0, (H - 0.3) / 2 + 0.06, R))
  // clean-agent fire suppression cylinder and release panel inside, by the door; smoke / heat detectors on the ceiling
  k.cyl('actuatorRed', 0.13, 1.1, [xd - 0.85, FLOOR + 0.55, CW / 2 - 0.25], 'y', 20)
  k.dome('actuatorRed', 0.13, [xd - 0.85, FLOOR + 1.1, CW / 2 - 0.25], 'y', Math.PI / 2, 0.7, 16)
  k.cyl('brass', 0.03, 0.12, [xd - 0.85, FLOOR + 1.25, CW / 2 - 0.25], 'y', 10)
  for (const sz of [-1, 1]) k.box(R, [0.04, 0.04, 0.2], [xd - 0.85, FLOOR + 0.5 + sz * 0.3, CW / 2 - 0.15])
  k.tube('tubing', [[xd - 0.85, FLOOR + 1.31, CW / 2 - 0.25], [xd - 0.85, CH - 0.12, CW / 2 - 0.25], [L.xoff, CH - 0.12, CW / 2 - 0.25]], 0.012, 6, 0.05)
  for (const x of [L.xoff - L.Lset * 0.3, L.xoff + L.Lset * 0.2]) k.cyl('plasticGrey', 0.05, 0.05, [x, CH - 0.115, 0], 'y', 12)
  // fuel penetration plate, signs, tag
  k.box(R, [0.3, 0.3, 0.02], [L.xFuel, L.yFuel, -CW / 2 - 0.01])
  k.plane(signMaterial('ler', `${p.tag}  EMERGENCY GENERATOR`), Math.min(2.2, CL * 0.35), 0.35, [L.xoff - L.Lset * 0.15, CH - 0.45, CW / 2 + 0.03])
  k.plane(signMaterial('hv'), 0.4, 0.2, [xd + 0.8, 1.5, CW / 2 + 0.03])
  tagPlate(k, p.tag, [xd - 0.8, 1.5, CW / 2 + 0.03], 'z', 0.25)
  // roof access ladder at the -X end
  ladder(k, [x0 + 0.5, 0, -CW / 2 - 0.2], CH, [0, 0, -1], { cage: false })
}
