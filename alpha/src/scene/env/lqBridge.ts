/**
 * South bridge: Alpha production deck (z = 20) -> LQ main deck (z = 60), WORLD coordinates.
 *
 * 40 m through-truss (Pratt, 10 panels of 4 m, 3.2 m deep): bottom chords double as the walkway edge
 * girders, IPE 300 floor beams at every panel point carry IPE 200 stringers and a 3 m grated walkway whose
 * top is flush with both decks (world 28). Top struts + plan X-bracing over the walkway, plan X-bracing
 * under the floor. Handrails inside both trusses.
 * East side: utility pipe-lane shelf (floor-beam cantilevers every 4 m + IPE 200 runners under each of the
 * three pipe lines, top of steel = walkway level, where the piping engine drops its stanchions).
 * West side: ladder-type cable tray on brackets (every panel point) at x = trayX.
 * Bearings: pinned at Alpha, PTFE sliding with side guides at the LQ.
 */
import type { GeoBatch, V3 } from '../structure/batch'
import { bar, beamTOS, box, boxMinMax, spans, tube } from '../structure/batch'
import { railRun, type RailBatches } from '../structure/handrail'
import { gratingRect, type GratingBatches } from '../structure/panels'
import { BRIDGE_S } from '../../model/site'

const Y = 28 // walkway top, world

export const BRIDGE_GEOM = {
  /** truss chord centre lines (x) */
  xw: BRIDGE_S.walk.x0 - 0.15,
  xe: BRIDGE_S.walk.x1 + 0.15,
  /** chord width (x) — kept slim: tray / pipes run 0.2-0.25 m outside */
  cw: 0.15,
  depth: 3.2,
  panel: 4,
  /** pipe-lane shelf outer edge */
  shelfX: Math.max(...BRIDGE_S.pipeLane.x) + 0.35,
  tray: { x: BRIDGE_S.trayX, w: 0.4, y: Y + 0.25 },
}

export interface BridgeBatches {
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

export function buildSouthBridge(bb: BridgeBatches) {
  const G = BRIDGE_GEOM
  const { z0, z1 } = BRIDGE_S.walk
  const { x0: wx0, x1: wx1 } = BRIDGE_S.walk
  const n = Math.round((z1 - z0) / G.panel)
  const zp = Array.from({ length: n + 1 }, (_, i) => z0 + ((z1 - z0) * i) / n)
  const yb = Y - 0.03 - 0.2 // bottom chord centre (0.4 deep, top flush under the grating)
  const yt = Y + G.depth // top chord centre
  const cw = G.cw

  // ---- trusses
  for (const x of [G.xw, G.xe]) {
    bar(bb.steel, [x, yb, z0], [x, yb, z1], cw, 0.4)
    bar(bb.steel, [x, yt, z0 + 0.1], [x, yt, z1 - 0.1], cw, 0.2)
    zp.forEach((z, i) => {
      const end = i === 0 || i === n
      const zc = i === 0 ? z + 0.1 : i === n ? z - 0.1 : z
      bar(bb.steel, [x, Y - 0.03, zc], [x, yt + 0.1, zc], cw, end ? 0.2 : 0.13, [0, 0, 1])
    })
    // Pratt diagonals: from the top chord at the outer panel point down towards mid-span
    for (let i = 0; i < n; i++) {
      const za = zp[i]
      const zb = zp[i + 1]
      const firstHalf = i < n / 2
      const a: V3 = firstHalf ? [x, yt - 0.1, za] : [x, Y + 0.05, za]
      const b: V3 = firstHalf ? [x, Y + 0.05, zb] : [x, yt - 0.1, zb]
      bar(bb.steel, a, b, cw * 0.8, 0.11, [1, 0, 0])
    }
  }
  // top struts + plan X-bracing (rods) + portal knee braces at every panel point
  for (let i = 0; i <= n; i++) {
    const z = i === 0 ? zp[i] + 0.1 : i === n ? zp[i] - 0.1 : zp[i]
    bar(bb.steel, [G.xw, yt, z], [G.xe, yt, z], 0.12, 0.14)
    for (const [xa, xb] of [
      [G.xw, G.xw + 0.5],
      [G.xe, G.xe - 0.5],
    ])
      bar(bb.steel, [xa, yt - 0.55, z], [xb, yt - 0.05, z], 0.08, 0.08, [0, 0, 1])
    if (i < n) {
      const za = zp[i] + 0.1
      const zb = zp[i + 1] - 0.1
      tube(bb.steelDark, [G.xw, yt + 0.02, za], [G.xe, yt + 0.02, zb], 0.025, 6, true)
      tube(bb.steelDark, [G.xe, yt + 0.02, za], [G.xw, yt + 0.02, zb], 0.025, 6, true)
      // bottom plan bracing under the floor
      tube(bb.steelDark, [G.xw, Y - 0.38, za], [G.xe, Y - 0.38, zb], 0.03, 6, true)
      tube(bb.steelDark, [G.xe, Y - 0.38, za], [G.xw, Y - 0.38, zb], 0.03, 6, true)
    }
  }

  // ---- floor: floor beams, stringers, grating
  const tos = Y - 0.03
  const fb = zp.map((z, i) => (i === 0 ? z + 0.08 : i === n ? z - 0.08 : z))
  for (const z of fb) beamTOS(bb.steelDark, G.xw + cw / 2, z, G.xe - cw / 2, z, tos, 'IPE 300')
  const cuts = fb.map((z) => ({ at: z, half: 0.075 }))
  for (const x of [wx0 + 0.75, (wx0 + wx1) / 2, wx1 - 0.75]) for (const [a, b] of spans(z0, z1, cuts)) beamTOS(bb.steelDark, x, a, x, b, tos, 'IPE 200')
  for (let z = z0 + 0.01; z < z1 - 0.02; z += 1) gratingRect(bb.grating, wx0, z, wx1, Math.min(z + 1, z1 - 0.01), Y)
  // walkway handrails inside both trusses
  for (const x of [wx0 + 0.05, wx1 - 0.05]) railRun(bb.rail, [x, Y, z0 + 0.05], [x, Y, z1 - 0.05])

  // ---- east pipe-lane shelf: cantilevers at every panel point + runners under each pipe line
  const shelfTos = Y - 0.2 // runners (IPE 200) sit on the cantilevers, their top = walkway level
  for (const z of fb) {
    beamTOS(bb.steelDark, G.xe + cw / 2, z, G.shelfX, z, shelfTos, 'IPE 300')
    // knee brace back to the vertical
    bar(bb.steelDark, [G.shelfX - 0.15, shelfTos - 0.3, z], [G.xe + cw / 2, Y - 1.1, z], 0.06, 0.08)
    bar(bb.steelDark, [G.xe + cw / 2, Y - 1.1, z], [G.xe + cw / 2, yb - 0.2, z], 0.06, 0.08)
  }
  for (const x of BRIDGE_S.pipeLane.x) beamTOS(bb.steel, x, z0 + 0.05, x, z1 - 0.05, Y, 'IPE 200')
  // shelf edge angle (toe) on the outboard side
  bar(bb.steelDark, [G.shelfX - 0.03, Y - 0.08, z0 + 0.05], [G.shelfX - 0.03, Y - 0.08, z1 - 0.05], 0.01, 0.16)

  // ---- west cable tray at x = trayX, on brackets from the truss verticals
  {
    const T = G.tray
    const xa = T.x - T.w / 2
    const xb = T.x + T.w / 2
    for (const x of [xa, xb]) bar(bb.tray, [x, T.y + 0.05, z0 + 0.05], [x, T.y + 0.05, z1 - 0.05], 0.004, 0.1)
    for (let z = z0 + 0.15; z < z1 - 0.1; z += 0.3) box(bb.tray, [T.x, T.y + 0.008, z], [T.w, 0.016, 0.03])
    for (const [dx, r] of [
      [-0.1, 0.022],
      [-0.04, 0.018],
      [0.03, 0.025],
      [0.11, 0.016],
    ] as [number, number][])
      tube(bb.cable, [T.x + dx, T.y + 0.016 + r, z0 + 0.05], [T.x + dx, T.y + 0.016 + r, z1 - 0.05], r, 6, true)
    for (const z of fb) {
      const xc = G.xw - cw / 2
      bar(bb.galv, [xc, T.y - 0.02, z], [xa - 0.05, T.y - 0.02, z], 0.05, 0.04)
      bar(bb.galv, [xc, T.y - 0.32, z], [xa + 0.05, T.y - 0.04, z], 0.04, 0.03)
    }
  }

  // ---- lighting on alternate verticals (inside, both sides)
  for (let i = 1; i < n; i += 2) {
    for (const [x, d] of [
      [G.xw + cw / 2, 1],
      [G.xe - cw / 2, -1],
    ] as [number, number][]) {
      const z = zp[i]
      bar(bb.lampBody, [x, Y + 2.6, z], [x + d * 0.25, Y + 2.6, z], 0.04, 0.04)
      box(bb.lampBody, [x + d * 0.3, Y + 2.58, z], [0.16, 0.1, 0.5])
      box(bb.lamp, [x + d * 0.3, Y + 2.52, z], [0.12, 0.03, 0.44])
    }
  }

  // ---- bearings: corbels off each deck edge under the bottom chords
  for (const x of [G.xw, G.xe]) {
    // Alpha end: fixed (pinned) bearing
    const za = z0
    boxMinMax(bb.steelDark, [x - 0.25, Y - 1.25, za - 0.45], [x + 0.25, Y - 0.62, za + 0.6])
    bar(bb.steelDark, [x, Y - 1.25, za - 0.45], [x, Y - 0.35, za - 0.45], 0.3, 0.05, [0, 0, 1])
    boxMinMax(bb.galv, [x - 0.2, Y - 0.62, za + 0.05], [x + 0.2, Y - 0.43, za + 0.5])
    // LQ end: PTFE sliding bearing with side guides
    const zb = z1
    boxMinMax(bb.steelDark, [x - 0.3, Y - 1.25, zb - 0.6], [x + 0.3, Y - 0.66, zb + 0.45])
    bar(bb.steelDark, [x, Y - 1.25, zb + 0.45], [x, Y - 0.35, zb + 0.45], 0.3, 0.05, [0, 0, 1])
    boxMinMax(bb.galv, [x - 0.28, Y - 0.66, zb - 0.58], [x + 0.28, Y - 0.6, zb - 0.02])
    boxMinMax(bb.white, [x - 0.18, Y - 0.6, zb - 0.5], [x + 0.18, Y - 0.57, zb - 0.1])
    boxMinMax(bb.galv, [x - 0.18, Y - 0.57, zb - 0.5], [x + 0.18, Y - 0.43, zb - 0.1])
    for (const dx of [-0.25, 0.25]) boxMinMax(bb.steelDark, [x + dx - 0.025, Y - 0.6, zb - 0.55], [x + dx + 0.025, Y - 0.45, zb - 0.05])
  }
}
