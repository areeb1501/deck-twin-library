// Platform link bridge: Warren through-truss (CHS or HEB) with plan bracing, grating walkway, ISO 14122 handrails, cable trays, pinned and PTFE sliding bearings.
import type { Kit, MatKey, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { bar, beamTOS, boxMM, bolt, gratingBay, gusset, hazardBand, railRun, sec } from './_steel'
import { ladderTray } from './_tray'

export interface BridgeProps {
  /** span, bearing to bearing, m */
  length?: number
  /** clear walkway width, m */
  width?: number
  /** truss depth, chord centre to chord centre, m */
  depth?: number
  truss?: 'chs' | 'heb'
  cableTrays?: boolean
  /** outrigger shelf on −Z for a pipe lane */
  pipeShelf?: boolean
  lights?: boolean
}

export const defaults = {
  length: 40,
  width: 1.5,
  depth: 3.2,
  truss: 'chs' as 'chs' | 'heb',
  cableTrays: true,
  pipeShelf: true,
  lights: true,
}

type P = typeof defaults

export function Bridge(props: BridgeProps & GroupProps) {
  const { length, width, depth, truss, cableTrays, pipeShelf, lights, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { length, width, depth, truss, cableTrays, pipeShelf, lights }), [length, width, depth, truss, cableTrays, pipeShelf, lights])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Bridge

function build(k: Kit, p: P) {
  const st: MatKey = 'structSteel'
  const dark: MatKey = 'structSteelDark'
  const L = Math.max(8, p.length)
  const W = Math.max(0.8, p.width)
  const chs = p.truss === 'chs'
  const CH = chs ? 'CHS 323.9x12.5' : 'HEB 260'
  const DG = chs ? 'CHS 168.3x8' : 'HEB 160'
  const TL = chs ? 'CHS 114.3x6.3' : 'L100x100x10'
  const C = sec(CH)
  const D = Math.max(2.4, p.depth)
  const cross = 'IPE 240'
  const X = sec(cross)
  const yb = -0.03 - X.d / 2 // bottom chord centre on the cross-beam centre line
  const yt = yb + D
  const zt = W / 2 + 0.12 + C.b / 2 // truss planes
  const n = Math.max(2, Math.round(L / (D * 1.15)))
  const pw = L / n
  const xb = Array.from({ length: n + 1 }, (_, i) => -L / 2 + i * pw)
  const xt = Array.from({ length: n }, (_, i) => -L / 2 + (i + 0.5) * pw)
  const chord = (a: V3, b: V3) => bar(k, a, b, CH, st, chs ? [0, 1, 0] : [0, 0, 1])
  const diag = (a: V3, b: V3) => bar(k, a, b, DG, st, chs ? [0, 1, 0] : [0, 0, 1])

  // ---- two Warren trusses
  for (const s of [-1, 1]) {
    const z = s * zt
    chord([-L / 2, yb, z], [L / 2, yb, z])
    chord([xt[0], yt, z], [xt[n - 1], yt, z])
    for (let i = 0; i < n; i++) {
      diag([xb[i], yb, z], [xt[i], yt, z])
      diag([xt[i], yt, z], [xb[i + 1], yb, z])
    }
    // end plates on the open chord ends and node plates (HEB) / node cans (CHS)
    for (const x of [-L / 2, L / 2]) k.box(st, [0.02, C.d + 0.04, C.b + 0.04], [x + (x < 0 ? -0.01 : 0.01), yb, z])
    for (const x of [xt[0], xt[n - 1]]) k.box(st, [0.02, C.d + 0.04, C.b + 0.04], [x + (x === xt[0] ? -0.01 : 0.01), yt, z])
    if (!chs) {
      for (const x of xb.slice(1, -1)) nodePlate(k, x, yb + C.d / 2, z, 1, C.b)
      for (const x of xt) nodePlate(k, x, yt - C.d / 2, z, -1, C.b)
    }
  }

  // ---- deck: cross beams at bottom nodes, stringers, grating, bottom plan bracing
  for (const x of xb) {
    beamTOS(k, x, -zt + C.b / 2, x, zt - C.b / 2, -0.03, cross, st)
    for (const s of [-1, 1]) for (const dy of [-0.06, 0.06]) bolt(k, [x + 0.07, -0.03 - X.d / 2 + dy, s * (zt - C.b / 2 - 0.01)], [0, 0, 1], 0.02, 0.04)
  }
  const ns = Math.max(2, Math.ceil(W / 0.8) + 1)
  const zs = Array.from({ length: ns }, (_, i) => -W / 2 - 0.05 + ((W + 0.1) * i) / (ns - 1))
  for (const z of zs)
    for (let i = 0; i < n; i++) beamTOS(k, xb[i] + X.b / 2 + 0.005, z, xb[i + 1] - X.b / 2 - 0.005, z, -0.03, 'UPN 160', st)
  for (let i = 0; i < n; i++) gratingBay(k, xb[i], -W / 2 - 0.1, xb[i + 1], W / 2 + 0.1, 0, 'z')
  for (let i = 0; i < n; i++) {
    const y = yb - X.d / 2 + 0.05
    bar(k, [xb[i], y, -zt], [xb[i + 1], y, zt], 'L100x100x10', dark)
    bar(k, [xb[i], y, zt], [xb[i + 1], y, -zt], 'L100x100x10', dark)
  }

  // ---- top: cross struts at top nodes, X laterals, walkway lights
  for (const x of xt) bar(k, [x, yt, -zt + C.b / 2], [x, yt, zt - C.b / 2], chs ? 'CHS 168.3x8' : 'HEB 160', st)
  for (let i = 0; i < n - 1; i++) {
    bar(k, [xt[i], yt + 0.02, -zt], [xt[i + 1], yt + 0.02, zt], TL, dark)
    bar(k, [xt[i], yt - 0.02, zt], [xt[i + 1], yt - 0.02, -zt], TL, dark)
  }
  if (p.lights)
    for (let i = 0; i < n; i += 2) {
      const x = xt[i]
      k.box('equipmentPaintDark', [0.5, 0.12, 0.2], [x + 0.35, yt - 0.18, 0])
      k.box('lampLens', [0.44, 0.02, 0.16], [x + 0.35, yt - 0.25, 0])
      k.box('galvanised', [0.04, 0.12, 0.04], [x + 0.35, yt - 0.08, 0])
    }

  // ---- handrails on both walkway edges (open at the ends where the bridge lands)
  for (const s of [-1, 1]) railRun(k, [-L / 2 + 0.05, 0, s * (W / 2 + 0.06)], [L / 2 - 0.05, 0, s * (W / 2 + 0.06)])

  // ---- outriggers at each bottom node: cable trays on +Z, pipe shelf on −Z
  const yo = yb + C.d / 2 - 0.02 // outrigger top of steel, flush with the chord top
  for (const x of xb.slice(1, -1)) {
    if (p.cableTrays) {
      beamTOS(k, x, zt + C.b / 2 - 0.01, x, zt + 1.15, yo, 'UPN 160', st)
      gusset(k, [x, yo - 0.16, zt + C.b / 2 - 0.01], [0, 0, 1], [0, -1, 0], 0.45, Math.max(0.08, C.d - 0.2), 0.012)
    }
    if (p.pipeShelf) {
      beamTOS(k, x, -zt - C.b / 2 + 0.01, x, -zt - 1.6, yo, 'HEB 160', st)
      gusset(k, [x, yo - 0.16, -zt - C.b / 2 + 0.01], [0, 0, -1], [0, -1, 0], 0.6, Math.max(0.08, C.d - 0.2), 0.012)
    }
  }
  if (p.pipeShelf) for (const z of [-zt - 0.75, -zt - 1.5]) beamTOS(k, -L / 2 + pw, z, L / 2 - pw, z, yo - 0.16, 'L80x80x8', dark)
  if (p.cableTrays) ladderTray(k, -L / 2 + pw, L / 2 - pw, zt + 0.62, yo, 0.6, { fill: 0.75 })

  // ---- expansion gap at the sliding end: hinged chequer-plate flap resting on the next deck
  const flap = Math.min(0.5, W * 0.4)
  for (const s of [-1, 1]) k.cyl('galvanised', 0.02, 0.12, [L / 2 - 0.02, -0.02, s * (W / 2 - 0.1)], 'z', 10)
  k.box('deckPlate', [flap, 0.01, W + 0.2], [L / 2 + flap / 2 - 0.02, 0.007, 0]) // rests 2 mm proud of the next deck
  hazardBand(k, [L / 2 + 0.02, 0.0135, -W / 2 - 0.1], [L / 2 + 0.02, 0.0135, W / 2 + 0.1], 0.08, 0.003)

  // ---- bearings: pinned at −X, PTFE sliding with guides at +X
  for (const s of [-1, 1]) {
    const z = s * zt
    for (const end of [-1, 1]) {
      const x = end * (L / 2 - 0.25)
      const y0 = yb - C.d / 2
      boxMM(k, st, [x - 0.25, y0 - 0.03, z - 0.25], [x + 0.25, y0, z + 0.25]) // sole plate
      if (end < 0) {
        boxMM(k, 'castIron', [x - 0.18, y0 - 0.16, z - 0.18], [x + 0.18, y0 - 0.03, z + 0.18])
        k.cyl('machined', 0.05, 0.4, [x, y0 - 0.1, z], 'z', 16)
        boxMM(k, st, [x - 0.3, y0 - 0.2, z - 0.3], [x + 0.3, y0 - 0.16, z + 0.3])
      } else {
        boxMM(k, 'stainless', [x - 0.2, y0 - 0.04, z - 0.2], [x + 0.2, y0 - 0.03, z + 0.2])
        boxMM(k, 'plasticGrey', [x - 0.16, y0 - 0.06, z - 0.16], [x + 0.16, y0 - 0.04, z + 0.16]) // PTFE
        boxMM(k, 'castIron', [x - 0.18, y0 - 0.16, z - 0.18], [x + 0.18, y0 - 0.06, z + 0.18])
        boxMM(k, st, [x - 0.45, y0 - 0.2, z - 0.3], [x + 0.45, y0 - 0.16, z + 0.3])
        for (const g of [-1, 1]) boxMM(k, st, [x - 0.45, y0 - 0.16, z + g * 0.22 - 0.025], [x + 0.45, y0 - 0.08, z + g * 0.22 + 0.025])
      }
    }
  }
}

/** Bolted gusset plates on both flange faces at a chord node (HEB truss), spreading from the chord edge at y towards `dir`. */
function nodePlate(k: Kit, x: number, y: number, z: number, dir: number, b: number) {
  for (const s of [-1, 1]) {
    const zz = z + s * (b / 2 + 0.008)
    k.box('structSteel', [0.75, 0.42, 0.016], [x, y + dir * 0.13, zz])
    for (const dx of [-0.25, -0.12, 0.12, 0.25]) bolt(k, [x + dx, y - dir * 0.05, zz], [0, 0, 1], 0.02, 0.016 + b * 0)
  }
}
