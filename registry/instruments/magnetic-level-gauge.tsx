// Magnetic level gauge: float chamber with side connections, bicolour flag indicator and scale, drain and vent valves, optional clamp-on magnetostrictive transmitter and level switches. EN 13463 / IEC 62828, ASME B16.5.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, type Rating } from '../lib/standards'
import { levelFlagMaterial, levelScaleMaterial } from '../lib/textures'
import { SS, chamber, exHead, tag as tagPlate } from './_parts'

export interface MagneticLevelGaugeProps {
  /** centre-to-centre of the side connections, m */
  length?: number
  /** side connection size, inches */
  nps?: number
  /** chamber pipe size, inches */
  chamberNps?: number
  rating?: Rating
  /** indicated level, 0 … 1 of the scale */
  level?: number
  /** clamp-on magnetostrictive level transmitter */
  transmitter?: boolean
  /** clamp-on level switches (0 … 3) */
  switches?: number
  housing?: MatKey
  tag?: string
}

export const defaults = { length: 1.2, nps: 2, chamberNps: 3, rating: 300 as Rating, level: 0.55, transmitter: false, switches: 0, housing: 'actuatorBlue' as MatKey, tag: 'LG-1101' }

type P = typeof defaults

const STANDOUT = 0.25 // typical

export function ports(props: MagneticLevelGaugeProps = {}): Port[] {
  const p = { ...defaults, ...props }
  return [
    port('upper', 'Upper connection', [-STANDOUT, p.length / 2, 0], [-1, 0, 0], p.nps, p.rating),
    port('lower', 'Lower connection', [-STANDOUT, -p.length / 2, 0], [-1, 0, 0], p.nps, p.rating),
  ]
}

export function MagneticLevelGauge(props: MagneticLevelGaugeProps & GroupProps) {
  const { length, nps, chamberNps, rating, level, transmitter, switches, housing, tag, ...group } = { ...defaults, ...props }
  const p = { length, nps, chamberNps, rating, level, transmitter, switches, housing, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default MagneticLevelGauge

function build(k: Kit, p: P) {
  const c = chamber(k, { cc: p.length, chamberNps: p.chamberNps, connNps: p.nps, rating: p.rating, standout: STANDOUT, top: 'vent', mat: SS })
  const r = c.D / 2
  const f = flangeDims(p.chamberNps, p.rating)
  const hubL = f.hubLength + f.raisedFaceHeight

  // indicator rail on +Z: flags (bicolour wafers) and graduated scale behind a polycarbonate window
  const y0 = -p.length / 2 - 0.08
  const y1 = p.length / 2 + 0.08
  const len = y1 - y0
  const yc = (y0 + y1) / 2
  const zr = r + 0.004 + 0.016
  k.box('aluminium', [0.07, len + 0.03, 0.032], [0, yc, zr])
  const zf = zr + 0.0162
  k.plane(levelFlagMaterial(Math.min(1, Math.max(0, p.level))), 0.026, len, [0.01, yc, zf])
  k.plane(levelScaleMaterial(), 0.022, len, [-0.019, yc, zf])
  k.box('glass', [0.064, len, 0.003], [0, yc, zf + 0.002])
  for (const y of [y0 - 0.008, y1 + 0.008]) k.box('aluminium', [0.072, 0.014, 0.036], [0, y, zr + 0.002])

  // stainless band clamps holding the rail (and the options) to the chamber
  const bands = [-p.length / 2 + 0.1, 0, p.length / 2 - 0.1]
  for (const y of bands) {
    k.torus(SS, r + 0.002, 0.0025, [0, y, 0], 'y', 6, 28)
    k.box(SS, [0.03, 0.016, 0.008], [0, y, r + 0.004])
  }

  if (p.transmitter) {
    const xt = f.od / 2 + 0.03
    const yb = c.yBot + hubL + 0.02
    const yt = c.yTop - 0.01
    k.cyl(SS, 0.0125, yt - yb, [xt, (yb + yt) / 2, 0], 'y', 16)
    k.dome(SS, 0.0125, [xt, yb, 0], '-y', Math.PI / 2, 1, 12)
    for (const y of bands) k.box(SS, [xt - r, 0.02, 0.012], [(xt + r) / 2, y, 0])
    k.cyl(SS, 0.02, 0.04, [xt, yt + 0.02, 0], 'y', 16)
    exHead(k, [xt, yt + 0.04 + 0.011 + 0.048 - 0.004, 0], p.housing)
  }
  const n = Math.max(0, Math.min(3, Math.round(p.switches)))
  for (let i = 0; i < n; i++) {
    const y = -p.length / 2 + 0.15 + ((p.length - 0.3) * (i + 0.5)) / Math.max(n, 1)
    const zc = -(r + 0.04)
    k.rbox(p.housing, [0.07, 0.1, 0.06], 0.008, [0, y, zc])
    k.torus(SS, r + 0.002, 0.0025, [0, y, 0], 'y', 6, 28)
    k.hex('brass', 0.024, 0.016, [0, y - 0.058, zc], 'y')
    const tp: V3 = [0, y + 0.02, zc - 0.0305]
    k.box('nameplate', [0.04, 0.016, 0.001], tp)
  }
  tagPlate(k, p.tag, [0, y1 + 0.035, r + 0.002], 'z', 0.07)
}
