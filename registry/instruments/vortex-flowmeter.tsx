// Vortex flowmeter: flanged meter body with a bluff shedder bar across the bore, sensor neck and integral Ex d transmitter. ISO 12764, ASME B16.5.
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { textMaterial } from '../lib/textures'
import { flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { SS, exHead, flange, segFor, tag as tagPlate } from './_parts'

export interface VortexFlowmeterProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** neck length from the pipe top to the head (longer for hot service), m */
  neck?: number
  housing?: MatKey
  tag?: string
}

export const defaults = { nps: 3, rating: 300 as Rating, neck: 0.16, housing: 'actuatorBlue' as MatKey, tag: 'FT-3101' }

type P = typeof defaults

function dims(p: P) {
  const D = pipeOD(p.nps)
  const f = flangeDims(p.nps, p.rating)
  const endL = f.hubLength + f.raisedFaceHeight
  const L = Math.max(2 * endL + 0.06, 0.12 + 0.75 * D) // typical face-to-face
  return { D, f, endL, L }
}

export function ports(props: VortexFlowmeterProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const { L } = dims(p)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], p.nps, p.rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], p.nps, p.rating)]
}

export function VortexFlowmeter(props: VortexFlowmeterProps & GroupProps) {
  const { nps, rating, neck, housing, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, neck, housing, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default VortexFlowmeter

function build(k: Kit, p: P) {
  const { D, endL, L } = dims(p)
  const ri = D / 2 - pipeWall(p.nps, '80')
  const xb = L / 2 - endL
  const Rb = (D / 2) * 1.16
  for (const s of [-1, 1]) flange(k, p.nps, p.rating, [(s * L) / 2, 0, 0], s > 0 ? 'x' : '-x')
  // cast body between the flange hubs, open bore
  k.lathe(SS, [[D / 2, -xb - 0.002], [Rb, -xb + 0.008], [Rb, xb - 0.008], [D / 2, xb + 0.002]], [0, 0, 0], 'x', segFor(2 * Rb))
  k.lathe('pipeBore', [[ri, xb], [ri, -xb]], [0, 0, 0], 'x', segFor(2 * ri))
  // shedder bar (bluff body, flat face upstream) and sensing wing downstream
  const bw = ri * 0.56
  k.box(SS, [ri * 0.3, 2 * ri, bw], [-ri * 0.2, 0, 0])
  k.box(SS, [ri * 0.12, 2 * ri, bw * 0.55], [-ri * 0.02, 0, 0])
  k.box(SS, [ri * 0.5, 2 * ri, 0.003], [ri * 0.25, 0, 0])
  // sensor boss, neck with stiffening support, transmitter
  k.cyl(SS, 0.03, 0.03, [0, Rb + 0.01, 0], 'y', 20)
  k.hex(SS, 0.05, 0.016, [0, Rb + 0.033, 0])
  const y0 = Rb + 0.041
  const yN = D / 2 + p.neck
  k.cyl(SS, 0.02, yN - y0, [0, (y0 + yN) / 2, 0], 'y', 20)
  k.box(SS, [0.004, (yN - y0) * 0.8, 0.034], [0, y0 + (yN - y0) * 0.4, -0.02])
  k.cyl(p.housing, 0.03, 0.02, [0, yN + 0.004, 0], 'y', 20)
  exHead(k, [0, yN + 0.014 + 0.011 + 0.048 - 0.004, 0], p.housing)
  tagPlate(k, p.tag, [0, y0 + (yN - y0) * 0.55, 0.0205], 'z', 0.06)
  k.plane(textMaterial('FLOW  →', '#d8dcdf', '#1d2124', 512, 128), 0.08, 0.02, [0, Rb * 0.25, Rb * 0.97 + 0.001])
}
