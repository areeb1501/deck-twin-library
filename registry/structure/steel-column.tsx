// Structural steel column (EN / AISC section) with stiffened base plate, anchor bolts, grout and optional concrete pedestal, and a cap plate.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { anchorBolt, boxMM, column, gusset, sec } from './_steel'

export interface SteelColumnProps {
  section?: string
  /** top of the cap plate above y = 0, m */
  height?: number
  /** web (depth) direction */
  web?: 'x' | 'z'
  /** concrete pedestal under the grout (0 = column on steel), m */
  pedestal?: number
  /** base plate thickness, m */
  plate?: number
  finish?: 'painted' | 'galvanised'
}

export const defaults = {
  section: 'HEB 300',
  height: 4,
  web: 'x' as 'x' | 'z',
  pedestal: 0.3,
  plate: 0.03,
  finish: 'painted' as 'painted' | 'galvanised',
}

type P = typeof defaults

export function SteelColumn(props: SteelColumnProps & GroupProps) {
  const { section, height, web, pedestal, plate, finish, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { section, height, web, pedestal, plate, finish }), [section, height, web, pedestal, plate, finish])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SteelColumn

function build(k: Kit, p: P) {
  const mat: MatKey = p.finish === 'galvanised' ? 'galvanised' : 'structSteel'
  const s = sec(p.section)
  const round = s.kind === 'CHS'
  // plan dimensions along the web (dx) and across it (dz), in the local frame before `web` is applied
  const dw = s.d
  const df = s.b
  const sx = p.web === 'x' ? dw : df
  const sz = p.web === 'x' ? df : dw
  const big = Math.max(dw, df)
  const bpX = sx + (big > 0.35 ? 0.3 : 0.2)
  const bpZ = sz + (big > 0.35 ? 0.3 : 0.2)
  const t = Math.max(0.015, p.plate)
  let y = 0
  if (p.pedestal > 0) {
    const px = bpX + 0.3
    const pz = bpZ + 0.3
    boxMM(k, 'concrete', [-px / 2, 0, -pz / 2], [px / 2, p.pedestal, pz / 2])
    y = p.pedestal
    // non-shrink grout bed with a chamfered edge
    k.box('concrete', [bpX + 0.06, 0.035, bpZ + 0.06], [0, y + 0.0175, 0])
    y += 0.035
  }
  k.box(mat, [bpX, t, bpZ], [0, y + t / 2, 0])
  const dia = big > 0.35 ? 0.03 : 0.024
  const n = big > 0.35 ? 3 : 2 // bolts per side along the long plate edge
  const ex = bpX / 2 - 0.05
  const ez = bpZ / 2 - 0.05
  for (let i = 0; i < n; i++) {
    const x = -ex + (2 * ex * i) / (n - 1)
    for (const sg of [-1, 1]) anchorBolt(k, x, y + t, sg * ez, dia)
  }
  const yb = y + t
  const top = Math.max(yb + 0.5, p.height)
  const tc = 0.02
  column(k, 0, 0, yb, top - tc, p.section, mat, p.web)
  k.box(mat, [sx + 0.04, tc, sz + 0.04], [0, top - tc / 2, 0])
  // base stiffeners: on the flange tips (I/H), on each face (box / round)
  const gh = Math.min(0.4, Math.max(0.15, big * 0.9))
  if (round) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) gusset(k, [dx * s.d / 2, yb, dz * s.d / 2], [dx, 0, dz], [0, 1, 0], (bpX - s.d) / 2 - 0.01, gh, 0.015, mat)
  } else if (s.kind === 'SHS' || s.kind === 'RHS') {
    for (const sg of [-1, 1]) {
      gusset(k, [sg * sx / 2, yb, 0], [sg, 0, 0], [0, 1, 0], (bpX - sx) / 2 - 0.01, gh, 0.015, mat)
      gusset(k, [0, yb, sg * sz / 2], [0, 0, sg], [0, 1, 0], (bpZ - sz) / 2 - 0.01, gh, 0.015, mat)
    }
  } else {
    // stiffeners in line with the web, outside each flange
    const along: [number, number] = p.web === 'x' ? [1, 0] : [0, 1]
    for (const sg of [-1, 1]) gusset(k, [along[0] * sg * dw / 2, yb, along[1] * sg * dw / 2], [along[0] * sg, 0, along[1] * sg], [0, 1, 0], (p.web === 'x' ? bpX - sx : bpZ - sz) / 2 - 0.01, gh, 0.015, mat)
  }
}
