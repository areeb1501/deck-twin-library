// Instrument needle valve: forged bar-stock body with integral RF flanges, union bonnet, packing nut, rising stem and T-handle. ASME B16.34, MSS SP-99.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { faceToFace, type Rating } from '../lib/standards'
import { bore, clamp, dims, endFlange, plateText, plug, revolveX, useKit2 } from './_body'

export interface NeedleValveProps {
  /** nominal pipe size, inches (1/2 … 1) */
  nps?: number
  rating?: Rating
  /** stem lift, 0 closed … 1 open */
  open?: number
  body?: MatKey
  tag?: string
}

export const defaults = { nps: 0.5, rating: 600 as Rating, open: 1, body: 'stainless' as MatKey, tag: '' }

const size = (nps: number) => clamp(nps, 0.5, 1)
/** typical: needle stem lift, m */
const lift = (nps: number) => 0.004 + 0.004 * size(nps)

export function ports(p: NeedleValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const n = size(nps)
  const L = faceToFace('needle', n, rating)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], n, rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], n, rating)]
}

export function NeedleValve(props: NeedleValveProps & GroupProps) {
  const { nps, rating, open, body, tag, ...group } = { ...defaults, ...props }
  const n = size(nps)
  const [fixed, moving] = useKit2((k, mv) => build(k, mv, n, rating, body, tag), [n, rating, body, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} position-y={-(1 - clamp(open, 0, 1)) * lift(n)} />
    </group>
  )
}

export default NeedleValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, M: MatKey, tag: string) {
  const L = faceToFace('needle', nps, rating)
  const d = dims(nps, rating, L)
  const { D, f, xf } = d
  const rb = Math.max(0.004, D * 0.22)
  const rn = Math.max(D / 2 * 1.05, (f.hubDia / 2) * 0.85)
  for (const s of [-1, 1] as const) endFlange(k, d, s, rn, rb, M)
  // bar-stock block with necks to the flanges
  const b = clamp(0.032 + D * 0.5, 0.042, 0.07)
  revolveX(k, M, rb, [[rn, -xf - 0.003], [rn, -b * 0.45]], 24)
  revolveX(k, M, rb, [[rn, b * 0.45], [rn, xf + 0.003]], 24)
  k.rbox(M, [b, b * 1.05, b * 0.9], b * 0.06, [0, 0, 0])
  bore(k, rb, -L / 2, -b * 0.3)
  bore(k, rb, b * 0.3, L / 2)
  for (const s of [-1, 1]) k.disc('pipeBore', rb, [s * b * 0.3, 0, 0], s > 0 ? 'x' : '-x', 16)
  // body bleed plug, mounting holes, stamped tag
  plug(k, M, [0, -b * 0.2, b * 0.45], 'z', b * 0.16)
  for (const s of [-1, 1]) k.disc('pipeBore', b * 0.05, [s * b * 0.3, -b * 0.525 - 0.0005, 0], '-y', 10)
  tagPlate(k, tag || plateText(nps, rating), [0, b * 0.25, -b * 0.45 - 0.001], '-z', b * 0.9)
  // union bonnet (hex), bonnet body, panel nut, packing nut
  const y0 = b * 0.525
  k.hex(M, b * 0.82, b * 0.28, [0, y0 + b * 0.14, 0])
  k.cyl(M, b * 0.26, b * 0.5, [0, y0 + b * 0.28 + b * 0.25, 0], 'y', 20)
  k.hex(M, b * 0.62, b * 0.12, [0, y0 + b * 0.36, 0])
  k.hex('brass', b * 0.44, b * 0.18, [0, y0 + b * 0.78 + b * 0.09, 0])
  const yp = y0 + b * 0.96
  k.cyl('stainless', b * 0.035, b * 0.22, [b * 0.4, y0 + b * 0.14, 0], 'x', 8)
  // stem, T-handle and lock screw (moving, drawn open)
  const sr = b * 0.075
  mv.cyl(M, sr, b * 0.55, [0, yp + b * 0.2, 0], 'y', 12)
  const yh = yp + b * 0.48
  mv.cyl(M, sr * 1.8, b * 0.16, [0, yh, 0], 'y', 12)
  mv.cyl('handwheel', b * 0.055, b * 1.6, [0, yh, 0], 'x', 12)
  for (const s of [-1, 1]) mv.sphere('handwheel', b * 0.085, [s * b * 0.82, yh, 0], undefined, 12)
  mv.cyl('nut', sr * 0.5, sr * 2, [0, yh, b * 0.08], 'z', 6)
  mv.cyl('actuatorBlue', sr * 1.6, b * 0.03, [0, yh + b * 0.08 + 0.001, 0], 'y', 12)
}
