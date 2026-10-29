// Electromagnetic flowmeter: lined flanged sensor with coil housing, grounding rings with earth straps and an integral Ex d transmitter. ISO 13359 lay length, ISO 6817, ASME B16.5.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { dn, flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { SS, exHead, tag as tagPlate, flange, segFor } from './_parts'

export interface MagneticFlowmeterProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  liner?: 'ptfe' | 'rubber'
  housing?: MatKey
  tag?: string
}

export const defaults = { nps: 4, rating: 300 as Rating, liner: 'ptfe' as 'ptfe' | 'rubber', housing: 'actuatorBlue' as MatKey, tag: 'FT-4101' }

type P = typeof defaults

const RING_T = 0.003 // grounding ring thickness

/** ISO 13359 short face-to-face, m. */
function layLength(nps: number) {
  const d = dn(nps)
  const table: [number, number][] = [[50, 0.2], [80, 0.2], [100, 0.25], [150, 0.3], [200, 0.35], [250, 0.45], [300, 0.5], [350, 0.55], [400, 0.6], [500, 0.65], [600, 0.78]]
  for (const [max, L] of table) if (d <= max) return L
  return Math.max(0.78, d * 1.3e-3)
}

export function ports(props: MagneticFlowmeterProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const h = layLength(p.nps) / 2 + RING_T
  return [port('A', 'End A', [-h, 0, 0], [-1, 0, 0], p.nps, p.rating), port('B', 'End B', [h, 0, 0], [1, 0, 0], p.nps, p.rating)]
}

export function MagneticFlowmeter(props: MagneticFlowmeterProps & GroupProps) {
  const { nps, rating, liner, housing, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, liner, housing, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default MagneticFlowmeter

function build(k: Kit, p: P) {
  const L = layLength(p.nps)
  const D = pipeOD(p.nps)
  const f = flangeDims(p.nps, p.rating)
  const lt = p.liner === 'ptfe' ? 0.003 : 0.005
  const ri = D / 2 - pipeWall(p.nps, 'STD') - lt
  const rfR = f.raisedFace / 2
  const lining: MatKey = p.liner === 'ptfe' ? paint('#ecebe4', { metalness: 0, roughness: 0.6, clearcoat: 0, weather: 0 }) : 'rubberBlack'
  const seg = segFor(f.od)
  const xBack = L / 2 - 0.002 - f.raisedFaceHeight - f.thickness
  const Rh = Math.max(D / 2 * 1.25, f.od / 2 * 0.9)

  k.lathe(lining, [[ri, L / 2], [ri, -L / 2]], [0, 0, 0], 'x', seg)
  for (const s of [-1, 1] as const) {
    const ax = s > 0 ? 'x' : '-x'
    flange(k, p.nps, p.rating, [s * (L / 2 - 0.002), 0, 0], ax)
    k.at([s * (L / 2 - 0.002), 0, 0], ax, () => {
      // liner flared over the raised face, then the grounding ring
      k.lathe(lining, [[rfR * 0.97, 0], [rfR * 0.97, 0.002], [ri, 0.002]], [0, 0, 0], 'y', seg)
      k.lathe(SS, [[rfR * 0.96, 0.002], [rfR * 0.96, 0.002 + RING_T], [ri, 0.002 + RING_T], [ri, 0.002]], [0, 0, 0], 'y', seg)
    })
    // ring tab (between bolts at +Z) and braided earth strap to a boss on the housing
    const xr = s * (L / 2 + RING_T / 2)
    k.box(SS, [RING_T, 0.022, f.od / 2 + 0.03 - rfR * 0.9], [xr, 0, (f.od / 2 + 0.03 + rfR * 0.9) / 2])
    const boss: V3 = [s * (xBack - 0.03), 0, Rh]
    k.hex(SS, 0.016, 0.008, [boss[0], 0, Rh + 0.003], 'z')
    k.spline('copper', [[xr, 0, f.od / 2 + 0.02], [s * (L / 2 - 0.01), 0.004, f.od / 2 + 0.035], [s * (xBack - 0.01), 0.004, Rh + 0.02], [boss[0], 0, Rh + 0.007]], 0.003, 6, 24)
  }
  // coil housing between the flange backs, with weld bands
  const len = 2 * xBack - 0.004
  k.cyl('equipmentPaint', Rh, len, [0, 0, 0], 'x', segFor(2 * Rh))
  for (const s of [-1, 1]) k.cyl('equipmentPaint', Rh + 0.004, 0.012, [s * (len / 2 - 0.006), 0, 0], 'x', segFor(2 * Rh))
  for (const s of [-1, 1]) k.cyl('equipmentPaint', 0.02, 0.008, [s * len * 0.25, -Rh - 0.003, 0], 'y', 12)

  // integral transmitter on a junction neck
  k.cyl(p.housing, 0.036, 0.07, [0, Rh + 0.03, 0], 'y', 24)
  k.cyl(p.housing, 0.042, 0.016, [0, Rh + 0.064, 0], 'y', 24)
  exHead(k, [0, Rh + 0.072 + 0.011 + 0.048 - 0.004, 0], p.housing)
  tagPlate(k, p.tag, [0, Rh + 0.03, 0.0365], 'z', 0.06)
}
