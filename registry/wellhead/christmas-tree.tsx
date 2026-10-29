// Surface wellhead and christmas tree: casing head, tubing head spool, adapter, LMV, hydraulic SSV, studded cross, swab, cap, wings with choke. API 6A / API 6B-6BX.
import { Kit, eul, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange as asmeFlange, gauge, pipeRun, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { elbow90, flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { apiBore, apiFlange, apiGateLength, asmeEquivalent, type Psi } from './_api6a'
import { BASE_Y, buildWellhead } from './_wellhead'
import { BODY, G, NUT, SS, STUD, angleChoke, boredBlock, flangeBore, at, chokeDims, crossover, crossoverLength, flangeAt, flowTee, frame, gateValve, joint, needleValve, spacer, studded, tubing } from './_wellparts'

export interface ChristmasTreeProps {
  /** API 6A working pressure, psi */
  pressureRating?: Psi
  /** tree nominal bore, inches (2-1/16 … 4-1/16) */
  bore?: number
  wellType?: 'producer' | 'injector' | 'gas'
  /** casing head + tubing head spool height, m */
  wellheadHeight?: number
  /** flowline size after the choke, NPS */
  flowlineNps?: number
  /** ASME class of the flowline flange after the choke */
  flowlineRating?: Rating
  /** choke stem position, 0 closed … 1 open */
  choke?: number
  tag?: string
}

export const defaults = {
  pressureRating: 5000 as Psi,
  bore: 3.125,
  wellType: 'producer' as 'producer' | 'injector' | 'gas',
  wellheadHeight: 1.1,
  flowlineNps: 4,
  flowlineRating: 1500 as Rating,
  choke: 0.5,
  tag: 'XT-101',
}

type P = typeof defaults

const KILL_BORE = 2.0625

function layout(p: P) {
  const psi = p.pressureRating
  const dB = apiFlange(p.bore, psi)
  const dK = apiFlange(KILL_BORE, psi)
  const dO = apiFlange(apiBore(p.flowlineNps + 0.0625, psi), psi)
  const F11 = apiFlange(11, psi)
  const T = BASE_Y + p.wellheadHeight
  const hv = apiGateLength(dB.bore, psi)
  const aH = G * 2 + F11.t + dB.t + 0.09
  const yLMV = T + aH
  const ySSV = yLMV + hv
  const cH = Math.max(dB.od, dK.od) * 0.48
  const yC = ySSV + hv + cH
  const yS = yC + cH
  // production wing (+X): wing valve, flow tee, angle choke, flowline spool turning down then +X
  const Lw = hv
  const Lt = Math.max(0.16, 2 * (G + dB.t) + 0.08)
  const ch = chokeDims(dB, dO)
  const xCh = cH + Lw + Lt + ch.inlet
  const R = elbow90(p.flowlineNps)
  const fl = flangeDims(p.flowlineNps, p.flowlineRating)
  const flL = fl.hubLength + fl.raisedFaceHeight
  const yOut = yC - ch.outlet
  const yE = yOut - G - dO.t - 0.06 - R
  const xP = xCh + R + 0.12 + flL
  // kill wing (-X): manual gate valve + crossover
  const Lk = apiGateLength(KILL_BORE, psi)
  const kr = asmeEquivalent(psi)
  const Lx = crossoverLength(dK, 2, kr, 0.08)
  const xK = -(cH + Lk + Lx)
  return { psi, dB, dK, dO, F11, T, hv, yLMV, ySSV, cH, yC, yS, Lw, Lt, ch, xCh, R, flL, yOut, yE, xP, Lk, kr, Lx, xK }
}

export function ports(props: ChristmasTreeProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const L = layout(p)
  return [
    port('production', p.wellType === 'injector' ? 'Injection inlet' : 'Production outlet', [L.xP, L.yE, 0], [1, 0, 0], p.flowlineNps, p.flowlineRating),
    port('kill', 'Kill wing', [L.xK, L.yC, 0], [-1, 0, 0], 2, L.kr, 'utility'),
  ]
}

export function ChristmasTree(props: ChristmasTreeProps & GroupProps) {
  const { pressureRating, bore, wellType, wellheadHeight, flowlineNps, flowlineRating, choke, tag, ...group } = { ...defaults, ...props }
  const p = { pressureRating, bore, wellType, wellheadHeight, flowlineNps, flowlineRating, choke, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ChristmasTree

function build(k: Kit, p: P) {
  const L = layout(p)
  const { dB, dK, dO, F11, T, hv, yLMV, ySSV, cH, yC, yS } = L
  const dialMax = L.psi >= 10000 ? 1000 : 400
  const hwD = 0.26 + dB.bore * 0.04

  buildWellhead(k, { psi: L.psi, height: p.wellheadHeight })

  // tubing-head adapter: 11" bottom flange to the tree bore
  k.at([0, T, 0], undefined, () => joint(k, F11, 0))
  {
    const yb0 = T + G + F11.t
    const yb1 = yLMV - G - dB.t
    const rw = Math.max(dB.od * 0.42, F11.od * 0.3)
    k.lathe(BODY, [[0.05, T + G], [F11.od / 2, T + G], [F11.od / 2, yb0], [rw, yb0], [dB.od * 0.34, Math.max(yb0 + 0.01, yb1 - 0.02)], [dB.od * 0.34, yb1], [dB.od / 2, yb1], [dB.od / 2, yLMV - G], [0.05, yLMV - G], [0.05, T + G]], [0, 0, 0], 'y', 40)
    k.hex('brass', 0.022, 0.016, [rw + 0.005, yb0 + 0.02, 0], 'x')
  }

  const vert = (y: number) => frame([0, y, 0], [0, 1, 0], [0, 0, 1])
  // lower master (manual)
  k.with(vert(yLMV), () => {
    joint(k, dB, 0)
    gateValve(k, dB, hv, { kind: 'handwheel', D: hwD })
    joint(k, dB, hv)
  })
  // upper master = surface safety valve with hydraulic piston actuator
  const ssvR = 0.09 + dB.bore * 0.012
  let ssvPort: V3 | null = null
  k.with(vert(ySSV), () => {
    ssvPort = gateValve(k, dB, hv, { kind: 'hydraulic', r: ssvR, len: 0.2 + dB.bore * 0.015, fusible: true })
  })
  const ssvP = at(vert(ySSV), ssvPort!)

  // studded cross
  k.at([0, yC, 0], 'x', () => boredBlock(k, BODY, [2 * cH, 2 * cH, 2 * cH * 0.92], dB.bore * 0.0127, [0, 0, 0], 0.012))
  k.with(frame([0, yC - cH, 0], [0, -1, 0], [0, 0, 1]), () => studded(k, dB, 0))
  k.with(frame([0, yC + cH, 0], [0, 1, 0], [0, 0, 1]), () => studded(k, dB, 0))
  k.with(frame([cH, yC, 0], [1, 0, 0], [0, 1, 0]), () => studded(k, dB, 0))
  k.with(frame([-cH, yC, 0], [-1, 0, 0], [0, 1, 0]), () => studded(k, dK, 0))
  tagPlate(k, p.tag, [0, yC, cH * 0.92 + 0.001], 'z', Math.min(0.17, cH * 1.6))

  // swab valve and tree cap with needle valve and gauge
  k.with(vert(yS), () => {
    gateValve(k, dB, hv, { kind: 'handwheel', D: hwD * 0.9 })
    joint(k, dB, hv)
    flangeAt(k, dB, hv, 1)
    let y = hv + G + dB.t
    const rc = dB.od * 0.3
    k.cyl(BODY, rc, 0.12, [0, y + 0.06, 0], 'y', 24)
    y += 0.12
    const ru = dB.od * 0.38
    k.cyl(BODY, ru, 0.075, [0, y + 0.0375, 0], 'y', 24)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      k.box(BODY, [0.07, 0.05, 0.035], [Math.cos(a) * (ru + 0.03), y + 0.0375, Math.sin(a) * (ru + 0.03)], eul(0, -a, 0))
    }
    y += 0.075
    // lift-thread nipple (EUE) on the cap
    k.cyl(BODY, rc * 0.7, 0.07, [0, y + 0.035, 0], 'y', 20)
    for (let i = 0; i < 6; i++) k.torus(BODY, rc * 0.7, 0.003, [0, y + 0.01 + i * 0.01, 0], 'y', 4, 24)
    y += 0.07
    needleValve(k, [0, y, 0], 'y')
    k.cyl(SS, 0.008, 0.06, [0, y + 0.13, 0], 'y', 8)
    gauge(k, [0, y + 0.2, 0], 'z', 0.1, 'bar', dialMax)
  })

  // production wing: hydraulic wing valve, flow tee (or check body on injectors), angle choke, flowline spool
  const Mw = frame([cH, yC, 0], [1, 0, 0], [0, 1, 0])
  let wingPort: V3 | null = null
  k.with(Mw, () => {
    wingPort = gateValve(k, dB, L.Lw, { kind: 'hydraulic', r: 0.08 + dB.bore * 0.01, len: 0.16 + dB.bore * 0.012 })
    joint(k, dB, L.Lw)
  })
  const x1 = cH + L.Lw
  const Mt = frame([x1, yC, 0], [1, 0, 0], [0, 1, 0])
  k.with(Mt, () => {
    if (p.wellType === 'injector') {
      // swing-check body: spacer with a bolted cover on top
      spacer(k, dB, L.Lt)
      const r = dB.od * 0.3
      k.cyl(BODY, r * 1.1, r + 0.03, [0, L.Lt / 2, (r + 0.03) / 2], 'z', 20)
      k.cyl(BODY, r * 1.35, 0.03, [0, L.Lt / 2, r + 0.045], 'z', 24)
      k.around(6, r * 1.2, [0, L.Lt / 2, r + 0.065], 'z', (q) => k.hex(NUT, 0.022, 0.014, q, 'z'))
    } else {
      const gz = flowTee(k, dB, L.Lt)
      gauge(k, [0, L.Lt / 2, gz + 0.06], 'z', 0.1, 'bar', dialMax)
    }
    joint(k, dB, L.Lt)
  })
  if (p.wellType !== 'injector') k.cyl(SS, 0.008, 0.07, at(Mt, [0, L.Lt / 2, dB.od * 0.3 + 0.18]), 'y', 8)
  // gas wells: MEG / methanol injection point on the wing
  if (p.wellType === 'gas') {
    const q = at(Mw, [0, L.Lw * 0.15, -(dB.od * 0.3)])
    k.cyl(SS, 0.012, 0.06, [q[0], q[1], q[2] - 0.03], 'z', 10)
    needleValve(k, [q[0], q[1], q[2] - 0.06], 'y', 'actuatorBlue')
    tubing(k, [[q[0], q[1] + 0.165, q[2] - 0.06], [q[0], q[1] + 0.25, q[2] - 0.06], [q[0], q[1] + 0.25, -0.45], [q[0], BASE_Y + 0.03, -0.45]], 0.006)
    // MEG supply bulkhead union on a stand at the deck
    k.hex('brass', 0.03, 0.03, [q[0], BASE_Y + 0.03, -0.45], 'y')
    k.box(SS, [0.12, 0.012, 0.12], [q[0], BASE_Y + 0.006, -0.45])
  }
  // angle choke, outlet down
  const op = p.wellType === 'gas' ? 'actuator' : 'handwheel'
  k.at([L.xCh, yC, 0], undefined, () => {
    k.at([-L.ch.inlet, 0, 0], undefined, () => k.with(frame([0, 0, 0], [1, 0, 0], [0, 1, 0]), () => joint(k, dB, 0)))
    angleChoke(k, dB, dO, op, p.choke)
  })
  // flowline spool: API companion at the choke outlet, LR elbow, B16.5 weld-neck
  k.with(frame([L.xCh, L.yOut, 0], [0, -1, 0], [1, 0, 0]), () => {
    joint(k, dO, 0)
    flangeAt(k, dO, 0, 1, 'flangeSteel')
  })
  const nps = p.flowlineNps
  const yTop = L.yOut - G - dO.t
  const rp = pipeOD(nps) / 2
  k.lathe('flangeSteel', [[rp - pipeWall(nps, '160'), yTop], [Math.max(rp * 1.3, dO.od * 0.3), yTop], [rp * 1.02, yTop - 0.04], [rp - pipeWall(nps, '160'), yTop - 0.04]], [0, 0, 0], 'y', 28)
  pipeRun(k, [[L.xCh, yTop - 0.035, 0], [L.xCh, L.yE, 0], [L.xP - L.flL + 0.002, L.yE, 0]], nps, { mat: 'pipePaint', schedule: '160' })
  asmeFlange(k, nps, p.flowlineRating, [L.xP, L.yE, 0], 'x', true)
  flangeBore(k, nps, p.flowlineRating, [L.xP, L.yE, 0], 'x', '160')
  // flowline support under the elbow
  const ys = L.yE - rp
  k.box('structSteel', [0.2, 0.012, rp * 1.6], [L.xP - L.flL - 0.15, ys - 0.006, 0])
  const sx = L.xP - L.flL - 0.15
  k.pipe('structSteel', [sx, 0.015, 0], [sx, ys - 0.012, 0], pipeOD(4), 0.006, 20)
  k.box('structSteel', [0.25, 0.015, 0.25], [sx, 0.0075, 0])
  for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) k.hex(NUT, 0.03, 0.02, [sx + dx * 0.09, 0.025, dz * 0.09])
  k.torus(STUD, rp + 0.008, 0.007, [sx, L.yE, 0], 'x', 6, 20, Math.PI)

  // kill wing: manual gate valve, crossover to B16.5
  k.with(frame([-cH, yC, 0], [-1, 0, 0], [0, 1, 0]), () => {
    gateValve(k, dK, L.Lk, { kind: 'handwheel', D: 0.22 })
    joint(k, dK, L.Lk)
  })
  k.with(frame([-(cH + L.Lk), yC, 0], [-1, 0, 0], [0, 0, 1]), () => crossover(k, dK, 2, L.kr, L.Lx))

  // hydraulic control lines (SSV, wing valve) down to a bulkhead plate on the deck, operator side (+Z)
  const HZ = 0.32
  const bx = 0.32
  k.box(SS, [0.22, 0.14, 0.012], [bx + 0.05, BASE_Y + 0.07, HZ + 0.32])
  k.box('structSteel', [0.24, 0.012, 0.08], [bx + 0.05, BASE_Y + 0.006, HZ + 0.32])
  if (wingPort) {
    const q = at(Mw, wingPort)
    tubing(k, [q, [q[0], q[1], HZ + 0.06], [bx + 0.1, q[1], HZ + 0.06], [bx + 0.1, BASE_Y + 0.07, HZ + 0.06], [bx + 0.1, BASE_Y + 0.07, HZ + 0.315]])
  }
  {
    const q = ssvP
    const x = Math.max(q[0] + 0.06, bx)
    tubing(k, [q, [x, q[1], q[2]], [x, q[1], HZ], [x, BASE_Y + 0.07, HZ], [x, BASE_Y + 0.07, HZ + 0.315]])
  }
}
