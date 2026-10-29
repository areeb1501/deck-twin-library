// NFPA 20 diesel firewater pump set: engine with radiator, silencer, day tank, batteries and controller, driving a right-angle gear on a caisson pump or a horizontal split-case pump.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { anchorBolt, annulus, castExtrude, clamp, faceQ, flangeLen, flangedBranch, meshTube, openTube, pipeGauge, smallValve, voluteShape } from './_pumps'
import { caisson, caissonLayout, dischargeHead, pumpColumn } from './_pumpsCaisson'
import { port, type Port } from '../lib/ports'
import { Rotors, fanImpeller, guardedCoupling, type RotorSpec } from '../lib/rotors'
import { liftingLug, tagPlate } from '../lib/parts'
import { fanGuardMaterial, lcdMaterial } from '../lib/textures'
import { flange as flangeDims, pipeOD, type Rating } from '../lib/standards'

export type FirePumpType = 'vertical' | 'split-case'

export interface DieselFirewaterPumpProps {
  /** vertical turbine in a caisson (right-angle gear) or horizontal split-case */
  pumpType?: FirePumpType
  /** engine rated power, kW */
  kw?: number
  dischargeNps?: number
  /** split-case only */
  suctionNps?: number
  rating?: Rating
  /** caisson length below the deck (vertical), m */
  depth?: number
  caissonDiameter?: number
  stages?: number
  cutaway?: boolean
  /** engine jacket-water cooling: raw-water heat exchanger fed from the pump discharge, or radiator */
  cooling?: 'heat-exchanger' | 'radiator'
  tag?: string
  running?: boolean
}

export const defaults = {
  pumpType: 'vertical' as FirePumpType,
  kw: 750,
  dischargeNps: 10,
  suctionNps: 12,
  rating: 150 as Rating,
  depth: 25,
  caissonDiameter: 1.0,
  stages: 3,
  cutaway: false,
  cooling: 'heat-exchanger' as 'heat-exchanger' | 'radiator',
  running: true,
}

type P = Omit<typeof defaults, 'running'> & { tag?: string }

// split-case layout: shaft along X at ys, skid top at yk, volute centred on x = 0
function splitLayout(p: P) {
  const dOD = pipeOD(p.dischargeNps)
  const sOD = pipeOD(p.suctionNps)
  const Rimp = 0.12 + 0.025 * p.dischargeNps
  const r0 = Rimp * 1.05
  const r1 = r0 + dOD
  const wv = dOD * 1.15
  const yk = 0.24
  const fOD = Math.max(flangeDims(p.dischargeNps, p.rating).od, flangeDims(p.suctionNps, p.rating).od)
  const ys = yk + Math.max(r1 + 0.15, (r0 + r1) / 2 + fOD / 2 + 0.15)
  const yN = ys - (r0 + r1) / 2
  const out = r1 + 0.05
  const zD = out + 0.25 + flangeLen(p.dischargeNps, p.rating)
  const zS = -(r1 + sOD * 0.6 + 0.3 + flangeLen(p.suctionNps, p.rating))
  return { dOD, sOD, Rimp, r0, r1, wv, yk, ys, yN, out, zD, zS }
}

export function ports(props: DieselFirewaterPumpProps = {}): Port[] {
  const p = { ...defaults, ...props }
  if (p.pumpType === 'split-case') {
    const s = splitLayout(p)
    return [
      port('suction', 'Suction', [0, s.yN, s.zS], [0, 0, -1], p.suctionNps, p.rating),
      port('discharge', 'Discharge', [0, s.yN, s.zD], [0, 0, 1], p.dischargeNps, p.rating),
    ]
  }
  const L = caissonLayout(p)
  return [port('discharge', 'Discharge', [L.xFace, L.yOut, 0], [1, 0, 0], p.dischargeNps, p.rating)]
}

export function DieselFirewaterPump({ tag, ...rest }: DieselFirewaterPumpProps & GroupProps) {
  const { pumpType, kw, dischargeNps, suctionNps, rating, depth, caissonDiameter, stages, cutaway, cooling, running, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(
    () => build({ pumpType, kw, dischargeNps, suctionNps, rating, depth, caissonDiameter, stages, cutaway, cooling, tag }),
    [pumpType, kw, dischargeNps, suctionNps, rating, depth, caissonDiameter, stages, cutaway, cooling, tag],
  )
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default DieselFirewaterPump

const RED = 'firewaterRed' as const
const DARK: MatKey = 'equipmentPaintDark'
const EXHAUST = () => paint('#a3a6a2', { metalness: 0.65, roughness: 0.38, clearcoat: 0 })
const CORE = () => paint('#2a2e31', { metalness: 0.5, roughness: 0.6, clearcoat: 0 })

function build(p: P) {
  const k = new Kit()
  const rotors: RotorSpec[] = []
  if (p.pumpType === 'split-case') splitCase(k, p, rotors)
  else verticalGearDrive(k, p, rotors)
  return { built: k.build(), rotors }
}

// ------------------------------------------------------------------ vertical: caisson pump + right-angle gear + cardan shaft
function verticalGearDrive(k: Kit, p: P, rotors: RotorSpec[]) {
  const L = caissonLayout(p)
  caisson(k, L, p.cutaway)
  pumpColumn(k, L)
  dischargeHead(k, L, RED, p.tag)
  const { yTop, rb, rs } = L
  const Rg = clamp(0.2 + 0.00011 * p.kw, 0.24, 0.45)
  const yG0 = yTop
  const hGs = 0.45
  const yG1 = yG0 + hGs
  const rSt = Math.max(rb + 0.02, Rg * 0.85)
  annulus(k, RED, rSt - 0.07, rSt + 0.05, yG0 - 0.01, yG0 + 0.04, [0, 0, 0], 'y', 40)
  annulus(k, RED, rSt - 0.07, rSt + 0.05, yG1 - 0.04, yG1, [0, 0, 0], 'y', 40)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    k.box(RED, [0.08, hGs - 0.08, 0.025], [Math.cos(a) * rSt, (yG0 + yG1) / 2, Math.sin(a) * rSt], faceQ([Math.cos(a), 0, Math.sin(a)]))
  }
  meshTube(k, [0, yG0 + 0.04, 0], [0, yG1 - 0.04, 0], rSt + 0.01)
  {
    const r = new Kit()
    r.cyl('flangeSteel', rs, yG1 - yTop - 0.2, [0, 0, 0], 'y', 14)
    r.cyl('flangeSteel', rs * 3.2, 0.05, [0, yG0 + 0.36 - (yG1 + yTop + 0.2) / 2, 0], 'y', 20)
    r.box('nut', [rs * 0.5, 0.07, rs * 0.5], [rs * 3.2, yG0 + 0.36 - (yG1 + yTop + 0.2) / 2, 0])
    rotors.push({ built: r.build(), axis: 'y', pos: [0, (yG1 + yTop + 0.2) / 2, 0], rpm: 150 })
  }
  // gear drive: base flange, finned vertical housing, horizontal bevel-gear housing, input towards -X
  const Hl = Rg
  annulus(k, RED, 0, Rg * 1.18, yG1, yG1 + 0.05, [0, 0, 0], 'y', 40)
  k.boltCircle('boltXylan', 'nut', 8, Rg * 1.08, [0, yG1 - 0.03, 0], 'y', 0.016, 0.1, [0.09], Math.PI / 8)
  k.cyl(RED, Rg, Hl, [0, yG1 + 0.05 + Hl / 2, 0], 'y', 40)
  for (let i = 1; i <= 5; i++) annulus(k, RED, Rg, Rg + 0.03, yG1 + 0.05 + (Hl * i) / 6 - 0.006, yG1 + 0.05 + (Hl * i) / 6 + 0.006, [0, 0, 0], 'y', 40)
  const yIn = yG1 + 0.05 + Hl + Rg * 0.5
  const rH = Rg * 0.82
  k.cyl(RED, Rg * 0.9, yIn - (yG1 + 0.05 + Hl), [0, (yIn + yG1 + 0.05 + Hl) / 2, 0], 'y', 40)
  k.cyl(RED, rH, Rg * 1.75, [-Rg * 0.25, yIn, 0], 'x', 40)
  k.dome(RED, rH, [Rg * 0.62, yIn, 0], 'x', Math.PI / 2, 0.35, 32)
  k.cyl(RED, Rg * 0.92, 0.06, [0, yIn + rH * 0.75, 0], 'y', 40)
  k.boltCircle('boltXylan', 'nut', 8, Rg * 0.8, [0, yIn + rH * 0.75, 0], 'y', 0.012, 0.05, [0.04])
  // shaft-driven cooling fan under a guard on top, cooling-water in / out low on the body
  k.cyl(RED, Rg * 0.6, 0.1, [0, yIn + rH * 0.75 + 0.08, 0], 'y', 32, Rg * 0.55, true)
  k.disc(fanGuardMaterial(), Rg * 0.56, [0, yIn + rH * 0.75 + 0.13, 0], 'y', 32)
  for (const a of [0.5, -0.5]) {
    const q: V3 = [Math.cos(a + Math.PI / 2) * Rg, yG1 + 0.05 + Hl * 0.2, Math.sin(a + Math.PI / 2) * Rg]
    k.rod('stainless', q, [q[0] * 1.25, q[1], q[2] * 1.25], 0.014, 8)
    k.hex('brass', 0.035, 0.02, [q[0] * 1.25, q[1], q[2] * 1.25], [q[0], 0, q[2]])
  }
  const xIn0 = -Rg * 1.12
  k.cyl(RED, Rg * 0.42, 0.06, [xIn0 + 0.03, yIn, 0], 'x', 32)
  k.cyl(RED, Rg * 0.34, 0.18, [xIn0 - 0.09, yIn, 0], 'x', 28)
  const xGi = xIn0 - 0.22
  k.cyl('stainless', 0.04, 0.06, [xGi + 0.03, yIn, 0], 'x', 14)
  k.cyl('flangeSteel', 0.11, 0.035, [xGi, yIn, 0], 'x', 24)
  k.cyl('brass', 0.04, 0.02, [0, yG1 + 0.05 + Hl * 0.3, Rg + 0.01], 'z', 18)
  k.disc('glass', 0.03, [0, yG1 + 0.05 + Hl * 0.3, Rg + 0.021], 'z', 18)
  k.cyl('brass', 0.012, 0.06, [-Rg * 0.4, yIn + rH * 0.75 + 0.06, Rg * 0.3], 'y', 8)
  k.sphere('brass', 0.025, [-Rg * 0.4, yIn + rH * 0.75 + 0.1, Rg * 0.3], undefined, 10)
  k.hex('nut', 0.05, 0.03, [Rg * 0.3, yIn + rH * 0.75 + 0.045, -Rg * 0.3])
  k.box('nameplate', [0.16, 0.1, 0.003], [Rg * 0.5, yG1 + 0.05 + Hl * 0.6, Rg * 0.866 + 0.004], faceQ([0.5, 0, 0.866]))
  for (const s of [-1, 1]) k.torus('nut', 0.035, 0.009, [0, yIn + rH * 0.75 + 0.06, s * Rg * 0.6], 'z', 6, 14)

  // guarded cardan shaft, slightly inclined as installed
  const Ls = 1.1
  const drop = 0.09
  const xF = xGi - 0.04 - Ls
  const yCr = yIn - drop
  const P1 = new THREE.Vector3(xGi - 0.02, yIn, 0)
  const P2 = new THREE.Vector3(xF + 0.02, yCr, 0)
  const dir = P1.clone().sub(P2).normalize()
  const at = (t: number) => P2.clone().lerp(P1, t).toArray() as V3
  {
    const Lsh = P1.distanceTo(P2)
    const r = new Kit()
    const xt = (t: number) => -Lsh / 2 + t * Lsh
    for (const [x0, s] of [[Lsh / 2, -1], [-Lsh / 2, 1]] as [number, number][]) {
      r.cyl('flangeSteel', 0.11, 0.03, [x0 + s * 0.05, 0, 0], 'x', 24)
      const j = x0 + s * 0.13
      for (const zz of [-1, 1]) r.box('flangeSteel', [0.1, 0.05, 0.03], [j, 0, zz * 0.06])
      r.box('nut', [0.04, 0.13, 0.04], [j, 0, 0])
      r.box('nut', [0.04, 0.04, 0.13], [j, 0, 0])
      for (const yy of [-1, 1]) r.box('flangeSteel', [0.1, 0.03, 0.05], [x0 + s * 0.2, yy * 0.06, 0])
    }
    r.cyl('flangeSteel', 0.06, (0.55 - 0.22) * Lsh, [xt(0.385), 0, 0], 'x', 18)
    r.cyl('flangeSteel', 0.045, (0.82 - 0.18) * Lsh, [0, 0, 0], 'x', 18)
    r.box('nut', [0.06, 0.02, 0.04], [xt(0.68), 0.05, 0])
    const mid = P1.clone().add(P2).multiplyScalar(0.5)
    rotors.push({ built: r.build(), axis: 'x', pos: mid.toArray() as V3, rot: [0, 0, Math.atan2(dir.y, dir.x)], rpm: 150 })
  }
  meshTube(k, at(0.06), at(0.94), 0.2)
  for (const tt of [0.06, 0.94]) k.torus('safetyYellow', 0.2, 0.012, at(tt), dir.toArray() as V3, 6, 28)
  for (const tt of [0.3, 0.7]) {
    const q = at(tt)
    k.rod('safetyYellow', [q[0], q[1] - 0.2, q[2]], [q[0], 0.02, q[2]], 0.02, 8)
    k.box('safetyYellow', [0.14, 0.012, 0.14], [q[0], 0.006, q[2]])
  }
  const hc = clamp(0.5 + 0.00012 * p.kw, 0.55, 0.8)
  const xTap = rb + (L.xFace - flangeLen(p.dischargeNps, p.rating) - rb) * 0.75
  dieselEngine(k, rotors, { xF, yCr, yk: yCr - hc, xs1: xF + 0.12, kw: p.kw, tag: p.tag, cooling: p.cooling, tap: [xTap, L.yOut, -L.dOD / 2] })
}

// ------------------------------------------------------------------ horizontal split-case (BB1 double suction) on a common skid
function splitCase(k: Kit, p: P, rotors: RotorSpec[]) {
  const s = splitLayout(p)
  const { r0, r1, wv, yk, ys, yN, out, zD, zS, dOD, sOD } = s
  // volute in the YZ plane: shape u -> -Y, v -> +Z (tangential outlet heading +Z below the shaft)
  const vm = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)).setPosition(0, ys, 0)
  castExtrude(k, RED, voluteShape(r0, r1, out), wv, Math.min(0.04, wv * 0.15), vm, 16)
  // discharge: outlet throat -> round neck -> WN flange
  const zNeck = out + 0.05
  k.lathe(RED, [[0, out - 0.06], [Math.max(wv, r1 - r0) * 0.56, out - 0.06], [dOD * 0.56, zNeck], [dOD * 0.45, zNeck]], [0, yN, 0], 'z', 32)
  flangedBranch(k, RED, [0, yN, out - 0.1], [0, yN, zD], p.dischargeNps, p.rating, 'STD')
  // double-suction chamber on -Z feeding both eyes, suction neck and flange
  const sw = wv * 2.3
  const yR = yN - ys
  const zi = -r1 * 0.3
  const zo = -(r1 + sOD * 0.5)
  const yt = -0.03
  const yb = yR - sOD * 0.7
  const rr = sOD * 0.45
  const sh = new THREE.Shape()
  sh.moveTo(zi, yt)
  sh.lineTo(zo + rr * 0.4, yt)
  sh.quadraticCurveTo(zo, yt, zo, yt - rr * 0.4)
  sh.lineTo(zo, yb + rr)
  sh.quadraticCurveTo(zo, yb, zo + rr, yb)
  sh.lineTo(zi, yb + rr * 0.5)
  sh.closePath()
  // shape x -> world Z, shape y -> world Y (relative to ys), extrude -> world X
  castExtrude(k, RED, sh, sw, 0.04, new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(0, ys, 0), 12)
  for (const sx of [-1, 1]) k.lathe(RED, [[0, -wv * 0.1], [r0 * 0.75, -wv * 0.1], [r0 * 0.7, wv * 0.6], [Rshaft(p) * 2.2, wv * 0.75], [0, wv * 0.75]], [sx * wv * 0.45, ys, 0], sx > 0 ? 'x' : '-x', 36)
  const zSn = zo + 0.03
  flangedBranch(k, RED, [0, yN, zSn], [0, yN, zS], p.suctionNps, p.rating, 'STD')
  // horizontal split flange with stud rows, upper-casing lifting lugs
  const fx = sw * 0.5 + 0.05
  const fz0 = zo
  const fz1 = r0 + 0.06
  k.box(RED, [fx * 2, 0.05, fz1 - fz0], [0, ys, (fz0 + fz1) / 2])
  for (const z of [fz0 + 0.035, fz1 - 0.035]) {
    const n = Math.max(4, Math.round((fx * 2) / 0.12))
    for (let i = 0; i < n; i++) {
      const x = -fx + 0.05 + ((fx * 2 - 0.1) * i) / (n - 1)
      k.cyl('boltXylan', 0.011, 0.11, [x, ys + 0.03, z], 'y', 6)
      k.hex('nut', 0.036, 0.02, [x, ys + 0.035, z])
    }
  }
  for (const sx of [-1, 1]) liftingLug(k, [sx * wv * 0.25, ys + r1 - 0.02, -0.05], 'z', 1, RED)
  // bearing brackets, housings, seals at both ends; shaft
  const rsh = Rshaft(p)
  const xb = fx + 0.32
  for (const sx of [-1, 1]) {
    const x = sx * xb
    k.cyl(RED, rsh * 2.6, 0.12, [sx * (fx + 0.08), ys, 0], 'x', 24)
    k.cyl('brass', rsh * 2.0, 0.04, [sx * (fx + 0.16), ys, 0], 'x', 20)
    for (const sz of [-1, 1]) {
      k.cyl('boltXylan', 0.007, 0.1, [sx * (fx + 0.13), ys, sz * rsh * 2.4], 'x', 6)
      k.hex('nut', 0.022, 0.012, [sx * (fx + 0.185), ys, sz * rsh * 2.4], 'x')
    }
    k.tube('tubing', [[sx * (fx + 0.08), ys - rsh * 2.6, 0], [sx * (fx + 0.08), yk + 0.04, 0.05]], 0.007)
    k.lathe(RED, [[rsh * 3.4, -0.11], [rsh * 3.8, -0.08], [rsh * 3.8, 0.08], [rsh * 3.4, 0.11]], [x, ys, 0], 'x', 32)
    for (let i = 0; i < 4; i++) k.cyl(RED, rsh * 4.1, 0.008, [x - 0.06 + i * 0.04, ys, 0], 'x', 32)
    k.box(RED, [0.18, ys - yk - rsh * 3.4, 0.06], [x, (ys - rsh * 3.4 + yk) / 2, 0])
    k.box(RED, [0.06, ys - yk - rsh * 3.4, 0.3], [x, (ys - rsh * 3.4 + yk) / 2, 0])
    // regreaseable ball bearings: grease nipple on top, relief plug below
    k.cyl('brass', 0.008, 0.03, [x, ys + rsh * 3.8 + 0.015, 0], 'y', 8)
    k.sphere('brass', 0.011, [x, ys + rsh * 3.8 + 0.035, 0], undefined, 8)
    k.hex('nut', 0.022, 0.014, [x, ys - rsh * 3.6, rsh * 1.8])
  }
  k.cyl('flangeSteel', rsh, xb * 2 + 0.2, [0, ys, 0], 'x', 16)
  // casing feet on pedestals
  for (const sz of [-1, 1]) {
    const z = sz > 0 ? fz1 - 0.08 : fz0 + 0.08
    k.box(RED, [sw * 0.6, ys - 0.05 - yk, 0.1], [0, (ys - 0.05 + yk) / 2, z])
    k.box('flangeSteel', [sw * 0.7, 0.02, 0.16], [0, yk + 0.01, z])
  }
  // NFPA 20 accessories: automatic air release valve, suction compound + discharge gauges
  const yTopC = ys + r1
  k.cyl(RED, 0.02, 0.06, [0, yTopC + 0.02, 0.02], 'y', 10)
  k.cyl('brass', 0.035, 0.1, [0, yTopC + 0.09, 0.02], 'y', 16)
  k.dome('brass', 0.035, [0, yTopC + 0.14, 0.02], 'y', Math.PI / 2, 0.7, 16)
  pipeGauge(k, [-0.08, yN + dOD / 2, out + 0.12], [1, 0, 0], 25)
  pipeGauge(k, [-0.08, yN + sOD / 2, zSn - 0.08], [1, 0, 0], 10)
  tagPlate(k, p.tag ?? 'FIRE PUMP', [wv * 0.6, ys - r0 * 0.5, r1 * 0.2 + 0.01], [1, 0, 0], 0.16)

  // coupling to the engine flywheel
  const xShaft = -(xb + 0.1)
  const cl = 0.32
  const xF = xShaft - cl
  rotors.push(guardedCoupling(k, xF, xShaft, ys, Math.max(0.18, rsh * 4.2), yk, 'safetyYellow', 150, 0, rsh))
  const zMin = Math.max(-fz0, fz1) + 0.08
  k.box(DARK, [xb * 2 + 0.6, 0.012, 2 * zMin + 0.16], [0, yk - 0.006, 0])
  dieselEngine(k, rotors, { xF, yCr: ys, yk, xs1: xb + 0.35, kw: p.kw, tag: p.tag, zMin, cooling: p.cooling, tap: [0, yN - dOD / 2, zD - flangeLen(p.dischargeNps, p.rating) - 0.08] })
}

const Rshaft = (p: P) => clamp(0.025 + 0.00004 * p.kw, 0.035, 0.07)

// ------------------------------------------------------------------ diesel engine package, everything towards -X of the flywheel flange at xF
interface EngineOpts {
  xF: number
  yCr: number
  /** skid top */
  yk: number
  /** skid end towards +X */
  xs1: number
  kw: number
  tag?: string
  /** minimum half-width of the skid */
  zMin?: number
  cooling: 'heat-exchanger' | 'radiator'
  /** raw-water take-off on the pump discharge (bottom of the pipe) */
  tap: V3
}

function dieselEngine(k: Kit, rotors: RotorSpec[], o: EngineOpts) {
  const { xF, yCr, yk, kw } = o
  const drv = RED
  const ex = EXHAUST()
  const Le = clamp(1.3 + 0.0011 * kw, 1.4, 3.2)
  const We = clamp(0.75 + 0.00028 * kw, 0.8, 1.5)
  const He = clamp(0.9 + 0.0004 * kw, 0.9, 1.8)
  const vee = kw > 1100

  // skid: rails, cross members, drip tray; posts down to the deck when raised
  const zb = Math.max(We / 2 + 0.1, o.zMin ?? 0)
  const xBack = xF - 0.3
  const xFront = xBack - Le
  const xRad = xFront - 0.45
  const xs1 = o.xs1
  const xs0 = xRad - 0.25
  const Lk = xs1 - xs0
  const xm = (xs0 + xs1) / 2
  const hbm = Math.min(0.22, yk - 0.02)
  for (const s of [-1, 1]) {
    const z = s * zb
    k.box(DARK, [Lk, 0.016, 0.16], [xm, yk - 0.008, z])
    k.box(DARK, [Lk, 0.016, 0.16], [xm, yk - hbm + 0.008, z])
    k.box(DARK, [Lk, hbm, 0.012], [xm, yk - hbm / 2, z])
  }
  const nX = Math.max(2, Math.ceil(Lk / 1.2) + 1)
  for (let i = 0; i < nX; i++) k.box(DARK, [0.14, hbm * 0.8, 2 * zb], [xs0 + 0.08 + ((Lk - 0.16) * i) / (nX - 1), yk - hbm / 2, 0])
  k.box(DARK, [Lk - 0.2, 0.008, 2 * zb - 0.1], [xm, yk - hbm + 0.03, 0])
  const yPost = yk - hbm
  const nP = Math.max(2, Math.ceil(Lk / 1.6) + 1)
  for (let i = 0; i < nP; i++) {
    const x = xs0 + 0.1 + ((Lk - 0.2) * i) / (nP - 1)
    for (const s of [-1, 1]) {
      if (yPost > 0.05) {
        k.box(DARK, [0.16, yPost, 0.012], [x, yPost / 2, s * zb])
        k.box(DARK, [0.012, yPost, 0.16], [x - 0.074, yPost / 2, s * zb])
        k.box(DARK, [0.012, yPost, 0.16], [x + 0.074, yPost / 2, s * zb])
        if (i < nP - 1) {
          const x2 = xs0 + 0.1 + ((Lk - 0.2) * (i + 1)) / (nP - 1)
          k.rod('structSteelDark', [x + 0.08, 0.05, s * zb], [x2 - 0.08, yPost - 0.04, s * zb], 0.03, 8)
        }
      } else k.box(DARK, [0.16, Math.max(yPost, 0.001), 0.16], [x, Math.max(yPost, 0.001) / 2, s * zb])
      k.box(DARK, [0.26, 0.02, 0.26], [x, 0.01, s * zb])
      for (const dx of [-0.09, 0.09]) anchorBolt(k, [x + dx, 0.02, s * (zb + 0.09)], 0.018)
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.torus('nut', 0.03, 0.008, [sx > 0 ? xs1 - 0.15 : xs0 + 0.15, yk - hbm * 0.5, sz * (zb + 0.09)], 'z', 6, 14)

  // engine block, sump, crankcase doors, mounts
  const xEm = (xBack + xFront) / 2
  const yBlk0 = yCr - 0.12
  const hBlk = He * 0.62
  const yBT = yBlk0 + hBlk
  k.rbox(drv, [Le, hBlk, We * 0.72], 0.04, [xEm, yBlk0 + hBlk / 2, 0])
  k.rbox(drv, [Le * 0.88, yBlk0 - (yk + 0.06), We * 0.55], 0.03, [xEm, (yBlk0 + yk + 0.06) / 2, 0])
  const nCyl = 6
  const pitch = (Le * 0.9) / nCyl
  for (let i = 0; i < nCyl; i++) {
    const x = xFront + Le * 0.05 + pitch * (i + 0.5)
    for (const s of [-1, 1]) k.rbox(drv, [pitch * 0.6, hBlk * 0.3, 0.02], 0.01, [x, yBlk0 + hBlk * 0.3, s * We * 0.36])
  }
  for (const x of [xFront + 0.2, xBack - 0.2])
    for (const s of [-1, 1]) {
      k.box(drv, [0.16, 0.05, zb - We * 0.36], [x, yBlk0 + 0.06, s * (We * 0.36 + (zb - We * 0.36) / 2)])
      k.cyl('rubberBlack', 0.06, 0.06, [x, yk + 0.03, s * zb], 'y', 16)
      k.box(drv, [0.14, Math.max(0.01, yBlk0 - yk - 0.06), 0.04], [x, (yBlk0 + 0.06 + yk + 0.06) / 2 - 0.03, s * zb])
    }
  // cylinder heads + rocker covers (inline 6, V12 above 1100 kW), injector lines
  const banks = vee ? [{ z: -We * 0.18, tilt: 0.45 }, { z: We * 0.18, tilt: -0.45 }] : [{ z: 0, tilt: 0 }]
  const wHead = vee ? We * 0.32 : We * 0.55
  for (const b of banks) {
    k.at([0, yBT, b.z], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), b.tilt), () => {
      for (let i = 0; i < nCyl; i++) {
        const x = xFront + Le * 0.05 + pitch * (i + 0.5)
        k.rbox(drv, [pitch * 0.94, 0.17, wHead], 0.012, [x, 0.085, 0])
        k.rbox('castIron', [pitch * 0.82, 0.1, wHead * 0.78], 0.035, [x, 0.215, 0])
        for (const dx of [-pitch * 0.25, pitch * 0.25]) k.hex('nut', 0.025, 0.02, [x + dx, 0.275, 0])
        k.tube('tubing', [[x, 0.17, -wHead * 0.5], [x, 0.2, -wHead * 0.62], [xFront + Le * 0.55, 0.0, -wHead * 0.7]], 0.005)
      }
    })
  }
  const yHT = yBT + 0.3
  // exhaust manifold to the turbocharger over the flywheel housing
  const zEx = vee ? 0 : We * 0.38
  const yEx = vee ? yHT + 0.05 : yBT + 0.12
  k.rod(ex, [xFront + 0.1, yEx, zEx], [xBack - 0.35, yEx, zEx], 0.07, 16)
  if (!vee)
    for (let i = 0; i < nCyl; i++) {
      const x = xFront + Le * 0.05 + pitch * (i + 0.5)
      k.rod(ex, [x, yEx, zEx], [x, yEx, wHead * 0.45], 0.045, 10)
    }
  const tx = xBack - 0.38
  const ty = yHT + 0.18
  const tz = vee ? 0 : We * 0.25
  k.rod(ex, [xBack - 0.35, yEx, zEx], [tx, ty - 0.12, tz], 0.07, 12)
  k.cyl(ex, 0.15, 0.16, [tx, ty, tz], 'x', 24)
  k.cyl('flangeSteel', 0.07, 0.12, [tx + 0.13, ty, tz], 'x', 16)
  k.cyl('stainless', 0.14, 0.14, [tx + 0.26, ty, tz], 'x', 24)
  k.spline('rubberBlack', [[tx + 0.34, ty, tz], [tx + 0.45, ty + 0.05, tz - 0.2], [tx + 0.4, ty + 0.05, -We * 0.3]], 0.065, 10, 16)
  k.cyl('castIron', 0.18, 0.45, [tx + 0.35, ty + 0.05, -We * 0.3 - 0.2], 'z', 24)
  k.cyl('rubberBlack', 0.19, 0.04, [tx + 0.35, ty + 0.05, -We * 0.3 - 0.44], 'z', 24)
  k.rbox('castIron', [Le * 0.8, 0.16, 0.14], 0.03, [xEm, yBT - 0.05, -We * 0.42])
  for (let i = 0; i < 3; i++) k.cyl(i < 2 ? 'castIron' : 'stainless', 0.06, 0.24, [xFront + Le * (0.3 + i * 0.1), yBlk0 + hBlk * 0.45, -We * 0.36 - 0.07], 'y', 16)
  k.rbox('castIron', [0.25, 0.18, 0.12], 0.02, [xFront + Le * 0.6, yCr + 0.05, -We * 0.36 - 0.06])
  k.cyl('castIron', 0.085, 0.36, [xBack - 0.05, yCr - 0.12, We * 0.36 + 0.09], 'x', 18)
  k.cyl('castIron', 0.045, 0.14, [xBack - 0.1, yCr - 0.01, We * 0.36 + 0.09], 'x', 12)
  k.cyl('castIron', 0.1, 0.18, [xFront + 0.1, yBT - 0.1, We * 0.3], 'x', 18)
  // flywheel housing (SAE bell) + output flange
  const bell = Math.min(We * 0.42, yCr - yk + 0.05)
  k.cyl(drv, bell, 0.3, [xBack + 0.15, yCr, 0], 'x', 36, Math.min(We * 0.34, bell * 0.85))
  k.cyl('flangeSteel', 0.12, 0.04, [xF, yCr, 0], 'x', 24)
  const yFan = yBlk0 + hBlk * 0.75
  {
    const r = new Kit()
    r.cyl('castIron', 0.13, 0.08, [0, 0, 0], 'x', 24)
    r.box('nut', [0.085, 0.03, 0.02], [-0.002, 0.09, 0])
    rotors.push({ built: r.build(), axis: 'x', pos: [xFront - 0.04, yCr, 0], rpm: 150 })
  }
  for (const z of [-0.02, 0.02]) k.rod('rubberBlack', [xFront - 0.05, yCr + 0.1, z], [xFront - 0.05, yFan - 0.07, z], 0.012, 6)

  if (o.cooling === 'radiator') {
    // radiator with engine-driven pusher fan, header tank, hoses
    const Hr = clamp(yHT - yk, 1.0, 2.2)
    const Wr = We + 0.3
    const yR0 = yk + 0.05
    k.box(CORE(), [0.14, Hr - 0.12, Wr - 0.12], [xRad, yR0 + Hr / 2, 0])
    for (const s of [-1, 1]) {
      k.box(drv, [0.18, Hr, 0.06], [xRad, yR0 + Hr / 2, s * (Wr / 2 - 0.03)])
      k.box(drv, [0.2, 0.08, Wr], [xRad, s > 0 ? yR0 + Hr - 0.04 : yR0 + 0.04, 0])
    }
    const rFan = Math.min(Hr, Wr) * 0.42
    openTube(k, drv, [xRad + 0.08, yFan, 0], [xFront - 0.08, yFan, 0], rFan, 32, rFan * 0.9)
    k.box(drv, [0.02, Hr - 0.1, Wr - 0.1], [xRad + 0.085, yR0 + Hr / 2, 0])
    k.disc(fanGuardMaterial(), rFan * 0.98, [xRad + 0.1, yFan, 0], 'x', 32)
    k.cyl('castIron', 0.06, 0.12, [xFront - 0.14, yFan, 0], 'x', 14)
    {
      const xf = xRad + 0.2
      const r = new Kit()
      fanImpeller(r, 'castIron', rFan * 0.92, { axis: 'x', blades: 6, chord: rFan * 0.32, pitch: 0.36, hub: 0.07, hubLen: 0.08 })
      const xp = xFront - 0.05 - xf
      r.cyl('castIron', 0.09, 0.06, [xp, 0, 0], 'x', 20)
      r.box('nut', [0.065, 0.025, 0.02], [xp, 0.06, 0])
      rotors.push({ built: r.build(), axis: 'x', pos: [xf, yFan, 0], rpm: 195 })
    }
    k.cyl(drv, 0.1, Wr * 0.6, [xRad + 0.02, yR0 + Hr + 0.1, 0], 'z', 18)
    k.cyl('brass', 0.035, 0.05, [xRad + 0.02, yR0 + Hr + 0.21, 0], 'y', 14)
    k.spline('rubberBlack', [[xFront + 0.05, yBT + 0.06, 0], [xFront - 0.15, yBT + 0.15, We * 0.25], [xRad + 0.1, yR0 + Hr - 0.15, We * 0.3]], 0.045, 10, 20)
    k.spline('rubberBlack', [[xFront + 0.05, yCr + 0.05, -We * 0.3], [xFront - 0.15, yCr - 0.05, -We * 0.35], [xRad + 0.1, yR0 + 0.2, -We * 0.3]], 0.045, 10, 20)
    for (const s of [-1, 1]) k.box(drv, [0.3, 0.05, 0.12], [xRad, yk + 0.025, s * (Wr / 2 - 0.08)])
  } else heatExchangerCooling(k, o, { xFront, xBack, xEm, yBT, yCr, zb, We })

  // exhaust: bellows, residential silencer on supports, tail pipe with rain flap
  const rSil = clamp(0.16 + 0.00008 * kw, 0.18, 0.35)
  const LSil = clamp(Le * 0.85, 1.0, 2.6)
  const ySil = yHT + 0.55 + rSil
  const zSil = zb * 0.55
  const xSil1 = xBack - 0.3
  const xSil0 = xSil1 - LSil
  k.cyl(ex, 0.09, 0.2, [tx, ty + 0.25, tz], 'y', 16)
  for (let i = 0; i < 5; i++) k.torus('stainless', 0.1, 0.012, [tx, ty + 0.38 + i * 0.03, tz], 'y', 6, 20)
  k.tube(ex, [[tx, ty + 0.36, tz], [tx, ty + 0.55, tz], [tx, ySil - rSil * 0.5, zSil]], 0.085, 14)
  k.cyl(ex, rSil, LSil - 0.12, [(xSil0 + xSil1) / 2, ySil, zSil], 'x', 32)
  for (const [x, s] of [[xSil0 + 0.06, -1], [xSil1 - 0.06, 1]] as [number, number][]) {
    k.dome(ex, rSil, [x, ySil, zSil], s > 0 ? 'x' : '-x', Math.PI / 2, 0.4, 32)
    annulus(k, ex, rSil, rSil + 0.012, -0.02, 0.02, [x, ySil, zSil], 'x', 32)
  }
  const yTail = ySil + rSil + 1.0
  k.rod(ex, [xSil0 + 0.25, ySil, zSil], [xSil0 + 0.25, yTail, zSil], 0.09, 18)
  k.box(ex, [0.26, 0.012, 0.22], [xSil0 + 0.28, yTail + 0.06, zSil], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.5))
  for (const x of [xSil0 + 0.3, xSil1 - 0.3]) {
    k.rod('structSteelDark', [x, yk, zb], [x, ySil - rSil, zb], 0.035, 8)
    k.box('structSteelDark', [0.1, 0.03, zb - zSil + rSil], [x, ySil - rSil - 0.02, (zb + zSil) / 2])
    k.torus('structSteelDark', rSil + 0.012, 0.012, [x, ySil, zSil], 'x', 6, 32, Math.PI)
  }

  // diesel day tank on a bunded stand (-Z): NFPA 20 sizing ~5 L/kW
  const vol = clamp(kw * 0.005, 0.4, 4)
  const Wt = 0.8
  const Ht = 1.0
  const Lt = clamp(vol / (Wt * Ht), 0.7, 2.6)
  const xt = xEm
  const zt = -(zb + 0.35 + Wt / 2)
  const yt0 = 0.5
  k.box(DARK, [Lt + 0.3, 0.02, Wt + 0.3], [xt, 0.01, zt])
  for (const s of [-1, 1]) {
    k.box(DARK, [Lt + 0.3, 0.15, 0.012], [xt, 0.085, zt + s * (Wt / 2 + 0.15)])
    k.box(DARK, [0.012, 0.15, Wt + 0.3], [xt + s * (Lt / 2 + 0.15), 0.085, zt])
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(DARK, [0.08, yt0, 0.08], [xt + sx * (Lt / 2 - 0.06), yt0 / 2, zt + sz * (Wt / 2 - 0.06)])
  k.rbox(drv, [Lt, Ht, Wt], 0.03, [xt, yt0 + Ht / 2, zt])
  const nR = Math.round(Lt / 0.5)
  for (let i = 1; i < nR; i++) k.box(drv, [0.04, Ht - 0.1, 0.012], [xt - Lt / 2 + (i * Lt) / nR, yt0 + Ht / 2, zt - Wt / 2 - 0.006])
  const xsg = xt + Lt / 2 + 0.05
  k.rod('glass', [xsg, yt0 + 0.1, zt], [xsg, yt0 + Ht - 0.1, zt], 0.016, 10)
  for (const y of [yt0 + 0.1, yt0 + Ht - 0.1]) k.rod('brass', [xt + Lt / 2, y, zt], [xsg, y, zt], 0.014, 8)
  k.tube('tubing', [[xt - Lt * 0.3, yt0 + Ht, zt], [xt - Lt * 0.3, yt0 + Ht + 0.9, zt], [xt - Lt * 0.3 + 0.12, yt0 + Ht + 0.9, zt], [xt - Lt * 0.3 + 0.12, yt0 + Ht + 0.75, zt]], 0.025, 10, 0.06)
  k.cyl('castIron', 0.045, 0.1, [xt - Lt * 0.3 + 0.12, yt0 + Ht + 0.72, zt], 'y', 12)
  k.cyl('castIron', 0.06, 0.06, [xt + Lt * 0.25, yt0 + Ht + 0.03, zt], 'y', 16)
  k.box('valveBody', [0.08, 0.08, 0.08], [xt + Lt * 0.4, yt0 - 0.06, zt])
  k.tube('tubing', [[xt + Lt * 0.3, yt0 + 0.08, zt + Wt / 2], [xt + Lt * 0.3, yt0 + 0.08, -zb + 0.05], [xFront + Le * 0.6, yCr + 0.05, -We * 0.42]], 0.012)
  k.tube('tubing', [[xFront + Le * 0.5, yBT - 0.15, -We * 0.42], [xt - Lt * 0.2, yBT - 0.15, -zb], [xt - Lt * 0.2, yt0 + Ht + 0.05, zt + Wt * 0.3], [xt - Lt * 0.2, yt0 + Ht, zt + Wt * 0.3]], 0.01)
  tagPlate(k, 'DIESEL', [xt, yt0 + Ht * 0.6, zt + Wt / 2 + 0.003], 'z', 0.2)

  // starter batteries A + B on a rack (+Z, by the starter)
  const zbat = zb + 0.45
  const xbat = xBack - 0.3
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(DARK, [0.05, 0.42, 0.05], [xbat + sx * 0.6, 0.21, zbat + sz * 0.2])
  k.box(DARK, [1.3, 0.03, 0.46], [xbat, 0.42, zbat])
  for (const dx of [-0.31, 0.31]) {
    k.rbox('stainless', [0.56, 0.34, 0.4], 0.015, [xbat + dx, 0.6, zbat])
    k.box('stainless', [0.58, 0.02, 0.42], [xbat + dx, 0.78, zbat])
    for (const vx of [-0.15, 0, 0.15]) k.cyl('rubberBlack', 0.015, 0.03, [xbat + dx + vx, 0.8, zbat], 'y', 8)
    k.spline('cable', [[xbat + dx, 0.79, zbat - 0.15], [xbat + dx * 0.5, 0.95, zbat - 0.3], [xBack - 0.05, yCr - 0.05, We * 0.36 + 0.18]], 0.014, 6, 24)
  }

  // fire pump controller cabinet (+Z, radiator end)
  const xc = xFront + 0.2
  const zc = zb + 0.55
  const Hc = 1.8
  k.box(DARK, [0.86, 0.1, 0.46], [xc, 0.05, zc])
  k.rbox(drv, [0.8, Hc, 0.42], 0.02, [xc, 0.1 + Hc / 2, zc])
  k.box(drv, [0.86, 0.03, 0.5], [xc, 0.1 + Hc + 0.015, zc])
  const fz = zc + 0.212
  k.box('rubberBlack', [0.004, Hc - 0.1, 0.004], [xc, 0.1 + Hc / 2, fz])
  k.box(lcdMaterial(), [0.22, 0.14, 0.006], [xc - 0.18, 0.1 + Hc * 0.72, fz])
  const lamps: MatKey[] = ['safetyGreen', 'actuatorYellow', 'actuatorRed', 'actuatorRed']
  lamps.forEach((m, i) => k.cyl(m, 0.018, 0.02, [xc + 0.08 + i * 0.07, 0.1 + Hc * 0.74, fz + 0.005], 'z', 14))
  k.cyl('handwheel', 0.03, 0.03, [xc + 0.18, 0.1 + Hc * 0.6, fz + 0.01], 'z', 16)
  k.cyl('actuatorRed', 0.035, 0.03, [xc - 0.18, 0.1 + Hc * 0.58, fz + 0.01], 'z', 16)
  for (const dx of [-0.05, 0.05]) k.box('stainless', [0.02, 0.12, 0.03], [xc + dx, 0.1 + Hc * 0.48, fz + 0.012])
  tagPlate(k, 'FIRE PUMP CONTROLLER', [xc, 0.1 + Hc * 0.86, fz + 0.002], 'z', 0.3)
  if (o.tag) tagPlate(k, o.tag, [xc, 0.1 + Hc * 0.93, fz + 0.002], 'z', 0.2)
  k.spline('cable', [[xc, 0.1 + Hc + 0.03, zc - 0.1], [xc + 0.3, 0.1 + Hc + 0.25, zc - 0.3], [xFront + Le * 0.3, yBT + 0.3, We * 0.2]], 0.02, 6, 24)
}

// NFPA 20 heat-exchanger cooling: engine-mounted shell-and-tube cooler with expansion tank, raw water from the pump
// discharge through a duplicated cooling loop (strainer, valves, regulator), discharged to an open waste cone.
function heatExchangerCooling(k: Kit, o: EngineOpts, e: { xFront: number; xBack: number; xEm: number; yBT: number; yCr: number; zb: number; We: number }) {
  const { yk, kw, tap } = o
  const { xFront, xEm, yBT, yCr, zb, We } = e
  const hxR = clamp(0.08 + 0.00006 * kw, 0.09, 0.16)
  const hxL = We * 0.85
  const xh = xFront - hxR - 0.06
  const yh = yBT - 0.1
  k.cyl('castIron', hxR, hxL, [xh, yh, 0], 'z', 24)
  for (const s of [-1, 1]) {
    k.cyl('castIron', hxR * 1.15, 0.03, [xh, yh, s * (hxL / 2 + 0.015)], 'z', 24)
    k.dome('castIron', hxR, [xh, yh, s * (hxL / 2 + 0.03)], s > 0 ? 'z' : '-z', Math.PI / 2, 0.4, 24)
  }
  for (const s of [-1, 1]) k.box(RED, [0.06, yh - yk - hxR, 0.06], [xh, (yh - hxR + yk) / 2, s * hxL * 0.35])
  k.cyl(RED, 0.1, We * 0.5, [xh + 0.05, yh + hxR + 0.16, 0], 'z', 18)
  k.cyl('brass', 0.03, 0.05, [xh + 0.05, yh + hxR + 0.28, 0], 'y', 14)
  k.rod(RED, [xh + 0.05, yh + hxR, 0], [xh + 0.05, yh + hxR + 0.07, 0], 0.03, 10)
  k.spline('rubberBlack', [[xFront + 0.02, yBT + 0.05, We * 0.2], [xh + 0.1, yh + hxR * 0.6, We * 0.25], [xh, yh + hxR * 0.8, hxL * 0.3]], 0.035, 10, 16)
  k.spline('rubberBlack', [[xh, yh - hxR * 0.8, -hxL * 0.3], [xh + 0.1, yCr - 0.05, -We * 0.25], [xFront + 0.02, yCr - 0.05, -We * 0.2]], 0.035, 10, 16)
  // raw-water connections on the end bonnets
  const zi = -(hxL / 2 + 0.04)
  const zo = hxL / 2 + 0.04
  // cooling loop on the -Z side: two parallel lines (normal + bypass), each valve - strainer - regulator - valve
  const zl = -(zb + 0.12)
  const xl0 = xEm - 0.55
  const xl1 = xEm + 0.55
  const yl = [yk + 0.32, yk + 0.6]
  const r = 0.02
  for (const x of [xl0 + 0.05, xl1 - 0.05]) {
    k.rod('structSteelDark', [x, 0, zl - 0.06], [x, yl[1] + 0.05, zl - 0.06], 0.018, 8)
    k.box('structSteelDark', [0.1, 0.01, 0.1], [x, 0.005, zl - 0.06])
    for (const y of yl) k.box('structSteelDark', [0.04, 0.02, 0.07], [x, y - r - 0.01, zl - 0.03])
  }
  for (const y of yl) {
    k.rod('tubing', [xl0, y, zl], [xl1, y, zl], r, 10)
    smallValve(k, [xl0 + 0.18, y, zl], 0.9)
    k.rod('castIron', [xl0 + 0.36, y, zl], [xl0 + 0.42, y - 0.08, zl], 0.03, 12)
    k.cyl('castIron', 0.035, 0.08, [xEm + 0.12, y, zl], 'x', 14)
    k.dome('castIron', 0.04, [xEm + 0.12, y + 0.03, zl], 'y', Math.PI / 2, 1.2, 14)
    k.cyl('brass', 0.01, 0.06, [xEm + 0.12, y + 0.09, zl], 'y', 8)
    smallValve(k, [xl1 - 0.18, y, zl], 0.9)
  }
  for (const x of [xl0, xl1]) k.rod('tubing', [x, yl[0], zl], [x, yl[1], zl], r, 10)
  k.box('actuatorRed', [0.06, 0.06, 0.06], [xEm - 0.12, yl[0] + 0.05, zl])
  pipeGauge(k, [xl1 - 0.06, yl[1] + r, zl], [0, 0, -1], 10, 0.07)
  // supply from the pump discharge, along the deck, up into the loop; loop out to the exchanger
  const yd = 0.06
  k.tube('tubing', [tap, [tap[0], tap[1], tap[2] - 0.1], [tap[0], yd, tap[2] - 0.1], [tap[0], yd, zl], [xl1, yd, zl], [xl1, yl[0], zl]], r, 10, 0.06)
  k.tube('tubing', [[xl0, yl[1], zl], [xl0, yh, zl], [xh, yh, zl], [xh, yh, zi]], r, 10, 0.06)
  // exchanger out to a waste cone (open, visible drain) beside the skid
  const xw = xh + 0.05
  const zw = zb + 0.3
  k.tube('tubing', [[xh, yh, zo], [xh, yh, zw], [xw, yh, zw], [xw, 0.42, zw]], r, 10, 0.06)
  k.lathe('stainless', [[0.03, 0.06], [0.11, 0.3], [0.112, 0.3], [0.032, 0.06], [0.03, 0.06]], [xw, 0, zw], 'y', 24)
  k.cyl('stainless', 0.03, 0.06, [xw, 0.03, zw], 'y', 14)
}
