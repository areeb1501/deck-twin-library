// API 618 balanced-opposed reciprocating compressor: frame with 2/4/6 throws, crosshead guides, two-compartment distance pieces, cylinders with valve covers, pulsation bottles, flywheel, motor, skid.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { flange, gauge, grating, handrail, junctionBox, motor, motorSize, pipeRun, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, couplingGuardShell, couplingRotor, cowlFan, type RotorSpec } from '../lib/rotors'
import { signMaterial } from '../lib/textures'
import { elbow90, flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { OIL, SKID, annulus, baseFrame, clamp, joint, largeMotor, lineRun, neckTo, runToFlange, teePipe } from './_compressors-kit'

export interface ReciprocatingCompressorProps {
  throws?: 2 | 4 | 6
  /** cylinder bore, m */
  bore?: number
  /** motor rated power, kW */
  kw?: number
  suctionNps?: number
  dischargeNps?: number
  rating?: Rating
  tag?: string
  running?: boolean
}

export const defaults = {
  throws: 4 as 2 | 4 | 6,
  bore: 0.32,
  kw: 1500,
  suctionNps: 8,
  dischargeNps: 6,
  rating: 600 as Rating,
  tag: 'K-3100',
  running: true,
}

type P = typeof defaults

const HS = 0.45
const WALK = 0.8

function layout(p: P) {
  const n = p.throws === 2 || p.throws === 6 ? p.throws : 4
  const bore = clamp(p.bore, 0.1, 0.8)
  const stroke = clamp(0.1 + bore * 0.3, 0.12, 0.3) // typical: 4.5–11 in stroke
  const Dc = bore + 0.36
  const Db = Math.max(clamp(bore * 1.6 + 0.1, 0.4, 1.2), pipeOD(Math.max(p.suctionNps, p.dischargeNps)) * 1.6)
  const yc = HS + Dc / 2 + 0.3 + Db + 0.15
  const npos = n / 2
  const pitch = Math.max(Dc + 0.4, 0.9)
  const Lf = npos * pitch + 0.5
  const Wf = 0.8 + stroke * 2
  const yTop = yc + 0.4 + stroke
  const Lg = 0.45 + stroke
  const Ld = 0.6
  const Lcyl = bore * 0.9 + stroke + 0.35
  const zc0 = Wf / 2 + Lg + Ld
  const zc1 = zc0 + Lcyl
  const zcc = (zc0 + zc1) / 2
  const yS = yc + Dc / 2 + 0.3 + Db / 2
  const yD = yc - Dc / 2 - 0.3 - Db / 2
  const Lb = npos * pitch + 0.3
  const hd = Db / 4
  // motor and flywheel at -X, discharge trunk at +X
  const Rf = Math.min(clamp(0.45 + p.kw / 6000, 0.5, 1.0), yc - HS - 0.12)
  const big = p.kw > 1000
  const ms = motorSize(p.kw, 6)
  const Lm = big ? clamp(1.0 + Math.pow(p.kw, 0.33) * 0.12, 1.8, 3.6) : ms.L
  const mW = big ? clamp(1.0 + p.kw / 4000, 1.1, 2.2) : ms.R * 2
  const xf0 = -Lf / 2
  const xFw = xf0 - 0.45
  const xCpl1 = xFw - 0.3
  const xCpl0 = xCpl1 - 0.45
  const xMotorEnd = xCpl0
  const xM0 = xMotorEnd - (big ? 0.8 + Lm : Lm + 0.25 + Math.max(0.12, ms.R * 0.6))
  const dR = elbow90(p.dischargeNps)
  const xe = Lb / 2 + hd + 0.5 + dR
  const xFace = xe + dR + 0.9
  const x0 = xM0 - 0.4
  const x1 = xFace + 0.15
  const shift = -(x0 + x1) / 2
  const SL = x1 - x0
  const SW = 2 * (zc1 + 0.2 + WALK)
  const yH = yS + Db / 2 + 0.55
  return { n, bore, stroke, Dc, Db, yc, npos, pitch, Lf, Wf, yTop, Lg, Ld, Lcyl, zc0, zc1, zcc, yS, yD, Lb, hd, Rf, big, ms, Lm, mW, xFw, xCpl0, xCpl1, xMotorEnd, xM0, xe, xFace, shift, SL, SW, yH, ySuc: yH + 0.7 }
}

export function ports(props: ReciprocatingCompressorProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  return [
    port('suction', 'Suction', [L.shift, L.ySuc, 0], [0, 1, 0], p.suctionNps, p.rating),
    port('discharge', 'Discharge', [L.xFace + L.shift, L.yD, 0], [1, 0, 0], p.dischargeNps, p.rating),
  ]
}

export function ReciprocatingCompressor(props: ReciprocatingCompressorProps & GroupProps) {
  const { throws, bore, kw, suctionNps, dischargeNps, rating, tag, running, ...group } = { ...defaults, ...props }
  const { built, rotors } = useMemo(() => build({ throws, bore, kw, suctionNps, dischargeNps, rating, tag, running }), [throws, bore, kw, suctionNps, dischargeNps, rating, tag, running])
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default ReciprocatingCompressor

const FRAME: MatKey = 'machineryGreen'
const CYL: MatKey = 'equipmentPaint'
const BOTTLE: MatKey = 'equipmentPaint'

function build(p: P) {
  const k = new Kit()
  const L = layout(p)
  const rotors: RotorSpec[] = []
  k.at([L.shift, 0, 0], undefined, () => draw(k, p, L, rotors))
  for (const r of rotors) r.pos = [r.pos[0] + L.shift, r.pos[1], r.pos[2]]
  return { built: k.build(), rotors }
}

function draw(k: Kit, p: P, L: ReturnType<typeof layout>, rotors: RotorSpec[]) {
  const { yc, Dc, Db, Lf, Wf, yTop, Lg, Ld, Lcyl, zc0, zc1, zcc, yS, yD, Lb, hd, pitch, npos, stroke, SL, SW } = L
  const hs = HS
  const cx = -L.shift
  k.at([cx, 0, 0], undefined, () => baseFrame(k, SL, SW, hs))

  // walkways along both long edges
  const wx0 = cx - SL / 2
  for (const sz of [-1, 1]) {
    const zw = sz * (SW / 2 - WALK / 2)
    const nG = Math.max(2, Math.round(SL / 2))
    for (let i = 0; i < nG; i++) grating(k, [wx0 + (SL * (i + 0.5)) / nG, hs + 0.03, zw], SL / nG - 0.01, WALK - 0.02)
    handrail(k, [[wx0 + 0.03, hs + 0.03, sz * (SW / 2 - 0.03)], [cx - 0.6, hs + 0.03, sz * (SW / 2 - 0.03)]])
    handrail(k, [[cx + 0.6, hs + 0.03, sz * (SW / 2 - 0.03)], [wx0 + SL - 0.03, hs + 0.03, sz * (SW / 2 - 0.03)]])
    for (let j = 0; j < 2; j++) k.box('walkwayPaint', [1.0, 0.03, 0.25], [cx, hs - (j + 1) * (hs / 3), sz * (SW / 2 + 0.13 + j * 0.25)])
    for (const sx of [-1, 1]) k.box('structSteel', [0.012, hs, 0.55], [cx + sx * 0.5, hs / 2, sz * (SW / 2 + 0.27)])
  }

  // crankcase frame: body, top covers per throw, crankshaft end, breather, oil filler, foundation feet
  // fabricated pedestal under the crankcase (sole plates on top, stiffeners)
  const yFb = Math.max(hs + 0.12, yc - 0.5 - stroke * 1.5)
  const fH = yTop - yFb
  k.box(SKID, [Lf + 0.3, 0.06, Wf + 0.3], [0, hs + 0.03, 0])
  k.box(SKID, [Lf * 0.96, yFb - hs - 0.06, Wf * 0.86], [0, (yFb + hs + 0.06) / 2, 0])
  k.box(SKID, [Lf + 0.1, 0.05, Wf + 0.1], [0, yFb - 0.025, 0])
  for (let i = 0; i <= npos * 2; i++)
    for (const s of [-1, 1]) k.box(SKID, [0.025, yFb - hs - 0.11, 0.1], [-Lf * 0.46 + (i * Lf * 0.92) / (npos * 2), (yFb + hs) / 2, s * (Wf * 0.43 + 0.05)])
  k.rbox(FRAME, [Lf, fH, Wf], 0.05, [0, yFb + fH / 2, 0])
  for (let i = 0; i < npos; i++) {
    const x = -Lf / 2 + 0.25 + pitch * (i + 0.5)
    k.rbox(FRAME, [pitch * 0.7, 0.05, Wf * 0.7], 0.02, [x, yTop + 0.025, 0])
    k.around(10, Math.min(pitch, Wf) * 0.3, [x, yTop + 0.055, 0], 'y', (q) => k.hex('nut', 0.03, 0.015, q))
    for (const s of [-1, 1]) k.box(FRAME, [0.06, fH - 0.1, 0.04], [x - pitch / 2, yFb + fH / 2, s * (Wf / 2 + 0.02)])
  }
  for (const s of [-1, 1]) k.box(FRAME, [0.08, fH + 0.04, Wf + 0.1], [s * (Lf / 2 - 0.04), yFb + fH / 2, 0])
  k.cyl(FRAME, 0.3, 0.12, [-Lf / 2 - 0.06, yc, 0], 'x', 32)
  k.cyl('stainless', 0.11, 0.4, [-Lf / 2 - 0.25, yc, 0], 'x', 20)
  k.rod('flangeSteel', [Lf * 0.3, yTop, Wf * 0.3], [Lf * 0.3, yTop + 0.15, Wf * 0.3], 0.025, 10)
  k.cyl(OIL, 0.08, 0.2, [Lf * 0.3, yTop + 0.25, Wf * 0.3], 'y', 18)
  k.dome(OIL, 0.08, [Lf * 0.3, yTop + 0.35, Wf * 0.3], 'y', Math.PI / 2, 0.5, 14)
  tagPlate(k, 'BREATHER', [Lf * 0.3, yTop + 0.25, Wf * 0.3 + 0.081], 'z', 0.1)
  k.cyl('brass', 0.035, 0.1, [-Lf * 0.3, yTop + 0.05, -Wf * 0.3], 'y', 12)
  k.box('nameplate', [0.4, 0.25, 0.01], [-Lf / 2 - 0.001, yTop - 0.3, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2))
  // auxiliary end (+X): frame-driven oil pump, duplex oil filter, oil cooler
  const xa = Lf / 2 + 0.06
  k.cyl(OIL, 0.18, 0.25, [xa + 0.12, yc - 0.15, 0], 'x', 24)
  for (const s of [-1, 1]) {
    k.cyl(OIL, 0.08, 0.5, [xa + 0.35, hs + 0.5, s * 0.22], 'y', 18)
    k.dome(OIL, 0.08, [xa + 0.35, hs + 0.75, s * 0.22], 'y', Math.PI / 2, 0.5, 14)
  }
  k.cyl(OIL, 0.13, Wf * 0.8, [xa + 0.35, yc - 0.15, 0], 'z', 24)
  for (const s of [-1, 1]) k.cyl(OIL, 0.16, 0.05, [xa + 0.35, yc - 0.15, s * Wf * 0.4], 'z', 24)
  lineRun(k, [[xa + 0.25, yc - 0.15, 0], [xa + 0.35, yc - 0.15 - 0.13, 0]], 1.5, OIL)
  gauge(k, [xa + 0.5, yc + 0.2, 0], 'x', 0.1, 'bar', 10)
  // force-feed cylinder lubricator with tubing to each cylinder
  k.rbox('actuatorRed', [0.35, 0.3, 0.25], 0.02, [-Lf / 2 + 0.3, yTop + 0.15, -Wf * 0.25])

  // throws: crosshead guide, distance piece, cylinder with valve covers, nozzles to the bottles
  const zDp = Wf / 2 + Lg
  const rg = 0.24 + stroke * 0.3
  const rd = Math.min(Dc * 0.4, rg)
  const rv = clamp(p.bore * 0.22, 0.07, 0.15)
  const nN = Math.min(p.suctionNps, Math.max(3, Math.round(p.bore * 20)))
  for (let i = 0; i < npos; i++) {
    const x = -Lf / 2 + 0.25 + pitch * (i + 0.5)
    for (const s of [-1, 1]) {
      const z = (v: number) => s * v
      const ax: V3 = [0, 0, s]
      // crosshead guide bolted to the frame
      k.cyl(FRAME, rg + 0.06, 0.05, [x, yc, z(Wf / 2 + 0.025)], ax, 32)
      k.cyl(FRAME, rg, Lg, [x, yc, z(Wf / 2 + Lg / 2)], ax, 32)
      k.cyl(FRAME, rg + 0.06, 0.05, [x, yc, z(zDp - 0.025)], ax, 32)
      k.boltCircle('boltXylan', 'nut', 12, rg + 0.03, [x, yc, z(zDp - 0.07)], ax, 0.016, 0.08, [0.06])
      k.rbox(FRAME, [0.18, 0.18, Lg * 0.6], 0.02, [x, yc + rg, z(Wf / 2 + Lg / 2)])
      // two-compartment distance piece with access covers and a vent
      k.rbox(CYL, [rd * 2, rd * 2, Ld], 0.04, [x, yc, z(zDp + Ld / 2)])
      k.box(CYL, [rd * 2 + 0.08, rd * 2 + 0.08, 0.04], [x, yc, z(zDp + Ld / 2)])
      for (const f of [0.25, 0.75])
        for (const sx of [-1, 1]) {
          k.box(CYL, [0.02, rd * 1.3, Ld * 0.35], [x + sx * (rd + 0.01), yc, z(zDp + Ld * f)])
          k.around(6, rd * 0.45, [x + sx * (rd + 0.025), yc, z(zDp + Ld * f)], 'x', (q) => k.hex('nut', 0.025, 0.012, q, 'x'))
        }
      // packing / distance-piece vents up to the side vent header, drains down to the drain header
      const yVh = yc + rd + 0.3
      for (const f of [0.25, 0.75]) {
        k.tube('tubing', [[x + rd * 0.4, yc + rd, z(zDp + Ld * f)], [x + rd * 0.4, yVh, z(zDp + Ld * f)], [x + rd * 0.4, yVh, z(zDp - 0.08)]], 0.009, 6, 0.04)
        k.tube('tubing', [[x - rd * 0.4, yc - rd, z(zDp + Ld * f)], [x - rd * 0.4, hs + 0.2, z(zDp + Ld * f)], [x - rd * 0.4, hs + 0.2, z(zDp - 0.12)]], 0.009, 6, 0.04)
      }
      // jacket cooling water in (low) and out (high) to the side headers
      k.tube('tubing', [[x + Dc * 0.3, yc - Dc * 0.35, z(zc0 + 0.12)], [x + Dc * 0.3, hs + 0.32, z(zc0 + 0.12)], [x + Dc * 0.3, hs + 0.32, z(zc0 - 0.05)]], 0.014, 8, 0.05)
      k.tube('tubing', [[x - Dc * 0.3, yc + Dc * 0.35, z(zc0 + 0.12)], [x - Dc * 0.3, yc + Dc * 0.35 + 0.1, z(zc0 + 0.12)], [x - Dc * 0.3, yc + Dc * 0.35 + 0.1, z(zc0 - 0.05)], [x - Dc * 0.3, hs + 0.46, z(zc0 - 0.05)]], 0.014, 8, 0.05)
      // cylinder: crank-end flange, jacketed body with ribs, head-end cover with studs, clearance pocket
      k.cyl(CYL, Dc / 2 + 0.05, 0.06, [x, yc, z(zc0 + 0.03)], ax, 40)
      k.cyl(CYL, Dc / 2, Lcyl, [x, yc, z(zcc)], ax, 40)
      for (const f of [0.33, 0.66]) k.cyl(CYL, Dc / 2 + 0.02, 0.04, [x, yc, z(zc0 + Lcyl * f)], ax, 40)
      k.cyl(CYL, Dc / 2 + 0.04, 0.06, [x, yc, z(zc1 - 0.03)], ax, 40)
      k.cyl(CYL, Dc / 2 - 0.02, 0.07, [x, yc, z(zc1 + 0.035)], ax, 40)
      k.boltCircle('boltXylan', 'nut', 16, Dc / 2 - 0.01, [x, yc, z(zc1 - 0.04)], ax, 0.02, 0.15, [0.135])
      k.cyl(CYL, Dc * 0.22, 0.2, [x, yc, z(zc1 + 0.17)], ax, 24)
      if (p.bore >= 0.25) k.handwheel('handwheel', Dc * 0.45, [x, yc, z(zc1 + 0.3)], ax, 4)
      // valve covers: suction valves on the upper quarter, discharge on the lower, at both ends
      for (const ze of [zc0 + Lcyl * 0.2, zc1 - Lcyl * 0.2])
        for (const a of [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, -Math.PI * 0.75]) {
          const d: V3 = [Math.cos(a), Math.sin(a), 0]
          const c: V3 = [x + d[0] * (Dc / 2 + 0.03), yc + d[1] * (Dc / 2 + 0.03), z(ze)]
          k.cyl(CYL, rv + 0.02, 0.08, c, d, 20)
          k.cyl(CYL, rv + 0.03, 0.03, [c[0] + d[0] * 0.055, c[1] + d[1] * 0.055, c[2]], d, 20)
          k.boltCircle('boltXylan', 'nut', 6, rv * 0.95, [c[0] + d[0] * 0.03, c[1] + d[1] * 0.03, c[2]], d, 0.014, 0.08, [0.07])
        }
      // nozzles up to the suction bottle and down to the discharge bottle, with flanged joints
      for (const [dir, nps] of [[1, p.suctionNps], [-1, p.dischargeNps]] as const) {
        const n = Math.min(nps, nN)
        const y0 = yc + dir * (Dc / 2 - 0.02)
        const y1 = (dir > 0 ? yS : yD) - dir * (Db / 2 - 0.02)
        const ym = (y0 + y1) / 2
        annulus(k, CYL, pipeOD(n) / 2, pipeOD(n) * 0.7, 0.12, [x, yc + dir * (Dc / 2 + 0.03), z(zcc)], 'y', 20)
        k.pipe(BOTTLE, [x, y0, z(zcc)], [x, y1, z(zcc)], pipeOD(n), pipeWall(n))
        joint(k, n, p.rating, [x, ym, z(zcc)], 'y')
        // pulsation orifice plate between the flanges: paddle handle with stamped bore
        const fod = flangeDims(n, p.rating).od
        k.box('stainless', [0.11, 0.005, 0.05], [x + fod / 2 + 0.045, ym, z(zcc)])
      }
      // discharge temperature element and pressure gauge
      k.rod('stainless', [x + pipeOD(nN) / 2, yc - Dc / 2 - 0.12, z(zcc)], [x + pipeOD(nN) / 2 + 0.12, yc - Dc / 2 - 0.12, z(zcc)], 0.012, 8)
      k.rbox('stainless', [0.06, 0.08, 0.06], 0.01, [x + pipeOD(nN) / 2 + 0.15, yc - Dc / 2 - 0.12, z(zcc)])
      gauge(k, [x - pipeOD(nN) / 2 - 0.1, yS - Db / 2 - 0.12, z(zcc + 0.1)], [0, 0, s], 0.09, 'bar', 100)
      // lubricator tubing
      k.tube('tubing', [[-Lf / 2 + 0.3, yTop + 0.02, -Wf * 0.25], [-Lf / 2 + 0.3, yTop + 0.02, z(Wf / 2 - 0.05)], [x, yTop + 0.02, z(Wf / 2 - 0.05)], [x, yc + Dc / 2 + 0.02, z(zc0 + 0.1)]], 0.005, 6, 0.05)
      // cylinder support (head end) and distance-piece support
      k.box(SKID, [0.16, yD - Db / 2 - hs - 0.04, 0.16], [x, (yD - Db / 2 - 0.04 + hs) / 2, z(zc1 + 0.08)])
      k.box(SKID, [0.3, yc - rd - hs, 0.25], [x, (yc - rd + hs) / 2, z(zDp + Ld / 2)])
    }
  }

  // side headers: distance-piece vent (up to an atmospheric vent with flame arrester), drain, cooling water supply / return
  const xh0 = -Lf / 2 + 0.1
  const xh1 = Lf / 2 - 0.1
  for (const s of [-1, 1]) {
    const yVh = yc + rd + 0.3
    k.rod('stainless', [xh0 - 0.2, yVh, s * (zDp - 0.08)], [xh1, yVh, s * (zDp - 0.08)], pipeOD(1) / 2, 10)
    lineRun(k, [[xh0 - 0.2, yVh, s * (zDp - 0.08)], [xh0 - 0.3, yVh, s * (zDp - 0.08)], [xh0 - 0.3, yTop + 1.3, s * (zDp - 0.08)]], 1, 'stainless')
    k.cyl('flangeSteel', 0.05, 0.14, [xh0 - 0.3, yTop + 1.37, s * (zDp - 0.08)], 'y', 14)
    k.lathe('stainless', [[0.02, 0], [0.02, 0.1], [0.06, 0.12], [0.06, 0.14], [0.015, 0.14]], [xh0 - 0.3, yTop + 1.44, s * (zDp - 0.08)], 'y', 14)
    k.rod('stainless', [xh0 - 0.2, hs + 0.2, s * (zDp - 0.12)], [xh1, hs + 0.2, s * (zDp - 0.12)], pipeOD(1) / 2, 10)
    k.cyl(OIL, 0.08, 0.3, [xh0 - 0.25, hs + 0.2, s * (zDp - 0.12)], 'y', 16)
    for (const [y, c] of [[hs + 0.32, 'pipePaint'], [hs + 0.46, 'pipePaint']] as const) k.rod(c, [xh0, y, s * (zc0 - 0.05)], [xh1, y, s * (zc0 - 0.05)], pipeOD(1.5) / 2, 10)
    for (const xx of [xh0 + 0.1, xh1 - 0.1]) k.box(SKID, [0.06, 0.5, 0.06], [xx, hs + 0.25, s * (zc0 - 0.05)])
  }

  // pulsation bottles (suction above, discharge below), with 2:1 heads and saddles
  for (const s of [-1, 1]) {
    for (const [yb, top] of [[yS, true], [yD, false]] as const) {
      const prof: [number, number][] = [[0, -Lb / 2 - hd]]
      for (let i = 1; i <= 12; i++) {
        const t = (i / 12) * (Math.PI / 2)
        prof.push([(Db / 2) * Math.sin(t), -Lb / 2 - hd * Math.cos(t)])
      }
      for (let i = 0; i <= 12; i++) {
        const t = (i / 12) * (Math.PI / 2)
        prof.push([(Db / 2) * Math.cos(t), Lb / 2 + hd * Math.sin(t)])
      }
      k.lathe(BOTTLE, prof, [0, yb, s * zcc], 'x', 40)
      for (const xx of [-Lb / 2, Lb / 2]) k.torus(BOTTLE, Db / 2 + 0.001, 0.006, [xx, yb, s * zcc], 'x', 6, 40)
      tagPlate(k, top ? 'SUCTION BOTTLE' : 'DISCHARGE BOTTLE', [0, yb, s * (zcc + Db / 2 + 0.003)], s > 0 ? 'z' : '-z', 0.3)
      // drain / vent bosses
      k.cyl(BOTTLE, 0.03, 0.1, [-Lb * 0.4, yb + (top ? Db / 2 : -Db / 2), s * zcc], 'y', 10)
    }
    // discharge bottle supports
    for (const xx of [-Lb * 0.35, Lb * 0.35]) {
      k.box(SKID, [0.2, yD - hs - Db * 0.3, Db * 0.6], [xx, (yD - Db * 0.3 + hs) / 2, s * zcc])
      k.box(SKID, [0.3, 0.02, Db * 0.8], [xx, hs + 0.01, s * zcc])
    }
    // suction bottle supports on the cylinders' frames: braces from the discharge bottle
    for (const xx of [-Lb / 2 + 0.15, Lb / 2 - 0.15]) k.box(SKID, [0.12, yS - yD - Db, 0.12], [xx, (yS + yD) / 2, s * (zcc + Db * 0.35)])
  }

  // suction header: hollow risers from each bottle, equal tee over the frame, riser to the suction flange
  const sN = p.suctionNps
  const sOD = pipeOD(sN)
  const yTopS = yS + Db / 2
  const ht = sOD * 0.75
  for (const s of [-1, 1]) {
    annulus(k, BOTTLE, sOD / 2, sOD * 0.7, 0.08, [0, yTopS, s * zcc], 'y', 24)
    pipeRun(k, [[0, yTopS - 0.04, s * zcc], [0, L.yH, s * zcc], [0, L.yH, s * ht]], sN, { mat: 'pipePaint' })
  }
  const tTop = teePipe(k, [0, L.yH, -ht], [0, L.yH, ht], [0, L.yH, 0], [0, 1, 0], sOD, pipeWall(sN), sOD, pipeWall(sN), sOD * 0.8, 'pipePaint')
  neckTo(k, tTop, [0, L.ySuc, 0], [0, 1, 0], sN, p.rating, 'pipePaint', false)
  const yJ = (tTop[1] + L.ySuc) / 2 - 0.05
  joint(k, sN, p.rating, [0, yJ, 0], 'y')
  k.box('actuatorRed', [0.11, 0.005, 0.05], [flangeDims(sN, p.rating).od / 2 + 0.045, yJ, 0])
  for (const dy of [-0.15, 0.15]) k.rod('stainless', [0, yJ + dy, sOD / 2 - 0.004], [0, yJ + dy, sOD / 2 + 0.1], 0.008, 8)
  k.rod('tubing', [0, yJ - 0.15, sOD / 2 + 0.1], [0, yJ + 0.15, sOD / 2 + 0.1], 0.006, 6)
  gauge(k, [0, yJ, sOD / 2 + 0.16], 'z', 0.08, 'bar', 2)
  for (const s of [-1, 1]) k.box(SKID, [0.12, L.yH - yTop - sOD / 2, 0.12], [0, (L.yH - sOD / 2 + yTop) / 2, s * Wf * 0.3])
  for (const s of [-1, 1]) k.box(SKID, [0.25, 0.02, 0.25], [0, yTop + 0.06, s * Wf * 0.3])
  // discharge: outlets from each bottle's +X head, equal tee, trunk to the discharge flange
  const dN = p.dischargeNps
  const dOD = pipeOD(dN)
  const xh = Lb / 2 + hd
  const dt = dOD * 0.75
  for (const s of [-1, 1]) {
    annulus(k, BOTTLE, dOD / 2, dOD * 0.7, 0.1, [xh - 0.02, yD, s * zcc], 'x', 24)
    k.pipe(BOTTLE, [xh - 0.08, yD, s * zcc], [xh + 0.2, yD, s * zcc], dOD, pipeWall(dN))
    joint(k, dN, p.rating, [xh + 0.2, yD, s * zcc], 'x')
    pipeRun(k, [[xh + 0.2, yD, s * zcc], [L.xe, yD, s * zcc], [L.xe, yD, s * dt]], dN, { mat: 'pipePaint' })
  }
  const tOut = teePipe(k, [L.xe, yD, -dt], [L.xe, yD, dt], [L.xe, yD, 0], [1, 0, 0], dOD, pipeWall(dN), dOD, pipeWall(dN), dOD * 0.8, 'pipePaint')
  runToFlange(k, [tOut], [L.xFace, yD, 0], [1, 0, 0], dN, p.rating, 'pipePaint', false)
  for (const xx of [L.xe, L.xFace - 0.4]) k.box(SKID, [0.12, yD - dOD / 2 - hs, 0.12], [xx, (yD - dOD / 2 + hs) / 2, xx === L.xe ? zcc * 0.5 : 0])
  // discharge PSV stub on the trunk
  const xp = (L.xe + L.xFace) / 2 - 0.1
  annulus(k, 'pipePaint', pipeOD(2) / 2, pipeOD(2) * 0.7, 0.03, [xp, yD + dOD / 2 + 0.015, 0], 'y', 16)
  k.rod('pipePaint', [xp, yD + dOD / 2 + 0.001, 0], [xp, yD + pipeOD(dN) / 2 + 0.25, 0], pipeOD(2) / 2, 12)
  k.disc('pipeBore', pipeOD(2) / 2, [xp, yD + dOD / 2 + 0.002, 0], 'y', 12)
  flange(k, 2, p.rating, [xp, yD + pipeOD(dN) / 2 + 0.3, 0], [0, 1, 0], true)
  k.cyl('actuatorRed', 0.06, 0.35, [xp, yD + pipeOD(dN) / 2 + 0.5, 0], 'y', 16)
  k.cyl('actuatorRed', 0.035, 0.25, [xp, yD + pipeOD(dN) / 2 + 0.8, 0], 'y', 12)

  // flywheel under a mesh guard, coupling, motor
  const Rf = L.Rf
  const fk = new Kit()
  fk.cyl('castIron', Rf, 0.2, [0, 0, 0], 'x', 48)
  fk.cyl('castIron', Rf * 0.88, 0.22, [0, 0, 0], 'x', 48)
  fk.cyl('flangeSteel', 0.16, 0.32, [0, 0, 0], 'x', 24)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    fk.box('safetyYellow', [0.03, 0.05, 0.08], [0.11, Math.sin(a) * Rf * 0.94, Math.cos(a) * Rf * 0.94], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -a))
  }
  rotors.push({ built: fk.build(), axis: 'x', pos: [L.xFw, yc, 0], rpm: 120 })
  couplingGuardShell(k, L.xFw - 0.25, L.xFw + 0.25, yc, Rf + 0.06, hs + 0.03)
  rotors.push({ built: couplingRotor(L.xCpl1 - L.xCpl0, 0.25, 0.1), axis: 'x', pos: [(L.xCpl0 + L.xCpl1) / 2, yc, 0], rpm: 120 })
  couplingGuardShell(k, L.xCpl0 - 0.02, L.xCpl1 + 0.02, yc, 0.28, hs + 0.03)
  k.cyl('stainless', 0.1, L.xCpl1 - L.xFw, [(L.xCpl1 + L.xFw) / 2, yc, 0], 'x', 16)
  if (L.big) {
    const mB1 = L.xMotorEnd - 0.4
    rotors.push(largeMotor(k, { mB0: mB1 - L.Lm, mB1, xEnd: L.xMotorEnd, ym: yc, hs, mW: L.mW, rpm: 120 }))
  } else {
    const ped = yc - L.ms.H - hs
    const xm = L.xMotorEnd - 0.05
    if (ped > 0.02) k.box(SKID, [L.Lm + 0.1, ped, L.ms.R * 2 + 0.3], [xm - L.Lm / 2, hs + ped / 2, 0])
    k.at([xm, yc, 0], undefined, () => motor(k, { R: L.ms.R, L: L.Lm, H: L.ms.H, tbox: 'side', cable: false }))
    rotors.push(cowlFan(L.ms.R, L.Lm, 120, [xm, yc, 0]))
  }
  k.plane(signMaterial('ler', `${p.tag}  RECIPROCATING COMPRESSOR`), 1.8, 0.3, [cx - SL * 0.25, hs * 0.5, SW / 2 + 0.003])
  junctionBox(k, [-Lf / 2 + 0.2, hs + 0.2, Wf / 2 + 0.02], 'z')
  tagPlate(k, p.tag, [Lf / 2 - 0.3, yTop - 0.3, Wf / 2 + 0.002], 'z', 0.3)
}
