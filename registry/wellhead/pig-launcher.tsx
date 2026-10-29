// Pig launcher / receiver: oversized barrel, eccentric reducer, clamp-ring quick-opening closure with pressure-warning interlock, trap valve, kicker, vent, drain, PSV, signaller. API 6D / ASME VIII.
import * as THREE from 'three'
import { useMemo } from 'react'
import { Kit, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, gasket, gauge, liftingLug, nozzle, pipeRun, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { faceToFace, flange as flangeDims, nozzleStandout, pipeOD, pipeWall, psv as psvDims, reducer, type Rating } from '../lib/standards'
import { ballValve, flangeBore, frame, ring } from './_wellparts'

export interface PigLauncherProps {
  service?: 'launcher' | 'receiver'
  /** pipeline size, NPS */
  nps?: number
  rating?: Rating
  /** major barrel length (reducer to closure), m */
  length?: number
  /** barrel axis height above deck, m */
  elevation?: number
  kickerNps?: number
  /** closure door swung open */
  closureOpen?: boolean
  tag?: string
}

export const defaults = {
  service: 'launcher' as 'launcher' | 'receiver',
  nps: 10,
  rating: 600 as Rating,
  length: 3.2,
  elevation: 1.1,
  kickerNps: 4,
  closureOpen: false,
  tag: 'L-110',
}

type P = typeof defaults

const SIZES = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 26, 28, 30, 32, 36]
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function layout(p: P) {
  const nps = p.nps
  const i = SIZES.findIndex((s) => s >= nps)
  const major = SIZES[Math.min(SIZES.length - 1, Math.max(0, i) + (nps >= 12 ? 2 : 1))] // oversized 1–2 sizes, typical
  const Rj = pipeOD(major) / 2
  const Rn = pipeOD(nps) / 2
  const yc = p.elevation
  const yn = p.service === 'launcher' ? yc - (Rj - Rn) : yc // launcher: eccentric flat on bottom; receiver: concentric
  const Lv = faceToFace('ball-full', nps, p.rating)
  const minorLen = clamp(2.2 * pipeOD(nps), 0.6, 1.6)
  const lr = reducer(major, nps)
  const s = clamp(Rj / 0.162, 0.5, 2)
  const tD = 0.05 * s
  const dD = 0.06 * s
  const hubL = 0.16 * s
  const Rh = Rj * 1.38 + 0.02
  // stations from the mainline face (x0)
  const total = Lv + minorLen + lr + p.length + hubL + tD + dD
  const x0 = -total / 2
  const xv1 = x0 + Lv
  const xr0 = xv1 + minorLen
  const xr1 = xr0 + lr
  const xH0 = xr1 + p.length
  const xc = xH0 + hubL
  const launcher = p.service === 'launcher'
  const kn = Math.min(p.kickerNps, major)
  const so = (n: number) => nozzleStandout(n, p.rating)
  const xk = launcher ? xH0 - 0.35 - pipeOD(kn) : xr1 + 0.35 + pipeOD(kn)
  const LvK = faceToFace('ball-full', kn, p.rating)
  const kFace: V3 = [xk, yc + Rj + so(kn) + LvK, 0]
  const vn = 2
  const LvV = faceToFace('ball-full', vn, p.rating)
  const xvent = xH0 - 0.18
  const vFace: V3 = [xvent, yc + Rj + so(vn) + LvV, 0]
  const dn = launcher ? 2 : 4
  const LvD = faceToFace('ball-full', dn, p.rating)
  const xd = xH0 - 0.3 - pipeOD(dn)
  const dSo = Math.min(so(dn), Math.max(0.12, yc - Rj - LvD - 0.25))
  const dFace: V3 = [xd, yc - Rj - dSo - LvD, 0]
  const psvRating = Math.min(p.rating, 1500) as Rating
  const pd = psvDims('D', psvRating)
  const xpsv = xr1 + p.length * 0.45
  const psvOut: V3 = [xpsv, yc + Rj + so(pd.inletNps) + pd.centreToInlet, -pd.centreToOutlet]
  return { major, Rj, Rn, yc, yn, Lv, minorLen, lr, s, tD, dD, hubL, Rh, x0, xv1, xr0, xr1, xH0, xc, launcher, kn, xk, LvK, kFace, vn, LvV, xvent, vFace, dn, LvD, xd, dSo, dFace, pd, psvRating, psvOut, xpsv, so }
}

export function ports(props: PigLauncherProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const L = layout(p)
  return [
    port('mainline', 'Mainline', [L.x0, L.yn, 0], [-1, 0, 0], p.nps, p.rating),
    port('kicker', L.launcher ? 'Kicker inlet' : 'Bypass outlet', L.kFace, [0, 1, 0], L.kn, p.rating),
    port('vent', 'Vent', L.vFace, [0, 1, 0], L.vn, p.rating, 'vent'),
    port('drain', 'Drain', L.dFace, [0, -1, 0], L.dn, p.rating, 'drain'),
    port('psv', 'PSV outlet', L.psvOut, [0, 0, -1], L.pd.outletNps, L.pd.outletRating, 'relief'),
  ]
}

export function PigLauncher(props: PigLauncherProps & GroupProps) {
  const { service, nps, rating, length, elevation, kickerNps, closureOpen, tag, ...group } = { ...defaults, ...props }
  const p = { service, nps, rating, length, elevation, kickerNps, closureOpen, tag } as P
  const L = useMemo(() => layout(p), Object.values(p)) // eslint-disable-line react-hooks/exhaustive-deps
  const data = useKit((k) => build(k, p), Object.values(p))
  const door = useKit((k) => buildDoor(k, p), [nps, rating, length, elevation, service])
  const hinge = hingeAt(L)
  return (
    <group {...group}>
      <KitMesh data={data} />
      <group position={hinge} rotation-y={closureOpen ? (100 * Math.PI) / 180 : 0}>
        <KitMesh data={door} />
      </group>
    </group>
  )
}

export default PigLauncher

function hingeAt(L: ReturnType<typeof layout>): V3 {
  return [L.xc + 0.02 * L.s, L.yc, -(L.Rh + 0.11 * L.s)]
}

/** Lofted eccentric reducer between two circles on X (centres may differ in y). */
function eccentric(k: Kit, x0: number, r0: number, y0: number, x1: number, r1: number, y1: number) {
  const seg = 48
  const rows = 12
  const pos: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= rows; j++) {
    const t = j / rows
    const e = t * t * (3 - 2 * t)
    const r = r0 + (r1 - r0) * e
    const yc = y0 + (y1 - y0) * e
    const x = x0 + (x1 - x0) * t
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2
      pos.push(x, yc + Math.cos(a) * r, Math.sin(a) * r)
    }
  }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i
      const b = a + seg + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  k.add('equipmentPaint', g)
}

function support(k: Kit, x: number, yAxis: number, R: number) {
  const yC = yAxis - R - 0.012
  const post = 0.06 + R * 0.25
  k.lathe('structSteel', [[R + 0.012, -0.08], [R + 0.012, 0.08], [R + 0.0005, 0.08], [R + 0.0005, -0.08], [R + 0.012, -0.08]], [x, yAxis, 0], 'x', 32, Math.PI / 2 + Math.PI / 6, (2 * Math.PI) / 3)
  k.box('structSteel', [0.2, 0.016, R * 1.9], [x, yC - R * 0.5 - 0.008, 0])
  for (const s of [-1, 1]) k.box('structSteel', [0.012, R * 0.55, 0.012], [x, yC - R * 0.25, s * R * 0.75])
  const yTop = yC - R * 0.5 - 0.016
  k.pipe('structSteel', [x, 0.02, 0], [x, yTop, 0], post * 2, 0.008, 20)
  // jack screw adjuster
  k.cyl('boltXylan', 0.02, 0.08, [x, yTop - 0.05, 0], 'y', 10)
  k.hex('nut', 0.07, 0.03, [x, yTop - 0.09, 0])
  k.box('structSteel', [0.32, 0.02, 0.32], [x, 0.01, 0])
  for (const s of [-1, 1]) k.box('structSteel', [0.012, 0.12, 0.1], [x, 0.08, s * (post + 0.05)])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.cyl('nut', 0.008, 0.07, [x + sx * 0.12, 0.035, sz * 0.12], 'y', 6)
      k.hex('nut', 0.026, 0.016, [x + sx * 0.12, 0.028, sz * 0.12])
    }
  // U-bolt
  const ru = R + 0.012
  k.torus('nut', ru, 0.008, [x, yAxis, 0], 'x', 6, 24, Math.PI)
  for (const s of [-1, 1]) k.hex('nut', 0.026, 0.016, [x, yC - R * 0.5 + 0.0, s * ru])
}

function build(k: Kit, p: P) {
  const L = layout(p)
  const { Rj, Rn, yc, yn, s } = L
  const wn = pipeWall(p.nps, '80')
  const wj = pipeWall(L.major, '80')

  // trap valve (full-bore ball, gear operated), mainline face at x0
  k.with(frame([L.x0, yn, 0], [1, 0, 0], [0, 0, 1]), () => ballValve(k, p.nps, p.rating, L.Lv, 'gear', true, true, p.service === 'launcher' ? 'LAUNCH VLV' : 'RECV VLV'))
  // minor barrel with its flange bolted to the valve
  const fl = flangeDims(p.nps, p.rating)
  const flL = fl.hubLength + fl.raisedFaceHeight
  flange(k, p.nps, p.rating, [L.xv1 + 0.0045, yn, 0], '-x')
  gasket(k, p.nps, p.rating, [L.xv1 + 0.00225, yn, 0], 'x')
  k.pipe('equipmentPaint', [L.xv1 + flL, yn, 0], [L.xr0 + 0.002, yn, 0], Rn * 2, wn, 40)
  eccentric(k, L.xr0, Rn, yn, L.xr1, Rj, yc)
  k.pipe('equipmentPaint', [L.xr1 - 0.002, yc, 0], [L.xH0 + 0.002, yc, 0], Rj * 2, wj, 48)
  for (const [x, r, y] of [[L.xr0, Rn, yn], [L.xr1, Rj, yc], [L.xH0, Rj, yc]] as const) k.torus('flangeSteel', r + 0.0008, 0.004, [x, y, 0], 'x', 6, 48)
  k.lathe('pipeBore', [[Rj - wj, L.xc], [Rj - wj, L.xr1]], [0, yc, 0], 'x', 40)

  // closure hub (door is a separate swinging part)
  k.lathe('equipmentPaint', [[Rj, L.xH0], [Rj + 0.012, L.xH0 + 0.02], [L.Rh, L.xH0 + 0.07 * s], [L.Rh, L.xc], [Rj - wj, L.xc]], [0, yc, 0], 'x', 56)
  k.lathe('machined', [[L.Rh - 0.005, L.xc + 0.001], [Rj - wj, L.xc + 0.001]], [0, yc, 0], 'x', 56)
  // hinge bracket and pin on the hub (-Z side)
  const h = hingeAt(L)
  k.box('equipmentPaintDark', [0.1 * s, 0.16 * s, 0.12 * s], [L.xc - 0.05 * s, yc, -(L.Rh + 0.04 * s)])
  k.rod('equipmentPaintDark', [h[0], yc - 0.13 * s, h[2]], [h[0], yc + 0.13 * s, h[2]], 0.02 * s, 12)
  k.cyl('equipmentPaintDark', 0.038 * s, 0.04 * s, [h[0], yc - 0.08 * s, h[2]], 'y', 16)
  // safety interlock: pressure-warning screw on the hub, key-interlock box linked to the vent valve
  k.rod('brass', [L.xc - 0.04 * s, yc + L.Rh - 0.01, 0.1 * s], [L.xc - 0.04 * s, yc + L.Rh + 0.07 * s, 0.1 * s], 0.012 * s, 8)
  k.rbox('actuatorYellow', [0.12, 0.1, 0.08], 0.01, [L.xc - 0.12 * s, yc + L.Rh + 0.03, -0.08 * s])
  k.cyl('brass', 0.012, 0.04, [L.xc - 0.12 * s, yc + L.Rh + 0.03, -0.08 * s - 0.05], 'z', 8)
  k.box('brass', [0.05, 0.012, 0.006], [L.xc - 0.12 * s, yc + L.Rh + 0.03, -0.08 * s - 0.072])

  // kicker / bypass nozzle with its valve
  const kFaceN = nozzle(k, { base: [L.xk, yc + Rj, 0], dir: [0, 1, 0], nps: L.kn, rating: p.rating, standout: L.so(L.kn), pad: pipeOD(L.kn) * 1.8 })
  k.with(frame(kFaceN, [0, 1, 0], [0, 0, 1]), () => ballValve(k, L.kn, p.rating, L.LvK, L.kn >= 6 ? 'gear' : 'lever', true))
  // vent nozzle + valve
  const vFaceN = nozzle(k, { base: [L.xvent, yc + Rj, 0], dir: [0, 1, 0], nps: L.vn, rating: p.rating, standout: L.so(L.vn) })
  k.with(frame(vFaceN, [0, 1, 0], [0, 0, 1]), () => ballValve(k, L.vn, p.rating, L.LvV, 'lever', false))
  // drain nozzle + valve
  const dFaceN = nozzle(k, { base: [L.xd, yc - Rj, 0], dir: [0, -1, 0], nps: L.dn, rating: p.rating, standout: L.dSo })
  k.with(frame(dFaceN, [0, -1, 0], [0, 0, 1]), () => ballValve(k, L.dn, p.rating, L.LvD, 'lever', false))

  // thermal-relief PSV (API 526): inlet on a nozzle, outlet flange towards -Z
  const pr = L.psvRating
  const pFace = nozzle(k, { base: [L.xpsv, yc + Rj, 0], dir: [0, 1, 0], nps: L.pd.inletNps, rating: pr, standout: L.so(L.pd.inletNps) })
  {
    const [x, y] = [pFace[0], pFace[1]]
    const ri = pipeOD(L.pd.inletNps) / 2
    const fi = flangeDims(L.pd.inletNps, pr)
    flange(k, L.pd.inletNps, pr, [x, y + 0.0045, 0], '-y')
    gasket(k, L.pd.inletNps, pr, [x, y + 0.00225, 0], 'y')
    const yo = L.psvOut[1]
    const yb0 = y + fi.hubLength + fi.raisedFaceHeight + 0.0045
    k.cyl('valveBody', ri * 1.6, yo - yb0 + ri * 1.6, [x, (yb0 + yo + ri * 1.6) / 2, 0], 'y', 24)
    const fo = flangeDims(L.pd.outletNps, L.pd.outletRating)
    const flo = fo.hubLength + fo.raisedFaceHeight
    const rO = pipeOD(L.pd.outletNps) / 2 - pipeWall(L.pd.outletNps, '80')
    k.at([x, yo, 0], '-z', () => ring(k, 'valveBody', pipeOD(L.pd.outletNps) * 0.55, rO, ri * 1.2, -L.psvOut[2] - flo + 0.002, 24))
    k.disc('pipeBore', rO, [x, yo, -ri * 1.6 - 0.002], '-z', 20)
    flange(k, L.pd.outletNps, L.pd.outletRating, L.psvOut, '-z', true)
    flangeBore(k, L.pd.outletNps, L.pd.outletRating, L.psvOut, '-z')
    const yt = yo + ri * 1.6
    const hB = Math.max(0.15, y + L.pd.height - yt - 0.07)
    k.cyl('actuatorRed', ri * 1.3, hB, [x, yt + hB / 2, 0], 'y', 20, ri * 0.9)
    k.cyl('actuatorRed', ri * 0.8, 0.07, [x, yt + hB + 0.035, 0], 'y', 16)
    k.rod('handwheel', [x, yt + hB * 0.9, 0], [x + 0.16, yt + hB * 0.75, 0], 0.007, 6)
  }

  // balance (equalising) line on -Z: barrel behind the pig to the minor barrel, with its valve
  {
    const bn = 2
    const fb = flangeDims(bn, p.rating)
    const flb = fb.hubLength + fb.raisedFaceHeight
    const g = 0.0045
    const xb1 = L.xH0 - Math.max(0.55, p.length * 0.18)
    const xb2 = L.xv1 + flL + L.minorLen * 0.75
    const F1 = nozzle(k, { base: [xb1, yc, -Rj], dir: [0, 0, -1], nps: bn, rating: p.rating, standout: L.so(bn) })
    const Lvb = faceToFace('ball-full', bn, p.rating)
    k.with(frame(F1, [0, 0, -1], [0, 1, 0]), () => ballValve(k, bn, p.rating, Lvb, 'lever', false))
    const zV = F1[2] - Lvb - g
    flange(k, bn, p.rating, [xb1, yc, zV], 'z')
    gasket(k, bn, p.rating, [xb1, yc, zV + g / 2], 'z', g)
    const F2 = nozzle(k, { base: [xb2, yn, -Rn], dir: [0, 0, -1], nps: bn, rating: p.rating, standout: L.so(bn) })
    flange(k, bn, p.rating, [xb2, yn, F2[2] - g], 'z', true)
    gasket(k, bn, p.rating, [xb2, yn, F2[2] - g / 2], 'z', g)
    const zRun = zV - flb - 0.18
    const pts: V3[] = [[xb1, yc, zV - flb + 0.002], [xb1, yc, zRun], [xb2, yc, zRun]]
    if (Math.abs(yc - yn) > 0.12) pts.push([xb2, yn, zRun])
    pts.push([xb2, yn, F2[2] - g - flb + 0.002])
    if (Math.abs(yc - yn) <= 0.12 && Math.abs(yc - yn) > 1e-4) pts.splice(pts.length - 1, 0, [xb2, yc, zRun * 0.5 + (F2[2] - g - flb) * 0.5])
    pipeRun(k, pts, bn, { schedule: '160' })
  }

  // pig signaller on the minor barrel
  {
    const xs = L.xv1 + flL + Math.min(0.3, L.minorLen * 0.4)
    const y0 = yn + Rn - 0.01
    k.rod('equipmentPaint', [xs, y0, 0], [xs, y0 + 0.07, 0], 0.03, 16)
    k.rod('flangeSteel', [xs, y0 + 0.07, 0], [xs, y0 + 0.095, 0], 0.06, 20)
    k.rod('valveBody', [xs, y0 + 0.095, 0], [xs, y0 + 0.21, 0], 0.045, 16)
    k.rod('valveBody', [xs, y0 + 0.21, 0], [xs, y0 + 0.24, 0], 0.03, 12)
    k.box('actuatorRed', [0.012, 0.07, 0.05], [xs, y0 + 0.28, 0])
    k.rod('handwheel', [xs, y0 + 0.15, 0], [xs, y0 + 0.15, 0.11], 0.008, 8)
  }
  // pressure gauge near the closure on the operator side (+Z)
  {
    const xg = L.xH0 - 0.6
    const a = Math.PI / 4
    const b: V3 = [xg, yc + Math.sin(a) * Rj, Math.cos(a) * Rj]
    const d: V3 = [0, Math.sin(a), Math.cos(a)]
    k.rod('equipmentPaint', [b[0], b[1] - d[1] * 0.02, b[2] - d[2] * 0.02], [b[0], b[1] + d[1] * 0.08, b[2] + d[2] * 0.08], 0.022, 12)
    k.box('valveBody', [0.05, 0.05, 0.05], [b[0], b[1] + d[1] * 0.11, b[2] + d[2] * 0.11])
    k.rod('stainless', [b[0], b[1] + d[1] * 0.13, b[2] + d[2] * 0.13], [b[0], b[1] + 0.3, b[2] + d[2] * 0.13], 0.008, 8)
    gauge(k, [b[0], b[1] + 0.35, b[2] + d[2] * 0.13], 'z', 0.12, 'bar', p.rating >= 900 ? 250 : 160)
  }

  // bi-directional disc pig loaded in the barrel (seen with the closure open)
  {
    const rp = (Rn - wn) * 1.03
    const lp = 1.7 * 2 * Rn
    const xp = L.launcher ? L.xr1 + lp / 2 + 0.05 : L.xc - 0.08 - lp / 2
    const yp = yc - (Rj - wj - rp) + 0.002
    const pu = paint('#c4462e', { roughness: 0.62, metalness: 0 })
    k.cyl('internalsSteel', rp * 0.32, lp - 0.06, [xp, yp, 0], 'x', 20)
    for (const f of [0.02, 0.26, 0.5, 0.74, 0.98]) {
      const x = xp - lp / 2 + f * lp
      k.cyl(pu, f === 0.02 || f === 0.98 ? rp * 0.97 : rp, 0.024, [x, yp, 0], 'x', 40)
      k.cyl('internalsSteel', rp * 0.6, 0.04, [x, yp, 0], 'x', 28)
    }
    k.sphere('rubberBlack', rp * 0.3, [xp - lp / 2 - 0.03, yp, 0], [1.4, 1, 1], 16)
  }

  // supports, nameplate, lifting lugs
  support(k, L.xv1 + flL + L.minorLen * 0.55, yn, Rn)
  support(k, L.xr1 + p.length * 0.2, yc, Rj)
  support(k, L.xH0 - Math.max(0.75, p.length * 0.28), yc, Rj)
  const xn = L.xr1 + p.length * 0.62
  for (const dx of [-0.1, 0.1]) k.box('equipmentPaint', [0.03, 0.05, 0.05], [xn + dx, yc, Rj + 0.02])
  k.box('nameplate', [0.26, 0.16, 0.004], [xn, yc, Rj + 0.047])
  tagPlate(k, p.tag, [xn, yc + 0.11, Rj * 0.95], 'z', 0.2)
  for (const x of [L.xr1 + 0.25, L.xH0 - 0.25]) liftingLug(k, [x, yc + Rj - 0.01, 0], 'x', 0.9)
}


/** Door, clamp band, screw and hinge arm, in the hinge-pin frame. */
function buildDoor(k: Kit, p: P) {
  const L = layout(p)
  const { Rh, s, tD, dD, xc, yc } = L
  const h = hingeAt(L)
  k.at([-h[0], -h[1], -h[2]], undefined, () => {
    const prof: [number, number][] = [[0, xc + 0.002], [Rh, xc + 0.002], [Rh, xc + tD]]
    const a = 0.86 * Rh
    for (let i = 0; i <= 16; i++) {
      const t = (Math.PI / 2) * (i / 16)
      prof.push([a * Math.cos(t), xc + tD + dD * Math.sin(t)])
    }
    k.lathe('equipmentPaint', prof, [0, yc, 0], 'x', 56)
    k.cyl('equipmentPaintDark', 0.045 * s, 0.045 * s, [xc + tD + dD + 0.0125 * s, yc, 0], 'x', 24)
    // split clamp band with lugs, screw and T-handle
    const gap = 0.16
    const bandR = Rh + 0.026 * s
    k.lathe('flangeSteel', [[bandR, xc - 0.04 * s], [bandR, xc + tD * 0.8], [Rh + 0.0008, xc + tD * 0.8], [Rh + 0.0008, xc - 0.04 * s], [bandR, xc - 0.04 * s]], [0, yc, 0], 'x', 56, -Math.PI / 2 + gap + Math.PI, Math.PI * 2 - 2 * gap)
    const lugZ = Math.sin(gap) * bandR + 0.022 * s
    const xS = xc + tD * 0.4 - 0.02 * s
    const yS = yc + Rh + 0.05 * s
    for (const sz of [-1, 1]) k.box('flangeSteel', [0.07 * s, 0.085 * s, 0.03 * s], [xS, yc + Rh + 0.035 * s, sz * lugZ])
    k.rod('stainless', [xS, yS, -lugZ - 0.07 * s], [xS, yS, lugZ + 0.04 * s], 0.012 * s, 10)
    k.hex('nut', 0.035 * s, 0.022 * s, [xS, yS, lugZ + 0.025 * s], 'z')
    k.hex('handwheel', 0.04 * s, 0.03 * s, [xS, yS, -lugZ - 0.06 * s], 'z')
    k.rod('handwheel', [xS, yS, -lugZ - 0.08 * s], [xS, yS, -lugZ - 0.11 * s], 0.012 * s, 8)
    k.rod('handwheel', [xS - 0.16 * s, yS, -lugZ - 0.11 * s], [xS + 0.16 * s, yS, -lugZ - 0.11 * s], 0.011 * s, 8)
    // handle on the door face
    const xF = xc + tD + dD * 0.6
    k.rod('handwheel', [xF, yc - 0.12 * s, Rh * 0.45], [xF + 0.06 * s, yc - 0.12 * s, Rh * 0.45], 0.012 * s, 8)
    k.rod('handwheel', [xF, yc + 0.12 * s, Rh * 0.45], [xF + 0.06 * s, yc + 0.12 * s, Rh * 0.45], 0.012 * s, 8)
    k.rod('handwheel', [xF + 0.06 * s, yc - 0.13 * s, Rh * 0.45], [xF + 0.06 * s, yc + 0.13 * s, Rh * 0.45], 0.014 * s, 8)
    // hinge arm from the pin to the door boss
    const xA = xc + tD + dD + 0.06 * s
    for (const y of [-0.1 * s, 0.06 * s]) k.cyl('equipmentPaintDark', 0.038 * s, 0.04 * s, [h[0], yc + y + 0.02 * s, h[2]], 'y', 16)
    k.box('equipmentPaintDark', [xA - h[0], 0.07 * s, 0.03 * s], [(xA + h[0]) / 2, yc, h[2]])
    k.box('equipmentPaintDark', [0.04 * s, 0.07 * s, -h[2]], [xA, yc, h[2] / 2])
    k.rod('equipmentPaintDark', [xA, yc, 0], [xc + tD + dD, yc, 0], 0.03 * s, 12)
  })
}
