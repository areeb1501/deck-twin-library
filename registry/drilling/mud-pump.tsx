// Drilling mud pump package (API 7K): horizontal single-acting triplex / multiplex, forged fluid end, twin top-mounted AC motors, belt or gear drive.
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Kit, type Built, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { blindFlange, flange, gauge, junctionBox, motor, motorSize, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, fanRotor, type RotorSpec } from '../lib/rotors'
import { meshGuardMaterial } from '../lib/textures'
import { pipeOD, pipeWall, type Rating } from '../lib/standards'
import { atZ, hammerCap, hullBand, hullFace, needleValve } from './_drill'

export interface MudPumpProps {
  /** pumping cylinders (3 = triplex) */
  cylinders?: number
  /** input power per AC motor, kW */
  kw?: number
  drive?: 'belt' | 'gear'
  suctionNps?: number
  dischargeNps?: number
  dischargeRating?: Rating
  /** pump paint */
  color?: string
  tag?: string
  /** turn the drive and stroke the pony rods */
  running?: boolean
}

export const defaults = {
  cylinders: 3,
  kw: 860,
  drive: 'belt' as 'belt' | 'gear',
  suctionNps: 10,
  dischargeNps: 5,
  dischargeRating: 2500 as Rating,
  color: '#35608c',
  tag: 'P-3101A',
  running: true,
}

type P = typeof defaults

// typical 14" stroke / 2200 hp class: 5.5 m over skids, discharge CL 1.25 m, suction CL 0.5 m
function layout(p: Omit<P, 'tag' | 'running' | 'color'>) {
  const n = Math.max(3, Math.min(6, Math.round(p.cylinders)))
  const pitch = 0.56
  const span = (n - 1) * pitch
  const pw = span + 0.7
  const L = 5.54 + Math.max(0, n - 3) * 0.1
  const W = Math.max(2.31, pw + 0.5)
  const yb = 0.248
  const yc = 0.94
  const yd = 1.251
  const ys = 0.505
  const xFe = 1.65
  const xFf = 2.4
  const xV = 2.1
  const xD = 1.83
  const zEnd = span / 2 + pitch / 2
  const zX = zEnd + 0.3
  const crossH = 0.3
  const dOut: V3 = [xD, yd, zX + crossH / 2 + 0.36]
  const sIn: V3 = [xV, ys, -(zEnd + 0.55)]
  const rv: V3 = [1.42, yd + 0.42, zX + 0.42]
  return { n, pitch, span, pw, L, W, yb, yc, yd, ys, xFe, xFf, xV, xD, zEnd, zX, crossH, dOut, sIn, rv }
}

export function ports(props: MudPumpProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [
    port('suction', 'Suction', l.sIn, [0, 0, -1], p.suctionNps, 150),
    port('discharge', 'Discharge', l.dOut, [0, 0, 1], p.dischargeNps, p.dischargeRating),
    port('relief', 'Relief valve outlet', l.rv, [0, 0, 1], 3, 150, 'relief'),
  ]
}

export function MudPump({ tag = defaults.tag, ...rest }: MudPumpProps & GroupProps) {
  const { cylinders, kw, drive, suctionNps, dischargeNps, dischargeRating, color, running, ...group } = { ...defaults, ...rest }
  const out = useMemo(
    () => build({ cylinders, kw, drive, suctionNps, dischargeNps, dischargeRating, color, tag, running }),
    [cylinders, kw, drive, suctionNps, dischargeNps, dischargeRating, color, tag],
  )
  useEffect(() => () => [out.built, out.rod.built, ...out.rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [out])
  return (
    <group {...group}>
      <KitMesh data={out.built} />
      <Rotors rotors={out.rotors} running={running} />
      <Strokes data={out.rod.built} at={out.rod.at} amp={out.rod.amp} running={running} />
    </group>
  )
}

export default MudPump

/** Pony-rod assemblies reciprocating with equal phase spacing. */
function Strokes({ data, at, amp, running }: { data: Built; at: V3[]; amp: number; running: boolean }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!running) return
    t.current += Math.min(dt, 0.1) * Math.PI * 2 * (60 / 60)
    refs.current.forEach((g, i) => g && (g.position.x = amp * Math.sin(t.current + (i * Math.PI * 2) / at.length)))
  })
  return (
    <>
      {at.map((p, i) => (
        <group key={i} position={p}>
          <group ref={(g) => void (refs.current[i] = g)}>
            <KitMesh data={data} shadows={false} />
          </group>
        </group>
      ))}
    </>
  )
}

function build(p: P) {
  const k = new Kit()
  const l = layout(p)
  const { n, pitch, span, pw, L, W, yb, yc, yd, ys, xFe, xFf, xV, xD, zEnd, zX, crossH } = l
  const B: MatKey = paint(p.color)
  const FE: MatKey = paint('#5b6168', { metalness: 0.45, roughness: 0.45 })
  const rotors: RotorSpec[] = []
  const zs = Array.from({ length: n }, (_, i) => -span / 2 + i * pitch)

  // oilfield skid
  k.at([0, 0, 0], undefined, () => skid(k, L, W, 'HEB 240', 'structSteelDark'))

  // power end: crankcase with bull-gear hump (crank CL at xc, yk), flat front deck over the crossheads
  const xc = -1.45
  const yk = 1.25
  const Rg = 0.9
  const a0 = Math.asin((1.62 - yk) / Rg)
  const topY = (x: number) => (x > xc + Rg * Math.cos(a0) ? 1.62 : yk + Math.sqrt(Math.max(0, Rg * Rg - (x - xc) ** 2)))
  const xr = xc - Rg
  const sh = new THREE.Shape()
  sh.moveTo(xr, yb)
  sh.lineTo(0.6, yb)
  sh.lineTo(0.6, 1.62)
  sh.lineTo(xc + Rg * Math.cos(a0), 1.62)
  sh.absarc(xc, yk, Rg, a0, Math.PI, false)
  sh.lineTo(xr, yb)
  k.extrude(B, sh, pw, atZ(-pw / 2), 48)
  // base flange, side ribs and split line
  k.box(B, [0.6 - xr + 0.12, 0.05, pw + 0.12], [(0.6 + xr) / 2, yb + 0.025, 0])
  for (const s of [-1, 1]) {
    for (const x of [-2.1, -1.45, -0.8, 0.1]) k.box(B, [0.04, topY(x) - yb - 0.12, 0.016], [x, (topY(x) + yb) / 2 - 0.05, s * (pw / 2 + 0.008)])
    k.box(B, [0.6 - xr, 0.03, 0.016], [(0.6 + xr) / 2, yk, s * (pw / 2 + 0.008)])
    // crankshaft main bearing cover (flush, under the drive guard)
    k.cyl(B, 0.32, 0.012, [xc, yk, s * (pw / 2 + 0.006)], 'z', 40)
    k.around(10, 0.27, [xc, yk, s * (pw / 2 + 0.014)], 'z', (q) => k.hex('nut', 0.026, 0.006, q, 'z'))
  }
  k.cyl('brass', 0.03, 0.12, [xc - 0.3, topY(xc - 0.3) + 0.05, pw / 2 - 0.25], 'y', 12)
  k.sphere('brass', 0.045, [xc - 0.3, topY(xc - 0.3) + 0.12, pw / 2 - 0.25], undefined, 12)
  // oil level sight glass and drain
  k.cyl('glass', 0.035, 0.012, [0.35, yb + 0.35, pw / 2 + 0.006], 'z', 20)
  k.cyl('brass', 0.045, 0.01, [0.35, yb + 0.35, pw / 2 + 0.003], 'z', 20)
  k.hex('nut', 0.05, 0.03, [xr - 0.015, yb + 0.12, 0], 'x')

  // crosshead extension (nose) with inspection covers, diaphragm stuffing boxes on the front wall
  const xN0 = 0.6
  const xN1 = 1.1
  const hN = 1.45
  k.box(B, [xN1 - xN0, hN - yb, pw - 0.1], [(xN0 + xN1) / 2, (hN + yb) / 2, 0])
  k.box(B, [0.04, hN - yb + 0.04, pw - 0.02], [xN1 - 0.02, (hN + yb) / 2, 0])
  for (const z of zs) {
    k.rbox(B, [0.34, 0.025, pitch * 0.7], 0.01, [(xN0 + xN1) / 2, hN + 0.0125, z])
    k.around(6, 0.16, [(xN0 + xN1) / 2, hN + 0.03, z], 'y', (q) => k.hex('nut', 0.022, 0.014, q, 'y'))
    k.cyl(B, 0.1, 0.06, [xN1 + 0.03, yc, z], 'x', 28)
    k.cyl('stainless', 0.075, 0.03, [xN1 + 0.075, yc, z], 'x', 24)
    k.boltCircle('boltXylan', 'nut', 6, 0.085, [xN1 + 0.02, yc, z], 'x', 0.012, 0.06, [0.05])
  }
  // stay rods (power end to fluid end) and the drip pan under the pony rods
  for (const s of [-1, 1])
    for (const y of [yc - 0.22, yc + 0.22]) {
      k.rod('stainless', [xN1, y, s * (zEnd - 0.06)], [xFe + 0.03, y, s * (zEnd - 0.06)], 0.028, 12)
      k.hex('nut', 0.075, 0.05, [xFe + 0.04, y, s * (zEnd - 0.06)], 'x')
    }
  k.box('stainless', [xFe - xN1, 0.008, pw - 0.15], [(xN1 + xFe) / 2, 0.62, 0])
  for (const s of [-1, 1]) k.box('stainless', [xFe - xN1, 0.08, 0.006], [(xN1 + xFe) / 2, 0.66, s * (pw / 2 - 0.08)])
  k.cyl('stainless', 0.03, 0.3, [(xN1 + xFe) / 2, 0.47, -pw / 2 + 0.2], 'y', 12)
  k.box('structSteelDark', [0.06, 0.62 - yb, 0.06], [(xN1 + xFe) / 2, (0.62 + yb) / 2, pw / 2 - 0.2])

  // liner wash header over the pony rods, nozzle drop per cylinder, supply hose to a skid-edge hose connection
  const yw = yc + 0.34
  const xw = (xN1 + xFe) / 2
  k.pipe('stainless', [xw, yw, -zEnd], [xw, yw, zEnd], 0.034, 0.003)
  for (const z of zs) k.tube('tubing', [[xw, yw, z], [xw, yc + 0.14, z], [xw + 0.06, yc + 0.1, z]], 0.006)
  for (const s of [-1, 1]) k.box('stainless', [0.04, yw - 1.45 + 0.02, 0.03], [xw, yw - 0.02, s * zEnd * 0.6])
  k.tube('rubberBlack', [[xw, yw, -zEnd], [xw, yw, -zEnd - 0.12], [xw, 0.4, -zEnd - 0.12], [xw, 0.4, -W / 2 + 0.08]], 0.02, 10, 0.12)
  k.cyl('brass', 0.03, 0.08, [xw, 0.4, -W / 2 + 0.06], 'z', 12)

  // fluid end modules: liner retainer, forged block, cylinder head cover (front), valve cover (top), suction boss (below)
  const fy0 = 0.68
  const fy1 = 1.2
  for (const z of zs) {
    k.rbox(FE, [xFf - xFe, fy1 - fy0, pitch - 0.035], 0.03, [(xFe + xFf) / 2, (fy0 + fy1) / 2, z])
    k.cyl(FE, 0.19, 0.07, [xFe - 0.035, yc, z], 'x', 32)
    k.boltCircle('boltXylan', 'nut', 8, 0.155, [xFe - 0.1, yc, z], 'x', 0.022, 0.13, [0.03])
    k.lathe('pipeBore', [[0.085, -0.001], [0, -0.001]], [xFe - 0.07, yc, z], '-x', 24)
    k.cyl(FE, 0.18, 0.1, [xFf + 0.05, yc, z], 'x', 32)
    k.at([xFf + 0.1, yc, z], 'x', () => hammerCap(k, FE, 0.17, 0.11))
    k.at([xV, fy1, z], 'y', () => {
      k.cyl(FE, 0.16, 0.08, [0, 0.04, 0], 'y', 32)
      k.at([0, 0.08, 0], 'y', () => hammerCap(k, FE, 0.15, 0.1))
    })
    k.cyl(FE, 0.13, fy0 - ys, [xV, (fy0 + ys) / 2, z], 'y', 28)
    // suction valve cover access plug on the outboard face
    k.cyl(FE, 0.03, 0.02, [xFf - 0.15, fy0 + 0.08, z + pitch / 2 - 0.018], 'z', 12)
  }
  // fluid end support legs
  for (const s of [-1, 1]) {
    k.box('structSteelDark', [0.5, fy0 - yb, 0.04], [xFe + 0.3, (fy0 + yb) / 2, s * (zEnd - 0.04)])
    k.box('structSteelDark', [0.6, 0.03, 0.2], [xFe + 0.3, yb + 0.015, s * (zEnd - 0.04)])
  }

  // discharge manifold bar across the module tops, strainer cross at the +Z end
  k.rbox(FE, [0.22, 0.22, zX - (-zEnd) + 0.02], 0.02, [xD, yd, (zX - zEnd) / 2])
  k.rbox(FE, [crossH, crossH, crossH], 0.025, [xD, yd, zX])
  const studs = (c: V3, axis: 'x' | '-x' | 'y' | 'z', R: number) => k.around(8, R, c, axis, (q) => k.hex('nut', 0.04, 0.026, q, axis), Math.PI / 8)
  // strainer access cap (+X)
  k.cyl(FE, 0.13, 0.05, [xD + crossH / 2 + 0.025, yd, zX], 'x', 28)
  k.at([xD + crossH / 2 + 0.05, yd, zX], 'x', () => hammerCap(k, FE, 0.12, 0.09))
  studs([xD + crossH / 2 + 0.01, yd, zX], 'x', 0.12)
  // discharge outlet: spool to the 5" flange (+Z)
  const d = l.dOut
  const fl = flange(k, p.dischargeNps, p.dischargeRating, d, 'z', true)
  k.pipe(FE, [xD, yd, zX + crossH / 2 - 0.01], [xD, yd, d[2] - fl], pipeOD(p.dischargeNps) * 1.25, pipeWall(p.dischargeNps, 'XXS') * 1.4)
  needleValve(k, [xD, yd + pipeOD(p.dischargeNps) * 0.62, (zX + crossH / 2 + d[2] - fl) / 2], 'y')
  gauge(k, [xD, yd + pipeOD(p.dischargeNps) * 0.62 + 0.17, (zX + crossH / 2 + d[2] - fl) / 2], 'x', 0.15, 'bar', 700)
  // pressure transducer on the cross
  k.cyl('stainless', 0.022, 0.12, [xD, yd - crossH / 2 - 0.06, zX], 'y', 12)
  k.rbox('stainless', [0.06, 0.09, 0.06], 0.01, [xD, yd - crossH / 2 - 0.16, zX])
  k.tube('cable', [[xD, yd - crossH / 2 - 0.2, zX], [xD, 0.5, zX], [xD - 0.4, 0.45, zX - 0.1], [xD - 0.4, yb + 0.05, zX - 0.1]], 0.008)

  // bladder pulsation dampener on the cross: neck flange, forged sphere, charging valve + gauge
  const yN = yd + crossH / 2
  const Rs = 0.32
  k.cyl(FE, 0.1, 0.12, [xD, yN + 0.06, zX], 'y', 28)
  k.cyl(FE, 0.19, 0.06, [xD, yN + 0.15, zX], 'y', 36)
  studs([xD, yN + 0.14, zX], 'y', 0.16)
  k.sphere('actuatorRed', Rs, [xD, yN + 0.18 + Rs * 0.92, zX], undefined, 40)
  k.cyl('actuatorRed', Rs * 0.55, 0.08, [xD, yN + 0.18 + 0.04, zX], 'y', 28)
  const yTop = yN + 0.18 + Rs * 1.92
  k.cyl(FE, 0.06, 0.06, [xD, yTop, zX], 'y', 20)
  k.cyl('brass', 0.015, 0.06, [xD, yTop + 0.06, zX], 'y', 10)
  gauge(k, [xD + 0.08, yTop + 0.06, zX], 'x', 0.1, 'bar', 200)
  k.rod('stainless', [xD, yTop + 0.06, zX], [xD + 0.08, yTop + 0.06, zX], 0.008, 8)
  tagPlate(k, 'N₂ PRECHARGE', [xD, yN + 0.18 + Rs * 0.92, zX + Rs + 0.002], 'z', 0.16)

  // reset relief valve on the cross (-X branch), discharge up and over to a flanged outlet
  const xb = xD - crossH / 2
  const xr0 = 1.42
  k.pipe(FE, [xb + 0.01, yd, zX], [xr0 + 0.06, yd, zX], 0.11, 0.025)
  k.cyl(FE, 0.09, 0.05, [xr0 + 0.08, yd, zX], 'x', 24)
  k.rbox('actuatorRed', [0.16, 0.24, 0.16], 0.02, [xr0, yd + 0.04, zX])
  k.cyl('actuatorRed', 0.06, 0.24, [xr0, yd + 0.28, zX], 'y', 20)
  k.rod('stainless', [xr0, yd + 0.4, zX], [xr0 - 0.22, yd + 0.48, zX], 0.012, 8)
  k.cyl('safetyYellow', 0.02, 0.06, [xr0 - 0.22, yd + 0.48, zX], 'z', 10)
  const rv = l.rv
  const rfl = flange(k, 3, 150, rv, 'z', true)
  k.tube(FE, [[xr0, yd + 0.04, zX + 0.08], [xr0, yd + 0.04, zX + 0.18], [xr0, rv[1], zX + 0.18], [xr0, rv[1], rv[2] - rfl]], pipeOD(3) / 2, 16, 0.12)

  // suction manifold under the modules: hollow 10" header, blind end, suction flange (-Z), saddles
  const sOD = pipeOD(p.suctionNps)
  const s = l.sIn
  const sfl = flange(k, p.suctionNps, 150, s, '-z', true)
  const bf: V3 = [xV, ys, zEnd + 0.28]
  const bfl = flange(k, p.suctionNps, 150, bf, 'z')
  blindFlange(k, p.suctionNps, 150, bf, 'z')
  k.pipe(FE, [xV, ys, bf[2] - bfl], [xV, ys, s[2] + sfl], sOD, pipeWall(p.suctionNps, 'STD'))
  for (const z of [-zEnd + 0.1, zEnd - 0.1]) {
    k.box('structSteelDark', [0.2, ys - sOD / 2 - yb, 0.03], [xV, (ys - sOD / 2 + yb) / 2, z])
    k.box('structSteelDark', [0.3, 0.02, 0.12], [xV, yb + 0.01, z])
  }
  // priming vent on the manifold top at the inlet end
  needleValve(k, [xV, ys + sOD / 2 - 0.005, -zEnd - 0.22], 'y')

  // AC drilling motors on a fabricated deck over the crankcase, each driving one end of the pinion shaft
  const m = motorSize(p.kw, 6)
  const Rm = Math.max(0.36, m.R)
  const Lm = Math.max(1.5, m.L)
  const Hm = Math.max(0.45, Rm + 0.08)
  const yDeck = 2.25
  const ym = yDeck + Hm
  const xPin = -0.65
  const yPin = 1.0
  const motors = [
    { x: -1.6, s: -1 },
    { x: -0.35, s: 1 },
  ]
  k.box('structSteelDark', [2.6, 0.04, pw - 0.1], [-0.95, yDeck - 0.02, 0])
  for (const x of [-2.2, -1.5, -0.8, -0.05, 0.3])
    for (const sz of [-1, 1]) {
      const yt = topY(x)
      k.box('structSteelDark', [0.16, yDeck - 0.04 - yt + 0.02, 0.16], [x, (yDeck - 0.04 + yt) / 2, sz * (pw / 2 - 0.2)])
    }
  const gW = 0.22
  const zG0 = pw / 2 + 0.02
  for (const mo of motors) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-mo.s * Math.PI) / 2)
    const zFace = mo.s * (pw / 2 - 0.02)
    k.with(new THREE.Matrix4().compose(new THREE.Vector3(mo.x, ym, zFace), q, new THREE.Vector3(1, 1, 1)), () => motor(k, { R: Rm, L: Lm, H: Hm, tbox: 'top', mat: 'motorPaint', cable: false }))
    // force-ventilation blower on the non-drive end
    const zB = zFace - mo.s * Lm * 0.82
    k.rbox('motorPaint', [0.5, 0.36, 0.42], 0.03, [mo.x, ym + Rm + 0.26, zB])
    k.cyl('motorPaint', 0.11, 0.3, [mo.x + 0.32, ym + Rm + 0.26, zB], 'x', 24)
    k.box('motorPaint', [0.3, Rm * 0.3, 0.3], [mo.x, ym + Rm + 0.03, zB])
    k.disc('rubberBlack', 0.13, [mo.x - 0.252, ym + Rm + 0.26, zB], '-x', 24)
    // power cables down to a junction box on the deck
    const xj = mo.x + mo.s * (Rm + 0.22)
    junctionBox(k, [xj, yDeck, zFace - mo.s * 0.5], 'y', [0.3, 0.3, 0.16], 'stainless')
    k.spline('cable', [[mo.x, ym + Rm + 0.3, zFace - mo.s * Lm * 0.4], [mo.x + mo.s * Rm * 0.9, ym + Rm * 0.5, zFace - mo.s * 0.45], [xj, yDeck + 0.2, zFace - mo.s * 0.5]], 0.025, 8, 24)
    const zg = mo.s * zG0
    const zS = mo.s * (zG0 + gW / 2)
    const rM = 0.19
    const rP = 0.6
    if (p.drive === 'belt') {
      // multi-groove sheaves turning inside an expanded-mesh guard, banded V-belt set
      const sheave = (r: number, w: number) => {
        const kk = new Kit()
        const prof: [number, number][] = [[r * 0.25, -w / 2], [r, -w / 2]]
        const g = 5
        for (let i = 0; i < g; i++) {
          const y0 = -w / 2 + (w * (i + 0.15)) / g
          const y1 = -w / 2 + (w * (i + 0.85)) / g
          prof.push([r, y0], [r - 0.025, (y0 + y1) / 2], [r, y1])
        }
        prof.push([r, w / 2], [r * 0.25, w / 2])
        kk.lathe('castIron', prof, [0, 0, 0], 'y', 48)
        kk.cyl('castIron', r * 0.85, w * 0.35, [0, 0, 0], 'y', 40)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          kk.box('castIron', [r * 0.6, w * 0.3, 0.05], [Math.cos(a) * r * 0.55, 0, Math.sin(a) * r * 0.55], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
        }
        kk.cyl('stainless', r * 0.22, w * 1.1, [0, 0, 0], 'y', 24)
        kk.box('safetyYellow', [r * 0.3, w * 0.36, 0.03], [r * 0.6, 0, 0])
        return kk.build()
      }
      const wrap = (built: Built, x: number, y: number, rpm: number): RotorSpec => ({ built, axis: 'y', pos: [x, y, zS], rot: [Math.PI / 2, 0, 0], rpm })
      rotors.push(wrap(sheave(rM, 0.13), mo.x, ym, 180), wrap(sheave(rP, 0.13), xPin, yPin, 57))
      hullBand(k, 'rubberBlack', [[xPin, yPin, rP - 0.012], [mo.x, ym, rM - 0.012]], zS - 0.05, 0.1, 0.018)
      const gc: [number, number, number][] = [[xPin, yPin, rP + 0.08], [mo.x, ym, rM + 0.08]]
      hullBand(k, 'safetyYellow', gc, mo.s > 0 ? zg : zg - gW, gW, 0.02)
      k.add(meshGuardMaterial(), hullFace(gc, mo.s * (zG0 + gW), mo.s < 0, 8))
      k.add('safetyYellow', hullFace(gc, zg, mo.s > 0))
    } else {
      // enclosed gear drive: cast case over input pinion and output gear, ribs, breather, oil level gauge
      const gc: [number, number, number][] = [[xPin, yPin, rP + 0.05], [mo.x, ym, rM + 0.12]]
      hullBand(k, 'motorPaint', gc, mo.s > 0 ? zg : zg - gW - 0.08, gW + 0.08, 0.03)
      k.add('motorPaint', hullFace(gc, mo.s * (zG0 + gW + 0.08), mo.s < 0))
      k.add('motorPaint', hullFace(gc, zg, mo.s > 0))
      const ribs = 5
      for (let i = 1; i < ribs; i++) {
        const t = i / ribs
        k.box('motorPaint', [0.04, 0.04, gW + 0.12], [xPin + (mo.x - xPin) * t, yPin + (ym - yPin) * t, mo.s * (zG0 + (gW + 0.08) / 2)])
      }
      k.cyl('brass', 0.025, 0.1, [mo.x, ym + rM + 0.17, mo.s * (zG0 + gW / 2)], 'y', 10)
      k.cyl('glass', 0.03, 0.01, [xPin, yPin - 0.2, mo.s * (zG0 + gW + 0.085)], 'z', 16)
      k.cyl('motorPaint', rP * 0.4, 0.04, [xPin, yPin, mo.s * (zG0 + gW + 0.1)], 'z', 32)
    }
    // motor cooling fan behind the cowl
    rotors.push(fanRotor('flangeSteel', Rm * 0.85, [mo.x, ym, zFace - mo.s * (Lm + Math.max(0.12, Rm * 0.6) - 0.01)], 'z', 300, { blades: 7, thick: 0.004, pitch: 0.12, hub: Rm * 0.2, hubLen: 0.016 }))
  }
  // pinion shaft bearing caps (visible inside the guards)
  for (const s of [-1, 1]) k.cyl(B, 0.17, 0.04, [xPin, yPin, s * (pw / 2 + 0.01)], 'z', 28)

  // lube oil system at the rear: motor-pump set, duplex filter, cooler tubing into the crankcase
  const lm = motorSize(5.5, 4)
  const xl = xr - 0.22
  k.with(new THREE.Matrix4().compose(new THREE.Vector3(xl, yb + lm.H, -0.2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2), new THREE.Vector3(1, 1, 1)), () =>
    motor(k, { R: lm.R, L: lm.L, H: lm.H, tbox: 'top' }),
  )
  k.cyl('castIron', 0.07, 0.14, [xl, yb + lm.H, -0.2 - 0.09], 'z', 20)
  for (const dz of [0.35, 0.55]) {
    k.cyl('stainless', 0.07, 0.36, [xl, yb + 0.2, dz], 'y', 24)
    k.dome('stainless', 0.07, [xl, yb + 0.38, dz], 'y', Math.PI / 2, 0.4)
  }
  k.tube('tubing', [[xl, yb + lm.H, -0.36], [xl, yb + 0.55, -0.36], [xl, yb + 0.55, 0.35], [xl, yb + 0.4, 0.35]], 0.014)
  k.tube('tubing', [[xl, yb + 0.38, 0.55], [xl, yb + 0.6, 0.55], [xr + 0.01, yb + 0.6, 0.55]], 0.014)

  // nameplates, tag, earth boss
  k.box('nameplate', [0.3, 0.18, 0.004], [0.3, 1.3, pw / 2 + 0.002])
  tagPlate(k, p.tag, [-L / 2 + 0.7, 0.13, W / 2 + 0.002], 'z', 0.32)
  tagPlate(k, p.tag, [-0.4, 0.13, -W / 2 - 0.002], '-z', 0.32)
  k.cyl('brass', 0.015, 0.03, [-L / 2 + 0.3, 0.13, W / 2 + 0.015], 'z', 10)

  // reciprocating pony rod + clamp, local frame centred on the stroke mid-point
  const rk = new Kit()
  const rodL = xFe - 0.07 - xN1 - 0.09 + 0.24
  rk.cyl('stainless', 0.045, rodL, [0, 0, 0], 'x', 20)
  rk.cyl('castIron', 0.075, 0.1, [0, 0, 0], 'x', 24)
  for (const s of [-1, 1]) {
    rk.box('castIron', [0.08, 0.04, 0.05], [0, s * 0.085, 0])
    rk.rod('boltXylan', [0, s * 0.085, -0.05], [0, s * 0.085, 0.05], 0.01, 6)
  }
  const xm = (xN1 + 0.09 + xFe - 0.07) / 2
  return { built: k.build(), rotors, rod: { built: rk.build(), at: zs.map((z) => [xm, yc, z] as V3), amp: 0.1 } }
}
