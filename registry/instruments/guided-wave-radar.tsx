// Guided wave radar level transmitter: probe, process seal and Ex d head on a flanged top connection, optionally in an external cage with side connections. IEC 62828, ASME B16.5.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { GASKET_SPIRAL_WOUND, flange as flangeDims, type Rating } from '../lib/standards'
import { SS, chamber, exHead, tag as tagPlate, valveHandle, segFor } from './_parts'

export interface GuidedWaveRadarProps {
  /** external cage with two side process connections */
  chamber?: boolean
  /** probe length (direct mount) or centre-to-centre of the side connections (chamber), m */
  length?: number
  /** process connection size (direct-mount flange or cage side connections), inches */
  nps?: number
  /** cage pipe size, inches */
  chamberNps?: number
  rating?: Rating
  housing?: MatKey
  tag?: string
}

export const defaults = { chamber: false, length: 1.5, nps: 2, chamberNps: 3, rating: 300 as Rating, housing: 'actuatorBlue' as MatKey, tag: 'LT-1101' }

type P = typeof defaults

const STANDOUT = 0.25 // typical side-connection face distance from the cage axis

export function ports(props: GuidedWaveRadarProps = {}): Port[] {
  const p = { ...defaults, ...props }
  if (!p.chamber) return [port('process', 'Process connection', [0, 0, 0], [0, -1, 0], p.nps, p.rating)]
  return [
    port('upper', 'Upper connection', [-STANDOUT, p.length / 2, 0], [-1, 0, 0], p.nps, p.rating),
    port('lower', 'Lower connection', [-STANDOUT, -p.length / 2, 0], [-1, 0, 0], p.nps, p.rating),
  ]
}

export function GuidedWaveRadar(props: GuidedWaveRadarProps & GroupProps) {
  const { chamber: cage, length, nps, chamberNps, rating, housing, tag, ...group } = { ...defaults, ...props }
  const p = { chamber: cage, length, nps, chamberNps, rating, housing, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default GuidedWaveRadar

/** Instrument flange (RF facing -Y at y0) with process seal, neck and head above. */
function head(k: Kit, y0: number, nps: number, rating: Rating, housing: MatKey, tag: string) {
  const f = flangeDims(nps, rating)
  const rf = f.raisedFaceHeight
  const t = f.thickness
  k.lathe('machined', [[0.004, y0], [f.raisedFace / 2, y0], [f.raisedFace / 2, y0 + rf]], [0, 0, 0], 'y', segFor(f.od))
  k.lathe('flangeSteel', [[f.raisedFace / 2, y0 + rf], [f.od / 2, y0 + rf], [f.od / 2, y0 + rf + t], [0.02, y0 + rf + t]], [0, 0, 0], 'y', segFor(f.od))
  let y = y0 + rf + t
  k.cyl(SS, 0.028, 0.012, [0, y + 0.006, 0], 'y', 20)
  k.hex(SS, 0.062, 0.03, [0, y + 0.027, 0])
  k.cyl(SS, 0.022, 0.07, [0, y + 0.077, 0], 'y', 16)
  k.hex(SS, 0.046, 0.016, [0, y + 0.12, 0])
  y += 0.128
  const c: V3 = [0, y + 0.011 + 0.048 - 0.004, 0]
  exHead(k, c, housing, { r: 0.054 })
  tagPlate(k, tag, [0, y + 0.03, 0.0225], 'z', 0.06)
}

function build(k: Kit, p: P) {
  const g = GASKET_SPIRAL_WOUND
  if (!p.chamber) {
    head(k, 0, p.nps, p.rating, p.housing, p.tag)
    // single rigid lead with centring disc and end weight
    k.cyl(SS, 0.012, 0.03, [0, -0.015, 0], 'y', 16)
    k.cyl(SS, 0.004, p.length - 0.03, [0, -0.03 - (p.length - 0.03) / 2, 0], 'y', 12)
    k.cyl(SS, 0.011, 0.05, [0, -p.length + 0.025, 0], 'y', 16)
    return
  }
  const c = chamber(k, { cc: p.length, chamberNps: p.chamberNps, connNps: p.nps, rating: p.rating, standout: STANDOUT, top: 'gwr', mat: 'pipePaint' })
  const f = flangeDims(p.chamberNps, p.rating)
  head(k, c.yTop + g, p.chamberNps, p.rating, p.housing, p.tag)
  k.cyl('gasket', f.raisedFace / 2 + 0.006, g, [0, c.yTop + g / 2, 0], 'y', segFor(f.raisedFace))
  const span = 2 * (f.thickness + f.raisedFaceHeight) + g
  const studL = span + f.boltDia * 2.6
  const y0 = c.yTop + g / 2 - studL / 2
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, [0, y0, 0], 'y', f.boltDia, studL, [f.boltDia * 0.8, studL - f.boltDia * 0.8])
  // vent on the cage side below the top flange
  const yv = c.yTop - f.hubLength - f.raisedFaceHeight - 0.07
  k.cyl(SS, 0.0107, 0.05, [c.D / 2 + 0.022, yv, 0], 'x', 12)
  k.box(SS, [0.04, 0.034, 0.034], [c.D / 2 + 0.065, yv, 0])
  valveHandle(k, [c.D / 2 + 0.065, yv, 0.017], [0, 0, 1], 'actuatorRed', 0.9)
  k.cyl(SS, 0.0107, 0.026, [c.D / 2 + 0.098, yv, 0], 'x', 12)
  k.hex(SS, 0.026, 0.014, [c.D / 2 + 0.115, yv, 0], 'x')
}
