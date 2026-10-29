// Double-pipe hairpin exchanger: two shell legs, bolted return-bend housing, closure flanges with tube-side ends, shell nozzles, clamp supports. TEMA / ASME VIII-1, ASME B16.5.
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { blindFlange, flange, gasket, member, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, nozzleStandout, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { basePlate } from './_lattice'
import { openNozzle } from './_thermal'

export interface HairpinExchangerProps {
  /** outer (shell) pipe size */
  shellNps?: number
  /** inner (tube) pipe size */
  tubeNps?: number
  /** leg length, closure flange to return-bend housing, m */
  length?: number
  rating?: Rating
  /** lower leg bottom above deck, m */
  elevation?: number
  tag?: string
  paint?: MatKey
}

export const defaults = {
  shellNps: 6,
  tubeNps: 3,
  length: 6,
  rating: 300 as Rating,
  elevation: 0.7,
  tag: 'E-400',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

function dims(p: P) {
  const tubeNps = Math.min(p.tubeNps, p.shellNps / 2)
  const Rs = pipeOD(p.shellNps) / 2
  const fs = flangeDims(p.shellNps, p.rating)
  const gap = Math.max(fs.od + 0.06, 2 * Rs + 0.2) // leg centre spacing clears the closure flanges
  const y1 = p.elevation + Rs
  const y2 = y1 + gap
  const L = p.length
  const x0 = -L / 2 // closure flange face (shell side)
  const x1 = L / 2 // return-end flange face
  const ft = flangeDims(tubeNps, p.rating)
  const tb = fs.thickness * 1.15 + 0.0045 // closure blind
  const tubeOut = 0.3 + ft.hubLength // inner pipe projection beyond the closure
  const xT = x0 - tb - tubeOut // tube-side flange face
  const so = nozzleStandout(p.shellNps, p.rating)
  // front nozzle head: short enlarged body behind the closure carrying the shell-side nozzle
  const Rh = Rs * 1.3 + 0.02
  const L0 = fs.hubLength + fs.raisedFaceHeight
  const hx0 = x0 + L0 - 0.005
  const hLen = 2 * Rs + 0.3
  const xs = hx0 + hLen / 2
  const hb = gap / 2 + Rs + 0.12 // return housing half height
  return { Rh, hx0, hLen, tubeNps, Rs, fs, gap, y1, y2, L, x0, x1, ft, tb, xT, so, xs, hb }
}

export function ports(props: HairpinExchangerProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  return [
    port('shell-in', 'Shell inlet', [d.xs, d.y2 + d.Rh + d.so, 0], [0, 1, 0], p.shellNps, p.rating),
    port('shell-out', 'Shell outlet', [d.xs, d.y1 - d.Rh - d.so, 0], [0, -1, 0], p.shellNps, p.rating),
    port('tube-in', 'Tube inlet', [d.xT, d.y1, 0], [-1, 0, 0], d.tubeNps, p.rating),
    port('tube-out', 'Tube outlet', [d.xT, d.y2, 0], [-1, 0, 0], d.tubeNps, p.rating),
  ]
}

export function HairpinExchanger(props: HairpinExchangerProps & GroupProps) {
  const { shellNps, tubeNps, length, rating, elevation, tag, paint, ...group } = { ...defaults, ...props }
  const p = { shellNps, tubeNps, length, rating, elevation, tag, paint } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default HairpinExchanger

function build(k: Kit, p: P) {
  const d = dims(p)
  const P = p.paint
  const { Rs, fs, x0, x1, y1, y2 } = d
  const sh = pipeOD(p.shellNps)
  for (const y of [y1, y2]) {
    // shell leg with weld-neck flanges both ends
    const L0 = fs.hubLength + fs.raisedFaceHeight
    const xh1 = d.hx0 + d.hLen
    k.cyl(P, d.Rh, d.hLen, [d.hx0 + d.hLen / 2, y, 0], 'x', 40)
    k.cyl(P, Rs, 0.12, [xh1 + 0.06, y, 0], 'x', 40, d.Rh)
    k.pipe(P, [xh1 + 0.11, y, 0], [x1 - L0, y, 0], sh, pipeWall(p.shellNps, '40'), 40)
    flange(k, p.shellNps, p.rating, [x0, y, 0], [-1, 0, 0])
    flange(k, p.shellNps, p.rating, [x1, y, 0], [1, 0, 0])
    // closure: blind with the inner pipe through a packed gland, tube-side flange
    blindFlange(k, p.shellNps, p.rating, [x0, y, 0], [-1, 0, 0])
    const xb = x0 - d.tb
    k.cyl('flangeSteel', pipeOD(d.tubeNps) / 2 + 0.03, 0.08, [xb - 0.04, y, 0], 'x', 24)
    k.boltCircle('boltXylan', 'nut', 2, pipeOD(d.tubeNps) / 2 + 0.06, [xb - 0.1, y, 0], 'x', 0.012, 0.12, [0.02], 0)
    const Lt = d.ft.hubLength + d.ft.raisedFaceHeight
    k.pipe('pipePaint', [xb + 0.02, y, 0], [d.xT + Lt, y, 0], pipeOD(d.tubeNps), pipeWall(d.tubeNps, '80'), 24)
    flange(k, d.tubeNps, p.rating, [d.xT, y, 0], [-1, 0, 0], true)
    k.disc('pipeBore', pipeOD(d.tubeNps) / 2 - pipeWall(d.tubeNps, '80'), [xb + 0.01, y, 0], '-x', 24)
  }
  // return-bend housing: flanged bonnet enclosing the U-bend, bolted to both leg flanges
  const hb = d.hb
  const xr = x1 + 0.0045
  const tp = fs.thickness * 1.2
  const W = fs.od + 0.04
  const H = d.gap + fs.od + 0.04
  const ym = (y1 + y2) / 2
  k.rbox(P, [tp, H, W], 0.04, [xr + tp / 2, ym, 0])
  const bonL = Math.max(0.3, Rs * 2.2)
  k.rbox(P, [bonL, 2 * hb - 0.1, sh + 0.06], (sh + 0.06) / 2 - 0.001, [xr + tp + bonL / 2 - 0.05, ym, 0], undefined, 4)
  for (const y of [y1, y2]) {
    gasket(k, p.shellNps, p.rating, [x1 + 0.00225, y, 0], 'x')
    const studL = fs.thickness + fs.raisedFaceHeight + tp + 0.0045 + fs.boltDia * 2.6
    k.boltCircle('boltXylan', 'nut', fs.bolts, fs.boltCircle / 2, [x1 - fs.thickness - fs.raisedFaceHeight - fs.boltDia * 1.3, y, 0], 'x', fs.boltDia, studL, [fs.boltDia * 0.75, studL - fs.boltDia * 0.75])
  }
  k.cyl(P, 0.04, 0.12, [xr + tp + bonL - 0.05, ym + hb - 0.15, 0], 'x', 12) // lifting eye boss
  openNozzle(k, { base: [xr + tp + bonL * 0.5, ym - hb + 0.05, 0], dir: [0, -1, 0], nps: 1, rating: p.rating, standout: 0.15, mat: P, blind: true })
  // shell nozzles near the closure end: inlet on the upper leg top, outlet on the lower leg bottom
  openNozzle(k, { base: [d.xs, y2 + d.Rh, 0], dir: [0, 1, 0], nps: p.shellNps, rating: p.rating, standout: d.so, mat: P, shellR: d.Rh })
  openNozzle(k, { base: [d.xs, y1 - d.Rh, 0], dir: [0, -1, 0], nps: p.shellNps, rating: p.rating, standout: d.so, mat: P, shellR: d.Rh })
  // vent and drain at the return end
  openNozzle(k, { base: [x1 - 0.5, y2 + Rs, 0], dir: [0, 1, 0], nps: 1, rating: p.rating, standout: 0.15, mat: P, blind: true })
  // clamp supports: two stands with U-bolts around both legs
  const pw = Math.max(0.3, sh + 0.12)
  for (const x of [x0 + Math.max(0.9, d.L * 0.2) + Rs, x1 - Math.max(0.6, d.L * 0.15)]) {
    for (const s of [-1, 1]) member(k, [x, 0.025, s * (pw / 2)], [x, y2 + Rs + 0.06, s * (pw / 2)], 'UPN 100', 'galvanised', [0, 0, s])
    basePlate(k, x, 0, pw + 0.18, 'galvanised')
    for (const y of [y1, y2]) {
      k.box('galvanised', [0.1, 0.012, pw + 0.06], [x, y - Rs - 0.006, 0])
      k.torus('galvanised', Rs + 0.008, 0.008, [x, y, 0], 'x', 6, 28, Math.PI)
      for (const s of [-1, 1]) k.hex('nut', 0.03, 0.016, [x, y - Rs + 0.002, s * (Rs + 0.008)])
    }
    k.box('galvanised', [0.1, 0.012, pw + 0.06], [x, y2 + Rs + 0.06, 0])
  }
  tagPlate(k, p.tag, [d.L * 0.1, ym, 0.04], 'z', 0.2)
  k.box(P, [0.24, d.gap - 2 * Rs - 0.02, 0.06], [d.L * 0.1, ym, 0])
}
