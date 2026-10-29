// Printed-circuit (diffusion-bonded) heat exchanger: stacked etched-plate core blocks, welded half-pipe headers with flanged nozzles, support frame. ASME VIII-1 (Div. 1 / 2), ASME B16.5.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { liftingLug, member, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { nozzleStandout, pipeOD, type Rating } from '../lib/standards'
import { basePlate } from './_lattice'
import { clamp, openNozzle } from './_thermal'

export interface PrintedCircuitHeatExchangerProps {
  /** core blocks welded side by side */
  blocks?: number
  /** block length along the hot-side flow, m */
  length?: number
  /** block width, m */
  width?: number
  /** block height (plate stack), m */
  height?: number
  hotNps?: number
  coldNps?: number
  rating?: Rating
  /** block underside above deck, m */
  elevation?: number
  tag?: string
}

export const defaults = {
  blocks: 2,
  length: 1.6,
  width: 0.6,
  height: 0.6,
  hotNps: 6,
  coldNps: 4,
  rating: 900 as Rating,
  elevation: 0.6,
  tag: 'E-500',
}

type P = typeof defaults

function dims(p: P) {
  const nb = Math.max(1, Math.round(p.blocks))
  const L = p.length
  const W = nb * p.width
  const H = p.height
  const y0 = p.elevation
  const yc = y0 + H / 2
  const rh = clamp(pipeOD(p.hotNps) * 0.75, 0.08, H / 2 - 0.02) // end header half-pipe
  const rc = clamp(pipeOD(p.coldNps) * 0.75, 0.06, H / 2 - 0.02) // side header half-pipe
  const soH = nozzleStandout(p.hotNps, p.rating)
  const soC = nozzleStandout(p.coldNps, p.rating)
  const xc = L / 2 - rc - 0.08 // side header centres, near the block ends
  return { nb, L, W, H, y0, yc, rh, rc, soH, soC, xc }
}

export function ports(props: PrintedCircuitHeatExchangerProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  return [
    port('hot-in', 'Hot side inlet', [-d.L / 2 - d.rh - d.soH, d.yc, 0], [-1, 0, 0], p.hotNps, p.rating),
    port('hot-out', 'Hot side outlet', [d.L / 2 + d.rh + d.soH, d.yc, 0], [1, 0, 0], p.hotNps, p.rating),
    port('cold-in', 'Cold side inlet', [d.xc, d.yc, d.W / 2 + d.rc + d.soC], [0, 0, 1], p.coldNps, p.rating),
    port('cold-out', 'Cold side outlet', [-d.xc, d.yc, d.W / 2 + d.rc + d.soC], [0, 0, 1], p.coldNps, p.rating),
  ]
}

export function PrintedCircuitHeatExchanger(props: PrintedCircuitHeatExchangerProps & GroupProps) {
  const { blocks, length, width, height, hotNps, coldNps, rating, elevation, tag, ...group } = { ...defaults, ...props }
  const p = { blocks, length, width, height, hotNps, coldNps, rating, elevation, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PrintedCircuitHeatExchanger

// Half-pipe header welded to a block face: axis along +Y, bulging towards phi range, closed by half-disc end plates.
function halfPipe(k: Kit, mat: MatKey, c: V3, r: number, h: number, phi0: number) {
  const y0 = -h / 2
  const y1 = h / 2
  const t = 0.012
  k.lathe(mat, [[r, y0], [r, y1]], c, 'y', 32, phi0, Math.PI)
  k.lathe(mat, [[0, y0 - t], [r, y0 - t], [r, y0]], c, 'y', 32, phi0, Math.PI)
  k.lathe(mat, [[r, y1], [r, y1 + t], [0, y1 + t]], c, 'y', 32, phi0, Math.PI)
}

function build(k: Kit, p: P) {
  const d = dims(p)
  const { L, W, H, y0, yc, rh, rc } = d
  const steel: MatKey = 'stainless'
  // core blocks: bonded plate stack (fine bond lines), side plates and weld seams between blocks
  for (let i = 0; i < d.nb; i++) {
    const z = -W / 2 + (i + 0.5) * p.width
    k.box(steel, [L, H, p.width - 0.004], [0, yc, z])
    for (let y = y0 + 0.03; y < y0 + H - 0.02; y += 0.03) k.box('flangeSteel', [L + 0.002, 0.0015, p.width - 0.002], [0, y, z])
    if (i > 0) k.box('machined', [L, H, 0.008], [0, yc, -W / 2 + i * p.width])
  }
  for (const y of [y0 - 0.015, y0 + H + 0.015]) k.box(steel, [L + 0.02, 0.03, W + 0.02], [0, y, 0])
  // hot-side end headers spanning the block faces, cold-side headers on the +Z face near the ends
  const hh = H - 0.06
  for (const s of [-1, 1]) {
    for (let i = 0; i < d.nb; i++) {
      const z = -W / 2 + (i + 0.5) * p.width
      halfPipe(k, steel, [s * (L / 2), yc, z], rh, hh, s < 0 ? Math.PI : 0)
    }
    // end manifold joining the block headers, carrying the hot nozzle
    if (d.nb > 1) k.cyl(steel, rh * 0.7, W - p.width, [s * (L / 2 + rh * 0.55), yc, 0], 'z', 24)
    openNozzle(k, { base: [s * (L / 2 + rh), yc, 0], dir: [s, 0, 0], nps: p.hotNps, rating: p.rating, standout: d.soH, mat: steel, shellR: rh })
    halfPipe(k, steel, [s * d.xc, yc, W / 2], rc, hh, -Math.PI / 2)
    openNozzle(k, { base: [s * d.xc, yc, W / 2 + rc], dir: [0, 0, 1], nps: p.coldNps, rating: p.rating, standout: d.soC, mat: steel, shellR: rc })
  }
  // maintenance (cleaning) nozzles, blinded, on the -Z face headers
  for (const s of [-1, 1]) {
    halfPipe(k, steel, [s * d.xc, yc, -W / 2], rc * 0.7, hh * 0.6, Math.PI / 2)
    openNozzle(k, { base: [s * d.xc, yc, -W / 2 - rc * 0.7], dir: [0, 0, -1], nps: 2, rating: p.rating, standout: 0.18, mat: steel, blind: true })
  }
  // support frame: two cross beams on legs with base plates
  for (const x of [-L * 0.3, L * 0.3]) {
    member(k, [x, y0 - 0.03 - 0.06, -W / 2 - 0.1], [x, y0 - 0.03 - 0.06, W / 2 + 0.1], 'HEB 120', 'galvanised', [0, 1, 0])
    for (const s of [-1, 1]) {
      member(k, [x, 0.02, s * (W / 2 + 0.04)], [x, y0 - 0.15, s * (W / 2 + 0.04)], 'HEB 120', 'galvanised', [0, 0, 1])
      basePlate(k, x, s * (W / 2 + 0.04), 0.26, 'galvanised')
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sx * (L / 2 - 0.15), y0 + H + 0.03, sz * (W / 2 - 0.1)], 'x', 0.8, steel)
  tagPlate(k, p.tag, [0, yc, -W / 2 - 0.001], [0, 0, -1], 0.25)
}
