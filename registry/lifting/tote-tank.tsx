// Offshore chemical tote tank (portable offshore tank, DNV 2.7-1 / EN 12079-1): stainless tank in a lifting frame with fork pockets, manway, vent, level gauge, ball-valve outlet and 4-leg sling set.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { flange, member, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { SECTIONS, pipeOD, pipeWall } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { boxMM, padeyeShackle, slingSet } from './_rigging'

export interface ToteTankProps {
  /** tank capacity, litres */
  volume?: number
  /** frame colour */
  color?: string
  tag?: string
  liftingSet?: boolean
}

export const defaults = {
  volume: 1500,
  color: '#2d5fa8',
  tag: 'TT-101',
  liftingSet: true,
}

const NPS = 2
const RATING = 150

function dims(volume: number) {
  const V = Math.min(Math.max(volume, 400), 6000) / 1000
  const t = Math.cbrt(V / 1.15)
  const Lt = t
  const Ht = 1.15 * t
  const s = SECTIONS['SHS 100x100x6.3'].b
  const base = SECTIONS['RHS 200x100x8'].b
  const half = Lt / 2 + s + 0.06
  const yT0 = base + 0.06
  return { Lt, Ht, s, base, half, yT0, H: yT0 + Ht + 0.25, outlet: { y: yT0 + 0.12, z0: Lt / 2, zf: half - 0.03 } }
}

export function ports(p: ToteTankProps = {}): Port[] {
  const d = dims(p.volume ?? defaults.volume)
  return [port('outlet', 'Bottom outlet', [0, d.outlet.y, d.outlet.zf], [0, 0, 1], NPS, RATING, 'utility')]
}

export function ToteTank({ volume = defaults.volume, color = defaults.color, tag = defaults.tag, liftingSet = defaults.liftingSet, ...group }: ToteTankProps & GroupProps) {
  const data = useKit((k) => build(k, volume, color, tag, liftingSet), [volume, color, tag, liftingSet])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ToteTank

function build(k: Kit, volume: number, color: string, tag: string, lifting: boolean) {
  const d = dims(volume)
  const P = paint(color, { weather: 1 })
  const ss: MatKey = 'stainless'
  const { half, s, H, yT0, Lt, Ht } = d
  const sq = 'SHS 100x100x6.3'
  const e = half - s / 2

  // base frame (RHS laid flat) with two fork-pocket tunnels front to back
  const bb = d.base
  for (const sx of [-1, 1]) member(k, [sx * (half - bb / 2), 0.05, -half], [sx * (half - bb / 2), 0.05, half], 'RHS 200x100x8', P, [1, 0, 0])
  for (const sz of [-1, 1]) member(k, [-half + bb, 0.05, sz * (half - 0.05)], [half - bb, 0.05, sz * (half - 0.05)], 'RHS 200x100x8', P, [0, 0, 1])
  const fx = Math.min(0.3, half * 0.38)
  for (const sx of [-1, 1]) {
    const x = sx * fx
    boxMM(k, P, [x - 0.11, 0.0, -half + 0.1], [x + 0.11, 0.008, half - 0.1])
    boxMM(k, P, [x - 0.11, 0.092, -half + 0.1], [x + 0.11, 0.1, half - 0.1])
    for (const dx of [-0.11, 0.11]) boxMM(k, P, [x + dx - 0.004, 0.008, -half + 0.1], [x + dx + 0.004, 0.092, half - 0.1])
    for (const sz of [-1, 1]) boxMM(k, 'rubberBlack', [x - 0.105, 0.01, sz * (half + 0.001) - 0.001], [x + 0.105, 0.09, sz * (half + 0.001) + 0.001])
  }
  boxMM(k, P, [-half + bb, 0.1, -half + 0.1], [half - bb, 0.108, half - 0.1])
  // tank cradle bearers
  for (const sz of [-0.3, 0.3]) boxMM(k, P, [-half + bb, 0.108, sz * Lt - 0.04], [half - bb, yT0, sz * Lt + 0.04])
  // corner posts, top frame, side diagonals
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) member(k, [sx * e, 0.1, sz * e], [sx * e, H - s, sz * e], sq, P, [1, 0, 0])
  for (const sz of [-1, 1]) member(k, [-half, H - s / 2, sz * e], [half, H - s / 2, sz * e], sq, P)
  for (const sx of [-1, 1]) member(k, [sx * e, H - s / 2, -e + s / 2], [sx * e, H - s / 2, e - s / 2], sq, P)
  for (const sx of [-1, 1]) member(k, [sx * e, 0.15, -e + s / 2], [sx * e, H - s, e - s / 2], 'SHS 100x100x6.3', P)
  member(k, [-e + s / 2, 0.15, -e], [e - s / 2, H - s, -e], 'SHS 100x100x6.3', P)

  // stainless tank with sloped floor to the outlet, manway, vent, fill, level gauge
  k.rbox(paint('#c8cccf', { metalness: 0.55, roughness: 0.38, clearcoat: 0, weather: 0.3 }), [Lt, Ht, Lt], 0.06, [0, yT0 + Ht / 2, 0])
  const yTop = yT0 + Ht
  k.cyl(ss, 0.2, 0.08, [0, yTop + 0.04, 0], 'y', 32)
  k.cyl(ss, 0.215, 0.025, [0, yTop + 0.09, 0], 'y', 32)
  k.torus('galvanised', 0.215, 0.012, [0, yTop + 0.08, 0], 'y', 6, 32)
  k.cyl('rubberBlack', 0.03, 0.05, [0.2, yTop + 0.09, 0], 'x', 10)
  k.cyl(ss, 0.03, 0.12, [-Lt * 0.3, yTop + 0.06, -Lt * 0.3], 'y', 12)
  k.cyl('brass', 0.05, 0.06, [-Lt * 0.3, yTop + 0.15, -Lt * 0.3], 'y', 14)
  k.cyl(ss, 0.05, 0.06, [Lt * 0.3, yTop + 0.03, -Lt * 0.3], 'y', 16)
  k.cyl('actuatorRed', 0.055, 0.03, [Lt * 0.3, yTop + 0.075, -Lt * 0.3], 'y', 16)
  const gx = Lt / 2 - 0.12
  for (const y of [yT0 + 0.15, yTop - 0.12]) k.rod(ss, [gx, y, Lt / 2], [gx, y, Lt / 2 + 0.06], 0.012, 8)
  k.cyl('glass', 0.018, yTop - yT0 - 0.27, [gx, (yTop + yT0 + 0.03) / 2, Lt / 2 + 0.06], 'y', 12)
  k.cyl(ss, 0.006, yTop - yT0 - 0.3, [gx + 0.03, (yTop + yT0 + 0.03) / 2, Lt / 2 + 0.06], 'y', 6)
  k.plane(textMaterial(`${Math.round(volume)} L`, '#f4f4ef', '#111111', 256, 96), 0.24, 0.09, [-Lt / 4, yTop - 0.15, Lt / 2 + 0.001])

  // bottom outlet: nozzle, 2" ball valve with lever, weld-neck flange (port face)
  const o = d.outlet
  const L = flange(k, NPS, RATING, [0, o.y, o.zf], [0, 0, 1], true)
  const od = pipeOD(NPS)
  k.pipe(ss, [0, o.y, o.z0 - 0.01], [0, o.y, o.zf - L], od, pipeWall(NPS, '40S'))
  const zv = (o.z0 + o.zf - L) / 2
  k.cyl(ss, od * 0.95, 0.11, [0, o.y, zv], 'z', 20)
  k.sphere(ss, od * 1.05, [0, o.y, zv], undefined, 18)
  k.cyl(ss, 0.012, 0.07, [0, o.y + od + 0.02, zv], 'y', 8)
  k.box('actuatorYellow', [0.2, 0.012, 0.03], [0.09, o.y + od + 0.06, zv])
  k.box('rubberBlack', [0.06, 0.03, 0.04], [0.19, o.y + od + 0.06, zv])

  // DNV data plate, tag plate, product label
  k.box('nameplate', [0.24, 0.16, 0.003], [-half * 0.35, 0.05, half + 0.002])
  k.plane(textMaterial('DNV 2.7-1', '#e9eae6', '#222222', 256, 64), 0.2, 0.05, [-half * 0.35, 0.09, half + 0.0036])
  if (tag) {
    tagPlate(k, tag, [half * 0.4, 0.05, half + 0.002], 'z', 0.24)
    k.plane(textMaterial(tag, color, '#ffffff', 512, 128), 0.5, 0.125, [0, H - s / 2, half + 0.002])
  }

  if (lifting) {
    const eyes: V3[] = []
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) eyes.push(padeyeShackle(k, [sx * e, H, sz * e], 'z', 1, P))
    slingSet(k, eyes, [0, H + Math.SQRT2 * e * 1.05, 0], 0.22, 0.011)
  }
}
