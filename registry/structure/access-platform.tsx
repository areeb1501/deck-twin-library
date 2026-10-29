// Elevated access platform: four braced legs on anchored base plates, channel-framed grating deck, ISO 14122 guard rail, access by straight stair or caged ladder with self-closing gate.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { ladderRun, stairLength, stairRun } from './_access'
import { bar, basePlate, beamTOS, column, gate, gratingBay, gusset, railRun, sec } from './_steel'

export interface AccessPlatformProps {
  /** along X, m */
  length?: number
  /** along Z, m */
  width?: number
  /** walking surface height, m */
  height?: number
  access?: 'ladder' | 'stair' | 'none'
  leg?: string
  frame?: string
  finish?: 'galvanised' | 'painted'
}

export const defaults = {
  length: 3,
  width: 2,
  height: 3,
  access: 'ladder' as 'ladder' | 'stair' | 'none',
  leg: 'SHS 150x150x8',
  frame: 'UPN 200',
  finish: 'galvanised' as 'galvanised' | 'painted',
}

type P = typeof defaults

export function AccessPlatform(props: AccessPlatformProps & GroupProps) {
  const { length, width, height, access, leg, frame, finish, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { length, width, height, access, leg, frame, finish }), [length, width, height, access, leg, frame, finish])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default AccessPlatform

function build(k: Kit, p: P) {
  const mat: MatKey = p.finish === 'painted' ? 'structSteel' : 'galvanised'
  const L = Math.max(1.2, p.length)
  const W = Math.max(1, p.width)
  const H = Math.max(0.6, p.height)
  const F = sec(p.frame)
  const G = sec(p.leg)
  const tos = H - 0.03
  const x0 = -L / 2
  const x1 = L / 2
  const z0 = -W / 2
  const z1 = W / 2

  // deck: perimeter channels (toes out), cross members at ≤ 1.2 m, grating with bars spanning between them
  gratingBay(k, x0, z0, x1, z1, H, 'x')
  for (const s of [-1, 1]) beamTOS(k, x0, s * (W / 2 - F.b / 2), x1, s * (W / 2 - F.b / 2), tos, p.frame, mat)
  const nx = Math.max(1, Math.ceil(L / 1.2))
  for (let i = 0; i <= nx; i++) {
    const x = x0 + F.b / 2 + ((L - F.b) * i) / nx
    beamTOS(k, x, z0 + F.b, x, z1 - F.b, tos, i === 0 || i === nx ? p.frame : 'UPN 140', mat)
  }

  // legs: inset under the frame corners (and mid-span legs on long platforms), base plates, X-braced faces
  const lx = L > 5 ? [x0 + G.b / 2 + 0.05, 0, x1 - G.b / 2 - 0.05] : [x0 + G.b / 2 + 0.05, x1 - G.b / 2 - 0.05]
  const lz = [z0 + G.b / 2 + 0.05, z1 - G.b / 2 - 0.05]
  const yb = tos - F.d
  for (const x of lx)
    for (const z of lz) {
      const t = basePlate(k, x, 0, z, G.b + 0.15, G.b + 0.15, 0.02, 0.02, mat)
      column(k, x, z, t, yb, p.leg, mat)
      k.box(mat, [G.b + 0.04, 0.015, G.b + 0.04], [x, yb + 0.0075 - 0.015, z])
      for (const s of [-1, 1]) gusset(k, [x + s * G.b / 2, t, z], [s, 0, 0], [0, 1, 0], 0.06, 0.15, 0.01, mat)
    }
  if (yb > 1.6) {
    const yLo = 0.3
    const yHi = yb - 0.12
    // horizontal mid-height ties on tall platforms
    if (yb > 4) for (const z of lz) bar(k, [lx[0], yb / 2, z], [lx[lx.length - 1], yb / 2, z], 'L80x80x8', mat, [0, 0, 1])
    for (const z of lz)
      for (let i = 0; i < lx.length - 1; i++) {
        bar(k, [lx[i] + G.b / 2, yLo, z], [lx[i + 1] - G.b / 2, yHi, z], 'L80x80x8', mat, [0, 0, 1])
        bar(k, [lx[i + 1] - G.b / 2, yLo, z], [lx[i] + G.b / 2, yHi, z], 'L80x80x8', mat, [0, 0, 1])
      }
    for (const x of [lx[0], lx[lx.length - 1]]) {
      if (p.access === 'stair' && x < 0) continue
      bar(k, [x, yLo, lz[0] + G.b / 2], [x, yHi, lz[1] - G.b / 2], 'L80x80x8', mat, [1, 0, 0])
    }
  }

  // guard rails with the access opening
  const i = 0.03
  const yR = H
  const sw = Math.min(1.0, W - 0.4)
  const lw = 0.7
  if (p.access === 'stair') {
    railRun(k, [x0 + i, yR, z0 + i], [x1 - i, yR, z0 + i])
    railRun(k, [x0 + i, yR, z1 - i], [x1 - i, yR, z1 - i])
    railRun(k, [x1 - i, yR, z0 + i], [x1 - i, yR, z1 - i], { startPost: false, endPost: false })
    const gs = sw / 2 + sec('UPN 200').b
    railRun(k, [x0 + i, yR, z0 + i], [x0 + i, yR, -gs], { startPost: false })
    railRun(k, [x0 + i, yR, gs], [x0 + i, yR, z1 - i], { endPost: false })
    const run = stairLength(H, 35)
    k.at([x0 - run, 0, 0], undefined, () => stairRun(k, H, { width: sw, angle: 35, mat }))
  } else {
    railRun(k, [x0 + i, yR, z0 + i], [x1 - i, yR, z0 + i])
    railRun(k, [x0 + i, yR, z0 + i], [x0 + i, yR, z1 - i], { startPost: false })
    railRun(k, [x1 - i, yR, z0 + i], [x1 - i, yR, z1 - i], { startPost: false })
    if (p.access === 'ladder') {
      railRun(k, [x0 + i, yR, z1 - i], [-lw / 2, yR, z1 - i], { startPost: false })
      railRun(k, [lw / 2, yR, z1 - i], [x1 - i, yR, z1 - i], { endPost: false })
      gate(k, [-lw / 2, yR, z1 - i], [lw / 2, yR, z1 - i])
      // ladder on the +Z face, rungs 200 mm off the deck edge
      ladderRun(k, 0, 0, H, z1 + 0.2, { mat, standoff: 0.2 })
      for (let y = 0.6; y < yb - 0.3; y += 2) bar(k, [lx[0], y, z1 - 0.04], [lx[lx.length - 1], y, z1 - 0.04], 'L80x80x8', mat, [0, 0, 1])
      k.box(mat, [0.44, 0.01, 0.23], [0, H - 0.005, z1 + 0.1])
    } else railRun(k, [x0 + i, yR, z1 - i], [x1 - i, yR, z1 - i], { startPost: false, endPost: false })
  }
}
