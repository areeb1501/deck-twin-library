// Substation strain gantry pair: lattice columns and girders, earth-wire peaks, cap-and-pin strain strings and stranded conductors with sag. IEC 61936-1, IEC 60383.
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { member, tagPlate } from '../lib/parts'
import { conductor, discString, hv } from './_hv'
import { clamp, earthBond, latticeColumn, plinth } from './_onshore'

export interface BusbarGantryProps {
  /** bays across X */
  bays?: number
  /** rated voltage, kV */
  kv?: number
  /** distance between the two gantries, m */
  span?: number
  tag?: string
}

export const defaults = { bays: 2, kv: 145, span: 24, tag: '' }

export function BusbarGantry(props: BusbarGantryProps & GroupProps) {
  const { bays, kv, span, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, bays, kv, span, tag), [bays, kv, span, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default BusbarGantry

/** Box lattice girder along X from x0 to x1 at top y, depth h, width w. */
function girder(k: Kit, x0: number, x1: number, y: number, z: number, h: number, w: number) {
  const chords: [number, number][] = [[y, -w / 2], [y, w / 2], [y - h, -w / 2], [y - h, w / 2]]
  for (const [cy, cz] of chords) member(k, [x0, cy, z + cz], [x1, cy, z + cz], 'L80x80x8', 'galvanised', [0, Math.sign(cy - (y - h / 2)) || 1, 0])
  const n = Math.max(2, Math.round((x1 - x0) / h))
  const dx = (x1 - x0) / n
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * dx
    for (const cz of [-w / 2, w / 2]) member(k, [x, y, z + cz], [x, y - h, z + cz], 'L50x50x5', 'galvanised')
    for (const cy of [y, y - h]) member(k, [x, cy, z - w / 2], [x, cy, z + w / 2], 'L50x50x5', 'galvanised')
    if (i < n) {
      const f = i % 2 === 0
      for (const cz of [-w / 2, w / 2]) member(k, [x, f ? y : y - h, z + cz], [x + dx, f ? y - h : y, z + cz], 'L50x50x5', 'galvanised')
      for (const cy of [y, y - h]) member(k, [x, cy, z + (f ? -w / 2 : w / 2)], [x + dx, cy, z + (f ? w / 2 : -w / 2)], 'L50x50x5', 'galvanised')
    }
  }
}

function build(k: Kit, baysIn: number, kv: number, spanIn: number, tag: string) {
  const d = hv(kv)
  const n = clamp(Math.round(baysIn), 1, 6)
  const B = 3 * d.phase + 2.5
  const H = 5 + 3.5 * d.ins
  const span = clamp(spanIn, 8, 80)
  const cw = clamp(0.5 + d.ins * 0.15, 0.6, 1.2)
  const gh = clamp(0.8 + d.ins * 0.15, 0.9, 1.6)
  const xs = Array.from({ length: n + 1 }, (_, i) => -((n * B) / 2) + i * B)
  const discs = d.kv >= 362 ? 24 : d.kv >= 200 ? 16 : d.kv >= 100 ? 10 : 6
  const strLen = discs * 0.146 + 0.8
  for (const zs of [-1, 1]) {
    const z = (zs * span) / 2
    for (const x of xs) {
      plinth(k, x, z, cw + 0.8, cw + 0.8, 0.3)
      latticeColumn(k, x, z, 0.3, H, cw, cw > 0.8 ? 'L120x120x10' : 'L100x100x10', 'L50x50x5')
      // earth-wire peak and climbing guard
      member(k, [x, H, z], [x, H + 2.2, z], 'CHS 114.3x6.3', 'galvanised')
      k.cyl('galvanised', 0.03, 0.15, [x, H + 2.25, z], 'y', 8)
      for (let y = 2.3; y < 3.2; y += 0.15) k.box('galvanised', [cw + 0.4, 0.01, 0.01], [x, y, z + (zs * (cw + 0.2)) / 2])
      earthBond(k, [x - cw / 2, 0.6, z + cw / 2], [0, 0, 1], 0, 0.6)
    }
    girder(k, xs[0] - cw / 2, xs[n] + cw / 2, H, z, gh, cw * 0.9)
    // shield wires between the peaks
    if (zs > 0) for (const x of xs) conductor(k, [x, H + 2.25, -span / 2], [x, H + 2.25, span / 2], span * 0.02, 0.006)
  }
  // strain strings and conductors per phase of each bay
  for (let b = 0; b < n; b++) {
    const xc = (xs[b] + xs[b + 1]) / 2
    for (let j = -1; j <= 1; j++) {
      const x = xc + j * d.phase
      const ends: V3[] = []
      for (const zs of [-1, 1]) {
        const a: V3 = [x, H - gh, (zs * span) / 2 - zs * 0.05]
        const dz = -zs * strLen * 0.985
        ends.push(discString(k, a, [x, H - gh - strLen * 0.17, a[2] + dz]))
      }
      const sag = span * 0.03
      conductor(k, ends[0], ends[1], sag, d.kv >= 362 ? 0.016 : 0.018, d.kv >= 362 ? 0.4 : 0)
    }
  }
  if (tag) tagPlate(k, tag, [xs[0], 2.0, span / 2 + cw / 2 + 0.01], 'z', 0.3)
}
