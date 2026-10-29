// Shell-and-tube heat exchanger, TEMA AES / AEU / BEM / AKT (kettle), single or stacked, on saddles. TEMA 10th ed., ASME VIII-1, ASME B16.5.
import * as THREE from 'three'
import { Kit, mat4, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, liftingLug, saddle, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { nozzleStandout, pipeOD, shellThickness, type Rating } from '../lib/standards'
import { clamp, earthBoss, eccentricCone, girthDims, girthFlange, girthStuds, head, jointBolting, openNozzle, seamX, shellX } from './_thermal'

export type Tema = 'AES' | 'AEU' | 'BEM' | 'AKT'

export interface ShellAndTubeExchangerProps {
  tema?: Tema
  /** shell inside diameter, m */
  diameter?: number
  /** tube length, m */
  length?: number
  /** tube passes (AES/AEU/AKT are rounded up to even) */
  passes?: 1 | 2 | 4 | 6
  /** shells stacked in series (not for AKT) */
  stacked?: 1 | 2
  /** shell bottom above deck, m */
  elevation?: number
  /** shell-side design pressure, barg */
  pressure?: number
  rating?: Rating
  shellNps?: number
  tubeNps?: number
  insulated?: boolean
  tag?: string
  paint?: MatKey
}

export const defaults = {
  tema: 'AES' as Tema,
  diameter: 0.9,
  length: 6,
  passes: 2 as 1 | 2 | 4 | 6,
  stacked: 1 as 1 | 2,
  elevation: 0.9,
  pressure: 20,
  rating: 300 as Rating,
  shellNps: 8,
  tubeNps: 6,
  insulated: false,
  tag: 'E-100',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

const GASKET = 0.0045
const smallNps = (n: number) => (n >= 10 ? 6 : n >= 8 ? 4 : n >= 6 ? 3 : 2)

function dims(p: P) {
  const front = p.tema[0] as 'A' | 'B'
  const kettle = p.tema[1] === 'K'
  const rear = p.tema[2] as 'S' | 'U' | 'M' | 'T'
  const passes = p.tema === 'BEM' ? p.passes : Math.max(2, p.passes + (p.passes % 2))
  const odd = passes % 2 === 1
  const stacked = kettle ? 1 : p.stacked
  const D = p.diameter
  const wall = shellThickness(p.pressure, D)
  const Ro = D / 2 + wall
  const G = girthDims(Ro)
  const tts = clamp(0.05 + 0.05 * D, 0.06, 0.16) // typical tubesheet
  const tcov = clamp(0.04 + 0.05 * D, 0.05, 0.14) // typical flat channel cover
  const hd = D / 4 + wall
  const fl = G.tf + G.hubL
  const tOD = pipeOD(p.tubeNps)
  const sOD = pipeOD(p.shellNps)
  const so = (nps: number) => nozzleStandout(nps, p.rating, p.insulated)

  // stations along X with the stationary tubesheet channel face at x = 0
  const xT1 = tts
  let xFront: number
  let xn: number
  if (front === 'A') {
    const Lc = 2 * fl + Math.max(0.25, tOD * 2.2) + (passes >= 4 ? 0.1 : 0)
    xn = -Lc / 2
    xFront = -Lc - tcov
  } else {
    const Lb = fl + tOD * 1.5 + 0.12
    xn = -fl - tOD * 0.75 - 0.06
    xFront = -Lb - hd
  }
  const Rk = kettle ? Math.round(Ro * 1.65 * 20) / 20 : Ro
  const hdk = kettle ? Rk / 2 : hd
  let xShellEnd = xT1 + p.length // where the shell barrel stops
  let xRear: number
  let xnr = 0
  let xK0 = 0
  let xK1 = 0
  // TEMA S: the shell cover is larger than the shell to clear the floating head; reached through a conical expander
  const Rc = rear === 'S' ? Ro + clamp(0.1 * D, 0.06, 0.16) : Ro
  const Gc = girthDims(Rc)
  const coneL = rear === 'S' ? (Rc - Ro) * 2.5 : 0
  const hdc = Rc / 2
  if (rear === 'S') {
    xShellEnd = xT1 + p.length + 0.12 + coneL
    xRear = xShellEnd + 0.3 + 0.3 * D + hdc
  } else if (rear === 'U') {
    xShellEnd = xT1 + p.length + 0.1 + 0.15 * D
    xRear = xShellEnd + hd
  } else if (rear === 'M') {
    xShellEnd = xT1 + p.length - 2 * tts
    const Lb = fl + tOD * 1.5 + 0.12
    xnr = xShellEnd + tts + fl + tOD * 0.75 + 0.06
    xRear = xShellEnd + tts + Lb + hd
  } else {
    xK0 = xT1 + fl + Math.max(0.35, 0.25 * D)
    xK1 = xK0 + (Rk - Ro) * 2
    xShellEnd = Math.max(xT1 + p.length + 0.35, xK1 + 1)
    xRear = xShellEnd + hdk
  }
  const off = -(xFront + xRear) / 2
  // shell nozzles near the front and rear of the barrel
  const m = fl + sOD * 0.7 + 0.12
  // saddles: clear of bottom nozzles
  const ends: [number, number] = kettle ? [xK1, xShellEnd] : [xT1, rear === 'S' ? xShellEnd - Gc.tf - Gc.hubL - coneL : xShellEnd]
  const span = ends[1] - ends[0]
  const inset = Math.min(span * 0.3, Math.max(0.2 * span, m + sOD + 0.35))
  const saddles = [ends[0] + inset, ends[1] - inset]
  const xs1 = kettle ? saddles[0] + 0.3 * (saddles[1] - saddles[0]) : xT1 + m
  const xs2 = kettle ? saddles[0] + 0.62 * (saddles[1] - saddles[0]) : (rear === 'S' ? xShellEnd - Gc.hubL - Gc.tf - coneL : xShellEnd) - m

  const yc1 = p.elevation + Ro
  const ycK = p.elevation + Rk
  // stacked: shells joined nozzle to nozzle; the gap holds two flanged necks and the stacking saddles
  const sI = Math.max(so(p.shellNps), so(p.tubeNps), 0.22)
  const gap = 2 * sI + GASKET
  const yc2 = yc1 + 2 * Ro + gap
  return { Rc, Gc, coneL, hdc, front, kettle, rear, passes, odd, stacked, D, wall, Ro, G, tts, tcov, hd, hdk, Rk, fl, xT1, xFront, xRear, xn, xnr, xK0, xK1, xShellEnd, off, xs1, xs2, saddles, yc1, ycK, yc2, sI, gap, so }
}

type Dims = ReturnType<typeof dims>

export function ports(props: ShellAndTubeExchangerProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  const { Ro, off, so } = d
  const up: V3 = [0, 1, 0]
  const dn: V3 = [0, -1, 0]
  if (d.kettle) {
    const lq = smallNps(p.shellNps)
    return [
      port('shell-in', 'Shell inlet (feed)', [d.xs1 + off, d.ycK - d.Rk - so(lq), 0], dn, lq, p.rating),
      port('shell-out', 'Shell outlet (vapour)', [d.xs2 + off, d.ycK + d.Rk + so(p.shellNps), 0], up, p.shellNps, p.rating),
      port('tube-in', 'Tube inlet', [d.xn + off, d.yc1 - Ro - so(p.tubeNps), 0], dn, p.tubeNps, p.rating),
      port('tube-out', 'Tube outlet', [d.xn + off, d.yc1 + Ro + so(p.tubeNps), 0], up, p.tubeNps, p.rating),
      port('liquid', 'Liquid overflow', [d.xShellEnd - 0.35 + off, d.ycK - d.Rk - so(lq), 0], dn, lq, p.rating),
    ]
  }
  const yTop = d.stacked === 2 ? d.yc2 : d.yc1
  const xOut = d.odd && d.stacked === 1 ? d.xnr : d.xn
  return [
    port('shell-in', 'Shell inlet', [d.xs1 + off, yTop + Ro + so(p.shellNps), 0], up, p.shellNps, p.rating),
    port('shell-out', 'Shell outlet', [(d.stacked === 2 ? d.xs1 : d.xs2) + off, d.yc1 - Ro - so(p.shellNps), 0], dn, p.shellNps, p.rating),
    port('tube-in', 'Tube inlet', [d.xn + off, d.yc1 - Ro - so(p.tubeNps), 0], dn, p.tubeNps, p.rating),
    port('tube-out', 'Tube outlet', [xOut + off, yTop + Ro + so(p.tubeNps), 0], up, p.tubeNps, p.rating),
  ]
}

export function ShellAndTubeExchanger(props: ShellAndTubeExchangerProps & GroupProps) {
  const { tema, diameter, length, passes, stacked, elevation, pressure, rating, shellNps, tubeNps, insulated, tag, paint, ...group } = { ...defaults, ...props }
  const p = { tema, diameter, length, passes, stacked, elevation, pressure, rating, shellNps, tubeNps, insulated, tag, paint } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ShellAndTubeExchanger

function build(k: Kit, p: P) {
  const d = dims(p)
  k.at([d.off, 0, 0], undefined, () => {
    if (d.stacked === 2) {
      unit(k, p, d, d.yc1, 'lower')
      unit(k, p, d, d.yc2, 'upper')
      stackingSaddles(k, p, d)
    } else unit(k, p, d, d.yc1, 'single')
  })
}

// One shell with its channel and rear end, on the shell axis at height yc.
function unit(k: Kit, p: P, d: Dims, yc: number, role: 'single' | 'lower' | 'upper') {
  const { Ro, G, fl, tts, xT1 } = d
  const P = p.paint
  const S: MatKey = p.insulated ? 'insulation' : P
  const so = d.so
  const nz = (base: V3, dir: V3, nps: number, standout = so(nps), studs = true, blind = false) =>
    openNozzle(k, { base, dir, nps, rating: p.rating, standout, pad: pipeOD(nps) * 1.8, mat: P, studs, blind, shellR: Ro })
  const top = (x: number, R = Ro, y = yc): V3 => [x, y + R, 0]
  const bot = (x: number, R = Ro, y = yc): V3 => [x, y - R, 0]

  k.at([0, yc, 0], undefined, () => {
    // ---------------- front end: A channel with flat cover, or B bonnet
    if (d.front === 'A') {
      const xC = d.xFront + d.tcov
      girthFlange(k, P, xC, Ro, G, 1)
      girthFlange(k, P, 0, Ro, G, -1)
      shellX(k, P, Ro, xC + fl - 0.001, -fl + 0.001)
      k.cyl(P, G.Rf, d.tcov, [xC - d.tcov / 2, 0, 0], 'x', 64)
      girthStuds(k, xC - d.tcov, xC + G.tf, G)
      liftingLug(k, [xC - d.tcov - 0.001, G.Rf * 0.45, 0], 'z', clamp(Ro / 0.5, 0.7, 1.3), P)
      k.cyl(P, 0.05, 0.08, [xC - d.tcov - 0.04, -G.Rf * 0.3, 0], 'x', 12) // jacking lug
      if (role !== 'lower') davit(k, P, d, xC)
    } else {
      girthFlange(k, P, 0, Ro, G, -1)
      shellX(k, P, Ro, d.xFront + d.hd, -fl + 0.001)
      head(k, P, Ro, d.hd, d.xFront + d.hd, -1)
      seamX(k, P, Ro, d.xFront + d.hd)
      liftingLug(k, [d.xFront + d.hd * 0.6, Ro * 0.8, 0], 'x', 0.8, P)
    }
    // stationary tubesheet rim, sandwiched (A) or extended as a flange (B)
    k.lathe('flangeSteel', [[Ro, 0], [G.Rf - 0.004, 0], [G.Rf - 0.004, tts], [Ro, tts]], [0, 0, 0], 'x', 64)
    girthFlange(k, P, xT1, Ro, G, 1)
    girthStuds(k, -G.tf, xT1 + G.tf, G)

    // ---------------- shell barrel and rear end
    const Rk = d.Rk
    if (d.kettle) {
      shellX(k, S, Ro, xT1 + fl - 0.001, d.xK0)
      eccentricCone(k, S, d.xK0, Ro, 0, d.xK1, Rk, Rk - Ro, 64)
      k.at([0, Rk - Ro, 0], undefined, () => {
        shellX(k, S, Rk, d.xK1, d.xShellEnd)
        head(k, S, Rk, d.hdk, d.xShellEnd, 1)
        seamX(k, P, Rk, d.xK1)
        seamX(k, P, Rk, d.xShellEnd)
      })
      seamX(k, P, Ro, d.xK0)
    } else if (d.rear === 'S') {
      const xR = d.xShellEnd
      const { Rc, Gc, coneL } = d
      const flc = Gc.tf + Gc.hubL
      const xc0 = xR - flc - coneL
      shellX(k, S, Ro, xT1 + fl - 0.001, xc0)
      k.lathe(S, [[Ro, xc0], [Rc, xc0 + coneL]], [0, 0, 0], 'x', 64)
      seamX(k, P, Ro, xc0)
      shellX(k, S, Rc, xc0 + coneL - 0.001, xR - flc + 0.001)
      girthFlange(k, P, xR - GASKET / 2, Rc, Gc, -1)
      girthFlange(k, P, xR + GASKET / 2, Rc, Gc, 1)
      girthStuds(k, xR - Gc.tf, xR + Gc.tf, Gc)
      const xH = d.xRear - d.hdc
      shellX(k, S, Rc, xR + flc - 0.001, xH)
      head(k, S, Rc, d.hdc, xH, 1)
      seamX(k, P, Rc, xH)
      liftingLug(k, [xH + d.hdc * 0.55, Rc * 0.78, 0], 'x', 0.8, P)
      k.cyl(P, 0.05, 0.08, [d.xRear + 0.03, -Rc * 0.2, 0], 'x', 12) // pulling eye boss
    } else if (d.rear === 'U') {
      shellX(k, S, Ro, xT1 + fl - 0.001, d.xShellEnd)
      head(k, S, Ro, d.hd, d.xShellEnd, 1)
      seamX(k, P, Ro, d.xShellEnd)
    } else {
      // BEM: fixed tubesheets, thick-walled expansion bellows mid-shell, rear bonnet
      const xR = d.xShellEnd
      shellX(k, S, Ro, xT1 + fl - 0.001, xR)
      const xm = (xT1 + xR) / 2
      const eb = clamp(0.06 + 0.05 * p.diameter, 0.07, 0.14)
      for (const s of [-1, 1]) k.cyl(P, Ro + 0.012, 0.03, [xm + s * eb * 1.6, 0, 0], 'x', 64)
      k.lathe(P, [[Ro, xm - eb * 1.4], [Ro + eb, xm - eb * 0.6], [Ro + eb, xm + eb * 0.6], [Ro, xm + eb * 1.4]], [0, 0, 0], 'x', 64)
      k.lathe('flangeSteel', [[Ro, xR], [G.Rf - 0.004, xR], [G.Rf - 0.004, xR + tts], [Ro, xR + tts]], [0, 0, 0], 'x', 64)
      const xB = xR + tts
      girthFlange(k, P, xB, Ro, G, 1)
      girthStuds(k, xR - 0.005, xB + G.tf, G)
      shellX(k, P, Ro, xB + fl - 0.001, d.xRear - d.hd)
      head(k, P, Ro, d.hd, d.xRear - d.hd, 1)
      seamX(k, P, Ro, d.xRear - d.hd)
    }
    for (let x = xT1 + fl + 2.4; x < (d.kettle ? d.xK0 : d.xShellEnd) - 0.6; x += 2.4) seamX(k, P, Ro, x)
  })

  // ---------------- nozzles
  const tNps = p.tubeNps
  const sNps = p.shellNps
  const sI = d.sI
  if (d.kettle) {
    const lq = smallNps(sNps)
    const ycK = d.ycK
    nz(bot(d.xs1, d.Rk, ycK), [0, -1, 0], lq)
    nz(top(d.xs2, d.Rk, ycK), [0, 1, 0], sNps)
    nz(bot(d.xShellEnd - 0.35, d.Rk, ycK), [0, -1, 0], lq)
    nz(top(d.xK1 + 0.3, d.Rk, ycK), [0, 1, 0], 2, 0.2, true, true) // vent
    nz(top(d.xShellEnd - 0.4, d.Rk, ycK), [0, 1, 0], 3, so(3), true, true) // PSV / spare
    // level gauge on the kettle end
    const xL = d.xShellEnd - 0.7
    const zL = d.Rk + 0.3
    k.cyl('stainless', 0.04, d.Rk * 1.3, [xL, ycK, zL], 'y', 16)
    for (const y of [ycK + d.Rk * 0.55, ycK - d.Rk * 0.55]) k.pipe('stainless', [xL, y, Math.sqrt(d.Rk ** 2 - (y - ycK) ** 2) - 0.02], [xL, y, zL], 0.05, 0.005)
    k.box('machined', [0.07, d.Rk * 1.0, 0.05], [xL, ycK, zL + 0.05])
    k.box('glass', [0.03, d.Rk * 0.9, 0.006], [xL, ycK, zL + 0.078])
  } else {
    const tin: V3 = bot(d.xn, Ro, yc)
    const toutX = d.odd && role !== 'upper' ? d.xnr : d.xn
    const tinX = role === 'upper' && d.odd ? d.xnr : d.xn
    if (role === 'single') {
      nz(top(d.xs1, Ro, yc), [0, 1, 0], sNps)
      nz(bot(d.xs2, Ro, yc), [0, -1, 0], sNps)
      nz(tin, [0, -1, 0], tNps)
      nz(top(toutX, Ro, yc), [0, 1, 0], tNps)
    } else if (role === 'lower') {
      nz(top(d.xs2, Ro, yc), [0, 1, 0], sNps, sI, false)
      nz(bot(d.xs1, Ro, yc), [0, -1, 0], sNps)
      nz(tin, [0, -1, 0], tNps)
      nz(top(toutX, Ro, yc), [0, 1, 0], tNps, sI, false)
      const ym = yc + Ro + sI + GASKET / 2
      jointBolting(k, sNps, p.rating, [d.xs2, ym, 0], [0, 1, 0])
      jointBolting(k, tNps, p.rating, [toutX, ym, 0], [0, 1, 0])
    } else {
      nz(top(d.xs1, Ro, yc), [0, 1, 0], sNps)
      nz(bot(d.xs2, Ro, yc), [0, -1, 0], sNps, sI, false)
      nz(bot(tinX, Ro, yc), [0, -1, 0], tNps, sI, false)
      nz(top(d.xn, Ro, yc), [0, 1, 0], tNps)
    }
    // shell vent and drain (blinded)
    const xv = d.rear === 'S' ? d.xShellEnd - d.Gc.tf - d.Gc.hubL - d.coneL - 0.18 : d.xShellEnd - 0.2
    const a = 0.6
    nz([xv, yc + Ro * Math.cos(a), Ro * Math.sin(a)], [0, Math.cos(a), Math.sin(a)], 1.5, 0.2, true, true)
    nz([xT1 + fl + 0.18, yc - Ro * Math.cos(a), Ro * Math.sin(a)], [0, -Math.cos(a), Math.sin(a)], 1.5, 0.2, true, true)
    // thermowell + gauge on the shell inlet side
    const xg = d.xs1 + pipeOD(sNps) * 0.9 + 0.1
    k.pipe('stainless', [xg, yc + Ro * Math.cos(0.8), Ro * Math.sin(0.8) - 0.01], [xg, yc + (Ro + 0.12) * Math.cos(0.8), (Ro + 0.12) * Math.sin(0.8)], 0.034, 0.004)
    gauge(k, [xg, yc + (Ro + 0.17) * Math.cos(0.8), (Ro + 0.17) * Math.sin(0.8)], [0, Math.cos(0.8), Math.sin(0.8)], 0.1, '°C', 200)
  }
  // channel / bonnet vent and drain on the front end (blinded)
  {
    const a = 0.75
    const x = d.front === 'A' ? d.xn + pipeOD(tNps) * 0.5 + 0.08 : d.xn
    for (const s of [1, -1]) nz([x, yc + s * Ro * Math.cos(a), Ro * Math.sin(a)], [0, s * Math.cos(a), Math.sin(a)], 1, 0.18, true, true)
  }

  // ---------------- saddles (fixed at the channel end, sliding at the rear), lugs, nameplate, earthing
  const Rs = d.kettle ? d.Rk : Ro
  const ys = d.kettle ? d.ycK : yc
  if (role !== 'upper')
    k.at([0, ys, 0], undefined, () => {
      saddle(k, d.saddles[0], Rs, -ys, { mat: P })
      saddle(k, d.saddles[1], Rs, -ys, { mat: P, sliding: true })
    })
  if (role !== 'lower') for (const x of d.saddles) liftingLug(k, [x + (x === d.saddles[0] ? 0.35 : -0.35), ys + Rs - 0.01, 0], 'x', clamp(Rs / 0.5, 0.8, 1.5), P)
  if (role !== 'lower') {
    const xp = d.saddles[0] + Math.min(0.9, (d.saddles[1] - d.saddles[0]) * 0.3)
    const a = -0.35
    const n = new THREE.Vector3(0, Math.sin(a), Math.cos(a))
    const c = (r: number): V3 => [xp, ys + n.y * r, n.z * r]
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    for (const dx of [-0.12, 0.12]) k.box(P, [0.02, 0.07, 0.06], [xp + dx, ys + n.y * (Rs + 0.03), n.z * (Rs + 0.03)], q)
    k.box(P, [0.36, 0.22, 0.006], c(Rs + 0.063), q)
    tagPlate(k, p.tag, c(Rs + 0.067), [0, n.y, n.z], 0.3)
  }
  if (role !== 'upper') earthBoss(k, [d.saddles[0] + 0.2, 0.12, Rs * 0.88 * 0.7], 'z')
}

// Hinged cover davit on the channel's +Z side: bracket, vertical post, arm over the cover, hook.
function davit(k: Kit, P: MatKey, d: Dims, xC: number) {
  const { Ro, G } = d
  const z = G.Rf + 0.09
  const xp = xC + d.G.tf + d.G.hubL + 0.08
  const yTop = G.Rf + 0.28
  for (const y of [-Ro * 0.35, Ro * 0.45]) {
    k.box(P, [0.12, 0.08, z - Ro * 0.9], [xp, y, (z + Ro * 0.9) / 2])
    k.cyl(P, 0.05, 0.1, [xp, y, z], 'y', 16)
  }
  k.cyl('flangeSteel', 0.03, yTop + Ro * 0.45, [xp, (yTop - Ro * 0.45) / 2, z], 'y', 12)
  const xa = xC - d.tcov / 2
  k.tube(P, [[xp, yTop, z], [xp, yTop + 0.12, z * 0.5], [xa, yTop + 0.12, 0]], 0.035, 10, 0.12)
  k.cyl(P, 0.04, 0.06, [xa, yTop + 0.08, 0], 'y', 10)
  k.rod('nut', [xa, yTop + 0.06, 0], [xa, G.Rf + 0.1, 0], 0.01, 6)
  k.torus('nut', 0.03, 0.008, [xa, G.Rf + 0.08, 0], 'z', 6, 14)
}

// Bolted stacking saddles between the two shells.
function stackingSaddles(k: Kit, p: P, d: Dims) {
  const yi = d.yc1 + d.Ro + d.gap / 2
  for (const [i, x] of d.saddles.entries()) {
    k.at([0, d.yc2, 0], undefined, () => saddle(k, x, d.Ro, yi - d.yc2, { mat: p.paint, sliding: i === 1 }))
    k.with(mat4([0, d.yc1, 0], undefined, [1, -1, 1]), () => saddle(k, x, d.Ro, -(yi - d.yc1), { mat: p.paint }))
  }
}
