// Outdoor instrument transformer on a tubular support: oil-filled head-type CT, inductive VT or capacitor voltage transformer (CVT). IEC 61869-2 / -3 / -5.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { alu, gradingRing, hv, pad, tubeColumn } from './_hv'
import { insulator, porcelain, silicone } from './_onshore'

export interface InstrumentTransformerProps {
  kind?: 'ct' | 'vt' | 'cvt'
  /** rated voltage, kV */
  kv?: number
  insulation?: 'porcelain' | 'composite'
  tag?: string
}

export const defaults = { kind: 'ct' as 'ct' | 'vt' | 'cvt', kv: 145, insulation: 'porcelain' as 'porcelain' | 'composite', tag: '' }

export function InstrumentTransformer(props: InstrumentTransformerProps & GroupProps) {
  const { kind, kv, insulation, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, kind, kv, insulation, tag), [kind, kv, insulation, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default InstrumentTransformer

function build(k: Kit, kind: string, kv: number, insulation: string, tag: string) {
  const d = hv(kv)
  const ins: MatKey = insulation === 'composite' ? silicone() : porcelain()
  const tank = paint('#9ba3a0', { metalness: 0.35, roughness: 0.45, clearcoat: 0.25 })
  const y0 = tubeColumn(k, 0, 0, d.sup, 0.323)
  // base: secondary terminal box on all types; tank size by type
  let y = y0
  if (kind === 'ct') {
    k.rbox(tank, [0.55, 0.45, 0.55], 0.03, [0, y + 0.225, 0])
    y += 0.45
  } else if (kind === 'vt') {
    k.cyl(tank, 0.36, 0.75, [0, y + 0.375, 0], 'y', 36)
    for (let i = 0; i < 6; i++) k.cyl(tank, 0.37, 0.02, [0, y + 0.1 + i * 0.11, 0], 'y', 36)
    y += 0.75
  } else {
    k.rbox(tank, [0.75, 0.8, 0.65], 0.04, [0, y + 0.4, 0])
    k.cyl('glass', 0.04, 0.02, [0, y + 0.55, 0.33], 'z', 16)
    y += 0.8
  }
  k.rbox(cabinetGrey(), [0.32, 0.28, 0.16], 0.02, [0, y0 + 0.2, 0.3 + (kind === 'cvt' ? 0.06 : kind === 'vt' ? 0.1 : 0.0)])
  k.tube('cable', [[0, y0 + 0.06, 0.32], [0, y0 - 0.4, 0.22], [0, 0.6, 0.2], [0.1, 0.02, 0.5]], 0.014)
  k.cyl('brass', 0.03, 0.03, [0.2, y0 + 0.05, 0.25], 'y', 10)
  if (tag) tagPlate(k, tag, [0, y0 + 0.2, 0.39 + (kind === 'cvt' ? 0.06 : kind === 'vt' ? 0.1 : 0.0)], 'z', 0.14)
  if (kind === 'ct') {
    // tall insulator to the oil-filled head with primary terminals P1 / P2 and an oil-level bellows
    const H = d.ins * 1.15
    insulator(k, [0, y, 0], H, d.r * 1.5, ins)
    const yh = y + H + 0.38
    const rh = 0.32 + 0.0008 * d.kv
    k.cyl(tank, rh, 0.7, [0, yh, 0], 'z', 40)
    for (const s of [-1, 1]) {
      k.dome(tank, rh, [0, yh, s * 0.35], s > 0 ? 'z' : '-z', Math.PI / 2, 0.45)
      pad(k, [0, yh, s * (0.35 + rh * 0.45)], [0, 0, s], 1.3)
    }
    k.cyl(tank, rh * 0.55, 0.35, [0, yh - rh - 0.0, 0], 'y', 28, rh * 0.8)
    k.cyl('stainless', 0.13, 0.22, [0, yh + rh + 0.08, 0], 'y', 24)
    k.cyl('glass', 0.05, 0.12, [0, yh + rh + 0.08, 0.125], 'z', 14)
    k.dome('stainless', 0.13, [0, yh + rh + 0.19, 0], 'y', Math.PI / 2, 0.4)
    if (d.ring) gradingRing(k, [0, y + H - 0.1, 0], d.r * 3.8, 'y', 0.035)
  } else if (kind === 'vt') {
    const H = d.ins * 1.15
    insulator(k, [0, y, 0], H, d.r * 1.4, ins)
    const yt = y + H
    k.cyl(tank, d.r * 2.2, 0.3, [0, yt + 0.15, 0], 'y', 28)
    k.cyl('stainless', d.r * 1.6, 0.12, [0, yt + 0.36, 0], 'y', 24)
    pad(k, [0, yt + 0.48, 0], [0, 1, 0], 1.2)
    if (d.ring) gradingRing(k, [0, yt - 0.05, 0], d.r * 3.6, 'y', 0.035)
  } else {
    // stacked capacitor units on the electromagnetic unit
    const n = d.kv >= 362 ? 3 : d.kv >= 200 ? 2 : 1
    const hu = (d.ins * 1.25) / n
    let yy = y
    for (let i = 0; i < n; i++) {
      insulator(k, [0, yy, 0], hu, d.r * 1.6, ins)
      yy += hu
      k.cyl(alu(), d.r * 2.0, 0.05, [0, yy + 0.025, 0], 'y', 28)
      yy += 0.05
    }
    k.cyl(alu(), d.r * 1.9, 0.2, [0, yy + 0.1, 0], 'y', 28)
    pad(k, [0, yy + 0.2, 0], [0, 1, 0], 1.3)
    if (d.ring) gradingRing(k, [0, yy - 0.1, 0], d.r * 4, 'y', 0.04)
  }
}

const cabinetGrey = () => paint('#b9bdb8', { metalness: 0.4, roughness: 0.45, clearcoat: 0.2 })
