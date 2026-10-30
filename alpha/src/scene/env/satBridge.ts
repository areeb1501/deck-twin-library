/**
 * Walkway bridges to the satellite platforms, WORLD coordinates (walkway top flush with the decks, y = 28):
 *  - west bridge BRIDGE_W: RP east edge (x = -70) → Alpha west edge (x = -30), along X, pipe lane on the
 *    NORTH side, cable tray on the south
 *  - north-north bridge BRIDGE_NN: WI south edge (z = -128) → WHP-N north edge (z = -88), along Z, pipe
 *    lane on the WEST side, cable tray on the east
 * Same 40 m Pratt through-truss as the north bridge (whpBridge.ts), written in a bridge frame: `s` along
 * the span (s0 = satellite end, s1 = the end it hangs from), `c` across it; the pipe-lane shelf is on the
 * low-c side and the tray on the high-c side. Pinned bearing at s1, PTFE sliding bearing at s0.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, beamTOS, box, boxMinMax, spans, tube } from '../structure/batch'
import { railRun, type RailBatches } from '../structure/handrail'
import { gratingRect, type GratingBatches } from '../structure/panels'
import { BRIDGE_NN, BRIDGE_W } from '../../model/site'

const Y = 28

export interface SatBridgeDef {
  axis: 'x' | 'z'
  /** span, satellite end → hanging end */
  s0: number
  s1: number
  /** walkway across the span */
  c0: number
  c1: number
  /** pipe-lane centres (c) */
  lanes: number[]
  dropInset: number
  trayC: number
}

export const WEST_BRIDGE: SatBridgeDef = {
  axis: 'x',
  s0: BRIDGE_W.walk.x0,
  s1: BRIDGE_W.walk.x1,
  c0: BRIDGE_W.walk.z0,
  c1: BRIDGE_W.walk.z1,
  lanes: BRIDGE_W.pipeLane.z,
  dropInset: BRIDGE_W.dropInset,
  trayC: BRIDGE_W.trayZ,
}
export const NN_BRIDGE: SatBridgeDef = {
  axis: 'z',
  s0: BRIDGE_NN.walk.z0,
  s1: BRIDGE_NN.walk.z1,
  c0: BRIDGE_NN.walk.x0,
  c1: BRIDGE_NN.walk.x1,
  lanes: BRIDGE_NN.pipeLane.x,
  dropInset: BRIDGE_NN.dropInset,
  trayC: BRIDGE_NN.trayX,
}

export interface SatBridgeBatches {
  steel: GeoBatch
  steelDark: GeoBatch
  grating: GratingBatches
  rail: RailBatches
  galv: GeoBatch
  white: GeoBatch
  tray: GeoBatch
  cable: GeoBatch
  lamp: GeoBatch
  lampBody: GeoBatch
}

export function buildSatBridge(d: SatBridgeDef, bb: SatBridgeBatches) {
  const X = d.axis === 'x'
  /** bridge frame → world */
  const p = (s: number, y: number, c: number): V3 => (X ? [s, y, c] : [c, y, s])
  /** bridge-frame direction → world */
  const v = (s: number, y: number, c: number): V3 => (X ? [s, y, c] : [c, y, s])
  const beam = (b: GeoBatch, sa: number, ca: number, sb: number, cb: number, tos: number, sec: Parameters<typeof beamTOS>[6]) =>
    X ? beamTOS(b, sa, ca, sb, cb, tos, sec) : beamTOS(b, ca, sa, cb, sb, tos, sec)
  const boxSC = (b: GeoBatch, s0: number, y0: number, c0: number, s1: number, y1: number, c1: number) => {
    const a = p(s0, y0, c0)
    const e = p(s1, y1, c1)
    boxMinMax(b, [Math.min(a[0], e[0]), y0, Math.min(a[2], e[2])], [Math.max(a[0], e[0]), y1, Math.max(a[2], e[2])])
  }
  const panel = 4
  const depth = 3.2
  const cw = 0.15
  const cA = d.c0 - 0.15 // shelf-side truss
  const cB = d.c1 + 0.15 // tray-side truss
  const shelfC = Math.min(...d.lanes) - 0.35
  const { s0, s1 } = d
  const dir = Math.sign(s1 - s0)
  const n = Math.round(Math.abs(s1 - s0) / panel)
  const sp = Array.from({ length: n + 1 }, (_, i) => s0 + ((s1 - s0) * i) / n)
  const yb = Y - 0.03 - 0.2
  const yt = Y + depth
  /** inset `e` metres from the ends toward the middle */
  const inS = (i: number, e: number) => (i === 0 ? sp[i] + dir * e : i === n ? sp[i] - dir * e : sp[i])

  // ---- trusses
  for (const c of [cA, cB]) {
    bar(bb.steel, p(s0, yb, c), p(s1, yb, c), cw, 0.4)
    bar(bb.steel, p(s0 + dir * 0.1, yt, c), p(s1 - dir * 0.1, yt, c), cw, 0.2)
    sp.forEach((_, i) => {
      const end = i === 0 || i === n
      const sc = inS(i, 0.1)
      bar(bb.steel, p(sc, Y - 0.03, c), p(sc, yt + 0.1, c), cw, end ? 0.2 : 0.13, v(1, 0, 0))
    })
    for (let i = 0; i < n; i++) {
      const firstHalf = i < n / 2
      const a = firstHalf ? p(sp[i], yt - 0.1, c) : p(sp[i], Y + 0.05, c)
      const b = firstHalf ? p(sp[i + 1], Y + 0.05, c) : p(sp[i + 1], yt - 0.1, c)
      bar(bb.steel, a, b, cw * 0.8, 0.11, v(0, 0, 1))
    }
  }
  for (let i = 0; i <= n; i++) {
    const s = inS(i, 0.1)
    bar(bb.steel, p(s, yt, cA), p(s, yt, cB), 0.12, 0.14)
    for (const [ca, cb] of [
      [cA, cA + 0.5],
      [cB, cB - 0.5],
    ])
      bar(bb.steel, p(s, yt - 0.55, ca), p(s, yt - 0.05, cb), 0.08, 0.08, v(1, 0, 0))
    if (i < n) {
      const sa = sp[i] + dir * 0.1
      const sb = sp[i + 1] - dir * 0.1
      tube(bb.steelDark, p(sa, yt + 0.02, cA), p(sb, yt + 0.02, cB), 0.025, 6, true)
      tube(bb.steelDark, p(sa, yt + 0.02, cB), p(sb, yt + 0.02, cA), 0.025, 6, true)
      tube(bb.steelDark, p(sa, Y - 0.38, cA), p(sb, Y - 0.38, cB), 0.03, 6, true)
      tube(bb.steelDark, p(sa, Y - 0.38, cB), p(sb, Y - 0.38, cA), 0.03, 6, true)
    }
  }

  // ---- floor: floor beams at the panel points, stringers, grating flush with the decks, handrails
  const tos = Y - 0.03
  const fb = sp.map((_, i) => inS(i, 0.08))
  for (const s of fb) beam(bb.steelDark, s, cA + cw / 2, s, cB - cw / 2, tos, 'IPE 300')
  const lo = Math.min(s0, s1)
  const hi = Math.max(s0, s1)
  const cuts = fb.map((s) => ({ at: s, half: 0.075 }))
  for (const c of [d.c0 + 0.75, (d.c0 + d.c1) / 2, d.c1 - 0.75]) for (const [a, b] of spans(lo, hi, cuts)) beam(bb.steelDark, a, c, b, c, tos, 'IPE 200')
  for (let s = lo + 0.01; s < hi - 0.02; s += 1) {
    const s2 = Math.min(s + 1, hi - 0.01)
    if (X) gratingRect(bb.grating, s, d.c0, s2, d.c1, Y)
    else gratingRect(bb.grating, d.c0, s, d.c1, s2, Y)
  }
  for (const c of [d.c0 + 0.05, d.c1 - 0.05]) railRun(bb.rail, p(lo + 0.05, Y, c), p(hi - 0.05, Y, c))

  // ---- pipe-lane shelf: cantilevers at every panel point + runners under each line
  const shelfTos = Y - 0.2
  for (const s of fb) {
    beam(bb.steelDark, s, shelfC, s, cA - cw / 2, shelfTos, 'IPE 300')
    bar(bb.steelDark, p(s, shelfTos - 0.3, shelfC + 0.15), p(s, Y - 1.1, cA - cw / 2), 0.06, 0.08)
    bar(bb.steelDark, p(s, Y - 1.1, cA - cw / 2), p(s, yb - 0.2, cA - cw / 2), 0.06, 0.08)
  }
  const inset = d.dropInset + 0.35
  for (const c of d.lanes) beam(bb.steel, lo + inset, c, hi - inset, c, Y, 'IPE 200')
  bar(bb.steelDark, p(lo + 0.05, Y - 0.08, shelfC + 0.03), p(hi - 0.05, Y - 0.08, shelfC + 0.03), 0.01, 0.16)
  for (const s of [lo + d.dropInset + 0.3, hi - d.dropInset - 0.3]) bar(bb.steelDark, p(s, Y - 0.1, shelfC + 0.05), p(s, Y - 0.1, cA - cw / 2), 0.08, 0.1)

  // ---- cable tray on the far side, on brackets from the truss verticals
  {
    const ty = Y + 0.25
    const w = 0.4
    const ca = d.trayC - w / 2
    const cb = d.trayC + w / 2
    for (const c of [ca, cb]) bar(bb.tray, p(lo + 0.05, ty + 0.05, c), p(hi - 0.05, ty + 0.05, c), 0.004, 0.1)
    for (let s = lo + 0.15; s < hi - 0.1; s += 0.3) box(bb.tray, p(s, ty + 0.008, d.trayC), X ? [0.03, 0.016, w] : [w, 0.016, 0.03])
    for (const [dc, r] of [
      [-0.11, 0.016],
      [-0.03, 0.025],
      [0.04, 0.018],
      [0.1, 0.022],
    ] as [number, number][])
      tube(bb.cable, p(lo + 0.05, ty + 0.016 + r, d.trayC + dc), p(hi - 0.05, ty + 0.016 + r, d.trayC + dc), r, 6, true)
    for (const s of fb) {
      const cc = cB + cw / 2
      bar(bb.galv, p(s, ty - 0.02, cc), p(s, ty - 0.02, cb + 0.05), 0.05, 0.04)
      bar(bb.galv, p(s, ty - 0.32, cc), p(s, ty - 0.04, cb - 0.05), 0.04, 0.03)
    }
  }

  // ---- lighting on alternate verticals (inside, both sides)
  for (let i = 1; i < n; i += 2) {
    for (const [c, k] of [
      [cA + cw / 2, 1],
      [cB - cw / 2, -1],
    ] as [number, number][]) {
      const s = sp[i]
      bar(bb.lampBody, p(s, Y + 2.6, c), p(s, Y + 2.6, c + k * 0.25), 0.04, 0.04)
      box(bb.lampBody, p(s, Y + 2.58, c + k * 0.3), X ? [0.5, 0.1, 0.16] : [0.16, 0.1, 0.5])
      box(bb.lamp, p(s, Y + 2.52, c + k * 0.3), X ? [0.44, 0.03, 0.12] : [0.12, 0.03, 0.44])
    }
  }

  // ---- bearings: corbels off each deck edge under the bottom chords
  for (const c of [cA, cB]) {
    // hanging end (s1): fixed (pinned) bearing
    const sa = s1
    boxSC(bb.steelDark, sa - dir * 0.6, Y - 1.25, c - 0.25, sa + dir * 0.45, Y - 0.62, c + 0.25)
    bar(bb.steelDark, p(sa + dir * 0.45, Y - 1.25, c), p(sa + dir * 0.45, Y - 0.35, c), 0.3, 0.05, v(1, 0, 0))
    boxSC(bb.galv, sa - dir * 0.5, Y - 0.62, c - 0.2, sa - dir * 0.05, Y - 0.43, c + 0.2)
    // satellite end (s0): PTFE sliding bearing with side guides
    const sb = s0
    boxSC(bb.steelDark, sb - dir * 0.45, Y - 1.25, c - 0.3, sb + dir * 0.6, Y - 0.66, c + 0.3)
    bar(bb.steelDark, p(sb - dir * 0.45, Y - 1.25, c), p(sb - dir * 0.45, Y - 0.35, c), 0.3, 0.05, v(1, 0, 0))
    boxSC(bb.galv, sb + dir * 0.02, Y - 0.66, c - 0.28, sb + dir * 0.58, Y - 0.6, c + 0.28)
    boxSC(bb.white, sb + dir * 0.1, Y - 0.6, c - 0.18, sb + dir * 0.5, Y - 0.57, c + 0.18)
    boxSC(bb.galv, sb + dir * 0.1, Y - 0.57, c - 0.18, sb + dir * 0.5, Y - 0.43, c + 0.18)
    for (const dc of [-0.25, 0.25]) boxSC(bb.steelDark, sb + dir * 0.05, Y - 0.6, c + dc - 0.025, sb + dir * 0.55, Y - 0.45, c + dc + 0.025)
  }
}
